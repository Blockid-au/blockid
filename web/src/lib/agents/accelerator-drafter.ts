/**
 * src/lib/agents/accelerator-drafter.ts
 *
 * Drafts accelerator application answers from a founder's interview answers
 * + latest SVI snapshot. Uses `callAI()` (free provider chain) with a
 * per-prompt call so answers stay tightly scoped to the accelerator's own
 * question labels and character caps.
 *
 * Roadmap: "Accelerator apply drafter (LLM drafts application text from
 * interview + SVI; per-program)".
 */
import fs from "node:fs";
import path from "node:path";
import { callAI } from "@/lib/ai-client";

// ── Types ────────────────────────────────────────────────────────────────

export interface AcceleratorPrompt {
  id: string;
  label: string;
  maxChars: number;
}

export interface AcceleratorProgram {
  slug: string;
  name: string;
  region: string;
  cohort: string;
  url: string;
  prompts: AcceleratorPrompt[];
}

export interface AcceleratorDrafterInput {
  accelerator_slug: string;
  startup_name: string;
  interview_answers: Record<string, string>;
  svi_score?: number;
  svi_dimensions?: Record<string, number>;
}

// ── Data ─────────────────────────────────────────────────────────────────

function loadAccelerators(): AcceleratorProgram[] {
  // Try both dev cwd (web/) and standalone runtime cwd (repo root or
  // .next/standalone/). Any miss falls back to an empty list — the
  // drafter throws a clean "Unknown accelerator" instead of a JSON crash.
  const candidates = [
    path.join(process.cwd(), "content", "accelerators.json"),
    path.join(process.cwd(), "web", "content", "accelerators.json"),
    "/home/dovanlong/blockid.au/web/content/accelerators.json",
  ];
  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue;
      const raw = fs.readFileSync(p, "utf-8");
      const parsed = JSON.parse(raw) as AcceleratorProgram[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {
      /* try next candidate */
    }
  }
  return [];
}

const ACCELERATORS: AcceleratorProgram[] = loadAccelerators();

const BY_SLUG: Map<string, AcceleratorProgram> = new Map(
  ACCELERATORS.map((a) => [a.slug, a]),
);

export function listAccelerators(): AcceleratorProgram[] {
  return [...ACCELERATORS];
}

export function getAcceleratorBySlug(slug: string): AcceleratorProgram | null {
  return BY_SLUG.get(slug) ?? null;
}

// ── System prompt ────────────────────────────────────────────────────────

const DRAFTER_SYSTEM = `You are an accelerator-application coach for Australian founders. \
You draft crisp, honest answers to accelerator application questions using ONLY the \
founder's interview answers and their SVI snapshot as source material. \
Never invent traction, users, revenue, or team members that were not provided. \
Write in confident first-person plural ("we"), avoid buzzwords, and stay well \
under the character cap.`;

// ── Helpers ──────────────────────────────────────────────────────────────

function summariseInterview(answers: Record<string, string>): string {
  const rows = Object.entries(answers)
    .filter(([, v]) => typeof v === "string" && v.trim().length > 0)
    .slice(0, 40)
    .map(([k, v]) => `- ${k}: ${v.trim().slice(0, 500)}`);
  if (rows.length === 0) return "(no interview answers on file)";
  return rows.join("\n");
}

function summariseSvi(input: AcceleratorDrafterInput): string {
  const parts: string[] = [];
  if (typeof input.svi_score === "number") {
    parts.push(`SVI score: ${input.svi_score.toFixed(1)}`);
  }
  if (input.svi_dimensions) {
    const dims = Object.entries(input.svi_dimensions)
      .map(([k, v]) => `${k}=${typeof v === "number" ? v.toFixed(1) : String(v)}`)
      .join(", ");
    if (dims.length > 0) parts.push(`Dimensions: ${dims}`);
  }
  return parts.length > 0 ? parts.join("\n") : "(no SVI snapshot on file)";
}

function templateFallback(
  program: AcceleratorProgram,
  prompt: AcceleratorPrompt,
  input: AcceleratorDrafterInput,
): string {
  // Deterministic fallback if the LLM chain fails — pull relevant interview
  // answers by heuristic keyword match on the prompt id/label. Truncate to
  // the accelerator's char cap.
  const keys = Object.keys(input.interview_answers);
  const promptTokens = `${prompt.id} ${prompt.label}`.toLowerCase().split(/\s+/);
  const scored = keys
    .map((k) => {
      const kl = k.toLowerCase();
      const score = promptTokens.reduce(
        (acc, tok) => acc + (tok.length > 3 && kl.includes(tok) ? 1 : 0),
        0,
      );
      return { k, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  const body =
    scored.length > 0
      ? scored
          .slice(0, 3)
          .map((r) => input.interview_answers[r.k])
          .join(" ")
      : `${input.startup_name} is applying to ${program.name} (${program.cohort}). ` +
        `Founders are refining the answer to "${prompt.label}" and will submit a full version before the deadline.`;

  return body.replace(/\s+/g, " ").trim().slice(0, prompt.maxChars);
}

async function draftOne(
  program: AcceleratorProgram,
  prompt: AcceleratorPrompt,
  input: AcceleratorDrafterInput,
): Promise<string> {
  const user =
    `Accelerator: ${program.name} (${program.region}, ${program.cohort})\n` +
    `Startup: ${input.startup_name}\n\n` +
    `Application question:\n"${prompt.label}"\n` +
    `Character cap: ${prompt.maxChars}\n\n` +
    `Interview answers on file:\n${summariseInterview(input.interview_answers)}\n\n` +
    `SVI snapshot:\n${summariseSvi(input)}\n\n` +
    `Draft the answer. Return ONLY the answer text — no preamble, no quotes, ` +
    `no "Answer:" prefix. Stay under ${prompt.maxChars} characters.`;

  try {
    const result = await callAI({
      system: DRAFTER_SYSTEM,
      user,
      // Generous token budget so long-form prompts (1000-char caps) fit.
      maxTokens: Math.max(400, Math.ceil(prompt.maxChars / 2)),
      temperature: 0.5,
    });
    const trimmed = (result.text ?? "").trim();
    if (trimmed.length === 0) {
      return templateFallback(program, prompt, input);
    }
    // Strip common LLM preambles.
    const cleaned = trimmed
      .replace(/^Answer[:\-]?\s*/i, "")
      .replace(/^["'`]+|["'`]+$/g, "")
      .trim();
    return cleaned.slice(0, prompt.maxChars);
  } catch {
    return templateFallback(program, prompt, input);
  }
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Draft an accelerator application. Returns `{ prompt_id: draft_text }` for
 * every prompt in the target program. On any per-prompt LLM failure the
 * function falls back to a deterministic template so callers always receive
 * a non-empty answer per prompt.
 *
 * Throws only if the accelerator slug is unknown.
 */
export async function draftAcceleratorApplication(
  input: AcceleratorDrafterInput,
): Promise<Record<string, string>> {
  const program = getAcceleratorBySlug(input.accelerator_slug);
  if (!program) {
    throw new Error(`Unknown accelerator: ${input.accelerator_slug}`);
  }

  const out: Record<string, string> = {};
  // Serial not parallel — free providers rate-limit hard when we fan out.
  for (const prompt of program.prompts) {
    out[prompt.id] = await draftOne(program, prompt, input);
  }
  return out;
}
