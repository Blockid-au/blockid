/**
 * /workspace/investors — Matches tab of the Investors hub (S-IA2, spec
 * docs/plans/investor-clarity-2026-09-15/11-pm-ia-post-login.md §A.1).
 *
 * The investor reverse-match (T0251, `matchInvestorsForProject`) used to be
 * the "Investors" tab of /workspace/funding; it now lives here with the same
 * inputs — the active project, the founder's latest Money Radar report
 * intake (state / city / industry / stage) or the intake prefill, and the
 * latest SVI. Starter sees the locked Growth card; Growth sees the ranked
 * investors (`InvestorMatchesPanel`). The hub tablist renders from the
 * layout's HubTabsProvider inside WorkspaceLayout.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getActiveProject, getCurrentProjectIsSandbox } from "@/lib/projects";
import { getFounderNavContext } from "@/lib/nav/founder-phase";
import { intakePrefillFor, latestFundingReportForUser, latestSviTotalFor } from "@/lib/funding/workspace";
import { hasGrowthExtras } from "@/lib/funding/growth-extras";
import { matchInvestorsForProject, type InvestorMatch } from "@/lib/funding/investor-match";
import { fundingLocationFor, investorMatchProjectFor } from "@/lib/funding/investor-match-inputs";
import { InvestorMatchesPanel } from "@/components/investors/investor-matches-panel";

export const metadata: Metadata = {
  title: "Investor matches | BlockID",
  description: "Opted-in investors on BlockID whose thesis fits your sector, stage, location and SVI.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function InvestorMatchesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/investors");

  const [isSandbox, project] = await Promise.all([getCurrentProjectIsSandbox(), getActiveProject(user.id).catch(() => null)]);
  const { navPhase } = await getFounderNavContext(user, { project });

  // Growth gate first — Starter never pays for the report / SVI reads.
  const unlocked = await hasGrowthExtras({ id: user.id, plan: user.plan });
  let investors: InvestorMatch[] = [];
  let capital: string | null = null;
  if (unlocked) {
    const [row, prefill, svi] = await Promise.all([
      latestFundingReportForUser(user.id, project?.id ?? null).catch(() => null),
      intakePrefillFor(user, project).catch(() => ({})),
      latestSviTotalFor(user, project).catch(() => null),
    ]);
    const location = fundingLocationFor(row, prefill.state ?? null);
    capital = location.capital;
    investors = await matchInvestorsForProject(investorMatchProjectFor(project, location, svi));
  }

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox} startupName={project?.name} currentPhase={navPhase}>
      <div className="mx-auto max-w-5xl" data-workspace-investors data-growth={unlocked ? "1" : "0"}>
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-action">Investors · Matches</p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-primary sm:text-3xl">Investors who match</h1>
          <p className="mt-2 max-w-2xl text-sm text-secondary">
            {project ? `For ${project.name}: ` : ""}
            investors who opted in to be discovered, ranked by how well their thesis fits your sector, stage, location and SVI.
          </p>
        </header>

        <InvestorMatchesPanel unlocked={unlocked} investors={investors} capital={capital} />
      </div>
    </WorkspaceLayout>
  );
}
