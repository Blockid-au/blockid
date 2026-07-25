import { describe, expect, it } from "vitest";

import type { DigestSnapshotPersistenceScorecard } from "./digest-snapshot-persistence-scorecard";
import type { DigestSnapshotPersistenceScorecardVerdictTransition } from "./digest-snapshot-persistence-scorecard-verdict-transition";
import {
  computeDigestSnapshotPersistenceScorecardVerdictTransitionDistribution,
  formatDigestSnapshotPersistenceScorecardVerdictTransitionDistributionSection,
} from "./digest-snapshot-persistence-scorecard-verdict-transition-distribution";

type TransitionToken =
  DigestSnapshotPersistenceScorecardVerdictTransition["transition"];

function scorecard(
  overrides: Partial<DigestSnapshotPersistenceScorecard> = {},
): DigestSnapshotPersistenceScorecard {
  return {
    window_size: 4,
    first_week: "2026-W28",
    last_week: "2026-W31",
    min_streak_length: 2,
    threshold: 0.25,
    direction: {
      total_streaks: 3,
      p50_length: 2,
      p90_length: 3,
      mean_length: 2.3,
      max_length: 4,
    },
    magnitude: {
      total_streaks: 3,
      p50_length: 2,
      p90_length: 3,
      mean_length: 2.3,
      max_length: 4,
    },
    ...overrides,
  };
}

function transition(
  token: TransitionToken,
  overrides: Partial<DigestSnapshotPersistenceScorecardVerdictTransition> = {},
): DigestSnapshotPersistenceScorecardVerdictTransition {
  const deltaRank = (() => {
    switch (token) {
      case "first_classification":
        return null;
      case "undecidable":
        return null;
      case "stable":
        return 0;
      case "rotated":
        return 0;
      case "improved":
        return 1;
      case "degraded":
        return -1;
    }
  })();
  const fromRank = token === "first_classification" ? null : 0;
  const toRank = token === "improved" ? 1 : token === "degraded" ? -1 : 0;
  return {
    transition: token,
    from_verdict: token === "first_classification" ? null : "flat",
    to_verdict: token === "improved" ? "sustained_direction_only" : "flat",
    from_rank: fromRank,
    to_rank: toRank,
    delta_rank: deltaRank,
    summary: `stub portfolio ${token}`,
    ...overrides,
  };
}

describe("computeDigestSnapshotPersistenceScorecardVerdictTransitionDistribution — envelope passthrough", () => {
  it("carries window_size / first_week / last_week / threshold verbatim from the scorecard", () => {
    const out =
      computeDigestSnapshotPersistenceScorecardVerdictTransitionDistribution(
        transition("improved", { delta_rank: 2 }),
        scorecard({
          window_size: 6,
          first_week: "2026-W26",
          last_week: "2026-W31",
          threshold: 0.3,
        }),
        4,
      );
    expect(out.window_size).toBe(6);
    expect(out.first_week).toBe("2026-W26");
    expect(out.last_week).toBe("2026-W31");
    expect(out.threshold).toBe(0.3);
    expect(out.sustained_p90_threshold).toBe(4);
  });

  it("defaults sustained_p90_threshold to 3 when the arg is omitted", () => {
    const out =
      computeDigestSnapshotPersistenceScorecardVerdictTransitionDistribution(
        transition("improved", { delta_rank: 2 }),
        scorecard(),
      );
    expect(out.sustained_p90_threshold).toBe(3);
  });
});

