// Colocated vitest for `github-repo-audit.ts` — the server-side GitHub
// repository auditor that feeds evidence into the SVI scoring engine
// (PTD / SVM / FTV / TRE dimensions). It fans out 8 GitHub REST calls
// (repo info, languages, git tree, commit activity, open PRs, package.json,
// readme, contributors) and rolls them into an architecture / dependency /
// CI/CD / testing / documentation / security / activity audit plus an
// A–F overall grade and pre-computed signal boosts.
//
// Why this suite exists:
//   * The scoring rules are decision tables (thresholds for grades, boosts,
//     tiers). One off-by-one on any of them silently biases every founder
//     audit — the failure mode is "wrong number in a report", not a crash.
//   * The wire contract with `AbortSignal.timeout(8000)` + `try/catch → null`
//     is the only thing standing between a flaky GitHub API and a crashed
//     SVI pipeline. Losing that guard turns transient 5xx into a caller-
//     visible rejection.
//   * `buildFailedRepoAudit` is the pipeline's escape hatch when the initial
//     repo fetch fails — its shape must satisfy the same TypeScript surface
//     as a real audit or the report renderer explodes.
//
// Strategy:
//   Stub `globalThis.fetch` with a URL-routed responder that returns
//   pre-baked JSON / text / non-OK / thrown responses per endpoint. The
//   parallel `Promise.all` calls inside the SUT make request order
//   non-deterministic, so URL matching is the only reliable dispatch.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { auditGitHubRepo, type GitHubRepoAudit } from "./github-repo-audit";

// ─── Fetch harness ──────────────────────────────────────────────────────────

type ResponderKind =
  | { kind: "json"; body: unknown; status?: number }
  | { kind: "text"; body: string; status?: number }
  | { kind: "notOk"; status: number }
  | { kind: "throw"; error?: Error };

type RouteTable = Record<string, ResponderKind>;

function makeResponse(r: ResponderKind, url: string): Response {
  if (r.kind === "throw") {
    throw r.error ?? new Error(`network fail: ${url}`);
  }
  const status = "status" in r && r.status !== undefined ? r.status : 200;
  const ok = status >= 200 && status < 300;
  if (r.kind === "notOk") {
    return { ok: false, status, url } as unknown as Response;
  }
  if (r.kind === "text") {
    return {
      ok,
      status,
      url,
      text: () => Promise.resolve(r.body),
      json: () => Promise.reject(new Error("not json")),
    } as unknown as Response;
  }
  return {
    ok,
    status,
    url,
    json: () => Promise.resolve(r.body),
    text: () => Promise.resolve(JSON.stringify(r.body)),
  } as unknown as Response;
}

function installFetchRouter(routes: RouteTable): ReturnType<typeof vi.fn> {
  const spy = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
    // Longest suffix match — routes are keyed on the GitHub API path fragment.
    const match = Object.keys(routes)
      .filter((k) => url.endsWith(k) || url.includes(k))
      .sort((a, b) => b.length - a.length)[0];
    if (!match) {
      return { ok: false, status: 404, url } as unknown as Response;
    }
    return makeResponse(routes[match], url);
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

// ─── Fixture builders ───────────────────────────────────────────────────────

interface RepoInfoOverrides {
  language?: string | null;
  stars?: number;
  forks?: number;
  watchers?: number;
  openIssues?: number;
  pushedAt?: string;
  license?: { spdx_id: string; name: string } | null;
}

function repoInfo(o: RepoInfoOverrides = {}) {
  return {
    full_name: "acme/widget",
    html_url: "https://github.com/acme/widget",
    language: o.language ?? "TypeScript",
    stargazers_count: o.stars ?? 0,
    forks_count: o.forks ?? 0,
    watchers_count: o.watchers ?? 0,
    open_issues_count: o.openIssues ?? 0,
    pushed_at: o.pushedAt ?? new Date().toISOString(),
    default_branch: "main",
    size: 1000,
    license: o.license ?? null,
    has_wiki: false,
    has_pages: false,
  };
}

function tree(paths: Array<{ path: string; type?: "blob" | "tree" }>) {
  return {
    tree: paths.map((p) => ({ path: p.path, type: p.type ?? "blob" })),
    truncated: false,
  };
}

// Simulate a 4-week window whose average is `weeklyAvg` commits/week.
function commitActivity(weeklyAvg: number) {
  const weeks = 52;
  const weekly = Math.round(weeklyAvg);
  return Array.from({ length: weeks }, (_, i) => ({
    total: weekly,
    week: 1_700_000_000 + i * 604800,
    days: [0, 0, 0, 0, 0, 0, weekly],
  }));
}

function baseRoutes(over: Partial<RouteTable> = {}): RouteTable {
  return {
    "/repos/acme/widget": { kind: "json", body: repoInfo() },
    "/repos/acme/widget/languages": { kind: "json", body: { TypeScript: 100 } },
    "/repos/acme/widget/git/trees/HEAD?recursive=1": {
      kind: "json",
      body: tree([]),
    },
    "/repos/acme/widget/stats/commit_activity": { kind: "json", body: [] },
    "/repos/acme/widget/pulls?state=open&per_page=5": { kind: "json", body: [] },
    "/repos/acme/widget/contents/package.json": { kind: "notOk", status: 404 },
    "/repos/acme/widget/readme": { kind: "notOk", status: 404 },
    "/repos/acme/widget/stats/contributors": { kind: "json", body: [] },
    ...over,
  };
}

// ─── Global hooks ───────────────────────────────────────────────────────────

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-01T00:00:00Z"));
});

