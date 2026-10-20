// A2 (pricing v5 §7.4, G35) — the 8 eval task profiles.
//
// One profile per task the model coordinator ranks models for. Each profile
// pins: the §7.3 catalogue role it maps to, the dispatcher class whose
// ladder its result can reorder, the JSON output contract (the SCHEMA GATE),
// and the pass criteria:
//
//   schema gate            output parses as JSON and matches `outputSchema`
//   groundedShare          material claims carrying an allowed [ev:<id>]
//                          (or a declared-estimate marker) whose figures
//                          the cited row holds — llm-auditor
//                          findUncitedClaims + eval-runner groundedShareOf
//   numeric check          expected figures reproduced within tolerance /
//                          no figure the input does not contain
//   no fabricated citation every cited id is one the input offered
//   p95 latency            per task × model over the run
//   cost ceiling           USD per accepted output
//
// Report scope (report_chapter, ceo_synthesis) candidates are DeepInfra only
// (G30 founder policy: no paid spillover, no free fallback for customer
// reports). The eval may call DeepInfra (paid) and the zero-cost free tiers
// (Groq, Cerebras, SambaNova, OpenRouter `:free`) — never Gemini, paid
// OpenRouter, Anthropic or any other paid provider (`isEvalCallable`).
//
// Pure data + pure helpers (no fs, no network).

import { z } from "zod";
import { MODEL_CATALOG, findCatalogModel, modelsForRole, type CatalogModel, type TaskRole, type RoleTier } from "./model-catalog";
import { meetsCapabilityFloor } from "./model-capability";

export const EVAL_TASK_IDS = [
  "report_chapter",
  "ceo_synthesis",
  "grounding_judge",
  "extraction",
  "classify",
  "translation",
  "chat",
  "vision",
] as const;
export type EvalTaskId = (typeof EVAL_TASK_IDS)[number];

export type EvalLang = "en" | "vi";
export type DispatcherClass = "report" | "synthesis" | "classify";

export interface PassCriteria {
  /** Always on: an output that does not parse + validate is never accepted. */
  schemaGate: true;
  /** Minimum grounded share per output (report scope); null = not measured for this task. */
  minGroundedShare: number | null;
  /** Expected figures must be reproduced / no invented figure. */
  numericCheck: boolean;
  /** Every cited evidence id must be one the input offered (critical when violated). */
  noFabricatedCitation: boolean;
  /** p95 latency ceiling over a run (ms). */
  p95LatencyMs: number;
  /** Ceiling on USD per ACCEPTED output. */
  maxCostUsdPerOutput: number;
  /** Max schema-fail rate over a run before the model fails the profile. */
  maxSchemaFailRate: number;
}

export interface TaskProfile {
  id: EvalTaskId;
  label: string;
  /** §7.3 matrix row (model-catalog TaskRole) the candidates come from. */
  role: TaskRole;
  /** The dispatcher ladder an approved/auto policy for this task would reorder (null = scorecard only). */
  dispatcherClass: DispatcherClass | null;
  /** Customer report scope: DeepInfra-only candidates, paid ladder changes are proposals. */
  reportScope: boolean;
  /** Free-pool models (ai-free-models.json) may be evaluated for this task. */
  freePoolEligible: boolean;
  /** Needs image input (vision-capable candidates only). */
  vision: boolean;
  outputSchema: z.ZodType<Record<string, unknown>>;
  criteria: PassCriteria;
  maxTokens: number;
  timeoutMs: number;
  /** Share of full-run cases a different-family judge re-reads (0 = never). */
  judgeSampleRate: number;
  system: string;
  /** User message for one case (the input is the fixture `input` object). */
  renderUser(input: Record<string, unknown>, lang: EvalLang): string;
}

// ── Output contracts (the schema gate) ───────────────────────────────

const str = z.string().min(1).max(4000);
const strList = (max: number) => z.array(z.string().min(1).max(1200)).max(max);

export const ReportChapterOutput = z.object({
  verdict: str,
  strengths: strList(8),
  gaps: strList(8),
  criterion_cards: z
    .array(z.object({ criterion: z.string().min(1).max(200), verdict: z.string().min(1).max(1200), citations: z.array(z.string().min(1).max(120)).max(10) }))
    .min(1)
    .max(6),
});

export const CeoSynthesisOutput = z.object({
  headline: z.string().min(1).max(300),
  summary: str,
  top_risks: strList(6).min(1),
  next_steps: strList(6).min(1),
});

