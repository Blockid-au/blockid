// G21 P1-A — Claims: derive them from an analysis, grade them from their
// evidence, spot contradictions, and keep the 0417 tables in sync.
//
//   deriveClaims(input)                 pure — analysis signals + Evidence Hub
//                                       rows + report evidence rows → Claim
//                                       drafts (stable claim_keys) and linked
//                                       EvidenceRecord drafts
//   deriveAssessmentStatus(claim, recs) pure — the one status rule
//   detectContradictions(observations)  pure — same claim_key, ≥ 2 sources,
//                                       values apart beyond tolerance
//   syncClaimsForProject(...)           DB — idempotent upsert on
//                                       (project_id, claim_key); never
//                                       deletes; supersedes older proof from
//                                       the same source; audit row per status
//                                       change and per new record
//   syncClaimsForProjectSafe(...)       the fail-soft wrapper the analysis
//                                       writers call — an analysis never
//                                       fails because of the claims sync
//
// Claim keys are a closed registry (CLAIM_REGISTRY) so two analyses of the
// same startup, an Evidence Hub upload and a Stripe pull all land on the SAME
// row — that is what makes "founder says A$12k, Stripe says A$8k" detectable.

import type { AppendAuditParams } from "@/lib/audit";
import type { EvidenceRow } from "@/lib/report-v2/schema";
import { hubCodeSignals, type SVIAnalysis, type SVIExtractedSignals } from "@/lib/svi-analysis";
import { capConfidence, textHasUrl, type ConfidenceLevel } from "./confidence-cap";
import { defaultClaimsDb, isMissingTableError, type ClaimsDb, type HubRowForSync } from "./claims-db";
import { hubRowConfidence, isUsableHubRow } from "./hub-rows";
import { evidenceRecordHash, recordsConfidence } from "./records";
import {
  evidenceLevelFromConfidence,
  evidenceLevelRank,
  isSviDimension,
  type AssessmentStatus,
  type Claim,
  type ClaimDraft,
  type ClaimValueSource,
  type ContradictionStatus,
  type EvidenceLevel,
  type EvidenceRecord,
  type EvidenceRecordDraft,
  type NormalizedValue,
  type SviDimension,
} from "./types";

// ─── registry ────────────────────────────────────────────────────────────────

type SignalKey = keyof SVIExtractedSignals;

interface ClaimDef {
  key: string;
  dim: SviDimension;
  category: string;
  signal: SignalKey;
  kind: "number" | "boolean" | "enum";
  unit?: string;
  /** enum: values that are the engine's "nothing found" default → no claim. */
  skip?: readonly string[];
  statement: (value: unknown) => string;
}

const aud = (v: unknown): string => `A$${Math.round(Number(v)).toLocaleString("en-AU")}`;

