// Review before pay — the ONE order model behind `/checkout/review` (G25-D).
//
// Founder rule 2026-09-21: a click on a plan, a price or "Start 7-day trial"
// NEVER lands on Stripe. It lands here, on a page the visitor reads, and only
// the explicit **Pay** / **Add card & start trial** button posts to a
// checkout route and follows the Stripe URL. Every buy surface builds its
// href with `checkoutReviewHref()`; the review page parses it back with
// `parseCheckoutReviewParams()` and resolves the catalogue facts with
// `resolveCheckoutOrder()`. `lib/billing/checkout-entry.guard.test.ts` pins
// that no other component posts to a checkout route.
//
// Pure and isomorphic (plans-v2, credit packs, the generated plans csv) —
// safe in "use client" modules and in RSC pages. No I/O, no env reads, no
// Stripe ids. Amounts are read off the catalogue, never typed here.

import { GENERATED_PLANS_BY_ID } from "@/config/pricing/plans.generated";
import { CREDIT_PACKS } from "@/lib/credit-packs";
import { calculateGst } from "@/lib/gst";
import { PLANS_V2, type Plan, type Segment } from "@/lib/plans-v2";
import { parseBillingInterval, withInterval, type BillingInterval } from "@/lib/plans/billing-interval";
import { evaluatorPlanLabel } from "@/lib/plans/signup-plans";
import { INDEX_API_DAILY_CALLS } from "@/lib/pricing/svi-api-tiers";
import { STARTUP_PACKAGE_INCLUDED, STARTUP_PACKAGE_PLAN_ID } from "@/lib/startup-package/price";

export const CHECKOUT_REVIEW_PATH = "/checkout/review";
export const CHECKOUT_REVIEW_VI_PATH = "/vi/checkout/review";

export type CheckoutLocale = "en" | "vi";

/**
 * Where the click came from — carried on `checkout_review_viewed` /
 * `checkout_started` so /admin/funnel can split review → pay by surface.
 * Unknown values collapse to `"other"` (never echoed raw into analytics).
 */
export const CHECKOUT_ENTRIES = [
  "pricing_card",
  "pricing_hero",
  "signup",
  "onboarding",
  "upgrade_modal",
  "billing",
  "billing_deeplink",
  "credits",
  "startup_package",
  "svi_api",
  "email",
  "gate",
  "other",
] as const;
export type CheckoutEntry = (typeof CHECKOUT_ENTRIES)[number];

export function normaliseCheckoutEntry(v: string | null | undefined): CheckoutEntry {
  return (CHECKOUT_ENTRIES as readonly string[]).includes(v ?? "") ? (v as CheckoutEntry) : "other";
}

/** One-off SKUs the review step can sell besides subscription plans and credit packs. */
export const CHECKOUT_SKUS = [STARTUP_PACKAGE_PLAN_ID, "svi_api_team"] as const;
export type CheckoutSku = (typeof CHECKOUT_SKUS)[number];

export function isCheckoutSku(v: string | null | undefined): v is CheckoutSku {
  return (CHECKOUT_SKUS as readonly string[]).includes(v ?? "");
}

// ---------------------------------------------------------------------------
// Request (what the URL carries)
// ---------------------------------------------------------------------------

export type CheckoutReviewRequest =
  | { kind: "plan"; planId: string; interval: BillingInterval; trial: boolean; entry: CheckoutEntry; origin?: "onboarding" }
  | { kind: "pack"; credits: number; entry: CheckoutEntry }
  | { kind: "sku"; sku: CheckoutSku; entry: CheckoutEntry; projectId?: string };

