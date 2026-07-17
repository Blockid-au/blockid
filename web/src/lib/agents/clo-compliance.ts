// CLO Domain: Legal Compliance & IP Protection (AU-focused)
//
// Australian regulatory compliance checklist, legal document coverage,
// risk assessment, IP protection analysis, and current-year research
// datapoints sourced from ATO / ASIC / OAIC / IP Australia.

export interface ComplianceItem {
  id: string;
  category: string;
  requirement: string;
  description: string;
  authority: string;
  priority: "critical" | "high" | "medium" | "low";
  stage: number;
  link: string;
}

export interface ComplianceAssessment {
  items: ComplianceItem[];
  completed: string[];
  score: number;
  missingCritical: ComplianceItem[];
  nextSteps: string[];
}

// ── AU Startup Compliance Checklist ────────────────────────────────────

export const AU_COMPLIANCE_CHECKLIST: ComplianceItem[] = [
  // Stage 0-1: Formation
  { id: "abn", category: "Registration", requirement: "Australian Business Number (ABN)", description: "Required for all business activity in Australia", authority: "ABR", priority: "critical", stage: 0, link: "https://abr.gov.au" },
  { id: "acn", category: "Registration", requirement: "Australian Company Number (ACN)", description: "Required for Pty Ltd company registration", authority: "ASIC", priority: "critical", stage: 0, link: "https://asic.gov.au" },
  { id: "constitution", category: "Governance", requirement: "Company Constitution", description: "Rules governing company operations and shareholder rights", authority: "ASIC", priority: "high", stage: 0, link: "" },
  { id: "directors", category: "Governance", requirement: "Director ID verification", description: "All directors must have a Director ID", authority: "ABRS", priority: "critical", stage: 0, link: "https://abrs.gov.au/director-id" },

  // Stage 1-2: Structure
  { id: "sha", category: "Agreements", requirement: "Shareholders Agreement (SHA)", description: "Defines rights, obligations, and exit provisions for shareholders", authority: "Legal", priority: "high", stage: 1, link: "" },
  { id: "esop", category: "Equity", requirement: "Employee Share Option Plan (ESOP)", description: "Division 83A compliant ESOP for team incentives", authority: "ATO", priority: "medium", stage: 1, link: "https://ato.gov.au" },
  { id: "vesting", category: "Equity", requirement: "Vesting Schedule Documentation", description: "Cliff and linear vesting terms for founders and employees", authority: "Legal", priority: "high", stage: 1, link: "" },
  { id: "ip_assignment", category: "IP", requirement: "IP Assignment Deed", description: "Assign all founder IP to the company", authority: "Legal", priority: "critical", stage: 1, link: "" },

  // Stage 2-3: Operations
  { id: "privacy_policy", category: "Privacy", requirement: "Privacy Policy (APPs compliant)", description: "Privacy Act 1988 compliant privacy policy", authority: "OAIC", priority: "critical", stage: 2, link: "https://oaic.gov.au" },
  { id: "terms", category: "Legal", requirement: "Terms of Service", description: "User-facing terms and conditions", authority: "ACCC", priority: "high", stage: 2, link: "" },
  { id: "trademark", category: "IP", requirement: "Trademark Registration", description: "Register brand name and logo with IP Australia", authority: "IP Australia", priority: "medium", stage: 2, link: "https://ipaustralia.gov.au" },
  { id: "bas", category: "Tax", requirement: "BAS/GST Registration", description: "Register for GST if turnover exceeds $75K", authority: "ATO", priority: "high", stage: 2, link: "https://ato.gov.au" },

  // Stage 3-4: Fundraise
  { id: "cap_table", category: "Equity", requirement: "Cap Table Documentation", description: "Complete record of all shareholders, options, and convertible notes", authority: "ASIC", priority: "critical", stage: 3, link: "" },
  { id: "data_room", category: "Fundraise", requirement: "Investor Data Room", description: "Organized repository of legal, financial, and operational documents", authority: "Investor Standard", priority: "high", stage: 3, link: "" },
  { id: "safe_note", category: "Fundraise", requirement: "SAFE/Convertible Note Terms", description: "Standardized fundraising instrument terms", authority: "Legal", priority: "high", stage: 3, link: "" },
  { id: "esic", category: "Tax", requirement: "ESIC Certification Check", description: "Early Stage Innovation Company tax incentive eligibility", authority: "ATO", priority: "medium", stage: 3, link: "https://ato.gov.au/esic" },

  // Stage 4-5: Scale
  { id: "rnd_tax", category: "Tax", requirement: "R&D Tax Incentive Application", description: "43.5% refundable tax offset for eligible R&D activities", authority: "AusIndustry", priority: "high", stage: 4, link: "https://business.gov.au/rnd" },
  { id: "employment", category: "Employment", requirement: "Employment Contracts & Fair Work", description: "NES compliant contracts, superannuation, and award rates", authority: "Fair Work", priority: "critical", stage: 4, link: "https://fairwork.gov.au" },
  { id: "insurance", category: "Insurance", requirement: "Business Insurance Portfolio", description: "Professional indemnity, public liability, D&O insurance", authority: "ASIC", priority: "high", stage: 4, link: "" },
  { id: "annual_review", category: "Governance", requirement: "Annual Review & ASIC Filing", description: "Annual company statement and solvency resolution", authority: "ASIC", priority: "critical", stage: 4, link: "https://asic.gov.au" },
];

