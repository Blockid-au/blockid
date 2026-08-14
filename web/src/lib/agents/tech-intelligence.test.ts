// Tech Intelligence agent — unit tests
// Run: npx vitest run src/lib/agents/tech-intelligence.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  computeWebsiteScore,
  computeGitHubScore,
  computeTechScore,
  getValuationMultiplierBoost,
  analyseWebsite,
  analyseGitHub,
  runTechIntelligence,
  type WebsiteSignals,
  type GitHubSignals,
  type TechAssessment,
} from "./tech-intelligence";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const STRONG_WEBSITE: WebsiteSignals = {
  loads: true,
  hasSSL: true,
  hasMeta: true,
  hasAnalytics: true,
  hasPricing: true,
  hasContact: true,
  wordCount: 1500,
  loadTimeMs: 300,
  techStack: ["Next.js", "Vercel", "Stripe"],
};

const DEAD_WEBSITE: WebsiteSignals = {
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

const ACTIVE_GITHUB: GitHubSignals = {
  exists: true,
  stars: 50,
  forks: 10,
  openIssues: 5,
  language: "TypeScript",
  languages: ["TypeScript", "JavaScript", "CSS"],
  lastCommitDays: 2,
  commitFrequency: "weekly",
  hasReadme: true,
  hasTests: true,
  hasCI: true,
  repoAgeDays: 365,
  license: "MIT",
};

const INACTIVE_GITHUB: GitHubSignals = {
  exists: true,
  stars: 0,
  forks: 0,
  openIssues: 0,
  language: "Python",
  languages: ["Python"],
  lastCommitDays: 120,
  commitFrequency: "inactive",
  hasReadme: false,
  hasTests: false,
  hasCI: false,
  repoAgeDays: 400,
  license: null,
};

const STRONG_LLM: TechAssessment = {
  techMaturity: 80,
  productPresence: 85,
  developerActivity: 75,
  scalabilityScore: 90,
  summary: "Excellent tech stack with strong CI/CD and testing.",
  strengths: ["CI/CD pipeline", "TypeScript", "Stripe integration"],
  gaps: ["No monitoring", "Low test coverage"],
};

const WEAK_LLM: TechAssessment = {
  techMaturity: 20,
  productPresence: 15,
  developerActivity: 10,
  scalabilityScore: 25,
  summary: "Early stage with minimal tech presence.",
  strengths: ["Has a website"],
  gaps: ["No GitHub", "No analytics", "No pricing page"],
};

// ─── computeWebsiteScore ─────────────────────────────────────────────────────

describe("computeWebsiteScore", () => {
  it("returns 0 when website does not load", () => {
    expect(computeWebsiteScore(DEAD_WEBSITE)).toBe(0);
  });

  it("returns high score for site with SSL + pricing + analytics", () => {
    const score = computeWebsiteScore(STRONG_WEBSITE);
    expect(score).toBeGreaterThanOrEqual(70);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("gives partial score for loads-but-minimal site", () => {
    const minimal: WebsiteSignals = {
      ...DEAD_WEBSITE,
      loads: true,
      hasSSL: true,
    };
    const score = computeWebsiteScore(minimal);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(70);
  });

  it("caps at 100", () => {
    const score = computeWebsiteScore(STRONG_WEBSITE);
    expect(score).toBeLessThanOrEqual(100);
  });
});

// ─── computeGitHubScore ──────────────────────────────────────────────────────

describe("computeGitHubScore", () => {
  it("returns 0 for non-existent repo", () => {
    expect(computeGitHubScore({ ...INACTIVE_GITHUB, exists: false })).toBe(0);
  });

  it("returns low score for inactive repo (>90 days since last commit)", () => {
    const score = computeGitHubScore(INACTIVE_GITHUB);
    expect(score).toBeLessThan(40);
  });

  it("returns high score for active repo with CI + tests", () => {
    const score = computeGitHubScore(ACTIVE_GITHUB);
    expect(score).toBeGreaterThanOrEqual(60);
  });

  it("caps at 100", () => {
    const score = computeGitHubScore(ACTIVE_GITHUB);
    expect(score).toBeLessThanOrEqual(100);
  });
});

// ─── computeTechScore ────────────────────────────────────────────────────────

describe("computeTechScore", () => {
  it("returns 0-100 with all signals", () => {
    const score = computeTechScore(STRONG_WEBSITE, ACTIVE_GITHUB, STRONG_LLM);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("returns a score when no GitHub is provided (no penalty)", () => {
    const withGitHub = computeTechScore(STRONG_WEBSITE, ACTIVE_GITHUB, STRONG_LLM);
    const withoutGitHub = computeTechScore(STRONG_WEBSITE, null, STRONG_LLM);
    // Both should be valid 0-100 scores
    expect(withoutGitHub).toBeGreaterThanOrEqual(0);
    expect(withoutGitHub).toBeLessThanOrEqual(100);
    // Without GitHub should not be the same formula — weights differ
    expect(withGitHub).not.toBe(withoutGitHub);
  });

  it("returns high score for strong signals", () => {
    const score = computeTechScore(STRONG_WEBSITE, ACTIVE_GITHUB, STRONG_LLM);
    expect(score).toBeGreaterThan(70);
  });

  it("returns low score for dead website + inactive github", () => {
    const score = computeTechScore(DEAD_WEBSITE, INACTIVE_GITHUB, WEAK_LLM);
    expect(score).toBeLessThan(30);
  });

  it("is a whole number", () => {
    const score = computeTechScore(STRONG_WEBSITE, ACTIVE_GITHUB, STRONG_LLM);
    expect(Number.isInteger(score)).toBe(true);
  });
});

// ─── getValuationMultiplierBoost ─────────────────────────────────────────────

describe("getValuationMultiplierBoost", () => {
  it("returns 25% for tech score 91-100", () => {
    expect(getValuationMultiplierBoost(91)).toBe(25);
    expect(getValuationMultiplierBoost(100)).toBe(25);
  });

  it("returns 20% for tech score 76-90", () => {
    expect(getValuationMultiplierBoost(85)).toBe(20);
    expect(getValuationMultiplierBoost(76)).toBe(20);
  });

  it("returns 12% for tech score 61-75", () => {
    expect(getValuationMultiplierBoost(65)).toBe(12);
  });

  it("returns 5% for tech score 41-60", () => {
    expect(getValuationMultiplierBoost(50)).toBe(5);
  });

  it("returns 0% for tech score ≤ 40 (below baseline)", () => {
    expect(getValuationMultiplierBoost(30)).toBe(0);
    expect(getValuationMultiplierBoost(40)).toBe(0);
    expect(getValuationMultiplierBoost(0)).toBe(0);
  });
});

// ─── analyseWebsite with mocked fetch ────────────────────────────────────────

describe("analyseWebsite", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns loads:false when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));
    const result = await analyseWebsite("https://example.com");
    expect(result.loads).toBe(false);
  });

  it("returns loads:false for non-200 responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        url: "https://example.com",
        headers: { forEach: () => {} },
      }),
    );
    const result = await analyseWebsite("https://example.com");
    expect(result.loads).toBe(false);
  });

  it("detects Next.js from __NEXT_DATA__ in HTML", async () => {
    const html = `<html><head></head><body><script id="__NEXT_DATA__" type="application/json">{}</script></body></html>`;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        url: "https://example.com",
        text: () => Promise.resolve(html),
        headers: { forEach: (_fn: (v: string, k: string) => void) => {} },
      }),
    );
    const result = await analyseWebsite("https://example.com");
    expect(result.loads).toBe(true);
    expect(result.techStack).toContain("Next.js");
  });

  it("detects analytics from gtag in HTML", async () => {
    const html = `<html><body><script>window.gtag('config', 'G-ABC123');</script></body></html>`;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        url: "https://example.com",
        text: () => Promise.resolve(html),
        headers: { forEach: (_fn: (v: string, k: string) => void) => {} },
      }),
    );
    const result = await analyseWebsite("https://example.com");
    expect(result.hasAnalytics).toBe(true);
  });

  it("returns hasSSL:true for https URLs", async () => {
    const html = `<html><body>Hello</body></html>`;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        url: "https://secure.example.com",
        text: () => Promise.resolve(html),
        headers: { forEach: (_fn: (v: string, k: string) => void) => {} },
      }),
    );
    const result = await analyseWebsite("https://secure.example.com");
    expect(result.hasSSL).toBe(true);
  });
});

// ─── runTechIntelligence — shape test with mocked fetch ───────────────────────

describe("runTechIntelligence", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns TechIntelligenceResult shape even when everything fails gracefully", async () => {
    // Mock fetch to fail (website unreachable, GitHub 404)
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));

    // Mock callAI to fail too
    vi.mock("@/lib/ai-client", () => ({
      callAI: vi.fn().mockRejectedValue(new Error("LLM unavailable")),
    }));

    const result = await runTechIntelligence({
      websiteUrl: "https://example.com",
      githubUrl: "https://github.com/example/repo",
      startupName: "Test Startup",
      sector: "saas",
    });

    // Must return a complete shape regardless of failures
    expect(typeof result.techScore).toBe("number");
    expect(result.techScore).toBeGreaterThanOrEqual(0);
    expect(result.techScore).toBeLessThanOrEqual(100);
    expect(result.websiteSignals).toBeDefined();
    expect(result.llmAssessment).toBeDefined();
    expect(typeof result.sviContribution).toBe("number");
    expect(typeof result.valuationMultiplierBoost).toBe("number");
    expect(typeof result.generatedAt).toBe("string");
  });
});
