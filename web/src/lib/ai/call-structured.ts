/**
 * Structured LLM call wrapper — v3 Master Upgrade Plan §5.4.
 *
 * Every structured AI call in the platform goes through this wrapper.
 * The contract is:
 *
 *   1. Hash the input (canonical-JSON → SHA-256) for reproducibility.
 *   2. Validate the input against `inputSchema` — a failure here is a
 *      programmer error and throws (caller's bug, not the model's).
 *   3. Call the model via the Anthropic Messages API. Fetch is used
 *      directly so tests can stub it and so this file has no dependency
 *      on the multi-provider chain in ai-client.ts (that layer will
 *      migrate to call through this wrapper in a later PR).
 *   4. Try outputSchema.safeParse on the raw text. On failure, run ONE
 *      repair pass — replay the same prompt with an appended message
 *      telling the model exactly what schema fields it violated.
 *   5. Insert an `ai_runs` row for the audit trail. Every terminal
 *      status (`ok`, `schema_fail`, `model_error`, `rate_limited`,
 *      `rejected`) writes a row so the caller always gets a `runId`.
 *      G24-B: `prompt_version_id` is written as NULL when the caller's id
 *      is the NIL placeholder / not a uuid, and an FK rejection
 *      (`ai_runs_prompt_version_id_fkey`) is retried once with NULL —
 *      the row is never dropped for a stale or unregistered prompt id.
 *      The pipeline registers its prompt versions on first use
 *      (lib/ai/prompt-registry readOrRegisterPrompt), so NULL is the
 *      exception path, not the norm. See docs/ops/ai-runs.md.
 *   6. Return `{ ok: true, data, runId }` on success, `{ ok: false,
 *      reason, runId }` on final failure. Never throws for model /
 *      schema / rate-limit failures — callers gate on `ok`.
 */

import "server-only";

import { z } from "zod";

import { looksTruncated, salvageTruncatedJson } from "@/lib/ai/json-salvage";
import { canonicalizeScore } from "@/lib/proofs/canonical-json";
import { hashScore } from "@/lib/proofs/hash";
import { getSupabaseAdmin } from "@/lib/supabase";

// ── Model pricing ────────────────────────────────────────────────────
//
// USD per 1M tokens. Zero for anything not in the table — the ai_runs
// row still stores tokens_in / tokens_out so a follow-up pricing back-
// fill remains possible. Anthropic list prices, Sep 2026 (S31-A) — keep in
// sync with lib/ai/anthropic-tier.ts ANTHROPIC_PRICING_USD_PER_1M.
const MODEL_PRICING_USD_PER_1M: Record<string, { in: number; out: number }> = {
  "claude-sonnet-5": { in: 2, out: 10 },
  "claude-opus-5": { in: 5, out: 25 },
  "claude-haiku-4-5": { in: 1, out: 5 },
  "claude-haiku-4-5-20251001": { in: 1, out: 5 },
};

function usdCost(model: string, tokensIn: number, tokensOut: number): number {
  const p = MODEL_PRICING_USD_PER_1M[model];
  if (!p) return 0;
  return (tokensIn * p.in) / 1_000_000 + (tokensOut * p.out) / 1_000_000;
}

// ── Public signature ─────────────────────────────────────────────────

export interface CallStructuredArgs<TIn, TOut> {
  promptVersionId: string;
  agent: string;
  model: string;
  inputSchema: z.ZodType<TIn>;
  outputSchema: z.ZodType<TOut>;
  input: TIn;
  /** System instructions rendered into the Messages API. */
  systemPrompt: string;
  /**
   * Template the user turn. Receives the (already-validated) input and
   * returns the string sent to the model. Split out so tests can pin
   * exact wording.
   */
  renderUser: (input: TIn) => string;
  businessId?: string | null;
  userId?: string | null;
  purpose: string;
  /** Evidence rows this call is allowed to cite. Stored on ai_runs. */
  evidenceIds?: string[];
  /** Anthropic API key override — falls back to env. */
  apiKey?: string;
  /** Injectable fetch — tests stub this. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /**
   * Optional transport override. When supplied, the wrapper sends the
   * conversation through this function instead of POSTing directly to the
   * Anthropic Messages API — everything else (input hashing, Zod parse,
   * the single repair pass, the `ai_runs` row) is identical.
   *
   * The report pipeline uses this to keep running on the free
   * multi-provider chain in ai-client.ts while still getting schema
   * validation and the audit trail.
   */
  modelCaller?: StructuredModelCaller;
}

