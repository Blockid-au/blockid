import { describe, expect, it } from "vitest";
import { reanalysisIntentHash, type ReanalysisRequest, type ServerReanalysisContext } from "./request-contract";
import { REANALYSIS_SCOPE_VERSION } from "./scope";
import { prepareReanalysisQuoteDisplay, validateReanalysisQuoteConsent, REANALYSIS_CONSENT_VERSION, type ServerReanalysisReportBinding } from "./quote-consent";
const now = Date.parse("2026-09-22T12:00:00Z");
function fixture() {
  const request: ReanalysisRequest = { site: "blockid.au", businessId: "b1", accountId: "a1", baseRevision: "r1", inputSha256: "a".repeat(64), scopeVersion: REANALYSIS_SCOPE_VERSION, scopeIds: ["blockid:criterion:market"], mode: "fresh_public_research", researchPolicyVersion: "research-v1", researchCutoff: "2026-09-22T00:00:00Z", acceptedQuoteId: "q1" };
  const server: ServerReanalysisContext = { authenticatedUserId: "actor1", authenticatedSite: request.site, resource: { businessId: "b1", accountId: "a1", ownerUserId: "owner1", revision: "r1", inputSha256: request.inputSha256, canRead: true, canCreateRevision: true }, wallet: { provider: "blockid_user_credits", walletId: "w1", ownerUserId: "payer1", accountId: "a1", authorizedSite: request.site, canSpend: true }, quote: { id: "q1", requesterUserId: "actor1", intentSha256: reanalysisIntentHash(request), walletId: "w1", billingOwnerUserId: "payer1", pricingVersion: "not-live-fixture", creditMicroUnits: 1230000, expiresAt: "2026-09-22T12:10:00Z" } };
  const report: ServerReanalysisReportBinding = { reportId: "report1", site: request.site, businessId: "b1", accountId: "a1", baseRevision: "r1", inputSha256: request.inputSha256, baseSnapshotRef: "immutable-report-snapshot/1", canRead: true, canCreateRevision: true };
  const display = prepareReanalysisQuoteDisplay(request, server, report, now);
  if (!display.ok) throw Error(display.error);
  const consent = { version: REANALYSIS_CONSENT_VERSION, decision: "approve", quoteId: "q1", reportId: "report1", displayedTermsSha256: display.displayedTermsSha256 };
  return { request, server, report, consent, display };
}
describe("explicit scoped quote consent", () => {
  it("binds exact displayed credits and report, without exposing storage reference or permitting holds", () => {
    const f = fixture(); const result = validateReanalysisQuoteConsent(f.request, f.consent, f.server, f.report, now);
    expect(result).toMatchObject({ ok: true, executionAllowed: false, receipt: { terms: { displayCredits: "1.23", creditMicroUnits: 1230000, reportId: "report1", actorUserId: "actor1", scoreRule: "may_decrease_or_remain_unchanged" } } });
    expect(JSON.stringify(f.display)).not.toContain(f.report.baseSnapshotRef);
  });
  it("rejects same quote ID repriced or extended after display", () => {
    for (const patch of [{ creditMicroUnits: 1240000 }, { expiresAt: "2026-09-22T12:11:00Z" }, { pricingVersion: "new-price-version" }]) {
      const f = fixture(); Object.assign(f.server.quote!, patch);
      expect(validateReanalysisQuoteConsent(f.request, f.consent, f.server, f.report, now)).toMatchObject({ error: "displayed_quote_terms_changed" });
    }
  });
  it("rejects replay across actor/site/report even when base admission would accept fresh server mapping", () => {
    for (const kind of ["actor", "site", "report"]) {
      const f = fixture();
      if (kind === "actor") { f.server.authenticatedUserId = "actor2"; f.server.quote!.requesterUserId = "actor2"; }
      if (kind === "report") { f.report.reportId = "report2"; }
      if (kind === "site") {
        f.request.site = "startupvalueindex.com"; f.request.scopeIds = ["svi:field:market_deep"]; f.server.authenticatedSite = f.request.site; f.server.wallet!.authorizedSite = f.request.site; f.report.site = f.request.site; f.server.quote!.intentSha256 = reanalysisIntentHash(f.request);
      }
      expect(validateReanalysisQuoteConsent(f.request, f.consent, f.server, f.report, now)).toMatchObject({ error: "displayed_quote_terms_changed" });
    }
  });
  it("rejects stale revision/input, expired quote and per-report denied permission", () => {
    const f = fixture();
    expect(validateReanalysisQuoteConsent(f.request, f.consent, f.server, f.report, Date.parse(f.server.quote!.expiresAt))).toMatchObject({ error: "quote_expired" });
    for (const patch of [{ baseRevision: "other" }, { inputSha256: "b".repeat(64) }]) expect(validateReanalysisQuoteConsent(f.request, f.consent, f.server, { ...f.report, ...patch }, now)).toMatchObject({ error: "report_snapshot_mismatch" });
    expect(validateReanalysisQuoteConsent(f.request, f.consent, f.server, { ...f.report, canRead: false }, now)).toMatchObject({ error: "report_revision_permission_required" });
  });
  it("binds research policy/cutoff, scope and snapshot reference changes", () => {
    for (const kind of ["policy", "cutoff", "scope", "snapshot"]) {
      const f = fixture();
      if (kind === "policy") f.request.researchPolicyVersion = "research-v2";
      if (kind === "cutoff") f.request.researchCutoff = "2026-09-22T01:00:00Z";
      if (kind === "scope") f.request.scopeIds = ["blockid:criterion:team"];
      if (kind === "snapshot") f.report.baseSnapshotRef = "immutable-report-snapshot/2";
      f.server.quote!.intentSha256 = reanalysisIntentHash(f.request);
      expect(validateReanalysisQuoteConsent(f.request, f.consent, f.server, f.report, now)).toMatchObject({ error: "displayed_quote_terms_changed" });
    }
  });
  it("deduplicates repeated scope and approval into stable receipt identity", () => {
    const f = fixture();
    const a = validateReanalysisQuoteConsent(f.request, f.consent, f.server, f.report, now);
    f.request.scopeIds.push(f.request.scopeIds[0]);
    const b = validateReanalysisQuoteConsent(f.request, f.consent, f.server, f.report, now+1);
    expect(a.ok && b.ok && a.receipt.id === b.receipt.id).toBe(true);
  });
  it("requires explicit confirmation and ledger-compatible precision", () => {
    const f = fixture();
    expect(validateReanalysisQuoteConsent(f.request, { ...f.consent, decision: "view" }, f.server, f.report, now)).toMatchObject({ error: "explicit_quote_consent_required" });
    f.server.quote!.creditMicroUnits = 1230001;
    expect(prepareReanalysisQuoteDisplay(f.request, f.server, f.report, now)).toMatchObject({ error: "unsupported_credit_precision" });
  });
});
