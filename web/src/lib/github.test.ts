import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Colocated vitest for the server-only GitHub OAuth + REST helper module
// (`web/src/lib/github.ts`) — parses `owner/repo` inputs, calls the
// GitHub REST API for repo stats, and drives the read-only public OAuth
// dance used by the evidence-bot / CTO agent surfaces.
//
// Silent regressions here bite hard:
//   - dropping the trailing `.git` strip in `parseRepoInput` sends
//     `owner/repo.git` down the fetch path, which 404s and hides
//     otherwise-valid GitHub repos from the evidence report.
//   - `fetchRepoStats` MUST swallow the commits-endpoint failure — the
//     commit count is best-effort and the 502s from that endpoint are
//     common enough that a throw here would black-hole every evidence
//     capture.
//   - `isGitHubOAuthConfigured` gates the "Connect GitHub" CTA; if the
//     truthiness check regresses to just checking for one env var the
//     surface renders a broken link.
//   - `buildAuthorizeUrl` URL-encodes state — a missing encoder here
//     would let a state token with `&`, `#`, or a space in it silently
//     land at GitHub as a truncated / mangled value and fail the
//     CSRF equality check on callback.

import {
  parseRepoInput,
  fetchRepoStats,
  isGitHubOAuthConfigured,
  buildAuthorizeUrl,
  exchangeCodeForToken,
  fetchTopRepo,
} from "./github";

type FetchArgs = { url: string; init: RequestInit | undefined };

function jsonResponse(body: unknown, init: ResponseInit = { status: 200 }): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}

let fetchCalls: FetchArgs[] = [];
let fetchImpl: (url: string, init?: RequestInit) => Promise<Response> = async () =>
  jsonResponse({}, { status: 200 });

beforeEach(() => {
  fetchCalls = [];
  fetchImpl = async () => jsonResponse({}, { status: 200 });
  vi.stubGlobal("fetch", (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    fetchCalls.push({ url, init });
    return fetchImpl(url, init);
  }) as typeof fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GITHUB_CLIENT_ID;
  delete process.env.GITHUB_CLIENT_SECRET;
});

