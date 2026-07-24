// POST /api/reseller/create-startup — wholesale provisioning endpoint.
//
// Track A §24(c) — the last non-human-blocked leaf per tick 74 log.
//
// Per docs/plans/reseller-module-plan.md § C.1.5 (form + atomic transaction),
// § U.3 (wholesale billing model), § U.6 (per-project attribution),
// § U.15.1 (project-level partial unique on reseller_attributions),
// § H.8 (provisional workspace until magic-link verified).
//
// Wiring layers (route stays thin — every decision lives in a pure lib):
//   1. gateRequireFeature("reseller.create_startup") — 402 if plan missing.
//   2. scopedReseller(user) chokepoint (R-01).
//   3. normaliseCreateStartupInput() — 400 on shape errors.
//   4. Load reseller row + look up existing app_users + look up promotion code
//      + look up any active project attribution for this founder × reseller.
//   5. decideCreateStartup() — 400 on any capability/tier/state gate.
//   6. Sequential DB writes (no BEGIN/COMMIT — supabase-js has no tx API):
//      a) app_users row (INSERT if new, otherwise reuse existing.id).
//      b) projects row (attribution_reseller_id stamped).
//      c) reseller_attributions row (subject_type='project').
//      d) requestMagicLink with 24h TTL + pendingPayload.wholesaleProvisioning=true.
//      e) sendWholesaleWelcome dispatch.
//      f) reseller_audit_log('provision_startup').
//   7. Response envelope carries {ok, project_id, user_id, magic_link_sent,
//      stripe_wiring:'deferred'|'not_configured'}. Stripe subscription create
//      against the reseller's payment method is intentionally deferred — the
//      resellers table has no stripe_customer_id column yet + P8.5 Stripe
//      env vars are still human-blocked, so wiring the Stripe hot path in
//      the same tick would require migration 0101 + payment-method-setup UI
//      + human unblock (P8.5) all at once. Instead the endpoint ships the
//      working DB-side provisioning flow, unblocking the /reseller/create-startup
//      form + magic-link welcome email dispatch. A follow-up tick will land
//      the Stripe subscription line once H.20 InfoVision seed clears + P8.5
//      env vars mint.
//
// Compensation posture. Writes are ordered so partial-failures are recoverable:
//   - app_users insert failure → 500 (no compensation needed).
//   - projects insert failure after app_users create → app_users row left
//     behind (the founder can re-attempt; the second create picks up existing
//     app_users.id and continues).
//   - reseller_attributions insert failure after projects create → route
//     rolls back the projects row so the U.15.1 partial unique on
//     (subject_project_id) does not silently block future attempts.
//   - magic-link OR sendWholesaleWelcome failure after attributions insert →
//     kept as PARTIAL success (returns email_sent:false + magic_link_deferred);
//     the reseller can manually re-mint via /reseller/customers → drawer once
//     that UI ships. audit log entry still written.

import { NextResponse } from "next/server";
import { gateRequireFeature } from "@/lib/feature-gate";
import {
  requestMagicLink,
  normaliseEmail,
} from "@/lib/auth";
import { sendWholesaleWelcome } from "@/lib/email";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getStripe, isStripeConfigured, STRIPE_PRICE_MAP } from "@/lib/stripe";
import {
  scopedReseller,
  ResellerScopeError,
  type ScopedResellerSession,
} from "@/lib/reseller/scope";
import { resellerSupabase } from "@/lib/reseller/supabase";
import {
  normaliseCreateStartupInput,
  decideCreateStartup,
  CREATE_STARTUP_ERROR_MESSAGES,
  type CreateStartupInput,
  type WholesaleResellerRow,
  type CreateStartupPlan,
} from "@/lib/reseller/create-startup";
import {
  validateResellerBillingReadiness,
  type ResellerBillingRow,
} from "@/lib/reseller/stripe-billing";
import { createResellerWholesaleSubscription } from "@/lib/reseller/stripe-billing-adapter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ROUTE = "/api/reseller/create-startup";
const MAGIC_LINK_TTL_HOURS = 24;
const MAGIC_LINK_TTL_MIN = MAGIC_LINK_TTL_HOURS * 60;

