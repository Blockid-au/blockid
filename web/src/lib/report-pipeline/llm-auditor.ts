// LLM Auditor — a port of Google Agent Garden's `llm-auditor` sample
// (adk-samples/python/agents/llm-auditor) onto our free ADK-style agent layer.
//
// The original is a SequentialAgent[critic_agent → reviser_agent] that
// double-checks a generated answer and rewrites the inaccurate parts. We adapt
// it to our report pipeline: given a piece of generated report prose plus the
// evidence/scores it was supposed to be grounded in, the CRITIC flags
// unsupported or fabricated claims and score/narrative mismatches, then the
// REVISER produces a corrected version that keeps the valid content and removes
// or properly qualifies the unsupported parts.
//
// Why this matters here: the report pipeline runs on FREE B/C-tier models
// (Llama, Gemma, Nemotron, etc. — see ai-client.ts), which are the most prone
// to inventing specific numbers, customers, and benchmarks. A grounded
// critic→reviser pass is the cheapest way to lift factual reliability without
// spending a cent.
//
// Runs entirely on the injected free `ModelCaller` — no Gemini, no GCP, $0.

import { LlmAgent, SequentialAgent, newSession, type ModelCaller } from "@/lib/adk";

// ── Critic agent ──────────────────────────────────────────────────────────────
// Mirrors llm-auditor's critic: verify each claim against ONLY the provided
// evidence. Anything not supported is flagged. Ends with a machine-readable
// verdict so the pipeline can cheaply decide whether a revision is needed.

const CRITIC_INSTRUCTION = `You are a meticulous fact-checking critic for startup evaluation reports.

You will be given:
1. EVIDENCE — the only facts that are known to be true (startup description, uploaded evidence, SVI scores).
2. DRAFT — a piece of report prose that was generated from that evidence.

Your job: find every claim in the DRAFT that is NOT supported by the EVIDENCE.
Focus especially on:
- Fabricated specifics: invented revenue/MRR/ARR figures, user counts, growth %, customer names, funding amounts, dates, or benchmarks that do not appear in the EVIDENCE.
- Score/narrative mismatch: prose that contradicts the provided SVI scores (e.g. glowing language for a low-scored dimension).
- Overstated certainty: hedged or unknown facts presented as confirmed.

Do NOT flag reasonable qualitative interpretation or standard advice — only unsupported factual assertions.

Output format (exactly):
FINDINGS:
- <one concise finding per line; quote the offending claim>
(if there are none, write "- none")

VERDICT: ACCURATE        (use this if there are zero findings)
or
VERDICT: NEEDS_REVISION  (use this if there is at least one finding)`;

// ── Reviser agent ─────────────────────────────────────────────────────────────
// Mirrors llm-auditor's reviser: minimally edit the draft to fix exactly the
// flagged issues, preserving everything that was fine.

const REVISER_INSTRUCTION = `You revise startup-report prose to remove unsupported claims while preserving all valid content.

EVIDENCE (the only known-true facts):
{evidence}

CRITIC FINDINGS:
{critique}

You will be given the original DRAFT. Produce a corrected version that:
- Removes or rephrases every flagged claim so it is fully supported by the EVIDENCE.
- Replaces fabricated specifics with grounded, qualitative statements (never invent new numbers).
- Aligns the tone with the actual SVI scores in the EVIDENCE.
- Keeps all accurate content, structure, headings, and markdown intact.
- Makes the MINIMUM edits necessary — do not rewrite what was already correct.

Output ONLY the corrected prose. No preamble, no explanation.`;

export interface AuditResult {
  /** True if the critic flagged at least one unsupported claim. */
  hadIssues: boolean;
  /** Concise list of the critic's findings (empty if accurate). */
  findings: string[];
  /** The corrected prose. Equals the input when no issues were found. */
  revised: string;
}

const criticAgent = new LlmAgent({
  name: "critic_agent",
  description: "Flags unsupported or fabricated claims in report prose.",
  instruction: CRITIC_INSTRUCTION,
  maxTokens: 1000,
  outputKey: "critique",
});

function buildReviser(maxTokens: number): LlmAgent {
  return new LlmAgent({
    name: "reviser_agent",
    description: "Rewrites flagged claims so they are grounded in the evidence.",
    instruction: REVISER_INSTRUCTION,
    maxTokens,
  });
}

/**
 * Audit a piece of generated report prose against the evidence it should be
 * grounded in. Runs critic → (conditionally) reviser via the free model chain.
 *
 * Fail-safe: any error returns the original text unchanged with `hadIssues:false`,
 * so the auditor can never break or block report generation.
 *
 * @param draft     The generated prose to verify (e.g. an executive summary).
 * @param evidence  The grounding facts: startup description + SVI scores + key data.
 * @param model     The free ModelCaller injected by the pipeline.
 * @param maxTokens Token budget for the revised output (defaults to a generous 3000).
 */
export async function auditText(
  draft: string,
  evidence: string,
  model: ModelCaller,
  maxTokens = 3000,
): Promise<AuditResult> {
  if (!draft.trim()) return { hadIssues: false, findings: [], revised: draft };

  try {
    const session = newSession({ evidence });

    // Step 1: critic verifies the draft against the evidence.
    const criticInput = `## EVIDENCE\n${evidence}\n\n## DRAFT\n${draft}`;
    const criticResult = await criticAgent.run(criticInput, session, model);

    const findings = parseFindings(criticResult.output);
    const needsRevision =
      /VERDICT:\s*NEEDS_REVISION/i.test(criticResult.output) || findings.length > 0;

    if (!needsRevision) {
      return { hadIssues: false, findings: [], revised: draft };
    }

    // Step 2: reviser rewrites only the flagged parts. `critique` + `evidence`
    // are pulled from session state via {key} templating in the instruction.
    const reviser = buildReviser(maxTokens);
    const reviserResult = await reviser.run(
      `## DRAFT\n${draft}`,
      session,
      model,
    );

    const revised = reviserResult.output.trim();
    return {
      hadIssues: true,
      findings,
      // Guard against a reviser that returns junk / empties — keep original then.
      revised: revised.length > draft.length * 0.4 ? revised : draft,
    };
  } catch {
    // Never let auditing break the pipeline.
    return { hadIssues: false, findings: [], revised: draft };
  }
}

/**
 * Convenience: the literal ADK SequentialAgent[critic → reviser] graph, exposed
 * for callers who want to run the raw pipeline themselves (e.g. tooling/tests).
 */
export function buildAuditorAgent(maxTokens = 3000): SequentialAgent {
  return new SequentialAgent("llm_auditor", [criticAgent, buildReviser(maxTokens)]);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseFindings(criticOutput: string): string[] {
  const lines = criticOutput.split("\n");
  const findings: string[] = [];
  let inFindings = false;

  for (const line of lines) {
    if (/^\s*FINDINGS:/i.test(line)) {
      inFindings = true;
      continue;
    }
    if (/^\s*VERDICT:/i.test(line)) break;
    if (inFindings && /^\s*[-*]/.test(line)) {
      const text = line.replace(/^\s*[-*]\s*/, "").trim();
      if (text && !/^none$/i.test(text)) findings.push(text);
    }
  }

  return findings.slice(0, 8);
}
