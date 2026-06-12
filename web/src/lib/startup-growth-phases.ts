// Startup Growth Phases — 12-phase framework from idea to scale
// Maps C-Level agent responsibilities to each phase
// Used by SVI reports to show "Where am I now?" journey map
// Supports step-by-step tracking with completion percentage per phase

export interface PhaseStep {
  id: string;
  title: string;
  description: string;
  agentHint: string; // which agent can auto-fill this
}

export interface GrowthPhase {
  id: string;
  order: number;
  title: string;
  subtitle: string;
  leadAgent: string;
  supportAgents: string[];
  keyQuestions: string[];
  deliverables: string[];
  steps: PhaseStep[];  // actionable steps for tracking
  sviStageRange: [number, number];
  color: string;
}

export interface PhaseProgress {
  phaseId: string;
  status: "not_started" | "in_progress" | "review" | "completed";
  completionPct: number;
  stepsCompleted: number;
  stepsTotal: number;
}

export const GROWTH_PHASES: GrowthPhase[] = [
  {
    id: "vision",
    order: 1,
    title: "Vision & Mission",
    subtitle: "Define a strong business vision",
    leadAgent: "ceo",
    supportAgents: ["cpo", "cmo"],
    keyQuestions: [
      "What problem are we solving?",
      "Who is our ideal customer?",
      "What makes us different?",
      "What is our 3-year vision?",
    ],
    deliverables: ["Vision statement", "Mission statement", "Problem-solution fit canvas", "Unique value proposition"],
    steps: [
      { id: "v1", title: "Define the problem you solve", description: "Clearly articulate the pain point your startup addresses", agentHint: "ceo" },
      { id: "v2", title: "Identify ideal customer profile", description: "Who suffers most from this problem?", agentHint: "cmo" },
      { id: "v3", title: "Write mission statement", description: "One sentence: what you do, for whom, and why", agentHint: "ceo" },
      { id: "v4", title: "Draft 3-year vision", description: "Where will this company be in 3 years?", agentHint: "ceo" },
      { id: "v5", title: "Unique value proposition", description: "What makes you 10x better than alternatives?", agentHint: "cpo" },
    ],
    sviStageRange: [0, 1],
    color: "#8b5cf6",
  },
  {
    id: "customer_dev",
    order: 2,
    title: "Customer Development",
    subtitle: "Analyze your customer feedback",
    leadAgent: "cmo",
    supportAgents: ["cro", "cpo"],
    keyQuestions: [
      "Who are our early adopters?",
      "What pain points do they confirm?",
      "How much would they pay?",
      "What channels reach them?",
    ],
    deliverables: ["Customer persona", "Pain point validation", "Interview summary", "Willingness to pay analysis"],
    steps: [
      { id: "cd1", title: "Create customer persona", description: "Demographics, behavior, goals, frustrations", agentHint: "cmo" },
      { id: "cd2", title: "Conduct 10+ customer interviews", description: "Validate assumptions with real users", agentHint: "cmo" },
      { id: "cd3", title: "Document pain points", description: "Top 3 pains confirmed by interviews", agentHint: "cmo" },
      { id: "cd4", title: "Willingness to pay analysis", description: "How much would customers pay?", agentHint: "cfo" },
      { id: "cd5", title: "Channel discovery", description: "Where do your customers hang out?", agentHint: "cro" },
    ],
    sviStageRange: [0, 2],
    color: "#06b6d4",
  },
  {
    id: "revenue_model",
    order: 3,
    title: "Revenue & Business Models",
    subtitle: "Validate a scalable revenue model",
    leadAgent: "cfo",
    supportAgents: ["cro", "cmo"],
    keyQuestions: [
      "What is our pricing model?",
      "What are unit economics (LTV/CAC)?",
      "When do we break even?",
      "What's our revenue projection?",
    ],
    deliverables: ["Business model canvas", "Financial projections", "Break-even analysis", "Pricing strategy"],
    steps: [
      { id: "rm1", title: "Choose pricing model", description: "SaaS subscription, freemium, marketplace fee, etc.", agentHint: "cfo" },
      { id: "rm2", title: "Calculate unit economics", description: "LTV, CAC, LTV/CAC ratio, payback period", agentHint: "cfo" },
      { id: "rm3", title: "Build financial projections", description: "12-month P&L with assumptions documented", agentHint: "cfo" },
      { id: "rm4", title: "Break-even analysis", description: "When will revenue cover costs?", agentHint: "cfo" },
      { id: "rm5", title: "Complete Business Model Canvas", description: "All 9 blocks filled with evidence", agentHint: "ceo" },
    ],
    sviStageRange: [1, 3],
    color: "#10b981",
  },
  {
    id: "pitch",
    order: 4,
    title: "Pitch Mastery",
    subtitle: "Learn how to build a great pitch",
    leadAgent: "ceo",
    supportAgents: ["cfo", "cmo"],
    keyQuestions: [
      "Can we tell our story in 60 seconds?",
      "What metrics matter to investors?",
      "How strong is our deck?",
      "What's our ask?",
    ],
    deliverables: ["Pitch deck (10-15 slides)", "Elevator pitch", "Financial summary slide", "Competitive landscape"],
    steps: [
      { id: "pm1", title: "Write elevator pitch", description: "60-second compelling story of your startup", agentHint: "ceo" },
      { id: "pm2", title: "Build pitch deck", description: "10-15 slide deck: problem, solution, market, traction, team, ask", agentHint: "ceo" },
      { id: "pm3", title: "Financial summary slide", description: "Key metrics investors care about on one slide", agentHint: "cfo" },
      { id: "pm4", title: "Competitive landscape", description: "2x2 matrix showing your positioning", agentHint: "cmo" },
      { id: "pm5", title: "Practice pitch 5+ times", description: "Record yourself, get feedback, iterate", agentHint: "ceo" },
    ],
    sviStageRange: [1, 3],
    color: "#f59e0b",
  },
  {
    id: "mentor_review",
    order: 5,
    title: "Mentor Idea Review",
    subtitle: "Test the core business on a mentor panel",
    leadAgent: "ceo",
    supportAgents: ["cto", "cfo", "cmo"],
    keyQuestions: [
      "Does the business model hold up?",
      "What blind spots do mentors see?",
      "Is the market large enough?",
      "What needs to change?",
    ],
    deliverables: ["Mentor feedback summary", "Pivot/persevere decision", "Updated value proposition", "Risk assessment"],
    steps: [
      { id: "mr1", title: "Prepare mentor briefing", description: "One-page summary: problem, solution, traction, ask", agentHint: "ceo" },
      { id: "mr2", title: "Schedule mentor sessions", description: "3+ mentors from different backgrounds", agentHint: "chro" },
      { id: "mr3", title: "Document feedback themes", description: "Common patterns across mentor feedback", agentHint: "ceo" },
      { id: "mr4", title: "Pivot or persevere decision", description: "Based on mentor input, decide direction", agentHint: "ceo" },
      { id: "mr5", title: "Update value proposition", description: "Incorporate mentor feedback into positioning", agentHint: "cpo" },
    ],
    sviStageRange: [1, 3],
    color: "#ec4899",
  },
  {
    id: "legal_equity",
    order: 6,
    title: "Legal & Equity",
    subtitle: "Review your legal infrastructure",
    leadAgent: "clo",
    supportAgents: ["cfo", "chro"],
    keyQuestions: [
      "Is our company structure right?",
      "Do we have a shareholders agreement?",
      "Is our IP protected?",
      "Is our cap table clean?",
    ],
    deliverables: ["Company structure review", "SHA/ESOP setup", "IP protection plan", "Cap table model"],
    steps: [
      { id: "le1", title: "Company structure review", description: "PTY LTD, LLC, C-Corp — is it right for your goals?", agentHint: "clo" },
      { id: "le2", title: "Shareholders agreement", description: "SHA covering vesting, exits, deadlock resolution", agentHint: "clo" },
      { id: "le3", title: "IP protection", description: "Trademarks, patents, trade secrets, assignment agreements", agentHint: "clo" },
      { id: "le4", title: "Cap table model", description: "Clean cap table with ESOP pool reserved", agentHint: "cfo" },
      { id: "le5", title: "ESOP/equity plan", description: "Employee stock option plan for key hires", agentHint: "chro" },
    ],
    sviStageRange: [2, 4],
    color: "#6366f1",
  },
  {
    id: "go_to_market",
    order: 7,
    title: "Go-to-Market & Scale",
    subtitle: "Improve your strategy to launch or scale",
    leadAgent: "cmo",
    supportAgents: ["cro", "cto", "cfo"],
    keyQuestions: [
      "What is our GTM strategy?",
      "What channels will we use?",
      "What's our launch plan?",
      "What's our monthly marketing budget?",
    ],
    deliverables: ["GTM strategy document", "Channel plan with costs", "Launch timeline", "Marketing budget"],
    steps: [
      { id: "gtm1", title: "Define GTM strategy", description: "Product-led, sales-led, community-led, or hybrid?", agentHint: "cmo" },
      { id: "gtm2", title: "Channel plan", description: "Top 3 acquisition channels with cost per channel", agentHint: "cro" },
      { id: "gtm3", title: "Launch timeline", description: "Week-by-week plan for first 90 days", agentHint: "cmo" },
      { id: "gtm4", title: "Marketing budget", description: "Monthly allocation across channels", agentHint: "cfo" },
      { id: "gtm5", title: "First 100 customers plan", description: "Specific tactics to acquire first paying users", agentHint: "cro" },
    ],
    sviStageRange: [2, 5],
    color: "#2563eb",
  },
  {
    id: "product_dev",
    order: 8,
    title: "Product Development",
    subtitle: "Get feedback on your product roadmap",
    leadAgent: "cto",
    supportAgents: ["cpo", "ciso"],
    keyQuestions: [
      "Is our tech stack scalable?",
      "What's our MVP scope?",
      "What's the development timeline?",
      "What's the tech budget?",
    ],
    deliverables: ["Product roadmap", "Tech architecture", "MVP feature list", "Development cost estimate"],
    steps: [
      { id: "pd1", title: "Define MVP scope", description: "Minimum features that solve the core problem", agentHint: "cpo" },
      { id: "pd2", title: "Tech architecture", description: "Stack, infrastructure, scalability plan", agentHint: "cto" },
      { id: "pd3", title: "Product roadmap", description: "3-6 month feature roadmap with milestones", agentHint: "cpo" },
      { id: "pd4", title: "Development cost estimate", description: "Team, tools, infrastructure costs", agentHint: "cto" },
      { id: "pd5", title: "Security & compliance plan", description: "Data protection, auth, GDPR/privacy", agentHint: "ciso" },
    ],
    sviStageRange: [2, 5],
    color: "#0ea5e9",
  },
  {
    id: "investor_review",
    order: 9,
    title: "Investor Progress Review",
    subtitle: "Test your progress on a mentor panel",
    leadAgent: "ceo",
    supportAgents: ["cfo", "cro"],
    keyQuestions: [
      "Are we hitting milestones?",
      "What metrics show traction?",
      "Are we investor-ready?",
      "What's our valuation basis?",
    ],
    deliverables: ["Traction dashboard", "Milestone progress report", "Updated financial model", "Valuation analysis"],
    steps: [
      { id: "ir1", title: "Build traction dashboard", description: "MRR, users, growth rate, retention on one page", agentHint: "cdo" },
      { id: "ir2", title: "Milestone progress report", description: "What you promised vs. what you delivered", agentHint: "coo" },
      { id: "ir3", title: "Updated financial model", description: "Actuals vs. projections, revised forecast", agentHint: "cfo" },
      { id: "ir4", title: "Valuation basis", description: "Comparable companies, revenue multiples, SVI score", agentHint: "cfo" },
      { id: "ir5", title: "Investor Q&A preparation", description: "Top 20 questions investors will ask", agentHint: "ceo" },
    ],
    sviStageRange: [3, 5],
    color: "#f97316",
  },
  {
    id: "team",
    order: 10,
    title: "Co-Founders & Team",
    subtitle: "Improve your team and hiring",
    leadAgent: "chro",
    supportAgents: ["ceo", "cfo"],
    keyQuestions: [
      "Do we have the right team?",
      "What roles are missing?",
      "How should equity be split?",
      "What's our hiring plan?",
    ],
    deliverables: ["Team assessment", "Hiring roadmap", "ESOP plan", "Org chart"],
    steps: [
      { id: "t1", title: "Team skills assessment", description: "Map current skills vs. what's needed", agentHint: "chro" },
      { id: "t2", title: "Key hires roadmap", description: "Next 3 critical roles to fill, in order", agentHint: "chro" },
      { id: "t3", title: "Equity split review", description: "Fair allocation based on contribution and risk", agentHint: "cfo" },
      { id: "t4", title: "Org chart", description: "Current and 12-month projected structure", agentHint: "chro" },
      { id: "t5", title: "Culture & values", description: "Define what makes your team work", agentHint: "ceo" },
    ],
    sviStageRange: [3, 6],
    color: "#a855f7",
  },
  {
    id: "growth",
    order: 11,
    title: "Growth",
    subtitle: "Establish a scalable engine for growth",
    leadAgent: "cro",
    supportAgents: ["cmo", "cdo", "cto"],
    keyQuestions: [
      "What's our growth rate?",
      "What's our retention/churn?",
      "What channels are working?",
      "Can we 10x from here?",
    ],
    deliverables: ["Growth metrics dashboard", "Retention analysis", "Channel performance", "Scaling plan"],
    steps: [
      { id: "g1", title: "Growth metrics dashboard", description: "MoM growth, DAU/MAU ratio, virality coefficient", agentHint: "cdo" },
      { id: "g2", title: "Retention/churn analysis", description: "Cohort analysis, identify drop-off points", agentHint: "cro" },
      { id: "g3", title: "Channel performance", description: "ROI per acquisition channel, double down on winners", agentHint: "cmo" },
      { id: "g4", title: "Scaling plan", description: "What needs to change to 10x from here?", agentHint: "coo" },
      { id: "g5", title: "Network effects strategy", description: "How does each new user make the product better?", agentHint: "cpo" },
    ],
    sviStageRange: [4, 6],
    color: "#14b8a6",
  },
  {
    id: "funding",
    order: 12,
    title: "Funding",
    subtitle: "Fix any impediments to fundraising",
    leadAgent: "cfo",
    supportAgents: ["ceo", "clo"],
    keyQuestions: [
      "Are we investor-ready?",
      "What's our fundraising target?",
      "What terms should we offer?",
      "What due diligence gaps exist?",
    ],
    deliverables: ["Investor-ready data room", "Term sheet preparation", "Due diligence checklist", "Fundraising timeline"],
    steps: [
      { id: "f1", title: "Data room setup", description: "Financials, legal docs, metrics, team bios organized", agentHint: "cfo" },
      { id: "f2", title: "Term sheet preparation", description: "Understand terms: valuation, liquidation, anti-dilution", agentHint: "clo" },
      { id: "f3", title: "Due diligence checklist", description: "Pre-answer all DD questions before investors ask", agentHint: "cfo" },
      { id: "f4", title: "Fundraising timeline", description: "Target investors, warm intros, meeting schedule", agentHint: "ceo" },
      { id: "f5", title: "Investor target list", description: "20+ investors matched to your stage and industry", agentHint: "cro" },
    ],
    sviStageRange: [4, 7],
    color: "#ef4444",
  },
];

