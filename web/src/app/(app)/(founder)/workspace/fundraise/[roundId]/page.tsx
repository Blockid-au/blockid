import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { RoundClient } from "./round-client";

export const metadata: Metadata = {
  title: "Fundraise round | BlockID",
  description: "Track soft-circled, committed and funded amounts against your round target.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// The round itself is fetched client-side from /api/fundraise/[roundId],
// which resolves the caller's role through getProjectScope — the page adds
// nothing keyed on the caller (S18-B guard: no project-record reads here).
export default async function FundraiseRoundPage({ params }: { params: Promise<{ roundId: string }> }) {
  const { roundId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/auth/login?next=/workspace/fundraise/${encodeURIComponent(roundId)}`);

  const isSandbox = await getCurrentProjectIsSandbox();

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-5xl mx-auto">
        <RoundClient roundId={roundId} />
      </div>
    </WorkspaceLayout>
  );
}
