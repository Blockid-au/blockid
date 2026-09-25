// G35 — grounded share 0.77 → KPI 0.85 without inventing citations.
//
// The loss buckets were read off the audit logs stored in the 2026-09-23/24
// live reports (appendix.auditLog: per-section uncitedClaims + critic
// findings). Each fix below is pinned with the live sentence shape (names
// fictionalised) AND with the regression it must not cause: an uncited
// factual figure is never counted as grounded.

import { describe, expect, it } from "vitest";
import type { ModelCaller } from "@/lib/adk";
import { AGENT_PROMPTS } from "./agent-prompts";
import { autoCite, itemsFromCatalogue, itemsFromModuleOutputs, numericTokens } from "./auto-cite";
import { attachTrailingMarkers, hasCitationOrMarker, isMaterialClaim, isPrescriptiveClaim, isTargetSentence, normalizeCitationMarkers, stripStatuteYears } from "./claim-gate";
import { AU_CONTEXT_FACTS, COMPUTED_FACT_IDS, COMPUTED_FACT_LABELS } from "./computed-facts";
import { executiveOutputContract } from "./executive-summary";
import { RUN_R10, RUN_R9, replayRun } from "./grounded-share.fixtures";
import { auditText, findUncitedClaims } from "./llm-auditor";
import { trimVerdict } from "./verdict-trim";

const AU = COMPUTED_FACT_IDS["au-context"];
const auItems = () => itemsFromCatalogue([{ evidence_id: AU, label: COMPUTED_FACT_LABELS["au-context"], content: AU_CONTEXT_FACTS }]);

describe("G35 bucket 1 — a statute's title year is a name, not a figure", () => {
  it("the live documents-section sentences are not material claims any more", () => {
    for (const s of [
      "Given the handling of sensitive health data, compliance with the Privacy Act 1988 and the Australian Privacy Principles (APPs) is mandatory.",
      "Directors must comply with duties under s180-184 of the Corporations Act 2001, including care and diligence.",
      "Compliance with the Privacy Act 1988 and Australian Consumer Law (ACL) will be essential.",
      "Employment contracts must meet the Fair Work Regulations 2009 (Cth).",
    ]) {
      expect(isMaterialClaim(s), s).toBe(false);
      expect(findUncitedClaims(s, ["x"]), s).toEqual([]);
    }
    expect(stripStatuteYears("the Privacy Act 1988 (Cth)")).toBe("the Privacy Act (Cth)");
    expect(numericTokens("Directors' duties sit in the Corporations Act 2001 [ev:x].")).toEqual([]);
  });

  it("regression: every other figure in the sentence is still measured, and bare years / counts are untouched", () => {
    const s = "The Privacy Act 1988 applies to businesses with turnover above A$3 million.";
    expect(isMaterialClaim(s)).toBe(true);
    expect(findUncitedClaims(s, ["x"])).toHaveLength(1);
    expect(isMaterialClaim("The platform has 2000 customers.")).toBe(true);
    expect(isMaterialClaim("Founded in 2019, it now serves 1,500 users.")).toBe(true);
    // lower-case "act" is not a statute title
    expect(isMaterialClaim("Founders who act 2000 times a year are rare.")).toBe(true);
  });
});

describe("G35 bucket 2 — advice written with numbers is a plan, a fact in advice clothing is not", () => {
  it("the live founder_profile / team / market action sentences are targets", () => {
    for (const s of [
      "Offer 0.5-1% equity each with a 2-year vest.",
      "We recommend allocating 10% initially, with a 4-year vesting schedule and a 1-year cliff for all co-founders and early employees.",
      "Allocate A$2,000 to a 90-day paid-search pilot.",
    ]) {
      expect(isTargetSentence(s), s).toBe(true);
      expect(findUncitedClaims(s, ["x"]), s).toEqual([]);
    }
    const label = "**60 days**: Publish 3 cornerstone articles and launch a Google Ads pilot with A$2,000 budget.";
    expect(isPrescriptiveClaim(label)).toBe(true);
    expect(findUncitedClaims(label, ["x"])).toEqual([]);
    expect(isPrescriptiveClaim("- **Week 2**: Validate pricing with 10 interviews at A$49 a month.")).toBe(true);
  });

  it("regression: a figure that states what is / was stays an uncited claim", () => {
    for (const s of [
      "We recommend building on the A$1.2M ARR the company already has.",
      "Offer 1% equity since runway is 6 months.",
      "Raise now: revenue was A$40k last quarter.",
      "We recommend allocating 10% because revenue reached A$200k.",
    ]) {
      expect(isTargetSentence(s), s).toBe(false);
      expect(findUncitedClaims(s, ["x"]), s).toHaveLength(1);
    }
    for (const s of ["**90 days**: Revenue grew 40% to A$50k.", "**30 days**: MRR reached A$5,000.", "**60 days**: The market is A$2B."]) {
      expect(isPrescriptiveClaim(s), s).toBe(false);
      expect(findUncitedClaims(s, ["x"]), s).toHaveLength(1);
    }
  });
});