export function getCurrentPhase(sviStage: number): GrowthPhase {
  const matching = GROWTH_PHASES.filter(
    (p) => sviStage >= p.sviStageRange[0] && sviStage <= p.sviStageRange[1],
  );
  return matching[matching.length - 1] ?? GROWTH_PHASES[0];
}

export function getPhaseProgress(sviStage: number): { completed: GrowthPhase[]; current: GrowthPhase[]; upcoming: GrowthPhase[] } {
  const completed: GrowthPhase[] = [];
  const current: GrowthPhase[] = [];
  const upcoming: GrowthPhase[] = [];

  for (const phase of GROWTH_PHASES) {
    if (sviStage > phase.sviStageRange[1]) {
      completed.push(phase);
    } else if (sviStage >= phase.sviStageRange[0] && sviStage <= phase.sviStageRange[1]) {
      current.push(phase);
    } else {
      upcoming.push(phase);
    }
  }

  return { completed, current, upcoming };
}

// ── SVG Journey Map ────────────────────────────────────────────────────────
// Generates a visual progress path showing the startup's position in the 12 phases

export function renderGrowthJourneySVG(currentStage: number, startupName: string): string {
  const w = 800, h = 480;
  const { completed, current, upcoming } = getPhaseProgress(currentStage);

  const phases = GROWTH_PHASES;
  const cols = 4;
  const rows = 3;
  const cellW = (w - 80) / cols;
  const cellH = (h - 100) / rows;

  const nodes = phases.map((phase, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = 50 + col * cellW + cellW / 2;
    const y = 70 + row * cellH + cellH / 2;

    const isCompleted = completed.includes(phase);
    const isCurrent = current.includes(phase);
    const fill = isCurrent ? phase.color : isCompleted ? "#d1fae5" : "#f3f4f6";
    const stroke = isCurrent ? phase.color : isCompleted ? "#10b981" : "#d1d5db";
    const textColor = isCurrent ? "white" : isCompleted ? "#059669" : "#9ca3af";
    const icon = isCompleted ? "✓" : isCurrent ? "→" : String(phase.order);
    const opacity = isCurrent ? "1" : isCompleted ? "0.9" : "0.5";

    return `<g opacity="${opacity}">
      <rect x="${x - cellW / 2 + 8}" y="${y - cellH / 2 + 8}" width="${cellW - 16}" height="${cellH - 16}" rx="12" fill="${fill}" stroke="${stroke}" stroke-width="${isCurrent ? 3 : 1.5}"/>
      <circle cx="${x - cellW / 2 + 26}" cy="${y - cellH / 2 + 26}" r="11" fill="${isCurrent ? 'rgba(255,255,255,0.3)' : stroke}" />
      <text x="${x - cellW / 2 + 26}" y="${y - cellH / 2 + 30}" text-anchor="middle" font-size="10" font-family="Arial" fill="${isCurrent ? 'white' : textColor}" font-weight="bold">${icon}</text>
      <text x="${x}" y="${y - 5}" text-anchor="middle" font-size="11" font-family="Arial" fill="${textColor}" font-weight="bold">${phase.title}</text>
      <text x="${x}" y="${y + 12}" text-anchor="middle" font-size="9" font-family="Arial" fill="${isCurrent ? 'rgba(255,255,255,0.8)' : '#9ca3af'}">${phase.subtitle.slice(0, 30)}</text>
      <text x="${x}" y="${y + 26}" text-anchor="middle" font-size="8" font-family="Arial" fill="${isCurrent ? 'rgba(255,255,255,0.7)' : '#d1d5db'}">Lead: ${phase.leadAgent.toUpperCase()}</text>
    </g>`;
  });

  // Connection lines between phases
  const connections = phases.slice(1).map((_, i) => {
    const fromCol = i % cols;
    const fromRow = Math.floor(i / cols);
    const toCol = (i + 1) % cols;
    const toRow = Math.floor((i + 1) / cols);
    const fromX = 50 + fromCol * cellW + cellW / 2 + cellW / 2 - 8;
    const fromY = 70 + fromRow * cellH + cellH / 2;
    const toX = 50 + toCol * cellW + cellW / 2 - cellW / 2 + 8;
    const toY = 70 + toRow * cellH + cellH / 2;

    if (fromRow === toRow) {
      return `<line x1="${fromX}" y1="${fromY}" x2="${toX}" y2="${toY}" stroke="#d1d5db" stroke-width="1.5" stroke-dasharray="4,4"/>`;
    }
    return `<path d="M${fromX} ${fromY} L${fromX + 20} ${toY}" stroke="#d1d5db" stroke-width="1.5" stroke-dasharray="4,4" fill="none"/>`;
  });

  const progressPercent = Math.round((completed.length / phases.length) * 100);

  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="headerGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#6366f1"/>
      <stop offset="100%" style="stop-color:#2563eb"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" rx="16" fill="white"/>
  <rect width="${w}" height="50" rx="16" fill="url(#headerGrad)"/>
  <rect x="0" y="34" width="${w}" height="16" fill="url(#headerGrad)"/>
  <text x="24" y="32" font-size="16" font-family="Arial" fill="white" font-weight="bold">${startupName} — Growth Journey</text>
  <text x="${w - 24}" y="32" text-anchor="end" font-size="12" font-family="Arial" fill="rgba(255,255,255,0.8)">${progressPercent}% Complete • ${completed.length}/${phases.length} phases</text>
  ${connections.join("\n  ")}
  ${nodes.join("\n  ")}
  <rect x="24" y="${h - 30}" width="${w - 48}" height="6" rx="3" fill="#e5e7eb"/>
  <rect x="24" y="${h - 30}" width="${(w - 48) * progressPercent / 100}" height="6" rx="3" fill="#6366f1"/>
</svg>`;
}

// ── Phase Detail SVG Card ──────────────────────────────────────────────────

export function renderPhaseDetailSVG(phase: GrowthPhase, startupName: string): string {
  const w = 600, h = 380;

  const questions = phase.keyQuestions.map((q, i) =>
    `<text x="30" y="${170 + i * 22}" font-size="11" font-family="Arial" fill="#374151">• ${q}</text>`,
  ).join("\n  ");

  const deliverables = phase.deliverables.map((d, i) =>
    `<text x="320" y="${170 + i * 22}" font-size="11" font-family="Arial" fill="#374151">✦ ${d}</text>`,
  ).join("\n  ");

  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${w}" height="${h}" rx="12" fill="white" stroke="#e5e7eb" stroke-width="1"/>
  <rect width="${w}" height="60" rx="12" fill="${phase.color}"/>
  <rect x="0" y="48" width="${w}" height="12" fill="${phase.color}"/>
  <circle cx="35" cy="30" r="18" fill="rgba(255,255,255,0.2)"/>
  <text x="35" y="35" text-anchor="middle" font-size="14" font-family="Arial" fill="white" font-weight="bold">${phase.order}</text>
  <text x="65" y="28" font-size="16" font-family="Arial" fill="white" font-weight="bold">Phase ${phase.order}: ${phase.title}</text>
  <text x="65" y="46" font-size="11" font-family="Arial" fill="rgba(255,255,255,0.8)">${phase.subtitle} • Lead: ${phase.leadAgent.toUpperCase()} + ${phase.supportAgents.map(a => a.toUpperCase()).join(", ")}</text>
  <text x="30" y="90" font-size="10" font-family="Arial" fill="#6b7280" font-weight="bold">FOR: ${startupName}</text>
  <line x1="20" y1="105" x2="${w - 20}" y2="105" stroke="#e5e7eb" stroke-width="1"/>
  <text x="30" y="130" font-size="12" font-family="Arial" fill="#111827" font-weight="bold">Key Questions</text>
  <text x="320" y="130" font-size="12" font-family="Arial" fill="#111827" font-weight="bold">Deliverables</text>
  <line x1="300" y1="115" x2="300" y2="${h - 20}" stroke="#e5e7eb" stroke-width="1" stroke-dasharray="3,3"/>
  ${questions}
  ${deliverables}
</svg>`;
}

