// G21-P1-B — the small adapter the Assessment Card and the dimension
// explainability card read evidence through. It hides WHERE evidence lives
// today (the Evidence Hub `svi_dimension_evidence` rows + the analysis
// output's ledger signals / chapter evidence rows) behind one item shape, so
// the cards do not change when the Claim / EvidenceRecord model lands.
//
// TODO(P1-A): back with evidence_records after merge — `loadDimensionEvidence`
// should read `listEvidenceRecords(projectId, dimension)` / `strongestRecords`
// from lib/evidence/records.ts and map EvidenceLevel → `level`,
// verification_level → `verified`; keep the hub-row path as the fallback for
// projects the backfill has not reached.
//
// Pure converters + one fail-soft loader (a missing table / RLS mismatch /
// mocked client all read as `[]`).

import type { SupabaseClient } from "@supabase/supabase-js";
import { confidenceRank, isConfidenceLevel, type ConfidenceLevel } from "@/lib/evidence/confidence-cap";
import { HUB_EVIDENCE_COLUMNS, hubRowConfidence, isUsableHubRow, type HubEvidenceRowLike } from "@/lib/evidence/hub-rows";
import type { EvidenceRow } from "@/lib/report-v2/schema";
import type { SVIScoreSignal } from "@/lib/svi-analysis";
import { EVIDENCE_LEVEL_BADGES, type EvidenceLevelBadge } from "@/lib/svi/evidence-confidence";
import { catalogueItem } from "@/lib/svi-lift";

export type DimensionEvidenceLevel = EvidenceLevelBadge;

