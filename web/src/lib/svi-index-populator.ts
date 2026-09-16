// SVI Index snapshot populator (CDO — dataset moat).
//
// Server-only. Owns the write-side of `svi_index_snapshots` for anything
// that ISN'T the /api/svi POST handler:
//
//   * one-shot backfill (`web/scripts/backfill-svi-index-snapshots.mjs`)
//   * incremental cron    (`/api/cron/svi-index-populate`)
//
// Both flows go through `populateBatch(sinceAnalysisId, limit)` so the
// insert-shape and PII guard live in exactly one place.
//
// PII rules (must not regress):
//   * We never write `email`, `raw_input`, `analysis_json`, or a company
//     name into svi_index_snapshots.
//   * The only identifier we persist is `account_id` (the foreign key the
//     aggregates already treat as an opaque bucket).
//
// The extractor is intentionally defensive: SVI analyses have grown a lot
// of optional fields over time (deepValuation, competitiveIntelligence,
// scnActionPlan, …), so anything we probe is `unknown` + narrowed with
// runtime guards. Missing/malformed fields degrade to `null` — never
// throw — so a single bad row can't stall the batch.

import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { detectSector } from "@/lib/svi-analysis";
import { findOrCreateSVIAccount } from "@/lib/projects";
import { canonicalSectorSlug, isTaxonomyHumanOwned, legacySectorSlugFor, type StartupTaxonomyRow } from "@/lib/taxonomy/startup-taxonomy";

// ─── Public types ─────────────────────────────────────────────────────────

export interface SnapshotExtract {
  svi: number;
  sector: string | null;
  stage: number | null;
  runway_months: number | null;
  burn_rate: number | null;
}

export interface PopulateResult {
  scanned: number;
  inserted: number;
  lastId: string | null;
}

// ─── Small runtime guards ────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function pickString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function pickNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function pickStage(value: unknown): number | null {
  const n = pickNumber(value);
  if (n === null) return null;
  const rounded = Math.round(n);
  if (rounded < 0 || rounded > 7) return null;
  return rounded;
}

// ─── Extractor ────────────────────────────────────────────────────────────

/**
 * Deterministic, side-effect-free projection of a persisted SVI analysis
 * (`svi_analyses.analysis_json`) into the columns we store on
 * `svi_index_snapshots`. Pure — safe to call from any context.
 *
 * `stage` is passed in explicitly because the /api/svi POST handler already
 * has it in scope; when it is null we fall back to `analysis.stage`.
 */
export function extractSnapshotFromAnalysis(
  analysis: unknown,
  stage: number | null,
): SnapshotExtract {
  const svi = isRecord(analysis) ? pickNumber(analysis.totalSVI) : null;
  const safeSvi = svi ?? 0;

  // Sector: prefer the explicit `analysis.sector` string — normalised
  // through the taxonomy crosswalk (G13 E1.5: a canonical slug is kept
  // byte-identical, free text lands as the canonical slug, unknown text as
  // null — never a guess) — then fall back to running `detectSector`
  // against any free-text surface we still have (raw_input isn't included
  // on the snapshot table, but we can peek at the inputSummary snippet
  // which is PII-safe descriptive text).
  let sector: string | null = null;
  if (isRecord(analysis)) {
    sector = canonicalSectorSlug(pickString(analysis.sector));
    if (!sector) {
      const inputSummary = isRecord(analysis.inputSummary)
        ? analysis.inputSummary
        : null;
      const snippet = inputSummary ? pickString(inputSummary.snippet) : null;
      const title = inputSummary ? pickString(inputSummary.scrapedTitle) : null;
      const desc = inputSummary
        ? pickString(inputSummary.scrapedDescription)
        : null;
      const combined = [snippet, title, desc].filter(Boolean).join(" ");
      if (combined) {
        const detected = detectSector(combined);
        if (detected) sector = detected;
      }
    }
  }

  // Stage: caller wins when it hands us a value.
  let resolvedStage = stage;
  if (resolvedStage === null && isRecord(analysis)) {
    resolvedStage = pickStage(analysis.stage);
  }

  // Runway/burn: try analysis.dimensions.financials.{runway_months,burn_rate}
  // first (that's the shape older reports emit), then fall back to the
  // camelCase equivalents at either root or dimensions level.
  let runway: number | null = null;
  let burn: number | null = null;
  if (isRecord(analysis)) {
    const dims = isRecord(analysis.dimensions) ? analysis.dimensions : null;
    const financials =
      dims && isRecord(dims.financials) ? dims.financials : null;
    if (financials) {
      runway =
        pickNumber(financials.runway_months) ??
        pickNumber(financials.runwayMonths);
      burn =
        pickNumber(financials.burn_rate) ??
        pickNumber(financials.burnRate);
    }
    if (runway === null) {
      runway =
        pickNumber(analysis.runway_months) ?? pickNumber(analysis.runwayMonths);
    }
    if (burn === null) {
      burn = pickNumber(analysis.burn_rate) ?? pickNumber(analysis.burnRate);
    }
  }

  return {
    svi: safeSvi,
    sector,
    stage: resolvedStage,
    runway_months: runway === null ? null : Math.round(runway),
    burn_rate: burn,
  };
}

