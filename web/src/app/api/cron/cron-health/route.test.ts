// Colocated vitest for /api/cron/cron-health — the cron routine health dashboard.
//
// The route drives on-call visibility for every crontab entry: it parses
// cron-health.jsonl for per-endpoint last-run + failed-today, walks
// routine-heartbeat.jsonl for Anthropic-hosted "cloud" routine liveness, and
// falls back to *-weekly-*.md mtime for the cloud-weekly agents (cmo, ir).
// When a cloud routine goes silent past its window, the route fires a
// Telegram alert with a 12h cooldown persisted to /tmp state. Silent
// regressions the suite pins against:
//
//   (a) losing `export const dynamic = "force-dynamic"` — a static build would
//       freeze the "everything looks fine" envelope at build time and hide
//       the very silent-death class of failure this route was written for;
//   (b) losing the CRON_SECRET bearer gate — unauth requests would leak the
//       full cron topology (endpoint names + last-run status) to any scraper;
//   (c) breaking POST↔GET parity — crontab shells sometimes use POST and
//       sometimes GET, so both verbs MUST delegate to the same handler;
//   (d) breaking the "self-arming" cloud-routine guard — a not-yet-rolled-out
//       agent (never seen) MUST NOT raise a false alarm, and the alert MUST
//       respect the 12h /tmp cooldown so we don't page every 10 minutes;
//   (e) dropping the yesterday-boundary in the "missed daily" check — an
//       endpoint that last ran the day before yesterday MUST be missed;
//   (f) treating any non-"ok" today-status as a pass — failedToday MUST list
//       endpoints whose latest today-run reports anything other than "ok".

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  process.env.CRON_SECRET = "test_cron_secret";
  return {
    sendTelegramMock: vi.fn<(text: string) => Promise<void>>(),
    existsSyncMock: vi.fn<(p: string) => boolean>(),
    readFileSyncMock: vi.fn<(p: string, enc?: string) => string>(),
    writeFileSyncMock: vi.fn<(p: string, d: string) => void>(),
    readdirSyncMock: vi.fn<(p: string) => string[]>(),
    statSyncMock: vi.fn<(p: string) => { mtimeMs: number }>(),
  };
});

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    existsSync: (p: string) => mocks.existsSyncMock(p),
    readFileSync: (p: string, enc?: string) => mocks.readFileSyncMock(p, enc),
    writeFileSync: (p: string, d: string) => mocks.writeFileSyncMock(p, d),
    readdirSync: (p: string) => mocks.readdirSyncMock(p),
    statSync: (p: string) => mocks.statSyncMock(p),
  };
});

vi.mock("@/lib/telegram", () => ({
  sendTelegram: (t: string) => mocks.sendTelegramMock(t),
  mdEscape: (s: string) => s,
}));

import * as routeModule from "./route";
import { GET, POST } from "./route";

const SECRET = "test_cron_secret";
const HEALTH_LOG = "/home/dovanlong/blockid.au/web/content/reports/cron-health.jsonl";
const HEARTBEAT_LOG = "/home/dovanlong/blockid.au/web/content/reports/routine-heartbeat.jsonl";
const REPORTS_DIR = "/home/dovanlong/blockid.au/web/content/reports";
const CLOUD_ALERT_STATE = "/tmp/blockid-cloud-routine-alert.json";
const CRONTAB_FILE = "/home/dovanlong/blockid.au/web/scripts/crontab.production";
const G30_CONTROL = "/home/dovanlong/blockid.au/docs/plans/g30-execution-control.json";

function req(method: "GET" | "POST", headers: Record<string, string> = {}): Request {
  return new Request("http://x/api/cron/cron-health", { method, headers });
}

function auth(): Record<string, string> {
  return { authorization: `Bearer ${SECRET}` };
}

function iso(daysAgo: number, hourUTC = 12): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(hourUTC, 0, 0, 0);
  return d.toISOString();
}

/**
 * Install a synthetic filesystem for the route to read against.
 *   healthLines[]      → newline-joined into cron-health.jsonl
 *   heartbeatLines[]   → newline-joined into routine-heartbeat.jsonl
 *   reportsDir{name→mtimeMs}  → files present in REPORTS_DIR with mtime
 *   alertState         → optional pre-existing /tmp cooldown JSON payload
 */
