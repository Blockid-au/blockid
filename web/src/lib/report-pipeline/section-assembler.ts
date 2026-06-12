// Section Assembler — Merges agent analysis outputs into a unified report.
//
// Takes all AgentAnalysisResult objects from the pipeline and assembles
// them into ordered report sections with cross-references and charts.

import type {
  AgentRole,
  AgentAnalysisResult,
  ReportContext,
  ReportSection,
  AssembledReport,
  ReportTier,
  VisualSpec,
  ConsistencyIssue,
} from "./types";
import type { CriterionKey } from "@/lib/evaluation-criteria";
import { CRITERIA } from "@/lib/evaluation-criteria";
import {
  getPhaseProgress,
  renderGrowthJourneySVG,
  renderThreeQuestionsSVG,
  renderProgressDashboardSVG,
  renderPhaseChecklistSVG,
  computePhaseProgress,
  getNextActionableSteps,
  GROWTH_PHASES,
} from "@/lib/startup-growth-phases";

// ── Section Order ───────────────────────────────────────────────────────────

interface SectionTemplate {
  id: string;
  title: string;
  agentRole: AgentRole;
  criterion?: CriterionKey;
  tier: "standard" | "premium";
}

const SECTION_ORDER: SectionTemplate[] = [
  { id: "executive", title: "Executive Summary", agentRole: "ceo", tier: "standard" },
  { id: "idea", title: "Idea & Innovation Assessment", agentRole: "cpo", criterion: "idea", tier: "standard" },
  { id: "market", title: "Market Opportunity", agentRole: "cmo", criterion: "market", tier: "standard" },
  { id: "founder", title: "Founder & Leadership Profile", agentRole: "chro", criterion: "founder_profile", tier: "standard" },
  { id: "code", title: "Code Quality & Technical Architecture", agentRole: "cto", criterion: "code_git", tier: "standard" },
  { id: "website", title: "Website & Digital Presence", agentRole: "cmo", criterion: "website", tier: "standard" },
  { id: "team", title: "Team Composition & Capability", agentRole: "chro", criterion: "team", tier: "standard" },
  { id: "customers", title: "Customer Base & Traction", agentRole: "cro", criterion: "customer_size", tier: "standard" },
  { id: "gtm", title: "Go-to-Market Strategy", agentRole: "cmo", criterion: "gtm_strategy", tier: "standard" },
  { id: "documents", title: "Documentation Quality", agentRole: "clo", criterion: "documents", tier: "standard" },
  { id: "revenue", title: "Revenue & Unit Economics", agentRole: "cfo", criterion: "revenue", tier: "standard" },
  { id: "risk", title: "Risk Assessment & Mitigation", agentRole: "clo", tier: "standard" },
  { id: "dataroom", title: "Data Room Assessment", agentRole: "clo", criterion: "dataroom", tier: "premium" },
  { id: "org", title: "Organizational Structure", agentRole: "chro", criterion: "team_structure", tier: "premium" },
  { id: "roadmap", title: "Product Roadmap", agentRole: "cpo", criterion: "roadmap", tier: "premium" },
  { id: "competitive", title: "Competitive Intelligence", agentRole: "cmo", tier: "premium" },
  { id: "action_plan", title: "90-Day Action Roadmap", agentRole: "coo", tier: "premium" },
  { id: "board_memo", title: "Board-Ready Investor Memo", agentRole: "ceo", tier: "premium" },
  { id: "au_market", title: "Australian Market Deep Dive", agentRole: "cfo", tier: "premium" },
  { id: "cybersecurity", title: "Cybersecurity Assessment", agentRole: "ciso", tier: "premium" },
  { id: "data_strategy", title: "Data & AI Strategy", agentRole: "cdo", tier: "premium" },
];

// ── Assemble Report ─────────────────────────────────────────────────────────