export const GroundingJudgeOutput = z.object({
  verdicts: z.array(z.object({ id: z.string().min(1).max(40), supported: z.boolean(), reason: z.string().max(600).optional().default("") })).min(1).max(20),
});

const nullableNum = z.union([z.number(), z.null()]);
export const ExtractionOutput = z.object({
  company_name: z.union([z.string().min(1).max(200), z.null()]),
  founded_year: nullableNum,
  employees: nullableNum,
  revenue_aud: nullableNum,
  funding_raised_aud: nullableNum,
  sector: z.union([z.string().min(1).max(60), z.null()]),
});

export const CLASSIFY_SECTORS = ["saas", "fintech", "healthtech", "agritech", "edtech", "cleantech", "marketplace", "deeptech"] as const;
export const CLASSIFY_STAGES = ["idea", "pre_seed", "seed", "series_a"] as const;
export const ClassifyOutput = z.object({
  sector: z.enum(CLASSIFY_SECTORS),
  stage: z.enum(CLASSIFY_STAGES),
});

export const TranslationOutput = z.object({ translation: z.string().min(1).max(6000) });

export const ChatOutput = z.object({ answer: z.string().min(1).max(3000) });

export const VisionOutput = z.object({
  title: z.string().max(200).optional().default(""),
  values: z.array(z.object({ label: z.string().min(1).max(60), value: z.number() })).min(1).max(16),
});

// ── Shared prompt pieces ─────────────────────────────────────────────

const JSON_ONLY = "Return ONLY one JSON object, no prose, no markdown fences.";
const LANG_LINE = (lang: EvalLang) => (lang === "vi" ? "Write every text field in Vietnamese." : "Write every text field in Australian English.");
const asJson = (v: unknown) => JSON.stringify(v, null, 1);

const CITATION_CONTRACT = [
  "Evidence rules:",
  "- Every sentence that states a figure (money, %, count, date-bound metric, multiple) must end with the [ev:<id>] marker of the evidence row that contains that exact figure.",
  "- Only cite ids listed in the evidence. Never invent an id.",
  "- If the evidence does not support a figure, do not state it; or say it is an estimate and append [unevidenced].",
  "- Do not invent investors, customers, awards or numbers.",
].join("\n");

// ── The 8 profiles ───────────────────────────────────────────────────

