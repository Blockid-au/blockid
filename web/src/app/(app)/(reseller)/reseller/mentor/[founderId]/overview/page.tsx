// Overview tab — phase-aware "where they are / what changed / next" cards
// + compact timeline of the last 10 mentor events. RSC.

import { getCurrentUser } from "@/lib/auth";
import { scopedReseller, ResellerScopeError } from "@/lib/reseller/scope";
import { resellerSupabase } from "@/lib/reseller/supabase";
import {
  heatFromDays,
  phaseFromSviScore,
  recommendForFounder,
} from "@/lib/mentor/journey-stages";

export const dynamic = "force-dynamic";

export default async function MentorOverviewTab({
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
  const [sviRaw, checkins, notes, days] = await Promise.all([
    db.portfolioSviRaw(),
    db.mentorCheckins(founderId),
    db.mentorNotes(founderId),
    db.mentorActivityDays([founderId]),
  ]);
  const scores: number[] = sviRaw
    .filter((r) => r.project_id === founderId && typeof r.score === "number")
    .map((r) => r.score as number);
  const latest = scores.length > 0 ? scores[scores.length - 1] : null;
  const phase = phaseFromSviScore(latest);
  const heat = heatFromDays(days.get(founderId) ?? null);
  const rec = recommendForFounder(phase, heat, days.get(founderId) ?? null);

  const events = [
    ...checkins.map((c) => ({ kind: "check-in", ts: c.scheduled_at, label: c.status })),
    ...notes.map((n) => ({ kind: "note", ts: n.created_at, label: n.body.slice(0, 80) })),
  ]
    .sort((a, b) => (a.ts < b.ts ? 1 : -1))
    .slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card title="Where they are" body={`Phase: ${phase} · Heat: ${heat}`} />
        <Card
          title="What changed"
          body={
            scores.length > 1
              ? `SVI moved ${(scores[scores.length - 1] - scores[0]).toFixed(1)} pts`
              : "No delta yet"
          }
        />
        <Card title="What to do next" body={rec.suggestedNextStep} />
      </div>
      <section>
        <h3 className="mb-2 text-sm font-semibold text-ink-800 dark:text-ink-100">Recent activity</h3>
        {events.length === 0 ? (
          <p className="text-xs text-ink-500">No mentor events yet — log a check-in to get started.</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {events.map((e, i) => (
              <li key={i} className="flex gap-2 text-ink-700 dark:text-ink-300">
                <span className="w-14 text-ink-400">{e.kind}</span>
                <span className="w-24 text-ink-400">{new Date(e.ts).toISOString().slice(0, 10)}</span>
                <span className="truncate">{e.label}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Card({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-surface-200 bg-surface-50 p-3 dark:border-surface-700 dark:bg-surface-800">
      <p className="text-xs uppercase tracking-wide text-ink-500">{title}</p>
      <p className="mt-1 text-sm text-ink-900 dark:text-ink-100">{body}</p>
    </div>
  );
}
