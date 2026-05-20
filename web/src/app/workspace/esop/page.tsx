import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { EsopClient } from "./esop-client";

export const metadata: Metadata = {
  title: "ESOP Vesting | BlockID",
  description:
    "Grant and manage employee stock option vesting on BlockID.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function EsopPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/esop");

  return (
    <WorkspaceLayout user={user}>
      <div className="p-6 max-w-5xl mx-auto">
        <EsopClient />
      </div>
    </WorkspaceLayout>
  );
}
