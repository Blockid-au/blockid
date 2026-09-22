// hub-rows — G19-S43: the Evidence Hub (`svi_dimension_evidence`, project-
// scoped) finally reaches the report pipeline and the SVI engine.
//
// Until S43 the pipeline read only the account-scoped `svi_evidence` table;
// every upload a founder made on /workspace/evidence was invisible to the
// report ("No evidence rows in this snapshot" under a confident number).
// This module is the one converter both consumers use:
//
//   hubRowToEvidenceRow()   → `EvidenceRow` for GATHER (chapter evidence
//                             table, appendix register, owner-agent prompt);
//   hubRowToEvidenceItem()  → `EvidenceItem` for extractSignals / computeSVI
//                             (the same overlay the svi_evidence rows get).
//
// Confidence follows S36 / D4: a row a reviewer signed (`is_verified`) is
// reviewer origin (may reach third_party_verified); anything else is a
// founder upload capped at document_uploaded whatever the row claims.
// Rejected rows are dropped. Pure — no I/O.

import { cappedLevel, confidenceRank, type ConfidenceLevel } from "@/lib/evidence/confidence-cap";
import type { DimKey, EvidenceSource } from "@/lib/report-pipeline/dimension-owners";
import { evidenceIdFor } from "@/lib/report-pipeline/evidence-ids";
import type { EvidenceRow, EvidenceStatus } from "@/lib/report-v2/schema";
import { catalogueItem } from "@/lib/svi-lift";

