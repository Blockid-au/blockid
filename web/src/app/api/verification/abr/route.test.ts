// Colocated vitest for POST /api/verification/abr — P9-verification-abr-route-test.
//
// The route is the Business-ID first-class ABR re-verification entry point
// (Master Upgrade Plan §11.1 / atlassian-standard-mapping-goal P1g). A signed-in
// owner submits a business uuid + ABN; the route confirms ownership, calls the
// ABR web-services adapter, recomputes the verification ladder via the pure
// level-engine, and stamps `projects.verification_level` + `last_verified_at`.
//
// Silent regressions this suite pins against:
//
//   - Dropping the auth guard — anon caller triggers ABR lookups + audit rows
//     against another founder's business by guessing a uuid.
//   - Losing the JSON-parse `catch` so a text/plain body 500s instead of the
//     documented { ok:false, reason:"Invalid JSON body" } at 400.
//   - Regressing the businessId uuid regex so a non-uuid short-circuits into
//     a full Supabase round-trip.
//   - Regressing the ABN digit-strip so ABN's with spaces/hyphens 400 instead
//     of being normalised to 11 digits before validation.
//   - Regressing the ownership `.eq("id", businessId)` → `.maybeSingle()`
//     shape so the project lookup no longer scopes to the caller's business.
//   - Regressing the ownership guard (`project.user_id !== user.id`) — a caller
//     would verify + audit + stamp another founder's business.
//   - Regressing the projErr → 500 branch so a Supabase RLS-denied fetch is
//     swallowed and the founder sees a 404 for a business they DO own.
//   - Regressing the idempotency guard (in-memory Map keyed on
//     userId::businessId::abn::UTC-day) — a founder mashing the button would
//     spam the ABR endpoint + audit log.
//   - Regressing the idempotency-key set-BEFORE-lookup ordering — a failing
//     ABR call would leak the daily slot and let the founder retry the same
//     lookup any number of times per UTC day.
//   - Regressing the lookupAbn-null branch so an ABR outage / unknown ABN
//     causes a 500 instead of the documented soft { ok:false,
//     reason:"abr_lookup_failed_or_unknown" }.
//   - Regressing the computeVerificationLevel call shape so a successful
//     Active-ABN lookup silently jumps to L3+ (the route intentionally holds
//     domainVerified=false + financialsAttested=false so the max granted here
//     is L1 until the follow-up readVerificationInputs() helper lands).
//   - Regressing the abrStatus passthrough so a Cancelled ABN is written as
//     an Active one (which would then compute a higher level).
//   - Regressing the projects UPDATE shape so verification_level or
//     last_verified_at columns drift off the migration contract.
//   - Regressing the updateErr → 500 branch so a write failure silently 200s
//     and the founder-facing UI shows "verified" against a stale row.
//   - Losing the logUserAction call so the SOC2-lite audit trail loses the
//     `verification.abr_lookup` event that AusIndustry ESIC evidence packs
//     rely on.
//   - Regressing the audit-fields shape so the abn / abr_status / entity_type
//     / verification_level / source columns drift off the analytics-events
//     schema.
//   - Regressing the extractIp / extractUserAgent header wiring so audit
//     rows lose the caller's IP + UA (which the SOC2-lite trail requires
//     for repudiation).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Types --------------------------------------------------------------

interface AppUser {
  id: string;
  email: string;
}

interface ProjectRow {
  id: string;
  user_id: string;
}

interface AbrResult {
  abn: string;
  entityName: string;
  entityType: string;
  status: "Active" | "Cancelled";
  effectiveFrom: string;
  gstRegistered: boolean;
  postcode?: string;
  state?: string;
  source: "abr_web_services" | "stub";
}

interface CapturedCall {
  table: string;
  op: "select" | "update";
  payload?: Record<string, unknown>;
  filters: Array<{ col: string; val: unknown }>;
}

interface FakeSupabaseState {
  project: ProjectRow | null;
  projectErr: { code?: string; message: string } | null;
  updateErr: { code?: string; message: string } | null;
  calls: CapturedCall[];
}

// --- Mocks (registered BEFORE route import) -------------------------------

