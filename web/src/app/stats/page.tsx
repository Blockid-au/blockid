// /stats — public autonomous-loop counters surface.
//
// Server component. Reads directly from web/content/reports/*.jsonl and the
// local git log via child_process. No auth, no PII. Safe for public consumption.
//
// This page is deliberately narrower in scope than /status: it surfaces the
// ship velocity + autonomous-loop counters that the platform maintains. All
// numbers derive from files the loop itself writes — nothing hardcoded.

import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { MarketingHero } from "@/components/marketing/marketing-hero";
import {
  readCommitCounters,
  readCronHealthSummary,
  readDeploySummary,
  readResellerLoopSnapshot,
  readUptimeSnapshot,
} from "@/lib/autonomous-loop-metrics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Stats — BlockID.au",
  description:
    "Live counters from the autonomous loop — commits, reseller module ticks, uptime, and deploys.",
  robots: { index: true, follow: true },
  alternates: { canonical: "https://blockid.au/stats" },
};

const DASH = "—";

function fmtIso(iso: string): string {
  if (!iso) return DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return DASH;
  return d.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "Z");
}

function fmtInt(v: number | null | undefined): string {
  if (v === undefined || v === null || Number.isNaN(v)) return "n/a";
  return String(Math.round(v));
}

function fmtPct(v: number | null | undefined, digits = 2): string {
  if (v === undefined || v === null || Number.isNaN(v)) return "n/a";
  return `${v.toFixed(digits)}%`;
}

function fmtDuration(seconds: number | null | undefined): string {
  if (!seconds || Number.isNaN(seconds)) return DASH;
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (parts.length < 2) parts.push(`${m}m`);
  return parts.join(" ");
}

