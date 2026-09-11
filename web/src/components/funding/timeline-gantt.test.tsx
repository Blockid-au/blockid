// SSR render test for the 12-month SVG Gantt (T0244). Pins: one <g data-bar>
// per in-window item, the today marker, kind colouring via CSS vars in a
// fixed categorical order, hover <title> with the lead time, the responsive
// viewBox, month columns from `today`, the empty state, and the table twin.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TimelineItem } from "@/lib/agents/grant-advisor";
import { GANTT_KINDS, layoutBars } from "@/lib/funding/gantt-layout";
import { TimelineGantt, TimelineTable } from "./timeline-gantt";

const ITEMS: TimelineItem[] = [
  { month: "2026-10", kind: "grant", ref_id: "g1", name: "MVP Ventures", action: "Lodge the EOI", lead_time_days: 30, deadline: "2026-11-30", why: "x" },
  { month: "2026-10", kind: "tax", ref_id: "rdti", name: "R&D Tax Incentive", action: "Register activities", lead_time_days: 60, why: "y" },
  { month: "2027-02", kind: "program", ref_id: "p1", name: "Plus Eight", action: "Apply", lead_time_days: 60, deadline: "2027-03-15", why: "z" },
  { month: "2027-06", kind: "event", ref_id: "e1", name: "Demo day", action: "Pitch", lead_time_days: 7, why: "w" },
  // Outside the 12-month window (Sep 2026 → Aug 2027) — must be dropped.
  { month: "2028-01", kind: "grant", ref_id: "far", name: "Far away", action: "Wait", lead_time_days: 10, why: "v" },
];

describe("layoutBars", () => {
  it("places bars by month offset, ends at the deadline or after the lead time, and drops out-of-window items", () => {
    const { bars, hidden } = layoutBars(ITEMS, new Date(Date.UTC(2026, 8, 10)));
    expect(bars.map((b) => b.item.ref_id)).toEqual(["g1", "rdti", "p1", "e1"]);
    expect(hidden).toBe(0);
    const g1 = bars[0];
    expect(g1.x0).toBeCloseTo(1, 5); // October = column 1 from September
    expect(g1.x1).toBeCloseTo(2 + 29 / 30, 5); // 30 Nov
    const rdti = bars[1];
    expect(rdti.x1).toBeGreaterThan(rdti.x0); // 60-day lead → ~2 months wide
    expect(rdti.x1 - rdti.x0).toBeCloseTo(1.94, 1);
  });

  it("caps rows and reports the overflow", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ ...ITEMS[0], ref_id: `g${i}` }));
    const { bars, hidden } = layoutBars(many, new Date(Date.UTC(2026, 8, 10)), 24);
    expect(bars).toHaveLength(24);
    expect(hidden).toBe(6);
  });
});

describe("TimelineGantt (SVG)", () => {
  const html = renderToStaticMarkup(<TimelineGantt items={ITEMS} today="2026-09-10" state="NSW" />);

  it("renders one bar per in-window item plus the today marker", () => {
    expect(html).toContain('data-bars="4"');
    expect((html.match(/<g data-bar="true" data-kind="/g) ?? []).length).toBe(4);
    expect(html).toContain("data-today-marker");
    expect(html).toContain(">Today<");
  });

  it("is responsive inline SVG with twelve month columns starting at the report month", () => {
    expect(html).toMatch(/<svg viewBox="0 0 \d+ \d+" width="100%"/);
    expect((html.match(/data-month="/g) ?? []).length).toBe(12);
    expect(html).toContain('data-month="2026-09"');
    expect(html).toContain('data-month="2027-08"');
    expect(html).not.toContain('data-month="2027-09"');
    expect(html).toContain(">Sep 26<");
  });

  it("colours bars by kind through CSS variables with light + dark definitions, and labels the legend in text", () => {
    expect(html).toContain('fill="var(--gantt-grant)"');
    expect(html).toContain('fill="var(--gantt-tax)"');
    expect(html).toContain('fill="var(--gantt-program)"');
    expect(html).toContain('fill="var(--gantt-event)"');
    for (const k of GANTT_KINDS) {
      expect(html).toContain(`--gantt-${k.kind}:${k.light}`);
      expect(html).toContain(`--gantt-${k.kind}:${k.dark}`);
    }
    expect(html).toContain('prefers-color-scheme:dark');
    expect(html).toContain('[data-theme="dark"]');
    expect(html).toContain('data-legend="grant"');
    expect(html).toContain('data-legend="event"');
    expect(html).not.toContain('data-legend="milestone"');
    // Ink and grid use semantic tokens, not hard-coded hex.
    expect(html).toContain('fill="var(--color-primary)"');
    expect(html).toContain('stroke="var(--color-line-subtle)"');
  });

  it("carries the hover title with action, lead time and AEST deadline, and a deadline dot", () => {
    expect(html).toContain("MVP Ventures — Lodge the EOI · 30 days lead time · deadline 30 Nov 2026 (AEST)");
    expect(html).toContain("R&amp;D Tax Incentive — Register activities · 60 days lead time");
    expect((html.match(/data-deadline-dot/g) ?? []).length).toBe(2);
  });

  it("renders the empty state when nothing is dated", () => {
    const empty = renderToStaticMarkup(<TimelineGantt items={[]} today="2026-09-10" />);
    expect(empty).toContain("data-gantt-empty");
    expect(empty).not.toContain("<svg");
  });

  it("has an accessible table twin", () => {
    const table = renderToStaticMarkup(<TimelineTable items={ITEMS} state="WA" />);
    expect(table).toContain("data-timeline-table");
    // S8-B: caption + column scope so a screen reader can read the twin as a table; wrapper scrolls on 400px.
    expect(table).toContain('<caption class="sr-only">12-month funding timeline');
    expect((table.match(/<th scope="col"/g) ?? []).length).toBe(6);
    expect(table).toContain("overflow-x-auto");
    expect(table).toContain("30 Nov 2026 (AWST)");
    expect(table).toContain("Rolling");
    expect(table).toContain("Oct 2026");
  });
});
