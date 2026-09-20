// Agent Dispatcher — Parallel AI call dispatch for multi-agent report generation.
//
// Dispatches analysis requests to AI providers and handles wave-based
// parallelism (Wave 1 → Wave 2 → Wave 3).
//
// G7 (Master Upgrade Plan): every C-Level agent response is now validated
// against the canonical Zod contracts in @/lib/ai/schemas via
// callStructured() — schema parse, ONE repair pass, and an `ai_runs` audit
// row (migration 0231) per call. The model still runs on the injected free
// provider chain: callStructured's `modelCaller` transport hook wraps the
// pipeline's callAI, so validation costs nothing extra per report.
//
// Degradation contract: if the structured call fails twice (schema_fail,
// model_error, rate_limited) the agent falls back to ONE plain-prose call
// with the legacy regex extraction, and the result is explicitly marked
// `schemaValidated: false` + `degraded: true` with a halved confidence.
// A paying customer never loses the whole report because one of twelve
// agents mis-formatted, and a mis-formatted answer is never presented as
// if it had been validated.

import { evidenceIdFor } from "./evidence-ids";

import { z } from "zod";

import type {
  AgentRole,
  AgentAnalysisResult,
  ReportContext,
  ReportTier,
  CriterionData,
  EvidenceCatalogueEntry,
} from "./types";
import type { CriterionKey } from "@/lib/evaluation-criteria";
import { CRITERIA } from "@/lib/evaluation-criteria";
import { PHASE_EXIT_RULES } from "@/lib/growth/phase-gate";
import { GROWTH_PHASE_LABELS } from "@/lib/growth/phase-taxonomy";
import type { CriterionCard, DimensionChapter, EvidenceRow, EvidenceStatus, ReportTierV2 } from "@/lib/report-v2/schema";
import { percentileFor, qualityFromScore, scoreBreakdownFromSub } from "@/lib/report-v2/adapter";
import { ctaForCriterion } from "@/lib/report-v2/evidence-cta";
import { chooseNextAction, dedupeAgainstCards, reconcileLlmNextAction, type NextActionInput } from "@/lib/report-v2/next-action";
import { bandFor } from "@/lib/report-visuals";
import { getSupabaseAdmin } from "@/lib/supabase";
import { buildAgentPrompt, promptTemplateFromRow, resolvePhaseId } from "./agent-prompts";
import { buildAuMarketAnchorBlock } from "./au-market-anchor";
import { modelForAgent } from "./agent-model-tiers";
import { generateChartsV2, generateCriterionVisual, type LlmVisualProposal } from "./chart-generator";
import { benchmarkFor, benchmarkStageForSvi, criteriaForDimension, DIM_ORDER, DIMENSION_OWNERS, type DimKey, type EvidenceSource } from "./dimension-owners";
import { loadAgentKnowledgeRows, type AgentKnowledgeRow, type KnowledgeDb } from "./knowledge-loader";
import { evidenceHashFor } from "./chapter-cache";
import { precomputeModulesForDim, type ModuleOutput } from "./module-precompute";
import { REPORT_TIER_CONFIG } from "./types";
import {
  callStructured,
  type StructuredModelCaller,
} from "@/lib/ai/call-structured";
import {
  AreaEnum,
  AssessmentFinding,
  ReportSection as ReportSectionSchema,
  RiskFinding,
  type Area,
} from "@/lib/ai/schemas";
import { readCurrentPrompt } from "@/lib/ai/prompt-registry";

/** S31-A task class hint — CEO/CFO chapters pass "report" when F4 is on (see MODEL_AGENT_*). */
export type AITaskClassHint = "classify" | "report" | "synthesis";

type AICaller = (
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  taskClass?: AITaskClassHint,
) => Promise<string>;

/** Placeholder used when no prod prompt_versions row exists for an agent. */
export const NIL_PROMPT_VERSION_ID = "00000000-0000-0000-0000-000000000000";

// ── Wave Definitions ────────────────────────────────────────────────────────

interface WaveTask {
  agentRole: AgentRole;
  criterion: CriterionKey;
  /** agent-selector: phase-required criteria get the full token budget. */
  budget?: "standard" | "large";
}

/** Wave 1: Independent analyses — no dependencies */
export const WAVE_1: WaveTask[] = [
  { agentRole: "cto", criterion: "code_git" },
  { agentRole: "cmo", criterion: "market" },
  { agentRole: "chro", criterion: "founder_profile" },
  { agentRole: "cfo", criterion: "revenue" },
  { agentRole: "cro", criterion: "customer_size" },
  { agentRole: "clo", criterion: "documents" },
];

/** Wave 2: Depends on Wave 1 data */
export const WAVE_2: WaveTask[] = [
  { agentRole: "cpo", criterion: "idea" },
  { agentRole: "cmo", criterion: "website" },
  { agentRole: "cmo", criterion: "gtm_strategy" },
  { agentRole: "chro", criterion: "team" },
  { agentRole: "clo", criterion: "dataroom" },
  { agentRole: "chro", criterion: "team_structure" },
];

/** Wave 3: Depends on Wave 1 + Wave 2 */
export const WAVE_3: WaveTask[] = [
  { agentRole: "cpo", criterion: "roadmap" },
];

// ── Criterion → §6 evaluation area ──────────────────────────────────────────
//
// The canonical schemas key every finding by one of the twelve §6 areas.
// The pipeline is organised by the 13 SVI criteria, so the dispatcher owns
// this mapping. Boundary adaptation lives here — schemas.ts stays canonical.

export const CRITERION_AREA: Record<string, Area> = {
  idea: "product",
  market: "market",
  founder_profile: "team",
  code_git: "tech",
  website: "product",
  team: "team",
  customer_size: "traction",
  gtm_strategy: "market",
  documents: "governance",
  revenue: "financials",
  dataroom: "governance",
  team_structure: "team",
  roadmap: "product",
};

export function areaForCriterion(criterion: CriterionKey): Area {
  return CRITERION_AREA[criterion] ?? "risk";
}

// ── Evidence catalogue ──────────────────────────────────────────────────────
//
// Every citation the schemas demand is an (evidence_id, quote) tuple, and
// evidence_id must be a uuid the renderer can cross-check against
// ai_runs.evidence_ids. The pipeline's evidence (description, per-criterion
// text, files, links, gather results) has no uuid of its own, so the
// dispatcher mints a deterministic one per evidence item: a SHA-256 of the
// item's identity, shaped as an RFC-4122 v4 uuid. Deterministic means the
// same evidence yields the same id on a re-run, so citations stay stable.

// S-R3: the minting lives in ./evidence-ids.ts so GATHER can share it
// without importing the dispatcher; re-exported here for existing callers.
export { evidenceIdFor };

export function buildEvidenceCatalogue(
  criterion: CriterionKey,
  context: ReportContext,
): EvidenceCatalogueEntry[] {
  const entries: EvidenceCatalogueEntry[] = [];
  const push = (kind: string, label: string, content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;
    entries.push({
      evidence_id: evidenceIdFor(`${criterion}|${kind}|${label}`),
      label,
      content: trimmed.slice(0, 2000),
    });
  };

  push("description", "Startup description", context.rawText);

  const data = context.criteriaData[criterion];
  if (data?.textInput) push("criterion_text", `Founder evidence: ${criterion}`, data.textInput);
  for (const f of data?.files ?? []) {
    push("file", `Uploaded file: ${f.name}`, `${f.name} (${f.type}, ${f.size} bytes)`);
  }
  for (const l of data?.links ?? []) {
    push("link", `Link: ${l.label}`, `${l.label} — ${l.url}`);
  }

  const gr = context.gatherResults;
  if (criterion === "code_git" && gr.repoAudit) {
    push("repo_audit", "GitHub repository audit", JSON.stringify(gr.repoAudit));
  }
  if (criterion === "website" && gr.techAudit) {
    push("tech_audit", "Technical audit", JSON.stringify(gr.techAudit));
  }
  if (criterion === "market" && gr.competitiveResearch) {
    push("competitive", "Competitive research", JSON.stringify(gr.competitiveResearch));
  }
  if (gr.scrapedData && (criterion === "website" || criterion === "idea")) {
    push("scraped", "Scraped website data", JSON.stringify(gr.scrapedData));
  }

  push(
    "svi_scores",
    "SVI dimension scores",
    context.sviAnalysis.subs
      .map((s: { label: string; value: number }) => `${s.label}: ${s.value}/100`)
      .join("; "),
  );

  return entries;
}

// ── Boundary payload ────────────────────────────────────────────────────────
//
// The canonical schemas describe findings, risks and prose sections; the
// pipeline's AgentAnalysisResult additionally wants presentation-only
// highlights and data points. Rather than widening schemas.ts (canonical,
// separately tested), the dispatcher composes the canonical pieces into a
// boundary payload and adapts the result on the way out.

export const AgentAnalysisPayload = z.object({
  finding: AssessmentFinding,
  section: ReportSectionSchema,
  risks: z.array(RiskFinding).max(5).default([]),
  highlights: z.array(z.string().min(1)).max(5).default([]),
  data_points: z.record(z.string(), z.string()).default({}),
});
export type AgentAnalysisPayload = z.infer<typeof AgentAnalysisPayload>;

/** Zod shape for the dispatcher's own input — validated by callStructured. */
const DispatchInput = z.object({
  criterion: z.string().min(1),
  agentRole: z.string().min(1),
  area_id: AreaEnum,
  prompt: z.string().min(1),
  evidence: z.array(
    z.object({
      evidence_id: z.string().uuid(),
      label: z.string(),
      content: z.string(),
    }),
  ),
});
type DispatchInput = z.infer<typeof DispatchInput>;