/** Every claim the engine can derive. Order = display order inside a dimension. */
export const CLAIM_REGISTRY: readonly ClaimDef[] = [
  // FTV — founder & team
  { key: "team.has_cofounder", dim: "ftv", category: "team", signal: "hasCoFounder", kind: "boolean", statement: () => "The company has a co-founder" },
  { key: "team.founder_experience", dim: "ftv", category: "team", signal: "founderExperience", kind: "enum", skip: ["first-time"], statement: (v) => `Founder experience: ${String(v)}` },
  { key: "team.founder_sector_fit", dim: "ftv", category: "team", signal: "founderSectorFit", kind: "boolean", statement: () => "The founders have domain experience in this sector" },
  { key: "team.has_advisors", dim: "ftv", category: "team", signal: "hasAdvisors", kind: "boolean", statement: () => "Named advisors support the company" },
  // MPC — market
  { key: "market.size", dim: "mpc", category: "market", signal: "marketSize", kind: "enum", skip: ["unknown"], statement: (v) => `Addressable market size: ${String(v)}` },
  { key: "market.problem_clarity", dim: "mpc", category: "market", signal: "problemClarity", kind: "enum", skip: ["vague"], statement: (v) => `Problem definition: ${String(v)}` },
  { key: "market.customer_interviews", dim: "mpc", category: "market", signal: "hasCustomerInterviews", kind: "boolean", statement: () => "Customer interviews / discovery have been run" },
  { key: "market.has_customers", dim: "mpc", category: "market", signal: "hasCustomers", kind: "boolean", statement: () => "The company has customers or signed users" },
  // PTD — product
  { key: "product.has_product", dim: "ptd", category: "product", signal: "hasProduct", kind: "boolean", statement: () => "A working product exists" },
  { key: "product.has_demo", dim: "ptd", category: "product", signal: "hasDemo", kind: "boolean", statement: () => "A product demo is available" },
  { key: "product.has_source_code", dim: "ptd", category: "product", signal: "hasSourceCode", kind: "boolean", statement: () => "The product has its own source code / repository" },
  { key: "product.has_website", dim: "ptd", category: "product", signal: "hasWebsite", kind: "boolean", statement: () => "The company has a live website" },
  { key: "product.has_app", dim: "ptd", category: "product", signal: "hasApp", kind: "boolean", statement: () => "A mobile / desktop app is available" },
  // TRE — traction & revenue
  { key: "traction.has_revenue", dim: "tre", category: "traction", signal: "hasRevenue", kind: "boolean", statement: () => "The company is generating revenue" },
  { key: "traction.mrr_aud", dim: "tre", category: "traction", signal: "mrrAud", kind: "number", unit: "AUD", statement: (v) => `Monthly recurring revenue of ${aud(v)}` },
  { key: "traction.arr_aud", dim: "tre", category: "traction", signal: "arrAud", kind: "number", unit: "AUD", statement: (v) => `Annualised revenue of ${aud(v)}` },
  { key: "traction.revenue_band", dim: "tre", category: "traction", signal: "revenueBand", kind: "enum", skip: ["pre-revenue"], statement: (v) => `Revenue stage: ${String(v)}` },
  { key: "traction.pilot_revenue_aud", dim: "tre", category: "traction", signal: "pilotRevenueAud", kind: "number", unit: "AUD", statement: (v) => `Paid pilots worth ${aud(v)} each` },
  { key: "traction.has_social_proof", dim: "tre", category: "traction", signal: "hasSocialProof", kind: "boolean", statement: () => "Customer logos, press or testimonials exist" },
  { key: "traction.has_analytics", dim: "tre", category: "traction", signal: "hasAnalytics", kind: "boolean", statement: () => "Usage / growth analytics are tracked" },
  // CGH — capital & governance
  { key: "governance.has_cap_table", dim: "cgh", category: "governance", signal: "hasCapTable", kind: "boolean", statement: () => "A cap table is maintained" },
  { key: "governance.has_vesting", dim: "cgh", category: "governance", signal: "hasVesting", kind: "boolean", statement: () => "Founder equity is on a vesting schedule" },
  { key: "governance.has_shareholders_agreement", dim: "cgh", category: "governance", signal: "hasShareholdersAgreement", kind: "boolean", statement: () => "A shareholders agreement is in place" },
  { key: "governance.has_board_cadence", dim: "cgh", category: "governance", signal: "hasBoardCadence", kind: "boolean", statement: () => "The board meets on a regular cadence" },
  { key: "governance.has_financial_audit", dim: "cgh", category: "governance", signal: "hasFinancialAudit", kind: "boolean", statement: () => "Financial statements have been audited" },
  { key: "governance.esop_allocated", dim: "cgh", category: "governance", signal: "esopAllocated", kind: "boolean", statement: () => "An ESOP pool is allocated" },
  { key: "capital.raise_ask_aud", dim: "cgh", category: "capital", signal: "raiseAskAud", kind: "number", unit: "AUD", statement: (v) => `Raising ${aud(v)}` },
  { key: "capital.stated_cap_aud", dim: "cgh", category: "capital", signal: "statedCapAud", kind: "number", unit: "AUD", statement: (v) => `Founder-stated valuation / cap of ${aud(v)}` },
  // IRI — investor readiness
  { key: "investor.has_pitch_deck", dim: "iri", category: "investor", signal: "hasPitchDeck", kind: "boolean", statement: () => "A pitch deck exists" },
  { key: "investor.has_financial_model", dim: "iri", category: "investor", signal: "hasFinancialModel", kind: "boolean", statement: () => "A financial model exists" },
  { key: "investor.has_data_room", dim: "iri", category: "investor", signal: "hasDataRoom", kind: "boolean", statement: () => "A data room is set up" },
  // LCO — legal & compliance
  { key: "legal.has_abn", dim: "lco", category: "legal", signal: "hasABN", kind: "boolean", statement: () => "The company holds an ABN" },
  { key: "legal.has_ip_protection", dim: "lco", category: "legal", signal: "hasIPProtection", kind: "boolean", statement: () => "IP is protected (assignment, trademark or patent)" },
  { key: "legal.has_contracts", dim: "lco", category: "legal", signal: "hasContracts", kind: "boolean", statement: () => "Customer / founder contracts are in place" },
  { key: "legal.has_legal_docs", dim: "lco", category: "legal", signal: "hasLegalDocs", kind: "boolean", statement: () => "Core legal documents exist" },
  // SVM — strategic vision & moat
  { key: "moat.has_moat", dim: "svm", category: "moat", signal: "hasMoat", kind: "boolean", statement: () => "A defensible moat is claimed" },
  { key: "moat.network_effect", dim: "svm", category: "moat", signal: "hasNetworkEffect", kind: "boolean", statement: () => "The product has network effects" },
  { key: "moat.data_advantage", dim: "svm", category: "moat", signal: "hasDataAdvantage", kind: "boolean", statement: () => "The company holds a proprietary data advantage" },
  { key: "moat.switching_costs", dim: "svm", category: "moat", signal: "hasSwitchingCosts", kind: "boolean", statement: () => "Customers face switching costs" },
];

