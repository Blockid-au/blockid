// Colocated vitest for GET + POST /api/admin/sector-multiples and the
// approve / reject sub-routes (S27-C).
//
//   - 401 anonymous, 403 non-admin on every handler
//   - GET: the queue + side-by-side table (static vs in force)
//   - POST: manual proposal → status=proposed, proposed_by=admin, caller id
//     stamped, audit row `sector_multiples.proposed`; 400 on a bad body;
//     409 on the unique-index collision
//   - approve: flips proposed → approved (approved_by = caller) and records
//     the `sector_multiples.approved` audit row with same_admin; 409 twice
//   - reject: proposed → rejected; approved → rejected flagged as rollback

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

import { GET, POST } from "./route";
import { POST as APPROVE } from "./[id]/approve/route";
import { POST as REJECT } from "./[id]/reject/route";
import { flushAudits, setAuditSink, type AuditRecord } from "@/lib/audit/api-route";
import type { SectorMultipleOverride } from "@/lib/valuation/sector-multiples";

const ADMIN = { id: "6452f5df-bb5b-4693-a0d9-61e556bb6572", email: "admin@blockid.au", role: "admin", plan: "admin" };
const ADMIN2 = { id: "7a1b2c3d-0000-4000-8000-000000000002", email: "ops@blockid.au", role: "admin", plan: "admin" };
const USER = { id: "8b2c3d4e-0000-4000-8000-000000000003", email: "user@example.com", role: "user", plan: "free" };
const ROW_ID = "11111111-2222-4333-8444-555555555555";

function baseRow(p: Partial<SectorMultipleOverride> = {}): SectorMultipleOverride {
  return {
    id: ROW_ID,
    sector: "saas",
    arr_low: 6.5,
    arr_mid: 7.4,
    arr_high: 8.2,
    effective_from: "2026-10-01",
    source_url: "https://www.saas-capital.com/the-saas-capital-index/",
    source_title: "SaaS Capital Index",
    source_published_at: "2026-09-30",
    source_excerpt: "the SaaS Capital Index median EV/ARR multiple was 7.4x",
    status: "proposed",
    proposed_by: "cron",
    proposed_by_user_id: null,
    approved_by: null,
    approved_at: null,
    rejected_at: null,
    review_note: null,
    created_at: "2026-10-01T03:00:00Z",
    ...p,
  };
}

