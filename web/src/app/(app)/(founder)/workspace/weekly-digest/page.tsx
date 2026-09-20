// /workspace/weekly-digest — HIDDEN (G20-F1, 2026-09-20).
// The advisor roll-up page never had a data path (S31-B already rendered an
// honest card here). The founder and investor Monday digests are e-mails.
// Key: advisor_weekly_digest.
import { Send } from "lucide-react";
import { HiddenWorkspacePage, hiddenPageMetadata } from "@/components/workspace/hidden-feature-page";

export const metadata = hiddenPageMetadata("Weekly digest");
export const dynamic = "force-dynamic";

export default function WeeklyDigestPage() {
  return (
    <HiddenWorkspacePage
      feature="advisor_weekly_digest"
      path="/workspace/weekly-digest"
      title="Weekly digest"
      icon={Send}
      reason="A single Monday roll-up of every client's score move, new evidence and cap-table changes is not offered yet. Each client's changes sit on their roster row and in your notes; your own Monday e-mail digest is under Notifications."
      alternatives={[
        { href: "/workspace/advisor/roster", label: "Client roster — per-client score and engagement" },
        { href: "/workspace/advisor/notes", label: "Engagement notes" },
        { href: "/workspace/settings/notifications", label: "E-mail digest preferences" },
      ]}
      backHref="/workspace/advisor"
      backLabel="Back to Dashboard"
    />
  );
}
