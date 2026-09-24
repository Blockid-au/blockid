// G19-S46 — tbr-quality.jsonl: row shape (hash-only project id, pending dims
// from the S41 ledger, pages from the estimator), best-effort writer, and the
// 24 h reducer behind /api/status.tbr_quality + the admin tile.

import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { demoReportV2 } from "@/lib/report-v2/fixtures";
import {
  TBR_QUALITY_DEGRADED_WATCH,
  TBR_QUALITY_FILE,
  TBR_GROUNDED_SHARE_KPI,
  TBR_QUALITY_GROUNDED_WATCH,
  appendTbrQualityRow,
  emptyTbrQualityStatus,
  isNoReportRow,
  buildTbrQualityRow,
  formatTbrQualityLine,
  projectHash,
  readTbrQualityStatus,
  recordTbrQuality,
  recordTbrQualityAsync,
  summariseTbrQuality,
  type TbrQualityRow,
  type TbrQualityWriter,
} from "./quality-log";

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.TBR_QUALITY_FILE;
});

const NOW = new Date("2026-09-20T10:00:00.000Z");

function row(over: Partial<TbrQualityRow> = {}): TbrQualityRow {
  return {
    ts: NOW.toISOString(),
    projectId: "abc",
    snapshotId: "snap-1",
    tier: "standard",
    calls: 20,
    costUsd: 0.01,
    groundedShare: 0.9,
    degradedSections: 0,
    consistencyIssues: 0,
    pendingDims: 0,
    words: 1200,
    pages: 9,
    durationMs: 60_000,
    sviVersion: "2.2.0",
    pipelineVersion: "pipeline-v2.1-s-r3",
    ...over,
  };
}

describe("buildTbrQualityRow", () => {
  it("hashes the project id, counts pending (assessed:false) chapters, and takes grounded / degraded / pages from the ReportV2", () => {
    const report = demoReportV2();
    report.quality = { ...report.quality, groundedShare: 0.8765, degradedSections: ["tre"], consistencyIssues: [] };
    report.dimensions[0] = { ...report.dimensions[0], scoreBreakdown: { base: 50, signals: [], confidenceMultiplier: 0.2, adjustment: 0, assessed: false } };
    report.dimensions[1] = { ...report.dimensions[1], scoreBreakdown: { base: 30, signals: [{ signal: "x", points: 5, source: "self_declared" }], confidenceMultiplier: 0.5, adjustment: 1, assessed: true } };
    const r = buildTbrQualityRow({
      projectId: "2bf55234-e359-4390-8faa-06597824f77a",
      snapshotId: "snap-9",
      tier: "standard",
      report,
      calls: 22.9,
      costUsd: 0.012345,
      durationMs: 91_234.7,
      words: 1310,
      consistencyIssues: 2,
      sviVersion: "2.2.0",
      now: NOW,
    });
    expect(r.ts).toBe(NOW.toISOString());
    expect(r.projectId).toBe(createHash("sha256").update("2bf55234-e359-4390-8faa-06597824f77a").digest("hex").slice(0, 12));
    expect(JSON.stringify(r)).not.toContain("2bf55234");
    expect(r).toMatchObject({ snapshotId: "snap-9", tier: "standard", calls: 22, costUsd: 0.0123, groundedShare: 0.8765, degradedSections: 1, consistencyIssues: 2, pendingDims: 1, words: 1310, durationMs: 91_234, sviVersion: "2.2.0", pipelineVersion: report.pipelineVersion });
    expect(r.pages).toBeGreaterThan(0);
    expect(Object.keys(r).sort()).toEqual(["autoCited", "budgetOverruns", "calls", "consistencyIssues", "costUsd", "degradedSections", "durationMs", "groundedShare", "pages", "pendingDims", "pipelineVersion", "projectId", "snapshotId", "sviVersion", "tier", "ts", "verdictTrimmed", "words"]);
  });

  it("degrades to zeros without a ReportV2 (never throws), clamps negatives, and 'anonymous' without a project", () => {
    const r = buildTbrQualityRow({ projectId: null, snapshotId: null, tier: "free", report: null, calls: -1, costUsd: Number.NaN, durationMs: -5, sviVersion: "2.2.0", pipelineVersion: "p", now: NOW });
    expect(r).toMatchObject({ projectId: "anonymous", snapshotId: null, calls: 0, costUsd: 0, groundedShare: 0, degradedSections: 0, consistencyIssues: 0, pendingDims: 0, words: 0, pages: 0, durationMs: 0, pipelineVersion: "p" });
    expect(projectHash(undefined)).toBe("anonymous");
    expect(formatTbrQualityLine(r)).toContain("tier=free calls=0");
    expect(formatTbrQualityLine(r)).toContain("snapshot=-");
  });
});

