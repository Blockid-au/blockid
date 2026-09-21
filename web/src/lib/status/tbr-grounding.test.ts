// G23-C — report grounding: latest-run groundedShare + the KPI, fail-soft on
// a missing / unparsable tbr-quality.jsonl, never a path or id in the output.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TBR_GROUNDED_SHARE_KPI_FALLBACK, emptyTbrGrounding, latestGroundedShare, readTbrGrounding, resolveGroundedShareKpi } from "./tbr-grounding";

let root: string;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "tbr-grounding-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const row = (ts: string, groundedShare: unknown) => JSON.stringify({ ts, projectId: "deadbeef0000", snapshotId: "snap-9", tier: "standard", groundedShare });

describe("resolveGroundedShareKpi / latestGroundedShare", () => {
  it("the KPI is the 0.85 grounded target (lane A export or the quality-log watch threshold)", () => {
    expect(resolveGroundedShareKpi()).toBe(0.85);
    expect(TBR_GROUNDED_SHARE_KPI_FALLBACK).toBe(0.85);
    expect(emptyTbrGrounding()).toEqual({ grounded_share: null, grounded_share_kpi: 0.85 });
  });

  it("picks the latest run by ts (position breaks ties), clamps to 0..1, rounds to 2 dp, ignores rows without a finite share", () => {
    expect(latestGroundedShare([])).toBeNull();
    expect(latestGroundedShare([{ ts: "2026-09-21T00:00:00Z", groundedShare: "0.9" }, { ts: "2026-09-21T01:00:00Z" }])).toBeNull();
    expect(latestGroundedShare([{ ts: "2026-09-21T02:00:00Z", groundedShare: 0.912 }, { ts: "2026-09-21T01:00:00Z", groundedShare: 0.41 }])).toBe(0.91);
    expect(latestGroundedShare([{ ts: "2026-09-21T01:00:00Z", groundedShare: 0.41 }, { ts: "2026-09-21T01:00:00Z", groundedShare: 0.87 }])).toBe(0.87);
    expect(latestGroundedShare([{ groundedShare: 1.4 }, { groundedShare: -2 }])).toBe(0);
    expect(latestGroundedShare([{ ts: "not a date", groundedShare: 0.5 }, { ts: "2020-01-01T00:00:00Z", groundedShare: 0.6 }])).toBe(0.6);
    // Review G23 P1: a no-report outage row (words 0, all 8 chapters degraded) is not "the latest grounding".
    expect(latestGroundedShare([{ ts: "2026-09-20T10:32:00Z", groundedShare: 0.41, words: 7657, degradedSections: 1 }, { ts: "2026-09-21T04:08:00Z", groundedShare: 0, words: 0, degradedSections: 8 }])).toBe(0.41);
  });
});

describe("readTbrGrounding (temp root)", () => {
  it("missing file → null share + the KPI; unparsable → the same; a real tail → the latest run's share", async () => {
    expect(await readTbrGrounding(root)).toEqual({ grounded_share: null, grounded_share_kpi: 0.85 });
    const file = path.join(root, "content", "reports", "tbr-quality.jsonl");
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, "{nope\n");
    expect(await readTbrGrounding(root)).toEqual({ grounded_share: null, grounded_share_kpi: 0.85 });
    writeFileSync(file, [row("2026-09-20T00:00:00Z", 0.9), "{broken", row("2026-09-21T00:00:00Z", 0.41)].join("\n") + "\n");
    const out = await readTbrGrounding(root);
    expect(out).toEqual({ grounded_share: 0.41, grounded_share_kpi: 0.85 });
    expect(JSON.stringify(out)).not.toMatch(/snap-9|deadbeef|tbr-quality/);
  });
});
