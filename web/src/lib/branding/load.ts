// Server-side loader for the per-user PDF brand_settings row.
//
// This helper is the single entry point the SVI report renderer (and any
// future PDF pipeline) uses to obtain a founder's saved brand palette + logo
// + footer copy. It returns `null` in three deliberately conflated cases:
//   1. The plan does not grant `pdf_branding` (feature-gate closed).
//   2. Supabase is not configured (dev / test env).
//   3. No brand_settings row exists for the user (they never customised).
//
// Returning `null` in all three cases means the renderer falls back to the
// BlockID default palette without ever leaking whether the row exists.
// Never log the returned logo_url — Supabase storage URLs can act as
// bearer tokens for the object and should be treated as PII.
//
// Companion of web/src/lib/branding/gate.ts (pure plan-code gate).

import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import { canUsePdfBranding } from "./gate";

export interface BrandSettings {
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  reportHeader: string;
  footerText: string;
}

/**
 * Load the persisted brand_settings row for a user, but only when their plan
 * grants the pdf_branding feature. Callers can pass the loaded row straight
 * into the PDF renderer's `branding` prop; a `null` return means "use the
 * BlockID defaults".
 */
export async function loadBrandSettings(
  userId: string,
  planCode: string | null | undefined,
): Promise<BrandSettings | null> {
  if (!userId) return null;
  if (!canUsePdfBranding(planCode)) return null;

  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  try {
    const { data } = await supabase
      .from("brand_settings")
      .select("logo_url, primary_color, accent_color, report_header, footer_text")
      .eq("user_id", userId)
      .maybeSingle();

    if (!data) return null;

    return {
      logoUrl: (data.logo_url as string | null) ?? null,
      primaryColor: (data.primary_color as string | null) ?? "#2563eb",
      accentColor: (data.accent_color as string | null) ?? "#f59e0b",
      reportHeader: (data.report_header as string | null) ?? "",
      footerText: (data.footer_text as string | null) ?? "",
    };
  } catch {
    // Never fail the report on branding lookup; fall back to defaults silently.
    return null;
  }
}
