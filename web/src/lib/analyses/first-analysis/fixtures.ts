// Test fixtures for the first analysis (S32-B). No `server-only`; used by
// the build, job, PDF and route suites, and by the local smoke script.

import { extractSignals } from "@/lib/svi-analysis";
import { buildDeterministicReport } from "./build";
import {
  AGENT_META,
  FIRST_ANALYSIS_AGENTS,
  countWords,
  type AgentSection,
  type FirstAnalysisAgent,
  type FirstAnalysisReport,
} from "./types";

export const SAMPLE_ANALYSIS_ID = "0d4f7c1e-9b2a-4c3d-8e5f-6a7b8c9d0e1f";

export const SAMPLE_RAW_TEXT =
  "Kelpie Rostering builds a rostering and compliance app for regional aged-care providers in Australia. " +
  "We launched the product in March 2026 and have 42 paying customers across NSW and Victoria. " +
  "MRR is A$18,500 and grew 12% last month. We interviewed 60 facility managers before building. " +
  "Team of 4: two co-founders who ran aged-care facilities for a decade, plus two engineers. " +
  "We have an ABN, a shareholders agreement and a cap table with 4-year vesting. " +
  "We are raising A$1.2M pre-seed to hire two more engineers and open Queensland. See https://kelpie.example.au";

export function sampleIntake(rawText: string = SAMPLE_RAW_TEXT) {
  return {
    inputKind: "existing_company_text" as const,
    rawText,
    structured: {},
    signals: extractSignals({ rawText }),
    // MRR A$18,500 → ARR A$222k, under the A$250k stage-4 bar → Early Traction.
    context: { stage: 3 },
    warnings: undefined,
  };
}

const LOREM =
  "Start with what the input shows and what it does not. The evidence points to a real operating business with paying customers, a stated revenue figure and a team with domain experience, which is more than most first analyses carry. " +
  "What is missing is the working behind the numbers: churn, gross margin, the sales cycle and the split between the two states. A founder at this stage should write those down this week, because every investor conversation will start there. " +
  "Treat the score as a position, not a verdict. The index moves only on evidence, so the plan below is about producing evidence, not polishing the story. Sequence the work from Day 0: one conversation a day, one number a week, one document a month. " +
  "Do not hire ahead of proof. The raise you describe funds engineers; make sure the product roadmap those engineers will build is tied to the objections your 42 customers actually raise, and that you can name them.";

export function sampleAgentSection(role: FirstAnalysisAgent, overrides: Partial<AgentSection> = {}): AgentSection {
  const body = `${LOREM}\n\n${LOREM}`;
  return {
    role,
    title: `${AGENT_META[role].label}: what the evidence supports for Kelpie Rostering`,
    body,
    nextSteps: [
      "Write down churn, gross margin and sales cycle for the last three months.",
      "Interview five of the 42 customers about the one feature they would pay more for.",
      "Book a call with an R&D Tax Incentive adviser before the next BAS.",
    ],
    wordCount: countWords(body),
    provider: "test",
    model: "stub",
    generatedAt: "2026-09-15T00:00:00.000Z",
    ...overrides,
  };
}

/** A complete report with all seven voices, for the PDF and route suites. */
export function sampleReport(opts: { agents?: boolean; rawText?: string } = {}): FirstAnalysisReport {
  const { report } = buildDeterministicReport({
    analysisId: SAMPLE_ANALYSIS_ID,
    intake: sampleIntake(opts.rawText),
    meta: { url: null, filename: null },
    now: new Date("2026-09-15T00:00:00.000Z"),
  });
  if (opts.agents !== false) {
    for (const role of FIRST_ANALYSIS_AGENTS) {
      report.agents[role] = sampleAgentSection(role);
      report.progress.completed.push(role);
    }
    report.completedAt = "2026-09-15T00:10:00.000Z";
  }
  return report;
}
