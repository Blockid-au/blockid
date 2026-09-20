// /workspace/investor/digest — HIDDEN (G20-F1, 2026-09-20).
// The page read `watchlist_digest` (migration 0314), which no cron writes,
// so every investor saw "Your first digest arrives Monday" forever. The
// Monday e-mail (api/cron/investor-weekly-digest) is the live surface; the
// watchlist page shows the same weekly movers. Key: investor_digest.
import { Send } from "lucide-react";
import { HiddenWorkspacePage, hiddenPageMetadata } from "@/components/workspace/hidden-feature-page";

export const metadata = hiddenPageMetadata("Weekly digest");
export const dynamic = "force-dynamic";

export default function InvestorDigestPage() {
  return (
    <HiddenWorkspacePage
      feature="investor_digest"
      path="/workspace/investor/digest"
      title="Weekly digest"
      icon={Send}
      reason="An in-app digest page is not offered yet. Your Monday e-mail carries the week's movers across your watchlist, and the watchlist page shows the same deltas any day."
      alternatives={[
        { href: "/workspace/investor/watchlist", label: "Watchlist — weekly movers" },
        { href: "/workspace/settings/notifications", label: "E-mail digest preferences" },
      ]}
      backHref="/workspace/investor"
      backLabel="Back to Dashboard"
    />
  );
}
