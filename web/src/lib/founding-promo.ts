// Founding 100 promo cutover helper.
//
// Founding 100 is an A$5 one-off / 50 credits lifetime offer that runs
// until 2026-08-31 (Australia local — treated as UTC end-of-day for
// simplicity: promo ends when the wall clock hits 2026-09-01T00:00:00Z).
//
// After the promo window, the standard offer for new signups is Growth
// at A$99/mo (100 credits/mo, recurring). Existing Founding 100 buyers
// are grandfathered — their 50 lifetime credits and access remain.
//
// Callers:
//   - pricing-data.ts / applyPlatformConfigToPricing() — hides the
//     founding50 tier from the /pricing page after cutover
//   - /founding-50 landing page — redirects to /pricing after cutover
//   - checkout API — refuses new Founding 100 subscriptions after cutover
//
// The date is intentionally hard-coded here (not in platform_config) so
// that a Supabase outage cannot accidentally re-open the promo window.

export const FOUNDING_PROMO_END = new Date("2026-09-01T00:00:00Z");

export function isFoundingPromoActive(now: Date = new Date()): boolean {
  return now.getTime() < FOUNDING_PROMO_END.getTime();
}

export function standardMonthlyPriceCents(): number {
  return 9900;
}
