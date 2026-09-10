// Money Radar ICS feed (T0245, plan §4h "ICS subscribe").
//
// Pure: turns `funding_matches` rows (joined to their catalogue row for the
// name / URL) into generic `IcsEvent`s for `renderIcs()` in
// @/lib/compliance/calendar. One VEVENT per matched row that has a date —
// `closes_at` for grants and dated program intakes, the edition date for
// program_type=event — with VALARMs at 30 / 14 / 3 days, mirroring the
// in-app deadline tiers. Rolling rows (no date) are skipped: a calendar
// entry with no day is noise.
//
// The route (/api/funding/calendar.ics?token=) reads the rows and hands
// them in; the per-user token is minted by /api/funding/calendar-token.
// Colocated tests: calendar.test.ts.

import type { IcsEvent } from "@/lib/compliance/calendar";

export const FUNDING_CALENDAR_NAME = "BlockID.au — Money Radar";
export const FUNDING_CALENDAR_PRODID = "-//BlockID.au//Money Radar//EN";
export const FUNDING_CALENDAR_DESCRIPTION =
  "Grant closing dates, program intakes and events matched to your startup by BlockID Money Radar. Dates are taken from official sources and re-checked weekly — confirm on the official page before you rely on one.";
export const FUNDING_REMINDER_LEAD_DAYS: readonly number[] = [30, 14, 3];

export interface FundingCalendarRow {
  ref_kind: "grant" | "program";
  ref_id: string;
  /** ISO date (YYYY-MM-DD) or null for rolling rows. */
  closes_at: string | null;
  score: number;
  status_at_match: string;
  name: string;
  official_url: string | null;
  /** Programs only — `event` rows get "Event:" wording and no "closes" verb. */
  program_type?: string | null;
  /** Programs only — cohort start for the description. */
  next_cohort_start?: string | null;
  summary?: string | null;
  /** Grants only — for the description. */
  amount_max_aud?: number | null;
  /** Startup the match belongs to (multi-profile founders). */
  startup?: string | null;
}

export interface BuildFundingCalendarOptions {
  now?: Date;
  /** Months forward to emit. Default 12. */
  horizonMonths?: number;
  /** Include rows whose date already passed (default false). */
  includePast?: boolean;
}

function toIsoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseIsoDay(s: string | null | undefined): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
  const d = new Date(`${s.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function addMonthsIso(d: Date, months: number): string {
  const x = new Date(d.getTime());
  x.setUTCMonth(x.getUTCMonth() + months);
  return toIsoDay(x);
}

function aud(n: number): string {
  return `A$${Math.round(n).toLocaleString("en-AU")}`;
}

/** Stable UID so re-subscribes never duplicate: `radar-<kind>-<id>-<date>@blockid.au`. */
export function fundingEventUid(row: Pick<FundingCalendarRow, "ref_kind" | "ref_id" | "closes_at">): string {
  const safe = row.ref_id.replace(/[^A-Za-z0-9_-]/g, "-");
  return `radar-${row.ref_kind}-${safe}-${row.closes_at ?? "nodate"}@blockid.au`;
}

export function buildFundingCalendar(rows: readonly FundingCalendarRow[], opts: BuildFundingCalendarOptions = {}): IcsEvent[] {
  const now = opts.now ?? new Date();
  const today = toIsoDay(now);
  const horizon = addMonthsIso(now, opts.horizonMonths ?? 12);
  const out: IcsEvent[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const date = parseIsoDay(row.closes_at);
    if (!date) continue;
    const day = toIsoDay(date);
    if (!opts.includePast && day < today) continue;
    if (day > horizon) continue;
    const uid = fundingEventUid({ ...row, closes_at: day });
    if (seen.has(uid)) continue;
    seen.add(uid);

    const isEvent = row.ref_kind === "program" && row.program_type === "event";
    const prefix = row.ref_kind === "grant" ? "Grant closes" : isEvent ? "Event" : "Applications close";
    const summary = `${prefix}: ${row.name}`;
    const bits: string[] = [];
    if (row.startup) bits.push(`Matched to ${row.startup} (score ${row.score}/100).`);
    else bits.push(`Matched by BlockID Money Radar (score ${row.score}/100).`);
    if (row.ref_kind === "grant" && row.amount_max_aud) bits.push(`Up to ${aud(row.amount_max_aud)}.`);
    if (row.ref_kind === "program" && row.next_cohort_start && !isEvent) bits.push(`Cohort starts ${row.next_cohort_start}.`);
    if (row.summary) bits.push(row.summary.trim());
    if (row.official_url) bits.push(`Official page: ${row.official_url}`);
    bits.push("Reminders 30 / 14 / 3 days out. Confirm the date on the official page before you rely on it.");

    out.push({
      uid,
      summary,
      description: bits.join(" "),
      date_start: day,
      reminder_lead_days: FUNDING_REMINDER_LEAD_DAYS,
      url: row.official_url ?? "https://blockid.au/funding",
      category: row.ref_kind === "grant" ? "funding_deadline" : isEvent ? "event" : "program_intake",
    });
  }

  out.sort((a, b) => a.date_start.localeCompare(b.date_start) || a.summary.localeCompare(b.summary));
  return out;
}
