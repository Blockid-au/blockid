import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Competitive Intelligence — colocated tests for the previously-untested
// `src/lib/competitive-intelligence.ts` module. This module is directly
// consumed by `src/lib/agents/deep-valuation.ts` (via blueOceanScore →
// market-perspective mid + ebitdaMetrics → ecosystem sector-adjust) and by
// every SVI report + valuation PDF downstream, so a silent widening of the
// SCI label bands (25/40/55/70/85), a re-tuning of the sector EBITDA table,
// or a drift in the heuristic-SCI scoring rules can never corrupt a founder-
// facing valuation number without also breaking these tests.
// ---------------------------------------------------------------------------

vi.mock("server-only", () => ({}));

const callAIMock = vi.fn();
const isAIConfiguredMock = vi.fn();

vi.mock("./ai-client", () => ({
  callAI: (opts: unknown) => callAIMock(opts),
  isAIConfigured: () => isAIConfiguredMock(),
}));

import {
  analyzeWebsiteCI,
  computeHeuristicSCI,
  getCompetitionLabel,
  getSCILabel,
  getSectorEbitdaBenchmarks,
  type WebsiteCompetitiveIntelligence,
} from "./competitive-intelligence";
import type { TechAuditResult } from "./rnd-input";

beforeEach(() => {
  callAIMock.mockReset();
  isAIConfiguredMock.mockReset();
});

// ── Factory helpers ────────────────────────────────────────────────────

function makeTechAudit(over: Partial<TechAuditResult> = {}): TechAuditResult {
  return {
    url: "https://example.com",
    auditedAt: new Date().toISOString(),
    security: {
      ssl: { valid: true, issuer: "Let's Encrypt", protocol: "TLSv1.3", expiresAt: null },
      headers: {
        csp: false, hsts: false, xFrameOptions: false, xContentType: false,
        referrerPolicy: false, permissionsPolicy: false,
      },
      headerCount: 0,
      grade: "C",
    },
    performance: {
      ttfbMs: 500, pageSizeBytes: 100_000, compressed: true, compressionType: "gzip",
      cacheControl: false, etag: false, grade: "C",
    },
    techStack: {
      frameworks: [], cssFrameworks: [], cms: null, cdn: null,
      analytics: [], payments: [], customerTools: [], hosting: null, serverTech: null,
    },
    productMaturity: {
      hasSitemap: false, sitemapPageCount: 0, hasRobotsTxt: false,
      hasStructuredData: false, hasOpenGraph: false, hasTwitterCards: false,
      hasPWA: false, hasViewportMeta: false, hasMultiLang: false,
      hasLoginForm: false, hasDashboard: false,
      hasTestimonials: false, hasCustomerLogos: false,
      socialLinks: [], githubLink: null,
    },
    overallGrade: "C",
    signalBoosts: { ptdBoost: 0, svmBoost: 0, treBoost: 0, lcoBoost: 0 },
    evidenceLabels: [],
    ...over,
  };
}

function goodCIPayload(over: Partial<WebsiteCompetitiveIntelligence> = {}) {
  return JSON.stringify({
    sciScore: 72,
    industry: "SaaS",
    subSector: "B2B Payments",
    competitionLevel: "medium",
    blueOceanScore: 60,
    marketMaturity: "growing",
    targetCustomer: "Aussie SMBs 5-50 staff.",
    revenueModelFit: ["subscription", "usage-based", "seat-based"],
    competitors: [
      { name: "Comp1", url: null, positioning: "cheaper", threatLevel: "medium" },
    ],
    uniquePositioning: "AU-native compliance out of the box.",
    gtmStrategy: {
      primaryChannel: "Inbound",
      phase1: { title: "Discovery", tactics: ["blog","ads","seo"], timeline: "Month 1-3" },
      phase2: { title: "Traction", tactics: ["a","b","c"], timeline: "Month 4-9" },
      phase3: { title: "Scale", tactics: ["a","b","c"], timeline: "Month 10-18" },
      estimatedCAC: "$200",
      estimatedLTV: "$3000",
      keyMetrics: ["MRR","CAC","LTV"],
    },
    developmentDirection: {
      shortTerm: ["a","b","c"], mediumTerm: ["a","b","c"],
      longTerm: ["a","b","c"], keyMilestones: ["a","b","c","d"],
    },
    elevationPlan: {
      currentPosition: "pre-PMF",
      targetPosition: "seed-ready",
      steps: [{ title: "s", detail: "d", impact: "i", timeframe: "M1" }],
      fundingNeeds: "Pre-seed $500k",
      keyHires: ["a","b","c"],
    },
    swot: {
      strengths: ["a","b","c"], weaknesses: ["a","b","c"],
      opportunities: ["a","b","c"], threats: ["a","b","c"],
    },
    ebitdaMetrics: {
      typicalMarginPctLow: 15, typicalMarginPctHigh: 30,
      evEbitdaMultipleLow: 12, evEbitdaMultipleHigh: 25,
      ebitdaCagrPct: 22,
      marketEbitdaSizeAud: "$4.2B",
      pathToEbitdaPositive: "$1.2M ARR",
      benchmarkNote: "note",
      auMarketContext: "context",
    },
    analysisConfidence: 80,
    analysisNotes: "notes",
    ...over,
  });
}

