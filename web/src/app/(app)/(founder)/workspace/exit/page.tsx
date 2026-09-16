import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { ExitClient } from "./exit-client";
import { getCurrentProjectIsSandbox } from "@/lib/projects";

export const metadata: Metadata = {
  title: "Exit Modeling | BlockID",
  description: "Model acquisition, IPO, and buyout scenarios for your startup.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ExitPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/exit");

  const isSandbox = await getCurrentProjectIsSandbox();

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-ink-800">Exit Modeling</h1>
          <p className="text-sm text-ink-700 mt-1">
            Model exit scenarios and see per-shareholder payouts with CGT estimates.
          </p>
        </div>
        <ExitClient />
        {/* S29-A — the two exit-preparation guides that sit beside the scenarios. */}
        <div className="mt-8 grid gap-3 sm:grid-cols-2" data-testid="exit-guides">
          <Link href="/workspace/exit/listing" className="rounded-2xl border border-surface-200 bg-white p-4 hover:border-brand-300">
            <p className="text-sm font-semibold text-ink-800">Listing readiness</p>
            <p className="mt-1 text-xs text-ink-600">ASX admission conditions and Nasdaq Capital Market standards as readiness indicators computed from your cap table, share price, bank lines and profile — with the rule each row comes from.</p>
          </Link>
          <Link href="/workspace/exit/clean-room" className="rounded-2xl border border-surface-200 bg-white p-4 hover:border-brand-300">
            <p className="text-sm font-semibold text-ink-800">Clean-room preparation</p>
            <p className="mt-1 text-xs text-ink-600">For a strategic sale to a competitor: clean team, document classification, redaction, access tiers, NDA and clean-team agreement, logging and destruction — backed by your data room.</p>
          </Link>
        </div>
      </div>
    </WorkspaceLayout>
  );
}
