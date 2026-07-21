// GET /reseller/customers — table of attributed customers (operational only).
//
// Per docs/plans/reseller-module-plan.md § C.1.2 + § E.2 allow-matrix.
// Uses the typed resellerSupabase() wrapper — never touches admin client.
// Contact email is masked (first.***@domain) in list view; full email
// reveal-on-click is deferred to P4.5 with reseller_audit_log write per
// D4-CLO-01 fix (H.10).

import { getCurrentUser } from "@/lib/auth";
import { scopedReseller, ResellerScopeError } from "@/lib/reseller/scope";
import { resellerSupabase } from "@/lib/reseller/supabase";
import { maskEmail } from "@/lib/reseller/customer-reveal";
import { RevealEmailCell } from "./reveal-email-cell";
import { DrawerOpener } from "./drawer-opener";

export const dynamic = "force-dynamic";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toISOString().slice(0, 10);
}

export default async function ResellerCustomersPage() {
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
  const customers = await db.attributedCustomers();

  return (
    <>
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-ink-900">
          Attributed customers ({customers.length})
        </h2>
        <p className="text-xs text-ink-500">
          Operational data only. Workspace content is not shown.
        </p>
      </div>

      {customers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-surface-300 bg-white p-8 text-center">
          <p className="text-sm text-ink-600">
            No attributed customers yet.
          </p>
          <p className="mt-1 text-xs text-ink-500">
            Share your reseller code(s) — see{" "}
            <a href="/reseller/codes" className="text-brand-700 underline">
              /reseller/codes
            </a>
            .
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-surface-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-surface-50 text-left text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th className="p-3">Company / Name</th>
                <th className="p-3">Contact</th>
                <th className="p-3">Joined</th>
                <th className="p-3">Last active</th>
                <th className="p-3">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {customers.map((c) => (
                <tr key={c.user_id}>
                  <td className="p-3 font-medium text-ink-900">
                    {c.display_name ?? "—"}
                  </td>
                  <td className="p-3 text-ink-700">
                    <RevealEmailCell
                      customerId={c.user_id}
                      maskedEmail={maskEmail(c.email)}
                    />
                  </td>
                  <td className="p-3 text-ink-600">{fmtDate(c.created_at)}</td>
                  <td className="p-3 text-ink-600">{fmtDate(c.last_login_at)}</td>
                  <td className="p-3">
                    <DrawerOpener customerId={c.user_id} displayName={c.display_name} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
