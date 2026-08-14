// Vitest unit tests for POST /api/founder/crm-push
//
// Covers:
//   1. Success — returns 200 { ok: true, pushed_at }
//   2. Missing ZAPIER_WEBHOOK_URL — returns 501 Not Configured
//   3. Rate limit exceeded — returns 429
//   4. Auth guard — unauthenticated returns 401
//   5. Supabase read error on projects query — returns 500

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mock declarations ────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn<() => Promise<{ id: string; email: string } | null>>(),
  getSupabaseAdmin: vi.fn(),
  getProjectIdFromRequest: vi.fn<() => Promise<string | null>>(),
  enforceRateLimit: vi.fn<
    (route: string, id: string, req: Request, max: number, window: number) => null | Response
  >(),
  fetch: vi.fn<(url: string, opts?: RequestInit) => Promise<Response>>(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: () => mocks.getCurrentUser() }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => mocks.getSupabaseAdmin() }));
vi.mock("@/lib/projects", () => ({
  getProjectIdFromRequest: () => mocks.getProjectIdFromRequest(),
}));
vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: (
    route: string,
    id: string,
    req: Request,
    max: number,
    window: number,
  ) => mocks.enforceRateLimit(route, id, req, max, window),
}));

// ── Import route AFTER mocks are set up ─────────────────────────────────────

import { POST } from "./route";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(opts: { headers?: Record<string, string> } = {}): NextRequest {
  return new Request("http://localhost/api/founder/crm-push", {
    method: "POST",
    headers: opts.headers ?? {},
  }) as unknown as NextRequest;
}

/** Build a chainable Supabase mock that returns given data/error for all chained calls. */
function makeSupabase({
  projectData = { name: "BlockID", description: "Startup nav", industry: "saas", stage: 2, website: null },
  projectError = null,
  snapData = { svi_total: 74.5 },
}: {
  projectData?: object | null;
  projectError?: { message: string } | null;
  snapData?: { svi_total: number } | null;
} = {}) {
  // projects chain: .from().select().eq().eq().single()
  const projSingle = vi.fn().mockResolvedValue({ data: projectData, error: projectError });
  const projEq2 = vi.fn().mockReturnValue({ single: projSingle });
  const projEq1 = vi.fn().mockReturnValue({ eq: projEq2 });
  const projSelect = vi.fn().mockReturnValue({ eq: projEq1 });

  // svi_snapshots chain: .from().select().eq().order().limit().maybeSingle()
  const snapMaybeSingle = vi.fn().mockResolvedValue({ data: snapData, error: null });
  const snapLimit = vi.fn().mockReturnValue({ maybeSingle: snapMaybeSingle });
  const snapOrder = vi.fn().mockReturnValue({ limit: snapLimit });
  const snapEq = vi.fn().mockReturnValue({ order: snapOrder });
  const snapSelect = vi.fn().mockReturnValue({ eq: snapEq });

  const from = vi.fn((table: string) => {
    if (table === "projects") return { select: projSelect };
    if (table === "svi_snapshots") return { select: snapSelect };
    return { select: vi.fn() };
  });

  return { from };
}

// ── Test setup ────────────────────────────────────────────────────────────────

const WEBHOOK_URL = "https://hooks.zapier.com/hooks/catch/test/abc123/";

beforeEach(() => {
  mocks.getCurrentUser.mockReset();
  mocks.getSupabaseAdmin.mockReset();
  mocks.getProjectIdFromRequest.mockReset();
  mocks.enforceRateLimit.mockReset();

  // Default happy-path: authenticated, no rate limit, project active
  mocks.getCurrentUser.mockResolvedValue({ id: "user-1", email: "founder@example.com" });
  mocks.enforceRateLimit.mockReturnValue(null); // not rate-limited
  mocks.getProjectIdFromRequest.mockResolvedValue("project-1");
  mocks.getSupabaseAdmin.mockReturnValue(makeSupabase());

  // Default: ZAPIER_WEBHOOK_URL is set
  process.env.ZAPIER_WEBHOOK_URL = WEBHOOK_URL;

  // Stub global fetch
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "success" }), { status: 200 })),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.ZAPIER_WEBHOOK_URL;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/founder/crm-push", () => {
  // ── Test 1: Auth guard ────────────────────────────────────────────────────
  it("returns 401 when user is unauthenticated", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    const body = await res.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/auth/i);
  });

  // ── Test 2: Rate limit ────────────────────────────────────────────────────
  it("returns 429 when rate limit is exceeded", async () => {
    const rateLimitResponse = NextResponse.json(
      { ok: false, error: "Rate limit exceeded — please wait a moment before generating more.", retryInSeconds: 3600 },
      { status: 429 },
    );
    mocks.enforceRateLimit.mockReturnValue(rateLimitResponse);

    const res = await POST(makeRequest());
    expect(res.status).toBe(429);
    const body = await res.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
  });

  // ── Test 3: Missing webhook URL (501) ─────────────────────────────────────
  it("returns 501 when ZAPIER_WEBHOOK_URL is not set", async () => {
    delete process.env.ZAPIER_WEBHOOK_URL;
    const res = await POST(makeRequest());
    expect(res.status).toBe(501);
    const body = await res.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/not configured/i);
  });

  // ── Test 4: Supabase read error on projects ───────────────────────────────
  it("returns 500 when Supabase returns an error reading the project", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(
      makeSupabase({
        projectData: null,
        projectError: { message: "relation does not exist" },
      }),
    );
    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
    const body = await res.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("relation does not exist");
  });

  // ── Test 5: Success ───────────────────────────────────────────────────────
  it("returns 200 with ok + pushed_at on success", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; pushed_at: string };
    expect(body.ok).toBe(true);
    expect(body.pushed_at).toBeTruthy();
    // pushed_at should be a valid ISO timestamp
    expect(() => new Date(body.pushed_at)).not.toThrow();

    // Verify the fetch was called with the webhook URL and correct shape
    const globalFetch = vi.mocked(global.fetch);
    expect(globalFetch).toHaveBeenCalledOnce();
    const [calledUrl, calledOpts] = globalFetch.mock.calls[0];
    expect(calledUrl).toBe(WEBHOOK_URL);
    expect(calledOpts?.method).toBe("POST");

    const payload = JSON.parse(calledOpts?.body as string) as {
      startup_name: string;
      founder_email: string;
      svi_score: number | null;
    };
    expect(payload.startup_name).toBe("BlockID");
    expect(payload.founder_email).toBe("founder@example.com");
    expect(payload.svi_score).toBe(74.5);
  });

  // ── Bonus: No SVI snapshot ────────────────────────────────────────────────
  it("succeeds with svi_score null when no snapshot exists", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(makeSupabase({ snapData: null }));
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    const globalFetch = vi.mocked(global.fetch);
    const [, calledOpts] = globalFetch.mock.calls[0];
    const payload = JSON.parse(calledOpts?.body as string) as { svi_score: number | null };
    expect(payload.svi_score).toBeNull();
  });

  // ── Bonus: Zapier returns non-2xx ──────────────────────────────────────────
  it("returns 502 when Zapier webhook responds with an error status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("Bad Request", { status: 400 })),
    );
    const res = await POST(makeRequest());
    expect(res.status).toBe(502);
    const body = await res.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/400/);
  });
});
