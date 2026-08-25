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

// Copy strings + suggested numeric hints for the /workspace/(founder-features)
// pages. Kept in platform-config so ops can tune the empty-state copy and
// "Suggested: N" nudges from the admin panel without a redeploy.
export interface FounderFeaturesCopy {
  gtm_intro: string;
  gtm_placeholder_segment: string;
  gtm_placeholder_value_prop: string;
  competitors_intro: string;
  competitors_suggested_direct: number;
  pricing_intro: string;
  pricing_suggested_tiers: number;
  roadmap_intro: string;
  roadmap_quarters_ahead: number;
  team_intro: string;
  team_suggested_advisors: number;
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

  // ── Guest One-Click Analysis (sku_one_click_report_3aud) ───────────────────
  // Displayed price for the A$3 guest paywall. The Stripe Price is the
  // source of truth for what actually gets charged (STRIPE_PRICE_ONE_CLICK_REPORT);
  // this value drives the /pricing surface + guest funnel copy so ops can
  // A/B the display without a redeploy.
  guest_analysis_price_aud_cents: number;   // e.g. 300 = A$3.00 inc-GST

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

  // ── CRM integration ──────────────────────────────────────────────────────────
  // Zapier webhook URL for the "Push to CRM" feature. Set ZAPIER_WEBHOOK_URL
  // in the server environment — this config entry is the canonical empty-string
  // default so the admin panel can surface it. The actual secret must live in
  // .env / the host env, never in this file.
  zapier_webhook_url: string;       // "" = feature disabled (returns 501)

  // ── Feature flags ───────────────────────────────────────────────────────────
  founding_plan_active: boolean;    // show/hide the Founding plan entirely
  waitlist_mode: boolean;           // if true, show waitlist instead of checkout
  linkedin_post_enabled: boolean;   // auto-publish LinkedIn posts

  // ── Founder core features (Phase 1 workspace pages) ─────────────────────────
  founder_features_copy: FounderFeaturesCopy;
}

export const CONFIG_DEFAULTS: PlatformConfig = {
  founding_plan_name: "Founding 100",
  founding_spots_total: 100,
  founding_price_cents: 500, // A$5 — promo through 2026-08-31; reverts to A$9900 (A$99) after the deadline. Bumped from A$3 (2026-06-21); A$1 was the original launch price (2026-06-17).
  founding_credits: 50,

  free_credits_on_signup: 5,

  growth_price_monthly_cents: 9900,
  growth_price_yearly_cents: 95000,
  growth_plan_credits_monthly: 200,

  guest_analysis_price_aud_cents: 300,

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

  // Set ZAPIER_WEBHOOK_URL in web/.env — never hard-code the URL here.
  zapier_webhook_url: "",

  founding_plan_active: true,
  waitlist_mode: false,
  linkedin_post_enabled: false,

  founder_features_copy: {
    gtm_intro:
      "Map your go-to-market — ICP, value prop, channels, sales motion, pricing anchor, and north-star metric. One canvas per startup, saved as you go.",
    gtm_placeholder_segment:
      "e.g. AU seed-stage SaaS founders, 1–5 FTE, pre-Series A",
    gtm_placeholder_value_prop:
      "e.g. The fastest way for AU founders to score their startup and act on the gaps.",
    competitors_intro:
      "Track direct and indirect competitors. Compare positioning, pricing, strengths and weaknesses — investors will ask.",
    competitors_suggested_direct: 3,
    pricing_intro:
      "Design your own SaaS pricing tiers. Model freemium, per-seat, tiered, or enterprise. This is your product's pricing — not BlockID's.",
    pricing_suggested_tiers: 3,
    roadmap_intro:
      "Plan the next few quarters — product, growth, fundraise, team, compliance. Founder-authored milestones roll into the investor pack.",
    roadmap_quarters_ahead: 6,
    team_intro:
      "Roster your team and plan next hires. Track founders, hires, advisors, contractors — with equity, salary, and status.",
    team_suggested_advisors: 3,
  },
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
