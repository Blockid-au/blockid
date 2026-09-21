import { describe, expect, it } from "vitest";
import { calibrationHistoryLine, computeCalibration, confidenceBand, sviBand, wilson95, type CalibrationOutcomeInput, type CalibrationSnapshotInput } from "./compute";
import { calibrationStatusFrom, isCalibrationReport } from "./latest";

const NOW = new Date("2026-09-20T00:00:00.000Z");
const META = { sviVersion: "2.2.0", gitSha: "abc1234" };

describe("bands + Wilson (G21 P3-A)", () => {
  it("cut-points match the report bands", () => {
    expect([sviBand(0), sviBand(39), sviBand(40), sviBand(69), sviBand(70), sviBand(100)]).toEqual(["early", "early", "developing", "developing", "strong", "strong"]);
    expect([confidenceBand(10), confidenceBand(40), confidenceBand(70)]).toEqual(["low", "mid", "high"]);
  });

  it("Wilson 95 %: known values, clamped to [0, 1], null for n = 0", () => {
    expect(wilson95(0, 0)).toBeNull();
    const w = wilson95(15, 30)!;
    expect(w.low).toBeCloseTo(0.3311, 3);
    expect(w.high).toBeCloseTo(0.6689, 3);
    const zero = wilson95(0, 30)!;
    expect(zero.low).toBe(0);
    expect(zero.high).toBeGreaterThan(0);
    const all = wilson95(30, 30)!;
    expect(all.high).toBe(1);
  });
});

function snaps(prefix: string, n: number, date: string, svi: number, stage: number, confidence: number | null = 50): CalibrationSnapshotInput[] {
  return Array.from({ length: n }, (_, i) => ({ project_id: `${prefix}-${i}`, snapshot_date: date, svi_total: svi, evidence_confidence: confidence, stage }));
}
function outcomes(prefix: string, ids: number[], date: string, kind = "funding_raised", status = "confirmed"): CalibrationOutcomeInput[] {
  return ids.map((i) => ({ project_id: `${prefix}-${i}`, kind, observed_at: date, status }));
}

