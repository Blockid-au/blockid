// Unit tests — founder weekly digest email helpers (P7a).
// Contract: docs/plans/atlassian-standard-mapping-goal.md §P7 exit criteria.

import { describe, expect, it } from "vitest";
import { buildFounderDigest } from "./founder-digest";
import type { NudgeMissingItem, NudgeNextAction } from "@/lib/nudge/next-steps";

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
