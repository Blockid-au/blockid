// G21 P3-C — connector → EvidenceRecord: the pure rows per provider (claim
// keys, levels, values, statements, per-payload source_uri), and the
// fail-soft emitter against the memory claims db (mints the claim, records
// the proof with +90 d expiry and an audit row, supersedes the older
// snapshot, contradicts the founder's figure, never throws).

import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ verified: vi.fn() }));
vi.mock("@/lib/analytics/fi-events", () => ({ emitEvidenceVerified: (a: unknown) => h.verified(a) }));
import { CLAIM_REGISTRY, DEFAULT_TTL_DAYS, claimDefinition, type AuditFn } from "@/lib/evidence/claims";
import { memoryClaimsDb } from "@/lib/evidence/claims-db";
import { evidenceRecordHash } from "@/lib/evidence/records";
import { connectorEvidenceRows, connectorPayloadUri, emitAbrEvidence, emitConnectorEvidence } from "./connector-evidence";
import { CONNECTOR_EVIDENCE_VALUES, connectorEvidenceValue, notOfferedConnectors, offeredConnectors } from "./evidence-value";

const NOW = new Date("2026-09-20T02:00:00.000Z");
const PROJECT = "11111111-1111-4111-8111-111111111111";
const STRIPE = { mrrAud: 8200, arrAud: 98400, activeSubscriptions: 41, activeCustomers: 57, churnedSubscriptions90d: 1, churnRate90dPct: 2.44, currency: "aud" };
const XERO = { totalIncomeAud: 30000, totalExpensesAud: 45000, netProfitAud: -15000, bankBalanceAud: 120000, windowMonths: 3, tenantName: "Acme", reportPeriod: null };

describe("evidence-value registry", () => {
  it("every claim key a connector lists is a registry claim, every row has a sentence and a level ≤ L5 for a machine-read source", () => {
    for (const v of CONNECTOR_EVIDENCE_VALUES) {
      expect(v.sentence.length, v.id).toBeGreaterThan(40);
      expect(v.dimensions.length, v.id).toBeGreaterThan(0);
      expect(v.level, v.id).not.toBe("L6_third_party_verified");
      for (const k of v.claimKeys) expect(claimDefinition(k), `${v.id}: ${k}`).toBeDefined();
      if (v.availability === "not_offered") expect(v.claimKeys).toEqual([]);
    }
    expect(offeredConnectors().map((v) => v.id)).toEqual(["stripe", "xero", "github", "ga4", "abr", "linkedin"]);
    expect(notOfferedConnectors().map((v) => v.id)).toEqual(["quickbooks", "hubspot", "salesforce", "airtable", "notion_drive", "investor_crm", "licensed_datasets"]);
    expect(connectorEvidenceValue("abr")?.level).toBe("L4_connected_source");
    expect(connectorEvidenceValue("nope")).toBeUndefined();
  });

  it("the connector-only registry keys exist and carry no founder signal", () => {
    for (const k of ["traction.paying_customers", "traction.churn_90d_pct", "traction.monthly_sessions", "traction.monthly_conversions", "capital.bank_balance_aud", "capital.runway_months", "ftv.shipping_cadence", "lco.registered"]) {
      const def = CLAIM_REGISTRY.find((d) => d.key === k);
      expect(def, k).toBeDefined();
      expect(def!.signal).toBeUndefined();
    }
  });
});

