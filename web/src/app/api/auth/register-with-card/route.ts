// POST /api/auth/register-with-card — card-required signup endpoint.
//
// Enforces the 2026-07-24 "every new signup gets a 7-day trial with card
// upfront" model (see `web/src/lib/plans/trial-copy.ts`). T0269 (G12 S1)
// opened the same mechanism to evaluators — investors, accelerators /
// incubators, advisors / consulting firms, service providers — on the
// Scout / Firm / Program rungs (`investor_angel` / `investor_advisor` /
// `investor_vc_small`). Allow-lists, account types and the account_type →
// segment mapping live in `@/lib/plans/signup-plans` (shared with /signup).
//
// Body: {
//   email, password, display_name?, account_type?,
//   plan_id, payment_method_id, terms_accepted
// }
//
// Success path:
//   1. Validate body + rate-limit by IP.
//   2. Look up plan → resolve Stripe price id from `plans` table.
//   3. Confirm email is not already registered.
//   4. Bcrypt-hash password (cost = 12, matches /api/auth/register).
//   5. Create Stripe Customer + attach PaymentMethod as default.
//   6. Create Subscription in trial mode with
//      `trial_settings.end_behavior.missing_payment_method = 'cancel'`;
//      `trial_period_days` = the plan row's `trial_days` (fallback 7).
//   7. INSERT app_users row + stamp trial_started_at / trial_end_at +
//      `segment` derived from account_type (so segment-filtered digests fire).
//   8. Log the user in (setSessionCookie).
//   9. Fire welcome email (best-effort — non-fatal).
//
// Compensating rollback: any Stripe failure after the app_users insert
// deletes the row so a retry starts clean.
//
// The legacy /api/auth/register endpoint remains for admin-provisioned
// users (see /api/admin/affiliate/provision) — do NOT wire this route
// into any admin flow.

import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/security/request-guards";
import { z } from "zod";
import bcrypt from "bcryptjs";
import {
  createSessionRow,
  isValidEmail,
  normaliseEmail,
  setSessionCookie,
  ADMIN_EMAIL,
} from "@/lib/auth";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { getPlanCached } from "@/lib/plans-db";
import { checkRateLimit } from "@/lib/rate-limit";
import { hashIp, clientIpFromHeaders } from "@/lib/iphash";
import { formatAud } from "@/lib/plans/trial-copy";
import {
  SIGNUP_ACCOUNT_TYPES,
  SIGNUP_ALLOWED_PLAN_IDS,
  isSelfServePlan,
  resolveTrialDays,
  segmentForAccountType,
} from "@/lib/plans/signup-plans";
import { initializeCredits } from "@/lib/credits";
import { sendPaymentConfirmation } from "@/lib/email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BCRYPT_ROUNDS = 12;
const BODY_MAX_BYTES = 16 * 1024;

// Superset of legacy new-signup tiers + founder_* + evaluator SKUs — see
// `SIGNUP_ALLOWED_PLAN_IDS` (`@/lib/plans/signup-plans`), which /signup shares.
// founder_scale (Pro, A$299) retired 2026-09-08 — its Stripe price is archived
// and plans.csv marks it active=false, so accepting it here would register a
// card against a subscription that can never be charged.
const ALLOWED_PLAN_IDS = SIGNUP_ALLOWED_PLAN_IDS;

// The zod enum must stay in lock-step with `SIGNUP_ACCOUNT_TYPES`,
// `ACCOUNT_TYPE_VALUES` (segments.ts) and the `app_users_account_type_check`
// CHECK (migration 0310). Pinned by `./signup-rules.test.ts`.
const ACCOUNT_TYPE_ENUM = z.enum(SIGNUP_ACCOUNT_TYPES);

const BodySchema = z.object({
  email: z.string().trim().min(3).max(320),
  password: z.string().min(8).max(200),
  display_name: z.string().trim().max(100).optional(),
  account_type: ACCOUNT_TYPE_ENUM.optional().default("founder"),
  plan_id: z.string().min(1).max(64),
  // Stripe PaymentMethod ids are `pm_` + alphanumerics — anything else never
  // reaches the Stripe API (S8-C).
  payment_method_id: z.string().regex(/^pm_[A-Za-z0-9]{1,125}$/),
  terms_accepted: z.literal(true),
  // Task M2 — optional reseller/promo code carried through from the signup
  // form. Validated + normalised server-side; a bad code is silently
  // dropped so signup itself never fails on attribution.
  promo_code: z.string().trim().max(32).optional(),
});

