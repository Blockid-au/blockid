// Organisation audit export (G21 P3-B) — the section at the foot of
// /workspace/settings/audit. The OWNER of an organisation gets a window
// form (from / to, default the last 90 days, capped at 366) that downloads
// /api/org/audit-export.csv — every audit row written by the org's seats,
// formula-guarded, the export itself recorded. Anyone else sees the "for
// organisations" card. Server component: a plain GET form, no hooks.

import { ForOrganisationsCard } from "@/components/workspace/for-organisations-card";
import type { OrgAdmin } from "@/lib/org/admin";
import { EXPORT_DEFAULT_DAYS, EXPORT_MAX_DAYS } from "@/lib/org/audit-export";

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function OrgAuditExportSection({ admin, now = new Date() }: { admin: OrgAdmin; now?: Date }) {
  if (admin.status !== "ok" || !admin.org) {
    return (
      <div className="mt-8">
        <ForOrganisationsCard feature="audit_export" title="Organisation audit export" reason={admin.status === "ok" ? "no_org" : admin.status} headingId="org-audit-export" />
      </div>
    );
  }
  const to = isoDay(now);
  const from = isoDay(new Date(now.getTime() - EXPORT_DEFAULT_DAYS * 24 * 60 * 60 * 1000));
  return (
    <section className="mt-8 rounded-2xl border border-surface-200 bg-white p-6 shadow-sm" aria-labelledby="org-audit-export" data-testid="org-audit-export">
      <h2 id="org-audit-export" className="text-lg font-bold text-ink-800">
        Organisation audit export
      </h2>
      <p className="mt-1 text-sm text-ink-700">
        Every audit row written by the {admin.seats.length} seat{admin.seats.length === 1 ? "" : "s"} of <span className="font-medium">{admin.org.name}</span> — cohorts, evaluations, overrides, API reads — as a CSV. Default window: the last {EXPORT_DEFAULT_DAYS} days; at most {EXPORT_MAX_DAYS} days per file. Cells are guarded against spreadsheet formulas; the export itself is recorded on the log.
      </p>
      <form method="get" action="/api/org/audit-export.csv" className="mt-4 flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-ink-600">From</span>
          <input type="date" name="from" defaultValue={from} max={to} className="rounded border border-surface-200 bg-white px-2 py-1.5" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-ink-600">To</span>
          <input type="date" name="to" defaultValue={to} max={to} className="rounded border border-surface-200 bg-white px-2 py-1.5" />
        </label>
        <button type="submit" className="rounded bg-ink-800 px-3 py-1.5 text-white" data-testid="org-audit-export-submit">
          Download CSV
        </button>
        <a href="/workspace/settings/retention" className="text-ink-600 underline">
          Retention settings
        </a>
      </form>
    </section>
  );
}
