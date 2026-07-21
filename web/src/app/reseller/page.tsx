// Reseller dashboard (`/reseller`) — KPI cards + portfolio charts scaffold.
//
// Per docs/plans/reseller-module-plan.md § C.1.1. Reads via the typed
// resellerSupabase() wrapper (D3-CISO-01) — never touches admin client
// directly.
//
// This is a P4.1 SKELETON. Real KPI aggregation queries land in P4.3 with
// the k>=5 anonymity + weekly timestamp quantisation from U.15.3.

import { getCurrentUser } from "@/lib/auth";
import { scopedReseller, ResellerScopeError } from "@/lib/reseller/scope";
import { resellerSupabase } from "@/lib/reseller/supabase";

export const dynamic = "force-dynamic";

interface Kpi {
  label: string;
  value: string;
  hint?: string;
}

export default async function ResellerDashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    // Layout already guards this — belt and braces.
    return <p className="text-sm text-red-600">Not signed in.</p>;
  }

  let scope;
  try {
    scope = await scopedReseller(user);
  } catch (err) {
    if (err instanceof ResellerScopeError) {
      return (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-900">
          <p className="font-medium">No reseller membership</p>
          <p>Your account is not linked to any reseller organisation.</p>
        </div>
      );
    }
    throw err;
  }

  const db = resellerSupabase(scope);
  const [reseller, customers, promoCodes] = await Promise.all([
    db.selfReseller(),
    db.attributedCustomers(),
    db.promotionCodes(),
  ]);

  const activeCodes = promoCodes.filter((c) => c.active).length;

  const kpis: Kpi[] = [
    {
      label: "Attributed customers",
      value: String(customers.length),
      hint: "Active + revoked over all time",
    },
    {
      label: "Active promotion codes",
      value: `${activeCodes} / ${promoCodes.length}`,
      hint: "See /reseller/codes",
    },
    {
      label: "Billing model",
      value: reseller?.billing_model ?? "—",
      hint: reseller?.billing_model === "wholesale"
        ? "You subscribe on behalf of each startup"
        : "Startups pay; you earn commission",
    },
    {
      label: "Monthly credit budget",
      value: reseller?.monthly_credit_budget
        ? `${reseller.monthly_credit_budget.toLocaleString()} credits`
        : "0 credits",
      hint: `Sandbox cap: ${reseller?.monthly_sandbox_credits ?? 500} credits`,
    },
  ];

  return (
    <>
      <section className="mb-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map((k) => (
            <div
              key={k.label}
              className="rounded-lg border border-surface-200 bg-white p-4 shadow-sm"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
                {k.label}
              </p>
              <p className="mt-1 text-2xl font-semibold text-ink-900">{k.value}</p>
              {k.hint && <p className="mt-1 text-xs text-ink-500">{k.hint}</p>}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-surface-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-ink-900">Portfolio</h2>
        <p className="mt-2 text-sm text-ink-600">
          Portfolio SVI curve, phase distribution and cohort velocity land in P4.3.
          For now, use{" "}
          <a href="/reseller/customers" className="text-brand-700 underline">
            /reseller/customers
          </a>{" "}
          to see the attributed startup list.
        </p>
      </section>
    </>
  );
}