export const TASK_PROFILES: Readonly<Record<EvalTaskId, TaskProfile>> = Object.freeze({
  report_chapter: {
    id: "report_chapter",
    label: "Report chapter (JSON with citations)",
    role: "report_chapter",
    dispatcherClass: "report",
    reportScope: true,
    freePoolEligible: false,
    vision: false,
    outputSchema: ReportChapterOutput,
    criteria: { schemaGate: true, minGroundedShare: 0.85, numericCheck: true, noFabricatedCitation: true, p95LatencyMs: 90_000, maxCostUsdPerOutput: 0.01, maxSchemaFailRate: 0.1 },
    maxTokens: 1400,
    timeoutMs: 120_000,
    judgeSampleRate: 0.25,
    system: [
      "You are the analyst who writes one chapter of an investor-grade Trusted Business Report on an Australian startup.",
      CITATION_CONTRACT,
      'Output contract: {"verdict": string (≤ 60 words), "strengths": string[] (≤ 4), "gaps": string[] (≤ 4), "criterion_cards": [{"criterion": string, "verdict": string, "citations": string[] (evidence ids)}] (2–4 cards)}.',
      JSON_ONLY,
    ].join("\n"),
    renderUser: (input, lang) => `${LANG_LINE(lang)}\nChapter: ${String(input.section ?? "")}\nCompany: ${String(input.company ?? "")}\nEvidence rows:\n${asJson(input.evidence)}`,
  },
  ceo_synthesis: {
    id: "ceo_synthesis",
    label: "CEO synthesis (executive summary)",
    role: "ceo_synthesis",
    dispatcherClass: "synthesis",
    reportScope: true,
    freePoolEligible: false,
    vision: false,
    outputSchema: CeoSynthesisOutput,
    criteria: { schemaGate: true, minGroundedShare: 0.85, numericCheck: true, noFabricatedCitation: true, p95LatencyMs: 120_000, maxCostUsdPerOutput: 0.02, maxSchemaFailRate: 0.1 },
    maxTokens: 1200,
    timeoutMs: 150_000,
    judgeSampleRate: 0.25,
    system: [
      "You are the CEO agent. Synthesise the chapter verdicts into an executive summary for an investor.",
      CITATION_CONTRACT,
      "Do not contradict a chapter verdict. Do not raise or lower any score.",
      'Output contract: {"headline": string (≤ 20 words), "summary": string (≤ 120 words), "top_risks": string[] (2–4), "next_steps": string[] (2–4)}.',
      JSON_ONLY,
    ].join("\n"),
    renderUser: (input, lang) => `${LANG_LINE(lang)}\nCompany: ${String(input.company ?? "")}\nChapter verdicts:\n${asJson(input.chapters)}\nEvidence rows:\n${asJson(input.evidence)}`,
  },
  grounding_judge: {
    id: "grounding_judge",
    label: "Grounding critic / judge",
    role: "grounding_judge",
    dispatcherClass: null,
    reportScope: false,
    freePoolEligible: true,
    vision: false,
    outputSchema: GroundingJudgeOutput,
    criteria: { schemaGate: true, minGroundedShare: null, numericCheck: true, noFabricatedCitation: false, p95LatencyMs: 45_000, maxCostUsdPerOutput: 0.005, maxSchemaFailRate: 0.1 },
    maxTokens: 700,
    timeoutMs: 60_000,
    judgeSampleRate: 0,
    system: [
      "You are a strict grounding critic. For each claim decide whether the cited evidence row supports it exactly: same entity, same figure (allowing rounding of ±1 in the last digit), same period.",
      "A claim with a figure the cited row does not contain is NOT supported. A claim citing an id that is not in the evidence is NOT supported.",
      'Output contract: {"verdicts": [{"id": string, "supported": boolean, "reason": string (≤ 25 words)}]} — one verdict per claim, same ids.',
      JSON_ONLY,
    ].join("\n"),
    renderUser: (input, lang) => `${lang === "vi" ? "Claims are in Vietnamese; write reasons in English." : ""}\nEvidence rows:\n${asJson(input.evidence)}\nClaims:\n${asJson(input.claims)}`.trim(),
  },
  extraction: {
    id: "extraction",
    label: "Extraction (structured fields)",
    role: "extraction_classify",
    dispatcherClass: "classify",
    reportScope: false,
    freePoolEligible: true,
    vision: false,
    outputSchema: ExtractionOutput,
    criteria: { schemaGate: true, minGroundedShare: null, numericCheck: true, noFabricatedCitation: false, p95LatencyMs: 20_000, maxCostUsdPerOutput: 0.002, maxSchemaFailRate: 0.1 },
    maxTokens: 300,
    timeoutMs: 30_000,
    judgeSampleRate: 0,
    system: [
      "Extract facts from the document. Use null for any field the document does not state — never guess.",
      "Money in whole Australian dollars (A$1.2m → 1200000). Employees = headcount number. sector = one lowercase word.",
      'Output contract: {"company_name": string|null, "founded_year": number|null, "employees": number|null, "revenue_aud": number|null, "funding_raised_aud": number|null, "sector": string|null}.',
      JSON_ONLY,
    ].join("\n"),
    renderUser: (input) => `Document:\n${String(input.document ?? "")}`,
  },
  classify: {
    id: "classify",
    label: "Classify (sector + stage)",
    role: "extraction_classify",
    dispatcherClass: "classify",
    reportScope: false,
    freePoolEligible: true,
    vision: false,
    outputSchema: ClassifyOutput,
    criteria: { schemaGate: true, minGroundedShare: null, numericCheck: false, noFabricatedCitation: false, p95LatencyMs: 10_000, maxCostUsdPerOutput: 0.001, maxSchemaFailRate: 0.1 },
    maxTokens: 80,
    timeoutMs: 20_000,
    judgeSampleRate: 0,
    system: [
      `Classify the startup. sector ∈ ${CLASSIFY_SECTORS.join(" | ")}. stage ∈ ${CLASSIFY_STAGES.join(" | ")} (idea = no product; pre_seed = product, no institutional round; seed = first institutional round or < A$3m raised; series_a = priced round ≥ A$5m).`,
      'Output contract: {"sector": string, "stage": string}.',
      JSON_ONLY,
    ].join("\n"),
    renderUser: (input) => `Startup description:\n${String(input.text ?? "")}`,
  },
  translation: {
    id: "translation",
    label: "Translation EN↔VI",
    role: "translation",
    dispatcherClass: null,
    reportScope: false,
    freePoolEligible: true,
    vision: false,
    outputSchema: TranslationOutput,
    criteria: { schemaGate: true, minGroundedShare: null, numericCheck: true, noFabricatedCitation: true, p95LatencyMs: 30_000, maxCostUsdPerOutput: 0.005, maxSchemaFailRate: 0.1 },
    maxTokens: 900,
    timeoutMs: 45_000,
    judgeSampleRate: 0.2,
    system: [
      "Translate faithfully. Keep every number, currency (A$), percentage, date, product name, [ev:<id>] marker and the brand names BlockID and SVI exactly as written. Do not add or drop sentences.",
      'Output contract: {"translation": string}.',
      JSON_ONLY,
    ].join("\n"),
    renderUser: (input) => `Translate from ${input.source_lang === "vi" ? "Vietnamese" : "English"} to ${input.target_lang === "vi" ? "Vietnamese" : "English"}:\n${String(input.text ?? "")}`,
  },
  chat: {
    id: "chat",
    label: "Chat (founder Q&A)",
    role: "chat",
    dispatcherClass: null,
    reportScope: false,
    freePoolEligible: true,
    vision: false,
    outputSchema: ChatOutput,
    criteria: { schemaGate: true, minGroundedShare: null, numericCheck: true, noFabricatedCitation: false, p95LatencyMs: 15_000, maxCostUsdPerOutput: 0.003, maxSchemaFailRate: 0.1 },
    maxTokens: 500,
    timeoutMs: 30_000,
    judgeSampleRate: 0.1,
    system: [
      "You are BlockID's assistant for Australian startup founders. Answer only from the context given; if the context does not answer, say so.",
      "General information only — never personal financial advice, never promise returns or outcomes.",
      'Output contract: {"answer": string (≤ 120 words)}.',
      JSON_ONLY,
    ].join("\n"),
    renderUser: (input, lang) => `${LANG_LINE(lang)}\nContext:\n${String(input.context ?? "")}\nQuestion: ${String(input.question ?? "")}`,
  },
  vision: {
    id: "vision",
    label: "Vision (chart reading)",
    role: "vision",
    dispatcherClass: null,
    reportScope: false,
    freePoolEligible: false,
    vision: true,
    outputSchema: VisionOutput,
    criteria: { schemaGate: true, minGroundedShare: null, numericCheck: true, noFabricatedCitation: false, p95LatencyMs: 60_000, maxCostUsdPerOutput: 0.01, maxSchemaFailRate: 0.1 },
    maxTokens: 400,
    timeoutMs: 90_000,
    judgeSampleRate: 0,
    system: [
      "Read the bar chart in the image. Report the chart title and every bar's label and the value printed above it. Do not estimate unlabelled bars.",
      'Output contract: {"title": string, "values": [{"label": string, "value": number}]}.',
      JSON_ONLY,
    ].join("\n"),
    renderUser: (input) => String(input.question ?? "Read every bar value."),
  },
});

