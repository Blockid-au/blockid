// CTO Domain: Technical Cost Modeling & Development Planning
//
// Estimates development costs, AI model usage, infrastructure expenses,
// and technical resource allocation for startup planning.

export interface TechStackCost {
  category: string;
  items: TechItem[];
  monthlyCost: number;
}

export interface TechItem {
  name: string;
  type: "infra" | "service" | "tool" | "ai_model";
  monthlyCost: number;
  unit: string;
  notes: string;
}

export interface DevelopmentCost {
  phase: string;
  durationWeeks: number;
  teamSize: TeamMember[];
  weeklyBurn: number;
  totalCost: number;
  milestones: string[];
}

export interface TeamMember {
  role: string;
  count: number;
  weeklyRate: number;
  isFullTime: boolean;
}

export interface TechBudgetProjection {
  months: TechBudgetMonth[];
  totalInfra12: number;
  totalDev12: number;
  totalAI12: number;
  totalTools12: number;
  grandTotal12: number;
}

export interface TechBudgetMonth {
  month: number;
  label: string;
  infra: number;
  development: number;
  aiModels: number;
  tools: number;
  total: number;
}

// ── AU Developer Rate Benchmarks ───────────────────────────────────────

export const AU_DEV_RATES: Record<string, { junior: number; mid: number; senior: number; lead: number }> = {
  "full-stack": { junior: 1200, mid: 1800, senior: 2500, lead: 3200 },
  "frontend": { junior: 1100, mid: 1700, senior: 2300, lead: 3000 },
  "backend": { junior: 1200, mid: 1800, senior: 2600, lead: 3300 },
  "mobile": { junior: 1300, mid: 1900, senior: 2700, lead: 3400 },
  "devops": { junior: 1400, mid: 2000, senior: 2800, lead: 3500 },
  "data-engineer": { junior: 1300, mid: 2000, senior: 2800, lead: 3500 },
  "designer": { junior: 900, mid: 1400, senior: 2000, lead: 2600 },
  "product-manager": { junior: 1100, mid: 1700, senior: 2500, lead: 3200 },
};

// ── Infrastructure Cost Templates ──────────────────────────────────────

const INFRA_TEMPLATES: Record<string, TechStackCost[]> = {
  mvp: [
    {
      category: "Hosting",
      items: [
        { name: "VPS (4 vCPU, 8GB RAM)", type: "infra", monthlyCost: 40, unit: "/mo", notes: "Hetzner/DigitalOcean" },
        { name: "Domain + SSL", type: "infra", monthlyCost: 2, unit: "/mo", notes: "Cloudflare free SSL" },
        { name: "CDN", type: "infra", monthlyCost: 0, unit: "/mo", notes: "Cloudflare free tier" },
      ],
      monthlyCost: 42,
    },
    {
      category: "Database",
      items: [
        { name: "PostgreSQL (self-hosted)", type: "infra", monthlyCost: 0, unit: "/mo", notes: "On same VPS" },
        { name: "Redis (self-hosted)", type: "infra", monthlyCost: 0, unit: "/mo", notes: "On same VPS" },
      ],
      monthlyCost: 0,
    },
    {
      category: "AI Models",
      items: [
        { name: "Free models (OpenRouter, Groq)", type: "ai_model", monthlyCost: 0, unit: "/mo", notes: "Free tier" },
        { name: "Paid AI fallback", type: "ai_model", monthlyCost: 20, unit: "/mo", notes: "For premium features" },
      ],
      monthlyCost: 20,
    },
    {
      category: "Tools",
      items: [
        { name: "GitHub (free)", type: "tool", monthlyCost: 0, unit: "/mo", notes: "Public/private repos" },
        { name: "Email (Resend)", type: "service", monthlyCost: 0, unit: "/mo", notes: "Free tier 100/day" },
        { name: "Analytics (self-hosted)", type: "tool", monthlyCost: 0, unit: "/mo", notes: "Plausible or similar" },
      ],
      monthlyCost: 0,
    },
  ],
  growth: [
    {
      category: "Hosting",
      items: [
        { name: "Dedicated Server (8 vCPU, 32GB)", type: "infra", monthlyCost: 120, unit: "/mo", notes: "Primary" },
        { name: "Backup Server", type: "infra", monthlyCost: 40, unit: "/mo", notes: "Warm standby" },
        { name: "CDN Pro", type: "infra", monthlyCost: 20, unit: "/mo", notes: "Cloudflare Pro" },
      ],
      monthlyCost: 180,
    },
    {
      category: "Database",
      items: [
        { name: "PostgreSQL (managed)", type: "infra", monthlyCost: 50, unit: "/mo", notes: "Supabase Pro or RDS" },
        { name: "Redis (managed)", type: "infra", monthlyCost: 25, unit: "/mo", notes: "Upstash or ElastiCache" },
      ],
      monthlyCost: 75,
    },
    {
      category: "AI Models",
      items: [
        { name: "OpenAI API", type: "ai_model", monthlyCost: 200, unit: "/mo", notes: "GPT-4 for premium" },
        { name: "Anthropic API", type: "ai_model", monthlyCost: 150, unit: "/mo", notes: "Claude for analysis" },
        { name: "Free models (backup)", type: "ai_model", monthlyCost: 0, unit: "/mo", notes: "Free tier fallback" },
      ],
      monthlyCost: 350,
    },
    {
      category: "Tools & Services",
      items: [
        { name: "GitHub Team", type: "tool", monthlyCost: 16, unit: "/seat", notes: "4 seats" },
        { name: "Email (Resend Pro)", type: "service", monthlyCost: 20, unit: "/mo", notes: "5000/mo" },
        { name: "Monitoring (Sentry)", type: "tool", monthlyCost: 26, unit: "/mo", notes: "Error tracking" },
        { name: "Stripe fees", type: "service", monthlyCost: 100, unit: "/mo est.", notes: "1.75% + 30c per tx" },
      ],
      monthlyCost: 210,
    },
  ],
};

