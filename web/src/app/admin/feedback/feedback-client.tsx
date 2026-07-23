"use client";

import * as React from "react";
import { MessageSquare, Search, Sparkles } from "lucide-react";
import { AdminLayout } from "@/components/admin/admin-layout";
import { SandboxScopeChip } from "@/components/admin/sandbox-scope-chip";
// D3-CISO-05: sandbox scope chip is display-only on /admin/feedback —
// user_feedback rows have no sandbox column.
// no sandbox column on user_feedback — chip is display-only for future consistency

export interface FeedbackRow {
  id: string;
  user_id: string;
  email: string | null;
  feedback: string;
  category: string | null;
  page: string | null;
  ai_score: number;
  ai_summary: string | null;
  credits_awarded: number;
  status: string;
  created_at: string;
}

export interface FeedbackStats {
  total: number;
  rewarded: number;
  creditsGranted: number;
  avgScore: number;
  last7dCount: number;
  last7dCredits: number;
}

interface Props {
  user: { email: string; displayName: string | null };
  initialRows: FeedbackRow[];
  stats: FeedbackStats;
}

const CATEGORIES = ["all", "general", "bug", "feature", "pricing", "ux"];

export function FeedbackClient({ user, initialRows, stats }: Props) {
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState("all");
  const [minScore, setMinScore] = React.useState(0);

  const filtered = React.useMemo(() => {
    return initialRows.filter((r) => {
      if (category !== "all" && (r.category ?? "general") !== category) return false;
      if (Number(r.ai_score || 0) < minScore) return false;
      if (query) {
        const q = query.toLowerCase();
        const hay = `${r.feedback} ${r.ai_summary ?? ""} ${r.email ?? ""} ${r.page ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [initialRows, query, category, minScore]);

  return (
    <AdminLayout user={user}>
      <div className="px-6 py-6 space-y-6">
        <header className="flex items-center gap-3">
          <MessageSquare className="h-5 w-5 text-brand-600" strokeWidth={1.75} />
          <div>
            <h1 className="text-xl font-semibold text-ink-900">User Feedback</h1>
            <p className="text-sm text-ink-600">AI-graded feedback &amp; credits granted (last 30 days)</p>
          </div>
        </header>

        <SandboxScopeChip
          scope="all"
          note="Chip-only — user_feedback has no sandbox column."
        />

        <section className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <Stat label="Total (30d)" value={stats.total} />
          <Stat label="Rewarded" value={stats.rewarded} />
          <Stat label="Credits granted" value={stats.creditsGranted.toFixed(2)} />
          <Stat label="Avg score (/30)" value={stats.avgScore.toFixed(1)} />
          <Stat label="Last 7d count" value={stats.last7dCount} />
          <Stat label="Last 7d credits" value={stats.last7dCredits.toFixed(2)} />
        </section>

        <section className="bg-white border border-surface-200 rounded-lg p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" strokeWidth={1.75} />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search feedback, summary, email, page…"
                className="w-full pl-9 pr-3 py-2 text-sm border border-surface-200 rounded-md focus:outline-none focus:border-brand-500 bg-surface-50"
              />
            </div>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="px-3 py-2 text-sm border border-surface-200 rounded-md bg-white"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c === "all" ? "All categories" : c}</option>
              ))}
            </select>
            <select
              value={String(minScore)}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="px-3 py-2 text-sm border border-surface-200 rounded-md bg-white"
            >
              <option value="0">Any score</option>
              <option value="15">Score ≥ 15</option>
              <option value="20">Score ≥ 20</option>
              <option value="25">Score ≥ 25</option>
            </select>
            <span className="text-xs text-ink-500">{filtered.length} shown</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-ink-500 uppercase tracking-wide">
                <tr className="border-b border-surface-200">
                  <th className="text-left py-2 px-2">When</th>
                  <th className="text-left py-2 px-2">User</th>
                  <th className="text-left py-2 px-2">Cat</th>
                  <th className="text-left py-2 px-2">Feedback / AI summary</th>
                  <th className="text-right py-2 px-2">Score</th>
                  <th className="text-right py-2 px-2">Credits</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={6} className="py-6 text-center text-ink-500">No feedback matches.</td></tr>
                ) : filtered.map((r) => (
                  <tr key={r.id} className="border-b border-surface-100 hover:bg-surface-50/60 align-top">
                    <td className="py-2 px-2 text-xs text-ink-500 whitespace-nowrap">{formatDate(r.created_at)}</td>
                    <td className="py-2 px-2 text-xs text-ink-700 max-w-[160px] truncate" title={r.email ?? ""}>{r.email ?? r.user_id.slice(0, 8)}</td>
                    <td className="py-2 px-2 text-xs"><span className="px-1.5 py-0.5 rounded bg-surface-100 text-ink-700">{r.category ?? "general"}</span></td>
                    <td className="py-2 px-2 text-ink-800 max-w-[520px]">
                      <p className="line-clamp-2">{r.feedback}</p>
                      {r.ai_summary && (
                        <p className="mt-1 text-xs text-brand-700 flex items-start gap-1">
                          <Sparkles className="h-3 w-3 mt-0.5 shrink-0" strokeWidth={1.75} />
                          <span className="italic">{r.ai_summary}</span>
                        </p>
                      )}
                      {r.page && <p className="mt-1 text-[11px] text-ink-400">{r.page}</p>}
                    </td>
                    <td className="py-2 px-2 text-right font-mono text-xs">
                      <span className={scoreClass(Number(r.ai_score || 0))}>{Number(r.ai_score || 0)}</span>
                      <span className="text-ink-400">/30</span>
                    </td>
                    <td className="py-2 px-2 text-right font-mono text-xs">
                      {Number(r.credits_awarded) > 0
                        ? <span className="text-emerald-700">+{Number(r.credits_awarded).toFixed(2)}</span>
                        : <span className="text-ink-400">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-white border border-surface-200 rounded-lg px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-ink-500">{label}</div>
      <div className="text-xl font-semibold text-ink-900 mt-0.5">{value}</div>
    </div>
  );
}

function scoreClass(s: number): string {
  if (s >= 25) return "text-emerald-700 font-semibold";
  if (s >= 20) return "text-brand-700";
  if (s >= 15) return "text-ink-700";
  return "text-ink-400";
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-AU", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}
