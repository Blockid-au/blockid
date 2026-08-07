// Colocated vitest for POST /api/cron/agent-guardian — P9-agent-guardian-route-test.
//
// Auto-guardian runs every 10 minutes: collects 10 system metrics via
// child_process.execSync, auto-remediates DANGER thresholds, and sends
// Telegram + Email alerts on repeat conditions. The route surface itself
// (auth gate, rate-limit gate, response shape) is straightforward — the
// heavy execSync + fs body is best-effort and swallows failures internally.
//
// This suite pins the load-bearing behaviours the ops team relies on:
//   - CRON_SECRET Bearer gate (never bypassable);
//   - checkRateLimit 8-per-10min window (skips gracefully with 200 rather
//     than 429 when we ran recently, so cron doesn't spam-fail);
//   - happy-path response shape (status, metrics, danger, fixes, ...)
//     — every field the /admin/goals dashboard reads.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  process.env.CRON_SECRET = "test_cron_secret";
  return {
    sendTelegramMock: vi.fn<(text: string, mode?: string) => Promise<void>>(),
    sendEmailMock: vi.fn<(msg: {
      to: string;
      subject: string;
      html: string;
    }) => Promise<void>>(),
    checkRateLimitMock: vi.fn<(key: string, max: number, windowMs: number) => {
      allowed: boolean;
      resetIn: number;
    }>(),
    execSyncMock: vi.fn<(cmd: string, opts?: unknown) => string>(),
    readFileSyncMock: vi.fn<(path: string, enc?: string) => string>(),
    writeFileSyncMock: vi.fn<(path: string, data: string, enc?: string) => void>(),
    appendFileSyncMock: vi.fn<(path: string, data: string) => void>(),
    existsSyncMock: vi.fn<(path: string) => boolean>(),
  };
});

vi.mock("child_process", () => ({
  execSync: (cmd: string, opts?: unknown) => mocks.execSyncMock(cmd, opts),
}));

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    readFileSync: (p: string, enc?: string) => mocks.readFileSyncMock(p, enc),
    writeFileSync: (p: string, d: string, enc?: string) => mocks.writeFileSyncMock(p, d, enc),
    appendFileSync: (p: string, d: string) => mocks.appendFileSyncMock(p, d),
    existsSync: (p: string) => mocks.existsSyncMock(p),
  };
});

