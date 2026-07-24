import { describe, expect, it } from "vitest";

import {
  cohortCellColour,
  computeWeeklyCohortRetention,
  DEFAULT_COHORT_COUNT,
  DEFAULT_WEEK_COUNT,
  MIN_COHORT_BUCKETS,
  renderCohortRetentionSvg,
} from "./cohort-chart";

// Reference week Monday 2026-07-20 00:00 UTC — this is the "now" the tests
// pin so cohort week arithmetic is deterministic across machines.
const REFERENCE = new Date("2026-07-24T14:00:00Z"); // Friday in W2026-07-20

function iso(daysBack: number, hoursIntoDay = 12): string {
  const d = new Date(REFERENCE.getTime());
  d.setUTCDate(d.getUTCDate() - daysBack);
  d.setUTCHours(hoursIntoDay, 0, 0, 0);
  return d.toISOString();
}

describe("computeWeeklyCohortRetention (P5-cohort)", () => {
  it("buckets signups into Monday-anchored cohort weeks and drops empty weeks", () => {
    const matrix = computeWeeklyCohortRetention(
      [
        { user_id: "u1", signup_iso: iso(35) }, // 5 weeks ago
        { user_id: "u2", signup_iso: iso(35) },
        { user_id: "u3", signup_iso: iso(21) }, // 3 weeks ago
        { user_id: "u4", signup_iso: iso(7) }, //  1 week ago
      ],
      [],
      { reference_date: REFERENCE },
    );
    expect(matrix.reference_week_iso).toBe("2026-07-20");
    expect(matrix.cohorts.map((c) => c.cohort_week_iso)).toEqual([
      "2026-06-15", // 5 weeks back
      "2026-06-29", // 3 weeks back
      "2026-07-13", // 1 week back
    ]);
    expect(matrix.cohorts[0].size).toBe(2);
    expect(matrix.cohorts[1].size).toBe(1);
    expect(matrix.cohort_count).toBe(3);
    expect(matrix.meets_min_buckets).toBe(false); // 3 < MIN_COHORT_BUCKETS (4)
  });

  it("earliest signup wins when the same user_id appears twice", () => {
    const matrix = computeWeeklyCohortRetention(
      [
        { user_id: "u1", signup_iso: iso(21) },
        { user_id: "u1", signup_iso: iso(7) }, // later — must be ignored
      ],
      [],
      { reference_date: REFERENCE },
    );
    expect(matrix.cohorts).toHaveLength(1);
    expect(matrix.cohorts[0].cohort_week_iso).toBe("2026-06-29");
    expect(matrix.cohorts[0].size).toBe(1);
  });

  it("computes retention decimals for present activity + zero for absent", () => {
    // 4 users all in cohort 5 weeks ago (2026-06-15). u1 comes back every week,
    // u2 comes back weeks 0 + 2, u3 comes back only week 0, u4 comes back never.
    const cohortDay = 35;
    const signups = ["u1", "u2", "u3", "u4"].map((user_id) => ({
      user_id,
      signup_iso: iso(cohortDay),
    }));
    const activities = [
      // week 0 (same as signup week)
      { user_id: "u1", activity_iso: iso(cohortDay) },
      { user_id: "u2", activity_iso: iso(cohortDay) },
      { user_id: "u3", activity_iso: iso(cohortDay) },
      // week 1
      { user_id: "u1", activity_iso: iso(cohortDay - 7) },
      // week 2
      { user_id: "u1", activity_iso: iso(cohortDay - 14) },
      { user_id: "u2", activity_iso: iso(cohortDay - 14) },
      // week 3
      { user_id: "u1", activity_iso: iso(cohortDay - 21) },
    ];
    const matrix = computeWeeklyCohortRetention(signups, activities, {
      reference_date: REFERENCE,
      week_count: 6,
    });
    expect(matrix.cohorts).toHaveLength(1);
    const row = matrix.cohorts[0];
    expect(row.size).toBe(4);
    // W0=3/4, W1=1/4, W2=2/4, W3=1/4, W4=0/4, W5=0/4
    expect(row.retention[0]).toBeCloseTo(0.75, 5);
    expect(row.retention[1]).toBeCloseTo(0.25, 5);
    expect(row.retention[2]).toBeCloseTo(0.5, 5);
    expect(row.retention[3]).toBeCloseTo(0.25, 5);
    expect(row.retention[4]).toBe(0);
    expect(row.retention[5]).toBe(0);
  });

  it("returns null (not 0) for weeks that have not elapsed yet for young cohorts", () => {
    // Cohort is *this* week (0 days back) — only W0 is defined, W1..N are null.
    const matrix = computeWeeklyCohortRetention(
      [
        { user_id: "u1", signup_iso: iso(0) },
        { user_id: "u2", signup_iso: iso(0) },
      ],
      [{ user_id: "u1", activity_iso: iso(0) }],
      { reference_date: REFERENCE, week_count: 4 },
    );
    expect(matrix.cohorts).toHaveLength(1);
    expect(matrix.cohorts[0].retention[0]).toBeCloseTo(0.5, 5);
    expect(matrix.cohorts[0].retention[1]).toBeNull();
    expect(matrix.cohorts[0].retention[2]).toBeNull();
    expect(matrix.cohorts[0].retention[3]).toBeNull();
  });

  it("drops signups outside the trailing cohort_count window", () => {
    const matrix = computeWeeklyCohortRetention(
      [
        { user_id: "u_old", signup_iso: iso(200) }, // way before window
        { user_id: "u_recent", signup_iso: iso(7) },
      ],
      [],
      { reference_date: REFERENCE, cohort_count: 4 },
    );
    expect(matrix.cohorts).toHaveLength(1);
    expect(matrix.cohorts[0].cohort_week_iso).toBe("2026-07-13");
  });

  it("tolerates malformed input rows without throwing", () => {
    const matrix = computeWeeklyCohortRetention(
      [
        { user_id: "u1", signup_iso: "not-a-date" },
        { user_id: "", signup_iso: iso(7) },
        { user_id: "u2", signup_iso: iso(7) },
      ],
      [
        { user_id: "u2", activity_iso: "also-not-a-date" },
        { user_id: "", activity_iso: iso(7) },
        { user_id: "u2", activity_iso: iso(7) },
      ],
      { reference_date: REFERENCE },
    );
    expect(matrix.cohorts).toHaveLength(1);
    expect(matrix.cohorts[0].size).toBe(1);
    expect(matrix.cohorts[0].retention[0]).toBeCloseTo(1, 5);
  });

  it("flips meets_min_buckets true once >= 4 consecutive cohorts have signups", () => {
    const matrix = computeWeeklyCohortRetention(
      [7, 14, 21, 28, 35].map((daysBack, i) => ({
        user_id: `u${i}`,
        signup_iso: iso(daysBack),
      })),
      [],
      { reference_date: REFERENCE },
    );
    expect(matrix.cohort_count).toBe(5);
    expect(matrix.meets_min_buckets).toBe(true);
  });

  it("exposes stable default constants", () => {
    expect(MIN_COHORT_BUCKETS).toBe(4);
    expect(DEFAULT_COHORT_COUNT).toBe(8);
    expect(DEFAULT_WEEK_COUNT).toBe(8);
  });
});

