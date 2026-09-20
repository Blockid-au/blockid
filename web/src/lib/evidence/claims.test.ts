// G21 P1-A — claims.ts: value normalisation + tolerance, contradiction
// detection across sources, the one status rule, deriveClaims from signals /
// hub rows / connector rows, and syncClaimsForProject against the memory db
// (idempotent, never deletes, supersedes same-source proof, audits every
// status change and every new record, founder value vs extraction →
// conflicting, fail-soft wrapper).

import { describe, expect, it, vi } from "vitest";
import type { SVIExtractedSignals } from "@/lib/svi-analysis";
import type { EvidenceRow } from "@/lib/report-v2/schema";
import {
  CLAIM_REGISTRY,
  claimKeysForHubCode,
  claimObservations,
  deriveAssessmentStatus,
  deriveClaims,
  detectContradictions,
  normalizeValue,
  recordValueSource,
  syncClaimsForProject,
  syncClaimsForProjectSafe,
  valuesConflict,
  type AuditFn,
} from "./claims";
import { memoryClaimsDb, type HubRowForSync } from "./claims-db";
import type { Claim, EvidenceRecord } from "./types";

const NOW = new Date("2026-09-20T02:00:00.000Z");
const PROJECT = "11111111-1111-4111-8111-111111111111";

export function signals(over: Partial<SVIExtractedSignals> = {}): SVIExtractedSignals {
  return {
    hasCoFounder: false,
    founderExperience: "first-time",
    founderSectorFit: false,
    hasAdvisors: false,
    marketSize: "unknown",
    problemClarity: "vague",
    hasCustomerInterviews: false,
    isAIWrapper: false,
    hasMoat: false,
    hasNetworkEffect: false,
    hasDataAdvantage: false,
    hasSwitchingCosts: false,
    hasProduct: false,
    hasDemo: false,
    hasSourceCode: false,
    hasWebsite: false,
    hasApp: false,
    hasRevenue: false,
    revenueBand: "pre-revenue",
    hasCustomers: false,
    hasSocialProof: false,
    hasAnalytics: false,
    hasCapTable: false,
    hasVesting: false,
    hasShareholdersAgreement: false,
    hasBoardCadence: false,
    hasFinancialAudit: false,
    esopAllocated: false,
    hasPitchDeck: false,
    hasFinancialModel: false,
    hasDataRoom: false,
    targetRaiseMentioned: false,
    raiseMentioned: false,
    hasABN: false,
    hasIPProtection: false,
    hasContracts: false,
    hasLegalDocs: false,
    evidenceLevel: "self_declared",
    ...over,
  };
}

function record(over: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return {
    id: "r",
    project_id: PROJECT,
    claim_id: "c",
    svi_dimension: "tre",
    evidence_type: "L1_self_declared",
    source_type: "founder_text",
    source_uri: null,
    source_name: null,
    submitted_by: null,
    submitted_at: NOW.toISOString(),
    observed_at: null,
    confidence: null,
    verification_level: null,
    verified_by: null,
    verified_at: null,
    expires_at: null,
    hash: null,
    observed_value: null,
    visibility: "evaluators",
    consent_scope: {},
    status: "active",
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    ...over,
  };
}

describe("normalizeValue / valuesConflict", () => {
  it("numbers, numeric strings, booleans and strings normalise; nothing → null", () => {
    expect(normalizeValue(12000, "AUD")).toEqual({ kind: "number", value: 12000, unit: "AUD" });
    expect(normalizeValue("A$12,000")).toEqual({ kind: "number", value: 12000 });
    expect(normalizeValue("  Serial ")).toEqual({ kind: "string", value: "serial" });
    expect(normalizeValue("true")).toEqual({ kind: "boolean", value: true });
    expect(normalizeValue(true)).toEqual({ kind: "boolean", value: true });
    expect(normalizeValue({ kind: "number", value: 5 })).toEqual({ kind: "number", value: 5 });
    expect(normalizeValue(null)).toBeNull();
    expect(normalizeValue("")).toBeNull();
    expect(normalizeValue(Number.NaN)).toBeNull();
  });

  it("numbers conflict beyond 15 % relative, strings when unequal after normalisation, kinds when mixed", () => {
    expect(valuesConflict({ kind: "number", value: 100 }, { kind: "number", value: 110 })).toBe(false);
    expect(valuesConflict({ kind: "number", value: 100 }, { kind: "number", value: 115 })).toBe(false);
    expect(valuesConflict({ kind: "number", value: 100 }, { kind: "number", value: 120 })).toBe(true);
    expect(valuesConflict({ kind: "number", value: 0 }, { kind: "number", value: 0 })).toBe(false);
    expect(valuesConflict({ kind: "string", value: "serial" }, { kind: "string", value: "serial" })).toBe(false);
    expect(valuesConflict({ kind: "string", value: "serial" }, { kind: "string", value: "experienced" })).toBe(true);
    expect(valuesConflict({ kind: "boolean", value: true }, { kind: "number", value: 1 })).toBe(true);
  });
});

