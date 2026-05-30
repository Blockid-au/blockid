// Evaluation Criteria — 13 startup assessment criteria definitions.
//
// These criteria form the user-facing evidence collection taxonomy.
// They layer on top of the existing 8 SVI dimensions (which remain the
// scoring engine). Each criterion maps to one or more SVI dimensions
// and is owned by a primary C-Level agent for report generation.

// ── Criterion Keys ──────────────────────────────────────────────────────────

export const CRITERION_KEYS = [
  "idea",
  "market",
  "founder_profile",
  "code_git",
  "website",
  "team",
  "customer_size",
  "gtm_strategy",
  "documents",
  "dataroom",
  "team_structure",
  "roadmap",
  "revenue",
] as const;

export type CriterionKey = (typeof CRITERION_KEYS)[number];

// ── Quality Levels ──────────────────────────────────────────────────────────

export const QUALITY_LEVELS = [
  "incomplete",
  "basic",
  "good",
  "strong",
  "exceptional",
] as const;

export type QualityLevel = (typeof QUALITY_LEVELS)[number];

// ── Criterion Definition ────────────────────────────────────────────────────

export interface CriterionDef {
  key: CriterionKey;
  title: string;
  titleVi: string;
  subtitle: string;
  icon: string;
  primaryDimension: string;
  secondaryDimensions: string[];
  primaryAgent: string;
  supportingAgents: string[];
  /** Minimum evidence items for "good" quality */
  minEvidence: number;
  /** Suggested file types for upload */
  suggestedFileTypes: string[];
  /** Suggested link types */
  suggestedLinks: string[];
  /** Guiding questions for the user */
  guidingQuestions: string[];
  /** Weight in the composite enhanced score (sums to 100) */
  weight: number;
}

// ── 13 Criteria Definitions ─────────────────────────────────────────────────

