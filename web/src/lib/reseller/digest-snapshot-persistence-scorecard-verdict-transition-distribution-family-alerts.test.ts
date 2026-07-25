import { describe, expect, it } from "vitest";

import type { DigestSnapshotPersistenceScorecardVerdictTransitionDistribution } from "./digest-snapshot-persistence-scorecard-verdict-transition-distribution";
import type { DigestSnapshotPerMetricPersistenceScorecardVerdictTransitionDistribution } from "./digest-snapshot-per-metric-persistence-scorecard-verdict-transition-distribution";
import type { DigestSnapshotPerResellerPersistenceScorecardVerdictTransitionDistribution } from "./digest-snapshot-per-reseller-persistence-scorecard-verdict-transition-distribution";
import type { DigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransitionDistribution } from "./digest-snapshot-per-reseller-metric-persistence-scorecard-verdict-transition-distribution";
import {
  computeDigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlerts,
  formatDigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlertsSection,
} from "./digest-snapshot-persistence-scorecard-verdict-transition-distribution-family-alerts";

const ZERO_BUCKETS = {
  first_classification: 0,
  undecidable: 0,
  stable: 0,
  rotated: 0,
  improved_by_1: 0,
  improved_by_2: 0,
  improved_by_other: 0,
  degraded_by_1: 0,
  degraded_by_2: 0,
  degraded_by_other: 0,
} as const;

function portfolio(
  distribution: Partial<
    DigestSnapshotPersistenceScorecardVerdictTransitionDistribution["distribution"]
  > = {},
  envelopeOverrides: Partial<
    Omit<DigestSnapshotPersistenceScorecardVerdictTransitionDistribution, "distribution">
  > = {},
): DigestSnapshotPersistenceScorecardVerdictTransitionDistribution {
  return {
    window_size: 4,
    first_week: "2026-W28",
    last_week: "2026-W31",
    sustained_p90_threshold: 3,
    threshold: 0.25,
    ...envelopeOverrides,
    distribution: {
      ...ZERO_BUCKETS,
      total: 1,
      alert_worthy: 0,
      net_delta_rank: 0,
      ...distribution,
    },
  };
}

function perMetric(
  distribution: Partial<
    DigestSnapshotPerMetricPersistenceScorecardVerdictTransitionDistribution["distribution"]
  > = {},
  envelopeOverrides: Partial<
    Omit<
      DigestSnapshotPerMetricPersistenceScorecardVerdictTransitionDistribution,
      "distribution"
    >
  > = {},
): DigestSnapshotPerMetricPersistenceScorecardVerdictTransitionDistribution {
  return {
    window_size: 4,
    first_week: "2026-W28",
    last_week: "2026-W31",
    sustained_p90_threshold: 3,
    threshold: 0.25,
    ...envelopeOverrides,
    distribution: {
      ...ZERO_BUCKETS,
      total: 13,
      alert_worthy: 0,
      net_delta_rank: 0,
      ...distribution,
    },
  };
}

function perPartner(
  distribution: Partial<
    DigestSnapshotPerResellerPersistenceScorecardVerdictTransitionDistribution["distribution"]
  > = {},
  envelopeOverrides: Partial<
    Omit<
      DigestSnapshotPerResellerPersistenceScorecardVerdictTransitionDistribution,
      "distribution"
    >
  > = {},
): DigestSnapshotPerResellerPersistenceScorecardVerdictTransitionDistribution {
  return {
    window_size: 4,
    first_week: "2026-W28",
    last_week: "2026-W31",
    sustained_p90_threshold: 3,
    threshold: 0.25,
    ...envelopeOverrides,
    distribution: {
      ...ZERO_BUCKETS,
      total: 3,
      alert_worthy: 0,
      net_delta_rank: 0,
      ...distribution,
    },
  };
}

