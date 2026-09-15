// C-level commentary for the first analysis (S32-B).
//
// Seven voices — CEO, CFO, CMO, CTO, CPO, CLO, CHRO — each one model call,
// each grounded on the input echo and the SVI the founder can see on screen.
// The system prompt reuses the report pipeline's role definitions
// (`AGENT_PROMPTS`) and its AU context, then adds the three rules that make
// the first analysis trustworthy:
//
//   1. cite only what is in the echo / SVI; a missing fact is said to be
//      missing, with what to add — never invented;
//   2. mentoring tone, step by step from Day 0, Australian English;
//   3. at least AGENT_SECTION_MIN_WORDS words and exactly three next steps.
//
// The model call is injected (`AgentCaller`) so the runner can pass the
// platform's `callAI` with `priority: "user"` and the task class of the
// voice (`synthesis` for the CEO summary, `report` for the rest — S32-C), and
// tests can pass a stub. No `server-only` here: the parser is pure and its
// suite runs without a Next runtime.

import { AGENT_PROMPTS, AU_CONTEXT } from "@/lib/report-pipeline/agent-prompts";
import { echoToPromptBlock, type InputEcho } from "@/lib/analyses/input-echo";
import {
  AGENT_META,
  AGENT_NEXT_STEPS,
  AGENT_SECTION_MIN_WORDS,
  countWords,
  type AgentSection,
  type FirstAnalysisAgent,
  type SviSection,
  type ValuationSection,
} from "./types";

export interface AgentCallRequest {
  system: string;
  user: string;
  maxTokens: number;
  agentId: string;
  /** S32-C — routes the dispatcher: the CEO summary is `synthesis`
   *  (Opus 5 / DeepSeek-V4-Flash / Gemini 3.1 Pro), every other voice is a
   *  `report` section. */
  taskClass: "report" | "synthesis";
}

/** The CEO voice is the executive synthesis; the other six are report sections. */
export function taskClassForRole(role: FirstAnalysisAgent): "report" | "synthesis" {
  return role === "ceo" ? "synthesis" : "report";
}

export interface AgentCallResult {
  text: string;
  /** Dispatcher provider that served it (`deepinfra`, `gemini`, `claude-oauth`, …). */
  provider?: string;
  model?: string;
}

export type AgentCaller = (req: AgentCallRequest) => Promise<AgentCallResult>;

/** What every agent is told about this startup. */
export interface AgentGrounding {
  company: string;
  echo: InputEcho;
  svi: SviSection;
  valuation: ValuationSection;
  /** Raw input, clipped — the agent may quote it but must not go beyond it. */
  rawExcerpt: string;
}

const RAW_EXCERPT_CHARS = 6_000;

export function clipRaw(rawText: string | null | undefined): string {
  const v = (rawText ?? "").replace(/\r/g, "").trim();
  return v.length <= RAW_EXCERPT_CHARS ? v : `${v.slice(0, RAW_EXCERPT_CHARS)}\n[… input continues; ${v.length - RAW_EXCERPT_CHARS} more characters were read for the score]`;
}

