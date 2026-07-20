export type ChecklistCategory =
  | "story"
  | "metrics"
  | "team"
  | "cap-table"
  | "legal"
  | "data-room";

export type ChecklistStatus = "done" | "partial" | "missing";

export type ChecklistItem = {
  id: string;
  label: string;
  category: ChecklistCategory;
  status: ChecklistStatus;
  evidenceHint: string;
};

type NormalizedStage = "preseed" | "seed" | "seriesA";

type SviLike = {
  score?: number;
  dimensions?: Record<string, number | undefined>;
  signals?: Record<string, boolean | undefined>;
};

type ItemSpec = {
  id: string;
  label: string;
  category: ChecklistCategory;
  evidenceHint: string;
  stages: readonly NormalizedStage[];
  infer: (svi: SviLike) => ChecklistStatus;
};

function coerceSvi(input: unknown): SviLike {
  if (!input || typeof input !== "object") return {};
  const obj = input as Record<string, unknown>;
  const dims = obj.dimensions;
  const sigs = obj.signals;
  return {
    score: typeof obj.score === "number" ? obj.score : undefined,
    dimensions:
      dims && typeof dims === "object" ? (dims as Record<string, number | undefined>) : undefined,
    signals:
      sigs && typeof sigs === "object" ? (sigs as Record<string, boolean | undefined>) : undefined,
  };
}

function statusFromScore(
  score: number | undefined,
  doneAt = 70,
  partialAt = 35,
): ChecklistStatus {
  if (typeof score !== "number" || Number.isNaN(score)) return "missing";
  if (score >= doneAt) return "done";
  if (score >= partialAt) return "partial";
  return "missing";
}

function statusFromFlag(flag: boolean | undefined): ChecklistStatus {
  return flag ? "done" : "missing";
}

function normalizeStage(stage: string): NormalizedStage {
  const s = stage.toLowerCase().replace(/[\s_-]/g, "");
  if (s.startsWith("pre")) return "preseed";
  if (s === "seriesa" || s === "a" || s.startsWith("seriesa")) return "seriesA";
  return "seed";
}

