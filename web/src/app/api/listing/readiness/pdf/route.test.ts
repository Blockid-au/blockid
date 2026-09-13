// Colocated tests for /api/listing/readiness/pdf (S29-A).
//
//   GET   — editor+ (viewer 403); 402 with the price when neither included
//           nor already paid (nothing spent); PDF when included; PDF when
//           the project already carries the charge; `?for=` watermark.
//   POST  — preview (confirm absent) never spends and shows cost / balance
//           / creditNote; 402 insufficient_credits before any spend;
//           confirm → spend 1 credit ONCE, stamp the profile, PDF bytes;
//           included / already charged → confirm spends nothing; a render
//           failure after a spend refunds and does not stamp.

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
vi.mock("server-only", () => ({}));
const auth = vi.hoisted(() => ({ user: { id: "user-caller", email: "caller@x.test", plan: "founder_free" } as Record<string, unknown> | null }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => auth.user }));
const db = vi.hoisted(() => ({ sb: null as FakeSupabase | null }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => db.sb }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: () => null }));
vi.mock("@/lib/share-price-server", () => ({ loadSharePriceMidForScope: async () => 2 }));
const credits = vi.hoisted(() => ({ canAfford: vi.fn(), spendCredits: vi.fn(), grantCredits: vi.fn() }));
vi.mock("@/lib/credits", async () => {
  const real = await vi.importActual<typeof import("@/lib/credits")>("@/lib/credits");
  return {
    FEATURE_COSTS: real.FEATURE_COSTS,
    canAfford: (...a: unknown[]) => credits.canAfford(...a),
    spendCredits: (...a: unknown[]) => credits.spendCredits(...a),
    grantCredits: (...a: unknown[]) => credits.grantCredits(...a),
    // Lane-2 P3-d: included / already-paid previews still read the balance.
    getBalance: async () => 7,
  };
});
const gate = vi.hoisted(() => ({ included: false, via: null as "addon" | "growth" | null }));
vi.mock("@/lib/listing/gate", () => ({ listingPdfIncluded: async () => ({ included: gate.included, via: gate.via }) }));
const render = vi.hoisted(() => ({ fail: false, calls: [] as Array<Record<string, unknown>> }));
vi.mock("@/lib/pdf/listing-readiness-pdf", () => ({
  renderListingReadinessPdf: async (props: Record<string, unknown>) => {
    render.calls.push(props);
    if (render.fail) throw new Error("boom");
    return Buffer.from("%PDF-1.4 fake");
  },
}));

import { GET, POST } from "./route";

function seed(charged = 0) {
  db.sb = fakeSupabase({
    shareholders: [{ id: "22222222-2222-4222-8222-222222222222", account_id: "user-owner", project_id: "proj-1", name: "Jane Founder", role: "founder", shares_held: 1_000_000 }],
    bank_transactions: [],
    project_grant_profiles: [{ project_id: "proj-1", incorporated_at: "2021-03-01", listed: false, abn: "12345678901", acn: "123456789", city: "Sydney", state: "NSW" }],
    listing_profiles: [{ project_id: "proj-1", facts: {}, pdf_credits_charged: charged, pdf_charged_at: charged ? "2026-09-02T00:00:00Z" : null, updated_at: null }],
  });
}

