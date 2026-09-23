// Colocated suite for the first-analysis job runner (S32-B).
//
// Every dependency is injected: an in-memory row, a stub agent caller, a
// stub deliverer. Pins the state machine —
//   * not claimable → nothing happens;
//   * deterministic sections persist BEFORE any agent runs;
//   * progress.current names the agent being written; each section is
//     persisted as it lands (streaming contract);
//   * a capacity error waits (recorded as queuedForSec) and retries the
//     same agent, never fails it outright;
//   * a section that cannot be written marks the job failed, keeps the
//     six that succeeded, and a re-run reuses them (no double spend);
//   * all seven → done → deliver called once; deliver honours send-once.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai-client", () => ({ callAI: vi.fn() }));
vi.mock("@/lib/entitlements", () => ({ getEntitlements: vi.fn().mockResolvedValue([]) }));
// G25-C — the ledger stamp behind recordFreeReportDelivery (dynamic imports).
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

import { AICapacityError } from "@/lib/ai/capacity";
import { deliverFullReport, intakeFromRow, recordFreeReportDelivery, runFirstAnalysisJob, type DeliverDeps, type JobDeps } from "./job";
import type { FullReportRow } from "./store";
import { sampleIntake, sampleReport, SAMPLE_ANALYSIS_ID } from "./fixtures";
import { FIRST_ANALYSIS_AGENTS, type FirstAnalysisReport } from "./types";

const WORDS = Array.from({ length: 170 }, (_, i) => `w${i}`).join(" ");
const GOOD = (role: string) => `TITLE: ${role} view\n\n${WORDS}\n\nNEXT:\n1. one\n2. two\n3. three`;

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
    created_at: "2026-09-15T00:00:00Z",
    full_report_status: "queued",
    full_report_json: null,
    full_report_error: null,
    full_report_attempts: 0,
    full_report_started_at: null,
    full_report_finished_at: null,
    full_report_email: null,
    full_report_emailed_at: null,
    ...overrides,
  };
}

interface Harness {
  deps: JobDeps;
  saves: FirstAnalysisReport[];
  finishes: { status: string; error?: string | null; resetEmailed?: boolean }[];
  deliver: ReturnType<typeof vi.fn>;
  sleeps: number[];
}

function harness(r: FullReportRow | null, callAgent: JobDeps["callAgent"]): Harness {
  const saves: FirstAnalysisReport[] = [];
  const finishes: Harness["finishes"] = [];
  const sleeps: number[] = [];
  const deliver = vi.fn().mockResolvedValue("sent");
  const deps: JobDeps = {
    now: () => new Date("2026-09-15T00:00:00Z"),
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    claim: async () => r,
    load: async () => r,
    saveProgress: async (_id, report) => {
      saves.push(JSON.parse(JSON.stringify(report)));
      return true;
    },
    finish: async (_id, outcome) => {
      finishes.push({ status: outcome.status, error: outcome.error, ...(outcome.status === "done" ? { resetEmailed: Boolean(outcome.resetEmailed) } : {}) });
      return true;
    },
    callAgent,
    deliver,
    capacityRetries: 2,
    maxAttempts: 3,
    maxWaitMs: 60_000,
  };
  return { deps, saves, finishes, deliver, sleeps };
}