// ── Three Questions SVG (Where am I? What am I worth? What should I do?) ───

export function renderThreeQuestionsSVG(data: {
  startupName: string;
  currentStage: string;
  sviScore: number;
  valuationRange: string;
  nextSteps: string[];
}): string {
  const w = 700, h = 320;
  const { startupName, currentStage, sviScore, valuationRange, nextSteps } = data;

  const stepLines = nextSteps.slice(0, 4).map((s, i) =>
    `<text x="510" y="${155 + i * 20}" font-size="10" font-family="Arial" fill="#374151">${i + 1}. ${s.slice(0, 35)}</text>`,
  ).join("\n  ");

  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="q1" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" style="stop-color:#8b5cf6"/><stop offset="100%" style="stop-color:#6366f1"/></linearGradient>
    <linearGradient id="q2" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" style="stop-color:#2563eb"/><stop offset="100%" style="stop-color:#1d4ed8"/></linearGradient>
    <linearGradient id="q3" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" style="stop-color:#10b981"/><stop offset="100%" style="stop-color:#059669"/></linearGradient>
  </defs>
  <rect width="${w}" height="${h}" rx="16" fill="#fafafa" stroke="#e5e7eb" stroke-width="1"/>
  <text x="${w / 2}" y="35" text-anchor="middle" font-size="16" font-family="Arial" fill="#111827" font-weight="bold">${startupName} — Your Startup Journey</text>
  <text x="${w / 2}" y="55" text-anchor="middle" font-size="11" font-family="Arial" fill="#6b7280">Answering the three critical questions every founder needs</text>

  <!-- Question 1: Where Am I Now? -->
  <rect x="20" y="75" width="200" height="220" rx="12" fill="url(#q1)"/>
  <text x="120" y="105" text-anchor="middle" font-size="13" font-family="Arial" fill="white" font-weight="bold">Where Am I Now?</text>
  <circle cx="120" cy="160" r="40" fill="rgba(255,255,255,0.15)"/>
  <text x="120" y="155" text-anchor="middle" font-size="10" font-family="Arial" fill="rgba(255,255,255,0.7)">SVI</text>
  <text x="120" y="175" text-anchor="middle" font-size="22" font-family="Arial" fill="white" font-weight="bold">${sviScore}</text>
  <text x="120" y="230" text-anchor="middle" font-size="11" font-family="Arial" fill="rgba(255,255,255,0.9)">${currentStage}</text>
  <text x="120" y="250" text-anchor="middle" font-size="9" font-family="Arial" fill="rgba(255,255,255,0.7)">Based on ${sviScore > 80 ? "strong" : sviScore > 50 ? "growing" : "early"} evidence</text>

  <!-- Question 2: What Am I Worth? -->
  <rect x="240" y="75" width="200" height="220" rx="12" fill="url(#q2)"/>
  <text x="340" y="105" text-anchor="middle" font-size="13" font-family="Arial" fill="white" font-weight="bold">What Am I Worth?</text>
  <text x="340" y="155" text-anchor="middle" font-size="10" font-family="Arial" fill="rgba(255,255,255,0.7)">Estimated Range</text>
  <text x="340" y="180" text-anchor="middle" font-size="16" font-family="Arial" fill="white" font-weight="bold">${valuationRange}</text>
  <text x="340" y="220" text-anchor="middle" font-size="10" font-family="Arial" fill="rgba(255,255,255,0.8)">SVI Market Index</text>
  <text x="340" y="240" text-anchor="middle" font-size="9" font-family="Arial" fill="rgba(255,255,255,0.7)">Revenue multiples + comparables</text>
  <text x="340" y="258" text-anchor="middle" font-size="9" font-family="Arial" fill="rgba(255,255,255,0.7)">Updated with each data point</text>

  <!-- Question 3: What Should I Do Next? -->
  <rect x="460" y="75" width="220" height="220" rx="12" fill="url(#q3)"/>
  <text x="570" y="105" text-anchor="middle" font-size="13" font-family="Arial" fill="white" font-weight="bold">What Should I Do Next?</text>
  <text x="510" y="135" font-size="10" font-family="Arial" fill="rgba(255,255,255,0.7)">Priority Actions:</text>
  ${stepLines}
  <text x="570" y="270" text-anchor="middle" font-size="9" font-family="Arial" fill="rgba(255,255,255,0.7)">Guided by your C-Level AI agents</text>
</svg>`;
}

// ── Progress Dashboard SVG ───────────────────────────────────────────────
// Full progress dashboard with per-phase completion bars and step checklist

export function renderProgressDashboardSVG(
  startupName: string,
  phaseProgress: PhaseProgress[],
): string {
  const w = 800, h = 700;
  const barW = 460;
  const rowH = 44;
  const startY = 90;

  const totalSteps = phaseProgress.reduce((s, p) => s + p.stepsTotal, 0);
  const completedSteps = phaseProgress.reduce((s, p) => s + p.stepsCompleted, 0);
  const overallPct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  const completedPhases = phaseProgress.filter(p => p.status === "completed").length;
  const inProgressPhases = phaseProgress.filter(p => p.status === "in_progress").length;

  const statusIcon = (s: PhaseProgress["status"]) =>
    s === "completed" ? "&#x2713;" : s === "in_progress" ? "&#x25B6;" : s === "review" ? "&#x21BB;" : "&#x25CB;";
  const statusColor = (s: PhaseProgress["status"]) =>
    s === "completed" ? "#10b981" : s === "in_progress" ? "#3b82f6" : s === "review" ? "#f59e0b" : "#d1d5db";

  const rows = GROWTH_PHASES.map((phase, i) => {
    const prog = phaseProgress.find(p => p.phaseId === phase.id) ?? {
      phaseId: phase.id, status: "not_started" as const, completionPct: 0, stepsCompleted: 0, stepsTotal: phase.steps.length,
    };
    const y = startY + i * rowH;
    const barFill = Math.max(0, Math.min(barW, (barW * prog.completionPct) / 100));
    const textColor = prog.status === "not_started" ? "#9ca3af" : "#111827";

    return `<g>
      <rect x="0" y="${y}" width="${w}" height="${rowH}" fill="${i % 2 === 0 ? "#fafafa" : "white"}"/>
      <text x="16" y="${y + 27}" font-size="16" font-family="Arial" fill="${statusColor(prog.status)}">${statusIcon(prog.status)}</text>
      <text x="38" y="${y + 22}" font-size="11" font-family="Arial" fill="${textColor}" font-weight="${prog.status === "in_progress" ? "bold" : "normal"}">${phase.order}. ${phase.title}</text>
      <text x="38" y="${y + 36}" font-size="9" font-family="Arial" fill="#9ca3af">${phase.leadAgent.toUpperCase()} • ${prog.stepsCompleted}/${prog.stepsTotal} steps</text>
      <rect x="${280}" y="${y + 14}" width="${barW}" height="16" rx="8" fill="#e5e7eb"/>
      <rect x="${280}" y="${y + 14}" width="${barFill}" height="16" rx="8" fill="${phase.color}"/>
      <text x="${280 + barW + 10}" y="${y + 27}" font-size="11" font-family="Arial" fill="${textColor}" font-weight="bold">${prog.completionPct}%</text>
    </g>`;
  });

  const overallBarFill = Math.max(0, (w - 60) * overallPct / 100);

  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="dashGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#6366f1"/>
      <stop offset="100%" style="stop-color:#8b5cf6"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" rx="16" fill="white"/>
  <rect width="${w}" height="70" rx="16" fill="url(#dashGrad)"/>
  <rect x="0" y="54" width="${w}" height="16" fill="url(#dashGrad)"/>
  <text x="24" y="30" font-size="18" font-family="Arial" fill="white" font-weight="bold">${startupName} — Startup Progress Dashboard</text>
  <text x="24" y="50" font-size="12" font-family="Arial" fill="rgba(255,255,255,0.8)">${completedPhases} completed, ${inProgressPhases} in progress • ${completedSteps}/${totalSteps} steps done</text>
  <text x="${w - 24}" y="40" text-anchor="end" font-size="28" font-family="Arial" fill="white" font-weight="bold">${overallPct}%</text>
  ${rows.join("\n  ")}
  <rect x="30" y="${startY + 12 * rowH + 20}" width="${w - 60}" height="10" rx="5" fill="#e5e7eb"/>
  <rect x="30" y="${startY + 12 * rowH + 20}" width="${overallBarFill}" height="10" rx="5" fill="url(#dashGrad)"/>
  <text x="${w / 2}" y="${startY + 12 * rowH + 50}" text-anchor="middle" font-size="11" font-family="Arial" fill="#6b7280">Overall Journey: ${overallPct}% complete — ${12 - completedPhases} phases remaining</text>
  <text x="${w / 2}" y="${startY + 12 * rowH + 68}" text-anchor="middle" font-size="9" font-family="Arial" fill="#9ca3af">Powered by BlockID AI C-Level Agents • Updated ${new Date().toISOString().slice(0, 10)}</text>
</svg>`;
}