const CATALOG: readonly ItemSpec[] = [
  // ── Story ──────────────────────────────────────────────────────────────
  {
    id: "story-elevator",
    label: "One-line elevator pitch",
    category: "story",
    evidenceHint: "Fits in a single sentence: audience + pain + wedge.",
    stages: ["preseed", "seed", "seriesA"],
    infer: (svi) =>
      statusFromScore(svi.dimensions?.problem ?? svi.dimensions?.narrative ?? svi.dimensions?.pitch),
  },
  {
    id: "story-problem",
    label: "Problem statement + who it hurts",
    category: "story",
    evidenceHint: "Named user, measurable pain, current workaround.",
    stages: ["preseed", "seed", "seriesA"],
    infer: (svi) => statusFromScore(svi.dimensions?.problem),
  },
  {
    id: "story-market",
    label: "TAM / SAM / SOM sized",
    category: "story",
    evidenceHint: "Bottom-up estimate with a cited source.",
    stages: ["preseed", "seed"],
    infer: (svi) => statusFromScore(svi.dimensions?.market),
  },
  {
    id: "story-vision",
    label: "3-year vision + wedge to scale",
    category: "story",
    evidenceHint: "How today's wedge unlocks a much larger market.",
    stages: ["preseed", "seed", "seriesA"],
    infer: (svi) => statusFromScore(svi.dimensions?.vision ?? svi.dimensions?.strategy),
  },
  {
    id: "story-competitive",
    label: "Competitive positioning map",
    category: "story",
    evidenceHint: "Named competitors + your wedge on one axis.",
    stages: ["seed", "seriesA"],
    infer: (svi) => statusFromScore(svi.dimensions?.competition),
  },

  // ── Metrics ────────────────────────────────────────────────────────────
  {
    id: "metrics-waitlist",
    label: "Waitlist or design partners (>50)",
    category: "metrics",
    evidenceHint: "Emails / LOIs demonstrating pull.",
    stages: ["preseed"],
    infer: (svi) => statusFromFlag(svi.signals?.hasUsers ?? svi.signals?.hasWaitlist),
  },
  {
    id: "metrics-interviews",
    label: "20+ user interviews documented",
    category: "metrics",
    evidenceHint: "Notes / recordings with a synthesised insight log.",
    stages: ["preseed"],
    infer: (svi) => statusFromFlag(svi.signals?.hasUserInterviews ?? svi.signals?.hasResearch),
  },
  {
    id: "metrics-mrr",
    label: "Monthly recurring revenue tracked",
    category: "metrics",
    evidenceHint: "Stripe / invoice export, 3+ months of history.",
    stages: ["seed", "seriesA"],
    infer: (svi) => statusFromScore(svi.dimensions?.revenue),
  },
  {
    id: "metrics-growth",
    label: "Month-over-month growth trend",
    category: "metrics",
    evidenceHint: "Users, revenue, or activation over 3+ months.",
    stages: ["seed", "seriesA"],
    infer: (svi) => statusFromScore(svi.dimensions?.growth),
  },
  {
    id: "metrics-retention",
    label: "Retention / churn cohort table",
    category: "metrics",
    evidenceHint: "Weekly or monthly cohort retention curve.",
    stages: ["seriesA"],
    infer: (svi) => statusFromScore(svi.dimensions?.retention),
  },
  {
    id: "metrics-unit-economics",
    label: "Unit economics (CAC, LTV, payback)",
    category: "metrics",
    evidenceHint: "Blended CAC, gross margin, payback months.",
    stages: ["seriesA"],
    infer: (svi) => statusFromScore(svi.dimensions?.economics ?? svi.dimensions?.unitEconomics),
  },

  // ── Team ───────────────────────────────────────────────────────────────
  {
    id: "team-founders",
    label: "Two or more committed founders",
    category: "team",
    evidenceHint: "Full-time founders with vesting.",
    stages: ["preseed", "seed", "seriesA"],
    infer: (svi) => statusFromScore(svi.dimensions?.team),
  },
  {
    id: "team-domain",
    label: "Domain or technical expertise on the founding team",
    category: "team",
    evidenceHint: "Named founder + prior domain experience.",
    stages: ["preseed", "seed", "seriesA"],
    infer: (svi) => statusFromFlag(svi.signals?.hasDomainExpert),
  },
  {
    id: "team-linkedin",
    label: "Founder LinkedIn profiles complete and credible",
    category: "team",
    evidenceHint: "Photo, headline, work history, endorsements.",
    stages: ["preseed", "seed"],
    infer: (svi) => statusFromFlag(svi.signals?.hasLinkedIn),
  },
  {
    id: "team-advisors",
    label: "2+ relevant advisors",
    category: "team",
    evidenceHint: "Advisor names, focus areas, engagement cadence.",
    stages: ["seed", "seriesA"],
    infer: (svi) => statusFromFlag(svi.signals?.hasAdvisors),
  },
  {
    id: "team-leadership",
    label: "Leadership team beyond founders",
    category: "team",
    evidenceHint: "Head of Product / Engineering / GTM hired.",
    stages: ["seriesA"],
    infer: (svi) => statusFromScore(svi.dimensions?.leadership),
  },

  // ── Cap table ──────────────────────────────────────────────────────────
  {
    id: "cap-incorporated",
    label: "Incorporated in Australia (ACN + ABN)",
    category: "cap-table",
    evidenceHint: "ASIC record and ABN active.",
    stages: ["preseed", "seed", "seriesA"],
    infer: (svi) => statusFromFlag(svi.signals?.hasAbn ?? svi.signals?.isIncorporated),
  },
  {
    id: "cap-founder-shares",
    label: "Founder shares issued with vesting",
    category: "cap-table",
    evidenceHint: "Reverse vesting schedule agreed and documented.",
    stages: ["preseed", "seed", "seriesA"],
    infer: (svi) => statusFromFlag(svi.signals?.hasFounderVesting),
  },
  {
    id: "cap-esop",
    label: "ESOP pool created (10-15%)",
    category: "cap-table",
    evidenceHint: "Option pool live in the cap table.",
    stages: ["seed", "seriesA"],
    infer: (svi) => statusFromFlag(svi.signals?.hasEsop),
  },
  {
    id: "cap-clean",
    label: "Clean cap table (no dormant equity)",
    category: "cap-table",
    evidenceHint: "No silent partners, no unresolved SAFE overhang.",
    stages: ["seed", "seriesA"],
    infer: (svi) => statusFromScore(svi.dimensions?.capTable ?? svi.dimensions?.governance),
  },

  // ── Legal ──────────────────────────────────────────────────────────────
  {
    id: "legal-sha",
    label: "Shareholders Agreement in place",
    category: "legal",
    evidenceHint: "Signed SHA covering all founders + investors.",
    stages: ["preseed", "seed", "seriesA"],
    infer: (svi) => statusFromFlag(svi.signals?.hasSha),
  },
  {
    id: "legal-ip",
    label: "IP assigned to the company",
    category: "legal",
    evidenceHint: "Assignment deeds from founders and contractors.",
    stages: ["preseed", "seed", "seriesA"],
    infer: (svi) => statusFromFlag(svi.signals?.hasIpAssignment ?? svi.signals?.hasIPProtection),
  },
  {
    id: "legal-privacy",
    label: "Privacy policy + terms of service live",
    category: "legal",
    evidenceHint: "Published on site, APP-compliant.",
    stages: ["preseed", "seed", "seriesA"],
    infer: (svi) => statusFromFlag(svi.signals?.hasPrivacyPolicy),
  },
  {
    id: "legal-esic",
    label: "ESIC eligibility assessed",
    category: "legal",
    evidenceHint: "ATO-aligned test complete; supports investor tax offset.",
    stages: ["seed", "seriesA"],
    infer: (svi) => statusFromFlag(svi.signals?.hasEsic ?? svi.signals?.hasEsicAssessment),
  },

  // ── Data room ──────────────────────────────────────────────────────────
  {
    id: "dr-pitch-deck",
    label: "Investor pitch deck (10-15 slides)",
    category: "data-room",
    evidenceHint: "Problem, solution, market, traction, team, ask.",
    stages: ["preseed", "seed", "seriesA"],
    infer: (svi) => statusFromFlag(svi.signals?.hasPitchDeck),
  },
  {
    id: "dr-one-pager",
    label: "One-page executive summary",
    category: "data-room",
    evidenceHint: "Shareable PDF one-pager for warm intros.",
    stages: ["preseed", "seed"],
    infer: (svi) => statusFromFlag(svi.signals?.hasExecutiveSummary),
  },
  {
    id: "dr-financial-model",
    label: "Financial model (12-36 months)",
    category: "data-room",
    evidenceHint: "Revenue drivers, hiring plan, burn.",
    stages: ["seed", "seriesA"],
    infer: (svi) => statusFromFlag(svi.signals?.hasProjections ?? svi.signals?.hasFinancialModel),
  },
  {
    id: "dr-use-of-funds",
    label: "Use of funds breakdown",
    category: "data-room",
    evidenceHint: "% split by GTM / engineering / ops / reserve.",
    stages: ["preseed", "seed", "seriesA"],
    infer: (svi) => statusFromFlag(svi.signals?.hasUseOfFunds),
  },
  {
    id: "dr-references",
    label: "Customer references + case studies",
    category: "data-room",
    evidenceHint: "3+ named references willing to take a call.",
    stages: ["seriesA"],
    infer: (svi) => statusFromFlag(svi.signals?.hasTestimonials),
  },
  {
    id: "dr-data-room",
    label: "Structured data room (folders + index)",
    category: "data-room",
    evidenceHint: "Legal / financials / product / metrics / team folders.",
    stages: ["seed", "seriesA"],
    infer: (svi) => statusFromScore(svi.dimensions?.dataRoom, 60, 25),
  },
  {
    id: "dr-demo",
    label: "Product demo (video or live)",
    category: "data-room",
    evidenceHint: "Under 3 minutes; shareable link.",
    stages: ["preseed", "seed"],
    infer: (svi) => statusFromFlag(svi.signals?.hasDemo ?? svi.signals?.hasMvp),
  },
];

