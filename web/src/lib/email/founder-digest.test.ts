// Unit tests — founder weekly digest email helpers (P7a).
// Contract: docs/plans/atlassian-standard-mapping-goal.md §P7 exit criteria.

import { describe, expect, it } from "vitest";
import {
  buildFounderDigest,
  buildReadinessClimbDeltaSeries,
  buildReadinessClimbSeries,
  formatMoverCallout,
  pickBiggestMover,
} from "./founder-digest";
import type { NudgeMissingItem, NudgeNextAction } from "@/lib/nudge/next-steps";
import type { PhaseReadinessEntry } from "@/lib/nudge/readiness-by-phase";

const nextAction: NudgeNextAction = {
  title: "Add: ESIC eligibility assessment",
  reason:
    "Run the Div 360 ITAA97 self-check — unlocks a 20% offset for your angels.",
  cta_url: "/compliance/esic",
  cta_label: "Fix this raise-blocker",
  category: "compliance",
};

const missingTop3: NudgeMissingItem[] = [
  {
    category: "12. AU Compliance",
    title: "ESIC eligibility assessment",
    phase_slug: "9",
    why_it_matters: "Div 360 ITAA97 — 20% offset + 10-year CGT exemption.",
    raise_blocker: true,
    cta_url: "/compliance/esic",
  },
  {
    category: "1. Corporate & Legal",
    title: "Constitution / Replaceable Rules",
    phase_slug: "1",
    why_it_matters: "Raise-blocker at Phase 1 — investors ask before term-sheet.",
    raise_blocker: true,
    cta_url: "/dashboard/data-room?add=1",
  },
  {
    category: "5. Market & Traction",
    title: "Traction Dashboard",
    phase_slug: "5",
    why_it_matters: "Standard due-diligence artefact for Phase 5.",
    raise_blocker: false,
    cta_url: "/dashboard/data-room?add=5",
  },
];

describe("buildFounderDigest — subject line", () => {
  it("celebrates a band-up crossing", () => {
    const out = buildFounderDigest({
      name: "Sam",
      phaseSlug: "9",
      phaseLabel: "Funding-Ready",
      readinessScore: 78,
      band: "investor-ready",
      deltaSummary:
        "Readiness improved +8 points to 78/100 — crossed a band boundary upward.",
      bandDirection: "up",
      nextAction,
      missingTop3,
      dashboardUrl: "https://blockid.au/dashboard",
    });
    expect(out.subject).toMatch(/investor-ready/i);
    expect(out.subject).toMatch(/78/);
  });

  it("flags a band-down slip with a fix-blocker subject", () => {
    const out = buildFounderDigest({
      name: "Sam",
      phaseSlug: "6",
      phaseLabel: "Revenue / Business Model",
      readinessScore: 48,
      band: "not-ready",
      deltaSummary:
        "Readiness dropped -6 points to 48/100 — slipped into a lower readiness band.",
      bandDirection: "down",
      nextAction,
      missingTop3,
      dashboardUrl: "https://blockid.au/dashboard",
    });
    expect(out.subject).toMatch(/slipped/i);
    expect(out.subject).toMatch(/blocker/i);
  });

  it("uses the neutral phase subject when the band is stable", () => {
    const out = buildFounderDigest({
      name: "Sam",
      phaseSlug: "5",
      phaseLabel: "PMF / Early Traction",
      readinessScore: 62,
      band: "warming-up",
      deltaSummary: "No change this week — readiness held at 62/100.",
      bandDirection: "same",
      nextAction,
      missingTop3,
      dashboardUrl: "https://blockid.au/dashboard",
    });
    expect(out.subject).toMatch(/62\/100/);
    expect(out.subject).toMatch(/Phase 5/);
  });
});

