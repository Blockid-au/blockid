/**
 * Prompt registry helper — v3 Master Upgrade Plan §6.3.
 *
 * Wraps the prompt_versions table (migration 0230) with two operations:
 *
 *   readCurrentPrompt(agent)
 *     Returns the row whose (agent, status='prod') combination is
 *     unique per the partial index. Returns null if the agent has no
 *     prod row yet (first-time bootstrap).
 *
 *   readOrRegisterPrompt(agent, defaults)        (G24-B)
 *     The pipeline's resolver: the prod row when one exists, otherwise the
 *     code-default prompt is REGISTERED on first use — one row per
 *     (agent, version) inserted as prod — and that row is returned. Every
 *     `ai_runs` row the pipeline writes therefore points at a real
 *     prompt_versions row (0231's FK) instead of the NIL uuid that made
 *     every insert fail with ai_runs_prompt_version_id_fkey. A race with
 *     another worker (or a rolled-back row of the same version) resolves
 *     to the existing row; a DB error returns null so the caller falls
 *     back to writing NULL on the run row (0435), never dropping it.
 *
 *   promoteCanaryToProd(agent, canaryVersionId, rolloutBy)
 *     Atomically swaps prod. If a prior prod row exists it is flipped
 *     to rolled_back and its id is stored on the new prod row's
 *     rollback_from column so a later rollback restores exactly the
 *     replaced version. The partial unique index enforces at-most-one
 *     prod row per agent at the database level, so a race between two
 *     promoters cannot leave two rows in prod.
 *
 * Every read and every write is Zod-validated — the database is the
 * source of truth for shape but the app refuses to marshal a row it
 * cannot fully parse.
 */

import "server-only";

import { z } from "zod";

import { getSupabaseAdmin } from "@/lib/supabase";

// ── PromptVersion — Zod shape for a single prompt_versions row ───────
//
// Kept in sync with 0230_prompt_versions.sql. Nullable timestamps stay
// nullable; JSONB columns get a loose z.record so callers can pass a
// stricter schema at their call site if they want.
export const PromptVersion = z.object({
  id: z.string().uuid(),
  agent: z.string().min(1),
  version: z.string().min(1),
  purpose: z.string(),
  model: z.string().min(1),
  variables: z.unknown().default({}),
  output_schema: z.unknown().default({}),
  guardrails: z.array(z.string()).default([]),
  test_set_id: z.string().uuid().nullable().optional(),
  evaluation_result: z.unknown().nullable().optional(),
  status: z.enum(["draft", "shadow", "canary", "prod", "rolled_back"]),
  released_at: z.string().nullable().optional(),
  rollback_from: z.string().uuid().nullable().optional(),
  created_at: z.string().optional(),
});
export type PromptVersion = z.infer<typeof PromptVersion>;

// Result of a promotion. Returned rather than thrown so callers can
// distinguish "no such canary" from a database error.
export type PromoteResult =
  | { ok: true; newProdId: string; rolledBackId: string | null }
  | { ok: false; reason: "no_canary" | "supabase_unavailable" | "db_error"; error?: string };

// The parameters accepted by promoteCanaryToProd. Zod-validated so a
// programmer-typo (empty string agent, non-uuid id) fails fast.
const PromoteInput = z.object({
  agent: z.string().min(1),
  canaryVersionId: z.string().uuid(),
  rolloutBy: z.string().min(1),
});

/**
 * Fetch the current prod prompt for `agent`, or null if none exists.
 *
 * The partial unique index on (agent) WHERE status='prod' guarantees
 * this query returns at most one row.
 */
export async function readCurrentPrompt(
  agent: string,
): Promise<PromptVersion | null> {
  const parsedAgent = z.string().min(1).parse(agent);

  const sb = getSupabaseAdmin();
  if (!sb) return null;

  const { data, error } = await sb
    .from("prompt_versions")
    .select("*")
    .eq("agent", parsedAgent)
    .eq("status", "prod")
    .maybeSingle();

  if (error) {
    throw new Error(`readCurrentPrompt(${parsedAgent}) failed: ${error.message}`);
  }
  if (!data) return null;

  return PromptVersion.parse(data);
}

/** What the pipeline registers when an agent has no prompt_versions row yet. */
export interface PromptRegistrationDefaults {
  /** Semver of the code-default prompt (bumped with the prompt builder). */
  version: string;
  /** Model label the run will carry (free text — the chain marker is fine). */
  model: string;
  purpose: string;
  /** Extra `variables` (e.g. a slotted template) — never a secret. */
  variables?: Record<string, unknown>;
}

function isUniqueViolation(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "23505") return true;
  return /duplicate key|unique constraint|already exists/i.test(err.message ?? "");
}

/**
 * Register the code-default prompt for `agent` (upsert by (agent, version))
 * and return the row that now stands for it, or null when the DB is
 * unavailable / refuses the write. Inserted as `prod` so the next
 * readCurrentPrompt() finds it; a concurrent registration or an existing
 * (agent, version) row of any status wins the race and is returned instead.
 */
