// Wave 28C — Personalised 30-Day Action Plan generator.
//
// Given a founder's SVI run (dim + criterion results) and their sector, this
// module asks the free-tier AI provider chain (Groq / SambaNova / Cerebras /
// OpenRouter — see `getAvailableProviders()` in ai-client) for 5 concrete
// tasks targeted at the two weakest dimensions. Results are persisted:
//
//   1. UPSERT one row in `svi_action_plans` keyed on svi_run_id (idempotent).
//   2. INSERT 5 rows in `svi_action_tasks` (order_index 0-4).
//
// If a plan for this svi_run_id already exists, the cached rows are returned
// without a fresh AI call — so this function is safe to call from the
// /api/svi/action-plan/generate route on every mount.
//
// Constraint (see MEMORY.md → feedback_no_real_startup_names): the prompt in
// platform-config.ts explicitly forbids naming real companies and the
// downstream sanitiser strips any that slip through.

import "server-only";
import { callAI, isAIConfigured } from "@/lib/ai-client";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getPlatformConfig } from "@/lib/platform-config";
import { industryToSector, type BenchmarkSector } from "@/lib/svi/sector-map";

// ── Types ───────────────────────────────────────────────────────────────────

export type SviDim = "ftv" | "mpc" | "ptd" | "tre" | "cgh" | "iri" | "lco" | "svm";

const DIM_KEYS: readonly SviDim[] = ["ftv", "mpc", "ptd", "tre", "cgh", "iri", "lco", "svm"];

const DIM_LABEL: Record<SviDim, string> = {
  ftv: "Founder & Team Value",
  mpc: "Market & Problem Clarity",
  ptd: "Product & Tech Depth",
  tre: "Traction & Revenue",
  cgh: "Cap Table & Governance",
  iri: "Investor Readiness",
  lco: "Legal & Compliance",
  svm: "Strategic Vision & Moat",
};

export interface DimResultLike {
  score?: number | null;
  markdown?: string | null;
  insights?: unknown;
  priority?: string | null;
}

export interface CriterionResultLike {
  key?: string;
  title?: string;
  primary_dimension?: string;
  score?: number;
  verdict?: string;
  gaps?: unknown;
}

export interface ActionTask {
  id?: number;
  title: string;
  detail: string;
  criterion: string;
  dim: SviDim;
  target_delta_points: number;
  order_index: number;
  completed_at: string | null;
  evidence_url: string | null;
}

export interface ActionPlan {
  id: number;
  user_id: string;
  startup_id: string | null;
  svi_run_id: string;
  plan: Record<string, unknown>;
  tasks: ActionTask[];
  created_at: string;
  cached: boolean;
}

export interface GenerateActionPlanInput {
  userId: string;
  startupId?: string | null;
  sviRunId: string;
  dimResults: Record<string, DimResultLike> | null | undefined;
  criterionResults: CriterionResultLike[] | null | undefined;
  sector?: string | null;
}

// ── Real-startup denylist (defence-in-depth) ────────────────────────────────
//
// The prompt already tells the model not to name real companies, but a small
// regex-based sanitiser catches the most common leaks. Deliberately broad —
// prefer stripping a task over shipping a named-company reference.
const NAMED_COMPANY_PATTERNS: RegExp[] = [
  /\b(canva|atlassian|stripe|airbnb|uber|openai|anthropic|google|meta|facebook|amazon|apple|microsoft|netflix|shopify|slack|dropbox|zoom|salesforce|linkedin|twitter|x\.com|tiktok|instagram|nvidia|intel|tesla|spacex|palantir|databricks|snowflake|figma|notion|linear|vercel|cloudflare|github|gitlab|hubspot|mailchimp|zendesk|intercom|twilio|square|paypal|klarna|afterpay|zip co|xero|myob|linktree|safetyculture|culture amp|deputy|employment hero|airwallex|brighte|athena home loans|prospa|judo bank|up bank)\b/gi,
];

function containsRealCompany(s: string): boolean {
  return NAMED_COMPANY_PATTERNS.some((rx) => rx.test(s));
}

// ── Public helpers ──────────────────────────────────────────────────────────

