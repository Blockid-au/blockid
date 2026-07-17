// /workspace/investor/digest — weekly watchlist digest archive.
//
// Server component. Reads the last 20 rows the digest cron has written for
// this investor from `watchlist_digest` (may not exist on all installs) and
// groups them into ISO-week buckets. Falls back to a friendly "your first
// digest arrives Monday" message when the table is missing or empty.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { FeatureGate } from "@/components/access/FeatureGate";
import { NotFinancialAdvice } from "@/components/legal/not-financial-advice";
import { getSupabaseAdmin } from "@/lib/supabase";

export const metadata: Metadata = {
  title: "Weekly Digest | Investor Workspace | BlockID",
  description:
    "Weekly SVI movement and new comparable deals across your watchlist.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Digest row — canonical shape emitted by the digest cron. The table may not
// exist on legacy installs; we catch the "relation does not exist" case and
// return an empty list so the fallback state renders.
// ---------------------------------------------------------------------------

interface DigestRow {
  id: string;
  sent_at: string;
  summary_md: string | null;
  tickers: string[];
}

async function loadDigests(userId: string): Promise<{
  rows: DigestRow[];
  tableMissing: boolean;
}> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { rows: [], tableMissing: false };

  try {
    const { data, error } = await supabase
      .from("watchlist_digest")
      .select("id, sent_at, summary_md, tickers")
      .eq("account_id", userId)
      .order("sent_at", { ascending: false })
      .limit(20);

    if (error) {
      const msg = error.message ?? "";
      if (/relation.*watchlist_digest.*does not exist/i.test(msg)) {
        return { rows: [], tableMissing: true };
      }
      console.error("[blockid:investor-digest] read failed", error);
      return { rows: [], tableMissing: false };
    }

    const rows = ((data as Array<{
      id: string;
      sent_at: string;
      summary_md: string | null;
      tickers: string[] | null;
    }> | null) ?? []).map((r) => ({
      id: r.id,
      sent_at: r.sent_at,
      summary_md: r.summary_md,
      tickers: Array.isArray(r.tickers) ? r.tickers : [],
    }));

    return { rows, tableMissing: false };
  } catch (err) {
    console.error("[blockid:investor-digest] read threw", err);
    return { rows: [], tableMissing: true };
  }
}

// ---------------------------------------------------------------------------
// ISO week bucket key — used to group digests by the Monday of their week.
// ---------------------------------------------------------------------------

function isoWeekKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  // Move to Monday of the ISO week.
  const day = d.getUTCDay() || 7; // Sun = 0 → 7
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - (day - 1));
  return monday.toISOString().slice(0, 10);
}

function formatWeekLabel(mondayIso: string): string {
  if (mondayIso === "unknown") return "Undated";
  const d = new Date(mondayIso);
  if (Number.isNaN(d.getTime())) return mondayIso;
  return `Week of ${d.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })}`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-AU", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function InvestorDigestPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/investor/digest");

  const { rows, tableMissing } = await loadDigests(user.id);

  // Group by ISO week.
  const weeks = new Map<string, DigestRow[]>();
  for (const r of rows) {
    const key = isoWeekKey(r.sent_at);
    const list = weeks.get(key) ?? [];
    list.push(r);
    weeks.set(key, list);
  }
  const orderedKeys = Array.from(weeks.keys()).sort((a, b) =>
    a < b ? 1 : a > b ? -1 : 0,
  );

  return (
    <WorkspaceLayout user={user}>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <header>
          <nav
            aria-label="Breadcrumb"
            className="mb-1 text-xs text-slate-500 dark:text-slate-400"
          >
            <Link
              href="/workspace/investor"
              className="hover:text-slate-700 dark:hover:text-slate-300"
            >
              Investor Workspace
            </Link>
            <span aria-hidden="true"> / </span>
            <span className="text-slate-700 dark:text-slate-300">
              Weekly Digest
            </span>
          </nav>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            Weekly Digest
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Score moves on your watchlist plus fresh comparable deals in your
            preferred bands. Delivered Monday 09:00 AEST.
          </p>
        </header>

        <FeatureGate feature="watchlist" label="Weekly Digest">
          {rows.length === 0 ? (
            <EmptyState tableMissing={tableMissing} />
          ) : (
            <ol className="space-y-6" aria-label="Digest timeline">
              {orderedKeys.map((weekKey) => {
                const entries = weeks.get(weekKey) ?? [];
                return (
                  <li key={weekKey}>
                    <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {formatWeekLabel(weekKey)}
                    </h2>
                    <div className="space-y-3">
                      {entries.map((entry) => (
                        <article
                          key={entry.id}
                          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              Sent {formatDateTime(entry.sent_at)}
                            </p>
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              {entry.tickers.length}{" "}
                              {entry.tickers.length === 1
                                ? "ticker"
                                : "tickers"}
                            </span>
                          </div>
                          {entry.summary_md ? (
                            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                              {entry.summary_md}
                            </p>
                          ) : (
                            <p className="mt-3 text-sm italic text-slate-500 dark:text-slate-400">
                              No summary was recorded for this digest.
                            </p>
                          )}
                          {entry.tickers.length > 0 && (
                            <div className="mt-4 flex flex-wrap gap-2">
                              {entry.tickers.map((t) => (
                                <Link
                                  key={t}
                                  href={`/listings/${encodeURIComponent(t)}`}
                                  className="inline-flex items-center rounded-full border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                                >
                                  {t}
                                </Link>
                              ))}
                            </div>
                          )}
                        </article>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          <NotFinancialAdvice kind="not_financial_advice" compact />
        </FeatureGate>
      </div>
    </WorkspaceLayout>
  );
}

function EmptyState({ tableMissing }: { tableMissing: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/40 p-8 text-center">
      <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
        Your first digest arrives Monday 09:00 AEST — it summarises score
        moves + new comparable deals in your bands.
      </p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Add tickers to your watchlist so the cron has something to report on.
      </p>
      {tableMissing && (
        <p className="mt-2 text-[11px] text-slate-400 italic">
          Digest history table is not yet provisioned on this environment.
        </p>
      )}
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Link
          href="/workspace/investor/watchlist"
          className="inline-flex items-center rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-3 py-2 text-xs font-semibold"
        >
          Open watchlist
        </Link>
        <Link
          href="/workspace/investor/preferences"
          className="inline-flex items-center rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          Refine preferences
        </Link>
      </div>
    </div>
  );
}
