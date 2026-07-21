// GET /reseller/credits — monthly credit budget + grant admin scaffold.
//
// Per docs/plans/reseller-module-plan.md § C.1.4 + § H.4 (20k/mo soft cap,
// over-budget → BlockID admin approval per D3-CISO-05).
// Uses the typed resellerSupabase() wrapper — never touches admin client.
//
// This is a P4 SKELETON. Monthly grant + sandbox spend series come from
// `reseller_credit_grants` in P6; for now MTD values are placeholders (0).
// The "Grant credits" CTA links to /reseller/credits/new which lands in P6.

import { getCurrentUser } from "@/lib/auth";
import { scopedReseller, ResellerScopeError } from "@/lib/reseller/scope";
import { resellerSupabase } from "@/lib/reseller/supabase";

export const dynamic = "force-dynamic";

interface BudgetBar {
  label: string;
  used: number;
  cap: number;
  hint: string;
}

function pct(used: number, cap: number): number {
  if (cap <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((used / cap) * 100)));
}

export default async function ResellerCreditsPage() {
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
  const reseller = await db.selfReseller();

  const budget = reseller?.monthly_credit_budget ?? 0;
  const sandboxCap = reseller?.monthly_sandbox_credits ?? 500;

  // Placeholder: real MTD numbers come from reseller_credit_grants in P6.
  const grantsUsed = 0;
  const sandboxUsed = 0;

  const bars: BudgetBar[] = [
    {
      label: "Customer grants MTD",
      used: grantsUsed,
      cap: budget,
      hint: "Credits granted to attributed startups this month.",
    },
    {
      label: "Sandbox usage MTD",
      used: sandboxUsed,
      cap: sandboxCap,
      hint: "Credits consumed by your internal sandbox project this month.",
    },
  ];

  return (
    <>
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-ink-900">Credits</h2>
        <p className="text-xs text-ink-500">
          Single budget dial — shared by customer grants and reseller sandbox.
        </p>
      </div>

      <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {bars.map((b) => {
          const p = pct(b.used, b.cap);
          return (
            <div
              key={b.label}
              className="rounded-lg border border-surface-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-baseline justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
                  {b.label}
                </p>
                <p className="text-xs text-ink-500">
                  {b.used.toLocaleString()} / {b.cap.toLocaleString()}
                </p>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-100">
                <div
                  className="h-full bg-brand-600"
                  style={{ width: `${p}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-ink-500">{b.hint}</p>
            </div>
          );
        })}
      </section>

      <section className="rounded-lg border border-surface-200 bg-white p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-ink-900">How grants work</h3>
            <p className="mt-2 text-sm text-ink-600">
              Grants that keep your month-to-date customer spend within{" "}
              <span className="font-medium text-ink-900">
                {budget.toLocaleString()} credits
              </span>{" "}
              are auto-approved. Requests that would push you over the monthly
              budget require BlockID admin approval per H.4 / D3-CISO-05 —
              approval is manual and typically same business day.
            </p>
            <p className="mt-2 text-xs text-ink-500">
              Sandbox usage draws from the same ceiling but is instrumented
              separately so you can see internal vs customer spend.
            </p>
          </div>
          <a
            href="/reseller/credits/new"
            className="shrink-0 rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
          >
            Grant credits
          </a>
        </div>
      </section>
    </>
  );
}