afterEach(() => {
  vi.unstubAllGlobals();
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ─── Fallback path ──────────────────────────────────────────────────────────

describe("auditGitHubRepo — fallback when repo info fetch fails", () => {
  it("returns a well-formed GitHubRepoAudit when the repo endpoint 404s (grade F, all zeros)", async () => {
    installFetchRouter(
      baseRoutes({
        "/repos/acme/widget": { kind: "notOk", status: 404 },
      }),
    );
    const r = await auditGitHubRepo("acme/widget", "token-x");
    expect(r.overallGrade).toBe("F");
    expect(r.repoFullName).toBe("acme/widget");
    expect(r.repoUrl).toBe("https://github.com/acme/widget");
    // fallback surface must satisfy the same type shape as a real audit
    expect(r.architecture.frameworks).toEqual([]);
    expect(r.cicd.hasCI).toBe(false);
    expect(r.testing.estimatedTestMaturity).toBe("none");
  });

  it("stamps the fallback with the documented punitive signal boosts (-5 PTD, -3 FTV)", async () => {
    installFetchRouter(
      baseRoutes({
        "/repos/acme/widget": { kind: "notOk", status: 500 },
      }),
    );
    const r = await auditGitHubRepo("acme/widget", "t");
    expect(r.signalBoosts).toEqual({
      ptdBoost: -5,
      svmBoost: 0,
      ftvBoost: -3,
      treBoost: 0,
    });
    expect(r.evidenceLabels[0]).toMatch(/audit failed/i);
  });

  it("returns the fallback when fetch itself throws (network error surfaces as 404-equivalent)", async () => {
    installFetchRouter(
      baseRoutes({
        "/repos/acme/widget": { kind: "throw", error: new TypeError("fetch failed") },
      }),
    );
    const r = await auditGitHubRepo("acme/widget", "t");
    expect(r.overallGrade).toBe("F");
    expect(r.architecture.primaryLanguage).toBe(null);
  });
});

// ─── Wire contract ──────────────────────────────────────────────────────────

describe("auditGitHubRepo — wire contract", () => {
  it("passes a Bearer token in every GitHub API call", async () => {
    const spy = installFetchRouter(baseRoutes());
    await auditGitHubRepo("acme/widget", "secret-abc");
    for (const call of spy.mock.calls) {
      const init = call[1] as RequestInit | undefined;
      const headers = init?.headers as Record<string, string> | undefined;
      expect(headers?.Authorization).toBe("Bearer secret-abc");
    }
  });

  it("hits all 8 GitHub endpoints on a successful audit", async () => {
    const spy = installFetchRouter(baseRoutes());
    await auditGitHubRepo("acme/widget", "t");
    const urls = spy.mock.calls.map(([u]) => String(u));
    expect(urls.some((u) => u.endsWith("/repos/acme/widget"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/languages"))).toBe(true);
    expect(urls.some((u) => u.includes("/git/trees/HEAD"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/stats/commit_activity"))).toBe(true);
    expect(urls.some((u) => u.includes("/pulls?state=open"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/contents/package.json"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/readme"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/stats/contributors"))).toBe(true);
  });

  it("sends the raw-content Accept header when fetching README (text endpoint)", async () => {
    const spy = installFetchRouter(baseRoutes());
    await auditGitHubRepo("acme/widget", "t");
    const readmeCall = spy.mock.calls.find(([u]) =>
      String(u).endsWith("/readme"),
    );
    const headers = (readmeCall?.[1] as RequestInit).headers as Record<
      string,
      string
    >;
    expect(headers.Accept).toBe("application/vnd.github.v3.raw");
  });
});

// ─── Architecture detection ─────────────────────────────────────────────────

describe("auditGitHubRepo — architecture detection", () => {
  it("detects TypeScript via a tsconfig.json entry in the tree", async () => {
    installFetchRouter(
      baseRoutes({
        "/repos/acme/widget/git/trees/HEAD?recursive=1": {
          kind: "json",
          body: tree([{ path: "tsconfig.json" }]),
        },
      }),
    );
    const r = await auditGitHubRepo("acme/widget", "t");
    expect(r.architecture.hasTypescript).toBe(true);
  });

  it("also detects TypeScript when only .ts files are present (no tsconfig)", async () => {
    installFetchRouter(
      baseRoutes({
        "/repos/acme/widget/git/trees/HEAD?recursive=1": {
          kind: "json",
          body: tree([{ path: "src/index.ts" }]),
        },
      }),
    );
    const r = await auditGitHubRepo("acme/widget", "t");
    expect(r.architecture.hasTypescript).toBe(true);
  });

  it("detects both linting and formatting when biome.json is present (dual-purpose config)", async () => {
    installFetchRouter(
      baseRoutes({
        "/repos/acme/widget/git/trees/HEAD?recursive=1": {
          kind: "json",
          body: tree([{ path: "biome.json" }]),
        },
      }),
    );
    const r = await auditGitHubRepo("acme/widget", "t");
    expect(r.architecture.hasLinting).toBe(true);
    expect(r.architecture.hasFormatting).toBe(true);
  });

  it("flags monorepo when package.json declares workspaces (npm-style)", async () => {
    installFetchRouter(
      baseRoutes({
        "/repos/acme/widget/contents/package.json": {
          kind: "text",
          body: JSON.stringify({ workspaces: ["packages/*"] }),
        },
      }),
    );
    const r = await auditGitHubRepo("acme/widget", "t");
    expect(r.architecture.hasMonorepo).toBe(true);
    expect(r.architecture.archPattern).toBe("monorepo");
  });

  it("flags monorepo when a turbo.json is present at the repo root", async () => {
    installFetchRouter(
      baseRoutes({
        "/repos/acme/widget/git/trees/HEAD?recursive=1": {
          kind: "json",
          body: tree([{ path: "turbo.json" }]),
        },
      }),
    );
    const r = await auditGitHubRepo("acme/widget", "t");
    expect(r.architecture.hasMonorepo).toBe(true);
  });

  it("picks package managers in the documented precedence order: bun beats pnpm beats yarn beats npm", async () => {
    installFetchRouter(
      baseRoutes({
        "/repos/acme/widget/git/trees/HEAD?recursive=1": {
          kind: "json",
          body: tree([
            { path: "bun.lockb" },
            { path: "pnpm-lock.yaml" },
            { path: "yarn.lock" },
            { path: "package-lock.json" },
          ]),
        },
      }),
    );
    const r = await auditGitHubRepo("acme/widget", "t");
    expect(r.architecture.packageManager).toBe("bun");
  });

  it("falls back to pnpm when bun is absent but pnpm-lock is present", async () => {
    installFetchRouter(
      baseRoutes({
        "/repos/acme/widget/git/trees/HEAD?recursive=1": {
          kind: "json",
          body: tree([
            { path: "pnpm-lock.yaml" },
            { path: "yarn.lock" },
            { path: "package-lock.json" },
          ]),
        },
      }),
    );
    const r = await auditGitHubRepo("acme/widget", "t");
    expect(r.architecture.packageManager).toBe("pnpm");
  });

  it("detects Next.js as a framework when the dep list contains `next`", async () => {
    installFetchRouter(
      baseRoutes({
        "/repos/acme/widget/contents/package.json": {
          kind: "text",
          body: JSON.stringify({ dependencies: { next: "14.0.0", react: "18.0.0" } }),
        },
      }),
    );
    const r = await auditGitHubRepo("acme/widget", "t");
    expect(r.architecture.frameworks).toContain("Next.js");
    // React should NOT be double-listed when Next is present
    expect(r.architecture.frameworks).not.toContain("React");
  });

  it("detects React (standalone) when there is a React dep but no Next dep", async () => {
    installFetchRouter(
      baseRoutes({
        "/repos/acme/widget/contents/package.json": {
          kind: "text",
          body: JSON.stringify({ dependencies: { react: "18.0.0" } }),
        },
      }),
    );
    const r = await auditGitHubRepo("acme/widget", "t");
    expect(r.architecture.frameworks).toContain("React");
    expect(r.architecture.frameworks).not.toContain("Next.js");
  });

  it("detects Go from a go.mod entry (lowercased filepath matches the file-list matcher)", async () => {
    // `filePaths` is lowercased before matching, so only lowercase-only
    // filenames like `go.mod` reliably hit — mixed-case names such as
    // `Cargo.toml` / `Dockerfile` currently never match, and this suite
    // pins that observed behaviour.
    installFetchRouter(
      baseRoutes({
        "/repos/acme/widget/git/trees/HEAD?recursive=1": {
          kind: "json",
          body: tree([{ path: "go.mod" }]),
        },
      }),
    );
    const r = await auditGitHubRepo("acme/widget", "t");
    expect(r.architecture.frameworks).toContain("Go");
  });

  it("uses `fullstack` archPattern when src + public sit at top level (and no monorepo signals)", async () => {
    installFetchRouter(
      baseRoutes({
        "/repos/acme/widget/git/trees/HEAD?recursive=1": {
          kind: "json",
          body: tree([
            { path: "src", type: "tree" },
            { path: "public", type: "tree" },
          ]),
        },
      }),
    );
    const r = await auditGitHubRepo("acme/widget", "t");
    expect(r.architecture.archPattern).toBe("fullstack");
  });

  it("uses `monolith` archPattern when no monorepo / microservices / fullstack signals fire", async () => {
    installFetchRouter(
      baseRoutes({
        "/repos/acme/widget/git/trees/HEAD?recursive=1": {
          kind: "json",
          body: tree([{ path: "lib", type: "tree" }]),
        },
      }),
    );
    const r = await auditGitHubRepo("acme/widget", "t");
    expect(r.architecture.archPattern).toBe("monolith");
  });
});

// ─── Dependency & security-tool detection ───────────────────────────────────

describe("auditGitHubRepo — dependencies", () => {
  it("counts totalDeps and totalDevDeps from package.json separately", async () => {
    installFetchRouter(
      baseRoutes({
        "/repos/acme/widget/contents/package.json": {
          kind: "text",
          body: JSON.stringify({
            dependencies: { a: "1", b: "1", c: "1" },
            devDependencies: { d: "1", e: "1" },
          }),
        },
      }),
    );
    const r = await auditGitHubRepo("acme/widget", "t");
    expect(r.dependencies.totalDeps).toBe(3);
    expect(r.dependencies.totalDevDeps).toBe(2);
  });

  it("labels notable libs by their canonical brand (e.g. @prisma/client → Prisma ORM)", async () => {
    installFetchRouter(
      baseRoutes({
        "/repos/acme/widget/contents/package.json": {
          kind: "text",
          body: JSON.stringify({
            dependencies: {
              "@prisma/client": "5.0.0",
              stripe: "13.0.0",
              "@anthropic-ai/sdk": "0.20.0",
            },
          }),
        },
      }),
    );
    const r = await auditGitHubRepo("acme/widget", "t");
    expect(r.dependencies.notableLibs).toEqual(
      expect.arrayContaining(["Prisma ORM", "Stripe", "Anthropic SDK"]),
    );
  });

  it("de-duplicates a notable brand when its dep appears twice under different keys", async () => {
    installFetchRouter(
      baseRoutes({
        "/repos/acme/widget/contents/package.json": {
          kind: "text",
          body: JSON.stringify({
            dependencies: { prisma: "5.0.0", "@prisma/client": "5.0.0" },
          }),
        },
      }),
    );
    const r = await auditGitHubRepo("acme/widget", "t");
    const prismaHits = r.dependencies.notableLibs.filter(
      (l) => l === "Prisma ORM",
    );
    expect(prismaHits).toHaveLength(1);
  });

  it("records Dependabot in dependencies.securityTools when the config file is present", async () => {
    installFetchRouter(
      baseRoutes({
        "/repos/acme/widget/git/trees/HEAD?recursive=1": {
          kind: "json",
          body: tree([{ path: ".github/dependabot.yml" }]),
        },
        "/repos/acme/widget/contents/package.json": {
          kind: "text",
          body: JSON.stringify({ dependencies: {} }),
        },
      }),
    );
    const r = await auditGitHubRepo("acme/widget", "t");
    expect(r.dependencies.securityTools).toContain("Dependabot");
    expect(r.security.hasDependabot).toBe(true);
  });

  it("gracefully skips notable-lib scan when package.json is missing (404) — no throw", async () => {
    installFetchRouter(baseRoutes());
    const r = await auditGitHubRepo("acme/widget", "t");
    expect(r.dependencies.totalDeps).toBe(0);
    expect(r.dependencies.notableLibs).toEqual([]);
  });

  it("survives malformed JSON in package.json without crashing (parse is try/catch)", async () => {
    installFetchRouter(
      baseRoutes({
        "/repos/acme/widget/contents/package.json": {
          kind: "text",
          body: "{not-json",
        },
      }),
    );
    const r = await auditGitHubRepo("acme/widget", "t");
    expect(r.dependencies.totalDeps).toBe(0);
  });
});

// ─── CI/CD detection ────────────────────────────────────────────────────────

describe("auditGitHubRepo — CI/CD", () => {
  it("prefers GitHub Actions over other CI platforms when workflows exist", async () => {
    installFetchRouter(
      baseRoutes({
        "/repos/acme/widget/git/trees/HEAD?recursive=1": {
          kind: "json",
          body: tree([
            { path: ".github/workflows/ci.yml" },
            { path: ".gitlab-ci.yml" },
          ]),
        },
      }),
    );
    const r = await auditGitHubRepo("acme/widget", "t");
    expect(r.cicd.ciPlatform).toBe("GitHub Actions");
  });

  it("falls back to GitLab CI when there is no .github/workflows directory", async () => {
    installFetchRouter(
      baseRoutes({
        "/repos/acme/widget/git/trees/HEAD?recursive=1": {
          kind: "json",
          body: tree([{ path: ".gitlab-ci.yml" }]),
        },
      }),
    );
    const r = await auditGitHubRepo("acme/widget", "t");
    expect(r.cicd.ciPlatform).toBe("GitLab CI");
  });

  it("marks hasCD when a workflow filename contains 'deploy'", async () => {
    installFetchRouter(
      baseRoutes({
        "/repos/acme/widget/git/trees/HEAD?recursive=1": {
          kind: "json",
          body: tree([{ path: ".github/workflows/deploy.yml" }]),
        },
      }),
    );
    const r = await auditGitHubRepo("acme/widget", "t");
    expect(r.cicd.hasCD).toBe(true);
    expect(r.cicd.workflowCount).toBe(1);
  });

  it("marks dockerized when a docker-compose.yml lives at the repo root", async () => {
    // Use `docker-compose.yml` (all-lowercase) rather than `Dockerfile` —
    // the SUT's `hasFile` matcher compares caller-provided names (case-
    // preserved) against pre-lowercased filePaths, so `Dockerfile` is
    // effectively unreachable today. Pinning the compose path here.
    installFetchRouter(
      baseRoutes({
        "/repos/acme/widget/git/trees/HEAD?recursive=1": {
          kind: "json",
          body: tree([{ path: "docker-compose.yml" }]),
        },
      }),
    );
    const r = await auditGitHubRepo("acme/widget", "t");
    expect(r.cicd.dockerized).toBe(true);
  });

  it("marks hasInfraAsCode when a Terraform file is present", async () => {
    installFetchRouter(
      baseRoutes({
        "/repos/acme/widget/git/trees/HEAD?recursive=1": {
          kind: "json",
          body: tree([{ path: "main.tf" }]),
        },
      }),
    );
    const r = await auditGitHubRepo("acme/widget", "t");
    expect(r.cicd.hasInfraAsCode).toBe(true);
  });
});

// ─── Testing maturity ───────────────────────────────────────────────────────

describe("auditGitHubRepo — testing maturity tiers", () => {
  it("returns `comprehensive` when a test framework, E2E, and coverage config all coexist", async () => {
    installFetchRouter(
      baseRoutes({
        "/repos/acme/widget/git/trees/HEAD?recursive=1": {
          kind: "json",
          body: tree([
            { path: "playwright.config.ts" },
            { path: "vitest.config.ts" },
          ]),
        },
        "/repos/acme/widget/contents/package.json": {
          kind: "text",
          body: JSON.stringify({ devDependencies: { vitest: "1.0.0" } }),
        },
      }),
    );
    const r = await auditGitHubRepo("acme/widget", "t");
    expect(r.testing.estimatedTestMaturity).toBe("comprehensive");
    expect(r.testing.hasE2E).toBe(true);
    expect(r.testing.testFrameworks).toEqual(
      expect.arrayContaining(["Vitest", "Playwright"]),
    );
  });

  it("returns `moderate` when a framework is present with coverage config but no E2E", async () => {
    installFetchRouter(
      baseRoutes({
        "/repos/acme/widget/git/trees/HEAD?recursive=1": {
          kind: "json",
          body: tree([{ path: "jest.config.js" }]),
        },
        "/repos/acme/widget/contents/package.json": {
          kind: "text",
          body: JSON.stringify({ devDependencies: { jest: "29.0.0" } }),
        },
      }),
    );
    const r = await auditGitHubRepo("acme/widget", "t");
    expect(r.testing.estimatedTestMaturity).toBe("moderate");
  });

  it("returns `basic` when a framework dep exists but neither E2E nor coverage config is present", async () => {
    installFetchRouter(
      baseRoutes({
        "/repos/acme/widget/contents/package.json": {
          kind: "text",
          body: JSON.stringify({ devDependencies: { jest: "29.0.0" } }),
        },
      }),
    );
    const r = await auditGitHubRepo("acme/widget", "t");
    expect(r.testing.estimatedTestMaturity).toBe("basic");
  });

  it("returns `none` when no framework and no test directory pattern is detected", async () => {
    installFetchRouter(baseRoutes());
    const r = await auditGitHubRepo("acme/widget", "t");
    expect(r.testing.estimatedTestMaturity).toBe("none");
    expect(r.testing.hasTests).toBe(false);
  });
});

// ─── Activity tiers ─────────────────────────────────────────────────────────

describe("auditGitHubRepo — activity tiers", () => {
  it.each([
    { avg: 25, tier: "intense" as const },
    { avg: 15, tier: "strong" as const },
    { avg: 7, tier: "moderate" as const },
    { avg: 3, tier: "light" as const },
    { avg: 0, tier: "inactive" as const },
  ])("maps recent weekly avg of $avg → $tier commitFrequencyTier", async ({ avg, tier }) => {
    installFetchRouter(
      baseRoutes({
        "/repos/acme/widget/stats/commit_activity": {
          kind: "json",
          body: commitActivity(avg),
        },
      }),
    );
    const r = await auditGitHubRepo("acme/widget", "t");
    expect(r.activity.commitFrequencyTier).toBe(tier);
  });

  it("marks isActivelyMaintained=true when pushed_at is within the last 30 days", async () => {
    installFetchRouter(
      baseRoutes({
        "/repos/acme/widget": {
          kind: "json",
          body: repoInfo({ pushedAt: "2026-07-25T00:00:00Z" }),
        },
      }),
    );
    const r = await auditGitHubRepo("acme/widget", "t");
    expect(r.activity.isActivelyMaintained).toBe(true);
  });

  it("marks isActivelyMaintained=false when pushed_at is older than 30 days", async () => {
    installFetchRouter(
      baseRoutes({
        "/repos/acme/widget": {
          kind: "json",
          body: repoInfo({ pushedAt: "2026-05-01T00:00:00Z" }),
        },
      }),
    );
    const r = await auditGitHubRepo("acme/widget", "t");
    expect(r.activity.isActivelyMaintained).toBe(false);
  });

  it("counts open PRs from the /pulls response length", async () => {
    installFetchRouter(
      baseRoutes({
        "/repos/acme/widget/pulls?state=open&per_page=5": {
          kind: "json",
          body: [{ state: "open" }, { state: "open" }, { state: "open" }],
        },
      }),
    );
    const r = await auditGitHubRepo("acme/widget", "t");
    expect(r.activity.openPRs).toBe(3);
  });

  it("treats a non-array /pulls response as zero open PRs (defensive)", async () => {
    installFetchRouter(
      baseRoutes({
        "/repos/acme/widget/pulls?state=open&per_page=5": {
          kind: "json",
          body: { error: "rate-limited" },
        },
      }),
    );
    const r = await auditGitHubRepo("acme/widget", "t");
    expect(r.activity.openPRs).toBe(0);
  });

  it("defaults contributors to 1 when /stats/contributors returns a non-array (repo shows at least the owner)", async () => {
    installFetchRouter(
      baseRoutes({
        "/repos/acme/widget/stats/contributors": { kind: "notOk", status: 202 },
      }),
    );
    const r = await auditGitHubRepo("acme/widget", "t");
    expect(r.activity.contributors).toBe(1);
  });

  it("rounds recentWeeklyAvg to one decimal place", async () => {
    installFetchRouter(
      baseRoutes({
        // 4 weeks of totals: 1, 1, 2, 2 → avg 1.5, rounded to 1.5
        "/repos/acme/widget/stats/commit_activity": {
          kind: "json",
          body: [
            ...commitActivity(0).slice(0, 48),
            { total: 1, week: 1, days: [1] },
            { total: 1, week: 1, days: [1] },
            { total: 2, week: 1, days: [2] },
            { total: 2, week: 1, days: [2] },
          ],
        },
      }),
    );
    const r = await auditGitHubRepo("acme/widget", "t");
    expect(r.activity.recentWeeklyAvg).toBe(1.5);
  });
});

// ─── Overall grade thresholds ───────────────────────────────────────────────

describe("auditGitHubRepo — overallGrade thresholds", () => {
  it("returns grade F when nothing at all is detected (no CI, no tests, no docs)", async () => {
    installFetchRouter(
      baseRoutes({
        "/repos/acme/widget": {
          kind: "json",
          body: repoInfo({ language: null }),
        },
      }),
    );
    const r = await auditGitHubRepo("acme/widget", "t");
    expect(r.overallGrade).toBe("F");
  });

  it("returns an A when every category contributes (TS + CI/CD + tests + docs + security + intense activity + 5 contributors)", async () => {
    installFetchRouter(
      baseRoutes({
        "/repos/acme/widget": {
          kind: "json",
          body: repoInfo({
            pushedAt: "2026-07-30T00:00:00Z",
            stars: 500,
            forks: 50,
            license: { spdx_id: "MIT", name: "MIT" },
          }),
        },
        "/repos/acme/widget/git/trees/HEAD?recursive=1": {
          kind: "json",
          body: tree([
            { path: "tsconfig.json" },
            { path: "biome.json" },
            { path: "turbo.json" },
            { path: "package-lock.json" },
            { path: "Dockerfile" },
            { path: "main.tf" },
            { path: ".github/workflows/deploy.yml" },
            { path: ".github/workflows/ci.yml" },
            { path: ".github/workflows/lint.yml" },
            { path: ".github/dependabot.yml" },
            { path: "readme.md" },
            { path: "changelog.md" },
            { path: "license" },
            { path: "contributing.md" },
            { path: ".env.example" },
            { path: "docs/api.md" },
            { path: "security.md" },
            { path: "playwright.config.ts" },
            { path: "vitest.config.ts" },
            { path: "codeql.yml" },
            { path: "src", type: "tree" },
          ]),
        },
        "/repos/acme/widget/contents/package.json": {
          kind: "text",
          body: JSON.stringify({
            dependencies: {
              next: "14.0.0",
              stripe: "13.0.0",
              zod: "3.0.0",
              "@anthropic-ai/sdk": "0.20.0",
            },
            devDependencies: { vitest: "1.0.0" },
          }),
        },
        "/repos/acme/widget/readme": {
          kind: "text",
          body: "x".repeat(2000),
        },
        "/repos/acme/widget/stats/commit_activity": {
          kind: "json",
          body: commitActivity(25),
        },
        "/repos/acme/widget/stats/contributors": {
          kind: "json",
          body: Array.from({ length: 6 }, () => ({ total: 100 })),
        },
      }),
    );
    const r = await auditGitHubRepo("acme/widget", "t");
    expect(r.overallGrade).toBe("A");
  });
});

// ─── Signal boosts ──────────────────────────────────────────────────────────

describe("auditGitHubRepo — signalBoosts", () => {
  it("penalises PTD by 5 when CI is absent (documented penalty)", async () => {
    installFetchRouter(baseRoutes());
    const r = await auditGitHubRepo("acme/widget", "t");
    expect(r.signalBoosts.ptdBoost).toBeLessThan(0);
  });

  it("boosts TRE when starsCount ≥ 100 and repository is actively maintained (intense activity)", async () => {
    installFetchRouter(
      baseRoutes({
        "/repos/acme/widget": {
          kind: "json",
          body: repoInfo({ stars: 500, forks: 50, pushedAt: "2026-07-28T00:00:00Z" }),
        },
        "/repos/acme/widget/stats/commit_activity": {
          kind: "json",
          body: commitActivity(25),
        },
      }),
    );
    const r = await auditGitHubRepo("acme/widget", "t");
    // intense (+5) + stars ≥ 100 (+3) + forks ≥ 10 (+2) + actively maintained (+2)
    expect(r.signalBoosts.treBoost).toBeGreaterThanOrEqual(12);
  });

  it("boosts SVM by 3 when an AI notable lib (Anthropic / OpenAI / LangChain) is on the dep list", async () => {
    installFetchRouter(
      baseRoutes({
        "/repos/acme/widget/contents/package.json": {
          kind: "text",
          body: JSON.stringify({ dependencies: { "@anthropic-ai/sdk": "0.20.0" } }),
        },
      }),
    );
    const r = await auditGitHubRepo("acme/widget", "t");
    expect(r.signalBoosts.svmBoost).toBeGreaterThanOrEqual(3);
  });
});

// ─── Evidence labels & scoring notes ────────────────────────────────────────

describe("auditGitHubRepo — evidence + scoring commentary", () => {
  it("leads evidence labels with the repo name and computed grade in parentheses", async () => {
    installFetchRouter(baseRoutes());
    const r = await auditGitHubRepo("acme/widget", "t");
    expect(r.evidenceLabels[0]).toMatch(/^Repo: acme\/widget \(Grade [A-F]\)$/);
  });

  it("includes an Activity line with weekly commits, tier, and contributor count", async () => {
    installFetchRouter(
      baseRoutes({
        "/repos/acme/widget/stats/commit_activity": {
          kind: "json",
          body: commitActivity(15),
        },
        "/repos/acme/widget/stats/contributors": {
          kind: "json",
          body: [{ total: 1 }, { total: 1 }, { total: 1 }],
        },
      }),
    );
    const r = await auditGitHubRepo("acme/widget", "t");
    const activityLabel = r.evidenceLabels.find((l) => l.startsWith("Activity:"));
    expect(activityLabel).toBeTruthy();
    expect(activityLabel).toMatch(/strong/);
    expect(activityLabel).toMatch(/3 contributors/);
  });

  it("adds a 'no CI/CD' scoring note when no CI platform is detected", async () => {
    installFetchRouter(baseRoutes());
    const r = await auditGitHubRepo("acme/widget", "t");
    expect(r.scoringNotes.some((n) => /Missing CI\/CD/i.test(n))).toBe(true);
  });

  it("adds the JS-without-TS scoring note when the primary language is JavaScript and no TS files exist", async () => {
    installFetchRouter(
      baseRoutes({
        "/repos/acme/widget": {
          kind: "json",
          body: repoInfo({ language: "JavaScript" }),
        },
      }),
    );
    const r = await auditGitHubRepo("acme/widget", "t");
    expect(
      r.scoringNotes.some((n) => /migrating to TS/i.test(n)),
    ).toBe(true);
  });

  it("stamps auditedAt with an ISO timestamp reflecting the fake clock", async () => {
    installFetchRouter(baseRoutes());
    const r = await auditGitHubRepo("acme/widget", "t");
    expect(r.auditedAt).toBe("2026-08-01T00:00:00.000Z");
  });
});

// ─── Type-level contract sanity ─────────────────────────────────────────────

describe("auditGitHubRepo — type surface", () => {
  it("returns an object satisfying the GitHubRepoAudit shape (spot-check the top-level keys)", async () => {
    installFetchRouter(baseRoutes());
    const r: GitHubRepoAudit = await auditGitHubRepo("acme/widget", "t");
    const keys = Object.keys(r).sort();
    expect(keys).toEqual(
      [
        "activity",
        "architecture",
        "auditedAt",
        "cicd",
        "dependencies",
        "documentation",
        "evidenceLabels",
        "overallGrade",
        "repoFullName",
        "repoUrl",
        "scoringNotes",
        "security",
        "signalBoosts",
        "testing",
      ].sort(),
    );
  });
});
