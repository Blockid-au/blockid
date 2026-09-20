// G21 P1-A — runEvidenceExpiry against the memory db: expired records flip
// and their claims are re-graded (only proof gone → claimed, weaker proof
// left → its rung), audit rows per record and per status change, Phase-3
// rows go through the state machine (terminal states untouched), dry-run
// reports and writes nothing, a Phase-3 read failure is a warning not a crash.

import { describe, expect, it } from "vitest";
import type { AuditFn } from "./claims";
import { memoryClaimsDb } from "./claims-db";
import { runEvidenceExpiry } from "./expiry";
import type { Claim, EvidenceRecord } from "./types";

const NOW = new Date("2026-09-20T02:35:00.000Z");
const PROJECT = "11111111-1111-4111-8111-111111111111";

function claim(over: Partial<Claim>): Claim {
  return {
    id: over.id ?? "c",
    project_id: PROJECT,
    svi_dimension: "tre",
    category: "traction",
    claim_key: "traction.has_revenue",
    statement: "The company is generating revenue",
    founder_claimed_value: null,
    extracted_value: true,
    normalized_value: { kind: "boolean", value: true },
    confidence: 90,
    contradiction_status: "none",
    assessment_status: "evidence_backed",
    source_report_id: null,
    created_by: null,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    ...over,
  };
}
function rec(over: Partial<EvidenceRecord>): EvidenceRecord {
  return {
    id: over.id ?? "r",
    project_id: PROJECT,
    claim_id: "c-1",
    svi_dimension: "tre",
    evidence_type: "L5_transaction_data",
    source_type: "stripe",
    source_uri: null,
    source_name: null,
    submitted_by: null,
    submitted_at: "2026-06-01T00:00:00.000Z",
    observed_at: "2026-06-01T00:00:00.000Z",
    confidence: null,
    verification_level: null,
    verified_by: null,
    verified_at: null,
    expires_at: "2026-08-30T00:00:00.000Z",
    hash: null,
    observed_value: null,
    visibility: "evaluators",
    consent_scope: {},
    status: "active",
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    ...over,
  };
}

function setup() {
  const db = memoryClaimsDb({
    now: () => NOW,
    claims: [claim({ id: "c-1" }), claim({ id: "c-2", claim_key: "traction.mrr_aud", assessment_status: "evidence_backed", confidence: 50 })],
    records: [
      rec({ id: "r-stripe" }), // expired L5 on c-1
      rec({ id: "r-text", claim_id: "c-1", evidence_type: "L1_self_declared", source_type: "founder_text", expires_at: "2027-01-01T00:00:00.000Z" }), // still live
      rec({ id: "r-hub", claim_id: "c-2", evidence_type: "L3_uploaded_document", source_type: "evidence_hub" }), // expired, the only proof
      rec({ id: "r-future", claim_id: "c-2", evidence_type: "L2_public_url", expires_at: null, status: "superseded" }),
    ],
    phase3: [
      { id: "e-1", business_id: PROJECT, verification_state: "verified", expires_at: "2026-09-01" },
      { id: "e-2", business_id: PROJECT, verification_state: "rejected", expires_at: "2026-09-01" },
      { id: "e-3", business_id: PROJECT, verification_state: "classified", expires_at: "2026-12-01" },
    ],
  });
  const audits: Array<{ action: string; actor: string; resource_type: string; detail?: Record<string, unknown> }> = [];
  const audit: AuditFn = async (p) => {
    audits.push({ action: p.action, actor: p.actor, resource_type: p.resource_type, detail: p.detail });
    return { id: 1n, curr_hash: "x" };
  };
  return { db, audits, audit };
}

describe("runEvidenceExpiry", () => {
  it("flips expired records, re-grades the claims they backed and audits every step", async () => {
    const { db, audits, audit } = setup();
    const r = await runEvidenceExpiry({ db, audit, now: NOW });
    expect(r).toMatchObject({ ok: true, dry: false, records_expired: 2, claims_regraded: 2, claim_status_changes: 2, phase3_expired: 1, projects: [PROJECT], warnings: [] });
    expect(db.records.find((x) => x.id === "r-stripe")!.status).toBe("expired");
    expect(db.records.find((x) => x.id === "r-hub")!.status).toBe("expired");
    expect(db.records.find((x) => x.id === "r-text")!.status).toBe("active");
    // c-1 keeps its L1 text → unverified @ 20; c-2 lost its only proof → claimed @ null
    expect(db.claims.find((c) => c.id === "c-1")).toMatchObject({ assessment_status: "unverified", confidence: 20 });
    expect(db.claims.find((c) => c.id === "c-2")).toMatchObject({ assessment_status: "claimed", confidence: null });
    expect(audits.filter((a) => a.action === "evidence.expired" && a.resource_type === "evidence_record")).toHaveLength(2);
    expect(audits.filter((a) => a.action === "claim.status_changed").map((a) => a.detail)).toEqual([
      expect.objectContaining({ from: "evidence_backed", to: "unverified", reason: "evidence_expired" }),
      expect.objectContaining({ from: "evidence_backed", to: "claimed", reason: "evidence_expired" }),
    ]);
    for (const a of audits) expect(a.actor).toBe("cron");
    // Phase-3: verified → expired through the transition table; rejected untouched; future untouched
    expect(db.phase3.map((p) => p.verification_state)).toEqual(["expired", "rejected", "classified"]);
    expect(audits.find((a) => a.resource_type === "evidence")!.detail).toMatchObject({ from: "verified", to: "expired" });
  });

  it("dry-run reports the same plan and writes / audits nothing", async () => {
    const { db, audits, audit } = setup();
    const r = await runEvidenceExpiry({ db, audit, now: NOW, dry: true });
    expect(r).toMatchObject({ dry: true, records_expired: 2, claims_regraded: 0, claim_status_changes: 0, phase3_expired: 1, projects: [PROJECT] });
    expect(db.records.every((x) => x.id === "r-future" || x.status === "active")).toBe(true);
    expect(db.claims.every((c) => c.assessment_status === "evidence_backed")).toBe(true);
    expect(db.phase3[0].verification_state).toBe("verified");
    expect(audits).toEqual([]);
  });

  it("a second run is a no-op; a Phase-3 read failure is a warning; no db → throws", async () => {
    const { db, audit } = setup();
    await runEvidenceExpiry({ db, audit, now: NOW });
    const again = await runEvidenceExpiry({ db, audit, now: NOW });
    expect(again).toMatchObject({ records_expired: 0, claim_status_changes: 0, phase3_expired: 0, projects: [] });
    db.listExpirablePhase3Evidence = async () => {
      throw new Error("permission denied for table evidence");
    };
    const warned = await runEvidenceExpiry({ db, audit, now: NOW });
    expect(warned.warnings[0]).toContain("phase3 evidence read");
    await expect(runEvidenceExpiry({ db: null, now: NOW })).rejects.toThrow(/database unavailable/);
  });

  it("an audit sink failure is recorded as a warning and never stops the run", async () => {
    const { db } = setup();
    const r = await runEvidenceExpiry({
      db,
      now: NOW,
      audit: async () => {
        throw new Error("AUDIT_HMAC_SECRET not set");
      },
    });
    expect(r.records_expired).toBe(2);
    expect(r.warnings.some((w) => w.includes("AUDIT_HMAC_SECRET"))).toBe(true);
    expect(db.records.find((x) => x.id === "r-stripe")!.status).toBe("expired");
  });
});
