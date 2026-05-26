// Legacy GitHub OAuth callback — redirects to the evidence connector flow.
//
// The primary GitHub evidence connector now lives at /api/oauth/github/callback.
// This route exists for backwards compatibility: if anyone has the old callback
// URL registered in their GitHub OAuth App settings, it will still work by
// forwarding to the new handler.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  // Forward the code + state to the new OAuth evidence callback
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://blockid.au";
  const params = new URLSearchParams();
  if (code) params.set("code", code);
  if (state) params.set("state", state);

  return NextResponse.redirect(`${siteUrl}/api/oauth/github/callback?${params.toString()}`);
}