/** The `svi_dimension_evidence` columns the converter reads (migration 20260827 + 0407). */
export interface HubEvidenceRowLike {
  dimension: string | null;
  evidence_type: string | null;
  evidence_label?: string | null;
  evidence_value_or_url?: string | null;
  confidence_level?: string | null;
  is_verified?: boolean | null;
  verified_at?: string | null;
  review_status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export const HUB_EVIDENCE_COLUMNS = "dimension, evidence_type, evidence_label, evidence_value_or_url, confidence_level, is_verified, verified_at, review_status, created_at, updated_at";

const DIMS = new Set<string>(["tre", "mpc", "ftv", "ptd", "cgh", "iri", "lco", "svm"]);

/** Rejected by a reviewer or malformed → not evidence. */
export function isUsableHubRow(row: HubEvidenceRowLike): row is HubEvidenceRowLike & { dimension: string; evidence_type: string } {
  if (!row.dimension || !row.evidence_type) return false;
  if (!DIMS.has(row.dimension.toLowerCase())) return false;
  return (row.review_status ?? "none") !== "rejected";
}

/** The origin-capped confidence rung for a hub row (reviewer when signed, founder upload otherwise). */
export function hubRowConfidence(row: HubEvidenceRowLike): ConfidenceLevel {
  const signed = row.is_verified === true || Boolean(row.verified_at);
  return cappedLevel({ requested: row.confidence_level ?? catalogueItem(row.evidence_type)?.item.confidenceLevel ?? "self_declared", origin: signed ? "reviewer" : "founder_upload" });
}

/** A signed row or a real document is evidenced; a self-declared / URL-only row is partial. */
export function hubRowStatus(row: HubEvidenceRowLike): EvidenceStatus {
  const level = hubRowConfidence(row);
  return row.is_verified === true || confidenceRank(level) >= confidenceRank("document_uploaded") ? "evidenced" : "partial";
}

function sourceFor(level: ConfidenceLevel, value: string | null | undefined): EvidenceSource {
  if (level === "connected_source" || level === "transaction_data") return "connector_other";
  if (level === "public_url") return "url";
  if (level === "self_declared") return /^https?:\/\//i.test(value ?? "") ? "url" : "self_declared";
  return "upload";
}

/** Deterministic id per (project dimension, evidence type) — the same minting as the GATHER rows. */
export function hubEvidenceId(dimension: string, evidenceType: string): string {
  return evidenceIdFor(`gather|hub|${dimension.toLowerCase()}|${evidenceType}`);
}

/** A document/reviewer badge does not qualify its financial observations.
 * Conservative report projection only; original Hub records stay available for review.
 * Arbitrary descriptions can still contain undiscovered claims: this is not NLP verification.
 */
export function isFinancialHubObservation(row: HubEvidenceRowLike): boolean {
  const text = [row.evidence_type, row.evidence_label, row.evidence_value_or_url].filter(Boolean).join(" ").replace(/_/g, " ");
  return /\b(?:mrr|arr|revenue|financial|finance|bank|statement|invoice|stripe|xero|profit|margin|cash|burn|runway|valuation|churn|ltv|cac|opex|refund|ebitda|gmv|balance sheet|income|expense|doanh thu|lợi nhuận|định giá)\b|p&l|(?:A\$|US\$|\$|\bAUD\b|\bUSD\b|₫|\bVND\b)\s*[-−]?\s*\d/i.test(text);
}

/** `svi_dimension_evidence` row → `EvidenceRow` (undefined when unusable). */
export function hubRowToEvidenceRow(row: HubEvidenceRowLike, fallbackObservedAt: string): EvidenceRow | undefined {
  if (!isUsableHubRow(row)) return undefined;
  const dim = row.dimension.toLowerCase() as DimKey;
  const confidence = hubRowConfidence(row);
  const label = (row.evidence_label ?? "").trim() || catalogueItem(row.evidence_type)?.item.label || row.evidence_type;
  const value = typeof row.evidence_value_or_url === "string" && row.evidence_value_or_url.trim() ? row.evidence_value_or_url.trim() : undefined;
  const signed = row.is_verified === true || Boolean(row.verified_at);
  const observedAt = row.verified_at ?? row.updated_at ?? row.created_at ?? fallbackObservedAt;
  if (isFinancialHubObservation(row)) {
    return {
      evidence_id: hubEvidenceId(dim, row.evidence_type), source: sourceFor(confidence, value),
      label: "Financial submission — Evidence Hub, source qualification pending",
      status: "partial", observedAt, dims: [dim], confidence: "self_declared",
      value: signed
        ? "A reviewer marked this submission reviewed. Its financial metric, currency, reporting period, completeness and business identity are not source-qualified; do not treat its figures as established financial facts. Review the original submission."
        : "A founder supplied financial information. Its figures are unverified assertions, not established financial facts. Review the original submission and qualify metric, currency, reporting period, completeness and business identity.",
    };
  }

  return {
    evidence_id: hubEvidenceId(dim, row.evidence_type),
    source: sourceFor(confidence, value),
    label: `${label} — Evidence Hub${signed ? ", reviewer-verified" : row.review_status === "pending" ? ", review pending" : ""}`,
    status: hubRowStatus(row),
    observedAt,
    ...(value ? { value: value.slice(0, 200) } : {}),
    dims: [dim],
    confidence,
  };
}

/** The `EvidenceItem` shape `extractSignals` reads (svi-analysis.ts) — the catalogue code stays the `evidence_type`. */
export interface HubEvidenceItem {
  evidence_type: string;
  confidence_level: ConfidenceLevel;
  dimension: string;
  label: string;
  origin: "reviewer" | "founder_upload";
}

export function hubRowToEvidenceItem(row: HubEvidenceRowLike): HubEvidenceItem | undefined {
  if (!isUsableHubRow(row)) return undefined;
  const signed = row.is_verified === true || Boolean(row.verified_at);
  return {
    evidence_type: row.evidence_type,
    confidence_level: hubRowConfidence(row),
    dimension: row.dimension.toLowerCase(),
    label: (row.evidence_label ?? "").trim() || row.evidence_type,
    origin: signed ? "reviewer" : "founder_upload",
  };
}

/** Convenience: many rows → rows / items, unusable ones dropped. */
export function hubRowsToEvidenceRows(rows: readonly HubEvidenceRowLike[], fallbackObservedAt: string): EvidenceRow[] {
  return rows.map((r) => hubRowToEvidenceRow(r, fallbackObservedAt)).filter((r): r is EvidenceRow => Boolean(r));
}

export function hubRowsToEvidenceItems(rows: readonly HubEvidenceRowLike[]): HubEvidenceItem[] {
  return rows.map(hubRowToEvidenceItem).filter((r): r is HubEvidenceItem => Boolean(r));
}
