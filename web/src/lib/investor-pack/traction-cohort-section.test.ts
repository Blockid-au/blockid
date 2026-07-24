// P5-cohort-wire — pin the investor-pack traction cohort section shape.
// Ensures the pack surface stays in lockstep with cohort-chart.ts (the
// underlying computation module) without a special-case branch in the
// pack assembler for empty inputs, sub-min-signal cohorts, or investor-
// grade retention curves.

import { describe, it, expect } from "vitest";
import {
  buildTractionCohortSection,
  INVESTOR_GRADE_WEEK1_MIN,
  MIN_COHORT_BUCKETS,
  TRACTION_COHORT_DISCLAIMER,
} from "./traction-cohort-section";
import type {
  ActivityEvent,
  SignupEvent,
} from "@/lib/traction/cohort-chart";

// Reference date fixed on a Monday so cohort-week arithmetic is
// predictable across environments.
const REFERENCE = new Date("2026-07-20T00:00:00Z"); // Monday

function iso(daysAgo: number): string {
  return new Date(REFERENCE.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
}

describe("buildTractionCohortSection", () => {
  it("returns an empty-state envelope when both inputs are empty", () => {
    const section = buildTractionCohortSection({
      cohort_options: { reference_date: REFERENCE },
    });
    expect(section.empty_state).toBe(true);
    expect(section.matrix.cohorts).toHaveLength(0);
    expect(section.summary.cohorts_present).toBe(0);
    expect(section.summary.meets_min_buckets).toBe(false);
    expect(section.summary.best_cohort_iso).toBeNull();
    expect(section.summary.best_week1_retention).toBeNull();
    expect(section.investor_grade).toBe(false);
    // SVG must still render the empty-state hint so the pack does not
    // have to special-case zero cohorts.
    expect(section.svg).toContain("No cohort data yet");
    expect(section.svg).toContain(`${MIN_COHORT_BUCKETS} weeks`);
  });

  it("attaches the fixed AFSL/accuracy disclaimer on every render", () => {
    const emptySection = buildTractionCohortSection({
      cohort_options: { reference_date: REFERENCE },
    });
    const populatedSection = buildTractionCohortSection({
      signups: [{ user_id: "u1", signup_iso: iso(14) }],
      activities: [{ user_id: "u1", activity_iso: iso(14) }],
      cohort_options: { reference_date: REFERENCE },
    });
    expect(emptySection.disclaimer).toBe(TRACTION_COHORT_DISCLAIMER);
    expect(populatedSection.disclaimer).toBe(TRACTION_COHORT_DISCLAIMER);
    // Sanity — disclaimer names cross-check as expected by investors.
    expect(TRACTION_COHORT_DISCLAIMER).toMatch(/stripe/i);
  });

  it("marks investor_grade=false when fewer than MIN_COHORT_BUCKETS cohorts", () => {
    const signups: SignupEvent[] = [
      { user_id: "u1", signup_iso: iso(21) },
      { user_id: "u2", signup_iso: iso(14) },
    ];
    const activities: ActivityEvent[] = [
      { user_id: "u1", activity_iso: iso(21) },
      { user_id: "u1", activity_iso: iso(14) }, // week 1 retained
      { user_id: "u2", activity_iso: iso(14) },
    ];
    const section = buildTractionCohortSection({
      signups,
      activities,
      cohort_options: { reference_date: REFERENCE },
    });
    expect(section.summary.cohorts_present).toBeLessThan(MIN_COHORT_BUCKETS);
    expect(section.summary.meets_min_buckets).toBe(false);
    expect(section.investor_grade).toBe(false);
    // SVG should surface the below-min hint.
    expect(section.svg).toContain("below investor threshold");
  });

  it("marks investor_grade=true with 4+ cohorts and week-1 retention >= floor", () => {
    // Four cohorts (weeks -28, -21, -14, -7). Each cohort has 4 users;
    // week-1 retention = 3/4 = 0.75, well above INVESTOR_GRADE_WEEK1_MIN.
    const signups: SignupEvent[] = [];
    const activities: ActivityEvent[] = [];
    for (const daysAgo of [28, 21, 14, 7]) {
      const cohortUsers = [`u-${daysAgo}-a`, `u-${daysAgo}-b`, `u-${daysAgo}-c`, `u-${daysAgo}-d`];
      for (const u of cohortUsers) {
        signups.push({ user_id: u, signup_iso: iso(daysAgo) });
        activities.push({ user_id: u, activity_iso: iso(daysAgo) });
      }
      // 3 of 4 come back the following week (7 days later).
      const nextWeekDaysAgo = daysAgo - 7;
      if (nextWeekDaysAgo >= 0) {
        for (const u of cohortUsers.slice(0, 3)) {
          activities.push({ user_id: u, activity_iso: iso(nextWeekDaysAgo) });
        }
      }
    }
    const section = buildTractionCohortSection({
      signups,
      activities,
      cohort_options: { reference_date: REFERENCE },
    });
    expect(section.summary.cohorts_present).toBeGreaterThanOrEqual(MIN_COHORT_BUCKETS);
    expect(section.summary.meets_min_buckets).toBe(true);
    // The most-recent cohort (7 days ago) hasn't had a week-1 window
    // yet — but the three older cohorts should all report 0.75.
    expect(section.summary.best_week1_retention).toBeGreaterThanOrEqual(INVESTOR_GRADE_WEEK1_MIN);
    expect(section.investor_grade).toBe(true);
    // Best cohort should be an ISO date in YYYY-MM-DD form.
    expect(section.summary.best_cohort_iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("average_week_retention only averages cohorts that reached each week", () => {
    // Two cohorts: one that has had W0 and W1, one that lives in the
    // reference week itself (weeksElapsed=0 → W1 is null, not a false
    // zero) so the average helper must skip it at W1.
    const signups: SignupEvent[] = [
      { user_id: "old-1", signup_iso: iso(14) },
      { user_id: "new-1", signup_iso: iso(0) }, // reference-week cohort
    ];
    const activities: ActivityEvent[] = [
      { user_id: "old-1", activity_iso: iso(14) }, // W0 (old cohort)
      { user_id: "old-1", activity_iso: iso(7) }, // W1 (old cohort)
      { user_id: "new-1", activity_iso: iso(0) }, // W0 (new cohort)
    ];
    const section = buildTractionCohortSection({
      signups,
      activities,
      cohort_options: { reference_date: REFERENCE, week_count: 4 },
    });
    // W0: both cohorts contribute (both = 1.0). Average = 1.
    expect(section.summary.average_week_retention[0]).toBe(1);
    // W1: new cohort is null (weeksElapsed=0), only old contributes.
    // Old cohort came back in W1 → retention 1, avg = 1.
    expect(section.summary.average_week_retention[1]).toBe(1);
    // W2: new cohort is still null; old has no W2 activity → 0. Avg = 0.
    expect(section.summary.average_week_retention[2]).toBe(0);
    // W3: neither cohort has reached W3 yet → null skip both → avg=null.
    expect(section.summary.average_week_retention[3]).toBeNull();
  });

  it("passes svg_options through to the renderer (custom title)", () => {
    const section = buildTractionCohortSection({
      signups: [{ user_id: "u1", signup_iso: iso(14) }],
      activities: [{ user_id: "u1", activity_iso: iso(14) }],
      cohort_options: { reference_date: REFERENCE },
      svg_options: { title: "PMF signal (Chapter 5)" },
    });
    expect(section.svg).toContain("PMF signal (Chapter 5)");
    expect(section.svg.startsWith("<svg")).toBe(true);
  });
});
