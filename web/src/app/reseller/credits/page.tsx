// GET /reseller/credits — monthly credit budget + grant form (P6.6).
//
// Per docs/plans/reseller-module-plan.md § C.1.4 + § H.4 (20k/mo soft cap,
// over-budget → BlockID admin approval per D3-CISO-05).
// Uses the typed resellerSupabase() wrapper — never touches admin client.
//
// P6.6 wires:
//   - MTD grants + sandbox spend from reseller_credit_grants (P6.1 schema)
//   - <GrantForm /> client component that POSTs /api/reseller/credits/grant
//     (P6.3) and handles 402 over_budget_requires_approval by pointing the
//     reseller at admin@blockid.au (P9.3 requests inbox still pending).

import { getCurrentUser } from "@/lib/auth";
import { scopedReseller, ResellerScopeError } from "@/lib/reseller/scope";
import { resellerSupabase } from "@/lib/reseller/supabase";
import { getSupabaseAdmin } from "@/lib/supabase";
import { maskEmail } from "@/lib/reseller/customer-reveal";
import {
  computeMonthlyUsage,
  monthKey,
  type ResellerCreditGrantRow,
} from "@/lib/reseller/credit-grants";
import { GrantForm } from "./grant-form";

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
  const customers = await db.attributedCustomers();

  const budget = (reseller?.monthly_credit_budget as number | null) ?? 0;
  const sandboxCap = (reseller?.monthly_sandbox_credits as number | null) ?? 500;
  const canGrant = (reseller?.can_grant_credits as boolean | null) ?? false;

  const key = monthKey(new Date());
  const supabase = getSupabaseAdmin();
  let grantsUsed = 0;
  let sandboxUsed = 0;
  let overBudgetCount = 0;
  if (supabase) {
    const { data: monthGrants } = await supabase
      .from("reseller_credit_grants")
      .select("kind, amount, month_key, over_budget, created_at")
      .eq("reseller_id", scope.reseller_id)
      .eq("month_key", key);
    const usage = computeMonthlyUsage(
      (monthGrants ?? []) as ResellerCreditGrantRow[],
      key,
    );
    grantsUsed = usage.grant_credits_used;
    sandboxUsed = usage.sandbox_credits_used;
    overBudgetCount = usage.over_budget_grant_count;
  }

  const remainingBudget = Math.max(0, budget - grantsUsed);

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

  const customerOptions = customers.map((c) => ({
    user_id: c.user_id,
    display_name: c.display_name,
    masked_email: maskEmail(c.email),
  }));

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

      {overBudgetCount > 0 && (
        <section className="mb-6 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p>
            {overBudgetCount} over-budget grant{overBudgetCount === 1 ? "" : "s"}{" "}
            approved by admin this month.
          </p>
        </section>
      )}

      <section className="mb-6 rounded-lg border border-surface-200 bg-white p-4">
        <div>
          <h3 className="text-base font-semibold text-ink-900">Grant credits</h3>
          <p className="mt-1 text-xs text-ink-500">
            Grants within your remaining monthly budget are auto-approved.
            Requests that would exceed the ceiling need BlockID admin approval
            per H.4 / D3-CISO-05 — approval is manual and typically same
            business day.
          </p>
        </div>
        <div className="mt-4">
          {canGrant ? (
            <GrantForm
              customers={customerOptions}
              remainingBudget={remainingBudget}
            />
          ) : (
            <p className="text-sm text-ink-600">
              Your reseller org is not currently permitted to grant credits.
              Contact{" "}
              <a href="mailto:admin@blockid.au" className="text-brand-700 underline">
                admin@blockid.au
              </a>{" "}
              to enable the capability.
            </p>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-surface-200 bg-white p-4">
        <h3 className="text-base font-semibold text-ink-900">How grants work</h3>
        <p className="mt-2 text-sm text-ink-600">
          Grants that keep your month-to-date customer spend within{" "}
          <span className="font-medium text-ink-900">
            {budget.toLocaleString()} credits
          </span>{" "}
          are auto-approved. Requests that would push you over the monthly
          budget require BlockID admin approval per H.4 / D3-CISO-05.
        </p>
        <p className="mt-2 text-xs text-ink-500">
          Sandbox usage draws from a separate ceiling (
          {sandboxCap.toLocaleString()} credits/month, hourly rate limit 50 per
          sandbox project) so you can see internal vs customer spend.
        </p>
      </section>
    </>
  );
}
