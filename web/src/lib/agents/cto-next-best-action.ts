// CTO Next-Best-Action Engine (T0103)
//
// Analyses a founder's SVI scores across all 8 dimensions and the current
// startup stage, then surfaces a prioritised list of concrete actions that
// will have the biggest score/investor-readiness impact for the least effort.

export type Effort = "low" | "medium" | "high";
export type Priority = "P0" | "P1" | "P2";
export type Stage = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface DimensionScore {
  code: "ftv" | "mpc" | "ptd" | "tre" | "cgh" | "iri" | "lco" | "svm";
  label: string;
  score: number;        // 0–100
  weight: number;       // relative weight
  gaps: string[];
}

export interface NextBestAction {
  id: string;
  priority: Priority;
  title: string;
  rationale: string;
  dimension: string;
  sviBenefit: number;   // estimated SVI point gain
  effort: Effort;
  timeToComplete: string;
  auResource?: string;  // AU-specific resource/service
  tags: string[];
}

export interface NextBestActionResult {
  currentSvi: number;
  projectedSvi: number;         // after completing top 3 P0 actions
  stage: number;
  stageLabel: string;
  weakestDimension: string;
  actions: NextBestAction[];
  topInsight: string;
  generatedAt: string;
}

// ── Dimension labels ──────────────────────────────────────────────────────────
const DIMENSION_LABELS: Record<string, string> = {
  ftv: "Founder & Team Value",
  mpc: "Market & Problem Clarity",
  ptd: "Product & Technical Depth",
  tre: "Traction & Revenue Evidence",
  cgh: "Cap Table & Governance Health",
  iri: "Investor Readiness Index",
  lco: "Legal & Compliance",
  svm: "Strategic Vision & Moat",
};

const STAGE_LABELS = [
  "Concept", "Validated Idea", "MVP / Prototype",
  "Early Traction", "Revenue", "Growth", "Scale", "Corporation",
];

// ── Action library keyed by dimension + score band ───────────────────────────
// Each entry: score < threshold → suggest action
type ActionDef = {
  id: string;
  threshold: number;  // fire if dimension score < threshold
  minStage?: Stage;
  maxStage?: Stage;
  priority: Priority;
  title: string;
  rationale: string;
  sviBenefit: number;
  effort: Effort;
  timeToComplete: string;
  auResource?: string;
  tags: string[];
};

