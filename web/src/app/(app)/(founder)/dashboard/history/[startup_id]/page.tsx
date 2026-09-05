import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Calendar, ChevronDown } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Analysis History | BlockID",
  robots: { index: false, follow: false },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(s: number) {
  return s >= 70 ? "text-green-400" : s >= 45 ? "text-amber-400" : "text-red-400";
}

function scoreBorderBg(s: number) {
  return s >= 70
    ? "border-green-400/30 bg-green-400/5"
    : s >= 45
    ? "border-amber-400/30 bg-amber-400/5"
    : "border-red-400/30 bg-red-400/5";
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

function fmtDateTime(s: string) {
  return new Date(s).toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sourceLabel(source: string | null | undefined) {
  if (!source) return "blockid";
  return source.toLowerCase().includes("svi") ? "svi" : "blockid";
}

// ── Sub-score dimensions ──────────────────────────────────────────────────────

// Known SVI dimension keys → friendly labels
const DIMENSION_LABELS: Record<string, string> = {
  FTV: "Founder",
  MPC: "Market",
  PTD: "Product",
  TRE: "Traction",
  CGH: "Growth",
  IRI: "IP / Moat",
  LCO: "Legal",
  SVM: "Scalability",
  // Fallbacks for blockid-style keys
  founder: "Founder",
  market: "Market",
  product: "Product",
  traction: "Traction",
  growth: "Growth",
  ip: "IP / Moat",
  legal: "Legal",
  scalability: "Scalability",
};

function SubScoreBar({
  label,
  value,
  max = 100,
}: {
  label: string;
  value: number;
  max?: number;
}) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  const barColor =
    pct >= 70 ? "bg-green-400" : pct >= 45 ? "bg-amber-400" : "bg-red-400";

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-[#94A3B8]">{label}</span>
        <span className={`text-[11px] font-semibold tabular-nums ${scoreColor(pct)}`}>
          {value}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-[rgba(255,255,255,0.06)] overflow-hidden">
        <div
          className={`h-full rounded-full ${barColor} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
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
  sub_scores: Record<string, number> | null | any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputs: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  svi_analysis?: any;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function StartupHistoryPage({
  params,
}: {
  params: Promise<{ startup_id: string }>;
}) {
  const sid = decodeURIComponent((await params).startup_id);

  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/dashboard/history");

  const isSandbox = await getCurrentProjectIsSandbox();
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    redirect("/dashboard/history");
  }

  const { data: rawEntries } = await supabase
    .from("startup_score_history")
    .select("*")
    .eq("user_id", user.id)
    .eq("startup_id", sid)
    .order("created_at", { ascending: false });

  const entries = (rawEntries ?? []) as RawEntry[];

  if (entries.length === 0) {
    redirect("/dashboard/history");
  }

  const startupName = entries[0].startup_name;

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="max-w-3xl mx-auto px-6 pb-24 pt-10 space-y-5">
        {/* ── Header ── */}
        <div>
          <Link
            href="/dashboard/history"
            className="inline-flex items-center gap-1.5 text-sm text-[#94A3B8] hover:text-white transition-colors mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Score History
          </Link>

          <h1 className="text-2xl font-bold text-white">{startupName}</h1>
          <p className="text-sm text-[#94A3B8] mt-1">
            Analysis History &mdash; {entries.length} record{entries.length !== 1 ? "s" : ""}
          </p>
        </div>

        {/* ── Entry cards ── */}
        {entries.map((entry, idx) => {
          const src = sourceLabel(entry.source);
          const latestLow = fmtAud(entry.valuation_low_aud);
          const latestHigh = fmtAud(entry.valuation_high_aud);

          // Sub-scores: try to normalize to { label, value } pairs
          const subScoreEntries = entry.sub_scores
            ? Object.entries(entry.sub_scores as Record<string, number>)
                .filter(([, v]) => typeof v === "number")
                .slice(0, 8)
            : [];

          // SVI analysis content
          const sviAnalysis = entry.svi_analysis ?? entry.inputs?.svi_analysis ?? null;
          const executiveSummary: string | null =
            sviAnalysis?.executiveSummary ??
            sviAnalysis?.executive_summary ??
            null;
          const topPriorities: string[] =
            sviAnalysis?.topThreePriorities ??
            sviAnalysis?.top_three_priorities ??
            [];

          return (
            <div
              key={entry.id}
              className="rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] overflow-hidden"
            >
              {/* ── Entry header ── */}
              <div
                className={`flex items-start justify-between gap-4 px-6 py-4 border-b border-[rgba(255,255,255,0.06)]`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <Calendar className="h-3.5 w-3.5 text-[#94A3B8] shrink-0" />
                    <span className="text-sm text-white font-medium">
                      {fmtDateTime(entry.created_at)}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium border ${
                        src === "svi"
                          ? "bg-purple-400/10 text-purple-400 border-purple-400/20"
                          : "bg-[rgba(0,212,255,0.08)] text-[#00D4FF] border-[rgba(0,212,255,0.2)]"
                      }`}
                    >
                      {src}
                    </span>
                    {idx === 0 && (
                      <span className="rounded-full bg-amber-400/10 border border-amber-400/20 px-2.5 py-0.5 text-[10px] font-medium text-amber-400">
                        latest
                      </span>
                    )}
                  </div>

                  {(latestLow || latestHigh) && (
                    <p className="text-xs text-[#94A3B8] mt-1">
                      Valuation:{" "}
                      <span className="text-white font-medium">
                        {latestLow && latestHigh
                          ? `${latestLow} – ${latestHigh}`
                          : latestLow ?? latestHigh}
                      </span>
                    </p>
                  )}

                  <p className="text-xs text-[#94A3B8] mt-0.5">
                    {fmtDate(entry.created_at)}
                  </p>
                </div>

                {/* Score badge */}
                <div
                  className={`flex-shrink-0 rounded-xl border px-4 py-2 text-center ${scoreBorderBg(entry.total_score)}`}
                >
                  <div
                    className={`text-3xl font-bold tabular-nums ${scoreColor(entry.total_score)}`}
                  >
                    {entry.total_score}
                  </div>
                  <div className="text-[10px] text-[#94A3B8] mt-0.5">score</div>
                </div>
              </div>

              {/* ── Sub-scores ── */}
              {subScoreEntries.length > 0 && (
                <div className="px-6 py-4 border-b border-[rgba(255,255,255,0.06)]">
                  <p className="text-[10px] uppercase tracking-wider text-[#94A3B8] mb-3">
                    Dimension scores
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                    {subScoreEntries.map(([key, val]) => (
                      <SubScoreBar
                        key={key}
                        label={DIMENSION_LABELS[key] ?? key}
                        value={val}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* ── SVI analysis collapsible (executive summary + priorities) ── */}
              {(executiveSummary || topPriorities.length > 0) && (
                <details className="group px-6 py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wider text-[#94A3B8]">
                      Executive summary & priorities
                    </span>
                    <ChevronDown className="h-4 w-4 text-[#94A3B8] transition-transform group-open:rotate-180" />
                  </summary>

                  <div className="mt-4 space-y-4">
                    {executiveSummary && (
                      <div>
                        <p className="text-xs font-medium text-white mb-1.5">
                          Executive Summary
                        </p>
                        <p className="text-sm text-[#94A3B8] leading-relaxed">
                          {executiveSummary}
                        </p>
                      </div>
                    )}

                    {topPriorities.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-white mb-2">
                          Top Priorities
                        </p>
                        <ol className="space-y-1.5">
                          {topPriorities.map((p, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <span className="flex-shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400/10 border border-amber-400/20 text-[10px] font-bold text-amber-400 mt-0.5">
                                {i + 1}
                              </span>
                              <span className="text-sm text-[#94A3B8] leading-relaxed">{p}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </div>
                </details>
              )}
            </div>
          );
        })}
      </div>
    </WorkspaceLayout>
  );
}
