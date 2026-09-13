// Colocated vitest for POST /api/svi/pitch-deck — S31-A backpressure contract.
//
// Pins the two AI-capacity behaviours every user-facing AI route now shares
// (svi/report, ai-score, full-report, dimension-analyze, report-section,
// modular, research, startup-package/analyze, evaluation ai-score/ai-suggest):
//   1. the caller's user id is threaded into callAI (`userId`) so the
//      dispatcher's per-user fairness cap (2 in flight) applies;
//   2. an AICapacityError from the dispatcher becomes an honest 503 with a
//      `Retry-After` header and `code: "ai_capacity_busy"` — never a 500 —
//      and NO credits are spent.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { AICapacityError } from "@/lib/ai/capacity";

const getCurrentUserMock = vi.fn();
const canAffordMock = vi.fn();
const spendCreditsMock = vi.fn();
const callAIMock = vi.fn();

vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: () => null }));
vi.mock("@/lib/credits", () => ({
  canAfford: (userId: string, feature: string) => canAffordMock(userId, feature),
  spendCredits: (userId: string, feature: string, meta: unknown) => spendCreditsMock(userId, feature, meta),
  FEATURE_COSTS: { pitch_deck: 5 },
}));
vi.mock("@/lib/ai-client", () => ({
  isAIConfigured: () => true,
  callAI: (opts: unknown) => callAIMock(opts),
}));

import { POST } from "./route";

function req(): Request {
  return new Request("http://localhost/api/svi/pitch-deck", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rawText: "Acme does X", analysis: { totalSVI: 55, stage: 2, stageLabel: "Seed", subs: [], evidenceGaps: [] } }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue({ id: "user-1", email: "f@x.au" });
  canAffordMock.mockResolvedValue({ allowed: true, balance: 20 });
  spendCreditsMock.mockResolvedValue({ balance: 15 });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/svi/pitch-deck — S31-A capacity contract", () => {
  it("threads the user id into callAI and spends credits on success", async () => {
    callAIMock.mockResolvedValue({ text: JSON.stringify([{ slide: 1, title: "Problem" }]), provider: "claude", model: "claude-sonnet-5" });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(callAIMock).toHaveBeenCalledTimes(1);
    expect((callAIMock.mock.calls[0][0] as { userId: string }).userId).toBe("user-1");
    expect(spendCreditsMock).toHaveBeenCalledWith("user-1", "pitch_deck", { email: "f@x.au" });
  });

  it("AICapacityError → 503 + Retry-After + ai_capacity_busy, no credits spent, not a 500", async () => {
    callAIMock.mockRejectedValue(new AICapacityError("user_limit", 9, { queued: 2, running: 2 }));
    const res = await POST(req());
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("9");
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("ai_capacity_busy");
    expect(body.reason).toBe("user_limit");
    expect(body.retry_after_sec).toBe(9);
    expect(body.error).toMatch(/try again in ~9 s/);
    expect(spendCreditsMock).not.toHaveBeenCalled();
  });

  it("any other AI failure is still the generic 500 (unchanged behaviour)", async () => {
    callAIMock.mockRejectedValue(new Error("All AI providers failed"));
    const res = await POST(req());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Generation failed");
  });
});
