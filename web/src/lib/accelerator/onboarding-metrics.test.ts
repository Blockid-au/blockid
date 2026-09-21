// accelerator/onboarding-metrics — the Cohort onboarding success-metric schema, merge rule and checklist (G21 P2-C, re-based by G25).
import { describe, expect, it } from "vitest";
import { COHORT_SUCCESS_METRICS } from "@/lib/accelerator/cohort-offer";
import { ONBOARDING_METRIC_FIELDS, ONBOARDING_METRIC_KEYS, checklistFromMetrics, mergeOnboardingMetrics, parseOnboardingMetrics, onboardingChecklist, readOnboardingMetrics, reviewTimeSaving } from "./onboarding-metrics";

describe("parseOnboardingMetrics", () => {
  it("accepts a partial body, rejects unknown keys and out-of-range values with the field path", () => {
    const ok = parseOnboardingMetrics({ review_minutes_before: 60, review_minutes_after: 20, evaluator_consistency: 4, repeat_intent: true, wtp_annual_band: "5k_10k", case_study_consent: false });
    expect(ok.ok).toBe(true);
    const unknown = parseOnboardingMetrics({ nps: 9 });
    expect(unknown.ok).toBe(false);
    const range = parseOnboardingMetrics({ satisfaction: 7 });
    expect(range.ok).toBe(false);
    if (!range.ok) expect(range.issues[0].path).toBe("satisfaction");
    const pct = parseOnboardingMetrics({ evidence_completion_pct: 140 });
    expect(pct.ok).toBe(false);
    const band = parseOnboardingMetrics({ wtp_annual_band: "lots" });
    expect(band.ok).toBe(false);
    expect(parseOnboardingMetrics({ notes: "x".repeat(2001) }).ok).toBe(false);
  });

  it("every offer metric line has at least one form field; the form keys are the schema keys", () => {
    const groups = new Set(ONBOARDING_METRIC_FIELDS.map((f) => f.group));
    for (const line of COHORT_SUCCESS_METRICS) expect(groups.has(line), line).toBe(true);
    expect(ONBOARDING_METRIC_FIELDS.map((f) => f.key)).toEqual([...ONBOARDING_METRIC_KEYS]);
  });
});

describe("mergeOnboardingMetrics + readOnboardingMetrics", () => {
  it("only the sent keys change; null clears; unknown stored keys survive; updated_at stamped", () => {
    const stored = { review_minutes_before: 60, satisfaction: 4, legacy: "keep" };
    const merged = mergeOnboardingMetrics(stored, { review_minutes_after: 20, satisfaction: null }, "2026-09-20T00:00:00.000Z");
    expect(merged).toEqual({ review_minutes_before: 60, review_minutes_after: 20, legacy: "keep", updated_at: "2026-09-20T00:00:00.000Z" });
    expect(readOnboardingMetrics(merged)).toEqual({ review_minutes_before: 60, review_minutes_after: 20 });
    expect(readOnboardingMetrics({ satisfaction: "bad" })).toEqual({});
    expect(readOnboardingMetrics(null)).toEqual({});
  });

  it("reviewTimeSaving needs both sides", () => {
    expect(reviewTimeSaving({ review_minutes_before: 60 })).toBeNull();
    expect(reviewTimeSaving({ review_minutes_before: 60, review_minutes_after: 18 })).toEqual({ before: 60, after: 18, pct: 70 });
    expect(reviewTimeSaving({ review_minutes_before: 0, review_minutes_after: 18 })).toBeNull();
  });
});

describe("onboardingChecklist", () => {
  it("six steps — the G24-C demo pre-step then delivery order — with data-derived ticks", () => {
    const none = onboardingChecklist({ seatActive: false, intakeLinks: 0, submissions: 0, scored: 0, decided: 0, workshopCaptured: false, reportDone: false });
    expect(none.map((i) => i.key)).toEqual(["demo", "setup", "intake", "assessment", "workshop", "report"]);
    expect(none.every((i) => !i.done)).toBe(true);
    expect(none[0]).toMatchObject({ label: "Demo run", href: "/workspace/evaluations/cohort" });
    expect(none[0].detail).toMatch(/demo cohort/i);
    const mid = checklistFromMetrics({ evaluator_consistency: 4 }, { seatActive: true, intakeLinks: 1, submissions: 8, scored: 8, decided: 3, demoRun: true }, false);
    expect(mid.map((i) => i.done)).toEqual([true, true, true, true, true, false]);
    const done = checklistFromMetrics({ repeat_intent: true, renewal_intent: false }, { seatActive: true, intakeLinks: 1, submissions: 8, scored: 8, decided: 8 }, false);
    expect(done[5].done).toBe(true);
    expect(done[4].done).toBe(false);
    expect(done[0].done).toBe(false);
    // Catalogue copy overrides the EN default (the VI onboarding page).
    const vi = onboardingChecklist({ seatActive: false, intakeLinks: 0, submissions: 0, scored: 0, decided: 0, workshopCaptured: false, reportDone: false }, { demoLabel: "Chạy demo", demoDetail: "Đã chạy cohort demo" });
    expect(vi[0]).toMatchObject({ label: "Chạy demo", detail: "Đã chạy cohort demo" });
  });
});
