// Weekly digest cross-grain PERSISTENCE-SCORECARD VERDICT-TRANSITION
// DISTRIBUTION-family alerts aggregator (P11.133).
//
// The P11.125/P11.126, P11.127/P11.128, P11.129/P11.130 and P11.131/P11.132
// pairs capstoned the DISTRIBUTION family at ALL FOUR persistence-scorecard
// grains — per-metric, per-partner, per-(partner × metric) and portfolio.
// Every Monday digest now carries four distinct `alert_worthy` scalars
// (one per grain) plus four `net_delta_rank` barometers underneath the
// row-per-KPI / row-per-partner / row-per-pair / single-portfolio tables.
//
// A JSONL consumer that just wants to answer 'is anything alerting THIS
// week, and if so how loud?' had to open all four
// `snapshot_*_persistence_scorecard_verdict_transition_distribution`
// envelopes and re-sum the scalars in their head. This module closes that
// cross-grain aggregation gap by folding the four distribution envelopes
// into a single scalar summary — `total_alerts`, `grains_alerting`,
// `net_delta_rank` sum, plus a `highest_signal_grain` pointer for oncall
// triage. Ops can grep 'total_alerts=17 across 4 grains highest=per_pair'
// out of the JSONL envelope or read one caption line at the top of the
// digest email without walking any of the four grain-level captions below.
//
// Pure derivation — no new folds, no scorecard replay, no new inputs. The
// aggregation is the natural (grain, roll-up) dual of the four grain-level
// distributions: each grain answered 'AT THIS GRAIN, how much changed by
// how much?'; this module answers 'ACROSS GRAINS, how much of the change
// signal is alert-worthy right now?'.
//
// Pure-lib-first per the P11.14 → P11.15 / P11.115 → P11.116 / ... /
// P11.131 → P11.132 cadence — cron-route wiring intentionally deferred to
// a follow-up tick (P11.134) so the cross-grain shape can be exercised in
// isolation before touching the hot Monday cron path (already hosting four
// grains of scorecard + four grains of verdict + four grains of transition
// + four grains of transition distribution captions).
//
// Design notes:
//   • Each of the four inputs is optional. A grain returns null when its
//     source snapshot is missing (fresh install, previousSnapshot skipped,
//     or a rollout that hasn't reached the grain yet). Missing grains are
//     simply skipped in the aggregation — they don't contribute rows OR
//     alerts.
//   • When ALL FOUR inputs are missing, compute returns null. The
//     formatter treats a null snapshot as suppression. There is no
//     'zero-grain' envelope to distinguish 'nothing reported' from
//     'nothing alerting'.
//   • Envelope fields (window_size, first_week, last_week, threshold,
//     sustained_p90_threshold) are sourced from the first non-null input
//     in a fixed priority order — portfolio → per-metric → per-partner →
//     per-pair. All four grains derive from the SAME weekly snapshot so
//     the four sets of envelope fields agree by construction; the
//     priority order is arbitrary but stable so a hand-edited envelope
//     cannot silently drift.
//   • `total_alerts` = sum of alert_worthy across reporting grains.
//     `grains_alerting` = count of reporting grains where alert_worthy>0.
//     `net_delta_rank` = sum of net_delta_rank across reporting grains
//     (positive = ladder-up on balance across the family; negative =
//     ladder-down; zero = balanced).
//   • `highest_signal_grain` points at the reporting grain with the
//     largest alert_worthy scalar (ties broken by the fixed grain-priority
//     order portfolio → per-metric → per-partner → per-pair so the
//     coarser grain wins a tie — a tie at the coarsest grain is a louder
//     ops signal than at the finest). Null when total_alerts === 0.
//   • Formatter suppresses on window_size < 3 (matches every downstream
//     grain suppression) OR on grains_reporting === 0 (no data) OR on
//     total_alerts === 0 (every reporting grain returned quiet — the four
//     grain-level captions below already suppressed themselves). Renders
//     one caption + a short per-grain bullet list with only the
//     alert-emitting grains so a run with only per_pair alerts shows one
//     bullet, not four.
//   • The formatter is designed to splice ABOVE the four grain-level
//     distribution captions (portfolio + per-metric + per-partner +
//     per-pair) as an executive-summary lead so ops sees the roll-up
//     first and drills into the specific grain that owns the largest
//     signal.

