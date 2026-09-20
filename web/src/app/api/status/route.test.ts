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

// ─── S23-A oauth_tokens_sealed fixture ─────────────────────────────────
// The route reads `readOAuthTokenHealth()` (Supabase COUNTs, 10-min cache);
// stub it so this suite stays DB-free. Its own behaviour is pinned in
// src/lib/security/oauth-token-health.test.ts.

const oauthState: { status: "ok" | "obf_rows_present" | "no_key" | "unknown"; throwErr: boolean } = {
  status: "ok",
  throwErr: false,
};

vi.mock("@/lib/security/oauth-token-health", () => ({
  readOAuthTokenHealth: vi.fn(async () => {
    if (oauthState.throwErr) throw new Error("db down");
    return { status: oauthState.status, unsealed: null, checked_at: new Date().toISOString() };
  }),
}));

// ─── QA-2 P0 schema_migrations fixture ─────────────────────────────────
// The route reads `readSchemaMigrationsStatus()` (manifest + Supabase
// ledger, 5-min cache); stub it so this suite stays DB-free. Its own
// behaviour is pinned in src/lib/ops/schema-migrations.test.ts.

const schemaState: { status: string; throwErr: boolean } = { status: "ok", throwErr: false };

vi.mock("@/lib/ops/schema-migrations", () => ({
  readSchemaMigrationsStatus: vi.fn(async () => {
    if (schemaState.throwErr) throw new Error("db down");
    return schemaState.status;
  }),
}));

// ─── S31-A ai_providers / ai_queue_depth fixtures ──────────────────────
// Both read in-process state (probe cache file / dispatcher counters) that
// have their own suites (src/lib/ai/provider-status.test.ts, ai-client.test.ts).

const aiState: { summary: Record<string, unknown>; throwErr: boolean; queue: Record<string, number> } = {
  summary: { updated_at: "2026-09-13T22:40:00.000Z", providers: { anthropic: { status: "invalid_key", checked_at: "2026-09-13T22:40:00.000Z" }, groq: { status: "valid", checked_at: "2026-09-13T22:40:00.000Z", headroom: { tpm_remaining: 7990 } } }, usable: 1, quality_tier_ready: false },
  throwErr: false,
  queue: { queued: 3, queued_user: 2, queued_background: 1, running: 120, max_concurrent: 120 },
};
vi.mock("@/lib/ai/provider-status", () => ({
  readAiProvidersSummary: vi.fn(async () => {
    if (aiState.throwErr) throw new Error("disk");
    return aiState.summary;
  }),
}));
vi.mock("@/lib/ai-client", () => ({
  getAIQueueDepth: vi.fn(() => aiState.queue),
}));

