// Colocated vitest for POST /api/equity/request — P1-equity-request-route-test.
//
// The equity-request route is the founder-facing intake handler for the
// Enterprise-for-Equity programme. It NEVER issues equity — every success
// path returns 202 with `status: pending_review`. The route is on the
// P1_dataroom_map compliance surface: (a) wholesale-investor fail-closed
// gate (Corporations Act s708(8)/(11) / s911A), (b) recordConsent → immutable
// consent_events row hashed against the exact disclaimer body_md the user
// saw, (c) INSERT INTO equity_requests linking to the consent_events.id, and
// (d) hash-chained audit trail. A silent regression here (dropping the
// wholesale gate, forgetting to hash the disclaimer body, letting the
// jurisdiction detection swallow bubbling errors, leaking the ack email /
// telegram side-channel into the response path so a slow email failure
// blocks the 202) breaks the founder-facing compliance contract.
//
// Every downstream is mocked so the assertions pin route wiring — the pure
// libs themselves (recordConsent hashing, appendAudit hash chain, gates
// wholesale semantics, detectJurisdiction fallback ladder) are covered by
// their own colocated suites (src/lib/consent.test.ts, src/lib/audit.test.ts,
// src/lib/legal/gates.test.ts, src/lib/jurisdiction.test.ts).

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Auth ────────────────────────────────────────────────────
type AppUserFake = {
  id: string;
  email: string;
  displayName?: string | null;
};
const getCurrentUserMock = vi.fn<() => Promise<AppUserFake | null>>();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

// ── Supabase admin ──────────────────────────────────────────
type QueryResult = { data: unknown; error: { message: string } | null; count?: number | null };

type QueryPromise = Promise<QueryResult> & {
  select: (...args: unknown[]) => QueryPromise;
  eq: (...args: unknown[]) => QueryPromise;
  gte: (...args: unknown[]) => QueryPromise;
  insert: (...args: unknown[]) => QueryPromise;
  single: () => QueryPromise;
};

type FromCall = { table: string; ops: Array<{ op: string; args: unknown[] }> };
const fromCalls: FromCall[] = [];

// Test-scoped state — mutated per case via `state.rateCount`, `state.insertRow`, etc.
type State = {
  rateCount: number;
  rateError: { message: string } | null;
  rateThrows: boolean;
  insertedRow: { id: string; submitted_at: string } | null;
  insertError: { message: string } | null;
};
const state: State = {
  rateCount: 0,
  rateError: null,
  rateThrows: false,
  insertedRow: { id: "eq-req-1", submitted_at: "2026-08-13T12:00:00.000Z" },
  insertError: null,
};

function makeFrom(table: string): QueryPromise {
  const call: FromCall = { table, ops: [] };
  fromCalls.push(call);

  const chain = {} as QueryPromise;
  let mode: "count" | "insert" | null = null;

  const record = (op: string, args: unknown[]) => {
    call.ops.push({ op, args });
  };
  const resolveResult = (): QueryResult => {
    if (mode === "count") {
      if (state.rateThrows) throw new Error("rate-count synthetic throw");
      return { data: null, error: state.rateError, count: state.rateCount };
    }
    if (mode === "insert") {
      return {
        data: state.insertedRow,
        error: state.insertError,
      };
    }
    return { data: null, error: null };
  };

  (chain as unknown as { then: unknown }).then = (
    onFulfilled: (v: QueryResult) => unknown,
    onRejected?: (e: unknown) => unknown,
  ) => {
    try {
      return Promise.resolve(resolveResult()).then(onFulfilled, onRejected);
    } catch (e) {
      return Promise.reject(e).catch(onRejected);
    }
  };
  chain.select = (...args: unknown[]) => {
    record("select", args);
    // The rate-limit branch calls .select("id", { count: "exact", head: true })
    if (args.length >= 2 && typeof args[1] === "object" && args[1] !== null && "count" in (args[1] as object)) {
      mode = "count";
    }
    return chain;
  };
  chain.eq = (...args: unknown[]) => { record("eq", args); return chain; };
  chain.gte = (...args: unknown[]) => { record("gte", args); return chain; };
  chain.insert = (...args: unknown[]) => {
    record("insert", args);
    mode = "insert";
    return chain;
  };
  chain.single = () => { record("single", []); return chain; };
  return chain;
}

