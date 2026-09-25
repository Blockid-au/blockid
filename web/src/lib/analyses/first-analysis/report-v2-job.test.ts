// Colocated suite for the ReportV2 job runner (G28-C).
//
// Every dependency is injected: an in-memory row, a stub orchestrator, a
// stub deliverer. Pins —
//   * not claimable → nothing happens; no signals → failed, honestly;
//   * a claimed run orchestrates ONCE with tier standard (the full 16-section
//     document, no free trim), the same computeSVI baseline the screen used,
//     no user for a guest, the owner for an account;
//   * progress is saved as the orchestrator's events land, the envelope
//     carries the document + run telemetry when done, and deliver runs once;
//   * the cost guard: a row whose envelope already holds a document is never
//     orchestrated again — delivered only;
//   * a fully-degraded / thrown pipeline → failed + retryable under the cap,
//     nothing delivered;
//   * delivery: send-once claim, the signed page + PDF links, the PDF twin,
//     the ledger stamped sent / failed, the claim released on a failed send,
//     `force` for the resend button.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai-client", () => ({ callAI: vi.fn() }));
vi.mock("@/lib/entitlements", () => ({ getEntitlements: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/report-pipeline/orchestrator", () => ({
  orchestrateReport: vi.fn(),
  assertReportUsable: (r: { fullyDegraded?: boolean }) => {
    if (r.fullyDegraded) {
      const err = new Error("report fully degraded") as Error & { degradedSections: number; calls: number };
      err.name = "ReportFullyDegradedError";
      err.degradedSections = 8;
      err.calls = 14;
      throw err;
    }
  },
}));
// G25-C — the ledger stamp behind recordFreeReportDelivery (dynamic imports in job.ts).
const grantsMock = vi.hoisted(() => ({ grantForAnalysis: vi.fn(), markDelivered: vi.fn() }));
const emitDeliveredMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/reports/free-grants", () => grantsMock);
vi.mock("@/lib/analytics/funnel", () => ({ emitFreeReportDelivered: emitDeliveredMock }));
vi.mock("./store", () => ({
  FULL_REPORT_MAX_ATTEMPTS: 3,
  claimFullReportEmailSend: vi.fn(),
  claimFullReportJob: vi.fn(),
  finishFullReport: vi.fn(),
  loadFullReportRow: vi.fn(),
  lookupUserEmail: vi.fn(),
  lookupUserPlan: vi.fn(),
  releaseFullReportEmailSend: vi.fn(),
  saveFullReportProgress: vi.fn(),
}));

import { callAI } from "@/lib/ai-client";
import { demoReportV2 } from "@/lib/report-v2/fixtures";
import type { AssembledReport } from "@/lib/report-pipeline/types";
import { sampleIntake, SAMPLE_ANALYSIS_ID } from "./fixtures";
import { captureInvestorIntent } from "@/lib/intake/investor-intent";
import {
  deliverReportV2,
  deliveryLinks,
  lastReportRecordV2,
  newEnvelope,
  makeReportCaller,
  progressFromEvent,
  runReportV2Job,
  tallyingCaller,
  investorIntentFromRow,
  websiteEvidenceFromRow,
  type CallTally,
  type DeliverV2Deps,
  type Orchestrate,
  type ReportV2JobDeps,
} from "./report-v2-job";
import type { FullReportRow } from "./store";
import { FULL_REPORT_V2_VERSION, isReportV2Envelope, type FullReportV2Envelope } from "./types";

const NOW = new Date("2026-09-21T10:00:00Z");

function row(overrides: Partial<FullReportRow> = {}): FullReportRow {
  const intake = sampleIntake();
  return {
    id: SAMPLE_ANALYSIS_ID,
    anon_key: "anon",
    user_id: null,
    input_kind: intake.inputKind,
    input_text: intake.rawText,
    input_chars: intake.rawText.length,
    input_truncated: false,
    input_url: null,
    input_filename: null,
    intake: { signals: intake.signals, structured: {} },
    context: { stage: 4 },
    created_at: "2026-09-21T09:59:00Z",
    full_report_status: "queued",
    full_report_json: null,
    full_report_error: null,
    full_report_attempts: 1,
    full_report_started_at: NOW.toISOString(),
    full_report_finished_at: null,
    full_report_email: "guest@example.com",
    full_report_emailed_at: null,
    ...overrides,
  };
}

