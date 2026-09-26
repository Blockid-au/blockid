import { createHash } from "node:crypto";

/**
 * G33-T16f: why an admission was refused — which budget, and requested vs
 * available when the refusal is an amount. Amounts only (micro-USD, tokens,
 * bytes); never a prompt, key, customer name or raw scope id.
 */
export interface BudgetRefusalDetail {
  /** Which budget refused: e.g. `report_usd_cap`, `report_ledger_lock`, `research_job`, `coordinator_timeout`. */
  budget: string;
  requestedMicroUsd?: number;
  availableMicroUsd?: number;
  capMicroUsd?: number;
  heldMicroUsd?: number;
  requestedOutputTokens?: number;
  maxOutputTokens?: number;
  promptBytes?: number;
  maxPromptBytes?: number;
  requestedAttempts?: number;
  availableAttempts?: number;
}
export class ResearchAttemptBudgetError extends Error {
  readonly detail?: BudgetRefusalDetail;
  constructor(reason: string, detail?: BudgetRefusalDetail) {
    super(`Research attempt budget: ${reason}`);
    this.name = "ResearchAttemptBudgetError";
    if (detail) this.detail = detail;
  }
}

/** Budget name for a refusal that carried no detail, inferred from the coordinator's reason text. */
export function budgetOfReason(reason: string): string {
  if (/coordinator timeout/.test(reason)) return "coordinator_timeout";
  if (/lock/.test(reason)) return "ledger_lock";
  if (/limit reached|budget exhausted/.test(reason)) return "usd_cap";
  if (/replay/.test(reason)) return "attempt_replay";
  if (/reconciliation/.test(reason)) return "ledger_reconciliation";
  if (/not admitted/.test(reason)) return "price_admission";
  return "coordinator";
}

/**
 * G33-T16f: ONE structured line per refused reservation / admission —
 * `{"event":"ai.budget.refused", budget, reason, requested_micro_usd,
 * available_micro_usd, …}`. The scope is a sha256 prefix, never the raw id.
 * Never throws.
 */
export function logBudgetRefusal(
  input: { callId?: string; model?: string; reason: string; detail?: BudgetRefusalDetail; promptBytes?: number; maximumOutputTokens?: number },
  sink: (line: string) => void = (l) => console.warn(l),
): void {
  try {
    const d = input.detail;
    const line = {
      event: "ai.budget.refused",
      budget: d?.budget ?? budgetOfReason(input.reason),
      reason: input.reason.slice(0, 160),
      model: input.model ?? null,
      scope: input.callId ? createHash("sha256").update(input.callId).digest("hex").slice(0, 12) : null,
      requested_micro_usd: d?.requestedMicroUsd ?? null,
      available_micro_usd: d?.availableMicroUsd ?? null,
      cap_micro_usd: d?.capMicroUsd ?? null,
      held_micro_usd: d?.heldMicroUsd ?? null,
      requested_output_tokens: d?.requestedOutputTokens ?? input.maximumOutputTokens ?? null,
      max_output_tokens: d?.maxOutputTokens ?? null,
      prompt_bytes: d?.promptBytes ?? input.promptBytes ?? null,
      max_prompt_bytes: d?.maxPromptBytes ?? null,
      ...(d?.requestedAttempts !== undefined ? { requested_attempts: d.requestedAttempts, available_attempts: d.availableAttempts ?? null } : {}),
    };
    sink(JSON.stringify(line));
  } catch {
    /* logging never blocks the refusal */
  }
}
export interface AttemptRequest {
  attemptId: string; provider: "deepinfra"; model: string;
  payloadSha256: string; promptBytes: number; maximumOutputTokens: number;
}
export interface AttemptPermit {
  dispatchAllowed: boolean; attemptId: string; payloadSha256: string; model: string;
  /** G33-T06: set when this permit re-dispatches a settled attempt of the same payload (new identity). */
  retryOf?: string;
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
  const refused = (reason: string, detail?: BudgetRefusalDetail) =>
    logBudgetRefusal({ callId: budget.callId, model, reason, detail, promptBytes: request.promptBytes, maximumOutputTokens });
  let permit: AttemptPermit;
  try { permit = await bounded(budget.reserve(request)); }
  catch (e) {
    // G33-T16f: keep the coordinator's reason (lock, cap, replay, timeout) —
    // 24/09 a CEO summary was refused with a healthy US$0.03 ledger and the
    // generic text hid why. The reason never carries prompts, keys or amounts;
    // the amounts (requested vs available) go to one structured log line.
    const reason = e instanceof ResearchAttemptBudgetError ? e.message.replace(/^Research attempt budget:\s*/, "") : "coordinator error";
    const detail = e instanceof ResearchAttemptBudgetError ? e.detail : undefined;
    refused(reason, detail);
    throw new ResearchAttemptBudgetError(`reservation unavailable (${reason.slice(0, 120)}); reconciliation required`, detail);
  }
  const positive = (n: number) => Number.isSafeInteger(n) && n > 0;
  if (!permit?.dispatchAllowed) {
    refused("dispatch denied", { budget: "dispatch_denied" });
    throw new ResearchAttemptBudgetError("dispatch denied");
  }
  const identityOk = permit.attemptId === attemptId || (permit.retryOf === attemptId && /^[a-f0-9]{64}$/.test(permit.attemptId) && permit.attemptId !== attemptId);
  if (!identityOk || permit.payloadSha256 !== payloadSha256 || permit.model !== model ||
      !positive(permit.maximumCostMicroUsd) || !positive(permit.maximumInputTokens) ||
      !positive(permit.maximumPromptBytes) || permit.maximumPromptBytes < request.promptBytes ||
      !positive(permit.maximumOutputTokens) || permit.maximumOutputTokens < maximumOutputTokens ||
      !permit.pricePolicyId || !Number.isFinite(permit.expiresAt) || permit.expiresAt <= Date.now()) {
    refused("invalid or expired permit", { budget: "permit_integrity" });
    throw new ResearchAttemptBudgetError("invalid or expired permit; reservation retained");
  }
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
