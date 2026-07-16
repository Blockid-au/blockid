// /workspace/advisor — advisor client portal.
//
// W5b: server component wrapped in FeatureGate("advisor_portal") which is
// the closest existing feature literal for the advisor.clients gate. Reads
// data via lib/advisor-portal (empty-state on missing tables).

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Feature } from "@/lib/entitlements";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { FeatureGate } from "@/components/access/FeatureGate";
import { getClientRoster, type ClientRow } from "@/lib/advisor-portal";

export const metadata: Metadata = {
  title: "Advisor Workspace — BlockID",
  description: "Client roster, engagement notes and weekly digest.",
};

export const dynamic = "force-dynamic";

const ADVISOR_FEATURE = "advisor_portal" as Feature;

export default async function AdvisorWorkspacePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/advisor");

  const roster = await getClientRoster(user.id);

  return (
    <WorkspaceLayout user={user}>
      <FeatureGate feature={ADVISOR_FEATURE} label="Advisor workspace">
        <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
          <header>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-ink-900">Advisor Workspace</h1>
              <span className="inline-flex items-center rounded-full border border-brand-300 bg-brand-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-700 dark:border-brand-700 dark:bg-brand-950/40 dark:text-brand-300">
                Beta
              </span>
            </div>
            <p className="text-sm text-ink-500 mt-1">
              Track your client roster, log engagement notes and opt into the
              weekly digest.
            </p>
          </header>

          {/* Client Roster */}
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-ink-900">Client roster</h2>
                <p className="text-sm text-ink-500 mt-1">
                  {roster.length === 0
                    ? "No clients yet."
                    : `${roster.length} client${roster.length === 1 ? "" : "s"} tracked.`}
                </p>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200 dark:border-slate-800">
                    <th className="py-2 pr-4">Startup</th>
                    <th className="py-2 pr-4">Founder</th>
                    <th className="py-2 pr-4">SVI</th>
                    <th className="py-2 pr-4">Engagement</th>
                    <th className="py-2 pr-4">Last activity</th>
                    <th className="py-2 pr-4">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-ink-500">
                        <p className="italic">No clients on your roster yet.</p>
                        <p className="mt-2 text-xs">
                          Invite a founder to add them here — advisor equity and
                          engagement will sync automatically.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    roster.map((c) => (
                      <ClientRosterRow key={c.id} client={c} />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Engagement Notes */}
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
            <h2 className="text-lg font-semibold text-ink-900">Engagement notes</h2>
            <p className="text-sm text-ink-500 mt-1">
              Per-client notes stay private to you and are surfaced when
              preparing an update or LP report.
            </p>
            {roster.length === 0 ? (
              <p className="mt-4 text-sm text-ink-500 italic">
                Add a client first to start logging notes.
              </p>
            ) : (
              <ul className="mt-4 space-y-2">
                {roster.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/workspace/advisor/notes/${encodeURIComponent(c.id)}`}
                      className="inline-flex items-center gap-2 text-sm text-brand-600 hover:underline"
                    >
                      Notes · {c.startupName}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Weekly Digest opt-in (placeholder toggle) */}
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-ink-900">Weekly digest</h2>
                <p className="text-sm text-ink-500 mt-1">
                  A single Monday email summarising every client's SVI move,
                  new evidence and cap-table changes.
                </p>
              </div>
              <label className="inline-flex items-center gap-2 cursor-not-allowed opacity-60">
                <input type="checkbox" disabled className="h-4 w-4" />
                <span className="text-sm text-ink-500">Opt in (coming soon)</span>
              </label>
            </div>
          </section>
        </div>
      </FeatureGate>
    </WorkspaceLayout>
  );
}

function ClientRosterRow({ client }: { client: ClientRow }) {
  const pill: Record<ClientRow["engagement"], string> = {
    active: "bg-emerald-100 text-emerald-700",
    at_risk: "bg-amber-100 text-amber-800",
    dormant: "bg-slate-100 text-slate-700",
  };
  return (
    <tr className="border-b border-slate-100 dark:border-slate-800 last:border-0">
      <td className="py-2 pr-4 text-ink-900">{client.startupName}</td>
      <td className="py-2 pr-4 text-ink-700">{client.founderName ?? "—"}</td>
      <td className="py-2 pr-4 text-ink-700">
        {client.svi == null ? "—" : client.svi.toFixed(0)}
      </td>
      <td className="py-2 pr-4">
        <span
          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${pill[client.engagement]}`}
        >
          {client.engagement.replace("_", " ")}
        </span>
      </td>
      <td className="py-2 pr-4 text-ink-500">
        {client.lastActivityAt
          ? new Date(client.lastActivityAt).toLocaleDateString("en-AU")
          : "—"}
      </td>
      <td className="py-2 pr-4">
        <Link
          href={`/workspace/advisor/notes/${encodeURIComponent(client.id)}`}
          className="text-brand-600 hover:underline text-xs"
        >
          View →
        </Link>
      </td>
    </tr>
  );
}
