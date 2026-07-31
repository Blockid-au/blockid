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
 * @param draft     The generated prose to verify — one section of the report.
 *                  Use auditSections() below to sweep the whole report; this
 *                  function grounds a single piece of prose.
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

// ══════════════════════════════════════════════════════════════════════════════
// §5.4 — Grounding for EVERY section (Master Upgrade Plan gap G8)
// ══════════════════════════════════════════════════════════════════════════════
//
// auditText() above grounds one piece of prose and costs up to two model
// calls. Running it over ~20 sections would multiply auditor spend by 20 per
// report, so the sweep is two-staged:
//
//   Stage 1 (free, always runs on every section): a deterministic scan for
//     MATERIAL claims — money, percentages, large counts, ARR/MRR/TAM style
//     metrics, growth rates — that carry neither an evidence_id citation nor
//     an explicit "unevidenced" marker. This is the §5.4 rule ("no claim
//     without an evidence_id citation") enforced without a single token.
//
//   Stage 2 (metered): the critic→reviser LLM pass. Gated by (a) the caller's
//     budget predicate, (b) a hard cap on how many sections may be audited,
//     and (c) optionally `llmOnlyWhenUncited`, which restricts the LLM pass to
//     sections Stage 1 already flagged.
//
// A section that fails Stage 1 is ALWAYS reported as ungrounded even when the
// LLM pass is skipped — the caller downgrades its confidence and flags it.
// Nothing is silently published as grounded.

/** A section handed to the sweep. */
export interface AuditableSection {
  /** Stable identity — criterion key, or "executive" for the summary. */
  id: string;
  title: string;
  content: string;
  /** Evidence ids this section is allowed to cite. */
  allowedEvidenceIds?: string[];
}

export interface SectionAuditOutcome {
  sectionId: string;
  /** Corrected prose (equals the input when nothing was revised). */
  revised: string;
  /** Critic findings from the LLM pass (empty when it did not run). */
  findings: string[];
  /** Material claims carrying no evidence_id citation. */
  uncitedClaims: string[];
  /** False when at least one material claim is uncited. */
  grounded: boolean;
  /** True when the critic→reviser pass actually ran for this section. */
  llmAudited: boolean;
  /** Model calls this section consumed (0, 1 critic-only, or 2). */
  modelCalls: number;
  /** Why the LLM pass did not run. */
  skipped?: "budget" | "tier" | "clean" | "cap";
}

export interface AuditSectionsOptions {
  /**
   * Hard cap on how many sections may run the LLM pass. Every section past
   * the cap keeps its Stage-1 verdict and is marked skipped:"cap".
   */
  maxLlmSections?: number;
  /**
   * When true, only sections Stage 1 flagged run the LLM pass. Used for the
   * Standard tier, where a full sweep is not worth the spend.
   */
  llmOnlyWhenUncited?: boolean;
  /**
   * Budget predicate, evaluated before EVERY LLM pass. Returning false
   * short-circuits the rest of the sweep with skipped:"budget". Defaults to
   * always-allowed so the auditor keeps no dependency on ai-client.
   */
  budgetOk?: () => boolean;
  /** Token budget for each revised section. */
  maxTokens?: number;
}

/**
 * Ground every section of a report.
 *
 * Fail-safe by construction: Stage 1 is pure string work, Stage 2 delegates
 * to auditText() which already swallows model errors. A caller can never lose
 * a report to the auditor.
 */