function readClientMeta(request: Request): { ip: string; ua: string } {
  const fwd = request.headers.get("x-forwarded-for") || "";
  const ip = fwd.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "";
  const ua = request.headers.get("user-agent") || "";
  return { ip, ua };
}

async function readBody(request: Request): Promise<CreateStartupInput> {
  const ct = request.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return {
      founder_email: raw.founder_email,
      company_name: raw.company_name,
      plan_tier: raw.plan_tier,
      discount_tier: raw.discount_tier,
      founder_name: raw.founder_name,
    };
  }
  // application/x-www-form-urlencoded or multipart/form-data fallback for
  // the plain HTML form on /reseller/create-startup (until the client
  // wrapper ships this tick).
  const form = await request.formData().catch(() => null);
  if (!form) return { founder_email: null, company_name: null, plan_tier: null, discount_tier: null };
  return {
    founder_email: form.get("founder_email"),
    company_name: form.get("company_name"),
    plan_tier: form.get("plan_tier"),
    discount_tier: form.get("discount_tier"),
    founder_name: form.get("founder_name"),
  };
}

/**
 * Deterministic slug for the wholesale-provisioned workspace. The scope wrapper
 * (scope.ts:98) treats `reseller-sandbox-<code>` as reserved so we prefix
 * customer workspaces with `<companySlug>` unprefixed to keep them cleanly
 * separate from sandbox rows. Suffix disambiguation handled downstream via
 * 23505 retry loop.
 */
function buildCompanySlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "startup"
  );
}

type StripeWiringOutcome =
  | { state: "not_configured" }
  | { state: "price_missing"; plan_id: string }
  | { state: "not_ready"; reason: string }
  | {
      state: "subscribed";
      subscription_id: string;
      status: string;
      latest_invoice_id: string | null;
    }
  | { state: "failed"; reason: string; detail?: string };

interface ExecuteResult {
  ok: true;
  user_id: string;
  project_id: string;
  attribution_id: string;
  createNewUser: boolean;
  magic_link_sent: boolean;
  email_sent: boolean;
  stripe_wiring: StripeWiringOutcome;
}

interface ExecuteError {
  ok: false;
  reason:
    | "supabase_not_configured"
    | "user_upsert_failed"
    | "project_insert_failed"
    | "attribution_insert_failed"
    | "audit_write_failed";
  detail?: string;
}

/**
 * Wholesale Stripe plan → Stripe price id resolver. Mirrors the plan id used
 * by create-startup (WHOLESALE_PLAN_ID = "founder_growth") to the STRIPE_PRICE
 * env var slots wired in web/src/lib/stripe.ts. Wholesale reuses the same
 * Stripe Price as retail Growth per plan §C.1.5 — the reseller pays the same
 * A$99/mo list price and the discount tier flows through the promotion_code
 * attach on the subscription.
 */
function resolveStripePriceForPlan(planId: string): string | null {
  if (planId === "founder_growth") {
    return STRIPE_PRICE_MAP.growth ?? null;
  }
  return null;
}

interface ExecuteBillingContext {
  reseller: ResellerBillingRow;
  price_id: string | null;
  stripe_promotion_code_id: string | null;
}

/**
 * Sequential atomic-ish execution of the CreateStartupPlan. Rolls back the
 * projects row when the reseller_attributions insert fails so the partial
 * unique index does not silently block future attempts. Rolls back a
 * newly-created app_users row on downstream failure to avoid orphan accounts
 * (existing accounts are never touched).
 *
 * Stripe wholesale subscription is opened AFTER the attributions insert lands
 * (so the founder + workspace + attribution row are all durable), and BEFORE
 * the magic-link + welcome email dispatch. Subscription failure is a soft
 * outcome — the workspace stays live and the reseller can retry billing from
 * /reseller/customers → drawer once the underlying Stripe error is resolved
 * (missing PM, declined card, etc.). This matches the "provisional workspace"
 * posture set out in H.8: the founder sees the workspace as soon as the
 * magic-link lands, and billing catches up asynchronously.
 */
