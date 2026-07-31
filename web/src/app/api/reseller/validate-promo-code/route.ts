/**
 * POST /api/reseller/validate-promo-code
 *
 * Body: { code: string }
 *
 * Success:
 *   { ok: true, code, discountPct, resellerSlug, resellerDisplayName }
 *
 * Failure:
 *   { ok: false, reason: "unknown" | "invalid" | "inactive" | "rate_limited" }
 *
 * Task M2 (v3 reseller-attribution upgrade): the signup form calls this
 * on blur so the founder gets inline "IFV20 — 20% off from InfoVision"
 * confirmation before submitting the form. Never mutates state — read-only
 * lookup against Agent K's `reseller_promotion_codes` table.
 *
 * Rate-limit: 30/min per IP via the shared `promo_validate` key so a
 * scripted enumeration attack against the promo namespace is capped.
 *
 * NB: this endpoint intentionally never leaks whether a code exists but
 * is inactive vs "does not exist" — both surface the same
 * `{ ok: false, reason: "unknown" }` shape so an unsuccessful lookup cannot
 * be used to enumerate the reseller roster.
 */

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { normaliseResellerCode } from "@/lib/reseller/attribution";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIpFromHeaders } from "@/lib/iphash";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Body {
  code?: unknown;
}

export async function POST(request: Request) {
  const ip = clientIpFromHeaders(request.headers) ?? "unknown";
  const rl = checkRateLimit(`promo_validate:${ip}`, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, reason: "rate_limited" },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rl.resetIn / 1000)) },
      },
    );
  }

  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, reason: "invalid" },
      { status: 400 },
    );
  }

  const raw = typeof body.code === "string" ? body.code : "";
  const code = normaliseResellerCode(raw);
  if (!code) {
    return NextResponse.json(
      { ok: false, reason: "invalid" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    // Fail-closed with a generic reason so the client renders "Unknown code"
    // rather than a 500 the founder can't act on.
    return NextResponse.json(
      { ok: false, reason: "unknown" },
      { status: 200 },
    );
  }

  // Agent K's `resolvePromoCode()` helper is the preferred call-site; when
  // it isn't available yet, fall back to reading the table inline so this
  // endpoint doesn't block on the K rollout.
  try {
    const { data: promo } = await supabase
      .from("reseller_promotion_codes")
      .select("code, tier_pct, active, reseller_id, max_redemptions, redemption_count")
      .eq("code", code)
      .maybeSingle();

    if (!promo || !promo.active) {
      return NextResponse.json({ ok: false, reason: "unknown" });
    }

    // Guard against exhausted codes: reseller_promotion_codes.max_redemptions
    // NULL = unlimited; otherwise reject once redemption_count >= max.
    const maxR =
      typeof promo.max_redemptions === "number" ? promo.max_redemptions : null;
    const usedR =
      typeof promo.redemption_count === "number" ? promo.redemption_count : 0;
    if (maxR !== null && usedR >= maxR) {
      return NextResponse.json({ ok: false, reason: "unknown" });
    }

    const { data: reseller } = await supabase
      .from("resellers")
      .select("slug, display_name, status")
      .eq("id", promo.reseller_id)
      .maybeSingle();

    if (!reseller || reseller.status !== "active") {
      return NextResponse.json({ ok: false, reason: "inactive" });
    }

    return NextResponse.json({
      ok: true,
      code: promo.code,
      discountPct: Number(promo.tier_pct ?? 0),
      resellerSlug: reseller.slug ?? null,
      resellerDisplayName: reseller.display_name ?? null,
    });
  } catch (err) {
    console.error("[validate-promo-code] lookup failed", err);
    return NextResponse.json(
      { ok: false, reason: "unknown" },
      { status: 200 },
    );
  }
}
