// G21 P1-A — claim-correction.ts: body validation (one of value/statement,
// note required, size caps, strict keys) and correctClaim against the memory
// db: version appended BEFORE the row changes with the previous state, the
// row updated, re-graded (founder value ≠ extraction → conflicting),
// `claim.corrected` audited, versions count up.

import { describe, expect, it } from "vitest";
import type { AuditFn } from "./claims";
import { memoryClaimsDb } from "./claims-db";
import { CLAIM_VALUE_MAX_BYTES, correctClaim, parseClaimCorrection } from "./claim-correction";
import type { Claim, EvidenceRecord } from "./types";

const NOW = new Date("2026-09-20T03:00:00.000Z");
const PROJECT = "11111111-1111-4111-8111-111111111111";

const CLAIM: Claim = {
  id: "c-1",
  project_id: PROJECT,
  svi_dimension: "tre",
  category: "traction",
  claim_key: "traction.mrr_aud",
  statement: "Monthly recurring revenue of A$12,000",
  founder_claimed_value: null,
  extracted_value: 12000,
  normalized_value: { kind: "number", value: 12000, unit: "AUD" },
  confidence: 20,
  contradiction_status: "none",
  assessment_status: "unverified",
  source_report_id: "svi-1",
  created_by: null,
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-01T00:00:00.000Z",
};
const RECORD: EvidenceRecord = {
  id: "r-1",
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
};

describe("parseClaimCorrection", () => {
  it("accepts value-only, statement-only and both; trims; rejects missing note, neither field, unknown keys, oversize", () => {
    expect(parseClaimCorrection({ founder_claimed_value: 9000, note: "Stripe says 9k" })).toEqual({ ok: true, value: { founder_claimed_value: 9000, note: "Stripe says 9k" } });
    expect(parseClaimCorrection({ statement: "  MRR is A$9,000  ", note: "typo" })).toEqual({ ok: true, value: { statement: "MRR is A$9,000", note: "typo" } });
    expect(parseClaimCorrection({ founder_claimed_value: null, statement: "x", note: "n" }).ok).toBe(true);
    expect(parseClaimCorrection({ founder_claimed_value: 1 }).ok).toBe(false);
    expect(parseClaimCorrection({ note: "n" }).ok).toBe(false);
    expect(parseClaimCorrection({ note: "n", extra: 1, statement: "x" }).ok).toBe(false);
    expect(parseClaimCorrection({ note: "", statement: "x" }).ok).toBe(false);
    expect(parseClaimCorrection({ note: "n", founder_claimed_value: "x".repeat(CLAIM_VALUE_MAX_BYTES + 1) }).ok).toBe(false);
    const bad = parseClaimCorrection({ statement: "", note: "n" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.issues[0].path).toBe("statement");
  });
});

describe("correctClaim", () => {
  function setup() {
    const db = memoryClaimsDb({ now: () => NOW, claims: [CLAIM], records: [RECORD] });
    const audits: Array<{ action: string; actor: string; user_id?: string | null; detail?: Record<string, unknown> }> = [];
    const audit: AuditFn = async (p) => {
      audits.push({ action: p.action, actor: p.actor, user_id: p.user_id, detail: p.detail });
      return { id: 1n, curr_hash: "x" };
    };
    return { db, audits, audit };
  }

  it("appends version 1 with the previous state, updates the row, flags the contradiction and audits", async () => {
    const { db, audits, audit } = setup();
    const r = await correctClaim({ claim: CLAIM, correction: { founder_claimed_value: 5000, note: "Our MRR is A$5k, the deck was stale" }, userId: "founder-1", db, audit, now: NOW });
    expect(r.version).toMatchObject({ claim_id: "c-1", version: 1, note: "Our MRR is A$5k, the deck was stale", changed_by: "founder-1", changed_at: NOW.toISOString() });
    expect(r.version.snapshot).toEqual({
      before: { statement: CLAIM.statement, founder_claimed_value: null, extracted_value: 12000, normalized_value: CLAIM.normalized_value, assessment_status: "unverified", contradiction_status: "none", confidence: 20 },
      patch: { founder_claimed_value: 5000 },
    });
    expect(r.claim).toMatchObject({ founder_claimed_value: 5000, statement: CLAIM.statement, contradiction_status: "conflicting", assessment_status: "conflicting" });
    expect(r.status_changed).toBe(true);
    expect(audits.map((a) => a.action)).toEqual(["claim.status_changed", "claim.corrected"]);
    expect(audits[1]).toMatchObject({ actor: "user", user_id: "founder-1", detail: { version: 1, fields: ["founder_claimed_value"], note_length: 35, status: "conflicting" } });
    expect(audits[0].detail).toMatchObject({ from: "unverified", to: "conflicting", reason: "founder_correction" });
  });

  it("an agreeing value keeps the status; a statement-only fix bumps the version and never touches the value; versions count up", async () => {
    const { db, audits, audit } = setup();
    const a = await correctClaim({ claim: CLAIM, correction: { founder_claimed_value: 12500, note: "rounding" }, userId: "founder-1", db, audit, now: NOW });
    expect(a).toMatchObject({ status_changed: false, claim: { assessment_status: "unverified", contradiction_status: "none" } });
    const b = await correctClaim({ claim: a.claim, correction: { statement: "MRR of A$12,500 as at September", note: "wording" }, userId: "founder-1", db, audit, now: NOW });
    expect(b.version.version).toBe(2);
    expect(b.claim).toMatchObject({ statement: "MRR of A$12,500 as at September", founder_claimed_value: 12500 });
    expect((await db.listVersions("c-1")).map((v) => v.version)).toEqual([1, 2]);
    expect(audits.filter((x) => x.action === "claim.corrected")).toHaveLength(2);
    expect(audits.some((x) => x.action === "claim.status_changed")).toBe(false);
  });

  it("an audit failure never loses the correction", async () => {
    const { db } = setup();
    const r = await correctClaim({
      claim: CLAIM,
      correction: { founder_claimed_value: 5000, note: "n" },
      userId: "founder-1",
      db,
      audit: async () => {
        throw new Error("AUDIT_HMAC_SECRET not set");
      },
      now: NOW,
    });
    expect(r.claim.founder_claimed_value).toBe(5000);
    expect(db.versions).toHaveLength(1);
  });
});
