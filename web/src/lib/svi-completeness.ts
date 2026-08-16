/**
 * SVI Evidence Completeness Calculation Engine
 *
 * Exports functions to:
 * 1. Calculate per-dimension completeness % (0-100)
 * 2. Generate impact-scored missing evidence list
 * 3. Rank roadmap items by bang-for-buck
 * 4. Predict SVI uplift if roadmap completed
 *
 * Location: /services/svi-engine/src/lib/svi-completeness.ts
 * Status: Ready for implementation
 */

// ─── Evidence Catalog (per dimension) ──────────────────────────────────

export interface EvidenceType {
  code: string;
  label: string;
  confidenceLevel: "self_declared" | "public_url" | "document_uploaded" | "connected_source" | "transaction_data" | "third_party_verified";
  estimatedSviImpact: number;
  helpArticleId?: string;
}

export const EVIDENCE_CATALOG: Record<string, EvidenceType[]> = {
  ftv: [
    { code: "founder_linkedin", label: "Founder LinkedIn profile", confidenceLevel: "public_url", estimatedSviImpact: 5, helpArticleId: "ftv-linkedin" },
    { code: "founder_bio", label: "Founder bio/background document", confidenceLevel: "document_uploaded", estimatedSviImpact: 3 },
    { code: "asic_founder_history", label: "ASIC founder/director history", confidenceLevel: "connected_source", estimatedSviImpact: 8 },
    { code: "advisor_bios", label: "Named advisors + bios", confidenceLevel: "document_uploaded", estimatedSviImpact: 4 },
    { code: "founder_press", label: "Media mentions of founder", confidenceLevel: "public_url", estimatedSviImpact: 3 },
    { code: "previous_exits", label: "Previous exit/acquisition proof", confidenceLevel: "document_uploaded", estimatedSviImpact: 6 },
    { code: "team_org_chart", label: "Team org chart", confidenceLevel: "document_uploaded", estimatedSviImpact: 2 },
  ],
  mpc: [
    { code: "customer_interviews", label: "Customer interview notes", confidenceLevel: "document_uploaded", estimatedSviImpact: 5 },
    { code: "market_research", label: "Market size/TAM document", confidenceLevel: "document_uploaded", estimatedSviImpact: 4 },
    { code: "customer_loi", label: "Letter of intent or LOI", confidenceLevel: "document_uploaded", estimatedSviImpact: 7 },
    { code: "problem_statement", label: "Clear problem statement", confidenceLevel: "document_uploaded", estimatedSviImpact: 3 },
    { code: "competitor_analysis", label: "Competitor landscape doc", confidenceLevel: "document_uploaded", estimatedSviImpact: 3 },
    { code: "market_benchmarks", label: "Industry benchmarks/data", confidenceLevel: "public_url", estimatedSviImpact: 2 },
  ],
  ptd: [
    { code: "github_repo", label: "Public GitHub repo", confidenceLevel: "connected_source", estimatedSviImpact: 6 },
    { code: "tech_architecture", label: "Technical architecture doc", confidenceLevel: "document_uploaded", estimatedSviImpact: 4 },
    { code: "product_demo_video", label: "Product demo/walkthrough video", confidenceLevel: "document_uploaded", estimatedSviImpact: 5 },
    { code: "website", label: "Live product website", confidenceLevel: "public_url", estimatedSviImpact: 3 },
    { code: "code_commits", label: "Commit history showing velocity", confidenceLevel: "connected_source", estimatedSviImpact: 5 },
    { code: "test_coverage", label: "Unit/integration test stats", confidenceLevel: "connected_source", estimatedSviImpact: 3 },
    { code: "mobile_app", label: "iOS/Android app in store", confidenceLevel: "connected_source", estimatedSviImpact: 4 },
  ],
  tre: [
    { code: "revenue_proof", label: "Bank statements or invoice", confidenceLevel: "transaction_data", estimatedSviImpact: 10 },
    { code: "customer_list", label: "Customer reference list", confidenceLevel: "document_uploaded", estimatedSviImpact: 5 },
    { code: "mrr_dashboard", label: "Dashboard screenshot or data feed", confidenceLevel: "connected_source", estimatedSviImpact: 8 },
    { code: "user_growth_chart", label: "User growth over time", confidenceLevel: "document_uploaded", estimatedSviImpact: 4 },
    { code: "nps_survey", label: "NPS scores/survey data", confidenceLevel: "document_uploaded", estimatedSviImpact: 3 },
    { code: "logo_customers", label: "Named paying customers", confidenceLevel: "document_uploaded", estimatedSviImpact: 4 },
    { code: "churn_rate", label: "Monthly churn %; retention data", confidenceLevel: "connected_source", estimatedSviImpact: 6 },
  ],
  cgh: [
    { code: "cap_table_spreadsheet", label: "Cap table (current equity register)", confidenceLevel: "document_uploaded", estimatedSviImpact: 8 },
    { code: "vesting_schedule", label: "Founder vesting confirmation deed", confidenceLevel: "document_uploaded", estimatedSviImpact: 5 },
    { code: "shareholder_agreement", label: "Signed shareholders agreement", confidenceLevel: "document_uploaded", estimatedSviImpact: 7 },
    { code: "board_minutes", label: "Board meeting minutes", confidenceLevel: "document_uploaded", estimatedSviImpact: 3 },
    { code: "esop_pool", label: "ESOP pool allocation doc", confidenceLevel: "document_uploaded", estimatedSviImpact: 6 },
    { code: "founder_agreements", label: "Founder agreements/contracts", confidenceLevel: "document_uploaded", estimatedSviImpact: 4 },
  ],
  iri: [
    { code: "pitch_deck", label: "Pitch deck (PDF/PowerPoint)", confidenceLevel: "document_uploaded", estimatedSviImpact: 5 },
    { code: "financial_model", label: "3-year financial projections", confidenceLevel: "document_uploaded", estimatedSviImpact: 6 },
    { code: "data_room", label: "Data room URL or folder", confidenceLevel: "connected_source", estimatedSviImpact: 7 },
    { code: "exec_summary", label: "One-page executive summary", confidenceLevel: "document_uploaded", estimatedSviImpact: 3 },
    { code: "use_of_proceeds", label: "Use of funds breakdown", confidenceLevel: "document_uploaded", estimatedSviImpact: 3 },
    { code: "investor_1pager", label: "One-pager for investor sharing", confidenceLevel: "document_uploaded", estimatedSviImpact: 2 },
  ],
  lco: [
    { code: "abn_registration", label: "ABN / ACN / Business registration", confidenceLevel: "connected_source", estimatedSviImpact: 8 },
    { code: "ip_assignment", label: "IP assignment agreement", confidenceLevel: "document_uploaded", estimatedSviImpact: 6 },
    { code: "terms_of_service", label: "T&Cs or privacy policy", confidenceLevel: "document_uploaded", estimatedSviImpact: 2 },
    { code: "contracts_template", label: "Standard contracts", confidenceLevel: "document_uploaded", estimatedSviImpact: 2 },
    { code: "ip_searches", label: "IP search results (trademark, domain, patents)", confidenceLevel: "document_uploaded", estimatedSviImpact: 4 },
    { code: "legal_opinion", label: "Legal due diligence report", confidenceLevel: "document_uploaded", estimatedSviImpact: 5 },
    { code: "compliance_checklist", label: "Compliance checklist signed off", confidenceLevel: "document_uploaded", estimatedSviImpact: 3 },
  ],
  svm: [
    { code: "vision_statement", label: "Strategic vision statement", confidenceLevel: "document_uploaded", estimatedSviImpact: 2 },
    { code: "moat_analysis", label: "Competitive moat writeup", confidenceLevel: "document_uploaded", estimatedSviImpact: 4 },
    { code: "patent_applications", label: "Patent application(s)", confidenceLevel: "connected_source", estimatedSviImpact: 8 },
    { code: "data_advantage", label: "Proprietary data advantage writeup", confidenceLevel: "document_uploaded", estimatedSviImpact: 5 },
    { code: "network_effect", label: "Network effects / lock-in analysis", confidenceLevel: "document_uploaded", estimatedSviImpact: 4 },
    { code: "brand_assets", label: "Brand guidelines or assets", confidenceLevel: "document_uploaded", estimatedSviImpact: 1 },
    { code: "whitepaper", label: "Whitepaper or academic publication", confidenceLevel: "document_uploaded", estimatedSviImpact: 3 },
  ],
};

