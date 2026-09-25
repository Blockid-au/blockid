// dimension-owners — THE single table for the 8 SVI dimensions.
//
// G13-W1-R1 / decision D8 (docs/plans/investor-clarity-2026-09-15.md §3):
// TRE→CRO, MPC→CMO, FTV→CHRO, PTD→CTO, CGH→CFO, IRI→CLO, LCO→CLO, SVM→CEO;
// CDO = evidence & cohort officer on every chapter; CISO / COO = always-on
// deterministic cards. Spec §B.10 is the source; §B.1–B.8 supply the
// criteria map, frameworks, modules, connectors and research topics.
//
// This table replaces the three rubric copies the plan found (§0 row 7 /
// §B.11): `DIM_META` in api/svi/dimensions/stream, `DIMENSION_INFO` in
// api/svi/dimension-analyze and the CDO stage medians in agent-prompts.
// S-R3: `DIMENSION_INFO` is gone (dimension-analyze reads promptCopy directly);
// `legacyStreamDimMeta` (DIM_META) stays one release for route.legacy.ts. The
// CDO stage-medians block in agent-prompts was deleted in S-R2 —
// every rubric number now comes from `benchmarkFor()` (svi-dimension-benchmarks
// ANCHORS) and every qualitative anchor from `rubric` below.
//
// G34 D24-c: the screening catalogue registry (lib/screening/registry.ts) is
// the owner source of truth for screening items — item owner = the `primary`
// lead below; criterion `primaryAgent` is a contributor. registry.test.ts pins
// the two in sync. Behaviour and weights here are unchanged (D24-f).
//
// Pure module: no I/O. Benchmarks come from svi-dimension-benchmarks.ts
// (ANCHORS p50 ± spread); phase floors from growth/phase-gate.ts
// PHASE_EXIT_RULES — neither is duplicated here.

import type { CriterionKey } from "@/lib/evaluation-criteria";
import type { GrowthPhaseId } from "@/lib/growth/phase-taxonomy";
import type { ChartTypeV2 } from "@/lib/report-visuals/types";
import { DIMENSION_BENCHMARKS_BY_STAGE } from "@/lib/svi-dimension-benchmarks";
import type { AgentRole } from "./types";

export type DimKey = "tre" | "mpc" | "ftv" | "ptd" | "cgh" | "iri" | "lco" | "svm";

/** Keys into `.claude/knowledge-base/**.md` (resolved by knowledge-loader.ts). */
export type KnowledgeKey = "svi-framework" | "esop-expertise" | "valuation-methods" | "blockid-profile";

export const KNOWLEDGE_FILES: Record<KnowledgeKey, string> = {
  "svi-framework": "svi-scoring/svi-framework.md",
  "esop-expertise": "esop/esop-expertise.md",
  "valuation-methods": "valuation/valuation-methods.md",
  "blockid-profile": "blockid-self-analysis/blockid-profile.md",
};

/** Weight order — the ReportV2 chapter order (§A.1). */
export const DIM_ORDER: readonly DimKey[] = ["tre", "mpc", "ftv", "ptd", "cgh", "iri", "lco", "svm"];

/** Legacy display order used by the stream route, DIMS tables and PDFs. */
export const DIM_LEGACY_ORDER: readonly DimKey[] = ["ftv", "mpc", "ptd", "tre", "cgh", "iri", "lco", "svm"];

export type EvidenceSource =
  | "stripe"
  | "ga4"
  | "github"
  | "xero"
  | "linkedin"
  | "upload"
  | "url"
  | "self_declared"
  /** G14-S37: the structured founder profile (founder_profiles, 0408) scored by lib/founder/execution.ts. */
  | "founder_profile"
  | "connector_other"
  /** G14-S40: open AU register rows (ABR / GrantConnect / R&DTI) via lib/signals/external-signals.ts. */
  | "external";