const mocks = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn<() => Promise<AppUser | null>>(),
  getSupabaseAdminMock: vi.fn<() => unknown | null>(),
  lookupAbnMock: vi.fn<(abn: string) => Promise<AbrResult | null>>(),
  logUserActionMock: vi.fn<(input: Record<string, unknown>) => Promise<unknown>>(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => mocks.getCurrentUserMock(),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => mocks.getSupabaseAdminMock(),
}));

vi.mock("@/lib/verification/abr-adapter", () => ({
  lookupAbn: (abn: string) => mocks.lookupAbnMock(abn),
}));

// The route imports { extractIp, extractUserAgent, logUserAction } from the
// same module — mock all three. extractIp/extractUserAgent keep the real
// x-forwarded-for / user-agent behaviour so the audit-fields assertions
// exercise the wiring end-to-end.
vi.mock("@/lib/audit/log", () => ({
  logUserAction: (input: Record<string, unknown>) => mocks.logUserActionMock(input),
  extractIp: (headers: Headers): string | null => {
    const xff = headers.get("x-forwarded-for");
    if (xff) {
      const first = xff.split(",")[0]?.trim();
      if (first) return first;
    }
    const real = headers.get("x-real-ip");
    return real ? real.trim() : null;
  },
  extractUserAgent: (headers: Headers): string | null => {
    const ua = headers.get("user-agent");
    return ua ? ua.slice(0, 500) : null;
  },
}));

import { POST, _resetIdempotencyGuard } from "./route";

// --- Helpers --------------------------------------------------------------

function makeFakeSupabase(): { client: unknown; state: FakeSupabaseState } {
  const state: FakeSupabaseState = {
    project: null,
    projectErr: null,
    updateErr: null,
    calls: [],
  };
  const client = {
    from(table: string) {
      return {
        select(_cols: string) {
          const filters: Array<{ col: string; val: unknown }> = [];
          state.calls.push({ table, op: "select", filters });
          const chain = {
            eq(col: string, val: unknown) {
              filters.push({ col, val });
              return chain;
            },
            async maybeSingle() {
              return { data: state.project, error: state.projectErr };
            },
          };
          return chain;
        },
        update(payload: Record<string, unknown>) {
          const filters: Array<{ col: string; val: unknown }> = [];
          state.calls.push({ table, op: "update", payload, filters });
          const chain = {
            eq(col: string, val: unknown) {
              filters.push({ col, val });
              return Promise.resolve({ error: state.updateErr });
            },
          };
          return chain;
        },
      };
    },
  };
  return { client, state };
}

const UUID_A = "11111111-2222-3333-4444-555555555555";
const UUID_B = "22222222-3333-4444-5555-666666666666";
const USER_A = "user-a";
const USER_B = "user-b";
const ABN_11 = "12345678901";

