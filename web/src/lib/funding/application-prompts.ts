// Per-grant / per-program application prompts (T0251 + S16-A, plan §4h
// "Application drafts").
//
// `au_grants.application_prompts[]` (migration 0323) carries the questions
// from the official guidelines for the big programs (R&DTI, EMDG, IGP, MVP
// Ventures, Kick-Start, …) — seeded from web/content/data/grants-au.seed.json.
// `au_programs.application_prompts[]` (migration 0329) carries accelerator
// application questions for the 15 programs with the nearest intakes /
// highest profile (Startmate, Antler, EnergyLab, Plus Eight, …) — seeded from
// web/content/data/programs-au.seed.json. Every other grant / program falls
// back to a generic set so a draft is never empty (auto-fill rule).
//
// Pure — no `server-only`, no supabase: the client draft editor imports the
// types + `promptsForGrant` / `promptsForProgram` too.

import { parseApplicationPrompts, type ApplicationPrompt, type AuGrantRow, type AuProgramRow } from "./seed-map";
import { formatAudCompact, formatLooseDate, parseLooseDate } from "./directory";

/** Which catalogue a draft answers — `au_grants` or `au_programs`. */
export type DraftKind = "grant" | "program";

const ROLLING = /^(rolling|open|always|eoi open|ongoing|periodic)/i;

/**
 * One-line intake window for a program (editor subtitle + drafter prompt):
 * "Applications open Sep 2026, close 8 Nov 2026; next cohort 25 Jan 2027" ·
 * "Applications are rolling; next cohort 8 Feb 2027" · null when nothing is
 * recorded. Loose seed strings ("2026-09", "rolling (2 cohorts/yr)") are
 * rendered as-is when they are not dates.
 */
export function programIntakeLabel(p: Pick<AuProgramRow, "applications_open" | "applications_close" | "next_cohort_start">): string | null {
  const open = p.applications_open?.trim() || null;
  const close = p.applications_close?.trim() || null;
  const parts: string[] = [];
  if (parseLooseDate(open) && parseLooseDate(close)) parts.push(`Applications open ${formatLooseDate(open)}, close ${formatLooseDate(close)}`);
  else if (parseLooseDate(close)) parts.push(`Applications close ${formatLooseDate(close)}`);
  else if (parseLooseDate(open)) parts.push(`Applications open ${formatLooseDate(open)}`);
  else if ((open && ROLLING.test(open)) || (close && ROLLING.test(close))) parts.push("Applications are rolling");
  else if (open) parts.push(`Applications: ${open}`);
  if (parseLooseDate(p.next_cohort_start)) parts.push(`next cohort ${formatLooseDate(p.next_cohort_start)}`);
  return parts.length ? parts.join("; ") : null;
}

/** "A$120,000 for ≤8%" · "A$5,000, no equity" · "12% (incl. fee)" · null. */
export function programFundingLabel(p: Pick<AuProgramRow, "funding_aud" | "equity_pct">): string | null {
  const amount = typeof p.funding_aud === "number" && p.funding_aud > 0 ? formatAudCompact(p.funding_aud) : null;
  const equity = p.equity_pct?.trim() || null;
  if (amount && equity) return /^(none|n\/a|no equity)$/i.test(equity) ? `${amount}, no equity` : `${amount} for ${equity}`;
  if (amount) return amount;
  if (equity && !/^(none|n\/a)$/i.test(equity)) return equity;
  return null;
}

export type { ApplicationPrompt } from "./seed-map";
export { parseApplicationPrompts } from "./seed-map";

/** Marks a prompt set that is not from the official guidelines. */
export const GENERIC_GUIDANCE = "generic";