function perPair(
  distribution: Partial<
    DigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransitionDistribution["distribution"]
  > = {},
  envelopeOverrides: Partial<
    Omit<
      DigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransitionDistribution,
      "distribution"
    >
  > = {},
): DigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransitionDistribution {
  return {
    window_size: 4,
    first_week: "2026-W28",
    last_week: "2026-W31",
    sustained_p90_threshold: 3,
    threshold: 0.25,
    ...envelopeOverrides,
    distribution: {
      ...ZERO_BUCKETS,
      total: 39,
      alert_worthy: 0,
      net_delta_rank: 0,
      ...distribution,
    },
  };
}

describe("computeDigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlerts — reporting", () => {
  it("returns null when all four grains are missing", () => {
    const out =
      computeDigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlerts({});
    expect(out).toBeNull();
  });

  it("returns null when all four grains are explicitly null", () => {
    const out =
      computeDigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlerts({
        portfolio: null,
        per_metric: null,
        per_partner: null,
        per_pair: null,
      });
    expect(out).toBeNull();
  });

  it("counts grains_reporting per non-null input across the four grains", () => {
    const out =
      computeDigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlerts({
        portfolio: portfolio(),
        per_metric: perMetric(),
        per_partner: null,
        per_pair: perPair(),
      });
    expect(out).not.toBeNull();
    expect(out!.alerts.grains_reporting).toBe(3);
    const grains = out!.alerts.per_grain.map((g) => g.grain);
    expect(grains).toEqual(["portfolio", "per_metric", "per_pair"]);
  });

  it("emits per_grain rows in the fixed priority order portfolio → per_metric → per_partner → per_pair", () => {
    const out =
      computeDigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlerts({
        per_pair: perPair(),
        per_partner: perPartner(),
        per_metric: perMetric(),
        portfolio: portfolio(),
      });
    expect(out).not.toBeNull();
    expect(out!.alerts.per_grain.map((g) => g.grain)).toEqual([
      "portfolio",
      "per_metric",
      "per_partner",
      "per_pair",
    ]);
  });
});

describe("computeDigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlerts — envelope passthrough", () => {
  it("takes envelope fields from the portfolio grain when reporting", () => {
    const out =
      computeDigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlerts({
        portfolio: portfolio({}, {
          window_size: 6,
          first_week: "2026-W20",
          last_week: "2026-W25",
          sustained_p90_threshold: 5,
          threshold: 0.3,
        }),
        per_pair: perPair(),
      });
    expect(out).not.toBeNull();
    expect(out!.window_size).toBe(6);
    expect(out!.first_week).toBe("2026-W20");
    expect(out!.last_week).toBe("2026-W25");
    expect(out!.sustained_p90_threshold).toBe(5);
    expect(out!.threshold).toBe(0.3);
  });

  it("falls through to the next priority grain when portfolio is missing", () => {
    const out =
      computeDigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlerts({
        per_metric: perMetric({}, {
          window_size: 8,
          first_week: "2026-W10",
          last_week: "2026-W17",
        }),
        per_partner: perPartner(),
      });
    expect(out).not.toBeNull();
    expect(out!.window_size).toBe(8);
    expect(out!.first_week).toBe("2026-W10");
    expect(out!.last_week).toBe("2026-W17");
  });

  it("falls through to per_pair when the three coarser grains are missing", () => {
    const out =
      computeDigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlerts({
        per_pair: perPair({}, {
          window_size: 5,
          first_week: "2026-W15",
          last_week: "2026-W19",
        }),
      });
    expect(out).not.toBeNull();
    expect(out!.window_size).toBe(5);
    expect(out!.first_week).toBe("2026-W15");
    expect(out!.last_week).toBe("2026-W19");
  });
});

