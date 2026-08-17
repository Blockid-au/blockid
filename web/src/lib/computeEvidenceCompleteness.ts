/**
 * Evidence Completeness Engine
 *
 * Calculates per-dimension evidence completeness for a project.
 * Queries `svi_dimension_evidence` table (project-scoped) and returns
 * a structured result with per-dimension percentages, missing evidence list,
 * and the highest-priority dimension to fix first.
 *
 * Two exports:
 *  - assessEvidenceQuality(projectId)  — async, hits the DB
 *  - computeEvidenceCompletenessSync(rows) — pure function for testing
 */

import { getSupabaseAdmin } from "@/lib/supabase";

// ─── Rubrics ──────────────────────────────────────────────────────────────────
// Maps each of the 5 task-spec dimensions to the required evidence types.
// Counts only — presence is binary (type exists = gathered).
// Source: IMPLEMENTATION_ROADMAP_WEEKS_1_8_FINAL.md lines 263-325

export const DIMENSION_RUBRICS: Record<string, string[]> = {
  fin: [
    "revenue_receipts",
    "tax_returns",
    "cap_table",
    "financial_model",
  ],
  tre: [
    "customer_contracts",
    "customer_testimonials",
    "churn_data",
    "cac_analysis",
  ],
  ptd: [
    "source_code_repo",
    "tech_audit",
    "security_assessment",
  ],
  cgh: [
    "founder_cvs",
    "hiring_plan",
    "equity_vesting",
    "key_person_insurance",
  ],
  lco: [
    "articles_of_association",
    "sha",
    "ip_assignment",
    "compliance_checklist",
  ],
};

// Canonical SVI dimension keys that map to the rubric keys above.
// This allows the rubrics to be expressed in task-spec language (fin, tre, ...)
// while the DB stores the canonical SVI dimension code.
export const RUBRIC_DIMENSION_ALIASES: Record<string, string> = {
  fin: "ftv", // financial evidence lives in FTV for legacy reasons
  tre: "tre",
  ptd: "ptd",
  cgh: "cgh",
  lco: "lco",
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DimensionEvidenceRow {
  dimension: string;
  evidence_type: string;
}

export interface DimensionResult {
  gathered_count: number;
  required_count: number;
  completeness_pct: number;
}

export interface EvidenceCompletenessResult {
  overall_pct: number;
  dimensions: {
    fin: DimensionResult;
    tre: DimensionResult;
    ptd: DimensionResult;
    cgh: DimensionResult;
    lco: DimensionResult;
  };
  missing: string[]; // "dimension:evidence_type" codes
  priority: string; // dimension key with lowest completeness
}

// ─── Pure sync function (for testing + offline use) ──────────────────────────

/**
 * Compute evidence completeness from raw evidence rows (no DB call).
 * Rows should be scoped to a single project before calling this.
 */
export function computeEvidenceCompletenessSync(
  evidenceRows: DimensionEvidenceRow[]
): EvidenceCompletenessResult {
  // Build a set of "dimension:evidence_type" strings for fast lookup
  const presentSet = new Set(
    evidenceRows.map((r) => `${r.dimension}:${r.evidence_type}`)
  );

  const dimensionKeys = Object.keys(DIMENSION_RUBRICS) as Array<
    keyof typeof DIMENSION_RUBRICS
  >;

  const dimensionResults: Record<string, DimensionResult> = {};
  const missing: string[] = [];

  let totalGathered = 0;
  let totalRequired = 0;

  for (const dimKey of dimensionKeys) {
    const required = DIMENSION_RUBRICS[dimKey];
    const required_count = required.length;
    // The DB stores dimension using the canonical SVI code.
    // We check both the rubric key (fin, tre...) and the alias (ftv, tre...).
    const svDim = RUBRIC_DIMENSION_ALIASES[dimKey] ?? dimKey;

    let gathered_count = 0;
    for (const evidenceType of required) {
      // Accept either the rubric alias or the canonical dimension key in DB
      const foundViaAlias = presentSet.has(`${dimKey}:${evidenceType}`);
      const foundViaSvDim = presentSet.has(`${svDim}:${evidenceType}`);
      if (foundViaAlias || foundViaSvDim) {
        gathered_count++;
      } else {
        missing.push(`${dimKey}:${evidenceType}`);
      }
    }

    const completeness_pct =
      required_count > 0
        ? Math.round((gathered_count / required_count) * 100)
        : 0;

    dimensionResults[dimKey] = {
      gathered_count,
      required_count,
      completeness_pct,
    };

    totalGathered += gathered_count;
    totalRequired += required_count;
  }

  const overall_pct =
    totalRequired > 0
      ? Math.round((totalGathered / totalRequired) * 100)
      : 0;

  // Priority = dimension with lowest completeness_pct
  let priority = dimensionKeys[0];
  let lowestPct = 101;
  for (const dimKey of dimensionKeys) {
    if (dimensionResults[dimKey].completeness_pct < lowestPct) {
      lowestPct = dimensionResults[dimKey].completeness_pct;
      priority = dimKey;
    }
  }

  return {
    overall_pct,
    dimensions: {
      fin: dimensionResults["fin"],
      tre: dimensionResults["tre"],
      ptd: dimensionResults["ptd"],
      cgh: dimensionResults["cgh"],
      lco: dimensionResults["lco"],
    },
    missing,
    priority,
  };
}

// ─── Async DB function ────────────────────────────────────────────────────────

/**
 * Fetch evidence rows for a project from `svi_dimension_evidence`
 * and compute completeness.
 *
 * Fail-soft: if the table is missing or any DB error occurs, returns
 * a zero-completeness result so callers (e.g. LCO scoring) don't crash.
 */
export async function assessEvidenceQuality(
  projectId: string
): Promise<EvidenceCompletenessResult> {
  const emptyResult = computeEvidenceCompletenessSync([]);

  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return emptyResult;

    const { data, error } = await supabase
      .from("svi_dimension_evidence")
      .select("dimension, evidence_type")
      .eq("project_id", projectId);

    if (error) {
      console.error("[blockid:evidence:completeness] DB query failed", error);
      return emptyResult;
    }

    const rows: DimensionEvidenceRow[] = (data ?? []).map((r) => ({
      dimension: String(r.dimension),
      evidence_type: String(r.evidence_type),
    }));

    const result = computeEvidenceCompletenessSync(rows);

    // Best-effort upsert into svi_evidence_completeness (if table exists)
    try {
      await supabase.from("svi_evidence_completeness").upsert(
        {
          project_id: projectId,
          overall_pct: result.overall_pct,
          fin_pct: result.dimensions.fin.completeness_pct,
          tre_pct: result.dimensions.tre.completeness_pct,
          ptd_pct: result.dimensions.ptd.completeness_pct,
          cgh_pct: result.dimensions.cgh.completeness_pct,
          lco_pct: result.dimensions.lco.completeness_pct,
          missing_evidence: result.missing,
          priority_dimension: result.priority,
          computed_at: new Date().toISOString(),
        },
        { onConflict: "project_id" }
      );
    } catch (upsertErr) {
      // Table may not exist yet — fail soft
      console.warn(
        "[blockid:evidence:completeness] svi_evidence_completeness upsert skipped",
        upsertErr
      );
    }

    return result;
  } catch (err) {
    console.error("[blockid:evidence:completeness] unexpected error", err);
    return emptyResult;
  }
}