const DEF_BY_KEY = new Map(CLAIM_REGISTRY.map((d) => [d.key, d]));
const DEFS_BY_SIGNAL = new Map<SignalKey, ClaimDef[]>();
for (const d of CLAIM_REGISTRY) DEFS_BY_SIGNAL.set(d.signal, [...(DEFS_BY_SIGNAL.get(d.signal) ?? []), d]);

export function claimDefinition(key: string): ClaimDef | undefined {
  return DEF_BY_KEY.get(key);
}

/** The claim keys an Evidence Hub catalogue code proves (through the engine's own code → signal map). */
export function claimKeysForHubCode(code: string): string[] {
  const keys: string[] = [];
  for (const sig of hubCodeSignals(code)) for (const d of DEFS_BY_SIGNAL.get(sig) ?? []) if (!keys.includes(d.key)) keys.push(d.key);
  return keys;
}

// ─── values ──────────────────────────────────────────────────────────────────

/** The comparable form of a raw value; null when nothing comparable. */
export function normalizeValue(v: unknown, unit?: string): NormalizedValue | null {
  if (v == null) return null;
  if (typeof v === "boolean") return { kind: "boolean", value: v };
  if (typeof v === "number") return Number.isFinite(v) ? { kind: "number", value: v, ...(unit ? { unit } : {}) } : null;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase().replace(/\s+/g, " ");
    if (!s) return null;
    const n = Number(s.replace(/^a?\$|,/g, ""));
    if (/^a?\$?[\d,]+(\.\d+)?$/.test(s) && Number.isFinite(n)) return { kind: "number", value: n, ...(unit ? { unit } : {}) };
    if (s === "true" || s === "false") return { kind: "boolean", value: s === "true" };
    return { kind: "string", value: s };
  }
  if (typeof v === "object" && "kind" in (v as object) && "value" in (v as object)) {
    const nv = v as NormalizedValue;
    return normalizeValue(nv.value, "unit" in nv ? nv.unit : unit);
  }
  return null;
}

/** Relative tolerance for numbers (15 %); strings compare after normalisation; booleans must match. */
export const CONTRADICTION_TOLERANCE = 0.15;

export function valuesConflict(a: NormalizedValue, b: NormalizedValue, tolerance = CONTRADICTION_TOLERANCE): boolean {
  if (a.kind !== b.kind) return true;
  if (a.kind === "number" && b.kind === "number") {
    const base = Math.max(Math.abs(a.value), Math.abs(b.value));
    if (base === 0) return false;
    return Math.abs(a.value - b.value) / base > tolerance;
  }
  return a.value !== b.value;
}

export interface ValueObservation {
  claim_key: string;
  source: ClaimValueSource;
  value: NormalizedValue | null;
}

/**
 * Pure: claim keys whose values from DIFFERENT sources disagree beyond the
 * tolerance. Two observations from the same source never conflict (an
 * analysis re-run is not a second opinion).
 */