describe("connectorEvidenceRows", () => {
  it("never promotes unqualified contract observations to transaction evidence", () => {
    const metrics = { ...STRIPE, sourceObservation: { eligibleForValuation: false } };
    expect(connectorEvidenceRows({ provider: "stripe", metrics }, NOW)).toEqual([]);
  });
  it("Stripe → revenue / customers / churn at L5 (transaction data), one source_uri per payload", () => {
    const rows = connectorEvidenceRows({ provider: "stripe", metrics: STRIPE }, NOW);
    expect(rows.map((r) => [r.claim_key, r.evidence_type])).toEqual([
      ["traction.has_revenue", "L5_transaction_data"],
      ["traction.mrr_aud", "L5_transaction_data"],
      ["traction.arr_aud", "L5_transaction_data"],
      ["traction.paying_customers", "L5_transaction_data"],
      ["market.has_customers", "L5_transaction_data"],
      ["traction.churn_90d_pct", "L5_transaction_data"],
    ]);
    expect(rows[1].value).toEqual({ kind: "number", value: 8200, unit: "AUD" });
    expect(rows[5].value).toEqual({ kind: "number", value: 2.4, unit: "%" });
    const uri = connectorPayloadUri("stripe", STRIPE, NOW.toISOString());
    expect(uri).toMatch(/^connector:\/\/stripe\/2026-09-20\/[0-9a-f]{16}$/);
    for (const r of rows) expect(r).toMatchObject({ provider: "stripe", source_name: "Stripe", observed_at: NOW.toISOString(), source_uri: uri });
    // a changed payload on the same day is a different proof; the same payload is the same proof
    expect(connectorPayloadUri("stripe", { ...STRIPE, mrrAud: 9000 }, NOW.toISOString())).not.toBe(uri);
    expect(connectorPayloadUri("stripe", { ...STRIPE }, NOW.toISOString())).toBe(uri);
  });

  it("Stripe with no revenue → customers only (a zero is a measurement), never a revenue claim", () => {
    const rows = connectorEvidenceRows({ provider: "stripe", metrics: { mrrAud: 0, activeCustomers: 0, recentPayments30d: 0, averageOrderAud: 0 } }, NOW);
    expect(rows.map((r) => r.claim_key)).toEqual(["traction.paying_customers"]);
    expect(rows[0].value).toEqual({ kind: "number", value: 0 });
  });

  it("Xero → P&L revenue at L5, cash at bank and derived runway at L4 (a connected read, not a payout)", () => {
    const rows = connectorEvidenceRows({ provider: "xero", metrics: XERO }, NOW);
    expect(rows.map((r) => [r.claim_key, r.evidence_type, r.value?.value])).toEqual([
      ["traction.has_revenue", "L5_transaction_data", true],
      ["traction.mrr_aud", "L5_transaction_data", 10000],
      ["capital.bank_balance_aud", "L4_connected_source", 120000],
      ["capital.runway_months", "L4_connected_source", 8],
    ]);
    // no bank report → no cash / runway rows
    expect(connectorEvidenceRows({ provider: "xero", metrics: { ...XERO, bankBalanceAud: null } }, NOW).map((r) => r.claim_key)).toEqual(["traction.has_revenue", "traction.mrr_aud"]);
  });

  it("GitHub → shipping cadence (FTV execution) + source-code claim at L4; GA4 → sessions / conversions / analytics at L4", () => {
    const gh = connectorEvidenceRows({ provider: "github", metrics: { recentCommits30d: 42, publicRepos: 3, topLanguage: "TypeScript", primaryRepoName: "acme/app", primaryRepoStars: 12 } }, NOW);
    expect(gh.map((r) => [r.claim_key, r.evidence_type])).toEqual([["ftv.shipping_cadence", "L4_connected_source"], ["product.has_source_code", "L4_connected_source"]]);
    expect(gh[1].statement).toBe("Source code is kept in a repository (acme/app)");
    const ga = connectorEvidenceRows({ provider: "ga4", metrics: { sessions30d: 1200, newUsers30d: 800, conversions30d: 30, averageSessionDurationSec: 90 } }, NOW);
    expect(ga.map((r) => r.claim_key)).toEqual(["traction.monthly_sessions", "traction.has_analytics", "traction.monthly_conversions"]);
    expect(ga.every((r) => r.evidence_type === "L4_connected_source" && r.source_name === "Google Analytics 4")).toBe(true);
  });

  it("ABR → registration claim at L4 (authoritative register, machine-read — L6 needs a reviewer); a cancelled ABN observes false", () => {
    const active = connectorEvidenceRows({ provider: "abr", metrics: { abn: "79659615111", entityName: "AUSCHAIN PTY LTD", status: "Active" } }, NOW);
    expect(active.map((r) => [r.claim_key, r.evidence_type, r.value?.value])).toEqual([["lco.registered", "L4_connected_source", true], ["legal.has_abn", "L4_connected_source", true]]);
    expect(active[0].statement).toBe("AUSCHAIN PTY LTD (ABN 79659615111) is registered and active on the Australian Business Register");
    const cancelled = connectorEvidenceRows({ provider: "abr", metrics: { abn: "79659615111", entityName: null, status: "Cancelled" } }, NOW);
    expect(cancelled.map((r) => [r.claim_key, r.value?.value])).toEqual([["lco.registered", false]]);
    expect(cancelled[0].statement).toBe("ABN 79659615111 is cancelled on the Australian Business Register");
  });
});

