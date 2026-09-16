// /workspace/weekly-digest — Advisor weekly digest.
// S31-B (2026-09-13): honest "not available yet" surface. The previous page
// promised "Coming Soon — Estimated: Q3 2026" and offered an
// upgrade button under a feature that does not exist. The founder and investor Monday digests exist as emails; a curated advisor roll-up page does not.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { NotAvailableYet } from "@/components/workspace/not-available-yet";
import { Send } from "lucide-react";

export const metadata: Metadata = {
  title: "Weekly Digest | Workspace | BlockID",
  description: "A curated Monday digest across your advisory clients is not available yet.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function WeeklyDigestPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/weekly-digest");

  const isSandbox = await getCurrentProjectIsSandbox();

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <NotAvailableYet
        feature="advisor_weekly_digest"
        title="Weekly Digest"
        icon={Send}
        userEmail={user.email}
        reason="A single Monday roll-up of every client's SVI move, new evidence and cap-table changes is not built yet. Each client's changes are visible on their roster row and in your notes, and your own Monday email digest (as a founder or investor) can be switched on under Notifications."
        alternatives={[
          { href: "/workspace/advisor/roster", label: "Client Roster — per-client SVI and engagement" },
          { href: "/workspace/advisor/notes", label: "Engagement notes" },
          { href: "/workspace/notifications", label: "Email digest preferences" },
        ]}
      />
    </WorkspaceLayout>
  );
}
