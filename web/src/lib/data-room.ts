import "server-only";

// ---------------------------------------------------------------------------
// Data Room Generator — Phase 6: Investment & Fundraise
//
// Compiles a structured, investor-ready data room from existing user data
// spread across multiple Supabase tables. Each section scores completeness
// to show gaps and guide the founder on what to add.
// ---------------------------------------------------------------------------

export interface DataRoomSection {
  id: string;
  title: string;
  items: DataRoomItem[];
  completeness: number; // 0-100%
}

export interface DataRoomItem {
  label: string;
  status: "complete" | "missing" | "partial";
  source: "auto" | "manual" | "evidence";
  value?: string;
  link?: string;
}

export interface DataRoom {
  sections: DataRoomSection[];
  overallCompleteness: number;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// generateDataRoom — build 6 sections from available data
// ---------------------------------------------------------------------------

export function generateDataRoom(params: {
  user: { email: string; displayName: string | null };
  sviAccount: {
    startupName: string | null;
    currentStage: number;
    currentSvi: number;
  } | null;
  latestAnalysis?: {
    totalSvi: number;
    analysisJson: unknown;
  } | null;
  metrics?: Array<{ metricType: string; value: number }> | null;
  capTable?: {
    shareholders: Array<{ name: string; role: string; shares_held: number }>;
  } | null;
  evidence?: Array<{
    evidenceType: string;
    label: string;
    valueOrUrl: string;
    dimension?: string;
  }> | null;
  valuation?: {
    low: number;
    mid: number;
    high: number;
  } | null;
}): DataRoom {
  const sections: DataRoomSection[] = [];

  // ── Section 1: Company Overview ───────────────────────────────────────
  const companyItems: DataRoomItem[] = [];

  companyItems.push({
    label: "Startup Name",
    status: params.sviAccount?.startupName ? "complete" : "missing",
    source: "auto",
    value: params.sviAccount?.startupName ?? undefined,
  });

  companyItems.push({
    label: "Founder / Contact",
    status: params.user.displayName || params.user.email ? "complete" : "missing",
    source: "auto",
    value: params.user.displayName ?? params.user.email,
  });

  companyItems.push({
    label: "Current Stage",
    status: params.sviAccount ? "complete" : "missing",
    source: "auto",
    value: params.sviAccount
      ? stageLabel(params.sviAccount.currentStage)
      : undefined,
  });

  companyItems.push({
    label: "SVI Score",
    status: params.sviAccount && params.sviAccount.currentSvi > 0
      ? "complete"
      : "missing",
    source: "auto",
    value: params.sviAccount
      ? `${params.sviAccount.currentSvi}/1000`
      : undefined,
  });

  const abnEvidence = findEvidence(params.evidence, ["abn", "australian business number"]);
  companyItems.push({
    label: "ABN / Company Registration",
    status: abnEvidence ? "complete" : "missing",
    source: abnEvidence ? "evidence" : "manual",
    value: abnEvidence?.valueOrUrl,
  });

  sections.push(buildSection("company", "Company Overview", companyItems));

  // ── Section 2: Product & Technology ───────────────────────────────────
  const productItems: DataRoomItem[] = [];

  const hasAnalysis = !!params.latestAnalysis;
  productItems.push({
    label: "SVI Analysis Report",
    status: hasAnalysis ? "complete" : "missing",
    source: "auto",
    value: hasAnalysis
      ? `Score: ${params.latestAnalysis!.totalSvi}/1000`
      : undefined,
  });

  const productEvidence = findEvidence(params.evidence, [
    "product", "demo", "screenshot", "prototype", "mvp",
  ]);
  productItems.push({
    label: "Product Demo / Screenshots",
    status: productEvidence ? "complete" : "missing",
    source: productEvidence ? "evidence" : "manual",
    value: productEvidence?.label,
  });

  const techEvidence = findEvidence(params.evidence, [
    "technical", "architecture", "tech stack", "infrastructure",
  ]);
  productItems.push({
    label: "Technical Architecture",
    status: techEvidence ? "complete" : "missing",
    source: techEvidence ? "evidence" : "manual",
    value: techEvidence?.label,
  });

  const ipEvidence = findEvidence(params.evidence, [
    "ip", "intellectual property", "patent", "trademark",
  ]);
  productItems.push({
    label: "IP / Patent Documentation",
    status: ipEvidence ? "complete" : "missing",
    source: ipEvidence ? "evidence" : "manual",
    value: ipEvidence?.label,
  });

  sections.push(buildSection("product", "Product & Technology", productItems));

  // ── Section 3: Financial ─────────────────────────────────────────────
  const financialItems: DataRoomItem[] = [];

  const hasMetrics = params.metrics && params.metrics.length > 0;
  const findMetric = (type: string) =>
    params.metrics?.find((m) => m.metricType === type);

  const mrr = findMetric("mrr");
  financialItems.push({
    label: "Monthly Recurring Revenue (MRR)",
    status: mrr ? "complete" : "missing",
    source: "auto",
    value: mrr ? `A$${mrr.value.toLocaleString("en-AU")}` : undefined,
  });

  const arr = findMetric("arr");
  financialItems.push({
    label: "Annual Recurring Revenue (ARR)",
    status: arr ? "complete" : "missing",
    source: "auto",
    value: arr ? `A$${arr.value.toLocaleString("en-AU")}` : undefined,
  });

  const burnRate = findMetric("burn_rate");
  financialItems.push({
    label: "Monthly Burn Rate",
    status: burnRate ? "complete" : "missing",
    source: "auto",
    value: burnRate
      ? `A$${burnRate.value.toLocaleString("en-AU")}/mo`
      : undefined,
  });

  const runway = findMetric("runway");
  financialItems.push({
    label: "Runway (months)",
    status: runway ? "complete" : "missing",
    source: "auto",
    value: runway ? `${runway.value} months` : undefined,
  });

  financialItems.push({
    label: "Valuation Estimate",
    status: params.valuation ? "complete" : "missing",
    source: "auto",
    value: params.valuation
      ? `A$${Math.round(params.valuation.mid).toLocaleString("en-AU")}`
      : undefined,
  });

  const financialEvidence = findEvidence(params.evidence, [
    "p&l", "profit", "loss", "financial", "bank statement", "cashflow",
  ]);
  financialItems.push({
    label: "P&L / Financial Statements",
    status: financialEvidence ? "complete" : "missing",
    source: financialEvidence ? "evidence" : "manual",
    value: financialEvidence?.label,
  });

  sections.push(buildSection("financial", "Financial", financialItems));

  // ── Section 4: Market & Traction ─────────────────────────────────────
  const marketItems: DataRoomItem[] = [];

  const pitchEvidence = findEvidence(params.evidence, [
    "pitch", "deck", "presentation",
  ]);
  marketItems.push({
    label: "Pitch Deck",
    status: pitchEvidence ? "complete" : "missing",
    source: pitchEvidence ? "evidence" : "manual",
    value: pitchEvidence?.label,
  });

  const marketEvidence = findEvidence(params.evidence, [
    "market", "tam", "sam", "research", "competitive",
  ]);
  marketItems.push({
    label: "Market Research / TAM Analysis",
    status: marketEvidence ? "complete" : "missing",
    source: marketEvidence ? "evidence" : "manual",
    value: marketEvidence?.label,
  });

  const customerEvidence = findEvidence(params.evidence, [
    "customer", "contract", "loi", "letter of intent", "testimonial",
  ]);
  marketItems.push({
    label: "Customer Contracts / LOIs",
    status: customerEvidence ? "complete" : "missing",
    source: customerEvidence ? "evidence" : "manual",
    value: customerEvidence?.label,
  });

  const growthMetric = findMetric("revenue_growth");
  marketItems.push({
    label: "Revenue Growth Rate",
    status: growthMetric ? "complete" : "missing",
    source: "auto",
    value: growthMetric ? `${growthMetric.value}% MoM` : undefined,
  });

  sections.push(buildSection("market", "Market & Traction", marketItems));

  // ── Section 5: Team & Cap Table ──────────────────────────────────────
  const teamItems: DataRoomItem[] = [];

  const hasShareholders =
    params.capTable && params.capTable.shareholders.length > 0;
  teamItems.push({
    label: "Cap Table",
    status: hasShareholders ? "complete" : "missing",
    source: "auto",
    value: hasShareholders
      ? `${params.capTable!.shareholders.length} shareholders`
      : undefined,
  });

  // List founders from cap table
  const founders =
    params.capTable?.shareholders.filter(
      (s) =>
        s.role === "founder" || s.role === "co-founder" || s.role === "ceo",
    ) ?? [];
  teamItems.push({
    label: "Founder Profiles",
    status: founders.length > 0 ? "complete" : "missing",
    source: "auto",
    value:
      founders.length > 0
        ? founders.map((f) => f.name).join(", ")
        : undefined,
  });

  const shaEvidence = findEvidence(params.evidence, [
    "shareholders agreement", "sha", "shareholder",
  ]);
  teamItems.push({
    label: "Shareholders Agreement",
    status: shaEvidence ? "complete" : "missing",
    source: shaEvidence ? "evidence" : "manual",
    value: shaEvidence?.label,
  });

  const vestingEvidence = findEvidence(params.evidence, [
    "vesting", "esop", "option",
  ]);
  teamItems.push({
    label: "Vesting Schedules / ESOP",
    status: vestingEvidence ? "complete" : "missing",
    source: vestingEvidence ? "evidence" : "manual",
    value: vestingEvidence?.label,
  });

  sections.push(buildSection("team", "Team & Cap Table", teamItems));

  // ── Section 6: Legal & Compliance ────────────────────────────────────
  const legalItems: DataRoomItem[] = [];

  const constitutionEvidence = findEvidence(params.evidence, [
    "constitution", "company constitution", "cert", "incorporation",
  ]);
  legalItems.push({
    label: "Certificate of Incorporation / Constitution",
    status: constitutionEvidence ? "complete" : "missing",
    source: constitutionEvidence ? "evidence" : "manual",
    value: constitutionEvidence?.label,
  });

  const tosEvidence = findEvidence(params.evidence, [
    "terms of service", "tos", "eula",
  ]);
  legalItems.push({
    label: "Terms of Service",
    status: tosEvidence ? "complete" : "missing",
    source: tosEvidence ? "evidence" : "manual",
    value: tosEvidence?.label,
  });

  const privacyEvidence = findEvidence(params.evidence, [
    "privacy", "privacy policy",
  ]);
  legalItems.push({
    label: "Privacy Policy",
    status: privacyEvidence ? "complete" : "missing",
    source: privacyEvidence ? "evidence" : "manual",
    value: privacyEvidence?.label,
  });

  const contractEvidence = findEvidence(params.evidence, [
    "contract", "supplier", "partner", "agreement",
  ]);
  legalItems.push({
    label: "Key Contracts",
    status: contractEvidence ? "complete" : "missing",
    source: contractEvidence ? "evidence" : "manual",
    value: contractEvidence?.label,
  });

  sections.push(buildSection("legal", "Legal & Compliance", legalItems));

  // ── Overall completeness ─────────────────────────────────────────────
  const totalItems = sections.reduce((n, s) => n + s.items.length, 0);
  const completeItems = sections.reduce(
    (n, s) => n + s.items.filter((i) => i.status === "complete").length,
    0,
  );
  const overallCompleteness =
    totalItems > 0 ? Math.round((completeItems / totalItems) * 100) : 0;

  return {
    sections,
    overallCompleteness,
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSection(
  id: string,
  title: string,
  items: DataRoomItem[],
): DataRoomSection {
  const complete = items.filter((i) => i.status === "complete").length;
  const completeness =
    items.length > 0 ? Math.round((complete / items.length) * 100) : 0;
  return { id, title, items, completeness };
}

function findEvidence(
  evidence:
    | Array<{
        evidenceType: string;
        label: string;
        valueOrUrl: string;
        dimension?: string;
      }>
    | null
    | undefined,
  keywords: string[],
) {
  if (!evidence || evidence.length === 0) return null;
  return evidence.find((e) => {
    const text = `${e.label} ${e.evidenceType}`.toLowerCase();
    return keywords.some((kw) => text.includes(kw.toLowerCase()));
  }) ?? null;
}

function stageLabel(stage: number): string {
  const labels: Record<number, string> = {
    0: "Idea",
    1: "Validation",
    2: "MVP",
    3: "Launch",
    4: "Revenue",
    5: "Growth",
    6: "Scale",
    7: "Exit-Ready",
  };
  return labels[stage] ?? `Stage ${stage}`;
}