/** In-memory table with the query shapes the routes + review helper use. */
function makeSb(initial: SectorMultipleOverride[], opts: { insertError?: { code?: string; message: string } } = {}) {
  const rows = [...initial];
  const state = { rows, inserted: [] as Record<string, unknown>[] };
  function listBuilder(filter: (r: SectorMultipleOverride) => boolean) {
    const b = {
      eq: (col: string, val: string) => listBuilder((r) => filter(r) && (r as unknown as Record<string, unknown>)[col] === val),
      order: () => b,
      limit: async () => ({ data: rows.filter(filter), error: null }),
      maybeSingle: async () => ({ data: rows.find(filter) ?? null, error: null }),
    };
    return b;
  }
  const sb = {
    from: () => ({
      select: () => listBuilder(() => true),
      insert: (row: Record<string, unknown>) => ({
        select: () => ({
          maybeSingle: async () => {
            if (opts.insertError) return { data: null, error: opts.insertError };
            const created = { ...baseRow(), ...row, id: ROW_ID, created_at: "2026-09-13T00:00:00Z" } as SectorMultipleOverride;
            rows.push(created);
            state.inserted.push(row);
            return { data: created, error: null };
          },
        }),
      }),
      update: (patch: Record<string, unknown>) => ({
        eq: (_c: string, id: string) => ({
          eq: (_s: string, status: string) => ({
            select: () => ({
              maybeSingle: async () => {
                const i = rows.findIndex((r) => r.id === id && r.status === status);
                if (i < 0) return { data: null, error: null };
                rows[i] = { ...rows[i], ...(patch as Partial<SectorMultipleOverride>) };
                return { data: rows[i], error: null };
              },
            }),
          }),
        }),
      }),
    }),
  };
  return { sb, state };
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });
function post(url: string, body?: unknown) {
  return new Request(url, {
    method: "POST",
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
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

const GOOD_BODY = {
  sector: "saas",
  arr_low: 6.5,
  arr_mid: 7.4,
  arr_high: 8.2,
  source_url: "https://www.saas-capital.com/the-saas-capital-index/",
  source_title: "SaaS Capital Index",
  source_published_at: "2026-09-30",
  source_excerpt: "the SaaS Capital Index median EV/ARR multiple was 7.4x",
};

describe("admin gate — 401 anonymous / 403 non-admin on every handler", () => {
  it.each([
    ["GET", () => GET()],
    ["POST", () => POST(post("http://x/api/admin/sector-multiples", GOOD_BODY))],
    ["approve", () => APPROVE(post(`http://x/api/admin/sector-multiples/${ROW_ID}/approve`), params(ROW_ID))],
    ["reject", () => REJECT(post(`http://x/api/admin/sector-multiples/${ROW_ID}/reject`), params(ROW_ID))],
  ])("%s", async (_name, call) => {
    mocks.getSupabaseAdmin.mockReturnValue(makeSb([baseRow()]).sb);
    mocks.getCurrentUser.mockResolvedValue(null);
    const anon = await call();
    expect(anon.status).toBe(401);
    expect((await json(anon)).reason).toBe("no_user");

    mocks.getCurrentUser.mockResolvedValue(USER);
    const user = await call();
    expect(user.status).toBe(403);
    expect((await json(user)).reason).toBe("not_admin");
  });
});

describe("GET /api/admin/sector-multiples", () => {
  it("returns the queue, the approved rows and the static-vs-current table; 503 without Supabase", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.getSupabaseAdmin.mockReturnValue(null);
    expect((await GET()).status).toBe(503);

    const approved = baseRow({ id: "22222222-2222-4333-8444-555555555555", status: "approved", approved_by: ADMIN2.id, approved_at: "2026-09-01T00:00:00Z", effective_from: "2026-09-01" });
    mocks.getSupabaseAdmin.mockReturnValue(makeSb([baseRow(), approved]).sb);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await json(res)) as { proposed: SectorMultipleOverride[]; approved: SectorMultipleOverride[]; current: Array<{ sector: string; static: { mid: number }; current: { sourceKind: string; mid: number } }>; sources: unknown[] };
    expect(body.proposed.map((r) => r.id)).toEqual([ROW_ID]);
    expect(body.approved.map((r) => r.id)).toEqual([approved.id]);
    const saas = body.current.find((c) => c.sector === "saas")!;
    expect(saas.static.mid).toBe(6.75);
    expect(saas.current).toMatchObject({ sourceKind: "override", mid: 7.4 });
    expect(body.current.find((c) => c.sector === "fintech")!.current.sourceKind).toBe("static");
    expect(body.sources.length).toBeGreaterThan(0);
  });
});

describe("POST /api/admin/sector-multiples — manual proposal", () => {
  it("inserts status=proposed / proposed_by=admin with the caller stamped and audits sector_multiples.proposed", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    const { sb, state } = makeSb([]);
    mocks.getSupabaseAdmin.mockReturnValue(sb);
    const res = await POST(post("http://x/api/admin/sector-multiples", GOOD_BODY));
    expect(res.status).toBe(201);
    expect(state.inserted[0]).toMatchObject({ sector: "saas", arr_mid: 7.4, status: "proposed", proposed_by: "admin", proposed_by_user_id: ADMIN.id });
    expect(state.inserted[0]).not.toHaveProperty("approved_by");
    await flushAudits();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ action: "sector_multiples.proposed", resource_type: "sector_multiples_override", resource_id: ROW_ID, user_id: ADMIN.id });
    expect(records[0].detail.note).toMatchObject({ sector: "saas", proposed_by: "admin" });
  });

  it("400 on a bad body (reason invalid_proposal + the field error), 409 on a duplicate open proposal", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.getSupabaseAdmin.mockReturnValue(makeSb([]).sb);
    const bad = await POST(post("http://x/api/admin/sector-multiples", { ...GOOD_BODY, source_excerpt: "short" }));
    expect(bad.status).toBe(400);
    expect(await json(bad)).toMatchObject({ reason: "invalid_proposal", error: "bad_excerpt" });
    const notJson = await POST(new Request("http://x/api/admin/sector-multiples", { method: "POST", headers: { "content-type": "application/json" }, body: "{" }));
    expect(notJson.status).toBe(400);

    mocks.getSupabaseAdmin.mockReturnValue(makeSb([], { insertError: { code: "23505", message: "dup" } }).sb);
    const dup = await POST(post("http://x/api/admin/sector-multiples", GOOD_BODY));
    expect(dup.status).toBe(409);
  });
});

