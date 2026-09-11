// Deadline chips for the Money Finder report (T0244, plan §4i D-4).
//
// D-4: "Deadline colours and copy reuse the `RDStatus` ladder
// (future/open/closing_soon/last_call/overdue)" and "dates in AEST/AWST per
// user state; never blank". This module is the single place that turns a
// grant / program window into that ladder so the report page, the workspace
// tabs and the PDF all agree. Pure — no I/O, no `server-only`.
//
//   deadlineStatus(window, today)   → { status, days_until, label }
//   formatDateAu(iso, state)        → "30 Nov 2026 (AEST)" — never blank
//   DEADLINE_TONE[status]           → Tailwind ink/ground tokens for the chip
//
// Thresholds mirror rd-calendar.ts classifyStatus(): overdue < 0 days,
// last_call ≤ 30, closing_soon ≤ 60, open otherwise, future when the window
// has not opened yet. Colocated tests: deadline-status.test.ts.

import type { RDStatus } from "@/lib/compliance/rd-calendar";
import { parseLooseDate, formatLooseDate, monthShort } from "./directory";

export type DeadlineStatus = RDStatus;

export interface DeadlineWindow {
  /** ISO date (or "YYYY-MM") when applications open; null/undefined = already open or unknown. */
  opens_at?: string | null;
  /** ISO date (or "YYYY-MM") when applications close; null/undefined = rolling / unknown. */
  closes_at?: string | null;
  /** True when the scheme takes applications any time. */
  rolling?: boolean;
  /** Catalogue status — `closed` / `paused` short-circuit to overdue / future. */
  catalogue_status?: "open" | "upcoming" | "paused" | "closed" | string | null;
}

export interface DeadlineVerdict {
  status: DeadlineStatus;
  /** Days from today to the close date (negative when past); null when there is no dated close. */
  days_until: number | null;
  /** Chip copy — never empty ("Rolling — apply any time", "closes in 12 days", …). */
  label: string;
}

export const DEADLINE_LABELS: Readonly<Record<DeadlineStatus, string>> = {
  future: "Opens later",
  open: "Open",
  closing_soon: "Closing soon",
  last_call: "Last call",
  overdue: "Closed",
};

/** Ink + ground tokens per rung — same ladder the R&D calendar uses. */
export const DEADLINE_TONE: Readonly<Record<DeadlineStatus, string>> = {
  future: "border-action/30 bg-action/10 text-action",
  open: "border-bull/30 bg-bull/10 text-bull",
  closing_soon: "border-warn/30 bg-warn/10 text-warn",
  last_call: "border-bear/40 bg-bear/10 text-bear",
  overdue: "border-line bg-surface-sunken text-tertiary",
};

const DAY_MS = 24 * 60 * 60 * 1000;

