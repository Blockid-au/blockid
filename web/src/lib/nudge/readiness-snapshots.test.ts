// Unit tests for readiness snapshot pure helpers (P7b).
//
// Contract: docs/plans/atlassian-standard-mapping-goal.md §P7b.

import { describe, expect, it } from "vitest";
import {
  computeReadinessDelta,
  toSnapshotRow,
  type ReadinessSnapshotRow,
} from "./readiness-snapshots";
import type { NudgeResult } from "./next-steps";

function buildResult(overrides: Partial<NudgeResult> = {}): NudgeResult {
  const base: NudgeResult = {
    current_phase: {
      slug: "6",
      label: "Revenue",
      label_vi: "Doanh thu",
      canonical_stage: "revenue",
      growth_phase_id: "revenue_business_model",
      phase_order: 6,
    },
    next_action: {
      title: "Wire your own Stripe in test-mode",
      reason: "Chapter 5 CTA",
      cta_url: "/dashboard/integrations",
      cta_label: "Open integrations",
      category: "phase_advance",
    },
    missing: [
      {
        category: "1. Corporate & Legal",
        title: "Constitution",
        phase_slug: "1",
        why_it_matters: "raise blocker",
        raise_blocker: true,
        cta_url: "/dashboard/data-room",
      },
      {
        category: "11. Tax (AU)",
        title: "GST registration",
        phase_slug: "6",
        why_it_matters: "gst",
        raise_blocker: true,
        cta_url: "/compliance/gst",
      },
      {
        category: "6. Team & Advisors",
        title: "ESOP Plan Rules",
        phase_slug: "8",
        why_it_matters: "esop",
        raise_blocker: true,
        cta_url: "/dashboard/data-room",
      },
      {
        category: "5. Market & Traction",
        title: "Case study #1",
        phase_slug: "5",
        why_it_matters: "diligence",
        raise_blocker: false,
        cta_url: "/dashboard/data-room",
      },
    ],
    readiness_score: {
      overall: 62,
      sub_scores: { market: 55, team: 70, tech: 60, financial: 50, compliance: 40 },
    },
    readiness_by_phase: {
      "6": {
        score: 62,
        band: "warming-up",
        missing_top3: [],
        criteria_used: ["revenue"],
      },
    },
    nudge_reason: "half done",
    next_step_confidence: "high",
  };
  return { ...base, ...overrides };
}

describe("toSnapshotRow", () => {
  it("projects a NudgeResult into the wire shape with clamped score + derived band", () => {
    const row = toSnapshotRow(buildResult(), {
      userId: "u-1",
      projectId: "p-1",
    });
    expect(row.user_id).toBe("u-1");
    expect(row.project_id).toBe("p-1");
    expect(row.phase_slug).toBe("6");
    expect(row.overall_score).toBe(62);
    expect(row.band).toBe("warming-up");
    expect(row.missing_top3).toHaveLength(3);
    expect(row.missing_top3[0].title).toBe("Constitution");
    expect(row.next_action_title).toBe("Wire your own Stripe in test-mode");
    expect(row.source).toBe("nudge_engine");
  });

  it("keeps project_id null when the founder has no active project", () => {
    const row = toSnapshotRow(buildResult(), { userId: "u-1", projectId: null });
    expect(row.project_id).toBeNull();
  });

  it("clamps out-of-range overall scores + derives 'investor-ready' band at >=75", () => {
    const row = toSnapshotRow(
      buildResult({
        readiness_score: {
          overall: 999,
          sub_scores: { market: 0, team: 0, tech: 0, financial: 0, compliance: 0 },
        },
      }),
      { userId: "u-1", projectId: null },
    );
    expect(row.overall_score).toBe(100);
    expect(row.band).toBe("investor-ready");
  });

  it("floors negative + NaN overall scores to 0 with 'not-ready' band", () => {
    const nan = toSnapshotRow(
      buildResult({
        readiness_score: {
          // deliberately NaN — the pure helper must not throw
          overall: Number.NaN,
          sub_scores: { market: 0, team: 0, tech: 0, financial: 0, compliance: 0 },
        },
      }),
      { userId: "u-1", projectId: null },
    );
    expect(nan.overall_score).toBe(0);
    expect(nan.band).toBe("not-ready");

    const neg = toSnapshotRow(
      buildResult({
        readiness_score: {
          overall: -20,
          sub_scores: { market: 0, team: 0, tech: 0, financial: 0, compliance: 0 },
        },
      }),
      { userId: "u-1", projectId: null },
    );
    expect(neg.overall_score).toBe(0);
    expect(neg.band).toBe("not-ready");
  });

  it("honours an explicit source override (cron / digest / manual)", () => {
    for (const source of ["cron", "digest", "manual"] as const) {
      const row = toSnapshotRow(buildResult(), {
        userId: "u-1",
        projectId: "p-1",
        source,
      });
      expect(row.source).toBe(source);
    }
  });

  it("tolerates a missing next_action title without throwing", () => {
    const row = toSnapshotRow(
      buildResult({
        // Deliberately blank so callers with a partial NudgeResult (older
        // fixtures) round-trip safely.
        next_action: {
          title: "",
          reason: "",
          cta_url: "",
          cta_label: "",
          category: "phase_advance",
        },
      }),
      { userId: "u-1", projectId: null },
    );
    expect(row.next_action_title).toBe("");
  });
});