export const CRITERIA: CriterionDef[] = [
  {
    key: "idea",
    title: "Idea & Innovation",
    titleVi: "Y tuong & Doi moi sang tao",
    subtitle: "Uniqueness, problem-solution fit, innovation level",
    icon: "Lightbulb",
    primaryDimension: "mpc",
    secondaryDimensions: ["svm"],
    primaryAgent: "cpo",
    supportingAgents: ["cto", "cmo", "cdo"],
    minEvidence: 2,
    suggestedFileTypes: ["pdf", "pptx", "doc"],
    suggestedLinks: ["Product Hunt", "Landing page", "Demo video"],
    guidingQuestions: [
      "What problem does your idea solve?",
      "How is your solution different from existing alternatives?",
      "What is your unique insight or unfair advantage?",
      "Have you validated the idea with potential customers?",
    ],
    weight: 10,
  },
  {
    key: "market",
    title: "Market Opportunity",
    titleVi: "Co hoi thi truong",
    subtitle: "TAM/SAM/SOM, timing, competitive landscape",
    icon: "TrendingUp",
    primaryDimension: "mpc",
    secondaryDimensions: ["tre"],
    primaryAgent: "cmo",
    supportingAgents: ["cro", "cfo", "cdo"],
    minEvidence: 2,
    suggestedFileTypes: ["pdf", "xlsx", "csv"],
    suggestedLinks: ["Market research report", "Industry analysis", "ABS data"],
    guidingQuestions: [
      "What is your Total Addressable Market (TAM)?",
      "What is your Serviceable Addressable Market (SAM)?",
      "Why is now the right time for this market?",
      "Who are the main competitors?",
    ],
    weight: 12,
  },
  {
    key: "founder_profile",
    title: "Founder Profile",
    titleVi: "Ho so Nha sang lap",
    subtitle: "Background, track record, vision, domain expertise",
    icon: "User",
    primaryDimension: "ftv",
    secondaryDimensions: [],
    primaryAgent: "chro",
    supportingAgents: ["cpo", "clo"],
    minEvidence: 1,
    suggestedFileTypes: ["pdf", "doc"],
    suggestedLinks: ["LinkedIn profile", "Personal website", "Prior exits"],
    guidingQuestions: [
      "What is the lead founder's relevant experience?",
      "Have the founders worked together before?",
      "What domain expertise does the founding team bring?",
      "Any prior startup experience or exits?",
    ],
    weight: 8,
  },
  {
    key: "code_git",
    title: "Code & Git Repository",
    titleVi: "Ma nguon & Git",
    subtitle: "Code quality, architecture, commit history, test coverage",
    icon: "Code",
    primaryDimension: "ptd",
    secondaryDimensions: [],
    primaryAgent: "cto",
    supportingAgents: ["ciso", "cdo"],
    minEvidence: 1,
    suggestedFileTypes: [],
    suggestedLinks: ["GitHub repo", "GitLab repo", "Bitbucket repo"],
    guidingQuestions: [
      "Do you have a public or private code repository?",
      "What is your tech stack?",
      "Do you have automated tests?",
      "How many contributors are active?",
    ],
    weight: 6,
  },
  {
    key: "website",
    title: "Website & Digital Presence",
    titleVi: "Website & Hien dien so",
    subtitle: "Design quality, UX, performance, SEO, conversion",
    icon: "Globe",
    primaryDimension: "ptd",
    secondaryDimensions: ["tre"],
    primaryAgent: "cmo",
    supportingAgents: ["cto", "cro", "cpo"],
    minEvidence: 1,
    suggestedFileTypes: [],
    suggestedLinks: ["Website URL", "App Store link", "Google Play link"],
    guidingQuestions: [
      "What is your website or product URL?",
      "Do you have a mobile app?",
      "What is your current monthly traffic?",
      "What is your conversion rate?",
    ],
    weight: 5,
  },
  {
    key: "team",
    title: "Team Composition",
    titleVi: "Thanh phan doi ngu",
    subtitle: "Skills, complementary expertise, hiring plan",
    icon: "Users",
    primaryDimension: "ftv",
    secondaryDimensions: ["cgh"],
    primaryAgent: "chro",
    supportingAgents: ["clo", "cfo"],
    minEvidence: 1,
    suggestedFileTypes: ["pdf", "xlsx"],
    suggestedLinks: ["Team page", "LinkedIn profiles"],
    guidingQuestions: [
      "How many people are on the team?",
      "What key roles are filled (tech, business, design)?",
      "What critical roles are still missing?",
      "What is your hiring plan for the next 12 months?",
    ],
    weight: 8,
  },
  {
    key: "customer_size",
    title: "Customer Base & Traction",
    titleVi: "Khach hang & Suc keo",
    subtitle: "User base, growth rate, engagement metrics",
    icon: "BarChart3",
    primaryDimension: "tre",
    secondaryDimensions: [],
    primaryAgent: "cro",
    supportingAgents: ["cmo", "cdo", "cfo"],
    minEvidence: 1,
    suggestedFileTypes: ["xlsx", "csv", "pdf"],
    suggestedLinks: ["Google Analytics", "Mixpanel", "Amplitude"],
    guidingQuestions: [
      "How many active users/customers do you have?",
      "What is your monthly growth rate?",
      "What are your key engagement metrics?",
      "What is your user retention rate?",
    ],
    weight: 10,
  },
  {
    key: "gtm_strategy",
    title: "Go-to-Market Strategy",
    titleVi: "Chien luoc tham nhap thi truong",
    subtitle: "Distribution channels, pricing, acquisition strategy",
    icon: "Megaphone",
    primaryDimension: "mpc",
    secondaryDimensions: ["tre"],
    primaryAgent: "cmo",
    supportingAgents: ["cro", "cfo", "cpo"],
    minEvidence: 1,
    suggestedFileTypes: ["pdf", "pptx"],
    suggestedLinks: ["Marketing site", "Social media profiles"],
    guidingQuestions: [
      "What are your primary distribution channels?",
      "What is your pricing model?",
      "What is your customer acquisition cost (CAC)?",
      "How do you plan to scale customer acquisition?",
    ],
    weight: 8,
  },
  {
    key: "documents",
    title: "Key Documents",
    titleVi: "Tai lieu quan trong",
    subtitle: "Pitch deck, business plan, financial projections",
    icon: "FileText",
    primaryDimension: "iri",
    secondaryDimensions: ["lco"],
    primaryAgent: "clo",
    supportingAgents: ["cfo", "cpo"],
    minEvidence: 1,
    suggestedFileTypes: ["pdf", "pptx", "xlsx", "doc"],
    suggestedLinks: ["Google Drive data room", "DocSend link"],
    guidingQuestions: [
      "Do you have a pitch deck?",
      "Do you have a financial model or projections?",
      "Do you have a business plan or one-pager?",
      "Are your key legal documents prepared?",
    ],
    weight: 7,
  },
  {
    key: "dataroom",
    title: "Data Room",
    titleVi: "Phong du lieu",
    subtitle: "Completeness, organization, investor-readiness",
    icon: "FolderCheck",
    primaryDimension: "iri",
    secondaryDimensions: ["cgh"],
    primaryAgent: "clo",
    supportingAgents: ["cfo", "ciso"],
    minEvidence: 2,
    suggestedFileTypes: ["pdf", "xlsx", "doc"],
    suggestedLinks: ["Data room URL", "Google Drive folder"],
    guidingQuestions: [
      "Do you have a structured data room for investors?",
      "What documents are included?",
      "Is it organized by category (legal, financial, product)?",
      "When was it last updated?",
    ],
    weight: 5,
  },
  {
    key: "team_structure",
    title: "Team Structure & Governance",
    titleVi: "Co cau doi ngu & Quan tri",
    subtitle: "Org chart, roles, advisory board, governance",
    icon: "Network",
    primaryDimension: "ftv",
    secondaryDimensions: ["cgh"],
    primaryAgent: "chro",
    supportingAgents: ["coo", "clo"],
    minEvidence: 1,
    suggestedFileTypes: ["pdf", "pptx"],
    suggestedLinks: ["Org chart link", "Advisory board profiles"],
    guidingQuestions: [
      "Do you have a clear org chart?",
      "Do you have an advisory board?",
      "How are roles and responsibilities defined?",
      "Do you have regular board meetings?",
    ],
    weight: 5,
  },
  {
    key: "roadmap",
    title: "Product Roadmap",
    titleVi: "Lo trinh san pham",
    subtitle: "Milestones, timeline, execution plan, priorities",
    icon: "Map",
    primaryDimension: "svm",
    secondaryDimensions: ["ptd"],
    primaryAgent: "cpo",
    supportingAgents: ["cto", "coo", "cfo"],
    minEvidence: 1,
    suggestedFileTypes: ["pdf", "pptx", "xlsx"],
    suggestedLinks: ["Trello board", "Jira board", "Linear project", "Notion roadmap"],
    guidingQuestions: [
      "What are your next 3-6 month milestones?",
      "What is your 12-month product vision?",
      "How do you prioritize features?",
      "What key dependencies or blockers exist?",
    ],
    weight: 6,
  },
  {
    key: "revenue",
    title: "Revenue & Unit Economics",
    titleVi: "Doanh thu & Kinh te don vi",
    subtitle: "Revenue model, MRR/ARR, margins, growth trajectory",
    icon: "DollarSign",
    primaryDimension: "tre",
    secondaryDimensions: ["iri"],
    primaryAgent: "cfo",
    supportingAgents: ["cro", "cmo"],
    minEvidence: 1,
    suggestedFileTypes: ["xlsx", "csv", "pdf"],
    suggestedLinks: ["Stripe dashboard", "Xero", "QuickBooks"],
    guidingQuestions: [
      "What is your current MRR/ARR?",
      "What is your revenue growth rate?",
      "What are your unit economics (LTV, CAC, margins)?",
      "What is your path to profitability?",
    ],
    weight: 10,
  },
];

