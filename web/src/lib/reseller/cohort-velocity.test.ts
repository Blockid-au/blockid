import { describe, expect, it } from "vitest";
import {
  COHORT_MONTHS_WINDOW,
  cohortMonthKey,
  computeCohortVelocity,
  computeCohortVelocityByReseller,
  formatWeeklyDigestCohortVelocitySection,
  recentCohortKeys,
  type ActivationEventRow,
  type AttributionCohortRow,
  type CohortVelocityRow,
} from "./cohort-velocity";

const NOW = new Date("2026-07-24T12:00:00.000Z");

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();
}

function attr(
  reseller_id: string,
  subject_user_id: string,
  agoDays: number,
): AttributionCohortRow {
  return {
    reseller_id,
    subject_user_id,
    attributed_at: daysAgo(agoDays),
  };
}

function evt(user_id: string, agoDays: number): ActivationEventRow {
  return { user_id, generated_at: daysAgo(agoDays) };
}

describe("COHORT_MONTHS_WINDOW", () => {
  it("locks the digest window at 3 UTC months", () => {
    expect(COHORT_MONTHS_WINDOW).toBe(3);
  });
});

describe("cohortMonthKey", () => {
  it("returns YYYY-MM zero-padded in UTC", () => {
    expect(cohortMonthKey(new Date("2026-07-24T12:00:00.000Z"))).toBe("2026-07");
    expect(cohortMonthKey(new Date("2026-01-01T00:00:00.000Z"))).toBe("2026-01");
    expect(cohortMonthKey(new Date("2026-12-31T23:59:59.000Z"))).toBe("2026-12");
  });
});

describe("recentCohortKeys", () => {
  it("returns 3 keys newest-first ending at the current UTC month", () => {
    expect(recentCohortKeys(NOW)).toEqual(["2026-07", "2026-06", "2026-05"]);
  });

  it("crosses year boundaries correctly", () => {
    const jan = new Date("2026-01-15T00:00:00.000Z");
    expect(recentCohortKeys(jan)).toEqual(["2026-01", "2025-12", "2025-11"]);
  });

  it("honours a caller-supplied count", () => {
    expect(recentCohortKeys(NOW, 1)).toEqual(["2026-07"]);
    expect(recentCohortKeys(NOW, 5)).toHaveLength(5);
  });
});

describe("computeCohortVelocity", () => {
  it("returns zeros when the cohort has no attribution rows", () => {
    const v = computeCohortVelocity("2026-07", [], new Map());
    expect(v.cohort_month).toBe("2026-07");
    expect(v.attributed_count).toBe(0);
    expect(v.activated_count).toBe(0);
    expect(v.activation_pct).toBe(0);
    expect(v.median_days_to_activation).toBeNull();
  });

  it("counts attributed customers and computes activation percent as integer floor", () => {
    const activations = new Map<string, number>([
      ["u1", Date.parse(daysAgo(2))],
      ["u2", Date.parse(daysAgo(1))],
    ]);
    const v = computeCohortVelocity(
      "2026-07",
      [attr("r1", "u1", 10), attr("r1", "u2", 5), attr("r1", "u3", 3)],
      activations,
    );
    expect(v.attributed_count).toBe(3);
    expect(v.activated_count).toBe(2);
    expect(v.activation_pct).toBe(66); // floor(2*100/3)
  });

  it("collapses duplicate attributions for the same user_id inside a cohort", () => {
    const v = computeCohortVelocity(
      "2026-07",
      [attr("r1", "u1", 10), attr("r1", "u1", 8), attr("r1", "u1", 5)],
      new Map(),
    );
    expect(v.attributed_count).toBe(1);
    expect(v.activated_count).toBe(0);
  });

  it("medianises days from attribution to first activation across activated users", () => {
    const activations = new Map<string, number>([
      ["u1", Date.parse(daysAgo(8))], // attributed 10d ago, activated 8d ago → 2d
      ["u2", Date.parse(daysAgo(2))], // attributed 5d ago, activated 2d ago → 3d
      ["u3", Date.parse(daysAgo(0))], // attributed 3d ago, activated now → 3d
    ]);
    const v = computeCohortVelocity(
      "2026-07",
      [attr("r1", "u1", 10), attr("r1", "u2", 5), attr("r1", "u3", 3)],
      activations,
    );
    // Sorted deltas: [2, 3, 3] → nearest-rank median at ceil(3/2)-1 = 1 → 3
    expect(v.median_days_to_activation).toBe(3);
  });

  it("treats activation that predates attribution as a 0-day delta", () => {
    const activations = new Map<string, number>([
      ["u1", Date.parse(daysAgo(20))], // activated 20d ago
    ]);
    const v = computeCohortVelocity(
      "2026-07",
      [attr("r1", "u1", 5)], // attributed 5d ago
      activations,
    );
    expect(v.median_days_to_activation).toBe(0);
    expect(v.activated_count).toBe(1);
  });

  it("returns null median when no user in the cohort has activated", () => {
    const v = computeCohortVelocity(
      "2026-07",
      [attr("r1", "u1", 5), attr("r1", "u2", 2)],
      new Map(),
    );
    expect(v.median_days_to_activation).toBeNull();
    expect(v.activated_count).toBe(0);
  });

  it("drops rows with unparseable attributed_at", () => {
    const v = computeCohortVelocity(
      "2026-07",
      [
        {
          reseller_id: "r1",
          subject_user_id: "u1",
          attributed_at: "not-a-date",
        },
      ],
      new Map(),
    );
    expect(v.attributed_count).toBe(0);
  });
});

