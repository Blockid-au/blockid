// Mentor console — roster (RSC).
//
// Renders attributed founders as an engagement-first view (never billing).
// Empty state teaches the 4-step onboarding via <MentorEmptyState/>.
//
// Data: reseller_attributions -> app_users -> latest svi_snapshot -> 30d
// mentor activity aggregates. All reads via resellerSupabase(scope) — the
// same auth wrapper used by /reseller/customers.

import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { scopedReseller, ResellerScopeError } from "@/lib/reseller/scope";
import { resellerSupabase } from "@/lib/reseller/supabase";
import {
  heatFromDays,
  HEAT_LABEL,
  phaseFromSviScore,
  PHASE_LABEL,
  recommendForFounder,
} from "@/lib/mentor/journey-stages";
import MentorEmptyState from "@/components/mentor/mentor-empty-state";
import { RoleLandingIntro } from "@/components/role/role-landing-intro";

export const dynamic = "force-dynamic";

const FILTER_LABELS = [
  { key: "phase", label: "SVI phase" },
  { key: "heat", label: "Engagement heat" },
  { key: "overdue", label: "Overdue check-in" },
  { key: "consent", label: "Consent tier" },
  { key: "cohort", label: "Cohort" },
];

interface SearchParams {
  filter?: string;
  tab?: string;
}

export default async function MentorRosterPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
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
  const [customers, sviRaw, cohorts] = await Promise.all([
    db.attributedCustomers(),
    db.portfolioSviRaw(),
    db.ownedCohorts(),
  ]);

  // latest SVI score per user (attributedCustomers already gives canonical
  // stage but we want the raw score for the roster table).
  const scoreByUser = new Map<string, number>();
  for (const s of sviRaw) {
    if (typeof s.score === "number") scoreByUser.set(s.project_id, s.score);
  }

  const days = await db.mentorActivityDays(customers.map((c) => c.user_id));

  const params = (await searchParams) ?? {};
  const filter = params.filter ?? "all";

  const rows = customers.map((c) => {
    const score = scoreByUser.get(c.user_id) ?? null;
    const phase = phaseFromSviScore(score);
    const d = days.get(c.user_id) ?? null;
    const heat = heatFromDays(d);
    const rec = recommendForFounder(phase, heat, d);
    return { c, score, phase, heat, d, rec };
  });

  const filtered =
    filter === "overdue" ? rows.filter((r) => r.heat === "cold" || r.heat === "cool") : rows;

  if (customers.length === 0) {
    return (
      <div className="space-y-4">
        <RoleLandingIntro role="mentor" />
        <MentorHeaderBar cohortCount={cohorts.length} />
        <MentorEmptyState />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <RoleLandingIntro role="mentor" />
      <MentorHeaderBar cohortCount={cohorts.length} />

      <div className="flex flex-wrap gap-2" role="toolbar" aria-label="Roster filters">
        <Link
          href="/reseller/mentor"
          className={`rounded-full px-3 py-1 text-xs ${filter === "all" ? "bg-brand-600 text-white" : "bg-surface-100 text-ink-700 hover:bg-surface-200 dark:bg-surface-800 dark:text-ink-200"}`}
        >
          All ({rows.length})
        </Link>
        <Link
          href="/reseller/mentor?filter=overdue"
          className={`rounded-full px-3 py-1 text-xs ${filter === "overdue" ? "bg-brand-600 text-white" : "bg-surface-100 text-ink-700 hover:bg-surface-200 dark:bg-surface-800 dark:text-ink-200"}`}
        >
          Overdue check-in
        </Link>
        {FILTER_LABELS.slice(0, -1).map((f) => (
          <span
            key={f.key}
            className="rounded-full border border-dashed border-surface-300 px-3 py-1 text-xs text-ink-500 dark:border-surface-600"
          >
            {f.label}
          </span>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-surface-200 dark:border-surface-700">
        <table className="min-w-full text-sm">
          <thead className="bg-surface-50 text-left text-xs uppercase tracking-wide text-ink-500 dark:bg-surface-800">
            <tr>
              <th className="px-3 py-2">Founder</th>
              <th className="px-3 py-2">Phase</th>
              <th className="px-3 py-2">Heat</th>
              <th className="px-3 py-2">Last activity</th>
              <th className="px-3 py-2">Next step</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(({ c, phase, heat, d, rec }) => (
              <tr
                key={c.user_id}
                className="border-t border-surface-100 hover:bg-surface-50 dark:border-surface-800 dark:hover:bg-surface-800/50"
              >
                <td className="px-3 py-2">
                  <Link
                    href={`/reseller/mentor/${c.user_id}/overview`}
                    className="font-medium text-brand-700 hover:underline dark:text-brand-300"
                  >
                    {c.display_name ?? c.email}
                  </Link>
                </td>
                <td className="px-3 py-2 text-ink-700 dark:text-ink-200">{PHASE_LABEL[phase]}</td>
                <td className="px-3 py-2 text-ink-700 dark:text-ink-200">{HEAT_LABEL[heat]}</td>
                <td className="px-3 py-2 text-ink-500">{d === null ? "never" : `${d}d ago`}</td>
                <td className="px-3 py-2 text-xs text-ink-600 dark:text-ink-300">
                  {rec.suggestedNextStep}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MentorHeaderBar({ cohortCount }: { cohortCount: number }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <div>
        <h2 className="text-lg font-semibold text-ink-900 dark:text-ink-50">Mentees</h2>
        <p className="text-xs text-ink-500">
          Engagement view — see /reseller/customers for the billing view.
        </p>
      </div>
      {cohortCount > 0 && (
        <Link
          href="/reseller/mentor/cohort"
          className="rounded-md border border-surface-300 bg-white px-3 py-1 text-xs text-ink-800 hover:bg-surface-50 dark:border-surface-600 dark:bg-surface-800 dark:text-ink-100"
        >
          Cohort roll-up ({cohortCount})
        </Link>
      )}
    </div>
  );
}
