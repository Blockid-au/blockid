// GET /reseller/codes — promo code catalogue for this reseller.
//
// Per docs/plans/reseller-module-plan.md § C.1.3.
// Shows one row per (reseller, tier). Tier-0 rows have no Stripe objects
// (per U.15.1 — Stripe forbids 0-value coupons).

import { getCurrentUser } from "@/lib/auth";
import { scopedReseller, ResellerScopeError } from "@/lib/reseller/scope";
import { resellerSupabase } from "@/lib/reseller/supabase";

export const dynamic = "force-dynamic";

export default async function ResellerCodesPage() {
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
  const codes = await db.promotionCodes();

  return (
    <>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-ink-900">
          Promotion codes ({codes.length})
        </h2>
        <p className="mt-1 text-xs text-ink-500">
          Tier-0 codes have no Stripe object — they attribute customers without applying a
          discount. Other tiers wrap a shared Stripe coupon in a per-code promotion object.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-surface-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-surface-50 text-left text-xs uppercase tracking-wide text-ink-500">
            <tr>
              <th className="p-3">Code</th>
              <th className="p-3">Tier</th>
              <th className="p-3">Stripe promo id</th>
              <th className="p-3">Active</th>
              <th className="p-3">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100">
            {codes.map((c) => (
              <tr key={c.id}>
                <td className="p-3 font-mono text-brand-700">{c.code}</td>
                <td className="p-3">
                  {c.tier_pct === 0
                    ? <span className="rounded bg-surface-100 px-2 py-0.5 text-xs">Attribution only</span>
                    : <span className="rounded bg-brand-50 px-2 py-0.5 text-xs text-brand-800">{c.tier_pct}% off forever</span>
                  }
                </td>
                <td className="p-3 font-mono text-xs text-ink-500">
                  {c.stripe_promotion_code_id ?? "—"}
                </td>
                <td className="p-3">
                  {c.active ? (
                    <span className="text-emerald-700">✓</span>
                  ) : (
                    <span className="text-ink-400">off</span>
                  )}
                </td>
                <td className="p-3 text-ink-600">
                  {new Date(c.created_at).toISOString().slice(0, 10)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
