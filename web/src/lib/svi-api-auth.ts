// SVI public data API authentication (server-only).
// Separate from the BlockID founder API keys — this is for institutional
// investors reading index data programmatically.
// Key format: svi_live_<48 hex chars>

import "server-only";
import { createHash, randomBytes } from "crypto";
import { getSupabaseAdmin } from "./supabase";

export function generateSviApiKey(): { raw: string; hash: string; prefix: string } {
  const raw = `svi_live_${randomBytes(24).toString("hex")}`;
  const hash = createHash("sha256").update(raw).digest("hex");
  const prefix = raw.slice(0, 16) + "...";
  return { raw, hash, prefix };
}

export function hashSviApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export const SVI_API_TIERS = {
  free: { dailyLimit: 10, priceAud: 0, label: "Free" },
  team: { dailyLimit: 1000, priceAud: 199, label: "Team" },
  institutional: { dailyLimit: 9_999_999, priceAud: 2000, label: "Institutional" },
} as const;

export type SviApiTier = keyof typeof SVI_API_TIERS;

export interface SviApiKeyRow {
  id: string;
  user_id: string;
  tier: SviApiTier;
  calls_today: number;
  calls_today_date: string;
  is_active: boolean;
}

export async function authenticateSviApiKey(
  req: Request,
): Promise<{ keyId: string; userId: string; tier: SviApiTier } | null> {
  const authHeader = req.headers.get("authorization") ?? "";
  const raw = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!raw.startsWith("svi_live_")) return null;

  const hash = hashSviApiKey(raw);
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data } = await supabase
    .from("svi_api_keys")
    .select("id, user_id, tier, calls_today, calls_today_date, is_active")
    .eq("key_hash", hash)
    .maybeSingle();

  if (!data || !data.is_active) return null;

  const row = data as SviApiKeyRow;
  const today = new Date().toISOString().slice(0, 10);
  const dailyCalls = row.calls_today_date === today ? row.calls_today : 0;
  const limit = SVI_API_TIERS[row.tier]?.dailyLimit ?? 10;

  if (dailyCalls >= limit) return null;

  // Increment counter (fire and forget)
  const newCount = dailyCalls + 1;
  supabase.from("svi_api_keys").update({
    calls_today: newCount,
    calls_today_date: today,
    last_used_at: new Date().toISOString(),
  }).eq("id", row.id).then(() => {});

  return { keyId: row.id, userId: row.user_id, tier: row.tier };
}

export async function createSviApiKey(
  userId: string,
  tier: SviApiTier = "free",
  name?: string,
): Promise<{ raw: string; id: string } | { error: string }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { error: "DB unavailable" };

  const { count } = await supabase
    .from("svi_api_keys")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_active", true);

  if ((count ?? 0) >= 5) return { error: "Maximum 5 active SVI API keys per account." };

  const { raw, hash, prefix } = generateSviApiKey();
  const { data, error } = await supabase
    .from("svi_api_keys")
    .insert({ user_id: userId, key_hash: hash, key_prefix: prefix, name: name?.trim() || "Default", tier })
    .select("id")
    .single();

  if (error) return { error: error.message };
  return { raw, id: (data as { id: string }).id };
}

export async function listSviApiKeys(userId: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data } = await supabase
    .from("svi_api_keys")
    .select("id, name, key_prefix, tier, calls_today, calls_today_date, is_active, created_at, last_used_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function revokeSviApiKey(userId: string, keyId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;
  const { error } = await supabase
    .from("svi_api_keys")
    .update({ is_active: false })
    .eq("id", keyId)
    .eq("user_id", userId);
  return !error;
}
