// Startup Package — dashboard data loader (server-only).
//
// Reads everything the `/startup-package/[projectId]` RSC page needs in a
// single Supabase round-trip fan-out:
//   - the `startup_package_purchases` row for auth-gating
//   - every `startup_package_interview` answer (for phase-progress + PDF
//     input hydration)
//   - the `startup_package_progress` row set (one per phase)
//   - the most recent `svi_snapshots` row for the project
//   - the `startup_package_reserved_allocations` row (if any)
//   - the founder's credit balance so the right rail can hide/show the
//     "Buy more credits" CTA under 5.
//
// All queries fail-soft — missing tables (fresh dev DB) or Supabase-
// unconfigured envs return typed empty shapes rather than throwing, so the
// page still renders in local dev.
//
// SUBGOAL 6 (spawn-agent-v-d-ng-cosmic-aho plan).

import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase";
import { getBalance } from "@/lib/credits";

export interface PackagePurchaseRow {
  id: string;
  user_id: string;
  project_id: string;
  purchased_at: string;
  seed_credits: number;
  status: "active" | "refunded" | "expired";
  stripe_session_id: string | null;
}

export interface PackageInterviewRow {
  step_key: string;
  answer_text: string;
  char_count: number | null;
  created_at: string;
}

export interface PackagePhaseProgressRow {
  phase_id: string;
  status: "not_started" | "in_progress" | "review" | "completed";
  completion_pct: number;
  updated_at: string;
}

export interface PackageReservedAllocationRow {
  id: string;
  pct_reserved: number;
  ticker_hint: string | null;
  on_chain_token_id: string | null;
  opt_in_at: string | null;
}

export interface PackageSviSnapshot {
  totalSVI: number;
  grade: string;
  stage: number;
  stageLabel: string;
  dimensionScores: Record<string, number> | null;
  summary: string | null;
  snapshotDate: string;
}

export interface PackageDashboardData {
  purchase: PackagePurchaseRow | null;
  interviewAnswers: PackageInterviewRow[];
  phaseProgress: PackagePhaseProgressRow[];
  sviSnapshot: PackageSviSnapshot | null;
  reservedAllocation: PackageReservedAllocationRow | null;
  creditBalance: number;
}

/**
 * Load everything the Package dashboard needs. Returns typed empty defaults
 * on any Supabase blip — the page decides how to react (redirect vs render).
 */
export async function loadPackageDashboardData(
  userId: string,
  projectId: string,
): Promise<PackageDashboardData> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return {
      purchase: null,
      interviewAnswers: [],
      phaseProgress: [],
      sviSnapshot: null,
      reservedAllocation: null,
      creditBalance: 0,
    };
  }

  const [
    purchaseRes,
    interviewRes,
    progressRes,
    sviRes,
    reservationRes,
    balance,
  ] = await Promise.all([
    supabase
      .from("startup_package_purchases")
      .select("id, user_id, project_id, purchased_at, seed_credits, status, stripe_session_id")
      .eq("user_id", userId)
      .eq("project_id", projectId)
      .in("status", ["active"])
      .order("purchased_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then((r) => r.data ?? null, () => null),
    supabase
      .from("startup_package_interview")
      .select("step_key, answer_text, char_count, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true })
      .then(
        (r) => (r.data as PackageInterviewRow[] | null) ?? [],
        () => [] as PackageInterviewRow[],
      ),
    supabase
      .from("startup_package_progress")
      .select("phase_id, status, completion_pct, updated_at")
      .eq("project_id", projectId)
      .then(
        (r) => (r.data as PackagePhaseProgressRow[] | null) ?? [],
        () => [] as PackagePhaseProgressRow[],
      ),
    loadLatestSviSnapshot(supabase, projectId, userId),
    supabase
      .from("startup_package_reserved_allocations")
      .select("id, pct_reserved, ticker_hint, on_chain_token_id, opt_in_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(
        (r) => (r.data as PackageReservedAllocationRow | null) ?? null,
        () => null,
      ),
    getBalance(userId).catch(() => 0),
  ]);

  return {
    purchase: (purchaseRes as PackagePurchaseRow | null) ?? null,
    interviewAnswers: interviewRes,
    phaseProgress: progressRes,
    sviSnapshot: sviRes,
    reservedAllocation: reservationRes,
    creditBalance: balance,
  };
}

// ─────────────────────────────────────────────────────────────────────────

async function loadLatestSviSnapshot(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  projectId: string,
  userId: string,
): Promise<PackageSviSnapshot | null> {
  if (!supabase) return null;
  // svi_snapshots is keyed off `account_id`, not project_id, in migration
  // 0008. Resolve the account via project → user → email → svi_accounts,
  // then pull the latest snapshot. Fail-soft on every step.
  try {
    const { data: project } = await supabase
      .from("projects")
      .select("id, user_id")
      .eq("id", projectId)
      .maybeSingle();
    if (!project) return null;

    const { data: user } = await supabase
      .from("app_users")
      .select("email")
      .eq("id", project.user_id ?? userId)
      .maybeSingle();
    if (!user?.email) return null;

    const { data: account } = await supabase
      .from("svi_accounts")
      .select("id")
      .eq("email", user.email)
      .maybeSingle();
    if (!account) return null;

    const { data: snap } = await supabase
      .from("svi_snapshots")
      .select("svi_total, stage, analysis_json, snapshot_date, dimension_scores, index_value")
      .eq("account_id", account.id)
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!snap) return null;

    const analysis = (snap.analysis_json as Record<string, unknown> | null) ?? null;
    const grade =
      typeof analysis?.grade === "string" ? (analysis.grade as string) : gradeFromScore(Number(snap.svi_total));
    const stageLabel =
      typeof analysis?.stageLabel === "string"
        ? (analysis.stageLabel as string)
        : `Stage ${Number(snap.stage ?? 0)}`;

    return {
      totalSVI: Number(snap.index_value ?? snap.svi_total ?? 0),
      grade,
      stage: Number(snap.stage ?? 0),
      stageLabel,
      dimensionScores: (snap.dimension_scores as Record<string, number> | null) ?? null,
      summary: typeof analysis?.summary === "string" ? (analysis.summary as string) : null,
      snapshotDate: String(snap.snapshot_date ?? new Date().toISOString().slice(0, 10)),
    };
  } catch {
    return null;
  }
}

function gradeFromScore(score: number): string {
  if (!Number.isFinite(score)) return "—";
  if (score >= 150) return "A";
  if (score >= 130) return "B";
  if (score >= 110) return "C";
  return "D";
}