function installFs(opts: {
  healthLines?: string[];
  heartbeatLines?: string[];
  reportsDir?: Record<string, number>;
  alertState?: { ts: number; agents?: string[] } | null;
  crontab?: string;
  g30Status?: "active" | "released";
} = {}): void {
  const files: Record<string, string> = {};
  if (opts.crontab !== undefined) files[CRONTAB_FILE] = opts.crontab;
  if (opts.g30Status) {
    files[G30_CONTROL] = JSON.stringify({
      version: 1, owner: "g30", status: opts.g30Status, source_of_truth: "docs/plans/SOURCE-OF-TRUTH.md",
    });
  }
  if (opts.healthLines) files[HEALTH_LOG] = opts.healthLines.join("\n");
  if (opts.heartbeatLines) files[HEARTBEAT_LOG] = opts.heartbeatLines.join("\n");
  if (opts.alertState) files[CLOUD_ALERT_STATE] = JSON.stringify(opts.alertState);

  mocks.existsSyncMock.mockImplementation((p: string) => p in files);
  mocks.readFileSyncMock.mockImplementation((p: string) => {
    if (p in files) return files[p];
    throw new Error(`ENOENT: ${p}`);
  });
  mocks.writeFileSyncMock.mockImplementation((p: string, d: string) => {
    files[p] = d;
  });
  const dir = opts.reportsDir ?? {};
  mocks.readdirSyncMock.mockImplementation((p: string) => {
    if (p === REPORTS_DIR) return Object.keys(dir);
    throw new Error(`ENOENT: ${p}`);
  });
  mocks.statSyncMock.mockImplementation((p: string) => {
    for (const [name, mtimeMs] of Object.entries(dir)) {
      if (p === `${REPORTS_DIR}/${name}`) return { mtimeMs };
    }
    throw new Error(`ENOENT: ${p}`);
  });
}

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
  mocks.sendTelegramMock.mockReset().mockResolvedValue(undefined);
  mocks.existsSyncMock.mockReset().mockReturnValue(false);
  mocks.readFileSyncMock.mockReset();
  mocks.writeFileSyncMock.mockReset();
  mocks.readdirSyncMock.mockReset().mockReturnValue([]);
  mocks.statSyncMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("/api/cron/cron-health — module shape", () => {
  it("pins `export const dynamic = 'force-dynamic'`", () => {
    expect((routeModule as { dynamic?: string }).dynamic).toBe("force-dynamic");
  });

  it("POST is the same function reference as GET", () => {
    expect(POST).toBe(GET);
  });
});

