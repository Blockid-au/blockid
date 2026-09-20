// Outcome ledger — server service (G21 P3-A, migration 0427).
//
//   recordOutcome()          founder (own project) / evaluator (with an
//                            `evaluations` row) / admin records ONE
//                            observation → `startup_outcomes` row. Status
//                            is `proposed` for founder + evaluator sources
//                            (the owner or an admin confirms), `confirmed`
//                            only when an admin records with confirm=true.
//   listProjectOutcomes()    the project's rows, newest observation first.
//   projectOutcomesByTier()  pure — what an evaluator sees for a consent
//                            tier (attributed_only → confirmed rows without
//                            values / notes; reports_shared → values without
//                            source links; full_mentor → everything).
//   resolveOutcome()         confirm / reject a proposed row. The project
//                            owner may resolve founder / evaluator proposals
//                            on their own project; an admin may resolve any
//                            (connector / register proposals are confirmed
//                            by BlockID so calibration inputs are not
//                            self-declared). Conditioned UPDATE → a second
//                            resolver gets 409, never a silent overwrite.
//   listOutcomesQueue()      admin queue with project names.
//
// Deps are injectable so the route tests use the fake-supabase stub; the
// audit rows for status changes are written by the routes (apiRoute) and
// the cron (appendAudit) — the service only mutates the table.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TIER_RANK, type MentorAccessTier } from "@/lib/mentor/access-tiers";
import {
  DEFAULT_CONFIDENCE,
  OUTCOME_SELECT,
  PROPOSED_OUTCOMES_PER_PROJECT_MAX,
  type OutcomeInput,
  type OutcomeRow,
  type OutcomeSource,
  type OutcomeStatus,
} from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type OutcomesDb = SupabaseClient<any, any, any>;

export interface OutcomesDeps {
  now?: () => Date;
}

export type RecordResult =
  | { ok: true; row: OutcomeRow; duplicate: boolean }
  | { ok: false; error: "too_many_proposed" | "db_error"; message: string; status: number };

const UNIQUE_VIOLATION = "23505";

/** Normalise an ISO timestamp to the minute so a founder re-submitting the same day's outcome hits the unique key. */
export function observedAtKey(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  d.setUTCSeconds(0, 0);
  return d.toISOString();
}

export async function recordOutcome(
  db: OutcomesDb,
  args: { projectId: string; input: OutcomeInput; source: OutcomeSource; recordedBy: string | null; confirm?: boolean },
  deps: OutcomesDeps = {},
): Promise<RecordResult> {
  const now = (deps.now ?? (() => new Date()))();
  const { count } = await db.from("startup_outcomes").select("id", { count: "exact", head: true }).eq("project_id", args.projectId).eq("status", "proposed");
  if ((count ?? 0) >= PROPOSED_OUTCOMES_PER_PROJECT_MAX) {
    return { ok: false, error: "too_many_proposed", message: `This startup already has ${PROPOSED_OUTCOMES_PER_PROJECT_MAX} outcomes awaiting confirmation — confirm or reject some first.`, status: 429 };
  }
  const confirmed = args.confirm === true && args.source === "admin";
  const row = {
    project_id: args.projectId,
    kind: args.input.kind,
    observed_at: observedAtKey(args.input.observedAt),
    value: args.input.value,
    source: args.source,
    confidence: args.input.confidence ?? DEFAULT_CONFIDENCE[args.source],
    recorded_by: args.recordedBy,
    status: confirmed ? "confirmed" : "proposed",
    confirmed_by: confirmed ? args.recordedBy : null,
    confirmed_at: confirmed ? now.toISOString() : null,
    note: args.input.note,
  };
  const { data, error } = await db.from("startup_outcomes").insert(row).select(OUTCOME_SELECT).single();
  if (error && (error as { code?: string }).code === UNIQUE_VIOLATION) {
    // Same (project, kind, observed_at, source) already on the ledger — return it, do not duplicate.
    const { data: existing } = await db
      .from("startup_outcomes")
      .select(OUTCOME_SELECT)
      .eq("project_id", args.projectId)
      .eq("kind", row.kind)
      .eq("observed_at", row.observed_at)
      .eq("source", row.source)
      .maybeSingle();
    if (existing) return { ok: true, row: existing as OutcomeRow, duplicate: true };
  }
  if (error || !data) return { ok: false, error: "db_error", message: "Could not save the outcome. Try again in a minute.", status: 500 };
  return { ok: true, row: data as OutcomeRow, duplicate: false };
}

export async function listProjectOutcomes(db: OutcomesDb, projectId: string, opts: { status?: OutcomeStatus | "all"; limit?: number } = {}): Promise<OutcomeRow[]> {
  let q = db.from("startup_outcomes").select(OUTCOME_SELECT).eq("project_id", projectId).order("observed_at", { ascending: false }).limit(opts.limit ?? 200);
  if (opts.status && opts.status !== "all") q = q.eq("status", opts.status);
  const { data, error } = await q;
  if (error || !data) return [];
  return data as OutcomeRow[];
}

/** The wire shape an evaluator receives — `value` / `note` may be withheld by tier. */
export type ProjectedOutcome = Omit<OutcomeRow, "recorded_by" | "confirmed_by"> & { withheld?: true };