export interface DimensionEvidenceItem {
  id: string;
  statement: string;
  level: DimensionEvidenceLevel;
  sourceName?: string;
  sourceUri?: string;
  verified: boolean;
  observedAt?: string;
  /** Present when the item resolves to a catalogue code (svi-completeness.ts) — lets "Missing" exclude it. */
  code?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = Pick<SupabaseClient<any, any, any>, "from">;

const DIMS = new Set<string>(["tre", "mpc", "ftv", "ptd", "cgh", "iri", "lco", "svm"]);

function badge(level: ConfidenceLevel): DimensionEvidenceLevel {
  return EVIDENCE_LEVEL_BADGES[level];
}

/** Strongest first (L6 → L1), verified before unverified at the same rung, then newest. */
export function sortStrongest(items: readonly DimensionEvidenceItem[]): DimensionEvidenceItem[] {
  const rank = (l: DimensionEvidenceLevel) => Number(l.slice(1));
  return [...items].sort((a, b) => {
    const d = rank(b.level) - rank(a.level);
    if (d !== 0) return d;
    if (a.verified !== b.verified) return a.verified ? -1 : 1;
    return (b.observedAt ?? "").localeCompare(a.observedAt ?? "");
  });
}

/** Evidence Hub row (`svi_dimension_evidence`) → item; undefined when unusable (rejected / malformed). */
export function hubRowToDimensionEvidence(row: HubEvidenceRowLike & { id?: string | null }): DimensionEvidenceItem | undefined {
  if (!isUsableHubRow(row)) return undefined;
  const level = hubRowConfidence(row);
  const signed = row.is_verified === true || Boolean(row.verified_at);
  const label = (row.evidence_label ?? "").trim() || catalogueItem(row.evidence_type)?.item.label || row.evidence_type;
  const value = typeof row.evidence_value_or_url === "string" ? row.evidence_value_or_url.trim() : "";
  const isUrl = /^https?:\/\//i.test(value);
  return {
    id: row.id ? String(row.id) : `hub:${row.dimension.toLowerCase()}:${row.evidence_type}`,
    statement: label,
    level: badge(level),
    sourceName: signed ? "BlockID reviewer" : isUrl ? "Public URL" : level === "connected_source" || level === "transaction_data" ? "Connected source" : "Founder upload",
    ...(isUrl ? { sourceUri: value } : {}),
    verified: signed,
    observedAt: row.verified_at ?? row.updated_at ?? row.created_at ?? undefined,
    code: row.evidence_type,
  };
}

/** ReportV2 chapter / appendix evidence row → item (missing rows are not evidence). */
export function reportRowToDimensionEvidence(row: EvidenceRow): DimensionEvidenceItem | undefined {
  if (row.status === "missing") return undefined;
  const level: ConfidenceLevel = isConfidenceLevel(row.confidence) ? row.confidence : row.source === "upload" ? "document_uploaded" : row.source === "url" ? "public_url" : row.source.startsWith("connector") || row.source === "stripe" || row.source === "xero" || row.source === "github" || row.source === "ga4" ? "connected_source" : "self_declared";
  const isUrl = typeof row.value === "string" && /^https?:\/\//i.test(row.value);
  return {
    id: row.evidence_id,
    statement: row.label,
    level: badge(level),
    sourceName: row.source,
    ...(isUrl ? { sourceUri: row.value } : {}),
    verified: level === "third_party_verified",
    observedAt: row.observedAt,
  };
}

/** A dimension's ledger signals (S41) → items: each ladder-sourced signal is a statement the score used. */
export function signalsToDimensionEvidence(dim: string, signals: readonly SVIScoreSignal[] | null | undefined): DimensionEvidenceItem[] {
  const out: DimensionEvidenceItem[] = [];
  for (const [i, s] of (signals ?? []).entries()) {
    if (!isConfidenceLevel(s.source)) continue;
    if (s.points <= 0) continue;
    out.push({ id: `signal:${dim}:${i}`, statement: s.signal, level: badge(s.source), sourceName: "Analysis input", verified: s.source === "third_party_verified" });
  }
  return out;
}

/** Merge sources, dropping duplicate statements (case-insensitive), strongest kept. */
export function mergeDimensionEvidence(...lists: ReadonlyArray<readonly DimensionEvidenceItem[]>): DimensionEvidenceItem[] {
  const seen = new Map<string, DimensionEvidenceItem>();
  for (const item of sortStrongest(lists.flat())) {
    const key = item.statement.trim().toLowerCase();
    if (!seen.has(key)) seen.set(key, item);
  }
  return [...seen.values()];
}

/** The strongest `n` items (default 3). */
export function strongestDimensionEvidence(items: readonly DimensionEvidenceItem[], n = 3): DimensionEvidenceItem[] {
  return sortStrongest(items).slice(0, n);
}

/** Items at or above a rung. */
export function atLeast(items: readonly DimensionEvidenceItem[], level: ConfidenceLevel): DimensionEvidenceItem[] {
  const min = confidenceRank(level) + 1;
  return items.filter((i) => Number(i.level.slice(1)) >= min);
}

/**
 * What exists today for one project + dimension: Evidence Hub rows (fail-soft
 * `[]` on any error). Callers that already hold the analysis output add its
 * items via `signalsToDimensionEvidence` / `reportRowToDimensionEvidence`.
 *
 * TODO(P1-A): back with evidence_records after merge.
 */
export async function loadDimensionEvidence(db: Db | null | undefined, projectId: string | null | undefined, dimension: string): Promise<DimensionEvidenceItem[]> {
  if (!db || !projectId) return [];
  const dim = dimension.toLowerCase();
  if (!DIMS.has(dim)) return [];
  try {
    const { data, error } = await db.from("svi_dimension_evidence").select(`id, ${HUB_EVIDENCE_COLUMNS}`).eq("project_id", projectId).eq("dimension", dim);
    if (error || !Array.isArray(data)) return [];
    return sortStrongest((data as Array<HubEvidenceRowLike & { id?: string | null }>).map(hubRowToDimensionEvidence).filter((i): i is DimensionEvidenceItem => Boolean(i)));
  } catch {
    return [];
  }
}

/** All eight dimensions in one query (the Assessment Card builder's input). Fail-soft `{}`. */
export async function loadAllDimensionEvidence(db: Db | null | undefined, projectId: string | null | undefined): Promise<Record<string, DimensionEvidenceItem[]>> {
  const out: Record<string, DimensionEvidenceItem[]> = {};
  if (!db || !projectId) return out;
  try {
    const { data, error } = await db.from("svi_dimension_evidence").select(`id, ${HUB_EVIDENCE_COLUMNS}`).eq("project_id", projectId);
    if (error || !Array.isArray(data)) return out;
    for (const row of data as Array<HubEvidenceRowLike & { id?: string | null }>) {
      const item = hubRowToDimensionEvidence(row);
      if (!item || !row.dimension) continue;
      const dim = row.dimension.toLowerCase();
      (out[dim] ??= []).push(item);
    }
    for (const dim of Object.keys(out)) out[dim] = sortStrongest(out[dim]);
    return out;
  } catch {
    return out;
  }
}
