import { describe, expect, it } from "vitest";
import { qualifyRevenue, type RevenueProvenance } from "./revenue-qualification";
const scope = { ownerUserId: "owner", projectId: "project", businessName: "Acme", now: Date.parse("2026-09-16") };
// Synthetic future-producer fixture, not a claim of an existing verified writer.
const proof: RevenueProvenance = { version: 1, producer: "fixture-not-trusted", producerVersion: 1, metric: "mrr", currency: "AUD", basis: "recurring_contracts", amountAud: 0, asOf: "2026-09-10", capturedAt: "2026-09-11", complete: true, ownerUserId: "owner", projectId: "project", businessName: "Acme", entityId: "entity", sourceEntityId: "entity", sourceId: "source-row", sourceProvider: "stripe", derivation: "native_aud_complete_recurring_contracts" };
const observation = { provider: "stripe", mrrAud: 0, capturedAt: "2026-09-11", qualification: proof };
describe("revenue source qualification", () => {
  it("preserves valid zero validation while rejecting spoofed complete provenance without a trusted producer", () => {
    expect(qualifyRevenue(observation, scope)).toMatchObject({ eligible: false, reasons: ["trusted_producer_unavailable"] });
    expect(qualifyRevenue(observation, scope).reasons).not.toContain("amount_unqualified");
    expect(qualifyRevenue({ ...observation, qualification: undefined }, scope).reasons).toContain("missing_source_provenance");
  });
  it.each([{ metric: "accounting_revenue" }, { currency: "USD" }, { derivation: "static_fx" }, { complete: false }, { projectId: "other" }, { ownerUserId: "other" }, { businessName: "Another business" }, { sourceEntityId: "other-tenant" }, { sourceId: "" }, { sourceProvider: "xero" }, { amountAud: 9000 }, { asOf: "bad" }, { asOf: "2026-01-01" }, { asOf: "2026-09-12" }, { capturedAt: "2026-09-10" }])("rejects invalid provenance %j", (change) => {
    const result = qualifyRevenue({ ...observation, qualification: { ...proof, ...change } }, scope);
    expect(result.eligible).toBe(false);
    expect(result.reasons.some((reason) => reason !== "trusted_producer_unavailable")).toBe(true);
  });
  it("rejects account-only scope, future capture and nonfinite or negative values", () => {
    expect(qualifyRevenue(observation, { ...scope, projectId: null }).eligible).toBe(false);
    expect(qualifyRevenue(observation, { ...scope, now: Date.parse("2026-09-09") }).eligible).toBe(false);
    for (const mrrAud of [NaN, Infinity, -1]) expect(qualifyRevenue({ ...observation, mrrAud, qualification: { ...proof, amountAud: mrrAud } }, scope).eligible).toBe(false);
  });
});