describe("buildFounderDigest — HTML body", () => {
  it("renders score + band + delta + next action + all three gaps", () => {
    const out = buildFounderDigest({
      name: "Sam",
      phaseSlug: "9",
      phaseLabel: "Funding-Ready",
      readinessScore: 78,
      band: "investor-ready",
      deltaSummary:
        "Readiness improved +8 points to 78/100 — crossed a band boundary upward.",
      bandDirection: "up",
      nextAction,
      missingTop3,
      dashboardUrl: "https://blockid.au/dashboard",
      unsubscribeUrl: "https://blockid.au/u/xyz",
    });
    // Score + band
    expect(out.html).toContain(">78<");
    expect(out.html).toContain("Investor-ready");
    // Delta summary
    expect(out.html).toContain("crossed a band boundary upward");
    // Next action
    expect(out.html).toContain("Add: ESIC eligibility assessment");
    expect(out.html).toContain("Fix this raise-blocker");
    expect(out.html).toContain("/compliance/esic");
    // Missing top-3 all present
    expect(out.html).toContain("ESIC eligibility assessment");
    expect(out.html).toContain("Constitution / Replaceable Rules");
    expect(out.html).toContain("Traction Dashboard");
    // Blocker chip fired on the two raise-blockers but not the non-blocker
    expect(out.html.match(/Blocker</g)?.length ?? 0).toBe(2);
    // AFSL disclaimer + unsubscribe link
    expect(out.html).toContain("s766B");
    expect(out.html).toContain("https://blockid.au/u/xyz");
  });

  it("renders the caught-up copy when nextAction is null", () => {
    const out = buildFounderDigest({
      name: "Sam",
      phaseSlug: "5",
      phaseLabel: "PMF",
      readinessScore: 90,
      band: "investor-ready",
      deltaSummary: "No change this week — readiness held at 90/100.",
      bandDirection: "same",
      nextAction: null,
      missingTop3: [],
      dashboardUrl: "https://blockid.au/dashboard",
    });
    expect(out.html).toContain("caught up for this phase");
    // No missing block
    expect(out.html).not.toContain("Top 3 gaps");
  });

  it("clamps out-of-range scores into [0,100]", () => {
    const outHigh = buildFounderDigest({
      name: "S",
      phaseSlug: "1",
      phaseLabel: "Vision",
      readinessScore: 999,
      band: "investor-ready",
      deltaSummary: "",
      bandDirection: "same",
      nextAction: null,
      missingTop3: [],
      dashboardUrl: "https://blockid.au/dashboard",
    });
    expect(outHigh.html).toContain(">100<");
    const outLow = buildFounderDigest({
      name: "S",
      phaseSlug: "1",
      phaseLabel: "Vision",
      readinessScore: Number.NaN,
      band: "not-ready",
      deltaSummary: "",
      bandDirection: "same",
      nextAction: null,
      missingTop3: [],
      dashboardUrl: "https://blockid.au/dashboard",
    });
    expect(outLow.html).toContain(">0<");
  });

  it("escapes name + attributes to prevent HTML/attribute injection", () => {
    const out = buildFounderDigest({
      name: '<script>alert(1)</script>',
      phaseSlug: "1",
      phaseLabel: "Vision",
      readinessScore: 20,
      band: "not-ready",
      deltaSummary: "First readiness snapshot",
      bandDirection: "same",
      nextAction: {
        title: 'Add: "test"',
        reason: 'Reason & why',
        cta_url: '/x?a=1&b="2"',
        cta_label: "Go",
        category: "dataroom",
      },
      missingTop3: [],
      dashboardUrl: "https://blockid.au/dashboard",
    });
    expect(out.html).not.toContain("<script>alert");
    expect(out.html).toContain("&lt;script&gt;");
    expect(out.html).toContain("&quot;test&quot;");
    expect(out.html).toContain("&amp;");
  });
});

