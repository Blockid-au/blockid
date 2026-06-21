// Pricing A/B test — variant assignment + analytics + decision helper.
//
// Lightweight infrastructure: cookie-based variant pinning, deterministic
// hash bucketing for stickiness across sessions, exposure logging to
// `ab_pricing_events` Supabase table.
//
// MVP scope (T0206): Founding 100 price test only. Same harness scales to
// other surfaces if/when we run more tests.
//
// Schema (Supabase, create with migration):
//   CREATE TABLE ab_pricing_events (
//     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//     ts timestamptz NOT NULL DEFAULT now(),
//     experiment_id text NOT NULL,
//     variant_id text NOT NULL,
//     event_type text NOT NULL,  -- 'exposure' | 'checkout_started' | 'paid'
//     identity_hash text NOT NULL,
//     amount_cents integer,
//     stripe_session_id text
//   );
//   CREATE INDEX ab_pricing_events_exp_var ON ab_pricing_events (experiment_id, variant_id, ts);

import { cookies as nextCookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase";

export type ExperimentId = "founding_price_2026q3";
export type EventType = "exposure" | "checkout_started" | "paid";

export interface PricingVariant {
  id: string;                  // "control" | "a3" | "a5" | "a10"
  label: string;
  priceCents: number;
  priceAud: string;            // "A$3"
  weight: number;              // relative traffic share (0-1)
  description: string;         // one-liner shown on /admin/pricing-test
}

export interface Experiment {
  id: ExperimentId;
  label: string;
  surface: string;             // "founding-50 checkout"
  active: boolean;
  startedAt: string;
  endsAt?: string;
  variants: PricingVariant[];
  primaryMetric: "checkout_started" | "paid";
}

// ─── Experiment definitions ─────────────────────────────────────────────────

export const FOUNDING_PRICE_EXPERIMENT: Experiment = {
  id: "founding_price_2026q3",
  label: "Founding 100 price test — Q3 2026",
  surface: "/founding-50",
  active: true,
  startedAt: "2026-06-17",
  endsAt: "2026-09-17",
  primaryMetric: "paid",
  variants: [
    { id: "a5",  label: "A$5 (control / current config)", priceCents: 500,  priceAud: "A$5",  weight: 0.40, description: "Current platform-config value (bumped from A$3 on 2026-06-21)." },
    { id: "a3",  label: "A$3 (legacy / previous control)", priceCents: 300,  priceAud: "A$3",  weight: 0.10, description: "Previous control — held as comparison cohort." },
    { id: "a10", label: "A$10",                            priceCents: 1000, priceAud: "A$10", weight: 0.30, description: "Premium positioning — tests whether the audience is anchor-sensitive vs value-sensitive." },
    { id: "a1",  label: "A$1 (legacy / floor)",            priceCents: 100,  priceAud: "A$1",  weight: 0.20, description: "Legacy price — kept as floor to measure ceiling lift from the bumps above." },
  ],
};

export const EXPERIMENTS: Record<ExperimentId, Experiment> = {
  founding_price_2026q3: FOUNDING_PRICE_EXPERIMENT,
};

// ─── Assignment ─────────────────────────────────────────────────────────────

function hashIdentity(identity: string): number {
  // Tiny deterministic hash → number in [0, 1). Sticky across sessions for the
  // same identity (anonymous_id cookie or email).
  let h = 0;
  for (let i = 0; i < identity.length; i++) {
    h = (h * 31 + identity.charCodeAt(i)) | 0;
  }
  return Math.abs(h) / 2147483648;
}

function pickVariant(experiment: Experiment, identity: string): PricingVariant {
  const r = hashIdentity(`${experiment.id}|${identity}`);
  let cum = 0;
  for (const v of experiment.variants) {
    cum += v.weight;
    if (r <= cum) return v;
  }
  return experiment.variants[experiment.variants.length - 1];
}

/** Read or create an anonymous_id cookie. Server-side only. */
async function getOrSetAnonId(): Promise<string> {
  const store = await nextCookies();
  const existing = store.get("blockid_anonid")?.value;
  if (existing) return existing;
  // Generate a new anon id
  const id = `anon_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  // Note: Next.js disallows setting cookies during render in some flows.
  // Caller must set the cookie in a route handler / server action when needed.
  return id;
}

/**
 * Server-side: get the active variant for the founding-price experiment.
 * Returns the control if experiment inactive or identity missing.
 */
export async function getFoundingPriceVariant(args?: { identityOverride?: string }): Promise<PricingVariant> {
  const exp = FOUNDING_PRICE_EXPERIMENT;
  if (!exp.active) return exp.variants[0];
  const identity = args?.identityOverride ?? (await getOrSetAnonId());
  return pickVariant(exp, identity);
}

// ─── Logging ────────────────────────────────────────────────────────────────

export async function logAbEvent(args: {
  experimentId: ExperimentId;
  variantId: string;
  eventType: EventType;
  identityHash: string;
  amountCents?: number;
  stripeSessionId?: string;
}): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  try {
    await supabase.from("ab_pricing_events").insert({
      experiment_id: args.experimentId,
      variant_id: args.variantId,
      event_type: args.eventType,
      identity_hash: args.identityHash,
      amount_cents: args.amountCents ?? null,
      stripe_session_id: args.stripeSessionId ?? null,
    });
  } catch {
    // non-blocking — pricing flow should never break because of analytics
  }
}

// ─── Aggregation for admin dashboard ────────────────────────────────────────

export interface VariantResult {
  variantId: string;
  label: string;
  priceAud: string;
  exposures: number;
  checkoutStarted: number;
  paid: number;
  conversionPct: number;         // paid / exposures
  startedPct: number;            // checkout_started / exposures
  revenueAud: number;            // sum of amount_cents / 100
  rps: number;                   // revenue per session = revenueAud / exposures
}

export interface ExperimentReport {
  experimentId: ExperimentId;
  windowFrom: string;
  windowTo: string;
  variants: VariantResult[];
  totalExposures: number;
  totalPaid: number;
  totalRevenueAud: number;
}

export async function buildExperimentReport(
  experimentId: ExperimentId,
  windowDays = 90,
): Promise<ExperimentReport | null> {
  const supabase = getSupabaseAdmin();
  const exp = EXPERIMENTS[experimentId];
  if (!exp) return null;

  const windowFrom = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const windowTo = new Date().toISOString();

  // Empty report shell — used as the fallback when there's no data
  const empty: ExperimentReport = {
    experimentId,
    windowFrom,
    windowTo,
    variants: exp.variants.map((v) => ({
      variantId: v.id,
      label: v.label,
      priceAud: v.priceAud,
      exposures: 0,
      checkoutStarted: 0,
      paid: 0,
      conversionPct: 0,
      startedPct: 0,
      revenueAud: 0,
      rps: 0,
    })),
    totalExposures: 0,
    totalPaid: 0,
    totalRevenueAud: 0,
  };

  if (!supabase) return empty;

  try {
    const { data } = await supabase
      .from("ab_pricing_events")
      .select("variant_id, event_type, amount_cents")
      .eq("experiment_id", experimentId)
      .gte("ts", windowFrom)
      .lte("ts", windowTo)
      .limit(50_000);

    if (!data) return empty;

    const byVariant = new Map<string, { exposures: number; checkoutStarted: number; paid: number; revenue: number }>();
    for (const v of exp.variants) {
      byVariant.set(v.id, { exposures: 0, checkoutStarted: 0, paid: 0, revenue: 0 });
    }

    for (const row of data) {
      const bucket = byVariant.get(row.variant_id as string);
      if (!bucket) continue;
      if (row.event_type === "exposure") bucket.exposures++;
      else if (row.event_type === "checkout_started") bucket.checkoutStarted++;
      else if (row.event_type === "paid") {
        bucket.paid++;
        bucket.revenue += Number(row.amount_cents ?? 0) / 100;
      }
    }

    let totalExposures = 0;
    let totalPaid = 0;
    let totalRevenueAud = 0;

    const variants: VariantResult[] = exp.variants.map((v) => {
      const b = byVariant.get(v.id)!;
      totalExposures += b.exposures;
      totalPaid += b.paid;
      totalRevenueAud += b.revenue;
      return {
        variantId: v.id,
        label: v.label,
        priceAud: v.priceAud,
        exposures: b.exposures,
        checkoutStarted: b.checkoutStarted,
        paid: b.paid,
        conversionPct: b.exposures > 0 ? +(b.paid / b.exposures * 100).toFixed(2) : 0,
        startedPct: b.exposures > 0 ? +(b.checkoutStarted / b.exposures * 100).toFixed(2) : 0,
        revenueAud: Math.round(b.revenue * 100) / 100,
        rps: b.exposures > 0 ? +(b.revenue / b.exposures).toFixed(4) : 0,
      };
    });

    return {
      experimentId,
      windowFrom,
      windowTo,
      variants,
      totalExposures,
      totalPaid,
      totalRevenueAud: Math.round(totalRevenueAud * 100) / 100,
    };
  } catch {
    return empty;
  }
}
