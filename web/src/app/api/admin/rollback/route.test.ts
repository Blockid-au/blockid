// Colocated vitest for POST /api/admin/rollback — P9-admin-rollback-route-test.
//
// The route is the one-click "revert to previous deploy" button on the
// admin console. It shells out to `bash scripts/deploy-live.sh --rollback`,
// writes a deploy_incidents row, and returns the log tail. Regressions here
// are all silent-and-critical: (a) dropping the admin gate so any logged-in
// user can trigger a production rollback, (b) shell injection via a crafted
// target_sha, (c) dropping the deploy_incidents insert so a rollback is
// forensically invisible, (d) drifting the response envelope the admin UI
// keys off, (e) throwing when the manifest file is missing so a fresh box
// 500s instead of returning a null pre_sha.

import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Mock plumbing (hoisted so module-eval sees the mocks) --------------

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn<() => Promise<{
    id: string;
    email: string;
    role?: "user" | "admin";
  } | null>>(),
  isSupabaseConfigured: vi.fn<() => boolean>(),
  getSupabaseAdmin: vi.fn<() => unknown>(),
  sendTelegram: vi.fn<(t: string) => Promise<boolean>>(),
  readFile: vi.fn<(p: string, enc?: string) => Promise<string>>(),
  spawn: vi.fn<(cmd: string, args: string[], opts?: unknown) => unknown>(),
  // Captured deploy_incidents insert payload (per test).
  insertPayload: null as unknown,
  insertError: null as null | { message: string },
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => mocks.getCurrentUser(),
}));

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => mocks.isSupabaseConfigured(),
  getSupabaseAdmin: () => mocks.getSupabaseAdmin(),
}));

vi.mock("@/lib/telegram", () => ({
  sendTelegram: (t: string) => mocks.sendTelegram(t),
}));

vi.mock("node:fs", () => ({
  promises: {
    readFile: (p: string, enc?: string) => mocks.readFile(p, enc),
  },
}));

vi.mock("node:child_process", () => ({
  spawn: (cmd: string, args: string[], opts?: unknown) => mocks.spawn(cmd, args, opts),
}));

import { POST } from "./route";

// --- Fixture helpers -----------------------------------------------------

const ADMIN = { id: "u-admin-1", email: "admin@blockid.au", role: "admin" as const };
const NON_ADMIN = { id: "u-42", email: "not-admin@example.com", role: "user" as const };

const DEPLOY_SCRIPT = "/home/dovanlong/blockid.au/web/scripts/deploy-live.sh";
const MANIFEST_PATH = "/home/dovanlong/blockid.au/web/.deploy-manifest.json";

interface FakeChild extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
}

// Build a fake spawn() result whose stdout/stderr push chunks synchronously
// and then close with the given exit code. The route awaits a Promise that
// resolves on the 'close' event, so we emit close on the next tick.
function fakeChild(opts: {
  stdout?: string;
  stderr?: string;
  exit?: number;
  errorAfterMs?: number;
}): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  setImmediate(() => {
    if (opts.stdout) child.stdout.emit("data", Buffer.from(opts.stdout));
    if (opts.stderr) child.stderr.emit("data", Buffer.from(opts.stderr));
    if (opts.errorAfterMs !== undefined) {
      setTimeout(() => child.emit("error", new Error("spawn ENOENT")), opts.errorAfterMs);
      setTimeout(() => child.emit("close", null), opts.errorAfterMs + 1);
    } else {
      child.emit("close", opts.exit ?? 0);
    }
  });
  return child;
}

