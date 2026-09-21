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
import { declaredTableRows, EV_MARKER_RE, expandShortCitations, hasCitationOrMarker, isMaterialClaim, isPrescriptiveClaim, splitClaims, UNEVIDENCED_MARKERS } from "./claim-gate";
import { itemHasNumber, numericTokens, type CitableItem } from "./auto-cite";

// The Stage-1 predicates live in ./claim-gate.ts (shared with the G23-A auto-citer); re-exported for existing callers.
export { hasCitationOrMarker, isMaterialClaim, splitClaims, MATERIAL_PATTERNS, UNEVIDENCED_MARKERS } from "./claim-gate";

// ── Critic agent ──────────────────────────────────────────────────────────────
// Mirrors llm-auditor's critic: verify each claim against ONLY the provided
// evidence. Anything not supported is flagged. Ends with a machine-readable
// verdict so the pipeline can cheaply decide whether a revision is needed.

const CRITIC_INSTRUCTION = `You are a meticulous fact-checking critic for startup evaluation reports.

You will be given:
1. EVIDENCE — the only facts that are known to be true (startup description, uploaded evidence, SVI scores).
2. DRAFT — a piece of report prose that was generated from that evidence.

Your job: find every FACTUAL claim in the DRAFT that is NOT supported by the EVIDENCE.
Focus on:
- Fabricated specifics: invented revenue/MRR/ARR figures, user counts, growth %, customer names, funding amounts, dates, or industry benchmarks that do not appear in the EVIDENCE and are not marked as unevidenced.
- Score/narrative mismatch: prose that clearly contradicts the provided SVI scores (e.g. glowing language for a low-scored dimension).
- Overstated certainty: hedged or unknown facts presented as confirmed.

The EVIDENCE is the founder's own submission plus what the platform gathered and computed. A sentence that restates something in it — including the per-criterion founder text, the gathered rows and the computed SVI / benchmark / valuation facts — IS supported.

NEVER flag:
- a sentence that already discloses its status: "(unevidenced)", "[unevidenced]", "(estimate)", "assuming …", "we estimate …", "base / bull / bear scenario" — it has told the reader; do not repeat it as a finding;
- a sentence carrying an [ev:<id>] marker whose id is in the CITABLE IDS list, unless the number or name it states is absent from that catalogue item;
- recommendations, next steps, hiring plans, targets, timelines, methods to use, or "should / could / would" advice — these are the analyst's plan, not claims about the world;
- an analyst rating or assessment ("Network effects: 3/5", "moat rated 4/5", a 1–5 score the analyst assigns) — it is a judgement, not a measured fact;
- reasonable qualitative interpretation, inference from stated facts, or standard practitioner advice.

Only a specific — a number, date, name, benchmark or a stated fact about the startup — that the EVIDENCE does not hold and the DRAFT does not mark is a finding. When you are not sure, do not flag it.

Output format (exactly):
FINDINGS:
- <one concise finding per line; quote the offending claim>
(if there are none, write "- none")

VERDICT: ACCURATE        (use this if there are zero findings)
or
VERDICT: NEEDS_REVISION  (use this if there is at least one finding)`;

/** Exported for the prompt test (G24-D). */
export const CRITIC_INSTRUCTION_TEXT = CRITIC_INSTRUCTION;

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
  /** True if the critic flagged at least one unsupported claim (after the deterministic filter). */
  hadIssues: boolean;
  /** Concise list of the critic's findings (empty if accurate). */
  findings: string[];
  /** The corrected prose. Equals the input when no issues were found. */
  revised: string;
  /** G24-D: critic lines the deterministic filter dropped (disclosed, cited-and-matching, prescriptive, or "no finding"). */
  droppedFindings?: string[];
}

