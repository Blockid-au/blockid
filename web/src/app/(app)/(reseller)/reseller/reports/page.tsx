// GET /reseller/reports — monthly KPI report archive (P7.2).
//
// Renders the last 12 calendar months of the reseller's monthly KPI CSVs
// from the reseller_report_files metadata table. Rows without a file show
// "Not yet generated"; rows with a file expose a "Download CSV" button that
// hits /api/reseller/reports/[month]/signed-url to mint a 24 h signed URL
// on demand (D4-CLO-07). See docs/plans/reseller-module-plan.md § C.6.

import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { ResellerScopeError, scopedReseller } from "@/lib/reseller/scope";
import { resellerSupabase } from "@/lib/reseller/supabase";
import {
  filterVisibleReports,
  monthKeyOffset,
  RETENTION_EXPOSED_MONTHS,
} from "@/lib/reseller/report-storage";
import { ReportDownloadCell } from "./report-download-cell";

export const dynamic = "force-dynamic";

interface ReportRow {
  month: string;
  status: "Generated" | "Not yet generated";
  size_bytes: number | null;
  generated_at: string | null;
}

function buildTrailingMonths(count: number): string[] {
  const now = new Date();
  const months: string[] = [];
  for (let i = 0; i < count; i++) months.push(monthKeyOffset(now, i));
  return months;
}

export default async function ResellerReportsPage() {
  const user = await getCurrentUser();
  if (!user) return <p className="text-sm text-red-600">Not signed in.</p>;

  let scope;
  try {
    scope = await scopedReseller(user);
  } catch (err) {
    if (err instanceof ResellerScopeError) {
      return <p className="text-sm text-yellow-800">No reseller membership.</p>;
    }
    throw err;
  }

  const db = resellerSupabase(scope);
  await db.selfReseller();

  const supabase = getSupabaseAdmin();
  const existing: { month_key: string; size_bytes: number; generated_at: string }[] = [];
  if (supabase) {
    const { data } = await supabase
      .from("reseller_report_files")
      .select("month_key, size_bytes, generated_at")
      .eq("reseller_id", scope.reseller_id)
      .order("month_key", { ascending: false });
    for (const r of (data ?? []) as { month_key: string; size_bytes: number; generated_at: string }[]) {
      existing.push(r);
    }
  }

  const visible = filterVisibleReports(existing);
  const byMonth = new Map(visible.map((f) => [f.month_key, f]));
  const months = buildTrailingMonths(RETENTION_EXPOSED_MONTHS);
  const rows: ReportRow[] = months.map((month) => {
    const hit = byMonth.get(month);
    if (!hit) return { month, status: "Not yet generated", size_bytes: null, generated_at: null };
    return {
      month,
      status: "Generated",
      size_bytes: hit.size_bytes,
      generated_at: hit.generated_at,
    };
  });

  return (
    <>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-ink-900">Monthly reports</h2>
        <p className="mt-1 text-xs text-ink-500">
          Reports are generated on the 1st of each month and retained for 24 months. Only the
          last {RETENTION_EXPOSED_MONTHS} months are downloadable; links use signed URLs with a
          24-hour TTL.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-surface-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-surface-50 text-left text-xs uppercase tracking-wide text-ink-500">
            <tr>
              <th className="p-3">Month</th>
              <th className="p-3">Status</th>
              <th className="p-3">Size</th>
              <th className="p-3">Generated</th>
              <th className="p-3">Download</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100">
            {rows.map((r) => (
              <tr key={r.month}>
                <td className="p-3 font-mono text-ink-900">{r.month}</td>
                <td className="p-3">
                  {r.status === "Generated" ? (
                    <span className="rounded bg-brand-50 px-2 py-0.5 text-xs text-brand-800">
                      Generated
                    </span>
                  ) : (
                    <span className="rounded bg-surface-100 px-2 py-0.5 text-xs text-ink-600">
                      Not yet generated
                    </span>
                  )}
                </td>
                <td className="p-3 text-xs text-ink-600">
                  {r.size_bytes !== null ? `${r.size_bytes.toLocaleString()} B` : "—"}
                </td>
                <td className="p-3 text-xs text-ink-600">
                  {r.generated_at
                    ? new Date(r.generated_at).toISOString().slice(0, 10)
                    : "—"}
                </td>
                <td className="p-3">
                  {r.status === "Generated" ? (
                    <ReportDownloadCell month={r.month} />
                  ) : (
                    <span className="text-xs text-ink-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
