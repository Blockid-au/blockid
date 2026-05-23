/**
 * Database key cache — fetches admin-configured AI provider keys from
 * the Supabase `ai_provider_keys` table with a 5-minute TTL cache.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { DBKey } from "./types.js";

const DB_KEYS_TTL = 5 * 60 * 1000; // 5 minutes

let supabase: SupabaseClient | null = null;
let cache: { keys: DBKey[]; fetchedAt: number } | null = null;

function getClient(): SupabaseClient | null {
  if (supabase) return supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  supabase = createClient(url, key);
  return supabase;
}

/** Fetch all active provider keys, using cache when fresh. */
export async function getDBKeys(): Promise<DBKey[]> {
  if (cache && Date.now() - cache.fetchedAt < DB_KEYS_TTL) {
    return cache.keys;
  }

  const client = getClient();
  if (!client) return cache?.keys ?? [];

  try {
    const { data } = await client
      .from("ai_provider_keys")
      .select("provider, api_key, base_url, is_active")
      .eq("is_active", true);

    const keys = (data ?? []) as DBKey[];
    cache = { keys, fetchedAt: Date.now() };
    return keys;
  } catch {
    return cache?.keys ?? [];
  }
}

/** Look up a single active key by provider name. */
export function getDBKey(provider: string): DBKey | undefined {
  return cache?.keys.find((k) => k.provider === provider && k.is_active);
}

/** Force-invalidate the cache (e.g. after admin updates keys). */
export function invalidateCache(): void {
  cache = null;
}
