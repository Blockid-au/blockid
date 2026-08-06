// Colocated vitest for POST /api/cron/milestone-report — P9 ship-readiness
// regression gate for the per-milestone C-Level breakdown reporter cited in
// docs/plans/atlassian-standard-mapping-goal.md (§P9_ship: "regression tests
// for legal + walkthrough + ship surfaces").
//
// The route is invoked (a) inline from agent-orchestrator after a milestone
// lands and (b) hourly as a defensive sweep. Losing any of these behaviours
// is user-visible or noisy in a way admin@blockid.au will feel immediately:
//   * losing the Bearer gate opens milestone spam to anyone hitting the URL
//   * losing the rate-limit guard lets a wedged inline caller flood telegram
//   * losing the 24h first-run backfill spams admin with 20 years of
//     historical milestones every time the state file gets nuked
//   * losing the per-milestone try/catch means one bad milestone poisons the
//     whole sweep and the reported set is never advanced (permanent retry loop)
//   * losing the telegram/email swallow means a transient network blip
//     rolls back the file write and the milestone reports twice on the next
//     hourly sweep
//   * losing the version-string sanitiser lets `v1.2.0/rc1` write to
//     `milestone-<id>-v1.2.0/rc1.md` and blow up mkdir on the slash
//   * losing the taskId filter attaches unrelated tasks to the wrong
//     milestone in the breakdown
//   * losing the report-state.json shape breaks the loader's silent-catch
//     which then treats every subsequent run as a first run (spam again)

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// CRON_SECRET is captured at module load (const CRON_SECRET = process.env.CRON_SECRET),
// so it must be set BEFORE the `import { POST } from "./route"` at the bottom of
// this file. vi.hoisted runs before imports; beforeEach cannot help here.
const SECRET = "cron-secret-milestone-test";
vi.hoisted(() => {
  process.env.CRON_SECRET = "cron-secret-milestone-test";
});

// ── fs fake — in-memory read/write so the route can write its markdown
//    reports + state file without touching web/content/reports/. Only the
//    calls the route actually uses are implemented.

const fsStore = new Map<string, string>();
const fsMkdirCalls: Array<{ path: string; opts: unknown }> = [];

vi.mock("fs", () => ({
  readFileSync: (path: string) => {
    if (!fsStore.has(path)) {
      const err = new Error(`ENOENT: no such file or directory, open '${path}'`) as NodeJS.ErrnoException;
      err.code = "ENOENT";
      throw err;
    }
    return fsStore.get(path)!;
  },
  writeFileSync: (path: string, data: string) => {
    fsStore.set(path, data);
  },
  mkdirSync: (path: string, opts: unknown) => {
    fsMkdirCalls.push({ path, opts });
  },
}));

// ── project-state — hand-rolled loadProjectState with a fixture setter ──

import type { Milestone, PlanTask, ProjectState } from "@/lib/project-state";

let projectStateFixture: ProjectState = emptyProjectState();

function emptyProjectState(): ProjectState {
  return {
    version: "0.1.0",
    updatedAt: "2026-08-06T00:00:00.000Z",
    architecture: { summary: "", lastReviewedAt: "", notes: [] },
    plan: { decidedAt: "", decidedBy: "", tasks: [] },
    milestones: [],
    history: [],
  };
}

vi.mock("@/lib/project-state", () => ({
  loadProjectState: () => projectStateFixture,
}));

// ── telegram / email spies ────────────────────────────────────────────