describe("runFirstAnalysisJob", () => {
  it("does nothing when the row cannot be claimed", async () => {
    const h = harness(null, vi.fn());
    expect(await runFirstAnalysisJob(SAMPLE_ANALYSIS_ID, h.deps)).toEqual({ outcome: "not_claimable" });
    expect(h.saves).toHaveLength(0);
    expect(h.finishes).toHaveLength(0);
  });

  it("fails cleanly when the row has no signals", async () => {
    const h = harness(row({ intake: {} }), vi.fn());
    expect(await runFirstAnalysisJob(SAMPLE_ANALYSIS_ID, h.deps)).toEqual({ outcome: "no_signals" });
    expect(h.finishes).toEqual([{ status: "failed", error: "analysis has no signals to score" }]);
  });

  it("writes the deterministic sections first, streams each agent in, then delivers once", async () => {
    const call = vi.fn(async (req: { agentId: string }) => ({ text: GOOD(req.agentId), provider: "claude", model: "m" }));
    const h = harness(row(), call);
    const out = await runFirstAnalysisJob(SAMPLE_ANALYSIS_ID, h.deps);
    expect(out).toMatchObject({ outcome: "done", emailed: "sent" });
    expect(call).toHaveBeenCalledTimes(7);

    // First save: skeleton with the CEO named as current and no agents yet.
    const first = h.saves[0];
    expect(first.svi.dimensions).toHaveLength(8);
    expect(first.valuation.basis).toBe("revenue");
    expect(first.echo.rows.length).toBe(11);
    expect(first.agents).toEqual({});
    expect(first.progress.current).toBe("ceo");

    // Sections accumulate in writing order.
    const withCfo = h.saves.find((s) => s.agents.cfo && !s.agents.cmo);
    expect(withCfo?.agents.ceo).toBeDefined();
    expect(withCfo?.progress.completed).toEqual(["ceo", "cfo"]);

    const last = h.saves.at(-1)!;
    expect(Object.keys(last.agents).sort()).toEqual([...FIRST_ANALYSIS_AGENTS].sort());
    expect(last.progress).toEqual({ current: null, completed: [...FIRST_ANALYSIS_AGENTS], failed: [] });
    expect(h.finishes).toEqual([{ status: "done", error: null, resetEmailed: false }]);
    expect(h.deliver).toHaveBeenCalledTimes(1);
    expect(h.deliver.mock.calls[0][1].completedAt).toBe("2026-09-15T00:00:00.000Z");
  });

  it("S32-C: routes the CEO as `synthesis` and the other voices as `report`, records the serving provider+model into meta and the last-report file", async () => {
    const call = vi.fn(async (req: { agentId: string; taskClass: string }) => ({
      text: GOOD(req.agentId),
      provider: req.agentId === "first-analysis-ceo" ? "gemini" : "deepinfra",
      model: req.agentId === "first-analysis-ceo" ? "gemini-3.1-pro-preview" : "deepseek-ai/DeepSeek-V4-Flash",
    }));
    const h = harness(row(), call);
    const records: unknown[] = [];
    h.deps.recordLastReport = (rec) => { records.push(rec); };
    await runFirstAnalysisJob(SAMPLE_ANALYSIS_ID, h.deps);
    const classes = Object.fromEntries(call.mock.calls.map(([req]) => [req.agentId, req.taskClass]));
    expect(classes["first-analysis-ceo"]).toBe("synthesis");
    for (const role of FIRST_ANALYSIS_AGENTS.filter((r) => r !== "ceo")) expect(classes[`first-analysis-${role}`]).toBe("report");

    const delivered = h.deliver.mock.calls[0][1] as FirstAnalysisReport;
    expect(delivered.agents.ceo?.taskClass).toBe("synthesis");
    expect(delivered.agents.cfo?.taskClass).toBe("report");
    expect(delivered.meta?.sections.ceo).toEqual({ provider: "gemini", model: "gemini-3.1-pro-preview", taskClass: "synthesis", status: "done" });
    expect(delivered.meta?.sections.cfo).toEqual({ provider: "deepinfra", model: "deepseek-ai/DeepSeek-V4-Flash", taskClass: "report", status: "done" });
    expect(delivered.meta?.models).toEqual(["DeepSeek-V4-Flash via DeepInfra", "gemini-3.1-pro-preview via Google Gemini"]);
    expect(delivered.meta?.preparedWith).toBe("Prepared with DeepSeek-V4-Flash via DeepInfra · gemini-3.1-pro-preview via Google Gemini.");

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      at: "2026-09-15T00:00:00.000Z",
      analysis_id: SAMPLE_ANALYSIS_ID,
      provider: "deepinfra",
      model: "deepseek-ai/DeepSeek-V4-Flash",
      sections_written: 7,
      sections_failed: 0,
    });
    expect((records[0] as { sections: Record<string, { task_class: string }> }).sections.ceo.task_class).toBe("synthesis");
  });

  it("S32-C: a throwing last-report recorder never blocks delivery", async () => {
    const call = vi.fn(async (req: { agentId: string }) => ({ text: GOOD(req.agentId), provider: "groq", model: "openai/gpt-oss-120b" }));
    const h = harness(row(), call);
    h.deps.recordLastReport = () => { throw new Error("disk full"); };
    expect(await runFirstAnalysisJob(SAMPLE_ANALYSIS_ID, h.deps)).toMatchObject({ outcome: "done", emailed: "sent" });
  });

  it("waits on a capacity error, records the queue, and retries the same agent", async () => {
    let cfoCalls = 0;
    const call = vi.fn(async (req: { agentId: string }) => {
      if (req.agentId === "first-analysis-cfo" && cfoCalls++ === 0) {
        throw new AICapacityError("queue_full", 9, { queued: 5, running: 4 });
      }
      return { text: GOOD(req.agentId) };
    });
    const h = harness(row(), call);
    const out = await runFirstAnalysisJob(SAMPLE_ANALYSIS_ID, h.deps);
    expect(out.outcome).toBe("done");
    expect(h.sleeps).toEqual([9_000]);
    const queued = h.saves.find((s) => s.progress.queuedForSec === 9);
    expect(queued?.progress.current).toBe("cfo");
    expect(call.mock.calls.filter((c) => c[0].agentId === "first-analysis-cfo")).toHaveLength(2);
  });

  it("retries a voice once after a provider fault (401 from an overflow key), then moves on", async () => {
    let cmoCalls = 0;
    const call = vi.fn(async (req: { agentId: string }) => {
      if (req.agentId === "first-analysis-cmo" && cmoCalls++ === 0) throw new Error('HTTP 401: {"code":"INVALID_API_KEY"}');
      return { text: GOOD(req.agentId) };
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const h = harness(row(), call);
    const out = await runFirstAnalysisJob(SAMPLE_ANALYSIS_ID, h.deps);
    expect(out.outcome).toBe("done");
    expect(h.sleeps).toEqual([1_500]);
    expect(call.mock.calls.filter((c) => c[0].agentId === "first-analysis-cmo")).toHaveLength(2);
  });

  it("marks the job failed when fewer than four voices can be written, keeps the others, and does not deliver", async () => {
    const call = vi.fn(async (req: { agentId: string }) =>
      ["first-analysis-clo", "first-analysis-chro", "first-analysis-cpo", "first-analysis-cto"].includes(req.agentId) ? { text: "No." } : { text: GOOD(req.agentId) },
    );
    const h = harness(row(), call);
    const out = await runFirstAnalysisJob(SAMPLE_ANALYSIS_ID, h.deps);
    expect(out).toMatchObject({ outcome: "failed", failed: ["cto", "cpo", "clo", "chro"] });
    expect((out as { completed: string[] }).completed).toHaveLength(3);
    expect(h.finishes[0].status).toBe("failed");
    expect(h.finishes[0].error).toMatch(/clo/);
    expect(h.deliver).not.toHaveBeenCalled();
    // Per-section state and meta are written even on a failed run (2026-09-15: meta was null).
    const last = h.saves.at(-1)!;
    expect(last.sections?.clo).toMatchObject({ status: "failed", attempts: 1 });
    expect(last.sections?.ceo).toMatchObject({ status: "done", attempts: 1 });
    expect(last.meta?.sections.ceo).toMatchObject({ status: "done" });
    expect(last.meta?.preparedWith).toBe("Prepared with BlockID's C-level AI agents.");
  });

  it("S32-E: a whole-job last attempt with fewer than four voices marks the rest unavailable and delivers what exists", async () => {
    const call = vi.fn(async (req: { agentId: string }) =>
      ["first-analysis-clo", "first-analysis-chro", "first-analysis-cpo", "first-analysis-cto"].includes(req.agentId) ? { text: "No." } : { text: GOOD(req.agentId) },
    );
    const h = harness(row({ full_report_status: "failed", full_report_attempts: 3 }), call);
    const out = await runFirstAnalysisJob(SAMPLE_ANALYSIS_ID, h.deps);
    expect(out).toMatchObject({ outcome: "done", failed: ["cto", "cpo", "clo", "chro"], emailed: "sent" });
    expect(h.finishes[0]).toMatchObject({ status: "done" });
    expect(h.finishes[0].error).toMatch(/clo/);
    expect(h.deliver).toHaveBeenCalledTimes(1);
    const delivered = h.deliver.mock.calls[0][1] as FirstAnalysisReport;
    expect(delivered.sections?.clo?.status).toBe("unavailable");
    expect(delivered.completedAt).toBeTruthy();
  });

  it("re-uses sections a previous attempt already produced", async () => {
    const prior = sampleReport();
    delete prior.agents.chro; // the one that failed last time
    const call = vi.fn(async (req: { agentId: string }) => ({ text: GOOD(req.agentId) }));
    const h = harness(row({ full_report_status: "failed", full_report_attempts: 1, full_report_json: prior }), call);
    const out = await runFirstAnalysisJob(SAMPLE_ANALYSIS_ID, h.deps);
    expect(out.outcome).toBe("done");
    expect(call).toHaveBeenCalledTimes(1);
    expect(call.mock.calls[0][0].agentId).toBe("first-analysis-chro");
    expect(h.saves.at(-1)!.agents.ceo?.title).toBe(prior.agents.ceo!.title);
  });

  // Defect 2 (live run 2026-09-15 09:18 UTC): 3 of 7 written → `failed`,
  // nothing shown, nothing emailed. Now ≥ 4 of 7 → `done_partial`, emailed
  // as part 1, backfilled by the cron section by section, emailed again.
  describe("S32-E: partial delivery", () => {
    const BAD = new Set(["first-analysis-clo", "first-analysis-chro", "first-analysis-cpo"]);

    it("4 of 7 → done_partial: the finished sections are kept, the row is emailed once as part 1, meta names every model", async () => {
      const call = vi.fn(async (req: { agentId: string }) =>
        BAD.has(req.agentId) ? { text: "No.", provider: "groq", model: "allam-2-7b" } : { text: GOOD(req.agentId), provider: "deepinfra", model: "deepseek-ai/DeepSeek-V4-Flash" },
      );
      const h = harness(row(), call);
      const out = await runFirstAnalysisJob(SAMPLE_ANALYSIS_ID, h.deps);
      expect(out).toMatchObject({ outcome: "done_partial", failed: ["cpo", "clo", "chro"], emailed: "sent" });
      expect((out as { completed: string[] }).completed).toEqual(["ceo", "cfo", "cmo", "cto"]);
      expect(h.finishes).toEqual([{ status: "done_partial", error: expect.stringMatching(/3 section\(s\) not written: cpo, clo, chro.*3 still being written/) }]);
      expect(h.deliver).toHaveBeenCalledTimes(1);
      expect(h.deliver.mock.calls[0][0].full_report_status).toBe("done_partial");
      const delivered = h.deliver.mock.calls[0][1] as FirstAnalysisReport;
      expect(delivered.partialAt).toBe("2026-09-15T00:00:00.000Z");
      expect(delivered.completedAt).toBeUndefined();
      expect(delivered.sections?.clo).toMatchObject({ status: "failed", attempts: 1, provider: "groq", model: "allam-2-7b" });
      expect(delivered.meta?.sections.ceo).toMatchObject({ provider: "deepinfra", status: "done" });
      expect(delivered.meta?.sections.clo).toMatchObject({ provider: "groq", model: "allam-2-7b", status: "failed" });
      expect(delivered.meta?.preparedWith).toBe("Prepared with DeepSeek-V4-Flash via DeepInfra.");
    });

    it("the cron backfills only the missing sections, then the row is done and the complete report is emailed once more", async () => {
      // Run 1 → partial (part 1 emailed, stamp set on the row).
      const call1 = vi.fn(async (req: { agentId: string }) => (BAD.has(req.agentId) ? { text: "No." } : { text: GOOD(req.agentId) }));
      const h1 = harness(row(), call1);
      const out1 = await runFirstAnalysisJob(SAMPLE_ANALYSIS_ID, h1.deps);
      expect(out1.outcome).toBe("done_partial");
      const partial = h1.deliver.mock.calls[0][1] as FirstAnalysisReport;

      // Run 2 (cron, 5 min later): the row is done_partial, part 1 was emailed.
      const call2 = vi.fn(async (req: { agentId: string }) => ({ text: GOOD(req.agentId) }));
      const r2 = row({ full_report_status: "done_partial", full_report_attempts: 2, full_report_json: partial, full_report_emailed_at: "2026-09-15T00:00:05Z", full_report_email: "founder@example.com" });
      const h2 = harness(r2, call2);
      h2.deps.now = () => new Date("2026-09-15T00:05:00Z");
      const out2 = await runFirstAnalysisJob(SAMPLE_ANALYSIS_ID, h2.deps);
      expect(out2).toMatchObject({ outcome: "done", failed: [], emailed: "sent", error: null });
      // Only the three missing voices were written.
      expect(call2.mock.calls.map((c) => c[0].agentId).sort()).toEqual(["first-analysis-chro", "first-analysis-clo", "first-analysis-cpo"]);
      // Finished as done with the send-once stamp given back, so the complete email goes out.
      expect(h2.finishes).toEqual([{ status: "done", error: null, resetEmailed: true }]);
      expect(h2.deliver).toHaveBeenCalledTimes(1);
      expect(h2.deliver.mock.calls[0][0]).toMatchObject({ full_report_status: "done", full_report_emailed_at: null });
      const complete = h2.deliver.mock.calls[0][1] as FirstAnalysisReport;
      expect(complete.delivery?.partialEmailedAt).toBe("2026-09-15T00:00:05Z");
      expect(complete.partialAt).toBe("2026-09-15T00:00:00.000Z");
      expect(complete.completedAt).toBe("2026-09-15T00:05:00.000Z");
      expect(Object.keys(complete.agents)).toHaveLength(7);
      expect(complete.sections?.clo).toMatchObject({ status: "done", attempts: 2 });
      expect(complete.sections?.ceo).toMatchObject({ status: "done", attempts: 1 });
    });

    it("a partial whose part 1 was never emailed (no destination) finishes as a single, first-time email", async () => {
      const prior = sampleReport();
      delete prior.agents.clo;
      prior.partialAt = "2026-09-15T00:00:00.000Z";
      prior.sections = { clo: { status: "failed", attempts: 1 } };
      const call = vi.fn(async (req: { agentId: string }) => ({ text: GOOD(req.agentId) }));
      const h = harness(row({ full_report_status: "done_partial", full_report_attempts: 2, full_report_json: prior, full_report_emailed_at: null }), call);
      const out = await runFirstAnalysisJob(SAMPLE_ANALYSIS_ID, h.deps);
      expect(out.outcome).toBe("done");
      expect(h.finishes[0]).toMatchObject({ status: "done", resetEmailed: false });
      const complete = h.deliver.mock.calls[0][1] as FirstAnalysisReport;
      expect(complete.delivery?.partialEmailedAt).toBeUndefined();
    });

    it("each section gets at most SECTION_MAX_ATTEMPTS; then it is unavailable and the row is done", async () => {
      const prior = sampleReport();
      delete prior.agents.clo;
      delete prior.agents.chro;
      prior.partialAt = "2026-09-15T00:00:00.000Z";
      prior.sections = { clo: { status: "failed", attempts: 2 }, chro: { status: "failed", attempts: 3 } };
      const call = vi.fn(async () => ({ text: "No." }));
      const h = harness(row({ full_report_status: "done_partial", full_report_attempts: 3, full_report_json: prior, full_report_emailed_at: "2026-09-15T00:00:05Z" }), call);
      const out = await runFirstAnalysisJob(SAMPLE_ANALYSIS_ID, h.deps);
      // chro was already at the cap → not called; clo gets its third and last try.
      expect(call.mock.calls.map((c) => c[0].agentId)).toEqual(["first-analysis-clo", "first-analysis-clo"]);
      expect(out).toMatchObject({ outcome: "done", failed: ["clo", "chro"], emailed: "sent" });
      expect(h.finishes[0]).toMatchObject({ status: "done", resetEmailed: true });
      expect(h.finishes[0].error).toMatch(/2 unavailable after 3 attempts/);
      const complete = h.deliver.mock.calls[0][1] as FirstAnalysisReport;
      expect(complete.sections?.clo).toMatchObject({ status: "unavailable", attempts: 3 });
      expect(complete.sections?.chro).toMatchObject({ status: "unavailable", attempts: 3 });
      expect(complete.meta?.sections.clo?.status).toBe("unavailable");
    });

    it("a capacity wait that runs out does not spend one of the section's attempts", async () => {
      const call = vi.fn(async (req: { agentId: string }) => {
        if (req.agentId === "first-analysis-cfo") throw new AICapacityError("queue_full", 3, { queued: 5, running: 4 });
        return { text: GOOD(req.agentId) };
      });
      const h = harness(row(), call);
      const out = await runFirstAnalysisJob(SAMPLE_ANALYSIS_ID, h.deps);
      expect(out.outcome).toBe("done_partial");
      expect(h.saves.at(-1)!.sections?.cfo).toMatchObject({ status: "failed", attempts: 0 });
    });
  });
});

