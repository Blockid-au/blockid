// Weekly digest — per-reseller distribution of attributed customers across
// promotion-code tier percentages (0 / 10 / 20 / 30 / 40).
//
// P11 canonical KPI list (reseller-module-goal.md `weekly_digest_kpis`) names
// `tier_mix` as one of the ongoing signals the Monday digest should surface.
// Before this module the digest only exposed leading-signal + audit-anomaly +
// human_blocked + credit-budget utilization sections — a partner's tier mix
// was invisible without opening /admin/resellers/[code] per row and
// hand-counting attributions against reseller_promotion_codes.
//
// Kept dependency-free so the CSV/HTML shape can be regression-tested without
// touching Supabase or nodemailer — mirrors budget-utilization.ts (P11.1).
//
// U.15.1 note: TIER_BUCKETS follows the wholesale-tier ladder from § U.15.1
// (INFOVISION allowed_tiers = [0, 10, 20, 30, 40]). Attributions whose linked
// promotion_code_id is null or resolves to an out-of-ladder tier land in the
// `none` bucket rather than being silently dropped, so the row total always
// matches the reseller's total active-attribution count.

export const TIER_BUCKETS = [0, 10, 20, 30, 40] as const;
export type TierBucket = (typeof TIER_BUCKETS)[number];

/**
 * One attribution row shape the digest cron passes into computeTierMix. Only
 * the two fields that classify the row are exposed — reseller_id (grouping
 * key) and tier_pct (bucket key, or null for "no code / unknown tier").
 */
export interface TierMixAttributionRow {
  reseller_id: string;
  tier_pct: number | null;
}

/**
 * Per-tier counts + none bucket + total. Every one of TIER_BUCKETS appears in
 * the result even when count=0 so the table layout is stable week-to-week.
 */
export interface TierMix {
  counts: Record<TierBucket, number>;
  none: number;
  total: number;
}

function emptyMix(): TierMix {
  return {
    counts: { 0: 0, 10: 0, 20: 0, 30: 0, 40: 0 },
    none: 0,
    total: 0,
  };
}

function isKnownBucket(n: number): n is TierBucket {
  return (TIER_BUCKETS as readonly number[]).includes(n);
}

/**
 * Fold attribution rows into per-reseller tier-bucket counts. Rows with a
 * tier_pct outside TIER_BUCKETS (or null) land in the `none` bucket so a
 * hand-tweaked promo code (e.g. tier 15) surfaces as unknown rather than
 * silently dropped.
 */
export function computeTierMix(
  rows: ReadonlyArray<TierMixAttributionRow>,
): TierMix {
  const mix = emptyMix();
  for (const r of rows) {
    if (r.tier_pct === null || r.tier_pct === undefined) {
      mix.none += 1;
      mix.total += 1;
      continue;
    }
    if (!Number.isFinite(r.tier_pct)) {
      mix.none += 1;
      mix.total += 1;
      continue;
    }
    if (isKnownBucket(r.tier_pct)) {
      mix.counts[r.tier_pct] += 1;
      mix.total += 1;
      continue;
    }
    mix.none += 1;
    mix.total += 1;
  }
  return mix;
}

/**
 * Group attribution rows by reseller_id, then compute one TierMix per group.
 * Resellers with zero attributions still appear so a partner that lost every
 * attributed customer this week is visible rather than absent.
 */
export function computeTierMixByReseller(
  resellerIds: ReadonlyArray<string>,
  rows: ReadonlyArray<TierMixAttributionRow>,
): Map<string, TierMix> {
  const grouped = new Map<string, TierMixAttributionRow[]>();
  for (const r of rows) {
    const list = grouped.get(r.reseller_id) ?? [];
    list.push(r);
    grouped.set(r.reseller_id, list);
  }
  const out = new Map<string, TierMix>();
  for (const id of resellerIds) {
    out.set(id, computeTierMix(grouped.get(id) ?? []));
  }
  return out;
}

export interface TierMixRow {
  reseller_id: string;
  reseller_code: string;
  reseller_display_name: string;
  mix: TierMix;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Render the tier-mix distribution section for the weekly digest. Returns an
 * empty string when `rows` is empty so the caller can unconditionally append
 * the result. Every bucket column always renders (0 shows as `0`), so ops can
 * eyeball week-over-week drift without wondering whether a missing column is
 * a query bug or a genuine zero.
 */
export function formatWeeklyDigestTierMixSection(
  rows: ReadonlyArray<TierMixRow>,
): string {
  if (rows.length === 0) return "";
  const sorted = [...rows].sort((a, b) =>
    a.reseller_code.localeCompare(b.reseller_code),
  );
  const body = sorted
    .map((r) => {
      const m = r.mix;
      const bucketCells = TIER_BUCKETS.map(
        (b) => `<td style="text-align:right">${m.counts[b]}</td>`,
      ).join("");
      return `
      <tr>
        <td>${escapeHtml(r.reseller_code)}</td>
        <td>${escapeHtml(r.reseller_display_name)}</td>
        ${bucketCells}
        <td style="text-align:right">${m.none}</td>
        <td style="text-align:right"><strong>${m.total}</strong></td>
      </tr>`;
    })
    .join("");
  const bucketHeaders = TIER_BUCKETS.map(
    (b) => `<th>${b}%</th>`,
  ).join("");
  return `
    <h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">Tier mix (attributed customers by promo tier)</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Per-reseller count of active attributions grouped by <code>reseller_promotion_codes.tier_pct</code>. Rows with no linked promo (source=admin_manual) or an off-ladder tier land in <code>none</code>. Totals equal the reseller's active + not-opted-out attribution count.</p>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead>
        <tr>
          <th>Code</th>
          <th>Display name</th>
          ${bucketHeaders}
          <th>none</th>
          <th>total</th>
        </tr>
      </thead>
      <tbody>${body}
      </tbody>
    </table>`;
}