// S32-C ai_last_report_provider — read from content/reports/ai-last-report.json
// by src/lib/ai/last-report.ts (own suite); stubbed here.
const lastReportState: { rec: Record<string, unknown> | null; throwErr: boolean } = {
  rec: { at: "2026-09-15T08:00:00.000Z", analysis_id: "a1", provider: "deepinfra", model: "deepseek-ai/DeepSeek-V4-Flash", models: ["DeepSeek-V4-Flash via DeepInfra"], sections: { ceo: { provider: "deepinfra", model: "deepseek-ai/DeepSeek-V4-Flash", task_class: "synthesis" } }, sections_written: 7, sections_failed: 0 },
  throwErr: false,
};
vi.mock("@/lib/ai/last-report", () => ({
  readLastReportProvider: vi.fn(async () => {
    if (lastReportState.throwErr) throw new Error("disk");
    return lastReportState.rec;
  }),
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
  oauthState.status = "ok";
  oauthState.throwErr = false;
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
// G19-S46: the lib/status readers resolve the LIVE web checkout when it exists
// on the machine running the suite (getStatusRoot); pin them to the mocked
// cwd tree so the seeded fixtures — not a real content/reports — are read.
process.env.BLOCKID_WEB_DIR = REPO_ROOT;
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

  // G15-R1 — deploy-live.sh gate 11 fetches 127.0.0.1:4001/api/status and
  // compares `git_sha` with the value it stamped into .deploy-manifest.json
  // before gate 1; the key must sit right after `version`, come from the
  // manifest in cwd (NOT from healthz), and be "" when the manifest is absent.
  it("git_sha is read from .deploy-manifest.json in cwd and placed right after version", async () => {
    fsState.files.set(
      DEPLOY_MANIFEST,
      JSON.stringify({ git_sha: "9e87e1520abc", git_tree_dirty: false, merge_in_progress: false, version: "v.mf" }),
    );
    const { body } = await callGet();
    const raw = body as unknown as Record<string, unknown>;
    expect(raw.git_sha).toBe("9e87e1520abc");
    expect(raw.git_sha).not.toBe("abcdef1"); // healthz.git_sha is not the source of truth
    const keys = Object.keys(raw);
    expect(keys.indexOf("git_sha")).toBe(keys.indexOf("version") + 1);
  });

  it("git_sha prefers build_sha — a --skip-build promotion reports what the bundle was BUILT from (G15 follow-up)", async () => {
    fsState.files.set(
      DEPLOY_MANIFEST,
      JSON.stringify({ git_sha: "headheadhead", build_sha: "builtbuiltbuilt", git_tree_dirty: false, merge_in_progress: false, version: "v.mf" }),
    );
    const { body } = await callGet();
    expect((body as unknown as Record<string, unknown>).git_sha).toBe("builtbuiltbuilt");
  });

  it('git_sha is "" (never undefined) when .deploy-manifest.json is unreadable', async () => {
    fsState.errors.set(DEPLOY_MANIFEST, new Error("ENOENT"));
    const { body } = await callGet();
    expect((body as unknown as Record<string, unknown>).git_sha).toBe("");
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
    expect(body.last_deploy.sha).toBeUndefined();
    expect(body.last_deploy.release_id).toBeUndefined();
    // G15-R1: the manifest git_sha IS on the public payload (gate 11 reads it
    // over loopback without a bearer; /api/healthz already exposes it).
    expect(typeof (body as unknown as Record<string, unknown>).git_sha).toBe("string");
    expect(body.slo.disk_pct).toBeUndefined();
    expect(body.slo.mem_pct).toBeUndefined();
    expect(body.slo.p95_ms).toBeUndefined();
    expect(body.slo.uptime_pct_24h).toBeDefined();
    expect(body.crons).toBeUndefined();
    // QA-4 P2-f: internal telemetry verdicts are absent for anonymous callers.
    const raw = body as unknown as Record<string, unknown>;
    expect(raw).not.toHaveProperty("audit_chain");
    expect(raw).not.toHaveProperty("oauth_tokens_sealed");
    expect(raw).not.toHaveProperty("ga4_events");
    expect(raw).not.toHaveProperty("backups");
    expect(raw).not.toHaveProperty("ai_providers");
    expect(raw).not.toHaveProperty("ai_queue_depth");
    // G15-R2: the v2 sections ARE on the public payload, in their redacted
    // form (publicStatusExtras) — counts, states and timestamps only.
    expect(Object.keys(raw).sort()).toEqual(
      ["ai", "backups_detail", "crons_failed_24h", "errors_1h", "git_sha", "last_deploy", "ok", "queues", "services", "slo", "svi_backtest", "tbr_quality", "traction", "updated_at", "version"],
    );
    expect(typeof raw.ok).toBe("boolean");
    expect(typeof raw.version).toBe("string");
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

// ─── S20-A audit_chain (hash-chained audit_events integrity) ───────────

describe("audit_chain (S20-A) — read from content/reports/audit-chain-verify.json", () => {
  const CHAIN_STATE = path.join(REPO_ROOT, "content", "reports", "audit-chain-verify.json");

  it("unknown when the cron has never written the state file", async () => {
    const h = healthyHealthz();
    fetchState.responder = { kind: "json", body: h };
    const { body } = await callGet();
    expect((body as unknown as { audit_chain: string }).audit_chain).toBe("unknown");
  });

  it.each(["ok", "broken"])("surfaces a fresh '%s' verdict on the trusted payload", async (status) => {
    fsState.files.set(CHAIN_STATE, JSON.stringify({ ts: new Date().toISOString(), status, checked: 5, first_broken_id: status === "broken" ? 3 : null }));
    fetchState.responder = { kind: "json", body: healthyHealthz() };
    const { body } = await callGet();
    expect((body as unknown as { audit_chain: string }).audit_chain).toBe(status);
  });

  it("a verdict older than 48h degrades to unknown", async () => {
    fsState.files.set(CHAIN_STATE, JSON.stringify({ ts: new Date(Date.now() - 49 * 3600 * 1000).toISOString(), status: "ok" }));
    fetchState.responder = { kind: "json", body: healthyHealthz() };
    const { body } = await callGet();
    expect((body as unknown as { audit_chain: string }).audit_chain).toBe("unknown");
  });
});

// ─── S23-A oauth_tokens_sealed (connector tokens sealed at rest) ────────

describe("oauth_tokens_sealed (S23-A)", () => {
  type Body = { oauth_tokens_sealed: string; ok: boolean };

  it.each(["ok", "obf_rows_present", "no_key", "unknown"] as const)(
    "surfaces '%s' on the trusted payload",
    async (status) => {
      oauthState.status = status;
      fetchState.responder = { kind: "json", body: healthyHealthz() };
      const { body } = await callGet();
      expect((body as unknown as Body).oauth_tokens_sealed).toBe(status);
    },
  );

  it("is ABSENT from the public payload (QA-4 P2-f — operator posture is trusted-only)", async () => {
    const originalToken = process.env.STATUS_FULL_TOKEN;
    process.env.STATUS_FULL_TOKEN = "";
    process.env.CRON_SECRET = "";
    try {
      oauthState.status = "obf_rows_present";
      fetchState.responder = { kind: "json", body: healthyHealthz() };
      const { body } = await callGet();
      expect(body.last_deploy.sha).toBeUndefined(); // still redacted
      expect(body as unknown as Record<string, unknown>).not.toHaveProperty("oauth_tokens_sealed");
    } finally {
      process.env.STATUS_FULL_TOKEN = originalToken;
    }
  });

  it("does not flip the aggregate ok flag (it is an operator signal, not an outage)", async () => {
    oauthState.status = "no_key";
    fetchState.responder = { kind: "json", body: healthyHealthz() };
    const { body } = await callGet();
    expect((body as unknown as Body).ok).toBe(true);
  });

  it("degrades to 'unknown' when the health read throws", async () => {
    oauthState.throwErr = true;
    fetchState.responder = { kind: "json", body: healthyHealthz() };
    const { body } = await callGet();
    expect((body as unknown as Body).oauth_tokens_sealed).toBe("unknown");
  });
});

// ─── QA-2 P0 schema_migrations (ledger vs migration files) ─────────────

describe("schema_migrations (QA-2 P0)", () => {
  type Body = { schema_migrations: string; ok: boolean };

  beforeEach(() => {
    schemaState.status = "ok";
    schemaState.throwErr = false;
  });

  it.each(["ok", "pending:3", "unknown"])("surfaces '%s' on the trusted payload", async (status) => {
    schemaState.status = status;
    fetchState.responder = { kind: "json", body: healthyHealthz() };
    const { body } = await callGet();
    expect((body as unknown as Body).schema_migrations).toBe(status);
  });

  it("is ABSENT from the public payload (QA-4 P2-f: internal telemetry is trusted-only)", async () => {
    const originalToken = process.env.STATUS_FULL_TOKEN ?? "test-trusted-token";
    process.env.STATUS_FULL_TOKEN = "";
    process.env.CRON_SECRET = "";
    try {
      schemaState.status = "pending:1";
      fetchState.responder = { kind: "json", body: healthyHealthz() };
      const { body } = await callGet();
      expect((body.last_deploy as { sha?: string }).sha).toBeUndefined(); // sha never on the public payload now
      expect((body as unknown as Body).schema_migrations).toBeUndefined();
    } finally {
      process.env.STATUS_FULL_TOKEN = originalToken;
    }
  });

  it("does not flip the aggregate ok flag (operator signal, not an outage)", async () => {
    schemaState.status = "pending:2";
    fetchState.responder = { kind: "json", body: healthyHealthz() };
    const { body } = await callGet();
    expect((body as unknown as Body).ok).toBe(true);
  });

  it("degrades to 'unknown' when the read throws", async () => {
    schemaState.throwErr = true;
    fetchState.responder = { kind: "json", body: healthyHealthz() };
    const { body } = await callGet();
    expect((body as unknown as Body).schema_migrations).toBe("unknown");
  });
});

// ─── S23-B ga4_events (weekly GA4 Data API event audit) ────────────────

describe("ga4_events (S23-B) — read from content/reports/ga4-event-audit.json", () => {
  const AUDIT_FILE = path.join(REPO_ROOT, "content", "reports", "ga4-event-audit.json");
  const read = (body: unknown) => (body as { ga4_events: string }).ga4_events;

  it("unknown when the cron has never written the report", async () => {
    fetchState.responder = { kind: "json", body: healthyHealthz() };
    const { body } = await callGet();
    expect(read(body)).toBe("unknown");
  });

  it("ok / missing:<list> / blocked from a fresh report (trusted); absent on the public payload", async () => {
    fetchState.responder = { kind: "json", body: healthyHealthz() };
    const fresh = { ts: new Date().toISOString() };

    fsState.files.set(AUDIT_FILE, JSON.stringify({ ...fresh, status: "ok", missing: [] }));
    expect(read((await callGet()).body)).toBe("ok");

    fsState.files.set(AUDIT_FILE, JSON.stringify({ ...fresh, status: "missing", missing: ["funding_preview", "compare_viewed"] }));
    expect(read((await callGet()).body)).toBe("missing:funding_preview,compare_viewed");

    fsState.files.set(AUDIT_FILE, JSON.stringify({ ...fresh, status: "blocked", blocked: { reason: "api_disabled", steps: ["1", "2"], message: "" } }));
    expect(read((await callGet()).body)).toBe("blocked");

    // QA-4 P2-f: absent for anonymous callers.
    process.env.STATUS_FULL_TOKEN = "";
    process.env.CRON_SECRET = "";
    try {
      expect(read((await callGet()).body)).toBeUndefined();
    } finally {
      process.env.STATUS_FULL_TOKEN = "test-trusted-token";
    }
  });

  it("a report older than 8 days or unparsable degrades to unknown", async () => {
    fetchState.responder = { kind: "json", body: healthyHealthz() };
    fsState.files.set(AUDIT_FILE, JSON.stringify({ ts: new Date(Date.now() - 9 * 86_400_000).toISOString(), status: "ok" }));
    expect(read((await callGet()).body)).toBe("unknown");
    fsState.files.set(AUDIT_FILE, "{nope");
    expect(read((await callGet()).body)).toBe("unknown");
  });
});

// ─── QA-3 P0-4 backups (daily pg_dump + weekly restore drill) ──────────

describe("backups (QA-3 P0-4) — read from content/reports/backup-health.jsonl", () => {
  const HEALTH_FILE = path.join(REPO_ROOT, "content", "reports", "backup-health.jsonl");
  const read = (body: unknown) => (body as { backups: string }).backups;
  const row = (job: string, status: string, ageMs: number) =>
    JSON.stringify({ ts: new Date(Date.now() - ageMs).toISOString(), job, status });

  it("missing when the log does not exist or has no successful backup", async () => {
    fetchState.responder = { kind: "json", body: healthyHealthz() };
    expect(read((await callGet()).body)).toBe("missing");
    fsState.files.set(HEALTH_FILE, [row("db-backup", "fail", 3_600_000), "garbage"].join("\n"));
    expect(read((await callGet()).body)).toBe("missing");
  });

  it("ok when backup < 26h and restore_test < 8d — absent from the public payload (QA-4 P2-f)", async () => {
    fetchState.responder = { kind: "json", body: healthyHealthz() };
    fsState.files.set(HEALTH_FILE, [row("db-backup", "ok", 20 * 3_600_000), row("restore_test", "ok", 6 * 86_400_000)].join("\n"));
    process.env.STATUS_FULL_TOKEN = "test-trusted-token";
    expect(read((await callGet()).body)).toBe("ok");
    process.env.STATUS_FULL_TOKEN = "";
    try {
      expect((( await callGet()).body as unknown as { backups?: string }).backups).toBeUndefined();
    } finally {
      process.env.STATUS_FULL_TOKEN = "test-trusted-token";
    }
  });

  it("stale when the backup is > 26h old or the restore drill is > 8d old / never ran", async () => {
    fetchState.responder = { kind: "json", body: healthyHealthz() };
    fsState.files.set(HEALTH_FILE, [row("db-backup", "ok", 27 * 3_600_000), row("restore_test", "ok", 86_400_000)].join("\n"));
    expect(read((await callGet()).body)).toBe("stale");
    fsState.files.set(HEALTH_FILE, [row("db-backup", "ok", 3_600_000), row("restore_test", "ok", 9 * 86_400_000)].join("\n"));
    expect(read((await callGet()).body)).toBe("stale");
    fsState.files.set(HEALTH_FILE, row("db-backup", "ok", 3_600_000));
    expect(read((await callGet()).body)).toBe("stale");
  });
});

// ─── S31-A ai_providers + ai_queue_depth (trusted-only) ────────────────

describe("ai_providers + ai_queue_depth (S31-A)", () => {
  type Body = {
    ai_providers?: { providers: Record<string, { status: string }>; usable: number; quality_tier_ready: boolean };
    ai_queue_depth?: { queued: number; running: number; max_concurrent: number };
  };

  it("surfaces the probe summary and the live queue depth on the trusted payload", async () => {
    aiState.throwErr = false;
    const { body } = await callGet();
    const b = body as unknown as Body;
    expect(b.ai_providers?.providers.anthropic.status).toBe("invalid_key");
    expect(b.ai_providers?.providers.groq.status).toBe("valid");
    expect(b.ai_providers?.usable).toBe(1);
    expect(b.ai_providers?.quality_tier_ready).toBe(false);
    expect(b.ai_queue_depth).toEqual({ queued: 3, queued_user: 2, queued_background: 1, running: 120, max_concurrent: 120 });
  });

  it("degrades to an empty summary when the probe file cannot be read (never 5xx)", async () => {
    aiState.throwErr = true;
    const { status, body } = await callGet();
    aiState.throwErr = false;
    expect(status).toBe(200);
    const b = body as unknown as Body;
    expect(b.ai_providers).toEqual({ updated_at: "", providers: {}, usable: 0, quality_tier_ready: false });
  });

  it("is ABSENT from the public payload (operator posture is trusted-only)", async () => {
    const savedToken = process.env.STATUS_FULL_TOKEN;
    const savedSecret = process.env.CRON_SECRET;
    process.env.STATUS_FULL_TOKEN = "";
    process.env.CRON_SECRET = "";
    try {
      fetchState.responder = { kind: "json", body: healthyHealthz() };
      const { body } = await callGet();
      const b = body as unknown as Body;
      expect(b.ai_providers).toBeUndefined();
      expect(b.ai_queue_depth).toBeUndefined();
      expect(body).not.toHaveProperty("ai_last_report_provider");
    } finally {
      process.env.STATUS_FULL_TOKEN = savedToken;
      if (savedSecret === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = savedSecret;
    }
  });
});

// ─── S32-C ai_last_report_provider (trusted-only) ──────────────────────

describe("ai_last_report_provider (S32-C)", () => {
  type Body = { ai_last_report_provider?: { provider: string; model: string; sections: Record<string, { task_class: string }> } | null };

  it("surfaces which provider + model wrote the last finished report", async () => {
    lastReportState.throwErr = false;
    const { body } = await callGet();
    const b = body as unknown as Body;
    expect(b.ai_last_report_provider?.provider).toBe("deepinfra");
    expect(b.ai_last_report_provider?.model).toBe("deepseek-ai/DeepSeek-V4-Flash");
    expect(b.ai_last_report_provider?.sections.ceo.task_class).toBe("synthesis");
  });

  it("is null when no report has finished, and null (never 5xx) when the file cannot be read", async () => {
    const saved = lastReportState.rec;
    lastReportState.rec = null;
    expect((await callGet()).body).toHaveProperty("ai_last_report_provider", null);
    lastReportState.rec = saved;
    lastReportState.throwErr = true;
    const { status, body } = await callGet();
    lastReportState.throwErr = false;
    expect(status).toBe(200);
    expect(body).toHaveProperty("ai_last_report_provider", null);
  });
});

// ─── G14-S33 traction (daily traction snapshot freshness) ──────────────

describe("traction (G14-S33) — read from content/reports/traction-snapshot.json", () => {
  const SNAPSHOT_FILE = path.join(REPO_ROOT, "content", "reports", "traction-snapshot.json");
  const read = (body: unknown) => (body as { traction?: string }).traction;

  it("missing when the cron has never written the snapshot (or it is unparsable)", async () => {
    fetchState.responder = { kind: "json", body: healthyHealthz() };
    expect(read((await callGet()).body)).toBe("missing");
    fsState.files.set(SNAPSHOT_FILE, "{nope");
    expect(read((await callGet()).body)).toBe("missing");
  });

  it("ok under 26 h, stale after", async () => {
    fetchState.responder = { kind: "json", body: healthyHealthz() };
    fsState.files.set(SNAPSHOT_FILE, JSON.stringify({ generated_at: new Date(Date.now() - 3600e3).toISOString(), users: { total: 12 } }));
    expect(read((await callGet()).body)).toBe("ok");
    fsState.files.set(SNAPSHOT_FILE, JSON.stringify({ generated_at: new Date(Date.now() - 30 * 3600e3).toISOString() }));
    expect(read((await callGet()).body)).toBe("stale");
  });

  it("is PRESENT on the public payload as a bare word (the live-QA lane asserts it without a bearer) and carries no figure", async () => {
    fetchState.responder = { kind: "json", body: healthyHealthz() };
    fsState.files.set(SNAPSHOT_FILE, JSON.stringify({ generated_at: new Date().toISOString(), users: { total: 12 }, mrr_aud_cents: { from_subscriptions: 7900 } }));
    process.env.STATUS_FULL_TOKEN = "";
    process.env.CRON_SECRET = "";
    try {
      const { body } = await callGet();
      expect(["ok", "stale", "missing"]).toContain(read(body));
      expect(JSON.stringify(body)).not.toContain("7900");
      expect(JSON.stringify(body)).not.toContain("traction-snapshot");
    } finally {
      process.env.STATUS_FULL_TOKEN = "test-trusted-token";
    }
  });
});

// ─── G14-S39 svi_backtest (weekly backtest JSON freshness) ─────────────

describe("svi_backtest (G14-S39) — read from content/reports/svi-backtest-latest.json", () => {
  const BACKTEST_FILE = path.join(REPO_ROOT, "content", "reports", "svi-backtest-latest.json");
  const read = (body: unknown) => (body as { svi_backtest?: string }).svi_backtest;

  it("missing when the backtest has never been published (or the file is unparsable)", async () => {
    fetchState.responder = { kind: "json", body: healthyHealthz() };
    expect(read((await callGet()).body)).toBe("missing");
    fsState.files.set(BACKTEST_FILE, "{nope");
    expect(read((await callGet()).body)).toBe("missing");
  });

  it("ok under 8 days, stale after", async () => {
    fetchState.responder = { kind: "json", body: healthyHealthz() };
    fsState.files.set(BACKTEST_FILE, JSON.stringify({ generated_at: new Date(Date.now() - 2 * 24 * 3600e3).toISOString(), n: 49, rho: { round_pooled: 0.76 } }));
    expect(read((await callGet()).body)).toBe("ok");
    fsState.files.set(BACKTEST_FILE, JSON.stringify({ generated_at: new Date(Date.now() - 9 * 24 * 3600e3).toISOString() }));
    expect(read((await callGet()).body)).toBe("stale");
  });

  it("is a bare word on both payloads and carries no figure or path", async () => {
    fetchState.responder = { kind: "json", body: healthyHealthz() };
    fsState.files.set(BACKTEST_FILE, JSON.stringify({ generated_at: new Date().toISOString(), n: 49, rho: { round_pooled: 0.7619 } }));
    process.env.STATUS_FULL_TOKEN = "";
    process.env.CRON_SECRET = "";
    try {
      const { body } = await callGet();
      expect(["ok", "stale", "missing"]).toContain(read(body));
      expect(JSON.stringify(body)).not.toContain("0.7619");
      expect(JSON.stringify(body)).not.toContain("svi-backtest");
    } finally {
      process.env.STATUS_FULL_TOKEN = "test-trusted-token";
    }
    const { body: full } = await callGet();
    expect(["ok", "stale", "missing"]).toContain(read(full));
  });
});

// ─── G19-S46 tbr_quality (per-run report-quality telemetry) ────────────

describe("tbr_quality (G19-S46) — read from content/reports/tbr-quality.jsonl", () => {
  const QUALITY_FILE = path.join(REPO_ROOT, "content", "reports", "tbr-quality.jsonl");
  const read = (body: unknown) => (body as { tbr_quality?: { status: string; last24h: Record<string, unknown> } }).tbr_quality;
  const line = (hoursAgo: number, over: Record<string, unknown> = {}) =>
    JSON.stringify({ ts: new Date(Date.now() - hoursAgo * 3600e3).toISOString(), projectId: "deadbeef0000", snapshotId: "snap-1", tier: "standard", calls: 20, costUsd: 0.01, groundedShare: 0.9, degradedSections: 0, consistencyIssues: 0, pendingDims: 1, words: 1200, pages: 9, durationMs: 60000, sviVersion: "2.2.0", pipelineVersion: "p", ...over });

  it("missing when no run has been logged (or the file is unparsable)", async () => {
    fetchState.responder = { kind: "json", body: healthyHealthz() };
    expect(read((await callGet()).body)).toEqual({ last24h: { runs: 0, groundedShareMedian: null, costUsdMedian: null, degradedShare: null }, status: "missing" });
    fsState.files.set(QUALITY_FILE, "{nope\n");
    expect(read((await callGet()).body)?.status).toBe("missing");
  });

  it("ok with medians over the last 24 h; watch when the grounded median < 0.85 or > 20 % of runs degraded", async () => {
    fetchState.responder = { kind: "json", body: healthyHealthz() };
    fsState.files.set(QUALITY_FILE, [line(1, { groundedShare: 0.9, costUsd: 0.02 }), line(2, { groundedShare: 0.95, costUsd: 0.01 }), line(30, { groundedShare: 0.1, degradedSections: 8 })].join("\n") + "\n");
    expect(read((await callGet()).body)).toEqual({ last24h: { runs: 2, groundedShareMedian: 0.93, costUsdMedian: 0.015, degradedShare: 0 }, status: "ok" });
    fsState.files.set(QUALITY_FILE, [line(1, { groundedShare: 0.6 }), line(2, { groundedShare: 0.7 })].join("\n") + "\n");
    expect(read((await callGet()).body)?.status).toBe("watch");
    fsState.files.set(QUALITY_FILE, [line(1, { degradedSections: 3 }), line(2), line(3)].join("\n") + "\n");
    expect(read((await callGet()).body)).toMatchObject({ last24h: { degradedShare: 0.33 }, status: "watch" });
  });

  it("is on both payloads as aggregates only — no snapshot id, project hash or path", async () => {
    fetchState.responder = { kind: "json", body: healthyHealthz() };
    fsState.files.set(QUALITY_FILE, line(1) + "\n");
    process.env.STATUS_FULL_TOKEN = "";
    process.env.CRON_SECRET = "";
    try {
      const { body } = await callGet();
      expect(read(body)?.status).toBe("ok");
      const raw = JSON.stringify(body);
      expect(raw).not.toContain("snap-1");
      expect(raw).not.toContain("deadbeef0000");
      expect(raw).not.toContain("tbr-quality");
    } finally {
      process.env.STATUS_FULL_TOKEN = "test-trusted-token";
    }
    const { body: full } = await callGet();
    expect(read(full)?.last24h.runs).toBe(1);
  });
});

// ─── G15-R2 v2 sections (lib/status) ───────────────────────────────────
// The readers have their own suites (src/lib/status/*.test.ts); here we pin
// the wiring: keys present on both payloads, nulls when the report files are
// missing (this suite's fs mock throws ENOENT for everything not seeded),
// redaction on the anonymous payload, the 60 s cache, and "never throws".

describe("G15-R2 — errors_1h / ai / queues / backups_detail / slo.latency_p95_ms / crons_failed_24h", () => {
  const rel = (f: string) => path.join(REPO_ROOT, "content", "reports", f);
  const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();

  beforeEach(async () => {
    const { _resetStatusExtrasCache } = await import("@/lib/status");
    _resetStatusExtrasCache();
  });

  it("every report file missing → null shapes, still HTTP 200, existing keys untouched", async () => {
    fetchState.responder = { kind: "json", body: healthyHealthz() };
    const { status, body } = await callGet();
    const raw = body as unknown as Record<string, unknown>;
    expect(status).toBe(200);
    expect(raw.errors_1h).toBeNull();
    expect(raw.queues).toEqual({ email_queued: null, email_failed_24h: null, webhook_failed_24h: null, report_orders_pending: null });
    expect(raw.backups_detail).toMatchObject({ local_last_ok_at: null, offsite_status: "never" });
    expect(raw.crons_failed_24h).toEqual([]);
    expect((raw.slo as Record<string, unknown>).latency_p95_ms).toBeNull();
    expect(raw.backups).toBe("missing"); // the pre-existing one-word verdict
    expect(Array.isArray(raw.crons)).toBe(true); // the pre-existing catalogue
  });

  it("populates from error-digest / latency / cron-health / backup-health / model-health files", async () => {
    fetchState.responder = { kind: "json", body: healthyHealthz() };
    fsState.files.set(rel("error-digest.jsonl"), JSON.stringify({ ts: iso(5 * 60e3), window_min: 10, total: 6, classes: [{ tag: "ai-client", msg: "Gateway unavailable (ECONNREFUSED) http://ai-gateway:8080 for <n> min", count: 6, first_seen: iso(5 * 60e3) }] }) + "\n");
    fsState.files.set(rel("latency.jsonl"), JSON.stringify({ ts: iso(3 * 60e3), window_min: 10, timing: true, classes: { marketing: { n: 50, p50_ms: 120, p95_ms: 410, err_rate_5xx: 0 }, api_ai: { n: 2, p50_ms: 30000, p95_ms: 30000, err_rate_5xx: 0 } } }) + "\n");
    fsState.files.set(rel("cron-health.jsonl"), [
      JSON.stringify({ ts: iso(60e3), endpoint: "db-backup-offsite", status: "fail", duration_ms: 1, detail: "Service account has no Drive quota — see /home/dovanlong/x" }),
      JSON.stringify({ ts: iso(30e3), endpoint: "agent-guardian", status: "ok", duration_ms: 1, detail: "{}" }),
    ].join("\n"));
    fsState.files.set(rel("backup-health.jsonl"), [
      JSON.stringify({ ts: iso(3 * 3600e3), job: "db-backup", status: "ok", file: "/data/backups/db.dump.gz" }),
      JSON.stringify({ ts: iso(2 * 3600e3), job: "offsite", status: "fail", offsite_status: "founder_action_required", error: "no Drive quota" }),
    ].join("\n"));
    fsState.files.set(path.join(REPO_ROOT, "content", "ai-model-health.json"), JSON.stringify({ updated_at: iso(0), total: 28, healthy: 13, quota_exceeded: 0, results: [] }));

    const { body } = await callGet();
    const raw = body as unknown as Record<string, unknown>;
    expect(raw.errors_1h).toMatchObject({ total: 6, classes: [{ tag: "ai-client", count: 6 }] });
    expect((raw.slo as Record<string, unknown>).latency_p95_ms).toEqual({ marketing: 410, workspace: null, api_ai: null, api_other: null, tbr: null });
    expect(raw.crons_failed_24h).toEqual([{ endpoint: "db-backup-offsite", count: 1, last_ts: expect.any(String), last_error: "Service account has no Drive quota — see <path>" }]);
    expect(raw.backups_detail).toMatchObject({ local_age_h: 3, offsite_status: "founder_action_required" });
    // ai: the dispatcher mock in this suite has no getProviderHealthSnapshot → providers null, file-backed fields present
    expect(raw.ai).toEqual({ providers: null, budget_exhausted_1h: null, interactive_order: null, model_health: { updated_at: expect.any(String), total: 28, healthy: 13, quota_exceeded: 0 }, fully_degraded_24h: 0 });
    expect(JSON.stringify(raw.backups_detail)).not.toContain("/data");
  });

  it("anonymous payload carries the redacted subset only", async () => {
    fetchState.responder = { kind: "json", body: healthyHealthz() };
    fsState.files.set(rel("error-digest.jsonl"), JSON.stringify({ ts: iso(5 * 60e3), window_min: 10, total: 2, classes: [{ tag: "svi", msg: "ECONNREFUSED http://ai-gateway:8080 open /home/dovanlong/web/.env", count: 2 }] }) + "\n");
    fsState.files.set(rel("cron-health.jsonl"), JSON.stringify({ ts: iso(60e3), endpoint: "db-backup-offsite", status: "fail", detail: "secret detail /home/x" }) + "\n");
    process.env.STATUS_FULL_TOKEN = "";
    process.env.CRON_SECRET = "";
    try {
      const { body } = await callGet();
      const raw = body as unknown as Record<string, unknown>;
      expect(raw.errors_1h).toEqual({ total: 2, classes: [{ tag: "svi", msg: "ECONNREFUSED <url> open <path>", count: 2 }] });
      expect(raw.crons_failed_24h).toEqual([{ endpoint: "db-backup-offsite", count: 1 }]);
      expect(JSON.stringify(raw)).not.toMatch(/ai-gateway|\/home\/|secret detail/);
    } finally {
      process.env.STATUS_FULL_TOKEN = "test-trusted-token";
    }
  });

  it("caches the extras 60 s per process", async () => {
    fetchState.responder = { kind: "json", body: healthyHealthz() };
    fsState.files.set(rel("error-digest.jsonl"), JSON.stringify({ ts: iso(60e3), window_min: 10, total: 1, classes: [] }) + "\n");
    expect(((await callGet()).body as unknown as { errors_1h: { total: number } }).errors_1h.total).toBe(1);
    fsState.files.set(rel("error-digest.jsonl"), JSON.stringify({ ts: iso(30e3), window_min: 10, total: 9, classes: [] }) + "\n");
    expect(((await callGet()).body as unknown as { errors_1h: { total: number } }).errors_1h.total).toBe(1); // cached
  });

  it("a throwing extras reader never breaks the route", async () => {
    fetchState.responder = { kind: "json", body: healthyHealthz() };
    const mod = await import("@/lib/status");
    const spy = vi.spyOn(mod, "readStatusExtras").mockRejectedValueOnce(new Error("disk on fire"));
    try {
      const { status, body } = await callGet();
      expect(status).toBe(200);
      const raw = body as unknown as Record<string, unknown>;
      expect(raw.errors_1h).toBeNull();
      expect(raw.queues).toEqual({ email_queued: null, email_failed_24h: null, webhook_failed_24h: null, report_orders_pending: null });
      expect(raw.crons_failed_24h).toEqual([]);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });
});
