import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// GET: Redirect to GitHub OAuth
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "GitHub OAuth not configured" }, { status: 503 });
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL}/api/auth/github/callback`;
  const state = Buffer.from(JSON.stringify({ email: user.email })).toString("base64url");
  const scope = "read:user,repo";

  const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&state=${state}`;

  return NextResponse.redirect(url);
}
