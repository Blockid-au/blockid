/**
 * browser — Supabase client for the browser tab.
 *
 * Master Upgrade Plan §8.9 stage 2. Consumed by
 * `AuthSyncClient.tsx` (which subscribes to `onAuthStateChange`)
 * and by any future client-only integration.
 *
 * Returns `null` when the public envs are unset so the marketing
 * site keeps rendering during local dev without secrets.
 */

"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null | undefined;

export function getBrowserSupabase(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    cached = null;
    return null;
  }
  cached = createBrowserClient(url, key);
  return cached;
}
