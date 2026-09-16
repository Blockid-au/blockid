import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { CompliancePanel } from "@/components/dashboard/compliance-panel";
import { ComplianceCalendarSection } from "./calendar-section";
import { EsicAssessmentSection } from "./esic-assessment-section";

// S-IA2 (spec §A.1) — /workspace/documents/compliance composes, in order:
//   #panel     Compliance panel      (ex /dashboard/compliance, this file)
//   #calendar  Compliance calendar   (ex /compliance/calendar → calendar-section.tsx)
//   #esic      ESIC self-assessment  (ex /workspace/esic-assessment → esic-assessment-section.tsx)
//
// The page authenticates once and passes `user` to each async section; every
// section keeps its own loaders + try/catch degradation. <CompliancePanel />
// is a client component that fetches its 7 tiles (ESIC, s708, GST, R&D, WGEA,
// Modern Slavery, Tax Invoice history) on mount.
//
// Unblocks the P5-tax-invoice-checker-tile-e2e Playwright spec — its
// HOST_ROUTES list checks /workspace/documents/compliance first, so the tile is
// reachable end-to-end.

export const metadata: Metadata = {
  title: "AU Compliance | BlockID",
  description:
    "AU compliance panel, deadline calendar and ESIC self-assessment — ESIC, s708(8), GST, R&D Tax Incentive, WGEA, Modern Slavery, ATO tax invoices.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ComplianceDashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/documents/compliance");

  const isSandbox = await getCurrentProjectIsSandbox();

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div
        className="mx-auto max-w-5xl px-6 pb-24 pt-6 space-y-6"
        data-testid="compliance-dashboard"
      >
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">
            Compliance
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink-800">
            AU compliance panel
          </h1>
          <p className="mt-2 text-sm text-ink-500">
            Every raise-blocker gate BlockID watches for you — Corporations
            Act, ITAA97, GST, R&amp;D, WGEA, Modern Slavery, ATO tax invoices.
            Click any tile to open the underlying workflow. Not tax or legal
            advice; confirm with your registered agent before lodging.
          </p>
          <nav aria-label="On this page" className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <a href="#panel" className="text-brand-600 hover:underline">Compliance panel</a>
            <a href="#calendar" className="text-brand-600 hover:underline">Compliance calendar</a>
            <a href="#esic" className="text-brand-600 hover:underline">ESIC self-assessment</a>
          </nav>
        </header>

        {/* ── (a) Compliance panel ─────────────────────────────────────── */}
        <section aria-labelledby="panel" className="space-y-4">
          <h2 id="panel" className="scroll-mt-24 text-xl font-semibold text-ink-800">
            Compliance panel
          </h2>
          <CompliancePanel />
          <p className="text-xs text-muted-foreground">
            Want more detail on a specific check?{" "}
            <Link
              href="#calendar"
              className="text-brand-600 hover:underline"
            >
              Subscribe to the compliance calendar
            </Link>{" "}
            to get every deadline (BAS, ASIC annual review, R&amp;D, WGEA,
            Modern Slavery) in your own calendar app.
          </p>
        </section>

        {/* ── (b) Compliance calendar (S-IA2, ex /compliance/calendar) ─── */}
        <ComplianceCalendarSection user={user} />

        {/* ── (c) ESIC self-assessment (S-IA2, ex /workspace/esic-assessment) */}
        <EsicAssessmentSection user={user} />
      </div>
    </WorkspaceLayout>
  );
}
