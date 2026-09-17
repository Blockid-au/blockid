// Server-side loaders for the founder execution rubric (G14-S37).
//
// `loadFounderExecutionContext()` gathers, for one founder / project, the
// three inputs `founderExecutionSignals()` (execution.ts, pure) needs:
//
//   profile         founder_profiles row — by account id when the caller has
//                   it (the project owner), else by the analysis email
//   evaluatorFlags  the FTV `flags` of every SUBMITTED evaluator assessment
//                   on the project (any seat); `references_checked` lifts the
//                   self-reported cap
//   linkedin        the latest founder_signals row (S-R5 parser) — years /
//                   employers agreement also lifts the cap
//   github          the last GitHub connector sync (svi_signals
//                   recent_commits_30d) — scores the GitHub row
//
// Every reader is 42P01-guarded and degrades to null so a pending migration
// (0392 assessments, 0402 founder_signals, 0408 profile columns) can never
// fail an analysis. `applyFounderExecution()` is the one-liner the callers
// use: load → score → merge → persist the score (best-effort).

import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import { loadFounderProfile, loadFounderProfileByEmail, persistExecutionScore } from "@/lib/founder-profile";
import type { FounderProfile } from "@/lib/founder-profile-types";
import type { SVIExtractedSignals } from "@/lib/svi-analysis";
import {
  founderExecutionSignals,
  mergeExecutionIntoSignals,
  type EvaluatorExecutionFlags,
  type FounderExecutionSignals,
  type GitHubActivityInput,
  type LinkedInAgreementInput,
} from "./execution";

type Row = Record<string, unknown>;

export interface FounderExecutionContext {
  profile: FounderProfile | null;
  evaluatorFlags: EvaluatorExecutionFlags | null;
  linkedin: LinkedInAgreementInput | null;
  github: GitHubActivityInput | null;
}

export interface LoadFounderExecutionArgs {
  /** app_users.id of the founder (project owner) — preferred key. */
  accountId?: string | null;
  /** Fallback key: the analysis / owner email. */
  email?: string | null;
  projectId?: string | null;
}

/** Any submitted seat's FTV flags, OR-ed (a single `references_checked` tick lifts the cap). */
export async function loadEvaluatorExecutionFlags(projectId: string): Promise<EvaluatorExecutionFlags | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;
  try {
    const { data, error } = await db
      .from("evaluation_assessments")
      .select("dimension_ratings, status")
      .eq("project_id", projectId)
      .eq("status", "submitted")
      .limit(50);
    if (error || !Array.isArray(data) || data.length === 0) return null;
    const out: EvaluatorExecutionFlags = {};
    let any = false;
    for (const r of data as Row[]) {
      const ratings = r.dimension_ratings && typeof r.dimension_ratings === "object" ? (r.dimension_ratings as Row) : {};
      const ftv = ratings.FTV && typeof ratings.FTV === "object" ? (ratings.FTV as Row) : null;
      const flags = ftv?.flags && typeof ftv.flags === "object" ? (ftv.flags as Row) : null;
      if (!flags) continue;
      for (const k of ["key_person_risk", "full_time", "complementary_skills", "references_checked"] as const) {
        if (flags[k] === true) {
          out[k] = true;
          any = true;
        }
      }
    }
    return any ? out : null;
  } catch {
    return null;
  }
}

async function loadLinkedInAgreement(projectId: string): Promise<LinkedInAgreementInput | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;
  try {
    const { loadLatestFounderSignals } = await import("@/lib/connectors/linkedin-upload");
    const fs = await loadLatestFounderSignals(db as unknown as Parameters<typeof loadLatestFounderSignals>[0], projectId);
    if (!fs || fs.source === "linkedin_url") return null;
    return { yearsInDomain: fs.yearsInDomain, priorCompanies: fs.priorCompanies, exits: fs.exits };
  } catch {
    return null;
  }
}

async function loadGitHubActivity(ownerUserId: string | null, projectId: string | null): Promise<GitHubActivityInput | null> {
  const db = getSupabaseAdmin();
  if (!db || (!ownerUserId && !projectId)) return null;
  try {
    let q = db.from("svi_signals").select("signal_key, signal_value_num, captured_at").eq("provider", "github").in("signal_key", ["recent_commits_30d", "public_repos"]);
    q = projectId ? q.eq("project_id", projectId) : q.eq("user_id", ownerUserId!);
    const { data, error } = await q.order("captured_at", { ascending: false }).limit(4);
    if (error || !Array.isArray(data) || data.length === 0) return null;
    const pick = (key: string): number | null => {
      const r = (data as Row[]).find((x) => x.signal_key === key);
      const n = r ? Number(r.signal_value_num) : NaN;
      return Number.isFinite(n) ? n : null;
    };
    const commits = pick("recent_commits_30d");
    if (commits == null) return null;
    return { recentCommits30d: commits, publicRepos: pick("public_repos") };
  } catch {
    return null;
  }
}

export async function loadFounderExecutionContext(args: LoadFounderExecutionArgs): Promise<FounderExecutionContext> {
  const profilePromise = args.accountId
    ? loadFounderProfile(args.accountId).then((p) => p ?? (args.email ? loadFounderProfileByEmail(args.email) : null))
    : args.email
      ? loadFounderProfileByEmail(args.email)
      : Promise.resolve(null);
  const [profile, evaluatorFlags, linkedin, github] = await Promise.all([
    profilePromise.catch(() => null),
    args.projectId ? loadEvaluatorExecutionFlags(args.projectId) : Promise.resolve(null),
    args.projectId ? loadLinkedInAgreement(args.projectId) : Promise.resolve(null),
    loadGitHubActivity(args.accountId ?? null, args.projectId ?? null),
  ]);
  return { profile, evaluatorFlags, linkedin, github };
}

export interface ApplyFounderExecutionResult<T extends SVIExtractedSignals> {
  signals: T;
  exec: FounderExecutionSignals;
  profile: FounderProfile | null;
}

/**
 * Load → score → merge. Persists `execution_score` on the profile row
 * (best-effort, never throws). Returns the (possibly untouched) signals.
 */
export async function applyFounderExecution<T extends SVIExtractedSignals>(signals: T, args: LoadFounderExecutionArgs): Promise<ApplyFounderExecutionResult<T>> {
  const ctx = await loadFounderExecutionContext(args);
  const exec = founderExecutionSignals(ctx.profile, { evaluatorFlags: ctx.evaluatorFlags, linkedin: ctx.linkedin, github: ctx.github });
  const merged = mergeExecutionIntoSignals(signals, exec, ctx.profile);
  if (ctx.profile?.account_id && exec.hasProfile) {
    void persistExecutionScore(ctx.profile.account_id, exec.executionScore).catch(() => false);
  }
  return { signals: merged, exec, profile: ctx.profile };
}
