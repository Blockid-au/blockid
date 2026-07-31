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
import { normaliseResellerCode } from "@/lib/reseller/attribution";
import { resolvePromoCode } from "@/lib/reseller/resolve-promo";
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

  // Delegate to the canonical resolver rather than querying the promotion
  // table inline. Two reasons this matters:
  //   1. R-10 (typed-wrapper-audit): an inline read here would carry no
  //      visible reseller_id scoping, because an anonymous prospect has no
  //      reseller scope yet — resolving a globally-unique code IS the
  //      point. Routing through the shared helper keeps that single
  //      unscoped read in one audited place instead of duplicating it.
  //   2. The previous inline version selected a `slug` column from
  //      `resellers`, which does not exist (the table uses `code`).
  //      Postgres errored, the catch swallowed it, and EVERY validation
  //      silently returned "unknown" — that path never worked in prod.
  //
  // resolvePromoCode() already enforces active=true, normalises the code,
  // joins the reseller row, and memoises for 60s.
  try {
    const resolved = await resolvePromoCode(code);
    if (!resolved) {
      return NextResponse.json({ ok: false, reason: "unknown" });
    }

    return NextResponse.json({
      ok: true,
      code: resolved.code,
      discountPct: resolved.discountPct,
      resellerSlug: resolved.resellerSlug,
      resellerDisplayName: resolved.resellerDisplayName,
    });
  } catch (err) {
    console.error("[validate-promo-code] lookup failed", err);
    return NextResponse.json(
      { ok: false, reason: "unknown" },
      { status: 200 },
    );
  }
}
