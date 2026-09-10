// Per-grant application prompts (T0251, plan §4h "Application drafts").
//
// `au_grants.application_prompts[]` (migration 0323) carries the questions
// from the official guidelines for the big programs (R&DTI, EMDG, IGP, MVP
// Ventures, Kick-Start, …) — seeded from web/content/data/grants-au.seed.json.
// Every other grant falls back to GENERIC_APPLICATION_PROMPTS so a draft is
// never empty (auto-fill rule).
//
// Pure — no `server-only`, no supabase: the client draft editor imports the
// types + `promptsForGrant` too.

import { parseApplicationPrompts, type ApplicationPrompt, type AuGrantRow } from "./seed-map";

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

/** The prompt set to draft against: the grant's own questions, else the generic set. */
export function promptsForGrant(grant: Pick<AuGrantRow, "application_prompts"> | null | undefined): ApplicationPrompt[] {
  const own = parseApplicationPrompts(grant?.application_prompts);
  return own.length ? own : [...GENERIC_APPLICATION_PROMPTS];
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