// ── Risk Assessment Matrix ─────────────────────────────────────────────

export interface RiskItem {
  category: string;
  risk: string;
  likelihood: "low" | "medium" | "high";
  impact: "low" | "medium" | "high";
  score: number;
  mitigation: string;
}

export function assessStartupRisks(input: {
  stage: number;
  hasIP: boolean;
  hasLegalDocs: boolean;
  hasInsurance: boolean;
  employeeCount: number;
  handlesUserData: boolean;
}): RiskItem[] {
  const risks: RiskItem[] = [];

  if (!input.hasIP) {
    risks.push({ category: "IP", risk: "No IP protection — founders or contractors could claim ownership", likelihood: "medium", impact: "high", score: 8, mitigation: "Execute IP Assignment Deed immediately" });
  }

  if (!input.hasLegalDocs && input.stage >= 1) {
    risks.push({ category: "Legal", risk: "Operating without shareholders agreement — disputes unresolvable", likelihood: "medium", impact: "high", score: 8, mitigation: "Draft and execute SHA with vesting terms" });
  }

  if (input.handlesUserData) {
    risks.push({ category: "Privacy", risk: "User data handling without APPs compliance", likelihood: "high", impact: "high", score: 9, mitigation: "Implement Privacy Policy, consent flows, and data breach plan" });
  }

  if (input.employeeCount > 0 && !input.hasInsurance) {
    risks.push({ category: "Employment", risk: "Employees without proper contracts or insurance", likelihood: "medium", impact: "high", score: 7, mitigation: "Draft NES-compliant contracts, get workers comp and PI insurance" });
  }

  if (input.stage >= 3 && !input.hasLegalDocs) {
    risks.push({ category: "Fundraise", risk: "Fundraising without proper documentation deters investors", likelihood: "high", impact: "high", score: 9, mitigation: "Complete cap table, SHA, constitution, and data room before approaching investors" });
  }

  return risks.sort((a, b) => b.score - a.score);
}

export function calculateComplianceScore(stage: number, completedItems: string[]): ComplianceAssessment {
  const relevant = AU_COMPLIANCE_CHECKLIST.filter((item) => item.stage <= stage);
  const completed = completedItems.filter((id) => relevant.some((item) => item.id === id));
  const score = relevant.length > 0 ? Math.round((completed.length / relevant.length) * 100) : 0;
  const missingCritical = relevant.filter((item) => item.priority === "critical" && !completed.includes(item.id));

  const nextSteps = relevant
    .filter((item) => !completed.includes(item.id))
    .sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    })
    .slice(0, 5)
    .map((item) => `${item.requirement} (${item.authority}) — ${item.description}`);

  return { items: relevant, completed, score, missingCritical, nextSteps };
}

