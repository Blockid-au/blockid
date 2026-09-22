import { createHash } from "node:crypto";

export class ResearchAttemptBudgetError extends Error {
  constructor(reason: string) { super(`Research attempt budget: ${reason}`); this.name = "ResearchAttemptBudgetError"; }
}
export interface AttemptRequest {
  attemptId: string; provider: "deepinfra"; model: string;
  payloadSha256: string; promptBytes: number; maximumOutputTokens: number;
}
export interface AttemptPermit {
  dispatchAllowed: boolean; attemptId: string; payloadSha256: string; model: string;
  maximumPromptBytes: number; maximumInputTokens: number; maximumOutputTokens: number;
  maximumCostMicroUsd: number; pricePolicyId: string; expiresAt: number;
}
/** Server-only coordinator. Reserve atomically counts maximum cost before returning;
 * replays MUST deny dispatch. Unknown outcomes retain the entire reservation.
 * callId comes from durable job + purpose + batch identity, never a request clock.
 * No client-supplied hook, permit or price is trusted. No implementation is enabled here.
 */
export interface ResearchAttemptBudget {
  callId: string;
  reserve(request: AttemptRequest): Promise<AttemptPermit>;
  settle(outcome: { attemptId: string; state: "unknown" | "reported_usage";
    inputTokens?: number; outputTokens?: number }): Promise<void>;
}
// A timed-out coordinator may still finish its durable write. Never dispatch on
// timeout or retry a settlement here: its reservation stays held for reconciliation.
async function bounded<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([work, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ResearchAttemptBudgetError("coordinator timeout")), 5000);
  })]); } finally { if (timer) clearTimeout(timer); }
}
export async function reserveResearchAttempt(budget: ResearchAttemptBudget, model: string, payload: string, maximumOutputTokens: number) {
  const payloadSha256 = createHash("sha256").update(payload).digest("hex");
  if (!budget.callId || budget.callId.length > 256) throw new ResearchAttemptBudgetError("invalid durable call identity");
  const attemptId = createHash("sha256").update(JSON.stringify(["research-attempt-v1", budget.callId, "deepinfra", model, payloadSha256])).digest("hex");
  const request: AttemptRequest = { attemptId, provider: "deepinfra", model, payloadSha256, promptBytes: Buffer.byteLength(payload), maximumOutputTokens };
  let permit: AttemptPermit;
  try { permit = await bounded(budget.reserve(request)); }
  catch { throw new ResearchAttemptBudgetError("reservation unavailable; reconciliation required"); }
  const positive = (n: number) => Number.isSafeInteger(n) && n > 0;
  if (!permit?.dispatchAllowed) throw new ResearchAttemptBudgetError("dispatch denied");
  if (permit.attemptId !== attemptId || permit.payloadSha256 !== payloadSha256 || permit.model !== model ||
      !positive(permit.maximumCostMicroUsd) || !positive(permit.maximumInputTokens) ||
      !positive(permit.maximumPromptBytes) || permit.maximumPromptBytes < request.promptBytes ||
      !positive(permit.maximumOutputTokens) || permit.maximumOutputTokens < maximumOutputTokens ||
      !permit.pricePolicyId || !Number.isFinite(permit.expiresAt) || permit.expiresAt <= Date.now())
    throw new ResearchAttemptBudgetError("invalid or expired permit; reservation retained");
  return permit;
}
export async function settleResearchAttempt(budget: ResearchAttemptBudget, permit: AttemptPermit, usage?: { prompt_tokens?: unknown; completion_tokens?: unknown }) {
  const input = usage?.prompt_tokens, output = usage?.completion_tokens;
  const valid = typeof input === "number" && Number.isSafeInteger(input) && input >= 0 &&
    typeof output === "number" && Number.isSafeInteger(output) && output >= 0;
  const within = valid && input <= permit.maximumInputTokens && output <= permit.maximumOutputTokens;
  try { await bounded(budget.settle({ attemptId: permit.attemptId, state: within ? "reported_usage" : "unknown",
    ...(within ? { inputTokens: input, outputTokens: output } : {}) })); }
  catch { throw new ResearchAttemptBudgetError("settlement unavailable; reservation retained"); }
  if (valid && !within) throw new ResearchAttemptBudgetError("usage exceeds certified ceiling; reconciliation required");
}
