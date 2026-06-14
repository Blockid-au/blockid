// Centralized platform config — all pricing, limits, and feature flags in one place.
// Defaults are in code; admin can override via Supabase `platform_config` table.
// Cache TTL: 60s server-side so changes propagate within 1 minute.

export interface SviWeights {
  ftv: number; // Founder-Team Viability
  mpc: number; // Market & Problem Clarity
  ptd: number; // Product & Tech Depth
  tre: number; // Traction & Revenue Evidence
  cgh: number; // Capital & Growth Health
  iri: number; // IP, Risk & Industry
  lco: number; // Legal & Compliance
  svm: number; // SVI Momentum
}

export interface StageThreshold {
  min: number;
  max: number;
  stage: string;
  color: string;
}

export interface PlatformConfig {
  // ── Founding plan ──────────────────────────────────────────────────────────
  founding_plan_name: string;       // e.g. "Founding 100"
  founding_spots_total: number;     // e.g. 100
  founding_price_cents: number;     // e.g. 100 = AUD $1.00
  founding_credits: number;         // e.g. 100 credits per plan

  // ── Free plan ───────────────────────────────────────────────────────────────
  free_credits_on_signup: number;   // e.g. 5

  // ── Growth plan ─────────────────────────────────────────────────────────────
  growth_price_monthly_cents: number;  // e.g. 9900 = A$99/mo
  growth_price_yearly_cents: number;   // e.g. 95000 = A$950/yr
  growth_plan_credits_monthly: number; // e.g. 200 credits/mo

  // ── Referral ────────────────────────────────────────────────────────────────
  referral_credits: number;         // credits granted per referral

  // ── Promo / early bird ──────────────────────────────────────────────────────
  promo_code: string;               // e.g. "LAUNCH100"
  promo_label: string;              // e.g. "instant access to Founding 100"
  early_bird_deadline: string;      // ISO date string e.g. "2026-08-01"

  // ── Key credit costs (overrides FEATURE_COSTS for these features) ──────────
  credit_cost_svi_analysis: number;     // default 0.50
  credit_cost_term_sheet: number;       // default 1.00
  credit_cost_rnd_report: number;       // default 1.00
  credit_cost_evidence_analyze: number; // default 0.50

  // ── SVI Engine ───────────────────────────────────────────────────────────────
  svi_weights: SviWeights;
  stage_thresholds: StageThreshold[];

  // ── Feature flags ───────────────────────────────────────────────────────────
  founding_plan_active: boolean;    // show/hide the Founding plan entirely
  waitlist_mode: boolean;           // if true, show waitlist instead of checkout
  linkedin_post_enabled: boolean;   // auto-publish LinkedIn posts
}

export const CONFIG_DEFAULTS: PlatformConfig = {
  founding_plan_name: "Founding 100",
  founding_spots_total: 100,
  founding_price_cents: 100,
  founding_credits: 100,

  free_credits_on_signup: 5,

  growth_price_monthly_cents: 9900,
  growth_price_yearly_cents: 95000,
  growth_plan_credits_monthly: 200,

  referral_credits: 2,

  promo_code: "LAUNCH100",
  promo_label: "instant access to Founding 100",
  early_bird_deadline: "2026-08-01",

  credit_cost_svi_analysis: 0.50,
  credit_cost_term_sheet: 1.00,
  credit_cost_rnd_report: 1.00,
  credit_cost_evidence_analyze: 0.50,

  svi_weights: {
    ftv: 15,
    mpc: 18,
    ptd: 12,
    tre: 20,
    cgh: 12,
    iri: 10,
    lco: 8,
    svm: 5,
  },

  stage_thresholds: [
    { min: 0,  max: 20,  stage: "Pre-Idea",      color: "bg-gray-200 text-gray-700" },
    { min: 20, max: 40,  stage: "Idea",           color: "bg-red-100 text-red-700" },
    { min: 40, max: 60,  stage: "Validation",     color: "bg-amber-100 text-amber-700" },
    { min: 60, max: 75,  stage: "Early Traction", color: "bg-yellow-100 text-yellow-700" },
    { min: 75, max: 90,  stage: "Growth",         color: "bg-emerald-100 text-emerald-700" },
    { min: 90, max: 100, stage: "Scale",          color: "bg-brand-100 text-brand-700" },
  ],

  founding_plan_active: true,
  waitlist_mode: false,
  linkedin_post_enabled: false,
};

// ── Derived helpers (pure, no DB) ────────────────────────────────────────────

export function founding_price_aud(cfg: PlatformConfig): string {
  return `A$${(cfg.founding_price_cents / 100).toFixed(cfg.founding_price_cents % 100 === 0 ? 0 : 2)}`;
}

export function growth_price_monthly_aud(cfg: PlatformConfig): string {
  return `A$${(cfg.growth_price_monthly_cents / 100).toFixed(0)}/mo`;
}

export function growth_price_yearly_aud(cfg: PlatformConfig): string {
  return `A$${(cfg.growth_price_yearly_cents / 100).toFixed(0)}/yr`;
}

// ── Server-side cache ─────────────────────────────────────────────────────────

let _cache: { cfg: PlatformConfig; ts: number } | null = null;
const CACHE_TTL_MS = 60_000;

export function invalidatePlatformConfigCache() {
  _cache = null;
}

export async function getPlatformConfig(): Promise<PlatformConfig> {
  if (_cache && Date.now() - _cache.ts < CACHE_TTL_MS) return _cache.cfg;

  try {
    const { getSupabaseAdmin, isSupabaseConfigured } = await import("@/lib/supabase");
    if (!isSupabaseConfigured()) return CONFIG_DEFAULTS;
    const supabase = getSupabaseAdmin();
    if (!supabase) return CONFIG_DEFAULTS;

    const { data, error } = await supabase
      .from("platform_config")
      .select("key, value");

    if (error || !data || data.length === 0) return CONFIG_DEFAULTS;

    const overrides: Partial<PlatformConfig> = {};
    for (const row of data) {
      const key = row.key as keyof PlatformConfig;
      if (key in CONFIG_DEFAULTS) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (overrides as any)[key] = row.value;
      }
    }

    const cfg = { ...CONFIG_DEFAULTS, ...overrides };
    _cache = { cfg, ts: Date.now() };
    return cfg;
  } catch {
    return CONFIG_DEFAULTS;
  }
}

// ── Admin write ───────────────────────────────────────────────────────────────

export async function savePlatformConfig(
  patch: Partial<PlatformConfig>,
  updatedBy = "admin",
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { getSupabaseAdmin, isSupabaseConfigured } = await import("@/lib/supabase");
    if (!isSupabaseConfigured()) return { ok: false, error: "Supabase not configured" };
    const supabase = getSupabaseAdmin();
    if (!supabase) return { ok: false, error: "Supabase admin client unavailable" };

    const rows = Object.entries(patch).map(([key, value]) => ({
      key,
      value,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    }));

    const { error } = await supabase
      .from("platform_config")
      .upsert(rows, { onConflict: "key" });

    if (error) return { ok: false, error: error.message };

    invalidatePlatformConfigCache();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
