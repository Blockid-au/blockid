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
  /** Competitor feature release frequency */
  featureReleaseFrequency: string;
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
  /** VC investment in H1 2024 */
  vcInvestmentH1: number;
  /** Number of startups in Australia */
  numberOfStartups: number;
  /** Percentage of startups using valuation tools */
  percentageUsingValuationTools: number;
  /** Average valuation of Australian startups */
  averageValuation: number;
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
  /** Importance of E-A-T factors in SEO */
  eATImportance: number;
}

export interface GTMStrategy {
  /** Phase */
  phase: string;
  /** Channels */
  channels: string[];
  /** Average page load time target */
  averagePageLoadTimeTarget: number;
  /** Content marketing focus */
  contentMarketingFocus: string;
}

export const AUSTRALIAN_MARKET_DATA = {
  numberOfStartups: 14000,
  growthRate: 0.15,
  averageSeriesAFunding: 5500000,
  australianUnicorns: 15,
  vcInvestmentH1: 1400000000,
};

export const CONTENT_MARKETING_BENCHMARKS = {
  videoContentEngagement: 0.7,
  blogPostEngagement: 0.5,
};

export const SEO_BENCHMARKS = {
  averagePageLoadTime: 1.5,
  eATImportance: 0.253,
};

export const COMPETITOR_FEATURE_RELEASES = {
  numberOfFeatureReleases: 25,
  aiPoweredFeaturesPercentage: 0.4,
  featureReleaseFrequency: "Bi-weekly",
};

export function calculateMarketShare(marketResearch: MarketResearch): number {
  return marketResearch.competitors.reduce((acc, competitor) => acc + competitor.marketShare, 0);
}

export function calculateCustomerLifetimeValue(customerSegment: CustomerSegment): number {
  return customerSegment.estimatedLTV / customerSegment.estimatedCAC;
}

export function getContentMarketingFocus(marketResearch: MarketResearch): string {
  if (marketResearch.customerSegments.some((segment) => segment.videoContentEngagement > 0.5)) {
    return "Video content";
  } else {
    return "Blog posts";
  }
}
