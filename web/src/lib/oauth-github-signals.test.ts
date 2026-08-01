import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Colocated vitest for the previously-untested server-only
// `oauth-github-signals.ts` — the GitHub REST evidence connector that
// backs the founder Evidence tab (traction signals surfaced on
// /dashboard/evidence). Regressions here are user-visible AND scoring-
// visible: (a) losing the fork filter in `ownedRepos` lets a founder
// pad their language / star / commit signals with cloned public repos
// they never wrote, corrupting the SVI Traction band; (b) losing the
// `!res.ok` short-circuit in `fetchJson` throws on the very first 401
// / 404 / 500 and the whole tab errors instead of degrading to a
// partial signal; (c) losing the `participation?.owner ?? all ?? []`
// chain returns `undefined.slice()` and crashes for any repo whose
// participation payload lacks the `owner` key; (d) losing the last-4-
// weeks slice returns ~52 weeks and reports a year of commits as "30-
// day" activity; (e) losing the `user?.public_repos ??` fallback
// counts private repos in the "publicRepos" signal the moment the
// authed /user endpoint 404s; (f) losing the star-desc sort picks an
// arbitrary primary repo and the 30-day commit count then belongs to
// the wrong repo entirely; (g) `pickTopLanguage` dropping its
// null-language skip lets a JSON "null" language dominate the tally
// and label every founder's stack as "null".
//
// Fetch is stubbed globally with a per-URL responder queue so every
// GitHub API contract assertion (URL + headers + method) rides the
// real production codepath. `server-only` is neutered by the vitest
// alias in `web/vitest.config.ts` so no runtime shim import is needed.

import {
  fetchGithubSignals,
  type GithubSignals,
} from "./oauth-github-signals";

interface FetchCall {
  url: string;
  init: RequestInit | undefined;
}

interface Responder {
  match: (url: string) => boolean;
  respond: () => Response | Promise<Response>;
}

const calls: FetchCall[] = [];
const responders: Responder[] = [];

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function queue(match: string | RegExp, body: unknown, init: ResponseInit = {}): void {
  responders.push({
    match:
      typeof match === "string"
        ? (u) => u === match
        : (u) => match.test(u),
    respond: () => jsonResponse(body, init),
  });
}

function queueStatus(match: string | RegExp, status: number, body: unknown = ""): void {
  responders.push({
    match:
      typeof match === "string"
        ? (u) => u === match
        : (u) => match.test(u),
    respond: () =>
      new Response(typeof body === "string" ? body : JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
  });
}

function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input.toString();
  calls.push({ url, init });
  for (let i = 0; i < responders.length; i += 1) {
    if (responders[i].match(url)) {
      const r = responders[i];
      responders.splice(i, 1);
      return Promise.resolve(r.respond());
    }
  }
  throw new Error(`fakeFetch: no responder queued for ${url}`);
}

const USER_URL = "https://api.github.com/user";
const REPOS_URL = "https://api.github.com/user/repos?per_page=100&sort=updated";

