// Pure layout for the 12-month funding Gantt (T0244). Shared by the SVG
// component (components/funding/timeline-gantt.tsx) and the PDF renderer
// (lib/pdf/funding-report-pdf.tsx), which draws the same bars as Views.
// No React, no I/O. Colocated tests: gantt-layout.test.ts.

import type { TimelineItem } from "@/lib/agents/grant-advisor";
import { monthShort } from "./directory";

export type TimelineKind = TimelineItem["kind"];

/** Fixed categorical order — never re-assigned when a kind is absent. */
export const GANTT_KINDS: ReadonlyArray<{ kind: TimelineKind; label: string; light: string; dark: string }> = [
  { kind: "grant", label: "Grant", light: "#2a78d6", dark: "#3987e5" },
  { kind: "program", label: "Program", light: "#eb6834", dark: "#d95926" },
  { kind: "tax", label: "Tax / incentive", light: "#1baf7a", dark: "#199e70" },
  { kind: "event", label: "Event", light: "#4a3aa7", dark: "#9085e9" },
  { kind: "milestone", label: "Milestone", light: "#e87ba4", dark: "#d55181" },
];

export const GANTT_MONTHS = 12;
const MONTHS = GANTT_MONTHS;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface GanttBar {
  item: TimelineItem;
  row: number;
  /** Fractional month offsets inside the window (0..12). */
  x0: number;
  x1: number;
  clippedRight: boolean;
}

export function ganttToday(v: string | Date | null | undefined): Date {
  if (v instanceof Date) return v;
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    const [y, m, d] = v.slice(0, 10).split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Months (fractional) from the window start to a UTC instant. */
export function monthOffset(windowStart: Date, t: number): number {
  const y0 = windowStart.getUTCFullYear();
  const m0 = windowStart.getUTCMonth();
  const d = new Date(t);
  const whole = (d.getUTCFullYear() - y0) * 12 + (d.getUTCMonth() - m0);
  const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return whole + (d.getUTCDate() - 1) / daysInMonth;
}

export function ganttWindow(today: Date): { start: Date; months: { key: string; label: string }[] } {
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const months = Array.from({ length: MONTHS }, (_, i) => {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    const m = d.getUTCMonth() + 1;
    return {
      key: `${d.getUTCFullYear()}-${String(m).padStart(2, "0")}`,
      label: m === 1 || i === 0 ? `${monthShort(m)} ${String(d.getUTCFullYear()).slice(2)}` : monthShort(m),
    };
  });
  return { start, months };
}

/** Pure layout — exported so the test can pin bar geometry without parsing SVG. */
export function layoutBars(items: TimelineItem[], today: Date, maxRows = 24): { bars: GanttBar[]; hidden: number } {
  const { start } = ganttWindow(today);
  const sorted = [...items].sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
  const bars: GanttBar[] = [];
  for (const item of sorted) {
    const m = /^(\d{4})-(\d{2})/.exec(item.month);
    if (!m) continue;
    const actStart = Date.UTC(Number(m[1]), Number(m[2]) - 1, 1);
    let x0 = monthOffset(start, actStart);
    let end: number;
    if (item.deadline && /^\d{4}-\d{2}/.test(item.deadline)) {
      const [y, mo, d] = item.deadline.slice(0, 10).split("-").map(Number);
      end = Date.UTC(y, mo - 1, d || new Date(Date.UTC(y, mo, 0)).getUTCDate());
    } else {
      end = actStart + Math.max(14, item.lead_time_days || 0) * DAY_MS;
    }
    let x1 = monthOffset(start, end);
    if (x1 <= x0) x1 = x0 + 0.5;
    if (x1 < 0 || x0 > MONTHS) continue; // entirely outside the window
    const clippedRight = x1 > MONTHS;
    x0 = Math.max(0, x0);
    x1 = Math.min(MONTHS, x1);
    bars.push({ item, row: bars.length, x0, x1, clippedRight });
  }
  const hidden = Math.max(0, bars.length - maxRows);
  return { bars: bars.slice(0, maxRows), hidden };
}
