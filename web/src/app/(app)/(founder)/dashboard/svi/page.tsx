import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getProjectScope, getCurrentProjectIsSandbox } from "@/lib/projects";
import { pageScopeKeys, resolveSVIAccountIdForPage } from "@/lib/project-members/page-scope";
import { ViewOnlyNote } from "@/components/workspace/view-only-note";
import { getBalance } from "@/lib/credits";
import { Lightbulb, Target, Sparkles } from "lucide-react";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { EmptyDashboardState } from "@/components/dashboard/empty-dashboard-state";
import { LivingSVIDashboard } from "@/components/dashboard/living-svi-dashboard";
import { ScoreHistoryChart } from "@/components/svi/score-history-chart";
import { SviScoreRing } from "@/components/svi/svi-score-ring";
import { NextBestActionWidget } from "@/components/dashboard/next-best-action-widget";
import { NextStepTile } from "@/components/dashboard/next-step-tile";
import { InvestorReadinessTile } from "@/components/dashboard/investor-readiness-tile";
import { CohortRetentionTile } from "@/components/dashboard/cohort-retention-tile";
import { DeepValuationCard } from "@/components/dashboard/deep-valuation-card";
import { ScnActionPlanCard } from "@/components/dashboard/scn-action-plan-card";
import { SviExplainerCard } from "@/components/dashboard/svi-explainer-card";
import { AntlerSignalsCard } from "@/components/dashboard/antler-signals-card";
import { AcceleratorReadinessCard } from "@/components/dashboard/accelerator-readiness-card";
import { TechIntelligenceRow } from "@/components/founder/tech-intelligence-row";
import { FundingReadinessTile } from "@/components/workspace/funding-readiness-tile";
import { SeriesAActionPlan } from "@/components/workspace/series-a-action-plan";
import { computeFundingReadiness, type SVIAnalysis, type FundingReadiness } from "@/lib/svi-analysis";

export const metadata: Metadata = {
  title: "SVI Dashboard",
  description: "Your Startup Value Index dashboard",
};

export const dynamic = "force-dynamic";

export interface ReportEntry {
  id: string;
  total_svi: number;
  created_at: string;
  svi_version: string | null;
  input_type: string | null;
  rnd_report_json: unknown | null;
}

export interface SVIHistoryPoint {
  total_svi: number;
  created_at: string;
}

