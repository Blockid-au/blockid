// G21 P1-A — records.ts: canonical sha256 (order-independent, time-blind),
// visibility + consent_scope per viewer scope, consent-scoped listing through
// the memory db, strongest-proof ordering, the unverified-claims count and
// the status tally; plus the L1–L6 ↔ confidence-cap helpers in types.ts.

import { describe, expect, it } from "vitest";
import { memoryClaimsDb } from "./claims-db";
import { canViewRecord, canonicalJson, countClaimStatuses, evidenceRecordHash, filterRecordsForViewer, listEvidenceRecords, recordsConfidence, sha256, strongestRecords, unverifiedMaterialClaims } from "./records";
import { CONFIDENCE_LEVELS } from "./confidence-cap";
import { confidenceFromEvidenceLevel, EVIDENCE_LEVELS, evidenceLevelFromConfidence, evidenceLevelRank, isAssessmentStatus, isEvidenceLevel, isSviDimension, type EvidenceRecord } from "./types";

const PROJECT = "11111111-1111-4111-8111-111111111111";

function rec(over: Partial<EvidenceRecord>): EvidenceRecord {
  return {
    id: over.id ?? "r",
    project_id: PROJECT,
    claim_id: "c-1",
    svi_dimension: "tre",
    evidence_type: "L1_self_declared",
    source_type: "founder_text",
    source_uri: null,
    source_name: null,
    submitted_by: null,
    submitted_at: "2026-09-01T00:00:00.000Z",
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
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    ...over,
  };
}

describe("ladder helpers (types.ts)", () => {
  it("L1–L6 ↔ confidence-cap rungs are a bijection in ladder order", () => {
    expect(EVIDENCE_LEVELS.map(confidenceFromEvidenceLevel)).toEqual([...CONFIDENCE_LEVELS]);
    for (const c of CONFIDENCE_LEVELS) expect(confidenceFromEvidenceLevel(evidenceLevelFromConfidence(c))).toBe(c);
    expect(evidenceLevelRank("L1_self_declared")).toBe(1);
    expect(evidenceLevelRank("L6_third_party_verified")).toBe(6);
    expect(isEvidenceLevel("L3_uploaded_document")).toBe(true);
    expect(isEvidenceLevel("document_uploaded")).toBe(false);
    expect(isAssessmentStatus("verified")).toBe(true);
    expect(isAssessmentStatus("proven")).toBe(false);
    expect(isSviDimension("tre")).toBe(true);
    expect(isSviDimension("TRE")).toBe(false);
  });
});

describe("sha256 / canonical hash", () => {
  it("is deterministic, key-order independent and ignores observed/submitted times", () => {
    expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(canonicalJson({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: undefined } })).toBe('{"a":{"d":[2,{"y":2,"z":1}]},"b":1}');
    const base = { project_id: PROJECT, claim_key: "traction.mrr_aud", svi_dimension: "tre" as const, evidence_type: "L2_public_url" as const, source_type: "founder_text", source_uri: null, source_name: "Founder statement", verified_at: null, observed_value: { kind: "number" as const, value: 12000 } };
    const h = evidenceRecordHash(base);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(evidenceRecordHash({ ...base, observed_at: "2027-01-01T00:00:00.000Z" } as typeof base)).toBe(h);
    expect(evidenceRecordHash({ ...base, observed_value: { kind: "number", value: 15000 } })).not.toBe(h);
    expect(evidenceRecordHash({ ...base, verified_at: "2026-09-10T00:00:00.000Z" })).not.toBe(h);
    expect(evidenceRecordHash({ ...base, evidence_type: "L3_uploaded_document" })).not.toBe(h);
  });
});

