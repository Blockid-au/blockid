import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code || !state) {
    return NextResponse.redirect(new URL("/workspace/evidence?error=github_failed", request.url));
  }

  try {
    // Exchange code for token
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error("No access token");

    // Get user info
    const userRes = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const ghUser = await userRes.json();

    // Get repos (top 5 by stars)
    const reposRes = await fetch("https://api.github.com/user/repos?sort=updated&per_page=10&type=owner", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const repos = await reposRes.json();

    // Parse state for user email
    const stateData = JSON.parse(Buffer.from(state, "base64url").toString());
    const email = stateData.email;

    // Save to Supabase
    const supabase = getSupabaseAdmin();
    if (supabase && email) {
      const topRepos = (repos || []).slice(0, 5).map((r: any) => ({
        name: r.full_name,
        url: r.html_url,
        language: r.language,
        stars: r.stargazers_count,
        updated: r.updated_at,
        description: r.description,
      }));

      await supabase.from("svi_evidence").upsert({
        email,
        evidence_type: "github",
        source: "oauth",
        title: `GitHub: ${ghUser.login}`,
        content: JSON.stringify({
          username: ghUser.login,
          profile_url: ghUser.html_url,
          public_repos: ghUser.public_repos,
          followers: ghUser.followers,
          repos: topRepos,
        }),
        confidence: "connected_source",
        dimension: "ptd",
        svi_impact: Math.min(12, Math.max(5, topRepos.length * 2)),
      }, { onConflict: "email,evidence_type" });
    }

    return NextResponse.redirect(new URL("/workspace/evidence?connected=github", request.url));
  } catch (err) {
    console.error("[github-oauth]", err);
    return NextResponse.redirect(new URL("/workspace/evidence?error=github_failed", request.url));
  }
}
