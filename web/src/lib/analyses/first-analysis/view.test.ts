// Colocated suite for the poll view's stage timeline (26/09/2026): every
// row shape a v2 run can be in — never claimed, held for the cap, running
// with stages, running from before stages existed, retrying, done — gets an
// honest timeline; an S32 row gets none.

import { describe, expect, it } from "vitest";

import { buildFullReportView, buildTimeline } from "./view";
import { FULL_REPORT_V2_VERSION, type FullReportV2Envelope } from "./types";
import { initialStages } from "./stage-timeline";
import { sampleReport, SAMPLE_ANALYSIS_ID } from "./fixtures";
import type { FullReportRow } from "./store";

const NOW = new Date("2026-09-26T01:02:00.000Z");

function row(overrides: Partial<FullReportRow> = {}): FullReportRow {
  return {
    id: SAMPLE_ANALYSIS_ID,
    anon_key: "anon",
    user_id: null,
    input_kind: "pitch_deck",
    input_text: "alpha beta gamma",
    input_chars: 16,
    input_truncated: false,
    input_url: null,
    input_filename: "deck.pdf",
    intake: { structured: { slides: ["s1", "s2"] } },
    context: null,
    created_at: "2026-09-26T01:00:00.000Z",
    full_report_status: "queued",
    full_report_json: null,
    full_report_error: null,
    full_report_attempts: 0,
    full_report_started_at: null,
    full_report_finished_at: null,
    full_report_email: "guest@example.com",
    full_report_emailed_at: null,
    ...overrides,
  };
}

function envelope(overrides: Partial<FullReportV2Envelope> = {}): FullReportV2Envelope {
  return {
    version: FULL_REPORT_V2_VERSION,
    analysisId: SAMPLE_ANALYSIS_ID,
    company: "Acme",
    generatedAt: "2026-09-26T01:00:05.000Z",
    report: null,
    reportId: null,
    progress: { phase: "gather", pct: 5, at: "2026-09-26T01:01:50.000Z", chaptersDone: 0 },
    ...overrides,
  };
}

describe("buildTimeline", () => {
  it("a never-claimed row: the document facts are done, the score stage says queued", () => {
    const t = buildTimeline(row(), { now: NOW })!;
    expect(t.state).toBe("queued");
    expect(t.current).toBe("score");
    expect(t.stages.find((s) => s.key === "read")).toMatchObject({ status: "done", detail: { filename: "deck.pdf", units: 2, unitLabel: "slides", words: 3 } });
    expect(t.stages.find((s) => s.key === "score")?.detail).toMatchObject({ queued: true });
    expect(t.elapsedSec).toBe(120);
    expect(t.remainingSec).toBeGreaterThan(0);
  });

  it("held for today's free cap: state held, no remaining estimate", () => {
    const t = buildTimeline(row(), { now: NOW, heldForCap: true })!;
    expect(t.state).toBe("held");
    expect(t.remainingSec).toBeNull();
    expect(t.stages.find((s) => s.key === "score")?.detail).toMatchObject({ heldForCap: true });
  });

  it("a running row with stages: the envelope's own stages, heartbeat and call count", () => {
    const stages = initialStages({ createdAt: "2026-09-26T01:00:00.000Z", claimedAt: "2026-09-26T01:00:05.000Z", document: {} });
    stages[3] = { key: "evidence", status: "running", startedAt: "2026-09-26T01:00:06.000Z" };
    const env = envelope({ stages, heartbeatAt: "2026-09-26T01:01:58.000Z", deadlineAt: "2026-09-26T01:07:05.000Z", progress: { phase: "gather", pct: 5, at: "2026-09-26T01:01:50.000Z", chaptersDone: 0, calls: 4 } });
    const t = buildTimeline(row({ full_report_status: "running", full_report_json: env, full_report_attempts: 1, full_report_started_at: "2026-09-26T01:00:05.000Z" }), { now: NOW })!;
    expect(t).toMatchObject({ state: "running", current: "evidence", lastUpdateAt: "2026-09-26T01:01:58.000Z", calls: 4 });
    expect(t.stages.find((s) => s.key === "evidence")?.elapsedSec).toBe(114);
    // the stored envelope is never mutated by the view
    expect(env.stages?.[3].detail).toBeUndefined();
  });

  it("a run from before stages existed reads its phase label, without invented timings", () => {
    const t = buildTimeline(row({ full_report_status: "running", full_report_json: envelope({ progress: { phase: "analyze", pct: 40, at: "2026-09-26T01:01:00.000Z", chaptersDone: 2 } }), full_report_attempts: 1 }), { now: NOW })!;
    expect(t.current).toBe("agents");
    expect(t.stages.find((s) => s.key === "dimensions")?.detail).toMatchObject({ done: 2 });
  });

  it("a failed attempt with retries left reads retrying on the stage it stopped at", () => {
    const stages = initialStages({ createdAt: "2026-09-26T01:00:00.000Z", claimedAt: "2026-09-26T01:00:05.000Z", document: {} });
    stages[4] = { key: "agents", status: "failed", startedAt: "2026-09-26T01:00:30.000Z", finishedAt: "2026-09-26T01:01:30.000Z", detail: { reason: "degraded" } };
    const t = buildTimeline(row({ full_report_status: "failed", full_report_json: envelope({ stages }), full_report_attempts: 1 }), { now: NOW })!;
    expect(t.state).toBe("retrying");
    expect(t.stages.find((s) => s.key === "agents")?.detail?.reason).toBe("retrying");
    const last = buildTimeline(row({ full_report_status: "failed", full_report_json: envelope({ stages }), full_report_attempts: 3 }), { now: NOW })!;
    expect(last.state).toBe("failed");
    expect(last.remainingSec).toBeNull();
  });

  it("a report finished before stages existed shows every stage done at 100 %", () => {
    const t = buildTimeline(row({ full_report_status: "done", full_report_json: envelope({ completedAt: "2026-09-26T01:05:00.000Z", progress: { phase: "done", pct: 100, at: "2026-09-26T01:05:00.000Z", chaptersDone: 8 } }), full_report_attempts: 1 }), { now: NOW })!;
    expect(t.stages.every((s) => s.status === "done")).toBe(true);
    expect(t).toMatchObject({ state: "done", percent: 100, remainingSec: null, elapsedSec: 300 });
  });

  it("an S32 seven-voice row has no timeline", () => {
    expect(buildTimeline(row({ full_report_status: "running", full_report_json: sampleReport() }), { now: NOW })).toBeNull();
  });
});

describe("buildFullReportView — timeline in the payload", () => {
  it("carries the timeline even for a locked guest and before the report is readable", () => {
    const v = buildFullReportView(row({ full_report_email: null }), { now: NOW });
    expect(v.locked).toBe(true);
    expect(v.reportV2).toBeNull();
    expect(v.timeline?.state).toBe("queued");
  });
});
