import { describe, expect, it } from "vitest";

import { buildDigestSnapshot } from "./digest-snapshot";
import { PCT_CHANGE_MATERIAL_THRESHOLD } from "./digest-snapshot-metric-pct-change";
import { DEFAULT_MIN_STREAK_LENGTH } from "./digest-snapshot-per-reseller-direction-streaks";
import { computeDigestSnapshotPerResellerRollingTrend } from "./digest-snapshot-per-reseller-rolling-trend";
import {
  computeDigestSnapshotPerResellerMetricPersistenceScorecard,
  formatDigestSnapshotPerResellerMetricPersistenceScorecardSection,
} from "./digest-snapshot-per-reseller-metric-persistence-scorecard";

function snap(
  week: string,
  capturedAt: Date,
  envelope: Record<string, unknown>,
) {
  return buildDigestSnapshot({ capturedAt, week, envelope });
}

const T = (dayOffset: number) =>
  new Date(`2026-07-${String(6 + dayOffset).padStart(2, "0")}T02:00:00.000Z`);

function mrrRow(code: string, cents: number) {
  return { reseller_code: code, mrr_cents: cents };
}

function churnRow(code: string, count: number) {
  return { reseller_code: code, churned_count: count };
}

function mrrSnap(
  idx: number,
  rows: Array<{ reseller_code: string; mrr_cents: number }>,
) {
  return snap(`2026-W${28 + idx}`, T(idx * 7), {
    attributed_mrr: { rows },
  });
}

function bothSnap(
  idx: number,
  mrrRows: Array<{ reseller_code: string; mrr_cents: number }>,
  churnRows: Array<{ reseller_code: string; churned_count: number }>,
) {
  return snap(`2026-W${28 + idx}`, T(idx * 7), {
    attributed_mrr: { rows: mrrRows },
    attributed_churn_30d: { rows: churnRows },
  });
}

describe("computeDigestSnapshotPerResellerMetricPersistenceScorecard — shape", () => {
  it("passes through window metadata + min_streak_length + threshold", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 100)]),
      mrrSnap(1, [mrrRow("INFOVISION", 200)]),
      mrrSnap(2, [mrrRow("INFOVISION", 400)]),
    ]);
    const scorecard =
      computeDigestSnapshotPerResellerMetricPersistenceScorecard(trend);
    expect(scorecard.window_size).toBe(3);
    expect(scorecard.first_week).toBe("2026-W28");
    expect(scorecard.last_week).toBe("2026-W30");
    expect(scorecard.min_streak_length).toBe(DEFAULT_MIN_STREAK_LENGTH);
    expect(scorecard.threshold).toBe(PCT_CHANGE_MATERIAL_THRESHOLD);
  });

  it("returns zero rows on empty trend", () => {
    const scorecard =
      computeDigestSnapshotPerResellerMetricPersistenceScorecard(
        computeDigestSnapshotPerResellerRollingTrend([]),
      );
    expect(scorecard.rows).toEqual([]);
  });

  it("carries threshold override through the envelope", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 100)]),
      mrrSnap(1, [mrrRow("ACME", 200)]),
      mrrSnap(2, [mrrRow("ACME", 400)]),
    ]);
    const widened =
      computeDigestSnapshotPerResellerMetricPersistenceScorecard(
        trend,
        DEFAULT_MIN_STREAK_LENGTH,
        0.5,
      );
    expect(widened.threshold).toBe(0.5);
  });
});