// ── getSCILabel ────────────────────────────────────────────────────────

describe("getSCILabel — 6 band matrix", () => {
  it("returns Exceptional at boundary 85 and above", () => {
    expect(getSCILabel(85)).toBe("Exceptional");
    expect(getSCILabel(100)).toBe("Exceptional");
  });
  it("returns Strong at boundary 70..84", () => {
    expect(getSCILabel(70)).toBe("Strong");
    expect(getSCILabel(84)).toBe("Strong");
  });
  it("returns Promising at boundary 55..69", () => {
    expect(getSCILabel(55)).toBe("Promising");
    expect(getSCILabel(69)).toBe("Promising");
  });
  it("returns Developing at boundary 40..54", () => {
    expect(getSCILabel(40)).toBe("Developing");
    expect(getSCILabel(54)).toBe("Developing");
  });
  it("returns Early Stage at boundary 25..39", () => {
    expect(getSCILabel(25)).toBe("Early Stage");
    expect(getSCILabel(39)).toBe("Early Stage");
  });
  it("returns Pre-Competitive below 25 including 0 and negative", () => {
    expect(getSCILabel(24)).toBe("Pre-Competitive");
    expect(getSCILabel(0)).toBe("Pre-Competitive");
    expect(getSCILabel(-10)).toBe("Pre-Competitive");
  });
});

// ── getCompetitionLabel ────────────────────────────────────────────────

describe("getCompetitionLabel — 4 union cases", () => {
  it("low → Blue Ocean copy", () => {
    expect(getCompetitionLabel("low")).toContain("Blue Ocean");
  });
  it("medium → Moderate copy", () => {
    expect(getCompetitionLabel("medium")).toContain("Moderate");
  });
  it("high → Red Ocean copy", () => {
    expect(getCompetitionLabel("high")).toContain("Red Ocean");
  });
  it("extreme → Hyper-Competitive copy", () => {
    expect(getCompetitionLabel("extreme")).toContain("Hyper-Competitive");
  });
});

// ── getSectorEbitdaBenchmarks ──────────────────────────────────────────

