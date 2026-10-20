// G35 A2 — end-to-end wiring of the model-eval cron with a FAKE transport:
// real golden set, real coordinator, runtime files in a temp BLOCKID_WEB_DIR.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { resetRuntimeWebDirCache } from "@/lib/runtime-paths";
import type { ModelCallRequest, ModelCallResponse } from "./model-eval";
import { parseRoutingPolicy } from "./routing-policy";
import { isEvalCallable } from "./task-profiles";

vi.mock("server-only", () => ({}));
// P2-3 wiring goes to the shared paid-spend ledger — NEVER the live file from a test.
const spend = vi.hoisted(() => ({ record: vi.fn(), capReached: vi.fn(() => false) }));
vi.mock("./spend-guard", () => ({ recordPaidSpend: (p: string, usd: number) => spend.record(p, usd), isDailyCapReached: () => spend.capReached() }));

let dir = "";
const saved = process.env.BLOCKID_WEB_DIR;

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "model-eval-cron-"));
  process.env.BLOCKID_WEB_DIR = dir;
  resetRuntimeWebDirCache();
  writeFileSync(path.join(dir, "free.json"), JSON.stringify({ groq: ["qwen/qwen3.8-27b", "openai/gpt-oss-120b"] }));
});
afterAll(() => {
  if (saved === undefined) delete process.env.BLOCKID_WEB_DIR;
  else process.env.BLOCKID_WEB_DIR = saved;
  resetRuntimeWebDirCache();
  rmSync(dir, { recursive: true, force: true });
});

const reports = (f: string) => path.join(dir, "content", "reports", f);

describe("runModelEvalCron", () => {
  const seen: ModelCallRequest[] = [];
  const call = vi.fn(async (req: ModelCallRequest): Promise<ModelCallResponse> => {
    seen.push(req);
    return { ok: true, text: JSON.stringify({ sector: "saas", stage: "seed" }), latencyMs: 50, inputTokens: 400, outputTokens: 50 };
  });
  const overrides = () => ({
    freeModelsFile: path.join(dir, "free.json"),
    deps: { call, configured: (p: string) => p === "deepinfra" || p === "groq", paceMs: () => 0 },
  });

  it("dry run plans from the real golden set and calls nothing", async () => {
    const { runModelEvalCron } = await import("./model-eval-cron");
    const r = await runModelEvalCron({ mode: "full", dryRun: true }, overrides());
    expect(r.status).toBe("dry_run");
    expect(r.planned).toBeGreaterThan(100);
    expect(r.worst_case_usd).toBeGreaterThan(0);
    expect(r.worst_case_usd).toBeLessThan(5);
    expect(call).not.toHaveBeenCalled();
    expect(existsSync(reports("model-eval-state-full.json"))).toBe(false);
  });

  it("a smoke run finishes, is coordinated, and writes scorecard + policy + history under the runtime dir", async () => {
    const { runModelEvalCron } = await import("./model-eval-cron");
    const r = await runModelEvalCron({ mode: "smoke" }, overrides());
    expect(r).toMatchObject({ status: "done", finalized: true, coordinated: true, remaining: 0 });
    expect(seen.length).toBe(r.planned);
    expect(seen.every((q) => isEvalCallable(q.provider, q.model) && (q.provider === "deepinfra" || q.provider === "groq"))).toBe(true);
    const policy = parseRoutingPolicy(JSON.parse(readFileSync(reports("ai-routing-policy.json"), "utf-8")));
    expect(policy).not.toBeNull();
    expect(policy!.paid.active).toBeNull(); // the coordinator never approves
    const sc = JSON.parse(readFileSync(reports("ai-model-scorecard.json"), "utf-8"));
    expect(sc.last_smoke.run_id).toBe(r.run_id);
    expect(Object.keys(sc.tasks)).toHaveLength(8);
    expect(existsSync(reports("ai-model-scorecard.jsonl"))).toBe(false); // smoke: no trend rows
    const hist = readFileSync(reports("model-eval-history.jsonl"), "utf-8").trim().split("\n");
    expect(JSON.parse(hist[0]!)).toMatchObject({ run_id: r.run_id, mode: "smoke", status: "done" });
    // P2-3: every paid eval call is in the shared paid-spend ledger, tagged as eval; free calls are not.
    expect(spend.record).toHaveBeenCalled();
    expect(spend.record.mock.calls.every(([p, usd]) => p === "deepinfra:eval" && usd > 0)).toBe(true);
    const budget = JSON.parse(readFileSync(reports("model-eval-budget.json"), "utf-8"));
    expect(budget.spent_usd).toBeGreaterThan(0);
    expect(budget.spent_usd).toBeLessThan(1);
    expect(JSON.parse(readFileSync(reports("model-eval-state-smoke.json"), "utf-8")).coordinated_at).toBeTruthy();
  });

  it("the next tick of the same day is a no-op", async () => {
    const { runModelEvalCron } = await import("./model-eval-cron");
    const n = call.mock.calls.length;
    const r = await runModelEvalCron({ mode: "smoke" }, overrides());
    expect(r.status).toBe("noop");
    expect(r.coordinated).toBe(false);
    expect(call.mock.calls.length).toBe(n);
  });

  it("a finished run whose coordination was lost is coordinated by the next tick (no new model calls)", async () => {
    const { runModelEvalCron } = await import("./model-eval-cron");
    const stateFile = reports("model-eval-state-smoke.json");
    const state = JSON.parse(readFileSync(stateFile, "utf-8"));
    writeFileSync(stateFile, JSON.stringify({ ...state, coordinated_at: null }));
    rmSync(reports("ai-model-scorecard.json"));
    const n = call.mock.calls.length;
    const r = await runModelEvalCron({ mode: "smoke" }, overrides());
    expect(r).toMatchObject({ status: "noop", coordinated: true });
    expect(call.mock.calls.length).toBe(n);
    expect(existsSync(reports("ai-model-scorecard.json"))).toBe(true);
  });

  it("P2-1: a corrupt policy file is kept, ops are alerted, and the coordinator writes nothing", async () => {
    const { runModelEvalCron } = await import("./model-eval-cron");
    const policyFile = reports("ai-routing-policy.json");
    const corrupt = '{"version":1,"paid":{"active":{"report":["deepseek-ai/DeepSeek-V3.2"]}'; // truncated write
    writeFileSync(policyFile, corrupt);
    rmSync(reports("ai-model-scorecard.json"), { force: true });
    const alert = vi.fn(async () => {});
    const r = await runModelEvalCron({ mode: "smoke", restart: true }, { ...overrides(), alert });
    // The day's run was done, so restart plans and runs a new one; its coordination must refuse.
    expect(r.coordinated).toBe(false);
    expect(r.coordination_error).toMatch(/invalid/);
    expect(alert).toHaveBeenCalledWith(expect.stringMatching(/invalid/));
    expect(readFileSync(policyFile, "utf-8")).toBe(corrupt);
    expect(existsSync(reports("ai-model-scorecard.json"))).toBe(false);
  });
});
