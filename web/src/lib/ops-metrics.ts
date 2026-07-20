// Operational metrics — server-only aggregations for the /admin/ops COO
// dashboard and its JSON mirror at /api/admin/ops.
//
// Design notes
// -----------
// * Every helper is graceful: a missing file, unreadable JSONL, or a table
//   that isn't provisioned yet must return an empty structure — never
//   throw. The dashboard is a mixed-source overlay, so a single missing
//   input must not blank the whole page.
// * All expensive reads are memoised in-process for 60s. The dashboard is
//   the primary caller and is refreshed manually via `router.refresh()`,
//   so a modest TTL is enough to smooth request bursts without staling the
//   UI meaningfully.
// * No new dependencies. jsonl files are parsed with readFileSync +
//   line-by-line JSON.parse; Supabase reads use `getSupabaseAdmin()`.

import "server-only";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { getSupabaseAdmin } from "./supabase";
import { listExperiments, summarise } from "./pricing-experiments";

// ── Cache ─────────────────────────────────────────────────────────────
const TTL_MS = 60_000;
const cache = new Map<string, { at: number; value: unknown }>();

async function memo<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
}

// ── Types ─────────────────────────────────────────────────────────────
export interface ReleaseInfo {
  buildId: string | null;
  gitSha: string | null;
  deployedAt: string | null;
  pid: number | null;
}

export interface DeployHealth {
  deploys: number;
  failures: number;
  publicHttp200Count: number;
}

export interface CreditBurn {
  total: number;
  byFeature: Array<{ feature: string; credits: number; pctOfTotal: number }>;
  daily: Array<{ day: string; credits: number }>;
}

export interface CronHealthEntry {
  job: string;
  lastRunAt: string | null;
  lastStatus: string;
  lagMinutes: number;
}

export interface ExperimentVariantStat {
  key: string;
  impressions: number;
  conversions: number;
  conversionRate: number;
}

export interface ActiveExperiment {
  id: string;
  name: string;
  hypothesis: string;
  variants: ExperimentVariantStat[];
}

export interface Growth7d {
  signupsDaily: Array<{ day: string; count: number }>;
  analysesDaily: Array<{ day: string; count: number }>;
}

export interface SecurityPosture {
  lastAuditAt: string | null;
  topIssues: Array<{ title: string; severity: string }>;
}

// ── Paths ─────────────────────────────────────────────────────────────
// cwd during `next start` is the web/ dir; the reports live in
// web/content/reports. We resolve from cwd so both `dev` and `start` work.
const REPORTS_DIR = path.join(process.cwd(), "content", "reports");
const DEPLOY_LOG = path.join(REPORTS_DIR, "deploy-log.jsonl");
const CRON_HEALTH = path.join(REPORTS_DIR, "cron-health.jsonl");
const LAST_GOOD_BUILD = path.join(REPORTS_DIR, "last-good-build.json");
const SECURITY_POSTURE = path.join(REPORTS_DIR, "security-posture.json");
const DEPLOY_MANIFEST = path.join(process.cwd(), ".deploy-manifest.json");
const NEXT_BUILD_ID = path.join(process.cwd(), ".next", "BUILD_ID");

// ── Helpers ───────────────────────────────────────────────────────────