export async function auditSections(
  sections: AuditableSection[],
  evidence: string,
  model: ModelCaller,
  options: AuditSectionsOptions = {},
): Promise<SectionAuditOutcome[]> {
  const {
    maxLlmSections = 8,
    llmOnlyWhenUncited = false,
    budgetOk = () => true,
    maxTokens = 2000,
  } = options;

  const outcomes: SectionAuditOutcome[] = [];
  let llmRuns = 0;
  let budgetExhausted = false;

  for (const section of sections) {
    const uncitedClaims = findUncitedClaims(
      section.content,
      section.allowedEvidenceIds ?? [],
    );
    const grounded = uncitedClaims.length === 0;

    const base: SectionAuditOutcome = {
      sectionId: section.id,
      revised: section.content,
      findings: [],
      uncitedClaims,
      grounded,
      llmAudited: false,
      modelCalls: 0,
    };

    if (!section.content.trim()) {
      outcomes.push({ ...base, grounded: true, skipped: "clean" });
      continue;
    }
    if (llmOnlyWhenUncited && grounded) {
      outcomes.push({ ...base, skipped: "clean" });
      continue;
    }
    if (llmRuns >= maxLlmSections) {
      outcomes.push({ ...base, skipped: "cap" });
      continue;
    }
    if (budgetExhausted || !budgetOk()) {
      budgetExhausted = true;
      outcomes.push({ ...base, skipped: "budget" });
      continue;
    }

    llmRuns += 1;
    const result = await auditText(section.content, evidence, model, maxTokens);
    outcomes.push({
      ...base,
      revised: result.revised,
      findings: result.findings,
      llmAudited: true,
      // critic always runs; the reviser only runs when the critic objected.
      modelCalls: result.hadIssues ? 2 : 1,
      grounded: grounded && !result.hadIssues,
    });
  }

  return outcomes;
}

// ── Stage 1: deterministic citation gate ──────────────────────────────────────

// A "material" claim is a specific, checkable assertion — the class of
// statement free models fabricate. Qualitative prose is deliberately NOT
// material: flagging it would drown the real signal.
const MATERIAL_PATTERNS: RegExp[] = [
  /(?:A?\$|AUD\s?|USD\s?)\s?\d[\d,.]*\s*(?:k|m|bn?|million|billion|thousand)?/i,
  /\b\d+(?:\.\d+)?\s?%/,
  /\b\d[\d,]{3,}\b/,
  /\b(?:ARR|MRR|CAC|LTV|TAM|SAM|SOM|NPS|MAU|DAU|CAGR|churn|runway)\b[^.]{0,40}?\d/i,
  /\b\d+(?:\.\d+)?x\b/i,
];

// An explicit admission that a claim is not evidenced satisfies §5.4 just as
// a citation does — the rule is "cite it or say you cannot".
const UNEVIDENCED_MARKERS =
  /\((?:unevidenced|uncited|no evidence|estimate|estimated|illustrative|assumption)\)|\b(?:not disclosed|not provided|no evidence (?:was )?(?:supplied|provided)|unverified|self-reported|founder-reported|indicative only)\b/i;

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Split prose into claim-sized units: sentences, list items, table rows. */
function splitClaims(text: string): string[] {
  return text
    .split("\n")
    .filter(line => !line.trim().startsWith("<!--"))
    .flatMap(line => line.split(/(?<=[.!?])\s+/))
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * Return every material claim in `text` that carries neither an evidence_id
 * citation nor an explicit unevidenced marker.
 *
 * `allowedIds` are the evidence ids the section was permitted to cite. When
 * the list is empty any well-formed uuid counts as a citation — callers that
 * do not track a catalogue still get the "cite something" rule enforced.
 */
export function findUncitedClaims(
  text: string,
  allowedIds: string[] = [],
  limit = 8,
): string[] {
  const allowed = new Set(allowedIds.map(id => id.toLowerCase()));
  const flagged: string[] = [];

  for (const claim of splitClaims(text)) {
    if (!MATERIAL_PATTERNS.some(p => p.test(claim))) continue;
    if (UNEVIDENCED_MARKERS.test(claim)) continue;

    const uuids = claim.match(UUID_RE) ?? [];
    const hasCitation =
      allowed.size === 0
        ? uuids.length > 0
        : uuids.some(u => allowed.has(u.toLowerCase()));
    if (hasCitation) continue;

    flagged.push(claim.length > 220 ? `${claim.slice(0, 217)}...` : claim);
    if (flagged.length >= limit) break;
  }

  return flagged;
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