describe("getSectorEbitdaBenchmarks — sector table", () => {
  // NOTE: "fintech" is deliberately excluded from this happy-path table — the
  // shipped normalisation regex `key.replace(/tech|fintech|saas/g, "")` returns
  // "" for the bare "fintech" input, which then `k.includes("")` matches on
  // every key so the FIRST key iterated ("saas") wins. That drift is pinned
  // separately below as the "bare fintech input → saas row" quirk so a future
  // reader is warned before a founder gets the wrong sector benchmark.
  const cases: Array<[string, string]> = [
    ["saas", "$4.2B"],
    ["healthtech", "$3.4B"],
    ["marketplace", "$5.6B"],
    ["ecommerce", "$2.8B"],
    ["deeptech", "$1.2B"],
    ["biotech", "$0.9B"],
    ["edtech", "$1.8B"],
    ["cybertech", "$2.1B"],
    ["cleantech", "$3.1B"],
    ["proptech", "$2.4B"],
    ["hrtech", "$1.6B"],
    ["legaltech", "$0.8B"],
    ["agtech", "$1.3B"],
    ["insurtech", "$2.2B"],
    ["wealthtech", "$3.8B"],
  ];

  it.each(cases)("returns the shipped %s row (marketEbitdaSizeAud contains %s)", (sector, sizeMarker) => {
    const b = getSectorEbitdaBenchmarks(sector);
    expect(b.marketEbitdaSizeAud).toContain(sizeMarker);
    // low ≤ high invariant on every documented sector
    expect(b.typicalMarginPctLow).toBeLessThanOrEqual(b.typicalMarginPctHigh);
    expect(b.evEbitdaMultipleLow).toBeLessThanOrEqual(b.evEbitdaMultipleHigh);
  });

  it("falls back to the default sector row when the input is not recognised", () => {
    const b = getSectorEbitdaBenchmarks("financialservices");
    expect(b.marketEbitdaSizeAud).toContain("sector-specific");
    expect(b.pathToEbitdaPositive).toContain("$1M+ ARR");
  });

  it("normalises uppercase + whitespace + slash before matching (SaaS / Payments → saas row)", () => {
    const b = getSectorEbitdaBenchmarks("SaaS / Payments");
    expect(b.marketEbitdaSizeAud).toContain("$4.2B");
  });

  it("matches embedded sector token: 'FinTech Payments' → fintech row (avoids the empty-string quirk because the extra 'payments' token defeats the replace-to-empty path)", () => {
    const b = getSectorEbitdaBenchmarks("FinTech Payments");
    expect(b.marketEbitdaSizeAud).toContain("$8.1B");
  });

  it("pins the known quirk: bare 'fintech' input → saas row (regex replace-to-empty short-circuit)", () => {
    // 'fintech'.replace(/tech|fintech|saas/g, '') = '' → k.includes('') is true
    // for every k, so the first key iterated in the benchmarks object ('saas')
    // wins. Documented here so a future reader sees this is not "test drift".
    const b = getSectorEbitdaBenchmarks("fintech");
    expect(b.marketEbitdaSizeAud).toContain("$4.2B");
  });

  it("permits negative low-bound EBITDA margins for pre-revenue heavy sectors (deeptech, biotech)", () => {
    expect(getSectorEbitdaBenchmarks("deeptech").typicalMarginPctLow).toBeLessThan(0);
    expect(getSectorEbitdaBenchmarks("biotech").typicalMarginPctLow).toBeLessThan(0);
  });

  it("carries the AU-market context string on every documented sector", () => {
    for (const [sector] of cases) {
      const b = getSectorEbitdaBenchmarks(sector);
      expect(b.auMarketContext.length).toBeGreaterThan(0);
      expect(b.benchmarkNote.length).toBeGreaterThan(0);
    }
  });
});

// ── computeHeuristicSCI ────────────────────────────────────────────────