const getSupabaseAdminMock = vi.fn<() => { from: (t: string) => QueryPromise } | null>();
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

// ── Consent ─────────────────────────────────────────────────
const recordConsentMock = vi.fn<(p: unknown) => Promise<{ id: string }>>();
const hashDisclaimerBodyMock = vi.fn<(body: string) => string>((body) => `hash(${body})`);
vi.mock("@/lib/consent", () => ({
  recordConsent: (p: unknown) => recordConsentMock(p),
  hashDisclaimerBody: (body: string) => hashDisclaimerBodyMock(body),
}));

// ── Audit ───────────────────────────────────────────────────
const appendAuditMock = vi.fn<(p: unknown) => Promise<{ ok: true }>>();
vi.mock("@/lib/audit", () => ({
  appendAudit: (p: unknown) => appendAuditMock(p),
}));

// ── Legal versions + surfaces ───────────────────────────────
vi.mock("@/lib/legal/versions", () => ({
  DISCLAIMER_VERSIONS: {
    tos: "vX",
    privacy: "vX",
    general_advice_warning: "vX",
    wholesale_certification: "vX",
    equity_offer_disclaimer: "v9.9-fake",
    not_financial_advice: "vX",
    marketing: "vX",
  },
}));

const getSurfaceMock = vi.fn<(id: string) => { body_md: string } | null>();
vi.mock("@/lib/legal/surfaces", () => ({
  getSurface: (id: string) => getSurfaceMock(id),
}));

// ── Legal gates (wholesale-certified guard + LegalGateError) ─
// vi.hoisted so the class binding is available inside the vi.mock factory
// (vi.mock calls are hoisted above imports; plain top-level declarations are
// not, so a class defined after the mock throws ReferenceError at hoist time).
const { FakeLegalGateError, assertWholesaleCertifiedMock } = vi.hoisted(() => {
  class FakeLegalGateError extends Error {
    status: number;
    code: string;
    constructor(msg: string, opts: { status: number; code: string }) {
      super(msg);
      this.name = "LegalGateError";
      this.status = opts.status;
      this.code = opts.code;
    }
  }
  const assertWholesaleCertifiedMock = vi.fn<(userId: string) => Promise<void>>();
  return { FakeLegalGateError, assertWholesaleCertifiedMock };
});
vi.mock("@/lib/legal/gates", () => ({
  assertWholesaleCertified: (userId: string) => assertWholesaleCertifiedMock(userId),
  LegalGateError: FakeLegalGateError,
}));

// ── Jurisdiction ────────────────────────────────────────────
const detectJurisdictionMock = vi.fn<(req: Request) => Promise<{ country?: string } | null>>();
vi.mock("@/lib/jurisdiction", () => ({
  detectJurisdiction: (req: Request) => detectJurisdictionMock(req),
}));

// ── Telegram + email side-channels (fire-and-forget) ────────
const sendTelegramMock = vi.fn<(msg: string) => Promise<boolean>>();
const mdEscapeMock = vi.fn<(s: string) => string>((s) => `esc(${s})`);
vi.mock("@/lib/telegram", () => ({
  sendTelegram: (msg: string) => sendTelegramMock(msg),
  mdEscape: (s: string) => mdEscapeMock(s),
}));

const sendEmailMock = vi.fn<(args: unknown) => Promise<{ ok: true }>>();
vi.mock("@/lib/email", () => ({
  sendEmail: (args: unknown) => sendEmailMock(args),
}));

// Import after mocks are wired.
import { POST } from "./route";

const ok: AppUserFake = {
  id: "user-1",
  email: "founder@example.com",
  displayName: "Founder One",
};

function makeRequest(
  body: unknown,
  opts: { raw?: string; headers?: Record<string, string> } = {},
): Request {
  const headers: Record<string, string> = { "content-type": "application/json", ...(opts.headers ?? {}) };
  const init: RequestInit = {
    method: "POST",
    headers,
    body: opts.raw !== undefined ? opts.raw : JSON.stringify(body),
  };
  return new Request("https://blockid.au/api/equity/request", init);
}