describe("computeDigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlerts — aggregation", () => {
  it("sums total, alert_worthy and net_delta_rank across reporting grains", () => {
    const out =
      computeDigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlerts({
        portfolio: portfolio({ total: 1, alert_worthy: 1, improved_by_1: 1, net_delta_rank: 1 }),
        per_metric: perMetric({ total: 13, alert_worthy: 3, net_delta_rank: -2 }),
        per_partner: perPartner({ total: 3, alert_worthy: 2, net_delta_rank: 1 }),
        per_pair: perPair({ total: 39, alert_worthy: 11, net_delta_rank: -5 }),
      });
    expect(out).not.toBeNull();
    expect(out!.alerts.total_rows).toBe(1 + 13 + 3 + 39);
    expect(out!.alerts.total_alerts).toBe(1 + 3 + 2 + 11);
    expect(out!.alerts.net_delta_rank).toBe(1 + -2 + 1 + -5);
    expect(out!.alerts.grains_reporting).toBe(4);
    expect(out!.alerts.grains_alerting).toBe(4);
  });

  it("counts grains_alerting only for reporting grains where alert_worthy > 0", () => {
    const out =
      computeDigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlerts({
        portfolio: portfolio({ alert_worthy: 0 }),
        per_metric: perMetric({ alert_worthy: 4, degraded_by_1: 4, net_delta_rank: -4 }),
        per_partner: perPartner({ alert_worthy: 0 }),
        per_pair: perPair({ alert_worthy: 0 }),
      });
    expect(out).not.toBeNull();
    expect(out!.alerts.grains_reporting).toBe(4);
    expect(out!.alerts.grains_alerting).toBe(1);
    expect(out!.alerts.total_alerts).toBe(4);
  });

  it("returns highest_signal_grain === null when total_alerts === 0", () => {
    const out =
      computeDigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlerts({
        portfolio: portfolio({ alert_worthy: 0 }),
        per_metric: perMetric({ alert_worthy: 0 }),
        per_partner: perPartner({ alert_worthy: 0 }),
        per_pair: perPair({ alert_worthy: 0 }),
      });
    expect(out).not.toBeNull();
    expect(out!.alerts.total_alerts).toBe(0);
    expect(out!.alerts.highest_signal_grain).toBeNull();
  });

  it("picks the grain with the largest alert_worthy as highest_signal_grain", () => {
    const out =
      computeDigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlerts({
        portfolio: portfolio({ alert_worthy: 1, improved_by_1: 1, net_delta_rank: 1 }),
        per_metric: perMetric({ alert_worthy: 4, degraded_by_1: 4, net_delta_rank: -4 }),
        per_partner: perPartner({ alert_worthy: 2, degraded_by_1: 2, net_delta_rank: -2 }),
        per_pair: perPair({ alert_worthy: 12, degraded_by_1: 12, net_delta_rank: -12 }),
      });
    expect(out).not.toBeNull();
    expect(out!.alerts.highest_signal_grain).toBe("per_pair");
  });

  it("breaks ties by fixed grain priority (coarser grain wins)", () => {
    const out =
      computeDigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlerts({
        portfolio: portfolio({ alert_worthy: 3, degraded_by_1: 3, net_delta_rank: -3 }),
        per_metric: perMetric({ alert_worthy: 3, degraded_by_1: 3, net_delta_rank: -3 }),
        per_partner: perPartner({ alert_worthy: 3, degraded_by_1: 3, net_delta_rank: -3 }),
        per_pair: perPair({ alert_worthy: 3, degraded_by_1: 3, net_delta_rank: -3 }),
      });
    expect(out).not.toBeNull();
    expect(out!.alerts.highest_signal_grain).toBe("portfolio");
  });

  it("skips missing grains from the aggregation (does not treat null as zero rows)", () => {
    const out =
      computeDigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlerts({
        per_pair: perPair({ total: 39, alert_worthy: 5, net_delta_rank: -3 }),
      });
    expect(out).not.toBeNull();
    expect(out!.alerts.grains_reporting).toBe(1);
    expect(out!.alerts.grains_alerting).toBe(1);
    expect(out!.alerts.total_rows).toBe(39);
    expect(out!.alerts.total_alerts).toBe(5);
    expect(out!.alerts.net_delta_rank).toBe(-3);
    expect(out!.alerts.highest_signal_grain).toBe("per_pair");
  });

  it("nets positive when improvements dominate across grains and negative when degradations dominate", () => {
    const positive =
      computeDigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlerts({
        portfolio: portfolio({ alert_worthy: 1, improved_by_2: 1, net_delta_rank: 2 }),
        per_metric: perMetric({ alert_worthy: 2, improved_by_1: 2, net_delta_rank: 2 }),
      });
    expect(positive).not.toBeNull();
    expect(positive!.alerts.net_delta_rank).toBe(4);

    const negative =
      computeDigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlerts({
        portfolio: portfolio({ alert_worthy: 1, degraded_by_1: 1, net_delta_rank: -1 }),
        per_metric: perMetric({ alert_worthy: 2, degraded_by_2: 2, net_delta_rank: -4 }),
      });
    expect(negative).not.toBeNull();
    expect(negative!.alerts.net_delta_rank).toBe(-5);
  });
});