export function assembleReport(
  context: ReportContext,
  tier: ReportTier,
  reportId: string,
): AssembledReport {
  const includePremium = tier === "premium" || tier === "investor_memo";
  const templates = SECTION_ORDER.filter(
    (t) => t.tier === "standard" || includePremium,
  );

  const sections: ReportSection[] = [];
  const allCharts: VisualSpec[] = [];
  const agentContributions: Record<string, { criteria: CriterionKey[]; wordCount: number }> = {};

  for (const template of templates) {
    const section = buildSection(template, context);
    sections.push(section);
    allCharts.push(...section.visuals);

    // Track contributions
    if (!agentContributions[template.agentRole]) {
      agentContributions[template.agentRole] = { criteria: [], wordCount: 0 };
    }
    agentContributions[template.agentRole].wordCount += section.wordCount;
    if (template.criterion) {
      agentContributions[template.agentRole].criteria.push(template.criterion);
    }
  }

  const totalWords = sections.reduce((sum, s) => sum + s.wordCount, 0);
  const markdown = sectionsToMarkdown(sections, context);

  return {
    id: reportId,
    title: `SVI Enhanced Report: ${context.startupName}`,
    tier,
    sections,
    charts: allCharts,
    executiveSummary: context.executiveSummary ?? sections[0]?.content ?? "",
    qualityScore: context.qualityScore ?? computeQualityScore(sections, context),
    totalWords,
    consistencyIssues: context.consistencyIssues?.map((desc) => ({
      type: "data_misalignment" as const,
      severity: "medium" as const,
      description: desc,
      criteria: [] as CriterionKey[],
    })) ?? [],
    agentContributions: agentContributions as Record<AgentRole, { criteria: CriterionKey[]; wordCount: number }>,
    markdown,
    createdAt: new Date().toISOString(),
  };
}

// ── Build Individual Section ────────────────────────────────────────────────

function buildSection(
  template: SectionTemplate,
  context: ReportContext,
): ReportSection {
  let content = "";
  let score: number | undefined;
  const visuals: VisualSpec[] = [];

  if (template.criterion) {
    const result = context.criterionResults.get(template.criterion);
    if (result) {
      content = result.content;
      score = result.score;
      visuals.push(...result.visuals);
    } else {
      content = `*Analysis pending for ${template.title}.*`;
    }
  } else if (template.id === "executive") {
    content = context.executiveSummary ?? "*Executive summary being generated...*";
  } else if (template.id === "risk") {
    content = buildRiskSection(context);
  } else if (template.id === "competitive") {
    content = buildCompetitiveSection(context);
  } else if (template.id === "action_plan") {
    content = buildActionPlanSection(context);
  } else if (template.id === "board_memo") {
    content = buildBoardMemoSection(context);
  } else {
    content = `*Section content for ${template.title}.*`;
  }

  const wordCount = content.split(/\s+/).filter(Boolean).length;

  return {
    id: template.id,
    title: template.title,
    agentRole: template.agentRole,
    criterion: template.criterion,
    content,
    score,
    visuals,
    wordCount,
  };
}

// ── Cross-Cutting Sections (assembled from multiple agent results) ──────────

function buildRiskSection(context: ReportContext): string {
  const allRisks: string[] = [];
  for (const [, result] of context.criterionResults) {
    allRisks.push(...result.risks);
  }

  if (allRisks.length === 0) {
    return "### Risk Assessment\n\nNo significant risks identified based on available evidence. This may indicate limited information rather than low risk — additional evidence would improve risk visibility.";
  }

  const uniqueRisks = [...new Set(allRisks)].slice(0, 10);
  let md = "### Risk Summary\n\n";
  md += "The following risks have been identified across all evaluation criteria:\n\n";
  for (const risk of uniqueRisks) {
    md += `- ${risk}\n`;
  }
  md += "\n### Mitigation Recommendations\n\n";
  md += "Each risk above should be addressed with a specific mitigation plan. Prioritize by impact and likelihood.\n";
  return md;
}

function buildCompetitiveSection(context: ReportContext): string {
  const marketResult = context.criterionResults.get("market");
  const ideaResult = context.criterionResults.get("idea");

  let md = "### Competitive Landscape\n\n";
  if (marketResult) {
    md += "Based on market analysis:\n\n";
    md += marketResult.highlights.map((h) => `- ${h}`).join("\n");
  }
  if (ideaResult) {
    md += "\n\n### Differentiation\n\n";
    md += ideaResult.highlights.map((h) => `- ${h}`).join("\n");
  }
  return md;
}