export default async function StatsPage() {
  const [commits, reseller, uptime, cron, deploys] = await Promise.all([
    readCommitCounters(),
    readResellerLoopSnapshot(),
    readUptimeSnapshot(),
    readCronHealthSummary(),
    readDeploySummary(),
  ]);

  const nowIso = new Date().toISOString();

  return (
    <MarketingShell>
      <MarketingHero
        eyebrow="Stats"
        title="Autonomous loop counters"
        subtitle="Every number here is read from a log the platform's autonomous loop writes to itself — commits, reseller module ticks, uptime probes, cron health, and deploys. Nothing on this page is hand-curated."
      />

      <section
        aria-label="Autonomous loop stats"
        className="mx-auto w-full max-w-6xl px-6 pb-12"
      >
        {/* Header strip */}
        <div className="rounded-3xl border border-[var(--fintech-border)] bg-[var(--fintech-bg-elevated)] p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--fintech-accent)]">
                Live counters
              </p>
              <h2 className="font-display text-xl font-semibold tracking-tight text-[var(--fintech-ink)] sm:text-2xl">
                master@{commits.head_short || DASH}
              </h2>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-[var(--fintech-ink-muted)] sm:text-right">
              <div>
                <dt className="inline">Branch:&nbsp;</dt>
                <dd className="inline font-mono text-[var(--fintech-ink)]">
                  {commits.branch || DASH}
                </dd>
              </div>
              <div>
                <dt className="inline">Updated:&nbsp;</dt>
                <dd className="inline font-mono text-[var(--fintech-ink)]">
                  {fmtIso(nowIso)}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Commit velocity */}
        <div aria-labelledby="stats-commits" className="mt-8">
          <h3
            id="stats-commits"
            className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--fintech-accent)]"
          >
            Commit velocity
          </h3>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatTile
              label="Commits, last 24h"
              value={fmtInt(commits.last_24h)}
              caption="on master"
            />
            <StatTile
              label="Commits, last 7d"
              value={fmtInt(commits.last_7d)}
              caption="on master"
            />
            <StatTile
              label="Commits total"
              value={fmtInt(commits.total)}
              caption="lifetime on master"
            />
          </div>
        </div>

        {/* Reseller loop */}
        <div aria-labelledby="stats-reseller" className="mt-10">
          <h3
            id="stats-reseller"
            className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--fintech-accent)]"
          >
            Reseller autonomous loop
          </h3>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Current tick"
              value={
                reseller?.current_tick_number !== null && reseller?.current_tick_number !== undefined
                  ? `#${reseller.current_tick_number}`
                  : "n/a"
              }
              caption={
                reseller?.current_phase
                  ? `phase ${reseller.current_phase}`
                  : "phase n/a"
              }
            />
            <StatTile
              label="Ticks completed"
              value={fmtInt(reseller?.total_ticks_completed)}
              caption="from reseller-goal-history"
            />
            <StatTile
              label="Loop state"
              value={reseller?.tick_state ? reseller.tick_state.split(" ")[0] : "n/a"}
              caption={
                reseller?.last_tick_id
                  ? `last ${reseller.last_tick_id}`
                  : "no monitor row"
              }
            />
            <StatTile
              label="Human review, last 7d"
              value={
                reseller && reseller.human_review_minutes_7d !== null
                  ? `${reseller.human_review_minutes_7d} min`
                  : "n/a"
              }
              caption="loop budget"
            />
          </div>
        </div>

        {/* Uptime + cron */}
        <div aria-labelledby="stats-uptime" className="mt-10">
          <h3
            id="stats-uptime"
            className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--fintech-accent)]"
          >
            Uptime and cron health
          </h3>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Uptime, last 24h"
              value={fmtPct(uptime?.window_pct, 2)}
              caption={
                uptime
                  ? `${uptime.window_healthy}/${uptime.window_total} probes`
                  : "n/a"
              }
            />
            <StatTile
              label="Uptime, all-time"
              value={fmtPct(uptime?.all_time_pct, 2)}
              caption={
                uptime
                  ? `${uptime.total_healthy}/${uptime.total_rows} probes`
                  : "n/a"
              }
            />
            <StatTile
              label="Cron ok-rate, 24h"
              value={fmtPct(cron?.ok_rate_24h, 1)}
              caption={
                cron
                  ? `${cron.ok_count_24h} ok, ${cron.fail_count_24h} fail`
                  : "n/a"
              }
            />
            <StatTile
              label="Host uptime"
              value={fmtDuration(uptime?.last_uptime_s)}
              caption={
                uptime && uptime.last_load_1min !== null
                  ? `load ${uptime.last_load_1min.toFixed(2)}`
                  : "n/a"
              }
            />
          </div>
        </div>

        {/* Deploys */}
        <div aria-labelledby="stats-deploys" className="mt-10">
          <h3
            id="stats-deploys"
            className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--fintech-accent)]"
          >
            Deploys and pushes
          </h3>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatTile
              label="Deploys, last 24h"
              value={fmtInt(deploys?.deploys_24h)}
              caption={
                deploys?.last_deploy_ts
                  ? `last ${fmtIso(deploys.last_deploy_ts)}`
                  : "n/a"
              }
            />
            <StatTile
              label="Pushes, last 24h"
              value={fmtInt(deploys?.pushes_24h)}
              caption={
                deploys?.last_push_ts
                  ? `last ${fmtIso(deploys.last_push_ts)}`
                  : "n/a"
              }
            />
            <StatTile
              label="Last deploy gates"
              value={deploys?.last_deploy_gates || "n/a"}
              caption={
                deploys?.last_deploy_note
                  ? deploys.last_deploy_note.slice(0, 60)
                  : ""
              }
            />
          </div>
        </div>

        {/* Related links */}
        <nav
          aria-label="Related pages"
          className="mt-12 rounded-2xl border border-[var(--fintech-border)] bg-[var(--fintech-bg-elevated)] p-6 text-sm"
        >
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            <li>
              <Link
                href="/status"
                className="rounded-md text-[var(--fintech-ink)] underline-offset-2 transition-colors duration-200 ease-out hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fintech-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--fintech-bg-primary)]"
              >
                Status
              </Link>
            </li>
            <li>
              <Link
                href="/changelog"
                className="rounded-md text-[var(--fintech-ink)] underline-offset-2 transition-colors duration-200 ease-out hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fintech-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--fintech-bg-primary)]"
              >
                Changelog
              </Link>
            </li>
            <li>
              <Link
                href="/roadmap"
                className="rounded-md text-[var(--fintech-ink)] underline-offset-2 transition-colors duration-200 ease-out hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fintech-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--fintech-bg-primary)]"
              >
                Roadmap
              </Link>
            </li>
          </ul>
        </nav>
      </section>
    </MarketingShell>
  );
}

function StatTile(props: { label: string; value: string; caption?: string }) {
  const { label, value, caption } = props;
  return (
    <div className="rounded-xl border border-[var(--fintech-border)] bg-[var(--fintech-bg-elevated)] p-4">
      <p className="text-sm font-medium text-[var(--fintech-ink)]">{label}</p>
      <p className="mt-3 font-mono text-2xl text-[var(--fintech-ink)]">{value}</p>
      {caption ? (
        <p className="text-xs text-[var(--fintech-ink-muted)]">{caption}</p>
      ) : null}
    </div>
  );
}
