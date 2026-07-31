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

import { createHash } from "node:crypto";

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
import { buildAgentPrompt } from "./agent-prompts";
import { buildAuMarketAnchorBlock } from "./au-market-anchor";
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

type AICaller = (
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
) => Promise<string>;

/** Placeholder used when no prod prompt_versions row exists for an agent. */
export const NIL_PROMPT_VERSION_ID = "00000000-0000-0000-0000-000000000000";

// ── Wave Definitions ────────────────────────────────────────────────────────

interface WaveTask {
  agentRole: AgentRole;
  criterion: CriterionKey;
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

export function evidenceIdFor(seed: string): string {
  const h = createHash("sha256").update(seed).digest("hex");
  const timeHiAndVersion = `4${h.slice(13, 16)}`;
  const clockSeq =
    ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16) + h.slice(17, 20);
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    timeHiAndVersion,
    clockSeq,
    h.slice(20, 32),
  ].join("-");
}

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
    "body_markdown": "<the full analysis in markdown, with ### sub-headings>",
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

const promptVersionCache = new Map<string, string>();

async function defaultPromptVersionId(agentRole: AgentRole): Promise<string> {
  const cached = promptVersionCache.get(agentRole);
  if (cached) return cached;
  try {
    const row = await readCurrentPrompt(`report-${agentRole}`);
    const id = row?.id ?? NIL_PROMPT_VERSION_ID;
    promptVersionCache.set(agentRole, id);
    return id;
  } catch {
    return NIL_PROMPT_VERSION_ID;
  }
}

/** Test seam — drops the memoised prompt_versions lookups. */
export function resetPromptVersionCache(): void {
  promptVersionCache.clear();
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

  const systemPrompt = buildAgentPrompt(task.agentRole, context, task.criterion);
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
    model: opts.model ?? "free-chain",
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
      opts.modelCaller ?? callAIToModelCaller(callAI, tierConfig.maxTokensPerAgent),
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
    visuals: [],
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
      visuals: [],
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
      visuals: [],
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

  // Store results in context for next wave
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
