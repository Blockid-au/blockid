// /admin/analyses — Global audit trail of every SVI score run + AI analysis
//
// Reads existing tables (no schema change): startup_score_history joined with
// startup_ai_analyses so admins can see per-profile progression over time —
// inputs, sub-scores, total, valuation, source (blockid|svi), AI model + tokens.
//
// Filters via URL params (?user=<email>&startup=<name>&source=svi) so the page
// can be bookmarked. Pagination via ?page=. requireAdmin gate.

import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/reseller/require-admin";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Analysis Audit Trail | Admin",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 40;

interface HistoryRow {
  id: string;
  user_id: string;
  startup_id: string;
  startup_name: string;
  total_score: number;
  valuation_low_aud: number | null;
  valuation_high_aud: number | null;
  source: string | null;
  score_version: string | null;
  confidence_score: number | null;
  sub_scores: Record<string, number> | null;
  created_at: string;
}

interface AiRow {
  id: string;
  history_id: string;
  agent_type: string;
  model_used: string | null;
  tokens_used: number | null;
  created_at: string;
}

interface UserRow { id: string; email: string; }

interface SearchParams {
  user?: string;
  startup?: string;
  source?: string;
  page?: string;
}

function fmtAud(n: number | null | undefined): string | null {
  if (!n) return null;
  return n >= 1_000_000 ? `A$${(n / 1_000_000).toFixed(1)}M` : `A$${(n / 1_000).toFixed(0)}K`;
}
function fmtDateTime(s: string): string {
  return new Date(s).toLocaleString("en-AU", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}
function scoreColor(s: number): string {
  return s >= 70 ? "text-green-400" : s >= 45 ? "text-amber-400" : "text-red-400";
}

async function loadRows(sp: SearchParams): Promise<{
  rows: HistoryRow[];
  aiByHistory: Map<string, AiRow[]>;
  users: Map<string, UserRow>;
  total: number;
}> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { rows: [], aiByHistory: new Map(), users: new Map(), total: 0 };

  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let userIds: string[] | null = null;
  if (sp.user) {
    const { data: us } = await supabase
      .from("app_users")
      .select("id, email")
      .ilike("email", `%${sp.user.trim().toLowerCase()}%`)
      .limit(50);
    userIds = (us ?? []).map((u: { id: string }) => u.id);
    if (userIds.length === 0) return { rows: [], aiByHistory: new Map(), users: new Map(), total: 0 };
  }

  let query = supabase
    .from("startup_score_history")
    .select("id, user_id, startup_id, startup_name, total_score, valuation_low_aud, valuation_high_aud, source, score_version, confidence_score, sub_scores, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);
  if (userIds) query = query.in("user_id", userIds);
  if (sp.startup) query = query.ilike("startup_name", `%${sp.startup.trim()}%`);
  if (sp.source) query = query.eq("source", sp.source.trim().toLowerCase());

  const { data: rowsRaw, count } = await query;
  const rows = (rowsRaw ?? []) as HistoryRow[];

  const aiByHistory = new Map<string, AiRow[]>();
  if (rows.length > 0) {
    const { data: aisRaw } = await supabase
      .from("startup_ai_analyses")
      .select("id, history_id, agent_type, model_used, tokens_used, created_at")
      .in("history_id", rows.map((r) => r.id))
      .order("created_at", { ascending: true });
    for (const ai of (aisRaw ?? []) as AiRow[]) {
      const list = aiByHistory.get(ai.history_id) ?? [];
      list.push(ai);
      aiByHistory.set(ai.history_id, list);
    }
  }

  const users = new Map<string, UserRow>();
  const distinctUserIds = [...new Set(rows.map((r) => r.user_id))];
  if (distinctUserIds.length > 0) {
    const { data: us } = await supabase
      .from("app_users")
      .select("id, email")
      .in("id", distinctUserIds);
    for (const u of (us ?? []) as UserRow[]) users.set(u.id, u);
  }

  return { rows, aiByHistory, users, total: count ?? rows.length };
}

export default async function AdminAnalysesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/admin/analyses");
  if (!isAdmin(user)) redirect("/dashboard/svi");

  const sp = await searchParams;
  const { rows, aiByHistory, users, total } = await loadRows(sp);
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const q = new URLSearchParams();
  if (sp.user) q.set("user", sp.user);
  if (sp.startup) q.set("startup", sp.startup);
  if (sp.source) q.set("source", sp.source);
  const linkFor = (p: number) => {
    const nq = new URLSearchParams(q);
    nq.set("page", String(p));
    return `/admin/analyses?${nq.toString()}`;
  };

  return (
    <div className="max-w-7xl mx-auto px-6 pb-24 pt-10 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Analysis Audit Trail</h1>
        <p className="text-sm text-ink-400 mt-1">
          Every SVI run + AI agent output across all founders. {total.toLocaleString()} record{total !== 1 ? "s" : ""} total.
        </p>
      </div>

      <form className="flex flex-wrap gap-3" action="/admin/analyses" method="get">
        <input
          name="user"
          defaultValue={sp.user ?? ""}
          placeholder="Email contains…"
          className="min-w-64 rounded-lg border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-sm text-white placeholder:text-ink-500 focus:outline-none focus:ring-1 focus:ring-brand-400"
        />
        <input
          name="startup"
          defaultValue={sp.startup ?? ""}
          placeholder="Startup name contains…"
          className="min-w-64 rounded-lg border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-sm text-white placeholder:text-ink-500 focus:outline-none focus:ring-1 focus:ring-brand-400"
        />
        <select
          name="source"
          defaultValue={sp.source ?? ""}
          className="rounded-lg border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand-400"
        >
          <option value="">Any source</option>
          <option value="blockid">blockid</option>
          <option value="svi">svi</option>
        </select>
        <button
          type="submit"
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-400 transition-colors"
        >
          Filter
        </button>
        {(sp.user || sp.startup || sp.source) && (
          <Link href="/admin/analyses" className="rounded-lg border border-[rgba(255,255,255,0.1)] px-4 py-2 text-sm text-ink-300 hover:text-white transition-colors">
            Clear
          </Link>
        )}
      </form>

      <div className="rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[rgba(255,255,255,0.03)] text-[10px] uppercase tracking-wider text-ink-400">
            <tr>
              <th className="text-left px-4 py-3">Timestamp</th>
              <th className="text-left px-4 py-3">User</th>
              <th className="text-left px-4 py-3">Startup</th>
              <th className="text-right px-4 py-3">Score</th>
              <th className="text-right px-4 py-3">Valuation</th>
              <th className="text-left px-4 py-3">Sub-scores</th>
              <th className="text-left px-4 py-3">AI agents</th>
              <th className="text-left px-4 py-3">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgba(255,255,255,0.05)]">
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-ink-400">
                  No analysis runs match this filter.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const ur = users.get(r.user_id);
              const ais = aiByHistory.get(r.id) ?? [];
              const totalTokens = ais.reduce((s, a) => s + (a.tokens_used ?? 0), 0);
              const val = r.valuation_low_aud && r.valuation_high_aud
                ? `${fmtAud(r.valuation_low_aud)} – ${fmtAud(r.valuation_high_aud)}`
                : fmtAud(r.valuation_low_aud) ?? fmtAud(r.valuation_high_aud) ?? "—";
              const subs = r.sub_scores ? Object.entries(r.sub_scores).slice(0, 4) : [];
              const src = (r.source ?? "blockid").toLowerCase();

              return (
                <tr key={r.id} className="hover:bg-[rgba(255,255,255,0.02)]">
                  <td className="px-4 py-3 text-xs text-ink-300 whitespace-nowrap">
                    {fmtDateTime(r.created_at)}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <div className="text-white">{ur?.email ?? r.user_id.slice(0, 8)}</div>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <div className="text-white font-medium">{r.startup_name}</div>
                    <div className="text-ink-500 text-[10px]">{r.startup_id}</div>
                  </td>
                  <td className={`px-4 py-3 text-right text-lg font-bold tabular-nums ${scoreColor(r.total_score)}`}>
                    {r.total_score}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-white whitespace-nowrap">
                    {val}
                    {r.confidence_score != null && (
                      <div className="text-[10px] text-ink-500">conf {Number(r.confidence_score).toFixed(0)}%</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[10px] text-ink-300">
                    {subs.length === 0 ? "—" : subs.map(([k, v]) => `${k}:${v}`).join(" · ")}
                  </td>
                  <td className="px-4 py-3 text-[10px] text-ink-300">
                    {ais.length === 0 ? (
                      <span className="text-ink-500">none</span>
                    ) : (
                      <div>
                        <div className="text-white">{ais.length} agent{ais.length !== 1 ? "s" : ""}</div>
                        <div className="text-ink-500">{totalTokens.toLocaleString()} tokens</div>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium border ${
                      src === "svi"
                        ? "bg-purple-400/10 text-purple-400 border-purple-400/20"
                        : "bg-[rgba(0,212,255,0.08)] text-[#00D4FF] border-[rgba(0,212,255,0.2)]"
                    }`}>
                      {src}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm text-ink-400">
          <div>Page {page} of {pages}</div>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={linkFor(page - 1)} className="rounded-lg border border-[rgba(255,255,255,0.1)] px-3 py-1.5 text-xs hover:text-white transition-colors">
                Previous
              </Link>
            )}
            {page < pages && (
              <Link href={linkFor(page + 1)} className="rounded-lg border border-[rgba(255,255,255,0.1)] px-3 py-1.5 text-xs hover:text-white transition-colors">
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
