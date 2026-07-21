// Reseller commission math — pure functions.
//
// Enforces the invariants documented in docs/plans/reseller-module-plan.md
// § G.2 and § U.15.5. All amounts in AUD cents.
//
// Retail:   list - discount - commission = round(0.60 * list) ± 1 cent
// Wholesale: commission = 0 AND amount_paid = list - discount
//
// Rounding mode: half-to-even (banker's rounding) to match Postgres round().
//
// Pure module — no runtime dependencies. Safe to import from both server
// and (theoretically) client, though the intended caller is a server route.
// We deliberately do NOT `import "server-only"` here so the test runner can
// load the file without needing the Next.js server-only shim.

export type BillingModel = "retail" | "wholesale";

export interface CommissionInput {
  listPriceAudCents: number;
  discountPct: 0 | 10 | 20 | 30 | 40;
  billingModel: BillingModel;
}

export interface CommissionResult {
  listPriceAudCents: number;
  discountAudCents: number;
  amountPaidAudCents: number;
  commissionAudCents: number;
  blockidGrossAudCents: number;
  atoGstAudCents: number;
  blockidNetAfterGstAudCents: number;
}

/**
 * Half-to-even rounding. Matches Postgres `round(numeric)` semantics.
 * Ex: 0.5 → 0, 1.5 → 2, 2.5 → 2, 3.5 → 4.
 */
export function roundHalfEven(n: number): number {
  const rounded = Math.round(n);
  const diff = Math.abs(n - Math.trunc(n));
  if (diff !== 0.5) return rounded;
  const floor = Math.floor(n);
  return floor % 2 === 0 ? floor : floor + 1;
}

/**
 * Compute commission for a paid invoice line.
 *
 * @throws Error on invalid billingModel or arithmetic that would violate the
 *   plan invariant. Callers must catch — never silently emit a bad row.
 */
export function computeCommission(input: CommissionInput): CommissionResult {
  const { listPriceAudCents, discountPct, billingModel } = input;

  if (!Number.isInteger(listPriceAudCents) || listPriceAudCents <= 0) {
    throw new Error(
      `commission: listPriceAudCents must be a positive integer, got ${listPriceAudCents}`,
    );
  }
  if (![0, 10, 20, 30, 40].includes(discountPct)) {
    throw new Error(`commission: invalid discountPct ${discountPct}`);
  }

  const discountAudCents = roundHalfEven((listPriceAudCents * discountPct) / 100);
  const amountPaidAudCents = listPriceAudCents - discountAudCents;

  let commissionAudCents: number;
  if (billingModel === "retail") {
    // commission = 40% × list − discount
    const gross40 = roundHalfEven(listPriceAudCents * 0.40);
    commissionAudCents = gross40 - discountAudCents;
    if (commissionAudCents < 0) commissionAudCents = 0; // safety at tier > 40
  } else if (billingModel === "wholesale") {
    // Reseller pays Stripe directly; commission is always 0 in the ledger.
    commissionAudCents = 0;
  } else {
    // Exhaustive check for future BillingModel additions.
    const _exhaust: never = billingModel;
    throw new Error(`commission: unknown billingModel ${_exhaust as string}`);
  }

  const blockidGrossAudCents = amountPaidAudCents - commissionAudCents;

  // Enforce the plan invariant per U.15.1 CHECK.
  if (billingModel === "retail") {
    const expected = roundHalfEven(0.60 * listPriceAudCents);
    if (Math.abs(blockidGrossAudCents - expected) > 1) {
      throw new Error(
        `commission: retail invariant violated. Expected ${expected}, got ${blockidGrossAudCents}`,
      );
    }
  } else {
    // Wholesale: list − discount − 0 = amountPaid trivially. Assert.
    if (amountPaidAudCents !== listPriceAudCents - discountAudCents) {
      throw new Error(`commission: wholesale invariant violated`);
    }
  }

  // ATO GST split (post-hoc, per web/src/lib/gst.ts splitGst).
  const atoGstAudCents = roundHalfEven(amountPaidAudCents / 11);
  const blockidNetAfterGstAudCents = blockidGrossAudCents - atoGstAudCents;

  return {
    listPriceAudCents,
    discountAudCents,
    amountPaidAudCents,
    commissionAudCents,
    blockidGrossAudCents,
    atoGstAudCents,
    blockidNetAfterGstAudCents,
  };
}

/** Compute the reseller's effective share of the customer payment, in bp. */
export function effectiveResellerShareBp(r: CommissionResult): number {
  if (r.amountPaidAudCents === 0) return 0;
  return Math.round((10000 * r.commissionAudCents) / r.amountPaidAudCents);
}
