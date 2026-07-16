// DB-backed plan matrix reader with 60-second in-process cache.
//
// Source of truth is the `plans` table (migration 0074). If the DB is
// unavailable or a plan row is missing, we fall back to plans.generated.ts
// (compiled from plans.csv). This keeps the marketing site and checkout page
// working during Supabase blips.
//
// Cache is per-process (Next.js Node runtime). revalidatePlans() clears it —
// call from webhook handlers when plans mutate, or leave to TTL.

// Note: previously had `import "server-only"` but plans.ts is re-imported by
// client components (billing-client.tsx). Guarding runtime path instead:
// getSupabaseAdmin() returns null on the client and we fall back to
// GENERATED_PLANS (bundled from plans.csv at build time). Server-only
// SERVICE_ROLE_KEY never crosses the boundary because getSupabaseAdmin
// short-circuits without it.
import { getSupabaseAdmin } from "./supabase";
import { GENERATED_PLANS, GENERATED_PLANS_BY_ID, type GeneratedPlan } from "@/config/pricing/plans.generated";

export interface Plan {
  id: string;
  segment: string;
  name: string;
  price_aud_cents: number;
  annual_price_aud_cents: number;
  interval: "free" | "monthly" | "yearly" | "once" | "custom";
  trial_days: number;
  stripe_price_id: string | null;
  feature_flags: string[];
  usage_limits: Record<string, number>;
  active: boolean;
  sort_order: number;
}

const CACHE_TTL_MS = 60_000;
let cache: { at: number; plans: Plan[] } | null = null;

function fromGenerated(g: GeneratedPlan): Plan {
  const envVar = g.stripe_env_var;
  const stripe_price_id = envVar ? (process.env[envVar] ?? null) : null;
  return {
    id: g.id,
    segment: g.segment,
    name: g.name,
    price_aud_cents: g.price_aud_cents,
    annual_price_aud_cents: g.annual_price_aud_cents,
    interval: g.interval,
    trial_days: g.trial_days,
    stripe_price_id,
    feature_flags: [...g.feature_flags],
    usage_limits: { ...g.usage_limits },
    active: g.active,
    sort_order: g.sort_order,
  };
}

function normaliseArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  if (typeof v === "string") { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } }
  return [];
}
function normaliseLimits(v: unknown): Record<string, number> {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const out: Record<string, number> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof val === "number") out[k] = val;
      else if (typeof val === "string" && val !== "" && !Number.isNaN(Number(val))) out[k] = Number(val);
    }
    return out;
  }
  if (typeof v === "string") { try { return normaliseLimits(JSON.parse(v)); } catch { return {}; } }
  return {};
}
function normaliseInterval(v: unknown): Plan["interval"] {
  const s = String(v ?? "");
  return s === "monthly" || s === "yearly" || s === "once" || s === "custom" || s === "free" ? s : "monthly";
}

function fromRow(row: Record<string, unknown>): Plan {
  const id = String(row.id);
  const fallback = GENERATED_PLANS_BY_ID[id];
  const envVar = fallback?.stripe_env_var ?? "";
  const stripeFromRow = row.stripe_price_id;
  const stripe_price_id = typeof stripeFromRow === "string" && stripeFromRow.length > 0
    ? stripeFromRow
    : (envVar ? (process.env[envVar] ?? null) : null);
  return {
    id,
    segment: String(row.segment ?? fallback?.segment ?? ""),
    name: String(row.name ?? fallback?.name ?? id),
    price_aud_cents: typeof row.price_aud_cents === "number" ? row.price_aud_cents : (fallback?.price_aud_cents ?? 0),
    annual_price_aud_cents: typeof row.annual_price_aud_cents === "number" ? row.annual_price_aud_cents : (fallback?.annual_price_aud_cents ?? 0),
    interval: normaliseInterval(row.interval ?? fallback?.interval),
    trial_days: typeof row.trial_days === "number" ? row.trial_days : (fallback?.trial_days ?? 0),
    stripe_price_id,
    feature_flags: normaliseArray(row.feature_flags),
    usage_limits: normaliseLimits(row.usage_limits),
    active: row.active !== false,
    sort_order: typeof row.sort_order === "number" ? row.sort_order : (fallback?.sort_order ?? 100),
  };
}

export async function getPlansCached(): Promise<Plan[]> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.plans;

  const supabase = getSupabaseAdmin();
  let plans: Plan[] | null = null;

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("plans")
        .select("id,segment,name,price_aud_cents,annual_price_aud_cents,interval,trial_days,stripe_price_id,feature_flags,usage_limits,active,sort_order")
        .eq("active", true)
        .order("sort_order", { ascending: true });
      if (!error && Array.isArray(data) && data.length > 0) {
        plans = data.map(r => fromRow(r as Record<string, unknown>));
      }
    } catch (err) {
      console.warn("[plans-db] DB read failed, using generated fallback", err);
    }
  }

  if (!plans || plans.length === 0) {
    plans = GENERATED_PLANS.filter(p => p.active).map(fromGenerated);
    plans.sort((a, b) => a.sort_order - b.sort_order);
  }

  cache = { at: now, plans };
  return plans;
}

export async function getPlanCached(id: string): Promise<Plan | null> {
  const plans = await getPlansCached();
  const hit = plans.find(p => p.id === id);
  if (hit) return hit;
  const g = GENERATED_PLANS_BY_ID[id];
  return g ? fromGenerated(g) : null;
}

export function revalidatePlans(): void {
  cache = null;
}