function jsonPost(
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request("http://localhost/api/verification/abr", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function rawPost(text: string): Request {
  return new Request("http://localhost/api/verification/abr", {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: text,
  });
}

function activeAbrResult(overrides: Partial<AbrResult> = {}): AbrResult {
  return {
    abn: ABN_11,
    entityName: "Auschain PTY LTD",
    entityType: "Australian Private Company",
    status: "Active",
    effectiveFrom: "2022-04-01",
    gstRegistered: true,
    postcode: "2000",
    state: "NSW",
    source: "abr_web_services",
    ...overrides,
  };
}

beforeEach(() => {
  mocks.getCurrentUserMock.mockReset();
  mocks.getSupabaseAdminMock.mockReset();
  mocks.lookupAbnMock.mockReset();
  mocks.logUserActionMock.mockReset();
  mocks.logUserActionMock.mockResolvedValue({ ok: true });
  _resetIdempotencyGuard();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// --------------------------------------------------------------------------
describe("POST /api/verification/abr — auth + body validation", () => {
  it("returns 401 when unauthenticated — anon must never trigger an ABR lookup", async () => {
    mocks.getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(jsonPost({ businessId: UUID_A, abn: ABN_11 }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      ok: false,
      reason: "Authentication required",
    });
    // Neither supabase nor the ABR adapter must be touched on the 401 path.
    expect(mocks.getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(mocks.lookupAbnMock).not.toHaveBeenCalled();
    expect(mocks.logUserActionMock).not.toHaveBeenCalled();
  });

  it("returns 400 { reason: 'Invalid JSON body' } when the body is not JSON", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: USER_A, email: "f@x.com" });
    const res = await POST(rawPost("not-json"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, reason: "Invalid JSON body" });
    expect(mocks.lookupAbnMock).not.toHaveBeenCalled();
  });

  it("returns 400 when businessId is missing or not a uuid — no supabase round-trip", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: USER_A, email: "f@x.com" });
    const res = await POST(jsonPost({ businessId: "not-a-uuid", abn: ABN_11 }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      ok: false,
      reason: "businessId must be a uuid",
    });
    expect(mocks.getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(mocks.lookupAbnMock).not.toHaveBeenCalled();
  });

  it("accepts either casing on the uuid regex (regex flag /i)", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: USER_A, email: "f@x.com" });
    mocks.getSupabaseAdminMock.mockReturnValue(null); // stop after 503
    const upper = UUID_A.toUpperCase();
    const res = await POST(jsonPost({ businessId: upper, abn: ABN_11 }));
    expect(res.status).toBe(503); // passed the uuid check, tripped on supabase null
  });

  it("400s when businessId is not a string (numeric slipped through JSON)", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: USER_A, email: "f@x.com" });
    const res = await POST(jsonPost({ businessId: 12345, abn: ABN_11 }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      ok: false,
      reason: "businessId must be a uuid",
    });
  });

  it("returns 400 when the ABN is not 11 digits after stripping non-digits", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: USER_A, email: "f@x.com" });
    const res = await POST(jsonPost({ businessId: UUID_A, abn: "123" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      ok: false,
      reason: "abn must be 11 digits",
    });
    expect(mocks.lookupAbnMock).not.toHaveBeenCalled();
  });

  it("normalises ABN formatting (spaces + hyphens) to 11 digits before validating", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: USER_A, email: "f@x.com" });
    mocks.getSupabaseAdminMock.mockReturnValue(null); // stop after 503
    // "12 345 678 901" — a valid ABN formatted the way ABR displays it
    const res = await POST(jsonPost({ businessId: UUID_A, abn: "12 345 678 901" }));
    expect(res.status).toBe(503); // passed both format checks, tripped on supabase null
  });

  it("400s when abn is not a string", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: USER_A, email: "f@x.com" });
    const res = await POST(jsonPost({ businessId: UUID_A, abn: 12345678901 }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      ok: false,
      reason: "abn must be 11 digits",
    });
  });
});

// --------------------------------------------------------------------------
describe("POST /api/verification/abr — infra + ownership checks", () => {
  it("returns 503 when Supabase is unavailable — no ABR call fires", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: USER_A, email: "f@x.com" });
    mocks.getSupabaseAdminMock.mockReturnValue(null);
    const res = await POST(jsonPost({ businessId: UUID_A, abn: ABN_11 }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      ok: false,
      reason: "Database not configured",
    });
    expect(mocks.lookupAbnMock).not.toHaveBeenCalled();
  });

  it("looks up the project by id + selects (id, user_id) — no cross-caller leak", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: USER_A, email: "f@x.com" });
    const { client, state } = makeFakeSupabase();
    state.project = { id: UUID_A, user_id: USER_A };
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    mocks.lookupAbnMock.mockResolvedValue(activeAbrResult());
    await POST(jsonPost({ businessId: UUID_A, abn: ABN_11 }));
    const selectCall = state.calls.find((c) => c.op === "select");
    expect(selectCall?.table).toBe("projects");
    expect(selectCall?.filters).toEqual([{ col: "id", val: UUID_A }]);
  });

  it("returns 500 { reason: 'Database error' } when the project lookup errors", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: USER_A, email: "f@x.com" });
    const { client, state } = makeFakeSupabase();
    state.projectErr = { code: "PGRST-500", message: "internal" };
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(jsonPost({ businessId: UUID_A, abn: ABN_11 }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, reason: "Database error" });
    // Failed lookup must NOT trigger the ABR call or the audit row.
    expect(mocks.lookupAbnMock).not.toHaveBeenCalled();
    expect(mocks.logUserActionMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("returns 404 when the project is not found", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: USER_A, email: "f@x.com" });
    const { client, state } = makeFakeSupabase();
    state.project = null;
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    const res = await POST(jsonPost({ businessId: UUID_A, abn: ABN_11 }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      ok: false,
      reason: "Business not found",
    });
    expect(mocks.lookupAbnMock).not.toHaveBeenCalled();
  });

  it("returns 403 when the project is not owned by the caller", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: USER_A, email: "f@x.com" });
    const { client, state } = makeFakeSupabase();
    state.project = { id: UUID_A, user_id: USER_B };
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    const res = await POST(jsonPost({ businessId: UUID_A, abn: ABN_11 }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      ok: false,
      reason: "Business not owned by caller",
    });
    expect(mocks.lookupAbnMock).not.toHaveBeenCalled();
    expect(mocks.logUserActionMock).not.toHaveBeenCalled();
  });
});

