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
import { deliverFullReport, runFirstAnalysisJob, type DeliverDeps, type JobDeps } from "./job";
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
  finishes: { status: string; error?: string | null }[];
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
      finishes.push({ status: outcome.status, error: outcome.error });
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
    expect(first.echo.rows.length).toBe(9);
    expect(first.agents).toEqual({});
    expect(first.progress.current).toBe("ceo");

    // Sections accumulate in writing order.
    const withCfo = h.saves.find((s) => s.agents.cfo && !s.agents.cmo);
    expect(withCfo?.agents.ceo).toBeDefined();
    expect(withCfo?.progress.completed).toEqual(["ceo", "cfo"]);

    const last = h.saves.at(-1)!;
    expect(Object.keys(last.agents).sort()).toEqual([...FIRST_ANALYSIS_AGENTS].sort());
    expect(last.progress).toEqual({ current: null, completed: [...FIRST_ANALYSIS_AGENTS], failed: [] });
    expect(h.finishes).toEqual([{ status: "done", error: null }]);
    expect(h.deliver).toHaveBeenCalledTimes(1);
    expect(h.deliver.mock.calls[0][1].completedAt).toBe("2026-09-15T00:00:00.000Z");
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

  it("marks the job failed when one voice cannot be written, keeps the others, and does not deliver", async () => {
    const call = vi.fn(async (req: { agentId: string }) =>
      req.agentId === "first-analysis-clo" ? { text: "No." } : { text: GOOD(req.agentId) },
    );
    const h = harness(row(), call);
    const out = await runFirstAnalysisJob(SAMPLE_ANALYSIS_ID, h.deps);
    expect(out).toMatchObject({ outcome: "failed", failed: ["clo"] });
    expect((out as { completed: string[] }).completed).toHaveLength(6);
    expect(h.finishes[0].status).toBe("failed");
    expect(h.finishes[0].error).toMatch(/clo/);
    expect(h.deliver).not.toHaveBeenCalled();
  });

  it("on the final attempt a partial report is delivered as-is, with the missing voice recorded", async () => {
    const call = vi.fn(async (req: { agentId: string }) =>
      req.agentId === "first-analysis-clo" ? { text: "No." } : { text: GOOD(req.agentId) },
    );
    const h = harness(row({ full_report_status: "failed", full_report_attempts: 3 }), call);
    const out = await runFirstAnalysisJob(SAMPLE_ANALYSIS_ID, h.deps);
    expect(out).toMatchObject({ outcome: "done", failed: ["clo"], emailed: "sent" });
    expect(h.finishes[0]).toMatchObject({ status: "done" });
    expect(h.finishes[0].error).toMatch(/clo/);
    expect(h.deliver).toHaveBeenCalledTimes(1);
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
});