describe("emitConnectorEvidence (memory claims db)", () => {
  it("mints the claim from the connector, records L5 proof with +90 d expiry, audits it, and skips a re-sync of the same payload", async () => {
    const db = memoryClaimsDb({ now: () => NOW });
    const audit = vi.fn(async () => undefined) as unknown as AuditFn;
    const s = await emitConnectorEvidence({ projectId: PROJECT, input: { provider: "stripe", metrics: STRIPE }, observedAt: NOW, actorUserId: "owner-1", db, audit });
    expect(s).toMatchObject({ claims_created: 6, records_created: 6, records_skipped: 0, status_changes: 6, conflicting: 0 });
    const mrr = db.claims.find((c) => c.claim_key === "traction.mrr_aud")!;
    expect(mrr).toMatchObject({ svi_dimension: "tre", statement: "Monthly recurring revenue of A$8,200", assessment_status: "evidence_backed", confidence: 90, created_by: "owner-1" });
    const rec = db.records.find((r) => r.claim_id === mrr.id)!;
    expect(rec).toMatchObject({ evidence_type: "L5_transaction_data", source_type: "stripe", source_name: "Stripe (stripe:traction.mrr_aud)", visibility: "evaluators", status: "active", observed_at: NOW.toISOString(), submitted_by: "owner-1" });
    expect(rec.expires_at).toBe(new Date(NOW.getTime() + DEFAULT_TTL_DAYS.connector * 86_400_000).toISOString());
    expect(rec.hash).toBe(evidenceRecordHash({ ...rec, claim_key: "traction.mrr_aud" }));
    expect(rec.source_uri).toMatch(/^connector:\/\/stripe\/2026-09-20\//);
    const audited = (audit as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => (c[0] as { action: string }).action);
    expect(audited.filter((a) => a === "evidence.recorded")).toHaveLength(6);
    expect(audited.filter((a) => a === "claim.status_changed")).toHaveLength(6);

    // same payload again (a manual "Sync now" minutes later) → nothing new
    const again = await emitConnectorEvidence({ projectId: PROJECT, input: { provider: "stripe", metrics: STRIPE }, observedAt: NOW, db, audit });
    expect(again).toMatchObject({ claims_created: 0, records_created: 0, records_skipped: 6, records_superseded: 0 });
  });

  it("a later snapshot with a moved figure supersedes the older proof from the same connector (append-only) and the claim keeps its status", async () => {
    const db = memoryClaimsDb({ now: () => NOW });
    await emitConnectorEvidence({ projectId: PROJECT, input: { provider: "xero", metrics: XERO }, observedAt: NOW, db, audit: null });
    const later = new Date(NOW.getTime() + 7 * 86_400_000);
    const s = await emitConnectorEvidence({ projectId: PROJECT, input: { provider: "xero", metrics: { ...XERO, totalIncomeAud: 36000 } }, observedAt: later, db, audit: null });
    expect(s).toMatchObject({ records_created: 4, records_superseded: 4, records_skipped: 0 });
    const mrrRecs = db.records.filter((r) => r.source_name === "Xero (xero:traction.mrr_aud)");
    expect(mrrRecs.map((r) => [r.status, r.observed_value?.value])).toEqual([["superseded", 10000], ["active", 12000]]);
    expect(db.claims.find((c) => c.claim_key === "traction.mrr_aud")).toMatchObject({ assessment_status: "evidence_backed" });
    expect(mrrRecs[1].expires_at).toBe(new Date(later.getTime() + 90 * 86_400_000).toISOString());
  });

  it("a connector figure that disagrees with the founder's stated value → conflicting (never averaged, both kept)", async () => {
    const db = memoryClaimsDb({ now: () => NOW });
    await db.insertClaim({
      project_id: PROJECT, svi_dimension: "tre", category: "traction", claim_key: "traction.mrr_aud", statement: "Monthly recurring revenue of A$20,000",
      founder_claimed_value: 20000, extracted_value: 20000, normalized_value: { kind: "number", value: 20000, unit: "AUD" }, confidence: null,
      contradiction_status: "none", assessment_status: "claimed", source_report_id: null, created_by: null,
    });
    const s = await emitConnectorEvidence({ projectId: PROJECT, input: { provider: "stripe", metrics: STRIPE }, observedAt: NOW, db, audit: null });
    expect(s?.conflicting).toBe(1);
    const c = db.claims.find((x) => x.claim_key === "traction.mrr_aud")!;
    expect(c).toMatchObject({ assessment_status: "conflicting", contradiction_status: "conflicting", statement: "Monthly recurring revenue of A$20,000", founder_claimed_value: 20000 });
  });

  it("fail-soft: no project (legacy account-keyed connection), an empty metric set, or a db error → null, never a throw", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await emitConnectorEvidence({ projectId: null, input: { provider: "stripe", metrics: STRIPE }, db: memoryClaimsDb() })).toBeNull();
    expect(await emitConnectorEvidence({ projectId: PROJECT, input: { provider: "xero", metrics: { ...XERO, totalIncomeAud: 0, bankBalanceAud: null } }, db: memoryClaimsDb() })).toBeNull();
    expect(await emitConnectorEvidence({ projectId: PROJECT, input: { provider: "stripe", metrics: STRIPE }, db: null })).toBeNull();
    expect(warn).toHaveBeenCalledWith("[blockid:connector-evidence] sync skipped", expect.objectContaining({ provider: "stripe" }));
    expect(JSON.stringify(warn.mock.calls)).not.toContain("8200");
    warn.mockRestore();
  });

  it("ABR: an active ABN records lco.registered + legal.has_abn at L4 and emits evidence_verified with the record id (never the ABN); a cancelled ABN emits nothing", async () => {
    h.verified.mockReset();
    const db = memoryClaimsDb({ now: () => NOW });
    const s = await emitAbrEvidence({ projectId: PROJECT, ownerUserId: "owner-1", actorUserId: "owner-1", email: "o@x.test", plan: "free", abr: { abn: "79659615111", entityName: "AUSCHAIN PTY LTD", status: "Active" }, observedAt: NOW, db, audit: null });
    expect(s).toMatchObject({ claims_created: 2, records_created: 2 });
    const rec = db.records.find((r) => r.source_name === "Australian Business Register (abr:lco.registered)")!;
    expect(rec).toMatchObject({ evidence_type: "L4_connected_source", source_type: "abr", svi_dimension: "lco", status: "active" });
    expect(h.verified).toHaveBeenCalledTimes(1);
    expect(h.verified.mock.calls[0][0]).toEqual({ ownerUserId: "owner-1", actorUserId: "owner-1", email: "o@x.test", plan: "free", projectId: PROJECT, channel: "connector", evidenceId: rec.id, level: "L4_connected_source", dimension: "lco", evidenceType: "abr" });
    expect(JSON.stringify(h.verified.mock.calls)).not.toContain("79659615111");

    h.verified.mockReset();
    const db2 = memoryClaimsDb({ now: () => NOW });
    await emitAbrEvidence({ projectId: PROJECT, ownerUserId: "owner-1", abr: { abn: "79659615111", entityName: null, status: "Cancelled" }, observedAt: NOW, db: db2, audit: null });
    expect(db2.claims.find((c) => c.claim_key === "lco.registered")).toMatchObject({ normalized_value: { kind: "boolean", value: false } });
    expect(h.verified).not.toHaveBeenCalled();
  });
});
