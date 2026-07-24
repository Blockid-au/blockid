// Pure planner for reconciling Stripe tier coupons against the canonical
// reseller ladder [0,10,20,30,40].
//
// Zero Stripe/Supabase imports — unit-testable as a pure function library,
// matching decideCodeMint (promotion-code-mint.ts:182) and
// buildResellerWholesaleSubscriptionParams (stripe-billing.ts:322).
//
// Contract:
//   - Canonical Stripe coupon id scheme: res_tier_<pct> (e.g. res_tier_10).
//     Tier 0 is attribution-only and has NO Stripe coupon.
//   - percent_off MUST equal the tier, duration MUST be 'forever',
//     metadata.canonical MUST be 'true' and metadata.tier_pct MUST match.
//   - Drift (percent_off mismatch on an id that matches the canonical scheme)
//     ALWAYS sets requires_confirmation=true — the adapter refuses to act on
//     a repair action without an explicit --confirm-drift flag.
//   - NEVER emits a `delete` action. Legacy coupons stay intact; drift is
//     handled by rename-in-metadata + versioned canonical id via the adapter.
//
// See docs/plans/mega-2026-07-24/04-cfo-affiliate-stripe.md for the full
// design rationale.

export const CANONICAL_TIER_PCTS: readonly number[] = [10, 20, 30, 40] as const;

const CANONICAL_ID_RE = /^res_tier_(\d{1,2})(?:_v\d+)?$/;
const CANONICAL_SOURCE = "reseller_module_p9.3";

export interface StripeCouponFixture {
  id: string;
  percent_off: number | null;
  duration: string;
  metadata: Record<string, string> | null | undefined;
  // Deleted coupons in Stripe carry a `deleted` field. Include for
  // completeness but ignored by the planner.
  deleted?: boolean;
}

export interface TierCouponSpec {
  id: string;
  percent_off: number;
  duration: "forever";
  metadata: {
    source: "reseller_module_p9.3";
    canonical: "true";
    tier_pct: string;
  };
}

export type ReconcileAction =
  | { kind: "noop"; tier_pct: number; existing: StripeCouponFixture }
  | { kind: "create"; tier_pct: number; spec: TierCouponSpec }
  | {
      kind: "metadata_patch";
      tier_pct: number;
      existing: StripeCouponFixture;
      metadata_patch: Record<string, string>;
    }
  | {
      kind: "repair";
      tier_pct: number;
      existing: StripeCouponFixture;
      spec: TierCouponSpec;
      requires_confirmation: true;
      drift: {
        expected_percent_off: number;
        actual_percent_off: number | null;
      };
    };

export interface ReconcileInput {
  existingCoupons: StripeCouponFixture[];
  canonicalTiers?: readonly number[];
}

export interface ReconcilePlan {
  actions: ReconcileAction[];
  /** Actions that require --confirm-drift before the adapter will execute them. */
  drift: ReconcileAction[];
}

/**
 * Build the canonical spec for a tier's Stripe coupon.
 */
export function buildCanonicalTierCouponSpec(tierPct: number): TierCouponSpec {
  return {
    id: `res_tier_${tierPct}`,
    percent_off: tierPct,
    duration: "forever",
    metadata: {
      source: CANONICAL_SOURCE,
      canonical: "true",
      tier_pct: String(tierPct),
    },
  };
}

/**
 * Extract the tier_pct encoded in a canonical id (res_tier_10 → 10,
 * res_tier_10_v2 → 10). Returns null when the id does not follow the scheme.
 */
export function tierPctFromCanonicalId(id: string): number | null {
  const m = CANONICAL_ID_RE.exec(id);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/**
 * Compute the reconciliation plan against the canonical tier ladder.
 * Excludes tier 0 (attribution-only, no Stripe coupon).
 */
export function planTierCouponReconciliation(
  input: ReconcileInput,
): ReconcilePlan {
  const canonicalTiers =
    input.canonicalTiers && input.canonicalTiers.length > 0
      ? [...input.canonicalTiers]
      : [...CANONICAL_TIER_PCTS];

  // Index existing coupons by the canonical id we expect for each tier.
  // We ONLY consider ids that follow the canonical scheme; legacy coupons
  // (e.g. res_abc123_t20 from promotion-code-mint) belong to per-reseller
  // codes and are out-of-scope for the tier ladder planner.
  const byCanonicalTier = new Map<number, StripeCouponFixture>();
  for (const c of input.existingCoupons) {
    if (c.deleted) continue;
    const tier = tierPctFromCanonicalId(c.id);
    if (tier == null) continue;
    // Prefer the base id `res_tier_<pct>` over versioned rows so `noop` /
    // `metadata_patch` targets the canonical one when both exist.
    const existing = byCanonicalTier.get(tier);
    if (!existing || c.id === `res_tier_${tier}`) {
      byCanonicalTier.set(tier, c);
    }
  }

  const actions: ReconcileAction[] = [];
  for (const tier of canonicalTiers) {
    if (tier === 0) continue; // attribution-only
    const spec = buildCanonicalTierCouponSpec(tier);
    const existing = byCanonicalTier.get(tier);
    if (!existing) {
      actions.push({ kind: "create", tier_pct: tier, spec });
      continue;
    }

    // Drift: percent_off mismatch OR duration mismatch. Never destructive;
    // repair requires --confirm-drift and is handled by the adapter via
    // legacy rename + versioned canonical id.
    const percentOk =
      typeof existing.percent_off === "number" && existing.percent_off === tier;
    const durationOk = existing.duration === "forever";
    if (!percentOk || !durationOk) {
      actions.push({
        kind: "repair",
        tier_pct: tier,
        existing,
        spec,
        requires_confirmation: true,
        drift: {
          expected_percent_off: tier,
          actual_percent_off:
            typeof existing.percent_off === "number" ? existing.percent_off : null,
        },
      });
      continue;
    }

    // Metadata patch: canonical/tier_pct/source stale but the coupon
    // itself is otherwise correct.
    const meta = existing.metadata ?? {};
    const needsPatch: Record<string, string> = {};
    if (meta.source !== CANONICAL_SOURCE) needsPatch.source = CANONICAL_SOURCE;
    if (meta.canonical !== "true") needsPatch.canonical = "true";
    if (meta.tier_pct !== String(tier)) needsPatch.tier_pct = String(tier);
    if (Object.keys(needsPatch).length > 0) {
      actions.push({
        kind: "metadata_patch",
        tier_pct: tier,
        existing,
        metadata_patch: needsPatch,
      });
      continue;
    }

    actions.push({ kind: "noop", tier_pct: tier, existing });
  }

  const drift = actions.filter(
    (a): a is Extract<ReconcileAction, { kind: "repair" }> => a.kind === "repair",
  );

  return { actions, drift };
}
