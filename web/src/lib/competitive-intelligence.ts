import "server-only";
import { callAI, isAIConfigured } from "./ai-client";
import type { TechAuditResult } from "./rnd-input";

// ─── Competitive Intelligence Types ──────────────────────────────────────────

export interface CompetitorProfile {
  name: string;
  url?: string;
  positioning: string;
  threatLevel: "low" | "medium" | "high";
}

export interface GTMPhase {
  title: string;
  tactics: string[];
  timeline: string;
}

export interface GTMStrategy {
  primaryChannel: string;
  phase1: GTMPhase;
  phase2: GTMPhase;
  phase3: GTMPhase;
  estimatedCAC: string;
  estimatedLTV: string;
  keyMetrics: string[];
}

export interface DevelopmentDirection {
  shortTerm: string[];    // 0–6 months
  mediumTerm: string[];   // 6–18 months
  longTerm: string[];     // 18+ months
  keyMilestones: string[];
}

export interface ElevationStep {
  title: string;
  detail: string;
  impact: string;
  timeframe: string;
}

export interface ElevationPlan {
  currentPosition: string;
  targetPosition: string;
  steps: ElevationStep[];
  fundingNeeds: string;
  keyHires: string[];
}

export interface SWOTSnapshot {
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
}

export interface MarketEbitdaMetrics {
  typicalMarginPctLow: number;        // EBITDA margin % lower bound for this sector
  typicalMarginPctHigh: number;       // EBITDA margin % upper bound for this sector
  evEbitdaMultipleLow: number;        // EV/EBITDA multiple lower bound
  evEbitdaMultipleHigh: number;       // EV/EBITDA multiple upper bound
  ebitdaCagrPct: number;              // Market EBITDA CAGR %
  marketEbitdaSizeAud: string;        // Total addressable EBITDA pool in AUD
  pathToEbitdaPositive: string;       // Revenue milestone to reach EBITDA breakeven
  benchmarkNote: string;              // Context on EBITDA benchmarks for this sector
  auMarketContext: string;            // Australian market-specific EBITDA context
}

export interface WebsiteCompetitiveIntelligence {
  sciScore: number;               // 0–100: Startup Competitive Intelligence composite
  industry: string;               // Primary industry label
  subSector: string;              // Granular sub-sector
  competitionLevel: "low" | "medium" | "high" | "extreme";
  blueOceanScore: number;         // 0–100: differentiation vs competition
  marketMaturity: "emerging" | "growing" | "mature" | "declining";
  targetCustomer: string;         // ICP description
  revenueModelFit: string[];      // Best-fit revenue models for this sector/stage
  competitors: CompetitorProfile[];
  uniquePositioning: string;      // What makes this startup different
  gtmStrategy: GTMStrategy;
  developmentDirection: DevelopmentDirection;
  elevationPlan: ElevationPlan;
  swot: SWOTSnapshot;
  ebitdaMetrics: MarketEbitdaMetrics; // Market-level EBITDA benchmarks for this sector
  analysisConfidence: number;     // 0–100
  analysisNotes: string;
}

// ─── AI Prompt ────────────────────────────────────────────────────────────────

