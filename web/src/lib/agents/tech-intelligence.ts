// src/lib/agents/tech-intelligence.ts
//
// Tech Intelligence agent — analyses a startup's website URL and optional
// GitHub repository URL, produces a structured TechScore (0–100), and feeds
// an additive contribution into the SVI (Startup Value Index).
//
// Design principles:
//   • No third-party HTML parsers — plain fetch + regex/string parsing only.
//   • GitHub REST API public endpoints (no auth required for public repos).
//   • All LLM calls routed through callAI() — never raw Anthropic fetch.
//   • Graceful fallbacks everywhere — never throws to the caller.
//   • TechScore is ADDITIVE to SVI, not replacing any existing dimension.

import { callAI } from "@/lib/ai-client";

// ─── Signal interfaces ────────────────────────────────────────────────────

export interface WebsiteSignals {
  loads: boolean;          // HTTP 200?
  hasSSL: boolean;         // https://
  hasMeta: boolean;        // og:title or description present in HTML
  hasAnalytics: boolean;   // GA4/GTM script detected
  hasPricing: boolean;     // "pricing" page or section detected
  hasContact: boolean;     // contact/about page detected
  wordCount: number;       // approximate body text word count
  loadTimeMs: number;      // time to first byte (fetch duration)
  techStack: string[];     // detected from headers/HTML
}

export interface GitHubSignals {
  exists: boolean;
  stars: number;
  forks: number;
  openIssues: number;
  language: string;        // primary language
  languages: string[];     // all detected languages
  lastCommitDays: number;  // days since last commit to default branch
  commitFrequency: "daily" | "weekly" | "monthly" | "inactive";
  hasReadme: boolean;
  hasTests: boolean;       // test/ or __tests__/ directory detected
  hasCI: boolean;          // .github/workflows/ detected
  repoAgeDays: number;
  license: string | null;
}

export interface TechAssessment {
  techMaturity: number;       // 0-100
  productPresence: number;    // 0-100
  developerActivity: number;  // 0-100
  scalabilityScore: number;   // 0-100
  summary: string;
  strengths: string[];
  gaps: string[];
}

export interface TechIntelligenceResult {
  techScore: number;                  // 0-100 composite
  websiteSignals: WebsiteSignals;
  githubSignals: GitHubSignals | null;
  llmAssessment: TechAssessment;
  sviContribution: number;            // techScore * 0.15 rounded
  valuationMultiplierBoost: number;   // 0 | 5 | 12 | 20 | 25 (%)
  generatedAt: string;                // ISO timestamp
}

// ─── Valuation boost table ────────────────────────────────────────────────

export function getValuationMultiplierBoost(techScore: number): number {
  if (techScore > 90) return 25;
  if (techScore > 75) return 20;
  if (techScore > 60) return 12;
  if (techScore > 40) return 5;
  return 0;
}

// ─── Website scoring (0–100) ──────────────────────────────────────────────

export function computeWebsiteScore(ws: WebsiteSignals): number {
  if (!ws.loads) return 0;

  let score = 30; // base for loading at all
  if (ws.hasSSL) score += 15;
  if (ws.hasMeta) score += 10;
  if (ws.hasAnalytics) score += 10;
  if (ws.hasPricing) score += 15;
  if (ws.hasContact) score += 5;

  // Word count: more content = more mature product
  if (ws.wordCount > 1000) score += 10;
  else if (ws.wordCount > 300) score += 5;

  // Tech stack sophistication
  if (ws.techStack.length >= 3) score += 5;

  return Math.min(100, score);
}

// ─── GitHub scoring (0–100) ───────────────────────────────────────────────

export function computeGitHubScore(gh: GitHubSignals): number {
  if (!gh.exists) return 0;

  let score = 20; // base for existing repo

  // Activity
  if (gh.commitFrequency === "daily") score += 25;
  else if (gh.commitFrequency === "weekly") score += 18;
  else if (gh.commitFrequency === "monthly") score += 10;
  else score += 0; // inactive

  // Quality signals
  if (gh.hasCI) score += 15;
  if (gh.hasTests) score += 15;
  if (gh.hasReadme) score += 5;
  if (gh.license) score += 5;

  // Community
  const starBonus = Math.min(10, Math.floor(gh.stars / 10));
  score += starBonus;

  return Math.min(100, score);
}

// ─── Composite tech score ─────────────────────────────────────────────────