const get = (qs = "") => GET(new Request(`http://localhost/api/listing/readiness/pdf${qs}`) as never);
const post = (body: unknown) => POST(new Request("http://localhost/api/listing/readiness/pdf", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

beforeEach(() => {
  Object.assign(scopeState, makeScopeState({ role: "editor" }));
  auth.user = { id: "user-caller", email: "caller@x.test", plan: "founder_free" };
  gate.included = false;
  gate.via = null;
  render.fail = false;
  render.calls = [];
  credits.canAfford.mockReset().mockResolvedValue({ allowed: true, balance: 10, cost: 1 });
  credits.spendCredits.mockReset().mockResolvedValue({ ok: true, balance: 9 });
  credits.grantCredits.mockReset().mockResolvedValue({ ok: true, balance: 10 });
  seed();
});

describe("GET /api/listing/readiness/pdf", () => {
  it("401; 400 exchange; viewer 403; no project 404; 402 with the price when not included and not paid — nothing spent", async () => {
    auth.user = null;
    expect((await get()).status).toBe(401);
    auth.user = { id: "user-caller", email: "caller@x.test", plan: "founder_free" };
    expect((await get("?exchange=lse")).status).toBe(400);
    Object.assign(scopeState, makeScopeState({ role: "viewer" }));
    expect((await get()).status).toBe(403);
    Object.assign(scopeState, makeScopeState({ role: "editor", projectId: null }));
    expect((await get()).status).toBe(404);
    Object.assign(scopeState, makeScopeState({ role: "editor" }));
    const res = await get("?exchange=asx");
    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({ ok: false, error: "payment_required", cost: 1, listedCost: 1, balance: 10, creditNote: "Charged to your own credits — not the project owner's." });
    expect(credits.spendCredits).not.toHaveBeenCalled();
    expect(render.calls).toHaveLength(0);
  });

  it("included → PDF with the founder's company and no charge; already paid → PDF; ?for= burns the watermark", async () => {
    gate.included = true;
    gate.via = "addon";
    const res = await get("?exchange=nasdaq&for=US%20counsel");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain('filename="listing-readiness-nasdaq.pdf"');
    expect(res.headers.get("x-blockid-credits-charged")).toBe("0");
    expect(res.headers.get("x-blockid-readiness-rows")).toBe("11");
    expect(res.headers.get("x-blockid-watermark")).toBe("1");
    expect(render.calls[0]).toMatchObject({ exchange: "nasdaq", company: { name: "P", abn: "12 345 678 901", acn: "123 456 789", address: "Sydney NSW" } });
    expect(String(render.calls[0].watermark)).toContain("Prepared for US counsel");
    expect(credits.canAfford).not.toHaveBeenCalled();

    gate.included = false;
    seed(1);
    const paid = await get();
    expect(paid.status).toBe(200);
    expect(paid.headers.get("x-blockid-watermark")).toBeNull();
    expect(credits.canAfford).not.toHaveBeenCalled();
  });
});

describe("POST /api/listing/readiness/pdf", () => {
  it("preview shows the cost and spends nothing; 402 insufficient_credits before any spend", async () => {
    const res = await post({ exchange: "asx" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, preview: true, exchange: "asx", cost: 1, listedCost: 1, included: false, includedVia: null, alreadyCharged: false, balance: 10, creditNote: "Charged to your own credits — not the project owner's." });
    expect(credits.spendCredits).not.toHaveBeenCalled();
    credits.canAfford.mockResolvedValue({ allowed: false, balance: 0, cost: 1, reason: "insufficient_credits" });
    const poor = await post({ exchange: "asx", confirm: true });
    expect(poor.status).toBe(402);
    expect(await poor.json()).toMatchObject({ error: "insufficient_credits", creditsRequired: 1, balance: 0 });
    expect(credits.spendCredits).not.toHaveBeenCalled();
    expect(render.calls).toHaveLength(0);
  });

  it("confirm: spends 1 credit once, stamps the profile, returns the PDF; the next export of either exchange is free", async () => {
    const res = await post({ exchange: "asx", confirm: true });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("x-blockid-credits-charged")).toBe("1");
    expect(credits.spendCredits).toHaveBeenCalledWith("user-caller", "listing_readiness_pdf", { project_id: "proj-1", exchange: "asx" });
    const up = db.sb!.find("listing_profiles", "upsert");
    expect(up).toHaveLength(1);
    expect(up[0].args[0]).toMatchObject({ project_id: "proj-1", pdf_credits_charged: 1 });

    seed(1);
    credits.spendCredits.mockClear();
    const again = await post({ exchange: "nasdaq", confirm: true });
    expect(again.status).toBe(200);
    expect(again.headers.get("x-blockid-credits-charged")).toBe("0");
    expect(credits.spendCredits).not.toHaveBeenCalled();
    expect(db.sb!.find("listing_profiles", "upsert")).toHaveLength(0);
  });

  it("included via growth: confirm spends nothing; invalid exchange 400; viewer 403", async () => {
    gate.included = true;
    gate.via = "growth";
    const preview = await (await post({})).json();
    expect(preview).toMatchObject({ preview: true, cost: 0, included: true, includedVia: "growth" });
    // Lane-2 P3-d: an included preview carries the real balance and an honest note.
    expect(preview.balance).toBe(7);
    expect(preview.creditNote).toBe("Included in your plan — no credits charged.");
    const res = await post({ confirm: true });
    expect(res.status).toBe(200);
    expect(credits.spendCredits).not.toHaveBeenCalled();
    expect((await post({ exchange: "asx-lite" })).status).toBe(400);
    Object.assign(scopeState, makeScopeState({ role: "viewer" }));
    expect((await post({ confirm: true })).status).toBe(403);
  });

  it("render failure after a spend refunds and does not stamp", async () => {
    render.fail = true;
    const res = await post({ exchange: "asx", confirm: true });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "render_failed", retryCost: 1 });
    expect(credits.grantCredits).toHaveBeenCalledWith("user-caller", 1, "refund", { feature: "listing_readiness_pdf", project_id: "proj-1", reason: "render_failed" });
    expect(db.sb!.find("listing_profiles", "upsert")).toHaveLength(0);
  });
});
