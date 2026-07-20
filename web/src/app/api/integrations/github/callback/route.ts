import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getProjectIdFromRequest } from "@/lib/projects";
import { saveConnection, writeSignals, markSynced } from "@/lib/oauth-connectors";
import { fetchGithubSignals } from "@/lib/oauth-github-signals";

export const dynamic = "force-dynamic";

function baseUrl(): string {
  return (
    process.env.OAUTH_REDIRECT_BASE_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "https://blockid.au"
  ).replace(/\/$/, "");
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  expires_in?: number;
}

interface GhUser {
  login?: string;
  id?: number;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(`${baseUrl()}/auth/login`);
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const store = await cookies();
  const expected = store.get("blockid_gh_state")?.value;
  store.delete("blockid_gh_state");

  if (!code || !state || !expected || state !== expected) {
    return NextResponse.redirect(
      `${baseUrl()}/workspace/integrations?error=github_state_mismatch`,
    );
  }

  const clientId =
    process.env.GITHUB_OAUTH_CLIENT_ID ?? process.env.GITHUB_CLIENT_ID;
  const clientSecret =
    process.env.GITHUB_OAUTH_CLIENT_SECRET ?? process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      `${baseUrl()}/workspace/integrations?error=github_not_configured`,
    );
  }

  try {
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: `${baseUrl()}/api/integrations/github/callback`,
      }),
    });
    const tokenJson = (await tokenRes.json()) as TokenResponse;
    if (!tokenJson.access_token) {
      throw new Error("no_access_token");
    }

    const meRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${tokenJson.access_token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "blockid-au-evidence-connector",
      },
      cache: "no-store",
    });
    const me = (await meRes.json()) as GhUser;

    const projectId = await getProjectIdFromRequest();

    const conn = await saveConnection({
      userId: user.id,
      projectId,
      provider: "github",
      providerAccountId: me.login ?? String(me.id ?? ""),
      accessToken: tokenJson.access_token,
      refreshToken: tokenJson.refresh_token ?? null,
      scopes: (tokenJson.scope ?? "").split(",").filter(Boolean),
      metadata: { login: me.login },
    });

    try {
      const signals = await fetchGithubSignals(tokenJson.access_token);
      await writeSignals(user.id, projectId, "github", [
        { key: "recent_commits_30d", numeric: signals.recentCommits30d },
        { key: "public_repos", numeric: signals.publicRepos },
        { key: "top_language", text: signals.topLanguage },
        { key: "primary_repo_name", text: signals.primaryRepoName },
        { key: "primary_repo_stars", numeric: signals.primaryRepoStars },
      ]);
      if (conn) await markSynced(conn.id);
    } catch (err) {
      if (conn) await markSynced(conn.id, (err as Error).message);
    }

    return NextResponse.redirect(
      `${baseUrl()}/workspace/evidence?connected=github`,
    );
  } catch (err) {
    console.error("[blockid:integrations:github:callback]", err);
    return NextResponse.redirect(
      `${baseUrl()}/workspace/integrations?error=github_exchange_failed`,
    );
  }
}