describe("deliverFullReport", () => {
  function deliverDeps(overrides: Partial<DeliverDeps> = {}): DeliverDeps & { send: ReturnType<typeof vi.fn>; claimSend: ReturnType<typeof vi.fn>; releaseSend: ReturnType<typeof vi.fn> } {
    const send = vi.fn().mockResolvedValue({ ok: true });
    const claimSend = vi.fn().mockResolvedValue(true);
    const releaseSend = vi.fn().mockResolvedValue(undefined);
    return {
      now: () => new Date(),
      resolveEmail: async (r) => r.full_report_email,
      resolveVariant: async () => "free",
      claimSend,
      releaseSend,
      renderPdf: async () => ({ buffer: Buffer.from("%PDF-1.4"), pages: 17 }),
      send,
      ...overrides,
    } as DeliverDeps & { send: ReturnType<typeof vi.fn>; claimSend: ReturnType<typeof vi.fn>; releaseSend: ReturnType<typeof vi.fn> };
  }

  beforeEach(() => vi.clearAllMocks());

  it("refuses when the job is not done, or no destination is known", async () => {
    const report = sampleReport();
    expect(await deliverFullReport(row({ full_report_status: "running" }), report, {}, deliverDeps())).toBe("not_done");
    expect(await deliverFullReport(row({ full_report_status: "done" }), report, {}, deliverDeps())).toBe("no_destination");
  });

  it("sends once: the second call loses the claim", async () => {
    const deps = deliverDeps();
    deps.claimSend.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const r = row({ full_report_status: "done", full_report_email: "founder@example.com" });
    expect(await deliverFullReport(r, sampleReport(), {}, deps)).toBe("sent");
    expect(await deliverFullReport(r, sampleReport(), {}, deps)).toBe("already_sent");
    expect(deps.send).toHaveBeenCalledTimes(1);
    expect(deps.send.mock.calls[0][0]).toMatchObject({ to: "founder@example.com", pages: 17, company: "Kelpie" });
  });

  it("releases the claim when the send provably failed, and passes through 'unsubscribed'", async () => {
    const deps = deliverDeps();
    deps.send.mockResolvedValueOnce({ ok: false, reason: "unsubscribed" });
    const r = row({ full_report_status: "done", full_report_email: "founder@example.com" });
    expect(await deliverFullReport(r, sampleReport(), {}, deps)).toBe("unsubscribed");
    expect(deps.releaseSend).toHaveBeenCalledWith(SAMPLE_ANALYSIS_ID, "unsubscribed");
  });

  it("force (resend) skips the claim and never releases", async () => {
    const deps = deliverDeps();
    deps.claimSend.mockResolvedValue(false);
    const r = row({ full_report_status: "done", full_report_email: "founder@example.com" });
    expect(await deliverFullReport(r, sampleReport(), { force: true }, deps)).toBe("sent");
    expect(deps.claimSend).not.toHaveBeenCalled();
    deps.send.mockResolvedValueOnce({ ok: false, reason: "send_error" });
    expect(await deliverFullReport(r, sampleReport(), { force: true }, deps)).toBe("send_failed");
    expect(deps.releaseSend).not.toHaveBeenCalled();
  });

  // G25-C — the free-allowance ledger is stamped from the delivery outcome.
  it("stamps the ledger 'sent' on an accepted e-mail and 'failed' on a refused / thrown one; a throwing stamp never changes the outcome", async () => {
    const recordDelivery = vi.fn().mockResolvedValue(undefined);
    const deps = deliverDeps({ recordDelivery });
    const r = row({ full_report_status: "done", full_report_email: "founder@example.com" });
    expect(await deliverFullReport(r, sampleReport(), {}, deps)).toBe("sent");
    expect(recordDelivery).toHaveBeenLastCalledWith(r, "sent", "single");
    deps.send.mockResolvedValueOnce({ ok: false, reason: "send_error" });
    expect(await deliverFullReport(r, sampleReport(), {}, deps)).toBe("send_failed");
    expect(recordDelivery).toHaveBeenLastCalledWith(r, "failed", "single");
    deps.send.mockRejectedValueOnce(new Error("smtp"));
    expect(await deliverFullReport(r, sampleReport(), {}, deps)).toBe("send_failed");
    expect(recordDelivery).toHaveBeenLastCalledWith(r, "failed", "single");
    recordDelivery.mockRejectedValueOnce(new Error("ledger down"));
    expect(await deliverFullReport(r, sampleReport(), {}, deps)).toBe("sent");
    // no stamp dep at all (older doubles) → still sends
    expect(await deliverFullReport(r, sampleReport(), {}, deliverDeps())).toBe("sent");
  });
});