describe("computeCalibration", () => {
  it("nothing in → empty totals, no cohorts, limitations verbatim, no forbidden words anywhere in the JSON", () => {
    const r = computeCalibration({ snapshots: [], outcomes: [], now: NOW }, META);
    expect(r.totals).toEqual({ companies_with_snapshot: 0, companies_eligible: 0, companies_with_outcome: 0, confirmed_outcomes: 0, cohorts_total: 0, cohorts_published: 0, cohorts_suppressed: 0 });
    expect(r.cohorts).toEqual([]);
    expect(r.limitations.length).toBeGreaterThanOrEqual(5);
    expect(JSON.stringify(r)).not.toMatch(/predict|prediction|accura/i);
    expect(r).toMatchObject({ method_version: "1.0.0", svi_version: "2.2.0", git_sha: "abc1234", horizon_days: 90 });
  });

  it("a cohort under 10 companies is suppressed (counted, rates null); companies younger than the horizon are excluded from the denominator", () => {
    const young = snaps("y", 5, "2026-09-01", 50, 2); // 19 days old → not eligible
    const old = snaps("o", 6, "2026-01-15", 50, 2); // eligible, cohort 2026-Q1 stage 2 → 6 < 10 → suppressed
    const r = computeCalibration({ snapshots: [...young, ...old], outcomes: outcomes("o", [0, 1], "2026-06-01"), now: NOW }, META);
    expect(r.totals.companies_with_snapshot).toBe(11);
    expect(r.totals.companies_eligible).toBe(6);
    expect(r.totals.cohorts_total).toBe(1);
    expect(r.totals.cohorts_suppressed).toBe(1);
    const c = r.cohorts[0]!;
    expect(c).toMatchObject({ period: "2026-Q1", stage: 2, companies: 6, positives: 2, published: false, outcome_rate: null, ci95: null });
    for (const b of c.by_svi_band) expect(b.rate).toBeNull();
  });

  it("published cohort: T0 = earliest snapshot in the quarter, positive = confirmed outcome ≥ 90 d after T0 (proposed / rejected / too-early ignored), rates per SVI band with indicative labels 10–29 and Wilson CI ≥ 30, per-kind counts", () => {
    // 2026-Q1 stage 2: 30 strong companies (12 positive), 12 developing (3 positive), 4 early (0) → 46 companies
    const strong = snaps("s", 30, "2026-01-10", 75, 2, 80);
    const developing = snaps("d", 12, "2026-02-01", 55, 2, 50);
    const early = snaps("e", 4, "2026-03-01", 20, 2, null);
    // a later snapshot in the same quarter must not move T0 (earliest wins)
    const later = [{ project_id: "s-0", snapshot_date: "2026-03-20", svi_total: 10, evidence_confidence: 5, stage: 2 }];
    const outs = [
      ...outcomes("s", Array.from({ length: 12 }, (_, i) => i), "2026-06-01"),
      ...outcomes("d", [0, 1, 2], "2026-07-01", "grant_success"),
      ...outcomes("d", [3], "2026-02-15"), // only 14 days after T0 → not counted
      ...outcomes("d", [4], "2026-07-01", "survival", "proposed"),
      ...outcomes("e", [0], "2026-08-01", "next_stage", "rejected"),
    ];
    const r = computeCalibration({ snapshots: [...strong, ...developing, ...early, ...later], outcomes: outs, now: NOW }, META);
    expect(r.totals).toMatchObject({ companies_with_snapshot: 46, companies_eligible: 46, companies_with_outcome: 15, confirmed_outcomes: 16, cohorts_published: 1, cohorts_suppressed: 0 });
    const c = r.cohorts[0]!;
    expect(c).toMatchObject({ key: "2026-Q1|2", companies: 46, positives: 15, published: true });
    expect(c.outcome_rate).toBeCloseTo(15 / 46, 4);
    expect(c.ci95).not.toBeNull();
    const [e, d, s] = c.by_svi_band;
    expect(s).toMatchObject({ band: "strong", n: 30, positives: 12, rate: 0.4, publication: "benchmark" });
    expect(s!.ci95).not.toBeNull();
    expect(s!.label).toBe("40% (n = 30)");
    expect(d).toMatchObject({ band: "developing", n: 12, positives: 3, rate: 0.25, publication: "indicative", ci95: null });
    expect(d!.label).toBe("25% indicative (n = 12)");
    expect(e).toMatchObject({ band: "early", n: 4, positives: 0, rate: null, publication: "none" });
    expect(e!.label).toBe("not enough companies (n = 4)");
    // confidence bands only over the 42 companies whose T0 carries a confidence
    expect(c.companies_with_confidence).toBe(42);
    const high = c.by_confidence_band.find((b) => b.band === "high")!;
    expect(high).toMatchObject({ n: 30, positives: 12 });
    expect(c.outcomes_by_kind).toEqual({ funding_raised: 12, grant_success: 3 });
  });

  it("cohorts are stage × quarter, sorted by period then stage; a company appears once per quarter", () => {
    const a = snaps("a", 10, "2026-01-05", 50, 1);
    const b = snaps("b", 10, "2026-01-05", 50, 3);
    const c = snaps("c", 10, "2025-10-05", 50, 1);
    const r = computeCalibration({ snapshots: [...a, ...b, ...c], outcomes: [], now: NOW }, META);
    expect(r.cohorts.map((x) => x.key)).toEqual(["2025-Q4|1", "2026-Q1|1", "2026-Q1|3"]);
    expect(r.cohorts.every((x) => x.published)).toBe(true);
    expect(r.cohorts.every((x) => x.outcome_rate === 0)).toBe(true);
  });

  it("history line + latest helpers", () => {
    const r = computeCalibration({ snapshots: [], outcomes: [], now: NOW }, META);
    expect(JSON.parse(calibrationHistoryLine(r))).toMatchObject({ generated_at: NOW.toISOString(), cohorts_published: 0 });
    expect(isCalibrationReport(r)).toBe(true);
    expect(isCalibrationReport({})).toBe(false);
    expect(calibrationStatusFrom(null)).toBe("missing");
    expect(calibrationStatusFrom(r, NOW.getTime() + 1000)).toBe("ok");
    expect(calibrationStatusFrom(r, NOW.getTime() + 9 * 24 * 3600 * 1000)).toBe("stale");
  });
});