describe("computeDigestSnapshotPerResellerMetricPersistenceScorecard — grouping", () => {
  it("emits one row per (metric × reseller_code) pair that qualifies on EITHER axis", () => {
    // Two partners on mrr both qualifying on direction+magnitude → expect
    // two rows keyed by (attributed_mrr × partner).
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 100), mrrRow("ZEBRA", 20)]),
      mrrSnap(1, [mrrRow("ACME", 200), mrrRow("ZEBRA", 40)]),
      mrrSnap(2, [mrrRow("ACME", 400), mrrRow("ZEBRA", 80)]),
    ]);
    const scorecard =
      computeDigestSnapshotPerResellerMetricPersistenceScorecard(trend);
    const pairs = scorecard.rows.map((r) => `${r.reseller_code}:${r.key}`);
    expect(pairs).toContain("ACME:attributed_mrr");
    expect(pairs).toContain("ZEBRA:attributed_mrr");
  });

  it("orders rows by HEADLINE_METRICS spec order primary + reseller_code asc secondary", () => {
    // Feed mrr+churn across ZEBRA/ACME/MID with both axes qualifying on both
    // metrics. Expect rows walking attributed_mrr first (spec order 0) then
    // attributed_churn_30d (spec order 1), with reseller_code asc within
    // each metric block.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(
        0,
        [
          mrrRow("ZEBRA", 10000),
          mrrRow("ACME", 10000),
          mrrRow("MID", 10000),
        ],
        [
          churnRow("ZEBRA", 40),
          churnRow("ACME", 40),
          churnRow("MID", 40),
        ],
      ),
      bothSnap(
        1,
        [
          mrrRow("ZEBRA", 13000),
          mrrRow("ACME", 13000),
          mrrRow("MID", 13000),
        ],
        [
          churnRow("ZEBRA", 30),
          churnRow("ACME", 30),
          churnRow("MID", 30),
        ],
      ),
      bothSnap(
        2,
        [
          mrrRow("ZEBRA", 17000),
          mrrRow("ACME", 17000),
          mrrRow("MID", 17000),
        ],
        [
          churnRow("ZEBRA", 20),
          churnRow("ACME", 20),
          churnRow("MID", 20),
        ],
      ),
    ]);
    const scorecard =
      computeDigestSnapshotPerResellerMetricPersistenceScorecard(trend);
    const pairs = scorecard.rows.map((r) => `${r.key}:${r.reseller_code}`);
    // attributed_mrr is at spec index 0 in HEADLINE_METRICS,
    // attributed_churn_30d is later — the mrr block sits first with
    // ACME < MID < ZEBRA within it.
    const mrrBlock = pairs.filter((p) => p.startsWith("attributed_mrr:"));
    const churnBlock = pairs.filter((p) =>
      p.startsWith("attributed_churn_30d:"),
    );
    expect(mrrBlock).toEqual([
      "attributed_mrr:ACME",
      "attributed_mrr:MID",
      "attributed_mrr:ZEBRA",
    ]);
    expect(churnBlock).toEqual([
      "attributed_churn_30d:ACME",
      "attributed_churn_30d:MID",
      "attributed_churn_30d:ZEBRA",
    ]);
    // spec ordering: mrr block precedes churn block globally
    expect(pairs.indexOf("attributed_mrr:ACME")).toBeLessThan(
      pairs.indexOf("attributed_churn_30d:ACME"),
    );
  });

  it("omits pairs missing from BOTH axes (silent skip)", () => {
    // Only ACME × attributed_mrr has data — no other pair should emit a row.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 100)]),
      mrrSnap(1, [mrrRow("ACME", 200)]),
      mrrSnap(2, [mrrRow("ACME", 400)]),
    ]);
    const scorecard =
      computeDigestSnapshotPerResellerMetricPersistenceScorecard(trend);
    expect(scorecard.rows.map((r) => `${r.reseller_code}:${r.key}`)).toEqual([
      "ACME:attributed_mrr",
    ]);
  });

  it("zero-fills the magnitude block when a pair qualifies on direction only", () => {
    // ACME × attributed_mrr moves +2% each week — sustained direction but
    // never clears the 25% amber band. Expect the direction block populated
    // and the magnitude block zero-filled so ops can see the asymmetry.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 10000)]),
      mrrSnap(1, [mrrRow("ACME", 10200)]),
      mrrSnap(2, [mrrRow("ACME", 10404)]),
      mrrSnap(3, [mrrRow("ACME", 10612)]),
    ]);
    const scorecard =
      computeDigestSnapshotPerResellerMetricPersistenceScorecard(trend);
    const row = scorecard.rows.find(
      (r) => r.reseller_code === "ACME" && r.key === "attributed_mrr",
    );
    expect(row).toBeDefined();
    expect(row!.direction.length).toBeGreaterThan(0);
    expect(row!.direction.streak_direction).toBe("up");
    expect(row!.magnitude.length).toBe(0);
    expect(row!.magnitude.max_abs_pct).toBe(0);
    expect(row!.magnitude.min_abs_pct).toBe(0);
    expect(row!.magnitude.first_week).toBe("");
    expect(row!.magnitude.last_week).toBe("");
  });

  it("zero-fills the direction block when a pair qualifies on magnitude only", () => {
    // ACME × attributed_mrr swings +30% / -30% / +30% — each transition
    // clears the 25% amber band but direction flips every week, so direction
    // never accrues a length ≥ 2 streak. Expect the magnitude block
    // populated and the direction block zero-filled.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 10000)]),
      mrrSnap(1, [mrrRow("ACME", 13000)]),
      mrrSnap(2, [mrrRow("ACME", 9100)]),
      mrrSnap(3, [mrrRow("ACME", 11830)]),
    ]);
    const scorecard =
      computeDigestSnapshotPerResellerMetricPersistenceScorecard(trend);
    const row = scorecard.rows.find(
      (r) => r.reseller_code === "ACME" && r.key === "attributed_mrr",
    );
    expect(row).toBeDefined();
    expect(row!.magnitude.length).toBeGreaterThan(0);
    expect(row!.magnitude.max_abs_pct).toBeGreaterThan(25);
    expect(row!.direction.length).toBe(0);
    expect(row!.direction.streak_direction).toBeNull();
    expect(row!.direction.cumulative_delta).toBe(0);
  });
});

