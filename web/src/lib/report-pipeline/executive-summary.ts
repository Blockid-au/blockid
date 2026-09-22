import { isValuationAvailable } from "@/lib/report-v2/schema";
// G19-S47 — the CEO executive summary as a JSON contract.
//
// The SYNTH stage used to ask the CEO agent for "a comprehensive Executive
// Summary (500-800 words)" and store the markdown it wrote as
// `executive.thesis`; the web rendered it as one run-on paragraph with the
// `#` / `**` / `> ` / `<!-- SCORE -->` syntax visible. The call now carries
// the OUTPUT_SCHEMA slot (the S46 mechanism W1–W4 use) with the structured
// shape `ExecutiveStructured` renders from — headline, 2–3 paragraphs, key
// insight, 3 reasons, 3 gaps, benchmarks, phase now, verdict, ≤ 5 actions —
// validated by `callStructured`, then clamped by
// `finaliseExecutiveStructured` (word caps, markdown stripped, dims known).
//
// Budget: ONE metered call. The repair pass runs only when the first answer
// attempted JSON (contains `{`) and the caller allows it; a prose answer is
// kept as the thesis and structured on read (`structureExecutive`), so a
// model that ignores the contract costs no extra call. A failed first call
// (model outage / budget) returns `null` and the orchestrator keeps its
// deterministic shell.

import { z } from "zod";
import { callStructured, type StructuredModelCaller } from "@/lib/ai/call-structured";
import { readOrRegisterPrompt } from "@/lib/ai/prompt-registry";
import { GROWTH_PHASE_LABELS } from "@/lib/growth/phase-taxonomy";
import { EXECUTIVE_CAPS, type ExecutiveStructured } from "@/lib/report-v2/schema";
import { executiveThesisFromStructured, finaliseExecutiveStructured } from "@/lib/report-v2/executive-structure";
import { modelForAgent } from "./agent-model-tiers";
import { CODE_PROMPT_VERSION } from "./version";
import { DIM_ORDER, type DimKey } from "./dimension-owners";
import type { ReportContext } from "./types";

const NIL_PROMPT_VERSION_ID = "00000000-0000-0000-0000-000000000000";

/** Output tokens for the structured summary — ~900 words of JSON-escaped prose + the lists. */
export const EXECUTIVE_MAX_TOKENS = 2600;

type AICaller = (systemPrompt: string, userPrompt: string, maxTokens: number, taskClass?: "classify" | "report" | "synthesis") => Promise<string>;

// ── Input (hashed + audited by callStructured) ──────────────────────────────

export const ExecutiveSummaryInput = z.object({
  startupName: z.string(),
  svi: z.number(),
  stageLabel: z.string(),
  phase: z
    .object({
      id: z.string(),
      label: z.string(),
      completionPct: z.number(),
      nextPhase: z.string().nullable(),
      blockers: z.array(z.string()),
    })
    .nullable(),
  criteria: z.array(z.object({ key: z.string(), score: z.number(), highlights: z.array(z.string()) })),
  chapters: z.array(
    z.object({
      dim: z.string(),
      title: z.string(),
      score: z.number(),
      band: z.string(),
      verdict: z.string(),
      nextAction: z.string(),
      expectedLift: z.number(),
      evidenceIds: z.array(z.string()),
    }),
  ),
  lowestDim: z.string().nullable(),
  valuation: z.object({ lowAud: z.number(), midAud: z.number(), highAud: z.number(), confidence: z.number() }).nullable(),
  consistencyIssues: z.array(z.string()),
});
export type ExecutiveSummaryInput = z.infer<typeof ExecutiveSummaryInput>;

