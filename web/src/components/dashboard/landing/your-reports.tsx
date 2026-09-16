// Block 5 · Your reports — G13-W3-IA3 (spec §B.1 row 5, §B.4 row 5).
//
// Last 3 artefacts (the `recentReports` query the old page ran) with a
// link to each; one CTA: "Open reports" → /workspace/reports.
//
// Empty state: "Your first Business Report is free (10 pages). It is what
// investors and evaluators read first." → Generate → /workspace/reports/business.

import { FileText, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { RecentReport } from "@/lib/dashboard/landing-data";
import { LandingBlock, LandingCta, type LandingContext } from "./landing-grid";

export interface YourReportsProps {
  ctx: LandingContext;
  reports: readonly RecentReport[];
}

export const REPORTS_EMPTY = "Your first Business Report is free (10 pages). It is what investors and evaluators read first.";

export function reportTitle(r: RecentReport): string {
  const raw = r.raw_input?.trim();
  if (raw) return raw.length > 60 ? `${raw.slice(0, 60)}…` : raw;
  const when = r.created_at ? new Date(r.created_at).toLocaleDateString("en-AU") : "";
  return when ? `Analysis ${when}` : "Analysis";
}

export function YourReports({ ctx, reports }: YourReportsProps) {
  const empty = reports.length === 0;
  return (
    <LandingBlock
      name="your-reports"
      order={5}
      title="Your reports"
      icon={FileText}
      span="third"
      empty={empty}
      cta={
        empty ? (
          <LandingCta block="your-reports" href="/workspace/reports/business" ctx={ctx} action="generate" testId="landing-reports-cta">
            Generate
          </LandingCta>
        ) : (
          <LandingCta block="your-reports" href="/workspace/reports" ctx={ctx} action="open_reports" testId="landing-reports-cta">
            Open reports
          </LandingCta>
        )
      }
    >
      {empty ? (
        <p className="text-sm leading-relaxed text-secondary">{REPORTS_EMPTY}</p>
      ) : (
        <ul className="divide-y divide-line-subtle" data-landing-reports>
          {reports.slice(0, 3).map((r) => (
            <li key={r.id}>
              <Link href={`/workspace/reports/${r.id}`} className="-mx-2 flex items-center gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-surface-sunken">
                <FileText className="h-4 w-4 shrink-0 text-tertiary" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-primary">{reportTitle(r)}</span>
                  <span className="block text-[10px] text-tertiary">
                    {r.created_at ? new Date(r.created_at).toLocaleDateString("en-AU") : ""}
                    {r.total_svi != null ? ` · SVI ${r.total_svi}` : ""}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-tertiary/60" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </LandingBlock>
  );
}
