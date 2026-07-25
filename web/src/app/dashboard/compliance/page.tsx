import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { CompliancePanel } from "@/components/dashboard/compliance-panel";

// P5-tax-invoice-checker-panel-mount — /dashboard/compliance host route.
//
// Server-only shell that mounts <CompliancePanel />, which itself carries
// the 7 tiles (ESIC, s708, GST, R&D, WGEA, Modern Slavery, Tax Invoice
// history). The panel is a client component that fetches its endpoints
// on mount, so this page only supplies the auth gate + shell chrome.
//
// Unblocks the P5-tax-invoice-checker-tile-e2e Playwright spec — its
// HOST_ROUTES list checks /dashboard/compliance first, so the tile is
// now reachable end-to-end.

export const metadata: Metadata = {
  title: "AU Compliance | BlockID",
  description:
    "Raise-blocker compliance checks — ESIC, s708(8) wholesale certs, GST, R&D Tax Incentive, WGEA, Modern Slavery, ATO tax invoices — all in one panel.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ComplianceDashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/dashboard/compliance");

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
        </header>
        <CompliancePanel />
        <p className="text-xs text-muted-foreground">
          Want more detail on a specific check?{" "}
          <Link
            href="/compliance/calendar"
            className="text-brand-600 hover:underline"
          >
            Subscribe to the compliance calendar
          </Link>{" "}
          to get every deadline (BAS, ASIC annual review, R&amp;D, WGEA,
          Modern Slavery) in your own calendar app.
        </p>
      </div>
    </WorkspaceLayout>
  );
}
