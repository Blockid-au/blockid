> **Back-link:** [`docs/plans/SOURCE-OF-TRUTH.md`](../SOURCE-OF-TRUTH.md) § G13 · goal doc [`../investor-clarity-2026-09-15.md`](../investor-clarity-2026-09-15.md). Workstream spec produced 2026-09-15 by the planning session (BA / PM / Product agents); corrections applied at merge are marked **[merge-fix]**.

# 12 — Product + AI plan: Trusted Business Report v2 (brief items 4 + 5)

Date 2026-09-15 · Roles: Product lead + AI architect · Inputs: 00-brief, 01-explore-investor, 03-explore-agents, code read-only (paths below are under `web/` unless prefixed). Skills loaded: svi-scoring, cfo-advisor, cmo-advisor, senior-pm.

## 0. What the code says today (verified, one line each)

| # | Fact | Where |
|---|---|---|
| 1 | Two generators: the C-level pipeline (13 criterion calls, Zod-validated, ai_runs audited, llm-auditor) and the generic-persona stream route that the TBR actually renders | `src/lib/report-pipeline/*` vs `src/app/api/svi/dimensions/stream/route.ts` (DIM_META, `analyzeOneDimension` ≤600 tok, `synthesizeCriteria` one call) |
| 2 | `visuals: []` hardcoded three times; `chart-generator.ts` (8 templates + 5 SVG renderers + AI-image path) is never imported | `agent-dispatcher.ts:460,530,553`, `chart-generator.ts` |
| 3 | GATHER tech/repo audits are stubs (`{url, status:"gathered"}`) | `orchestrator.ts:205–221` |
| 4 | `buildAgentPrompt(role, ctx, criterion, skillAddon)` — 4th arg never passed; `SKILL_MAP` dead; `agent_knowledge_base`, `.claude/knowledge-base/*`, `src/lib/agents/*` (31k lines) never reach a prompt | `agent-dispatcher.ts:367,510`, `agent-skill-map.ts` |
| 5 | Model tier labels (opus/sonnet/haiku) are recorded but transport is the free/cheap chain (`callAIToModelCaller` → `callAI`); yesterday's spend: US$0.21 for 341 calls (deepinfra) | `agent-dispatcher.ts:302`, `content/reports/ai-spend-daily.json` |
| 6 | Valuation in report body = hardcoded stage band (`estimateValuationRange`); `buildVcValuationReport()` (5 weighted methods + scorecard @0) not surfaced | `section-assembler.ts:443`, `agents/cfo-valuation.ts:538–642` |
| 7 | Ownership gaps: CEO/CDO `criteria: []`; CGH and SVM reached only as secondary dims; IRI only via CLO; CISO/CDO/COO only in `scale` bucket | `agent-prompts.ts`, `agent-selector.ts PHASE_CRITERIA` |
| 8 | Phase awareness = 4 buckets; `PHASE_EXIT_RULES` (12 phases, floors) and `GROWTH_PHASES.leadAgent` unused by selection | `growth/phase-gate.ts:82–145`, `agent-selector.ts` |
| 9 | 33 AU comparables in code; "500+ Australian SMEs" / "500+ live raises" on landing | `lib/data/au-comparables.ts`, `components/landing/comps-wall.tsx:80`, `bento.tsx:66` |
| 10 | Stage benchmarks exist (p25/p50/p75 per dim per stage, ANCHORS at stages 0/2/4/7) but the TBR shows hardcoded cohort fallbacks | `svi-dimension-benchmarks.ts`, `business-report-client.tsx` |

Decisions taken in this plan (so the sprints do not re-litigate): **one JSON contract (ReportV2)**; **the C-level pipeline is the only generator**; **deterministic SVG first, AI images never in the scored body**; **CFO owns CGH, CEO owns SVM, CLO owns IRI, CRO owns TRE**; **scale-only rule retired** (CISO/CDO/COO become always-on deterministic cards with LLM narration gated by evidence and tier, not by stage); **copy for comparables changes in S-R1, data reaches 300+ verified raises by S-R5, "500+" only when the count is true**.

---

## A. Report structure — Trusted Business Report v2 (canonical)

One JSON document (`ReportV2`) is generated once per run and persisted in `svi_snapshots.report_v2` (jsonb) + `assembled_reports.report_json`. Every surface renders from it and nothing else: web TBR (`/workspace/business-report`, `/tbr/[token]`), PDF (`lib/pdf/svi-report-pdf.tsx`), DOCX (`lib/docx/svi-report-docx.ts`), Investor Dossier (evaluator view, `/workspace/evaluations/[id]`), and email (`lib/svi/email-report.ts`). No surface may call the model or compute a score.

### A.1 Outline (page order is fixed; weights drive chapter order)

| # | Section | Owner | Free (10 p.) | Paid | Visual (mandatory) |
|---|---|---|---|---|---|
| 0 | **Cover** — startup, date, SVI score ring, 8-dim radar vs stage p50, three questions strip (Where / Worth / Next) | CDO (numbers) + CEO (3 answers) | ✔ | ✔ | ScoreRing, Radar, ThreeQuestionsStrip |
| 1 | **Executive summary** — thesis, top-3 strengths, top-3 gaps, phase now → next gate, verdict + confidence | CEO | ✔ (1 p.) | ✔ | PhaseRouteMap (mini) |
| 2 | **TRE — Traction & Revenue Evidence** (20) | CRO | ✔ | ✔ | RevenueSparkline + AARRR funnel |
| 3 | **MPC — Market Pull & Category** (18) | CMO | ✔ | ✔ | TAM/SAM/SOM funnel + positioning 2×2 |
| 4 | **FTV — Founder & Team Value** (15) | CHRO | ✔ | ✔ | TeamCompletenessHeatmap + founder-fit bars |
| 5 | **PTD — Product & Tech Depth** (12) | CTO | ✔ (summary card only) | ✔ | RepoHealthBars + CWV gauge |
| 6 | **CGH — Capital & Governance Health** (12) | CFO | card | ✔ | CapTableDonut + DilutionPath |
| 7 | **IRI — Investor Readiness Index** (10) | CLO | card | ✔ | DataRoomHeatmap + readiness ring |
| 8 | **LCO — Legal & Compliance** (8) | CLO | card | ✔ | ComplianceChecklist + risk heat map |
| 9 | **SVM — Strategic Vision & Moat** (5) | CEO | card | ✔ | MoatRadar (5-factor) + exit timeline |
| 10 | **Valuation** — 5 methods, consensus band, vs ask, sector multiples (source + date), AU comparables N | CFO | range only | ✔ | ValuationRangeBars + ComparablesScatter + multiples table |
| 11 | **Phase gates** — 13 criteria × 12 phases | COO | current phase row | ✔ | PhaseGateHeatmap + PhaseRouteMap |
| 12 | **Money on the table** — matched grants + programs (56 / 199 catalogue) | CFO + CMO | top 3 | ✔ | MoneyBars (A$ by deadline) |
| 13 | **90-day action plan** — 3 × 30-day columns, owner agent per step | COO | 5 steps | ✔ | ActionTimeline |
| 14 | **Appendix** — method, evidence register, data principle sentence, disclaimer, auditor log | CDO + auditor | ✔ | ✔ | EvidenceRegister table |

Every dimension chapter (2–9) has the same skeleton, in this order: header (owner agent, score, band, stage percentile) → primary visual → verdict (≤ 80 words) → evidence table → criterion cards → strengths / gaps / next action → auditor stamp. Free tier renders chapters 2–5 in full and 6–9 as one-card summaries (score + band + one gap + upgrade CTA); the 10-page budget is enforced by `lib/pdf/page-count.ts`.

### A.2 ReportV2 contract (TypeScript, extends `AssembledReport` / `VisualSpec`)

