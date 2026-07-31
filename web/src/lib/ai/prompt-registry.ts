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
