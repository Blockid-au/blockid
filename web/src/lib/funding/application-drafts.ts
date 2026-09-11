// Grant / program application drafts — context gathering +
// `grant_application_drafts` persistence (T0251, migration 0323; S16-A adds
// the nullable `program_id` column, migration 0329 — exactly one of
// grant_id / program_id per row). Server-only: reads svi_snapshots,
// dataroom_files, funding_reports through the admin client.
//
// Used by POST/PATCH /api/funding/draft and the /workspace/funding?draft=
// editor page. Everything degrades: a missing table / column yields the
// empty context or `null`, never a throw, so the drafter still runs with
// whatever the founder has.

import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { Project } from "@/lib/projects";
import type { ScoredGrant, ScoredProgram } from "@/lib/agents/grant-advisor";
import type { GrantDraftContext } from "@/lib/agents/grant-application-drafter";
import type { ApplicationPrompt, DraftKind } from "./application-prompts";
import { parseApplicationPrompts } from "./application-prompts";
import { latestFundingReportForUser, stageFromNumeric } from "./workspace";

/** What a draft answers — a catalogue id plus which catalogue (S16-A). */
export interface DraftRef {
  kind: DraftKind;
  id: string;
}

/**
 * `draft` / `final` are the editor states. `spend_failed` (migration 0324)
 * quarantines a row whose credit spend did not land — the route no longer
 * inserts before spending, so it only exists for rows written before that
 * fix; `getGrantDraft` / `latestGrantDraft` never return it.
 */
export type GrantDraftStatus = "draft" | "final" | "spend_failed";

/** Mirror of `grant_application_drafts` — exactly one of `grant_id` / `program_id` is set (0329 CHECK). */
export interface GrantDraftRow {
  id: string;
  user_id: string;
  project_id: string | null;
  grant_id: string | null;
  /** `au_programs.id` for a program draft (S16-A); null for grant drafts. */
  program_id: string | null;
  answers: Record<string, string>;
  prompts: ApplicationPrompt[];
  credits_cost: number;
  status: GrantDraftStatus;
  meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

type Db = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

function answersOf(v: unknown): Record<string, string> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = typeof val === "string" ? val : "";
  return out;
}

export function rowFromDb(raw: Record<string, unknown>): GrantDraftRow {
  return {
    id: String(raw.id),
    user_id: String(raw.user_id),
    project_id: (raw.project_id as string | null) ?? null,
    grant_id: typeof raw.grant_id === "string" && raw.grant_id ? raw.grant_id : null,
    program_id: typeof raw.program_id === "string" && raw.program_id ? raw.program_id : null,
    answers: answersOf(raw.answers),
    prompts: parseApplicationPrompts(raw.prompts),
    credits_cost: Number(raw.credits_cost ?? 0) || 0,
    status: raw.status === "final" || raw.status === "spend_failed" ? raw.status : "draft",
    meta: raw.meta && typeof raw.meta === "object" ? (raw.meta as Record<string, unknown>) : {},
    created_at: String(raw.created_at ?? ""),
    updated_at: String(raw.updated_at ?? ""),
  };
}

// ─── Context ─────────────────────────────────────────────────────────────────

