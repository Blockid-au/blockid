// G21 P3-A — the calibration runner against a synthetic source in a temp
// dir: writes the latest JSON + a history line, `--dry` writes nothing, the
// summary carries n on every published figure and never a forecasting word.
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CALIBRATION_FILE, CALIBRATION_HISTORY_FILE, isCalibrationReport } from "@/lib/calibration/latest";
import { main, summary } from "./run";

const NOW = new Date("2026-09-20T04:10:00.000Z");

function source() {
  const snapshots = Array.from({ length: 12 }, (_, i) => ({ project_id: `p-${i}`, snapshot_date: "2026-01-10", svi_total: i < 6 ? 75 : 45, evidence_confidence: 60, stage: 2 }));
  const outcomes = [0, 1, 2].map((i) => ({ project_id: `p-${i}`, kind: "funding_raised", observed_at: "2026-06-01", status: "confirmed" }));
  return { snapshots, outcomes, warnings: ["startup_outcomes: partial page"] };
}

describe("scripts/calibration/run", () => {
  it("writes calibration-latest.json + a history line; the report is well-formed; the summary carries n and no forbidden words", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "calib-"));
    const lines: string[] = [];
    const r = await main({ root, now: NOW, gitSha: "abc1234", load: async () => source(), log: (l) => lines.push(l) });
    expect(r.wrote).toBe(true);
    const latest = JSON.parse(readFileSync(path.join(root, CALIBRATION_FILE), "utf8"));
    expect(isCalibrationReport(latest)).toBe(true);
    expect(latest.totals).toMatchObject({ companies_eligible: 12, confirmed_outcomes: 3, cohorts_published: 1 });
    expect(latest.git_sha).toBe("abc1234");
    const history = readFileSync(path.join(root, CALIBRATION_HISTORY_FILE), "utf8").trim().split("\n");
    expect(history).toHaveLength(1);
    expect(JSON.parse(history[0]!)).toMatchObject({ cohorts_published: 1, confirmed_outcomes: 3 });
    const text = lines.join("\n");
    expect(text).toContain("n = 12");
    expect(text).toContain("indicative");
    expect(text).toContain("warning: startup_outcomes: partial page");
    expect(text).not.toMatch(/predict|accura/i);
  });

  it("--dry prints the summary and writes nothing; an empty source says so", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "calib-"));
    const lines: string[] = [];
    const r = await main({ root, dry: true, now: NOW, gitSha: "abc1234", load: async () => ({ snapshots: [], outcomes: [], warnings: [] }), log: (l) => lines.push(l) });
    expect(r.wrote).toBe(false);
    expect(existsSync(path.join(root, CALIBRATION_FILE))).toBe(false);
    expect(lines.join("\n")).toContain("nothing published");
    expect(summary(r.report, [])).toContain("cohorts: 0");
  });
});