// --------------------------------------------------------------------------
describe("POST /api/verification/abr — idempotency guard", () => {
  it("short-circuits a duplicate submission within the same UTC day", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: USER_A, email: "f@x.com" });
    const { client, state } = makeFakeSupabase();
    state.project = { id: UUID_A, user_id: USER_A };
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    mocks.lookupAbnMock.mockResolvedValue(activeAbrResult());

    const first = await POST(jsonPost({ businessId: UUID_A, abn: ABN_11 }));
    expect(first.status).toBe(200);
    expect(mocks.lookupAbnMock).toHaveBeenCalledTimes(1);

    const second = await POST(jsonPost({ businessId: UUID_A, abn: ABN_11 }));
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({
      ok: false,
      reason: "duplicate_within_utc_day",
    });
    // Guard fires BEFORE the ABR call — call count stays at 1.
    expect(mocks.lookupAbnMock).toHaveBeenCalledTimes(1);
  });

  it("guard is set BEFORE the ABR lookup — a failed lookup still consumes the daily slot", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: USER_A, email: "f@x.com" });
    const { client, state } = makeFakeSupabase();
    state.project = { id: UUID_A, user_id: USER_A };
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    mocks.lookupAbnMock.mockResolvedValueOnce(null); // first call: soft failure

    const first = await POST(jsonPost({ businessId: UUID_A, abn: ABN_11 }));
    expect(await first.json()).toEqual({
      ok: false,
      reason: "abr_lookup_failed_or_unknown",
    });
    expect(mocks.lookupAbnMock).toHaveBeenCalledTimes(1);

    // Same key resubmitted — guard rejects even though lookup would now succeed.
    mocks.lookupAbnMock.mockResolvedValueOnce(activeAbrResult());
    const second = await POST(jsonPost({ businessId: UUID_A, abn: ABN_11 }));
    expect(await second.json()).toEqual({
      ok: false,
      reason: "duplicate_within_utc_day",
    });
    // Second POST did NOT trigger a fresh ABR call.
    expect(mocks.lookupAbnMock).toHaveBeenCalledTimes(1);
  });

  it("scopes the guard key by (userId, businessId, abn) — a different business is not blocked", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: USER_A, email: "f@x.com" });
    const { client, state } = makeFakeSupabase();
    state.project = { id: UUID_A, user_id: USER_A };
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    mocks.lookupAbnMock.mockResolvedValue(activeAbrResult());

    await POST(jsonPost({ businessId: UUID_A, abn: ABN_11 }));

    // Different business (mock the second lookup path)
    state.project = { id: UUID_B, user_id: USER_A };
    const res = await POST(jsonPost({ businessId: UUID_B, abn: ABN_11 }));
    expect(res.status).toBe(200);
    expect(mocks.lookupAbnMock).toHaveBeenCalledTimes(2);
  });

  it("scopes the guard key by ABN — a different ABN on the same business is not blocked", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: USER_A, email: "f@x.com" });
    const { client, state } = makeFakeSupabase();
    state.project = { id: UUID_A, user_id: USER_A };
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    mocks.lookupAbnMock.mockResolvedValue(activeAbrResult());

    await POST(jsonPost({ businessId: UUID_A, abn: ABN_11 }));
    await POST(
      jsonPost({ businessId: UUID_A, abn: "99999999999" }),
    );
    expect(mocks.lookupAbnMock).toHaveBeenCalledTimes(2);
    expect(mocks.lookupAbnMock).toHaveBeenNthCalledWith(1, ABN_11);
    expect(mocks.lookupAbnMock).toHaveBeenNthCalledWith(2, "99999999999");
  });
});

