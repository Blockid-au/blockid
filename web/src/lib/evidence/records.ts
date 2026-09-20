// G21 P1-A — evidence_records helpers: consent-scoped listing, "strongest
// proof" ordering, the unverified-material-claims count the Assessment Card
// shows, and the canonical sha256 that makes a re-sync idempotent.
//
// Viewer scopes (mirrors the consent tiers the dossier applies — an
// evaluator never sees a `private` record, the owner sees everything):
//
//   owner       every record, whatever its visibility / consent_scope
//   evaluators  visibility ∈ {evaluators, public}, minus consent_scope.deny,
//               plus any record whose consent_scope.allowed_viewers names
//               the viewer
//   public      visibility = public, minus consent_scope.deny
//
// Pure except `listEvidenceRecords`, which reads through a ClaimsDb.

import { createHash } from "node:crypto";
import type { ClaimsDb } from "./claims-db";
import {
  EVIDENCE_LEVEL_CONFIDENCE_PCT,
  evidenceLevelRank,
  type AssessmentStatus,
  type Claim,
  type ConsentScope,
  type EvidenceRecord,
  type EvidenceRecordDraft,
  type EvidenceVisibility,
  type SviDimension,
} from "./types";

export type ViewerScope = "owner" | "evaluators" | "public";

export interface EvidenceViewer {
  scope: ViewerScope;
  /** The viewer's app_users id — consulted for consent_scope.allowed_viewers. */
  userId?: string | null;
}

/** Statuses that count as "still an open claim" on the Assessment Card. */
export const UNVERIFIED_STATUSES: readonly AssessmentStatus[] = ["claimed", "unverified", "conflicting"];

// ─── sha256 ──────────────────────────────────────────────────────────────────

/** Lower-case hex sha256 of a string. */
export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** JSON with sorted keys at every level, so the same payload always hashes the same. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[k];
      if (v !== undefined) out[k] = sortKeys(v);
    }
    return out;
  }
  return value;
}

/**
 * The identity of a proof: project + claim + ladder rung + source + what it
 * says. observed_at / submitted_at are deliberately NOT part of it — the same
 * upload re-read tomorrow is the same proof (skipped on sync); a changed
 * value or a reviewer's signature is a new proof (the older one is
 * superseded, never deleted).
 */
export function evidenceRecordHash(draft: Pick<EvidenceRecordDraft, "project_id" | "claim_key" | "svi_dimension" | "evidence_type" | "source_type" | "source_uri" | "source_name" | "verified_at" | "observed_value">): string {
  return sha256(
    canonicalJson({
      project_id: draft.project_id,
      claim_key: draft.claim_key ?? null,
      svi_dimension: draft.svi_dimension ?? null,
      evidence_type: draft.evidence_type,
      source_type: draft.source_type ?? null,
      source_uri: draft.source_uri ?? null,
      source_name: draft.source_name ?? null,
      verified_at: draft.verified_at ?? null,
      observed_value: draft.observed_value ?? null,
    }),
  );
}

// ─── consent / visibility ────────────────────────────────────────────────────

const VISIBILITY_RANK: Record<EvidenceVisibility, number> = { private: 0, evaluators: 1, public: 2 };

/** Pure: may this viewer read this record? */
export function canViewRecord(record: Pick<EvidenceRecord, "visibility" | "consent_scope">, viewer: EvidenceViewer): boolean {
  if (viewer.scope === "owner") return true;
  const scope: ConsentScope = record.consent_scope ?? {};
  if (viewer.userId && Array.isArray(scope.allowed_viewers) && scope.allowed_viewers.includes(viewer.userId)) return true;
  // deny is hierarchical: shutting evaluators out shuts the wider public out too
  if (Array.isArray(scope.deny) && (scope.deny.includes(viewer.scope) || scope.deny.includes("evaluators"))) return false;
  const needed = viewer.scope === "public" ? VISIBILITY_RANK.public : VISIBILITY_RANK.evaluators;
  return VISIBILITY_RANK[record.visibility] >= needed;
}

/** Pure: the records this viewer may see (the DB read is scope-blind on purpose — one filter, tested). */
export function filterRecordsForViewer<T extends Pick<EvidenceRecord, "visibility" | "consent_scope">>(records: readonly T[], viewer: EvidenceViewer): T[] {
  return records.filter((r) => canViewRecord(r, viewer));
}

export interface ListEvidenceRecordsOptions {
  dimension?: SviDimension | null;
  /** Default `{ scope: "owner" }` — callers on an evaluator path MUST pass the evaluator scope. */
  viewer?: EvidenceViewer;
  /** Default: active only. */
  includeInactive?: boolean;
}

/** DB: a project's records, consent-scoped for the viewer. */
export async function listEvidenceRecords(projectId: string, opts: ListEvidenceRecordsOptions, db: ClaimsDb): Promise<EvidenceRecord[]> {
  const rows = await db.listRecords(projectId, { dimension: opts.dimension ?? null });
  const viewer = opts.viewer ?? { scope: "owner" };
  const live = opts.includeInactive ? rows : rows.filter((r) => r.status === "active");
  return filterRecordsForViewer(live, viewer);
}

// ─── ordering / counts ───────────────────────────────────────────────────────

const ts = (s: string | null | undefined): number => {
  const n = s ? Date.parse(s) : NaN;
  return Number.isFinite(n) ? n : 0;
};

/**
 * The n strongest proofs: ladder rung desc, a verified record before an
 * unverified one at the same rung, then the most recently observed. Only
 * `active` records compete; expired / superseded / withdrawn never rank.
 */
export function strongestRecords<T extends Pick<EvidenceRecord, "evidence_type" | "verified_by" | "verified_at" | "observed_at" | "submitted_at" | "status">>(records: readonly T[], n = 3): T[] {
  return records
    .filter((r) => r.status === "active")
    .slice()
    .sort((a, b) => {
      const rank = evidenceLevelRank(b.evidence_type) - evidenceLevelRank(a.evidence_type);
      if (rank !== 0) return rank;
      const va = a.verified_by || a.verified_at ? 1 : 0;
      const vb = b.verified_by || b.verified_at ? 1 : 0;
      if (vb !== va) return vb - va;
      return ts(b.observed_at ?? b.submitted_at) - ts(a.observed_at ?? a.submitted_at);
    })
    .slice(0, Math.max(0, n));
}

/** Claims still open: claimed / unverified / conflicting. */
export function unverifiedMaterialClaims(claims: ReadonlyArray<Pick<Claim, "assessment_status">>): number {
  return claims.filter((c) => UNVERIFIED_STATUSES.includes(c.assessment_status)).length;
}

/** The strongest active record's ladder confidence (0–100) or null. */
export function recordsConfidence(records: ReadonlyArray<Pick<EvidenceRecord, "evidence_type" | "status">>): number | null {
  let best: number | null = null;
  for (const r of records) {
    if (r.status !== "active") continue;
    const pct = EVIDENCE_LEVEL_CONFIDENCE_PCT[r.evidence_type];
    if (best === null || pct > best) best = pct;
  }
  return best;
}

/** Counts by assessment status — the `counts` block of GET /api/projects/[id]/claims. */
export function countClaimStatuses(claims: ReadonlyArray<Pick<Claim, "assessment_status">>): Record<AssessmentStatus, number> {
  const out: Record<AssessmentStatus, number> = { claimed: 0, evidence_backed: 0, verified: 0, unverified: 0, conflicting: 0 };
  for (const c of claims) out[c.assessment_status] += 1;
  return out;
}
