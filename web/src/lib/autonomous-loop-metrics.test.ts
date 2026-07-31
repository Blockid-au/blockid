// Colocated vitest for the autonomous-loop metrics readers.
//
// `autonomous-loop-metrics.ts` powers the /status and /stats admin surfaces —
// every counter on those pages is derived from a JSONL file that the loop
// itself writes, or from `git log` scraped via child_process. The module
// promises to be defensive: a missing file / malformed row / git failure
// must resolve to `null` (or []), never throw. The following contracts are
// pinned by this test so a silent drift never breaks the /status header:
//
//   • readUptimeSnapshot — 24h window vs all-time counters, healthy=1 gate,
//     null-safe last_* fields, null return when file empty or every row
//     unparseable
//   • readCronHealthSummary — status="ok" is case-insensitive, level thresholds
//     ok≥99 / warn≥95 / bad<95, level="warn" when rate=null (no 24h data)
//   • readDeploySummary — push events (row.event non-empty) tracked separately
//     from deploy events (row.status non-empty), 24h windowing per event kind
//   • readResellerLoopSnapshot — last_log fields preferred over top-level,
//     total_ticks_completed = distinct tick_ids in goal-history, git log
//     parses the "feat(reseller): tick N — PX.Y" subject shape, everything
//     nullable when git unavailable
//   • readCommitCounters — head_short = head_sha.slice(0,7), git counters
//     null on failure, empty stdout treated as 0
//
// Uses vi.mock() on node:fs (promises.readFile) + node:child_process
// (execFile via promisify.custom) so the module can be exercised without
// touching the real reports dir or spawning git.

import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promisify } from "node:util";

// ─── fixture state ─────────────────────────────────────────────────────

interface FsState {
  files: Map<string, string>;
  errors: Set<string>;
}

interface ExecResp {
  stdout: string;
  stderr?: string;
}

interface ExecState {
  responses: Map<string, ExecResp | Error>;
  calls: Array<{ cmd: string; args: string[]; opts: unknown }>;
}

const fsState: FsState = { files: new Map(), errors: new Set() };
const execState: ExecState = { responses: new Map(), calls: [] };

function execKey(cmd: string, args: string[]): string {
  return `${cmd} ${(args || []).join(" ")}`;
}

function resetState(): void {
  fsState.files.clear();
  fsState.errors.clear();
  execState.responses.clear();
  execState.calls.length = 0;
}

// ─── module mocks (must precede the SUT import) ────────────────────────

vi.mock("node:fs", () => ({
  promises: {
    readFile: vi.fn(async (p: string, _enc?: string) => {
      if (fsState.errors.has(p)) throw new Error(`ENOENT: ${p}`);
      if (!fsState.files.has(p)) throw new Error(`ENOENT: ${p}`);
      return fsState.files.get(p) as string;
    }),
  },
}));

vi.mock("node:child_process", () => {
  const customSym = promisify.custom;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const execFile: any = () => {
    throw new Error("execFile invoked without promisify — test setup bug");
  };
  execFile[customSym] = async (
    cmd: string,
    args: string[],
    opts: unknown,
  ): Promise<ExecResp> => {
    execState.calls.push({ cmd, args, opts });
    const key = execKey(cmd, args);
    const resp = execState.responses.get(key);
    if (resp instanceof Error) throw resp;
    if (!resp) throw new Error(`no fixture for exec: ${key}`);
    return resp;
  };
  return { execFile };
});

// ─── SUT import (after mocks) ──────────────────────────────────────────

import {
  readUptimeSnapshot,
  readCronHealthSummary,
  readDeploySummary,
  readResellerLoopSnapshot,
  readCommitCounters,
} from "./autonomous-loop-metrics";

// ─── path helpers ──────────────────────────────────────────────────────

const REPORTS_DIR = path.join(process.cwd(), "content", "reports");
const UPTIME_FILE = path.join(REPORTS_DIR, "uptime-guardian.jsonl");
const CRON_FILE = path.join(REPORTS_DIR, "cron-health.jsonl");
const DEPLOY_FILE = path.join(REPORTS_DIR, "deploy-log.jsonl");
const RESELLER_MONITOR_FILE = path.join(REPORTS_DIR, "reseller-monitor.jsonl");
const RESELLER_GOAL_FILE = path.join(REPORTS_DIR, "reseller-goal-history.jsonl");

