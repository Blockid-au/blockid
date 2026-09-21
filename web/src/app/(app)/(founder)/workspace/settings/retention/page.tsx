// /workspace/settings/retention — institutional admin (G21 P3-B): the
// organisation's data-retention window (`org_settings.retention_days`,
// migration 0428) applied by the weekly `org-retention` cron, plus the
// audit-export switch. Organisation OWNERS only; a solo / Free evaluator or
// an invited seat sees the "for organisations" card.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { ForOrganisationsCard } from "@/components/workspace/for-organisations-card";
import { readOrgSettings, resolveOrgAdmin } from "@/lib/org/admin";
import { ORG_RETENTION_TARGETS } from "@/lib/org/retention";
import { RetentionForm } from "./retention-form";

export const metadata: Metadata = {
  title: "Data retention",
  description: "How long your organisation keeps cohort snapshots, intake submissions and reviewer overrides.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const TARGET_COPY: Record<(typeof ORG_RETENTION_TARGETS)[number]["table"], string> = {
  cohort_snapshots: "Cohort snapshots — the point-in-time rows behind the Δ column and the Cohort Report movement chart",
  assessment_overrides: "Reviewer overrides recorded on your cohorts (the canonical score is untouched)",
  intake_submissions: "Intake submissions received through your /apply links (the applicant's e-mail and deck path)",
};

export default async function RetentionSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/settings/retention");
  const [isSandbox, admin] = await Promise.all([getCurrentProjectIsSandbox(), resolveOrgAdmin({ id: user.id, plan: user.plan ?? null })]);

  if (admin.status !== "ok" || !admin.org) {
    return (
      <WorkspaceLayout user={user} isSandbox={isSandbox}>
        <div className="p-6 max-w-3xl mx-auto">
          <h1 className="text-xl font-bold text-ink-800 mb-4">Data retention</h1>
          <ForOrganisationsCard feature="retention" title="Retention is set by the organisation owner" reason={admin.status === "ok" ? "no_org" : admin.status} headingId="retention-org-card" />
        </div>
      </WorkspaceLayout>
    );
  }

  const settings = await readOrgSettings(admin.org.id);

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-ink-800">Data retention</h1>
          <p className="text-sm text-ink-700 mt-1">
            <span className="font-medium">{admin.org.name}</span> · {admin.seats.length} seat{admin.seats.length === 1 ? "" : "s"}. Choose how long the organisation keeps the cohort snapshots, overrides and intake submissions created under the organisation owner&apos;s account (a seat holder&apos;s own cohorts are never touched). Applied every Sunday; each run is recorded on the audit log.
          </p>
        </div>

        <div className="bg-surface border border-surface-200 shadow-sm rounded-2xl p-6 mb-6">
          <RetentionForm initialRetentionDays={settings.retentionDays} initialAuditExportEnabled={settings.auditExportEnabled} available={settings.available} />
        </div>

        <section className="rounded-2xl border border-surface-200 bg-surface-sunken p-6 text-sm text-ink-700" aria-labelledby="retention-what">
          <h2 id="retention-what" className="text-sm font-semibold text-ink-800">
            What the window applies to
          </h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5">
            {ORG_RETENTION_TARGETS.map((t) => (
              <li key={t.table}>
                <code className="rounded bg-surface px-1 py-0.5 text-xs">{t.table}</code> — {TARGET_COPY[t.table]}
              </li>
            ))}
          </ul>
          <p className="mt-4">
            Never deleted by this setting: founders&apos; startups, scores, evidence, claims and reports (the startup owns its data), the cohorts themselves, and the append-only audit log. Retention runs weekly and removes at most 500 rows per table per run; a long backlog drains over a few weeks.
          </p>
          <p className="mt-2 text-xs text-ink-500">
            Last changed: {settings.updatedAt ? new Date(settings.updatedAt).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "never"}. Runbook: docs/ops/retention.md.
          </p>
        </section>
      </div>
    </WorkspaceLayout>
  );
}
