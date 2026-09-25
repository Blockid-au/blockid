// ER3 — the poll view exposes landed chapters only while the document is
// still running, and never to a locked (no e-mail yet) guest.

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildFullReportView } from "./view";
import { FULL_REPORT_V2_VERSION, type FullReportV2Envelope } from "./types";
import type { FullReportRow } from "./store";
import { demoReportV2 } from "@/lib/report-v2/fixtures";

const chapter = { dim: "tre", title: "Traction", ownerAgent: "cro", score: 70, band: "Strong", verdict: "v", degraded: false };
function envelope(over: Partial<FullReportV2Envelope> = {}): FullReportV2Envelope {
  return {
    version: FULL_REPORT_V2_VERSION,
    analysisId: "a-1",
    company: "Acme",
    generatedAt: "2026-09-25T00:00:00.000Z",
    report: null,
    reportId: null,
    progress: { phase: "analyze", pct: 40, at: "2026-09-25T00:01:00.000Z", chaptersDone: 1 },
    draftChapters: [chapter],
    ...over,
  };
}
function row(over: Partial<FullReportRow>): FullReportRow {
  return {
    id: "a-1",
    user_id: "u1",
    full_report_status: "running",
    full_report_json: envelope(),
    full_report_error: null,
    full_report_attempts: 1,
    full_report_started_at: null,
    full_report_finished_at: null,
    full_report_email: null,
    full_report_emailed_at: null,
    ...over,
  } as FullReportRow;
}

describe("buildFullReportView — ER3 chapters", () => {
  it("running + owner → the landed chapters", () => {
    expect(buildFullReportView(row({})).chaptersV2).toEqual([chapter]);
  });
  it("a locked guest (no owner, no e-mail) sees none", () => {
    expect(buildFullReportView(row({ user_id: null })).chaptersV2).toEqual([]);
  });
  it("once the document lands the draft list is dropped", () => {
    expect(buildFullReportView(row({ full_report_status: "done", full_report_json: envelope({ report: demoReportV2() }) })).chaptersV2).toEqual([]);
  });
});
