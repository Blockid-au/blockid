// CMO Domain: Market Research & Go-To-Market Strategy
//
// Deep analysis of market opportunity, competitor landscape,
// and GTM strategy with monthly cost projections.

export interface CompetitorProfile {
  /** Competitor company name */
  name: string;
  /** Competitor website URL */
  website: string;
  /** Competitor category */
  category: string;
  /** Competitor funding stage */
  fundingStage: string;
  /** Competitor estimated revenue */
  estimatedRevenue: string;
  /** Competitor strengths */
  strengths: string[];
  /** Competitor weaknesses */
  weaknesses: string[];
  /** Competitor market share */
  marketShare: number;
  /** Competitor AI-powered features */
  aiPoweredFeatures: number;
}

export interface MarketResearch {
  /** Total Addressable Market (TAM) */
  tam: number;
  /** Serviceable Available Market (SAM) */
  sam: number;
  /** Serviceable Obtainable Market (SOM) */
  som: number;
  /** TAM data source */
  tamSource: string;
  /** Industry */
  industry: string;
  /** Region */
  region: string;
  /** Growth rate */
  growthRate: number;
  /** Competitors */
  competitors: CompetitorProfile[];
  /** Market trends */
  marketTrends: string[];
  /** Customer segments */
  customerSegments: CustomerSegment[];
  /** Average Series A funding round size in Australia */
  averageSeriesAFunding: number;
  /** Number of Australian unicorns */
  australianUnicorns: number;
}

export interface CustomerSegment {
  /** Customer segment name */
  name: string;
  /** Customer segment size */
  size: number;
  /** Willingness to pay (high, medium, low) */
  willingness: "high" | "medium" | "low";
  /** Acquisition channel */
  acquisitionChannel: string;
  /** Estimated Customer Acquisition Cost (CAC) */
  estimatedCAC: number;
  /** Estimated Lifetime Value (LTV) */
  estimatedLTV: number;
  /** Video content engagement */
  videoContentEngagement: number;
}

export interface GTMStrategy {
  /** Phase */
  phase: string;
  /** Channels */
  channels: GTMChannel[];
  /** Total monthly budget */
  totalMonthlyBudget: number;
  /** Projected leads */
  projectedLeads: number;
  /** Projected conversions */
  projectedConversions: number;
  /** Customer Acquisition Cost (CAC) */
  cac: number;
}

export interface GTMChannel {
  /** Channel name */
  name: string;
  /** Channel type (organic, paid, partnership, outbound) */
  type: "organic" | "paid" | "partnership" | "outbound";
  /** Monthly budget */
  monthlyBudget: number;
  /** Expected leads */
  expectedLeads: number;
  /** Conversion rate */
  conversionRate: number;
  /** Ramp-up months */
  rampUpMonths: number;
  /** Average page load time */
  averagePageLoadTime: number;
}

export interface GTMMonthlyPlan {
  /** Month */
  month: number;
  /** Label */
  label: string;
  /** Channels */
  channels: { 
    /** Channel name */
    name: string; 
    /** Spend */
    spend: number; 
    /** Leads */
    leads: number; 
    /** Conversions */
    conversions: number 
  }[];
  /** Total spend */
  totalSpend: number;
  /** Total leads */
  totalLeads: number;
  /** Total conversions */
  totalConversions: number;
  /** Cumulative customers */
  cumulativeCustomers: number;
}

// ── Default GTM Channel Templates ──────────────────────────────────────

const GTM_CHANNEL_TEMPLATES: Record<string, GTMChannel[]> = {
  saas_early: [
    { 
      name: "SEO / Content", 
      type: "organic", 
      monthlyBudget: 500, 
      expectedLeads: 50, 
      conversionRate: 3, 
      rampUpMonths: 6,
      averagePageLoadTime: 1.5
    },
    { 
      name: "LinkedIn Outbound", 
      type: "outbound", 
      monthlyBudget: 200, 
      expectedLeads: 30, 
      conversionRate: 5, 
      rampUpMonths: 2,
      averagePageLoadTime: 1.5
    },
    { 
      name: "Product Hunt / Directories", 
      type: "organic", 
      monthlyBudget: 0, 
      expectedLeads: 100, 
      conversionRate: 2,
      rampUpMonths: 3,
      averagePageLoadTime: 1.5
    }
  ]
};

// Australian market data
const AUSTRALIAN_MARKET_DATA = {
  /** Number of startups in Australia */
  numberOfStartups: 14000,
  /** Growth rate of Australian startup ecosystem */
  growthRate: 15,
  /** Average valuation of Australian startups */
  averageValuation: 1300000,
  /** Percentage of startups using valuation tools */
  valuationToolUsage: 22,
  /** Average Series A funding round size in Australia */
  averageSeriesAFunding: 5500000,
  /** Number of Australian unicorns */
  australianUnicorns: 15,
  /** VC investment in H1 2024 */
  vcInvestment: 1400000000
};

// Content marketing benchmarks
const CONTENT_MARKETING_BENCHMARKS = {
  /** Video content engagement */
  videoContentEngagement: 70,
  /** Blog post engagement */
  blogPostEngagement: 50
};

// SEO algorithm updates
const SEO_ALGORITHM_UPDATES = {
  /** Google algorithm updates per year */
  googleAlgorithmUpdatesPerYear: 9,
  /** Percentage of websites affected by Helpful Content Update */
  helpfulContentUpdateAffectedWebsites: 30,
  /** Average page load time for top-ranking websites */
  averagePageLoadTimeForTopRankingWebsites: 1.5,
  /** Importance of E-A-T factors in SEO */
  importanceOfEATFactors: 25.3
};

// Competitor feature releases
const COMPETITOR_FEATURE_RELEASES = {
  /** Number of feature releases */
  numberOfFeatureReleases: 25,
  /** Percentage of AI-powered features */
  aiPoweredFeaturesPercentage: 40,
  /** Average user engagement increase */
  averageUserEngagementIncrease: 30,
  /** Competitor feature release frequency */
  competitorFeatureReleaseFrequency: "bi-weekly"
};

export { 
  GTM_CHANNEL_TEMPLATES, 
  AUSTRALIAN_MARKET_DATA, 
  CONTENT_MARKETING_BENCHMARKS, 
  SEO_ALGORITHM_UPDATES, 
  COMPETITOR_FEATURE_RELEASES 
};
