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
  BENCHMARK_FOOTER,
  BENCHMARK_TAG,
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
// The rule that governs the whole first analysis: every number the report
// asserts ABOUT THE COMPANY traces to an input or a stated assumption. A
// weak fallback model can still write "the indicative valuation is A$300k"
// when the founder's ask was A$300k and the range on screen is
// A$5.0M–A$10.8M (2026-09-15 smoke, Groq allam-2-7b).
//
// What the check must NOT do is reject advice. The CHRO quoting an AU
// salary range ($70k–$85k), the CFO splitting a budget, the CPO pricing a
// tool are benchmarks — market references the founder asked for — and the
// 2026-09-15 09:18 UTC run lost four of seven sections to exactly that
// ("ungrounded dollar figures after retry ($70k, $85k)"). So:
//
//   1. OWN-FACT figures — a dollar amount the sentence asserts as the
//      company's own number ("your valuation is A$42M", "valued at",
//      "is worth", "you have generated A$…", "your cap of A$…") — must
//      match an input figure or a figure the deterministic valuation
//      produced, within ±10 %. Anything else is rejected and retried with
//      a correction; a second miss fails the section.
//   2. Any OTHER A$/$ figure is allowed and tagged "(benchmark — not from
//      your data)" on its first occurrence in the section, and the section
//      carries the list so the page and the PDF can print the footer
//      "Figures marked as benchmarks are market references, not your data".
//   3. A figure presented as THE valuation ("valuation of A$X", "valued at
//      A$X", "worth A$X" with no benchmark word in reach) must be one of
//      the range's own figures — the founder's ask or cap can never be
//      restated as the valuation.

const AMOUNT_RE = /(?:A\$|AUD\s?|\$)\s?\d[\d,]*(?:\.\d+)?\s?(?:k|m|b|bn|million|thousand|billion)?/gi;
/** Words that mark a figure as a benchmark or a cost rather than the founder's number. */
const BENCHMARK_WORDS =
  /\b(?:typical|typically|benchmark|median|comparable|peers?|companies at|startups at|rounds?|average|market rate|salar\w*|grants?|programmes?|programs?|incentives?|fees?|costs?|budgets?|spend|prices?|per (?:month|year|seat|user))\b/;

/** The company's own quantities — the nouns an "own-fact" sentence names. */
const OWN_NOUNS =
  "(?:valuation|pre-money|post-money|pre money|post money|revenue|mrr|arr|raise|ask|round|runway|burn(?: rate)?|cap|valuation cap|safe cap|cash|bank balance|turnover|sales|income|profit|margin)";
/** Verbs / prepositions that pin a figure to that noun. */
const OWN_LINK = "(?:is|are|was|were|of|at|=|sits at|stands at|comes to|totals?|equals?|reached|reaches|hit|hits)";
/** Softeners a writer may drop between the link and the figure. */
const APPROX = "(?:around|about|roughly|approximately|approx\\.?|circa|c\\.|~|some|only|just|currently|now|already|today|at)?";
/**
 * Own-fact patterns, anchored to the end of the text BEFORE the figure
 * (which is where the amount sits). `[^.;:\n]{0,40}` keeps the match
 * inside one clause so "your runway. A typical seed round of A$1.5M" is
 * not read as "your … of A$1.5M".
 */
const OWN_FACT_RE = new RegExp(
  "(?:" +
    [
      `\\byour\\s+(?:current\\s+|stated\\s+|indicative\\s+|existing\\s+|monthly\\s+|annual\\s+)?${OWN_NOUNS}\\b[^.;:\\n]{0,40}?\\s${OWN_LINK}\\s+${APPROX}\\s*`,
      `\\byour\\s+(?:current\\s+|stated\\s+|indicative\\s+)?${OWN_NOUNS}\\s+(?:of|at)\\s+${APPROX}\\s*`,
      `\\bvalued\\s+at\\s+${APPROX}\\s*`,
      `\\b(?:is|are|be|being)\\s+worth\\s+${APPROX}\\s*`,
      `\\byou(?:'ve|\\s+have|\\s+had)?\\s+(?:have\\s+|already\\s+)?(?:generated|earned|raised|made|booked|banked|secured|closed|collected|billed|invoiced)\\s+${APPROX}\\s*`,
      `\\b(?:you\\s+are|you're)\\s+(?:currently\\s+)?(?:raising|asking for|seeking|burning|making|generating|earning)\\s+${APPROX}\\s*`,
      `\\b(?:the\\s+)?company(?:'s)?\\s+(?:${OWN_NOUNS}\\s+)?(?:is|of|at|generates|earns|makes)\\s+${APPROX}\\s*`,
    ].join("|") +
    ")$",
  "i",
);

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

/** Two amounts agree within `tolerance` (default ±10 %) — the rounding a writer applies (A$7.7M vs 7,737,500). */
export function sameAmount(a: number, b: number, tolerance = 0.1): boolean {
  if (a === b) return true;
  const scale = Math.max(Math.abs(a), Math.abs(b));
  if (scale === 0) return true;
  return Math.abs(a - b) / scale <= tolerance;
}

