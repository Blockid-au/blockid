/**
 * /funding/report/[id] — paid Money Finder report (T0242 minimal view →
 * T0244 full view: SVG Gantt, PDF, save-to-data-room, RDStatus deadline chips).
 *
 * Access mirrors GET /api/funding/report/[id]: signed-in owner, emailed
 * `?t=<access_token>`, or the Stripe `?s=<session>` success redirect. Any
 * other visitor gets a 404. Dynamic (reads cookies + query) and never cached.
 *
 * Layout (plan §4f / §4i D-4):
 *   header — startup summary from the intake, state / stage chips, generated
 *            date and "verified as of" date (AEST/AWST per state)
 *   owner bar — Download PDF · Save to data room (signed-in owner only)
 *   "Your next 3 actions" · ranked grant cards · programs · 12-month SVG
 *   Gantt (+ table twin) · narrative markdown · FUNDING_DISCLAIMER +
 *   FundingDisclaimer · Founder Radar upsell (`RadarUpsellCard`, T0247, copy from the timeline).
 *
 * The body is `FundingReportView` (components/funding/funding-report-view.tsx),
 * shared with the public sample at /funding/report/demo (S7-B); this page
 * only resolves the viewer and fills the owner-actions / upsell slots.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { FundingReportTracker } from "@/components/funding/funding-report-tracker";
import { FundingReportView } from "@/components/funding/funding-report-view";
import { ReportOwnerActions } from "@/components/funding/report-owner-actions";
import { RadarUpsellCard } from "@/components/funding/radar-upsell-card";
import { getCurrentUser } from "@/lib/auth";
import { canViewFundingReport, getFundingReport, publicFundingReport } from "@/lib/funding/reports";
import { computeRadarUpsellFacts, radarViewerKind } from "@/lib/funding/radar-upsell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your Money Finder report · BlockID.au",
  robots: { index: false, follow: false },
};

type Params = { id: string };
type Search = { t?: string; s?: string };

export default async function FundingReportPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const user = await getCurrentUser();
  const row = await getFundingReport(id);
  if (!row) notFound();
  const viewer = { userId: user?.id ?? null, token: sp.t ?? null, sessionId: sp.s ?? null };
  if (!canViewFundingReport(row, viewer)) notFound();
  const report = publicFundingReport(row, viewer);
  const ready = report.status === "ready";

  return (
    <MarketingShell>
      <FundingReportTracker reportId={report.id} paidVia={(report.paid_via as "one_off" | "credits" | "plan" | null) ?? "one_off"} />
      <FundingReportView
        report={report}
        signedIn={Boolean(user)}
        ownerActions={
          report.is_owner && ready ? <ReportOwnerActions reportId={report.id} projectId={report.project_id} className="mt-5" /> : null
        }
        afterBody={
          /* T0247 — A$3 → Founder Radar upsell. Hidden when the plan already paid
             for the report (the reader is a Radar subscriber). */
          report.paid_via !== "plan" ? (
            <RadarUpsellCard
              surface="funding_report"
              viewer={radarViewerKind(user)}
              facts={computeRadarUpsellFacts(report.timeline, report.meta?.today ?? new Date())}
              reportId={report.id}
              className="mt-10"
            />
          ) : null
        }
      />
    </MarketingShell>
  );
}
