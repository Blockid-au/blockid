import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { DividendsClient } from "./dividends-client";
import { DividendStatementsPanel } from "./dividend-statements-panel";
import { getCurrentProjectIsSandbox } from "@/lib/projects";

export const metadata: Metadata = {
  title: "Dividends | BlockID",
  description:
    "Declare dividends, issue AU shareholder distribution statements and download the dividend register on BlockID.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function DividendsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/dividends");

  const isSandbox = await getCurrentProjectIsSandbox();

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <DividendsClient />
        {/* S25-B — per-shareholder distribution statements + register for the recorded dividends. */}
        <DividendStatementsPanel />
      </div>
    </WorkspaceLayout>
  );
}