export function computeTechScore(
  website: WebsiteSignals,
  github: GitHubSignals | null,
  llm: TechAssessment,
): number {
  const websiteScore = computeWebsiteScore(website);
  const githubScore = github ? computeGitHubScore(github) : null;
  const llmScore =
    (llm.techMaturity + llm.productPresence + llm.developerActivity + llm.scalabilityScore) / 4;

  if (githubScore !== null) {
    return Math.round(websiteScore * 0.3 + githubScore * 0.3 + llmScore * 0.4);
  }
  // No GitHub: rebalance to website 40% + LLM 60%
  return Math.round(websiteScore * 0.4 + llmScore * 0.6);
}

// ─── HTML helper: strip tags and count words ─────────────────────────────

function stripTagsAndCount(html: string): number {
  // Remove scripts/styles first
  const noScript = html.replace(/<script[\s\S]*?<\/script>/gi, " ");
  const noStyle = noScript.replace(/<style[\s\S]*?<\/style>/gi, " ");
  // Strip remaining tags
  const text = noStyle.replace(/<[^>]*>/g, " ");
  const words = text
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w.length > 0);
  return words.length;
}

// ─── Tech stack detection from HTML + headers ─────────────────────────────

function detectTechStack(html: string, headers: Record<string, string>): string[] {
  const stack: string[] = [];
  const lower = html.toLowerCase();

  // Next.js
  if (html.includes("__NEXT_DATA__") || html.includes("_next/")) stack.push("Next.js");
  // React
  if (lower.includes("react") && !stack.includes("Next.js")) stack.push("React");
  // Vercel
  if ((headers["x-vercel-id"] || headers["server"] === "Vercel") || lower.includes("vercel")) stack.push("Vercel");
  // Stripe
  if (lower.includes("stripe") || lower.includes("js.stripe.com")) stack.push("Stripe");
  // Shopify
  if (lower.includes("shopify") || lower.includes("cdn.shopify.com")) stack.push("Shopify");
  // WordPress
  if (lower.includes("wp-content") || lower.includes("wp-includes")) stack.push("WordPress");
  // Wix
  if (lower.includes("wix.com") || lower.includes("wixstatic")) stack.push("Wix");
  // Squarespace
  if (lower.includes("squarespace") || lower.includes("sqsp")) stack.push("Squarespace");
  // Webflow
  if (lower.includes("webflow") || lower.includes("wf-form")) stack.push("Webflow");
  // Tailwind
  if (lower.includes("tailwind") || lower.includes("tw-")) stack.push("Tailwind CSS");
  // Intercom
  if (lower.includes("intercom")) stack.push("Intercom");
  // Crisp / Zendesk chat
  if (lower.includes("crisp.chat")) stack.push("Crisp");
  if (lower.includes("zdassets") || lower.includes("zendesk")) stack.push("Zendesk");
  // Cloudflare
  if (headers["server"]?.toLowerCase().includes("cloudflare") || lower.includes("cloudflare")) stack.push("Cloudflare");
  // AWS
  if (headers["server"]?.toLowerCase().includes("awselb") || lower.includes("amazonaws.com")) stack.push("AWS");

  return [...new Set(stack)];
}

// ─── Website analysis ─────────────────────────────────────────────────────