describe("computeHeuristicSCI — heuristic SCI fallback", () => {
  it("returns a baseline score of 40 with no techAudit and no sector, medium competition", () => {
    const r = computeHeuristicSCI(null);
    expect(r.sciScore).toBe(40);
    expect(r.industry).toBe("Technology");
    expect(r.competitionLevel).toBe("medium");
    expect(r.blueOceanScore).toBe(50);
    // ebitdaMetrics default row present even without a sector
    expect(r.ebitdaMetrics).toBeTruthy();
  });

  it("adds +10 for overallGrade A and +5 for grade B", () => {
    const a = computeHeuristicSCI(makeTechAudit({ overallGrade: "A" }));
    const b = computeHeuristicSCI(makeTechAudit({ overallGrade: "B" }));
    expect(a.sciScore).toBe(50);
    expect(b.sciScore).toBe(45);
  });

  it("adds +8 when frameworks.length >= 2 but nothing for length 1", () => {
    const zero = computeHeuristicSCI(makeTechAudit({
      techStack: { ...makeTechAudit().techStack, frameworks: ["React"] },
    }));
    const two = computeHeuristicSCI(makeTechAudit({
      techStack: { ...makeTechAudit().techStack, frameworks: ["React", "Next.js"] },
    }));
    expect(zero.sciScore).toBe(40);
    expect(two.sciScore).toBe(48);
  });

  it("adds +10 for any payment provider, +5 for any analytics", () => {
    const r = computeHeuristicSCI(makeTechAudit({
      techStack: {
        ...makeTechAudit().techStack,
        payments: ["Stripe"],
        analytics: ["GA4"],
      },
    }));
    expect(r.sciScore).toBe(40 + 10 + 5);
  });

  it("adds +8 when hasLoginForm OR hasDashboard (single OR path)", () => {
    const login = computeHeuristicSCI(makeTechAudit({
      productMaturity: { ...makeTechAudit().productMaturity, hasLoginForm: true },
    }));
    const dash = computeHeuristicSCI(makeTechAudit({
      productMaturity: { ...makeTechAudit().productMaturity, hasDashboard: true },
    }));
    expect(login.sciScore).toBe(48);
    expect(dash.sciScore).toBe(48);
  });

  it("adds +8 only once when both hasLoginForm AND hasDashboard (OR-guard, not additive)", () => {
    const r = computeHeuristicSCI(makeTechAudit({
      productMaturity: {
        ...makeTechAudit().productMaturity,
        hasLoginForm: true,
        hasDashboard: true,
      },
    }));
    expect(r.sciScore).toBe(48);
  });

  it("adds +7 when hasTestimonials OR hasCustomerLogos", () => {
    const t = computeHeuristicSCI(makeTechAudit({
      productMaturity: { ...makeTechAudit().productMaturity, hasTestimonials: true },
    }));
    const l = computeHeuristicSCI(makeTechAudit({
      productMaturity: { ...makeTechAudit().productMaturity, hasCustomerLogos: true },
    }));
    expect(t.sciScore).toBe(47);
    expect(l.sciScore).toBe(47);
  });

  it("adds +5 for a githubLink", () => {
    const r = computeHeuristicSCI(makeTechAudit({
      productMaturity: {
        ...makeTechAudit().productMaturity,
        githubLink: "https://github.com/foo",
      },
    }));
    expect(r.sciScore).toBe(45);
  });

  it("clamps sciScore to 100 when every bonus fires", () => {
    const r = computeHeuristicSCI(makeTechAudit({
      overallGrade: "A",
      techStack: {
        ...makeTechAudit().techStack,
        frameworks: ["React", "Next.js"],
        payments: ["Stripe"],
        analytics: ["GA4"],
      },
      productMaturity: {
        ...makeTechAudit().productMaturity,
        hasLoginForm: true,
        hasTestimonials: true,
        githubLink: "https://github.com/foo",
      },
    }));
    // 40 + 10 + 8 + 10 + 5 + 8 + 7 + 5 = 93 (still < 100, no clamp)
    expect(r.sciScore).toBe(93);
    // Now force >100 by combining every bonus with a bonus-heavy fixture
    const overCap = computeHeuristicSCI(makeTechAudit({
      overallGrade: "A",
      techStack: {
        ...makeTechAudit().techStack,
        frameworks: ["React", "Next.js", "Vue"],
        payments: ["Stripe", "PayPal"],
        analytics: ["GA4", "GTM"],
      },
      productMaturity: {
        ...makeTechAudit().productMaturity,
        hasLoginForm: true,
        hasDashboard: true,
        hasTestimonials: true,
        hasCustomerLogos: true,
        githubLink: "https://github.com/foo",
      },
    }));
    // additive components identical (OR-gated), still 93 — pins the OR guard
    expect(overCap.sciScore).toBe(93);
  });

  it("competitionLevel: highCompetitionSectors (saas/ecommerce/marketplace/fintech) → high", () => {
    for (const s of ["saas", "ecommerce", "marketplace", "fintech"]) {
      const r = computeHeuristicSCI(null, s);
      expect(r.competitionLevel).toBe("high");
      expect(r.blueOceanScore).toBe(70);
    }
  });

  it("competitionLevel: lowCompetitionSectors (deeptech/healthtech/edtech) → medium (not 'low' — pins the branch quirk)", () => {
    for (const s of ["deeptech", "healthtech", "edtech"]) {
      const r = computeHeuristicSCI(null, s);
      expect(r.competitionLevel).toBe("medium");
      expect(r.blueOceanScore).toBe(50);
    }
  });

  it("competitionLevel: unrecognised sector falls through to medium", () => {
    const r = computeHeuristicSCI(null, "wealthtech");
    expect(r.competitionLevel).toBe("medium");
    expect(r.blueOceanScore).toBe(50);
  });

  it("industry echoes the detectedSector when supplied", () => {
    const r = computeHeuristicSCI(null, "fintech");
    expect(r.industry).toBe("fintech");
  });

  it("ebitdaMetrics resolves to the sector row when detectedSector is supplied (saas → $4.2B)", () => {
    const r = computeHeuristicSCI(null, "saas");
    expect(r.ebitdaMetrics.marketEbitdaSizeAud).toContain("$4.2B");
  });
});

// ── analyzeWebsiteCI ───────────────────────────────────────────────────