describe("POST …/[id]/approve", () => {
  it("flips proposed → approved with approved_by = caller and audits sector_multiples.approved (same_admin false for a cron row)", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    const { sb, state } = makeSb([baseRow()]);
    mocks.getSupabaseAdmin.mockReturnValue(sb);
    const res = await APPROVE(post(`http://x/api/admin/sector-multiples/${ROW_ID}/approve`, { note: "checked" }), params(ROW_ID));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.sameAdmin).toBe(false);
    expect(state.rows[0]).toMatchObject({ status: "approved", approved_by: ADMIN.id, review_note: "checked" });
    expect(state.rows[0].approved_at).toBeTruthy();
    await flushAudits();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ action: "sector_multiples.approved", resource_id: ROW_ID, user_id: ADMIN.id });
    expect(records[0].detail.status).toBe(200);
    expect(records[0].detail.note).toMatchObject({ sector: "saas", same_admin: false, proposed_by: "cron", source_url: GOOD_BODY.source_url });

    // Second press → 409, still audited (with its status).
    const again = await APPROVE(post(`http://x/api/admin/sector-multiples/${ROW_ID}/approve`), params(ROW_ID));
    expect(again.status).toBe(409);
    expect((await json(again)).reason).toBe("already_approved");
    await flushAudits();
    expect(records[1].detail.status).toBe(409);
  });

  it("same-admin approval of an admin proposal is allowed and flagged in the audit note", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.getSupabaseAdmin.mockReturnValue(makeSb([baseRow({ proposed_by: "admin", proposed_by_user_id: ADMIN.id })]).sb);
    const res = await APPROVE(post(`http://x/api/admin/sector-multiples/${ROW_ID}/approve`), params(ROW_ID));
    expect(res.status).toBe(200);
    expect((await json(res)).sameAdmin).toBe(true);
    await flushAudits();
    expect(records[0].detail.note).toMatchObject({ same_admin: true, proposed_by: "admin" });
  });

  it("400 bad id, 404 unknown row, 503 without Supabase", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.getSupabaseAdmin.mockReturnValue(makeSb([]).sb);
    expect((await APPROVE(post("http://x/api/admin/sector-multiples/nope/approve"), params("nope"))).status).toBe(400);
    expect((await APPROVE(post(`http://x/api/admin/sector-multiples/${ROW_ID}/approve`), params(ROW_ID))).status).toBe(404);
    mocks.getSupabaseAdmin.mockReturnValue(null);
    expect((await APPROVE(post(`http://x/api/admin/sector-multiples/${ROW_ID}/approve`), params(ROW_ID))).status).toBe(503);
  });
});

describe("POST …/[id]/reject", () => {
  it("proposed → rejected (audit sector_multiples.rejected, rollback false)", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    const { sb, state } = makeSb([baseRow()]);
    mocks.getSupabaseAdmin.mockReturnValue(sb);
    const res = await REJECT(post(`http://x/api/admin/sector-multiples/${ROW_ID}/reject`, { note: "stale page" }), params(ROW_ID));
    expect(res.status).toBe(200);
    expect((await json(res)).previousStatus).toBe("proposed");
    expect(state.rows[0]).toMatchObject({ status: "rejected", review_note: "stale page" });
    expect(state.rows[0].rejected_at).toBeTruthy();
    await flushAudits();
    expect(records[0]).toMatchObject({ action: "sector_multiples.rejected", resource_id: ROW_ID });
    expect(records[0].detail.note).toMatchObject({ previous_status: "proposed", rollback: false });
  });

  it("approved → rejected is the rollback and says so; a rejected row cannot be rejected again", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN2);
    const { sb } = makeSb([baseRow({ status: "approved", approved_by: ADMIN.id, approved_at: "2026-10-02T00:00:00Z" })]);
    mocks.getSupabaseAdmin.mockReturnValue(sb);
    const res = await REJECT(post(`http://x/api/admin/sector-multiples/${ROW_ID}/reject`), params(ROW_ID));
    expect(res.status).toBe(200);
    expect((await json(res)).previousStatus).toBe("approved");
    await flushAudits();
    expect(records[0].detail.note).toMatchObject({ previous_status: "approved", rollback: true });
    const again = await REJECT(post(`http://x/api/admin/sector-multiples/${ROW_ID}/reject`), params(ROW_ID));
    expect(again.status).toBe(409);
  });
});
