// /workspace/investor/watchlist — full watchlist view.
//
// Server component. Two-column layout: a list of watchlist rows on the left
// (ticker, added_at, current SVI, delta since add), and a notes/tags editor
// stub on the right that links out to the listing page where tags are set.
// Ticker add form posts to /api/watchlist which handles insert + validation.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { FeatureGate } from "@/components/access/FeatureGate";
import { NotFinancialAdvice } from "@/components/legal/not-financial-advice";
import {
  getWatchlist,
  readWatchlistTag,
  type WatchlistTag,
} from "@/lib/investor-portal";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { DOSSIER_ALIAS_PATH, resolveWatchlistProjectIds } from "@/lib/evaluations/dossier";

export const metadata: Metadata = {
  title: "Watchlist | Investor Workspace | BlockID",
  description:
    "Your private list of tracked startup tickers with score deltas.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Ticker → latest score lookup. We resolve current SVI + baseline (score at
// the time the ticker was added) so the UI can show a delta.
// ---------------------------------------------------------------------------

interface ScoreSnapshot {
  currentScore: number | null;
  addedScore: number | null;
}

async function fetchTickerScores(
  tickers: string[],
): Promise<Map<string, ScoreSnapshot>> {
  const map = new Map<string, ScoreSnapshot>();
  if (!tickers.length) return map;
  const supabase = getSupabaseAdmin();
  if (!supabase) return map;

  try {
    const { data } = await supabase
      .from("svi_index_snapshots")
      .select("ticker, current_score, snapshot_date")
      .in("ticker", tickers)
      .order("snapshot_date", { ascending: false });

    const seen = new Set<string>();
    for (const row of (data as Array<{
      ticker: string;
      current_score: number | null;
      snapshot_date: string;
    }> | null) ?? []) {
      if (seen.has(row.ticker)) continue;
      seen.add(row.ticker);
      map.set(row.ticker, {
        currentScore: row.current_score ?? null,
        addedScore: null,
      });
    }
  } catch {
    // svi_index_snapshots may not have a ticker column on legacy installs.
  }
  return map;
}

export default async function InvestorWatchlistPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/investor/watchlist");

  const isSandbox = await getCurrentProjectIsSandbox();

  const rows = await getWatchlist(user.id);
  // G13 S-D1: `watchlist.project_id` (migration 0392) → Investor Dossier
  // deep-link; an empty map until the column exists / is backfilled.
  const [scores, projectIds] = await Promise.all([
    fetchTickerScores(rows.map((r) => r.ticker)),
    resolveWatchlistProjectIds(user.id),
  ]);

  const followingCount = rows.filter(
    (r) => readWatchlistTag(r.notes) === "following",
  ).length;
  const contactedCount = rows.filter(
    (r) => readWatchlistTag(r.notes) === "contacted",
  ).length;
  const passedCount = rows.filter(
    (r) => readWatchlistTag(r.notes) === "passed",
  ).length;

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <nav
              aria-label="Breadcrumb"
              className="mb-1 text-xs text-ink-500"
            >
              <Link
                href="/workspace/investor"
                className="hover:text-ink-700"
              >
                Investor Workspace
              </Link>
              <span aria-hidden="true"> / </span>
              <span className="text-ink-700">
                Watchlist
              </span>
            </nav>
            <h1 className="text-2xl font-semibold text-ink-900">
              Watchlist
            </h1>
            <p className="mt-1 text-sm text-ink-600">
              Private bookmarks — {rows.length}{" "}
              {rows.length === 1 ? "ticker" : "tickers"} tracked
              {rows.length > 0 && (
                <>
                  {" "}
                  ({followingCount} following · {contactedCount} contacted ·{" "}
                  {passedCount} passed)
                </>
              )}
              .
            </p>
          </div>
        </header>

        <FeatureGate feature="watchlist" label="Watchlist">
          <AddTickerForm />

          {rows.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="grid gap-6 lg:grid-cols-3">
              <section className="lg:col-span-2 rounded-2xl border border-surface-200 bg-white overflow-hidden">
                <div className="overflow-auto max-h-[75vh]">
                  <table className="min-w-full text-sm">
                    <thead className="text-left text-[11px] font-semibold uppercase tracking-wider text-secondary [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:border-b [&_th]:border-line-subtle [&_th]:bg-surface-sunken">
                      <tr>
                        <Th>Ticker</Th>
                        <Th>Added</Th>
                        <Th>Tag</Th>
                        <Th className="text-right">Current SVI</Th>
                        <Th className="text-right">Δ since add</Th>
                        <Th className="text-right">Actions</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-100 [&>tr:nth-child(even)]:bg-surface-sunken">
                      {rows.map((r) => {
                        const snap = scores.get(r.ticker);
                        const current = snap?.currentScore ?? null;
                        const baseline = snap?.addedScore ?? null;
                        const delta =
                          current != null && baseline != null
                            ? current - baseline
                            : null;
                        const tag = readWatchlistTag(r.notes);
                        return (
                          <tr
                            key={r.id}
                            className="hover:bg-surface-100"
                          >
                            <Td>
                              <Link
                                href={`/listings/${encodeURIComponent(r.ticker)}`}
                                className="font-semibold text-brand-700 hover:underline"
                              >
                                {r.ticker}
                              </Link>
                            </Td>
                            <Td className="text-ink-500">
                              {formatDate(r.created_at)}
                            </Td>
                            <Td>
                              <TagBadge tag={tag} />
                            </Td>
                            <Td className="text-right">
                              {current != null ? (
                                <SviBadge score={current} />
                              ) : (
                                <span className="text-ink-400">—</span>
                              )}
                            </Td>
                            <Td className="text-right">
                              <DeltaBadge value={delta} />
                            </Td>
                            <Td className="text-right">
                              {projectIds.get(r.ticker) ? (
                                <Link
                                  href={DOSSIER_ALIAS_PATH(projectIds.get(r.ticker) as string)}
                                  className="mr-3 text-xs font-medium text-brand-700 hover:underline"
                                  aria-label={`Open the Investor Dossier for ${r.ticker}`}
                                >
                                  Dossier
                                </Link>
                              ) : null}
                              <Link
                                href={`/listings/${encodeURIComponent(r.ticker)}`}
                                className="text-xs font-medium text-brand-700 hover:underline"
                              >
                                Open
                              </Link>
                            </Td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              <aside className="rounded-2xl border border-surface-200 bg-white p-5">
                <h2 className="text-sm font-semibold text-ink-900">
                  Tags &amp; notes
                </h2>
                <p className="mt-2 text-xs text-ink-500">
                  Tags (following / contacted / passed) and per-ticker notes
                  are edited on each listing page. Click a ticker on the left
                  to open its detail view and update its tag.
                </p>
                <ul className="mt-4 space-y-2 text-xs text-ink-700">
                  <li className="flex items-center gap-2">
                    <TagBadge tag="following" />
                    <span>Active pipeline — you&apos;re evaluating.</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <TagBadge tag="contacted" />
                    <span>Founder reached — awaiting reply.</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <TagBadge tag="passed" />
                    <span>Reviewed and declined for this fund cycle.</span>
                  </li>
                </ul>
                <p className="mt-4 text-[11px] text-ink-400 italic">
                  Bulk tagging arrives with the next digest cycle.
                </p>
              </aside>
            </div>
          )}

          <NotFinancialAdvice kind="not_financial_advice" compact />
        </FeatureGate>
      </div>
    </WorkspaceLayout>
  );
}

// ---------------------------------------------------------------------------
// AddTickerForm — plain HTML form POST to /api/watchlist. The API validates
// the ticker format and dedupes on (account_id, ticker).
// ---------------------------------------------------------------------------

function AddTickerForm() {
  return (
    <form
      action="/api/watchlist"
      method="post"
      className="flex flex-wrap items-center gap-2 rounded-2xl border border-surface-200 bg-white p-4"
    >
      <label
        htmlFor="watchlist-ticker"
        className="text-xs font-semibold uppercase tracking-wide text-ink-500"
      >
        Add ticker
      </label>
      <input
        id="watchlist-ticker"
        name="ticker"
        type="text"
        required
        pattern="[A-Za-z]{1,8}-[A-Za-z0-9]{1,8}"
        placeholder="e.g. FIN-42AC"
        className="min-w-[180px] rounded-lg border border-surface-300 bg-white px-3 py-1.5 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      />
      <button
        type="submit"
        className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
      >
        Add to watchlist
      </button>
      <span className="text-[11px] text-ink-500">
        Tickers follow the format <code>ABC-1234</code>.
      </span>
    </form>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-surface-300 bg-surface-100 p-8 text-center">
      <p className="text-sm font-medium text-ink-800">
        Your watchlist is empty — search a listing and click Add.
      </p>
      <p className="mt-1 text-xs text-ink-500">
        Tickers you save here appear in your weekly digest and portfolio
        deltas.
      </p>
      <div className="mt-4">
        <Link
          href="/workspace/investor/dealflow"
          className="inline-flex items-center rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-3 py-2 text-xs font-semibold"
        >
          Browse deal flow
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-ink-500 ${className}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-4 py-3 align-middle ${className}`}>{children}</td>;
}

function SviBadge({ score }: { score: number }) {
  const tone =
    score >= 80
      ? "bg-emerald-100 text-emerald-800"
      : score >= 60
      ? "bg-amber-100 text-amber-800"
      : "bg-surface-200 text-ink-700";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}
    >
      SVI {score}
    </span>
  );
}

function DeltaBadge({ value }: { value: number | null }) {
  if (value == null) {
    return <span className="text-ink-400">—</span>;
  }
  const rounded = Math.round(value);
  if (rounded === 0) {
    return (
      <span className="text-ink-500 text-xs font-medium">
        0
      </span>
    );
  }
  const positive = rounded > 0;
  const tone = positive
    ? "text-emerald-700"
    : "text-rose-700";
  return (
    <span className={`text-xs font-semibold ${tone}`}>
      {positive ? "+" : ""}
      {rounded}
    </span>
  );
}

function TagBadge({ tag }: { tag: WatchlistTag }) {
  const tone =
    tag === "following"
      ? "bg-blue-100 text-blue-800"
      : tag === "contacted"
      ? "bg-amber-100 text-amber-800"
      : "bg-surface-300 text-ink-700";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone}`}
    >
      {tag}
    </span>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