// ─── Effort estimation (hours) ────────────────────────────────────────

export const EFFORT_ESTIMATES: Record<string, number> = {
  founder_linkedin: 0.5,
  founder_bio: 2,
  founder_press: 1,
  asic_founder_history: 1,
  advisor_bios: 2,
  previous_exits: 3,
  team_org_chart: 3,

  customer_interviews: 8,
  market_research: 6,
  customer_loi: 12,
  problem_statement: 1,
  competitor_analysis: 4,
  market_benchmarks: 2,

  github_repo: 0.5, // already exists
  tech_architecture: 4,
  product_demo_video: 6,
  website: 3,
  code_commits: 0.5,
  test_coverage: 8,
  mobile_app: 20,

  revenue_proof: 2,
  customer_list: 3,
  mrr_dashboard: 2,
  user_growth_chart: 3,
  nps_survey: 4,
  logo_customers: 3,
  churn_rate: 1,

  cap_table_spreadsheet: 4,
  vesting_schedule: 3,
  shareholder_agreement: 6,
  board_minutes: 2,
  esop_pool: 3,
  founder_agreements: 4,

  pitch_deck: 4,
  financial_model: 8,
  data_room: 6,
  exec_summary: 2,
  use_of_proceeds: 2,
  investor_1pager: 1.5,

  abn_registration: 0.5,
  ip_assignment: 4,
  terms_of_service: 3,
  contracts_template: 2,
  ip_searches: 2,
  legal_opinion: 0, // external
  compliance_checklist: 2,

  vision_statement: 1.5,
  moat_analysis: 3,
  patent_applications: 12,
  data_advantage: 3,
  network_effect: 2,
  brand_assets: 1,
  whitepaper: 8,
};

