import { describe, expect, it } from "vitest";

import type {
  DigestSnapshotPerResellerPersistenceScorecardVerdictTransition,
  PerResellerPersistenceScorecardVerdictTransitionRow,
} from "./digest-snapshot-per-reseller-persistence-scorecard-verdict-transition";
import {
  computeDigestSnapshotPerResellerPersistenceScorecardVerdictTransitionDistribution,
  formatDigestSnapshotPerResellerPersistenceScorecardVerdictTransitionDistributionSection,
} from "./digest-snapshot-per-reseller-persistence-scorecard-verdict-transition-distribution";

type TransitionToken =
  PerResellerPersistenceScorecardVerdictTransitionRow["transition"];

function row(
  code: string,
  transition: TransitionToken,
  overrides: Partial<PerResellerPersistenceScorecardVerdictTransitionRow> = {},
): PerResellerPersistenceScorecardVerdictTransitionRow {
  const base: PerResellerPersistenceScorecardVerdictTransitionRow = {
    reseller_code: code,
    transition,
    from_verdict: transition === "first_classification" ? null : "flat",
    to_verdict: "sustained_both_axes",
    from_rank: transition === "first_classification" ? null : 0,
    to_rank: 2,
    delta_rank: (() => {
      switch (transition) {
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
    })(),
    summary: `stub ${code} ${transition}`,
  };
  return { ...base, ...overrides };
}

function envelope(
  rows: PerResellerPersistenceScorecardVerdictTransitionRow[],
  overrides: Partial<
    Omit<DigestSnapshotPerResellerPersistenceScorecardVerdictTransition, "rows">
  > = {},
): DigestSnapshotPerResellerPersistenceScorecardVerdictTransition {
  return {
    window_size: 4,
    first_week: "2026-W28",
    last_week: "2026-W31",
    sustained_p90_threshold: 3,
    threshold: 0.25,
    rows,
    ...overrides,
  };
}

describe("computeDigestSnapshotPerResellerPersistenceScorecardVerdictTransitionDistribution — envelope passthrough", () => {
  it("carries window_size / first_week / last_week / sustained_p90_threshold / threshold verbatim", () => {
    const t = envelope(
      [row("ACME", "improved", { delta_rank: 2 })],
      {
        window_size: 6,
        first_week: "2026-W26",
        last_week: "2026-W31",
        sustained_p90_threshold: 4,
        threshold: 0.3,
      },
    );
    const out =
      computeDigestSnapshotPerResellerPersistenceScorecardVerdictTransitionDistribution(
        t,
      );
    expect(out.window_size).toBe(6);
    expect(out.first_week).toBe("2026-W26");
    expect(out.last_week).toBe("2026-W31");
    expect(out.sustained_p90_threshold).toBe(4);
    expect(out.threshold).toBe(0.3);
  });

  it("emits total=0 and zero buckets on empty envelope", () => {
    const out =
      computeDigestSnapshotPerResellerPersistenceScorecardVerdictTransitionDistribution(
        envelope([]),
      );
    expect(out.distribution.total).toBe(0);
    expect(out.distribution.first_classification).toBe(0);
    expect(out.distribution.undecidable).toBe(0);
    expect(out.distribution.stable).toBe(0);
    expect(out.distribution.rotated).toBe(0);
    expect(out.distribution.improved_by_1).toBe(0);
    expect(out.distribution.improved_by_2).toBe(0);
    expect(out.distribution.improved_by_other).toBe(0);
    expect(out.distribution.degraded_by_1).toBe(0);
    expect(out.distribution.degraded_by_2).toBe(0);
    expect(out.distribution.degraded_by_other).toBe(0);
    expect(out.distribution.alert_worthy).toBe(0);
    expect(out.distribution.net_delta_rank).toBe(0);
  });
});

describe("computeDigestSnapshotPerResellerPersistenceScorecardVerdictTransitionDistribution — bucket counts", () => {
  it("counts first_classification and stable in dedicated buckets (not alert_worthy)", () => {
    const out =
      computeDigestSnapshotPerResellerPersistenceScorecardVerdictTransitionDistribution(
        envelope([
          row("ACME", "first_classification"),
          row("ZEBRA", "first_classification"),
          row("INFOVISION", "stable"),
        ]),
      );
    expect(out.distribution.first_classification).toBe(2);
    expect(out.distribution.stable).toBe(1);
    expect(out.distribution.alert_worthy).toBe(0);
  });

  it("splits improved rows by |delta_rank| (+1 vs +2)", () => {
    const out =
      computeDigestSnapshotPerResellerPersistenceScorecardVerdictTransitionDistribution(
        envelope([
          row("ACME", "improved", { delta_rank: 1 }),
          row("ZEBRA", "improved", { delta_rank: 2 }),
          row("INFOVISION", "improved", { delta_rank: 2 }),
        ]),
      );
    expect(out.distribution.improved_by_1).toBe(1);
    expect(out.distribution.improved_by_2).toBe(2);
    expect(out.distribution.improved_by_other).toBe(0);
    expect(out.distribution.alert_worthy).toBe(3);
    expect(out.distribution.net_delta_rank).toBe(1 + 2 + 2);
  });

  it("splits degraded rows by |delta_rank| (-1 vs -2)", () => {
    const out =
      computeDigestSnapshotPerResellerPersistenceScorecardVerdictTransitionDistribution(
        envelope([
          row("ACME", "degraded", { delta_rank: -1 }),
          row("ZEBRA", "degraded", { delta_rank: -2 }),
        ]),
      );
    expect(out.distribution.degraded_by_1).toBe(1);
    expect(out.distribution.degraded_by_2).toBe(1);
    expect(out.distribution.degraded_by_other).toBe(0);
    expect(out.distribution.alert_worthy).toBe(2);
    expect(out.distribution.net_delta_rank).toBe(-1 + -2);
  });

  it("classifies out-of-range delta_rank into improved_by_other / degraded_by_other defensively", () => {
    const out =
      computeDigestSnapshotPerResellerPersistenceScorecardVerdictTransitionDistribution(
        envelope([
          row("ACME", "improved", { delta_rank: 3 }),
          row("ZEBRA", "degraded", { delta_rank: -3 }),
        ]),
      );
    expect(out.distribution.improved_by_other).toBe(1);
    expect(out.distribution.degraded_by_other).toBe(1);
    expect(out.distribution.improved_by_1).toBe(0);
    expect(out.distribution.improved_by_2).toBe(0);
    expect(out.distribution.degraded_by_1).toBe(0);
    expect(out.distribution.degraded_by_2).toBe(0);
    expect(out.distribution.alert_worthy).toBe(2);
    expect(out.distribution.net_delta_rank).toBe(3 + -3);
  });

  it("counts rotated and undecidable in dedicated buckets (alert_worthy)", () => {
    const out =
      computeDigestSnapshotPerResellerPersistenceScorecardVerdictTransitionDistribution(
        envelope([
          row("ACME", "rotated"),
          row("ZEBRA", "rotated"),
          row("INFOVISION", "undecidable"),
        ]),
      );
    expect(out.distribution.rotated).toBe(2);
    expect(out.distribution.undecidable).toBe(1);
    expect(out.distribution.alert_worthy).toBe(3);
    // rotated has delta_rank=0 by construction; undecidable has null →
    // both contribute 0 to net_delta_rank.
    expect(out.distribution.net_delta_rank).toBe(0);
  });

  it("total equals the input rows[] length regardless of bucket split", () => {
    const out =
      computeDigestSnapshotPerResellerPersistenceScorecardVerdictTransitionDistribution(
        envelope([
          row("ACME", "improved", { delta_rank: 1 }),
          row("ZEBRA", "degraded", { delta_rank: -2 }),
          row("INFOVISION", "rotated"),
          row("BETA", "stable"),
          row("GAMMA", "first_classification"),
          row("DELTA", "undecidable"),
        ]),
      );
    expect(out.distribution.total).toBe(6);
    expect(
      out.distribution.improved_by_1 +
        out.distribution.improved_by_2 +
        out.distribution.improved_by_other +
        out.distribution.degraded_by_1 +
        out.distribution.degraded_by_2 +
        out.distribution.degraded_by_other +
        out.distribution.rotated +
        out.distribution.undecidable +
        out.distribution.stable +
        out.distribution.first_classification,
    ).toBe(6);
  });

  it("undecidable and first_classification rows never contribute to net_delta_rank", () => {
    const out =
      computeDigestSnapshotPerResellerPersistenceScorecardVerdictTransitionDistribution(
        envelope([
          row("ACME", "undecidable"),
          row("ZEBRA", "first_classification"),
          row("INFOVISION", "improved", { delta_rank: 2 }),
        ]),
      );
    expect(out.distribution.net_delta_rank).toBe(2);
  });

  it("mixed roster nets positive when improvements outweigh degradations", () => {
    const out =
      computeDigestSnapshotPerResellerPersistenceScorecardVerdictTransitionDistribution(
        envelope([
          row("ACME", "improved", { delta_rank: 2 }),
          row("ZEBRA", "improved", { delta_rank: 1 }),
          row("INFOVISION", "degraded", { delta_rank: -1 }),
        ]),
      );
    expect(out.distribution.net_delta_rank).toBe(2);
  });

  it("mixed roster nets negative when degradations outweigh improvements", () => {
    const out =
      computeDigestSnapshotPerResellerPersistenceScorecardVerdictTransitionDistribution(
        envelope([
          row("ACME", "degraded", { delta_rank: -2 }),
          row("ZEBRA", "degraded", { delta_rank: -1 }),
          row("INFOVISION", "improved", { delta_rank: 1 }),
        ]),
      );
    expect(out.distribution.net_delta_rank).toBe(-2);
  });
});

describe("formatDigestSnapshotPerResellerPersistenceScorecardVerdictTransitionDistributionSection", () => {
  it("returns '' when window_size < 3", () => {
    const out =
      computeDigestSnapshotPerResellerPersistenceScorecardVerdictTransitionDistribution(
        envelope(
          [row("ACME", "improved", { delta_rank: 2 })],
          { window_size: 2 },
        ),
      );
    expect(
      formatDigestSnapshotPerResellerPersistenceScorecardVerdictTransitionDistributionSection(
        out,
      ),
    ).toBe("");
  });

  it("returns '' when the envelope has zero rows", () => {
    const out =
      computeDigestSnapshotPerResellerPersistenceScorecardVerdictTransitionDistribution(
        envelope([]),
      );
    expect(
      formatDigestSnapshotPerResellerPersistenceScorecardVerdictTransitionDistributionSection(
        out,
      ),
    ).toBe("");
  });

  it("returns '' when alert_worthy == 0 (all stable / first_classification)", () => {
    const out =
      computeDigestSnapshotPerResellerPersistenceScorecardVerdictTransitionDistribution(
        envelope([
          row("ACME", "stable"),
          row("ZEBRA", "first_classification"),
        ]),
      );
    expect(
      formatDigestSnapshotPerResellerPersistenceScorecardVerdictTransitionDistributionSection(
        out,
      ),
    ).toBe("");
  });

  it("renders the caption with n, alert_worthy, stable, first_classification, and net Δrank", () => {
    const out =
      computeDigestSnapshotPerResellerPersistenceScorecardVerdictTransitionDistribution(
        envelope([
          row("ACME", "improved", { delta_rank: 2 }),
          row("ZEBRA", "degraded", { delta_rank: -1 }),
          row("INFOVISION", "stable"),
          row("BETA", "first_classification"),
        ]),
      );
    const html =
      formatDigestSnapshotPerResellerPersistenceScorecardVerdictTransitionDistributionSection(
        out,
      );
    expect(html).toContain("Per-partner verdict-transition distribution");
    expect(html).toContain("n=<strong>4</strong>");
    expect(html).toContain("<strong>2</strong> alert-worthy");
    expect(html).toContain("<strong>1</strong> stable");
    expect(html).toContain("<strong>1</strong> first-classification");
    expect(html).toContain("+1");
    expect(html).toContain("ladder-up on balance");
  });

  it("only emits non-zero bucket bullets", () => {
    const out =
      computeDigestSnapshotPerResellerPersistenceScorecardVerdictTransitionDistribution(
        envelope([
          row("ACME", "rotated"),
          row("ZEBRA", "undecidable"),
        ]),
      );
    const html =
      formatDigestSnapshotPerResellerPersistenceScorecardVerdictTransitionDistributionSection(
        out,
      );
    expect(html).toContain("rotated (axis flipped");
    expect(html).toContain("undecidable (insufficient_window");
    expect(html).not.toContain("improved by +2 rank");
    expect(html).not.toContain("improved by +1 rank");
    expect(html).not.toContain("degraded by −1 rank");
    expect(html).not.toContain("degraded by −2 rank");
    expect(html).not.toContain("improved by other");
    expect(html).not.toContain("degraded by other");
  });

  it("caption reports 'ladder-down on balance' when net_delta_rank < 0", () => {
    const out =
      computeDigestSnapshotPerResellerPersistenceScorecardVerdictTransitionDistribution(
        envelope([
          row("ACME", "degraded", { delta_rank: -2 }),
          row("ZEBRA", "improved", { delta_rank: 1 }),
        ]),
      );
    const html =
      formatDigestSnapshotPerResellerPersistenceScorecardVerdictTransitionDistributionSection(
        out,
      );
    expect(html).toContain("ladder-down on balance");
    expect(html).toContain("-1");
  });

  it("caption reports 'balanced' when net_delta_rank == 0 with mixed non-zero buckets", () => {
    const out =
      computeDigestSnapshotPerResellerPersistenceScorecardVerdictTransitionDistribution(
        envelope([
          row("ACME", "improved", { delta_rank: 1 }),
          row("ZEBRA", "degraded", { delta_rank: -1 }),
        ]),
      );
    const html =
      formatDigestSnapshotPerResellerPersistenceScorecardVerdictTransitionDistributionSection(
        out,
      );
    expect(html).toContain("balanced");
  });

  it("caption embeds threshold and sustained bar", () => {
    const out =
      computeDigestSnapshotPerResellerPersistenceScorecardVerdictTransitionDistribution(
        envelope([row("ACME", "improved", { delta_rank: 2 })], {
          threshold: 0.3,
          sustained_p90_threshold: 5,
        }),
      );
    const html =
      formatDigestSnapshotPerResellerPersistenceScorecardVerdictTransitionDistributionSection(
        out,
      );
    expect(html).toContain("30.0%");
    expect(html).toContain("sustained bar p90 &ge; 5");
  });

  it("escapes HTML meta-characters in first_week / last_week", () => {
    const out =
      computeDigestSnapshotPerResellerPersistenceScorecardVerdictTransitionDistribution(
        envelope(
          [row("ACME", "improved", { delta_rank: 1 })],
          {
            first_week: "<script>alert(1)</script>",
            last_week: "2026-W31\" onclick=\"alert(1)",
          },
        ),
      );
    const html =
      formatDigestSnapshotPerResellerPersistenceScorecardVerdictTransitionDistributionSection(
        out,
      );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&quot;");
  });

  it("bullet order lists high-signal buckets first (improved_by_2 → improved_by_1 → degraded_by_1 → degraded_by_2 → rotated → undecidable)", () => {
    const out =
      computeDigestSnapshotPerResellerPersistenceScorecardVerdictTransitionDistribution(
        envelope([
          row("ACME", "undecidable"),
          row("ZEBRA", "rotated"),
          row("INFOVISION", "degraded", { delta_rank: -2 }),
          row("BETA", "degraded", { delta_rank: -1 }),
          row("GAMMA", "improved", { delta_rank: 1 }),
          row("DELTA", "improved", { delta_rank: 2 }),
        ]),
      );
    const html =
      formatDigestSnapshotPerResellerPersistenceScorecardVerdictTransitionDistributionSection(
        out,
      );
    const idxImp2 = html.indexOf("improved by +2 rank");
    const idxImp1 = html.indexOf("improved by +1 rank");
    const idxDeg1 = html.indexOf("degraded by −1 rank");
    const idxDeg2 = html.indexOf("degraded by −2 rank");
    const idxRot = html.indexOf("rotated (axis flipped");
    const idxUndec = html.indexOf("undecidable (insufficient_window");
    expect(idxImp2).toBeGreaterThan(-1);
    expect(idxImp1).toBeGreaterThan(idxImp2);
    expect(idxDeg1).toBeGreaterThan(idxImp1);
    expect(idxDeg2).toBeGreaterThan(idxDeg1);
    expect(idxRot).toBeGreaterThan(idxDeg2);
    expect(idxUndec).toBeGreaterThan(idxRot);
  });
});