function buildCIPrompt(
  url: string,
  scrapedTitle: string,
  scrapedDescription: string,
  scrapedText: string,
  techAudit: TechAuditResult | null,
  detectedSector?: string,
): string {
  const techContext = techAudit
    ? `Tech Stack: ${techAudit.techStack.frameworks.join(", ") || "unknown"} | CMS: ${techAudit.techStack.cms ?? "none"} | Payments: ${techAudit.techStack.payments.join(", ") || "none"} | Analytics: ${techAudit.techStack.analytics.join(", ") || "none"} | Performance Grade: ${techAudit.overallGrade}`
    : "Tech stack: not audited";

  const sectorHint = detectedSector ? `Initial sector hint: ${detectedSector}` : "Sector: infer from content";

  return `You are a top-tier startup analyst. Analyze the following website and produce a detailed competitive intelligence report.

URL: ${url}
Title: ${scrapedTitle}
Description: ${scrapedDescription}
${sectorHint}
${techContext}

Website content (first 6000 chars):
${scrapedText.slice(0, 6000)}

Produce a JSON object with this EXACT schema (no markdown, raw JSON only):
{
  "sciScore": <0-100 composite competitive intelligence score>,
  "industry": "<primary industry, e.g. FinTech, HealthTech, SaaS, EdTech, LegalTech, PropTech, AgTech, CleanTech, RetailTech, HRTech, InsurTech, MarketingTech, LogisticsTech, FoodTech, SportsTech, TravelTech, MediaTech, CyberSecurity, DeepTech, Marketplace, eCommerce, Consumer, Gaming, ClimateTech, BioTech>",
  "subSector": "<granular sub-sector, e.g. B2B Payments, Clinical AI, Online Learning, Property Management SaaS>",
  "competitionLevel": "<low|medium|high|extreme>",
  "blueOceanScore": <0-100, 100=completely unique blue ocean, 0=extremely crowded red ocean>,
  "marketMaturity": "<emerging|growing|mature|declining>",
  "targetCustomer": "<2-3 sentence ICP description>",
  "revenueModelFit": ["<best-fit revenue model 1>", "<revenue model 2>", "<revenue model 3>"],
  "competitors": [
    { "name": "<competitor name>", "url": "<url or null>", "positioning": "<their positioning in 1 sentence>", "threatLevel": "<low|medium|high>" }
  ],
  "uniquePositioning": "<what makes this startup differentiated in 2-3 sentences>",
  "gtmStrategy": {
    "primaryChannel": "<main acquisition channel>",
    "phase1": {
      "title": "<phase 1 name, e.g. Founder-Led Sales>",
      "tactics": ["<tactic 1>", "<tactic 2>", "<tactic 3>"],
      "timeline": "<e.g. Month 1-3>"
    },
    "phase2": {
      "title": "<phase 2 name>",
      "tactics": ["<tactic 1>", "<tactic 2>", "<tactic 3>"],
      "timeline": "<e.g. Month 4-9>"
    },
    "phase3": {
      "title": "<phase 3 name>",
      "tactics": ["<tactic 1>", "<tactic 2>", "<tactic 3>"],
      "timeline": "<e.g. Month 10-18>"
    },
    "estimatedCAC": "<e.g. $200-500 per customer>",
    "estimatedLTV": "<e.g. $2,000-5,000 over 24 months>",
    "keyMetrics": ["<metric 1>", "<metric 2>", "<metric 3>"]
  },
  "developmentDirection": {
    "shortTerm": ["<priority 1 in 0-6 months>", "<priority 2>", "<priority 3>"],
    "mediumTerm": ["<priority 1 in 6-18 months>", "<priority 2>", "<priority 3>"],
    "longTerm": ["<priority 1 in 18+ months>", "<priority 2>", "<priority 3>"],
    "keyMilestones": ["<milestone 1>", "<milestone 2>", "<milestone 3>", "<milestone 4>"]
  },
  "elevationPlan": {
    "currentPosition": "<where this startup is now in 1 sentence>",
    "targetPosition": "<where it should aim in 18-24 months>",
    "steps": [
      { "title": "<step title>", "detail": "<what to do>", "impact": "<expected impact>", "timeframe": "<e.g. Month 1-2>" }
    ],
    "fundingNeeds": "<e.g. Pre-seed $500k to reach product-market fit>",
    "keyHires": ["<hire 1>", "<hire 2>", "<hire 3>"]
  },
  "swot": {
    "strengths": ["<S1>", "<S2>", "<S3>"],
    "weaknesses": ["<W1>", "<W2>", "<W3>"],
    "opportunities": ["<O1>", "<O2>", "<O3>"],
    "threats": ["<T1>", "<T2>", "<T3>"]
  },
  "ebitdaMetrics": {
    "typicalMarginPctLow": <lower bound EBITDA margin % typical for this sector at growth stage, e.g. 12>,
    "typicalMarginPctHigh": <upper bound EBITDA margin % typical for this sector at scale stage, e.g. 28>,
    "evEbitdaMultipleLow": <EV/EBITDA multiple lower bound for this sector, e.g. 10>,
    "evEbitdaMultipleHigh": <EV/EBITDA multiple upper bound for this sector, e.g. 25>,
    "ebitdaCagrPct": <expected EBITDA market CAGR % for this sector over next 3-5 years, e.g. 22>,
    "marketEbitdaSizeAud": "<total addressable EBITDA pool in AU market, e.g. '$2.4B annual EBITDA across AU SaaS market'>",
    "pathToEbitdaPositive": "<revenue or operational milestone to reach EBITDA breakeven, e.g. '$1.2M ARR with 65% gross margin'>",
    "benchmarkNote": "<1-2 sentences on sector EBITDA norms citing comparable AU companies or global benchmarks>",
    "auMarketContext": "<1-2 sentences on Australian market-specific EBITDA context, AU investor expectations, AVCAL/ASX benchmarks>"
  },
  "analysisConfidence": <0-100, based on how much content was available>,
  "analysisNotes": "<brief note on what information was and wasn't available>"
}

Rules:
- Include 3-6 real or likely competitors based on the sector and positioning
- Go-to-market must be specific and actionable for this exact startup
- Elevation plan steps must be concrete (5-7 steps)
- SWOT must be honest and sector-specific
- sciScore = weighted average of: uniqueness (25%), market timing (20%), technical maturity (15%), team signals (15%), traction signals (15%), revenue model fit (10%)
- EBITDA metrics must reflect realistic sector benchmarks (not startup projections — this is market-level data)
- For pre-revenue / DeepTech / BioTech sectors, EBITDA margins can be negative; use -30 to -5 as low bound
- Respond with ONLY the JSON object, no explanation, no markdown fences`;
}