const sendTelegramMock = vi.fn();
vi.mock("@/lib/telegram", () => ({
  sendTelegram: (...args: unknown[]) => sendTelegramMock(...args),
  // Keep mdEscape semantically-real enough to catch a totally-broken
  // format — but still simple + deterministic under test.
  mdEscape: (s: string) => String(s).replace(/([_*[\]()~`>#+=|{}.!\-])/g, "\\$1"),
}));

const sendEmailMock = vi.fn();
vi.mock("@/lib/email", () => ({
  sendEmail: (args: unknown) => sendEmailMock(args),
}));

// ── rate-limit spy ────────────────────────────────────────────────────

const checkRateLimitMock = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (key: string, max: number, windowMs: number) =>
    checkRateLimitMock(key, max, windowMs),
}));

import { POST } from "./route";

const STATE_FILE = "/home/dovanlong/blockid.au/web/content/reports/milestone-report-state.json";
const REPORTS_DIR = "/home/dovanlong/blockid.au/web/content/reports";

function makeMilestone(o: Partial<Milestone> & { id: string; completedAt: string }): Milestone {
  return {
    id: o.id,
    title: o.title ?? `Milestone ${o.id}`,
    version: o.version ?? "1.0.0",
    completedAt: o.completedAt,
    taskIds: o.taskIds ?? [],
  };
}

function makeTask(o: Partial<PlanTask> & { id: string }): PlanTask {
  return {
    id: o.id,
    agent: o.agent ?? "cto",
    title: o.title ?? `Task ${o.id}`,
    rationale: o.rationale ?? "",
    versionImpact: o.versionImpact ?? "patch",
    status: o.status ?? "done",
    createdAt: o.createdAt ?? "2026-08-06T00:00:00.000Z",
    completedAt: o.completedAt ?? "2026-08-06T00:10:00.000Z",
    commit: o.commit,
  };
}

function seedState(state: { reportedMilestoneIds: string[]; lastRun: string }) {
  fsStore.set(STATE_FILE, JSON.stringify(state));
}

function readState(): { reportedMilestoneIds: string[]; lastRun: string } | null {
  const raw = fsStore.get(STATE_FILE);
  return raw ? JSON.parse(raw) : null;
}

function makeReq(opts: { auth?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.auth) headers.authorization = opts.auth;
  return new Request("http://x/api/cron/milestone-report", {
    method: "POST",
    headers,
  });
}

beforeEach(() => {
  fsStore.clear();
  fsMkdirCalls.length = 0;
  projectStateFixture = emptyProjectState();
  sendTelegramMock.mockReset();
  sendTelegramMock.mockResolvedValue(true);
  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue({ ok: true });
  checkRateLimitMock.mockReset();
  checkRateLimitMock.mockReturnValue({ allowed: true, remaining: 5, resetIn: 600_000 });
  process.env.CRON_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe("auth gate", () => {
  it("401 when CRON_SECRET is set and Authorization header is missing", async () => {
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Unauthorized" });
    expect(checkRateLimitMock).not.toHaveBeenCalled();
    expect(sendTelegramMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("401 when the bearer value is wrong", async () => {
    const res = await POST(makeReq({ auth: "Bearer nope" }));
    expect(res.status).toBe(401);
    expect(checkRateLimitMock).not.toHaveBeenCalled();
  });

  it("passes when the bearer value matches CRON_SECRET", async () => {
    const res = await POST(makeReq({ auth: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    expect(checkRateLimitMock).toHaveBeenCalledOnce();
  });

  it("no CRON_SECRET set → auth gate is skipped (inline caller uses no secret)", async () => {
    // CRON_SECRET is captured at module load, so we have to reset the module
    // registry, unset the env var, and re-import the route to exercise the
    // "public cron" code path.
    delete process.env.CRON_SECRET;
    vi.resetModules();
    const mod = await import("./route");
    const res = await mod.POST(makeReq());
    expect(res.status).toBe(200);
    expect(checkRateLimitMock).toHaveBeenCalledOnce();
  });
});

describe("rate limit", () => {
  it("429 with retryAfter when checkRateLimit disallows", async () => {
    checkRateLimitMock.mockReturnValue({ allowed: false, remaining: 0, resetIn: 12345 });
    const res = await POST(makeReq({ auth: `Bearer ${SECRET}` }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body).toEqual({ error: "Rate limited", retryAfter: 12345 });
    expect(sendTelegramMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
    // State file must NOT be written on rate-limit reject.
    expect(readState()).toBeNull();
  });

  it("calls checkRateLimit with the bucket 'milestone-report' + 6/10min window", async () => {
    await POST(makeReq({ auth: `Bearer ${SECRET}` }));
    expect(checkRateLimitMock).toHaveBeenCalledWith("milestone-report", 6, 600_000);
  });
});

describe("first-run backfill (empty state)", () => {
  it("with a SINGLE milestone: backfill does NOT trigger (>1 required); milestone is reported normally", async () => {
    const nowIso = new Date().toISOString();
    projectStateFixture.milestones = [makeMilestone({ id: "M-1", completedAt: nowIso, taskIds: [] })];
    const res = await POST(makeReq({ auth: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.milestonesReported).toBe(1);
    expect(sendTelegramMock).toHaveBeenCalledOnce();
    expect(sendEmailMock).toHaveBeenCalledOnce();
    expect(readState()?.reportedMilestoneIds).toEqual(["M-1"]);
  });

  it("with MULTIPLE milestones + all older than 24h: backfill marks every one reported without sending", async () => {
    const old = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString();
    projectStateFixture.milestones = [
      makeMilestone({ id: "M-1", completedAt: old }),
      makeMilestone({ id: "M-2", completedAt: old }),
      makeMilestone({ id: "M-3", completedAt: old }),
    ];
    const res = await POST(makeReq({ auth: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.milestonesReported).toBe(0);
    expect(body.totalReported).toBe(3);
    expect(sendTelegramMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(readState()?.reportedMilestoneIds.sort()).toEqual(["M-1", "M-2", "M-3"]);
  });

  it("mixed old + fresh milestones: only fresh (<24h) ones are sent, old ones are backfill-marked", async () => {
    const old = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString();
    const fresh = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    projectStateFixture.milestones = [
      makeMilestone({ id: "OLD-1", completedAt: old }),
      makeMilestone({ id: "OLD-2", completedAt: old }),
      makeMilestone({ id: "NEW-1", completedAt: fresh }),
    ];
    const res = await POST(makeReq({ auth: `Bearer ${SECRET}` }));
    const body = await res.json();
    expect(body.milestonesReported).toBe(1);
    expect(body.sent.map((s: { id: string }) => s.id)).toEqual(["NEW-1"]);
    expect(sendTelegramMock).toHaveBeenCalledOnce();
    expect(sendEmailMock).toHaveBeenCalledOnce();
    expect(readState()?.reportedMilestoneIds.sort()).toEqual(["NEW-1", "OLD-1", "OLD-2"]);
  });
});

describe("regular runs (state already exists)", () => {
  it("only unreported milestones are sent; reported ones stay untouched", async () => {
    const nowIso = new Date().toISOString();
    seedState({ reportedMilestoneIds: ["M-1"], lastRun: "2026-08-01T00:00:00.000Z" });
    projectStateFixture.milestones = [
      makeMilestone({ id: "M-1", completedAt: nowIso }),
      makeMilestone({ id: "M-2", completedAt: nowIso }),
    ];
    const res = await POST(makeReq({ auth: `Bearer ${SECRET}` }));
    const body = await res.json();
    expect(body.milestonesReported).toBe(1);
    expect(body.sent[0].id).toBe("M-2");
    expect(sendTelegramMock).toHaveBeenCalledOnce();
    expect(sendEmailMock).toHaveBeenCalledOnce();
    expect(readState()?.reportedMilestoneIds.sort()).toEqual(["M-1", "M-2"]);
  });

  it("idempotent: a second run with no new milestones is a no-op (no side effects, state preserved)", async () => {
    const nowIso = new Date().toISOString();
    seedState({ reportedMilestoneIds: ["M-1"], lastRun: "2026-08-01T00:00:00.000Z" });
    projectStateFixture.milestones = [makeMilestone({ id: "M-1", completedAt: nowIso })];
    const res = await POST(makeReq({ auth: `Bearer ${SECRET}` }));
    const body = await res.json();
    expect(body.milestonesReported).toBe(0);
    expect(sendTelegramMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(readState()?.reportedMilestoneIds).toEqual(["M-1"]);
  });

  it("also updates lastRun to the current tick even when no milestones were reported", async () => {
    seedState({ reportedMilestoneIds: [], lastRun: "2020-01-01T00:00:00.000Z" });
    projectStateFixture.milestones = [];
    await POST(makeReq({ auth: `Bearer ${SECRET}` }));
    const state = readState()!;
    expect(state.lastRun).not.toBe("2020-01-01T00:00:00.000Z");
    expect(Date.parse(state.lastRun)).toBeGreaterThan(Date.parse("2026-01-01T00:00:00.000Z"));
  });
});

describe("markdown report content", () => {
  it("writes markdown to content/reports/milestone-<id>-v<version>.md and includes per-C-Level breakdown", async () => {
    const nowIso = new Date().toISOString();
    projectStateFixture.plan.tasks = [
      makeTask({ id: "T-1", agent: "cfo", title: "Stripe revenue rollup" }),
      makeTask({ id: "T-2", agent: "cto", title: "Migration 0119" }),
    ];
    projectStateFixture.milestones = [
      makeMilestone({ id: "MS-9", version: "2.4.7", completedAt: nowIso, taskIds: ["T-1", "T-2"] }),
    ];
    const res = await POST(makeReq({ auth: `Bearer ${SECRET}` }));
    const body = await res.json();
    expect(body.sent[0].mdPath).toBe(`${REPORTS_DIR}/milestone-MS-9-v2.4.7.md`);
    const md = fsStore.get(body.sent[0].mdPath)!;
    expect(md).toContain("# Milestone MS-9 — v2.4.7");
    expect(md).toContain("### CFO — 1 task(s) shipped");
    expect(md).toContain("### CTO — 1 task(s) shipped");
    expect(md).toContain("`T-1`");
    expect(md).toContain("`T-2`");
    expect(md).toContain("Stripe revenue rollup");
    expect(md).toContain("Migration 0119");
    expect(md).toContain("**Tasks shipped:** 2");
    expect(md).toContain("30-Day North Star context");
  });

  it("version sanitiser strips characters that would break the mkdir/write path", async () => {
    const nowIso = new Date().toISOString();
    projectStateFixture.milestones = [
      makeMilestone({ id: "MS-slash", version: "1.2.0/rc1", completedAt: nowIso, taskIds: [] }),
    ];
    const res = await POST(makeReq({ auth: `Bearer ${SECRET}` }));
    const body = await res.json();
    // Slash must be gone; dots + alphanumerics preserved.
    expect(body.sent[0].mdPath).toBe(`${REPORTS_DIR}/milestone-MS-slash-v1.2.0rc1.md`);
    expect(body.sent[0].mdPath).not.toContain("/rc1");
  });

  it("only tasks listed in milestone.taskIds attach to the breakdown", async () => {
    const nowIso = new Date().toISOString();
    projectStateFixture.plan.tasks = [
      makeTask({ id: "T-IN", agent: "cto", title: "included" }),
      makeTask({ id: "T-OUT", agent: "cmo", title: "orphaned" }),
    ];
    projectStateFixture.milestones = [
      makeMilestone({ id: "MS-1", completedAt: nowIso, taskIds: ["T-IN"] }),
    ];
    const res = await POST(makeReq({ auth: `Bearer ${SECRET}` }));
    const body = await res.json();
    const md = fsStore.get(body.sent[0].mdPath)!;
    expect(md).toContain("### CTO — 1 task(s) shipped");
    expect(md).toContain("included");
    expect(md).not.toContain("### CMO");
    expect(md).not.toContain("orphaned");
  });

  it("empty taskIds → header still renders, no per-C-Level sections, tasks-shipped = 0", async () => {
    const nowIso = new Date().toISOString();
    projectStateFixture.milestones = [
      makeMilestone({ id: "MS-EMPTY", completedAt: nowIso, taskIds: [] }),
    ];
    const res = await POST(makeReq({ auth: `Bearer ${SECRET}` }));
    const body = await res.json();
    const md = fsStore.get(body.sent[0].mdPath)!;
    expect(md).toContain("# Milestone MS-EMPTY");
    expect(md).toContain("**Tasks shipped:** 0");
    expect(md).toContain("**C-Levels involved:** —");
    expect(md).not.toContain("### ");
  });

  it("task without a commit renders '_(not linked)_' and missing rationale renders '_(no rationale recorded)_'", async () => {
    const nowIso = new Date().toISOString();
    projectStateFixture.plan.tasks = [
      makeTask({ id: "T-NO", agent: "cto", title: "no commit", commit: undefined, rationale: "" }),
    ];
    projectStateFixture.milestones = [
      makeMilestone({ id: "MS-NO", completedAt: nowIso, taskIds: ["T-NO"] }),
    ];
    const res = await POST(makeReq({ auth: `Bearer ${SECRET}` }));
    const body = await res.json();
    const md = fsStore.get(body.sent[0].mdPath)!;
    expect(md).toContain("**Commit:** _(not linked)_");
    expect(md).toContain("**Rationale:** _(no rationale recorded)_");
  });
});

describe("notification side effects", () => {
  it("sends telegram + email exactly once per fresh milestone; returns tg/email booleans", async () => {
    const nowIso = new Date().toISOString();
    projectStateFixture.milestones = [
      makeMilestone({ id: "M-A", completedAt: nowIso }),
      makeMilestone({ id: "M-B", completedAt: nowIso }),
    ];
    const res = await POST(makeReq({ auth: `Bearer ${SECRET}` }));
    const body = await res.json();
    expect(sendTelegramMock).toHaveBeenCalledTimes(2);
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    for (const sent of body.sent) {
      expect(sent.tg).toBe(true);
      expect(sent.email).toBe(true);
    }
  });

  it("telegram failure is swallowed (best-effort) — milestone still reported, email still sent, tg:false", async () => {
    sendTelegramMock.mockRejectedValueOnce(new Error("telegram down"));
    const nowIso = new Date().toISOString();
    projectStateFixture.milestones = [makeMilestone({ id: "M-TG", completedAt: nowIso })];
    const res = await POST(makeReq({ auth: `Bearer ${SECRET}` }));
    const body = await res.json();
    expect(body.milestonesReported).toBe(1);
    expect(body.sent[0].tg).toBe(false);
    expect(body.sent[0].email).toBe(true);
    expect(sendEmailMock).toHaveBeenCalledOnce();
    // Milestone was still recorded as reported — no infinite retry.
    expect(readState()?.reportedMilestoneIds).toEqual(["M-TG"]);
  });

  it("email failure is swallowed (best-effort) — milestone still reported, telegram still sent, email:false", async () => {
    sendEmailMock.mockRejectedValueOnce(new Error("smtp 5xx"));
    const nowIso = new Date().toISOString();
    projectStateFixture.milestones = [makeMilestone({ id: "M-MAIL", completedAt: nowIso })];
    const res = await POST(makeReq({ auth: `Bearer ${SECRET}` }));
    const body = await res.json();
    expect(body.milestonesReported).toBe(1);
    expect(body.sent[0].tg).toBe(true);
    expect(body.sent[0].email).toBe(false);
    expect(sendTelegramMock).toHaveBeenCalledOnce();
    expect(readState()?.reportedMilestoneIds).toEqual(["M-MAIL"]);
  });

  it("email payload targets admin@blockid.au with the milestone id + version in the subject", async () => {
    const nowIso = new Date().toISOString();
    projectStateFixture.milestones = [
      makeMilestone({ id: "MS-99", version: "3.1.4", completedAt: nowIso }),
    ];
    await POST(makeReq({ auth: `Bearer ${SECRET}` }));
    const call = sendEmailMock.mock.calls[0][0] as { to: string; subject: string; html: string };
    expect(call.to).toBe("admin@blockid.au");
    expect(call.subject).toContain("MS-99");
    expect(call.subject).toContain("v3.1.4");
    expect(call.html).toContain("<h1>Milestone MS-99 — v3.1.4</h1>");
  });

  it("telegram payload uses the escaped mdEscape() format with the milestone id, version, and task count", async () => {
    const nowIso = new Date().toISOString();
    projectStateFixture.plan.tasks = [
      makeTask({ id: "T-1", agent: "cto" }),
      makeTask({ id: "T-2", agent: "cto" }),
    ];
    projectStateFixture.milestones = [
      makeMilestone({ id: "MS-TG", version: "1.0.0", completedAt: nowIso, taskIds: ["T-1", "T-2"] }),
    ];
    await POST(makeReq({ auth: `Bearer ${SECRET}` }));
    const body = sendTelegramMock.mock.calls[0][0] as string;
    expect(body).toContain("BlockID Milestone");
    expect(body).toContain("MS\\-TG");
    expect(body).toContain("1\\.0\\.0");
    expect(body).toContain("*Tasks:* 2");
    expect(body).toContain("CTO: 2");
  });
});

describe("per-milestone failure isolation", () => {
  it("if reportOneMilestone throws (e.g. writeFileSync fails), that milestone is NOT marked reported and others still send", async () => {
    // Sabotage the second milestone's markdown write by tearing down the fs
    // writer for exactly one call: throw on the .md path, allow the state
    // file write at the end.
    const nowIso = new Date().toISOString();
    const badMdPath = `${REPORTS_DIR}/milestone-MS-BAD-v1.0.0.md`;
    const goodMdPath = `${REPORTS_DIR}/milestone-MS-OK-v1.0.0.md`;
    projectStateFixture.milestones = [
      makeMilestone({ id: "MS-OK", completedAt: nowIso }),
      makeMilestone({ id: "MS-BAD", completedAt: nowIso }),
    ];
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // Intercept writeFileSync for the bad path only.
    const fsMod = await import("fs");
    const originalWrite = fsMod.writeFileSync;
    (fsMod as unknown as { writeFileSync: unknown }).writeFileSync = (path: string, data: string) => {
      if (path === badMdPath) throw new Error("disk full");
      return (originalWrite as (p: string, d: string) => void)(path, data);
    };
    try {
      const res = await POST(makeReq({ auth: `Bearer ${SECRET}` }));
      const body = await res.json();
      // Both milestones were attempted; only one succeeded end-to-end.
      expect(body.milestonesReported).toBe(1);
      expect(body.sent.map((s: { id: string }) => s.id)).toEqual(["MS-OK"]);
      expect(fsStore.has(goodMdPath)).toBe(true);
      expect(fsStore.has(badMdPath)).toBe(false);
      // The failing one is NOT marked reported → next sweep will retry.
      expect(readState()?.reportedMilestoneIds).toEqual(["MS-OK"]);
      expect(consoleErrorSpy).toHaveBeenCalled();
    } finally {
      (fsMod as unknown as { writeFileSync: unknown }).writeFileSync = originalWrite;
      consoleErrorSpy.mockRestore();
    }
  });
});

describe("state-file resilience", () => {
  it("loadReportState catches malformed JSON and treats it as a first run (backfill kicks in)", async () => {
    fsStore.set(STATE_FILE, "{{ not valid json");
    const old = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString();
    projectStateFixture.milestones = [
      makeMilestone({ id: "OLD-A", completedAt: old }),
      makeMilestone({ id: "OLD-B", completedAt: old }),
    ];
    const res = await POST(makeReq({ auth: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    // Both are old + first-run detected → backfill without sending.
    expect(body.milestonesReported).toBe(0);
    expect(body.totalReported).toBe(2);
    expect(sendTelegramMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("saveReportState calls mkdirSync with recursive:true so a fresh reports dir does not crash the write", async () => {
    projectStateFixture.milestones = [];
    await POST(makeReq({ auth: `Bearer ${SECRET}` }));
    const mkdirCall = fsMkdirCalls.find(c => c.path === REPORTS_DIR);
    expect(mkdirCall).toBeDefined();
    expect(mkdirCall!.opts).toEqual({ recursive: true });
  });

  it("saved state ends with a trailing newline (POSIX-friendly + git-diff friendly)", async () => {
    projectStateFixture.milestones = [];
    await POST(makeReq({ auth: `Bearer ${SECRET}` }));
    expect(fsStore.get(STATE_FILE)!.endsWith("\n")).toBe(true);
  });
});