describe("recordTbrQuality / appendTbrQualityRow", () => {
  it("hands the row to the injected writer and never throws when the writer throws or rejects", async () => {
    const writer = vi.fn();
    const r = row();
    expect(recordTbrQuality(r, writer)).toBe(r);
    expect(writer).toHaveBeenCalledWith(r);
    expect(() => recordTbrQuality(r, () => { throw new Error("disk full"); })).not.toThrow();
    const rejecting = vi.fn(async () => { throw new Error("EACCES"); });
    expect(() => recordTbrQuality(r, rejecting)).not.toThrow();
    await Promise.resolve();
    expect(rejecting).toHaveBeenCalledTimes(1);
  });

  it("recordTbrQualityAsync awaits the writer and still never rejects", async () => {
    const order: string[] = [];
    const slow: TbrQualityWriter = () => new Promise((r) => setTimeout(() => { order.push("written"); r(); }, 5));
    await recordTbrQualityAsync(row(), slow);
    order.push("returned");
    expect(order).toEqual(["written", "returned"]);
    await expect(recordTbrQualityAsync(row(), async () => { throw new Error("EACCES"); })).resolves.toMatchObject({ tier: "standard" });
    await expect(recordTbrQualityAsync(row(), () => { throw new Error("sync"); })).resolves.toBeDefined();
  });

  it("the default writer is a no-op under vitest, and appends one line per row when TBR_QUALITY_FILE points at a file", async () => {
    await expect(Promise.resolve(appendTbrQualityRow(row()))).resolves.toBeUndefined();
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tbr-quality-"));
    const file = path.join(dir, "nested", TBR_QUALITY_FILE);
    process.env.TBR_QUALITY_FILE = file;
    await appendTbrQualityRow(row({ snapshotId: "a" }));
    await appendTbrQualityRow(row({ snapshotId: "b" }));
    const lines = (await fs.readFile(file, "utf8")).trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[1]).snapshotId).toBe("b");
    // An unwritable path is swallowed (never rejects).
    process.env.TBR_QUALITY_FILE = path.join(file, "cannot", "be", "a", "dir");
    await expect(Promise.resolve(appendTbrQualityRow(row()))).resolves.toBeUndefined();
  });
});