import type { DigestSnapshotPersistenceScorecardVerdictTransitionDistribution } from "./digest-snapshot-persistence-scorecard-verdict-transition-distribution";
import type { DigestSnapshotPerMetricPersistenceScorecardVerdictTransitionDistribution } from "./digest-snapshot-per-metric-persistence-scorecard-verdict-transition-distribution";
import type { DigestSnapshotPerResellerPersistenceScorecardVerdictTransitionDistribution } from "./digest-snapshot-per-reseller-persistence-scorecard-verdict-transition-distribution";
import type { DigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransitionDistribution } from "./digest-snapshot-per-reseller-metric-persistence-scorecard-verdict-transition-distribution";

export type PersistenceScorecardDistributionFamilyGrain =
  | "portfolio"
  | "per_metric"
  | "per_partner"
  | "per_pair";

export interface PersistenceScorecardDistributionFamilyPerGrainAlerts {
  readonly grain: PersistenceScorecardDistributionFamilyGrain;
  readonly total: number;
  readonly alert_worthy: number;
  readonly net_delta_rank: number;
}

export interface PersistenceScorecardDistributionFamilyAlerts {
  readonly grains_reporting: number;
  readonly grains_alerting: number;
  readonly total_rows: number;
  readonly total_alerts: number;
  readonly net_delta_rank: number;
  readonly per_grain: readonly PersistenceScorecardDistributionFamilyPerGrainAlerts[];
  readonly highest_signal_grain: PersistenceScorecardDistributionFamilyGrain | null;
}

export interface DigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlerts {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly alerts: PersistenceScorecardDistributionFamilyAlerts;
}

export interface ComputeDistributionFamilyAlertsInputs {
  readonly portfolio?: DigestSnapshotPersistenceScorecardVerdictTransitionDistribution | null;
  readonly per_metric?: DigestSnapshotPerMetricPersistenceScorecardVerdictTransitionDistribution | null;
  readonly per_partner?: DigestSnapshotPerResellerPersistenceScorecardVerdictTransitionDistribution | null;
  readonly per_pair?: DigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransitionDistribution | null;
}

const GRAIN_PRIORITY: readonly PersistenceScorecardDistributionFamilyGrain[] = [
  "portfolio",
  "per_metric",
  "per_partner",
  "per_pair",
] as const;

/**
 * Fold the four distribution envelopes (portfolio, per-metric, per-partner,
 * per-pair) into a single cross-grain scalar summary. Returns null when no
 * grain reports (all four inputs missing/null).
 *
 * The four grains derive from the same weekly snapshot so the envelope
 * window / first_week / last_week / threshold / sustained_p90_threshold
 * fields agree by construction across every non-null input. The output
 * takes the fields from the first non-null grain in the fixed priority
 * order portfolio → per_metric → per_partner → per_pair; the order is
 * arbitrary but stable so a hand-edited envelope cannot drift silently.
 *
 * Per-grain rows are emitted in the fixed priority order for every
 * reporting grain so a JSONL consumer iterating per_grain finds the
 * coarser grains first, matching the visual splice order the formatter
 * will render.
 */
