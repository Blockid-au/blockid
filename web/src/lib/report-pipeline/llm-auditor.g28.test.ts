// G28-A — grounding ≥ 0.85 on real data: the residual patterns of the 11:34 UTC
// showcase run (groundedShare 0.82 = 18/22) pinned end to end through the
// claim gate, the critic filter and the owner contracts:
//   customer_size  "trial-to-paid conversion ≈ 2.7% vs 15–30% benchmark" (a derived rate)
//   documents      "pay the $290 fee" + "~$250 per class" (statutory fees), "no registered trademarks"
//   website        "needs a content pillar strategy: 3–5 articles, each 2,000+ words" (a cadence plan)
//   gtm_strategy   "SAM ≈ 1,400 entities … SOM 30–40 accounts" (a derived entity count)
// plus the Vietnamese spellings of the declared-estimate marker.
import { describe, expect, it } from "vitest";
import { CRITIC_INSTRUCTION_TEXT, filterCriticFindings, findUncitedClaims } from "./llm-auditor";
import { hasCitationOrMarker, isPrescriptiveClaim, isTargetSentence, UNEVIDENCED_MARKERS } from "./claim-gate";
import { autoCite, AU_LEGAL_TOPIC_RE, itemsFromEvidenceRows, SECTOR_ENTITIES_TOPIC_RE } from "./auto-cite";
import { COMPUTED_FACT_IDS, computedFactRows } from "./computed-facts";
import { structuredOutputSchema, w4OutputContract } from "./agent-dispatcher";
import { AGENT_PROMPTS } from "./agent-prompts";
import { capTokens, PROMPT_BLOCK_CAPS } from "./prompt-tokens";
import { groundedShareOf } from "@/lib/ai/eval-runner";

const SAAS = COMPUTED_FACT_IDS["saas-benchmarks"];
const LEGAL = COMPUTED_FACT_IDS["au-legal"];
const SECTOR = COMPUTED_FACT_IDS["sector-entities"];
const STRIPE = "0b449430-5c8b-44e3-9a9c-7eb9f76831dd";

function rows() {
  return [
    ...computedFactRows({ sviAnalysis: { totalSVI: 138, stageLabel: "Early Traction", subs: [], dimensionScores: {} }, stage: 3, rawText: "A B2B SaaS platform: the Startup Value Index for evaluators." }),
    { evidence_id: STRIPE, source: "stripe" as const, status: "evidenced" as const, observedAt: "2026-09-21T09:00:00.000Z", label: "Stripe revenue (last sync)", value: "182 startups analysed; 3,302 weekly SVI snapshots; 0 active subscriptions; 5 one-off A$3 report charges", dims: [] },
  ];
}

