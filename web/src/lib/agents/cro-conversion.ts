// CRO Domain: Conversion Funnel & Retention Analysis
//
// Analyzes conversion funnels, retention curves, pricing models,
// and customer segmentation for revenue optimization.

export interface FunnelStage {
  name: string;
  visitors: number;
  conversionRate: number;
  dropoffRate: number;
  benchmark: number;
  gap: number;
}

export interface RetentionCohort {
  cohortMonth: string;
  startUsers: number;
  retention: number[];
}

export interface PricingTier {
  name: string;
  price: number;
  period: "monthly" | "annual";
  features: string[];
  targetSegment: string;
  estimatedConversion: number;
  estimatedRevenue: number;
}

export interface ConversionAnalysis {
  funnel: FunnelStage[];
  overallConversion: number;
  bottleneck: string;
  improvementPotential: number;
  recommendations: string[];
}

// ── SaaS Funnel Benchmarks ─────────────────────────────────────────────

const SAAS_FUNNEL_BENCHMARKS: Record<string, { p25: number; p50: number; p75: number }> = {
  "visitor_to_signup": { p25: 2, p50: 4, p75: 8 },
  "signup_to_activation": { p25: 20, p50: 35, p75: 50 },
  "activation_to_paid": { p25: 5, p50: 12, p75: 25 },
  "paid_to_retained_m1": { p25: 70, p50: 80, p75: 90 },
  "paid_to_retained_m3": { p25: 50, p50: 65, p75: 80 },
  "paid_to_retained_m12": { p25: 30, p50: 45, p75: 65 },
};

export function analyzeFunnel(input: {
  monthlyVisitors: number;
  signups: number;
  activatedUsers: number;
  paidUsers: number;
  retainedM1: number;
}): ConversionAnalysis {
  const stages: FunnelStage[] = [];

  const signupRate = (input.signups / Math.max(1, input.monthlyVisitors)) * 100;
  const activationRate = (input.activatedUsers / Math.max(1, input.signups)) * 100;
  const paidRate = (input.paidUsers / Math.max(1, input.activatedUsers)) * 100;
  const retentionRate = (input.retainedM1 / Math.max(1, input.paidUsers)) * 100;

  const benchSignup = SAAS_FUNNEL_BENCHMARKS["visitor_to_signup"]?.p50 ?? 4;
  const benchActivation = SAAS_FUNNEL_BENCHMARKS["signup_to_activation"]?.p50 ?? 35;
  const benchPaid = SAAS_FUNNEL_BENCHMARKS["activation_to_paid"]?.p50 ?? 12;
  const benchRetention = SAAS_FUNNEL_BENCHMARKS["paid_to_retained_m1"]?.p50 ?? 80;

  stages.push(
    { name: "Visitor → Signup", visitors: input.monthlyVisitors, conversionRate: round(signupRate), dropoffRate: round(100 - signupRate), benchmark: benchSignup, gap: round(benchSignup - signupRate) },
    { name: "Signup → Activation", visitors: input.signups, conversionRate: round(activationRate), dropoffRate: round(100 - activationRate), benchmark: benchActivation, gap: round(benchActivation - activationRate) },
    { name: "Activation → Paid", visitors: input.activatedUsers, conversionRate: round(paidRate), dropoffRate: round(100 - paidRate), benchmark: benchPaid, gap: round(benchPaid - paidRate) },
    { name: "Paid → Retained (M1)", visitors: input.paidUsers, conversionRate: round(retentionRate), dropoffRate: round(100 - retentionRate), benchmark: benchRetention, gap: round(benchRetention - retentionRate) },
  );

  // Find the biggest gap
  const sorted = [...stages].sort((a, b) => b.gap - a.gap);
  const bottleneck = sorted[0]?.name ?? "Unknown";
  const overallConversion = (input.paidUsers / Math.max(1, input.monthlyVisitors)) * 100;

  // Improvement potential: if all stages hit p50 benchmark
  const benchConversion = (benchSignup / 100) * (benchActivation / 100) * (benchPaid / 100) * 100;
  const improvementPotential = round(benchConversion - overallConversion);

  const recommendations: string[] = [];
  if (signupRate < benchSignup) recommendations.push(`Improve signup flow: ${round(signupRate)}% vs ${benchSignup}% benchmark. Try simplifying the form, adding social proof, or offering a free trial.`);
  if (activationRate < benchActivation) recommendations.push(`Boost activation: ${round(activationRate)}% vs ${benchActivation}% benchmark. Add onboarding wizard, welcome email series, or in-app guidance.`);
  if (paidRate < benchPaid) recommendations.push(`Increase paid conversion: ${round(paidRate)}% vs ${benchPaid}% benchmark. Try better pricing page, free-to-paid triggers, or limited-time offers.`);
  if (retentionRate < benchRetention) recommendations.push(`Reduce churn: ${round(retentionRate)}% vs ${benchRetention}% benchmark. Add engagement emails, feature discovery prompts, or success milestones.`);

  return {
    funnel: stages,
    overallConversion: round(overallConversion),
    bottleneck,
    improvementPotential,
    recommendations,
  };
}

// ── Retention Curve Generation ─────────────────────────────────────────

export function generateRetentionCurve(input: {
  monthlyRetention: number;
  months?: number;
  startUsers?: number;
}): number[] {
  const months = input.months ?? 12;
  const rate = input.monthlyRetention / 100;
  const curve: number[] = [100];

  for (let i = 1; i < months; i++) {
    curve.push(round(curve[i - 1] * rate));
  }

  return curve;
}

// ── Pricing Model Analysis ─────────────────────────────────────────────

export function analyzePricing(tiers: PricingTier[]): {
  weightedARPU: number;
  projectedMRR: number;
  revenueByTier: { name: string; percent: number; revenue: number }[];
} {
  const totalRevenue = tiers.reduce((s, t) => s + t.estimatedRevenue, 0);
  const totalCustomers = tiers.reduce((s, t) => s + Math.round(t.estimatedConversion), 0);

  return {
    weightedARPU: totalCustomers > 0 ? round(totalRevenue / totalCustomers) : 0,
    projectedMRR: Math.round(totalRevenue),
    revenueByTier: tiers.map((t) => ({
      name: t.name,
      percent: totalRevenue > 0 ? round((t.estimatedRevenue / totalRevenue) * 100) : 0,
      revenue: Math.round(t.estimatedRevenue),
    })),
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── SaaS Retention Benchmarks ──────────────────────────────────────────

export const RETENTION_BENCHMARKS: Record<string, { good: number; great: number; elite: number }> = {
  "b2b_saas_monthly": { good: 85, great: 92, elite: 97 },
  "b2c_saas_monthly": { good: 70, great: 80, elite: 90 },
  "marketplace_monthly": { good: 60, great: 75, elite: 85 },
  "b2b_saas_annual": { good: 80, great: 90, elite: 95 },
  "net_revenue_retention": { good: 100, great: 110, elite: 130 },
};
