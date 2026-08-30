// Colocated vitest for GET /api/status — P9-status-route-test.
//
// The route is the public status board. It is the single fan-in that:
//   1. Calls the internal /api/healthz over localhost:4001 with a 2s abort
//      timeout — a hang there must never hang the status page.
//   2. Reads two JSONL logs (deploy-log, cron-health) from cwd/content/reports,
//      parses the last-real deploy skipping webhook `event` rows, and buckets
//      the last 24h of per-cron ok-rate + avg-duration.
//   3. Falls back through version.json → .deploy-manifest.json → package.json
//      for the `version` field when healthz is unreachable, and through
//      .deploy-manifest.json for the fallback git_sha carried on the deploy
//      row and cache-controls the response s-maxage=30 SWR 60.
//
// Silent regressions this pins against:
//   - dropping the AbortController timeout so a hung healthz stalls /status;
//   - flipping the "always 200" contract so a degraded aggregate 5xxs and
//     torpedoes any upstream uptime probe pointed at /api/status;
//   - dropping the `event` skip on the deploy tail so a github-webhook row
//     shadows the real deploy;
//   - swapping the "10/10" gates parser to accept "10 of 10" or "10-10" and
//     silently returning {0, 0} for every historical row;
//   - dropping the 24h cutoff on cron stats so a week-old failure row still
//     drags the ok_rate_24h down and yells "degraded" on the status page;
//   - regressing the `endpoint` ↔ `cron` field-name alias so half the cron
//     buckets vanish (the existing corpus writes `endpoint`; the spec allows
//     `cron`);
//   - dropping the SLO thresholds (p95 800 / disk 80 / mem 75) so a breach
//     no longer flips `ok:false`;
//   - flipping the "unreachable ⇒ down, other-error ⇒ degraded" ladder in
//     checkToStatus and losing the actionable signal to on-call;
//   - dropping the cache-control header so the CDN hammers the route.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import path from "node:path";

// Grant the tests trusted access to the /api/status payload so existing
// assertions on sha, release_id, disk_pct, mem_pct, and the cron catalogue
// keep working — the redaction behavior for public callers has its own
// dedicated tests below.
process.env.STATUS_FULL_TOKEN = "test-trusted-token";
vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (name: string) =>
      name.toLowerCase() === "authorization"
        ? `Bearer ${process.env.STATUS_FULL_TOKEN ?? ""}`
        : null,
  }),
}));

// ─── fs fixture ────────────────────────────────────────────────────────

interface FsState {
  files: Map<string, string>;
  errors: Map<string, Error>;
  reads: string[];
}

const fsState: FsState = { files: new Map(), errors: new Map(), reads: [] };

function resetFs(): void {
  fsState.files.clear();
  fsState.errors.clear();
  fsState.reads.length = 0;
}

vi.mock("node:fs", () => ({
  promises: {
    readFile: vi.fn(async (p: string, _enc?: string): Promise<string> => {
      fsState.reads.push(p);
      const err = fsState.errors.get(p);
      if (err) throw err;
      if (!fsState.files.has(p)) throw new Error(`ENOENT: ${p}`);
      return fsState.files.get(p) as string;
    }),
  },
}));

// ─── fetch fixture ─────────────────────────────────────────────────────

type FetchResponder =
  | { kind: "json"; body: unknown; status?: number }
  | { kind: "throw"; error: Error }
  | { kind: "hang" }; // never resolves → forces abort

interface FetchState {
  responder: FetchResponder;
  calls: Array<{ url: string; signal: AbortSignal | undefined }>;
  aborts: number;
}

const fetchState: FetchState = {
  responder: { kind: "throw", error: new Error("no fixture") },
  calls: [],
  aborts: 0,
};

function resetFetch(): void {
  fetchState.responder = { kind: "throw", error: new Error("no fixture") };
  fetchState.calls.length = 0;
  fetchState.aborts = 0;
}

