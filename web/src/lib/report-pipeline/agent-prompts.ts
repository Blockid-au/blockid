// Agent Prompts — per-agent system prompts for multi-agent report generation.
//
// v2 (G13-W2-R2, spec docs/plans/investor-clarity-2026-09-15/12-product-ai-tbr-v2.md
// §C.2 / §C.10): `buildAgentPrompt(role, ctx, { criterion?, dim?, phaseId, tier })`
// composes, in order and with per-block token caps (prompt-tokens.ts):
//
//   {{AU_CONTEXT}}    the mentoring-tone AU disclaimer (fixed prose)
//   {{ROLE_CARD}}     role + expertise + startup context + stage guidance +
//                     either the legacy task guidance (criterion calls) or the
//                     dimension chapter brief from DIMENSION_OWNERS
//                     (frameworks, rubric anchors p25/p50/p75, output template)
//   {{PHASE_LENS}}    GROWTH_PHASES[phase] title + steps, PHASE_EXIT_RULES
//                     floors + next phase's required criteria (≤ 250 tokens)
//   {{SKILL_ADDON}}   SKILL_MAP[role][bucket].promptAddon (≤ 150)
//   {{KNOWLEDGE}}     ≤ 2 knowledge-base files (≤ 600 each) + ≤ 3 approved
//                     agent_knowledge_base rows (≤ 120 each)
//   {{MODULES}}       deterministic module outputs, compact table (≤ 400)
//   {{EVIDENCE}}      evidence catalogue summary (≤ 400; ids live in the user turn)
//   {{OUTPUT_SCHEMA}} the output contract (legacy markdown or the W4 JSON)
//
// The template comes from `prompt_versions` (`readCurrentPrompt("report-<role>")`
// text with the slots above) when the row carries slots; otherwise the code
// default. Everything here is synchronous and pure given its inputs — the
// dispatcher pre-fetches the template + knowledge rows via
// `prepareAgentPromptInputs()` and hands them in.
//
// The third CDO "stage medians" rubric copy the plan retired (§B.11) is gone:
// every benchmark number now comes from `benchmarkFor()` (dimension-owners →
// svi-dimension-benchmarks ANCHORS) and is injected into the CDO role card.

import type { CriterionKey } from "@/lib/evaluation-criteria";
import { PHASE_EXIT_RULES } from "@/lib/growth/phase-gate";
import { GROWTH_PHASE_LABELS, isGrowthPhaseId, nextGrowthPhase, type GrowthPhaseId } from "@/lib/growth/phase-taxonomy";
import { GROWTH_PHASES, getCurrentPhase } from "@/lib/startup-growth-phases";
import type { ReportTierV2 } from "@/lib/report-v2/schema";
import { benchmarkFor, benchmarkStageForSvi, DIM_ORDER, DIMENSION_OWNERS, type DimKey } from "./dimension-owners";
import { selectSkillsForAgent } from "./agent-skill-map";
import { bucketForStage, type PhaseBucket } from "./agent-selector";
import {
  knowledgeBlocksForDim,
  renderKnowledgeFiles,
  renderKnowledgeRows,
  type AgentKnowledgeRow,
  type KnowledgeFileBlock,
} from "./knowledge-loader";
import { PROMPT_BLOCK_CAPS, capTokens, estimateTokens } from "./prompt-tokens";
import type { AgentRole, ReportContext } from "./types";

// ── Shared AU Context ───────────────────────────────────────────────────────

const AU_CONTEXT = `You are a senior startup analyst at BlockID.au, Australia's leading startup valuation platform.
Reference Australian context: ESIC tax incentives, ASIC requirements, ABN registration, R&D Tax Incentive (43.5%),
ATO rulings, ASX listing pathways, and AU venture capital landscape where relevant.

Writing guidelines:
- Supportive MENTORING tone — like a senior advisor coaching a founder
- Be specific: name real competitors, cite real data, provide numbers
- Frame weaknesses constructively as "gaps between current state and opportunity"
- Include benchmarks: "companies at your stage typically..."
- End each section with SPECIFIC, ACTIONABLE next steps
- Use flowing narrative prose with ### sub-headings
- Format: Clean Markdown with ### sub-headings, **bold** key insights`;