const ACTION_LIBRARY: Record<string, ActionDef[]> = {
  ftv: [
    {
      id: "ftv-01",
      threshold: 40,
      priority: "P0",
      title: "Add a co-founder with complementary skills",
      rationale: "Single-founder startups score 15 pts lower on FTV. Investors want resilient teams.",
      sviBenefit: 14,
      effort: "high",
      timeToComplete: "1–3 months",
      auResource: "CoFoundersLab AU, Antler Australia",
      tags: ["team", "investor-readiness"],
    },
    {
      id: "ftv-02",
      threshold: 55,
      priority: "P1",
      title: "Recruit 1–2 named advisors in your sector",
      rationale: "Named advisors (with LinkedIn) add 8 pts to FTV and boost investor trust.",
      sviBenefit: 7,
      effort: "medium",
      timeToComplete: "2–4 weeks",
      auResource: "SBE Australia, StartupAus Advisor Network",
      tags: ["team", "credibility"],
    },
    {
      id: "ftv-03",
      threshold: 70,
      priority: "P2",
      title: "Document founder sector expertise in your profile",
      rationale: "Verified domain experience adds up to 10 pts on FTV dimension.",
      sviBenefit: 5,
      effort: "low",
      timeToComplete: "1–2 days",
      tags: ["team", "documentation"],
    },
  ],
  mpc: [
    {
      id: "mpc-01",
      threshold: 40,
      priority: "P0",
      title: "Conduct 20+ customer discovery interviews and document findings",
      rationale: "Validated problem evidence adds 25 pts to MPC. Foundational for investor conversations.",
      sviBenefit: 18,
      effort: "medium",
      timeToComplete: "2–3 weeks",
      auResource: "YesBoss, SurveyMonkey AU",
      tags: ["market", "validation"],
    },
    {
      id: "mpc-02",
      threshold: 55,
      priority: "P0",
      title: "Define TAM/SAM/SOM with AU market data",
      rationale: "Missing market size data costs 20 MPC pts. Use IBIS World AU or Statista.",
      sviBenefit: 15,
      effort: "medium",
      timeToComplete: "1 week",
      auResource: "IBISWorld AU, ABS.gov.au",
      tags: ["market", "sizing"],
    },
    {
      id: "mpc-03",
      threshold: 70,
      priority: "P1",
      title: "Identify and document your direct AU competitors",
      rationale: "Competitive landscape maps add credibility and clarify your positioning.",
      sviBenefit: 6,
      effort: "low",
      timeToComplete: "3–5 days",
      tags: ["market", "competitive"],
    },
  ],
  ptd: [
    {
      id: "ptd-01",
      threshold: 40,
      priority: "P0",
      title: "Build and deploy a working MVP",
      rationale: "No product = no PTD score. A live MVP adds 30+ pts immediately.",
      sviBenefit: 25,
      effort: "high",
      timeToComplete: "4–8 weeks",
      auResource: "AWS Activate for AU startups",
      tags: ["product", "mvp"],
    },
    {
      id: "ptd-02",
      threshold: 55,
      priority: "P1",
      title: "Connect your GitHub repo as evidence",
      rationale: "Verified source code adds 15 pts to PTD and signals technical execution.",
      sviBenefit: 10,
      effort: "low",
      timeToComplete: "1 day",
      tags: ["product", "evidence"],
    },
    {
      id: "ptd-03",
      threshold: 70,
      priority: "P2",
      title: "Add a public product demo or video walkthrough",
      rationale: "Demo evidence lifts PTD by 8 pts and reduces investor friction.",
      sviBenefit: 7,
      effort: "low",
      timeToComplete: "2–3 days",
      tags: ["product", "demo"],
    },
  ],
  tre: [
    {
      id: "tre-01",
      threshold: 35,
      priority: "P0",
      title: "Get your first paying customer (even $1 MRR)",
      rationale: "First revenue unlocks 20+ TRE pts and signals product-market fit.",
      sviBenefit: 20,
      effort: "high",
      timeToComplete: "2–6 weeks",
      tags: ["revenue", "traction"],
    },
    {
      id: "tre-02",
      threshold: 50,
      priority: "P0",
      title: "Connect Stripe as revenue evidence source",
      rationale: "Verified MRR data adds 15 pts to TRE. Investors trust connected sources 4× more.",
      sviBenefit: 12,
      effort: "low",
      timeToComplete: "1–2 hours",
      tags: ["revenue", "evidence"],
    },
    {
      id: "tre-03",
      threshold: 65,
      priority: "P1",
      title: "Publish monthly growth metrics (users, MRR, retention)",
      rationale: "Documented growth trajectory adds TRE credibility even at low absolute numbers.",
      sviBenefit: 8,
      effort: "medium",
      timeToComplete: "1 week",
      tags: ["traction", "metrics"],
    },
  ],
  cgh: [
    {
      id: "cgh-01",
      threshold: 40,
      priority: "P0",
      title: "Create a 12% ESOP pool in your cap table",
      rationale: "ESOP pool is AU investor standard. Adds 15 pts to CGH and signals investor readiness.",
      sviBenefit: 14,
      effort: "medium",
      timeToComplete: "1–2 weeks",
      auResource: "Lawpath AU, LegalVision AU",
      tags: ["governance", "esop", "investor-readiness"],
    },
    {
      id: "cgh-02",
      threshold: 55,
      priority: "P1",
      title: "Sign Founder Vesting Confirmation Deed (4yr/1yr cliff)",
      rationale: "Investor expectation. Demonstrates commitment and adds 8 CGH pts.",
      sviBenefit: 8,
      effort: "low",
      timeToComplete: "3–5 days",
      auResource: "LegalVision AU, Contracts Specialist",
      tags: ["governance", "legal"],
    },
    {
      id: "cgh-03",
      threshold: 70,
      priority: "P2",
      title: "Execute Shareholders Agreement with all co-founders",
      rationale: "SHA protects all parties and adds governance credibility (6 CGH pts).",
      sviBenefit: 6,
      effort: "medium",
      timeToComplete: "2–3 weeks",
      auResource: "HWL Ebsworth, MinterEllison startup team",
      tags: ["governance", "legal"],
    },
  ],
  iri: [
    {
      id: "iri-01",
      threshold: 40,
      priority: "P0",
      title: "Complete your data room to at least 60%",
      rationale: "Investors expect a data room before term sheets. Each 10% adds 3–5 IRI pts.",
      sviBenefit: 15,
      effort: "medium",
      timeToComplete: "1–2 weeks",
      tags: ["investor-readiness", "data-room"],
    },
    {
      id: "iri-02",
      threshold: 55,
      priority: "P1",
      title: "Create a 10-slide pitch deck (problem→solution→traction→ask)",
      rationale: "Structured pitch deck adds 10 IRI pts and is required for any investor meeting.",
      sviBenefit: 10,
      effort: "medium",
      timeToComplete: "1 week",
      auResource: "AirTree pitch template, Blackbird Ventures resources",
      tags: ["investor-readiness", "pitch"],
    },
    {
      id: "iri-03",
      threshold: 70,
      priority: "P2",
      title: "Register with AU startup grant/accelerator programs",
      rationale: "ESIC registration, R&D tax incentive, or accelerator acceptance adds IRI signal.",
      sviBenefit: 7,
      effort: "medium",
      timeToComplete: "2–4 weeks",
      auResource: "business.gov.au, Startup Victoria, SBE Australia",
      tags: ["investor-readiness", "grants"],
    },
  ],
  lco: [
    {
      id: "lco-01",
      threshold: 40,
      priority: "P0",
      title: "Register your company as Pty Ltd with ASIC",
      rationale: "Unincorporated entity cannot raise capital. ASIC registration is step 1.",
      sviBenefit: 20,
      effort: "low",
      timeToComplete: "1–3 days",
      auResource: "ASIC.gov.au, Lawpath AU Pty Ltd package ($500)",
      tags: ["legal", "compliance"],
    },
    {
      id: "lco-02",
      threshold: 55,
      priority: "P1",
      title: "Assign IP from founders to company via IP Assignment Deed",
      rationale: "Investors verify IP ownership. Missing deed blocks term sheets (+10 LCO pts).",
      sviBenefit: 10,
      effort: "low",
      timeToComplete: "1 week",
      auResource: "IP Australia, LegalVision AU",
      tags: ["legal", "ip"],
    },
    {
      id: "lco-03",
      threshold: 70,
      priority: "P2",
      title: "Publish Privacy Policy and Terms of Service",
      rationale: "Required by Australian Privacy Act 1988. Adds LCO credibility (5 pts).",
      sviBenefit: 5,
      effort: "low",
      timeToComplete: "2–3 days",
      auResource: "Iubenda, Termly (AU template)",
      tags: ["legal", "compliance"],
    },
  ],
  svm: [
    {
      id: "svm-01",
      threshold: 40,
      priority: "P0",
      title: "Define and document your primary competitive moat",
      rationale: "Network effects, data advantage, or switching costs add 15+ SVM pts.",
      sviBenefit: 15,
      effort: "medium",
      timeToComplete: "1 week",
      tags: ["strategy", "moat"],
    },
    {
      id: "svm-02",
      threshold: 55,
      priority: "P1",
      title: "Write a 3-year strategic roadmap with milestones",
      rationale: "Documented vision adds 10 SVM pts and anchors investor conversations.",
      sviBenefit: 9,
      effort: "medium",
      timeToComplete: "1–2 weeks",
      tags: ["strategy", "vision"],
    },
    {
      id: "svm-03",
      threshold: 70,
      priority: "P2",
      title: "Apply for a provisional patent or trademark in AU",
      rationale: "IP protection signals defensibility and adds 8 SVM pts.",
      sviBenefit: 7,
      effort: "medium",
      timeToComplete: "2–4 weeks",
      auResource: "IP Australia (ipaustralia.gov.au)",
      tags: ["strategy", "ip"],
    },
  ],
};

