// /workspace/advisor/roster/invite — HIDDEN (G20-F1, 2026-09-20).
// Was a static explainer ("the full invite composer ships in a follow-up
// release"). Clients are added by e-mail from the roster page itself.
// Key: advisor_roster_invite.
import { UserPlus } from "lucide-react";
import { HiddenWorkspacePage, hiddenPageMetadata } from "@/components/workspace/hidden-feature-page";

export const metadata = hiddenPageMetadata("Invite a client");
export const dynamic = "force-dynamic";

export default function InviteClientPage() {
  return (
    <HiddenWorkspacePage
      feature="advisor_roster_invite"
      path="/workspace/advisor/roster/invite"
      title="Invite a client"
      icon={UserPlus}
      reason="A separate invite composer is not offered. Add a client by e-mail straight from your roster; they get their score for free and you see it on the roster row."
      alternatives={[
        { href: "/workspace/advisor/roster", label: "Client roster — add a client" },
        { href: "/workspace/advisor/notes", label: "Engagement notes" },
      ]}
      backHref="/workspace/advisor/roster"
      backLabel="Back to Clients"
    />
  );
}
