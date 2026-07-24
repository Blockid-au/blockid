// Goals tab — mentor-set targets with dates + status. RSC read; write UI
// (form -> POST /api/reseller/mentor/[id]/goals) deferred.

import { getCurrentUser } from "@/lib/auth";
import { scopedReseller, ResellerScopeError } from "@/lib/reseller/scope";
import { resellerSupabase } from "@/lib/reseller/supabase";

export const dynamic = "force-dynamic";

export default async function MentorGoalsTab({
  params,
}: {
  params: Promise<{ founderId: string }>;
}) {
  const { founderId } = await params;
  const user = await getCurrentUser();
  if (!user) return null;
  let scope;
  try {
    scope = await scopedReseller(user);
  } catch (err) {
    if (err instanceof ResellerScopeError) return null;
    throw err;
  }
  const db = resellerSupabase(scope);
  const goals = await db.mentorGoals(founderId);

  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-500">
        Mentor-set goals for this founder. Founder dashboard reads these as read-only.
      </p>
      {goals.length === 0 && (
        <p className="rounded-lg border border-dashed border-surface-300 p-3 text-xs text-ink-500 dark:border-surface-600">
          No goals set. TODO: add form that POSTs to
          /api/reseller/mentor/{founderId}/goals.
        </p>
      )}
      <ul className="space-y-2">
        {goals.map((g) => (
          <li
            key={g.id}
            className="flex items-center justify-between rounded-lg border border-surface-200 p-3 text-sm dark:border-surface-700"
          >
            <div>
              <p className="font-medium text-ink-900 dark:text-ink-100">{g.title}</p>
              {g.target_date && (
                <p className="text-xs text-ink-500">Target: {g.target_date.slice(0, 10)}</p>
              )}
            </div>
            <span className="rounded-full bg-surface-100 px-2 py-0.5 text-xs text-ink-700 dark:bg-surface-700 dark:text-ink-200">
              {g.status}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