export function detectContradictions(observations: readonly ValueObservation[], tolerance = CONTRADICTION_TOLERANCE): Set<string> {
  const byKey = new Map<string, ValueObservation[]>();
  for (const o of observations) {
    if (!o.value) continue;
    byKey.set(o.claim_key, [...(byKey.get(o.claim_key) ?? []), o]);
  }
  const out = new Set<string>();
  for (const [key, obs] of byKey) {
    for (let i = 0; i < obs.length && !out.has(key); i++) {
      for (let j = i + 1; j < obs.length; j++) {
        if (obs[i].source !== obs[j].source && valuesConflict(obs[i].value!, obs[j].value!, tolerance)) {
          out.add(key);
          break;
        }
      }
    }
  }
  return out;
}

/** Observations a stored claim contributes: the founder's own value and the analysis extraction. */
export function claimObservations(claim: Pick<Claim, "claim_key" | "founder_claimed_value" | "extracted_value">): ValueObservation[] {
  if (!claim.claim_key) return [];
  const def = DEF_BY_KEY.get(claim.claim_key);
  const out: ValueObservation[] = [];
  const f = normalizeValue(claim.founder_claimed_value, def?.unit);
  if (f) out.push({ claim_key: claim.claim_key, source: "founder", value: f });
  const e = normalizeValue(claim.extracted_value, def?.unit);
  if (e) out.push({ claim_key: claim.claim_key, source: "analysis", value: e });
  return out;
}

const CONNECTOR_SOURCES = new Set(["stripe", "xero", "ga4", "github", "linkedin", "connector_other", "connector"]);

/** Which contradiction source an evidence record speaks for. */
export function recordValueSource(sourceType: string | null | undefined): ClaimValueSource {
  const s = (sourceType ?? "").toLowerCase();
  if (s === "founder_text" || s === "founder") return "founder";
  if (s === "evidence_hub" || s === "upload" || s === "url") return "hub";
  if (s === "reviewer" || s === "admin") return "reviewer";
  if (s === "external") return "external";
  if (CONNECTOR_SOURCES.has(s)) return "connector";
  return "analysis";
}

// ─── status ──────────────────────────────────────────────────────────────────

/**
 * Pure — the one status rule (§P1-A):
 *   contradiction → conflicting · no active record → claimed · only L1 →
 *   unverified · any L2–L5 → evidence_backed · any L6 or a verified_by → verified.
 */
export function deriveAssessmentStatus(
  claim: Pick<Claim, "contradiction_status">,
  records: ReadonlyArray<Pick<EvidenceRecord, "evidence_type" | "verified_by" | "status">>,
): AssessmentStatus {
  if (claim.contradiction_status === "conflicting") return "conflicting";
  const active = records.filter((r) => r.status === "active");
  if (active.length === 0) return "claimed";
  if (active.some((r) => r.evidence_type === "L6_third_party_verified" || Boolean(r.verified_by))) return "verified";
  if (active.some((r) => evidenceLevelRank(r.evidence_type) >= 2)) return "evidence_backed";
  return "unverified";
}

// ─── derive ──────────────────────────────────────────────────────────────────

/** Default lifetime of a proof before the expiry cron retires it. */
export const DEFAULT_TTL_DAYS: Record<"founder_text" | "evidence_hub" | "connector" | "reviewer", number> = {
  founder_text: 365,
  evidence_hub: 365,
  connector: 90,
  reviewer: 365,
};

export interface DeriveClaimsInput {
  projectId: string;
  /** The analysis (svi_analyses.analysis_json) — `signals` is what the registry reads. */
  analysis: Pick<SVIAnalysis, "signals"> & Partial<Pick<SVIAnalysis, "version">>;
  /** The founder's text the analysis ran on (URL detection for the founder_text rung). */
  rawText?: string | null;
  /** svi_dimension_evidence rows (project-scoped Evidence Hub). */
  hubRows?: readonly HubRowForSync[];
  /** ReportV2 evidence rows minted by GATHER (connectors, open registers). */
  evidenceRows?: readonly EvidenceRow[];
  sourceReportId?: string | null;
  submittedBy?: string | null;
  now?: Date;
}

export interface DerivedClaims {
  claims: ClaimDraft[];
  records: EvidenceRecordDraft[];
}

const addDays = (d: Date, days: number): string => new Date(d.getTime() + days * 86_400_000).toISOString();

function levelFromRung(rung: ConfidenceLevel): EvidenceLevel {
  return evidenceLevelFromConfidence(rung);
}