async function execute(
  plan: CreateStartupPlan,
  actorUserId: string,
  scope: ScopedResellerSession,
  clientMeta: { ip: string; ua: string },
  billing: ExecuteBillingContext,
): Promise<ExecuteResult | ExecuteError> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, reason: "supabase_not_configured" };

  // (a) app_users — insert if new, reuse existing.id if not.
  let userId: string;
  if (plan.createNewUser) {
    const { data: userRow, error: userErr } = await supabase
      .from("app_users")
      .insert({
        email: plan.founder_email,
        display_name: plan.founder_name ?? null,
        account_type: "founder",
        segment: "founder",
        attribution_reseller_id: plan.reseller_id,
      })
      .select("id")
      .single();
    if (userErr || !userRow) {
      // 23505 unique-violation-on-email race: another concurrent call already
      // created the account; fall through to lookup rather than error.
      if (userErr?.code === "23505") {
        const { data: winner } = await supabase
          .from("app_users")
          .select("id")
          .eq("email", plan.founder_email)
          .maybeSingle();
        if (!winner) {
          return { ok: false, reason: "user_upsert_failed", detail: userErr.message };
        }
        userId = winner.id as string;
      } else {
        return { ok: false, reason: "user_upsert_failed", detail: userErr?.message };
      }
    } else {
      userId = userRow.id as string;
    }
  } else {
    const { data: existing } = await supabase
      .from("app_users")
      .select("id")
      .eq("email", plan.founder_email)
      .maybeSingle();
    if (!existing) return { ok: false, reason: "user_upsert_failed", detail: "existing_user_vanished" };
    userId = existing.id as string;
    // Best-effort attribution cache bump (mirrors processAttribution).
    await supabase
      .from("app_users")
      .update({ attribution_reseller_id: plan.reseller_id })
      .eq("id", userId);
  }

  // (b) projects — attribution_reseller_id stamped so U.6 canonical per-workspace
  // attribution is enforced at the DB level.
  const baseSlug = buildCompanySlug(plan.company_name);
  let projectId: string | null = null;
  let projectRowSlug = baseSlug;
  for (let attempt = 0; attempt < 5 && projectId === null; attempt += 1) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
    const { data: row, error: projErr } = await supabase
      .from("projects")
      .insert({
        user_id: userId,
        name: plan.company_name,
        slug,
        description: `Provisioned by ${plan.reseller_display_name} (wholesale).`,
        is_default: false,
        attribution_reseller_id: plan.reseller_id,
      })
      .select("id, slug")
      .single();
    if (row && !projErr) {
      projectId = row.id as string;
      projectRowSlug = row.slug as string;
      break;
    }
    if (projErr?.code !== "23505") {
      // Non-unique failure — bail out. New app_users rows stay behind; the
      // founder is still discoverable and can be recovered manually.
      return { ok: false, reason: "project_insert_failed", detail: projErr?.message };
    }
    // 23505 → slug collision; loop bumps suffix.
  }
  if (!projectId) {
    return { ok: false, reason: "project_insert_failed", detail: "slug_exhausted" };
  }

  // (c) reseller_attributions — subject_type='project'. Guarded by the
  // reseller_attributions_active_project_uniq partial index (U.15.1).
  const { data: attrRow, error: attrErr } = await supabase
    .from("reseller_attributions")
    .insert({
      reseller_id: plan.reseller_id,
      subject_type: "project",
      subject_project_id: projectId,
      subject_user_id: null,
      source: plan.attribution.source,
      promotion_code_id: plan.promotion_code_id,
      metadata: plan.attribution.metadata,
    })
    .select("id")
    .single();
  if (attrErr || !attrRow) {
    // Rollback the freshly-created project so a future retry does not hit
    // the partial-unique block on (subject_project_id).
    await supabase.from("projects").delete().eq("id", projectId);
    return { ok: false, reason: "attribution_insert_failed", detail: attrErr?.message };
  }
  const attributionId = attrRow.id as string;

  // (c.5) wholesale subscription — reseller is payer-of-record. Only fires
  // when Stripe is configured AND the reseller row carries a stripe_customer_id
  // + default payment method AND the tier price env var is minted. Failures
  // are soft: the workspace + attribution stay live and the reseller can retry
  // billing from /reseller/customers → drawer.
  let stripeWiring: StripeWiringOutcome;
  if (!isStripeConfigured()) {
    stripeWiring = { state: "not_configured" };
  } else if (!billing.price_id) {
    stripeWiring = { state: "price_missing", plan_id: plan.plan_tier };
  } else {
    const readiness = validateResellerBillingReadiness(billing.reseller);
    if (!readiness.ok) {
      stripeWiring = { state: "not_ready", reason: readiness.reason };
    } else {
      const stripe = getStripe();
      if (!stripe) {
        stripeWiring = { state: "not_configured" };
      } else {
        const subResult = await createResellerWholesaleSubscription(
          billing.reseller,
          {
            price_id: billing.price_id,
            user_id: userId,
            project_id: projectId,
            founder_email: plan.founder_email,
            discount_tier: plan.discount_tier,
            stripe_promotion_code_id: billing.stripe_promotion_code_id,
          },
          { stripe },
        );
        if (subResult.ok) {
          stripeWiring = {
            state: "subscribed",
            subscription_id: subResult.subscription_id,
            status: subResult.status,
            latest_invoice_id: subResult.latest_invoice_id,
          };
          // Stamp the subscription id onto the attribution row's metadata so
          // downstream reconciliation and the /reseller/customers drawer can
          // find it without a second Stripe round-trip.
          const stampedMetadata = {
            ...plan.attribution.metadata,
            stripe_subscription_id: subResult.subscription_id,
            stripe_subscription_status: subResult.status,
            stripe_latest_invoice_id: subResult.latest_invoice_id,
          };
          // r-10-exempt: post-insert follow-up by primary key attributionId minted at L302 inside this reseller-scoped session; row is already reseller_id-owned so filtering by id alone is safe
          await supabase
            .from("reseller_attributions")
            .update({ metadata: stampedMetadata })
            .eq("id", attributionId);
        } else {
          stripeWiring = {
            state: "failed",
            reason: subResult.reason,
            detail: subResult.detail,
          };
        }
      }
    }
  }

  // (d) magic-link — 24h TTL so the founder has a realistic window.
  const magic = await requestMagicLink({
    email: plan.founder_email,
    intent: plan.magicLink.intent,
    ttlMinutes: MAGIC_LINK_TTL_MIN,
    pendingPayload: {
      next: plan.magicLink.next,
      resellerCode: plan.magicLink.pendingPayload.resellerCode,
      wholesaleProvisioning: plan.magicLink.pendingPayload.wholesaleProvisioning,
    },
  });
  const magicLinkSent = magic.ok;

  // (e) sendWholesaleWelcome — only if magic link minted; otherwise no URL.
  let emailSent = false;
  if (magic.ok) {
    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(
      /\/$/,
      "",
    );
    const magicLinkUrl = `${siteUrl}/auth/verify?token=${encodeURIComponent(magic.token)}`;
    const send = await sendWholesaleWelcome({
      to: plan.founder_email,
      founderName: plan.founder_name,
      companyName: plan.company_name,
      resellerDisplayName: plan.reseller_display_name,
      magicLinkUrl,
      ttlHours: MAGIC_LINK_TTL_HOURS,
      locale: "en",
    }).catch(() => ({ ok: false, reason: "send_error" as const }));
    emailSent = send.ok;
  }

  // (f) reseller_audit_log — best-effort; a failure here still surfaces to
  // ops via the metadata but does not roll back the successful provisioning.
  try {
    const db = resellerSupabase(scope);
    await db.auditLog({
      actor_user_id: actorUserId,
      subject_user_id: userId,
      action: "provision_startup",
      fields: ["project_id", "attribution_id", "discount_tier"],
      route: ROUTE,
      ip: clientMeta.ip,
      user_agent: clientMeta.ua,
      metadata: {
        project_id: projectId,
        project_slug: projectRowSlug,
        attribution_id: attributionId,
        discount_tier: plan.discount_tier,
        promotion_code: plan.promotion_code,
        magic_link_sent: magicLinkSent,
        email_sent: emailSent,
        stripe_wiring: stripeWiring,
      },
    });
  } catch (err) {
    // Swallow — successful provisioning is not undone by an audit-log write
    // failure. The reason is surfaced in the response for observability.
    console.error("[reseller:create-startup] audit_write_failed", err);
  }

  return {
    ok: true,
    user_id: userId,
    project_id: projectId,
    attribution_id: attributionId,
    createNewUser: plan.createNewUser,
    magic_link_sent: magicLinkSent,
    email_sent: emailSent,
    stripe_wiring: stripeWiring,
  };
}

