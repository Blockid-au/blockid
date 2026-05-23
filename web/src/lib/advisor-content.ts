// Static advisor content library — curated startup mentoring content per stage.
// No AI calls required. Feels personalized because it's stage-filtered.

export const ADVISOR_GREETING = {
  morning: "Good morning",
  afternoon: "Good afternoon",
  evening: "Good evening",
};

export function getGreetingByTime(): string {
  const hour = new Date().getHours();
  if (hour < 12) return ADVISOR_GREETING.morning;
  if (hour < 18) return ADVISOR_GREETING.afternoon;
  return ADVISOR_GREETING.evening;
}

export const STAGE_CONTEXT: Record<string, string> = {
  idea: "You're at the exciting concept stage — everything is possible. Let's validate before you build.",
  mvp: "You're building momentum. Let's make sure investors and customers see it too.",
  launched: "Your product is live. Now it's time to prove traction and grow your user base.",
  revenue: "Revenue is flowing. Time to optimise unit economics and prepare for your next round.",
  raising: "You're actively raising. Every data point in your SVI matters to investors right now.",
  // SVI stage numbers (from analysis)
  "0": "You're at the concept stage. Focus on problem-customer fit before writing a single line of code.",
  "1": "You've validated the idea. Now build the smallest thing that proves people will pay.",
  "2": "MVP stage — your product exists. Let's make sure investors notice the traction.",
  "3": "Early traction is the most exciting stage. Double down on what's working.",
  "4": "Revenue proves the model works. Time to optimise and scale what's proven.",
  "5": "Growth stage — you're scaling. Focus on unit economics and repeatable processes.",
  "6": "At scale, governance and compliance become your competitive advantage.",
  "7": "Corporation stage — IPO or acquisition readiness is your north star.",
};

export const CELEBRATION_COPY = {
  sviUp: (delta: number) => `Your SVI improved by +${delta} points. Great progress — keep this momentum going!`,
  sviDown: (delta: number) => `Your SVI decreased by ${Math.abs(delta)} points. Let's identify what changed and recover.`,
  sviFirst: "This is your first analysis. Your advisor dashboard is personalised from here.",
  sviStable: "Your SVI is holding steady. Upload new evidence to push it higher.",
};

export interface StageAdvice {
  focusAreas: Array<{ title: string; detail: string }>;
  pitfalls: string[];
  successMetrics: string[];
  mentorQuote: string;
  weeklyChallenge: string;
}

