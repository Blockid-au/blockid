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
import { mintHandoffToken, safeReturnUrl } from "@/lib/security/svi-handoff";

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
    const self = `/api/auth/svi-handoff?return=${encodeURIComponent(target.toString())}`;
    return NextResponse.redirect(new URL(`/auth/login?next=${encodeURIComponent(self)}`, request.nextUrl.origin), 302);
  }

  target.searchParams.set("svi_token", mintHandoffToken(user.id, secret));
  return NextResponse.redirect(target, 302);
}
