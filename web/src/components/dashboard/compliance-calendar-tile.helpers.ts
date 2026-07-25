// Pure helpers for <ComplianceCalendarTile /> (P1k-nav-tile).
//
// Consumes the JSON variant of /api/compliance/calendar (?format=json)
// and returns a tile view (chip colour + label + body copy). Colour
// bands mirror the /compliance/calendar page's pickCalendarBand so the
// tile + full page never disagree on how urgent an event looks.

import type {
  ComplianceEvent,
  ComplianceEventKind,
} from "@/lib/compliance/calendar";

export type CalendarTileColour = "red" | "amber" | "emerald" | "slate";

export interface CalendarSubscribeLinks {
  webcal: string;
  https: string;
}

export interface CalendarTilePayload {
  total: number;
  next_event: ComplianceEvent | null;
  subscribe: CalendarSubscribeLinks;
}

export interface CalendarTileView {
  colour: CalendarTileColour;
  chipLabel: string;
  headline: string;
  body: string;
}

export const CALENDAR_TILE_EVENT_LABEL: Record<ComplianceEventKind, string> = {
  bas_quarter: "BAS quarter",
  asic_annual_review: "ASIC review",
  rd_registration: "R&D deadline",
  wgea_report: "WGEA report",
  modern_slavery_statement: "Modern Slavery",
};

/**
 * Whole-day difference between an ISO date (YYYY-MM-DD) and `now`, in
 * UTC. Negative when the ISO date is in the past. Returns NaN on
 * unparseable input so callers can decide the fallback.
 */
export function daysUntil(iso: string, now: Date): number {
  const target = new Date(iso + "T00:00:00Z");
  if (Number.isNaN(target.getTime())) return NaN;
  const nowUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  return Math.round(
    (target.getTime() - nowUtc.getTime()) / (24 * 60 * 60 * 1000),
  );
}

/**
 * Traffic-light band for the next-up event: overdue → red, ≤14 days →
 * amber, else emerald. Unparseable dates fall back to slate so a
 * corrupted row doesn't scream at the founder in red.
 */
export function pickCalendarTileBand(
  event: ComplianceEvent,
  now: Date,
): CalendarTileColour {
  const d = daysUntil(event.date_start, now);
  if (!Number.isFinite(d)) return "slate";
  if (d < 0) return "red";
  if (d <= 14) return "amber";
  return "emerald";
}

function formatDaysChip(days: number): string {
  if (!Number.isFinite(days)) return "Scheduled";
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Due today";
  if (days === 1) return "1d left";
  return `${days}d left`;
}

/**
 * Project the payload into a CalendarTileView. Deliberately branch on
 * (a) no payload / (b) payload with no events / (c) payload with a
 * next-up event so the founder always sees something meaningful.
 */
export function pickCalendarTileView(
  payload: CalendarTilePayload | null,
  now: Date = new Date(),
): CalendarTileView {
  if (!payload) {
    return {
      colour: "slate",
      chipLabel: "Loading…",
      headline: "Compliance calendar",
      body: "Subscribe from Google / iCal / Outlook to get every AU deadline in your calendar app.",
    };
  }
  if (!payload.next_event) {
    return {
      colour: "slate",
      chipLabel: "Nothing due",
      headline: "Compliance calendar",
      body: "No BAS / ASIC / R&D / WGEA / Modern Slavery deadlines in the next 12 months. Register for GST or log R&D to activate reminders.",
    };
  }
  const days = daysUntil(payload.next_event.date_start, now);
  const colour = pickCalendarTileBand(payload.next_event, now);
  const label = CALENDAR_TILE_EVENT_LABEL[payload.next_event.kind];
  const totalSuffix =
    payload.total > 1 ? ` (${payload.total} scheduled)` : "";
  return {
    colour,
    chipLabel: formatDaysChip(days),
    headline: `Next up: ${label}${totalSuffix}`,
    body: payload.next_event.summary,
  };
}