// ─── SCI Score Explanation ────────────────────────────────────────────────────

export function getSCILabel(score: number): string {
  if (score >= 85) return "Exceptional";
  if (score >= 70) return "Strong";
  if (score >= 55) return "Promising";
  if (score >= 40) return "Developing";
  if (score >= 25) return "Early Stage";
  return "Pre-Competitive";
}

export function getCompetitionLabel(level: WebsiteCompetitiveIntelligence["competitionLevel"]): string {
  switch (level) {
    case "low": return "Blue Ocean — low competition, first-mover advantage";
    case "medium": return "Moderate — differentiated players, room to compete";
    case "high": return "Red Ocean — crowded market, needs strong differentiation";
    case "extreme": return "Hyper-Competitive — dominated by well-funded incumbents";
  }
}

// ─── Main Analysis Function ───────────────────────────────────────────────────

export async function analyzeWebsiteCI(
  url: string,
  scraped: { title: string; description: string; text: string },
  techAudit: TechAuditResult | null,
  detectedSector?: string,
): Promise<WebsiteCompetitiveIntelligence | null> {
  if (!isAIConfigured()) return null;

  const prompt = buildCIPrompt(
    url,
    scraped.title,
    scraped.description,
    scraped.text,
    techAudit,
    detectedSector,
  );

  try {
    const result = await callAI({
      system: "You are an expert startup analyst specializing in competitive intelligence and go-to-market strategy. Always respond with valid JSON only.",
      user: prompt,
      maxTokens: 3000,
      timeoutMs: 60_000,
    });

    // Parse JSON — strip any accidental markdown fences
    const raw = result.text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const parsed = JSON.parse(raw) as WebsiteCompetitiveIntelligence;

    // Validate key fields
    if (typeof parsed.sciScore !== "number") {
      parsed.sciScore = 50;
    }
    if (!parsed.industry) parsed.industry = detectedSector ?? "Technology";
    if (!parsed.competitors) parsed.competitors = [];
    if (!parsed.gtmStrategy) {
      parsed.gtmStrategy = {
        primaryChannel: "Direct / Inbound",
        phase1: { title: "Discovery", tactics: [], timeline: "Month 1-3" },
        phase2: { title: "Traction", tactics: [], timeline: "Month 4-9" },
        phase3: { title: "Scale", tactics: [], timeline: "Month 10-18" },
        estimatedCAC: "Not estimated",
        estimatedLTV: "Not estimated",
        keyMetrics: [],
      };
    }
    if (!parsed.ebitdaMetrics) {
      parsed.ebitdaMetrics = getSectorEbitdaBenchmarks(detectedSector ?? parsed.industry ?? "default");
    }

    return parsed;
  } catch (err) {
    console.error("[blockid:competitive-intelligence] AI parse failed", err);
    return null;
  }
}

// ─── Sector EBITDA Benchmarks (AU market, 2024-2025) ─────────────────────────
// Sources: AVCAL 2024, Cut Through Venture, ASX sector reports, IBISWorld AU

