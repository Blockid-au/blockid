import "server-only";

export interface GithubSignals {
  recentCommits30d: number;
  publicRepos: number;
  topLanguage: string | null;
  primaryRepoName: string | null;
  primaryRepoStars: number;
}

interface GhUser {
  login: string;
  public_repos?: number;
}

interface GhRepo {
  name: string;
  full_name: string;
  language: string | null;
  stargazers_count: number;
  pushed_at: string;
  fork: boolean;
  private: boolean;
  updated_at: string;
}

interface ParticipationResp {
  all?: number[];
  owner?: number[];
}

const GH_HEADERS = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "blockid-au-evidence-connector",
});

async function fetchJson<T>(url: string, token: string): Promise<T | null> {
  const res = await fetch(url, { headers: GH_HEADERS(token), cache: "no-store" });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export async function fetchGithubSignals(
  accessToken: string,
): Promise<GithubSignals> {
  const user = await fetchJson<GhUser>("https://api.github.com/user", accessToken);
  const repos =
    (await fetchJson<GhRepo[]>(
      "https://api.github.com/user/repos?per_page=100&sort=updated",
      accessToken,
    )) ?? [];

  const ownedRepos = repos.filter((r) => !r.fork);

  const topLanguage = pickTopLanguage(ownedRepos);
  const primary =
    ownedRepos
      .slice()
      .sort((a, b) => b.stargazers_count - a.stargazers_count)[0] ?? null;

  let recentCommits30d = 0;
  if (primary) {
    const [owner, repo] = primary.full_name.split("/");
    const participation = await fetchJson<ParticipationResp>(
      `https://api.github.com/repos/${owner}/${repo}/stats/participation`,
      accessToken,
    );
    const weeks = participation?.owner ?? participation?.all ?? [];
    const last4 = weeks.slice(-4);
    recentCommits30d = last4.reduce((a, b) => a + b, 0);
  }

  return {
    recentCommits30d,
    publicRepos: user?.public_repos ?? ownedRepos.filter((r) => !r.private).length,
    topLanguage,
    primaryRepoName: primary?.full_name ?? null,
    primaryRepoStars: primary?.stargazers_count ?? 0,
  };
}

function pickTopLanguage(repos: GhRepo[]): string | null {
  const counts = new Map<string, number>();
  for (const r of repos) {
    if (!r.language) continue;
    counts.set(r.language, (counts.get(r.language) ?? 0) + 1);
  }
  let top: string | null = null;
  let max = 0;
  for (const [lang, n] of counts) {
    if (n > max) {
      max = n;
      top = lang;
    }
  }
  return top;
}
