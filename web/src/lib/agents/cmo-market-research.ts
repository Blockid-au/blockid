// CMO Domain: Market Research & Go-To-Market Strategy
//
// Deep analysis of market opportunity, competitor landscape,
// and GTM strategy with monthly cost projections.

export interface CompetitorProfile {
  name: string;
  website: string;
  category: string;
  fundingStage: string;
  estimatedRevenue: string;
  strengths: string[];
  weaknesses: string[];
  marketShare: number;
}

export interface MarketResearch {
  tam: number;
  sam: number;
  som: number;
  tamSource: string;
  industry: string;
  region: string;
  growthRate: number;
  competitors: CompetitorProfile[];
  marketTrends: string[];
  customerSegments: CustomerSegment[];
}

export interface CustomerSegment {
  name: string;
  size: number;
  willingness: "high" | "medium" | "low";
  acquisitionChannel: string;
  estimatedCAC: number;
  estimatedLTV: number;
}

export interface GTMStrategy {
  phase: string;
  channels: GTMChannel[];
  totalMonthlyBudget: number;
  projectedLeads: number;
  projectedConversions: number;
  cac: number;
}

export interface GTMChannel {
  name: string;
  type: "organic" | "paid" | "partnership" | "outbound";
  monthlyBudget: number;
  expectedLeads: number;
  conversionRate: number;
  rampUpMonths: number;
}

export interface GTMMonthlyPlan {
  month: number;
  label: string;
  channels: { name: string; spend: number; leads: number; conversions: number }[];
  totalSpend: number;
  totalLeads: number;
  totalConversions: number;
  cumulativeCustomers: number;
}

// ── Default GTM Channel Templates ──────────────────────────────────────

const GTM_CHANNEL_TEMPLATES: Record<string, GTMChannel[]> = {
  saas_early: [
    { name: "SEO / Content", type: "organic", monthlyBudget: 500, expectedLeads: 50, conversionRate: 3, rampUpMonths: 6 },
    { name: "LinkedIn Outbound", type: "outbound", monthlyBudget: 200, expectedLeads: 30, conversionRate: 5, rampUpMonths: 2 },
    { name: "Product Hunt / Directories", type: "organic", monthlyBudget: 0, expectedLeads: 100, conversionRate: 2, rampUpMonths: 1 },
    { name: "Google Ads", type: "paid", monthlyBudget: 1000, expectedLeads: 80, conversionRate: 4, rampUpMonths: 1 },
    { name: "Referral Program", type: "organic", monthlyBudget: 100, expectedLeads: 20, conversionRate: 10, rampUpMonths: 3 },
  ],
  saas_growth: [
    { name: "SEO / Content", type: "organic", monthlyBudget: 2000, expectedLeads: 200, conversionRate: 4, rampUpMonths: 3 },
    { name: "Google Ads", type: "paid", monthlyBudget: 5000, expectedLeads: 400, conversionRate: 5, rampUpMonths: 1 },
    { name: "LinkedIn Ads", type: "paid", monthlyBudget: 3000, expectedLeads: 150, conversionRate: 6, rampUpMonths: 2 },
    { name: "Partnerships / Integrations", type: "partnership", monthlyBudget: 1000, expectedLeads: 100, conversionRate: 8, rampUpMonths: 4 },
    { name: "Referral Program", type: "organic", monthlyBudget: 500, expectedLeads: 80, conversionRate: 12, rampUpMonths: 2 },
    { name: "Webinars / Events", type: "organic", monthlyBudget: 1500, expectedLeads: 60, conversionRate: 7, rampUpMonths: 3 },
  ],
  marketplace: [
    { name: "SEO", type: "organic", monthlyBudget: 1000, expectedLeads: 300, conversionRate: 2, rampUpMonths: 6 },
    { name: "Social Media (TikTok/IG)", type: "paid", monthlyBudget: 3000, expectedLeads: 500, conversionRate: 3, rampUpMonths: 1 },
    { name: "Influencer Marketing", type: "partnership", monthlyBudget: 2000, expectedLeads: 200, conversionRate: 4, rampUpMonths: 2 },
    { name: "Community Building", type: "organic", monthlyBudget: 500, expectedLeads: 100, conversionRate: 5, rampUpMonths: 4 },
  ],
};

export function getGTMTemplate(businessModel: string, stage: string): GTMChannel[] {
  const key = `${businessModel}_${stage}`;
  return GTM_CHANNEL_TEMPLATES[key] ?? GTM_CHANNEL_TEMPLATES.saas_early ?? [];
}

// ── Generate Monthly GTM Plan ──────────────────────────────────────────

export function generateGTMPlan(input: {
  channels: GTMChannel[];
  months?: number;
  currentCustomers?: number;
  churnRate?: number;
}): GTMMonthlyPlan[] {
  const months = input.months ?? 12;
  const churn = (input.churnRate ?? 5) / 100;
  let totalCustomers = input.currentCustomers ?? 0;
  const plan: GTMMonthlyPlan[] = [];

  const now = new Date();

  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

    const channelResults = input.channels.map((ch) => {
      // Ramp-up factor: linear from 0.2 to 1.0 over rampUpMonths
      const rampFactor = Math.min(1, 0.2 + (0.8 * Math.min(i, ch.rampUpMonths) / Math.max(1, ch.rampUpMonths)));
      const leads = Math.round(ch.expectedLeads * rampFactor);
      const conversions = Math.round(leads * (ch.conversionRate / 100));
      return {
        name: ch.name,
        spend: Math.round(ch.monthlyBudget * rampFactor),
        leads,
        conversions,
      };
    });

    const monthConversions = channelResults.reduce((s, c) => s + c.conversions, 0);
    const churned = Math.round(totalCustomers * churn);
    totalCustomers = Math.max(0, totalCustomers + monthConversions - churned);

    plan.push({
      month: i + 1,
      label,
      channels: channelResults,
      totalSpend: channelResults.reduce((s, c) => s + c.spend, 0),
      totalLeads: channelResults.reduce((s, c) => s + c.leads, 0),
      totalConversions: monthConversions,
      cumulativeCustomers: totalCustomers,
    });
  }

  return plan;
}

// ── Market Size Estimation Templates ───────────────────────────────────

export const AU_MARKET_SIZES: Record<string, { tam: number; sam: number; som: number; source: string }> = {
  saas_b2b: { tam: 12_000_000_000, sam: 2_400_000_000, som: 24_000_000, source: "IBISWorld AU SaaS 2025" },
  fintech: { tam: 45_000_000_000, sam: 9_000_000_000, som: 90_000_000, source: "Statista AU Fintech 2025" },
  edtech: { tam: 6_500_000_000, sam: 1_300_000_000, som: 13_000_000, source: "HolonIQ AU Edtech 2025" },
  healthtech: { tam: 28_000_000_000, sam: 5_600_000_000, som: 56_000_000, source: "Frost & Sullivan AU 2025" },
  marketplace: { tam: 35_000_000_000, sam: 7_000_000_000, som: 70_000_000, source: "e-Commerce AU 2025" },
  proptech: { tam: 15_000_000_000, sam: 3_000_000_000, som: 30_000_000, source: "PropTech AU 2025" },
  cleantech: { tam: 20_000_000_000, sam: 4_000_000_000, som: 40_000_000, source: "Clean Energy AU 2025" },
};
