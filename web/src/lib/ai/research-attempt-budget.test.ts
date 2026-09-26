import { afterEach, describe, expect, it, vi } from "vitest";
import { budgetOfReason, logBudgetRefusal, reserveResearchAttempt, ResearchAttemptBudgetError, settleResearchAttempt, type ResearchAttemptBudget, type AttemptPermit } from "./research-attempt-budget";

const permit: AttemptPermit = { attemptId: "id", payloadSha256: "hash", model: "model", dispatchAllowed: true,
  maximumPromptBytes: 1000, maximumInputTokens: 100, maximumOutputTokens: 20, maximumCostMicroUsd: 200,
  pricePolicyId: "certified-test", expiresAt: Date.now() + 60_000 };
const budget = (): ResearchAttemptBudget => ({ callId: "durable/test", reserve: vi.fn(), settle: vi.fn(async () => {}) });
afterEach(() => vi.useRealTimers());
describe("research attempt admission", () => {
  it("bounds stalled reserve without dispatch or releasing its possibly completed reservation", async () => {
    vi.useFakeTimers();
    const coordinator = budget();
    coordinator.reserve = vi.fn(() => new Promise(() => {}));
    const result = expect(reserveResearchAttempt(coordinator, "model", "payload", 20)).rejects.toThrow("reservation unavailable");
    await vi.advanceTimersByTimeAsync(5000);
    await result;
    expect(coordinator.settle).not.toHaveBeenCalled();
  });
  it("retains maximum reservation and blocks further execution on uncertified excess usage", async () => {
    const coordinator = budget();
    await expect(settleResearchAttempt(coordinator, permit, { prompt_tokens: 101, completion_tokens: 1 })).rejects.toThrow("certified ceiling");
    expect(coordinator.settle).toHaveBeenCalledWith({ attemptId: "id", state: "unknown" });
  });
  it("G33-T16f: a coordinator timeout is logged once as a structured refusal (budget coordinator_timeout)", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const coordinator = budget();
      coordinator.reserve = vi.fn(() => new Promise(() => {}));
      const result = expect(reserveResearchAttempt(coordinator, "model", "payload", 20)).rejects.toThrow("coordinator timeout");
      await vi.advanceTimersByTimeAsync(5000);
      await result;
      expect(warn).toHaveBeenCalledTimes(1);
      expect(JSON.parse(String(warn.mock.calls[0][0]))).toMatchObject({ event: "ai.budget.refused", budget: "coordinator_timeout", model: "model", prompt_bytes: 7, requested_output_tokens: 20, requested_micro_usd: null });
    } finally {
      warn.mockRestore();
    }
  });
  it("G33-T16f: a detailed refusal keeps its detail through the wrapper; a denied permit is logged too", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const coordinator = budget();
      coordinator.reserve = vi.fn(async () => { throw new ResearchAttemptBudgetError("job budget exhausted", { budget: "research_job", requestedMicroUsd: 900, availableMicroUsd: 100, capMicroUsd: 1000, heldMicroUsd: 900 }); });
      const err = await reserveResearchAttempt(coordinator, "model", "payload", 20).catch((e) => e);
      expect(err).toBeInstanceOf(ResearchAttemptBudgetError);
      expect(err.message).toContain("reservation unavailable (job budget exhausted)");
      expect(err.detail).toMatchObject({ budget: "research_job", availableMicroUsd: 100 });
      expect(JSON.parse(String(warn.mock.calls[0][0]))).toMatchObject({ budget: "research_job", requested_micro_usd: 900, available_micro_usd: 100, cap_micro_usd: 1000 });
      coordinator.reserve = vi.fn(async () => ({ ...permit, dispatchAllowed: false }));
      await expect(reserveResearchAttempt(coordinator, "model", "payload", 20)).rejects.toThrow("dispatch denied");
      expect(JSON.parse(String(warn.mock.calls[1][0]))).toMatchObject({ budget: "dispatch_denied" });
    } finally {
      warn.mockRestore();
    }
  });
  it("G33-T16f: budgetOfReason / logBudgetRefusal never throw and hash the scope", () => {
    expect(budgetOfReason("report lock unavailable")).toBe("ledger_lock");
    expect(budgetOfReason("report US$0.50 limit reached")).toBe("usd_cap");
    expect(budgetOfReason("report attempt replay denied")).toBe("attempt_replay");
    expect(budgetOfReason("something else")).toBe("coordinator");
    const out: string[] = [];
    logBudgetRefusal({ callId: "blockid:analysis:secret-project", reason: "report lock unavailable" }, (l) => out.push(l));
    expect(JSON.parse(out[0])).toMatchObject({ event: "ai.budget.refused", budget: "ledger_lock", scope: expect.stringMatching(/^[a-f0-9]{12}$/) });
    expect(out[0]).not.toContain("secret-project");
    expect(() => logBudgetRefusal({ reason: "x" }, () => { throw new Error("sink down"); })).not.toThrow();
  });
  it("never interprets malformed usage as free usage", async () => {
    const coordinator = budget();
    await settleResearchAttempt(coordinator, permit, { prompt_tokens: "10", completion_tokens: 1 });
    expect(coordinator.settle).toHaveBeenCalledWith({ attemptId: "id", state: "unknown" });
  });
});