function safeReadJson<T>(filePath: string): T | null {
  try {
    if (!existsSync(filePath)) return null;
    const raw = readFileSync(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function readJsonlLines(filePath: string): unknown[] {
  try {
    if (!existsSync(filePath)) return [];
    const raw = readFileSync(filePath, "utf8");
    const out: unknown[] = [];
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try {
        out.push(JSON.parse(t));
      } catch {
        // skip malformed line — an errant write shouldn't blank the tile
      }
    }
    return out;
  } catch {
    return [];
  }
}

function dayKey(d: Date): string {
  // Australia/Sydney is UTC+10 (no DST for reporting simplicity). Using UTC
  // day keys here to match how the jsonl files are written; the difference
  // is at most one day at the edges and is fine for a coarse 7d/30d chart.
  return d.toISOString().slice(0, 10);
}

function lastNDays(n: number): string[] {
  const days: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    days.push(dayKey(d));
  }
  return days;
}

// ── 1. Release info ───────────────────────────────────────────────────
export async function getReleaseInfo(): Promise<ReleaseInfo> {
  return memo("release", async () => {
    const manifest = safeReadJson<{
      git_sha?: string;
      deployed_at?: string;
    }>(DEPLOY_MANIFEST);
    const lastGood = safeReadJson<{
      sha?: string;
      buildId?: string;
      pid?: string;
      ts?: string;
    }>(LAST_GOOD_BUILD);

    let buildIdFromDisk: string | null = null;
    try {
      if (existsSync(NEXT_BUILD_ID)) {
        buildIdFromDisk = readFileSync(NEXT_BUILD_ID, "utf8").trim() || null;
      }
    } catch {
      buildIdFromDisk = null;
    }

    const parsedPid = lastGood?.pid ? Number.parseInt(lastGood.pid, 10) : NaN;

    return {
      buildId: buildIdFromDisk ?? lastGood?.buildId ?? null,
      gitSha: manifest?.git_sha ?? lastGood?.sha ?? null,
      deployedAt: manifest?.deployed_at ?? lastGood?.ts ?? null,
      pid: Number.isFinite(parsedPid) ? parsedPid : process.pid ?? null,
    };
  });
}

// ── 2. Deploy health (24h) ────────────────────────────────────────────
export async function getDeployHealth24h(): Promise<DeployHealth> {
  return memo("deployHealth", async () => {
    const rows = readJsonlLines(DEPLOY_LOG);
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;

    let deploys = 0;
    let failures = 0;
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const r = row as { ts?: string; status?: string };
      const ts = r.ts ? Date.parse(r.ts) : NaN;
      if (!Number.isFinite(ts) || ts < cutoff) continue;
      deploys += 1;
      if (r.status && r.status !== "success" && r.status !== "ok") {
        failures += 1;
      }
    }

    // "Public HTTP 200 count" — use the cron-health feed as a live-liveness
    // proxy: every entry with status=ok represents a successful internal HTTP
    // hit against the running server. This is the closest live counter we
    // have without adding a new probe.
    let publicHttp200Count = 0;
    for (const row of readJsonlLines(CRON_HEALTH)) {
      if (!row || typeof row !== "object") continue;
      const r = row as { ts?: string; status?: string };
      const ts = r.ts ? Date.parse(r.ts) : NaN;
      if (!Number.isFinite(ts) || ts < cutoff) continue;
      if (r.status === "ok") publicHttp200Count += 1;
    }

    return { deploys, failures, publicHttp200Count };
  });
}

// ── 3. Credit burn (30d) ──────────────────────────────────────────────
export async function getCreditBurn30d(): Promise<CreditBurn> {
  return memo("creditBurn", async () => {
    const empty: CreditBurn = { total: 0, byFeature: [], daily: [] };
    const supabase = getSupabaseAdmin();
    if (!supabase) return empty;

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from("usage_logs")
      .select("feature, credits_used, created_at")
      .gte("created_at", since)
      .limit(50_000);

    if (error || !data) return empty;

    const rows = data as Array<{
      feature: string;
      credits_used: number | string;
      created_at: string;
    }>;

    const perFeature = new Map<string, number>();
    const perDay = new Map<string, number>();
    let total = 0;

    for (const r of rows) {
      const c = typeof r.credits_used === "number" ? r.credits_used : Number(r.credits_used);
      if (!Number.isFinite(c) || c <= 0) continue;
      total += c;
      perFeature.set(r.feature, (perFeature.get(r.feature) ?? 0) + c);
      const day = r.created_at.slice(0, 10);
      perDay.set(day, (perDay.get(day) ?? 0) + c);
    }

    const byFeature = Array.from(perFeature.entries())
      .map(([feature, credits]) => ({
        feature,
        credits: Math.round(credits * 100) / 100,
        pctOfTotal: total > 0 ? credits / total : 0,
      }))
      .sort((a, b) => b.credits - a.credits)
      .slice(0, 5);

    const days = lastNDays(30);
    const daily = days.map((day) => ({
      day,
      credits: Math.round((perDay.get(day) ?? 0) * 100) / 100,
    }));

    return {
      total: Math.round(total * 100) / 100,
      byFeature,
      daily,
    };
  });
}

// ── 4. Cron health (24h) ──────────────────────────────────────────────
export async function getCronHealth24h(): Promise<CronHealthEntry[]> {
  return memo("cronHealth", async () => {
    const rows = readJsonlLines(CRON_HEALTH);
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;

    // Keep the latest row per endpoint from the last 24h.
    const latest = new Map<string, { ts: number; status: string; iso: string }>();
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const r = row as { ts?: string; endpoint?: string; status?: string };
      const ts = r.ts ? Date.parse(r.ts) : NaN;
      if (!Number.isFinite(ts) || ts < cutoff) continue;
      if (!r.endpoint) continue;
      const prev = latest.get(r.endpoint);
      if (!prev || ts > prev.ts) {
        latest.set(r.endpoint, {
          ts,
          status: r.status ?? "unknown",
          iso: r.ts ?? new Date(ts).toISOString(),
        });
      }
    }

    const now = Date.now();
    const out: CronHealthEntry[] = Array.from(latest.entries()).map(
      ([job, info]) => ({
        job,
        lastRunAt: info.iso,
        lastStatus: info.status,
        lagMinutes: Math.max(0, Math.round((now - info.ts) / 60_000)),
      }),
    );

    // Sort worst first so the eye lands on problems.
    out.sort((a, b) => b.lagMinutes - a.lagMinutes);
    return out;
  });
}

