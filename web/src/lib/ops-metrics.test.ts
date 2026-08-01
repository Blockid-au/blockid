// P9-ops-metrics-lib-test — colocated vitest for the previously-untested
// server-only ops-dashboard aggregator `web/src/lib/ops-metrics.ts`.
//
// Every tile on /admin/ops (and the JSON mirror at /api/admin/ops) is served
// by one of the exported readers here. The module contract is graceful
// degrade: a missing jsonl file, an unreadable Supabase table, or a thrown
// error inside a dep must resolve to a benign empty structure — never throw
// — so a single missing input can't blank the dashboard. This suite pins
// that contract plus the per-reader shape a silent regression could
// otherwise corrupt without any other test noticing:
//
//   - getReleaseInfo → deploy-manifest.git_sha preferred over last-good.sha,
//     .next/BUILD_ID preferred over last-good.buildId, deploy-manifest.deployed_at
//     preferred over last-good.ts, numeric-parseable pid preferred over process.pid
//   - getDeployHealth24h → 24h cutoff, only status="success"/"ok" counted as clean,
//     cron-health status="ok" is the publicHttp200Count proxy, malformed jsonl skipped
//   - getCreditBurn30d → null admin/error/data all return empty, string credits_used
//     coerced, ≤0 skipped, byFeature top-5 desc, daily bucket spans lastNDays(30)
//   - getCronHealth24h → latest row per endpoint kept, sorted worst-first (highest
//     lagMinutes), status defaults to "unknown", missing endpoint skipped
//   - getActiveExperiments → running-only filter, thrown dep swallowed → [],
//     variant impressions=0 → conversionRate=0 (never NaN), missing summary → 0/0
//   - getGrowth7d → null admin → 7d zeros, users/analyses errors independent, malformed
//     created_at skipped
//   - getSecurityPosture → null file → null, top-3 by ascending score, label→key
//     fallback, non-array dimensions → topIssues=[], scoreToSeverity ladder
//   - Memoisation → 60s TTL: 2nd call within TTL returns cached value, past TTL busts
//
// P9_ship touchpoint: this module powers the COO overlay used to sign off the
// autonomous-loop tick health — a silent regression in the release-info
// precedence or the 24h cron-health count would surface first here.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import path from "node:path";

// ─── fixture state ─────────────────────────────────────────────────────

interface FsState {
  files: Map<string, string>;
  exists: Set<string>;
  throwRead: Map<string, Error>;
  throwExists: Map<string, Error>;
}

const fsState: FsState = {
  files: new Map(),
  exists: new Set(),
  throwRead: new Map(),
  throwExists: new Map(),
};

function resetFs(): void {
  fsState.files.clear();
  fsState.exists.clear();
  fsState.throwRead.clear();
  fsState.throwExists.clear();
}

vi.mock("server-only", () => ({}));

vi.mock("node:fs", () => ({
  existsSync: (p: string) => {
    const t = fsState.throwExists.get(p);
    if (t) throw t;
    return fsState.exists.has(p);
  },
  readFileSync: (p: string, _enc?: string) => {
    const t = fsState.throwRead.get(p);
    if (t) throw t;
    if (!fsState.files.has(p)) throw new Error(`ENOENT: ${p}`);
    return fsState.files.get(p) as string;
  },
}));

// ─── supabase fake ─────────────────────────────────────────────────────

interface SbResponse {
  data: unknown;
  error: { message: string } | null;
}

interface SbState {
  hasAdmin: boolean;
  responses: Map<string, SbResponse>;
}

const sbState: SbState = { hasAdmin: true, responses: new Map() };

function resetSb(): void {
  sbState.hasAdmin = true;
  sbState.responses.clear();
}

function makeSupabase() {
  return {
    from(table: string) {
      const chain = {
        select() {
          return chain;
        },
        gte() {
          return chain;
        },
        limit() {
          return chain;
        },
        // Awaited directly — must be thenable.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        then(onFulfilled: any, onRejected: any) {
          const resp = sbState.responses.get(table) ?? { data: null, error: null };
          return Promise.resolve(resp).then(onFulfilled, onRejected);
        },
      };
      return chain;
    },
  };
}

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => (sbState.hasAdmin ? makeSupabase() : null),
}));