describe("visibility + consent scope", () => {
  const priv = rec({ id: "priv", visibility: "private" });
  const evalOnly = rec({ id: "eval", visibility: "evaluators" });
  const pub = rec({ id: "pub", visibility: "public" });
  const denied = rec({ id: "denied", visibility: "public", consent_scope: { deny: ["evaluators"] } });
  const named = rec({ id: "named", visibility: "private", consent_scope: { allowed_viewers: ["eval-7"] } });

  it("owner sees everything; evaluators see evaluators+public minus deny plus named grants; public sees public minus deny", () => {
    const all = [priv, evalOnly, pub, denied, named];
    expect(filterRecordsForViewer(all, { scope: "owner" }).map((r) => r.id)).toEqual(["priv", "eval", "pub", "denied", "named"]);
    expect(filterRecordsForViewer(all, { scope: "evaluators", userId: "eval-1" }).map((r) => r.id)).toEqual(["eval", "pub"]);
    expect(filterRecordsForViewer(all, { scope: "evaluators", userId: "eval-7" }).map((r) => r.id)).toEqual(["eval", "pub", "named"]);
    expect(filterRecordsForViewer(all, { scope: "public" }).map((r) => r.id)).toEqual(["pub"]);
    expect(canViewRecord(rec({ visibility: "public", consent_scope: { deny: ["public"] } }), { scope: "public" })).toBe(false);
    expect(canViewRecord(rec({ visibility: "public", consent_scope: { deny: ["public"] } }), { scope: "evaluators" })).toBe(true);
    expect(canViewRecord({ visibility: "evaluators", consent_scope: null as unknown as EvidenceRecord["consent_scope"] }, { scope: "evaluators" })).toBe(true);
  });

  it("listEvidenceRecords applies status (active only by default), dimension and viewer scope", async () => {
    const db = memoryClaimsDb({ records: [priv, evalOnly, pub, rec({ id: "old", visibility: "public", status: "expired" }), rec({ id: "lco", visibility: "public", svi_dimension: "lco" })] });
    expect((await listEvidenceRecords(PROJECT, {}, db)).map((r) => r.id)).toEqual(["priv", "eval", "pub", "lco"]);
    expect((await listEvidenceRecords(PROJECT, { includeInactive: true }, db)).map((r) => r.id)).toContain("old");
    expect((await listEvidenceRecords(PROJECT, { dimension: "lco", viewer: { scope: "evaluators" } }, db)).map((r) => r.id)).toEqual(["lco"]);
    expect((await listEvidenceRecords(PROJECT, { viewer: { scope: "public" } }, db)).map((r) => r.id)).toEqual(["pub", "lco"]);
    expect(await listEvidenceRecords("22222222-2222-4222-8222-222222222222", {}, db)).toEqual([]);
  });
});

describe("strongestRecords / counts", () => {
  it("orders by rung desc, verified first at equal rung, newest observed; inactive never rank; n caps", () => {
    const rows = [
      rec({ id: "l1", evidence_type: "L1_self_declared", observed_at: "2026-09-10T00:00:00.000Z" }),
      rec({ id: "l3-old", evidence_type: "L3_uploaded_document", observed_at: "2026-08-01T00:00:00.000Z" }),
      rec({ id: "l3-new", evidence_type: "L3_uploaded_document", observed_at: "2026-09-01T00:00:00.000Z" }),
      rec({ id: "l3-signed", evidence_type: "L3_uploaded_document", observed_at: "2026-07-01T00:00:00.000Z", verified_by: "rev" }),
      rec({ id: "l6-expired", evidence_type: "L6_third_party_verified", status: "expired" }),
      rec({ id: "l5", evidence_type: "L5_transaction_data", observed_at: null, submitted_at: "2026-09-05T00:00:00.000Z" }),
    ];
    expect(strongestRecords(rows).map((r) => r.id)).toEqual(["l5", "l3-signed", "l3-new"]);
    expect(strongestRecords(rows, 10).map((r) => r.id)).toEqual(["l5", "l3-signed", "l3-new", "l3-old", "l1"]);
    expect(strongestRecords(rows, 0)).toEqual([]);
    expect(recordsConfidence(rows)).toBe(90);
    expect(recordsConfidence([rec({ status: "superseded", evidence_type: "L6_third_party_verified" })])).toBeNull();
  });

  it("unverifiedMaterialClaims counts claimed/unverified/conflicting; countClaimStatuses tallies every status", () => {
    const claims = [{ assessment_status: "claimed" as const }, { assessment_status: "unverified" as const }, { assessment_status: "conflicting" as const }, { assessment_status: "evidence_backed" as const }, { assessment_status: "verified" as const }, { assessment_status: "verified" as const }];
    expect(unverifiedMaterialClaims(claims)).toBe(3);
    expect(countClaimStatuses(claims)).toEqual({ claimed: 1, unverified: 1, conflicting: 1, evidence_backed: 1, verified: 2 });
    expect(countClaimStatuses([])).toEqual({ claimed: 0, evidence_backed: 0, verified: 0, unverified: 0, conflicting: 0 });
  });
});