export interface DimensionOwner {
  key: DimKey;
  /** Canonical chapter title (§A.1). */
  title: string;
  titleVi: string;
  /** Short section label for TOCs and cards. */
  shortLabel: string;
  weight: number;
  primary: AgentRole;
  supporting: AgentRole[];
  /** Criteria whose `primaryDimension` is this dim (evaluation-criteria.ts). */
  primaryCriteria: CriterionKey[];
  /** Criteria that reach this dim through a secondary lens. */
  secondaryCriteria: CriterionKey[];
  /** `GROWTH_PHASES.leadAgent` phases consulted for this dim (§B.10). */
  phaseLeads: GrowthPhaseId[];
  frameworks: string[];
  modules: string[];
  connectors: EvidenceSource[];
  researchTopics: string[];
  primaryVisual: ChartTypeV2;
  secondaryVisual: ChartTypeV2;
  allowedVisuals: ChartTypeV2[];
  /** Free tier renders chapters 2–5 in full, 6–9 as one-card summaries. */
  freeTier: "full" | "card";
  /** `.claude/knowledge-base` files injected into the owner prompt (§C.2, ≤ 2 used). */
  knowledge: KnowledgeKey[];
  /** Chapter output template the owner agent follows (§B.1–B.8 "Template"). */
  outputTemplate: string;
  /** Qualitative rubric anchors (§B.11) — what p25 / p50 / p75 look like. */
  rubric: { p25: string; p50: string; p75: string };
  /** What the owner asks for at each growth phase (§B.1–B.8 "Phase behaviour"). */
  phaseBehaviour: Partial<Record<GrowthPhaseId, string>>;
  /**
   * Verbatim prompt strings the two legacy routes used before this table
   * existed. Kept byte-identical so S-R1 changes no prompt; S-R2 replaces
   * them with the role card + phase lens.
   */
  promptCopy: {
    streamLabel: string;
    streamDescription: string;
    analyzeLabel: string;
    analyzeFocus: string;
  };
}

