// Colocated suite for the stage timings ledger (26/09/2026): medians of
// recent real runs behind the timeline's "usually ~Xs", defaults when there
// is no history, and a best-effort writer that is a no-op under vitest.

import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

vi.mock("server-only", () => ({}));

import { DEFAULT_STAGE_SECONDS } from "./stage-timeline";
import { ETA_SAMPLE_RUNS, etasFromRows, loadStageEtas, median, recordStageTimings, resetStageEtasCache } from "./stage-timings";

afterEach(() => {
  delete process.env.TBR_STAGE_TIMINGS_FILE;
  resetStageEtasCache();
});

describe("median", () => {
  it("handles odd, even and empty lists", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(3);
    expect(median([])).toBeNull();
  });
});

describe("etasFromRows", () => {
  it("falls back to the defaults with no history", () => {
    const e = etasFromRows([]);
    expect(e.samples).toBe(0);
    expect(e.stages).toEqual(DEFAULT_STAGE_SECONDS);
  });

  it("takes per-stage medians of the recent runs, keeping defaults for stages no run carried", () => {
    const rows = [
      { ts: "a", totalMs: 300_000, stages: { evidence: 30_000, dimensions: 100_000 } },
      { ts: "b", totalMs: 360_000, stages: { evidence: 50_000, dimensions: 140_000 } },
      { ts: "c", totalMs: 420_000, stages: { evidence: 70_000 } },
      { ts: "bad", totalMs: 0, stages: { evidence: 999_000 } },
    ];
    const e = etasFromRows(rows);
    expect(e.samples).toBe(3);
    expect(e.stages.evidence).toBe(50);
    expect(e.stages.dimensions).toBe(120);
    expect(e.stages.synthesis).toBe(DEFAULT_STAGE_SECONDS.synthesis);
    expect(e.totalSec).toBe(360);
  });

  it("only looks at the last ETA_SAMPLE_RUNS runs", () => {
    const old = Array.from({ length: 10 }, (_, i) => ({ ts: "o" + i, totalMs: 1_000_000, stages: { audit: 500_000 } }));
    const recent = Array.from({ length: ETA_SAMPLE_RUNS }, (_, i) => ({ ts: "r" + i, totalMs: 200_000, stages: { audit: 20_000 } }));
    expect(etasFromRows([...old, ...recent]).stages.audit).toBe(20);
  });
});

describe("ledger file", () => {
  it("appends a row and reads the medians back (when a file is configured)", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "tbr-timings-"));
    const file = path.join(dir, "t.jsonl");
    writeFileSync(file, "");
    process.env.TBR_STAGE_TIMINGS_FILE = file;
    await recordStageTimings({ ts: "2026-09-26T00:00:00Z", totalMs: 240_000, stages: { evidence: 42_000 } });
    expect(readFileSync(file, "utf8").trim().split("\n")).toHaveLength(1);
    resetStageEtasCache();
    const e = await loadStageEtas();
    expect(e).toMatchObject({ samples: 1, totalSec: 240 });
    expect(e.stages.evidence).toBe(42);
    rmSync(dir, { recursive: true, force: true });
  });

  it("never writes under vitest without a configured file, and reads the defaults", async () => {
    await expect(recordStageTimings({ ts: "x", totalMs: 1, stages: {} })).resolves.toBeUndefined();
    const e = await loadStageEtas();
    expect(e.samples).toBe(0);
  });
});