describe("G28-A — Vietnamese declared-estimate markers (claim-gate UNEVIDENCED_MARKERS)", () => {
  it("accepts the VI admissions the contract asks for and the Latin bracket kept inside a VI sentence", () => {
    for (const t of [
      "Chúng tôi ước tính tỷ lệ chuyển đổi dùng thử sang trả phí khoảng 2,7% (5 ÷ 182).",
      "Tỷ lệ chuyển đổi khoảng 2,7% (chưa có bằng chứng).",
      "Tỷ lệ chuyển đổi khoảng 2,7% (unevidenced).",
      "Giả định rằng SAM có khoảng 1.400 tổ chức, SOM năm đầu là 30–40 tài khoản.",
      "Kịch bản cơ sở: đạt A$6.980 MRR sau 12 tháng.",
      "| Kịch bản lạc quan | A$9.000 |",
      "Phí bảo hiểm D&O (ước tính) khoảng A$1.200–A$2.000 mỗi năm.",
      "Tôi giả định CAC ở mức A$200–500.",
    ]) {
      expect(UNEVIDENCED_MARKERS.test(t), t).toBe(true);
      expect(hasCitationOrMarker(t, ["x"]), t).toBe(true);
    }
  });

  it("a bare VI fact is still a claim: no marker, no citation → flagged", () => {
    for (const t of ["Doanh thu đạt A$12.400 MRR trong tháng 6.", "SAM là khoảng 1.400 tổ chức đang sàng lọc startup.", "Phí ASIC hàng năm là $290."]) {
      expect(UNEVIDENCED_MARKERS.test(t), t).toBe(false);
      expect(hasCitationOrMarker(t, ["x"]), t).toBe(false);
    }
    expect(findUncitedClaims("SAM là khoảng 1.400 tổ chức đang sàng lọc startup.", ["x"])).toHaveLength(1);
    expect(findUncitedClaims("Chúng tôi ước tính SAM khoảng 1.400 tổ chức (chưa có bằng chứng).", ["x"])).toEqual([]);
  });

  it("the EN markers are unchanged", () => {
    expect(UNEVIDENCED_MARKERS.test("We estimate CAC at A$200–500.")).toBe(true);
    expect(UNEVIDENCED_MARKERS.test("MRR is A$50K, which suggests early PMF.")).toBe(false);
    expect(UNEVIDENCED_MARKERS.test("Revenue reached A$1.2M ARR.")).toBe(false);
  });
});

describe("G28-A — residual pattern 1: a conversion rate derived from two register numbers (customer_size)", () => {
  const items = () => itemsFromEvidenceRows(rows());
  const ids = () => rows().map((r) => r.evidence_id);

  it("the bare derived rate is uncited even after the auto-citer (2.7% is in no row); the declared-estimate form clears the gate and the benchmark half cites the SaaS row", () => {
    const bare = "For BlockID.au, with 182 startups analysed and 5 report purchases, the trial-to-paid conversion is approximately 2.7%—well below the benchmark range.";
    const cited = autoCite(bare, items());
    expect(cited.added).toBe(0);
    expect(findUncitedClaims(cited.text, ids())).toHaveLength(1);
    const declared = "We estimate trial-to-paid conversion at ≈ 2.7% (5 report purchases ÷ 182 startups analysed) (unevidenced). The SaaS benchmark for trial → paid is 15–30%.";
    const out = autoCite(declared, items());
    expect(out.text).toContain(`15–30% [ev:${SAAS}].`);
    expect(findUncitedClaims(out.text, ids())).toEqual([]);
  });

  it("the risk-row title carrying the derived rate is a claim; the declared form is not", () => {
    const risk = "- **Trial-to-paid conversion rate is critically low at ~2.7% vs 15-30% benchmark** (high) — Analyze GA4 funnel drop-off; implement onboarding emails.";
    expect(isPrescriptiveClaim(risk)).toBe(false);
    expect(findUncitedClaims(risk, ids())).toHaveLength(1);
    const declared = "- **We estimate trial-to-paid at ~2.7% vs the 15-30% benchmark (unevidenced)** (high) — Analyze GA4 funnel drop-off; implement onboarding emails.";
    expect(findUncitedClaims(declared, ids())).toEqual([]);
  });

  it("the CRO template tells the owner to write a derived rate as its own working", () => {
    expect(AGENT_PROMPTS.cro.outputGuidance).toContain("A rate you DERIVE from two register numbers");
    expect(AGENT_PROMPTS.cro.outputGuidance).toContain("We estimate trial-to-paid at ≈ 2.7% (5 ÷ 182) (unevidenced)");
  });
});

