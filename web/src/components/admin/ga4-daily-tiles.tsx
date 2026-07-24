// GA4 Daily Tiles — Server Component rendered inside /admin/growth.
// Reads the latest snapshot from web/content/reports/ga4-daily.jsonl and
// renders 6 tiles (Sessions, Active Users, Top Pages, Top Events,
// Conversions, Top Source/Medium). Falls back to a single placeholder
// card when GA4 env is missing or the file is empty.
//
// See docs/plans/mega-2026-07-24/05-cdo-ga4-dashboard.md.

import fs from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import { AlertTriangle, Activity, Users, FileText, Zap, Target, Globe2 } from "lucide-react";
import {
  isGa4Configured,
  type Ga4Snapshot,
  type Ga4TrendPoint,
} from "@/lib/ga4/data-api-client";

const JSONL_PATH = path.join(process.cwd(), "content", "reports", "ga4-daily.jsonl");

async function readLatestSnapshot(): Promise<Ga4Snapshot | null> {
  try {
    const raw = await fs.readFile(JSONL_PATH, "utf8");
    const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return null;
    // Walk from the end until a valid JSON line is found (defensive against
    // partially-written entries from a crashed cron).
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const parsed = JSON.parse(lines[i]) as Ga4Snapshot;
        return parsed;
      } catch {
        continue;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return Math.round(n).toLocaleString();
}

function pct(n: number): string {
  if (!Number.isFinite(n)) return "0%";
  return `${Math.round(n * 100)}%`;
}

// Tiny inline SVG sparkline (no external deps).
function Sparkline({ points, color = "#0284c7" }: { points: number[]; color?: string }) {
  if (points.length < 2) return null;
  const w = 100;
  const h = 28;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const step = w / (points.length - 1);
  const d = points
    .map((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / range) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-7 mt-2" preserveAspectRatio="none" aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

function PlaceholderCard({ message, hint }: { message: string; hint?: string }) {
  return (
    <section id="ga4-tiles" className="scroll-mt-24">
      <h2 className="text-lg font-semibold text-ink-800 mb-4 flex items-center gap-2">
        <Activity strokeWidth={1.75} className="h-5 w-5 text-brand-600" />
        GA4 Traffic (Yesterday)
      </h2>
      <div className="rounded-2xl border border-surface-200 bg-white p-8 text-center">
        <AlertTriangle strokeWidth={1.75} className="mx-auto h-8 w-8 text-amber-500 mb-3" />
        <p className="text-sm font-medium text-ink-800">{message}</p>
        {hint && <p className="mt-2 text-xs text-ink-600 max-w-lg mx-auto leading-relaxed">{hint}</p>}
        <Link
          href="/docs/plans/mega-2026-07-24/05-cdo-ga4-dashboard.md"
          className="mt-3 inline-block text-xs font-medium text-brand-600 hover:text-brand-700"
        >
          Setup runbook →
        </Link>
      </div>
    </section>
  );
}

export async function GA4DailyTiles() {
  if (!isGa4Configured()) {
    return (
      <PlaceholderCard
        message="GA4 API not configured"
        hint="Set GA4_PROPERTY_ID and GOOGLE_APPLICATION_CREDENTIALS_JSON in .env.local, then run scripts/cron/ga4-daily-pull.mjs."
      />
    );
  }

  const snap = await readLatestSnapshot();
  if (!snap) {
    return (
      <PlaceholderCard
        message="No GA4 snapshot yet"
        hint="Run scripts/cron/ga4-daily-pull.mjs or hit POST /api/admin/ga4-refresh to populate ga4-daily.jsonl."
      />
    );
  }

  const trend = snap.trend7d ?? [];
  const sessionsSeries = trend.map((p: Ga4TrendPoint) => p.sessions);
  const usersToday = snap.totals?.activeUsers ?? 0;
  const usersYesterdayInTrend = trend.length >= 2 ? trend[trend.length - 2].users : null;
  const usersDelta = usersYesterdayInTrend != null ? usersToday - usersYesterdayInTrend : null;

  const captured = snap.captured_at ? new Date(snap.captured_at).toLocaleString("en-AU", { timeZone: "UTC" }) : "";

  return (
    <section id="ga4-tiles" className="scroll-mt-24">
      <div className="flex items-end justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold text-ink-800 flex items-center gap-2">
            <Activity strokeWidth={1.75} className="h-5 w-5 text-brand-600" />
            GA4 Traffic ({snap.date})
          </h2>
          <p className="text-xs text-ink-600 mt-0.5">
            Captured {captured} UTC · {snap.property_id}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Sessions + sparkline */}
        <div className="rounded-2xl border border-surface-200 bg-white p-5">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] uppercase tracking-[0.15em] text-ink-600 font-medium">Sessions</p>
            <Activity strokeWidth={1.75} className="h-3.5 w-3.5 text-brand-500" />
          </div>
          <p className="text-2xl font-bold font-mono text-ink-800">{fmt(snap.totals.sessions)}</p>
          <Sparkline points={sessionsSeries} color="#0284c7" />
          <p className="text-[10px] text-ink-600 mt-1">7-day trend</p>
        </div>

        {/* Active users + delta */}
        <div className="rounded-2xl border border-surface-200 bg-white p-5">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] uppercase tracking-[0.15em] text-ink-600 font-medium">Active Users</p>
            <Users strokeWidth={1.75} className="h-3.5 w-3.5 text-teal-500" />
          </div>
          <p className="text-2xl font-bold font-mono text-ink-800">{fmt(usersToday)}</p>
          {usersDelta != null && (
            <p className={`text-xs mt-1 ${usersDelta >= 0 ? "text-emerald-600" : "text-red-500"}`}>
              {usersDelta >= 0 ? "▲" : "▼"} {Math.abs(usersDelta).toLocaleString()} vs prior day
            </p>
          )}
          <p className="text-[10px] text-ink-600 mt-1">New: {fmt(snap.totals.newUsers)}</p>
        </div>

        {/* Conversions + engagement rate */}
        <div className="rounded-2xl border border-surface-200 bg-white p-5">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] uppercase tracking-[0.15em] text-ink-600 font-medium">Conversions</p>
            <Target strokeWidth={1.75} className="h-3.5 w-3.5 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold font-mono text-ink-800">{fmt(snap.totals.conversions)}</p>
          <p className="text-xs text-ink-600 mt-1">
            Engagement rate: <span className="font-medium text-ink-800">{pct(snap.totals.engagementRate)}</span>
          </p>
          <p className="text-[10px] text-ink-600 mt-1">
            Avg session {Math.round(snap.totals.averageSessionDuration)}s
          </p>
        </div>

        {/* Top pages */}
        <div className="rounded-2xl border border-surface-200 bg-white p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] uppercase tracking-[0.15em] text-ink-600 font-medium">Top Pages</p>
            <FileText strokeWidth={1.75} className="h-3.5 w-3.5 text-brand-500" />
          </div>
          <ul className="space-y-1.5">
            {(snap.topPages ?? []).slice(0, 5).map((p) => (
              <li key={p.path} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-ink-700 font-mono" title={p.path}>{p.path || "/"}</span>
                <span className="text-ink-600 font-mono shrink-0">{fmt(p.sessions)}</span>
              </li>
            ))}
            {(snap.topPages ?? []).length === 0 && <li className="text-xs text-ink-600">No pages recorded</li>}
          </ul>
        </div>

        {/* Top events */}
        <div className="rounded-2xl border border-surface-200 bg-white p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] uppercase tracking-[0.15em] text-ink-600 font-medium">Top Events</p>
            <Zap strokeWidth={1.75} className="h-3.5 w-3.5 text-amber-500" />
          </div>
          <ul className="space-y-1.5">
            {(snap.topEvents ?? []).slice(0, 5).map((e) => (
              <li key={e.name} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-ink-700" title={e.name}>{e.name}</span>
                <span className="text-ink-600 font-mono shrink-0">{fmt(e.count)}</span>
              </li>
            ))}
            {(snap.topEvents ?? []).length === 0 && <li className="text-xs text-ink-600">No events recorded</li>}
          </ul>
        </div>

        {/* Top source / medium */}
        <div className="rounded-2xl border border-surface-200 bg-white p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] uppercase tracking-[0.15em] text-ink-600 font-medium">Top Source / Medium</p>
            <Globe2 strokeWidth={1.75} className="h-3.5 w-3.5 text-teal-500" />
          </div>
          <ul className="space-y-1.5">
            {(snap.sourceMedium ?? []).slice(0, 5).map((s, i) => (
              <li key={`${s.source}-${s.medium}-${i}`} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-ink-700" title={`${s.source} / ${s.medium}`}>
                  {s.source || "(direct)"} <span className="text-ink-600">/ {s.medium || "(none)"}</span>
                </span>
                <span className="text-ink-600 font-mono shrink-0">{fmt(s.sessions)}</span>
              </li>
            ))}
            {(snap.sourceMedium ?? []).length === 0 && <li className="text-xs text-ink-600">No traffic recorded</li>}
          </ul>
        </div>
      </div>
    </section>
  );
}

export default GA4DailyTiles;