describe("computeCohortVelocityByReseller", () => {
  it("buckets attributions by attributed_at UTC month and returns one row per requested cohort", () => {
    const attributions: AttributionCohortRow[] = [
      attr("r1", "u1", 3), // 2026-07
      attr("r1", "u2", 35), // 2026-06
      attr("r2", "u3", 5), // 2026-07
      attr("r2", "u4", 70), // 2026-05
    ];
    const activations: ActivationEventRow[] = [
      evt("u1", 1),
      evt("u4", 65),
    ];
    const map = computeCohortVelocityByReseller(
      ["r1", "r2"],
      recentCohortKeys(NOW),
      attributions,
      activations,
    );
    const r1 = map.get("r1");
    const r2 = map.get("r2");
    expect(r1?.cohorts.map((c) => c.cohort_month)).toEqual([
      "2026-07",
      "2026-06",
      "2026-05",
    ]);
    expect(r1?.cohorts[0].attributed_count).toBe(1);
    expect(r1?.cohorts[1].attributed_count).toBe(1);
    expect(r1?.cohorts[2].attributed_count).toBe(0);
    expect(r2?.cohorts[0].attributed_count).toBe(1);
    expect(r2?.cohorts[2].attributed_count).toBe(1);
    expect(r2?.cohorts[2].activated_count).toBe(1);
  });

  it("returns zero-cohort rows for a reseller with no attributions", () => {
    const map = computeCohortVelocityByReseller(
      ["r1"],
      recentCohortKeys(NOW),
      [],
      [],
    );
    const r1 = map.get("r1");
    expect(r1?.cohorts).toHaveLength(3);
    expect(r1?.cohorts.every((c) => c.attributed_count === 0)).toBe(true);
  });

  it("drops attribution rows for a reseller not in the requested set", () => {
    const map = computeCohortVelocityByReseller(
      ["r1"],
      ["2026-07"],
      [attr("r1", "u1", 3), attr("r2", "u9", 3)],
      [],
    );
    expect(map.has("r2")).toBe(false);
    expect(map.get("r1")?.cohorts[0].attributed_count).toBe(1);
  });

  it("takes the earliest activation per user when multiple svi_analyses exist", () => {
    const attributions = [attr("r1", "u1", 10)];
    const activations: ActivationEventRow[] = [
      evt("u1", 3),
      evt("u1", 8),
      evt("u1", 5),
    ];
    const map = computeCohortVelocityByReseller(
      ["r1"],
      ["2026-07"],
      attributions,
      activations,
    );
    // Earliest activation is 8d ago; attribution 10d ago → 2-day delta
    expect(map.get("r1")?.cohorts[0].median_days_to_activation).toBe(2);
  });

  it("drops activation rows with unparseable generated_at", () => {
    const attributions = [attr("r1", "u1", 5)];
    const activations: ActivationEventRow[] = [
      { user_id: "u1", generated_at: "not-a-date" },
    ];
    const map = computeCohortVelocityByReseller(
      ["r1"],
      ["2026-07"],
      attributions,
      activations,
    );
    expect(map.get("r1")?.cohorts[0].activated_count).toBe(0);
  });

  it("collapses duplicate attributions across attempts inside the same cohort", () => {
    const attributions = [
      attr("r1", "u1", 3),
      attr("r1", "u1", 4),
      attr("r1", "u1", 5),
    ];
    const map = computeCohortVelocityByReseller(
      ["r1"],
      ["2026-07"],
      attributions,
      [],
    );
    expect(map.get("r1")?.cohorts[0].attributed_count).toBe(1);
  });
});

