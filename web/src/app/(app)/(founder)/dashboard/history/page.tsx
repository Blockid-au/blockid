import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { TrendingUp, Clock, ArrowRight, BarChart3, Zap } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Score History | BlockID",
  robots: { index: false, follow: false },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(s: number) {
  return s >= 70 ? "text-green-400" : s >= 45 ? "text-amber-400" : "text-red-400";
}

function scoreBg(s: number) {
  return s >= 70
    ? "bg-green-400/10 border-green-400/30"
    : s >= 45
    ? "bg-amber-400/10 border-amber-400/30"
    : "bg-red-400/10 border-red-400/30";
}

function fmtAud(n: number | null | undefined): string | null {
  if (!n) return null;
  return n >= 1_000_000
    ? `A$${(n / 1_000_000).toFixed(1)}M`
    : `A$${(n / 1_000).toFixed(0)}K`;
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function sourceLabel(source: string | null | undefined) {
  if (!source) return "blockid";
  return source.toLowerCase().includes("svi") ? "svi" : "blockid";
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface RawEntry {
  id: string;
  startup_id: string;
  startup_name: string;
  total_score: number;
  valuation_low_aud: number | null;
  valuation_high_aud: number | null;
  source: string | null;
  created_at: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sub_scores: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputs: any;
}

interface StartupGroup {
  startup_id: string;
  startup_name: string;
  entries: RawEntry[]; // newest first
}

// ── Server Component ──────────────────────────────────────────────────────────

export default async function ScoreHistoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/dashboard/history");

  const isSandbox = await getCurrentProjectIsSandbox();
  const supabase = getSupabaseAdmin();

  // ── DB not configured ────────────────────────────────────────────────────
  if (!supabase) {
    return (
      <WorkspaceLayout user={user} isSandbox={isSandbox}>
        <div className="max-w-4xl mx-auto px-6 py-12 text-center">
          <p className="text-[#94A3B8] text-sm">
            Database is not configured. Score history is unavailable.
          </p>
        </div>
      </WorkspaceLayout>
    );
  }

  // ── Fetch ────────────────────────────────────────────────────────────────
  const { data: rawEntries } = await supabase
    .from("startup_score_history")
    .select(
      "id, startup_id, startup_name, total_score, valuation_low_aud, valuation_high_aud, source, created_at, sub_scores, inputs"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  // ── Group by startup_id ──────────────────────────────────────────────────
  const groupMap = new Map<string, StartupGroup>();
  for (const entry of (rawEntries ?? []) as RawEntry[]) {
    if (!groupMap.has(entry.startup_id)) {
      groupMap.set(entry.startup_id, {
        startup_id: entry.startup_id,
        startup_name: entry.startup_name,
        entries: [],
      });
    }
    groupMap.get(entry.startup_id)!.entries.push(entry);
  }
  const groups = Array.from(groupMap.values());

  // ── Empty state ──────────────────────────────────────────────────────────
  if (groups.length === 0) {
    return (
      <WorkspaceLayout user={user} isSandbox={isSandbox}>
        <div className="max-w-4xl mx-auto px-6 pb-24 pt-10">
          <PageHeader />
          <div className="mt-8 rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-10 text-center">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-400/10 border border-amber-400/20 mb-4">
              <BarChart3 className="h-7 w-7 text-amber-400" />
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">No analyses yet</h2>
            <p className="text-[#94A3B8] text-sm mb-6 max-w-sm mx-auto">
              Run your first startup score to see your valuation journey and investment readiness
              trend tracked over time.
            </p>
            <Link
              href="/score"
              className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-amber-300 transition-colors"
            >
              <Zap className="h-4 w-4" />
              Get Your Score
            </Link>
          </div>
        </div>
      </WorkspaceLayout>
    );
  }

  // ── Main render ──────────────────────────────────────────────────────────
  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="max-w-4xl mx-auto px-6 pb-24 pt-10 space-y-6">
        <PageHeader count={groups.length} />

        {groups.map((group) => {
          const latest = group.entries[0];
          const oldest = group.entries[group.entries.length - 1];
          const delta =
            group.entries.length > 1
              ? latest.total_score - oldest.total_score
              : null;

          // Trend: oldest → newest (last 5 scores)
          const trend = [...group.entries]
            .reverse()
            .slice(-5)
            .map((e) => e.total_score);

          const latestLow = fmtAud(latest.valuation_low_aud);
          const latestHigh = fmtAud(latest.valuation_high_aud);
          const stage = latest.inputs?.stage as string | null | undefined;

          // Last 3 for the mini list
          const recent3 = group.entries.slice(0, 3);

          return (
            <div
              key={group.startup_id}
              className="rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] hover:border-[rgba(255,255,255,0.14)] transition-all duration-200 overflow-hidden"
            >
              {/* ── Card Header ── */}
              <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-[rgba(255,255,255,0.06)]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h2 className="text-xl font-bold text-white truncate">
                      {group.startup_name}
                    </h2>
                    {stage && (
                      <span className="rounded-full bg-[rgba(0,212,255,0.12)] border border-[rgba(0,212,255,0.25)] px-2.5 py-0.5 text-[11px] font-medium text-[#00D4FF] capitalize whitespace-nowrap">
                        {stage}
                      </span>
                    )}
                    <span className="rounded-full bg-[rgba(255,255,255,0.06)] px-2.5 py-0.5 text-[11px] font-medium text-[#94A3B8] whitespace-nowrap">
                      {group.entries.length} {group.entries.length === 1 ? "analysis" : "analyses"}
                    </span>
                  </div>

                  {/* Valuation range */}
                  {(latestLow || latestHigh) && (
                    <p className="text-sm text-[#94A3B8]">
                      <span className="text-white font-medium">
                        {latestLow && latestHigh
                          ? `${latestLow} – ${latestHigh}`
                          : latestLow ?? latestHigh}
                      </span>
                      <span className="ml-1.5">valuation range</span>
                    </p>
                  )}
                </div>

                {/* Big score */}
                <div
                  className={`flex-shrink-0 rounded-xl border px-4 py-2 text-center ${scoreBg(latest.total_score)}`}
                >
                  <div className={`text-3xl font-bold tabular-nums ${scoreColor(latest.total_score)}`}>
                    {latest.total_score}
                  </div>
                  <div className="text-[10px] text-[#94A3B8] mt-0.5">current</div>
                </div>
              </div>

              {/* ── Trend + delta ── */}
              <div className="px-6 py-4 border-b border-[rgba(255,255,255,0.06)] flex flex-wrap items-center gap-6">
                {trend.length > 1 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-[#94A3B8] mb-1.5">
                      Score trend
                    </p>
                    <div className="flex items-center gap-1.5">
                      {trend.map((s, i) => (
                        <span key={i} className={`text-sm font-semibold tabular-nums ${scoreColor(s)}`}>
                          {s}
                          {i < trend.length - 1 && (
                            <span className="text-[#94A3B8]/50 mx-0.5">→</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {delta !== null && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-[#94A3B8] mb-1.5">
                      Total change
                    </p>
                    <span
                      className={`text-sm font-bold tabular-nums ${
                        delta > 0
                          ? "text-green-400"
                          : delta < 0
                          ? "text-red-400"
                          : "text-[#94A3B8]"
                      }`}
                    >
                      {delta > 0 ? "+" : ""}
                      {delta}
                    </span>
                  </div>
                )}
              </div>

              {/* ── Recent entries list ── */}
              <div className="px-6 py-3">
                <p className="text-[10px] uppercase tracking-wider text-[#94A3B8] mb-3">
                  Recent analyses
                </p>
                <ul className="space-y-2">
                  {recent3.map((entry) => {
                    const src = sourceLabel(entry.source);
                    return (
                      <li key={entry.id} className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <Clock className="h-3.5 w-3.5 text-[#94A3B8] shrink-0" />
                          <span className="text-sm text-[#94A3B8] truncate">
                            {fmtDate(entry.created_at)}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              src === "svi"
                                ? "bg-purple-400/10 text-purple-400 border border-purple-400/20"
                                : "bg-[rgba(0,212,255,0.08)] text-[#00D4FF] border border-[rgba(0,212,255,0.2)]"
                            }`}
                          >
                            {src}
                          </span>
                        </div>
                        <span className={`text-sm font-semibold tabular-nums ${scoreColor(entry.total_score)}`}>
                          {entry.total_score}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* ── Footer link ── */}
              <div className="px-6 py-4">
                <Link
                  href={`/dashboard/history/${encodeURIComponent(group.startup_id)}`}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-[#00D4FF] hover:text-white transition-colors"
                >
                  View full history
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </WorkspaceLayout>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PageHeader({ count }: { count?: number }) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <TrendingUp className="h-6 w-6 text-amber-400" />
          <h1 className="text-2xl font-bold text-white">Score History</h1>
          {count != null && count > 0 && (
            <span className="rounded-full bg-[rgba(255,255,255,0.06)] px-2.5 py-0.5 text-xs font-medium text-[#94A3B8]">
              {count} startup{count !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <p className="text-sm text-[#94A3B8]">
          Track your startup&apos;s valuation journey and investment readiness over time.
        </p>
      </div>
      <Link
        href="/score"
        className="inline-flex items-center gap-2 rounded-xl bg-amber-400/10 border border-amber-400/30 px-4 py-2 text-sm font-medium text-amber-400 hover:bg-amber-400/20 transition-colors"
      >
        <Zap className="h-4 w-4" />
        New Analysis
      </Link>
    </div>
  );
}