export function taskProfile(id: EvalTaskId): TaskProfile {
  return TASK_PROFILES[id];
}

// ── Candidates ───────────────────────────────────────────────────────

/** Providers the eval may call: DeepInfra (the only paid one) + zero-cost free tiers. */
export const EVAL_FREE_PROVIDERS = ["groq", "cerebras", "sambanova", "openrouter"] as const;

/**
 * The eval spend rule: DeepInfra is the ONLY paid provider it may dial;
 * Groq / Cerebras / SambaNova free tiers and OpenRouter `:free` ids cost
 * nothing. Gemini, paid OpenRouter, Anthropic, OpenAI … never.
 */
export function isEvalCallable(provider: string, model: string): boolean {
  if (provider === "deepinfra") return true;
  if (provider === "groq" || provider === "cerebras" || provider === "sambanova") return true;
  if (provider === "openrouter") return model.endsWith(":free");
  return false;
}

export type CandidateTier = RoleTier | "free_pool";

export interface EvalCandidate {
  provider: string;
  model: string;
  family: string;
  billing: "paid" | "free";
  /** Catalogue tier for this task's role, or `free_pool` (ai-free-models.json, not catalogued for the role). */
  tier: CandidateTier;
  vision: boolean;
}

export function candidateKey(c: Pick<EvalCandidate, "provider" | "model">): string {
  return `${c.provider}:${c.model}`;
}

