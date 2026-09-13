// Colocated tests for GET /api/listing/readiness (S29-A).
//
//   - 401 without a session; 400 on an unknown exchange; no project → empty
//     rows with the listed price; viewer+ (a non-member gets 404);
//   - the rows are computed for the OWNER's cap table (member reads through
//     the role table), with the founder-ticked facts and the derived inputs
//     (spread, free float, shareholders with the restricted flag);
//   - the PDF block shows the price before anyone exports: included via
//     the gate → cost 0; already charged → cost 0; else the listed cost.

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
vi.mock("@/lib/share-price-server", () => ({ loadSharePriceMidForScope: async () => 2 }));
const gate = vi.hoisted(() => ({ included: false, via: null as "addon" | "growth" | null }));
vi.mock("@/lib/listing/gate", () => ({ listingPdfIncluded: async () => ({ included: gate.included, via: gate.via }) }));

import { GET } from "./route";

const JANE = "22222222-2222-4222-8222-222222222222";
const SEED = "33333333-3333-4333-8333-333333333333";

function seed(over: Record<string, Array<Record<string, unknown>>> = {}) {
  db.sb = fakeSupabase({
    shareholders: [
      { id: JANE, account_id: "user-owner", project_id: "proj-1", name: "Jane Founder", role: "founder", shares_held: 800_000 },
      { id: SEED, account_id: "user-owner", project_id: null, name: "Seed Investor Pty Ltd", role: "investor", shares_held: 200_000 },
    ],
    bank_transactions: [],
    project_grant_profiles: [{ project_id: "proj-1", incorporated_at: "2021-03-01", listed: false, abn: "12345678901", acn: null, city: "Sydney", state: "NSW" }],
    listing_profiles: [{ project_id: "proj-1", facts: { restricted_holder_ids: [SEED], market_makers: 3 }, pdf_credits_charged: 0, pdf_charged_at: null, updated_at: "2026-09-01T00:00:00Z" }],
    ...over,
  });
}

const get = (qs = "") => GET(new Request(`http://localhost/api/listing/readiness${qs}`) as never);

beforeEach(() => {
  Object.assign(scopeState, makeScopeState({ role: "viewer" }));
  auth.user = { id: "user-caller", email: "caller@x.test", plan: "founder_free" };
  gate.included = false;
  gate.via = null;
  seed();
});

describe("GET /api/listing/readiness", () => {
  it("401; 400 exchange; no project → empty; non-member → 404; 503 without a database", async () => {
    auth.user = null;
    expect((await get()).status).toBe(401);
    auth.user = { id: "user-caller", email: "caller@x.test", plan: "founder_free" };
    expect((await get("?exchange=nyse")).status).toBe(400);
    scopeState.projectId = null;
    const empty = await (await get()).json();
    expect(empty).toMatchObject({ ok: true, exchange: "asx", role: null, rows: [], pdf: { listedCost: 1, cost: 1, included: false, alreadyCharged: false } });
    Object.assign(scopeState, makeScopeState({ nonMember: true }));
    expect((await get()).status).toBe(404);
    Object.assign(scopeState, makeScopeState({ role: "viewer" }));
    db.sb = null;
    expect((await get()).status).toBe(503);
  });

  it("viewer: rows for the OWNER's cap table, facts, inputs (restricted flag honoured) and the price block", async () => {
    const res = await get("?exchange=asx");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(scopeState.lastMinRole).toBe("viewer");
    expect(body.role).toBe("viewer");
    expect(body.company).toEqual({ name: "P", abn: "12 345 678 901", acn: null, address: "Sydney NSW" });
    expect(body.rows.map((r: { id: string }) => r.id)[0]).toBe("asx.spread");
    expect(body.rows).toHaveLength(11);
    expect(body.score.total).toBe(11);
    expect(body.facts).toEqual({ restricted_holder_ids: [SEED], market_makers: 3 });
    expect(body.factsUpdatedAt).toBe("2026-09-01T00:00:00Z");
    expect(body.inputs.holders).toBe(2);
    expect(body.inputs.sharePriceAud).toBe(2);
    expect(body.inputs.incorporatedAt).toBe("2021-03-01");
    // Seed is marked restricted → free float 0 %, spread 0 qualifying.
    expect(body.inputs.freeFloat).toEqual({ issuedShares: 1_000_000, freeFloatShares: 0, pct: 0 });
    expect(body.inputs.spread).toMatchObject({ holders: 2, nonAffiliated: 0, qualifying: 0, priceAud: 2 });
    expect(body.inputs.shareholders).toEqual([
      { id: JANE, name: "Jane Founder", role: "founder", sharesHeld: 800_000, restricted: false },
      { id: SEED, name: "Seed Investor Pty Ltd", role: "investor", sharesHeld: 200_000, restricted: true },
    ]);
    expect(body.pdf).toEqual({ listedCost: 1, cost: 1, included: false, includedVia: null, alreadyCharged: false });
    // The cap table was read on the OWNER's id, never the caller's.
    expect(db.sb!.hasEq("shareholders", "account_id", "user-owner")).toBe(true);
    expect(db.sb!.hasEq("shareholders", "account_id", "user-caller")).toBe(false);
  });

  it("nasdaq rows; included via growth → cost 0; already charged → cost 0", async () => {
    gate.included = true;
    gate.via = "growth";
    const body = await (await get("?exchange=nasdaq")).json();
    expect(body.exchange).toBe("nasdaq");
    expect(body.rows[0].id).toBe("nasdaq.public-shares");
    expect(body.rows.find((r: { id: string }) => r.id === "nasdaq.market-makers").status).toBe("met");
    expect(body.pdf).toEqual({ listedCost: 1, cost: 0, included: true, includedVia: "growth", alreadyCharged: false });

    gate.included = false;
    gate.via = null;
    seed({ listing_profiles: [{ project_id: "proj-1", facts: {}, pdf_credits_charged: 1, pdf_charged_at: "2026-09-02T00:00:00Z", updated_at: null }] });
    const paid = await (await get()).json();
    expect(paid.pdf).toEqual({ listedCost: 1, cost: 0, included: false, includedVia: null, alreadyCharged: true });
  });
});
