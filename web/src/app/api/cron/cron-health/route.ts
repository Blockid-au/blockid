// GET /api/cron/cron-health — Cron routine health dashboard
//
// Reads cron-health.jsonl and returns the last run status for each endpoint.
// Also detects missed routines (expected but not run in the last cycle).

import { NextResponse } from "next/server";
import * as fs from "fs";
import { sendTelegram, mdEscape } from "@/lib/telegram";

export const dynamic = "force-dynamic";

const WEB_DIR = process.env.BLOCKID_WEB_DIR ?? "/home/dovanlong/blockid.au/web";
const HEALTH_LOG = `${WEB_DIR}/content/reports/cron-health.jsonl`;
const HEARTBEAT_LOG = `${WEB_DIR}/content/reports/routine-heartbeat.jsonl`;
const REPORTS_DIR = `${WEB_DIR}/content/reports`;
const CLOUD_ALERT_STATE = "/tmp/blockid-cloud-routine-alert.json";

// Anthropic-hosted cloud routines (separate from local crontab — managed at
// claude.ai/code/routines). They went dead silently for ~2 weeks when their
// git source still pointed at the decommissioned GitLab. These checks make
// that class of failure visible. Daily agents stamp a "via":"cloud" heartbeat
// through agent-deploy; weekly agents (cmo, ir) open PRs + write cloud-only
// *-weekly-*.md files, so they're tracked by file freshness instead.
const CLOUD_DAILY = ["cto", "cfo", "coo", "ceo", "rnd"];
const CLOUD_WEEKLY = ["cmo", "ir"];
const CLOUD_DAILY_MAX_AGE_MS = 25 * 3_600_000; // 25h
const CLOUD_WEEKLY_MAX_AGE_MS = 8 * 86_400_000; // 8 days

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

    // ── Cloud routine silent-death detection ────────────────────────────
    // Last "via":"cloud" heartbeat per agent (daily agents post via webhook).
    const lastCloudHeartbeat: Record<string, string> = {};
    if (fs.existsSync(HEARTBEAT_LOG)) {
      for (const line of fs.readFileSync(HEARTBEAT_LOG, "utf8").split("\n")) {
        const t = line.trim();
        if (!t) continue;
        try {
          const h = JSON.parse(t) as { ts: string; agent: string; via: string };
          if (h.via === "cloud" && (!lastCloudHeartbeat[h.agent] || h.ts > lastCloudHeartbeat[h.agent])) {
            lastCloudHeartbeat[h.agent] = h.ts;
          }
        } catch { /* skip */ }
      }
    }

    // Newest mtime of a cloud-only weekly report file (cmo-weekly-*, ir-weekly-*).
    const newestWeeklyReport = (agent: string): number => {
      let newest = 0;
      try {
        for (const f of fs.readdirSync(REPORTS_DIR)) {
          if (f.startsWith(`${agent}-weekly-`) && f.endsWith(".md")) {
            newest = Math.max(newest, fs.statSync(`${REPORTS_DIR}/${f}`).mtimeMs);
          }
        }
      } catch { /* ignore */ }
      return newest;
    };

    const cloudRoutines = [
      ...CLOUD_DAILY.map(agent => {
        const last = lastCloudHeartbeat[agent];
        const ageMs = last ? now.getTime() - new Date(last).getTime() : Infinity;
        return { agent, cadence: "daily", lastSeen: last ?? null, armed: !!last, stale: !!last && ageMs > CLOUD_DAILY_MAX_AGE_MS };
      }),
      ...CLOUD_WEEKLY.map(agent => {
        const mtime = newestWeeklyReport(agent);
        const ageMs = mtime ? now.getTime() - mtime : Infinity;
        return { agent, cadence: "weekly", lastSeen: mtime ? new Date(mtime).toISOString() : null, armed: !!mtime, stale: !!mtime && ageMs > CLOUD_WEEKLY_MAX_AGE_MS };
      }),
    ];
    // Self-arming: only alert on agents that have run at least once (armed),
    // so a not-yet-rolled-out marker never raises a false alarm.
    const deadCloudRoutines = cloudRoutines.filter(r => r.armed && r.stale).map(r => r.agent);

    if (deadCloudRoutines.length > 0) {
      // Cooldown: at most one cloud-death alert per 12h.
      let lastAlert = 0;
      try { lastAlert = JSON.parse(fs.readFileSync(CLOUD_ALERT_STATE, "utf8")).ts ?? 0; } catch { /* none */ }
      if (now.getTime() - lastAlert > 12 * 3_600_000) {
        const lines = [
          `🛑 *Cloud routine silent\\-death detected*`,
          ``,
          ...deadCloudRoutines.map(a => mdEscape(`• ${a.toUpperCase()} — no run within its window`)),
          ``,
          mdEscape("Check claude.ai/code/routines — likely a broken git source or disabled routine."),
        ];
        await sendTelegram(lines.join("\n")).catch(() => {});
        try { fs.writeFileSync(CLOUD_ALERT_STATE, JSON.stringify({ ts: now.getTime(), agents: deadCloudRoutines })); } catch { /* ignore */ }
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
      cloudRoutines,
      deadCloudRoutines,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export { GET as POST };