describe("detectContradictions", () => {
  it("flags a key only when values from DIFFERENT sources disagree", () => {
    const out = detectContradictions([
      { claim_key: "traction.mrr_aud", source: "founder", value: { kind: "number", value: 12000 } },
      { claim_key: "traction.mrr_aud", source: "connector", value: { kind: "number", value: 8000 } },
      { claim_key: "traction.arr_aud", source: "analysis", value: { kind: "number", value: 100 } },
      { claim_key: "traction.arr_aud", source: "analysis", value: { kind: "number", value: 500 } }, // same source — a re-run, not a second opinion
      { claim_key: "team.has_cofounder", source: "founder", value: { kind: "boolean", value: true } },
      { claim_key: "team.has_cofounder", source: "hub", value: { kind: "boolean", value: true } },
      { claim_key: "market.size", source: "founder", value: null },
    ]);
    expect([...out]).toEqual(["traction.mrr_aud"]);
  });

  it("claimObservations reads the founder's value and the extraction; recordValueSource maps source_type", () => {
    expect(claimObservations({ claim_key: "traction.mrr_aud", founder_claimed_value: "A$9,000", extracted_value: 12000 })).toEqual([
      { claim_key: "traction.mrr_aud", source: "founder", value: { kind: "number", value: 9000, unit: "AUD" } },
      { claim_key: "traction.mrr_aud", source: "analysis", value: { kind: "number", value: 12000, unit: "AUD" } },
    ]);
    expect(claimObservations({ claim_key: null, founder_claimed_value: 1, extracted_value: 2 })).toEqual([]);
    expect(recordValueSource("stripe")).toBe("connector");
    expect(recordValueSource("evidence_hub")).toBe("hub");
    expect(recordValueSource("founder_text")).toBe("founder");
    expect(recordValueSource("reviewer")).toBe("reviewer");
    expect(recordValueSource("external")).toBe("external");
    expect(recordValueSource(null)).toBe("analysis");
  });
});

describe("deriveAssessmentStatus", () => {
  const none = { contradiction_status: "none" as const };
  it("no active record → claimed; only L1 → unverified; L2–L5 → evidence_backed; L6 or verified_by → verified; contradiction wins", () => {
    expect(deriveAssessmentStatus(none, [])).toBe("claimed");
    expect(deriveAssessmentStatus(none, [record({ status: "expired", evidence_type: "L5_transaction_data" })])).toBe("claimed");
    expect(deriveAssessmentStatus(none, [record()])).toBe("unverified");
    expect(deriveAssessmentStatus(none, [record(), record({ evidence_type: "L2_public_url" })])).toBe("evidence_backed");
    expect(deriveAssessmentStatus(none, [record({ evidence_type: "L5_transaction_data" })])).toBe("evidence_backed");
    expect(deriveAssessmentStatus(none, [record({ evidence_type: "L6_third_party_verified" })])).toBe("verified");
    expect(deriveAssessmentStatus(none, [record({ evidence_type: "L3_uploaded_document", verified_by: "reviewer-1" })])).toBe("verified");
    expect(deriveAssessmentStatus({ contradiction_status: "conflicting" }, [record({ evidence_type: "L6_third_party_verified" })])).toBe("conflicting");
    expect(deriveAssessmentStatus({ contradiction_status: "resolved" }, [record({ evidence_type: "L6_third_party_verified" })])).toBe("verified");
  });
});

