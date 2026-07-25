import { describe, expect, it } from "vitest";

import type {
  DigestSnapshotPersistenceScorecardVerdict,
  PersistenceScorecardVerdictToken,
} from "./digest-snapshot-persistence-scorecard-verdict";
import {
  computeDigestSnapshotPersistenceScorecardVerdictTransition,
  formatDigestSnapshotPersistenceScorecardVerdictTransitionSection,
} from "./digest-snapshot-persistence-scorecard-verdict-transition";

function verdict(
  token: PersistenceScorecardVerdictToken,
): DigestSnapshotPersistenceScorecardVerdict {
  return {
    verdict: token,
    sustained_p90_threshold: 3,
    direction_sustained:
      token === "sustained_both_axes" || token === "sustained_direction_only",
    magnitude_sustained:
      token === "sustained_both_axes" || token === "sustained_magnitude_only",
    summary: `stub summary for ${token}`,
  };
}

describe("computeDigestSnapshotPersistenceScorecardVerdictTransition — ladder", () => {
  it("emits `first_classification` when there is no previous verdict", () => {
    const t = computeDigestSnapshotPersistenceScorecardVerdictTransition(
      verdict("sustained_both_axes"),
      null,
    );
    expect(t.transition).toBe("first_classification");
    expect(t.from_verdict).toBeNull();
    expect(t.to_verdict).toBe("sustained_both_axes");
    expect(t.from_rank).toBeNull();
    expect(t.to_rank).toBe(2);
    expect(t.delta_rank).toBeNull();
    expect(t.summary).toContain("First verdict");
  });

  it("emits `undecidable` when previous side is insufficient_window", () => {
    const t = computeDigestSnapshotPersistenceScorecardVerdictTransition(
      verdict("sustained_both_axes"),
      verdict("insufficient_window"),
    );
    expect(t.transition).toBe("undecidable");
    expect(t.from_rank).toBe(-1);
    expect(t.to_rank).toBe(2);
    expect(t.delta_rank).toBeNull();
    expect(t.summary).toContain("Undecidable");
  });

  it("emits `undecidable` when current side is insufficient_window", () => {
    const t = computeDigestSnapshotPersistenceScorecardVerdictTransition(
      verdict("insufficient_window"),
      verdict("sustained_both_axes"),
    );
    expect(t.transition).toBe("undecidable");
    expect(t.from_rank).toBe(2);
    expect(t.to_rank).toBe(-1);
    expect(t.delta_rank).toBeNull();
  });

  it("emits `stable` when the verdict token is identical week-over-week", () => {
    const t = computeDigestSnapshotPersistenceScorecardVerdictTransition(
      verdict("sustained_both_axes"),
      verdict("sustained_both_axes"),
    );
    expect(t.transition).toBe("stable");
    expect(t.from_verdict).toBe("sustained_both_axes");
    expect(t.to_verdict).toBe("sustained_both_axes");
    expect(t.delta_rank).toBe(0);
    expect(t.summary).toContain("Stable");
  });

  it("emits `improved` when moving flat → sustained_direction_only", () => {
    const t = computeDigestSnapshotPersistenceScorecardVerdictTransition(
      verdict("sustained_direction_only"),
      verdict("flat"),
    );
    expect(t.transition).toBe("improved");
    expect(t.from_rank).toBe(0);
    expect(t.to_rank).toBe(1);
    expect(t.delta_rank).toBe(1);
    expect(t.summary).toContain("Improved");
  });

  it("emits `improved` when moving sustained_direction_only → sustained_both_axes", () => {
    const t = computeDigestSnapshotPersistenceScorecardVerdictTransition(
      verdict("sustained_both_axes"),
      verdict("sustained_direction_only"),
    );
    expect(t.transition).toBe("improved");
    expect(t.delta_rank).toBe(1);
  });

  it("emits `degraded` when moving sustained_both_axes → sustained_magnitude_only", () => {
    const t = computeDigestSnapshotPersistenceScorecardVerdictTransition(
      verdict("sustained_magnitude_only"),
      verdict("sustained_both_axes"),
    );
    expect(t.transition).toBe("degraded");
    expect(t.from_rank).toBe(2);
    expect(t.to_rank).toBe(1);
    expect(t.delta_rank).toBe(-1);
    expect(t.summary).toContain("Degraded");
  });

  it("emits `degraded` when moving sustained_direction_only → volatile", () => {
    const t = computeDigestSnapshotPersistenceScorecardVerdictTransition(
      verdict("volatile"),
      verdict("sustained_direction_only"),
    );
    expect(t.transition).toBe("degraded");
    expect(t.delta_rank).toBe(-1);
  });

  it("emits `rotated` when axis-count is unchanged but the specific axis flips (direction ↔ magnitude)", () => {
    const t = computeDigestSnapshotPersistenceScorecardVerdictTransition(
      verdict("sustained_magnitude_only"),
      verdict("sustained_direction_only"),
    );
    expect(t.transition).toBe("rotated");
    expect(t.from_rank).toBe(1);
    expect(t.to_rank).toBe(1);
    expect(t.delta_rank).toBe(0);
    expect(t.summary).toContain("Rotated");
  });

  it("emits `rotated` when the zero-rank bucket flips flat ↔ volatile", () => {
    const t = computeDigestSnapshotPersistenceScorecardVerdictTransition(
      verdict("volatile"),
      verdict("flat"),
    );
    expect(t.transition).toBe("rotated");
    expect(t.from_rank).toBe(0);
    expect(t.to_rank).toBe(0);
    expect(t.delta_rank).toBe(0);
  });
});