describe("G28-A — residual pattern 2: statutory fees and a checklist contradiction (documents)", () => {
  const items = () => itemsFromEvidenceRows(rows());
  const ids = () => rows().map((r) => r.evidence_id);

  it("the remembered $290 and unspecified-dollar $250 stay uncited; the explicitly AUD band remains citable", () => {
    const stale = "ASIC annual review is due by your registration anniversary—ensure you file the annual statement and pay the $290 fee on time. Australian trademark registration (Class 36, Class 42) costs ~$250 per class via IP Australia.";
    const out = autoCite(stale, items());
    expect(out.added).toBe(0);
    expect(out.text).not.toContain(`[ev:${LEGAL}]`);
    const flagged = findUncitedClaims(out.text, ids());
    expect(flagged).toHaveLength(2);
    expect(flagged[0]).toContain("$290");
    expect(flagged[1]).toContain("$250");
    const fromRow = "ASIC's annual review fee for a proprietary company is A$321–A$329 a year, indexed each 1 July. Trade mark registration with IP Australia costs A$250–A$550 per class.";
    const cited = autoCite(fromRow, items());
    expect(cited.added).toBe(2);
    expect(cited.text.match(new RegExp(`\\[ev:${LEGAL}\\]`, "g"))).toHaveLength(2);
    expect(findUncitedClaims(cited.text, ids())).toEqual([]);
    expect(AU_LEGAL_TOPIC_RE.test("pay the annual review fee")).toBe(true);
    expect(AU_LEGAL_TOPIC_RE.test("MRR reached A$321")).toBe(false);
  });

  it("an insurance premium or a peer benchmark that no row holds is written as a declared estimate — the bare form is flagged", () => {
    // a bold "… estimate:" label is the admission in label form (the CLO's insurance lines)
    expect(findUncitedClaims("**Premium estimate:** ~$1,200–$2,000/year for a startup at your stage.", ids())).toEqual([]);
    expect(findUncitedClaims("**Premium:** ~$1,200–$2,000/year for a startup at your stage.", ids())).toHaveLength(1);
    expect(findUncitedClaims("D&O cover runs about $1,200–$2,000 a year for a startup at your stage.", ids())).toHaveLength(1);
    expect(findUncitedClaims("We estimate D&O cover at about $1,200–$2,000 a year for a startup at your stage (unevidenced).", ids())).toEqual([]);
    expect(findUncitedClaims("Companies at your stage typically have 4-6 signed contracts. You have 2 (ToS, Privacy).", ids())).toEqual([]); // weak numbers only — not material, never flagged
    expect(findUncitedClaims("Companies at your stage typically spend A$2,000–A$3,000 on a startup lawyer.", ids())).toHaveLength(1);
  });

  it("the critic drops a finding on a sentence citing the fee row whose numbers are in it, and on a VI declared estimate; keeps one on the stale '$290'", () => {
    const draft = [
      `ASIC's annual review fee for a proprietary company is A$321–A$329 a year, indexed each 1 July [ev:${LEGAL}].`,
      "Chúng tôi ước tính phí bảo hiểm D&O khoảng A$1.200–A$2.000 mỗi năm.",
      "Pay the $290 ASIC fee on time.",
    ].join("\n");
    const findings = [
      `"ASIC's annual review fee for a proprietary company is A$321–A$329 a year" — the EVIDENCE does not provide this fee figure; it is an invented specific.`,
      `"Chúng tôi ước tính phí bảo hiểm D&O khoảng A$1.200–A$2.000 mỗi năm" — no insurance cost appears in the EVIDENCE.`,
      `"Pay the $290 ASIC fee on time" — the EVIDENCE fee band is A$321–A$329, not $290.`,
    ];
    const { kept, dropped } = filterCriticFindings(findings, draft, { allowedEvidenceIds: ids(), citable: items() });
    expect(dropped).toHaveLength(2);
    expect(kept).toEqual([findings[2]]);
  });

  it("the CLO template names the fee row, the declared-estimate rule for premiums and the 'missing only when the checklist says so' rule", () => {
    const g = AGENT_PROMPTS.clo.outputGuidance;
    expect(g).toContain('"ASIC and IP Australia fees: … (platform knowledge)"');
    expect(g).toContain('never a remembered "$290" or "$250"');
    expect(g).toContain('"We estimate … (unevidenced)"');
    expect(g).toContain("Call a document or registration missing ONLY when that output does not list it as completed");
  });
});