function aud(n: number): string {
  if (n >= 1_000_000) return `A$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `A$${Math.round(n / 1_000)}K`;
  return `A$${Math.round(n).toLocaleString("en-AU")}`;
}

/** Per-role focus on top of the shared rules. Short, because the role prompt already carries the expertise. */
const ROLE_FOCUS: Record<FirstAnalysisAgent, string> = {
  ceo:
    "Write the strategy summary a founder reads first. Say plainly where this startup is (the stage and what the index means at that stage), the single biggest gap between the current evidence and the next milestone, and the one thing to do this week. Refer to the valuation range as indicative and explain in one sentence what would move it.",
  cfo:
    "Explain what the indicative valuation rests on (which methods, which assumptions, which inputs were missing), what a revenue figure or a signed customer would change, and lay out a money plan for the next 90 days: what to spend on, what to track (MRR, burn, runway) and which AU programme (R&D Tax Incentive, ESIC) is worth checking now. Do not invent revenue, burn or runway numbers.",
  cmo:
    "Describe the customer and the buying trigger as far as the input supports it, name what is missing to size the market honestly, and give a first-customers plan: three channels that suit this sector in Australia, the message to test, and how to know in 30 days whether it worked.",
  cto:
    "Assess what exists (prototype, product, website, code) from the evidence, name the build-vs-buy calls for the next version, the top technical risk, and a 30-day build plan that gets to something a customer can touch. Avoid recommending stacks unless the input names one.",
  cpo:
    "Assess problem clarity and validation evidence (interviews, waitlist, pilots, usage). State exactly what proof exists and what proof is missing, then give a validation plan with step-by-step customer conversations and the metric that would show the problem is real and worth paying for.",
  clo:
    "Cover the structure and compliance items that bite an Australian startup early: company registration and ABN, founder agreements and vesting, IP assignment, ESIC eligibility, privacy obligations if user data is handled, and any sector-specific licence the input hints at. Say which of these the input evidences and which it does not.",
  chro:
    "Assess the team as described (and say when it is not described): the missing skill for this stage, whether to hire, contract or find a co-founder, how to bring an early hire in (ESOP under the AU start-up concession, salary benchmark ranges only if the role is clear), and the 30-day people plan.",
};

export function buildAgentSystemPrompt(role: FirstAnalysisAgent): string {
  const def = AGENT_PROMPTS[role];
  const meta = AGENT_META[role];
  return `${AU_CONTEXT}

## Your Role: ${def.role}
${def.expertise}

## This is the founder's FIRST analysis on BlockID (free tier)
You are one of seven C-level voices writing one section each. The founder sees the "What we read" table and the SVI on screen. ${meta.lens}.

## Rules you must follow
1. GROUNDING: use only the facts in the WHAT WE READ table, the SVI, the valuation block and the input excerpt. Where a fact is missing, say it is missing ("you have not told us …") and say what to add. Never invent revenue, users, team size, market size or dates. If you cite a benchmark, name it as a benchmark, not as the founder's number.
2. TONE: a senior mentor coaching a founder — direct, warm, specific. Step-by-step guidance from Day 0. Australian English (organise, programme, licence). No hype.
3. LENGTH: at least ${AGENT_SECTION_MIN_WORDS} words of commentary in flowing paragraphs, then exactly ${AGENT_NEXT_STEPS} next steps.
4. FORMAT — plain text, no markdown headings, no bullet lists inside the body:
TITLE: <one line, specific to this startup>
<paragraphs separated by blank lines>
NEXT:
1. <first step — concrete, doable this week>
2. <second step>
3. <third step>

## Your focus
${ROLE_FOCUS[role]}`;
}

export function buildAgentUserPrompt(g: AgentGrounding): string {
  const top = [...g.svi.dimensions].sort((a, b) => b.score - a.score);
  const strongest = top.slice(0, 2).map((d) => `${d.label} ${d.score}/100`).join(", ");
  const weakest = top.slice(-2).reverse().map((d) => `${d.label} ${d.score}/100`).join(", ");
  const gaps = g.svi.evidenceGaps.slice(0, 5).map((x) => `- [${x.priority}] ${x.label}: ${x.action}`).join("\n");
  return `# WHAT WE READ (the only facts you may rely on)
${echoToPromptBlock(g.echo)}

# SVI
Startup Value Index: ${g.svi.total} (baseline 100, net ${g.svi.netAdjustment >= 0 ? "+" : ""}${g.svi.netAdjustment}) · stage: ${g.svi.stageLabel} · evidence confidence ${Math.round(g.svi.confidence * 100)}%
Dimensions: ${g.svi.dimensions.map((d) => `${d.label} ${d.score}/100 (${d.weight})`).join("; ")}
Strongest: ${strongest}. Weakest: ${weakest}.
Evidence gaps:
${gaps || "- none flagged"}

# INDICATIVE VALUATION
Range ${aud(g.valuation.lowAud)} – ${aud(g.valuation.highAud)} (mid ${aud(g.valuation.midAud)}), method: ${g.valuation.method}, basis: ${g.valuation.basis === "revenue" ? "a revenue figure from the input" : "SVI-based — no revenue figure was provided"}.
Assumptions: ${g.valuation.assumptions.join(" ")}

# INPUT EXCERPT
"""
${g.rawExcerpt || "(no text was provided)"}
"""

Write your section for ${g.company} now.`;
}

// ── Parsing ──────────────────────────────────────────────────────────────

export interface ParsedAgentText {
  title: string;
  body: string;
  nextSteps: string[];
  wordCount: number;
}

/**
 * Read the TITLE / body / NEXT contract back out of the model text.
 * Tolerant of markdown that slipped through (a leading "#", "**bold**", a
 * "Next steps:" heading) — the rules ask for plain text but a model that
 * bolds the title should not fail the section.
 */
/** A leaked chain-of-thought paragraph ("We need to write a section for…"). */
const REASONING_LEAD = /^\s*(we need to|i need to|i should|let me|let's|the user|okay,|ok,|first,|thinking:|analysis:|reasoning:)/i;

export function parseAgentText(text: string): ParsedAgentText | null {
  const clean = text.replace(/\r/g, "").replace(/\*\*/g, "").trim();
  if (!clean) return null;
  const lines = clean.split("\n");

  let title = "";
  let bodyStart = 0;
  // The TITLE line may sit after leaked reasoning (nemotron, 2026-09-15
  // smoke) — look further than the first few lines for it.
  for (let i = 0; i < Math.min(lines.length, 40); i++) {
    const m = /^\s*#*\s*TITLE\s*:\s*(.+)$/i.exec(lines[i]);
    if (m) {
      title = m[1].trim();
      bodyStart = i + 1;
      break;
    }
  }
  if (!title) {
    // Fall back to the first non-empty line that does not read as the
    // model talking to itself.
    let idx = lines.findIndex((l) => l.trim().length > 0);
    while (idx >= 0 && idx < lines.length && REASONING_LEAD.test(lines[idx])) {
      // Skip that paragraph entirely.
      while (idx < lines.length && lines[idx].trim().length > 0) idx += 1;
      while (idx < lines.length && lines[idx].trim().length === 0) idx += 1;
    }
    if (idx < 0 || idx >= lines.length) return null;
    title = lines[idx].replace(/^#+\s*/, "").trim();
    bodyStart = idx + 1;
  }

  const nextIdx = lines.findIndex(
    (l, i) => i >= bodyStart && /^\s*#*\s*(NEXT(\s+STEPS)?|RECOMMENDED ACTIONS?|NEXT ACTIONS?)\s*:?\s*$/i.test(l),
  );
  let bodyEnd = nextIdx >= 0 ? nextIdx : lines.length;
  let stepStart = nextIdx >= 0 ? nextIdx + 1 : lines.length;
  if (nextIdx < 0) {
    // No NEXT marker (a model that ran out of tokens mid-format, or wrote
    // the list straight after a "these three actions:" sentence). Take the
    // trailing numbered list as the steps — it is what the founder would
    // read as the steps anyway.
    let i = lines.length - 1;
    while (i >= bodyStart && !lines[i].trim()) i -= 1;
    let firstNumbered = -1;
    for (; i >= bodyStart; i -= 1) {
      if (/^\s*\d+[.)]\s+\S/.test(lines[i])) firstNumbered = i;
      else if (lines[i].trim()) break;
    }
    if (firstNumbered > bodyStart) {
      bodyEnd = firstNumbered;
      stepStart = firstNumbered;
    }
  }
  const bodyLines = lines.slice(bodyStart, bodyEnd);
  const stepLines = lines.slice(stepStart);

  const body = bodyLines
    .join("\n")
    .replace(/^\s*#+\s*/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const nextSteps: string[] = [];
  for (const raw of stepLines) {
    const numbered = /^\s*\d+[.)]\s*(.+)$/.exec(raw);
    const bullet = /^\s*[-*•]\s*(.+)$/.exec(raw);
    const prev = nextSteps[nextSteps.length - 1];
    // A numbered label ("Revenue generation:") followed by a bullet is one
    // step, not two — the bullet is the step's body.
    if (numbered) nextSteps.push(numbered[1].trim());
    else if (bullet && prev !== undefined && /:\s*$/.test(prev)) nextSteps[nextSteps.length - 1] = `${prev} ${bullet[1].trim()}`;
    else if (bullet) nextSteps.push(bullet[1].trim());
    else if (raw.trim() && prev !== undefined) {
      // Continuation of the previous step.
      nextSteps[nextSteps.length - 1] += ` ${raw.trim()}`;
    }
  }

  if (!body) return null;
  return {
    title: title.slice(0, 160),
    body,
    nextSteps: nextSteps.slice(0, AGENT_NEXT_STEPS),
    wordCount: countWords(body),
  };
}

// ── Grounding check ──────────────────────────────────────────────────────
//
// The rule that governs the whole first analysis: every number traces to an
// input or a stated assumption. A weak fallback model can still write
// "the indicative valuation is A$300k" when the founder's ask was A$300k
// and the range on screen is A$5.0M–A$10.8M (2026-09-15 smoke, Groq
// allam-2-7b). Two deterministic checks catch the common fabrications:
//   1. every A$/$ amount in the body must appear in the grounding — the echo
//      rows and claims, the raw excerpt, the valuation range or its
//      assumptions (percentages are allowed: they are benchmarks by rule);
//   2. an amount within reach of the word "valuation" must be one of the
//      range's own figures, so the founder's ask or a benchmark can never be
//      presented as the valuation.

const AMOUNT_RE = /(?:A\$|AUD\s?|\$)\s?\d[\d,]*(?:\.\d+)?\s?(?:k|m|b|bn|million|thousand|billion)?/gi;
/** Words that mark a figure as a benchmark or a cost rather than the founder's number. */
const BENCHMARK_WORDS =
  /typical|benchmark|median|comparable|peers?\b|companies at|startups at|rounds?\b|average|market rate|salar|grant|programme|program\b|incentive|fee|cost|budget|spend|price|per (?:month|year|seat|user)/;

function amountToNumber(raw: string): number {
  const m = /(\d[\d,]*(?:\.\d+)?)\s?(k|m|b|bn|million|thousand|billion)?/i.exec(raw);
  if (!m) return NaN;
  const n = Number.parseFloat(m[1].replace(/,/g, ""));
  const u = (m[2] ?? "").toLowerCase();
  if (u === "k" || u === "thousand") return n * 1_000;
  if (u === "m" || u === "million") return n * 1_000_000;
  if (u === "b" || u === "bn" || u === "billion") return n * 1_000_000_000;
  return n;
}

function amountsIn(text: string): number[] {
  return (text.match(AMOUNT_RE) ?? []).map(amountToNumber).filter((n) => Number.isFinite(n));
}

/** Two amounts agree within the rounding a writer applies (A$7.7M vs 7,737,500). */
function sameAmount(a: number, b: number): boolean {
  if (a === b) return true;
  const scale = Math.max(Math.abs(a), Math.abs(b));
  if (scale === 0) return true;
  return Math.abs(a - b) / scale <= 0.06;
}

export interface GroundingVerdict {
  ok: boolean;
  /** Amounts the body states that the grounding does not carry. */
  ungrounded: string[];
  /** Amounts presented as the valuation that are not the range's figures. */
  misstatedValuation: string[];
}

export function checkGrounding(body: string, g: AgentGrounding): GroundingVerdict {
  const allowed: number[] = [
    ...amountsIn(g.rawExcerpt),
    ...g.echo.rows.flatMap((r) => amountsIn(r.value ?? "")),
    ...g.echo.claims.flatMap((c) => amountsIn(c.text)),
    ...g.valuation.assumptions.flatMap(amountsIn),
    ...g.valuation.methods.flatMap((m) => [m.lowAud, m.midAud, m.highAud, ...m.assumptions.flatMap(amountsIn)]),
    g.valuation.lowAud,
    g.valuation.midAud,
    g.valuation.highAud,
    2_000_000, // the Berkus pillar cap named in the assumptions
  ];
  const rangeOnly = [g.valuation.lowAud, g.valuation.midAud, g.valuation.highAud];

  const ungrounded: string[] = [];
  const misstated: string[] = [];
  for (const m of body.matchAll(AMOUNT_RE)) {
    const raw = m[0];
    const n = amountToNumber(raw);
    if (!Number.isFinite(n) || n === 0) continue;
    const idx = m.index ?? 0;
    const before = body.slice(Math.max(0, idx - 110), idx).toLowerCase();
    // A figure the writer has labelled as a benchmark is allowed by rule 1
    // of the system prompt ("name it as a benchmark, not as the founder's
    // number"). Unlabelled figures must come from the grounding.
    const benchmarkish = BENCHMARK_WORDS.test(before);
    if (!benchmarkish && !allowed.some((a) => sameAmount(a, n)) && !ungrounded.includes(raw.trim())) {
      ungrounded.push(raw.trim());
    }
    // "valuation … of A$X", "valued at A$X", "worth A$X" about THIS company:
    // the word leads, and no benchmark word softens it.
    const near = before.slice(-45);
    if (
      !benchmarkish &&
      /\bvaluation\b|\bvalued at\b|\bworth\b/.test(near) &&
      !rangeOnly.some((a) => sameAmount(a, n)) &&
      !misstated.includes(raw.trim())
    ) {
      misstated.push(raw.trim());
    }
  }
  return { ok: ungrounded.length === 0 && misstated.length === 0, ungrounded, misstatedValuation: misstated };
}

export function isAcceptable(p: ParsedAgentText | null): boolean {
  return Boolean(p && p.wordCount >= AGENT_SECTION_MIN_WORDS && p.nextSteps.length >= AGENT_NEXT_STEPS);
}

// ── One agent, start to finish ───────────────────────────────────────────

export class AgentSectionError extends Error {
  readonly role: FirstAnalysisAgent;
  constructor(role: FirstAnalysisAgent, message: string) {
    super(`${role}: ${message}`);
    this.name = "AgentSectionError";
    this.role = role;
  }
}

// gpt-oss-class models spend output tokens on hidden reasoning before the
// visible answer; 1,400 truncated the CEO section before its NEXT block in
// the 2026-09-15 smoke. 2,200 leaves room for ~400 words plus the steps.
const MAX_TOKENS = 2_200;

/**
 * Call the model for one role, validate, retry ONCE with an explicit
 * "too short / missing steps" note, and return the section. Throws
 * AgentSectionError when the second attempt is still unusable; the runner
 * records the role as failed and moves on so one bad answer never blocks
 * the other six. A capacity error (`AICapacityError`) is NOT caught here —
 * the runner handles the wait so the honest "queued" state can be shown.
 */
export async function writeAgentSection(
  role: FirstAnalysisAgent,
  grounding: AgentGrounding,
  call: AgentCaller,
  now: () => Date = () => new Date(),
): Promise<AgentSection> {
  const system = buildAgentSystemPrompt(role);
  const user = buildAgentUserPrompt(grounding);
  const agentId = `first-analysis-${role}`;
  const taskClass = taskClassForRole(role);

  const first = await call({ system, user, maxTokens: MAX_TOKENS, agentId, taskClass });
  let parsed: ParsedAgentText | null = parseAgentText(first.text);
  let served = first;
  let grounded: GroundingVerdict | null = parsed ? checkGrounding(parsed.body, grounding) : null;

  if (!isAcceptable(parsed) || (grounded && !grounded.ok)) {
    const why = !parsed
      ? "your previous answer could not be read"
      : parsed.wordCount < AGENT_SECTION_MIN_WORDS
        ? `your previous answer was ${parsed.wordCount} words; at least ${AGENT_SECTION_MIN_WORDS} are required`
        : parsed.nextSteps.length < AGENT_NEXT_STEPS
          ? `your previous answer had ${parsed.nextSteps.length} next steps; exactly ${AGENT_NEXT_STEPS} are required`
          : grounded?.misstatedValuation.length
            ? `your previous answer presented ${grounded.misstatedValuation.join(", ")} as the valuation; the indicative range is ${aud(grounding.valuation.lowAud)} – ${aud(grounding.valuation.highAud)} and no other figure may be called the valuation`
            : `your previous answer used dollar figures that are not in the facts above (${grounded?.ungrounded.join(", ")}); use only the figures given, or say the figure was not provided`;
    const second = await call({
      system,
      user: `${user}\n\nIMPORTANT: ${why}. Rewrite the whole section in the exact TITLE / paragraphs / NEXT format, grounded only on the facts above.`,
      maxTokens: MAX_TOKENS + 400,
      agentId,
      taskClass,
    });
    const reparsed = parseAgentText(second.text);
    const regrounded = reparsed ? checkGrounding(reparsed.body, grounding) : null;
    // Keep whichever attempt is closer to the contract: a grounded,
    // acceptable rewrite always wins; otherwise the longer readable one,
    // unless the first was grounded and the second is not.
    const firstWords = parsed ? parsed.wordCount : 0;
    const secondBetter =
      (isAcceptable(reparsed) && regrounded?.ok === true) ||
      (reparsed !== null && reparsed.wordCount > firstWords && !(grounded?.ok && regrounded && !regrounded.ok));
    if (secondBetter) {
      parsed = reparsed;
      served = second;
      grounded = regrounded;
    }
  }

  if (!parsed) throw new AgentSectionError(role, "model answer could not be parsed");
  if (grounded && grounded.misstatedValuation.length > 0) {
    throw new AgentSectionError(role, `misstated the valuation after retry (${grounded.misstatedValuation.join(", ")})`);
  }
  if (grounded && grounded.ungrounded.length > 0) {
    throw new AgentSectionError(role, `ungrounded dollar figures after retry (${grounded.ungrounded.join(", ")})`);
  }
  // Accept a slightly short section rather than lose the voice entirely, but
  // never one under two-thirds of the floor — that is a refusal, not prose.
  if (parsed.wordCount < Math.floor(AGENT_SECTION_MIN_WORDS * 0.66)) {
    throw new AgentSectionError(role, `section too short after retry (${parsed.wordCount} words)`);
  }
  if (parsed.nextSteps.length === 0) throw new AgentSectionError(role, "no next steps after retry");

  return {
    role,
    title: parsed.title,
    body: parsed.body,
    nextSteps: parsed.nextSteps,
    wordCount: parsed.wordCount,
    provider: served.provider,
    model: served.model,
    taskClass,
    generatedAt: now().toISOString(),
  };
}
