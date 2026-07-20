// Server-side helpers for the pricing / segment A/B harness (T0206).
//
// Design notes:
//   * `assignVariant` uses a stable FNV-1a hash of the bucketKey so a given
//     session (or logged-in user id) always sees the same variant across
//     pageloads — otherwise every render would resample and the experiment
//     would measure noise instead of the intervention.
//   * We deliberately store impressions/conversions as raw rows and only
//     aggregate at read time; that lets us slice later (segment / plan /
//     jurisdiction) without a schema change.
//   * `recordEvent` swallows write failures on purpose — it's called from
//     the hot path of public pages and must never take the render down.
//   * Supabase is loaded lazily (dynamic import). The pure `assignVariant`
//     path stays test-friendly under vitest, which cannot resolve the
//     `server-only` sentinel that `./supabase` imports at module load.

import type { SupabaseClient } from "@supabase/supabase-js";

async function loadSupabase(): Promise<SupabaseClient | null> {
  const mod = await import("./supabase");
  return mod.getSupabaseAdmin();
}

export type ExperimentStatus = "draft" | "running" | "paused" | "concluded";

export interface PricingExperimentVariant {
  key: string;
  label: string;
  payload: Record<string, unknown>;
}

export interface PricingExperiment {
  id: string;
  name: string;
  hypothesis: string;
  status: ExperimentStatus;
  variants: PricingExperimentVariant[];
  trafficSplit: Record<string, number>;
  createdAt: string;
  updatedAt: string;
}

export interface VariantSummary {
  variantKey: string;
  impressions: number;
  conversions: number;
  conversionRate: number;
  totalValueAud: number;
}

interface DbExperimentRow {
  id: string;
  name: string;
  hypothesis: string | null;
  status: ExperimentStatus;
  variants: unknown;
  traffic_split: unknown;
  created_at: string;
  updated_at: string;
}

interface DbEventRow {
  variant_key: string;
  event_type: "impression" | "conversion";
  value_aud: number | null;
}

function coerceVariants(raw: unknown): PricingExperimentVariant[] {
  if (!Array.isArray(raw)) return [];
  const out: PricingExperimentVariant[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const key = typeof rec.key === "string" ? rec.key : null;
    const label = typeof rec.label === "string" ? rec.label : key;
    if (!key || !label) continue;
    const payload =
      rec.payload && typeof rec.payload === "object" && !Array.isArray(rec.payload)
        ? (rec.payload as Record<string, unknown>)
        : {};
    out.push({ key, label, payload });
  }
  return out;
}

function coerceSplit(raw: unknown, variants: PricingExperimentVariant[]): Record<string, number> {
  const out: Record<string, number> = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(n) && n >= 0) out[k] = n;
    }
  }
  // Fall back to an even split so a caller that forgets `trafficSplit`
  // still gets deterministic behaviour instead of picking variant[0] always.
  if (Object.keys(out).length === 0 && variants.length > 0) {
    const w = 1 / variants.length;
    for (const v of variants) out[v.key] = w;
  }
  return out;
}

function rowToExperiment(row: DbExperimentRow): PricingExperiment {
  const variants = coerceVariants(row.variants);
  return {
    id: row.id,
    name: row.name,
    hypothesis: row.hypothesis ?? "",
    status: row.status,
    variants,
    trafficSplit: coerceSplit(row.traffic_split, variants),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listExperiments(): Promise<PricingExperiment[]> {
  const supabase = await loadSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("pricing_experiments")
    .select("id, name, hypothesis, status, variants, traffic_split, created_at, updated_at")
    .order("updated_at", { ascending: false });
  if (error || !data) return [];
  return (data as DbExperimentRow[]).map(rowToExperiment);
}

export async function getExperimentByName(name: string): Promise<PricingExperiment | null> {
  const supabase = await loadSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("pricing_experiments")
    .select("id, name, hypothesis, status, variants, traffic_split, created_at, updated_at")
    .eq("name", name)
    .maybeSingle();
  if (error || !data) return null;
  return rowToExperiment(data as DbExperimentRow);
}

// FNV-1a 32-bit — small, dependency-free, and produces a well-spread hash
// so the weighted pick below doesn't cluster on any input pattern.
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash >>> 0;
}

export function assignVariant(
  experiment: PricingExperiment,
  bucketKey: string,
): { variantKey: string; payload: Record<string, unknown> } {
  const variants = experiment.variants;
  if (variants.length === 0) {
    return { variantKey: "control", payload: {} };
  }
  const weights = variants.map((v) => Math.max(0, experiment.trafficSplit[v.key] ?? 0));
  const total = weights.reduce((s, w) => s + w, 0);
  // Guard: if every configured weight is zero, treat the split as uniform so
  // an operator misconfig still routes traffic instead of stalling on v[0].
  const effective = total > 0 ? weights : variants.map(() => 1);
  const effectiveTotal = total > 0 ? total : variants.length;

  // Map the 32-bit hash to [0, effectiveTotal). Using modulo would bias the
  // low buckets when effectiveTotal doesn't divide 2^32 cleanly; a float
  // ratio keeps the weight approximation honest.
  const point = (fnv1a(`${experiment.name}:${bucketKey}`) / 0x100000000) * effectiveTotal;
  let cursor = 0;
  for (let i = 0; i < variants.length; i++) {
    cursor += effective[i];
    if (point < cursor) {
      return { variantKey: variants[i].key, payload: variants[i].payload };
    }
  }
  const last = variants[variants.length - 1];
  return { variantKey: last.key, payload: last.payload };
}

export async function recordEvent(
  experimentId: string,
  variantKey: string,
  type: "impression" | "conversion",
  ctx: { sessionId: string; userId?: string; valueAud?: number },
): Promise<void> {
  const supabase = await loadSupabase();
  if (!supabase) return;
  try {
    await supabase.from("pricing_experiment_events").insert({
      experiment_id: experimentId,
      variant_key: variantKey,
      event_type: type,
      session_id: ctx.sessionId,
      user_id: ctx.userId ?? null,
      value_aud: typeof ctx.valueAud === "number" ? ctx.valueAud : null,
    });
  } catch {
    // Public-page hot path — never propagate write failures upstream.
  }
}

export async function summarise(experimentId: string): Promise<VariantSummary[]> {
  const supabase = await loadSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("pricing_experiment_events")
    .select("variant_key, event_type, value_aud")
    .eq("experiment_id", experimentId);
  if (error || !data) return [];

  const buckets = new Map<string, VariantSummary>();
  for (const row of data as DbEventRow[]) {
    const b = buckets.get(row.variant_key) ?? {
      variantKey: row.variant_key,
      impressions: 0,
      conversions: 0,
      conversionRate: 0,
      totalValueAud: 0,
    };
    if (row.event_type === "impression") b.impressions += 1;
    else {
      b.conversions += 1;
      if (typeof row.value_aud === "number") b.totalValueAud += row.value_aud;
    }
    buckets.set(row.variant_key, b);
  }
  for (const b of buckets.values()) {
    b.conversionRate = b.impressions > 0 ? b.conversions / b.impressions : 0;
  }
  return Array.from(buckets.values()).sort((a, b) => a.variantKey.localeCompare(b.variantKey));
}