describe("computeReadinessDelta", () => {
  const base: ReadinessSnapshotRow = {
    user_id: "u-1",
    project_id: "p-1",
    phase_slug: "6",
    overall_score: 62,
    band: "warming-up",
    readiness_by_phase: {},
    missing_top3: [],
    next_action_title: null,
    source: "nudge_engine",
    computed_at: "2026-07-24T00:00:00Z",
  };

  it("returns the first-snapshot summary when previous is null", () => {
    const delta = computeReadinessDelta(base, null);
    expect(delta.score_delta).toBe(0);
    expect(delta.band_direction).toBe("same");
    expect(delta.previous_computed_at).toBeNull();
    expect(delta.summary).toMatch(/First readiness snapshot/i);
  });

  it("computes a positive delta with same band", () => {
    const prev: ReadinessSnapshotRow = {
      ...base,
      overall_score: 55,
      band: "warming-up",
      computed_at: "2026-07-17T00:00:00Z",
    };
    const delta = computeReadinessDelta(base, prev);
    expect(delta.score_delta).toBe(7);
    expect(delta.band_direction).toBe("same");
    expect(delta.summary).toMatch(/\+7 points up/);
    expect(delta.previous_computed_at).toBe("2026-07-17T00:00:00Z");
  });

  it("flags a band-up crossing", () => {
    const prev: ReadinessSnapshotRow = {
      ...base,
      overall_score: 42,
      band: "not-ready",
      computed_at: "2026-07-17T00:00:00Z",
    };
    const delta = computeReadinessDelta(base, prev);
    expect(delta.score_delta).toBe(20);
    expect(delta.band_direction).toBe("up");
    expect(delta.summary).toMatch(/crossed a band boundary upward/);
  });

  it("flags a band-down crossing with a negative delta", () => {
    const current: ReadinessSnapshotRow = {
      ...base,
      overall_score: 40,
      band: "not-ready",
      computed_at: "2026-07-24T00:00:00Z",
    };
    const prev: ReadinessSnapshotRow = {
      ...base,
      overall_score: 80,
      band: "investor-ready",
      computed_at: "2026-07-17T00:00:00Z",
    };
    const delta = computeReadinessDelta(current, prev);
    expect(delta.score_delta).toBe(-40);
    expect(delta.band_direction).toBe("down");
    expect(delta.summary).toMatch(/slipped into a lower readiness band/);
  });

  it("returns 'No change' when both score + band held", () => {
    const prev: ReadinessSnapshotRow = {
      ...base,
      computed_at: "2026-07-17T00:00:00Z",
    };
    const delta = computeReadinessDelta(base, prev);
    expect(delta.score_delta).toBe(0);
    expect(delta.band_direction).toBe("same");
    expect(delta.summary).toMatch(/No change this week/);
  });

  it("clamps non-finite previous scores so a corrupted row cannot crash the digest", () => {
    const prev: ReadinessSnapshotRow = {
      ...base,
      // Corrupted row — the digest must still render a summary.
      overall_score: Number.NaN as unknown as number,
      band: "not-ready",
      computed_at: "2026-07-17T00:00:00Z",
    };
    const delta = computeReadinessDelta(base, prev);
    expect(Number.isFinite(delta.score_delta)).toBe(true);
    expect(delta.score_delta).toBe(62);
    expect(delta.band_direction).toBe("up");
  });
});