const AGENT_PROMPTS: Record<AgentRole, {
  role: string;
  expertise: string;
  criteria: string[];
  outputGuidance: string;
}> = {
  ceo: {
    role: "CEO & Chief Strategist",
    expertise: "Overall business strategy, vision alignment, and cross-functional synthesis",
    criteria: [],
    outputGuidance: `Write the Executive Summary as an investor memo.

Section title style: "Executive Summary — {Startup Name}: {One-Line Investment Thesis}"

Cover:
- One-paragraph startup overview and value proposition
- SVI score interpretation and stage assessment
- Top 3 strengths and top 3 critical gaps
- Investment thesis: why this startup is worth backing
- Critical path to next funding milestone
- Overall verdict and confidence level

## Exit Path Analysis (ALWAYS include)

### Realistic Exit Scenarios
Based on sector EBITDA benchmarks and stage, include a table:
| Timeline | Path | Valuation Range | Key Driver |
|---|---|---|---|
| 3 years | Strategic acquisition | A$Xm–A$Ym | [sector-specific driver] |
| 5 years | PE buyout / Series B exit | A$Xm–A$Ym | MRR scale |
| 7+ years | IPO / ASX listing | A$Xm+ | Market share |

Use AU M&A sector multiples: SaaS 4-8x ARR, Fintech 6-12x ARR, Marketplace 3-6x GMV, Deeptech 8-15x revenue.

### Strategic Buyer Landscape
Name 3-5 realistic acquirer categories for this sector/stage in Australia.`,
  },

  cto: {
    role: "Chief Technology Officer",
    expertise: "Software architecture, code quality, security posture, technical scalability",
    criteria: ["code_git", "website"],
    outputGuidance: `Evaluate technical maturity.

Section title style: "Technical Architecture — {Key Technical Differentiator}"

Cover:
- Code quality: architecture patterns, test coverage, CI/CD, documentation
- Tech stack assessment: modernity, talent availability, scalability
- Security posture: OWASP compliance, data protection, vulnerability surface
- Website/app: performance (Core Web Vitals), accessibility, mobile responsiveness
- Technical debt assessment and remediation priority
- DevOps maturity: deployment frequency, incident response, monitoring
- IP defensibility of technical implementation`,
  },

  cfo: {
    role: "Chief Financial Officer",
    expertise: "Revenue analytics, unit economics, financial modeling, AU tax incentives",
    criteria: ["revenue", "dataroom"],
    outputGuidance: `Analyze financial health and trajectory.

Section title style: "Revenue & Unit Economics — {Revenue Status Summary}"

Cover:
- Revenue model analysis: pricing strategy, monetization approach
- Unit economics: LTV, CAC, LTV:CAC ratio, payback period, gross margin
- MRR/ARR trends and growth rate assessment
- Burn rate, runway, and cash management
- Financial projections: 12-month and 36-month scenarios (base/bull/bear)
- R&D Tax Incentive eligibility (43.5% refundable offset for <A$20M revenue)
- Break-even timeline and path to profitability
- Data room financial document completeness

## Quantitative Analysis Requirements (ALWAYS include these subsections)

### Sensitivity Analysis
Include a markdown table with 3 scenarios:
| Scenario | Assumption | Revenue Impact | Runway Impact |
|---|---|---|---|
| Bear | MRR -30%, churn +50% | ... | ... |
| Base | Current trajectory | ... | ... |
| Bull | MRR +40%, CAC -20% | ... | ... |
Fill with estimated figures based on the revenue data provided, or use stage benchmarks if no data.

### Unit Economics Depth
- CAC Payback Period: estimated months to recover customer acquisition cost
- LTV/CAC Ratio: use 15% AU discount rate for LTV discounting
- Churn Sensitivity: what churn rate breaks LTV/CAC > 3x?
- Gross Margin estimate by sector (SaaS: 70-80%, Marketplace: 40-60%, Fintech: 55-70%)

### AU-Specific Financial Context
- R&D Tax Incentive (43.5% refundable offset) eligibility assessment
- ESIC eligibility for investor tax concessions
- GST threshold (A$75k) and cash flow timing`,
  },

  cpo: {
    role: "Chief Product Officer",
    expertise: "Product strategy, innovation assessment, roadmap planning, UX evaluation",
    criteria: ["idea", "roadmap"],
    outputGuidance: `Assess product vision and execution.

Section title style: "Innovation Assessment — {What Makes This Idea Unique}"

Cover:
- Idea uniqueness: innovation level, problem-solution fit, unfair advantage
- Market validation evidence: customer interviews, surveys, pilot data
- Product-market fit signals: usage patterns, retention, NPS
- Roadmap feasibility: milestone clarity, technical complexity, resource alignment
- Feature prioritization methodology
- Product-led growth potential
- UX quality and user experience assessment
- Comparison to best-in-class products in the category`,
  },

  cmo: {
    role: "Chief Marketing Officer",
    expertise: "Market analysis, competitive intelligence, GTM strategy, SEO, brand positioning",
    criteria: ["market", "gtm_strategy", "website"],
    outputGuidance: `Evaluate market opportunity and go-to-market.

Section title style: "Market Opportunity — {TAM Size} Addressable Market"

Cover:
- TAM/SAM/SOM with methodology and data sources
- Competitive landscape: named competitors, positioning, differentiation
- Market timing: why now? Regulatory tailwinds, tech shifts, macro trends
- GTM strategy: channels, pricing, acquisition funnel, CAC by channel
- SEO and content strategy assessment
- Brand positioning and messaging clarity
- Social media and community presence
- Partnership and distribution opportunities
- AU-specific market considerations

## AU Market GTM Analysis (ALWAYS include)

### Channel Economics
For each likely acquisition channel, estimate:
| Channel | Est. CAC | Volume Ceiling | Payback |
|---|---|---|---|
| Content/SEO | A$50-200 | High | 6-12mo |
| Paid Search | A$200-800 | Medium | 3-6mo |
| Partnerships | A$100-400 | High | 9-18mo |
Fill with sector-appropriate estimates.

### Competitive Moat Assessment
Rate 1-5 on: switching costs, network effects, data moat, brand, regulatory barriers.
Justify each rating. Compare vs sector average.

### Category Creation vs Category Entry
Is this startup creating a new category or entering an existing one?
Category creators: higher CAC, higher LTV ceiling, longer sales cycles.
Category entrants: benchmark vs established players on price/feature.`,
  },

  cro: {
    role: "Chief Revenue Officer",
    expertise: "Conversion optimization, funnel analysis, retention, growth metrics",
    criteria: ["customer_size", "gtm_strategy"],
    outputGuidance: `Analyze customer traction and growth.

Section title style: "Customer Traction — {User Count/Growth Summary}"

Cover:
- Customer base assessment: total users, active users, growth rate
- Funnel analysis: acquisition → activation → retention → revenue → referral
- Conversion metrics by channel
- Retention curves and cohort analysis
- Engagement metrics: DAU/MAU, session depth, feature adoption
- Customer satisfaction: NPS, CSAT, support ticket trends
- Expansion revenue and upsell opportunities
- Growth trajectory vs AU startup benchmarks

## Revenue Growth Framework (ALWAYS include)

### Funnel Analysis
Estimate the conversion funnel based on available data:
| Stage | Benchmark | Startup Estimate | Gap |
|---|---|---|---|
| Awareness → Trial | 2-5% | X% | ... |
| Trial → Paid | 15-30% | X% | ... |
| Paid → Retained (90d) | 60-80% | X% | ... |

### Expansion Revenue Potential
- Net Revenue Retention target: >100% (world-class: >120%)
- Upsell/cross-sell opportunities based on current product
- Land-and-expand motion assessment

### AU Market Revenue Benchmarks
- SaaS startups at Seed: A$0–A$500k ARR typical
- Series A: A$500k–A$3m ARR (median A$1.2m)
- Series B: A$3m–A$15m ARR
- Compare this startup's TRE dimension score to these bands`,
  },

  clo: {
    role: "Chief Legal Officer",
    expertise: "Australian corporate law, ASIC compliance, IP protection, ESIC eligibility",
    criteria: ["documents", "dataroom"],
    outputGuidance: `Review legal and compliance posture.

Section title style: "Legal & Compliance — {Compliance Status Summary}"

Cover:
- Corporate registration: ABN, ACN, ASIC compliance, annual reviews
- IP strategy: patents, trademarks, trade secrets, copyright protection
- Contract inventory: employment, customer, supplier, NDA, SHA
- ESIC eligibility analysis (100-point innovation + company tests)
- Privacy Act 1988 compliance and APP assessment
- Data room legal document completeness and quality
- Director duties (s180-184 Corporations Act 2001)
- Consumer law compliance: ACL, unfair contract terms
- Insurance coverage: D&O, professional indemnity, cyber liability`,
  },

  chro: {
    role: "Chief Human Resources Officer",
    expertise: "Team assessment, founder evaluation, org design, ESOP, hiring strategy",
    criteria: ["founder_profile", "team", "team_structure"],
    outputGuidance: `Evaluate people and organization.

Section title style: "Founding Team — {Team Strength Summary}"

Cover:
- Founder background: domain expertise, track record, vision clarity
- Founder-market fit and leadership capability
- Team composition: technical, commercial, domain coverage
- Key person risk and succession planning
- Hiring roadmap: next 3-5 critical roles with timeline
- Org structure: clarity, efficiency, governance maturity
- Advisory board quality and engagement level
- ESOP/equity allocation vs AU benchmarks (10-15% pre-Series A)
- Culture and team dynamics indicators
- Vesting structure assessment`,
  },

  ciso: {
    role: "Chief Information Security Officer",
    expertise: "Cybersecurity, data protection, Essential Eight, SOC2 readiness",
    criteria: ["code_git"],
    outputGuidance: `Assess security posture.

Section title style: "Security Posture — {Security Maturity Level}"

Cover:
- Security headers and CSP analysis
- OWASP Top 10 vulnerability surface
- Data protection: encryption, access controls, backup
- Essential Eight maturity model alignment
- Dependency security: Dependabot, known CVEs
- Secret management and credential hygiene
- Incident response readiness
- SOC2 readiness assessment
- Privacy and data handling compliance`,
  },

  // The CDO cohort table is filled from the injected "Stage Benchmarks"
  // block (dimension-owners.ts benchmarkFor → svi-dimension-benchmarks
  // ANCHORS) — the hard-coded "stage medians" copy was deleted in S-R2.
  cdo: {
    role: "Chief Data Officer",
    expertise: "Data strategy, analytics quality, AI governance, data moat assessment",
    criteria: [],
    outputGuidance: `Cross-validate and assess data quality.

Section title style: "Data Quality — Cross-Validation Report"

Cover:
- Score consistency across all 13 criteria (flag contradictions)
- Evidence quality assessment: connected sources vs self-declared
- Data moat potential: proprietary datasets, compounding advantage
- Analytics maturity: what is being measured and how
- AI governance: responsible AI practices if applicable
- Data quality issues in the evaluation inputs
- Recommendations for evidence improvement

## Cohort Benchmarking (ALWAYS include)

For each of the 8 SVI dimensions, include a comparison table:
| Dimension | Your Score | Stage Median | Stage P75 | Gap to P75 |
|---|---|---|---|---|
| TRE | X | Y | Z | +/- delta |
| FTV | X | Y | Z | +/- delta |
| MPC | X | Y | Z | +/- delta |
| PTD | X | Y | Z | +/- delta |
| CGH | X | Y | Z | +/- delta |
| IRI | X | Y | Z | +/- delta |
| LCO | X | Y | Z | +/- delta |
| SVM | X | Y | Z | +/- delta |

Interpret: "You outperform 75% of [sector] startups at [stage] on TRE, but trail the median on CGH — your cap table and governance score (X) is below the 40th percentile, which may concern institutional investors."

Use ONLY the p25 / p50 / p75 values in the "Stage Benchmarks" block of this prompt for the Stage Median and Stage P75 columns — never invent benchmark numbers.`,
  },

  coo: {
    role: "Chief Operating Officer",
    expertise: "Operations, sprint planning, execution quality, process maturity",
    criteria: ["team_structure"],
    outputGuidance: `Create actionable execution plan.

Section title style: "90-Day Roadmap — From {Current Stage} to {Next Stage}"

Cover:
- 90-Day Action Roadmap with weekly milestones
  * Month 1 (Weeks 1-4): Foundation and quick wins
  * Month 2 (Weeks 5-8): Build and validate
  * Month 3 (Weeks 9-12): Scale and prepare
- Success metrics dashboard: daily, weekly, monthly KPIs
- Resource allocation priorities
- Decision gates and critical path items
- Operational process maturity assessment
- Budget allocation for the 90-day sprint`,
  },
};