describe("G28-A — residual pattern 3: a channel cadence / content plan (website)", () => {
  it("the showcase sentence is a plan — 'needs a' modal, '3–5' range and '2,000+' cues — and no longer a claim; a fact hidden in advice is still checked", () => {
    const plan = `To rank for terms like "startup valuation Australia" or "ESIC valuation report," BlockID.au needs a **content pillar strategy**: 3–5 cornerstone articles, each with 2,000+ words, internal links, and backlink outreach.`;
    expect(isTargetSentence(plan)).toBe(true);
    expect(findUncitedClaims(plan, ["x"])).toEqual([]);
    expect(isTargetSentence("We recommend 3–5 cornerstone articles of 2,000+ words each and a post 3x/week cadence.")).toBe(true);
    expect(isTargetSentence("We suggest publishing 2,000+ word guides.")).toBe(true);
    // "needs" + an uncued money figure: the A$500K is a fact about the raise, still checked.
    expect(isTargetSentence("The company needs A$500K to reach 18 months of runway.")).toBe(false);
    expect(isTargetSentence("Revenue was A$1.2M last year.")).toBe(false);
    expect(findUncitedClaims("The site should note that revenue was A$1,200,000 last year.", ["x"])).toHaveLength(1);
  });

  it("the CMO template writes content plans as recommendations and never invents a sector entity count", () => {
    const g = AGENT_PROMPTS.cmo.outputGuidance;
    expect(g).toContain('write them as "We recommend …" targets');
    expect(g).toContain("never invent a sector entity count when no row holds one");
    expect(g).toContain('"Sector entity count" row (when present)');
  });
});

describe("G28-A — residual pattern 4: a market-entity count derived from the anchor (gtm_strategy)", () => {
  const items = () => itemsFromEvidenceRows(rows());
  const ids = () => rows().map((r) => r.evidence_id);

  it("'roughly 1,400 entities' and '30–40 accounts' are uncited bare; the declared form clears; the whole-sector count cites the sector row", () => {
    const bare = "The SAM is the subset that actively screens startups (angels, funds, accelerators), roughly 1,400 entities. SOM in year one is 2–3% of that (30–40 accounts), given pre-revenue status.";
    const out = autoCite(bare, items());
    expect(out.added).toBe(0);
    expect(findUncitedClaims(out.text, ids())).toHaveLength(2);
    const declared = "We estimate the subset that actively screens startups at roughly 1,400 entities (unevidenced). We estimate a year-one SOM of 2–3% of that, 30–40 accounts (unevidenced).";
    expect(findUncitedClaims(declared, ids())).toEqual([]);
    const whole = autoCite("The ABS basis counts 8,400 active businesses in the SaaS sector.", items());
    expect(whole.text).toContain(`[ev:${SECTOR}]`);
    expect(SECTOR_ENTITIES_TOPIC_RE.test("8,400 sessions in August")).toBe(false);
  });

  it("without market text there is no sector row — the id is simply absent from the register, so nothing can cite it", () => {
    const noAnchor = computedFactRows({ sviAnalysis: { totalSVI: 100, stageLabel: "Concept", subs: [], dimensionScores: {} }, stage: 0, rawText: "We help founders raise capital." });
    expect(noAnchor.some((r) => r.evidence_id === SECTOR)).toBe(false);
    expect(autoCite("The sector holds 8,400 active businesses.", itemsFromEvidenceRows(noAnchor)).added).toBe(0);
  });
});