function assembled(overrides: Partial<AssembledReport> = {}): AssembledReport {
  return {
    id: "rpt-abc",
    reportV2: demoReportV2(),
    totalWords: 4200,
    consistencyIssues: [],
    llmCalls: 16,
    sections: [],
    executiveSummary: "x",
    qualityScore: 80,
    ...overrides,
  } as unknown as AssembledReport;
}

interface Harness {
  deps: ReportV2JobDeps;
  saves: FullReportV2Envelope[];
  finishes: { status: string; error?: string | null; hasReport: boolean }[];
  deliver: ReturnType<typeof vi.fn>;
  orchestrate: ReturnType<typeof vi.fn>;
}

function harness(r: FullReportRow | null, orchestrate: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(assembled())): Harness {
  const saves: FullReportV2Envelope[] = [];
  const finishes: Harness["finishes"] = [];
  const deliver = vi.fn().mockResolvedValue("sent");
  let tick = 0;
  const deps: ReportV2JobDeps = {
    now: () => new Date(NOW.getTime() + tick++ * 1000),
    claim: async () => r,
    load: async () => r,
    saveProgress: async (_id, envelope) => {
      saves.push(JSON.parse(JSON.stringify(envelope)));
      return true;
    },
    finish: async (_id, outcome) => {
      finishes.push({ status: outcome.status, error: outcome.error, hasReport: Boolean(outcome.report?.report) });
      return true;
    },
    orchestrate: orchestrate as unknown as Orchestrate,
    callAI: vi.fn().mockResolvedValue({ text: "{}", provider: "deepinfra", model: "m-1" }),
    deliver,
    qualityWriter: async () => undefined,
    releaseGrant: vi.fn(async () => 1),
    refundCredits: vi.fn(async () => 3),
    progressEveryMs: 0,
  };
  return { deps, saves, finishes, deliver, orchestrate };
}