describe("buildFounderDigest — readiness climb (P7a-readiness-climb)", () => {
  const climb: Record<string, PhaseReadinessEntry> = {
    "1": { score: 90, band: "investor-ready", missing_top3: [], criteria_used: [] },
    "3": { score: 62, band: "warming-up", missing_top3: [], criteria_used: [] },
    "5": { score: 45, band: "not-ready", missing_top3: [], criteria_used: [] },
    // Phase 9 deliberately omitted → gap-fill to 0 / not-ready
    "12": { score: 15, band: "not-ready", missing_top3: [], criteria_used: [] },
  };

  it("omits the section when readinessByPhase is absent (back-compat)", () => {
    const out = buildFounderDigest({
      name: "Sam",
      phaseSlug: "5",
      phaseLabel: "PMF",
      readinessScore: 45,
      band: "not-ready",
      deltaSummary: "First readiness snapshot.",
      bandDirection: "same",
      nextAction: null,
      missingTop3: [],
      dashboardUrl: "https://blockid.au/dashboard",
    });
    expect(out.html).not.toContain("Readiness across all 12 phases");
    expect(out.text).not.toContain("Readiness across all 12 phases");
  });

  it("renders the 12-phase spark with the current phase outlined", () => {
    const out = buildFounderDigest({
      name: "Sam",
      phaseSlug: "5",
      phaseLabel: "PMF",
      readinessScore: 45,
      band: "not-ready",
      deltaSummary: "Readiness held at 45/100.",
      bandDirection: "same",
      nextAction: null,
      missingTop3: [],
      dashboardUrl: "https://blockid.au/dashboard",
      readinessByPhase: climb,
    });
    expect(out.html).toContain("Readiness across all 12 phases");
    // Every phase 1..12 renders a cell.
    for (const p of ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]) {
      expect(out.html).toContain(`Phase ${p} —`);
    }
    // The current phase's tooltip carries its known score.
    expect(out.html).toContain("Phase 5 — 45/100");
    // The current-phase bar carries the teal outline.
    expect(out.html).toMatch(/border:2px solid #0f766e/);
    // Text mirror lists all 12 phases + marks the current phase with ▶.
    expect(out.text).toMatch(/Readiness across all 12 phases:/);
    expect(out.text).toMatch(/▶ Phase 5: 45\/100 \(Not investor-ready yet\)/);
    // Gap-filled phase (9 omitted from input) still renders at 0.
    expect(out.text).toMatch(/Phase 9: 0\/100 \(Not investor-ready yet\)/);
  });

  it("gap-fills missing phases + clamps non-finite scores", () => {
    const messy: Record<string, PhaseReadinessEntry> = {
      "1": { score: 999, band: "investor-ready", missing_top3: [], criteria_used: [] },
      "2": { score: Number.NaN, band: "not-ready", missing_top3: [], criteria_used: [] },
      "4": { score: -20, band: "not-ready", missing_top3: [], criteria_used: [] },
    };
    const series = buildReadinessClimbSeries(messy, "4");
    expect(series).toHaveLength(12);
    expect(series[0]).toMatchObject({ phase: "1", score: 100, band: "investor-ready" });
    expect(series[1]).toMatchObject({ phase: "2", score: 0, band: "not-ready" });
    expect(series[3]).toMatchObject({ phase: "4", score: 0, isCurrent: true });
    // Gap fills for the untouched phases.
    expect(series[2]).toMatchObject({ phase: "3", score: 0, band: "not-ready", isCurrent: false });
    // Exactly one cell is flagged current.
    expect(series.filter((c) => c.isCurrent)).toHaveLength(1);
  });

  it("escapes phase labels + tooltips (no HTML injection from band data)", () => {
    const evil: Record<string, PhaseReadinessEntry> = {
      "1": {
        score: 30,
        band: "not-ready",
        missing_top3: [],
        criteria_used: [],
      },
    };
    const out = buildFounderDigest({
      name: "Sam",
      phaseSlug: "1",
      phaseLabel: "Vision",
      readinessScore: 30,
      band: "not-ready",
      deltaSummary: "",
      bandDirection: "same",
      nextAction: null,
      missingTop3: [],
      dashboardUrl: "https://blockid.au/dashboard",
      readinessByPhase: evil,
    });
    // No raw HTML sneaks through the tooltip.
    expect(out.html).not.toContain("<script>");
    // The current-phase label wording uses escaped HTML output.
    expect(out.html).toContain("Your Phase 1 column is outlined in teal.");
  });
});

