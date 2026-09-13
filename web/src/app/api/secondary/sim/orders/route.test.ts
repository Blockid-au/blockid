// Colocated tests for GET/POST /api/secondary/sim/orders (S27-B sandbox).
//
//   - every response carries sandbox: true + the Corporations Act notice
//   - GET: 401 anonymous, 404 no project / non-member, viewer lists
//   - POST: Growth gate response verbatim (402), viewer 403, editor places
//     keyed on the OWNER's register with the CALLER's user_id stamped,
//     validation errors surface with their status, cancel / settings actions,
//     400 on bad JSON / side / action

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { makeScopeState } from "@/test/project-scope-mock";

vi.mock("server-only", () => ({}));

const scopeState = await vi.hoisted(async () => {
  const { makeScopeState } = await import("@/test/project-scope-mock");
  return makeScopeState();
});
vi.mock("@/lib/projects", async () => {
  const { projectsMock } = await import("@/test/project-scope-mock");
  return projectsMock(scopeState);
});

const auth = vi.hoisted(() => ({ user: { id: "user-caller", email: "caller@x.test", plan: "founder_growth" } as Record<string, unknown> | null }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => auth.user }));

const gate = vi.hoisted(() => ({ locked: false, feature: "" }));
vi.mock("@/lib/feature-gate", () => ({
  gateRequireFeature: async (feature: string) => {
    gate.feature = feature;
    return gate.locked
      ? { ok: false, response: NextResponse.json({ ok: false, error: "feature_locked", feature }, { status: 402 }) }
      : { ok: true, user: auth.user, uwp: { id: "user-caller", plan: "founder_growth", segment: "founder" } };
  },
}));

const db = vi.hoisted(() => ({ available: true }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => (db.available ? { from: () => ({}) } : null) }));

const sim = vi.hoisted(() => ({
  place: vi.fn(),
  cancel: vi.fn(),
  settings: vi.fn(),
  list: vi.fn(),
}));
vi.mock("@/lib/secondary/sim", () => ({
  placeOrder: (_db: unknown, args: unknown) => sim.place(args),
  cancelOrder: (_db: unknown, args: unknown) => sim.cancel(args),
  saveSettings: (_db: unknown, projectId: string, patch: unknown) => sim.settings(projectId, patch),
  listOrders: (_db: unknown, projectId: string) => sim.list(projectId),
}));

import { GET, POST } from "./route";

const ORDER = { id: "o1", holderKey: "sh:s1", holderLabel: "Ada", side: "sell", price: 1.2, qty: 100, remaining: 100, status: "open", holdUntil: null, seq: 1, createdAt: "2026-09-13T00:00:00Z" };

function reset() {
  Object.assign(scopeState, makeScopeState());
  auth.user = { id: "user-caller", email: "caller@x.test", plan: "founder_growth" };
  gate.locked = false;
  db.available = true;
  sim.place.mockReset().mockResolvedValue({ ok: true, order: ORDER, fills: [], held: false });
  sim.cancel.mockReset().mockResolvedValue({ ok: true, order: { ...ORDER, status: "cancelled" } });
  sim.settings.mockReset().mockResolvedValue({ rofrEnabled: true, rofrHoldHours: 48 });
  sim.list.mockReset().mockResolvedValue([ORDER]);
}

function post(body: unknown, raw = false) {
  return POST(new Request("https://blockid.au/api/secondary/sim/orders", { method: "POST", headers: { "content-type": "application/json" }, body: raw ? String(body) : JSON.stringify(body) }));
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = async (res: Response): Promise<Record<string, any>> => (await res.json()) as Record<string, unknown>;

describe("GET /api/secondary/sim/orders", () => {
  beforeEach(reset);

  it("401 anonymous, 404 no project, 404 non-member, 503 no db", async () => {
    auth.user = null;
    expect((await GET()).status).toBe(401);
    reset();
    scopeState.projectId = null;
    expect((await GET()).status).toBe(404);
    reset();
    scopeState.nonMember = true;
    expect((await GET()).status).toBe(404);
    reset();
    db.available = false;
    expect((await GET()).status).toBe(503);
  });

  it("viewer lists the project's orders with the sandbox notice", async () => {
    scopeState.role = "viewer";
    const body = await json(await GET());
    expect(body.ok).toBe(true);
    expect(body.sandbox).toBe(true);
    expect(body.notice).toMatch(/Chapter 6D/);
    expect(body.orders).toEqual([ORDER]);
    expect(sim.list).toHaveBeenCalledWith("proj-1");
  });
});

describe("POST /api/secondary/sim/orders", () => {
  beforeEach(reset);

  it("gates on secondary_market.view (402 verbatim) and refuses viewers (403)", async () => {
    gate.locked = true;
    const res = await post({ action: "place", side: "buy", price: 1, qty: 1 });
    expect(res.status).toBe(402);
    expect(gate.feature).toBe("secondary_market.view");
    reset();
    scopeState.role = "viewer";
    expect((await post({ action: "place", side: "buy", price: 1, qty: 1 })).status).toBe(403);
    expect(sim.place).not.toHaveBeenCalled();
  });

  it("editor places: OWNER's register, CALLER's user_id, sandbox flag on the response", async () => {
    scopeState.role = "editor";
    const res = await post({ side: "sell", price: "1.25", qty: 100, shareholderId: "s1" });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).toMatchObject({ ok: true, sandbox: true, order: ORDER, fills: [], held: false });
    expect(body.notice).toMatch(/not an offer/);
    expect(sim.place).toHaveBeenCalledWith(expect.objectContaining({ projectId: "proj-1", ownerUserId: "user-owner", userId: "user-caller", side: "sell", price: 1.25, qty: 100, shareholderId: "s1", holderLabel: null }));
  });

  it("engine refusals surface with their status and detail", async () => {
    sim.place.mockResolvedValueOnce({ ok: false, status: 422, error: "exceeds_holdings", detail: "You can sell at most 10 shares" });
    const res = await post({ side: "sell", price: 1, qty: 99, shareholderId: "s1" });
    expect(res.status).toBe(422);
    expect(await json(res)).toMatchObject({ ok: false, sandbox: true, error: "exceeds_holdings", detail: "You can sell at most 10 shares" });
  });

  it("cancel + settings actions; bad ids / unknown actions / bad JSON / bad side are 400", async () => {
    const c = await post({ action: "cancel", orderId: "11111111-2222-4333-8444-555555555555" });
    expect(c.status).toBe(200);
    expect(sim.cancel).toHaveBeenCalledWith({ projectId: "proj-1", orderId: "11111111-2222-4333-8444-555555555555" });
    sim.cancel.mockResolvedValueOnce({ ok: false, status: 409, error: "not_cancellable" });
    expect((await post({ action: "cancel", orderId: "11111111-2222-4333-8444-555555555555" })).status).toBe(409);
    expect((await post({ action: "cancel", orderId: "x" })).status).toBe(400);

    const s = await post({ action: "settings", rofrEnabled: true, rofrHoldHours: 24 });
    expect(await json(s)).toMatchObject({ ok: true, sandbox: true, settings: { rofrEnabled: true, rofrHoldHours: 48 } });
    expect(sim.settings).toHaveBeenCalledWith("proj-1", { rofrEnabled: true, rofrHoldHours: 24 });

    expect((await post({ action: "nuke" })).status).toBe(400);
    expect((await post({ side: "short", price: 1, qty: 1 })).status).toBe(400);
    expect((await post("{nope", true)).status).toBe(400);
  });
});
