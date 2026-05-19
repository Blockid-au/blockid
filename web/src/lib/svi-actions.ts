// Maps SVI dimensions and evidence types to actionable links/tools

export interface SVIAction {
  label: string;          // Button text
  href?: string;          // Internal or external URL
  type: "tool" | "upload" | "guide" | "external";
}

// Map dimension keys to relevant tools
export const DIMENSION_ACTIONS: Record<string, SVIAction[]> = {
  ftv: [
    { label: "Find a co-founder", href: "/tools/cofounder-match", type: "tool" },
    { label: "Build your team profile", href: "/workspace/profile", type: "tool" },
  ],
  mpc: [
    { label: "Validate your idea", href: "/tools/idea-valuation", type: "tool" },
    { label: "Market sizing guide", href: "https://www.sba.gov/business-guide/plan-your-business/market-research-competitive-analysis", type: "guide" },
  ],
  ptd: [
    { label: "Upload product demo", type: "upload" },
    { label: "Connect GitHub", type: "upload" },
  ],
  tre: [
    { label: "Connect Stripe", type: "upload" },
    { label: "Connect Google Analytics", type: "upload" },
    { label: "Upload revenue proof", type: "upload" },
  ],
  cgh: [
    { label: "Build your cap table", href: "/tools/cap-table", type: "tool" },
    { label: "Plan equity split", href: "/tools/equity-split", type: "tool" },
    { label: "Upload SHA", type: "upload" },
  ],
  iri: [
    { label: "Get Investor-Ready Score", href: "/score", type: "tool" },
    { label: "Build data room", href: "/tools/data-room", type: "tool" },
    { label: "Analyze term sheet", href: "/tools/term-sheet", type: "tool" },
    { label: "Create funding plan", href: "/tools/funding-plan", type: "tool" },
  ],
  lco: [
    { label: "Register ABN", href: "https://www.abr.gov.au/business-super-funds-702/applying-abn", type: "external" },
    { label: "Register with ASIC", href: "https://asic.gov.au/for-business/registering-a-company/", type: "external" },
    { label: "Upload legal docs", type: "upload" },
  ],
  svm: [
    { label: "Evaluate your idea", href: "/tools/idea-valuation", type: "tool" },
    { label: "Plan dilution", href: "/tools/dilution", type: "tool" },
  ],
};

// Map evidence gap types to specific actions
export const EVIDENCE_GAP_ACTIONS: Record<string, SVIAction> = {
  pitch_deck: { label: "Upload pitch deck", type: "upload" },
  financial_model: { label: "Upload financial model", type: "upload" },
  cap_table: { label: "Build cap table", href: "/tools/cap-table", type: "tool" },
  shareholders_agreement: { label: "Upload SHA", type: "upload" },
  revenue_proof: { label: "Connect Stripe", type: "upload" },
  customer_data: { label: "Connect Analytics", type: "upload" },
  product_demo: { label: "Upload demo video", type: "upload" },
  source_code: { label: "Connect GitHub", type: "upload" },
  abn_registration: { label: "Register ABN", href: "https://www.abr.gov.au/business-super-funds-702/applying-abn", type: "external" },
  ip_protection: { label: "Upload IP docs", type: "upload" },
};

// Map next-action titles (keywords) to tool links
const NEXT_ACTION_MAPPING: Array<{ keywords: string[]; action: SVIAction }> = [
  { keywords: ["ai moat", "moat", "defensible"], action: { label: "Evaluate your idea", href: "/tools/idea-valuation", type: "tool" } },
  { keywords: ["cap table", "equity split", "founder split"], action: { label: "Build cap table", href: "/tools/cap-table", type: "tool" } },
  { keywords: ["evidence", "upload", "document", "github", "analytics"], action: { label: "Upload evidence", type: "upload" } },
  { keywords: ["revenue", "paying customer", "stripe"], action: { label: "Connect Stripe", type: "upload" } },
  { keywords: ["tam", "sam", "som", "market size"], action: { label: "Validate your idea", href: "/tools/idea-valuation", type: "tool" } },
  { keywords: ["demo", "prototype", "mvp"], action: { label: "Upload demo", type: "upload" } },
  { keywords: ["abn", "asic", "register"], action: { label: "Register ABN", href: "https://www.abr.gov.au/business-super-funds-702/applying-abn", type: "external" } },
  { keywords: ["pitch deck", "pitch"], action: { label: "Upload pitch deck", type: "upload" } },
  { keywords: ["data room"], action: { label: "Build data room", href: "/tools/data-room", type: "tool" } },
  { keywords: ["funding", "raise"], action: { label: "Create funding plan", href: "/tools/funding-plan", type: "tool" } },
  { keywords: ["term sheet"], action: { label: "Analyze term sheet", href: "/tools/term-sheet", type: "tool" } },
  { keywords: ["dilution"], action: { label: "Plan dilution", href: "/tools/dilution", type: "tool" } },
  { keywords: ["co-founder", "cofounder"], action: { label: "Find a co-founder", href: "/tools/cofounder-match", type: "tool" } },
];

export function getActionsForDimension(dimensionKey: string): SVIAction[] {
  return DIMENSION_ACTIONS[dimensionKey] ?? [];
}

export function getActionForGap(gapLabel: string): SVIAction | null {
  // Try exact match on evidenceType keys first
  const lower = gapLabel.toLowerCase();

  // Fuzzy match on known keywords
  if (lower.includes("pitch") || lower.includes("deck")) return EVIDENCE_GAP_ACTIONS.pitch_deck;
  if (lower.includes("revenue") || lower.includes("stripe") || lower.includes("invoice")) return EVIDENCE_GAP_ACTIONS.revenue_proof;
  if (lower.includes("cap table")) return EVIDENCE_GAP_ACTIONS.cap_table;
  if (lower.includes("github") || lower.includes("source code") || lower.includes("repository")) return EVIDENCE_GAP_ACTIONS.source_code;
  if (lower.includes("analytics") || lower.includes("google analytics")) return EVIDENCE_GAP_ACTIONS.customer_data;
  if (lower.includes("abn") || lower.includes("asic")) return EVIDENCE_GAP_ACTIONS.abn_registration;
  if (lower.includes("sha") || lower.includes("shareholder")) return EVIDENCE_GAP_ACTIONS.shareholders_agreement;
  if (lower.includes("financial model") || lower.includes("p&l")) return EVIDENCE_GAP_ACTIONS.financial_model;
  if (lower.includes("demo") || lower.includes("prototype")) return EVIDENCE_GAP_ACTIONS.product_demo;
  if (lower.includes("ip") || lower.includes("patent") || lower.includes("trademark")) return EVIDENCE_GAP_ACTIONS.ip_protection;
  if (lower.includes("evidence") || lower.includes("upload") || lower.includes("document")) return { label: "Upload evidence", type: "upload" };
  if (lower.includes("website") || lower.includes("landing page")) return { label: "Upload evidence", type: "upload" };

  return null;
}

export function getActionForNextAction(title: string): SVIAction | null {
  const lower = title.toLowerCase();
  for (const mapping of NEXT_ACTION_MAPPING) {
    if (mapping.keywords.some((kw) => lower.includes(kw))) {
      return mapping.action;
    }
  }
  return null;
}