describe("runReportV2Job", () => {
  it("does nothing when the row cannot be claimed", async () => {
    const h = harness(null);
    expect(await runReportV2Job(SAMPLE_ANALYSIS_ID, h.deps)).toEqual({ outcome: "not_claimable" });
    expect(h.orchestrate).not.toHaveBeenCalled();
    expect(h.saves).toHaveLength(0);
  });

  it("fails cleanly when the row has no signals", async () => {
    const h = harness(row({ intake: {} }));
    expect(await runReportV2Job(SAMPLE_ANALYSIS_ID, h.deps)).toEqual({ outcome: "no_signals" });
    expect(h.finishes).toEqual([{ status: "failed", error: "analysis has no signals to score", hasReport: false }]);
    expect(h.orchestrate).not.toHaveBeenCalled();
  });

  it("orchestrates once as tier standard (the full document), stores the envelope with the document + telemetry, delivers once", async () => {
    const orchestrate = vi.fn(async (input: { onEvent: (e: unknown) => void; tier: string; tierV2: string; userId: unknown }) => {
      input.onEvent({ type: "context", industry: "SaaS", stage: 2, stageLabel: "Seed", phaseId: "p", tier: "standard", estimatedCalls: 16, estimatedSeconds: 200, dims: [] });
      input.onEvent({ type: "gather_complete", evidenceRows: 12, connectors: [] });
      input.onEvent({ type: "progress", completed: 3, total: 8, phase: "analyze" });
      input.onEvent({ type: "dimension_complete", dim: "tre", chapter: {} });
      input.onEvent({ type: "executive_complete", summary: "s" });
      input.onEvent({ type: "done", reportId: "rpt-abc", totalMs: 180_000, calls: 16, costAud: 0.11, costUsd: 0.07, costReportedCalls: 16, degradedSections: ["lco"], deadlineHit: false, budgetOverruns: 0, verdictTrimmed: 1, autoCited: 2 });
      return assembled();
    });
    const r = row();
    r.intake = { ...r.intake, scoringSourceText: "" };
    const h = harness(r, orchestrate);
    const out = await runReportV2Job(SAMPLE_ANALYSIS_ID, h.deps);
    expect(out).toMatchObject({ outcome: "done", reportId: "rpt-abc", emailed: "sent", calls: 16, degraded: 1 });
    expect(orchestrate).toHaveBeenCalledTimes(1);
    const input = orchestrate.mock.calls[0][0] as unknown as Record<string, unknown> & { sviAnalysis: { totalSVI: number; subs: unknown[] } };
    // The paid document, not the trimmed free tier; the screen's own SVI baseline; a guest has no user.
    expect(input.tier).toBe("standard");
    expect(input.tierV2).toBe("standard");
    expect(input.locale).toBe("en");
    expect(input.userId).toBeNull();
    expect(input.ownerUserId).toBeNull();
    expect(input.projectId).toBeUndefined();
    expect(input.accountId).toBe(`analysis:${SAMPLE_ANALYSIS_ID}`);
    expect(input.rawText).toBe(sampleIntake().rawText);
    expect(input.scoringSourceText).toBe("");
    expect(input.sviAnalysis.subs).toHaveLength(8);
    expect(typeof input.startupName).toBe("string");

    // The first save is the empty envelope; progress follows the events.
    expect(h.saves[0]).toMatchObject({ version: FULL_REPORT_V2_VERSION, analysisId: SAMPLE_ANALYSIS_ID, report: null, progress: { phase: "starting", pct: 0 } });
    const phases = h.saves.map((s) => s.progress.phase);
    expect(phases).toContain("analyze");
    expect(h.saves.some((s) => s.progress.chaptersDone === 1)).toBe(true);

    // Finished: the document, the report id, the run telemetry.
    expect(h.finishes).toEqual([{ status: "done", error: null, hasReport: true }]);
    const envelope = h.deliver.mock.calls[0][1] as FullReportV2Envelope;
    expect(isReportV2Envelope(envelope)).toBe(true);
    expect(envelope.report?.dimensions).toHaveLength(8);
    expect(envelope.report?.source).toBe("pipeline");
    expect(envelope.reportId).toBe("rpt-abc");
    expect(envelope.completedAt).toBeTruthy();
    expect(envelope.progress).toMatchObject({ phase: "done", pct: 100, chaptersDone: 8 });
    expect(envelope.pipeline).toMatchObject({ calls: 16, costUsd: 0.07, durationMs: 180_000, degradedSections: ["lco"], deadlineHit: false });
    expect(h.deliver).toHaveBeenCalledTimes(1);
    expect((h.deliver.mock.calls[0][0] as FullReportRow).full_report_status).toBe("done");
  });

  it("binds the owner for an account run", async () => {
    const h = harness(row({ user_id: "u-1", full_report_email: null }));
    await runReportV2Job(SAMPLE_ANALYSIS_ID, h.deps);
    const input = h.orchestrate.mock.calls[0][0] as { userId: string; ownerUserId: string };
    expect(input.userId).toBe("u-1");
    expect(input.ownerUserId).toBe("u-1");
  });

  it("passes stored investor intent and public website pages to the report without upgrading their trust", async () => {
    const investorIntent = captureInvestorIntent({
      userText: "Review valuation, strengths, weaknesses, risks and points to clarify for an investor.",
      submittedAt: NOW.toISOString(),
    });
    const h = harness(row({
      input_kind: "website",
      intake: {
        signals: sampleIntake().signals,
        investorIntent,
        structured: {
          pages: [
            { url: "https://acme.example/", title: "Acme", status: "available", text: "x" },
            { url: "https://acme.example/pricing", title: "Pricing", status: "blocked", text: "" },
          ],
        },
      },
    }));
    await runReportV2Job(SAMPLE_ANALYSIS_ID, h.deps);
    const input = h.orchestrate.mock.calls[0][0] as {
      investorIntent?: typeof investorIntent;
      evidenceItems: Array<Record<string, unknown>>;
    };
    expect(input.investorIntent?.digestSha256).toBe(investorIntent.digestSha256);
    expect(input.evidenceItems).toEqual([{
      evidence_type: "url",
      confidence_level: "public_url",
      dimension: "ptd",
      label: "Acme — https://acme.example/",
      origin: "founder_text",
    }]);
  });

  it("the cost guard: an envelope that already holds a document is delivered, never orchestrated again", async () => {
    const existing = { ...newEnvelope(SAMPLE_ANALYSIS_ID, "Acme", NOW), report: demoReportV2(), reportId: "rpt-old", completedAt: NOW.toISOString() };
    const h = harness(row({ full_report_status: "failed", full_report_json: existing }));
    const out = await runReportV2Job(SAMPLE_ANALYSIS_ID, h.deps);
    expect(out).toEqual({ outcome: "already_done", emailed: "sent" });
    expect(h.orchestrate).not.toHaveBeenCalled();
    expect(h.finishes).toEqual([{ status: "done", error: null, hasReport: true }]);
    expect(h.deliver).toHaveBeenCalledTimes(1);
  });

  it("a fully-degraded run → failed, retryable under the attempt cap, nothing delivered; the third attempt is final", async () => {
    const h = harness(row({ full_report_attempts: 1 }), vi.fn().mockResolvedValue(assembled({ fullyDegraded: true } as Partial<AssembledReport>)));
    const out = await runReportV2Job(SAMPLE_ANALYSIS_ID, h.deps);
    expect(out).toMatchObject({ outcome: "failed", retryable: true });
    expect((out as { error: string }).error).toMatch(/fully degraded/);
    expect(h.finishes).toEqual([{ status: "failed", error: "report fully degraded", hasReport: false }]);
    expect(h.deliver).not.toHaveBeenCalled();
    const last = harness(row({ full_report_attempts: 3 }), vi.fn().mockRejectedValue(new Error("engine_overloaded")));
    expect(await runReportV2Job(SAMPLE_ANALYSIS_ID, last.deps)).toEqual({ outcome: "failed", error: "engine_overloaded", retryable: false });
    // Review v3.27.0 P1: the terminal failure gives the address its free allowance back; a retryable one does not.
    expect(last.deps.releaseGrant).toHaveBeenCalledWith(SAMPLE_ANALYSIS_ID);
    expect(h.deps.releaseGrant).not.toHaveBeenCalled();
    // AF04: credits a founder paid for the run come back only on the terminal failure.
    expect(last.deps.refundCredits).toHaveBeenCalledWith(SAMPLE_ANALYSIS_ID);
    expect(h.deps.refundCredits).not.toHaveBeenCalled();
  });

  it("AF04: a terminal 'no ReportV2 document' failure also releases the grant and refunds credits", async () => {
    const h = harness(row({ full_report_attempts: 3 }), vi.fn().mockResolvedValue(assembled({ reportV2: undefined })));
    const out = await runReportV2Job(SAMPLE_ANALYSIS_ID, h.deps);
    expect(out).toMatchObject({ outcome: "failed", retryable: false });
    expect(h.deps.releaseGrant).toHaveBeenCalledWith(SAMPLE_ANALYSIS_ID);
    expect(h.deps.refundCredits).toHaveBeenCalledWith(SAMPLE_ANALYSIS_ID);
  });

  it("a usable run with no ReportV2 projection is a failure, not a silent S32 fallback", async () => {
    const h = harness(row(), vi.fn().mockResolvedValue(assembled({ reportV2: undefined })));
    const out = await runReportV2Job(SAMPLE_ANALYSIS_ID, h.deps);
    expect(out).toMatchObject({ outcome: "failed", error: "pipeline returned no ReportV2 document" });
    expect(h.deliver).not.toHaveBeenCalled();
  });
});

