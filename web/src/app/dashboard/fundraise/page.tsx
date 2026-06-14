import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { FundraisingReadinessClient } from "./fundraising-readiness-client";

export const metadata: Metadata = {
  title: "Fundraising Readiness · BlockID",
  description: "Check your startup's readiness for AU investor meetings — checklist, comparable raises, and priority gaps.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function FundraisingReadinessPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/dashboard/fundraise");

  return (
    <WorkspaceLayout user={user}>
      <FundraisingReadinessClient />
    </WorkspaceLayout>
  );
}