// ─── Urgency tiers (for roadmap prioritization) ───────────────────────────

export interface UrgencyTier {
  tier: 1 | 2 | 3 | 4;
  label: "critical" | "high" | "medium" | "low";
  multiplier: number;
}

export const URGENCY_TIERS_BY_DIMENSION: Record<string, UrgencyTier> = {
  ftv: { tier: 1, label: "critical", multiplier: 1.5 },
  cgh: { tier: 1, label: "critical", multiplier: 1.5 },
  tre: { tier: 2, label: "high", multiplier: 1.3 },
  iri: { tier: 2, label: "high", multiplier: 1.3 },
  ptd: { tier: 3, label: "medium", multiplier: 1.0 },
  mpc: { tier: 3, label: "medium", multiplier: 1.0 },
  svm: { tier: 4, label: "low", multiplier: 0.8 },
  lco: { tier: 4, label: "low", multiplier: 0.8 },
};

// ─── Core calculations ─────────────────────────────────────────────────────

export interface DimensionCompletenessResult {
  dimension: string;
  completenessPercent: number;
  totalPossible: number;
  totalPresent: number;
  avgConfidencePercent: number;
  presentEvidence: EvidenceType[];
  missingEvidence: EvidenceType[];
}

export function calculateDimensionCompleteness(
  dimension: string,
  presentEvidenceTypes: Set<string>
): DimensionCompletenessResult {
  const catalog = EVIDENCE_CATALOG[dimension.toLowerCase()] ?? [];
  const present = catalog.filter((e) => presentEvidenceTypes.has(e.code));
  const missing = catalog.filter((e) => !presentEvidenceTypes.has(e.code));

  const completenessPercent = catalog.length > 0 ? Math.round((present.length / catalog.length) * 100) : 0;

  return {
    dimension,
    completenessPercent,
    totalPossible: catalog.length,
    totalPresent: present.length,
    avgConfidencePercent: 60, // placeholder; would aggregate from DB
    presentEvidence: present,
    missingEvidence: missing,
  };
}

