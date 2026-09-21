// /workspace/reports — "All reports" (S-IA2, spec §A.1 row `/workspace/reports`,
// empty state §B.4 block 5).
//
// One list of every generated artefact the signed-in founder has, newest
// first, each row with a type chip + title + date + link. Data comes from
// the shared loaders in ./load-reports.ts; the per-type tabs (business,
// investor-pack, weekly, c-level) render from the hub layout.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectIsSandbox, getProjectScope } from "@/lib/projects";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { loadAllReports, type ReportListItem } from "./load-reports";
import { ReportTypeChip } from "./report-type-chip";

export const metadata: Metadata = {
  title: "Reports | BlockID",
  description: "Every report generated for your startup — business, investor pack, weekly and C-level.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const GENERATE_LINKS: ReadonlyArray<{ label: string; href: string }> = [
  { label: "Business report", href: "/workspace/reports/business" },
  { label: "Investor pack", href: "/workspace/reports/investor-pack" },
  { label: "C-level", href: "/workspace/reports/c-level" },
  { label: "Weekly", href: "/workspace/reports/weekly" },
  { label: "LP report", href: "/workspace/lp-report" },
  { label: "Quarterly cohort report", href: "/workspace/accelerator/quarterly-report" },
];

function formatDate(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function ReportRow({ item }: { item: ReportListItem }) {
  const linkClass =
    "inline-flex items-center rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-ink-700 hover:bg-slate-50 transition-colors";
  return (
    <li
      data-testid="report-row"
      data-kind={item.kind}
      data-date={item.date}
      className="flex items-center gap-3 border-b border-surface-200 px-4 py-3 last:border-0"
    >
      <ReportTypeChip kind={item.kind} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink-800">{item.title}</p>
        {item.meta ? <p className="truncate text-xs text-ink-700">{item.meta}</p> : null}
      </div>
      <time dateTime={item.date} className="shrink-0 font-mono text-xs text-ink-600">
        {formatDate(item.date)}
      </time>
      {item.download ? (
        <a href={item.href} download className={linkClass}>
          Download
        </a>
      ) : (
        <Link href={item.href} className={linkClass}>
          View
        </Link>
      )}
    </li>
  );
}

export default async function AllReportsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/reports");

  const isSandbox = await getCurrentProjectIsSandbox();
  // S18-B — member-aware: owner-keyed reads (weekly snapshots) resolve off
  // the OWNER's record; caller-keyed artefacts stay per caller.
  const scope = await getProjectScope("viewer");
  const items = await loadAllReports(user, scope);

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="mx-auto max-w-3xl p-6">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-ink-800">All reports</h1>
          <p className="mt-1 text-sm text-ink-700">Every report generated for your startup, newest first.</p>
        </div>

        <nav aria-label="Generate a report" className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="font-semibold uppercase tracking-[0.14em] text-ink-700">Generate</span>
          {GENERATE_LINKS.map((g) => (
            <Link key={g.href} href={g.href} className="text-brand-600 hover:underline">
              {g.label}
            </Link>
          ))}
        </nav>

        {items.length > 0 ? (
          <ul className="overflow-hidden rounded-xl border border-surface-200 bg-white">
            {items.map((item) => (
              <ReportRow key={item.key} item={item} />
            ))}
          </ul>
        ) : (
          <div
            data-testid="reports-empty"
            className="rounded-2xl border border-dashed border-surface-200 bg-white px-6 py-16 text-center"
          >
            <p className="font-medium text-ink-600">Your first Business Report is free (10 pages).</p>
            <p className="mt-1 text-sm text-ink-700">It is what investors and evaluators read first.</p>
            <Link
              href="/workspace/reports/business"
              className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-action px-5 text-sm font-semibold text-white transition-colors hover:bg-action-hover"
            >
              Generate
            </Link>
          </div>
        )}
      </div>
    </WorkspaceLayout>
  );
}