// ── Slots + template ────────────────────────────────────────────────────────

export const PROMPT_SLOTS = [
  "AU_CONTEXT",
  "ROLE_CARD",
  "PHASE_LENS",
  "SKILL_ADDON",
  "KNOWLEDGE",
  "MODULES",
  "EVIDENCE",
  "OUTPUT_SCHEMA",
] as const;
export type PromptSlot = (typeof PROMPT_SLOTS)[number];

/** Code default when `prompt_versions` has no row / no template for the role. */
export const DEFAULT_PROMPT_TEMPLATE = PROMPT_SLOTS.map((s) => `{{${s}}}`).join("\n\n");

/** True when a template carries at least the two mandatory slots. */
export function templateHasSlots(text: string | null | undefined): boolean {
  return typeof text === "string" && text.includes("{{ROLE_CARD}}") && text.includes("{{OUTPUT_SCHEMA}}");
}

/**
 * Template from a `prompt_versions` row. The table (migration 0230) has no
 * `text` column, so the slotted template is carried in `variables.template`
 * (jsonb — no migration needed); a top-level `template` / `text` field is
 * honoured too for a future column. Returns null when the row has none.
 */
export function promptTemplateFromRow(row: unknown): string | null {
  if (!row || typeof row !== "object") return null;
  const r = row as { template?: unknown; text?: unknown; variables?: unknown };
  const direct = typeof r.template === "string" ? r.template : typeof r.text === "string" ? r.text : null;
  if (templateHasSlots(direct)) return direct;
  const vars = r.variables && typeof r.variables === "object" ? (r.variables as { template?: unknown }) : null;
  const nested = vars && typeof vars.template === "string" ? vars.template : null;
  return templateHasSlots(nested) ? nested : null;
}

