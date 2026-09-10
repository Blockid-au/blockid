// Colocated tests for the A$3 → Founder Radar upsell facts (T0247).
// Fixture timeline: one grant closing in 81 days, a tax action with no
// deadline, one program next quarter, one program this quarter, one past.

import { describe, expect, it } from "vitest";
import type { TimelineItem } from "@/lib/agents/grant-advisor";
import {
  EMPTY_RADAR_FACTS,
  SCOUT_SIGNUP_HREF,
  computeRadarUpsellFacts,
  founderRadarSignupHref,
  radarViewerKind,
} from "./radar-upsell";

const TODAY = "2026-09-10";

const TIMELINE: TimelineItem[] = [
  { month: "2026-10", kind: "grant", ref_id: "g1", name: "MVP Ventures", action: "Lodge the EOI", lead_time_days: 30, deadline: "2026-11-30", why: "x" },
  { month: "2026-10", kind: "tax", ref_id: "rdti", name: "R&D Tax Incentive", action: "Register activities", lead_time_days: 60, why: "y" },
  { month: "2027-02", kind: "program", ref_id: "p1", name: "Plus Eight", action: "Apply", lead_time_days: 60, deadline: "2027-03-15", why: "z" },
  { month: "2026-11", kind: "program", ref_id: "p2", name: "Startmate Fellowship", action: "Apply", lead_time_days: 30, why: "w" },
  { month: "2026-09", kind: "program", ref_id: "p2", name: "Startmate Fellowship", action: "Info session", lead_time_days: 0, why: "w" },
  { month: "2026-08", kind: "grant", ref_id: "g0", name: "Closed Grant", action: "Missed", lead_time_days: 0, deadline: "2026-08-01", why: "v" },
];

describe("computeRadarUpsellFacts", () => {
  it("picks the earliest deadline still ahead and counts distinct rounds in the next three months", () => {
    const facts = computeRadarUpsellFacts(TIMELINE, TODAY);
    expect(facts.next_program).toEqual({ name: "MVP Ventures", ref_id: "g1", days: 81 });
    // Sep/Oct/Nov window: g1 (excluded — it is the next program), p2 (twice, counted once).
    // p1 is Feb, g0 is Aug, rdti is tax.
    expect(facts.quarter_count).toBe(1);
  });

  it("skips a deadline that has already passed and treats today as 0 days", () => {
    const facts = computeRadarUpsellFacts(
      [
        { month: "2026-09", kind: "grant", ref_id: "a", name: "Today", action: "Lodge", lead_time_days: 0, deadline: TODAY, why: "" },
        { month: "2026-09", kind: "grant", ref_id: "b", name: "Yesterday", action: "Lodge", lead_time_days: 0, deadline: "2026-09-09", why: "" },
      ],
      TODAY,
    );
    expect(facts.next_program).toEqual({ name: "Today", ref_id: "a", days: 0 });
  });

  it("falls back to empty facts for an empty / missing timeline or a bad today", () => {
    expect(computeRadarUpsellFacts([], TODAY)).toEqual(EMPTY_RADAR_FACTS);
    expect(computeRadarUpsellFacts(null, TODAY)).toEqual(EMPTY_RADAR_FACTS);
    expect(computeRadarUpsellFacts(undefined, TODAY)).toEqual(EMPTY_RADAR_FACTS);
    expect(computeRadarUpsellFacts(TIMELINE, "nope")).toEqual(EMPTY_RADAR_FACTS);
  });

  it("returns no next program but still counts rounds when nothing carries a hard deadline", () => {
    const facts = computeRadarUpsellFacts(
      [
        { month: "2026-10", kind: "program", ref_id: "p1", name: "A", action: "Apply", lead_time_days: 0, why: "" },
        { month: "2026-11", kind: "program", ref_id: "p2", name: "B", action: "Apply", lead_time_days: 0, why: "" },
        { month: "2027-01", kind: "program", ref_id: "p3", name: "C", action: "Apply", lead_time_days: 0, why: "" },
      ],
      TODAY,
    );
    expect(facts.next_program).toBeNull();
    expect(facts.quarter_count).toBe(2);
  });

  it("accepts a Date for today and rolls the three-month window across a year boundary", () => {
    const facts = computeRadarUpsellFacts(
      [
        { month: "2026-12", kind: "program", ref_id: "p1", name: "A", action: "Apply", lead_time_days: 0, why: "" },
        { month: "2027-01", kind: "program", ref_id: "p2", name: "B", action: "Apply", lead_time_days: 0, why: "" },
        { month: "2027-02", kind: "program", ref_id: "p3", name: "C", action: "Apply", lead_time_days: 0, why: "" },
        { month: "2027-03", kind: "program", ref_id: "p4", name: "D", action: "Apply", lead_time_days: 0, why: "" },
      ],
      new Date("2026-12-20T10:00:00Z"),
    );
    expect(facts.quarter_count).toBe(3);
  });
});

describe("radarViewerKind + CTA targets", () => {
  it("guest / founder / evaluator by segment or plan prefix", () => {
    expect(radarViewerKind(null)).toBe("guest");
    expect(radarViewerKind(undefined)).toBe("guest");
    expect(radarViewerKind({ plan: "free" })).toBe("founder");
    expect(radarViewerKind({ plan: "founder_starter", segment: "founder" })).toBe("founder");
    expect(radarViewerKind({ plan: "investor_angel" })).toBe("evaluator");
    expect(radarViewerKind({ plan: "accelerator_growth" })).toBe("evaluator");
    expect(radarViewerKind({ plan: "free", segment: "investor" })).toBe("evaluator");
    expect(radarViewerKind({ plan: "free", segment: "advisor" })).toBe("evaluator");
  });

  it("builds the approved signup links", () => {
    expect(founderRadarSignupHref("funding_report")).toBe("/signup?plan=founder_starter&trial=1&from=funding_report");
    expect(SCOUT_SIGNUP_HREF).toBe("/signup?segment=evaluator&plan=investor_angel");
  });
});
