// GET /api/cron/reseller-weekly-digest
//
// Weekly leading-signal digest per reseller. Runs Mondays (crontab.production)
// per docs/plans/reseller-module-plan.md § U.5 P11 (weekly KPI digest to
// admin@blockid.au) and Customer-Success advisory §24 rec #3 which asked for
// last-login recency + time-to-first-report leading indicators so CS can act
// BEFORE attributed_churn_30d fires.
//
// For each active reseller, iterate attributed customers, join svi_analyses
// (via app_users.email — the joining shape used elsewhere in the codebase),
// compute buildLeadingSignalSummary, and email admin@blockid.au a CSV+HTML
// digest with one row per reseller.
//
// ?skip_email=1 → dry-run (no email send). Response body still includes the
// per-reseller summary counts so operators can eyeball the numbers.
//
// Auth: shared CRON_SECRET pattern (matches sibling reseller-* cron routes).

import { appendFileSync, mkdirSync, readFileSync } from "fs";
import { dirname } from "path";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendEmail } from "@/lib/email";
import {
  buildDigestSnapshot,
  readLastDigestSnapshot,
  readLastNDigestSnapshots,
  serialiseDigestSnapshot,
  type DigestSnapshot,
} from "@/lib/reseller/digest-snapshot";
import {
  computeDigestSnapshotDelta,
  formatDigestSnapshotDeltaSection,
  type DigestSnapshotDelta,
} from "@/lib/reseller/digest-snapshot-delta";
import {
  computeDigestSnapshotMetricDelta,
  formatDigestSnapshotMetricDeltaSection,
  type DigestSnapshotMetricDelta,
} from "@/lib/reseller/digest-snapshot-metric-delta";
import {
  computeDigestSnapshotMetricPctChange,
  formatDigestSnapshotMetricPctChangeSection,
  type DigestSnapshotMetricPctChange,
} from "@/lib/reseller/digest-snapshot-metric-pct-change";
import {
  computeDigestSnapshotPerResellerDelta,
  formatDigestSnapshotPerResellerDeltaSection,
  type DigestSnapshotPerResellerDelta,
} from "@/lib/reseller/digest-snapshot-per-reseller-delta";
import {
  computeDigestSnapshotRollingTrend,
  formatDigestSnapshotRollingTrendSection,
  type DigestSnapshotRollingTrend,
} from "@/lib/reseller/digest-snapshot-rolling-trend";
import {
  computeDigestSnapshotPerResellerRollingTrend,
  formatDigestSnapshotPerResellerRollingTrendSection,
  type DigestSnapshotPerResellerRollingTrend,
} from "@/lib/reseller/digest-snapshot-per-reseller-rolling-trend";
import {
  computeDigestSnapshotPerResellerMetricPctChange,
  formatDigestSnapshotPerResellerMetricPctChangeSection,
  type DigestSnapshotPerResellerMetricPctChange,
} from "@/lib/reseller/digest-snapshot-per-reseller-metric-pct-change";
import {
  computeDigestSnapshotPerResellerMetricPctChangePerMetric,
  formatDigestSnapshotPerResellerMetricPctChangePerMetricSection,
  type DigestSnapshotPerResellerMetricPctChangePerMetric,
} from "@/lib/reseller/digest-snapshot-per-reseller-metric-pct-change-per-metric";
import {
  computeDigestSnapshotPerResellerMetricPctChangeCoverage,
  formatDigestSnapshotPerResellerMetricPctChangeCoverageSection,
  type DigestSnapshotPerResellerMetricPctChangeCoverage,
} from "@/lib/reseller/digest-snapshot-per-reseller-metric-pct-change-coverage";
import {
  computeDigestSnapshotPerResellerPctChangeCoverage,
  formatDigestSnapshotPerResellerPctChangeCoverageSection,
  type DigestSnapshotPerResellerPctChangeCoverage,
} from "@/lib/reseller/digest-snapshot-per-reseller-pct-change-coverage";
import {
  computeDigestSnapshotPerResellerMetricPctChangePerReseller,
  formatDigestSnapshotPerResellerMetricPctChangePerResellerSection,
  type DigestSnapshotPerResellerMetricPctChangePerReseller,
} from "@/lib/reseller/digest-snapshot-per-reseller-metric-pct-change-per-reseller";
import {
  computeDigestSnapshotTopMovers,
  formatDigestSnapshotTopMoversSection,
  type DigestSnapshotTopMovers,
} from "@/lib/reseller/digest-snapshot-top-movers";
import {
  computeDigestSnapshotTopMoversPerMetric,
  formatDigestSnapshotTopMoversPerMetricSection,
  type DigestSnapshotTopMoversPerMetric,
} from "@/lib/reseller/digest-snapshot-top-movers-per-metric";
import {
  computeDigestSnapshotTopMoversPerReseller,
  formatDigestSnapshotTopMoversPerResellerSection,
  type DigestSnapshotTopMoversPerReseller,
} from "@/lib/reseller/digest-snapshot-top-movers-per-reseller";
import {
  computeDigestSnapshotDirectionStreaks,
  formatDigestSnapshotDirectionStreaksSection,
  type DigestSnapshotDirectionStreaks,
} from "@/lib/reseller/digest-snapshot-direction-streaks";
import {
  computeDigestSnapshotPerResellerDirectionStreaks,
  formatDigestSnapshotPerResellerDirectionStreaksSection,
  type DigestSnapshotPerResellerDirectionStreaks,
} from "@/lib/reseller/digest-snapshot-per-reseller-direction-streaks";
import {
  computeDigestSnapshotPctChangeStreaks,
  formatDigestSnapshotPctChangeStreaksSection,
  type DigestSnapshotPctChangeStreaks,
} from "@/lib/reseller/digest-snapshot-pct-change-streaks";
import {
  computeDigestSnapshotPerResellerPctChangeStreaks,
  formatDigestSnapshotPerResellerPctChangeStreaksSection,
  type DigestSnapshotPerResellerPctChangeStreaks,
} from "@/lib/reseller/digest-snapshot-per-reseller-pct-change-streaks";
import {
  computeDigestSnapshotPctChangeStreakCoverage,
  formatDigestSnapshotPctChangeStreakCoverageSection,
  type DigestSnapshotPctChangeStreakCoverage,
} from "@/lib/reseller/digest-snapshot-pct-change-streak-coverage";
import {
  computeDigestSnapshotPerResellerPctChangeStreakCoverage,
  formatDigestSnapshotPerResellerPctChangeStreakCoverageSection,
  type DigestSnapshotPerResellerPctChangeStreakCoverage,
} from "@/lib/reseller/digest-snapshot-per-reseller-pct-change-streak-coverage";
import {
  computeDigestSnapshotDirectionStreakCoverage,
  formatDigestSnapshotDirectionStreakCoverageSection,
  type DigestSnapshotDirectionStreakCoverage,
} from "@/lib/reseller/digest-snapshot-direction-streak-coverage";
import {
  computeDigestSnapshotPerResellerDirectionStreakCoverage,
  formatDigestSnapshotPerResellerDirectionStreakCoverageSection,
  type DigestSnapshotPerResellerDirectionStreakCoverage,
} from "@/lib/reseller/digest-snapshot-per-reseller-direction-streak-coverage";
import {
  computeDigestSnapshotPerMetricDirectionStreakCoverage,
  formatDigestSnapshotPerMetricDirectionStreakCoverageSection,
  type DigestSnapshotPerMetricDirectionStreakCoverage,
} from "@/lib/reseller/digest-snapshot-per-metric-direction-streak-coverage";
import {
  computeDigestSnapshotPerMetricPctChangeStreakCoverage,
  formatDigestSnapshotPerMetricPctChangeStreakCoverageSection,
  type DigestSnapshotPerMetricPctChangeStreakCoverage,
} from "@/lib/reseller/digest-snapshot-per-metric-pct-change-streak-coverage";
import {
  computeDigestSnapshotDirectionStreakLeaderboard,
  formatDigestSnapshotDirectionStreakLeaderboardSection,
  type DigestSnapshotDirectionStreakLeaderboard,
} from "@/lib/reseller/digest-snapshot-direction-streak-leaderboard";
import {
  computeDigestSnapshotPctChangeStreakLeaderboard,
  formatDigestSnapshotPctChangeStreakLeaderboardSection,
  type DigestSnapshotPctChangeStreakLeaderboard,
} from "@/lib/reseller/digest-snapshot-pct-change-streak-leaderboard";
import {
  computeDigestSnapshotPerMetricDirectionStreakLeaderboard,
  formatDigestSnapshotPerMetricDirectionStreakLeaderboardSection,
  type DigestSnapshotPerMetricDirectionStreakLeaderboard,
} from "@/lib/reseller/digest-snapshot-per-metric-direction-streak-leaderboard";
import {
  computeDigestSnapshotPerMetricPctChangeStreakLeaderboard,
  formatDigestSnapshotPerMetricPctChangeStreakLeaderboardSection,
  type DigestSnapshotPerMetricPctChangeStreakLeaderboard,
} from "@/lib/reseller/digest-snapshot-per-metric-pct-change-streak-leaderboard";
import {
  computeDigestSnapshotPerResellerDirectionStreakLeaderboard,
  formatDigestSnapshotPerResellerDirectionStreakLeaderboardSection,
  type DigestSnapshotPerResellerDirectionStreakLeaderboard,
} from "@/lib/reseller/digest-snapshot-per-reseller-direction-streak-leaderboard";
import {
  computeDigestSnapshotPerResellerPctChangeStreakLeaderboard,
  formatDigestSnapshotPerResellerPctChangeStreakLeaderboardSection,
  type DigestSnapshotPerResellerPctChangeStreakLeaderboard,
} from "@/lib/reseller/digest-snapshot-per-reseller-pct-change-streak-leaderboard";
import {
  computeDigestSnapshotDirectionStreakLengthHistogram,
  formatDigestSnapshotDirectionStreakLengthHistogramSection,
  type DigestSnapshotDirectionStreakLengthHistogram,
} from "@/lib/reseller/digest-snapshot-direction-streak-length-histogram";
import {
  computeDigestSnapshotDirectionStreakLengthPercentiles,
  formatDigestSnapshotDirectionStreakLengthPercentilesSection,
  type DigestSnapshotDirectionStreakLengthPercentiles,
} from "@/lib/reseller/digest-snapshot-direction-streak-length-percentiles";
import {
  computeDigestSnapshotPctChangeStreakLengthHistogram,
  formatDigestSnapshotPctChangeStreakLengthHistogramSection,
  type DigestSnapshotPctChangeStreakLengthHistogram,
} from "@/lib/reseller/digest-snapshot-pct-change-streak-length-histogram";
import {
  computeDigestSnapshotPctChangeStreakLengthPercentiles,
  formatDigestSnapshotPctChangeStreakLengthPercentilesSection,
  type DigestSnapshotPctChangeStreakLengthPercentiles,
} from "@/lib/reseller/digest-snapshot-pct-change-streak-length-percentiles";
import {
  computeDigestSnapshotPerResellerDirectionStreakLengthHistogram,
  formatDigestSnapshotPerResellerDirectionStreakLengthHistogramSection,
  type DigestSnapshotPerResellerDirectionStreakLengthHistogram,
} from "@/lib/reseller/digest-snapshot-per-reseller-direction-streak-length-histogram";
import {
  computeDigestSnapshotPerResellerDirectionStreakLengthPercentiles,
  formatDigestSnapshotPerResellerDirectionStreakLengthPercentilesSection,
  type DigestSnapshotPerResellerDirectionStreakLengthPercentiles,
} from "@/lib/reseller/digest-snapshot-per-reseller-direction-streak-length-percentiles";
import {
  computeDigestSnapshotPerResellerPctChangeStreakLengthHistogram,
  formatDigestSnapshotPerResellerPctChangeStreakLengthHistogramSection,
  type DigestSnapshotPerResellerPctChangeStreakLengthHistogram,
} from "@/lib/reseller/digest-snapshot-per-reseller-pct-change-streak-length-histogram";
import {
  computeDigestSnapshotPerResellerPctChangeStreakLengthPercentiles,
  formatDigestSnapshotPerResellerPctChangeStreakLengthPercentilesSection,
  type DigestSnapshotPerResellerPctChangeStreakLengthPercentiles,
} from "@/lib/reseller/digest-snapshot-per-reseller-pct-change-streak-length-percentiles";
import {
  computeDigestSnapshotPerMetricDirectionStreakLengthHistogram,
  formatDigestSnapshotPerMetricDirectionStreakLengthHistogramSection,
  type DigestSnapshotPerMetricDirectionStreakLengthHistogram,
} from "@/lib/reseller/digest-snapshot-per-metric-direction-streak-length-histogram";
import {
  computeDigestSnapshotPerMetricDirectionStreakLengthPercentiles,
  formatDigestSnapshotPerMetricDirectionStreakLengthPercentilesSection,
  type DigestSnapshotPerMetricDirectionStreakLengthPercentiles,
} from "@/lib/reseller/digest-snapshot-per-metric-direction-streak-length-percentiles";
import {
  computeDigestSnapshotPerMetricPctChangeStreakLengthHistogram,
  formatDigestSnapshotPerMetricPctChangeStreakLengthHistogramSection,
  type DigestSnapshotPerMetricPctChangeStreakLengthHistogram,
} from "@/lib/reseller/digest-snapshot-per-metric-pct-change-streak-length-histogram";
import {
  computeDigestSnapshotPerMetricPctChangeStreakLengthPercentiles,
  formatDigestSnapshotPerMetricPctChangeStreakLengthPercentilesSection,
  type DigestSnapshotPerMetricPctChangeStreakLengthPercentiles,
} from "@/lib/reseller/digest-snapshot-per-metric-pct-change-streak-length-percentiles";
import {
  computeDigestSnapshotPerMetricPersistenceScorecard,
  formatDigestSnapshotPerMetricPersistenceScorecardSection,
  type DigestSnapshotPerMetricPersistenceScorecard,
} from "@/lib/reseller/digest-snapshot-per-metric-persistence-scorecard";
import {
  computeDigestSnapshotPerMetricPersistenceScorecardVerdict,
  formatDigestSnapshotPerMetricPersistenceScorecardVerdictSection,
  type DigestSnapshotPerMetricPersistenceScorecardVerdict,
  type PerMetricPersistenceScorecardVerdictRow,
} from "@/lib/reseller/digest-snapshot-per-metric-persistence-scorecard-verdict";
import {
  computeDigestSnapshotPerMetricPersistenceScorecardVerdictTransition,
  formatDigestSnapshotPerMetricPersistenceScorecardVerdictTransitionSection,
  type DigestSnapshotPerMetricPersistenceScorecardVerdictTransition,
} from "@/lib/reseller/digest-snapshot-per-metric-persistence-scorecard-verdict-transition";
import {
  computeDigestSnapshotPerMetricPersistenceScorecardVerdictTransitionDistribution,
  formatDigestSnapshotPerMetricPersistenceScorecardVerdictTransitionDistributionSection,
  type DigestSnapshotPerMetricPersistenceScorecardVerdictTransitionDistribution,
} from "@/lib/reseller/digest-snapshot-per-metric-persistence-scorecard-verdict-transition-distribution";
import {
  computeDigestSnapshotPerResellerMetricPersistenceScorecard,
  formatDigestSnapshotPerResellerMetricPersistenceScorecardSection,
  type DigestSnapshotPerResellerMetricPersistenceScorecard,
} from "@/lib/reseller/digest-snapshot-per-reseller-metric-persistence-scorecard";
import {
  computeDigestSnapshotPerResellerMetricPersistenceScorecardVerdict,
  formatDigestSnapshotPerResellerMetricPersistenceScorecardVerdictSection,
  type DigestSnapshotPerResellerMetricPersistenceScorecardVerdict,
  type PerResellerMetricPersistenceScorecardVerdictRow,
} from "@/lib/reseller/digest-snapshot-per-reseller-metric-persistence-scorecard-verdict";
import {
  computeDigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransition,
  formatDigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransitionSection,
  type DigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransition,
} from "@/lib/reseller/digest-snapshot-per-reseller-metric-persistence-scorecard-verdict-transition";
import {
  computeDigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransitionDistribution,
  formatDigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransitionDistributionSection,
  type DigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransitionDistribution,
} from "@/lib/reseller/digest-snapshot-per-reseller-metric-persistence-scorecard-verdict-transition-distribution";
import {
  computeDigestSnapshotPerResellerPersistenceScorecard,
  formatDigestSnapshotPerResellerPersistenceScorecardSection,
  type DigestSnapshotPerResellerPersistenceScorecard,
} from "@/lib/reseller/digest-snapshot-per-reseller-persistence-scorecard";
import {
  computeDigestSnapshotPerResellerPersistenceScorecardVerdict,
  formatDigestSnapshotPerResellerPersistenceScorecardVerdictSection,
  type DigestSnapshotPerResellerPersistenceScorecardVerdict,
  type PerResellerPersistenceScorecardVerdictRow,
} from "@/lib/reseller/digest-snapshot-per-reseller-persistence-scorecard-verdict";
import {
  computeDigestSnapshotPerResellerPersistenceScorecardVerdictTransition,
  formatDigestSnapshotPerResellerPersistenceScorecardVerdictTransitionSection,
  type DigestSnapshotPerResellerPersistenceScorecardVerdictTransition,
} from "@/lib/reseller/digest-snapshot-per-reseller-persistence-scorecard-verdict-transition";
import {
  computeDigestSnapshotPerResellerPersistenceScorecardVerdictTransitionDistribution,
  formatDigestSnapshotPerResellerPersistenceScorecardVerdictTransitionDistributionSection,
  type DigestSnapshotPerResellerPersistenceScorecardVerdictTransitionDistribution,
} from "@/lib/reseller/digest-snapshot-per-reseller-persistence-scorecard-verdict-transition-distribution";
import {
  computeDigestSnapshotPersistenceScorecard,
  formatDigestSnapshotPersistenceScorecardSection,
  type DigestSnapshotPersistenceScorecard,
} from "@/lib/reseller/digest-snapshot-persistence-scorecard";
import {
  computeDigestSnapshotPersistenceScorecardVerdict,
  formatDigestSnapshotPersistenceScorecardVerdictSection,
  type DigestSnapshotPersistenceScorecardVerdict,
  type PersistenceScorecardVerdictToken,
} from "@/lib/reseller/digest-snapshot-persistence-scorecard-verdict";
import {
  computeDigestSnapshotPersistenceScorecardVerdictTransition,
  formatDigestSnapshotPersistenceScorecardVerdictTransitionSection,
  type DigestSnapshotPersistenceScorecardVerdictTransition,
} from "@/lib/reseller/digest-snapshot-persistence-scorecard-verdict-transition";
import {
  computeDigestSnapshotPersistenceScorecardVerdictTransitionDistribution,
  formatDigestSnapshotPersistenceScorecardVerdictTransitionDistributionSection,
  type DigestSnapshotPersistenceScorecardVerdictTransitionDistribution,
} from "@/lib/reseller/digest-snapshot-persistence-scorecard-verdict-transition-distribution";
import {
  computeDigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlerts,
  formatDigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlertsSection,
  type DigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlerts,
} from "@/lib/reseller/digest-snapshot-persistence-scorecard-verdict-transition-distribution-family-alerts";
import {
  computeDigestSnapshotPerResellerCrossMetricAlerts,
  formatDigestSnapshotPerResellerCrossMetricAlertsSection,
  type DigestSnapshotPerResellerCrossMetricAlerts,
} from "@/lib/reseller/digest-snapshot-per-reseller-cross-metric-alerts";
import {
  computeDigestSnapshotPerMetricCrossPartnerAlerts,
  formatDigestSnapshotPerMetricCrossPartnerAlertsSection,
  type DigestSnapshotPerMetricCrossPartnerAlerts,
} from "@/lib/reseller/digest-snapshot-per-metric-cross-partner-alerts";
import {
  computeDigestSnapshotPerPairHotCells,
  formatDigestSnapshotPerPairHotCellsSection,
  type DigestSnapshotPerPairHotCells,
} from "@/lib/reseller/digest-snapshot-per-pair-hot-cells";
import {
  computeDigestSnapshotPerPairHotCellsSummary,
  formatDigestSnapshotPerPairHotCellsSummarySection,
  type DigestSnapshotPerPairHotCellsSummary,
} from "@/lib/reseller/digest-snapshot-per-pair-hot-cells-summary";
import {
  computeDigestSnapshotPerTransitionHotCellsDrilldown,
  formatDigestSnapshotPerTransitionHotCellsDrilldownSection,
  type DigestSnapshotPerTransitionHotCellsDrilldown,
} from "@/lib/reseller/digest-snapshot-per-transition-hot-cells-drilldown";
import {
  computeDigestSnapshotPerTransitionMagnitudeDrilldown,
  formatDigestSnapshotPerTransitionMagnitudeDrilldownSection,
  type DigestSnapshotPerTransitionMagnitudeDrilldown,
} from "@/lib/reseller/digest-snapshot-per-transition-magnitude-drilldown";
import {
  computeDigestSnapshotPerTransitionMagnitudeLeaderboard,
  formatDigestSnapshotPerTransitionMagnitudeLeaderboardSection,
  type DigestSnapshotPerTransitionMagnitudeLeaderboard,
} from "@/lib/reseller/digest-snapshot-per-transition-magnitude-leaderboard";
import {
  computeDigestSnapshotPerTransitionMagnitudeTop3Leaderboard,
  formatDigestSnapshotPerTransitionMagnitudeTop3LeaderboardSection,
  type DigestSnapshotPerTransitionMagnitudeTop3Leaderboard,
} from "@/lib/reseller/digest-snapshot-per-transition-magnitude-top3-leaderboard";
import {
  computeDigestSnapshotPerTransitionMagnitudeTop3Concentration,
  formatDigestSnapshotPerTransitionMagnitudeTop3ConcentrationSection,
  type DigestSnapshotPerTransitionMagnitudeTop3Concentration,
} from "@/lib/reseller/digest-snapshot-per-transition-magnitude-top3-concentration";
import {
  computeDigestSnapshotPerTransitionMagnitudeTop3TieCount,
  formatDigestSnapshotPerTransitionMagnitudeTop3TieCountSection,
  type DigestSnapshotPerTransitionMagnitudeTop3TieCount,
} from "@/lib/reseller/digest-snapshot-per-transition-magnitude-top3-tie-count";
import {
  computeDigestSnapshotPerTransitionMagnitudeTop3RunnerUpGap,
  formatDigestSnapshotPerTransitionMagnitudeTop3RunnerUpGapSection,
  type DigestSnapshotPerTransitionMagnitudeTop3RunnerUpGap,
} from "@/lib/reseller/digest-snapshot-per-transition-magnitude-top3-runner-up-gap";
import {
  computeDigestSnapshotPerTransitionMagnitudeTop3TailGap,
  formatDigestSnapshotPerTransitionMagnitudeTop3TailGapSection,
  type DigestSnapshotPerTransitionMagnitudeTop3TailGap,
} from "@/lib/reseller/digest-snapshot-per-transition-magnitude-top3-tail-gap";
import {
  computeDigestSnapshotPerTransitionMagnitudeTop3MiddleGap,
  formatDigestSnapshotPerTransitionMagnitudeTop3MiddleGapSection,
  type DigestSnapshotPerTransitionMagnitudeTop3MiddleGap,
} from "@/lib/reseller/digest-snapshot-per-transition-magnitude-top3-middle-gap";
import {
  computeDigestSnapshotPerTransitionMagnitudeTop3Pool,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolSection,
  type DigestSnapshotPerTransitionMagnitudeTop3Pool,
} from "@/lib/reseller/digest-snapshot-per-transition-magnitude-top3-pool";
import {
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolHhi,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolHhiSection,
  type DigestSnapshotPerTransitionMagnitudeTop3PoolHhi,
} from "@/lib/reseller/digest-snapshot-per-transition-magnitude-top3-pool-hhi";
import {
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolGini,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolGiniSection,
  type DigestSnapshotPerTransitionMagnitudeTop3PoolGini,
} from "@/lib/reseller/digest-snapshot-per-transition-magnitude-top3-pool-gini";
import {
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolTheil,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolTheilSection,
  type DigestSnapshotPerTransitionMagnitudeTop3PoolTheil,
} from "@/lib/reseller/digest-snapshot-per-transition-magnitude-top3-pool-theil";
import {
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinson,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinsonSection,
  type DigestSnapshotPerTransitionMagnitudeTop3PoolAtkinson,
} from "@/lib/reseller/digest-snapshot-per-transition-magnitude-top3-pool-atkinson";
import {
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolCv,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolCvSection,
  type DigestSnapshotPerTransitionMagnitudeTop3PoolCv,
} from "@/lib/reseller/digest-snapshot-per-transition-magnitude-top3-pool-cv";
import {
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropySection,
  type DigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy,
} from "@/lib/reseller/digest-snapshot-per-transition-magnitude-top3-pool-normalized-entropy";
import {
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Share,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop1ShareSection,
  type DigestSnapshotPerTransitionMagnitudeTop3PoolTop1Share,
} from "@/lib/reseller/digest-snapshot-per-transition-magnitude-top3-pool-top1-share";
import {
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Share,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop2ShareSection,
  type DigestSnapshotPerTransitionMagnitudeTop3PoolTop2Share,
} from "@/lib/reseller/digest-snapshot-per-transition-magnitude-top3-pool-top2-share";
import {
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolBottom1Share,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolBottom1ShareSection,
  type DigestSnapshotPerTransitionMagnitudeTop3PoolBottom1Share,
} from "@/lib/reseller/digest-snapshot-per-transition-magnitude-top3-pool-bottom1-share";
import {
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolRange,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolRangeSection,
  type DigestSnapshotPerTransitionMagnitudeTop3PoolRange,
} from "@/lib/reseller/digest-snapshot-per-transition-magnitude-top3-pool-range";
import {
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolBottom2Share,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolBottom2ShareSection,
  type DigestSnapshotPerTransitionMagnitudeTop3PoolBottom2Share,
} from "@/lib/reseller/digest-snapshot-per-transition-magnitude-top3-pool-bottom2-share";
import {
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1RatioSection,
  type DigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio,
} from "@/lib/reseller/digest-snapshot-per-transition-magnitude-top3-pool-top1-bottom1-ratio";
import {
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom2Ratio,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom2RatioSection,
  type DigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom2Ratio,
} from "@/lib/reseller/digest-snapshot-per-transition-magnitude-top3-pool-top2-bottom2-ratio";
import {
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShare,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShareSection,
  type DigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShare,
} from "@/lib/reseller/digest-snapshot-per-transition-magnitude-top3-pool-mid-mass-share";
import {
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom2Ratio,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom2RatioSection,
  type DigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom2Ratio,
} from "@/lib/reseller/digest-snapshot-per-transition-magnitude-top3-pool-top1-bottom2-ratio";
import {
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1RatioSection,
  type DigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio,
} from "@/lib/reseller/digest-snapshot-per-transition-magnitude-top3-pool-top2-bottom1-ratio";
import {
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatioSection,
  type DigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio,
} from "@/lib/reseller/digest-snapshot-per-transition-magnitude-top3-pool-median-mean-ratio";
import {
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGapSection,
  type DigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap,
} from "@/lib/reseller/digest-snapshot-per-transition-magnitude-top3-pool-mean-median-absolute-gap";
import {
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviationSection,
  type DigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation,
} from "@/lib/reseller/digest-snapshot-per-transition-magnitude-top3-pool-mean-absolute-deviation";
import {
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviationSection,
  type DigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation,
} from "@/lib/reseller/digest-snapshot-per-transition-magnitude-top3-pool-median-absolute-deviation";
import {
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolSkewness,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolSkewnessSection,
  type DigestSnapshotPerTransitionMagnitudeTop3PoolSkewness,
} from "@/lib/reseller/digest-snapshot-per-transition-magnitude-top3-pool-skewness";
import {
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolExcessKurtosis,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolExcessKurtosisSection,
  type DigestSnapshotPerTransitionMagnitudeTop3PoolExcessKurtosis,
} from "@/lib/reseller/digest-snapshot-per-transition-magnitude-top3-pool-excess-kurtosis";
import {
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolIqr,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolIqrSection,
  type DigestSnapshotPerTransitionMagnitudeTop3PoolIqr,
} from "@/lib/reseller/digest-snapshot-per-transition-magnitude-top3-pool-iqr";
import {
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolIqrRatio,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolIqrRatioSection,
  type DigestSnapshotPerTransitionMagnitudeTop3PoolIqrRatio,
} from "@/lib/reseller/digest-snapshot-per-transition-magnitude-top3-pool-iqr-ratio";
import {
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolQcd,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolQcdSection,
  type DigestSnapshotPerTransitionMagnitudeTop3PoolQcd,
} from "@/lib/reseller/digest-snapshot-per-transition-magnitude-top3-pool-qcd";
import {
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolCoefficientOfRangeSection,
  type DigestSnapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange,
} from "@/lib/reseller/digest-snapshot-per-transition-magnitude-top3-pool-coefficient-of-range";
import {
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewness,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewnessSection,
  type DigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewness,
} from "@/lib/reseller/digest-snapshot-per-transition-magnitude-top3-pool-bowley-skewness";
import {
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolMoorsKurtosisSection,
  type DigestSnapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis,
} from "@/lib/reseller/digest-snapshot-per-transition-magnitude-top3-pool-moors-kurtosis";
import {
  buildAnomalySummary,
  DEFAULT_ANOMALY_WINDOW_DAYS,
  type AuditLogRow,
} from "@/lib/reseller/audit-anomaly";
import {
  computeAttributedChurn30dByReseller,
  formatWeeklyDigestAttributedChurnSection,
  type AttributedChurnRow,
  type ChurnCandidateRow,
} from "@/lib/reseller/attributed-churn-30d";
import {
  computeAttributedMrrByReseller,
  formatWeeklyDigestAttributedMrrSection,
  type AttributedMrrRow,
  type AttributedSubscriptionRow,
} from "@/lib/reseller/attributed-mrr";
import {
  computeNetContributionByReseller,
  formatWeeklyDigestNetContributionSection,
  type NetContributionInput,
  type NetContributionRow,
} from "@/lib/reseller/attributed-net-contribution";
import {
  computeBudgetUtilization,
  formatWeeklyDigestBudgetSection,
  type BudgetUtilizationRow,
} from "@/lib/reseller/budget-utilization";
import {
  computeClawbackExposureByReseller,
  formatWeeklyDigestClawbackExposureSection,
  type ClawbackExposureRow,
  type ExposedCommissionRow,
} from "@/lib/reseller/clawback-exposure";
import {
  computeContributionMargins,
  formatWeeklyDigestContributionMarginSection,
  type ContributionMargins,
} from "@/lib/reseller/contribution-margin";
import {
  COHORT_MONTHS_WINDOW,
  computeCohortVelocityByReseller,
  formatWeeklyDigestCohortVelocitySection,
  recentCohortKeys,
  type ActivationEventRow,
  type AttributionCohortRow,
  type CohortVelocityRow,
} from "@/lib/reseller/cohort-velocity";
import {
  computeClearedMtdByReseller,
  formatWeeklyDigestClearedMtdSection,
  type ClearedCommissionRow,
  type ClearedMtdRow,
} from "@/lib/reseller/commission-cleared-mtd";
import {
  computeMonthlyUsage,
  monthKey as creditMonthKey,
  type ResellerCreditGrantRow,
} from "@/lib/reseller/credit-grants";
import { HUMAN_BLOCKED_ITEMS } from "@/lib/reseller/human-blocked-registry";
import {
  buildLeadingSignalSummary,
  type AttributedCustomerRow,
  type AttributedReportRow,
} from "@/lib/reseller/leading-signals";
import {
  LEDGER_DRIFT_WINDOW_DAYS,
  computeLedgerDriftByReseller,
  formatWeeklyDigestLedgerDriftSection,
  type CommissionDriftRow,
  type LedgerDriftRow,
  type RevenueEventDriftRow,
} from "@/lib/reseller/ledger-drift-events";
import {
  computeGstReconciliationDeltaByReseller,
  formatWeeklyDigestGstReconciliationDeltaSection,
  type GstLedgerRow,
  type GstReconciliationDeltaRow,
} from "@/lib/reseller/gst-reconciliation-delta";
import {
  LTV_REVENUE_KINDS,
  computeLtvCacByReseller,
  formatWeeklyDigestLtvCacSection,
  type CacCommissionRow,
  type LtvCacRow,
  type LtvRevenueRow,
} from "@/lib/reseller/ltv-cac";
import {
  computeSandboxShare,
  formatWeeklyDigestSandboxShareSection,
  type SandboxShareRow,
} from "@/lib/reseller/sandbox-share-of-budget";
import {
  computeTierMixByReseller,
  formatWeeklyDigestTierMixSection,
  type TierMixAttributionRow,
  type TierMixRow,
} from "@/lib/reseller/tier-mix";
import {
  formatWeeklyDigestAnomaliesSection,
  formatWeeklyDigestCsv,
  formatWeeklyDigestEmail,
  formatWeeklyDigestHumanBlockedSection,
  isoWeekKey,
  type WeeklyDigestRow,
} from "@/lib/reseller/weekly-digest";

export const dynamic = "force-dynamic";

const ADMIN_EMAIL = "admin@blockid.au";

interface ResellerMetaRow {
  id: string;
  code: string;
  display_name: string | null;
  monthly_credit_budget: number | null;
  monthly_sandbox_credits: number | null;
}

interface AppUserRow {
  id: string;
  email: string;
  created_at: string;
  last_login_at: string | null;
}

interface SviAnalysisRow {
  email: string;
  created_at: string;
}

interface AttributionRow {
  reseller_id: string;
  subject_type: "user" | "project";
  subject_user_id: string | null;
  subject_project_id: string | null;
  attributed_at: string;
}

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });
  }

  const url = new URL(req.url);
  const skipEmail = url.searchParams.get("skip_email") === "1";
  const now = new Date();
  const week = isoWeekKey(now);

  const { data: resellersData, error: resellersErr } = await supabase
    .from("resellers")
    .select("id, code, display_name, monthly_credit_budget, monthly_sandbox_credits")
    .eq("status", "active");
  if (resellersErr) {
    return NextResponse.json(
      { ok: false, reason: "resellers_query_failed", error: resellersErr.message },
      { status: 500 },
    );
  }
  const resellers = (resellersData ?? []) as ResellerMetaRow[];
  if (resellers.length === 0) {
    return NextResponse.json({ ok: true, week, reseller_count: 0, emailed: false });
  }

  const resellerIds = resellers.map((r) => r.id);
  const { data: attribData, error: attribErr } = await supabase
    .from("reseller_attributions")
    .select("reseller_id, subject_type, subject_user_id, subject_project_id, attributed_at")
    .in("reseller_id", resellerIds)
    .eq("status", "active")
    .eq("opted_out", false);
  if (attribErr) {
    return NextResponse.json(
      { ok: false, reason: "attributions_query_failed", error: attribErr.message },
      { status: 500 },
    );
  }
  const attributions = (attribData ?? []) as AttributionRow[];

  // Resolve project attributions to user_ids so the per-reseller customer
  // list mirrors scope.allowedCustomerIds() semantics.
  const projectIds = new Set<string>();
  for (const a of attributions) {
    if (a.subject_type === "project" && a.subject_project_id) {
      projectIds.add(a.subject_project_id);
    }
  }
  const projectToUser = new Map<string, string>();
  if (projectIds.size > 0) {
    const { data: projRows, error: projErr } = await supabase
      .from("projects")
      .select("id, user_id")
      .in("id", Array.from(projectIds));
    if (projErr) {
      return NextResponse.json(
        { ok: false, reason: "projects_query_failed", error: projErr.message },
        { status: 500 },
      );
    }
    for (const p of (projRows ?? []) as { id: string; user_id: string }[]) {
      projectToUser.set(p.id, p.user_id);
    }
  }

  const customersByReseller = new Map<string, Set<string>>();
  for (const a of attributions) {
    let uid: string | null = null;
    if (a.subject_type === "user") uid = a.subject_user_id;
    else if (a.subject_type === "project" && a.subject_project_id) {
      uid = projectToUser.get(a.subject_project_id) ?? null;
    }
    if (!uid) continue;
    const set = customersByReseller.get(a.reseller_id) ?? new Set<string>();
    set.add(uid);
    customersByReseller.set(a.reseller_id, set);
  }

  const allUserIds = Array.from(
    new Set(Array.from(customersByReseller.values()).flatMap((s) => Array.from(s))),
  );

  let usersById = new Map<string, AppUserRow>();
  let userIdByEmail = new Map<string, string>();
  if (allUserIds.length > 0) {
    const { data: userRows, error: userErr } = await supabase
      .from("app_users")
      .select("id, email, created_at, last_login_at")
      .in("id", allUserIds);
    if (userErr) {
      return NextResponse.json(
        { ok: false, reason: "app_users_query_failed", error: userErr.message },
        { status: 500 },
      );
    }
    for (const u of (userRows ?? []) as AppUserRow[]) {
      usersById.set(u.id, u);
      if (u.email) userIdByEmail.set(u.email.toLowerCase(), u.id);
    }
  }

  // Bridge svi_analyses (email-keyed, no user_id column) → user_id via the
  // app_users.email map built above. Missing/unknown emails are silently
  // dropped by leading-signals so a stray report cannot poison the rollup.
  let reportsByUser = new Map<string, AttributedReportRow[]>();
  if (userIdByEmail.size > 0) {
    const emails = Array.from(userIdByEmail.keys());
    const { data: sviRows, error: sviErr } = await supabase
      .from("svi_analyses")
      .select("email, created_at")
      .in("email", emails);
    if (sviErr) {
      return NextResponse.json(
        { ok: false, reason: "svi_query_failed", error: sviErr.message },
        { status: 500 },
      );
    }
    for (const s of (sviRows ?? []) as SviAnalysisRow[]) {
      if (!s.email) continue;
      const uid = userIdByEmail.get(s.email.toLowerCase());
      if (!uid) continue;
      const list = reportsByUser.get(uid) ?? [];
      list.push({ user_id: uid, generated_at: s.created_at });
      reportsByUser.set(uid, list);
    }
  }

  const digestRows: WeeklyDigestRow[] = [];
  for (const r of resellers) {
    const uids = Array.from(customersByReseller.get(r.id) ?? []);
    const customers: AttributedCustomerRow[] = uids
      .map((uid) => usersById.get(uid))
      .filter((u): u is AppUserRow => Boolean(u))
      .map((u) => ({
        id: u.id,
        created_at: u.created_at,
        last_login_at: u.last_login_at,
      }));
    const reports: AttributedReportRow[] = uids.flatMap(
      (uid) => reportsByUser.get(uid) ?? [],
    );
    const summary = buildLeadingSignalSummary({ customers, reports, now });
    digestRows.push({
      reseller_id: r.id,
      reseller_code: r.code,
      reseller_display_name: r.display_name ?? r.code,
      summary,
    });
  }

  const csv = formatWeeklyDigestCsv(week, digestRows);
  // Preserve the header block separately so P11.25 can splice the top-movers
  // executive summary (computed later, once the rolling-trend fold lands) right
  // after the header without touching any of the drill-down sections appended
  // to `html` in between.
  const digestHeader = formatWeeklyDigestEmail(week, digestRows);
  let html = digestHeader;

  // Fold in audit-log anomaly hotspots (P10 dry-run per plan Verification #5).
  // Scope the query to the active reseller set so a stale terminated reseller
  // can't inflate the counts. Failures are logged and skipped — the leading-
  // signal digest is the primary content and must ship even when audit
  // telemetry is unavailable.
  const anomalyWindowStart = new Date(
    now.getTime() - DEFAULT_ANOMALY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
  const { data: auditRows, error: auditErr } = await supabase
    .from("reseller_audit_log")
    .select("reseller_id, actor_user_id, subject_user_id, action, created_at")
    .in("reseller_id", resellerIds)
    .gte("created_at", anomalyWindowStart.toISOString());
  let anomalySummary: ReturnType<typeof buildAnomalySummary> | null = null;
  if (auditErr) {
    console.error("[reseller-weekly-digest] audit_log query failed", auditErr.message);
  } else {
    anomalySummary = buildAnomalySummary((auditRows ?? []) as AuditLogRow[], { now });
    const resellerDisplayNames: Record<string, string> = {};
    for (const r of resellers) {
      resellerDisplayNames[r.id] = r.display_name ?? r.code;
    }
    const section = formatWeeklyDigestAnomaliesSection(anomalySummary, resellerDisplayNames);
    if (section) html += section;
  }

  // COO advisory rec #1: surface the two open human_blocked escalations
  // (P1.5 InfoVision H.20 ABN + GST; P8.5 Stripe add-on price env vars) so
  // admin@blockid.au sees them in the Monday email without grepping the goal
  // file. Static registry — see human-blocked-registry.ts for the source list.
  const humanBlockedSection = formatWeeklyDigestHumanBlockedSection(HUMAN_BLOCKED_ITEMS);
  if (humanBlockedSection) html += humanBlockedSection;

  // P11 canonical KPI (`credit_budget_utilization` + `sandbox_share_of_budget`
  // from reseller-module-goal.md `weekly_digest_kpis`). Roll monthly grants
  // per reseller for the current UTC month_key so ops sees each partner's
  // month-to-date share of monthly_credit_budget + monthly_sandbox_credits
  // without hand-hitting /admin/resellers. Failures degrade to a skipped
  // section so the leading-signal digest still ships.
  const currentMonthKey = creditMonthKey(now);
  let budgetRows: BudgetUtilizationRow[] = [];
  const { data: grantRows, error: grantErr } = await supabase
    .from("reseller_credit_grants")
    .select("reseller_id, kind, amount, month_key, over_budget, created_at, sandbox_project_id, target_user_id")
    .in("reseller_id", resellerIds)
    .eq("month_key", currentMonthKey);
  let budgetSkippedReason: string | null = null;
  if (grantErr) {
    console.error("[reseller-weekly-digest] budget grant query failed", grantErr.message);
    budgetSkippedReason = "budget_query_failed";
  } else {
    const grantsByReseller = new Map<string, ResellerCreditGrantRow[]>();
    for (const g of (grantRows ?? []) as ResellerCreditGrantRow[]) {
      const list = grantsByReseller.get(g.reseller_id) ?? [];
      list.push(g);
      grantsByReseller.set(g.reseller_id, list);
    }
    budgetRows = resellers.map((r) => {
      const usage = computeMonthlyUsage(
        grantsByReseller.get(r.id) ?? [],
        currentMonthKey,
      );
      return {
        reseller_id: r.id,
        reseller_code: r.code,
        reseller_display_name: r.display_name ?? r.code,
        utilization: computeBudgetUtilization({
          monthly_credit_budget: r.monthly_credit_budget ?? 0,
          monthly_sandbox_credits: r.monthly_sandbox_credits ?? 0,
          grant_credits_used: usage.grant_credits_used,
          sandbox_credits_used: usage.sandbox_credits_used,
        }),
      };
    });
    const budgetSection = formatWeeklyDigestBudgetSection(budgetRows, currentMonthKey);
    if (budgetSection) html += budgetSection;
  }

  // P11.2 canonical KPI (`tier_mix` from reseller-module-goal.md
  // `weekly_digest_kpis`). Distribution of active attributed customers across
  // the 0/10/20/30/40 wholesale-tier ladder (U.15.1). Query resolves promo
  // codes via reseller_promotion_codes so the digest never leaks per-customer
  // rows — only the aggregate counts land in the section. Failures degrade to
  // a skipped section so the earlier signals still ship.
  let tierMixRows: TierMixRow[] = [];
  let tierMixSkippedReason: string | null = null;
  // Re-issue a scoped attribution query with promotion_code_id — the earlier
  // attribution select is a hot path shared with the leading-signal rollup and
  // widening it with a nullable column would ripple through the customer-set
  // typing for no gain (the tier-mix section only needs reseller_id + promo_id).
  const { data: tierAttribData, error: tierAttribErr } = await supabase
    .from("reseller_attributions")
    .select("reseller_id, promotion_code_id")
    .in("reseller_id", resellerIds)
    .eq("status", "active")
    .eq("opted_out", false);
  if (tierAttribErr) {
    console.error("[reseller-weekly-digest] tier-mix attribs query failed", tierAttribErr.message);
    tierMixSkippedReason = "tier_attribs_query_failed";
  } else {
    const tierAttribs = (tierAttribData ?? []) as {
      reseller_id: string;
      promotion_code_id: string | null;
    }[];
    const promoIdSet = new Set<string>();
    for (const a of tierAttribs) {
      if (a.promotion_code_id) promoIdSet.add(a.promotion_code_id);
    }
    const tierByPromo = new Map<string, number>();
    if (promoIdSet.size > 0) {
      const { data: promoRows, error: promoErr } = await supabase
        .from("reseller_promotion_codes")
        .select("id, tier_pct")
        .in("id", Array.from(promoIdSet));
      if (promoErr) {
        console.error("[reseller-weekly-digest] tier-mix promo query failed", promoErr.message);
        tierMixSkippedReason = "tier_promo_query_failed";
      } else {
        for (const p of (promoRows ?? []) as { id: string; tier_pct: number }[]) {
          tierByPromo.set(p.id, p.tier_pct);
        }
      }
    }
    if (!tierMixSkippedReason) {
      const rows: TierMixAttributionRow[] = tierAttribs.map((a) => ({
        reseller_id: a.reseller_id,
        tier_pct: a.promotion_code_id
          ? (tierByPromo.get(a.promotion_code_id) ?? null)
          : null,
      }));
      const mixByReseller = computeTierMixByReseller(resellerIds, rows);
      tierMixRows = resellers.map((r) => ({
        reseller_id: r.id,
        reseller_code: r.code,
        reseller_display_name: r.display_name ?? r.code,
        mix: mixByReseller.get(r.id) ?? {
          counts: { 0: 0, 10: 0, 20: 0, 30: 0, 40: 0 },
          none: 0,
          total: 0,
        },
      }));
      const tierMixSection = formatWeeklyDigestTierMixSection(tierMixRows);
      if (tierMixSection) html += tierMixSection;
    }
  }

  // P11.3 canonical KPI (`commission_cleared_mtd` from reseller-module-goal.md
  // `weekly_digest_kpis`). Per-reseller cleared-commission count + AUD total
  // for the current UTC month. Joins reseller_commission_events(event_type=
  // 'cleared', created_at >= start-of-month) against parent reseller_commissions
  // for reseller_id + commission_aud_cents. Failures degrade to a skipped
  // section so the earlier signals still ship.
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const clearedMonthKey = currentMonthKey;
  let clearedMtdRows: ClearedMtdRow[] = [];
  let clearedMtdSkippedReason: string | null = null;
  const { data: clearedEventRows, error: clearedEventErr } = await supabase
    .from("reseller_commission_events")
    .select("commission_id, created_at")
    .eq("event_type", "cleared")
    .gte("created_at", monthStart.toISOString());
  if (clearedEventErr) {
    console.error(
      "[reseller-weekly-digest] cleared events query failed",
      clearedEventErr.message,
    );
    clearedMtdSkippedReason = "cleared_events_query_failed";
  } else {
    const clearedEvents = (clearedEventRows ?? []) as {
      commission_id: string;
      created_at: string;
    }[];
    const commissionIds = Array.from(
      new Set(clearedEvents.map((e) => e.commission_id).filter(Boolean)),
    );
    const commissionById = new Map<
      string,
      { reseller_id: string; commission_aud_cents: number }
    >();
    if (commissionIds.length > 0) {
      const { data: commissionRows, error: commissionErr } = await supabase
        .from("reseller_commissions")
        .select("id, reseller_id, commission_aud_cents")
        .in("id", commissionIds);
      if (commissionErr) {
        console.error(
          "[reseller-weekly-digest] cleared commissions query failed",
          commissionErr.message,
        );
        clearedMtdSkippedReason = "cleared_commissions_query_failed";
      } else {
        for (const c of (commissionRows ?? []) as {
          id: string;
          reseller_id: string;
          commission_aud_cents: number;
        }[]) {
          commissionById.set(c.id, {
            reseller_id: c.reseller_id,
            commission_aud_cents: c.commission_aud_cents,
          });
        }
      }
    }
    if (!clearedMtdSkippedReason) {
      const clearedRows: ClearedCommissionRow[] = [];
      for (const e of clearedEvents) {
        const parent = commissionById.get(e.commission_id);
        if (!parent) continue;
        clearedRows.push({
          reseller_id: parent.reseller_id,
          commission_aud_cents: parent.commission_aud_cents,
        });
      }
      const mtdByReseller = computeClearedMtdByReseller(resellerIds, clearedRows);
      clearedMtdRows = resellers.map((r) => ({
        reseller_id: r.id,
        reseller_code: r.code,
        reseller_display_name: r.display_name ?? r.code,
        mtd: mtdByReseller.get(r.id) ?? { cleared_count: 0, cleared_cents: 0 },
      }));
      const clearedMtdSection = formatWeeklyDigestClearedMtdSection(
        clearedMtdRows,
        clearedMonthKey,
      );
      if (clearedMtdSection) html += clearedMtdSection;
    }
  }

  // P11.4 canonical KPI (`clawback_exposure` from reseller-module-goal.md
  // `weekly_digest_kpis`). Per-reseller sum of commissions still inside the
  // clawback window — status IN ('pending_clearance','dispute_open') on
  // reseller_commissions_current. Ops reads this alongside commission_cleared_mtd
  // (P11.3): cleared is realised revenue, exposure is the still-at-risk pile
  // that could be clawed back if a refund/dispute lands before pending_until.
  // Failures degrade to a skipped section so the earlier signals still ship.
  let clawbackRows: ClawbackExposureRow[] = [];
  let clawbackSkippedReason: string | null = null;
  const { data: exposedRows, error: exposedErr } = await supabase
    .from("reseller_commissions_current")
    .select("reseller_id, commission_aud_cents, status")
    .in("reseller_id", resellerIds)
    .in("status", ["pending_clearance", "dispute_open"]);
  if (exposedErr) {
    console.error(
      "[reseller-weekly-digest] clawback exposure query failed",
      exposedErr.message,
    );
    clawbackSkippedReason = "clawback_query_failed";
  } else {
    const exposed = (exposedRows ?? []) as ExposedCommissionRow[];
    const exposureByReseller = computeClawbackExposureByReseller(
      resellerIds,
      exposed,
    );
    clawbackRows = resellers.map((r) => ({
      reseller_id: r.id,
      reseller_code: r.code,
      reseller_display_name: r.display_name ?? r.code,
      exposure: exposureByReseller.get(r.id) ?? {
        pending_count: 0,
        pending_cents: 0,
        dispute_count: 0,
        dispute_cents: 0,
        total_count: 0,
        total_cents: 0,
      },
    }));
    const clawbackSection = formatWeeklyDigestClawbackExposureSection(clawbackRows);
    if (clawbackSection) html += clawbackSection;
  }

  // P11.5 canonical KPI (`attributed_mrr` from reseller-module-goal.md
  // `weekly_digest_kpis`). Per-reseller sum of monthly recurring revenue from
  // attributed customers whose subscription_trial_state.status='active'. Ops
  // reads this alongside clawback_exposure (P11.4): MRR is the running-revenue
  // book, exposure is the still-at-risk pile that could reverse. Yearly plans
  // normalise ÷12 to match the v_mrr_active view from migration 0083. Reuses
  // the customersByReseller map built for leading-signals so no extra
  // attribution round-trip is needed. Failures degrade to a skipped section so
  // the earlier signals still ship.
  let mrrRows: AttributedMrrRow[] = [];
  let mrrSkippedReason: string | null = null;
  if (allUserIds.length === 0) {
    mrrRows = resellers.map((r) => ({
      reseller_id: r.id,
      reseller_code: r.code,
      reseller_display_name: r.display_name ?? r.code,
      mrr: { active_subs: 0, mrr_cents: 0 },
    }));
    const mrrSection = formatWeeklyDigestAttributedMrrSection(mrrRows);
    if (mrrSection) html += mrrSection;
  } else {
    const { data: subRows, error: subErr } = await supabase
      .from("subscription_trial_state")
      .select("user_id, plan_id, status")
      .in("user_id", allUserIds)
      .eq("status", "active");
    if (subErr) {
      console.error("[reseller-weekly-digest] mrr subs query failed", subErr.message);
      mrrSkippedReason = "mrr_subs_query_failed";
    } else {
      const subs = (subRows ?? []) as {
        user_id: string;
        plan_id: string | null;
        status: string;
      }[];
      const planIds = Array.from(
        new Set(subs.map((s) => s.plan_id).filter((id): id is string => Boolean(id))),
      );
      const planById = new Map<
        string,
        { interval: string | null; price_aud_cents: number }
      >();
      if (planIds.length > 0) {
        const { data: planRows, error: planErr } = await supabase
          .from("plans")
          .select("id, interval, price_aud_cents")
          .in("id", planIds);
        if (planErr) {
          console.error("[reseller-weekly-digest] mrr plans query failed", planErr.message);
          mrrSkippedReason = "mrr_plans_query_failed";
        } else {
          for (const p of (planRows ?? []) as {
            id: string;
            interval: string | null;
            price_aud_cents: number | null;
          }[]) {
            planById.set(p.id, {
              interval: p.interval,
              price_aud_cents: p.price_aud_cents ?? 0,
            });
          }
        }
      }
      if (!mrrSkippedReason) {
        // Reverse-lookup user_id → reseller_id from customersByReseller.
        // First-seen wins on the exceedingly rare case of an attribution row
        // shared across resellers so MRR is never double-counted.
        const userToReseller = new Map<string, string>();
        for (const [rid, uids] of customersByReseller.entries()) {
          for (const uid of uids) {
            if (!userToReseller.has(uid)) userToReseller.set(uid, rid);
          }
        }
        const attributedSubs: AttributedSubscriptionRow[] = [];
        for (const s of subs) {
          const rid = userToReseller.get(s.user_id);
          if (!rid) continue;
          const plan = s.plan_id ? planById.get(s.plan_id) : null;
          attributedSubs.push({
            reseller_id: rid,
            plan_id: s.plan_id,
            price_aud_cents: plan?.price_aud_cents ?? 0,
            interval: plan?.interval ?? null,
          });
        }
        const mrrByReseller = computeAttributedMrrByReseller(resellerIds, attributedSubs);
        mrrRows = resellers.map((r) => ({
          reseller_id: r.id,
          reseller_code: r.code,
          reseller_display_name: r.display_name ?? r.code,
          mrr: mrrByReseller.get(r.id) ?? { active_subs: 0, mrr_cents: 0 },
        }));
        const mrrSection = formatWeeklyDigestAttributedMrrSection(mrrRows);
        if (mrrSection) html += mrrSection;
      }
    }
  }

  // P11.6 canonical KPI (`attributed_net_contribution` from reseller-module-goal.md
  // `weekly_digest_kpis`). Composite bottom-line per reseller:
  //   net = attributed_mrr − commission_cleared_mtd − credit_cogs_mtd
  // Sourced by folding the three earlier sections' aggregates so no extra
  // Supabase round-trip is needed. Skipped when any of the three feeder
  // sections was itself skipped (so a partial digest never emits a misleading
  // margin column against zero-input).
  let netContributionRows: NetContributionRow[] = [];
  let netContributionSkippedReason: string | null = null;
  if (budgetSkippedReason) {
    netContributionSkippedReason = `budget_upstream_${budgetSkippedReason}`;
  } else if (clearedMtdSkippedReason) {
    netContributionSkippedReason = `cleared_upstream_${clearedMtdSkippedReason}`;
  } else if (mrrSkippedReason) {
    netContributionSkippedReason = `mrr_upstream_${mrrSkippedReason}`;
  } else {
    const mrrById = new Map(mrrRows.map((r) => [r.reseller_id, r.mrr.mrr_cents]));
    const clearedById = new Map(
      clearedMtdRows.map((r) => [r.reseller_id, r.mtd.cleared_cents]),
    );
    // Total monthly credit consumption = grant_used + sandbox_used from P11.1
    // budgetRows. Both dimensions draw on the same AI provider bill so both
    // count against COGS.
    const creditsUsedById = new Map(
      budgetRows.map((r) => [
        r.reseller_id,
        r.utilization.grant_used + r.utilization.sandbox_used,
      ]),
    );
    const inputs: NetContributionInput[] = resellers.map((r) => ({
      reseller_id: r.id,
      mrr_cents: mrrById.get(r.id) ?? 0,
      commission_cleared_mtd_cents: clearedById.get(r.id) ?? 0,
      credits_used_mtd: creditsUsedById.get(r.id) ?? 0,
    }));
    const netByReseller = computeNetContributionByReseller(resellerIds, inputs);
    netContributionRows = resellers.map((r) => ({
      reseller_id: r.id,
      reseller_code: r.code,
      reseller_display_name: r.display_name ?? r.code,
      net: netByReseller.get(r.id) ?? {
        revenue_cents: 0,
        commission_cost_cents: 0,
        credit_cogs_cents: 0,
        net_contribution_cents: 0,
      },
    }));
    const netSection = formatWeeklyDigestNetContributionSection(
      netContributionRows,
      currentMonthKey,
    );
    if (netSection) html += netSection;
  }

  // P11.34 canonical KPI (`contribution_margin_pct` from reseller-module-goal.md
  // `weekly_digest_kpis`). Dedicated margin projection folded from the P11.6
  // NetContributionRow list — sorted by margin desc so most-profitable partners
  // land first (opposite of P11.6's code-alphabetical sort). Skipped when the
  // upstream net-contribution feeder itself was skipped so a partial digest
  // never emits a stale margin section against zero-input. Cron-route wiring
  // for the P11.34 pure lib (mirrors the P11.14→P11.15 / P11.17→P11.18 /
  // P11.20→P11.21 / P11.22→P11.23 / P11.24→P11.25 / P11.26→P11.27 /
  // P11.28→P11.29 / P11.30→P11.31 / P11.32→P11.33 pure-lib-first pattern).
  let contributionMargins: ContributionMargins | null = null;
  let contributionMarginSkippedReason: string | null = null;
  if (netContributionSkippedReason) {
    contributionMarginSkippedReason = `net_upstream_${netContributionSkippedReason}`;
  } else {
    contributionMargins = computeContributionMargins(
      netContributionRows,
      currentMonthKey,
    );
    const marginSection =
      formatWeeklyDigestContributionMarginSection(contributionMargins);
    if (marginSection) html += marginSection;
  }

  // P11.7 canonical KPI (`attributed_churn_30d` from reseller-module-goal.md
  // `weekly_digest_kpis`). Per-reseller count of attributed customers whose
  // subscription_trial_state.status flipped to canceled or trial_ended_no_payment
  // inside the last 30 days. Loss-side twin of P11.5 attributed_mrr — ops reads
  // MRR alongside churn to see whether the running-revenue book is growing or
  // eroding. Query is a second scoped subscription_trial_state select because
  // the earlier P11.5 select is status='active' only; widening it with an OR on
  // status would ripple through the mrr rollup for no gain. Failures degrade to
  // a skipped section so the earlier signals still ship.
  let churnRows: AttributedChurnRow[] = [];
  let churnSkippedReason: string | null = null;
  const attributedTotals = new Map<string, number>();
  for (const [rid, uids] of customersByReseller.entries()) {
    attributedTotals.set(rid, uids.size);
  }
  if (allUserIds.length === 0) {
    churnRows = resellers.map((r) => ({
      reseller_id: r.id,
      reseller_code: r.code,
      reseller_display_name: r.display_name ?? r.code,
      churn: {
        churned_count: 0,
        canceled_count: 0,
        trial_ended_count: 0,
        attributed_total: attributedTotals.get(r.id) ?? 0,
        churn_pct: 0,
      },
    }));
    const churnSection = formatWeeklyDigestAttributedChurnSection(churnRows);
    if (churnSection) html += churnSection;
  } else {
    const { data: churnSubRows, error: churnSubErr } = await supabase
      .from("subscription_trial_state")
      .select("user_id, status, updated_at")
      .in("user_id", allUserIds)
      .in("status", ["canceled", "trial_ended_no_payment"]);
    if (churnSubErr) {
      console.error(
        "[reseller-weekly-digest] churn subs query failed",
        churnSubErr.message,
      );
      churnSkippedReason = "churn_subs_query_failed";
    } else {
      const churnSubs = (churnSubRows ?? []) as {
        user_id: string;
        status: string | null;
        updated_at: string | null;
      }[];
      // Reverse-lookup user_id → reseller_id from customersByReseller.
      // First-seen wins on the exceedingly rare case of an attribution row
      // shared across resellers so churn is never double-counted — same posture
      // as P11.5 attributed-mrr.
      const userToReseller = new Map<string, string>();
      for (const [rid, uids] of customersByReseller.entries()) {
        for (const uid of uids) {
          if (!userToReseller.has(uid)) userToReseller.set(uid, rid);
        }
      }
      const candidateRows: ChurnCandidateRow[] = [];
      for (const s of churnSubs) {
        const rid = userToReseller.get(s.user_id);
        if (!rid) continue;
        candidateRows.push({
          reseller_id: rid,
          status: s.status,
          updated_at: s.updated_at,
        });
      }
      const churnByReseller = computeAttributedChurn30dByReseller(
        resellerIds,
        candidateRows,
        { now, attributedTotals },
      );
      churnRows = resellers.map((r) => ({
        reseller_id: r.id,
        reseller_code: r.code,
        reseller_display_name: r.display_name ?? r.code,
        churn: churnByReseller.get(r.id) ?? {
          churned_count: 0,
          canceled_count: 0,
          trial_ended_count: 0,
          attributed_total: attributedTotals.get(r.id) ?? 0,
          churn_pct: 0,
        },
      }));
      const churnSection = formatWeeklyDigestAttributedChurnSection(churnRows);
      if (churnSection) html += churnSection;
    }
  }

  // P11.8 canonical KPI (`ledger_drift_events` from reseller-module-goal.md
  // `weekly_digest_kpis`). Reconciles revenue_events (CFO ledger) against
  // reseller_commissions (payout ledger) on stripe_event_id inside a rolling
  // 7-day window scoped to the active reseller set. Two buckets per reseller:
  //   • missing_commission — revenue-recognising events with reseller_id set
  //     had no matching commission row (payout would silently skip).
  //   • orphan_commission — commission rows whose stripe event has no matching
  //     revenue_events row in the window (manual insert or handler misconfig).
  // Failures degrade to a skipped section so the earlier signals still ship.
  const driftWindowStart = new Date(
    now.getTime() - LEDGER_DRIFT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
  let driftRows: LedgerDriftRow[] = [];
  let driftSkippedReason: string | null = null;
  const { data: driftRevenueRows, error: driftRevenueErr } = await supabase
    .from("revenue_events")
    .select("reseller_id, stripe_event_id, kind, ts")
    .in("reseller_id", resellerIds)
    .gte("ts", driftWindowStart.toISOString());
  if (driftRevenueErr) {
    console.error(
      "[reseller-weekly-digest] drift revenue query failed",
      driftRevenueErr.message,
    );
    driftSkippedReason = "drift_revenue_query_failed";
  } else {
    const { data: driftCommissionRows, error: driftCommissionErr } = await supabase
      .from("reseller_commissions")
      .select("reseller_id, stripe_event_id, created_at")
      .in("reseller_id", resellerIds)
      .gte("created_at", driftWindowStart.toISOString());
    if (driftCommissionErr) {
      console.error(
        "[reseller-weekly-digest] drift commission query failed",
        driftCommissionErr.message,
      );
      driftSkippedReason = "drift_commission_query_failed";
    } else {
      const driftByReseller = computeLedgerDriftByReseller(
        resellerIds,
        (driftRevenueRows ?? []) as RevenueEventDriftRow[],
        (driftCommissionRows ?? []) as CommissionDriftRow[],
      );
      driftRows = resellers.map((r) => ({
        reseller_id: r.id,
        reseller_code: r.code,
        reseller_display_name: r.display_name ?? r.code,
        drift: driftByReseller.get(r.id) ?? {
          missing_commission_count: 0,
          orphan_commission_count: 0,
          total_drift_count: 0,
        },
      }));
      const driftSection = formatWeeklyDigestLedgerDriftSection(driftRows);
      if (driftSection) html += driftSection;
    }
  }

  // P11.9 canonical KPI (`gst_reconciliation_delta` from reseller-module-goal.md
  // `weekly_digest_kpis`). Per-reseller month-to-date ledger-side GST from
  // revenue_events.gst_aud_cents scoped to the active reseller set. Positive
  // kinds (subscribe/renewal/upgrade/downgrade/trial_convert) add to
  // positive_gst_cents; refund/chargeback add absolute magnitude to
  // reversal_gst_cents; net = positive − reversal. Complements the portfolio-
  // wide P7.3 monthly reconciliation cron (which pages against Stripe's
  // invoice.tax on an A$1 tolerance) by surfacing per-reseller attribution
  // ahead of the monthly close. Failures degrade to a skipped section.
  let gstDeltaRows: GstReconciliationDeltaRow[] = [];
  let gstDeltaSkippedReason: string | null = null;
  const { data: gstLedgerRows, error: gstLedgerErr } = await supabase
    .from("revenue_events")
    .select("reseller_id, kind, gst_aud_cents")
    .in("reseller_id", resellerIds)
    .gte("ts", monthStart.toISOString());
  if (gstLedgerErr) {
    console.error(
      "[reseller-weekly-digest] gst ledger query failed",
      gstLedgerErr.message,
    );
    gstDeltaSkippedReason = "gst_ledger_query_failed";
  } else {
    const gstDeltaByReseller = computeGstReconciliationDeltaByReseller(
      resellerIds,
      (gstLedgerRows ?? []) as GstLedgerRow[],
    );
    gstDeltaRows = resellers.map((r) => ({
      reseller_id: r.id,
      reseller_code: r.code,
      reseller_display_name: r.display_name ?? r.code,
      delta: gstDeltaByReseller.get(r.id) ?? {
        positive_count: 0,
        positive_gst_cents: 0,
        reversal_count: 0,
        reversal_gst_cents: 0,
        net_gst_cents: 0,
      },
    }));
    const gstDeltaSection = formatWeeklyDigestGstReconciliationDeltaSection(
      gstDeltaRows,
      currentMonthKey,
    );
    if (gstDeltaSection) html += gstDeltaSection;
  }

  // P11.10 canonical KPI (`cohort_velocity` from reseller-module-goal.md
  // `weekly_digest_kpis`, D2-CFO-07 cohort_velocity_median_days). Per-reseller
  // × per-cohort (last COHORT_MONTHS_WINDOW UTC months) funnel-speed aggregate:
  // how many customers were attributed in the cohort, how many have their first
  // svi_analysis on record, and the median days from attribution_ts →
  // first_report_ts across activated customers. Reuses the projectToUser +
  // reportsByUser structures already resolved above for the leading-signal
  // section so no extra Supabase round-trip is needed. Failures degrade to a
  // skipped section (skipped_reason='cohort_upstream_empty_reports') only when
  // the reports pipeline itself skipped upstream — the reseller_attributions
  // read above already errors out early if it fails so this section inherits
  // that gate.
  const cohortMonths = recentCohortKeys(now, COHORT_MONTHS_WINDOW);
  const cohortAttribRows: AttributionCohortRow[] = [];
  for (const a of attributions) {
    let uid: string | null = null;
    if (a.subject_type === "user") uid = a.subject_user_id;
    else if (a.subject_type === "project" && a.subject_project_id) {
      uid = projectToUser.get(a.subject_project_id) ?? null;
    }
    if (!uid) continue;
    cohortAttribRows.push({
      reseller_id: a.reseller_id,
      subject_user_id: uid,
      attributed_at: a.attributed_at,
    });
  }
  const cohortActivationRows: ActivationEventRow[] = [];
  for (const [uid, reports] of reportsByUser.entries()) {
    for (const r of reports) {
      cohortActivationRows.push({ user_id: uid, generated_at: r.generated_at });
    }
  }
  const cohortByReseller = computeCohortVelocityByReseller(
    resellerIds,
    cohortMonths,
    cohortAttribRows,
    cohortActivationRows,
  );
  const cohortVelocityRows: CohortVelocityRow[] = resellers.map((r) => ({
    reseller_id: r.id,
    reseller_code: r.code,
    reseller_display_name: r.display_name ?? r.code,
    cohorts: cohortByReseller.get(r.id)?.cohorts ?? cohortMonths.map((m) => ({
      cohort_month: m,
      attributed_count: 0,
      activated_count: 0,
      activation_pct: 0,
      median_days_to_activation: null,
    })),
  }));
  const cohortSection = formatWeeklyDigestCohortVelocitySection(cohortVelocityRows);
  if (cohortSection) html += cohortSection;

  // P11.11 canonical KPI (`ltv_cac_per_reseller` from reseller-module-goal.md
  // `weekly_digest_kpis`, D2-CFO-07). Channel-health golden ratio per reseller:
  //   LTV  = Σ revenue_events.net_aud_cents scoped to reseller_id (all-time)
  //   CAC  = Σ reseller_commissions_current.commission_aud_cents WHERE status='cleared'
  //   ratio = LTV / CAC (rendered as N.NN×)
  // GST-net revenue is used on the LTV side because the GST portion is remitted
  // to the ATO and never lands as BlockID take-home — so the ratio compares
  // BlockID's realised revenue against realised commission cost. Pending +
  // disputed commissions are excluded because P11.4 clawback_exposure already
  // surfaces the still-at-risk pile. Failures degrade to a skipped section
  // (skipped_reason='ltv_revenue_query_failed' | 'ltv_commission_query_failed')
  // so the earlier signals still ship.
  let ltvCacRows: LtvCacRow[] = [];
  let ltvCacSkippedReason: string | null = null;
  const { data: ltvRevenueData, error: ltvRevenueErr } = await supabase
    .from("revenue_events")
    .select("reseller_id, net_aud_cents, kind")
    .in("reseller_id", resellerIds)
    .in("kind", LTV_REVENUE_KINDS as unknown as string[]);
  if (ltvRevenueErr) {
    console.error(
      "[reseller-weekly-digest] ltv revenue query failed",
      ltvRevenueErr.message,
    );
    ltvCacSkippedReason = "ltv_revenue_query_failed";
  } else {
    const { data: ltvCommissionData, error: ltvCommissionErr } = await supabase
      .from("reseller_commissions_current")
      .select("reseller_id, commission_aud_cents")
      .in("reseller_id", resellerIds)
      .eq("status", "cleared");
    if (ltvCommissionErr) {
      console.error(
        "[reseller-weekly-digest] ltv commission query failed",
        ltvCommissionErr.message,
      );
      ltvCacSkippedReason = "ltv_commission_query_failed";
    } else {
      const ltvCacByReseller = computeLtvCacByReseller(
        resellerIds,
        (ltvRevenueData ?? []) as LtvRevenueRow[],
        (ltvCommissionData ?? []) as CacCommissionRow[],
        attributedTotals,
      );
      ltvCacRows = resellers.map((r) => ({
        reseller_id: r.id,
        reseller_code: r.code,
        reseller_display_name: r.display_name ?? r.code,
        ltv_cac: ltvCacByReseller.get(r.id) ?? {
          lifetime_revenue_cents: 0,
          cumulative_cleared_commission_cents: 0,
          attributed_customers: attributedTotals.get(r.id) ?? 0,
          ltv_per_customer_cents: 0,
          cac_per_customer_cents: 0,
          ltv_cac_ratio_hundredths: null,
        },
      }));
      const ltvCacSection = formatWeeklyDigestLtvCacSection(ltvCacRows);
      if (ltvCacSection) html += ltvCacSection;
    }
  }

  // P11.12 canonical KPI (`sandbox_share_of_budget` from reseller-module-goal.md
  // `weekly_digest_kpis`). Complementary to P11.1 credit-budget utilization
  // which reports sandbox_used vs monthly_sandbox_credits (sandbox against its
  // OWN cap). This section reports two different ratios: (a) sandbox as a
  // fraction of TOTAL consumption (sandbox / (sandbox + grants)) — channel-
  // health signal for "experimentation vs delivery"; and (b) sandbox as a
  // fraction of the primary monthly_credit_budget dial (H.15) — capacity
  // signal for "how much of the customer budget is sandbox eating." Reuses
  // budgetRows already computed for P11.1 so no additional supabase query
  // fires; when P11.1 skipped (budget_query_failed) this section skips too
  // via the same skipped_reason so ops sees a single upstream failure.
  const sandboxShareRows: SandboxShareRow[] = budgetSkippedReason
    ? []
    : budgetRows.map((r) => ({
        reseller_id: r.reseller_id,
        reseller_code: r.reseller_code,
        reseller_display_name: r.reseller_display_name,
        share: computeSandboxShare({
          sandbox_credits_used: r.utilization.sandbox_used,
          grant_credits_used: r.utilization.grant_used,
          monthly_credit_budget: r.utilization.grant_budget,
        }),
      }));
  const sandboxShareSection = formatWeeklyDigestSandboxShareSection(
    sandboxShareRows,
    currentMonthKey,
  );
  if (sandboxShareSection) html += sandboxShareSection;

  // P11.15 week-over-week delta section. Read the previous snapshot from the
  // JSONL history (P11.13 persistence), diff it against the current envelope
  // via the pure lib (P11.14), and append the resulting HTML table so ops
  // sees which KPI sections changed shape without opening two digest emails
  // side by side. A missing/unreadable/empty JSONL history is treated as a
  // first-run no-op (skipped_reason='no_previous_snapshot') so the very first
  // Monday after P11.15 ships does not fault. The delta section is deferred
  // until AFTER every KPI section is appended so the trailing table stays
  // adjacent to the sandbox-share row it primarily compares against.
  const webDir =
    process.env.BLOCKID_WEB_DIR ?? "/home/dovanlong/blockid.au/web";
  const digestJsonlPath = `${webDir}/content/reports/reseller-weekly-digest.jsonl`;
  // P11.20 rolling trend window — 4 weeks total including the current run, so
  // read the last 3 historical snapshots off disk and prepend them to the
  // current envelope before folding via computeDigestSnapshotRollingTrend.
  const ROLLING_TREND_WINDOW_SIZE = 4;
  let previousSnapshot: DigestSnapshot | null = null;
  let previousSnapshotSkipReason: string | null = null;
  let priorTrendSnapshots: readonly DigestSnapshot[] = [];
  try {
    const text = readFileSync(digestJsonlPath, "utf8");
    previousSnapshot = readLastDigestSnapshot(text);
    if (!previousSnapshot) previousSnapshotSkipReason = "no_previous_snapshot";
    priorTrendSnapshots = readLastNDigestSnapshots(
      text,
      ROLLING_TREND_WINDOW_SIZE - 1,
    );
  } catch (e) {
    const errno =
      e && typeof e === "object" && "code" in e
        ? String((e as { code?: unknown }).code)
        : "";
    previousSnapshotSkipReason =
      errno === "ENOENT" ? "no_previous_snapshot" : "history_read_failed";
    if (errno !== "ENOENT") {
      console.error("[reseller-weekly-digest] history read failed", e);
    }
  }

  // Build a slim envelope shaped like the response body's KPI-section keys so
  // computeDigestSnapshotDelta reads the same rows-length + skipped-reason
  // signals from this run as it will from next week's persisted snapshot. Only
  // presence + skipped_reason + rows.length are read (see readSectionState),
  // so we omit the numeric row content here to keep the diff footprint small.
  const currentEnvelopeForDelta: Record<string, unknown> = {
    reseller_count: digestRows.length,
    emailed: false,
    budget_utilization: budgetSkippedReason
      ? { skipped_reason: budgetSkippedReason }
      : { rows: budgetRows },
    tier_mix: tierMixSkippedReason
      ? { skipped_reason: tierMixSkippedReason }
      : { rows: tierMixRows },
    commission_cleared_mtd: clearedMtdSkippedReason
      ? { skipped_reason: clearedMtdSkippedReason }
      : { rows: clearedMtdRows },
    clawback_exposure: clawbackSkippedReason
      ? { skipped_reason: clawbackSkippedReason }
      : { rows: clawbackRows },
    attributed_mrr: mrrSkippedReason
      ? { skipped_reason: mrrSkippedReason }
      : { rows: mrrRows },
    attributed_net_contribution: netContributionSkippedReason
      ? { skipped_reason: netContributionSkippedReason }
      : { rows: netContributionRows },
    contribution_margin_pct: contributionMarginSkippedReason
      ? { skipped_reason: contributionMarginSkippedReason }
      : { rows: contributionMargins?.rows ?? [] },
    attributed_churn_30d: churnSkippedReason
      ? { skipped_reason: churnSkippedReason }
      : { rows: churnRows },
    ledger_drift_events: driftSkippedReason
      ? { skipped_reason: driftSkippedReason }
      : { rows: driftRows },
    gst_reconciliation_delta: gstDeltaSkippedReason
      ? { skipped_reason: gstDeltaSkippedReason }
      : { rows: gstDeltaRows },
    cohort_velocity: { rows: cohortVelocityRows },
    ltv_cac_per_reseller: ltvCacSkippedReason
      ? { skipped_reason: ltvCacSkippedReason }
      : { rows: ltvCacRows },
    sandbox_share_of_budget: budgetSkippedReason
      ? { skipped_reason: budgetSkippedReason }
      : { rows: sandboxShareRows },
  };
  const currentSnapshotForDelta = buildDigestSnapshot({
    capturedAt: now,
    week,
    envelope: currentEnvelopeForDelta,
  });
  let snapshotDelta: DigestSnapshotDelta | null = null;
  let snapshotMetricDelta: DigestSnapshotMetricDelta | null = null;
  let snapshotMetricPctChange: DigestSnapshotMetricPctChange | null = null;
  let snapshotPerResellerDelta: DigestSnapshotPerResellerDelta | null = null;
  let snapshotRollingTrend: DigestSnapshotRollingTrend | null = null;
  let snapshotPerResellerRollingTrend:
    | DigestSnapshotPerResellerRollingTrend
    | null = null;
  let snapshotPerResellerMetricPctChange:
    | DigestSnapshotPerResellerMetricPctChange
    | null = null;
  let snapshotPerResellerMetricPctChangePerMetric:
    | DigestSnapshotPerResellerMetricPctChangePerMetric
    | null = null;
  let snapshotPerResellerMetricPctChangeCoverage:
    | DigestSnapshotPerResellerMetricPctChangeCoverage
    | null = null;
  let snapshotPerResellerPctChangeCoverage:
    | DigestSnapshotPerResellerPctChangeCoverage
    | null = null;
  let snapshotPerResellerMetricPctChangePerReseller:
    | DigestSnapshotPerResellerMetricPctChangePerReseller
    | null = null;
  let snapshotTopMovers: DigestSnapshotTopMovers | null = null;
  let topMoversSection = "";
  let snapshotTopMoversPerMetric: DigestSnapshotTopMoversPerMetric | null = null;
  let topMoversPerMetricSection = "";
  let snapshotTopMoversPerReseller:
    | DigestSnapshotTopMoversPerReseller
    | null = null;
  let topMoversPerResellerSection = "";
  let snapshotDirectionStreaks: DigestSnapshotDirectionStreaks | null = null;
  let directionStreaksSection = "";
  let snapshotPerResellerDirectionStreaks:
    | DigestSnapshotPerResellerDirectionStreaks
    | null = null;
  let perResellerDirectionStreaksSection = "";
  let snapshotPctChangeStreaks: DigestSnapshotPctChangeStreaks | null = null;
  let pctChangeStreaksSection = "";
  let snapshotPerResellerPctChangeStreaks:
    | DigestSnapshotPerResellerPctChangeStreaks
    | null = null;
  let perResellerPctChangeStreaksSection = "";
  let snapshotPctChangeStreakCoverage:
    | DigestSnapshotPctChangeStreakCoverage
    | null = null;
  let pctChangeStreakCoverageSection = "";
  let snapshotPerResellerPctChangeStreakCoverage:
    | DigestSnapshotPerResellerPctChangeStreakCoverage
    | null = null;
  let perResellerPctChangeStreakCoverageSection = "";
  let snapshotDirectionStreakCoverage:
    | DigestSnapshotDirectionStreakCoverage
    | null = null;
  let directionStreakCoverageSection = "";
  let snapshotPerResellerDirectionStreakCoverage:
    | DigestSnapshotPerResellerDirectionStreakCoverage
    | null = null;
  let perResellerDirectionStreakCoverageSection = "";
  let snapshotPerMetricDirectionStreakCoverage:
    | DigestSnapshotPerMetricDirectionStreakCoverage
    | null = null;
  let perMetricDirectionStreakCoverageSection = "";
  let snapshotPerMetricPctChangeStreakCoverage:
    | DigestSnapshotPerMetricPctChangeStreakCoverage
    | null = null;
  let perMetricPctChangeStreakCoverageSection = "";
  let snapshotDirectionStreakLeaderboard:
    | DigestSnapshotDirectionStreakLeaderboard
    | null = null;
  let directionStreakLeaderboardSection = "";
  let snapshotPctChangeStreakLeaderboard:
    | DigestSnapshotPctChangeStreakLeaderboard
    | null = null;
  let pctChangeStreakLeaderboardSection = "";
  let snapshotPerMetricDirectionStreakLeaderboard:
    | DigestSnapshotPerMetricDirectionStreakLeaderboard
    | null = null;
  let perMetricDirectionStreakLeaderboardSection = "";
  let snapshotPerMetricPctChangeStreakLeaderboard:
    | DigestSnapshotPerMetricPctChangeStreakLeaderboard
    | null = null;
  let perMetricPctChangeStreakLeaderboardSection = "";
  let snapshotPerResellerDirectionStreakLeaderboard:
    | DigestSnapshotPerResellerDirectionStreakLeaderboard
    | null = null;
  let perResellerDirectionStreakLeaderboardSection = "";
  let snapshotPerResellerPctChangeStreakLeaderboard:
    | DigestSnapshotPerResellerPctChangeStreakLeaderboard
    | null = null;
  let perResellerPctChangeStreakLeaderboardSection = "";
  let snapshotDirectionStreakLengthHistogram:
    | DigestSnapshotDirectionStreakLengthHistogram
    | null = null;
  let directionStreakLengthHistogramSection = "";
  let snapshotDirectionStreakLengthPercentiles:
    | DigestSnapshotDirectionStreakLengthPercentiles
    | null = null;
  let directionStreakLengthPercentilesSection = "";
  let snapshotPctChangeStreakLengthHistogram:
    | DigestSnapshotPctChangeStreakLengthHistogram
    | null = null;
  let pctChangeStreakLengthHistogramSection = "";
  let snapshotPctChangeStreakLengthPercentiles:
    | DigestSnapshotPctChangeStreakLengthPercentiles
    | null = null;
  let pctChangeStreakLengthPercentilesSection = "";
  let snapshotPerResellerDirectionStreakLengthHistogram:
    | DigestSnapshotPerResellerDirectionStreakLengthHistogram
    | null = null;
  let perResellerDirectionStreakLengthHistogramSection = "";
  let snapshotPerResellerDirectionStreakLengthPercentiles:
    | DigestSnapshotPerResellerDirectionStreakLengthPercentiles
    | null = null;
  let perResellerDirectionStreakLengthPercentilesSection = "";
  let snapshotPerResellerPctChangeStreakLengthHistogram:
    | DigestSnapshotPerResellerPctChangeStreakLengthHistogram
    | null = null;
  let perResellerPctChangeStreakLengthHistogramSection = "";
  let snapshotPerResellerPctChangeStreakLengthPercentiles:
    | DigestSnapshotPerResellerPctChangeStreakLengthPercentiles
    | null = null;
  let perResellerPctChangeStreakLengthPercentilesSection = "";
  let snapshotPerMetricDirectionStreakLengthHistogram:
    | DigestSnapshotPerMetricDirectionStreakLengthHistogram
    | null = null;
  let perMetricDirectionStreakLengthHistogramSection = "";
  let snapshotPerMetricDirectionStreakLengthPercentiles:
    | DigestSnapshotPerMetricDirectionStreakLengthPercentiles
    | null = null;
  let perMetricDirectionStreakLengthPercentilesSection = "";
  let snapshotPerMetricPctChangeStreakLengthHistogram:
    | DigestSnapshotPerMetricPctChangeStreakLengthHistogram
    | null = null;
  let perMetricPctChangeStreakLengthHistogramSection = "";
  let snapshotPerMetricPctChangeStreakLengthPercentiles:
    | DigestSnapshotPerMetricPctChangeStreakLengthPercentiles
    | null = null;
  let perMetricPctChangeStreakLengthPercentilesSection = "";
  let snapshotPerMetricPersistenceScorecard:
    | DigestSnapshotPerMetricPersistenceScorecard
    | null = null;
  let perMetricPersistenceScorecardSection = "";
  let snapshotPerMetricPersistenceScorecardVerdict:
    | DigestSnapshotPerMetricPersistenceScorecardVerdict
    | null = null;
  let perMetricPersistenceScorecardVerdictSection = "";
  let snapshotPerMetricPersistenceScorecardVerdictTransition:
    | DigestSnapshotPerMetricPersistenceScorecardVerdictTransition
    | null = null;
  let perMetricPersistenceScorecardVerdictTransitionSection = "";
  let snapshotPerMetricPersistenceScorecardVerdictTransitionDistribution:
    | DigestSnapshotPerMetricPersistenceScorecardVerdictTransitionDistribution
    | null = null;
  let perMetricPersistenceScorecardVerdictTransitionDistributionSection = "";
  let snapshotPerResellerPersistenceScorecard:
    | DigestSnapshotPerResellerPersistenceScorecard
    | null = null;
  let perResellerPersistenceScorecardSection = "";
  let snapshotPerResellerMetricPersistenceScorecard:
    | DigestSnapshotPerResellerMetricPersistenceScorecard
    | null = null;
  let perResellerMetricPersistenceScorecardSection = "";
  let snapshotPerResellerMetricPersistenceScorecardVerdict:
    | DigestSnapshotPerResellerMetricPersistenceScorecardVerdict
    | null = null;
  let perResellerMetricPersistenceScorecardVerdictSection = "";
  let snapshotPerResellerMetricPersistenceScorecardVerdictTransition:
    | DigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransition
    | null = null;
  let perResellerMetricPersistenceScorecardVerdictTransitionSection = "";
  let snapshotPerResellerMetricPersistenceScorecardVerdictTransitionDistribution:
    | DigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransitionDistribution
    | null = null;
  let perResellerMetricPersistenceScorecardVerdictTransitionDistributionSection = "";
  let snapshotPerResellerPersistenceScorecardVerdict:
    | DigestSnapshotPerResellerPersistenceScorecardVerdict
    | null = null;
  let perResellerPersistenceScorecardVerdictSection = "";
  let snapshotPerResellerPersistenceScorecardVerdictTransition:
    | DigestSnapshotPerResellerPersistenceScorecardVerdictTransition
    | null = null;
  let perResellerPersistenceScorecardVerdictTransitionSection = "";
  let snapshotPerResellerPersistenceScorecardVerdictTransitionDistribution:
    | DigestSnapshotPerResellerPersistenceScorecardVerdictTransitionDistribution
    | null = null;
  let perResellerPersistenceScorecardVerdictTransitionDistributionSection = "";
  let snapshotPersistenceScorecard: DigestSnapshotPersistenceScorecard | null =
    null;
  let persistenceScorecardSection = "";
  let snapshotPersistenceScorecardVerdict:
    | DigestSnapshotPersistenceScorecardVerdict
    | null = null;
  let persistenceScorecardVerdictSection = "";
  let snapshotPersistenceScorecardVerdictTransition:
    | DigestSnapshotPersistenceScorecardVerdictTransition
    | null = null;
  let persistenceScorecardVerdictTransitionSection = "";
  let snapshotPersistenceScorecardVerdictTransitionDistribution:
    | DigestSnapshotPersistenceScorecardVerdictTransitionDistribution
    | null = null;
  let persistenceScorecardVerdictTransitionDistributionSection = "";
  let snapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlerts:
    | DigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlerts
    | null = null;
  let persistenceScorecardVerdictTransitionDistributionFamilyAlertsSection = "";
  let snapshotPerResellerCrossMetricAlerts:
    | DigestSnapshotPerResellerCrossMetricAlerts
    | null = null;
  let perResellerCrossMetricAlertsSection = "";
  let snapshotPerMetricCrossPartnerAlerts:
    | DigestSnapshotPerMetricCrossPartnerAlerts
    | null = null;
  let perMetricCrossPartnerAlertsSection = "";
  let snapshotPerPairHotCells: DigestSnapshotPerPairHotCells | null = null;
  let perPairHotCellsSection = "";
  let snapshotPerPairHotCellsSummary:
    | DigestSnapshotPerPairHotCellsSummary
    | null = null;
  let perPairHotCellsSummarySection = "";
  let snapshotPerTransitionHotCellsDrilldown:
    | DigestSnapshotPerTransitionHotCellsDrilldown
    | null = null;
  let perTransitionHotCellsDrilldownSection = "";
  let snapshotPerTransitionMagnitudeDrilldown:
    | DigestSnapshotPerTransitionMagnitudeDrilldown
    | null = null;
  let perTransitionMagnitudeDrilldownSection = "";
  let snapshotPerTransitionMagnitudeLeaderboard:
    | DigestSnapshotPerTransitionMagnitudeLeaderboard
    | null = null;
  let perTransitionMagnitudeLeaderboardSection = "";
  let snapshotPerTransitionMagnitudeTop3Leaderboard:
    | DigestSnapshotPerTransitionMagnitudeTop3Leaderboard
    | null = null;
  let perTransitionMagnitudeTop3LeaderboardSection = "";
  let snapshotPerTransitionMagnitudeTop3Concentration:
    | DigestSnapshotPerTransitionMagnitudeTop3Concentration
    | null = null;
  let perTransitionMagnitudeTop3ConcentrationSection = "";
  let snapshotPerTransitionMagnitudeTop3TieCount:
    | DigestSnapshotPerTransitionMagnitudeTop3TieCount
    | null = null;
  let perTransitionMagnitudeTop3TieCountSection = "";
  let snapshotPerTransitionMagnitudeTop3RunnerUpGap:
    | DigestSnapshotPerTransitionMagnitudeTop3RunnerUpGap
    | null = null;
  let perTransitionMagnitudeTop3RunnerUpGapSection = "";
  let snapshotPerTransitionMagnitudeTop3TailGap:
    | DigestSnapshotPerTransitionMagnitudeTop3TailGap
    | null = null;
  let perTransitionMagnitudeTop3TailGapSection = "";
  let snapshotPerTransitionMagnitudeTop3MiddleGap:
    | DigestSnapshotPerTransitionMagnitudeTop3MiddleGap
    | null = null;
  let perTransitionMagnitudeTop3MiddleGapSection = "";
  let snapshotPerTransitionMagnitudeTop3Pool:
    | DigestSnapshotPerTransitionMagnitudeTop3Pool
    | null = null;
  let perTransitionMagnitudeTop3PoolSection = "";
  let snapshotPerTransitionMagnitudeTop3PoolHhi:
    | DigestSnapshotPerTransitionMagnitudeTop3PoolHhi
    | null = null;
  let perTransitionMagnitudeTop3PoolHhiSection = "";
  let snapshotPerTransitionMagnitudeTop3PoolGini:
    | DigestSnapshotPerTransitionMagnitudeTop3PoolGini
    | null = null;
  let perTransitionMagnitudeTop3PoolGiniSection = "";
  let snapshotPerTransitionMagnitudeTop3PoolTheil:
    | DigestSnapshotPerTransitionMagnitudeTop3PoolTheil
    | null = null;
  let perTransitionMagnitudeTop3PoolTheilSection = "";
  let snapshotPerTransitionMagnitudeTop3PoolAtkinson:
    | DigestSnapshotPerTransitionMagnitudeTop3PoolAtkinson
    | null = null;
  let perTransitionMagnitudeTop3PoolAtkinsonSection = "";
  let snapshotPerTransitionMagnitudeTop3PoolCv:
    | DigestSnapshotPerTransitionMagnitudeTop3PoolCv
    | null = null;
  let perTransitionMagnitudeTop3PoolCvSection = "";
  let snapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy:
    | DigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy
    | null = null;
  let perTransitionMagnitudeTop3PoolNormalizedEntropySection = "";
  let snapshotPerTransitionMagnitudeTop3PoolTop1Share:
    | DigestSnapshotPerTransitionMagnitudeTop3PoolTop1Share
    | null = null;
  let perTransitionMagnitudeTop3PoolTop1ShareSection = "";
  let snapshotPerTransitionMagnitudeTop3PoolTop2Share:
    | DigestSnapshotPerTransitionMagnitudeTop3PoolTop2Share
    | null = null;
  let perTransitionMagnitudeTop3PoolTop2ShareSection = "";
  let snapshotPerTransitionMagnitudeTop3PoolBottom1Share:
    | DigestSnapshotPerTransitionMagnitudeTop3PoolBottom1Share
    | null = null;
  let perTransitionMagnitudeTop3PoolBottom1ShareSection = "";
  let snapshotPerTransitionMagnitudeTop3PoolRange:
    | DigestSnapshotPerTransitionMagnitudeTop3PoolRange
    | null = null;
  let perTransitionMagnitudeTop3PoolRangeSection = "";
  let snapshotPerTransitionMagnitudeTop3PoolBottom2Share:
    | DigestSnapshotPerTransitionMagnitudeTop3PoolBottom2Share
    | null = null;
  let perTransitionMagnitudeTop3PoolBottom2ShareSection = "";
  let snapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio:
    | DigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio
    | null = null;
  let perTransitionMagnitudeTop3PoolTop1Bottom1RatioSection = "";
  let snapshotPerTransitionMagnitudeTop3PoolTop2Bottom2Ratio:
    | DigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom2Ratio
    | null = null;
  let perTransitionMagnitudeTop3PoolTop2Bottom2RatioSection = "";
  let snapshotPerTransitionMagnitudeTop3PoolMidMassShare:
    | DigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShare
    | null = null;
  let perTransitionMagnitudeTop3PoolMidMassShareSection = "";
  let snapshotPerTransitionMagnitudeTop3PoolTop1Bottom2Ratio:
    | DigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom2Ratio
    | null = null;
  let perTransitionMagnitudeTop3PoolTop1Bottom2RatioSection = "";
  let snapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio:
    | DigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio
    | null = null;
  let perTransitionMagnitudeTop3PoolTop2Bottom1RatioSection = "";
  let snapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio:
    | DigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio
    | null = null;
  let perTransitionMagnitudeTop3PoolMedianMeanRatioSection = "";
  let snapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap:
    | DigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap
    | null = null;
  let perTransitionMagnitudeTop3PoolMeanMedianAbsoluteGapSection = "";
  let snapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation:
    | DigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation
    | null = null;
  let perTransitionMagnitudeTop3PoolMeanAbsoluteDeviationSection = "";
  let snapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation:
    | DigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation
    | null = null;
  let perTransitionMagnitudeTop3PoolMedianAbsoluteDeviationSection = "";
  let snapshotPerTransitionMagnitudeTop3PoolSkewness:
    | DigestSnapshotPerTransitionMagnitudeTop3PoolSkewness
    | null = null;
  let perTransitionMagnitudeTop3PoolSkewnessSection = "";
  let snapshotPerTransitionMagnitudeTop3PoolExcessKurtosis:
    | DigestSnapshotPerTransitionMagnitudeTop3PoolExcessKurtosis
    | null = null;
  let perTransitionMagnitudeTop3PoolExcessKurtosisSection = "";
  let snapshotPerTransitionMagnitudeTop3PoolIqr:
    | DigestSnapshotPerTransitionMagnitudeTop3PoolIqr
    | null = null;
  let perTransitionMagnitudeTop3PoolIqrSection = "";
  let snapshotPerTransitionMagnitudeTop3PoolIqrRatio:
    | DigestSnapshotPerTransitionMagnitudeTop3PoolIqrRatio
    | null = null;
  let perTransitionMagnitudeTop3PoolIqrRatioSection = "";
  let snapshotPerTransitionMagnitudeTop3PoolQcd:
    | DigestSnapshotPerTransitionMagnitudeTop3PoolQcd
    | null = null;
  let perTransitionMagnitudeTop3PoolQcdSection = "";
  let snapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange:
    | DigestSnapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange
    | null = null;
  let perTransitionMagnitudeTop3PoolCoefficientOfRangeSection = "";
  let snapshotPerTransitionMagnitudeTop3PoolBowleySkewness:
    | DigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewness
    | null = null;
  let perTransitionMagnitudeTop3PoolBowleySkewnessSection = "";
  let snapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis:
    | DigestSnapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis
    | null = null;
  let perTransitionMagnitudeTop3PoolMoorsKurtosisSection = "";
  if (previousSnapshot) {
    snapshotDelta = computeDigestSnapshotDelta(
      previousSnapshot,
      currentSnapshotForDelta,
    );
    const deltaSection = formatDigestSnapshotDeltaSection(snapshotDelta);
    if (deltaSection) html += deltaSection;
    // P11.16 — per-metric numeric delta. The previous snapshot carries the
    // full response body (see appendFileSync below at `envelope: body`) so its
    // rows[] arrays hold the numeric fields HEADLINE_METRICS sums. The current
    // slim envelope holds numeric row content too (each section's rows[] are
    // the same shape the response body publishes), so this diff is
    // symmetrical whether previous OR current came off disk.
    snapshotMetricDelta = computeDigestSnapshotMetricDelta(
      previousSnapshot,
      currentSnapshotForDelta,
    );
    const metricDeltaSection =
      formatDigestSnapshotMetricDeltaSection(snapshotMetricDelta);
    if (metricDeltaSection) html += metricDeltaSection;
    // P11.38 — signed percent-change companion to the P11.16 absolute
    // cent/count metric-delta table (module P11.37). Reuses HEADLINE_METRICS +
    // readSectionTotal from the P11.16 lib so the two projections cannot drift
    // on which row-level field they sum or how they walk the flat-vs-nested
    // envelope. Consumes the same (previousSnapshot, currentSnapshotForDelta)
    // pair — no extra fs read, no second envelope fold. Rendered directly
    // after the P11.16 absolute-delta section so the reader walks structural
    // triage → per-metric absolute cents → per-metric percent change and can
    // triage a +A$500 mover as either "5000% pop on a $10 base worth
    // investigating" or "0.05% blip on a $1M base — noise" at a glance
    // without opening the sibling table.
    snapshotMetricPctChange = computeDigestSnapshotMetricPctChange(
      previousSnapshot,
      currentSnapshotForDelta,
    );
    const metricPctChangeSection =
      formatDigestSnapshotMetricPctChangeSection(snapshotMetricPctChange);
    if (metricPctChangeSection) html += metricPctChangeSection;
    // P11.18 — per-reseller drill-down (module P11.17). Names the specific
    // partners whose per-metric total moved so ops does not have to open
    // /admin/resellers/[code] per row to identify the mover. Rendered after
    // the portfolio table so the aggregate lands first and the drill-down
    // reads as a follow-up.
    snapshotPerResellerDelta = computeDigestSnapshotPerResellerDelta(
      previousSnapshot,
      currentSnapshotForDelta,
    );
    const perResellerDeltaSection =
      formatDigestSnapshotPerResellerDeltaSection(snapshotPerResellerDelta);
    if (perResellerDeltaSection) html += perResellerDeltaSection;
    // P11.20 — N-week rolling trend across HEADLINE_METRICS. Fold the last
    // ROLLING_TREND_WINDOW_SIZE-1 historical snapshots off disk plus the
    // current run into computeDigestSnapshotRollingTrend so ops sees a compact
    // portfolio-wide trend table sorted by |first→last delta| desc. Rendered
    // after the per-reseller drill-down so a top-to-bottom read walks
    // structural triage → portfolio totals → per-partner drill-down →
    // multi-week trend. The pure lib suppresses its own output when
    // window_size < 2 or every metric has a null delta, so no extra guard is
    // needed at the call site.
    const trendSnapshots: readonly DigestSnapshot[] = [
      ...priorTrendSnapshots,
      currentSnapshotForDelta,
    ];
    snapshotRollingTrend = computeDigestSnapshotRollingTrend(trendSnapshots);
    const rollingTrendSection = formatDigestSnapshotRollingTrendSection(
      snapshotRollingTrend,
    );
    if (rollingTrendSection) html += rollingTrendSection;
    // P11.22 — per-reseller drill-down for the P11.20/P11.21 portfolio rolling
    // trend. Names the specific partners whose per-metric total moved across
    // the N-week window so ops does not have to open /admin/resellers/[code]
    // per row to identify which partner drove the aggregate slide. Same
    // trendSnapshots buffer as P11.21 (no second fs read). Rendered after the
    // portfolio trend section so a top-to-bottom read walks structural triage
    // → portfolio totals → per-partner drill-down → portfolio trend →
    // per-partner trend drill-down. The pure lib suppresses its own output
    // when window_size < 2 or every (metric × reseller) row has a zero delta,
    // so no extra guard is needed at the call site.
    snapshotPerResellerRollingTrend =
      computeDigestSnapshotPerResellerRollingTrend(trendSnapshots);
    const perResellerRollingTrendSection =
      formatDigestSnapshotPerResellerRollingTrendSection(
        snapshotPerResellerRollingTrend,
      );
    if (perResellerRollingTrendSection)
      html += perResellerRollingTrendSection;
    // P11.40 — per-(reseller × metric) percent-change drill-down (module
    // P11.39). Companion to the P11.38 portfolio-scale pct-change section —
    // guarantees a small partner doubling attributed_mrr at low scale (a
    // +100% signal worth investigating) surfaces even when a bigger partner
    // nudging the same metric by 1% wins the raw absolute-cents ranking that
    // drowns the relative signal in the aggregate denominator. Consumes the
    // SAME snapshotPerResellerRollingTrend fold P11.29 top-movers-per-
    // reseller / P11.33 per-reseller direction-streaks read from (no second
    // per-reseller trend fold, no divergence risk on how first_total /
    // last_total are computed), and reuses the P11.37 PCT_CHANGE_MATERIAL_
    // THRESHOLD constant so the "material" band is one source of truth
    // across the portfolio + per-partner percent-change surfaces. Rendered
    // directly after the per-reseller rolling trend drill-down (P11.22/
    // P11.23) so ops walks per-partner absolute trend → per-partner
    // percent-change drill-down on the same page.
    snapshotPerResellerMetricPctChange =
      computeDigestSnapshotPerResellerMetricPctChange(
        snapshotPerResellerRollingTrend,
      );
    const perResellerMetricPctChangeSection =
      formatDigestSnapshotPerResellerMetricPctChangeSection(
        snapshotPerResellerMetricPctChange,
      );
    if (perResellerMetricPctChangeSection)
      html += perResellerMetricPctChangeSection;
    // P11.42 — per-metric coverage spotlight for the P11.39/P11.40 per-
    // (reseller × metric) percent-change drill-down (module P11.41).
    // P11.39/P11.40 pool every metric into one |pct_change| leaderboard so a
    // metric whose partners all move sharply in relative terms (an
    // attributed_mrr sea-change week) can starve coverage for metrics whose
    // biggest movers are smaller in |pct_change| but still material to ops
    // (a tier_mix or attributed_churn_30d row that never surfaces even
    // though it crossed the PCT_CHANGE_MATERIAL_THRESHOLD floor). This
    // section guarantees every HEADLINE_METRICS spec with a computable-pct
    // mover gets at least one row — the P11.26 → P11.41 twin on the
    // relative axis. Consumes the SAME snapshotPerResellerRollingTrend fold
    // as P11.40, so a metric group's spotlight row cannot diverge from the
    // pooled drill-down above it. Rendered directly after the per-reseller
    // pct-change drill-down so ops walks pooled per-partner |pct| →
    // per-metric |pct| spotlight (coverage guarantee) on the same page.
    snapshotPerResellerMetricPctChangePerMetric =
      computeDigestSnapshotPerResellerMetricPctChangePerMetric(
        snapshotPerResellerRollingTrend,
      );
    const perResellerMetricPctChangePerMetricSection =
      formatDigestSnapshotPerResellerMetricPctChangePerMetricSection(
        snapshotPerResellerMetricPctChangePerMetric,
      );
    if (perResellerMetricPctChangePerMetricSection)
      html += perResellerMetricPctChangePerMetricSection;
    // P11.44 — per-metric |pct_change| coverage summary (module P11.43).
    // Companions the P11.41/P11.42 per-metric spotlight above: the spotlight
    // names the biggest mover per metric; this coverage table quantifies the
    // bucket depth behind that name (total_rows / computable_rows /
    // material_rows / material_rate_pct + signed-pct min/median/max
    // distribution) so ops can distinguish "one of many big movers" (crowded
    // market — spotlight partner is representative) from "the only mover we
    // can talk about" (thin signal — spotlight partner is the entire story).
    // Consumes the SAME snapshotPerResellerRollingTrend fold as P11.40/P11.42,
    // so a coverage cell cannot diverge from the spotlight row it summarises.
    // Rendered directly after the per-metric spotlight so ops walks per-metric
    // spotlight (who moved most in each metric) → per-metric coverage (how
    // thin/deep the movement was in each metric) on the same page.
    snapshotPerResellerMetricPctChangeCoverage =
      computeDigestSnapshotPerResellerMetricPctChangeCoverage(
        snapshotPerResellerRollingTrend,
      );
    const perResellerMetricPctChangeCoverageSection =
      formatDigestSnapshotPerResellerMetricPctChangeCoverageSection(
        snapshotPerResellerMetricPctChangeCoverage,
      );
    if (perResellerMetricPctChangeCoverageSection)
      html += perResellerMetricPctChangeCoverageSection;
    // P11.46 — per-reseller |pct_change| coverage summary (module P11.45).
    // Mirror pivot of the P11.44 per-metric coverage above: instead of grouping
    // by HEADLINE_METRICS to answer "how thin/deep was each metric moved
    // across the partner set", this folds the SAME
    // snapshotPerResellerRollingTrend object by reseller_code to answer "how
    // thin/deep did each partner move across the metric set". A partner who
    // touched every metric with small moves reads identically to one who
    // touched only one metric with a large move under the P11.44 grouping;
    // this table separates them. Rows emitted in reseller_code alphabetical
    // order so ops reads the same partner ladder every Monday. Rendered
    // directly after perResellerMetricPctChangeCoverageSection so the reader
    // walks per-metric coverage (which METRICS moved broadly) → per-reseller
    // coverage (which PARTNERS moved broadly) on the same page — mirrors the
    // P11.44 landing after P11.42 for the same-axis pair above.
    snapshotPerResellerPctChangeCoverage =
      computeDigestSnapshotPerResellerPctChangeCoverage(
        snapshotPerResellerRollingTrend,
      );
    const perResellerPctChangeCoverageSection =
      formatDigestSnapshotPerResellerPctChangeCoverageSection(
        snapshotPerResellerPctChangeCoverage,
      );
    if (perResellerPctChangeCoverageSection)
      html += perResellerPctChangeCoverageSection;
    // P11.48 — per-reseller |pct_change| spotlight (module P11.47). Mirror of
    // the P11.41/P11.42 per-metric |pct_change| spotlight on the per-reseller
    // axis: guarantees every partner surfaces its own biggest relative mover
    // regardless of how the pooled P11.39 leaderboard OR the per-metric
    // P11.41 spotlight shakes out. Coverage-per-partner rather than
    // depth-per-partner (DEFAULT_TOP_N_PER_RESELLER_PCT_CHANGE=1). Consumes
    // the SAME snapshotPerResellerRollingTrend fold as P11.40/P11.42/P11.44/
    // P11.46 — no second per-reseller trend fold, no divergence risk. Ops
    // walks per-reseller coverage summary (P11.46: how thin/deep each partner
    // moved) → per-reseller |pct| spotlight (P11.48: which single metric
    // moved the most in relative terms for each partner) on the same page.
    snapshotPerResellerMetricPctChangePerReseller =
      computeDigestSnapshotPerResellerMetricPctChangePerReseller(
        snapshotPerResellerRollingTrend,
      );
    const perResellerMetricPctChangePerResellerSection =
      formatDigestSnapshotPerResellerMetricPctChangePerResellerSection(
        snapshotPerResellerMetricPctChangePerReseller,
      );
    if (perResellerMetricPctChangePerResellerSection)
      html += perResellerMetricPctChangePerResellerSection;
    // P11.25 — top-N |delta| movers headline (module P11.24). Project the
    // per-reseller rolling trend into the biggest cross-metric shifts and
    // render a compact executive summary. Computed here so the source data
    // (snapshotPerResellerRollingTrend) is guaranteed populated; spliced right
    // after digestHeader below so it lands above the fold in the email preview
    // pane rather than at the bottom of the drill-down ladder.
    snapshotTopMovers = computeDigestSnapshotTopMovers(
      snapshotPerResellerRollingTrend,
    );
    topMoversSection = formatDigestSnapshotTopMoversSection(snapshotTopMovers);
    // P11.27 — per-metric top-N |delta| spotlight (module P11.26). Projects the
    // SAME per-reseller rolling trend down to at least one row per
    // HEADLINE_METRICS spec that has any mover, so count-unit metrics
    // (attributed_churn_30d, cohort_velocity, ledger_drift_events, tier_mix,
    // sandbox_share_of_budget, budget_utilization) surface alongside the
    // cents-scale movers that dominate the P11.24 portfolio-wide ranking. No
    // second rolling-trend fold, no divergence risk.
    snapshotTopMoversPerMetric = computeDigestSnapshotTopMoversPerMetric(
      snapshotPerResellerRollingTrend,
    );
    topMoversPerMetricSection = formatDigestSnapshotTopMoversPerMetricSection(
      snapshotTopMoversPerMetric,
    );
    // P11.29 — per-reseller top-N |delta| spotlight (module P11.28). Projects
    // the SAME per-reseller rolling trend down to at least one row per
    // reseller_code that has any non-null-non-zero mover, so a busy partner
    // driving several material shifts is guaranteed a spotlight row even when
    // each of their moves loses the metric-group race to a larger competitor
    // in the P11.24/P11.26 headlines. No second rolling-trend fold, no
    // divergence risk vs. the per-metric spotlight or the drill-down table
    // that consumes the same source.
    snapshotTopMoversPerReseller = computeDigestSnapshotTopMoversPerReseller(
      snapshotPerResellerRollingTrend,
    );
    topMoversPerResellerSection =
      formatDigestSnapshotTopMoversPerResellerSection(
        snapshotTopMoversPerReseller,
      );
    // P11.31 — sustained-direction streak detector (module P11.30). Projects
    // the SAME portfolio-wide rolling trend used by P11.21 down to the longest
    // run of consecutive same-sign point-to-point deltas per metric. Answers
    // the persistence angle the |delta|-magnitude ranking (P11.24/P11.26/
    // P11.28) may bury — a metric that slid every week is a fundamentally
    // different signal from one that dropped once and stayed flat, even at
    // equal |first→last| delta. Consumes snapshotRollingTrend directly (no
    // second trend fold, no divergence risk vs. the drill-down trend table
    // this streak summary sits above).
    snapshotDirectionStreaks = computeDigestSnapshotDirectionStreaks(
      snapshotRollingTrend,
    );
    directionStreaksSection = formatDigestSnapshotDirectionStreaksSection(
      snapshotDirectionStreaks,
    );
    // P11.33 — per-reseller sustained-direction streak detector (module P11.32).
    // Projects the SAME per-reseller rolling trend used by P11.22 down to the
    // longest run of consecutive same-sign point-to-point deltas per
    // (metric × reseller_code). Drills down the P11.31 portfolio streak table
    // above it and — critically — surfaces counter-balanced patterns
    // invisible to P11.31 (partner A slides -5000/wk while partner B climbs
    // +5000/wk for 3 weeks → portfolio flat every single week so P11.31 is
    // silent yet both partners ran material length-3 streaks). Consumes
    // snapshotPerResellerRollingTrend directly (no second per-reseller trend
    // fold, no divergence risk vs. the per-reseller drill-down trend table
    // this streak drill-down summarises).
    snapshotPerResellerDirectionStreaks =
      computeDigestSnapshotPerResellerDirectionStreaks(
        snapshotPerResellerRollingTrend,
      );
    perResellerDirectionStreaksSection =
      formatDigestSnapshotPerResellerDirectionStreaksSection(
        snapshotPerResellerDirectionStreaks,
      );
    // P11.50 — sustained-|pct|-material streak detector (module P11.49).
    // Companion to the P11.31 sign-of-delta streak table above. Consumes the
    // SAME portfolio-wide snapshotRollingTrend the P11.21/P11.31 sections
    // already read (no second trend fold, no divergence risk vs. the trend
    // table this streak summary sits beside). Surfaces metrics whose |pct|
    // stayed ≥ 25% for 2+ consecutive point-to-point transitions — a
    // sustained-volatility signal invisible to the P11.31 direction filter
    // when a metric's sign flips week over week but its magnitude keeps
    // swinging materially.
    snapshotPctChangeStreaks = computeDigestSnapshotPctChangeStreaks(
      snapshotRollingTrend,
    );
    pctChangeStreaksSection = formatDigestSnapshotPctChangeStreaksSection(
      snapshotPctChangeStreaks,
    );
    // P11.52 — per-reseller sustained-|pct|-material streak detector (module
    // P11.51). Drills the P11.50 portfolio |pct|-material streak table above
    // down to (metric × reseller_code) so ops can name the specific partner
    // whose subscriber mix keeps churning materially week over week even when
    // direction flips. Consumes the SAME snapshotPerResellerRollingTrend the
    // P11.22/P11.33 sections already read (no second per-reseller trend fold,
    // no divergence risk vs. the per-reseller sign-streak table it sits
    // beside). Surfaces counter-balanced volatility invisible to P11.50 —
    // partner A churns +35/-30/+40/-32% while partner B swings the opposite
    // direction by the same magnitude, leaving the portfolio total flat every
    // week so P11.50 stays silent yet both partners ran material length-3
    // streaks.
    snapshotPerResellerPctChangeStreaks =
      computeDigestSnapshotPerResellerPctChangeStreaks(
        snapshotPerResellerRollingTrend,
      );
    perResellerPctChangeStreaksSection =
      formatDigestSnapshotPerResellerPctChangeStreaksSection(
        snapshotPerResellerPctChangeStreaks,
      );
    // P11.54 — portfolio-wide sustained-|pct|-material streak coverage summary
    // (module P11.53). Topline for the P11.49/P11.50 spotlight below: how many
    // of the canonical HEADLINE_METRICS ladder is on a length-N streak this
    // week, with min/median/max streak length across the qualifying metrics.
    // Consumes the SAME portfolio-wide snapshotRollingTrend the P11.49 detector
    // already consumes (no extra fold, no divergence vs. the spotlight rows it
    // summarises). Lands directly above pctChangeStreaksSection so ops reads
    // the topline (is the whole portfolio churning, or one outlier metric
    // monopolising the signal?) before scanning the per-metric detail table.
    snapshotPctChangeStreakCoverage =
      computeDigestSnapshotPctChangeStreakCoverage(snapshotRollingTrend);
    pctChangeStreakCoverageSection =
      formatDigestSnapshotPctChangeStreakCoverageSection(
        snapshotPctChangeStreakCoverage,
      );
    // P11.56 — per-reseller sustained-|pct|-material streak coverage summary
    // (module P11.55). Per-partner topline for the P11.51/P11.52 spotlight
    // below, mirroring how P11.54 tops P11.49/P11.50 on the portfolio axis.
    // Consumes the SAME snapshotPerResellerRollingTrend the P11.51 detector
    // already consumes (no extra per-reseller trend fold, no divergence risk
    // vs. the spotlight rows this coverage summary tops). Lands directly
    // above perResellerPctChangeStreaksSection so ops reads the per-partner
    // topline (which partners have how many KPIs on a streak) before scanning
    // the per-(metric × partner) detail rows — mirrors the P11.54 topline →
    // P11.50 detail convention on the portfolio axis.
    snapshotPerResellerPctChangeStreakCoverage =
      computeDigestSnapshotPerResellerPctChangeStreakCoverage(
        snapshotPerResellerRollingTrend,
      );
    perResellerPctChangeStreakCoverageSection =
      formatDigestSnapshotPerResellerPctChangeStreakCoverageSection(
        snapshotPerResellerPctChangeStreakCoverage,
      );
    // P11.58 — portfolio-wide sustained-direction streak coverage summary
    // (module P11.57). Topline for the P11.30/P11.31 direction-streak
    // spotlight, mirroring how P11.54 tops P11.49/P11.50 for |pct|-magnitude
    // coverage on the portfolio axis. Consumes the SAME portfolio-wide
    // snapshotRollingTrend the P11.30 detector already consumes (no extra
    // fold, no divergence risk vs. the spotlight rows this coverage summary
    // tops). Lands directly above directionStreaksSection so ops reads the
    // topline (how many KPIs are on a same-direction streak, split up vs
    // down) before scanning the per-metric detail table — a portfolio with
    // 5 up-streaks and 0 down-streaks tells a fundamentally different story
    // from 0 up / 5 down even at the same coverage_rate_pct.
    snapshotDirectionStreakCoverage =
      computeDigestSnapshotDirectionStreakCoverage(snapshotRollingTrend);
    directionStreakCoverageSection =
      formatDigestSnapshotDirectionStreakCoverageSection(
        snapshotDirectionStreakCoverage,
      );
    // P11.60 — per-reseller sustained-direction streak coverage summary
    // (module P11.59). Per-partner topline for the P11.32/P11.33 direction
    // spotlight, mirroring how P11.56 tops P11.51/P11.52 for |pct|-magnitude
    // coverage on the per-partner axis and how P11.58 tops P11.30/P11.31 on
    // the portfolio direction axis. Consumes the SAME
    // snapshotPerResellerRollingTrend the P11.32 detector already consumes (no
    // extra per-reseller trend fold, no divergence risk vs. the spotlight rows
    // this coverage summary tops). Lands directly above
    // perResellerDirectionStreaksSection so ops reads the per-partner topline
    // (which partners have how many KPIs on a same-direction streak, split up
    // vs down) before scanning the per-(metric × partner) detail rows — a
    // partner with 3 up / 0 down at 100% coverage is systemically climbing,
    // 0 up / 3 down at 100% is systemically sliding, 2 up / 2 down is
    // oscillating internally in a way the aggregate hides.
    snapshotPerResellerDirectionStreakCoverage =
      computeDigestSnapshotPerResellerDirectionStreakCoverage(
        snapshotPerResellerRollingTrend,
      );
    perResellerDirectionStreakCoverageSection =
      formatDigestSnapshotPerResellerDirectionStreakCoverageSection(
        snapshotPerResellerDirectionStreakCoverage,
      );
    // P11.62 — per-metric sustained-direction streak coverage summary
    // (module P11.61). Metric-anchored topline for the P11.30/P11.31 direction
    // spotlight, pivoting the P11.59/P11.60 per-partner coverage shape onto
    // the metric axis. Delegates to computeDigestSnapshotPerResellerDirectionStreaks
    // through the pure lib so the per-KPI up/down partner counts cannot
    // diverge from the P11.32 spotlight rows this coverage summary tops.
    // Consumes the SAME snapshotPerResellerRollingTrend the P11.32 detector
    // already consumes (no extra fold, no divergence risk). Lands directly
    // ABOVE directionStreaksSection (P11.31 portfolio spotlight) so ops reads
    // the metric-anchored topline (for THIS KPI, how many partners are on a
    // streak, up vs down) before scanning the per-metric spotlight — a KPI
    // with 5/5 partners on a downward streak is under systemic pressure that
    // justifies a product/pricing/retention response, a KPI with 3 up / 2
    // down is idiosyncratic noise that the composite P11.58 portfolio topline
    // above it would collapse into a single "streak on/off" signal.
    snapshotPerMetricDirectionStreakCoverage =
      computeDigestSnapshotPerMetricDirectionStreakCoverage(
        snapshotPerResellerRollingTrend,
      );
    perMetricDirectionStreakCoverageSection =
      formatDigestSnapshotPerMetricDirectionStreakCoverageSection(
        snapshotPerMetricDirectionStreakCoverage,
      );
    // P11.64 — per-metric sustained-|pct|-material streak coverage summary
    // (module P11.63). Metric-anchored topline for the P11.49/P11.50 portfolio
    // |pct|-material spotlight, pivoting the P11.55/P11.56 per-partner coverage
    // shape onto the metric axis and mirroring P11.62's per-metric direction
    // coverage on the |pct|-magnitude axis. Delegates to
    // computeDigestSnapshotPerResellerPctChangeStreaks through the pure lib so
    // the per-KPI streaking-partner counts cannot diverge from the P11.51
    // spotlight rows this coverage summary tops. Consumes the SAME
    // snapshotPerResellerRollingTrend the P11.51 detector already consumes (no
    // extra fold, no divergence risk). Lands directly ABOVE pctChangeStreaksSection
    // (P11.50 portfolio |pct| spotlight) so ops reads the metric-anchored
    // topline (for THIS KPI, how many partners are swinging materially this
    // window) before scanning the per-metric spotlight — a KPI with 5/5
    // partners on a length-3+ |pct|-material streak is under systemic
    // portfolio-wide volatility that justifies a product/pricing/retention
    // response, a KPI with 1/5 streaking is a single-partner idiosyncratic
    // outlier that the composite P11.54 portfolio topline above it collapses
    // into a single "streak on/off" signal. No up/down split because |pct| is
    // signless-material (unlike P11.62 which carries the split on the direction
    // axis).
    snapshotPerMetricPctChangeStreakCoverage =
      computeDigestSnapshotPerMetricPctChangeStreakCoverage(
        snapshotPerResellerRollingTrend,
      );
    perMetricPctChangeStreakCoverageSection =
      formatDigestSnapshotPerMetricPctChangeStreakCoverageSection(
        snapshotPerMetricPctChangeStreakCoverage,
      );
    // P11.66 — top-of-fold sustained-direction streak leaderboard (module
    // P11.65). Ranks the deepest sustained-direction streaks across the
    // (metric × partner) matrix by length desc primary, |cumulative_delta|
    // desc secondary so both persistence and magnitude float to the top.
    // Delegates to computeDigestSnapshotPerResellerDirectionStreaks through
    // the pure lib so leaderboard entries cannot diverge from the P11.32
    // spotlight rows they summarise — an entry ranked #1 here appears in the
    // P11.32 table below with matching direction / length / cumulative_delta.
    // Consumes the SAME snapshotPerResellerRollingTrend the P11.32 detector
    // already consumes (no extra fold, no divergence risk vs. the spotlight
    // rows this leaderboard tops). Lands directly ABOVE
    // perResellerDirectionStreaksSection (P11.32/P11.33) so ops reads the
    // top-N leaderboard strip before scrolling into the full drill-down
    // table — on a large portfolio the P11.32 spotlight is length-sorted but
    // uncapped and can carry dozens of rows, and this leaderboard surfaces
    // the deepest partner × KPI runs at a glance. total_qualified is carried
    // on the envelope so a "Top 10 of 47" caption tells ops how much detail
    // lives in the P11.32 spotlight below.
    snapshotDirectionStreakLeaderboard =
      computeDigestSnapshotDirectionStreakLeaderboard(
        snapshotPerResellerRollingTrend,
      );
    directionStreakLeaderboardSection =
      formatDigestSnapshotDirectionStreakLeaderboardSection(
        snapshotDirectionStreakLeaderboard,
      );
    // P11.68 — top-of-fold sustained-|pct|-material streak leaderboard (module
    // P11.67). |pct|-magnitude analogue of the P11.66 direction-streak
    // leaderboard: ranks the most-volatile sustained-|pct|-material streaks
    // across the (metric × partner) matrix by length desc primary,
    // cumulative_abs_pct desc secondary so both persistence and total swing
    // magnitude float to the top. Delegates to
    // computeDigestSnapshotPerResellerPctChangeStreaks through the pure lib so
    // leaderboard entries cannot diverge from the P11.51/P11.52 spotlight rows
    // they summarise — an entry ranked #1 here appears in the P11.52 table
    // below with matching length / max_abs_pct / min_abs_pct / transitions.
    // Consumes the SAME snapshotPerResellerRollingTrend the P11.51 detector
    // already consumes (no extra fold, no divergence risk vs. the spotlight
    // rows this leaderboard tops). Lands directly ABOVE
    // perResellerPctChangeStreaksSection (P11.51/P11.52) so ops reads the
    // top-N leaderboard strip before scrolling into the full drill-down table
    // — on a large portfolio the P11.51 spotlight is length-sorted but uncapped
    // and can carry dozens of rows, and this leaderboard surfaces the most
    // volatile partner × KPI runs at a glance. total_qualified is carried on
    // the envelope so a "Top 10 of 47" caption tells ops how much detail lives
    // in the P11.51/P11.52 spotlight below.
    snapshotPctChangeStreakLeaderboard =
      computeDigestSnapshotPctChangeStreakLeaderboard(
        snapshotPerResellerRollingTrend,
      );
    pctChangeStreakLeaderboardSection =
      formatDigestSnapshotPctChangeStreakLeaderboardSection(
        snapshotPctChangeStreakLeaderboard,
      );
    // P11.70 — per-metric top-of-fold sustained-direction streak leaderboards
    // (module P11.69). Per-KPI analogue of the P11.66 flat matrix leaderboard:
    // instead of one length-sorted top-N pool across every (metric × partner)
    // pair, this renders an independent top-N ranking PER metric so a partner
    // leading on churn recovery cannot be crowded out by a partner riding a
    // volatile attributed_mrr swing. Delegates to
    // computeDigestSnapshotPerResellerDirectionStreaks through the pure lib so
    // leaderboard entries cannot diverge from the P11.32 spotlight rows they
    // summarise — an entry ranked #1 in a group here appears in the P11.32
    // table below with matching direction / length / cumulative_delta.
    // Consumes the SAME snapshotPerResellerRollingTrend the P11.32 detector
    // and the P11.66 flat leaderboard already consume (no extra fold, no
    // divergence risk vs. the spotlight rows this leaderboard tops). Lands
    // directly BETWEEN the P11.66 flat matrix leaderboard and the
    // perResellerDirectionStreaksSection (P11.32/P11.33) so ops reads matrix
    // top-N → per-KPI top-N (equal footing across metrics) → full per-partner
    // drill-down. Per-group total_qualified is carried on the envelope so a
    // "Top 3 of 8 partners on attributed_mrr" caption tells ops how much
    // detail lives in the P11.32 spotlight below for that KPI specifically.
    snapshotPerMetricDirectionStreakLeaderboard =
      computeDigestSnapshotPerMetricDirectionStreakLeaderboard(
        snapshotPerResellerRollingTrend,
      );
    perMetricDirectionStreakLeaderboardSection =
      formatDigestSnapshotPerMetricDirectionStreakLeaderboardSection(
        snapshotPerMetricDirectionStreakLeaderboard,
      );
    // P11.72 — per-metric top-of-fold sustained-|pct|-material streak
    // leaderboards (module P11.71). |pct|-magnitude analogue of the P11.70
    // per-metric direction-streak leaderboards: instead of one length-sorted
    // top-N pool across every (metric × partner) pair (the P11.68 flat matrix
    // leaderboard), this renders an independent top-N ranking PER metric so a
    // partner leading on churn volatility cannot be crowded out by a partner
    // riding a volatile attributed_mrr swing. Delegates to
    // computeDigestSnapshotPerResellerPctChangeStreaks through the pure lib so
    // leaderboard entries cannot diverge from the P11.51/P11.52 spotlight rows
    // they summarise — an entry ranked #1 in a group here appears in the
    // P11.52 table below with matching length / max_abs_pct / min_abs_pct /
    // cumulative_abs_pct. Consumes the SAME snapshotPerResellerRollingTrend
    // the P11.51 detector and the P11.68 flat leaderboard already consume (no
    // extra fold, no divergence risk vs. the spotlight rows this per-metric
    // leaderboard tops). Lands directly BETWEEN the P11.68 flat matrix
    // leaderboard (pctChangeStreakLeaderboardSection) and the
    // perResellerPctChangeStreaksSection (P11.51/P11.52) so ops reads matrix
    // top-N → per-KPI top-N (equal footing across metrics) → full per-partner
    // drill-down — structural echo of the P11.66 → P11.70 → P11.32 placement
    // on the direction axis, mirrored on the |pct|-magnitude axis. Per-group
    // total_qualified is carried on the envelope so a "Top 3 of 8 partners on
    // churn" caption tells ops how much detail lives in the P11.52 spotlight
    // below for that KPI specifically.
    snapshotPerMetricPctChangeStreakLeaderboard =
      computeDigestSnapshotPerMetricPctChangeStreakLeaderboard(
        snapshotPerResellerRollingTrend,
      );
    perMetricPctChangeStreakLeaderboardSection =
      formatDigestSnapshotPerMetricPctChangeStreakLeaderboardSection(
        snapshotPerMetricPctChangeStreakLeaderboard,
      );
    // P11.74 — per-partner top-of-fold sustained-direction streak
    // leaderboards (module P11.73). Per-partner analogue of the P11.70
    // per-metric leaderboards: instead of one length-sorted top-N pool per
    // KPI, this renders an independent top-N ranking PER partner so a small
    // partner leading on their own churn recovery ranks #1 on their own book
    // even if their MRR magnitude wouldn't crack the flat matrix leaderboard
    // (P11.66) or the per-metric strip (P11.70). Delegates to
    // computeDigestSnapshotPerResellerDirectionStreaks through the pure lib
    // so leaderboard entries cannot diverge from the P11.32 spotlight rows
    // they summarise — an entry ranked #1 in a partner group here appears in
    // the P11.32 table below with matching direction / length /
    // cumulative_delta. Consumes the SAME snapshotPerResellerRollingTrend the
    // P11.32 detector and the P11.66 / P11.70 leaderboards already consume
    // (no extra fold, no divergence risk vs. the spotlight rows this
    // per-partner leaderboard tops). Lands directly BETWEEN the P11.70
    // per-metric leaderboard (perMetricDirectionStreakLeaderboardSection) and
    // the perResellerDirectionStreaksSection (P11.32/P11.33) so ops reads
    // matrix top-N → per-KPI top-N → per-partner top-N (equal footing across
    // partners) → full per-(metric × partner) drill-down. Closes the
    // leaderboard family's per-partner axis symmetric with the coverage
    // family's per-reseller split at P11.59. Per-group total_qualified is
    // carried on the envelope so a "Top 3 of 8 KPIs for ACME" caption tells
    // ops how much detail lives in the P11.32 spotlight below for that
    // partner specifically.
    snapshotPerResellerDirectionStreakLeaderboard =
      computeDigestSnapshotPerResellerDirectionStreakLeaderboard(
        snapshotPerResellerRollingTrend,
      );
    perResellerDirectionStreakLeaderboardSection =
      formatDigestSnapshotPerResellerDirectionStreakLeaderboardSection(
        snapshotPerResellerDirectionStreakLeaderboard,
      );
    // P11.76 — per-partner top-of-fold sustained-|pct|-material streak
    // leaderboards (module P11.75). |pct|-magnitude analogue of the P11.74
    // per-partner direction leaderboards, and per-partner analogue of the
    // P11.72 per-metric |pct|-material leaderboards: instead of one length-
    // sorted top-N pool per KPI, this renders an independent top-N ranking
    // PER partner so a small partner leading on their own churn volatility
    // ranks #1 on their own book even if their MRR magnitude wouldn't crack
    // the flat matrix leaderboard (P11.68) or the per-metric strip (P11.72).
    // Delegates to computeDigestSnapshotPerResellerPctChangeStreaks through
    // the pure lib so leaderboard entries cannot diverge from the P11.52
    // spotlight rows they summarise — an entry ranked #1 in a partner group
    // here appears in the P11.52 table below with matching length /
    // max_abs_pct / min_abs_pct / cumulative_abs_pct. Consumes the SAME
    // snapshotPerResellerRollingTrend the P11.51 detector and the P11.68 /
    // P11.72 leaderboards already consume (no extra fold, no divergence risk
    // vs. the spotlight rows this per-partner leaderboard tops). Lands
    // directly BETWEEN the P11.72 per-metric |pct|-material leaderboard
    // (perMetricPctChangeStreakLeaderboardSection) and the
    // perResellerPctChangeStreaksSection (P11.52) so ops reads matrix top-N
    // → per-KPI top-N → per-partner top-N (equal footing across partners) →
    // full per-(metric × partner) drill-down. Closes the leaderboard
    // family's per-partner axis on the |pct|-magnitude axis symmetric with
    // the P11.74 per-partner direction leaderboard and mirrors the coverage
    // family's per-reseller split at P11.55. Per-group total_qualified is
    // carried on the envelope so a "Top 3 of 8 KPIs for ACME" caption tells
    // ops how much detail lives in the P11.52 spotlight below for that
    // partner specifically.
    snapshotPerResellerPctChangeStreakLeaderboard =
      computeDigestSnapshotPerResellerPctChangeStreakLeaderboard(
        snapshotPerResellerRollingTrend,
      );
    perResellerPctChangeStreakLeaderboardSection =
      formatDigestSnapshotPerResellerPctChangeStreakLeaderboardSection(
        snapshotPerResellerPctChangeStreakLeaderboard,
      );
    // P11.78 — portfolio direction-streak length-frequency histogram (module
    // P11.77). Consumes snapshotDirectionStreaks (P11.30) directly rather
    // than re-folding snapshotRollingTrend so this histogram cannot diverge
    // from the P11.30 rows the P11.31 table renders above it. Complements
    // the P11.57 coverage topline (share of possible cells qualifying) and
    // the P11.67 leaderboard (top-N deepest runs) by exposing the SHAPE of
    // persistence between them — two portfolios with the same coverage% and
    // the same leaderboard #1 can differ sharply in tail, and neither
    // coverage nor leaderboard exposes that. Section splices directly BELOW
    // directionStreaksSection (P11.31 spotlight table) so ops reads the
    // per-metric spotlight and then the shape-of-persistence tail
    // underneath.
    snapshotDirectionStreakLengthHistogram =
      computeDigestSnapshotDirectionStreakLengthHistogram(
        snapshotDirectionStreaks,
      );
    directionStreakLengthHistogramSection =
      formatDigestSnapshotDirectionStreakLengthHistogramSection(
        snapshotDirectionStreakLengthHistogram,
      );
    // P11.90 — portfolio sustained-direction streak length percentile summary
    // (module P11.89). Scalar p50 / p90 / mean / max reduction of the SAME
    // snapshotDirectionStreaks input the P11.78 histogram consumes directly
    // above, so the summary cannot diverge from the distribution it
    // summarises for a given window. Complements the P11.78 shape-of-
    // persistence tail by exposing the two numbers ops most often cites when
    // scanning a length distribution in a hurry — the median (typical run)
    // and the p90 (long tail) — as scalar fields greppable out of the
    // cron-health JSONL envelope week over week without re-folding the
    // histogram OR the P11.30 detector. Section splices directly BELOW
    // directionStreakLengthHistogramSection (P11.78) per the P11.89
    // formatter docblock's explicit placement rule so ops reads the full
    // length distribution and then the scalar summary underneath.
    snapshotDirectionStreakLengthPercentiles =
      computeDigestSnapshotDirectionStreakLengthPercentiles(
        snapshotDirectionStreaks,
      );
    directionStreakLengthPercentilesSection =
      formatDigestSnapshotDirectionStreakLengthPercentilesSection(
        snapshotDirectionStreakLengthPercentiles,
      );
    // P11.80 — portfolio |pct|-material-streak length-frequency histogram
    // (module P11.79). Magnitude-axis analogue of the P11.78 direction
    // histogram wired directly above. Consumes snapshotPctChangeStreaks
    // (P11.49) directly rather than re-folding snapshotRollingTrend so this
    // histogram cannot diverge from the P11.49 rows the P11.50 table renders
    // above it. Complements the P11.53 coverage topline (share of possible
    // cells qualifying at |Δ%| ≥ threshold) and the P11.67 leaderboard (top-N
    // deepest volatile runs) by exposing the SHAPE of magnitude persistence
    // between them — two portfolios with the same coverage% and the same
    // leaderboard #1 can differ sharply in tail, and neither coverage nor
    // leaderboard exposes that. Section splices directly BELOW
    // pctChangeStreaksSection (P11.50 spotlight table) per the P11.79
    // formatter docblock's explicit placement rule so ops reads the
    // count-per-metric list and then the shape-of-persistence tail
    // underneath, mirroring the P11.78 direction placement rule on the
    // magnitude axis.
    snapshotPctChangeStreakLengthHistogram =
      computeDigestSnapshotPctChangeStreakLengthHistogram(
        snapshotPctChangeStreaks,
      );
    pctChangeStreakLengthHistogramSection =
      formatDigestSnapshotPctChangeStreakLengthHistogramSection(
        snapshotPctChangeStreakLengthHistogram,
      );
    // P11.92 — portfolio sustained-|pct|-material streak length percentile
    // summary (module P11.91). Scalar p50 / p90 / mean / max reduction of the
    // SAME snapshotPctChangeStreaks input the P11.80 histogram consumes
    // directly above, so the summary cannot diverge from the distribution it
    // summarises for a given window + threshold. Magnitude-axis analogue of the
    // P11.90 direction-streak percentile summary. Complements the P11.80
    // shape-of-persistence tail by exposing the two numbers ops most often
    // cites when scanning a length distribution in a hurry — the median
    // (typical run) and the p90 (long tail) — as scalar fields greppable out
    // of the cron-health JSONL envelope week over week without re-folding the
    // histogram OR the P11.49 detector, AND carrying the source threshold so a
    // shift from p50=2 to p50=3 at the SAME 25% band reads differently from an
    // apparent shift caused by widening the threshold to 40%. Section splices
    // directly BELOW pctChangeStreakLengthHistogramSection (P11.80) per the
    // P11.91 formatter docblock's explicit placement rule so ops reads the
    // full length distribution and then the scalar summary underneath,
    // mirroring the P11.90 direction-axis placement rule.
    snapshotPctChangeStreakLengthPercentiles =
      computeDigestSnapshotPctChangeStreakLengthPercentiles(
        snapshotPctChangeStreaks,
      );
    pctChangeStreakLengthPercentilesSection =
      formatDigestSnapshotPctChangeStreakLengthPercentilesSection(
        snapshotPctChangeStreakLengthPercentiles,
      );
    // P11.106 — portfolio direction+magnitude persistence scorecard (module
    // P11.105). Capstone portfolio-grain row that side-by-sides the P11.89
    // direction-axis and P11.91 magnitude-axis scalar reductions into ONE
    // table with ONE row so ops can answer "is the PORTFOLIO persistent on
    // direction AND magnitude, or only one, or neither?" without cross-
    // referencing the two upstream portfolio sections above it. Delegates
    // through the pure lib to BOTH
    // computeDigestSnapshotDirectionStreakLengthPercentiles (P11.89) AND
    // computeDigestSnapshotPctChangeStreakLengthPercentiles (P11.91) so the
    // scorecard fields CANNOT diverge from the two upstream summaries they
    // consolidate (they ARE those same folds joined into a single row).
    // Consumes the SAME snapshotDirectionStreaks input the P11.78 histogram
    // + P11.89/P11.90 direction percentile already consume AND the SAME
    // snapshotPctChangeStreaks input the P11.80 histogram + P11.91/P11.92
    // magnitude percentile already consume (no extra fold, no divergence risk
    // vs. the two summaries this scorecard joins). Threshold passthrough on
    // the magnitude side matches P11.79/P11.83/P11.87/P11.91/P11.95/P11.99/
    // P11.101/P11.103 posture so JSONL consumers can distinguish real
    // portfolio cross-axis shape shifts from apparent shifts caused by
    // widening the amber band. Section splices IMMEDIATELY BELOW
    // pctChangeStreakLengthPercentilesSection (P11.91/P11.92 portfolio
    // magnitude scalar) and ABOVE the per-partner + per-metric coverage/
    // leaderboard/histogram/percentile ladders per the P11.105 formatter
    // docblock explicit placement rule — capstone position at the bottom of
    // the portfolio-grain ladder so a reader who already saw direction and
    // magnitude summaries above can immediately reconcile them into a single
    // portfolio verdict without scrolling back up. Walk: portfolio direction
    // shape (P11.77) → portfolio direction scalar (P11.89) → portfolio
    // magnitude shape (P11.79) → portfolio magnitude scalar (P11.91) →
    // portfolio BOTH-AXES scorecard (this section, new) → per-metric ladder
    // → per-partner ladder. Mirrors the P11.101/P11.102 per-metric and
    // P11.103/P11.104 per-partner capstones one grain up so all three
    // capstone scorecards land at the bottom of their respective grain's
    // ladder.
    snapshotPersistenceScorecard = computeDigestSnapshotPersistenceScorecard(
      snapshotDirectionStreaks,
      snapshotPctChangeStreaks,
    );
    persistenceScorecardSection = formatDigestSnapshotPersistenceScorecardSection(
      snapshotPersistenceScorecard,
    );
    // P11.108 — portfolio persistence scorecard VERDICT caption (module
    // P11.107). Pure derivation of the P11.105 scorecard scalars into ONE
    // discrete verdict token (insufficient_window | flat | sustained_both_axes
    // | sustained_direction_only | sustained_magnitude_only | volatile) plus a
    // short human-readable summary. Splices directly BELOW the P11.106
    // persistenceScorecardSection so ops reads the twin-block numeric row
    // above and the collapsed verdict caption inline below without redoing
    // the mental classification ladder in their head each Monday. Formatter
    // returns "" for insufficient_window + flat (mirrors the P11.106 scorecard
    // formatter's own suppression on those cases) so the digest stays quiet
    // when the scorecard itself is quiet — no orphan caption below an empty
    // scorecard block. Envelope entry lands beside the P11.106 scorecard
    // envelope entry so JSONL consumers can grep 'verdict=sustained_both_axes'
    // week over week without side-loading the P11.106 scorecard scalars.
    snapshotPersistenceScorecardVerdict =
      computeDigestSnapshotPersistenceScorecardVerdict(
        snapshotPersistenceScorecard,
      );
    persistenceScorecardVerdictSection =
      formatDigestSnapshotPersistenceScorecardVerdictSection(
        snapshotPersistenceScorecardVerdict,
      );
    // P11.114 — portfolio persistence scorecard verdict TRANSITION caption
    // (module P11.113). Pure derivation of two P11.107 verdicts (previous,
    // current) into ONE discrete transition token — first_classification /
    // undecidable / stable / improved / degraded / rotated — so ops can spot
    // a week-over-week flip like sustained_both_axes → volatile without
    // keeping last week's verdict in their head. Splices directly BELOW the
    // P11.108 persistenceScorecardVerdictSection so the reader sees the
    // current-week verdict badge above and the transition badge inline below
    // without diffing two verdict rows in their head each Monday. Formatter
    // returns "" for first_classification (no baseline to diff — fresh
    // install week) and stable (verdict caption above already fully describes
    // the state) so the digest stays quiet when the transition itself carries
    // no new information. Previous verdict token is decoded defensively from
    // previousSnapshot.envelope.snapshot_persistence_scorecard_verdict.verdict
    // — older snapshots (pre-P11.108 tick 505) store {skipped_reason} instead
    // of a verdict object and fall through to `null`, which the module treats
    // as first_classification (baseline-establishment week). Envelope entry
    // lands beside snapshot_persistence_scorecard_verdict so JSONL consumers
    // can grep 'transition=degraded' week over week without side-loading the
    // P11.107 verdict scalars.
    const previousPortfolioVerdictRaw =
      previousSnapshot.envelope.snapshot_persistence_scorecard_verdict;
    let previousPortfolioVerdict: DigestSnapshotPersistenceScorecardVerdict | null =
      null;
    if (
      previousPortfolioVerdictRaw &&
      typeof previousPortfolioVerdictRaw === "object"
    ) {
      const record = previousPortfolioVerdictRaw as Record<string, unknown>;
      const token = record.verdict;
      const KNOWN_VERDICT_TOKENS: readonly PersistenceScorecardVerdictToken[] = [
        "insufficient_window",
        "flat",
        "sustained_both_axes",
        "sustained_direction_only",
        "sustained_magnitude_only",
        "volatile",
      ];
      if (
        typeof token === "string" &&
        (KNOWN_VERDICT_TOKENS as readonly string[]).includes(token)
      ) {
        previousPortfolioVerdict = {
          verdict: token as PersistenceScorecardVerdictToken,
          sustained_p90_threshold:
            typeof record.sustained_p90_threshold === "number"
              ? record.sustained_p90_threshold
              : 3,
          direction_sustained: record.direction_sustained === true,
          magnitude_sustained: record.magnitude_sustained === true,
          summary:
            typeof record.summary === "string" ? record.summary : "",
        };
      }
    }
    snapshotPersistenceScorecardVerdictTransition =
      computeDigestSnapshotPersistenceScorecardVerdictTransition(
        snapshotPersistenceScorecardVerdict,
        previousPortfolioVerdict,
      );
    persistenceScorecardVerdictTransitionSection =
      formatDigestSnapshotPersistenceScorecardVerdictTransitionSection(
        snapshotPersistenceScorecardVerdictTransition,
      );
    // P11.132 — portfolio verdict-transition DELTA-RANK DISTRIBUTION scalar
    // summary (module P11.131). Pure derivation of the P11.113 portfolio
    // transition into the SAME distribution shape the sibling per-metric
    // (P11.125/P11.126), per-partner (P11.127/P11.128), and per-(partner ×
    // metric) (P11.129/P11.130) grains emit — same ten transition buckets,
    // same alert_worthy scalar, same net_delta_rank barometer, same
    // suppression trio (window_size < 3, total == 0, alert_worthy == 0) and
    // same fixed bullet order (improved_by_2 → improved_by_1 → degraded_by_1
    // → degraded_by_2 → rotated → undecidable → *_by_other tail). At the
    // portfolio grain n === 1 so the distribution is degenerate: every
    // emitted total === 1 and each bucket lives in {0, 1}. The value is NOT
    // aggregation reduction (nothing to reduce at n=1) but vocabulary
    // consistency — a JSONL consumer iterating the four
    // snapshot_*_persistence_scorecard_verdict_transition_distribution
    // envelopes finds the SAME bucket set and the SAME alert_worthy /
    // net_delta_rank scalars at every grain, so a cross-grain regression
    // alert can read ONE vocabulary rather than four. CAPSTONES the
    // DISTRIBUTION family at ALL FOUR scorecard grains. Envelope-field
    // sourcing difference vs. the three finer grains: this module consumes
    // TWO inputs (the P11.113 transition + the P11.105 scorecard) since
    // P11.113 alone carries just the transition + delta_rank and does not
    // itself carry a window envelope; the scorecard is the natural anchor
    // since it is the P11.113 input's grandparent. sustained_p90_threshold
    // defaults to DEFAULT_SUSTAINED_P90_THRESHOLD (=3) matching the P11.107
    // verdict argument convention. Section splices directly BELOW
    // persistenceScorecardVerdictTransitionSection so ops reads the
    // current-week portfolio transition badge above and the SAME vocabulary
    // the three finer grains emit below without switching mental models
    // across grains. Guarded on snapshotPersistenceScorecard truthiness so
    // the pathological previousSnapshot-missing / no-scorecard path leaves
    // the distribution unset with no envelope entry emitted downstream.
    if (snapshotPersistenceScorecard) {
      snapshotPersistenceScorecardVerdictTransitionDistribution =
        computeDigestSnapshotPersistenceScorecardVerdictTransitionDistribution(
          snapshotPersistenceScorecardVerdictTransition,
          snapshotPersistenceScorecard,
        );
      persistenceScorecardVerdictTransitionDistributionSection =
        formatDigestSnapshotPersistenceScorecardVerdictTransitionDistributionSection(
          snapshotPersistenceScorecardVerdictTransitionDistribution,
        );
    }
    // P11.82 — per-partner sustained-direction streak length-frequency
    // histogram (module P11.81). Per-partner analogue of the P11.78 portfolio
    // histogram, closing the histogram family's per-partner axis symmetric
    // with the P11.59 (coverage) / P11.73 (leaderboard) per-partner splits.
    // Delegates to computeDigestSnapshotPerResellerDirectionStreaks through
    // the pure lib so per-partner histogram groups cannot diverge from the
    // P11.32 spotlight rows they summarise. Consumes the SAME
    // snapshotPerResellerRollingTrend the P11.32 detector and the P11.73
    // per-partner leaderboard already consume (no extra fold, no divergence
    // risk vs. the spotlight rows below). Per-partner bucket set is DENSE
    // from min_streak_length to that partner's own max_length so a partner
    // whose deepest run is length-4 does not carry a phantom length-5 bucket
    // sourced from a sibling partner's tail. Section splices directly BETWEEN
    // perResellerDirectionStreakLeaderboardSection (P11.74 per-partner top-N)
    // and perResellerDirectionStreaksSection (P11.32/P11.33 per-partner
    // spotlight) so ops reads per-partner coverage (P11.60) → per-partner
    // top-N (P11.74) → per-partner shape-of-persistence tail (this section)
    // → per-partner spotlight detail (P11.32).
    snapshotPerResellerDirectionStreakLengthHistogram =
      computeDigestSnapshotPerResellerDirectionStreakLengthHistogram(
        snapshotPerResellerRollingTrend,
      );
    perResellerDirectionStreakLengthHistogramSection =
      formatDigestSnapshotPerResellerDirectionStreakLengthHistogramSection(
        snapshotPerResellerDirectionStreakLengthHistogram,
      );
    // P11.94 — per-partner sustained-direction streak length percentile
    // summary (module P11.93). Per-partner analogue of the P11.90 portfolio
    // direction-streak percentile summary — one row per partner with a scalar
    // p50 / p90 / mean / max reduction of THAT partner's own streak lengths,
    // extending the P11.89/P11.90 portfolio reduction one grain down so ops
    // can grep partner-scoped shape scalars out of the cron-health JSONL
    // envelope without re-folding the P11.81 per-partner histogram OR the
    // P11.32 detector. Consumes the SAME snapshotPerResellerRollingTrend the
    // P11.32 detector, the P11.74 per-partner leaderboard, and the P11.82
    // per-partner histogram directly above already consume (no extra fold, no
    // divergence risk vs. the per-partner distribution it summarises for a
    // given window). Two partners with identical P11.60 coverage% and
    // identical P11.74 #1 leaderboard entries can still differ sharply in
    // p50/p90 — one carrying a fat tail (high p90 relative to its p50) while
    // the other clusters tightly at min_streak_length — and neither of those
    // surfaces exposes that as a scalar the way this summary does. Section
    // splices directly BELOW perResellerDirectionStreakLengthHistogramSection
    // (P11.82) per the P11.93 formatter docblock's explicit placement rule
    // and ABOVE perResellerDirectionStreaksSection (P11.32/P11.33 per-partner
    // spotlight) so ops reads per-partner coverage (P11.60) → per-partner
    // top-N (P11.74) → per-partner shape-of-persistence tail (P11.82) →
    // per-partner scalar p50/p90 summary (this section) → per-partner
    // spotlight detail (P11.32), mirroring the P11.89/P11.90 portfolio-grain
    // placement rule one grain down.
    snapshotPerResellerDirectionStreakLengthPercentiles =
      computeDigestSnapshotPerResellerDirectionStreakLengthPercentiles(
        snapshotPerResellerRollingTrend,
      );
    perResellerDirectionStreakLengthPercentilesSection =
      formatDigestSnapshotPerResellerDirectionStreakLengthPercentilesSection(
        snapshotPerResellerDirectionStreakLengthPercentiles,
      );
    // P11.84 — per-partner sustained-|pct|-material streak length-frequency
    // histogram (module P11.83). Magnitude-axis analogue of the P11.82
    // per-partner direction-streak histogram wired above and per-partner
    // analogue of the P11.80 portfolio |pct|-material histogram, closing the
    // histogram family's per-partner axis on the magnitude side symmetric
    // with the P11.55 (coverage) / P11.75 (leaderboard) per-partner splits.
    // Delegates to computeDigestSnapshotPerResellerPctChangeStreaks through
    // the pure lib so per-partner histogram groups cannot diverge from the
    // P11.51 spotlight rows they summarise. Consumes the SAME
    // snapshotPerResellerRollingTrend the P11.51 detector and P11.75
    // per-partner leaderboard already consume (no extra fold, no divergence
    // risk vs. the per-partner spotlight rows below). Per-partner bucket set
    // is DENSE from min_streak_length to that partner's own max_length so a
    // partner whose deepest |pct|-material run is length-4 does not carry a
    // phantom length-5 bucket sourced from a sibling partner's tail. Section
    // splices directly BETWEEN perResellerPctChangeStreakLeaderboardSection
    // (P11.76 per-partner top-N pct-change leaderboard) and
    // perResellerPctChangeStreaksSection (P11.51/P11.52 per-partner
    // spotlight) so ops reads per-partner coverage (P11.55) → per-partner
    // top-N (P11.75) → per-partner shape-of-persistence tail (this section)
    // → per-partner spotlight detail (P11.51), mirroring the P11.82
    // placement on the direction axis.
    snapshotPerResellerPctChangeStreakLengthHistogram =
      computeDigestSnapshotPerResellerPctChangeStreakLengthHistogram(
        snapshotPerResellerRollingTrend,
      );
    perResellerPctChangeStreakLengthHistogramSection =
      formatDigestSnapshotPerResellerPctChangeStreakLengthHistogramSection(
        snapshotPerResellerPctChangeStreakLengthHistogram,
      );
    // P11.96 — per-partner sustained-|pct|-material streak length percentile
    // summary (module P11.95). Magnitude-axis analogue of the P11.94
    // per-partner direction percentile summary wired above and per-partner
    // analogue of the P11.92 portfolio |pct|-material percentile summary,
    // closing the percentile-summary family's last empty leaf — the
    // per-partner axis on the magnitude side — symmetric with the P11.55
    // (coverage) / P11.75 (leaderboard) / P11.83 (histogram) per-partner
    // splits on the same |pct|-material axis. Delegates to
    // computeDigestSnapshotPerResellerPctChangeStreaks through the pure lib
    // so per-partner percentile groups cannot diverge from the P11.51
    // spotlight rows they summarise. Consumes the SAME
    // snapshotPerResellerRollingTrend the P11.51 detector, the P11.75
    // per-partner leaderboard, and the P11.83 per-partner histogram already
    // consume (no extra fold, no divergence risk vs. the spotlight rows
    // below). Threshold passthrough matches P11.79/P11.83/P11.87/P11.91 on
    // other grains of the magnitude axis so JSONL consumers can distinguish
    // "ACME p50 shifted from 2 to 3 at the SAME 25% band" from "ACME p50
    // shifted from 2 to 3 because the threshold was widened to 40%".
    // Section splices directly BETWEEN
    // perResellerPctChangeStreakLengthHistogramSection (P11.84 per-partner
    // |pct|-material histogram) and perResellerPctChangeStreaksSection
    // (P11.51/P11.52 per-(metric × partner) spotlight) per the P11.95
    // formatter docblock's explicit placement rule so ops walks per-partner
    // coverage (P11.55) → per-partner top-N leaderboard (P11.75) →
    // per-partner shape-of-persistence tail (P11.83) → per-partner scalar
    // p50/p90 summary (this section) → per-partner spotlight detail (P11.51),
    // mirroring the P11.93/P11.94 direction-side placement one axis over and
    // extending the P11.91/P11.92 portfolio-grain magnitude placement one
    // grain down.
    snapshotPerResellerPctChangeStreakLengthPercentiles =
      computeDigestSnapshotPerResellerPctChangeStreakLengthPercentiles(
        snapshotPerResellerRollingTrend,
      );
    perResellerPctChangeStreakLengthPercentilesSection =
      formatDigestSnapshotPerResellerPctChangeStreakLengthPercentilesSection(
        snapshotPerResellerPctChangeStreakLengthPercentiles,
      );
    // P11.104 — per-partner direction+magnitude persistence scorecard cron
    // wiring (module P11.103). Capstone per-partner row that side-by-sides
    // the P11.93 direction-axis and P11.95 magnitude-axis per-partner
    // percentile scalars into ONE row per partner so ops can answer "does
    // THIS PARTNER churn direction-persistently AND magnitude-persistently,
    // or only one, or neither?" without scrolling between the two upstream
    // per-partner sections. Delegates through the pure lib to BOTH
    // computeDigestSnapshotPerResellerDirectionStreakLengthPercentiles
    // (P11.93) AND computeDigestSnapshotPerResellerPctChangeStreakLengthPercentiles
    // (P11.95) so scorecard rows cannot diverge from the two per-partner
    // summaries they join. Consumes the SAME snapshotPerResellerRollingTrend
    // the P11.51 detector + P11.75 per-partner leaderboard + P11.83
    // per-partner magnitude histogram + P11.93/P11.94 per-partner direction
    // percentile + P11.95/P11.96 per-partner magnitude percentile siblings
    // already consume — no extra fold, no divergence risk. Section splices
    // IMMEDIATELY BELOW perResellerPctChangeStreakLengthPercentilesSection
    // (P11.95/P11.96 per-partner magnitude scalar) and ABOVE
    // perResellerPctChangeStreaksSection (P11.51/P11.52 per-(metric ×
    // partner) spotlight) per the P11.103 formatter docblock explicit
    // placement rule — capstone position at the bottom of the per-partner
    // ladder so a reader who already saw direction and magnitude summaries
    // above can immediately reconcile them into a single per-partner
    // verdict without scrolling back up. Mirrors the P11.101/P11.102
    // per-metric capstone placement one grain up (both capstone scorecards
    // land at the bottom of their respective grain's ladder). Walk:
    // per-partner coverage (P11.55) → per-partner top-N (P11.75) →
    // per-partner direction shape (P11.81) → per-partner direction scalar
    // (P11.93) → per-partner magnitude shape (P11.83) → per-partner
    // magnitude scalar (P11.95) → per-partner BOTH-AXES scorecard (this
    // section, new) → per-(metric × partner) spotlight.
    snapshotPerResellerPersistenceScorecard =
      computeDigestSnapshotPerResellerPersistenceScorecard(
        snapshotPerResellerRollingTrend,
      );
    perResellerPersistenceScorecardSection =
      formatDigestSnapshotPerResellerPersistenceScorecardSection(
        snapshotPerResellerPersistenceScorecard,
      );
    // P11.120 — per-(partner × metric) direction+magnitude persistence
    // scorecard cron wiring (module P11.119). Capstones the persistence-
    // scorecard family at the FINEST grain after P11.105/P11.106 (portfolio),
    // P11.101/P11.102 (per-metric), and P11.103/P11.104 (per-partner) closed
    // the three coarser grains. Joins the P11.32 direction spotlight rows
    // with the P11.51 |pct|-material spotlight rows on (key, reseller_code)
    // so ops can answer "for THIS partner-metric pair, does it churn
    // direction-persistently AND magnitude-persistently, or one axis only,
    // or neither?" without cross-referencing the two upstream spotlight
    // tables further down the digest. Delegates through the pure lib to BOTH
    // computeDigestSnapshotPerResellerDirectionStreaks (P11.32) and
    // computeDigestSnapshotPerResellerPctChangeStreaks (P11.51) so scorecard
    // rows cannot diverge from the two spotlight rows they side-by-side.
    // Consumes the SAME snapshotPerResellerRollingTrend the P11.32 detector,
    // P11.51 detector, and the P11.103 per-partner scorecard already consume
    // (no extra fold, no divergence risk). Section splices IMMEDIATELY
    // BELOW perResellerPersistenceScorecardSection (P11.103/P11.104 per-
    // partner capstone) per the P11.119 formatter docblock explicit
    // placement rule — the finest-grain scorecard lands at the bottom of
    // the scorecard ladder before the P11.32 per-(metric × partner)
    // spotlight detail. Envelope entry lands beside the P11.104
    // snapshot_per_reseller_persistence_scorecard entry so JSONL consumers
    // grouping per-partner persistence reads together find the per-partner
    // scorecard AND the per-(partner × metric) scorecard on the same line.
    // Formatter returns "" on window_size < 3 (a 2-week window cannot host
    // a length-2 streak) OR when zero rows qualify — mirrors the P11.101/
    // P11.103 scorecard formatter's own short-window suppression posture.
    snapshotPerResellerMetricPersistenceScorecard =
      computeDigestSnapshotPerResellerMetricPersistenceScorecard(
        snapshotPerResellerRollingTrend,
      );
    perResellerMetricPersistenceScorecardSection =
      formatDigestSnapshotPerResellerMetricPersistenceScorecardSection(
        snapshotPerResellerMetricPersistenceScorecard,
      );
    // P11.122 — per-(partner × metric) persistence scorecard VERDICT table
    // (module P11.121). Finest-grain analogue of the portfolio P11.107/P11.108,
    // per-metric P11.109/P11.110, and per-partner P11.111/P11.112 verdict
    // pairs — collapses each row of the P11.119/P11.120 per-pair twin-block
    // scalar table above into ONE discrete verdict token per (reseller_code ×
    // metric) pair so ops stops running the "is direction length=3 sustained?"
    // ladder mentally per row (INFOVISION × attributed_mrr, ACME ×
    // clawback_exposure, ZEBRA × attributed_churn_30d, …). Splices directly
    // BELOW the P11.120 perResellerMetricPersistenceScorecardSection per the
    // P11.121 formatter docblock so a reader who already saw the finest-grain
    // twin-block scalar row can immediately read the collapsed per-pair
    // verdicts without reconciling every row in their head. Formatter returns
    // "" on window_size < 3 OR when every row resolves to `flat` /
    // `insufficient_window` (mirrors the P11.119 scorecard formatter's own
    // short-window suppression posture) so the digest stays quiet on quiet
    // pairs — no orphan verdict table below an empty scorecard block. Envelope
    // entry lands beside the P11.120 snapshot_per_reseller_metric_persistence_
    // scorecard entry so JSONL consumers grep 'ACME × attributed_mrr=
    // sustained_both_axes' per pair without side-loading the P11.120 scorecard
    // rows. Capstones the verdict-classification quartet across ALL FOUR
    // scorecard grains (portfolio P11.108 → per-metric P11.110 → per-partner
    // P11.112 → per-(partner × metric) this tick).
    snapshotPerResellerMetricPersistenceScorecardVerdict =
      computeDigestSnapshotPerResellerMetricPersistenceScorecardVerdict(
        snapshotPerResellerMetricPersistenceScorecard,
      );
    perResellerMetricPersistenceScorecardVerdictSection =
      formatDigestSnapshotPerResellerMetricPersistenceScorecardVerdictSection(
        snapshotPerResellerMetricPersistenceScorecardVerdict,
      );
    // P11.112 — per-partner persistence scorecard VERDICT table (module
    // P11.111). Per-partner analogue of the portfolio P11.107/P11.108 and
    // per-metric P11.109/P11.110 verdict captions — collapses each row of the
    // P11.103 per-partner twin-block scalar table above into ONE discrete
    // verdict token per partner so ops stops running the "is direction p90=3
    // sustained?" ladder mentally per reseller_code (ACME, ZEBRA,
    // INFOVISION, …). Splices directly BELOW the P11.104
    // perResellerPersistenceScorecardSection so a reader who already saw the
    // per-partner direction and magnitude scalar rows can immediately read the
    // collapsed per-partner verdicts without reconciling every twin-block row
    // in their head. Formatter returns "" on window_size < 3 OR when every row
    // resolves to `flat` / `insufficient_window` (mirrors the P11.103
    // scorecard formatter's own short-window suppression posture) so the
    // digest stays quiet on quiet partners — no orphan verdict table below an
    // empty scorecard block. Envelope entry lands beside the P11.104
    // snapshot_per_reseller_persistence_scorecard entry so JSONL consumers
    // grep 'ACME=sustained_both_axes' per partner without side-loading the
    // P11.104 scorecard rows. Completes the verdict-caption trio at all three
    // scorecard grains (portfolio P11.108 → per-metric P11.110 → per-partner
    // this tick).
    snapshotPerResellerPersistenceScorecardVerdict =
      computeDigestSnapshotPerResellerPersistenceScorecardVerdict(
        snapshotPerResellerPersistenceScorecard,
      );
    perResellerPersistenceScorecardVerdictSection =
      formatDigestSnapshotPerResellerPersistenceScorecardVerdictSection(
        snapshotPerResellerPersistenceScorecardVerdict,
      );
    // P11.86 — per-metric sustained-direction streak length-frequency
    // histogram (module P11.85). Per-metric analogue of the P11.78 portfolio
    // and P11.82 per-partner direction-streak histograms, closing the
    // histogram family's per-metric axis symmetric with the P11.61 (coverage)
    // / P11.69 (leaderboard) per-metric splits on the same direction axis.
    // Delegates to computeDigestSnapshotPerResellerDirectionStreaks through
    // the pure lib so per-metric histogram groups cannot diverge from the
    // P11.32 spotlight rows they summarise. Consumes the SAME
    // snapshotPerResellerRollingTrend the P11.32 detector, the P11.70
    // per-metric leaderboard, and the P11.82 per-partner histogram already
    // consume (no extra fold, no divergence risk vs. the spotlight rows
    // below). Per-KPI bucket set is DENSE from min_streak_length to that
    // KPI's own max_length so a KPI whose deepest partner run is length-4
    // does not carry a phantom length-5 bucket sourced from a sibling KPI's
    // tail. Section splices directly BETWEEN
    // perMetricDirectionStreakLeaderboardSection (P11.70 per-metric top-N)
    // and perResellerDirectionStreakLeaderboardSection (P11.74 per-partner
    // top-N) so ops reads per-metric coverage (P11.62) → per-metric spotlight
    // (P11.31) → per-metric top-N leaderboard (P11.70) → per-metric shape-
    // of-persistence tail (this section) → per-partner top-N leaderboard
    // (P11.74) → per-partner shape-of-persistence tail (P11.82) →
    // per-(metric × partner) spotlight detail (P11.32), grouping every
    // per-metric surface together before jumping to per-partner surfaces.
    snapshotPerMetricDirectionStreakLengthHistogram =
      computeDigestSnapshotPerMetricDirectionStreakLengthHistogram(
        snapshotPerResellerRollingTrend,
      );
    perMetricDirectionStreakLengthHistogramSection =
      formatDigestSnapshotPerMetricDirectionStreakLengthHistogramSection(
        snapshotPerMetricDirectionStreakLengthHistogram,
      );
    // P11.98 — per-metric sustained-direction streak length percentile summary
    // (module P11.97). Per-metric analogue of the P11.89/P11.90 portfolio-grain
    // and P11.93/P11.94 per-partner-grain scalar p50/p90/mean/max reductions;
    // closes the direction-streak percentile family's per-metric axis
    // symmetric with P11.61 (coverage) / P11.69 (leaderboard) / P11.85
    // (histogram) on the same direction axis. Delegates to
    // computeDigestSnapshotPerResellerDirectionStreaks through the pure lib so
    // per-KPI percentile groups cannot diverge from the P11.32 spotlight rows
    // they summarise — matches the P11.85 histogram + P11.93 per-partner
    // percentile delegation posture on the adjacent axes. Consumes the SAME
    // snapshotPerResellerRollingTrend the P11.32 detector, the P11.70 per-
    // metric leaderboard, the P11.86 per-metric histogram, and the
    // P11.90/P11.94 direction percentile siblings already consume (no extra
    // fold, no divergence risk vs. the P11.85 per-metric histogram it
    // summarises for the same window + min_streak_length). Section splices
    // directly BETWEEN perMetricDirectionStreakLengthHistogramSection
    // (P11.85/P11.86 per-metric shape-of-persistence tail) and
    // perResellerDirectionStreakLeaderboardSection (P11.73/P11.74 per-partner
    // top-N) per the P11.97 formatter docblock's explicit placement rule so
    // ops walks per-metric coverage (P11.61) → per-metric top-N (P11.69) →
    // per-metric shape-of-persistence tail (P11.85) → per-metric scalar
    // p50/p90 summary (this section) → per-partner coverage (P11.59) →
    // per-partner top-N (P11.73) → per-partner shape-of-persistence tail
    // (P11.81) → per-partner scalar p50/p90 summary (P11.93) → per-(metric ×
    // partner) spotlight detail (P11.32), grouping every per-metric surface
    // together before jumping to per-partner surfaces. Extends the P11.89/
    // P11.90 portfolio-grain and P11.93/P11.94 per-partner-grain placement
    // rules one axis over.
    snapshotPerMetricDirectionStreakLengthPercentiles =
      computeDigestSnapshotPerMetricDirectionStreakLengthPercentiles(
        snapshotPerResellerRollingTrend,
      );
    perMetricDirectionStreakLengthPercentilesSection =
      formatDigestSnapshotPerMetricDirectionStreakLengthPercentilesSection(
        snapshotPerMetricDirectionStreakLengthPercentiles,
      );
    // P11.88 — per-metric sustained-|pct|-material streak length-frequency
    // histogram (module P11.87). Per-metric analogue of the P11.79 portfolio
    // and P11.83 per-partner |pct|-material histograms and magnitude-axis
    // analogue of the P11.86 per-metric direction histogram wired above,
    // closing the histogram family's last empty leaf — the per-metric axis
    // on the magnitude side — symmetric with the P11.63 (coverage) / P11.71
    // (leaderboard) per-metric splits on the same |pct|-material axis.
    // Delegates to computeDigestSnapshotPerResellerPctChangeStreaks through
    // the pure lib so per-metric histogram groups cannot diverge from the
    // P11.51 spotlight rows they summarise. Consumes the SAME
    // snapshotPerResellerRollingTrend the P11.51 detector, the P11.71
    // per-metric leaderboard, and the P11.83 per-partner histogram already
    // consume (no extra fold, no divergence risk vs. the P11.51 spotlight
    // rows below). Per-KPI bucket set is DENSE from min_streak_length to
    // that KPI's own max_length so a KPI whose deepest partner run is
    // length-4 does not carry a phantom length-5 bucket sourced from a
    // sibling KPI's tail. Threshold passthrough matches P11.79/P11.83 on
    // other grains of the magnitude axis so JSONL consumers can distinguish
    // 'length-2 shares at the 25% band' from 'length-2 shares at a widened
    // 40% band'. Section splices directly BETWEEN
    // perMetricPctChangeStreakLeaderboardSection (P11.71/P11.72 per-metric
    // top-N |pct|-material leaderboard) and
    // perResellerPctChangeStreakLeaderboardSection (P11.75/P11.76 per-
    // partner top-N |pct|-material leaderboard) per the P11.87 formatter
    // docblock's explicit placement rule so ops walks per-metric coverage
    // (P11.63) → per-metric top-N leaderboard (P11.71) → per-metric shape-
    // of-persistence tail (this section, new) → per-partner top-N
    // leaderboard (P11.75) → per-partner shape-of-persistence tail (P11.83)
    // → per-(metric × partner) spotlight detail (P11.51), grouping every
    // per-metric surface together before jumping to per-partner surfaces —
    // mirrors the P11.86 placement on the direction axis.
    snapshotPerMetricPctChangeStreakLengthHistogram =
      computeDigestSnapshotPerMetricPctChangeStreakLengthHistogram(
        snapshotPerResellerRollingTrend,
      );
    perMetricPctChangeStreakLengthHistogramSection =
      formatDigestSnapshotPerMetricPctChangeStreakLengthHistogramSection(
        snapshotPerMetricPctChangeStreakLengthHistogram,
      );
    // P11.100 — per-metric sustained-|pct|-material streak length percentile
    // summary (module P11.99). Per-metric analogue of the P11.91 portfolio and
    // P11.95 per-partner |pct|-material scalar reductions AND magnitude-axis
    // analogue of the P11.97/P11.98 per-metric direction percentile summary
    // wired above, closing the percentile-summary family's last empty leaf —
    // the per-metric axis on the magnitude side — so ops reading the P11.87/
    // P11.88 per-metric histogram section can immediately grep a scalar
    // p50/p90/mean/max reduction of that same distribution one row per KPI
    // rather than visually collapsing each histogram to answer the same
    // question. Consumes the SAME snapshotPerResellerRollingTrend the P11.51
    // detector, the P11.71 per-metric leaderboard, the P11.87 per-metric
    // histogram, and the P11.91/P11.95 portfolio + per-partner percentile
    // siblings already consume (no extra fold, no divergence risk vs. the
    // per-metric distribution it summarises for a given window). Threshold
    // passthrough matches P11.79/P11.83/P11.87/P11.91/P11.95 on the magnitude
    // axis so JSONL consumers can distinguish "churn p50 shifted from 2 to 3
    // at the SAME 25% threshold" (real per-KPI shape change) from "churn p50
    // shifted because the threshold widened to 40%" (apparent shift due to a
    // wider amber band). Section splices IMMEDIATELY BELOW
    // perMetricPctChangeStreakLengthHistogramSection (P11.87/P11.88 per-metric
    // magnitude histogram) and ABOVE perResellerPctChangeStreakLeaderboardSection
    // (P11.75/P11.76 per-partner leaderboard) per the P11.99 formatter docblock
    // placement rule so ops walks per-metric coverage (P11.63) → per-metric
    // top-N leaderboard (P11.71) → per-metric shape-of-persistence tail
    // (P11.87) → per-metric scalar p50/p90 summary (this section, new) →
    // per-partner coverage (P11.55) → per-partner top-N (P11.75) → per-partner
    // length histogram (P11.83) → per-partner scalar p50/p90 summary (P11.95)
    // → per-(metric × partner) spotlight (P11.51), grouping every per-metric
    // magnitude surface together before jumping to per-partner magnitude
    // surfaces. Extends the P11.91/P11.92 portfolio-grain magnitude placement
    // one grain down and mirrors the P11.97/P11.98 direction-side per-metric
    // placement one axis over.
    snapshotPerMetricPctChangeStreakLengthPercentiles =
      computeDigestSnapshotPerMetricPctChangeStreakLengthPercentiles(
        snapshotPerResellerRollingTrend,
      );
    perMetricPctChangeStreakLengthPercentilesSection =
      formatDigestSnapshotPerMetricPctChangeStreakLengthPercentilesSection(
        snapshotPerMetricPctChangeStreakLengthPercentiles,
      );
    // P11.102 — per-metric direction+magnitude persistence scorecard (module
    // P11.101). Capstone per-metric row that side-by-sides the P11.97 direction
    // and P11.99 magnitude per-metric percentile summaries into ONE table with
    // one row per HEADLINE_METRICS KPI so ops can answer "does THIS KPI churn
    // direction-persistently AND magnitude-persistently, or only one, or
    // neither?" without cross-referencing the two upstream per-metric sections
    // above it. Delegates to computeDigestSnapshotPerMetricDirectionStreakLengthPercentiles
    // (P11.97) + computeDigestSnapshotPerMetricPctChangeStreakLengthPercentiles
    // (P11.99) through the pure lib so scorecard rows CANNOT diverge from the
    // two upstream summaries they side-by-side (they ARE those same folds joined
    // by KPI key). Consumes the SAME snapshotPerResellerRollingTrend the P11.51
    // detector + P11.71 per-metric leaderboard + P11.85/P11.86 per-metric
    // direction histogram + P11.87/P11.88 per-metric magnitude histogram +
    // P11.97/P11.98 per-metric direction percentile + P11.99/P11.100 per-metric
    // magnitude percentile already consume (no extra fold, no divergence risk).
    // Threshold passthrough on the magnitude side matches P11.87/P11.91/P11.95/
    // P11.99 posture so JSONL consumers can distinguish real per-KPI cross-axis
    // shape shifts from apparent shifts caused by widening the amber band.
    // Section splices IMMEDIATELY BELOW
    // perMetricPctChangeStreakLengthPercentilesSection (P11.99/P11.100 per-metric
    // magnitude scalar) and ABOVE perResellerPctChangeStreakLeaderboardSection
    // (P11.75/P11.76 per-partner leaderboard) per the P11.101 formatter docblock
    // explicit placement rule — capstone position at the bottom of the per-metric
    // ladder so a reader who already saw direction and magnitude summaries above
    // can immediately reconcile them into a single per-KPI verdict without
    // scrolling back up. Walk: per-metric coverage (P11.63) → per-metric top-N
    // (P11.71) → per-metric direction shape (P11.85) → per-metric direction
    // scalar (P11.97) → per-metric magnitude shape (P11.87) → per-metric
    // magnitude scalar (P11.99) → per-metric BOTH-AXES scorecard (this section,
    // new) → per-partner ladder.
    snapshotPerMetricPersistenceScorecard =
      computeDigestSnapshotPerMetricPersistenceScorecard(
        snapshotPerResellerRollingTrend,
      );
    perMetricPersistenceScorecardSection =
      formatDigestSnapshotPerMetricPersistenceScorecardSection(
        snapshotPerMetricPersistenceScorecard,
      );
    // P11.110 — per-metric persistence scorecard VERDICT table (module
    // P11.109). Per-KPI analogue of the portfolio P11.107/P11.108 verdict
    // caption — collapses each row of the P11.101 per-metric twin-block
    // scalar table above into ONE discrete verdict token so ops stops running
    // the "is direction p90=3 sustained?" ladder mentally per HEADLINE_METRICS
    // row (attributed_mrr, attributed_churn_30d, clawback_exposure, etc.).
    // Splices directly BELOW the P11.102 perMetricPersistenceScorecardSection
    // so a reader who already saw the per-KPI direction and magnitude scalar
    // rows can immediately read the collapsed per-KPI verdicts without
    // reconciling every twin-block row in their head. Formatter returns "" on
    // window_size < 3 OR when every row resolves to `flat` /
    // `insufficient_window` (mirrors the P11.101 scorecard formatter's own
    // short-window suppression posture) so the digest stays quiet on quiet
    // KPIs — no orphan verdict table below an empty scorecard block. Envelope
    // entry lands beside the P11.102 snapshot_per_metric_persistence_scorecard
    // entry so JSONL consumers grep 'verdict=sustained_both_axes' per KPI
    // without side-loading the P11.102 scorecard rows.
    snapshotPerMetricPersistenceScorecardVerdict =
      computeDigestSnapshotPerMetricPersistenceScorecardVerdict(
        snapshotPerMetricPersistenceScorecard,
      );
    perMetricPersistenceScorecardVerdictSection =
      formatDigestSnapshotPerMetricPersistenceScorecardVerdictSection(
        snapshotPerMetricPersistenceScorecardVerdict,
      );
    // P11.116 — per-metric persistence scorecard verdict TRANSITION caption
    // (module P11.115). Pure derivation of two P11.109 per-metric verdict
    // envelopes (previous, current) into ONE discrete transition token PER KPI
    // ROW — first_classification / undecidable / stable / improved / degraded
    // / rotated — so ops can spot a per-KPI week-over-week flip like
    // 'attributed_mrr flipped from sustained_both_axes → volatile' without
    // keeping last week's per-metric verdict table in their head. Splices
    // directly BELOW the P11.110 perMetricPersistenceScorecardVerdictSection so
    // the reader sees the current-week per-KPI verdict badges above and the
    // per-KPI transition badges inline below each Monday. Formatter returns ""
    // when window_size < 3 (matches P11.110 short-window suppression) OR when
    // every KPI resolves to `first_classification` / `stable` so the digest
    // stays quiet on quiet KPIs. Previous per-metric verdict envelope is
    // decoded defensively from
    // previousSnapshot.envelope.snapshot_per_metric_persistence_scorecard_verdict
    // — older snapshots (pre-P11.110 tick 504) store {skipped_reason} instead
    // of an envelope and fall through to `null`, which the module treats as a
    // fresh baseline pass (every row emits `first_classification`). Rows on
    // the previous envelope with an unknown verdict token OR an unknown KPI
    // key are dropped from the reconstructed previous envelope so a
    // hand-edited JSONL row cannot smuggle a bogus token into the ladder —
    // matches the P11.114 posture at the portfolio grain. Envelope entry lands
    // beside snapshot_per_metric_persistence_scorecard_verdict so JSONL
    // consumers can grep 'transition=degraded' per KPI without side-loading the
    // P11.109 verdict scalars.
    const previousPerMetricVerdictRaw =
      previousSnapshot.envelope.snapshot_per_metric_persistence_scorecard_verdict;
    let previousPerMetricVerdict:
      | DigestSnapshotPerMetricPersistenceScorecardVerdict
      | null = null;
    if (
      previousPerMetricVerdictRaw &&
      typeof previousPerMetricVerdictRaw === "object"
    ) {
      const record = previousPerMetricVerdictRaw as Record<string, unknown>;
      const rowsRaw = record.rows;
      if (Array.isArray(rowsRaw)) {
        const KNOWN_VERDICT_TOKENS: readonly PersistenceScorecardVerdictToken[] = [
          "insufficient_window",
          "flat",
          "sustained_both_axes",
          "sustained_direction_only",
          "sustained_magnitude_only",
          "volatile",
        ];
        const reconstructedRows: PerMetricPersistenceScorecardVerdictRow[] = [];
        for (const rowRaw of rowsRaw) {
          if (!rowRaw || typeof rowRaw !== "object") continue;
          const rowRecord = rowRaw as Record<string, unknown>;
          const key = rowRecord.key;
          const verdict = rowRecord.verdict;
          if (
            typeof key !== "string" ||
            typeof verdict !== "string" ||
            !(KNOWN_VERDICT_TOKENS as readonly string[]).includes(verdict)
          ) {
            continue;
          }
          const metricName =
            typeof rowRecord.metric_name === "string"
              ? rowRecord.metric_name
              : key;
          const unitRaw = rowRecord.unit;
          const unit: PerMetricPersistenceScorecardVerdictRow["unit"] =
            unitRaw === "cents" ||
            unitRaw === "signed_cents" ||
            unitRaw === "count"
              ? unitRaw
              : "count";
          reconstructedRows.push({
            key: key as PerMetricPersistenceScorecardVerdictRow["key"],
            metric_name: metricName,
            unit,
            verdict: verdict as PersistenceScorecardVerdictToken,
            direction_sustained: rowRecord.direction_sustained === true,
            magnitude_sustained: rowRecord.magnitude_sustained === true,
            summary:
              typeof rowRecord.summary === "string" ? rowRecord.summary : "",
          });
        }
        previousPerMetricVerdict = {
          window_size:
            typeof record.window_size === "number" ? record.window_size : 0,
          first_week:
            typeof record.first_week === "string" ? record.first_week : null,
          last_week:
            typeof record.last_week === "string" ? record.last_week : null,
          sustained_p90_threshold:
            typeof record.sustained_p90_threshold === "number"
              ? record.sustained_p90_threshold
              : 3,
          threshold:
            typeof record.threshold === "number" ? record.threshold : 0.25,
          rows: reconstructedRows,
        };
      }
    }
    snapshotPerMetricPersistenceScorecardVerdictTransition =
      computeDigestSnapshotPerMetricPersistenceScorecardVerdictTransition(
        snapshotPerMetricPersistenceScorecardVerdict,
        previousPerMetricVerdict,
      );
    perMetricPersistenceScorecardVerdictTransitionSection =
      formatDigestSnapshotPerMetricPersistenceScorecardVerdictTransitionSection(
        snapshotPerMetricPersistenceScorecardVerdictTransition,
      );
    // P11.126 — per-metric verdict-transition DELTA-RANK DISTRIBUTION caption
    // (module P11.125). Pure derivation of the P11.115 per-metric transition
    // envelope into a scalar-summary distribution: 'ACROSS thirteen KPIs, how
    // many improved by +2 vs +1 ranks, degraded by −1 vs −2, rotated, or
    // remained undecidable?' Ops reads a single caption + non-zero bucket list
    // rather than eyeballing the row-per-KPI transition table above. Splices
    // directly BELOW perMetricPersistenceScorecardVerdictTransitionSection so
    // the scalar summary sits inline beneath the row grid that produced it.
    // Consumes the SAME snapshotPerMetricPersistenceScorecardVerdictTransition
    // the P11.116 formatter just consumed — no extra fold, no divergence risk.
    // Formatter returns "" on window_size < 3 OR total == 0 OR alert_worthy ==
    // 0 (matches the P11.115/P11.116 short-window suppression + adds the
    // aggregation-specific 'nothing to summarise' guards).
    snapshotPerMetricPersistenceScorecardVerdictTransitionDistribution =
      computeDigestSnapshotPerMetricPersistenceScorecardVerdictTransitionDistribution(
        snapshotPerMetricPersistenceScorecardVerdictTransition,
      );
    perMetricPersistenceScorecardVerdictTransitionDistributionSection =
      formatDigestSnapshotPerMetricPersistenceScorecardVerdictTransitionDistributionSection(
        snapshotPerMetricPersistenceScorecardVerdictTransitionDistribution,
      );
    // P11.118 — per-partner persistence scorecard verdict TRANSITION caption
    // (module P11.117). Pure derivation of two P11.111 per-partner verdict
    // envelopes (previous, current) into ONE discrete transition token PER
    // PARTNER ROW — first_classification / undecidable / stable / improved /
    // degraded / rotated — so ops can spot a per-partner week-over-week flip
    // like 'ACME flipped from sustained_both_axes → volatile' without keeping
    // last week's per-partner verdict table in their head. Splices directly
    // BELOW the P11.112 perResellerPersistenceScorecardVerdictSection so the
    // reader sees the current-week per-partner verdict badges above and the
    // per-partner transition badges inline below each Monday. Formatter returns
    // "" when window_size < 3 (matches P11.112 short-window suppression) OR
    // when every partner resolves to `first_classification` / `stable` so the
    // digest stays quiet on quiet partners. Previous per-partner verdict
    // envelope is decoded defensively from
    // previousSnapshot.envelope.snapshot_per_reseller_persistence_scorecard_verdict
    // — older snapshots (pre-P11.112 tick 506) store {skipped_reason} instead
    // of an envelope and fall through to `null`, which the module treats as a
    // fresh baseline pass (every partner emits `first_classification`). Rows on
    // the previous envelope with an unknown verdict token OR a missing
    // reseller_code are dropped from the reconstructed previous envelope so a
    // hand-edited JSONL row cannot smuggle a bogus token into the ladder —
    // matches the P11.114 / P11.116 posture at the portfolio and per-metric
    // grains. Envelope entry lands beside
    // snapshot_per_reseller_persistence_scorecard_verdict so JSONL consumers
    // can grep 'transition=degraded' per partner without side-loading the
    // P11.111 verdict scalars. Capstones the verdict-transition trio at all
    // three scorecard grains (portfolio P11.114 → per-metric P11.116 →
    // per-partner this tick).
    const previousPerResellerVerdictRaw =
      previousSnapshot.envelope.snapshot_per_reseller_persistence_scorecard_verdict;
    let previousPerResellerVerdict:
      | DigestSnapshotPerResellerPersistenceScorecardVerdict
      | null = null;
    if (
      previousPerResellerVerdictRaw &&
      typeof previousPerResellerVerdictRaw === "object"
    ) {
      const record = previousPerResellerVerdictRaw as Record<string, unknown>;
      const rowsRaw = record.rows;
      if (Array.isArray(rowsRaw)) {
        const KNOWN_VERDICT_TOKENS: readonly PersistenceScorecardVerdictToken[] = [
          "insufficient_window",
          "flat",
          "sustained_both_axes",
          "sustained_direction_only",
          "sustained_magnitude_only",
          "volatile",
        ];
        const reconstructedRows: PerResellerPersistenceScorecardVerdictRow[] = [];
        for (const rowRaw of rowsRaw) {
          if (!rowRaw || typeof rowRaw !== "object") continue;
          const rowRecord = rowRaw as Record<string, unknown>;
          const resellerCode = rowRecord.reseller_code;
          const verdict = rowRecord.verdict;
          if (
            typeof resellerCode !== "string" ||
            typeof verdict !== "string" ||
            !(KNOWN_VERDICT_TOKENS as readonly string[]).includes(verdict)
          ) {
            continue;
          }
          reconstructedRows.push({
            reseller_code: resellerCode,
            verdict: verdict as PersistenceScorecardVerdictToken,
            direction_sustained: rowRecord.direction_sustained === true,
            magnitude_sustained: rowRecord.magnitude_sustained === true,
            summary:
              typeof rowRecord.summary === "string" ? rowRecord.summary : "",
          });
        }
        previousPerResellerVerdict = {
          window_size:
            typeof record.window_size === "number" ? record.window_size : 0,
          first_week:
            typeof record.first_week === "string" ? record.first_week : null,
          last_week:
            typeof record.last_week === "string" ? record.last_week : null,
          sustained_p90_threshold:
            typeof record.sustained_p90_threshold === "number"
              ? record.sustained_p90_threshold
              : 3,
          threshold:
            typeof record.threshold === "number" ? record.threshold : 0.25,
          rows: reconstructedRows,
        };
      }
    }
    snapshotPerResellerPersistenceScorecardVerdictTransition =
      computeDigestSnapshotPerResellerPersistenceScorecardVerdictTransition(
        snapshotPerResellerPersistenceScorecardVerdict,
        previousPerResellerVerdict,
      );
    perResellerPersistenceScorecardVerdictTransitionSection =
      formatDigestSnapshotPerResellerPersistenceScorecardVerdictTransitionSection(
        snapshotPerResellerPersistenceScorecardVerdictTransition,
      );
    // P11.128 — per-partner verdict-transition DELTA-RANK DISTRIBUTION caption
    // (module P11.127). Pure derivation of the P11.117 per-partner transition
    // envelope into a scalar-summary distribution: 'ACROSS the partner roster,
    // how many improved by +2 vs +1 ranks, degraded by −1 vs −2, rotated, or
    // remained undecidable?' Ops reads a single caption + non-zero bucket list
    // rather than eyeballing the row-per-partner transition table above.
    // Splices directly BELOW perResellerPersistenceScorecardVerdictTransitionSection
    // so the scalar summary sits inline beneath the row grid that produced it.
    // Consumes the SAME snapshotPerResellerPersistenceScorecardVerdictTransition
    // the P11.118 formatter just consumed — no extra fold, no divergence risk.
    // Formatter returns "" on window_size < 3 OR total == 0 OR alert_worthy ==
    // 0 (matches the P11.117/P11.118 short-window suppression + adds the
    // aggregation-specific 'nothing to summarise' guards). Mirrors the P11.126
    // per-metric-grain distribution wiring exactly — same envelope shape (no
    // rows[], nested distribution object with the ten transition buckets +
    // alert_worthy scalar + net_delta_rank barometer).
    snapshotPerResellerPersistenceScorecardVerdictTransitionDistribution =
      computeDigestSnapshotPerResellerPersistenceScorecardVerdictTransitionDistribution(
        snapshotPerResellerPersistenceScorecardVerdictTransition,
      );
    perResellerPersistenceScorecardVerdictTransitionDistributionSection =
      formatDigestSnapshotPerResellerPersistenceScorecardVerdictTransitionDistributionSection(
        snapshotPerResellerPersistenceScorecardVerdictTransitionDistribution,
      );
    // P11.124 — per-(partner × metric) persistence scorecard verdict TRANSITION
    // caption (module P11.123). Pure derivation of two P11.121 per-pair verdict
    // envelopes (previous, current) into ONE discrete transition token PER
    // (reseller_code × KPI key) PAIR — first_classification / undecidable /
    // stable / improved / degraded / rotated — so ops can spot a per-pair
    // week-over-week flip like 'INFOVISION × attributed_mrr flipped from
    // sustained_both_axes → volatile' without keeping last week's per-pair
    // verdict table in their head. Splices directly BELOW the P11.122
    // perResellerMetricPersistenceScorecardVerdictSection so the reader sees the
    // current-week per-pair verdict badges above and the per-pair transition
    // badges inline below each Monday. Formatter returns "" when window_size < 3
    // (matches P11.122 short-window suppression) OR when every pair resolves to
    // `first_classification` / `stable` so the digest stays quiet on quiet
    // pairs. Previous per-pair verdict envelope is decoded defensively from
    // previousSnapshot.envelope.snapshot_per_reseller_metric_persistence_scorecard_verdict
    // — older snapshots (pre-P11.122 tick 516) store {skipped_reason} instead
    // of an envelope and fall through to `null`, which the module treats as a
    // fresh baseline pass (every pair emits `first_classification`). Rows on
    // the previous envelope with an unknown verdict token OR a missing
    // reseller_code / KPI key are dropped from the reconstructed previous
    // envelope so a hand-edited JSONL row cannot smuggle a bogus token into the
    // ladder — matches the P11.114 / P11.116 / P11.118 posture at the coarser
    // grains. Envelope entry lands beside
    // snapshot_per_reseller_metric_persistence_scorecard_verdict so JSONL
    // consumers can grep 'transition=degraded' per pair without side-loading
    // the P11.121 verdict scalars. Capstones the verdict-transition quartet at
    // all four scorecard grains (portfolio P11.114 → per-metric P11.116 →
    // per-partner P11.118 → per-(partner × metric) this tick).
    const previousPerResellerMetricVerdictRaw =
      previousSnapshot.envelope.snapshot_per_reseller_metric_persistence_scorecard_verdict;
    let previousPerResellerMetricVerdict:
      | DigestSnapshotPerResellerMetricPersistenceScorecardVerdict
      | null = null;
    if (
      previousPerResellerMetricVerdictRaw &&
      typeof previousPerResellerMetricVerdictRaw === "object"
    ) {
      const record = previousPerResellerMetricVerdictRaw as Record<string, unknown>;
      const rowsRaw = record.rows;
      if (Array.isArray(rowsRaw)) {
        const KNOWN_VERDICT_TOKENS: readonly PersistenceScorecardVerdictToken[] = [
          "insufficient_window",
          "flat",
          "sustained_both_axes",
          "sustained_direction_only",
          "sustained_magnitude_only",
          "volatile",
        ];
        const reconstructedRows: PerResellerMetricPersistenceScorecardVerdictRow[] = [];
        for (const rowRaw of rowsRaw) {
          if (!rowRaw || typeof rowRaw !== "object") continue;
          const rowRecord = rowRaw as Record<string, unknown>;
          const resellerCode = rowRecord.reseller_code;
          const key = rowRecord.key;
          const verdict = rowRecord.verdict;
          if (
            typeof resellerCode !== "string" ||
            typeof key !== "string" ||
            typeof verdict !== "string" ||
            !(KNOWN_VERDICT_TOKENS as readonly string[]).includes(verdict)
          ) {
            continue;
          }
          const metricName =
            typeof rowRecord.metric_name === "string"
              ? rowRecord.metric_name
              : key;
          const unitRaw = rowRecord.unit;
          const unit: PerResellerMetricPersistenceScorecardVerdictRow["unit"] =
            unitRaw === "cents" ||
            unitRaw === "signed_cents" ||
            unitRaw === "count"
              ? unitRaw
              : "count";
          reconstructedRows.push({
            reseller_code: resellerCode,
            key: key as PerResellerMetricPersistenceScorecardVerdictRow["key"],
            metric_name: metricName,
            unit,
            verdict: verdict as PersistenceScorecardVerdictToken,
            direction_sustained: rowRecord.direction_sustained === true,
            magnitude_sustained: rowRecord.magnitude_sustained === true,
            summary:
              typeof rowRecord.summary === "string" ? rowRecord.summary : "",
          });
        }
        previousPerResellerMetricVerdict = {
          window_size:
            typeof record.window_size === "number" ? record.window_size : 0,
          first_week:
            typeof record.first_week === "string" ? record.first_week : null,
          last_week:
            typeof record.last_week === "string" ? record.last_week : null,
          sustained_p90_threshold:
            typeof record.sustained_p90_threshold === "number"
              ? record.sustained_p90_threshold
              : 3,
          threshold:
            typeof record.threshold === "number" ? record.threshold : 0.25,
          rows: reconstructedRows,
        };
      }
    }
    snapshotPerResellerMetricPersistenceScorecardVerdictTransition =
      computeDigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransition(
        snapshotPerResellerMetricPersistenceScorecardVerdict,
        previousPerResellerMetricVerdict,
      );
    perResellerMetricPersistenceScorecardVerdictTransitionSection =
      formatDigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransitionSection(
        snapshotPerResellerMetricPersistenceScorecardVerdictTransition,
      );
    // P11.130 — per-(partner × metric) verdict-transition DELTA-RANK
    // DISTRIBUTION caption (module P11.129). Pure derivation of the P11.123
    // per-pair transition envelope into a scalar-summary distribution: 'ACROSS
    // the (partner × KPI) roster, how many pairs improved by +2 vs +1 ranks,
    // degraded by −1 vs −2, rotated, or remained undecidable?' Ops reads a
    // single caption + non-zero bucket list rather than eyeballing the
    // row-per-pair transition table above (a 3-partner × 13-KPI roster is 39
    // rows; a 10-partner × 13-KPI roster is 130 rows).
    // Splices directly BELOW perResellerMetricPersistenceScorecardVerdictTransitionSection
    // so the scalar summary sits inline beneath the row grid that produced it.
    // Consumes the SAME snapshotPerResellerMetricPersistenceScorecardVerdictTransition
    // the P11.124 formatter just consumed — no extra fold, no divergence risk
    // vs. the row-per-pair table above.
    // Formatter returns "" on window_size < 3 OR total == 0 OR alert_worthy ==
    // 0 (matches the P11.123/P11.124 short-window suppression + adds the
    // aggregation-specific 'nothing to summarise' guards). Mirrors the P11.126
    // per-metric-grain and P11.128 per-partner-grain distribution wiring
    // exactly — same envelope shape (no rows[], nested distribution object
    // with the ten transition buckets + alert_worthy scalar + net_delta_rank
    // barometer). CAPSTONES the DISTRIBUTION family at three of four scorecard
    // grains (per-metric P11.125/P11.126 + per-partner P11.127/P11.128 +
    // per-pair P11.129/P11.130); portfolio-grain distribution remains as a
    // future tick option.
    snapshotPerResellerMetricPersistenceScorecardVerdictTransitionDistribution =
      computeDigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransitionDistribution(
        snapshotPerResellerMetricPersistenceScorecardVerdictTransition,
      );
    perResellerMetricPersistenceScorecardVerdictTransitionDistributionSection =
      formatDigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransitionDistributionSection(
        snapshotPerResellerMetricPersistenceScorecardVerdictTransitionDistribution,
      );
    // P11.134 — cross-grain verdict-transition DISTRIBUTION-family alerts
    // aggregator (module P11.133). Folds the FOUR grain-level distribution
    // envelopes (portfolio P11.131/P11.132 + per-metric P11.125/P11.126 +
    // per-partner P11.127/P11.128 + per-(partner × metric) P11.129/P11.130)
    // into ONE scalar summary — `total_alerts`, `grains_alerting`,
    // `net_delta_rank` sum, and `highest_signal_grain` pointer — so an ops
    // JSONL consumer can answer 'is anything alerting THIS week, and if so
    // how loud?' with a single grep rather than opening four
    // snapshot_*_persistence_scorecard_verdict_transition_distribution
    // envelopes and re-summing the scalars in their head. Each of the four
    // inputs is optional: missing grains (fresh install, previousSnapshot
    // skipped, partial rollout) are simply skipped in the aggregation. The
    // compute returns null when ALL FOUR inputs are missing, and the
    // formatter suppresses on null snapshot / window_size < 3 / total_alerts
    // === 0 (matches every downstream grain-level suppression posture so a
    // silent week yields a silent lead). Envelope fields (window_size /
    // first_week / last_week / threshold / sustained_p90_threshold) are
    // sourced from the first non-null grain in the fixed priority order
    // portfolio → per_metric → per_partner → per_pair; the four grains
    // derive from the SAME weekly snapshot so the envelopes agree by
    // construction. Section splices ABOVE persistenceScorecardVerdictTransitionDistributionSection
    // (the portfolio-grain distribution caption) as an executive-summary
    // lead so ops sees the roll-up first and drills into the specific grain
    // that owns the largest signal — the four grain-level captions below
    // stay in their existing splice positions.
    snapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlerts =
      computeDigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlerts(
        {
          portfolio: snapshotPersistenceScorecardVerdictTransitionDistribution,
          per_metric:
            snapshotPerMetricPersistenceScorecardVerdictTransitionDistribution,
          per_partner:
            snapshotPerResellerPersistenceScorecardVerdictTransitionDistribution,
          per_pair:
            snapshotPerResellerMetricPersistenceScorecardVerdictTransitionDistribution,
        },
      );
    persistenceScorecardVerdictTransitionDistributionFamilyAlertsSection =
      formatDigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlertsSection(
        snapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlerts,
      );
    // P11.136 — per-partner cross-metric alerts ranking (module P11.135).
    // Folds the P11.123 per-(partner × metric) verdict-transition envelope
    // into a ROW-PER-PARTNER cross-metric alerts summary so ops can rank
    // partners by cross-KPI alert-signal rather than by revenue. Complements
    // the P11.117/P11.118 per-partner surface (which collapses every partner's
    // KPI portfolio into a SINGLE verdict token and reports mixed portfolios
    // only as `rotated` or `undecidable`) AND the P11.129/P11.130 per-pair
    // distribution (which folds the ENTIRE roster into a single scalar
    // distribution and strips out partner identity — a JSONL consumer that
    // wants to rank partners by alert-signal has to walk the row-per-pair
    // table and re-aggregate by reseller_code themselves).
    // Consumes the SAME snapshotPerResellerMetricPersistenceScorecardVerdictTransition
    // the P11.124 formatter + P11.130 distribution already consumed — no
    // extra fold, no divergence risk vs. the row-per-pair table above.
    // Section splices IMMEDIATELY BELOW perResellerMetricPersistenceScorecardVerdictTransitionSection
    // so ops reads the pair-level transitions above and drills straight into
    // the per-partner ranking below (the P11.130 per-pair distribution scalar
    // summary lands directly beneath the ranking so the hierarchy is
    // pair-rows → per-partner ranking → scalar distribution — coarsening
    // as it descends).
    if (snapshotPerResellerMetricPersistenceScorecardVerdictTransition) {
      snapshotPerResellerCrossMetricAlerts =
        computeDigestSnapshotPerResellerCrossMetricAlerts(
          snapshotPerResellerMetricPersistenceScorecardVerdictTransition,
        );
      perResellerCrossMetricAlertsSection =
        formatDigestSnapshotPerResellerCrossMetricAlertsSection(
          snapshotPerResellerCrossMetricAlerts,
        );
      // P11.138 — per-metric cross-partner alerts ranking (module P11.137).
      // Dual of the P11.135/P11.136 per-partner ranking: pivots the SAME
      // P11.123 per-(partner × metric) verdict-transition envelope by
      // metric_key instead of reseller_code so ops can rank KPIs by cross-
      // partner alert-signal rather than by variance. Splices IMMEDIATELY
      // BELOW perResellerCrossMetricAlertsSection so the hierarchy descends
      // pair-rows (P11.124) → per-partner ranking (P11.135) → per-metric
      // ranking (P11.137) → per-pair scalar distribution (P11.130) — both
      // cross-cut rankings sit adjacent so ops can pivot from 'loudest
      // partners' to 'loudest KPIs' in a single glance.
      snapshotPerMetricCrossPartnerAlerts =
        computeDigestSnapshotPerMetricCrossPartnerAlerts(
          snapshotPerResellerMetricPersistenceScorecardVerdictTransition,
        );
      perMetricCrossPartnerAlertsSection =
        formatDigestSnapshotPerMetricCrossPartnerAlertsSection(
          snapshotPerMetricCrossPartnerAlerts,
        );
      // P11.140 — per-pair hot cells ranking (module P11.139). Granular
      // complement to both cross-cut rankings above: the P11.135/P11.136 pair
      // ranks partners by cross-metric alert-signal, the P11.137/P11.138 pair
      // ranks KPIs by cross-partner alert-signal, and this module ranks the
      // INDIVIDUAL (partner × KPI) cells driving both. Preserves pair-level
      // row granularity from the P11.123 envelope, filters to alert-worthy
      // transitions only, ranks by |delta_rank| (floor 1 for improved/degraded
      // at delta_rank=0; baseline 1 for rotated + undecidable). Splices
      // IMMEDIATELY BELOW perMetricCrossPartnerAlertsSection per the P11.139
      // formatter docblock placement rule so the hierarchy descends pair-rows
      // (P11.124) → per-partner ranking (P11.135) → per-metric ranking (P11.137)
      // → per-pair hot cells (P11.139) → per-pair scalar distribution (P11.130):
      // both cross-cut rankings sit adjacent, and the granular hot-cell list
      // sits between them and the scalar distribution so ops can pivot from
      // 'loudest partners / loudest KPIs' straight into the specific cells
      // driving both without leaving the Monday email.
      snapshotPerPairHotCells = computeDigestSnapshotPerPairHotCells(
        snapshotPerResellerMetricPersistenceScorecardVerdictTransition,
      );
      perPairHotCellsSection = formatDigestSnapshotPerPairHotCellsSection(
        snapshotPerPairHotCells,
      );
      // P11.142 — per-pair hot-cells SCALAR SUMMARY (module P11.141). Scalar
      // roll-up complement to the granular per-pair hot-cells ranking above:
      // the P11.139/P11.140 pair emits one row per alert-worthy (partner ×
      // KPI) cell, this module folds that list into a single-envelope
      // executive-summary — total cells + sum/max/mean hot_score + fixed-key
      // {improved, degraded, rotated, undecidable} transition mix + single
      // loudest partner + single loudest KPI. Splices IMMEDIATELY ABOVE
      // perPairHotCellsSection per the P11.141 formatter docblock placement
      // rule so the hierarchy descends per-metric ranking (P11.137) →
      // per-pair hot-cells SUMMARY (P11.141) → per-pair hot-cells GRANULAR
      // (P11.139) → per-pair scalar distribution (P11.130): ops reads the
      // executive-summary lead first (total cells, loudest partner, loudest
      // KPI, transition mix) and drills straight into the granular table for
      // the specific cells driving each scalar.
      snapshotPerPairHotCellsSummary =
        computeDigestSnapshotPerPairHotCellsSummary(snapshotPerPairHotCells);
      perPairHotCellsSummarySection =
        formatDigestSnapshotPerPairHotCellsSummarySection(
          snapshotPerPairHotCellsSummary,
        );
      // P11.144 — per-transition hot-cells DRILL-DOWN (module P11.143).
      // Partitions the P11.139 per-pair hot-cells list BY transition and picks
      // a per-bucket top-partner + top-KPI winner PER bucket so the urgent-
      // but-quieter degradation cluster surfaces alongside the improvement
      // cluster rather than getting buried inside the P11.141 blended scalar
      // summary. Splices IMMEDIATELY BELOW perPairHotCellsSummarySection AND
      // IMMEDIATELY ABOVE perPairHotCellsSection per the P11.143 formatter
      // docblock placement rule so the hierarchy descends per-metric ranking
      // (P11.137) → per-pair hot-cells SUMMARY (P11.141) → per-transition
      // DRILL-DOWN (P11.143) → per-pair hot-cells GRANULAR (P11.139) → per-
      // pair scalar distribution (P11.130): ops reads the blended executive-
      // summary lead first, then the per-transition drill-down to spot
      // urgent-but-quieter buckets, then the granular table for the specific
      // cells behind each bucket.
      snapshotPerTransitionHotCellsDrilldown =
        computeDigestSnapshotPerTransitionHotCellsDrilldown(
          snapshotPerPairHotCells,
        );
      perTransitionHotCellsDrilldownSection =
        formatDigestSnapshotPerTransitionHotCellsDrilldownSection(
          snapshotPerTransitionHotCellsDrilldown,
        );
      // P11.146 — per-transition MAGNITUDE drill-down (module P11.145).
      // Further partitions the P11.139 per-pair hot-cells list first by
      // transition then by hot_score magnitude band {small [1..2], medium
      // [3..5], large [6+]} so ops sees whether a loud transition bucket
      // is loud from MANY cells that barely qualified or a FEW cells that
      // jumped a huge distance — the follow-up shape the P11.143 per-
      // bucket winner picks alone cannot surface. Splices IMMEDIATELY
      // BELOW perTransitionHotCellsDrilldownSection AND IMMEDIATELY ABOVE
      // perPairHotCellsSection per the P11.145 formatter docblock
      // placement rule so the hierarchy descends per-metric ranking
      // (P11.137) → per-pair hot-cells SUMMARY (P11.141) → per-transition
      // DRILL-DOWN (P11.143) → per-transition MAGNITUDE (P11.145) → per-
      // pair hot-cells GRANULAR (P11.139) → per-pair scalar distribution
      // (P11.130): ops reads the per-transition winner picks first, then
      // the magnitude drill-down to see whether the winners are loud from
      // many small cells or a few large ones, then the granular table.
      snapshotPerTransitionMagnitudeDrilldown =
        computeDigestSnapshotPerTransitionMagnitudeDrilldown(
          snapshotPerPairHotCells,
        );
      perTransitionMagnitudeDrilldownSection =
        formatDigestSnapshotPerTransitionMagnitudeDrilldownSection(
          snapshotPerTransitionMagnitudeDrilldown,
        );
      // P11.148 — per-transition MAGNITUDE LEADERBOARD (module P11.147).
      // Names the top_partner + top_metric owning each (transition, band)
      // cell that the P11.146 magnitude drill-down aggregates. Answers the
      // follow-up the per-band scalars alone cannot surface: WITHIN a
      // specific (transition, band) cell — say (degraded, large) — WHICH
      // partner and WHICH KPI own the loudest chunk? Splices IMMEDIATELY
      // BELOW perTransitionMagnitudeDrilldownSection AND IMMEDIATELY ABOVE
      // perPairHotCellsSection per the P11.147 formatter docblock placement
      // rule so the hierarchy descends per-transition DRILL-DOWN (P11.143)
      // → per-transition MAGNITUDE scalars (P11.145) → per-transition
      // MAGNITUDE LEADERBOARD (P11.147) → per-pair hot-cells GRANULAR
      // (P11.139) → per-pair scalar distribution (P11.130): ops reads the
      // per-transition winner picks first, then the magnitude breakdown
      // for loud-vs-quiet distribution shape, then this leaderboard to
      // attribute each loud cell to a specific partner + KPI, then the
      // granular table for the individual cells behind each pick.
      snapshotPerTransitionMagnitudeLeaderboard =
        computeDigestSnapshotPerTransitionMagnitudeLeaderboard(
          snapshotPerPairHotCells,
        );
      perTransitionMagnitudeLeaderboardSection =
        formatDigestSnapshotPerTransitionMagnitudeLeaderboardSection(
          snapshotPerTransitionMagnitudeLeaderboard,
        );
      // P11.150 — per-transition MAGNITUDE TOP-3 LEADERBOARD (module
      // P11.149). Ranks the top-3 partners + top-3 KPIs owning each
      // (transition, band) cell that the P11.148 single-winner leaderboard
      // named a #1 for. Answers the follow-up the single-winner picker
      // cannot surface: is the top_partner an OUTLIER (second-place has
      // half as many cells), or is the winner barely ahead of a pack of
      // near-peers (three partners tied within one cell of each other,
      // ops needs to poke all three)? Splices IMMEDIATELY BELOW
      // perTransitionMagnitudeLeaderboardSection AND IMMEDIATELY ABOVE
      // perPairHotCellsSection per the P11.149 formatter docblock placement
      // rule so the hierarchy descends per-transition DRILL-DOWN (P11.143)
      // → per-transition MAGNITUDE scalars (P11.145) → per-transition
      // MAGNITUDE LEADERBOARD single-winner (P11.147) → per-transition
      // MAGNITUDE TOP-3 LEADERBOARD (P11.149) → per-pair hot-cells GRANULAR
      // (P11.139) → per-pair scalar distribution (P11.130): ops reads the
      // single-winner leaderboard first for the #1 pick, then this top-3
      // list to see whether the #1 is an outlier or one of a pack of near-
      // peers, then the granular table for the individual cells.
      snapshotPerTransitionMagnitudeTop3Leaderboard =
        computeDigestSnapshotPerTransitionMagnitudeTop3Leaderboard(
          snapshotPerPairHotCells,
        );
      perTransitionMagnitudeTop3LeaderboardSection =
        formatDigestSnapshotPerTransitionMagnitudeTop3LeaderboardSection(
          snapshotPerTransitionMagnitudeTop3Leaderboard,
        );
      // P11.152 — per-transition MAGNITUDE TOP-3 CONCENTRATION (module
      // P11.151). Folds the P11.150 top-3 ranked lists into a single
      // outlier-vs-pack scalar per (transition, band) cell so ops learns
      // whether the #1 partner / KPI dominates (index >= 0.60) or is
      // one of a near-peer pack (< 0.40) at a glance without visually
      // scanning the three ranked entries. Splices IMMEDIATELY BELOW
      // perTransitionMagnitudeTop3LeaderboardSection AND IMMEDIATELY
      // ABOVE perPairHotCellsSection per the P11.151 formatter docblock
      // placement rule so the hierarchy descends per-transition DRILL-
      // DOWN (P11.143) → per-transition MAGNITUDE scalars (P11.145) →
      // per-transition MAGNITUDE LEADERBOARD single-winner (P11.147) →
      // per-transition MAGNITUDE TOP-3 LEADERBOARD (P11.149) → per-
      // transition MAGNITUDE TOP-3 CONCENTRATION (P11.151) → per-pair
      // hot-cells GRANULAR (P11.139) → per-pair scalar distribution
      // (P11.130). Ops reads the top-3 ranked list first, then this
      // concentration row for the outlier-vs-pack read, then the
      // granular table for the individual cells.
      snapshotPerTransitionMagnitudeTop3Concentration =
        computeDigestSnapshotPerTransitionMagnitudeTop3Concentration(
          snapshotPerPairHotCells,
        );
      perTransitionMagnitudeTop3ConcentrationSection =
        formatDigestSnapshotPerTransitionMagnitudeTop3ConcentrationSection(
          snapshotPerTransitionMagnitudeTop3Concentration,
        );
      // P11.154 — per-transition MAGNITUDE TOP-3 TIE COUNT (module P11.153).
      // Absolute-count complement to the P11.152 concentration index. The
      // concentration scalar answers "how DOMINANT is the #1 pick?"; this
      // module answers "how MANY entries are tied at the top?" as an integer
      // in [0, TOP_N]. Together the two disambiguate cases the concentration
      // formula alone squashes together (e.g. index=0.5 = 1/2 clear leader
      // vs 2/4 tied pair with a runner-up). Splices IMMEDIATELY BELOW
      // perTransitionMagnitudeTop3ConcentrationSection AND IMMEDIATELY ABOVE
      // perPairHotCellsSection per the P11.153 formatter docblock placement
      // rule so the hierarchy descends per-transition DRILL-DOWN (P11.143)
      // → per-transition MAGNITUDE scalars (P11.145) → per-transition
      // MAGNITUDE LEADERBOARD single-winner (P11.147) → per-transition
      // MAGNITUDE TOP-3 LEADERBOARD (P11.149) → per-transition MAGNITUDE
      // TOP-3 CONCENTRATION (P11.151) → per-transition MAGNITUDE TOP-3 TIE
      // COUNT (P11.153) → per-pair hot-cells GRANULAR (P11.139) → per-pair
      // scalar distribution (P11.130).
      snapshotPerTransitionMagnitudeTop3TieCount =
        computeDigestSnapshotPerTransitionMagnitudeTop3TieCount(
          snapshotPerPairHotCells,
        );
      perTransitionMagnitudeTop3TieCountSection =
        formatDigestSnapshotPerTransitionMagnitudeTop3TieCountSection(
          snapshotPerTransitionMagnitudeTop3TieCount,
        );
      // P11.156 — per-transition MAGNITUDE TOP-3 RUNNER-UP GAP (module P11.155).
      // Absolute-gap complement to the P11.152 concentration index and the
      // P11.154 tie count. Concentration answers "how DOMINANT is the #1
      // pick?" as a normalised scalar; tie count answers "how MANY entries
      // are tied at the top?" as an integer; this module answers "how much
      // daylight does the #1 entry have over the #2 entry?" as an integer
      // cell-count gap. Together the three scalars disambiguate outlier vs
      // pack-of-peers shapes the leaderboard arrays alone leave to the
      // reader. Splices IMMEDIATELY BELOW perTransitionMagnitudeTop3TieCountSection
      // AND IMMEDIATELY ABOVE perPairHotCellsSection per the P11.155
      // formatter docblock placement rule so the hierarchy descends
      // per-transition DRILL-DOWN (P11.143) → per-transition MAGNITUDE
      // scalars (P11.145) → per-transition MAGNITUDE LEADERBOARD
      // single-winner (P11.147) → per-transition MAGNITUDE TOP-3
      // LEADERBOARD (P11.149) → per-transition MAGNITUDE TOP-3
      // CONCENTRATION (P11.151) → per-transition MAGNITUDE TOP-3 TIE
      // COUNT (P11.153) → per-transition MAGNITUDE TOP-3 RUNNER-UP GAP
      // (P11.155) → per-pair hot-cells GRANULAR (P11.139).
      snapshotPerTransitionMagnitudeTop3RunnerUpGap =
        computeDigestSnapshotPerTransitionMagnitudeTop3RunnerUpGap(
          snapshotPerPairHotCells,
        );
      perTransitionMagnitudeTop3RunnerUpGapSection =
        formatDigestSnapshotPerTransitionMagnitudeTop3RunnerUpGapSection(
          snapshotPerTransitionMagnitudeTop3RunnerUpGap,
        );
      // P11.158 — per-transition MAGNITUDE TOP-3 TAIL GAP (module P11.157).
      // Tail-flatness complement to the P11.155 top-of-pack runner-up gap.
      // Runner-up gap answers "how much daylight does #1 have over #2?" (the
      // top-of-pack question); this module answers "how much daylight does
      // #1 have over the last entry in the top-N ranked list?" (the tail-
      // flatness question). Together the two scalars name both ends of the
      // ranked window shape. Splices IMMEDIATELY BELOW
      // perTransitionMagnitudeTop3RunnerUpGapSection AND IMMEDIATELY ABOVE
      // perPairHotCellsSection per the P11.157 formatter docblock placement
      // rule so the hierarchy descends per-transition DRILL-DOWN (P11.143) →
      // per-transition MAGNITUDE scalars (P11.145) → per-transition
      // MAGNITUDE LEADERBOARD single-winner (P11.147) → per-transition
      // MAGNITUDE TOP-3 LEADERBOARD (P11.149) → per-transition MAGNITUDE
      // TOP-3 CONCENTRATION (P11.151) → per-transition MAGNITUDE TOP-3 TIE
      // COUNT (P11.153) → per-transition MAGNITUDE TOP-3 RUNNER-UP GAP
      // (P11.155) → per-transition MAGNITUDE TOP-3 TAIL GAP (P11.157) →
      // per-pair hot-cells GRANULAR (P11.139).
      snapshotPerTransitionMagnitudeTop3TailGap =
        computeDigestSnapshotPerTransitionMagnitudeTop3TailGap(
          snapshotPerPairHotCells,
        );
      perTransitionMagnitudeTop3TailGapSection =
        formatDigestSnapshotPerTransitionMagnitudeTop3TailGapSection(
          snapshotPerTransitionMagnitudeTop3TailGap,
        );
      // P11.160 — per-transition MAGNITUDE TOP-3 MIDDLE GAP (module P11.159).
      // Middle-of-pack complement to the P11.155 runner-up gap (leader vs #2)
      // and the P11.157 tail gap (leader vs #N). Runner-up gap answers "how
      // much daylight does #1 have over #2?"; tail gap answers "how much
      // daylight does #1 have over the last entry?"; this module answers
      // "how much daylight does #2 have over the last entry?" — the middle
      // question. Together the three integer gaps triangulate the shape of
      // the full TOP-N ranked window without asking ops to eyeball the array.
      // Splices IMMEDIATELY BELOW perTransitionMagnitudeTop3TailGapSection
      // AND IMMEDIATELY ABOVE perPairHotCellsSection per the P11.159
      // formatter docblock placement rule.
      snapshotPerTransitionMagnitudeTop3MiddleGap =
        computeDigestSnapshotPerTransitionMagnitudeTop3MiddleGap(
          snapshotPerPairHotCells,
        );
      perTransitionMagnitudeTop3MiddleGapSection =
        formatDigestSnapshotPerTransitionMagnitudeTop3MiddleGapSection(
          snapshotPerTransitionMagnitudeTop3MiddleGap,
        );
      // P11.162 — per-transition MAGNITUDE TOP-3 POOL (module P11.161).
      // Population-size complement to the P11.149 TOP-3 leaderboard and the
      // P11.155/P11.157/P11.159 gap suite. Answers "how many partners / KPIs
      // live in this (transition, band) OUTSIDE the top-3, and what share of
      // the total cell count do they carry?" — the follow-up question that
      // disambiguates a compact 3-partner cell from a wide-tail 12-partner
      // cell that both show identical top-3 arrays. Splices IMMEDIATELY BELOW
      // perTransitionMagnitudeTop3MiddleGapSection AND IMMEDIATELY ABOVE
      // perPairHotCellsSection per the P11.161 formatter docblock placement
      // rule. Consumes snapshotPerPairHotCells directly (same posture as the
      // sibling per-transition magnitude drill-down surfaces).
      snapshotPerTransitionMagnitudeTop3Pool =
        computeDigestSnapshotPerTransitionMagnitudeTop3Pool(
          snapshotPerPairHotCells,
        );
      perTransitionMagnitudeTop3PoolSection =
        formatDigestSnapshotPerTransitionMagnitudeTop3PoolSection(
          snapshotPerTransitionMagnitudeTop3Pool,
        );
      // P11.164 — per-transition MAGNITUDE TOP-3 POOL HHI (module P11.163).
      // Distribution-shape complement to the P11.161/P11.162 POOL SIZE surface.
      // The P11.151 top-3 concentration index normalises over the top-3
      // sub-sum only and is therefore blind to the tail; the P11.161 pool
      // module names tail SIZE (count + share) but does NOT name the
      // inequality shape of the FULL pool. HHI (sum of squared cell-shares
      // across the full pool) disambiguates two cells with an identical
      // tail_share=0.50: Pareto-shape (one dominant partner + broad tail;
      // HHI ~0.60 → dominant) vs flat-shape (many near-peer partners;
      // HHI ~1/N → diffuse). Cutoffs mirror the DOJ/FTC merger-review HHI
      // bands (0.15 moderate / 0.25 concentrated). Splices IMMEDIATELY BELOW
      // perTransitionMagnitudeTop3PoolSection AND IMMEDIATELY ABOVE
      // perPairHotCellsSection per the P11.163 formatter docblock placement
      // rule. Consumes snapshotPerPairHotCells directly (same posture as the
      // sibling per-transition magnitude drill-down surfaces).
      snapshotPerTransitionMagnitudeTop3PoolHhi =
        computeDigestSnapshotPerTransitionMagnitudeTop3PoolHhi(
          snapshotPerPairHotCells,
        );
      perTransitionMagnitudeTop3PoolHhiSection =
        formatDigestSnapshotPerTransitionMagnitudeTop3PoolHhiSection(
          snapshotPerTransitionMagnitudeTop3PoolHhi,
        );
      // P11.170 — per-transition MAGNITUDE TOP-3 POOL GINI
      // (module P11.169). Second whole-pool inequality-shape complement
      // to the P11.163 HHI surface. HHI (sum of squared shares) squares
      // the leader's slice so it reacts STRONGLY to a single dominant
      // participant but is comparatively insensitive to the shape of
      // the middle-and-tail once a dominant player is present. Gini
      // (mean absolute pair-wise difference / (2 × mean), OECD income-
      // inequality anchor) reacts to the WHOLE curve — a Pareto-shape
      // (one leader + broad flat tail) and a two-shoulders shape (two
      // large + light tail) can share the same HHI but diverge on Gini
      // because Gini integrates every pair-wise gap, not just the
      // leader's dominance. Cutoffs use plain-language fraction bands
      // (UNEQUAL_GINI_MIN=0.40 OECD high-inequality anchor / MIXED_GINI_MIN=0.20
      // clean separation from near-uniform floor / uniform below).
      // Splices IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolHhiSection
      // AND IMMEDIATELY ABOVE perTransitionMagnitudeTop3PoolTop1ShareSection
      // per the P11.169 formatter docblock placement rule so HHI and Gini
      // sit adjacent (both answer "how equal is the pool?" with different
      // mathematical bases) and hierarchically ABOVE the leader-slice pair.
      // Consumes snapshotPerPairHotCells directly (same posture as the
      // sibling per-transition magnitude drill-down surfaces).
      snapshotPerTransitionMagnitudeTop3PoolGini =
        computeDigestSnapshotPerTransitionMagnitudeTop3PoolGini(
          snapshotPerPairHotCells,
        );
      perTransitionMagnitudeTop3PoolGiniSection =
        formatDigestSnapshotPerTransitionMagnitudeTop3PoolGiniSection(
          snapshotPerTransitionMagnitudeTop3PoolGini,
        );
      // P11.172 — per-transition MAGNITUDE TOP-3 POOL THEIL (module
      // P11.171). Third distribution-shape complement to the P11.161
      // POOL SIZE surface, closing the whole-pool inequality trio
      // that started with P11.163 HHI + P11.169 Gini. HHI squares
      // shares (amplifies the leader), Gini integrates every
      // pair-wise gap (reflects the whole curve), Theil T decomposes
      // as an entropy divergence between the observed distribution
      // and the perfectly-uniform reference (weights the large shares
      // by their own magnitude via share × ln(share × n)). Cells that
      // share an HHI + Gini label diverge on Theil when the shape of
      // the leader vs. the shoulders differ — a single runaway
      // participant registers more sharply on Theil than the
      // shoulders Gini spreads across the pool. Cutoffs mirror the
      // income-literature bands (HIGH_THEIL_MIN=0.30 / MODERATE_THEIL_MIN=0.10
      // / balanced below). Splices IMMEDIATELY BELOW
      // perTransitionMagnitudeTop3PoolGiniSection AND IMMEDIATELY
      // ABOVE perTransitionMagnitudeTop3PoolTop1ShareSection per the
      // P11.171 formatter docblock placement rule so HHI, Gini, and
      // Theil sit adjacent as a whole-pool inequality trio (all three
      // answer "how equal is the pool?" with different mathematical
      // bases) and hierarchically ABOVE the leader-slice pair.
      // Consumes snapshotPerPairHotCells directly (same posture as
      // the sibling per-transition magnitude drill-down surfaces).
      snapshotPerTransitionMagnitudeTop3PoolTheil =
        computeDigestSnapshotPerTransitionMagnitudeTop3PoolTheil(
          snapshotPerPairHotCells,
        );
      perTransitionMagnitudeTop3PoolTheilSection =
        formatDigestSnapshotPerTransitionMagnitudeTop3PoolTheilSection(
          snapshotPerTransitionMagnitudeTop3PoolTheil,
        );
      // P11.174 — per-transition MAGNITUDE TOP-3 POOL ATKINSON (module
      // P11.173). Fourth distribution-shape complement to the P11.161
      // POOL SIZE surface, completing the whole-pool inequality QUARTET
      // that started with P11.163 HHI + P11.169 Gini + P11.171 Theil.
      // HHI squares shares (amplifies the leader), Gini integrates every
      // pair-wise gap (reflects the whole curve), Theil T decomposes as
      // an entropy divergence between the observed distribution and the
      // perfectly-uniform reference, and Atkinson A(epsilon=0.5) is a
      // welfare-loss / equally-distributed-equivalent view answering
      // "how much of the pool would we forgo to reach a perfectly equal
      // distribution?" via A(0.5) = 1 - (sum sqrt(s_i))^2 / n. Cells
      // that share an HHI + Gini + Theil label diverge on Atkinson when
      // the shape of the leader vs. shoulders shifts the welfare-loss
      // framing. Cutoffs mirror the income-literature bands
      // (HIGH_ATKINSON_MIN=0.15 / MODERATE_ATKINSON_MIN=0.05 / balanced
      // below) — narrower than Theil/Gini/HHI since A(0.5) sits in
      // [0, 1 - 1/n] which is compressed relative to Theil's [0, ln n]
      // and Gini's [0, 1]. Splices IMMEDIATELY BELOW
      // perTransitionMagnitudeTop3PoolTheilSection AND IMMEDIATELY
      // ABOVE perTransitionMagnitudeTop3PoolTop1ShareSection per the
      // P11.173 formatter docblock placement rule so HHI, Gini, Theil,
      // and Atkinson sit adjacent as a whole-pool inequality QUARTET
      // (all four answer "how equal is the pool?" with different
      // mathematical bases) and hierarchically ABOVE the leader-slice
      // pair. Consumes snapshotPerPairHotCells directly (same posture
      // as the sibling per-transition magnitude drill-down surfaces).
      snapshotPerTransitionMagnitudeTop3PoolAtkinson =
        computeDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinson(
          snapshotPerPairHotCells,
        );
      perTransitionMagnitudeTop3PoolAtkinsonSection =
        formatDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinsonSection(
          snapshotPerTransitionMagnitudeTop3PoolAtkinson,
        );
      // P11.176 — per-transition MAGNITUDE TOP-3 POOL COEFFICIENT OF
      // VARIATION (module P11.175). Fifth whole-pool inequality companion
      // after the P11.163 HHI + P11.169 Gini + P11.171 Theil + P11.173
      // Atkinson QUARTET, folding the P11.139 hot-cells envelope into
      // per-(transition, band) partner + KPI coefficient of variation
      // CV = σ / μ (population divisor n — the pool IS the population;
      // no sampling adjustment; matches the population framing carried
      // by the QUARTET so the QUINTET stays internally consistent
      // "same population, five lenses"). The QUARTET all fold shares
      // s_i = x_i / Σx through log / power / square / pair-wise
      // transforms of the FIRST moment (shares); CV captures the SECOND
      // moment dispersion (std / mean of the raw counts) — an orthogonal
      // lens no share-transform metric expresses directly. Cutoffs
      // mirror the regional-inequality CV literature (HIGH_CV_MIN=0.5 /
      // MODERATE_CV_MIN=0.2 / balanced below). Splices IMMEDIATELY
      // BELOW perTransitionMagnitudeTop3PoolAtkinsonSection AND
      // IMMEDIATELY ABOVE perTransitionMagnitudeTop3PoolTop1ShareSection
      // per the P11.175 formatter docblock placement rule so HHI, Gini,
      // Theil, Atkinson, and CV sit adjacent as a whole-pool inequality
      // QUINTET (all five answer "how equal is the pool?" with different
      // mathematical bases) and hierarchically ABOVE the leader-slice
      // pair. Consumes snapshotPerPairHotCells directly (same posture
      // as the sibling per-transition magnitude drill-down surfaces).
      snapshotPerTransitionMagnitudeTop3PoolCv =
        computeDigestSnapshotPerTransitionMagnitudeTop3PoolCv(
          snapshotPerPairHotCells,
        );
      perTransitionMagnitudeTop3PoolCvSection =
        formatDigestSnapshotPerTransitionMagnitudeTop3PoolCvSection(
          snapshotPerTransitionMagnitudeTop3PoolCv,
        );
      // P11.178 — per-transition MAGNITUDE TOP-3 POOL NORMALIZED SHANNON
      // ENTROPY (module P11.177). Sixth whole-pool distribution-shape
      // scalar over the P11.161 pool after the P11.163 HHI + P11.169 Gini
      // + P11.171 Theil + P11.173 Atkinson + P11.175 CV QUINTET, extending
      // the family to a SEXTET. This surface is the mathematical complement
      // of the P11.171 Theil surface under the closed-form identity
      // H_norm = 1 - T / ln(n) — the two carry the SAME information but
      // the human reading FLIPS: high Theil = high divergence from uniform
      // (inequality framing), high H_norm = high closeness to uniform
      // (Pielou evenness framing). Reporting both lets the digest surface
      // either lens (evenness or inequality) to a reader comfortable with
      // one scale but not the other, and acts as a self-consistency check
      // if the two ever drift. Cutoffs (HIGH_EVENNESS_MIN=0.9 /
      // MODERATE_EVENNESS_MIN=0.7 / unequal below) follow the Pielou-
      // evenness ecology anchor rather than the P11.171 Theil cutoffs
      // (0.30 / 0.10) or the P11.173 Atkinson cutoffs (0.15 / 0.05) or
      // the P11.175 CV cutoffs (0.5 / 0.2) since H_norm sits in [0, 1]
      // with a DIFFERENT band vocabulary (solo / uniform / mixed / unequal)
      // where "uniform" is the TOP band because a HIGH H_norm value means
      // LOW inequality — every distribution surface owns its own cutoffs
      // so downstream JSONL consumers render the label taxonomy without
      // importing the TS module. Splices IMMEDIATELY BELOW
      // perTransitionMagnitudeTop3PoolCvSection AND IMMEDIATELY ABOVE
      // perTransitionMagnitudeTop3PoolTop1ShareSection per the P11.177
      // formatter docblock placement rule so HHI, Gini, Theil, Atkinson,
      // CV, and H_norm sit adjacent as a whole-pool inequality SEXTET
      // (all six answer "how equal is the pool?" with different
      // mathematical bases — the four share-transform metrics fold
      // s_i = x_i/Σx through log / power / square / pair-wise transforms
      // of the FIRST moment, CV captures the SECOND-moment dispersion of
      // the raw counts, and H_norm folds the same first-moment shares as
      // Theil but under the complementary evenness framing rather than
      // the divergence framing) and hierarchically ABOVE the leader-slice
      // pair. Consumes snapshotPerPairHotCells directly (same posture as
      // the sibling per-transition magnitude drill-down surfaces).
      snapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy =
        computeDigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy(
          snapshotPerPairHotCells,
        );
      perTransitionMagnitudeTop3PoolNormalizedEntropySection =
        formatDigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropySection(
          snapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy,
        );
      // P11.166 — per-transition MAGNITUDE TOP-3 POOL TOP-1 SHARE
      // (module P11.165). Single-leader complement to the P11.163/P11.164
      // HHI whole-pool inequality surface. HHI folds the shape of the
      // WHOLE distribution into one scalar; the TOP-1 SHARE names ONE
      // THING — what fraction of the (transition, band) cells does the
      // single largest partner / KPI own? Together the four pool-scale
      // scalars triangulate the read: P11.161 pool_count (HOW MANY?),
      // P11.161 tail_share (WHAT SITS OUTSIDE TOP-3?), P11.163 HHI (HOW
      // EQUAL?), P11.165 top-1 share (HOW MUCH DOES THE LEADER OWN?).
      // Cutoffs use plain-language fraction bands (0.60 runaway / 0.40
      // leading / contested) — no external-anchor taxonomy since a
      // single share crossing 40/60 percent is directly readable.
      // Splices IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolHhiSection
      // AND IMMEDIATELY ABOVE perPairHotCellsSection per the P11.165
      // formatter docblock placement rule. Consumes snapshotPerPairHotCells
      // directly (same posture as the sibling per-transition magnitude
      // drill-down surfaces).
      snapshotPerTransitionMagnitudeTop3PoolTop1Share =
        computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Share(
          snapshotPerPairHotCells,
        );
      perTransitionMagnitudeTop3PoolTop1ShareSection =
        formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop1ShareSection(
          snapshotPerTransitionMagnitudeTop3PoolTop1Share,
        );
      // P11.168 — per-transition MAGNITUDE TOP-3 POOL TOP-2 COMBINED SHARE
      // (module P11.167). Two-leader complement to the P11.165/P11.166
      // single-leader (top-1) share surface. Where top-1 names how much
      // the single largest partner / KPI owns of the pool, this surface
      // names what fraction of the (transition, band) cells the two
      // largest participants own COMBINED — the oligopoly / duopoly
      // signal that disambiguates leader-plus-runner-up from
      // leader-plus-long-tail. Together the five pool-scale surfaces
      // triangulate the leadership shape: P11.161 pool_count (HOW MANY?),
      // P11.161 tail_share (WHAT SITS OUTSIDE TOP-3?), P11.163 HHI
      // (HOW EQUAL?), P11.165 top-1 share (SINGLE LEADER SLICE?),
      // P11.167 top-2 share (DOMINANT-PAIR COMBINED SLICE?). Cutoffs
      // use plain-language fraction bands (0.75 oligopoly / 0.50
      // leading / contested) — no external-anchor taxonomy since a
      // pair combined crossing 50/75 percent is directly readable.
      // Splices IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolTop1ShareSection
      // AND IMMEDIATELY ABOVE perPairHotCellsSection per the P11.167
      // formatter docblock placement rule. Consumes snapshotPerPairHotCells
      // directly (same posture as the sibling per-transition magnitude
      // drill-down surfaces).
      snapshotPerTransitionMagnitudeTop3PoolTop2Share =
        computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Share(
          snapshotPerPairHotCells,
        );
      perTransitionMagnitudeTop3PoolTop2ShareSection =
        formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop2ShareSection(
          snapshotPerTransitionMagnitudeTop3PoolTop2Share,
        );
      // P11.180 — per-transition MAGNITUDE TOP-3 POOL BOTTOM-1 SHARE
      // (module P11.179). Floor complement to the P11.165/P11.166 top-1
      // share surface. Where top-1 share names max(cells)/Σcells (the
      // fraction owned by the SINGLE LARGEST participant), bottom-1
      // share names min(cells)/Σcells (the fraction owned by the SINGLE
      // SMALLEST participant). Together the two surfaces bracket the
      // pool from both ends — top-1 says "who owns the pool?",
      // bottom-1 says "how thin is the tail?". Orthogonal to every
      // whole-pool SEXTET member (HHI/Gini/Theil/Atkinson/CV/H_norm
      // all fold the whole distribution to one scalar; bottom-1 names
      // ONE thing at the floor) and orthogonal to top-1 (which names
      // ONE thing at the head). LABEL ORIENTATION FLIP vs the P11.165
      // top-1 sibling: HIGH bottom-1 = HIGH floor = LOW long-tail
      // concentration = FLATTER pool (matches the P11.177 H_norm
      // evenness-framing orientation). Cutoffs 0.15 flat_floor / 0.05
      // moderate_floor / thin_tail exposed on the envelope as
      // flat_floor_min / moderate_floor_min so downstream JSONL
      // consumers render the vocabulary without importing the TS
      // module. Splices IMMEDIATELY BELOW
      // perTransitionMagnitudeTop3PoolTop2ShareSection AND IMMEDIATELY
      // ABOVE perPairHotCellsSection per the P11.179 formatter
      // docblock placement rule. Consumes snapshotPerPairHotCells
      // directly (same posture as the sibling per-transition magnitude
      // drill-down surfaces).
      snapshotPerTransitionMagnitudeTop3PoolBottom1Share =
        computeDigestSnapshotPerTransitionMagnitudeTop3PoolBottom1Share(
          snapshotPerPairHotCells,
        );
      perTransitionMagnitudeTop3PoolBottom1ShareSection =
        formatDigestSnapshotPerTransitionMagnitudeTop3PoolBottom1ShareSection(
          snapshotPerTransitionMagnitudeTop3PoolBottom1Share,
        );
      // P11.182 — per-transition MAGNITUDE TOP-3 POOL RANGE (module
      // P11.181). Head-to-floor SPREAD scalar over the P11.161 pool.
      // Folds the P11.165 top-1 share (max(cells)/Σcells) and the
      // P11.179 bottom-1 share (min(cells)/Σcells) into ONE per-
      // (transition,band) scalar naming the vertical distance from
      // leader to trailer: range = top1_share − bottom1_share
      // (computed from RAW cells before rounding so float drift on
      // the two rounded shares cannot inflate the range by one ulp).
      // Complements the whole-pool inequality SEXTET (HHI / Gini /
      // Theil / Atkinson / CV / H_norm) which fold ALL cells into one
      // scalar; range instead isolates the head-vs-floor delta. Two
      // cells with the same pool_count + same HHI can carry very
      // different ranges — e.g. pool [4,3,2] range 22.2% (moderate)
      // vs pool [6,1,1] range 62.5% (wide, clear leader towers over
      // the tail). LABEL ORIENTATION follows the inequality-framing
      // convention (HIGH range = HIGH spread = HIGH head-to-floor
      // inequality) matching HHI / Gini / Theil / Atkinson / CV;
      // inverts the P11.177 H_norm + P11.179 bottom-1 evenness
      // orientation because a spread reader wants "big number = big
      // gap". Cutoffs 0.20 compressed_range_max / 0.50 wide_range_min
      // exposed on the envelope so downstream JSONL consumers render
      // the solo / compressed / moderate / wide vocabulary without
      // importing the TS module. Splices IMMEDIATELY BELOW
      // perTransitionMagnitudeTop3PoolBottom1ShareSection AND
      // IMMEDIATELY ABOVE perPairHotCellsSection per the P11.181
      // formatter docblock placement rule so the pool hierarchy
      // descends whole-pool inequality SEXTET → leader slice (top-1)
      // → dominant-pair slice (top-2) → floor slice (bottom-1) →
      // head-to-floor SPREAD (this surface) → per-pair granular.
      // Consumes snapshotPerPairHotCells directly (same posture as
      // the sibling per-transition magnitude drill-down surfaces).
      snapshotPerTransitionMagnitudeTop3PoolRange =
        computeDigestSnapshotPerTransitionMagnitudeTop3PoolRange(
          snapshotPerPairHotCells,
        );
      perTransitionMagnitudeTop3PoolRangeSection =
        formatDigestSnapshotPerTransitionMagnitudeTop3PoolRangeSection(
          snapshotPerTransitionMagnitudeTop3PoolRange,
        );
      // P11.184 — per-transition MAGNITUDE TOP-3 POOL BOTTOM-2 COMBINED
      // SHARE (module P11.183). Two-trailer floor-slice complement to
      // the P11.167 TOP-2 combined share surface and floor-pair
      // companion to the P11.179 BOTTOM-1 single-trailer share. Where
      // top-2 answers "how much do the two largest COMBINED own?",
      // bottom-2 answers "how much do the two smallest COMBINED own?"
      // — two cells with identical bottom-1 shares can carry very
      // different bottom-2 combined shares depending on whether floor
      // participants cluster (short flat tail, high bottom-2) or the
      // second-smallest jumps toward the head (long thin tail with
      // just one trailer at the true floor, low bottom-2). LABEL
      // ORIENTATION FLIP vs the P11.167 top-2 sibling: HIGH bottom-2
      // = HIGH floor = LOW long-tail concentration = FLATTER pool,
      // matching the P11.177 H_norm + P11.179 bottom-1 evenness
      // framing because a bottom-K reader who cares about the tail
      // wants "big number = fat floor" for the direct human read.
      // Cutoffs 0.50 fat_floor_min / 0.25 moderate_floor_min exposed
      // on the envelope so downstream JSONL consumers render the
      // solo / fat_floor / moderate_floor / thin_tail vocabulary
      // without importing the TS module. Splices IMMEDIATELY BELOW
      // perTransitionMagnitudeTop3PoolRangeSection AND IMMEDIATELY
      // ABOVE perPairHotCellsSection per the P11.183 formatter
      // docblock placement rule so the pool hierarchy descends
      // whole-pool inequality SEXTET → leader slice (top-1) →
      // dominant-pair slice (top-2) → floor slice (bottom-1) →
      // head-to-floor SPREAD (range) → floor-pair slice (this
      // surface) → per-pair granular. Consumes snapshotPerPairHotCells
      // directly (same posture as the sibling per-transition
      // magnitude drill-down surfaces).
      snapshotPerTransitionMagnitudeTop3PoolBottom2Share =
        computeDigestSnapshotPerTransitionMagnitudeTop3PoolBottom2Share(
          snapshotPerPairHotCells,
        );
      perTransitionMagnitudeTop3PoolBottom2ShareSection =
        formatDigestSnapshotPerTransitionMagnitudeTop3PoolBottom2ShareSection(
          snapshotPerTransitionMagnitudeTop3PoolBottom2Share,
        );
      // P11.186 cron-wiring for the P11.185 pool top1/bottom1
      // multiplicative RATIO scalar. Palma-style scale-invariant
      // leader-to-floor ratio = top1_cells / bottom1_cells over the
      // P11.161 pool — MULTIPLICATIVE complement to the P11.181 RANGE
      // additive spread on the SAME head/floor pair. Well-defined for
      // every non-empty pool since the P11.139 hot-cells envelope
      // guarantees min(cell_counts) >= 1 so denominator is never zero.
      // Labels: solo (pool_count 1, ratio=1 by definition) / level
      // (<2x) / unequal (2-5x) / stark (>=5x). Cutoffs anchored at
      // natural small-pool values ([2,1]->2, [5,1,1]->5). LABEL
      // ORIENTATION follows inequality framing (HIGH ratio = HIGH
      // multiplicative gap; matches HHI/Gini/Theil/Atkinson/CV/range;
      // inverts H_norm/bottom-1/bottom-2 evenness framing) because a
      // ratio reader wants "big number = big gap" for the direct human
      // read. Cutoffs 2 level_ratio_max / 5 stark_ratio_min exposed on
      // the envelope so downstream JSONL consumers render the vocabulary
      // without importing the TS module. Splices IMMEDIATELY BELOW
      // perTransitionMagnitudeTop3PoolBottom2ShareSection AND IMMEDIATELY
      // ABOVE perPairHotCellsSection per the P11.185 formatter docblock
      // placement rule so the pool hierarchy descends whole-pool
      // inequality SEXTET → leader slice (top-1) → dominant-pair slice
      // (top-2) → floor slice (bottom-1) → head-to-floor SPREAD (range)
      // → floor-pair slice (bottom-2) → top1/bottom1 RATIO (this
      // surface) → per-pair granular. Consumes snapshotPerPairHotCells
      // directly (same posture as the sibling per-transition magnitude
      // drill-down surfaces).
      snapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio =
        computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio(
          snapshotPerPairHotCells,
        );
      perTransitionMagnitudeTop3PoolTop1Bottom1RatioSection =
        formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1RatioSection(
          snapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio,
        );
      // P11.188 cron-wiring for the P11.187 pool top2/bottom2
      // multiplicative RATIO scalar. Two-slot complement to the P11.185
      // top1/bottom1 single-slot ratio — folds top2_cells / bottom2_cells
      // over the P11.161 pool. Because the pair fold sums each endpoint,
      // ratios compress vs the single-slot lens: pool [10,5,5] reads 1.5
      // (level) here but 2 (unequal) under P11.185 — the load-bearing
      // disagreement where the lone leader is 2x the trailer but the
      // top-2 combined matches the bottom-2 combined. Well-defined for
      // every non-empty pool since the P11.139 hot-cells envelope
      // guarantees min(cell_counts) >= 1 so denominator is never zero;
      // pool_count <= 2 -> ratio 1 by definition (both slots exhaust the
      // pool). Labels solo (pool_count <= 2) / level (<2x) / unequal
      // (2-5x) / stark (>=5x); cutoffs re-use P11.185's 2x/5x pair so a
      // downstream consumer can diff the two surfaces without
      // re-anchoring the label vocabulary. Cutoffs 2 level_ratio_max /
      // 5 stark_ratio_min exposed on the envelope so downstream JSONL
      // consumers render the vocabulary without importing the TS module.
      // Splices IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolTop1Bottom1RatioSection
      // AND IMMEDIATELY ABOVE perPairHotCellsSection per the P11.187
      // formatter docblock placement rule so the pool hierarchy descends
      // whole-pool inequality SEXTET -> leader slice (top-1) ->
      // dominant-pair slice (top-2) -> floor slice (bottom-1) ->
      // head-to-floor SPREAD (range) -> floor-pair slice (bottom-2) ->
      // top1/bottom1 RATIO -> top2/bottom2 RATIO (this surface) ->
      // per-pair granular. Consumes snapshotPerPairHotCells directly
      // (same posture as the sibling per-transition magnitude drill-down
      // surfaces).
      snapshotPerTransitionMagnitudeTop3PoolTop2Bottom2Ratio =
        computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom2Ratio(
          snapshotPerPairHotCells,
        );
      perTransitionMagnitudeTop3PoolTop2Bottom2RatioSection =
        formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom2RatioSection(
          snapshotPerTransitionMagnitudeTop3PoolTop2Bottom2Ratio,
        );
      // P11.190 cron-wiring for the P11.189 pool mid-mass share scalar.
      // Middle-mass evenness slice = (pool_cells − top1 − bottom1) /
      // pool_cells over the P11.161 pool — the mass the P11.165 TOP-1
      // and P11.179 BOTTOM-1 shares DO NOT touch. Companion to the
      // P11.181 RANGE (additive head/floor spread) and P11.185
      // TOP-1/BOTTOM-1 RATIO (multiplicative head/floor gap): all three
      // fold the same two extremes but mid-mass names the LEFTOVER.
      // Self-verifying identity top1_share + mid_mass_share +
      // bottom1_share = 1 for pool_count >= 2. Labels solo (pool_count
      // <= 2) / thin (mid<20%) / moderate (20-40%) / fat (>=40%);
      // cutoffs anchored to natural 3-4 partner pool shapes. EVENNESS
      // framing (HIGH mid = HIGH middle mass) matching P11.177 /
      // P11.179 / P11.183. Splices IMMEDIATELY BELOW
      // perTransitionMagnitudeTop3PoolTop2Bottom2RatioSection AND
      // IMMEDIATELY ABOVE perPairHotCellsSection per the P11.189
      // formatter docblock so the pool hierarchy descends whole-pool
      // SEXTET → leader → dominant-pair → floor → range → floor-pair →
      // top1/bottom1 RATIO → top2/bottom2 RATIO → mid-mass share (this)
      // → per-pair granular. Consumes snapshotPerPairHotCells directly.
      snapshotPerTransitionMagnitudeTop3PoolMidMassShare =
        computeDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShare(
          snapshotPerPairHotCells,
        );
      perTransitionMagnitudeTop3PoolMidMassShareSection =
        formatDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShareSection(
          snapshotPerTransitionMagnitudeTop3PoolMidMassShare,
        );
      // P11.192 cron-wiring for the P11.191 pool top1/bottom2 ratio.
      // ASYMMETRIC single-leader-to-floor-pair MULTIPLICATIVE scalar =
      // top1_cells / bottom2_cells over the P11.161 pool where
      // bottom2_cells sums the two smallest slot counts. Distinct
      // reading from the SYMMETRIC P11.185 (top1/bottom1) and P11.187
      // (top2/bottom2) surfaces because the denominator SUMS two slots
      // — a flat pool [1,1,1] reads 0.5 (leader HALF the floor-pair
      // combined) rather than 1, and a [4,3,2] reads 0.8 (LEVEL) even
      // though P11.185 reads 4/2=2 UNEQUAL on the same pool. Labels
      // solo (pool_count <= 2) / level (ratio < 1.5) / unequal (>= 1.5)
      // / stark (>= 4); cutoffs anchored to [3,1,1]=1.5 and [8,1,1]=4
      // small-pool inflection points. Inequality framing (HIGH ratio =
      // HIGH multiplicative dominance) matching P11.163 / P11.169 /
      // P11.171 / P11.173 / P11.175 / P11.181 / P11.185 / P11.187.
      // Splices IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolMidMassShareSection
      // AND IMMEDIATELY ABOVE perPairHotCellsSection per the P11.191
      // formatter docblock so the pool hierarchy descends whole-pool
      // SEXTET → leader → dominant-pair → floor → range → floor-pair →
      // top1/bottom1 RATIO → top2/bottom2 RATIO → mid-mass share →
      // top1/bottom2 RATIO (this) → per-pair granular. Consumes
      // snapshotPerPairHotCells directly.
      snapshotPerTransitionMagnitudeTop3PoolTop1Bottom2Ratio =
        computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom2Ratio(
          snapshotPerPairHotCells,
        );
      perTransitionMagnitudeTop3PoolTop1Bottom2RatioSection =
        formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom2RatioSection(
          snapshotPerTransitionMagnitudeTop3PoolTop1Bottom2Ratio,
        );
      // P11.194 cron-wiring for the P11.193 pool top2/bottom1 ratio.
      // MIRROR-ASYMMETRIC dominant-pair-to-floor-slot MULTIPLICATIVE
      // scalar = top2_cells / bottom1_cells over the P11.161 pool.
      // Completes the (top_k, bottom_k) 2x2 ratio grid alongside
      // P11.185 (1v1), P11.187 (2v2), P11.191 (1v2). Numerator SUMS
      // two slots so magnitudes INFLATE vs P11.185 by ~2x on peaky
      // [k,1,1] pools (e.g. [4,3,2] reads 7/2=3.5 unequal vs P11.187's
      // 1.4 LEVEL). Ratio >= 1 by construction for pool_count >= 3.
      // Labels solo (pool_count <= 2) / level (ratio < 3) / unequal
      // (>= 3) / stark (>= 8); cutoffs anchored to [2,1,1]=3 and
      // [7,1,1]=8 and exactly double P11.185 to match the 2-slot
      // numerator inflation. Inequality framing (HIGH ratio = HIGH
      // multiplicative dominance) matching P11.185 / P11.187.
      // Splices IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolTop1Bottom2RatioSection
      // AND IMMEDIATELY ABOVE perPairHotCellsSection per the P11.193
      // formatter docblock so the pool hierarchy descends whole-pool
      // SEXTET → leader → dominant-pair → floor → range → floor-pair →
      // top1/bottom1 RATIO → top2/bottom2 RATIO → mid-mass share →
      // top1/bottom2 RATIO → top2/bottom1 RATIO (this) → per-pair
      // granular. Consumes snapshotPerPairHotCells directly.
      snapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio =
        computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio(
          snapshotPerPairHotCells,
        );
      perTransitionMagnitudeTop3PoolTop2Bottom1RatioSection =
        formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1RatioSection(
          snapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio,
        );
      // P11.196 cron-wiring for the P11.195 pool median/mean ratio.
      // Robust-stats ORDER-STATISTIC ASYMMETRY scalar = median_cells /
      // mean_cells over the P11.161 pool. Pearson second skewness shape
      // without stdev normalisation — names WHERE the middle of the
      // distribution sits relative to the mean, complementing the SEXTET
      // (whole-pool inequality/entropy), share family (endpoint slices),
      // range (additive endpoint spread), 2x2 ratio grid (multiplicative
      // endpoint ratios) and mid-mass share (middle-mass evenness) by
      // reading the pool from an entirely new angle: order-statistic
      // asymmetry. Values in (0, 1] for right-skewed distributions;
      // above 1 possible for left-skewed pools like [10,10,1] which
      // reads 10/7 ≈ 1.43. Well-defined for every non-empty pool:
      // pool_count 0 → ratio null; pool_count <= SOLO_MAX_POOL_COUNT
      // (2) → ratio 1 by definition (median coincides with mean); pool_count
      // >= 3 → ratio = median / mean, rounded to 4 decimals. Labels
      // solo (pool_count <= 2) / symmetric (ratio >= 0.9) / skewed
      // (0.5 <= ratio < 0.9) / peaked (ratio < 0.5); cutoffs anchored
      // to [3,2,2]=0.857 (skewed edge) and [10,1,1]=0.25 (peaked).
      // EVENNESS framing (HIGH ratio = HIGH middle-mean alignment =
      // more symmetric distribution) — the ONLY pool-shape scalar
      // where a HIGH value reads as LOW asymmetry, distinct from the
      // inequality framing of every other pool-shape sibling.
      // Splices IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolTop2Bottom1RatioSection
      // AND IMMEDIATELY ABOVE perPairHotCellsSection per the P11.195
      // formatter docblock so the pool hierarchy descends whole-pool
      // SEXTET → leader → dominant-pair → floor → range → floor-pair →
      // top1/bottom1 RATIO → top2/bottom2 RATIO → mid-mass share →
      // top1/bottom2 RATIO → top2/bottom1 RATIO → median/mean RATIO
      // (this) → per-pair granular. Consumes snapshotPerPairHotCells
      // directly.
      snapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio =
        computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio(
          snapshotPerPairHotCells,
        );
      perTransitionMagnitudeTop3PoolMedianMeanRatioSection =
        formatDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatioSection(
          snapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio,
        );
      // P11.198 cron-wiring for the P11.197 pool mean-median absolute gap.
      // ADDITIVE order-statistic asymmetry scalar =
      // |mean_cells - median_cells| over the P11.161 pool. Additive
      // companion to the P11.195 MULTIPLICATIVE median/mean ratio; the
      // (multiplicative, additive) split on the mean-vs-median pair
      // mirrors the existing (P11.181 additive, P11.185 multiplicative)
      // split on the max-vs-min endpoint pair, extending additive+multiplicative
      // parity from the endpoint slice to the order-statistic center.
      // Direction-agnostic magnitude (right-skew and left-skew pools
      // both read positive; direction recoverable from P11.195 ratio).
      // Well-defined for every non-empty pool: pool_count 0 → gap null;
      // pool_count <= SOLO_MAX_POOL_COUNT (2) → gap 0 by definition
      // (median coincides with mean); pool_count >= 3 →
      // gap = |mean - median|, rounded to 4 decimals. Labels
      // solo (pool_count <= 2) / balanced (gap < 0.5) / leaning
      // (0.5 <= gap < 2.0) / lopsided (gap >= 2.0); cutoffs anchored
      // to [3,1,1]=0.667 (leaning edge) and [10,1,1]=3 (lopsided).
      // INEQUALITY framing (HIGH gap = MORE asymmetric = LESS balanced)
      // matching P11.181 range and every other magnitude-of-asymmetry
      // sibling, inverting the P11.195 evenness framing.
      // Splices IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolMedianMeanRatioSection
      // AND IMMEDIATELY ABOVE perPairHotCellsSection per the P11.197
      // formatter docblock so the pool hierarchy descends whole-pool
      // SEXTET → leader → dominant-pair → floor → range → floor-pair →
      // top1/bottom1 RATIO → top2/bottom2 RATIO → mid-mass share →
      // top1/bottom2 RATIO → top2/bottom1 RATIO → median/mean RATIO →
      // mean-median ABSOLUTE GAP (this) → per-pair granular.
      // Consumes snapshotPerPairHotCells directly.
      snapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap =
        computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap(
          snapshotPerPairHotCells,
        );
      perTransitionMagnitudeTop3PoolMeanMedianAbsoluteGapSection =
        formatDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGapSection(
          snapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap,
        );
      // P11.200 — ADDITIVE + WHOLE-POOL dispersion fold over the
      // P11.161 top-3 pool. Fills the last unfilled corner of the
      // (additive/multiplicative, endpoint/whole-pool) 2x2 dispersion
      // grid: P11.175 CV = multiplicative + whole-pool (std/mean);
      // P11.181 range = additive + endpoint-only (max - min); this
      // surface = additive + whole-pool via
      //   mad = (1 / pool_count) * SUM_i |cell_i - mean_cells|
      // in raw cell-count units. Two pools [3,1] and [30,10] both
      // read CV 0.5 but differ under MAD (1 vs 10) — magnitude in
      // the reader's units. Pools [10,10,10,5,1,1,1] and
      // [10,5,5,5,5,5,1] both read range 9 but MAD ~3.43 vs ~1.71
      // — MAD folds the interior shape range ignores. Unlike the
      // P11.197 mean-median gap which folds only two center-of-mass
      // summaries, MAD folds every pool cell into the same additive
      // axis. Direction-agnostic (right-skew and left-skew both
      // magnitude) matching P11.181 range. Well-defined for every
      // non-empty pool: pool_count 0 → mad null; pool_count 1 →
      // mad 0 by definition (solo — single cell coincides with its
      // own mean); pool_count >= 2 → mad = mean absolute deviation
      // from mean, rounded to 4 decimals — including a GENUINE
      // dispersion read at pool_count 2 (pool [3,1] reads mad 1)
      // unlike P11.197 where pool_count 2 collapses skewness.
      // Labels solo (pool_count <= 1) / tight (mad < 0.5) /
      // spread (0.5 <= mad < 2.0) / wide (mad >= 2.0); cutoffs
      // anchored to [4,3,2]=0.667 (spread edge) and [10,1,1]=4
      // (wide). INEQUALITY framing (HIGH mad = MORE dispersion =
      // MORE inequality) matching P11.175 CV / P11.181 range and
      // every other magnitude-of-dispersion sibling.
      // Splices IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolMeanMedianAbsoluteGapSection
      // AND IMMEDIATELY ABOVE perPairHotCellsSection per the P11.199
      // formatter docblock so the pool hierarchy descends whole-pool
      // SEXTET → leader → dominant-pair → floor → range → floor-pair →
      // top1/bottom1 RATIO → top2/bottom2 RATIO → mid-mass share →
      // top1/bottom2 RATIO → top2/bottom1 RATIO → median/mean RATIO →
      // mean-median ABSOLUTE GAP → mean ABSOLUTE DEVIATION (this) →
      // per-pair granular.
      // Consumes snapshotPerPairHotCells directly.
      snapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation =
        computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation(
          snapshotPerPairHotCells,
        );
      perTransitionMagnitudeTop3PoolMeanAbsoluteDeviationSection =
        formatDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviationSection(
          snapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation,
        );
      // P11.202 — ROBUST cousin of the P11.200 mean-anchored MAD.
      // Same ADDITIVE + WHOLE-POOL corner of the dispersion grid,
      // same 0.5 / 2.0 solo/tight/spread/wide cutoffs, same units
      // (raw cell-count deviations). Anchor swap: mean → median so
      // the scalar cushions against the single-leader distortion
      // that pulls MAD toward the outlier. Pool [3,1,1] reads MAD
      // 8/9 (mean 5/3 pulls into the outlier) but MADm 2/3 (median
      // 1 tracks the cluster). Pool [10,1,1] reads MAD 4 but MADm
      // 3 — robust anchor cushions by exactly one unit. Symmetric
      // pools where mean coincides with median (e.g. [4,3,2]) read
      // the same magnitude under both surfaces — the differentiator
      // is only skew-driven. Well-defined for every non-empty pool:
      // pool_count 0 → madm null; pool_count 1 → madm 0 (solo);
      // pool_count >= 2 → madm = mean of absolute deviations from
      // median, rounded to 4 decimals. Even-n pools use midpoint
      // of the two central order statistics for parity with the
      // P11.195/P11.197 median convention.
      // Splices IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolMeanAbsoluteDeviationSection
      // AND IMMEDIATELY ABOVE perPairHotCellsSection per the P11.201
      // formatter docblock so MAD (mean-anchored) and MADm (median-
      // anchored) stay adjacent in the pool hierarchy.
      // Consumes snapshotPerPairHotCells directly.
      snapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation =
        computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation(
          snapshotPerPairHotCells,
        );
      perTransitionMagnitudeTop3PoolMedianAbsoluteDeviationSection =
        formatDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviationSection(
          snapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation,
        );
      // P11.204 — DIRECT anchor-free ASYMMETRY read over the P11.161
      // pool. Fisher-Pearson standardised third-moment coefficient
      // g1 = m3 / m2^(3/2) folds every pool cell into ONE SIGNED
      // asymmetry scalar. Opens the ASYMMETRY axis of the pool-shape
      // family (companion to the SIZE / CONCENTRATION / DISPERSION
      // axes already covered by P11.161..P11.202). Every existing
      // asymmetry proxy encodes skew INDIRECTLY — the P11.195
      // median/mean ratio and P11.197 mean-median absolute gap
      // contrast two centre-of-mass summaries; the P11.199/P11.201
      // MAD-vs-MADm pair contrasts anchor-swap dispersion reads.
      // Skewness is the DIRECT measurement: positive = right-tail
      // heavy (leader inflates mean above median), negative =
      // left-tail heavy (laggard drags mean below median), near
      // zero = symmetric. Uses POPULATION moments (divide by n,
      // not n-1) for continuity across pool_count boundaries and
      // parity with the P11.199/P11.201 population-average
      // convention. Pool [10,1,1] and [3,1,1] both read g1 = +1/√2
      // ≈ +0.7071 (right_leaning); pool [10,10,1] reads g1 = -1/√2
      // (left_leaning); every mean-symmetric pool ([1,1,1], [4,3,2],
      // [3,2,1], [3,1]) reads exactly 0. Solo pool_count 1 pinned
      // to 0 (structurally symmetric); flat pools (variance 0)
      // pinned to 0 (no asymmetry axis to measure) rather than
      // divide-by-zero. Splices IMMEDIATELY BELOW
      // perTransitionMagnitudeTop3PoolMedianAbsoluteDeviationSection
      // AND IMMEDIATELY ABOVE perPairHotCellsSection per the P11.203
      // formatter docblock so ASYMMETRY sits IMMEDIATELY BELOW the
      // anchor-swap MAD/MADm dispersion pair — natural adjacency
      // since the anchor-swap pair reveals asymmetry INDIRECTLY by
      // contrast, this surface reveals it DIRECTLY by sign.
      // Consumes snapshotPerPairHotCells directly.
      snapshotPerTransitionMagnitudeTop3PoolSkewness =
        computeDigestSnapshotPerTransitionMagnitudeTop3PoolSkewness(
          snapshotPerPairHotCells,
        );
      perTransitionMagnitudeTop3PoolSkewnessSection =
        formatDigestSnapshotPerTransitionMagnitudeTop3PoolSkewnessSection(
          snapshotPerTransitionMagnitudeTop3PoolSkewness,
        );
      // P11.206 tail-heaviness cron wiring — DIRECT anchor-free
      // fourth-moment read on the P11.161 pool (Fisher-Pearson
      // standardised g2 in EXCESS form g2 = m4/m2^2 - 3 using
      // POPULATION moments; normal reference reads zero). Positive
      // g2 = heavy tails (leptokurtic — mass in extremes + centre
      // with light shoulders, single-outlier pools with pool_count
      // ≥ 5 sit here), negative g2 = light tails (platykurtic —
      // two-point symmetric pools hit the -2 floor exactly),
      // zero g2 = mesokurtic like a normal. Completes the classic
      // (g1, g2) higher-moment shape descriptor pair opened by
      // P11.203 skewness — asymmetry first, tail-heaviness second
      // per intro-stats presentation order. Splices IMMEDIATELY
      // BELOW perTransitionMagnitudeTop3PoolSkewnessSection AND
      // IMMEDIATELY ABOVE perPairHotCellsSection per the P11.205
      // formatter docblock so the (g1, g2) pair stays adjacent in
      // the digest hierarchy. Consumes snapshotPerPairHotCells
      // directly.
      snapshotPerTransitionMagnitudeTop3PoolExcessKurtosis =
        computeDigestSnapshotPerTransitionMagnitudeTop3PoolExcessKurtosis(
          snapshotPerPairHotCells,
        );
      perTransitionMagnitudeTop3PoolExcessKurtosisSection =
        formatDigestSnapshotPerTransitionMagnitudeTop3PoolExcessKurtosisSection(
          snapshotPerTransitionMagnitudeTop3PoolExcessKurtosis,
        );
      // P11.208 interquartile-range cron wiring — ADDITIVE robust-stats
      // INTERIOR-MASS dispersion scalar on the P11.161 pool (iqr =
      // Q3 - Q1 using Tukey EXCLUSIVE hinges in raw cell-count units;
      // pool_count < 4 emits a small_pool null so the surface is
      // distinct from the P11.181 endpoint-only range). Fills the
      // ADDITIVE + INTERIOR-MASS corner of the dispersion grid alongside
      // the multiplicative CV (P11.175), endpoint-only range (P11.181),
      // whole-pool mean-anchored MAD (P11.199), and whole-pool
      // median-anchored MADm (P11.201) — the reader now has an
      // outlier-robust interior-mass read that sandwiches the
      // endpoint-only range extreme. Splices IMMEDIATELY BELOW
      // perTransitionMagnitudeTop3PoolExcessKurtosisSection AND
      // IMMEDIATELY ABOVE perPairHotCellsSection per the P11.207
      // formatter docblock so IQR closes the dispersion axis after
      // the higher-moment (g1, g2) pair has named the pool's shape.
      // Consumes snapshotPerPairHotCells directly.
      snapshotPerTransitionMagnitudeTop3PoolIqr =
        computeDigestSnapshotPerTransitionMagnitudeTop3PoolIqr(
          snapshotPerPairHotCells,
        );
      perTransitionMagnitudeTop3PoolIqrSection =
        formatDigestSnapshotPerTransitionMagnitudeTop3PoolIqrSection(
          snapshotPerTransitionMagnitudeTop3PoolIqr,
        );
      // P11.210 interquartile-ratio cron wiring — MULTIPLICATIVE
      // robust-stats INTERIOR-MASS dispersion scalar on the P11.161
      // pool (iqr_ratio = Q3 / Q1 using Tukey EXCLUSIVE hinges;
      // pool_count < 4 emits a small_pool null so the surface is
      // distinct from the P11.185 top1/bottom1 endpoint-only
      // multiplicative ratio). Closes the (additive, multiplicative)
      // x (endpoint, interior, whole-pool) dispersion grid opened by
      // P11.207 IQR — the MULTIPLICATIVE + INTERIOR-MASS corner sits
      // alongside CV (multiplicative whole-pool), range (additive
      // endpoint-only), top1/bottom1 ratio (multiplicative
      // endpoint-only), MAD/MADm (additive whole-pool) and IQR
      // (additive interior-only). Splices IMMEDIATELY BELOW
      // perTransitionMagnitudeTop3PoolIqrSection AND IMMEDIATELY
      // ABOVE perPairHotCellsSection per the P11.209 formatter
      // docblock so IQR + IQR RATIO share the same Q1/Q3 hinge pair
      // and sit adjacent — reader spots the additive-vs-multiplicative
      // contrast on the same interior mass in one glance. Consumes
      // snapshotPerPairHotCells directly.
      snapshotPerTransitionMagnitudeTop3PoolIqrRatio =
        computeDigestSnapshotPerTransitionMagnitudeTop3PoolIqrRatio(
          snapshotPerPairHotCells,
        );
      perTransitionMagnitudeTop3PoolIqrRatioSection =
        formatDigestSnapshotPerTransitionMagnitudeTop3PoolIqrRatioSection(
          snapshotPerTransitionMagnitudeTop3PoolIqrRatio,
        );
      // P11.212 quartile-coefficient-of-dispersion cron wiring —
      // BOUNDED robust-stats INTERIOR-MASS dispersion scalar on the
      // P11.161 pool (qcd = (Q3 - Q1) / (Q3 + Q1) using Tukey EXCLUSIVE
      // hinges; pool_count < 4 emits a small_pool null so the surface is
      // distinct from the P11.185 top1/bottom1 endpoint-only bounded
      // multiplicative ratio). Closes the (unbounded, bounded) x
      // (endpoint, interior, whole-pool) normalisation grid on the
      // multiplicative dispersion axis opened by P11.209 IQR RATIO —
      // the BOUNDED + INTERIOR-MASS corner was the only remaining
      // unfilled cell after P11.207 IQR (additive interior-only) +
      // P11.209 IQR RATIO (unbounded multiplicative interior-only) took
      // the two neighbouring cells. Splices IMMEDIATELY BELOW
      // perTransitionMagnitudeTop3PoolIqrRatioSection AND IMMEDIATELY
      // ABOVE perPairHotCellsSection per the P11.211 formatter docblock
      // so IQR + IQR RATIO + QCD share the same Q1/Q3 hinge pair and
      // sit adjacent — reader spots the raw-additive vs raw-multiplicative
      // vs normalised-multiplicative interior dispersion contrast on
      // the same interior mass in one glance. Consumes
      // snapshotPerPairHotCells directly.
      snapshotPerTransitionMagnitudeTop3PoolQcd =
        computeDigestSnapshotPerTransitionMagnitudeTop3PoolQcd(
          snapshotPerPairHotCells,
        );
      perTransitionMagnitudeTop3PoolQcdSection =
        formatDigestSnapshotPerTransitionMagnitudeTop3PoolQcdSection(
          snapshotPerTransitionMagnitudeTop3PoolQcd,
        );
      // P11.214 coefficient-of-range cron wiring — BOUNDED ENDPOINT
      // dispersion scalar on the P11.161 pool (cor = (max - min) /
      // (max + min) — Yule 1911 classroom coefficient of range,
      // identical to the Michelson-contrast scalar; pool_count < 2
      // emits a small_pool null so a single-point pool cannot
      // false-positive as level via max == min). Closes the LAST
      // unfilled cell of the (unbounded, bounded) x (endpoint, interior,
      // whole-pool) dispersion grid — BOUNDED + ENDPOINT was the only
      // remaining hole after P11.211 QCD (BOUNDED + INTERIOR),
      // P11.181 range (UNBOUNDED + ADDITIVE ENDPOINT), P11.185
      // top1/bot1 ratio (UNBOUNDED + MULTIPLICATIVE ENDPOINT), P11.207
      // IQR (UNBOUNDED + ADDITIVE INTERIOR), P11.209 IQR RATIO
      // (UNBOUNDED + MULTIPLICATIVE INTERIOR), P11.199 MAD +
      // P11.201 MADm (UNBOUNDED + ADDITIVE WHOLE-POOL). Splices
      // IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolQcdSection
      // AND IMMEDIATELY ABOVE perPairHotCellsSection per the P11.213
      // formatter docblock so the two BOUNDED siblings (COR endpoint
      // / QCD interior) sit adjacent — reader spots the
      // endpoint-vs-interior BOUNDED dispersion contrast in one
      // glance. SAME 0.2 / 0.5 anchors as P11.211 QCD so the two
      // bounded scalars share a common label vocabulary; anchors map
      // to raw top1/bot1 ratios via the closed-form
      // r = (1+cor)/(1-cor) (cor 0.2 <-> r 1.5x, cor 0.5 <-> r 3.0x).
      // Consumes snapshotPerPairHotCells directly.
      snapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange =
        computeDigestSnapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange(
          snapshotPerPairHotCells,
        );
      perTransitionMagnitudeTop3PoolCoefficientOfRangeSection =
        formatDigestSnapshotPerTransitionMagnitudeTop3PoolCoefficientOfRangeSection(
          snapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange,
        );
      // P11.216 bowley-skewness cron wiring — BOUNDED INTERIOR-MASS
      // asymmetry scalar on the P11.161 pool (bs = (Q3 + Q1 - 2*Q2) /
      // (Q3 - Q1) using Tukey EXCLUSIVE hinges; pool_count < 4 emits a
      // small_pool null so the surface is distinct from the P11.181
      // range / P11.185 top1/bot1 / P11.213 COR endpoint surfaces, and
      // Q3 == Q1 emits a distinct degenerate label so structural
      // indeterminacy is not confused with a measured symmetric verdict).
      // Opens the BOUNDED INTERIOR-MASS asymmetry axis and pairs on the
      // ASYMMETRY axis with the P11.203 whole-pool skewness (unbounded
      // Fisher-Pearson g1) the same way P11.211 QCD + P11.213 COR pair
      // on the DISPERSION axis — read side-by-side to distinguish
      // "asymmetry driven by interior distribution" (both non-zero)
      // from "asymmetry driven by a tail outlier" (g1 non-zero, bs ~0).
      // Splices IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolCoefficientOfRangeSection
      // AND IMMEDIATELY ABOVE perPairHotCellsSection per the P11.215
      // formatter docblock so the two BOUNDED siblings (COR endpoint
      // dispersion / Bowley interior asymmetry) sit adjacent — reader
      // spots the endpoint-vs-interior contrast on both DISPERSION and
      // ASYMMETRY axes in one visual scan. Cutoffs 0.1 / 0.3 are the
      // classroom Bowley thresholds (Kendall & Stuart §2.20) —
      // deliberately tighter than the P11.203 |g1| 0.5 edge because
      // Bowley's [-1, +1] codomain makes 0.5 an extreme value.
      // Consumes snapshotPerPairHotCells directly.
      snapshotPerTransitionMagnitudeTop3PoolBowleySkewness =
        computeDigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewness(
          snapshotPerPairHotCells,
        );
      perTransitionMagnitudeTop3PoolBowleySkewnessSection =
        formatDigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewnessSection(
          snapshotPerTransitionMagnitudeTop3PoolBowleySkewness,
        );
      // P11.218 moors-kurtosis cron wiring — OCTILE-BASED ROBUST
      // INTERIOR-MASS TAIL-WEIGHT scalar on the P11.161 pool
      // (moors = ((E7-E5)+(E3-E1))/(E6-E2) using R type-7 linear
      // interpolation over the seven octiles; pool_count < 8 emits a
      // small_pool null so the surface is distinct from the P11.181
      // range / P11.185 top1/bot1 / P11.213 COR endpoint surfaces, and
      // E6 == E2 emits a distinct degenerate label so structural
      // indeterminacy is not confused with a measured mesokurtic
      // verdict). Opens the OCTILE-BASED ROBUST INTERIOR-MASS TAIL-WEIGHT
      // axis and pairs on the TAIL-WEIGHT axis with the P11.205
      // whole-pool excess-kurtosis (unbounded Fisher-Pearson g2) the same
      // way P11.215 Bowley + P11.203 skewness pair on the ASYMMETRY axis
      // and P11.211 QCD + P11.213 COR pair on the DISPERSION axis — read
      // side-by-side to distinguish "tail-weight driven by interior
      // distribution" (both non-zero) from "tail-weight driven by a tail
      // outlier" (g2 non-zero, moors degenerate). Splices IMMEDIATELY
      // BELOW perTransitionMagnitudeTop3PoolBowleySkewnessSection AND
      // IMMEDIATELY ABOVE perPairHotCellsSection per the P11.217
      // formatter docblock so the (Bowley robust asymmetry, Moors robust
      // tail-weight) octile pair sits adjacent — the reader scans them
      // together as the (g1, g2) → (bowley, moors) higher-moment shape
      // descriptor pair lifted onto the octile-robust surface. Cutoffs
      // 0.2 / 0.5 around the normal reference 1.2330 are the classroom
      // Moors thresholds (Moors 1988 §3) — anchored on the excess-Moors
      // deviation (subtract 1.2330 so mesokurtic reads zero, mirroring
      // the P11.205 "subtract 3" excess-kurtosis convention). Consumes
      // snapshotPerPairHotCells directly.
      snapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis =
        computeDigestSnapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis(
          snapshotPerPairHotCells,
        );
      perTransitionMagnitudeTop3PoolMoorsKurtosisSection =
        formatDigestSnapshotPerTransitionMagnitudeTop3PoolMoorsKurtosisSection(
          snapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis,
        );
    }
  }
  if (
    topMoversSection ||
    topMoversPerMetricSection ||
    topMoversPerResellerSection ||
    directionStreakCoverageSection ||
    perMetricDirectionStreakCoverageSection ||
    directionStreaksSection ||
    directionStreakLengthHistogramSection ||
    directionStreakLengthPercentilesSection ||
    perResellerDirectionStreakCoverageSection ||
    directionStreakLeaderboardSection ||
    perMetricDirectionStreakLeaderboardSection ||
    perResellerDirectionStreakLeaderboardSection ||
    perResellerDirectionStreakLengthHistogramSection ||
    perResellerDirectionStreakLengthPercentilesSection ||
    perResellerDirectionStreaksSection ||
    pctChangeStreakCoverageSection ||
    perMetricPctChangeStreakCoverageSection ||
    pctChangeStreaksSection ||
    pctChangeStreakLengthHistogramSection ||
    pctChangeStreakLengthPercentilesSection ||
    perResellerPctChangeStreakCoverageSection ||
    pctChangeStreakLeaderboardSection ||
    perMetricPctChangeStreakLeaderboardSection ||
    perResellerPctChangeStreakLeaderboardSection ||
    perResellerPctChangeStreakLengthHistogramSection ||
    perResellerPctChangeStreakLengthPercentilesSection ||
    perResellerPctChangeStreaksSection ||
    perMetricDirectionStreakLengthHistogramSection ||
    perMetricDirectionStreakLengthPercentilesSection ||
    perMetricPctChangeStreakLengthHistogramSection ||
    perMetricPctChangeStreakLengthPercentilesSection ||
    perMetricPersistenceScorecardSection ||
    perMetricPersistenceScorecardVerdictSection ||
    perMetricPersistenceScorecardVerdictTransitionSection ||
    perMetricPersistenceScorecardVerdictTransitionDistributionSection ||
    perResellerPersistenceScorecardSection ||
    perResellerMetricPersistenceScorecardSection ||
    perResellerMetricPersistenceScorecardVerdictSection ||
    perResellerMetricPersistenceScorecardVerdictTransitionSection ||
    perResellerMetricPersistenceScorecardVerdictTransitionDistributionSection ||
    perResellerCrossMetricAlertsSection ||
    perMetricCrossPartnerAlertsSection ||
    perPairHotCellsSummarySection ||
    perTransitionHotCellsDrilldownSection ||
    perTransitionMagnitudeDrilldownSection ||
    perTransitionMagnitudeLeaderboardSection ||
    perTransitionMagnitudeTop3LeaderboardSection ||
    perTransitionMagnitudeTop3ConcentrationSection ||
    perTransitionMagnitudeTop3TieCountSection ||
    perTransitionMagnitudeTop3RunnerUpGapSection ||
    perTransitionMagnitudeTop3TailGapSection ||
    perTransitionMagnitudeTop3MiddleGapSection ||
    perTransitionMagnitudeTop3PoolSection ||
    perTransitionMagnitudeTop3PoolHhiSection ||
    perTransitionMagnitudeTop3PoolGiniSection ||
    perTransitionMagnitudeTop3PoolTheilSection ||
    perTransitionMagnitudeTop3PoolAtkinsonSection ||
    perTransitionMagnitudeTop3PoolCvSection ||
    perTransitionMagnitudeTop3PoolNormalizedEntropySection ||
    perTransitionMagnitudeTop3PoolTop1ShareSection ||
    perTransitionMagnitudeTop3PoolTop2ShareSection ||
    perTransitionMagnitudeTop3PoolBottom1ShareSection ||
    perTransitionMagnitudeTop3PoolRangeSection ||
    perTransitionMagnitudeTop3PoolBottom2ShareSection ||
    perTransitionMagnitudeTop3PoolTop1Bottom1RatioSection ||
    perTransitionMagnitudeTop3PoolTop2Bottom2RatioSection ||
    perTransitionMagnitudeTop3PoolMidMassShareSection ||
    perTransitionMagnitudeTop3PoolTop1Bottom2RatioSection ||
    perTransitionMagnitudeTop3PoolTop2Bottom1RatioSection ||
    perTransitionMagnitudeTop3PoolMedianMeanRatioSection ||
    perTransitionMagnitudeTop3PoolMeanMedianAbsoluteGapSection ||
    perTransitionMagnitudeTop3PoolMeanAbsoluteDeviationSection ||
    perTransitionMagnitudeTop3PoolMedianAbsoluteDeviationSection ||
    perTransitionMagnitudeTop3PoolSkewnessSection ||
    perTransitionMagnitudeTop3PoolExcessKurtosisSection ||
    perTransitionMagnitudeTop3PoolIqrSection ||
    perTransitionMagnitudeTop3PoolIqrRatioSection ||
    perTransitionMagnitudeTop3PoolQcdSection ||
    perTransitionMagnitudeTop3PoolCoefficientOfRangeSection ||
    perTransitionMagnitudeTop3PoolBowleySkewnessSection ||
    perTransitionMagnitudeTop3PoolMoorsKurtosisSection ||
    perPairHotCellsSection ||
    perResellerPersistenceScorecardVerdictSection ||
    perResellerPersistenceScorecardVerdictTransitionSection ||
    perResellerPersistenceScorecardVerdictTransitionDistributionSection ||
    persistenceScorecardSection ||
    persistenceScorecardVerdictSection ||
    persistenceScorecardVerdictTransitionSection ||
    persistenceScorecardVerdictTransitionDistributionSection ||
    persistenceScorecardVerdictTransitionDistributionFamilyAlertsSection
  ) {
    // Splice all executive-summary sections above the fold, in the order
    // P11.24 (portfolio |delta|) → P11.26 (per-metric spotlight) → P11.28
    // (per-reseller spotlight) → P11.30 (portfolio sustained-direction
    // streaks) → P11.32 (per-reseller sustained-direction streaks) so the
    // biggest single shift lands first, the per-metric coverage table rounds
    // out any metric whose mover was buried by unit-scale dominance, the
    // per-reseller spotlight guarantees every partner with any material shift
    // gets at least one row regardless of whether they lead a metric group
    // globally, the portfolio direction-streak table surfaces the persistence
    // angle the three |delta|-magnitude sections above it may bury, and the
    // per-reseller streak drill-down names the specific partner behind each
    // portfolio streak (and — critically — surfaces counter-balanced patterns
    // invisible to the portfolio streak table above it when partner slides
    // and gains cancel each other week-over-week).
    const rest = html.slice(digestHeader.length);
    html =
      digestHeader +
      topMoversSection +
      topMoversPerMetricSection +
      topMoversPerResellerSection +
      directionStreakCoverageSection +
      perMetricDirectionStreakCoverageSection +
      directionStreaksSection +
      directionStreakLengthHistogramSection +
      directionStreakLengthPercentilesSection +
      perResellerDirectionStreakCoverageSection +
      directionStreakLeaderboardSection +
      perMetricDirectionStreakLeaderboardSection +
      perMetricDirectionStreakLengthHistogramSection +
      perMetricDirectionStreakLengthPercentilesSection +
      perResellerDirectionStreakLeaderboardSection +
      perResellerDirectionStreakLengthHistogramSection +
      perResellerDirectionStreakLengthPercentilesSection +
      perResellerDirectionStreaksSection +
      pctChangeStreakCoverageSection +
      perMetricPctChangeStreakCoverageSection +
      pctChangeStreaksSection +
      pctChangeStreakLengthHistogramSection +
      pctChangeStreakLengthPercentilesSection +
      persistenceScorecardSection +
      persistenceScorecardVerdictSection +
      persistenceScorecardVerdictTransitionSection +
      persistenceScorecardVerdictTransitionDistributionFamilyAlertsSection +
      persistenceScorecardVerdictTransitionDistributionSection +
      perResellerPctChangeStreakCoverageSection +
      pctChangeStreakLeaderboardSection +
      perMetricPctChangeStreakLeaderboardSection +
      perMetricPctChangeStreakLengthHistogramSection +
      perMetricPctChangeStreakLengthPercentilesSection +
      perMetricPersistenceScorecardSection +
      perMetricPersistenceScorecardVerdictSection +
      perMetricPersistenceScorecardVerdictTransitionSection +
      perMetricPersistenceScorecardVerdictTransitionDistributionSection +
      perResellerPctChangeStreakLeaderboardSection +
      perResellerPctChangeStreakLengthHistogramSection +
      perResellerPctChangeStreakLengthPercentilesSection +
      perResellerPersistenceScorecardSection +
      perResellerMetricPersistenceScorecardSection +
      perResellerMetricPersistenceScorecardVerdictSection +
      perResellerMetricPersistenceScorecardVerdictTransitionSection +
      perResellerCrossMetricAlertsSection +
      perMetricCrossPartnerAlertsSection +
      perPairHotCellsSummarySection +
      perTransitionHotCellsDrilldownSection +
      perTransitionMagnitudeDrilldownSection +
      perTransitionMagnitudeLeaderboardSection +
      perTransitionMagnitudeTop3LeaderboardSection +
      perTransitionMagnitudeTop3ConcentrationSection +
      perTransitionMagnitudeTop3TieCountSection +
      perTransitionMagnitudeTop3RunnerUpGapSection +
      perTransitionMagnitudeTop3TailGapSection +
      perTransitionMagnitudeTop3MiddleGapSection +
      perTransitionMagnitudeTop3PoolSection +
      perTransitionMagnitudeTop3PoolHhiSection +
      perTransitionMagnitudeTop3PoolGiniSection +
      perTransitionMagnitudeTop3PoolTheilSection +
      perTransitionMagnitudeTop3PoolAtkinsonSection +
      perTransitionMagnitudeTop3PoolCvSection +
      perTransitionMagnitudeTop3PoolNormalizedEntropySection +
      perTransitionMagnitudeTop3PoolTop1ShareSection +
      perTransitionMagnitudeTop3PoolTop2ShareSection +
      perTransitionMagnitudeTop3PoolBottom1ShareSection +
      perTransitionMagnitudeTop3PoolRangeSection +
      perTransitionMagnitudeTop3PoolBottom2ShareSection +
      perTransitionMagnitudeTop3PoolTop1Bottom1RatioSection +
      perTransitionMagnitudeTop3PoolTop2Bottom2RatioSection +
      perTransitionMagnitudeTop3PoolMidMassShareSection +
      perTransitionMagnitudeTop3PoolTop1Bottom2RatioSection +
      perTransitionMagnitudeTop3PoolTop2Bottom1RatioSection +
      perTransitionMagnitudeTop3PoolMedianMeanRatioSection +
      perTransitionMagnitudeTop3PoolMeanMedianAbsoluteGapSection +
      perTransitionMagnitudeTop3PoolMeanAbsoluteDeviationSection +
      perTransitionMagnitudeTop3PoolMedianAbsoluteDeviationSection +
      perTransitionMagnitudeTop3PoolSkewnessSection +
      perTransitionMagnitudeTop3PoolExcessKurtosisSection +
      perTransitionMagnitudeTop3PoolIqrSection +
      perTransitionMagnitudeTop3PoolIqrRatioSection +
      perTransitionMagnitudeTop3PoolQcdSection +
      perTransitionMagnitudeTop3PoolCoefficientOfRangeSection +
      perTransitionMagnitudeTop3PoolBowleySkewnessSection +
      perTransitionMagnitudeTop3PoolMoorsKurtosisSection +
      perPairHotCellsSection +
      perResellerMetricPersistenceScorecardVerdictTransitionDistributionSection +
      perResellerPersistenceScorecardVerdictSection +
      perResellerPersistenceScorecardVerdictTransitionSection +
      perResellerPersistenceScorecardVerdictTransitionDistributionSection +
      perResellerPctChangeStreaksSection +
      rest;
  }

  let emailed = false;
  if (!skipEmail && digestRows.length > 0) {
    const result = await sendEmail({
      to: ADMIN_EMAIL,
      subject: `[BlockID] Reseller weekly leading-signal digest — ${week} (${digestRows.length} reseller${digestRows.length === 1 ? "" : "s"})`,
      html,
      attachments: [
        {
          filename: `reseller-weekly-digest-${week}.csv`,
          content: Buffer.from(csv, "utf8"),
          contentType: "text/csv",
        },
      ],
    }).catch((e) => {
      console.error("[reseller-weekly-digest] email failed", e);
      return { ok: false, id: "" } as const;
    });
    emailed = Boolean((result as { ok?: boolean }).ok);
  }

  const body = {
    ok: true,
    week,
    reseller_count: digestRows.length,
    rows: digestRows.map((r) => ({
      reseller_id: r.reseller_id,
      reseller_code: r.reseller_code,
      attributed_total: r.summary.attributed_total,
      inactive_7d: r.summary.inactive_7d,
      inactive_30d: r.summary.inactive_30d,
      activated_first_report: r.summary.activated_first_report,
      activated_first_report_pct: r.summary.activated_first_report_pct,
      median_days_to_first_report: r.summary.median_days_to_first_report,
    })),
    emailed,
    anomalies: anomalySummary
      ? {
          actor_hotspot_count: anomalySummary.actor_hotspots.length,
          subject_hotspot_count: anomalySummary.subject_hotspots.length,
          total_rows_in_window: anomalySummary.total_rows_in_window,
          threshold: anomalySummary.threshold,
          window_start: anomalySummary.window_start,
          window_end: anomalySummary.window_end,
        }
      : { skipped_reason: "audit_log_query_failed" },
    human_blocked: {
      count: HUMAN_BLOCKED_ITEMS.length,
      ids: HUMAN_BLOCKED_ITEMS.map((i) => i.id),
    },
    budget_utilization: budgetSkippedReason
      ? { skipped_reason: budgetSkippedReason }
      : {
          month_key: currentMonthKey,
          reseller_count: budgetRows.length,
          rows: budgetRows.map((r) => ({
            reseller_id: r.reseller_id,
            reseller_code: r.reseller_code,
            grant_used: r.utilization.grant_used,
            grant_budget: r.utilization.grant_budget,
            grant_pct: r.utilization.grant_pct,
            sandbox_used: r.utilization.sandbox_used,
            sandbox_cap: r.utilization.sandbox_cap,
            sandbox_pct: r.utilization.sandbox_pct,
          })),
        },
    tier_mix: tierMixSkippedReason
      ? { skipped_reason: tierMixSkippedReason }
      : {
          reseller_count: tierMixRows.length,
          rows: tierMixRows.map((r) => ({
            reseller_id: r.reseller_id,
            reseller_code: r.reseller_code,
            tier_0: r.mix.counts[0],
            tier_10: r.mix.counts[10],
            tier_20: r.mix.counts[20],
            tier_30: r.mix.counts[30],
            tier_40: r.mix.counts[40],
            none: r.mix.none,
            total: r.mix.total,
          })),
        },
    commission_cleared_mtd: clearedMtdSkippedReason
      ? { skipped_reason: clearedMtdSkippedReason }
      : {
          month_key: clearedMonthKey,
          reseller_count: clearedMtdRows.length,
          rows: clearedMtdRows.map((r) => ({
            reseller_id: r.reseller_id,
            reseller_code: r.reseller_code,
            cleared_count: r.mtd.cleared_count,
            cleared_cents: r.mtd.cleared_cents,
          })),
        },
    clawback_exposure: clawbackSkippedReason
      ? { skipped_reason: clawbackSkippedReason }
      : {
          reseller_count: clawbackRows.length,
          rows: clawbackRows.map((r) => ({
            reseller_id: r.reseller_id,
            reseller_code: r.reseller_code,
            pending_count: r.exposure.pending_count,
            pending_cents: r.exposure.pending_cents,
            dispute_count: r.exposure.dispute_count,
            dispute_cents: r.exposure.dispute_cents,
            total_count: r.exposure.total_count,
            total_cents: r.exposure.total_cents,
          })),
        },
    attributed_mrr: mrrSkippedReason
      ? { skipped_reason: mrrSkippedReason }
      : {
          reseller_count: mrrRows.length,
          rows: mrrRows.map((r) => ({
            reseller_id: r.reseller_id,
            reseller_code: r.reseller_code,
            active_subs: r.mrr.active_subs,
            mrr_cents: r.mrr.mrr_cents,
            arr_cents: r.mrr.mrr_cents * 12,
          })),
        },
    attributed_churn_30d: churnSkippedReason
      ? { skipped_reason: churnSkippedReason }
      : {
          window_days: 30,
          reseller_count: churnRows.length,
          rows: churnRows.map((r) => ({
            reseller_id: r.reseller_id,
            reseller_code: r.reseller_code,
            attributed_total: r.churn.attributed_total,
            canceled_count: r.churn.canceled_count,
            trial_ended_count: r.churn.trial_ended_count,
            churned_count: r.churn.churned_count,
            churn_pct: r.churn.churn_pct,
          })),
        },
    ledger_drift_events: driftSkippedReason
      ? { skipped_reason: driftSkippedReason }
      : {
          window_days: LEDGER_DRIFT_WINDOW_DAYS,
          reseller_count: driftRows.length,
          rows: driftRows.map((r) => ({
            reseller_id: r.reseller_id,
            reseller_code: r.reseller_code,
            missing_commission_count: r.drift.missing_commission_count,
            orphan_commission_count: r.drift.orphan_commission_count,
            total_drift_count: r.drift.total_drift_count,
          })),
        },
    attributed_net_contribution: netContributionSkippedReason
      ? { skipped_reason: netContributionSkippedReason }
      : {
          month_key: currentMonthKey,
          reseller_count: netContributionRows.length,
          rows: netContributionRows.map((r) => ({
            reseller_id: r.reseller_id,
            reseller_code: r.reseller_code,
            revenue_cents: r.net.revenue_cents,
            commission_cost_cents: r.net.commission_cost_cents,
            credit_cogs_cents: r.net.credit_cogs_cents,
            net_contribution_cents: r.net.net_contribution_cents,
          })),
        },
    contribution_margin_pct: contributionMarginSkippedReason
      ? { skipped_reason: contributionMarginSkippedReason }
      : {
          month_key: currentMonthKey,
          reseller_count: contributionMargins?.reseller_count ?? 0,
          portfolio_revenue_cents:
            contributionMargins?.portfolio_revenue_cents ?? 0,
          portfolio_net_cents: contributionMargins?.portfolio_net_cents ?? 0,
          portfolio_margin_pct:
            contributionMargins?.portfolio_margin_pct ?? null,
          rows: (contributionMargins?.rows ?? []).map((r) => ({
            reseller_id: r.reseller_id,
            reseller_code: r.reseller_code,
            revenue_cents: r.revenue_cents,
            net_contribution_cents: r.net_contribution_cents,
            margin_pct: r.margin_pct,
          })),
        },
    gst_reconciliation_delta: gstDeltaSkippedReason
      ? { skipped_reason: gstDeltaSkippedReason }
      : {
          month_key: currentMonthKey,
          reseller_count: gstDeltaRows.length,
          rows: gstDeltaRows.map((r) => ({
            reseller_id: r.reseller_id,
            reseller_code: r.reseller_code,
            positive_count: r.delta.positive_count,
            positive_gst_cents: r.delta.positive_gst_cents,
            reversal_count: r.delta.reversal_count,
            reversal_gst_cents: r.delta.reversal_gst_cents,
            net_gst_cents: r.delta.net_gst_cents,
          })),
        },
    cohort_velocity: {
      window_months: COHORT_MONTHS_WINDOW,
      cohort_months: cohortMonths,
      reseller_count: cohortVelocityRows.length,
      rows: cohortVelocityRows.map((r) => ({
        reseller_id: r.reseller_id,
        reseller_code: r.reseller_code,
        cohorts: r.cohorts.map((c) => ({
          cohort_month: c.cohort_month,
          attributed_count: c.attributed_count,
          activated_count: c.activated_count,
          activation_pct: c.activation_pct,
          median_days_to_activation: c.median_days_to_activation,
        })),
      })),
    },
    ltv_cac_per_reseller: ltvCacSkippedReason
      ? { skipped_reason: ltvCacSkippedReason }
      : {
          reseller_count: ltvCacRows.length,
          rows: ltvCacRows.map((r) => ({
            reseller_id: r.reseller_id,
            reseller_code: r.reseller_code,
            attributed_customers: r.ltv_cac.attributed_customers,
            lifetime_revenue_cents: r.ltv_cac.lifetime_revenue_cents,
            cumulative_cleared_commission_cents:
              r.ltv_cac.cumulative_cleared_commission_cents,
            ltv_per_customer_cents: r.ltv_cac.ltv_per_customer_cents,
            cac_per_customer_cents: r.ltv_cac.cac_per_customer_cents,
            ltv_cac_ratio_hundredths: r.ltv_cac.ltv_cac_ratio_hundredths,
          })),
        },
    sandbox_share_of_budget: budgetSkippedReason
      ? { skipped_reason: budgetSkippedReason }
      : {
          month_key: currentMonthKey,
          reseller_count: sandboxShareRows.length,
          rows: sandboxShareRows.map((r) => ({
            reseller_id: r.reseller_id,
            reseller_code: r.reseller_code,
            sandbox_credits_used: r.share.sandbox_credits_used,
            grant_credits_used: r.share.grant_credits_used,
            total_credits_used: r.share.total_credits_used,
            monthly_credit_budget: r.share.monthly_credit_budget,
            share_of_consumption_pct: r.share.share_of_consumption_pct,
            share_of_budget_pct: r.share.share_of_budget_pct,
          })),
        },
    snapshot_delta: snapshotDelta
      ? {
          previous_captured_at: snapshotDelta.previous_captured_at,
          previous_week: snapshotDelta.previous_week,
          current_captured_at: snapshotDelta.current_captured_at,
          current_week: snapshotDelta.current_week,
          previous_reseller_count: snapshotDelta.previous_reseller_count,
          current_reseller_count: snapshotDelta.current_reseller_count,
          reseller_count_delta: snapshotDelta.reseller_count_delta,
          sections: snapshotDelta.sections,
        }
      : {
          skipped_reason:
            previousSnapshotSkipReason ?? "no_previous_snapshot",
        },
    snapshot_metric_delta: snapshotMetricDelta
      ? {
          previous_captured_at: snapshotMetricDelta.previous_captured_at,
          previous_week: snapshotMetricDelta.previous_week,
          current_captured_at: snapshotMetricDelta.current_captured_at,
          current_week: snapshotMetricDelta.current_week,
          metrics: snapshotMetricDelta.metrics,
        }
      : {
          skipped_reason:
            previousSnapshotSkipReason ?? "no_previous_snapshot",
        },
    snapshot_metric_pct_change: snapshotMetricPctChange
      ? {
          previous_captured_at: snapshotMetricPctChange.previous_captured_at,
          previous_week: snapshotMetricPctChange.previous_week,
          current_captured_at: snapshotMetricPctChange.current_captured_at,
          current_week: snapshotMetricPctChange.current_week,
          metrics: snapshotMetricPctChange.metrics,
        }
      : {
          skipped_reason:
            previousSnapshotSkipReason ?? "no_previous_snapshot",
        },
    snapshot_per_reseller_delta: snapshotPerResellerDelta
      ? {
          previous_captured_at: snapshotPerResellerDelta.previous_captured_at,
          previous_week: snapshotPerResellerDelta.previous_week,
          current_captured_at: snapshotPerResellerDelta.current_captured_at,
          current_week: snapshotPerResellerDelta.current_week,
          rows: snapshotPerResellerDelta.rows,
        }
      : {
          skipped_reason:
            previousSnapshotSkipReason ?? "no_previous_snapshot",
        },
    snapshot_rolling_trend: snapshotRollingTrend
      ? {
          window_size: snapshotRollingTrend.window_size,
          first_week: snapshotRollingTrend.first_week,
          last_week: snapshotRollingTrend.last_week,
          metrics: snapshotRollingTrend.metrics,
        }
      : {
          skipped_reason:
            previousSnapshotSkipReason ?? "no_previous_snapshot",
        },
    snapshot_per_reseller_rolling_trend: snapshotPerResellerRollingTrend
      ? {
          window_size: snapshotPerResellerRollingTrend.window_size,
          first_week: snapshotPerResellerRollingTrend.first_week,
          last_week: snapshotPerResellerRollingTrend.last_week,
          rows: snapshotPerResellerRollingTrend.rows,
        }
      : {
          skipped_reason:
            previousSnapshotSkipReason ?? "no_previous_snapshot",
        },
    snapshot_per_reseller_metric_pct_change:
      snapshotPerResellerMetricPctChange
        ? {
            window_size: snapshotPerResellerMetricPctChange.window_size,
            first_week: snapshotPerResellerMetricPctChange.first_week,
            last_week: snapshotPerResellerMetricPctChange.last_week,
            top_n: snapshotPerResellerMetricPctChange.top_n,
            threshold: snapshotPerResellerMetricPctChange.threshold,
            rows: snapshotPerResellerMetricPctChange.rows,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_reseller_metric_pct_change_per_metric:
      snapshotPerResellerMetricPctChangePerMetric
        ? {
            window_size:
              snapshotPerResellerMetricPctChangePerMetric.window_size,
            first_week:
              snapshotPerResellerMetricPctChangePerMetric.first_week,
            last_week:
              snapshotPerResellerMetricPctChangePerMetric.last_week,
            top_n_per_metric:
              snapshotPerResellerMetricPctChangePerMetric.top_n_per_metric,
            threshold:
              snapshotPerResellerMetricPctChangePerMetric.threshold,
            rows: snapshotPerResellerMetricPctChangePerMetric.rows,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_reseller_metric_pct_change_coverage:
      snapshotPerResellerMetricPctChangeCoverage
        ? {
            window_size:
              snapshotPerResellerMetricPctChangeCoverage.window_size,
            first_week:
              snapshotPerResellerMetricPctChangeCoverage.first_week,
            last_week:
              snapshotPerResellerMetricPctChangeCoverage.last_week,
            threshold: snapshotPerResellerMetricPctChangeCoverage.threshold,
            rows: snapshotPerResellerMetricPctChangeCoverage.rows,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_reseller_pct_change_coverage:
      snapshotPerResellerPctChangeCoverage
        ? {
            window_size: snapshotPerResellerPctChangeCoverage.window_size,
            first_week: snapshotPerResellerPctChangeCoverage.first_week,
            last_week: snapshotPerResellerPctChangeCoverage.last_week,
            threshold: snapshotPerResellerPctChangeCoverage.threshold,
            rows: snapshotPerResellerPctChangeCoverage.rows,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_reseller_metric_pct_change_per_reseller:
      snapshotPerResellerMetricPctChangePerReseller
        ? {
            window_size:
              snapshotPerResellerMetricPctChangePerReseller.window_size,
            first_week:
              snapshotPerResellerMetricPctChangePerReseller.first_week,
            last_week:
              snapshotPerResellerMetricPctChangePerReseller.last_week,
            top_n_per_reseller:
              snapshotPerResellerMetricPctChangePerReseller.top_n_per_reseller,
            threshold:
              snapshotPerResellerMetricPctChangePerReseller.threshold,
            rows: snapshotPerResellerMetricPctChangePerReseller.rows,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_top_movers: snapshotTopMovers
      ? {
          window_size: snapshotTopMovers.window_size,
          first_week: snapshotTopMovers.first_week,
          last_week: snapshotTopMovers.last_week,
          top_n: snapshotTopMovers.top_n,
          rows: snapshotTopMovers.rows,
        }
      : {
          skipped_reason:
            previousSnapshotSkipReason ?? "no_previous_snapshot",
        },
    snapshot_top_movers_per_metric: snapshotTopMoversPerMetric
      ? {
          window_size: snapshotTopMoversPerMetric.window_size,
          first_week: snapshotTopMoversPerMetric.first_week,
          last_week: snapshotTopMoversPerMetric.last_week,
          top_n_per_metric: snapshotTopMoversPerMetric.top_n_per_metric,
          rows: snapshotTopMoversPerMetric.rows,
        }
      : {
          skipped_reason:
            previousSnapshotSkipReason ?? "no_previous_snapshot",
        },
    snapshot_top_movers_per_reseller: snapshotTopMoversPerReseller
      ? {
          window_size: snapshotTopMoversPerReseller.window_size,
          first_week: snapshotTopMoversPerReseller.first_week,
          last_week: snapshotTopMoversPerReseller.last_week,
          top_n_per_reseller: snapshotTopMoversPerReseller.top_n_per_reseller,
          rows: snapshotTopMoversPerReseller.rows,
        }
      : {
          skipped_reason:
            previousSnapshotSkipReason ?? "no_previous_snapshot",
        },
    snapshot_direction_streaks: snapshotDirectionStreaks
      ? {
          window_size: snapshotDirectionStreaks.window_size,
          first_week: snapshotDirectionStreaks.first_week,
          last_week: snapshotDirectionStreaks.last_week,
          min_streak_length: snapshotDirectionStreaks.min_streak_length,
          rows: snapshotDirectionStreaks.rows,
        }
      : {
          skipped_reason:
            previousSnapshotSkipReason ?? "no_previous_snapshot",
        },
    snapshot_per_reseller_direction_streaks:
      snapshotPerResellerDirectionStreaks
        ? {
            window_size: snapshotPerResellerDirectionStreaks.window_size,
            first_week: snapshotPerResellerDirectionStreaks.first_week,
            last_week: snapshotPerResellerDirectionStreaks.last_week,
            min_streak_length:
              snapshotPerResellerDirectionStreaks.min_streak_length,
            rows: snapshotPerResellerDirectionStreaks.rows,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_pct_change_streaks: snapshotPctChangeStreaks
      ? {
          window_size: snapshotPctChangeStreaks.window_size,
          first_week: snapshotPctChangeStreaks.first_week,
          last_week: snapshotPctChangeStreaks.last_week,
          min_streak_length: snapshotPctChangeStreaks.min_streak_length,
          threshold: snapshotPctChangeStreaks.threshold,
          rows: snapshotPctChangeStreaks.rows,
        }
      : {
          skipped_reason:
            previousSnapshotSkipReason ?? "no_previous_snapshot",
        },
    snapshot_per_reseller_pct_change_streaks:
      snapshotPerResellerPctChangeStreaks
        ? {
            window_size: snapshotPerResellerPctChangeStreaks.window_size,
            first_week: snapshotPerResellerPctChangeStreaks.first_week,
            last_week: snapshotPerResellerPctChangeStreaks.last_week,
            min_streak_length:
              snapshotPerResellerPctChangeStreaks.min_streak_length,
            threshold: snapshotPerResellerPctChangeStreaks.threshold,
            rows: snapshotPerResellerPctChangeStreaks.rows,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_pct_change_streak_coverage: snapshotPctChangeStreakCoverage
      ? {
          window_size: snapshotPctChangeStreakCoverage.window_size,
          first_week: snapshotPctChangeStreakCoverage.first_week,
          last_week: snapshotPctChangeStreakCoverage.last_week,
          min_streak_length: snapshotPctChangeStreakCoverage.min_streak_length,
          threshold: snapshotPctChangeStreakCoverage.threshold,
          total_metrics: snapshotPctChangeStreakCoverage.total_metrics,
          metrics_with_streak:
            snapshotPctChangeStreakCoverage.metrics_with_streak,
          coverage_rate_pct: snapshotPctChangeStreakCoverage.coverage_rate_pct,
          min_length: snapshotPctChangeStreakCoverage.min_length,
          max_length: snapshotPctChangeStreakCoverage.max_length,
          median_length: snapshotPctChangeStreakCoverage.median_length,
        }
      : {
          skipped_reason:
            previousSnapshotSkipReason ?? "no_previous_snapshot",
        },
    snapshot_per_reseller_pct_change_streak_coverage:
      snapshotPerResellerPctChangeStreakCoverage
        ? {
            window_size:
              snapshotPerResellerPctChangeStreakCoverage.window_size,
            first_week: snapshotPerResellerPctChangeStreakCoverage.first_week,
            last_week: snapshotPerResellerPctChangeStreakCoverage.last_week,
            min_streak_length:
              snapshotPerResellerPctChangeStreakCoverage.min_streak_length,
            threshold: snapshotPerResellerPctChangeStreakCoverage.threshold,
            rows: snapshotPerResellerPctChangeStreakCoverage.rows,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_direction_streak_coverage: snapshotDirectionStreakCoverage
      ? {
          window_size: snapshotDirectionStreakCoverage.window_size,
          first_week: snapshotDirectionStreakCoverage.first_week,
          last_week: snapshotDirectionStreakCoverage.last_week,
          min_streak_length: snapshotDirectionStreakCoverage.min_streak_length,
          total_metrics: snapshotDirectionStreakCoverage.total_metrics,
          metrics_with_streak:
            snapshotDirectionStreakCoverage.metrics_with_streak,
          metrics_up_streak: snapshotDirectionStreakCoverage.metrics_up_streak,
          metrics_down_streak:
            snapshotDirectionStreakCoverage.metrics_down_streak,
          coverage_rate_pct: snapshotDirectionStreakCoverage.coverage_rate_pct,
          up_coverage_rate_pct:
            snapshotDirectionStreakCoverage.up_coverage_rate_pct,
          down_coverage_rate_pct:
            snapshotDirectionStreakCoverage.down_coverage_rate_pct,
          min_length: snapshotDirectionStreakCoverage.min_length,
          max_length: snapshotDirectionStreakCoverage.max_length,
          median_length: snapshotDirectionStreakCoverage.median_length,
        }
      : {
          skipped_reason:
            previousSnapshotSkipReason ?? "no_previous_snapshot",
        },
    snapshot_per_reseller_direction_streak_coverage:
      snapshotPerResellerDirectionStreakCoverage
        ? {
            window_size:
              snapshotPerResellerDirectionStreakCoverage.window_size,
            first_week:
              snapshotPerResellerDirectionStreakCoverage.first_week,
            last_week: snapshotPerResellerDirectionStreakCoverage.last_week,
            min_streak_length:
              snapshotPerResellerDirectionStreakCoverage.min_streak_length,
            rows: snapshotPerResellerDirectionStreakCoverage.rows,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_metric_direction_streak_coverage:
      snapshotPerMetricDirectionStreakCoverage
        ? {
            window_size: snapshotPerMetricDirectionStreakCoverage.window_size,
            first_week: snapshotPerMetricDirectionStreakCoverage.first_week,
            last_week: snapshotPerMetricDirectionStreakCoverage.last_week,
            min_streak_length:
              snapshotPerMetricDirectionStreakCoverage.min_streak_length,
            rows: snapshotPerMetricDirectionStreakCoverage.rows,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_metric_pct_change_streak_coverage:
      snapshotPerMetricPctChangeStreakCoverage
        ? {
            window_size: snapshotPerMetricPctChangeStreakCoverage.window_size,
            first_week: snapshotPerMetricPctChangeStreakCoverage.first_week,
            last_week: snapshotPerMetricPctChangeStreakCoverage.last_week,
            min_streak_length:
              snapshotPerMetricPctChangeStreakCoverage.min_streak_length,
            threshold: snapshotPerMetricPctChangeStreakCoverage.threshold,
            rows: snapshotPerMetricPctChangeStreakCoverage.rows,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_direction_streak_leaderboard:
      snapshotDirectionStreakLeaderboard
        ? {
            window_size: snapshotDirectionStreakLeaderboard.window_size,
            first_week: snapshotDirectionStreakLeaderboard.first_week,
            last_week: snapshotDirectionStreakLeaderboard.last_week,
            min_streak_length:
              snapshotDirectionStreakLeaderboard.min_streak_length,
            top_n: snapshotDirectionStreakLeaderboard.top_n,
            total_qualified:
              snapshotDirectionStreakLeaderboard.total_qualified,
            rows: snapshotDirectionStreakLeaderboard.rows,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_pct_change_streak_leaderboard:
      snapshotPctChangeStreakLeaderboard
        ? {
            window_size: snapshotPctChangeStreakLeaderboard.window_size,
            first_week: snapshotPctChangeStreakLeaderboard.first_week,
            last_week: snapshotPctChangeStreakLeaderboard.last_week,
            min_streak_length:
              snapshotPctChangeStreakLeaderboard.min_streak_length,
            threshold: snapshotPctChangeStreakLeaderboard.threshold,
            top_n: snapshotPctChangeStreakLeaderboard.top_n,
            total_qualified:
              snapshotPctChangeStreakLeaderboard.total_qualified,
            rows: snapshotPctChangeStreakLeaderboard.rows,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_metric_direction_streak_leaderboard:
      snapshotPerMetricDirectionStreakLeaderboard
        ? {
            window_size:
              snapshotPerMetricDirectionStreakLeaderboard.window_size,
            first_week:
              snapshotPerMetricDirectionStreakLeaderboard.first_week,
            last_week: snapshotPerMetricDirectionStreakLeaderboard.last_week,
            min_streak_length:
              snapshotPerMetricDirectionStreakLeaderboard.min_streak_length,
            top_n_per_metric:
              snapshotPerMetricDirectionStreakLeaderboard.top_n_per_metric,
            groups: snapshotPerMetricDirectionStreakLeaderboard.groups,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_metric_pct_change_streak_leaderboard:
      snapshotPerMetricPctChangeStreakLeaderboard
        ? {
            window_size:
              snapshotPerMetricPctChangeStreakLeaderboard.window_size,
            first_week:
              snapshotPerMetricPctChangeStreakLeaderboard.first_week,
            last_week:
              snapshotPerMetricPctChangeStreakLeaderboard.last_week,
            min_streak_length:
              snapshotPerMetricPctChangeStreakLeaderboard.min_streak_length,
            threshold: snapshotPerMetricPctChangeStreakLeaderboard.threshold,
            top_n_per_metric:
              snapshotPerMetricPctChangeStreakLeaderboard.top_n_per_metric,
            groups: snapshotPerMetricPctChangeStreakLeaderboard.groups,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_reseller_direction_streak_leaderboard:
      snapshotPerResellerDirectionStreakLeaderboard
        ? {
            window_size:
              snapshotPerResellerDirectionStreakLeaderboard.window_size,
            first_week:
              snapshotPerResellerDirectionStreakLeaderboard.first_week,
            last_week:
              snapshotPerResellerDirectionStreakLeaderboard.last_week,
            min_streak_length:
              snapshotPerResellerDirectionStreakLeaderboard.min_streak_length,
            top_n_per_reseller:
              snapshotPerResellerDirectionStreakLeaderboard.top_n_per_reseller,
            groups: snapshotPerResellerDirectionStreakLeaderboard.groups,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_reseller_pct_change_streak_leaderboard:
      snapshotPerResellerPctChangeStreakLeaderboard
        ? {
            window_size:
              snapshotPerResellerPctChangeStreakLeaderboard.window_size,
            first_week:
              snapshotPerResellerPctChangeStreakLeaderboard.first_week,
            last_week:
              snapshotPerResellerPctChangeStreakLeaderboard.last_week,
            min_streak_length:
              snapshotPerResellerPctChangeStreakLeaderboard.min_streak_length,
            threshold:
              snapshotPerResellerPctChangeStreakLeaderboard.threshold,
            top_n_per_reseller:
              snapshotPerResellerPctChangeStreakLeaderboard.top_n_per_reseller,
            groups: snapshotPerResellerPctChangeStreakLeaderboard.groups,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_direction_streak_length_histogram:
      snapshotDirectionStreakLengthHistogram
        ? {
            window_size:
              snapshotDirectionStreakLengthHistogram.window_size,
            first_week:
              snapshotDirectionStreakLengthHistogram.first_week,
            last_week:
              snapshotDirectionStreakLengthHistogram.last_week,
            min_streak_length:
              snapshotDirectionStreakLengthHistogram.min_streak_length,
            total_streaks:
              snapshotDirectionStreakLengthHistogram.total_streaks,
            max_length:
              snapshotDirectionStreakLengthHistogram.max_length,
            buckets: snapshotDirectionStreakLengthHistogram.buckets,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_direction_streak_length_percentiles:
      snapshotDirectionStreakLengthPercentiles
        ? {
            window_size:
              snapshotDirectionStreakLengthPercentiles.window_size,
            first_week:
              snapshotDirectionStreakLengthPercentiles.first_week,
            last_week:
              snapshotDirectionStreakLengthPercentiles.last_week,
            min_streak_length:
              snapshotDirectionStreakLengthPercentiles.min_streak_length,
            total_streaks:
              snapshotDirectionStreakLengthPercentiles.total_streaks,
            p50_length:
              snapshotDirectionStreakLengthPercentiles.p50_length,
            p90_length:
              snapshotDirectionStreakLengthPercentiles.p90_length,
            mean_length:
              snapshotDirectionStreakLengthPercentiles.mean_length,
            max_length:
              snapshotDirectionStreakLengthPercentiles.max_length,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_pct_change_streak_length_histogram:
      snapshotPctChangeStreakLengthHistogram
        ? {
            window_size:
              snapshotPctChangeStreakLengthHistogram.window_size,
            first_week:
              snapshotPctChangeStreakLengthHistogram.first_week,
            last_week:
              snapshotPctChangeStreakLengthHistogram.last_week,
            min_streak_length:
              snapshotPctChangeStreakLengthHistogram.min_streak_length,
            threshold:
              snapshotPctChangeStreakLengthHistogram.threshold,
            total_streaks:
              snapshotPctChangeStreakLengthHistogram.total_streaks,
            max_length:
              snapshotPctChangeStreakLengthHistogram.max_length,
            buckets: snapshotPctChangeStreakLengthHistogram.buckets,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_pct_change_streak_length_percentiles:
      snapshotPctChangeStreakLengthPercentiles
        ? {
            window_size:
              snapshotPctChangeStreakLengthPercentiles.window_size,
            first_week:
              snapshotPctChangeStreakLengthPercentiles.first_week,
            last_week:
              snapshotPctChangeStreakLengthPercentiles.last_week,
            min_streak_length:
              snapshotPctChangeStreakLengthPercentiles.min_streak_length,
            threshold:
              snapshotPctChangeStreakLengthPercentiles.threshold,
            total_streaks:
              snapshotPctChangeStreakLengthPercentiles.total_streaks,
            p50_length:
              snapshotPctChangeStreakLengthPercentiles.p50_length,
            p90_length:
              snapshotPctChangeStreakLengthPercentiles.p90_length,
            mean_length:
              snapshotPctChangeStreakLengthPercentiles.mean_length,
            max_length:
              snapshotPctChangeStreakLengthPercentiles.max_length,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_reseller_direction_streak_length_histogram:
      snapshotPerResellerDirectionStreakLengthHistogram
        ? {
            window_size:
              snapshotPerResellerDirectionStreakLengthHistogram.window_size,
            first_week:
              snapshotPerResellerDirectionStreakLengthHistogram.first_week,
            last_week:
              snapshotPerResellerDirectionStreakLengthHistogram.last_week,
            min_streak_length:
              snapshotPerResellerDirectionStreakLengthHistogram.min_streak_length,
            groups:
              snapshotPerResellerDirectionStreakLengthHistogram.groups,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_reseller_direction_streak_length_percentiles:
      snapshotPerResellerDirectionStreakLengthPercentiles
        ? {
            window_size:
              snapshotPerResellerDirectionStreakLengthPercentiles.window_size,
            first_week:
              snapshotPerResellerDirectionStreakLengthPercentiles.first_week,
            last_week:
              snapshotPerResellerDirectionStreakLengthPercentiles.last_week,
            min_streak_length:
              snapshotPerResellerDirectionStreakLengthPercentiles.min_streak_length,
            groups:
              snapshotPerResellerDirectionStreakLengthPercentiles.groups,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_reseller_pct_change_streak_length_histogram:
      snapshotPerResellerPctChangeStreakLengthHistogram
        ? {
            window_size:
              snapshotPerResellerPctChangeStreakLengthHistogram.window_size,
            first_week:
              snapshotPerResellerPctChangeStreakLengthHistogram.first_week,
            last_week:
              snapshotPerResellerPctChangeStreakLengthHistogram.last_week,
            min_streak_length:
              snapshotPerResellerPctChangeStreakLengthHistogram.min_streak_length,
            threshold:
              snapshotPerResellerPctChangeStreakLengthHistogram.threshold,
            groups:
              snapshotPerResellerPctChangeStreakLengthHistogram.groups,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_reseller_pct_change_streak_length_percentiles:
      snapshotPerResellerPctChangeStreakLengthPercentiles
        ? {
            window_size:
              snapshotPerResellerPctChangeStreakLengthPercentiles.window_size,
            first_week:
              snapshotPerResellerPctChangeStreakLengthPercentiles.first_week,
            last_week:
              snapshotPerResellerPctChangeStreakLengthPercentiles.last_week,
            min_streak_length:
              snapshotPerResellerPctChangeStreakLengthPercentiles.min_streak_length,
            threshold:
              snapshotPerResellerPctChangeStreakLengthPercentiles.threshold,
            groups:
              snapshotPerResellerPctChangeStreakLengthPercentiles.groups,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_metric_direction_streak_length_histogram:
      snapshotPerMetricDirectionStreakLengthHistogram
        ? {
            window_size:
              snapshotPerMetricDirectionStreakLengthHistogram.window_size,
            first_week:
              snapshotPerMetricDirectionStreakLengthHistogram.first_week,
            last_week:
              snapshotPerMetricDirectionStreakLengthHistogram.last_week,
            min_streak_length:
              snapshotPerMetricDirectionStreakLengthHistogram.min_streak_length,
            groups:
              snapshotPerMetricDirectionStreakLengthHistogram.groups,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_metric_direction_streak_length_percentiles:
      snapshotPerMetricDirectionStreakLengthPercentiles
        ? {
            window_size:
              snapshotPerMetricDirectionStreakLengthPercentiles.window_size,
            first_week:
              snapshotPerMetricDirectionStreakLengthPercentiles.first_week,
            last_week:
              snapshotPerMetricDirectionStreakLengthPercentiles.last_week,
            min_streak_length:
              snapshotPerMetricDirectionStreakLengthPercentiles.min_streak_length,
            groups:
              snapshotPerMetricDirectionStreakLengthPercentiles.groups,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_metric_pct_change_streak_length_histogram:
      snapshotPerMetricPctChangeStreakLengthHistogram
        ? {
            window_size:
              snapshotPerMetricPctChangeStreakLengthHistogram.window_size,
            first_week:
              snapshotPerMetricPctChangeStreakLengthHistogram.first_week,
            last_week:
              snapshotPerMetricPctChangeStreakLengthHistogram.last_week,
            min_streak_length:
              snapshotPerMetricPctChangeStreakLengthHistogram.min_streak_length,
            threshold:
              snapshotPerMetricPctChangeStreakLengthHistogram.threshold,
            groups:
              snapshotPerMetricPctChangeStreakLengthHistogram.groups,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_metric_pct_change_streak_length_percentiles:
      snapshotPerMetricPctChangeStreakLengthPercentiles
        ? {
            window_size:
              snapshotPerMetricPctChangeStreakLengthPercentiles.window_size,
            first_week:
              snapshotPerMetricPctChangeStreakLengthPercentiles.first_week,
            last_week:
              snapshotPerMetricPctChangeStreakLengthPercentiles.last_week,
            min_streak_length:
              snapshotPerMetricPctChangeStreakLengthPercentiles.min_streak_length,
            threshold:
              snapshotPerMetricPctChangeStreakLengthPercentiles.threshold,
            groups:
              snapshotPerMetricPctChangeStreakLengthPercentiles.groups,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_metric_persistence_scorecard:
      snapshotPerMetricPersistenceScorecard
        ? {
            window_size:
              snapshotPerMetricPersistenceScorecard.window_size,
            first_week:
              snapshotPerMetricPersistenceScorecard.first_week,
            last_week:
              snapshotPerMetricPersistenceScorecard.last_week,
            min_streak_length:
              snapshotPerMetricPersistenceScorecard.min_streak_length,
            threshold:
              snapshotPerMetricPersistenceScorecard.threshold,
            rows:
              snapshotPerMetricPersistenceScorecard.rows,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_metric_persistence_scorecard_verdict:
      snapshotPerMetricPersistenceScorecardVerdict
        ? {
            window_size:
              snapshotPerMetricPersistenceScorecardVerdict.window_size,
            first_week:
              snapshotPerMetricPersistenceScorecardVerdict.first_week,
            last_week:
              snapshotPerMetricPersistenceScorecardVerdict.last_week,
            sustained_p90_threshold:
              snapshotPerMetricPersistenceScorecardVerdict.sustained_p90_threshold,
            threshold:
              snapshotPerMetricPersistenceScorecardVerdict.threshold,
            rows:
              snapshotPerMetricPersistenceScorecardVerdict.rows,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_metric_persistence_scorecard_verdict_transition:
      snapshotPerMetricPersistenceScorecardVerdictTransition
        ? {
            window_size:
              snapshotPerMetricPersistenceScorecardVerdictTransition.window_size,
            first_week:
              snapshotPerMetricPersistenceScorecardVerdictTransition.first_week,
            last_week:
              snapshotPerMetricPersistenceScorecardVerdictTransition.last_week,
            sustained_p90_threshold:
              snapshotPerMetricPersistenceScorecardVerdictTransition.sustained_p90_threshold,
            threshold:
              snapshotPerMetricPersistenceScorecardVerdictTransition.threshold,
            rows:
              snapshotPerMetricPersistenceScorecardVerdictTransition.rows,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_metric_persistence_scorecard_verdict_transition_distribution:
      snapshotPerMetricPersistenceScorecardVerdictTransitionDistribution
        ? {
            window_size:
              snapshotPerMetricPersistenceScorecardVerdictTransitionDistribution.window_size,
            first_week:
              snapshotPerMetricPersistenceScorecardVerdictTransitionDistribution.first_week,
            last_week:
              snapshotPerMetricPersistenceScorecardVerdictTransitionDistribution.last_week,
            sustained_p90_threshold:
              snapshotPerMetricPersistenceScorecardVerdictTransitionDistribution.sustained_p90_threshold,
            threshold:
              snapshotPerMetricPersistenceScorecardVerdictTransitionDistribution.threshold,
            distribution:
              snapshotPerMetricPersistenceScorecardVerdictTransitionDistribution.distribution,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_reseller_persistence_scorecard:
      snapshotPerResellerPersistenceScorecard
        ? {
            window_size:
              snapshotPerResellerPersistenceScorecard.window_size,
            first_week:
              snapshotPerResellerPersistenceScorecard.first_week,
            last_week:
              snapshotPerResellerPersistenceScorecard.last_week,
            min_streak_length:
              snapshotPerResellerPersistenceScorecard.min_streak_length,
            threshold:
              snapshotPerResellerPersistenceScorecard.threshold,
            rows:
              snapshotPerResellerPersistenceScorecard.rows,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_reseller_metric_persistence_scorecard:
      snapshotPerResellerMetricPersistenceScorecard
        ? {
            window_size:
              snapshotPerResellerMetricPersistenceScorecard.window_size,
            first_week:
              snapshotPerResellerMetricPersistenceScorecard.first_week,
            last_week:
              snapshotPerResellerMetricPersistenceScorecard.last_week,
            min_streak_length:
              snapshotPerResellerMetricPersistenceScorecard.min_streak_length,
            threshold:
              snapshotPerResellerMetricPersistenceScorecard.threshold,
            rows:
              snapshotPerResellerMetricPersistenceScorecard.rows,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_reseller_metric_persistence_scorecard_verdict:
      snapshotPerResellerMetricPersistenceScorecardVerdict
        ? {
            window_size:
              snapshotPerResellerMetricPersistenceScorecardVerdict.window_size,
            first_week:
              snapshotPerResellerMetricPersistenceScorecardVerdict.first_week,
            last_week:
              snapshotPerResellerMetricPersistenceScorecardVerdict.last_week,
            sustained_p90_threshold:
              snapshotPerResellerMetricPersistenceScorecardVerdict.sustained_p90_threshold,
            threshold:
              snapshotPerResellerMetricPersistenceScorecardVerdict.threshold,
            rows:
              snapshotPerResellerMetricPersistenceScorecardVerdict.rows,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_reseller_metric_persistence_scorecard_verdict_transition:
      snapshotPerResellerMetricPersistenceScorecardVerdictTransition
        ? {
            window_size:
              snapshotPerResellerMetricPersistenceScorecardVerdictTransition.window_size,
            first_week:
              snapshotPerResellerMetricPersistenceScorecardVerdictTransition.first_week,
            last_week:
              snapshotPerResellerMetricPersistenceScorecardVerdictTransition.last_week,
            sustained_p90_threshold:
              snapshotPerResellerMetricPersistenceScorecardVerdictTransition.sustained_p90_threshold,
            threshold:
              snapshotPerResellerMetricPersistenceScorecardVerdictTransition.threshold,
            rows:
              snapshotPerResellerMetricPersistenceScorecardVerdictTransition.rows,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_reseller_cross_metric_alerts:
      snapshotPerResellerCrossMetricAlerts
        ? {
            window_size: snapshotPerResellerCrossMetricAlerts.window_size,
            first_week: snapshotPerResellerCrossMetricAlerts.first_week,
            last_week: snapshotPerResellerCrossMetricAlerts.last_week,
            sustained_p90_threshold:
              snapshotPerResellerCrossMetricAlerts.sustained_p90_threshold,
            threshold: snapshotPerResellerCrossMetricAlerts.threshold,
            rows: snapshotPerResellerCrossMetricAlerts.rows,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_metric_cross_partner_alerts:
      snapshotPerMetricCrossPartnerAlerts
        ? {
            window_size: snapshotPerMetricCrossPartnerAlerts.window_size,
            first_week: snapshotPerMetricCrossPartnerAlerts.first_week,
            last_week: snapshotPerMetricCrossPartnerAlerts.last_week,
            sustained_p90_threshold:
              snapshotPerMetricCrossPartnerAlerts.sustained_p90_threshold,
            threshold: snapshotPerMetricCrossPartnerAlerts.threshold,
            rows: snapshotPerMetricCrossPartnerAlerts.rows,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_pair_hot_cells_summary: snapshotPerPairHotCellsSummary
      ? {
          window_size: snapshotPerPairHotCellsSummary.window_size,
          first_week: snapshotPerPairHotCellsSummary.first_week,
          last_week: snapshotPerPairHotCellsSummary.last_week,
          sustained_p90_threshold:
            snapshotPerPairHotCellsSummary.sustained_p90_threshold,
          threshold: snapshotPerPairHotCellsSummary.threshold,
          total_hot_cells: snapshotPerPairHotCellsSummary.total_hot_cells,
          sum_hot_score: snapshotPerPairHotCellsSummary.sum_hot_score,
          max_hot_score: snapshotPerPairHotCellsSummary.max_hot_score,
          mean_hot_score: snapshotPerPairHotCellsSummary.mean_hot_score,
          by_transition: snapshotPerPairHotCellsSummary.by_transition,
          top_partner: snapshotPerPairHotCellsSummary.top_partner,
          top_metric: snapshotPerPairHotCellsSummary.top_metric,
        }
      : {
          skipped_reason: previousSnapshotSkipReason ?? "no_previous_snapshot",
        },
    snapshot_per_transition_hot_cells_drilldown:
      snapshotPerTransitionHotCellsDrilldown
        ? {
            window_size: snapshotPerTransitionHotCellsDrilldown.window_size,
            first_week: snapshotPerTransitionHotCellsDrilldown.first_week,
            last_week: snapshotPerTransitionHotCellsDrilldown.last_week,
            sustained_p90_threshold:
              snapshotPerTransitionHotCellsDrilldown.sustained_p90_threshold,
            threshold: snapshotPerTransitionHotCellsDrilldown.threshold,
            total_hot_cells:
              snapshotPerTransitionHotCellsDrilldown.total_hot_cells,
            buckets: snapshotPerTransitionHotCellsDrilldown.buckets,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_transition_magnitude_drilldown:
      snapshotPerTransitionMagnitudeDrilldown
        ? {
            window_size: snapshotPerTransitionMagnitudeDrilldown.window_size,
            first_week: snapshotPerTransitionMagnitudeDrilldown.first_week,
            last_week: snapshotPerTransitionMagnitudeDrilldown.last_week,
            sustained_p90_threshold:
              snapshotPerTransitionMagnitudeDrilldown.sustained_p90_threshold,
            threshold: snapshotPerTransitionMagnitudeDrilldown.threshold,
            total_hot_cells:
              snapshotPerTransitionMagnitudeDrilldown.total_hot_cells,
            band_thresholds:
              snapshotPerTransitionMagnitudeDrilldown.band_thresholds,
            transitions: snapshotPerTransitionMagnitudeDrilldown.transitions,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_transition_magnitude_leaderboard:
      snapshotPerTransitionMagnitudeLeaderboard
        ? {
            window_size:
              snapshotPerTransitionMagnitudeLeaderboard.window_size,
            first_week: snapshotPerTransitionMagnitudeLeaderboard.first_week,
            last_week: snapshotPerTransitionMagnitudeLeaderboard.last_week,
            sustained_p90_threshold:
              snapshotPerTransitionMagnitudeLeaderboard.sustained_p90_threshold,
            threshold: snapshotPerTransitionMagnitudeLeaderboard.threshold,
            total_hot_cells:
              snapshotPerTransitionMagnitudeLeaderboard.total_hot_cells,
            band_thresholds:
              snapshotPerTransitionMagnitudeLeaderboard.band_thresholds,
            transitions:
              snapshotPerTransitionMagnitudeLeaderboard.transitions,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_transition_magnitude_top3_leaderboard:
      snapshotPerTransitionMagnitudeTop3Leaderboard
        ? {
            window_size:
              snapshotPerTransitionMagnitudeTop3Leaderboard.window_size,
            first_week:
              snapshotPerTransitionMagnitudeTop3Leaderboard.first_week,
            last_week:
              snapshotPerTransitionMagnitudeTop3Leaderboard.last_week,
            sustained_p90_threshold:
              snapshotPerTransitionMagnitudeTop3Leaderboard.sustained_p90_threshold,
            threshold:
              snapshotPerTransitionMagnitudeTop3Leaderboard.threshold,
            total_hot_cells:
              snapshotPerTransitionMagnitudeTop3Leaderboard.total_hot_cells,
            top_n: snapshotPerTransitionMagnitudeTop3Leaderboard.top_n,
            band_thresholds:
              snapshotPerTransitionMagnitudeTop3Leaderboard.band_thresholds,
            transitions:
              snapshotPerTransitionMagnitudeTop3Leaderboard.transitions,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_transition_magnitude_top3_concentration:
      snapshotPerTransitionMagnitudeTop3Concentration
        ? {
            window_size:
              snapshotPerTransitionMagnitudeTop3Concentration.window_size,
            first_week:
              snapshotPerTransitionMagnitudeTop3Concentration.first_week,
            last_week:
              snapshotPerTransitionMagnitudeTop3Concentration.last_week,
            sustained_p90_threshold:
              snapshotPerTransitionMagnitudeTop3Concentration.sustained_p90_threshold,
            threshold:
              snapshotPerTransitionMagnitudeTop3Concentration.threshold,
            total_hot_cells:
              snapshotPerTransitionMagnitudeTop3Concentration.total_hot_cells,
            top_n: snapshotPerTransitionMagnitudeTop3Concentration.top_n,
            outlier_threshold:
              snapshotPerTransitionMagnitudeTop3Concentration.outlier_threshold,
            pack_threshold:
              snapshotPerTransitionMagnitudeTop3Concentration.pack_threshold,
            band_thresholds:
              snapshotPerTransitionMagnitudeTop3Concentration.band_thresholds,
            transitions:
              snapshotPerTransitionMagnitudeTop3Concentration.transitions,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_transition_magnitude_top3_tie_count:
      snapshotPerTransitionMagnitudeTop3TieCount
        ? {
            window_size:
              snapshotPerTransitionMagnitudeTop3TieCount.window_size,
            first_week:
              snapshotPerTransitionMagnitudeTop3TieCount.first_week,
            last_week:
              snapshotPerTransitionMagnitudeTop3TieCount.last_week,
            sustained_p90_threshold:
              snapshotPerTransitionMagnitudeTop3TieCount.sustained_p90_threshold,
            threshold: snapshotPerTransitionMagnitudeTop3TieCount.threshold,
            total_hot_cells:
              snapshotPerTransitionMagnitudeTop3TieCount.total_hot_cells,
            top_n: snapshotPerTransitionMagnitudeTop3TieCount.top_n,
            band_thresholds:
              snapshotPerTransitionMagnitudeTop3TieCount.band_thresholds,
            transitions:
              snapshotPerTransitionMagnitudeTop3TieCount.transitions,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_transition_magnitude_top3_runner_up_gap:
      snapshotPerTransitionMagnitudeTop3RunnerUpGap
        ? {
            window_size:
              snapshotPerTransitionMagnitudeTop3RunnerUpGap.window_size,
            first_week:
              snapshotPerTransitionMagnitudeTop3RunnerUpGap.first_week,
            last_week:
              snapshotPerTransitionMagnitudeTop3RunnerUpGap.last_week,
            sustained_p90_threshold:
              snapshotPerTransitionMagnitudeTop3RunnerUpGap.sustained_p90_threshold,
            threshold:
              snapshotPerTransitionMagnitudeTop3RunnerUpGap.threshold,
            total_hot_cells:
              snapshotPerTransitionMagnitudeTop3RunnerUpGap.total_hot_cells,
            top_n: snapshotPerTransitionMagnitudeTop3RunnerUpGap.top_n,
            outlier_gap_min:
              snapshotPerTransitionMagnitudeTop3RunnerUpGap.outlier_gap_min,
            band_thresholds:
              snapshotPerTransitionMagnitudeTop3RunnerUpGap.band_thresholds,
            transitions:
              snapshotPerTransitionMagnitudeTop3RunnerUpGap.transitions,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_transition_magnitude_top3_tail_gap:
      snapshotPerTransitionMagnitudeTop3TailGap
        ? {
            window_size:
              snapshotPerTransitionMagnitudeTop3TailGap.window_size,
            first_week:
              snapshotPerTransitionMagnitudeTop3TailGap.first_week,
            last_week:
              snapshotPerTransitionMagnitudeTop3TailGap.last_week,
            sustained_p90_threshold:
              snapshotPerTransitionMagnitudeTop3TailGap.sustained_p90_threshold,
            threshold:
              snapshotPerTransitionMagnitudeTop3TailGap.threshold,
            total_hot_cells:
              snapshotPerTransitionMagnitudeTop3TailGap.total_hot_cells,
            top_n: snapshotPerTransitionMagnitudeTop3TailGap.top_n,
            outlier_gap_min:
              snapshotPerTransitionMagnitudeTop3TailGap.outlier_gap_min,
            band_thresholds:
              snapshotPerTransitionMagnitudeTop3TailGap.band_thresholds,
            transitions:
              snapshotPerTransitionMagnitudeTop3TailGap.transitions,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_transition_magnitude_top3_middle_gap:
      snapshotPerTransitionMagnitudeTop3MiddleGap
        ? {
            window_size:
              snapshotPerTransitionMagnitudeTop3MiddleGap.window_size,
            first_week:
              snapshotPerTransitionMagnitudeTop3MiddleGap.first_week,
            last_week:
              snapshotPerTransitionMagnitudeTop3MiddleGap.last_week,
            sustained_p90_threshold:
              snapshotPerTransitionMagnitudeTop3MiddleGap.sustained_p90_threshold,
            threshold:
              snapshotPerTransitionMagnitudeTop3MiddleGap.threshold,
            total_hot_cells:
              snapshotPerTransitionMagnitudeTop3MiddleGap.total_hot_cells,
            top_n: snapshotPerTransitionMagnitudeTop3MiddleGap.top_n,
            outlier_gap_min:
              snapshotPerTransitionMagnitudeTop3MiddleGap.outlier_gap_min,
            band_thresholds:
              snapshotPerTransitionMagnitudeTop3MiddleGap.band_thresholds,
            transitions:
              snapshotPerTransitionMagnitudeTop3MiddleGap.transitions,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_transition_magnitude_top3_pool:
      snapshotPerTransitionMagnitudeTop3Pool
        ? {
            window_size:
              snapshotPerTransitionMagnitudeTop3Pool.window_size,
            first_week:
              snapshotPerTransitionMagnitudeTop3Pool.first_week,
            last_week:
              snapshotPerTransitionMagnitudeTop3Pool.last_week,
            sustained_p90_threshold:
              snapshotPerTransitionMagnitudeTop3Pool.sustained_p90_threshold,
            threshold:
              snapshotPerTransitionMagnitudeTop3Pool.threshold,
            total_hot_cells:
              snapshotPerTransitionMagnitudeTop3Pool.total_hot_cells,
            top_n: snapshotPerTransitionMagnitudeTop3Pool.top_n,
            wide_tail_share_min:
              snapshotPerTransitionMagnitudeTop3Pool.wide_tail_share_min,
            band_thresholds:
              snapshotPerTransitionMagnitudeTop3Pool.band_thresholds,
            transitions:
              snapshotPerTransitionMagnitudeTop3Pool.transitions,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_transition_magnitude_top3_pool_hhi:
      snapshotPerTransitionMagnitudeTop3PoolHhi
        ? {
            window_size:
              snapshotPerTransitionMagnitudeTop3PoolHhi.window_size,
            first_week:
              snapshotPerTransitionMagnitudeTop3PoolHhi.first_week,
            last_week:
              snapshotPerTransitionMagnitudeTop3PoolHhi.last_week,
            sustained_p90_threshold:
              snapshotPerTransitionMagnitudeTop3PoolHhi.sustained_p90_threshold,
            threshold:
              snapshotPerTransitionMagnitudeTop3PoolHhi.threshold,
            total_hot_cells:
              snapshotPerTransitionMagnitudeTop3PoolHhi.total_hot_cells,
            top_n: snapshotPerTransitionMagnitudeTop3PoolHhi.top_n,
            concentrated_hhi_min:
              snapshotPerTransitionMagnitudeTop3PoolHhi.concentrated_hhi_min,
            moderate_hhi_min:
              snapshotPerTransitionMagnitudeTop3PoolHhi.moderate_hhi_min,
            band_thresholds:
              snapshotPerTransitionMagnitudeTop3PoolHhi.band_thresholds,
            transitions:
              snapshotPerTransitionMagnitudeTop3PoolHhi.transitions,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_transition_magnitude_top3_pool_gini:
      snapshotPerTransitionMagnitudeTop3PoolGini
        ? {
            window_size:
              snapshotPerTransitionMagnitudeTop3PoolGini.window_size,
            first_week:
              snapshotPerTransitionMagnitudeTop3PoolGini.first_week,
            last_week:
              snapshotPerTransitionMagnitudeTop3PoolGini.last_week,
            sustained_p90_threshold:
              snapshotPerTransitionMagnitudeTop3PoolGini.sustained_p90_threshold,
            threshold:
              snapshotPerTransitionMagnitudeTop3PoolGini.threshold,
            total_hot_cells:
              snapshotPerTransitionMagnitudeTop3PoolGini.total_hot_cells,
            top_n: snapshotPerTransitionMagnitudeTop3PoolGini.top_n,
            unequal_gini_min:
              snapshotPerTransitionMagnitudeTop3PoolGini.unequal_gini_min,
            mixed_gini_min:
              snapshotPerTransitionMagnitudeTop3PoolGini.mixed_gini_min,
            band_thresholds:
              snapshotPerTransitionMagnitudeTop3PoolGini.band_thresholds,
            transitions:
              snapshotPerTransitionMagnitudeTop3PoolGini.transitions,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_transition_magnitude_top3_pool_theil:
      snapshotPerTransitionMagnitudeTop3PoolTheil
        ? {
            window_size:
              snapshotPerTransitionMagnitudeTop3PoolTheil.window_size,
            first_week:
              snapshotPerTransitionMagnitudeTop3PoolTheil.first_week,
            last_week:
              snapshotPerTransitionMagnitudeTop3PoolTheil.last_week,
            sustained_p90_threshold:
              snapshotPerTransitionMagnitudeTop3PoolTheil.sustained_p90_threshold,
            threshold:
              snapshotPerTransitionMagnitudeTop3PoolTheil.threshold,
            total_hot_cells:
              snapshotPerTransitionMagnitudeTop3PoolTheil.total_hot_cells,
            top_n: snapshotPerTransitionMagnitudeTop3PoolTheil.top_n,
            high_theil_min:
              snapshotPerTransitionMagnitudeTop3PoolTheil.high_theil_min,
            moderate_theil_min:
              snapshotPerTransitionMagnitudeTop3PoolTheil.moderate_theil_min,
            band_thresholds:
              snapshotPerTransitionMagnitudeTop3PoolTheil.band_thresholds,
            transitions:
              snapshotPerTransitionMagnitudeTop3PoolTheil.transitions,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_transition_magnitude_top3_pool_atkinson:
      snapshotPerTransitionMagnitudeTop3PoolAtkinson
        ? {
            window_size:
              snapshotPerTransitionMagnitudeTop3PoolAtkinson.window_size,
            first_week:
              snapshotPerTransitionMagnitudeTop3PoolAtkinson.first_week,
            last_week:
              snapshotPerTransitionMagnitudeTop3PoolAtkinson.last_week,
            sustained_p90_threshold:
              snapshotPerTransitionMagnitudeTop3PoolAtkinson.sustained_p90_threshold,
            threshold:
              snapshotPerTransitionMagnitudeTop3PoolAtkinson.threshold,
            total_hot_cells:
              snapshotPerTransitionMagnitudeTop3PoolAtkinson.total_hot_cells,
            top_n: snapshotPerTransitionMagnitudeTop3PoolAtkinson.top_n,
            epsilon: snapshotPerTransitionMagnitudeTop3PoolAtkinson.epsilon,
            high_atkinson_min:
              snapshotPerTransitionMagnitudeTop3PoolAtkinson.high_atkinson_min,
            moderate_atkinson_min:
              snapshotPerTransitionMagnitudeTop3PoolAtkinson.moderate_atkinson_min,
            band_thresholds:
              snapshotPerTransitionMagnitudeTop3PoolAtkinson.band_thresholds,
            transitions:
              snapshotPerTransitionMagnitudeTop3PoolAtkinson.transitions,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_transition_magnitude_top3_pool_cv:
      snapshotPerTransitionMagnitudeTop3PoolCv
        ? {
            window_size:
              snapshotPerTransitionMagnitudeTop3PoolCv.window_size,
            first_week:
              snapshotPerTransitionMagnitudeTop3PoolCv.first_week,
            last_week:
              snapshotPerTransitionMagnitudeTop3PoolCv.last_week,
            sustained_p90_threshold:
              snapshotPerTransitionMagnitudeTop3PoolCv.sustained_p90_threshold,
            threshold:
              snapshotPerTransitionMagnitudeTop3PoolCv.threshold,
            total_hot_cells:
              snapshotPerTransitionMagnitudeTop3PoolCv.total_hot_cells,
            top_n: snapshotPerTransitionMagnitudeTop3PoolCv.top_n,
            high_cv_min:
              snapshotPerTransitionMagnitudeTop3PoolCv.high_cv_min,
            moderate_cv_min:
              snapshotPerTransitionMagnitudeTop3PoolCv.moderate_cv_min,
            band_thresholds:
              snapshotPerTransitionMagnitudeTop3PoolCv.band_thresholds,
            transitions:
              snapshotPerTransitionMagnitudeTop3PoolCv.transitions,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_transition_magnitude_top3_pool_normalized_entropy:
      snapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy
        ? {
            window_size:
              snapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy.window_size,
            first_week:
              snapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy.first_week,
            last_week:
              snapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy.last_week,
            sustained_p90_threshold:
              snapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy.sustained_p90_threshold,
            threshold:
              snapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy.threshold,
            total_hot_cells:
              snapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy.total_hot_cells,
            top_n:
              snapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy.top_n,
            high_evenness_min:
              snapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy.high_evenness_min,
            moderate_evenness_min:
              snapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy.moderate_evenness_min,
            band_thresholds:
              snapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy.band_thresholds,
            transitions:
              snapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy.transitions,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_transition_magnitude_top3_pool_top1_share:
      snapshotPerTransitionMagnitudeTop3PoolTop1Share
        ? {
            window_size:
              snapshotPerTransitionMagnitudeTop3PoolTop1Share.window_size,
            first_week:
              snapshotPerTransitionMagnitudeTop3PoolTop1Share.first_week,
            last_week:
              snapshotPerTransitionMagnitudeTop3PoolTop1Share.last_week,
            sustained_p90_threshold:
              snapshotPerTransitionMagnitudeTop3PoolTop1Share.sustained_p90_threshold,
            threshold:
              snapshotPerTransitionMagnitudeTop3PoolTop1Share.threshold,
            total_hot_cells:
              snapshotPerTransitionMagnitudeTop3PoolTop1Share.total_hot_cells,
            top_n: snapshotPerTransitionMagnitudeTop3PoolTop1Share.top_n,
            runaway_share_min:
              snapshotPerTransitionMagnitudeTop3PoolTop1Share.runaway_share_min,
            leading_share_min:
              snapshotPerTransitionMagnitudeTop3PoolTop1Share.leading_share_min,
            band_thresholds:
              snapshotPerTransitionMagnitudeTop3PoolTop1Share.band_thresholds,
            transitions:
              snapshotPerTransitionMagnitudeTop3PoolTop1Share.transitions,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_transition_magnitude_top3_pool_top2_share:
      snapshotPerTransitionMagnitudeTop3PoolTop2Share
        ? {
            window_size:
              snapshotPerTransitionMagnitudeTop3PoolTop2Share.window_size,
            first_week:
              snapshotPerTransitionMagnitudeTop3PoolTop2Share.first_week,
            last_week:
              snapshotPerTransitionMagnitudeTop3PoolTop2Share.last_week,
            sustained_p90_threshold:
              snapshotPerTransitionMagnitudeTop3PoolTop2Share.sustained_p90_threshold,
            threshold:
              snapshotPerTransitionMagnitudeTop3PoolTop2Share.threshold,
            total_hot_cells:
              snapshotPerTransitionMagnitudeTop3PoolTop2Share.total_hot_cells,
            top_n: snapshotPerTransitionMagnitudeTop3PoolTop2Share.top_n,
            top_k: snapshotPerTransitionMagnitudeTop3PoolTop2Share.top_k,
            oligopoly_share_min:
              snapshotPerTransitionMagnitudeTop3PoolTop2Share.oligopoly_share_min,
            leading_share_min:
              snapshotPerTransitionMagnitudeTop3PoolTop2Share.leading_share_min,
            band_thresholds:
              snapshotPerTransitionMagnitudeTop3PoolTop2Share.band_thresholds,
            transitions:
              snapshotPerTransitionMagnitudeTop3PoolTop2Share.transitions,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_transition_magnitude_top3_pool_bottom1_share:
      snapshotPerTransitionMagnitudeTop3PoolBottom1Share
        ? {
            window_size:
              snapshotPerTransitionMagnitudeTop3PoolBottom1Share.window_size,
            first_week:
              snapshotPerTransitionMagnitudeTop3PoolBottom1Share.first_week,
            last_week:
              snapshotPerTransitionMagnitudeTop3PoolBottom1Share.last_week,
            sustained_p90_threshold:
              snapshotPerTransitionMagnitudeTop3PoolBottom1Share.sustained_p90_threshold,
            threshold:
              snapshotPerTransitionMagnitudeTop3PoolBottom1Share.threshold,
            total_hot_cells:
              snapshotPerTransitionMagnitudeTop3PoolBottom1Share.total_hot_cells,
            top_n: snapshotPerTransitionMagnitudeTop3PoolBottom1Share.top_n,
            flat_floor_min:
              snapshotPerTransitionMagnitudeTop3PoolBottom1Share.flat_floor_min,
            moderate_floor_min:
              snapshotPerTransitionMagnitudeTop3PoolBottom1Share.moderate_floor_min,
            band_thresholds:
              snapshotPerTransitionMagnitudeTop3PoolBottom1Share.band_thresholds,
            transitions:
              snapshotPerTransitionMagnitudeTop3PoolBottom1Share.transitions,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_transition_magnitude_top3_pool_range:
      snapshotPerTransitionMagnitudeTop3PoolRange
        ? {
            window_size:
              snapshotPerTransitionMagnitudeTop3PoolRange.window_size,
            first_week:
              snapshotPerTransitionMagnitudeTop3PoolRange.first_week,
            last_week:
              snapshotPerTransitionMagnitudeTop3PoolRange.last_week,
            sustained_p90_threshold:
              snapshotPerTransitionMagnitudeTop3PoolRange.sustained_p90_threshold,
            threshold:
              snapshotPerTransitionMagnitudeTop3PoolRange.threshold,
            total_hot_cells:
              snapshotPerTransitionMagnitudeTop3PoolRange.total_hot_cells,
            top_n: snapshotPerTransitionMagnitudeTop3PoolRange.top_n,
            compressed_range_max:
              snapshotPerTransitionMagnitudeTop3PoolRange.compressed_range_max,
            wide_range_min:
              snapshotPerTransitionMagnitudeTop3PoolRange.wide_range_min,
            band_thresholds:
              snapshotPerTransitionMagnitudeTop3PoolRange.band_thresholds,
            transitions:
              snapshotPerTransitionMagnitudeTop3PoolRange.transitions,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_transition_magnitude_top3_pool_bottom2_share:
      snapshotPerTransitionMagnitudeTop3PoolBottom2Share
        ? {
            window_size:
              snapshotPerTransitionMagnitudeTop3PoolBottom2Share.window_size,
            first_week:
              snapshotPerTransitionMagnitudeTop3PoolBottom2Share.first_week,
            last_week:
              snapshotPerTransitionMagnitudeTop3PoolBottom2Share.last_week,
            sustained_p90_threshold:
              snapshotPerTransitionMagnitudeTop3PoolBottom2Share.sustained_p90_threshold,
            threshold:
              snapshotPerTransitionMagnitudeTop3PoolBottom2Share.threshold,
            total_hot_cells:
              snapshotPerTransitionMagnitudeTop3PoolBottom2Share.total_hot_cells,
            top_n:
              snapshotPerTransitionMagnitudeTop3PoolBottom2Share.top_n,
            bottom_k:
              snapshotPerTransitionMagnitudeTop3PoolBottom2Share.bottom_k,
            fat_floor_min:
              snapshotPerTransitionMagnitudeTop3PoolBottom2Share.fat_floor_min,
            moderate_floor_min:
              snapshotPerTransitionMagnitudeTop3PoolBottom2Share.moderate_floor_min,
            band_thresholds:
              snapshotPerTransitionMagnitudeTop3PoolBottom2Share.band_thresholds,
            transitions:
              snapshotPerTransitionMagnitudeTop3PoolBottom2Share.transitions,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_transition_magnitude_top3_pool_top1_bottom1_ratio:
      snapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio
        ? {
            window_size:
              snapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio.window_size,
            first_week:
              snapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio.first_week,
            last_week:
              snapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio.last_week,
            sustained_p90_threshold:
              snapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio.sustained_p90_threshold,
            threshold:
              snapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio.threshold,
            total_hot_cells:
              snapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio.total_hot_cells,
            top_n:
              snapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio.top_n,
            level_ratio_max:
              snapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio.level_ratio_max,
            stark_ratio_min:
              snapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio.stark_ratio_min,
            band_thresholds:
              snapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio.band_thresholds,
            transitions:
              snapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio.transitions,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_transition_magnitude_top3_pool_top2_bottom2_ratio:
      snapshotPerTransitionMagnitudeTop3PoolTop2Bottom2Ratio
        ? {
            window_size:
              snapshotPerTransitionMagnitudeTop3PoolTop2Bottom2Ratio.window_size,
            first_week:
              snapshotPerTransitionMagnitudeTop3PoolTop2Bottom2Ratio.first_week,
            last_week:
              snapshotPerTransitionMagnitudeTop3PoolTop2Bottom2Ratio.last_week,
            sustained_p90_threshold:
              snapshotPerTransitionMagnitudeTop3PoolTop2Bottom2Ratio.sustained_p90_threshold,
            threshold:
              snapshotPerTransitionMagnitudeTop3PoolTop2Bottom2Ratio.threshold,
            total_hot_cells:
              snapshotPerTransitionMagnitudeTop3PoolTop2Bottom2Ratio.total_hot_cells,
            top_n:
              snapshotPerTransitionMagnitudeTop3PoolTop2Bottom2Ratio.top_n,
            top_k:
              snapshotPerTransitionMagnitudeTop3PoolTop2Bottom2Ratio.top_k,
            bottom_k:
              snapshotPerTransitionMagnitudeTop3PoolTop2Bottom2Ratio.bottom_k,
            level_ratio_max:
              snapshotPerTransitionMagnitudeTop3PoolTop2Bottom2Ratio.level_ratio_max,
            stark_ratio_min:
              snapshotPerTransitionMagnitudeTop3PoolTop2Bottom2Ratio.stark_ratio_min,
            band_thresholds:
              snapshotPerTransitionMagnitudeTop3PoolTop2Bottom2Ratio.band_thresholds,
            transitions:
              snapshotPerTransitionMagnitudeTop3PoolTop2Bottom2Ratio.transitions,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_transition_magnitude_top3_pool_mid_mass_share:
      snapshotPerTransitionMagnitudeTop3PoolMidMassShare
        ? {
            window_size:
              snapshotPerTransitionMagnitudeTop3PoolMidMassShare.window_size,
            first_week:
              snapshotPerTransitionMagnitudeTop3PoolMidMassShare.first_week,
            last_week:
              snapshotPerTransitionMagnitudeTop3PoolMidMassShare.last_week,
            sustained_p90_threshold:
              snapshotPerTransitionMagnitudeTop3PoolMidMassShare.sustained_p90_threshold,
            threshold:
              snapshotPerTransitionMagnitudeTop3PoolMidMassShare.threshold,
            total_hot_cells:
              snapshotPerTransitionMagnitudeTop3PoolMidMassShare.total_hot_cells,
            top_n:
              snapshotPerTransitionMagnitudeTop3PoolMidMassShare.top_n,
            top_k:
              snapshotPerTransitionMagnitudeTop3PoolMidMassShare.top_k,
            bottom_k:
              snapshotPerTransitionMagnitudeTop3PoolMidMassShare.bottom_k,
            thin_mid_max:
              snapshotPerTransitionMagnitudeTop3PoolMidMassShare.thin_mid_max,
            fat_mid_min:
              snapshotPerTransitionMagnitudeTop3PoolMidMassShare.fat_mid_min,
            band_thresholds:
              snapshotPerTransitionMagnitudeTop3PoolMidMassShare.band_thresholds,
            transitions:
              snapshotPerTransitionMagnitudeTop3PoolMidMassShare.transitions,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_transition_magnitude_top3_pool_top1_bottom2_ratio:
      snapshotPerTransitionMagnitudeTop3PoolTop1Bottom2Ratio
        ? {
            window_size:
              snapshotPerTransitionMagnitudeTop3PoolTop1Bottom2Ratio.window_size,
            first_week:
              snapshotPerTransitionMagnitudeTop3PoolTop1Bottom2Ratio.first_week,
            last_week:
              snapshotPerTransitionMagnitudeTop3PoolTop1Bottom2Ratio.last_week,
            sustained_p90_threshold:
              snapshotPerTransitionMagnitudeTop3PoolTop1Bottom2Ratio.sustained_p90_threshold,
            threshold:
              snapshotPerTransitionMagnitudeTop3PoolTop1Bottom2Ratio.threshold,
            total_hot_cells:
              snapshotPerTransitionMagnitudeTop3PoolTop1Bottom2Ratio.total_hot_cells,
            top_n:
              snapshotPerTransitionMagnitudeTop3PoolTop1Bottom2Ratio.top_n,
            top_k:
              snapshotPerTransitionMagnitudeTop3PoolTop1Bottom2Ratio.top_k,
            bottom_k:
              snapshotPerTransitionMagnitudeTop3PoolTop1Bottom2Ratio.bottom_k,
            level_ratio_max:
              snapshotPerTransitionMagnitudeTop3PoolTop1Bottom2Ratio.level_ratio_max,
            stark_ratio_min:
              snapshotPerTransitionMagnitudeTop3PoolTop1Bottom2Ratio.stark_ratio_min,
            band_thresholds:
              snapshotPerTransitionMagnitudeTop3PoolTop1Bottom2Ratio.band_thresholds,
            transitions:
              snapshotPerTransitionMagnitudeTop3PoolTop1Bottom2Ratio.transitions,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_transition_magnitude_top3_pool_top2_bottom1_ratio:
      snapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio
        ? {
            window_size:
              snapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio.window_size,
            first_week:
              snapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio.first_week,
            last_week:
              snapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio.last_week,
            sustained_p90_threshold:
              snapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio.sustained_p90_threshold,
            threshold:
              snapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio.threshold,
            total_hot_cells:
              snapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio.total_hot_cells,
            top_n:
              snapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio.top_n,
            top_k:
              snapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio.top_k,
            bottom_k:
              snapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio.bottom_k,
            level_ratio_max:
              snapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio.level_ratio_max,
            stark_ratio_min:
              snapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio.stark_ratio_min,
            band_thresholds:
              snapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio.band_thresholds,
            transitions:
              snapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio.transitions,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_transition_magnitude_top3_pool_median_mean_ratio:
      snapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio
        ? {
            window_size:
              snapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio.window_size,
            first_week:
              snapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio.first_week,
            last_week:
              snapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio.last_week,
            sustained_p90_threshold:
              snapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio.sustained_p90_threshold,
            threshold:
              snapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio.threshold,
            total_hot_cells:
              snapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio.total_hot_cells,
            top_n:
              snapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio.top_n,
            symmetric_ratio_min:
              snapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio.symmetric_ratio_min,
            peaked_ratio_max:
              snapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio.peaked_ratio_max,
            band_thresholds:
              snapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio.band_thresholds,
            transitions:
              snapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio.transitions,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_transition_magnitude_top3_pool_mean_median_absolute_gap:
      snapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap
        ? {
            window_size:
              snapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap.window_size,
            first_week:
              snapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap.first_week,
            last_week:
              snapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap.last_week,
            sustained_p90_threshold:
              snapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap.sustained_p90_threshold,
            threshold:
              snapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap.threshold,
            total_hot_cells:
              snapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap.total_hot_cells,
            top_n:
              snapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap.top_n,
            balanced_gap_max:
              snapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap.balanced_gap_max,
            lopsided_gap_min:
              snapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap.lopsided_gap_min,
            band_thresholds:
              snapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap.band_thresholds,
            transitions:
              snapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap.transitions,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_transition_magnitude_top3_pool_mean_absolute_deviation:
      snapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation
        ? {
            window_size:
              snapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation.window_size,
            first_week:
              snapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation.first_week,
            last_week:
              snapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation.last_week,
            sustained_p90_threshold:
              snapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation.sustained_p90_threshold,
            threshold:
              snapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation.threshold,
            total_hot_cells:
              snapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation.total_hot_cells,
            top_n:
              snapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation.top_n,
            tight_mad_max:
              snapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation.tight_mad_max,
            wide_mad_min:
              snapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation.wide_mad_min,
            band_thresholds:
              snapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation.band_thresholds,
            transitions:
              snapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation.transitions,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_transition_magnitude_top3_pool_median_absolute_deviation:
      snapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation
        ? {
            window_size:
              snapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation.window_size,
            first_week:
              snapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation.first_week,
            last_week:
              snapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation.last_week,
            sustained_p90_threshold:
              snapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation.sustained_p90_threshold,
            threshold:
              snapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation.threshold,
            total_hot_cells:
              snapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation.total_hot_cells,
            top_n:
              snapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation.top_n,
            tight_madm_max:
              snapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation.tight_madm_max,
            wide_madm_min:
              snapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation.wide_madm_min,
            band_thresholds:
              snapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation.band_thresholds,
            transitions:
              snapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation.transitions,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_transition_magnitude_top3_pool_skewness:
      snapshotPerTransitionMagnitudeTop3PoolSkewness
        ? {
            window_size:
              snapshotPerTransitionMagnitudeTop3PoolSkewness.window_size,
            first_week:
              snapshotPerTransitionMagnitudeTop3PoolSkewness.first_week,
            last_week:
              snapshotPerTransitionMagnitudeTop3PoolSkewness.last_week,
            sustained_p90_threshold:
              snapshotPerTransitionMagnitudeTop3PoolSkewness.sustained_p90_threshold,
            threshold:
              snapshotPerTransitionMagnitudeTop3PoolSkewness.threshold,
            total_hot_cells:
              snapshotPerTransitionMagnitudeTop3PoolSkewness.total_hot_cells,
            top_n:
              snapshotPerTransitionMagnitudeTop3PoolSkewness.top_n,
            symmetric_skewness_abs_max:
              snapshotPerTransitionMagnitudeTop3PoolSkewness.symmetric_skewness_abs_max,
            band_thresholds:
              snapshotPerTransitionMagnitudeTop3PoolSkewness.band_thresholds,
            transitions:
              snapshotPerTransitionMagnitudeTop3PoolSkewness.transitions,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_transition_magnitude_top3_pool_excess_kurtosis:
      snapshotPerTransitionMagnitudeTop3PoolExcessKurtosis
        ? {
            window_size:
              snapshotPerTransitionMagnitudeTop3PoolExcessKurtosis.window_size,
            first_week:
              snapshotPerTransitionMagnitudeTop3PoolExcessKurtosis.first_week,
            last_week:
              snapshotPerTransitionMagnitudeTop3PoolExcessKurtosis.last_week,
            sustained_p90_threshold:
              snapshotPerTransitionMagnitudeTop3PoolExcessKurtosis.sustained_p90_threshold,
            threshold:
              snapshotPerTransitionMagnitudeTop3PoolExcessKurtosis.threshold,
            total_hot_cells:
              snapshotPerTransitionMagnitudeTop3PoolExcessKurtosis.total_hot_cells,
            top_n:
              snapshotPerTransitionMagnitudeTop3PoolExcessKurtosis.top_n,
            mesokurtic_excess_kurtosis_abs_max:
              snapshotPerTransitionMagnitudeTop3PoolExcessKurtosis.mesokurtic_excess_kurtosis_abs_max,
            band_thresholds:
              snapshotPerTransitionMagnitudeTop3PoolExcessKurtosis.band_thresholds,
            transitions:
              snapshotPerTransitionMagnitudeTop3PoolExcessKurtosis.transitions,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_transition_magnitude_top3_pool_iqr:
      snapshotPerTransitionMagnitudeTop3PoolIqr
        ? {
            window_size:
              snapshotPerTransitionMagnitudeTop3PoolIqr.window_size,
            first_week:
              snapshotPerTransitionMagnitudeTop3PoolIqr.first_week,
            last_week:
              snapshotPerTransitionMagnitudeTop3PoolIqr.last_week,
            sustained_p90_threshold:
              snapshotPerTransitionMagnitudeTop3PoolIqr.sustained_p90_threshold,
            threshold:
              snapshotPerTransitionMagnitudeTop3PoolIqr.threshold,
            total_hot_cells:
              snapshotPerTransitionMagnitudeTop3PoolIqr.total_hot_cells,
            top_n:
              snapshotPerTransitionMagnitudeTop3PoolIqr.top_n,
            min_pool_count_for_iqr:
              snapshotPerTransitionMagnitudeTop3PoolIqr.min_pool_count_for_iqr,
            tight_iqr_max:
              snapshotPerTransitionMagnitudeTop3PoolIqr.tight_iqr_max,
            wide_iqr_min:
              snapshotPerTransitionMagnitudeTop3PoolIqr.wide_iqr_min,
            band_thresholds:
              snapshotPerTransitionMagnitudeTop3PoolIqr.band_thresholds,
            transitions:
              snapshotPerTransitionMagnitudeTop3PoolIqr.transitions,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_transition_magnitude_top3_pool_iqr_ratio:
      snapshotPerTransitionMagnitudeTop3PoolIqrRatio
        ? {
            window_size:
              snapshotPerTransitionMagnitudeTop3PoolIqrRatio.window_size,
            first_week:
              snapshotPerTransitionMagnitudeTop3PoolIqrRatio.first_week,
            last_week:
              snapshotPerTransitionMagnitudeTop3PoolIqrRatio.last_week,
            sustained_p90_threshold:
              snapshotPerTransitionMagnitudeTop3PoolIqrRatio.sustained_p90_threshold,
            threshold:
              snapshotPerTransitionMagnitudeTop3PoolIqrRatio.threshold,
            total_hot_cells:
              snapshotPerTransitionMagnitudeTop3PoolIqrRatio.total_hot_cells,
            top_n:
              snapshotPerTransitionMagnitudeTop3PoolIqrRatio.top_n,
            min_pool_count_for_iqr_ratio:
              snapshotPerTransitionMagnitudeTop3PoolIqrRatio.min_pool_count_for_iqr_ratio,
            level_ratio_max:
              snapshotPerTransitionMagnitudeTop3PoolIqrRatio.level_ratio_max,
            stark_ratio_min:
              snapshotPerTransitionMagnitudeTop3PoolIqrRatio.stark_ratio_min,
            band_thresholds:
              snapshotPerTransitionMagnitudeTop3PoolIqrRatio.band_thresholds,
            transitions:
              snapshotPerTransitionMagnitudeTop3PoolIqrRatio.transitions,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_transition_magnitude_top3_pool_qcd:
      snapshotPerTransitionMagnitudeTop3PoolQcd
        ? {
            window_size:
              snapshotPerTransitionMagnitudeTop3PoolQcd.window_size,
            first_week:
              snapshotPerTransitionMagnitudeTop3PoolQcd.first_week,
            last_week:
              snapshotPerTransitionMagnitudeTop3PoolQcd.last_week,
            sustained_p90_threshold:
              snapshotPerTransitionMagnitudeTop3PoolQcd.sustained_p90_threshold,
            threshold:
              snapshotPerTransitionMagnitudeTop3PoolQcd.threshold,
            total_hot_cells:
              snapshotPerTransitionMagnitudeTop3PoolQcd.total_hot_cells,
            top_n:
              snapshotPerTransitionMagnitudeTop3PoolQcd.top_n,
            min_pool_count_for_qcd:
              snapshotPerTransitionMagnitudeTop3PoolQcd.min_pool_count_for_qcd,
            level_qcd_max:
              snapshotPerTransitionMagnitudeTop3PoolQcd.level_qcd_max,
            stark_qcd_min:
              snapshotPerTransitionMagnitudeTop3PoolQcd.stark_qcd_min,
            band_thresholds:
              snapshotPerTransitionMagnitudeTop3PoolQcd.band_thresholds,
            transitions:
              snapshotPerTransitionMagnitudeTop3PoolQcd.transitions,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_transition_magnitude_top3_pool_coefficient_of_range:
      snapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange
        ? {
            window_size:
              snapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange.window_size,
            first_week:
              snapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange.first_week,
            last_week:
              snapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange.last_week,
            sustained_p90_threshold:
              snapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange.sustained_p90_threshold,
            threshold:
              snapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange.threshold,
            total_hot_cells:
              snapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange.total_hot_cells,
            top_n:
              snapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange.top_n,
            min_pool_count_for_cor:
              snapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange.min_pool_count_for_cor,
            level_cor_max:
              snapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange.level_cor_max,
            stark_cor_min:
              snapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange.stark_cor_min,
            band_thresholds:
              snapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange.band_thresholds,
            transitions:
              snapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange.transitions,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_transition_magnitude_top3_pool_bowley_skewness:
      snapshotPerTransitionMagnitudeTop3PoolBowleySkewness
        ? {
            window_size:
              snapshotPerTransitionMagnitudeTop3PoolBowleySkewness.window_size,
            first_week:
              snapshotPerTransitionMagnitudeTop3PoolBowleySkewness.first_week,
            last_week:
              snapshotPerTransitionMagnitudeTop3PoolBowleySkewness.last_week,
            sustained_p90_threshold:
              snapshotPerTransitionMagnitudeTop3PoolBowleySkewness.sustained_p90_threshold,
            threshold:
              snapshotPerTransitionMagnitudeTop3PoolBowleySkewness.threshold,
            total_hot_cells:
              snapshotPerTransitionMagnitudeTop3PoolBowleySkewness.total_hot_cells,
            top_n:
              snapshotPerTransitionMagnitudeTop3PoolBowleySkewness.top_n,
            min_pool_count_for_bowley:
              snapshotPerTransitionMagnitudeTop3PoolBowleySkewness.min_pool_count_for_bowley,
            symmetric_bowley_abs_max:
              snapshotPerTransitionMagnitudeTop3PoolBowleySkewness.symmetric_bowley_abs_max,
            strong_bowley_abs_min:
              snapshotPerTransitionMagnitudeTop3PoolBowleySkewness.strong_bowley_abs_min,
            band_thresholds:
              snapshotPerTransitionMagnitudeTop3PoolBowleySkewness.band_thresholds,
            transitions:
              snapshotPerTransitionMagnitudeTop3PoolBowleySkewness.transitions,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_transition_magnitude_top3_pool_moors_kurtosis:
      snapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis
        ? {
            window_size:
              snapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis.window_size,
            first_week:
              snapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis.first_week,
            last_week:
              snapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis.last_week,
            sustained_p90_threshold:
              snapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis.sustained_p90_threshold,
            threshold:
              snapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis.threshold,
            total_hot_cells:
              snapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis.total_hot_cells,
            top_n:
              snapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis.top_n,
            min_pool_count_for_moors:
              snapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis.min_pool_count_for_moors,
            moors_normal_reference:
              snapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis.moors_normal_reference,
            mesokurtic_moors_deviation_max:
              snapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis.mesokurtic_moors_deviation_max,
            strong_moors_deviation_min:
              snapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis.strong_moors_deviation_min,
            band_thresholds:
              snapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis.band_thresholds,
            transitions:
              snapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis.transitions,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_pair_hot_cells: snapshotPerPairHotCells
      ? {
          window_size: snapshotPerPairHotCells.window_size,
          first_week: snapshotPerPairHotCells.first_week,
          last_week: snapshotPerPairHotCells.last_week,
          sustained_p90_threshold:
            snapshotPerPairHotCells.sustained_p90_threshold,
          threshold: snapshotPerPairHotCells.threshold,
          rows: snapshotPerPairHotCells.rows,
        }
      : {
          skipped_reason: previousSnapshotSkipReason ?? "no_previous_snapshot",
        },
    snapshot_per_reseller_metric_persistence_scorecard_verdict_transition_distribution:
      snapshotPerResellerMetricPersistenceScorecardVerdictTransitionDistribution
        ? {
            window_size:
              snapshotPerResellerMetricPersistenceScorecardVerdictTransitionDistribution.window_size,
            first_week:
              snapshotPerResellerMetricPersistenceScorecardVerdictTransitionDistribution.first_week,
            last_week:
              snapshotPerResellerMetricPersistenceScorecardVerdictTransitionDistribution.last_week,
            sustained_p90_threshold:
              snapshotPerResellerMetricPersistenceScorecardVerdictTransitionDistribution.sustained_p90_threshold,
            threshold:
              snapshotPerResellerMetricPersistenceScorecardVerdictTransitionDistribution.threshold,
            distribution:
              snapshotPerResellerMetricPersistenceScorecardVerdictTransitionDistribution.distribution,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_reseller_persistence_scorecard_verdict:
      snapshotPerResellerPersistenceScorecardVerdict
        ? {
            window_size:
              snapshotPerResellerPersistenceScorecardVerdict.window_size,
            first_week:
              snapshotPerResellerPersistenceScorecardVerdict.first_week,
            last_week:
              snapshotPerResellerPersistenceScorecardVerdict.last_week,
            sustained_p90_threshold:
              snapshotPerResellerPersistenceScorecardVerdict.sustained_p90_threshold,
            threshold:
              snapshotPerResellerPersistenceScorecardVerdict.threshold,
            rows:
              snapshotPerResellerPersistenceScorecardVerdict.rows,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_reseller_persistence_scorecard_verdict_transition:
      snapshotPerResellerPersistenceScorecardVerdictTransition
        ? {
            window_size:
              snapshotPerResellerPersistenceScorecardVerdictTransition.window_size,
            first_week:
              snapshotPerResellerPersistenceScorecardVerdictTransition.first_week,
            last_week:
              snapshotPerResellerPersistenceScorecardVerdictTransition.last_week,
            sustained_p90_threshold:
              snapshotPerResellerPersistenceScorecardVerdictTransition.sustained_p90_threshold,
            threshold:
              snapshotPerResellerPersistenceScorecardVerdictTransition.threshold,
            rows:
              snapshotPerResellerPersistenceScorecardVerdictTransition.rows,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_per_reseller_persistence_scorecard_verdict_transition_distribution:
      snapshotPerResellerPersistenceScorecardVerdictTransitionDistribution
        ? {
            window_size:
              snapshotPerResellerPersistenceScorecardVerdictTransitionDistribution.window_size,
            first_week:
              snapshotPerResellerPersistenceScorecardVerdictTransitionDistribution.first_week,
            last_week:
              snapshotPerResellerPersistenceScorecardVerdictTransitionDistribution.last_week,
            sustained_p90_threshold:
              snapshotPerResellerPersistenceScorecardVerdictTransitionDistribution.sustained_p90_threshold,
            threshold:
              snapshotPerResellerPersistenceScorecardVerdictTransitionDistribution.threshold,
            distribution:
              snapshotPerResellerPersistenceScorecardVerdictTransitionDistribution.distribution,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_persistence_scorecard: snapshotPersistenceScorecard
      ? {
          window_size: snapshotPersistenceScorecard.window_size,
          first_week: snapshotPersistenceScorecard.first_week,
          last_week: snapshotPersistenceScorecard.last_week,
          min_streak_length: snapshotPersistenceScorecard.min_streak_length,
          threshold: snapshotPersistenceScorecard.threshold,
          direction: snapshotPersistenceScorecard.direction,
          magnitude: snapshotPersistenceScorecard.magnitude,
        }
      : {
          skipped_reason:
            previousSnapshotSkipReason ?? "no_previous_snapshot",
        },
    snapshot_persistence_scorecard_verdict:
      snapshotPersistenceScorecardVerdict
        ? {
            verdict: snapshotPersistenceScorecardVerdict.verdict,
            sustained_p90_threshold:
              snapshotPersistenceScorecardVerdict.sustained_p90_threshold,
            direction_sustained:
              snapshotPersistenceScorecardVerdict.direction_sustained,
            magnitude_sustained:
              snapshotPersistenceScorecardVerdict.magnitude_sustained,
            summary: snapshotPersistenceScorecardVerdict.summary,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_persistence_scorecard_verdict_transition:
      snapshotPersistenceScorecardVerdictTransition
        ? {
            transition:
              snapshotPersistenceScorecardVerdictTransition.transition,
            from_verdict:
              snapshotPersistenceScorecardVerdictTransition.from_verdict,
            to_verdict:
              snapshotPersistenceScorecardVerdictTransition.to_verdict,
            from_rank:
              snapshotPersistenceScorecardVerdictTransition.from_rank,
            to_rank: snapshotPersistenceScorecardVerdictTransition.to_rank,
            delta_rank:
              snapshotPersistenceScorecardVerdictTransition.delta_rank,
            summary: snapshotPersistenceScorecardVerdictTransition.summary,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_persistence_scorecard_verdict_transition_distribution_family_alerts:
      snapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlerts
        ? {
            window_size:
              snapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlerts.window_size,
            first_week:
              snapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlerts.first_week,
            last_week:
              snapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlerts.last_week,
            sustained_p90_threshold:
              snapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlerts.sustained_p90_threshold,
            threshold:
              snapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlerts.threshold,
            alerts:
              snapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlerts.alerts,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    snapshot_persistence_scorecard_verdict_transition_distribution:
      snapshotPersistenceScorecardVerdictTransitionDistribution
        ? {
            window_size:
              snapshotPersistenceScorecardVerdictTransitionDistribution.window_size,
            first_week:
              snapshotPersistenceScorecardVerdictTransitionDistribution.first_week,
            last_week:
              snapshotPersistenceScorecardVerdictTransitionDistribution.last_week,
            sustained_p90_threshold:
              snapshotPersistenceScorecardVerdictTransitionDistribution.sustained_p90_threshold,
            threshold:
              snapshotPersistenceScorecardVerdictTransitionDistribution.threshold,
            distribution:
              snapshotPersistenceScorecardVerdictTransitionDistribution.distribution,
          }
        : {
            skipped_reason:
              previousSnapshotSkipReason ?? "no_previous_snapshot",
          },
    ran_at: now.toISOString(),
  };

  // P11.13 snapshot persistence — append one JSONL row so future ticks can
  // compute week-over-week deltas without re-running every Supabase query. A
  // fs failure MUST NOT break the digest response since the email + numeric
  // envelope are the authoritative product; the JSONL is an aid, not a gate.
  try {
    const snapshot = buildDigestSnapshot({
      capturedAt: now,
      week,
      envelope: body,
    });
    const line = serialiseDigestSnapshot(snapshot);
    try {
      mkdirSync(dirname(digestJsonlPath), { recursive: true });
    } catch {
      /* ignore — parent likely exists */
    }
    appendFileSync(digestJsonlPath, line, { encoding: "utf8" });
  } catch (e) {
    console.error("[reseller-weekly-digest] snapshot append failed", e);
  }

  return NextResponse.json(body);
}

export { GET as POST };