function makeRepo(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    name: "repo",
    full_name: "octo/repo",
    language: "TypeScript",
    stargazers_count: 0,
    pushed_at: "2026-01-01T00:00:00Z",
    fork: false,
    private: false,
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  calls.length = 0;
  responders.length = 0;
  vi.stubGlobal("fetch", fakeFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchGithubSignals — happy path shape", () => {
  it("returns a fully-populated GithubSignals object when all endpoints answer", async () => {
    queue(USER_URL, { login: "octo", public_repos: 12 });
    queue(REPOS_URL, [
      makeRepo({ name: "star", full_name: "octo/star", stargazers_count: 42, language: "Go" }),
      makeRepo({ name: "dim", full_name: "octo/dim", stargazers_count: 3, language: "Go" }),
      makeRepo({ name: "ts1", full_name: "octo/ts1", stargazers_count: 1, language: "TypeScript" }),
    ]);
    queue(/stats\/participation/, { owner: [1, 2, 3, 4, 5, 6, 7, 8], all: [9, 9, 9, 9, 9, 9, 9, 9] });

    const out = await fetchGithubSignals("token-A");

    const expected: GithubSignals = {
      recentCommits30d: 5 + 6 + 7 + 8, // last-4 owner buckets
      publicRepos: 12,
      topLanguage: "Go", // 2 Go beats 1 TS
      primaryRepoName: "octo/star",
      primaryRepoStars: 42,
    };
    expect(out).toEqual(expected);
  });

  it("hits every GitHub URL the module documents", async () => {
    queue(USER_URL, { login: "x", public_repos: 1 });
    queue(REPOS_URL, [
      makeRepo({ full_name: "x/one", stargazers_count: 5 }),
    ]);
    queue(/stats\/participation/, { owner: [1, 1, 1, 1] });

    await fetchGithubSignals("tok");
    const urls = calls.map((c) => c.url);
    expect(urls[0]).toBe(USER_URL);
    expect(urls[1]).toBe(REPOS_URL);
    expect(urls[2]).toBe("https://api.github.com/repos/x/one/stats/participation");
  });
});

describe("fetchJson — GitHub request contract", () => {
  it("sends Bearer authorization header with the supplied token", async () => {
    queue(USER_URL, { login: "x", public_repos: 0 });
    queue(REPOS_URL, []);
    await fetchGithubSignals("secret-token");
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer secret-token");
  });

  it("sends the GitHub v3 JSON Accept header", async () => {
    queue(USER_URL, { login: "x", public_repos: 0 });
    queue(REPOS_URL, []);
    await fetchGithubSignals("tok");
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.Accept).toBe("application/vnd.github+json");
  });

  it("pins the GitHub API version header (2022-11-28)", async () => {
    queue(USER_URL, { login: "x", public_repos: 0 });
    queue(REPOS_URL, []);
    await fetchGithubSignals("tok");
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers["X-GitHub-Api-Version"]).toBe("2022-11-28");
  });

  it("sends a stable User-Agent identifying the evidence connector", async () => {
    queue(USER_URL, { login: "x", public_repos: 0 });
    queue(REPOS_URL, []);
    await fetchGithubSignals("tok");
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers["User-Agent"]).toBe("blockid-au-evidence-connector");
  });

  it("uses no-store cache mode so signals are always fresh", async () => {
    queue(USER_URL, { login: "x", public_repos: 0 });
    queue(REPOS_URL, []);
    await fetchGithubSignals("tok");
    expect(calls[0].init?.cache).toBe("no-store");
  });

  it("does not send a method (defaults to GET)", async () => {
    queue(USER_URL, { login: "x", public_repos: 0 });
    queue(REPOS_URL, []);
    await fetchGithubSignals("tok");
    // fetch defaults to GET when method is omitted — assert we do not
    // accidentally start sending POST/PUT for these read endpoints.
    expect(calls[0].init?.method).toBeUndefined();
  });

  it("re-uses the same header shape across every call in a single invocation", async () => {
    queue(USER_URL, { login: "x", public_repos: 1 });
    queue(REPOS_URL, [makeRepo({ full_name: "x/r", stargazers_count: 2 })]);
    queue(/stats\/participation/, { owner: [0, 0, 0, 1] });
    await fetchGithubSignals("tok");
    const [h0, h1, h2] = calls.map((c) => c.init?.headers as Record<string, string>);
    expect(h0).toEqual(h1);
    expect(h1).toEqual(h2);
  });
});