const SLOT_RE = new RegExp(`\\{\\{(${PROMPT_SLOTS.join("|")})\\}\\}`, "g");

/**
 * Fill `{{SLOT}}` placeholders in ONE pass (regex + callback); empty blocks
 * collapse so no dangling headings remain. Single-pass matters: founder text
 * inside an earlier block (evidence, description) may itself contain
 * `{{OUTPUT_SCHEMA}}` or another slot token — a sequential split/join would
 * interpolate it a second time (W2 review (d)). Only the template's own
 * tokens are substituted; tokens arriving inside a block are left verbatim.
 */
export function renderPromptTemplate(template: string, blocks: Record<PromptSlot, string>): string {
  const out = template.replace(SLOT_RE, (_m, slot: PromptSlot) => blocks[slot] ?? "");
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

// ── Options ─────────────────────────────────────────────────────────────────

export interface ModuleOutputSummary {
  id: string;
  output: Record<string, unknown>;
}

export interface BuildPromptOptions {
  /** Criterion the call scores (W1–W3). Informational — the user turn carries the evidence. */
  criterion?: CriterionKey | string;
  /** Dimension the call owns (W4). Switches the role card to the chapter brief. */
  dim?: DimKey;
  /** Growth phase for the lens; defaults to `context.phaseGate` or the SVI stage. */
  phaseId?: GrowthPhaseId | string | null;
  /** Controls word caps in the output contract. */
  tier?: ReportTierV2;
  /** Slotted template (prompt_versions); falls back to DEFAULT_PROMPT_TEMPLATE. */
  template?: string | null;
  /** Pre-fetched `agent_knowledge_base` rows (dispatcher) — the builder is sync. */
  knowledgeRows?: AgentKnowledgeRow[];
  /** Override the knowledge files (tests / no-disk deploys). */
  knowledgeFiles?: KnowledgeFileBlock[];
  /** Deterministic module outputs for the MODULES slot. */
  moduleOutputs?: ModuleOutputSummary[];
  /** Short evidence summary for the EVIDENCE slot (labels + status). */
  evidenceSummary?: string;
  /** Output contract override (the dispatcher passes the W4 JSON contract). */
  outputSchema?: string;
  /** Skill addon override; default = SKILL_MAP[role][bucket]. */
  skillAddon?: string;
}

export interface PromptBlocks {
  blocks: Record<PromptSlot, string>;
  tokens: Record<PromptSlot, number>;
  totalTokens: number;
  phaseId: GrowthPhaseId;
  bucket: PhaseBucket;
  template: string;
}

// ── Phase helpers ───────────────────────────────────────────────────────────

/** Explicit phase → context phase gate → SVI stage mapping (GROWTH_PHASES ranges). */
export function resolvePhaseId(context: Pick<ReportContext, "stage" | "phaseGate">, explicit?: string | null): GrowthPhaseId {
  if (isGrowthPhaseId(explicit)) return explicit;
  const fromGate = context.phaseGate?.currentPhase;
  if (isGrowthPhaseId(fromGate)) return fromGate;
  const phase = getCurrentPhase(Number.isFinite(context.stage) ? context.stage : 0);
  return isGrowthPhaseId(phase.id) ? phase.id : "vision";
}

// G19-S46: per-section length. The old standard target (500-1500 words) made
// DeepSeek-class models write the upper bound inside the structured JSON and
// overrun every output budget (see agent-dispatcher STRUCTURED_MIN_OUTPUT_TOKENS);
// 13 sections × these windows still land inside REPORT_TIER_CONFIG min/maxWords.
const TIER_WORDS: Record<ReportTierV2, string> = {
  free: "150-350 words",
  standard: "400-700 words",
  premium: "700-1200 words",
  investor_memo: "900-1500 words",
};

// ── Block builders ──────────────────────────────────────────────────────────

function startupContextBlock(context: ReportContext): string {
  return `## Startup Context
- Name: ${context.startupName}
- Stage: ${context.sviAnalysis.stageLabel} (Stage ${context.stage})
- Current SVI Score: ${context.sviAnalysis.totalSVI}
- Language: ${context.locale === "vi" ? "Vietnamese (Tieng Viet)" : "English"}`;
}

function benchmarkTable(stage: number): string {
  const rows = DIM_ORDER.map((d) => {
    const b = benchmarkFor(d, stage);
    return `| ${d.toUpperCase()} | ${b.p25} | ${b.p50} | ${b.p75} |`;
  });
  return `## Stage Benchmarks (p25 / p50 / p75 at benchmark stage ${stage})
| Dim | p25 | p50 | p75 |
|---|---|---|---|
${rows.join("\n")}`;
}


function legacyRoleCard(role: AgentRole, context: ReportContext): string {
  const agent = AGENT_PROMPTS[role];
  const parts = [
    `## Your Role: ${agent.role}`,
    agent.expertise,
    "",
    startupContextBlock(context),
    "",
    getStageContext(context.stage),
    "",
    `## Your Task`,
    agent.outputGuidance,
  ];
  if (role === "cdo") parts.push("", benchmarkTable(benchmarkStageForSvi(context.stage)));
  return parts.join("\n");
}

function dimensionRoleCard(role: AgentRole, dim: DimKey, context: ReportContext): string {
  const owner = DIMENSION_OWNERS[dim];
  const agent = AGENT_PROMPTS[role];
  const bench = benchmarkFor(dim, benchmarkStageForSvi(context.stage));
  const dimScore = context.sviAnalysis.dimensionScores?.[dim] ?? context.sviAnalysis.subs?.find((s) => s.key === dim)?.value;
  const lens = role === owner.primary ? "owner" : "supporting analyst";
  return [
    `## Your Role: ${agent.role} — ${lens} of the "${owner.title}" chapter (weight ${owner.weight}%)`,
    agent.expertise,
    `Supporting agents: ${owner.supporting.map((s) => s.toUpperCase()).join(", ")}. CDO stamps percentile + evidence heat; CISO / COO cards are deterministic.`,
    "",
    startupContextBlock(context),
    `- Deterministic ${dim.toUpperCase()} score: ${typeof dimScore === "number" ? `${Math.round(dimScore)}/100` : "not scored"}`,
    `- Stage benchmark ${dim.toUpperCase()}: p25 ${bench.p25} · p50 ${bench.p50} · p75 ${bench.p75}`,
    `- Score ledger: the user turn carries scoreLedger (base → each signal ± points with its source → × confidence → adjustment). Explain the score using the ledger — cite its signals by name; never invent a signal, a point value or a source.`,
    "",
    `## Frameworks to apply`,
    owner.frameworks.map((f) => `- ${f}`).join("\n"),
    "",
    `## Rubric anchors (use when evidence is thin)`,
    `- p25 looks like: ${owner.rubric.p25}`,
    `- p50 looks like: ${owner.rubric.p50}`,
    `- p75 looks like: ${owner.rubric.p75}`,
    "",
    `## Chapter template`,
    owner.outputTemplate,
    `Mapped criteria: ${[...owner.primaryCriteria, ...owner.secondaryCriteria].join(", ") || "none (scored through lenses)"}.`,
  ].join("\n");
}

function phaseLensBlock(phaseId: GrowthPhaseId, dim: DimKey | undefined): string {
  const phase = GROWTH_PHASES.find((p) => p.id === phaseId);
  const rule = PHASE_EXIT_RULES[phaseId];
  const next = nextGrowthPhase(phaseId);
  const nextRule = next ? PHASE_EXIT_RULES[next] : null;
  const floors = Object.entries(rule.dimensionFloors)
    .map(([k, v]) => `${k.toUpperCase()} ≥ ${v}`)
    .join(", ");
  const lines = [
    `## Phase lens: ${phase?.title ?? GROWTH_PHASE_LABELS[phaseId].en} (${phaseId})`,
    phase?.subtitle ? phase.subtitle : "",
    phase ? `Lead agent ${phase.leadAgent.toUpperCase()}; support ${phase.supportAgents.map((s) => s.toUpperCase()).join(", ")}.` : "",
    phase ? `Steps: ${phase.steps.slice(0, 4).map((s) => s.title).join("; ")}.` : "",
    `Exit gate: criteria ${rule.requiredCriteria.join(", ")} at ≥ good${floors ? `; floors ${floors}` : ""}.`,
    next && nextRule ? `Next phase ${GROWTH_PHASE_LABELS[next].en} (${next}) requires: ${nextRule.requiredCriteria.join(", ")}.` : "This is the final phase.",
  ];
  if (dim) {
    const behaviour = DIMENSION_OWNERS[dim].phaseBehaviour[phaseId];
    if (behaviour) lines.push(`What matters now for ${dim.toUpperCase()}: ${behaviour}.`);
    const floor = rule.dimensionFloors[dim as keyof typeof rule.dimensionFloors];
    if (typeof floor === "number") lines.push(`${dim.toUpperCase()} floor at this phase: ${floor}.`);
  }
  return lines.filter(Boolean).join("\n");
}

function modulesBlock(outputs: ModuleOutputSummary[] | undefined): string {
  if (!outputs || outputs.length === 0) return "";
  const rows = outputs.map((m) => {
    const cells = Object.entries(m.output)
      .slice(0, 12)
      .map(([k, v]) => `${k}=${compactValue(v)}`)
      .join(", ");
    return `| ${m.id} | ${cells} |`;
  });
  return `## Module outputs (deterministic — cite as [module:<id>])
| module | key values |
|---|---|
${rows.join("\n")}`;
}

function compactValue(v: unknown): string {
  if (v == null) return "–";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2);
  if (typeof v === "string") return v.length > 60 ? `${v.slice(0, 57)}…` : v;
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (Array.isArray(v)) return v.slice(0, 5).map(compactValue).join("/");
  if (typeof v === "object") {
    return Object.entries(v as Record<string, unknown>)
      .slice(0, 4)
      .map(([k, x]) => `${k}:${compactValue(x)}`)
      .join(" ");
  }
  return String(v);
}

