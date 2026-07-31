import { describe, it, expect } from "vitest";
import {
  getDeliverable,
  deliverablesForPhase,
  allDeliverables,
  type DeliverableEntry,
  type DeliverableInputContext,
  type GrowthPhaseId,
  type PdfGenerator,
} from "./deliverable-registry";
import { PACKAGE_FEATURE_COST_DEFAULTS } from "./deliverable-registry-types";

// Colocated vitest for web/src/lib/startup-package/deliverable-registry.ts —
// the pure Startup Package Ship-1 deliverable registry that maps
// founder-facing "auto-fill" cards to PDF generators + credit gates +
// dataroom folders + input-builder projections of the interview/SVI state.
// Tracks docs/plans/atlassian-standard-mapping-goal.md P9_ship (Ship-1
// deliverable ladder feeds the walkthrough / weekly-digest handoff).

const VALID_PHASES: GrowthPhaseId[] = [
  "vision",
  "customer_dev",
  "revenue_model",
  "pitch",
  "mentor_review",
  "legal_equity",
  "go_to_market",
  "product_dev",
  "investor_review",
  "team",
  "growth",
  "funding",
];

const VALID_GENERATORS: PdfGenerator[] = [
  "pitch-deck",
  "investor-pack",
  "founder-pack",
  "valuation-report",
  "svi-report",
];

function baseCtx(
  overrides: Partial<DeliverableInputContext> = {},
): DeliverableInputContext {
  return {
    project: {
      id: "proj_1",
      name: "Acme Robotics",
      slug: "acme",
      description: "Warehouse pick robots",
      industry: "robotics",
      ...(overrides.project ?? {}),
    },
    interviewAnswers: overrides.interviewAnswers ?? [],
    sviAnalysis: overrides.sviAnalysis ?? null,
    founderEmail: overrides.founderEmail,
    founderName: overrides.founderName,
    shareUrl: overrides.shareUrl,
  };
}

