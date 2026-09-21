// G24-D — the deterministic critic-finding filter, `hadIssues` on outcomes,
// prescriptive (action-plan) lines and the declared-assumption markers. The
// cases are the 09:02 UTC showcase run's own critic lines (snapshot 136a49f5,
// groundedShare 0.50) — every class that flipped a grounded section off
// without a grounding failure behind it.
import { describe, expect, it } from "vitest";
import type { ModelCaller } from "@/lib/adk";
import { auditSections, auditText, CRITIC_INSTRUCTION_TEXT, filterCriticFindings, findUncitedClaims, quotedClaimOf } from "./llm-auditor";
import { declaredTableRows, expandShortCitations, hasCitationOrMarker, isPrescriptiveClaim, isTargetSentence, UNEVIDENCED_MARKERS } from "./claim-gate";
import { autoCite, itemsFromModuleOutputs } from "./auto-cite";

function mockModel(handlers: { critic: (user: string) => string; reviser: (user: string) => string }): ModelCaller {
  return async (system, user) => {
    if (/fact-checking critic/i.test(system)) return handlers.critic(user);
    if (/revise startup-report prose/i.test(system)) return handlers.reviser(user);
    return "";
  };
}

describe("G24-D — claim-gate: declared assumptions + prescriptive lines", () => {
  it("'Assuming …', 'we estimate', 'base scenario', 'hypothetically', 'rule of thumb' count as the unevidenced marker", () => {
    for (const s of [
      "Assuming an LTV of A$1,788, the ratio is 3.6x.",
      "Without CAC data, we estimate CAC at A$200–A$500 per evaluator.",
      "Base scenario: 5 pilots convert at A$349/mo, reaching A$6,980 MRR.",
      "Bull-case MRR of A$15,000 in 12 months.",
      "Hypothetically, 10% churn breaks the model.",
      "As a rule of thumb, CAC payback under 12 months at A$149 ARPU is healthy.",
    ]) {
      expect(UNEVIDENCED_MARKERS.test(s), s).toBe(true);
      expect(hasCitationOrMarker(s, []), s).toBe(true);
    }
  });

  it("a bare benchmark or a plain fact is NOT a declared assumption", () => {
    for (const s of ["For a SaaS at early traction stage, typical ARR benchmarks are A$50k–A$200k.", "Churn above 8% breaks the 3x ratio.", "Revenue reached A$1.2M ARR."]) {
      expect(UNEVIDENCED_MARKERS.test(s), s).toBe(false);
    }
  });

  it("only the window-tagged action-line shape is prescriptive", () => {
    expect(isPrescriptiveClaim("1. [30d] Validate SAM with 10 interviews — owner: CMO")).toBe(true);
    expect(isPrescriptiveClaim("- [90d] Reach A$10,000 MRR")).toBe(true);
    expect(isPrescriptiveClaim("[this_week] Ship the intake link")).toBe(true);
    expect(isPrescriptiveClaim("We should validate SAM with 10 interviews.")).toBe(false);
    expect(isPrescriptiveClaim("Revenue reached A$1.2M ARR [ev:x].")).toBe(false);
  });

  it("findUncitedClaims skips action lines but still flags a plain sentence with the same numbers", () => {
    expect(findUncitedClaims("1. [30d] Validate SAM with 10 accounting-firm interviews at A$3 each — owner: CMO", [])).toEqual([]);
    expect(findUncitedClaims("- [90d] Reach A$10,000 MRR", [])).toEqual([]);
    expect(findUncitedClaims("We will reach A$10,000 MRR.", [])).toHaveLength(1);
  });
});

