// dispatch (G28-C): the stored shape picks the runner — a fresh row or a v2
// envelope → the ReportV2 pipeline; a v1 FirstAnalysisReport → the S32 job.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const s32 = vi.hoisted(() => ({ start: vi.fn(), run: vi.fn(), deliver: vi.fn(), deps: vi.fn(() => ({ callAgent: null })), caller: vi.fn(() => "agent-caller") }));
const v2 = vi.hoisted(() => ({ start: vi.fn(), run: vi.fn(), deliver: vi.fn(), deps: vi.fn(() => ({ callAI: null })), caller: vi.fn(() => "report-caller") }));
vi.mock("./job", () => ({
  startFirstAnalysisJob: (...a: unknown[]) => s32.start(...a),
  runFirstAnalysisJob: (...a: unknown[]) => s32.run(...a),
  deliverFullReport: (...a: unknown[]) => s32.deliver(...a),
  defaultDeps: () => s32.deps(),
  makeAgentCaller: (u: unknown) => s32.caller(u),
}));
vi.mock("./report-v2-job", () => ({
  startReportV2Job: (...a: unknown[]) => v2.start(...a),
  runReportV2Job: (...a: unknown[]) => v2.run(...a),
  deliverReportV2: (...a: unknown[]) => v2.deliver(...a),
  defaultReportV2Deps: () => v2.deps(),
  makeReportCaller: (...a: unknown[]) => v2.caller(...a),
}));

import { deliverAnalysisReport, reportPathFor, runAnalysisReportJob, startAnalysisReportJob } from "./dispatch";
import { sampleReport, SAMPLE_ANALYSIS_ID } from "./fixtures";
import type { FullReportRow } from "./store";
import { FULL_REPORT_V2_VERSION } from "./types";

const envelope = { version: FULL_REPORT_V2_VERSION, analysisId: SAMPLE_ANALYSIS_ID, company: "Acme", generatedAt: "x", report: null, reportId: null, progress: { phase: "starting", pct: 0, at: "x", chaptersDone: 0 } };
const row = (json: unknown, user_id: string | null = null) => ({ id: SAMPLE_ANALYSIS_ID, user_id, full_report_json: json, full_report_status: "queued" }) as unknown as FullReportRow;

beforeEach(() => {
  for (const m of [s32, v2]) {
    m.start.mockReset();
    m.run.mockReset().mockResolvedValue({ outcome: "done" });
    m.deliver.mockReset().mockResolvedValue("sent");
    m.deps.mockClear();
    m.caller.mockClear();
  }
});

describe("reportPathFor", () => {
  it("v2 for nothing / an envelope; s32 only for a v1 report", () => {
    expect(reportPathFor(null)).toBe("v2");
    expect(reportPathFor(undefined)).toBe("v2");
    expect(reportPathFor(envelope)).toBe("v2");
    expect(reportPathFor(sampleReport())).toBe("s32");
  });
});

describe("startAnalysisReportJob", () => {
  it("a fresh row (the intake route) starts the ReportV2 pipeline; a v1 row the S32 job", () => {
    startAnalysisReportJob(SAMPLE_ANALYSIS_ID, { userId: "u-1" });
    expect(v2.start).toHaveBeenCalledWith(SAMPLE_ANALYSIS_ID, { userId: "u-1" });
    expect(s32.start).not.toHaveBeenCalled();
    startAnalysisReportJob(SAMPLE_ANALYSIS_ID, { userId: null, json: sampleReport() });
    expect(s32.start).toHaveBeenCalledWith(SAMPLE_ANALYSIS_ID, { userId: null });
    expect(v2.start).toHaveBeenCalledTimes(1);
  });
});

describe("runAnalysisReportJob / deliverAnalysisReport (the cron)", () => {
  it("runs the right runner with the row's user bound", async () => {
    await runAnalysisReportJob(row(null, "u-1"));
    expect(v2.caller).toHaveBeenCalledWith(SAMPLE_ANALYSIS_ID, "u-1");
    expect(v2.run).toHaveBeenCalledWith(SAMPLE_ANALYSIS_ID, expect.objectContaining({ callAI: "report-caller" }));
    await runAnalysisReportJob(row(sampleReport()));
    expect(s32.caller).toHaveBeenCalledWith(null);
    expect(s32.run).toHaveBeenCalledWith(SAMPLE_ANALYSIS_ID, expect.objectContaining({ callAgent: "agent-caller" }));
  });

  it("delivers the row's own document, `skipped` when there is none", async () => {
    expect(await deliverAnalysisReport(row(envelope), { force: true })).toBe("sent");
    expect(v2.deliver).toHaveBeenCalledWith(expect.objectContaining({ id: SAMPLE_ANALYSIS_ID }), envelope, { force: true });
    const r = sampleReport();
    expect(await deliverAnalysisReport(row(r))).toBe("sent");
    expect(s32.deliver).toHaveBeenCalledWith(expect.objectContaining({ id: SAMPLE_ANALYSIS_ID }), r, {});
    expect(await deliverAnalysisReport(row(null))).toBe("skipped");
  });
});
