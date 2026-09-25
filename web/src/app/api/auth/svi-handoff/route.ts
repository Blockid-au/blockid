// GET /api/auth/svi-handoff?return=<startupvalueindex.com URL>
//
// Startup Value Index (startupvalueindex.com, port 4002) is a different site,
// and the blockid.au session cookie is SameSite=Lax — a browser never sends it
// there, so SVI cannot tell a signed-in founder from a visitor. This route is
// the bridge: an authenticated founder is redirected back to SVI with a
// 5-minute, single-purpose HMAC token that SVI (`/api/auth/session`) swaps
// for its own cookie. Anonymous visitors are sent through /auth/login first
// and come back here via `next`.
//
// Token = base64url(JSON{uid, exp, n}) + "." + base64url(HMAC-SHA256(secret, payload)).
// Secret: SVI_HANDOFF_SECRET, shared with the SVI service. Nothing but the
// user id crosses; the return URL is pinned to the SVI origin so the token
// can never be bounced to a third party.
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { claimForCurrentBrowser } from "@/lib/analyses/claim";
import { mintHandoffToken, safeReturnUrl } from "@/lib/security/svi-handoff";

const PUBLIC_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://blockid.au";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.SVI_HANDOFF_SECRET?.trim();
  const target = safeReturnUrl(request.nextUrl.searchParams.get("return"));
  if (!secret || !target) {
    return NextResponse.json({ ok: false, error: secret ? "bad_return_url" : "handoff_not_configured" }, { status: 400 });
  }

  const user = await getCurrentUser();
  if (!user) {
    // Behind nginx `request.nextUrl.origin` is http://0.0.0.0:4001 — build
    // the login URL on the public origin.
    const self = `/api/auth/svi-handoff?return=${encodeURIComponent(target.toString())}`;
    return NextResponse.redirect(new URL(`/auth/login?next=${encodeURIComponent(self)}`, PUBLIC_ORIGIN), 302);
  }

  // G34 DC04: a founder who ran /analyze as a guest and then crossed to SVI
  // keeps those runs — same claim as every sign-in path (cookie + paid guest
  // reports; the session says nothing about e-mail verification). Fail-soft.
  await claimForCurrentBrowser({ userId: user.id, email: user.email });

  target.searchParams.set("svi_token", mintHandoffToken(user.id, secret));
  return NextResponse.redirect(target, 302);
}
