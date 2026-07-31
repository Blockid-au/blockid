// /workspace/investor — hub page for the Investor Workspace.
//
// Layout: three-column grid (Deal Flow Inbox | Watchlist | Portfolio).
// Each column is a mini-panel with a jump link into the full page.
// Gated by feature='investor.dealflow' — the FeatureGate client wrapper
// renders an upgrade CTA for founder-track users who hit this URL directly.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { FeatureGate } from "@/components/access/FeatureGate";
import {
  getDealFlow,
  getWatchlist,
  getPortfolio,
  readWatchlistTag,
} from "@/lib/investor-portal";
import { getCurrentProjectIsSandbox } from "@/lib/projects";

export const metadata: Metadata = {
  title: "Investor Workspace | BlockID",
  description:
    "Deal flow, watchlist, and portfolio management for investors on BlockID.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function InvestorWorkspacePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/investor");

  const isSandbox = await getCurrentProjectIsSandbox();

  // Fetch all three columns in parallel — server-side, single round trip.
  const [dealflow, watchlist, portfolio] = await Promise.all([
    getDealFlow(user.id, { limit: 5 }),
    getWatchlist(user.id),
    getPortfolio(user.id),
  ]);

  const upgradeV2 = process.env.NEXT_PUBLIC_UPGRADE_V2 === "true";

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
                Investor Workspace
              </h1>
              <span className="inline-flex items-center rounded-full border border-brand-300 bg-brand-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-700 dark:border-brand-700 dark:bg-brand-950/40 dark:text-brand-300">
                Beta
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Curated deal flow, private watchlist, and portfolio tracking.
            </p>
          </div>
          <Link
            href="/workspace/investor/dealflow"
            className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-3 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >
            Open Deal Flow
          </Link>
        </header>

        <FeatureGate feature="investor.dealflow" label="Investor Workspace">
          <div className="grid gap-6 lg:grid-cols-3">
            <ColumnDealFlow rows={dealflow} upgradeV2={upgradeV2} />
            <ColumnWatchlist rows={watchlist} />
            <ColumnPortfolio rows={portfolio} />
          </div>
        </FeatureGate>
      </div>
    </WorkspaceLayout>
  );
}

// ---------------------------------------------------------------------------
// Column: Deal Flow — top 5 preference-matched startups.
// ---------------------------------------------------------------------------

function ColumnDealFlow({
  rows,
  upgradeV2,
}: {
  rows: Awaited<ReturnType<typeof getDealFlow>>;
  upgradeV2: boolean;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col">
      <header className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Deal Flow Inbox
        </h2>
        <Link
          href="/workspace/investor/dealflow"
          className="text-xs text-brand-600 hover:text-brand-700 font-medium"
        >
          View all
        </Link>
      </header>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          No matches yet — set your{" "}
          <Link href="/workspace/investor/dealflow" className="underline">
            preferences
          </Link>{" "}
          to seed the feed.
        </p>
      ) : (
        <ul className="space-y-2 flex-1">
          {rows.slice(0, 5).map((r) => (
            <li
              key={r.score_id}
              className="rounded-lg border border-slate-100 dark:border-slate-800 p-3 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                  {r.company_name ?? "Untitled startup"}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {(r.stage ?? "—")} · {(r.sector ?? "—")} · {r.jurisdiction ?? "AU"}
                </p>
              </div>
              <SviBadge score={r.total_score} />
            </li>
          ))}
        </ul>
      )}
      {!upgradeV2 && (
        <p className="mt-4 text-[11px] text-slate-400 italic">
          Preview — upgrade v2 UI is disabled on this environment.
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Column: Watchlist — grouped by tag.
// ---------------------------------------------------------------------------

function ColumnWatchlist({
  rows,
}: {
  rows: Awaited<ReturnType<typeof getWatchlist>>;
}) {
  const following = rows.filter((r) => readWatchlistTag(r.notes) === "following").length;
  const contacted = rows.filter((r) => readWatchlistTag(r.notes) === "contacted").length;
  const passed = rows.filter((r) => readWatchlistTag(r.notes) === "passed").length;

  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col">
      <header className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Watchlist
        </h2>
        <Link
          href="/workspace/investor/watchlist"
          className="text-xs text-brand-600 hover:text-brand-700 font-medium"
        >
          Open
        </Link>
      </header>
      <div className="grid grid-cols-3 gap-3 flex-1">
        <StatTile label="Following" value={following} />
        <StatTile label="Contacted" value={contacted} />
        <StatTile label="Passed" value={passed} />
      </div>
      {rows.length === 0 && (
        <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
          Add startups from the Deal Flow tab to start building your watchlist.
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Column: Portfolio — gated by feature='investor.portfolio'.
// ---------------------------------------------------------------------------

function ColumnPortfolio({
  rows,
}: {
  rows: Awaited<ReturnType<typeof getPortfolio>>;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col">
      <header className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Portfolio
        </h2>
        <Link
          href="/workspace/investor/portfolio"
          className="text-xs text-brand-600 hover:text-brand-700 font-medium"
        >
          Open
        </Link>
      </header>
      <FeatureGate feature="portfolio" label="Portfolio tracking">
        {rows.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            No holdings yet. Log an investment to start quarterly reporting.
          </p>
        ) : (
          <ul className="space-y-2 flex-1">
            {rows.slice(0, 5).map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 dark:border-slate-800 p-3"
              >
                <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                  {r.company_name}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {r.ownership_pct != null ? `${r.ownership_pct.toFixed(2)}%` : "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </FeatureGate>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Shared small components
// ---------------------------------------------------------------------------

function SviBadge({ score }: { score: number }) {
  const tone =
    score >= 80
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
      : score >= 60
      ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
      : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}
    >
      SVI {score}
    </span>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 p-3 text-center">
      <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
        {value}
      </p>
      <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </p>
    </div>
  );
}