// ── Injectable transport ─────────────────────────────────────────────

export interface StructuredModelRequest {
  model: string;
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}

export type StructuredModelResult =
  | { ok: true; text: string; tokensIn?: number; tokensOut?: number }
  | {
      ok: false;
      status: "model_error" | "rate_limited" | "rejected";
      reason: string;
    };

export type StructuredModelCaller = (
  req: StructuredModelRequest,
) => Promise<StructuredModelResult>;

export type CallStructuredResult<T> =
  | { ok: true; data: T; runId: string; overrun?: boolean }
  | { ok: false; reason: string; runId: string; overrun?: boolean };

// ── Anthropic Messages API response shape (subset we use) ────────────

interface AnthropicMessagesResponse {
  content: Array<{ type: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

// ── Implementation ───────────────────────────────────────────────────

export async function callStructured<TIn, TOut>(
  args: CallStructuredArgs<TIn, TOut>,
): Promise<CallStructuredResult<TOut>> {
  const {
    promptVersionId,
    model,
    inputSchema,
    outputSchema,
    input,
    systemPrompt,
    renderUser,
    businessId = null,
    userId = null,
    purpose,
    evidenceIds = [],
    apiKey = process.env.ANTHROPIC_API_KEY,
    fetchImpl = fetch,
    modelCaller,
  } = args;

  // Transport: injected caller when present, direct Anthropic POST otherwise.
  const invoke = (
    messages: Array<{ role: "user" | "assistant"; content: string }>,
  ): Promise<AnthropicResult> =>
    modelCaller
      ? callInjected(modelCaller, { model, system: systemPrompt, messages })
      : callAnthropic({ apiKey, fetchImpl, model, system: systemPrompt, messages });

  // Step 1 — hash the input for reproducibility.
  const canonical = canonicalizeScore(input as unknown as object);
  const inputHash = hashScore(canonical);

  // Step 2 — validate input. Programmer error → throw.
  const inputValidation = inputSchema.safeParse(input);
  if (!inputValidation.success) {
    throw new Error(
      `callStructured: inputSchema rejected input for ${args.agent}: ${inputValidation.error.message}`,
    );
  }

  // First call to the model.
  const userMessage = renderUser(input);
  const started = Date.now();
  const firstCall = await invoke([{ role: "user", content: userMessage }]);

  if (!firstCall.ok) {
    const runId = await insertRun({
      promptVersionId,
      businessId,
      userId,
      model,
      inputHash,
      outputHash: null,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      latencyMs: Date.now() - started,
      status: firstCall.status,
      evidenceIds,
      purpose,
    });
    return { ok: false, reason: firstCall.reason, runId };
  }

  // Step 4a — try to parse. On success we log and return.
  const firstParse = tryParse(outputSchema, firstCall.text);
  if (firstParse.ok) {
    const tokensIn = firstCall.tokensIn;
    const tokensOut = firstCall.tokensOut;
    const runId = await insertRun({
      promptVersionId,
      businessId,
      userId,
      model,
      inputHash,
      outputHash: hashScore(canonicalizeScore(firstParse.data as unknown as object)),
      tokensIn,
      tokensOut,
      costUsd: usdCost(model, tokensIn, tokensOut),
      latencyMs: Date.now() - started,
      status: "ok",
      evidenceIds,
      purpose,
    });
    return { ok: true, data: firstParse.data, runId, overrun: firstParse.salvaged };
  }

  // Step 4b — ONE repair pass. Append the parse error and the raw
  // response to the conversation so the model can correct itself.
  const repairCall = await invoke([
    { role: "user", content: userMessage },
    { role: "assistant", content: firstCall.text },
    {
      role: "user",
      content:
        "Your previous response failed schema validation with the " +
        `following error: ${firstParse.error}\n\n` +
        "Return ONLY valid JSON matching the schema. No prose, no " +
        "markdown fences, no commentary — just the JSON object.",
    },
  ]);

  const totalTokensIn = firstCall.tokensIn + (repairCall.ok ? repairCall.tokensIn : 0);
  const totalTokensOut = firstCall.tokensOut + (repairCall.ok ? repairCall.tokensOut : 0);

  if (!repairCall.ok) {
    const runId = await insertRun({
      promptVersionId,
      businessId,
      userId,
      model,
      inputHash,
      outputHash: null,
      tokensIn: totalTokensIn,
      tokensOut: totalTokensOut,
      costUsd: usdCost(model, totalTokensIn, totalTokensOut),
      latencyMs: Date.now() - started,
      status: repairCall.status,
      evidenceIds,
      purpose,
    });
    return { ok: false, reason: repairCall.reason, runId, overrun: firstParse.truncated };
  }

  const repairParse = tryParse(outputSchema, repairCall.text);
  if (repairParse.ok) {
    const runId = await insertRun({
      promptVersionId,
      businessId,
      userId,
      model,
      inputHash,
      outputHash: hashScore(canonicalizeScore(repairParse.data as unknown as object)),
      tokensIn: totalTokensIn,
      tokensOut: totalTokensOut,
      costUsd: usdCost(model, totalTokensIn, totalTokensOut),
      latencyMs: Date.now() - started,
      status: "ok",
      evidenceIds,
      purpose,
    });
    return { ok: true, data: repairParse.data, runId, overrun: firstParse.truncated || repairParse.salvaged };
  }

  // Both attempts failed schema — record schema_fail. Callers may
  // choose to promote this to `rejected` if a guardrail also fired.
  const runId = await insertRun({
    promptVersionId,
    businessId,
    userId,
    model,
    inputHash,
    outputHash: null,
    tokensIn: totalTokensIn,
    tokensOut: totalTokensOut,
    costUsd: usdCost(model, totalTokensIn, totalTokensOut),
    latencyMs: Date.now() - started,
    status: "schema_fail",
    evidenceIds,
    purpose,
  });
  return { ok: false, reason: `schema_fail: ${repairParse.error}`, runId, overrun: firstParse.truncated || repairParse.truncated };
}

// ── Internal: Anthropic Messages POST ────────────────────────────────

type AnthropicResult =
  | { ok: true; text: string; tokensIn: number; tokensOut: number }
  | {
      ok: false;
      status: "model_error" | "rate_limited" | "rejected";
      reason: string;
    };

/**
 * Run the conversation through an injected transport. Mirrors
 * callAnthropic's contract exactly: never throws, always returns a
 * terminal status, and treats an empty completion as a model error so the
 * repair pass / `schema_fail` path behaves identically to the HTTP path.
 */
async function callInjected(
  caller: StructuredModelCaller,
  req: StructuredModelRequest,
): Promise<AnthropicResult> {
  let res: StructuredModelResult;
  try {
    res = await caller(req);
  } catch (err) {
    return {
      ok: false,
      status: "model_error",
      reason: err instanceof Error ? err.message : String(err),
    };
  }
  if (!res.ok) return res;
  if (!res.text || !res.text.trim()) {
    return { ok: false, status: "model_error", reason: "empty response" };
  }
  return {
    ok: true,
    text: res.text,
    tokensIn: res.tokensIn ?? 0,
    tokensOut: res.tokensOut ?? 0,
  };
}

async function callAnthropic(opts: {
  apiKey: string | undefined;
  fetchImpl: typeof fetch;
  model: string;
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<AnthropicResult> {
  if (!opts.apiKey) {
    // G25-B: the API key is optional — callers that want the dispatcher
    // chain (DeepInfra-first, Claude CLI fallback) pass `modelCaller`.
    return { ok: false, status: "model_error", reason: "ANTHROPIC_API_KEY not set (optional) — pass modelCaller for the dispatcher chain" };
  }
  let res: Response;
  try {
    res = await opts.fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": opts.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: 4096,
        system: opts.system,
        messages: opts.messages,
      }),
    });
  } catch (err) {
    return {
      ok: false,
      status: "model_error",
      reason: err instanceof Error ? err.message : String(err),
    };
  }

