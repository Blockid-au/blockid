// Colocated vitest for /api/cron/svi-snapshot — the T0246 svi_trend_alert
// writer. Pins: Bearer CRON_SECRET gate; 503 without Supabase; the snapshot
// is upserted per account; after the delta is computed, an account whose
// |delta| ≥ SVI_TREND_ALERT_THRESHOLD gets exactly one insertNotification
// call with kind svi_trend_alert + dedupeKey svi_trend:<project>:<date>,
// while a small delta, a first snapshot, or an account with no user_id
// writes none; the response counts them as trend_alerts.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { insertMock, state } = vi.hoisted(() => ({
  insertMock: vi.fn(async () => undefined),
  state: {
    adminNull: false,
    accounts: [] as Array<Record<string, unknown>>,
    analyses: {} as Record<string, { total_svi: number; analysis_json: unknown } | null>,
    priorSnapshot: {} as Record<string, { svi_total: number } | null>,
    upserts: [] as Array<Record<string, unknown>>,
  },
}));
vi.mock("@/lib/notifications", () => ({ insertNotification: (...a: unknown[]) => insertMock(...a) }));
// S20-B — outbound webhook emitter (enqueue only).
const enqueueMock = vi.hoisted(() => vi.fn(async () => ({ queued: 1, endpoints: ["ep"], envelopeId: "evt" })));
vi.mock("@/lib/webhooks/registry", () => ({ enqueueWebhook: (...a: unknown[]) => enqueueMock(...(a as [])) }));
vi.mock("@/lib/svi-index", () => ({
  computeSVIIndex: () => ({ indexValue: 100, dataRichnessFactor: 1 }),
}));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => {
    if (state.adminNull) return null;
    return {
      from(table: string) {
        const eqs: Record<string, unknown> = {};
        let payload: Record<string, unknown> | null = null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chain: any = {
          select: () => chain,
          eq(col: string, val: unknown) {
            eqs[col] = val;
            return chain;
          },
          is: () => chain,
          order: () => chain,
          limit: () => chain,
          update(p: Record<string, unknown>) {
            payload = p;
            return chain;
          },
          upsert(row: Record<string, unknown>) {
            state.upserts.push(row);
            return Promise.resolve({ error: null });
          },
          single() {
            if (table === "svi_analyses") return Promise.resolve({ data: state.analyses[String(eqs.email)] ?? null });
            if (table === "svi_snapshots") return Promise.resolve({ data: state.priorSnapshot[String(eqs.account_id)] ?? null });
            return Promise.resolve({ data: null });
          },
          maybeSingle: () => Promise.resolve({ data: null }),
          then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
            let result: unknown;
            if (table === "svi_accounts" && !payload) result = { data: state.accounts, error: null };
            else if (table === "svi_evidence") result = { count: 0, data: [] };
            else result = { data: [], error: null };
            return Promise.resolve(result).then(onF, onR);
          },
        };
        return chain;
      },
    };
  },
}));

import { GET } from "./route";
import { SVI_TREND_ALERT_THRESHOLD } from "@/lib/svi-trend-alert";

function req(auth?: string) {
  return new Request("http://localhost/api/cron/svi-snapshot", { headers: auth ? { authorization: auth } : {} });
}

const TODAY = new Date().toISOString().split("T")[0];