/**
 * Fetch the last-computed completeness snapshot from DB without recomputing.
 * Falls back to assessEvidenceQuality() if no snapshot exists.
 */
export async function getEvidenceCompletenessSnapshot(
  projectId: string
): Promise<EvidenceCompletenessResult> {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return assessEvidenceQuality(projectId);

    const { data, error } = await supabase
      .from("svi_evidence_completeness")
      .select("*")
      .eq("project_id", projectId)
      .maybeSingle();

    if (error || !data) {
      // No cached snapshot — compute fresh
      return assessEvidenceQuality(projectId);
    }

    return {
      overall_pct: (data.overall_pct as number) ?? 0,
      dimensions: {
        fin: {
          gathered_count: 0,
          required_count: DIMENSION_RUBRICS["fin"].length,
          completeness_pct: (data.fin_pct as number) ?? 0,
        },
        tre: {
          gathered_count: 0,
          required_count: DIMENSION_RUBRICS["tre"].length,
          completeness_pct: (data.tre_pct as number) ?? 0,
        },
        ptd: {
          gathered_count: 0,
          required_count: DIMENSION_RUBRICS["ptd"].length,
          completeness_pct: (data.ptd_pct as number) ?? 0,
        },
        cgh: {
          gathered_count: 0,
          required_count: DIMENSION_RUBRICS["cgh"].length,
          completeness_pct: (data.cgh_pct as number) ?? 0,
        },
        lco: {
          gathered_count: 0,
          required_count: DIMENSION_RUBRICS["lco"].length,
          completeness_pct: (data.lco_pct as number) ?? 0,
        },
      },
      missing: Array.isArray(data.missing_evidence) ? data.missing_evidence as string[] : [],
      priority: (data.priority_dimension as string) ?? "fin",
    };
  } catch (err) {
    console.error("[blockid:evidence:completeness] snapshot fetch failed", err);
    return assessEvidenceQuality(projectId);
  }
}
