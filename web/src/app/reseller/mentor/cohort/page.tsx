// Optional cohort roll-up. Only rendered when the reseller owns at least
// one accelerator_cohorts row. MVP shows the list of cohorts with the
// count of attributed founders; the founders x weeks heat-map matrix is
// a follow-up (mentor_weekly_heat materialised view — see plan risk #4).

import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { scopedReseller, ResellerScopeError } from "@/lib/reseller/scope";
import { resellerSupabase } from "@/lib/reseller/supabase";

export const dynamic = "force-dynamic";

export default async function MentorCohortPage() {
  const user = await getCurrentUser();
  if (!user) return <p className="text-sm text-red-600">Not signed in.</p>;

  let scope;
  try {
    scope = await scopedReseller(user);
  } catch (err) {
    if (err instanceof ResellerScopeError) notFound();
    throw err;
  }

  const db = resellerSupabase(scope);
  const cohorts = await db.ownedCohorts();
  if (cohorts.length === 0) notFound();

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-ink-900 dark:text-ink-50">Cohorts</h2>
        <p className="text-xs text-ink-500">
          Roll-up view for accelerator cohorts you own. Click through for founder-level detail.
        </p>
      </div>
      <ul className="space-y-2">
        {cohorts.map((c) => (
          <li
            key={c.id}
            className="flex items-center justify-between rounded-lg border border-surface-200 bg-white p-3 dark:border-surface-700 dark:bg-surface-800"
          >
            <div>
              <p className="text-sm font-medium text-ink-900 dark:text-ink-100">{c.name}</p>
              <p className="text-xs text-ink-500">
                Created {new Date(c.created_at).toISOString().slice(0, 10)}
              </p>
            </div>
            <Link
              href="/reseller/mentor"
              className="text-xs text-brand-700 hover:underline dark:text-brand-300"
            >
              View founders
            </Link>
          </li>
        ))}
      </ul>
      <p className="rounded-lg border border-dashed border-surface-300 p-3 text-xs text-ink-500 dark:border-surface-600">
        TODO: nightly-refreshed mentor_weekly_heat view feeds the founders x weeks heat-map here.
      </p>
    </div>
  );
}