export function getInfraTemplate(stage: string): TechStackCost[] {
  return INFRA_TEMPLATES[stage] ?? INFRA_TEMPLATES.mvp ?? [];
}

// ── Development Phase Estimation ───────────────────────────────────────

export function estimateDevelopmentPhases(input: {
  projectType: string;
  complexity: "simple" | "moderate" | "complex";
  teamSeniority: "junior" | "mid" | "senior";
}): DevelopmentCost[] {
  const multiplier = input.complexity === "complex" ? 1.5 : input.complexity === "moderate" ? 1.0 : 0.7;

  const baseRate = input.teamSeniority === "senior" ? 2500 : input.teamSeniority === "mid" ? 1800 : 1200;

  return [
    {
      phase: "Discovery & Design",
      durationWeeks: Math.round(2 * multiplier),
      teamSize: [
        { role: "Product Manager", count: 1, weeklyRate: baseRate * 0.9, isFullTime: false },
        { role: "Designer", count: 1, weeklyRate: baseRate * 0.7, isFullTime: false },
      ],
      weeklyBurn: Math.round(baseRate * 1.6),
      totalCost: Math.round(baseRate * 1.6 * 2 * multiplier),
      milestones: ["User research", "Wireframes", "Tech spec", "Architecture decision"],
    },
    {
      phase: "MVP Development",
      durationWeeks: Math.round(8 * multiplier),
      teamSize: [
        { role: "Full-stack Developer", count: 1, weeklyRate: baseRate, isFullTime: true },
        { role: "Designer (part-time)", count: 1, weeklyRate: baseRate * 0.3, isFullTime: false },
      ],
      weeklyBurn: Math.round(baseRate * 1.3),
      totalCost: Math.round(baseRate * 1.3 * 8 * multiplier),
      milestones: ["Core features", "Auth + billing", "Landing page", "Beta testing"],
    },
    {
      phase: "Launch & Iteration",
      durationWeeks: Math.round(4 * multiplier),
      teamSize: [
        { role: "Full-stack Developer", count: 1, weeklyRate: baseRate, isFullTime: true },
        { role: "Marketing (part-time)", count: 1, weeklyRate: baseRate * 0.4, isFullTime: false },
      ],
      weeklyBurn: Math.round(baseRate * 1.4),
      totalCost: Math.round(baseRate * 1.4 * 4 * multiplier),
      milestones: ["Public launch", "User feedback", "Bug fixes", "Analytics setup"],
    },
    {
      phase: "Growth Features",
      durationWeeks: Math.round(12 * multiplier),
      teamSize: [
        { role: "Full-stack Developer", count: 2, weeklyRate: baseRate, isFullTime: true },
        { role: "DevOps (part-time)", count: 1, weeklyRate: baseRate * 0.5, isFullTime: false },
      ],
      weeklyBurn: Math.round(baseRate * 2.5),
      totalCost: Math.round(baseRate * 2.5 * 12 * multiplier),
      milestones: ["Integrations", "Advanced features", "Performance optimization", "Scale prep"],
    },
  ];
}

// ── Tech Budget Projection ─────────────────────────────────────────────

export function generateTechBudget(input: {
  stage: string;
  devTeamSize: number;
  avgWeeklyRate: number;
  months?: number;
  aiGrowthRate?: number;
}): TechBudgetProjection {
  const months = input.months ?? 12;
  const infra = getInfraTemplate(input.stage);
  const baseInfra = infra.reduce((s, c) => s + c.monthlyCost, 0);
  const aiGrowth = (input.aiGrowthRate ?? 10) / 100;

  const result: TechBudgetMonth[] = [];
  const now = new Date();
  let totalInfra = 0, totalDev = 0, totalAI = 0, totalTools = 0;

  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

    // Infrastructure scales slowly
    const infraCost = Math.round(baseInfra * (1 + i * 0.02));
    const devCost = Math.round(input.devTeamSize * input.avgWeeklyRate * 4.33);
    // AI costs grow as usage increases
    const aiBase = infra.find((c) => c.category.includes("AI"))?.monthlyCost ?? 20;
    const aiCost = Math.round(aiBase * (1 + i * aiGrowth));
    const toolsCost = infra.find((c) => c.category.includes("Tool"))?.monthlyCost ?? 0;

    totalInfra += infraCost;
    totalDev += devCost;
    totalAI += aiCost;
    totalTools += toolsCost;

    result.push({
      month: i + 1,
      label,
      infra: infraCost,
      development: devCost,
      aiModels: aiCost,
      tools: toolsCost,
      total: infraCost + devCost + aiCost + toolsCost,
    });
  }

  return {
    months: result,
    totalInfra12: totalInfra,
    totalDev12: totalDev,
    totalAI12: totalAI,
    totalTools12: totalTools,
    grandTotal12: totalInfra + totalDev + totalAI + totalTools,
  };
}