describe("REGISTRY shape", () => {
  it("exposes exactly 9 deliverables", () => {
    expect(allDeliverables()).toHaveLength(9);
  });

  it("returns a fresh array from allDeliverables (never a mutable ref)", () => {
    const a = allDeliverables();
    const b = allDeliverables();
    expect(a).not.toBe(b);
    a.push({} as DeliverableEntry);
    expect(allDeliverables()).toHaveLength(9);
  });

  it("every key is unique", () => {
    const keys = allDeliverables().map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every templateSlug is unique", () => {
    const slugs = allDeliverables().map((e) => e.templateSlug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("every entry has non-empty label + blurb + dataroomFolder", () => {
    for (const e of allDeliverables()) {
      expect(e.label.length).toBeGreaterThan(0);
      expect(e.blurb.length).toBeGreaterThan(0);
      expect(e.dataroomFolder.length).toBeGreaterThan(0);
    }
  });

  it("every phaseId is a member of the GrowthPhaseId union", () => {
    for (const e of allDeliverables()) {
      expect(VALID_PHASES).toContain(e.phaseId);
    }
  });

  it("every pdfGenerator is a member of the PdfGenerator union", () => {
    for (const e of allDeliverables()) {
      expect(VALID_GENERATORS).toContain(e.pdfGenerator);
    }
  });

  it("every featureKey is a known PACKAGE_FEATURE_COST_DEFAULTS key", () => {
    const known = new Set(Object.keys(PACKAGE_FEATURE_COST_DEFAULTS));
    for (const e of allDeliverables()) {
      expect(known.has(e.featureKey)).toBe(true);
    }
  });

  it("every templateSlug is prefixed with package_<phase>_ so dataroom filing scopes cleanly per growth phase", () => {
    for (const e of allDeliverables()) {
      expect(e.templateSlug.startsWith(`package_${e.phaseId}_`)).toBe(true);
    }
  });
});

describe("getDeliverable()", () => {
  it("returns the matching entry for a known key", () => {
    const e = getDeliverable("pitch_deck");
    expect(e).not.toBeNull();
    expect(e?.key).toBe("pitch_deck");
    expect(e?.phaseId).toBe("vision");
    expect(e?.pdfGenerator).toBe("pitch-deck");
  });

  it("returns null for an unknown key", () => {
    expect(getDeliverable("does_not_exist")).toBeNull();
  });

  it("is case-sensitive (upper-case key returns null)", () => {
    expect(getDeliverable("PITCH_DECK")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(getDeliverable("")).toBeNull();
  });
});

describe("deliverablesForPhase()", () => {
  it("returns both vision-phase entries", () => {
    const rows = deliverablesForPhase("vision");
    expect(rows.map((r) => r.key).sort()).toEqual(["pitch_deck", "vision_report"]);
  });

  it("returns the single customer_dev entry", () => {
    const rows = deliverablesForPhase("customer_dev");
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe("customer_pack");
  });

  it("returns [] for phase ids that have no registered deliverables", () => {
    // Registry defines entries for a subset of GrowthPhaseId — mentor_review,
    // product_dev, team, growth have zero deliverables in Ship 1.
    for (const phase of ["mentor_review", "product_dev", "team", "growth"] as GrowthPhaseId[]) {
      expect(deliverablesForPhase(phase)).toEqual([]);
    }
  });

  it("returned entries all carry the requested phaseId", () => {
    for (const phase of VALID_PHASES) {
      for (const row of deliverablesForPhase(phase)) {
        expect(row.phaseId).toBe(phase);
      }
    }
  });
});

// ─── inputBuilder branches ───────────────────────────────────────────────────

describe("inputBuilder: pitch_deck", () => {
  it("returns an empty object regardless of context (Ship-1 no-op)", () => {
    const entry = getDeliverable("pitch_deck")!;
    expect(entry.inputBuilder(baseCtx())).toEqual({});
  });
});

describe("inputBuilder: vision_report", () => {
  it("passes through sviAnalysis + startupName + email + standard tier", () => {
    const entry = getDeliverable("vision_report")!;
    const ctx = baseCtx({
      founderEmail: "f@acme.co",
      sviAnalysis: { totalSVI: 128, grade: "B" },
    });
    const out = entry.inputBuilder(ctx) as {
      analysis: { totalSVI: number; grade: string };
      startupName: string;
      email: string;
      tier: string;
      reportDate: string;
    };
    expect(out.analysis).toEqual({ totalSVI: 128, grade: "B" });
    expect(out.startupName).toBe("Acme Robotics");
    expect(out.email).toBe("f@acme.co");
    expect(out.tier).toBe("standard");
    expect(out.reportDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("supplies a version:2.0.0 baseline when sviAnalysis is null", () => {
    const entry = getDeliverable("vision_report")!;
    const out = entry.inputBuilder(baseCtx()) as {
      analysis: { version: string; totalSVI: number; baselineSVI: number };
    };
    expect(out.analysis).toEqual({ version: "2.0.0", totalSVI: 100, baselineSVI: 100 });
  });
});

describe("inputBuilder: customer_pack", () => {
  it("joins the three customer-dev step answers into the founder-pack body", () => {
    const entry = getDeliverable("customer_pack")!;
    const ctx = baseCtx({
      interviewAnswers: [
        { step_key: "cd_persona", answer_text: "SMB warehouse ops managers" },
        { step_key: "cd_pains", answer_text: "Manual pick paths are slow" },
        { step_key: "cd_channels", answer_text: "LinkedIn + trade shows" },
      ],
      founderEmail: "founder@acme.co",
      shareUrl: "https://blockid.au/startup/acme",
    });
    const out = entry.inputBuilder(ctx) as {
      pack: { body: string; section: string; headline: string; ideaName: string; user: { email: string } };
      shareUrl: string;
    };
    expect(out.pack.body).toBe(
      "SMB warehouse ops managers\n\nManual pick paths are slow\n\nLinkedIn + trade shows",
    );
    expect(out.pack.section).toBe("customer_dev");
    expect(out.pack.headline).toBe("Customer discovery");
    expect(out.pack.ideaName).toBe("Acme Robotics");
    expect(out.pack.user.email).toBe("founder@acme.co");
    expect(out.shareUrl).toBe("https://blockid.au/startup/acme");
  });

  it("filters out blank / whitespace-only answers when joining", () => {
    const entry = getDeliverable("customer_pack")!;
    const ctx = baseCtx({
      interviewAnswers: [
        { step_key: "cd_persona", answer_text: "  " },
        { step_key: "cd_pains", answer_text: "" },
        { step_key: "cd_channels", answer_text: "Referrals" },
      ],
    });
    const out = entry.inputBuilder(ctx) as { pack: { body: string } };
    expect(out.pack.body).toBe("Referrals");
  });

  it("defaults shareUrl to '' when omitted", () => {
    const entry = getDeliverable("customer_pack")!;
    const out = entry.inputBuilder(baseCtx()) as { shareUrl: string };
    expect(out.shareUrl).toBe("");
  });
});

describe("inputBuilder: valuation_report", () => {
  it("delegates to the deterministic valuation stub", () => {
    const entry = getDeliverable("valuation_report")!;
    const ctx = baseCtx({
      sviAnalysis: { totalSVI: 140 },
      founderEmail: "f@acme.co",
    });
    const out = entry.inputBuilder(ctx) as {
      report: {
        companyName: string;
        currency: string;
        methods: Array<{ name: string; low: number; base: number; high: number }>;
        summary: string;
      };
      email: string;
    };
    expect(out.email).toBe("f@acme.co");
    expect(out.report.companyName).toBe("Acme Robotics");
    expect(out.report.currency).toBe("AUD");
    expect(out.report.methods.map((m) => m.name)).toEqual(["Berkus", "Scorecard", "VC method"]);
    // baseline = max(500_000, totalSVI * 5_000) = max(500_000, 700_000) = 700_000
    // Berkus base = baseline * 1.0 = 700_000
    expect(out.report.methods[0].base).toBe(700_000);
    expect(out.report.methods[0].low).toBeCloseTo(700_000 * 0.6);
    expect(out.report.methods[0].high).toBeCloseTo(700_000 * 1.4);
    // Every method must satisfy low <= base <= high.
    for (const m of out.report.methods) {
      expect(m.low).toBeLessThanOrEqual(m.base);
      expect(m.base).toBeLessThanOrEqual(m.high);
    }
  });

  it("floors baseline at A$500,000 when the SVI score is missing", () => {
    const entry = getDeliverable("valuation_report")!;
    const out = entry.inputBuilder(baseCtx()) as {
      report: { methods: Array<{ base: number }>; summary: string };
    };
    // baseline = max(500_000, undefined * 5_000) → NaN comparison falls to 500_000.
    expect(out.report.methods[0].base).toBe(500_000);
    // Fallback summary references the project name.
    expect(out.report.summary).toContain("Acme Robotics");
  });

  it("passes through the SVI summary when present", () => {
    const entry = getDeliverable("valuation_report")!;
    const out = entry.inputBuilder(
      baseCtx({ sviAnalysis: { totalSVI: 120, summary: "Strong signal from paying pilots." } }),
    ) as { report: { summary: string } };
    expect(out.report.summary).toBe("Strong signal from paying pilots.");
  });
});

describe("inputBuilder: investor_pack", () => {
  it("hydrates startup + svi + teaser from interview answers", () => {
    const entry = getDeliverable("investor_pack")!;
    const ctx = baseCtx({
      interviewAnswers: [
        { step_key: "vision_headline", answer_text: "Warehouse pick robots" },
        { step_key: "pitch_oneliner", answer_text: "10x picker throughput at 1/3 the cost." },
        { step_key: "pitch_opportunity", answer_text: "A$4B AU warehouse automation TAM." },
        { step_key: "pitch_risk", answer_text: "Hardware iteration cycle time." },
      ],
      sviAnalysis: {
        totalSVI: 148,
        grade: "B",
        dimensionScores: { market: 90, product: 85 },
      },
    });
    const out = entry.inputBuilder(ctx) as {
      startup: { name: string; tagline: string; sector: string; asOfDate: string };
      svi: { grade: string; score: number; criteria: Array<{ id: string; label: string; score: number }> };
      teaser: { headline: string; oneliner: string; opportunity: string; risk: string };
    };
    expect(out.startup.name).toBe("Acme Robotics");
    expect(out.startup.tagline).toBe("Warehouse pick robots");
    expect(out.startup.sector).toBe("robotics");
    expect(out.startup.asOfDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(out.svi.grade).toBe("B");
    expect(out.svi.score).toBe(148);
    expect(out.svi.criteria).toEqual([
      { id: "market", label: "market", score: 90 },
      { id: "product", label: "product", score: 85 },
    ]);
    expect(out.teaser).toEqual({
      headline: "Warehouse pick robots",
      oneliner: "10x picker throughput at 1/3 the cost.",
      opportunity: "A$4B AU warehouse automation TAM.",
      risk: "Hardware iteration cycle time.",
    });
  });

  it("falls back to project.name when no vision/pitch headline answer exists", () => {
    const entry = getDeliverable("investor_pack")!;
    const out = entry.inputBuilder(baseCtx()) as {
      teaser: { headline: string; oneliner: string };
      startup: { tagline: string; sector: string };
    };
    expect(out.teaser.headline).toBe("Acme Robotics");
    expect(out.teaser.oneliner).toBe("");
    expect(out.startup.tagline).toBe("Warehouse pick robots");
    expect(out.startup.sector).toBe("robotics");
  });

  it("defaults sector to 'startup' + tagline to '' when project fields are null", () => {
    const entry = getDeliverable("investor_pack")!;
    const out = entry.inputBuilder(
      baseCtx({
        project: {
          id: "p",
          name: "Nameless",
          description: null,
          industry: null,
        },
      }),
    ) as { startup: { tagline: string; sector: string } };
    expect(out.startup.tagline).toBe("");
    expect(out.startup.sector).toBe("startup");
  });

  it("derives grade from totalSVI when analysis.grade is absent (A≥150, B≥130, C≥110, else D)", () => {
    const entry = getDeliverable("investor_pack")!;
    const cases: Array<{ svi: number; grade: string }> = [
      { svi: 150, grade: "A" },
      { svi: 149, grade: "B" },
      { svi: 130, grade: "B" },
      { svi: 129, grade: "C" },
      { svi: 110, grade: "C" },
      { svi: 109, grade: "D" },
    ];
    for (const c of cases) {
      const out = entry.inputBuilder(baseCtx({ sviAnalysis: { totalSVI: c.svi } })) as {
        svi: { grade: string };
      };
      expect(out.svi.grade).toBe(c.grade);
    }
  });

  it("renders grade '—' when sviAnalysis is null (no totalSVI to score)", () => {
    const entry = getDeliverable("investor_pack")!;
    const out = entry.inputBuilder(baseCtx()) as { svi: { grade: string; score: number } };
    expect(out.svi.grade).toBe("—");
    expect(out.svi.score).toBe(0);
  });

  it("ensures at least one criterion row (overall fallback) when dimensionScores is empty", () => {
    const entry = getDeliverable("investor_pack")!;
    const out = entry.inputBuilder(
      baseCtx({ sviAnalysis: { totalSVI: 120 } }),
    ) as { svi: { criteria: Array<{ id: string; label: string; score: number }> } };
    expect(out.svi.criteria).toEqual([{ id: "overall", label: "Overall", score: 120 }]);
  });

  it("overall-fallback score is 0 when sviAnalysis is null", () => {
    const entry = getDeliverable("investor_pack")!;
    const out = entry.inputBuilder(baseCtx()) as {
      svi: { criteria: Array<{ id: string; label: string; score: number }> };
    };
    expect(out.svi.criteria).toEqual([{ id: "overall", label: "Overall", score: 0 }]);
  });

  it("drops non-numeric dimensionScores entries from the criteria list", () => {
    const entry = getDeliverable("investor_pack")!;
    const out = entry.inputBuilder(
      baseCtx({
        sviAnalysis: {
          totalSVI: 120,
          // @ts-expect-error — deliberately smuggle a non-numeric value
          dimensionScores: { market: 90, product: "N/A", team: 75 },
        },
      }),
    ) as { svi: { criteria: Array<{ id: string }> } };
    expect(out.svi.criteria.map((c) => c.id).sort()).toEqual(["market", "team"]);
  });
});

describe("inputBuilder: founder_pack (legal_equity)", () => {
  it("joins the four legal-equity step answers into the body", () => {
    const entry = getDeliverable("founder_pack")!;
    const ctx = baseCtx({
      interviewAnswers: [
        { step_key: "le_structure", answer_text: "Pty Ltd, 3 founders" },
        { step_key: "le_sha", answer_text: "SHA signed 2026-01" },
        { step_key: "le_ip", answer_text: "IP assigned to company" },
        { step_key: "le_captable", answer_text: "70/20/10 founders + 10% ESOP" },
      ],
      founderName: "Alice",
      founderEmail: "alice@acme.co",
    });
    const out = entry.inputBuilder(ctx) as {
      pack: {
        body: string;
        section: string;
        headline: string;
        user: { displayName: string | null; email: string };
      };
    };
    expect(out.pack.section).toBe("legal_equity");
    expect(out.pack.headline).toBe("Founder pack");
    expect(out.pack.body).toBe(
      "Pty Ltd, 3 founders\n\nSHA signed 2026-01\n\nIP assigned to company\n\n70/20/10 founders + 10% ESOP",
    );
    expect(out.pack.user).toEqual({ displayName: "Alice", email: "alice@acme.co" });
  });

  it("displayName is null + email is '' when founder identity is unknown", () => {
    const entry = getDeliverable("founder_pack")!;
    const out = entry.inputBuilder(baseCtx()) as {
      pack: { user: { displayName: string | null; email: string } };
    };
    expect(out.pack.user).toEqual({ displayName: null, email: "" });
  });
});

describe("inputBuilder: gtm_playbook", () => {
  it("joins the three go-to-market step answers into the body", () => {
    const entry = getDeliverable("gtm_playbook")!;
    const ctx = baseCtx({
      interviewAnswers: [
        { step_key: "gtm_strategy", answer_text: "Direct enterprise sales" },
        { step_key: "gtm_channels", answer_text: "Outbound + industry conferences" },
        { step_key: "gtm_budget", answer_text: "A$120k Y1" },
      ],
    });
    const out = entry.inputBuilder(ctx) as {
      pack: { section: string; headline: string; body: string };
    };
    expect(out.pack.section).toBe("go_to_market");
    expect(out.pack.headline).toBe("Go-to-market playbook");
    expect(out.pack.body).toBe(
      "Direct enterprise sales\n\nOutbound + industry conferences\n\nA$120k Y1",
    );
  });

  it("evaluation.summary falls back to sviAnalysis.summary when no answers exist", () => {
    const entry = getDeliverable("gtm_playbook")!;
    const out = entry.inputBuilder(
      baseCtx({ sviAnalysis: { totalSVI: 100, summary: "Early-stage — no GTM signal yet." } }),
    ) as { pack: { evaluation: { summary: string } | null; body: string } };
    expect(out.pack.body).toBe("");
    expect(out.pack.evaluation?.summary).toBe("Early-stage — no GTM signal yet.");
  });
});

describe("inputBuilder: investor_review", () => {
  it("prefers ir_* answers over vision/pitch fallbacks", () => {
    const entry = getDeliverable("investor_review")!;
    const ctx = baseCtx({
      interviewAnswers: [
        { step_key: "vision_headline", answer_text: "Vision headline (fallback)" },
        { step_key: "ir_headline", answer_text: "IR headline" },
        { step_key: "ir_oneliner", answer_text: "IR one-liner" },
        { step_key: "pitch_oneliner", answer_text: "Pitch one-liner (fallback)" },
      ],
    });
    const out = entry.inputBuilder(ctx) as {
      teaser: { headline: string; oneliner: string };
    };
    expect(out.teaser).toEqual({ headline: "IR headline", oneliner: "IR one-liner" });
  });

  it("falls back to vision_headline / pitch_oneliner when ir_* answers absent", () => {
    const entry = getDeliverable("investor_review")!;
    const ctx = baseCtx({
      interviewAnswers: [
        { step_key: "vision_headline", answer_text: "Warehouse pick robots" },
        { step_key: "pitch_oneliner", answer_text: "10x throughput" },
      ],
    });
    const out = entry.inputBuilder(ctx) as {
      teaser: { headline: string; oneliner: string };
    };
    expect(out.teaser).toEqual({ headline: "Warehouse pick robots", oneliner: "10x throughput" });
  });

  it("falls back to project.name when neither ir_headline nor vision_headline exist", () => {
    const entry = getDeliverable("investor_review")!;
    const out = entry.inputBuilder(baseCtx()) as {
      teaser: { headline: string; oneliner: string };
    };
    expect(out.teaser.headline).toBe("Acme Robotics");
    expect(out.teaser.oneliner).toBe("");
  });
});

describe("inputBuilder: funding_report", () => {
  it("passes through sviAnalysis + premium tier + startupName", () => {
    const entry = getDeliverable("funding_report")!;
    const ctx = baseCtx({
      sviAnalysis: { totalSVI: 155, grade: "A" },
      founderEmail: "f@acme.co",
    });
    const out = entry.inputBuilder(ctx) as {
      analysis: { totalSVI: number; grade: string };
      startupName: string;
      email: string;
      tier: string;
      reportDate: string;
    };
    expect(out.analysis).toEqual({ totalSVI: 155, grade: "A" });
    expect(out.tier).toBe("premium");
    expect(out.startupName).toBe("Acme Robotics");
    expect(out.email).toBe("f@acme.co");
    expect(out.reportDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("supplies a version:2.0.0 baseline when sviAnalysis is null", () => {
    const entry = getDeliverable("funding_report")!;
    const out = entry.inputBuilder(baseCtx()) as {
      analysis: { version: string; totalSVI: number; baselineSVI: number };
    };
    expect(out.analysis).toEqual({ version: "2.0.0", totalSVI: 100, baselineSVI: 100 });
  });
});

// ─── cross-cutting shape invariants of the two shared builders ────────────────

describe("buildFounderPackShape (indirect via customer_pack)", () => {
  const entry = getDeliverable("customer_pack")!;

  it("stamps a well-formed ISO-8601 createdAt timestamp", () => {
    const out = entry.inputBuilder(baseCtx()) as { pack: { createdAt: string } };
    expect(out.pack.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(Number.isNaN(Date.parse(out.pack.createdAt))).toBe(false);
  });

  it("sets split + funding to null (Ship-1 unpopulated)", () => {
    const out = entry.inputBuilder(baseCtx()) as {
      pack: { split: unknown; funding: unknown };
    };
    expect(out.pack.split).toBeNull();
    expect(out.pack.funding).toBeNull();
  });

  it("mirrors ideaName from project.name inside evaluation as well as top-level", () => {
    const out = entry.inputBuilder(baseCtx()) as {
      pack: { ideaName: string; evaluation: { ideaName: string } | null };
    };
    expect(out.pack.ideaName).toBe("Acme Robotics");
    expect(out.pack.evaluation?.ideaName).toBe("Acme Robotics");
  });
});

describe("PACKAGE_FEATURE_COST_DEFAULTS integrity", () => {
  it("has finite non-negative costs for every key", () => {
    for (const [k, v] of Object.entries(PACKAGE_FEATURE_COST_DEFAULTS)) {
      expect(Number.isFinite(v), `${k}`).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it("covers every featureKey referenced by the registry", () => {
    for (const e of allDeliverables()) {
      expect(PACKAGE_FEATURE_COST_DEFAULTS[e.featureKey]).toBeGreaterThan(0);
    }
  });
});