// --------------------------------------------------------------------------
describe("POST /api/verification/abr — ABR adapter wiring", () => {
  it("passes the digit-normalised ABN into lookupAbn (not the raw formatted string)", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: USER_A, email: "f@x.com" });
    const { client, state } = makeFakeSupabase();
    state.project = { id: UUID_A, user_id: USER_A };
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    mocks.lookupAbnMock.mockResolvedValue(activeAbrResult());
    await POST(jsonPost({ businessId: UUID_A, abn: "12-345 678 901" }));
    expect(mocks.lookupAbnMock).toHaveBeenCalledWith(ABN_11);
  });

  it("returns 200 { ok:false, reason:'abr_lookup_failed_or_unknown' } on null adapter reply", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: USER_A, email: "f@x.com" });
    const { client, state } = makeFakeSupabase();
    state.project = { id: UUID_A, user_id: USER_A };
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    mocks.lookupAbnMock.mockResolvedValue(null);
    const res = await POST(jsonPost({ businessId: UUID_A, abn: ABN_11 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: false,
      reason: "abr_lookup_failed_or_unknown",
    });
    // No update, no audit row on the soft-fail path.
    expect(state.calls.some((c) => c.op === "update")).toBe(false);
    expect(mocks.logUserActionMock).not.toHaveBeenCalled();
  });
});

// --------------------------------------------------------------------------
describe("POST /api/verification/abr — verification-level engine wiring", () => {
  it("Active ABN + hardcoded (domainVerified=false, ...) collapses to L1 (never higher here)", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: USER_A, email: "f@x.com" });
    const { client, state } = makeFakeSupabase();
    state.project = { id: UUID_A, user_id: USER_A };
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    mocks.lookupAbnMock.mockResolvedValue(activeAbrResult({ status: "Active" }));

    const res = await POST(jsonPost({ businessId: UUID_A, abn: ABN_11 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, verificationLevel: 1 });
    expect(body.abrResult.status).toBe("Active");
  });

  it("Cancelled ABN also collapses to L1 (L2 requires abrStatus=Active)", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: USER_A, email: "f@x.com" });
    const { client, state } = makeFakeSupabase();
    state.project = { id: UUID_A, user_id: USER_A };
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    mocks.lookupAbnMock.mockResolvedValue(
      activeAbrResult({ status: "Cancelled" }),
    );

    const res = await POST(jsonPost({ businessId: UUID_A, abn: ABN_11 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, verificationLevel: 1 });
    expect(body.abrResult.status).toBe("Cancelled");
  });
});