/** Tighter match for the benchmark exemption: a quoted figure is the founder's own only when it is a plain rounding of one. */
const FOUNDER_FIGURE_TOLERANCE = 0.05;

/**
 * The founder's own figures: what the input says, and the range the
 * deterministic valuation produced from it. A figure that matches one of
 * these is never tagged as a benchmark.
 */
export function founderFigures(g: AgentGrounding): number[] {
  return [
    ...amountsIn(g.rawExcerpt),
    ...g.echo.rows.flatMap((r) => amountsIn(r.value ?? "")),
    ...g.echo.claims.flatMap((c) => amountsIn(c.text)),
    ...g.valuation.methods.flatMap((m) => [m.lowAud, m.midAud, m.highAud]),
    g.valuation.lowAud,
    g.valuation.midAud,
    g.valuation.highAud,
    ...(g.valuation.askAud ? [g.valuation.askAud] : []),
    ...(g.valuation.statedCapAud ? [g.valuation.statedCapAud] : []),
  ].filter((n) => Number.isFinite(n) && n > 0);
}

/**
 * Every figure the writer may state as the company's own: the founder's
 * figures plus what the valuation's stated assumptions derive from them
 * (ARR from MRR, the stage medians, the Berkus caps). Wider than
 * `founderFigures` because "your ARR is A$112,800" is a fair own-fact when
 * the input gave MRR A$9,400 — but those derived numbers are still tagged
 * when quoted as advice, because they are not the founder's data.
 */
export function groundedFigures(g: AgentGrounding): number[] {
  return [
    ...founderFigures(g),
    ...g.valuation.assumptions.flatMap(amountsIn),
    ...g.valuation.methods.flatMap((m) => m.assumptions.flatMap(amountsIn)),
    2_000_000, // the Berkus pillar cap named in the assumptions
  ].filter((n) => Number.isFinite(n) && n > 0);
}

export { BENCHMARK_TAG, BENCHMARK_FOOTER };

export interface GroundingVerdict {
  ok: boolean;
  /** Amounts asserted as the company's own facts that the grounding does not carry. */
  ungrounded: string[];
  /** Amounts presented as the valuation that are not the range's figures. */
  misstatedValuation: string[];
  /** Advice / market figures — allowed, and tagged in the served body. */
  benchmarks: string[];
}

export function checkGrounding(body: string, g: AgentGrounding): GroundingVerdict {
  const allowed = groundedFigures(g);
  const founders = founderFigures(g);
  const rangeOnly = [g.valuation.lowAud, g.valuation.midAud, g.valuation.highAud];

  const ungrounded: string[] = [];
  const misstated: string[] = [];
  const benchmarks: string[] = [];
  for (const m of body.matchAll(AMOUNT_RE)) {
    const raw = m[0].trim();
    const n = amountToNumber(raw);
    if (!Number.isFinite(n) || n === 0) continue;
    const idx = m.index ?? 0;
    const before = body.slice(Math.max(0, idx - 110), idx).toLowerCase();
    const grounded = allowed.some((a) => sameAmount(a, n));
    const founderFigure = founders.some((a) => sameAmount(a, n, FOUNDER_FIGURE_TOLERANCE));
    // A figure the writer has labelled as a benchmark is advice by rule 1
    // of the system prompt ("name it as a benchmark, not as the founder's
    // number") — never the company's own fact.
    const benchmarkish = BENCHMARK_WORDS.test(before);
    const ownFact = !benchmarkish && OWN_FACT_RE.test(before.slice(-90));
    if (ownFact) {
      if (!grounded && !ungrounded.includes(raw)) ungrounded.push(raw);
    } else if (!founderFigure && !benchmarks.includes(raw)) {
      benchmarks.push(raw);
    }
    // "valuation … of A$X", "valued at A$X", "worth A$X" about THIS company:
    // the word leads, and no benchmark word softens it.
    const near = before.slice(-45);
    if (
      !benchmarkish &&
      /\bvaluation\b|\bvalued at\b|\bworth\b/.test(near) &&
      !rangeOnly.some((a) => sameAmount(a, n)) &&
      !misstated.includes(raw)
    ) {
      misstated.push(raw);
    }
  }
  return { ok: ungrounded.length === 0 && misstated.length === 0, ungrounded, misstatedValuation: misstated, benchmarks };
}

/**
 * Append the benchmark marker to the FIRST occurrence of each benchmark
 * figure in the text. Idempotent: a figure already followed by the marker
 * is left alone.
 */