describe("deriveClaims", () => {
  it("registry keys are unique, dotted and mapped to a dimension", () => {
    const keys = CLAIM_REGISTRY.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k).toMatch(/^[a-z0-9_]+(\.[a-z0-9_]+)+$/);
    expect(claimKeysForHubCode("cap_table_spreadsheet")).toEqual(["governance.has_cap_table"]);
    expect(claimKeysForHubCode("github_repo")).toEqual(["product.has_source_code", "product.has_product"]);
    expect(claimKeysForHubCode("nope")).toEqual([]);
  });

  it("emits a claim per firing signal (booleans true, numbers > 0, enums past their default) with ONE founder_text record each, capped by origin", () => {
    const out = deriveClaims({
      projectId: PROJECT,
      analysis: { signals: signals({ hasCoFounder: true, mrrAud: 12000, founderExperience: "serial", marketSize: "unknown", evidenceLevel: "transaction_data" }), version: "2.6" },
      rawText: "We have a co-founder, https://acme.example",
      sourceReportId: "svi-abc",
      now: NOW,
    });
    const keys = out.claims.map((c) => c.claim_key).sort();
    expect(keys).toEqual(["team.founder_experience", "team.has_cofounder", "traction.mrr_aud"]);
    const mrr = out.claims.find((c) => c.claim_key === "traction.mrr_aud")!;
    expect(mrr).toMatchObject({ svi_dimension: "tre", category: "traction", statement: "Monthly recurring revenue of A$12,000", extracted_value: 12000, normalized_value: { kind: "number", value: 12000, unit: "AUD" }, source: "analysis", source_report_id: "svi-abc" });
    expect(out.records).toHaveLength(3);
    // the text carried a URL but the analysis-wide rung (transaction_data) is capped at public_url for founder text
    for (const r of out.records) {
      expect(r).toMatchObject({ evidence_type: "L2_public_url", source_type: "founder_text", visibility: "evaluators", observed_at: NOW.toISOString() });
      expect(r.expires_at).toBe("2027-09-20T02:00:00.000Z");
    }
    expect(out.records.find((r) => r.claim_key === "traction.mrr_aud")!.observed_value).toEqual({ kind: "number", value: 12000, unit: "AUD" });
  });

  it("no URL in the text → L1; an empty signal set → no claims", () => {
    const out = deriveClaims({ projectId: PROJECT, analysis: { signals: signals({ hasABN: true }) }, rawText: "abn 12 345", now: NOW });
    expect(out.records[0].evidence_type).toBe("L1_self_declared");
    expect(deriveClaims({ projectId: PROJECT, analysis: { signals: signals() }, now: NOW })).toEqual({ claims: [], records: [] });
  });

  it("hub rows become records linked through the catalogue code; an upload without a stated claim creates the claim; a reviewer-signed row is L6 with verified_by", () => {
    const hub: HubRowForSync[] = [
      { id: "h1", dimension: "cgh", evidence_type: "cap_table_spreadsheet", evidence_label: "Cap table", evidence_value_or_url: "https://drive.example/cap.xlsx", confidence_level: "third_party_verified", is_verified: false, review_status: "pending", created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-02T00:00:00.000Z" },
      { id: "h2", dimension: "lco", evidence_type: "abn_registration", evidence_label: "ABN", evidence_value_or_url: "12 345 678 901", confidence_level: "third_party_verified", is_verified: true, verified_at: "2026-09-10T00:00:00.000Z", verified_by_user_id: "rev-1", review_status: "approved", created_at: "2026-09-01T00:00:00.000Z" },
      { id: "h3", dimension: "svm", evidence_type: "vision_statement", evidence_label: "Vision", evidence_value_or_url: null, confidence_level: "document_uploaded", is_verified: false, review_status: "none", created_at: "2026-09-01T00:00:00.000Z" },
      { id: "h4", dimension: "tre", evidence_type: "revenue_proof", evidence_label: "Rejected", evidence_value_or_url: null, confidence_level: "document_uploaded", is_verified: false, review_status: "rejected", created_at: "2026-09-01T00:00:00.000Z" },
    ];
    const out = deriveClaims({ projectId: PROJECT, analysis: { signals: signals({ hasABN: true }) }, hubRows: hub, now: NOW });
    expect(out.claims.map((c) => c.claim_key).sort()).toEqual(["governance.has_cap_table", "legal.has_abn"]);
    expect(out.claims.find((c) => c.claim_key === "governance.has_cap_table")).toMatchObject({ source: "hub", extracted_value: true, statement: "A cap table is maintained" });
    const cap = out.records.find((r) => r.source_type === "evidence_hub" && r.claim_key === "governance.has_cap_table")!;
    // a founder upload claiming third_party_verified is capped at document_uploaded (L3)
    expect(cap).toMatchObject({ evidence_type: "L3_uploaded_document", source_uri: "https://drive.example/cap.xlsx", source_name: "Cap table (cap_table_spreadsheet)", observed_at: "2026-09-02T00:00:00.000Z", verified_by: null });
    const abn = out.records.find((r) => r.source_type === "evidence_hub" && r.claim_key === "legal.has_abn")!;
    expect(abn).toMatchObject({ evidence_type: "L6_third_party_verified", verified_by: "rev-1", verified_at: "2026-09-10T00:00:00.000Z", verification_level: "reviewer", source_uri: null });
    const vision = out.records.find((r) => r.source_name?.startsWith("Vision"))!;
    expect(vision).toMatchObject({ claim_key: null, svi_dimension: "svm", evidence_type: "L3_uploaded_document" });
    expect(out.records.some((r) => r.source_name?.startsWith("Rejected"))).toBe(false);
  });

  it("connector / register rows from the report become records (stripe & xero back traction.has_revenue); upload/url/self rows are skipped", () => {
    const rows: EvidenceRow[] = [
      { evidence_id: "ev-stripe", source: "stripe", label: "Stripe MRR", status: "evidenced", observedAt: "2026-09-15T00:00:00.000Z", value: "A$8,000", dims: ["tre"], confidence: "transaction_data" },
      { evidence_id: "ev-abr", source: "external", label: "ABR entry", status: "evidenced", dims: ["lco"], confidence: "public_url" },
      { evidence_id: "ev-up", source: "upload", label: "deck", status: "evidenced", dims: ["iri"] },
      { evidence_id: "ev-miss", source: "ga4", label: "GA4", status: "missing", dims: ["tre"] },
    ];
    const out = deriveClaims({ projectId: PROJECT, analysis: { signals: signals() }, evidenceRows: rows, now: NOW });
    expect(out.claims.map((c) => c.claim_key)).toEqual(["traction.has_revenue"]);
    expect(out.claims[0].source).toBe("connector");
    expect(out.records).toHaveLength(2);
    expect(out.records[0]).toMatchObject({ claim_key: "traction.has_revenue", evidence_type: "L5_transaction_data", source_type: "stripe", observed_value: { kind: "boolean", value: true }, expires_at: "2026-12-14T00:00:00.000Z" });
    expect(out.records[1].observed_value).toBeNull();
    expect(out.records[1]).toMatchObject({ claim_key: null, svi_dimension: "lco", evidence_type: "L2_public_url", source_type: "external" });
  });
});

