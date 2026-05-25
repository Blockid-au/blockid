// Progressive per-section report definitions.
//
// Replaces the all-or-nothing "full report" with 16 individually-purchasable
// sections. Each section has a summary prompt (free/included) and a full
// deep-dive prompt (paid via credits).
//
// Tiers:
//   free     — always generated, no credits
//   included — summary auto-generated with SVI analysis (0 credits for summary)
//   paid     — summary locked, full analysis costs credits
//   premium  — locked, higher credit cost

// ---------------------------------------------------------------------------
// Section definition
// ---------------------------------------------------------------------------

export interface ReportSectionDef {
  id: string;
  title: string;
  subtitle: string;
  tier: "free" | "included" | "paid" | "premium";
  summaryWords: number;
  fullWords: number;
  creditCost: number;
  icon: string;
  summaryPrompt: string;
  fullPrompt: string;
}

// ---------------------------------------------------------------------------
// AU startup system prompt context (shared across all sections)
// ---------------------------------------------------------------------------

const AU_CONTEXT = `You are a senior startup analyst, management consultant, and investor advisor at BlockID.au.
Write in the context of Australian startups — reference ESIC (Early Stage Innovation Company) tax incentives,
ASIC (Australian Securities & Investments Commission) requirements, ABN registration, R&D Tax Incentive (43.5%),
ATO rulings, ASX listing pathways, and Australian venture capital landscape where relevant.

Writing guidelines:
- Use a supportive MENTORING tone — like a senior advisor coaching a first-time founder from Day 0
- Be specific: name real competitors, cite real market data, provide specific numbers
- Frame weaknesses constructively: "the gap between current state and opportunity"
- Include benchmarks: "companies at your stage typically..."
- End each section with SPECIFIC, ACTIONABLE next steps
- Reference the startup's SVI score and dimension scores when making assessments
- Use flowing narrative prose with structured sub-headings, not just bullet lists
- Format: Clean Markdown with ### sub-headings, **bold** key insights

CRITICAL — Adapt to the startup's STAGE:
- If stage is 0-2 (Idea/Validated/MVP): Focus on idea validation, customer discovery,
  finding first 10 customers, MVP scope, pitch preparation, Australian grants.
  Do NOT focus on unit economics, revenue forecasting, or cap table optimization.
  Be encouraging — they're just starting. Show them the path forward.
- If stage is 3-4 (Traction/Revenue): Focus on growth, monetization, fundraise readiness,
  team scaling, and investor preparation.
- If stage is 5+ (Growth/Scale): Focus on scaling, governance, compliance, exit planning.`;

// ---------------------------------------------------------------------------
// Helper to build summary prompt
// ---------------------------------------------------------------------------

function summaryPrompt(topic: string, focus: string): string {
  return `${AU_CONTEXT}

Generate a CONCISE SUMMARY (~200-300 words) for the "${topic}" section of this startup's SVI report.

Focus on:
${focus}

Keep it brief but insightful — this is the "hook" that shows value and invites the user to unlock the full analysis.
End with 2-3 key takeaways. Reference the startup's SVI score and relevant dimension scores.`;
}

// ---------------------------------------------------------------------------
// Helper to build full analysis prompt
// ---------------------------------------------------------------------------

function fullPrompt(topic: string, focus: string): string {
  return `${AU_CONTEXT}

Generate a COMPREHENSIVE DEEP-DIVE ANALYSIS (~1000-1500 words) for the "${topic}" section of this startup's SVI report.

THIS IS A PAID SECTION — write thorough, consultant-grade analysis. No word padding, but be exhaustive on substance.

Cover in detail:
${focus}

Structure with ### sub-headings. End with 3-5 SPECIFIC, ACTIONABLE next steps with timelines.
Reference the startup's SVI score, dimension scores, evidence items, and any prior analyses.`;
}

// ---------------------------------------------------------------------------
// 16 Report Sections
// ---------------------------------------------------------------------------

