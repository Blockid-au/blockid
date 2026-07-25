// Pure helpers for the /compliance/calendar founder-facing view.
//
// Sits alongside the WGEA / Modern Slavery / GST detail-page helpers
// under web/src/app/compliance/*. The view consumes ComplianceEvent[]
// already produced server-side by buildComplianceCalendar() — this
// module only handles presentation shaping (grouping, labels, band).

import type {
  ComplianceEvent,
  ComplianceEventKind,
} from "@/lib/compliance/calendar";

export const EVENT_KIND_LABEL: Record<ComplianceEventKind, string> = {
  bas_quarter: "BAS quarter",
  asic_annual_review: "ASIC annual review",
  rd_registration: "R&D Tax Incentive",
  wgea_report: "WGEA public report",
  modern_slavery_statement: "Modern Slavery statement",
};

export const EVENT_KIND_HELP_ROUTE: Record<ComplianceEventKind, string> = {
  bas_quarter: "/compliance/gst",
  asic_annual_review: "/guide/11-scale",
  rd_registration: "/compliance/rd",
  wgea_report: "/compliance/wgea",
  modern_slavery_statement: "/compliance/modern-slavery",
};

export type CalendarBand = "green" | "amber" | "red";

/**
 * Whole-day difference between `iso` (YYYY-MM-DD) and `now`, in UTC.
 * Negative when the ISO date is in the past. Returns NaN on unparseable
 * input so callers can decide the fallback.
 */
export function daysUntil(iso: string, now: Date): number {
  const target = new Date(iso + "T00:00:00Z");
  if (Number.isNaN(target.getTime())) return NaN;
  const nowUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const ms = target.getTime() - nowUtc.getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

/**
 * Traffic-light band for a compliance event based on how close the due
 * date is. Overdue (< 0) is red because a missed BAS / ASIC / R&D
 * deadline triggers ATO / ASIC / AusIndustry action. 0-14 days is amber
 * (within the reminder window). Everything further out is green.
 * Unparseable dates fall back to green so a corrupted row does not
 * scream at the founder in red.
 */
export function pickCalendarBand(event: ComplianceEvent, now: Date): CalendarBand {
  const d = daysUntil(event.date_start, now);
  if (!Number.isFinite(d)) return "green";
  if (d < 0) return "red";
  if (d <= 14) return "amber";
  return "green";
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/**
 * "28 Oct 2026 (Wed)" — enough for a founder scanning the list to know
 * which weekday the deadline lands on without reaching for a calendar
 * app. Returns the raw ISO string when unparseable so the row still
 * renders (no silent drops).
 */
export function formatDueDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return iso;
  const day = d.getUTCDate();
  const month = MONTH_NAMES[d.getUTCMonth()]?.slice(0, 3) ?? "";
  const year = d.getUTCFullYear();
  const weekday = WEEKDAY_NAMES[d.getUTCDay()] ?? "";
  return `${day} ${month} ${year} (${weekday})`;
}

export interface CalendarMonthGroup {
  /** YYYY-MM sortable key. */
  monthKey: string;
  /** "October 2026". */
  monthLabel: string;
  events: ComplianceEvent[];
}

/**
 * Group events by (year, month) so the founder-facing list can render
 * one section per month. Ordering follows the ISO date_start so the
 * caller's sort is preserved inside each group. Unparseable dates
 * fall through into an `unknown` bucket rather than being dropped.
 */
export function groupByMonth(
  events: readonly ComplianceEvent[],
): CalendarMonthGroup[] {
  const groups = new Map<string, CalendarMonthGroup>();
  for (const ev of events) {
    const d = new Date(ev.date_start + "T00:00:00Z");
    let monthKey: string;
    let monthLabel: string;
    if (Number.isNaN(d.getTime())) {
      monthKey = "unknown";
      monthLabel = "Unscheduled";
    } else {
      const y = d.getUTCFullYear();
      const m = d.getUTCMonth();
      monthKey = `${y}-${String(m + 1).padStart(2, "0")}`;
      monthLabel = `${MONTH_NAMES[m]} ${y}`;
    }
    let group = groups.get(monthKey);
    if (!group) {
      group = { monthKey, monthLabel, events: [] };
      groups.set(monthKey, group);
    }
    group.events.push(ev);
  }
  return [...groups.values()].sort((a, b) => {
    if (a.monthKey === "unknown") return 1;
    if (b.monthKey === "unknown") return -1;
    return a.monthKey.localeCompare(b.monthKey);
  });
}

/**
 * The single most-imminent event (soonest future or overdue) — used to
 * feed a "Next up" callout at the top of the calendar page. Returns
 * null when the input is empty. Ties broken by summary alphabetical
 * order so the output is stable across renders.
 */
export function pickNextEvent(
  events: readonly ComplianceEvent[],
  now: Date,
): ComplianceEvent | null {
  if (events.length === 0) return null;
  const sorted = [...events].sort((a, b) => {
    const dateCmp = a.date_start.localeCompare(b.date_start);
    if (dateCmp !== 0) return dateCmp;
    return a.summary.localeCompare(b.summary);
  });
  // Prefer the first non-overdue event; only fall back to the oldest
  // overdue row when everything on the calendar has already passed.
  const upcoming = sorted.find((ev) => daysUntil(ev.date_start, now) >= 0);
  return upcoming ?? sorted[0] ?? null;
}

/**
 * Build the founder-facing calendar subscribe URL. `webcal://` prefix
 * makes Google Calendar / iCal / Outlook offer a one-click subscribe;
 * https:// fallback is exposed separately so the founder can paste it
 * into tools that only accept https feed URLs.
 */
export function buildSubscribeUrl(base: string): {
  webcal: string;
  https: string;
} {
  const trimmed = (base ?? "").trim().replace(/\/+$/, "");
  const httpsBase = trimmed.startsWith("http://")
    ? trimmed
    : trimmed.startsWith("https://")
      ? trimmed
      : `https://${trimmed || "blockid.au"}`;
  const httpsUrl = `${httpsBase}/api/compliance/calendar`;
  const webcalUrl = httpsUrl.replace(/^https?:\/\//, "webcal://");
  return { webcal: webcalUrl, https: httpsUrl };
}
