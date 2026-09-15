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
// platform's `callAI` with `priority: "user"` / `taskClass: "report"`, and
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
}

export interface AgentCallResult {
  text: string;
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
export function parseAgentText(text: string): ParsedAgentText | null {
  const clean = text.replace(/\r/g, "").replace(/\*\*/g, "").trim();
  if (!clean) return null;
  const lines = clean.split("\n");

  let title = "";
  let bodyStart = 0;
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const m = /^\s*#*\s*TITLE\s*:\s*(.+)$/i.exec(lines[i]);
    if (m) {
      title = m[1].trim();
      bodyStart = i + 1;
      break;
    }
  }
  if (!title) {
    // Fall back to the first non-empty line as the title.
    const idx = lines.findIndex((l) => l.trim().length > 0);
    if (idx < 0) return null;
    title = lines[idx].replace(/^#+\s*/, "").trim();
    bodyStart = idx + 1;
  }

  const nextIdx = lines.findIndex(
    (l, i) => i >= bodyStart && /^\s*#*\s*(NEXT(\s+STEPS)?|RECOMMENDED ACTIONS?|NEXT ACTIONS?)\s*:?\s*$/i.test(l),
  );
  const bodyLines = nextIdx >= 0 ? lines.slice(bodyStart, nextIdx) : lines.slice(bodyStart);
  const stepLines = nextIdx >= 0 ? lines.slice(nextIdx + 1) : [];

  const body = bodyLines
    .join("\n")
    .replace(/^\s*#+\s*/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const nextSteps: string[] = [];
  for (const raw of stepLines) {
    const m = /^\s*(?:\d+[.)]|[-*•])\s*(.+)$/.exec(raw);
    if (m) nextSteps.push(m[1].trim());
    else if (raw.trim() && nextSteps.length > 0) {
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

const MAX_TOKENS = 1_400;

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

  const first = await call({ system, user, maxTokens: MAX_TOKENS, agentId });
  let parsed: ParsedAgentText | null = parseAgentText(first.text);
  let served = first;

  if (!isAcceptable(parsed)) {
    const why = !parsed
      ? "your previous answer could not be read"
      : parsed.wordCount < AGENT_SECTION_MIN_WORDS
        ? `your previous answer was ${parsed.wordCount} words; at least ${AGENT_SECTION_MIN_WORDS} are required`
        : `your previous answer had ${parsed.nextSteps.length} next steps; exactly ${AGENT_NEXT_STEPS} are required`;
    const second = await call({
      system,
      user: `${user}\n\nIMPORTANT: ${why}. Rewrite the whole section in the exact TITLE / paragraphs / NEXT format, grounded only on the facts above.`,
      maxTokens: MAX_TOKENS + 400,
      agentId,
    });
    const reparsed = parseAgentText(second.text);
    // Keep whichever attempt is closer to the contract.
    const firstWords = parsed ? parsed.wordCount : 0;
    if (isAcceptable(reparsed) || (reparsed && reparsed.wordCount > firstWords)) {
      parsed = reparsed;
      served = second;
    }
  }

  if (!parsed) throw new AgentSectionError(role, "model answer could not be parsed");
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
    generatedAt: now().toISOString(),
  };
}