vi.mock("@/lib/telegram", () => ({
  sendTelegram: (t: string, m?: string) => mocks.sendTelegramMock(t, m),
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
  return new Request("http://x/api/cron/agent-guardian", { method: "POST", headers });
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  process.env.CRON_SECRET = "test_cron_secret";
  mocks.sendTelegramMock.mockReset().mockResolvedValue(undefined);
  mocks.sendEmailMock.mockReset().mockResolvedValue(undefined);
  mocks.checkRateLimitMock.mockReset().mockReturnValue({ allowed: true, resetIn: 0 });
  // Route the exec mock so every metric parser lands in the "ok" band
  // (<=60%). The route runs many small commands via `run()`; we key on
  // substring so the shell pipelines stay opaque to the test.
  mocks.execSyncMock.mockReset().mockImplementation((cmd: string) => {
    // pgrep for the server pid → return a fake pid.
    if (cmd.includes("pgrep")) return "12345";
    // /proc/<pid>/fd count for open-files → 100.
    if (cmd.includes("/proc/") && cmd.includes("/fd")) return "100";
    // /proc/<pid>/limits Max open files → 65536.
    if (cmd.includes("Max open files")) return "65536";
    // nproc — many cores so load/cores stays low.
    if (cmd.trim() === "nproc") return "50";
    // load average → 0.1 → 0/50 cores → 0%.
    if (cmd.includes("/proc/loadavg")) return "0.10";
    // Zombie count → 0 → 0%.
    if (cmd.includes("$8==\"Z\"")) return "0";
    // /tmp size in MB → 100 → below every band.
    if (cmd.includes("du -sm /tmp")) return "100";
    // Node RSS (MB) → 0 → 0%.
    if (cmd.includes("next-server")) return "0";
    // free -m totalMem → 1024.
    if (cmd.includes("free -m")) return "1024";
    // free (swap NR==3) → 0 used / 100 total → 0%.
    if (cmd.includes("free ") && cmd.includes("NR==3")) return "0";
    // free (memory NR==2) → 30% used, 300MB / 1000MB.
    if (cmd.includes("free ") && cmd.includes("NR==2")) return "30 300 1000";
    // df / and df /data — 30% used.
    if (cmd.startsWith("df /") || cmd.includes("df /data")) return "30 500G";
    // df -i / inodes — 30%.
    if (cmd.includes("df -i")) return "30";
    // Everything else → empty string (route already null-guards).
    return "";
  });
  mocks.readFileSyncMock.mockReset().mockImplementation(() => JSON.stringify({ lastAlerts: {} }));
  mocks.writeFileSyncMock.mockReset();
  mocks.appendFileSyncMock.mockReset();
  mocks.existsSyncMock.mockReset().mockReturnValue(false);
});

afterEach(() => {
  vi.clearAllMocks();
});

// -----------------------------------------------------------------------------
// Module invariants
// -----------------------------------------------------------------------------

describe("agent-guardian — module invariants", () => {
  it("exports dynamic='force-dynamic'", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("exports maxDuration=120 (guardian is bounded)", () => {
    expect(maxDuration).toBe(120);
  });
});

// -----------------------------------------------------------------------------
// Auth gate
// -----------------------------------------------------------------------------

describe("agent-guardian — auth gate", () => {
  it("returns 401 without Bearer header", async () => {
    const res = await POST(req());
    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 for a wrong Bearer token", async () => {
    const res = await POST(req({ authorization: "Bearer wrong" }));
    expect(res.status).toBe(401);
  });

  it("MUST NOT collect metrics (execSync) when auth fails", async () => {
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
// Rate limit — graceful skip (not 429)
// -----------------------------------------------------------------------------

describe("agent-guardian — rate limit", () => {
  it("returns 200 { ok:true, skipped:true } when rate-limited (not 429)", async () => {
    // Pin the graceful-skip behaviour — cron runners treat 429 as failure,
    // so the guardian returns 200/skipped instead when it ran recently.
    mocks.checkRateLimitMock.mockReturnValue({ allowed: false, resetIn: 60_000 });
    const res = await POST(req({ authorization: "Bearer test_cron_secret" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).toMatchObject({ ok: true, skipped: true });
    expect(body.reason).toBe("ran recently");
  });

  it("uses cron:agent-guardian key, 8/10-min window", async () => {
    await POST(req({ authorization: "Bearer test_cron_secret" }));
    expect(mocks.checkRateLimitMock).toHaveBeenCalledWith(
      "cron:agent-guardian",
      8,
      10 * 60 * 1000,
    );
  });

  it("MUST NOT collect metrics when rate-limited", async () => {
    mocks.checkRateLimitMock.mockReturnValue({ allowed: false, resetIn: 60_000 });
    await POST(req({ authorization: "Bearer test_cron_secret" }));
    expect(mocks.execSyncMock).not.toHaveBeenCalled();
  });

  it("returns the reset time in the skipped payload", async () => {
    mocks.checkRateLimitMock.mockReturnValue({ allowed: false, resetIn: 12_345 });
    const res = await POST(req({ authorization: "Bearer test_cron_secret" }));
    const body = await json(res);
    expect(body.resetIn).toBe(12_345);
  });
});

// -----------------------------------------------------------------------------
// Happy path — response shape
// -----------------------------------------------------------------------------

describe("agent-guardian — happy path response shape", () => {
  it("returns 200 with { ok, status, metrics, danger, fixes, recheck, criticalErrors, alertSent }", async () => {
    const res = await POST(req({ authorization: "Bearer test_cron_secret" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("metrics");
    expect(body).toHaveProperty("danger");
    expect(body).toHaveProperty("fixes");
    expect(body).toHaveProperty("recheck");
    expect(body).toHaveProperty("criticalErrors");
    expect(body).toHaveProperty("alertSent");
  });

  it("returns status=HEALTHY when every metric is <=60% (all 'ok' level)", async () => {
    // Default exec returns "50 100" for every call → 50% → ok level.
    const res = await POST(req({ authorization: "Bearer test_cron_secret" }));
    const body = await json(res);
    expect(body.status).toBe("HEALTHY");
    expect(body.danger).toEqual([]);
    expect(body.alertSent).toBe(false);
  });

  it("emits a metrics object keyed by every metric name", async () => {
    const res = await POST(req({ authorization: "Bearer test_cron_secret" }));
    const body = await json(res);
    const metrics = body.metrics as Record<string, unknown>;
    // Pin every metric name — regressions renaming these would break the
    // /admin/goals guardian dashboard silently.
    for (const name of [
      "disk", "data_disk", "memory", "cpu", "inodes",
      "swap", "node_memory", "open_files", "zombies", "tmp_size",
    ]) {
      expect(metrics).toHaveProperty(name);
    }
  });

  it("does NOT send Telegram when no metrics are in danger", async () => {
    await POST(req({ authorization: "Bearer test_cron_secret" }));
    expect(mocks.sendTelegramMock).not.toHaveBeenCalled();
  });

  it("does NOT send email when no metrics are in danger", async () => {
    await POST(req({ authorization: "Bearer test_cron_secret" }));
    expect(mocks.sendEmailMock).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// State persistence
// -----------------------------------------------------------------------------

describe("agent-guardian — state persistence", () => {
  it("writes /tmp guardian state file on every run (state save)", async () => {
    await POST(req({ authorization: "Bearer test_cron_secret" }));
    const stateWrite = mocks.writeFileSyncMock.mock.calls.find(
      (c) => String(c[0]).includes("guardian-state"),
    );
    expect(stateWrite).toBeDefined();
  });

  it("appends the run to guardian-history.jsonl (audit trail)", async () => {
    await POST(req({ authorization: "Bearer test_cron_secret" }));
    const append = mocks.appendFileSyncMock.mock.calls.find(
      (c) => String(c[0]).includes("guardian-history"),
    );
    expect(append).toBeDefined();
    const payload = String(append?.[1] ?? "");
    const parsed = JSON.parse(payload.trim()) as Record<string, unknown>;
    expect(parsed).toHaveProperty("ts");
    expect(parsed).toHaveProperty("status");
    expect(parsed).toHaveProperty("metrics");
  });
});
