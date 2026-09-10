// Colocated vitest for POST /api/funding/report (T0242, signed-in rails).
//
// Pins:
//   1. 401 without a session; 400 on a bad intake.
//   2. Credits rail — canAfford(user, "grant_match") false → 402 with
//      creditsRequired + balance, and NOTHING is generated or spent.
//   3. Plan rail — can(user, "grant_finder") true bypasses canAfford and
//      spendCredits entirely; row is paid_via='plan', credits_cost 0.
//   4. Spend-before-ready (review 2026-09-10 #2) — the credits-rail row is
//      inserted `generating`, spendCredits runs tagged with the
//      funding_report_id, and only a successful spend flips it to `ready`;
//      spend failure → 402 + row marked spend_failed and NEVER ready.
//   5. project_id → ownership check (403) and project_grant_profiles upsert.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getCurrentUserMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));

const enforceRateLimitMock = vi.hoisted(() => vi.fn<(...a: unknown[]) => Response | null>());
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: (...a: unknown[]) => enforceRateLimitMock(...a) }));

const { canAffordMock, spendCreditsMock } = vi.hoisted(() => ({ canAffordMock: vi.fn(), spendCreditsMock: vi.fn() }));
vi.mock("@/lib/credits", () => ({
  canAfford: (u: string, f: string) => canAffordMock(u, f),
  spendCredits: (u: string, f: string, m?: unknown) => spendCreditsMock(u, f, m),
  FEATURE_COSTS: { grant_match: 3 },
}));

const canMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/entitlements", () => ({ can: (u: unknown, f: string) => canMock(u, f) }));

const getProjectByIdMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/projects", () => ({ getProjectById: (id: string) => getProjectByIdMock(id) }));

const { calls } = vi.hoisted(() => ({ calls: [] as Array<{ table: string; op: string; row: unknown }> }));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      const c: Record<string, unknown> = {};
      let op = "select";
      c.insert = (row: unknown) => {
        op = "insert";
        calls.push({ table, op, row });
        return c;
      };
      c.update = (row: unknown) => {
        op = "update";
        calls.push({ table, op, row });
        return c;
      };
      c.upsert = (row: unknown) => {
        op = "upsert";
        calls.push({ table, op, row });
        return c;
      };
      c.select = () => c;
      c.eq = (col: string, val: unknown) => {
        if (op === "update") calls[calls.length - 1].row = { ...(calls[calls.length - 1].row as object), [`__eq_${col}`]: val };
        return c;
      };
      c.single = () => c;
      c.then = (r: (v: unknown) => unknown) =>
        r(op === "insert" && table === "funding_reports" ? { data: { id: "rep-1" }, error: null } : { data: null, error: null });
      return c;
    },
  }),
}));

const { buildReportMock, countPaidMock } = vi.hoisted(() => ({ buildReportMock: vi.fn(), countPaidMock: vi.fn() }));
vi.mock("@/lib/funding/reports", () => ({
  buildReportFromIntake: (i: unknown, o: unknown) => {
    calls.push({ table: "-", op: "generate", row: o });
    return buildReportMock(i, o);
  },
  countPaidFundingReports: (u: string) => countPaidMock(u),
  newAccessToken: () => "tok_test",
  reportColumns: (r: { grants: unknown[] }) => ({ grant_matches: r.grants, status: "ready" }),
}));

import { GET, POST } from "./route";

const USER = { id: "user-1", plan: "free", email: "f@example.com" };
const GOOD = { description: "Soil sensors for grain farmers in regional NSW", state: "NSW", stage: "mvp" };

function req(body: unknown): Request {
  return new Request("http://x/api/funding/report", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  calls.length = 0;
  getCurrentUserMock.mockReset().mockResolvedValue(USER);
  enforceRateLimitMock.mockReset().mockReturnValue(null);
  canMock.mockReset().mockResolvedValue(false);
  canAffordMock.mockReset().mockResolvedValue({ allowed: true, balance: 10, cost: 3 });
  spendCreditsMock.mockReset().mockResolvedValue({ ok: true, balance: 7 });
  getProjectByIdMock.mockReset();
  countPaidMock.mockReset().mockResolvedValue(0);
  buildReportMock.mockReset().mockResolvedValue({
    grants: [{ ref_id: "g1" }],
    programs: [],
    timeline: [],
    summary: { grant_count: 1, program_count: 0, top_grants: ["x"], top_programs: [], total_amount_max_aud: 1, top_grants_amount_max_aud: 1, timeline_count: 0 },
  });
});

