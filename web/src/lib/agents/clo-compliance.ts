// CLO Domain: Legal Compliance & IP Protection (AU-focused)
//
// Australian regulatory compliance checklist, legal document coverage,
// risk assessment, and IP protection analysis.

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