export function getSectorEbitdaBenchmarks(sectorOrIndustry: string): MarketEbitdaMetrics {
  const key = sectorOrIndustry.toLowerCase().replace(/[\s/]/g, "");

  const benchmarks: Record<string, MarketEbitdaMetrics> = {
    saas: {
      typicalMarginPctLow: 15, typicalMarginPctHigh: 30,
      evEbitdaMultipleLow: 12, evEbitdaMultipleHigh: 25,
      ebitdaCagrPct: 22,
      marketEbitdaSizeAud: "$4.2B annual EBITDA across AU SaaS & B2B software market",
      pathToEbitdaPositive: "$1.2M ARR with 65%+ gross margin and controlled opex",
      benchmarkNote: "AU SaaS leaders (Atlassian, Xero, Canva) demonstrate 18-30% EBITDA margins at scale. Early-stage SaaS typically burns 20-40% of ARR on S&M.",
      auMarketContext: "AU VC-backed SaaS exits average 8-15x ARR. AVCAL 2024 reports median AU SaaS EV/EBITDA of 14x at Series A, 20x at growth stage.",
    },
    fintech: {
      typicalMarginPctLow: 12, typicalMarginPctHigh: 26,
      evEbitdaMultipleLow: 10, evEbitdaMultipleHigh: 22,
      ebitdaCagrPct: 19,
      marketEbitdaSizeAud: "$8.1B annual EBITDA across AU FinTech & payments sector",
      pathToEbitdaPositive: "$2M+ ARR with AFSL compliance costs amortised over 500+ clients",
      benchmarkNote: "AU FinTech EBITDA heavily influenced by AFSL/ASIC compliance overhead. Payments-focused FinTechs typically reach EBITDA positive at $3-5M ARR.",
      auMarketContext: "RBA's New Payments Platform expansion and CDR Open Banking driving EBITDA uplift. AU FinTech EV/EBITDA of 12-18x typical for Series B+ companies.",
    },
    healthtech: {
      typicalMarginPctLow: 8, typicalMarginPctHigh: 20,
      evEbitdaMultipleLow: 8, evEbitdaMultipleHigh: 18,
      ebitdaCagrPct: 16,
      marketEbitdaSizeAud: "$3.4B annual EBITDA across AU digital health & MedTech market",
      pathToEbitdaPositive: "$1.8M ARR with MBS/PBS reimbursement or enterprise hospital contract",
      benchmarkNote: "AU HealthTech EBITDA constrained by TGA regulatory pathway costs and long sales cycles. Telehealth platforms at scale target 15-22% EBITDA margins.",
      auMarketContext: "MyHealth Record integration and telehealth expansion post-COVID driving sector EBITDA growth. AU HealthTech EV/EBITDA of 10-16x for growth-stage companies.",
    },
    marketplace: {
      typicalMarginPctLow: 18, typicalMarginPctHigh: 35,
      evEbitdaMultipleLow: 15, evEbitdaMultipleHigh: 35,
      ebitdaCagrPct: 25,
      marketEbitdaSizeAud: "$5.6B annual EBITDA across AU two-sided marketplace sector",
      pathToEbitdaPositive: "GMV of $15M+ with 12-15% take rate and supply-demand balance achieved",
      benchmarkNote: "AU marketplaces (Airtasker, REA, Seek) demonstrate 20-35% EBITDA at maturity. Liquidity threshold is the primary EBITDA inflection point.",
      auMarketContext: "AU marketplace exits have commanded 20-35x EBITDA from strategic acquirers (REA, Domain, Seek group). Network effect moat justifies premium multiples.",
    },
    ecommerce: {
      typicalMarginPctLow: 4, typicalMarginPctHigh: 14,
      evEbitdaMultipleLow: 6, evEbitdaMultipleHigh: 14,
      ebitdaCagrPct: 12,
      marketEbitdaSizeAud: "$2.8B annual EBITDA across AU eCommerce & D2C brands",
      pathToEbitdaPositive: "$3M+ revenue with 45%+ gross margin and CAC:LTV ratio of 1:3+",
      benchmarkNote: "AU eCommerce EBITDA pressured by rising digital ad costs (Google/Meta CPMs up 40% 2023-24) and logistics inflation. D2C brands average 6-10% EBITDA at scale.",
      auMarketContext: "AU retail eCommerce market $63B (2024, ABS). EBITDA margins compressed vs global peers due to smaller AU customer base and higher fulfilment costs.",
    },
    deeptech: {
      typicalMarginPctLow: -20, typicalMarginPctHigh: 8,
      evEbitdaMultipleLow: 20, evEbitdaMultipleHigh: 50,
      ebitdaCagrPct: 38,
      marketEbitdaSizeAud: "$1.2B annual EBITDA pool across AU DeepTech & hardware sector (highly concentrated)",
      pathToEbitdaPositive: "Post-commercialisation at $5M+ revenue; R&D Tax Incentive (43.5% offset) critical to cash efficiency",
      benchmarkNote: "AU DeepTech typically pre-EBITDA for 5-8 years. Valuation based on IP, patent pipeline, and technology readiness level (TRL) rather than EBITDA multiples.",
      auMarketContext: "ATO R&D Tax Incentive (43.5% refundable for <$20M turnover) is a material cash contribution. CSIRO and Defence co-investment common. IP-based exit multiples 20-50x.",
    },
    biotech: {
      typicalMarginPctLow: -40, typicalMarginPctHigh: 5,
      evEbitdaMultipleLow: 25, evEbitdaMultipleHigh: 60,
      ebitdaCagrPct: 28,
      marketEbitdaSizeAud: "$0.9B annual EBITDA across AU BioTech & LifeSciences (concentrated in ASX-listed)",
      pathToEbitdaPositive: "Phase 2 clinical data + licensing deal or $10M+ product revenue post-TGA approval",
      benchmarkNote: "AU BioTech EBITDA deeply negative during clinical phase. Valuation driven by pipeline NPV (net present value of trial outcomes), not EBITDA.",
      auMarketContext: "ASX BioTech index trades on cash runway and clinical milestones. EV/EBITDA irrelevant pre-revenue; post-commercialisation 25-50x EBITDA typical for platform technologies.",
    },
    edtech: {
      typicalMarginPctLow: 10, typicalMarginPctHigh: 22,
      evEbitdaMultipleLow: 8, evEbitdaMultipleHigh: 18,
      ebitdaCagrPct: 14,
      marketEbitdaSizeAud: "$1.8B annual EBITDA across AU EdTech & online learning market",
      pathToEbitdaPositive: "$800K ARR with 70%+ gross margin (subscription-based) or 5,000+ active learners",
      benchmarkNote: "AU EdTech EBITDA driven by subscription retention and content reuse ratios. B2B school/enterprise EdTech typically 15-22% EBITDA vs B2C 8-14%.",
      auMarketContext: "HECS voucher programs and Skills & Training Boost (AU Budget 2024) expanding addressable market. AU EdTech EV/EBITDA of 10-15x for high-retention platforms.",
    },
    cybertech: {
      typicalMarginPctLow: 14, typicalMarginPctHigh: 30,
      evEbitdaMultipleLow: 15, evEbitdaMultipleHigh: 30,
      ebitdaCagrPct: 24,
      marketEbitdaSizeAud: "$2.1B annual EBITDA across AU CyberSecurity & InfoSec market",
      pathToEbitdaPositive: "$1.5M ARR with federal/enterprise contracts and Essential Eight compliance alignment",
      benchmarkNote: "AU CyberSecurity demand driven by mandatory incident reporting (SOCI Act 2023) and ASD Essential Eight mandates. Enterprise security platforms average 18-28% EBITDA.",
      auMarketContext: "ASD/ACSC mandates and critical infrastructure protections creating $8.9B AU cyber market. Government contracts provide predictable EBITDA with 90%+ renewal rates.",
    },
    cleantech: {
      typicalMarginPctLow: 5, typicalMarginPctHigh: 18,
      evEbitdaMultipleLow: 12, evEbitdaMultipleHigh: 28,
      ebitdaCagrPct: 22,
      marketEbitdaSizeAud: "$3.1B annual EBITDA across AU CleanTech, renewable energy & sustainability sector",
      pathToEbitdaPositive: "$2.5M+ ARR or 50MW+ capacity contracted with ARENA/CEFC support",
      benchmarkNote: "AU CleanTech EBITDA supported by carbon credit schemes (ACCU) and Capacity Investment Scheme. Hardware-heavy CleanTech 5-10% EBITDA; SaaS-enabled 15-22%.",
      auMarketContext: "ARENA's $1.9B Hydrogen Headstart and CIS creating significant EBITDA uplift. AU listed CleanTech companies trade at 15-25x EV/EBITDA with strong ESG premium.",
    },
    proptech: {
      typicalMarginPctLow: 8, typicalMarginPctHigh: 22,
      evEbitdaMultipleLow: 8, evEbitdaMultipleHigh: 20,
      ebitdaCagrPct: 13,
      marketEbitdaSizeAud: "$2.4B annual EBITDA across AU PropTech & real estate technology market",
      pathToEbitdaPositive: "$1.2M ARR with REA/Domain partnership or 200+ agency subscriptions",
      benchmarkNote: "AU PropTech dominated by REA Group (30x EBITDA) and Domain. Niche PropTech targeting property management or construction management achieves 12-20% EBITDA at scale.",
      auMarketContext: "AU residential property market ~$10T total value creating large PropTech TAM. SaaS PropTech EV/EBITDA 10-18x; transactional PropTech 8-14x reflecting cyclicality.",
    },
    hrtech: {
      typicalMarginPctLow: 12, typicalMarginPctHigh: 24,
      evEbitdaMultipleLow: 10, evEbitdaMultipleHigh: 22,
      ebitdaCagrPct: 17,
      marketEbitdaSizeAud: "$1.6B annual EBITDA across AU HRTech, payroll & workforce management market",
      pathToEbitdaPositive: "$900K ARR with 150+ employer accounts and integrated payroll/time-tracking",
      benchmarkNote: "AU HRTech dominated by Employment Hero and MYOB. SMB-focused HRTech reaches 15-22% EBITDA; enterprise HCM 18-26% at maturity.",
      auMarketContext: "Fair Work Act complexity and STP Phase 2 (ATO) mandates driving HRTech adoption. AU HRTech EV/EBITDA of 12-20x. Employment Hero's $1.1B valuation benchmarks the sector.",
    },
    legaltech: {
      typicalMarginPctLow: 12, typicalMarginPctHigh: 26,
      evEbitdaMultipleLow: 10, evEbitdaMultipleHigh: 22,
      ebitdaCagrPct: 16,
      marketEbitdaSizeAud: "$0.8B annual EBITDA across AU LegalTech & legal automation market",
      pathToEbitdaPositive: "$700K ARR with 50+ law firm subscriptions or BigLaw enterprise contract",
      benchmarkNote: "AU legal services market $32B (IBISWorld 2024). LegalTech automation platforms targeting contracts and discovery achieve 18-26% EBITDA at scale.",
      auMarketContext: "AU LegalTech adoption accelerated by Court digital initiatives. AI-powered contract review and e-discovery platforms command 15-22x EV/EBITDA from legal sector acquirers.",
    },
    agtech: {
      typicalMarginPctLow: 6, typicalMarginPctHigh: 18,
      evEbitdaMultipleLow: 8, evEbitdaMultipleHigh: 20,
      ebitdaCagrPct: 16,
      marketEbitdaSizeAud: "$1.3B annual EBITDA across AU AgTech & FoodTech sector",
      pathToEbitdaPositive: "$1.5M ARR or 200+ farm/processor subscriptions with seasonal subscription model",
      benchmarkNote: "AU AgTech EBITDA seasonal and correlated with commodity prices. Precision agriculture SaaS achieves 14-22% EBITDA. FoodTech supply chain platforms 10-18%.",
      auMarketContext: "AU agriculture $73B GDP contribution. AgTech benefits from R&D Tax Incentive and GRDC/Hort Innovation co-investment. EV/EBITDA 10-18x for growth-stage AgTech.",
    },
    insurtech: {
      typicalMarginPctLow: 10, typicalMarginPctHigh: 24,
      evEbitdaMultipleLow: 10, evEbitdaMultipleHigh: 22,
      ebitdaCagrPct: 18,
      marketEbitdaSizeAud: "$2.2B annual EBITDA across AU InsurTech & embedded insurance market",
      pathToEbitdaPositive: "$2M GWP or $800K platform fee ARR with APRA license or MGA arrangement",
      benchmarkNote: "AU InsurTech EBITDA driven by claims ratio management and distribution efficiency. MGAs and distribution platforms achieve 15-24% EBITDA; full-stack carriers 8-14%.",
      auMarketContext: "APRA regulatory uplift and embedded insurance trend creating new EBITDA pools. AU InsurTech EV/EBITDA 12-20x. IAG, QBE digital partnerships key entry strategy.",
    },
    wealthtech: {
      typicalMarginPctLow: 14, typicalMarginPctHigh: 28,
      evEbitdaMultipleLow: 12, evEbitdaMultipleHigh: 24,
      ebitdaCagrPct: 20,
      marketEbitdaSizeAud: "$3.8B annual EBITDA across AU WealthTech & investment management technology",
      pathToEbitdaPositive: "$1.8M ARR with $500M+ FUM under management or 300+ AFSL licensee subscriptions",
      benchmarkNote: "AU WealthTech benefits from $3.5T superannuation system. Robo-advisors and platform technology companies achieve 18-28% EBITDA at scale.",
      auMarketContext: "ASIC CP353 and RG255 driving advice technology adoption. AU WealthTech EV/EBITDA 14-24x. Netwealth and HUB24 benchmark at 30x+ reflecting platform economics.",
    },
    default: {
      typicalMarginPctLow: 8, typicalMarginPctHigh: 20,
      evEbitdaMultipleLow: 8, evEbitdaMultipleHigh: 18,
      ebitdaCagrPct: 15,
      marketEbitdaSizeAud: "Market EBITDA size to be determined by sector-specific analysis",
      pathToEbitdaPositive: "$1M+ ARR with 60%+ gross margin and controlled headcount growth",
      benchmarkNote: "Cross-sector AU startup EBITDA benchmarks: median 15% EBITDA at Series A, 22% at growth stage. Based on AVCAL 2024 Australian Venture Activity report.",
      auMarketContext: "AU startup ecosystem EBITDA benchmarks reflect smaller market size vs US/EU. AU investors typically expect 15-25% EBITDA margins at scale. R&D Tax Incentive offsets early burn.",
    },
  };

  // Normalise key to match benchmark table
  const normKey = Object.keys(benchmarks).find((k) =>
    key.includes(k) || k.includes(key.replace(/tech|fintech|saas/g, ""))
  ) ?? "default";

  return benchmarks[normKey] ?? benchmarks.default;
}