const FAMILY_GUESS: ReadonlyArray<[RegExp, string]> = [
  [/deepseek/i, "deepseek"],
  [/qwen/i, "qwen"],
  [/llama/i, "llama"],
  [/gpt-oss/i, "gpt-oss"],
  [/gemma/i, "gemma"],
  [/gemini/i, "gemini"],
  [/nemotron/i, "nemotron"],
  [/minimax/i, "minimax"],
  [/kimi/i, "kimi"],
  [/glm/i, "glm"],
  [/mistral|mixtral/i, "mistral"],
  [/claude/i, "claude"],
];

/** Model family (catalogue first, then id pattern) — the judge must come from a different one. */
export function familyOf(provider: string, model: string): string {
  const row = findCatalogModel(provider, model);
  if (row) return row.family;
  for (const [re, fam] of FAMILY_GUESS) if (re.test(model)) return fam;
  const head = model.split("/").pop() ?? model;
  return head.split(/[-:.]/)[0]!.toLowerCase();
}

/** Max free-pool (uncatalogued) models added per task — keeps a run inside its wall clock. */
export const MAX_FREE_POOL_CANDIDATES = 4;

/**
 * Who is evaluated for a task: the catalogue rows for its role (callable
 * only), plus — for free-pool-eligible tasks — the free ladders the
 * dispatcher would dial (ai-free-models.json `freeLists`) that clear the
 * capability floor. Report-scope tasks: DeepInfra only. Vision tasks:
 * vision-capable catalogue rows only. De-duplicated, catalogue order first.
 */
export function evalCandidates(profile: TaskProfile, freeLists: Record<string, readonly string[]> = {}): EvalCandidate[] {
  const out: EvalCandidate[] = [];
  const seen = new Set<string>();
  const push = (c: EvalCandidate) => {
    const k = candidateKey(c);
    if (seen.has(k)) return;
    seen.add(k);
    out.push(c);
  };
  for (const m of modelsForRole(profile.role)) {
    if (!isEvalCallable(m.provider, m.id)) continue;
    if (profile.reportScope && m.provider !== "deepinfra") continue;
    if (profile.vision && !m.capabilities.includes("vision")) continue;
    push({ provider: m.provider, model: m.id, family: m.family, billing: m.billing === "paid" ? "paid" : "free", tier: m.tier, vision: m.capabilities.includes("vision") });
  }
  if (profile.freePoolEligible && !profile.reportScope && !profile.vision) {
    let added = 0;
    for (const provider of EVAL_FREE_PROVIDERS) {
      for (const model of freeLists[provider] ?? []) {
        if (added >= MAX_FREE_POOL_CANDIDATES) break;
        if (!isEvalCallable(provider, model) || !meetsCapabilityFloor(model)) continue;
        if (seen.has(`${provider}:${model}`)) continue;
        push({ provider, model, family: familyOf(provider, model), billing: "free", tier: "free_pool", vision: false });
        added += 1;
      }
    }
  }
  return out;
}

/**
 * The judge for a writer: the grounding_judge role's callable rows in tier
 * order, first one from a DIFFERENT family. `configured` filters to
 * providers with a key. Null when none qualifies (the case is then not judged).
 */
export function judgeFor(writerFamily: string, configured: (provider: string) => boolean = () => true): EvalCandidate | null {
  for (const m of modelsForRole("grounding_judge")) {
    if (!isEvalCallable(m.provider, m.id) || !configured(m.provider)) continue;
    if (m.family === writerFamily) continue;
    return { provider: m.provider, model: m.id, family: m.family, billing: m.billing === "paid" ? "paid" : "free", tier: m.tier, vision: false };
  }
  return null;
}

/** The catalogue primary for a task (what the scorecard shows when no policy overrides it). */
export function cataloguePrimary(profile: TaskProfile): CatalogModel | null {
  return modelsForRole(profile.role).find((m) => m.tier === "primary" && isEvalCallable(m.provider, m.id) && (!profile.reportScope || m.provider === "deepinfra")) ?? null;
}

/** Every catalogue row the eval could ever call (for the admin page / docs). */
export function evalCallableCatalogue(): CatalogModel[] {
  return MODEL_CATALOG.filter((m) => isEvalCallable(m.provider, m.id));
}
