// G21 P1-A — the Claim ≠ Evidence model (migration 0417).
//
// A Claim is WHAT is asserted about a project ("A$12k MRR", "cap table
// exists"); an EvidenceRecord is a PROOF that backs it (a hub upload, a
// public URL, a Stripe pull, a reviewer's signature). The two used to be one
// row; this module is the shared vocabulary every lane imports (P1-B renders
// it, P1-C files corrections against it) — keep the exported names stable.
//
// The evidence ladder here is the L1–L6 labelling of the confidence rungs in
// ./confidence-cap.ts (self_declared … third_party_verified); the two are
// bijective and the helpers below convert.
//
// Pure: no I/O, safe in client components.

import { CONFIDENCE_LEVELS, type ConfidenceLevel } from "./confidence-cap";

export const EVIDENCE_LEVELS = [
  "L1_self_declared",
  "L2_public_url",
  "L3_uploaded_document",
  "L4_connected_source",
  "L5_transaction_data",
  "L6_third_party_verified",
] as const;
export type EvidenceLevel = (typeof EVIDENCE_LEVELS)[number];

export const ASSESSMENT_STATUSES = ["claimed", "evidence_backed", "verified", "unverified", "conflicting"] as const;
export type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[number];

export const CONTRADICTION_STATUSES = ["none", "conflicting", "resolved"] as const;
export type ContradictionStatus = (typeof CONTRADICTION_STATUSES)[number];

export const EVIDENCE_VISIBILITIES = ["private", "evaluators", "public"] as const;
export type EvidenceVisibility = (typeof EVIDENCE_VISIBILITIES)[number];

export const EVIDENCE_RECORD_STATUSES = ["active", "expired", "superseded", "withdrawn"] as const;
export type EvidenceRecordStatus = (typeof EVIDENCE_RECORD_STATUSES)[number];

export const SVI_DIMENSIONS = ["ftv", "mpc", "ptd", "tre", "cgh", "iri", "lco", "svm"] as const;
export type SviDimension = (typeof SVI_DIMENSIONS)[number];

/** Who produced a claim's value — the contradiction check only compares values from DIFFERENT sources. */
export type ClaimValueSource = "founder" | "analysis" | "connector" | "hub" | "reviewer" | "external";

/** The comparable form of a claim value (`claims.normalized_value`). */
export type NormalizedValue =
  | { kind: "number"; value: number; unit?: string }
  | { kind: "string"; value: string }
  | { kind: "boolean"; value: boolean };