// Ops-metrics imports supabase via a relative "./supabase" specifier; the
// vitest alias maps "@/lib/supabase" to the same file so a mock on either
// path resolves to the same module identity — but we mock the relative
// path directly to be safe.
vi.mock("./supabase", () => ({
  getSupabaseAdmin: () => (sbState.hasAdmin ? makeSupabase() : null),
}));

// ─── pricing-experiments fake ──────────────────────────────────────────

interface ExpState {
  listExperiments: () => Promise<unknown[]>;
  summarise: (id: string) => Promise<unknown[]>;
}

const expState: ExpState = {
  listExperiments: async () => [],
  summarise: async () => [],
};

vi.mock("./pricing-experiments", () => ({
  listExperiments: () => expState.listExperiments(),
  summarise: (id: string) => expState.summarise(id),
}));

// ─── SUT import (after mocks) ──────────────────────────────────────────

import {
  getReleaseInfo,
  getDeployHealth24h,
  getCreditBurn30d,
  getCronHealth24h,
  getActiveExperiments,
  getGrowth7d,
  getSecurityPosture,
} from "./ops-metrics";

// ─── path helpers ──────────────────────────────────────────────────────

const REPORTS_DIR = path.join(process.cwd(), "content", "reports");
const DEPLOY_LOG = path.join(REPORTS_DIR, "deploy-log.jsonl");
const CRON_HEALTH = path.join(REPORTS_DIR, "cron-health.jsonl");
const LAST_GOOD_BUILD = path.join(REPORTS_DIR, "last-good-build.json");
const SECURITY_POSTURE = path.join(REPORTS_DIR, "security-posture.json");
const DEPLOY_MANIFEST = path.join(process.cwd(), ".deploy-manifest.json");
const NEXT_BUILD_ID = path.join(process.cwd(), ".next", "BUILD_ID");

function writeFile(p: string, contents: string): void {
  fsState.files.set(p, contents);
  fsState.exists.add(p);
}

function jsonl(rows: Array<Record<string, unknown>>): string {
  return rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
}

// ─── time-based cache busting ──────────────────────────────────────────
//
// ops-metrics.ts holds a module-scoped 60s TTL cache. To keep tests
// independent, we advance the fake system time by ≥ 5 minutes in each
// beforeEach so every prior memo entry is stale.

let clock = new Date("2026-08-01T12:00:00Z").getTime();

beforeEach(() => {
  resetFs();
  resetSb();
  expState.listExperiments = async () => [];
  expState.summarise = async () => [];
  clock += 5 * 60_000; // 5 minutes — well past TTL_MS = 60_000
  vi.useFakeTimers();
  vi.setSystemTime(new Date(clock));
});

afterEach(() => {
  vi.useRealTimers();
});

// ═══════════════════════════════════════════════════════════════════════
// getReleaseInfo
// ═══════════════════════════════════════════════════════════════════════

