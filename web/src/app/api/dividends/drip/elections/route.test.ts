// Colocated tests for /api/dividends/drip/elections (S28-A).
//
//   GET    — viewer+; elections joined to the cap-table shareholder, the
//            allocations with the resolution link, the electable
//            shareholders, the market price only when a share_price_mid
//            election exists, and the next-allocation preview for the
//            newest record still to issue.
//   POST   — editor+ (viewer 403); validation (uuid, 0–100 %, price basis,
//            manual price); the shareholder must be on the OWNER's cap
//            table for this project (404); an active election for the same
//            shareholder is revoked first (replaced: true); 201.
//   DELETE — editor+; revoke (never delete); not_found 404; already 409.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";
import { makeScopeState } from "@/test/project-scope-mock";

const scopeState = await vi.hoisted(async () => {
  const { makeScopeState } = await import("@/test/project-scope-mock");
  return makeScopeState();
});
vi.mock("@/lib/projects", async () => {
  const { projectsMock } = await import("@/test/project-scope-mock");
  return projectsMock(scopeState);
});
const auth = vi.hoisted(() => ({ user: { id: "user-caller", email: "caller@x.test", plan: "founder_free" } as Record<string, unknown> | null }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => auth.user }));
const db = vi.hoisted(() => ({ sb: null as FakeSupabase | null }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => db.sb }));
const sharePrice = vi.hoisted(() => ({ mid: 1.37 as number | null, calls: 0 }));
vi.mock("@/lib/share-price-server", () => ({
  loadSharePriceMidForScope: async () => {
    sharePrice.calls++;
    return sharePrice.mid;
  },
}));

import { DELETE, GET, POST } from "./route";

const JANE = "22222222-2222-4222-8222-222222222222";
const SEED = "33333333-3333-4333-8333-333333333333";
const EL = "44444444-4444-4444-8444-444444444444";
const REC = "11111111-1111-4111-8111-111111111111";

const election = (over: Record<string, unknown> = {}) => ({ id: EL, project_id: "proj-1", user_id: "user-caller", shareholder_id: JANE, participation_pct: "50.00", price_basis: "share_price_mid", manual_price_aud: null, elected_at: "2026-07-01T00:00:00Z", revoked_at: null, created_at: "2026-07-01T00:00:00Z", ...over });

function seed(over: Record<string, Array<Record<string, unknown>>> = {}) {
  db.sb = fakeSupabase({
    shareholders: [
      { id: JANE, account_id: "user-caller", project_id: "proj-1", name: "Jane Founder", role: "founder", shares_held: 600_000, tfn_on_file: true, share_class_id: null },
      { id: SEED, account_id: "user-caller", project_id: null, name: "Seed Investor Pty Ltd", role: "investor", shares_held: 400_000, tfn_on_file: false, share_class_id: null },
    ],
    share_classes: [],
    drip_elections: [],
    drip_allocations: [],
    dividend_records: [{ id: REC, account_id: "user-caller", project_id: "proj-1", period: "2026-06", net_income: 100_000, distribution_pct: 50, total_dividend: 50_000, per_share_dividend: 0.05, franking_rate: 0.25, franking_pct: 100, tfn_withholding_rate: 0, paid_at: "2026-07-15", payouts: [{ name: "Jane Founder", role: "founder", shares: 600_000, ownershipPct: 60, grossDividend: 30_000, frankingCredit: 10_000, netDividend: 30_000 }, { name: "Seed Investor Pty Ltd", role: "investor", shares: 400_000, ownershipPct: 40, grossDividend: 20_000, frankingCredit: 6_666.67, netDividend: 20_000 }], created_at: "2026-07-01T00:00:00Z" }],
    dividend_statements: [],
    project_grant_profiles: [],
    ...over,
  });
}

