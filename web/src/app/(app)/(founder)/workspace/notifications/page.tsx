// Wave 27C — founder notification hub (activity feed).
//
// The email-preferences page moved to /workspace/notifications/preferences.
// This route now hosts the unified activity inbox (TBR opens, investor Q&A,
// new investor leads, share mints, analysis completions).

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { NotificationFeedClient } from "./feed-client";

export const metadata: Metadata = {
  title: "Notifications",
  description: "Your BlockID activity — investor views, questions, leads, and analysis completions.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function NotificationsFeedPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/notifications");

  const isSandbox = await getCurrentProjectIsSandbox();

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-3xl mx-auto">
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-ink-800 dark:text-ink-100">Notifications</h1>
            <p className="text-sm text-ink-700 dark:text-ink-300 mt-1">
              Investor views, questions, leads, and analysis events from across your BlockID reports.
            </p>
          </div>
          <a
            href="/workspace/notifications/preferences"
            className="text-xs text-brand-700 dark:text-brand-300 hover:underline shrink-0"
          >
            Email preferences →
          </a>
        </div>

        <NotificationFeedClient />
      </div>
    </WorkspaceLayout>
  );
}