export const REPORT_SECTIONS: ReportSectionDef[] = [
  // ── 1. Executive Summary (FREE) ─────────────────────────────────────
  {
    id: "executive",
    title: "Executive Summary",
    subtitle: "Overall assessment and investor memo",
    tier: "free",
    summaryWords: 300,
    fullWords: 1500,
    creditCost: 0,
    icon: "FileText",
    summaryPrompt: summaryPrompt(
      "Executive Summary",
      `- One-paragraph startup overview and value proposition
- Current SVI score interpretation (what it means for investability)
- Stage assessment and key strengths
- Top 3 critical gaps that need attention
- Overall investor readiness verdict`,
    ),
    fullPrompt: fullPrompt(
      "Executive Summary",
      `- Detailed startup overview: problem, solution, market, and team
- SVI score deep interpretation with dimension-by-dimension breakdown
- Stage-appropriate benchmarks and what "good" looks like at this stage
- Investor memo format: why this startup is worth watching
- Critical path to next funding milestone
- Comparison to successful AU startups at similar stage (Canva, SafetyCulture, etc.)
- Top 5 priorities ranked by impact and urgency`,
    ),
  },

  // ── 2. Founder & Team (INCLUDED) ────────────────────────────────────
  {
    id: "founder_team",
    title: "Founder & Team",
    subtitle: "Background, experience, and team composition",
    tier: "included",
    summaryWords: 200,
    fullWords: 1200,
    creditCost: 0.50,
    icon: "Users",
    summaryPrompt: summaryPrompt(
      "Founder & Team Assessment",
      `- Founder background and relevant experience
- Team completeness (technical, commercial, domain expertise)
- Key hiring gaps
- Team score from SVI dimensions (FTV)`,
    ),
    fullPrompt: fullPrompt(
      "Founder & Team Assessment",
      `- Founder background analysis: domain expertise, startup experience, track record
- Team composition: technical depth, commercial capability, advisory network
- Founder-market fit assessment
- Key person risk and mitigation
- Hiring roadmap: next 3-5 critical hires with role descriptions
- ESOP/equity allocation recommendations for AU startups
- Board composition and governance readiness
- Comparison to successful founding teams at similar stage
- Vesting structure recommendations (4-year cliff, AU standard)`,
    ),
  },

  // ── 3. Market Opportunity (INCLUDED) ────────────────────────────────
  {
    id: "market",
    title: "Market Opportunity",
    subtitle: "TAM/SAM/SOM, validation, and timing",
    tier: "included",
    summaryWords: 200,
    fullWords: 1500,
    creditCost: 0.75,
    icon: "TrendingUp",
    summaryPrompt: summaryPrompt(
      "Market Opportunity",
      `- Market size estimate (TAM/SAM/SOM)
- Problem validation evidence
- Market timing assessment
- Market score from SVI dimensions (MPC)`,
    ),
    fullPrompt: fullPrompt(
      "Market Opportunity",
      `- TAM/SAM/SOM calculation with methodology and data sources
- Problem validation: customer interviews, surveys, pilot data
- Market timing: why now? Regulatory tailwinds, tech shifts, macro trends
- Australian market specifics: ABS data, IBIS World industry reports
- Customer segmentation and beachhead market identification
- Market entry barriers and how to overcome them
- Competitive landscape overview (detailed analysis in separate section)
- Revenue model validation against market expectations
- Growth trajectory benchmarks for AU SaaS/fintech/proptech`,
    ),
  },

  // ── 4. Product & Technical (INCLUDED) ───────────────────────────────
  {
    id: "product",
    title: "Product & Technical",
    subtitle: "Architecture, tech stack, and maturity",
    tier: "included",
    summaryWords: 200,
    fullWords: 1200,
    creditCost: 0.50,
    icon: "Code",
    summaryPrompt: summaryPrompt(
      "Product & Technical",
      `- Product maturity assessment (concept/MVP/beta/production)
- Technical architecture overview
- Key technical risks
- Product score from SVI dimensions (PTD)`,
    ),
    fullPrompt: fullPrompt(
      "Product & Technical",
      `- Product maturity: concept → MVP → beta → production readiness
- Technical architecture assessment: scalability, security, maintainability
- Technology stack evaluation: modern, sustainable, talent-available
- AI/ML capabilities and data advantage
- Security posture: OWASP compliance, data encryption, SOC2 readiness
- Technical debt assessment and remediation roadmap
- IP and defensibility of technical implementation
- DevOps maturity: CI/CD, monitoring, incident response
- Product roadmap alignment with market needs
- Accessibility and internationalisation readiness`,
    ),
  },

  // ── 5. Traction & Revenue (INCLUDED) ────────────────────────────────
  {
    id: "traction",
    title: "Traction & Revenue",
    subtitle: "Users, revenue, and engagement metrics",
    tier: "included",
    summaryWords: 200,
    fullWords: 1500,
    creditCost: 0.75,
    icon: "BarChart3",
    summaryPrompt: summaryPrompt(
      "Traction & Revenue",
      `- Current user/customer metrics
- Revenue status and model
- Key engagement indicators
- Traction score from SVI dimensions (TRE)`,
    ),
    fullPrompt: fullPrompt(
      "Traction & Revenue",
      `- User acquisition metrics: signups, MAU, DAU, growth rate
- Revenue analysis: MRR/ARR, ARPU, payment conversion
- Unit economics: LTV, CAC, LTV:CAC ratio, payback period
- Engagement metrics: session duration, retention curves, NPS
- Revenue model validation: pricing strategy, willingness to pay
- Cohort analysis and churn assessment
- Channel-specific acquisition costs
- Revenue growth trajectory vs. AU startup benchmarks
- Path to A$1M ARR and timeline estimate
- Key leading indicators to track weekly`,
    ),
  },

  // ── 6. Go-to-Market (INCLUDED) ──────────────────────────────────────
  {
    id: "gtm",
    title: "Go-to-Market",
    subtitle: "Channels, positioning, and growth strategy",
    tier: "included",
    summaryWords: 200,
    fullWords: 1200,
    creditCost: 0.50,
    icon: "Megaphone",
    summaryPrompt: summaryPrompt(
      "Go-to-Market Strategy",
      `- Current distribution channels
- Positioning and messaging assessment
- Growth strategy overview
- GTM readiness from SVI analysis`,
    ),
    fullPrompt: fullPrompt(
      "Go-to-Market Strategy",
      `- Channel strategy: organic, paid, partnerships, content, community
- Positioning and messaging: value proposition clarity, differentiation
- SEO and content marketing assessment
- Social media and community presence
- Partnership and integration opportunities in AU market
- Sales process: self-serve vs. sales-led vs. product-led growth
- Customer acquisition funnel: awareness → consideration → conversion
- Referral and viral coefficient potential
- AU-specific channels: startup directories, accelerators, government grants
- 90-day GTM execution plan with specific milestones`,
    ),
  },

  // ── 7. Cap Table & Governance (INCLUDED) ────────────────────────────
  {
    id: "cap_table",
    title: "Cap Table & Governance",
    subtitle: "Equity structure, vesting, and ESOP",
    tier: "included",
    summaryWords: 200,
    fullWords: 1000,
    creditCost: 0.50,
    icon: "PieChart",
    summaryPrompt: summaryPrompt(
      "Cap Table & Governance",
      `- Current equity structure overview
- ESOP and vesting status
- Governance maturity
- Cap table score from SVI dimensions (CGH)`,
    ),
    fullPrompt: fullPrompt(
      "Cap Table & Governance",
      `- Current cap table analysis: founder splits, investor allocations
- ESOP pool sizing: AU benchmark is 10-15% pre-Series A
- Vesting schedule assessment: standard 4-year with 1-year cliff
- Shareholders agreement review: drag-along, tag-along, pre-emptive rights
- Board composition and advisory board recommendations
- Corporate structure: Pty Ltd vs. holding company considerations
- Share class structure: ordinary vs. preference shares
- Dilution modelling for next 2-3 funding rounds
- Governance best practices for AU startups
- Director duties and ASIC compliance obligations`,
    ),
  },

  // ── 8. Investor Readiness (INCLUDED) ────────────────────────────────
  {
    id: "investor_ready",
    title: "Investor Readiness",
    subtitle: "Pitch deck, data room, and raise strategy",
    tier: "included",
    summaryWords: 200,
    fullWords: 1200,
    creditCost: 0.50,
    icon: "Briefcase",
    summaryPrompt: summaryPrompt(
      "Investor Readiness",
      `- Overall fundraise readiness assessment
- Pitch deck and materials status
- Data room completeness
- Investor readiness score from SVI dimensions (IRI)`,
    ),
    fullPrompt: fullPrompt(
      "Investor Readiness",
      `- Pitch deck assessment: story arc, data density, design quality
- Data room completeness checklist (financials, legal, IP, team)
- Fundraise strategy: round size, valuation expectations, investor type
- AU investor landscape: VCs, angels, family offices, government grants
- ESIC eligibility assessment (100-point innovation test, 100-point company test)
- Accelerator fit: Startmate, Antler, HAX, Techstars AU
- Term sheet readiness: key terms to expect and negotiate
- Investor targeting: warm intro strategy, pitch event calendar
- Financial model requirements for investor meetings
- Timeline to fundraise close: typical 3-6 months in AU market`,
    ),
  },

  // ── 9. Legal & Compliance (INCLUDED) ────────────────────────────────
  {
    id: "legal",
    title: "Legal & Compliance",
    subtitle: "ASIC, IP, contracts, and ESIC eligibility",
    tier: "included",
    summaryWords: 200,
    fullWords: 1000,
    creditCost: 0.50,
    icon: "Scale",
    summaryPrompt: summaryPrompt(
      "Legal & Compliance",
      `- Corporate registration status (ABN, ASIC, ACN)
- IP protection assessment
- Key contract gaps
- Legal score from SVI dimensions (LCO)`,
    ),
    fullPrompt: fullPrompt(
      "Legal & Compliance",
      `- ASIC compliance: annual reviews, director obligations, solvency declarations
- ABN/ACN registration and business name protection
- IP strategy: patents, trademarks, trade secrets, copyright
- Contract inventory: employment, contractor, customer, supplier, NDA
- Privacy Act 1988 compliance: APP assessment, privacy policy, data handling
- ESIC eligibility detailed assessment (both innovation and company tests)
- AFSL/ACL considerations if offering financial products
- Consumer law compliance: ACL, unfair contract terms
- International expansion legal considerations
- Insurance: D&O, professional indemnity, cyber liability`,
    ),
  },

  // ── 10. Strategic Vision & Moat (INCLUDED) ──────────────────────────
  {
    id: "vision_moat",
    title: "Strategic Vision & Moat",
    subtitle: "Defensibility, network effects, and long-term strategy",
    tier: "included",
    summaryWords: 200,
    fullWords: 1200,
    creditCost: 0.50,
    icon: "Shield",
    summaryPrompt: summaryPrompt(
      "Strategic Vision & Moat",
      `- Competitive moat assessment
- Network effects and switching costs
- Long-term vision clarity
- Strategic score from SVI dimensions (SVM)`,
    ),
    fullPrompt: fullPrompt(
      "Strategic Vision & Moat",
      `- Moat analysis: network effects, data advantage, switching costs, brand, IP
- First-mover vs. fast-follower positioning
- Platform vs. tool: can this become a platform play?
- Data moat: proprietary data assets, compounding advantage
- Community and ecosystem defensibility
- Vision clarity: 5-year, 10-year, and ultimate destination
- Strategic partnerships that reinforce the moat
- Potential acquirers and strategic interest signals
- Category creation opportunity assessment
- Comparison to companies that built lasting moats (Atlassian, Canva, Xero)`,
    ),
  },

  // ── 11. Financial Projections (INCLUDED) ────────────────────────────
  {
    id: "financial",
    title: "Financial Projections",
    subtitle: "Revenue forecasts, burn rate, and unit economics",
    tier: "included",
    summaryWords: 200,
    fullWords: 1500,
    creditCost: 0.75,
    icon: "DollarSign",
    summaryPrompt: summaryPrompt(
      "Financial Projections",
      `- Revenue projection summary (12-month outlook)
- Burn rate and runway estimate
- Key unit economics
- Financial health assessment`,
    ),
    fullPrompt: fullPrompt(
      "Financial Projections",
      `- 12-month and 36-month revenue projections with assumptions
- Cost structure breakdown: fixed vs. variable, COGS, OpEx
- Burn rate analysis and runway calculation
- Unit economics deep dive: LTV, CAC, payback, gross margin
- Break-even analysis and timeline
- Scenario modelling: base case, bull case, bear case
- Key financial ratios and benchmarks for AU startups
- R&D Tax Incentive calculation: 43.5% refundable offset for <A$20M revenue
- Cash flow management and working capital needs
- Fundraise requirement sizing: how much to raise and for what milestones`,
    ),
  },

  // ── 12. Risk & Mitigation (INCLUDED) ────────────────────────────────
  {
    id: "risk",
    title: "Risk & Mitigation",
    subtitle: "Market, execution, technical, and regulatory risks",
    tier: "included",
    summaryWords: 200,
    fullWords: 1200,
    creditCost: 0.50,
    icon: "AlertTriangle",
    summaryPrompt: summaryPrompt(
      "Risk & Mitigation",
      `- Top 3 critical risks identified
- Risk severity and likelihood assessment
- Key mitigation strategies
- Overall risk profile rating`,
    ),
    fullPrompt: fullPrompt(
      "Risk & Mitigation",
      `- Market risk: demand uncertainty, timing, competition, market shifts
- Execution risk: team capacity, hiring, operational complexity
- Technical risk: scalability, security, technical debt, vendor lock-in
- Financial risk: runway, revenue concentration, pricing pressure
- Regulatory risk: AU-specific compliance, international expansion
- Key person risk and succession planning
- Competitive response risk: what if incumbents copy the product?
- Risk matrix: probability × impact for each identified risk
- Mitigation playbook: specific actions for top 5 risks
- Insurance and legal safeguards checklist`,
    ),
  },

  // ── 13. Competitive Intelligence (PAID) ─────────────────────────────
  {
    id: "competitive",
    title: "Competitive Intelligence",
    subtitle: "Named competitors, feature comparison, and positioning",
    tier: "paid",
    summaryWords: 0,
    fullWords: 1500,
    creditCost: 0.75,
    icon: "Crosshair",
    summaryPrompt: "", // No summary for paid-locked sections
    fullPrompt: fullPrompt(
      "Competitive Intelligence",
      `- Named competitor identification: direct, indirect, and adjacent
- Feature-by-feature comparison matrix
- Pricing comparison across competitors
- Market positioning map: price vs. value, simple vs. complex
- Competitor strengths to learn from and weaknesses to exploit
- Competitive response playbook: what to do when competitors react
- Win/loss analysis framework
- Differentiation strategy: where to compete and where to avoid
- AU-specific competitors and international entrants
- Strategic windows: timing advantages and market gaps to exploit`,
    ),
  },

  // ── 14. 90-Day Action Roadmap (PAID) ────────────────────────────────
  {
    id: "roadmap",
    title: "90-Day Action Roadmap",
    subtitle: "Week-by-week execution plan with KPIs",
    tier: "paid",
    summaryWords: 0,
    fullWords: 1500,
    creditCost: 0.75,
    icon: "Map",
    summaryPrompt: "", // No summary for paid-locked sections
    fullPrompt: fullPrompt(
      "90-Day Action Roadmap",
      `- Month 1 (Weeks 1-4): Foundation and quick wins
  * Week-by-week deliverables with specific owners
  * KPIs to hit by end of Month 1
- Month 2 (Weeks 5-8): Build and validate
  * Feature milestones and customer validation targets
  * Hiring and team development milestones
- Month 3 (Weeks 9-12): Scale and prepare
  * Growth targets and channel optimization
  * Investor preparation milestones
- Success metrics dashboard: what to track daily, weekly, monthly
- Resource allocation: where to focus the team's time
- Decision gates: key decisions that need to be made and when
- Dependencies and critical path items
- Budget allocation for the 90-day sprint`,
    ),
  },

  // ── 15. Board-Ready Summary (PREMIUM) ───────────────────────────────
  {
    id: "board_summary",
    title: "Board-Ready Summary",
    subtitle: "One-page executive brief for investors and board",
    tier: "premium",
    summaryWords: 0,
    fullWords: 1000,
    creditCost: 1.00,
    icon: "Award",
    summaryPrompt: "", // No summary for premium-locked sections
    fullPrompt: fullPrompt(
      "Board-Ready Summary",
      `- One-page executive brief format (designed to be printed/PDF'd)
- Company snapshot: name, stage, SVI score, key metric
- Investment thesis: 3 reasons this startup is worth backing
- Key risks: top 3 concerns an investor would raise
- Financial snapshot: revenue, burn, runway, next milestone
- Team overview: founders + key hires
- Ask: what the startup needs (capital, connections, expertise)
- Comparable companies and exit precedents in AU market
- Timeline to next value inflection point
- Format this as a professional investor memo suitable for board distribution`,
    ),
  },

  // ── 16. Australian Market Deep Dive (PREMIUM) ──────────────────────
  {
    id: "au_market",
    title: "Australian Market Deep Dive",
    subtitle: "ESIC, R&D Tax, accelerators, and AU-specific opportunities",
    tier: "premium",
    summaryWords: 0,
    fullWords: 1500,
    creditCost: 1.00,
    icon: "Globe",
    summaryPrompt: "", // No summary for premium-locked sections
    fullPrompt: fullPrompt(
      "Australian Market Deep Dive",
      `- ESIC (Early Stage Innovation Company) eligibility deep analysis
  * 100-point innovation test: principles, declarations, patents
  * 100-point company test: incorporation date, expenditure, revenue, listing
  * Tax offset benefits for investors (20% non-refundable + 10-year CGT exemption)
- R&D Tax Incentive detailed calculation
  * Eligible activities under s355-25 of ITAA 1997
  * 43.5% refundable offset for entities with <A$20M turnover
  * Core vs. supporting R&D activities identification
  * Advance/Overseas Finding considerations
- Australian accelerator and grant landscape
  * Startmate, Antler AU, HAX, Techstars, muru-D
  * State government grants: NSW MVP Grant, Vic Startup Fund, QLD Advance
  * Federal programs: Accelerating Commercialisation, CSIRO Kick-Start
- AU venture capital landscape: who's investing, typical terms, recent deals
- ASX listing pathways and considerations
- Export Market Development Grant (EMDG) for international expansion
- AU talent market: where to hire, visa sponsorship (482/494), remote policies`,
    ),
  },
];

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/** Get a section definition by ID. Returns undefined if not found. */
export function getSection(sectionId: string): ReportSectionDef | undefined {
  return REPORT_SECTIONS.find((s) => s.id === sectionId);
}