function utcMidnight(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Loose date → UTC ms at midnight. Month-only dates resolve to the last day of that month (conservative for closes, first day for opens). */
function looseToUtc(v: string | null | undefined, edge: "start" | "end"): number | null {
  const d = parseLooseDate(v);
  if (!d) return null;
  if (d.day !== null) return Date.UTC(d.year, d.month - 1, d.day);
  return edge === "end" ? Date.UTC(d.year, d.month, 0) : Date.UTC(d.year, d.month - 1, 1);
}

export function daysUntil(iso: string | null | undefined, today: Date, edge: "start" | "end" = "end"): number | null {
  const target = looseToUtc(iso, edge);
  if (target === null) return null;
  return Math.round((target - utcMidnight(today)) / DAY_MS);
}

/** Classify a window on the RDStatus ladder. Never returns an empty label. */
export function deadlineStatus(win: DeadlineWindow, today: Date = new Date()): DeadlineVerdict {
  const cat = win.catalogue_status ?? null;
  if (cat === "closed") return { status: "overdue", days_until: null, label: "Closed — watch for the next round" };
  if (cat === "paused") return { status: "future", days_until: null, label: "Paused — next round not announced" };

  const opensIn = daysUntil(win.opens_at, today, "start");
  if (opensIn !== null && opensIn > 0) {
    return { status: "future", days_until: opensIn, label: `Opens ${formatLooseDate(win.opens_at)} (in ${opensIn} days)` };
  }
  if (cat === "upcoming" && win.closes_at == null) {
    return { status: "future", days_until: null, label: "Upcoming — dates to be confirmed" };
  }

  const closesIn = daysUntil(win.closes_at, today, "end");
  // Catalogue says the round has not opened yet and only the close is known:
  // it is still "future", not "open" (S10-A — the directory indexes chip
  // upcoming rows through this ladder).
  if (cat === "upcoming" && opensIn === null && closesIn !== null && closesIn >= 0) {
    return { status: "future", days_until: closesIn, label: `Upcoming — closes ${formatLooseDate(win.closes_at)}` };
  }
  if (closesIn === null) {
    return { status: "open", days_until: null, label: win.rolling === false ? "Open — close date to be confirmed" : "Rolling — apply any time" };
  }
  const closes = formatLooseDate(win.closes_at);
  if (closesIn < 0) return { status: "overdue", days_until: closesIn, label: `Closed ${closes}` };
  if (closesIn === 0) return { status: "last_call", days_until: 0, label: `Closes today (${closes})` };
  if (closesIn <= 30) return { status: "last_call", days_until: closesIn, label: `Closes in ${closesIn} day${closesIn === 1 ? "" : "s"} — ${closes}` };
  if (closesIn <= 60) return { status: "closing_soon", days_until: closesIn, label: `Closes in ${closesIn} days — ${closes}` };
  return { status: "open", days_until: closesIn, label: `Closes ${closes}` };
}

// ─── Dates in the founder's time zone (D-4) ──────────────────────────────────

/** IANA zone per state. WA = AWST, everything else = AEST (SA/NT are ACST but share the eastern working day for deadlines). */
export function timeZoneForState(state: string | null | undefined): { tz: string; abbr: "AEST" | "AWST" | "ACST" } {
  switch ((state ?? "").toUpperCase()) {
    case "WA":
      return { tz: "Australia/Perth", abbr: "AWST" };
    case "SA":
      return { tz: "Australia/Adelaide", abbr: "ACST" };
    case "NT":
      return { tz: "Australia/Darwin", abbr: "ACST" };
    case "QLD":
      return { tz: "Australia/Brisbane", abbr: "AEST" };
    default:
      return { tz: "Australia/Sydney", abbr: "AEST" };
  }
}

function partsIn(t: Date, tz: string): { y: string; m: number; d: number; hh: string; mm: string } {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: tz,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(t);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { y: get("year"), m: Number(get("month")), d: Number(get("day")), hh: get("hour").padStart(2, "0"), mm: get("minute").padStart(2, "0") };
}

/**
 * "30 Nov 2026 (AEST)" for an ISO date, "Nov 2026" for a month-only value,
 * the original text for anything else, and "Date to be confirmed" when empty —
 * a chip or table cell is never blank. Month names are our own three-letter
 * set (ICU renders "Sept" for en-AU).
 */
export function formatDateAu(iso: string | null | undefined, state?: string | null, opts: { withZone?: boolean } = {}): string {
  const s = (iso ?? "").trim();
  if (!s) return "Date to be confirmed";
  const d = parseLooseDate(s);
  if (!d) return s;
  if (d.day === null) return formatLooseDate(s);
  const { tz, abbr } = timeZoneForState(state);
  // Deadlines are calendar days in the agency's zone; render the date itself
  // in the founder's zone at noon so DST edges cannot roll it to the prior day.
  const at = new Date(Date.UTC(d.year, d.month - 1, d.day, 2, 0, 0)); // 02:00Z = 12:00 AEST / 10:00 AWST
  const p = partsIn(at, tz);
  const text = `${p.d} ${monthShort(p.m)} ${p.y}`;
  return opts.withZone === false ? text : `${text} (${abbr})`;
}

/** Full generated-at stamp in the founder's zone: "10 Sep 2026, 10:00 AEST". */
export function formatDateTimeAu(iso: string | null | undefined, state?: string | null): string {
  if (!iso) return "Date to be confirmed";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return iso;
  const { tz, abbr } = timeZoneForState(state);
  const p = partsIn(t, tz);
  return `${p.d} ${monthShort(p.m)} ${p.y}, ${p.hh === "24" ? "00" : p.hh}:${p.mm} ${abbr}`;
}
