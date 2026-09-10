// Founder Radar upsell — the facts behind the approved A$3 → subscribe copy
// (G11 §4i D-3, T0247):
//
//   "This report is a snapshot. {next_program} closes in {d} days and
//    {k} programs on your list open new rounds this quarter. Founder Radar
//    watches them for you: alerts, monthly re-match, weekly next step —
//    A$29/mo, first 7 days free."
//
// Pure: reads a report's `timeline` (grant-advisor `TimelineItem[]`) and a
// `today`, returns the three placeholders or `null`s so the card can fall
// back to generic copy. No server-only import — the card (client), the
// report page (server) and the tests all use it.

import type { TimelineItem } from "@/lib/agents/grant-advisor";

export interface RadarUpsellFacts {
  /** The earliest hard deadline still ahead of `today`, or null. */
  next_program: { name: string; ref_id: string; days: number } | null;
  /**
   * Distinct grants / programs (other than `next_program`) with a dated
   * action inside the next three calendar months — "open new rounds this
   * quarter". Rolling / undated schemes are not counted.
   */
  quarter_count: number;
}

export const EMPTY_RADAR_FACTS: RadarUpsellFacts = Object.freeze({ next_program: null, quarter_count: 0 });

const DAY_MS = 24 * 60 * 60 * 1000;

function utcMidnight(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function parseDay(iso: string | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return Number.isFinite(t) ? utcMidnight(new Date(t)) : null;
}

/** `YYYY-MM` for `months` months after the month containing `t`. */
function ymOffset(t: number, months: number): string {
  const d = new Date(t);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + months;
  const dd = new Date(Date.UTC(y, m, 1));
  return `${dd.getUTCFullYear()}-${String(dd.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Compute the placeholders. `today` accepts an ISO date (the report's
 * `meta.today`, so the copy is stable for the reader and the tests) or a
 * Date; defaults to now.
 */
export function computeRadarUpsellFacts(
  timeline: readonly TimelineItem[] | null | undefined,
  today: string | Date = new Date(),
): RadarUpsellFacts {
  if (!Array.isArray(timeline) || timeline.length === 0) return EMPTY_RADAR_FACTS;
  const t0 = typeof today === "string" ? parseDay(today) : utcMidnight(today);
  if (t0 === null) return EMPTY_RADAR_FACTS;

  // 1. Next deadline — smallest non-negative distance; ties keep the first
  //    item, which is the one the report ranked higher.
  let next: RadarUpsellFacts["next_program"] = null;
  for (const it of timeline) {
    const day = parseDay(it.deadline);
    if (day === null) continue;
    const days = Math.round((day - t0) / DAY_MS);
    if (days < 0) continue;
    if (!next || days < next.days) next = { name: it.name, ref_id: it.ref_id, days };
  }

  // 2. Rounds opening this quarter — distinct ref_ids of grant / program
  //    actions dated in the current month or the next two.
  const window = new Set([ymOffset(t0, 0), ymOffset(t0, 1), ymOffset(t0, 2)]);
  const refs = new Set<string>();
  for (const it of timeline) {
    if (it.kind !== "grant" && it.kind !== "program") continue;
    if (!window.has(it.month)) continue;
    if (next && it.ref_id === next.ref_id) continue;
    refs.add(it.ref_id);
  }

  return { next_program: next, quarter_count: refs.size };
}

// ---------------------------------------------------------------------------
// Who is looking — decides the secondary CTA (Scout for evaluators).
// ---------------------------------------------------------------------------

export type RadarViewer = "guest" | "founder" | "evaluator";

/**
 * Evaluator = any investor / advisor / accelerator account. Plan ids are
 * segment-prefixed (plans.csv), so the plan alone is enough on the server;
 * the client passes the entitlement snapshot's `segment` when it has one.
 */
export function radarViewerKind(user: { plan?: string | null; segment?: string | null } | null | undefined): RadarViewer {
  if (!user) return "guest";
  const seg = (user.segment ?? "").toLowerCase();
  if (seg === "investor" || seg === "advisor" || seg === "accelerator") return "evaluator";
  const plan = (user.plan ?? "").toLowerCase();
  if (plan.startsWith("investor_") || plan.startsWith("accelerator_")) return "evaluator";
  return "founder";
}

/** Pricing constants the card prints — one place, next to the copy. */
export const FOUNDER_RADAR_MONTHLY_AUD = 29;
export const FOUNDER_RADAR_TRIAL_DAYS = 7;
export const SCOUT_MONTHLY_AUD = 79;
export const FUNDING_REPORT_AUD = 3;

export function founderRadarSignupHref(from: string): string {
  return `/signup?plan=founder_starter&trial=1&from=${encodeURIComponent(from)}`;
}

/** Same target `evaluatorSignupHref("investor_angel")` builds on /pricing. */
export const SCOUT_SIGNUP_HREF = "/signup?segment=evaluator&plan=investor_angel";