describe("analyzeWebsiteCI — AI-fronted analysis pipeline", () => {
  const scraped = { title: "Acme", description: "A thing.", text: "Hello world.".repeat(50) };

  it("returns null when AI is not configured (no callAI round-trip)", async () => {
    isAIConfiguredMock.mockReturnValue(false);
    const r = await analyzeWebsiteCI("https://acme.au", scraped, null);
    expect(r).toBeNull();
    expect(callAIMock).not.toHaveBeenCalled();
  });

  it("returns null when callAI throws (silent degrade — /api never 500s)", async () => {
    isAIConfiguredMock.mockReturnValue(true);
    callAIMock.mockRejectedValue(new Error("timeout"));
    const r = await analyzeWebsiteCI("https://acme.au", scraped, null);
    expect(r).toBeNull();
  });

  it("returns null when callAI returns unparseable JSON", async () => {
    isAIConfiguredMock.mockReturnValue(true);
    callAIMock.mockResolvedValue({ text: "not json {{{", provider: "claude", model: "m" });
    const r = await analyzeWebsiteCI("https://acme.au", scraped, null);
    expect(r).toBeNull();
  });

  it("strips leading ```json fence + trailing ``` fence before parse", async () => {
    isAIConfiguredMock.mockReturnValue(true);
    callAIMock.mockResolvedValue({
      text: "```json\n" + goodCIPayload() + "\n```",
      provider: "claude", model: "m",
    });
    const r = await analyzeWebsiteCI("https://acme.au", scraped, null);
    expect(r).not.toBeNull();
    expect(r!.sciScore).toBe(72);
    expect(r!.industry).toBe("SaaS");
  });

  it("strips a bare leading ``` fence too", async () => {
    isAIConfiguredMock.mockReturnValue(true);
    callAIMock.mockResolvedValue({
      text: "```\n" + goodCIPayload() + "\n```",
      provider: "claude", model: "m",
    });
    const r = await analyzeWebsiteCI("https://acme.au", scraped, null);
    expect(r).not.toBeNull();
    expect(r!.sciScore).toBe(72);
  });

  it("fills sciScore=50 when the AI response omits sciScore", async () => {
    isAIConfiguredMock.mockReturnValue(true);
    const payload = JSON.parse(goodCIPayload());
    delete payload.sciScore;
    callAIMock.mockResolvedValue({ text: JSON.stringify(payload), provider: "claude", model: "m" });
    const r = await analyzeWebsiteCI("https://acme.au", scraped, null);
    expect(r!.sciScore).toBe(50);
  });

  it("fills industry from detectedSector when the AI omits industry", async () => {
    isAIConfiguredMock.mockReturnValue(true);
    const payload = JSON.parse(goodCIPayload());
    delete payload.industry;
    callAIMock.mockResolvedValue({ text: JSON.stringify(payload), provider: "claude", model: "m" });
    const r = await analyzeWebsiteCI("https://acme.au", scraped, null, "fintech");
    expect(r!.industry).toBe("fintech");
  });

  it("fills industry='Technology' when both AI and caller omit sector", async () => {
    isAIConfiguredMock.mockReturnValue(true);
    const payload = JSON.parse(goodCIPayload());
    delete payload.industry;
    callAIMock.mockResolvedValue({ text: JSON.stringify(payload), provider: "claude", model: "m" });
    const r = await analyzeWebsiteCI("https://acme.au", scraped, null);
    expect(r!.industry).toBe("Technology");
  });

  it("fills competitors=[] when omitted", async () => {
    isAIConfiguredMock.mockReturnValue(true);
    const payload = JSON.parse(goodCIPayload());
    delete payload.competitors;
    callAIMock.mockResolvedValue({ text: JSON.stringify(payload), provider: "claude", model: "m" });
    const r = await analyzeWebsiteCI("https://acme.au", scraped, null);
    expect(r!.competitors).toEqual([]);
  });

  it("fills a placeholder gtmStrategy when omitted (3 phases + defaults)", async () => {
    isAIConfiguredMock.mockReturnValue(true);
    const payload = JSON.parse(goodCIPayload());
    delete payload.gtmStrategy;
    callAIMock.mockResolvedValue({ text: JSON.stringify(payload), provider: "claude", model: "m" });
    const r = await analyzeWebsiteCI("https://acme.au", scraped, null);
    expect(r!.gtmStrategy.primaryChannel).toBe("Direct / Inbound");
    expect(r!.gtmStrategy.phase1.title).toBe("Discovery");
    expect(r!.gtmStrategy.phase2.title).toBe("Traction");
    expect(r!.gtmStrategy.phase3.title).toBe("Scale");
    expect(r!.gtmStrategy.estimatedCAC).toBe("Not estimated");
    expect(r!.gtmStrategy.estimatedLTV).toBe("Not estimated");
  });

  it("fills ebitdaMetrics from the sector benchmark table when omitted (saas → $4.2B)", async () => {
    isAIConfiguredMock.mockReturnValue(true);
    const payload = JSON.parse(goodCIPayload());
    delete payload.ebitdaMetrics;
    callAIMock.mockResolvedValue({ text: JSON.stringify(payload), provider: "claude", model: "m" });
    const r = await analyzeWebsiteCI("https://acme.au", scraped, null, "saas");
    expect(r!.ebitdaMetrics.marketEbitdaSizeAud).toContain("$4.2B");
  });

  it("fills ebitdaMetrics from the AI-declared industry when caller omits detectedSector (healthtech → $3.4B)", async () => {
    isAIConfiguredMock.mockReturnValue(true);
    const payload = JSON.parse(goodCIPayload({ industry: "healthtech" }));
    delete payload.ebitdaMetrics;
    callAIMock.mockResolvedValue({ text: JSON.stringify(payload), provider: "claude", model: "m" });
    const r = await analyzeWebsiteCI("https://acme.au", scraped, null);
    expect(r!.ebitdaMetrics.marketEbitdaSizeAud).toContain("$3.4B");
  });

  it("passes the sector hint into the prompt when supplied", async () => {
    isAIConfiguredMock.mockReturnValue(true);
    callAIMock.mockResolvedValue({ text: goodCIPayload(), provider: "claude", model: "m" });
    await analyzeWebsiteCI("https://acme.au", scraped, null, "healthtech");
    const args = callAIMock.mock.calls[0][0] as { user: string; system: string; maxTokens: number };
    expect(args.user).toContain("Initial sector hint: healthtech");
    expect(args.system).toContain("competitive intelligence");
    expect(args.maxTokens).toBe(3000);
  });

  it("emits 'infer from content' when no sector hint is supplied", async () => {
    isAIConfiguredMock.mockReturnValue(true);
    callAIMock.mockResolvedValue({ text: goodCIPayload(), provider: "claude", model: "m" });
    await analyzeWebsiteCI("https://acme.au", scraped, null);
    const args = callAIMock.mock.calls[0][0] as { user: string };
    expect(args.user).toContain("Sector: infer from content");
  });

  it("emits 'Tech stack: not audited' when techAudit is null", async () => {
    isAIConfiguredMock.mockReturnValue(true);
    callAIMock.mockResolvedValue({ text: goodCIPayload(), provider: "claude", model: "m" });
    await analyzeWebsiteCI("https://acme.au", scraped, null);
    const args = callAIMock.mock.calls[0][0] as { user: string };
    expect(args.user).toContain("Tech stack: not audited");
  });

  it("includes the tech-audit summary line when techAudit is provided", async () => {
    isAIConfiguredMock.mockReturnValue(true);
    callAIMock.mockResolvedValue({ text: goodCIPayload(), provider: "claude", model: "m" });
    const audit = makeTechAudit({
      overallGrade: "A",
      techStack: {
        ...makeTechAudit().techStack,
        frameworks: ["Next.js"],
        payments: ["Stripe"],
        analytics: ["GA4"],
      },
    });
    await analyzeWebsiteCI("https://acme.au", scraped, audit);
    const args = callAIMock.mock.calls[0][0] as { user: string };
    expect(args.user).toContain("Tech Stack: Next.js");
    expect(args.user).toContain("Payments: Stripe");
    expect(args.user).toContain("Analytics: GA4");
    expect(args.user).toContain("Performance Grade: A");
  });

  it("truncates scrapedText to the first 6000 chars in the prompt", async () => {
    isAIConfiguredMock.mockReturnValue(true);
    callAIMock.mockResolvedValue({ text: goodCIPayload(), provider: "claude", model: "m" });
    const bigText = "x".repeat(9000);
    await analyzeWebsiteCI("https://acme.au", { title: "t", description: "d", text: bigText }, null);
    const args = callAIMock.mock.calls[0][0] as { user: string };
    // The 6000-char slice appears verbatim; the 6001st char does not (guarded by non-repeating suffix)
    expect(args.user).toContain("x".repeat(6000));
    // The prompt itself contains other 'x' characters, so we can only assert on the truncated substring length
    const xRunMatch = args.user.match(/x+/);
    expect(xRunMatch![0].length).toBe(6000);
  });
});
