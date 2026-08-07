// Colocated vitest for POST /api/cron/agent-healthcheck — P9-agent-healthcheck-route-test.
//
// Daily comprehensive QA + Security + Ops agent. Runs many exec calls +
// async curl probes + Supabase count queries + Redis ping. This test focuses
// on the surface every cron runner + on-call operator relies on: (1) auth
// gate; (2) rate-limit gate returns 429 (unlike agent-guardian, which
// returns 200/skipped); (3) response shape survives all downstream failures
// (a broken curl / redis / disk shell command must NOT 5xx the endpoint).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  process.env.CRON_SECRET = "test_cron_secret";
  return {
    sendTelegramMock: vi.fn<(text: string) => Promise<void>>(),
    sendEmailMock: vi.fn<(m: { to: string; subject: string; html: string }) => Promise<void>>(),
    checkRateLimitMock: vi.fn<(k: string, m: number, w: number) => {
      allowed: boolean;
      resetIn: number;
    }>(),
    getSupabaseAdminMock: vi.fn<() => unknown | null>(),
    execSyncMock: vi.fn<(cmd: string, opts?: unknown) => string>(),
    execMock: vi.fn<(
      cmd: string,
      opts: unknown,
      cb: (err: Error | null, stdout: string, stderr: string) => void,
    ) => void>(),
    existsSyncMock: vi.fn<(p: string) => boolean>(),
    readFileSyncMock: vi.fn<(p: string, enc?: string) => string>(),
    writeFileSyncMock: vi.fn<(p: string, d: string, enc?: string) => void>(),
    statSyncMock: vi.fn<(p: string) => { size: number }>(),
    truncateSyncMock: vi.fn<(p: string, len: number) => void>(),
    mkdirSyncMock: vi.fn<(p: string, opts: { recursive: boolean }) => void>(),
  };
});

vi.mock("child_process", () => ({
  execSync: (cmd: string, opts?: unknown) => mocks.execSyncMock(cmd, opts),
  exec: (
    cmd: string,
    opts: unknown,
    cb: (err: Error | null, stdout: string, stderr: string) => void,
  ) => mocks.execMock(cmd, opts, cb),
}));

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    existsSync: (p: string) => mocks.existsSyncMock(p),
    readFileSync: (p: string, enc?: string) => mocks.readFileSyncMock(p, enc),
    writeFileSync: (p: string, d: string, enc?: string) => mocks.writeFileSyncMock(p, d, enc),
    statSync: (p: string) => mocks.statSyncMock(p),
    truncateSync: (p: string, l: number) => mocks.truncateSyncMock(p, l),
    mkdirSync: (p: string, opts: { recursive: boolean }) => mocks.mkdirSyncMock(p, opts),
  };
});

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => mocks.getSupabaseAdminMock(),
}));

vi.mock("@/lib/telegram", () => ({
  sendTelegram: (t: string) => mocks.sendTelegramMock(t),
  mdEscape: (s: string) => s,
}));

vi.mock("@/lib/email", () => ({
  sendEmail: (m: Parameters<typeof mocks.sendEmailMock>[0]) => mocks.sendEmailMock(m),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (k: string, m: number, w: number) => mocks.checkRateLimitMock(k, m, w),
}));

import { POST, dynamic, maxDuration } from "./route";

