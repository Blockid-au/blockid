export interface ComplianceItem {
  id: string;
  category: "corporate" | "tax" | "investor" | "employment" | "ip";
  title: string;
  description: string;
  status: "pass" | "warning" | "fail" | "unknown";
  priority: "P0" | "P1" | "P2";
  action?: string;
  link?: string;
  regulation?: string;
}

export function checkCompliance(analysis: any): ComplianceItem[] {
  const signals = analysis?.signals ?? {};
  const items: ComplianceItem[] = [];

  // Corporate
  items.push({
    id: "abn",
    category: "corporate",
    title: "ABN / ASIC Registration",
    description: "Australian Business Number and company registration with ASIC",
    status: signals.hasABN ? "pass" : "fail",
    priority: "P0",
    action: signals.hasABN ? undefined : "Register your company with ASIC and get an ABN via abr.gov.au",
    link: "/workspace/documents",
    regulation: "Corporations Act 2001",
  });

  items.push({
    id: "share-register",
    category: "corporate",
    title: "Share Register",
    description: "Accurate register of all shares issued, as required by ASIC",
    status: signals.hasCapTable ? "pass" : "warning",
    priority: "P0",
    action: signals.hasCapTable ? undefined : "Create your share register using BlockID Cap Table tool",
    link: "/workspace/cap-table",
    regulation: "Corporations Act s169",
  });

  items.push({
    id: "sha",
    category: "corporate",
    title: "Shareholders Agreement",
    description: "Governs shareholder rights, vesting, and dispute resolution",
    status: signals.hasShareholdersAgreement ? "pass" : "warning",
    priority: "P1",
    action: signals.hasShareholdersAgreement ? undefined : "Draft a SHA using our template in the Data Room",
    link: "/workspace/data-room",
    regulation: "Common law / Best practice",
  });

  // Tax
  items.push({
    id: "esic",
    category: "tax",
    title: "ESIC Eligibility",
    description: "Early Stage Innovation Company status for tax incentives to investors",
    status: (analysis?.stage ?? 0) <= 3 ? "warning" : "unknown",
    priority: "P1",
    action: "Check ESIC eligibility — could attract investors with 20% tax offset + CGT exemption",
    link: "/tools/data-room",
    regulation: "Income Tax Assessment Act 1997 Div 360",
  });

  items.push({
    id: "rnd",
    category: "tax",
    title: "R&D Tax Incentive",
    description: "43.5% refundable tax offset for eligible R&D activities",
    status: signals.hasProduct || signals.hasSourceCode ? "warning" : "unknown",
    priority: "P1",
    action: "If you're building tech, you likely qualify for the R&D Tax Incentive (up to A$4M refund)",
    regulation: "Industry Research and Development Act 1986",
  });

  // Investor readiness
  items.push({
    id: "pitch-deck",
    category: "investor",
    title: "Pitch Deck",
    description: "12-slide investor presentation",
    status: signals.hasPitchDeck ? "pass" : "warning",
    priority: "P1",
    action: signals.hasPitchDeck ? undefined : "Create your pitch deck — use our AI generator or Data Room template",
    link: "/workspace/data-room",
  });

  items.push({
    id: "financial-model",
    category: "investor",
    title: "Financial Model",
    description: "3-year revenue projection with assumptions",
    status: signals.hasFinancialModel ? "pass" : "warning",
    priority: "P1",
    action: signals.hasFinancialModel ? undefined : "Build a financial model — template available in Data Room",
    link: "/workspace/data-room",
  });

  items.push({
    id: "data-room",
    category: "investor",
    title: "Data Room",
    description: "Organized investor documents ready for due diligence",
    status: signals.hasDataRoom ? "pass" : "warning",
    priority: "P1",
    action: signals.hasDataRoom ? undefined : "Set up your Data Room with our templates",
    link: "/workspace/data-room",
  });

  // Employment
  items.push({
    id: "esop",
    category: "employment",
    title: "ESOP Plan",
    description: "Employee Share Option Plan for team equity",
    status: signals.esopAllocated ? "pass" : (analysis?.stage ?? 0) >= 2 ? "warning" : "unknown",
    priority: "P2",
    action: signals.esopAllocated ? undefined : "Set up an ESOP — typically 10-15% of shares for employee options",
    link: "/workspace/esop",
    regulation: "Corporations Act s1100Z",
  });

  items.push({
    id: "vesting",
    category: "employment",
    title: "Vesting Schedule",
    description: "Time-based equity release for founders and employees",
    status: signals.hasVesting ? "pass" : "warning",
    priority: "P1",
    action: signals.hasVesting ? undefined : "Implement 4-year vesting with 1-year cliff — standard for AU startups",
    link: "/workspace/equity",
  });

  // IP
  items.push({
    id: "ip",
    category: "ip",
    title: "IP Protection",
    description: "Intellectual property assignment and protection",
    status: signals.hasIPProtection ? "pass" : "warning",
    priority: "P1",
    action: signals.hasIPProtection ? undefined : "Ensure all IP is assigned to the company, not individual founders",
    link: "/workspace/documents",
  });

  items.push({
    id: "contracts",
    category: "ip",
    title: "Key Contracts",
    description: "Terms of service, privacy policy, contractor agreements",
    status: signals.hasContracts ? "pass" : "warning",
    priority: "P1",
    action: signals.hasContracts ? undefined : "Draft ToS and Privacy Policy — required before launching to users",
  });

  return items.sort((a, b) => {
    const pOrder: Record<string, number> = { P0: 0, P1: 1, P2: 2 };
    const sOrder: Record<string, number> = { fail: 0, warning: 1, unknown: 2, pass: 3 };
    return (pOrder[a.priority] ?? 3) - (pOrder[b.priority] ?? 3) || (sOrder[a.status] ?? 3) - (sOrder[b.status] ?? 3);
  });
}

export function complianceScore(items: ComplianceItem[]): number {
  const total = items.length;
  const passed = items.filter(i => i.status === "pass").length;
  return Math.round((passed / total) * 100);
}
