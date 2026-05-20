import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { DividendsClient } from "./dividends-client";

export const metadata: Metadata = {
  title: "Dividends | BlockID",
  description:
    "Declare and claim dividend distributions on BlockID.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function DividendsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/dividends");

  return (
    <WorkspaceLayout user={user}>
      <div className="p-6 max-w-5xl mx-auto">
        <DividendsClient />
      </div>
    </WorkspaceLayout>
  );
}