export function executiveSummaryInput(context: ReportContext): ExecutiveSummaryInput {
  const gate = context.phaseGate;
  const chapters = context.dimensionChapters ? DIM_ORDER.map((d) => context.dimensionChapters!.get(d)).filter((c): c is NonNullable<typeof c> => Boolean(c)) : [];
  const scored = chapters.filter((c) => c.band !== "pending");
  const lowest = scored.length ? [...scored].sort((a, b) => a.score - b.score)[0] : null;
  const v = context.valuationChapter && isValuationAvailable(context.valuationChapter) ? context.valuationChapter.consensus : null;
  return {
    startupName: context.startupName,
    svi: context.sviAnalysis.totalSVI,
    stageLabel: context.sviAnalysis.stageLabel,
    phase: gate
      ? { id: gate.currentPhase, label: gate.currentPhaseLabel, completionPct: gate.completionPct, nextPhase: gate.nextPhase, blockers: gate.blockers.map((b) => b.detail) }
      : null,
    criteria: [...context.criterionResults.entries()].map(([key, r]) => ({ key, score: Math.round(r.score), highlights: r.highlights.slice(0, 2) })),
    // Tolerant of a degraded / stub chapter (no next action, no evidence rows).
    chapters: chapters.map((c) => ({
      dim: c.dim,
      title: c.title ?? c.dim.toUpperCase(),
      score: Number.isFinite(c.score) ? c.score : 0,
      band: c.band ?? "pending",
      verdict: c.verdict ?? "",
      nextAction: c.nextAction?.title ?? "",
      expectedLift: c.nextAction?.expectedLift ?? 0,
      evidenceIds: (c.evidence ?? []).filter((e) => e.status === "evidenced" || e.status === "partial").map((e) => e.evidence_id).slice(0, 6),
    })),
    lowestDim: lowest?.dim ?? null,
    valuation: v ? { lowAud: v.lowAud, midAud: v.midAud, highAud: v.highAud, confidence: v.confidence } : null,
    consistencyIssues: (context.consistencyIssues ?? []).slice(0, 12),
  };
}