export const DIMENSION_OWNERS: Record<DimKey, DimensionOwner> = {
  ftv: {
    key: "ftv",
    title: "Founder & Team Value",
    titleVi: "Giá trị nhà sáng lập & đội ngũ",
    shortLabel: "Founding Team",
    weight: 15,
    primary: "chro",
    supporting: ["ceo", "clo", "coo"],
    primaryCriteria: ["founder_profile", "team", "team_structure"],
    secondaryCriteria: [],
    phaseLeads: ["team", "mentor_review"],
    frameworks: [
      "founder-market fit (domain years, prior exits, network)",
      "founder execution rubric (exits 30 · raises 15 · years 20 · roles 15 · full-time 10 · together 5 · GitHub 5; self-reported cap 70)",
      "team completeness (hacker / hustler / hipster + finance)",
      "Antler signals (spike, drive, commitment %)",
      "key-person risk",
      "full-time %",
      "advisory board",
      "hiring plan vs runway",
    ],
    modules: ["agents/chro-team.ts", "agents/antler-signals.ts", "agents/maturity-detector.ts", "founder/execution.ts"],
    connectors: ["linkedin", "github", "upload", "founder_profile"],
    researchTopics: ["AU salary benchmarks (annual)", "co-founder agreement norms", "Antler / Startmate cohort criteria updates"],
    primaryVisual: "heat_map",
    secondaryVisual: "bar",
    allowedVisuals: ["heat_map", "bar", "radar"],
    freeTier: "full",
    knowledge: ["esop-expertise", "svi-framework"],
    outputTemplate: "verdict → TeamCompletenessHeatmap → founder-fit bars → evidence (founder profile / LinkedIn / GitHub / uploads) → card Founder Execution (rubric score, breakdown, cap notice) → cards founder_profile, team, team_structure → strengths / gaps / next action → stamp",
    rubric: {
      p25: "solo, part-time, no domain history",
      p50: "2 founders, one domain expert, vesting agreed · key roles covered · leadership bench forming",
      p75: "complementary trio, prior exit / operator, full-time, advisory board · hiring plan funded · low key-person risk",
    },
    phaseBehaviour: {
      vision: "solo vs co-founder, commitment %",
      mentor_review: "skills gap, next 3 hires, equity split",
      team: "skills gap, next 3 hires, equity split; floor ftv 60",
      growth: "leadership bench, ESOP coverage, retention",
      funding: "leadership bench, ESOP coverage, retention",
    },
    promptCopy: {
      streamLabel: "Founder & Team Value",
      streamDescription:
        "Founding team credibility, domain expertise, execution track record, and team completeness",
      analyzeLabel: "Founder & Team Value",
      analyzeFocus:
        "Founder backgrounds, team composition, advisory board quality, domain-market fit, team gaps, hiring priorities. Compare founder experience to stage benchmarks. Assess co-founder complementarity and skill overlap.",
    },
  },
  mpc: {
    key: "mpc",
    title: "Market Pull & Category",
    titleVi: "Sức hút thị trường & danh mục",
    shortLabel: "Market & Problem",
    weight: 18,
    primary: "cmo",
    supporting: ["cpo", "cro", "cfo", "cdo"],
    primaryCriteria: ["market", "gtm_strategy", "idea"],
    secondaryCriteria: ["website"],
    phaseLeads: ["vision", "customer_dev", "go_to_market"],
    frameworks: [
      "TAM/SAM/SOM ABS-anchored (top-down × bottom-up cross-check)",
      "JTBD",
      "problem-severity (frequency × intensity × current spend)",
      "category design (create vs enter)",
      "timing (why now, 3 tailwinds)",
      "competitor 2×2",
      "channel economics (CAC by channel)",
    ],
    modules: [
      "agents/cfo-tam-sam-som.ts",
      "report-pipeline/au-market-anchor.ts",
      "agents/cmo-market-research.ts",
      "agents/cmo-competitor-tracker.ts",
      "svi/sector-map.ts",
    ],
    connectors: ["url", "ga4", "upload"],
    researchTopics: ["ABS industry revenue tables (annual)", "AU sector growth rates", "AU competitor funding announcements", "category-design examples in AU"],
    primaryVisual: "funnel",
    secondaryVisual: "positioning_2x2",
    allowedVisuals: ["funnel", "positioning_2x2", "bar"],
    freeTier: "full",
    knowledge: ["svi-framework"],
    outputTemplate: "verdict → TAM/SAM/SOM funnel → competitor 2×2 → evidence → cards market, gtm_strategy, idea → strengths / gaps / next action → stamp",
    rubric: {
      p25: "problem stated, no sizing · TAM top-down only · SAM unverified",
      p50: "persona + pain evidence · bottom-up SAM, 3 named competitors · category narrative, channel CAC known",
      p75: "problem-severity quantified (spend today) · SAM cross-checked, 2×2 with wedge · share-of-SOM trajectory, why-now evidenced",
    },
    phaseBehaviour: {
      vision: "problem interviews ≥ 10, persona, pain top-3, WTP; floor mpc 40",
      customer_dev: "problem interviews ≥ 10, persona, pain top-3, WTP; floor mpc 55",
      revenue_model: "SAM bottom-up, competitor 2×2",
      pitch: "SAM bottom-up, competitor 2×2",
      go_to_market: "channel CAC, share of SOM, category narrative",
    },
    promptCopy: {
      streamLabel: "Market & Problem Clarity",
      streamDescription:
        "Market size (TAM/SAM/SOM), problem severity, customer segment definition, and timing",
      analyzeLabel: "Market & Problem Clarity",
      analyzeFocus:
        "TAM/SAM/SOM validation, problem-solution fit, customer discovery evidence, competitive landscape positioning, market timing assessment. Evaluate whether the market is ready, too early, or too late.",
    },
  },
  ptd: {
    key: "ptd",
    title: "Product & Tech Depth",
    titleVi: "Chiều sâu sản phẩm & công nghệ",
    shortLabel: "Product & Technology",
    weight: 12,
    primary: "cto",
    supporting: ["ciso", "cpo", "cdo"],
    primaryCriteria: ["code_git", "website"],
    secondaryCriteria: ["roadmap"],
    phaseLeads: ["product_dev"],
    frameworks: [
      "tech-audit (CWV, a11y, headers)",
      "repo health (commit cadence, tests, CI, dependency freshness, bus factor)",
      "defensibility (proprietary data, algorithms, integrations, patents)",
      "build-vs-buy",
      "OWASP top 10",
      "Essential Eight ML1–3",
      "infra cost per user",
    ],
    modules: ["agents/tech-intelligence.ts", "agents/cto-next-best-action.ts", "agents/cto-cost-modeling.ts", "agents/ciso-security.ts"],
    connectors: ["github", "url", "upload"],
    researchTopics: ["framework / LLM cost curves", "ACSC Essential Eight updates", "Core Web Vitals threshold changes"],
    primaryVisual: "bar",
    secondaryVisual: "gauge",
    allowedVisuals: ["bar", "gauge", "checklist", "progress"],
    freeTier: "full",
    knowledge: ["svi-framework"],
    outputTemplate: "verdict → RepoHealthBars → CWV gauge → evidence → cards code_git, website → CISO security card (deterministic) → strengths / gaps / next action → stamp",
    rubric: {
      p25: "slides only · repo dormant, no tests · no CI, CWV poor",
      p50: "clickable prototype · MVP live, tests + CI, CWV OK · SLOs, security plan, Essential Eight ML1",
      p75: "working demo with users · integrations, proprietary data, ML2 · scalable infra, IP filed",
    },
    phaseBehaviour: {
      vision: "prototype / no-code is fine, ask for a demo link",
      customer_dev: "prototype / no-code is fine, ask for a demo link",
      product_dev: "MVP scope, architecture, security plan; floor ptd 55",
      growth: "scalability, SLOs, incident process",
    },
    promptCopy: {
      streamLabel: "Product & Tech Depth",
      streamDescription:
        "Product differentiation, technical moat, IP, build stage, and scalability",
      analyzeLabel: "Product & Technical Depth",
      analyzeFocus:
        "Tech stack maturity, architecture review, code quality (if GitHub connected), product roadmap gaps, scalability assessment, build vs buy analysis. Assess demo/prototype quality for investor readiness.",
    },
  },
  tre: {
    key: "tre",
    title: "Traction & Revenue Evidence",
    titleVi: "Bằng chứng tăng trưởng & doanh thu",
    shortLabel: "Traction & Revenue",
    weight: 20,
    primary: "cro",
    supporting: ["cfo", "cmo", "cdo"],
    primaryCriteria: ["customer_size", "revenue"],
    secondaryCriteria: ["market", "website", "gtm_strategy"],
    phaseLeads: ["customer_dev", "revenue_model", "growth"],
    frameworks: [
      "AARRR (Acquisition → Referral)",
      "cohort retention (M1 / M3 / M6)",
      "Rule of 40",
      "NRR / GRR",
      "MRR quality (new vs expansion vs churn, top-customer concentration ≤ 20 %)",
      "burn multiple ≤ 2",
      "CAC payback ≤ 12 mo (AU SaaS)",
    ],
    modules: [
      "agents/cro-conversion.ts",
      "agents/cro-experiments.ts",
      "svi/valuation-mrr-bridge.ts",
      "agents/cfo-valuation.ts:evaluateUnitEconomics",
      "agents/cfo-valuation.ts:calculateRuleOf40",
    ],
    connectors: ["stripe", "xero", "ga4", "upload"],
    researchTopics: ["AU SaaS benchmark refresh (Airtree / SaaS Capital yearly)", "NRR medians by sector", "GA4 → revenue attribution methods", "marketplace take-rate norms"],
    primaryVisual: "sparkline",
    secondaryVisual: "funnel",
    allowedVisuals: ["sparkline", "funnel", "bar", "line"],
    freeTier: "full",
    knowledge: ["svi-framework", "valuation-methods"],
    outputTemplate: "verdict → RevenueSparkline → AARRR funnel → evidence table (Stripe / Xero / GA4 rows with freshness) → cards customer_size, revenue → strengths / gaps → next action (Connect Stripe: +X TRE, +Y SVI) → stamp",
    rubric: {
      p25: "idea: no interviews · seed: under A$2k MRR, no cohort data · A: under A$40k MRR, flat",
      p50: "idea: 10+ interviews, waitlist · seed: A$5–15k MRR, 5–8 % MoM · A: A$80–150k MRR, NRR ≈ 100 %",
      p75: "idea: LOIs / paid pilots · seed: over A$20k MRR, ≥ 10 % MoM, churn under 3 % · A: over A$200k MRR, NRR over 110 %, burn multiple under 1.5",
    },
    phaseBehaviour: {
      vision: "interview count, LOIs, waitlist, willingness-to-pay",
      customer_dev: "interview count, LOIs, waitlist, willingness-to-pay",
      revenue_model: "first paying customers, pricing tested, MoM growth; floor tre 40",
      go_to_market: "first paying customers, pricing tested, MoM growth; floor tre 55",
      growth: "MRR ≥ A$50k, NRR over 100 %, cohort curves, pipeline coverage 3×; floor tre 70",
      funding: "MRR ≥ A$50k, NRR over 100 %, cohort curves, pipeline coverage 3×",
    },
    promptCopy: {
      streamLabel: "Traction & Revenue Evidence",
      streamDescription:
        "Revenue, MoM growth, DAU/MAU, retention, paying customers, and pipeline",
      analyzeLabel: "Traction & Revenue Evidence",
      analyzeFocus:
        "Revenue metrics validation (MRR/ARR), growth trajectory analysis, unit economics (ARPU, CAC, LTV), customer acquisition channels, churn signals, revenue milestone mapping for next fundraise stage.",
    },
  },
  cgh: {
    key: "cgh",
    title: "Capital & Governance Health",
    titleVi: "Sức khoẻ vốn & quản trị",
    shortLabel: "Cap Table & Governance",
    weight: 12,
    primary: "cfo",
    supporting: ["clo", "chro", "coo"],
    primaryCriteria: [],
    secondaryCriteria: ["team", "dataroom", "team_structure"],
    phaseLeads: ["legal_equity", "funding"],
    frameworks: [
      "cap-table health (founders ≥ 50 % post-seed, no dead equity, clean SAFE stack)",
      "ESOP pool 10–15 %",
      "vesting 4y / 1y cliff",
      "dilution path (2 rounds, ownership at exit)",
      "governance (board composition, observer rights, information rights, D&O)",
      "SHA presence",
      "s708 eligibility of past raises",
    ],
    modules: ["agents/cfo-esop-scoring.ts", "agents/cfo-valuation.ts:calculateRoundDynamics", "agents/cfo-projection-norms.ts"],
    connectors: ["upload", "connector_other"],
    researchTopics: ["ESS (Division 83A) changes", "AU SAFE / SAFE-note norms (Cut Through)", "board composition benchmarks seed → A"],
    primaryVisual: "donut",
    secondaryVisual: "line",
    allowedVisuals: ["donut", "line", "bar"],
    freeTier: "card",
    knowledge: ["esop-expertise", "valuation-methods"],
    outputTemplate: "verdict → CapTableDonut (actual or target) → DilutionPath → evidence (register / uploads) → cards team, dataroom, team_structure (CGH lens) → strengths / gaps / next action → stamp",
    rubric: {
      p25: "no split agreed · no SHA, no ESOP, SAFE stack messy · founders under 40 %",
      p50: "split + vesting · SHA, ESOP pool reserved, clean register · board with independent seat",
      p75: "ESOP 10–15 % granted, dilution modelled 2 rounds · information rights, D&O, board cadence · governance ready for institutional",
    },
    phaseBehaviour: {
      vision: "founder split, vesting agreed?",
      revenue_model: "founder split, vesting agreed?",
      legal_equity: "SHA, ESOP pool reserved, cap table model; floor cgh 50",
      funding: "round modelling, dilution ≤ 20–25 % per round, board seat plan; floor cgh 65",
    },
    promptCopy: {
      streamLabel: "Cap Table & Governance",
      streamDescription:
        "Equity structure, vesting schedules, board composition, and investor governance",
      analyzeLabel: "Cap Table & Governance Health",
      analyzeFocus:
        "Cap table health vs AU seed norms (60-80% founder ownership pre-seed), vesting adequacy (4-year cliff), ESOP pool sizing (8-15% AU standard), governance maturity, shareholder agreement completeness, dilution modeling.",
    },
  },
  iri: {
    key: "iri",
    title: "Investor Readiness Index",
    titleVi: "Chỉ số sẵn sàng gọi vốn",
    shortLabel: "Investor Readiness",
    weight: 10,
    primary: "clo",
    supporting: ["cfo", "cro", "ceo", "cdo"],
    primaryCriteria: ["documents", "dataroom"],
    secondaryCriteria: ["revenue"],
    phaseLeads: ["pitch", "investor_review", "funding"],
    frameworks: [
      "data-room completeness (8 folders: corporate, cap table, financials, contracts, IP, team, product, compliance)",
      "s708 sophisticated / personal offer readiness",
      "ESIC 100-point test",
      "investor-pack completeness (deck, model, one-pager, DD checklist)",
      "round hygiene (SAFE terms, prior valuations)",
    ],
    modules: ["agents/cro-funding-readiness.ts", "investor-pack-assembler.ts", "agents/accelerator-readiness.ts", "svi/exit-strategy-svi-boost.ts"],
    connectors: ["upload", "xero"],
    researchTopics: ["ASIC s708 guidance updates", "ESIC rulings", "AU VC DD checklists (Blackbird / AirTree public templates)"],
    primaryVisual: "heat_map",
    secondaryVisual: "progress",
    allowedVisuals: ["heat_map", "progress", "checklist"],
    freeTier: "card",
    knowledge: ["valuation-methods", "svi-framework"],
    outputTemplate: "verdict → DataRoomHeatmap → readiness ring → evidence → cards documents, dataroom → strengths / gaps / next action → stamp",
    rubric: {
      p25: "no deck · data room under 30 % · prior raise undocumented",
      p50: "one-pager + deck · data room 60–70 %, model actual-vs-plan · ESIC / s708 checked",
      p75: "DD-ready room ≥ 85 %, references, ask aligned with consensus valuation",
    },
    phaseBehaviour: {
      pitch: "deck + one-pager; floor iri 45",
      investor_review: "data room ≥ 70 %, model actual-vs-plan; floor iri 65",
      funding: "full DD set, ESIC / s708 letters; floor iri 75",
    },
    promptCopy: {
      streamLabel: "Investor Readiness Index",
      streamDescription:
        "Data room completeness, pitch deck quality, due diligence readiness, and prior raises",
      analyzeLabel: "Investor Readiness Index",
      analyzeFocus:
        "Pitch deck completeness (12-slide standard), financial model sanity, data room readiness, fundraise positioning, investor targeting (angel/VC/accelerator/grant), timeline estimation for fundraise.",
    },
  },
  lco: {
    key: "lco",
    title: "Legal & Compliance",
    titleVi: "Pháp lý & tuân thủ",
    shortLabel: "Legal & Compliance",
    weight: 8,
    primary: "clo",
    supporting: ["ciso", "coo", "cfo"],
    primaryCriteria: [],
    secondaryCriteria: ["documents"],
    phaseLeads: ["legal_equity"],
    frameworks: [
      "ASIC (registration, director IDs, annual review)",
      "ATO (GST ≥ A$75k, PAYG, R&D registration)",
      "OAIC (APPs, breach plan)",
      "IP (assignment, trademark class, domain)",
      "employment (awards, contractor vs employee)",
      "Essential Eight ML1",
      "ACL consumer guarantees",
    ],
    modules: ["agents/clo-compliance.ts", "agents/ciso-security.ts", "agents/abn-trademark-guide.ts"],
    connectors: ["url", "upload"],
    researchTopics: ["ASIC / ATO / OAIC updates monthly", "Privacy Act reform tranche dates", "ACSC advisories"],
    primaryVisual: "checklist",
    secondaryVisual: "heat_map",
    allowedVisuals: ["checklist", "heat_map", "progress"],
    freeTier: "card",
    knowledge: ["svi-framework"],
    outputTemplate: "verdict → ComplianceChecklist progress → risk heat map → evidence → card documents (LCO lens) → strengths / gaps / next action → stamp",
    rubric: {
      p25: "no ABN / ACN · no IP assignment, no privacy policy",
      p50: "ACN, IP assigned, privacy policy, contractor agreements · GST registered, R&D registered",
      p75: "Essential Eight ML2, breach plan, trademark registered, contract templates reviewed",
    },
    phaseBehaviour: {
      vision: "ABN / ACN only",
      legal_equity: "IP assignment, SHA, privacy policy; floor lco 45",
      growth: "Essential Eight ML2, data-breach plan, contract templates",
      funding: "Essential Eight ML2, data-breach plan, contract templates",
    },
    promptCopy: {
      streamLabel: "Legal & Compliance",
      streamDescription:
        "Legal incorporation, IP protection, regulatory compliance, and contract hygiene",
      analyzeLabel: "Legal & Compliance",
      analyzeFocus:
        "ABN/ASIC registration, IP protection gaps (patents, trademarks), contract coverage, regulatory landscape for sector, privacy compliance (Australian Privacy Act, GDPR), R&D Tax Incentive eligibility.",
    },
  },
  svm: {
    key: "svm",
    title: "Strategic Vision & Moat",
    titleVi: "Tầm nhìn chiến lược & lợi thế bền vững",
    shortLabel: "Strategic Vision",
    weight: 5,
    primary: "ceo",
    supporting: ["cmo", "cpo", "cfo"],
    primaryCriteria: ["roadmap"],
    secondaryCriteria: ["idea"],
    phaseLeads: ["vision", "mentor_review"],
    frameworks: [
      "5-factor moat (network effects, switching costs, brand, proprietary data, economies of scale)",
      "category strategy (Play Bigger)",
      "exit paths (strategic / PE / ASX, AU acquirer landscape)",
      "optionality (adjacent markets)",
      "vision-to-roadmap coherence",
    ],
    modules: ["svi/exit-strategy-svi-boost.ts", "agents/cfo-valuation.ts:auExitRealisationCheck", "agents/cmo-competitor-tracker.ts"],
    connectors: ["upload", "url"],
    researchTopics: ["AU M&A multiples by sector (quarterly)", "ASX small-cap tech listings", "category-creation case studies"],
    primaryVisual: "radar",
    secondaryVisual: "timeline",
    allowedVisuals: ["radar", "timeline", "bar"],
    freeTier: "card",
    knowledge: ["blockid-profile", "svi-framework"],
    outputTemplate: "verdict → MoatRadar → exit timeline → evidence → card roadmap (+ idea lens) → strengths / gaps / next action → stamp",
    rubric: {
      p25: "vision statement only · moat unnamed",
      p50: "3-year picture, one moat factor evidenced · exit path plausible",
      p75: "2+ moat factors with data, category thesis, named acquirer categories with AU precedent",
    },
    phaseBehaviour: {
      vision: "vision statement, 3-year picture",
      mentor_review: "pivot / persevere",
      growth: "moat evidence (data, integrations), exit path with named acquirer categories",
      funding: "moat evidence (data, integrations), exit path with named acquirer categories",
    },
    promptCopy: {
      streamLabel: "Strategic Vision & Moat",
      streamDescription:
        "Long-term defensibility, network effects, brand positioning, and exit potential",
      analyzeLabel: "Strategic Vision & Moat",
      analyzeFocus:
        "Moat durability scoring, network effect strength, data advantage assessment, switching cost evaluation, AI wrapper risk (if AI-dependent), 5-year defensibility outlook.",
    },
  },
};

