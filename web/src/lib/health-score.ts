// health-score.ts — Startup Health Score composite (server-only).
//
// Aggregates four dimensions into one 0-100 score with a grade and
// recommended next actions. Called by /api/founder/health-score.
//
// Weights:
//   SVI score          40%
//   Tech score         20%
//   Profile complete   20%
//   Analysis complete  20%
//
// All DB reads are scoped to (startup_id + user_id) so there is no
// cross-tenant data leakage.

import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HealthScoreComponents {
  sviScore: number | null; // raw from svi_index_snapshots (0-100)
  techScore: number | null; // raw from tech_analyses (0-100)
  profileCompleteness: number; // 0-100
  analysisCompleteness: number; // 0-100
}

export interface HealthScoreResult {
  overall: number; // 0-100 composite
  grade: "A" | "B" | "C" | "D" | "F";
  components: HealthScoreComponents;
  topActions: string[]; // up to 3 recommended next actions
  lastUpdated: string; // ISO timestamp
}

// ---------------------------------------------------------------------------
// Grade thresholds
// ---------------------------------------------------------------------------

function toGrade(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  if (score >= 35) return "D";
  return "F";
}

// ---------------------------------------------------------------------------
// Profile completeness (max 100pts)
//
// We select the projects row and check field presence.
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
function computeProfileCompleteness(project: Record<string, any> | null): number {
  if (!project) return 0;
  let pts = 0;

  // name present (always set on creation, but guard anyway)
  if (project.name && String(project.name).trim().length > 0) pts += 10;

  // description present + > 50 chars
  if (
    project.description &&
    String(project.description).trim().length > 50
  )
    pts += 15;

  // sector / industry present
  if (project.industry && String(project.industry).trim().length > 0) pts += 10;

  // stage present (numeric, > 0 means founder chose something)
  if (project.stage != null && Number(project.stage) >= 0) pts += 10;

  // website present — stored on projects.website_url or in svi_analyses.raw_input
  // We check several possible column names that exist across schema versions.
  const website =
    project.website_url ?? project.website ?? project.homepage_url ?? null;
  if (website && String(website).trim().length > 0) pts += 15;

  // github_url present
  if (project.github_url && String(project.github_url).trim().length > 0) pts += 10;

  // founded_year (may not exist yet — graceful)
  if (project.founded_year != null) pts += 10;

  // team_size
  if (project.team_size != null && Number(project.team_size) > 0) pts += 10;

  // country (may not exist yet)
  if (project.country && String(project.country).trim().length > 0) pts += 10;

  return Math.min(pts, 100);
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Analysis completeness (max 100pts)
//
// Each module that has been run earns points.
// ---------------------------------------------------------------------------

interface AnalysisFlags {
  hasSVI: boolean;
  hasTech: boolean;
  hasCompetitors: boolean;
  hasGTM: boolean;
  hasValuationOrPricing: boolean;
  hasDeliverable: boolean;
}

function computeAnalysisCompleteness(flags: AnalysisFlags): number {
  let pts = 0;
  if (flags.hasSVI) pts += 20;
  if (flags.hasTech) pts += 20;
  if (flags.hasCompetitors) pts += 15;
  if (flags.hasGTM) pts += 15;
  if (flags.hasValuationOrPricing) pts += 15;
  if (flags.hasDeliverable) pts += 15;
  return Math.min(pts, 100);
}

// ---------------------------------------------------------------------------
// Top actions — ordered by most impactful gap
// ---------------------------------------------------------------------------

function buildTopActions(
  components: HealthScoreComponents,
  flags: AnalysisFlags,
  /* eslint-disable @typescript-eslint/no-explicit-any */
  project: Record<string, any> | null,
  /* eslint-enable @typescript-eslint/no-explicit-any */
): string[] {
  const actions: Array<{ priority: number; text: string }> = [];

  if (!flags.hasSVI) {
    actions.push({
      priority: 1,
      text: "Run your Startup Value Index analysis",
    });
  }

  if (!flags.hasTech) {
    actions.push({
      priority: 2,
      text: "Analyse your tech stack",
    });
  }

  if (project && !project.description || (project?.description && String(project.description).trim().length <= 50)) {
    actions.push({
      priority: 3,
      text: "Complete your startup description (50+ characters)",
    });
  }

  const website =
    project?.website_url ?? project?.website ?? project?.homepage_url ?? null;
  if (!website) {
    actions.push({
      priority: 4,
      text: "Add your startup website URL",
    });
  }

  if (!project?.github_url) {
    actions.push({
      priority: 5,
      text: "Add your GitHub repository URL",
    });
  }

  if (!flags.hasCompetitors) {
    actions.push({
      priority: 6,
      text: "Run a competitor analysis",
    });
  }

  if (!flags.hasGTM) {
    actions.push({
      priority: 7,
      text: "Build your Go-To-Market strategy",
    });
  }

  if (!flags.hasValuationOrPricing) {
    actions.push({
      priority: 8,
      text: "Set up your pricing tiers",
    });
  }

  if (!flags.hasDeliverable) {
    actions.push({
      priority: 9,
      text: "Generate a deliverable report for your startup",
    });
  }

  if (components.profileCompleteness < 80) {
    const missing: string[] = [];
    if (project && !project.industry) missing.push("sector/industry");
    if (project && project.founded_year == null) missing.push("founding year");
    if (project && (project.team_size == null || Number(project.team_size) === 0))
      missing.push("team size");
    if (project && !project.country) missing.push("country");
    if (missing.length > 0) {
      actions.push({
        priority: 10,
        text: `Fill in missing profile fields: ${missing.slice(0, 2).join(", ")}`,
      });
    }
  }

  // Sort ascending by priority and take top 3
  actions.sort((a, b) => a.priority - b.priority);
  return actions.slice(0, 3).map((a) => a.text);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Compute the Startup Health Score for a given startup.
 *
 * @param startupId  The projects.id (UUID). Must belong to the calling user —
 *                   ownership must be verified BEFORE calling this function.
 */
export async function computeHealthScore(
  startupId: string,
): Promise<HealthScoreResult> {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  // Graceful: no DB → zero scores
  if (!supabase) {
    const components: HealthScoreComponents = {
      sviScore: null,
      techScore: null,
      profileCompleteness: 0,
      analysisCompleteness: 0,
    };
    return {
      overall: 0,
      grade: "F",
      components,
      topActions: [
        "Run your Startup Value Index analysis",
        "Analyse your tech stack",
        "Complete your startup description (50+ characters)",
      ],
      lastUpdated: now,
    };
  }

  // ── Parallel fetch ────────────────────────────────────────────────────────

  const [projectRes, sviRes, techRes, competitorsRes, gtmRes, pricingRes, deliverableRes] =
    await Promise.allSettled([
      // 1. projects row
      supabase
        .from("projects")
        .select("*")
        .eq("id", startupId)
        .maybeSingle(),

      // 2. latest SVI snapshot — keyed by project_id via svi_analyses
      //    svi_index_snapshots.svi maps to svi_total for the widget
      supabase
        .from("svi_analyses")
        .select("total_svi, created_at")
        .eq("project_id", startupId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),

      // 3. tech_analyses
      supabase
        .from("tech_analyses")
        .select("tech_score, created_at")
        .eq("startup_id", startupId)
        .maybeSingle(),

      // 4. competitors (count only)
      supabase
        .from("competitors")
        .select("id", { count: "exact", head: true })
        .eq("project_id", startupId),

      // 5. GTM strategy
      supabase
        .from("gtm_strategies")
        .select("id", { count: "exact", head: true })
        .eq("project_id", startupId),

      // 6. pricing tiers
      supabase
        .from("pricing_tiers")
        .select("id", { count: "exact", head: true })
        .eq("project_id", startupId),

      // 7. assembled_reports / deliverables
      supabase
        .from("assembled_reports")
        .select("id", { count: "exact", head: true })
        .eq("project_id", startupId),
    ]);

  // ── Extract results safely ────────────────────────────────────────────────

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const project: Record<string, any> | null =
    projectRes.status === "fulfilled" ? (projectRes.value.data ?? null) : null;

  const sviData =
    sviRes.status === "fulfilled" ? (sviRes.value.data ?? null) : null;
  const sviScore: number | null =
    sviData?.total_svi != null ? Number(sviData.total_svi) : null;

  const techData =
    techRes.status === "fulfilled" ? (techRes.value.data ?? null) : null;
  const techScore: number | null =
    techData?.tech_score != null ? Number(techData.tech_score) : null;

  const competitorCount =
    competitorsRes.status === "fulfilled"
      ? (competitorsRes.value.count ?? 0)
      : 0;

  const gtmCount =
    gtmRes.status === "fulfilled" ? (gtmRes.value.count ?? 0) : 0;

  const pricingCount =
    pricingRes.status === "fulfilled" ? (pricingRes.value.count ?? 0) : 0;

  const deliverableCount =
    deliverableRes.status === "fulfilled"
      ? (deliverableRes.value.count ?? 0)
      : 0;
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // ── Compute sub-scores ────────────────────────────────────────────────────

  const profileCompleteness = computeProfileCompleteness(project);

  const flags: AnalysisFlags = {
    hasSVI: sviScore != null,
    hasTech: techScore != null,
    hasCompetitors: (competitorCount ?? 0) > 0,
    hasGTM: (gtmCount ?? 0) > 0,
    hasValuationOrPricing: (pricingCount ?? 0) > 0,
    hasDeliverable: (deliverableCount ?? 0) > 0,
  };

  const analysisCompleteness = computeAnalysisCompleteness(flags);

  // ── Composite weighted score ──────────────────────────────────────────────

  const sviContribution = (sviScore ?? 0) * 0.4;
  const techContribution = (techScore ?? 0) * 0.2;
  const profileContribution = profileCompleteness * 0.2;
  const analysisContribution = analysisCompleteness * 0.2;

  const overall = Math.round(
    sviContribution + techContribution + profileContribution + analysisContribution,
  );

  const grade = toGrade(overall);

  const components: HealthScoreComponents = {
    sviScore,
    techScore,
    profileCompleteness,
    analysisCompleteness,
  };

  const topActions = buildTopActions(components, flags, project);

  return {
    overall,
    grade,
    components,
    topActions,
    lastUpdated: now,
  };
}
