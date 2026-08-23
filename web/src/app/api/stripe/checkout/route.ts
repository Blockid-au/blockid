import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { getStripe, isStripeConfigured, STRIPE_PRICE_MAP } from "@/lib/stripe";
import { getPlan, isGrowthEarlyBird, type LegacyPlan } from "@/lib/plans";
import { isFoundingPromoActive } from "@/lib/founding-promo";
import { getSupabaseAdmin } from "@/lib/supabase";
import { normaliseResellerCode } from "@/lib/reseller/attribution";
import { viaClientReferenceId } from "@/lib/reseller/attribution-server";
import { resolvePromoCode } from "@/lib/reseller/resolve-promo";
import { hashUserId } from "@/lib/reseller/hash";
import { buildCheckoutSuccessUrl } from "@/lib/stripe/checkout-success-url";
import { sessionIdempotencyKey } from "@/lib/stripe/idempotency";
import { logUserAction, extractIp, extractUserAgent } from "@/lib/audit/log";

// POST /api/stripe/checkout
// Body: { plan, couponCode? }
// Creates a Stripe Checkout Session and returns the URL.
//
// Upgrade v2: recurring plans with trial_days > 0 (from DB plans matrix) start
// a 7/14/30-day CC-required trial. Payment method is always collected up-front,
// and the subscription is cancelled if no PM is on file when the trial ends.

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, reason: "Authentication required" },
      { status: 401 },
    );
  }

  if (!isStripeConfigured()) {
    return NextResponse.json(
      { ok: false, reason: "Payments not configured" },
      { status: 503 },
    );
  }

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, reason: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const {
    plan: planId,
    couponCode,
    resellerCode: bodyResellerCode,
    promoCode: bodyPromoCode,
    origin: bodyOrigin,
    projectId: bodyProjectId,
  } =
    (body as {
      plan?: string;
      couponCode?: string;
      resellerCode?: string;
      // Sub-K4: optional reseller promotion code the founder typed on the
      // pricing page (e.g. "IFV20", "DVL10"). Resolved via
      // @/lib/reseller/resolve-promo and 400s if unknown/expired. When
      // provided, wins over the blockid_via cookie so an explicit user
      // action beats a stale attribution.
      promoCode?: string;
      // Iteration-6 task #2: the onboarding wizard passes `origin:"onboarding"`
      // so the success_url can steer the Stripe-hosted return back to Step 6
      // ("Create your first startup"). Standalone callers (upgrade, add-on,
      // billing, founding-50, landing pricing) omit this field and keep the
      // marketing thank-you landing.
      origin?: string;
      // Startup Package one-off checkout — the founder buys the package for a
      // specific project so the webhook can stamp package_purchased_at + seed
      // the dataroom against that project. Ignored by every other planId.
      projectId?: string;
    }) ?? {};

  // Post-cutover fast-fail — refuse Founding 100 checkouts once the A$5 promo
  // window closes (2026-09-01 UTC). Placed here (before the reseller /
  // resolvePromoCode DB lookup) so post-cutover requests don't burn a
  // Supabase query on a doomed checkout.
  if (planId === "founding50" && !isFoundingPromoActive()) {
    return NextResponse.json(
      {
        ok: false,
        reason:
          "The Founding 100 A$5 promo ended on 2026-08-31. Please select the Growth plan (A$99/mo).",
      },
      { status: 410 },
    );
  }

  // Reseller attribution — priority: body param (from onboarding wizard state)
  // → cookie blockid_via. Per docs/plans/reseller-module-plan.md § C.2 / U.6.
  //
  // Sub-K4: `promoCode` (explicit founder-typed reseller promo) is resolved
  // FIRST via resolvePromoCode() so we can 400 on an unknown/expired code
  // before touching Stripe. When a promoCode resolves it also pre-populates
  // the resellerAttribution object so the inline lookup further down is a
  // no-op — same downstream flow (discounts, metadata stamping, audit log).
  const cookieStore = await cookies();
  const rawResellerCode =
    bodyPromoCode ?? bodyResellerCode ?? cookieStore.get("blockid_via")?.value ?? null;
  const resellerCode = normaliseResellerCode(rawResellerCode);

  let promoRowId: string | null = null;
  let promoExplicitlyRequested = false;
  if (typeof bodyPromoCode === "string" && bodyPromoCode.trim().length > 0) {
    promoExplicitlyRequested = true;
    const resolved = await resolvePromoCode(bodyPromoCode);
    if (!resolved) {
      return NextResponse.json(
        { ok: false, reason: "Unknown or expired promotion code" },
        { status: 400 },
      );
    }
    promoRowId = resolved.promoRowId;
  }

  if (!planId || typeof planId !== "string") {
    return NextResponse.json(
      { ok: false, reason: "Plan ID is required" },
      { status: 400 },
    );
  }

  // Plan + Stripe price resolver.
  //
  // Order of resolution:
  //   1. Startup Package — synthesise a fixed LegacyPlan shape (not in DB or
  //      LEGACY_PLANS as a recurring plan; env var STRIPE_PRICE_STARTUP_PACKAGE
  //      provides the price).
  //   2. plans-db (v2 SKUs from plans.csv → plans table). Wins for all
  //      founder_*, investor_*, accelerator_* SKUs; uses the row's
  //      stripe_price_id directly (env-backed via plans-db.fromGenerated).
  //   3. LEGACY_PLANS + STRIPE_PRICE_MAP (grandfathers founding50, growth,
  //      growth_annual — kept alive for renewals).
  //
  // If a plan resolves but its Stripe price ID cannot be found (env var
  // missing / plans table not seeded), we return 503 `plan_not_provisioned`
  // — NOT a 400 — so the CFO ops runbook can distinguish "bad user input"
  // from "we forgot to mint the Stripe price".
  const IS_STARTUP_PACKAGE = planId === "founder_package";

  let plan: LegacyPlan | null = null;
  let priceId: string | null | undefined;
  let trialDays = 0;
  let dbPlanSegment: string | null = null;

  if (IS_STARTUP_PACKAGE) {
    plan = {
      id: "founder_package",
      name: "Startup Package",
      price: 14900,
      cadence: "once",
      features: ["startup_package", "pdf_branding"],
    };
    priceId = STRIPE_PRICE_MAP[planId];
  } else {
    try {
      const { getPlanCached } = await import("@/lib/plans-db");
      const dbPlan = await getPlanCached(planId);
      if (dbPlan) {
        const cadence: LegacyPlan["cadence"] =
          dbPlan.interval === "yearly"
            ? "yearly"
            : dbPlan.interval === "monthly"
              ? "monthly"
              : dbPlan.interval === "once"
                ? "once"
                : "free";
        const cents =
          dbPlan.interval === "yearly"
            ? (dbPlan.annual_price_aud_cents || dbPlan.price_aud_cents)
            : dbPlan.price_aud_cents;
        plan = {
          id: dbPlan.id,
          name: dbPlan.name,
          price: cents,
          cadence,
          features: dbPlan.feature_flags,
        };
        priceId = dbPlan.stripe_price_id ?? STRIPE_PRICE_MAP[planId];
        trialDays = Number(dbPlan.trial_days ?? 0) || 0;
        dbPlanSegment = typeof dbPlan.segment === "string" ? dbPlan.segment : null;
      }
    } catch {
      // plans-db not available yet (W1 rollout in progress) — legacy behaviour.
    }
    if (!plan) {
      const legacy = getPlan(planId);
      if (legacy) {
        plan = legacy;
        priceId = STRIPE_PRICE_MAP[planId];
      }
    }
  }

  if (!plan || plan.cadence === "free") {
    return NextResponse.json(
      { ok: false, reason: "Invalid or free plan" },
      { status: 400 },
    );
  }

  // After the Growth early-bird deadline, switch to the standard $499/mo price.
  if (planId === "growth" && !isGrowthEarlyBird()) {
    priceId = process.env.STRIPE_PRICE_GROWTH_499 ?? priceId;
  }

  if (!priceId) {
    return NextResponse.json(
      {
        ok: false,
        error: "plan_not_provisioned",
        planId,
        hint: `set STRIPE_PRICE_${planId.toUpperCase()} env var and seed plans table`,
      },
      { status: 503 },
    );
  }

  // Resolve the user's segment (for customer metadata + attribution).
  let userSegment: string | null = null;
  try {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      const { data } = await supabase
        .from("app_users")
        .select("segment")
        .eq("id", user.id)
        .maybeSingle();
      if (data && typeof data.segment === "string") {
        userSegment = data.segment;
      }
    }
  } catch {
    // segment column may not exist on older schemas — non-fatal.
  }

  const stripe = getStripe()!;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://blockid.au";

  const isRecurring = plan.cadence === "monthly" || plan.cadence === "yearly";

  // Per CISO D3-CISO-07: hash raw user UUIDs before writing to Stripe metadata
  // so a metadata dump can't be joined against app_users directly. During the
  // backward-compat transition we ALSO keep the raw `user_id` field so
  // in-flight webhooks (which look up app_users.id from metadata) keep
  // working; a follow-up ticket drops the raw column once the webhook is
  // migrated to hash-lookup or customer_email fallback.
  // r-04-exempt: transition window — raw kept alongside hash for webhook back-compat (D3-CISO-07 phase 1)
  const customerMetadata: Record<string, string> = {
    user_id: user.id,
    user_id_hash: hashUserId(user.id),
    plan_id: planId,
  };
  if (userSegment) customerMetadata.segment = userSegment;
  else if (dbPlanSegment) customerMetadata.segment = dbPlanSegment;

  // Reseller attribution — resolve code to Stripe promotion_code + reseller_id.
  // Priority list per § D.3: promotion_code → sub.metadata → customer.metadata
  // → client_reference_id. We stamp ALL of them so downstream idempotency
  // never depends on which surface a future event fires against. Per § C.2:
  // tier > 0 also applies discounts:[{promotion_code}] and drops
  // allow_promotion_codes so the reseller code cannot be stacked on top of a
  // user-typed one.
  let resellerAttribution: {
    reseller_id: string;
    code: string;
    display_name: string;
    tier_pct: number;
    stripe_promotion_code_id: string | null;
  } | null = null;
  let resellerLookupAttempted = false;
  if (resellerCode) {
    resellerLookupAttempted = true;
    try {
      const supabase = getSupabaseAdmin();
      if (supabase) {
        const { data: promo } = await supabase
          .from("reseller_promotion_codes")
          .select("id, tier_pct, code, stripe_promotion_code_id, active, reseller_id")
          .eq("code", resellerCode)
          .eq("active", true)
          .maybeSingle();
        if (promo) {
          const { data: reseller } = await supabase
            .from("resellers")
            .select("id, status, display_name")
            .eq("id", promo.reseller_id)
            .maybeSingle();
          if (reseller && reseller.status === "active") {
            resellerAttribution = {
              reseller_id: promo.reseller_id as string,
              code: promo.code as string,
              display_name: (reseller.display_name as string) ?? (promo.code as string),
              tier_pct: promo.tier_pct as number,
              stripe_promotion_code_id: (promo.stripe_promotion_code_id as string | null) ?? null,
            };
            customerMetadata.reseller_code = promo.code as string;
            // r-04-exempt: transition window — raw kept alongside hash for webhook back-compat (D3-CISO-07 phase 1)
            customerMetadata.reseller_id = promo.reseller_id as string;
            customerMetadata.reseller_id_hash = hashUserId(promo.reseller_id as string);
            customerMetadata.reseller_display_name = resellerAttribution.display_name;
            customerMetadata.tier_at_signup = String(promo.tier_pct);
          }
        }
      }
    } catch {
      // Attribution is opportunistic — never block checkout on a lookup miss.
    }
  }

  // Observability: when a caller supplied a normalised reseller code but we
  // could not resolve it (typo, inactive promo, terminated reseller), emit a
  // best-effort audit row so the CFO can spot broken links in analytics.
  if (resellerLookupAttempted && resellerCode && !resellerAttribution) {
    try {
      await logUserAction({
        userId: user.id,
        action: "reseller.code.miss",
        subjectType: "reseller_code",
        subjectId: null,
        fields: { reseller_code: resellerCode },
        route: "/api/stripe/checkout",
        ip: extractIp(request.headers),
        ua: extractUserAgent(request.headers),
      });
    } catch {
      // Never block checkout on an audit-log failure.
    }
  }

  // Build the reseller metadata block ONCE so session.metadata and
  // subscription_data.metadata can never drift.
  // r-04-exempt: transition window — raw kept alongside hash for webhook back-compat (D3-CISO-07 phase 1)
  function buildSessionResellerMetadata(
    a: NonNullable<typeof resellerAttribution>,
  ): Record<string, string> {
    return {
      reseller_code: a.code,
      reseller_id: a.reseller_id,
      reseller_id_hash: hashUserId(a.reseller_id),
      reseller_display_name: a.display_name,
      tier_at_signup: String(a.tier_pct),
    };
  }

  const sessionParams: Parameters<typeof stripe.checkout.sessions.create>[0] = {
    mode: isRecurring ? "subscription" : "payment",
    customer_email: user.email,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: buildCheckoutSuccessUrl(siteUrl, planId, bodyOrigin),
    cancel_url: `${siteUrl}/pricing`,
    // ATO tax-invoice compliance:
    //   - `automatic_tax` lets Stripe Tax compute AU GST from the seller
    //     origin + buyer country/state. For subscriptions Stripe auto-applies
    //     this to every generated invoice.
    //   - `tax_id_collection` surfaces the ABN/GST field on Checkout so B2B
    //     buyers can supply their ABN (reverse-charge for AU business
    //     customers, or Australian-address enforcement).
    //   - `billing_address_collection: "required"` — needed both for GST
    //     jurisdiction determination and for a compliant tax invoice.
    automatic_tax: { enabled: true },
    tax_id_collection: { enabled: true },
    billing_address_collection: "required",
    // r-04-exempt: transition window — raw kept alongside hash for webhook back-compat (D3-CISO-07 phase 1)
    metadata: {
      blockid_user_id: user.id,
      blockid_user_hash: hashUserId(user.id),
      blockid_plan: planId,
      ...(userSegment ? { blockid_segment: userSegment } : {}),
      // Startup Package — carry the project_id + a stable `plan` field the
      // webhook branches on. Kept sanitised (only when the caller supplied
      // a UUID-shaped string) so we never write arbitrary text into Stripe.
      ...(IS_STARTUP_PACKAGE
        ? {
            plan: "founder_package",
            ...(bodyProjectId && typeof bodyProjectId === "string"
              ? { project_id: bodyProjectId }
              : {}),
          }
        : {}),
    },
    allow_promotion_codes: true,
  };

  // v2: force PM collection so the trial has a card on file. This applies to
  // both trial subscriptions and immediate-charge subscriptions.
  if (isRecurring) {
    sessionParams.payment_method_collection = "always";
  }

  // Trial configuration — only for recurring plans with trial_days > 0.
  // Legacy plans (Founding-50 one-off, Enterprise custom, or DB plans with
  // trial_days=0) skip this block and charge immediately.
  //
  // The `description` lands on the generated subscription invoices and the
  // Stripe dashboard so support + finance can see which SKU without opening
  // the metadata drawer. The reseller path below (when applicable) overrides
  // this with "Introduced by …".
  const subscriptionDescription = `BlockID.au — ${plan.name}`;
  if (isRecurring && trialDays > 0) {
    sessionParams.subscription_data = {
      trial_period_days: trialDays,
      trial_settings: {
        end_behavior: { missing_payment_method: "cancel" },
      },
      metadata: customerMetadata,
      description: subscriptionDescription,
    };
  } else if (isRecurring) {
    sessionParams.subscription_data = {
      metadata: customerMetadata,
      description: subscriptionDescription,
    };
  }

  // One-off checkouts: enable invoice creation with ATO-compliant tax-invoice
  // fields (seller ABN as a custom_field + GST-registered footer). Reseller
  // attribution (below) appends its "Reseller" custom_field onto this same
  // payload — Stripe caps custom_fields at 4 entries.
  if (!isRecurring) {
    sessionParams.invoice_creation = {
      enabled: true,
      invoice_data: {
        description: `BlockID.au — ${plan.name}`,
        custom_fields: [{ name: "Seller ABN", value: "79 659 615 111" }],
        footer: "Auschain Pty Ltd · ACN 659 615 111 · GST-registered",
      },
    };
  }

  // Stash customer metadata on the Stripe Customer itself when possible so
  // downstream webhook handlers (which see customer, not always session) can
  // read user_id/plan_id/segment.
  sessionParams.customer_creation = isRecurring ? undefined : "if_required";

  // Apply a Stripe coupon if provided.
  if (couponCode && typeof couponCode === "string") {
    sessionParams.discounts = [{ coupon: couponCode }];
    // When discounts are applied, disable general promotion codes.
    delete sessionParams.allow_promotion_codes;
  }

  // Reseller attribution stamping — per § C.2 / D.3. Always stamp
  // client_reference_id + subscription.metadata + customer.metadata. Apply
  // Stripe promotion_code only when tier > 0 (Stripe forbids 0-value
  // coupons; tier 0 is attribution-only). Reseller code beats user-typed
  // coupon when both are present.
  if (resellerAttribution) {
    sessionParams.client_reference_id = viaClientReferenceId(resellerAttribution.code);
    if (resellerAttribution.stripe_promotion_code_id && resellerAttribution.tier_pct > 0) {
      sessionParams.discounts = [
        { promotion_code: resellerAttribution.stripe_promotion_code_id },
      ];
      delete sessionParams.allow_promotion_codes;
    }
    // Stamp session-level metadata AND (when recurring) subscription_data
    // metadata from the same helper so the two surfaces can never drift.
    // Regression-guarded: reseller_id + reseller_code MUST land on the Stripe
    // session whenever a reseller code resolves. See § D.3.
    // r-04-exempt: transition window — raw kept alongside hash for webhook back-compat (D3-CISO-07 phase 1)
    const resellerMetadata = buildSessionResellerMetadata(resellerAttribution);
    sessionParams.metadata = {
      ...(sessionParams.metadata ?? {}),
      ...resellerMetadata,
    };
    if (isRecurring && sessionParams.subscription_data) {
      sessionParams.subscription_data.metadata = {
        ...(sessionParams.subscription_data.metadata ?? {}),
        ...resellerMetadata,
      };
    }

    // Co-branding: surface the reseller name on the Stripe invoice PDF.
    // Stripe caps custom_fields at 4 entries; name ≤ 30 chars, value ≤ 30
    // chars — truncate defensively.
    //   - one-off (mode=payment): invoice_creation.invoice_data.custom_fields
    //     applies directly to the generated invoice.
    //   - subscription: Stripe does not accept invoice.custom_fields at
    //     session create time. The webhook handler stamps custom_fields onto
    //     each generated invoice via Subscription.invoice_settings when
    //     checkout.session.completed fires (deferred to P3.x webhook wiring).
    //     Here we stash the display_name in subscription_data.description so
    //     it appears on the Stripe dashboard for the reseller-attributed sub.
    const displayNameShort = resellerAttribution.display_name.slice(0, 30);
    if (isRecurring && sessionParams.subscription_data) {
      sessionParams.subscription_data.description = `Introduced by ${displayNameShort}`;
    } else if (!isRecurring) {
      // Append the Reseller custom_field to the base invoice_creation
      // payload (seller ABN + description + footer already set above).
      // Stripe caps custom_fields at 4, so slice defensively.
      const baseInvoice = sessionParams.invoice_creation;
      const existingFields = baseInvoice?.invoice_data?.custom_fields ?? [];
      sessionParams.invoice_creation = {
        enabled: true,
        invoice_data: {
          ...(baseInvoice?.invoice_data ?? {}),
          custom_fields: [
            ...existingFields,
            { name: "Reseller", value: displayNameShort },
          ].slice(0, 4),
        },
      };
    }
  }

  try {
    const session = await stripe.checkout.sessions.create(sessionParams, {
      idempotencyKey: IS_STARTUP_PACKAGE
        ? sessionIdempotencyKey("startup-package", [
            user.id,
            "founder_package",
            priceId,
          ])
        : sessionIdempotencyKey("checkout", [
            user.id,
            planId,
            priceId,
            resellerAttribution?.code ?? null,
            couponCode ?? null,
          ]),
    });

    // SOC2-lite audit: record the successful checkout session creation.
    // Non-PII only — plan id, cadence, trial days, and whether a reseller code
    // was attributed. Never logs email, coupon, or Stripe session URL. Never
    // throws.
    await logUserAction({
      userId: user.id,
      action: "stripe.checkout.create",
      subjectType: "stripe_session",
      subjectId: null,
      fields: {
        plan_id: planId,
        cadence: plan.cadence,
        trial_days: trialDays,
        reseller_attributed: Boolean(resellerAttribution),
      },
      route: "/api/stripe/checkout",
      ip: extractIp(request.headers),
      ua: extractUserAgent(request.headers),
    });

    // Sub-K4 tail work — only when the founder explicitly typed a promoCode:
    //   1. Write a reseller_attributions row so the payout ledger sees the
    //      user-level attribution at PAYMENT_SUCCEEDED time. Project-level
    //      attribution is left to the webhook path (has projectId context).
    //   2. Bump redemption_count so the admin console can show usage. This
    //      is a select-then-update; concurrency is bounded by Stripe
    //      checkout latency and the counter is analytics-only, so a rare
    //      double-count is acceptable (documented follow-up: add an RPC for
    //      atomic increment in a subsequent migration).
    let appliedDiscount: { pct: number; code: string; resellerSlug: string } | null = null;
    if (promoExplicitlyRequested && resellerAttribution && promoRowId) {
      appliedDiscount = {
        pct: resellerAttribution.tier_pct,
        code: resellerAttribution.code,
        resellerSlug: resellerAttribution.code,
      };
      try {
        const supabase = getSupabaseAdmin();
        if (supabase) {
          await supabase
            .from("reseller_attributions")
            .insert({
              reseller_id: resellerAttribution.reseller_id,
              subject_type: "user",
              subject_user_id: user.id,
              status: "active",
              source: "code",
              promotion_code_id: promoRowId,
              metadata: { plan_id: planId, checkout_session_id: session.id },
            });
          const { data: current } = await supabase
            .from("reseller_promotion_codes")
            .select("redemption_count")
            .eq("id", promoRowId)
            .maybeSingle();
          if (current) {
            await supabase
              .from("reseller_promotion_codes")
              .update({ redemption_count: Number(current.redemption_count ?? 0) + 1 })
              .eq("id", promoRowId);
          }
        }
      } catch (attrErr) {
        // Never fail the checkout on attribution write — the webhook path
        // is a second chance to reconcile.
        console.warn("[blockid:stripe] promo attribution write failed", attrErr);
      }
    }

    return NextResponse.json({ ok: true, url: session.url, appliedDiscount });
  } catch (err) {
    console.error("[blockid:stripe] checkout session creation failed", err);
    return NextResponse.json(
      { ok: false, reason: "Failed to create checkout session" },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";