// ── Engine ────────────────────────────────────────────────────────────────────

export function computeNextBestActions(input: {
  currentSvi: number;
  stage: number;
  dimensions: DimensionScore[];
}): NextBestActionResult {
  const { currentSvi, stage, dimensions } = input;

  const actions: NextBestAction[] = [];

  for (const dim of dimensions) {
    const library = ACTION_LIBRARY[dim.code] ?? [];
    for (const def of library) {
      if (dim.score >= def.threshold) continue;
      if (def.minStage !== undefined && stage < def.minStage) continue;
      if (def.maxStage !== undefined && stage > def.maxStage) continue;

      actions.push({
        id: def.id,
        priority: def.priority,
        title: def.title,
        rationale: def.rationale,
        dimension: DIMENSION_LABELS[dim.code] ?? dim.code,
        sviBenefit: def.sviBenefit,
        effort: def.effort,
        timeToComplete: def.timeToComplete,
        auResource: def.auResource,
        tags: def.tags,
      });
    }
  }

  // Sort: P0 first, then by sviBenefit descending, then effort ascending
  const effortOrder: Record<Effort, number> = { low: 0, medium: 1, high: 2 };
  const priorityOrder: Record<Priority, number> = { P0: 0, P1: 1, P2: 2 };

  actions.sort((a, b) => {
    const pd = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (pd !== 0) return pd;
    const bd = b.sviBenefit - a.sviBenefit;
    if (bd !== 0) return bd;
    return effortOrder[a.effort] - effortOrder[b.effort];
  });

  // Projected SVI: sum top 3 P0 benefits capped at 200
  const top3 = actions.filter(a => a.priority === "P0").slice(0, 3);
  const projectedSvi = Math.min(200, currentSvi + top3.reduce((s, a) => s + a.sviBenefit, 0));

  // Weakest dimension
  const sorted = [...dimensions].sort((a, b) => a.score - b.score);
  const weakest = sorted[0];

  const topInsight = top3.length > 0
    ? `Focus on ${top3[0].dimension}: ${top3[0].title} for an estimated +${top3[0].sviBenefit} SVI pts.`
    : `Your startup is well-positioned. Focus on ${STAGE_LABELS[Math.min(stage + 1, 7)]} milestones.`;

  return {
    currentSvi,
    projectedSvi,
    stage,
    stageLabel: STAGE_LABELS[stage] ?? "Unknown",
    weakestDimension: weakest ? DIMENSION_LABELS[weakest.code] ?? weakest.code : "N/A",
    actions: actions.slice(0, 10),  // top 10 max
    topInsight,
    generatedAt: new Date().toISOString(),
  };
}
