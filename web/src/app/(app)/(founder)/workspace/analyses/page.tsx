// /workspace/analyses — "Your analyses".
//
// The list endpoint is anonymous-tolerant, but this page lives behind the
// workspace shell, so it keeps the workspace's own sign-in redirect. Guests
// reach their own runs through the permalink on /analyze instead.

import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { parseClaimedParam } from "@/lib/analyses/summary";
import { AnalysesClient } from "./analyses-client";

export const metadata: Metadata = {
  title: "Your analyses | BlockID",
  description: "Every Startup Value Index analysis you have run, newest first.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AnalysesPage({
  searchParams,
}: {
  searchParams?: Promise<{ claimed?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/analyses");
  const isSandbox = await getCurrentProjectIsSandbox();
  const sp = (await searchParams) ?? {};
  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <AnalysesClient claimed={parseClaimedParam(sp.claimed)} />
    </WorkspaceLayout>
  );
}