// ─── Row shapes we pull from svi_analyses ────────────────────────────────

interface AnalysisRow {
  id: string;
  email: string;
  project_id?: string | null;
  created_at: string;
  analysis_json: unknown;
  total_svi: number | null;
}

/**
 * T7 (G13 E1.5): a HUMAN-owned `startup_taxonomy` row (founder / evaluator
 * confirmed) wins over whatever the analysis detected — the snapshot's
 * `sector` equals the crosswalk value so the /startup-index filter finds
 * it. Auto-classified rows are not consulted (they derive from the same
 * signals detectSector used). One query per batch; any failure (table
 * missing, RLS) degrades to "no override".
 */
export async function readHumanOwnedSectorOverrides(projectIds: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const ids = [...new Set(projectIds.filter(Boolean))];
  if (!ids.length) return out;
  const supabase = getSupabaseAdmin();
  if (!supabase) return out;
  try {
    const { data, error } = await supabase
      .from("startup_taxonomy")
      .select("project_id, industry, business_model, sub_industry, sources, confirmed_at")
      .in("project_id", ids);
    if (error || !Array.isArray(data)) return out;
    for (const raw of data as Array<Pick<StartupTaxonomyRow, "project_id" | "industry" | "business_model" | "sub_industry" | "sources" | "confirmed_at">>) {
      if (!isTaxonomyHumanOwned(raw)) continue;
      out.set(raw.project_id, legacySectorSlugFor(raw));
    }
  } catch {
    /* no override */
  }
  return out;
}

// ─── populateBatch: shared backbone for backfill + cron ──────────────────

/**
 * Scans up to `limit` analyses whose (created_at, id) is strictly greater
 * than the checkpoint carried by `sinceAnalysisId`. For each one, resolves
 * the writer's svi_account (idempotent — reuses the existing project-scoped
 * row) and inserts an anonymised snapshot.
 *
 * Duplicate protection uses two layers:
 *   * A cheap `(account_id, snapshot_date)` pre-check so we don't waste an
 *     INSERT round-trip for rows we already have.
 *   * The `UNIQUE(account_id, snapshot_date)` constraint from 0052 as the
 *     final backstop — 23505 errors are swallowed as "already inserted".
 *
 * Returns the number scanned/inserted plus the id of the last row we
 * touched (caller writes this back to `svi_index_populate_state`).
 */