/** G24-D: what the finding filter needs to know about the section under audit. */
export interface AuditTextOptions {
  /** Ids the section may cite — a finding on a sentence citing one of them is dropped when its numbers are in that item. */
  allowedEvidenceIds?: string[];
  /** The citable items (id + label + text) behind those ids. */
  citable?: CitableItem[];
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
  options: AuditTextOptions = {},
): Promise<AuditResult> {
  if (!draft.trim()) return { hadIssues: false, findings: [], revised: draft };

  try {
    const session = newSession({ evidence });

    // Step 1: critic verifies the draft against the evidence.
    const criticInput = `## EVIDENCE\n${evidence}\n\n## DRAFT\n${draft}`;
    const criticResult = await criticAgent.run(criticInput, session, model);

    // G24-D: the deterministic filter drops the classes of critic line the
    // 09:02 showcase run showed to be noise (see filterCriticFindings); a
    // NEEDS_REVISION verdict with nothing left after the filter is ACCURATE.
    const rawFindings = parseFindings(criticResult.output);
    const filtered = filterCriticFindings(rawFindings, draft, options);
    const findings = filtered.kept;

    if (findings.length === 0) {
      return { hadIssues: false, findings: [], revised: draft, droppedFindings: filtered.dropped };
    }

    // Step 2: reviser rewrites only the flagged parts. `critique` + `evidence`
    // are pulled from session state via {key} templating in the instruction.
    // The critique the reviser sees is the FILTERED list — it must not "fix"
    // a disclosed assumption or an action line the filter cleared.
    session.state.critique = findings.map((f) => `- ${f}`).join("\n");
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
      droppedFindings: filtered.dropped,
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

/**
 * LLM-pass cap per report tier (spec §B.9 / §C.1): standard raised 6 → 8 so
 * the eight dimension chapters fit; free 4; premium / investor_memo 16.
 */
export const AUDITOR_CAP_BY_TIER = { free: 4, standard: 8, premium: 16, investor_memo: 16 } as const;

/** A section handed to the sweep. */
export interface AuditableSection {
  /** Stable identity — criterion key, or "executive" for the summary. */
  id: string;
  title: string;
  content: string;
  /** Evidence ids this section is allowed to cite. */
  allowedEvidenceIds?: string[];
  /** G24-D: the citable items behind those ids (label + text) — lets the finding filter check a cited number against its row. */
  citable?: CitableItem[];
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
  /** G24-D: true when the critic (after the deterministic filter) objected — the reviser then ran. */
  hadIssues: boolean;
  /** G24-D: critic lines the filter dropped, kept for the audit dump. */
  droppedFindings: string[];
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
  /** Critic→reviser passes in flight at once (default AUDITOR_CONCURRENCY = 4). */
  concurrency?: number;
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

  const concurrency = Math.max(1, options.concurrency ?? AUDITOR_CONCURRENCY);

  // Stage 1 (free, every section) + candidate selection in document order.
  // The LLM pass is then run CONCURRENTLY over the selected sections (W2
  // review: the sequential sweep added ~8 × latency to the A$3 report); the
  // cap and the budget predicate are applied up front so the concurrent
  // batch can never exceed `maxLlmSections` critic→reviser runs.
  const outcomes: SectionAuditOutcome[] = [];
  const candidates: number[] = [];
  let budgetExhausted = false;

  sections.forEach((section, index) => {
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
      hadIssues: false,
      droppedFindings: [],
      modelCalls: 0,
    };

    if (!section.content.trim()) {
      outcomes.push({ ...base, grounded: true, skipped: "clean" });
      return;
    }
    if (llmOnlyWhenUncited && grounded) {
      outcomes.push({ ...base, skipped: "clean" });
      return;
    }
    if (candidates.length >= maxLlmSections) {
      outcomes.push({ ...base, skipped: "cap" });
      return;
    }
    if (budgetExhausted || !budgetOk()) {
      budgetExhausted = true;
      outcomes.push({ ...base, skipped: "budget" });
      return;
    }
    candidates.push(index);
    outcomes.push(base);
  });

  // Bounded-concurrency worker pool over the candidates.
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < candidates.length) {
      const index = candidates[cursor++];
      const section = sections[index];
      const base = outcomes[index];
      const result = await auditText(section.content, evidence, model, maxTokens, { allowedEvidenceIds: section.allowedEvidenceIds, citable: section.citable });
      outcomes[index] = {
        ...base,
        revised: result.revised,
        findings: result.findings,
        llmAudited: true,
        hadIssues: result.hadIssues,
        droppedFindings: result.droppedFindings ?? [],
        // critic always runs; the reviser only runs when the critic objected.
        modelCalls: result.hadIssues ? 2 : 1,
        grounded: base.grounded && !result.hadIssues,
      };
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, candidates.length) }, () => worker()));

  return outcomes;
}

/** Default number of critic→reviser passes in flight at once. */
export const AUDITOR_CONCURRENCY = 4;

// ── Stage 1: deterministic citation gate ──────────────────────────────────────


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

  // G24-D: a shortened id that names one allowed row is that row; a table
  // under an "(estimates)" caption / header is a declared-estimate table.
  const expanded = expandShortCitations(text, allowedIds);
  const lines = expanded.split("\n");
  const declared = declaredTableRows(expanded);

  outer: for (let i = 0; i < lines.length; i += 1) {
    if (declared[i]) continue;
    for (const claim of splitClaims(lines[i]!)) {
      if (!isMaterialClaim(claim)) continue;
      // G24-D: window-tagged action lines are targets, not claims (claim-gate.ts).
      if (isPrescriptiveClaim(claim)) continue;
      if (hasCitationOrMarker(claim, allowed)) continue;

      flagged.push(claim.length > 220 ? `${claim.slice(0, 217)}...` : claim);
      if (flagged.length >= limit) break outer;
    }
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
      if (text && !/^none\b/i.test(text)) findings.push(text);
    }
  }

  return findings.slice(0, 8);
}

// ── G24-D: deterministic finding filter ───────────────────────────────────────
//
// The 09:02 showcase run's critic lines fell into four classes that are not
// grounding failures: (1) "… No finding here." / "… this is supported" lines
// the parser counted as findings; (2) sentences the writer had already marked
// "(unevidenced)" / "assuming …"; (3) sentences citing a register row whose
// numbers ARE in that row (the critic had not been given the catalogue);
// (4) window-tagged action-plan lines. Every dropped line is kept on the
// outcome (`droppedFindings`) so the audit dump still shows it.

