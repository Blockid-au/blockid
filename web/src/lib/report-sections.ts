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
  /** Primary C-Level agent responsible for this section */
  agentOwner?: string;
  /** Supporting agents that contribute data */
  supportingAgents?: string[];
  /** Which of the 13 evaluation criteria this section covers */
  criteriaKeys?: string[];
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
// SCN Report Sections (Startup Core Needs Framework)
// Order: Validation → Position → Value → Direction → Capital
//
// This reframes the report around first-principles founder questions and
// routes each section to actionable BlockID features (Evidence Vault,
// Valuation Engine, Action Plan, Data Room, etc).
// ---------------------------------------------------------------------------

export const REPORT_SECTIONS: ReportSectionDef[] = [
  // ── 1. Hook / Problem Framing (FREE) ─────────────────────────────────
  // NEW: Opens with founder's REAL problem + Position hero (Index/Stage/Top X%)
  {
    id: "hook_problem",
    title: "Your Startup at a Glance",
    subtitle: "Problem worth solving? Where you stand. What's next.",
    tier: "free",
    summaryWords: 400,
    fullWords: 800,
    creditCost: 0,
    icon: "Compass",
    agentOwner: "ceo",
    supportingAgents: ["cpo", "cdo"],
    criteriaKeys: [],
    summaryPrompt: summaryPrompt(
      "Hook: Problem & Position",
      `CRITICAL — This is the founder's first impression. Open with:
1. "What problem do you solve, for whom?" — name it clearly from their data
2. "Where are you?" — Show their Startup Index (NN/100), current Stage, Top X% of AU ranking
3. "What moves it?" — 1-2 biggest leverage points to improve position
4. First-principles hook: strip assumptions, name the REAL problem

Layout:
- Problem statement (1 sentence from founder's data)
- Startup Index score with percentile visualization
- Stage assessment
- Top strengths (3 bullets)
- Biggest gap (1 bullet) → "Continue to [FEATURE]"`,
    ),
    fullPrompt: fullPrompt(
      "Hook: Problem & Position",
      `Generate a COMPELLING HOOK (500-600 words) that:
1. Opens with a sharp problem statement from the founder's inputs: "You're solving [problem] for [customer]"
2. Frames BlockID's value: "This report shows WHERE YOU ARE and WHAT TO DO NEXT — your Startup Navigation System"
3. Showcases their Position:
   - Startup Index: NN/100 with percentile ("Top X% of AU startups")
   - Current Stage with context ("you're in [Stage], typically funded at $XM")
   - Key strength ranking ("you're strongest in [dimension]")
4. Identifies ONE critical gap
5. Routes to the Validation section with clear CTA: "→ Unlock your full Navigation Plan"

Tone: coach/mentor, specific, encouraging. Lead with their win, acknowledge the gap.
Reference their SVI data directly.`,
    ),
  },

  // ── 2. VALIDATION (First-Principles Question: "Am I solving the right problem?") ─
  {
    id: "validation",
    title: "Problem Validation & Market Proof",
    subtitle: "Is this problem worth solving? Is there a market? Will anyone pay?",
    tier: "included",
    summaryWords: 250,
    fullWords: 1000,
    creditCost: 0,
    icon: "CheckCircle",
    agentOwner: "cpo",
    supportingAgents: ["cmo", "cro"],
    criteriaKeys: ["idea", "market"],
    summaryPrompt: summaryPrompt(
      "Validation: Problem Worth Solving",
      `First-principles question: "Am I solving the right problem?"

Show from their data:
- Evidence they've validated the problem (interviews, surveys, customer feedback)
- Willingness to pay signals (LOIs, pilots, early revenue)
- Market urgency: is this a vitamin or a painkiller?
- Validation gaps to close immediately

End with CTA: "→ Continue in Evidence Vault to strengthen validation"`,
    ),
    fullPrompt: fullPrompt(
      "Validation: Problem Worth Solving",
      `Write VALIDATION deep-dive (700-800 words) answering: "Is this the right problem to solve?"

Structure:
1. Problem reframing: strip assumptions, name the CORE problem from founder's data
2. Customer discovery evidence: interviews, surveys, beta feedback, LOIs
3. Market demand signals: willingness to pay, revenue, user acquisition rate
4. Painfulness assessment: vitamin (nice-to-have) vs painkiller (must-have)
5. Timing: why NOW is the right time for this problem
6. Validation gaps: what's the weakest proof? (e.g., "paid customer count is 3, need 10+")
7. Next validation milestone: "In 30 days, you'll know [this] by doing [X]"
8. CTA: "Log in to Evidence Vault to document and track validation milestones"

Reference their SVI data (IDEA, MARKET dimensions).`,
    ),
  },

  // ── 3. POSITION (First-Principles Question: "Where am I really?") ───────────
  {
    id: "position",
    title: "Your Startup Position in Market",
    subtitle: "Stage. Startup Index ranking. Top X% of Australian startups.",
    tier: "included",
    summaryWords: 250,
    fullWords: 1000,
    creditCost: 0,
    icon: "TrendingUp",
    agentOwner: "ceo",
    supportingAgents: ["cpo", "cfo"],
    criteriaKeys: [],
    summaryPrompt: summaryPrompt(
      "Position: Where Am I?",
      `First-principles question: "Where am I really?"

Show the HERO metrics:
- Startup Index: NN/100 (big, visual)
- Current Stage (Idea/Validated/MVP/Traction/Revenue/Growth/Scale)
- Top X% percentile ranking vs AU startups (e.g., "Top 23% of 4,200 analyzed startups")
- Score by dimension (FTV, MPC, PTD, TRE, GTM, etc) — visual heatmap
- What this position MEANS: "You're here... companies at this stage typically..."

Anchor to reality: what moves your position? (3 key leverage points)
CTA: "→ See full Position analysis and historical trends"`,
    ),
    fullPrompt: fullPrompt(
      "Position: Where Am I?",
      `Write POSITION analysis (700-800 words) answering: "Where am I in the startup journey?"

Structure:
1. The hero: big Startup Index score + percentile + stage
   "You are NN/100, in the top X% of Australian startups, at [Stage]"
2. What this means: benchmark context — "Companies at your stage typically..."
3. Strength map: dimension-by-dimension breakdown (show where you excel)
4. Positioning relative to peers: "You're stronger than X% in [dimension]"
5. The positioning opportunity: "Your biggest leverage is in [dimension] — 10 points here = [outcome]"
6. Stage-specific insights: what success looks like at your current stage
7. Position trajectory: are you trending up? stalled? (if data available)
8. CTA: "View your full Position over time in SVI Dashboard"

Make this the HERO of the report — position before value, value before capital.
Use visuals/gauges wherever possible. Reference percentile model data.`,
    ),
  },

  // ── 4. VALUE (First-Principles Question: "What is my startup worth?") ───────
  {
    id: "value",
    title: "Estimated Value & Value Drivers",
    subtitle: "Your startup's estimated valuation. What moves it up?",
    tier: "included",
    summaryWords: 200,
    fullWords: 900,
    creditCost: 0,
    icon: "DollarSign",
    agentOwner: "cfo",
    supportingAgents: ["cro", "cpo"],
    criteriaKeys: ["revenue"],
    summaryPrompt: summaryPrompt(
      "Value: What Am I Worth?",
      `First-principles question: "What is my startup worth?"

Frame as OUTPUT of Position, not the headline:
- Estimated valuation: $XM (with confidence range)
- How it was calculated (stage benchmarks, revenue multiple, SVI positioning)
- Value drivers: what moves valuation up? (ARR, user count, market size, moat strength)
- Top 3 levers you can pull in next 90 days
- What you need for 2x valuation growth

CTA: "→ Run valuation scenarios and model your growth in Valuation Engine"`,
    ),
    fullPrompt: fullPrompt(
      "Value: What Am I Worth?",
      `Write VALUE analysis (600-700 words) answering: "What is this startup worth?"

Structure:
1. Estimated valuation: $XM ± Y (confidence: High/Medium/Low)
2. Valuation methodology: which framework applied and why
   - Stage-based benchmark (e.g., "Series A startups at your stage avg $X–$Y")
   - Revenue multiple (if applicable): ARR × multiple = valuation
   - SVI-adjusted positioning: "Companies with your SVI positioning typically valued at..."
3. Value drivers breakdown:
   - Revenue/ARR ($): biggest lever
   - User/customer count: growth signal
   - Gross margin: profitability indicator
   - Team/market fit: execution quality signal
4. What doubles valuation: "To reach $XM, you need [Y metric] at [Z level]"
5. 90-day value inflection points: "If you [achieve this], valuation moves to $XM"
6. De-risking roadmap: which risks are priced in? How to reduce them?
7. CTA: "Explore value scenarios in Valuation Engine or consult a valuator"

Keep it simple: Position matters more than exact valuation at early stage.`,
    ),
  },

  // ── 5. DIRECTION (First-Principles Question: "What do I do next?") ──────────
  {
    id: "direction",
    title: "Your Next Best Actions & Growth Roadmap",
    subtitle: "You are here. Next 3 months. Then 6 months. Google Maps for growth.",
    tier: "included",
    summaryWords: 300,
    fullWords: 1200,
    creditCost: 0,
    icon: "Map",
    agentOwner: "coo",
    supportingAgents: ["cpo", "cro", "cfo"],
    criteriaKeys: ["roadmap"],
    summaryPrompt: summaryPrompt(
      "Direction: What Next?",
      `First-principles question: "What do I do next?"

THE DIFFERENTIATOR — nobody else does this:
- You are here: [current stage + top gap]
- Next (30 days): [ONE highest-leverage action] + success metric
- Then (60 days): [follow-on action] + success metric
- Then (90 days): [position inflection] + success metric

Visual: Google Maps-style "You are here → Next → Then → Then"
CTA: "→ Build your 90-day roadmap in Action Plan + assign owners"`,
    ),
    fullPrompt: fullPrompt(
      "Direction: What Next?",
      `Write DIRECTION analysis (800-1000 words) as a GOOGLE-MAPS-STYLE NAVIGATION PLAN.

Structure:
1. "You are here":
   - Current position (stage + SVI + top gap)
   - What got you here: biggest wins to date
   - What's blocking progress: the ONE thing limiting growth

2. "Next (30 days)" — ONE highest-leverage action:
   - What to do: specific, measurable action
   - Why it matters: unlocks what? (traction, clarity, capital, moat)
   - Success metric: "You'll know you succeeded when [X metric reaches Y]"
   - Owner: who owns this
   - Dependencies: what else needs to happen first?

3. "Then (60 days)" — follow-on action:
   - Builds on 30-day win
   - Next-highest-leverage move
   - Success metric

4. "Then (90 days)" — position inflection:
   - Where you'll be if you execute
   - Position improvement (SVI points gained)
   - Valuation impact
   - Next funding milestone unlocked

5. Weekly milestones for Month 1:
   - Week 1: deliverable A + owner
   - Week 2: deliverable B + owner
   - Week 3: deliverable C + owner
   - Week 4: checkpoint + success metric

6. Contingency: "If [blocker], do [alternative]"
7. CTA: "Log in to Action Plan to assign owners, track weekly, and adjust"

This is THE DIFFERENTIATOR — Crunchbase/Carta don't do this.
Make it visual, specific, actionable. No fluff.`,
    ),
  },

  // ── 6. CAPITAL (First-Principles Question: "How do I grow faster?") ─────────
  {
    id: "capital_fundraise",
    title: "Fundraising Readiness & Capital Strategy",
    subtitle: "Funding readiness %. What's missing. Investor targeting plan.",
    tier: "included",
    summaryWords: 250,
    fullWords: 1000,
    creditCost: 0.25,
    icon: "Briefcase",
    agentOwner: "cfo",
    supportingAgents: ["cro", "cpo", "clo"],
    criteriaKeys: ["dataroom", "documents"],
    summaryPrompt: summaryPrompt(
      "Capital: How Do I Grow?",
      `First-principles question: "How do I grow faster?"

Only relevant AFTER validating 1-5. Show:
- Funding Readiness %: (e.g., "73% investor-ready")
- What's missing (gaps to close): pitch deck? cap table? data room?
- Raise strategy: how much, at what valuation, from whom?
- Timeline: typical AU fundraise takes 3-6 months
- 3 immediate gaps to close (30/60/90 day targets)

CTA: "→ Close gaps in Data Room, Pitch Deck, Cap Table features"`,
    ),
    fullPrompt: fullPrompt(
      "Capital: How Do I Grow?",
      `Write CAPITAL/FUNDRAISE analysis (700-800 words):

Structure:
1. Funding Readiness Score: X% (calculated from: pitch deck %, cap table %, data room %, legal %)
   - Pitch deck: complete? investor-grade? (gap: ...)
   - Cap table: clean? ESOP allocated? (gap: ...)
   - Data room: organized? audit-ready? (gap: ...)
   - Legal: contracts, IP, ESIC-ready? (gap: ...)

2. Raise strategy:
   - How much to raise: based on runway + growth plan
   - Round type: Pre-seed / Seed / Series A / other
   - Expected valuation range in AU market
   - Ideal investor profile: stage, check size, value-add
   - Timeline: typical AU fundraise = 3–6 months

3. Funding gaps (prioritized by urgency):
   - Gap #1: [what's missing] → fix in [30 days] using [feature]
   - Gap #2: [what's missing] → fix in [60 days] using [feature]
   - Gap #3: [what's missing] → fix in [90 days] using [feature]

4. Investor targeting:
   - Warm intro channels: founders, angels, accelerators, advisors
   - Accelerator fit: Startmate, Antler, HAX, etc.
   - AU VC landscape: who's actively investing in your vertical?
   - Angel networks: AngelList, The Fold, local angels

5. AU-specific advantage:
   - ESIC eligibility (taxation incentive for investors)
   - R&D Tax Incentive (43.5% for you)
   - Export Market Dev Grant (EMDG) if applicable

6. CTA: "Build your Data Room, create/refine Pitch Deck, clean Cap Table"

Keep it clear: Capital comes AFTER you've nailed 1-5. Don't raise before you're ready.`,
    ),
  },

  // ── 7. COMPETITIVE INTELLIGENCE (PAID) ──────────────────────────────
  {
    id: "competitive",
    title: "Competitive Intelligence & Positioning",
    subtitle: "Named competitors, feature comparison, and differentiation strategy",
    tier: "paid",
    summaryWords: 0,
    fullWords: 1500,
    creditCost: 0.75,
    icon: "Crosshair",
    agentOwner: "cmo",
    supportingAgents: ["cpo", "cto"],
    criteriaKeys: ["market"],
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

  // ── EXECUTIVE SUMMARY moved below as reference (retained for back-compatibility)
  // ── 8. Executive Summary (INCLUDED) ─────────────────────────────────────
  {
    id: "executive",
    title: "Executive Summary",
    subtitle: "Full startup analysis and investment thesis (companion piece)",
    tier: "included",
    summaryWords: 250,
    fullWords: 1200,
    creditCost: 0,
    icon: "FileText",
    agentOwner: "ceo",
    supportingAgents: ["cdo"],
    criteriaKeys: [],
    summaryPrompt: summaryPrompt(
      "Executive Summary",
      `- One-paragraph startup overview and value proposition
- SVI score interpretation and what it means for investability
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
    title: "Founding Team & Leadership",
    subtitle: "Background, capability gaps, and team-building roadmap",
    tier: "included",
    summaryWords: 200,
    fullWords: 1200,
    creditCost: 0.50,
    icon: "Users",
    agentOwner: "chro",
    supportingAgents: ["cpo", "clo"],
    criteriaKeys: ["founder_profile", "team", "team_structure"],
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
    title: "Market Opportunity & Growth Potential",
    subtitle: "TAM/SAM/SOM analysis, timing, and competitive landscape",
    tier: "included",
    summaryWords: 200,
    fullWords: 1500,
    creditCost: 0.75,
    icon: "TrendingUp",
    agentOwner: "cmo",
    supportingAgents: ["cro", "cfo", "cdo"],
    criteriaKeys: ["market"],
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
    title: "Product & Technical Architecture",
    subtitle: "Tech stack maturity, security posture, and scalability assessment",
    tier: "included",
    summaryWords: 200,
    fullWords: 1200,
    creditCost: 0.50,
    icon: "Code",
    agentOwner: "cto",
    supportingAgents: ["ciso", "cdo"],
    criteriaKeys: ["code_git", "website"],
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
    title: "Traction, Revenue & Growth Metrics",
    subtitle: "Users, revenue, unit economics, and growth trajectory",
    tier: "included",
    summaryWords: 200,
    fullWords: 1500,
    creditCost: 0.75,
    icon: "BarChart3",
    agentOwner: "cro",
    supportingAgents: ["cmo", "cdo", "cfo"],
    criteriaKeys: ["customer_size", "revenue"],
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
    title: "Go-to-Market Strategy & Distribution",
    subtitle: "Channels, pricing, acquisition funnel, and CAC optimization",
    tier: "included",
    summaryWords: 200,
    fullWords: 1200,
    creditCost: 0.50,
    icon: "Megaphone",
    agentOwner: "cmo",
    supportingAgents: ["cro", "cfo", "cpo"],
    criteriaKeys: ["gtm_strategy"],
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
    title: "Equity Structure & Corporate Governance",
    subtitle: "Cap table health, vesting, ESOP, and board composition",
    tier: "included",
    summaryWords: 200,
    fullWords: 1000,
    creditCost: 0.50,
    icon: "PieChart",
    agentOwner: "clo",
    supportingAgents: ["cfo", "chro"],
    criteriaKeys: ["team_structure", "dataroom"],
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
    title: "Investor Readiness & Fundraise Positioning",
    subtitle: "Pitch deck, data room, and raise strategy assessment",
    tier: "included",
    summaryWords: 200,
    fullWords: 1200,
    creditCost: 0.50,
    icon: "Briefcase",
    agentOwner: "cfo",
    supportingAgents: ["clo", "cpo"],
    criteriaKeys: ["documents", "dataroom"],
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
    title: "Legal Framework & Compliance Posture",
    subtitle: "ASIC, IP, contracts, ESIC eligibility, and regulatory readiness",
    tier: "included",
    summaryWords: 200,
    fullWords: 1000,
    creditCost: 0.50,
    icon: "Scale",
    agentOwner: "clo",
    supportingAgents: ["ciso"],
    criteriaKeys: ["documents"],
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
    title: "Strategic Vision & Competitive Moat",
    subtitle: "Defensibility, network effects, and long-term strategy",
    tier: "included",
    summaryWords: 200,
    fullWords: 1200,
    creditCost: 0.50,
    icon: "Shield",
    agentOwner: "cpo",
    supportingAgents: ["cto", "cmo"],
    criteriaKeys: ["idea", "roadmap"],
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
    title: "Financial Projections & Unit Economics",
    subtitle: "Revenue forecasts, burn rate, and path to profitability",
    tier: "included",
    summaryWords: 200,
    fullWords: 1500,
    creditCost: 0.75,
    icon: "DollarSign",
    agentOwner: "cfo",
    supportingAgents: ["cro", "cmo"],
    criteriaKeys: ["revenue"],
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
    title: "Risk Landscape & Mitigation Strategies",
    subtitle: "Market, execution, technical, and regulatory risk assessment",
    tier: "included",
    summaryWords: 200,
    fullWords: 1200,
    creditCost: 0.50,
    icon: "AlertTriangle",
    agentOwner: "clo",
    supportingAgents: ["ciso", "cto", "cfo"],
    criteriaKeys: [],
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
    title: "Competitive Intelligence & Positioning",
    subtitle: "Named competitors, feature comparison, and differentiation strategy",
    tier: "paid",
    summaryWords: 0,
    fullWords: 1500,
    creditCost: 0.75,
    icon: "Crosshair",
    agentOwner: "cmo",
    supportingAgents: ["cpo", "cto"],
    criteriaKeys: ["market"],
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
    title: "Your 90-Day Growth Roadmap",
    subtitle: "Week-by-week execution plan with KPIs and milestones",
    tier: "paid",
    summaryWords: 0,
    fullWords: 1500,
    creditCost: 0.75,
    icon: "Map",
    agentOwner: "coo",
    supportingAgents: ["cpo", "cto", "cfo"],
    criteriaKeys: ["roadmap"],
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
    title: "Board-Ready Investor Memo",
    subtitle: "One-page executive brief for investors and board members",
    tier: "premium",
    summaryWords: 0,
    fullWords: 1000,
    creditCost: 1.00,
    icon: "Award",
    agentOwner: "ceo",
    supportingAgents: ["cfo", "chro"],
    criteriaKeys: [],
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
    title: "Australian Market & Regulatory Landscape",
    subtitle: "ESIC, R&D Tax, accelerators, and AU-specific opportunities",
    tier: "premium",
    summaryWords: 0,
    fullWords: 1500,
    creditCost: 1.00,
    icon: "Globe",
    agentOwner: "cfo",
    supportingAgents: ["clo", "cmo"],
    criteriaKeys: ["market", "revenue"],
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
  // ── 17. Idea & Innovation (INCLUDED) ──────────────────────────────
  {
    id: "idea_innovation",
    title: "Innovation Assessment & Idea Validation",
    subtitle: "Uniqueness, problem-solution fit, and market validation evidence",
    tier: "included",
    summaryWords: 200,
    fullWords: 1200,
    creditCost: 0.50,
    icon: "Lightbulb",
    agentOwner: "cpo",
    supportingAgents: ["cto", "cmo", "cdo"],
    criteriaKeys: ["idea"],
    summaryPrompt: summaryPrompt(
      "Idea & Innovation",
      `- Innovation level assessment (incremental vs novel vs breakthrough)
- Problem-solution fit evidence
- Uniqueness and differentiation
- Idea validation status`,
    ),
    fullPrompt: fullPrompt(
      "Idea & Innovation",
      `- Innovation assessment: is this incremental improvement or category creation?
- Problem-solution fit: how well does the solution address the validated problem?
- Uniqueness analysis: what makes this approach different from alternatives?
- Defensibility of the idea: can it be easily replicated?
- Customer validation evidence: interviews, surveys, LOIs, pilot data
- Market need urgency: is this a vitamin or a painkiller?
- Timing assessment: why is now the right time for this idea?
- Comparison to similar ideas that succeeded or failed
- IP potential: is this patentable or protectable?
- Pivot risk: how adaptable is the core idea?`,
    ),
  },

  // ── 18. Cybersecurity Assessment (PREMIUM) ─────────────────────────
  {
    id: "cybersecurity",
    title: "Security & Data Protection Assessment",
    subtitle: "OWASP compliance, Essential Eight, and SOC2 readiness",
    tier: "premium",
    summaryWords: 0,
    fullWords: 1200,
    creditCost: 1.00,
    icon: "Lock",
    agentOwner: "ciso",
    supportingAgents: ["cto"],
    criteriaKeys: ["code_git"],
    summaryPrompt: "",
    fullPrompt: fullPrompt(
      "Cybersecurity Assessment",
      `- Security headers and CSP analysis
- OWASP Top 10 vulnerability surface assessment
- Data protection: encryption at rest and in transit, access controls
- Essential Eight maturity model alignment (AU-specific)
- Dependency security: known CVEs, Dependabot status
- Secret management and credential hygiene
- Authentication and authorization architecture
- Incident response readiness and runbook status
- SOC2 / ISO27001 readiness assessment
- Privacy and data handling compliance (Privacy Act 1988)
- Recommendations prioritized by risk severity`,
    ),
  },

  // ── 19. Data & AI Strategy (PREMIUM) ──────────────────────────────
  {
    id: "data_strategy",
    title: "Data Strategy & AI Governance",
    subtitle: "Data moat, analytics maturity, and responsible AI practices",
    tier: "premium",
    summaryWords: 0,
    fullWords: 1200,
    creditCost: 1.00,
    icon: "Database",
    agentOwner: "cdo",
    supportingAgents: ["cto"],
    criteriaKeys: [],
    summaryPrompt: "",
    fullPrompt: fullPrompt(
      "Data & AI Strategy",
      `- Data moat assessment: proprietary datasets, compounding advantage
- Analytics maturity: what metrics are tracked, how, and how well
- Data quality: completeness, accuracy, freshness of available data
- AI/ML capabilities: current use of AI, potential for AI-driven features
- Data governance: policies, access controls, data lineage
- AI governance: responsible AI practices, bias monitoring
- Competitive data advantage: does the startup accumulate valuable data?
- NIST AI Risk Management Framework alignment
- Recommendations for data strategy improvement
- Data monetization opportunities`,
    ),
  },

  // ── 20. Website & Digital Presence (INCLUDED) ─────────────────────
  {
    id: "website_digital",
    title: "Digital Presence & Conversion Analysis",
    subtitle: "Website quality, SEO, social media, and conversion optimization",
    tier: "included",
    summaryWords: 200,
    fullWords: 1200,
    creditCost: 0.50,
    icon: "Globe",
    agentOwner: "cmo",
    supportingAgents: ["cto", "cro", "cpo"],
    criteriaKeys: ["website"],
    summaryPrompt: summaryPrompt(
      "Website & Digital Presence",
      `- Website design quality and UX assessment
- SEO and content strategy evaluation
- Conversion optimization opportunities
- Mobile responsiveness and performance`,
    ),
    fullPrompt: fullPrompt(
      "Website & Digital Presence",
      `- Website design quality: visual appeal, brand consistency, professionalism
- UX assessment: navigation, information architecture, user flow
- Performance: Core Web Vitals, loading speed, mobile responsiveness
- SEO analysis: technical SEO, meta tags, content quality, keyword strategy
- Conversion optimization: CTA placement, form design, social proof
- Content quality: blog, documentation, case studies
- Social media presence: channels, engagement, consistency
- App store presence (if applicable): ratings, reviews, screenshots
- Competitor website comparison
- Quick wins for digital presence improvement`,
    ),
  },

  // ── 21. Organizational Structure (PAID) ───────────────────────────
  {
    id: "org_structure",
    title: "Organizational Design & Governance",
    subtitle: "Org chart, advisory board, roles, and governance maturity",
    tier: "paid",
    summaryWords: 0,
    fullWords: 1200,
    creditCost: 0.75,
    icon: "Network",
    agentOwner: "chro",
    supportingAgents: ["coo", "clo"],
    criteriaKeys: ["team_structure"],
    summaryPrompt: "",
    fullPrompt: fullPrompt(
      "Organizational Structure",
      `- Current org chart analysis: reporting lines, spans of control
- Role clarity: are responsibilities well-defined?
- Advisory board quality: domain expertise, network value, engagement level
- Governance maturity: board meetings, minutes, decision processes
- Operational efficiency: process maturity, communication channels
- Key person dependencies and succession planning
- Culture indicators: remote vs in-office, values, team dynamics
- Comparison to org structures at similar-stage AU startups
- ESOP allocation across the org
- Recommendations for org structure evolution as the company scales`,
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
