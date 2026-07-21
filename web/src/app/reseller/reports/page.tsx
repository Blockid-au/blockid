// GET /reseller/reports — monthly KPI report archive.
//
// Per docs/plans/reseller-module-plan.md § C.1.6 (reports page)
// + § C.6 (retention + signed-URL TTL).
//
// P4.1 skeleton — the generator cron
// (web/src/app/api/cron/reseller-monthly-report) lands in P7. Until then
// every row renders as "Not yet generated" and the CSV link is disabled.
// One "Generated" example row (2026-06) is shown to illustrate the state.

import { getCurrentUser } from "@/lib/auth";
import { scopedReseller, ResellerScopeError } from "@/lib/reseller/scope";
import { resellerSupabase } from "@/lib/reseller/supabase";

export const dynamic = "force-dynamic";

interface ReportRow {
  month: string; // YYYY-MM
  status: "Not yet generated" | "Generated" | "Pending (future)";
  generated: boolean;
}

function buildTrailingMonths(count: number): ReportRow[] {
  const rows: ReportRow[] = [];
  const now = new Date();
  const thisYear = now.getUTCFullYear();
  const thisMonth = now.getUTCMonth(); // 0-indexed
  // Include current month + previous 11 = 12 rows total.
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(thisYear, thisMonth - i, 1));
    const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    // Dummy state — one past month shown as Generated to illustrate the UI.
    const isDummyGenerated = month === "2026-06";
    rows.push({
      month,
      status: isDummyGenerated ? "Generated" : "Not yet generated",
      generated: isDummyGenerated,
    });
  }
  return rows;
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

  // Touch the scoped DB wrapper so the layout guard is exercised — real
  // rows come from the P7 storage bucket, not from Supabase directly.
  const db = resellerSupabase(scope);
  await db.selfReseller();

  const rows = buildTrailingMonths(12);

  return (
    <>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-ink-900">
          Monthly reports
        </h2>
        <p className="mt-1 text-xs text-ink-500">
          Reports are generated on the 1st of each month at 02:00 AEST and are retained
          for 24 months. Download links use signed URLs with a 24-hour TTL.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-surface-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-surface-50 text-left text-xs uppercase tracking-wide text-ink-500">
            <tr>
              <th className="p-3">Month</th>
              <th className="p-3">Status</th>
              <th className="p-3">Download</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100">
            {rows.map((r) => (
              <tr key={r.month}>
                <td className="p-3 font-mono text-ink-900">{r.month}</td>
                <td className="p-3">
                  {r.generated ? (
                    <span className="rounded bg-brand-50 px-2 py-0.5 text-xs text-brand-800">
                      Generated
                    </span>
                  ) : (
                    <span className="rounded bg-surface-100 px-2 py-0.5 text-xs text-ink-600">
                      Not yet generated
                    </span>
                  )}
                </td>
                <td className="p-3">
                  <a
                    aria-disabled="true"
                    className="pointer-events-none text-xs text-ink-400 underline"
                    href="#"
                  >
                    Download CSV
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-ink-500">
        Report generator cron lands in P7 (<span className="font-mono">/api/cron/reseller-monthly-report</span>).
        Until then, all rows show as unpopulated except the illustrative example.
      </p>
    </>
  );
}
