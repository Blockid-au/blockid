// Unit tests for POST /api/esop/div83a-check — P6-div83a-check-route-test.
//
// The Div 83A check route is the auth-gated founder-facing entry point on top
// of the pure `checkDiv83A` lib (already covered by div83a-checker.test.ts).
// It anchors the P6_ausindustry_esic_gates track's "run the AU Startup
// Concession qualifier for a grant and cache the result on the row" surface —
// so a silent regression here (dropping the `esop.manage` gate, failing to
// enrich the project payload from the active project, letting a persist
// error 500 the whole tick, or forgetting to forward the checker's status
// into `updateDiv83AStatus` so the cached div83a_status stays stale) breaks
// the CHRO / ESOP dashboard the P6 exit criteria call out.
//
// Feature gate + supabase + projects lookup + checkDiv83A + esop-grants
// helpers are all mocked so the assertions pin pure route wiring — the
// checker itself, the grant row loader, and the div83a cache updater are
// each covered by their own colocated tests.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

// ── Feature gate ────────────────────────────────────────────
const gateMock = vi.fn();
vi.mock("@/lib/feature-gate", () => ({
  gateRequireFeature: (feature: string) => gateMock(feature),
}));

// ── Supabase admin ──────────────────────────────────────────
type ProjRow = { industry?: string | null; stage?: string | null } | null;
type InsertReply = { error: { message: string } | null };

const projectsMaybeSingleMock = vi.fn<() => Promise<{ data: ProjRow }>>();
const projectsEqMock = vi.fn((_col: string, _val: unknown) => ({
  maybeSingle: () => projectsMaybeSingleMock(),
}));
const projectsSelectMock = vi.fn((_cols: string) => ({
  eq: (col: string, val: unknown) => projectsEqMock(col, val),
}));

const insertMock = vi.fn<(payload: Record<string, unknown>) => Promise<InsertReply>>();

const fromMock = vi.fn((table: string) => {
  if (table === "projects") return { select: (cols: string) => projectsSelectMock(cols) };
  if (table === "esop_option_div83a_checks") {
    return { insert: (payload: Record<string, unknown>) => insertMock(payload) };
  }
  throw new Error(`unexpected table: ${table}`);
});

type SupabaseFake = { from: typeof fromMock } | null;
const getSupabaseAdminMock = vi.fn<() => SupabaseFake>(() => ({ from: fromMock }));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

// ── Project resolver ────────────────────────────────────────
const getProjectIdFromRequestMock = vi.fn<() => Promise<string | null>>();
vi.mock("@/lib/projects", () => ({
  getProjectIdFromRequest: () => getProjectIdFromRequestMock(),
}));

// ── Div83A checker (lib) ────────────────────────────────────
type Div83ACheckResult = {
  status: "eligible" | "ineligible" | "unsure";
  criteria: Array<Record<string, unknown>>;
  guidance: string;
  qualifying_tests: Record<string, unknown>;
};

const checkDiv83AMock = vi.fn<
  (grant: unknown, project: unknown, ownership: unknown) => Div83ACheckResult
>();
vi.mock("@/lib/div83a-checker", () => ({
  checkDiv83A: (grant: unknown, project: unknown, ownership: unknown) =>
    checkDiv83AMock(grant, project, ownership),
  DIV83A_DISCLAIMER:
    "General information only. Not legal or tax advice. Confirm eligibility with a registered tax agent.",
}));

// ── ESOP grants lib ─────────────────────────────────────────
type GrantFixture = {
  id: string;
  userId: string;
  grantDate: string;
  strikePriceAud: number;
  vestingYears: number;
  cliffMonths: number;
};

const getGrantMock = vi.fn<(id: string, userId: string) => Promise<GrantFixture | null>>();
const updateDiv83AStatusMock = vi.fn<
  (id: string, userId: string, status: string) => Promise<boolean>
>();
vi.mock("@/lib/esop-grants", () => ({
  getGrant: (id: string, userId: string) => getGrantMock(id, userId),
  updateDiv83AStatus: (id: string, userId: string, status: string) =>
    updateDiv83AStatusMock(id, userId, status),
}));

import { POST } from "./route";

// ── Fixtures & helpers ──────────────────────────────────────
const USER = { id: "u-42", email: "founder@x.co" };

function gateOk(user: { id: string; email: string }) {
  return {
    ok: true,
    user,
    uwp: { id: user.id, plan: "free", segment: "founder" },
  };
}

function gateFail(status: number, body: Record<string, unknown>) {
  return {
    ok: false,
    response: NextResponse.json(body, { status }),
  };
}