  if (res.status === 429) {
    return { ok: false, status: "rate_limited", reason: "HTTP 429" };
  }
  if (!res.ok) {
    const body = await safeText(res);
    return {
      ok: false,
      status: "model_error",
      reason: `HTTP ${res.status}: ${body.slice(0, 200)}`,
    };
  }

  let json: AnthropicMessagesResponse;
  try {
    json = (await res.json()) as AnthropicMessagesResponse;
  } catch (err) {
    return {
      ok: false,
      status: "model_error",
      reason: `invalid JSON response: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const text = (json.content ?? [])
    .filter(b => b.type === "text" && typeof b.text === "string")
    .map(b => b.text as string)
    .join("");
  if (!text) {
    return { ok: false, status: "model_error", reason: "empty response" };
  }
  return {
    ok: true,
    text,
    tokensIn: json.usage?.input_tokens ?? 0,
    tokensOut: json.usage?.output_tokens ?? 0,
  };
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

// ── Internal: parse text as JSON then Zod-validate ───────────────────

type ParseResult<T> =
  /** `salvaged`: the raw text was cut short and rewound to its last complete value before it validated (G23-A). */
  | { ok: true; data: T; salvaged: boolean }
  /** `truncated`: JSON.parse failed with an end-of-input signature — the output overran its budget. */
  | { ok: false; error: string; truncated: boolean };

function tryParse<T>(schema: z.ZodType<T>, text: string): ParseResult<T> {
  // Strip a leading ```json fence and a trailing ``` if the model wrapped
  // its output in markdown. Kept intentionally simple — the repair pass
  // covers weirder shapes.
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  let parsed: unknown;

  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // G23-A fix (b): an output cut short by its token budget is rewound to
    // its last complete value / sentence and closed, instead of costing a
    // repair pass that is cut the same way. Nothing the model did not write
    // is added; a salvage that still fails the schema falls through to the
    // ordinary repair pass with the original error.
    const rescued = salvageTruncatedJson(cleaned);
    if (rescued !== null) {
      try {
        const candidate: unknown = JSON.parse(rescued);
        const zres = schema.safeParse(candidate);
        if (zres.success) return { ok: true, data: zres.data, salvaged: true };
      } catch {
        /* fall through */
      }
    }
    return { ok: false, error: `JSON.parse failed: ${message}`, truncated: looksTruncated(message) };
  }
  const zres = schema.safeParse(parsed);
  if (!zres.success) {
    return { ok: false, error: zres.error.message, truncated: false };
  }
  return { ok: true, data: zres.data, salvaged: false };
}

// ── Internal: audit-log insert ───────────────────────────────────────

interface InsertRunArgs {
  promptVersionId: string;
  businessId: string | null;
  userId: string | null;
  model: string;
  inputHash: string;
  outputHash: string | null;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  latencyMs: number;
  status: "ok" | "schema_fail" | "model_error" | "rate_limited" | "rejected";
  evidenceIds: string[];
  purpose: string;
}

/** The placeholder the pipeline used before G24-B; never sent to the FK. */
export const NIL_PROMPT_VERSION_ID = "00000000-0000-0000-0000-000000000000";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The `prompt_version_id` to write: the caller's id when it is a real
 * (non-NIL) uuid, otherwise NULL (0435 made the column nullable). Exported
 * for tests.
 */
export function promptVersionIdForRow(id: string | null | undefined): string | null {
  if (!id || id === NIL_PROMPT_VERSION_ID) return null;
  return UUID_RE.test(id) ? id : null;
}

function isPromptVersionFkError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  // Only the prompt-version constraint (review G24 P3): another FK failure
  // (user / business) must surface as itself, not be retried with NULL.
  return /ai_runs_prompt_version_id_fkey/.test(err.message ?? "") || (err.code === "23503" && /prompt_version/.test(err.message ?? ""));
}

async function insertRun(args: InsertRunArgs): Promise<string> {
  const sb = getSupabaseAdmin();
  if (!sb) {
    // No supabase (dev/test bootstrap). Return a synthetic id so the
    // caller still has a stable handle for logs.
    return `local-${Date.now()}`;
  }
  const row = {
    prompt_version_id: promptVersionIdForRow(args.promptVersionId),
    business_id: args.businessId,
    user_id: args.userId,
    model: args.model,
    input_hash: args.inputHash,
    output_hash: args.outputHash,
    tokens_in: args.tokensIn,
    tokens_out: args.tokensOut,
    cost_usd: args.costUsd,
    latency_ms: args.latencyMs,
    status: args.status,
    evidence_ids: args.evidenceIds,
    purpose: args.purpose,
  };
  let { data, error } = await sb.from("ai_runs").insert(row).select("id").single();
  if (error && row.prompt_version_id !== null && isPromptVersionFkError(error)) {
    // G24-B: a stale / unregistered prompt id must never cost the ledger a
    // row — keep the run, write NULL for the reference (a uuid, never a secret).
    console.warn(`[ai_runs] prompt_version_id ${row.prompt_version_id} is not registered — writing NULL`);
    ({ data, error } = await sb.from("ai_runs").insert({ ...row, prompt_version_id: null }).select("id").single());
  }
  if (error || !data) {
    // Never let audit-log failure mask the real result — return a
    // synthetic id and log so ops can grep for it.
    console.warn(`[ai_runs] insert failed: ${error?.message ?? "unknown"}`);
    return `local-${Date.now()}`;
  }
  return (data as { id: string }).id;
}
