import { expect, it, vi } from "vitest";
import { admitReanalysisWithWallet, type WalletAdmissionSnapshot } from "./wallet-admission";
import { reanalysisIntentHash, type ReanalysisRequest } from "./request-contract";
import { REANALYSIS_SCOPE_VERSION } from "./scope";
const time = Date.parse("2026-09-22T12:00:00Z");
function fixture(site: ReanalysisRequest["site"] = "startupvalueindex.com") {
  const request: ReanalysisRequest = { site, accountId: "account", businessId: "business", baseRevision: "revision", inputSha256: "a".repeat(64), scopeVersion: REANALYSIS_SCOPE_VERSION, scopeIds: [site === "blockid.au" ? "blockid:criterion:market" : "svi:field:market_deep"], mode: "fresh_public_research", researchPolicyVersion: "fixture-policy", researchCutoff: "2026-09-22T00:00:00Z", acceptedQuoteId: "quote" };
  const window = { status: "active" as const, validFrom: "2026-09-22T11:00:00Z", expiresAt: "2026-09-22T13:00:00Z" };
  const snapshot: WalletAdmissionSnapshot = {
    observedAt: new Date(time).toISOString(), user: { id: "actor", status: "active" },
    association: { id: "association", actorId: "actor", site, accountId: "account", businessId: "business", ownerUserId: "business-owner", revision: "revision", inputSha256: request.inputSha256, canRead: true, canCreateRevision: true, ...window },
    grant: { id: "grant", actorId: "actor", site, accountId: "account", associationId: "association", walletId: "explicit-wallet", walletOwnerUserId: "payer", provider: "blockid_user_credits", canSpend: true, ...window },
    quote: { id: "quote", requesterUserId: "actor", intentSha256: reanalysisIntentHash(request), walletId: "explicit-wallet", billingOwnerUserId: "payer", pricingVersion: "fixture-only", creditMicroUnits: 123, expiresAt: window.expiresAt },
  };
  return { request, snapshot, auth: { userId: "actor", site } };
}
const run = (f: ReturnType<typeof fixture>, snapshot: unknown = f.snapshot, now = time) => admitReanalysisWithWallet(f.request, f.auth, async () => snapshot, () => now);
it.each(["blockid.au", "startupvalueindex.com"] as const)("requires explicit %s grant without enabling execution", async site => {
  expect(await run(fixture(site))).toMatchObject({ ok: true, executionAllowed: false, requesterUserId: "actor", businessOwnerUserId: "business-owner", billingOwnerUserId: "payer", walletId: "explicit-wallet", requiredNext: "durable_reservation_and_revision_transaction" });
});
it("rejects auth/site mismatch or injected wallet before authoritative read", async () => {
  const f = fixture(), read = vi.fn(async () => f.snapshot);
  expect((await admitReanalysisWithWallet(f.request, null, read)).ok).toBe(false);
  expect((await admitReanalysisWithWallet(f.request, { ...f.auth, site: "blockid.au" }, read)).ok).toBe(false);
  expect((await admitReanalysisWithWallet({ ...f.request, walletId: "forged" }, f.auth, read)).ok).toBe(false);
  expect(read).not.toHaveBeenCalled();
});
it("does not infer wallet or account from active handoff UID", async () => {
  const f = fixture();
  for (const missing of [null, { user: f.snapshot.user }, { ...f.snapshot, grant: null }, { ...f.snapshot, association: null }]) expect(await run(f, missing)).toMatchObject({ error: "wallet_admission_required" });
});
it("rejects revoked records, blank identifiers and missing permissions", async () => {
  for (const [record, change] of [["user", { status: "suspended" }], ["association", { status: "revoked" }], ["grant", { status: "revoked" }], ["association", { canCreateRevision: false }], ["association", { canRead: false }], ["grant", { canSpend: false }], ["grant", { walletId: " " }]] as const) {
    const f = fixture(); expect((await run(f, { ...f.snapshot, [record]: { ...f.snapshot[record], ...change } })).ok).toBe(false);
  }
});
it("binds actor, report association, account and site-specific grant", async () => {
  for (const [record, field] of [["user", "id"], ["association", "actorId"], ["association", "accountId"], ["association", "businessId"], ["grant", "actorId"], ["grant", "accountId"], ["grant", "associationId"], ["grant", "site"], ["association", "site"]] as const) {
    const f = fixture(); expect(await run(f, { ...f.snapshot, [record]: { ...f.snapshot[record], [field]: field === "site" ? "blockid.au" : "other" } })).toMatchObject({ error: "wallet_admission_mismatch" });
  }
});
it("rejects future/stale snapshots, expired/future grants and invalid clocks", async () => {
  const f = fixture();
  for (const offset of [-30001, 1]) expect(await run(f, { ...f.snapshot, observedAt: new Date(time + offset).toISOString() })).toMatchObject({ error: "wallet_admission_stale" });
  for (const record of ["association", "grant"] as const) for (const change of [{ expiresAt: new Date(time).toISOString() }, { validFrom: new Date(time + 1).toISOString() }]) expect(await run(f, { ...f.snapshot, [record]: { ...f.snapshot[record], ...change } })).toMatchObject({ error: "wallet_admission_stale" });
  expect(await run(f, f.snapshot, NaN)).toMatchObject({ error: "wallet_admission_stale" });
  expect(await run(f, f.snapshot, time + 30001)).toMatchObject({ error: "wallet_admission_stale" });
});
it("delegates immutable snapshot and accepted quote checks to existing contract", async () => {
  for (const [record, change, error] of [["association", { revision: "older" }, "stale_snapshot"], ["association", { inputSha256: "b".repeat(64) }, "stale_snapshot"], ["quote", { walletId: "other" }, "approved_quote_required"], ["quote", { requesterUserId: "other" }, "approved_quote_required"], ["quote", { billingOwnerUserId: "other" }, "approved_quote_required"], ["quote", { intentSha256: "b".repeat(64) }, "approved_quote_required"], ["quote", { expiresAt: new Date(time).toISOString() }, "quote_expired"]] as const) {
    const f = fixture(); expect(await run(f, { ...f.snapshot, [record]: { ...f.snapshot[record], ...change } })).toMatchObject({ error });
  }
});
it("hides reader exceptions and has no cached permission after revocation", async () => {
  const f = fixture();
  expect(await admitReanalysisWithWallet(f.request, f.auth, async () => { throw new Error("private DB details"); })).toEqual({ ok: false, error: "wallet_admission_unavailable" });
  expect((await run(f)).ok).toBe(true);
  expect((await run(f, { ...f.snapshot, grant: { ...f.snapshot.grant, status: "revoked" } })).ok).toBe(false);
});
