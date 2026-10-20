// Which `FEATURE_COSTS` key a member Money Finder report is charged under
// (G35 P5, D25 — docs/pricing-v5-plan.md §2).
//
//   payg_enabled OFF → "grant_match"     (legacy cost — today's charge)
//   payg_enabled ON  → "report_funding"  (= PAYG_SKUS.report_funding.creditCost)
//
// The route debits under this key and the paywall shows `view.fundingCredits`;
// credit-feature.test.ts pins that both keys equal what the view displays,
// so the shown and the debited amount can never drift apart.
//
// Pure, isomorphic (no I/O).

export const LEGACY_FUNDING_FEATURE = "grant_match" as const;
export const PAYG_FUNDING_FEATURE = "report_funding" as const;

export type FundingCreditFeature = typeof LEGACY_FUNDING_FEATURE | typeof PAYG_FUNDING_FEATURE;

export function fundingCreditFeature(paygEnabled: boolean): FundingCreditFeature {
  return paygEnabled ? PAYG_FUNDING_FEATURE : LEGACY_FUNDING_FEATURE;
}