// ─── Lightweight heuristic SCI (no AI, instant) ──────────────────────────────
// Used as a fallback when AI is unavailable or timed out.

export function computeHeuristicSCI(
  techAudit: TechAuditResult | null,
  detectedSector?: string,
): Pick<WebsiteCompetitiveIntelligence, "sciScore" | "industry" | "competitionLevel" | "blueOceanScore" | "ebitdaMetrics"> {
  let score = 40;

  if (techAudit) {
    if (techAudit.overallGrade === "A") score += 10;
    else if (techAudit.overallGrade === "B") score += 5;
    if (techAudit.techStack.frameworks.length >= 2) score += 8;
    if (techAudit.techStack.payments.length > 0) score += 10;
    if (techAudit.techStack.analytics.length > 0) score += 5;
    if (techAudit.productMaturity.hasLoginForm || techAudit.productMaturity.hasDashboard) score += 8;
    if (techAudit.productMaturity.hasTestimonials || techAudit.productMaturity.hasCustomerLogos) score += 7;
    if (techAudit.productMaturity.githubLink) score += 5;
  }

  const highCompetitionSectors = ["saas", "ecommerce", "marketplace", "fintech"];
  const lowCompetitionSectors = ["deeptech", "healthtech", "edtech"];

  const competitionLevel: WebsiteCompetitiveIntelligence["competitionLevel"] =
    highCompetitionSectors.includes(detectedSector ?? "")
      ? "high"
      : lowCompetitionSectors.includes(detectedSector ?? "")
        ? "medium"
        : "medium";

  return {
    sciScore: Math.min(100, score),
    industry: detectedSector ?? "Technology",
    competitionLevel,
    blueOceanScore: competitionLevel === "high" ? 70 : 50,
    ebitdaMetrics: getSectorEbitdaBenchmarks(detectedSector ?? "default"),
  };
}