const validBody = {
  company_name: "Acme AI",
  stage: "seed" as const,
  equity_pct_requested: 10,
  scope: ["svi_valuation", "cap_table_esop"] as const,
  message:
    "We would like BlockID to build the SVI + ESOP surface for our seed raise. " +
    "Enterprise-for-equity engagement please — details attached in the data room.",
  ack_disclaimer: true as const,
  ack_independent_counsel: true as const,
};

function resetState() {
  fromCalls.length = 0;
  state.rateCount = 0;
  state.rateError = null;
  state.rateThrows = false;
  state.insertedRow = { id: "eq-req-1", submitted_at: "2026-08-13T12:00:00.000Z" };
  state.insertError = null;
}

describe("POST /api/equity/request", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetState();
    getCurrentUserMock.mockResolvedValue(ok);
    getSupabaseAdminMock.mockReturnValue({ from: (t: string) => makeFrom(t) });
    getSurfaceMock.mockReturnValue({ body_md: "DISCLAIMER_BODY_MD" });
    assertWholesaleCertifiedMock.mockResolvedValue();
    detectJurisdictionMock.mockResolvedValue({ country: "AU" });
    recordConsentMock.mockResolvedValue({ id: "consent-1" });
    appendAuditMock.mockResolvedValue({ ok: true });
    sendTelegramMock.mockResolvedValue(true);
    sendEmailMock.mockResolvedValue({ ok: true });
  });

  // ── Auth guard fires before every downstream ────────────
  it("returns 401 when getCurrentUser returns null (wholesale gate + supabase + consent all skipped)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json).toEqual({ ok: false, reason: "Authentication required" });
    expect(assertWholesaleCertifiedMock).not.toHaveBeenCalled();
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(recordConsentMock).not.toHaveBeenCalled();
  });

  // ── Wholesale-investor fail-closed gate (Corps Act s708/s911A) ─
  it("returns 403 wholesale_verification_required when wholesale gate throws wholesale_required", async () => {
    assertWholesaleCertifiedMock.mockRejectedValue(
      new FakeLegalGateError("Wholesale investor certification required", {
        status: 403,
        code: "wholesale_required",
      }),
    );
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json).toEqual({
      ok: false,
      reason: "wholesale_verification_required",
      link: "/wholesale/verify",
    });
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(recordConsentMock).not.toHaveBeenCalled();
  });

  it("propagates non-wholesale LegalGateError status + code (e.g. supabase_unavailable 503)", async () => {
    assertWholesaleCertifiedMock.mockRejectedValue(
      new FakeLegalGateError("Supabase unavailable", {
        status: 503,
        code: "supabase_unavailable",
      }),
    );
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json).toEqual({ ok: false, reason: "supabase_unavailable" });
  });

  it("returns 500 gate_failed for a non-LegalGateError thrown from the wholesale gate", async () => {
    assertWholesaleCertifiedMock.mockRejectedValue(new Error("boom"));
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json).toEqual({ ok: false, reason: "gate_failed" });
  });

  it("calls assertWholesaleCertified with the authenticated user's id (never the body company)", async () => {
    await POST(makeRequest({ ...validBody, company_name: "Impostor Inc" }));
    expect(assertWholesaleCertifiedMock).toHaveBeenCalledTimes(1);
    expect(assertWholesaleCertifiedMock).toHaveBeenCalledWith("user-1");
  });

  // ── Body parse + Zod schema ─────────────────────────────
  it("returns 400 Invalid JSON body when body is unparseable", async () => {
    const res = await POST(makeRequest(undefined, { raw: "{not json" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toEqual({ ok: false, reason: "Invalid JSON body" });
  });

  it("returns 400 Invalid request body with Zod issues when equity_pct_requested is out of range", async () => {
    const res = await POST(makeRequest({ ...validBody, equity_pct_requested: 20 }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.reason).toBe("Invalid request body");
    expect(Array.isArray(json.issues)).toBe(true);
    expect(json.issues.some((i: { path: string }) => i.path === "equity_pct_requested")).toBe(true);
  });

  it("returns 400 when equity_pct_requested is below the 5% floor", async () => {
    const res = await POST(makeRequest({ ...validBody, equity_pct_requested: 1 }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.issues.some((i: { path: string }) => i.path === "equity_pct_requested")).toBe(true);
  });

  it("returns 400 when message is below the 100-character floor", async () => {
    const res = await POST(makeRequest({ ...validBody, message: "too short" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.issues.some((i: { path: string }) => i.path === "message")).toBe(true);
  });

  it("returns 400 when ack_disclaimer is false (must be literal true)", async () => {
    const res = await POST(makeRequest({ ...validBody, ack_disclaimer: false }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when ack_independent_counsel is missing (must be literal true)", async () => {
    const body = { ...validBody } as Record<string, unknown>;
    delete body.ack_independent_counsel;
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(400);
  });

  it("returns 400 when scope is empty", async () => {
    const res = await POST(makeRequest({ ...validBody, scope: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when scope contains an unknown enum literal", async () => {
    const res = await POST(makeRequest({ ...validBody, scope: ["mystery_scope"] }));
    expect(res.status).toBe(400);
  });

  // ── Supabase availability ───────────────────────────────
  it("returns 503 Supabase unavailable when getSupabaseAdmin returns null", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json).toEqual({ ok: false, reason: "Supabase unavailable" });
    expect(recordConsentMock).not.toHaveBeenCalled();
  });

  // ── Rate limit (3 rows / 30 days) ───────────────────────
  it("returns 429 when the user already has 3 rows in the last 30 days", async () => {
    state.rateCount = 3;
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.reason).toMatch(/Rate limit reached \(3 requests per 30 days\)/);
    expect(typeof json.next_eligible_at).toBe("string");
    // ISO date must parse.
    expect(Number.isNaN(Date.parse(json.next_eligible_at))).toBe(false);
    expect(recordConsentMock).not.toHaveBeenCalled();
  });

  it("returns 429 at exactly the rate-limit boundary (count === MAX)", async () => {
    state.rateCount = 3;
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(429);
  });

  it("proceeds when the user has fewer than 3 rows in the window", async () => {
    state.rateCount = 2;
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(202);
    expect(recordConsentMock).toHaveBeenCalledTimes(1);
  });

  it("swallows a rate-limit count error and proceeds (fail-open on the counter, not fail-closed)", async () => {
    state.rateError = { message: "count timeout" };
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(202);
    expect(recordConsentMock).toHaveBeenCalledTimes(1);
  });

  it("swallows a thrown rate-limit lookup and still proceeds", async () => {
    state.rateThrows = true;
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(202);
    expect(recordConsentMock).toHaveBeenCalledTimes(1);
  });

  // ── Rate-limit query shape (user_id + submitted_at window) ─
  it("queries equity_requests with .eq('user_id', user.id) + .gte('submitted_at', windowStart)", async () => {
    state.rateCount = 0;
    await POST(makeRequest(validBody));
    const rateCall = fromCalls.find((c) => c.table === "equity_requests" && c.ops.some((o) => o.op === "gte"));
    expect(rateCall).toBeTruthy();
    const eqOp = rateCall!.ops.find((o) => o.op === "eq");
    expect(eqOp).toEqual({ op: "eq", args: ["user_id", "user-1"] });
    const gteOp = rateCall!.ops.find((o) => o.op === "gte");
    expect(gteOp?.args[0]).toBe("submitted_at");
    // Second arg is an ISO timestamp string ~30 days ago.
    expect(typeof gteOp?.args[1]).toBe("string");
    expect(Number.isNaN(Date.parse(gteOp?.args[1] as string))).toBe(false);
  });

  // ── Jurisdiction detection ──────────────────────────────
  it("defaults jurisdiction to 'AU' when detectJurisdiction throws", async () => {
    detectJurisdictionMock.mockRejectedValue(new Error("geoip lookup failed"));
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(202);
    const [consentArg] = recordConsentMock.mock.calls[0]!;
    expect((consentArg as { jurisdiction: string }).jurisdiction).toBe("AU");
  });

  it("uses the detected jurisdiction on the consent + insert payloads when available", async () => {
    detectJurisdictionMock.mockResolvedValue({ country: "NZ" });
    await POST(makeRequest(validBody));
    const [consentArg] = recordConsentMock.mock.calls[0]!;
    expect((consentArg as { jurisdiction: string }).jurisdiction).toBe("NZ");
    const insertCall = fromCalls.find((c) => c.table === "equity_requests" && c.ops.some((o) => o.op === "insert"));
    const insertOp = insertCall!.ops.find((o) => o.op === "insert")!;
    expect((insertOp.args[0] as { jurisdiction: string }).jurisdiction).toBe("NZ");
  });

  it("defaults to 'AU' when detectJurisdiction returns a payload with no country", async () => {
    detectJurisdictionMock.mockResolvedValue({});
    await POST(makeRequest(validBody));
    const [consentArg] = recordConsentMock.mock.calls[0]!;
    expect((consentArg as { jurisdiction: string }).jurisdiction).toBe("AU");
  });

  // ── recordConsent payload ───────────────────────────────
  it("hashes the disclaimer body_md from getSurface('equity_offer_page') and forwards it to recordConsent", async () => {
    getSurfaceMock.mockReturnValue({ body_md: "REAL_DISCLAIMER_BODY" });
    await POST(makeRequest(validBody));
    expect(getSurfaceMock).toHaveBeenCalledWith("equity_offer_page");
    expect(hashDisclaimerBodyMock).toHaveBeenCalledWith("REAL_DISCLAIMER_BODY");
    const [consentArg] = recordConsentMock.mock.calls[0]!;
    expect(consentArg).toMatchObject({
      user_id: "user-1",
      kind: "equity_offer_disclaimer",
      disclaimer_version: "v9.9-fake",
      disclaimer_hash: "hash(REAL_DISCLAIMER_BODY)",
      granted: true,
      detail: {
        surface: "equity_offer_page",
        ack_independent_counsel: true,
        stage: "seed",
        equity_pct_requested: 10,
      },
    });
  });

  it("falls back to the equity_offer_disclaimer sentinel body when getSurface returns null", async () => {
    getSurfaceMock.mockReturnValue(null);
    await POST(makeRequest(validBody));
    expect(hashDisclaimerBodyMock).toHaveBeenCalledWith("equity_offer_disclaimer:fallback");
  });

  it("threads the request's x-forwarded-for + user-agent into the consent row", async () => {
    await POST(
      makeRequest(validBody, {
        headers: {
          "x-forwarded-for": "10.1.2.3, 172.20.0.1",
          "user-agent": "Mozilla/5.0 (SmokeBot)",
        },
      }),
    );
    const [consentArg] = recordConsentMock.mock.calls[0]!;
    expect((consentArg as { ip: string; ua: string }).ip).toBe("10.1.2.3");
    expect((consentArg as { ua: string }).ua).toBe("Mozilla/5.0 (SmokeBot)");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", async () => {
    await POST(
      makeRequest(validBody, { headers: { "x-real-ip": "203.0.113.7" } }),
    );
    const [consentArg] = recordConsentMock.mock.calls[0]!;
    expect((consentArg as { ip: string }).ip).toBe("203.0.113.7");
  });

  it("returns 500 Consent persistence failed when recordConsent throws (no equity_requests insert)", async () => {
    recordConsentMock.mockRejectedValue(new Error("consent DB unreachable"));
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json).toEqual({ ok: false, reason: "Consent persistence failed" });
    const insertCall = fromCalls.find((c) => c.table === "equity_requests" && c.ops.some((o) => o.op === "insert"));
    expect(insertCall).toBeUndefined();
  });

  // ── equity_requests insert payload ──────────────────────
  it("inserts the pending_review row wired to the consent_event_id + scope CSV + detail envelope", async () => {
    await POST(makeRequest(validBody));
    const insertCall = fromCalls.find((c) => c.table === "equity_requests" && c.ops.some((o) => o.op === "insert"));
    expect(insertCall).toBeTruthy();
    const insertOp = insertCall!.ops.find((o) => o.op === "insert")!;
    expect(insertOp.args[0]).toEqual({
      user_id: "user-1",
      stage: "seed",
      equity_pct_requested: 10,
      scope: "svi_valuation,cap_table_esop",
      jurisdiction: "AU",
      consent_event_id: "consent-1",
      status: "pending_review",
      detail: {
        message: validBody.message,
        company_name: "Acme AI",
        scope_selected: ["svi_valuation", "cap_table_esop"],
      },
    });
    // Selects id + submitted_at, .single() to force 1 row.
    expect(insertCall!.ops.find((o) => o.op === "select")).toEqual({
      op: "select",
      args: ["id, submitted_at"],
    });
    expect(insertCall!.ops.find((o) => o.op === "single")).toBeTruthy();
  });

  it("returns 500 Failed to persist request when the equity_requests insert errors", async () => {
    state.insertedRow = null;
    state.insertError = { message: "insert boom" };
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json).toEqual({ ok: false, reason: "Failed to persist request" });
    // Audit chain must NOT fire when the row failed to persist.
    expect(appendAuditMock).not.toHaveBeenCalled();
  });

  it("returns 500 when the insert returns neither data nor error (defensive)", async () => {
    state.insertedRow = null;
    state.insertError = null;
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.reason).toBe("Failed to persist request");
  });

  // ── Audit chain ─────────────────────────────────────────
  it("appends an equity_request_submitted audit row linking user, resource_id, and consent_event_id", async () => {
    await POST(makeRequest(validBody));
    expect(appendAuditMock).toHaveBeenCalledTimes(1);
    const [auditArg] = appendAuditMock.mock.calls[0]!;
    expect(auditArg).toMatchObject({
      user_id: "user-1",
      actor: "user",
      action: "equity_request_submitted",
      resource_type: "equity_request",
      resource_id: "eq-req-1",
      detail: {
        stage: "seed",
        equity_pct_requested: 10,
        scope: ["svi_valuation", "cap_table_esop"],
        jurisdiction: "AU",
        consent_event_id: "consent-1",
      },
    });
  });

  it("swallows an audit failure so the 202 response still fires (audit is best-effort, consent+row are the legal artefacts)", async () => {
    appendAuditMock.mockRejectedValue(new Error("audit chain wobble"));
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(202);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.status).toBe("pending_review");
  });

  // ── 202 success envelope ────────────────────────────────
  it("returns 202 pending_review with request_id + consent_id + submitted_at on the happy path", async () => {
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(202);
    const json = await res.json();
    expect(json).toEqual({
      ok: true,
      status: "pending_review",
      request_id: "eq-req-1",
      consent_id: "consent-1",
      submitted_at: "2026-08-13T12:00:00.000Z",
    });
  });

  // ── Fire-and-forget side channels never block the 202 ────
  it("does not await the ack email — a hanging sendEmail must not delay the 202 response", async () => {
    let resolveEmail: ((v: { ok: true }) => void) | null = null;
    sendEmailMock.mockImplementation(
      () =>
        new Promise<{ ok: true }>((resolve) => {
          resolveEmail = resolve;
        }),
    );
    const started = Date.now();
    const res = await POST(makeRequest(validBody));
    const elapsed = Date.now() - started;
    expect(res.status).toBe(202);
    // The ack email is still hanging — the route returned without awaiting it.
    expect(resolveEmail).not.toBeNull();
    expect(elapsed).toBeLessThan(500);
    if (resolveEmail) (resolveEmail as (v: { ok: true }) => void)({ ok: true });
  });

  it("does not fail the response when sendTelegram rejects (fire-and-forget notify)", async () => {
    sendTelegramMock.mockRejectedValue(new Error("telegram down"));
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(202);
  });

  it("does not fail the response when sendEmail rejects (fire-and-forget ack)", async () => {
    sendEmailMock.mockRejectedValue(new Error("smtp down"));
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(202);
  });

  // ── Module-level route surface ──────────────────────────
  it("exports dynamic='force-dynamic' and runtime='nodejs' so Next.js does not statically evaluate the route", async () => {
    const mod = await import("./route");
    expect(mod.dynamic).toBe("force-dynamic");
    expect(mod.runtime).toBe("nodejs");
  });
});