export async function analyseWebsite(rawUrl: string): Promise<WebsiteSignals> {
  const blank: WebsiteSignals = {
    loads: false,
    hasSSL: false,
    hasMeta: false,
    hasAnalytics: false,
    hasPricing: false,
    hasContact: false,
    wordCount: 0,
    loadTimeMs: 0,
    techStack: [],
  };

  let url: string;
  try {
    const parsed = new URL(rawUrl);
    url = parsed.toString();
    blank.hasSSL = parsed.protocol === "https:";
  } catch {
    return blank;
  }

  const start = Date.now();
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: {
        "User-Agent": "BlockID-TechIntelligence/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });

    const loadTimeMs = Date.now() - start;

    if (!res.ok) {
      return { ...blank, loadTimeMs };
    }

    const html = await res.text();
    const lowerHtml = html.toLowerCase();

    // SSL from final URL after redirects
    try {
      const finalUrl = new URL(res.url);
      blank.hasSSL = finalUrl.protocol === "https:";
    } catch { /* keep original */ }

    // Meta tags
    const hasMeta =
      /<meta[^>]+property=["']og:title["']/i.test(html) ||
      /<meta[^>]+name=["']description["']/i.test(html);

    // Analytics
    const hasAnalytics =
      lowerHtml.includes("gtag") ||
      lowerHtml.includes("google-analytics") ||
      lowerHtml.includes("googletagmanager") ||
      /G-[A-Z0-9]{10}/i.test(html) ||
      lowerHtml.includes("gtm.js") ||
      lowerHtml.includes("segment.com") ||
      lowerHtml.includes("mixpanel") ||
      lowerHtml.includes("amplitude");

    // Pricing
    const hasPricing =
      /href=["'][^"']*pricing["']/i.test(html) ||
      lowerHtml.includes("/pricing") ||
      /<[^>]+>pricing<\//i.test(html) ||
      lowerHtml.includes("per month") ||
      lowerHtml.includes("/mo") ||
      lowerHtml.includes("per user");

    // Contact / about
    const hasContact =
      /href=["'][^"']*contact["']/i.test(html) ||
      /href=["'][^"']*about["']/i.test(html) ||
      lowerHtml.includes("/contact") ||
      lowerHtml.includes("/about");

    // Word count from body
    const bodyMatch = html.match(/<body[\s\S]*?<\/body>/i);
    const bodyHtml = bodyMatch ? bodyMatch[0] : html;
    const wordCount = stripTagsAndCount(bodyHtml);

    // Tech stack
    const headersObj: Record<string, string> = {};
    res.headers.forEach((val, key) => { headersObj[key.toLowerCase()] = val; });
    const techStack = detectTechStack(html, headersObj);

    return {
      loads: true,
      hasSSL: blank.hasSSL,
      hasMeta,
      hasAnalytics,
      hasPricing,
      hasContact,
      wordCount,
      loadTimeMs,
      techStack,
    };
  } catch {
    return { ...blank, loadTimeMs: Date.now() - start };
  }
}

// ─── GitHub analysis ──────────────────────────────────────────────────────

function parseGitHubOwnerRepo(rawUrl: string): { owner: string; repo: string } | null {
  try {
    const url = new URL(rawUrl);
    if (!url.hostname.includes("github.com")) return null;
    const parts = url.pathname.replace(/^\//, "").split("/");
    if (parts.length < 2) return null;
    return { owner: parts[0], repo: parts[1].replace(/\.git$/, "") };
  } catch {
    return null;
  }
}

function daysSince(dateStr: string): number {
  try {
    const then = new Date(dateStr).getTime();
    const now = Date.now();
    return Math.floor((now - then) / (1000 * 60 * 60 * 24));
  } catch {
    return 9999;
  }
}

function toCommitFrequency(days: number): GitHubSignals["commitFrequency"] {
  if (days <= 1) return "daily";
  if (days <= 7) return "weekly";
  if (days <= 30) return "monthly";
  return "inactive";
}

async function githubFetch(path: string): Promise<Response> {
  return fetch(`https://api.github.com${path}`, {
    signal: AbortSignal.timeout(8_000),
    headers: {
      "User-Agent": "BlockID-Analysis/1.0",
      Accept: "application/vnd.github.v3+json",
    },
  });
}

export async function analyseGitHub(rawUrl: string): Promise<GitHubSignals | null> {
  const parsed = parseGitHubOwnerRepo(rawUrl);
  if (!parsed) return null;

  const { owner, repo } = parsed;
  const blank: GitHubSignals = {
    exists: false,
    stars: 0,
    forks: 0,
    openIssues: 0,
    language: "Unknown",
    languages: [],
    lastCommitDays: 9999,
    commitFrequency: "inactive",
    hasReadme: false,
    hasTests: false,
    hasCI: false,
    repoAgeDays: 0,
    license: null,
  };

  try {
    // 1. Repo metadata
    const repoRes = await githubFetch(`/repos/${owner}/${repo}`);
    if (!repoRes.ok) return { ...blank };

    const repoData = await repoRes.json() as {
      stargazers_count?: number;
      forks_count?: number;
      open_issues_count?: number;
      language?: string | null;
      created_at?: string;
      default_branch?: string;
      license?: { name?: string } | null;
    };

    const stars = repoData.stargazers_count ?? 0;
    const forks = repoData.forks_count ?? 0;
    const openIssues = repoData.open_issues_count ?? 0;
    const language = repoData.language ?? "Unknown";
    const license = repoData.license?.name ?? null;
    const repoAgeDays = repoData.created_at ? daysSince(repoData.created_at) : 0;
    const defaultBranch = repoData.default_branch ?? "main";

    // 2. Last commit
    let lastCommitDays = 9999;
    try {
      const commitsRes = await githubFetch(`/repos/${owner}/${repo}/commits?per_page=1&sha=${defaultBranch}`);
      if (commitsRes.ok) {
        const commits = await commitsRes.json() as Array<{ commit?: { author?: { date?: string } } }>;
        if (commits.length > 0) {
          const dateStr = commits[0].commit?.author?.date;
          if (dateStr) lastCommitDays = daysSince(dateStr);
        }
      }
    } catch { /* keep 9999 */ }

    // 3. Languages list
    let languages: string[] = language !== "Unknown" ? [language] : [];
    try {
      const langsRes = await githubFetch(`/repos/${owner}/${repo}/languages`);
      if (langsRes.ok) {
        const langsData = await langsRes.json() as Record<string, number>;
        languages = Object.keys(langsData);
      }
    } catch { /* keep from primary language */ }

    // 4. Root contents (README, CI, tests)
    let hasReadme = false;
    let hasTests = false;
    let hasCI = false;
    try {
      const contentsRes = await githubFetch(`/repos/${owner}/${repo}/contents`);
      if (contentsRes.ok) {
        const contents = await contentsRes.json() as Array<{ name?: string; type?: string }>;
        for (const item of contents) {
          const name = (item.name ?? "").toLowerCase();
          if (name.startsWith("readme")) hasReadme = true;
          if (name === "test" || name === "__tests__" || name === "tests" || name === "spec" || name === "__test__") hasTests = true;
          if (name === ".github") hasCI = true; // will check workflows sub-dir below
        }
        // If .github found, check if workflows exist
        if (hasCI) {
          try {
            const wfRes = await githubFetch(`/repos/${owner}/${repo}/contents/.github/workflows`);
            hasCI = wfRes.ok;
          } catch { hasCI = false; }
        }
      }
    } catch { /* keep false */ }

    return {
      exists: true,
      stars,
      forks,
      openIssues,
      language,
      languages,
      lastCommitDays,
      commitFrequency: toCommitFrequency(lastCommitDays),
      hasReadme,
      hasTests,
      hasCI,
      repoAgeDays,
      license,
    };
  } catch {
    return { ...blank };
  }
}

// ─── LLM assessment ───────────────────────────────────────────────────────

function deterministicFallbackAssessment(website: WebsiteSignals, github: GitHubSignals | null): TechAssessment {
  const ws = computeWebsiteScore(website);
  const gh = github ? computeGitHubScore(github) : 0;
  const base = github ? Math.round((ws + gh) / 2) : ws;

  const techMaturity = base;
  const productPresence = ws;
  const developerActivity = github ? computeGitHubScore(github) : Math.round(ws * 0.5);
  const scalabilityScore = website.techStack.includes("Next.js") || website.techStack.includes("Vercel") || website.techStack.includes("AWS")
    ? Math.min(100, base + 10)
    : base;

  const strengths: string[] = [];
  const gaps: string[] = [];

  if (website.hasSSL) strengths.push("HTTPS enforced");
  if (website.hasAnalytics) strengths.push("Analytics instrumented");
  if (website.hasPricing) strengths.push("Pricing page present");
  if (github?.hasCI) strengths.push("CI/CD pipeline configured");
  if (github?.hasTests) strengths.push("Automated test suite present");

  if (!website.loads) gaps.push("Website is unreachable");
  if (!website.hasAnalytics) gaps.push("No analytics detected");
  if (!website.hasPricing) gaps.push("No pricing page detected");
  if (!github) gaps.push("No public GitHub repository");
  else if (github.commitFrequency === "inactive") gaps.push("Repository appears inactive");

  const summary = `Tech assessment computed from website signals (score ${ws}/100)${github ? ` and GitHub signals (score ${computeGitHubScore(github)}/100)` : ""}. LLM assessment unavailable — using deterministic fallback.`;

  return {
    techMaturity: Math.min(100, techMaturity),
    productPresence: Math.min(100, productPresence),
    developerActivity: Math.min(100, developerActivity),
    scalabilityScore: Math.min(100, scalabilityScore),
    summary,
    strengths: strengths.slice(0, 3),
    gaps: gaps.slice(0, 3),
  };
}

function tryParseJSON<T>(raw: string): T | null {
  if (!raw) return null;
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(stripped) as T;
  } catch {
    const match = stripped.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return null;
    }
  }
}

export async function runLLMAssessment(
  website: WebsiteSignals,
  github: GitHubSignals | null,
  startupName: string,
  sector: string | undefined,
): Promise<TechAssessment> {
  const websiteSummary = [
    `Loads: ${website.loads}`,
    `SSL: ${website.hasSSL}`,
    `Meta tags: ${website.hasMeta}`,
    `Analytics: ${website.hasAnalytics}`,
    `Pricing page: ${website.hasPricing}`,
    `Contact page: ${website.hasContact}`,
    `Word count: ~${website.wordCount}`,
    `Load time: ${website.loadTimeMs}ms`,
    `Tech stack detected: ${website.techStack.join(", ") || "none"}`,
  ].join("\n");

  const githubSummary = github
    ? [
        `Exists: ${github.exists}`,
        `Stars: ${github.stars}`,
        `Forks: ${github.forks}`,
        `Primary language: ${github.language}`,
        `Languages: ${github.languages.join(", ")}`,
        `Last commit: ${github.lastCommitDays} days ago (${github.commitFrequency})`,
        `Has README: ${github.hasReadme}`,
        `Has tests: ${github.hasTests}`,
        `Has CI/CD: ${github.hasCI}`,
        `Repo age: ${github.repoAgeDays} days`,
        `License: ${github.license ?? "none"}`,
      ].join("\n")
    : "No GitHub repository provided.";

  const system =
    "You are a CTO advisor assessing startup tech quality. Respond with valid JSON only, no markdown code fences.";

  const user =
    `Startup: ${startupName}\n` +
    (sector ? `Sector: ${sector}\n` : "") +
    `\n=== Website Signals ===\n${websiteSummary}\n` +
    `\n=== GitHub Signals ===\n${githubSummary}\n` +
    `\nBased on these signals, assess the startup's technical quality.\n` +
    `Return a single JSON object with these fields:\n` +
    `- techMaturity (number 0-100): how mature/production-ready is the tech?\n` +
    `- productPresence (number 0-100): how strong is the online product presence?\n` +
    `- developerActivity (number 0-100): how active is the development?\n` +
    `- scalabilityScore (number 0-100): does the tech stack suggest scalability?\n` +
    `- summary (string): 2-3 sentence plain-English tech assessment\n` +
    `- strengths (array of 3 strings): top 3 tech strengths\n` +
    `- gaps (array of 3 strings): top 3 tech gaps or risks\n` +
    `JSON only, no extra text.`;

  try {
    const result = await callAI({ system, user, maxTokens: 1000, temperature: 0.3 });
    const parsed = tryParseJSON<Partial<TechAssessment>>(result.text);

    if (
      !parsed ||
      typeof parsed.techMaturity !== "number" ||
      typeof parsed.productPresence !== "number" ||
      typeof parsed.developerActivity !== "number" ||
      typeof parsed.scalabilityScore !== "number" ||
      typeof parsed.summary !== "string" ||
      !Array.isArray(parsed.strengths) ||
      !Array.isArray(parsed.gaps)
    ) {
      return deterministicFallbackAssessment(website, github);
    }

    const clamp01 = (v: number) => Math.min(100, Math.max(0, Math.round(v)));

    return {
      techMaturity: clamp01(parsed.techMaturity),
      productPresence: clamp01(parsed.productPresence),
      developerActivity: clamp01(parsed.developerActivity),
      scalabilityScore: clamp01(parsed.scalabilityScore),
      summary: String(parsed.summary).slice(0, 500),
      strengths: parsed.strengths.slice(0, 3).map(String),
      gaps: parsed.gaps.slice(0, 3).map(String),
    };
  } catch {
    return deterministicFallbackAssessment(website, github);
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────

export async function runTechIntelligence(input: {
  websiteUrl: string;
  githubUrl?: string | null;
  startupName: string;
  sector?: string;
}): Promise<TechIntelligenceResult> {
  // Run website + GitHub analysis concurrently
  const [websiteSignals, githubSignals] = await Promise.all([
    analyseWebsite(input.websiteUrl),
    input.githubUrl ? analyseGitHub(input.githubUrl) : Promise.resolve(null),
  ]);

  // LLM assessment (with fallback built in)
  const llmAssessment = await runLLMAssessment(
    websiteSignals,
    githubSignals,
    input.startupName,
    input.sector,
  );

  const techScore = computeTechScore(websiteSignals, githubSignals, llmAssessment);
  const sviContribution = Math.round(techScore * 0.15);
  const valuationMultiplierBoost = getValuationMultiplierBoost(techScore);

  return {
    techScore,
    websiteSignals,
    githubSignals,
    llmAssessment,
    sviContribution,
    valuationMultiplierBoost,
    generatedAt: new Date().toISOString(),
  };
}