describe("buildFounderDigest — week-over-week climb delta (P7a-climb-delta)", () => {
  const currentClimb: Record<string, PhaseReadinessEntry> = {
    "1": { score: 90, band: "investor-ready", missing_top3: [], criteria_used: [] },
    "3": { score: 65, band: "warming-up", missing_top3: [], criteria_used: [] },
    "5": { score: 55, band: "warming-up", missing_top3: [], criteria_used: [] },
    "9": { score: 40, band: "not-ready", missing_top3: [], criteria_used: [] },
  };
  const previousClimb: Record<string, PhaseReadinessEntry> = {
    "1": { score: 88, band: "investor-ready", missing_top3: [], criteria_used: [] },
    "3": { score: 70, band: "warming-up", missing_top3: [], criteria_used: [] },
    "5": { score: 55, band: "warming-up", missing_top3: [], criteria_used: [] },
    // Phase 9 absent from previous → this week's 40 is "new" for phase 9.
  };

  it("silently omits the delta section when previous snapshot is absent", () => {
    const out = buildFounderDigest({
      name: "Sam",
      phaseSlug: "5",
      phaseLabel: "PMF",
      readinessScore: 55,
      band: "warming-up",
      deltaSummary: "First snapshot",
      bandDirection: "same",
      nextAction: null,
      missingTop3: [],
      dashboardUrl: "https://blockid.au/dashboard",
      readinessByPhase: currentClimb,
    });
    expect(out.html).not.toContain("Week-over-week climb");
    expect(out.text).not.toContain("Week-over-week climb");
  });

  it("renders the delta table with signed +/-, ★ new, — same, and highlights the current phase", () => {
    const out = buildFounderDigest({
      name: "Sam",
      phaseSlug: "9",
      phaseLabel: "Funding-Ready",
      readinessScore: 40,
      band: "not-ready",
      deltaSummary: "Phase-9 warming",
      bandDirection: "same",
      nextAction: null,
      missingTop3: [],
      dashboardUrl: "https://blockid.au/dashboard",
      readinessByPhase: currentClimb,
      previousReadinessByPhase: previousClimb,
    });
    expect(out.html).toContain("Week-over-week climb");
    // Phase 1 climbed +2 (▲).
    expect(out.html).toMatch(/Phase 1[^<]*<\/td>[\s\S]*?88\/100[\s\S]*?90\/100[\s\S]*?▲ \+2/);
    // Phase 3 slipped -5 (▼).
    expect(out.html).toMatch(/Phase 3[^<]*<\/td>[\s\S]*?70\/100[\s\S]*?65\/100[\s\S]*?▼ -5/);
    // Phase 5 unchanged (—).
    expect(out.html).toMatch(/Phase 5[^<]*<\/td>[\s\S]*?55\/100[\s\S]*?55\/100[\s\S]*?— 0/);
    // Phase 9 is new + carries the "you are here" chip.
    expect(out.html).toMatch(/Phase 9 · you are here/);
    expect(out.html).toMatch(/★ new/);
    // Current row is highlighted with the cyan-50 band + bold weight.
    expect(out.html).toMatch(/background:#ecfeff;font-weight:600/);
    // Text mirror walks the same rows with the same arrows.
    expect(out.text).toMatch(/Week-over-week climb/);
    expect(out.text).toMatch(/Phase 1: 88\/100 → 90\/100 \(▲ \+2\)/);
    expect(out.text).toMatch(/Phase 3: 70\/100 → 65\/100 \(▼ -5\)/);
    expect(out.text).toMatch(/▶ Phase 9: 0\/100 → 40\/100 \(★ new\)/);
  });

  it("omits the delta section entirely when nothing moved (all same-band + zero delta)", () => {
    const flat: Record<string, PhaseReadinessEntry> = {
      "1": { score: 50, band: "warming-up", missing_top3: [], criteria_used: [] },
    };
    const out = buildFounderDigest({
      name: "Sam",
      phaseSlug: "1",
      phaseLabel: "Vision",
      readinessScore: 50,
      band: "warming-up",
      deltaSummary: "Held steady",
      bandDirection: "same",
      nextAction: null,
      missingTop3: [],
      dashboardUrl: "https://blockid.au/dashboard",
      readinessByPhase: flat,
      previousReadinessByPhase: flat,
    });
    expect(out.html).not.toContain("Week-over-week climb");
    expect(out.text).not.toContain("Week-over-week climb");
  });

  it("buildReadinessClimbDeltaSeries — pure helper branch matrix", () => {
    const series = buildReadinessClimbDeltaSeries(currentClimb, previousClimb, "9");
    expect(series).toHaveLength(12);
    const phase1 = series.find((c) => c.phase === "1")!;
    expect(phase1).toMatchObject({
      currScore: 90,
      prevScore: 88,
      delta: 2,
      direction: "up",
      isCurrent: false,
    });
    const phase3 = series.find((c) => c.phase === "3")!;
    expect(phase3).toMatchObject({
      currScore: 65,
      prevScore: 70,
      delta: -5,
      direction: "down",
    });
    const phase5 = series.find((c) => c.phase === "5")!;
    expect(phase5.direction).toBe("same");
    expect(phase5.delta).toBe(0);
    const phase9 = series.find((c) => c.phase === "9")!;
    expect(phase9).toMatchObject({
      currScore: 40,
      prevScore: 0,
      direction: "new",
      isCurrent: true,
    });
    // Gap-filled phases still return same/0.
    const phase12 = series.find((c) => c.phase === "12")!;
    expect(phase12).toMatchObject({
      currScore: 0,
      prevScore: 0,
      direction: "same",
      delta: 0,
    });
    // Exactly one row is flagged current.
    expect(series.filter((c) => c.isCurrent)).toHaveLength(1);
  });

  it("buildReadinessClimbDeltaSeries — non-finite previous scores fall back to 0 (no NaN leak)", () => {
    const messyPrev: Record<string, PhaseReadinessEntry> = {
      "1": {
        score: Number.NaN,
        band: "not-ready",
        missing_top3: [],
        criteria_used: [],
      },
      "2": {
        score: 40,
        band: "not-ready",
        missing_top3: [],
        criteria_used: [],
      },
    };
    const curr: Record<string, PhaseReadinessEntry> = {
      "1": { score: 30, band: "not-ready", missing_top3: [], criteria_used: [] },
      "2": { score: 30, band: "not-ready", missing_top3: [], criteria_used: [] },
    };
    const series = buildReadinessClimbDeltaSeries(curr, messyPrev, "1");
    const p1 = series.find((c) => c.phase === "1")!;
    // NaN previous → treated as no-prior → direction "new" (curr > 0).
    expect(p1.direction).toBe("new");
    expect(p1.prevScore).toBe(0);
    expect(Number.isFinite(p1.delta)).toBe(true);
    const p2 = series.find((c) => c.phase === "2")!;
    // Real 40 previous → -10 down.
    expect(p2.direction).toBe("down");
    expect(p2.delta).toBe(-10);
  });
});

describe("buildFounderDigest — biggest mover callout (P7a-mover-callout)", () => {
  const currentClimb: Record<string, PhaseReadinessEntry> = {
    "1": { score: 90, band: "investor-ready", missing_top3: [], criteria_used: [] },
    "3": { score: 65, band: "warming-up", missing_top3: [], criteria_used: [] },
    "5": { score: 55, band: "warming-up", missing_top3: [], criteria_used: [] },
    "9": { score: 40, band: "not-ready", missing_top3: [], criteria_used: [] },
  };
  const previousClimb: Record<string, PhaseReadinessEntry> = {
    "1": { score: 88, band: "investor-ready", missing_top3: [], criteria_used: [] },
    "3": { score: 70, band: "warming-up", missing_top3: [], criteria_used: [] },
    "5": { score: 55, band: "warming-up", missing_top3: [], criteria_used: [] },
  };

  it("renders the biggest-mover callout above the delta table when climb moved", () => {
    const out = buildFounderDigest({
      name: "Sam",
      phaseSlug: "9",
      phaseLabel: "Funding-Ready",
      readinessScore: 40,
      band: "not-ready",
      deltaSummary: "Phase-9 warming",
      bandDirection: "same",
      nextAction: null,
      missingTop3: [],
      dashboardUrl: "https://blockid.au/dashboard",
      readinessByPhase: currentClimb,
      previousReadinessByPhase: previousClimb,
    });
    expect(out.html).toContain("Biggest mover this week");
    // Phase 9 entered at 40 — magnitude 40 beats phase 3's -5 and phase 1's +2.
    expect(out.html).toMatch(/Phase 9 \(you are here\) entered your readiness map at 40\/100/);
    expect(out.html).toContain("★");
    // Callout ordering: callout appears before the delta table in the HTML.
    const moverIndex = out.html.indexOf("Biggest mover this week");
    const tableIndex = out.html.indexOf("Week-over-week climb");
    expect(moverIndex).toBeGreaterThan(-1);
    expect(tableIndex).toBeGreaterThan(moverIndex);
    // Text mirror carries the same headline.
    expect(out.text).toMatch(/Biggest mover this week: ★ Phase 9 \(you are here\) entered your readiness map at 40\/100/);
  });

  it("omits the callout when nothing moved (mirrors the delta-table omit rule)", () => {
    const flat: Record<string, PhaseReadinessEntry> = {
      "1": { score: 50, band: "warming-up", missing_top3: [], criteria_used: [] },
    };
    const out = buildFounderDigest({
      name: "Sam",
      phaseSlug: "1",
      phaseLabel: "Vision",
      readinessScore: 50,
      band: "warming-up",
      deltaSummary: "Held steady",
      bandDirection: "same",
      nextAction: null,
      missingTop3: [],
      dashboardUrl: "https://blockid.au/dashboard",
      readinessByPhase: flat,
      previousReadinessByPhase: flat,
    });
    expect(out.html).not.toContain("Biggest mover this week");
    expect(out.text).not.toContain("Biggest mover this week");
  });

  it("omits the callout when previous snapshot is absent (first digest)", () => {
    const out = buildFounderDigest({
      name: "Sam",
      phaseSlug: "5",
      phaseLabel: "PMF",
      readinessScore: 55,
      band: "warming-up",
      deltaSummary: "First snapshot",
      bandDirection: "same",
      nextAction: null,
      missingTop3: [],
      dashboardUrl: "https://blockid.au/dashboard",
      readinessByPhase: currentClimb,
    });
    expect(out.html).not.toContain("Biggest mover this week");
    expect(out.text).not.toContain("Biggest mover this week");
  });

  it("pickBiggestMover — magnitude wins over sign, and current-phase breaks ties", () => {
    // A down-move of -8 beats an up-move of +5.
    const series = buildReadinessClimbDeltaSeries(
      {
        "3": { score: 62, band: "warming-up", missing_top3: [], criteria_used: [] },
        "7": { score: 55, band: "warming-up", missing_top3: [], criteria_used: [] },
      },
      {
        "3": { score: 70, band: "warming-up", missing_top3: [], criteria_used: [] },
        "7": { score: 50, band: "warming-up", missing_top3: [], criteria_used: [] },
      },
      "3",
    );
    const mover = pickBiggestMover(series);
    expect(mover?.phase).toBe("3");
    expect(mover?.direction).toBe("down");
    expect(mover?.delta).toBe(-8);

    // Ties: same magnitude, current phase wins.
    const tie = buildReadinessClimbDeltaSeries(
      {
        "2": { score: 60, band: "warming-up", missing_top3: [], criteria_used: [] },
        "6": { score: 40, band: "not-ready", missing_top3: [], criteria_used: [] },
      },
      {
        "2": { score: 55, band: "warming-up", missing_top3: [], criteria_used: [] },
        "6": { score: 45, band: "not-ready", missing_top3: [], criteria_used: [] },
      },
      "6",
    );
    const tieMover = pickBiggestMover(tie);
    // Both have magnitude 5; the current phase (6) wins over phase 2.
    expect(tieMover?.phase).toBe("6");
    expect(tieMover?.isCurrent).toBe(true);

    // Ties with no current phase in the tied set: earlier phase wins.
    const tieAscending = buildReadinessClimbDeltaSeries(
      {
        "2": { score: 60, band: "warming-up", missing_top3: [], criteria_used: [] },
        "6": { score: 40, band: "not-ready", missing_top3: [], criteria_used: [] },
      },
      {
        "2": { score: 55, band: "warming-up", missing_top3: [], criteria_used: [] },
        "6": { score: 45, band: "not-ready", missing_top3: [], criteria_used: [] },
      },
      "10",
    );
    expect(pickBiggestMover(tieAscending)?.phase).toBe("2");

    // Flat series → null.
    const flat = buildReadinessClimbDeltaSeries(
      { "1": { score: 50, band: "warming-up", missing_top3: [], criteria_used: [] } },
      { "1": { score: 50, band: "warming-up", missing_top3: [], criteria_used: [] } },
      "1",
    );
    expect(pickBiggestMover(flat)).toBeNull();
  });

  it("formatMoverCallout — per-direction copy pack + colour + icon", () => {
    const up = formatMoverCallout({
      phase: "1",
      currScore: 90,
      prevScore: 80,
      delta: 10,
      direction: "up",
      currBand: "investor-ready",
      prevBand: "warming-up",
      isCurrent: false,
    });
    expect(up.icon).toBe("▲");
    expect(up.colour).toBe("#047857");
    expect(up.headline).toMatch(/Phase 1 climbed \+10 pts to 90\/100/);
    expect(up.hint).toMatch(/biggest week-over-week gain/i);

    const down = formatMoverCallout({
      phase: "3",
      currScore: 40,
      prevScore: 55,
      delta: -15,
      direction: "down",
      currBand: "not-ready",
      prevBand: "warming-up",
      isCurrent: true,
    });
    expect(down.icon).toBe("▼");
    expect(down.colour).toBe("#be123c");
    expect(down.headline).toMatch(/Phase 3 \(you are here\) slipped -15 pts to 40\/100/);
    expect(down.hint).toMatch(/data room since the last digest/i);

    const fresh = formatMoverCallout({
      phase: "9",
      currScore: 40,
      prevScore: 0,
      delta: 40,
      direction: "new",
      currBand: "not-ready",
      prevBand: "not-ready",
      isCurrent: false,
    });
    expect(fresh.icon).toBe("★");
    expect(fresh.colour).toBe("#0369a1");
    expect(fresh.headline).toMatch(/Phase 9 entered your readiness map at 40\/100/);
    expect(fresh.hint).toMatch(/wasn't scored in last week's digest/i);
  });
});

describe("buildFounderDigest — plain text body", () => {
  it("mirrors the HTML content in a readable format", () => {
    const out = buildFounderDigest({
      name: "Sam",
      phaseSlug: "9",
      phaseLabel: "Funding-Ready",
      readinessScore: 78,
      band: "investor-ready",
      deltaSummary:
        "Readiness improved +8 points to 78/100 — crossed a band boundary upward.",
      bandDirection: "up",
      nextAction,
      missingTop3,
      dashboardUrl: "https://blockid.au/dashboard",
    });
    expect(out.text).toMatch(/Phase 9 — Funding-Ready/);
    expect(out.text).toMatch(/Readiness: 78\/100 \(Investor-ready\)/);
    expect(out.text).toMatch(/Do this next: Add: ESIC/);
    expect(out.text).toMatch(/\[BLOCKER\]/);
    expect(out.text).toContain("s766B");
  });
});