/** The claim a critic line quotes — the longest "…" / “…” run, else the text before the first " — ". */
export function quotedClaimOf(finding: string): string {
  const quotes = Array.from(finding.matchAll(/["“]([^"”]{8,})["”]/g), (m) => m[1]!);
  if (quotes.length) return quotes.sort((a, b) => b.length - a.length)[0]!;
  const dash = finding.split(/\s[—–-]{1,2}\s/)[0] ?? finding;
  return dash.trim();
}

const NON_FINDING_RE = /\b(?:no findings? here|not a finding|this is (?:accurate|supported|fine|correct)|(?:is|are) (?:a )?reasonable inference|(?<!no such )(?<!not a )(?:claim|statement|figure) (?:that )?is (?:accurate|supported)|no finding\.?$)/i;

const ADVICE_RE = /\b(?:should|could|would|recommend(?:ed|s|ation)?|consider|essential|needs? to|must|ought to|advis(?:e|able)|prioriti[sz]e)\b/i;
const RATING_RE = /\b[1-5](?:\.\d)?\s?\/\s?5\b|\brat(?:ed|ing)\b/i;

/** Capitalised words (≥ 4 letters, not sentence-initial) the critic quoted — customer / investor / product names. */
function properNounsIn(text: string): string[] {
  const words = text.replace(/[“”"']/g, " ").split(/\s+/);
  const out: string[] = [];
  for (let i = 1; i < words.length; i += 1) {
    const w = words[i]!.replace(/[^A-Za-z0-9.&-]/g, "");
    if (/^[A-Z][A-Za-z0-9.&-]{3,}$/.test(w) && !/^(?:The|This|That|These|Those|With|From|Over|Under|After|Before|Which|While|When|Where|What|Their|There|Australia|Australian)$/.test(w)) out.push(w.toLowerCase());
  }
  return out;
}

export function filterCriticFindings(findings: string[], draft: string, options: AuditTextOptions = {}): { kept: string[]; dropped: string[] } {
  const kept: string[] = [];
  const dropped: string[] = [];
  const allowed = new Set((options.allowedEvidenceIds ?? []).map((id) => id.toLowerCase()));
  const items = new Map((options.citable ?? []).map((i) => [i.id.toLowerCase(), i]));
  const draftLines = splitClaims(draft);
  for (const finding of findings) {
    const quoted = quotedClaimOf(finding);
    // The sentence as the DRAFT carries it (the critic usually trims the marker off its quote).
    const probe = quoted.replace(/\s*\[ev:[^\]]*\]/gi, "").slice(0, 60).trim();
    const inDraft = (probe.length >= 8 && draftLines.find((l) => l.includes(probe))) || quoted;
    if (NON_FINDING_RE.test(finding)) { dropped.push(finding); continue; }
    // The marker must sit in the DRAFT sentence — the critic's own wording
    // ("this is an estimate…") is not the draft's admission (review G24 P2).
    if (UNEVIDENCED_MARKERS.test(inDraft)) { dropped.push(finding); continue; }
    if (isPrescriptiveClaim(inDraft)) { dropped.push(finding); continue; }
    // Advice without a strong specific ("the next roles should be filled in
    // this order…", "an advisory board would de-risk…") is the analyst's plan,
    // not a claim — a "should" sentence that states money / % / a multiple is
    // still checked.
    if (ADVICE_RE.test(inDraft) && !numericTokens(inDraft.replace(EV_MARKER_RE, "")).some((t) => t.strong)) { dropped.push(finding); continue; }
    // An analyst rating ("Network effects: 3/5") is a judgement the template
    // asks for, not a measured fact — unless the line also states money / % / a multiple.
    if (RATING_RE.test(quoted) && !numericTokens(inDraft.replace(EV_MARKER_RE, "")).some((t) => t.strong)) { dropped.push(finding); continue; }
    const cited = Array.from(inDraft.matchAll(EV_MARKER_RE), (m) => m[1]!.trim().toLowerCase()).filter((id) => allowed.has(id));
    if (cited.length) {
      const tokens = numericTokens(inDraft.replace(EV_MARKER_RE, ""));
      const rows = cited.map((id) => items.get(id)).filter((i): i is CitableItem => Boolean(i));
      const everyNumberInRows = tokens.every((tok) => rows.some((r) => itemHasNumber(r.text, tok)));
      // A cited sentence whose numbers are all in the row is supported. A
      // cited sentence with NO numbers is dropped only when the proper nouns
      // the critic quotes appear in the cited rows — a fabricated customer or
      // investor name next to a real id stays a finding (review G24 P2).
      if (rows.length > 0 && tokens.length && everyNumberInRows) { dropped.push(finding); continue; }
      if (!tokens.length && rows.length > 0 && properNounsIn(quoted).every((n) => rows.some((r) => r.text.toLowerCase().includes(n)))) { dropped.push(finding); continue; }
    }
    kept.push(finding);
  }
  return { kept, dropped };
}
