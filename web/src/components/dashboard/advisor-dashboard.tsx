"use client";

import * as React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { SVIAnalysis } from "@/lib/svi-analysis";
import { SVIDashboard } from "@/components/svi/svi-dashboard";
import { AdvisorGreeting } from "./advisor-greeting";
import { StartupHealthHero } from "./startup-health-hero";
import { AdvisorGuidance } from "./advisor-guidance";
import { QuickWinTasks } from "./quick-win-tasks";
import { EvidenceImpactCalc } from "./evidence-impact-calc";
import { StageJourney } from "./stage-journey";
import { ActivityFeed } from "./activity-feed";
import { DeepDiveUpsell } from "./deep-dive-upsell";
import { InsightsPanel } from "./insights-panel";

import type { ReportEntry, SVIHistoryPoint } from "@/app/dashboard/svi/page";

interface UserProfile {
  displayName: string | null;
  startupName: string | null;
  startupStage: string | null;
  industry: string | null;
  startupGoals: string[] | null;
}

interface Props {
  analysis: SVIAnalysis;
  userProfile: UserProfile;
  startupName?: string;
  snapshotHistory?: Array<{ date: string; svi: number; delta: number | null }>;
  userEmail?: string;
  sviHistory?: SVIHistoryPoint[];
  recentReports?: ReportEntry[];
  lastAnalysisDate?: string;
  previousSVI?: number;
}

export function AdvisorDashboard({
  analysis,
  userProfile,
  startupName,
  snapshotHistory,
  userEmail,
  sviHistory,
  recentReports,
  lastAnalysisDate,
  previousSVI,
}: Props) {
  const [showDetailedView, setShowDetailedView] = React.useState(false);

  const sviStage = analysis.stage ?? 0;
  const delta = previousSVI != null ? analysis.totalSVI - previousSVI : undefined;
  const isFirstAnalysis = !sviHistory || sviHistory.length <= 1;
  const riskCount = analysis.riskPenalties?.length ?? 0;

  return (
    <div className="space-y-6">
      {/* Row 1: Greeting */}
      <AdvisorGreeting
        userName={userProfile.displayName}
        startupName={userProfile.startupName ?? startupName ?? null}
        stage={userProfile.startupStage}
        sviStage={sviStage}
        goals={userProfile.startupGoals}
        sviDelta={delta}
        isFirstAnalysis={isFirstAnalysis}
      />

      {/* Row 2: Health Hero + Advisor Guidance */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3">
          <StartupHealthHero
            analysis={analysis}
            lastAnalysisDate={lastAnalysisDate}
            previousSVI={previousSVI}
          />
        </div>
        <div className="lg:col-span-2">
          <AdvisorGuidance sviStage={sviStage} riskCount={riskCount} />
        </div>
      </div>

      {/* Row 3: Quick Win Tasks */}
      <QuickWinTasks analysis={analysis} stage={sviStage} />

      {/* Row 4: Evidence Calculator + Stage Journey */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <EvidenceImpactCalc analysis={analysis} />
        <StageJourney currentStage={sviStage} />
      </div>

      {/* Row 5: Activity + Deep Dive Upsell */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3">
          <ActivityFeed
            rawActions={
              (recentReports ?? []).map((r) => ({
                action_type: r.input_type === "url" ? "svi_analysis" : r.input_type === "deep_dive" ? "report_generated" : "svi_analysis",
                description: `${r.input_type === "url" ? "URL Analysis" : r.input_type === "deep_dive" ? "Deep Dive" : "SVI Analysis"} — Score: ${r.total_svi}`,
                created_at: r.created_at,
              }))
            }
          />
        </div>
        <div className="lg:col-span-2">
          <DeepDiveUpsell />
        </div>
      </div>

      {/* Row 6: Insights */}
      <InsightsPanel />

      {/* Row 7: Detailed View Toggle */}
      <div className="border-t border-surface-200 pt-4">
        <button
          type="button"
          onClick={() => setShowDetailedView(!showDetailedView)}
          className="flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-700 cursor-pointer transition-colors mx-auto"
        >
          {showDetailedView ? (
            <>
              Hide detailed analysis
              <ChevronUp strokeWidth={1.75} className="h-4 w-4" />
            </>
          ) : (
            <>
              Show detailed dimension breakdown
              <ChevronDown strokeWidth={1.75} className="h-4 w-4" />
            </>
          )}
        </button>
      </div>

      {showDetailedView && (
        <SVIDashboard
          analysis={analysis}
          startupName={startupName}
          snapshotHistory={snapshotHistory}
          userEmail={userEmail}
          sviHistory={sviHistory}
          recentReports={recentReports}
          lastAnalysisDate={lastAnalysisDate}
          previousSVI={previousSVI}
        />
      )}
    </div>
  );
}