describe("G35 bucket 3 — the platform row the prompt quotes must hold the figure (GST threshold)", () => {
  it("the AU-context row now holds A$75,000, so the live cited sentence and the risk title resolve", () => {
    expect(AU_CONTEXT_FACTS).toContain("A$75,000");
    const cited = `GST registration is required once turnover exceeds A$75k [ev:${AU}].`;
    expect(findUncitedClaims(cited, [AU], 8, auItems())).toEqual([]);
    const risk = "- **GST registration required once turnover exceeds A$75k — cash flow impact** (low) — Plan for GST compliance in the financial model";
    const out = autoCite(risk, auItems());
    expect(out.added).toBe(1);
    expect(findUncitedClaims(out.text, [AU], 8, auItems())).toEqual([]);
  });

  it("regression: the row never backs an off-topic figure, and a GST figure it does not hold stays uncited", () => {
    expect(autoCite("Revenue exceeds A$75k this year.", auItems()).added).toBe(0);
    const wrong = `GST registration is required once turnover exceeds A$90k [ev:${AU}].`;
    expect(findUncitedClaims(wrong, [AU], 8, auItems())).toHaveLength(1);
  });
});

describe("G35 bucket 4 — malformed markers that name an allowed id", () => {
  const MOD = "agents/clo-compliance.ts:calculateComplianceScore";
  const modItems = () => itemsFromModuleOutputs([{ id: MOD, output: { score: 75, completedCount: 12 } }]);

  it("[module:<id>], multi-id, trailing-word and after-the-full-stop markers are read as the id", () => {
    expect(normalizeCitationMarkers(`Compliance is 75% complete [module:${MOD}].`, [MOD])).toBe(`Compliance is 75% complete [ev:${MOD}].`);
    expect(normalizeCitationMarkers("Solo founder [ev:r1, ev:r2].", ["r1", "r2"])).toBe("Solo founder [ev:r1] [ev:r2].");
    expect(normalizeCitationMarkers("No product yet [ev:r1; ev:r2; r3].", ["r1", "r2", "r3"])).toBe("No product yet [ev:r1] [ev:r2] [ev:r3].");
    expect(normalizeCitationMarkers(`Zero customers [ev:${MOD} output].`, [MOD])).toBe(`Zero customers [ev:${MOD}].`);
    expect(attachTrailingMarkers("Revenue is A$5,000. [ev:r1] The market is large.")).toBe("Revenue is A$5,000 [ev:r1]. The market is large.");
    expect(findUncitedClaims(`Compliance is 75% complete [module:${MOD}].`, [MOD], 8, modItems())).toEqual([]);
    const row = [{ id: "r1", label: "Stripe revenue", text: "Stripe revenue — revenue_aud = 5000 (A$5,000)" }];
    expect(findUncitedClaims("Revenue is A$5,000. [ev:r1] The market is large.", ["r1"], 8, row)).toEqual([]);
  });

  it("regression: an unknown id is never promoted, and a normalised marker still needs the figure in its row", () => {
    expect(normalizeCitationMarkers("Score 75% [module:unknown.ts:x].", [MOD])).toBe("Score 75% [module:unknown.ts:x].");
    expect(normalizeCitationMarkers("Score 75% [ev:bogus output].", [MOD])).toBe("Score 75% [ev:bogus output].");
    expect(hasCitationOrMarker(normalizeCitationMarkers("Solo [ev:zzz, ev:yyy].", ["r1"]), ["r1"])).toBe(false);
    expect(findUncitedClaims(`Compliance is 95% complete [module:${MOD}].`, [MOD], 8, modItems())).toHaveLength(1);
    const row = [{ id: "r1", label: "Stripe revenue", text: "Stripe revenue — revenue_aud = 5000 (A$5,000)" }];
    expect(findUncitedClaims("Revenue is A$9,000. [ev:r1] The market is large.", ["r1"], 8, row)).toHaveLength(1);
    // The live dim:tre sentence: no marker, no row holds 0% — ungrounded.
    expect(findUncitedClaims("The entire AARRR funnel is at 0% — a clean slate.", ["x"])).toHaveLength(1);
  });

  it("autoCite rewrites the published marker, so a module-cited chapter bullet no longer reads [unevidenced]", () => {
    const out = autoCite(`- Data room 60% complete [module:${MOD}]`, itemsFromModuleOutputs([{ id: MOD, output: { score: 60 } }]));
    expect(out.text).toBe(`- Data room 60% complete [ev:${MOD}]`);
  });
});

