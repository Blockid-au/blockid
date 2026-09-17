// Founder landing (/dashboard) data loaders — G13-W3-IA3 (spec §B.1).
//
// One loader per block, all independent so the page runs them in a single
// `Promise.all`. Every loader is member-aware (S18-B): the startup record
// (analyses, account, snapshots, evidence, criteria) is read under the
// OWNER's `dataEmail` + project, never the caller's. None of them throws —
// a failed read degrades to the block's empty state (spec §B.4), never a
// 500 on the landing.
//
// The Money Radar loader is `lib/funding/tile-data.ts` (unchanged); block 2
// is pure (`lib/nav/next-step-recommender.ts`) and needs no loader.

import "server-only";
import type { SVIAnalysis } from "@/lib/svi-analysis";
import { latestIntakeAnalysisForUser } from "@/lib/analyses/dashboard-bridge";
import { FEEDBACK_LETTER_COLUMNS, isMissingRelation, mapLetterRow, type FeedbackLetterRow } from "@/lib/evaluations/feedback-letter-store";
import { findForbiddenKey } from "@/lib/evaluations/feedback-letter-shared";

/** Keys from `pageScopeKeys()` + the resolved svi_accounts id. */
export interface LandingKeys {
  dataEmail: string;
  projectId: string | null;
  ownerUserId: string | null;
  callerId: string;
  accountId: string | null;
}

// Minimal chainable shape — keeps the loaders testable with the fake client.
type Reply<T = unknown> = { data: T; error: unknown; count?: number | null };
interface Chain {
  select(columns: string, opts?: { count?: "exact"; head?: boolean }): Chain;
  eq(col: string, val: unknown): Chain;
  is(col: string, val: unknown): Chain;
  order(col: string, opts: { ascending: boolean }): Chain;
  limit(n: number): Chain;
  maybeSingle(): Promise<Reply>;
  then<R>(cb: (r: Reply) => R): Promise<R>;
}
export interface LandingClient {
  from(table: string): unknown;
}

function q(sb: LandingClient, table: string): Chain {
  return sb.from(table) as Chain;
}

/** `.eq("project_id", id)` or `.is("project_id", null)` — the legacy owner path. */
function scopeProject(chain: Chain, projectId: string | null): Chain {
  return projectId ? chain.eq("project_id", projectId) : chain.is("project_id", null);
}

// ─── Block 1 · Where you stand ───────────────────────────────────────────────

export interface StandingData {
  analysis: SVIAnalysis | null;
  sviScore: number | null;
  /** Δ vs the previous svi_analyses row, else the latest snapshot delta. */
  delta: number | null;
  startupName: string | null;
  /** `svi_analyses.id` (report_sections key space) — null on the intake bridge. */
  analysisId: string | null;
  scoredAt: string | null;
}

export const EMPTY_STANDING: StandingData = Object.freeze({
  analysis: null,
  sviScore: null,
  delta: null,
  startupName: null,
  analysisId: null,
  scoredAt: null,
});

export async function loadStanding(sb: LandingClient | null, keys: LandingKeys): Promise<StandingData> {
  if (!sb) return EMPTY_STANDING;
  try {
    const out: StandingData = { ...EMPTY_STANDING };

    // Latest two svi_analyses rows: [0] = current, [1] = previous (Δ).
    const { data: rows } = await scopeProject(
      q(sb, "svi_analyses").select("id, analysis_json, total_svi, created_at").eq("email", keys.dataEmail),
      keys.projectId,
    )
      .order("created_at", { ascending: false })
      .limit(2);
    const list = (rows ?? []) as Array<{ id: string; analysis_json: unknown; total_svi: number | null; created_at: string }>;
    const latest = list[0];
    if (latest?.analysis_json) {
      out.analysis = latest.analysis_json as SVIAnalysis;
      out.analysisId = latest.id;
      out.scoredAt = latest.created_at;
      out.sviScore = typeof out.analysis.totalSVI === "number" ? out.analysis.totalSVI : (latest.total_svi ?? null);
      const prev = list[1]?.total_svi;
      if (typeof prev === "number" && out.sviScore != null) out.delta = out.sviScore - prev;
    } else {
      // S31-B read-side bridge — the latest /analyze run (`analyses` table)
      // for the startup's OWNER, rebuilt with the same computeSVI.
      const bridged = await latestIntakeAnalysisForUser(sb, keys.ownerUserId ?? keys.callerId);
      if (bridged) {
        out.analysis = bridged.analysis;
        out.sviScore = bridged.totalSVI;
        out.scoredAt = bridged.createdAt;
      }
    }

    if (keys.accountId) {
      const { data: account } = await q(sb, "svi_accounts").select("id, startup_name").eq("id", keys.accountId).maybeSingle();
      const acc = account as { startup_name?: string | null } | null;
      out.startupName = acc?.startup_name ?? null;
      if (out.delta == null) {
        const { data: snap } = await q(sb, "svi_snapshots")
          .select("delta")
          .eq("account_id", keys.accountId)
          .order("snapshot_date", { ascending: false })
          .limit(1)
          .maybeSingle();
        const d = (snap as { delta?: number | null } | null)?.delta;
        if (typeof d === "number" && Number.isFinite(d)) out.delta = d;
      }
    }
    return out;
  } catch (err) {
    console.warn("[landing] standing read failed", err instanceof Error ? err.message : String(err));
    return EMPTY_STANDING;
  }
}