describe("formatDigestSnapshotPersistenceScorecardVerdictTransitionSection", () => {
  it("returns empty string for first_classification (no baseline to diff)", () => {
    const t = computeDigestSnapshotPersistenceScorecardVerdictTransition(
      verdict("sustained_both_axes"),
      null,
    );
    expect(
      formatDigestSnapshotPersistenceScorecardVerdictTransitionSection(t),
    ).toBe("");
  });

  it("returns empty string for stable (verdict caption above already says it)", () => {
    const t = computeDigestSnapshotPersistenceScorecardVerdictTransition(
      verdict("sustained_both_axes"),
      verdict("sustained_both_axes"),
    );
    expect(
      formatDigestSnapshotPersistenceScorecardVerdictTransitionSection(t),
    ).toBe("");
  });

  it("renders `improved` caption with the token badge + summary", () => {
    const t = computeDigestSnapshotPersistenceScorecardVerdictTransition(
      verdict("sustained_both_axes"),
      verdict("sustained_direction_only"),
    );
    const html =
      formatDigestSnapshotPersistenceScorecardVerdictTransitionSection(t);
    expect(html).toContain("Portfolio verdict transition");
    expect(html).toContain("improved");
    expect(html).toContain("Improved");
    expect(html).toContain("rank 1 → 2");
  });

  it("renders `degraded` caption with the disambiguating summary", () => {
    const t = computeDigestSnapshotPersistenceScorecardVerdictTransition(
      verdict("volatile"),
      verdict("sustained_both_axes"),
    );
    const html =
      formatDigestSnapshotPersistenceScorecardVerdictTransitionSection(t);
    expect(html).toContain("degraded");
    expect(html).toContain("Degraded");
  });

  it("renders `rotated` caption for axis flip within the same rank", () => {
    const t = computeDigestSnapshotPersistenceScorecardVerdictTransition(
      verdict("sustained_magnitude_only"),
      verdict("sustained_direction_only"),
    );
    const html =
      formatDigestSnapshotPersistenceScorecardVerdictTransitionSection(t);
    expect(html).toContain("rotated");
    expect(html).toContain("Rotated");
  });

  it("renders `undecidable` caption when one side is insufficient_window", () => {
    const t = computeDigestSnapshotPersistenceScorecardVerdictTransition(
      verdict("sustained_both_axes"),
      verdict("insufficient_window"),
    );
    const html =
      formatDigestSnapshotPersistenceScorecardVerdictTransitionSection(t);
    expect(html).toContain("undecidable");
    expect(html).toContain("Undecidable");
  });

  it("escapes HTML meta-characters in the summary and token", () => {
    const html =
      formatDigestSnapshotPersistenceScorecardVerdictTransitionSection({
        transition: "degraded",
        from_verdict: "sustained_both_axes",
        to_verdict: "volatile",
        from_rank: 2,
        to_rank: 0,
        delta_rank: -2,
        summary: "<script>alert(1)</script> & 'quotes'",
      });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
  });
});