/** Return the two weakest SVI dims (score < 60), lowest first. */
export function pickWeakestDims(
  dimResults: Record<string, DimResultLike> | null | undefined,
): Array<{ dim: SviDim; score: number }> {
  if (!dimResults) return [];
  const scored: Array<{ dim: SviDim; score: number }> = [];
  for (const k of DIM_KEYS) {
    const v = dimResults[k];
    const s = typeof v?.score === "number" ? v.score : null;
    if (s !== null && Number.isFinite(s) && s < 60) {
      scored.push({ dim: k, score: s });
    }
  }
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, 2);
}

/** Return the weakest criteria for a given set of dims, up to `limit`. */
export function pickWeakestCriteria(
  criterionResults: CriterionResultLike[] | null | undefined,
  dims: SviDim[],
  limit = 4,
): CriterionResultLike[] {
  if (!criterionResults || criterionResults.length === 0) return [];
  const dimSet = new Set(dims);
  const filtered = criterionResults.filter((c) => {
    const pd = (c.primary_dimension ?? "").toLowerCase();
    return dimSet.has(pd as SviDim);
  });
  filtered.sort((a, b) => (a.score ?? 100) - (b.score ?? 100));
  return filtered.slice(0, limit);
}

// ── Prompt assembly ─────────────────────────────────────────────────────────

interface BenchmarkP75 {
  ftv?: number; mpc?: number; ptd?: number; tre?: number;
  cgh?: number; iri?: number; lco?: number; svm?: number;
}

async function loadSectorTopQuartile(sector: BenchmarkSector): Promise<BenchmarkP75> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return {};
  const { data } = await supabase
    .from("svi_sector_benchmarks")
    .select("dim_top_quartile")
    .eq("sector", sector)
    .maybeSingle();
  const q = (data as { dim_top_quartile?: BenchmarkP75 } | null)?.dim_top_quartile ?? {};
  return q;
}

function buildDimsSummary(
  weakest: Array<{ dim: SviDim; score: number }>,
  bench: BenchmarkP75,
): string {
  return weakest
    .map((w) => {
      const p75 = bench[w.dim];
      const p75Str = typeof p75 === "number" ? `${Math.round(p75)}` : "n/a";
      return `    - ${w.dim.toUpperCase()} (${DIM_LABEL[w.dim]}): score=${Math.round(w.score)}, sector 75th percentile=${p75Str}`;
    })
    .join("\n");
}

function buildCriteriaSummary(criteria: CriterionResultLike[]): string {
  if (criteria.length === 0) return "    - (no criterion-level data available)";
  return criteria
    .map((c) => {
      const key = c.key ?? "unknown";
      const title = c.title ?? key;
      const score = typeof c.score === "number" ? Math.round(c.score) : "?";
      const gapsArr = Array.isArray(c.gaps) ? (c.gaps as unknown[]).filter((g) => typeof g === "string").slice(0, 2) : [];
      const gaps = gapsArr.length > 0 ? ` — gaps: ${gapsArr.join("; ")}` : "";
      return `    - ${key} (${title}, dim=${(c.primary_dimension ?? "").toLowerCase()}, score=${score})${gaps}`;
    })
    .join("\n");
}

function renderPrompt(
  template: string,
  vars: { sector: string; weakestDimsSummary: string; weakestCriteriaSummary: string },
): string {
  return template
    .replace(/\{\{\s*sector\s*\}\}/g, vars.sector)
    .replace(/\{\{\s*weakestDimsSummary\s*\}\}/g, vars.weakestDimsSummary)
    .replace(/\{\{\s*weakestCriteriaSummary\s*\}\}/g, vars.weakestCriteriaSummary);
}

// ── JSON extraction + validation ────────────────────────────────────────────

interface RawTask {
  title?: unknown;
  detail?: unknown;
  criterion?: unknown;
  dim?: unknown;
  target_delta_points?: unknown;
}

function extractJsonArray(text: string): unknown[] | null {
  const trimmed = text.trim();
  // Try direct parse first
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray((parsed as { tasks?: unknown[] }).tasks)) {
      return (parsed as { tasks: unknown[] }).tasks;
    }
  } catch {
    /* fall through */
  }
  // Strip markdown code fence
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      const parsed = JSON.parse(fenced[1].trim());
      if (Array.isArray(parsed)) return parsed;
      if (parsed && Array.isArray((parsed as { tasks?: unknown[] }).tasks)) {
        return (parsed as { tasks: unknown[] }).tasks;
      }
    } catch {
      /* fall through */
    }
  }
  // Last resort: find first `[` and matching `]`
  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(trimmed.slice(start, end + 1));
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* give up */
    }
  }
  return null;
}

