// Agent Dispatcher — Parallel AI call dispatch for multi-agent report generation.
//
// Dispatches analysis requests to AI providers via the existing callAI()
// infrastructure. Handles wave-based parallelism (Wave 1 → Wave 2 → Wave 3).

import type {
  AgentRole,
  AgentAnalysisResult,
  ReportContext,
  ReportTier,
  CriterionData,
} from "./types";
import type { CriterionKey } from "@/lib/evaluation-criteria";
import { buildAgentPrompt } from "./agent-prompts";
import { REPORT_TIER_CONFIG } from "./types";

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

// ── Dispatch a Single Agent Analysis ────────────────────────────────────────

async function dispatchAgent(
  task: WaveTask,
  context: ReportContext,
  tier: ReportTier,
  callAI: (systemPrompt: string, userPrompt: string, maxTokens: number) => Promise<string>,
): Promise<AgentAnalysisResult> {
  const startTime = Date.now();
  const tierConfig = REPORT_TIER_CONFIG[tier];

  const systemPrompt = buildAgentPrompt(task.agentRole, context, task.criterion);
  const userPrompt = buildUserPrompt(task.criterion, context);

  try {
    const response = await callAI(systemPrompt, userPrompt, tierConfig.maxTokensPerAgent);
    const score = extractScore(response);
    const wordCount = response.split(/\s+/).filter(Boolean).length;

    return {
      criterion: task.criterion,
      agentRole: task.agentRole,
      score,
      content: response,
      highlights: extractHighlights(response),
      dataPoints: extractDataPoints(response),
      risks: extractRisks(response),
      nextSteps: extractNextSteps(response),
      visuals: [],
      confidence: computeConfidence(context.criteriaData[task.criterion]),
      wordCount,
      durationMs: Date.now() - startTime,
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
    };
  }
}

// ── Dispatch a Wave (Parallel) ──────────────────────────────────────────────

export async function dispatchWave(
  tasks: WaveTask[],
  context: ReportContext,
  tier: ReportTier,
  callAI: (systemPrompt: string, userPrompt: string, maxTokens: number) => Promise<string>,
): Promise<AgentAnalysisResult[]> {
  const results = await Promise.all(
    tasks.map((task) => dispatchAgent(task, context, tier, callAI)),
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
  if (criterion === "market" && gr.competitiveResearch) {
    parts.push(`## Competitive Research\n${JSON.stringify(gr.competitiveResearch, null, 2)}`);
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