export async function populateBatch(
  sinceAnalysisId: string | null,
  limit: number,
): Promise<PopulateResult> {
  if (!isSupabaseConfigured()) {
    return { scanned: 0, inserted: 0, lastId: sinceAnalysisId };
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return { scanned: 0, inserted: 0, lastId: sinceAnalysisId };

  // Resolve the checkpoint's created_at so we can page in a stable order
  // (created_at asc, then id asc). This is safer than paging on id alone
  // because `svi_analyses.id` is a random slug, not monotonic.
  let sinceCreatedAt: string | null = null;
  if (sinceAnalysisId) {
    const { data: cursor } = await supabase
      .from("svi_analyses")
      .select("created_at")
      .eq("id", sinceAnalysisId)
      .maybeSingle();
    sinceCreatedAt = (cursor?.created_at as string | undefined) ?? null;
  }

  let query = supabase
    .from("svi_analyses")
    .select("id, email, project_id, created_at, analysis_json, total_svi")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit);

  if (sinceCreatedAt) {
    // (created_at > sinceCreatedAt) OR (created_at = sinceCreatedAt AND id > sinceAnalysisId)
    // PostgREST's `or()` gives us that composite pagination boundary.
    query = query.or(
      `created_at.gt.${sinceCreatedAt},and(created_at.eq.${sinceCreatedAt},id.gt.${sinceAnalysisId})`,
    );
  }

  const { data, error } = await query;
  if (error || !data) {
    return { scanned: 0, inserted: 0, lastId: sinceAnalysisId };
  }

  const rows = data as AnalysisRow[];
  let inserted = 0;
  let lastId: string | null = sinceAnalysisId;
  const sectorOverrides = await readHumanOwnedSectorOverrides(rows.map((r) => r.project_id ?? "").filter(Boolean));

  for (const row of rows) {
    lastId = row.id;
    try {
      // svi_index_snapshots.account_id is NOT NULL — every snapshot needs a
      // resolved svi_account. Guest analyses share the (email, project=null)
      // account, which is exactly what findOrCreateSVIAccount returns.
      const accountId = await findOrCreateSVIAccount(row.email, null);
      if (!accountId) continue;

      const snapshotDate = (row.created_at ?? new Date().toISOString()).slice(
        0,
        10,
      );

      // Cheap dup check before the INSERT.
      const { data: existing } = await supabase
        .from("svi_index_snapshots")
        .select("id")
        .eq("account_id", accountId)
        .eq("snapshot_date", snapshotDate)
        .maybeSingle();
      if (existing) continue;

      const analysisJson = row.analysis_json;
      const rawTotal = isRecord(analysisJson)
        ? pickNumber(analysisJson.totalSVI)
        : null;
      const totalSvi =
        rawTotal !== null ? rawTotal : (row.total_svi ?? 0);
      const rawStage = isRecord(analysisJson)
        ? pickStage(analysisJson.stage)
        : null;

      const snap = extractSnapshotFromAnalysis(analysisJson, rawStage);
      // T7: a confirmed taxonomy's crosswalk value wins over the detected sector.
      const sector = row.project_id && sectorOverrides.has(row.project_id) ? (sectorOverrides.get(row.project_id) ?? null) : snap.sector;

      const insertRow = {
        account_id: accountId,
        svi: totalSvi,
        revenue_estimate: null,
        runway_months: snap.runway_months,
        burn_rate: snap.burn_rate,
        cap_table_entries: null,
        sector,
        state: null,
        stage: snap.stage === null ? null : String(snap.stage),
        snapshot_date: snapshotDate,
      };

      const { error: insertError } = await supabase
        .from("svi_index_snapshots")
        .insert(insertRow);

      if (insertError) {
        // 23505 = unique_violation → treat as already-inserted, keep going.
        // Anything else we log and continue so one bad row can't stall the run.
        if (insertError.code !== "23505") {
          console.warn(
            "[svi-index-populator] insert failed for",
            row.id,
            insertError.message,
          );
        }
        continue;
      }

      inserted += 1;
    } catch (err) {
      console.warn(
        "[svi-index-populator] row failed",
        row.id,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return { scanned: rows.length, inserted, lastId };
}
