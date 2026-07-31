import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertCircle, ArrowUpRight, RefreshCcw } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { AccessTierBadge } from "@/components/mentor/access-tier-badge";
import {
  isEffective,
  isExpired,
  isExpiringSoon,
  type MentorAccessGrant,
} from "@/lib/mentor/access-tiers";
import { loadAllGrantsForFounder } from "@/lib/mentor/access-tiers-server";
import { RevokeButton } from "./revoke-button";

// Founder-side list of every mentor who currently has (or once had) access
// to their startup. Per docs/plans/mentor-consent-model.md — this is the
// single revocation surface. Every mentor.* audit row can be traced back to
// a grant listed here.

export const metadata: Metadata = {
  title: "Mentor access · Settings · BlockID",
  description:
    "Manage which mentors have access to your BlockID startup. Revoke or change tier any time.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface EnrichedGrant extends MentorAccessGrant {
  mentorLabel: string;
  mentorEmail: string;
  resellerName: string;
}

async function enrichGrants(
  grants: MentorAccessGrant[],
): Promise<EnrichedGrant[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return grants.map((g) => ({
      ...g,
      mentorLabel: "Mentor",
      mentorEmail: "",
      resellerName: "Mentor",
    }));
  }
  const mentorIds = Array.from(new Set(grants.map((g) => g.mentor_user_id)));
  const resellerIds = Array.from(new Set(grants.map((g) => g.reseller_id)));

  const [mentorRes, resellerRes] = await Promise.all([
    mentorIds.length
      ? supabase
          .from("app_users")
          .select("id, email, display_name")
          .in("id", mentorIds)
      : Promise.resolve({ data: [] as { id: string; email: string; display_name: string | null }[] }),
    resellerIds.length
      ? supabase.from("resellers").select("id, name").in("id", resellerIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const mentorMap = new Map<string, { email: string; display_name: string | null }>();
  for (const row of (mentorRes.data ?? []) as { id: string; email: string; display_name: string | null }[]) {
    mentorMap.set(row.id, { email: row.email, display_name: row.display_name });
  }
  const resellerMap = new Map<string, string>();
  for (const row of (resellerRes.data ?? []) as { id: string; name: string }[]) {
    resellerMap.set(row.id, row.name);
  }

  return grants.map((g) => {
    const m = mentorMap.get(g.mentor_user_id);
    return {
      ...g,
      mentorLabel: m?.display_name ?? m?.email ?? "Mentor",
      mentorEmail: m?.email ?? "",
      resellerName: resellerMap.get(g.reseller_id) ?? "Mentor",
    };
  });
}

export default async function MentorAccessSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/dashboard/settings/mentor-access");
  const isSandbox = await getCurrentProjectIsSandbox();

  let enriched: EnrichedGrant[] = [];
  try {
    const raw = await loadAllGrantsForFounder(user.id);
    enriched = await enrichGrants(raw);
  } catch {
    // Table may not exist yet in local dev — degrade to empty state.
    enriched = [];
  }

  const active = enriched.filter((g) => isEffective(g));
  const historical = enriched.filter((g) => !isEffective(g));

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="mx-auto max-w-3xl p-6 pb-24">
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-700">
            Settings
          </p>
          <h1 className="mt-1 text-2xl font-bold text-ink-900">
            Mentor access
          </h1>
          <p className="mt-2 text-sm text-ink-600">
            Everyone below has access to some part of your BlockID startup.
            Revoke takes effect immediately.
          </p>
        </header>

        {active.length === 0 ? <EmptyState /> : <ActiveList grants={active} />}

        {historical.length > 0 ? (
          <section className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-ink-500">
              History
            </h2>
            <p className="mt-1 text-xs text-ink-500">
              Revoked and expired grants — kept for compliance.
            </p>
            <ul className="mt-3 space-y-2">
              {historical.slice(0, 10).map((g) => (
                <li
                  key={g.id}
                  className="flex items-center justify-between rounded-2xl border border-surface-200 bg-white/60 px-4 py-3 text-xs text-ink-600 dark:border-white/10 dark:bg-surface-100/60 dark:text-ink-300"
                >
                  <span>
                    <strong className="font-semibold text-ink-800 dark:text-ink-100">
                      {g.resellerName}
                    </strong>
                    {" · "}
                    {g.revoked_at
                      ? `revoked ${new Date(g.revoked_at).toLocaleDateString()}`
                      : `expired ${g.expires_at ? new Date(g.expires_at).toLocaleDateString() : ""}`}
                  </span>
                  <AccessTierBadge tier={g.tier} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </WorkspaceLayout>
  );
}

function EmptyState() {
  return (
    <div className="rounded-3xl border border-dashed border-surface-300 bg-white p-8 text-center dark:border-white/10 dark:bg-surface-100">
      <p className="text-sm font-semibold text-ink-800 dark:text-ink-100">
        No mentors have access.
      </p>
      <p className="mt-1 text-xs text-ink-600 dark:text-ink-300">
        Attributed mentors see only your growth phase &mdash; nothing else.
      </p>
    </div>
  );
}

function ActiveList({ grants }: { grants: EnrichedGrant[] }) {
  return (
    <ul className="space-y-3">
      {grants.map((g) => {
        const expiringSoon = isExpiringSoon(g, 30);
        const expired = isExpired(g);
        return (
          <li
            key={g.id}
            className="rounded-3xl border border-surface-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-surface-100"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-base font-semibold text-ink-900 dark:text-ink-100">
                    {g.resellerName}
                  </p>
                  <AccessTierBadge tier={g.tier} showTooltip />
                  {expiringSoon ? (
                    <span
                      className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700"
                      title="Expires within 30 days"
                    >
                      <span
                        aria-hidden="true"
                        className="h-1.5 w-1.5 rounded-full bg-amber-500"
                      />
                      Expiring soon
                    </span>
                  ) : null}
                  {expired ? (
                    <span className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                      <AlertCircle aria-hidden="true" className="h-3 w-3" />
                      Expired
                    </span>
                  ) : null}
                </div>
                {g.mentorEmail ? (
                  <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
                    {g.mentorLabel} · {g.mentorEmail}
                  </p>
                ) : null}
                <p className="mt-2 text-xs text-ink-500">
                  Granted{" "}
                  <time dateTime={g.granted_at}>
                    {new Date(g.granted_at).toLocaleDateString()}
                  </time>
                  {g.expires_at ? (
                    <>
                      {" · "}Expires{" "}
                      <time dateTime={g.expires_at}>
                        {new Date(g.expires_at).toLocaleDateString()}
                      </time>
                    </>
                  ) : (
                    " · never expires (attributed tier)"
                  )}
                </p>
              </div>

              <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
                <Link
                  href={`/dashboard/mentor-invite?upgrade=${encodeURIComponent(g.id)}`}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-surface-200 bg-white px-3 text-xs font-medium text-ink-700 transition-colors hover:bg-surface-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-white/10 dark:bg-transparent dark:text-ink-200 dark:hover:bg-white/5"
                >
                  <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
                  Change tier
                </Link>
                {g.expires_at ? (
                  <Link
                    href={`/dashboard/mentor-invite?renew=${encodeURIComponent(g.id)}`}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-surface-200 bg-white px-3 text-xs font-medium text-ink-700 transition-colors hover:bg-surface-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-white/10 dark:bg-transparent dark:text-ink-200 dark:hover:bg-white/5"
                  >
                    <RefreshCcw aria-hidden="true" className="h-3.5 w-3.5" />
                    Renew
                  </Link>
                ) : null}
                <RevokeButton
                  grantId={g.id}
                  resellerId={g.reseller_id}
                  founderId={g.founder_user_id}
                  projectId={g.project_id}
                  tier={g.tier}
                  mentorName={g.resellerName}
                />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
