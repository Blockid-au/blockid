// Weekly digest "Money this week" block (T0246, plan §4h "Weekly next-step
// digest" + §4i D-3 header copy).
//
// Pure: turns the founder's `funding_matches` rows (joined in memory to the
// catalogue name) into the `DigestMoneySection` that
// lib/digest/weekly.ts puts on the payload and lib/digest/email-template.ts
// renders right after the action block. No DB here — weekly.ts reads the
// rows; this file decides what they mean:
//
//   next_deadline    = the soonest dated open/upcoming match on or after today
//   new_matches      = rows whose first_seen_at fell inside the digest period
//   suggested_action = one sentence keyed on how close that deadline is
//                      (T-3 submit · T-14 draft · T-30 checklist · else review)
//
// Colocated tests: digest-money.test.ts.

export interface DigestMoneyMatch {
  ref_kind: "grant" | "program";
  ref_id: string;
  name: string;
  score: number;
  status_at_match: string;
  /** ISO day; null for rolling rows. */
  closes_at: string | null;
  /** ISO timestamp the sweep first matched it. */
  first_seen_at: string;
  official_url?: string | null;
  amount_max_aud?: number | null;
}

export interface DigestMoneyDeadline {
  name: string;
  closes_at: string;
  days: number;
  ref_kind: "grant" | "program";
  ref_id: string;
  official_url?: string | null;
}

export interface DigestMoneySection {
  /** True when the founder holds `money_radar` — the block renders in full. */
  radar: boolean;
  next_deadline?: DigestMoneyDeadline;
  new_matches: number;
  suggested_action?: string;
  /** Deep link for the block's CTA (/workspace/funding, or /pricing on the teaser). */
  href: string;
}

export const MONEY_DIGEST_TEASER = "Founder Radar — see your grant deadlines";

function parseIsoDay(s: string | null | undefined): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
  const d = new Date(`${s.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Whole days from `today` to `closes` (0 = today). */
function daysUntil(today: Date, closes: Date): number {
  return Math.round((closes.getTime() - today.getTime()) / 86_400_000);
}

/** One sentence the founder can act on this week, keyed on the tightest deadline. */
export function suggestMoneyAction(next: DigestMoneyDeadline | undefined, newMatches: number): string {
  if (next) {
    if (next.days <= 3) return `Submit ${next.name} — it closes ${next.days <= 0 ? "today" : `in ${next.days} day${next.days === 1 ? "" : "s"}`}`;
    if (next.days <= 14) return `Finish your ${next.name} draft — two weeks is enough if you start now`;
    if (next.days <= 30) return `Work through the ${next.name} eligibility checklist`;
    return `Book the ${next.name} deadline (${next.closes_at}) in your calendar and list the evidence it asks for`;
  }
  if (newMatches > 0) return `Review your ${newMatches} new match${newMatches === 1 ? "" : "es"} and pick one to apply for`;
  return "No deadline in the next 30 days — use the week to update your profile so the next sweep matches more";
}

export interface BuildDigestMoneyOptions {
  now?: Date;
  periodStart?: Date;
  /** Base for the CTA link. Default from NEXT_PUBLIC_SITE_URL. */
  siteBase?: string;
}

function siteBase(explicit?: string): string {
  const raw = explicit ?? process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL ?? "https://blockid.au";
  return raw.replace(/\/+$/, "");
}

/**
 * Build the money block. `radar=false` yields the one-line teaser shape
 * (no deadline, no action) with the upgrade link — the template renders the
 * MONEY_DIGEST_TEASER copy for it.
 */
export function buildDigestMoney(
  rows: readonly DigestMoneyMatch[],
  radar: boolean,
  opts: BuildDigestMoneyOptions = {},
): DigestMoneySection {
  const base = siteBase(opts.siteBase);
  if (!radar) {
    return { radar: false, new_matches: 0, href: `${base}/pricing?from=digest_money` };
  }
  const now = opts.now ?? new Date();
  const today = startOfUtcDay(now);
  const periodStart = opts.periodStart ?? new Date(now.getTime() - 7 * 86_400_000);

  // Soonest dated open/upcoming row on or after today; ties → higher score.
  let next: DigestMoneyDeadline | undefined;
  let nextScore = -Infinity;
  for (const r of rows) {
    if (r.status_at_match !== "open" && r.status_at_match !== "upcoming") continue;
    const closes = parseIsoDay(r.closes_at);
    if (!closes) continue;
    const days = daysUntil(today, closes);
    if (days < 0) continue;
    if (!next || days < next.days || (days === next.days && r.score > nextScore)) {
      next = { name: r.name, closes_at: r.closes_at!.slice(0, 10), days, ref_kind: r.ref_kind, ref_id: r.ref_id, official_url: r.official_url ?? null };
      nextScore = r.score;
    }
  }

  const periodStartMs = periodStart.getTime();
  const newMatches = rows.filter((r) => {
    const t = Date.parse(r.first_seen_at);
    return Number.isFinite(t) && t >= periodStartMs && t <= now.getTime();
  }).length;

  return {
    radar: true,
    ...(next ? { next_deadline: next } : {}),
    new_matches: newMatches,
    suggested_action: suggestMoneyAction(next, newMatches),
    href: `${base}/workspace/funding`,
  };
}

/** "Money this week: {n} new matches · next deadline {program} in {d} days · this week's step: {action}" */
export function moneyDigestHeader(m: DigestMoneySection): string {
  const parts = [`${m.new_matches} new match${m.new_matches === 1 ? "" : "es"}`];
  if (m.next_deadline) {
    const d = m.next_deadline.days;
    parts.push(`next deadline ${m.next_deadline.name} ${d <= 0 ? "today" : `in ${d} day${d === 1 ? "" : "s"}`}`);
  }
  if (m.suggested_action) parts.push(`this week's step: ${m.suggested_action}`);
  return `Money this week: ${parts.join(" · ")}`;
}