function isValidDim(x: unknown): x is SviDim {
  return typeof x === "string" && (DIM_KEYS as readonly string[]).includes(x);
}

function clampDelta(n: number): number {
  if (!Number.isFinite(n)) return 1.0;
  return Math.max(0.5, Math.min(4.0, Math.round(n * 10) / 10));
}

function normaliseTasks(
  raw: unknown[],
  fallbackDim: SviDim,
): Omit<ActionTask, "id" | "completed_at" | "evidence_url">[] {
  const out: Omit<ActionTask, "id" | "completed_at" | "evidence_url">[] = [];
  for (let i = 0; i < raw.length && out.length < 5; i++) {
    const t = raw[i] as RawTask;
    const title = typeof t.title === "string" ? t.title.trim() : "";
    const detail = typeof t.detail === "string" ? t.detail.trim() : "";
    const criterion = typeof t.criterion === "string" ? t.criterion.trim() : "";
    const dim = isValidDim(t.dim) ? t.dim : fallbackDim;
    const deltaNum =
      typeof t.target_delta_points === "number"
        ? t.target_delta_points
        : typeof t.target_delta_points === "string"
          ? Number.parseFloat(t.target_delta_points)
          : 1.0;
    if (!title || title.length > 200) continue;
    // Real-startup guard
    if (containsRealCompany(title) || containsRealCompany(detail)) continue;
    out.push({
      title: title.slice(0, 200),
      detail: detail.slice(0, 600),
      criterion: criterion.slice(0, 80),
      dim,
      target_delta_points: clampDelta(deltaNum),
      order_index: out.length,
    });
  }
  return out;
}

// ── Deterministic fallback (used when AI unavailable / all providers fail) ──

function fallbackTasks(
  weakest: Array<{ dim: SviDim; score: number }>,
  bench: BenchmarkP75,
): Omit<ActionTask, "id" | "completed_at" | "evidence_url">[] {
  const primary = weakest[0]?.dim ?? "tre";
  const secondary = weakest[1]?.dim ?? primary;
  const gap = (d: SviDim) => {
    const p75 = bench[d];
    const cur = weakest.find((w) => w.dim === d)?.score ?? 45;
    return typeof p75 === "number" ? Math.max(0.5, Math.min(4.0, (p75 - cur) * 0.06)) : 1.5;
  };
  return [
    {
      title: "Publish a one-page founder profile with verifiable proof points",
      detail:
        "List each founder's prior wins, domain years, and any patents or published work with links. Investors triangulate credibility before a first meeting.",
      criterion: "founder_profile",
      dim: primary,
      target_delta_points: clampDelta(gap(primary)),
      order_index: 0,
    },
    {
      title: "Book 10 discovery calls with target-segment buyers this month",
      detail:
        "Cold-outbound at least 40 ICP prospects to secure the 10 calls, and capture verbatim quotes. Frontline evidence beats survey data every time.",
      criterion: "market",
      dim: secondary,
      target_delta_points: clampDelta(gap(secondary) * 0.75),
      order_index: 1,
    },
    {
      title: "Ship a public case study with one paying customer's numbers",
      detail:
        "Get written permission, publish the outcome metric on your site, and link it from the pricing page. Third-party proof is the strongest traction signal.",
      criterion: "traction",
      dim: primary,
      target_delta_points: clampDelta(gap(primary) * 0.6),
      order_index: 2,
    },
    {
      title: "Draft a 12-month cash-runway model and share it with an advisor",
      detail:
        "Show monthly burn, headcount plan, and the trigger date for the next raise. Investors reward founders who can defend the number without stalling.",
      criterion: "cap_table",
      dim: secondary,
      target_delta_points: clampDelta(gap(secondary) * 0.5),
      order_index: 3,
    },
    {
      title: "Complete the ESIC self-assessment and file the working papers",
      detail:
        "Run the innovation and 100-point tests, save the calculations, and attach evidence to your data room. ESIC eligibility unlocks angel demand in AU.",
      criterion: "compliance",
      dim: secondary,
      target_delta_points: clampDelta(gap(secondary) * 0.4),
      order_index: 4,
    },
  ];
}

// ── Main entry point ────────────────────────────────────────────────────────

interface ExistingPlanRow {
  id: number;
  user_id: string;
  startup_id: string | null;
  svi_run_id: string;
  plan: Record<string, unknown>;
  created_at: string;
}