/**
 * Pure: consent projection for an evaluator (mirrors lib/evidence/claims-access):
 *   attributed_only → confirmed rows only, kind + date + source; value / note withheld
 *   reports_shared  → confirmed + proposed rows, value without `source_url`, no note
 *   full_mentor     → everything except the actor ids
 * The owner (tier null) sees everything except the actor ids.
 */
export function projectOutcomesByTier(rows: readonly OutcomeRow[], tier: MentorAccessTier | null): ProjectedOutcome[] {
  const rank = tier ? TIER_RANK[tier] : Number.POSITIVE_INFINITY;
  const strip = (r: OutcomeRow): ProjectedOutcome => {
    const { recorded_by: _r, confirmed_by: _c, ...rest } = r;
    void _r;
    void _c;
    return rest;
  };
  if (tier && rank < TIER_RANK.reports_shared) {
    return rows.filter((r) => r.status === "confirmed").map((r) => ({ ...strip(r), value: {}, note: null, withheld: true as const }));
  }
  if (tier && rank < TIER_RANK.full_mentor) {
    return rows
      .filter((r) => r.status !== "rejected")
      .map((r) => {
        const { source_url: _u, ...value } = r.value ?? {};
        void _u;
        return { ...strip(r), value, note: null };
      });
  }
  return rows.map(strip);
}

export type ResolveDecision = "confirm" | "reject";

export type ResolveResult =
  | { ok: true; row: OutcomeRow }
  | { ok: false; error: "not_found" | "not_proposed" | "forbidden" | "already_resolved" | "db_error"; message: string; status: number };

export interface ResolveActor {
  userId: string;
  isAdmin: boolean;
  /** Projects the actor owns (checked when not admin). */
  ownsProject: (projectId: string) => Promise<boolean>;
}

/** Sources the project owner may confirm on their own project; the rest are BlockID's call. */
export const OWNER_RESOLVABLE_SOURCES: readonly OutcomeSource[] = Object.freeze(["founder", "evaluator"]);

export async function resolveOutcome(
  db: OutcomesDb,
  args: { id: string; decision: ResolveDecision; note: string | null; actor: ResolveActor },
  deps: OutcomesDeps = {},
): Promise<ResolveResult> {
  const now = (deps.now ?? (() => new Date()))();
  const { data: existing, error: readErr } = await db.from("startup_outcomes").select(OUTCOME_SELECT).eq("id", args.id).maybeSingle();
  if (readErr) return { ok: false, error: "db_error", message: "Could not read the outcome.", status: 500 };
  if (!existing) return { ok: false, error: "not_found", message: "No such outcome.", status: 404 };
  const row = existing as OutcomeRow;

  if (!args.actor.isAdmin) {
    const owns = await args.actor.ownsProject(row.project_id);
    // Existence is never confirmed to a stranger.
    if (!owns) return { ok: false, error: "not_found", message: "No such outcome.", status: 404 };
    if (!OWNER_RESOLVABLE_SOURCES.includes(row.source)) {
      return { ok: false, error: "forbidden", message: "Proposals from connectors and public registers are confirmed by BlockID.", status: 403 };
    }
  }
  if (row.status !== "proposed") return { ok: false, error: "not_proposed", message: `Already ${row.status}.`, status: 409 };

  const nowIso = now.toISOString();
  const patch: Record<string, unknown> = {
    status: args.decision === "confirm" ? "confirmed" : "rejected",
    confirmed_by: args.actor.userId,
    confirmed_at: nowIso,
    updated_at: nowIso,
  };
  if (args.note) patch.note = row.note ? `${row.note}\n— ${args.note}` : args.note;
  const { data: updated, error: updErr } = await db.from("startup_outcomes").update(patch).eq("id", args.id).eq("status", "proposed").select(OUTCOME_SELECT).maybeSingle();
  if (updErr) return { ok: false, error: "db_error", message: "Could not save the decision.", status: 500 };
  if (!updated) return { ok: false, error: "already_resolved", message: "Someone else resolved this outcome first.", status: 409 };
  return { ok: true, row: updated as OutcomeRow };
}

export interface QueueOutcomeRow extends OutcomeRow {
  project_name: string | null;
}

export async function listOutcomesQueue(db: OutcomesDb, opts: { status?: OutcomeStatus | "all"; limit?: number } = {}): Promise<QueueOutcomeRow[]> {
  let q = db.from("startup_outcomes").select(OUTCOME_SELECT).order("created_at", { ascending: false }).limit(opts.limit ?? 200);
  if (opts.status && opts.status !== "all") q = q.eq("status", opts.status);
  const { data, error } = await q;
  if (error || !data) return [];
  const rows = data as OutcomeRow[];
  if (rows.length === 0) return [];
  const projectIds = Array.from(new Set(rows.map((r) => r.project_id)));
  const { data: projects } = await db.from("projects").select("id, name").in("id", projectIds);
  const nameOf = new Map(((projects ?? []) as Array<{ id: string; name: string | null }>).map((p) => [p.id, p.name ?? null]));
  return rows.map((r) => ({ ...r, project_name: nameOf.get(r.project_id) ?? null }));
}