// --------------------------------------------------------------------------
describe("POST /api/verification/abr — projects UPDATE contract", () => {
  it("updates verification_level + last_verified_at + updated_at with an ISO timestamp", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: USER_A, email: "f@x.com" });
    const { client, state } = makeFakeSupabase();
    state.project = { id: UUID_A, user_id: USER_A };
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    mocks.lookupAbnMock.mockResolvedValue(activeAbrResult());

    const before = Date.now();
    await POST(jsonPost({ businessId: UUID_A, abn: ABN_11 }));
    const after = Date.now();

    const updateCall = state.calls.find((c) => c.op === "update");
    expect(updateCall?.table).toBe("projects");
    expect(updateCall?.filters).toEqual([{ col: "id", val: UUID_A }]);
    const payload = updateCall!.payload!;
    expect(payload.verification_level).toBe(1);
    expect(typeof payload.last_verified_at).toBe("string");
    expect(payload.last_verified_at).toBe(payload.updated_at); // same server-computed instant
    const stamped = Date.parse(payload.last_verified_at as string);
    expect(stamped).toBeGreaterThanOrEqual(before);
    expect(stamped).toBeLessThanOrEqual(after + 1000);
  });

  it("returns 500 { reason: 'Database write failed' } when the UPDATE errors", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: USER_A, email: "f@x.com" });
    const { client, state } = makeFakeSupabase();
    state.project = { id: UUID_A, user_id: USER_A };
    state.updateErr = { message: "row-locked" };
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    mocks.lookupAbnMock.mockResolvedValue(activeAbrResult());
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(jsonPost({ businessId: UUID_A, abn: ABN_11 }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      ok: false,
      reason: "Database write failed",
    });
    // Update failure must skip the audit row so the log never claims a
    // successful verification for a failed write.
    expect(mocks.logUserActionMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

// --------------------------------------------------------------------------
describe("POST /api/verification/abr — happy path + audit trail", () => {
  it("returns { ok:true, verificationLevel, abrResult } with the adapter payload verbatim", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: USER_A, email: "f@x.com" });
    const { client, state } = makeFakeSupabase();
    state.project = { id: UUID_A, user_id: USER_A };
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    const abr = activeAbrResult({ entityName: "Auschain PTY LTD" });
    mocks.lookupAbnMock.mockResolvedValue(abr);

    const res = await POST(jsonPost({ businessId: UUID_A, abn: ABN_11 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      verificationLevel: 1,
      abrResult: abr,
    });
  });

  it("fires logUserAction with action='verification.abr_lookup' + subject=business + full fields", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: USER_A, email: "f@x.com" });
    const { client, state } = makeFakeSupabase();
    state.project = { id: UUID_A, user_id: USER_A };
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    mocks.lookupAbnMock.mockResolvedValue(activeAbrResult());

    await POST(
      jsonPost(
        { businessId: UUID_A, abn: ABN_11 },
        {
          "x-forwarded-for": "203.0.113.7, 10.0.0.1",
          "user-agent": "Mozilla/5.0 (BlockID e2e test)",
        },
      ),
    );
    expect(mocks.logUserActionMock).toHaveBeenCalledTimes(1);
    const input = mocks.logUserActionMock.mock.calls[0]![0];
    expect(input).toMatchObject({
      userId: USER_A,
      action: "verification.abr_lookup",
      subjectType: "business",
      subjectId: UUID_A,
      route: "/api/verification/abr",
      ip: "203.0.113.7", // first x-forwarded-for hop
      ua: "Mozilla/5.0 (BlockID e2e test)",
    });
    const fields = (input as { fields: Record<string, unknown> }).fields;
    expect(fields).toEqual({
      abn: ABN_11,
      abr_status: "Active",
      entity_type: "Australian Private Company",
      verification_level: 1,
      source: "abr_web_services",
    });
  });

  it("audit row uses x-real-ip when x-forwarded-for is absent", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: USER_A, email: "f@x.com" });
    const { client, state } = makeFakeSupabase();
    state.project = { id: UUID_A, user_id: USER_A };
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    mocks.lookupAbnMock.mockResolvedValue(activeAbrResult());

    await POST(
      jsonPost(
        { businessId: UUID_A, abn: ABN_11 },
        { "x-real-ip": "198.51.100.4" },
      ),
    );
    const input = mocks.logUserActionMock.mock.calls[0]![0];
    expect(input).toMatchObject({ ip: "198.51.100.4" });
  });

  it("audit row records ip=null when neither header is present (never throws)", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: USER_A, email: "f@x.com" });
    const { client, state } = makeFakeSupabase();
    state.project = { id: UUID_A, user_id: USER_A };
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    mocks.lookupAbnMock.mockResolvedValue(activeAbrResult());

    await POST(jsonPost({ businessId: UUID_A, abn: ABN_11 }));
    const input = mocks.logUserActionMock.mock.calls[0]![0];
    expect(input).toMatchObject({ ip: null, ua: null });
  });

  it("audit row's abr_status mirrors the adapter reply verbatim on Cancelled", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: USER_A, email: "f@x.com" });
    const { client, state } = makeFakeSupabase();
    state.project = { id: UUID_A, user_id: USER_A };
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    mocks.lookupAbnMock.mockResolvedValue(
      activeAbrResult({ status: "Cancelled" }),
    );

    await POST(jsonPost({ businessId: UUID_A, abn: ABN_11 }));
    const input = mocks.logUserActionMock.mock.calls[0]![0];
    const fields = (input as { fields: Record<string, unknown> }).fields;
    expect(fields).toMatchObject({ abr_status: "Cancelled" });
  });
});

// --------------------------------------------------------------------------
describe("POST /api/verification/abr — module contract", () => {
  it("exports _resetIdempotencyGuard for tests (never called from prod code)", () => {
    expect(typeof _resetIdempotencyGuard).toBe("function");
    expect(() => _resetIdempotencyGuard()).not.toThrow();
  });
});
