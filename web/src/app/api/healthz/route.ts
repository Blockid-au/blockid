// GET /api/healthz — Guardian health probe (spec section 3)
//
// Returns a HealthzResponse JSON body with per-dependency latency + a rolled-up
// `ok` flag. Any failing check flips overall `ok` to false and switches the
// HTTP status to 503 so upstream watchers (uptime-watcher.sh, k8s probes,
// Cloudflare load-balancer health) can react.
//
// All dependency probes run in parallel via Promise.allSettled; each has its
// own short timeout so a single stuck backend cannot block the endpoint.

import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CheckResult = { ok: boolean; latency_ms?: number; error?: string };

type HealthzResponse = {
  ok: boolean;
  version: string;
  git_sha: string;
  uptime_s: number;
  checks: {
    db: CheckResult;
    stripe: CheckResult;
    chain: CheckResult;
    ga4: CheckResult;
    disk_pct: number;
    mem_pct: number;
    p95_ms: number;
  };
};

const REPO_ROOT = path.resolve(process.cwd());

async function readJsonSafe<T = unknown>(rel: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(path.join(REPO_ROOT, rel), "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function resolveVersion(): Promise<string> {
  // Try web/content/reports/version.json first, then repo root as fallback.
  const candidates = [
    "content/reports/version.json",
    "web/content/reports/version.json",
  ];
  for (const rel of candidates) {
    const data = await readJsonSafe<{ version?: string }>(rel);
    if (data?.version) return String(data.version);
  }
  return "unknown";
}

async function resolveGitSha(): Promise<string> {
  const candidates = [".deploy-manifest.json", "web/.deploy-manifest.json"];
  for (const rel of candidates) {
    const data = await readJsonSafe<{ git_sha?: string }>(rel);
    if (data?.git_sha) return String(data.git_sha);
  }
  return process.env.GIT_SHA ?? "unknown";
}

function timed(): { since: () => number } {
  const start = performance.now();
  return { since: () => Math.round(performance.now() - start) };
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch((e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

async function checkDb(): Promise<CheckResult> {
  const t = timed();
  try {
    if (!isSupabaseConfigured()) {
      return { ok: false, error: "supabase not configured" };
    }
    const supabase = getSupabaseAdmin();
    if (!supabase) return { ok: false, error: "supabase client unavailable" };
    // Lightweight SELECT 1 via HEAD count on a tiny system table.
    // Falls back on error - we care about connectivity not row count.
    const { error } = await withTimeout(
      supabase.from("app_users").select("id", { head: true, count: "exact" }),
      3000,
      "db",
    );
    if (error) return { ok: false, latency_ms: t.since(), error: error.message };
    return { ok: true, latency_ms: t.since() };
  } catch (err) {
    return { ok: false, latency_ms: t.since(), error: (err as Error).message };
  }
}

async function checkStripe(): Promise<CheckResult> {
  const t = timed();
  try {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) return { ok: false, error: "STRIPE_SECRET_KEY missing" };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    try {
      const res = await fetch("https://api.stripe.com/v1/balance", {
        method: "HEAD",
        headers: { Authorization: `Bearer ${key}` },
        signal: ctrl.signal,
      });
      // Stripe returns 405 for HEAD on some endpoints - treat any non-5xx auth
      // response as a healthy signal (we reached the API and were authenticated
      // enough not to get 401/403).
      const ok = res.status < 500 && res.status !== 401 && res.status !== 403;
      return ok
        ? { ok: true, latency_ms: t.since() }
        : { ok: false, latency_ms: t.since(), error: `HTTP ${res.status}` };
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    return { ok: false, latency_ms: t.since(), error: (err as Error).message };
  }
}

async function checkChain(): Promise<CheckResult> {
  const t = timed();
  try {
    const url = process.env.CHAIN_RPC_URL ?? "http://localhost:8545";
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
        signal: ctrl.signal,
      });
      if (!res.ok) return { ok: false, latency_ms: t.since(), error: `HTTP ${res.status}` };
      const body = (await res.json()) as { result?: string; error?: { message?: string } };
      if (body.error) return { ok: false, latency_ms: t.since(), error: body.error.message ?? "rpc error" };
      if (!body.result) return { ok: false, latency_ms: t.since(), error: "empty result" };
      return { ok: true, latency_ms: t.since() };
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    return { ok: false, latency_ms: t.since(), error: (err as Error).message };
  }
}

async function checkGa4(): Promise<CheckResult> {
  const t = timed();
  try {
    const measurementId = process.env.GA4_MEASUREMENT_ID;
    const apiSecret = process.env.GA4_API_SECRET;
    if (!measurementId || !apiSecret) {
      // Not configured yet — skip cleanly rather than fail the whole probe.
      return { ok: true };
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    try {
      const res = await fetch(
        `https://www.google-analytics.com/debug/mp/collect?measurement_id=${encodeURIComponent(
          measurementId,
        )}&api_secret=${encodeURIComponent(apiSecret)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ client_id: "healthz.probe", events: [] }),
          signal: ctrl.signal,
        },
      );
      const ok = res.status < 500;
      return ok
        ? { ok: true, latency_ms: t.since() }
        : { ok: false, latency_ms: t.since(), error: `HTTP ${res.status}` };
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    return { ok: false, latency_ms: t.since(), error: (err as Error).message };
  }
}

async function diskPct(): Promise<number> {
  try {
    // node:fs statfs is available in Node >=18.15 / 20.
    const anyFs = fs as unknown as {
      statfs?: (p: string) => Promise<{ blocks: bigint | number; bfree: bigint | number; bavail: bigint | number }>;
    };
    if (typeof anyFs.statfs === "function") {
      const s = await anyFs.statfs("/");
      const blocks = Number(s.blocks);
      const bavail = Number(s.bavail);
      if (blocks > 0) {
        const used = blocks - bavail;
        return Math.round((used / blocks) * 100);
      }
    }
    return 0;
  } catch {
    return 0;
  }
}

function memPct(): number {
  const total = os.totalmem();
  const free = os.freemem();
  if (total <= 0) return 0;
  return Math.round(((total - free) / total) * 100);
}

async function logIncident(body: HealthzResponse): Promise<void> {
  try {
    if (!isSupabaseConfigured()) return;
    const supabase = getSupabaseAdmin();
    if (!supabase) return;
    // Best-effort — table may not exist yet during the guardian rollout.
    const failing = Object.entries(body.checks)
      .filter(([, v]) => typeof v === "object" && v && "ok" in v && !(v as CheckResult).ok)
      .map(([k]) => k);
    await supabase.from("deploy_incidents").insert({
      kind: "downtime",
      severity: "alert",
      summary: `healthz failing: ${failing.join(", ") || "unknown"}`,
      details: body,
    });
  } catch {
    // swallow — never block the probe on logging
  }
}

export async function GET(): Promise<Response> {
  const [version, git_sha, dbRes, stripeRes, chainRes, ga4Res, disk_pct] =
    await Promise.all([
      resolveVersion(),
      resolveGitSha(),
      Promise.allSettled([checkDb()]).then((r) =>
        r[0].status === "fulfilled" ? r[0].value : { ok: false, error: String(r[0].reason) },
      ),
      Promise.allSettled([checkStripe()]).then((r) =>
        r[0].status === "fulfilled" ? r[0].value : { ok: false, error: String(r[0].reason) },
      ),
      Promise.allSettled([checkChain()]).then((r) =>
        r[0].status === "fulfilled" ? r[0].value : { ok: false, error: String(r[0].reason) },
      ),
      Promise.allSettled([checkGa4()]).then((r) =>
        r[0].status === "fulfilled" ? r[0].value : { ok: false, error: String(r[0].reason) },
      ),
      diskPct(),
    ]);

  const body: HealthzResponse = {
    ok:
      dbRes.ok &&
      stripeRes.ok &&
      chainRes.ok &&
      ga4Res.ok,
    version,
    git_sha,
    uptime_s: Math.round(process.uptime()),
    checks: {
      db: dbRes,
      stripe: stripeRes,
      chain: chainRes,
      ga4: ga4Res,
      disk_pct,
      mem_pct: memPct(),
      p95_ms: 0, // TODO(G-XX): populate from perf_samples once table exists
    },
  };

  if (!body.ok) {
    // Fire-and-forget; never await in a way that could delay the probe.
    void logIncident(body);
  }

  return NextResponse.json(body, {
    status: body.ok ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
}
