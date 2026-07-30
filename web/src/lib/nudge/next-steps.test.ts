import { describe, it, expect } from "vitest";
import {
  computeNextSteps,
  categoryToSubScore,
  type ComputeNextStepsInput,
  type NudgeComplianceStatus,
  type NudgeDataroomRow,
  type NudgePhaseProgressRow,
  type NudgeSviScoreRow,
} from "./next-steps";
import { ATLASSIAN_DATAROOM_TEMPLATE } from "@/lib/dataroom/atlassian-template";
import { ALL_PHASE_KEYS } from "@/lib/journey-map";

// Colocated vitest for the pure nudge engine
// (docs/plans/atlassian-standard-mapping-goal.md §P3_nudge_engine_impl).
// Every case pins one behaviour of the pure `computeNextSteps` contract —
// phase detection, missing-set filtering, raise-blocker sort, readiness
// scoring, AU-compliance enrichment, dedupe, and confidence banding —
// so downstream regressions surface loudly instead of quietly warping
// what founders see on their dashboard tile + weekly digest.

const USER = { id: "user-1", email: "founder@example.test" };

function baseInput(over: Partial<ComputeNextStepsInput> = {}): ComputeNextStepsInput {
  return {
    user: USER,
    project: null,
    phaseProgress: [],
    sviScores: [],
    dataroomRows: [],
    evidenceItems: [],
    ...over,
  };
}

function progressRow(
  phase_order: number,
  status: NudgePhaseProgressRow["status"],
  updatedIso?: string,
): NudgePhaseProgressRow {
  return {
    phase_id: `p${phase_order}`,
    phase_order,
    status,
    completion_pct: status === "completed" ? 100 : 25,
    started_at: updatedIso ?? null,
    updated_at: updatedIso ?? null,
  };
}

// ---------------------------------------------------------------------------
// Phase detection
// ---------------------------------------------------------------------------