/** Roles that own no dimension but stamp / card every chapter (§B.9). */
export const CROSS_CUTTING_ROLES: Record<"cdo" | "ciso" | "coo" | "cpo", { role: AgentRole; duty: string; card: "always_on" | "supporting" }> = {
  cdo: { role: "cdo", duty: "Evidence & cohort officer: percentile, benchmark bands, evidence heat, freshness, appendix evidence register", card: "always_on" },
  ciso: { role: "ciso", duty: "Deterministic security card in PTD + LCO (Essential Eight); LLM narration only when repo / website evidence exists", card: "always_on" },
  coo: { role: "coo", duty: "Phase gates chapter (PHASE_EXIT_RULES) + 90-day plan; LLM narration at premium", card: "always_on" },
  cpo: { role: "cpo", duty: "idea / roadmap criterion cards; supports MPC, SVM, PTD", card: "supporting" },
};

export const DIM_KEYS: readonly DimKey[] = DIM_ORDER;

export function isDimKey(value: unknown): value is DimKey {
  return typeof value === "string" && value in DIMENSION_OWNERS;
}

export function dimensionOwner(dim: DimKey): DimensionOwner {
  return DIMENSION_OWNERS[dim];
}

/** Primary + secondary criteria, primary first, no duplicates. */
export function criteriaForDimension(dim: DimKey): CriterionKey[] {
  const o = DIMENSION_OWNERS[dim];
  return Array.from(new Set([...o.primaryCriteria, ...o.secondaryCriteria]));
}

