// SVI & Reports tab — chronological list of svi_snapshots + assembled
// reports. Consent-tier-gated: below 'reports' tier renders locked cards
// with an audit-logged Request-access CTA. RSC.

import { getCurrentUser } from "@/lib/auth";
import { scopedReseller, ResellerScopeError } from "@/lib/reseller/scope";
import { resellerSupabase } from "@/lib/reseller/supabase";

export const dynamic = "force-dynamic";

export default async function MentorReportsTab({
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
  const [consent, sviRaw] = await Promise.all([
    db.mentorConsent(founderId),
    db.portfolioSviRaw(),
  ]);

  const tier = consent?.tier ?? "basic";
  const canReveal = tier === "reports" || tier === "full";
  const rows = sviRaw
    .filter((r) => r.project_id === founderId)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  if (!canReveal) {
    // TODO wire the CTA to POST /api/reseller/mentor/consent-request which
    // writes a mentor.consent_request row via db.auditLog(). Skeleton for now.
    return (
      <div className="rounded-lg border border-dashed border-surface-300 p-4 text-sm dark:border-surface-600">
        <p className="font-medium text-ink-800 dark:text-ink-100">Reports locked</p>
        <p className="mt-1 text-ink-600 dark:text-ink-300">
          This mentee has not granted &lsquo;reports&rsquo; tier consent. Ask them
          to enable it from their privacy settings.
        </p>
        <form action={`/api/reseller/mentor/${founderId}/consent-request`} method="post" className="mt-3">
          <button
            type="submit"
            className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
          >
            Request access
          </button>
        </form>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-surface-100 dark:divide-surface-800">
      {rows.length === 0 && (
        <li className="py-3 text-xs text-ink-500">No SVI snapshots yet.</li>
      )}
      {rows.map((r) => (
        <li key={r.id} className="flex items-center justify-between py-2 text-sm">
          <span className="text-ink-800 dark:text-ink-100">SVI snapshot</span>
          <span className="tabular-nums text-ink-600 dark:text-ink-300">
            {r.score ?? "—"}
          </span>
          <span className="text-xs text-ink-500">
            {new Date(r.created_at).toISOString().slice(0, 10)}
          </span>
        </li>
      ))}
    </ul>
  );
}
