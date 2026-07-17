// A/B experiments (T-0410 + T-0411 + T-0413).
//
// Deterministic hash bucketing keyed on user_id (or fallback sessionId).
// Assignments are persisted to `ab_assignments` on first exposure so the
// user stays in the same variant forever — this lets us survive
// experiments.json edits without silently reshuffling live traffic.
//
// The experiments themselves are defined in web/config/experiments.json;
// this module reads that file at import time (server-only).

import "server-only";

import { createHash } from "node:crypto";

import experimentsConfig from "../../../config/experiments.json";
import { getSupabaseAdmin } from "@/lib/supabase";

export interface ExperimentConfig {
  id: string;
  name: string;
  description?: string;
  variants: string[];
  default_variant: string;
  weights?: Record<string, number>;
  active: boolean;
}

const EXPERIMENTS: Record<string, ExperimentConfig> = Object.fromEntries(
  (experimentsConfig as unknown as ExperimentConfig[]).map((e) => [e.id, e]),
);

export function listExperiments(): ExperimentConfig[] {
  return Object.values(EXPERIMENTS);
}

export function getExperiment(id: string): ExperimentConfig | null {
  return EXPERIMENTS[id] ?? null;
}

/**
 * Deterministic bucket: hash `${experimentId}|${subject}` → 0..999, then
 * walk the (weighted) variant list. Same input always returns the same
 * variant even without a DB write.
 */
export function bucket(experimentId: string, subject: string): string | null {
  const exp = EXPERIMENTS[experimentId];
  if (!exp || !exp.active) return exp?.default_variant ?? null;

  const digest = createHash("sha256").update(`${experimentId}|${subject}`).digest();
  const roll = digest.readUInt32BE(0) % 1000;

  const weights = exp.weights ?? {};
  const weighted = exp.variants.map((v) => weights[v] ?? Math.floor(1000 / exp.variants.length));
  const total = weighted.reduce((a, b) => a + b, 0) || 1000;

  let cursor = 0;
  for (let i = 0; i < exp.variants.length; i++) {
    cursor += Math.round((weighted[i] / total) * 1000);
    if (roll < cursor) return exp.variants[i];
  }
  return exp.default_variant ?? exp.variants[exp.variants.length - 1];
}

export interface AssignInput {
  experimentId: string;
  userId?: string | null;
  sessionId?: string | null;
}

/**
 * Return a stable variant for the user. Writes to `ab_assignments` on
 * first exposure so subsequent calls return the persisted value even if
 * the config weights change. Falls back to hash bucket when the user is
 * anonymous (only `sessionId` known).
 */
export async function assign(input: AssignInput): Promise<string | null> {
  const exp = EXPERIMENTS[input.experimentId];
  if (!exp) return null;
  if (!exp.active) return exp.default_variant;

  const subject = input.userId ?? input.sessionId ?? "";
  if (!subject) return exp.default_variant;

  const supabase = getSupabaseAdmin();
  if (!supabase) return bucket(exp.id, subject);

  if (input.userId) {
    const { data: existing } = await supabase
      .from("ab_assignments")
      .select("variant")
      .eq("experiment_id", exp.id)
      .eq("user_id", input.userId)
      .maybeSingle();
    if (existing?.variant) return existing.variant;

    const variant = bucket(exp.id, input.userId) ?? exp.default_variant;
    await supabase.from("ab_assignments").upsert(
      { user_id: input.userId, experiment_id: exp.id, variant },
      { onConflict: "user_id,experiment_id" },
    );
    return variant;
  }

  return bucket(exp.id, subject);
}