export function buildChecklist(input: {
  stage: string;
  sviAnalysis: unknown;
}): ChecklistItem[] {
  const stage = normalizeStage(input.stage);
  const svi = coerceSvi(input.sviAnalysis);
  return CATALOG.filter((spec) => spec.stages.includes(stage)).map((spec) => ({
    id: spec.id,
    label: spec.label,
    category: spec.category,
    status: spec.infer(svi),
    evidenceHint: spec.evidenceHint,
  }));
}

export function computeReadinessScore(
  items: ChecklistItem[],
  sviTotal: number,
): { score: number; band: "not-ready" | "nearly-ready" | "ready" } {
  if (items.length === 0) {
    return { score: 0, band: "not-ready" };
  }
  const weights: Record<ChecklistStatus, number> = { done: 1, partial: 0.5, missing: 0 };
  const completion =
    items.reduce((sum, item) => sum + weights[item.status], 0) / items.length;
  const sviNorm = Math.max(0, Math.min(1, sviTotal / 100));
  // 70% checklist / 30% SVI — a founder can't buy readiness with SVI alone,
  // but strong SVI should soften a mid-completion checklist.
  const blended = completion * 0.7 + sviNorm * 0.3;
  const score = Math.round(blended * 100);
  let band: "not-ready" | "nearly-ready" | "ready";
  if (score >= 75) band = "ready";
  else if (score >= 45) band = "nearly-ready";
  else band = "not-ready";
  return { score, band };
}

export function groupChecklistByCategory(
  items: ChecklistItem[],
): Record<ChecklistCategory, ChecklistItem[]> {
  const groups: Record<ChecklistCategory, ChecklistItem[]> = {
    story: [],
    metrics: [],
    team: [],
    "cap-table": [],
    legal: [],
    "data-room": [],
  };
  for (const item of items) {
    groups[item.category].push(item);
  }
  return groups;
}
