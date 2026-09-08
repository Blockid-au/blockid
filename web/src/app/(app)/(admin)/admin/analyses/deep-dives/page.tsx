// /admin/analyses/deep-dives — Per-dimension AI deep-dive audit trail
//
// Companion to /admin/analyses. Reads `evidence_analyses` (populated by
// /api/svi/dimension-analyze on every user click of the Deep Dive button).
// No schema change — data has been logging since the endpoint existed.
//
// Filters via URL params (?user=<email>&dimension=mpc&tier=standard).

import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/reseller/require-admin";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Deep-Dive Audit Trail | Admin",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 50;
const DIMENSIONS = ["ftv", "mpc", "ptd", "tre", "cgh", "iri", "lco", "svm"];

interface Row {
  id: string;
  account_id: string | null;
  dimension: string | null;
  tier: string | null;
  feature_key: string | null;
  credits_charged: number | null;
  svi_delta_applied: number | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  analysis_json: Record<string, any> | null;
  created_at: string;
}
interface AccountRow { id: string; email: string | null; startup_name: string | null; }

interface SearchParams {
  user?: string;
  dimension?: string;
  tier?: string;
  page?: string;
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
  rows: Row[];
  accounts: Map<string, AccountRow>;
  total: number;
}> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { rows: [], accounts: new Map(), total: 0 };

  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from("evidence_analyses")
    .select("id, account_id, dimension, tier, feature_key, credits_charged, svi_delta_applied, analysis_json, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);
  if (sp.dimension) query = query.eq("dimension", sp.dimension.trim().toLowerCase());
  if (sp.tier) query = query.eq("tier", sp.tier.trim().toLowerCase());

  const { data: rowsRaw, count } = await query;
  let rows = (rowsRaw ?? []) as Row[];

  const accounts = new Map<string, AccountRow>();
  const accountIds = [...new Set(rows.map((r) => r.account_id).filter(Boolean))] as string[];
  if (accountIds.length > 0) {
    const { data: accs } = await supabase
      .from("svi_accounts")
      .select("id, email, startup_name")
      .in("id", accountIds);
    for (const a of (accs ?? []) as AccountRow[]) accounts.set(a.id, a);
  }

  if (sp.user) {
    const needle = sp.user.trim().toLowerCase();
    rows = rows.filter((r) => {
      const acc = r.account_id ? accounts.get(r.account_id) : null;
      return acc?.email?.toLowerCase().includes(needle) ?? false;
    });
  }

  return { rows, accounts, total: count ?? rows.length };
}

export default async function AdminDeepDivesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/admin/analyses/deep-dives");
  if (!isAdmin(user)) redirect("/dashboard/svi");

  const sp = await searchParams;
  const { rows, accounts, total } = await loadRows(sp);
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const q = new URLSearchParams();
  if (sp.user) q.set("user", sp.user);
  if (sp.dimension) q.set("dimension", sp.dimension);
  if (sp.tier) q.set("tier", sp.tier);
  const linkFor = (p: number) => {
    const nq = new URLSearchParams(q);
    nq.set("page", String(p));
    return `/admin/analyses/deep-dives?${nq.toString()}`;
  };

  return (
    <div className="max-w-7xl mx-auto px-6 pb-24 pt-10 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">Deep-Dive Audit Trail</h1>
          <p className="text-sm text-muted mt-1">
            Per-dimension AI analyses (MPC / FTV / CGH / …). {total.toLocaleString()} record{total !== 1 ? "s" : ""} total.
          </p>
        </div>
        <Link
          href="/admin/analyses"
          className="text-sm text-muted hover:text-primary transition-colors"
        >
          ← Score runs
        </Link>
      </div>

      <form className="flex flex-wrap gap-3" action="/admin/analyses/deep-dives" method="get">
        <input
          name="user"
          defaultValue={sp.user ?? ""}
          placeholder="Email contains…"
          className="min-w-64 rounded-lg border border-line-subtle bg-surface-sunken px-3 py-2 text-sm text-primary placeholder:text-ink-500 focus:outline-none focus:ring-1 focus:ring-brand-400"
        />
        <select
          name="dimension"
          defaultValue={sp.dimension ?? ""}
          className="rounded-lg border border-line-subtle bg-surface-sunken px-3 py-2 text-sm text-primary focus:outline-none focus:ring-1 focus:ring-brand-400"
        >
          <option value="">Any dimension</option>
          {DIMENSIONS.map((d) => (
            <option key={d} value={d}>{d.toUpperCase()}</option>
          ))}
        </select>
        <select
          name="tier"
          defaultValue={sp.tier ?? ""}
          className="rounded-lg border border-line-subtle bg-surface-sunken px-3 py-2 text-sm text-primary focus:outline-none focus:ring-1 focus:ring-brand-400"
        >
          <option value="">Any tier</option>
          <option value="standard">standard</option>
          <option value="premium">premium</option>
        </select>
        <button type="submit" className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-400 transition-colors">
          Filter
        </button>
        {(sp.user || sp.dimension || sp.tier) && (
          <Link href="/admin/analyses/deep-dives" className="rounded-lg border border-line-subtle px-4 py-2 text-sm text-muted hover:text-primary transition-colors">
            Clear
          </Link>
        )}
      </form>

      <div className="rounded-2xl border border-line-subtle bg-surface-sunken overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-sunken text-[10px] uppercase tracking-wider text-muted">
            <tr>
              <th className="text-left px-4 py-3">Timestamp</th>
              <th className="text-left px-4 py-3">User</th>
              <th className="text-left px-4 py-3">Startup</th>
              <th className="text-left px-4 py-3">Dimension</th>
              <th className="text-right px-4 py-3">Score</th>
              <th className="text-right px-4 py-3">Credits</th>
              <th className="text-left px-4 py-3">Report preview</th>
              <th className="text-left px-4 py-3">Tier</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle">
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted">
                  No deep-dive analyses match this filter.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const acc = r.account_id ? accounts.get(r.account_id) : null;
              const score = typeof r.analysis_json?.score === "number" ? r.analysis_json.score : null;
              const report = typeof r.analysis_json?.report === "string" ? r.analysis_json.report : null;
              return (
                <tr key={r.id} className="hover:bg-surface-sunken">
                  <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                    {fmtDateTime(r.created_at)}
                  </td>
                  <td className="px-4 py-3 text-xs text-primary">
                    {acc?.email ?? (r.account_id?.slice(0, 8) ?? "—")}
                  </td>
                  <td className="px-4 py-3 text-xs text-primary">
                    {acc?.startup_name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-primary uppercase">
                    {r.dimension ?? "—"}
                  </td>
                  <td className={`px-4 py-3 text-right text-lg font-bold tabular-nums ${score != null ? scoreColor(score) : "text-ink-500"}`}>
                    {score ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-muted tabular-nums">
                    {r.credits_charged ?? 0}
                  </td>
                  <td className="px-4 py-3 text-[11px] text-muted max-w-md">
                    {report ? report.slice(0, 140) + (report.length > 140 ? "…" : "") : <span className="text-ink-500">(no report)</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-block rounded-full bg-surface-hover border border-line-subtle px-2 py-0.5 text-[10px] text-muted">
                      {r.tier ?? "—"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted">
          <div>Page {page} of {pages}</div>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={linkFor(page - 1)} className="rounded-lg border border-line-subtle px-3 py-1.5 text-xs hover:text-primary transition-colors">
                Previous
              </Link>
            )}
            {page < pages && (
              <Link href={linkFor(page + 1)} className="rounded-lg border border-line-subtle px-3 py-1.5 text-xs hover:text-primary transition-colors">
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