// ─── Block 4 · Evidence to add ───────────────────────────────────────────────

export interface EvidenceReads {
  /** `svi_dimension_evidence` rows (catalogue codes) for the project. */
  evidenceRows: Array<{ dimension: string | null; evidence_type: string | null }>;
  /** `evaluation_criteria` rows for the phase gate. */
  criteria: Array<{ criterion_key: string; quality_level: string | null }>;
}

export const EMPTY_EVIDENCE: EvidenceReads = Object.freeze({ evidenceRows: [], criteria: [] });

export async function loadEvidenceReads(sb: LandingClient | null, keys: LandingKeys): Promise<EvidenceReads> {
  if (!sb) return EMPTY_EVIDENCE;
  try {
    const out: EvidenceReads = { evidenceRows: [], criteria: [] };
    if (keys.projectId) {
      const { data } = await q(sb, "svi_dimension_evidence").select("dimension, evidence_type").eq("project_id", keys.projectId);
      out.evidenceRows = (data ?? []) as EvidenceReads["evidenceRows"];
    }
    if (keys.accountId) {
      let chain = q(sb, "evaluation_criteria").select("criterion_key, quality_level").eq("account_id", keys.accountId);
      if (keys.projectId) chain = chain.eq("project_id", keys.projectId);
      const { data } = await chain;
      out.criteria = ((data ?? []) as Array<{ criterion_key: string; quality_level: string | null }>).map((c) => ({
        criterion_key: c.criterion_key,
        quality_level: c.quality_level ?? null,
      }));
    }
    return out;
  } catch (err) {
    console.warn("[landing] evidence read failed", err instanceof Error ? err.message : String(err));
    return EMPTY_EVIDENCE;
  }
}

// ─── Block 5 · Your reports ──────────────────────────────────────────────────

export interface RecentReport {
  id: string;
  total_svi: number | null;
  created_at: string;
  input_type: string | null;
  raw_input: string | null;
}

export async function loadRecentReports(sb: LandingClient | null, keys: LandingKeys, limit = 3): Promise<RecentReport[]> {
  if (!sb) return [];
  try {
    const { data } = await scopeProject(
      q(sb, "svi_analyses").select("id, total_svi, created_at, input_type, raw_input").eq("email", keys.dataEmail),
      keys.projectId,
    )
      .order("created_at", { ascending: false })
      .limit(limit);
    return ((data ?? []) as Array<Record<string, unknown>>).slice(0, limit).map((r) => ({
      id: String(r.id),
      total_svi: typeof r.total_svi === "number" ? r.total_svi : null,
      created_at: String(r.created_at ?? ""),
      input_type: (r.input_type as string | null) ?? null,
      raw_input: (r.raw_input as string | null) ?? null,
    }));
  } catch (err) {
    console.warn("[landing] reports read failed", err instanceof Error ? err.message : String(err));
    return [];
  }
}

// ─── Block 6 · What investors said (G14-S34, optional) ───────────────────────

/**
 * The founder's newest feedback letter, or null (no letter yet, migration
 * 0406 missing, member whose owner has none, or a failed read). Keyed on the
 * OWNER's user id — the letter is addressed to the founder who claimed the
 * evaluations, and a member sees the owner's letter read-only (§B.4).
 */
export async function loadFeedbackLetter(sb: LandingClient | null, keys: LandingKeys): Promise<FeedbackLetterRow | null> {
  if (!sb) return null;
  const founderId = keys.ownerUserId ?? keys.callerId;
  if (!founderId) return null;
  try {
    const { data, error } = await q(sb, "founder_feedback_letters")
      .select(FEEDBACK_LETTER_COLUMNS)
      .eq("founder_user_id", founderId)
      .order("window_end", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      if (!isMissingRelation(error as { code?: string; message?: string })) console.warn("[landing] feedback letter read failed", (error as { message?: string }).message);
      return null;
    }
    if (!data) return null;
    const letter = mapLetterRow(data as Record<string, unknown>);
    // Defence in depth — never render a row that carries a forbidden key.
    if (findForbiddenKey({ aggregate: letter.aggregate, next_actions: letter.nextActions })) return null;
    return letter;
  } catch (err) {
    console.warn("[landing] feedback letter read failed", err instanceof Error ? err.message : String(err));
    return null;
  }
}
