// Centralized platform config — all pricing, limits, and feature flags in one place.
// Defaults are in code; admin can override via Supabase `platform_config` table.
// Cache TTL: 60s server-side so changes propagate within 1 minute.

export interface PlatformConfig {
  // ── Founding plan ──────────────────────────────────────────────────────────
  founding_plan_name: string;       // e.g. "Founding 100"
  founding_spots_total: number;     // e.g. 100
  founding_price_cents: number;     // e.g. 100 = AUD $1.00
  founding_credits: number;         // e.g. 100 credits per plan

  // ── Free plan ───────────────────────────────────────────────────────────────
  free_credits_on_signup: number;   // e.g. 5

  // ── Growth plan ─────────────────────────────────────────────────────────────
  growth_price_monthly_cents: number; // e.g. 9900 = A$99/mo
  growth_price_yearly_cents: number;  // e.g. 95000 = A$950/yr

  // ── Promo / early bird ──────────────────────────────────────────────────────
  promo_code: string;               // e.g. "LAUNCH100"
  promo_label: string;              // e.g. "instant access to Founding 100"
  early_bird_deadline: string;      // ISO date string e.g. "2026-08-01"

  // ── Feature flags ───────────────────────────────────────────────────────────
  founding_plan_active: boolean;    // show/hide the Founding plan entirely
  waitlist_mode: boolean;           // if true, show waitlist instead of checkout
}

export const CONFIG_DEFAULTS: PlatformConfig = {
  founding_plan_name: "Founding 100",
  founding_spots_total: 100,
  founding_price_cents: 100,
  founding_credits: 100,

  free_credits_on_signup: 5,

  growth_price_monthly_cents: 9900,
  growth_price_yearly_cents: 95000,

  promo_code: "LAUNCH100",
  promo_label: "instant access to Founding 100",
  early_bird_deadline: "2026-08-01",

  founding_plan_active: true,
  waitlist_mode: false,
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