export interface CheckoutReviewHrefOptions {
  plan?: string;
  interval?: BillingInterval;
  /** Marks a trial CTA (`trial=1`); the plan row's `trial_days` decides whether one runs. */
  trial?: boolean;
  pack?: number;
  sku?: CheckoutSku;
  entry: CheckoutEntry;
  locale?: CheckoutLocale;
  /** Legacy onboarding wizard hand-off: the success URL steers back to the wizard. */
  origin?: "onboarding";
  /** Startup Package: the project the webhook stamps `package_purchased_at` on. */
  projectId?: string;
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

const PLAN_ID_RE = /^[a-z][a-z0-9_]{1,63}$/;
const PROJECT_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

/** Build the review-step URL every entry point links to. Exactly one of plan / pack / sku. */
export function checkoutReviewHref(o: CheckoutReviewHrefOptions): string {
  const base = o.locale === "vi" ? CHECKOUT_REVIEW_VI_PATH : CHECKOUT_REVIEW_PATH;
  const q = new URLSearchParams();
  if (o.plan) {
    q.set("plan", o.plan);
    if (o.trial) q.set("trial", "1");
    if (o.origin === "onboarding") q.set("origin", "onboarding");
  } else if (typeof o.pack === "number") {
    q.set("pack", String(o.pack));
  } else if (o.sku) {
    q.set("sku", o.sku);
    if (o.projectId) q.set("projectId", o.projectId);
  }
  q.set("entry", normaliseCheckoutEntry(o.entry));
  // `interval=annual` rides the same spelling every other billing URL uses.
  return withInterval(`${base}?${q.toString()}`, o.plan && o.interval === "annual" ? "annual" : "monthly");
}

/** The URL → request. `null` when the params name nothing sellable (→ 404). */
export function parseCheckoutReviewParams(sp: Record<string, string | string[] | undefined>): CheckoutReviewRequest | null {
  const entry = normaliseCheckoutEntry(first(sp.entry));
  const plan = first(sp.plan)?.trim();
  const pack = first(sp.pack)?.trim();
  const sku = first(sp.sku)?.trim();
  if (plan) {
    if (!PLAN_ID_RE.test(plan)) return null;
    const trialRaw = first(sp.trial);
    const originRaw = first(sp.origin);
    return {
      kind: "plan",
      planId: plan,
      interval: parseBillingInterval(first(sp.interval)),
      trial: trialRaw === "1" || trialRaw === "true",
      entry,
      ...(originRaw === "onboarding" ? { origin: "onboarding" as const } : {}),
    };
  }
  if (pack) {
    const n = Number(pack);
    if (!Number.isInteger(n) || n <= 0) return null;
    return { kind: "pack", credits: n, entry };
  }
  if (sku) {
    if (!isCheckoutSku(sku)) return null;
    const projectId = first(sp.projectId)?.trim();
    return { kind: "sku", sku, entry, ...(projectId && PROJECT_ID_RE.test(projectId) ? { projectId } : {}) };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Order (what the page shows and what the Pay button posts)
// ---------------------------------------------------------------------------

export type CheckoutSegment = "founder" | "evaluator" | "programs";

export interface CheckoutOrder {
  kind: "plan" | "pack" | "sku";
  /** plan id / `credits_<n>` / sku id — stable for analytics + tests. */
  id: string;
  /** Public name ("Starter", "Scout", "10 Credits", "Startup Package", "Index API"). */
  name: string;
  tagline: string | null;
  /** What is included — from the catalogue row, never typed on the page. */
  included: string[];
  /** GST-inclusive amount the Pay button books, in cents. */
  amountCents: number;
  /** The GST share of `amountCents` (1/11, ATO inclusive split). */
  gstCents: number;
  /** Billing cadence of the amount. */
  interval: "monthly" | "annual" | "once";
  /** > 0 → card-required free trial of that length; 0 → charged on the Pay click. */
  trialDays: number;
  /** Which sign-up ladder a signed-out visitor is sent to (plans only). */
  segment: CheckoutSegment | null;
  /** Annual was asked for but the rung has no annual price → billed monthly, and the page says so. */
  annualFallback: boolean;
  /** Custom-priced rung: no Pay button, a contact link instead. */
  contactOnly: boolean;
  /** The ONE checkout route the Pay button posts to, and its body. */
  postPath: "/api/stripe/checkout" | "/api/credits" | "/api/svi-api/checkout";
  postBody: Record<string, string | number>;
  entry: CheckoutEntry;
}

export interface ResolveCheckoutOrderOptions {
  /**
   * Plan ids with an annual Stripe Price (server-resolved via
   * `annualAvailablePlanIds()`). Omitted → trust `plan.annual_aud`.
   */
  annualAvailable?: readonly string[];
}

function segmentOf(plan: Plan): CheckoutSegment {
  const s: Segment = plan.segment;
  if (s === "founder") return "founder";
  if (s === "accelerator") return "programs";
  return "evaluator";
}

function gstOf(amountCents: number): number {
  return calculateGst(amountCents, true, "AU").gst_cents;
}

/** The catalogue facts for a request, or `null` when nothing sellable matches (→ 404). */
export function resolveCheckoutOrder(req: CheckoutReviewRequest, opts: ResolveCheckoutOrderOptions = {}): CheckoutOrder | null {
  if (req.kind === "pack") {
    const pack = CREDIT_PACKS.find((p) => p.credits === req.credits);
    if (!pack) return null;
    return {
      kind: "pack",
      id: `credits_${pack.credits}`,
      name: pack.label,
      tagline: pack.savings,
      included: [],
      amountCents: pack.priceAudCents,
      gstCents: gstOf(pack.priceAudCents),
      interval: "once",
      trialDays: 0,
      segment: null,
      annualFallback: false,
      contactOnly: false,
      postPath: "/api/credits",
      postBody: { amount: pack.credits },
      entry: req.entry,
    };
  }

  if (req.kind === "sku") {
    if (req.sku === STARTUP_PACKAGE_PLAN_ID) {
      const row = GENERATED_PLANS_BY_ID[STARTUP_PACKAGE_PLAN_ID];
      const plan = PLANS_V2.find((p) => p.id === STARTUP_PACKAGE_PLAN_ID);
      const cents = row?.price_aud_cents ?? 0;
      if (!cents) return null;
      return {
        kind: "sku",
        id: STARTUP_PACKAGE_PLAN_ID,
        name: plan?.name ?? row?.name ?? "Startup Package",
        tagline: plan?.tagline ?? null,
        included: plan?.features ?? [...STARTUP_PACKAGE_INCLUDED],
        amountCents: cents,
        gstCents: gstOf(cents),
        interval: "once",
        trialDays: 0,
        segment: "founder",
        annualFallback: false,
        contactOnly: false,
        postPath: "/api/stripe/checkout",
        postBody: { plan: STARTUP_PACKAGE_PLAN_ID, ...(req.projectId ? { projectId: req.projectId } : {}) },
        entry: req.entry,
      };
    }
    // svi_api_team → the Index API rung, booked through /api/svi-api/checkout
    // (its webhook branch flips the key tier; /api/stripe/checkout would not).
    const indexApi = PLANS_V2.find((p) => p.id === "index_api");
    const cents = Math.round((indexApi?.monthly_aud ?? 0) * 100);
    if (!indexApi || !cents) return null;
    return {
      kind: "sku",
      id: "svi_api_team",
      name: indexApi.name,
      tagline: `${INDEX_API_DAILY_CALLS.toLocaleString("en-AU")} calls/day`,
      included: indexApi.features,
      amountCents: cents,
      gstCents: gstOf(cents),
      interval: "monthly",
      trialDays: 0,
      segment: "evaluator",
      annualFallback: false,
      contactOnly: false,
      postPath: "/api/svi-api/checkout",
      postBody: { tier: "team" },
      entry: req.entry,
    };
  }

  const plan = PLANS_V2.find((p) => p.id === req.planId);
  if (!plan) return null;
  const custom = plan.monthly_aud === null || plan.cta_kind === "contact";
  const annualOffered =
    typeof plan.annual_aud === "number" &&
    plan.annual_aud > 0 &&
    (opts.annualAvailable === undefined || opts.annualAvailable.includes(plan.id));
  const effective: "monthly" | "annual" = req.interval === "annual" && annualOffered ? "annual" : "monthly";
  const amountAud = custom ? 0 : effective === "annual" ? (plan.annual_aud as number) : (plan.monthly_aud as number);
  if (!custom && (!Number.isFinite(amountAud) || amountAud <= 0)) return null; // free rungs are not an order
  const amountCents = Math.round(amountAud * 100);
  const trialDays = req.trial && plan.trial_days > 0 ? plan.trial_days : plan.trial_days > 0 ? plan.trial_days : 0;
  return {
    kind: "plan",
    id: plan.id,
    name: evaluatorPlanLabel(plan.id) ?? plan.name,
    tagline: plan.tagline ?? null,
    included: plan.features,
    amountCents,
    gstCents: gstOf(amountCents),
    interval: effective,
    trialDays,
    segment: segmentOf(plan),
    annualFallback: req.interval === "annual" && effective === "monthly",
    contactOnly: custom,
    postPath: "/api/stripe/checkout",
    postBody: {
      plan: plan.id,
      ...(effective === "annual" ? { interval: "annual" } : {}),
      ...(req.origin === "onboarding" ? { origin: "onboarding" } : {}),
    },
    entry: req.entry,
  };
}

// ---------------------------------------------------------------------------
// Where a signed-out visitor goes first (never Stripe)
// ---------------------------------------------------------------------------

/** The review URL for an order (what `next=` carries and what analytics reports). */
export function reviewUrlFor(order: CheckoutOrder, locale: CheckoutLocale = "en"): string {
  if (order.kind === "pack") return checkoutReviewHref({ pack: Number(order.postBody.amount), entry: order.entry, locale });
  if (order.kind === "sku") {
    const projectId = typeof order.postBody.projectId === "string" ? order.postBody.projectId : undefined;
    return checkoutReviewHref({ sku: order.id as CheckoutSku, entry: order.entry, locale, projectId });
  }
  return checkoutReviewHref({
    plan: order.id,
    interval: order.interval === "annual" ? "annual" : "monthly",
    trial: order.trialDays > 0,
    entry: order.entry,
    locale,
    origin: order.postBody.origin === "onboarding" ? "onboarding" : undefined,
  });
}

/**
 * A signed-out visitor's next stop. Plans → the card-required sign-up for
 * the plan's ladder (the card form sits under its own review block;
 * `next=` brings an existing account back here through "Sign in"). Packs
 * and SKUs need an account first → the login with `next=` back to this page.
 */
export function signedOutContinueHref(order: CheckoutOrder, locale: CheckoutLocale = "en"): string {
  const next = reviewUrlFor(order, locale);
  if (order.kind === "plan" && !order.contactOnly) {
    const q = new URLSearchParams();
    if (order.segment && order.segment !== "founder") q.set("segment", "evaluator");
    q.set("plan", order.id);
    q.set("trial", "1");
    q.set("next", next);
    return withInterval(`/signup?${q.toString()}`, order.interval === "annual" ? "annual" : "monthly");
  }
  return `/auth/login?next=${encodeURIComponent(next)}`;
}

/** Where "Back to pricing" goes for an order. */
export function backToPricingHref(order: CheckoutOrder, locale: CheckoutLocale = "en"): string {
  const base = locale === "vi" ? "/vi/pricing" : "/pricing";
  if (order.kind === "pack") return "/workspace/billing#credits";
  if (order.kind === "sku") return order.id === STARTUP_PACKAGE_PLAN_ID ? "/startup-package" : "/workspace/settings/enterprise";
  if (order.segment === "evaluator") return `${base}?segment=evaluator`;
  if (order.segment === "programs") return `${base}?segment=programs`;
  return base;
}
