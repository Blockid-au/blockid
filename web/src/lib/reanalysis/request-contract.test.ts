import { describe, expect, it } from "vitest";
import { prepareReanalysisRequest, reanalysisIntentHash, type ReanalysisRequest, type ServerReanalysisContext } from "./request-contract";
import { REANALYSIS_SCOPES, REANALYSIS_SCOPE_VERSION, resolveReanalysisScopes } from "./scope";
const inputSha256 = "a".repeat(64);
function fixture() {
  const request: ReanalysisRequest = { site: "blockid.au", businessId: "business1", accountId: "account1", baseRevision: "rev1", inputSha256, scopeVersion: REANALYSIS_SCOPE_VERSION, scopeIds: ["blockid:criterion:market", "blockid:criterion:idea"], mode: "fresh_public_research", researchPolicyVersion: "research-fixture-v1", researchCutoff: "2026-09-22T00:00:00Z", acceptedQuoteId: "quote1" };
  const server: ServerReanalysisContext = { authenticatedUserId: "requester1", authenticatedSite: "blockid.au", resource: { businessId: "business1", accountId: "account1", ownerUserId: "owner1", revision: "rev1", inputSha256, canRead: true, canCreateRevision: true }, wallet: { provider: "blockid_user_credits", walletId: "wallet1", ownerUserId: "payer1", accountId: "account1", authorizedSite: "blockid.au", canSpend: true }, quote: { id: "quote1", requesterUserId: "requester1", intentSha256: reanalysisIntentHash(request), walletId: "wallet1", billingOwnerUserId: "payer1", pricingVersion: "fixture-not-live", creditMicroUnits: 100, expiresAt: "2026-10-01T00:00:00Z" } };
  return { request, server };
}
describe("cross-site reanalysis admission", () => {
  it("binds distinct requester/business owner/payer but never enables execution", () => {
    const { request, server } = fixture();
    expect(prepareReanalysisRequest(request, server, 0)).toMatchObject({ ok: true, requesterUserId: "requester1", businessOwnerUserId: "owner1", billingOwnerUserId: "payer1", executionAllowed: false, requiredNext: "durable_reservation_and_revision_transaction" });
  });
  it("rejects wrong account/business and stale revision/input", () => {
    for (const change of [{ accountId: "other" }, { businessId: "other" }, { baseRevision: "old" }, { inputSha256: "b".repeat(64) }]) {
      const { request, server } = fixture(); expect(prepareReanalysisRequest({ ...request, ...change }, server, 0).ok).toBe(false);
    }
  });
  it("fails closed for missing authentication, permission, wallet, quote or pricing", () => {
    for (const key of ["authenticatedUserId", "resource", "wallet", "quote"] as const) {
      const { request, server } = fixture(); server[key] = null; expect(prepareReanalysisRequest(request, server, 0).ok).toBe(false);
    }
    const { request, server } = fixture(); server.quote!.pricingVersion = "";
    expect(prepareReanalysisRequest(request, server, 0)).toMatchObject({ error: "pricing_unavailable" });
    server.resource!.canCreateRevision = false;
    expect(prepareReanalysisRequest(request, server, 0)).toMatchObject({ error: "revision_permission_required" });
  });
  it("canonicalizes duplicate scopes and ordering into one operation identity", () => {
    const { request, server } = fixture(); const a = prepareReanalysisRequest(request, server, 0);
    const b = prepareReanalysisRequest({ ...request, scopeIds: [...request.scopeIds].reverse().concat(request.scopeIds) }, server, 0);
    expect(a.ok && b.ok && a.operationKey === b.operationKey).toBe(true);
    expect(b.ok && b.request.scopeIds.length).toBe(2);
  });
  it("requires new quote when mode or research cutoff changes and rejects expired quotes", () => {
    const { request, server } = fixture();
    expect(prepareReanalysisRequest({ ...request, mode: "existing_evidence" }, server, 0)).toMatchObject({ error: "approved_quote_required" });
    expect(prepareReanalysisRequest({ ...request, researchCutoff: "2026-09-23T00:00:00Z" }, server, 0)).toMatchObject({ error: "approved_quote_required" });
    expect(prepareReanalysisRequest(request, server, Date.parse("2026-10-01"))).toMatchObject({ error: "quote_expired" });
  });
  it("does not assume UID handoff confers another site's wallet", () => {
    const { request, server } = fixture(); request.site = "startupvalueindex.com"; request.scopeIds = ["svi:field:market_deep"]; server.authenticatedSite = request.site; server.quote!.intentSha256 = reanalysisIntentHash(request);
    expect(prepareReanalysisRequest(request, server, 0)).toMatchObject({ error: "wallet_authorization_required" });
    server.wallet!.authorizedSite = request.site;
    expect(prepareReanalysisRequest(request, server, 0).ok).toBe(true);
  });
  it("rejects client injected cost/identity and unknown or cross-site scope", () => {
    const { request, server } = fixture();
    expect(prepareReanalysisRequest({ ...request, creditMicroUnits: 0 }, server, 0)).toMatchObject({ error: "invalid_request" });
    expect(resolveReanalysisScopes("blockid.au", ["svi:field:market_deep"])).toBeNull();
    expect(resolveReanalysisScopes("startupvalueindex.com", ["svi:field:invented"])).toBeNull();
  });
  it("maps13 criteria/52 content-bound questions and21 SVI fields without equating taxonomies", () => {
    expect(REANALYSIS_SCOPES.filter(s => s.id.startsWith("blockid:criterion:"))).toHaveLength(13);
    expect(REANALYSIS_SCOPES.filter(s => s.id.startsWith("blockid:question:"))).toHaveLength(52);
    expect(REANALYSIS_SCOPES.filter(s => s.id.startsWith("svi:"))).toHaveLength(21);
    expect(new Set(REANALYSIS_SCOPES.map(s => s.id)).size).toBe(REANALYSIS_SCOPES.length);
  });
});