async function latestSvi(db: Db, project: Project | null, email: string | null): Promise<GrantDraftContext["svi"]> {
  const pick = (snap: Record<string, unknown> | null) => {
    if (!snap) return null;
    const total = Number(snap.index_value ?? snap.svi_total ?? NaN);
    return {
      total: Number.isFinite(total) ? total : null,
      dimensions: (snap.dimension_scores as Record<string, number> | null) ?? null,
      summary: typeof snap.ai_summary === "string" ? snap.ai_summary : null,
    };
  };
  try {
    if (project?.id) {
      const { data } = await db
        .from("svi_snapshots")
        .select("svi_total, index_value, dimension_scores, ai_summary")
        .eq("project_id", project.id)
        .order("snapshot_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) return pick(data as Record<string, unknown>);
    }
    if (!email) return null;
    const { data: account } = await db.from("svi_accounts").select("id").eq("email", email).maybeSingle();
    if (!account) return null;
    const { data } = await db
      .from("svi_snapshots")
      .select("svi_total, index_value, dimension_scores, ai_summary")
      .eq("account_id", (account as { id: string }).id)
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    return pick((data as Record<string, unknown> | null) ?? null);
  } catch {
    return null;
  }
}

async function evidenceFiles(db: Db, userId: string): Promise<string[]> {
  try {
    const { data } = await db
      .from("dataroom_files")
      .select("file_name, svi_dimension, status")
      .eq("user_id", userId)
      .neq("status", "deleted")
      .order("updated_at", { ascending: false })
      .limit(15);
    return ((data ?? []) as Array<{ file_name: string | null; svi_dimension: string | null }>)
      .map((f) => (f.file_name ? `${f.file_name}${f.svi_dimension ? ` (${f.svi_dimension})` : ""}` : ""))
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Everything the drafter may cite for (user, project, grant | program).
 * `ref` accepts a bare grant id (T0251 callers) or `{ kind, id }` (S16-A —
 * program drafts read `program_matches` for the match notes). Never throws.
 */
export async function gatherDraftContext(
  user: { id: string; email: string | null },
  project: Project | null,
  ref: string | DraftRef,
  deps: { db?: Db | null } = {},
): Promise<GrantDraftContext> {
  const target: DraftRef = typeof ref === "string" ? { kind: "grant", id: ref } : ref;
  const db = deps.db ?? getSupabaseAdmin();
  const base: GrantDraftContext = {
    startup: project?.name ?? "Our startup",
    description: project?.description ?? null,
    industry: project?.industry ?? null,
    stage: stageFromNumeric(project?.stage) ?? null,
    state: null,
    svi: null,
    evidence: [],
    matchWhy: [],
    eligibility: [],
  };
  if (!db) return base;

  const [report, svi, evidence] = await Promise.all([
    latestFundingReportForUser(user.id, project?.id ?? null).catch(() => null),
    latestSvi(db, project, user.email),
    evidenceFiles(db, user.id),
  ]);

  base.svi = svi;
  base.evidence = evidence;
  if (report) {
    const intake = (report.intake ?? {}) as Record<string, unknown>;
    if (typeof intake.description === "string" && intake.description.trim() && !base.description) base.description = intake.description;
    if (typeof intake.stage === "string") base.stage = intake.stage;
    if (typeof intake.state === "string") base.state = intake.state;
    const match: ScoredGrant | ScoredProgram | undefined =
      target.kind === "program"
        ? (report.program_matches ?? []).find((m: ScoredProgram) => m.ref_id === target.id)
        : (report.grant_matches ?? []).find((m: ScoredGrant) => m.ref_id === target.id);
    if (match) {
      base.matchWhy = Array.isArray(match.why) ? match.why.map(String) : [];
      base.eligibility = Array.isArray(match.eligibility_checklist)
        ? match.eligibility_checklist.map((c) => `${c.label}: ${c.status}`)
        : [];
    }
  }
  return base;
}

// ─── Persistence ─────────────────────────────────────────────────────────────

export async function insertGrantDraft(
  row: Omit<GrantDraftRow, "id" | "created_at" | "updated_at">,
  deps: { db?: Db | null } = {},
): Promise<GrantDraftRow | null> {
  const db = deps.db ?? getSupabaseAdmin();
  if (!db) return null;
  if (Boolean(row.grant_id) === Boolean(row.program_id)) {
    // Mirrors the 0329 CHECK — never round-trip a row the DB would reject.
    console.error("[funding:draft] insert needs exactly one of grant_id / program_id");
    return null;
  }
  const { data, error } = await db
    .from("grant_application_drafts")
    .insert({
      user_id: row.user_id,
      project_id: row.project_id,
      grant_id: row.grant_id ?? null,
      program_id: row.program_id ?? null,
      answers: row.answers,
      prompts: row.prompts,
      credits_cost: row.credits_cost,
      status: row.status,
      meta: row.meta,
    })
    .select("*")
    .single();
  if (error || !data) {
    console.error("[funding:draft] insert failed", error?.message ?? "no row");
    return null;
  }
  return rowFromDb(data as Record<string, unknown>);
}

export async function getGrantDraft(id: string, userId: string, deps: { db?: Db | null } = {}): Promise<GrantDraftRow | null> {
  const db = deps.db ?? getSupabaseAdmin();
  if (!db) return null;
  try {
    const { data } = await db
      .from("grant_application_drafts")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .neq("status", "spend_failed")
      .maybeSingle();
    return data ? rowFromDb(data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Newest draft for (user, project, grant | program) — what the editor opens with. */
export async function latestDraftFor(
  userId: string,
  projectId: string | null,
  ref: DraftRef,
  deps: { db?: Db | null } = {},
): Promise<GrantDraftRow | null> {
  const db = deps.db ?? getSupabaseAdmin();
  if (!db) return null;
  try {
    let q = db
      .from("grant_application_drafts")
      .select("*")
      .eq("user_id", userId)
      .eq(ref.kind === "program" ? "program_id" : "grant_id", ref.id)
      .neq("status", "spend_failed");
    q = projectId ? q.eq("project_id", projectId) : q.is("project_id", null);
    const { data } = await q.order("updated_at", { ascending: false }).limit(1).maybeSingle();
    return data ? rowFromDb(data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Newest draft for (user, project, grant) — T0251 signature, kept for the grant callers. */
export function latestGrantDraft(userId: string, projectId: string | null, grantId: string, deps: { db?: Db | null } = {}): Promise<GrantDraftRow | null> {
  return latestDraftFor(userId, projectId, { kind: "grant", id: grantId }, deps);
}

/** Newest draft for (user, project, program) — S16-A. */
export function latestProgramDraft(userId: string, projectId: string | null, programId: string, deps: { db?: Db | null } = {}): Promise<GrantDraftRow | null> {
  return latestDraftFor(userId, projectId, { kind: "program", id: programId }, deps);
}

/** Owner-scoped update of answers / status. Returns the fresh row, or null when not found / not owned. */
export async function updateGrantDraft(
  id: string,
  userId: string,
  patch: { answers?: Record<string, string>; status?: GrantDraftStatus },
  deps: { db?: Db | null } = {},
): Promise<GrantDraftRow | null> {
  const db = deps.db ?? getSupabaseAdmin();
  if (!db) return null;
  const update: Record<string, unknown> = {};
  if (patch.answers) update.answers = answersOf(patch.answers);
  if (patch.status) update.status = patch.status;
  if (!Object.keys(update).length) return getGrantDraft(id, userId, { db });
  const { data, error } = await db.from("grant_application_drafts").update(update).eq("id", id).eq("user_id", userId).select("*").maybeSingle();
  if (error || !data) return null;
  return rowFromDb(data as Record<string, unknown>);
}