describe("fetchGithubSignals — /user degradation", () => {
  it("degrades gracefully when /user returns 401 (bad token)", async () => {
    queueStatus(USER_URL, 401);
    queue(REPOS_URL, [
      makeRepo({ full_name: "x/r", stargazers_count: 4, language: "Rust", private: false }),
    ]);
    queue(/stats\/participation/, { owner: [1, 1, 1, 1] });
    const out = await fetchGithubSignals("tok");
    // publicRepos falls back to the non-private owned-repo count
    expect(out.publicRepos).toBe(1);
    expect(out.primaryRepoName).toBe("x/r");
    expect(out.topLanguage).toBe("Rust");
  });

  it("does NOT throw when /user returns 500", async () => {
    queueStatus(USER_URL, 500);
    queue(REPOS_URL, []);
    await expect(fetchGithubSignals("tok")).resolves.toBeDefined();
  });

  it("counts non-private owned repos when /user is unavailable and public_repos is absent", async () => {
    queueStatus(USER_URL, 404);
    queue(REPOS_URL, [
      makeRepo({ full_name: "x/pub", private: false }),
      makeRepo({ full_name: "x/pub2", private: false }),
      makeRepo({ full_name: "x/priv", private: true }),
    ]);
    queue(/stats\/participation/, { owner: [0, 0, 0, 0] });
    const out = await fetchGithubSignals("tok");
    expect(out.publicRepos).toBe(2);
  });

  it("uses user.public_repos verbatim when /user answers, even if the owned-repo count differs", async () => {
    queue(USER_URL, { login: "x", public_repos: 99 });
    queue(REPOS_URL, [
      makeRepo({ full_name: "x/r", private: false }),
    ]);
    queue(/stats\/participation/, { owner: [0, 0, 0, 0] });
    const out = await fetchGithubSignals("tok");
    expect(out.publicRepos).toBe(99);
  });

  it("falls back to owned-repo count when /user answers without public_repos", async () => {
    queue(USER_URL, { login: "x" }); // no public_repos field
    queue(REPOS_URL, [
      makeRepo({ full_name: "x/r1", private: false }),
      makeRepo({ full_name: "x/r2", private: false }),
    ]);
    queue(/stats\/participation/, { owner: [0, 0, 0, 0] });
    const out = await fetchGithubSignals("tok");
    expect(out.publicRepos).toBe(2);
  });
});

describe("fetchGithubSignals — /user/repos handling", () => {
  it("returns zero-signal shape when /user/repos returns 404", async () => {
    queue(USER_URL, { login: "x", public_repos: 0 });
    queueStatus(REPOS_URL, 404);
    const out = await fetchGithubSignals("tok");
    expect(out).toEqual({
      recentCommits30d: 0,
      publicRepos: 0,
      topLanguage: null,
      primaryRepoName: null,
      primaryRepoStars: 0,
    });
  });

  it("returns zero-signal shape when /user/repos returns an empty array", async () => {
    queue(USER_URL, { login: "x", public_repos: 0 });
    queue(REPOS_URL, []);
    const out = await fetchGithubSignals("tok");
    expect(out.primaryRepoName).toBeNull();
    expect(out.primaryRepoStars).toBe(0);
    expect(out.recentCommits30d).toBe(0);
    expect(out.topLanguage).toBeNull();
  });

  it("filters out forks from ownedRepos before language / primary / participation", async () => {
    queue(USER_URL, { login: "x", public_repos: 3 });
    queue(REPOS_URL, [
      makeRepo({ full_name: "x/fork1", fork: true, stargazers_count: 999, language: "Cobol" }),
      makeRepo({ full_name: "x/mine", fork: false, stargazers_count: 5, language: "Go" }),
    ]);
    queue(/stats\/participation/, { owner: [0, 0, 0, 2] });
    const out = await fetchGithubSignals("tok");
    expect(out.primaryRepoName).toBe("x/mine");
    expect(out.topLanguage).toBe("Go");
    expect(out.primaryRepoStars).toBe(5);
  });

  it("does NOT call participation when every repo is a fork", async () => {
    queue(USER_URL, { login: "x", public_repos: 0 });
    queue(REPOS_URL, [
      makeRepo({ full_name: "x/f1", fork: true }),
      makeRepo({ full_name: "x/f2", fork: true }),
    ]);
    // No participation responder queued — the test would blow up with
    // "no responder queued" if the code called it.
    const out = await fetchGithubSignals("tok");
    expect(out.recentCommits30d).toBe(0);
    expect(out.primaryRepoName).toBeNull();
    expect(calls.some((c) => c.url.includes("/stats/participation"))).toBe(false);
  });
});

