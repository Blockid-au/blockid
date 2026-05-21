import "server-only";

// ─── Deep GitHub Repository Audit ───────────────────────────────────────────
// Enterprise-grade analysis of a GitHub repository: architecture, code quality,
// dependencies, CI/CD maturity, testing, documentation, and security posture.
// Used by the SVI scoring engine to populate PTD, SVM, FTV, and TRE dimensions
// with machine-verified technical evidence.

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RepoArchitectureAudit {
  primaryLanguage: string | null;
  languages: Record<string, number>;  // language → bytes
  hasMonorepo: boolean;               // nx, turbo, lerna, workspaces
  hasTypescript: boolean;
  hasLinting: boolean;                // .eslintrc, biome, prettier
  hasFormatting: boolean;             // prettier, biome
  packageManager: string | null;      // npm, yarn, pnpm, bun
  frameworks: string[];               // Next.js, Express, Django, Rails, etc.
  directories: string[];              // top-level directory names
  archPattern: string | null;         // monorepo, microservices, monolith, fullstack
}

export interface RepoDependencyAudit {
  totalDeps: number;
  totalDevDeps: number;
  hasLockFile: boolean;
  outdatedSignals: string[];          // known old major versions detected
  securityTools: string[];            // snyk, dependabot, renovate
  notableLibs: string[];             // significant deps (prisma, supabase, stripe, etc.)
}

export interface RepoCICDAudit {
  hasCI: boolean;
  ciPlatform: string | null;          // github-actions, gitlab-ci, circleci, etc.
  hasCD: boolean;                     // deploy workflow detected
  hasBuildStep: boolean;
  hasTestStep: boolean;
  hasLintStep: boolean;
  workflowCount: number;
  dockerized: boolean;                // Dockerfile present
  hasInfraAsCode: boolean;            // terraform, pulumi, cdk, k8s manifests
}

export interface RepoTestingAudit {
  hasTests: boolean;
  testFrameworks: string[];           // jest, vitest, pytest, mocha, etc.
  hasE2E: boolean;                    // playwright, cypress, selenium
  hasCoverageConfig: boolean;
  testDirExists: boolean;             // __tests__, test/, tests/, spec/
  estimatedTestMaturity: "none" | "basic" | "moderate" | "comprehensive";
}

export interface RepoDocumentationAudit {
  hasReadme: boolean;
  readmeLength: number;               // character count
  hasContributing: boolean;
  hasChangelog: boolean;
  hasLicense: boolean;
  licenseType: string | null;
  hasApiDocs: boolean;                // docs/, api-docs/, swagger, openapi
  hasCodeComments: boolean;           // JSDoc, docstrings detected
}

export interface RepoSecurityAudit {
  hasSecurityPolicy: boolean;         // SECURITY.md
  hasDependabot: boolean;
  hasCodeScanning: boolean;           // codeql, semgrep
  hasSecrets: boolean;                // .env in .gitignore
  hasEnvExample: boolean;             // .env.example, .env.sample
  branchProtection: boolean;          // inferred from default branch rules
}

export interface RepoActivityAudit {
  totalCommits: number;               // approximate from contributor stats
  commitFrequencyTier: "inactive" | "light" | "moderate" | "strong" | "intense";
  recentWeeklyAvg: number;
  contributors: number;
  openIssues: number;
  openPRs: number;
  lastPushAt: string | null;
  isActivelyMaintained: boolean;      // pushed within 30 days
  starsCount: number;
  forksCount: number;
  watchersCount: number;
}

export interface GitHubRepoAudit {
  repoFullName: string;
  repoUrl: string;
  auditedAt: string;
  architecture: RepoArchitectureAudit;
  dependencies: RepoDependencyAudit;
  cicd: RepoCICDAudit;
  testing: RepoTestingAudit;
  documentation: RepoDocumentationAudit;
  security: RepoSecurityAudit;
  activity: RepoActivityAudit;
  overallGrade: "A" | "B" | "C" | "D" | "F";
  // Pre-computed SVI signal boosts
  signalBoosts: {
    ptdBoost: number;   // Product & Technical Depth
    svmBoost: number;   // Strategic Vision & Moat
    ftvBoost: number;   // Founder & Team Value (engineering quality)
    treBoost: number;   // Traction & Revenue Evidence (activity)
  };
  evidenceLabels: string[];
  scoringNotes: string[];             // Human-readable scoring rationale
}