describe("G28-A — the contracts and the critic carry the rule (EN + VI)", () => {
  it("W4 full + card contracts: derived / outside numbers, the VI marker, no invented sector count, no 'missing' against a completed checklist item", () => {
    const full = w4OutputContract("mpc", "full");
    expect(full).toContain("DERIVED AND OUTSIDE NUMBERS (grounding rule G28)");
    expect(full).toContain('write "we estimate … [unevidenced]"');
    expect(full).toContain('Never invent a sector entity count when no "Sector entity count" row exists');
    expect(full).toContain("Never say a document or registration is missing when a row or module output lists it as completed");
    expect(full).toContain("WRITING IN VIETNAMESE");
    expect(full).toContain("(chưa có bằng chứng)");
    expect(full).toContain("Chúng tôi ước tính");
    // the rules that were on the tail of the contract must still be there (the OUTPUT_SCHEMA cap was raised for this)
    expect(full).toContain("Explain the score using scoreLedger");
    expect(full).toContain("Follow the chapter template:");
    const card = w4OutputContract("mpc", "card");
    expect(card).toContain('written "we estimate … [unevidenced]" or dropped');
    expect(card).toContain("Chúng tôi ước tính");
    // W1–W3: the same rule, and the contract still fits the OUTPUT_SCHEMA cap with its HARD LIMIT tail intact.
    const w13 = structuredOutputSchema("standard");
    expect(w13).toContain("DERIVED AND OUTSIDE NUMBERS (grounding rule G28)");
    expect(w13).toContain('write "We estimate … (unevidenced)"');
    expect(w13).toContain('Never invent a\n  sector entity count when no "Sector entity count" row exists');
    expect(w13).toContain("WRITING IN VIETNAMESE");
    expect(capTokens(w13, PROMPT_BLOCK_CAPS.OUTPUT_SCHEMA)).toBe(w13);
    expect(capTokens(full, PROMPT_BLOCK_CAPS.OUTPUT_SCHEMA)).toBe(full);
  });

  it("the critic prompt names the platform-knowledge rows, their PROVENANCE, the derived-figure rule and the VI admissions", () => {
    expect(CRITIC_INSTRUCTION_TEXT).toContain("PLATFORM KNOWLEDGE AND COMPUTED ROWS");
    expect(CRITIC_INSTRUCTION_TEXT).toContain("PROVENANCE");
    expect(CRITIC_INSTRUCTION_TEXT).toContain("never call it fabricated");
    expect(CRITIC_INSTRUCTION_TEXT).toContain("A figure DERIVED from them");
    expect(CRITIC_INSTRUCTION_TEXT).toContain("chúng tôi ước tính");
    expect(CRITIC_INSTRUCTION_TEXT).toContain("(chưa có bằng chứng)");
  });

  it("eval-runner groundedShareOf counts a declared estimate (EN or VI) as grounded, a bare number not", () => {
    const fx = { id: "c", name: "c", input: { evidenceRows: [{ id: "x" }] }, expected: { must_have_gaps: [], must_not_hallucinate: [] } };
    expect(groundedShareOf(fx, { verdict: "Early [ev:x]", strengths: ["We estimate CAC at A$200 (unevidenced)", "Chúng tôi ước tính SAM khoảng 1.400 tổ chức."], gaps: ["SAM is roughly 1,400 entities."] })).toBe(0.75);
  });
});

describe("isTargetSentence — facts embedded in advice stay claims (review v3.27.0 P2)", () => {
  it("a stated fact inside an advice sentence is never a target, whatever cues sit by its numbers", () => {
    for (const t of [
      "We recommend the team, which currently serves 1,200–1,500 paying customers, prioritise churn.",
      "The company needs a bridge: MRR was A$40–60K through 2025.",
      "Revenue reached A$1.2M+ last year, so the team should target 3x.",
    ]) expect(isTargetSentence(t), t).toBe(false);
  });
  it("a plan with range / plus cues and no fact verb is still a target", () => {
    for (const t of [
      "The site needs a content strategy: 3–5 articles a month, each 2,000+ words.",
      "**Action**: Founder should post 3x/week on LinkedIn about valuation insights, share sample reports, and engage in Australian founder groups.",
    ]) expect(isTargetSentence(t), t).toBe(true);
  });
});
