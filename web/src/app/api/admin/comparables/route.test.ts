// Colocated vitest for GET /api/admin/comparables and POST
// /api/admin/comparables/[id] (S-R5): 401 anonymous / 403 non-admin, the
// queue payload, approve with edits → verified + audit row, reject →
// rejected, 400 bad id / body, 404 unknown, 409 already decided.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/auth", async () => {
  const ctx = await import("@/lib/audit/context");
  return {
    ADMIN_EMAIL: "admin@blockid.au",
    getCurrentUser: async () => {
      const u = await mocks.getCurrentUser();
      if (u) ctx.setAuditActor({ userId: u.id, kind: "user", role: u.role });
      return u;
    },
  };
});
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => mocks.getSupabaseAdmin() }));

import { GET } from "./route";
import { POST as REVIEW } from "./[id]/route";
import { flushAudits, setAuditSink, type AuditRecord } from "@/lib/audit/api-route";
import type { ComparableRaiseRow } from "@/lib/valuation/comparables-repo";

const ADMIN = { id: "6452f5df-bb5b-4693-a0d9-61e556bb6572", email: "admin@blockid.au", role: "admin", plan: "admin" };
const USER = { id: "8b2c3d4e-0000-4000-8000-000000000003", email: "user@example.com", role: "user", plan: "free" };
const ROW_ID = "11111111-2222-4333-8444-555555555555";

function baseRow(p: Partial<ComparableRaiseRow> = {}): ComparableRaiseRow {
  return {
    id: ROW_ID,
    name: "Evatto",
    sector: "SaaS",
    stage: "pre-seed",
    round_date: "2026-09-16",
    round_label: "Pre-seed",
    amount_aud: 1_020_000,
    post_money_aud: null,
    arr_aud: null,
    arr_multiple: null,
    ebitda_multiple: null,
    founded_year: null,
    notable: false,
    note: "confidence 0.9",
    source_name: "startup-daily",
    source_url: "https://www.startupdaily.net/x",
    source_date: "2026-09-16",
    status: "pending",
    verified_by: null,
    verified_at: null,
    review_note: null,
    created_at: "2026-09-16T10:00:00Z",
    updated_at: "2026-09-16T10:00:00Z",
    ...p,
  };
}

function makeSb(initial: ComparableRaiseRow[]) {
  const rows = [...initial];
  const sb = {
    from: () => ({
      select: () => ({
        eq: (col: string, v: string) => ({
          order: () => ({ limit: async () => ({ data: rows.filter((r) => (r as unknown as Record<string, unknown>)[col] === v), error: null }) }),
          maybeSingle: async () => ({ data: rows.find((r) => (r as unknown as Record<string, unknown>)[col] === v) ?? null, error: null }),
        }),
      }),
      update: (patch: Record<string, unknown>) => ({
        eq: (_c: string, id: string) => ({
          select: () => ({
            maybeSingle: async () => {
              const i = rows.findIndex((r) => r.id === id);
              if (i < 0) return { data: null, error: null };
              rows[i] = { ...rows[i], ...(patch as Partial<ComparableRaiseRow>) };
              return { data: rows[i], error: null };
            },
          }),
        }),
      }),
    }),
  };
  return { sb, rows };
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });
function post(url: string, body?: unknown) {
  return new Request(url, { method: "POST", headers: body === undefined ? {} : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

let records: AuditRecord[];
beforeEach(() => {
  mocks.getCurrentUser.mockReset();
  mocks.getSupabaseAdmin.mockReset();
  records = [];
  setAuditSink(async (r) => {
    records.push(r);
  });
});
afterEach(() => setAuditSink(null));

describe("admin gate", () => {
  it("401 anonymous / 403 non-admin on GET and POST", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect((await REVIEW(post(`http://x/api/admin/comparables/${ROW_ID}`, { decision: "approve" }), params(ROW_ID))).status).toBe(401);
    mocks.getCurrentUser.mockResolvedValue(USER);
    expect((await GET()).status).toBe(403);
    expect((await REVIEW(post(`http://x/api/admin/comparables/${ROW_ID}`, { decision: "approve" }), params(ROW_ID))).status).toBe(403);
  });

  it("503 when Supabase is not configured", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.getSupabaseAdmin.mockReturnValue(null);
    expect((await GET()).status).toBe(503);
  });
});

describe("GET queue", () => {
  it("returns pending / verified / rejected + counts + the allow-listed sources", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.getSupabaseAdmin.mockReturnValue(makeSb([baseRow(), baseRow({ id: "22222222-2222-4333-8444-555555555555", status: "verified", arr_multiple: 9 })]).sb);
    const body = await json(await GET());
    expect(body.ok).toBe(true);
    expect((body.pending as unknown[]).length).toBe(1);
    expect(body.counts).toEqual({ pending: 1, verified: 1, rejected: 0, withMultiples: 1 });
    expect((body.sources as Array<{ id: string }>).map((s) => s.id)).toEqual(["startup-daily", "cut-through-venture", "asx"]);
  });
});