// ── Research datapoints (refreshed by CLO cron) ─────────────────────────

export interface DataPoint {
  value: string;
  metric: string;
  source: string;
}

export interface ResearchTopic {
  topic: string;
  confidence: number;
  data_points: DataPoint[];
  key_findings: string[];
}

export const ESIC_RESEARCH: ResearchTopic = {
  topic: "ESIC ruling updates",
  confidence: 0.8,
  data_points: [
    { value: "20% non-refundable carry-forward tax offset", metric: "ESIC investor tax offset", source: "ATO ESIC tax offset guidance" },
    { value: "AU$200,000/yr per investor", metric: "Maximum tax offset per investor per year (sophisticated)", source: "ATO Div 360" },
    { value: "10-year CGT exemption", metric: "CGT treatment on ESIC shares held ≥12 months", source: "ATO Div 360" },
  ],
  key_findings: [
    "ESIC status remains a critical fundraising signal for AU angel investors",
    "Founders must satisfy both early-stage and innovation limbs at time of issue",
  ],
};

export const IP_AU_RESEARCH: ResearchTopic = {
  topic: "IP Australia policy changes",
  confidence: 0.8,
  data_points: [
    { value: "9-12 months", metric: "Average time to first examination for patent applications", source: "IP Australia Annual Report 2022-2023" },
    { value: "AU$250-AU$550", metric: "Trademark application fee range (per class)", source: "IP Australia Fee Schedule 2024" },
  ],
  key_findings: [
    "Standard patent examination remains 9-12 months without expedited request",
    "Innovation patents phased out (2021) — designs + standard patents only",
  ],
};

export const PRIVACY_ACT_RESEARCH: ResearchTopic = {
  topic: "Privacy Act amendments",
  confidence: 0.9,
  data_points: [
    { value: "AU$50m / 30% of turnover / 3× benefit", metric: "Maximum civil penalty for serious/repeated interference", source: "Privacy Legislation Amendment Act 2022" },
    { value: "30 days", metric: "OAIC notifiable data breach reporting window", source: "Privacy Act 1988 s26WK" },
  ],
  key_findings: [
    "Penalties increased ~10× from previous AU$2.22m cap",
    "OAIC has new infringement notice + external dispute resolution powers",
  ],
};

export const ASIC_RESEARCH: ResearchTopic = {
  topic: "ASIC fundraising guidance updates",
  confidence: 0.8,
  data_points: [
    { value: "AU$2m raised / 20 investors / 12 months", metric: "s708 small-scale personal offer exemption cap", source: "Corporations Act 2001 s708(1)" },
    { value: "AU$5m per issuer, AU$10k per retail investor", metric: "Crowd-sourced funding (CSF) caps under s738G", source: "ASIC Regulatory Guide 261" },
  ],
  key_findings: [
    "Wholesale-investor certificates (s708(8) & (11)) remain the primary path for uncapped raises",
    "Retail raises without a disclosure document must fit one of s708 exemptions",
  ],
};

// ── Numeric helpers (used by CLO reports) ──────────────────────────────

/** Estimate ESIC investor tax offset at the 20% statutory rate. */
export function estimateEsicTaxOffset(eligibleInvestment: number): number {
  return Math.round(eligibleInvestment * 0.20);
}

/** Maximum civil penalty per serious/repeated Privacy Act breach. */
export function maxPrivacyPenalty(annualTurnover: number, benefitObtained = 0): number {
  const capFixed = 50_000_000;
  const capTurnover = annualTurnover * 0.30;
  const capBenefit = benefitObtained * 3;
  return Math.max(capFixed, capTurnover, capBenefit);
}

/** Midpoint months for standard patent examination. */
export function averagePatentExaminationTime(): number {
  return 10.5;
}

/** Trademark application fee range (AUD per class). */
export function trademarkFeeRange(): [number, number] {
  return [250, 550];
}
