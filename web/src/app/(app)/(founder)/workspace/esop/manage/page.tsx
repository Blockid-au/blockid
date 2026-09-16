import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { requireTierForPage } from "@/lib/entitlements/require-tier-for-page";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { EquityEsopClient } from "./equity-esop-client";
import { EsopDashboardClient } from "./esop-dashboard-client";
import { getCurrentProjectIsSandbox } from "@/lib/projects";

export const metadata: Metadata = {
  title: "Equity & ESOP",
  description: "Plan equity, design ESOP, and manage vesting for your AU startup.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function EquityEsopPage() {
  // Same gate as /workspace/esop: the hub tab shows a lock, the page must
  // enforce it too (a typed URL bypassed the lock — W2 review).
  await requireTierForPage({
    feature: "esop.manage",
    fromPath: "/workspace/esop/manage",
  });
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/esop/manage");

  const isSandbox = await getCurrentProjectIsSandbox();

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-6xl mx-auto">
        <EquityEsopClient />
      </div>

      {/* S-IA2 — ex /dashboard/esop: pool status, grants table and grant form. */}
      <section
        aria-labelledby="esop-manager-heading"
        className="max-w-4xl mx-auto px-4 py-8 border-t border-line-subtle"
      >
        <div className="mb-6">
          <h2 id="esop-manager-heading" className="text-2xl font-bold text-ink-900">
            ESOP Manager
          </h2>
          <p className="text-sm text-ink-500 mt-1">
            Employee Share Option Plan · Australian ESS Part 7A compliant · 4-year vesting
          </p>
        </div>

        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-100 px-4 py-3 text-sm text-amber-700">
          <strong>Before granting options:</strong> Engage a tax advisor (BDO, Pitcher Partners) to review your ESOP Plan Deed.
          Budget A$2–5K for legal work. See your ESOP_LEGAL_TEMPLATES.md for ready-to-use documents.
        </div>

        <EsopDashboardClient />
      </section>
    </WorkspaceLayout>
  );
}