function sanitizeName(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  return raw.replace(/<[^>]*>/g, "").trim().slice(0, 100) || undefined;
}

export async function POST(request: Request) {
  const ip = clientIpFromHeaders(request.headers) ?? "unknown";
  const rl = checkRateLimit(`register-with-card:${ip}`, 5, 15 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.resetIn / 1000)) } },
    );
  }

  const read = await readJsonBody(request, BODY_MAX_BYTES);
  if (!read.ok) {
    if (read.status === 413) return read.response;
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  const raw: unknown = read.body;

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path?.[0];
    if (field === "payment_method_id") {
      return NextResponse.json({ ok: false, error: "payment_method_required" }, { status: 400 });
    }
    if (field === "terms_accepted") {
      return NextResponse.json({ ok: false, error: "terms_required" }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: "invalid_body", field }, { status: 400 });
  }

  const body = parsed.data;

  if (!isValidEmail(body.email)) {
    return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });
  }
  if (!ALLOWED_PLAN_IDS.has(body.plan_id)) {
    return NextResponse.json({ ok: false, error: "unsupported_plan" }, { status: 400 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "supabase_unavailable" }, { status: 503 });
  }
  const supabase = getSupabaseAdmin()!;

  const email = normaliseEmail(body.email);

  // Uniqueness check — 409 mirrors /api/auth/register response.
  const { data: existing } = await supabase
    .from("app_users")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ ok: false, error: "email_taken" }, { status: 409 });
  }

  // Resolve plan + Stripe price id BEFORE we touch Stripe or the DB so
  // config errors surface as a clean 500 with actionable text.
  const plan = await getPlanCached(body.plan_id);
  if (!plan) {
    return NextResponse.json({ ok: false, error: "unknown_plan" }, { status: 400 });
  }
  // Negotiated / unpriced tiers (interval = custom, e.g. founder_enterprise)
  // are never self-serve — review 2026-09-10 #17.
  if (!isSelfServePlan(plan)) {
    return NextResponse.json(
      { ok: false, error: "plan_not_self_serve", plan_id: plan.id },
      { status: 400 },
    );
  }
  const stripePriceId = plan.stripe_price_id;
  if (!stripePriceId) {
    return NextResponse.json(
      { ok: false, error: "plan_not_provisioned", plan_id: plan.id },
      { status: 500 },
    );
  }

  if (!isStripeConfigured()) {
    return NextResponse.json({ ok: false, error: "stripe_unavailable" }, { status: 503 });
  }
  const stripe = getStripe()!;

  const displayName = sanitizeName(body.display_name);
  const passwordHash = await bcrypt.hash(body.password, BCRYPT_ROUNDS);
  const role: "user" | "admin" = email === ADMIN_EMAIL ? "admin" : "user";
  const nowIso = new Date().toISOString();
  // Trial length comes from the plan row (plans.csv `trial_days` → plans
  // table), not a constant — accelerator rows carry 14, everything else 7.
  const trialDays = resolveTrialDays(plan);
  const trialEndIso = new Date(
    Date.now() + trialDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  // Audience bucket for segment-filtered jobs (investor-weekly-digest etc.).
  const segment = segmentForAccountType(body.account_type, plan.id);

  // 1. Insert the app_users row FIRST so we always have a rollback anchor
  //    if Stripe fails mid-flow. Stripe customer id is filled in after
  //    the customer is created — the column is nullable.
  const { data: created, error: insertErr } = await supabase
    .from("app_users")
    .insert({
      email,
      password_hash: passwordHash,
      display_name: displayName ?? null,
      role,
      account_type: body.account_type,
      segment,
      plan: plan.id,
      trial_started_at: nowIso,
      trial_end_at: trialEndIso,
      last_login_at: nowIso,
    })
    .select("id")
    .single();

  if (insertErr || !created) {
    console.error("[register-with-card] app_users insert failed", insertErr);
    return NextResponse.json({ ok: false, error: "db_insert_failed" }, { status: 500 });
  }
  const userId = created.id as string;

  // Rollback helper — deletes the app_users row on any Stripe failure.
  const rollback = async (label: string, err: unknown) => {
    console.error(`[register-with-card] ${label}`, err);
    await supabase.from("app_users").delete().eq("id", userId).then(({ error }) => {
      if (error) console.error("[register-with-card] rollback delete failed", error);
    });
  };

  // 2. Create Stripe Customer + attach PaymentMethod as default.
  let customerId: string;
  try {
    const customer = await stripe.customers.create({
      email,
      name: displayName ?? undefined,
      metadata: { user_id: userId, plan_id: plan.id, source: "register-with-card" },
    });
    customerId = customer.id;
    await stripe.paymentMethods.attach(body.payment_method_id, {
      customer: customerId,
    });
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: body.payment_method_id },
    });
  } catch (err) {
    await rollback("stripe customer/paymentmethod failed", err);
    return NextResponse.json(
      { ok: false, error: "stripe_customer_failed" },
      { status: 502 },
    );
  }

  // 3. Persist stripe_customer_id early so downstream failures still leave
  //    a recoverable trail via the Stripe dashboard.
  await supabase
    .from("app_users")
    .update({ stripe_customer_id: customerId })
    .eq("id", userId);

  // 4. Create Subscription in trial mode with cancel-if-no-payment.
  let subscriptionId: string;
  try {
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: stripePriceId }],
      trial_period_days: trialDays,
      default_payment_method: body.payment_method_id,
      trial_settings: {
        end_behavior: { missing_payment_method: "cancel" },
      },
      metadata: { user_id: userId, plan_id: plan.id },
    });
    subscriptionId = subscription.id;
  } catch (err) {
    // Rollback: delete stripe customer + app_users row so a retry is clean.
    try {
      await stripe.customers.del(customerId);
    } catch (delErr) {
      console.error("[register-with-card] stripe customer delete failed", delErr);
    }
    await rollback("stripe subscription create failed", err);
    return NextResponse.json(
      { ok: false, error: "stripe_subscription_failed" },
      { status: 502 },
    );
  }

  // 5. Mirror the subscription id + trial timestamps into subscription_trial_state
  //    so the dashboard banner + cron read a consistent view.
  await supabase.from("subscription_trial_state").upsert(
    {
      user_id: userId,
      plan_id: plan.id,
      status: "trialing",
      stripe_subscription_id: subscriptionId,
      stripe_customer_id: customerId,
      trial_start: nowIso,
      trial_end: trialEndIso,
      cancel_at_period_end: false,
      payment_method_saved: true,
      updated_at: nowIso,
    },
    { onConflict: "user_id" },
  ).then(({ error }) => {
    if (error) console.error("[register-with-card] subscription_trial_state upsert failed", error);
  });

  // 6. Grant welcome credits (best-effort — mirrors magic-link flow).
  await initializeCredits(userId).catch((err) =>
    console.error("[register-with-card] initializeCredits failed", err),
  );

  // 6a. Reseller attribution — task M2. Priority list:
  //   1. explicit body.promo_code (form-typed)
  //   2. blockid_via cookie (?ref= capture — task M1)
  // The processAttribution() helper caches app_users.attribution_reseller_id
  // when the code resolves to an active reseller. Never throws.
  try {
    const cookieHeader = request.headers.get("cookie") ?? "";
    const { extractViaFromCookieHeader } = await import(
      "@/lib/reseller/attribution"
    );
    const { processAttribution } = await import(
      "@/lib/reseller/process-attribution"
    );
    const cookieCode = extractViaFromCookieHeader(cookieHeader);
    const resolvedCode = body.promo_code?.trim() || cookieCode;
    if (resolvedCode) {
      await processAttribution(userId, resolvedCode);
    }
  } catch (err) {
    console.error("[register-with-card] reseller attribution failed", err);
  }

  // 7. Log the user in.
  const sessionToken = await createSessionRow({
    userId,
    ipHash: hashIp(ip),
    userAgent: request.headers.get("user-agent"),
  });
  if (!sessionToken) {
    // Session row failed — leave the trial in place; user can log in
    // via /auth/login-password. Not fatal.
    console.error("[register-with-card] session row failed for", userId);
  } else {
    await setSessionCookie(sessionToken);
  }

  // 8. Send welcome / payment-confirmation email (best-effort).
  void sendPaymentConfirmation({ to: email, planName: plan.name }).catch((err) =>
    console.error("[register-with-card] welcome email failed", err),
  );

  return NextResponse.json({
    ok: true,
    user: {
      id: userId,
      email,
      displayName: displayName ?? null,
      plan: plan.id,
      role,
    },
    trial: {
      end_at: trialEndIso,
      started_at: nowIso,
      days: trialDays,
      subscription_id: subscriptionId,
      plan_name: plan.name,
      price_display: formatAud(plan.price_aud_cents),
      cancel_url: "/api/billing/cancel-trial",
    },
  });
}