export function tagBenchmarks(text: string, benchmarks: string[]): string {
  let out = text;
  for (const fig of benchmarks) {
    const escaped = fig.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // The figure must not be a prefix of a longer amount ("$70k" inside
    // "$70k" only, never "$7" inside "$70k"), and must not already be tagged.
    const re = new RegExp(`${escaped}(?![\\d,.]|\\s?(?:k|m|b|bn|million|thousand|billion)\\b)(?!\\s*\\(benchmark)`, "i");
    if (!re.test(out)) continue;
    out = out.replace(re, `${fig} ${BENCHMARK_TAG}`);
  }
  return out;
}

export function isAcceptable(p: ParsedAgentText | null): boolean {
  return Boolean(p && p.wordCount >= AGENT_SECTION_MIN_WORDS && p.nextSteps.length >= AGENT_NEXT_STEPS);
}

// ── One agent, start to finish ───────────────────────────────────────────

export class AgentSectionError extends Error {
  readonly role: FirstAnalysisAgent;
  /** Provider / model of the attempt that was rejected — kept so the
   *  report's per-section state can say which model failed. */
  readonly provider?: string;
  readonly model?: string;
  constructor(role: FirstAnalysisAgent, message: string, served?: { provider?: string; model?: string }) {
    super(`${role}: ${message}`);
    this.name = "AgentSectionError";
    this.role = role;
    this.provider = served?.provider;
    this.model = served?.model;
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

  // Only an own-fact miss or a misstated valuation earns the correction
  // retry — benchmark figures are advice: tagged, never retried.
  if (!isAcceptable(parsed) || (grounded && !grounded.ok)) {
    const why = !parsed
      ? "your previous answer could not be read"
      : parsed.wordCount < AGENT_SECTION_MIN_WORDS
        ? `your previous answer was ${parsed.wordCount} words; at least ${AGENT_SECTION_MIN_WORDS} are required`
        : parsed.nextSteps.length < AGENT_NEXT_STEPS
          ? `your previous answer had ${parsed.nextSteps.length} next steps; exactly ${AGENT_NEXT_STEPS} are required`
          : grounded?.misstatedValuation.length
            ? `your previous answer presented ${grounded.misstatedValuation.join(", ")} as the valuation; the indicative range is ${aud(grounding.valuation.lowAud)} – ${aud(grounding.valuation.highAud)} and no other figure may be called the valuation`
            : `your previous answer stated ${grounded?.ungrounded.join(", ")} as this company's own figure, but that figure is not in the facts above; state only the figures given as the founder's, or say the figure was not provided (a market benchmark is fine when you name it as one)`;
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

  if (!parsed) throw new AgentSectionError(role, "model answer could not be parsed", served);
  if (grounded && grounded.misstatedValuation.length > 0) {
    throw new AgentSectionError(role, `misstated the valuation after retry (${grounded.misstatedValuation.join(", ")})`, served);
  }
  if (grounded && grounded.ungrounded.length > 0) {
    throw new AgentSectionError(role, `ungrounded own-fact dollar figures after retry (${grounded.ungrounded.join(", ")})`, served);
  }
  // Accept a slightly short section rather than lose the voice entirely, but
  // never one under two-thirds of the floor — that is a refusal, not prose.
  if (parsed.wordCount < Math.floor(AGENT_SECTION_MIN_WORDS * 0.66)) {
    throw new AgentSectionError(role, `section too short after retry (${parsed.wordCount} words)`, served);
  }
  if (parsed.nextSteps.length === 0) throw new AgentSectionError(role, "no next steps after retry", served);

  // Benchmarks in the next steps count too — the founder reads them as one
  // section. The first occurrence across body then steps gets the marker.
  const bodyBenchmarks = grounded?.benchmarks ?? [];
  const stepBenchmarks = checkGrounding(parsed.nextSteps.join("\n"), grounding).benchmarks.filter((b) => !bodyBenchmarks.includes(b));
  const benchmarks = [...bodyBenchmarks, ...stepBenchmarks];
  const body = tagBenchmarks(parsed.body, benchmarks);
  const stillUntagged = benchmarks.filter((b) => !body.includes(`${b} ${BENCHMARK_TAG}`));
  const nextSteps = stillUntagged.length ? tagStepsOnce(parsed.nextSteps, stillUntagged) : parsed.nextSteps;

  return {
    role,
    title: parsed.title,
    body,
    nextSteps,
    wordCount: parsed.wordCount,
    provider: served.provider,
    model: served.model,
    taskClass,
    generatedAt: now().toISOString(),
    ...(benchmarks.length ? { benchmarkFigures: benchmarks } : {}),
  };
}

/** Tag each figure once across an ordered list of steps. */
function tagStepsOnce(steps: string[], benchmarks: string[]): string[] {
  const pending = new Set(benchmarks);
  return steps.map((step) => {
    if (pending.size === 0) return step;
    const after = tagBenchmarks(step, [...pending]);
    for (const b of [...pending]) {
      if (after.includes(`${b} ${BENCHMARK_TAG}`) && !step.includes(`${b} ${BENCHMARK_TAG}`)) pending.delete(b);
    }
    return after;
  });
}