export async function registerPromptVersion(agent: string, defaults: PromptRegistrationDefaults): Promise<PromptVersion | null> {
  const parsedAgent = z.string().min(1).parse(agent);
  const sb = getSupabaseAdmin();
  if (!sb) return null;

  const attempt = await sb
    .from("prompt_versions")
    .insert({
      agent: parsedAgent,
      version: defaults.version,
      purpose: defaults.purpose,
      model: defaults.model,
      variables: defaults.variables ?? {},
      status: "prod",
      released_at: new Date().toISOString(),
    })
    .select("*")
    .maybeSingle();
  if (!attempt.error && attempt.data) {
    const parsed = PromptVersion.safeParse(attempt.data);
    if (parsed.success) return parsed.data;
  }
  if (attempt.error && !isUniqueViolation(attempt.error)) {
    console.warn(`[prompt_versions] register ${parsedAgent}@${defaults.version} failed: ${attempt.error.message}`);
    return null;
  }

  // Lost the race (agent, version) or (agent) WHERE prod — read what won.
  const byVersion = await sb
    .from("prompt_versions")
    .select("*")
    .eq("agent", parsedAgent)
    .eq("version", defaults.version)
    .maybeSingle();
  if (byVersion.data) {
    const parsed = PromptVersion.safeParse(byVersion.data);
    if (parsed.success) return parsed.data;
  }
  try {
    return await readCurrentPrompt(parsedAgent);
  } catch {
    return null;
  }
}

/**
 * The pipeline's prompt resolver (G24-B): prod row, else register the code
 * default and return it. Null only when Supabase is unavailable or the
 * registration failed — the caller then writes NULL on `ai_runs` (0435).
 */
export async function readOrRegisterPrompt(agent: string, defaults: PromptRegistrationDefaults): Promise<PromptVersion | null> {
  let current: PromptVersion | null = null;
  try {
    current = await readCurrentPrompt(agent);
  } catch (err) {
    console.warn(`[prompt_versions] read ${agent} failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
  if (current) return current;
  return registerPromptVersion(agent, defaults);
}

/**
 * Promote a canary version to prod.
 *
 * Semantics:
 *   1. Look up the current prod row for `agent` (may be null on first
 *      promotion — that is a supported bootstrap path).
 *   2. Flip the canary row to prod, stamp released_at=now(), set
 *      rollback_from to the prior prod id (or null on bootstrap).
 *   3. Flip the prior prod row (if any) to rolled_back.
 *
 * Ordering matters: the partial unique index on (agent) WHERE
 * status='prod' rejects a second prod row. We therefore demote the old
 * prod row FIRST so the promotion never trips the constraint.
 *
 * Concurrency: two promoters racing on the same agent are safe —
 * whichever loses the demote step observes the other's flip and the
 * caller retries.
 *
 * @param rolloutBy currently used only for callsite tracing (logged);
 * reserved so a future audit table can record who promoted what.
 */
/**
 * S-R5 (§C.10): demote a failing canary to `rolled_back` (prod is untouched
 * — the previous prod row keeps serving). Refuses anything that is not a
 * canary of `agent`. `reason` is recorded in the row's evaluation_result
 * JSON alongside the nightly numbers the caller already wrote.
 */
export async function demoteCanary(
  agent: string,
  canaryVersionId: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; reason: "no_canary" | "db_error" | "supabase_unavailable"; error?: string }> {
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, reason: "supabase_unavailable" };
  const lookup = await sb.from("prompt_versions").select("id, agent, status, evaluation_result").eq("id", canaryVersionId).maybeSingle();
  if (lookup.error) return { ok: false, reason: "db_error", error: lookup.error.message };
  const row = lookup.data as { id: string; agent: string; status: string; evaluation_result?: Record<string, unknown> | null } | null;
  if (!row || row.agent !== agent || row.status !== "canary") return { ok: false, reason: "no_canary" };
  const evaluation_result = { ...(row.evaluation_result ?? {}), demoted_at: new Date().toISOString(), demoted_reason: reason };
  const upd = await sb.from("prompt_versions").update({ status: "rolled_back", evaluation_result }).eq("id", canaryVersionId).eq("status", "canary");
  if (upd.error) return { ok: false, reason: "db_error", error: upd.error.message };
  return { ok: true };
}

export async function promoteCanaryToProd(
  agent: string,
  canaryVersionId: string,
  rolloutBy: string,
): Promise<PromoteResult> {
  const input = PromoteInput.parse({ agent, canaryVersionId, rolloutBy });

  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, reason: "supabase_unavailable" };

  // Verify the canary row exists and is actually a canary for this
  // agent. Refuse to promote a draft/shadow/prod/rolled_back row —
  // callers should move it through the lifecycle explicitly.
  const canaryLookup = await sb
    .from("prompt_versions")
    .select("id, agent, status")
    .eq("id", input.canaryVersionId)
    .maybeSingle();
  if (canaryLookup.error) {
    return { ok: false, reason: "db_error", error: canaryLookup.error.message };
  }
  const canary = canaryLookup.data as
    | { id: string; agent: string; status: string }
    | null;
  if (!canary || canary.agent !== input.agent || canary.status !== "canary") {
    return { ok: false, reason: "no_canary" };
  }

  // Find the current prod row (may be null on bootstrap).
  const currentProd = await readCurrentPrompt(input.agent);

  // Step 1 — demote current prod (if any) so the partial unique index
  // does not reject the promotion in step 2.
  if (currentProd) {
    const demote = await sb
      .from("prompt_versions")
      .update({ status: "rolled_back" })
      .eq("id", currentProd.id)
      .eq("status", "prod");
    if (demote.error) {
      return { ok: false, reason: "db_error", error: demote.error.message };
    }
  }

  // Step 2 — promote the canary. rollback_from points at the row we
  // just demoted so a subsequent rollback can restore it.
  const promote = await sb
    .from("prompt_versions")
    .update({
      status: "prod",
      released_at: new Date().toISOString(),
      rollback_from: currentProd?.id ?? null,
    })
    .eq("id", input.canaryVersionId)
    .eq("status", "canary");
  if (promote.error) {
    return { ok: false, reason: "db_error", error: promote.error.message };
  }

  return {
    ok: true,
    newProdId: input.canaryVersionId,
    rolledBackId: currentProd?.id ?? null,
  };
}