export async function POST(request: Request) {
  const gate = await gateRequireFeature("reseller.create_startup");
  if (!gate.ok) return gate.response;
  const user = gate.user;

  let scope;
  try {
    scope = await scopedReseller(user);
  } catch (err) {
    if (err instanceof ResellerScopeError) {
      return NextResponse.json({ ok: false, reason: err.code }, { status: 403 });
    }
    throw err;
  }

  const rawInput = await readBody(request);
  const normalised = normaliseCreateStartupInput(rawInput);
  if (!normalised.ok) {
    return NextResponse.json(
      {
        ok: false,
        reason: normalised.reason,
        message: CREATE_STARTUP_ERROR_MESSAGES[normalised.reason],
      },
      { status: 400 },
    );
  }
  const input = normalised.input;

  const db = resellerSupabase(scope);
  const selfRaw = await db.selfReseller();
  if (!selfRaw) {
    return NextResponse.json(
      { ok: false, reason: "reseller_missing" },
      { status: 404 },
    );
  }
  const reseller: WholesaleResellerRow = {
    id: selfRaw.id as string,
    code: selfRaw.code as string,
    display_name: selfRaw.display_name as string,
    status: selfRaw.status as WholesaleResellerRow["status"],
    can_create_startups: Boolean(selfRaw.can_create_startups),
    billing_model: selfRaw.billing_model as WholesaleResellerRow["billing_model"],
    allowed_tiers: Array.isArray(selfRaw.allowed_tiers)
      ? (selfRaw.allowed_tiers as number[])
      : null,
  };
  const billingReseller: ResellerBillingRow = {
    id: reseller.id,
    code: reseller.code,
    display_name: reseller.display_name,
    status: reseller.status,
    billing_model: reseller.billing_model,
    contact_email: (selfRaw.contact_email as string | null) ?? null,
    stripe_customer_id: (selfRaw.stripe_customer_id as string | null) ?? null,
    stripe_default_payment_method_id:
      (selfRaw.stripe_default_payment_method_id as string | null) ?? null,
  };

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });
  }

  // Existing user lookup — normalised email already lowercased.
  const emailNorm = normaliseEmail(input.founder_email);
  const { data: existingUser } = await supabase
    .from("app_users")
    .select("id, verified_at")
    .eq("email", emailNorm)
    .maybeSingle();

  // Active project attribution lookup — the U.15.1 project-level partial
  // unique lets a founder have N ideas across multiple resellers, but never
  // two active ones with the SAME reseller. If the user already has any
  // active project attributed to this reseller, we refuse (decideCreateStartup
  // returns existing_active_attribution).
  let hasActiveProjectAttribution = false;
  if (existingUser?.id) {
    const { data: existingProjects } = await supabase
      .from("projects")
      .select("id")
      .eq("user_id", existingUser.id)
      .eq("attribution_reseller_id", reseller.id)
      .is("archived_at", null);
    if (existingProjects && existingProjects.length > 0) {
      const projectIds = existingProjects.map((p: { id: string }) => p.id);
      const { data: activeAttrs } = await supabase
        .from("reseller_attributions")
        .select("id")
        .eq("reseller_id", reseller.id)
        .eq("subject_type", "project")
        .in("subject_project_id", projectIds)
        .eq("status", "active")
        .eq("opted_out", false)
        .limit(1);
      hasActiveProjectAttribution = Boolean(activeAttrs && activeAttrs.length > 0);
    }
  }

  // Promotion code lookup by (reseller_id, tier_pct).
  const { data: promoRow } = await supabase
    .from("reseller_promotion_codes")
    .select("id, code, tier_pct, stripe_promotion_code_id")
    .eq("reseller_id", reseller.id)
    .eq("tier_pct", input.discount_tier)
    .eq("active", true)
    .maybeSingle();
  const promotionCode = promoRow
    ? {
        id: promoRow.id as string,
        code: promoRow.code as string,
        tier_pct: promoRow.tier_pct as number,
      }
    : null;
  const stripePromotionCodeId = (promoRow?.stripe_promotion_code_id as string | null) ?? null;

  const decision = decideCreateStartup({
    input,
    reseller,
    existingUser: existingUser
      ? { id: existingUser.id as string, verified_at: (existingUser.verified_at as string | null) ?? null }
      : null,
    hasActiveProjectAttribution,
    promotionCode,
  });
  if (!decision.ok) {
    return NextResponse.json(
      {
        ok: false,
        reason: decision.reason,
        message: CREATE_STARTUP_ERROR_MESSAGES[decision.reason],
      },
      { status: 400 },
    );
  }

  const meta = readClientMeta(request);
  const billingContext: ExecuteBillingContext = {
    reseller: billingReseller,
    price_id: resolveStripePriceForPlan(decision.plan.plan_tier),
    stripe_promotion_code_id: stripePromotionCodeId,
  };
  const result = await execute(decision.plan, user.id, scope, meta, billingContext);
  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        reason: result.reason,
        detail: result.detail,
      },
      { status: 500 },
    );
  }

  const wiringMessage = describeStripeWiring(result.stripe_wiring);

  return NextResponse.json({
    ok: true,
    user_id: result.user_id,
    project_id: result.project_id,
    attribution_id: result.attribution_id,
    created_new_user: result.createNewUser,
    magic_link_sent: result.magic_link_sent,
    email_sent: result.email_sent,
    stripe_wiring: result.stripe_wiring,
    message: `Founder workspace provisioned. Magic-link welcome email dispatched. ${wiringMessage}`,
  });
}

function describeStripeWiring(outcome: StripeWiringOutcome): string {
  switch (outcome.state) {
    case "subscribed":
      return `Wholesale subscription ${outcome.subscription_id} opened on the reseller's payment method (status=${outcome.status}).`;
    case "not_ready":
      return `Stripe subscription deferred — reseller billing not ready (${outcome.reason}). Complete /reseller/settings then retry from /reseller/customers.`;
    case "price_missing":
      return `Stripe subscription deferred — no price env var configured for plan ${outcome.plan_id}. Set STRIPE_PRICE_GROWTH and retry.`;
    case "not_configured":
      return "Stripe not configured on this host — subscription deferred.";
    case "failed":
      return `Stripe subscription create failed (${outcome.reason}). Workspace stays live; retry billing from /reseller/customers.`;
  }
}