describe("G24-D (run 1 follow-ups) — short ids, declared-estimate tables, pre-revenue zero", () => {
  const FULL = "f73c3a4a-6c31-4119-8af6-dac9220cd52f";
  const OTHER = "f73c3a4a-0000-4000-8000-000000000000";

  it("expandShortCitations: a ≥ 8-hex prefix naming exactly one allowed id becomes that id; ambiguous, unknown or already-full markers stay", () => {
    expect(expandShortCitations(`SAM A$1.3B [ev:f73c3a4a].`, [FULL])).toBe(`SAM A$1.3B [ev:${FULL}].`);
    expect(expandShortCitations(`SAM A$1.3B [ev:f73c3a4a-6c31].`, [FULL])).toBe(`SAM A$1.3B [ev:${FULL}].`);
    expect(expandShortCitations(`SAM A$1.3B [ev:f73c3a4a].`, [FULL, OTHER])).toBe(`SAM A$1.3B [ev:f73c3a4a].`);
    expect(expandShortCitations(`SAM A$1.3B [ev:abcdef12].`, [FULL])).toBe(`SAM A$1.3B [ev:abcdef12].`);
    expect(expandShortCitations(`SAM A$1.3B [ev:f73c].`, [FULL])).toBe(`SAM A$1.3B [ev:f73c].`);
    expect(expandShortCitations(`SAM A$1.3B [ev:${FULL}].`, [FULL])).toBe(`SAM A$1.3B [ev:${FULL}].`);
    expect(expandShortCitations("no markers", [FULL])).toBe("no markers");
  });

  it("the gate and the auto-citer both resolve a shortened id (the 09:02 market section cited [ev:f73c3a4a] and was flagged uncited)", () => {
    expect(findUncitedClaims(`This aligns with the anchor of A$1.3B SAM [ev:f73c3a4a].`, [FULL])).toEqual([]);
    const r = autoCite(`This aligns with the anchor of A$1.3B SAM [ev:f73c3a4a].`, [{ id: FULL, label: "AU market anchor", text: "SAM A$1.3B" }]);
    expect(r.text).toBe(`This aligns with the anchor of A$1.3B SAM [ev:${FULL}].`);
    expect(r.added).toBe(0);
    expect(r.uncited).toBe(0);
  });

  it("declaredTableRows: rows of a table whose caption or header carries the marker inherit it; a bare table does not", () => {
    const declared = ["Channel estimates (unevidenced — sector-typical ranges, not measured):", "| Channel | Est. CAC | Payback |", "|---|---|---|", "| Content/SEO | A$50–200 | 6–12mo |", "", "Revenue reached A$1.2M ARR."].join("\n");
    expect(declaredTableRows(declared)).toEqual([false, true, true, true, false, false]);
    expect(findUncitedClaims(declared, [])).toEqual(["Revenue reached A$1.2M ARR."]);
    const headerOnly = ["### Channel Economics", "| Channel | Est. CAC (estimate) | Payback |", "|---|---|---|", "| Paid Search | A$200–800 | 3–6mo |"].join("\n");
    expect(findUncitedClaims(headerOnly, [])).toEqual([]);
    const bare = ["### Channel Economics", "| Channel | CAC | Payback |", "|---|---|---|", "| Paid Search | A$200–800 | 3–6mo |"].join("\n");
    expect(findUncitedClaims(bare, [])).toEqual(["| Paid Search | A$200–800 | 3–6mo |"]);
  });

  it("a scenario table row ('| Bear | …') and 'this implies …' are declared workings, not facts", () => {
    expect(findUncitedClaims("| Bear | MRR -30% | A$150K ARR at 12 months |", [])).toEqual([]);
    expect(findUncitedClaims("This implies a healthy LTV/CAC ratio of 2.5-3x.", [])).toEqual([]);
    expect(findUncitedClaims("The LTV/CAC ratio is 2.5-3x.", [])).toHaveLength(1);
  });

  it("module outputs are citable by their module id (the LCO owner cited [ev:agents/clo-compliance.ts:calculateComplianceScore])", () => {
    const modules = [{ id: "agents/clo-compliance.ts:calculateComplianceScore", output: { score: 75, completed: 12, total: 16, gaps: ["director ID"] } }];
    const items = itemsFromModuleOutputs(modules);
    expect(items[0]).toEqual({ id: "agents/clo-compliance.ts:calculateComplianceScore", label: "Module: agents/clo-compliance.ts:calculateComplianceScore", text: "score = 75 (75 %); completed = 12 (12 %); total = 16; gaps[0] = director ID" });
    const claim = "The compliance checklist is 75% complete (12 of 16 items) [ev:agents/clo-compliance.ts:calculateComplianceScore].";
    expect(findUncitedClaims(claim, items.map((i) => i.id))).toEqual([]);
    const f = filterCriticFindings([`"The compliance checklist is 75% complete (12 of 16 items)" — no such checklist in the EVIDENCE.`], claim, { allowedEvidenceIds: items.map((i) => i.id), citable: items });
    expect(f.kept).toEqual([]);
  });

  it("a critic finding on an analyst rating ('Network effects: 3/5') is dropped; a rating line that also states money is kept", () => {
    const f = filterCriticFindings(
      [`"Network effects: 3/5" — no rating in the EVIDENCE.`, `"Brand: 2/5 — worth A$4M of goodwill" — fabricated.`],
      "Network effects: 3/5 — the dataset compounds. Brand: 2/5 — worth A$4M of goodwill.",
    );
    expect(f.dropped).toHaveLength(1);
    expect(f.kept).toEqual([`"Brand: 2/5 — worth A$4M of goodwill" — fabricated.`]);
  });

  it("run 3: a citation marker never makes a claim material ('87/100 [ev:…-1076-…]'); a full id with ≤ 2 wrong characters resolves to the one allowed id", () => {
    const GOOD = "e48e1491-1076-43f4-8f23-0fc57926068c";
    expect(findUncitedClaims("The SVI score of 87/100 in Market & Problem reflects strong work [ev:e48e1491-1076-43f4-8f23-0fc57926068c].", [GOOD])).toEqual([]);
    expect(findUncitedClaims("The SVI score of 87/100 in Market & Problem reflects strong work.", [])).toEqual([]);
    const typo = "The SVI score of 87/100 and a A$12M SAM [ev:e48e1491-1076-43e4-8f23-0fc57926068c].";
    expect(expandShortCitations(typo, [GOOD])).toBe(`The SVI score of 87/100 and a A$12M SAM [ev:${GOOD}].`);
    expect(findUncitedClaims(typo, [GOOD])).toEqual([]);
    // three wrong characters is not a near miss
    expect(expandShortCitations("x [ev:e48e1491-1076-4f3e-8f23-0fc57926068c].", [GOOD])).toBe("x [ev:e48e1491-1076-4f3e-8f23-0fc57926068c].");
  });

  it("run 3: a risk row whose numbers sit only in the mitigation is a plan; a number in the title is still a claim", () => {
    expect(findUncitedClaims("- **No advisory board limits strategic leverage** (medium) — Recruit 2–3 advisors; offer 0.5–1% equity each with standard vesting", [])).toEqual([]);
    expect(findUncitedClaims("- **Unclaimed R&D Tax Incentive leaves A$50K–A$100K on the table** (medium) — Engage an R&D consultant", [])).toHaveLength(1);
    expect(isPrescriptiveClaim("- **Low paid conversion — 0% across all cohorts** (critical) — A/B test pricing")).toBe(false);
  });

  it("'A$0 ARR' / 'A$0 MRR' is backed by a pre-revenue row; 'A$0' against a row with real revenue is not", () => {
    const pre = [{ id: FULL, label: "Founder evidence: revenue", text: "Pre-revenue. Stripe shows 0 active subscriptions and 5 one-off charges; 0 MRR." }];
    expect(autoCite("BlockID.au is at A$0 ARR today.", pre).added).toBe(1);
    const paid = [{ id: FULL, label: "Stripe revenue", text: "mrr_aud = 12400; active_subscriptions = 9" }];
    expect(autoCite("BlockID.au is at A$0 ARR today.", paid).added).toBe(0);
  });
});

