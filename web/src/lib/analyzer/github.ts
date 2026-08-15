// GitHub signal collector for the Code/Website Analyzer.
//
// Uses REST v3 with optional bearer token from GITHUB_TOKEN env. All calls are
// wrapped in try/catch so a missing token or rate-limit degrades to `null`
// fields — scoring is signal-tolerant.

import "server-only";
import type { GithubSignals } from "./types";

const GITHUB_API = "https://api.github.com";
const FETCH_TIMEOUT_MS = 8000;

function parseOwnerRepo(rawUrl: string): { owner: string; repo: string } | null {
  try {
    const u = new URL(rawUrl);
    if (!/(^|\.)github\.com$/i.test(u.hostname)) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    return { owner: parts[0]!, repo: parts[1]!.replace(/\.git$/, "") };
  } catch {
    return null;
  }
}

function authHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN;
  const base: Record<string, string> = {
    "User-Agent": "blockid-analyzer/1.0",
    Accept: "application/vnd.github+json",
  };
  if (token) base.Authorization = `Bearer ${token}`;
  return base;
}

async function ghFetch(path: string): Promise<Response | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${GITHUB_API}${path}`, {
      headers: authHeaders(),
      signal: controller.signal,
    });
    return res;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function ghJson<T>(path: string): Promise<T | null> {
  const res = await ghFetch(path);
  if (!res || !res.ok) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

interface RepoResp {
  stargazers_count?: number;
  language?: string | null;
  license?: { spdx_id?: string | null } | null;
}

interface ContribResp {
  login?: string;
}

interface CommitResp {
  sha?: string;
}

interface DirEntry {
  name?: string;
  type?: string;
}

interface ReadmeResp {
  encoding?: string;
  content?: string;
}

async function detectTests(owner: string, repo: string): Promise<boolean> {
  const root = await ghJson<DirEntry[]>(`/repos/${owner}/${repo}/contents/`);
  if (!Array.isArray(root)) return false;
  const testDirs = new Set(["test", "tests", "spec", "specs", "__tests__", "e2e"]);
  return root.some((e) => e.name && testDirs.has(e.name.toLowerCase()));
}

async function detectCI(owner: string, repo: string): Promise<boolean> {
  const wf = await ghJson<DirEntry[]>(`/repos/${owner}/${repo}/contents/.github/workflows`);
  return Array.isArray(wf) && wf.length > 0;
}

function readmeScore(readme: ReadmeResp | null): number {
  if (!readme?.content) return 0;
  try {
    const buf = Buffer.from(readme.content, (readme.encoding as BufferEncoding) || "base64");
    const len = buf.length;
    return Math.min(100, Math.round((len / 2000) * 100));
  } catch {
    return 0;
  }
}

export async function analyseGithub(rawUrl: string): Promise<GithubSignals | null> {
  const parsed = parseOwnerRepo(rawUrl);
  if (!parsed) return null;
  const { owner, repo } = parsed;

  // Verify repo exists first — if not, bail early
  const repoData = await ghJson<RepoResp>(`/repos/${owner}/${repo}`);
  if (!repoData) return null;

  const sinceIso = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const [contribs, commits, tests, ci, readme] = await Promise.all([
    ghJson<ContribResp[]>(`/repos/${owner}/${repo}/contributors?per_page=100&anon=1`),
    ghJson<CommitResp[]>(
      `/repos/${owner}/${repo}/commits?since=${encodeURIComponent(sinceIso)}&per_page=100`,
    ),
    detectTests(owner, repo),
    detectCI(owner, repo),
    ghJson<ReadmeResp>(`/repos/${owner}/${repo}/readme`),
  ]);

  return {
    commitsPerMonth: Array.isArray(commits) ? Math.round(commits.length / 3) : null,
    contributors: Array.isArray(contribs) ? contribs.length : null,
    stars: typeof repoData.stargazers_count === "number" ? repoData.stargazers_count : null,
    primaryLanguage: repoData.language ?? null,
    hasTests: tests,
    hasCI: ci,
    license: repoData.license?.spdx_id ?? null,
    readmeCompleteness: readmeScore(readme),
  };
}