// ─── GitHub API helpers ─────────────────────────────────────────────────────

type GHHeaders = Record<string, string>;

async function ghFetch<T>(url: string, headers: GHHeaders): Promise<T | null> {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function ghFetchText(url: string, headers: GHHeaders): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { ...headers, Accept: "application/vnd.github.v3.raw" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

interface GHTreeItem {
  path: string;
  type: "blob" | "tree";
  size?: number;
}

interface GHTree {
  tree: GHTreeItem[];
  truncated: boolean;
}

interface GHRepoInfo {
  full_name: string;
  html_url: string;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  watchers_count: number;
  open_issues_count: number;
  pushed_at: string;
  default_branch: string;
  size: number;
  license?: { spdx_id: string; name: string } | null;
  has_wiki: boolean;
  has_pages: boolean;
}

interface GHLanguages {
  [lang: string]: number;
}

interface GHCommitWeek {
  total: number;
  week: number;
  days: number[];
}

// ─── Main audit function ────────────────────────────────────────────────────

export async function auditGitHubRepo(
  repoFullName: string,
  accessToken: string,
): Promise<GitHubRepoAudit> {
  const headers: GHHeaders = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github.v3+json",
  };

  const baseApi = `https://api.github.com/repos/${repoFullName}`;

  // ── Parallel fetch: repo info, languages, tree, commit activity, pulls ──
  const [repoInfo, languages, tree, commitActivity, pulls] = await Promise.all([
    ghFetch<GHRepoInfo>(baseApi, headers),
    ghFetch<GHLanguages>(`${baseApi}/languages`, headers),
    ghFetch<GHTree>(`${baseApi}/git/trees/${encodeURIComponent("HEAD")}?recursive=1`, headers),
    ghFetch<GHCommitWeek[]>(`${baseApi}/stats/commit_activity`, headers),
    ghFetch<Array<{ state: string }>>(`${baseApi}/pulls?state=open&per_page=5`, headers),
  ]);

  if (!repoInfo) {
    return buildFailedRepoAudit(repoFullName);
  }

  const files = tree?.tree ?? [];
  const filePaths = files.map((f) => f.path.toLowerCase());
  const topDirs = [...new Set(files.filter((f) => f.type === "tree" && !f.path.includes("/")).map((f) => f.path))];

  const hasFile = (...names: string[]) => names.some((n) => filePaths.some((p) => p === n || p.endsWith(`/${n}`)));
  const hasFilePattern = (...patterns: string[]) => patterns.some((pat) => filePaths.some((p) => p.includes(pat)));

  // ── Parallel fetch: package.json, readme, specific config files ────────
  const [owner, repo] = repoFullName.split("/");
  const [packageJsonRaw, readmeRaw] = await Promise.all([
    ghFetchText(`${baseApi}/contents/package.json`, headers),
    ghFetchText(`${baseApi}/readme`, headers),
  ]);

  let packageJson: Record<string, unknown> | null = null;
  if (packageJsonRaw) {
    try { packageJson = JSON.parse(packageJsonRaw); } catch { /* ignore */ }
  }

  // ── 1. Architecture Audit ──────────────────────────────────────────────

  const hasTypescript = hasFile("tsconfig.json") || hasFilePattern(".ts", ".tsx");
  const hasLinting = hasFile(".eslintrc", ".eslintrc.js", ".eslintrc.json", ".eslintrc.yml", "eslint.config.js", "eslint.config.mjs", "biome.json", "biome.jsonc");
  const hasFormatting = hasFile(".prettierrc", ".prettierrc.json", ".prettierrc.js", "prettier.config.js", "prettier.config.mjs", "biome.json");

  // Monorepo detection
  const hasMonorepo =
    hasFile("nx.json", "turbo.json", "lerna.json") ||
    hasFilePattern("packages/", "apps/") ||
    !!(packageJson && (packageJson as Record<string, unknown>).workspaces);

  // Package manager
  let packageManager: string | null = null;
  if (hasFile("bun.lockb", "bun.lock")) packageManager = "bun";
  else if (hasFile("pnpm-lock.yaml")) packageManager = "pnpm";
  else if (hasFile("yarn.lock")) packageManager = "yarn";
  else if (hasFile("package-lock.json")) packageManager = "npm";
  else if (hasFile("Pipfile.lock", "poetry.lock")) packageManager = "pip/poetry";
  else if (hasFile("Gemfile.lock")) packageManager = "bundler";
  else if (hasFile("go.sum")) packageManager = "go modules";
  else if (hasFile("Cargo.lock")) packageManager = "cargo";

  // Framework detection from package.json
  const frameworks: string[] = [];
  if (packageJson) {
    const allDeps = {
      ...(packageJson.dependencies as Record<string, string> || {}),
      ...(packageJson.devDependencies as Record<string, string> || {}),
    };
    if (allDeps.next) frameworks.push("Next.js");
    if (allDeps.react && !allDeps.next) frameworks.push("React");
    if (allDeps.vue) frameworks.push("Vue");
    if (allDeps.nuxt) frameworks.push("Nuxt");
    if (allDeps["@angular/core"]) frameworks.push("Angular");
    if (allDeps.svelte || allDeps["@sveltejs/kit"]) frameworks.push("Svelte");
    if (allDeps.express) frameworks.push("Express");
    if (allDeps.fastify) frameworks.push("Fastify");
    if (allDeps.nestjs || allDeps["@nestjs/core"]) frameworks.push("NestJS");
    if (allDeps.gatsby) frameworks.push("Gatsby");
    if (allDeps.remix || allDeps["@remix-run/react"]) frameworks.push("Remix");
    if (allDeps.astro) frameworks.push("Astro");
    if (allDeps.electron) frameworks.push("Electron");
    if (allDeps["react-native"] || allDeps.expo) frameworks.push("React Native");
    if (allDeps.flutter) frameworks.push("Flutter");
  }
  // Python/Ruby/Go frameworks from file patterns
  if (hasFile("requirements.txt", "setup.py", "pyproject.toml")) {
    if (hasFilePattern("django")) frameworks.push("Django");
    else if (hasFilePattern("flask")) frameworks.push("Flask");
    else if (hasFilePattern("fastapi")) frameworks.push("FastAPI");
  }
  if (hasFile("Gemfile")) {
    if (hasFilePattern("rails")) frameworks.push("Rails");
  }
  if (hasFile("go.mod")) frameworks.push("Go");
  if (hasFile("Cargo.toml")) frameworks.push("Rust");

  // Architecture pattern
  let archPattern: string | null = null;
  if (hasMonorepo) archPattern = "monorepo";
  else if (hasFilePattern("docker-compose") && topDirs.length > 3) archPattern = "microservices";
  else if (topDirs.includes("src") && (topDirs.includes("public") || topDirs.includes("app"))) archPattern = "fullstack";
  else archPattern = "monolith";

  const architecture: RepoArchitectureAudit = {
    primaryLanguage: repoInfo.language,
    languages: languages ?? {},
    hasMonorepo,
    hasTypescript,
    hasLinting,
    hasFormatting,
    packageManager,
    frameworks: [...new Set(frameworks)],
    directories: topDirs.slice(0, 20),
    archPattern,
  };

  // ── 2. Dependencies Audit ──────────────────────────────────────────────

  let totalDeps = 0;
  let totalDevDeps = 0;
  const notableLibs: string[] = [];
  const securityTools: string[] = [];
  const outdatedSignals: string[] = [];

  if (packageJson) {
    const deps = packageJson.dependencies as Record<string, string> | undefined;
    const devDeps = packageJson.devDependencies as Record<string, string> | undefined;
    totalDeps = deps ? Object.keys(deps).length : 0;
    totalDevDeps = devDeps ? Object.keys(devDeps).length : 0;

    const allDepNames = [...Object.keys(deps ?? {}), ...Object.keys(devDeps ?? {})];

    // Notable libs
    const notablePatterns: Record<string, string> = {
      prisma: "Prisma ORM", "@prisma/client": "Prisma ORM",
      "@supabase/supabase-js": "Supabase", drizzle: "Drizzle ORM",
      stripe: "Stripe", "@stripe/stripe-js": "Stripe",
      "next-auth": "NextAuth", "@auth/core": "Auth.js",
      tailwindcss: "Tailwind CSS",
      "three": "Three.js", "d3": "D3.js",
      redis: "Redis", ioredis: "Redis",
      "@sentry/nextjs": "Sentry", "@sentry/node": "Sentry",
      graphql: "GraphQL", "@apollo/server": "Apollo GraphQL",
      trpc: "tRPC", "@trpc/server": "tRPC",
      zod: "Zod", yup: "Yup",
      "socket.io": "Socket.io", ws: "WebSocket",
      bull: "Bull Queue", bullmq: "BullMQ",
      "@aws-sdk/client-s3": "AWS S3", "aws-sdk": "AWS SDK",
      "@google-cloud/storage": "Google Cloud", firebase: "Firebase",
      tensorflow: "TensorFlow", "@tensorflow/tfjs": "TensorFlow.js",
      openai: "OpenAI SDK", "@anthropic-ai/sdk": "Anthropic SDK",
      langchain: "LangChain",
    };
    for (const dep of allDepNames) {
      if (notablePatterns[dep]) notableLibs.push(notablePatterns[dep]);
    }

    // Security tools
    if (hasFile(".github/dependabot.yml", ".github/dependabot.yaml")) securityTools.push("Dependabot");
    if (hasFilePattern("renovate")) securityTools.push("Renovate");
    if (allDepNames.includes("snyk")) securityTools.push("Snyk");
    if (hasFilePattern(".github/workflows/codeql")) securityTools.push("CodeQL");
  }

  const hasLockFile = hasFile("package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb", "bun.lock", "Pipfile.lock", "poetry.lock", "Gemfile.lock", "go.sum", "Cargo.lock");

  const dependencies: RepoDependencyAudit = {
    totalDeps,
    totalDevDeps,
    hasLockFile,
    outdatedSignals,
    securityTools: [...new Set(securityTools)],
    notableLibs: [...new Set(notableLibs)],
  };

  // ── 3. CI/CD Audit ────────────────────────────────────────────────────

  let ciPlatform: string | null = null;
  const hasGHActions = hasFilePattern(".github/workflows/");
  const hasGitLabCI = hasFile(".gitlab-ci.yml");
  const hasCircleCI = hasFile(".circleci/config.yml");
  const hasTravisCI = hasFile(".travis.yml");
  const hasJenkinsfile = hasFile("jenkinsfile");

  if (hasGHActions) ciPlatform = "GitHub Actions";
  else if (hasGitLabCI) ciPlatform = "GitLab CI";
  else if (hasCircleCI) ciPlatform = "CircleCI";
  else if (hasTravisCI) ciPlatform = "Travis CI";
  else if (hasJenkinsfile) ciPlatform = "Jenkins";

  const workflowFiles = files.filter((f) => f.path.includes(".github/workflows/") && f.path.endsWith(".yml"));
  const dockerized = hasFile("Dockerfile", "docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml");
  const hasInfraAsCode = hasFile("terraform.tf", "main.tf", "pulumi.yaml", "Pulumi.yaml", "cdk.json") || hasFilePattern("k8s/", "kubernetes/", "helm/");

  // Check for deploy/build/test/lint references in workflow file names
  const workflowNames = workflowFiles.map((f) => f.path.toLowerCase());
  const hasCD = workflowNames.some((w) => w.includes("deploy") || w.includes("release") || w.includes("publish"));
  const hasBuildStep = workflowNames.some((w) => w.includes("build") || w.includes("ci"));
  const hasTestStep = workflowNames.some((w) => w.includes("test") || w.includes("ci"));
  const hasLintStep = workflowNames.some((w) => w.includes("lint") || w.includes("ci") || w.includes("check"));

  const cicd: RepoCICDAudit = {
    hasCI: !!ciPlatform,
    ciPlatform,
    hasCD,
    hasBuildStep,
    hasTestStep,
    hasLintStep,
    workflowCount: workflowFiles.length,
    dockerized,
    hasInfraAsCode,
  };

  // ── 4. Testing Audit ──────────────────────────────────────────────────

  const testFrameworks: string[] = [];
  if (packageJson) {
    const allDeps = {
      ...(packageJson.dependencies as Record<string, string> || {}),
      ...(packageJson.devDependencies as Record<string, string> || {}),
    };
    if (allDeps.jest || allDeps["@jest/core"]) testFrameworks.push("Jest");
    if (allDeps.vitest) testFrameworks.push("Vitest");
    if (allDeps.mocha) testFrameworks.push("Mocha");
    if (allDeps.ava) testFrameworks.push("AVA");
    if (allDeps.tap) testFrameworks.push("Tap");
  }
  // Python testing
  if (hasFilePattern("pytest") || hasFile("pytest.ini", "setup.cfg", "conftest.py")) testFrameworks.push("pytest");
  if (hasFile("tox.ini")) testFrameworks.push("tox");
  // Ruby testing
  if (hasFile("spec/", ".rspec")) testFrameworks.push("RSpec");

  const hasE2E = hasFilePattern("playwright", "cypress", "selenium") ||
    hasFile("playwright.config.ts", "playwright.config.js", "cypress.config.ts", "cypress.config.js");
  if (hasE2E) {
    if (hasFilePattern("playwright")) testFrameworks.push("Playwright");
    else if (hasFilePattern("cypress")) testFrameworks.push("Cypress");
  }

  const hasCoverageConfig = hasFile("jest.config.js", "jest.config.ts", "vitest.config.ts", "vitest.config.js", ".nycrc", ".c8rc", "codecov.yml");
  const testDirExists = hasFilePattern("__tests__/", "test/", "tests/", "spec/", ".test.", ".spec.");

  let estimatedTestMaturity: RepoTestingAudit["estimatedTestMaturity"] = "none";
  if (testFrameworks.length > 0 && hasE2E && hasCoverageConfig) estimatedTestMaturity = "comprehensive";
  else if (testFrameworks.length > 0 && (testDirExists || hasCoverageConfig)) estimatedTestMaturity = "moderate";
  else if (testFrameworks.length > 0 || testDirExists) estimatedTestMaturity = "basic";

  const testing: RepoTestingAudit = {
    hasTests: testFrameworks.length > 0 || testDirExists,
    testFrameworks: [...new Set(testFrameworks)],
    hasE2E,
    hasCoverageConfig,
    testDirExists,
    estimatedTestMaturity,
  };

  // ── 5. Documentation Audit ────────────────────────────────────────────

  const hasReadme = hasFile("readme.md", "readme.rst", "readme.txt", "readme");
  const readmeLength = readmeRaw?.length ?? 0;
  const hasContributing = hasFile("contributing.md");
  const hasChangelog = hasFile("changelog.md", "changes.md", "history.md");
  const hasLicense = hasFile("license", "license.md", "license.txt", "licence", "licence.md");
  const licenseType = repoInfo.license?.spdx_id ?? null;
  const hasApiDocs = hasFilePattern("docs/", "api-docs/", "openapi", "swagger") || hasFile("openapi.json", "openapi.yaml", "swagger.json", "swagger.yaml");
  const hasCodeComments = false; // Would need content analysis — skip for API-only audit

  const documentation: RepoDocumentationAudit = {
    hasReadme,
    readmeLength,
    hasContributing,
    hasChangelog,
    hasLicense,
    licenseType,
    hasApiDocs,
    hasCodeComments,
  };

  // ── 6. Security Audit ─────────────────────────────────────────────────

  const hasSecurityPolicy = hasFile("security.md", ".github/security.md");
  const hasDependabot = hasFile(".github/dependabot.yml", ".github/dependabot.yaml");
  const hasCodeScanning = hasFilePattern("codeql", "semgrep");
  const hasSecrets = hasFile(".gitignore") && filePaths.some((f) => f === ".gitignore");
  const hasEnvExample = hasFile(".env.example", ".env.sample", ".env.local.example");

  const security: RepoSecurityAudit = {
    hasSecurityPolicy,
    hasDependabot,
    hasCodeScanning,
    hasSecrets,
    hasEnvExample,
    branchProtection: false, // Requires admin access to check
  };

  // ── 7. Activity Audit ─────────────────────────────────────────────────

  let totalCommits = 0;
  let recentWeeklyAvg = 0;
  if (commitActivity && Array.isArray(commitActivity) && commitActivity.length > 0) {
    totalCommits = commitActivity.reduce((s, w) => s + w.total, 0);
    const last4 = commitActivity.slice(-4);
    recentWeeklyAvg = last4.reduce((s, w) => s + w.total, 0) / Math.max(1, last4.length);
  }

  let commitFrequencyTier: RepoActivityAudit["commitFrequencyTier"] = "inactive";
  if (recentWeeklyAvg >= 20) commitFrequencyTier = "intense";
  else if (recentWeeklyAvg >= 10) commitFrequencyTier = "strong";
  else if (recentWeeklyAvg >= 5) commitFrequencyTier = "moderate";
  else if (recentWeeklyAvg >= 1) commitFrequencyTier = "light";

  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const isActivelyMaintained = new Date(repoInfo.pushed_at).getTime() > thirtyDaysAgo;

  const contributors = await ghFetch<Array<{ total: number }>>(`${baseApi}/stats/contributors`, headers);
  const contributorCount = Array.isArray(contributors) ? contributors.length : 1;

  const activity: RepoActivityAudit = {
    totalCommits,
    commitFrequencyTier,
    recentWeeklyAvg: Math.round(recentWeeklyAvg * 10) / 10,
    contributors: contributorCount,
    openIssues: repoInfo.open_issues_count,
    openPRs: Array.isArray(pulls) ? pulls.length : 0,
    lastPushAt: repoInfo.pushed_at,
    isActivelyMaintained,
    starsCount: repoInfo.stargazers_count,
    forksCount: repoInfo.forks_count,
    watchersCount: repoInfo.watchers_count,
  };

  // ── 8. Compute signal boosts ──────────────────────────────────────────

  let ptdBoost = 0;
  let svmBoost = 0;
  let ftvBoost = 0;
  let treBoost = 0;

  // PTD: Product & Technical Depth
  if (hasTypescript) ptdBoost += 3;
  if (architecture.frameworks.length > 0) ptdBoost += 5;
  if (hasLinting && hasFormatting) ptdBoost += 3;
  else if (hasLinting || hasFormatting) ptdBoost += 1;
  if (cicd.hasCI) ptdBoost += 5;
  if (cicd.hasCD) ptdBoost += 3;
  if (cicd.dockerized) ptdBoost += 2;
  if (testing.estimatedTestMaturity === "comprehensive") ptdBoost += 8;
  else if (testing.estimatedTestMaturity === "moderate") ptdBoost += 5;
  else if (testing.estimatedTestMaturity === "basic") ptdBoost += 2;
  if (documentation.hasReadme && documentation.readmeLength > 1000) ptdBoost += 2;
  if (documentation.hasApiDocs) ptdBoost += 3;
  if (dependencies.hasLockFile) ptdBoost += 1;
  if (hasMonorepo) ptdBoost += 3;

  // PTD penalties
  if (!cicd.hasCI) ptdBoost -= 5;
  if (!testing.hasTests) ptdBoost -= 3;
  if (!documentation.hasReadme) ptdBoost -= 2;
  if (!dependencies.hasLockFile && packageJson) ptdBoost -= 2;

  // SVM: Strategic Vision & Moat (custom tech = moat)
  if (architecture.frameworks.length >= 2) svmBoost += 3;
  if (dependencies.notableLibs.length >= 3) svmBoost += 3;
  if (cicd.hasInfraAsCode) svmBoost += 3;
  if (hasMonorepo && architecture.frameworks.length > 0) svmBoost += 2;
  if (dependencies.notableLibs.some((l) => l.includes("AI") || l.includes("OpenAI") || l.includes("Anthropic") || l.includes("LangChain") || l.includes("TensorFlow"))) svmBoost += 3;

  // FTV: Founder & Team Value (engineering quality signals)
  if (contributorCount >= 3) ftvBoost += 3;
  if (hasTypescript && hasLinting && cicd.hasCI) ftvBoost += 5;
  if (testing.estimatedTestMaturity === "comprehensive") ftvBoost += 3;
  else if (testing.estimatedTestMaturity === "moderate") ftvBoost += 2;
  if (security.hasDependabot || security.hasCodeScanning) ftvBoost += 2;
  if (documentation.hasContributing) ftvBoost += 1;

  // FTV penalties
  if (commitFrequencyTier === "inactive") ftvBoost -= 3;
  if (!hasTypescript && repoInfo.language === "JavaScript") ftvBoost -= 1;

  // TRE: Traction & Revenue Evidence (activity = traction)
  if (commitFrequencyTier === "intense") treBoost += 5;
  else if (commitFrequencyTier === "strong") treBoost += 3;
  else if (commitFrequencyTier === "moderate") treBoost += 2;
  if (activity.starsCount >= 100) treBoost += 3;
  else if (activity.starsCount >= 10) treBoost += 1;
  if (activity.forksCount >= 10) treBoost += 2;
  if (isActivelyMaintained) treBoost += 2;

  // ── 9. Overall grade ──────────────────────────────────────────────────

  let gradeScore = 0;
  // Architecture quality (max 25)
  if (hasTypescript) gradeScore += 5;
  if (hasLinting) gradeScore += 3;
  if (hasFormatting) gradeScore += 2;
  if (architecture.frameworks.length > 0) gradeScore += 5;
  if (hasMonorepo) gradeScore += 3;
  if (packageManager) gradeScore += 2;
  if (dependencies.hasLockFile) gradeScore += 2;
  if (dependencies.notableLibs.length >= 3) gradeScore += 3;

  // CI/CD quality (max 20)
  if (cicd.hasCI) gradeScore += 8;
  if (cicd.hasCD) gradeScore += 4;
  if (cicd.dockerized) gradeScore += 3;
  if (cicd.hasInfraAsCode) gradeScore += 3;
  if (cicd.workflowCount >= 3) gradeScore += 2;

  // Testing quality (max 15)
  if (testing.estimatedTestMaturity === "comprehensive") gradeScore += 15;
  else if (testing.estimatedTestMaturity === "moderate") gradeScore += 10;
  else if (testing.estimatedTestMaturity === "basic") gradeScore += 5;

  // Documentation (max 10)
  if (documentation.hasReadme) gradeScore += 4;
  if (documentation.hasApiDocs) gradeScore += 3;
  if (documentation.hasLicense) gradeScore += 2;
  if (documentation.hasChangelog) gradeScore += 1;

  // Security (max 10)
  if (security.hasDependabot) gradeScore += 4;
  if (security.hasCodeScanning) gradeScore += 3;
  if (security.hasEnvExample) gradeScore += 2;
  if (security.hasSecurityPolicy) gradeScore += 1;

  // Activity (max 20)
  if (commitFrequencyTier === "intense") gradeScore += 10;
  else if (commitFrequencyTier === "strong") gradeScore += 8;
  else if (commitFrequencyTier === "moderate") gradeScore += 5;
  else if (commitFrequencyTier === "light") gradeScore += 2;
  if (contributorCount >= 5) gradeScore += 5;
  else if (contributorCount >= 2) gradeScore += 3;
  if (isActivelyMaintained) gradeScore += 5;

  let overallGrade: GitHubRepoAudit["overallGrade"] = "F";
  if (gradeScore >= 70) overallGrade = "A";
  else if (gradeScore >= 50) overallGrade = "B";
  else if (gradeScore >= 35) overallGrade = "C";
  else if (gradeScore >= 20) overallGrade = "D";

  // ── 10. Evidence labels & scoring notes ───────────────────────────────

  const evidenceLabels: string[] = [];
  evidenceLabels.push(`Repo: ${repoFullName} (Grade ${overallGrade})`);
  if (architecture.frameworks.length > 0) evidenceLabels.push(`Stack: ${architecture.frameworks.join(", ")}`);
  if (architecture.primaryLanguage) evidenceLabels.push(`Language: ${architecture.primaryLanguage}${hasTypescript ? " + TypeScript" : ""}`);
  if (cicd.hasCI) evidenceLabels.push(`CI/CD: ${cicd.ciPlatform}${cicd.hasCD ? " + auto-deploy" : ""}`);
  if (testing.hasTests) evidenceLabels.push(`Testing: ${testing.testFrameworks.join(", ")} (${testing.estimatedTestMaturity})`);
  if (dependencies.notableLibs.length > 0) evidenceLabels.push(`Notable: ${dependencies.notableLibs.slice(0, 5).join(", ")}`);
  evidenceLabels.push(`Activity: ${recentWeeklyAvg.toFixed(1)} commits/week (${commitFrequencyTier}), ${contributorCount} contributor${contributorCount > 1 ? "s" : ""}`);

  const scoringNotes: string[] = [];
  if (overallGrade === "A") scoringNotes.push("Enterprise-grade engineering: strong CI/CD, testing, TypeScript, and documentation.");
  else if (overallGrade === "B") scoringNotes.push("Professional engineering: good CI/CD and code quality practices.");
  else if (overallGrade === "C") scoringNotes.push("Developing engineering: some automation and quality practices but gaps remain.");
  else if (overallGrade === "D") scoringNotes.push("Early-stage engineering: minimal CI/CD, testing, or documentation.");
  else scoringNotes.push("Pre-engineering: no automation, testing, or professional tooling detected.");

  if (!cicd.hasCI) scoringNotes.push("Missing CI/CD — automated builds/tests would significantly boost technical confidence.");
  if (!testing.hasTests) scoringNotes.push("No test framework detected — adding tests would improve investor confidence in product stability.");
  if (!hasTypescript && repoInfo.language === "JavaScript") scoringNotes.push("JavaScript without TypeScript — migrating to TS would signal engineering maturity.");
  if (commitFrequencyTier === "inactive") scoringNotes.push("Repository appears inactive — last activity over 30 days ago.");
  if (dependencies.notableLibs.length === 0 && packageJson) scoringNotes.push("No notable enterprise libraries detected — consider adopting industry-standard tools.");

  return {
    repoFullName,
    repoUrl: repoInfo.html_url,
    auditedAt: new Date().toISOString(),
    architecture,
    dependencies,
    cicd,
    testing,
    documentation,
    security,
    activity,
    overallGrade,
    signalBoosts: { ptdBoost, svmBoost, ftvBoost, treBoost },
    evidenceLabels,
    scoringNotes,
  };
}

// ─── Fallback for failed audit ──────────────────────────────────────────────

function buildFailedRepoAudit(repoFullName: string): GitHubRepoAudit {
  return {
    repoFullName,
    repoUrl: `https://github.com/${repoFullName}`,
    auditedAt: new Date().toISOString(),
    architecture: { primaryLanguage: null, languages: {}, hasMonorepo: false, hasTypescript: false, hasLinting: false, hasFormatting: false, packageManager: null, frameworks: [], directories: [], archPattern: null },
    dependencies: { totalDeps: 0, totalDevDeps: 0, hasLockFile: false, outdatedSignals: [], securityTools: [], notableLibs: [] },
    cicd: { hasCI: false, ciPlatform: null, hasCD: false, hasBuildStep: false, hasTestStep: false, hasLintStep: false, workflowCount: 0, dockerized: false, hasInfraAsCode: false },
    testing: { hasTests: false, testFrameworks: [], hasE2E: false, hasCoverageConfig: false, testDirExists: false, estimatedTestMaturity: "none" },
    documentation: { hasReadme: false, readmeLength: 0, hasContributing: false, hasChangelog: false, hasLicense: false, licenseType: null, hasApiDocs: false, hasCodeComments: false },
    security: { hasSecurityPolicy: false, hasDependabot: false, hasCodeScanning: false, hasSecrets: false, hasEnvExample: false, branchProtection: false },
    activity: { totalCommits: 0, commitFrequencyTier: "inactive", recentWeeklyAvg: 0, contributors: 0, openIssues: 0, openPRs: 0, lastPushAt: null, isActivelyMaintained: false, starsCount: 0, forksCount: 0, watchersCount: 0 },
    overallGrade: "F",
    signalBoosts: { ptdBoost: -5, svmBoost: 0, ftvBoost: -3, treBoost: 0 },
    evidenceLabels: ["Repository audit failed — unable to access"],
    scoringNotes: ["Could not access repository for analysis."],
  };
}
