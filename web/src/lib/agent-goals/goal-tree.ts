// CEO Goal Tree — Hierarchical goal structure from CEO down to all C-Level agents.
//
// Defines the strategic goal tree for BlockID.au's AI agent ecosystem.
// Each agent has specific criteria ownership, report sections, skills, and KPIs.
// This structure drives both internal platform operations and customer report generation.

import type { CriterionKey } from "@/lib/evaluation-criteria";

// ── Types ───────────────────────────────────────────────────────────────────

export interface AgentKPI {
  metric: string;
  label: string;
  target: number;
  unit: string;
}

export interface AgentGoal {
  id: string;
  agent: string;
  title: string;
  mission: string;
  kpis: AgentKPI[];
  criteriaOwned: CriterionKey[];
  reportSections: string[];
  skills: string[];
  researchTopics: string[];
  researchFrequency: string;
  subGoals: AgentGoal[];
}

// ── Master Goal Tree ────────────────────────────────────────────────────────

export const CEO_GOAL_TREE: AgentGoal = {
  id: "ceo-master",
  agent: "ceo",
  title: "Build the #1 Startup Navigation System for AU — SVI = Startup Positioning Engine",
  mission: "Reposition BlockID from a valuation/equity tool into a Startup Navigation System ('Google Maps for Startups') built on the SCN framework — Validation → Position → Value → Direction → Capital (see .claude/goals/scn-startup-navigation-system.md). Orchestrate all C-Level agents to research each layer deeply and continuously upgrade the report/analysis + dashboard so founders instantly see 'Where am I' (Index + Stage + Top X% percentile) and 'What to do next' (Next Best Action). Reach A$1B.",
  kpis: [
    { metric: "total_users", label: "Total Users", target: 10000, unit: "users" },
    { metric: "mrr_aud", label: "Monthly Recurring Revenue", target: 50000, unit: "AUD" },
    { metric: "report_quality_avg", label: "Average Report Quality", target: 85, unit: "score" },
    { metric: "nps", label: "Net Promoter Score", target: 70, unit: "score" },
  ],
  criteriaOwned: [],
  reportSections: ["executive", "board_memo"],
  skills: [],
  researchTopics: [
    "SCN framework: Validation → Position → Value → Direction → Capital sequencing",
    "Startup Navigation System positioning vs Crunchbase/PitchBook/Carta (the Direction gap)",
    "Startup percentile/positioning models — ranking 'Top X% of AU startups'",
    "Next-Best-Action engines for founders (You-are-here → Next → Then)",
    "Global startup ecosystem trends",
  ],
  researchFrequency: "weekly-sun",
  subGoals: [
    {
      id: "cto-goal",
      agent: "cto",
      title: "Ship Reliable, Secure Platform",
      mission: "Ensure platform stability, security, and technical excellence. Evaluate startup code quality and architecture for customer reports.",
      kpis: [
        { metric: "uptime", label: "Platform Uptime", target: 99.9, unit: "%" },
        { metric: "api_latency_p95", label: "API P95 Latency", target: 500, unit: "ms" },
        { metric: "security_score", label: "Security Score", target: 90, unit: "score" },
      ],
      criteriaOwned: ["code_git", "website"],
      reportSections: ["code", "cybersecurity"],
      skills: ["/cto", "/perf-audit", "/security-audit"],
      researchTopics: [
        "Code quality assessment frameworks",
        "Security benchmarks (Essential Eight, OWASP)",
        "Modern tech stack evaluation criteria",
      ],
      researchFrequency: "bi-weekly-sat",
      subGoals: [],
    },
    {
      id: "cfo-goal",
      agent: "cfo",
      title: "Drive Sustainable Revenue & Financial Intelligence",
      mission: "Optimize platform revenue, manage costs, and provide world-class financial analysis in customer reports.",
      kpis: [
        { metric: "mrr_growth", label: "MRR Growth Rate", target: 15, unit: "%" },
        { metric: "gross_margin", label: "Gross Margin", target: 80, unit: "%" },
        { metric: "credit_utilization", label: "Credit Utilization", target: 60, unit: "%" },
      ],
      criteriaOwned: ["revenue", "dataroom"],
      reportSections: ["revenue", "au_market"],
      skills: ["/cfo", "/cfo revenue", "/cfo unit-economics"],
      researchTopics: [
        "SaaS benchmarks (Bessemer, SaaS Capital)",
        "AU startup funding data (AVCAL)",
        "R&D Tax Incentive updates",
        "Unit economics norms by stage",
      ],
      researchFrequency: "weekly-mon",
      subGoals: [],
    },
    {
      id: "cpo-goal",
      agent: "cpo",
      title: "Build Best-in-Class Product Experience",
      mission: "Drive product innovation, evaluate startup ideas and roadmaps for customer reports.",
      kpis: [
        { metric: "feature_adoption", label: "Feature Adoption", target: 60, unit: "%" },
        { metric: "onboarding_completion", label: "Onboarding Completion", target: 80, unit: "%" },
        { metric: "product_nps", label: "Product NPS", target: 50, unit: "score" },
      ],
      criteriaOwned: ["idea", "roadmap"],
      reportSections: ["idea", "roadmap"],
      skills: ["/cpo", "/cpo spec", "/cpo prioritize"],
      researchTopics: [
        "UX benchmarks for SaaS tools",
        "Product-led growth case studies",
        "Feature prioritization frameworks",
        "SCN dashboard design: Position hero (Index + Stage + percentile) above valuation, SCN section ordering",
        "Validation panel for early-stage founders (problem-worth, market, willingness-to-pay)",
        "First-principles question engine: Socratic prompts that surface the founder's real problem and route to the next BlockID feature",
        "SCN report + PDF redesign: problem framing → Position hero → Next-Best-Action, with contextual CTAs (scn-report-firstprinciples-redesign brief)",
      ],
      researchFrequency: "bi-weekly-thu",
      subGoals: [],
    },
    {
      id: "cmo-goal",
      agent: "cmo",
      title: "Grow User Base & Market Presence",
      mission: "Drive platform growth via SEO, content, and partnerships. Evaluate startup market opportunity and GTM for customer reports.",
      kpis: [
        { metric: "organic_traffic", label: "Organic Traffic", target: 50000, unit: "visits/mo" },
        { metric: "signup_rate", label: "Signup Conversion", target: 5, unit: "%" },
        { metric: "content_published", label: "Content Published", target: 8, unit: "articles/mo" },
      ],
      criteriaOwned: ["market", "gtm_strategy", "website"],
      reportSections: ["market", "website", "gtm", "competitive"],
      skills: ["/cmo", "/seo-audit", "/rnd"],
      researchTopics: [
        "Competitor feature releases",
        "SEO algorithm updates",
        "AU startup ecosystem reports",
        "Content marketing benchmarks",
        "Positioning a 'Startup Navigation System' (Google Maps for Startups) — messaging vs valuation/equity tools",
      ],
      researchFrequency: "weekly-tue",
      subGoals: [],
    },
    {
      id: "cro-goal",
      agent: "cro",
      title: "Maximize Conversion & Retention",
      mission: "Optimize platform funnel and retention. Evaluate startup traction metrics for customer reports.",
      kpis: [
        { metric: "activation_rate", label: "Activation Rate", target: 40, unit: "%" },
        { metric: "monthly_retention", label: "Monthly Retention", target: 80, unit: "%" },
        { metric: "expansion_revenue", label: "Expansion Revenue", target: 20, unit: "%" },
      ],
      criteriaOwned: ["customer_size"],
      reportSections: ["customers"],
      skills: ["/cro", "/cro retention"],
      researchTopics: [
        "SaaS conversion benchmarks by stage",
        "Retention curve norms",
        "Pricing psychology research",
        "Next-Best-Action / DIRECTION engine: sequencing founder actions by weakest SCN layer + stage",
        "Funding Readiness scoring (CAPITAL) — what makes a startup investor-ready",
      ],
      researchFrequency: "weekly-wed",
      subGoals: [],
    },
    {
      id: "clo-goal",
      agent: "clo",
      title: "Ensure Legal Compliance & IP Protection",
      mission: "Protect the platform legally and evaluate startup document quality and compliance for customer reports.",
      kpis: [
        { metric: "compliance_score", label: "Compliance Score", target: 95, unit: "score" },
        { metric: "legal_doc_coverage", label: "Legal Document Coverage", target: 100, unit: "%" },
      ],
      criteriaOwned: ["documents", "dataroom"],
      reportSections: ["documents", "dataroom", "risk"],
      skills: ["/clo", "/au-compliance"],
      researchTopics: [
        "ASIC guidance updates",
        "Privacy Act amendments",
        "IP Australia policy changes",
        "ESIC ruling updates",
      ],
      researchFrequency: "monthly-2nd-sat",
      subGoals: [],
    },
    {
      id: "chro-goal",
      agent: "chro",
      title: "Build World-Class Team Assessment",
      mission: "Evaluate startup teams, founders, and org structures for customer reports. Drive platform team building.",
      kpis: [
        { metric: "team_satisfaction", label: "Team Satisfaction", target: 85, unit: "score" },
        { metric: "hiring_success_rate", label: "Hiring Success Rate", target: 80, unit: "%" },
      ],
      criteriaOwned: ["founder_profile", "team", "team_structure"],
      reportSections: ["founder", "team", "org"],
      skills: ["/chro"],
      researchTopics: [
        "AU startup hiring benchmarks",
        "ESOP norms (Division 83A)",
        "Team composition patterns for successful startups",
      ],
      researchFrequency: "monthly-1st-sat",
      subGoals: [],
    },
    {
      id: "ciso-goal",
      agent: "ciso",
      title: "Protect Platform & Assess Startup Security",
      mission: "Maintain platform security posture and evaluate startup security for customer reports.",
      kpis: [
        { metric: "vulnerability_count", label: "Open Vulnerabilities", target: 0, unit: "count" },
        { metric: "essential_eight_maturity", label: "Essential Eight Maturity", target: 3, unit: "level" },
      ],
      criteriaOwned: ["code_git"],
      reportSections: ["cybersecurity"],
      skills: ["/ciso", "/security-audit"],
      researchTopics: [
        "ACSC alerts",
        "Essential Eight updates",
        "New vulnerability categories",
      ],
      researchFrequency: "weekly-sun",
      subGoals: [],
    },
    {
      id: "cdo-goal",
      agent: "cdo",
      title: "Ensure Data Quality & AI Governance",
      mission: "Cross-validate report quality, ensure data integrity, and assess startup data strategy.",
      kpis: [
        { metric: "data_quality_score", label: "Data Quality Score", target: 90, unit: "score" },
        { metric: "consistency_rate", label: "Report Consistency Rate", target: 95, unit: "%" },
      ],
      criteriaOwned: [],
      reportSections: ["data_strategy"],
      skills: ["/cdo", "/analytics"],
      researchTopics: [
        "Data quality frameworks",
        "AI governance best practices (NIST AI RMF)",
        "Analytics maturity models",
      ],
      researchFrequency: "monthly-3rd-sat",
      subGoals: [],
    },
    {
      id: "coo-goal",
      agent: "coo",
      title: "Operational Excellence & Quality Assurance",
      mission: "Ensure operational efficiency, report quality, and create actionable plans for customer reports.",
      kpis: [
        { metric: "report_generation_time", label: "Report Generation Time", target: 60, unit: "seconds" },
        { metric: "report_quality_min", label: "Min Report Quality", target: 70, unit: "score" },
        { metric: "sprint_velocity", label: "Sprint Velocity", target: 80, unit: "%" },
      ],
      criteriaOwned: ["team_structure"],
      reportSections: ["action_plan"],
      skills: ["/coo", "/qa-lead"],
      researchTopics: [
        "Sprint velocity benchmarks",
        "Deployment frequency norms",
        "Quality gate standards",
      ],
      researchFrequency: "bi-weekly-fri",
      subGoals: [],
    },
    {
      id: "rnd-goal",
      agent: "rnd",
      title: "Continuous Market R&D & Experimentation",
      mission: "Scan the market every day — competitor moves, AU startup ecosystem shifts, emerging founder pain points, and new AI tooling — and feed fresh intelligence to CMO/CPO for features, positioning, and experiments. This is the platform's time-sensitive radar: research that must refresh daily, not weekly.",
      kpis: [
        { metric: "features_proposed", label: "Features Proposed", target: 8, unit: "ideas/mo" },
        { metric: "experiments_run", label: "Experiments Run", target: 4, unit: "experiments/mo" },
        { metric: "competitor_coverage", label: "Competitors Tracked", target: 6, unit: "competitors" },
      ],
      criteriaOwned: [],
      reportSections: [],
      skills: ["/rnd", "/deep-research"],
      researchTopics: [
        "Competitor moves (Carta, Pulley, Equidam, Cake Equity, Finta, SeedLegals) — features, pricing, funding",
        "AU startup ecosystem: new grants, accelerators, funding rounds, ESIC/R&D Tax changes",
        "Emerging founder pain points & feature opportunities",
        "Conversion/CTA experiment ideas & A/B test hypotheses",
        "New AI tools & capabilities relevant to startup tooling",
      ],
      researchFrequency: "daily",
      subGoals: [],
    },
  ],
};

// ── Lookup Helpers ──────────────────────────────────────────────────────────

export function getAgentGoal(agentId: string): AgentGoal | undefined {
  if (CEO_GOAL_TREE.agent === agentId) return CEO_GOAL_TREE;
  return CEO_GOAL_TREE.subGoals.find((g) => g.agent === agentId);
}

export function getAllAgentGoals(): AgentGoal[] {
  return [CEO_GOAL_TREE, ...CEO_GOAL_TREE.subGoals];
}

export function getAgentCriteria(agentId: string): CriterionKey[] {
  const goal = getAgentGoal(agentId);
  return goal?.criteriaOwned ?? [];
}

export function getAgentReportSections(agentId: string): string[] {
  const goal = getAgentGoal(agentId);
  return goal?.reportSections ?? [];
}