/** Pure: analysis + hub + report rows → claim drafts and linked evidence-record drafts. */
export function deriveClaims(input: DeriveClaimsInput): DerivedClaims {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const signals = input.analysis.signals;
  const claims = new Map<string, ClaimDraft>();
  const records: EvidenceRecordDraft[] = [];
  const version = input.analysis.version ? ` v${input.analysis.version}` : "";

  // 1. founder-text claims from the registry; each backed by ONE founder_text record
  const founderRung = capConfidence({ requested: signals?.evidenceLevel, origin: "founder_text", hasUrl: textHasUrl(input.rawText) }).level;
  const founderLevel = levelFromRung(founderRung);
  for (const def of CLAIM_REGISTRY) {
    const raw = signals ? (signals as unknown as Record<string, unknown>)[def.signal] : undefined;
    if (raw == null) continue;
    if (def.kind === "boolean" && raw !== true) continue;
    if (def.kind === "number" && (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0)) continue;
    if (def.kind === "enum" && (typeof raw !== "string" || def.skip?.includes(raw))) continue;
    const normalized = normalizeValue(raw, def.unit);
    claims.set(def.key, {
      project_id: input.projectId,
      svi_dimension: def.dim,
      category: def.category,
      claim_key: def.key,
      statement: def.statement(raw),
      extracted_value: raw,
      normalized_value: normalized,
      source_report_id: input.sourceReportId ?? null,
      source: "analysis",
    });
    records.push({
      project_id: input.projectId,
      claim_key: def.key,
      svi_dimension: def.dim,
      evidence_type: founderLevel,
      source_type: "founder_text",
      source_uri: null,
      source_name: `Founder statement (analysis${version})`,
      submitted_by: input.submittedBy ?? null,
      observed_at: nowIso,
      confidence: null,
      verification_level: null,
      verified_by: null,
      verified_at: null,
      expires_at: addDays(now, DEFAULT_TTL_DAYS.founder_text),
      visibility: "evaluators",
      consent_scope: {},
      observed_value: normalized,
    });
  }

  // 2. Evidence Hub rows → records (one per claim the catalogue code proves; dimension-only when it proves none)
  for (const row of input.hubRows ?? []) {
    const verifier = row.verified_by_user_id ?? null;
    if (!isUsableHubRow(row)) continue;
    const dim = row.dimension.toLowerCase();
    if (!isSviDimension(dim)) continue;
    const rung = hubRowConfidence(row);
    const signed = row.is_verified === true || Boolean(row.verified_at);
    const value = typeof row.evidence_value_or_url === "string" ? row.evidence_value_or_url.trim() : "";
    const uri = /^https?:\/\//i.test(value) ? value.slice(0, 2048) : null;
    const label = (row.evidence_label ?? "").trim() || row.evidence_type;
    const observed = row.verified_at ?? row.updated_at ?? row.created_at ?? nowIso;
    const keys = claimKeysForHubCode(row.evidence_type);
    const targets: Array<string | null> = keys.length ? keys : [null];
    for (const key of targets) {
      if (key && !claims.has(key)) {
        // proof without a stated claim → the upload IS the claim
        const def = DEF_BY_KEY.get(key)!;
        claims.set(key, {
          project_id: input.projectId,
          svi_dimension: def.dim,
          category: def.category,
          claim_key: key,
          statement: def.statement(true),
          extracted_value: true,
          normalized_value: { kind: "boolean", value: true },
          source_report_id: input.sourceReportId ?? null,
          source: "hub",
        });
      }
      records.push({
        project_id: input.projectId,
        claim_key: key,
        svi_dimension: dim,
        evidence_type: levelFromRung(rung),
        source_type: "evidence_hub",
        source_uri: uri,
        source_name: `${label} (${row.evidence_type})`.slice(0, 300),
        submitted_by: input.submittedBy ?? null,
        observed_at: observed,
        confidence: null,
        verification_level: signed ? "reviewer" : null,
        verified_by: signed ? verifier : null,
        verified_at: signed ? (row.verified_at ?? observed) : null,
        expires_at: addDays(new Date(Date.parse(observed) || now.getTime()), signed ? DEFAULT_TTL_DAYS.reviewer : DEFAULT_TTL_DAYS.evidence_hub),
        visibility: "evaluators",
        consent_scope: {},
      });
    }
  }

  // 3. ReportV2 evidence rows from connectors / open registers → records
  for (const row of input.evidenceRows ?? []) {
    if (row.status === "missing") continue;
    const src = row.source;
    if (src === "self_declared" || src === "upload" || src === "url" || src === "founder_profile") continue; // the hub / founder text already cover these
    const dim = row.dims?.[0];
    if (!dim || !isSviDimension(dim)) continue;
    const isExternal = src === "external";
    const rung = capConfidence({ requested: row.confidence ?? (isExternal ? "public_url" : "connected_source"), origin: isExternal ? "founder_text" : "connector", hasUrl: true }).level;
    const key = (src === "stripe" || src === "xero") && dim === "tre" ? "traction.has_revenue" : null;
    const keyDef = key ? DEF_BY_KEY.get(key) : undefined;
    if (key && keyDef && !claims.has(key)) {
      const def = keyDef;
      claims.set(key, {
        project_id: input.projectId,
        svi_dimension: def.dim,
        category: def.category,
        claim_key: key,
        statement: def.statement(true),
        extracted_value: true,
        normalized_value: { kind: "boolean", value: true },
        source_report_id: input.sourceReportId ?? null,
        source: "connector",
      });
    }
    const observed = row.observedAt ?? nowIso;
    records.push({
      project_id: input.projectId,
      claim_key: key,
      svi_dimension: dim,
      evidence_type: levelFromRung(rung),
      source_type: src,
      source_uri: null,
      source_name: `${row.label} (${row.evidence_id})`.slice(0, 300),
      submitted_by: null,
      observed_at: observed,
      confidence: null,
      verification_level: null,
      verified_by: null,
      verified_at: null,
      expires_at: addDays(new Date(Date.parse(observed) || now.getTime()), DEFAULT_TTL_DAYS.connector),
      visibility: "evaluators",
      consent_scope: {},
      // a boolean claim is proved by the row's existence; a valued claim by the row's value
      observed_value: keyDef?.kind === "boolean" ? { kind: "boolean", value: true } : row.value ? normalizeValue(row.value, keyDef?.unit) : null,
    });
  }

  return { claims: [...claims.values()], records };
}