/** The user turn — the same facts the prose prompt carried, plus the chapter next actions and citable ids. */
export function renderExecutiveUser(input: ExecutiveSummaryInput): string {
  const summaries = input.criteria.map((c) => `- ${c.key} (${c.score}/100): ${c.highlights.join("; ")}`).join("\n");
  const chapters = input.chapters
    .map((c) => `- ${c.dim.toUpperCase()} · ${c.title} · ${c.score}/100 (${c.band}) · next: ${c.nextAction} (+${c.expectedLift} SVI) · citable: ${c.evidenceIds.length ? c.evidenceIds.join(", ") : "none"}\n  ${c.verdict}`)
    .join("\n");
  const phase = input.phase
    ? `Phase now: ${input.phase.label} (${input.phase.completionPct}% of the exit gate cleared)${input.phase.blockers.length ? `; blockers: ${input.phase.blockers.join("; ")}` : "; no blockers"}${input.phase.nextPhase ? `; next phase ${input.phase.nextPhase}` : ""}`
    : "";
  const valuation = input.valuation ? `Valuation consensus: A$${Math.round(input.valuation.lowAud).toLocaleString("en-AU")}–A$${Math.round(input.valuation.highAud).toLocaleString("en-AU")} (confidence ${Math.round(input.valuation.confidence * 100)}%)` : "";
  return [
    "## Executive Summary Generation",
    "",
    "Write the executive summary for this startup from the 13 criterion analyses and the 8 dimension chapters below, as the JSON object in your output contract.",
    "",
    "## Criterion analyses",
    summaries || "(none)",
    "",
    chapters ? `## Dimension chapters (owner agents)\n${chapters}\n` : "",
    `SVI Score: ${input.svi}`,
    `Stage: ${input.stageLabel}`,
    phase,
    valuation,
    input.lowestDim ? `Lowest dimension: ${input.lowestDim.toUpperCase()} — at least one critical gap must name it.` : "",
    input.consistencyIssues.length ? `\nConsistency Issues:\n${input.consistencyIssues.join("\n")}` : "",
    "",
    "Include: one startup overview (2–3 short paragraphs), the key insight, three reasons to back, three critical gaps, stage benchmarks, phase now with its blockers (exactly the ones listed) and what clears the gate, the verdict with a confidence, and up to five recommended actions.",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

// ── Output contract (the OUTPUT_SCHEMA prompt slot) ─────────────────────────

export function executiveOutputContract(): string {
  return `## MACHINE-READABLE OUTPUT CONTRACT (mandatory) — executive summary
Return ONLY one JSON object, no prose outside it, no markdown fences, no markdown syntax inside strings (no #, **, > or <!-- -->). Angle-quoted «…» parts are placeholders:
{
  "headline": "«one line, at most ${EXECUTIVE_CAPS.headlineWords} words — the startup in one phrase»",
  "summary": ["«paragraph 1, at most ${EXECUTIVE_CAPS.paragraphWords} words»", "«paragraph 2»", "«optional paragraph 3»"],
  "key_insight": "«one or two sentences — the single thing an evaluator must know»",
  "reasons_to_back": [{ "title": "«≤ 8 words»", "body": "«one or two sentences, cite [ev:«evidence_id»] where evidence exists»", "dim": "«one of ${DIM_ORDER.join(", ")}»" }],
  "critical_gaps": [{ "title": "«≤ 8 words»", "body": "«one or two sentences, cite [ev:«id»] where evidence exists»", "dim": "«dimension key»", "lift": «SVI points the fix is worth, or omit» }],
  "benchmarks": [{ "dim": "«dimension key»", "score": «0-100 as given», "band": "«strong | developing | early | pending as given»", "note": "«≤ 12 words, optional»" }],
  "phase_now": { "phase_id": "«phase id as given»", "label": "«phase label»", "blocker": "«the listed blocker, one sentence»", "what_it_takes": "«one sentence: what clears the gate»" },
  "verdict": { "label": "«back | back_with_conditions | watch | not_yet»", "condition": "«the condition when label is back_with_conditions, else omit»", "confidence": «0 to 1» },
  "actions": [{ "title": "«≤ 10 words»", "detail": "«one sentence»", "window": "«this_week | 30d | 90d»", "dim": "«dimension key»" }]
}
RULES:
- 2–3 summary paragraphs; exactly 3 reasons_to_back; exactly 3 critical_gaps (one names the lowest dimension); 3–5 actions ordered by urgency.
- Never state a number that is not in the criterion analyses, the chapters or the valuation line. Cite evidence ids as [ev:«id»] inside "body" where the chapters list citable ids; unsupported claims end with [unevidenced].
- Scores and bands in "benchmarks" are copied from the chapters, never invented. The phase blockers are exactly the ones listed.
- Plain sentences only — no headings, no bullet characters, no bold.`;
}

// ── Output payload (snake_case, tolerant — the finaliser clamps) ────────────

const loose = z.string().nullable().optional();
export const ExecutiveSummaryPayload = z.object({
  headline: z.string().min(1),
  summary: z.union([z.array(z.string()).min(1), z.string().min(1)]),
  key_insight: loose,
  reasons_to_back: z.array(z.object({ title: z.string(), body: loose, dim: loose })).max(6),
  critical_gaps: z.array(z.object({ title: z.string(), body: loose, dim: loose, lift: z.number().nullable().optional() })).max(6),
  benchmarks: z.array(z.object({ dim: z.string(), score: z.number(), band: z.string(), note: loose })).optional().nullable(),
  phase_now: z.object({ phase_id: loose, label: loose, blocker: loose, what_it_takes: loose }).optional().nullable(),
  verdict: z.object({ label: z.string(), condition: loose, confidence: z.number() }),
  actions: z.array(z.object({ title: z.string(), detail: loose, window: loose, dim: loose })).max(8),
});
export type ExecutiveSummaryPayload = z.infer<typeof ExecutiveSummaryPayload>;

/** snake_case payload → the camelCase draft the finaliser clamps (unknown dims / labels are left for it to resolve). */
export function draftFromPayload(p: ExecutiveSummaryPayload): Partial<ExecutiveStructured> {
  const s = (v: string | null | undefined) => (typeof v === "string" ? v : "");
  const dim = (v: string | null | undefined) => (typeof v === "string" && (DIM_ORDER as readonly string[]).includes(v.toLowerCase()) ? (v.toLowerCase() as DimKey) : undefined);
  return {
    headline: p.headline,
    summary: Array.isArray(p.summary) ? p.summary : [p.summary],
    ...(p.key_insight ? { keyInsight: p.key_insight } : {}),
    reasonsToBack: p.reasons_to_back.map((r) => ({ title: r.title, body: s(r.body), dim: dim(r.dim) })),
    criticalGaps: p.critical_gaps.map((g) => ({ title: g.title, body: s(g.body), dim: dim(g.dim), ...(typeof g.lift === "number" ? { lift: g.lift } : {}) })),
    benchmarks: (p.benchmarks ?? []).flatMap((b) => {
      const d = dim(b.dim);
      return d ? [{ dim: d, score: b.score, band: b.band as ExecutiveStructured["benchmarks"][number]["band"], ...(b.note ? { note: b.note } : {}) }] : [];
    }),
    phaseNow: p.phase_now ? { phaseId: s(p.phase_now.phase_id) as ExecutiveStructured["phaseNow"]["phaseId"], label: s(p.phase_now.label), blocker: s(p.phase_now.blocker), whatItTakes: s(p.phase_now.what_it_takes) } : undefined,
    verdict: { label: p.verdict.label as ExecutiveStructured["verdict"]["label"], ...(p.verdict.condition ? { condition: p.verdict.condition } : {}), confidence: p.verdict.confidence },
    actions: p.actions.map((a) => ({ title: a.title, detail: s(a.detail), window: s(a.window) as ExecutiveStructured["actions"][number]["window"], dim: dim(a.dim) })),
  };
}

// ── Dispatch ────────────────────────────────────────────────────────────────

export interface ExecutiveDispatchOptions {
  /** The CEO system prompt (buildAgentPrompt with `outputSchema: executiveOutputContract()`). */
  systemPrompt: string;
  /** Allow the one repair pass when the first answer attempted JSON (default: never — one metered call). */
  allowRepair?: () => boolean;
  businessId?: string | null;
  userId?: string | null;
  purpose?: string;
  resolvePromptVersionId?: () => Promise<string>;
  /** Transport override (tests). Defaults to the metered callAI on the synthesis class. */
  modelCaller?: StructuredModelCaller;
  maxTokens?: number;
}

export interface ExecutiveDispatchResult {
  /** The validated, clamped sections — null when the answer was prose or the call failed. */
  structured: ExecutiveStructured | null;
  /** The back-compat thesis: the structured twin, or the prose the model wrote. Null when nothing came back. */
  thesis: string | null;
  runId: string | null;
  reason: string | null;
  /** Model calls made (1, or 2 with a repair pass). */
  calls: number;
}

/** G24-B: prod row, else the code default is registered on first use (see agent-dispatcher). */
async function defaultCeoPromptVersionId(): Promise<string> {
  try {
    const row = await readOrRegisterPrompt("report-ceo", { version: CODE_PROMPT_VERSION, model: modelForAgent("ceo"), purpose: "customer_report" });
    return row?.id ?? NIL_PROMPT_VERSION_ID;
  } catch {
    return NIL_PROMPT_VERSION_ID;
  }
}

/**
 * ONE metered CEO call with the JSON contract. `callAI` throws past the
 * budget / deadline — that surfaces as `thesis: null` (the orchestrator keeps
 * its deterministic shell) and never as an exception.
 */
export async function dispatchExecutiveSummary(context: ReportContext, callAI: AICaller, opts: ExecutiveDispatchOptions): Promise<ExecutiveDispatchResult> {
  const input = executiveSummaryInput(context);
  const maxTokens = opts.maxTokens ?? EXECUTIVE_MAX_TOKENS;
  let firstText: string | null = null;
  let calls = 0;
  const base: StructuredModelCaller =
    opts.modelCaller ??
    (async ({ system, messages }) => {
      const user = messages.map((m) => (m.role === "assistant" ? `## Your previous response (rejected)\n${m.content}` : m.content)).join("\n\n");
      try {
        const text = await callAI(system, user, maxTokens, "synthesis");
        return { ok: true, text, tokensIn: Math.ceil((system.length + user.length) / 4), tokensOut: Math.ceil((text ?? "").length / 4) };
      } catch (err) {
        return { ok: false, status: "model_error", reason: err instanceof Error ? err.message : String(err) };
      }
    });
  const transport: StructuredModelCaller = async (req) => {
    const repair = req.messages.length > 1;
    if (repair) {
      const attemptedJson = typeof firstText === "string" && firstText.includes("{");
      if (!attemptedJson) return { ok: false, status: "rejected", reason: "prose answer kept as the thesis — no repair pass" };
      if (!(opts.allowRepair?.() ?? false)) return { ok: false, status: "rejected", reason: "repair pass not allowed by the call budget" };
    }
    calls += 1;
    const res = await base(req);
    if (!repair && res.ok) firstText = res.text;
    return res;
  };

  const promptVersionId = await (opts.resolvePromptVersionId ?? defaultCeoPromptVersionId)();
  const structured = await callStructured({
    promptVersionId,
    agent: "report-ceo",
    model: `${modelForAgent("ceo")}#synthesis`,
    inputSchema: ExecutiveSummaryInput,
    outputSchema: ExecutiveSummaryPayload,
    input,
    systemPrompt: opts.systemPrompt,
    renderUser: renderExecutiveUser,
    businessId: opts.businessId ?? null,
    userId: opts.userId ?? null,
    purpose: opts.purpose ?? "customer_report",
    evidenceIds: input.chapters.flatMap((c) => c.evidenceIds),
    modelCaller: transport,
  });

  if (structured.ok) {
    try {
      const chapters = context.dimensionChapters ? DIM_ORDER.map((d) => context.dimensionChapters!.get(d)).filter((c): c is NonNullable<typeof c> => Boolean(c)) : [];
      const phase = context.phaseGate ?? {
        currentPhase: "vision" as const,
        currentPhaseLabel: GROWTH_PHASE_LABELS.vision.en,
        nextPhase: null,
        phaseOrder: 1,
        completionPct: 0,
        canAdvance: false,
        blockers: [],
      };
      const final = finaliseExecutiveStructured(draftFromPayload(structured.data), {
        chapters,
        phase,
        locale: context.locale,
        cover: { startupName: context.startupName, svi: { total: context.sviAnalysis.totalSVI, band: bandForSvi(chapters), cohortPercentile: null, cohortN: null, deltaVsLast: null } },
      });
      return { structured: final, thesis: executiveThesisFromStructured(final), runId: structured.runId, reason: null, calls };
    } catch (err) {
      return { structured: null, thesis: firstText, runId: structured.runId, reason: `finalise: ${err instanceof Error ? err.message : String(err)}`, calls };
    }
  }
  // A prose (even blank) answer is kept verbatim — the auditor / read-time parser decide what to do with it.
  return { structured: null, thesis: firstText, runId: structured.runId, reason: structured.reason, calls };
}

/** The cover band for the fallback headline — the majority chapter band, pending when nothing is scored. */
function bandForSvi(chapters: ReadonlyArray<{ band: string }>): "strong" | "developing" | "early" | "pending" {
  const scored = chapters.filter((c) => c.band !== "pending");
  if (!scored.length) return "pending";
  const counts = { strong: 0, developing: 0, early: 0 };
  for (const c of scored) if (c.band in counts) counts[c.band as keyof typeof counts] += 1;
  return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] as "strong" | "developing" | "early") ?? "developing";
}