function grantFixture(overrides: Partial<GrantFixture> = {}): GrantFixture {
  return {
    id: "g-1",
    userId: USER.id,
    grantDate: "2026-01-15",
    strikePriceAud: 0.01,
    vestingYears: 4,
    cliffMonths: 12,
    ...overrides,
  };
}

function checkResult(overrides: Partial<Div83ACheckResult> = {}): Div83ACheckResult {
  return {
    status: "eligible",
    criteria: [{ key: "esic_eligible", label: "ESIC", met: true, evidence: "" }],
    guidance: "All criteria satisfied.",
    qualifying_tests: {
      test_1_startup: { passed: true, reason: "s83A-33 met" },
      all_passed: true,
      concession_available: true,
    },
    ...overrides,
  };
}

function req(body: unknown, opts: { rawBody?: string } = {}): Request {
  const init: RequestInit = { method: "POST" };
  if (opts.rawBody != null) {
    init.body = opts.rawBody;
  } else {
    init.body = JSON.stringify(body);
    init.headers = { "content-type": "application/json" };
  }
  return new Request("http://x/api/esop/div83a-check", init);
}

beforeEach(() => {
  gateMock.mockReset();
  getSupabaseAdminMock.mockReset();
  getSupabaseAdminMock.mockReturnValue({ from: fromMock });
  fromMock.mockClear();
  projectsSelectMock.mockClear();
  projectsEqMock.mockClear();
  projectsMaybeSingleMock.mockReset();
  projectsMaybeSingleMock.mockResolvedValue({ data: null });
  insertMock.mockReset();
  insertMock.mockResolvedValue({ error: null });
  getProjectIdFromRequestMock.mockReset();
  getProjectIdFromRequestMock.mockResolvedValue(null);
  checkDiv83AMock.mockReset();
  checkDiv83AMock.mockReturnValue(checkResult());
  getGrantMock.mockReset();
  updateDiv83AStatusMock.mockReset();
  updateDiv83AStatusMock.mockResolvedValue(true);
});