describe("computeDigestSnapshotPerResellerMetricPersistenceScorecard — values", () => {
  it("mirrors upstream P11.32 direction row + P11.51 magnitude row for a pair qualifying on both axes", () => {
    // ACME × mrr triples then quadruples — a length-2 direction streak with
    // both transitions ≥ +30% clearing the 25% amber band on the magnitude
    // axis too. Expect the scorecard row's direction block = {length=2,
    // streak_direction="up"} and magnitude block = {length=2, max/min |Δ%|
    // consistent with the underlying transitions}.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 10000)]),
      mrrSnap(1, [mrrRow("ACME", 13000)]),
      mrrSnap(2, [mrrRow("ACME", 17000)]),
    ]);
    const scorecard =
      computeDigestSnapshotPerResellerMetricPersistenceScorecard(trend);
    const row = scorecard.rows.find(
      (r) => r.reseller_code === "ACME" && r.key === "attributed_mrr",
    )!;
    expect(row.direction.length).toBe(2);
    expect(row.direction.streak_direction).toBe("up");
    expect(row.direction.cumulative_delta).toBe(7000);
    expect(row.magnitude.length).toBe(2);
    expect(row.magnitude.max_abs_pct).toBeGreaterThan(25);
    expect(row.magnitude.min_abs_pct).toBeGreaterThan(25);
  });

  it("scopes rows per pair — one pair's tail does not shift another's", () => {
    // ACME × mrr: length-2 up-streak (both transitions ≥ +30%). ZEBRA ×
    // churn: length-4 down-streak (each transition ≤ -25%). Each pair's row
    // should carry its own scalars, not a pooled reduction.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(
        0,
        [mrrRow("ACME", 10000), mrrRow("ZEBRA", 5000)],
        [churnRow("ZEBRA", 40)],
      ),
      bothSnap(
        1,
        [mrrRow("ACME", 13000), mrrRow("ZEBRA", 5000)],
        [churnRow("ZEBRA", 30)],
      ),
      bothSnap(
        2,
        [mrrRow("ACME", 17000), mrrRow("ZEBRA", 5000)],
        [churnRow("ZEBRA", 20)],
      ),
      bothSnap(
        3,
        [mrrRow("ACME", 17000), mrrRow("ZEBRA", 5000)],
        [churnRow("ZEBRA", 15)],
      ),
      bothSnap(
        4,
        [mrrRow("ACME", 17000), mrrRow("ZEBRA", 5000)],
        [churnRow("ZEBRA", 10)],
      ),
    ]);
    const scorecard =
      computeDigestSnapshotPerResellerMetricPersistenceScorecard(trend);
    const acmeMrr = scorecard.rows.find(
      (r) => r.reseller_code === "ACME" && r.key === "attributed_mrr",
    )!;
    const zebraChurn = scorecard.rows.find(
      (r) => r.reseller_code === "ZEBRA" && r.key === "attributed_churn_30d",
    )!;
    expect(acmeMrr.direction.length).toBe(2);
    expect(acmeMrr.direction.streak_direction).toBe("up");
    expect(zebraChurn.direction.length).toBe(4);
    expect(zebraChurn.direction.streak_direction).toBe("down");
    expect(acmeMrr.magnitude.length).toBe(2);
    expect(zebraChurn.magnitude.length).toBe(4);
  });

  it("carries first_week + last_week + metric_name + unit into each row", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 10000)]),
      mrrSnap(1, [mrrRow("ACME", 13000)]),
      mrrSnap(2, [mrrRow("ACME", 17000)]),
    ]);
    const scorecard =
      computeDigestSnapshotPerResellerMetricPersistenceScorecard(trend);
    const row = scorecard.rows[0];
    expect(row.metric_name.length).toBeGreaterThan(0);
    expect(row.unit).toBe("cents");
    expect(row.direction.first_week).toBe("2026-W28");
    expect(row.direction.last_week).toBe("2026-W30");
    expect(row.magnitude.first_week).toBe("2026-W28");
    expect(row.magnitude.last_week).toBe("2026-W30");
  });
});