const OUTPUT_CONTRACT = `
## MACHINE-READABLE OUTPUT CONTRACT (mandatory)

Return ONLY a single JSON object. No prose outside it, no markdown fences.

{
  "finding": {
    "area_id": "<one of: identity|governance|financials|product|traction|market|team|tech|risk|ip|compliance|esg>",
    "title": "<attractive section title>",
    "detail": "<1-3 sentence summary of the key finding>",
    "proposed_score": <integer 0-100>,
    "confidence": <number 0-1>,
    "hallucination_risk": "low|medium|high",
    "citations": [{ "evidence_id": "<uuid from the EVIDENCE CATALOGUE>", "quote": "<verbatim excerpt>" }],
    "actions": [{ "window": "30d|60d|90d", "title": "<action>", "effort": "low|medium|high", "owner": "<role>" }]
  },
  "section": {
    "area_id": "<same area_id>",
    "heading": "<section heading>",
    "body_markdown": "<the analysis in markdown with ### sub-headings — see the HARD LIMIT on words below>",
    "citations": [{ "evidence_id": "<uuid from the EVIDENCE CATALOGUE>", "quote": "<verbatim excerpt>" }],
    "confidence": <number 0-1>,
    "hallucination_risk": "low|medium|high"
  },
  "risks": [{ "area_id": "<area>", "title": "<risk>", "severity": "low|medium|high|critical", "likelihood": "low|medium|high", "impact": "low|medium|high", "mitigation": "<plan>", "confidence": <0-1>, "hallucination_risk": "low|medium|high", "citations": [{ "evidence_id": "<uuid>", "quote": "<excerpt>" }] }],
  "highlights": ["<up to 5 one-line highlights>"],
  "data_points": { "<label>": "<value>" }
}

RULES:
- Every evidence_id MUST be copied verbatim from the EVIDENCE CATALOGUE below. Never invent one.
- Every quote MUST appear verbatim in the cited evidence item.
- If the evidence does not support a specific number, do not state one.
- Inside "body_markdown", every MATERIAL claim (money, percentage, count, growth
  rate, multiple, ARR/MRR/TAM-style metric) must be followed by an inline marker
  [ev:<evidence_id>] copied from the catalogue — or, if nothing supports it,
  be written with an explicit "(unevidenced)" marker. The grounding auditor
  rejects material claims that carry neither.
`.trim();

function renderStructuredUser(input: DispatchInput): string {
  const catalogue = input.evidence
    .map(e => `### evidence_id: ${e.evidence_id}\n**${e.label}**\n${e.content}`)
    .join("\n\n");
  return [
    input.prompt,
    `## EVIDENCE CATALOGUE (the only citable sources)\n${catalogue}`,
    OUTPUT_CONTRACT,
    `The area_id for this analysis is "${input.area_id}".`,
  ].join("\n\n");
}

// ── Dispatch options ────────────────────────────────────────────────────────

export interface DispatchOptions {
  /** Report deadline probe — when true, late wave results are dropped instead of written to the context. */
  isExpired?: () => boolean;
  /** ai_runs.purpose — defaults to customer_report. */
  purpose?: string;
  /** ai_runs.business_id (projects.id). */
  businessId?: string | null;
  /** ai_runs.user_id (app_users.id). */
  userId?: string | null;
  /** ai_runs.model label. Defaults to the free-chain marker. */
  model?: string;
  /** Resolve prompt_versions.id for an agent. Defaults to the prod row. */
  resolvePromptVersionId?: (agentRole: AgentRole) => Promise<string>;
  /**
   * Transport for the structured call. Defaults to an adapter over the
   * injected callAI, so structured validation runs on the same free
   * provider chain (and therefore the same budget) as before.
   */
  modelCaller?: StructuredModelCaller;
  /** Kill switch: false skips validation and uses the legacy prose path. */
  structured?: boolean;

  // ── G13-W2-R2 ──────────────────────────────────────────────────────────
  /** Report tier v2 ("free" turns chapters 6–9 into cards). Defaults from `tier`. */
  tierV2?: ReportTierV2;
  /** Per-report call counter; `tryAcquire()` false → no more LLM calls this report. */
  callBudget?: CallBudget;
  /** Monthly-budget predicate (ai-client). False → deterministic cards, never a failed report. */
  budgetOk?: () => boolean;
  /** Streams each finished chapter (SSE `dimension_complete`). */
  onChapter?: (dim: DimKey, chapter: DimensionChapter) => void;

  // ── G13-W5-R5 (§C.8 chapter-level cache) ─────────────────────────────
  /** Chapter cache keyed (projectId, dim, evidenceHash, pipelineVersion); absent → no caching. */
  chapterCache?: import("./chapter-cache").ChapterCache;
  /** Cache key ingredients; the cache is skipped without a projectId. */
  chapterCacheScope?: { projectId: string | null; pipelineVersion: string };
  /** Per-dimension re-runs set this so the founder always gets a fresh chapter. */
  chapterCacheBypass?: boolean;
  /** `agent_knowledge_base` reader; defaults to the admin client, `null` disables. */
  knowledgeDb?: KnowledgeDb | null;
  /** Resolve the slotted prompt template for a role (prompt_versions). Defaults to the prod row. */
  resolvePromptTemplate?: (agentRole: AgentRole) => Promise<string | null>;
  /** S-R3 partial re-run: only these dimensions get an owner call (others keep whatever the map holds). */
  dims?: DimKey[];
}

/** Minimal call-counter contract the orchestrator implements (hard stop at tier max). */
export interface CallBudget {
  tryAcquire(): boolean;
  readonly used: number;
  readonly max: number;
}

/** Adapter: pipeline callAI → structured transport with a task-class hint (F4: CEO/CFO on Sonnet-class). */
export function callAIToModelCallerWithClass(
  callAI: AICaller,
  maxTokens: number,
  taskClass: AITaskClassHint | undefined,
): StructuredModelCaller {
  const base = callAIToModelCaller((sys, user, max) => callAI(sys, user, max, taskClass), maxTokens);
  return base;
}

/**
 * F4 (founder decision, default yes): the CEO + CFO chapters may run on a
 * Sonnet-class model inside the A$3 COGS envelope when `MODEL_AGENT_CEO` /
 * `MODEL_AGENT_CFO` is set — routed through the existing callAI task classes
 * ("report" → Sonnet 5 on the quality tier). Never a new provider path.
 */
export function taskClassForChapter(role: AgentRole, tier: ReportTierV2): AITaskClassHint | undefined {
  if (role !== "ceo" && role !== "cfo") return undefined;
  const env = process.env[`MODEL_AGENT_${role.toUpperCase()}`];
  if (!env || env.length === 0) return undefined;
  if (tier === "free") return undefined;
  return "report";
}

/** Adapter: pipeline callAI (single-turn string) → structured transport. */
export function callAIToModelCaller(
  callAI: AICaller,
  maxTokens: number,
): StructuredModelCaller {
  return async ({ system, messages }) => {
    // callAI is single-turn; flatten the repair conversation into one turn.
    const user = messages
      .map(m =>
        m.role === "assistant"
          ? `## Your previous response (rejected)\n${m.content}`
          : m.content,
      )
      .join("\n\n");
    try {
      const text = await callAI(system, user, maxTokens);
      return {
        ok: true,
        text,
        // The free chain does not report usage; estimate ~4 chars/token so
        // the ai_runs row still carries usable volume data.
        tokensIn: Math.ceil((system.length + user.length) / 4),
        tokensOut: Math.ceil((text ?? "").length / 4),
      };
    } catch (err) {
      return {
        ok: false,
        status: "model_error",
        reason: err instanceof Error ? err.message : String(err),
      };
    }
  };
}

/**
 * W2 review (e): the prompt_versions lookup is memoised for 10 minutes, not
 * for the process lifetime — a canary promotion / rollback reaches a running
 * server without a restart (the old cache pinned the boot-time row forever).
 */
export const PROMPT_VERSION_CACHE_TTL_MS = 10 * 60_000;
const promptVersionCache = new Map<string, { id: string; template: string | null; at: number }>();

async function defaultPromptRow(agentRole: AgentRole, now: number = Date.now()): Promise<{ id: string; template: string | null }> {
  const cached = promptVersionCache.get(agentRole);
  if (cached && now - cached.at < PROMPT_VERSION_CACHE_TTL_MS) return { id: cached.id, template: cached.template };
  try {
    const row = await readCurrentPrompt(`report-${agentRole}`);
    const entry = { id: row?.id ?? NIL_PROMPT_VERSION_ID, template: promptTemplateFromRow(row) };
    promptVersionCache.set(agentRole, { ...entry, at: now });
    return entry;
  } catch {
    // A failed lookup is not cached — the next call retries.
    return cached ? { id: cached.id, template: cached.template } : { id: NIL_PROMPT_VERSION_ID, template: null };
  }
}

/** Test seam — the memoised prompt row for a role, with its cache timestamp. */
export function peekPromptVersionCache(agentRole: AgentRole): { id: string; template: string | null; at: number } | undefined {
  return promptVersionCache.get(agentRole);
}

async function defaultPromptVersionId(agentRole: AgentRole): Promise<string> {
  return (await defaultPromptRow(agentRole)).id;
}

/** Slotted template from the prod prompt_versions row (null → code default). */
async function defaultPromptTemplate(agentRole: AgentRole): Promise<string | null> {
  return (await defaultPromptRow(agentRole)).template;
}

