// Legacy GitHub OAuth entry point — redirects to the evidence connector flow.
//
// The primary GitHub evidence connector now lives at /api/oauth/github.
// This route exists for backwards compatibility.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Forward to the evidence connector OAuth route
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://blockid.au";
  return NextResponse.redirect(`${siteUrl}/api/oauth/github`);
}