interface ExistingTaskRow {
  id: number;
  title: string;
  detail: string | null;
  criterion: string | null;
  dim: string | null;
  target_delta_points: number | null;
  completed_at: string | null;
  evidence_url: string | null;
  order_index: number;
}

async function loadExistingPlan(sviRunId: string): Promise<ActionPlan | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data: plan } = await supabase
    .from("svi_action_plans")
    .select("id, user_id, startup_id, svi_run_id, plan, created_at")
    .eq("svi_run_id", sviRunId)
    .maybeSingle();
  if (!plan) return null;
  const row = plan as ExistingPlanRow;
  const { data: tasks } = await supabase
    .from("svi_action_tasks")
    .select("id, title, detail, criterion, dim, target_delta_points, completed_at, evidence_url, order_index")
    .eq("plan_id", row.id)
    .order("order_index", { ascending: true });
  const taskRows = (tasks ?? []) as ExistingTaskRow[];
  return {
    id: row.id,
    user_id: row.user_id,
    startup_id: row.startup_id,
    svi_run_id: row.svi_run_id,
    plan: row.plan ?? {},
    created_at: row.created_at,
    cached: true,
    tasks: taskRows.map((t) => ({
      id: t.id,
      title: t.title,
      detail: t.detail ?? "",
      criterion: t.criterion ?? "",
      dim: (isValidDim(t.dim) ? t.dim : "svm"),
      target_delta_points: Number(t.target_delta_points ?? 1),
      order_index: t.order_index,
      completed_at: t.completed_at,
      evidence_url: t.evidence_url,
    })),
  };
}

