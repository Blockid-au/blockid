import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, ADMIN_EMAIL} from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { ShareholdersClient } from "./shareholders-client";

export const metadata: Metadata = {
  title: "Shareholders | BlockID",
  description:
    "Manage shareholders, issue shares, and view share certificates on BlockID.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ShareholdersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/shareholders");

  return (
    <WorkspaceLayout user={user}>
      <div className="p-6 max-w-6xl mx-auto">
        <ShareholdersClient
          isAdmin={
            user.email === ADMIN_EMAIL || user.role === "admin"
          }
        />
      </div>
    </WorkspaceLayout>
  );
}
