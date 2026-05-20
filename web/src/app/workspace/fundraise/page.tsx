import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { FundraiseClient } from "./fundraise-client";

export const metadata: Metadata = {
  title: "Fundraise | BlockID",
  description: "Model fundraise rounds, calculate dilution, and manage your fundraising workflow.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function FundraisePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/fundraise");

  return (
    <WorkspaceLayout user={user}>
      <div className="p-6 max-w-4xl mx-auto">
        <FundraiseClient />
      </div>
    </WorkspaceLayout>
  );
}