const LEGACY_OUTPUT_FORMAT = `## Output Format
- Start with an ATTRACTIVE SECTION TITLE on line 1 (e.g., "Market Opportunity — A$2.4B Addressable Market with Strong Tailwinds")
- Line 2: VALUE PROPOSITION — 1-2 sentence summary of the key finding
- Line 3: KEY INSIGHT — One powerful insight in a callout: > **Key Insight:** ...
- Then structured content with ### sub-headings
- End with ### Recommended Actions (numbered 1-5)
- Final line: <!-- SCORE: XX -->
- Be specific, data-driven, and actionable`;

function legacyOutputSchema(tier: ReportTierV2 | undefined): string {
  return `${LEGACY_OUTPUT_FORMAT}\n- Total output: ${TIER_WORDS[tier ?? "standard"]} depending on available evidence — a HARD upper limit: stop writing when you reach it`;
}

// ── Build blocks ────────────────────────────────────────────────────────────

export function buildPromptBlocks(role: AgentRole, context: ReportContext, opts: BuildPromptOptions = {}): PromptBlocks {
  const phaseId = resolvePhaseId(context, opts.phaseId);
  const bucket = bucketForStage(context.stage);
  const template = templateHasSlots(opts.template) ? (opts.template as string) : DEFAULT_PROMPT_TEMPLATE;

  const roleCardRaw = opts.dim ? dimensionRoleCard(role, opts.dim, context) : legacyRoleCard(role, context);
  const addonRaw = (opts.skillAddon ?? selectSkillsForAgent(role, bucket).promptAddon ?? "").trim();
  const files = opts.knowledgeFiles ?? (opts.dim ? knowledgeBlocksForDim(opts.dim) : []);
  const knowledgeRaw = [renderKnowledgeFiles(files), renderKnowledgeRows(opts.knowledgeRows ?? [])].filter(Boolean).join("\n\n");

  const blocks: Record<PromptSlot, string> = {
    AU_CONTEXT: AU_CONTEXT,
    ROLE_CARD: capTokens(roleCardRaw, PROMPT_BLOCK_CAPS.ROLE_CARD),
    PHASE_LENS: capTokens(phaseLensBlock(phaseId, opts.dim), PROMPT_BLOCK_CAPS.PHASE_LENS),
    SKILL_ADDON: addonRaw ? `## Phase-Tuned Skill Guidance\n${capTokens(addonRaw, PROMPT_BLOCK_CAPS.SKILL_ADDON)}` : "",
    KNOWLEDGE: knowledgeRaw ? `## Knowledge base\n${knowledgeRaw}` : "",
    MODULES: capTokens(modulesBlock(opts.moduleOutputs), PROMPT_BLOCK_CAPS.MODULES),
    EVIDENCE: opts.evidenceSummary ? capTokens(`## Evidence available\n${opts.evidenceSummary}`, PROMPT_BLOCK_CAPS.EVIDENCE) : "",
    OUTPUT_SCHEMA: capTokens(opts.outputSchema ?? legacyOutputSchema(opts.tier), PROMPT_BLOCK_CAPS.OUTPUT_SCHEMA),
  };
  const tokens = Object.fromEntries(PROMPT_SLOTS.map((s) => [s, estimateTokens(blocks[s])])) as Record<PromptSlot, number>;
  const totalTokens = PROMPT_SLOTS.reduce((a, s) => a + tokens[s], 0);
  return { blocks, tokens, totalTokens, phaseId, bucket, template };
}

