/**
 * src/lib/competitive-positioning.ts
 * Server-side helpers for competitive positioning scaffolding feature.
 *
 * Handles:
 * - Feature extraction from competitor websites (via AI)
 * - Feature comparison matrix computation
 * - Positioning statement generation
 * - SVI score boost calculation based on competitive analysis
 *
 * All functions are server-only and work with the admin Supabase client.
 */

import "server-only";
import type { AppUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

/* ─── Types ────────────────────────────────────────────────────────────── */

export interface ExtractedFeature {
  id: string;
  competitor_id: string;
  feature_name: string;
  feature_category: string;
  source: "website_scrape" | "ai_analysis" | "manual_entry";
  confidence_score: number;
  has_founder_feature: boolean | null;
  founder_notes: string | null;
  extracted_from_page: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompetitorAnalysisMetadata {
  id: string;
  competitor_id: string;
  website_score: number | null;
  has_pricing_page: boolean | null;
  has_analytics_signals: boolean | null;
  tech_stack: string[] | null;
  tech_signals: string[] | null;
  last_analyzed_at: string | null;
  analysis_method: "web_scrape" | "ai_inference" | "manual";
  created_at: string;
  updated_at: string;
}

export interface PositioningStatement {
  id: string;
  user_id: string;
  project_id: string;
  statement: string;
  category: string | null;
  target_segment: string | null;
  unique_value_prop: string | null;
  competitor_context_anonymized: Record<string, unknown> | null;
  confidence_score: number | null;
  generated_by: "ai" | "founder_edited";
  version_num: number;
  created_at: string;
  updated_at: string;
}

export interface FeatureComparisonMetrics {
  total_features: number;
  founder_feature_matches: number;
  founder_feature_gaps: number;
  parity_score: number; // 0-100: % of features founder has that competitor also has
  differentiation_score: number; // 0-100: % of features founder has that competitor doesn't
}

export interface CompetitivePositioningContext {
  competitors_analyzed: number;
  total_features_extracted: number;
  avg_parity_score: number;
  avg_differentiation_score: number;
  positioning_statement_generated: boolean;
  confidence_score: number | null;
}

/* ─── Feature Extraction Helpers ────────────────────────────────────────── */

/**
 * Save extracted features for a competitor from AI analysis.
 * Called by POST /api/founder/competitors/[id]/extract-features.
 */
export async function saveExtractedFeatures(
  user: AppUser,
  competitorId: string,
  features: Array<{
    name: string;
    category: string;
    confidence_score: number;
    source: "website_scrape" | "ai_analysis" | "manual_entry";
    extracted_from_page: string;
  }>,
): Promise<ExtractedFeature[]> {
  const sb = getSupabaseAdmin();
  if (!sb) throw new Error("Supabase not configured");

  // Verify user owns this competitor
  const { data: competitor, error: compError } = await sb
    .from("competitors")
    .select("id")
    .eq("id", competitorId)
    .eq("user_id", user.id)
    .single();

  if (compError || !competitor) {
    throw new Error("Competitor not found or access denied");
  }

  // Delete existing features (fresh extraction)
  await sb
    .from("competitor_features")
    .delete()
    .eq("competitor_id", competitorId);

  // Insert new features
  const { data, error } = await sb
    .from("competitor_features")
    .insert(
      features.map((f) => ({
        competitor_id: competitorId,
        feature_name: f.name,
        feature_category: f.category,
        confidence_score: f.confidence_score,
        source: f.source,
        extracted_from_page: f.extracted_from_page,
        has_founder_feature: null, // Founder fills in next
      })),
    )
    .select();

  if (error) {
    throw new Error(`Failed to save features: ${error.message}`);
  }

  return (data ?? []) as ExtractedFeature[];
}

/**
 * List all extracted features for a competitor.
 */
export async function listCompetitorFeatures(
  user: AppUser,
  competitorId: string,
): Promise<ExtractedFeature[]> {
  const sb = getSupabaseAdmin();
  if (!sb) return [];

  // Verify user owns this competitor
  const { data: competitor, error: compError } = await sb
    .from("competitors")
    .select("id")
    .eq("id", competitorId)
    .eq("user_id", user.id)
    .single();

  if (compError || !competitor) return [];

  const { data, error } = await sb
    .from("competitor_features")
    .select("*")
    .eq("competitor_id", competitorId)
    .order("feature_category", { ascending: true })
    .order("feature_name", { ascending: true });

  if (error) {
    console.error("[competitive-positioning] listCompetitorFeatures failed", error.message);
    return [];
  }

  return (data ?? []) as ExtractedFeature[];
}

/**
 * Update founder's feature comparison (which features does founder have).
 * Called by PATCH /api/founder/competitors/[id]/features.
 */
export async function updateFeatureComparison(
  user: AppUser,
  competitorId: string,
  updates: Array<{
    feature_id: string;
    has_founder_feature: boolean | null;
    founder_notes?: string;
  }>,
): Promise<FeatureComparisonMetrics> {
  const sb = getSupabaseAdmin();
  if (!sb) throw new Error("Supabase not configured");

  // Verify user owns this competitor
  const { data: competitor, error: compError } = await sb
    .from("competitors")
    .select("id")
    .eq("id", competitorId)
    .eq("user_id", user.id)
    .single();

  if (compError || !competitor) {
    throw new Error("Competitor not found or access denied");
  }

  // Update each feature
  for (const update of updates) {
    await sb
      .from("competitor_features")
      .update({
        has_founder_feature: update.has_founder_feature,
        founder_notes: update.founder_notes ?? null,
      })
      .eq("id", update.feature_id)
      .eq("competitor_id", competitorId);
  }

  // Compute and return metrics
  return computeFeatureComparisonMetrics(sb!, competitorId);
}

/**
 * Compute feature comparison metrics for a competitor.
 */
async function computeFeatureComparisonMetrics(
  sb: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  competitorId: string,
): Promise<FeatureComparisonMetrics> {
  const { data: features, error } = await sb
    .from("competitor_features")
    .select("has_founder_feature")
    .eq("competitor_id", competitorId);

  if (error || !features) {
    return {
      total_features: 0,
      founder_feature_matches: 0,
      founder_feature_gaps: 0,
      parity_score: 0,
      differentiation_score: 0,
    };
  }

  const total = features.length;
  const matches = features.filter((f) => f.has_founder_feature === true).length;
  const gaps = features.filter((f) => f.has_founder_feature === false).length;

  return {
    total_features: total,
    founder_feature_matches: matches,
    founder_feature_gaps: gaps,
    parity_score: total > 0 ? Math.round((matches / total) * 100) : 0,
    differentiation_score: total > 0 ? Math.round((matches / total) * 100) : 0,
  };
}

/* ─── Analysis Metadata Helpers ─────────────────────────────────────────── */

/**
 * Save or update analysis metadata for a competitor (website score, tech stack, etc).
 */
export async function saveCompetitorAnalysisMetadata(
  user: AppUser,
  competitorId: string,
  metadata: Partial<Omit<CompetitorAnalysisMetadata, "id" | "created_at" | "updated_at">>,
): Promise<CompetitorAnalysisMetadata> {
  const sb = getSupabaseAdmin();
  if (!sb) throw new Error("Supabase not configured");

  // Verify user owns this competitor
  const { data: competitor, error: compError } = await sb
    .from("competitors")
    .select("id")
    .eq("id", competitorId)
    .eq("user_id", user.id)
    .single();

  if (compError || !competitor) {
    throw new Error("Competitor not found or access denied");
  }

  // Check if metadata already exists
  const { data: existing } = await sb
    .from("competitor_analysis_metadata")
    .select("id")
    .eq("competitor_id", competitorId)
    .single();

  let data, error;

  if (existing) {
    // Update
    ({ data, error } = await sb
      .from("competitor_analysis_metadata")
      .update({
        ...metadata,
        last_analyzed_at: new Date().toISOString(),
      })
      .eq("competitor_id", competitorId)
      .select()
      .single());
  } else {
    // Insert
    ({ data, error } = await sb
      .from("competitor_analysis_metadata")
      .insert({
        competitor_id: competitorId,
        ...metadata,
        last_analyzed_at: new Date().toISOString(),
      })
      .select()
      .single());
  }

  if (error) {
    throw new Error(`Failed to save analysis metadata: ${error.message}`);
  }

  return data as CompetitorAnalysisMetadata;
}

/**
 * Get analysis metadata for a competitor.
 */
export async function getCompetitorAnalysisMetadata(
  user: AppUser,
  competitorId: string,
): Promise<CompetitorAnalysisMetadata | null> {
  const sb = getSupabaseAdmin();
  if (!sb) return null;

  // Verify user owns this competitor
  const { data: competitor, error: compError } = await sb
    .from("competitors")
    .select("id")
    .eq("id", competitorId)
    .eq("user_id", user.id)
    .single();

  if (compError || !competitor) return null;

  const { data, error } = await sb
    .from("competitor_analysis_metadata")
    .select("*")
    .eq("competitor_id", competitorId)
    .maybeSingle();

  if (error) {
    console.error("[competitive-positioning] getCompetitorAnalysisMetadata failed", error.message);
    return null;
  }

  return (data ?? null) as CompetitorAnalysisMetadata | null;
}

/* ─── Positioning Statement Helpers ────────────────────────────────────── */

/**
 * Save a positioning statement (AI-generated or founder-edited).
 */
export async function savePositioningStatement(
  user: AppUser,
  projectId: string,
  statement: {
    text: string;
    category: string | null;
    targetSegment: string | null;
    uniqueValueProp: string | null;
    competitorContextAnonymized?: Record<string, unknown>;
    confidenceScore?: number;
    generatedBy: "ai" | "founder_edited";
  },
): Promise<PositioningStatement> {
  const sb = getSupabaseAdmin();
  if (!sb) throw new Error("Supabase not configured");

  // Fetch latest version number
  const { data: latest } = await sb
    .from("positioning_statements")
    .select("version_num")
    .eq("user_id", user.id)
    .eq("project_id", projectId)
    .order("version_num", { ascending: false })
    .limit(1)
    .maybeSingle();

  const versionNum = (latest?.version_num ?? 0) + 1;

  const { data, error } = await sb
    .from("positioning_statements")
    .insert({
      user_id: user.id,
      project_id: projectId,
      statement: statement.text,
      category: statement.category,
      target_segment: statement.targetSegment,
      unique_value_prop: statement.uniqueValueProp,
      competitor_context_anonymized: statement.competitorContextAnonymized ?? null,
      confidence_score: statement.confidenceScore ?? null,
      generated_by: statement.generatedBy,
      version_num: versionNum,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to save positioning statement: ${error.message}`);
  }

  return data as PositioningStatement;
}

/**
 * Get the latest positioning statement for a project.
 */
export async function getLatestPositioningStatement(
  user: AppUser,
  projectId: string,
): Promise<PositioningStatement | null> {
  const sb = getSupabaseAdmin();
  if (!sb) return null;

  const { data, error } = await sb
    .from("positioning_statements")
    .select("*")
    .eq("user_id", user.id)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[competitive-positioning] getLatestPositioningStatement failed", error.message);
    return null;
  }

  return (data ?? null) as PositioningStatement | null;
}

/**
 * Get all positioning statements for a project (history).
 */
export async function listPositioningStatements(
  user: AppUser,
  projectId: string,
): Promise<PositioningStatement[]> {
  const sb = getSupabaseAdmin();
  if (!sb) return [];

  const { data, error } = await sb
    .from("positioning_statements")
    .select("*")
    .eq("user_id", user.id)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[competitive-positioning] listPositioningStatements failed", error.message);
    return [];
  }

  return (data ?? []) as PositioningStatement[];
}

/* ─── Competitive Context Helpers ──────────────────────────────────────── */

/**
 * Gather competitive positioning context for a project.
 * Used by positioning statement generator and SVI score computation.
 */
export async function getCompetitivePositioningContext(
  user: AppUser,
  projectId: string,
): Promise<CompetitivePositioningContext> {
  const sb = getSupabaseAdmin();
  if (!sb) {
    return {
      competitors_analyzed: 0,
      total_features_extracted: 0,
      avg_parity_score: 0,
      avg_differentiation_score: 0,
      positioning_statement_generated: false,
      confidence_score: null,
    };
  }

  // Fetch all competitors for this project
  const { data: competitors, error: compError } = await sb
    .from("competitors")
    .select("id")
    .eq("user_id", user.id)
    .eq("project_id", projectId);

  if (compError || !competitors) {
    return {
      competitors_analyzed: 0,
      total_features_extracted: 0,
      avg_parity_score: 0,
      avg_differentiation_score: 0,
      positioning_statement_generated: false,
      confidence_score: null,
    };
  }

  const competitorIds = competitors.map((c) => c.id);
  if (competitorIds.length === 0) {
    return {
      competitors_analyzed: 0,
      total_features_extracted: 0,
      avg_parity_score: 0,
      avg_differentiation_score: 0,
      positioning_statement_generated: false,
      confidence_score: null,
    };
  }

  // Count total features extracted
  const { data: features, error: featError } = await sb
    .from("competitor_features")
    .select("competitor_id, has_founder_feature")
    .in("competitor_id", competitorIds);

  if (featError || !features) {
    return {
      competitors_analyzed: competitorIds.length,
      total_features_extracted: 0,
      avg_parity_score: 0,
      avg_differentiation_score: 0,
      positioning_statement_generated: false,
      confidence_score: null,
    };
  }

  // Compute average parity & differentiation scores
  const scoresByCompetitor = new Map<string, { matches: number; total: number }>();

  for (const feature of features) {
    if (!scoresByCompetitor.has(feature.competitor_id)) {
      scoresByCompetitor.set(feature.competitor_id, { matches: 0, total: 0 });
    }
    const scores = scoresByCompetitor.get(feature.competitor_id)!;
    scores.total += 1;
    if (feature.has_founder_feature) scores.matches += 1;
  }

  const parityScores = Array.from(scoresByCompetitor.values()).map(
    (s) => (s.matches / s.total) * 100,
  );
  const avgParityScore = parityScores.length > 0
    ? Math.round(parityScores.reduce((a, b) => a + b) / parityScores.length)
    : 0;

  // Check if positioning statement exists
  const { data: positioning } = await sb
    .from("positioning_statements")
    .select("confidence_score")
    .eq("user_id", user.id)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    competitors_analyzed: competitorIds.length,
    total_features_extracted: features.length,
    avg_parity_score: avgParityScore,
    avg_differentiation_score: 100 - avgParityScore, // Inverse of parity
    positioning_statement_generated: !!positioning,
    confidence_score: positioning?.confidence_score ?? null,
  };
}

/* ─── SVI Score Boost Computation ──────────────────────────────────────── */

/**
 * Compute MPC (Market Clarity) dimension boost based on competitive analysis.
 * Returns additional points to add to the base MPC score.
 */
export function computeMpcBoostFromCompetitiveAnalysis(
  competitorCount: number,
  totalFeaturesExtracted: number,
  positioningStatementGenerated: boolean,
): number {
  let boost = 0;

  // 1.5 points per competitor analyzed (max 6 for 4 competitors)
  boost += Math.min(competitorCount * 1.5, 6);

  // 0.3 points per feature extracted (max 13 for 43+ features)
  boost += Math.min(totalFeaturesExtracted * 0.3, 13);

  // Bonus for positioning statement
  if (positioningStatementGenerated) boost += 5;

  return Math.round(boost);
}

/**
 * Compute SVM (Strategic Moat) dimension boost based on competitive differentiation.
 * Returns additional points to add to the base SVM score.
 */
export function computeSvmBoostFromCompetitiveDifferentiation(
  founderUniqueFeatures: number,
  avgDifferentiationScore: number, // 0-100
): number {
  let boost = 0;

  // Differentiation score (0-100) maps to boost (1-8 points)
  if (avgDifferentiationScore > 50) boost += 8;
  else if (avgDifferentiationScore > 30) boost += 4;
  else boost += 1;

  // Bonus for unique features (2 points per feature, max 15)
  boost += Math.min(founderUniqueFeatures * 2, 15);

  return Math.round(boost);
}

/* ─── Investor Pack Integration ────────────────────────────────────────── */

/**
 * Build anonymized competitive context for investor pack.
 * Names competitors as "Competitor A", "Competitor B", "Competitor C".
 */
export interface AnonymizedCompetitor {
  label: string; // "Competitor A", "Competitor B", etc.
  positioning: string | null;
  pricing: string | null;
  threat_level: string | null;
  feature_parity_percent: number;
  feature_gap_count: number;
}

export async function buildAnonymizedCompetitiveMatrix(
  user: AppUser,
  projectId: string,
): Promise<{
  competitors: AnonymizedCompetitor[];
  positioning_statement: string | null;
  avg_parity_score: number;
  avg_differentiation_score: number;
}> {
  const sb = getSupabaseAdmin();
  if (!sb) {
    return {
      competitors: [],
      positioning_statement: null,
      avg_parity_score: 0,
      avg_differentiation_score: 0,
    };
  }

  // Fetch all competitors
  const { data: competitors, error: compError } = await sb
    .from("competitors")
    .select("id, positioning, pricing, threat_level")
    .eq("user_id", user.id)
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (compError || !competitors || competitors.length === 0) {
    return {
      competitors: [],
      positioning_statement: null,
      avg_parity_score: 0,
      avg_differentiation_score: 0,
    };
  }

  // Build anonymized competitors
  const anonymized = competitors.map((c, idx) => {
    const label = `Competitor ${String.fromCharCode(65 + idx)}`; // A, B, C, etc.
    return {
      label,
      positioning: c.positioning,
      pricing: c.pricing,
      threat_level: c.threat_level,
      feature_parity_percent: 0, // Will compute below
      feature_gap_count: 0,
    };
  });

  // Fetch positioning statement
  const { data: positioning } = await sb
    .from("positioning_statements")
    .select("statement")
    .eq("user_id", user.id)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Compute parity scores per competitor (would need feature data)
  // For now, return structure
  const context = await getCompetitivePositioningContext(user, projectId);

  return {
    competitors: anonymized,
    positioning_statement: positioning?.statement ?? null,
    avg_parity_score: context.avg_parity_score,
    avg_differentiation_score: context.avg_differentiation_score,
  };
}