export const STAGE_ADVISOR_CONTENT: Record<number, StageAdvice> = {
  0: {
    focusAreas: [
      { title: "Talk to 20 potential customers", detail: "Schedule discovery calls. Don't pitch — just listen to their problems." },
      { title: "Define your problem statement", detail: "Write it in one sentence. If you can't, you haven't narrowed enough." },
      { title: "Research 3 direct competitors", detail: "Document their pricing, gaps, and what customers complain about." },
    ],
    pitfalls: [
      "Building before validating — talk first, code later",
      "Trying to serve everyone — pick one customer persona",
      "Falling in love with the solution instead of the problem",
    ],
    successMetrics: ["Customer interviews completed", "Problem clarity score", "Competitor analysis depth"],
    mentorQuote: "The best founders at concept stage are obsessed with the problem, not the solution.",
    weeklyChallenge: "Schedule 5 customer discovery calls this week. Record the key insights.",
  },
  1: {
    focusAreas: [
      { title: "Build your landing page", detail: "A simple page that explains your value prop and captures emails." },
      { title: "Create a pitch deck", detail: "12 slides: Problem, Solution, Market, Product, Traction, Team, Ask." },
      { title: "Set up basic analytics", detail: "Track sign-ups, page views, and engagement from day one." },
    ],
    pitfalls: [
      "Over-engineering the MVP — ship the simplest version",
      "Ignoring early feedback — your first users are your advisors",
      "Not tracking metrics from the start",
    ],
    successMetrics: ["Landing page conversion rate", "Email list size", "Feature request count"],
    mentorQuote: "A validated idea without a product is just a hypothesis. Ship something this week.",
    weeklyChallenge: "Get 10 people to sign up for your waitlist or beta.",
  },
  2: {
    focusAreas: [
      { title: "Get your first 10 paying users", detail: "Free users don't validate a business. Find people who will pay." },
      { title: "Upload your product demo", detail: "Screenshots, videos, or a live link prove your product exists." },
      { title: "Document your cap table", detail: "Before investors ask, know exactly who owns what." },
    ],
    pitfalls: [
      "Adding features before finding product-market fit",
      "Ignoring churn — 100 sign-ups mean nothing if 90 leave",
      "Not formalising equity splits with co-founders",
    ],
    successMetrics: ["Monthly active users", "Revenue (even $1 matters)", "Retention rate"],
    mentorQuote: "At MVP stage, your only job is to find people who love your product so much they'd be upset if it disappeared.",
    weeklyChallenge: "Talk to 3 users who stopped using your product. Understand why.",
  },
  3: {
    focusAreas: [
      { title: "Prove repeatable acquisition", detail: "Find one channel that reliably brings new users. Double down." },
      { title: "Track MRR/ARR rigorously", detail: "Investors will ask. Have a clean dashboard ready." },
      { title: "Build your data room", detail: "Start collecting the documents investors will want to see." },
    ],
    pitfalls: [
      "Scaling before unit economics work",
      "Hiring too fast before finding repeatable growth",
      "Neglecting existing customers for new ones",
    ],
    successMetrics: ["MRR growth rate", "Customer acquisition cost (CAC)", "Net revenue retention"],
    mentorQuote: "Traction is the single best signal of product-market fit. Make your growth undeniable.",
    weeklyChallenge: "Calculate your CAC and LTV. If you don't know these numbers, that's your first task.",
  },
  4: {
    focusAreas: [
      { title: "Optimise unit economics", detail: "CAC must be less than 1/3 of LTV for a sustainable business." },
      { title: "Prepare your fundraise materials", detail: "Pitch deck, financial model, and data room should be investor-ready." },
      { title: "Formalise governance", detail: "Board structure, shareholder agreements, and vesting schedules." },
    ],
    pitfalls: [
      "Burning cash on unprofitable growth",
      "Raising at the wrong time or valuation",
      "Ignoring legal and compliance requirements",
    ],
    successMetrics: ["Revenue growth rate", "Gross margin", "Burn rate / runway months"],
    mentorQuote: "Revenue is oxygen. But profitable revenue is the foundation of a real company.",
    weeklyChallenge: "Review your burn rate. How many months of runway do you have?",
  },
  5: {
    focusAreas: [
      { title: "Build repeatable sales process", detail: "Document your sales playbook. What works? What's the conversion rate?" },
      { title: "Strengthen your moat", detail: "Network effects, switching costs, or proprietary data — which is yours?" },
      { title: "Hire key leaders", detail: "Your next 3 hires will define the culture for the next 100." },
    ],
    pitfalls: [
      "Growing the team faster than revenue",
      "Losing focus on core product",
      "Not investing in culture and retention",
    ],
    successMetrics: ["Annual revenue growth", "Employee retention", "NPS score"],
    mentorQuote: "Growth-stage companies don't die from lack of ideas. They die from lack of focus.",
    weeklyChallenge: "Identify the #1 bottleneck to your next 2x growth. Focus only on that.",
  },
  6: {
    focusAreas: [
      { title: "International expansion readiness", detail: "Research your next market. Regulatory, cultural, and operational fit." },
      { title: "SOC 2 / compliance certifications", detail: "Enterprise customers require security certifications." },
      { title: "Board effectiveness", detail: "Monthly board packs, clear KPIs, and strategic alignment." },
    ],
    pitfalls: [
      "Expanding too many markets simultaneously",
      "Underestimating compliance costs",
      "Losing startup agility in process overhead",
    ],
    successMetrics: ["Revenue per employee", "Market share", "Enterprise contract value"],
    mentorQuote: "At scale, the founder's job shifts from building the product to building the company.",
    weeklyChallenge: "Review your org chart. Does every role have a clear owner and measurable output?",
  },
  7: {
    focusAreas: [
      { title: "Exit readiness assessment", detail: "Clean financials, IP audit, and strategic buyer mapping." },
      { title: "Corporate governance maturity", detail: "Independent directors, audit committees, and risk management." },
      { title: "Strategic partnerships", detail: "Identify acquisition targets or acquirers in your ecosystem." },
    ],
    pitfalls: [
      "Optimising for exit timing over business health",
      "Neglecting culture during transition",
      "Not having clean legal and financial records",
    ],
    successMetrics: ["EBITDA margin", "Revenue multiple", "Strategic optionality"],
    mentorQuote: "The best exits are a byproduct of building a great company, not a goal in themselves.",
    weeklyChallenge: "If an acquirer called today, could you produce a clean data room in 48 hours?",
  },
};

export const GOAL_TIPS: Record<string, string> = {
  validate_idea: "Your advisor recommends focusing on customer discovery — talk to 20 people before building anything.",
  build_mvp: "Ship the smallest version that solves one core problem. Perfection is the enemy of progress.",
  raise_funding: "Investors fund traction, not ideas. Focus on metrics that prove product-market fit.",
  get_investor_ready: "Your SVI score is your investor-readiness signal. Upload evidence to close every gap.",
  find_cofounder: "The best co-founder relationships start with complementary skills and shared values.",
  grow_revenue: "Revenue growth comes from retention first, acquisition second. Fix churn before scaling.",
  exit_planning: "Clean governance and financials are the foundation of any successful exit.",
};

export function getStageAdvice(stage: number): StageAdvice {
  return STAGE_ADVISOR_CONTENT[stage] ?? STAGE_ADVISOR_CONTENT[0];
}