describe("POST /api/esop/div83a-check", () => {
  it("gates on the `esop.manage` feature", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    getGrantMock.mockResolvedValue(grantFixture());
    await POST(req({ grantId: "g-1" }));
    expect(gateMock).toHaveBeenCalledTimes(1);
    expect(gateMock).toHaveBeenCalledWith("esop.manage");
  });

  it("401s when the feature gate rejects (anonymous caller) — no grant lookup or persist", async () => {
    gateMock.mockResolvedValue(
      gateFail(401, { ok: false, error: "Authentication required" }),
    );
    const res = await POST(req({ grantId: "g-1" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "Authentication required" });
    expect(getGrantMock).not.toHaveBeenCalled();
    expect(checkDiv83AMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
    expect(updateDiv83AStatusMock).not.toHaveBeenCalled();
  });

  it("402 feature_locked short-circuits identically (no lookup / no persist)", async () => {
    gateMock.mockResolvedValue(
      gateFail(402, { ok: false, error: "feature_locked", feature: "esop.manage" }),
    );
    const res = await POST(req({ grantId: "g-1" }));
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toBe("feature_locked");
    expect(getGrantMock).not.toHaveBeenCalled();
    expect(checkDiv83AMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("400s when the request body is unparseable JSON — treats body as {}", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    const res = await POST(req(null, { rawBody: "not-json" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "grantId is required" });
    expect(getGrantMock).not.toHaveBeenCalled();
  });

  it("400s when `grantId` is missing from the body", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    const res = await POST(req({ project: {} }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "grantId is required" });
    expect(getGrantMock).not.toHaveBeenCalled();
  });

  it("400s when `grantId` is not a string (e.g. numeric) — non-string coerces to null via typeof guard", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    const res = await POST(req({ grantId: 42 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("grantId is required");
    expect(getGrantMock).not.toHaveBeenCalled();
  });

  it("404s when `getGrant` returns null — user.id is forwarded to the loader", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    getGrantMock.mockResolvedValue(null);
    const res = await POST(req({ grantId: "g-missing" }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "Grant not found" });
    expect(getGrantMock).toHaveBeenCalledWith("g-missing", USER.id);
    expect(checkDiv83AMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
    expect(updateDiv83AStatusMock).not.toHaveBeenCalled();
  });

  it("forwards grant fields, body.project, and ownership pct into `checkDiv83A`", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    const grant = grantFixture({
      grantDate: "2026-03-01",
      strikePriceAud: 0.05,
      vestingYears: 3,
      cliffMonths: 6,
    });
    getGrantMock.mockResolvedValue(grant);
    const projectPayload = { hasEsicRuling: true, isListed: false };
    await POST(
      req({
        grantId: grant.id,
        project: projectPayload,
        granteePostGrantOwnershipPct: 4.5,
      }),
    );
    expect(checkDiv83AMock).toHaveBeenCalledTimes(1);
    const [grantArg, projectArg, ownershipArg] = checkDiv83AMock.mock.calls[0];
    expect(grantArg).toEqual({
      grantDate: "2026-03-01",
      strikePriceAud: 0.05,
      vestingYears: 3,
      cliffMonths: 6,
    });
    expect(projectArg).toEqual(projectPayload);
    expect(ownershipArg).toBe(4.5);
  });

  it("defaults projectPayload to {} when body.project is omitted", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    getGrantMock.mockResolvedValue(grantFixture());
    await POST(req({ grantId: "g-1" }));
    const [, projectArg] = checkDiv83AMock.mock.calls[0];
    expect(projectArg).toEqual({});
  });

  it("passes ownership as undefined when granteePostGrantOwnershipPct is not a number", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    getGrantMock.mockResolvedValue(grantFixture());
    await POST(req({ grantId: "g-1", granteePostGrantOwnershipPct: "9.9" }));
    const [, , ownershipArg] = checkDiv83AMock.mock.calls[0];
    expect(ownershipArg).toBeUndefined();
  });

  it("queries the projects row (industry, stage) when supabase + projectId are both available", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    getGrantMock.mockResolvedValue(grantFixture());
    getProjectIdFromRequestMock.mockResolvedValue("proj-abc");
    projectsMaybeSingleMock.mockResolvedValue({
      data: { industry: "fintech", stage: "seed" },
    });
    await POST(req({ grantId: "g-1" }));
    expect(fromMock).toHaveBeenCalledWith("projects");
    expect(projectsSelectMock).toHaveBeenCalledWith("industry, stage");
    expect(projectsEqMock).toHaveBeenCalledWith("id", "proj-abc");
    expect(projectsMaybeSingleMock).toHaveBeenCalledTimes(1);
  });

  it("skips the projects enrichment query when no active project is resolved", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    getGrantMock.mockResolvedValue(grantFixture());
    getProjectIdFromRequestMock.mockResolvedValue(null);
    await POST(req({ grantId: "g-1" }));
    // Only the persist insert should hit .from — no projects lookup.
    expect(fromMock).not.toHaveBeenCalledWith("projects");
    expect(projectsMaybeSingleMock).not.toHaveBeenCalled();
  });

  it("persists the checker result into esop_option_div83a_checks and updates the cached div83a status", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    const grant = grantFixture({ id: "g-persist" });
    getGrantMock.mockResolvedValue(grant);
    const result = checkResult({ status: "ineligible", guidance: "Fails s83A-33." });
    checkDiv83AMock.mockReturnValue(result);
    await POST(req({ grantId: grant.id }));
    expect(fromMock).toHaveBeenCalledWith("esop_option_div83a_checks");
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledWith({
      grant_id: grant.id,
      status: "ineligible",
      criteria: result.criteria,
      guidance: result.guidance,
    });
    expect(updateDiv83AStatusMock).toHaveBeenCalledWith(grant.id, USER.id, "ineligible");
  });

  it("swallows a persist insert error — still returns 200 and still updates the div83a cache", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    getGrantMock.mockResolvedValue(grantFixture());
    insertMock.mockResolvedValue({ error: { message: "table full" } });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(req({ grantId: "g-1" }));
    expect(res.status).toBe(200);
    expect(updateDiv83AStatusMock).toHaveBeenCalledTimes(1);
    errSpy.mockRestore();
  });

  it("skips the persist branch entirely when getSupabaseAdmin returns null (graceful degrade)", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    getSupabaseAdminMock.mockReturnValue(null);
    getGrantMock.mockResolvedValue(grantFixture());
    getProjectIdFromRequestMock.mockResolvedValue("proj-abc");
    const res = await POST(req({ grantId: "g-1" }));
    expect(res.status).toBe(200);
    expect(fromMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
    expect(updateDiv83AStatusMock).not.toHaveBeenCalled();
  });

  it("returns the checker result envelope { ok, grantId, status, criteria, guidance, qualifying_tests, disclaimer }", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    const grant = grantFixture({ id: "g-envelope" });
    getGrantMock.mockResolvedValue(grant);
    const result = checkResult({ status: "unsure", guidance: "Confirm ESIC." });
    checkDiv83AMock.mockReturnValue(result);
    const res = await POST(req({ grantId: grant.id }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      grantId: grant.id,
      status: "unsure",
      criteria: result.criteria,
      guidance: "Confirm ESIC.",
      qualifying_tests: result.qualifying_tests,
      disclaimer:
        "General information only. Not legal or tax advice. Confirm eligibility with a registered tax agent.",
    });
  });
});