describe("formatWeeklyDigestCohortVelocitySection", () => {
  const rows: CohortVelocityRow[] = [
    {
      reseller_id: "r-info",
      reseller_code: "INFOVISION",
      reseller_display_name: "InfoVision",
      cohorts: [
        {
          cohort_month: "2026-07",
          attributed_count: 3,
          activated_count: 2,
          activation_pct: 66,
          median_days_to_activation: 3,
        },
        {
          cohort_month: "2026-06",
          attributed_count: 0,
          activated_count: 0,
          activation_pct: 0,
          median_days_to_activation: null,
        },
        {
          cohort_month: "2026-05",
          attributed_count: 1,
          activated_count: 0,
          activation_pct: 0,
          median_days_to_activation: null,
        },
      ],
    },
  ];

  it("returns empty string for empty input", () => {
    expect(formatWeeklyDigestCohortVelocitySection([])).toBe("");
  });

  it("renders the section header with the window constant", () => {
    const html = formatWeeklyDigestCohortVelocitySection(rows);
    expect(html).toContain(`Cohort velocity (last ${COHORT_MONTHS_WINDOW} UTC months)`);
    expect(html).toContain("<th>Code</th>");
    expect(html).toContain("<th>Display name</th>");
    expect(html).toContain("<th>Cohort</th>");
    expect(html).toContain("<th>Attributed</th>");
    expect(html).toContain("<th>Activated</th>");
    expect(html).toContain("<th>Activation %</th>");
    expect(html).toContain("<th>Median days</th>");
  });

  it("renders one row per (reseller × cohort) with the cohort month cell", () => {
    const html = formatWeeklyDigestCohortVelocitySection(rows);
    expect(html).toContain("2026-07");
    expect(html).toContain("2026-06");
    expect(html).toContain("2026-05");
    // Three cohort rows for the single reseller
    expect(html.match(/<tr>[\s\S]*?<\/tr>/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("only stamps the code + display name on the first cohort row per reseller", () => {
    const html = formatWeeklyDigestCohortVelocitySection(rows);
    expect((html.match(/INFOVISION/g) ?? []).length).toBe(1);
    expect((html.match(/InfoVision/g) ?? []).length).toBe(1);
  });

  it("renders — for null median and — for zero-attribution activation percent", () => {
    const html = formatWeeklyDigestCohortVelocitySection(rows);
    // 2026-06 cohort has attributed_count=0 → activation renders as —
    expect(html).toContain("&mdash;");
  });

  it("sorts resellers by reseller_code", () => {
    const two: CohortVelocityRow[] = [
      { ...rows[0], reseller_code: "ZED", reseller_display_name: "Zed" },
      { ...rows[0], reseller_code: "ALPHA", reseller_display_name: "Alpha" },
    ];
    const html = formatWeeklyDigestCohortVelocitySection(two);
    const alphaIdx = html.indexOf("ALPHA");
    const zedIdx = html.indexOf("ZED");
    expect(alphaIdx).toBeGreaterThan(-1);
    expect(zedIdx).toBeGreaterThan(alphaIdx);
  });

  it("HTML-escapes the display name and cohort key", () => {
    const html = formatWeeklyDigestCohortVelocitySection([
      {
        reseller_id: "r-x",
        reseller_code: "XSS",
        reseller_display_name: "<script>alert(1)</script>",
        cohorts: [
          {
            cohort_month: "<x>",
            attributed_count: 1,
            activated_count: 0,
            activation_pct: 0,
            median_days_to_activation: null,
          },
        ],
      },
    ]);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&lt;x&gt;");
  });

  it("renders integer percent and integer days without a decimal point", () => {
    const html = formatWeeklyDigestCohortVelocitySection(rows);
    expect(html).toMatch(/>66%</);
    expect(html).toMatch(/>3</);
    expect(html).not.toMatch(/\d\.\d/);
  });
});
