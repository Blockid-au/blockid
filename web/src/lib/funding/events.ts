// au_programs events → Conference (T0246, plan §4h "Suitable events").
//
// The conference recommender (lib/conferences.ts) scores a curated
// `content/conferences.json`. The Money Finder catalogue already carries the
// ecosystem festivals as `au_programs` rows with `program_type = "event"`
// (Spark, West Tech Fest, SouthStart, October Business Month …) and the
// weekly refresh keeps their status / dates current — so instead of a
// second hand-maintained list, this module maps those rows to the
// `Conference` shape and `recommendConferencesWithProgramEvents` feeds
// `recommendConferences({ source: [...seed, ...programEvents] })`.
//
// Rules:
//   • `status === "closed"` is skipped (SXSW Sydney 2026 — cancelled; a
//     "closed" edition with next year's month is not a bookable date yet).
//     `paused` rows are skipped for the same reason.
//   • date = `next_cohort_start` (YYYY-MM-DD, or YYYY-MM → the 1st, flagged
//     "date to be confirmed" in notes); with no date, the next occurrence of
//     the earliest `intake_months` entry after `now`. No month either → skip.
//   • stage_tags (FounderStage) → growth-phase index 0-4; empty = any.
//   • industry_tags → sectors verbatim; empty = sector-agnostic (the
//     recommender treats an empty `sectors` list as a match).
//   • cost_to_founder → free | invite | paid (free wins when both appear).
//
// Pure except the one async wrapper that reads the two sources.
// Colocated tests: events.test.ts.

import "server-only";
import { loadConferenceSeed, recommendConferences, type Conference, type ConferenceCost, type RecommendInput } from "@/lib/conferences";
import type { AuProgramRow } from "./seed-map";
import { listPrograms } from "./data";

const STAGE_INDEX: Readonly<Record<string, number>> = {
  idea: 0,
  pre_revenue_prototype: 1,
  mvp: 2,
  early_revenue: 3,
  scaling: 4,
  export_ready: 4,
};

export function programStagesToConference(tags: readonly string[] | null | undefined): number[] {
  const out = new Set<number>();
  for (const t of tags ?? []) {
    const i = STAGE_INDEX[String(t).trim()];
    if (typeof i === "number") out.add(i);
  }
  return Array.from(out).sort((a, b) => a - b);
}

export function programCostToConference(cost: string | null | undefined): ConferenceCost {
  const c = (cost ?? "").toLowerCase();
  if (!c || c === "n/a") return "paid";
  if (/\bfree\b/.test(c)) return "free";
  if (/invit/.test(c)) return "invite";
  return "paid";
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Resolve the event's first day. Returns the ISO day plus whether it is an
 * approximation (month known, day not).
 */
export function programEventDate(row: Pick<AuProgramRow, "next_cohort_start" | "intake_months">, now: Date): { date: string; approximate: boolean } | null {
  const raw = (row.next_cohort_start ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return { date: raw.slice(0, 10), approximate: false };
  if (/^\d{4}-\d{2}$/.test(raw)) return { date: `${raw}-01`, approximate: true };

  const months = (row.intake_months ?? []).filter((m) => Number.isInteger(m) && m >= 1 && m <= 12).sort((a, b) => a - b);
  if (months.length === 0) return null;
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const next = months.find((x) => x >= m);
  const year = next === undefined ? y + 1 : y;
  const month = next ?? months[0];
  return { date: `${year}-${pad2(month)}-01`, approximate: true };
}

export interface ProgramEventsOptions {
  now?: Date;
}

/**
 * `au_programs` rows with `program_type === "event"` as `Conference`s.
 * Closed / paused rows and rows with no resolvable date are dropped.
 */
export function programEventsAsConferences(rows: readonly AuProgramRow[], opts: ProgramEventsOptions = {}): Conference[] {
  const now = opts.now ?? new Date();
  const out: Conference[] = [];
  for (const r of rows) {
    if (r.program_type !== "event") continue;
    if (r.status === "closed" || r.status === "paused") continue;
    const when = programEventDate(r, now);
    if (!when) continue;
    const pitch = (r.benefits ?? []).some((b) => /pitch/i.test(String(b)));
    const notes: string[] = [];
    if (r.summary) notes.push(r.summary);
    if (when.approximate) {
      const [y, m] = when.date.split("-");
      notes.push(`Date to be confirmed — ${MONTHS[Number(m) - 1]} ${y}`);
    }
    out.push({
      slug: `program-${r.id}`,
      name: r.name,
      date: when.date,
      city: r.city,
      country: "AU",
      url: r.official_url,
      audience: ["founder"],
      stages: programStagesToConference(r.stage_tags),
      sectors: (r.industry_tags ?? []).map((s) => String(s).toLowerCase()),
      cost: programCostToConference(r.cost_to_founder),
      pitchCompetition: pitch,
      ...(notes.length ? { notes: notes.join(" · ") } : {}),
    });
  }
  return out;
}

/**
 * Merge the curated seed with the catalogue's event rows, de-duplicated by
 * name (seed wins — it carries richer sector / stage data), so the same
 * festival never appears twice.
 */
export function mergeConferenceSources(seed: readonly Conference[], programEvents: readonly Conference[]): Conference[] {
  const seen = new Set(seed.map((c) => c.name.toLowerCase().trim()));
  const extra = programEvents.filter((c) => {
    const k = c.name.toLowerCase().trim();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return [...seed, ...extra];
}

/**
 * The one helper every dashboard / insights call site uses: the seed list +
 * live `au_programs` events through the unchanged recommender. A catalogue
 * read failure degrades to the seed alone.
 */
export async function recommendConferencesWithProgramEvents(input: Omit<RecommendInput, "source"> = {}): Promise<Conference[]> {
  const now = input.now ?? new Date();
  const [seed, programs] = await Promise.all([
    loadConferenceSeed(),
    listPrograms({}).catch(() => [] as AuProgramRow[]),
  ]);
  const source = mergeConferenceSources(seed, programEventsAsConferences(programs, { now }));
  return recommendConferences({ ...input, now, source });
}