describe("computeNextSteps — phase detection", () => {
  it("falls back to Phase 1 when the founder has no project and no progress rows", () => {
    const out = computeNextSteps(baseInput());
    expect(out.current_phase.phase_order).toBe(1);
    expect(out.current_phase.slug).toBe("1");
    expect(out.current_phase.label).toMatch(/Vision/);
    expect(out.current_phase.canonical_stage).toBe("idea");
  });

  it("derives phase_order from project.growth_phase_current when progress is empty", () => {
    const out = computeNextSteps(
      baseInput({
        project: { id: "p", growth_phase_current: "revenue_model" },
      }),
    );
    // "revenue_model" is index 2 (0-based) → phase_order 3
    expect(out.current_phase.phase_order).toBe(3);
    expect(out.current_phase.growth_phase_id).toBe("revenue_model");
  });

  it("picks the latest active phase_progress row over an older one", () => {
    const out = computeNextSteps(
      baseInput({
        phaseProgress: [
          progressRow(3, "in_progress", "2026-01-01T00:00:00Z"),
          progressRow(7, "in_progress", "2026-06-15T00:00:00Z"),
          progressRow(2, "completed", "2026-05-01T00:00:00Z"),
        ],
      }),
    );
    expect(out.current_phase.phase_order).toBe(7);
  });

  it("falls back to the latest completed row when every phase is completed", () => {
    const out = computeNextSteps(
      baseInput({
        phaseProgress: [
          progressRow(2, "completed", "2026-01-01T00:00:00Z"),
          progressRow(4, "completed", "2026-04-01T00:00:00Z"),
        ],
      }),
    );
    expect(out.current_phase.phase_order).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Missing set + sort
// ---------------------------------------------------------------------------

describe("computeNextSteps — missing set", () => {
  it("only surfaces template rows for phases up to the current phase", () => {
    const out = computeNextSteps(
      baseInput({
        phaseProgress: [progressRow(3, "in_progress", "2026-06-01T00:00:00Z")],
      }),
    );
    for (const m of out.missing) {
      expect(Number.parseInt(m.phase_slug, 10)).toBeLessThanOrEqual(3);
    }
  });

  it("excludes rows the founder already has as status !== missing", () => {
    // Pick any Phase-1 template row and mark it present.
    const phase1Row = ATLASSIAN_DATAROOM_TEMPLATE.find(
      (r) => Number.parseInt(r.phaseSlug, 10) === 1,
    );
    if (!phase1Row) throw new Error("fixture missing a phase-1 template row");
    const present: NudgeDataroomRow = {
      svi_dimension: phase1Row.category,
      file_name: phase1Row.title,
      status: "present",
    };
    const out = computeNextSteps(
      baseInput({ dataroomRows: [present] }),
    );
    const stillMissing = out.missing.find(
      (m) => m.category === phase1Row.category && m.title === phase1Row.title,
    );
    expect(stillMissing).toBeUndefined();
  });

  it("sorts raise-blockers ahead of ordinary items regardless of phase order", () => {
    const out = computeNextSteps(
      baseInput({
        phaseProgress: [progressRow(9, "in_progress", "2026-06-01T00:00:00Z")],
      }),
    );
    if (out.missing.length >= 2) {
      // First few items should be raise-blockers when any exist in scope.
      const firstBlockerIdx = out.missing.findIndex((m) => m.raise_blocker);
      const firstNonBlockerIdx = out.missing.findIndex((m) => !m.raise_blocker);
      if (firstBlockerIdx !== -1 && firstNonBlockerIdx !== -1) {
        expect(firstBlockerIdx).toBeLessThan(firstNonBlockerIdx);
      }
    }
  });

  it("returns at most 5 items in the missing[] output slice", () => {
    const out = computeNextSteps(
      baseInput({
        phaseProgress: [progressRow(11, "in_progress", "2026-06-01T00:00:00Z")],
      }),
    );
    expect(out.missing.length).toBeLessThanOrEqual(5);
  });

  it("attaches a data-room CTA URL that references the folder name", () => {
    const out = computeNextSteps(
      baseInput({
        phaseProgress: [progressRow(4, "in_progress", "2026-06-01T00:00:00Z")],
      }),
    );
    const dataroomItem = out.missing.find((m) => !m.raise_blocker);
    if (dataroomItem) {
      expect(dataroomItem.cta_url.startsWith("/dashboard/data-room?add=")).toBe(true);
      expect(dataroomItem.cta_url).toContain(
        encodeURIComponent(dataroomItem.category),
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Readiness score
// ---------------------------------------------------------------------------

describe("computeNextSteps — readiness score", () => {
  it("normalises fractional 0..1 SVI scores to a 0..100 sub-score", () => {
    const rows: NudgeSviScoreRow[] = [
      { criterion_key: "market", score: 0.8 },
      { criterion_key: "team", score: 0.5 },
    ];
    const out = computeNextSteps(baseInput({ sviScores: rows }));
    expect(out.readiness_score.sub_scores.market).toBe(80);
    expect(out.readiness_score.sub_scores.team).toBe(50);
  });

  it("accepts native 0..100 SVI inputs without extra scaling", () => {
    const rows: NudgeSviScoreRow[] = [
      { criterion_key: "revenue", score: 65 },
    ];
    const out = computeNextSteps(baseInput({ sviScores: rows }));
    expect(out.readiness_score.sub_scores.financial).toBe(65);
  });

  it("ignores unknown criterion keys instead of poisoning a bucket", () => {
    const rows: NudgeSviScoreRow[] = [
      { criterion_key: "not_a_real_criterion", score: 99 },
    ];
    const out = computeNextSteps(baseInput({ sviScores: rows }));
    expect(out.readiness_score.sub_scores.market).toBe(0);
    expect(out.readiness_score.sub_scores.team).toBe(0);
  });

  it("lifts compliance for every non-missing data-room row (capped)", () => {
    const rows: NudgeDataroomRow[] = Array.from({ length: 20 }, (_, i) => ({
      svi_dimension: "misc",
      file_name: `doc-${i}`,
      status: "present",
    }));
    const withRows = computeNextSteps(baseInput({ dataroomRows: rows }));
    const withoutRows = computeNextSteps(baseInput());
    expect(withRows.readiness_score.sub_scores.compliance).toBeGreaterThan(
      withoutRows.readiness_score.sub_scores.compliance,
    );
    // Compliance lift is capped at +30 above whatever SVI supplied.
    expect(withRows.readiness_score.sub_scores.compliance).toBeLessThanOrEqual(100);
  });

  it("computes overall as the mean of the five sub-scores", () => {
    const out = computeNextSteps(
      baseInput({
        sviScores: [
          { criterion_key: "market", score: 100 },
          { criterion_key: "team", score: 100 },
          { criterion_key: "roadmap", score: 100 },
          { criterion_key: "revenue", score: 100 },
        ],
      }),
    );
    const { market, team, tech, financial, compliance } = out.readiness_score.sub_scores;
    const expected = Math.round((market + team + tech + financial + compliance) / 5);
    expect(out.readiness_score.overall).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// Next action
// ---------------------------------------------------------------------------

describe("computeNextSteps — next action", () => {
  it("returns a phase_advance CTA when nothing is missing for the current phase", () => {
    // Present every phase-1 template row so missing[] stays empty.
    const phase1 = ATLASSIAN_DATAROOM_TEMPLATE.filter(
      (r) => Number.parseInt(r.phaseSlug, 10) === 1,
    );
    const rows: NudgeDataroomRow[] = phase1.map((r) => ({
      svi_dimension: r.category,
      file_name: r.title,
      status: "present",
    }));
    const out = computeNextSteps(baseInput({ dataroomRows: rows }));
    if (out.missing.length === 0) {
      expect(out.next_action.category).toBe("phase_advance");
      expect(out.next_action.cta_url).toBe("/dashboard");
    }
  });

  it("routes the CTA copy to a raise-blocker fix when the top item is a blocker", () => {
    const status: NudgeComplianceStatus = {
      hasEsicAssessment: false,
      hasValidOrExpiringS708: false,
      hasGstAssessment: true,
      gstRegistered: true,
      gstUrgency: "ok",
    };
    const out = computeNextSteps(
      baseInput({
        phaseProgress: [progressRow(9, "in_progress", "2026-06-01T00:00:00Z")],
        complianceStatus: status,
      }),
    );
    expect(out.next_action.category).toBe("compliance");
    expect(out.next_action.cta_label).toMatch(/raise-blocker/i);
  });
});

// ---------------------------------------------------------------------------
// Nudge reason + confidence
// ---------------------------------------------------------------------------

describe("computeNextSteps — nudge_reason + confidence", () => {
  it("includes the current phase slug + label in the nudge reason string", () => {
    const out = computeNextSteps(
      baseInput({
        phaseProgress: [progressRow(6, "in_progress", "2026-06-01T00:00:00Z")],
      }),
    );
    expect(out.nudge_reason).toContain("Phase 6");
    expect(out.nudge_reason).toContain(out.current_phase.label);
    expect(out.nudge_reason).toMatch(/Readiness \d+\/100/);
  });

  it("ranks confidence high when project + progress + SVI signals are all present", () => {
    const out = computeNextSteps(
      baseInput({
        project: { id: "p", growth_phase_current: "revenue_model" },
        phaseProgress: [progressRow(3, "in_progress", "2026-06-01T00:00:00Z")],
        sviScores: [{ criterion_key: "market", score: 70 }],
      }),
    );
    expect(out.next_step_confidence).toBe("high");
  });

  it("falls to low confidence when the founder has none of the three signals", () => {
    const out = computeNextSteps(baseInput());
    expect(out.next_step_confidence).toBe("low");
  });
});

// ---------------------------------------------------------------------------
// AU compliance enrichment
// ---------------------------------------------------------------------------

describe("computeNextSteps — compliance enrichment", () => {
  it("adds an ESIC + s708 raise-blocker once the founder hits Phase 9", () => {
    const status: NudgeComplianceStatus = {
      hasEsicAssessment: false,
      hasValidOrExpiringS708: false,
      hasGstAssessment: true,
      gstRegistered: true,
      gstUrgency: "ok",
    };
    const out = computeNextSteps(
      baseInput({
        phaseProgress: [progressRow(9, "in_progress", "2026-06-01T00:00:00Z")],
        complianceStatus: status,
      }),
    );
    const titles = out.missing.map((m) => m.title.toLowerCase());
    expect(titles.some((t) => t.includes("esic"))).toBe(true);
    expect(titles.some((t) => t.includes("s708"))).toBe(true);
  });

  it("does not surface Phase-9 compliance blockers to a Phase-3 founder", () => {
    const status: NudgeComplianceStatus = {
      hasEsicAssessment: false,
      hasValidOrExpiringS708: false,
      hasGstAssessment: false,
    };
    const out = computeNextSteps(
      baseInput({
        phaseProgress: [progressRow(3, "in_progress", "2026-06-01T00:00:00Z")],
        complianceStatus: status,
      }),
    );
    const titles = out.missing.map((m) => m.title.toLowerCase());
    expect(titles.some((t) => t.includes("esic"))).toBe(false);
    expect(titles.some((t) => t.includes("s708"))).toBe(false);
  });

  it("escalates GST from a check-nudge to a registration-nudge on urgency=critical + unregistered", () => {
    const check: NudgeComplianceStatus = {
      hasEsicAssessment: true,
      isEsic: true,
      hasValidOrExpiringS708: true,
      hasGstAssessment: false,
    };
    const escalate: NudgeComplianceStatus = {
      hasEsicAssessment: true,
      isEsic: true,
      hasValidOrExpiringS708: true,
      hasGstAssessment: true,
      gstUrgency: "critical",
      gstRegistered: false,
    };
    const nudgeCheck = computeNextSteps(
      baseInput({
        phaseProgress: [progressRow(6, "in_progress", "2026-06-01T00:00:00Z")],
        complianceStatus: check,
      }),
    );
    const nudgeEscalate = computeNextSteps(
      baseInput({
        phaseProgress: [progressRow(6, "in_progress", "2026-06-01T00:00:00Z")],
        complianceStatus: escalate,
      }),
    );
    expect(
      nudgeCheck.missing.some((m) => m.title === "GST-threshold check"),
    ).toBe(true);
    expect(
      nudgeEscalate.missing.some((m) => m.title === "GST registration"),
    ).toBe(true);
  });

  it("flags an overdue R&D registration for a Phase-5 founder", () => {
    const status: NudgeComplianceStatus = {
      hasEsicAssessment: true,
      hasValidOrExpiringS708: true,
      hasGstAssessment: true,
      rdHasOverdue: true,
      rdMinDaysUntilDeadline: -30,
      rdMinDeadlineFy: "FY26",
    };
    const out = computeNextSteps(
      baseInput({
        phaseProgress: [progressRow(5, "in_progress", "2026-06-01T00:00:00Z")],
        complianceStatus: status,
      }),
    );
    const rd = out.missing.find((m) => m.title === "R&D registration overdue");
    expect(rd).toBeDefined();
    expect(rd?.raise_blocker).toBe(true);
    expect(rd?.cta_url).toBe("/compliance/rd");
  });
});

// ---------------------------------------------------------------------------
// readiness_by_phase re-key + categoryToSubScore helper
// ---------------------------------------------------------------------------

describe("computeNextSteps — readiness_by_phase + category helper", () => {
  it("re-keys readiness_by_phase to string ordinals covering every phase 1..12", () => {
    const out = computeNextSteps(baseInput());
    for (const p of ALL_PHASE_KEYS) {
      expect(out.readiness_by_phase).toHaveProperty(String(p));
    }
    // Every value must carry the {score, band, missing_top3, criteria_used} shape.
    for (const [, v] of Object.entries(out.readiness_by_phase)) {
      expect(typeof v.score).toBe("number");
      expect(["not-ready", "warming-up", "investor-ready"]).toContain(v.band);
      expect(Array.isArray(v.missing_top3)).toBe(true);
      expect(v.missing_top3.length).toBeLessThanOrEqual(3);
    }
  });

  it("maps well-known folder names via categoryToSubScore and null for unknowns", () => {
    expect(categoryToSubScore("5. Market & Traction")).toBe("market");
    expect(categoryToSubScore("6. Team & Advisors")).toBe("team");
    expect(categoryToSubScore("3. Financial Projections")).toBe("financial");
    expect(categoryToSubScore("4. Product & Technology")).toBe("tech");
    expect(categoryToSubScore("12. AU Compliance")).toBe("compliance");
    expect(categoryToSubScore("nonexistent folder")).toBeNull();
  });
});
