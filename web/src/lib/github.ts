import "server-only";

export interface RepoStats {
  owner: string;
  repo: string;
  url: string;
  stars: number;
  forks: number;
  openIssues: number;
  defaultBranch: string;
  pushedAt: string | null;
  commitsLast90: number;
  language: string | null;
}

const UA = "BlockID.au-evidence-bot";

export function parseRepoInput(input: string): { owner: string; repo: string } | null {
  if (!input) return null;
  const trimmed = input.trim();
  // github.com URLs
  const urlMatch = trimmed.match(
    /^https?:\/\/(?:www\.)?github\.com\/([^\s/]+)\/([^\s/?#]+)(?:[/?#].*)?$/i,
  );
  if (urlMatch) {
    return { owner: urlMatch[1], repo: urlMatch[2].replace(/\.git$/, "") };
  }
  // owner/repo shorthand
  const shortMatch = trimmed.match(/^([^\s/]+)\/([^\s/?#]+)$/);
  if (shortMatch) {
    return { owner: shortMatch[1], repo: shortMatch[2].replace(/\.git$/, "") };
  }
  return null;
}

async function gh(
  path: string,
  token?: string,
  init?: RequestInit,
): Promise<Response> {
  const headers: Record<string, string> = {
    "User-Agent": UA,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers ?? {}) },
    cache: "no-store",
  });
}

export async function fetchRepoStats(
  owner: string,
  repo: string,
  token?: string,
): Promise<RepoStats | null> {
  const repoRes = await gh(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, token);
  if (!repoRes.ok) return null;
  const repoJson = (await repoRes.json()) as {
    owner: { login: string };
    name: string;
    html_url: string;
    stargazers_count?: number;
    forks_count?: number;
    open_issues_count?: number;
    default_branch?: string;
    pushed_at?: string | null;
    language?: string | null;
  };

  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  let commitsLast90 = 0;
  try {
    const commitsRes = await gh(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?per_page=100&since=${encodeURIComponent(since)}`,
      token,
    );
    if (commitsRes.ok) {
      const commits = (await commitsRes.json()) as unknown[];
      commitsLast90 = Array.isArray(commits) ? commits.length : 0;
    }
  } catch {
    // ignore — commit count is best-effort
  }

  return {
    owner: repoJson.owner.login,
    repo: repoJson.name,
    url: repoJson.html_url,
    stars: repoJson.stargazers_count ?? 0,
    forks: repoJson.forks_count ?? 0,
    openIssues: repoJson.open_issues_count ?? 0,
    defaultBranch: repoJson.default_branch ?? "main",
    pushedAt: repoJson.pushed_at ?? null,
    commitsLast90,
    language: repoJson.language ?? null,
  };
}

export function isGitHubOAuthConfigured(): boolean {
  return Boolean(
    process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET,
  );
}

export function buildAuthorizeUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    scope: "read:user public_repo",
    state,
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export async function exchangeCodeForToken(
  code: string,
  redirectUri: string,
): Promise<string | null> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "User-Agent": UA,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token?: string };
  return data.access_token ?? null;
}

export async function fetchTopRepo(token: string): Promise<{ owner: string; repo: string } | null> {
  const res = await gh(
    "/user/repos?sort=pushed&direction=desc&per_page=1&visibility=public",
    token,
  );
  if (!res.ok) return null;
  const json = (await res.json()) as Array<{ owner: { login: string }; name: string }>;
  if (!Array.isArray(json) || json.length === 0) return null;
  return { owner: json[0].owner.login, repo: json[0].name };
}
