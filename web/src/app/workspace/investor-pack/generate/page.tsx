// Investor pack generator — logged-in surface.
//
// Server component: gates on auth, resolves the founder's active project,
// assembles the pack payload server-side and hands it to the client so the
// preview strip renders instantly. The client then POSTs to
// /api/investor-pack/generate to produce and download the PDF.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getProjectIdFromRequest, getCurrentProjectIsSandbox } from "@/lib/projects";
import { assemblePackData } from "@/lib/investor-pack-assembler";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { InvestorPackGenerateClient } from "./generate-client";

export const metadata: Metadata = {
  title: "Generate Investor Pack | BlockID",
  description:
    "Assemble your SVI, valuation, fundraise readiness and cap table into a PDF you can send to investors.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function InvestorPackGeneratePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/auth/login?next=/workspace/investor-pack/generate");
  }

  const isSandbox = await getCurrentProjectIsSandbox();

  const projectId = await getProjectIdFromRequest();
  const data = await assemblePackData(user.id, projectId);

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <InvestorPackGenerateClient preview={data} />
    </WorkspaceLayout>
  );
}