describe("pure helpers", () => {
  it("rejects malformed stored intent and non-website evidence", () => {
    expect(investorIntentFromRow(row({ intake: { investorIntent: { version: "bad" } } }))).toBeUndefined();
    expect(websiteEvidenceFromRow(row({ input_kind: "idea_text" }))).toEqual([]);
  });
  it("progressFromEvent moves the phase / pct forward and never backwards", () => {
    let p = newEnvelope("a", "Acme", NOW).progress;
    p = progressFromEvent(p, { type: "context", industry: "", stage: 0, stageLabel: "", phaseId: "", tier: "standard", estimatedCalls: 0, estimatedSeconds: 0, dims: [] }, NOW);
    expect(p).toMatchObject({ phase: "gather", pct: 5 });
    p = progressFromEvent(p, { type: "progress", completed: 6, total: 8, phase: "analyze" as never }, NOW);
    expect(p).toMatchObject({ phase: "analyze", pct: 75 });
    p = progressFromEvent(p, { type: "gather_complete", evidenceRows: 0, connectors: [] }, NOW);
    expect(p.pct).toBe(75);
    p = progressFromEvent(p, { type: "dimension_complete", dim: "tre", chapter: {} as never }, NOW);
    expect(p.chaptersDone).toBe(1);
    p = progressFromEvent(p, { type: "audit_complete", groundedShare: 0.9, revised: 0 }, NOW);
    expect(p).toMatchObject({ phase: "audit", pct: 95 });
  });

  it("tallyingCaller counts provider + model per answered call; lastReportRecordV2 names the most-used one", async () => {
    const tally: CallTally = new Map();
    const inner = vi.fn()
      .mockResolvedValueOnce({ text: "a", provider: "deepinfra", model: "m-1" })
      .mockResolvedValueOnce({ text: "b", provider: "groq", model: "m-2" })
      .mockResolvedValueOnce({ text: "c", provider: "deepinfra", model: "m-1" })
      .mockResolvedValueOnce("plain string");
    const caller = tallyingCaller(inner, tally);
    for (let i = 0; i < 4; i += 1) await caller("s", "u", 100);
    expect([...tally.values()]).toEqual(expect.arrayContaining([{ provider: "deepinfra", model: "m-1", n: 2, costUsd: 0 }, { provider: "groq", model: "m-2", n: 1, costUsd: 0 }]));
    const report = demoReportV2();
    const rec = lastReportRecordV2("a-1", report, tally, NOW);
    expect(rec).toMatchObject({ analysis_id: "a-1", provider: "deepinfra", model: "m-1", models: ["m-1 via deepinfra", "m-2 via groq"] });
    expect(rec.sections_written + rec.sections_failed).toBe(8);
  });

  it("deliveryLinks: the on-page report and the PDF, signed when a token exists; the PDF link needs the token", () => {
    expect(deliveryLinks("a-1", "12.sig", "https://blockid.au/")).toEqual({ pageUrl: "https://blockid.au/analyze/a-1?t=12.sig", pdfUrl: "https://blockid.au/api/analyses/a-1/report.pdf?token=12.sig" });
    expect(deliveryLinks("a-1", null, "https://blockid.au")).toEqual({ pageUrl: "https://blockid.au/analyze/a-1", pdfUrl: null });
  });
});

