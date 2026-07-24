import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { BarChart3, FileText, ArrowRight } from "lucide-react";

// Round 5.5 QA — /dashboard/reports index. Previously the directory only
// held /dashboard/reports/lp-quarterly, so /dashboard/reports itself 404'd.
// This index gives every account_type a single landing to reach the two
// report surfaces available today: the founder weekly-SVI report on
// /workspace/reports and the accelerator/incubator LP quarterly report on
// /dashboard/reports/lp-quarterly. Cohort/investor-specific reports link
// through the same shell as they land.

export const metadata: Metadata = {
  title: "Reports — Dashboard — BlockID",
  description:
    "Landing for BlockID startup reports — weekly SVI snapshots, LP quarterly rollups and investor summaries.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface ReportCard {
  href: string;
  title: string;
  description: string;
  icon: typeof BarChart3;
  audience: string;
}

const REPORT_CARDS: ReportCard[] = [
  {
    href: "/workspace/reports",
    title: "Weekly SVI report",
    description:
      "Rolling 12-week snapshot of your Startup Value Index — wins, gaps, and AI narrative for the last cycle.",
    icon: BarChart3,
    audience: "Founders",
  },
  {
    href: "/dashboard/reports/lp-quarterly",
    title: "LP quarterly report",
    description:
      "Cohort-wide LP-ready rollup: graduation milestones, follow-on capital, and portfolio SVI movement.",
    icon: FileText,
    audience: "Accelerators & incubators",
  },
];

export default async function DashboardReportsIndexPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/dashboard/reports");

  const isSandbox = await getCurrentProjectIsSandbox();

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold text-ink-900">Reports</h1>
          <p className="text-sm text-ink-600">
            Pick the report surface for your role. Weekly SVI is per-project;
            LP quarterly is cohort-wide.
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          {REPORT_CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <Link
                key={card.href}
                href={card.href}
                className="group rounded-2xl border border-ink-200 bg-white p-5 hover:border-brand-400 hover:shadow-sm transition"
              >
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-brand-50 p-2 text-brand-600">
                    <Icon className="h-5 w-5" aria-hidden />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold text-ink-900">
                        {card.title}
                      </h2>
                      <ArrowRight className="h-4 w-4 text-ink-400 group-hover:text-brand-600 transition" aria-hidden />
                    </div>
                    <p className="mt-1 text-xs uppercase tracking-wide text-ink-500">
                      {card.audience}
                    </p>
                    <p className="mt-2 text-sm text-ink-600">
                      {card.description}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </WorkspaceLayout>
  );
}