// ── Lookup helpers ──────────────────────────────────────────────────────────

export function getCriterion(key: CriterionKey): CriterionDef | undefined {
  return CRITERIA.find((c) => c.key === key);
}

export function getCriteriaByAgent(agentId: string): CriterionDef[] {
  return CRITERIA.filter((c) => c.primaryAgent === agentId);
}

export function getCriteriaByDimension(dimensionKey: string): CriterionDef[] {
  const dim = dimensionKey.toLowerCase();
  return CRITERIA.filter(
    (c) => c.primaryDimension === dim || c.secondaryDimensions.includes(dim),
  );
}

/** Calculate quality level from evidence completeness */
export function computeQuality(criterion: {
  text_input: string;
  files: unknown[];
  links: unknown[];
  ai_score?: number | null;
}): QualityLevel {
  const hasText = criterion.text_input.trim().length > 50;
  const fileCount = criterion.files.length;
  const linkCount = criterion.links.length;
  const totalEvidence = (hasText ? 1 : 0) + fileCount + linkCount;

  if (criterion.ai_score && criterion.ai_score >= 80 && totalEvidence >= 3) return "exceptional";
  if (criterion.ai_score && criterion.ai_score >= 60 && totalEvidence >= 2) return "strong";
  if (totalEvidence >= 2 || (hasText && totalEvidence >= 1)) return "good";
  if (totalEvidence >= 1) return "basic";
  return "incomplete";
}

/** Overall evaluation progress (0-100) across all 13 criteria */
export function computeEvaluationProgress(
  criteria: Array<{ criterion_key: string; quality_level: string }>,
): number {
  const qualityScores: Record<string, number> = {
    incomplete: 0,
    basic: 25,
    good: 50,
    strong: 75,
    exceptional: 100,
  };

  const total = CRITERION_KEYS.length;
  const sum = CRITERION_KEYS.reduce((acc, key) => {
    const item = criteria.find((c) => c.criterion_key === key);
    return acc + (qualityScores[item?.quality_level ?? "incomplete"] ?? 0);
  }, 0);

  return Math.round(sum / total);
}
