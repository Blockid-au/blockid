// G35 Pricing v5 P4 — Verified review SLA clock (plan §2 D29, §6.6).
//
// Pure, client-safe. The SLA itself (`report_orders.sla_due_at`) is stamped by
// the webhook / worker with `verifiedSlaDueAt()` (lib/time/au-business-days.ts:
// end of the Nth Sydney business day, NSW holidays excluded). This module only
// READS that instant and answers the questions the admin queue and the SLA
// cron ask of it:
//
//   slaState(due, now)        overdue | due_soon | on_track | no_sla
//   businessMsBetween(a, b)   working time between two instants — Sydney
//                             business days only, 09:00–17:00 local
//   businessDaysLeft(due, now) whole Sydney business days after today up to
//                             and including the due day (0 = due today)
//   describeSla(due, now)     one human line ("Overdue by 1 business day",
//                             "Due today · 3h 20m business time left", …)
//   formatSydney(at)          "Wed 22 Oct, 11:59 pm AEDT"
//
// "Due soon" = at most DUE_SOON_BUSINESS_MS (4 business hours) of business
// time left — on the due day itself that is from 13:00 Sydney.

import { isSydneyBusinessDay, sydneyDateKey } from "@/lib/time/au-business-days";

const TZ = "Australia/Sydney";
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** Sydney business hours used for "business time left" (local, 24 h clock). */
export const BUSINESS_DAY_START_HOUR = 9;
export const BUSINESS_DAY_END_HOUR = 17;
/** Within this much business time of the deadline an order is "due soon". */
export const DUE_SOON_BUSINESS_MS = 4 * HOUR_MS;

export type SlaState = "overdue" | "due_soon" | "on_track" | "no_sla";

/** Parse an ISO string / Date; null for anything that is not a real instant. */
export function toInstant(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string" || value.trim() === "") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const keyParts = (k: string): [number, number, number] => k.split("-").map(Number) as [number, number, number];
const shiftKey = (k: string, days: number): string => {
  const [y, m, d] = keyParts(k);
  const t = new Date(Date.UTC(y, m - 1, d) + days * DAY_MS);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
};

/** UTC instant of a Sydney wall-clock time on `YYYY-MM-DD` (DST-aware; 0 ≤ hour ≤ 23). */
export function sydneyInstant(dateKey: string, hour: number, minute = 0): Date {
  const [y, m, d] = keyParts(dateKey);
  const want = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  for (const offset of [11, 10]) {
    const guess = new Date(Date.UTC(y, m - 1, d, hour - offset, minute));
    if (sydneyDateKey(guess) === dateKey && fmt.format(guess) === want) return guess;
  }
  return new Date(Date.UTC(y, m - 1, d, hour - 10, minute));
}

/**
 * Business time (ms) in [from, to): the overlap with 09:00–17:00 Sydney on
 * every Sydney business day. 0 when `to <= from`.
 */
export function businessMsBetween(from: Date, to: Date, extraHolidays: readonly string[] = []): number {
  if (!(to.getTime() > from.getTime())) return 0;
  let total = 0;
  let k = sydneyDateKey(from);
  const last = sydneyDateKey(to);
  // Bounded walk: an SLA never spans more than a few weeks; cap at ~2 years.
  for (let i = 0; i < 800; i++) {
    if (isSydneyBusinessDay(k, extraHolidays)) {
      const open = sydneyInstant(k, BUSINESS_DAY_START_HOUR).getTime();
      const close = sydneyInstant(k, BUSINESS_DAY_END_HOUR).getTime();
      const a = Math.max(open, from.getTime());
      const b = Math.min(close, to.getTime());
      if (b > a) total += b - a;
    }
    if (k === last) break;
    k = shiftKey(k, 1);
  }
  return total;
}

/**
 * Whole Sydney business days strictly after `now`'s Sydney date up to and
 * including the due date: 0 = due today (or overdue today), 1 = due on the
 * next business day, … Negative when the due date is already behind today
 * (−1 = due on the previous business day).
 */
export function businessDaysLeft(due: Date, now: Date, extraHolidays: readonly string[] = []): number {
  const today = sydneyDateKey(now);
  const dueKey = sydneyDateKey(due);
  if (dueKey === today) return 0;
  // Count business days in the half-open interval (from, to] of date keys.
  const countAfter = (from: string, to: string): number => {
    let k = from;
    let n = 0;
    for (let i = 0; i < 800 && k !== to; i++) {
      k = shiftKey(k, 1);
      if (isSydneyBusinessDay(k, extraHolidays)) n++;
    }
    return n;
  };
  return dueKey > today ? countAfter(today, dueKey) : -countAfter(dueKey, today);
}

export function slaState(due: Date | null, now: Date, extraHolidays: readonly string[] = []): SlaState {
  if (!due) return "no_sla";
  if (now.getTime() > due.getTime()) return "overdue";
  return businessMsBetween(now, due, extraHolidays) <= DUE_SOON_BUSINESS_MS ? "due_soon" : "on_track";
}

const SYDNEY_FMT = new Intl.DateTimeFormat("en-AU", {
  timeZone: TZ,
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZoneName: "short",
});

/** "Wed 22 Oct, 11:59 pm AEDT" — the deadline as the reviewer reads it. */
export function formatSydney(at: Date): string {
  return SYDNEY_FMT.format(at).replace(/\s+/g, " ");
}

/** "3h 20m" / "45m" from milliseconds (floored to the minute). */
export function formatDuration(ms: number): string {
  const mins = Math.max(0, Math.floor(ms / 60_000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

export interface SlaSummary {
  state: SlaState;
  /** ISO of `sla_due_at` (null when the order has none). */
  dueAt: string | null;
  /** "Wed 22 Oct, 11:59 pm AEDT" (null when no SLA). */
  dueLabel: string | null;
  /** See `businessDaysLeft` (null when no SLA). */
  businessDaysLeft: number | null;
  /** Business time left before the deadline (0 once overdue). */
  businessMsLeft: number;
  /** Wall-clock ms past the deadline (0 when not overdue). */
  overdueMs: number;
  /** One line for the queue ("Overdue by 1 business day", "Due today · 3h 20m business time left"). */
  line: string;
}

export function describeSla(dueRaw: unknown, now: Date, extraHolidays: readonly string[] = []): SlaSummary {
  const due = toInstant(dueRaw);
  if (!due) {
    return { state: "no_sla", dueAt: null, dueLabel: null, businessDaysLeft: null, businessMsLeft: 0, overdueMs: 0, line: "No SLA recorded" };
  }
  const state = slaState(due, now, extraHolidays);
  const days = businessDaysLeft(due, now, extraHolidays);
  const businessMsLeft = state === "overdue" ? 0 : businessMsBetween(now, due, extraHolidays);
  const overdueMs = state === "overdue" ? now.getTime() - due.getTime() : 0;
  let line: string;
  if (state === "overdue") {
    const late = -days;
    line = late >= 1 ? `Overdue by ${late} business day${late === 1 ? "" : "s"}` : `Overdue by ${formatDuration(overdueMs)}`;
  } else if (days === 0) {
    line = `Due today · ${formatDuration(businessMsLeft)} business time left`;
  } else if (state === "due_soon") {
    line = `Due soon · ${formatDuration(businessMsLeft)} business time left`;
  } else {
    line = `${days} business day${days === 1 ? "" : "s"} left`;
  }
  return { state, dueAt: due.toISOString(), dueLabel: formatSydney(due), businessDaysLeft: days, businessMsLeft, overdueMs, line };
}
