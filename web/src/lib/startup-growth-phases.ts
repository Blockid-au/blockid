// Startup Growth Phases — 12-phase framework from idea to scale
// Maps C-Level agent responsibilities to each phase
// Used by SVI reports to show "Where am I now?" journey map

export interface GrowthPhase {
  id: string;
  order: number;
  title: string;
  subtitle: string;
  leadAgent: string;
  supportAgents: string[];
  keyQuestions: string[];
  deliverables: string[];
  sviStageRange: [number, number];
  color: string;
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