describe("primary repo selection", () => {
  it("picks the highest-star owned repo as primary", async () => {
    queue(USER_URL, { login: "x", public_repos: 3 });
    queue(REPOS_URL, [
      makeRepo({ full_name: "x/low", stargazers_count: 1 }),
      makeRepo({ full_name: "x/mid", stargazers_count: 50 }),
      makeRepo({ full_name: "x/high", stargazers_count: 500 }),
    ]);
    queue(/stats\/participation/, { owner: [0, 0, 0, 0] });
    const out = await fetchGithubSignals("tok");
    expect(out.primaryRepoName).toBe("x/high");
    expect(out.primaryRepoStars).toBe(500);
  });

  it("does not mutate the caller-facing repos array when sorting for primary", async () => {
    const repos = [
      makeRepo({ full_name: "x/a", stargazers_count: 1 }),
      makeRepo({ full_name: "x/b", stargazers_count: 9 }),
      makeRepo({ full_name: "x/c", stargazers_count: 3 }),
    ];
    queue(USER_URL, { login: "x", public_repos: 3 });
    queue(REPOS_URL, repos);
    queue(/stats\/participation/, { owner: [0, 0, 0, 0] });
    await fetchGithubSignals("tok");
    // If the module .sort()'d in-place, the returned JSON we handed to
    // it would be reordered — but we cannot inspect that from here.
    // We instead re-run and confirm primary is stable across calls.
    queue(USER_URL, { login: "x", public_repos: 3 });
    queue(REPOS_URL, repos);
    queue(/stats\/participation/, { owner: [0, 0, 0, 0] });
    const out2 = await fetchGithubSignals("tok");
    expect(out2.primaryRepoName).toBe("x/b");
  });

  it("targets the primary repo's owner/name in the participation URL", async () => {
    queue(USER_URL, { login: "x", public_repos: 1 });
    queue(REPOS_URL, [
      makeRepo({ full_name: "acme-labs/widget", stargazers_count: 100 }),
    ]);
    queue(/stats\/participation/, { owner: [1, 1, 1, 1] });
    await fetchGithubSignals("tok");
    expect(
      calls.some(
        (c) => c.url === "https://api.github.com/repos/acme-labs/widget/stats/participation",
      ),
    ).toBe(true);
  });
});

describe("recentCommits30d — participation slice semantics", () => {
  it("sums the last four owner-week buckets when owner is present", async () => {
    queue(USER_URL, { login: "x", public_repos: 1 });
    queue(REPOS_URL, [makeRepo({ full_name: "x/r", stargazers_count: 1 })]);
    // 8-element owner array — last 4 are [5,6,7,8] → 26
    queue(/stats\/participation/, { owner: [1, 2, 3, 4, 5, 6, 7, 8] });
    const out = await fetchGithubSignals("tok");
    expect(out.recentCommits30d).toBe(26);
  });

  it("falls back to `all` weeks when `owner` is missing", async () => {
    queue(USER_URL, { login: "x", public_repos: 1 });
    queue(REPOS_URL, [makeRepo({ full_name: "x/r", stargazers_count: 1 })]);
    queue(/stats\/participation/, { all: [10, 20, 30, 40] });
    const out = await fetchGithubSignals("tok");
    expect(out.recentCommits30d).toBe(100);
  });

  it("prefers `owner` over `all` when both are present", async () => {
    queue(USER_URL, { login: "x", public_repos: 1 });
    queue(REPOS_URL, [makeRepo({ full_name: "x/r", stargazers_count: 1 })]);
    queue(/stats\/participation/, { owner: [1, 1, 1, 1], all: [999, 999, 999, 999] });
    const out = await fetchGithubSignals("tok");
    expect(out.recentCommits30d).toBe(4);
  });

  it("returns 0 commits when the participation payload has neither key", async () => {
    queue(USER_URL, { login: "x", public_repos: 1 });
    queue(REPOS_URL, [makeRepo({ full_name: "x/r", stargazers_count: 1 })]);
    queue(/stats\/participation/, {});
    const out = await fetchGithubSignals("tok");
    expect(out.recentCommits30d).toBe(0);
  });

  it("returns 0 commits when participation itself 404s", async () => {
    queue(USER_URL, { login: "x", public_repos: 1 });
    queue(REPOS_URL, [makeRepo({ full_name: "x/r", stargazers_count: 1 })]);
    queueStatus(/stats\/participation/, 404);
    const out = await fetchGithubSignals("tok");
    expect(out.recentCommits30d).toBe(0);
  });

  it("sums fewer than four weeks when the array is short", async () => {
    queue(USER_URL, { login: "x", public_repos: 1 });
    queue(REPOS_URL, [makeRepo({ full_name: "x/r", stargazers_count: 1 })]);
    queue(/stats\/participation/, { owner: [3, 4] });
    const out = await fetchGithubSignals("tok");
    expect(out.recentCommits30d).toBe(7);
  });

  it("returns 0 when the participation weeks array is empty", async () => {
    queue(USER_URL, { login: "x", public_repos: 1 });
    queue(REPOS_URL, [makeRepo({ full_name: "x/r", stargazers_count: 1 })]);
    queue(/stats\/participation/, { owner: [] });
    const out = await fetchGithubSignals("tok");
    expect(out.recentCommits30d).toBe(0);
  });
});