describe("deliverReportV2", () => {
  const envelope = (): FullReportV2Envelope => ({ ...newEnvelope(SAMPLE_ANALYSIS_ID, "Acme", NOW), report: demoReportV2(), reportId: "rpt-abc", completedAt: NOW.toISOString() });

  function deliverDeps(overrides: Partial<DeliverV2Deps> = {}): DeliverV2Deps & { send: ReturnType<typeof vi.fn>; claimSend: ReturnType<typeof vi.fn>; releaseSend: ReturnType<typeof vi.fn>; recordDelivery: ReturnType<typeof vi.fn> } {
    return {
      now: () => NOW,
      resolveEmail: async (r) => r.full_report_email ?? (r.user_id ? "owner@example.com" : null),
      claimSend: vi.fn().mockResolvedValue(true),
      releaseSend: vi.fn().mockResolvedValue(undefined),
      renderPdf: async () => Buffer.from("%PDF-1.7 fake"),
      send: vi.fn().mockResolvedValue({ ok: true, sentTo: "guest@example.com", pdfAttached: true }),
      recordDelivery: vi.fn().mockResolvedValue(undefined),
      siteUrl: () => "https://blockid.au",
      mintToken: () => "12.sig",
      ...overrides,
    } as DeliverV2Deps & { send: ReturnType<typeof vi.fn>; claimSend: ReturnType<typeof vi.fn>; releaseSend: ReturnType<typeof vi.fn>; recordDelivery: ReturnType<typeof vi.fn> };
  }

  beforeEach(() => {
    grantsMock.grantForAnalysis.mockReset();
    grantsMock.markDelivered.mockReset();
    emitDeliveredMock.mockReset();
  });

  it("sends the document once to the guest's address with the signed page + PDF links and the PDF, then stamps the ledger sent", async () => {
    const deps = deliverDeps();
    const r = row({ full_report_status: "done" });
    expect(await deliverReportV2(r, envelope(), {}, deps)).toBe("sent");
    expect(deps.claimSend).toHaveBeenCalledWith(r.id);
    expect(deps.send).toHaveBeenCalledTimes(1);
    const args = deps.send.mock.calls[0][0] as { to: string; pageUrl: string; pdfUrl: string; pdf: Buffer; report: { dimensions: unknown[] } };
    expect(args.to).toBe("guest@example.com");
    expect(args.pageUrl).toBe(`https://blockid.au/analyze/${r.id}?t=12.sig`);
    expect(args.pdfUrl).toBe(`https://blockid.au/api/analyses/${r.id}/report.pdf?token=12.sig`);
    expect(args.pdf?.byteLength).toBeGreaterThan(0);
    expect(args.report.dimensions).toHaveLength(8);
    expect(deps.recordDelivery).toHaveBeenCalledWith(r, "sent");
    expect(deps.releaseSend).not.toHaveBeenCalled();
  });

  it("honours send-once, resolves the account address for an owner, and is honest about not_done / no_destination", async () => {
    const deps = deliverDeps({ claimSend: vi.fn().mockResolvedValue(false) });
    expect(await deliverReportV2(row({ full_report_status: "done" }), envelope(), {}, deps)).toBe("already_sent");
    expect(deps.send).not.toHaveBeenCalled();
    const owner = deliverDeps();
    expect(await deliverReportV2(row({ full_report_status: "done", full_report_email: null, user_id: "u-1" }), envelope(), {}, owner)).toBe("sent");
    expect((owner.send.mock.calls[0][0] as { to: string }).to).toBe("owner@example.com");
    expect(await deliverReportV2(row({ full_report_status: "running" }), envelope(), {}, deliverDeps())).toBe("not_done");
    expect(await deliverReportV2(row({ full_report_status: "done" }), { ...envelope(), report: null }, {}, deliverDeps())).toBe("not_done");
    expect(await deliverReportV2(row({ full_report_status: "done", full_report_email: null }), envelope(), {}, deliverDeps())).toBe("no_destination");
  });

  it("a failed send releases the claim and stamps failed; unsubscribed is reported as such; a PDF render failure still sends the links", async () => {
    const failed = deliverDeps({ send: vi.fn().mockResolvedValue({ ok: false, reason: "smtp_down" }) });
    const r = row({ full_report_status: "done" });
    expect(await deliverReportV2(r, envelope(), {}, failed)).toBe("send_failed");
    expect(failed.releaseSend).toHaveBeenCalledWith(r.id, "smtp_down");
    expect(failed.recordDelivery).toHaveBeenCalledWith(r, "failed");
    const unsub = deliverDeps({ send: vi.fn().mockResolvedValue({ ok: false, reason: "unsubscribed" }) });
    expect(await deliverReportV2(r, envelope(), {}, unsub)).toBe("unsubscribed");
    const noPdf = deliverDeps({ renderPdf: async () => { throw new Error("react-pdf"); } });
    expect(await deliverReportV2(r, envelope(), {}, noPdf)).toBe("sent");
    expect((noPdf.send.mock.calls[0][0] as { pdf: Buffer | null; pdfUrl: string }).pdf).toBeNull();
    expect((noPdf.send.mock.calls[0][0] as { pdfUrl: string }).pdfUrl).toContain("/report.pdf?token=");
  });

  it("force (the resend button) skips the send-once claim and never releases it", async () => {
    const deps = deliverDeps({ claimSend: vi.fn().mockResolvedValue(false), send: vi.fn().mockResolvedValue({ ok: false, reason: "smtp_down" }) });
    expect(await deliverReportV2(row({ full_report_status: "done" }), envelope(), { force: true }, deps)).toBe("send_failed");
    expect(deps.claimSend).not.toHaveBeenCalled();
    expect(deps.releaseSend).not.toHaveBeenCalled();
  });
});


describe("customer report AI policy", () => {
  it("binds every stage to the report policy while preserving run strikes and usage", async () => {
    const mock = vi.mocked(callAI);
    mock.mockResolvedValue({ text: "analysis", provider: "groq", via: "deepinfra", model: "exact-model", cost_usd: 0.02 });
    const caller = makeReportCaller("analysis-policy", "owner-1");
    for (const taskClass of ["report", "synthesis", "classify"] as const) {
      expect(await caller("rubric", "evidence", 800, taskClass)).toEqual({
        text: "analysis", provider: "deepinfra", model: "exact-model", costUsd: 0.02,
      });
      expect(mock).toHaveBeenLastCalledWith(expect.objectContaining({
        policy: "blockid-report-v1", system: "rubric", user: "evidence", maxTokens: 800,
        taskClass, agentId: "svi:analysis:analysis-policy", runStrikes: expect.any(Object),
      }));
    }
    const calls = mock.mock.calls.slice(-3);
    expect(calls[1][0].runStrikes).toBe(calls[0][0].runStrikes);
    expect(calls[2][0].runStrikes).toBe(calls[0][0].runStrikes);
  });
});
