// /admin/resellers — Admin list of all reseller organisations.
//
// Per docs/plans/reseller-module-plan.md § C.5 (admin approval flows) +
// C.1 mirror of /admin/accelerator route pair. Read-only view for now;
// P9 hardening adds activate/suspend/edit-budget actions inline.
//
// Admin-gated via requireAdmin (web/src/lib/reseller/require-admin.ts).

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/reseller/require-admin";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface ResellerRow {
  id: string;
  code: string;
  display_name: string;
  billing_model: string;
  status: string;
  gst_registered: boolean;
  abn: string | null;
  monthly_credit_budget: number;
  monthly_sandbox_credits: number;
  can_create_startups: boolean;
  can_grant_credits: boolean;
  commission_share_pct: number;
  created_at: string;
}

async function loadResellers(): Promise<ResellerRow[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  try {
    const { data } = await supabase
      .from("resellers")
      .select("*")
      .order("created_at", { ascending: false });
    return (data ?? []) as ResellerRow[];
  } catch {
    // Table may not exist pre-migration.
    return [];
  }
}

export default async function AdminResellersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/admin/resellers");
  if (!isAdmin(user)) redirect("/dashboard/svi");

  const rows = await loadResellers();

  return (
    <div className="min-h-screen bg-surface-50">
      <div className="mx-auto max-w-6xl p-6">
        <header className="mb-6 flex items-baseline justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-ink-900">Resellers</h1>
            <p className="mt-1 text-sm text-ink-600">
              Every reseller org attributed to Auschain PTY LTD. See{" "}
              <a href="/admin/resellers/requests" className="text-brand-700 underline">
                requests
              </a>{" "}
              for pending code + credit approvals.
            </p>
          </div>
          <a
            href="/admin/resellers/new"
            className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white"
          >
            + New reseller
          </a>
        </header>

        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-surface-300 bg-white p-8 text-center">
            <p className="text-sm text-ink-600">
              No resellers yet. Once migrations 0091 + 0092 are applied to prod
              DB, the InfoVision seed row will appear here.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-surface-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-surface-50 text-left text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="p-3">Reseller</th>
                  <th className="p-3">Model</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">GST + ABN</th>
                  <th className="p-3">Capabilities</th>
                  <th className="p-3">Budget (cust / sandbox)</th>
                  <th className="p-3">Since</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="p-3">
                      <a
                        href={`/admin/resellers/${r.code.toLowerCase()}`}
                        className="font-medium text-brand-700 hover:underline"
                      >
                        {r.display_name}
                      </a>
                      <p className="font-mono text-xs text-ink-500">{r.code}</p>
                    </td>
                    <td className="p-3">
                      <span
                        className={`rounded px-2 py-0.5 text-xs ${
                          r.billing_model === "wholesale"
                            ? "bg-purple-50 text-purple-800"
                            : "bg-blue-50 text-blue-800"
                        }`}
                      >
                        {r.billing_model}
                      </span>
                    </td>
                    <td className="p-3">
                      <span
                        className={`rounded px-2 py-0.5 text-xs ${
                          r.status === "active"
                            ? "bg-emerald-50 text-emerald-800"
                            : r.status === "paused"
                              ? "bg-yellow-50 text-yellow-800"
                              : "bg-red-50 text-red-800"
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-ink-700">
                      {r.gst_registered ? "✓ registered" : "— not registered"}
                      <br />
                      <span className="font-mono text-ink-500">{r.abn ?? "—"}</span>
                    </td>
                    <td className="p-3 text-xs text-ink-700">
                      {r.can_create_startups && (
                        <span className="mr-2 rounded bg-surface-100 px-1.5 py-0.5">
                          + startups
                        </span>
                      )}
                      {r.can_grant_credits && (
                        <span className="rounded bg-surface-100 px-1.5 py-0.5">
                          + credits
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-xs text-ink-700">
                      {r.monthly_credit_budget.toLocaleString()} /{" "}
                      {r.monthly_sandbox_credits.toLocaleString()}
                    </td>
                    <td className="p-3 text-xs text-ink-600">
                      {new Date(r.created_at).toISOString().slice(0, 10)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
