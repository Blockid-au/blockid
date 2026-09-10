// Guest-side memory of paid Money Finder reports (T0247).
//
// A guest has no account row to count from, so the A$3 → Founder Radar
// upsell after the third purchase ("You've spent A$9 on 3 reports…") counts
// the report ids this browser has landed on straight from Stripe Checkout.
// `FundingReportTracker` records them; `FundingPaywall` reads the count.
// Signed-in users are counted from `funding_reports` instead (GET
// /api/funding/report), so this is never authoritative — it only decides
// whether to show a card. Every call is storage-safe: blocked / private-mode
// storage reads as zero and writes are dropped.

export const GUEST_PAID_REPORTS_KEY = "blockid:funding_reports_paid";
const MAX_IDS = 50;

function read(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(GUEST_PAID_REPORTS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Distinct paid report ids seen by this browser. */
export function guestPaidReportCount(): number {
  return new Set(read()).size;
}

/** Remember a paid report id (idempotent). Returns the new count. */
export function rememberGuestPaidReport(reportId: string): number {
  if (typeof window === "undefined" || !reportId) return 0;
  const ids = read();
  if (!ids.includes(reportId)) ids.push(reportId);
  const trimmed = ids.slice(-MAX_IDS);
  try {
    window.localStorage.setItem(GUEST_PAID_REPORTS_KEY, JSON.stringify(trimmed));
  } catch {
    // storage blocked — the count simply does not persist
  }
  return new Set(trimmed).size;
}

/** Purchases before the Radar card appears (3 × A$3 = A$9). */
export const RADAR_UPSELL_AFTER_REPORTS = 3;