/**
 * Static p25 / p50 / p75 for a dimension at a benchmark stage (0 idea … 7
 * late) — the §B.11 table, read from svi-dimension-benchmarks.ts ANCHORS so
 * the numbers live in exactly one place. Cohort percentiles (N ≥ 30)
 * override these at run time.
 */
export function benchmarkFor(dim: DimKey, stage: number): { p25: number; p50: number; p75: number } {
  const s = Math.max(0, Math.min(7, Math.round(Number.isFinite(stage) ? stage : 2)));
  return DIMENSION_BENCHMARKS_BY_STAGE[dim]?.[s] ?? { p25: 38, p50: 50, p75: 62 };
}

/** SVI-analysis stage (0 Concept … 7 Corporation) → benchmark stage (0 idea … 7 late). */
const SVI_STAGE_TO_BENCH = [0, 1, 2, 3, 3, 4, 5, 7] as const;
export function benchmarkStageForSvi(stage: number): number {
  const i = Math.max(0, Math.min(7, Math.round(Number.isFinite(stage) ? stage : 2)));
  return SVI_STAGE_TO_BENCH[i];
}

/** Weights as a plain record (sums to 100). */
export const DIM_WEIGHTS: Record<DimKey, number> = Object.fromEntries(
  DIM_ORDER.map((k) => [k, DIMENSION_OWNERS[k].weight]),
) as Record<DimKey, number>;

/** Legacy `DIM_META` shape for api/svi/dimensions/stream (byte-identical text). */
export function legacyStreamDimMeta(): Record<string, { label: string; weight: number; description: string }> {
  return Object.fromEntries(
    DIM_LEGACY_ORDER.map((k) => {
      const o = DIMENSION_OWNERS[k];
      return [k, { label: o.promptCopy.streamLabel, weight: o.weight, description: o.promptCopy.streamDescription }];
    }),
  );
}