/** Fallback for grants without an official prompt set — the four questions every AU grant form asks. */
export const GENERIC_APPLICATION_PROMPTS: readonly ApplicationPrompt[] = [
  {
    id: "project",
    question: "Describe the project or activity you are seeking funding for and the problem it solves.",
    guidance: GENERIC_GUIDANCE,
    max_words: 300,
  },
  {
    id: "eligibility",
    question: "Explain how your business meets the eligibility criteria (entity type, location, stage, turnover).",
    guidance: GENERIC_GUIDANCE,
    max_words: 150,
  },
  {
    id: "budget",
    question: "Provide the project budget, the amount requested and the source of any co-contribution.",
    guidance: GENERIC_GUIDANCE,
    max_words: 200,
  },
  {
    id: "outcomes",
    question: "What outcomes will the funding deliver — for the business and for the program's objectives — and how will you measure them?",
    guidance: GENERIC_GUIDANCE,
    max_words: 200,
  },
];

/**
 * Fallback for programs without a seeded prompt set — the six questions
 * every accelerator / incubator form asks (problem, solution, traction, team,
 * why this program, 12-month milestones).
 */
export const GENERIC_PROGRAM_APPLICATION_PROMPTS: readonly ApplicationPrompt[] = [
  {
    id: "problem",
    question: "What problem are you solving, who has it, and how do they deal with it today?",
    guidance: GENERIC_GUIDANCE,
    max_words: 150,
  },
  {
    id: "solution",
    question: "Describe your product or service, what stage it is at, and what makes it hard to copy.",
    guidance: GENERIC_GUIDANCE,
    max_words: 200,
  },
  {
    id: "traction",
    question: "What traction or validation do you have — users, revenue, pilots, letters of intent, customer conversations?",
    guidance: GENERIC_GUIDANCE,
    max_words: 150,
  },
  {
    id: "team",
    question: "Who is on the founding team, what does each person bring, and how much time is each committing?",
    guidance: GENERIC_GUIDANCE,
    max_words: 150,
  },
  {
    id: "why_program",
    question: "Why this program, and why now? What do you want from the mentors, network and any funding on offer?",
    guidance: GENERIC_GUIDANCE,
    max_words: 120,
  },
  {
    id: "milestones",
    question: "What are your milestones for the next 12 months, and which of them does the program accelerate?",
    guidance: GENERIC_GUIDANCE,
    max_words: 150,
  },
];

/** The prompt set to draft against: the grant's own questions, else the generic set. */
export function promptsForGrant(grant: Pick<AuGrantRow, "application_prompts"> | null | undefined): ApplicationPrompt[] {
  const own = parseApplicationPrompts(grant?.application_prompts);
  return own.length ? own : [...GENERIC_APPLICATION_PROMPTS];
}

/** The prompt set to draft against for a program: its own questions, else the generic accelerator set. */
export function promptsForProgram(program: Pick<AuProgramRow, "application_prompts"> | null | undefined): ApplicationPrompt[] {
  const own = parseApplicationPrompts(program?.application_prompts);
  return own.length ? own : [...GENERIC_PROGRAM_APPLICATION_PROMPTS];
}

/** True when the set is the generic fallback (every prompt carries `guidance: "generic"`). */
export function isGenericPromptSet(prompts: readonly ApplicationPrompt[]): boolean {
  return prompts.length > 0 && prompts.every((p) => p.guidance === GENERIC_GUIDANCE);
}

/** `{ [prompt.id]: "" }` — the never-blank shape a failed AI call still returns. */
export function emptyAnswers(prompts: readonly ApplicationPrompt[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of prompts) out[p.id] = "";
  return out;
}

/** Plain-text render for "Copy all": `## question\n\nanswer` per prompt. */
export function renderAnswersText(
  prompts: readonly ApplicationPrompt[],
  answers: Readonly<Record<string, string>>,
  heading?: string | null,
): string {
  const parts: string[] = [];
  if (heading) parts.push(`# ${heading}`);
  for (const p of prompts) {
    const a = (answers[p.id] ?? "").trim();
    parts.push(`## ${p.question}\n\n${a || "(no answer yet)"}`);
  }
  return parts.join("\n\n");
}