// ── 5. Active A/B experiments ─────────────────────────────────────────
export async function getActiveExperiments(): Promise<ActiveExperiment[]> {
  return memo("activeExperiments", async () => {
    try {
      const all = await listExperiments();
      const running = all.filter((e) => e.status === "running");
      if (running.length === 0) return [];

      const summaries = await Promise.all(
        running.map(async (e) => ({ id: e.id, rows: await summarise(e.id) })),
      );
      const byId = new Map(summaries.map((s) => [s.id, s.rows]));

      return running.map((e) => {
        const rows = byId.get(e.id) ?? [];
        const rowByKey = new Map(rows.map((r) => [r.variantKey, r]));
        const variants: ExperimentVariantStat[] = e.variants.map((v) => {
          const row = rowByKey.get(v.key);
          const impressions = row?.impressions ?? 0;
          const conversions = row?.conversions ?? 0;
          return {
            key: v.key,
            impressions,
            conversions,
            conversionRate: impressions > 0 ? conversions / impressions : 0,
          };
        });
        return {
          id: e.id,
          name: e.name,
          hypothesis: e.hypothesis,
          variants,
        };
      });
    } catch {
      return [];
    }
  });
}

// ── 6. Growth (7d) ────────────────────────────────────────────────────
export async function getGrowth7d(): Promise<Growth7d> {
  return memo("growth7d", async () => {
    const days = lastNDays(7);
    const empty: Growth7d = {
      signupsDaily: days.map((day) => ({ day, count: 0 })),
      analysesDaily: days.map((day) => ({ day, count: 0 })),
    };

    const supabase = getSupabaseAdmin();
    if (!supabase) return empty;

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [users, analyses] = await Promise.all([
      supabase
        .from("app_users")
        .select("created_at")
        .gte("created_at", since)
        .limit(10_000),
      supabase
        .from("svi_analyses")
        .select("created_at")
        .gte("created_at", since)
        .limit(10_000),
    ]);

    const bucket = (
      rows: Array<{ created_at: string }> | null,
    ): Map<string, number> => {
      const m = new Map<string, number>();
      for (const r of rows ?? []) {
        const day = r.created_at?.slice(0, 10);
        if (!day) continue;
        m.set(day, (m.get(day) ?? 0) + 1);
      }
      return m;
    };

    const userBucket = users.error
      ? new Map<string, number>()
      : bucket(users.data as Array<{ created_at: string }> | null);
    const analysisBucket = analyses.error
      ? new Map<string, number>()
      : bucket(analyses.data as Array<{ created_at: string }> | null);

    return {
      signupsDaily: days.map((day) => ({ day, count: userBucket.get(day) ?? 0 })),
      analysesDaily: days.map((day) => ({
        day,
        count: analysisBucket.get(day) ?? 0,
      })),
    };
  });
}

// ── 7. Security posture ───────────────────────────────────────────────
interface PostureDimension {
  key: string;
  label: string;
  score: number;
  detail?: string;
  findings?: string[];
}

interface PostureFile {
  date?: string;
  overall?: number;
  dimensions?: PostureDimension[];
}

function scoreToSeverity(score: number): string {
  if (score <= 2) return "critical";
  if (score <= 5) return "high";
  if (score <= 7) return "medium";
  return "low";
}

export async function getSecurityPosture(): Promise<SecurityPosture | null> {
  return memo("securityPosture", async () => {
    const file = safeReadJson<PostureFile>(SECURITY_POSTURE);
    if (!file) return null;

    const dims = Array.isArray(file.dimensions) ? file.dimensions : [];
    const topIssues = dims
      .slice()
      .sort((a, b) => (a.score ?? 10) - (b.score ?? 10))
      .slice(0, 3)
      .map((d) => ({
        title: d.label || d.key || "Unknown",
        severity: scoreToSeverity(typeof d.score === "number" ? d.score : 10),
      }));

    return {
      lastAuditAt: file.date ?? null,
      topIssues,
    };
  });
}