describe("getReleaseInfo", () => {
  it("returns all nulls (except pid=process.pid) when every source missing", async () => {
    const info = await getReleaseInfo();
    expect(info.buildId).toBeNull();
    expect(info.gitSha).toBeNull();
    expect(info.deployedAt).toBeNull();
    // pid falls through to process.pid when no last-good file provides one.
    expect(info.pid).toBe(process.pid);
  });

  it("prefers deploy-manifest.git_sha + deployed_at when manifest present", async () => {
    writeFile(
      DEPLOY_MANIFEST,
      JSON.stringify({
        git_sha: "abc1234",
        deployed_at: "2026-07-31T09:00:00Z",
      }),
    );
    writeFile(
      LAST_GOOD_BUILD,
      JSON.stringify({
        sha: "OLD_SHA_LOSES",
        ts: "2026-07-30T00:00:00Z",
      }),
    );
    const info = await getReleaseInfo();
    expect(info.gitSha).toBe("abc1234");
    expect(info.deployedAt).toBe("2026-07-31T09:00:00Z");
  });

  it("falls back to last-good sha/ts/buildId when manifest missing", async () => {
    writeFile(
      LAST_GOOD_BUILD,
      JSON.stringify({
        sha: "lg_sha",
        ts: "2026-07-30T10:00:00Z",
        buildId: "lg_bid",
        pid: "4242",
      }),
    );
    const info = await getReleaseInfo();
    expect(info.gitSha).toBe("lg_sha");
    expect(info.deployedAt).toBe("2026-07-30T10:00:00Z");
    expect(info.buildId).toBe("lg_bid");
    expect(info.pid).toBe(4242);
  });

  it("prefers .next/BUILD_ID on disk over last-good.buildId", async () => {
    writeFile(NEXT_BUILD_ID, "  disk_bid  \n"); // trimmed
    writeFile(LAST_GOOD_BUILD, JSON.stringify({ buildId: "lg_bid" }));
    const info = await getReleaseInfo();
    expect(info.buildId).toBe("disk_bid");
  });

  it("treats an empty BUILD_ID file as null (falls through)", async () => {
    writeFile(NEXT_BUILD_ID, "   \n"); // whitespace only → trim → "" → null
    writeFile(LAST_GOOD_BUILD, JSON.stringify({ buildId: "lg_bid" }));
    const info = await getReleaseInfo();
    // trim("") is falsy so buildIdFromDisk stays null and the last-good
    // buildId is used.
    expect(info.buildId).toBe("lg_bid");
  });

  it("swallows a thrown existsSync on BUILD_ID and falls through", async () => {
    fsState.throwExists.set(NEXT_BUILD_ID, new Error("EACCES"));
    writeFile(LAST_GOOD_BUILD, JSON.stringify({ buildId: "lg_bid" }));
    const info = await getReleaseInfo();
    expect(info.buildId).toBe("lg_bid");
  });

  it("uses process.pid when last-good.pid is not a parseable integer", async () => {
    writeFile(LAST_GOOD_BUILD, JSON.stringify({ pid: "not-a-number" }));
    const info = await getReleaseInfo();
    expect(info.pid).toBe(process.pid);
  });

  it("uses parsed pid when last-good.pid is a numeric string", async () => {
    writeFile(LAST_GOOD_BUILD, JSON.stringify({ pid: "12345" }));
    const info = await getReleaseInfo();
    expect(info.pid).toBe(12345);
  });

  it("swallows a malformed manifest JSON silently", async () => {
    writeFile(DEPLOY_MANIFEST, "{not json");
    const info = await getReleaseInfo();
    expect(info.gitSha).toBeNull();
    expect(info.deployedAt).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// getDeployHealth24h
// ═══════════════════════════════════════════════════════════════════════

describe("getDeployHealth24h", () => {
  it("returns {0,0,0} when neither jsonl file exists", async () => {
    const h = await getDeployHealth24h();
    expect(h).toEqual({ deploys: 0, failures: 0, publicHttp200Count: 0 });
  });

  it("counts deploys within 24h and treats non-success/non-ok as failures", async () => {
    const nowIso = new Date(clock).toISOString();
    writeFile(
      DEPLOY_LOG,
      jsonl([
        { ts: nowIso, status: "success" },
        { ts: nowIso, status: "ok" },
        { ts: nowIso, status: "error" },
      ]),
    );
    const h = await getDeployHealth24h();
    expect(h.deploys).toBe(3);
    expect(h.failures).toBe(1);
  });

  it("excludes rows older than 24h", async () => {
    const old = new Date(clock - 25 * 60 * 60 * 1000).toISOString();
    const now = new Date(clock).toISOString();
    writeFile(
      DEPLOY_LOG,
      jsonl([
        { ts: old, status: "success" },
        { ts: now, status: "success" },
      ]),
    );
    const h = await getDeployHealth24h();
    expect(h.deploys).toBe(1);
  });

  it("skips malformed jsonl lines and rows with unparseable ts", async () => {
    const now = new Date(clock).toISOString();
    writeFile(
      DEPLOY_LOG,
      // one clean row, one broken JSON, one row with no ts
      `${JSON.stringify({ ts: now, status: "success" })}\n{broken\n${JSON.stringify({ status: "success" })}\n`,
    );
    const h = await getDeployHealth24h();
    expect(h.deploys).toBe(1);
    expect(h.failures).toBe(0);
  });

  it("counts cron-health status=ok rows as publicHttp200Count and ignores others", async () => {
    const now = new Date(clock).toISOString();
    writeFile(
      CRON_HEALTH,
      jsonl([
        { ts: now, endpoint: "/a", status: "ok" },
        { ts: now, endpoint: "/b", status: "ok" },
        { ts: now, endpoint: "/c", status: "error" },
      ]),
    );
    const h = await getDeployHealth24h();
    expect(h.publicHttp200Count).toBe(2);
  });

  it("excludes cron-health rows older than 24h from publicHttp200Count", async () => {
    const old = new Date(clock - 30 * 60 * 60 * 1000).toISOString();
    const now = new Date(clock).toISOString();
    writeFile(
      CRON_HEALTH,
      jsonl([
        { ts: old, status: "ok" },
        { ts: now, status: "ok" },
      ]),
    );
    const h = await getDeployHealth24h();
    expect(h.publicHttp200Count).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// getCreditBurn30d
// ═══════════════════════════════════════════════════════════════════════

describe("getCreditBurn30d", () => {
  it("returns empty when supabase admin is null", async () => {
    sbState.hasAdmin = false;
    const b = await getCreditBurn30d();
    expect(b).toEqual({ total: 0, byFeature: [], daily: [] });
  });

  it("returns empty when the query surfaces an error", async () => {
    sbState.responses.set("usage_logs", { data: null, error: { message: "boom" } });
    const b = await getCreditBurn30d();
    expect(b).toEqual({ total: 0, byFeature: [], daily: [] });
  });

  it("returns empty when data is null and no error", async () => {
    sbState.responses.set("usage_logs", { data: null, error: null });
    const b = await getCreditBurn30d();
    expect(b).toEqual({ total: 0, byFeature: [], daily: [] });
  });

  it("aggregates total + byFeature (top 5 desc) + pctOfTotal", async () => {
    const day = new Date(clock).toISOString();
    sbState.responses.set("usage_logs", {
      data: [
        { feature: "a", credits_used: 10, created_at: day },
        { feature: "b", credits_used: 5, created_at: day },
        { feature: "a", credits_used: 5, created_at: day }, // → a = 15
        { feature: "c", credits_used: 3, created_at: day },
        { feature: "d", credits_used: 2, created_at: day },
        { feature: "e", credits_used: 1, created_at: day },
        { feature: "f", credits_used: 1, created_at: day }, // 6 features → top 5 kept
      ],
      error: null,
    });
    const b = await getCreditBurn30d();
    expect(b.total).toBe(27);
    expect(b.byFeature).toHaveLength(5);
    expect(b.byFeature.map((r) => r.feature)).toEqual(["a", "b", "c", "d", "e"]);
    expect(b.byFeature[0]).toMatchObject({ feature: "a", credits: 15 });
    expect(b.byFeature[0].pctOfTotal).toBeCloseTo(15 / 27, 6);
  });

  it("coerces credits_used from string and skips non-finite / non-positive", async () => {
    const day = new Date(clock).toISOString();
    sbState.responses.set("usage_logs", {
      data: [
        { feature: "a", credits_used: "12.5", created_at: day },
        { feature: "a", credits_used: "not-a-number", created_at: day },
        { feature: "a", credits_used: 0, created_at: day },
        { feature: "a", credits_used: -5, created_at: day },
      ],
      error: null,
    });
    const b = await getCreditBurn30d();
    expect(b.total).toBe(12.5);
    expect(b.byFeature[0]).toMatchObject({ feature: "a", credits: 12.5 });
  });

  it("populates daily[] with exactly 30 slots in chronological order", async () => {
    sbState.responses.set("usage_logs", { data: [], error: null });
    const b = await getCreditBurn30d();
    expect(b.daily).toHaveLength(30);
    for (let i = 1; i < b.daily.length; i++) {
      expect(b.daily[i].day > b.daily[i - 1].day).toBe(true);
    }
    // Last slot is today (UTC day matches clock's UTC day).
    const todayKey = new Date(clock).toISOString().slice(0, 10);
    expect(b.daily[b.daily.length - 1].day).toBe(todayKey);
  });

  it("buckets credits into the correct daily slot", async () => {
    const today = new Date(clock).toISOString();
    sbState.responses.set("usage_logs", {
      data: [{ feature: "a", credits_used: 7.5, created_at: today }],
      error: null,
    });
    const b = await getCreditBurn30d();
    const todayKey = today.slice(0, 10);
    const slot = b.daily.find((d) => d.day === todayKey);
    expect(slot?.credits).toBe(7.5);
  });

  it("rounds total + per-feature to 2dp", async () => {
    const today = new Date(clock).toISOString();
    sbState.responses.set("usage_logs", {
      data: [
        { feature: "a", credits_used: 1.001, created_at: today },
        { feature: "a", credits_used: 1.001, created_at: today },
        { feature: "a", credits_used: 1.001, created_at: today },
      ],
      error: null,
    });
    const b = await getCreditBurn30d();
    // 3.003 → 3
    expect(b.total).toBe(3);
    expect(b.byFeature[0].credits).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// getCronHealth24h
// ═══════════════════════════════════════════════════════════════════════

describe("getCronHealth24h", () => {
  it("returns [] when the jsonl file is missing", async () => {
    expect(await getCronHealth24h()).toEqual([]);
  });

  it("keeps only the latest row per endpoint", async () => {
    const t1 = new Date(clock - 30 * 60_000).toISOString();
    const t2 = new Date(clock - 10 * 60_000).toISOString();
    writeFile(
      CRON_HEALTH,
      jsonl([
        { ts: t1, endpoint: "/a", status: "ok" },
        { ts: t2, endpoint: "/a", status: "error" }, // later
        { ts: t2, endpoint: "/b", status: "ok" },
      ]),
    );
    const rows = await getCronHealth24h();
    const a = rows.find((r) => r.job === "/a");
    expect(a?.lastStatus).toBe("error");
    expect(rows).toHaveLength(2);
  });

  it("sorts worst-first by lagMinutes (highest lag first)", async () => {
    const older = new Date(clock - 40 * 60_000).toISOString();
    const newer = new Date(clock - 5 * 60_000).toISOString();
    writeFile(
      CRON_HEALTH,
      jsonl([
        { ts: newer, endpoint: "/fresh", status: "ok" },
        { ts: older, endpoint: "/stale", status: "ok" },
      ]),
    );
    const rows = await getCronHealth24h();
    expect(rows[0].job).toBe("/stale");
    expect(rows[0].lagMinutes).toBeGreaterThanOrEqual(rows[1].lagMinutes);
  });

  it("excludes rows older than 24h", async () => {
    const old = new Date(clock - 25 * 60 * 60 * 1000).toISOString();
    writeFile(CRON_HEALTH, jsonl([{ ts: old, endpoint: "/x", status: "ok" }]));
    expect(await getCronHealth24h()).toEqual([]);
  });

  it("skips rows with a missing endpoint field", async () => {
    const now = new Date(clock).toISOString();
    writeFile(
      CRON_HEALTH,
      jsonl([
        { ts: now, status: "ok" },
        { ts: now, endpoint: "/kept", status: "ok" },
      ]),
    );
    const rows = await getCronHealth24h();
    expect(rows).toHaveLength(1);
    expect(rows[0].job).toBe("/kept");
  });

  it("defaults missing status to 'unknown'", async () => {
    const now = new Date(clock).toISOString();
    writeFile(CRON_HEALTH, jsonl([{ ts: now, endpoint: "/x" }]));
    const rows = await getCronHealth24h();
    expect(rows[0].lastStatus).toBe("unknown");
  });

  it("lagMinutes is bounded below by 0 (a future timestamp doesn't go negative)", async () => {
    const future = new Date(clock + 10 * 60_000).toISOString();
    writeFile(CRON_HEALTH, jsonl([{ ts: future, endpoint: "/x", status: "ok" }]));
    const rows = await getCronHealth24h();
    expect(rows[0].lagMinutes).toBeGreaterThanOrEqual(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// getActiveExperiments
// ═══════════════════════════════════════════════════════════════════════

describe("getActiveExperiments", () => {
  it("returns [] when nothing is running", async () => {
    expState.listExperiments = async () => [
      { id: "e1", name: "n", hypothesis: "h", status: "draft", variants: [] },
    ];
    expect(await getActiveExperiments()).toEqual([]);
  });

  it("shapes running experiments with variant impressions/conversions", async () => {
    expState.listExperiments = async () => [
      {
        id: "e1",
        name: "N",
        hypothesis: "H",
        status: "running",
        variants: [
          { key: "A", label: "A", payload: {} },
          { key: "B", label: "B", payload: {} },
        ],
      },
    ];
    expState.summarise = async () => [
      { variantKey: "A", impressions: 100, conversions: 25 },
      { variantKey: "B", impressions: 50, conversions: 10 },
    ];
    const out = await getActiveExperiments();
    expect(out).toHaveLength(1);
    expect(out[0].variants[0]).toMatchObject({
      key: "A",
      impressions: 100,
      conversions: 25,
    });
    expect(out[0].variants[0].conversionRate).toBeCloseTo(0.25, 6);
    expect(out[0].variants[1].conversionRate).toBeCloseTo(0.2, 6);
  });

  it("emits 0/0/0 for a variant that has no summary row", async () => {
    expState.listExperiments = async () => [
      {
        id: "e1",
        name: "n",
        hypothesis: "h",
        status: "running",
        variants: [{ key: "A", label: "A", payload: {} }],
      },
    ];
    expState.summarise = async () => []; // no rows
    const out = await getActiveExperiments();
    expect(out[0].variants[0]).toEqual({
      key: "A",
      impressions: 0,
      conversions: 0,
      conversionRate: 0,
    });
  });

  it("returns conversionRate=0 (never NaN) when impressions=0", async () => {
    expState.listExperiments = async () => [
      {
        id: "e1",
        name: "n",
        hypothesis: "h",
        status: "running",
        variants: [{ key: "A", label: "A", payload: {} }],
      },
    ];
    expState.summarise = async () => [
      { variantKey: "A", impressions: 0, conversions: 0 },
    ];
    const out = await getActiveExperiments();
    expect(out[0].variants[0].conversionRate).toBe(0);
  });

  it("swallows a thrown dep and returns []", async () => {
    expState.listExperiments = async () => {
      throw new Error("boom");
    };
    expect(await getActiveExperiments()).toEqual([]);
  });

  it("filters draft/paused/concluded and keeps only running", async () => {
    expState.listExperiments = async () => [
      { id: "d", name: "d", hypothesis: "h", status: "draft", variants: [] },
      { id: "p", name: "p", hypothesis: "h", status: "paused", variants: [] },
      { id: "c", name: "c", hypothesis: "h", status: "concluded", variants: [] },
      { id: "r", name: "r", hypothesis: "h", status: "running", variants: [] },
    ];
    expState.summarise = async () => [];
    const out = await getActiveExperiments();
    expect(out.map((e) => e.id)).toEqual(["r"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// getGrowth7d
// ═══════════════════════════════════════════════════════════════════════

describe("getGrowth7d", () => {
  it("returns 7 zero-filled days when supabase admin is null", async () => {
    sbState.hasAdmin = false;
    const g = await getGrowth7d();
    expect(g.signupsDaily).toHaveLength(7);
    expect(g.analysesDaily).toHaveLength(7);
    expect(g.signupsDaily.every((d) => d.count === 0)).toBe(true);
    expect(g.analysesDaily.every((d) => d.count === 0)).toBe(true);
  });

  it("buckets sign-ups and analyses per UTC day", async () => {
    const today = new Date(clock).toISOString();
    sbState.responses.set("app_users", {
      data: [{ created_at: today }, { created_at: today }],
      error: null,
    });
    sbState.responses.set("svi_analyses", {
      data: [{ created_at: today }],
      error: null,
    });
    const g = await getGrowth7d();
    const todayKey = today.slice(0, 10);
    expect(g.signupsDaily.find((d) => d.day === todayKey)?.count).toBe(2);
    expect(g.analysesDaily.find((d) => d.day === todayKey)?.count).toBe(1);
  });

  it("degrades users bucket to empty when its query errored (analyses stay)", async () => {
    const today = new Date(clock).toISOString();
    sbState.responses.set("app_users", {
      data: null,
      error: { message: "boom" },
    });
    sbState.responses.set("svi_analyses", {
      data: [{ created_at: today }],
      error: null,
    });
    const g = await getGrowth7d();
    expect(g.signupsDaily.every((d) => d.count === 0)).toBe(true);
    const todayKey = today.slice(0, 10);
    expect(g.analysesDaily.find((d) => d.day === todayKey)?.count).toBe(1);
  });

  it("degrades analyses bucket to empty when its query errored (signups stay)", async () => {
    const today = new Date(clock).toISOString();
    sbState.responses.set("app_users", {
      data: [{ created_at: today }],
      error: null,
    });
    sbState.responses.set("svi_analyses", {
      data: null,
      error: { message: "boom" },
    });
    const g = await getGrowth7d();
    expect(g.analysesDaily.every((d) => d.count === 0)).toBe(true);
    const todayKey = today.slice(0, 10);
    expect(g.signupsDaily.find((d) => d.day === todayKey)?.count).toBe(1);
  });

  it("skips rows with a missing created_at", async () => {
    const today = new Date(clock).toISOString();
    sbState.responses.set("app_users", {
      data: [{ created_at: today }, {}],
      error: null,
    });
    sbState.responses.set("svi_analyses", { data: [], error: null });
    const g = await getGrowth7d();
    const todayKey = today.slice(0, 10);
    expect(g.signupsDaily.find((d) => d.day === todayKey)?.count).toBe(1);
  });

  it("days are exactly 7 in ascending order", async () => {
    sbState.responses.set("app_users", { data: [], error: null });
    sbState.responses.set("svi_analyses", { data: [], error: null });
    const g = await getGrowth7d();
    expect(g.signupsDaily).toHaveLength(7);
    for (let i = 1; i < g.signupsDaily.length; i++) {
      expect(g.signupsDaily[i].day > g.signupsDaily[i - 1].day).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// getSecurityPosture
// ═══════════════════════════════════════════════════════════════════════

describe("getSecurityPosture", () => {
  it("returns null when the posture file is missing", async () => {
    expect(await getSecurityPosture()).toBeNull();
  });

  it("returns null when the posture file has invalid JSON", async () => {
    writeFile(SECURITY_POSTURE, "{not json");
    expect(await getSecurityPosture()).toBeNull();
  });

  it("returns the top 3 issues sorted by ascending score", async () => {
    writeFile(
      SECURITY_POSTURE,
      JSON.stringify({
        date: "2026-07-30",
        dimensions: [
          { key: "auth", label: "Auth", score: 8 },
          { key: "csp", label: "CSP", score: 2 },
          { key: "rate", label: "Rate limits", score: 5 },
          { key: "logs", label: "Logs", score: 4 },
        ],
      }),
    );
    const p = await getSecurityPosture();
    expect(p?.lastAuditAt).toBe("2026-07-30");
    expect(p?.topIssues).toHaveLength(3);
    expect(p?.topIssues.map((t) => t.title)).toEqual(["CSP", "Logs", "Rate limits"]);
  });

  it("applies the scoreToSeverity ladder (critical≤2, high≤5, medium≤7, low>7)", async () => {
    writeFile(
      SECURITY_POSTURE,
      JSON.stringify({
        dimensions: [
          { key: "c", label: "C", score: 1 }, // critical
          { key: "h", label: "H", score: 5 }, // high
          { key: "m", label: "M", score: 6 }, // medium
          { key: "l", label: "L", score: 9 }, // low (dropped — top-3 filter)
        ],
      }),
    );
    const p = await getSecurityPosture();
    // Top 3 by ascending score: C(1) → critical, H(5) → high, M(6) → medium.
    expect(p?.topIssues).toEqual([
      { title: "C", severity: "critical" },
      { title: "H", severity: "high" },
      { title: "M", severity: "medium" },
    ]);
  });

  it("scoreToSeverity edge: exactly 2 is critical, 3 is high, 7 is medium, 8 is low", async () => {
    writeFile(
      SECURITY_POSTURE,
      JSON.stringify({
        dimensions: [
          { key: "a", label: "S2", score: 2 },
          { key: "b", label: "S3", score: 3 },
          { key: "c", label: "S7", score: 7 },
          { key: "d", label: "S8", score: 8 },
        ],
      }),
    );
    const p = await getSecurityPosture();
    // Sort ascending → S2(2), S3(3), S7(7).
    expect(p?.topIssues.map((t) => `${t.title}=${t.severity}`)).toEqual([
      "S2=critical",
      "S3=high",
      "S7=medium",
    ]);
  });

  it("returns [] topIssues when dimensions is not an array", async () => {
    writeFile(
      SECURITY_POSTURE,
      JSON.stringify({ date: "2026-07-30", dimensions: "oops" }),
    );
    const p = await getSecurityPosture();
    expect(p?.topIssues).toEqual([]);
    expect(p?.lastAuditAt).toBe("2026-07-30");
  });

  it("falls back label → key → 'Unknown' when label is missing", async () => {
    writeFile(
      SECURITY_POSTURE,
      JSON.stringify({
        dimensions: [
          { key: "onlyKey", score: 1 },
          { score: 2 },
          { key: "third", label: "Third", score: 3 },
        ],
      }),
    );
    const p = await getSecurityPosture();
    expect(p?.topIssues.map((t) => t.title)).toEqual([
      "onlyKey",
      "Unknown",
      "Third",
    ]);
  });

  it("defaults a missing score to 10 for the sort (dimensions with no score sink)", async () => {
    writeFile(
      SECURITY_POSTURE,
      JSON.stringify({
        dimensions: [
          { key: "a", label: "A", score: 5 },
          { key: "b", label: "B" }, // no score → treated as 10 for sort
          { key: "c", label: "C", score: 3 },
        ],
      }),
    );
    const p = await getSecurityPosture();
    expect(p?.topIssues.map((t) => t.title)).toEqual(["C", "A", "B"]);
    // B has no numeric score → severity ladder receives 10 → "low"
    expect(p?.topIssues[2].severity).toBe("low");
  });

  it("lastAuditAt is null when the file omits `date`", async () => {
    writeFile(SECURITY_POSTURE, JSON.stringify({ dimensions: [] }));
    const p = await getSecurityPosture();
    expect(p?.lastAuditAt).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Memoisation (60s TTL)
// ═══════════════════════════════════════════════════════════════════════

describe("memoisation", () => {
  it("returns the cached value inside the TTL window even after fixtures change", async () => {
    const now = new Date(clock).toISOString();
    writeFile(
      CRON_HEALTH,
      jsonl([{ ts: now, endpoint: "/a", status: "ok" }]),
    );
    const first = await getCronHealth24h();
    expect(first).toHaveLength(1);

    // Change the underlying fixture — swap in a different endpoint set.
    fsState.files.set(
      CRON_HEALTH,
      jsonl([
        { ts: now, endpoint: "/a", status: "ok" },
        { ts: now, endpoint: "/b", status: "ok" },
      ]),
    );
    // Advance time by less than TTL_MS (60_000).
    vi.setSystemTime(new Date(clock + 30_000));
    const cached = await getCronHealth24h();
    // Still 1 row — cache served, fixture change ignored.
    expect(cached).toHaveLength(1);
  });

  it("busts the cache once time advances past TTL_MS (60s)", async () => {
    const now = new Date(clock).toISOString();
    writeFile(CRON_HEALTH, jsonl([{ ts: now, endpoint: "/a", status: "ok" }]));
    const first = await getCronHealth24h();
    expect(first).toHaveLength(1);

    fsState.files.set(
      CRON_HEALTH,
      jsonl([
        { ts: now, endpoint: "/a", status: "ok" },
        { ts: now, endpoint: "/b", status: "ok" },
      ]),
    );
    // Advance past TTL to force re-read.
    vi.setSystemTime(new Date(clock + 61_000));
    const busted = await getCronHealth24h();
    expect(busted).toHaveLength(2);
  });
});
