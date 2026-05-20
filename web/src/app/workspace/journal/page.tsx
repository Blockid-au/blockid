import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { JournalClient } from "./journal-client";

export const metadata: Metadata = {
  title: "Growth Journal | BlockID",
  description: "Track decisions, pivots, milestones, and learnings on your startup journey.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function JournalPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/journal");

  return (
    <WorkspaceLayout user={user}>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-ink-800">Growth Journal</h1>
          <p className="text-sm text-ink-700 mt-1">
            Document decisions, pivots, milestones, and learnings as your startup evolves.
          </p>
        </div>
        <JournalClient />
      </div>
    </WorkspaceLayout>
  );
}
