// S23-B — POST/GET /api/admin/ga4/register-dimensions. Pins: admin gate
// (null user + non-admin → 403, before any GA4 call); GET is a dry-run;
// POST applies by default and honours { dryRun: true }; the blocked shape
// { reason, steps } passes through as 200 so the panel can render the
// operator steps; the 30s throttle guards apply (not dry-run) and is only
// consumed after the auth check.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RegisterDimensionsResult } from "@/lib/analytics/ga4-admin";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn<() => Promise<{ id: string; email: string; role?: string } | null>>(),
  register: vi.fn<(opts: { dryRun?: boolean }) => Promise<RegisterDimensionsResult>>(),
}));

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return { ...actual, getCurrentUser: () => mocks.getCurrentUser() };
});
vi.mock("@/lib/analytics/ga4-admin", () => ({
  registerCustomDimensions: (opts: { dryRun?: boolean }) => mocks.register(opts),
}));

import { GET, POST, dynamic } from "./route";

const ADMIN = { id: "u-admin", email: "admin@blockid.au" };
const ROLE_ADMIN = { id: "u-2", email: "ops@example.com", role: "admin" };
const USER = { id: "u-3", email: "someone@example.com" };

function result(overrides: Partial<RegisterDimensionsResult> = {}): RegisterDimensionsResult {
  return {
    ok: true,
    dryRun: false,
    property: "properties/538350801",
    serviceAccount: "sa@x.iam.gserviceaccount.com",
    created: ["arm"],
    existing: ["plan"],
    missing: [],
    unmanaged: [],
    blocked: null,
    error: null,
    ...overrides,
  };
}

function post(body?: unknown): Request {
  return new Request("http://localhost/api/admin/ga4/register-dimensions", {
    method: "POST",
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

beforeEach(() => {
  mocks.getCurrentUser.mockReset();
  mocks.register.mockReset();
  mocks.register.mockResolvedValue(result());
  g.__ga4RegisterDimensionsLastAt = 0;
});
afterEach(() => vi.restoreAllMocks());

describe("auth gate", () => {
  it("anonymous → 403 and no GA4 call", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await POST(post());
    expect(res.status).toBe(403);
    expect(mocks.register).not.toHaveBeenCalled();
    expect(g.__ga4RegisterDimensionsLastAt).toBe(0);
  });
  it("non-admin → 403 on GET and POST", async () => {
    mocks.getCurrentUser.mockResolvedValue(USER);
    expect((await POST(post())).status).toBe(403);
    expect((await GET()).status).toBe(403);
    expect(mocks.register).not.toHaveBeenCalled();
  });
  it("role=admin is accepted like ADMIN_EMAIL", async () => {
    mocks.getCurrentUser.mockResolvedValue(ROLE_ADMIN);
    expect((await POST(post())).status).toBe(200);
  });
});

describe("GET (dry-run diff)", () => {
  it("calls registerCustomDimensions({ dryRun: true }) and returns the result uncached", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.register.mockResolvedValue(result({ dryRun: true, created: [], missing: ["arm"] }));
    const res = await GET();
    expect(res.status).toBe(200);
    expect(mocks.register).toHaveBeenCalledWith({ dryRun: true });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toMatchObject({ dryRun: true, missing: ["arm"] });
  });
});

describe("POST", () => {
  it("applies by default → { created, existing, blocked: null }", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    const res = await POST(post());
    expect(res.status).toBe(200);
    expect(mocks.register).toHaveBeenCalledWith({ dryRun: false });
    const body = (await res.json()) as RegisterDimensionsResult;
    expect(body.created).toEqual(["arm"]);
    expect(body.existing).toEqual(["plan"]);
    expect(body.blocked).toBeNull();
  });

  it("{ dryRun: true } is forwarded and skips the throttle", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    await POST(post({ dryRun: true }));
    await POST(post({ dryRun: true }));
    expect(mocks.register).toHaveBeenCalledTimes(2);
    expect(mocks.register).toHaveBeenLastCalledWith({ dryRun: true });
    expect(g.__ga4RegisterDimensionsLastAt).toBe(0);
  });

  it("the blocked result (Admin API disabled) is returned as 200 with reason + the two steps", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.register.mockResolvedValue(
      result({
        ok: false,
        created: [],
        existing: [],
        missing: ["arm", "variant"],
        blocked: { reason: "api_disabled", steps: ["1. Enable …", "2. Add SA as Editor …"], message: "has not been used in project 990415480608" },
      }),
    );
    const res = await POST(post());
    expect(res.status).toBe(200);
    const body = (await res.json()) as RegisterDimensionsResult;
    expect(body.blocked?.reason).toBe("api_disabled");
    expect(body.blocked?.steps).toHaveLength(2);
    expect(body.missing).toEqual(["arm", "variant"]);
  });

  it("a second apply within 30s → 429", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    expect((await POST(post())).status).toBe(200);
    const res = await POST(post());
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatch(/rate-limited/);
    expect(mocks.register).toHaveBeenCalledTimes(1);
  });

  it("a malformed body still applies (dryRun defaults to false)", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    const res = await POST(new Request("http://localhost/x", { method: "POST", headers: { "content-type": "application/json" }, body: "{not json" }));
    expect(res.status).toBe(200);
    expect(mocks.register).toHaveBeenCalledWith({ dryRun: false });
  });

  it("is force-dynamic", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});
