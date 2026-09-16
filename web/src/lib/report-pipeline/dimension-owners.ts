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
// api/svi/dimension-analyze and the CDO stage medians in agent-prompts. The
// first two now derive from `promptCopy` below (byte-identical prompt text —
// prompt *content* changes are S-R2); the CDO medians block is left in
// agent-prompts with a TODO(S-R2) because replacing the numbers changes the
// prompt.
//
// Pure module: no I/O. Benchmarks come from svi-dimension-benchmarks.ts
// (ANCHORS p50 ± spread); phase floors from growth/phase-gate.ts
// PHASE_EXIT_RULES — neither is duplicated here.

import type { CriterionKey } from "@/lib/evaluation-criteria";
import type { GrowthPhaseId } from "@/lib/growth/phase-taxonomy";
import type { ChartTypeV2 } from "@/lib/report-visuals/types";
import type { AgentRole } from "./types";

export type DimKey = "tre" | "mpc" | "ftv" | "ptd" | "cgh" | "iri" | "lco" | "svm";

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
  | "connector_other";

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
      "team completeness (hacker / hustler / hipster + finance)",
      "Antler signals (spike, drive, commitment %)",
      "key-person risk",
      "full-time %",
      "advisory board",
      "hiring plan vs runway",
    ],
    modules: ["agents/chro-team.ts", "agents/antler-signals.ts", "agents/maturity-detector.ts"],
    connectors: ["linkedin", "github", "upload"],
    researchTopics: ["AU salary benchmarks (annual)", "co-founder agreement norms", "Antler / Startmate cohort criteria updates"],
    primaryVisual: "heat_map",
    secondaryVisual: "bar",
    allowedVisuals: ["heat_map", "bar", "radar"],
    freeTier: "full",
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

/** Legacy `DIMENSION_INFO` shape for api/svi/dimension-analyze (byte-identical text). */
export function legacyAnalyzeDimInfo(): Record<string, { label: string; weight: number; focus: string }> {
  return Object.fromEntries(
    DIM_LEGACY_ORDER.map((k) => {
      const o = DIMENSION_OWNERS[k];
      return [k, { label: o.promptCopy.analyzeLabel, weight: o.weight, focus: o.promptCopy.analyzeFocus }];
    }),
  );
}
