/**
 * /showcase/blockid — Track B B6 public showcase mirror.
 *
 * Server component. Reads BlockID.au's own on-disk artefacts (the same
 * web/content/reports/*.md set that /guide/reports (B5) feeds off + the
 * milestone-report-state.json state file) and renders a metadata-only
 * mirror of the workspace: current phase, phase progress strip, agent
 * activity grid, milestone timeline.
 *
 * Redaction rule (plan §284): "the reseller CANNOT see any DataRoom
 * document content" — the same rule binds the public showcase since it is
 * strictly more exposed than the reseller lens. This page renders titles,
 * agent labels, dates, version tags, and aggregate counts only. Nothing
 * on this page depends on the DB, so it works before B1.3 seed lands.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { PageTracker } from "@/components/analytics/page-tracker";
import { WebPageJsonLd } from "@/components/seo/json-ld";
import {
  buildShowcaseDataRoomRows,
  type DataRoomShowcaseRow,
} from "@/lib/showcase/report-tagging";
import {
  buildAgentActivity,
  buildCrossCuttingCount,
  buildMilestoneTimeline,
  buildPhaseArtifactCounts,
  summarisePublicView,
} from "@/lib/showcase/public-view";

const SITE_URL = "https://blockid.au";
const CANONICAL = `${SITE_URL}/showcase/blockid`;

const TITLE = "BlockID.au — Live Startup Showcase";
const DESCRIPTION =
  "A public, read-only mirror of the BlockID.au workspace — the startup building BlockID, dogfooding its own product. See the current phase, milestone timeline, and C-Level agent activity as it happens.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "startup showcase",
    "dogfooding startup",
    "startup progress live",
    "founder journey demo",
    "blockid showcase",
  ],
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: CANONICAL,
    siteName: "BlockID",
    locale: "en_AU",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  alternates: { canonical: CANONICAL },
  robots: { index: true, follow: true },
};

export const dynamic = "force-dynamic";

// process.cwd() is either the repo root or the web workspace depending on
// which server tsconfig started Next.js. Mirror the dual-candidate pattern
// used by /guide/reports so the page never hard-codes either root.
async function readReportRows(): Promise<DataRoomShowcaseRow[]> {
  const candidates = [
    path.join(process.cwd(), "web", "content", "reports"),
    path.join(process.cwd(), "content", "reports"),
  ];
  for (const dir of candidates) {
    try {
      const entries = await fs.readdir(dir);
      const markdown = entries.filter((f) => f.endsWith(".md"));
      if (markdown.length === 0) continue;
      return buildShowcaseDataRoomRows({
        filenames: markdown,
        includeTemplates: false,
      });
    } catch {
      // try next candidate
    }
  }
  return [];
}

interface MilestoneState {
  reportedMilestoneIds: string[];
  lastRun: string | null;
}

async function readMilestoneState(): Promise<MilestoneState> {
  const candidates = [
    path.join(process.cwd(), "web", "content", "reports", "milestone-report-state.json"),
    path.join(process.cwd(), "content", "reports", "milestone-report-state.json"),
  ];
  for (const p of candidates) {
    try {
      const raw = await fs.readFile(p, "utf8");
      const parsed = JSON.parse(raw) as {
        reportedMilestoneIds?: unknown;
        lastRun?: unknown;
      };
      const ids = Array.isArray(parsed.reportedMilestoneIds)
        ? parsed.reportedMilestoneIds.filter((v): v is string => typeof v === "string")
        : [];
      const lastRun = typeof parsed.lastRun === "string" ? parsed.lastRun : null;
      return { reportedMilestoneIds: ids, lastRun };
    } catch {
      // try next candidate
    }
  }
  return { reportedMilestoneIds: [], lastRun: null };
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const day = iso.slice(0, 10);
  const [y, m, d] = day.split("-");
  if (!y || !m || !d) return day;
  return `${d}/${m}/${y}`;
}

export default async function ShowcaseBlockidPage() {
  const [rows, milestoneState] = await Promise.all([
    readReportRows(),
    readMilestoneState(),
  ]);

  const summary = summarisePublicView(rows);
  const agentActivity = buildAgentActivity(rows);
  const phaseCounts = buildPhaseArtifactCounts(rows);
  const crossCutting = buildCrossCuttingCount(rows);
  const timeline = buildMilestoneTimeline(milestoneState.reportedMilestoneIds);
  const currentPhase = summary.current_phase;

  return (
    <>
      <PageTracker page="showcase-blockid" />
      <WebPageJsonLd
        url={CANONICAL}
        name={TITLE}
        description={DESCRIPTION}
        breadcrumbs={[
          { name: "Home", url: SITE_URL },
          { name: "Showcase", url: CANONICAL },
        ]}
      />
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 py-12 md:py-16">
        <header className="mb-10">
          <p className="text-sm font-medium uppercase tracking-wide text-emerald-600">
            Track B — Public Showcase Mirror
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 md:text-4xl dark:text-slate-100">
            BlockID.au — Live from the Founder Journey
          </h1>
          <p className="mt-4 max-w-3xl text-base text-slate-600 dark:text-slate-400">
            BlockID.au is a real, operating startup building itself in public.
            This page mirrors what our own workspace looks like right now —
            current phase, milestones reported, C-Level agents shipping — so
            you can see what a startup dashboard powered by BlockID actually
            produces. Every artefact you count here was written by the same
            agents you get inside your own workspace.
          </p>
          <p className="mt-2 max-w-3xl text-xs text-slate-500 dark:text-slate-500">
            Metadata only. Report bodies, investor identities, and any
            individual founder&apos;s data stay private — this page follows
            the same redaction rules resellers get on their portfolio lens.
          </p>
        </header>

        <section aria-labelledby="showcase-kpis" className="mb-10">
          <h2 id="showcase-kpis" className="sr-only">
            Showcase KPIs
          </h2>
          <dl className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <dt className="text-slate-500 dark:text-slate-400">Current phase</dt>
              <dd className="mt-1 text-2xl font-semibold text-emerald-600">
                {currentPhase !== null ? `Phase ${currentPhase} / 12` : "—"}
              </dd>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <dt className="text-slate-500 dark:text-slate-400">Reports on file</dt>
              <dd className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                {summary.total_reports}
              </dd>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <dt className="text-slate-500 dark:text-slate-400">Agents shipping</dt>
              <dd className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                {summary.agents_covered}
              </dd>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <dt className="text-slate-500 dark:text-slate-400">Latest activity</dt>
              <dd className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                {formatDate(summary.latest_generated_at)}
              </dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="phase-progress" className="mb-12">
          <div className="mb-4 flex items-baseline justify-between">
            <h2
              id="phase-progress"
              className="text-xl font-semibold text-slate-900 dark:text-slate-100"
            >
              Phase progress — 12-phase founder journey
            </h2>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {crossCutting > 0
                ? `+ ${crossCutting} cross-cutting artefact${crossCutting === 1 ? "" : "s"}`
                : ""}
            </span>
          </div>
          <ol className="grid grid-cols-3 gap-2 md:grid-cols-6 lg:grid-cols-12">
            {phaseCounts.map((entry) => {
              const isCurrent = currentPhase === entry.phase;
              const isActive = entry.count > 0;
              return (
                <li
                  key={entry.phase}
                  className={
                    "rounded-md border p-2 text-center text-xs " +
                    (isCurrent
                      ? "border-emerald-500 bg-emerald-50 dark:border-emerald-400 dark:bg-emerald-950/40"
                      : isActive
                        ? "border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900"
                        : "border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-600")
                  }
                >
                  <div className="text-[10px] font-mono uppercase tracking-wide text-slate-500">
                    Phase {entry.phase}
                  </div>
                  <div className="mt-1 truncate font-semibold text-slate-900 dark:text-slate-100">
                    {entry.label}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    {entry.count} artefact{entry.count === 1 ? "" : "s"}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <section aria-labelledby="agent-activity" className="mb-12">
          <h2
            id="agent-activity"
            className="mb-4 text-xl font-semibold text-slate-900 dark:text-slate-100"
          >
            C-Level agent activity
          </h2>
          {agentActivity.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No agent artefacts yet. Check back shortly.
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {agentActivity.map((entry) => (
                <li
                  key={entry.agent}
                  className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {entry.label}
                    </span>
                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                      {entry.count}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    Latest: {formatDate(entry.latest_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="milestone-timeline" className="mb-12">
          <div className="mb-4 flex items-baseline justify-between">
            <h2
              id="milestone-timeline"
              className="text-xl font-semibold text-slate-900 dark:text-slate-100"
            >
              Milestone timeline
            </h2>
            {milestoneState.lastRun && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                State updated {formatDate(milestoneState.lastRun)}
              </span>
            )}
          </div>
          {timeline.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No milestones reported yet.
            </p>
          ) : (
            <ol className="space-y-2">
              {timeline.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900"
                >
                  <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    #{entry.order}
                  </span>
                  <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {entry.id}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <aside className="mt-16 rounded-lg border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-800/40 dark:bg-emerald-950/30">
          <h2 className="text-base font-semibold text-emerald-900 dark:text-emerald-200">
            See what your own showcase would look like
          </h2>
          <p className="mt-2 text-sm text-emerald-800 dark:text-emerald-300">
            The same 12-phase journey, milestone tracker, and C-Level agent
            panel is available inside every BlockID workspace. Score your
            idea, invite your team, and start publishing your own progress.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/svi"
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              Score my startup
            </Link>
            <Link
              href="/guide/reports"
              className="rounded-md border border-emerald-600 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:text-emerald-300"
            >
              Browse report templates
            </Link>
          </div>
        </aside>
      </main>
      <Footer />
    </>
  );
}
