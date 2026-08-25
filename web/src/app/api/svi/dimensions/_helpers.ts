// Shared helpers for the dimension-level SVI evidence completeness routes.
//
// Owner verification (401/403/404), evidence loading, and roadmap/forecast
// computation are centralised here so the five route files stay thin.
// Reuses compute functions from `svi-completeness.ts` — no logic duplication.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/auth";
import {
  calculateDimensionCompleteness,
  generateFixRoadmap,
  forecastRoadmapImpact,
  EVIDENCE_CATALOG,
  type DimensionCompletenessResult,
  type RoadmapItem,
  type RoadmapForecast,
} from "@/lib/svi-completeness";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(v: string | undefined | null): boolean {
  return typeof v === "string" && UUID_RE.test(v);
}

export const KNOWN_DIMENSIONS = Object.keys(EVIDENCE_CATALOG);

export interface AuthContext {
  supabase: SupabaseClient;
  userId: string;
  projectId: string;
}

export type AuthResult =
  | { ok: true; ctx: AuthContext }
  | { ok: false; status: number; error: string };

/**
 * Verify the current user owns the given projectId.
 * Returns a discriminated union so callers can early-return with the correct
 * HTTP status code.
 */
export async function requireProjectOwner(
  projectId: string,
): Promise<AuthResult> {
  if (!isValidUuid(projectId)) {
    return { ok: false, status: 400, error: "Invalid projectId" };
  }

  const user = await getCurrentUser();
  if (!user) return { ok: false, status: 401, error: "Unauthorized" };

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { ok: false, status: 503, error: "Database not configured" };
  }

  const { data, error } = await supabase
    .from("projects")
    .select("id, user_id")
    .eq("id", projectId)
    .maybeSingle();

  if (error) {
    console.error("[blockid:svi-dimensions] project lookup failed", error);
    return { ok: false, status: 500, error: "Project lookup failed" };
  }
  if (!data) return { ok: false, status: 404, error: "Project not found" };
  if ((data.user_id as string) !== user.id) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  return { ok: true, ctx: { supabase, userId: user.id, projectId } };
}

// ---------------------------------------------------------------------------
// Evidence & completeness loading
// ---------------------------------------------------------------------------

interface EvidenceRow {
  dimension: string;
  evidence_type: string;
  confidence_level: string | null;
}

/** Load evidence rows and compute per-dimension results across all 8 dims. */
export async function loadDimensionResults(
  supabase: SupabaseClient,
  projectId: string,
): Promise<{
  results: DimensionCompletenessResult[];
  presentByDimension: Record<string, Set<string>>;
}> {
  const { data } = await supabase
    .from("svi_dimension_evidence")
    .select("dimension, evidence_type, confidence_level")
    .eq("project_id", projectId);

  const rows: EvidenceRow[] = (data ?? []) as EvidenceRow[];

  const presentByDimension: Record<string, Set<string>> = {};
  for (const row of rows) {
    const dim = row.dimension;
    if (!presentByDimension[dim]) presentByDimension[dim] = new Set();
    presentByDimension[dim].add(row.evidence_type);
  }

  const results = KNOWN_DIMENSIONS.map((dim) =>
    calculateDimensionCompleteness(dim, presentByDimension[dim] ?? new Set()),
  );

  return { results, presentByDimension };
}

/** Fetch the latest SVI overall_score for a project (0 when unavailable). */
export async function loadCurrentSvi(
  supabase: SupabaseClient,
  projectId: string,
): Promise<number> {
  const { data } = await supabase
    .from("svi_snapshots")
    .select("overall_score")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.overall_score as number | undefined) ?? 0;
}

/** Compute the full roadmap + forecast (delegates to svi-completeness). */
export function computeRoadmapAndForecast(
  results: DimensionCompletenessResult[],
  currentSvi: number,
  completionRateAssumption?: number,
): { roadmap: RoadmapItem[]; forecast: RoadmapForecast } {
  const roadmap = generateFixRoadmap(results);
  const forecast = forecastRoadmapImpact(
    roadmap,
    currentSvi,
    completionRateAssumption,
  );
  return { roadmap, forecast };
}

/** Group roadmap items by week for the roadmap endpoint response. */
export function groupRoadmapByWeek(items: RoadmapItem[]): Array<{
  week: number;
  items: Array<{
    code: string;
    label: string;
    dimension: string;
    effortHours: number;
    impactSvi: number;
    urgencyTier: number;
    urgencyLabel: string;
    bangForBuck: number;
    completed: boolean;
  }>;
}> {
  const byWeek = new Map<number, RoadmapItem[]>();
  for (const item of items) {
    const arr = byWeek.get(item.roadmapWeek) ?? [];
    arr.push(item);
    byWeek.set(item.roadmapWeek, arr);
  }
  return Array.from(byWeek.entries())
    .sort(([a], [b]) => a - b)
    .map(([week, wkItems]) => ({
      week,
      items: wkItems.map((i) => ({
        code: i.evidenceType,
        label: i.evidenceLabel,
        dimension: i.dimension,
        effortHours: i.estimatedEffortHours,
        impactSvi: i.estimatedSviImpact,
        urgencyTier: i.urgencyTier,
        urgencyLabel: i.urgencyLabel,
        bangForBuck: i.bangForBuck,
        completed: false,
      })),
    }));
}

/** Attach `completed` flags to grouped roadmap items using DB state. */
export async function loadCompletedEvidenceTypes(
  supabase: SupabaseClient,
  projectId: string,
): Promise<Set<string>> {
  const { data } = await supabase
    .from("svi_evidence_roadmap")
    .select("evidence_type, is_completed")
    .eq("project_id", projectId)
    .eq("is_completed", true);
  const set = new Set<string>();
  for (const row of (data ?? []) as Array<{ evidence_type: string }>) {
    set.add(row.evidence_type);
  }
  return set;
}
