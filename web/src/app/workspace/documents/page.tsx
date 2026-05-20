import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { DocumentsClient } from "./documents-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Documents & Data Room | BlockID",
};

export default async function DocumentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/documents");

  return (
    <WorkspaceLayout user={user}>
      <div className="p-6 max-w-4xl mx-auto">
        <DocumentsClient />
      </div>
    </WorkspaceLayout>
  );
}