```ts
// src/lib/report-pipeline/report-v2.ts  (new; Zod schema next to it: report-v2.schema.ts)
export type DimKey = "tre"|"mpc"|"ftv"|"ptd"|"cgh"|"iri"|"lco"|"svm";
export const DIM_ORDER: DimKey[] = ["tre","mpc","ftv","ptd","cgh","iri","lco","svm"]; // weight order
export type Band = "strong"|"developing"|"early"|"pending";
export type EvidenceSource = "stripe"|"ga4"|"github"|"xero"|"linkedin"|"upload"|"url"|"self_declared"|"connector_other";
export type EvidenceStatus = "evidenced"|"partial"|"missing"|"stale";

export interface ReportV2 {
  schemaVersion: "2.0";
  reportId: string; snapshotId: string; projectId: string; accountId: string;
  tier: "free"|"standard"|"premium"|"investor_memo";
  locale: "en"|"vi";
  generatedAt: string; promptVersionIds: Record<AgentRole,string>; pipelineVersion: string;
  cover: {
    startupName: string; sector: string; stage: number; stageLabel: string; phaseId: GrowthPhaseId;
    svi: { total: number; band: Band; cohortPercentile: number|null; cohortN: number|null; deltaVsLast: number|null };
    dims: Record<DimKey,{ score:number; weight:number; band:Band; p25:number; p50:number; p75:number; percentile:number|null }>;
    threeQuestions: { where: string; worth: string; next: string }; // ≤ 30 words each, CEO
    visuals: VisualSpecV2[]; // score_ring, radar, three_questions_strip
  };
  executive: { thesis: string; strengths: string[]; gaps: string[]; verdict: string; confidence: number; phaseNow: PhaseGateResult; visuals: VisualSpecV2[]; audit: AuditStamp };
  dimensions: DimensionChapter[];             // exactly 8, DIM_ORDER
  valuation: ValuationChapter;
  phaseGates: { current: GrowthPhaseId; matrix: Array<{ criterion: CriterionKey; phase: GrowthPhaseId; required: boolean; quality: QualityLevel; met: boolean }>; blockers: PhaseBlocker[]; visuals: VisualSpecV2[] };
  moneyOnTable: { grants: MatchedGrant[]; programs: MatchedProgram[]; totalAud: number; visuals: VisualSpecV2[] };
  actionPlan: { horizonDays: 90; steps: Array<{ day: 30|60|90; title: string; ownerAgent: AgentRole; dimension: DimKey; criterion?: CriterionKey; expectedLift: number; evidenceToAdd?: EvidenceSource }>; visuals: VisualSpecV2[] };
  appendix: { method: string; dataPrinciple: string; disclaimer: string; evidenceRegister: EvidenceRow[]; auditLog: SectionAuditRecord[]; comparablesN: number; comparablesWithMultiplesN: number; sourcesDated: Array<{ label:string; date:string }> };
  quality: { score: number; groundedShare: number; consistencyIssues: ConsistencyIssue[]; degradedSections: string[] };
  pageBudget: { free: 10; renderedPages?: number };
}

export interface DimensionChapter {
  dim: DimKey; title: string; titleVi: string; weight: number;
  ownerAgent: AgentRole; supportingAgents: AgentRole[];
  score: number; band: Band; benchmark: { p25:number; p50:number; p75:number; percentile:number|null; stage:number };
  verdict: string;                                   // ≤ 80 words, cites evidence ids
  primaryVisual: VisualSpecV2; secondaryVisuals: VisualSpecV2[];
  evidence: EvidenceRow[];                           // source, label, status, freshness, evidence_id
  criteria: CriterionCard[];                         // the mapped subset of the 13
  strengths: string[]; gaps: string[]; nextAction: { title: string; window: "this_week"|"30d"|"90d"; expectedLift: number; evidenceToAdd?: EvidenceSource };
  phaseLens: { phaseId: GrowthPhaseId; whatMattersNow: string; floor?: number; floorMet?: boolean };
  frameworks: string[];                              // names injected into the prompt, shown in appendix
  modules: Array<{ id: string; output: Record<string,unknown> }>; // deterministic module outputs used
  audit: AuditStamp; runIds: string[];
}
export interface CriterionCard { key: CriterionKey; title: string; score: number; quality: QualityLevel; verdict: string; strengths: string[]; gaps: string[]; nextAction: string; citations: Array<{ evidence_id:string; quote:string }>; grounded: boolean; agent: AgentRole }
export interface EvidenceRow { evidence_id: string; source: EvidenceSource; label: string; status: EvidenceStatus; observedAt?: string; value?: string; dims: DimKey[] }
export interface AuditStamp { grounded: boolean; uncited: number; revised: boolean; auditor: "llm-auditor"; at: string }
export interface ValuationChapter {
  currency: "AUD"; methods: Array<{ method: "revenue_multiple"|"berkus"|"dcf_proxy"|"comparables"|"risk_factor_summation"|"scorecard"; lowAud:number; midAud:number; highAud:number; weight:number; rationale:string; applicable:boolean }>;
  consensus: { lowAud:number; midAud:number; highAud:number; confidence:number };
  ask?: { preMoneyAud:number; raiseAud:number; verdict:"aligned"|"above_consensus"|"below_consensus"; gapPct:number };
  sectorMultiples: { sector:string; low:number; median:number; high:number; sourceLabel:string; sourceDate:string };
  comparables: { n:number; withMultiplesN:number; rows: Array<{ name:string; stage:string; industry:string; year:number; arrMultiple?:number; source:string }> };
  unitEconomics?: VcValuationReport["unitEconomics"]; scenarios: { bear:number; base:number; bull:number };
  visuals: VisualSpecV2[]; narrative: string; audit: AuditStamp;
}
export interface VisualSpecV2 extends VisualSpec {
  id: string; kind: ChartTypeV2; dim?: DimKey; dataState: "real"|"partial"|"benchmark_only"|"target";
  a11y: { title: string; description: string; tableFallback: Array<Record<string,string|number>> };
  svg?: string;   // deterministic render, filled at assemble time for PDF/DOCX/email
}
export type ChartTypeV2 = ChartType | "score_ring"|"three_questions_strip"|"sparkline"|"donut"|"range_bars"|"gauge"|"route_map"|"gantt"|"positioning_2x2";
```

Rules baked into the Zod schema: `dimensions.length === 8` in `DIM_ORDER`; each chapter `primaryVisual` required; `criteria.length ≥ 1`; `evidence` may be empty but then `primaryVisual.dataState` must be `benchmark_only` or `target`; `valuation.methods.length === 6` (scorecard present with weight 0 and `applicable:false` unless pre-revenue); `appendix.dataPrinciple` must equal the approved sentence.

### A.3 VisualSpec catalogue per section (chart, data fields, fallback)

| Section | Primary (kind) | Data fields | Secondary | Fallback when data missing (`dataState`) |
|---|---|---|---|---|
| Cover | `score_ring` | total, band, percentile | `radar` (8 dims vs p50), `three_questions_strip` | Always real (scores exist) |
| TRE | `sparkline` monthly revenue 12 mo | Stripe `oauth-stripe-signals` MRR series / Xero `connectors/xero-metrics` revenue; churn, growth % | `funnel` AARRR (GA4 sessions → signups → active → paying → NRR) | `benchmark_only`: cohort band p25–p75 with the startup's score marker + ghost sparkline "Connect Stripe/Xero to plot" |
| MPC | `funnel` TAM/SAM/SOM (A$) | `cfo-tam-sam-som.ts` + `au-market-anchor.ts` (ABS/ANZSIC anchor), `estimateMarketSizing` | `positioning_2x2` (price × differentiation, competitors from `cmo-competitor-tracker` / GATHER research) | `partial`: TAM from ABS anchor labelled "estimate", SOM blank; 2×2 with ≤ 3 named competitors from deck text |
| FTV | `heat_map` team completeness (role × covered/gap/hiring) | founder_profile + team + team_structure evidence, LinkedIn upload/URL (S-R5), `chro-team.ts` role map, `antler-signals.ts` | `bar` founder-market-fit factors | `partial`: roles inferred from text; unknown cells "?"; never blank |
| PTD | `bar` repo health (commits/90d, tests, CI, deps freshness, docs) | `auditGitHubRepo` (`github-repo-audit.ts`), `deepTechAudit` (CWV, security headers) | `gauge` CWV / tech-audit | `benchmark_only`: maturity checklist progress from `maturity-detector.ts`; CTA "Connect GitHub" |
| CGH | `donut` cap table (founders / ESOP / investors / advisors) | cap table register (cap_table_* tables, `cfo-esop-scoring.ts`), vesting | `line` dilution path over next 2 rounds (`calculateRoundDynamics`) | `target`: recommended structure donut (ESOP 10–15 %) labelled "target, not actual"; dilution path from consensus valuation × 20 % raise |
| IRI | `heat_map` data-room completeness (8 categories × present/missing/stale) | dataroom docs, `svi-completeness.ts` EVIDENCE_CATALOG, `cro-funding-readiness.ts` | `progress` readiness ring | Always renderable (all cells "missing" is still a chart) |
| LCO | `checklist` ASIC/ATO/OAIC/IP/Essential Eight | `clo-compliance.ts`, `ciso-security.ts`, `abn-trademark-guide.ts`, ABN lookup signal | `heat_map` risk (likelihood × impact from `risks[]`) | Always renderable |
| SVM | `radar` 5-factor moat (network, switching, brand, data, scale) | CEO/CMO scored factors, `exit-strategy-svi-boost.ts` | `timeline` exit paths 3/5/7 yr with A$ ranges | Always renderable (factors are LLM-scored 0–5, marked `partial`) |
| Valuation | `range_bars` 5 methods + consensus band + ask marker | `buildVcValuationReport()` | `scatter` comparables (ARR vs valuation, N), multiples table | Pre-revenue: Berkus/RFS/scorecard drive; revenue_multiple shown greyed `applicable:false` |
| Phase gates | `heat_map` 13 × 12 | `PHASE_EXIT_RULES`, criterion quality levels | `route_map` (12 phases, current highlighted) | Always renderable |
| Money on table | `bar` grants/programs by A$ | `grant-advisor.ts`, `accelerator-readiness.ts`, `au-accelerators-2026.json` | `timeline` deadlines | Empty match → "0 matched, top 3 nearest-fit" |
| Action plan | `gantt` 3 × 30 d | `scn-action-plan.ts`, `svi-actions.ts` | — | Always renderable |

Rule: **no text-only chapter.** Assembly fails validation if any chapter lacks a `primaryVisual` with a renderable `svg`. Renderers: recharts on web (client), react-pdf SVG primitives in PDF, static SVG string (same renderer) in DOCX (as image) and email (inline `<img>` of SVG → PNG via existing playwright path only for email clients that block SVG).

---

## B. Agent ownership matrix (8 dimensions)