// ────────────────────────────────────────────────────────────────────────────
// parseRepoInput
// ────────────────────────────────────────────────────────────────────────────
describe("parseRepoInput", () => {
  it("parses a canonical https URL", () => {
    expect(parseRepoInput("https://github.com/vercel/next.js")).toEqual({
      owner: "vercel",
      repo: "next.js",
    });
  });

  it("parses an http URL", () => {
    expect(parseRepoInput("http://github.com/anthropics/claude-code")).toEqual({
      owner: "anthropics",
      repo: "claude-code",
    });
  });

  it("parses a URL with www.", () => {
    expect(parseRepoInput("https://www.github.com/facebook/react")).toEqual({
      owner: "facebook",
      repo: "react",
    });
  });

  it("strips a trailing .git suffix on URL form", () => {
    expect(parseRepoInput("https://github.com/openai/openai-python.git")).toEqual({
      owner: "openai",
      repo: "openai-python",
    });
  });

  it("parses a URL with a trailing slash", () => {
    expect(parseRepoInput("https://github.com/rust-lang/rust/")).toEqual({
      owner: "rust-lang",
      repo: "rust",
    });
  });

  it("parses a URL with a sub-path (/tree/main/...)", () => {
    expect(parseRepoInput("https://github.com/nodejs/node/tree/main/src")).toEqual({
      owner: "nodejs",
      repo: "node",
    });
  });

  it("parses a URL with a query string", () => {
    expect(parseRepoInput("https://github.com/pallets/flask?tab=readme")).toEqual({
      owner: "pallets",
      repo: "flask",
    });
  });

  it("parses a URL with a hash fragment", () => {
    expect(parseRepoInput("https://github.com/microsoft/typescript#readme")).toEqual({
      owner: "microsoft",
      repo: "typescript",
    });
  });

  it("parses a URL with uppercase scheme", () => {
    expect(parseRepoInput("HTTPS://github.com/foo/bar")).toEqual({ owner: "foo", repo: "bar" });
  });

  it("parses the owner/repo shorthand", () => {
    expect(parseRepoInput("torvalds/linux")).toEqual({ owner: "torvalds", repo: "linux" });
  });

  it("strips a trailing .git on the shorthand form", () => {
    expect(parseRepoInput("expressjs/express.git")).toEqual({
      owner: "expressjs",
      repo: "express",
    });
  });

  it("trims whitespace", () => {
    expect(parseRepoInput("   sveltejs/svelte   ")).toEqual({
      owner: "sveltejs",
      repo: "svelte",
    });
  });

  it("returns null for empty input", () => {
    expect(parseRepoInput("")).toBeNull();
  });

  it("returns null for a bare word", () => {
    expect(parseRepoInput("justoneword")).toBeNull();
  });

  it("returns null for a non-github URL", () => {
    expect(parseRepoInput("https://gitlab.com/foo/bar")).toBeNull();
  });

  it("returns null for URLs missing the repo segment", () => {
    expect(parseRepoInput("https://github.com/vercel")).toBeNull();
  });

  it("returns null for shorthand with too many segments", () => {
    expect(parseRepoInput("a/b/c")).toBeNull();
  });

  it("returns null for shorthand with a trailing slash", () => {
    // The shorthand regex requires no trailing `/`.
    expect(parseRepoInput("foo/bar/")).toBeNull();
  });

  it("returns null for shorthand with a space in the owner", () => {
    expect(parseRepoInput("foo bar/baz")).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// fetchRepoStats
// ────────────────────────────────────────────────────────────────────────────
describe("fetchRepoStats", () => {
  it("returns a fully mapped RepoStats for a happy-path response", async () => {
    fetchImpl = async (url) => {
      if (url.endsWith("/repos/vercel/next.js")) {
        return jsonResponse({
          owner: { login: "vercel" },
          name: "next.js",
          html_url: "https://github.com/vercel/next.js",
          stargazers_count: 120000,
          forks_count: 25000,
          open_issues_count: 3000,
          default_branch: "canary",
          pushed_at: "2026-08-01T00:00:00Z",
          language: "TypeScript",
        });
      }
      // commits endpoint
      return jsonResponse([{}, {}, {}]);
    };

    const stats = await fetchRepoStats("vercel", "next.js");
    expect(stats).toEqual({
      owner: "vercel",
      repo: "next.js",
      url: "https://github.com/vercel/next.js",
      stars: 120000,
      forks: 25000,
      openIssues: 3000,
      defaultBranch: "canary",
      pushedAt: "2026-08-01T00:00:00Z",
      commitsLast90: 3,
      language: "TypeScript",
    });
  });

  it("returns null when the repo lookup 404s", async () => {
    fetchImpl = async () => new Response("nope", { status: 404 });
    const stats = await fetchRepoStats("ghost", "missing");
    expect(stats).toBeNull();
  });

  it("returns null when the repo lookup 5xx errors", async () => {
    fetchImpl = async () => new Response("boom", { status: 502 });
    expect(await fetchRepoStats("any", "thing")).toBeNull();
  });

  it("swallows a commits-endpoint failure and reports zero", async () => {
    fetchImpl = async (url) => {
      if (url.includes("/commits")) return new Response("bad", { status: 500 });
      return jsonResponse({
        owner: { login: "foo" },
        name: "bar",
        html_url: "https://github.com/foo/bar",
      });
    };
    const stats = await fetchRepoStats("foo", "bar");
    expect(stats?.commitsLast90).toBe(0);
  });

  it("swallows a commits-endpoint fetch throw", async () => {
    let seenRepo = false;
    fetchImpl = async (url) => {
      if (!seenRepo) {
        seenRepo = true;
        return jsonResponse({
          owner: { login: "foo" },
          name: "bar",
          html_url: "https://github.com/foo/bar",
        });
      }
      throw new Error("network gone");
    };
    const stats = await fetchRepoStats("foo", "bar");
    expect(stats?.commitsLast90).toBe(0);
  });

  it("reports zero commits when the commits endpoint returns a non-array", async () => {
    fetchImpl = async (url) => {
      if (url.includes("/commits")) return jsonResponse({ message: "conflict" });
      return jsonResponse({
        owner: { login: "foo" },
        name: "bar",
        html_url: "https://github.com/foo/bar",
      });
    };
    const stats = await fetchRepoStats("foo", "bar");
    expect(stats?.commitsLast90).toBe(0);
  });

  it("defaults missing numeric fields to zero", async () => {
    fetchImpl = async (url) => {
      if (url.endsWith("/repos/foo/bar")) {
        return jsonResponse({
          owner: { login: "foo" },
          name: "bar",
          html_url: "https://github.com/foo/bar",
        });
      }
      return jsonResponse([]);
    };
    const stats = await fetchRepoStats("foo", "bar");
    expect(stats?.stars).toBe(0);
    expect(stats?.forks).toBe(0);
    expect(stats?.openIssues).toBe(0);
  });

  it("defaults missing defaultBranch to 'main'", async () => {
    fetchImpl = async (url) => {
      if (url.endsWith("/repos/foo/bar")) {
        return jsonResponse({
          owner: { login: "foo" },
          name: "bar",
          html_url: "https://github.com/foo/bar",
        });
      }
      return jsonResponse([]);
    };
    const stats = await fetchRepoStats("foo", "bar");
    expect(stats?.defaultBranch).toBe("main");
  });

  it("returns null pushedAt and language when missing", async () => {
    fetchImpl = async (url) => {
      if (url.endsWith("/repos/foo/bar")) {
        return jsonResponse({
          owner: { login: "foo" },
          name: "bar",
          html_url: "https://github.com/foo/bar",
        });
      }
      return jsonResponse([]);
    };
    const stats = await fetchRepoStats("foo", "bar");
    expect(stats?.pushedAt).toBeNull();
    expect(stats?.language).toBeNull();
  });

  it("URL-encodes the owner and repo path segments", async () => {
    fetchImpl = async () =>
      jsonResponse({
        owner: { login: "weird owner" },
        name: "weird+repo",
        html_url: "https://example.test",
      });
    await fetchRepoStats("weird owner", "weird+repo");
    expect(fetchCalls[0].url).toContain("/repos/weird%20owner/weird%2Brepo");
  });

  it("sends UA + Accept + API-version headers on every call", async () => {
    fetchImpl = async () =>
      jsonResponse({
        owner: { login: "a" },
        name: "b",
        html_url: "https://example.test",
      });
    await fetchRepoStats("a", "b");
    const headers = fetchCalls[0].init?.headers as Record<string, string>;
    expect(headers["User-Agent"]).toBe("BlockID.au-evidence-bot");
    expect(headers.Accept).toBe("application/vnd.github+json");
    expect(headers["X-GitHub-Api-Version"]).toBe("2022-11-28");
  });

  it("attaches Authorization when a token is supplied", async () => {
    fetchImpl = async () =>
      jsonResponse({
        owner: { login: "a" },
        name: "b",
        html_url: "https://example.test",
      });
    await fetchRepoStats("a", "b", "gh_pat_xxx");
    const headers = fetchCalls[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer gh_pat_xxx");
  });

  it("omits Authorization when no token is supplied", async () => {
    fetchImpl = async () =>
      jsonResponse({
        owner: { login: "a" },
        name: "b",
        html_url: "https://example.test",
      });
    await fetchRepoStats("a", "b");
    const headers = fetchCalls[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it("passes cache: 'no-store' to fetch", async () => {
    fetchImpl = async () =>
      jsonResponse({
        owner: { login: "a" },
        name: "b",
        html_url: "https://example.test",
      });
    await fetchRepoStats("a", "b");
    expect(fetchCalls[0].init?.cache).toBe("no-store");
  });

  it("hits the commits endpoint with per_page=100 and a since=90d filter", async () => {
    fetchImpl = async () =>
      jsonResponse({
        owner: { login: "a" },
        name: "b",
        html_url: "https://example.test",
      });
    await fetchRepoStats("a", "b");
    const commitCall = fetchCalls.find((c) => c.url.includes("/commits"));
    expect(commitCall).toBeDefined();
    expect(commitCall!.url).toContain("per_page=100");
    expect(commitCall!.url).toMatch(/since=/);
  });

  it("uses api.github.com as the host", async () => {
    fetchImpl = async () =>
      jsonResponse({
        owner: { login: "a" },
        name: "b",
        html_url: "https://example.test",
      });
    await fetchRepoStats("a", "b");
    expect(fetchCalls[0].url.startsWith("https://api.github.com/")).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// isGitHubOAuthConfigured
// ────────────────────────────────────────────────────────────────────────────
describe("isGitHubOAuthConfigured", () => {
  it("returns true when both env vars are set", () => {
    process.env.GITHUB_CLIENT_ID = "id";
    process.env.GITHUB_CLIENT_SECRET = "secret";
    expect(isGitHubOAuthConfigured()).toBe(true);
  });

  it("returns false when only CLIENT_ID is set", () => {
    process.env.GITHUB_CLIENT_ID = "id";
    expect(isGitHubOAuthConfigured()).toBe(false);
  });

  it("returns false when only CLIENT_SECRET is set", () => {
    process.env.GITHUB_CLIENT_SECRET = "secret";
    expect(isGitHubOAuthConfigured()).toBe(false);
  });

  it("returns false when neither env var is set", () => {
    expect(isGitHubOAuthConfigured()).toBe(false);
  });

  it("returns false when values are empty strings", () => {
    process.env.GITHUB_CLIENT_ID = "";
    process.env.GITHUB_CLIENT_SECRET = "";
    expect(isGitHubOAuthConfigured()).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// buildAuthorizeUrl
// ────────────────────────────────────────────────────────────────────────────
describe("buildAuthorizeUrl", () => {
  it("builds a github.com/login/oauth/authorize URL", () => {
    process.env.GITHUB_CLIENT_ID = "id_1";
    const url = buildAuthorizeUrl("s", "https://blockid.au/cb");
    expect(url.startsWith("https://github.com/login/oauth/authorize?")).toBe(true);
  });

  it("includes the configured client_id", () => {
    process.env.GITHUB_CLIENT_ID = "id_42";
    const url = buildAuthorizeUrl("s", "https://blockid.au/cb");
    expect(url).toContain("client_id=id_42");
  });

  it("URL-encodes the redirect_uri", () => {
    process.env.GITHUB_CLIENT_ID = "id_1";
    const url = buildAuthorizeUrl("s", "https://blockid.au/cb?x=1&y=2");
    expect(url).toContain("redirect_uri=https%3A%2F%2Fblockid.au%2Fcb%3Fx%3D1%26y%3D2");
  });

  it("requests the read:user + public_repo scope", () => {
    process.env.GITHUB_CLIENT_ID = "id_1";
    const url = buildAuthorizeUrl("s", "https://blockid.au/cb");
    expect(url).toContain("scope=read%3Auser+public_repo");
  });

  it("URL-encodes the state token", () => {
    process.env.GITHUB_CLIENT_ID = "id_1";
    const url = buildAuthorizeUrl("nonce&value=1", "https://blockid.au/cb");
    expect(url).toContain("state=nonce%26value%3D1");
  });

  it("emits an empty client_id when the env var is missing", () => {
    const url = buildAuthorizeUrl("s", "https://blockid.au/cb");
    expect(url).toContain("client_id=");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// exchangeCodeForToken
// ────────────────────────────────────────────────────────────────────────────
describe("exchangeCodeForToken", () => {
  it("returns the access token on success", async () => {
    fetchImpl = async () => jsonResponse({ access_token: "gho_abc" });
    const tok = await exchangeCodeForToken("code_1", "https://blockid.au/cb");
    expect(tok).toBe("gho_abc");
  });

  it("returns null when the exchange endpoint fails", async () => {
    fetchImpl = async () => new Response("bad", { status: 400 });
    expect(await exchangeCodeForToken("code_1", "https://blockid.au/cb")).toBeNull();
  });

  it("returns null when the response lacks access_token", async () => {
    fetchImpl = async () => jsonResponse({ error: "bad_verification_code" });
    expect(await exchangeCodeForToken("code_1", "https://blockid.au/cb")).toBeNull();
  });

  it("posts to github.com/login/oauth/access_token", async () => {
    fetchImpl = async () => jsonResponse({ access_token: "t" });
    await exchangeCodeForToken("code_1", "https://blockid.au/cb");
    expect(fetchCalls[0].url).toBe("https://github.com/login/oauth/access_token");
    expect(fetchCalls[0].init?.method).toBe("POST");
  });

  it("sends the code, client id, secret, and redirect_uri in the JSON body", async () => {
    process.env.GITHUB_CLIENT_ID = "cid";
    process.env.GITHUB_CLIENT_SECRET = "csec";
    fetchImpl = async () => jsonResponse({ access_token: "t" });
    await exchangeCodeForToken("code_1", "https://blockid.au/cb");
    const body = JSON.parse(fetchCalls[0].init?.body as string);
    expect(body).toEqual({
      client_id: "cid",
      client_secret: "csec",
      code: "code_1",
      redirect_uri: "https://blockid.au/cb",
    });
  });

  it("asks GitHub for a JSON response, not the default form-encoded one", async () => {
    fetchImpl = async () => jsonResponse({ access_token: "t" });
    await exchangeCodeForToken("code_1", "https://blockid.au/cb");
    const headers = fetchCalls[0].init?.headers as Record<string, string>;
    expect(headers.Accept).toBe("application/json");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("passes cache: 'no-store'", async () => {
    fetchImpl = async () => jsonResponse({ access_token: "t" });
    await exchangeCodeForToken("code_1", "https://blockid.au/cb");
    expect(fetchCalls[0].init?.cache).toBe("no-store");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// fetchTopRepo
// ────────────────────────────────────────────────────────────────────────────
describe("fetchTopRepo", () => {
  it("returns the first repo's owner + name", async () => {
    fetchImpl = async () =>
      jsonResponse([
        { owner: { login: "me" }, name: "top" },
        { owner: { login: "me" }, name: "second" },
      ]);
    const top = await fetchTopRepo("gho_tok");
    expect(top).toEqual({ owner: "me", repo: "top" });
  });

  it("returns null on a non-ok response", async () => {
    fetchImpl = async () => new Response("nope", { status: 401 });
    expect(await fetchTopRepo("gho_tok")).toBeNull();
  });

  it("returns null on an empty array", async () => {
    fetchImpl = async () => jsonResponse([]);
    expect(await fetchTopRepo("gho_tok")).toBeNull();
  });

  it("returns null when the payload is not an array", async () => {
    fetchImpl = async () => jsonResponse({ error: "wrong shape" });
    expect(await fetchTopRepo("gho_tok")).toBeNull();
  });

  it("asks for one repo, sorted by pushed desc, public only", async () => {
    fetchImpl = async () => jsonResponse([]);
    await fetchTopRepo("gho_tok");
    const url = fetchCalls[0].url;
    expect(url).toContain("/user/repos");
    expect(url).toContain("sort=pushed");
    expect(url).toContain("direction=desc");
    expect(url).toContain("per_page=1");
    expect(url).toContain("visibility=public");
  });

  it("attaches the caller's Bearer token", async () => {
    fetchImpl = async () => jsonResponse([]);
    await fetchTopRepo("gho_tok");
    const headers = fetchCalls[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer gho_tok");
  });
});
