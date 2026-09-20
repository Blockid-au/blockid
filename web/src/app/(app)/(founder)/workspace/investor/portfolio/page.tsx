// /workspace/investor/portfolio — HIDDEN (G20-F1, 2026-09-20).
// Was a static explainer ("the full portfolio grid ships in a follow-up
// release") behind a Program-plan lock in the sidebar. The watchlist and the
// deal-flow matches cover the need today. Key: investor_portfolio.
import { PieChart } from "lucide-react";
import { HiddenWorkspacePage, hiddenPageMetadata } from "@/components/workspace/hidden-feature-page";

export const metadata = hiddenPageMetadata("Portfolio");
export const dynamic = "force-dynamic";

export default function InvestorPortfolioPage() {
  return (
    <HiddenWorkspacePage
      feature="investor_portfolio"
      path="/workspace/investor/portfolio"
      title="Portfolio"
      icon={PieChart}
      reason="A portfolio grid across every startup you backed is not offered yet. Your watchlist carries the same scores with weekly movers, and each evaluation opens its Investor Dossier."
      alternatives={[
        { href: "/workspace/investor/watchlist", label: "Watchlist — weekly movers" },
        { href: "/workspace/evaluations", label: "My evaluations" },
        { href: "/workspace/investor/dealflow", label: "Deal-flow matches" },
      ]}
      backHref="/workspace/investor"
      backLabel="Back to Dashboard"
    />
  );
}