/** Test seam — drops the memoised prompt_versions lookups. */
export function resetPromptVersionCache(): void {
  promptVersionCache.clear();
}

/**
 * G19-S46 (measured 2026-09-20 on BlockID's own standard-tier run): the
 * structured OUTPUT_CONTRACT (finding + `body_markdown` section + risks +
 * citations) at the old "500-1500 words" target ran to 3,600+ tokens
 * (JSON-escaped markdown ≈ 3.8 chars/token) while the standard tier handed the
 * structured call `1500 × 0.85 = 1275` — every first answer was cut mid-JSON
 * ("Unterminated string at position 4720"), the repair pass was cut the same
 * way, and each criterion fell back to a third, prose-only call: 3× the
 * calls, a halved confidence on every section, groundedShare 0.14–0.41 and
 * the W4 chapters starved of budget → `ReportFullyDegradedError`. Two-sided
 * fix: the prompt now carries a HARD per-section limit (agent-prompts
 * TIER_WORDS, standard 400-700 words) and the structured call gets at least
 * STRUCTURED_MIN_OUTPUT_TOKENS whatever the tier (headroom for 700 words of
 * JSON-escaped markdown + finding + risks; cents at DeepInfra rates); the
 * prose fallback keeps the tier's own size.
 */
export const STRUCTURED_MIN_OUTPUT_TOKENS = 2600;

/** Per-section word cap quoted inside the JSON contract (mirrors agent-prompts TIER_WORDS upper bounds). */
export const STRUCTURED_SECTION_WORD_CAP: Record<ReportTierV2, number> = { free: 350, standard: 700, premium: 1200, investor_memo: 1500 };

/** The OUTPUT_SCHEMA slot for a structured W1–W3 call: the JSON contract with the tier's hard word cap. */
export function structuredOutputSchema(tier: ReportTierV2 | ReportTier): string {
  const cap = STRUCTURED_SECTION_WORD_CAP[tier as ReportTierV2] ?? STRUCTURED_SECTION_WORD_CAP.standard;
  return `${OUTPUT_CONTRACT.trim()}\n\nHARD LIMIT: "body_markdown" is at most ${cap} words — stop and close the JSON before it. Return the JSON object only.`;
}

export function structuredMaxTokens(tier: ReportTier, budget: WaveTask["budget"]): number {
  const tierConfig = REPORT_TIER_CONFIG[tier];
  const tierTokens = budget === "large" ? tierConfig.maxTokensPerAgent : Math.round(tierConfig.maxTokensPerAgent * 0.85);
  return Math.max(tierTokens, STRUCTURED_MIN_OUTPUT_TOKENS);
}

// ── Dispatch a Single Agent Analysis ────────────────────────────────────────

async function dispatchAgent(
  task: WaveTask,
  context: ReportContext,
  tier: ReportTier,
  callAI: AICaller,
  opts: DispatchOptions = {},
): Promise<AgentAnalysisResult> {
  const startTime = Date.now();
  const tierConfig = REPORT_TIER_CONFIG[tier];
  const maxTokens = structuredMaxTokens(tier, task.budget);

  const template = await (opts.resolvePromptTemplate ?? defaultPromptTemplate)(task.agentRole);
  // G19-S46: the structured call's system prompt carries the JSON contract in
  // its OUTPUT_SCHEMA slot (like W4). It used to carry the legacy markdown
  // "## Output Format" while the user turn asked for JSON — DeepSeek-class
  // models followed the system prompt, every first answer was markdown
  // (`<!-- SCORE: XX -->`), the repair pass re-typed the essay as JSON and
  // overran the budget, and each criterion cost three calls.
  const systemPrompt = buildAgentPrompt(task.agentRole, context, {
    criterion: task.criterion,
    phaseId: context.phaseGate?.currentPhase,
    tier: opts.tierV2 ?? tier,
    template,
    ...(opts.structured === false ? {} : { outputSchema: structuredOutputSchema(opts.tierV2 ?? tier) }),
  });
  const userPrompt = buildUserPrompt(task.criterion, context);

  if (opts.structured === false) {
    return legacyProseDispatch(task, context, tier, callAI, startTime, {
      degraded: false,
      note: null,
    });
  }

  const evidence = buildEvidenceCatalogue(task.criterion, context);
  const allowedIds = new Set(evidence.map(e => e.evidence_id));
  const promptVersionId = await (opts.resolvePromptVersionId ??
    defaultPromptVersionId)(task.agentRole);

  const structured = await callStructured({
    promptVersionId,
    agent: `report-${task.agentRole}`,
    model: opts.model ?? modelForAgent(task.agentRole),
    inputSchema: DispatchInput,
    outputSchema: AgentAnalysisPayload,
    input: {
      criterion: task.criterion,
      agentRole: task.agentRole,
      area_id: areaForCriterion(task.criterion),
      prompt: userPrompt,
      evidence,
    },
    systemPrompt,
    renderUser: renderStructuredUser,
    businessId: opts.businessId ?? null,
    userId: opts.userId ?? null,
    purpose: opts.purpose ?? "customer_report",
    evidenceIds: [...allowedIds],
    modelCaller:
      opts.modelCaller ?? callAIToModelCaller(callAI, maxTokens),
  });

  if (structured.ok) {
    return adaptPayload(task, context, structured.data, allowedIds, {
      runId: structured.runId,
      durationMs: Date.now() - startTime,
    });
  }

  // Repair pass failed (or the provider errored). Degrade: one plain-prose
  // call, legacy extraction, explicitly marked unvalidated + low confidence.
  return legacyProseDispatch(task, context, tier, callAI, startTime, {
    degraded: true,
    note: structured.reason,
    runId: structured.runId,
  });
}

// ── Boundary adapter: validated payload → AgentAnalysisResult ───────────────

function adaptPayload(
  task: WaveTask,
  context: ReportContext,
  payload: AgentAnalysisPayload,
  allowedIds: Set<string>,
  meta: { runId: string; durationMs: number },
): AgentAnalysisResult {
  const cited = [...payload.finding.citations, ...payload.section.citations];
  const validCitations = cited.filter(c => allowedIds.has(c.evidence_id));
  const grounded = validCitations.length > 0;

  const content = renderContent(payload);
  const evidenceConfidence = computeConfidence(context.criteriaData[task.criterion]);
  let confidence = Math.min(evidenceConfidence, payload.section.confidence);
  if (!grounded) confidence *= 0.6;
  if (payload.finding.hallucination_risk === "high") confidence *= 0.7;

  const risks = payload.risks.map(
    r => `**${r.title}** (${r.severity}/${r.likelihood} likelihood) — ${r.mitigation}`,
  );
  if (!grounded) {
    risks.unshift(
      "Ungrounded analysis: the model cited no evidence id from the supplied catalogue — treat specifics with caution.",
    );
  }

  return {
    criterion: task.criterion,
    agentRole: task.agentRole,
    score: Math.min(100, Math.max(0, Math.round(payload.finding.proposed_score))),
    content,
    highlights: payload.highlights.length > 0 ? payload.highlights : [payload.finding.title],
    dataPoints: payload.data_points,
    risks,
    nextSteps: payload.finding.actions.map(
      a => `[${a.window}] ${a.title} (owner: ${a.owner}, effort: ${a.effort})`,
    ),
    visuals: [generateCriterionVisual(context, { criterion: task.criterion, agentRole: task.agentRole, score: payload.finding.proposed_score, degraded: false })],
    confidence: Math.round(confidence * 100) / 100,
    wordCount: content.split(/\s+/).filter(Boolean).length,
    durationMs: meta.durationMs,
    schemaValidated: true,
    degraded: false,
    grounded,
    citations: validCitations,
    runId: meta.runId,
  };
}

/** Render the validated payload back into the markdown the assembler renders. */
function renderContent(payload: AgentAnalysisPayload): string {
  const parts: string[] = [
    payload.section.heading,
    `> **Key Insight:** ${payload.finding.detail}`,
    payload.section.body_markdown,
  ];
  if (payload.risks.length > 0) {
    parts.push(
      "### Risks\n" +
        payload.risks
          .map(r => `- **${r.title}** (${r.severity}) — ${r.mitigation}`)
          .join("\n"),
    );
  }
  if (payload.finding.actions.length > 0) {
    parts.push(
      "### Recommended Actions\n" +
        payload.finding.actions
          .map((a, i) => `${i + 1}. [${a.window}] ${a.title} — owner: ${a.owner}`)
          .join("\n"),
    );
  }
  parts.push(`<!-- SCORE: ${Math.round(payload.finding.proposed_score)} -->`);
  return parts.join("\n\n");
}

// ── Legacy prose path (fallback / kill switch) ──────────────────────────────