function buildActionPlanSection(context: ReportContext): string {
  const allNextSteps: Array<{ criterion: string; step: string }> = [];
  for (const [criterion, result] of context.criterionResults) {
    for (const step of result.nextSteps) {
      allNextSteps.push({ criterion, step });
    }
  }

  let md = "### 90-Day Action Roadmap\n\n";
  md += "#### Month 1: Foundation & Quick Wins\n\n";
  const month1 = allNextSteps.slice(0, 5);
  for (const item of month1) {
    md += `- **${getCriterionTitle(item.criterion)}**: ${item.step}\n`;
  }

  md += "\n#### Month 2: Build & Validate\n\n";
  const month2 = allNextSteps.slice(5, 10);
  for (const item of month2) {
    md += `- **${getCriterionTitle(item.criterion)}**: ${item.step}\n`;
  }

  md += "\n#### Month 3: Scale & Prepare\n\n";
  const month3 = allNextSteps.slice(10, 15);
  for (const item of month3) {
    md += `- **${getCriterionTitle(item.criterion)}**: ${item.step}\n`;
  }

  return md;
}

function buildBoardMemoSection(context: ReportContext): string {
  const topScores = [...context.criterionResults.entries()]
    .sort(([, a], [, b]) => b.score - a.score)
    .slice(0, 3);

  const bottomScores = [...context.criterionResults.entries()]
    .sort(([, a], [, b]) => a.score - b.score)
    .slice(0, 3);

  let md = "### Board-Ready Investor Memo\n\n";
  md += `**${context.startupName}** | SVI Score: ${context.sviAnalysis.totalSVI} | Stage: ${context.sviAnalysis.stageLabel}\n\n`;

  md += "#### Investment Thesis\n\n";
  md += "Top strengths:\n";
  for (const [key, result] of topScores) {
    md += `- **${getCriterionTitle(key)}** (${result.score}/100): ${result.highlights[0] ?? "Strong performance"}\n`;
  }

  md += "\n#### Key Risks\n\n";
  for (const [key, result] of bottomScores) {
    md += `- **${getCriterionTitle(key)}** (${result.score}/100): ${result.risks[0] ?? "Needs improvement"}\n`;
  }

  return md;
}

// ── Markdown Assembly ───────────────────────────────────────────────────────