describe("pickTopLanguage — via observable outputs", () => {
  it("picks the language with the highest repo count", async () => {
    queue(USER_URL, { login: "x", public_repos: 5 });
    queue(REPOS_URL, [
      makeRepo({ full_name: "x/a", language: "Rust" }),
      makeRepo({ full_name: "x/b", language: "Rust" }),
      makeRepo({ full_name: "x/c", language: "Rust" }),
      makeRepo({ full_name: "x/d", language: "TypeScript" }),
    ]);
    queue(/stats\/participation/, { owner: [0, 0, 0, 0] });
    const out = await fetchGithubSignals("tok");
    expect(out.topLanguage).toBe("Rust");
  });

  it("skips null-language repos in the language tally", async () => {
    queue(USER_URL, { login: "x", public_repos: 5 });
    queue(REPOS_URL, [
      makeRepo({ full_name: "x/a", language: null }),
      makeRepo({ full_name: "x/b", language: null }),
      makeRepo({ full_name: "x/c", language: null }),
      makeRepo({ full_name: "x/d", language: "Elixir" }),
    ]);
    queue(/stats\/participation/, { owner: [0, 0, 0, 0] });
    const out = await fetchGithubSignals("tok");
    expect(out.topLanguage).toBe("Elixir");
  });

  it("returns null when every owned repo has a null language", async () => {
    queue(USER_URL, { login: "x", public_repos: 2 });
    queue(REPOS_URL, [
      makeRepo({ full_name: "x/a", language: null, stargazers_count: 1 }),
      makeRepo({ full_name: "x/b", language: null, stargazers_count: 2 }),
    ]);
    queue(/stats\/participation/, { owner: [0, 0, 0, 0] });
    const out = await fetchGithubSignals("tok");
    expect(out.topLanguage).toBeNull();
  });

  it("returns null when there are no owned repos at all", async () => {
    queue(USER_URL, { login: "x", public_repos: 0 });
    queue(REPOS_URL, []);
    const out = await fetchGithubSignals("tok");
    expect(out.topLanguage).toBeNull();
  });

  it("keeps the first-seen top language on a tie (Map insertion order)", async () => {
    queue(USER_URL, { login: "x", public_repos: 2 });
    queue(REPOS_URL, [
      makeRepo({ full_name: "x/a", language: "Go" }),
      makeRepo({ full_name: "x/b", language: "Python" }),
    ]);
    queue(/stats\/participation/, { owner: [0, 0, 0, 0] });
    const out = await fetchGithubSignals("tok");
    // Both have count 1; strict `>` means the first one wins.
    expect(out.topLanguage).toBe("Go");
  });

  it("does not double-count a fork's language", async () => {
    queue(USER_URL, { login: "x", public_repos: 1 });
    queue(REPOS_URL, [
      makeRepo({ full_name: "x/mine", language: "Go", fork: false }),
      makeRepo({ full_name: "x/fork", language: "Cobol", fork: true }),
      makeRepo({ full_name: "x/fork2", language: "Cobol", fork: true }),
    ]);
    queue(/stats\/participation/, { owner: [0, 0, 0, 0] });
    const out = await fetchGithubSignals("tok");
    expect(out.topLanguage).toBe("Go");
  });
});