describe("computeDigestSnapshotPersistenceScorecardVerdictTransitionDistribution — bucket counts (n=1)", () => {
  it("first_classification lands in its own bucket (not alert_worthy)", () => {
    const out =
      computeDigestSnapshotPersistenceScorecardVerdictTransitionDistribution(
        transition("first_classification"),
        scorecard(),
      );
    expect(out.distribution.first_classification).toBe(1);
    expect(out.distribution.alert_worthy).toBe(0);
    expect(out.distribution.net_delta_rank).toBe(0);
    expect(out.distribution.total).toBe(1);
  });

  it("stable lands in its own bucket (not alert_worthy)", () => {
    const out =
      computeDigestSnapshotPersistenceScorecardVerdictTransitionDistribution(
        transition("stable"),
        scorecard(),
      );
    expect(out.distribution.stable).toBe(1);
    expect(out.distribution.alert_worthy).toBe(0);
    expect(out.distribution.net_delta_rank).toBe(0);
    expect(out.distribution.total).toBe(1);
  });

  it("undecidable is alert_worthy but contributes 0 to net_delta_rank", () => {
    const out =
      computeDigestSnapshotPersistenceScorecardVerdictTransitionDistribution(
        transition("undecidable"),
        scorecard(),
      );
    expect(out.distribution.undecidable).toBe(1);
    expect(out.distribution.alert_worthy).toBe(1);
    expect(out.distribution.net_delta_rank).toBe(0);
  });

  it("rotated is alert_worthy but contributes 0 to net_delta_rank", () => {
    const out =
      computeDigestSnapshotPersistenceScorecardVerdictTransitionDistribution(
        transition("rotated"),
        scorecard(),
      );
    expect(out.distribution.rotated).toBe(1);
    expect(out.distribution.alert_worthy).toBe(1);
    expect(out.distribution.net_delta_rank).toBe(0);
  });

  it("improved with delta_rank=1 lands in improved_by_1 and nets +1", () => {
    const out =
      computeDigestSnapshotPersistenceScorecardVerdictTransitionDistribution(
        transition("improved", { delta_rank: 1 }),
        scorecard(),
      );
    expect(out.distribution.improved_by_1).toBe(1);
    expect(out.distribution.improved_by_2).toBe(0);
    expect(out.distribution.improved_by_other).toBe(0);
    expect(out.distribution.alert_worthy).toBe(1);
    expect(out.distribution.net_delta_rank).toBe(1);
  });

  it("improved with delta_rank=2 lands in improved_by_2 and nets +2", () => {
    const out =
      computeDigestSnapshotPersistenceScorecardVerdictTransitionDistribution(
        transition("improved", { delta_rank: 2 }),
        scorecard(),
      );
    expect(out.distribution.improved_by_2).toBe(1);
    expect(out.distribution.improved_by_1).toBe(0);
    expect(out.distribution.alert_worthy).toBe(1);
    expect(out.distribution.net_delta_rank).toBe(2);
  });

  it("degraded with delta_rank=-1 lands in degraded_by_1 and nets -1", () => {
    const out =
      computeDigestSnapshotPersistenceScorecardVerdictTransitionDistribution(
        transition("degraded", { delta_rank: -1 }),
        scorecard(),
      );
    expect(out.distribution.degraded_by_1).toBe(1);
    expect(out.distribution.degraded_by_2).toBe(0);
    expect(out.distribution.alert_worthy).toBe(1);
    expect(out.distribution.net_delta_rank).toBe(-1);
  });

  it("degraded with delta_rank=-2 lands in degraded_by_2 and nets -2", () => {
    const out =
      computeDigestSnapshotPersistenceScorecardVerdictTransitionDistribution(
        transition("degraded", { delta_rank: -2 }),
        scorecard(),
      );
    expect(out.distribution.degraded_by_2).toBe(1);
    expect(out.distribution.degraded_by_1).toBe(0);
    expect(out.distribution.alert_worthy).toBe(1);
    expect(out.distribution.net_delta_rank).toBe(-2);
  });

  it("classifies out-of-range delta_rank into *_by_other buckets defensively", () => {
    const outImp =
      computeDigestSnapshotPersistenceScorecardVerdictTransitionDistribution(
        transition("improved", { delta_rank: 3 }),
        scorecard(),
      );
    expect(outImp.distribution.improved_by_other).toBe(1);
    expect(outImp.distribution.improved_by_2).toBe(0);
    expect(outImp.distribution.improved_by_1).toBe(0);
    expect(outImp.distribution.alert_worthy).toBe(1);
    expect(outImp.distribution.net_delta_rank).toBe(3);

    const outDeg =
      computeDigestSnapshotPersistenceScorecardVerdictTransitionDistribution(
        transition("degraded", { delta_rank: -3 }),
        scorecard(),
      );
    expect(outDeg.distribution.degraded_by_other).toBe(1);
    expect(outDeg.distribution.degraded_by_1).toBe(0);
    expect(outDeg.distribution.degraded_by_2).toBe(0);
    expect(outDeg.distribution.alert_worthy).toBe(1);
    expect(outDeg.distribution.net_delta_rank).toBe(-3);
  });

  it("total is always 1 at the portfolio grain (degenerate n=1 aggregation)", () => {
    const tokens: TransitionToken[] = [
      "first_classification",
      "undecidable",
      "stable",
      "rotated",
      "improved",
      "degraded",
    ];
    for (const token of tokens) {
      const out =
        computeDigestSnapshotPersistenceScorecardVerdictTransitionDistribution(
          transition(token),
          scorecard(),
        );
      expect(out.distribution.total).toBe(1);
    }
  });

  it("bucket counts sum to total across all tokens", () => {
    const tokens: TransitionToken[] = [
      "first_classification",
      "undecidable",
      "stable",
      "rotated",
      "improved",
      "degraded",
    ];
    for (const token of tokens) {
      const out =
        computeDigestSnapshotPersistenceScorecardVerdictTransitionDistribution(
          transition(token),
          scorecard(),
        );
      const sum =
        out.distribution.first_classification +
        out.distribution.undecidable +
        out.distribution.stable +
        out.distribution.rotated +
        out.distribution.improved_by_1 +
        out.distribution.improved_by_2 +
        out.distribution.improved_by_other +
        out.distribution.degraded_by_1 +
        out.distribution.degraded_by_2 +
        out.distribution.degraded_by_other;
      expect(sum).toBe(out.distribution.total);
    }
  });
});

