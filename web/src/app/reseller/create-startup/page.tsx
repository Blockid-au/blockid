// GET /reseller/create-startup — wholesale provisioning form.
//
// Per docs/plans/reseller-module-plan.md § C.1.5 (create-startup form)
// + § U.3 (wholesale billing model) + § H.8 (magic-link verification).
//
// Gated by resellers.can_create_startups. Submit target
// (POST /api/reseller/create-startup) lands in P6 — button is disabled
// until the endpoint exists.

import { getCurrentUser } from "@/lib/auth";
import { scopedReseller, ResellerScopeError } from "@/lib/reseller/scope";
import { resellerSupabase } from "@/lib/reseller/supabase";

export const dynamic = "force-dynamic";

export default async function ResellerCreateStartupPage() {
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

  if (!reseller?.can_create_startups) {
    return (
      <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-900">
        <p className="font-medium">Not enabled for this reseller.</p>
        <p className="mt-1">
          Direct startup provisioning is a wholesale-tier capability. Contact{" "}
          <a href="mailto:admin@blockid.au" className="underline">
            admin@blockid.au
          </a>{" "}
          to enable it on your account.
        </p>
      </div>
    );
  }

  const allowedTiers: number[] = Array.isArray(reseller.allowed_tiers)
    ? (reseller.allowed_tiers as number[])
    : [];

  return (
    <>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-ink-900">
          Create startup (wholesale)
        </h2>
        <p className="mt-1 text-sm text-ink-600">
          Provision a Growth-tier workspace on behalf of a founder. You (the reseller)
          are billed <span className="font-medium">$99/mo per attributed startup</span>{" "}
          and the workspace receives <span className="font-medium">200 credits/month</span>.
          The founder must complete magic-link verification of their email before the
          workspace transitions out of provisional state.
        </p>
      </div>

      <div className="mb-4 rounded-lg border border-surface-200 bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
          What happens on submit
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-700">
          <li>
            Atomic transaction: create <code className="font-mono text-xs">app_users</code>{" "}
            row (provisional), create workspace, apply reseller attribution with the
            selected discount tier.
          </li>
          <li>
            Stripe subscription is created against the reseller&rsquo;s payment method
            using the Growth SKU + the selected tier&rsquo;s coupon.
          </li>
          <li>
            A magic-link verification email is dispatched to the founder. The workspace
            stays <span className="italic">provisional</span> (no exports, no public
            share) until the link is clicked (§ H.8).
          </li>
          <li>
            Attribution appears in <a href="/reseller/customers" className="text-brand-700 underline">/reseller/customers</a>{" "}
            with <span className="font-mono text-xs">source=&quot;wholesale_create&quot;</span>.
          </li>
        </ul>
      </div>

      <form
        method="post"
        action="/api/reseller/create-startup"
        className="rounded-lg border border-surface-200 bg-white p-4"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide text-ink-500">
              Founder email
            </span>
            <input
              type="email"
              name="founder_email"
              required
              placeholder="founder@example.com"
              className="mt-1 block w-full rounded border border-surface-300 bg-white p-3 text-sm text-ink-900"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide text-ink-500">
              Company name
            </span>
            <input
              type="text"
              name="company_name"
              required
              placeholder="Acme Pty Ltd"
              className="mt-1 block w-full rounded border border-surface-300 bg-white p-3 text-sm text-ink-900"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide text-ink-500">
              Plan tier
            </span>
            <select
              name="plan_tier"
              defaultValue="founder_growth"
              className="mt-1 block w-full rounded border border-surface-300 bg-white p-3 text-sm text-ink-900"
            >
              <option value="founder_growth">Founder — Growth ($99/mo)</option>
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide text-ink-500">
              Discount tier
            </span>
            <select
              name="discount_tier"
              className="mt-1 block w-full rounded border border-surface-300 bg-white p-3 text-sm text-ink-900"
            >
              {allowedTiers.length === 0 ? (
                <option value="">— no tiers configured —</option>
              ) : (
                allowedTiers.map((t) => (
                  <option key={t} value={t}>
                    {t === 0 ? "Attribution only (0%)" : `${t}% off forever`}
                  </option>
                ))
              )}
            </select>
          </label>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-ink-500">
            POST <span className="font-mono">/api/reseller/create-startup</span> —
            coming in P6.
          </p>
          <button
            type="submit"
            disabled
            className="rounded bg-surface-200 px-4 py-2 text-sm font-medium text-ink-500"
            aria-disabled="true"
          >
            Provision startup (disabled)
          </button>
        </div>
      </form>
    </>
  );
}
