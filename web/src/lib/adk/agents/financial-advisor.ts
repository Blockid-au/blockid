// Financial Advisor — a port of Google Agent Garden's `financial-advisor`
// sample onto our free ADK-style agent layer.
//
// The original is a multi-agent system (analyst → strategist/advisor) that
// produces grounded financial guidance with explicit disclaimers. We adapt it
// to BlockID's CFO use case: given a startup's financial signals (revenue,
// burn, runway, stage), a SequentialAgent runs
//   financial_analyst_agent → financial_advisor_agent
// to produce a structured analysis (health read, key metrics, risks) and
// stage-appropriate, AU-aware recommendations.
//
// Runs on the injected free `ModelCaller` — $0, no Gemini, no GCP. Output is
// advisory only and carries a non-advice disclaimer (AU compliance).

import { LlmAgent, SequentialAgent, newSession, type ModelCaller } from "@/lib/adk";

const ANALYST_INSTRUCTION = `You are a startup financial analyst for BlockID.au (Australia).

You are given a startup's financial signals. Analyse them GROUNDED ONLY in those figures — never invent numbers.

Cover concisely:
- Financial health read (cash position, runway, burn discipline) given the stage.
- 2-4 key metrics worth tracking (e.g. burn multiple, runway months, gross margin) — only if derivable from the inputs.
- The top 2-3 financial risks.

Use Australian context where relevant (R&D Tax Incentive 43.5%, ESIC, ATO/GST).
Output clean markdown with ### sub-headings. Keep it under 350 words.`;

const ADVISOR_INSTRUCTION = `You are a CFO advisor for BlockID.au coaching an Australian founder.

The analyst's read:
{analysis}

Based ONLY on that analysis and the original figures, give stage-appropriate, ACTIONABLE recommendations.
- 3-5 concrete next financial moves (fundraising timing, runway extension, pricing, cost levers, AU grants/incentives).
- Frame supportively, like a mentor. Be specific.
- End with: "_This is general information, not financial or investment advice._"

Output clean markdown. Keep it under 350 words.`;

export interface FinancialSignals {
  startupName: string;
  stage?: string;
  monthlyRevenueAud?: number;
  monthlyBurnAud?: number;
  runwayMonths?: number;
  cashAud?: number;
  /** Any extra free-text context (team size, customers, notes). */
  notes?: string;
}

export interface FinancialAdviceResult {
  /** Markdown analysis from the analyst agent (or "" on failure). */
  analysis: string;
  /** Markdown recommendations from the advisor agent (or "" on failure). */
  recommendations: string;
  /** False if the agents failed and nothing usable was produced. */
  ok: boolean;
}

const analystAgent = new LlmAgent({
  name: "financial_analyst_agent",
  description: "Reads startup financial signals and surfaces health, metrics, risks.",
  instruction: ANALYST_INSTRUCTION,
  maxTokens: 700,
  outputKey: "analysis",
});

const advisorAgent = new LlmAgent({
  name: "financial_advisor_agent",
  description: "Turns the analysis into stage-appropriate financial recommendations.",
  instruction: ADVISOR_INSTRUCTION,
  maxTokens: 700,
});

/**
 * Produce grounded financial analysis + recommendations from a startup's
 * signals. Runs analyst → advisor on the free model chain. Fail-safe: returns
 * `ok:false` with empty strings on error.
 */
export async function analyzeFinancials(
  signals: FinancialSignals,
  model: ModelCaller,
): Promise<FinancialAdviceResult> {
  try {
    const session = newSession();
    const seq = new SequentialAgent("financial_advisor", [analystAgent, advisorAgent]);

    const facts = [
      `Startup: ${signals.startupName}`,
      signals.stage ? `Stage: ${signals.stage}` : "",
      num("Monthly revenue (AUD)", signals.monthlyRevenueAud),
      num("Monthly burn (AUD)", signals.monthlyBurnAud),
      num("Runway (months)", signals.runwayMonths),
      num("Cash on hand (AUD)", signals.cashAud),
      signals.notes ? `Notes: ${signals.notes}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const trace = await seq.run(`## Financial Signals\n${facts}`, session, model);

    const analysis = (session.state.analysis ?? "").trim();
    const recommendations = (trace[trace.length - 1]?.output ?? "").trim();

    return {
      analysis,
      recommendations,
      ok: Boolean(analysis || recommendations),
    };
  } catch {
    return { analysis: "", recommendations: "", ok: false };
  }
}

function num(label: string, value: number | undefined): string {
  return value === undefined || Number.isNaN(value) ? "" : `${label}: ${value}`;
}
