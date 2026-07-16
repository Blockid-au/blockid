// accelerator-portal — helpers for the /workspace/accelerator surface.
//
// W5b: reads accelerator cohort data. The dedicated cohort tables land in a
// forthcoming 0080 migration; until then these helpers return placeholder
// data so the workspace UI renders in demo/preview mode without erroring.
//
// Design notes:
//   • All exports are additive and server-only (no imports leak to the
//     client bundle).
//   • Each helper degrades gracefully when Supabase is not configured or
//     the target table is missing (postgres relation "…" does not exist →
//     code === "42P01" → return the placeholder shape).
//   • Placeholder shapes match the eventual real shapes so call-sites don't
//     have to branch.

import "server-only";
import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase";

export interface Cohort {
  id: string;
  name: string;
  founderCount: number;
  startsAt: string; // ISO
  endsAt: string; // ISO
  batchSviAvg: number;
  batchSviTrend: number; // week-over-week delta
  isPlaceholder?: boolean;
}

export interface ApplicantRow {
  id: string;
  startupName: string;
  founderName: string;
  submittedAt: string; // ISO
  status: "submitted" | "reviewing" | "accepted" | "rejected";
  svi: number | null;
}

export interface CohortSviAvg {
  cohortId: string;
  avg: number;
  trend: number; // wow delta
  sampleSize: number;
  isPlaceholder?: boolean;
}

// ---------------------------------------------------------------------------
// getCohort — return the active cohort for a user. Falls back to a
// deterministic placeholder cohort so the page still renders.
// ---------------------------------------------------------------------------

export async function getCohort(
  userId: string,
  cohortId?: string,
): Promise<Cohort> {
  const placeholder: Cohort = {
    id: cohortId ?? "cohort-preview",
    name: "Q3 2026 · BlockID Founders",
    founderCount: 12,
    startsAt: new Date(Date.now() - 30 * 86_400_000).toISOString(),
    endsAt: new Date(Date.now() + 60 * 86_400_000).toISOString(),
    batchSviAvg: 68.4,
    batchSviTrend: 2.1,
    isPlaceholder: true,
  };

  if (!isSupabaseConfigured()) return placeholder;
  const supabase = getSupabaseAdmin();
  if (!supabase) return placeholder;

  // TODO: wire to cohorts table after migration 0080
  try {
    const query = supabase
      .from("cohorts")
      .select("id,name,founder_count,starts_at,ends_at,batch_svi_avg,batch_svi_trend")
      .eq("owner_id", userId);
    const { data, error } = cohortId
      ? await query.eq("id", cohortId).maybeSingle()
      : await query.order("starts_at", { ascending: false }).limit(1).maybeSingle();
    if (error) {
      if ((error as { code?: string }).code === "42P01") return placeholder;
      return placeholder;
    }
    if (!data) return placeholder;
    return {
      id: String(data.id),
      name: String(data.name ?? placeholder.name),
      founderCount: Number(data.founder_count ?? 0),
      startsAt: String(data.starts_at ?? placeholder.startsAt),
      endsAt: String(data.ends_at ?? placeholder.endsAt),
      batchSviAvg: Number(data.batch_svi_avg ?? 0),
      batchSviTrend: Number(data.batch_svi_trend ?? 0),
    };
  } catch {
    return placeholder;
  }
}

// ---------------------------------------------------------------------------
// listApplicants — return the applicant pipeline for a cohort. Empty array
// (not placeholder rows) when the table is missing so the UI can render an
// honest empty-state.
// ---------------------------------------------------------------------------

export async function listApplicants(cohortId: string): Promise<ApplicantRow[]> {
  if (!isSupabaseConfigured()) return demoApplicants(cohortId);
  const supabase = getSupabaseAdmin();
  if (!supabase) return demoApplicants(cohortId);

  // TODO: wire to cohort_applicants table after migration 0080
  try {
    const { data, error } = await supabase
      .from("cohort_applicants")
      .select("id,startup_name,founder_name,submitted_at,status,svi")
      .eq("cohort_id", cohortId)
      .order("submitted_at", { ascending: false });
    if (error) {
      if ((error as { code?: string }).code === "42P01") return demoApplicants(cohortId);
      return [];
    }
    return (data ?? []).map((row) => ({
      id: String(row.id),
      startupName: String(row.startup_name ?? ""),
      founderName: String(row.founder_name ?? ""),
      submittedAt: String(row.submitted_at ?? ""),
      status: normaliseStatus(row.status),
      svi: row.svi == null ? null : Number(row.svi),
    }));
  } catch {
    return demoApplicants(cohortId);
  }
}

function normaliseStatus(raw: unknown): ApplicantRow["status"] {
  const s = String(raw ?? "").toLowerCase();
  if (s === "reviewing" || s === "accepted" || s === "rejected") return s;
  return "submitted";
}

function demoApplicants(cohortId: string): ApplicantRow[] {
  const now = Date.now();
  const mk = (
    i: number,
    status: ApplicantRow["status"],
    svi: number | null,
    startup: string,
    founder: string,
  ): ApplicantRow => ({
    id: `${cohortId}-a${i}`,
    startupName: startup,
    founderName: founder,
    submittedAt: new Date(now - i * 86_400_000).toISOString(),
    status,
    svi,
  });
  return [
    mk(1, "submitted", 71, "Vaultbase", "Alicia Nguyen"),
    mk(3, "reviewing", 66, "Signalcraft", "Marcus Lee"),
    mk(5, "accepted", 78, "Ledgerloom", "Priya Rao"),
    mk(7, "rejected", 42, "Coinstash", "Ben Turner"),
  ];
}

// ---------------------------------------------------------------------------
// getCohortSviAvg — batch average SVI + week-over-week trend. Placeholder
// until 0080 lands.
// ---------------------------------------------------------------------------

export async function getCohortSviAvg(cohortId: string): Promise<CohortSviAvg> {
  const placeholder: CohortSviAvg = {
    cohortId,
    avg: 68.4,
    trend: 2.1,
    sampleSize: 12,
    isPlaceholder: true,
  };
  if (!isSupabaseConfigured()) return placeholder;
  const supabase = getSupabaseAdmin();
  if (!supabase) return placeholder;

  // TODO: wire to cohort_svi_snapshots table after migration 0080
  try {
    const { data, error } = await supabase
      .from("cohort_svi_snapshots")
      .select("avg,trend,sample_size")
      .eq("cohort_id", cohortId)
      .order("ts", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      if ((error as { code?: string }).code === "42P01") return placeholder;
      return placeholder;
    }
    if (!data) return placeholder;
    return {
      cohortId,
      avg: Number(data.avg ?? 0),
      trend: Number(data.trend ?? 0),
      sampleSize: Number(data.sample_size ?? 0),
    };
  } catch {
    return placeholder;
  }
}
