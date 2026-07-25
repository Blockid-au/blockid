/**
 * POST /api/founder-profile/locale — persist user's language pref (T-1403.11).
 *
 * Called by the locale switcher after a signed-in user picks EN/VI.
 * Anonymous callers get a soft 204 — the cookie already covers them,
 * and we don't want unauth traffic amplifying auth cost.
 *
 * Body: `{ locale: "en" | "vi" }`
 * Response: `{ ok: true, preferred_locale }` on success.
 *
 * The value is written to `founder_profiles.preferred_locale` (see
 * migration 0117). Only the current user's row is touched.
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isLocale, LOCALES } from "@/lib/i18n/locales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 204 });

  let body: { locale?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const locale = body.locale;
  if (typeof locale !== "string" || !isLocale(locale)) {
    return NextResponse.json({ error: "invalid_locale", allowed: LOCALES }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "no_db" }, { status: 503 });

  const { error } = await supabase
    .from("founder_profiles")
    .update({ preferred_locale: locale })
    .eq("account_id", user.id);

  if (error) {
    // If no profile row exists yet, upsert one minimally so the
    // preference survives to first sign-in on the actual profile page.
    const { error: upsertErr } = await supabase
      .from("founder_profiles")
      .upsert(
        { account_id: user.id, email: user.email, preferred_locale: locale },
        { onConflict: "account_id" },
      );
    if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, preferred_locale: locale });
}