describe("G35 — verdict trimming keeps the cited clause", () => {
  it("a marker after the full stop stays with its sentence through a sentence-boundary cut", () => {
    const r = trimVerdict("Revenue is A$5,000. [ev:r1] The market is large and growing quickly across every Australian state and territory this year.", 8);
    expect(r.trimmed).toBe(true);
    expect(r.text).toBe("Revenue is A$5,000 [ev:r1].");
    const row = [{ id: "r1", label: "Stripe revenue", text: "revenue_aud = 5000 (A$5,000)" }];
    expect(findUncitedClaims(r.text, ["r1"], 8, row)).toEqual([]);
  });
});

describe("G35 — prompt contract: no figures in titles / headlines", () => {
  it("the CMO / CRO title styles and the legacy example carry no figure; the executive contract forbids one", () => {
    expect(AGENT_PROMPTS.cmo.outputGuidance).not.toContain("{TAM Size}");
    expect(AGENT_PROMPTS.cmo.outputGuidance).toContain("no figure in the title");
    expect(AGENT_PROMPTS.cro.outputGuidance).not.toContain("{User Count/Growth Summary}");
    const exec = executiveOutputContract();
    expect(exec).toContain("no figures»");
    expect(exec).toContain('The headline and every "title" carry NO numbers');
  });
});

describe("G35 — the reviser's echoed heading is stripped", () => {
  it("a revised thesis never starts with '## DRAFT'", async () => {
    const model: ModelCaller = async (system) => {
      if (/fact-checking critic/i.test(system)) return `FINDINGS:\n- "The founder has 10 years of domain experience" — the EVIDENCE shows 20.\nVERDICT: NEEDS_REVISION`;
      return "## DRAFT\nHarbourline builds contract tooling for Australian law firms; the founder has 20 years of domain experience.";
    };
    const res = await auditText("Harbourline builds contract tooling for Australian law firms; the founder has 10 years of domain experience.", "years_in_domain = 20", model, 500);
    expect(res.hadIssues).toBe(true);
    expect(res.revised.startsWith("Harbourline")).toBe(true);
  });
});

describe("G35 — offline before / after on the live-shaped fixtures", () => {
  // BEFORE (measured on 1dc6e7868, the parent of the G35 commits, same fixtures):
  //   r10 0.73 (11/15) — executive, market, revenue, documents ungrounded; 4 model calls (after: 2)
  //   r9  0.73 (16/22) — executive, dim:tre, founder_profile, documents, gtm_strategy, team; 9 model calls (after: 6)
  // Both equal the groundedShare the live pipeline logged for the report each mirrors.
  it("r10 (2026-09-24 shape): 0.73 → 0.87 — only the headline-figure executive and the uncited market sizes stay ungrounded", async () => {
    const r = await replayRun(RUN_R10);
    expect(r.groundedShare).toBe(0.87);
    expect(r.outcomes.filter((o) => !o.grounded).map((o) => o.sectionId).sort()).toEqual(["executive", "market"]);
    const market = r.outcomes.find((o) => o.sectionId === "market")!;
    // the genuinely unsupported market sizes are still flagged; the action line and the title figure too
    expect(market.uncitedClaims.some((c) => c.includes("A$27 billion"))).toBe(true);
    expect(market.uncitedClaims.some((c) => c.includes("A$30B+"))).toBe(true);
    expect(market.uncitedClaims.some((c) => c.includes("**60 days**"))).toBe(false);
    expect(r.modelCalls).toBe(2);
  });

  it("r9 (2026-09-23 shape): 0.73 → 0.86 — the executive, dim:tre (uncited 0%) and gtm_strategy stay ungrounded", async () => {
    const r = await replayRun(RUN_R9);
    expect(r.groundedShare).toBe(0.86);
    expect(r.outcomes.filter((o) => !o.grounded).map((o) => o.sectionId).sort()).toEqual(["dim:tre", "executive", "gtm_strategy"]);
    const tre = r.outcomes.find((o) => o.sectionId === "dim:tre")!;
    expect(tre.uncitedClaims).toEqual(["The entire AARRR funnel is at 0% — a clean slate."]);
    expect(r.outcomes.find((o) => o.sectionId === "dim:lco")!.grounded).toBe(true);
    expect(r.modelCalls).toBe(6);
  });
});
