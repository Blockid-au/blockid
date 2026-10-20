// A1 (pricing v5 §7.3 / §7.4, G35) — ONE typed model catalogue.
//
// What a model IS (provider, family, size, context, capabilities), what it is
// FOR (task roles from the §7.3 matrix) and whether the founder-pinned report
// scope admits it. Prices are NOT a fourth table: every row resolves its price
// through `priceFor()` in model-prices.ts (the single ledger table), and the
// four report-admitted rows are cross-checked against the integer table pinned
// in report-attempt-budget.ts by model-catalog.test.ts.
//
// Rules this file must keep (catalogue integrity test):
//   • (provider, id) unique;
//   • `admitted` ⇒ provider "deepinfra" and the set equals REPORT_ADMITTED_MODELS
//     (G30 founder policy: report scope = DeepInfra-only admitted models; any
//     other provider is at most a qualified FREE fallback, never paid spillover);
//   • `billing: "paid"` ⇒ a positive in/out price row in model-prices.ts;
//     `free` / `subscription` ⇒ zero marginal price.
// A new model enters `admitted` only after the A2 eval + founder approval of
// a proposal — never because the nightly price sync saw it.
//
// Pure data + pure helpers: no server-only, no fs — the admin page, the
// sync-prices script (via tsx) and tests all import it.

import { priceFor, type PricePer1M } from "./model-prices";

export type CatalogProvider = "deepinfra" | "groq" | "cerebras" | "openrouter" | "gemini" | "claude-oauth";
export type ModelCapability = "text" | "vision" | "json" | "tools";
export type SizeClass = "small" | "medium" | "large" | "xl" | "unknown";
/** §7.3 matrix rows. */
export type TaskRole =
  | "report_chapter"
  | "ceo_synthesis"
  | "grounding_judge"
  | "extraction_classify"
  | "translation"
  | "chat"
  | "vision";
export type RoleTier = "primary" | "challenger" | "free_fallback" | "last_resort";
export type Billing = "paid" | "free" | "subscription";
/** Where the nightly sync reads this row's price: a public feed, or nothing (manual page check). */
export type PriceFeedSource = "deepinfra" | "openrouter" | "manual";

export interface RoleAssignment {
  role: TaskRole;
  tier: RoleTier;
}

export interface CatalogModel {
  /** Exact provider model id (what the dispatcher sends). */
  id: string;
  provider: CatalogProvider;
  family: string;
  /** Total parameters, billions; null when the vendor does not publish it. */
  paramsB: number | null;
  sizeClass: SizeClass;
  contextTokens: number;
  capabilities: readonly ModelCapability[];
  roles: readonly RoleAssignment[];
  billing: Billing;
  /** In the founder-pinned report scope (DeepInfra only, priced in report-attempt-budget.ts). */
  admitted: boolean;
  priceFeed: PriceFeedSource;
  /** Official page the price / id was verified on. */
  source: string;
  /** YYYY-MM-DD the id + price were last verified. */
  verifiedAt: string;
  notes?: string;
}

const DI = (id: string) => `https://deepinfra.com/${id}`;
const OR = (id: string) => `https://openrouter.ai/${id.replace(/:free$/, "")}`;
const GEMINI_PRICING = "https://ai.google.dev/gemini-api/docs/pricing";
const GROQ_MODELS = "https://console.groq.com/docs/models";
const CEREBRAS_MODELS = "https://inference-docs.cerebras.ai/models/overview";

const r = (role: TaskRole, tier: RoleTier): RoleAssignment => ({ role, tier });

/** The catalogue. Seeded from the §7.3 matrix, ids + prices checked against the
 *  public feeds (api.deepinfra.com/v1/openai/models, openrouter.ai/api/v1/models)
 *  on 2026-10-20. */