// ─── sync ────────────────────────────────────────────────────────────────────

export type AuditFn = (params: AppendAuditParams) => Promise<unknown>;

export interface SyncClaimsOptions {
  db?: ClaimsDb | null;
  audit?: AuditFn | null;
  rawText?: string | null;
  hubRows?: readonly HubRowForSync[];
  evidenceRows?: readonly EvidenceRow[];
  sourceReportId?: string | null;
  /** The user who triggered the analysis — `claims.created_by` / `evidence_records.submitted_by`. */
  actorUserId?: string | null;
  now?: Date;
}

export interface SyncClaimsSummary {
  project_id: string;
  claims_created: number;
  claims_updated: number;
  records_created: number;
  records_superseded: number;
  records_skipped: number;
  status_changes: number;
  conflicting: number;
  claims_total: number;
}

async function auditSafe(audit: AuditFn | null | undefined, params: AppendAuditParams): Promise<void> {
  if (!audit) return;
  try {
    await audit(params);
  } catch (err) {
    console.warn("[blockid:claims] audit row failed", params.action, err instanceof Error ? err.message : err);
  }
}

async function defaultAudit(params: AppendAuditParams): Promise<unknown> {
  const { appendAudit } = await import("@/lib/audit");
  return appendAudit(params);
}

const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * The identity of a proof's SOURCE (not its value): founder text is one
 * source whatever the analysis version; a hub upload is its catalogue code;
 * a connector / register row is its report evidence id (the `(…)` suffix
 * deriveClaims puts on source_name). A newer proof from the same source
 * supersedes the older one; proof from another source is additional.
 */
export function supersedeKey(rec: Pick<EvidenceRecordDraft, "source_type" | "source_name">): string {
  if (rec.source_type === "founder_text") return "founder_text";
  const m = /\(([^()]+)\)\s*$/.exec(rec.source_name ?? "");
  return m ? m[1] : (rec.source_name ?? "");
}

/**
 * Re-grade a set of claims from their records (status + confidence +
 * contradiction), persisting and auditing every change. Shared by the sync
 * and the expiry cron. Returns the number of status changes.
 */