export async function generateActionPlan(
  input: GenerateActionPlanInput,
): Promise<ActionPlan> {
  const { userId, startupId, sviRunId, dimResults, criterionResults, sector } = input;
  if (!userId || !sviRunId) throw new Error("userId and sviRunId are required");

  // Idempotency: return cached rows if a plan already exists for this run.
  const existing = await loadExistingPlan(sviRunId);
  if (existing && existing.tasks.length > 0) return existing;

  const canonicalSector = industryToSector(sector ?? null);
  const bench = await loadSectorTopQuartile(canonicalSector);
  const weakest = pickWeakestDims(dimResults);

  // If no weak dims (all >= 60), synthesise a "growth mode" pair from the two
  // lowest-scoring dims regardless of threshold so the plan still generates.
  let effectiveWeakest = weakest;
  if (effectiveWeakest.length < 2 && dimResults) {
    const all: Array<{ dim: SviDim; score: number }> = [];
    for (const k of DIM_KEYS) {
      const s = dimResults[k]?.score;
      if (typeof s === "number") all.push({ dim: k, score: s });
    }
    all.sort((a, b) => a.score - b.score);
    effectiveWeakest = all.slice(0, 2);
  }
  if (effectiveWeakest.length === 0) {
    effectiveWeakest = [{ dim: "tre", score: 45 }, { dim: "iri", score: 45 }];
  }

  const weakDims = effectiveWeakest.map((w) => w.dim);
  const weakestCriteria = pickWeakestCriteria(criterionResults, weakDims, 4);

  const cfg = await getPlatformConfig();
  const promptTemplate = cfg.prompts?.actionPlan ?? "";
  const systemPrompt = renderPrompt(promptTemplate, {
    sector: canonicalSector,
    weakestDimsSummary: buildDimsSummary(effectiveWeakest, bench),
    weakestCriteriaSummary: buildCriteriaSummary(weakestCriteria),
  });

  const userMessage =
    "Generate the JSON array now. Remember: exactly 5 tasks, no real company names, no markdown, no commentary — just the JSON array.";

  let tasks: Omit<ActionTask, "id" | "completed_at" | "evidence_url">[] = [];
  let provider = "fallback";
  let model = "fallback-deterministic";

  if (isAIConfigured() && promptTemplate) {
    try {
      const result = await callAI({
        system: systemPrompt,
        user: userMessage,
        maxTokens: 1500,
        temperature: 0.4,
        timeoutMs: 45_000,
      });
      provider = result.provider;
      model = result.model;
      const arr = extractJsonArray(result.text);
      if (arr) {
        tasks = normaliseTasks(arr, effectiveWeakest[0].dim);
      }
    } catch (err) {
      console.warn("[action-plan] AI generation failed, using fallback:", err instanceof Error ? err.message : String(err));
    }
  }

  if (tasks.length < 5) {
    // Backfill any missing slots with deterministic tasks so we always
    // persist exactly 5 rows.
    const fb = fallbackTasks(effectiveWeakest, bench);
    for (let i = tasks.length; i < 5; i++) {
      tasks.push({ ...fb[i], order_index: i });
    }
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase admin client unavailable");

  const planEnvelope = {
    provider,
    model,
    sector: canonicalSector,
    weakest_dims: effectiveWeakest,
    weakest_criteria_keys: weakestCriteria.map((c) => c.key ?? "").filter(Boolean),
    generated_at: new Date().toISOString(),
    version: "wave28c/1",
  };

  const { data: planRow, error: planErr } = await supabase
    .from("svi_action_plans")
    .upsert(
      {
        user_id: userId,
        startup_id: startupId ?? null,
        svi_run_id: sviRunId,
        plan: planEnvelope,
      },
      { onConflict: "svi_run_id" },
    )
    .select("id, user_id, startup_id, svi_run_id, plan, created_at")
    .single();

  if (planErr || !planRow) {
    throw new Error(`Failed to persist action plan: ${planErr?.message ?? "unknown"}`);
  }
  const savedPlan = planRow as ExistingPlanRow;

  // Fresh insert of task rows — clear any prior rows first for the case where
  // the UPSERT bumped an existing plan (defensive; the UNIQUE on svi_run_id
  // means this typically only runs once per run).
  await supabase.from("svi_action_tasks").delete().eq("plan_id", savedPlan.id);

  const taskRows = tasks.slice(0, 5).map((t, i) => ({
    plan_id: savedPlan.id,
    title: t.title,
    detail: t.detail,
    criterion: t.criterion,
    dim: t.dim,
    target_delta_points: t.target_delta_points,
    order_index: i,
  }));

  const { data: inserted, error: taskErr } = await supabase
    .from("svi_action_tasks")
    .insert(taskRows)
    .select("id, title, detail, criterion, dim, target_delta_points, completed_at, evidence_url, order_index")
    .order("order_index", { ascending: true });

  if (taskErr) {
    throw new Error(`Failed to persist action tasks: ${taskErr.message}`);
  }

  const insertedRows = (inserted ?? []) as ExistingTaskRow[];

  return {
    id: savedPlan.id,
    user_id: savedPlan.user_id,
    startup_id: savedPlan.startup_id,
    svi_run_id: savedPlan.svi_run_id,
    plan: savedPlan.plan ?? planEnvelope,
    created_at: savedPlan.created_at,
    cached: false,
    tasks: insertedRows.map((t) => ({
      id: t.id,
      title: t.title,
      detail: t.detail ?? "",
      criterion: t.criterion ?? "",
      dim: (isValidDim(t.dim) ? t.dim : effectiveWeakest[0].dim),
      target_delta_points: Number(t.target_delta_points ?? 1),
      order_index: t.order_index,
      completed_at: t.completed_at,
      evidence_url: t.evidence_url,
    })),
  };
}

// Exported for the /api/svi/action-plan/[id] GET route.
export async function loadActionPlanById(planId: number): Promise<ActionPlan | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data: plan } = await supabase
    .from("svi_action_plans")
    .select("id, user_id, startup_id, svi_run_id, plan, created_at")
    .eq("id", planId)
    .maybeSingle();
  if (!plan) return null;
  const row = plan as ExistingPlanRow;
  const { data: tasks } = await supabase
    .from("svi_action_tasks")
    .select("id, title, detail, criterion, dim, target_delta_points, completed_at, evidence_url, order_index")
    .eq("plan_id", row.id)
    .order("order_index", { ascending: true });
  const taskRows = (tasks ?? []) as ExistingTaskRow[];
  return {
    id: row.id,
    user_id: row.user_id,
    startup_id: row.startup_id,
    svi_run_id: row.svi_run_id,
    plan: row.plan ?? {},
    created_at: row.created_at,
    cached: true,
    tasks: taskRows.map((t) => ({
      id: t.id,
      title: t.title,
      detail: t.detail ?? "",
      criterion: t.criterion ?? "",
      dim: (isValidDim(t.dim) ? t.dim : "svm"),
      target_delta_points: Number(t.target_delta_points ?? 1),
      order_index: t.order_index,
      completed_at: t.completed_at,
      evidence_url: t.evidence_url,
    })),
  };
}