describe("POST review", () => {
  it("approve with edits → verified, reviewer stamped, audit row comparables.reviewed", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    const { sb, rows } = makeSb([baseRow()]);
    mocks.getSupabaseAdmin.mockReturnValue(sb);
    const res = await REVIEW(post(`http://x/api/admin/comparables/${ROW_ID}`, { decision: "approve", note: "source checked", edits: { sector: "HealthTech", post_money_aud: 20_000_000, arr_aud: 2_000_000 } }), params(ROW_ID));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.rollback).toBe(false);
    expect(rows[0]).toMatchObject({ status: "verified", sector: "HealthTech", arr_multiple: 10, verified_by: "admin@blockid.au", review_note: "source checked" });
    await flushAudits();
    const rec = records.find((r) => r.action === "comparables.reviewed");
    expect(rec).toBeTruthy();
    expect(rec?.resource_id).toBe(ROW_ID);
    expect(rec?.resource_type).toBe("au_comparable_raise");
    expect(rec?.detail.note).toMatchObject({ decision: "approve", company: "Evatto", edited: ["sector", "post_money_aud", "arr_aud"] });
  });

  it("reject → rejected; rejecting a verified row reports rollback", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    const { sb, rows } = makeSb([baseRow({ status: "verified" })]);
    mocks.getSupabaseAdmin.mockReturnValue(sb);
    const res = await REVIEW(post(`http://x/api/admin/comparables/${ROW_ID}`, { decision: "reject" }), params(ROW_ID));
    expect(res.status).toBe(200);
    expect((await json(res)).rollback).toBe(true);
    expect(rows[0].status).toBe("rejected");
  });

  it("400 bad id / invalid JSON / invalid body; 404 unknown; 409 already decided", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.getSupabaseAdmin.mockReturnValue(makeSb([baseRow({ status: "verified" })]).sb);
    expect((await REVIEW(post("http://x/api/admin/comparables/nope", { decision: "approve" }), params("nope"))).status).toBe(400);
    expect((await REVIEW(new Request(`http://x/api/admin/comparables/${ROW_ID}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{" }), params(ROW_ID))).status).toBe(400);
    const bad = await REVIEW(post(`http://x/api/admin/comparables/${ROW_ID}`, { decision: "approve", edits: { stage: "series-z" } }), params(ROW_ID));
    expect(bad.status).toBe(400);
    expect((await json(bad)).errors).toEqual([expect.stringMatching(/stage must be one of/)]);
    expect((await REVIEW(post("http://x/api/admin/comparables/99999999-2222-4333-8444-555555555555", { decision: "approve" }), params("99999999-2222-4333-8444-555555555555"))).status).toBe(404);
    expect((await REVIEW(post(`http://x/api/admin/comparables/${ROW_ID}`, { decision: "approve" }), params(ROW_ID))).status).toBe(409);
  });
});