// ── Step Checklist SVG for a single phase ────────────────────────────────

export function renderPhaseChecklistSVG(
  phase: GrowthPhase,
  completedStepIds: string[],
  startupName: string,
): string {
  const w = 600, h = 80 + phase.steps.length * 48;

  const stepRows = phase.steps.map((step, i) => {
    const y = 75 + i * 48;
    const done = completedStepIds.includes(step.id);
    const icon = done ? "&#x2713;" : `${i + 1}`;
    const bg = done ? "#f0fdf4" : "white";
    const iconBg = done ? "#10b981" : "#e5e7eb";
    const iconColor = done ? "white" : "#6b7280";
    const textDecor = done ? "line-through" : "none";
    const textColor = done ? "#6b7280" : "#111827";

    return `<g>
      <rect x="0" y="${y}" width="${w}" height="46" fill="${bg}"/>
      <circle cx="30" cy="${y + 23}" r="14" fill="${iconBg}"/>
      <text x="30" y="${y + 28}" text-anchor="middle" font-size="11" font-family="Arial" fill="${iconColor}" font-weight="bold">${icon}</text>
      <text x="56" y="${y + 18}" font-size="12" font-family="Arial" fill="${textColor}" font-weight="500" text-decoration="${textDecor}">${step.title}</text>
      <text x="56" y="${y + 34}" font-size="10" font-family="Arial" fill="#9ca3af">${step.description} • Agent: ${step.agentHint.toUpperCase()}</text>
    </g>`;
  });

  const pct = phase.steps.length > 0
    ? Math.round((completedStepIds.filter(id => phase.steps.some(s => s.id === id)).length / phase.steps.length) * 100)
    : 0;

  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${w}" height="${h}" rx="12" fill="white" stroke="#e5e7eb"/>
  <rect width="${w}" height="60" rx="12" fill="${phase.color}"/>
  <rect x="0" y="48" width="${w}" height="12" fill="${phase.color}"/>
  <text x="20" y="30" font-size="14" font-family="Arial" fill="white" font-weight="bold">Phase ${phase.order}: ${phase.title} — ${startupName}</text>
  <text x="20" y="48" font-size="10" font-family="Arial" fill="rgba(255,255,255,0.8)">${phase.subtitle} • ${pct}% complete • Lead: ${phase.leadAgent.toUpperCase()}</text>
  <text x="${w - 20}" y="35" text-anchor="end" font-size="20" font-family="Arial" fill="white" font-weight="bold">${pct}%</text>
  ${stepRows.join("\n  ")}
</svg>`;
}

// ── Compute overall progress from step completion data ───────────────────

export function computePhaseProgress(
  stepsData: Record<string, string[]>, // phaseId → completed step IDs
): PhaseProgress[] {
  return GROWTH_PHASES.map(phase => {
    const completedIds = stepsData[phase.id] ?? [];
    const stepsCompleted = completedIds.filter(id => phase.steps.some(s => s.id === id)).length;
    const stepsTotal = phase.steps.length;
    const completionPct = stepsTotal > 0 ? Math.round((stepsCompleted / stepsTotal) * 100) : 0;
    const status: PhaseProgress["status"] =
      completionPct === 100 ? "completed"
      : completionPct > 0 ? "in_progress"
      : "not_started";
    return { phaseId: phase.id, status, completionPct, stepsCompleted, stepsTotal };
  });
}

export function getNextActionableSteps(
  stepsData: Record<string, string[]>,
  limit = 5,
): { phase: GrowthPhase; step: PhaseStep }[] {
  const result: { phase: GrowthPhase; step: PhaseStep }[] = [];
  for (const phase of GROWTH_PHASES) {
    const completedIds = new Set(stepsData[phase.id] ?? []);
    for (const step of phase.steps) {
      if (!completedIds.has(step.id)) {
        result.push({ phase, step });
        if (result.length >= limit) return result;
      }
    }
  }
  return result;
}
