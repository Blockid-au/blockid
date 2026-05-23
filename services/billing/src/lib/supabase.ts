// Supabase admin client for the billing microservice.
//
// Uses the service-role key so it can bypass RLS and perform
// server-side mutations on credit_balances, credit_transactions, etc.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error("[billing:supabase] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set");
    return null;
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return cached;
}