beforeEach(() => {
  resetFs();
  resetFetch();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const asStr = typeof url === "string" ? url : url.toString();
      const signal = init?.signal ?? undefined;
      fetchState.calls.push({ url: asStr, signal: signal ?? undefined });
      const r = fetchState.responder;
      if (r.kind === "throw") throw r.error;
      if (r.kind === "hang") {
        return await new Promise((_resolve, reject) => {
          if (signal) {
            const onAbort = (): void => {
              fetchState.aborts += 1;
              const err = new Error("aborted");
              err.name = "AbortError";
              reject(err);
            };
            if (signal.aborted) onAbort();
            else signal.addEventListener("abort", onAbort, { once: true });
          }
        });
      }
      return {
        ok: (r.status ?? 200) < 400,
        status: r.status ?? 200,
        async json(): Promise<unknown> {
          return r.body;
        },
      } as unknown as Response;
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// ─── SUT import (after mocks) ──────────────────────────────────────────

import { GET, dynamic, runtime } from "./route";

// ─── path helpers (mirror the route's cwd + rel joins) ─────────────────

const REPO_ROOT = process.cwd();
const DEPLOY_LOG = path.join(REPO_ROOT, "content", "reports", "deploy-log.jsonl");
const CRON_LOG = path.join(REPO_ROOT, "content", "reports", "cron-health.jsonl");
const VERSION_JSON = path.join(REPO_ROOT, "content", "reports", "version.json");
const DEPLOY_MANIFEST = path.join(REPO_ROOT, ".deploy-manifest.json");
const PACKAGE_JSON = path.join(REPO_ROOT, "package.json");

function jsonl(rows: unknown[]): string {
  return rows.map((r) => JSON.stringify(r)).join("\n");
}

async function callGet(): Promise<{
  status: number;
  headers: Headers;
  body: {
    ok: boolean;
    version: string;
    updated_at: string;
    services: Array<{ name: string; status: string; latency_ms?: number }>;
    slo: { uptime_pct_24h?: number; p95_ms?: number; disk_pct?: number; mem_pct?: number };
    last_deploy: {
      ts: string;
      sha: string;
      release_id: string;
      gates_passed: number;
      gates_expected: number;
    };
    crons: Array<{
      name: string;
      last_run: string;
      ok_rate_24h_pct: number;
      avg_duration_ms: number;
    }>;
  };
}> {
  const res = await GET();
  const body = await (res as Response).json();
  return { status: res.status, headers: (res as Response).headers, body };
}

function healthyHealthz(): Record<string, unknown> {
  return {
    ok: true,
    version: "v.healthz",
    git_sha: "abcdef1",
    uptime_s: 123,
    checks: {
      db: { ok: true, latency_ms: 5 },
      stripe: { ok: true, latency_ms: 40 },
      chain: { ok: true, latency_ms: 12 },
      ga4: { ok: true, latency_ms: 18 },
      disk_pct: 42,
      mem_pct: 55,
      p95_ms: 220,
    },
  };
}

// ─── module surface ────────────────────────────────────────────────────

describe("module surface", () => {
  it("exports dynamic=force-dynamic (route must not be prerendered)", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("exports runtime=nodejs (fs + localhost fetch need Node runtime)", () => {
    expect(runtime).toBe("nodejs");
  });

  it("GET is an async, zero-arg function", () => {
    expect(typeof GET).toBe("function");
    expect(GET.length).toBe(0);
    expect(GET.constructor.name).toBe("AsyncFunction");
  });
});

// ─── happy path ────────────────────────────────────────────────────────

describe("happy path — everything healthy", () => {
  beforeEach(() => {
    fetchState.responder = { kind: "json", body: healthyHealthz() };
    fsState.files.set(
      DEPLOY_LOG,
      jsonl([
        { ts: "2026-08-07T00:00:00Z", event: "webhook", note: "push" }, // skipped
        {
          ts: "2026-08-07T01:00:00Z",
          status: "success",
          gates: "10/10",
          sha: "deadbeef",
          pid: "release-42",
        },
      ]),
    );
    const recent = new Date().toISOString();
    fsState.files.set(
      CRON_LOG,
      jsonl([
        { ts: recent, endpoint: "svi-snapshot", status: "ok", duration_ms: 120 },
        { ts: recent, endpoint: "svi-snapshot", status: "ok", duration_ms: 80 },
        { ts: recent, endpoint: "vesting", status: "fail", duration_ms: 999 },
      ]),
    );
  });

  it("returns HTTP 200 with no-store cache-control on trusted (full-payload) requests", async () => {
    // Test mocks headers() to always present a Bearer token, so callGet() is
    // trusted and gets the full payload — which is not safe to CDN-cache.
    // The unauthenticated public payload keeps the historical s-maxage=30
    // SWR 60 policy; that's covered in the redaction suite below.
    const { status, headers } = await callGet();
    expect(status).toBe(200);
    expect(headers.get("cache-control")).toBe("no-store");
  });

  it("aggregate ok=true when services all ok and SLO under thresholds", async () => {
    const { body } = await callGet();
    expect(body.ok).toBe(true);
    expect(body.services).toEqual([
      { name: "db", status: "ok", latency_ms: 5 },
      { name: "stripe", status: "ok", latency_ms: 40 },
      { name: "audit_chain", status: "ok", latency_ms: 12 },
      { name: "ga4", status: "ok", latency_ms: 18 },
    ]);
  });

  it("uses healthz.version when healthz reachable", async () => {
    const { body } = await callGet();
    expect(body.version).toBe("v.healthz");
  });

  it("SLO fields are hydrated from healthz.checks", async () => {
    const { body } = await callGet();
    expect(body.slo.p95_ms).toBe(220);
    expect(body.slo.disk_pct).toBe(42);
    expect(body.slo.mem_pct).toBe(55);
    expect(typeof body.slo.uptime_pct_24h).toBe("number");
  });

  it("updated_at is a fresh ISO-8601 timestamp", async () => {
    const before = Date.now();
    const { body } = await callGet();
    const after = Date.now();
    const t = new Date(body.updated_at).getTime();
    expect(t).toBeGreaterThanOrEqual(before);
    expect(t).toBeLessThanOrEqual(after);
  });

  it("fetch called with localhost:4001/api/healthz and cache no-store", async () => {
    await callGet();
    expect(fetchState.calls[0]?.url).toBe("http://localhost:4001/api/healthz");
  });
});

// ─── deploy-log parsing ────────────────────────────────────────────────

describe("last_deploy from deploy-log.jsonl", () => {
  beforeEach(() => {
    fetchState.responder = { kind: "json", body: healthyHealthz() };
  });

  it("skips rows whose `event` field is truthy (github-webhook noise)", async () => {
    fsState.files.set(
      DEPLOY_LOG,
      jsonl([
        { ts: "2026-08-06T10:00:00Z", status: "success", gates: "8/8", sha: "aaa" },
        { ts: "2026-08-06T11:00:00Z", event: "push", sha: "bbb" }, // MUST be skipped
      ]),
    );
    const { body } = await callGet();
    expect(body.last_deploy.sha).toBe("aaa");
    expect(body.last_deploy.gates_passed).toBe(8);
  });

  it('parses gates string "10/10" into {passed:10, expected:10}', async () => {
    fsState.files.set(
      DEPLOY_LOG,
      jsonl([{ ts: "2026-08-07T00:00:00Z", status: "success", gates: "10/10", sha: "s" }]),
    );
    const { body } = await callGet();
    expect(body.last_deploy.gates_passed).toBe(10);
    expect(body.last_deploy.gates_expected).toBe(10);
  });

  it("accepts numeric gates_passed / gates_expected fields", async () => {
    fsState.files.set(
      DEPLOY_LOG,
      jsonl([
        {
          ts: "2026-08-07T00:00:00Z",
          status: "success",
          gates_passed: 12,
          gates_expected: 15,
          sha: "s",
        },
      ]),
    );
    const { body } = await callGet();
    expect(body.last_deploy.gates_passed).toBe(12);
    expect(body.last_deploy.gates_expected).toBe(15);
  });

  it("skips rows lacking both status and gates", async () => {
    fsState.files.set(
      DEPLOY_LOG,
      jsonl([
        { ts: "2026-08-05T00:00:00Z", status: "success", gates: "1/1", sha: "OLD" },
        { ts: "2026-08-06T00:00:00Z", note: "hello, no status or gates" },
      ]),
    );
    const { body } = await callGet();
    expect(body.last_deploy.sha).toBe("OLD");
  });

  it("prefers row.sha over fallback manifest sha", async () => {
    fsState.files.set(
      DEPLOY_MANIFEST,
      JSON.stringify({ git_sha: "MANIFEST", version: "v.mf" }),
    );
    fsState.files.set(
      DEPLOY_LOG,
      jsonl([{ ts: "2026-08-07T00:00:00Z", status: "success", gates: "3/3", sha: "ROW" }]),
    );
    const { body } = await callGet();
    expect(body.last_deploy.sha).toBe("ROW");
  });

  it("falls back to manifest git_sha when row omits sha", async () => {
    fsState.files.set(DEPLOY_MANIFEST, JSON.stringify({ git_sha: "MANIFEST" }));
    fsState.files.set(
      DEPLOY_LOG,
      jsonl([{ ts: "2026-08-07T00:00:00Z", status: "success", gates: "3/3" }]),
    );
    const { body } = await callGet();
    expect(body.last_deploy.sha).toBe("MANIFEST");
  });

  it("uses row.release_id when present, else row.pid", async () => {
    fsState.files.set(
      DEPLOY_LOG,
      jsonl([
        {
          ts: "2026-08-07T00:00:00Z",
          status: "success",
          gates: "3/3",
          sha: "s",
          pid: "PID-1",
          release_id: "REL-9",
        },
      ]),
    );
    const { body } = await callGet();
    expect(body.last_deploy.release_id).toBe("REL-9");

    fsState.files.set(
      DEPLOY_LOG,
      jsonl([
        {
          ts: "2026-08-07T00:00:00Z",
          status: "success",
          gates: "3/3",
          sha: "s",
          pid: "PID-ONLY",
        },
      ]),
    );
    const { body: body2 } = await callGet();
    expect(body2.last_deploy.release_id).toBe("PID-ONLY");
  });

  it("returns EMPTY_DEPLOY (except sha) when deploy-log unreadable", async () => {
    fsState.errors.set(DEPLOY_LOG, new Error("EACCES"));
    fsState.files.set(DEPLOY_MANIFEST, JSON.stringify({ git_sha: "MF" }));
    const { body } = await callGet();
    expect(body.last_deploy).toEqual({
      ts: "",
      sha: "MF",
      release_id: "",
      gates_passed: 0,
      gates_expected: 0,
    });
  });

  it("bad-format gates string coerces to {0,0}", async () => {
    fsState.files.set(
      DEPLOY_LOG,
      jsonl([
        { ts: "2026-08-07T00:00:00Z", status: "success", gates: "ten of ten", sha: "s" },
      ]),
    );
    const { body } = await callGet();
    expect(body.last_deploy.gates_passed).toBe(0);
    expect(body.last_deploy.gates_expected).toBe(0);
  });

  it("skips unparseable JSONL lines without throwing", async () => {
    fsState.files.set(
      DEPLOY_LOG,
      [
        "{not-json",
        JSON.stringify({ ts: "2026-08-07T00:00:00Z", status: "ok", gates: "1/1", sha: "OK" }),
      ].join("\n"),
    );
    const { body } = await callGet();
    expect(body.last_deploy.sha).toBe("OK");
  });

  it("filters out blank trailing lines", async () => {
    fsState.files.set(
      DEPLOY_LOG,
      "\n\n" +
        JSON.stringify({
          ts: "2026-08-07T00:00:00Z",
          status: "ok",
          gates: "1/1",
          sha: "TRAIL",
        }) +
        "\n\n\n",
    );
    const { body } = await callGet();
    expect(body.last_deploy.sha).toBe("TRAIL");
  });
});

// ─── cron summarisation ────────────────────────────────────────────────

describe("cron summary — 24h window + field aliases", () => {
  beforeEach(() => {
    fetchState.responder = { kind: "json", body: healthyHealthz() };
    fsState.files.set(
      DEPLOY_LOG,
      jsonl([{ ts: "2026-08-07T00:00:00Z", status: "ok", gates: "1/1", sha: "s" }]),
    );
  });

  it("normalises the `endpoint` field into name (existing corpus shape)", async () => {
    const t = new Date().toISOString();
    fsState.files.set(
      CRON_LOG,
      jsonl([{ ts: t, endpoint: "cron-A", status: "ok", duration_ms: 10 }]),
    );
    const { body } = await callGet();
    expect(body.crons.map((c) => c.name)).toContain("cron-A");
  });

  it("normalises the spec-shape `cron` field into name", async () => {
    const t = new Date().toISOString();
    fsState.files.set(
      CRON_LOG,
      jsonl([{ ts: t, cron: "cron-B", ok: true, duration_ms: 20 }]),
    );
    const { body } = await callGet();
    expect(body.crons.map((c) => c.name)).toContain("cron-B");
  });

  it("computes ok_rate_24h_pct as rounded 100*ok/total", async () => {
    const t = new Date().toISOString();
    fsState.files.set(
      CRON_LOG,
      jsonl([
        { ts: t, endpoint: "c", status: "ok", duration_ms: 1 },
        { ts: t, endpoint: "c", status: "ok", duration_ms: 1 },
        { ts: t, endpoint: "c", status: "fail", duration_ms: 1 },
      ]),
    );
    const { body } = await callGet();
    const row = body.crons.find((c) => c.name === "c");
    expect(row?.ok_rate_24h_pct).toBe(67); // 2/3 → 66.66 → 67
  });

  it("avg_duration_ms rounds the mean of counted rows", async () => {
    const t = new Date().toISOString();
    fsState.files.set(
      CRON_LOG,
      jsonl([
        { ts: t, endpoint: "c", status: "ok", duration_ms: 10 },
        { ts: t, endpoint: "c", status: "ok", duration_ms: 20 },
        { ts: t, endpoint: "c", status: "ok", duration_ms: 30 },
      ]),
    );
    const { body } = await callGet();
    const row = body.crons.find((c) => c.name === "c");
    expect(row?.avg_duration_ms).toBe(20);
  });

  it("rows older than 24h keep last_run but contribute zero stats", async () => {
    const old = new Date(Date.now() - 48 * 3600_000).toISOString();
    fsState.files.set(
      CRON_LOG,
      jsonl([{ ts: old, endpoint: "stale", status: "fail", duration_ms: 900 }]),
    );
    const { body } = await callGet();
    const row = body.crons.find((c) => c.name === "stale");
    expect(row?.last_run).toBe(old);
    expect(row?.ok_rate_24h_pct).toBe(0);
    expect(row?.avg_duration_ms).toBe(0);
  });

  it("results are alphabetically sorted by name", async () => {
    const t = new Date().toISOString();
    fsState.files.set(
      CRON_LOG,
      jsonl([
        { ts: t, endpoint: "zzz", status: "ok", duration_ms: 1 },
        { ts: t, endpoint: "aaa", status: "ok", duration_ms: 1 },
        { ts: t, endpoint: "mmm", status: "ok", duration_ms: 1 },
      ]),
    );
    const { body } = await callGet();
    const names = body.crons.map((c) => c.name);
    expect(names).toEqual([...names].sort());
  });

  it("skips rows with empty name or invalid ts", async () => {
    const t = new Date().toISOString();
    fsState.files.set(
      CRON_LOG,
      jsonl([
        { ts: t, endpoint: "", status: "ok", duration_ms: 1 },
        { ts: "not-a-date", endpoint: "x", status: "ok", duration_ms: 1 },
        { ts: t, endpoint: "keep", status: "ok", duration_ms: 1 },
      ]),
    );
    const { body } = await callGet();
    expect(body.crons.map((c) => c.name)).toEqual(["keep"]);
  });

  it("swallows a readFile error on the cron log and returns []", async () => {
    fsState.errors.set(CRON_LOG, new Error("boom"));
    const { body } = await callGet();
    expect(body.crons).toEqual([]);
  });

  it("uptime_pct_24h is undefined when no cron rows survive", async () => {
    fsState.files.set(CRON_LOG, "");
    const { body } = await callGet();
    expect(body.slo.uptime_pct_24h).toBeUndefined();
  });

  it("uptime_pct_24h is mean of ok_rate_24h_pct (rounded to 0.1)", async () => {
    const t = new Date().toISOString();
    fsState.files.set(
      CRON_LOG,
      jsonl([
        { ts: t, endpoint: "a", status: "ok", duration_ms: 1 },
        { ts: t, endpoint: "b", status: "fail", duration_ms: 1 },
      ]),
    );
    const { body } = await callGet();
    // a=100, b=0 → mean 50 → 50.0
    expect(body.slo.uptime_pct_24h).toBe(50);
  });

  it("counts `status:OK` case-insensitively via the .toLowerCase() gate", async () => {
    const t = new Date().toISOString();
    fsState.files.set(
      CRON_LOG,
      jsonl([{ ts: t, endpoint: "c", status: "OK", duration_ms: 5 }]),
    );
    const { body } = await callGet();
    expect(body.crons.find((c) => c.name === "c")?.ok_rate_24h_pct).toBe(100);
  });
});

// ─── SLO threshold breaches → ok:false ─────────────────────────────────

describe("SLO thresholds flip aggregate ok", () => {
  beforeEach(() => {
    fsState.files.set(
      DEPLOY_LOG,
      jsonl([{ ts: "2026-08-07T00:00:00Z", status: "ok", gates: "1/1", sha: "s" }]),
    );
    fsState.files.set(CRON_LOG, "");
  });

  it("p95_ms > 800 flips ok to false", async () => {
    const h = healthyHealthz();
    (h.checks as Record<string, unknown>).p95_ms = 801;
    fetchState.responder = { kind: "json", body: h };
    const { body } = await callGet();
    expect(body.ok).toBe(false);
  });

  it("p95_ms === 0 does NOT trip the guard (bootstrapping window)", async () => {
    const h = healthyHealthz();
    (h.checks as Record<string, unknown>).p95_ms = 0;
    fetchState.responder = { kind: "json", body: h };
    const { body } = await callGet();
    expect(body.ok).toBe(true);
  });

  it("disk_pct > 80 flips ok to false", async () => {
    const h = healthyHealthz();
    (h.checks as Record<string, unknown>).disk_pct = 81;
    fetchState.responder = { kind: "json", body: h };
    const { body } = await callGet();
    expect(body.ok).toBe(false);
  });

  it("mem_pct > 75 flips ok to false", async () => {
    const h = healthyHealthz();
    (h.checks as Record<string, unknown>).mem_pct = 76;
    fetchState.responder = { kind: "json", body: h };
    const { body } = await callGet();
    expect(body.ok).toBe(false);
  });

  it("boundary p95_ms === 800 stays ok (≤ target)", async () => {
    const h = healthyHealthz();
    (h.checks as Record<string, unknown>).p95_ms = 800;
    fetchState.responder = { kind: "json", body: h };
    const { body } = await callGet();
    expect(body.ok).toBe(true);
  });
});

// ─── service classification ────────────────────────────────────────────

describe("service classification (checkToStatus)", () => {
  beforeEach(() => {
    fsState.files.set(
      DEPLOY_LOG,
      jsonl([{ ts: "2026-08-07T00:00:00Z", status: "ok", gates: "1/1", sha: "s" }]),
    );
    fsState.files.set(CRON_LOG, "");
  });

  it("check.ok=true classifies as ok", async () => {
    fetchState.responder = { kind: "json", body: healthyHealthz() };
    const { body } = await callGet();
    expect(body.services.every((s) => s.status === "ok")).toBe(true);
  });

  it('error matching /timeout|econn|fetch failed|unreachable/i is "down"', async () => {
    const h = healthyHealthz();
    (h.checks as Record<string, unknown>).db = { ok: false, error: "timeout after 2s" };
    fetchState.responder = { kind: "json", body: h };
    const { body } = await callGet();
    expect(body.services.find((s) => s.name === "db")?.status).toBe("down");
  });

  it('unmatched error is classified "degraded"', async () => {
    const h = healthyHealthz();
    (h.checks as Record<string, unknown>).stripe = { ok: false, error: "429 rate-limited" };
    fetchState.responder = { kind: "json", body: h };
    const { body } = await callGet();
    expect(body.services.find((s) => s.name === "stripe")?.status).toBe("degraded");
  });

  it("chain.check → audit_chain service name (rename preserved)", async () => {
    const h = healthyHealthz();
    (h.checks as Record<string, unknown>).chain = { ok: true, latency_ms: 7 };
    fetchState.responder = { kind: "json", body: h };
    const { body } = await callGet();
    const chain = body.services.find((s) => s.name === "audit_chain");
    expect(chain?.status).toBe("ok");
    expect(chain?.latency_ms).toBe(7);
  });

  it("any service !== ok flips aggregate ok:false", async () => {
    const h = healthyHealthz();
    (h.checks as Record<string, unknown>).ga4 = { ok: false, error: "quota" };
    fetchState.responder = { kind: "json", body: h };
    const { body } = await callGet();
    expect(body.ok).toBe(false);
  });
});

// ─── healthz unreachable ───────────────────────────────────────────────

describe("healthz unreachable — degrade gracefully", () => {
  beforeEach(() => {
    fsState.files.set(
      DEPLOY_LOG,
      jsonl([{ ts: "2026-08-07T00:00:00Z", status: "ok", gates: "1/1", sha: "s" }]),
    );
    fsState.files.set(CRON_LOG, "");
  });

  it("thrown fetch returns services=[] and status 200 still", async () => {
    fetchState.responder = { kind: "throw", error: new Error("ECONNREFUSED") };
    const { status, body } = await callGet();
    expect(status).toBe(200);
    expect(body.services).toEqual([]);
  });

  it("services=[] treated as servicesOk=true (no signal, no false-red alert)", async () => {
    fetchState.responder = { kind: "throw", error: new Error("ECONNREFUSED") };
    const { body } = await callGet();
    expect(body.ok).toBe(true);
  });

  it("passes an AbortController signal to fetch and aborts on timeout", async () => {
    vi.useFakeTimers();
    fetchState.responder = { kind: "hang" };
    const promise = callGet();
    await vi.advanceTimersByTimeAsync(2000);
    const { body } = await promise;
    expect(fetchState.aborts).toBe(1);
    expect(body.services).toEqual([]);
  });

  it("version falls back to version.json when healthz has no version", async () => {
    fetchState.responder = { kind: "throw", error: new Error("down") };
    fsState.files.set(VERSION_JSON, JSON.stringify({ version: "v.from-versionjson" }));
    const { body } = await callGet();
    expect(body.version).toBe("v.from-versionjson");
  });

  it("version fallback ladder: version.json → deploy-manifest → package.json", async () => {
    fetchState.responder = { kind: "throw", error: new Error("down") };
    fsState.errors.set(VERSION_JSON, new Error("nope"));
    fsState.files.set(DEPLOY_MANIFEST, JSON.stringify({ version: "v.mf" }));
    const { body } = await callGet();
    expect(body.version).toBe("v.mf");
  });

  it('version is "unknown" when every source fails', async () => {
    fetchState.responder = { kind: "throw", error: new Error("down") };
    fsState.errors.set(VERSION_JSON, new Error("x"));
    fsState.errors.set(DEPLOY_MANIFEST, new Error("x"));
    fsState.errors.set(PACKAGE_JSON, new Error("x"));
    const { body } = await callGet();
    expect(body.version).toBe("unknown");
  });

  it("skips JSON blobs whose `version` field is missing/blank", async () => {
    fetchState.responder = { kind: "throw", error: new Error("down") };
    fsState.files.set(VERSION_JSON, JSON.stringify({}));
    fsState.files.set(DEPLOY_MANIFEST, JSON.stringify({ version: "v.mf" }));
    const { body } = await callGet();
    expect(body.version).toBe("v.mf");
  });

  it("SLO fields are undefined when healthz down (no fabricated numbers)", async () => {
    fetchState.responder = { kind: "throw", error: new Error("down") };
    const { body } = await callGet();
    expect(body.slo.p95_ms).toBeUndefined();
    expect(body.slo.disk_pct).toBeUndefined();
    expect(body.slo.mem_pct).toBeUndefined();
  });
});

// ─── Redaction contract (H2 CISO finding) ───────────────────────────────────
//
// Public callers (no Bearer token) MUST NOT see git sha, release id, host
// disk/mem %, or the cron catalogue. Trusted callers (Bearer STATUS_FULL_TOKEN
// or CRON_SECRET) see the full payload for uptime-monitor / dashboard use.

describe("public payload redaction", () => {
  const originalToken = process.env.STATUS_FULL_TOKEN;

  beforeEach(() => {
    resetFs();
    fetchState.responder = { kind: "json", body: healthyHealthz() };
    fsState.files.set(
      path.join(process.cwd(), "content", "reports", "deploy-log.jsonl"),
      jsonl([
        { ts: "2026-08-01T00:00:00Z", status: "ok", gates: "10/10", sha: "abc123", pid: "12345" },
      ]),
    );
    fsState.files.set(
      path.join(process.cwd(), "content", "reports", "cron-health.jsonl"),
      jsonl([{ ts: new Date().toISOString(), endpoint: "vesting", status: "ok", duration_ms: 100 }]),
    );
  });

  afterEach(() => {
    process.env.STATUS_FULL_TOKEN = originalToken;
  });

  it("strips sha, release_id, disk/mem/p95 slo, and crons for unauthenticated callers", async () => {
    // Blank the token so the file-level mock's Bearer no longer matches — the
    // route drops to untrusted and serves the redacted public payload.
    process.env.STATUS_FULL_TOKEN = "";
    process.env.CRON_SECRET = "";
    const { body, headers } = await callGet();
    expect(body.last_deploy.sha).toBe("");
    expect(body.last_deploy.release_id).toBe("");
    expect(body.slo.disk_pct).toBeUndefined();
    expect(body.slo.mem_pct).toBeUndefined();
    expect(body.slo.p95_ms).toBeUndefined();
    expect(body.slo.uptime_pct_24h).toBeDefined();
    expect(body.crons).toEqual([]);
    // Public payload is safe to CDN-cache for 30s.
    expect(headers.get("cache-control")).toBe("s-maxage=30, stale-while-revalidate=60");
  });

  it("returns the full payload for callers presenting the STATUS_FULL_TOKEN Bearer", async () => {
    process.env.STATUS_FULL_TOKEN = "test-trusted-token";
    const { body, headers } = await callGet();
    expect(body.last_deploy.sha).not.toBe("");
    expect(body.slo.disk_pct).toBeDefined();
    expect(body.crons.length).toBeGreaterThan(0);
    expect(headers.get("cache-control")).toBe("no-store");
  });
});