function jsonReq(body: unknown): Request {
  return new Request("http://x/api/admin/rollback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function bareReq(body: string, contentType = "application/json"): Request {
  return new Request("http://x/api/admin/rollback", {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  });
}

async function jsonOf(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

// Build a supabase-admin double whose .from().insert() captures the payload
// and (optionally) surfaces an error via the .then() the route awaits.
function fakeSupabase(): unknown {
  return {
    from(table: string) {
      if (table !== "deploy_incidents") {
        throw new Error(`unexpected supabase.from(${table})`);
      }
      return {
        insert(payload: unknown) {
          mocks.insertPayload = payload;
          return {
            then(resolve: (v: { error: unknown }) => void) {
              resolve({ error: mocks.insertError });
              return { catch: () => undefined };
            },
          };
        },
      };
    },
  };
}

beforeEach(() => {
  mocks.getCurrentUser.mockReset().mockResolvedValue(ADMIN);
  mocks.isSupabaseConfigured.mockReset().mockReturnValue(true);
  mocks.getSupabaseAdmin.mockReset().mockReturnValue(fakeSupabase());
  mocks.sendTelegram.mockReset().mockResolvedValue(true);
  mocks.readFile.mockReset().mockResolvedValue(JSON.stringify({ git_sha: "abcdef1234" }));
  // Default log emits "smoke ok" so the smoke-inference regex flips true.
  // See inferSmokePassed() at route.ts:82 — matches /smoke.*(?:ok|pass|✓)/i.
  mocks.spawn.mockReset().mockImplementation(() =>
    fakeChild({ stdout: "rollback ok\nsmoke ok — 3 endpoints checked\n", exit: 0 }),
  );
  mocks.insertPayload = null;
  mocks.insertError = null;
});

afterEach(() => {
  vi.clearAllMocks();
});

// -------------------------------------------------------------------------
describe("auth gate", () => {
  it("returns 401 when getCurrentUser() is null and never spawns the deploy script", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await POST(jsonReq({}));
    expect(res.status).toBe(401);
    expect(await jsonOf(res)).toEqual({ error: "unauthorized" });
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it("returns 403 when the caller is authenticated but role !== 'admin' — never spawns and never inserts", async () => {
    mocks.getCurrentUser.mockResolvedValue(NON_ADMIN);
    const res = await POST(jsonReq({}));
    expect(res.status).toBe(403);
    expect(await jsonOf(res)).toEqual({ error: "forbidden" });
    expect(mocks.spawn).not.toHaveBeenCalled();
    expect(mocks.insertPayload).toBeNull();
  });

  it("does not touch supabase or telegram on the 401 path (no state leak / no noise on strangers)", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    await POST(jsonReq({}));
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
    expect(mocks.sendTelegram).not.toHaveBeenCalled();
  });
});

// -------------------------------------------------------------------------
describe("target_sha validation", () => {
  it("rejects target_sha with non-hex characters — shell-injection guard", async () => {
    const res = await POST(jsonReq({ target_sha: "abc; rm -rf /" }));
    expect(res.status).toBe(400);
    expect(await jsonOf(res)).toEqual({ error: "invalid target_sha format" });
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it("rejects target_sha shorter than 7 chars (git short-sha minimum)", async () => {
    const res = await POST(jsonReq({ target_sha: "abcdef" }));
    expect(res.status).toBe(400);
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it("rejects target_sha longer than 40 chars (git sha maximum)", async () => {
    const res = await POST(jsonReq({ target_sha: "a".repeat(41) }));
    expect(res.status).toBe(400);
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it("accepts a valid 7-char short sha and forwards it via --target", async () => {
    await POST(jsonReq({ target_sha: "abcdef0" }));
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
    const [cmd, args] = mocks.spawn.mock.calls[0];
    expect(cmd).toBe("bash");
    expect(args).toEqual([DEPLOY_SCRIPT, "--rollback", "--target", "abcdef0"]);
  });

  it("accepts a full 40-char sha and forwards it via --target", async () => {
    const sha = "1234567890abcdef1234567890abcdef12345678";
    await POST(jsonReq({ target_sha: sha }));
    const [, args] = mocks.spawn.mock.calls[0];
    expect(args).toEqual([DEPLOY_SCRIPT, "--rollback", "--target", sha]);
  });

  it("omits --target entirely when target_sha is absent (default rollback to previous release)", async () => {
    await POST(jsonReq({}));
    const [, args] = mocks.spawn.mock.calls[0];
    expect(args).toEqual([DEPLOY_SCRIPT, "--rollback"]);
  });
});

// -------------------------------------------------------------------------
describe("body parsing", () => {
  it("handles a missing / non-JSON body without throwing — a bodyless click still runs the rollback", async () => {
    const req = new Request("http://x/api/admin/rollback", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    // No --target arg because no body was supplied.
    const [, args] = mocks.spawn.mock.calls[0];
    expect(args).toEqual([DEPLOY_SCRIPT, "--rollback"]);
  });

  it("swallows malformed JSON — the route treats an unparseable body as empty rather than 500", async () => {
    const res = await POST(bareReq("{not json"));
    expect(res.status).toBe(200);
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
  });

  it("accepts application/x-www-form-urlencoded submissions (admin dashboard fallback form path)", async () => {
    const req = bareReq("target_sha=abcdef1&reason=canary_fail", "application/x-www-form-urlencoded");
    const res = await POST(req);
    expect(res.status).toBe(200);
    const [, args] = mocks.spawn.mock.calls[0];
    expect(args).toEqual([DEPLOY_SCRIPT, "--rollback", "--target", "abcdef1"]);
    expect(mocks.insertPayload).not.toBeNull();
    expect((mocks.insertPayload as { detail: { reason: string } }).detail.reason).toBe("canary_fail");
  });
});

// -------------------------------------------------------------------------
describe("smoke-check inference", () => {
  it("flags smoke_passed=false when the deploy log contains an ✗ smoke line", async () => {
    mocks.spawn.mockImplementationOnce(() =>
      fakeChild({ stdout: "✓ smoke: /  200\n✗ smoke: /pricing timeout\n", exit: 0 }),
    );
    const res = await POST(jsonReq({}));
    const body = await jsonOf(res);
    expect(body.smoke_passed).toBe(false);
  });

  it("flags smoke_passed=false when the deploy log contains the word 'smoke fail'", async () => {
    mocks.spawn.mockImplementationOnce(() =>
      fakeChild({ stdout: "smoke check failed after 3 retries\n", exit: 0 }),
    );
    const body = await jsonOf(await POST(jsonReq({})));
    expect(body.smoke_passed).toBe(false);
  });

  it("flags smoke_passed=true when the deploy log contains 'smoke ok' or a ✓ after the word smoke", async () => {
    mocks.spawn.mockImplementationOnce(() =>
      fakeChild({ stdout: "smoke ok — 3/3 endpoints returned 200\n", exit: 0 }),
    );
    const body = await jsonOf(await POST(jsonReq({})));
    expect(body.smoke_passed).toBe(true);
  });

  it("flags smoke_passed=false when the deploy log has no smoke assertion at all (defensive default)", async () => {
    mocks.spawn.mockImplementationOnce(() =>
      fakeChild({ stdout: "starting rollback...\ndone\n", exit: 0 }),
    );
    const body = await jsonOf(await POST(jsonReq({})));
    // No ✓ smoke / smoke ok anywhere → inference returns false.
    expect(body.smoke_passed).toBe(false);
  });
});

// -------------------------------------------------------------------------
describe("response envelope", () => {
  it("returns HTTP 200 + { ok: true, ... } on a successful rollback (admin UI keys off ok+exit_code)", async () => {
    const res = await POST(jsonReq({}));
    expect(res.status).toBe(200);
    const body = await jsonOf(res);
    expect(body.ok).toBe(true);
    expect(body.exit_code).toBe(0);
    expect(body).toHaveProperty("rolled_back_to");
    expect(body).toHaveProperty("smoke_passed");
    expect(body).toHaveProperty("duration_ms");
    expect(body).toHaveProperty("log_tail");
    expect(body).toHaveProperty("stderr_tail");
  });

  it("returns HTTP 500 + { ok: false, exit_code: !0 } when deploy-live.sh exits non-zero", async () => {
    mocks.spawn.mockImplementationOnce(() =>
      fakeChild({ stdout: "smoke fail\n", stderr: "boom\n", exit: 1 }),
    );
    const res = await POST(jsonReq({}));
    expect(res.status).toBe(500);
    const body = await jsonOf(res);
    expect(body.ok).toBe(false);
    expect(body.exit_code).toBe(1);
  });

  it("returns exit_code=-1 when spawn emits 'error' (missing bash / missing script)", async () => {
    mocks.spawn.mockImplementationOnce(() => fakeChild({ errorAfterMs: 1 }));
    const res = await POST(jsonReq({}));
    expect(res.status).toBe(500);
    const body = await jsonOf(res);
    expect(body.exit_code).toBe(-1);
    expect(String(body.stderr_tail)).toMatch(/spawn ENOENT/);
  });

  it("caps log_tail at 4000 chars and stderr_tail at 2000 chars — response body must not balloon on chatty deploys", async () => {
    const big = "x".repeat(9000);
    mocks.spawn.mockImplementationOnce(() =>
      fakeChild({ stdout: big + "\n✓ smoke: / 200", stderr: big, exit: 0 }),
    );
    const body = await jsonOf(await POST(jsonReq({})));
    expect((body.log_tail as string).length).toBeLessThanOrEqual(4000);
    expect((body.stderr_tail as string).length).toBeLessThanOrEqual(2000);
    // The tail slice must keep the END of the log so the smoke line survives.
    expect(body.log_tail).toContain("✓ smoke: / 200");
  });
});

// -------------------------------------------------------------------------
describe("manifest read", () => {
  it("returns rolled_back_to = post_sha from the manifest after the rollback flip", async () => {
    mocks.readFile
      .mockResolvedValueOnce(JSON.stringify({ git_sha: "OLD_SHA" }))
      .mockResolvedValueOnce(JSON.stringify({ git_sha: "PREVIOUS_SHA" }));
    const body = await jsonOf(await POST(jsonReq({})));
    expect(body.rolled_back_to).toBe("PREVIOUS_SHA");
  });

  it("falls back to `sha` when the manifest omits `git_sha` (older manifest format)", async () => {
    mocks.readFile.mockResolvedValue(JSON.stringify({ sha: "ONLY_SHA_FIELD" }));
    const body = await jsonOf(await POST(jsonReq({})));
    expect(body.rolled_back_to).toBe("ONLY_SHA_FIELD");
  });

  it("does not throw when the manifest file is missing (fresh box / first deploy) — pre_sha and post_sha both surface as null", async () => {
    mocks.readFile.mockRejectedValue(new Error("ENOENT"));
    const res = await POST(jsonReq({}));
    expect(res.status).toBe(200);
    const body = await jsonOf(res);
    expect(body.rolled_back_to).toBeNull();
    // Insert still fires with pre_sha=null + post_sha=null so the incident is
    // forensically visible even when the manifest is unreadable.
    const payload = mocks.insertPayload as { detail: { pre_sha: unknown; post_sha: unknown } };
    expect(payload.detail.pre_sha).toBeNull();
    expect(payload.detail.post_sha).toBeNull();
  });

  it("falls back to body.target_sha when the manifest is unreadable but the caller supplied one", async () => {
    mocks.readFile.mockRejectedValue(new Error("ENOENT"));
    const body = await jsonOf(await POST(jsonReq({ target_sha: "deadbeef" })));
    expect(body.rolled_back_to).toBe("deadbeef");
  });

  it("reads the fixed manifest path both before and after the deploy script runs (pre/post sha diff)", async () => {
    await POST(jsonReq({}));
    expect(mocks.readFile).toHaveBeenCalledTimes(2);
    expect(mocks.readFile.mock.calls[0][0]).toBe(MANIFEST_PATH);
    expect(mocks.readFile.mock.calls[1][0]).toBe(MANIFEST_PATH);
  });
});

// -------------------------------------------------------------------------
describe("deploy_incidents insert", () => {
  it("writes a deploy_incidents row with kind='rollback' + severity='critical' + task_id='manual'", async () => {
    await POST(jsonReq({}));
    const payload = mocks.insertPayload as {
      kind: string;
      severity: string;
      task_id: string;
    };
    expect(payload.kind).toBe("rollback");
    expect(payload.severity).toBe("critical");
    expect(payload.task_id).toBe("manual");
  });

  it("stamps detail.initiated_by with the admin's email so the incident is attributable", async () => {
    await POST(jsonReq({ reason: "test rollback" }));
    const payload = mocks.insertPayload as { detail: { initiated_by: string; reason: string } };
    expect(payload.detail.initiated_by).toBe(ADMIN.email);
    expect(payload.detail.reason).toBe("test rollback");
  });

  it("defaults detail.reason to 'manual' when the caller omits reason", async () => {
    await POST(jsonReq({}));
    const payload = mocks.insertPayload as { detail: { reason: string } };
    expect(payload.detail.reason).toBe("manual");
  });

  it("marks the row resolved (resolved_at + resolved_by) only when exit_code=0 AND smoke_passed=true", async () => {
    await POST(jsonReq({}));
    const okPayload = mocks.insertPayload as {
      resolved_at: string | null;
      resolved_by: string | null;
    };
    expect(typeof okPayload.resolved_at).toBe("string");
    expect(okPayload.resolved_by).toBe(ADMIN.email);
  });

  it("leaves resolved_at + resolved_by null when the rollback fails smoke check even if exit_code=0", async () => {
    mocks.spawn.mockImplementationOnce(() =>
      fakeChild({ stdout: "✗ smoke: /pricing failed\n", exit: 0 }),
    );
    await POST(jsonReq({}));
    const p = mocks.insertPayload as { resolved_at: unknown; resolved_by: unknown };
    expect(p.resolved_at).toBeNull();
    expect(p.resolved_by).toBeNull();
  });

  it("does NOT insert when supabase is not configured (isSupabaseConfigured=false)", async () => {
    mocks.isSupabaseConfigured.mockReturnValue(false);
    const res = await POST(jsonReq({}));
    expect(res.status).toBe(200);
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
    expect(mocks.insertPayload).toBeNull();
  });

  it("does NOT throw when getSupabaseAdmin() returns null (env drift after boot)", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(null);
    const res = await POST(jsonReq({}));
    expect(res.status).toBe(200);
    expect(mocks.insertPayload).toBeNull();
  });
});

// -------------------------------------------------------------------------
describe("telegram notification", () => {
  it("sends a Telegram summary line naming the admin + rolled-back sha + smoke result", async () => {
    await POST(jsonReq({}));
    expect(mocks.sendTelegram).toHaveBeenCalledTimes(1);
    const msg = mocks.sendTelegram.mock.calls[0][0];
    expect(msg).toContain(ADMIN.email);
    expect(msg).toContain("smoke ok");
  });

  it("reports 'smoke FAIL' when the rollback did not pass the smoke check", async () => {
    mocks.spawn.mockImplementationOnce(() =>
      fakeChild({ stdout: "✗ smoke: /  500\n", exit: 1 }),
    );
    await POST(jsonReq({}));
    const msg = mocks.sendTelegram.mock.calls[0][0];
    expect(msg).toContain("smoke FAIL");
  });

  it("does not throw when sendTelegram rejects (best-effort — a Telegram outage must not swallow the response)", async () => {
    mocks.sendTelegram.mockRejectedValue(new Error("network"));
    const res = await POST(jsonReq({}));
    expect(res.status).toBe(200);
  });
});