function sectionsToMarkdown(sections: ReportSection[], context: ReportContext): string {
  const parts: string[] = [];

  parts.push(`# SVI Enhanced Report: ${context.startupName}`);
  parts.push(`**SVI Score:** ${context.sviAnalysis.totalSVI} | **Stage:** ${context.sviAnalysis.stageLabel} | **Generated:** ${new Date().toLocaleDateString("en-AU")}`);
  parts.push("---");

  // Growth Journey visual (SVG)
  const stage = context.sviAnalysis.stage ?? 0;
  const { completed, current, upcoming } = getPhaseProgress(stage);
  const journeySvg = renderGrowthJourneySVG(stage, context.startupName);
  parts.push("## Your Growth Journey");
  parts.push(`<!-- growth-journey-svg -->\n${journeySvg}\n<!-- /growth-journey-svg -->`);
  if (current.length > 0) {
    parts.push(`**Current Phase${current.length > 1 ? "s" : ""}:** ${current.map(p => `${p.title} (Lead: ${p.leadAgent.toUpperCase()})`).join(", ")}`);
  }
  parts.push(`**Progress:** ${completed.length}/${GROWTH_PHASES.length} phases complete | ${upcoming.length} upcoming`);
  parts.push("---");

  // Three Questions infographic (SVG)
  const allSteps = [...context.criterionResults.values()].flatMap(r => r.nextSteps).slice(0, 4);
  const threeQSvg = renderThreeQuestionsSVG({
    startupName: context.startupName,
    currentStage: context.sviAnalysis.stageLabel,
    sviScore: context.sviAnalysis.totalSVI,
    valuationRange: estimateValuationRange(context.sviAnalysis.totalSVI, stage),
    nextSteps: allSteps.length > 0 ? allSteps : ["Complete your SVI assessment", "Add evidence & data", "Review your report", "Follow the action plan"],
  });
  parts.push("## The Three Critical Questions");
  parts.push(`<!-- three-questions-svg -->\n${threeQSvg}\n<!-- /three-questions-svg -->`);
  parts.push("---");

  for (const section of sections) {
    parts.push(`## ${section.title}`);
    if (section.score !== undefined) {
      parts.push(`*Score: ${section.score}/100*`);
    }
    parts.push(section.content);
    parts.push("---");
  }

  // Progress Dashboard (SVG)
  const stepsData: Record<string, string[]> = context.phaseStepsCompleted ?? {};
  const phaseProgress = computePhaseProgress(stepsData);
  const dashboardSvg = renderProgressDashboardSVG(context.startupName, phaseProgress);
  parts.push("## Startup Progress Dashboard");
  parts.push(`<!-- progress-dashboard-svg -->\n${dashboardSvg}\n<!-- /progress-dashboard-svg -->`);
  parts.push("---");

  // Phase-by-phase next steps with checklist
  if (current.length > 0) {
    parts.push("## Your Next Phase: Step-by-Step Action Plan");
    for (const phase of current) {
      const completedStepIds = stepsData[phase.id] ?? [];
      const checklistSvg = renderPhaseChecklistSVG(phase, completedStepIds, context.startupName);
      parts.push(`### Phase ${phase.order}: ${phase.title}`);
      parts.push(`*${phase.subtitle}* — Led by ${phase.leadAgent.toUpperCase()}, supported by ${phase.supportAgents.map(a => a.toUpperCase()).join(", ")}`);
      parts.push(`<!-- phase-checklist-svg -->\n${checklistSvg}\n<!-- /phase-checklist-svg -->`);
      parts.push("**Key Questions to Answer:**");
      parts.push(phase.keyQuestions.map(q => `- ${q}`).join("\n"));
      parts.push("**Steps to Complete:**");
      for (const step of phase.steps) {
        const done = completedStepIds.includes(step.id);
        parts.push(`- [${done ? "x" : " "}] **${step.title}** — ${step.description} *(Agent: ${step.agentHint.toUpperCase()})*`);
      }
    }
    parts.push("---");
  }

  // Priority next actions across all phases
  const nextActions = getNextActionableSteps(stepsData, 5);
  if (nextActions.length > 0) {
    parts.push("## Priority Next Actions");
    parts.push("*These are your most impactful uncompleted steps, in order:*\n");
    for (const { phase, step } of nextActions) {
      parts.push(`1. **${step.title}** (Phase: ${phase.title}) — ${step.description} → Ask your ${step.agentHint.toUpperCase()} agent`);
    }
    parts.push("---");
  }

  parts.push(`\n*Report generated by BlockID.au Enhanced SVI Engine*`);
  parts.push(`*This report is for informational purposes only and does not constitute financial, legal, or investment advice.*`);

  return parts.join("\n\n");
}

function estimateValuationRange(sviScore: number, stage: number): string {
  if (stage <= 1) return "A$50K – A$250K";
  if (stage === 2) return "A$250K – A$1M";
  if (stage === 3) return "A$500K – A$3M";
  if (stage === 4) return "A$1M – A$10M";
  if (stage === 5) return "A$5M – A$50M";
  if (stage === 6) return "A$20M – A$200M";
  return "A$100M+";
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function getCriterionTitle(key: string): string {
  const criterion = CRITERIA.find((c) => c.key === key);
  return criterion?.title ?? key;
}

function computeQualityScore(sections: ReportSection[], context: ReportContext): number {
  const sectionCompleteness = sections.filter((s) => s.wordCount > 50).length / sections.length;
  const evidenceCompleteness = Object.values(context.criteriaData).filter(
    (d) => d.textInput.length > 0 || d.files.length > 0 || d.links.length > 0,
  ).length / 13;

  const avgConfidence = context.criterionResults.size > 0
    ? [...context.criterionResults.values()].reduce((sum, r) => sum + r.confidence, 0) / context.criterionResults.size
    : 0.2;

  return Math.round(
    (avgConfidence * 30) +
    (evidenceCompleteness * 25) +
    (sectionCompleteness * 25) +
    (context.consistencyIssues?.length === 0 ? 20 : 10),
  );
}