describe("formatDigestSnapshotPersistenceScorecardVerdictTransitionDistributionSection", () => {
  it("returns '' when window_size < 3", () => {
    const out =
      computeDigestSnapshotPersistenceScorecardVerdictTransitionDistribution(
        transition("improved", { delta_rank: 2 }),
        scorecard({ window_size: 2 }),
      );
    expect(
      formatDigestSnapshotPersistenceScorecardVerdictTransitionDistributionSection(
        out,
      ),
    ).toBe("");
  });

  it("returns '' on first_classification (alert_worthy=0)", () => {
    const out =
      computeDigestSnapshotPersistenceScorecardVerdictTransitionDistribution(
        transition("first_classification"),
        scorecard(),
      );
    expect(
      formatDigestSnapshotPersistenceScorecardVerdictTransitionDistributionSection(
        out,
      ),
    ).toBe("");
  });

  it("returns '' on stable (alert_worthy=0)", () => {
    const out =
      computeDigestSnapshotPersistenceScorecardVerdictTransitionDistribution(
        transition("stable"),
        scorecard(),
      );
    expect(
      formatDigestSnapshotPersistenceScorecardVerdictTransitionDistributionSection(
        out,
      ),
    ).toBe("");
  });

  it("renders the caption with n=1, alert_worthy=1, and net Δrank on an improved transition", () => {
    const out =
      computeDigestSnapshotPersistenceScorecardVerdictTransitionDistribution(
        transition("improved", { delta_rank: 2 }),
        scorecard(),
      );
    const html =
      formatDigestSnapshotPersistenceScorecardVerdictTransitionDistributionSection(
        out,
      );
    expect(html).toContain("Portfolio verdict-transition distribution");
    expect(html).toContain("n=<strong>1</strong>");
    expect(html).toContain("<strong>1</strong> alert-worthy");
    expect(html).toContain("+2");
    expect(html).toContain("ladder-up on balance");
    expect(html).toContain("improved by +2 rank");
  });

  it("renders 'ladder-down on balance' on a degraded transition", () => {
    const out =
      computeDigestSnapshotPersistenceScorecardVerdictTransitionDistribution(
        transition("degraded", { delta_rank: -1 }),
        scorecard(),
      );
    const html =
      formatDigestSnapshotPersistenceScorecardVerdictTransitionDistributionSection(
        out,
      );
    expect(html).toContain("ladder-down on balance");
    expect(html).toContain("-1");
    expect(html).toContain("degraded by −1 rank");
  });

  it("renders 'balanced' on rotated (net_delta_rank=0, alert_worthy=1)", () => {
    const out =
      computeDigestSnapshotPersistenceScorecardVerdictTransitionDistribution(
        transition("rotated"),
        scorecard(),
      );
    const html =
      formatDigestSnapshotPersistenceScorecardVerdictTransitionDistributionSection(
        out,
      );
    expect(html).toContain("balanced");
    expect(html).toContain("rotated (axis flipped");
  });

  it("only emits the single non-zero bucket bullet at n=1", () => {
    const out =
      computeDigestSnapshotPersistenceScorecardVerdictTransitionDistribution(
        transition("undecidable"),
        scorecard(),
      );
    const html =
      formatDigestSnapshotPersistenceScorecardVerdictTransitionDistributionSection(
        out,
      );
    expect(html).toContain("undecidable (insufficient_window");
    expect(html).not.toContain("improved by +1 rank");
    expect(html).not.toContain("improved by +2 rank");
    expect(html).not.toContain("degraded by −1 rank");
    expect(html).not.toContain("degraded by −2 rank");
    expect(html).not.toContain("rotated (axis flipped");
    expect(html).not.toContain("improved by other");
    expect(html).not.toContain("degraded by other");
  });

  it("caption embeds the magnitude threshold percent and sustained bar", () => {
    const out =
      computeDigestSnapshotPersistenceScorecardVerdictTransitionDistribution(
        transition("improved", { delta_rank: 2 }),
        scorecard({ threshold: 0.3 }),
        5,
      );
    const html =
      formatDigestSnapshotPersistenceScorecardVerdictTransitionDistributionSection(
        out,
      );
    expect(html).toContain("30.0%");
    expect(html).toContain("sustained bar p90 &ge; 5");
  });

  it("escapes HTML meta-characters in first_week / last_week", () => {
    const out =
      computeDigestSnapshotPersistenceScorecardVerdictTransitionDistribution(
        transition("improved", { delta_rank: 1 }),
        scorecard({
          first_week: "<script>alert(1)</script>",
          last_week: "2026-W31\" onclick=\"alert(1)",
        }),
      );
    const html =
      formatDigestSnapshotPersistenceScorecardVerdictTransitionDistributionSection(
        out,
      );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&quot;");
  });
});
