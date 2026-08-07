import { describe, expect, it } from "vitest";

import type {
  DigestSnapshotPerResellerPersistenceScorecardVerdict,
  PerResellerPersistenceScorecardVerdictRow,
} from "./digest-snapshot-per-reseller-persistence-scorecard-verdict";
import type { PersistenceScorecardVerdictToken } from "./digest-snapshot-persistence-scorecard-verdict";
import {
  computeDigestSnapshotPerResellerPersistenceScorecardVerdictTransition,
  formatDigestSnapshotPerResellerPersistenceScorecardVerdictTransitionSection,
} from "./digest-snapshot-per-reseller-persistence-scorecard-verdict-transition";

function row(
  code: string,
  token: PersistenceScorecardVerdictToken,
): PerResellerPersistenceScorecardVerdictRow {
  return {
    reseller_code: code,
    verdict: token,
    direction_sustained:
      token === "sustained_both_axes" || token === "sustained_direction_only",
    magnitude_sustained:
      token === "sustained_both_axes" || token === "sustained_magnitude_only",
    summary: `stub ${code} ${token}`,
  };
}

function envelope(
  rows: PerResellerPersistenceScorecardVerdictRow[],
  overrides: Partial<
    Omit<DigestSnapshotPerResellerPersistenceScorecardVerdict, "rows">
  > = {},
): DigestSnapshotPerResellerPersistenceScorecardVerdict {
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

describe("computeDigestSnapshotPerResellerPersistenceScorecardVerdictTransition — envelope", () => {
  it("carries window_size / first_week / last_week / sustained_p90_threshold / threshold through", () => {
    const current = envelope(
      [row("ACME", "sustained_both_axes")],
      {
        window_size: 5,
        first_week: "2026-W27",
        last_week: "2026-W31",
        sustained_p90_threshold: 4,
        threshold: 0.3,
      },
    );
    const t =
      computeDigestSnapshotPerResellerPersistenceScorecardVerdictTransition(
        current,
        null,
      );
    expect(t.window_size).toBe(5);
    expect(t.first_week).toBe("2026-W27");
    expect(t.last_week).toBe("2026-W31");
    expect(t.sustained_p90_threshold).toBe(4);
    expect(t.threshold).toBe(0.3);
  });

  it("preserves current row order verbatim (no re-sort)", () => {
    const current = envelope([
      row("ACME", "sustained_both_axes"),
      row("INFOVISION", "volatile"),
      row("ZEBRA", "flat"),
    ]);
    const t =
      computeDigestSnapshotPerResellerPersistenceScorecardVerdictTransition(
        current,
        null,
      );
    expect(t.rows.map((r) => r.reseller_code)).toEqual([
      "ACME",
      "INFOVISION",
      "ZEBRA",
    ]);
  });

  it("drops partners only present in previous (tracks current row set, not the union)", () => {
    const current = envelope([
      row("ACME", "sustained_both_axes"),
    ]);
    const previous = envelope([
      row("ACME", "flat"),
      row("ZEBRA", "sustained_both_axes"),
    ]);
    const t =
      computeDigestSnapshotPerResellerPersistenceScorecardVerdictTransition(
        current,
        previous,
      );
    expect(t.rows.length).toBe(1);
    expect(t.rows[0].reseller_code).toBe("ACME");
  });

  it("emits empty rows[] when current envelope has zero rows", () => {
    const t =
      computeDigestSnapshotPerResellerPersistenceScorecardVerdictTransition(
        envelope([]),
        envelope([row("ACME", "sustained_both_axes")]),
      );
    expect(t.rows).toEqual([]);
  });
});

describe("computeDigestSnapshotPerResellerPersistenceScorecardVerdictTransition — ladder per row", () => {
  it("emits `first_classification` for every partner when previous is null", () => {
    const current = envelope([
      row("ACME", "sustained_both_axes"),
      row("INFOVISION", "volatile"),
    ]);
    const t =
      computeDigestSnapshotPerResellerPersistenceScorecardVerdictTransition(
        current,
        null,
      );
    for (const r of t.rows) {
      expect(r.transition).toBe("first_classification");
      expect(r.from_verdict).toBeNull();
      expect(r.from_rank).toBeNull();
      expect(r.delta_rank).toBeNull();
      expect(r.summary).toContain("first verdict");
    }
  });

  it("emits `first_classification` for a partner only in current (not in previous)", () => {
    const current = envelope([
      row("ACME", "sustained_both_axes"),
      row("INFOVISION", "volatile"),
    ]);
    const previous = envelope([
      row("ACME", "sustained_both_axes"),
    ]);
    const t =
      computeDigestSnapshotPerResellerPersistenceScorecardVerdictTransition(
        current,
        previous,
      );
    const infovision = t.rows.find((r) => r.reseller_code === "INFOVISION");
    expect(infovision?.transition).toBe("first_classification");
    const acme = t.rows.find((r) => r.reseller_code === "ACME");
    expect(acme?.transition).toBe("stable");
  });

  it("emits `undecidable` when previous or current side is insufficient_window", () => {
    const t =
      computeDigestSnapshotPerResellerPersistenceScorecardVerdictTransition(
        envelope([
          row("ACME", "sustained_both_axes"),
          row("INFOVISION", "insufficient_window"),
        ]),
        envelope([
          row("ACME", "insufficient_window"),
          row("INFOVISION", "sustained_both_axes"),
        ]),
      );
    const acme = t.rows.find((r) => r.reseller_code === "ACME");
    const infovision = t.rows.find((r) => r.reseller_code === "INFOVISION");
    expect(acme?.transition).toBe("undecidable");
    expect(acme?.delta_rank).toBeNull();
    expect(infovision?.transition).toBe("undecidable");
    expect(infovision?.delta_rank).toBeNull();
  });

  it("emits `stable` when the partner verdict token is identical week-over-week", () => {
    const t =
      computeDigestSnapshotPerResellerPersistenceScorecardVerdictTransition(
        envelope([row("ACME", "sustained_both_axes")]),
        envelope([row("ACME", "sustained_both_axes")]),
      );
    expect(t.rows[0].transition).toBe("stable");
    expect(t.rows[0].delta_rank).toBe(0);
    expect(t.rows[0].summary).toContain("stable verdict");
  });

  it("emits `improved` when the partner moves UP the ladder", () => {
    const t =
      computeDigestSnapshotPerResellerPersistenceScorecardVerdictTransition(
        envelope([row("ACME", "sustained_both_axes")]),
        envelope([row("ACME", "sustained_direction_only")]),
      );
    expect(t.rows[0].transition).toBe("improved");
    expect(t.rows[0].from_rank).toBe(1);
    expect(t.rows[0].to_rank).toBe(2);
    expect(t.rows[0].delta_rank).toBe(1);
    expect(t.rows[0].summary).toContain("improved");
  });

  it("emits `degraded` when the partner moves DOWN the ladder", () => {
    const t =
      computeDigestSnapshotPerResellerPersistenceScorecardVerdictTransition(
        envelope([row("ACME", "volatile")]),
        envelope([row("ACME", "sustained_both_axes")]),
      );
    expect(t.rows[0].transition).toBe("degraded");
    expect(t.rows[0].from_rank).toBe(2);
    expect(t.rows[0].to_rank).toBe(0);
    expect(t.rows[0].delta_rank).toBe(-2);
    expect(t.rows[0].summary).toContain("degraded");
  });

  it("emits `rotated` when axis-count is unchanged but the specific axis flips (direction ↔ magnitude)", () => {
    const t =
      computeDigestSnapshotPerResellerPersistenceScorecardVerdictTransition(
        envelope([row("ACME", "sustained_magnitude_only")]),
        envelope([row("ACME", "sustained_direction_only")]),
      );
    expect(t.rows[0].transition).toBe("rotated");
    expect(t.rows[0].from_rank).toBe(1);
    expect(t.rows[0].to_rank).toBe(1);
    expect(t.rows[0].delta_rank).toBe(0);
    expect(t.rows[0].summary).toContain("rotated");
  });

  it("emits `rotated` when the zero-rank bucket flips flat ↔ volatile", () => {
    const t =
      computeDigestSnapshotPerResellerPersistenceScorecardVerdictTransition(
        envelope([row("ACME", "volatile")]),
        envelope([row("ACME", "flat")]),
      );
    expect(t.rows[0].transition).toBe("rotated");
    expect(t.rows[0].from_rank).toBe(0);
    expect(t.rows[0].to_rank).toBe(0);
    expect(t.rows[0].delta_rank).toBe(0);
  });
});

describe("formatDigestSnapshotPerResellerPersistenceScorecardVerdictTransitionSection", () => {
  it("returns '' when window_size < 3", () => {
    const t =
      computeDigestSnapshotPerResellerPersistenceScorecardVerdictTransition(
        envelope(
          [row("ACME", "sustained_both_axes")],
          { window_size: 2 },
        ),
        envelope(
          [row("ACME", "volatile")],
          { window_size: 2 },
        ),
      );
    expect(
      formatDigestSnapshotPerResellerPersistenceScorecardVerdictTransitionSection(
        t,
      ),
    ).toBe("");
  });

  it("returns '' when zero rows carry an alert-worthy transition (all first_classification/stable)", () => {
    const t =
      computeDigestSnapshotPerResellerPersistenceScorecardVerdictTransition(
        envelope([
          row("ACME", "sustained_both_axes"),
          row("INFOVISION", "volatile"),
        ]),
        envelope([
          row("ACME", "sustained_both_axes"),
          row("INFOVISION", "volatile"),
        ]),
      );
    expect(
      formatDigestSnapshotPerResellerPersistenceScorecardVerdictTransitionSection(
        t,
      ),
    ).toBe("");
  });

  it("returns '' when previous is null (every partner is first_classification)", () => {
    const t =
      computeDigestSnapshotPerResellerPersistenceScorecardVerdictTransition(
        envelope([row("ACME", "sustained_both_axes")]),
        null,
      );
    expect(
      formatDigestSnapshotPerResellerPersistenceScorecardVerdictTransitionSection(
        t,
      ),
    ).toBe("");
  });

  it("suppresses `first_classification` and `stable` rows so only actionable partners render", () => {
    const t =
      computeDigestSnapshotPerResellerPersistenceScorecardVerdictTransition(
        envelope([
          row("ACME", "sustained_both_axes"),
          row("INFOVISION", "volatile"),
          row("ZEBRA", "sustained_direction_only"),
        ]),
        envelope([
          row("ACME", "sustained_both_axes"),
          row("INFOVISION", "sustained_both_axes"),
        ]),
      );
    const html =
      formatDigestSnapshotPerResellerPersistenceScorecardVerdictTransitionSection(
        t,
      );
    expect(html).not.toContain("ACME");
    expect(html).toContain("INFOVISION");
    expect(html).toContain("degraded");
    // ZEBRA resolves to first_classification (absent from previous) and
    // first_classification is a suppressed transition per the formatter
    // contract — matches P11.113 / P11.115 posture on first_classification
    // suppression.
    expect(html).not.toContain("ZEBRA");
  });

  it("renders sustained bar + magnitude threshold in the caption", () => {
    const t =
      computeDigestSnapshotPerResellerPersistenceScorecardVerdictTransition(
        envelope([row("ACME", "sustained_both_axes")]),
        envelope([row("ACME", "volatile")]),
      );
    const html =
      formatDigestSnapshotPerResellerPersistenceScorecardVerdictTransitionSection(
        t,
      );
    expect(html).toContain("Per-partner persistence verdict transition");
    expect(html).toContain("sustained bar p90 &ge; 3");
    expect(html).toContain("25.0%");
  });

  it("escapes HTML meta-characters in the reseller_code, summary and token", () => {
    const html =
      formatDigestSnapshotPerResellerPersistenceScorecardVerdictTransitionSection(
        {
          window_size: 4,
          first_week: "2026-W28",
          last_week: "2026-W31",
          sustained_p90_threshold: 3,
          threshold: 0.25,
          rows: [
            {
              reseller_code: "<ACME>",
              transition: "degraded",
              from_verdict: "sustained_both_axes",
              to_verdict: "volatile",
              from_rank: 2,
              to_rank: 0,
              delta_rank: -2,
              summary: "<script>alert(1)</script> & 'quotes'",
            },
          ],
        },
      );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;ACME&gt;");
    expect(html).toContain("&amp;");
  });
});