export interface RoadmapItem {
  evidenceType: string;
  evidenceLabel: string;
  dimension: string;
  actionTitle: string;
  actionDescription: string;
  estimatedSviImpact: number;
  estimatedEffortHours: number;
  bangForBuck: number;
  urgencyTier: number;
  urgencyLabel: string;
  roadmapWeek: number;
  helpUrl?: string;
}

export function generateFixRoadmap(
  dimensionCompletenessResults: DimensionCompletenessResult[]
): RoadmapItem[] {
  const items: RoadmapItem[] = [];

  for (const dimResult of dimensionCompletenessResults) {
    for (const missingEvidence of dimResult.missingEvidence) {
      const effortHours = EFFORT_ESTIMATES[missingEvidence.code] ?? 4;
      const urgency = URGENCY_TIERS_BY_DIMENSION[dimResult.dimension] ?? {
        tier: 3,
        label: "medium",
        multiplier: 1.0,
      };

      const bangForBuck = (missingEvidence.estimatedSviImpact / effortHours) * urgency.multiplier;

      items.push({
        evidenceType: missingEvidence.code,
        evidenceLabel: missingEvidence.label,
        dimension: dimResult.dimension,
        actionTitle: `Add ${missingEvidence.label.toLowerCase()}`,
        actionDescription: `Strengthen your ${dimResult.dimension.toUpperCase()} score by providing ${missingEvidence.label.toLowerCase()}.`,
        estimatedSviImpact: missingEvidence.estimatedSviImpact,
        estimatedEffortHours: effortHours,
        bangForBuck: Math.round(bangForBuck * 100) / 100,
        urgencyTier: urgency.tier,
        urgencyLabel: urgency.label,
        roadmapWeek: 1,
      });
    }
  }

  // Sort by bang-for-buck descending
  items.sort((a, b) => b.bangForBuck - a.bangForBuck);

  // Assign to 4 weeks
  const itemsPerWeek = Math.ceil(items.length / 4);
  for (let i = 0; i < items.length; i++) {
    items[i].roadmapWeek = Math.floor(i / itemsPerWeek) + 1;
  }

  return items;
}

export interface RoadmapForecast {
  currentSvi: number;
  potentialSviGain: number;
  projectedSvi: number;
  week1Impact: number;
  week4Impact: number;
  completionRateAssumption: number;
}

export function forecastRoadmapImpact(
  roadmapItems: RoadmapItem[],
  currentSvi: number,
  completionRateAssumption: number = 0.6
): RoadmapForecast {
  const totalPotentialGain = roadmapItems.reduce((s, item) => s + item.estimatedSviImpact, 0);
  const expectedGain = Math.round(totalPotentialGain * completionRateAssumption);
  const projectedSvi = currentSvi + expectedGain;

  const week1Items = roadmapItems.filter((item) => item.roadmapWeek === 1);
  const week4Items = roadmapItems.filter((item) => item.roadmapWeek <= 4);

  const week1Impact = Math.round(week1Items.reduce((s, item) => s + item.estimatedSviImpact, 0) * completionRateAssumption);
  const week4Impact = Math.round(week4Items.reduce((s, item) => s + item.estimatedSviImpact, 0) * completionRateAssumption);

  return {
    currentSvi,
    potentialSviGain: totalPotentialGain,
    projectedSvi,
    week1Impact,
    week4Impact,
    completionRateAssumption,
  };
}

export function detectHighestPotentialDimension(
  dimensionCompletenessResults: DimensionCompletenessResult[]
): DimensionCompletenessResult | null {
  let best: DimensionCompletenessResult | null = null;
  let bestScore = -1;

  for (const result of dimensionCompletenessResults) {
    const potentialGain = result.missingEvidence.reduce((s, e) => s + e.estimatedSviImpact, 0);
    if (potentialGain > bestScore) {
      bestScore = potentialGain;
      best = result;
    }
  }

  return best;
}

export default {
  calculateDimensionCompleteness,
  generateFixRoadmap,
  forecastRoadmapImpact,
  detectHighestPotentialDimension,
};