export const MODEL_CATALOG: readonly CatalogModel[] = [
  // ── DeepInfra — report scope (admitted) ───────────────────────────────
  {
    id: "deepseek-ai/DeepSeek-V3.2", provider: "deepinfra", family: "deepseek", paramsB: 685, sizeClass: "xl",
    contextTokens: 163_840, capabilities: ["text", "json", "tools"],
    roles: [r("report_chapter", "primary"), r("ceo_synthesis", "primary")],
    billing: "paid", admitted: true, priceFeed: "deepinfra", source: DI("deepseek-ai/DeepSeek-V3.2"), verifiedAt: "2026-10-20",
    notes: "Best measured citation grounding (G30 §2); thinking:false.",
  },
  {
    id: "Qwen/Qwen3-235B-A22B-Instruct-2507", provider: "deepinfra", family: "qwen", paramsB: 235, sizeClass: "xl",
    contextTokens: 262_144, capabilities: ["text", "json", "tools"],
    roles: [r("report_chapter", "challenger"), r("ceo_synthesis", "challenger"), r("grounding_judge", "primary"), r("translation", "primary")],
    billing: "paid", admitted: true, priceFeed: "deepinfra", source: DI("Qwen/Qwen3-235B-A22B-Instruct-2507"), verifiedAt: "2026-10-20",
    notes: "Different family from the DeepSeek writer — the judge/critic role.",
  },
  {
    id: "deepseek-ai/DeepSeek-V4-Flash", provider: "deepinfra", family: "deepseek", paramsB: null, sizeClass: "large",
    contextTokens: 1_048_576, capabilities: ["text", "json", "tools"],
    roles: [r("report_chapter", "challenger"), r("extraction_classify", "challenger"), r("translation", "challenger"), r("chat", "challenger")],
    billing: "paid", admitted: true, priceFeed: "deepinfra", source: DI("deepseek-ai/DeepSeek-V4-Flash"), verifiedAt: "2026-10-20",
  },
  {
    id: "Qwen/Qwen3-VL-235B-A22B-Instruct", provider: "deepinfra", family: "qwen", paramsB: 235, sizeClass: "xl",
    contextTokens: 262_144, capabilities: ["text", "vision", "json", "tools"],
    roles: [r("vision", "primary")],
    billing: "paid", admitted: true, priceFeed: "deepinfra", source: DI("Qwen/Qwen3-VL-235B-A22B-Instruct"), verifiedAt: "2026-10-20",
  },
  // ── DeepInfra — challengers (NOT admitted; A2 eval + founder approval first) ──
  {
    id: "deepseek-ai/DeepSeek-V4-Flash-0731", provider: "deepinfra", family: "deepseek", paramsB: null, sizeClass: "large",
    contextTokens: 1_048_576, capabilities: ["text", "json", "tools"],
    roles: [r("report_chapter", "challenger"), r("extraction_classify", "challenger")],
    billing: "paid", admitted: false, priceFeed: "deepinfra", source: DI("deepseek-ai/DeepSeek-V4-Flash-0731"), verifiedAt: "2026-10-20",
    notes: "Cheaper input than V4-Flash; not an alias — qualify separately.",
  },
  {
    id: "zai-org/GLM-5.3-Flash", provider: "deepinfra", family: "glm", paramsB: null, sizeClass: "large",
    contextTokens: 1_048_576, capabilities: ["text", "vision", "json", "tools"],
    roles: [r("ceo_synthesis", "challenger")],
    billing: "paid", admitted: false, priceFeed: "deepinfra", source: DI("zai-org/GLM-5.3-Flash"), verifiedAt: "2026-10-20",
    notes: "Feed shows a 50 % promo ending 2026-10-20 23:59 UTC.",
  },
  {
    id: "deepseek-ai/DeepSeek-V4.1-Flash", provider: "deepinfra", family: "deepseek", paramsB: null, sizeClass: "large",
    contextTokens: 1_048_576, capabilities: ["text", "vision", "json", "tools"],
    roles: [r("ceo_synthesis", "challenger")],
    billing: "paid", admitted: false, priceFeed: "deepinfra", source: DI("deepseek-ai/DeepSeek-V4.1-Flash"), verifiedAt: "2026-10-20",
  },
  {
    id: "meta-llama/Llama-3.3-70B-Instruct-Turbo", provider: "deepinfra", family: "llama", paramsB: 70, sizeClass: "medium",
    contextTokens: 131_072, capabilities: ["text", "json", "tools"],
    roles: [r("grounding_judge", "challenger")],
    billing: "paid", admitted: false, priceFeed: "deepinfra", source: DI("meta-llama/Llama-3.3-70B-Instruct-Turbo"), verifiedAt: "2026-10-20",
    notes: "Third family for the G32 panel; unscoped classify rung today.",
  },
  {
    id: "openai/gpt-oss-120b", provider: "deepinfra", family: "gpt-oss", paramsB: 117, sizeClass: "large",
    contextTokens: 131_072, capabilities: ["text", "json", "tools"],
    roles: [r("extraction_classify", "primary")],
    billing: "paid", admitted: false, priceFeed: "deepinfra", source: DI("openai/gpt-oss-120b"), verifiedAt: "2026-10-20",
    notes: "0 citations in the G30 report smoke — never a report/judge model.",
  },
  {
    id: "Qwen/Qwen3-VL-30B-A3B-Instruct", provider: "deepinfra", family: "qwen", paramsB: 30, sizeClass: "medium",
    contextTokens: 262_144, capabilities: ["text", "vision", "json", "tools"],
    roles: [r("vision", "challenger")],
    billing: "paid", admitted: false, priceFeed: "deepinfra", source: DI("Qwen/Qwen3-VL-30B-A3B-Instruct"), verifiedAt: "2026-10-20",
  },
  {
    id: "google/gemma-4-31B-it", provider: "deepinfra", family: "gemma", paramsB: 31, sizeClass: "medium",
    contextTokens: 262_144, capabilities: ["text", "vision", "json", "tools"],
    roles: [r("vision", "challenger")],
    billing: "paid", admitted: false, priceFeed: "deepinfra", source: DI("google/gemma-4-31B-it"), verifiedAt: "2026-10-20",
  },
  {
    id: "moonshotai/Kimi-K2.6", provider: "deepinfra", family: "kimi", paramsB: null, sizeClass: "xl",
    contextTokens: 262_144, capabilities: ["text", "vision", "json", "tools"],
    roles: [],
    billing: "paid", admitted: false, priceFeed: "deepinfra", source: DI("moonshotai/Kimi-K2.6"), verifiedAt: "2026-10-20",
    notes: "Unscoped synthesis rung only (refused by the report budget).",
  },
  {
    id: "deepseek-ai/DeepSeek-V4-Pro", provider: "deepinfra", family: "deepseek", paramsB: null, sizeClass: "xl",
    contextTokens: 1_048_576, capabilities: ["text", "json", "tools"],
    roles: [],
    billing: "paid", admitted: false, priceFeed: "deepinfra", source: DI("deepseek-ai/DeepSeek-V4-Pro"), verifiedAt: "2026-10-20",
    notes: "Priced for the ledger only; premium, not in any default chain.",
  },
  // ── Groq — free tier (non-report fallbacks) ───────────────────────────
  {
    id: "openai/gpt-oss-120b", provider: "groq", family: "gpt-oss", paramsB: 117, sizeClass: "large",
    contextTokens: 131_072, capabilities: ["text", "json", "tools"],
    roles: [r("chat", "primary"), r("grounding_judge", "free_fallback"), r("extraction_classify", "free_fallback")],
    billing: "free", admitted: false, priceFeed: "manual", source: GROQ_MODELS, verifiedAt: "2026-10-20",
  },
  {
    id: "openai/gpt-oss-20b", provider: "groq", family: "gpt-oss", paramsB: 21, sizeClass: "medium",
    contextTokens: 131_072, capabilities: ["text", "json", "tools"],
    roles: [r("extraction_classify", "free_fallback")],
    billing: "free", admitted: false, priceFeed: "manual", source: GROQ_MODELS, verifiedAt: "2026-10-20",
  },
  {
    id: "qwen/qwen3.8-27b", provider: "groq", family: "qwen", paramsB: 27, sizeClass: "medium",
    contextTokens: 131_072, capabilities: ["text", "json", "tools"],
    roles: [r("translation", "free_fallback")],
    billing: "free", admitted: false, priceFeed: "manual", source: GROQ_MODELS, verifiedAt: "2026-10-20",
  },
  // ── Cerebras — free tier (catalogue lists only these two, W1) ─────────
  {
    id: "gpt-oss-120b", provider: "cerebras", family: "gpt-oss", paramsB: 117, sizeClass: "large",
    contextTokens: 131_072, capabilities: ["text", "json"],
    roles: [],
    billing: "free", admitted: false, priceFeed: "manual", source: CEREBRAS_MODELS, verifiedAt: "2026-10-20",
  },
  {
    id: "qwen-3.8-27b", provider: "cerebras", family: "qwen", paramsB: 27, sizeClass: "medium",
    contextTokens: 131_072, capabilities: ["text", "json"],
    roles: [],
    billing: "free", admitted: false, priceFeed: "manual", source: CEREBRAS_MODELS, verifiedAt: "2026-10-20",
  },
  // ── OpenRouter — `:free` ids (exempt from the credit floor, W1) ───────
  {
    id: "nvidia/nemotron-3-ultra-550b-a55b:free", provider: "openrouter", family: "nemotron", paramsB: 550, sizeClass: "xl",
    contextTokens: 1_000_000, capabilities: ["text", "json"],
    roles: [r("ceo_synthesis", "free_fallback")],
    billing: "free", admitted: false, priceFeed: "openrouter", source: OR("nvidia/nemotron-3-ultra-550b-a55b:free"), verifiedAt: "2026-10-20",
    notes: "Outside the report scope.",
  },
  {
    id: "nvidia/nemotron-3-super-120b-a12b:free", provider: "openrouter", family: "nemotron", paramsB: 120, sizeClass: "large",
    contextTokens: 262_144, capabilities: ["text", "json"],
    roles: [],
    billing: "free", admitted: false, priceFeed: "openrouter", source: OR("nvidia/nemotron-3-super-120b-a12b:free"), verifiedAt: "2026-10-20",
  },
  {
    id: "google/gemma-4-31b-it:free", provider: "openrouter", family: "gemma", paramsB: 31, sizeClass: "medium",
    contextTokens: 262_144, capabilities: ["text", "vision", "json"],
    roles: [],
    billing: "free", admitted: false, priceFeed: "openrouter", source: OR("google/gemma-4-31b-it:free"), verifiedAt: "2026-10-20",
  },
  {
    id: "minimax/minimax-m3.1-flash:free", provider: "openrouter", family: "minimax", paramsB: null, sizeClass: "unknown",
    contextTokens: 1_000_000, capabilities: ["text", "vision", "json", "tools"],
    roles: [],
    billing: "free", admitted: false, priceFeed: "openrouter", source: OR("minimax/minimax-m3.1-flash:free"), verifiedAt: "2026-10-20",
  },
  {
    id: "nvidia/nemotron-3.5-super-vl:free", provider: "openrouter", family: "nemotron", paramsB: null, sizeClass: "large",
    contextTokens: 1_000_000, capabilities: ["text", "vision", "json"],
    roles: [],
    billing: "free", admitted: false, priceFeed: "openrouter", source: OR("nvidia/nemotron-3.5-super-vl:free"), verifiedAt: "2026-10-20",
  },
  // ── Gemini — paid quality-cost tier (free-tier quota first) ───────────
  {
    id: "gemini-2.5-flash", provider: "gemini", family: "gemini", paramsB: null, sizeClass: "unknown",
    contextTokens: 1_048_576, capabilities: ["text", "vision", "json", "tools"],
    roles: [r("chat", "free_fallback"), r("vision", "last_resort")],
    billing: "paid", admitted: false, priceFeed: "manual", source: GEMINI_PRICING, verifiedAt: "2026-10-20",
  },
  {
    id: "gemini-2.5-flash-lite", provider: "gemini", family: "gemini", paramsB: null, sizeClass: "unknown",
    contextTokens: 1_048_576, capabilities: ["text", "vision", "json", "tools"],
    roles: [r("extraction_classify", "last_resort")],
    billing: "paid", admitted: false, priceFeed: "manual", source: GEMINI_PRICING, verifiedAt: "2026-10-20",
  },
  {
    id: "gemini-2.5-pro", provider: "gemini", family: "gemini", paramsB: null, sizeClass: "unknown",
    contextTokens: 1_048_576, capabilities: ["text", "vision", "json", "tools"],
    roles: [],
    billing: "paid", admitted: false, priceFeed: "manual", source: GEMINI_PRICING, verifiedAt: "2026-10-20",
  },
  {
    id: "gemini-3-flash-preview", provider: "gemini", family: "gemini", paramsB: null, sizeClass: "unknown",
    contextTokens: 1_048_576, capabilities: ["text", "vision", "json", "tools"],
    roles: [],
    billing: "paid", admitted: false, priceFeed: "manual", source: GEMINI_PRICING, verifiedAt: "2026-10-20",
  },
  {
    id: "gemini-3.1-pro-preview", provider: "gemini", family: "gemini", paramsB: null, sizeClass: "unknown",
    contextTokens: 1_048_576, capabilities: ["text", "vision", "json", "tools"],
    roles: [],
    billing: "paid", admitted: false, priceFeed: "manual", source: GEMINI_PRICING, verifiedAt: "2026-10-20",
  },
  {
    id: "gemini-3.1-flash-lite", provider: "gemini", family: "gemini", paramsB: null, sizeClass: "unknown",
    contextTokens: 1_048_576, capabilities: ["text", "vision", "json", "tools"],
    roles: [],
    billing: "paid", admitted: false, priceFeed: "manual", source: GEMINI_PRICING, verifiedAt: "2026-10-20",
  },
  // ── Claude CLI subscription — internal last resort only ───────────────
  {
    id: "claude-sonnet-5", provider: "claude-oauth", family: "claude", paramsB: null, sizeClass: "unknown",
    contextTokens: 200_000, capabilities: ["text", "vision", "json", "tools"],
    roles: [r("ceo_synthesis", "last_resort"), r("chat", "last_resort")],
    billing: "subscription", admitted: false, priceFeed: "manual", source: "https://docs.anthropic.com/en/docs/about-claude/models", verifiedAt: "2026-10-20",
    notes: "Personal CLI credential: internal fallback, never customer report scope.",
  },
];