describe("recordFreeReportDelivery (G25-C)", () => {
  const emitMock = emitDeliveredMock;

  beforeEach(() => {
    grantsMock.grantForAnalysis.mockReset();
    grantsMock.markDelivered.mockReset();
    emitMock.mockReset();
  });

  const grant = (status: "queued" | "sent" | "failed") => ({ id: "g1", email: "founder@example.com", sequence_no: 1, source: "guest", delivery_status: status });

  it("no grant (an entitled run) → nothing stamped, nothing emitted", async () => {
    grantsMock.grantForAnalysis.mockResolvedValue(null);
    await recordFreeReportDelivery(row({ full_report_status: "done" }), "sent");
    expect(grantsMock.markDelivered).not.toHaveBeenCalled();
    expect(emitMock).not.toHaveBeenCalled();
  });

  it("first accepted e-mail → sent + free_report_delivered with the grant id; a later one never re-stamps", async () => {
    grantsMock.grantForAnalysis.mockResolvedValue(grant("queued"));
    grantsMock.markDelivered.mockResolvedValue(grant("sent"));
    await recordFreeReportDelivery(row({ full_report_status: "done_partial", user_id: null }), "sent");
    expect(grantsMock.markDelivered).toHaveBeenCalledWith(SAMPLE_ANALYSIS_ID, "sent");
    expect(emitMock).toHaveBeenCalledWith({ grantId: "g1", sequenceNo: 1, source: "guest", analysisId: SAMPLE_ANALYSIS_ID, userId: null, email: "founder@example.com" });
    grantsMock.grantForAnalysis.mockResolvedValue(grant("sent"));
    grantsMock.markDelivered.mockClear();
    await recordFreeReportDelivery(row({ full_report_status: "done" }), "sent");
    expect(grantsMock.markDelivered).not.toHaveBeenCalled();
  });

  it("a failed send stamps 'failed' only while nothing was ever delivered, and emits nothing", async () => {
    grantsMock.grantForAnalysis.mockResolvedValue(grant("queued"));
    grantsMock.markDelivered.mockResolvedValue(grant("failed"));
    await recordFreeReportDelivery(row({ full_report_status: "done" }), "failed");
    expect(grantsMock.markDelivered).toHaveBeenCalledWith(SAMPLE_ANALYSIS_ID, "failed");
    expect(emitMock).not.toHaveBeenCalled();
    grantsMock.grantForAnalysis.mockResolvedValue(grant("sent"));
    grantsMock.markDelivered.mockClear();
    await recordFreeReportDelivery(row({ full_report_status: "done" }), "failed");
    expect(grantsMock.markDelivered).not.toHaveBeenCalled();
  });
});

 describe("stored scoring source", () => {
  it("preserves an empty admitted source instead of falling back to narrative", () => {
    const r = row();
    r.intake = { ...r.intake, scoringSourceText: "" };
    expect(intakeFromRow(r)?.scoringSourceText).toBe("");
  });
});