export interface Claim {
  id: string;
  project_id: string;
  svi_dimension: SviDimension;
  category: string | null;
  claim_key: string | null;
  statement: string;
  founder_claimed_value: unknown | null;
  extracted_value: unknown | null;
  normalized_value: NormalizedValue | null;
  /** 0–100: the strongest active record's ladder confidence (EVIDENCE_CONFIDENCE × 100); null before any record. */
  confidence: number | null;
  contradiction_status: ContradictionStatus;
  assessment_status: AssessmentStatus;
  source_report_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EvidenceRecord {
  id: string;
  project_id: string;
  claim_id: string | null;
  svi_dimension: SviDimension | null;
  evidence_type: EvidenceLevel;
  /** Where the proof came from: `founder_text` | `evidence_hub` | `stripe` | `xero` | `ga4` | `github` | `external` | `reviewer` | … */
  source_type: string | null;
  source_uri: string | null;
  source_name: string | null;
  submitted_by: string | null;
  submitted_at: string;
  observed_at: string | null;
  confidence: number | null;
  verification_level: string | null;
  verified_by: string | null;
  verified_at: string | null;
  expires_at: string | null;
  /** sha256 hex of the canonical payload (records.ts evidenceRecordHash). */
  hash: string | null;
  /** The value this proof carries for its claim (a connector's MRR) — compared by detectContradictions; null for existence-only proof. */
  observed_value: NormalizedValue | null;
  visibility: EvidenceVisibility;
  consent_scope: ConsentScope;
  status: EvidenceRecordStatus;
  created_at: string;
  updated_at: string;
}

/** `evidence_records.consent_scope` — founder-controlled disclosure beyond `visibility`. */
export interface ConsentScope {
  /** app_users ids that may read this record whatever its visibility. */
  allowed_viewers?: string[];
  /** Viewer scopes explicitly denied even when visibility would admit them. */
  deny?: Array<Exclude<EvidenceVisibility, "private">>;
}

export interface ClaimVersion {
  id: string;
  claim_id: string;
  version: number;
  snapshot: Record<string, unknown>;
  note: string | null;
  changed_by: string | null;
  changed_at: string;
}

/** A claim before it has a row: what `deriveClaims` emits and `syncClaimsForProject` upserts. */
export interface ClaimDraft {
  project_id: string;
  svi_dimension: SviDimension;
  category: string | null;
  claim_key: string;
  statement: string;
  extracted_value: unknown | null;
  normalized_value: NormalizedValue | null;
  source_report_id: string | null;
  /** Who produced `normalized_value` — feeds detectContradictions. */
  source: ClaimValueSource;
}

/** An evidence record before it has a row; `claim_key` links it to its claim draft (resolved to claim_id on sync). */
export interface EvidenceRecordDraft {
  project_id: string;
  claim_key: string | null;
  svi_dimension: SviDimension | null;
  evidence_type: EvidenceLevel;
  source_type: string | null;
  source_uri: string | null;
  source_name: string | null;
  submitted_by: string | null;
  observed_at: string | null;
  confidence: number | null;
  verification_level: string | null;
  verified_by: string | null;
  verified_at: string | null;
  expires_at: string | null;
  visibility: EvidenceVisibility;
  consent_scope: ConsentScope;
  /** The value this proof carries for the claim (a connector's MRR) — compared by detectContradictions. */
  observed_value?: NormalizedValue | null;
}

/**
 * G21 P3-C — one observation a connected source makes about one claim key,
 * as `lib/connectors/connector-evidence.ts` derives it from a sync /
 * snapshot and `deriveClaims` turns into an EvidenceRecord draft (+ the
 * claim itself when nothing stated it). `evidence_type` is the ladder level
 * the connector registry assigns (L4 `connected_source`, L5
 * `transaction_data` for revenue / payouts) — never L6, which needs a human.
 */
export interface ConnectorEvidenceRow {
  /** `evidence_records.source_type` — `stripe` | `xero` | `github` | `ga4` | `abr` … */
  provider: string;
  /** Display name of the source ("Xero"). */
  source_name: string;
  /** A CLAIM_REGISTRY key. */
  claim_key: string;
  /** Statement to mint the claim with when no analysis stated it; the registry's default otherwise. */
  statement?: string | null;
  value: NormalizedValue | null;
  evidence_type: EvidenceLevel;
  /** Snapshot / sync time. */
  observed_at: string;
  /** `connector://<provider>/<day>/<payload hash>` — changes per snapshot so the record hash does too. */
  source_uri?: string | null;
}

// ─── ladder helpers ──────────────────────────────────────────────────────────

const LEVEL_BY_CONFIDENCE: Record<ConfidenceLevel, EvidenceLevel> = {
  self_declared: "L1_self_declared",
  public_url: "L2_public_url",
  document_uploaded: "L3_uploaded_document",
  connected_source: "L4_connected_source",
  transaction_data: "L5_transaction_data",
  third_party_verified: "L6_third_party_verified",
};
const CONFIDENCE_BY_LEVEL = Object.fromEntries(Object.entries(LEVEL_BY_CONFIDENCE).map(([c, l]) => [l, c])) as Record<EvidenceLevel, ConfidenceLevel>;

/** confidence-cap rung → L1–L6 label. */
export function evidenceLevelFromConfidence(level: ConfidenceLevel): EvidenceLevel {
  return LEVEL_BY_CONFIDENCE[level];
}

/** L1–L6 label → confidence-cap rung. */
export function confidenceFromEvidenceLevel(level: EvidenceLevel): ConfidenceLevel {
  return CONFIDENCE_BY_LEVEL[level];
}

/** 1…6 — the ladder rung number (L1 = 1). */
export function evidenceLevelRank(level: EvidenceLevel): number {
  return EVIDENCE_LEVELS.indexOf(level) + 1;
}

export function isEvidenceLevel(v: unknown): v is EvidenceLevel {
  return typeof v === "string" && (EVIDENCE_LEVELS as readonly string[]).includes(v);
}

export function isAssessmentStatus(v: unknown): v is AssessmentStatus {
  return typeof v === "string" && (ASSESSMENT_STATUSES as readonly string[]).includes(v);
}

export function isSviDimension(v: unknown): v is SviDimension {
  return typeof v === "string" && (SVI_DIMENSIONS as readonly string[]).includes(v);
}

/** The ladder's numeric confidence (svi-analysis EVIDENCE_CONFIDENCE × 100), kept here so the model never imports the engine. */
export const EVIDENCE_LEVEL_CONFIDENCE_PCT: Record<EvidenceLevel, number> = {
  L1_self_declared: 20,
  L2_public_url: 35,
  L3_uploaded_document: 50,
  L4_connected_source: 75,
  L5_transaction_data: 90,
  L6_third_party_verified: 100,
};

// Compile-time guard: every confidence-cap rung has an L-label.
const _allRungs: readonly ConfidenceLevel[] = CONFIDENCE_LEVELS;
void _allRungs;