/** `provider:id` — the key model-prices.ts uses for paid rows. */
export function catalogKey(m: Pick<CatalogModel, "provider" | "id">): string {
  return `${m.provider}:${m.id}`;
}

export function findCatalogModel(provider: string, id: string): CatalogModel | undefined {
  return MODEL_CATALOG.find((m) => m.provider === provider && m.id === id);
}

/** The row's price (USD / 1M tokens) from the single ledger table; zero for free / subscription rows. */
export function catalogPrice(m: CatalogModel): PricePer1M | null {
  if (m.billing !== "paid") return { in: 0, out: 0 };
  return priceFor(m.provider, m.id);
}

/** The DeepInfra ids the report scope admits (must equal REPORT_ADMITTED_MODELS). */
export function admittedModelIds(): string[] {
  return MODEL_CATALOG.filter((m) => m.admitted).map((m) => m.id);
}

/** Rows that serve a §7.3 role, ordered primary → challenger → free_fallback → last_resort. */
export function modelsForRole(role: TaskRole): Array<CatalogModel & { tier: RoleTier }> {
  const order: Record<RoleTier, number> = { primary: 0, challenger: 1, free_fallback: 2, last_resort: 3 };
  return MODEL_CATALOG.flatMap((m) => m.roles.filter((a) => a.role === role).map((a) => ({ ...m, tier: a.tier })))
    .sort((a, b) => order[a.tier] - order[b.tier]);
}

/** Rows whose price the nightly sync can verify from a public feed. */
export function feedCheckedModels(): CatalogModel[] {
  return MODEL_CATALOG.filter((m) => m.priceFeed !== "manual");
}
