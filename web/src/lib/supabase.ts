// Supabase admin client (server-only).
//
// We deliberately keep this module server-side: it uses the SERVICE_ROLE_KEY
// which bypasses RLS, and we never want it shipped to the browser. All callers
// live in Route Handlers / Server Components.
//
// Graceful degradation: if the env vars are missing the helper returns `null`
// and callers fall back to console-log + deterministic demo data so the dev
// experience works without secrets (Phase 1 marketing site behaviour).

import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null | undefined;

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

export function getSupabaseAdmin(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  if (!isSupabaseConfigured()) {
    cached = null;
    return null;
  }
  cached = createClient(
    process.env.SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema: "public" },
    },
  );
  return cached;
}