export async function regradeClaims(args: {
  claims: readonly Claim[];
  records: readonly EvidenceRecord[];
  db: ClaimsDb;
  audit?: AuditFn | null;
  actor: string;
  actorUserId?: string | null;
  reason: string;
}): Promise<{ status_changes: number; conflicting: number }> {
  const recordsByClaim = new Map<string, EvidenceRecord[]>();
  for (const r of args.records) if (r.claim_id) recordsByClaim.set(r.claim_id, [...(recordsByClaim.get(r.claim_id) ?? []), r]);

  const observations: ValueObservation[] = [];
  const claimById = new Map(args.claims.map((c) => [c.id, c]));
  for (const c of args.claims) observations.push(...claimObservations(c));
  for (const r of args.records) {
    if (!r.claim_id || r.status !== "active") continue;
    const c = claimById.get(r.claim_id);
    const nv = r.observed_value;
    if (c?.claim_key && nv) observations.push({ claim_key: c.claim_key, source: recordValueSource(r.source_type), value: nv });
  }
  const conflicts = detectContradictions(observations);

  let status_changes = 0;
  let conflicting = 0;
  for (const c of args.claims) {
    const recs = recordsByClaim.get(c.id) ?? [];
    let contradiction: ContradictionStatus = c.contradiction_status;
    if (c.claim_key && conflicts.has(c.claim_key)) contradiction = "conflicting";
    else if (c.contradiction_status === "conflicting") contradiction = "resolved";
    if (contradiction === "conflicting") conflicting += 1;
    const status = deriveAssessmentStatus({ contradiction_status: contradiction }, recs);
    const confidence = recordsConfidence(recs);
    if (status === c.assessment_status && contradiction === c.contradiction_status && confidence === c.confidence) continue;
    await args.db.updateClaim(c.id, { assessment_status: status, contradiction_status: contradiction, confidence });
    if (status !== c.assessment_status) {
      status_changes += 1;
      await auditSafe(args.audit, {
        user_id: args.actorUserId ?? null,
        actor: args.actor,
        action: "claim.status_changed",
        resource_type: "claim",
        resource_id: c.id,
        detail: { project_id: c.project_id, claim_key: c.claim_key, from: c.assessment_status, to: status, contradiction, reason: args.reason },
      });
    }
  }
  return { status_changes, conflicting };
}

/**
 * DB: idempotent upsert of the derived claims + records for a project.
 * Never deletes; a proof already recorded (same hash) is skipped; a newer
 * proof from the same source for the same claim supersedes the older row.
 */
