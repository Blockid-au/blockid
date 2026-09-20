// /workspace/investors/access/new — HIDDEN (G20-F1, 2026-09-20).
// Was a static explainer ("the full builder form ships in a follow-up
// release"). Investor links are minted from the Access tab itself
// (/workspace/investors/access → POST /api/investor-link), so this page only
// answers the "not offered" card. Key: investor_access_link_builder.
import { Link2 } from "lucide-react";
import { HiddenWorkspacePage, hiddenPageMetadata } from "@/components/workspace/hidden-feature-page";

export const metadata = hiddenPageMetadata("Investor link builder");
export const dynamic = "force-dynamic";

export default function NewInvestorLinkPage() {
  return (
    <HiddenWorkspacePage
      feature="investor_access_link_builder"
      path="/workspace/investors/access/new"
      title="Investor link builder"
      icon={Link2}
      reason="A separate link-builder form is not offered. Every tracked investor link is created from the Access tab — name the investor, pick the sections, copy the link."
      alternatives={[
        { href: "/workspace/investors/access", label: "Create a tracked investor link" },
        { href: "/workspace/documents/data-room", label: "Your data room" },
      ]}
      backHref="/workspace/investors/access"
      backLabel="Back to Access"
    />
  );
}