Ownership decisions: **TRE → CRO** (traction is a revenue-officer job; CFO supports with revenue quality), **CGH → CFO** (owns `cfo-esop-scoring.ts`, dilution, `calculateRoundDynamics`; CLO supports governance), **IRI → CLO** (its two primary criteria `documents`/`dataroom` are already CLO's; CFO supports ask-vs-valuation, CRO supports `cro-funding-readiness.ts`), **SVM → CEO** (moat + exit paths already in the CEO prompt; CMO 5-factor moat, CPO roadmap support), **CDO** = cross-cutting Evidence & Cohort officer (no dimension; stamps every chapter with percentile + evidence heat; `crossValidate`), **CISO/COO** = always-on deterministic cards (LLM narration when evidence exists / tier ≥ standard). The `scale`-only rule in `PHASE_CRITERIA` is retired.

Rubric anchors below are p50 at stage 0 / 2 / 4 (idea / seed / series A) from `svi-dimension-benchmarks.ts ANCHORS` (p25 = p50 − 12, p75 = p50 + 12; TRE ± 15). Cohort-percentile from `agents/cohort-percentile.ts` overrides static anchors when cohort N ≥ 30.

### B.1 TRE — Traction & Revenue Evidence (20) — owner **CRO**
- Supporting: CFO (revenue quality, unit economics), CMO (channel attribution), CDO (percentile, data quality).
- Criteria: `customer_size` (primary), `revenue` (primary), secondary from `market`, `website`, `gtm_strategy`.
- Evidence connectors: Stripe (`oauth-stripe-signals.ts` → `svi/connected-revenue-score.ts`: MRR tiers, growth, churn, freshness), Xero (`connectors/xero-metrics.ts` revenue), GA4 (`oauth-ga4-signals.ts` — S-R5 adds sessions, conversions, returning-user share, top channels), uploads (bank statement import `components/svi/bank-statement-import.tsx`).
- Modules: `agents/cro-conversion.ts` (funnel), `agents/cro-experiments.ts`, `svi/valuation-mrr-bridge.ts`, `agents/cfo-valuation.ts:evaluateUnitEconomics/calculateRuleOf40`, knowledge `.claude/knowledge-base/svi-scoring/svi-framework.md`, skill `.claude/skills/cro/SKILL.md`.
- Frameworks injected: AARRR (Acquisition→Referral), cohort retention (M1/M3/M6), Rule of 40, NRR / GRR, MRR quality (new vs expansion vs churn, concentration ≤ 20 % top customer), burn multiple ≤ 2, CAC payback ≤ 12 mo (AU SaaS).
- 12-phase behaviour: `vision`/`customer_dev` — ask for interview count, LOIs, waitlist, willingness-to-pay; `revenue_model`–`go_to_market` — first paying customers, pricing tested, MoM growth; `growth`/`funding` — MRR ≥ A$50k, NRR > 100 %, cohort curves, pipeline coverage 3×. Phase floors: tre 40 (revenue_model), 55 (go_to_market), 70 (growth).
- Anchors p50: idea 30 · seed 52 · series A 78 (p25/p75 ± 15).
- Output template: verdict → RevenueSparkline → AARRR funnel → evidence table (Stripe/Xero/GA4 rows with freshness) → cards `customer_size`, `revenue` → strengths/gaps → next action ("Connect Stripe: +X TRE, +Y SVI") → stamp.
- Self-research topics (goal-tree `cro-goal.researchTopics` + add): AU SaaS benchmark refresh (Airtree/SaaS Capital yearly), NRR medians by sector, GA4 → revenue attribution methods, marketplace take-rate norms.

### B.2 MPC — Market Pull & Category (18) — owner **CMO**
- Supporting: CPO (`idea`, JTBD), CRO (channel economics), CDO, CFO (TAM/SAM/SOM maths).
- Criteria: `market`, `gtm_strategy`, `idea` (primary MPC), secondary `website`.
- Connectors: GATHER `researchMarket` (`adk/agents/market-research.ts`), website scrape (`scrapedData`), GA4 channel mix, uploads (deck market slide).
- Modules: `agents/cfo-tam-sam-som.ts`, `report-pipeline/au-market-anchor.ts` (ABS/ANZSIC), `agents/cmo-market-research.ts`, `agents/cmo-competitor-tracker.ts`, `svi/sector-map.ts`, knowledge `content/research/*.md`, skill `.claude/skills/cmo/SKILL.md`.
- Frameworks: TAM/SAM/SOM ABS-anchored (top-down × bottom-up cross-check, `applyMarketSizingDiscount`), JTBD, problem-severity (frequency × intensity × current spend), category design (create vs enter), timing ("why now" 3 tailwinds), competitor 2×2, channel economics (CAC by channel).
- Phase behaviour: `vision`/`customer_dev` — problem interviews ≥ 10, persona, pain top-3, WTP; `revenue_model`/`pitch` — SAM bottom-up, competitor 2×2; `go_to_market`+ — channel CAC, share of SOM, category narrative. Floors: mpc 40 (vision), 55 (customer_dev).
- Anchors p50: 50 · 58 · 70.
- Template: verdict → TAM/SAM/SOM funnel → 2×2 → evidence → cards `market`, `gtm_strategy`, `idea` → S/G/next → stamp.
- Research topics: ABS industry revenue tables (annual), AU sector growth rates, AU competitor funding announcements, category-design examples in AU.

### B.3 FTV — Founder & Team Value (15) — owner **CHRO**
- Supporting: CEO (founder-market fit narrative), CLO (founder agreements, vesting), COO (org).
- Criteria: `founder_profile`, `team`, `team_structure` (all primary FTV).
- Connectors: LinkedIn via upload (PDF profile export) or URL paste → parsed to `founder_signals` (S-R5; no scraping of LinkedIn, ToS), GitHub contributor graph (`github-repo-audit.ts` contributors), uploads (CVs, org chart).
- Modules: `agents/chro-team.ts` (AU salary bands, role map), `agents/antler-signals.ts`, `agents/maturity-detector.ts`, knowledge `.claude/skills/chro/SKILL.md`, `.claude/knowledge-base/esop/esop-expertise.md` (grants).
- Frameworks: founder-market fit (domain years, prior exits, network), team completeness (hacker/hustler/hipster + finance), Antler signals (spike, drive, commitment %), key-person risk, full-time %, advisory board, hiring plan vs runway.
- Phase behaviour: `vision` — solo vs co-founder, commitment; `mentor_review`/`team` — skills gap, next 3 hires, equity split; `growth`/`funding` — leadership bench, ESOP coverage, retention. Floor: ftv 60 (team).
- Anchors p50: 52 · 60 · 72.
- Template: verdict → TeamCompletenessHeatmap → founder-fit bars → evidence (LinkedIn/GitHub/uploads) → 3 cards → S/G/next → stamp.
- Research: AU salary benchmarks (annual), co-founder agreement norms, Antler/Startmate cohort criteria updates.

### B.4 PTD — Product & Tech Depth (12) — owner **CTO**
- Supporting: CISO (security card, always-on deterministic), CPO (`roadmap` product depth), CDO (data moat).
- Criteria: `code_git`, `website` (primary PTD), secondary `roadmap`.
- Connectors: GitHub (`oauth-github-signals.ts`, `github-repo-audit.ts` via un-stubbed GATHER), website tech audit (`deepTechAudit`: CWV, headers, stack, CI signals), uploads (architecture docs).
- Modules: `agents/tech-intelligence.ts`, `agents/cto-next-best-action.ts`, `agents/cto-cost-modeling.ts`, `agents/ciso-security.ts` (Essential Eight maturity), skill `.claude/skills/cto/SKILL.md`.
- Frameworks: tech-audit (CWV, a11y, headers), repo health (commit cadence, tests, CI, dependency freshness, bus factor), defensibility (proprietary data, algorithms, integrations, patents), build-vs-buy, OWASP top 10, Essential Eight ML1–3, infra cost per user.
- Phase behaviour: `vision`–`customer_dev` — prototype/no-code fine, ask for demo link; `product_dev` — MVP scope, architecture, security plan (floor ptd 55); `growth` — scalability, SLOs, incident process.
- Anchors p50: 45 · 62 · 75.
- Template: verdict → RepoHealthBars → CWV gauge → evidence → cards `code_git`, `website` → CISO security card (deterministic) → S/G/next → stamp.
- Research: framework/LLM cost curves, AU cyber (ACSC Essential Eight updates), Core Web Vitals threshold changes.

### B.5 CGH — Capital & Governance Health (12) — owner **CFO** (new primary)
- Supporting: CLO (SHA, constitution, board, s708), CHRO (ESOP grants/vesting), COO (board cadence).
- Criteria: secondary `team` (cgh), `dataroom` (cgh), `team_structure` (cgh) — no primary criterion exists; the chapter is scored from the cap-table register + these cards. (Do not add a 14th criterion; keep 13×12 stable.)
- Connectors (new, S-R5): cap table register → CGH input (`cap_table` tables from the equity module; today not a `computeSVI` input), ESOP plan docs upload, ASIC extract upload (share structure).
- Modules: `agents/cfo-esop-scoring.ts`, `agents/cfo-valuation.ts:calculateRoundDynamics`, `agents/cfo-projection-norms.ts`, `.claude/knowledge-base/esop/esop-expertise.md`, skill `.claude/skills/cap-table-esop/SKILL.md`, `fundraising-au`.
- Frameworks: cap-table health (founders ≥ 50 % post-seed, no dead equity, clean SAFE stack), ESOP pool 10–15 %, vesting 4y/1y cliff, dilution path (2 rounds, ownership at exit), governance (board composition, observer rights, information rights, D&O), SHA presence, s708 eligibility of past raises.
- Phase behaviour: `vision`–`revenue_model` — founder split, vesting agreed?; `legal_equity` — SHA, ESOP pool reserved, cap table model (floor cgh 50); `funding` — round modelling, dilution ≤ 20–25 % per round, board seat plan (floor cgh 65).
- Anchors p50: 50 · 58 · 68.
- Template: verdict → CapTableDonut (actual or `target`) → DilutionPath → evidence (register / uploads) → cards `team`, `dataroom`, `team_structure` (CGH lens) → S/G/next → stamp.
- Research: ESS (Division 83A) changes, AU SAFE/SAFE-note norms (Cut Through), board composition benchmarks seed→A.

### B.6 IRI — Investor Readiness Index (10) — owner **CLO** (confirmed primary)
- Supporting: CFO (ask vs consensus valuation, investor pack numbers), CRO (`cro-funding-readiness.ts`), CEO (narrative), CDO (completeness).
- Criteria: `documents`, `dataroom` (primary IRI), secondary `revenue`.
- Connectors: data room (`dataroom` docs, `svi-completeness.ts` EVIDENCE_CATALOG), Xero P&L → IRI, investor-pack assembler output, prior-raise records (`funding_intakes`).
- Modules: `agents/cro-funding-readiness.ts`, `investor-pack-assembler.ts`, `agents/accelerator-readiness.ts`, `svi/exit-strategy-svi-boost.ts`, skills `investor-relations`, `fundraising-au`, `clo-advisor`.
- Frameworks: data-room completeness (8 standard folders: corporate, cap table, financials, contracts, IP, team, product, compliance), s708 sophisticated/personal offer readiness, ESIC 100-point test, investor-pack completeness (deck, model, one-pager, DD checklist), round hygiene (SAFE terms, prior valuations).
- Phase behaviour: `pitch` — deck + one-pager (floor iri 45); `investor_review` — data room ≥ 70 %, model actual-vs-plan (floor 65); `funding` — full DD set, ESIC/s708 letters (floor 75).
- Anchors p50: 40 · 55 · 72.
- Template: verdict → DataRoomHeatmap → readiness ring → evidence → cards `documents`, `dataroom` → S/G/next → stamp.
- Research: ASIC s708 guidance updates, ESIC rulings, AU VC DD checklists (Blackbird/AirTree public templates).

### B.7 LCO — Legal & Compliance (8) — owner **CLO**
- Supporting: CISO (Essential Eight, privacy tech controls), COO (process), CFO (GST/ATO).
- Criteria: secondary `documents` (lco); scored chiefly from compliance checklist signals + ABN/trademark lookups.
- Connectors: ABN lookup (`abn-trademark-guide.ts`), uploads (constitution, privacy policy, contracts), website audit (privacy policy present, cookie notice, headers).
- Modules: `agents/clo-compliance.ts`, `agents/ciso-security.ts`, `agents/abn-trademark-guide.ts`, skills `au-compliance`, `clo-advisor`, `ciso-advisor`.
- Frameworks: ASIC (registration, director IDs, annual review), ATO (GST ≥ A$75k, PAYG, R&D registration), OAIC (APPs, breach plan), IP (assignment, trademark class, domain), employment (awards, contractor vs employee), Essential Eight ML1, ACL consumer guarantees.
- Phase behaviour: `vision` — ABN/ACN only; `legal_equity` — IP assignment, SHA, privacy policy (floor lco 45); `growth`+ — Essential Eight ML2, data-breach plan, contract templates.
- Anchors p50: 48 · 58 · 65.
- Template: verdict → ComplianceChecklist progress → risk heat map → evidence → card `documents` (LCO lens) → S/G/next → stamp.
- Research: ASIC/ATO/OAIC updates monthly, Privacy Act reform tranche dates, ACSC advisories.

### B.8 SVM — Strategic Vision & Moat (5) — owner **CEO** (new primary)
- Supporting: CMO (5-factor moat, category), CPO (`roadmap`), CFO (exit multiples).
- Criteria: `roadmap` (primary SVM), secondary `idea`.
- Connectors: deck vision slides, roadmap upload, competitor research (GATHER).
- Modules: `svi/exit-strategy-svi-boost.ts`, `agents/cfo-valuation.ts:auExitRealisationCheck`, `agents/cmo-competitor-tracker.ts`, knowledge `.claude/knowledge-base/blockid-self-analysis/blockid-profile.md` (worked example of the method), skill `pitch-deck-builder`.
- Frameworks: 5-factor moat (network effects, switching costs, brand, proprietary data, economies of scale), category strategy (Play Bigger), exit paths (strategic / PE / ASX, AU acquirer landscape), optionality (adjacent markets), vision-to-roadmap coherence.
- Phase behaviour: `vision` — vision statement, 3-year picture; `mentor_review` — pivot/persevere; `growth`/`funding` — moat evidence (data, integrations), exit path with named acquirer categories.
- Anchors p50: 45 · 55 · 65.
- Template: verdict → MoatRadar → exit timeline → evidence → card `roadmap` (+ `idea` lens) → S/G/next → stamp.
- Research: AU M&A multiples by sector (quarterly), ASX small-cap tech listings, category-creation case studies.

### B.9 Cross-cutting roles
- **CEO**: three questions (cover), executive summary, SVM chapter, exit paths. Opus-class model when paid provider on; otherwise best free reasoning model.
- **CDO**: deterministic per chapter — cohort percentile (`cohort-percentile.ts`), benchmark bands, evidence heat (`cdo-data-quality.ts`), freshness; one LLM `crossValidate` at premium; owns the appendix evidence register and `quality.groundedShare`.
- **CISO**: deterministic security card in PTD + LCO (`ciso-security.ts`); LLM narration only when repo/website evidence exists (any phase) — replaces scale-only.
- **COO**: phase gates chapter (deterministic from `PHASE_EXIT_RULES`) + 90-day plan (`scn-action-plan.ts` + `svi-actions.ts`); LLM narration at premium.
- **CPO**: `idea`, `roadmap` criterion cards; supports MPC/SVM/PTD.
- **Auditor** (`llm-auditor.ts`): stamps every chapter; standard cap 8 sections (raise from 6 to cover the 8 chapters), premium 16.
- KPI matrix (`content/reports/clevel-kpi-matrix.json`) roles `ccso`, `cso`, `rnd`, `ir` stay internal-ops only; they are not report agents (documented in the appendix method).

### B.10 Ownership summary

| Dim | W | Primary | Supporting | Criteria (13 map) | Phase leads consulted (`GROWTH_PHASES.leadAgent`) |
|---|---|---|---|---|---|
| TRE | 20 | CRO | CFO, CMO, CDO | customer_size, revenue | customer_dev (cmo), revenue_model (cfo), growth (cro) |
| MPC | 18 | CMO | CPO, CRO, CFO | market, gtm_strategy, idea | vision (ceo), customer_dev (cmo), go_to_market (cmo) |
| FTV | 15 | CHRO | CEO, CLO, COO | founder_profile, team, team_structure | team (chro), mentor_review (ceo) |
| PTD | 12 | CTO | CISO, CPO, CDO | code_git, website (+roadmap) | product_dev (cto) |
| CGH | 12 | CFO | CLO, CHRO, COO | team·dataroom·team_structure (CGH lens) + register | legal_equity (clo), funding (cfo) |
| IRI | 10 | CLO | CFO, CRO, CEO | documents, dataroom (+revenue) | pitch (ceo), investor_review (ceo), funding (cfo) |
| LCO | 8 | CLO | CISO, COO, CFO | documents (LCO lens) + checklist | legal_equity (clo) |
| SVM | 5 | CEO | CMO, CPO, CFO | roadmap (+idea) | vision (ceo), mentor_review (ceo) |

### B.11 Rubric anchors — p25 / p50 / p75 per dimension per SVI stage (computed from `svi-dimension-benchmarks.ts ANCHORS`)

Stage 0 idea · 1 pre-seed · 2 seed · 3 post-seed · 4 series A · 5 series B · 6 series C · 7 late. Values are p25/p50/p75. These are the static fallback; `cohort-percentile.ts` real cohorts (N ≥ 30, stage + sector) override at run time and the chapter header shows which one was used.

| Dim | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|---|
| TRE | 15/30/45 | 26/41/56 | 37/52/67 | 50/65/80 | 63/78/93 | 66/81/96 | 70/85/100 | 73/88/100 |
| MPC | 38/50/62 | 42/54/66 | 46/58/70 | 52/64/76 | 58/70/82 | 61/73/85 | 65/77/89 | 68/80/92 |
| FTV | 40/52/64 | 44/56/68 | 48/60/72 | 54/66/78 | 60/72/84 | 63/75/87 | 67/79/91 | 70/82/94 |
| PTD | 33/45/57 | 42/54/66 | 50/62/74 | 57/69/81 | 63/75/87 | 66/78/90 | 70/82/94 | 73/85/97 |
| CGH | 38/50/62 | 42/54/66 | 46/58/70 | 51/63/75 | 56/68/80 | 59/71/83 | 63/75/87 | 66/78/90 |
| IRI | 28/40/52 | 36/48/60 | 43/55/67 | 52/64/76 | 60/72/84 | 63/75/87 | 67/79/91 | 70/82/94 |
| LCO | 36/48/60 | 41/53/65 | 46/58/70 | 50/62/74 | 53/65/77 | 56/68/80 | 60/72/84 | 63/75/87 |
| SVM | 33/45/57 | 38/50/62 | 43/55/67 | 48/60/72 | 53/65/77 | 56/68/80 | 60/72/84 | 63/75/87 |

Qualitative anchors the owner agent must use when the evidence is thin (injected as the `ROLE_CARD` rubric; three stages shown, the prompt carries all eight):

| Dim | p25 looks like (idea / seed / A) | p50 looks like | p75 looks like |
|---|---|---|---|
| TRE | idea: no interviews · seed: < A$2k MRR, no cohort data · A: < A$40k MRR, flat | idea: 10+ interviews, waitlist · seed: A$5–15k MRR, 5–8 % MoM · A: A$80–150k MRR, NRR ≈ 100 % | idea: LOIs / paid pilots · seed: > A$20k MRR, ≥ 10 % MoM, churn < 3 % · A: > A$200k MRR, NRR > 110 %, burn multiple < 1.5 |
| MPC | problem stated, no sizing · TAM top-down only · SAM unverified | persona + pain evidence · bottom-up SAM, 3 named competitors · category narrative, channel CAC known | problem-severity quantified (spend today) · SAM cross-checked, 2×2 with wedge · share-of-SOM trajectory, "why now" evidenced |
| FTV | solo, part-time, no domain history | 2 founders, one domain expert, vesting agreed · key roles covered · leadership bench forming | complementary trio, prior exit / operator, full-time, advisory board · hiring plan funded · low key-person risk |
| PTD | slides only · repo dormant, no tests · no CI, CWV poor | clickable prototype · MVP live, tests + CI, CWV OK · SLOs, security plan, Essential Eight ML1 | working demo with users · integrations, proprietary data, ML2 · scalable infra, IP filed |
| CGH | no split agreed · no SHA, no ESOP, SAFE stack messy · founders < 40 % | split + vesting · SHA, ESOP pool reserved, clean register · board with independent seat | ESOP 10–15 % granted, dilution modelled 2 rounds · information rights, D&O, board cadence · governance ready for institutional |
| IRI | no deck · data room < 30 % · prior raise undocumented | one-pager + deck · data room 60–70 %, model actual-vs-plan · ESIC/s708 checked | DD-ready room ≥ 85 %, references, ask aligned with consensus valuation |
| LCO | no ABN/ACN · no IP assignment, no privacy policy | ACN, IP assigned, privacy policy, contractor agreements · GST registered, R&D registered | Essential Eight ML2, breach plan, trademark registered, contract templates reviewed |
| SVM | vision statement only · moat unnamed | 3-year picture, one moat factor evidenced · exit path plausible | 2+ moat factors with data, category thesis, named acquirer categories with AU precedent |

Code home: a new `src/lib/report-pipeline/dimension-owners.ts` exporting `DIMENSION_OWNERS: Record<DimKey,{primary, supporting, criteria, frameworks, modules, connectors, researchTopics}>` — the single table that `agent-prompts`, `agent-selector`, `section-assembler`, `goal-tree`, `svi-completeness` and the TBR UI all import. Delete the duplicate rubric copies (`DIM_META` in stream route, `DIMENSION_INFO` in dimension-analyze, CDO hardcoded medians) once it lands.

---

## C. Pipeline unification

### C.1 One generator
- `orchestrator.ts` becomes the only writer of `svi_snapshots.dim_results / criterion_results` and the new `report_v2`. It gains an `onEvent(event)` hook emitting `context`, `dimension_start`, `dimension_complete` (with the finished `DimensionChapter`), `valuation_complete`, `criteria_synthesis`, `progress`, `done` — the exact SSE vocabulary the TBR client already consumes.
- `/api/svi/dimensions/stream/route.ts` is reduced to: auth → credit/tier check → `runReportPipeline({ projectId, tier, onEvent: send })` → persist. `analyzeOneDimension`, `synthesizeCriteria`, `DIM_META` are deleted; `svi_deck_cache` keeps working keyed by `deck_hash + pipelineVersion`. `/api/svi/dimension-analyze/route.ts` becomes a thin per-dimension re-run (`dims: [key]`) of the same pipeline.
- Wave design (per report): GATHER (parallel: market research, tech audit, repo audit, connector pulls, module precompute) → W1/W2/W3 criterion calls as today (13) → **W4 dimension chapters** (8 owner calls in parallel; input = mapped criterion results + evidence rows + module outputs + phase lens; output = `DimensionChapter` Zod) → SYNTH (CEO exec + three questions; CDO deterministic; COO deterministic; valuation deterministic) → AUDIT (auditor stamps 8 chapters + exec) → ASSEMBLE (`assembleReportV2`, renders SVG strings, validates schema) → persist + `svi_index_snapshots`.
- Free tier runs the same pipeline with `tier:"free"`: W4 chapters 6–9 use a `card` output schema (≤ 60 words), W3 skipped, auditor cap 4.

### C.2 Knowledge injection into `buildAgentPrompt`
New signature `buildAgentPrompt(role, ctx, { criterion?, dim?, phaseId, tier })` composing, in order and with per-block token caps: AU_CONTEXT (existing) → role card from `DIMENSION_OWNERS` (frameworks list, output template) → **phase lens** (`GROWTH_PHASES[phase]` title, steps, `PHASE_EXIT_RULES[phase]` floors + next phase's required criteria; ≤ 250 tokens) → **skill addon** (`SKILL_MAP[role][bucket].promptAddon`, already written, ≤ 150 tokens) → **knowledge files** (`.claude/knowledge-base/*.md` selected by `DIMENSION_OWNERS[dim].knowledge`, loaded once at boot via `fs` + memoised, ≤ 600 tokens each, at most 2) → **agent_knowledge_base** (top 3 rows for the role by `created_at desc` where `status='approved'`, ≤ 120 tokens each; migration 0047 table) → **module outputs** (deterministic JSON from `src/lib/agents/*` precomputed in GATHER, e.g. `buildVcValuationReport`, `scoreEsop`, `assessCompliance`, `evaluateUnitEconomics`, `computeCohortPercentile`; rendered as a compact table ≤ 400 tokens) → evidence catalogue (existing) → output schema. Prompt text is loaded from `prompt_versions` (see C.8) with these blocks as template slots, so the nightly eval compares like with like.

### C.3 Un-stub GATHER
`orchestrator.ts:205–221`: call `deepTechAudit(url)` (`lib/tech-audit` / `with-tech-boost.ts` path) and `auditGitHubRepo(url)` (`github-repo-audit.ts`), each with a 20 s timeout and a cached result keyed by URL + 24 h (`tech_audits` table already exists for the dashboard). Add connector pulls: Stripe/Xero/GA4 signal snapshots (`oauth-*-signals.ts` read-only from the last sync — never a live OAuth call inside the report), cap-table register read, grants/programs match (`grant-advisor.ts`). All GATHER results become `EvidenceRow`s with `source` and `observedAt` so the evidence tables and citations are real ids.

### C.4 Visuals
- `chart-generator.ts` is rewired: `generateChartsV2(ctx, chapter)` builds `VisualSpecV2` from module outputs (never from LLM prose), then `renderSvg(spec)` from the shared `report-visuals/` package (D) fills `spec.svg`.
- Decision: **deterministic SVG first, always.** AI images (`ai-image-client.ts`, Gemini→OpenRouter→OpenAI) are removed from the scored body; keep the path only for an optional premium "cover illustration" behind a flag, off by default. Reasons: reproducibility, auditability (a chart must be re-derivable from `data`), PDF/DOCX parity, a11y table fallback, zero image cost, no hallucinated numbers in pictures.
- The four markdown-embedded SVGs in `section-assembler.ts` (growth journey, three questions, progress dashboard, phase checklist) are moved into `VisualSpecV2`s (`route_map`, `three_questions_strip`, `progress`, `checklist`) so UI consumers stop stripping them.

### C.5 Valuation in the body
GATHER runs `buildVcValuationReport()` with inputs from `loadProjectReportContext` (MRR from Stripe/Xero bridge, sector from `sector-map`, stage, ESIC flag, RDTI estimate, growth %). `ValuationChapter` = methods (6 rows, scorecard weight 0 marked `applicable:false` unless pre-revenue where it is shown as reference), consensus, ask (from `funding_intakes`/project ask if present, `crossCheckStatedCap`), sector multiples with `sourceLabel` + `sourceDate` from `vcBenchmark()`, comparables N (+ with-multiples N) from the comparables table (C.7), scenarios. `estimateValuationRange` and `three-case-valuation.ts` are retired from the TBR; three-case becomes `scenarios` of the same chapter. Guardrail from cfo-advisor skill: never a single point — range + method transparency, US multiples discounted 20–40 % (already in `AU_MARKET_DATA`).

### C.6 Phase-aware selection
`agent-selector.ts` keeps the 4 buckets for cost, adds `phaseId` from `growth/phase-gate.ts` (`evaluatePhaseGate` on stored criteria quality + dims): (a) W4 always runs the 8 owners; (b) the current phase's `leadAgent` + `supportAgents` are added to W2 for their inferred criterion (existing `includePhaseAgents` becomes default true); (c) criteria in `PHASE_EXIT_RULES[phase].requiredCriteria` and `[nextPhase].requiredCriteria` get the larger token budget and are never skipped in W3; (d) the executive summary gets a `phaseNow` block with blockers from `PhaseGateResult`.

### C.7 Evidence connectors to add (S-R5)
| Connector | Dims | Implementation |
|---|---|---|
| LinkedIn (upload / URL) | FTV (+CGH advisors) | Founder pastes profile URL or uploads the LinkedIn "Save to PDF" export; parser → `founder_signals` (years in domain, prior companies, exits, team size on page). No scraping; URL only stored + displayed. |
| GA4 richer signals | TRE, MPC | Extend `oauth-ga4-signals.ts`: 90-day sessions, conversions, returning-user share, top 3 channels, engagement rate → AARRR funnel + channel mix; `hasAnalytics` boolean stays as fallback. |
| Cap table → CGH | CGH | `computeSVI` gains `capTableInput` (founder %, ESOP %, investor %, vesting flag, SHA flag) from the equity register; `cfo-esop-scoring.ts` output feeds the CGH chapter and the donut. |
| Xero P&L → CGH/IRI | IRI, TRE | Already partially there; expose gross margin + opex for unit economics. |
| AU comparables | Valuation | New table `au_comparable_raises` (migration): name, sector, stage, round date, amount, post-money (if disclosed), ARR (if disclosed), source_url, source_date, verified_by, status. Seed from the 33 rows; ingest weekly from allow-listed public sources (Cut Through Venture weekly roundup, Startup Daily funding posts, ASX announcements for listed comps, company press releases); admin review page (`/dashboard/admin/sector-multiples` sibling). Targets: 300 verified raises by S-R5, ≥ 100 with disclosed multiples. **Copy rule** (S-R1, immediate): `comps-wall.tsx:80` and `bento.tsx:66` read the live count — "AU comparables: {N} raises tracked, {M} with disclosed multiples (sources dated)". "500+" reappears only when N ≥ 500. |

### C.8 Cost, latency, model tiers, caching
Facts: transport is the free/cheap chain (Groq/Cerebras/DeepInfra/SambaNova; ≈ US$0.0006 per call yesterday); `agent-model-tiers` labels are audit metadata. Standard report today ≈ 15 LLM calls; v2 ≈ 13 (criteria) + 8 (chapters) + 1 (CEO) + ≤ 8 (auditor critic/reviser, most skipped as `clean`) ≈ 26–30 calls.

| Tier | Price | Calls | Model class | COGS target (AU$) | Latency target |
|---|---|---|---|---|---|
| Free (10 p.) | A$0 | ≤ 16 (W3 off, chapters 6–9 as cards, auditor cap 4) | free chain, interactive ordering | ≤ 0.05 | ≤ 60 s to first chapter, ≤ 90 s done |
| Standard TBR | A$3 | ≤ 30 | free chain for criteria + cards; **CEO + CFO chapters on paid Sonnet-class when `MODEL_AGENT_CEO/CFO` set** (≈ US$0.03 each) | ≤ 0.60 (20 % of price) | ≤ 120 s |
| Premium / Growth | A$7 | ≤ 40 (+CDO cross-validate, COO narration, auditor 16) | Sonnet-class for CEO/CFO/CRO/CMO, free chain others | ≤ 2.00 | ≤ 180 s |
| Investor memo / Program batch | A$10 / included | ≤ 48 | Opus-class CEO/CFO; Sonnet others | ≤ 3.50 | ≤ 240 s (batch async) |

Caching: GATHER results 24 h by URL; module outputs deterministic (no cache needed); `svi_deck_cache` keyed by deck hash + pipelineVersion + tier; chapter-level cache when the dimension's evidence hash is unchanged since the last run (weekly Δ reports then cost ≈ 3 calls: exec + changed chapters). Budget guard: `ai-client` `/tmp/blockid-ai-budget.json` daily cap stays; the pipeline reads `budgetOk()` before W4 and degrades chapters to deterministic cards rather than failing the report.

### C.9 Quality gates
1. Schema gate: every W4 payload passes `DimensionChapter` Zod (one repair, then deterministic card marked `degraded`).
2. Citation gate: `llm-auditor` stage 1 on all 8 chapters + exec; **grounded share ≥ 80 %** of material claims (report-level `quality.groundedShare`); below 80 % the report is still delivered but the cover shows "evidence-light" and the CTA goes to evidence, not to share.
3. Consistency checks (deterministic, `section-assembler`): chapter score within ± 10 of `computeSVI` dim score (else the deterministic score wins and the narrative gets a "score reconciled" note); valuation consensus within the stage band of `SVI_BENCHMARKS`; TRE narrative must not state MRR if no revenue evidence row exists; phase blockers listed in exec = `PhaseGateResult.blockers`.
4. Visual gate: 8 chapters × `primaryVisual.svg` non-empty.
5. Length gate: free ≤ 10 pages (`page-count.ts`), standard 5–8k words, premium 8–15k.

### C.10 `prompt_versions` runtime loading + nightly eval
- `readCurrentPrompt("report-<role>")` returns the row; today only its id is used. Change: `text` becomes the template with slots `{{AU_CONTEXT}} {{ROLE_CARD}} {{PHASE_LENS}} {{SKILL_ADDON}} {{KNOWLEDGE}} {{MODULES}} {{EVIDENCE}} {{OUTPUT_SCHEMA}}`; missing row → code default (current `AGENT_PROMPTS`). Shadow/canary columns already exist.
- Nightly `prompt-eval-nightly`: fixtures `web/test-fixtures/prompt-eval/` gain `TBR-<dim>-v2.0.0.json` (8 files, 3 cases each: idea / seed / series A) with `expected.proposed_score` bands from ANCHORS p25–p75, `must_have_gaps`, `must_not_hallucinate`, `must_cite ≥ 1`, `primary_visual.kind`. Fail → canary demoted, Telegram/ops note.

### C.11 W4 dimension-chapter call — prompt slots and payload (what the owner agent actually returns)

User-prompt slots (rendered by `renderStructuredUser`, all deterministic): `dim`, `weight`, `stage`, `phaseId`, `benchmark {p25,p50,p75,source}`, `deterministicScore` (from `computeSVI`), `criterionResults[]` (score, verdict, citations of the mapped criteria — already validated in W1–W3), `evidenceRows[]` (id, source, status, observedAt, value), `moduleOutputs` (compact JSON, ≤ 400 tokens), `phaseLens` (this phase's floor for the dim, next phase's required criteria), `tier` (controls word caps). The model never receives raw uploads a second time — only the W1–W3 outputs and evidence ids, which keeps W4 cheap (≈ 2.5k in / 700 out).

```json
{
  "dim": "cgh",
  "verdict": "Cap table is founder-heavy (2 founders 90 %, no ESOP pool) [ev:register-01]; vesting is agreed in the SHA [ev:doc-sha-03] but no round has been modelled.",
  "score_adjustment": { "proposed": 54, "deterministic": 56, "reason": "no ESOP pool reserved; SHA present" },
  "strengths": ["SHA with 4y/1y vesting signed [ev:doc-sha-03]", "No SAFE stack — clean register [ev:register-01]"],
  "gaps": ["No ESOP pool (target 10–15 %) [ev:register-01]", "Dilution for seed round not modelled [unevidenced]"],
  "next_action": { "title": "Reserve a 12 % ESOP pool before the seed round", "window": "30d", "expected_lift": 6, "evidence_to_add": "upload" },
  "criterion_cards": [
    { "key": "team_structure", "lens": "cgh", "verdict": "…", "strengths": ["…"], "gaps": ["…"], "next_action": "…", "citations": [{ "evidence_id": "…", "quote": "…" }] }
  ],
  "primary_visual": { "kind": "donut", "data_state": "real", "series": [{ "label": "Founders", "value": 90 }, { "label": "ESOP", "value": 0 }, { "label": "Investors", "value": 10 }] },
  "secondary_visuals": [{ "kind": "line", "data_state": "target", "title": "Dilution path (2 rounds, 20 % each)", "series": [{ "label": "Founders", "points": [90, 72, 58] }] }],
  "phase_lens": { "phase_id": "legal_equity", "what_matters_now": "Clear the Legal & Equity gate: SHA ✓, cap table model ✗, ESOP plan ✗ — CGH floor 50 met at 56.", "floor": 50, "floor_met": true },
  "frameworks_used": ["cap-table health", "ESOP 10–15 %", "dilution path", "governance"],
  "confidence": 0.72,
  "hallucination_risk": "low"
}
```

Zod constraints: `verdict ≤ 80 words`; `strengths/gaps 2–4 items each, ≤ 20 words, each ending with a citation or `[unevidenced]``; `score_adjustment.proposed` within ± 10 of `deterministic` (else clamped + flagged); `primary_visual.kind` must be in `DIMENSION_OWNERS[dim].allowedVisuals`; `series` numbers must be traceable to `moduleOutputs` or `evidenceRows` (checked by a deterministic "number provenance" pass: every number in `series` must appear in the inputs ± rounding, else `data_state` is downgraded to `partial` and the auditor is invoked).

### C.12 SSE event contract (unchanged vocabulary, richer payloads)
`context {industry, stage, phaseId, tier, estimatedCalls, estimatedSeconds}` → `gather_complete {evidenceRows: n, connectors: [...]}` → `dimension_start {dim, ownerAgent}` ×8 → `dimension_complete {dim, chapter: DimensionChapter}` ×8 (chapters stream as each W4 call returns; the UI renders the chapter card immediately with its SVG) → `valuation_complete {chapter}` → `criteria_synthesis {criteria: CriterionCard[13]}` (kept for the old client for one release) → `executive_complete` → `audit_complete {groundedShare, revised: n}` → `progress {completed,total}` interleaved → `done {reportId, snapshotId, totalMs, calls, costAud, fromCache}` | `error {dim, message, degraded:true}` | `fatal_error`. Per-dimension retry stays: `POST {dims:["cgh"]}` re-runs only W4 for that dim (W1–W3 results reused from the snapshot).

---

## D. Visual system

### D.1 Shared package `web/src/lib/report-visuals/`
Pure functions `(spec: VisualSpecV2) => string` (SVG) + matching React components that draw the same geometry with recharts where interactivity helps. One data adapter per kind so web, react-pdf (`<Svg>` primitives) and DOCX (`ImageRun` from SVG→PNG via existing playwright renderer, cached per report) share numbers and labels.

| Component | Reuse / build | Used in |
|---|---|---|
| `ScoreRing` | reuse `components/svi/svi-score-ring.tsx` (extract SVG fn) | cover, chapter headers |
| `SviRadar` | reuse `components/svi/svi-radar-chart.tsx` (recharts) + add static SVG twin (PDF has `RadarChartSVG` in `svi-report-pdf.tsx` — move to package) | cover, SVM moat (5-axis variant) |
| `CriterionRing` | reuse from `business-report-client.tsx:312` | criterion cards |
| `ValuationRangeBars` | reuse `ValuationRangeSVG` (`svi-report-pdf.tsx`) + ask marker | valuation |
| `EvidenceHeatmap` | reuse `components/svi/svi-completeness-heatmap.tsx` grid → generic `heat_map` | IRI, FTV, phase gates |
| `PercentileBand` | reuse `PercentileBandSVG` (`svi-report-pdf.tsx`), `cohort-benchmark-chart.tsx` | every chapter header |
| `PhaseRouteMap` | reuse `RouteMapSVG` + `renderGrowthJourneySVG` (`startup-growth-phases.ts:387+`) | exec, phase gates |
| `Funnel` | reuse `renderFunnelSVG` (`chart-generator.ts:366`) | TRE AARRR, MPC TAM/SAM/SOM |
| `CapTableDonut` | build (simple arc paths) | CGH |
| `Sparkline` | reuse c-level-reports 12-week sparkline + `score-history-chart.tsx` | TRE revenue, cover Δ |
| `Bars`, `Gauge`, `Checklist`, `Timeline/Gantt`, `Positioning2x2`, `Scatter` | reuse `renderBarSVG/ProgressSVG/HeatMapSVG`; build gauge/gantt/2×2/scatter (≈ 60 lines each) | PTD, LCO, SVM, action plan, comparables |
| `ThreeQuestionsStrip` | reuse `renderThreeQuestionsSVG` | cover |

### D.2 Accessibility and print
- Every SVG: `<title>` + `<desc>` from `a11y`, `role="img"`, `aria-labelledby`; web renders a visually-hidden `<table>` from `a11y.tableFallback`; PDF appendix prints the same tables for chapters where the chart is the only carrier of numbers.
- Palette: colour-blind-safe (Okabe–Ito based; bands strong = #0072B2, developing = #E69F00, early = #D55E00, pending = #999999; sequential heat = single-hue blues; never red/green pairs). Band is always also encoded by label/pattern (hatching for `target`/`benchmark_only`).
- Print: 210 mm A4, 18 mm margins, chart max width 170 mm, min font 9 pt, no chart split across pages (`break-inside: avoid`), monochrome-safe (patterns), page footer "Trusted Business Report · {startup} · {date} · page x/y".
- `dataState` badge on every chart: real / partial / benchmark only / target — so a reader never mistakes a target donut for an actual cap table.

### D.3 Wireframe — one dimension chapter (TRE), web/PDF identical structure

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ 2 · TRE — Traction & Revenue Evidence                weight 20 · owner CRO    │
│ [ScoreRing 61]  band Developing   stage Seed · p25 37 | p50 52 | p75 67       │
│                 ▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮●▮▮▮▮▮   you: 61 → 68th percentile (N=212)   │
├──────────────────────────────────────────────────────────────────────────────┤
│ PRIMARY VISUAL  Monthly revenue, last 12 mo (Stripe, synced 2026-09-14)      │
│   A$ ┤                                   ╭─╮                                 │
│      ┤                          ╭──╮  ╭─╯ ╰─  MRR A$18.4k  +9 % MoM         │
│      ┤              ╭─────╮ ╭──╯  ╰──╯       churn 2.1 %  NRR 104 %         │
│      ┤ ────────╭────╯     ╰─╯                                                │
│      └─────────────────────────────────────────  [real]                     │
│ SECONDARY  AARRR funnel (GA4 90 d)  12.4k sessions → 812 signups → 301 active│
│            → 46 paying → NRR 104 %                                  [real]  │
├──────────────────────────────────────────────────────────────────────────────┤
│ VERDICT  Revenue is real and growing but concentrated: top customer = 31 %   │
│ of MRR [ev:stripe-01]; growth 9 % MoM is above seed p50 (6 %) [ev:bench-tre].│
├──────────────────────────────────────────────────────────────────────────────┤
│ EVIDENCE            source     status      observed    value                 │
│ MRR series          Stripe     evidenced   2026-09-14  A$18.4k               │
│ Revenue (P&L)       Xero       stale       2026-07-31  A$41k Q                │
│ Web funnel          GA4        evidenced   2026-09-13  46 paying             │
│ Customer list       upload     missing     —           add CSV → +4 TRE      │
├──────────────────────────────────────────────────────────────────────────────┤
│ CRITERION CARDS   [○ 64] Customer base & traction   [○ 58] Revenue & UE      │
│   verdict · 2 strengths · 2 gaps · next action · cites 3 · grounded ✓        │
├──────────────────────────────────────────────────────────────────────────────┤
│ STRENGTHS  · 9 % MoM for 6 mo  · NRR > 100 %                                 │
│ GAPS       · concentration 31 %  · no cohort retention curve                 │
│ NEXT ACTION (this week)  Export cohort table from Stripe → upload; expected   │
│   +5 TRE (+1.0 SVI).  Phase lens: Go-to-Market needs TRE ≥ 55 — met.         │
├──────────────────────────────────────────────────────────────────────────────┤
│ ⚑ Auditor: 11 claims, 10 cited, 0 revised · CRO run 3f2a… · prompt v2.0.1    │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## E. Sales / packaging (product role)

### E.1 One naming system (use everywhere, EN/VI keys in `lib/i18n`)
- **SVI** — the score (0–100, no cap, weekly). Never "SVI report".
- **Trusted Business Report (TBR)** — the startup's document, all surfaces (web, PDF, DOCX, email). Replace "Enhanced SVI report", "Trust BizReport", "SVI report", "business report" in UI copy; keep `trust_report` SKU key internally.
- **Investor Dossier** — the evaluator view of the same ReportV2 (adds mandate fit, decision record, Δ since last view, cohort rank). Replaces "evaluation report"/"Trust BizReport for evaluators".
- **Progress Radar** — the weekly Δ email/digest (already named).
- Public naming collisions to fix in the IA plan (10-*): `/workspace/evaluation` (founder self-check) → "Self-assessment"; `/investors` (invest in BlockID) → `/about/invest` **[merge-fix: aligned with IA plan]**.

### E.2 Feature matrix (what each tier unlocks in the report)

| Feature | Free | A$3 TBR | Starter A$29 | Growth A$69 **[merge-fix: live price A$69]** | Scout A$79 | Firm A$149 | Program A$349 |
|---|---|---|---|---|---|---|---|
| Cover: score ring, radar, 3 questions | ✔ | ✔ | ✔ | ✔ | per startup | per startup | per startup |
| Chapters TRE/MPC/FTV/PTD full | ✔ (10 p.) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Chapters CGH/IRI/LCO/SVM | cards | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Valuation 5 methods + comparables | range | ✔ | ✔ | ✔ + scenarios editable | ✔ | ✔ | ✔ |
| Phase gates 13×12 + 90-day plan | current row, 5 steps | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Money on the table | top 3 | ✔ | ✔ | ✔ + application drafts | — | — | — |
| Auditor stamps + evidence register | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| PDF | ✔ (10 p.) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| DOCX + share link + investor leads | — | share | ✔ | ✔ | — | white-label | white-label + LP export |
| Weekly re-run + Δ (Progress Radar) | — | — | ✔ | ✔ | 10 reports/mo | 30/mo | 100/mo + batch |
| Investor Dossier (mandate fit, decision record) | — | — | — | — | ✔ | ✔ | ✔ + cohort ranking |
| Connectors (Stripe/Xero/GA4/GitHub) | 1 | 1 | 4 | 4 | n/a | n/a | n/a |
| CEO/CFO chapters on top-tier model | — | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |

### E.3 In-product CTAs at the exact moment
1. **After score (free, done event)** — cover renders; below the radar: "Your weakest dimension is {dim} ({score}). See the full {dim} chapter and 4 more — Trusted Business Report A$3." Show credit cost + estimated words before charge (transparent-pricing rule).
2. **After evidence added** (connector synced / upload) — toast + chapter banner: "Stripe connected — TRE re-scored {old}→{new}. Re-run report (A$1) to update the chapter." Weekly plan users: "included, runs Sunday".
3. **Weekly Δ** (Progress Radar email) — "SVI {Δ} this week; {dim} moved most. Open the chapter → one next action." Evaluators: "3 startups moved ≥ 5 points; open Dossier."
4. **After share link viewed by an investor** — founder notification "An investor read chapters TRE and Valuation for 4 min" → "Complete CGH (cap table) — it's the chapter investors open next."
5. **Evaluator after adding a startup** — "Dossier ready in ~2 min. A$3 per startup, {quota} left this month."

### E.4 Messaging pack (≤ 3 lines each)
Founder EN — "Know where you stand, what you're worth, and what to do next. One report, 8 dimensions, 11 specialist AI agents, every claim tied to your own evidence. Australian law, Australian market, Australian dollars."
Founder VI — "Biết bạn đang ở đâu, đáng giá bao nhiêu và làm gì tiếp theo. Một báo cáo, 8 chiều đánh giá, 11 AI chuyên gia cấp C, mọi nhận định gắn với bằng chứng của chính bạn. Luật Úc, thị trường Úc, đô-la Úc."
Investor EN — "Every startup scored the same way, from its own evidence, updated weekly. Open the Investor Dossier: score, valuation range, gaps, and what changed since you last looked. Record your decision in the same place."
Investor VI — "Mọi startup được chấm cùng một thước đo, từ chính bằng chứng của họ, cập nhật hằng tuần. Mở Hồ sơ Nhà đầu tư: điểm, khoảng định giá, khoảng trống và những gì đã thay đổi. Ghi quyết định ngay tại đó."
Objection "why not ChatGPT" — reuse G12 §4b paragraph verbatim (`docs/plans/evaluator-traction-2026-09-10.md:99–100`); add one visual proof on the comparison page: the same deck → ChatGPT twice (two verdicts) vs TBR twice (same score, evidence ids).
Claims discipline: entity Auschain for legal/billing, PPL Food for marketing; no "PhD"; "500+" comparables only when the live count is ≥ 500.

### E.5 KPIs (GA4 events + SQL, dashboard tile in `/dashboard/admin`)
1. Report views → shares: `tbr_view` → `tbr_share_created` ≥ 25 % of paid reports within 7 d.
2. A$3 conversion: `score_done` (free) → `trust_report_purchased` ≥ 12 % within 72 h.
3. Evaluator reports/month: `evaluation_report_run` per active evaluator ≥ 6 (Scout) / 15 (Firm) / 40 (Program).
4. Dossier → decision recorded: `dossier_view` → `investor_decision_saved` ≥ 40 % within 14 d.
5. NPS on report clarity: in-report 1-question survey ("Was the report clear?") ≥ 8.5/10, N ≥ 30/month; plus `quality.groundedShare` median ≥ 0.85 as the internal twin.

---

## F. Execution plan (each sprint ≤ 1 session, deploy immediately, then review → test → fix)

Cadence rules: build from src, `web/scripts/deploy-live.sh`, off-peak window; migrations applied manually via `docker exec psql` + `NOTIFY pgrst, 'reload schema'`; run `npm run qa:live` after each deploy; commit + push immediately (autonomous `git reset --hard` loop). Prioritisation: WSJF — S-R1 has the highest user value (visuals + contract) and the smallest job size.

### S-R1 — ReportV2 contract + deterministic visuals + web TBR chapters
- Files: new `src/lib/report-pipeline/report-v2.ts`, `report-v2.schema.ts`, `dimension-owners.ts`; new `src/lib/report-visuals/{index,score-ring,radar,funnel,heatmap,range-bars,sparkline,donut,bars,gauge,checklist,timeline,route-map,positioning,scatter,palette,a11y}.ts`; `section-assembler.ts` → `assembleReportV2()` (adapter from today's `AssembledReport` + `svi_snapshots` rows, so the web can render v2 before the pipeline emits it); `business-report-client.tsx` split into `tbr/{cover,chapter,valuation,phase-gates,money,action-plan,appendix}.tsx` reading `ReportV2` only; `comps-wall.tsx`, `bento.tsx` copy → live count; `lib/i18n` naming keys.
- Migration: `svi_snapshots.report_v2 jsonb`, `assembled_reports.report_json jsonb` (nullable, no backfill; adapter builds v2 on read for old rows).
- Tests: vitest `report-v2.schema.test.ts` (8 chapters, visual required), `report-visuals/*.test.ts` (svg contains `<title>`, deterministic hash per fixture), hydrated smoke on `/tbr/demo` and `/workspace/business-report` (8 `svg[role=img]` present, TOC anchors), page-count ≤ 10 for free fixture.
- Cost guardrails: none (no new LLM calls). Rollback: feature flag `TBR_V2_UI` (default on after smoke); old client kept one release.

### S-R2 — Agent ownership matrix + knowledge injection + phase awareness
- Files: `agent-prompts.ts` (`buildAgentPrompt` v2 with slots + per-block caps), `agent-skill-map.ts` wired, new `knowledge-loader.ts` (`.claude/knowledge-base/*.md` memoised + `agent_knowledge_base` read), `agent-selector.ts` (phaseId, leadAgent default, required-criteria budget), `agent-dispatcher.ts` (W4 `dispatchDimensionChapters`, `DimensionChapter` Zod payload, `visuals` filled from `generateChartsV2`), `orchestrator.ts` (W4 + `onEvent`), `llm-auditor.ts` cap 8 standard, `goal-tree.ts` researchTopics per B.1–B.8, delete `DIM_META`/`DIMENSION_INFO` duplicates.
- Migration: none (`agent_knowledge_base` exists; add `status` default `'approved'` if column missing — check 0047).
- Tests: prompt snapshot tests per role × 3 phases (token count ≤ cap), `agent-selector.test.ts` phase cases, dispatcher test with stub `modelCaller` returning a valid chapter, prompt-eval fixtures `TBR-<dim>-v2.0.0.json` × 8.
- Cost guardrails: per-report call counter with hard stop at tier max; `budgetOk()` degrade path tested. Rollback: `REPORT_PIPELINE_W4=off` returns to 13-criteria assembly (adapter from S-R1 still renders).

### S-R3 — Pipeline unification + GATHER un-stub + valuation in body
- Files: `api/svi/dimensions/stream/route.ts` (thin wrapper over `runReportPipeline` + SSE), `api/svi/dimension-analyze/route.ts` (per-dim re-run), `orchestrator.ts` GATHER (`deepTechAudit`, `auditGitHubRepo`, connector snapshots, `buildVcValuationReport`, grants match), `valuation-chapter.ts` (new builder), delete `estimateValuationRange` + TBR three-case table, `run-for-project.ts` persists `report_v2`, `svi_deck_cache` key + pipelineVersion.
- Migration: `svi_deck_cache.pipeline_version text`, index.
- Tests: route test (SSE event order identical to today's vocabulary), orchestrator integration with mocked audits, valuation chapter unit test (6 methods, weights sum 1 excluding scorecard, pre-revenue path), `npm run qa:live` (creates account → free report → A$3 report → 8 svgs).
- Cost guardrails: GATHER timeouts 20 s, cached 24 h; standard COGS check in `ai-spend-daily.json` ≤ A$0.60 median for 3 days. Rollback: `REPORT_GENERATOR=legacy_stream` env keeps the old route file for one release (not deleted until S-R4 smoke passes).

### S-R4 — PDF / DOCX / email parity + Investor Dossier render
- Files: `lib/pdf/svi-report-pdf.tsx` → `tbr-pdf.tsx` reading `ReportV2` (react-pdf `<Svg>` twins from `report-visuals`), `lib/docx/svi-report-docx.ts` → chapters + `ImageRun` from cached SVG→PNG, `lib/svi/email-report.ts` (cover + 3 questions + weakest chapter + CTA), `workspace/evaluations/[id]/dossier.tsx` (ReportV2 + mandate fit + decision record + Δ since last view), `report-quota`/credits unchanged, `page-count.ts` for free tier.
- Migration: `evaluation_reports.report_v2 jsonb` (or FK to snapshot), `investor_decisions` re-use (schema exists, unused).
- Tests: pdf snapshot page count, docx opens (existing test pattern), email HTML has inline SVG/PNG, dossier hydrated smoke as evaluator persona, GA4 events `dossier_view`, `investor_decision_saved`.
- Cost guardrails: SVG→PNG render batched once per report, cached in storage. Rollback: old PDF route behind `?v=1` for one release.

### S-R5 — Comparables + connectors + eval harness
- Files: `lib/data/au-comparable-raises.ts` → table-backed `lib/valuation/comparables-repo.ts`; ingest script `scripts/comparables/ingest-public-roundups.mjs` (allow-list, dedupe, `status=pending`), admin review page; `oauth-ga4-signals.ts` richer pull; LinkedIn upload/URL parser `lib/connectors/linkedin-upload.ts` + evidence wizard step; `svi-analysis.ts computeSVI` cap-table input + `cfo-esop-scoring` bridge; `scripts/prompt-eval-nightly` extended to TBR fixtures with grounded-share and visual-kind assertions; admin tile for the 5 KPIs.
- Migration: `au_comparable_raises` (+ verified view feeding `comparables.n`), `founder_signals`, `ga4_signal_snapshots` columns.
- Tests: ingest dedupe/unit, comparables N in valuation chapter, GA4 funnel builder, LinkedIn parser fixtures (3 PDFs), computeSVI CGH delta test, nightly eval dry-run passes on 24 fixtures.
- Cost guardrails: ingest is cron weekly, no LLM (regex + admin review); optional LLM extraction capped 50 items/week on free chain. Rollback: comparables repo falls back to the static 33 when the table is empty; copy shows the live count either way.

### F.6 Risk register (senior-pm: probability × impact 1–5, category weight; response)

| # | Risk | P | I | Cat (w) | Score | Response |
|---|---|---|---|---|---|---|
| R1 | W4 adds 8 calls → free-chain rate limits at peak (429 bursts already seen in stream route history) | 4 | 3 | Technical 1.2 | 14.4 | Mitigate: W4 concurrency 4, `interactive` throughput ordering (782d62e), chapter cache, degrade-to-card path |
| R2 | Chapter score drifts from `computeSVI` and founders see two numbers | 3 | 4 | Business 1.0 | 12 | Mitigate: ± 10 clamp, deterministic wins, "reconciled" note; consistency test in CI |
| R3 | PDF/DOCX parity slips (react-pdf SVG subset lacks `<pattern>`/text-on-path) | 3 | 3 | Technical 1.2 | 10.8 | Transfer/mitigate: `report-visuals` limited to primitives react-pdf supports (path, rect, circle, text, line); snapshot tests per kind |
| R4 | Comparables ingest violates a source's ToS | 2 | 4 | Business 1.0 | 8 | Avoid: allow-list only public roundups/press releases/ASX; store facts + source URL, no article text; CLO review of the allow-list |
| R5 | Old snapshots lack `report_v2`; public `/tbr/[token]` links break | 2 | 5 | Technical 1.2 | 12 | Mitigate: adapter builds v2 from `dim_results/criterion_results` on read (S-R1); smoke on 5 oldest live tokens |
| R6 | Free report exceeds 10 pages once chapters carry visuals | 3 | 2 | Scope 1.0 | 6 | Accept + gate: `page-count.ts` assertion, cards for chapters 6–9, chart height caps |
| R7 | Knowledge blocks push prompts past the free models' context (8k on some providers) | 3 | 3 | Technical 1.2 | 10.8 | Mitigate: per-block token caps (≤ 3.5k system total), provider class `long_context` for CEO/CFO, snapshot tests count tokens |
| R8 | "Trusted Business Report" rename breaks SKU/analytics keys | 2 | 3 | Schedule 1.0 | 6 | Accept: rename UI strings only; SKU keys and GA4 event names unchanged |
| R9 | Autonomous `git reset --hard` loop wipes uncommitted sprint work | 4 | 4 | Resource 1.1 | 17.6 | Mitigate: commit + push after every file group; worktree per sprint via `scripts/cleanup-merged-worktrees.sh` rules |

Contingency: moderate appetite → 15–20 % schedule reserve = one extra half-session after S-R3 for review → test → fix (the founder's deploy cadence already budgets it).

### F.7 RACI for the merge into the source of truth
| Artefact | R | A | C | I |
|---|---|---|---|---|
| `docs/plans/SOURCE-OF-TRUTH.md` G13 entry + register rows G13-P1…P5 | PM (this plan) | Founder | CPO, CTO agents | all C-level |
| `docs/ROADMAP.md` §4 row, `.claude/goals/feature-upgrade-roadmap-v2.md`, `GOALS.md` | PM | Founder | CMO (copy) | — |
| Goal doc `docs/plans/trusted-business-report-v2-2026-09-15.md` (this file, trimmed of code-read notes) | PM | Founder | CFO (valuation), CLO (claims) | — |
| Superseded notes in `.claude/goals/report-v2-compelling.md`, `sub-agent-report-pipeline.md`, `svi-analysis-agent-master.md` | PM | — | — | — |
| `web/content/reports/clevel-kpi-matrix.json` roles note (report agents = 11 + auditor) | CTO agent | PM | — | ops |

Cross-sprint acceptance: after S-R3 a standard TBR = 8 chapters × ≥ 1 SVG, valuation 5 methods in body, grounded share ≥ 80 %, COGS ≤ A$0.60, ≤ 120 s; after S-R4 identical structure on web/PDF/DOCX/email/dossier; after S-R5 comparables copy true and nightly eval green. Doc merge (house rule): new SOT entry **G13 — Trusted Business Report v2**, ROADMAP §4 row, `.claude/goals/feature-upgrade-roadmap-v2.md`, GOALS.md, goal doc `docs/plans/trusted-business-report-v2-2026-09-15.md`; amend `.claude/goals/report-v2-compelling.md` and `sub-agent-report-pipeline.md` as superseded-by-G13.

---

## Executive summary (10 lines)
1. Today two generators exist; the one customers see (generic persona in the stream route) ignores the 11 C-level agents, the 31k lines of domain modules, the knowledge base and the auditor — and every chapter is text-only because `visuals: []` is hardcoded.
2. Fix = one JSON contract, **ReportV2**, produced once by the C-level pipeline and rendered by every surface (web TBR, PDF, DOCX, Investor Dossier, email); no surface computes or prompts.
3. Report shape is canonical: cover (ring + radar + where/worth/next) → CEO summary → 8 dimension chapters in weight order, each with owner agent, score/band/percentile, mandatory SVG, evidence table, criterion cards, S/G/next, auditor stamp → 5-method valuation → 13×12 phase gates → money on the table → 90-day plan → appendix.
4. Ownership gaps closed: TRE→CRO, MPC→CMO, FTV→CHRO, PTD→CTO, **CGH→CFO, IRI→CLO, LCO→CLO, SVM→CEO**; CDO = evidence & cohort officer on every chapter; CISO/COO always-on deterministic cards (scale-only rule retired).
5. Prompts get real know-how: role card + phase lens (`GROWTH_PHASES`, `PHASE_EXIT_RULES`) + skill addon + `.claude/knowledge-base` + `agent_knowledge_base` + deterministic module outputs (`cfo-valuation`, `cfo-esop-scoring`, `clo-compliance`, `ciso-security`, `cohort-percentile`…), loaded from `prompt_versions` templates and evaluated nightly on 24 new fixtures.
6. Visuals are deterministic SVG from a shared `report-visuals/` package (reusing ring, radar, range, heatmap, route map, funnel; building donut, gauge, gantt, 2×2, scatter); AI images leave the scored body; a11y tables and a colour-blind palette are mandatory.
7. GATHER stubs are replaced by real tech/repo audits and connector snapshots; new evidence paths: LinkedIn upload/URL, richer GA4, cap table → CGH, comparables table.
8. Cost stays inside A$3: ≤ 30 calls on the free chain with CEO/CFO chapters optionally on a paid Sonnet-class model, COGS ≤ A$0.60, ≤ 120 s, chapter-level caching for weekly Δ; quality gates = schema, ≥ 80 % grounded, score/valuation consistency, 8 visuals, page budget.
9. Sales: one naming system (SVI / Trusted Business Report / Investor Dossier), a clear tier matrix, CTAs at score/evidence/weekly-Δ/investor-view moments, EN/VI messaging, the G12 "why not ChatGPT" paragraph, and the "500+ comparables" claim replaced by a live count until the table reaches 500.
10. Five deploy-immediately sprints: S-R1 contract + visuals + web chapters → S-R2 ownership + knowledge + phase → S-R3 unification + GATHER + valuation → S-R4 PDF/DOCX/email/Dossier parity → S-R5 comparables + connectors + eval harness; merged into SOT as G13.