export function computeDigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlerts(
  inputs: ComputeDistributionFamilyAlertsInputs,
): DigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlerts | null {
  const grainInputs: ReadonlyArray<{
    grain: PersistenceScorecardDistributionFamilyGrain;
    envelope:
      | DigestSnapshotPersistenceScorecardVerdictTransitionDistribution
      | DigestSnapshotPerMetricPersistenceScorecardVerdictTransitionDistribution
      | DigestSnapshotPerResellerPersistenceScorecardVerdictTransitionDistribution
      | DigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransitionDistribution
      | null
      | undefined;
  }> = [
    { grain: "portfolio", envelope: inputs.portfolio },
    { grain: "per_metric", envelope: inputs.per_metric },
    { grain: "per_partner", envelope: inputs.per_partner },
    { grain: "per_pair", envelope: inputs.per_pair },
  ];

  const reporting = grainInputs.filter(
    (g): g is { grain: PersistenceScorecardDistributionFamilyGrain; envelope: NonNullable<typeof g.envelope> } =>
      g.envelope != null,
  );

  if (reporting.length === 0) return null;

  const anchor = reporting[0].envelope;

  const per_grain: PersistenceScorecardDistributionFamilyPerGrainAlerts[] = reporting.map(
    ({ grain, envelope }) => ({
      grain,
      total: envelope.distribution.total,
      alert_worthy: envelope.distribution.alert_worthy,
      net_delta_rank: envelope.distribution.net_delta_rank,
    }),
  );

  let total_rows = 0;
  let total_alerts = 0;
  let net_delta_rank = 0;
  let grains_alerting = 0;
  for (const g of per_grain) {
    total_rows += g.total;
    total_alerts += g.alert_worthy;
    net_delta_rank += g.net_delta_rank;
    if (g.alert_worthy > 0) grains_alerting += 1;
  }

  let highest_signal_grain: PersistenceScorecardDistributionFamilyGrain | null = null;
  if (total_alerts > 0) {
    for (const grain of GRAIN_PRIORITY) {
      const row = per_grain.find((g) => g.grain === grain);
      if (!row || row.alert_worthy === 0) continue;
      if (
        highest_signal_grain === null ||
        row.alert_worthy >
          (per_grain.find((g) => g.grain === highest_signal_grain)?.alert_worthy ?? 0)
      ) {
        highest_signal_grain = grain;
      }
    }
  }

  return {
    window_size: anchor.window_size,
    first_week: anchor.first_week,
    last_week: anchor.last_week,
    sustained_p90_threshold: anchor.sustained_p90_threshold,
    threshold: anchor.threshold,
    alerts: {
      grains_reporting: reporting.length,
      grains_alerting,
      total_rows,
      total_alerts,
      net_delta_rank,
      per_grain,
      highest_signal_grain,
    },
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatSignedInt(n: number): string {
  if (n > 0) return `+${n}`;
  return String(n);
}

function grainLabel(grain: PersistenceScorecardDistributionFamilyGrain): string {
  switch (grain) {
    case "portfolio":
      return "portfolio";
    case "per_metric":
      return "per-metric";
    case "per_partner":
      return "per-partner";
    case "per_pair":
      return "per-(partner × metric)";
  }
}

/**
 * Render the cross-grain distribution-family alerts summary as a single-
 * line caption + per-grain bullet list. Designed to splice ABOVE the four
 * grain-level distribution captions (portfolio + per-metric + per-partner
 * + per-pair) as an executive-summary lead so ops sees the roll-up first
 * and drills into the specific grain that owns the largest signal.
 *
 * Returns "" when the snapshot is null OR window_size < 3 (matches every
 * grain-level suppression on the same short-window guard) OR when
 * grains_reporting === 0 (no data) OR when total_alerts === 0 (every
 * reporting grain returned quiet — the four grain-level captions below
 * already suppressed themselves).
 *
 * The bullet list renders only alerting grains in the fixed priority
 * order portfolio → per_metric → per_partner → per_pair so a run with
 * only per_pair alerts resolves to one bullet rather than four
 * zero-alert noise bullets.
 */
export function formatDigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlertsSection(
  snapshot: DigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlerts | null,
): string {
  if (snapshot === null) return "";
  if (snapshot.window_size < 3) return "";
  const a = snapshot.alerts;
  if (a.grains_reporting === 0) return "";
  if (a.total_alerts === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);

  const bulletsHtml = GRAIN_PRIORITY.flatMap((grain) => {
    const row = a.per_grain.find((g) => g.grain === grain);
    if (!row || row.alert_worthy === 0) return [];
    return [
      `<li><strong>${row.alert_worthy}</strong> alert-worthy at the <strong>${escapeHtml(grainLabel(grain))}</strong> grain (n=${row.total}, net &Delta;rank ${escapeHtml(formatSignedInt(row.net_delta_rank))})</li>`,
    ];
  }).join("");

  const highest = a.highest_signal_grain
    ? escapeHtml(grainLabel(a.highest_signal_grain))
    : "";
  const netMoveLabel =
    a.net_delta_rank > 0
      ? "ladder-up on balance"
      : a.net_delta_rank < 0
        ? "ladder-down on balance"
        : "balanced";

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Persistence-scorecard verdict-transition DISTRIBUTION-family alerts across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Executive summary aggregating <code>alert_worthy</code> scalars across the four scorecard grains (portfolio, per-metric, per-partner, per-(partner &times; metric)). <strong>${a.total_alerts}</strong> alert-worthy transitions across <strong>${a.grains_alerting}</strong> of <strong>${a.grains_reporting}</strong> reporting grain(s); highest-signal grain = <strong>${highest}</strong>. Net &Delta;rank summed across the family = <strong>${escapeHtml(formatSignedInt(a.net_delta_rank))}</strong> (${netMoveLabel}).</p>
    <ul style="font-family:Arial,sans-serif;font-size:13px;margin-top:4px">${bulletsHtml}
    </ul>`;
}
