import { afterEach, describe, expect, it, vi } from "vitest";
import { reserveResearchAttempt, settleResearchAttempt, type ResearchAttemptBudget, type AttemptPermit } from "./research-attempt-budget";

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
  it("never interprets malformed usage as free usage", async () => {
    const coordinator = budget();
    await settleResearchAttempt(coordinator, permit, { prompt_tokens: "10", completion_tokens: 1 });
    expect(coordinator.settle).toHaveBeenCalledWith({ attemptId: "id", state: "unknown" });
  });
});