describe("svi-snapshot cron — svi_trend_alert writer", () => {
  const orig = process.env.CRON_SECRET;
  beforeEach(() => {
    process.env.CRON_SECRET = "s3cret";
    insertMock.mockClear();
    enqueueMock.mockClear();
    state.adminNull = false;
    state.upserts = [];
    state.accounts = [
      { id: "a-big", email: "big@x.co", user_id: "u-big", current_stage: 2, project_id: "p-big", index_base_date: "2026-01-01", index_base_svi: 50 },
      { id: "a-small", email: "small@x.co", user_id: "u-small", current_stage: 2, project_id: "p-small", index_base_date: "2026-01-01", index_base_svi: 50 },
      { id: "a-first", email: "first@x.co", user_id: "u-first", current_stage: 1, project_id: null, index_base_date: "2026-01-01", index_base_svi: 50 },
      { id: "a-nouser", email: "nouser@x.co", user_id: null, current_stage: 1, project_id: "p-nouser", index_base_date: "2026-01-01", index_base_svi: 50 },
    ];
    state.analyses = {
      "big@x.co": { total_svi: 66, analysis_json: { subs: [{ key: "ftv", value: 70 }] } },
      "small@x.co": { total_svi: 62, analysis_json: null },
      "first@x.co": { total_svi: 40, analysis_json: null },
      "nouser@x.co": { total_svi: 90, analysis_json: null },
    };
    state.priorSnapshot = {
      "a-big": { svi_total: 60 }, // +6 → fires
      "a-small": { svi_total: 60 }, // +2 → silent
      "a-first": null, // first snapshot → silent
      "a-nouser": { svi_total: 10 }, // +80 but no user_id → silent
    };
  });
  afterEach(() => {
    if (orig === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = orig;
  });

  it("401 without the bearer, 503 without Supabase", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("Bearer nope"))).status).toBe(401);
    state.adminNull = true;
    expect((await GET(req("Bearer s3cret"))).status).toBe(503);
  });

  it("writes one svi_trend_alert only for |delta| ≥ threshold with a user, and counts it", async () => {
    const r = await GET(req("Bearer s3cret"));
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body).toMatchObject({ ok: true, processed: 4, trend_alerts: 1, date: TODAY });

    expect(state.upserts).toHaveLength(4);
    expect(state.upserts[0]).toMatchObject({ account_id: "a-big", svi_total: 66, delta: 6, dimension_scores: { ftv: 70 } });

    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock.mock.calls[0][0]).toEqual({
      userId: "u-big",
      projectId: "p-big",
      kind: "svi_trend_alert",
      payload: { delta: 6, svi_total: 66, snapshot_date: TODAY, direction: "up" },
      dedupeKey: `svi_trend:p-big:${TODAY}`,
      throttleMs: 7 * 24 * 60 * 60 * 1000,
    });
    expect(SVI_TREND_ALERT_THRESHOLD).toBe(5);
  });

  it("S20-B: enqueues svi.rescored (source=snapshot) only for accounts whose score moved; first snapshot is silent", async () => {
    const body = await (await GET(req("Bearer s3cret"))).json();
    // a-big (+6), a-small (+2), a-nouser (+80) moved; a-first has no prior → no delta.
    expect(body.webhooks_queued).toBe(3);
    expect(enqueueMock).toHaveBeenCalledTimes(3);
    const calls = enqueueMock.mock.calls as unknown as Array<[string, string | null, Record<string, unknown>, Record<string, unknown>]>;
    expect(calls.map((c) => c[0])).toEqual(["svi.rescored", "svi.rescored", "svi.rescored"]);
    expect(calls[0][1]).toBe("p-big");
    expect(calls[0][2]).toEqual({
      project_id: "p-big",
      account_id: "a-big",
      svi_total: 66,
      previous_svi: 60,
      delta: 6,
      stage: 2,
      source: "snapshot",
      snapshot_date: TODAY,
    });
    expect(calls[0][3]).toEqual({ userIds: ["u-big"] });
    // No user_id → project-level endpoints only (owner resolved by the registry).
    expect(calls[2][1]).toBe("p-nouser");
    expect(calls[2][3]).toEqual({});
    expect(calls.some((c) => c[2].account_id === "a-first")).toBe(false);
  });

  it("a drop of exactly the threshold fires too", async () => {
    state.priorSnapshot["a-big"] = { svi_total: 71 }; // 66 - 71 = -5
    const body = await (await GET(req("Bearer s3cret"))).json();
    expect(body.trend_alerts).toBe(1);
    expect(insertMock.mock.calls[0][0]).toMatchObject({ payload: { delta: -5, direction: "down" } });
  });
});