describe("cohortCellColour (P5-cohort)", () => {
  it("maps the six retention bands to distinct hex fills", () => {
    expect(cohortCellColour(null)).toBe("#e2e8f0"); // null = truncated
    expect(cohortCellColour(0)).toBe("#f1f5f9"); // zero
    expect(cohortCellColour(0.1)).toBe("#fecaca"); // < 20
    expect(cohortCellColour(0.3)).toBe("#fed7aa"); // 20-40
    expect(cohortCellColour(0.5)).toBe("#fde68a"); // 40-60
    expect(cohortCellColour(0.7)).toBe("#bbf7d0"); // 60-80
    expect(cohortCellColour(0.9)).toBe("#86efac"); // 80+
    expect(cohortCellColour(NaN)).toBe("#e2e8f0"); // NaN tolerated
  });
});

describe("renderCohortRetentionSvg (P5-cohort)", () => {
  it("renders one <rect> per cell plus one % label per non-null cell", () => {
    const matrix = computeWeeklyCohortRetention(
      [
        { user_id: "u1", signup_iso: iso(14) },
        { user_id: "u2", signup_iso: iso(14) },
      ],
      [
        { user_id: "u1", activity_iso: iso(14) },
        { user_id: "u2", activity_iso: iso(14) },
        { user_id: "u1", activity_iso: iso(7) },
      ],
      { reference_date: REFERENCE, week_count: 4 },
    );
    const svg = renderCohortRetentionSvg(matrix);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    // 1 cohort × 4 columns = 4 cells → 4 <rect> for cells + 1 outer bg <rect>
    const rectCount = (svg.match(/<rect /g) ?? []).length;
    expect(rectCount).toBe(5);
    // W0 = 100%, W1 = 50%, W2 = null (not elapsed → 2 weeks-elapsed so W2
    // IS elapsed → 0/2 = 0%), W3 = null.
    expect(svg).toContain(">100%<");
    expect(svg).toContain(">50%<");
    // Cohort label + size chip render exactly once.
    expect(svg).toContain(matrix.cohorts[0].cohort_week_iso);
    expect(svg).toContain("n=2");
  });

  it("shows the empty-state hint when the matrix has no cohorts", () => {
    const svg = renderCohortRetentionSvg(
      computeWeeklyCohortRetention([], [], { reference_date: REFERENCE }),
    );
    expect(svg).toContain("No cohort data yet");
    expect(svg).toContain(`${MIN_COHORT_BUCKETS} weeks of signups`);
  });

  it("shows the below-min-signal hint when < MIN_COHORT_BUCKETS cohorts exist", () => {
    const matrix = computeWeeklyCohortRetention(
      [
        { user_id: "u1", signup_iso: iso(14) },
        { user_id: "u2", signup_iso: iso(7) },
      ],
      [],
      { reference_date: REFERENCE },
    );
    const svg = renderCohortRetentionSvg(matrix);
    expect(matrix.meets_min_buckets).toBe(false);
    expect(svg).toContain("Signal below investor threshold");
    // Investor-threshold hint should not appear when meets_min_buckets = true.
    const okMatrix = computeWeeklyCohortRetention(
      [7, 14, 21, 28].map((d, i) => ({ user_id: `u${i}`, signup_iso: iso(d) })),
      [],
      { reference_date: REFERENCE },
    );
    expect(renderCohortRetentionSvg(okMatrix)).not.toContain(
      "Signal below investor threshold",
    );
  });

  it("scales width + height with cell + padding options", () => {
    const matrix = computeWeeklyCohortRetention(
      [{ user_id: "u1", signup_iso: iso(7) }],
      [],
      { reference_date: REFERENCE, week_count: 5 },
    );
    const wide = renderCohortRetentionSvg(matrix, {
      cell_width: 80,
      cell_height: 40,
      padding_left: 200,
      padding_top: 60,
      title: "Custom cohort chart",
    });
    expect(wide).toContain("Custom cohort chart");
    // width = 200 + 80*5 + 16 = 616
    expect(wide).toMatch(/width="616"/);
  });
});