describe("POST /api/funding/report — gates", () => {
  it("401 without a session", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    expect((await POST(req(GOOD))).status).toBe(401);
    expect(buildReportMock).not.toHaveBeenCalled();
  });

  it("400 on a bad intake", async () => {
    const res = await POST(req({ ...GOOD, state: "NZ" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ field: "state" });
  });

  it("402 without credits — nothing generated, nothing spent", async () => {
    canAffordMock.mockResolvedValueOnce({ allowed: false, balance: 1, cost: 3, reason: "insufficient_credits" });
    const res = await POST(req(GOOD));
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ error: "insufficient_credits", creditsRequired: 3, balance: 1 });
    expect(canAffordMock).toHaveBeenCalledWith("user-1", "grant_match");
    expect(buildReportMock).not.toHaveBeenCalled();
    expect(spendCreditsMock).not.toHaveBeenCalled();
  });

  it("403 when the project is not the caller's", async () => {
    getProjectByIdMock.mockResolvedValueOnce({ id: "p1", userId: "someone-else" });
    const res = await POST(req({ ...GOOD, project_id: "p1" }));
    expect(res.status).toBe(403);
    expect(buildReportMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/funding/report — rails", () => {
  it("credits rail: generates with narrative, inserts the row as `generating`, spends 3 credits tagged with the report id, THEN flips it to ready", async () => {
    const res = await POST(req(GOOD));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, reportId: "rep-1", url: "/funding/report/rep-1", paidVia: "credits", creditsCharged: 3 });

    const ops = calls.map((c) => `${c.table}:${c.op}`);
    expect(ops.indexOf("-:generate")).toBeLessThan(ops.indexOf("funding_reports:insert"));
    expect((calls.find((c) => c.op === "generate")!.row as { withNarrative: boolean }).withNarrative).toBe(true);

    // #2: the row must not be readable (`ready`) before the spend has landed.
    const inserted = calls.find((c) => c.table === "funding_reports" && c.op === "insert")!.row as Record<string, unknown>;
    expect(inserted).toMatchObject({ user_id: "user-1", project_id: null, paid_via: "credits", credits_cost: 3, access_token: "tok_test", status: "generating" });
    expect(inserted.intake).toMatchObject({ state: "NSW", stage: "mvp" });

    // Spend happens after the insert and carries the row id.
    expect(spendCreditsMock).toHaveBeenCalledTimes(1);
    expect(spendCreditsMock.mock.calls[0][0]).toBe("user-1");
    expect(spendCreditsMock.mock.calls[0][1]).toBe("grant_match");
    expect(spendCreditsMock.mock.calls[0][2]).toMatchObject({ funding_report_id: "rep-1" });
    expect(spendCreditsMock.mock.invocationCallOrder[0]).toBeGreaterThan(buildReportMock.mock.invocationCallOrder[0]);

    // The `ready` flip is the LAST write, scoped to this row while still `generating`.
    const readyIdx = calls.findIndex((c) => c.table === "funding_reports" && c.op === "update" && (c.row as { status: string }).status === "ready");
    expect(readyIdx).toBeGreaterThan(calls.findIndex((c) => c.table === "funding_reports" && c.op === "insert"));
    expect(calls[readyIdx].row).toMatchObject({ status: "ready", __eq_id: "rep-1", __eq_status: "generating" });
  });

  it("plan rail: grant_finder entitlement bypasses canAfford + spendCredits; row is paid_via=plan", async () => {
    canMock.mockResolvedValueOnce(true);
    const res = await POST(req(GOOD));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ paidVia: "plan", creditsCharged: 0 });
    expect(canMock).toHaveBeenCalledWith(expect.objectContaining({ id: "user-1", plan: "free" }), "grant_finder");
    expect(canAffordMock).not.toHaveBeenCalled();
    expect(spendCreditsMock).not.toHaveBeenCalled();
    const inserted = calls.find((c) => c.table === "funding_reports" && c.op === "insert")!.row as Record<string, unknown>;
    expect(inserted).toMatchObject({ paid_via: "plan", credits_cost: 0, status: "ready" });
    expect(calls.filter((c) => c.table === "funding_reports" && c.op === "update")).toHaveLength(0);
  });

  it("spend failure after generation → 402 with credits_needed; the row goes spend_failed and is NEVER flipped to ready", async () => {
    spendCreditsMock.mockResolvedValueOnce({ ok: false, balance: 0 });
    const res = await POST(req(GOOD));
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ error: "credit_spend_failed", reportId: "rep-1", creditsRequired: 3, credits_needed: 3, balance: 0 });
    const updates = calls.filter((c) => c.table === "funding_reports" && c.op === "update").map((c) => (c.row as { status: string }).status);
    expect(updates).toEqual(["spend_failed"]);
    const inserted = calls.find((c) => c.table === "funding_reports" && c.op === "insert")!.row as Record<string, unknown>;
    expect(inserted.status).not.toBe("ready");
  });

  it("with an owned project_id the intake is persisted to project_grant_profiles", async () => {
    getProjectByIdMock.mockResolvedValueOnce({ id: "p1", userId: "user-1" });
    const res = await POST(req({ ...GOOD, project_id: "p1", women_led: true }));
    expect(res.status).toBe(200);
    const upsert = calls.find((c) => c.table === "project_grant_profiles" && c.op === "upsert")!.row as Record<string, unknown>;
    expect(upsert).toMatchObject({ project_id: "p1", state: "NSW", entity_type: "pty_ltd", founder_demographics: ["women_led"] });
    const inserted = calls.find((c) => c.table === "funding_reports" && c.op === "insert")!.row as Record<string, unknown>;
    expect(inserted.project_id).toBe("p1");
  });
});

// T0247 — the /funding paywall asks how many reports the user has paid for
// before showing the Founder Radar card after the third one.
describe("GET /api/funding/report — paid count", () => {
  it("401 without a session", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    expect((await GET()).status).toBe(401);
    expect(countPaidMock).not.toHaveBeenCalled();
  });

  it("returns the signed-in user's paid_count, private and uncached", async () => {
    countPaidMock.mockResolvedValueOnce(3);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, paid_count: 3 });
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(countPaidMock).toHaveBeenCalledWith("user-1");
  });
});