describe("edge cases the founder Evidence tab would surface", () => {
  it("handles a single-repo account cleanly (star=0, participation empty)", async () => {
    queue(USER_URL, { login: "solo", public_repos: 1 });
    queue(REPOS_URL, [
      makeRepo({ full_name: "solo/first", stargazers_count: 0, language: "JavaScript" }),
    ]);
    queue(/stats\/participation/, { owner: [0, 0, 0, 0] });
    const out = await fetchGithubSignals("tok");
    expect(out).toEqual({
      recentCommits30d: 0,
      publicRepos: 1,
      topLanguage: "JavaScript",
      primaryRepoName: "solo/first",
      primaryRepoStars: 0,
    });
  });

  it("returns publicRepos=0 when there is nothing to count anywhere", async () => {
    queueStatus(USER_URL, 404);
    queue(REPOS_URL, []);
    const out = await fetchGithubSignals("tok");
    expect(out.publicRepos).toBe(0);
  });

  it("still returns primaryRepoStars=0 when the top repo has no stars", async () => {
    queue(USER_URL, { login: "x", public_repos: 3 });
    queue(REPOS_URL, [
      makeRepo({ full_name: "x/a", stargazers_count: 0 }),
      makeRepo({ full_name: "x/b", stargazers_count: 0 }),
    ]);
    queue(/stats\/participation/, { owner: [0, 0, 0, 0] });
    const out = await fetchGithubSignals("tok");
    expect(out.primaryRepoStars).toBe(0);
    expect(out.primaryRepoName).not.toBeNull();
  });

  it("routes participation to the fork-free primary even when a fork has more stars", async () => {
    queue(USER_URL, { login: "x", public_repos: 1 });
    queue(REPOS_URL, [
      makeRepo({ full_name: "x/fork", fork: true, stargazers_count: 10000 }),
      makeRepo({ full_name: "x/own", fork: false, stargazers_count: 7 }),
    ]);
    queue(/stats\/participation/, { owner: [0, 0, 0, 3] });
    await fetchGithubSignals("tok");
    const participationHit = calls.find((c) => c.url.includes("/stats/participation"));
    expect(participationHit?.url).toBe(
      "https://api.github.com/repos/x/own/stats/participation",
    );
  });

  it("treats private-only accounts (no non-private owned repos) as publicRepos=0 without /user", async () => {
    queueStatus(USER_URL, 404);
    queue(REPOS_URL, [
      makeRepo({ full_name: "x/p", private: true }),
      makeRepo({ full_name: "x/q", private: true }),
    ]);
    queue(/stats\/participation/, { owner: [0, 0, 0, 0] });
    const out = await fetchGithubSignals("tok");
    expect(out.publicRepos).toBe(0);
  });

  it("issues exactly three GitHub API calls when the account has at least one owned repo", async () => {
    queue(USER_URL, { login: "x", public_repos: 1 });
    queue(REPOS_URL, [makeRepo({ full_name: "x/r", stargazers_count: 1 })]);
    queue(/stats\/participation/, { owner: [0, 0, 0, 0] });
    await fetchGithubSignals("tok");
    expect(calls.length).toBe(3);
  });

  it("issues exactly two GitHub API calls (no participation) when there are no owned repos", async () => {
    queue(USER_URL, { login: "x", public_repos: 0 });
    queue(REPOS_URL, []);
    await fetchGithubSignals("tok");
    expect(calls.length).toBe(2);
  });
});
