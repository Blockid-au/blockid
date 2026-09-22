// G29-B — degraded-run diagnostics: per-wave timings from `progress`, the
// deadline wave from `done.deadlineHitPhase`, the strike ledger folded in.
import { describe, expect, it } from "vitest";
import { createRunStrikeLedger } from "@/lib/ai/run-strikes";
import type { PipelineEvent, PipelinePhase } from "./orchestrator";
import { RunDiagnosticsTracker } from "./run-diagnostics";

const progress = (phase: PipelinePhase, completed = 0): PipelineEvent => ({ type: "progress", completed, total: 100, phase });

describe("RunDiagnosticsTracker", () => {
  it("times each wave from the progress events, closes the open wave at the snapshot, and reports the wave the run threw in", () => {
    let clock = 1_000;
    const t = new RunDiagnosticsTracker(1_000, () => clock);
    t.observe(progress("gathering", 5));
    clock = 3_000;
    t.observe(progress("wave1", 15));
    t.observe(progress("wave1", 15)); // a repeat never opens a second wave
    clock = 40_000;
    t.observe(progress("wave2", 45));
    clock = 52_500;
    const d = t.snapshot({ error: new Error("DeepInfra Worker timeout (120s)") });
    expect(d).toMatchObject({ degraded: true, error: "DeepInfra Worker timeout (120s)", failedWave: "wave2", deadlineHit: false, deadlineHitWave: null, calls: null, totalMs: 51_500, providersStruck: [], strikes: {} });
    expect(d.waves).toEqual([
      { phase: "gathering", startedAtMs: 0, ms: 2_000 },
      { phase: "wave1", startedAtMs: 2_000, ms: 37_000 },
      { phase: "wave2", startedAtMs: 39_000, ms: 12_500 },
    ]);
  });

  it("folds the G28-B ledger in (struck providers sorted, the per-provider snapshot) and reads the deadline wave + calls off `done`", () => {
    const ledger = createRunStrikeLedger(2);
    ledger.note("groq", new Error("429 rate limit"));
    ledger.note("deepinfra", new Error("Worker timeout (120s)"));
    ledger.note("deepinfra", new Error("Worker timeout (120s)"));
    ledger.note("groq", new Error("engine_overloaded"));
    ledger.note("gemini", new Error("Worker timeout (120s)")); // one strike — not struck
    const t = new RunDiagnosticsTracker(0, () => 500_000);
    t.observe(progress("wave1"));
    t.observe(progress("wave4"));
    t.observe({ type: "done", reportId: "r", totalMs: 480_000, calls: 14, costAud: 0, costUsd: 0, costReportedCalls: 14, degradedSections: ["ftv"], deadlineHit: true, deadlineHitPhase: "wave1", budgetOverruns: 0, verdictTrimmed: 0, autoCited: 0 });
    const d = t.snapshot({ ledger, error: "report fully degraded" });
    expect(d).toMatchObject({ failedWave: "wave4", deadlineHit: true, deadlineHitWave: "wave1", calls: 14, totalMs: 480_000, providersStruck: ["deepinfra", "groq"], error: "report fully degraded" });
    expect(d.strikes).toEqual({ groq: { strikes: 2, timeout: 0, overloaded: 2 }, deepinfra: { strikes: 2, timeout: 2, overloaded: 0 }, gemini: { strikes: 1, timeout: 1, overloaded: 0 } });
  });

  it("never throws: a broken ledger, a non-Error throw and no events at all still give a record", () => {
    const t = new RunDiagnosticsTracker(0, () => 0);
    const broken = { struckProviders: () => { throw new Error("boom"); }, snapshot: () => ({}) };
    expect(t.snapshot({ ledger: broken, error: { odd: true } })).toMatchObject({ degraded: true, failedWave: null, waves: [], providersStruck: [], strikes: {}, error: "[object Object]" });
    expect(t.snapshot({}).error).toBe("unknown");
  });
});
