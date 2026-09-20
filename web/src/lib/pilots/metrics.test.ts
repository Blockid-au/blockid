// pilots/metrics — the pilot success-metric schema, merge rule and checklist (G21 P2-C).
import { describe, expect, it } from "vitest";
import { PILOT_SUCCESS_METRICS } from "@/lib/pricing/pilot-skus";
import { PILOT_METRIC_FIELDS, PILOT_METRIC_KEYS, checklistFromMetrics, mergePilotMetrics, parsePilotMetrics, pilotChecklist, readPilotMetrics, reviewTimeSaving } from "./metrics";

describe("parsePilotMetrics", () => {
  it("accepts a partial body, rejects unknown keys and out-of-range values with the field path", () => {
    const ok = parsePilotMetrics({ review_minutes_before: 60, review_minutes_after: 20, evaluator_consistency: 4, repeat_intent: true, wtp_annual_band: "5k_10k", case_study_consent: false });
    expect(ok.ok).toBe(true);
    const unknown = parsePilotMetrics({ nps: 9 });
    expect(unknown.ok).toBe(false);
    const range = parsePilotMetrics({ satisfaction: 7 });
    expect(range.ok).toBe(false);
    if (!range.ok) expect(range.issues[0].path).toBe("satisfaction");
    const pct = parsePilotMetrics({ evidence_completion_pct: 140 });
    expect(pct.ok).toBe(false);
    const band = parsePilotMetrics({ wtp_annual_band: "lots" });
    expect(band.ok).toBe(false);
    expect(parsePilotMetrics({ notes: "x".repeat(2001) }).ok).toBe(false);
  });

  it("every offer metric line has at least one form field; the form keys are the schema keys", () => {
    const groups = new Set(PILOT_METRIC_FIELDS.map((f) => f.group));
    for (const line of PILOT_SUCCESS_METRICS) expect(groups.has(line), line).toBe(true);
    expect(PILOT_METRIC_FIELDS.map((f) => f.key)).toEqual([...PILOT_METRIC_KEYS]);
  });
});

describe("mergePilotMetrics + readPilotMetrics", () => {
  it("only the sent keys change; null clears; unknown stored keys survive; updated_at stamped", () => {
    const stored = { review_minutes_before: 60, satisfaction: 4, legacy: "keep" };
    const merged = mergePilotMetrics(stored, { review_minutes_after: 20, satisfaction: null }, "2026-09-20T00:00:00.000Z");
    expect(merged).toEqual({ review_minutes_before: 60, review_minutes_after: 20, legacy: "keep", updated_at: "2026-09-20T00:00:00.000Z" });
    expect(readPilotMetrics(merged)).toEqual({ review_minutes_before: 60, review_minutes_after: 20 });
    expect(readPilotMetrics({ satisfaction: "bad" })).toEqual({});
    expect(readPilotMetrics(null)).toEqual({});
  });

  it("reviewTimeSaving needs both sides", () => {
    expect(reviewTimeSaving({ review_minutes_before: 60 })).toBeNull();
    expect(reviewTimeSaving({ review_minutes_before: 60, review_minutes_after: 18 })).toEqual({ before: 60, after: 18, pct: 70 });
    expect(reviewTimeSaving({ review_minutes_before: 0, review_minutes_after: 18 })).toBeNull();
  });
});

describe("pilotChecklist", () => {
  it("five steps in delivery order with data-derived ticks", () => {
    const none = pilotChecklist({ orderPaid: false, intakeLinks: 0, submissions: 0, scored: 0, decided: 0, workshopCaptured: false, reportDone: false });
    expect(none.map((i) => i.key)).toEqual(["setup", "intake", "assessment", "workshop", "report"]);
    expect(none.every((i) => !i.done)).toBe(true);
    const mid = checklistFromMetrics({ evaluator_consistency: 4 }, { orderPaid: true, intakeLinks: 1, submissions: 8, scored: 8, decided: 3 }, false);
    expect(mid.map((i) => i.done)).toEqual([true, true, true, true, false]);
    const done = checklistFromMetrics({ repeat_intent: true, renewal_intent: false }, { orderPaid: true, intakeLinks: 1, submissions: 8, scored: 8, decided: 8 }, false);
    expect(done[4].done).toBe(true);
    expect(done[3].done).toBe(false);
  });
});