export async function syncClaimsForProject(projectId: string, analysis: DeriveClaimsInput["analysis"], opts: SyncClaimsOptions = {}): Promise<SyncClaimsSummary> {
  const db = opts.db === undefined ? await defaultClaimsDb() : opts.db;
  if (!db) throw new Error("claims sync: database unavailable");
  const audit = opts.audit === undefined ? defaultAudit : opts.audit;
  const now = opts.now ?? new Date();
  const hubRows = opts.hubRows ?? (await db.loadHubRows(projectId));
  const derived = deriveClaims({
    projectId,
    analysis,
    rawText: opts.rawText,
    hubRows,
    evidenceRows: opts.evidenceRows,
    sourceReportId: opts.sourceReportId,
    submittedBy: opts.actorUserId ?? null,
    now,
  });

  const summary: SyncClaimsSummary = { project_id: projectId, claims_created: 0, claims_updated: 0, records_created: 0, records_superseded: 0, records_skipped: 0, status_changes: 0, conflicting: 0, claims_total: 0 };

  // claims — upsert on (project_id, claim_key); founder_claimed_value is never touched here
  const existing = await db.listClaims(projectId);
  const byKey = new Map(existing.filter((c) => c.claim_key).map((c) => [c.claim_key!, c]));
  for (const draft of derived.claims) {
    const cur = byKey.get(draft.claim_key);
    if (!cur) {
      try {
        const created = await db.insertClaim({
          project_id: projectId,
          svi_dimension: draft.svi_dimension,
          category: draft.category,
          claim_key: draft.claim_key,
          statement: draft.statement,
          founder_claimed_value: null,
          extracted_value: draft.extracted_value,
          normalized_value: draft.normalized_value,
          confidence: null,
          contradiction_status: "none",
          assessment_status: "claimed",
          source_report_id: draft.source_report_id,
          created_by: opts.actorUserId ?? null,
        });
        byKey.set(draft.claim_key, created);
        summary.claims_created += 1;
      } catch (err) {
        // 23505 — a concurrent sync inserted the same key: read it back and continue
        const code = (err as { code?: string })?.code;
        if (code !== "23505" && !/duplicate key/i.test(err instanceof Error ? err.message : "")) throw err;
        const again = (await db.listClaims(projectId)).find((c) => c.claim_key === draft.claim_key);
        if (again) byKey.set(draft.claim_key, again);
      }
      continue;
    }
    if (cur.statement !== draft.statement || !sameJson(cur.extracted_value, draft.extracted_value) || !sameJson(cur.normalized_value, draft.normalized_value) || (draft.source_report_id && cur.source_report_id !== draft.source_report_id)) {
      const updated = await db.updateClaim(cur.id, {
        statement: draft.statement,
        extracted_value: draft.extracted_value,
        normalized_value: draft.normalized_value,
        source_report_id: draft.source_report_id ?? cur.source_report_id,
      });
      if (updated) byKey.set(draft.claim_key, updated);
      summary.claims_updated += 1;
    }
  }

  // records — skip known hashes, supersede older same-source proof
  const records = await db.listRecords(projectId);
  const knownHashes = new Set(records.filter((r) => r.hash && r.status !== "withdrawn").map((r) => r.hash!));
  const supersededIds = new Set<string>();
  for (const draft of derived.records) {
    const hash = evidenceRecordHash(draft);
    if (knownHashes.has(hash)) {
      summary.records_skipped += 1;
      continue;
    }
    const claim = draft.claim_key ? byKey.get(draft.claim_key) : undefined;
    const claimId = claim?.id ?? null;
    const inserted = await db.insertRecord({
      project_id: projectId,
      claim_id: claimId,
      svi_dimension: draft.svi_dimension,
      evidence_type: draft.evidence_type,
      source_type: draft.source_type,
      source_uri: draft.source_uri,
      source_name: draft.source_name,
      submitted_by: draft.submitted_by,
      submitted_at: now.toISOString(),
      observed_at: draft.observed_at,
      confidence: draft.confidence,
      verification_level: draft.verification_level,
      verified_by: draft.verified_by,
      verified_at: draft.verified_at,
      expires_at: draft.expires_at,
      hash,
      observed_value: draft.observed_value ?? null,
      visibility: draft.visibility,
      consent_scope: draft.consent_scope,
      status: "active",
    });
    knownHashes.add(hash);
    summary.records_created += 1;
    records.push(inserted);
    await auditSafe(audit, {
      user_id: opts.actorUserId ?? null,
      actor: "system",
      action: "evidence.recorded",
      resource_type: "evidence_record",
      resource_id: inserted.id,
      detail: { project_id: projectId, claim_id: claimId, claim_key: draft.claim_key, evidence_type: draft.evidence_type, source_type: draft.source_type, hash },
    });
    // older active proof from the SAME source for the same claim / dimension → superseded
    // (a second hub upload or a different connector on the same claim is additional proof, not a replacement)
    const key = supersedeKey(draft);
    for (const old of records) {
      if (old.id === inserted.id || old.status !== "active" || supersededIds.has(old.id)) continue;
      if (old.source_type !== draft.source_type || supersedeKey(old) !== key) continue;
      const sameTarget = claimId ? old.claim_id === claimId : old.claim_id === null && old.svi_dimension === draft.svi_dimension;
      if (!sameTarget) continue;
      await db.updateRecord(old.id, { status: "superseded" });
      old.status = "superseded";
      supersededIds.add(old.id);
      summary.records_superseded += 1;
    }
  }

  // grade
  const claimsNow = await db.listClaims(projectId);
  const graded = await regradeClaims({ claims: claimsNow, records, db, audit, actor: "system", actorUserId: opts.actorUserId ?? null, reason: "analysis_sync" });
  summary.status_changes = graded.status_changes;
  summary.conflicting = graded.conflicting;
  summary.claims_total = claimsNow.length;
  return summary;
}

/**
 * The hook the analysis writers call: never throws, never blocks an analysis.
 * Returns the summary, or null when the sync was skipped / failed (logged).
 */
export async function syncClaimsForProjectSafe(projectId: string | null | undefined, analysis: DeriveClaimsInput["analysis"] | null | undefined, opts: SyncClaimsOptions = {}): Promise<SyncClaimsSummary | null> {
  if (!projectId || !analysis?.signals) return null;
  try {
    return await syncClaimsForProject(projectId, analysis, opts);
  } catch (err) {
    if (isMissingTableError(err)) {
      console.warn("[blockid:claims] sync skipped — migration 0417 not applied");
    } else {
      console.warn("[blockid:claims] sync failed (analysis unaffected)", err instanceof Error ? err.message : err);
    }
    return null;
  }
}