/** Get the credit cost for generating the full analysis of a section. */
export function getSectionCost(sectionId: string): number {
  const section = getSection(sectionId);
  if (!section) return 0;
  return section.creditCost;
}

/**
 * Calculate cost to unlock all remaining sections at 30% discount.
 * @param alreadyUnlocked — IDs of sections the user has already purchased
 */
export function getUnlockAllCost(alreadyUnlocked: string[]): {
  total: number;
  discounted: number;
  savings: number;
  sections: Array<{ id: string; title: string; creditCost: number }>;
} {
  const remaining = REPORT_SECTIONS.filter(
    (s) => s.creditCost > 0 && !alreadyUnlocked.includes(s.id),
  );

  const total = remaining.reduce((sum, s) => sum + s.creditCost, 0);
  const discounted = Math.round(total * 0.70 * 100) / 100; // 30% discount
  const savings = Math.round((total - discounted) * 100) / 100;

  return {
    total,
    discounted,
    savings,
    sections: remaining.map((s) => ({
      id: s.id,
      title: s.title,
      creditCost: s.creditCost,
    })),
  };
}

/**
 * Estimate the cost and word count for a set of sections.
 */
export function estimateSections(sectionIds: string[]): {
  sections: Array<{
    id: string;
    title: string;
    creditCost: number;
    estWords: number;
    tier: string;
  }>;
  totalCredits: number;
  totalWords: number;
} {
  const sections = sectionIds
    .map((id) => {
      const def = getSection(id);
      if (!def) return null;
      return {
        id: def.id,
        title: def.title,
        creditCost: def.creditCost,
        estWords: def.fullWords,
        tier: def.tier,
      };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  const totalCredits = sections.reduce((sum, s) => sum + s.creditCost, 0);
  const totalWords = sections.reduce((sum, s) => sum + s.estWords, 0);

  return { sections, totalCredits, totalWords };
}

/**
 * Get all sections grouped by tier for display.
 */
export function getSectionsByTier(): Record<string, ReportSectionDef[]> {
  const grouped: Record<string, ReportSectionDef[]> = {
    free: [],
    included: [],
    paid: [],
    premium: [],
  };
  for (const s of REPORT_SECTIONS) {
    grouped[s.tier].push(s);
  }
  return grouped;
}