async function legacyProseDispatch(
  task: WaveTask,
  context: ReportContext,
  tier: ReportTier,
  callAI: AICaller,
  startTime: number,
  flags: { degraded: boolean; note: string | null; runId?: string },
): Promise<AgentAnalysisResult> {
  const tierConfig = REPORT_TIER_CONFIG[tier];
  const systemPrompt = buildAgentPrompt(task.agentRole, context, task.criterion);
  const userPrompt = buildUserPrompt(task.criterion, context);

  try {
    const response = await callAI(systemPrompt, userPrompt, tierConfig.maxTokensPerAgent);
    const risks = extractRisks(response);
    if (flags.degraded) {
      risks.unshift(
        `Unvalidated analysis: this section failed structured validation (${flags.note ?? "unknown reason"}) and was regenerated as free text — figures are not schema-checked.`,
      );
    }
    return {
      criterion: task.criterion,
      agentRole: task.agentRole,
      score: extractScore(response),
      content: response,
      highlights: extractHighlights(response),
      dataPoints: extractDataPoints(response),
      risks,
      nextSteps: extractNextSteps(response),
      visuals: [generateCriterionVisual(context, { criterion: task.criterion, agentRole: task.agentRole, score: extractScore(response), degraded: flags.degraded })],
      confidence: flags.degraded
        ? Math.round(computeConfidence(context.criteriaData[task.criterion]) * 50) / 100
        : computeConfidence(context.criteriaData[task.criterion]),
      wordCount: response.split(/\s+/).filter(Boolean).length,
      durationMs: Date.now() - startTime,
      schemaValidated: false,
      degraded: flags.degraded,
      grounded: false,
      degradeReason: flags.note ?? undefined,
      runId: flags.runId,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    return {
      criterion: task.criterion,
      agentRole: task.agentRole,
      score: 0,
      content: `Analysis unavailable: ${errMsg}`,
      highlights: [],
      dataPoints: {},
      risks: [`Analysis failed for ${task.criterion}`],
      nextSteps: [],
      visuals: [generateCriterionVisual(context, { criterion: task.criterion, agentRole: task.agentRole, score: 0, degraded: true })],
      confidence: 0,
      wordCount: 0,
      durationMs: Date.now() - startTime,
      schemaValidated: false,
      degraded: true,
      grounded: false,
      degradeReason: flags.note ?? errMsg,
      runId: flags.runId,
    };
  }
}

// ── Dispatch a Wave (Parallel) ──────────────────────────────────────────────

export async function dispatchWave(
  tasks: WaveTask[],
  context: ReportContext,
  tier: ReportTier,
  callAI: AICaller,
  opts: DispatchOptions = {},
): Promise<AgentAnalysisResult[]> {
  const results = await Promise.all(
    tasks.map((task) => dispatchAgent(task, context, tier, callAI, opts)),
  );
  // G19-S46: per-criterion outcome line for operators (REPORT_PIPELINE_DEBUG=1)
  // — the SSE stream carries W4 chapters but never the W1–W3 results.
  if (process.env.REPORT_PIPELINE_DEBUG) {
    for (const r of results) {
      console.warn(`[report-pipeline] ${r.agentRole}/${r.criterion}: ${r.schemaValidated ? "validated" : "unvalidated"}${r.degraded ? " degraded" : ""} score=${r.score} words=${r.wordCount} ms=${r.durationMs}${r.degradeReason ? ` reason=${r.degradeReason.slice(0, 220)}` : ""}`);
    }
  }

  // Store results in context for next wave — unless the report deadline
  // already expired: the orchestrator has moved on (synthesis / assemble /
  // persist), and a late write would land criteria the stream never emitted
  // (W3 review).
  if (opts.isExpired?.()) return results;
  for (const result of results) {
    context.criterionResults.set(result.criterion, result);
  }

  return results;
}

// ── Build User Prompt ───────────────────────────────────────────────────────

function buildUserPrompt(criterion: CriterionKey, context: ReportContext): string {
  const criterionData = context.criteriaData[criterion];
  const parts: string[] = [];

  parts.push(`## Startup Description\n${context.rawText}`);

  if (criterionData?.textInput) {
    parts.push(`## Evidence for ${criterion}\n${criterionData.textInput}`);
  }

  if (criterionData?.files?.length) {
    parts.push(`## Uploaded Files\n${criterionData.files.map((f) => `- ${f.name} (${f.type})`).join("\n")}`);
  }

  if (criterionData?.links?.length) {
    parts.push(`## Links Provided\n${criterionData.links.map((l) => `- [${l.label}](${l.url})`).join("\n")}`);
  }

  // Include relevant gather results
  const gr = context.gatherResults;
  if (criterion === "code_git" && gr.repoAudit) {
    parts.push(`## GitHub Repository Audit\n${JSON.stringify(gr.repoAudit, null, 2)}`);
  }
  if (criterion === "website" && gr.techAudit) {
    parts.push(`## Technical Audit\n${JSON.stringify(gr.techAudit, null, 2)}`);
  }
  if (criterion === "market") {
    const anchor = buildAuMarketAnchorBlock({
      rawText: `${context.rawText}\n${criterionData?.textInput ?? ""}`,
    });
    if (anchor) parts.push(anchor);
    if (gr.competitiveResearch) {
      parts.push(`## Competitive Research\n${JSON.stringify(gr.competitiveResearch, null, 2)}`);
    }
  }
  if (gr.scrapedData && (criterion === "website" || criterion === "idea")) {
    parts.push(`## Scraped Website Data\n${JSON.stringify(gr.scrapedData, null, 2)}`);
  }

  // Include relevant prior wave results for Wave 2/3
  if (context.criterionResults.size > 0) {
    const relevantResults = getRelevantPriorResults(criterion, context);
    if (relevantResults.length > 0) {
      parts.push(`## Prior Analysis Context`);
      for (const r of relevantResults) {
        parts.push(`### ${r.criterion} (Score: ${r.score}/100)\n${r.highlights.join("\n")}`);
      }
    }
  }

  // SVI dimension scores
  const subs = context.sviAnalysis.subs;
  if (subs.length > 0) {
    parts.push(`## Current SVI Dimension Scores\n${subs.map((s: { label: string; key: string; value: number }) => `- ${s.label} (${s.key}): ${s.value}/100`).join("\n")}`);
  }

  return parts.join("\n\n");
}

// ── Helper: Get prior results relevant to a criterion ───────────────────────

function getRelevantPriorResults(
  criterion: CriterionKey,
  context: ReportContext,
): AgentAnalysisResult[] {
  const deps: Record<string, CriterionKey[]> = {
    idea: ["market", "code_git"],
    website: ["code_git"],
    gtm_strategy: ["market", "customer_size"],
    team: ["founder_profile"],
    dataroom: ["documents"],
    team_structure: ["team", "founder_profile"],
    roadmap: ["idea", "market", "code_git", "revenue"],
  };

  const needed = deps[criterion] ?? [];
  return needed
    .map((key) => context.criterionResults.get(key))
    .filter((r): r is AgentAnalysisResult => r !== undefined);
}

// ── Extraction Helpers ──────────────────────────────────────────────────────

function extractScore(content: string): number {
  const match = content.match(/<!--\s*SCORE:\s*(\d+)\s*-->/);
  if (match) return Math.min(100, Math.max(0, parseInt(match[1], 10)));

  // Fallback: look for "Score: XX/100" pattern
  const fallback = content.match(/Score:\s*(\d+)\s*\/\s*100/i);
  if (fallback) return Math.min(100, Math.max(0, parseInt(fallback[1], 10)));

  return 50; // Default if no score found
}

function extractHighlights(content: string): string[] {
  const highlights: string[] = [];
  const lines = content.split("\n");
  for (const line of lines) {
    if (line.match(/^\s*[-*]\s*\*\*/) && highlights.length < 5) {
      highlights.push(line.replace(/^\s*[-*]\s*/, "").trim());
    }
  }
  return highlights;
}

function extractDataPoints(content: string): Record<string, string> {
  const dataPoints: Record<string, string> = {};
  const patterns = [
    /\*\*([^*]+)\*\*:\s*(.+)/g,
    /([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)\s*=\s*([^\n,]+)/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null && Object.keys(dataPoints).length < 10) {
      dataPoints[match[1].trim()] = match[2].trim();
    }
  }
  return dataPoints;
}

function extractRisks(content: string): string[] {
  const risks: string[] = [];
  const lines = content.split("\n");
  let inRiskSection = false;
  for (const line of lines) {
    if (line.match(/###?\s*(risk|concern|warning|gap|weakness)/i)) {
      inRiskSection = true;
      continue;
    }
    if (line.match(/^###?\s/) && inRiskSection) {
      inRiskSection = false;
    }
    if (inRiskSection && line.match(/^\s*[-*]/) && risks.length < 5) {
      risks.push(line.replace(/^\s*[-*]\s*/, "").trim());
    }
  }
  return risks;
}

function extractNextSteps(content: string): string[] {
  const steps: string[] = [];
  const lines = content.split("\n");
  let inNextSteps = false;
  for (const line of lines) {
    if (line.match(/###?\s*(next\s*step|action|recommendation)/i)) {
      inNextSteps = true;
      continue;
    }
    if (line.match(/^###?\s/) && inNextSteps) {
      inNextSteps = false;
    }
    if (inNextSteps && line.match(/^\s*[-*\d]/) && steps.length < 5) {
      steps.push(line.replace(/^\s*[-*\d.]\s*/, "").trim());
    }
  }
  return steps;
}

function computeConfidence(criterionData?: CriterionData): number {
  if (!criterionData) return 0.2;
  const hasText = criterionData.textInput.trim().length > 50;
  const hasFiles = criterionData.files.length > 0;
  const hasLinks = criterionData.links.length > 0;

  let confidence = 0.2; // base: self-declared
  if (hasText) confidence = Math.max(confidence, 0.3);
  if (hasLinks) confidence = Math.max(confidence, 0.35);
  if (hasFiles) confidence = Math.max(confidence, 0.5);
  if (hasFiles && hasLinks && hasText) confidence = Math.max(confidence, 0.65);

  return confidence;
}

// ═══════════════════════════════════════════════════════════════════════════
// W4 — dimension chapters (G13-W2-R2, spec §C.1 wave design + §C.11 payload)
// ═══════════════════════════════════════════════════════════════════════════
//
// Eight owner calls in parallel, one per SVI dimension in DIM_ORDER. Input =
// the mapped W1–W3 criterion results + evidence rows + deterministic module
// outputs + phase lens (never the raw uploads again — ≈ 2.5k in / 700 out).
// Output = `DimensionChapterPayload` (Zod). callStructured gives ONE repair
// pass; a second failure, a budget stop or a provider error yields a
// deterministic card marked `degraded` — a report never fails on W4.
// Visuals are never taken from prose: `generateChartsV2` builds them from
// module outputs / evidence numbers and only accepts an owner-proposed
// series when its numbers pass the provenance pass.

const dimKeyEnum = z.enum(["tre", "mpc", "ftv", "ptd", "cgh", "iri", "lco", "svm"]);
const evidenceSourceEnum = z.enum(["stripe", "ga4", "github", "xero", "linkedin", "upload", "url", "self_declared", "founder_profile", "connector_other", "external"]);
const wordCount = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

const VisualProposal = z.object({
  kind: z.string().min(1),
  data_state: z.string().optional(),
  title: z.string().optional(),
  series: z
    .array(z.object({ label: z.string(), value: z.number().optional(), points: z.array(z.number()).optional() }))
    .max(12)
    .default([]),
});

const CriterionCardPayload = z.object({
  key: z.enum(CRITERIA.map((c) => c.key) as [CriterionKey, ...CriterionKey[]]),
  lens: dimKeyEnum.optional(),
  verdict: z.string().min(1).refine((t) => wordCount(t) <= 80, "criterion verdict must be ≤ 80 words"),
  strengths: z.array(z.string().min(1)).max(4).default([]),
  gaps: z.array(z.string().min(1)).max(4).default([]),
  next_action: z.string().default(""),
  citations: z.array(z.object({ evidence_id: z.string(), quote: z.string() })).max(6).default([]),
});

/** §C.11 owner payload — the full chapter (standard+). */
export const DimensionChapterPayload = z.object({
  dim: dimKeyEnum,
  verdict: z.string().min(1).refine((t) => wordCount(t) <= 80, "verdict must be ≤ 80 words"),
  score_adjustment: z.object({
    proposed: z.number().min(0).max(100),
    deterministic: z.number().min(0).max(100).optional(),
    reason: z.string().default(""),
  }),
  strengths: z.array(z.string().min(1).refine((t) => wordCount(t) <= 30, "≤ 30 words")).min(1).max(4),
  gaps: z.array(z.string().min(1).refine((t) => wordCount(t) <= 30, "≤ 30 words")).min(1).max(4),
  next_action: z.object({
    title: z.string().min(1),
    window: z.enum(["this_week", "30d", "90d"]).default("30d"),
    expected_lift: z.number().min(0).max(40).default(3),
    evidence_to_add: evidenceSourceEnum.optional(),
  }),
  criterion_cards: z.array(CriterionCardPayload).max(6).default([]),
  primary_visual: VisualProposal.optional(),
  secondary_visuals: z.array(VisualProposal).max(2).default([]),
  phase_lens: z
    .object({ phase_id: z.string().optional(), what_matters_now: z.string().default(""), floor: z.number().optional(), floor_met: z.boolean().optional() })
    .optional(),
  frameworks_used: z.array(z.string()).max(8).default([]),
  confidence: z.number().min(0).max(1),
  hallucination_risk: z.enum(["low", "medium", "high"]).default("medium"),
});
export type DimensionChapterPayload = z.infer<typeof DimensionChapterPayload>;

/** Free-tier card payload for chapters 6–9 (≤ 60 words, no cards / visuals). */
export const DimensionCardPayload = z.object({
  dim: dimKeyEnum,
  verdict: z.string().min(1).refine((t) => wordCount(t) <= 60, "card verdict must be ≤ 60 words"),
  score_adjustment: z.object({ proposed: z.number().min(0).max(100), deterministic: z.number().optional(), reason: z.string().default("") }),
  strengths: z.array(z.string().min(1)).min(1).max(2),
  gaps: z.array(z.string().min(1)).min(1).max(2),
  next_action: z.object({ title: z.string().min(1), window: z.enum(["this_week", "30d", "90d"]).default("30d"), expected_lift: z.number().min(0).max(40).default(3), evidence_to_add: evidenceSourceEnum.optional() }),
  confidence: z.number().min(0).max(1),
  hallucination_risk: z.enum(["low", "medium", "high"]).default("medium"),
});
export type DimensionCardPayload = z.infer<typeof DimensionCardPayload>;

/** Zod shape of the W4 user turn (§C.11 slots) — validated by callStructured; the TBR-<dim> fixtures use it as `input`. */
export const DimensionChapterInput = z.object({
  dim: dimKeyEnum,
  weight: z.number(),
  stage: z.number(),
  stageLabel: z.string(),
  phaseId: z.string(),
  benchmark: z.object({ p25: z.number(), p50: z.number(), p75: z.number(), source: z.string() }),
  deterministicScore: z.number().nullable(),
  criterionResults: z.array(
    z.object({
      key: z.string(),
      score: z.number(),
      verdict: z.string(),
      citations: z.array(z.object({ evidence_id: z.string(), quote: z.string() })),
      grounded: z.boolean(),
    }),
  ),
  evidenceRows: z.array(z.object({ id: z.string(), source: z.string(), status: z.string(), observedAt: z.string().optional(), value: z.string().optional(), label: z.string() })),
  moduleOutputs: z.array(z.object({ id: z.string(), output: z.record(z.string(), z.unknown()) })),
  phaseLens: z.object({ floor: z.number().nullable(), nextRequired: z.array(z.string()), whatMattersNow: z.string() }),
  /**
   * G19-S41: the deterministic score ledger — base, every signal with its
   * ± points and source, the confidence multiplier and the resulting SVI
   * adjustment. The owner explains the score WITH these rows and never
   * invents a signal. Optional so pre-S41 fixtures still parse.
   */
  scoreLedger: z
    .object({
      base: z.number(),
      signals: z.array(z.object({ signal: z.string(), points: z.number(), source: z.string() })),
      confidenceMultiplier: z.number(),
      adjustment: z.number(),
      assessed: z.boolean(),
    })
    .optional(),
  tier: z.string(),
  renderAs: z.enum(["full", "card"]),
});
type DimensionChapterInput = z.infer<typeof DimensionChapterInput>;

// ── W4 output contracts (the OUTPUT_SCHEMA prompt slot) ─────────────────────

export function w4OutputContract(dim: DimKey, renderAs: "full" | "card"): string {
  const owner = DIMENSION_OWNERS[dim];
  if (renderAs === "card") {
    return `## MACHINE-READABLE OUTPUT CONTRACT (mandatory) — chapter CARD
Return ONLY one JSON object, no prose outside it, no markdown fences:
{
  "dim": "${dim}",
  "verdict": "<≤ 60 words, cite evidence ids as [ev:<id>]>",
  "score_adjustment": { "proposed": <0-100 within ±10 of the deterministic score>, "reason": "<one line>" },
  "strengths": ["<≤ 20 words, end with [ev:<id>] or [unevidenced]>"],
  "gaps": ["<same rule>"],
  "next_action": { "title": "<action>", "window": "this_week or 30d or 90d", "expected_lift": <points>, "evidence_to_add": "one of stripe, ga4, github, xero, linkedin, upload, url" },
  "confidence": <0 to 1>,
  "hallucination_risk": "one of low, medium, high"
}
RULES: 1-2 strengths, 1-2 gaps. Never state a number that is not in the evidence rows or module outputs.`;
  }
  return `## MACHINE-READABLE OUTPUT CONTRACT (mandatory) — dimension chapter
Return ONLY one JSON object, no prose outside it, no markdown fences. Angle-quoted «…» parts are placeholders:
{
  "dim": "${dim}",
  "verdict": "«at most 80 words; every material claim carries [ev:«evidence_id»] or [unevidenced]»",
  "score_adjustment": { "proposed": «0-100», "deterministic": «the deterministic score you were given», "reason": "«one line»" },
  "strengths": ["«2-4 items, at most 20 words, each ending with [ev:«id»] or [unevidenced]»"],
  "gaps": ["«2-4 items, same rule»"],
  "next_action": { "title": "«one action»", "window": "this_week or 30d or 90d", "expected_lift": «SVI points», "evidence_to_add": "one of stripe, ga4, github, xero, linkedin, upload, url" },
  "criterion_cards": [{ "key": "«mapped criterion key»", "lens": "${dim}", "verdict": "«at most 60 words»", "strengths": ["…"], "gaps": ["…"], "next_action": "…", "citations": [{ "evidence_id": "«id from evidenceRows»", "quote": "«verbatim»" }] }],
  "primary_visual": { "kind": "${owner.primaryVisual}", "data_state": "one of real, partial, benchmark_only, target", "title": "«title»", "series": [{ "label": "«label»", "value": «number» }] },
  "secondary_visuals": [],
  "phase_lens": { "phase_id": "«phase»", "what_matters_now": "«one sentence»", "floor": «number or omit», "floor_met": «boolean or omit» },
  "frameworks_used": ["«from the Frameworks list»"],
  "confidence": «0 to 1»,
  "hallucination_risk": "one of low, medium, high"
}
RULES:
- "proposed" must stay within ±10 of the deterministic score; explain any move in "reason".
- primary_visual.kind must be one of: ${owner.allowedVisuals.join(", ")}. Every number in "series" MUST appear in moduleOutputs or evidenceRows (± rounding) — otherwise omit primary_visual and the deterministic chart is used.
- Never invent evidence ids; cite only ids from evidenceRows. Unsupported claims end with [unevidenced].
- Explain the score using scoreLedger (base → each signal ± points → × confidence → adjustment): name at least one ledger signal in the verdict, quote its points as given, and NEVER invent a signal, a point value or a source that is not in scoreLedger. When scoreLedger.assessed is false say plainly that the dimension is not assessed yet and what input would assess it.
- Follow the chapter template: ${owner.outputTemplate}`;
}

// ── Evidence rows (shared by W4 + the report appendix) ──────────────────────

const KIND_SOURCE: Record<string, EvidenceSource> = {
  description: "self_declared",
  criterion_text: "self_declared",
  file: "upload",
  link: "url",
  repo_audit: "github",
  tech_audit: "url",
  competitive: "connector_other",
  scraped: "url",
  svi_scores: "self_declared",
};

function dimsForCriterion(key: CriterionKey): DimKey[] {
  return DIM_ORDER.filter((d) => criteriaForDimension(d).includes(key));
}

/**
 * Evidence rows for the whole report. Ids are the SAME deterministic uuids
 * `buildEvidenceCatalogue` mints for W1–W3, so criterion citations resolve
 * against the chapter evidence tables and the appendix register.
 */
export function buildEvidenceRows(context: ReportContext): EvidenceRow[] {
  if (context.evidenceRows) return context.evidenceRows;
  const rows = new Map<string, EvidenceRow>();
  const at = new Date().toISOString();
  const add = (criterion: CriterionKey, kind: string, label: string, value: string | undefined, status: EvidenceStatus) => {
    const id = evidenceIdFor(`${criterion}|${kind}|${label}`);
    const dims = dimsForCriterion(criterion);
    const existing = rows.get(id);
    if (existing) {
      dims.forEach((d) => {
        if (!existing.dims.includes(d)) existing.dims.push(d);
      });
      return;
    }
    rows.set(id, { evidence_id: id, source: KIND_SOURCE[kind] ?? "self_declared", label, status, observedAt: at, value, dims });
  };
  CRITERIA.forEach((def) => {
    const key = def.key;
    const data = context.criteriaData[key];
    if (context.rawText.trim()) add(key, "description", "Startup description", undefined, "partial");
    if (data?.textInput?.trim()) add(key, "criterion_text", `Founder evidence: ${key}`, data.textInput.slice(0, 160), "partial");
    (data?.files ?? []).forEach((f) => add(key, "file", `Uploaded file: ${f.name}`, `${f.name} (${f.type}, ${f.size} bytes)`, "evidenced"));
    (data?.links ?? []).forEach((l) => add(key, "link", `Link: ${l.label}`, l.url, "evidenced"));
    // G19-S43: an empty criterion is a `missing` row with a linked CTA (the
    // intake page) instead of silence under a confident number.
    if (!data?.textInput?.trim() && !(data?.files ?? []).length && !(data?.links ?? []).length) {
      const id = evidenceIdFor(`${key}|criterion_missing|${def.title}`);
      if (!rows.has(id)) rows.set(id, { evidence_id: id, source: "self_declared", label: `Criterion input: ${def.title}`, status: "missing", observedAt: at, value: `No text, file or link for "${def.title}" yet`, dims: dimsForCriterion(key), cta: ctaForCriterion(key) });
    }
    const gr = context.gatherResults;
    if (key === "code_git" && gr.repoAudit) add(key, "repo_audit", "GitHub repository audit", JSON.stringify(gr.repoAudit).slice(0, 160), "evidenced");
    if (key === "website" && gr.techAudit) add(key, "tech_audit", "Technical audit", JSON.stringify(gr.techAudit).slice(0, 160), "evidenced");
    if (key === "market" && gr.competitiveResearch) add(key, "competitive", "Competitive research", undefined, "partial");
    if (gr.scrapedData && (key === "website" || key === "idea")) add(key, "scraped", "Scraped website data", undefined, "partial");
  });
  // S-R3 §C.3: every GATHER result (tech / repo audit, connector snapshots,
  // cap-table register, grants match, valuation inputs) is already an
  // EvidenceRow with `source` + `observedAt` — merge them so chapter
  // citations and the appendix register resolve to real ids.
  (context.gatherEvidenceRows ?? []).forEach((row) => {
    const existing = rows.get(row.evidence_id);
    if (existing) {
      row.dims.forEach((d) => {
        if (!existing.dims.includes(d)) existing.dims.push(d);
      });
      return;
    }
    rows.set(row.evidence_id, { ...row, dims: [...row.dims] });
  });
  const out = Array.from(rows.values());
  context.evidenceRows = out;
  return out;
}

export function evidenceRowsForDim(context: ReportContext, dim: DimKey): EvidenceRow[] {
  return buildEvidenceRows(context).filter((r) => r.dims.includes(dim));
}

// ── Chapter assembly (payload | null → DimensionChapter) ────────────────────

export interface ChapterMeta {
  runIds: string[];
  degraded: boolean;
  degradeReason?: string;
}

function dimScoreOf(context: ReportContext, dim: DimKey): number | null {
  const fromMap = context.sviAnalysis.dimensionScores?.[dim];
  if (typeof fromMap === "number" && Number.isFinite(fromMap)) return Math.round(fromMap);
  const sub = context.sviAnalysis.subs?.find((s) => s.key === dim);
  return sub && Number.isFinite(sub.value) ? Math.round(sub.value) : null;
}

/** Items must end with a citation or an explicit [unevidenced] marker (§C.11). */
export function ensureCitationSuffix(items: string[], allowedIds: Set<string>): string[] {
  return items.map((raw) => {
    const t = raw.trim();
    const ids = Array.from(t.matchAll(/\[ev:([^\]]+)\]/g)).map((m) => m[1].trim());
    const cited = ids.some((id) => allowedIds.has(id));
    if (cited) return t;
    const stripped = t.replace(/\s*\[ev:[^\]]*\]/g, "").replace(/\s*\[unevidenced\]\s*$/i, "").trim();
    return `${stripped} [unevidenced]`;
  });
}

function firstLine(text: string | undefined): string {
  if (!text) return "";
  const line = text.split("\n").map((l) => l.replace(/^#+\s*/, "").replace(/[*_`>]/g, "").trim()).find((l) => l.length > 15);
  return line ?? "";
}

function criterionCardsFor(context: ReportContext, dim: DimKey, cards: DimensionChapterPayload["criterion_cards"] | undefined, allowedIds: Set<string>, fallbackScore: number): CriterionCard[] {
  const owner = DIMENSION_OWNERS[dim];
  const keys = criteriaForDimension(dim);
  const byKey = new Map((cards ?? []).map((c) => [c.key, c]));
  const out: CriterionCard[] = [];
  keys.forEach((key) => {
    const def = CRITERIA.find((c) => c.key === key);
    const r = context.criterionResults.get(key);
    const pc = byKey.get(key);
    if (!def || (!r && !pc)) return;
    const score = r ? Math.max(0, Math.min(100, Math.round(r.score))) : fallbackScore;
    const citations = (pc?.citations ?? r?.citations ?? []).filter((c) => allowedIds.has(c.evidence_id));
    out.push({
      key,
      title: def.title,
      score,
      quality: qualityFromScore(score),
      verdict: pc?.verdict || r?.highlights[0] || firstLine(r?.content) || `${def.title} scored ${score}/100.`,
      strengths: (pc?.strengths?.length ? pc.strengths : (r?.highlights ?? []).slice(0, 3)).slice(0, 4),
      gaps: (pc?.gaps?.length ? pc.gaps : (r?.risks ?? []).slice(0, 3)).slice(0, 4),
      nextAction: pc?.next_action || r?.nextSteps[0] || "",
      citations,
      grounded: citations.length > 0 || Boolean(r?.grounded),
      agent: r?.agentRole ?? owner.primary,
    });
  });
  if (out.length === 0) {
    const key = keys[0] ?? "idea";
    const def = CRITERIA.find((c) => c.key === key);
    out.push({ key, title: def?.title ?? key, score: fallbackScore, quality: qualityFromScore(fallbackScore), verdict: `Derived from the ${owner.title} dimension score — no criterion analysis in this run.`, strengths: [], gaps: [], nextAction: "", citations: [], grounded: false, agent: owner.primary });
  }
  return out;
}

/**
 * Assemble a `DimensionChapter` from the (validated) owner payload — or a
 * deterministic card when `payload` is null. Visuals always come from
 * `generateChartsV2` (module outputs / evidence numbers); the owner-proposed
 * series is accepted only when its numbers pass the provenance pass.
 */
export function buildDimensionChapter(
  context: ReportContext,
  dim: DimKey,
  tierV2: ReportTierV2,
  payload: DimensionChapterPayload | DimensionCardPayload | null,
  meta: ChapterMeta,
): DimensionChapter {
  const owner = DIMENSION_OWNERS[dim];
  const stage = benchmarkStageForSvi(context.stage);
  const bench = benchmarkFor(dim, stage);
  const det = dimScoreOf(context, dim);
  const evidence = evidenceRowsForDim(context, dim);
  const allowedIds = new Set(evidence.map((e) => e.evidence_id));
  const modules = context.moduleOutputs?.[dim] ?? precomputeModulesForDim(context, dim);
  const at = new Date().toISOString();

  // Score: owner proposal clamped to ±10 of the deterministic score (§C.11).
  let score = det ?? 0;
  let scoreNote: string | undefined;
  let proposedScore: number | undefined;
  if (payload) {
    proposedScore = Math.round(payload.score_adjustment.proposed);
    if (det === null) score = proposedScore;
    else {
      const clamped = Math.max(det - 10, Math.min(det + 10, proposedScore));
      if (clamped !== proposedScore) scoreNote = `Owner proposed ${proposedScore}; reconciled to ${clamped} (±10 of the deterministic ${det}).`;
      score = clamped;
    }
  }
  score = Math.max(0, Math.min(100, Math.round(score)));
  const scored = det !== null || payload !== null;
  // G19-S41: the deterministic ledger travels with the chapter; a dimension
  // the engine never assessed (pure baseline, no signal) renders as pending
  // even when an owner call proposed a number.
  const scoreBreakdown = scoreBreakdownFromSub(context.sviAnalysis.subs?.find((s) => s.key === dim), context.sviAnalysis);
  const assessed = scoreBreakdown ? scoreBreakdown.assessed : true;
  const band = scored && assessed ? bandFor(score) : "pending";

  const full = payload && "criterion_cards" in payload ? (payload as DimensionChapterPayload) : null;
  const criteria = criterionCardsFor(context, dim, full?.criterion_cards, allowedIds, score);
  const cardGaps = criteria.flatMap((c) => c.gaps).filter(Boolean);
  // G19-S43: chapter bullets never repeat the criterion cards' own bullets;
  // the "N below the strong band" line only stands in when nothing names a gap.
  const strengths = ensureCitationSuffix(dedupeAgainstCards(payload?.strengths ?? [], criteria).slice(0, 4), allowedIds);
  const gaps = ensureCitationSuffix(
    dedupeAgainstCards(payload?.gaps?.length ? payload.gaps : !cardGaps.length && scored && assessed && score < 70 ? [`${owner.title} is ${70 - score} points below the strong band (70).`] : [], criteria).slice(0, 4),
    allowedIds,
  );

  const phaseId = context.phaseGate?.currentPhase ?? resolvePhaseId(context);
  const rule = PHASE_EXIT_RULES[phaseId];
  const floor = rule.dimensionFloors[dim as keyof typeof rule.dimensionFloors];
  const phaseLabel = GROWTH_PHASE_LABELS[phaseId].en;
  const whatMattersNow =
    full?.phase_lens?.what_matters_now?.trim() ||
    (owner.phaseBehaviour[phaseId] ? `${phaseLabel}: ${owner.phaseBehaviour[phaseId]}` : "") ||
    (typeof floor === "number" ? `${phaseLabel}: ${owner.shortLabel} floor ${floor} — ${score >= floor ? "met" : "not met"} at ${score}.` : `${phaseLabel}: no ${owner.shortLabel} floor at this phase.`);

  // G19-S43: the next action fits the founder (never "Register ABN" on a
  // verified company, never "Connect X" when X is present) and quotes the one
  // lift model — an owner-proposed lift is clamped to the catalogue (D2).
  const nextActionInput: NextActionInput = {
    dim,
    score,
    assessed,
    cards: criteria,
    evidence,
    facts: { abnVerified: (context.verificationLevel ?? context.sviAnalysis.meta?.verification?.level ?? 0) >= 2, coFounders: context.sviAnalysis.signals?.hasCoFounder === true ? 2 : context.sviAnalysis.signals?.hasCoFounder === false ? 1 : null },
  };
  const nextAction = payload ? reconcileLlmNextAction(payload.next_action, nextActionInput) : chooseNextAction(nextActionInput);

  const charts = generateChartsV2({
    dim,
    ownerAgent: owner.primary,
    score: scored ? score : null,
    benchmark: bench,
    stageLabel: context.sviAnalysis.stageLabel,
    criterionScore: (key) => {
      const c = criteria.find((x) => x.key === key);
      return c ? c.score : null;
    },
    moduleOutputs: modules,
    evidence,
    proposedPrimary: (full?.primary_visual as LlmVisualProposal | undefined) ?? null,
  });

  const verdictSrc = payload?.verdict?.trim();
  const verdict =
    verdictSrc ||
    (!scored
      ? `${owner.title} was not scored in this run.`
      : !assessed
        ? `${owner.title} is not assessed yet — no evidence reached this dimension, so the ${score} in the ledger is the stage baseline, not a score.`
        : `${owner.title} scores ${score}/100 (${band}) against a ${context.sviAnalysis.stageLabel} median of ${bench.p50}.`);
  const citedInVerdict = Array.from(verdict.matchAll(/\[ev:([^\]]+)\]/g)).some((m) => allowedIds.has(m[1].trim()));
  const uncited = [...strengths, ...gaps].filter((t) => /\[unevidenced\]$/i.test(t)).length;
  const frameworks = full?.frameworks_used?.length ? full.frameworks_used.slice(0, 8) : owner.frameworks;

  return {
    dim,
    title: owner.title,
    titleVi: owner.titleVi,
    weight: owner.weight,
    ownerAgent: owner.primary,
    supportingAgents: owner.supporting,
    score,
    band,
    benchmark: { p25: bench.p25, p50: bench.p50, p75: bench.p75, percentile: scored && assessed ? percentileFor(score, bench.p25, bench.p50, bench.p75) : null, stage },
    verdict,
    primaryVisual: charts.primary,
    secondaryVisuals: charts.secondary,
    evidence,
    criteria,
    strengths,
    gaps,
    nextAction,
    phaseLens: { phaseId, whatMattersNow, floor: typeof floor === "number" ? floor : undefined, floorMet: typeof floor === "number" ? score >= floor : undefined },
    frameworks,
    modules,
    audit: { grounded: citedInVerdict || criteria.some((c) => c.grounded), uncited, revised: false, auditor: "llm-auditor", at },
    runIds: meta.runIds,
    renderAs: tierV2 === "free" ? owner.freeTier : "full",
    degraded: meta.degraded || undefined,
    degradeReason: meta.degraded ? meta.degradeReason ?? "owner call failed" : undefined,
    proposedScore,
    scoreNote: scoreNote ?? (charts.provenance.downgraded ? "Owner-proposed chart series failed number provenance — deterministic chart shown." : undefined),
    ...(scoreBreakdown ? { scoreBreakdown } : {}),
  };
}

// ── W4 dispatch ─────────────────────────────────────────────────────────────

const W4_MAX_TOKENS = { full: 900, card: 350 } as const;

function renderChapterUser(input: DimensionChapterInput): string {
  const rows = input.evidenceRows
    .map((e) => `- ${e.id} · ${e.source} · ${e.status}${e.observedAt ? ` · ${e.observedAt.slice(0, 10)}` : ""} · ${e.label}${e.value ? ` — ${e.value}` : ""}`)
    .join("\n");
  const rest: Omit<DimensionChapterInput, "evidenceRows"> & { evidenceRows?: unknown } = { ...input };
  delete rest.evidenceRows;
  return [
    `## Chapter inputs (JSON — the ONLY facts you may use)`,
    JSON.stringify(rest, null, 1),
    `## evidenceRows (the only citable ids)`,
    rows || "(no evidence rows — every claim must end with [unevidenced])",
    `Write the "${input.dim}" chapter as ${input.renderAs === "card" ? "a card" : "a full chapter"} for the ${input.tier} tier, following the output contract in your instructions.`,
  ].join("\n\n");
}

function chapterInput(context: ReportContext, dim: DimKey, tierV2: ReportTierV2, renderAs: "full" | "card", modules: ModuleOutput[]): DimensionChapterInput {
  const owner = DIMENSION_OWNERS[dim];
  const stage = benchmarkStageForSvi(context.stage);
  const bench = benchmarkFor(dim, stage);
  const phaseId = context.phaseGate?.currentPhase ?? resolvePhaseId(context);
  const rule = PHASE_EXIT_RULES[phaseId];
  const floor = rule.dimensionFloors[dim as keyof typeof rule.dimensionFloors];
  const nextPhase = context.phaseGate?.nextPhase ?? null;
  // G19-S41: the ledger the owner must explain the score with.
  const ledger = scoreBreakdownFromSub(context.sviAnalysis.subs?.find((s) => s.key === dim), context.sviAnalysis);
  return {
    dim,
    weight: owner.weight,
    stage,
    stageLabel: context.sviAnalysis.stageLabel,
    phaseId,
    benchmark: { ...bench, source: "svi-dimension-benchmarks ANCHORS (static; cohort overrides when N ≥ 30)" },
    deterministicScore: dimScoreOf(context, dim),
    criterionResults: criteriaForDimension(dim)
      .map((key) => context.criterionResults.get(key))
      .filter((r): r is AgentAnalysisResult => Boolean(r))
      .map((r) => ({ key: r.criterion, score: Math.round(r.score), verdict: r.highlights.slice(0, 2).join("; ") || firstLine(r.content), citations: (r.citations ?? []).slice(0, 4), grounded: Boolean(r.grounded) })),
    evidenceRows: evidenceRowsForDim(context, dim).map((e) => ({ id: e.evidence_id, source: e.source, status: e.status, observedAt: e.observedAt, value: e.value, label: e.label })),
    moduleOutputs: modules.map((m) => ({ id: m.id, output: m.output })),
    phaseLens: {
      floor: typeof floor === "number" ? floor : null,
      nextRequired: nextPhase ? [...PHASE_EXIT_RULES[nextPhase].requiredCriteria] : [],
      whatMattersNow: owner.phaseBehaviour[phaseId] ?? "",
    },
    ...(ledger
      ? {
          scoreLedger: {
            base: ledger.base,
            signals: ledger.signals.map((s) => ({ signal: s.signal, points: s.points, source: s.scale ? `${s.source} (applied to the adjustment)` : s.source })),
            confidenceMultiplier: ledger.confidenceMultiplier,
            adjustment: ledger.adjustment,
            assessed: ledger.assessed,
          },
        }
      : {}),
    tier: tierV2,
    renderAs,
  };
}

/** Wrap a transport so every model call (first + repair) draws from the per-report budget. */
/** Calls held back from W4 so the CEO summary always gets one. */
const W4_RESERVE_FOR_SUMMARY = 1;

/**
 * `acquire: false` = the transport is the orchestrator's already-metered
 * `callAI` (meterCallAI), so only the summary reserve is checked here; the
 * unit itself is drawn inside callAI. `acquire: true` = an injected
 * modelCaller (tests / direct callers) — draw the unit here.
 */
function meteredCaller(inner: StructuredModelCaller, budget: CallBudget | undefined, budgetOk: (() => boolean) | undefined, opts: { acquire: boolean }): StructuredModelCaller {
  return async (req) => {
    if (budgetOk && !budgetOk()) return { ok: false, status: "model_error", reason: "monthly AI budget exhausted" };
    if (budget && budget.used + W4_RESERVE_FOR_SUMMARY >= budget.max) return { ok: false, status: "model_error", reason: `report call budget exhausted (${budget.max}, 1 reserved for the summary)` };
    if (budget && opts.acquire && !budget.tryAcquire()) return { ok: false, status: "model_error", reason: `report call budget exhausted (${budget.max})` };
    return inner(req);
  };
}

async function dispatchChapter(
  dim: DimKey,
  context: ReportContext,
  tier: ReportTier,
  callAI: AICaller,
  opts: DispatchOptions,
  shared: { tierV2: ReportTierV2; knowledgeDb: KnowledgeDb | null },
): Promise<DimensionChapter> {
  const owner = DIMENSION_OWNERS[dim];
  const role = owner.primary;
  const renderAs: "full" | "card" = shared.tierV2 === "free" ? owner.freeTier : "full";
  const modules = context.moduleOutputs?.[dim] ?? precomputeModulesForDim(context, dim);
  const started = Date.now();

  // Budget gate BEFORE building the prompt: degrade to a deterministic card.
  if (opts.budgetOk && !opts.budgetOk()) {
    return buildDimensionChapter(context, dim, shared.tierV2, null, { runIds: [], degraded: true, degradeReason: "budget: monthly AI cap reached — deterministic card" });
  }
  // Keep one call in reserve for the CEO executive summary (§C.9: a report
  // never ships with a placeholder summary because W4 spent the last unit).
  if (opts.callBudget && opts.callBudget.used + W4_RESERVE_FOR_SUMMARY >= opts.callBudget.max) {
    return buildDimensionChapter(context, dim, shared.tierV2, null, { runIds: [], degraded: true, degradeReason: `budget: report call cap (${opts.callBudget.max}) reached — deterministic card` });
  }

  let knowledgeRows: AgentKnowledgeRow[] = [];
  let template: string | null = null;
  let promptVersionId = NIL_PROMPT_VERSION_ID;
  try {
    [knowledgeRows, template, promptVersionId] = await Promise.all([
      loadAgentKnowledgeRows(role, shared.knowledgeDb),
      (opts.resolvePromptTemplate ?? defaultPromptTemplate)(role),
      (opts.resolvePromptVersionId ?? defaultPromptVersionId)(role),
    ]);
  } catch {
    // Knowledge / template failures degrade the prompt, never the chapter.
  }

  const evidence = evidenceRowsForDim(context, dim);
  const input = chapterInput(context, dim, shared.tierV2, renderAs, modules);

  // §C.8 chapter cache: same evidence + modules + criteria + prompt → the
  // chapter written last time, no owner call. Skipped for re-runs / no project.
  const cacheKey =
    opts.chapterCache && opts.chapterCacheScope?.projectId && !opts.chapterCacheBypass
      ? {
          projectId: opts.chapterCacheScope.projectId,
          dim,
          pipelineVersion: opts.chapterCacheScope.pipelineVersion,
          // observedAt is dropped: criterion-minted rows are stamped "now" on every
          // run, and a re-synced connector with the same numbers is the same fact.
          evidenceHash: evidenceHashFor({
            input: { ...input, evidenceRows: input.evidenceRows.map((e) => ({ id: e.id, source: e.source, status: e.status, value: e.value ?? null, label: e.label })) },
            renderAs,
            tier: shared.tierV2,
            promptVersionId,
            template,
            // Provenance: a model swap / canary demotion must not serve the
            // previous model's chapter for 30 days (W5 review).
            model: `${modelForAgent(role)}#${taskClassForChapter(role, shared.tierV2) ?? "default"}`,
            knowledge: knowledgeRows.map((r) => ({ agent: r.agent, topic: r.topic, created_at: r.created_at })),
          }),
        }
      : null;
  if (cacheKey) {
    const hit = await opts.chapterCache!.get(cacheKey).catch(() => null);
    if (hit && hit.dim === dim) return hit;
  }

  const systemPrompt = buildAgentPrompt(role, context, {
    dim,
    phaseId: context.phaseGate?.currentPhase,
    tier: shared.tierV2,
    template,
    knowledgeRows,
    moduleOutputs: modules,
    evidenceSummary: evidence.map((e) => `- ${e.label} (${e.source}, ${e.status})`).join("\n"),
    outputSchema: w4OutputContract(dim, renderAs),
  });
  const taskClass = taskClassForChapter(role, shared.tierV2);
  const transport = opts.modelCaller ?? callAIToModelCallerWithClass(callAI, W4_MAX_TOKENS[renderAs], taskClass);
  const outputSchema = renderAs === "card" ? DimensionCardPayload : DimensionChapterPayload;

  const structured = await callStructured({
    promptVersionId,
    agent: `report-${role}`,
    model: taskClass ? `${modelForAgent(role)}#report-class` : modelForAgent(role),
    inputSchema: DimensionChapterInput,
    outputSchema,
    input,
    systemPrompt,
    renderUser: renderChapterUser,
    businessId: opts.businessId ?? null,
    userId: opts.userId ?? null,
    purpose: opts.purpose ?? "customer_report",
    evidenceIds: evidence.map((e) => e.evidence_id),
    // The orchestrator hands us an already-metered `callAI` (meterCallAI), so
    // only an injected `modelCaller` (tests / callers bypassing callAI) needs
    // the budget wrapper here — wrapping both double-charged every chapter
    // (8 W4 calls = 16 budget units) and starved the executive summary.
    modelCaller: meteredCaller(transport, opts.callBudget, opts.budgetOk, { acquire: Boolean(opts.modelCaller) }),
  });

  const runIds = structured.runId ? [structured.runId] : [];
  if (structured.ok) {
    const chapter = buildDimensionChapter(context, dim, shared.tierV2, structured.data as DimensionChapterPayload | DimensionCardPayload, { runIds, degraded: false });
    chapter.modules = [...chapter.modules, { id: "report-pipeline/agent-dispatcher.ts:dispatchChapter", output: { durationMs: Date.now() - started, renderAs, taskClass: taskClass ?? "free-chain" } }];
    if (cacheKey) await opts.chapterCache!.set(cacheKey, chapter).catch(() => undefined);
    return chapter;
  }
  return buildDimensionChapter(context, dim, shared.tierV2, null, { runIds, degraded: true, degradeReason: `schema/model: ${structured.reason}` });
}

/**
 * W4 — the 8 owner calls in parallel (§C.1). Every chapter lands in
 * `context.dimensionChapters` and is streamed through `opts.onChapter`
 * (SSE `dimension_complete`). Never throws: a failed owner call becomes a
 * deterministic `degraded` card.
 */
export async function dispatchDimensionChapters(
  context: ReportContext,
  tier: ReportTier,
  callAI: AICaller,
  opts: DispatchOptions = {},
): Promise<Map<DimKey, DimensionChapter>> {
  const tierV2: ReportTierV2 = opts.tierV2 ?? tier;
  const knowledgeDb = opts.knowledgeDb === undefined ? (getSupabaseAdmin() as unknown as KnowledgeDb | null) : opts.knowledgeDb;
  buildEvidenceRows(context);
  const chapters = context.dimensionChapters ?? new Map<DimKey, DimensionChapter>();
  context.dimensionChapters = chapters;

  const dims = opts.dims?.length ? DIM_ORDER.filter((d) => opts.dims!.includes(d)) : DIM_ORDER;
  await Promise.all(
    dims.map(async (dim) => {
      let chapter: DimensionChapter;
      try {
        chapter = await dispatchChapter(dim, context, tier, callAI, opts, { tierV2, knowledgeDb });
      } catch (err) {
        chapter = buildDimensionChapter(context, dim, tierV2, null, { runIds: [], degraded: true, degradeReason: `error: ${err instanceof Error ? err.message : String(err)}` });
      }
      chapters.set(dim, chapter);
      try {
        opts.onChapter?.(dim, chapter);
      } catch {
        // A listener failure never breaks the wave.
      }
    }),
  );
  return chapters;
}

/** Deterministic chapters for every dimension (W4 off / budget degrade path) — zero LLM calls. */
export function deterministicDimensionChapters(context: ReportContext, tierV2: ReportTierV2, reason: string): Map<DimKey, DimensionChapter> {
  buildEvidenceRows(context);
  const chapters = new Map<DimKey, DimensionChapter>();
  DIM_ORDER.forEach((dim) => chapters.set(dim, buildDimensionChapter(context, dim, tierV2, null, { runIds: [], degraded: true, degradeReason: reason })));
  context.dimensionChapters = chapters;
  return chapters;
}