describe("summariseTbrQuality (24 h window)", () => {
  const now = NOW.getTime();
  const ago = (h: number) => new Date(now - h * 3_600_000).toISOString();

  it("missing when no run falls inside the window (old rows and junk are ignored)", () => {
    expect(summariseTbrQuality([], now)).toEqual({ last24h: { runs: 0, groundedShareMedian: null, groundedShareLatest: null, costUsdMedian: null, degradedShare: null, noReportRuns: 0, budgetOverruns: 0, verdictTrimmed: 0 }, status: "missing", grounded_share_kpi: 0.85, last_degraded: null });
    expect(summariseTbrQuality([row({ ts: ago(30) }), { ts: "nope" }, null as never, "x" as never], now).status).toBe("missing");
  });

  it("ok: medians over the window, degradedShare = runs with ≥ 1 degraded chapter ÷ runs", () => {
    const s = summariseTbrQuality(
      [
        row({ ts: ago(1), groundedShare: 0.9, costUsd: 0.01, degradedSections: 0 }),
        row({ ts: ago(2), groundedShare: 0.95, costUsd: 0.03, degradedSections: 0 }),
        row({ ts: ago(3), groundedShare: 0.86, costUsd: 0.02, degradedSections: 0 }),
        row({ ts: ago(4), groundedShare: 1, costUsd: 0.05, degradedSections: 1 }),
        row({ ts: ago(4), groundedShare: 0.88, costUsd: 0.04, degradedSections: 0 }),
        row({ ts: ago(25), groundedShare: 0.1, costUsd: 9, degradedSections: 8 }),
      ],
      now,
    );
    expect(s).toEqual({ last24h: { runs: 5, groundedShareMedian: 0.9, groundedShareLatest: 0.9, costUsdMedian: 0.03, degradedShare: 0.2, noReportRuns: 0, budgetOverruns: 0, verdictTrimmed: 0 }, status: "ok", grounded_share_kpi: 0.85, last_degraded: null });
  });

  it("watch when the grounded median drops under 0.85 or more than 20 % of runs degraded", () => {
    expect(TBR_QUALITY_GROUNDED_WATCH).toBe(0.85);
    expect(TBR_QUALITY_DEGRADED_WATCH).toBe(0.2);
    expect(summariseTbrQuality([row({ ts: ago(1), groundedShare: 0.7 }), row({ ts: ago(2), groundedShare: 0.84 })], now)).toMatchObject({ last24h: { runs: 2, groundedShareMedian: 0.77 }, status: "watch" });
    expect(summariseTbrQuality([row({ ts: ago(1), degradedSections: 2 }), row({ ts: ago(2) }), row({ ts: ago(3) })], now)).toMatchObject({ last24h: { degradedShare: 0.33 }, status: "watch" });
    // A row without a grounded figure still counts as a run but not toward the median.
    expect(summariseTbrQuality([row({ ts: ago(1), groundedShare: undefined as never })], now)).toEqual({ last24h: { runs: 1, groundedShareMedian: null, groundedShareLatest: null, costUsdMedian: 0.01, degradedShare: 0, noReportRuns: 0, budgetOverruns: 0, verdictTrimmed: 0 }, status: "ok", grounded_share_kpi: 0.85, last_degraded: null });
  });

  it("readTbrQualityStatus reads content/reports/tbr-quality.jsonl under the root, skips bad lines, and is missing without the file", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "tbr-quality-root-"));
    expect(await readTbrQualityStatus(root, now)).toMatchObject({ status: "missing" });
    await fs.mkdir(path.join(root, "content", "reports"), { recursive: true });
    await fs.writeFile(path.join(root, "content", "reports", TBR_QUALITY_FILE), [JSON.stringify(row({ ts: ago(1), groundedShare: 0.91 })), "{broken", JSON.stringify(row({ ts: ago(2), groundedShare: 0.93 }))].join("\n") + "\n");
    expect(await readTbrQualityStatus(root, now)).toEqual({ last24h: { runs: 2, groundedShareMedian: 0.92, groundedShareLatest: 0.91, costUsdMedian: 0.01, degradedShare: 0, noReportRuns: 0, budgetOverruns: 0, verdictTrimmed: 0 }, status: "ok", grounded_share_kpi: 0.85, last_degraded: null });
  });

  // ── G23-A: KPI export, counters, and the no-report exclusion ──────────────
  it("exports the KPI (0.85) the verdict is judged against and echoes it as grounded_share_kpi", () => {
    expect(TBR_GROUNDED_SHARE_KPI).toBe(0.85);
    expect(TBR_QUALITY_GROUNDED_WATCH).toBe(TBR_GROUNDED_SHARE_KPI);
    expect(summariseTbrQuality([row({ ts: ago(1), groundedShare: 0.86 })], now)).toMatchObject({ status: "ok", grounded_share_kpi: 0.85, last24h: { groundedShareLatest: 0.86 } });
    expect(summariseTbrQuality([row({ ts: ago(1), groundedShare: 0.849 })], now)).toMatchObject({ status: "watch" });
  });

  it("a fully degraded run (no prose, 8 deterministic chapters) counts toward degradedShare but not the grounding median; counters are summed", () => {
    const s = summariseTbrQuality(
      [
        row({ ts: ago(1), groundedShare: 0.9, budgetOverruns: 2, verdictTrimmed: 1 }),
        row({ ts: ago(2), groundedShare: 0, words: 0, degradedSections: 8, budgetOverruns: 1 }),
        row({ ts: ago(3), groundedShare: 0.88, verdictTrimmed: 1 }),
      ],
      now,
    );
    expect(s.last24h).toMatchObject({ runs: 3, groundedShareMedian: 0.89, groundedShareLatest: 0.9, degradedShare: 0.33, budgetOverruns: 3, verdictTrimmed: 2 });
    expect(s.status).toBe("watch"); // one outage in three runs is still a watch
    // A run WITH prose and a low share is never excluded.
    expect(summariseTbrQuality([row({ ts: ago(1), groundedShare: 0.2, words: 500, degradedSections: 8 })], now).last24h.groundedShareMedian).toBe(0.2);
    // G28-B: ≥ 7 degraded chapters with no prose is "no report" too (the orchestrator refuses to persist it) — excluded from the median, counted in degradedShare.
    const seven = summariseTbrQuality([row({ ts: ago(1), groundedShare: 0.9 }), row({ ts: ago(2), groundedShare: 0, words: 0, degradedSections: 7 })], now);
    expect(seven.last24h).toMatchObject({ runs: 2, groundedShareMedian: 0.9, degradedShare: 0.5 });
    // 6 degraded chapters is a (poor) report — its share stays in the median.
    expect(summariseTbrQuality([row({ ts: ago(1), groundedShare: 0.9 }), row({ ts: ago(2), groundedShare: 0, words: 0, degradedSections: 6 })], now).last24h.groundedShareMedian).toBe(0.45);
  });

  it("G33-T01: an outage is `down`, not `watch` — half the window or the two latest runs produced no report", () => {
    const empty = (ts: string) => row({ ts, groundedShare: 0, words: 0, degradedSections: 8 });
    // 24/09 live shape: two free runs, both fully degraded.
    const both = summariseTbrQuality([empty(ago(1)), empty(ago(1))], now);
    expect(both.status).toBe("down");
    expect(both.last24h.noReportRuns).toBe(2);
    // 3 of 5 produced nothing → down even when the latest run was fine.
    expect(summariseTbrQuality([row({ ts: ago(1), groundedShare: 0.9 }), empty(ago(2)), empty(ago(3)), empty(ago(4)), row({ ts: ago(5), groundedShare: 0.9 })], now).status).toBe("down");
    // The two latest runs produced nothing → down even if older runs were fine.
    expect(summariseTbrQuality([row({ ts: ago(5), groundedShare: 0.9 }), row({ ts: ago(4), groundedShare: 0.9 }), row({ ts: ago(3), groundedShare: 0.9 }), empty(ago(2)), empty(ago(1))], now).status).toBe("down");
    // One outage then a good run → still only a watch.
    expect(summariseTbrQuality([empty(ago(2)), row({ ts: ago(1), groundedShare: 0.9 }), row({ ts: ago(3), groundedShare: 0.9 })], now).status).toBe("watch");
    // A single no-report run is not yet `down` (needs two).
    expect(summariseTbrQuality([empty(ago(1))], now).status).toBe("watch");
  });

  // ── G29-B: degraded-run diagnostics on the row + last_degraded on the status ──
  it("G29-B: a degraded row carries providers_struck + deadline_hit_wave (only when given), the log line prints them, and legacy rows are unchanged", () => {
    const r = buildTbrQualityRow({ projectId: "p", snapshotId: null, tier: "standard", report: null, calls: 16, costUsd: 0.01, durationMs: 480_000, degradedSections: 8, sviVersion: "2.2.0", providersStruck: ["deepinfra", "", "groq"], deadlineHitWave: "wave1" });
    expect(r).toMatchObject({ degradedSections: 8, words: 0, providers_struck: ["deepinfra", "groq"], deadline_hit_wave: "wave1" });
    expect(formatTbrQualityLine(r)).toContain("providers_struck=deepinfra,groq deadline_hit_wave=wave1");
    const noDeadline = buildTbrQualityRow({ projectId: "p", snapshotId: null, tier: "standard", report: null, calls: 1, costUsd: 0, durationMs: 1, sviVersion: "2.2.0", providersStruck: [], deadlineHitWave: null });
    expect(noDeadline).toMatchObject({ providers_struck: [], deadline_hit_wave: null });
    expect(formatTbrQualityLine(noDeadline)).toContain("providers_struck=- deadline_hit_wave=-");
    const good = buildTbrQualityRow({ projectId: "p", snapshotId: null, tier: "standard", report: demoReportV2(), calls: 1, costUsd: 0, durationMs: 1, sviVersion: "2.2.0" });
    expect("providers_struck" in good).toBe(false);
    expect("deadline_hit_wave" in good).toBe(false);
    expect(formatTbrQualityLine(good)).not.toContain("providers_struck");
  });

  it("G29-B: last_degraded names the latest no-report run in the window (ts, providers_struck, deadline_hit_wave) while the grounding median still excludes it; null when every run produced a report", () => {
    expect(isNoReportRow({ words: 0, degradedSections: 8 })).toBe(true);
    expect(isNoReportRow({ words: 0, degradedSections: 7 })).toBe(true);
    expect(isNoReportRow({ words: 0, degradedSections: 6 })).toBe(false);
    expect(isNoReportRow({ words: 12, degradedSections: 8 })).toBe(false);
    expect(isNoReportRow(null)).toBe(false);
    const s = summariseTbrQuality(
      [
        row({ ts: ago(1), groundedShare: 0.9 }),
        row({ ts: ago(2), groundedShare: 0, words: 0, degradedSections: 8, providers_struck: ["deepinfra"], deadline_hit_wave: "wave1" }),
        row({ ts: ago(5), groundedShare: 0, words: 0, degradedSections: 7, providers_struck: ["groq"], deadline_hit_wave: null }),
        row({ ts: ago(3), groundedShare: 0.88 }),
      ],
      now,
    );
    // Pin: the outage rows never enter the median / latest share.
    expect(s.last24h).toMatchObject({ runs: 4, groundedShareMedian: 0.89, groundedShareLatest: 0.9, degradedShare: 0.5 });
    expect(s.last_degraded).toEqual({ ts: ago(2), providers_struck: ["deepinfra"], deadline_hit_wave: "wave1" });
    // A legacy outage row (no G29-B fields) still names itself, with empty diagnostics.
    expect(summariseTbrQuality([row({ ts: ago(1), groundedShare: 0, words: 0, degradedSections: 8 })], now).last_degraded).toEqual({ ts: ago(1), providers_struck: [], deadline_hit_wave: null });
    expect(summariseTbrQuality([row({ ts: ago(1), groundedShare: 0.9 })], now).last_degraded).toBeNull();
    // Out of the window → not "last".
    expect(summariseTbrQuality([row({ ts: ago(1), groundedShare: 0.9 }), row({ ts: ago(30), groundedShare: 0, words: 0, degradedSections: 8 })], now).last_degraded).toBeNull();
    expect(emptyTbrQualityStatus().last_degraded).toBeNull();
  });

  it("buildTbrQualityRow carries the G23-A counters (0 when absent) and the log line prints them", () => {
    const r = buildTbrQualityRow({ projectId: "p", snapshotId: null, tier: "standard", report: demoReportV2(), calls: 1, costUsd: 0, durationMs: 1, sviVersion: "2.2.0", budgetOverruns: 2, verdictTrimmed: 1, autoCited: 7 });
    expect(r).toMatchObject({ budgetOverruns: 2, verdictTrimmed: 1, autoCited: 7 });
    expect(formatTbrQualityLine(r)).toContain("budget_overruns=2 verdict_trimmed=1 auto_cited=7");
    expect(buildTbrQualityRow({ projectId: "p", snapshotId: null, tier: "standard", report: null, calls: 1, costUsd: 0, durationMs: 1, sviVersion: "2.2.0" })).toMatchObject({ budgetOverruns: 0, verdictTrimmed: 0, autoCited: 0 });
  });
});