function writeFile(p: string, contents: string): void {
  fsState.files.set(p, contents);
}

function jsonl(rows: Array<Record<string, unknown>>): string {
  return rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
}

function iso(offsetMs: number, now: number = Date.now()): string {
  return new Date(now + offsetMs).toISOString();
}

// ─── shared lifecycle ──────────────────────────────────────────────────

beforeEach(() => {
  resetState();
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── readUptimeSnapshot ────────────────────────────────────────────────

describe("readUptimeSnapshot", () => {
  it("returns null when the file is missing", async () => {
    expect(await readUptimeSnapshot()).toBeNull();
  });

  it("returns null when the file is empty", async () => {
    writeFile(UPTIME_FILE, "");
    expect(await readUptimeSnapshot()).toBeNull();
  });

  it("returns null when every row is unparseable JSON", async () => {
    writeFile(UPTIME_FILE, "not-json\nalso-not-json\n");
    expect(await readUptimeSnapshot()).toBeNull();
  });

  it("skips malformed lines but preserves the last valid row", async () => {
    writeFile(
      UPTIME_FILE,
      [
        JSON.stringify({ ts: iso(-1000), healthy: 1, http_local: "200" }),
        "garbage",
        JSON.stringify({ ts: iso(-500), healthy: 0, http_local: "500" }),
      ].join("\n"),
    );
    const snap = await readUptimeSnapshot();
    expect(snap).not.toBeNull();
    expect(snap!.total_rows).toBe(2);
    expect(snap!.total_healthy).toBe(1);
    expect(snap!.last_healthy).toBe(false);
    expect(snap!.last_http_local).toBe("500");
  });

  it("computes total counters across every valid row", async () => {
    writeFile(
      UPTIME_FILE,
      jsonl([
        { ts: iso(-1000), healthy: 1 },
        { ts: iso(-2000), healthy: 1 },
        { ts: iso(-3000), healthy: 0 },
      ]),
    );
    const snap = await readUptimeSnapshot();
    expect(snap!.total_rows).toBe(3);
    expect(snap!.total_healthy).toBe(2);
    expect(snap!.all_time_pct).toBeCloseTo((2 / 3) * 100, 4);
  });

  it("windows counters to the last 24h using row.ts", async () => {
    const now = Date.now();
    writeFile(
      UPTIME_FILE,
      jsonl([
        { ts: iso(-25 * 60 * 60 * 1000, now), healthy: 1 }, // outside window
        { ts: iso(-1 * 60 * 60 * 1000, now), healthy: 1 }, // in window
        { ts: iso(-30 * 60 * 1000, now), healthy: 0 }, // in window
      ]),
    );
    vi.setSystemTime(now);
    const snap = await readUptimeSnapshot();
    expect(snap!.total_rows).toBe(3);
    expect(snap!.window_total).toBe(2);
    expect(snap!.window_healthy).toBe(1);
    expect(snap!.window_pct).toBeCloseTo(50, 4);
  });

  it("propagates last_disk_pct/mem_pct/load/uptime when numeric", async () => {
    writeFile(
      UPTIME_FILE,
      jsonl([
        {
          ts: iso(-1000),
          healthy: 1,
          http_local: "200",
          disk_pct: 42.5,
          mem_pct: 66,
          load_1min: 0.42,
          uptime_s: 12345,
        },
      ]),
    );
    const snap = await readUptimeSnapshot();
    expect(snap!.last_disk_pct).toBe(42.5);
    expect(snap!.last_mem_pct).toBe(66);
    expect(snap!.last_load_1min).toBe(0.42);
    expect(snap!.last_uptime_s).toBe(12345);
  });

  it("returns null for optional numeric fields when absent or non-numeric", async () => {
    writeFile(
      UPTIME_FILE,
      jsonl([
        { ts: iso(-1000), healthy: 1, disk_pct: "not-a-number" },
      ]),
    );
    const snap = await readUptimeSnapshot();
    expect(snap!.last_disk_pct).toBeNull();
    expect(snap!.last_mem_pct).toBeNull();
    expect(snap!.last_load_1min).toBeNull();
    expect(snap!.last_uptime_s).toBeNull();
  });

  it("returns window_pct=null when no rows fall in the 24h window", async () => {
    const now = Date.now();
    writeFile(
      UPTIME_FILE,
      jsonl([{ ts: iso(-48 * 60 * 60 * 1000, now), healthy: 1 }]),
    );
    vi.setSystemTime(now);
    const snap = await readUptimeSnapshot();
    expect(snap!.window_total).toBe(0);
    expect(snap!.window_pct).toBeNull();
  });

  it("treats healthy=1 as true and any other value as false", async () => {
    writeFile(
      UPTIME_FILE,
      jsonl([
        { ts: iso(-1000), healthy: 1 },
        { ts: iso(-500), healthy: 0 },
      ]),
    );
    const snap = await readUptimeSnapshot();
    expect(snap!.last_healthy).toBe(false);
    expect(snap!.total_healthy).toBe(1);
  });

  it("skips window arithmetic when ts is missing or unparseable", async () => {
    writeFile(
      UPTIME_FILE,
      jsonl([
        { healthy: 1 }, // no ts
        { ts: "not-a-date", healthy: 1 },
      ]),
    );
    const snap = await readUptimeSnapshot();
    expect(snap!.total_rows).toBe(2);
    expect(snap!.window_total).toBe(0);
  });
});

// ─── readCronHealthSummary ─────────────────────────────────────────────

describe("readCronHealthSummary", () => {
  it("returns null when the file is missing", async () => {
    expect(await readCronHealthSummary()).toBeNull();
  });

  it("returns null when every row is unparseable", async () => {
    writeFile(CRON_FILE, "junk\n");
    expect(await readCronHealthSummary()).toBeNull();
  });

  it("counts status=ok case-insensitively within the 24h window", async () => {
    const now = Date.now();
    writeFile(
      CRON_FILE,
      jsonl([
        { ts: iso(-1000, now), status: "OK" },
        { ts: iso(-2000, now), status: "ok" },
        { ts: iso(-3000, now), status: "Ok" },
      ]),
    );
    vi.setSystemTime(now);
    const summary = await readCronHealthSummary();
    expect(summary!.ok_count_24h).toBe(3);
    expect(summary!.fail_count_24h).toBe(0);
  });

  it("counts any non-ok status as a fail within the window", async () => {
    const now = Date.now();
    writeFile(
      CRON_FILE,
      jsonl([
        { ts: iso(-1000, now), status: "ok" },
        { ts: iso(-1000, now), status: "fail" },
        { ts: iso(-1000, now), status: "timeout" },
      ]),
    );
    vi.setSystemTime(now);
    const summary = await readCronHealthSummary();
    expect(summary!.ok_count_24h).toBe(1);
    expect(summary!.fail_count_24h).toBe(2);
  });

  it("excludes rows older than the 24h window from ok/fail counts", async () => {
    const now = Date.now();
    writeFile(
      CRON_FILE,
      jsonl([
        { ts: iso(-25 * 60 * 60 * 1000, now), status: "ok" },
        { ts: iso(-1000, now), status: "fail" },
      ]),
    );
    vi.setSystemTime(now);
    const summary = await readCronHealthSummary();
    expect(summary!.ok_count_24h).toBe(0);
    expect(summary!.fail_count_24h).toBe(1);
  });

  it("computes ok_rate_24h as ok/(ok+fail)*100", async () => {
    const now = Date.now();
    writeFile(
      CRON_FILE,
      jsonl([
        { ts: iso(-1000, now), status: "ok" },
        { ts: iso(-1000, now), status: "ok" },
        { ts: iso(-1000, now), status: "ok" },
        { ts: iso(-1000, now), status: "fail" },
      ]),
    );
    vi.setSystemTime(now);
    const summary = await readCronHealthSummary();
    expect(summary!.ok_rate_24h).toBeCloseTo(75, 4);
  });

  it("classifies level=ok when rate>=99", async () => {
    const now = Date.now();
    const rows = Array.from({ length: 100 }, (_, i) => ({
      ts: iso(-1000 - i, now),
      status: i === 0 ? "ok" : "ok", // 100/100 = 100%
    }));
    writeFile(CRON_FILE, jsonl(rows));
    vi.setSystemTime(now);
    const summary = await readCronHealthSummary();
    expect(summary!.level).toBe("ok");
  });

  it("classifies level=warn when rate in [95, 99)", async () => {
    const now = Date.now();
    const rows: Array<Record<string, unknown>> = [];
    for (let i = 0; i < 97; i++) rows.push({ ts: iso(-1000 - i, now), status: "ok" });
    for (let i = 0; i < 3; i++) rows.push({ ts: iso(-2000 - i, now), status: "fail" });
    writeFile(CRON_FILE, jsonl(rows));
    vi.setSystemTime(now);
    const summary = await readCronHealthSummary();
    expect(summary!.ok_rate_24h).toBeCloseTo(97, 4);
    expect(summary!.level).toBe("warn");
  });

  it("classifies level=bad when rate<95", async () => {
    const now = Date.now();
    const rows: Array<Record<string, unknown>> = [];
    for (let i = 0; i < 9; i++) rows.push({ ts: iso(-1000 - i, now), status: "ok" });
    for (let i = 0; i < 11; i++) rows.push({ ts: iso(-2000 - i, now), status: "fail" });
    writeFile(CRON_FILE, jsonl(rows));
    vi.setSystemTime(now);
    const summary = await readCronHealthSummary();
    expect(summary!.level).toBe("bad");
  });

  it("classifies level=warn when no rows fall inside the 24h window (rate=null)", async () => {
    const now = Date.now();
    writeFile(
      CRON_FILE,
      jsonl([{ ts: iso(-72 * 60 * 60 * 1000, now), status: "ok" }]),
    );
    vi.setSystemTime(now);
    const summary = await readCronHealthSummary();
    expect(summary!.ok_rate_24h).toBeNull();
    expect(summary!.level).toBe("warn");
  });

  it("propagates last_duration_ms when numeric and defaults to null otherwise", async () => {
    const now = Date.now();
    writeFile(
      CRON_FILE,
      jsonl([
        { ts: iso(-1000, now), endpoint: "/x", status: "ok", duration_ms: 42 },
      ]),
    );
    vi.setSystemTime(now);
    const summary = await readCronHealthSummary();
    expect(summary!.last_duration_ms).toBe(42);
    expect(summary!.last_endpoint).toBe("/x");
  });
});

// ─── readDeploySummary ─────────────────────────────────────────────────

describe("readDeploySummary", () => {
  it("returns null when the deploy log is missing", async () => {
    expect(await readDeploySummary()).toBeNull();
  });

  it("returns an empty envelope when every row is unparseable", async () => {
    writeFile(DEPLOY_FILE, "junk\n");
    const summary = await readDeploySummary();
    // no valid rows → both last_* strings empty, counters 0
    expect(summary).not.toBeNull();
    expect(summary!.last_deploy_ts).toBe("");
    expect(summary!.last_push_ts).toBe("");
    expect(summary!.deploys_24h).toBe(0);
    expect(summary!.pushes_24h).toBe(0);
  });

  it("classifies rows with a non-empty `event` string as push events", async () => {
    const now = Date.now();
    writeFile(
      DEPLOY_FILE,
      jsonl([{ ts: iso(-1000, now), event: "push", detail: "master @ abcd" }]),
    );
    vi.setSystemTime(now);
    const summary = await readDeploySummary();
    expect(summary!.pushes_24h).toBe(1);
    expect(summary!.deploys_24h).toBe(0);
    expect(summary!.last_push_detail).toBe("master @ abcd");
  });

  it("classifies rows with `status` (and no event) as deploy events", async () => {
    const now = Date.now();
    writeFile(
      DEPLOY_FILE,
      jsonl([
        { ts: iso(-1000, now), status: "ok", note: "gate3", gates: "1,2,3" },
      ]),
    );
    vi.setSystemTime(now);
    const summary = await readDeploySummary();
    expect(summary!.deploys_24h).toBe(1);
    expect(summary!.pushes_24h).toBe(0);
    expect(summary!.last_deploy_note).toBe("gate3");
    expect(summary!.last_deploy_gates).toBe("1,2,3");
  });

  it("windows both counters to the last 24h separately", async () => {
    const now = Date.now();
    writeFile(
      DEPLOY_FILE,
      jsonl([
        { ts: iso(-25 * 60 * 60 * 1000, now), event: "push", detail: "old" }, // outside
        { ts: iso(-1 * 60 * 60 * 1000, now), event: "push", detail: "new" },
        { ts: iso(-25 * 60 * 60 * 1000, now), status: "ok" },
        { ts: iso(-1 * 60 * 60 * 1000, now), status: "ok" },
      ]),
    );
    vi.setSystemTime(now);
    const summary = await readDeploySummary();
    expect(summary!.pushes_24h).toBe(1);
    expect(summary!.deploys_24h).toBe(1);
    expect(summary!.last_push_detail).toBe("new");
  });

  it("preserves the ordering of last_deploy vs last_push across mixed rows", async () => {
    const now = Date.now();
    writeFile(
      DEPLOY_FILE,
      jsonl([
        { ts: iso(-3000, now), event: "push", detail: "first-push" },
        { ts: iso(-2000, now), status: "ok", note: "deploy-1" },
        { ts: iso(-1000, now), event: "push", detail: "last-push" },
      ]),
    );
    vi.setSystemTime(now);
    const summary = await readDeploySummary();
    expect(summary!.last_push_detail).toBe("last-push");
    expect(summary!.last_deploy_note).toBe("deploy-1");
  });

  it("ignores rows with an empty event string and no status", async () => {
    writeFile(
      DEPLOY_FILE,
      jsonl([{ ts: iso(-1000), event: "" }]),
    );
    const summary = await readDeploySummary();
    expect(summary!.pushes_24h).toBe(0);
    expect(summary!.deploys_24h).toBe(0);
    expect(summary!.last_push_ts).toBe("");
    expect(summary!.last_deploy_ts).toBe("");
  });

  it("skips 24h count when ts is missing but still recognises the row kind", async () => {
    writeFile(
      DEPLOY_FILE,
      jsonl([{ status: "ok", note: "no-ts" }]),
    );
    const summary = await readDeploySummary();
    expect(summary!.deploys_24h).toBe(0);
    expect(summary!.last_deploy_note).toBe("no-ts");
  });

  it("empty push detail falls back to empty string on the summary", async () => {
    writeFile(
      DEPLOY_FILE,
      jsonl([{ ts: iso(-1000), event: "push" }]),
    );
    const summary = await readDeploySummary();
    expect(summary!.last_push_detail).toBe("");
  });

  it("empty deploy note/gates fall back to empty string on the summary", async () => {
    writeFile(
      DEPLOY_FILE,
      jsonl([{ ts: iso(-1000), status: "ok" }]),
    );
    const summary = await readDeploySummary();
    expect(summary!.last_deploy_note).toBe("");
    expect(summary!.last_deploy_gates).toBe("");
  });
});

// ─── readResellerLoopSnapshot ──────────────────────────────────────────

describe("readResellerLoopSnapshot", () => {
  beforeEach(() => {
    execState.responses.set(
      execKey("git", ["log", "--pretty=%s", "-n", "500"]),
      { stdout: "" },
    );
  });

  it("returns null when everything is empty and git yields no ticks", async () => {
    expect(await readResellerLoopSnapshot()).toBeNull();
  });

  it("propagates monitor fields into the snapshot envelope", async () => {
    writeFile(
      RESELLER_MONITOR_FILE,
      jsonl([
        {
          monitor_ts: "2026-07-31T22:00:00Z",
          head_sha: "abcdef1234",
          now_utc: "2026-07-31T22:00:00Z",
          next_utc: "2026-07-31T22:10:00Z",
          seconds_until: 600,
          tick_state: "sleeping",
          last_tick_id: "T-1",
          last_dispatch_ms: 42000,
        },
      ]),
    );
    const snap = await readResellerLoopSnapshot();
    expect(snap!.monitor_ts).toBe("2026-07-31T22:00:00Z");
    expect(snap!.head_sha).toBe("abcdef1234");
    expect(snap!.seconds_until).toBe(600);
    expect(snap!.tick_state).toBe("sleeping");
    expect(snap!.last_dispatch_ms).toBe(42000);
  });

  it("prefers last_log.tick_id over top-level last_tick_id", async () => {
    writeFile(
      RESELLER_MONITOR_FILE,
      jsonl([
        {
          last_tick_id: "TOP",
          last_log: { tick_id: "NESTED", stage: "tick_end" },
        },
      ]),
    );
    const snap = await readResellerLoopSnapshot();
    expect(snap!.last_tick_id).toBe("NESTED");
    expect(snap!.last_stage).toBe("tick_end");
  });

  it("falls back to top-level last_tick_id when last_log.tick_id is absent", async () => {
    writeFile(
      RESELLER_MONITOR_FILE,
      jsonl([{ last_tick_id: "TOP", last_log: {} }]),
    );
    const snap = await readResellerLoopSnapshot();
    expect(snap!.last_tick_id).toBe("TOP");
  });

  it("falls back to last_deploy_stage when last_log.stage is missing", async () => {
    writeFile(
      RESELLER_MONITOR_FILE,
      jsonl([{ last_deploy_stage: "auto_deploy_finished", last_log: {} }]),
    );
    const snap = await readResellerLoopSnapshot();
    expect(snap!.last_stage).toBe("auto_deploy_finished");
  });

  it("propagates human_review_minutes_7d from last_log", async () => {
    writeFile(
      RESELLER_MONITOR_FILE,
      jsonl([{ last_log: { human_review_minutes_7d: 7 } }]),
    );
    const snap = await readResellerLoopSnapshot();
    expect(snap!.human_review_minutes_7d).toBe(7);
  });

  it("counts distinct tick_ids from goal-history for total_ticks_completed", async () => {
    writeFile(
      RESELLER_MONITOR_FILE,
      jsonl([{ monitor_ts: "x" }]),
    );
    writeFile(
      RESELLER_GOAL_FILE,
      jsonl([
        { tick_id: "A", stage: "tick_start" },
        { tick_id: "A", stage: "tick_end" },
        { tick_id: "B", stage: "tick_start" },
        { tick_id: "C", stage: "tick_start" },
      ]),
    );
    const snap = await readResellerLoopSnapshot();
    expect(snap!.total_ticks_completed).toBe(3);
  });

  it("parses current_tick_number + current_phase from the git commit subject", async () => {
    execState.responses.set(
      execKey("git", ["log", "--pretty=%s", "-n", "500"]),
      {
        stdout: [
          "chore(loop): autonomous tick nothing-here",
          "feat(reseller): tick 42 — P11.328 pool-shape surface",
          "feat(reseller): tick 41 — P11.327 whatever",
        ].join("\n"),
      },
    );
    writeFile(RESELLER_MONITOR_FILE, jsonl([{ monitor_ts: "x" }]));
    const snap = await readResellerLoopSnapshot();
    expect(snap!.current_tick_number).toBe(42);
    expect(snap!.current_phase).toBe("P11.328");
  });

  it("nulls current_tick_number + current_phase when git rejects", async () => {
    execState.responses.set(
      execKey("git", ["log", "--pretty=%s", "-n", "500"]),
      new Error("git not available"),
    );
    writeFile(RESELLER_MONITOR_FILE, jsonl([{ monitor_ts: "x" }]));
    const snap = await readResellerLoopSnapshot();
    expect(snap!.current_tick_number).toBeNull();
    expect(snap!.current_phase).toBeNull();
  });

  it("returns non-null when only goal-history has data (no monitor row)", async () => {
    writeFile(
      RESELLER_GOAL_FILE,
      jsonl([{ tick_id: "solo", stage: "tick_end" }]),
    );
    const snap = await readResellerLoopSnapshot();
    expect(snap).not.toBeNull();
    expect(snap!.total_ticks_completed).toBe(1);
    expect(snap!.monitor_ts).toBe("");
  });

  it("returns non-null when only git yields a current tick number", async () => {
    execState.responses.set(
      execKey("git", ["log", "--pretty=%s", "-n", "500"]),
      { stdout: "feat(reseller): tick 5 — P0.1 seed" },
    );
    const snap = await readResellerLoopSnapshot();
    expect(snap).not.toBeNull();
    expect(snap!.current_tick_number).toBe(5);
    expect(snap!.current_phase).toBe("P0.1");
  });
});

// ─── readCommitCounters ────────────────────────────────────────────────

describe("readCommitCounters", () => {
  function stubGitOk(): void {
    execState.responses.set(
      execKey("git", ["log", "--oneline", "--since=24 hours ago"]),
      { stdout: "a\nb\n" },
    );
    execState.responses.set(
      execKey("git", ["log", "--oneline", "--since=7 days ago"]),
      { stdout: "a\nb\nc\n" },
    );
    execState.responses.set(
      execKey("git", ["log", "--oneline"]),
      { stdout: "a\nb\nc\nd\n" },
    );
    execState.responses.set(execKey("git", ["rev-parse", "HEAD"]), {
      stdout: "abcdef1234567890\n",
    });
    execState.responses.set(
      execKey("git", ["rev-parse", "--abbrev-ref", "HEAD"]),
      { stdout: "master\n" },
    );
  }

  it("returns counters + head fields when every git call succeeds", async () => {
    stubGitOk();
    const c = await readCommitCounters();
    expect(c.last_24h).toBe(2);
    expect(c.last_7d).toBe(3);
    expect(c.total).toBe(4);
    expect(c.head_sha).toBe("abcdef1234567890");
    expect(c.head_short).toBe("abcdef1");
    expect(c.branch).toBe("master");
  });

  it("truncates head_short to 7 chars regardless of head_sha length", async () => {
    stubGitOk();
    execState.responses.set(execKey("git", ["rev-parse", "HEAD"]), {
      stdout: "0123456789abcdef\n",
    });
    const c = await readCommitCounters();
    expect(c.head_short).toBe("0123456");
    expect(c.head_short).toHaveLength(7);
  });

  it("returns head_short='' when HEAD is unavailable", async () => {
    stubGitOk();
    execState.responses.set(
      execKey("git", ["rev-parse", "HEAD"]),
      new Error("no git"),
    );
    const c = await readCommitCounters();
    expect(c.head_sha).toBe("");
    expect(c.head_short).toBe("");
  });

  it("returns branch='' when git symbolic-ref rejects", async () => {
    stubGitOk();
    execState.responses.set(
      execKey("git", ["rev-parse", "--abbrev-ref", "HEAD"]),
      new Error("detached"),
    );
    const c = await readCommitCounters();
    expect(c.branch).toBe("");
  });

  it("returns null for a count when its git call rejects", async () => {
    stubGitOk();
    execState.responses.set(
      execKey("git", ["log", "--oneline", "--since=24 hours ago"]),
      new Error("boom"),
    );
    const c = await readCommitCounters();
    expect(c.last_24h).toBeNull();
    // sibling counters unaffected
    expect(c.last_7d).toBe(3);
    expect(c.total).toBe(4);
  });

  it("returns 0 for a count when stdout is empty", async () => {
    stubGitOk();
    execState.responses.set(
      execKey("git", ["log", "--oneline", "--since=24 hours ago"]),
      { stdout: "" },
    );
    const c = await readCommitCounters();
    expect(c.last_24h).toBe(0);
  });

  it("filters out blank lines when counting", async () => {
    stubGitOk();
    execState.responses.set(execKey("git", ["log", "--oneline"]), {
      stdout: "a\n\n   \nb\n\nc\n",
    });
    const c = await readCommitCounters();
    expect(c.total).toBe(3);
  });

  it("invokes each git sub-command exactly once per call", async () => {
    stubGitOk();
    await readCommitCounters();
    const cmds = execState.calls.map((c) => execKey(c.cmd, c.args)).sort();
    expect(cmds).toEqual(
      [
        execKey("git", ["log", "--oneline", "--since=24 hours ago"]),
        execKey("git", ["log", "--oneline", "--since=7 days ago"]),
        execKey("git", ["log", "--oneline"]),
        execKey("git", ["rev-parse", "HEAD"]),
        execKey("git", ["rev-parse", "--abbrev-ref", "HEAD"]),
      ].sort(),
    );
  });

  it("preserves the --since=24 hours ago / --since=7 days ago arg shape", async () => {
    stubGitOk();
    await readCommitCounters();
    const argsSeen = execState.calls.map((c) => c.args.join(" "));
    expect(argsSeen).toContain("log --oneline --since=24 hours ago");
    expect(argsSeen).toContain("log --oneline --since=7 days ago");
    expect(argsSeen).toContain("log --oneline");
  });

  it("never throws even when all git calls reject in parallel", async () => {
    execState.responses.set(
      execKey("git", ["log", "--oneline", "--since=24 hours ago"]),
      new Error("x"),
    );
    execState.responses.set(
      execKey("git", ["log", "--oneline", "--since=7 days ago"]),
      new Error("x"),
    );
    execState.responses.set(execKey("git", ["log", "--oneline"]), new Error("x"));
    execState.responses.set(execKey("git", ["rev-parse", "HEAD"]), new Error("x"));
    execState.responses.set(
      execKey("git", ["rev-parse", "--abbrev-ref", "HEAD"]),
      new Error("x"),
    );
    const c = await readCommitCounters();
    expect(c.last_24h).toBeNull();
    expect(c.last_7d).toBeNull();
    expect(c.total).toBeNull();
    expect(c.head_sha).toBe("");
    expect(c.branch).toBe("");
  });
});
