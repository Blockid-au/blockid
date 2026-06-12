// GET /api/cron/cron-health — Cron routine health dashboard
//
// Reads cron-health.jsonl and returns the last run status for each endpoint.
// Also detects missed routines (expected but not run in the last cycle).

import { NextResponse } from "next/server";
import * as fs from "fs";

export const dynamic = "force-dynamic";

const HEALTH_LOG = "/home/dovanlong/blockid.au/web/content/reports/cron-health.jsonl";

interface CronEntry {
  ts: string;
  endpoint: string;
  status: string;
  duration_ms: number;
  detail: string;
}

const EXPECTED_DAILY = [
  "svi-snapshot", "svi-notify", "nurture", "vesting",
  "agent-upgrade", "growth-insights", "svi-review", "agent-research",
  "publish-insight", "refresh-models", "daily-admin-report", "telegram-report",
];
const EXPECTED_PERIODIC = ["blockchain-sync", "ai-health"];
const EXPECTED_WEEKLY = ["weekly-insights"];

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const entries: CronEntry[] = [];

    if (fs.existsSync(HEALTH_LOG)) {
      const raw = fs.readFileSync(HEALTH_LOG, "utf8");
      for (const line of raw.split("\n")) {
        const t = line.trim();
        if (!t) continue;
        try { entries.push(JSON.parse(t)); } catch { /* skip */ }
      }
    }

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);

    // Last run per endpoint
    const lastRun: Record<string, CronEntry> = {};
    for (const e of entries) {
      if (!lastRun[e.endpoint] || e.ts > lastRun[e.endpoint].ts) {
        lastRun[e.endpoint] = e;
      }
    }

    // Today's runs per endpoint
    const todayRuns: Record<string, CronEntry[]> = {};
    for (const e of entries) {
      if (e.ts.startsWith(today)) {
        if (!todayRuns[e.endpoint]) todayRuns[e.endpoint] = [];
        todayRuns[e.endpoint].push(e);
      }
    }

    // Check for missed daily routines
    const missed: string[] = [];
    const hourUTC = now.getUTCHours();
    for (const ep of EXPECTED_DAILY) {
      const runs = todayRuns[ep];
      if (!runs || runs.length === 0) {
        // Only flag as missed if we're past its expected time
        // Most daily runs are 16:00-23:30 UTC
        if (hourUTC >= 23 || (lastRun[ep] && !lastRun[ep].ts.startsWith(today) && !lastRun[ep].ts.startsWith(yesterday))) {
          missed.push(ep);
        }
      }
    }

    // Failed today
    const failedToday: string[] = [];
    for (const [ep, runs] of Object.entries(todayRuns)) {
      const lastToday = runs[runs.length - 1];
      if (lastToday && lastToday.status !== "ok") {
        failedToday.push(ep);
      }
    }

    // Build summary
    const summary = [...EXPECTED_DAILY, ...EXPECTED_PERIODIC, ...EXPECTED_WEEKLY].map(ep => {
      const last = lastRun[ep];
      const todayCount = todayRuns[ep]?.length ?? 0;
      return {
        endpoint: ep,
        status: last?.status ?? "never_run",
        lastRun: last?.ts ?? null,
        lastDuration: last?.duration_ms ?? null,
        todayRuns: todayCount,
        isMissed: missed.includes(ep),
      };
    });

    return NextResponse.json({
      ok: true,
      ts: now.toISOString(),
      totalEntries: entries.length,
      todayRuns: Object.values(todayRuns).reduce((a, b) => a + b.length, 0),
      missed,
      failedToday,
      routines: summary,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export { GET as POST };
