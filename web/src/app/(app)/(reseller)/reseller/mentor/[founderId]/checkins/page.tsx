// Check-ins tab — upcoming + past sessions with a phase-aware agenda
// template. RSC.

import { getCurrentUser } from "@/lib/auth";
import { scopedReseller, ResellerScopeError } from "@/lib/reseller/scope";
import { resellerSupabase } from "@/lib/reseller/supabase";
import {
  heatFromDays,
  phaseFromSviScore,
  recommendForFounder,
} from "@/lib/mentor/journey-stages";

export const dynamic = "force-dynamic";

export default async function MentorCheckinsTab({
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
  const [checkins, sviRaw, days] = await Promise.all([
    db.mentorCheckins(founderId),
    db.portfolioSviRaw(),
    db.mentorActivityDays([founderId]),
  ]);

  const scores: number[] = sviRaw
    .filter((r) => r.project_id === founderId && typeof r.score === "number")
    .map((r) => r.score as number);
  const latest = scores.length > 0 ? scores[scores.length - 1] : null;
  const phase = phaseFromSviScore(latest);
  const heat = heatFromDays(days.get(founderId) ?? null);
  const rec = recommendForFounder(phase, heat, days.get(founderId) ?? null);

  const now = Date.now();
  const upcoming = checkins.filter((c) => new Date(c.scheduled_at).getTime() >= now);
  const past = checkins.filter((c) => new Date(c.scheduled_at).getTime() < now);

  return (
    <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-ink-800 dark:text-ink-100">Upcoming</h3>
        {upcoming.length === 0 ? (
          <p className="text-xs text-ink-500">
            No upcoming check-ins. TODO: add schedule button that writes to mentor_checkins.
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {upcoming.map((c) => (
              <li key={c.id} className="rounded border border-surface-200 p-2 dark:border-surface-700">
                <p>{new Date(c.scheduled_at).toISOString().slice(0, 16).replace("T", " ")}</p>
                {c.agenda && <p className="text-xs text-ink-500">{c.agenda}</p>}
              </li>
            ))}
          </ul>
        )}
        <h3 className="mt-4 text-sm font-semibold text-ink-800 dark:text-ink-100">Past</h3>
        <ul className="space-y-1 text-sm">
          {past.length === 0 && <li className="text-xs text-ink-500">No past sessions yet.</li>}
          {past.map((c) => (
            <li key={c.id} className="rounded border border-surface-100 p-2 dark:border-surface-800">
              <p>{new Date(c.scheduled_at).toISOString().slice(0, 10)}</p>
              {c.next_step && <p className="text-xs text-ink-600 dark:text-ink-400">Next: {c.next_step}</p>}
            </li>
          ))}
        </ul>
      </section>
      <aside className="rounded-lg border border-brand-100 bg-brand-50/60 p-3 text-xs text-ink-800 dark:border-brand-900/40 dark:bg-brand-900/20 dark:text-ink-100">
        <p className="mb-2 text-[11px] uppercase tracking-wide text-brand-800 dark:text-brand-200">
          Suggested agenda ({phase})
        </p>
        <ul className="list-disc space-y-1 pl-4">
          {rec.agendaTemplate.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
