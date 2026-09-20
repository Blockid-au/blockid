// Route tests for PATCH | GET /api/pilots/[orderId]/metrics (G21 P2-C).
// Pins: 401 anonymous; 400 bad JSON / unknown key / out-of-range; 404 for a
// malformed id or another user's order (the query filters by user_id);
// PATCH merges only the sent keys onto the stored jsonb, null clears, an
// audit row is appended with the changed keys (never the notes); GET reads
// the typed metrics back.

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));
const appendAuditMock = vi.fn();
vi.mock("@/lib/audit", () => ({ appendAudit: (p: unknown) => appendAuditMock(p) }));

interface Order { id: string; user_id: string; metrics: Record<string, unknown>; updated_at?: string }
let orders: Order[] = [];
const updateMock = vi.fn();

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from(table: string) {
      expect(table).toBe("pilot_orders");
      const filters: Array<[string, unknown]> = [];
      const chain: Record<string, unknown> = {};
      let pending: Record<string, unknown> | null = null;
      chain.select = () => chain;
      chain.update = (patch: Record<string, unknown>) => {
        pending = patch;
        return chain;
      };
      chain.eq = (k: string, v: unknown) => {
        filters.push([k, v]);
        return chain;
      };
      chain.maybeSingle = async () => {
        const row = orders.find((o) => filters.every(([k, v]) => (o as unknown as Record<string, unknown>)[k] === v)) ?? null;
        return { data: row, error: null };
      };
      chain.then = (resolve: (v: unknown) => void) => {
        const row = orders.find((o) => filters.every(([k, v]) => (o as unknown as Record<string, unknown>)[k] === v));
        if (row && pending) Object.assign(row, pending);
        updateMock(pending, filters);
        resolve({ error: null });
      };
      return chain;
    },
  }),
}));

import { GET, PATCH } from "./route";

const ORDER_ID = "11111111-1111-4111-8111-111111111111";
const USER = { id: "u-1", email: "prog@accel.au", plan: "accelerator_starter" };
const ctx = (orderId = ORDER_ID) => ({ params: Promise.resolve({ orderId }) });
const req = (body: unknown) => new Request(`http://localhost/api/pilots/${ORDER_ID}/metrics`, { method: "PATCH", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });

beforeEach(() => {
  getCurrentUserMock.mockReset().mockResolvedValue(USER);
  appendAuditMock.mockReset().mockResolvedValue({ id: 1n, curr_hash: "h" });
  updateMock.mockReset();
  orders = [{ id: ORDER_ID, user_id: "u-1", metrics: { review_minutes_before: 60, satisfaction: 4, legacy: "keep" } }];
});

describe("PATCH /api/pilots/[orderId]/metrics", () => {
  it("401 anonymous", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    expect((await PATCH(req({ satisfaction: 5 }), ctx())).status).toBe(401);
  });

  it("400 bad JSON, unknown key, out-of-range (with the field path)", async () => {
    expect((await PATCH(req("{oops"), ctx())).status).toBe(400);
    expect((await PATCH(req({ nps: 9 }), ctx())).status).toBe(400);
    const range = await PATCH(req({ satisfaction: 9 }), ctx());
    expect(range.status).toBe(400);
    expect(await range.json()).toMatchObject({ error: "bad_body", issues: [{ path: "satisfaction" }] });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("404 for a malformed id or another user's order", async () => {
    expect((await PATCH(req({ satisfaction: 5 }), ctx("nope"))).status).toBe(404);
    getCurrentUserMock.mockResolvedValue({ ...USER, id: "u-2" });
    expect((await PATCH(req({ satisfaction: 5 }), ctx())).status).toBe(404);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("merges the sent keys, null clears, audit row with the keys (not the notes), typed echo", async () => {
    const res = await PATCH(req({ review_minutes_after: 18, satisfaction: null, repeat_intent: true, case_study_consent: true, notes: "Sponsors asked for the PDF" }), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.metrics).toEqual({ review_minutes_before: 60, review_minutes_after: 18, repeat_intent: true, case_study_consent: true, notes: "Sponsors asked for the PDF" });
    expect(orders[0].metrics).toMatchObject({ review_minutes_before: 60, review_minutes_after: 18, legacy: "keep", repeat_intent: true });
    expect(orders[0].metrics.satisfaction).toBeUndefined();
    expect(typeof orders[0].metrics.updated_at).toBe("string");
    expect(updateMock.mock.calls[0][1]).toEqual([["id", ORDER_ID], ["user_id", "u-1"]]);
    expect(appendAuditMock).toHaveBeenCalledTimes(1);
    const audit = appendAuditMock.mock.calls[0][0] as { action: string; resource_id: string; detail: { keys: string[]; case_study_consent?: boolean } };
    expect(audit).toMatchObject({ action: "pilot.metrics_updated", resource_type: "pilot_order", resource_id: ORDER_ID });
    expect(audit.detail.keys).toEqual(["review_minutes_after", "satisfaction", "repeat_intent", "case_study_consent"]);
    expect(audit.detail.case_study_consent).toBe(true);
    expect(JSON.stringify(audit)).not.toContain("Sponsors asked");
  });

  it("an audit failure never loses the write", async () => {
    appendAuditMock.mockRejectedValue(new Error("AUDIT_HMAC_SECRET not set"));
    const res = await PATCH(req({ startups_processed: 12 }), ctx());
    expect(res.status).toBe(200);
    expect(orders[0].metrics.startups_processed).toBe(12);
  });
});

describe("GET /api/pilots/[orderId]/metrics", () => {
  it("reads the typed metrics for the owner; 404 otherwise", async () => {
    const res = await GET(new Request("http://localhost/x"), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, order_id: ORDER_ID, metrics: { review_minutes_before: 60, satisfaction: 4 } });
    getCurrentUserMock.mockResolvedValue({ ...USER, id: "u-2" });
    expect((await GET(new Request("http://localhost/x"), ctx())).status).toBe(404);
  });
});