describe("syncClaimsForProject (memory db)", () => {
  function setup() {
    const db = memoryClaimsDb({ now: () => NOW });
    const audits: Array<{ action: string; detail?: Record<string, unknown> }> = [];
    const audit: AuditFn = async (p) => {
      audits.push({ action: p.action, detail: p.detail });
      return { id: 1n, curr_hash: "x" };
    };
    return { db, audits, audit };
  }

  it("creates claims + records, grades them, audits; a re-run is a no-op", async () => {
    const { db, audits, audit } = setup();
    const analysis = { signals: signals({ hasCoFounder: true, mrrAud: 12000 }) };
    const first = await syncClaimsForProject(PROJECT, analysis, { db, audit, rawText: "x", sourceReportId: "svi-1", actorUserId: "u-1", now: NOW });
    expect(first).toMatchObject({ claims_created: 2, claims_updated: 0, records_created: 2, records_superseded: 0, records_skipped: 0, status_changes: 2, conflicting: 0, claims_total: 2 });
    const claims = await db.listClaims(PROJECT);
    for (const c of claims) expect(c).toMatchObject({ assessment_status: "unverified", confidence: 20, created_by: "u-1", founder_claimed_value: null });
    expect(audits.map((a) => a.action).sort()).toEqual(["claim.status_changed", "claim.status_changed", "evidence.recorded", "evidence.recorded"]);
    expect(audits.find((a) => a.action === "claim.status_changed")!.detail).toMatchObject({ from: "claimed", to: "unverified", reason: "analysis_sync" });

    const again = await syncClaimsForProject(PROJECT, analysis, { db, audit, rawText: "x", sourceReportId: "svi-1", now: NOW });
    expect(again).toMatchObject({ claims_created: 0, claims_updated: 0, records_created: 0, records_skipped: 2, status_changes: 0 });
    expect(db.records).toHaveLength(2);
    expect(audits).toHaveLength(4);
  });

  it("a changed value updates the claim, supersedes the older same-source proof and never deletes; a hub upload lifts the status", async () => {
    const { db, audit } = setup();
    await syncClaimsForProject(PROJECT, { signals: signals({ mrrAud: 12000 }) }, { db, audit, now: NOW });
    const second = await syncClaimsForProject(PROJECT, { signals: signals({ mrrAud: 15000 }) }, { db, audit, sourceReportId: "svi-2", now: NOW });
    expect(second).toMatchObject({ claims_created: 0, claims_updated: 1, records_created: 1, records_superseded: 1 });
    expect(db.records.map((r) => r.status).sort()).toEqual(["active", "superseded"]);
    const mrr = db.claims.find((c) => c.claim_key === "traction.mrr_aud")!;
    expect(mrr).toMatchObject({ extracted_value: 15000, statement: "Monthly recurring revenue of A$15,000", source_report_id: "svi-2", assessment_status: "unverified" });

    db.hubRows.set(PROJECT, [{ dimension: "tre", evidence_type: "mrr_dashboard", evidence_label: "MRR dashboard", evidence_value_or_url: "https://x.example/mrr", confidence_level: "document_uploaded", is_verified: false, review_status: "none", created_at: "2026-09-05T00:00:00.000Z" }]);
    const third = await syncClaimsForProject(PROJECT, { signals: signals({ mrrAud: 15000, hasRevenue: true }) }, { db, audit, now: NOW });
    expect(third.records_created).toBe(3); // founder_text for has_revenue + hub rows linked to has_revenue and has_analytics
    expect(db.claims.find((c) => c.claim_key === "traction.has_revenue")).toMatchObject({ assessment_status: "evidence_backed", confidence: 50 });
    expect(db.claims.find((c) => c.claim_key === "traction.has_analytics")).toMatchObject({ assessment_status: "evidence_backed", statement: "Usage / growth analytics are tracked" });
    expect(db.claims).toHaveLength(3);

    // a SECOND hub upload on the same claim is additional proof (both stay active); a re-verified copy of the FIRST supersedes it
    db.hubRows.set(PROJECT, [
      ...db.hubRows.get(PROJECT)!,
      { dimension: "tre", evidence_type: "revenue_proof", evidence_label: "Bank statement", evidence_value_or_url: null, confidence_level: "document_uploaded", is_verified: false, review_status: "none", created_at: "2026-09-06T00:00:00.000Z" },
    ]);
    const fourth = await syncClaimsForProject(PROJECT, { signals: signals({ mrrAud: 15000, hasRevenue: true }) }, { db, audit, now: NOW });
    expect(fourth).toMatchObject({ records_created: 2, records_superseded: 0 }); // revenue_proof → has_revenue + has_customers
    const revId = db.claims.find((c) => c.claim_key === "traction.has_revenue")!.id;
    expect(db.records.filter((r) => r.claim_id === revId && r.source_type === "evidence_hub" && r.status === "active")).toHaveLength(2);
    db.hubRows.set(PROJECT, db.hubRows.get(PROJECT)!.map((h) => (h.evidence_type === "mrr_dashboard" ? { ...h, confidence_level: "third_party_verified", is_verified: true, verified_at: "2026-09-10T00:00:00.000Z", verified_by_user_id: "rev-1", review_status: "approved" } : h)));
    const fifth = await syncClaimsForProject(PROJECT, { signals: signals({ mrrAud: 15000, hasRevenue: true }) }, { db, audit, now: NOW });
    expect(fifth).toMatchObject({ records_created: 2, records_superseded: 2 }); // the L6 copies replace the L3 mrr_dashboard rows on has_revenue + has_analytics
    expect(db.claims.find((c) => c.claim_key === "traction.has_revenue")).toMatchObject({ assessment_status: "verified", confidence: 100 });
    expect(db.records.filter((r) => r.claim_id === revId && r.status === "active").map((r) => r.evidence_type).sort()).toEqual(["L1_self_declared", "L3_uploaded_document", "L6_third_party_verified"]);
  });

  it("a founder value that disagrees with the extraction → conflicting; agreeing again → resolved", async () => {
    const { db, audit, audits } = setup();
    await syncClaimsForProject(PROJECT, { signals: signals({ mrrAud: 12000 }) }, { db, audit, now: NOW });
    const mrr = db.claims[0];
    await db.updateClaim(mrr.id, { founder_claimed_value: 5000 });
    const r = await syncClaimsForProject(PROJECT, { signals: signals({ mrrAud: 12000 }) }, { db, audit, now: NOW });
    expect(r.conflicting).toBe(1);
    expect(db.claims[0]).toMatchObject({ contradiction_status: "conflicting", assessment_status: "conflicting" });
    expect(audits.at(-1)).toMatchObject({ action: "claim.status_changed", detail: { from: "unverified", to: "conflicting", contradiction: "conflicting" } });
    await db.updateClaim(mrr.id, { founder_claimed_value: 12500 });
    await syncClaimsForProject(PROJECT, { signals: signals({ mrrAud: 12000 }) }, { db, audit, now: NOW });
    expect(db.claims[0]).toMatchObject({ contradiction_status: "resolved", assessment_status: "unverified" });
  });

  it("a connector value that disagrees with the founder's text is a contradiction too", async () => {
    const { db, audit } = setup();
    const rows: EvidenceRow[] = [{ evidence_id: "ev-stripe", source: "stripe", label: "Stripe MRR", status: "evidenced", value: "A$8,000", dims: ["tre"], confidence: "transaction_data" }];
    await syncClaimsForProject(PROJECT, { signals: signals({ hasRevenue: true }) }, { db, audit, evidenceRows: rows, now: NOW });
    const rev = db.claims.find((c) => c.claim_key === "traction.has_revenue")!;
    expect(rev).toMatchObject({ assessment_status: "evidence_backed", confidence: 90 });
    // the founder now says "no revenue" while Stripe (a different source) says yes
    await db.updateClaim(rev.id, { founder_claimed_value: false });
    await syncClaimsForProject(PROJECT, { signals: signals({ hasRevenue: true }) }, { db, audit, evidenceRows: rows, now: NOW });
    expect(db.claims.find((c) => c.claim_key === "traction.has_revenue")!.assessment_status).toBe("conflicting");
  });

  it("syncClaimsForProjectSafe never throws: missing table, db failure, missing ids", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const broken = memoryClaimsDb();
    broken.listClaims = async () => {
      throw new Error('relation "public.claims" does not exist');
    };
    expect(await syncClaimsForProjectSafe(PROJECT, { signals: signals({ hasABN: true }) }, { db: broken, audit: null })).toBeNull();
    expect(warn.mock.calls[0][0]).toContain("0417");
    const failing = memoryClaimsDb();
    failing.insertClaim = async () => {
      throw new Error("boom");
    };
    expect(await syncClaimsForProjectSafe(PROJECT, { signals: signals({ hasABN: true }) }, { db: failing, audit: null })).toBeNull();
    expect(await syncClaimsForProjectSafe(null, { signals: signals() }, { db: memoryClaimsDb(), audit: null })).toBeNull();
    expect(await syncClaimsForProjectSafe(PROJECT, null, { db: memoryClaimsDb(), audit: null })).toBeNull();
    expect(await syncClaimsForProjectSafe(PROJECT, { signals: signals() }, { db: null, audit: null })).toBeNull();
    warn.mockRestore();
  });

  it("a duplicate-key race on insert reads the row back instead of failing", async () => {
    const { db, audit } = setup();
    const existing: Claim = { ...(await db.insertClaim({ project_id: PROJECT, svi_dimension: "lco", category: "legal", claim_key: "legal.has_abn", statement: "old", founder_claimed_value: null, extracted_value: true, normalized_value: { kind: "boolean", value: true }, confidence: null, contradiction_status: "none", assessment_status: "claimed", source_report_id: null, created_by: null })) };
    const realList = db.listClaims.bind(db);
    let calls = 0;
    db.listClaims = async (p) => (++calls === 1 ? [] : realList(p)); // first read misses → insert races → 23505 → re-read
    const r = await syncClaimsForProject(PROJECT, { signals: signals({ hasABN: true }) }, { db, audit, now: NOW });
    expect(r.claims_created).toBe(0);
    expect(db.claims).toHaveLength(1);
    expect(db.claims[0].id).toBe(existing.id);
    expect(db.records[0].claim_id).toBe(existing.id);
  });
});
