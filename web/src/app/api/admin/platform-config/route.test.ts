// Colocated vitest for GET+PUT /api/admin/platform-config — P9 batch 5.
//
// Admin-only config management — the central config surface. Any bypass here
// could let non-admins change pricing and feature flags. Suite covers:
//   - GET 403 for non-admin/unauthenticated
//   - GET happy path returns config + defaults
//   - PUT 403 for non-admin
//   - PUT 400 on bad JSON
//   - PUT filters unknown keys (only known keys pass validation)
//   - PUT type mismatch silently skips field
//   - PUT 500 when savePlatformConfig fails
//   - PUT happy path: returns ok

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getPlatformConfig: vi.fn(),
  savePlatformConfig: vi.fn(),
  ADMIN_EMAIL: "admin@blockid.au",
  CONFIG_DEFAULTS: {
    siteName: "BlockID",
    founding50Price: 500,
    featuredEnabled: true,
    growthPriceMonthly: 9900,
    // G35 P1 — Pricing v5 PAYG keys (validated by validatePaygConfig).
    payg_enabled: false,
    payg_snapshot_cents: 1900,
    payg_full_cents: 4900,
    payg_verified_cents: 14900,
    verified_sla_business_days: 2,
    payg_verified_max_open: 5,
  } as Record<string, unknown>,
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => mocks.getCurrentUser(),
  ADMIN_EMAIL: mocks.ADMIN_EMAIL,
}));
vi.mock("@/lib/platform-config", () => ({
  getPlatformConfig: () => mocks.getPlatformConfig(),
  savePlatformConfig: (cfg: unknown, actor: string) => mocks.savePlatformConfig(cfg, actor),
  CONFIG_DEFAULTS: mocks.CONFIG_DEFAULTS,
}));

import { GET, PUT } from "./route";

const ADMIN_USER = { id: "admin-1", email: "admin@blockid.au", plan: "admin", role: "admin" };
const REGULAR_USER = { id: "user-2", email: "user@example.com", plan: "free", role: "user" };
const CONFIG = { siteName: "BlockID", founding50Price: 500, featuredEnabled: true, growthPriceMonthly: 9900 };

function putReq(body: unknown, opts?: { badJson?: boolean }) {
  return {
    json: opts?.badJson
      ? () => { throw new SyntaxError("bad json"); }
      : () => Promise.resolve(body),
  } as unknown as import("next/server").NextRequest;
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  mocks.getCurrentUser.mockResolvedValue(ADMIN_USER);
  mocks.getPlatformConfig.mockResolvedValue(CONFIG);
  mocks.savePlatformConfig.mockResolvedValue({ ok: true });
});

afterEach(() => { vi.clearAllMocks(); });

describe("GET /api/admin/platform-config", () => {
  it("returns 403 when unauthenticated", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns 403 for non-admin user", async () => {
    mocks.getCurrentUser.mockResolvedValue(REGULAR_USER);
    const res = await GET();
    expect(res.status).toBe(403);
    const body = await json(res);
    expect(body.error).toMatch(/forbidden/i);
  });

  it("allows access for admin role", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("allows access for admin email (ADMIN_EMAIL)", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: "u-x",
      email: "admin@blockid.au",
      plan: "free",
      role: "user", // not admin role but admin email
    });
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("returns config and defaults", async () => {
    const res = await GET();
    const body = await json(res);
    expect(body.config).toBeDefined();
    expect(body.defaults).toBeDefined();
    expect((body.config as Record<string, unknown>).siteName).toBe("BlockID");
  });
});

describe("PUT /api/admin/platform-config", () => {
  it("returns 403 when unauthenticated", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await PUT(putReq({ siteName: "New Name" }));
    expect(res.status).toBe(403);
  });

  it("returns 403 for non-admin", async () => {
    mocks.getCurrentUser.mockResolvedValue(REGULAR_USER);
    const res = await PUT(putReq({ siteName: "New Name" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 on bad JSON body", async () => {
    const res = await PUT(putReq(null, { badJson: true }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toMatch(/invalid/i);
  });

  it("filters out unknown keys", async () => {
    await PUT(putReq({ unknownKey: "value", siteName: "New Name" }));
    const savedCfg = mocks.savePlatformConfig.mock.calls[0][0] as Record<string, unknown>;
    expect("unknownKey" in savedCfg).toBe(false);
    expect("siteName" in savedCfg).toBe(true);
  });

  it("silently skips fields with type mismatch", async () => {
    // siteName is a string, passing number should be skipped
    await PUT(putReq({ siteName: 12345 }));
    const savedCfg = mocks.savePlatformConfig.mock.calls[0][0] as Record<string, unknown>;
    expect("siteName" in savedCfg).toBe(false);
  });

  it("passes numeric fields when types match", async () => {
    await PUT(putReq({ founding50Price: 1000 }));
    const savedCfg = mocks.savePlatformConfig.mock.calls[0][0] as Record<string, unknown>;
    expect(savedCfg.founding50Price).toBe(1000);
  });

  it("returns 500 when savePlatformConfig fails", async () => {
    mocks.savePlatformConfig.mockResolvedValue({ ok: false, error: "DB write failed" });
    const res = await PUT(putReq({ siteName: "New Name" }));
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.error).toBe("DB write failed");
  });

  it("happy path: returns ok:true", async () => {
    const res = await PUT(putReq({ siteName: "BlockID Updated" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
  });

  it("passes actor email to savePlatformConfig", async () => {
    await PUT(putReq({ siteName: "Test" }));
    expect(mocks.savePlatformConfig).toHaveBeenCalledWith(
      expect.any(Object),
      ADMIN_USER.email,
    );
  });
});

describe("PUT /api/admin/platform-config — G35 P1 Pricing v5 PAYG validation", () => {
  const PAYG_CURRENT = {
    ...CONFIG,
    payg_enabled: false,
    payg_snapshot_cents: 1900,
    payg_full_cents: 4900,
    payg_verified_cents: 14900,
    verified_sla_business_days: 2,
    payg_verified_max_open: 5,
  };

  beforeEach(() => {
    mocks.getPlatformConfig.mockResolvedValue(PAYG_CURRENT);
  });

  it("saves a valid PAYG change (flag on + new display price)", async () => {
    const res = await PUT(putReq({ payg_enabled: true, payg_full_cents: 5900 }));
    expect(res.status).toBe(200);
    const savedCfg = mocks.savePlatformConfig.mock.calls[0][0] as Record<string, unknown>;
    expect(savedCfg).toEqual({ payg_enabled: true, payg_full_cents: 5900 });
  });

  it("400s when a display price breaks Snapshot < Full < Verified against the CURRENT config (partial patch)", async () => {
    const res = await PUT(putReq({ payg_snapshot_cents: 4900 }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toMatch(/Snapshot < Full < Verified/);
    expect(mocks.savePlatformConfig).not.toHaveBeenCalled();
  });

  it("400s on fractional cents, an out-of-range SLA and a negative Verified cap", async () => {
    const res = await PUT(putReq({ payg_full_cents: 4900.5, verified_sla_business_days: 0, payg_verified_max_open: -1 }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect((body.errors as string[]).length).toBe(3);
    expect(mocks.savePlatformConfig).not.toHaveBeenCalled();
  });

  it("does not read the current config when the patch touches no PAYG key", async () => {
    await PUT(putReq({ siteName: "X" }));
    expect(mocks.getPlatformConfig).not.toHaveBeenCalled();
  });
});
