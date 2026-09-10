// Grant application drafter (T0251, plan §4h "Application drafts").
//
// Same shape as accelerator-drafter.ts — one `callAI` per prompt, serial
// (free providers rate-limit on fan-out), a strict "never invent traction"
// system prompt — but keyed on a grant's `application_prompts[]` (migration
// 0323) and fed the startup's SVI analysis + data-room evidence instead of
// the Startup Package interview.
//
// Never throws and never blanks: an AI failure yields `""` for that prompt
// and `ai_ok: false` so the route can store the prompts with empty answers
// and the editor shows the retry hint (FUNDING_COPY.growth.draftFailed).

import { callAI } from "@/lib/ai-client";
import type { ApplicationPrompt } from "@/lib/funding/application-prompts";

export interface GrantDraftContext {
  /** Startup name. */
  startup: string;
  /** One-paragraph description (projects.description / intake.description). */
  description: string | null;
  industry: string | null;
  /** Intake stage label or numeric stage rendered by the caller ("mvp"). */
  stage: string | null;
  state: string | null;
  svi: { total: number | null; dimensions: Record<string, number> | null; summary: string | null } | null;
  /** Data-room file names the founder has uploaded / generated — evidence the answer may cite. */
  evidence: string[];
  /** Money Finder report facts for this grant: why it matched + eligibility checklist lines. */
  matchWhy: string[];
  eligibility: string[];
}

export interface GrantDraftTarget {
  id: string;
  name: string;
  provider: string | null;
  summary: string | null;
  amount_note: string | null;
  co_contribution: string | null;
  official_url: string;
}

export interface GrantDraftResult {
  answers: Record<string, string>;
  ai_ok: boolean;
  /** Prompt ids the AI failed on (empty answer). */
  failed: string[];
  provider: string | null;
  model: string | null;
}

const SYSTEM = `You are a grant-application coach for Australian founders. \
You draft crisp, honest answers to grant application questions using ONLY the \
startup facts, SVI analysis, data-room evidence and match notes supplied. \
Never invent revenue, users, staff, IP, partners or dollar figures that were not \
provided — write "[add figure]" where the founder must fill a number. Write in \
confident first-person plural ("we"), plain English, no buzzwords, and stay \
under the word cap. Where guidance is given, address it directly.`;

function lines(label: string, items: readonly string[], cap = 12): string {
  const rows = items.filter((s) => s && s.trim()).slice(0, cap);
  return rows.length ? `${label}:\n${rows.map((r) => `- ${r.trim().slice(0, 300)}`).join("\n")}` : `${label}: (none on file)`;
}

function sviBlock(ctx: GrantDraftContext): string {
  if (!ctx.svi) return "SVI analysis: (none on file)";
  const parts: string[] = [];
  if (typeof ctx.svi.total === "number") parts.push(`SVI ${ctx.svi.total.toFixed(0)}/100`);
  if (ctx.svi.dimensions) {
    const dims = Object.entries(ctx.svi.dimensions)
      .map(([k, v]) => `${k}=${typeof v === "number" ? v.toFixed(0) : String(v)}`)
      .join(", ");
    if (dims) parts.push(`dimensions: ${dims}`);
  }
  if (ctx.svi.summary) parts.push(`summary: ${ctx.svi.summary.slice(0, 600)}`);
  return parts.length ? `SVI analysis: ${parts.join(" · ")}` : "SVI analysis: (none on file)";
}

export function buildDraftPrompt(grant: GrantDraftTarget, prompt: ApplicationPrompt, ctx: GrantDraftContext): string {
  const cap = prompt.max_words ?? 250;
  return [
    `Grant: ${grant.name}${grant.provider ? ` (${grant.provider})` : ""}`,
    grant.summary ? `About the grant: ${grant.summary.slice(0, 500)}` : null,
    grant.amount_note ? `Funding: ${grant.amount_note}` : null,
    grant.co_contribution ? `Co-contribution: ${grant.co_contribution}` : null,
    "",
    `Startup: ${ctx.startup}`,
    ctx.description ? `What it does: ${ctx.description.slice(0, 800)}` : null,
    `Industry: ${ctx.industry ?? "unknown"} · Stage: ${ctx.stage ?? "unknown"} · State: ${ctx.state ?? "unknown"}`,
    sviBlock(ctx),
    lines("Data-room evidence on file", ctx.evidence),
    lines("Why the Money Finder matched this grant", ctx.matchWhy),
    lines("Eligibility checklist", ctx.eligibility),
    "",
    `Application question:\n"${prompt.question}"`,
    prompt.guidance && prompt.guidance !== "generic" ? `Guidance from the guidelines: ${prompt.guidance}` : null,
    `Word cap: ${cap}`,
    "",
    "Draft the answer. Return ONLY the answer text — no preamble, no quotes, no \"Answer:\" prefix.",
  ]
    .filter((l): l is string => l !== null)
    .join("\n");
}

function clean(text: string, maxWords: number): string {
  const t = text
    .trim()
    .replace(/^Answer[:\-]?\s*/i, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();
  const words = t.split(/\s+/);
  return words.length > maxWords ? words.slice(0, maxWords).join(" ") : t;
}

async function draftOne(grant: GrantDraftTarget, prompt: ApplicationPrompt, ctx: GrantDraftContext): Promise<{ text: string; provider: string | null; model: string | null } | null> {
  const cap = prompt.max_words ?? 250;
  try {
    const result = await callAI({
      system: SYSTEM,
      user: buildDraftPrompt(grant, prompt, ctx),
      maxTokens: Math.max(400, Math.ceil(cap * 2.2)),
      temperature: 0.4,
      agentId: "grant-drafter",
    });
    const text = clean(result.text ?? "", cap);
    if (!text) return null;
    return { text, provider: result.provider ?? null, model: result.model ?? null };
  } catch {
    return null;
  }
}

/**
 * Draft every prompt for one grant. Serial. Never throws; a failed prompt is
 * `""` in `answers` and listed in `failed`. `ai_ok` is false when ANY prompt
 * failed (the editor shows the retry hint but keeps the good answers).
 */
export async function draftGrantApplication(
  grant: GrantDraftTarget,
  prompts: readonly ApplicationPrompt[],
  ctx: GrantDraftContext,
  deps: { draftOne?: typeof draftOne } = {},
): Promise<GrantDraftResult> {
  const one = deps.draftOne ?? draftOne;
  const answers: Record<string, string> = {};
  const failed: string[] = [];
  let provider: string | null = null;
  let model: string | null = null;
  for (const p of prompts) {
    const r = await one(grant, p, ctx);
    if (r) {
      answers[p.id] = r.text;
      provider = provider ?? r.provider;
      model = model ?? r.model;
    } else {
      answers[p.id] = "";
      failed.push(p.id);
    }
  }
  return { answers, ai_ok: failed.length === 0 && prompts.length > 0, failed, provider, model };
}