describe("G24-D — filterCriticFindings (the critic's noise classes, from the 09:02 showcase run)", () => {
  const ROW = "e9838ea8-a6f3-422f-bf10-320ca9c23c3c";
  const ANCHOR = "f73c3a4a-6c31-4119-8af6-dac9220cd52f";
  const citable = [
    { id: ROW, label: "Founder evidence: market", text: "Sydney Angels alone see about 40 applicants a cycle at 30–60 minutes each to read." },
    { id: ANCHOR, label: "AU market anchor (ABS / IBISWorld)", text: "Software Publishing TAM A$6.5B; SAM A$1.3B; SOM A$13M; 5-year CAGR 10.8 %" },
  ];
  const opts = { allowedEvidenceIds: [ROW, ANCHOR], citable };

  it("drops a 'No finding here' / 'is supported' line the parser counted as a finding", () => {
    const f = filterCriticFindings(
      [
        `"Insurance is not mentioned" — The EVIDENCE does not mention insurance at all, so stating it as a gap is a reasonable inference; the coverage sentence is advice, not a fabricated fact. No finding here.`,
        `"The current team is one person: the founder" — The EVIDENCE states "Solo founder today"; this is a minor factual claim that is supported.`,
        `"Revenue reached A$1.2M ARR" — no such figure appears in the EVIDENCE.`,
      ],
      "Insurance is not mentioned. The current team is one person: the founder. Revenue reached A$1.2M ARR.",
      opts,
    );
    expect(f.dropped).toHaveLength(2);
    expect(f.kept).toEqual([`"Revenue reached A$1.2M ARR" — no such figure appears in the EVIDENCE.`]);
  });

  it("keeps a real finding that merely says 'no such claim is supported'", () => {
    const f = filterCriticFindings([`"Revenue is A$9M" — the cited id does not appear in the EVIDENCE; no such claim is supported.`], "Revenue is A$9M.", opts);
    expect(f.kept).toHaveLength(1);
  });

  it("drops a finding on a sentence the writer already marked (unevidenced) / 'Assuming …' / 'we estimate' / a scenario", () => {
    const draft = [
      "For Australian SaaS benchmarks, trial-to-paid conversion typically ranges 15–30% (unevidenced).",
      "Assuming an LTV of A$1,788 (12 months at A$149), the LTV/CAC ratio would be 3.6–8.9x.",
      "Without CAC data, we estimate CAC at A$200–A$500 per evaluator.",
      "Base scenario: 5 pilots convert at A$349/mo, reaching A$6,980 MRR.",
    ].join(" ");
    const f = filterCriticFindings(
      [
        `"For Australian SaaS benchmarks, trial-to-paid conversion typically ranges 15–30%" — fabricated benchmark.`,
        `"Assuming an LTV of A$1,788 (12 months at A$149), the LTV/CAC ratio would be 3.6–8.9x" — LTV not supported.`,
        `"we estimate CAC at A$200–A$500 per evaluator" — invented figure.`,
        `"Base scenario: 5 pilots convert at A$349/mo, reaching A$6,980 MRR" — fabricated scenario.`,
      ],
      draft,
      opts,
    );
    expect(f.kept).toEqual([]);
    expect(f.dropped).toHaveLength(4);
  });

  it("keeps a bare benchmark stated as fact (no marker) — the gate's real target", () => {
    const f = filterCriticFindings([`"For a SaaS at early traction stage, typical ARR benchmarks are A$50k–A$200k" — no benchmark in the EVIDENCE.`], "For a SaaS at early traction stage, typical ARR benchmarks are A$50k–A$200k; BlockID is below that.", opts);
    expect(f.kept).toHaveLength(1);
  });

  it("drops a finding on a cited sentence whose numbers are in the cited row (the critic was never shown the catalogue); keeps it when a number is NOT in the row", () => {
    const draft = [
      `Sydney Angels alone review 40 applicants per cycle, spending 30–60 minutes each [ev:${ROW}].`,
      `The 5-year CAGR of 10.8% supports a growing market [ev:${ANCHOR}].`,
      `The investor solution page should be optimised for conversion [ev:${ROW}].`,
      `The anchor puts the SOM at A$99M [ev:${ANCHOR}].`,
    ].join(" ");
    const f = filterCriticFindings(
      [
        `"Sydney Angels alone review 40 applicants per cycle, spending 30–60 minutes each" — The EVIDENCE makes no mention of Sydney Angels.`,
        `"The 5-year CAGR of 10.8% supports a growing market" — no CAGR data; fabricated.`,
        `"The investor solution page should be optimised for conversion [ev:${ROW}]" — The cited evidence ID does not appear in the EVIDENCE.`,
        `"The anchor puts the SOM at A$99M" — the anchor says A$13M.`,
      ],
      draft,
      opts,
    );
    expect(f.dropped).toHaveLength(3);
    expect(f.kept).toEqual([`"The anchor puts the SOM at A$99M" — the anchor says A$13M.`]);
  });

  it("drops a finding on a window-tagged action line and on advice without a strong specific; keeps advice that states money", () => {
    const draft = [
      "1. [30d] Validate SAM with 10 accounting-firm interviews — owner: CMO",
      "The next 3-5 critical roles should be filled in this order: Head of Evaluator Sales (30-60 days), then a CS lead (60-90 days).",
      "Paid search should be tested with a small A$5K budget to validate intent.",
    ].join("\n");
    const f = filterCriticFindings(
      [
        `"Validate SAM with 10 accounting-firm interviews" — not in the EVIDENCE.`,
        `"The next 3-5 critical roles should be filled in this order: Head of Evaluator Sales (30-60 days), then a CS lead (60-90 days)" — fabricated hiring roadmap.`,
        `"Paid search should be tested with a small A$5K budget" — no A$5K budget in the EVIDENCE.`,
      ],
      draft,
      opts,
    );
    expect(f.dropped).toHaveLength(2);
    expect(f.kept).toEqual([`"Paid search should be tested with a small A$5K budget" — no A$5K budget in the EVIDENCE.`]);
  });

  it("quotedClaimOf: the longest quoted run, else the text before the dash", () => {
    expect(quotedClaimOf(`"short one" and "the much longer quoted claim here" — reason`)).toBe("the much longer quoted claim here");
    expect(quotedClaimOf(`Channel Economics table with CAC values — fabricated`)).toBe("Channel Economics table with CAC values");
    expect(quotedClaimOf(`“smart quotes claim text” — reason`)).toBe("smart quotes claim text");
  });
});