describe("formatDigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlertsSection — suppression", () => {
  it("returns empty on a null snapshot", () => {
    expect(
      formatDigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlertsSection(
        null,
      ),
    ).toBe("");
  });

  it("returns empty when window_size < 3", () => {
    const snapshot =
      computeDigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlerts({
        portfolio: portfolio({ alert_worthy: 1 }, { window_size: 2 }),
      });
    expect(
      formatDigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlertsSection(
        snapshot,
      ),
    ).toBe("");
  });

  it("returns empty when total_alerts === 0 (all reporting grains quiet)", () => {
    const snapshot =
      computeDigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlerts({
        portfolio: portfolio(),
        per_metric: perMetric(),
        per_partner: perPartner(),
        per_pair: perPair(),
      });
    expect(snapshot).not.toBeNull();
    expect(snapshot!.alerts.total_alerts).toBe(0);
    expect(
      formatDigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlertsSection(
        snapshot,
      ),
    ).toBe("");
  });
});

describe("formatDigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlertsSection — rendering", () => {
  it("renders one caption + per-grain bullets for the alerting grains only", () => {
    const snapshot =
      computeDigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlerts({
        portfolio: portfolio({ alert_worthy: 0 }),
        per_metric: perMetric({ alert_worthy: 3, degraded_by_1: 3, net_delta_rank: -3 }),
        per_partner: perPartner({ alert_worthy: 2, degraded_by_1: 2, net_delta_rank: -2 }),
        per_pair: perPair({ alert_worthy: 0 }),
      });
    const html =
      formatDigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlertsSection(
        snapshot,
      );
    expect(html).toContain("DISTRIBUTION-family alerts");
    expect(html).toContain("<strong>5</strong> alert-worthy");
    expect(html).toContain("<strong>2</strong> of <strong>4</strong> reporting grain(s)");
    expect(html).toContain("highest-signal grain = <strong>per-metric</strong>");
    expect(html).toContain("per-metric</strong> grain");
    expect(html).toContain("per-partner</strong> grain");
    expect(html).not.toContain("portfolio</strong> grain");
    expect(html).not.toContain("per-(partner × metric)</strong> grain");
  });

  it("embeds window / first_week / last_week / threshold + sustained bar in the caption", () => {
    const snapshot =
      computeDigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlerts({
        portfolio: portfolio(
          { alert_worthy: 1, improved_by_1: 1, net_delta_rank: 1 },
          {
            window_size: 6,
            first_week: "2026-W20",
            last_week: "2026-W25",
            threshold: 0.3,
            sustained_p90_threshold: 4,
          },
        ),
      });
    const html =
      formatDigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlertsSection(
        snapshot,
      );
    expect(html).toContain("6-week window");
    expect(html).toContain("2026-W20");
    expect(html).toContain("2026-W25");
    expect(html).toContain("30.0% magnitude threshold");
    expect(html).toContain("sustained bar p90 &ge; 4");
  });

  it("labels net_delta_rank direction with ladder-up / ladder-down / balanced", () => {
    const up =
      computeDigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlerts({
        portfolio: portfolio({ alert_worthy: 1, improved_by_2: 1, net_delta_rank: 2 }),
      });
    const down =
      computeDigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlerts({
        portfolio: portfolio({ alert_worthy: 1, degraded_by_2: 1, net_delta_rank: -2 }),
      });
    const flat =
      computeDigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlerts({
        portfolio: portfolio({ alert_worthy: 1, rotated: 1, net_delta_rank: 0 }),
      });
    expect(
      formatDigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlertsSection(
        up,
      ),
    ).toContain("ladder-up on balance");
    expect(
      formatDigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlertsSection(
        down,
      ),
    ).toContain("ladder-down on balance");
    expect(
      formatDigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlertsSection(
        flat,
      ),
    ).toContain("balanced");
  });

  it("HTML-escapes first_week / last_week", () => {
    const snapshot =
      computeDigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlerts({
        portfolio: portfolio(
          { alert_worthy: 1, improved_by_1: 1, net_delta_rank: 1 },
          { first_week: "<w>&\"", last_week: "<w>&\"" },
        ),
      });
    const html =
      formatDigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlertsSection(
        snapshot,
      );
    expect(html).not.toContain("<w>&\"");
    expect(html).toContain("&lt;w&gt;&amp;&quot;");
  });

  it("renders bullets in the fixed priority order portfolio → per_metric → per_partner → per_pair", () => {
    const snapshot =
      computeDigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlerts({
        portfolio: portfolio({ alert_worthy: 1, improved_by_1: 1, net_delta_rank: 1 }),
        per_metric: perMetric({ alert_worthy: 2, improved_by_1: 2, net_delta_rank: 2 }),
        per_partner: perPartner({ alert_worthy: 3, improved_by_1: 3, net_delta_rank: 3 }),
        per_pair: perPair({ alert_worthy: 4, improved_by_1: 4, net_delta_rank: 4 }),
      });
    const html =
      formatDigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlertsSection(
        snapshot,
      );
    const idxPortfolio = html.indexOf("portfolio</strong> grain");
    const idxMetric = html.indexOf("per-metric</strong> grain");
    const idxPartner = html.indexOf("per-partner</strong> grain");
    const idxPair = html.indexOf("per-(partner × metric)</strong> grain");
    expect(idxPortfolio).toBeGreaterThan(-1);
    expect(idxMetric).toBeGreaterThan(idxPortfolio);
    expect(idxPartner).toBeGreaterThan(idxMetric);
    expect(idxPair).toBeGreaterThan(idxPartner);
  });

  it("embeds the alert_worthy scalar and net_delta_rank per bullet", () => {
    const snapshot =
      computeDigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlerts({
        per_metric: perMetric({ alert_worthy: 4, degraded_by_2: 2, degraded_by_1: 2, net_delta_rank: -6 }),
      });
    const html =
      formatDigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlertsSection(
        snapshot,
      );
    expect(html).toContain("<strong>4</strong> alert-worthy at the <strong>per-metric</strong>");
    expect(html).toContain("net &Delta;rank -6");
  });

  it("labels formatSignedInt correctly for positive integers (leading +)", () => {
    const snapshot =
      computeDigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlerts({
        per_pair: perPair({ alert_worthy: 2, improved_by_1: 2, net_delta_rank: 2 }),
      });
    const html =
      formatDigestSnapshotPersistenceScorecardVerdictTransitionDistributionFamilyAlertsSection(
        snapshot,
      );
    expect(html).toContain("net &Delta;rank +2");
    expect(html).toContain("family = <strong>+2</strong>");
  });
});