// ── Build Agent Prompt ──────────────────────────────────────────────────────

/**
 * v2 builder. The third argument accepts the legacy criterion string (the
 * startup-package route and older callers) or the options object; the
 * fourth keeps the legacy `skillAddon` override.
 */
export function buildAgentPrompt(
  agentRole: AgentRole,
  context: ReportContext,
  optsOrCriterion: BuildPromptOptions | string = {},
  legacySkillAddon?: string,
): string {
  const opts: BuildPromptOptions = typeof optsOrCriterion === "string" ? { criterion: optsOrCriterion } : { ...optsOrCriterion };
  if (legacySkillAddon !== undefined && opts.skillAddon === undefined) opts.skillAddon = legacySkillAddon;
  const built = buildPromptBlocks(agentRole, context, opts);
  return renderPromptTemplate(built.template, built.blocks);
}

// ── Stage-Aware Context ─────────────────────────────────────────────────────

function getStageContext(stage: number): string {
  if (stage <= 2) {
    return `## Stage Guidance (Early Stage)
Focus on idea validation, customer discovery, finding first 10 customers, MVP scope,
pitch preparation, and Australian grants. Do NOT focus on unit economics, revenue
forecasting, or cap table optimization. Be encouraging — they are just starting.`;
  }
  if (stage <= 4) {
    return `## Stage Guidance (Growth Stage)
Focus on growth, monetization, fundraise readiness, team scaling, and investor
preparation. Unit economics and financial projections are now relevant.`;
  }
  return `## Stage Guidance (Scale Stage)
Focus on scaling, governance, compliance, exit planning, board composition,
and institutional investor readiness. Full financial rigor expected.`;
}

export { AGENT_PROMPTS, AU_CONTEXT, benchmarkStageForSvi };