describe("G24-D — auditText / auditSections with the filter", () => {
  const evidence = "Startup: Acme. Stripe: 9 subscriptions. SVI market: 40/100.";

  it("a NEEDS_REVISION verdict whose only findings are filtered out is ACCURATE: no reviser call, hadIssues false, droppedFindings kept", async () => {
    let reviserCalls = 0;
    const model = mockModel({
      critic: () => `FINDINGS:\n- "Assuming CAC of A$300, payback is 2 months" — invented CAC.\n- "The team should hire a CS lead" — not in the EVIDENCE. No finding here.\nVERDICT: NEEDS_REVISION`,
      reviser: () => {
        reviserCalls += 1;
        return "rewritten";
      },
    });
    const draft = "Assuming CAC of A$300, payback is 2 months. The team should hire a CS lead.";
    const res = await auditText(draft, evidence, model, 500);
    expect(res.hadIssues).toBe(false);
    expect(res.revised).toBe(draft);
    expect(res.findings).toEqual([]);
    expect(res.droppedFindings).toHaveLength(2);
    expect(reviserCalls).toBe(0);
  });

  it("the reviser sees only the KEPT findings as its critique", async () => {
    let critique = "";
    const model = mockModel({
      critic: () => `FINDINGS:\n- "Assuming CAC of A$300" — invented.\n- "Revenue is A$2M ARR" — fabricated.\nVERDICT: NEEDS_REVISION`,
      reviser: () => "Revenue is not disclosed. Assuming CAC of A$300, payback is 2 months.",
    });
    const spy: ModelCaller = async (system, user) => {
      if (/revise startup-report prose/i.test(system)) critique = system;
      return model(system, user);
    };
    const res = await auditText("Revenue is A$2M ARR. Assuming CAC of A$300, payback is 2 months.", evidence, spy, 500);
    expect(res.hadIssues).toBe(true);
    expect(res.findings).toEqual([`"Revenue is A$2M ARR" — fabricated.`]);
    expect(critique).toContain(`- "Revenue is A$2M ARR" — fabricated.`);
    expect(critique).not.toContain("invented");
  });

  it("auditSections carries hadIssues + droppedFindings per outcome and hands the section's citable items to the filter", async () => {
    const ROW = "0a9b8c7d-6e5f-4a4b-9c3d-2e1f0a9b8c7d";
    const model = mockModel({
      critic: () => `FINDINGS:\n- "Stripe shows 9 subscriptions" — not in the EVIDENCE.\nVERDICT: NEEDS_REVISION`,
      reviser: () => "never",
    });
    const [o] = await auditSections(
      [{ id: "revenue", title: "Revenue", content: `Stripe shows 9 subscriptions [ev:${ROW}].`, allowedEvidenceIds: [ROW], citable: [{ id: ROW, label: "Stripe revenue", text: "active_subscriptions = 9" }] }],
      evidence,
      model,
      { llmOnlyWhenUncited: false },
    );
    expect(o!.uncitedClaims).toEqual([]);
    expect(o!.llmAudited).toBe(true);
    expect(o!.hadIssues).toBe(false);
    expect(o!.droppedFindings).toHaveLength(1);
    expect(o!.grounded).toBe(true);
    expect(o!.modelCalls).toBe(1);
  });

  it("a real fabrication still flips hadIssues and grounded off", async () => {
    const model = mockModel({
      critic: () => `FINDINGS:\n- "Revenue reached A$1.2M ARR" — fabricated.\nVERDICT: NEEDS_REVISION`,
      reviser: () => "Revenue is not disclosed. The market is competitive and the product is live.",
    });
    const [o] = await auditSections([{ id: "revenue", title: "Revenue", content: "Revenue reached A$1.2M ARR. The market is competitive.", allowedEvidenceIds: [] }], evidence, model, { llmOnlyWhenUncited: false });
    expect(o!.hadIssues).toBe(true);
    expect(o!.grounded).toBe(false);
    expect(o!.modelCalls).toBe(2);
  });

  it("the critic prompt carries the G24-D never-flag rules", () => {
    expect(CRITIC_INSTRUCTION_TEXT).toContain("NEVER flag");
    expect(CRITIC_INSTRUCTION_TEXT).toContain("(unevidenced)");
    expect(CRITIC_INSTRUCTION_TEXT).toContain("[ev:<id>]");
    expect(CRITIC_INSTRUCTION_TEXT).toContain("recommendations, next steps");
    expect(CRITIC_INSTRUCTION_TEXT).toContain("computed SVI / benchmark / valuation facts");
  });
});

describe("isTargetSentence (G24 merge — targets are plans, not claims)", () => {
  it("treats advice whose numbers are all target-cued as prescriptive", () => {
    for (const t of [
      "LTV:CAC ratio should target >3x, but with zero MRR, this is theoretical.",
      "- **Ongoing**: Monitor burn rate and runway monthly; target 18 months of runway post-raise.",
      "Define a 90-day retention target of 60% for paid users.",
      "**Action**: Founder should post 3x/week on LinkedIn about valuation insights, share sample reports, and engage in Australian founder groups.",
      "Set a 90-day target of A$10k MRR from evaluator subscriptions.",
    ]) expect(isTargetSentence(t), t).toBe(true);
  });
  it("keeps a fact hidden in advice, a plain fact, and a missed-target statement as claims", () => {
    for (const t of [
      "The team should note revenue was A$1.2M in FY25.",
      "Revenue grew 40% last quarter.",
      "The revenue target of A$100k MRR was missed by 30%.",
      "The site is technically strong — A-grade performance, 182ms TTFB, 525 pages with zero broken links.",
      "Consider that 182 startups have been analysed.",
    ]) expect(isTargetSentence(t), t).toBe(false);
  });
});
