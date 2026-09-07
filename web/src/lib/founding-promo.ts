// Founding 100 promo cutover helper.
//
// Founding 100 is an A$5 one-off / 50 credits lifetime offer that runs
// until FOUNDING_PROMO_END. The deadline is a UTC instant so it does not
// drift with server locale; AU wall-clock is close enough for a marketing
// countdown (24-hour windows) but we intentionally do not round to AEST.
//
// After the promo window, the standard offer for new signups is Growth
// at A$99/mo (100 credits/mo, recurring). Existing Founding 100 buyers
// are grandfathered — their 50 lifetime credits and access remain.
//
// The deadline is now driven by `FOUNDING_PROMO_ENDS_AT` (env), falling
// back to a compile-time constant. This unblocks marketing from extending
// the promo without a deploy, and — critically — stops the /pricing page
// from rendering a stale banner past the cutover (the P1 audit on
// 2026-08-23 caught the hard-coded "Promo ends 31 Aug 2026" banner still
// on the page a week into September).
//
// Callers:
//   - /pricing page — reads getFoundingPromoState() and returns null when
//     inactive; countdown text (e.g. "Ends in 12 days") is dynamic.
//   - pricing-data.ts / applyPlatformConfigToPricing() — hides the
//     founding50 tier from the /pricing page after cutover.
//   - /founding-50 landing page — redirects to /pricing after cutover.
//   - checkout API — refuses new Founding 100 subscriptions after cutover.
//
// The fallback date is intentionally hard-coded (not in platform_config)
// so a Supabase outage cannot accidentally re-open the promo window.

const FALLBACK_PROMO_END_ISO = "2026-09-01T00:00:00Z";

function readEnvPromoEnd(): Date | null {
  const raw = process.env.FOUNDING_PROMO_ENDS_AT?.trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

// FOUNDING_PROMO_END is evaluated at module-load time so long-running
// server processes pick up an env change on restart. Tests continue to
// import this constant to pin the cutover instant.
export const FOUNDING_PROMO_END: Date =
  readEnvPromoEnd() ?? new Date(FALLBACK_PROMO_END_ISO);

export function isFoundingPromoActive(now: Date = new Date()): boolean {
  return now.getTime() < FOUNDING_PROMO_END.getTime();
}

export function standardMonthlyPriceCents(): number {
  return 9900;
}

export interface FoundingPromoState {
  /** True while the promo window is still open. */
  active: boolean;
  /** Absolute deadline (UTC). */
  endsAt: Date;
  /**
   * Marketing-facing countdown string. "" when inactive so callers can
   * hide the banner. Values are day-granular (e.g. "Ends in 12 days"),
   * collapse to "Ends today" inside the final 24h, and "Ends in 1 day"
   * inside the 24-48h window.
   */
  countdownLabel: string;
}

/**
 * Single source of truth for the Founding-100 promo banner + card. UI
 * must call this instead of hard-coding the deadline; when
 * `active === false`, callers should render nothing.
 */
export function getFoundingPromoState(
  now: Date = new Date(),
): FoundingPromoState {
  const endsAt = FOUNDING_PROMO_END;
  const active = now.getTime() < endsAt.getTime();
  if (!active) {
    return { active: false, endsAt, countdownLabel: "" };
  }
  const msLeft = endsAt.getTime() - now.getTime();
  const daysLeft = Math.ceil(msLeft / (24 * 60 * 60 * 1000));
  let countdownLabel: string;
  if (daysLeft <= 1) {
    // Inside the final 24h window collapse to "Ends today"; the caller
    // controls whether to swap in an hour-granular string.
    countdownLabel = "Ends today";
  } else if (daysLeft === 2) {
    countdownLabel = "Ends in 1 day";
  } else {
    countdownLabel = `Ends in ${daysLeft - 1} days`;
  }
  return { active, endsAt, countdownLabel };
}