export default async function SVIDashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/auth/login?next=/dashboard/svi");
  }

  const isSandbox = await getCurrentProjectIsSandbox();

  const supabase = getSupabaseAdmin();
  let analysis: SVIAnalysis | null = null;
  let fundingReadiness: FundingReadiness | null = null;
  let latestAnalysisId: string | undefined;
  let weeklyDelta: number | undefined;
  let startupName: string | undefined;
  let snapshotHistory: Array<{ date: string; svi: number; delta: number | null }> = [];
  let sviHistory: SVIHistoryPoint[] = [];
  let recentReports: Array<{
    id: string;
    total_svi: number;
    created_at: string;
    input_type: string | null;
    raw_input?: string;
  }> = [];
  let lastAnalysisDate: string | undefined;
  let previousSVI: number | undefined;
  let savedSections: Array<{
    section_id: string;
    depth: string;
    content: string;
    word_count: number;
    credits_cost: number;
  }> = [];
  let creditBalance = 0;
  let evidenceCount = 0;
  let shareViews = 0;
  let userActions: Array<{
    id: string;
    action_type: string;
    action_label: string;
    dimension: string | null;
    svi_impact_estimate: number;
    completed_at: string;
  }> = [];
  let techAnalysis: {
    tech_score: number;
    svi_contribution: number;
    valuation_multiplier_boost: number;
  } | null = null;

  // S18-B — member-aware: the startup record (analyses, account, snapshots,
  // evidence) is read under the OWNER's email + project; a member never
  // creates a split svi_accounts row. Share views / actions / credits stay
  // per caller; saved report sections are per analysis (shared).
  const scope = await getProjectScope("viewer");
  const { projectId, dataEmail, role, canEdit, isMember } = pageScopeKeys(scope, user);

  if (supabase) {
    // ── Load latest SVI analysis ─────────────────────────────────────────
    const analysisQuery = supabase
      .from("svi_analyses")
      .select("id, analysis_json, total_svi, created_at, raw_input")
      .eq("email", dataEmail);
    if (projectId) analysisQuery.eq("project_id", projectId);
    else analysisQuery.is("project_id", null);

    const { data: latestAnalysis } = await analysisQuery
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (latestAnalysis?.analysis_json) {
      analysis = latestAnalysis.analysis_json as SVIAnalysis;
      lastAnalysisDate = latestAnalysis.created_at as string;
      latestAnalysisId = latestAnalysis.id as string;
      fundingReadiness = computeFundingReadiness(analysis);
    }

    // ── Load SVI score history (trend chart) ─────────────────────────────
    const historyQuery = supabase
      .from("svi_analyses")
      .select("total_svi, created_at")
      .eq("email", dataEmail);
    if (projectId) historyQuery.eq("project_id", projectId);
    else historyQuery.is("project_id", null);

    const { data: historyData } = await historyQuery
      .order("created_at", { ascending: true })
      .limit(50);

    if (historyData && historyData.length > 0) {
      sviHistory = historyData.map((h) => ({
        total_svi: h.total_svi as number,
        created_at: h.created_at as string,
      }));
      if (historyData.length >= 2) {
        previousSVI = historyData[historyData.length - 2].total_svi as number;
      }
    }

    // ── Load recent reports (with raw_input for snippets) ────────────────
    const reportsQuery = supabase
      .from("svi_analyses")
      .select("id, total_svi, created_at, input_type, raw_input")
      .eq("email", dataEmail);
    if (projectId) reportsQuery.eq("project_id", projectId);
    else reportsQuery.is("project_id", null);

    const { data: reportsData } = await reportsQuery
      .order("created_at", { ascending: false })
      .limit(20);

    if (reportsData) {
      recentReports = reportsData.map((r) => ({
        id: r.id as string,
        total_svi: r.total_svi as number,
        created_at: r.created_at as string,
        input_type: r.input_type as string | null,
        raw_input: (r.raw_input as string | null) ?? undefined,
      }));
    }

    // ── Load (owner: or create) SVI account (project-scoped) ─────────────
    const accountId = await resolveSVIAccountIdForPage(scope, user);

    let account: {
      id: string;
      startup_name: string | null;
      current_svi: number | null;
      current_stage: number | null;
    } | null = null;

    if (accountId) {
      const { data: row } = await supabase
        .from("svi_accounts")
        .select("id, startup_name, current_svi, current_stage")
        .eq("id", accountId)
        .single();
      account = row;
    }

    if (account) {
      startupName = account.startup_name ?? undefined;

      // Snapshot history
      const { data: snapshots } = await supabase
        .from("svi_snapshots")
        .select("snapshot_date, svi_total, delta")
        .eq("account_id", account.id)
        .order("snapshot_date", { ascending: false })
        .limit(12);

      if (snapshots && snapshots.length > 0) {
        snapshotHistory = snapshots.map((s) => ({
          date: s.snapshot_date as string,
          svi: s.svi_total as number,
          delta: s.delta as number | null,
        }));
        weeklyDelta = snapshots[0].delta ?? undefined;
      }

      // ── Evidence count ───────────────────────────────────────────────
      const { count: evCount } = await supabase
        .from("svi_evidence")
        .select("id", { count: "exact", head: true })
        .eq("account_id", account.id);
      evidenceCount = evCount ?? 0;
    }

    // ── Saved report sections (for latest analysis) ──────────────────────
    // Keyed on the ANALYSIS only (S18-B review P1): the row is unique per
    // (analysis_id, section_id, depth) and the analysis is the owner's, so
    // an unlock by the owner or any editor is visible to the whole project.
    if (latestAnalysisId) {
      const { data: sectionsData } = await supabase
        .from("report_sections")
        .select("section_id, depth, content, word_count, credits_cost")
        .eq("analysis_id", latestAnalysisId)
        .order("created_at", { ascending: true });

      if (sectionsData) {
        savedSections = sectionsData.map((s) => ({
          section_id: s.section_id as string,
          depth: s.depth as string,
          content: s.content as string,
          word_count: (s.word_count as number) ?? 0,
          credits_cost: (s.credits_cost as number) ?? 0,
        }));
      }
    }

    // ── Credit balance ───────────────────────────────────────────────────
    creditBalance = await getBalance(user.id);

    // ── Share link views ─────────────────────────────────────────────────
    // Get all score IDs for this user, then count views
    const { data: userScores } = await supabase
      .from("scores")
      .select("id")
      .eq("email", user.email)
      .limit(50);

    if (userScores && userScores.length > 0) {
      const scoreIds = userScores.map((s) => s.id as string);
      const { count: viewCount } = await supabase
        .from("score_views")
        .select("id", { count: "exact", head: true })
        .in("score_id", scoreIds);
      shareViews = viewCount ?? 0;
    }

    // ── User actions (recent 10) ─────────────────────────────────────────
    const { data: actionsData } = await supabase
      .from("user_actions")
      .select("id, action_type, action_label, dimension, svi_impact_estimate, completed_at")
      .eq("email", user.email)
      .order("completed_at", { ascending: false })
      .limit(10);

    if (actionsData) {
      userActions = actionsData.map((a) => ({
        id: a.id as string,
        action_type: a.action_type as string,
        action_label: a.action_label as string,
        dimension: a.dimension as string | null,
        svi_impact_estimate: (a.svi_impact_estimate as number) ?? 0,
        completed_at: a.completed_at as string,
      }));
    }

    // ── Tech Intelligence score (project-scoped) ─────────────────────────
    if (projectId) {
      const { data: techRow } = await supabase
        .from("tech_analyses")
        .select("tech_score, svi_contribution, valuation_multiplier_boost")
        .eq("startup_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (techRow) {
        techAnalysis = {
          tech_score: techRow.tech_score as number,
          svi_contribution: techRow.svi_contribution as number,
          valuation_multiplier_boost: techRow.valuation_multiplier_boost as number,
        };
      }
    }
  }

  // ── Empty state — no analysis yet ────────────────────────────────────────
  if (!analysis) {
    return (
      <WorkspaceLayout user={user} startupName={startupName} isSandbox={isSandbox}>
        <div className="max-w-5xl mx-auto px-6 pb-24 pt-10">
          <EmptyDashboardState
            eyebrow="Your AI advisor is ready"
            title="Run your first SVI analysis"
            body="Unlock personalised startup guidance, evidence tracking, and stage-tuned recommendations. Under 60 seconds — no credit card required."
            primaryCta={{ href: "/score", label: "Get my SVI score" }}
            cards={[
              {
                href: "/guide/svi",
                icon: Lightbulb,
                title: "What is the SVI?",
                body: "The 8-dimension Startup Value Index, explained in plain English with the AU cohort you're benchmarked against.",
              },
              {
                href: "/guide/scoring",
                icon: Target,
                title: "How scoring works",
                body: "The evidence types, confidence tiers, and phase gates that move your score from Idea to Fundraise-ready.",
              },
              {
                href: "/demo",
                icon: Sparkles,
                title: "Book a demo",
                body: "See a full trust report end-to-end and how founders convert SVI insight into investor conversations.",
              },
            ]}
          />
        </div>
      </WorkspaceLayout>
    );
  }

  // ── Inject weeklyDelta into analysis ─────────────────────────────────────
  const computedDelta = previousSVI != null ? analysis.totalSVI - previousSVI : undefined;
  const analysisWithDelta: SVIAnalysis = {
    ...analysis,
    weeklyDelta: weeklyDelta ?? computedDelta ?? analysis.weeklyDelta,
  };

  // ── Render the living dashboard ──────────────────────────────────────────
  return (
    <WorkspaceLayout user={user} startupName={startupName} isSandbox={isSandbox}>
      <div className="max-w-5xl mx-auto px-6 pb-24 pt-6 space-y-6">
        {isMember && !canEdit && (
          <ViewOnlyNote role={role} action="run analyses or unlock report sections" />
        )}
        {/* ── Headline SVI gauge — the "score at a glance" viz called out in
            the UI audit. Score comes off analysisWithDelta.totalSVI. ── */}
        <div className="flex justify-center">
          <SviScoreRing
            score={analysisWithDelta.totalSVI}
            label={analysisWithDelta.stageLabel ?? "SVI"}
          />
        </div>

        {/* ── Next-Step nudge tile (round 5.1) — phase pill, next action,
            missing list, readiness donut. Fetches /api/nudge/next-steps. ── */}
        <NextStepTile />

        {/* ── Investor readiness tile (P5b) — per-phase score + 12-phase
            mini-series + top-3 missing. Reuses the /api/nudge/next-steps
            payload (readiness_by_phase[currentPhase]). ── */}
        <InvestorReadinessTile />

        {/* ── Funding Readiness tile — gate progress + milestone checklist
            derived from computeFundingReadiness(analysis). ── */}
        {fundingReadiness && (
          <FundingReadinessTile fundingReadiness={fundingReadiness} />
        )}

        {/* ── Series A Action Plan — week-by-week roadmap from unmet gates ── */}
        {fundingReadiness && (
          <SeriesAActionPlan
            fundingReadiness={fundingReadiness}
            sviScore={analysisWithDelta.totalSVI}
            stage={analysisWithDelta.stageLabel}
          />
        )}

        {/* ── Chapter 5 cohort retention tile (P5-cohort-svi) — client-side
            paste-your-own-CSV live preview around the pure
            computeWeeklyCohortRetention + renderCohortRetentionSvg helpers.
            No API, no persistence — durable Stripe / product-analytics
            ingest lives on the R&D roadmap (P5-cohort-ingest). ── */}
        <CohortRetentionTile />

        {/* ── SVI Score History Trend Chart (T0081) ──────────────────────── */}
        {sviHistory.length > 0 && (
          <ScoreHistoryChart
            history={sviHistory}
            startupName={startupName}
          />
        )}

        <LivingSVIDashboard
          analysis={analysisWithDelta}
          sviHistory={sviHistory}
          recentReports={recentReports}
          savedSections={savedSections}
          snapshotHistory={snapshotHistory}
          startupName={startupName}
          userEmail={user.email}
          readOnly={!canEdit}
          creditBalance={creditBalance}
          evidenceCount={evidenceCount}
          shareViews={shareViews}
          lastAnalysisDate={lastAnalysisDate}
          previousSVI={previousSVI}
          userActions={userActions}
          userProfile={{
            displayName: user.displayName,
            startupName: user.startupName,
            startupStage: user.startupStage,
            industry: user.industry,
            startupGoals: user.startupGoals,
          }}
        />

        {/* ── v2.4: SCN action plan — Your Number → What to do ─────── */}
        <ScnActionPlanCard analysis={analysisWithDelta} />

        {/* ── v2.6: Why your SVI is what it is — radar + click-through ── */}
        <SviExplainerCard analysis={analysisWithDelta} />

        {/* ── v2.10: Antler-style stage-progression signals (Team / Progress / Invention / Vision / 10× Product) ── */}
        <AntlerSignalsCard analysis={analysisWithDelta} />

        {/* ── v2.12: AU Accelerator Readiness — mapped to 30+ criteria across 8 sources ── */}
        <AcceleratorReadinessCard analysis={analysisWithDelta} />

        {/* ── v2.3: Deep input analysis + 4-lens valuation ─────────────── */}
        <DeepValuationCard analysis={analysisWithDelta} />

        {/* ── Tech Intelligence row — shows if tech analysis exists ──── */}
        <TechIntelligenceRow techAnalysis={techAnalysis} />

        {/* ── Next-Best-Action widget (T0103) ─────────────────────────── */}
        {latestAnalysisId && (
          <div className="rounded-2xl border border-border bg-card p-6">
            <NextBestActionWidget startupId={latestAnalysisId} />
          </div>
        )}
      </div>
    </WorkspaceLayout>
  );
}