describe("formatDigestSnapshotPerResellerMetricPersistenceScorecardSection", () => {
  it("returns '' when window_size < 3", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 100)]),
      mrrSnap(1, [mrrRow("ACME", 200)]),
    ]);
    const scorecard =
      computeDigestSnapshotPerResellerMetricPersistenceScorecard(trend);
    expect(
      formatDigestSnapshotPerResellerMetricPersistenceScorecardSection(
        scorecard,
      ),
    ).toBe("");
  });

  it("returns '' when zero rows qualify", () => {
    const scorecard =
      computeDigestSnapshotPerResellerMetricPersistenceScorecard(
        computeDigestSnapshotPerResellerRollingTrend([]),
      );
    expect(
      formatDigestSnapshotPerResellerMetricPersistenceScorecardSection(
        scorecard,
      ),
    ).toBe("");
  });

  it("renders a single consolidated table with a twin-block header + per-pair rows + threshold caption", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 10000), mrrRow("ZEBRA", 5000)]),
      mrrSnap(1, [mrrRow("ACME", 13000), mrrRow("ZEBRA", 6500)]),
      mrrSnap(2, [mrrRow("ACME", 17000), mrrRow("ZEBRA", 8500)]),
    ]);
    const scorecard =
      computeDigestSnapshotPerResellerMetricPersistenceScorecard(trend);
    const html =
      formatDigestSnapshotPerResellerMetricPersistenceScorecardSection(
        scorecard,
      );
    expect(html).toContain("<table");
    const tableCount = (html.match(/<table/g) ?? []).length;
    expect(tableCount).toBe(1);
    expect(html).toContain("Direction axis");
    expect(html).toContain("Magnitude axis");
    expect(html).toContain("P11.32");
    expect(html).toContain("P11.51");
    expect(html).toContain("ACME");
    expect(html).toContain("ZEBRA");
    const thresholdPct = (PCT_CHANGE_MATERIAL_THRESHOLD * 100).toFixed(1);
    expect(html).toContain(`${thresholdPct}%`);
  });

  it("HTML-escapes reseller_code + metric_name + week labels", () => {
    // Fabricate a scorecard with an XSS-y reseller_code + metric_name to
    // ensure the formatter escapes them.
    const scorecard = {
      window_size: 3,
      first_week: "2026-W28",
      last_week: "2026-W30",
      min_streak_length: 2,
      threshold: PCT_CHANGE_MATERIAL_THRESHOLD,
      rows: [
        {
          reseller_code: "<script>alert(1)</script>",
          key: "attributed_mrr" as const,
          metric_name: "MRR & <b>bold</b>",
          unit: "cents" as const,
          direction: {
            length: 2,
            streak_direction: "up" as const,
            first_week: "2026-W28",
            last_week: "2026-W30",
            cumulative_delta: 7000,
          },
          magnitude: {
            length: 2,
            first_week: "2026-W28",
            last_week: "2026-W30",
            max_abs_pct: 30.8,
            min_abs_pct: 30,
          },
        },
      ],
    };
    const html =
      formatDigestSnapshotPerResellerMetricPersistenceScorecardSection(
        scorecard,
      );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("MRR &amp; &lt;b&gt;bold&lt;/b&gt;");
  });

  it("renders cumulative delta as A$ dollars for cents-unit metrics", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 10000)]),
      mrrSnap(1, [mrrRow("ACME", 13000)]),
      mrrSnap(2, [mrrRow("ACME", 17000)]),
    ]);
    const scorecard =
      computeDigestSnapshotPerResellerMetricPersistenceScorecard(trend);
    const html =
      formatDigestSnapshotPerResellerMetricPersistenceScorecardSection(
        scorecard,
      );
    expect(html).toContain("+A$70.00");
  });
});