const json = (method: string, body: unknown) => new Request("http://localhost/api/dividends/drip/elections", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const post = (body: unknown) => POST(json("POST", body));
const del = (body: unknown) => DELETE(json("DELETE", body));

beforeEach(() => {
  Object.assign(scopeState, makeScopeState());
  auth.user = { id: "user-caller", email: "caller@x.test", plan: "founder_free" };
  seed();
  sharePrice.mid = 1.37;
  sharePrice.calls = 0;
});

describe("GET /api/dividends/drip/elections", () => {
  it("401; no project → empty; viewer gets elections, electable shareholders and no price lookup without an election", async () => {
    auth.user = null;
    expect((await GET()).status).toBe(401);
    auth.user = { id: "user-caller", email: "caller@x.test", plan: "founder_free" };
    scopeState.projectId = null;
    expect(await (await GET()).json()).toMatchObject({ ok: true, role: null, elections: [], preview: null });
    Object.assign(scopeState, makeScopeState({ role: "viewer" }));
    const body = await (await GET()).json();
    expect(body.role).toBe("viewer");
    expect(body.elections).toEqual([]);
    expect(body.shareholders.map((s: { name: string; electing: boolean }) => [s.name, s.electing])).toEqual([
      ["Jane Founder", false],
      ["Seed Investor Pty Ltd", false],
    ]);
    expect(body.marketPriceAud).toBeNull();
    expect(body.preview).toBeNull();
    expect(sharePrice.calls).toBe(0);
  });

  it("with an active election: joined name, market price, allocations with the resolution link, and the next-allocation preview", async () => {
    seed({
      drip_elections: [election(), election({ id: "55555555-5555-4555-8555-555555555555", shareholder_id: SEED, revoked_at: "2026-07-02T00:00:00Z" })],
      drip_allocations: [{ id: "al-1", project_id: "proj-1", dividend_record_id: "rec-0", dividend_statement_id: "st-0", election_id: EL, shareholder_id: JANE, shareholder_key: `id:${JANE}`, share_transaction_id: "tx-1", status: "recorded", skip_reason: null, participation_pct: 50, price_basis: "share_price_mid", net_cash_aud: 10_000, price_aud: 1, shares: 5_000, reinvested_aud: 5_000, residual_aud: 0, created_at: "2026-04-01T00:00:00Z" }],
    });
    const body = await (await GET()).json();
    expect(sharePrice.calls).toBe(1);
    expect(body.marketPriceAud).toBe(1.37);
    expect(body.elections.map((e: { shareholderName: string; active: boolean; participationPct: number }) => [e.shareholderName, e.active, e.participationPct])).toEqual([
      ["Jane Founder", true, 50],
      ["Seed Investor Pty Ltd", false, 50],
    ]);
    expect(body.allocations[0]).toMatchObject({ shareholderName: "Jane Founder", shares: 5_000, status: "recorded", resolutionUrl: "/api/board-resolutions/share-issue/tx-1" });
    expect(body.shareholders[0].electing).toBe(true);
    expect(body.preview).toMatchObject({ recordId: REC, period: "2026-06", totalDividendAud: 50_000 });
    expect(body.preview.rows).toEqual([
      { electionId: EL, shareholderName: "Jane Founder", participationPct: 50, priceBasis: "share_price_mid", priceAud: 1.37, netCashAud: 30_000, estShares: 10_948, estReinvestedAud: 14_998.76, estResidualAud: 1.24, estCashPaidAud: 15_001.24, skipReason: null },
    ]);
  });

  it("no usable market price → preview says paid in cash", async () => {
    seed({ drip_elections: [election()] });
    sharePrice.mid = null;
    const body = await (await GET()).json();
    expect(body.preview.rows[0]).toMatchObject({ estShares: 0, estCashPaidAud: 30_000, skipReason: "no_price" });
  });
});

describe("POST /api/dividends/drip/elections", () => {
  it("401; viewer 403; validation 400s; unknown shareholder 404", async () => {
    auth.user = null;
    expect((await post({ shareholderId: JANE, participationPct: 50 })).status).toBe(401);
    auth.user = { id: "user-caller", email: "caller@x.test", plan: "founder_free" };
    expect((await post({ shareholderId: "nope", participationPct: 50 })).status).toBe(400);
    expect((await post({ shareholderId: JANE, participationPct: 101 })).status).toBe(400);
    expect((await post({ shareholderId: JANE, participationPct: -1 })).status).toBe(400);
    expect((await post({ shareholderId: JANE, participationPct: "x" })).status).toBe(400);
    expect((await post({ shareholderId: JANE, participationPct: 50, priceBasis: "spot" })).status).toBe(400);
    expect((await post({ shareholderId: JANE, participationPct: 50, priceBasis: "manual" })).status).toBe(400);
    expect((await post({ shareholderId: JANE, participationPct: 50, priceBasis: "manual", manualPriceAud: 0 })).status).toBe(400);
    scopeState.role = "viewer";
    expect((await post({ shareholderId: JANE, participationPct: 50 })).status).toBe(403);
    scopeState.role = "owner";
    expect((await post({ shareholderId: "99999999-9999-4999-8999-999999999999", participationPct: 50 })).status).toBe(404);
    expect(db.sb!.find("drip_elections", "insert")).toHaveLength(0);
  });

  it("editor records an election with the column contract (201); an existing active one is revoked first", async () => {
    scopeState.role = "editor";
    const res = await post({ shareholderId: JANE, participationPct: 33.333, priceBasis: "manual", manualPriceAud: "2.5" });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.replaced).toBe(false);
    expect(body.election).toMatchObject({ shareholderId: JANE, shareholderName: "Jane Founder", participationPct: 33.33, priceBasis: "manual", manualPriceAud: 2.5, active: true });
    const ins = db.sb!.find("drip_elections", "insert");
    expect(ins).toHaveLength(1);
    expect(ins[0].args[0]).toMatchObject({ project_id: "proj-1", user_id: "user-caller", shareholder_id: JANE, participation_pct: 33.33, price_basis: "manual", manual_price_aud: 2.5 });
    expect(db.sb!.hasEq("shareholders", "account_id", "user-owner")).toBe(true);

    seed({ drip_elections: [election()] });
    const again = await post({ shareholderId: JANE, participationPct: 100 });
    expect(again.status).toBe(201);
    expect((await again.json()).replaced).toBe(true);
    const up = db.sb!.find("drip_elections", "update");
    expect(up).toHaveLength(1);
    expect(up[0].args[0]).toHaveProperty("revoked_at");
    expect(db.sb!.hasEq("drip_elections", "id", EL)).toBe(true);
    expect(db.sb!.find("drip_elections", "insert")[0].args[0]).toMatchObject({ participation_pct: 100, price_basis: "share_price_mid", manual_price_aud: null });
  });
});

describe("DELETE /api/dividends/drip/elections", () => {
  it("401; viewer 403; non-uuid / unknown 404; already revoked 409; revoke sets revoked_at (never deletes)", async () => {
    auth.user = null;
    expect((await del({ id: EL })).status).toBe(401);
    auth.user = { id: "user-caller", email: "caller@x.test", plan: "founder_free" };
    expect((await del({ id: "nope" })).status).toBe(404);
    scopeState.role = "viewer";
    expect((await del({ id: EL })).status).toBe(403);
    scopeState.role = "editor";
    expect((await del({ id: EL })).status).toBe(404);
    seed({ drip_elections: [election({ revoked_at: "2026-07-02T00:00:00Z" })] });
    expect((await del({ id: EL })).status).toBe(409);
    seed({ drip_elections: [election()] });
    const res = await del({ id: EL });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.election).toMatchObject({ id: EL, shareholderName: "Jane Founder", active: false });
    expect(body.election.revokedAt).toBeTruthy();
    expect(db.sb!.find("drip_elections", "update")).toHaveLength(1);
    expect(db.sb!.find("drip_elections", "delete")).toHaveLength(0);
  });
});
