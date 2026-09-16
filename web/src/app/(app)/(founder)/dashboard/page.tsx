// Founder landing — G13-W3-IA3 (spec §B.1): one landing, five blocks
// ordered by benefit — Where you stand · Next best action · Money on the
// table · Evidence to add · Your reports. Thin server page: scope + phase +
// the block loaders in ONE Promise.all, then five server components.
//
// Phase scale (goal doc D4, §B.5): the canonical 12 `GrowthPhaseId`s drive
// block 1's pill and block 2's recommender; the 0..5 nav band is derived
// here only to collapse the sidebar (`resolveFounderNavPhase`).
//
// Member-aware (S18-B): the startup record is read under the OWNER's key
// (`pageScopeKeys`); credits / entitlement stay the caller's. Blocks 1, 4,
// 5 are read-only for a member, block 2 shows the owner's next action with
// "ask {owner}" copy, block 3 is hidden (§B.4).
//
// Rollback: `NAV_IA_V4=off` mounts `page.legacy.tsx` for one deploy.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheck, Sparkles } from "lucide-react";
import { PageTracker } from "@/components/analytics/page-tracker";
import { getCurrentUser } from "@/lib/auth";
import { getProjectScope, getCurrentProjectIsSandbox } from "@/lib/projects";
import { pageScopeKeys, resolveSVIAccountIdForPage } from "@/lib/project-members/page-scope";
import { ViewOnlyNote } from "@/components/workspace/view-only-note";
import { getSupabaseAdmin } from "@/lib/supabase";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { OnboardingWelcomeModal } from "@/components/dashboard/onboarding-welcome-modal";
import { RoleLandingIntro } from "@/components/role/role-landing-intro";
import { LandingGrid, LandingViewedTracker, LANDING_BLOCKS, type LandingContext } from "@/components/dashboard/landing/landing-grid";
import { WhereYouStand } from "@/components/dashboard/landing/where-you-stand";
import { NextBestAction } from "@/components/dashboard/landing/next-best-action";
import { MoneyOnTheTable } from "@/components/dashboard/landing/money-on-the-table";
import { EvidenceToAdd } from "@/components/dashboard/landing/evidence-to-add";
import { YourReports } from "@/components/dashboard/landing/your-reports";
import { getMoneyRadarTileData } from "@/lib/funding/tile-data";
import { loadEvidenceReads, loadRecentReports, loadStanding, type LandingKeys } from "@/lib/dashboard/landing-data";
import { deriveEvidenceGaps } from "@/lib/dashboard/evidence-gaps";
import { recommendNextStep } from "@/lib/nav/next-step-recommender";
import { growthPhaseFromNavPhase, navPhaseFromSvi, resolveFounderNavPhase } from "@/lib/nav/founder-phase";
import { isGrowthPhaseId } from "@/lib/growth/phase-taxonomy";
import { getSVIPercentile } from "@/lib/benchmarks";
import { countIntakeAnalysesForUser } from "@/lib/analyses/dashboard-bridge";
import { LegacyDashboardPage } from "./page.legacy";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard · BlockID",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ welcome?: string; checkout?: string; plan?: string; onboarding?: string }>;

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  if (process.env.NAV_IA_V4 === "off") return <LegacyDashboardPage searchParams={searchParams} />;

  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/dashboard");
  const sp = await searchParams;
  const supabase = getSupabaseAdmin();

  // ── Scope (owner vs member) ───────────────────────────────────────────────
  const scope = await getProjectScope("viewer");
  const { projectId, dataEmail, ownerUserId, role, canEdit, isMember } = pageScopeKeys(scope, user);
  const activeProject = scope?.project ?? null;

  // First-time OWNER with nothing scored → onboarding wizard (never a member:
  // S18-B P2-6). `/analyze` runs land in `analyses` (S31-B) and count too.
  if (supabase && !user.onboardingCompleted && !isMember) {
    const { count } = await supabase.from("svi_analyses").select("id", { count: "exact", head: true }).eq("email", user.email);
    if (!count && (await countIntakeAnalysesForUser(supabase, user.id)) === 0) redirect("/dashboard/onboarding");
  }

  // ── Five loaders, one round ───────────────────────────────────────────────
  const accountId = await resolveSVIAccountIdForPage(scope, user);
  const keys: LandingKeys = { dataEmail, projectId, ownerUserId, callerId: user.id, accountId };
  const [standing, moneyRadar, evidenceReads, reports, isSandbox] = await Promise.all([
    loadStanding(supabase, keys),
    isMember
      ? Promise.resolve(null)
      : getMoneyRadarTileData(user, activeProject, {}, { ownerUserId, dataEmail }).catch((err: unknown) => {
          console.warn("[dashboard] money radar", err instanceof Error ? err.message : String(err));
          return null;
        }),
    loadEvidenceReads(supabase, keys),
    loadRecentReports(supabase, keys, 3),
    getCurrentProjectIsSandbox(),
  ]);

  // ── Phase + derived values ────────────────────────────────────────────────
  const { analysis, sviScore, delta } = standing;
  // Declared 12-phase id wins; a scored founder with none declared gets the
  // earliest phase of their SVI band; nothing scored → phase 0 (start here).
  const declared = activeProject?.growth_phase_current ?? null;
  const growthPhaseId = isGrowthPhaseId(declared) ? declared : null;
  const effectivePhase = growthPhaseId ?? (sviScore != null ? growthPhaseFromNavPhase(navPhaseFromSvi(sviScore)) : null);
  const navPhase = resolveFounderNavPhase({ svi: sviScore, growthPhaseId });
  const evidence = deriveEvidenceGaps({
    evidenceRows: evidenceReads.evidenceRows,
    growthPhaseId,
    criteria: evidenceReads.criteria,
    subs: analysis?.subs ?? null,
  });
  const topMoney = moneyRadar?.top3[0] ?? null;
  const step = recommendNextStep({
    currentPhase: effectivePhase ? 1 : 0,
    growthPhaseId: effectivePhase,
    planId: user.plan,
    signals: {
      topEvidenceGapPts: evidence.gaps[0]?.pts ?? null,
      topMoney: topMoney ? { label: topMoney.name, amountAud: topMoney.amount_max_aud, closesAt: topMoney.closes_at } : null,
    },
  });
  const percentile = sviScore != null ? Math.round(getSVIPercentile(sviScore, analysis?.stage ?? navPhase)) : null;
  const startupName = activeProject?.name ?? standing.startupName ?? user.startupName ?? null;
  const ctx: LandingContext = { phase: effectivePhase ?? "none", plan: user.plan ?? "free", persona: "founder" };
  const blocks = isMember ? LANDING_BLOCKS.filter((b) => b !== "money-on-the-table") : LANDING_BLOCKS;
  const emptyBlocks = [
    sviScore == null && "where-you-stand",
    step.href === "/analyze" && "next-best-action",
    !isMember && (!moneyRadar || moneyRadar.state === "no_profile") && "money-on-the-table",
    evidence.presentCount === 0 && "evidence-to-add",
    reports.length === 0 && "your-reports",
  ].filter((b): b is string => typeof b === "string");
  const ownerLabel = isMember ? dataEmail.split("@")[0] : null;

  return (
    <WorkspaceLayout user={user} startupName={startupName ?? undefined} currentPhase={navPhase} isSandbox={isSandbox}>
      <PageTracker page="dashboard" />
      <LandingViewedTracker ctx={ctx} blocks={blocks} emptyBlocks={emptyBlocks} />
      {sp.onboarding === "complete" && <OnboardingWelcomeModal />}

      <div className="mx-auto max-w-6xl space-y-6 px-6 pb-24 pt-6" data-founder-landing data-landing-phase={ctx.phase}>
        <RoleLandingIntro role="founder" variant="compact" hasGlobalSpotlight />

        {isMember && !canEdit && <ViewOnlyNote role={role} action="run analyses, upload evidence or unlock report sections" />}

        {/* ONE banner slot — highest-priority system message, never stacked (§B.1). */}
        {sp.checkout === "success" ? (
          <div className="flex items-start gap-3 rounded-xl border border-bull/30 bg-bull/10 p-4" data-landing-banner="checkout">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-bull" aria-hidden="true" />
            <div>
              <p className="font-semibold text-primary">Your {sp.plan ?? "new"} plan is now active.</p>
              <p className="mt-1 text-sm text-secondary">Payment confirmed. All plan features are unlocked and ready to use.</p>
            </div>
          </div>
        ) : sp.welcome === "1" ? (
          <div className="flex items-start gap-3 rounded-xl border border-action/25 bg-action/5 p-4" data-landing-banner="welcome">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-action" aria-hidden="true" />
            <div>
              <p className="font-semibold text-primary">Welcome to BlockID. Your account is live.</p>
              <p className="mt-1 text-sm text-secondary">Run your first SVI analysis to unlock personalised startup guidance.</p>
            </div>
          </div>
        ) : null}

        <LandingGrid>
          <WhereYouStand
            ctx={ctx}
            sviScore={sviScore}
            delta={delta}
            percentile={percentile}
            growthPhaseId={growthPhaseId}
            stageLabel={analysis?.stageLabel ?? null}
            subs={analysis?.subs ?? null}
            startupName={startupName}
            scoredAt={standing.scoredAt}
            readOnly={!canEdit}
          />
          <NextBestAction ctx={ctx} step={step} growthPhaseId={effectivePhase} ownerLabel={ownerLabel} canEdit={canEdit} />
          {!isMember && <MoneyOnTheTable ctx={ctx} data={moneyRadar} />}
          <EvidenceToAdd ctx={ctx} result={evidence} canEdit={canEdit} />
          <YourReports ctx={ctx} reports={reports} />
        </LandingGrid>
      </div>
    </WorkspaceLayout>
  );
}