describe("GET /api/cron/cron-health — auth gate", () => {
  it("returns 401 with no Authorization header", async () => {
    installFs();
    const res = await GET(req("GET"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 401 with the wrong bearer token", async () => {
    installFs();
    const res = await GET(req("GET", { authorization: "Bearer wrong" }));
    expect(res.status).toBe(401);
  });

  it("returns 401 when Authorization omits the 'Bearer ' prefix", async () => {
    installFs();
    const res = await GET(req("GET", { authorization: SECRET }));
    expect(res.status).toBe(401);
  });

  it("is case-sensitive on the 'Bearer' scheme (lowercase must fail)", async () => {
    installFs();
    const res = await GET(req("GET", { authorization: `bearer ${SECRET}` }));
    expect(res.status).toBe(401);
  });

  it("does not call fs on an unauthorised request (short-circuit)", async () => {
    installFs();
    await GET(req("GET"));
    expect(mocks.existsSyncMock).not.toHaveBeenCalled();
    expect(mocks.readFileSyncMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/cron/cron-health — empty state (no logs)", () => {
  it("returns 200 with ok:true when no health log exists", async () => {
    installFs();
    const res = await GET(req("GET", auth()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.totalEntries).toBe(0);
    expect(body.todayRuns).toBe(0);
  });

  it("routines[] covers every EXPECTED endpoint (daily + periodic + weekly)", async () => {
    installFs();
    const res = await GET(req("GET", auth()));
    const body = await res.json();
    const endpoints = body.routines.map((r: { endpoint: string }) => r.endpoint);
    // 10 daily + 2 periodic + 1 weekly = 13 rows (svi-notify + nurture retired 25/09)
    expect(endpoints).toHaveLength(13);
    expect(endpoints).not.toContain("svi-notify");
    expect(endpoints).not.toContain("nurture");
    expect(endpoints).toContain("svi-snapshot");
    expect(endpoints).toContain("ai-health");
    expect(endpoints).toContain("weekly-insights");
  });

  it("every endpoint reports status 'never_run' when there is no history", async () => {
    installFs();
    const res = await GET(req("GET", auth()));
    const body = await res.json();
    for (const r of body.routines) {
      expect(r.status).toBe("never_run");
      expect(r.lastRun).toBeNull();
      expect(r.lastDuration).toBeNull();
      expect(r.todayRuns).toBe(0);
    }
  });

  it("cloud-routine list is present but every agent is 'not armed' (no false alarms)", async () => {
    installFs();
    const res = await GET(req("GET", auth()));
    const body = await res.json();
    expect(body.cloudRoutines).toHaveLength(7); // 5 daily + 2 weekly
    for (const r of body.cloudRoutines) {
      expect(r.armed).toBe(false);
      expect(r.stale).toBe(false);
      expect(r.lastSeen).toBeNull();
    }
    expect(body.deadCloudRoutines).toEqual([]);
    expect(mocks.sendTelegramMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/cron/cron-health — health-log parsing", () => {
  it("last-run per endpoint uses the most recent ts (later wins)", async () => {
    installFs({
      healthLines: [
        JSON.stringify({ ts: iso(1), endpoint: "svi-snapshot", status: "ok", duration_ms: 111, detail: "" }),
        JSON.stringify({ ts: iso(0, 10), endpoint: "svi-snapshot", status: "ok", duration_ms: 222, detail: "" }),
        JSON.stringify({ ts: iso(0, 8), endpoint: "svi-snapshot", status: "ok", duration_ms: 333, detail: "" }),
      ],
    });
    const res = await GET(req("GET", auth()));
    const body = await res.json();
    const row = body.routines.find((r: { endpoint: string }) => r.endpoint === "svi-snapshot");
    expect(row.lastDuration).toBe(222); // the iso(0, 10) entry — newest ts
    expect(row.todayRuns).toBe(2);
  });

  it("failedToday lists endpoints whose latest today-run is not 'ok'", async () => {
    installFs({
      healthLines: [
        JSON.stringify({ ts: iso(0, 8), endpoint: "publish-insight", status: "ok", duration_ms: 100, detail: "" }),
        JSON.stringify({ ts: iso(0, 10), endpoint: "publish-insight", status: "error", duration_ms: 50, detail: "boom" }),
        JSON.stringify({ ts: iso(0, 9), endpoint: "svi-review", status: "ok", duration_ms: 20, detail: "" }),
      ],
    });
    const res = await GET(req("GET", auth()));
    const body = await res.json();
    expect(body.failedToday).toContain("publish-insight");
    expect(body.failedToday).not.toContain("svi-review");
  });

  it("skips malformed JSONL lines without failing the whole response", async () => {
    installFs({
      healthLines: [
        "not-json{",
        "",
        JSON.stringify({ ts: iso(0, 12), endpoint: "svi-snapshot", status: "ok", duration_ms: 5, detail: "" }),
        "   ",
        "{{{}}}",
      ],
    });
    const res = await GET(req("GET", auth()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalEntries).toBe(1); // only the well-formed row parsed
    expect(body.todayRuns).toBe(1);
  });

  it("totalEntries counts every parsed line across all endpoints", async () => {
    installFs({
      healthLines: [
        JSON.stringify({ ts: iso(3), endpoint: "svi-snapshot", status: "ok", duration_ms: 1, detail: "" }),
        JSON.stringify({ ts: iso(2), endpoint: "vesting", status: "ok", duration_ms: 1, detail: "" }),
        JSON.stringify({ ts: iso(1), endpoint: "unknown-endpoint", status: "ok", duration_ms: 1, detail: "" }),
      ],
    });
    const res = await GET(req("GET", auth()));
    const body = await res.json();
    expect(body.totalEntries).toBe(3);
    expect(body.todayRuns).toBe(0); // none from today
  });
});

describe("GET /api/cron/cron-health — missed-daily detection", () => {
  it("flags a daily endpoint as missed when hourUTC >= 23 and it has no today runs", async () => {
    vi.useFakeTimers();
    // Set clock to 23:30 UTC — past the "flag as missed" threshold.
    const late = new Date();
    late.setUTCHours(23, 30, 0, 0);
    vi.setSystemTime(late);
    installFs({
      healthLines: [
        JSON.stringify({ ts: iso(1, 20), endpoint: "svi-snapshot", status: "ok", duration_ms: 1, detail: "" }),
      ],
    });
    const res = await GET(req("GET", auth()));
    const body = await res.json();
    expect(body.missed).toContain("svi-snapshot");
    const row = body.routines.find((r: { endpoint: string }) => r.endpoint === "svi-snapshot");
    expect(row.isMissed).toBe(true);
  });

  it("does NOT flag missed for a daily endpoint early in the day (hourUTC < 23) if it ran yesterday", async () => {
    vi.useFakeTimers();
    const early = new Date();
    early.setUTCHours(10, 0, 0, 0);
    vi.setSystemTime(early);
    installFs({
      healthLines: [
        JSON.stringify({ ts: iso(1, 20), endpoint: "svi-snapshot", status: "ok", duration_ms: 1, detail: "" }),
      ],
    });
    const res = await GET(req("GET", auth()));
    const body = await res.json();
    expect(body.missed).not.toContain("svi-snapshot");
  });

  it("flags a daily endpoint whose last run is older than yesterday even before 23:00 UTC", async () => {
    vi.useFakeTimers();
    const early = new Date();
    early.setUTCHours(10, 0, 0, 0);
    vi.setSystemTime(early);
    installFs({
      healthLines: [
        // 3 days ago — well past the yesterday boundary
        JSON.stringify({ ts: iso(3), endpoint: "svi-snapshot", status: "ok", duration_ms: 1, detail: "" }),
      ],
    });
    const res = await GET(req("GET", auth()));
    const body = await res.json();
    expect(body.missed).toContain("svi-snapshot");
  });
});

// 27/09 health sweep: retired, `# PAUSED-EMAIL` and G30-deferred jobs were
// reported "missed" every night. Expectations now follow the active crontab.
describe("GET /api/cron/cron-health — expectations follow the active crontab", () => {
  const CRONTAB = [
    "RUN=/home/dovanlong/blockid.au/web/scripts/cron-runner.sh",
    "0 16 * * * bash $RUN svi-snapshot",
    "15 16 * * * bash $RUN vesting",
    "0 17 * * * bash $RUN agent-upgrade --timeout 120",
    "0 18 * * * bash $RUN growth-insights --timeout 120",
    "# PAUSED-EMAIL 26/09/2026 (founder: tạm không gửi email): 0 19 * * * bash $RUN svi-review",
    "0 20 * * * bash $RUN agent-research --timeout 300",
    "5 21 * * * bash $RUN refresh-models",
    "30 21 * * * bash $RUN publish-insight --timeout 120",
    "30 22 * * * bash $RUN daily-admin-report --timeout 180",
    "30 23 * * * bash $RUN telegram-report",
    "*/15 * * * * bash $RUN blockchain-sync",
    "0 */3 * * * bash $RUN ai-health",
    "# PAUSED-EMAIL 25/09/2026 (founder: tạm không gửi email): 30 20 * * 0 bash $RUN weekly-insights --timeout 120",
  ].join("\n");

  function lateNight(): void {
    vi.useFakeTimers();
    const late = new Date();
    late.setUTCHours(23, 30, 0, 0);
    vi.setSystemTime(late);
  }

  it("a # PAUSED-EMAIL job and a G30-deferred job are never missed; scheduled jobs still are", async () => {
    lateNight();
    installFs({ crontab: CRONTAB, g30Status: "active" });
    const body = await (await GET(req("GET", auth()))).json();
    expect(body.missed).not.toContain("svi-review");
    expect(body.missed).not.toContain("publish-insight");
    expect(body.missed).toContain("svi-snapshot");
    expect(body.missed).toContain("daily-admin-report");
    const row = (ep: string) => body.routines.find((r: { endpoint: string }) => r.endpoint === ep);
    expect(row("svi-review").scheduled).toBe(false);
    expect(row("weekly-insights").scheduled).toBe(false);
    expect(row("publish-insight").scheduled).toBe(false);
    expect(row("svi-snapshot").scheduled).toBe(true);
  });

  it("lifting the pause (uncommenting the line) re-arms the check with no code change", async () => {
    lateNight();
    installFs({ crontab: `${CRONTAB}\n0 19 * * * bash $RUN svi-review`, g30Status: "active" });
    const body = await (await GET(req("GET", auth()))).json();
    expect(body.missed).toContain("svi-review");
  });

  it("publish-insight is expected again once G30 ownership is released", async () => {
    lateNight();
    installFs({ crontab: CRONTAB, g30Status: "released" });
    const body = await (await GET(req("GET", auth()))).json();
    expect(body.missed).toContain("publish-insight");
  });

  it("an unreadable crontab falls back to the static list (G30 still fails closed)", async () => {
    lateNight();
    installFs();
    const body = await (await GET(req("GET", auth()))).json();
    expect(body.missed).toContain("svi-review");
    expect(body.missed).not.toContain("publish-insight");
  });
});

describe("GET /api/cron/cron-health — cloud routine liveness", () => {
  it("arms a cloud-daily agent that has a recent heartbeat and marks it not stale", async () => {
    installFs({
      heartbeatLines: [
        JSON.stringify({ ts: iso(0, 8), agent: "cto", via: "cloud" }),
      ],
    });
    const res = await GET(req("GET", auth()));
    const body = await res.json();
    const cto = body.cloudRoutines.find((r: { agent: string }) => r.agent === "cto");
    expect(cto.armed).toBe(true);
    expect(cto.stale).toBe(false);
    expect(cto.cadence).toBe("daily");
    expect(body.deadCloudRoutines).not.toContain("cto");
  });

  it("marks an armed cloud-daily agent stale when its last heartbeat is older than 25h", async () => {
    installFs({
      heartbeatLines: [
        // 2 full days ago = 48h > 25h threshold
        JSON.stringify({ ts: iso(2, 12), agent: "cto", via: "cloud" }),
      ],
    });
    const res = await GET(req("GET", auth()));
    const body = await res.json();
    const cto = body.cloudRoutines.find((r: { agent: string }) => r.agent === "cto");
    expect(cto.armed).toBe(true);
    expect(cto.stale).toBe(true);
    expect(body.deadCloudRoutines).toContain("cto");
  });

  it("ignores non-cloud heartbeats (via: 'local' does not arm the agent)", async () => {
    installFs({
      heartbeatLines: [
        JSON.stringify({ ts: iso(0, 8), agent: "cto", via: "local" }),
      ],
    });
    const res = await GET(req("GET", auth()));
    const body = await res.json();
    const cto = body.cloudRoutines.find((r: { agent: string }) => r.agent === "cto");
    expect(cto.armed).toBe(false);
  });

  it("uses the *-weekly-*.md mtime for weekly agents (cmo, ir) — fresh file = armed + fresh", async () => {
    installFs({
      reportsDir: {
        "cmo-weekly-2026-08-13.md": Date.now() - 3 * 3600_000,
        "some-other-file.md": Date.now(),
      },
    });
    const res = await GET(req("GET", auth()));
    const body = await res.json();
    const cmo = body.cloudRoutines.find((r: { agent: string }) => r.agent === "cmo");
    expect(cmo.armed).toBe(true);
    expect(cmo.stale).toBe(false);
    expect(cmo.cadence).toBe("weekly");
  });

  it("marks a weekly agent stale when its newest weekly file is older than 8 days", async () => {
    installFs({
      reportsDir: {
        "ir-weekly-2026-07-01.md": Date.now() - 10 * 86_400_000,
      },
    });
    const res = await GET(req("GET", auth()));
    const body = await res.json();
    const ir = body.cloudRoutines.find((r: { agent: string }) => r.agent === "ir");
    expect(ir.armed).toBe(true);
    expect(ir.stale).toBe(true);
    expect(body.deadCloudRoutines).toContain("ir");
  });

  it("is self-arming — a never-seen cloud agent MUST NOT raise a false alarm", async () => {
    installFs();
    const res = await GET(req("GET", auth()));
    const body = await res.json();
    // Every cloud routine unseen — none armed, so deadCloudRoutines is empty.
    expect(body.deadCloudRoutines).toEqual([]);
    expect(mocks.sendTelegramMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/cron/cron-health — Telegram alert + 12h cooldown", () => {
  it("fires exactly one Telegram alert when a dead cloud routine is first detected", async () => {
    installFs({
      heartbeatLines: [
        JSON.stringify({ ts: iso(3), agent: "cfo", via: "cloud" }),
      ],
    });
    await GET(req("GET", auth()));
    expect(mocks.sendTelegramMock).toHaveBeenCalledTimes(1);
    const msg = mocks.sendTelegramMock.mock.calls[0][0];
    expect(msg).toMatch(/Cloud routine silent/i);
    expect(msg).toMatch(/CFO/);
  });

  it("persists a cooldown stamp to /tmp after firing the alert", async () => {
    installFs({
      heartbeatLines: [
        JSON.stringify({ ts: iso(3), agent: "cfo", via: "cloud" }),
      ],
    });
    await GET(req("GET", auth()));
    expect(mocks.writeFileSyncMock).toHaveBeenCalled();
    const [path, payload] = mocks.writeFileSyncMock.mock.calls[0];
    expect(path).toBe(CLOUD_ALERT_STATE);
    const parsed = JSON.parse(payload as string);
    expect(parsed.agents).toContain("cfo");
    expect(typeof parsed.ts).toBe("number");
  });

  it("respects the 12h cooldown — a fresh /tmp stamp suppresses re-alerting", async () => {
    installFs({
      heartbeatLines: [
        JSON.stringify({ ts: iso(3), agent: "cfo", via: "cloud" }),
      ],
      // ts is 1 hour ago — well inside the 12h cooldown window
      alertState: { ts: Date.now() - 3600_000, agents: ["cfo"] },
    });
    await GET(req("GET", auth()));
    expect(mocks.sendTelegramMock).not.toHaveBeenCalled();
    expect(mocks.writeFileSyncMock).not.toHaveBeenCalled();
  });

  it("re-alerts after the 12h cooldown has passed", async () => {
    installFs({
      heartbeatLines: [
        JSON.stringify({ ts: iso(3), agent: "cfo", via: "cloud" }),
      ],
      // ts is 13 hours ago — cooldown expired
      alertState: { ts: Date.now() - 13 * 3600_000, agents: ["cfo"] },
    });
    await GET(req("GET", auth()));
    expect(mocks.sendTelegramMock).toHaveBeenCalledTimes(1);
  });

  it("swallows a Telegram send failure — the endpoint must still return 200", async () => {
    installFs({
      heartbeatLines: [
        JSON.stringify({ ts: iso(3), agent: "cfo", via: "cloud" }),
      ],
    });
    mocks.sendTelegramMock.mockRejectedValueOnce(new Error("telegram-down"));
    const res = await GET(req("GET", auth()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("does NOT alert when NO cloud routines are dead (even with a stale /tmp stamp)", async () => {
    installFs({
      heartbeatLines: [
        JSON.stringify({ ts: iso(0, 12), agent: "cto", via: "cloud" }),
      ],
      alertState: { ts: 0, agents: [] },
    });
    await GET(req("GET", auth()));
    expect(mocks.sendTelegramMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/cron/cron-health — parity with GET", () => {
  it("POST returns 401 when unauthorised (identical to GET)", async () => {
    installFs();
    const res = await POST(req("POST"));
    expect(res.status).toBe(401);
  });

  it("POST returns the same top-level envelope shape as GET when authorised", async () => {
    installFs();
    const g = await GET(req("GET", auth()));
    const p = await POST(req("POST", auth()));
    expect(p.status).toBe(g.status);
    const gBody = await g.json();
    const pBody = await p.json();
    expect(Object.keys(pBody).sort()).toEqual(Object.keys(gBody).sort());
    expect(pBody.ok).toBe(gBody.ok);
    expect(pBody.routines).toHaveLength(gBody.routines.length);
    expect(pBody.cloudRoutines).toHaveLength(gBody.cloudRoutines.length);
  });
});

describe("GET /api/cron/cron-health — envelope contract", () => {
  it("envelope carries all documented top-level keys (no drift)", async () => {
    installFs();
    const res = await GET(req("GET", auth()));
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(
      [
        "cloudRoutines",
        "deadCloudRoutines",
        "failedToday",
        "missed",
        "ok",
        "routines",
        "todayRuns",
        "totalEntries",
        "ts",
      ].sort(),
    );
  });

  it("ts is an ISO-8601 UTC string", async () => {
    installFs();
    const res = await GET(req("GET", auth()));
    const body = await res.json();
    expect(body.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});