function req(headers: Record<string, string> = {}): Request {
  return new Request("http://x/api/cron/agent-healthcheck", { method: "POST", headers });
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  process.env.CRON_SECRET = "test_cron_secret";
  mocks.sendTelegramMock.mockReset().mockResolvedValue(undefined);
  mocks.sendEmailMock.mockReset().mockResolvedValue(undefined);
  mocks.checkRateLimitMock.mockReset().mockReturnValue({ allowed: true, resetIn: 0 });
  mocks.getSupabaseAdminMock.mockReset().mockReturnValue(null); // no DB in default
  mocks.execSyncMock.mockReset().mockImplementation(() => "");
  mocks.execMock.mockReset().mockImplementation((_cmd, _opts, cb) => {
    // Best-effort default: succeed with empty stdout.
    setImmediate(() => cb(null, "", ""));
  });
  mocks.existsSyncMock.mockReset().mockReturnValue(false);
  mocks.readFileSyncMock.mockReset().mockImplementation(() => "");
  mocks.writeFileSyncMock.mockReset();
  mocks.statSyncMock.mockReset().mockReturnValue({ size: 100 });
  mocks.truncateSyncMock.mockReset();
  mocks.mkdirSyncMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

// -----------------------------------------------------------------------------
// Module invariants
// -----------------------------------------------------------------------------

describe("agent-healthcheck — module invariants", () => {
  it("exports dynamic='force-dynamic'", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("exports maxDuration=300 (longer runtime than guardian)", () => {
    expect(maxDuration).toBe(300);
  });
});

// -----------------------------------------------------------------------------
// Auth gate
// -----------------------------------------------------------------------------

describe("agent-healthcheck — auth gate", () => {
  it("returns 401 without Bearer header", async () => {
    const res = await POST(req());
    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 for a wrong Bearer token", async () => {
    const res = await POST(req({ authorization: "Bearer nope" }));
    expect(res.status).toBe(401);
  });

  it("MUST NOT run any exec when auth fails", async () => {
    await POST(req());
    expect(mocks.execSyncMock).not.toHaveBeenCalled();
  });

  it("MUST NOT send Telegram when auth fails", async () => {
    await POST(req());
    expect(mocks.sendTelegramMock).not.toHaveBeenCalled();
  });

  it("MUST NOT send email when auth fails", async () => {
    await POST(req());
    expect(mocks.sendEmailMock).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// Rate limit — returns 429 (differs from agent-guardian's 200/skipped)
// -----------------------------------------------------------------------------

describe("agent-healthcheck — rate limit", () => {
  it("returns 429 when rate-limited (heavier route, hard fail)", async () => {
    // Different from agent-guardian: this route is heavier and only meant
    // to run twice per 30-min window. Pin the 429 (not 200/skipped).
    mocks.checkRateLimitMock.mockReturnValue({ allowed: false, resetIn: 20_000 });
    const res = await POST(req({ authorization: "Bearer test_cron_secret" }));
    expect(res.status).toBe(429);
    const body = await json(res);
    expect(body.error).toBe("Rate limited");
    expect(body.resetIn).toBe(20_000);
  });

  it("uses cron:agent-healthcheck key, 2 runs / 30-min window", async () => {
    await POST(req({ authorization: "Bearer test_cron_secret" }));
    expect(mocks.checkRateLimitMock).toHaveBeenCalledWith(
      "cron:agent-healthcheck",
      2,
      30 * 60 * 1000,
    );
  });

  it("MUST NOT run checks when rate-limited", async () => {
    mocks.checkRateLimitMock.mockReturnValue({ allowed: false, resetIn: 5_000 });
    await POST(req({ authorization: "Bearer test_cron_secret" }));
    expect(mocks.execSyncMock).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// Happy path — response shape
// -----------------------------------------------------------------------------

describe("agent-healthcheck — happy path shape", () => {
  it("returns 200 with { ok, date, status, summary, checks[] }", async () => {
    const res = await POST(req({ authorization: "Bearer test_cron_secret" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body).toHaveProperty("date");
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("summary");
    expect(body).toHaveProperty("checks");
    expect(Array.isArray(body.checks)).toBe(true);
  });

  it("summary has { passed, warned, failed, fixed, total }", async () => {
    const res = await POST(req({ authorization: "Bearer test_cron_secret" }));
    const body = await json(res);
    const summary = body.summary as Record<string, number>;
    for (const key of ["passed", "warned", "failed", "fixed", "total"]) {
      expect(summary).toHaveProperty(key);
      expect(typeof summary[key]).toBe("number");
    }
  });

  it("status is one of GREEN / YELLOW / RED", async () => {
    const res = await POST(req({ authorization: "Bearer test_cron_secret" }));
    const body = await json(res);
    expect(["GREEN", "YELLOW", "RED"]).toContain(body.status);
  });

  it("date is YYYY-MM-DD (today)", async () => {
    const res = await POST(req({ authorization: "Bearer test_cron_secret" }));
    const body = await json(res);
    expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("always emits TypeScript + ESLint pass rows (deploy-time gates)", async () => {
    const res = await POST(req({ authorization: "Bearer test_cron_secret" }));
    const body = await json(res);
    const checks = body.checks as Array<Record<string, unknown>>;
    expect(checks.some((c) => c.check === "TypeScript")).toBe(true);
    expect(checks.some((c) => c.check === "ESLint")).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// Telegram + Email always sent (regardless of status)
// -----------------------------------------------------------------------------

describe("agent-healthcheck — always alerts", () => {
  it("sends Telegram on every successful run (daily digest)", async () => {
    await POST(req({ authorization: "Bearer test_cron_secret" }));
    expect(mocks.sendTelegramMock).toHaveBeenCalledTimes(1);
  });

  it("sends email to admin on every successful run", async () => {
    await POST(req({ authorization: "Bearer test_cron_secret" }));
    expect(mocks.sendEmailMock).toHaveBeenCalledTimes(1);
    const call = mocks.sendEmailMock.mock.calls[0]?.[0];
    expect(call?.to).toBe("admin@blockid.au");
    expect(String(call?.subject)).toContain("BlockID QA");
  });

  it("writes a markdown report to content/reports/qa-daily-<date>.md", async () => {
    await POST(req({ authorization: "Bearer test_cron_secret" }));
    const write = mocks.writeFileSyncMock.mock.calls.find(
      (c) => String(c[0]).includes("qa-daily-"),
    );
    expect(write).toBeDefined();
  });
});

// -----------------------------------------------------------------------------
// Failure resilience — a shell / DB / redis blip must NOT 5xx
// -----------------------------------------------------------------------------

describe("agent-healthcheck — failure resilience", () => {
  it("returns 200 even when every execSync throws (best-effort)", async () => {
    mocks.execSyncMock.mockImplementation(() => {
      throw new Error("shell timeout");
    });
    const res = await POST(req({ authorization: "Bearer test_cron_secret" }));
    expect(res.status).toBe(200);
  });

  it("returns 200 when the async curl exec fails", async () => {
    mocks.execMock.mockImplementation((_cmd, _opts, cb) => {
      setImmediate(() => cb(new Error("curl timeout"), "", ""));
    });
    const res = await POST(req({ authorization: "Bearer test_cron_secret" }));
    expect(res.status).toBe(200);
  });

  it("returns 200 even when Supabase count query throws (DB down)", async () => {
    mocks.getSupabaseAdminMock.mockReturnValue({
      from() {
        return {
          select() {
            throw new Error("db down");
          },
        };
      },
    });
    const res = await POST(req({ authorization: "Bearer test_cron_secret" }));
    expect(res.status).toBe(200);
  });
});
