// GET /reseller/roster — every attributed startup for this reseller.
//
// v3 upgrade Track K sub-L3. Server component: authenticates the caller,
// resolves their reseller scope, reads the roster view added in migration
// 0295 via readResellerRoster (which owner-gates by reseller_admins), then
// renders a KPI strip + interactive table (roster-table-client).
//
// The interactive filter/sort + row-drawer live in ./roster-table-client.tsx
// so the initial server render is one round-trip and the client bundle only
// carries the small filter widget.

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { scopedReseller, ResellerScopeError } from "@/lib/reseller/scope";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  readResellerRoster,
  summariseRoster,
  type StartupRosterEntry,
} from "@/lib/reseller/roster";
import { RosterTableClient } from "./roster-table-client";

export const dynamic = "force-dynamic";

interface PromoRedemptionRow {
  redemption_count: number | null;
}

async function fetchPromoRedemptionTotal(resellerId: string): Promise<number> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return 0;
  const { data, error } = await supabase
    .from("reseller_promotion_codes")
    .select("redemption_count")
    .eq("reseller_id", resellerId);
  if (error || !data) return 0;
  return (data as PromoRedemptionRow[]).reduce(
    (acc, row) => acc + (row.redemption_count ?? 0),
    0,
  );
}

export default async function ResellerRosterPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/auth/login?next=/reseller/roster");
  }

  let scope;
  try {
    scope = await scopedReseller(user);
  } catch (err) {
    if (err instanceof ResellerScopeError) {
      // Not a reseller admin at all — punt to login.
      redirect("/auth/login?next=/reseller/roster");
    }
    throw err;
  }

  // Owner-only guard is enforced inside readResellerRoster(); a non-owner
  // (viewer/admin) sees an empty roster. We do NOT redirect them so they can
  // still land here and see the "roster requires owner role" message below.
  const rows: StartupRosterEntry[] = await readResellerRoster(
    scope.reseller_id,
    user.id,
  );
  const summary = summariseRoster(rows);
  const promoRedemptions = await fetchPromoRedemptionTotal(scope.reseller_id);

  const stageCounts = Object.entries(summary.by_stage).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return (
    <>
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-ink-900">
          Attributed startups roster ({summary.total})
        </h2>
        <p className="mt-1 text-sm text-ink-600">
          Every startup / founder account attributed to your reseller code, with
          development progress, verification level, evidence + report counts,
          and derived engagement status. Roster is scoped by
          <code className="mx-1 rounded bg-surface-100 px-1 py-0.5 text-xs">
            reseller_admins.role = &apos;owner&apos;
          </code>
          — viewers and admins see an empty roster here.
        </p>
      </div>

      {/* KPI strip */}
      <section
        aria-label="Roster summary"
        className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        <KpiCard label="Attributed startups" value={String(summary.total)} />
        <KpiCard
          label="Avg Trust Score"
          value={
            summary.avg_trust_score == null
              ? "—"
              : String(summary.avg_trust_score)
          }
          hint="Latest SVI per business"
        />
        <KpiCard
          label="Paying startups"
          value={String(summary.by_status.paying)}
          hint="Reports READY or credits > 0"
        />
        <KpiCard
          label="Promo redemptions"
          value={String(promoRedemptions)}
          hint="Sum across all tiers"
        />
      </section>

      {stageCounts.length > 0 && (
        <section
          aria-label="Unicorn stage distribution"
          className="mb-6 rounded-lg border border-surface-200 bg-white p-4"
        >
          <h3 className="text-sm font-semibold text-ink-900">
            Unicorn stage distribution
          </h3>
          <dl className="mt-3 flex flex-wrap gap-3">
            {stageCounts.map(([stage, count]) => (
              <div
                key={stage}
                className="flex items-baseline gap-2 rounded border border-surface-200 bg-surface-50 px-3 py-1.5"
              >
                <dt className="text-xs font-medium uppercase tracking-wide text-ink-500">
                  {stage}
                </dt>
                <dd className="text-lg font-semibold tabular-nums text-ink-900">
                  {count}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-surface-300 bg-white p-8 text-center">
          <p className="text-sm text-ink-600">
            No attributed startups yet.
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
        <RosterTableClient rows={rows} />
      )}
    </>
  );
}

function KpiCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-surface-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold text-ink-900 tabular-nums">
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}
