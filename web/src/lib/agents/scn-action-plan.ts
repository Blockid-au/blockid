// SCN Action Plan generator.
//
// Turns the SVI analysis + deep valuation into a clear, sequenced action plan
// using the Startup Navigation System (SCN) framework:
//
//   Validation → Position → Value → Direction → Capital
//
// Each layer surfaces:
//   - the question being answered at this layer
//   - the founder's current status (PASS / IN PROGRESS / GAP)
//   - what unlocks the next layer
//   - 1-3 concrete actions sequenced for the next 30 days
//
// Output also includes a 30/60/90 day plan for the PDF + dashboard, with
// "what to do this week" highlighted so the founder always knows their
// single most important move.
//
// The plan is deterministic so it stays auditable; LLMs can be layered on
// top later for narrative polish.

import type { SVIAnalysis } from "@/lib/svi-analysis";
import type { DeepValuationAnalysis } from "@/lib/agents/deep-valuation";

export type ScnLayerCode = "validation" | "position" | "value" | "direction" | "capital";
export type LayerStatus = "complete" | "in_progress" | "gap";
export type ActionPriority = "P0" | "P1" | "P2";

export interface ScnLayer {
  code: ScnLayerCode;
  label: string;
  question: string;
  status: LayerStatus;
  statusReason: string;
  unlockCriteria: string;       // what's needed to "complete" this layer
  actions: ScnAction[];
}

export interface ScnAction {
  title: string;
  detail: string;
  priority: ActionPriority;
  effort: "low" | "medium" | "high";
  impact: string;               // e.g. "+8 SVI", "unlocks Series A pitch"
  tactic: string;               // concrete step-by-step
  resources?: string[];         // AU-specific resources/links
  timeline: "this_week" | "30_day" | "60_day" | "90_day";
}

export interface MilestoneCheckpoint {
  day: 30 | 60 | 90;
  title: string;
  measurableGoal: string;
  evidenceRequired: string[];
}

export interface ScnActionPlan {
  yourNumber: {
    sviScore: number;
    sviLabel: string;             // "Pre-investable", "Investable", etc.
    sviPercentileLabel: string;   // "top 35% of AU pre-seed"
    valuationMidAud: number;
    valuationLowAud: number;
    valuationHighAud: number;
    valuationConfidence: "low" | "medium" | "high";
    headline: string;             // "Your number: A$2.4M (early-validated)"
    plainEnglish: string;         // 2-3 sentence explanation
  };
  layers: ScnLayer[];
  thisWeekFocus: ScnAction;        // single most important move
  milestones: MilestoneCheckpoint[];
  valuationLevers: Array<{
    lever: string;
    upliftAud: string;             // "+A$500K – A$1.2M" range
    effort: "low" | "medium" | "high";
    timeframe: string;
  }>;
  generatedAt: string;
}

// ─── SVI labels ──────────────────────────────────────────────────────────

function sviLabel(sviScore: number): string {
  if (sviScore < 50) return "Pre-validated — fundamentals first";
  if (sviScore < 70) return "Early-validated — build evidence";
  if (sviScore < 90) return "Investable — start conversations";
  if (sviScore < 120) return "Strong — momentum stage";
  return "Top tier — institutional-ready";
}

function percentileLabel(stageLabel: string, percentile?: number): string {
  if (percentile == null) return `vs AU ${stageLabel.toLowerCase()}`;
  const top = Math.max(1, Math.round(100 - percentile));
  return `top ${top}% of AU ${stageLabel.toLowerCase()}`;
}

function fmtAud(v: number): string {
  if (v >= 1_000_000_000) return `A$${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `A$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `A$${(v / 1_000).toFixed(0)}K`;
  return `A$${Math.round(v).toLocaleString("en-AU")}`;
}

// ─── Layer status detection ─────────────────────────────────────────────

function detectLayerStatus(args: {
  analysis: SVIAnalysis;
  dv?: DeepValuationAnalysis;
}): Record<ScnLayerCode, { status: LayerStatus; reason: string }> {
  const { analysis, dv } = args;
  const stage = analysis.stage ?? 0;
  const sviScore = analysis.totalSVI;
  const hasWebsite = !!analysis.websiteUrl || !!analysis.competitiveIntelligence;
  const hasCI = !!analysis.competitiveIntelligence;
  const hasRevenue = stage >= 4; // Stage 4 = Revenue per svi-analysis

  // Validation: problem + customer + market clarity
  const mpcScore = analysis.subs.find((s) => s.key === "mpc")?.value ?? 0;
  const validationStatus: LayerStatus = mpcScore >= 60 && hasCI ? "complete"
    : mpcScore >= 40 ? "in_progress" : "gap";
  const validationReason = validationStatus === "complete"
    ? `Problem-market fit signals strong (MPC ${mpcScore}/100, CI confirmed)`
    : validationStatus === "in_progress"
    ? `Problem clarity present (MPC ${mpcScore}/100) but customer validation thin`
    : `Problem statement and target customer not yet clear (MPC ${mpcScore}/100)`;

  // Position: SVI + stage + percentile visible
  const positionStatus: LayerStatus = sviScore >= 70 && hasWebsite ? "complete"
    : sviScore >= 40 ? "in_progress" : "gap";
  const positionReason = positionStatus === "complete"
    ? `SVI ${sviScore}, Stage ${analysis.stageLabel}, public-facing presence verified`
    : positionStatus === "in_progress"
    ? `SVI ${sviScore} positions you mid-pack; add more evidence to lift ranking`
    : `SVI ${sviScore} — below the visibility threshold for VC outreach`;

  // Value: valuation + unit economics
  const tre = analysis.subs.find((s) => s.key === "tre")?.value ?? 0;
  const valueStatus: LayerStatus = dv && dv.blendedValuation.confidence === "high" && tre >= 60 ? "complete"
    : dv && dv.blendedValuation.midAud > 1_000_000 ? "in_progress" : "gap";
  const valueReason = valueStatus === "complete"
    ? `Blended valuation ${dv ? fmtAud(dv.blendedValuation.midAud) : "—"} with high confidence + traction evidence (TRE ${tre}/100)`
    : valueStatus === "in_progress"
    ? `Initial valuation triangulated (${dv ? fmtAud(dv.blendedValuation.midAud) : "—"}); needs revenue evidence to firm up`
    : `Pre-revenue — valuation is directional only, anchored to AU stage-medians`;

  // Direction: clear next-best-actions
  const hasActions = analysis.nextActions && analysis.nextActions.length > 0;
  const directionStatus: LayerStatus = hasActions && analysis.evidenceGaps.length <= 3 ? "complete"
    : hasActions ? "in_progress" : "gap";
  const directionReason = directionStatus === "complete"
    ? `Action plan sequenced, evidence gaps narrowed to ${analysis.evidenceGaps.length}`
    : directionStatus === "in_progress"
    ? `${analysis.evidenceGaps.length} evidence gaps to close — clear sequence below`
    : `Need to surface the next 3 highest-leverage moves`;

  // Capital: investor-ready
  const iri = analysis.subs.find((s) => s.key === "iri")?.value ?? 0;
  const cgh = analysis.subs.find((s) => s.key === "cgh")?.value ?? 0;
  const capitalStatus: LayerStatus = iri >= 70 && cgh >= 60 ? "complete"
    : iri >= 50 ? "in_progress" : "gap";
  const capitalReason = capitalStatus === "complete"
    ? `Investor-ready: data room signals strong (IRI ${iri}/100), governance solid (CGH ${cgh}/100)`
    : capitalStatus === "in_progress"
    ? `Pre-investor-ready: IRI ${iri}/100 — pitch deck and data room need work before VC outreach`
    : `Not yet capital-stage: lock in product-market fit and traction first (IRI ${iri}/100)`;

  return {
    validation: { status: validationStatus, reason: validationReason },
    position: { status: positionStatus, reason: positionReason },
    value: { status: valueStatus, reason: valueReason },
    direction: { status: directionStatus, reason: directionReason },
    capital: { status: capitalStatus, reason: capitalReason },
  };
}

// ─── Action library — sector- and stage-aware ───────────────────────────

interface ActionContext {
  stage: number;
  sector: string;
  sviScore: number;
  hasRevenue: boolean;
  weakestDim: string;
  dv?: DeepValuationAnalysis;
}

function actionsForValidation(ctx: ActionContext): ScnAction[] {
  return [
    {
      title: "Run 10 customer-discovery calls",
      detail: "30-min interviews with target customers to verify problem urgency and willingness to pay.",
      priority: "P0",
      effort: "medium",
      impact: "+8 SVI (MPC)",
      tactic: "Use Calendly or Cal.com → recruit from LinkedIn (search by job title + city), offer A$50 voucher per call, ask 5 must-have questions: (1) walk me through last time you faced X, (2) what did you do, (3) what did it cost you, (4) would you pay to fix it, (5) what would change if X disappeared.",
      resources: ["Mom Test framework (Rob Fitzpatrick)", "Calendly free tier"],
      timeline: "30_day",
    },
    {
      title: "Document Problem-Customer-Solution canvas",
      detail: "One-page canvas linking specific problem → specific customer → specific solution.",
      priority: "P1",
      effort: "low",
      impact: "+5 SVI (MPC)",
      tactic: "Use the Strategyzer Value Proposition Canvas — 1 page max, post in your Data Room so investors can read it in 60 seconds.",
      resources: ["strategyzer.com/canvas", "BlockID Data Room template"],
      timeline: "this_week",
    },
  ];
}

function actionsForPosition(ctx: ActionContext): ScnAction[] {
  const items: ScnAction[] = [
    {
      title: "Publish a landing page with measurable proof",
      detail: "Public URL + analytics → external evidence for valuation.",
      priority: "P0",
      effort: "medium",
      impact: "+6 SVI (PTD)",
      tactic: "Framer, Carrd or Webflow → install Google Analytics 4 + Plausible → start measuring sessions, sources, conversion to waitlist. Even 50 weekly visitors counts as traction evidence.",
      resources: ["framer.com (free tier)", "GA4 setup guide"],
      timeline: "30_day",
    },
    {
      title: "Get on the AU Startup Index leaderboard",
      detail: "Submit your SVI publicly so investors can find you.",
      priority: "P1",
      effort: "low",
      impact: "Discovery boost",
      tactic: "Make your SVI score share-page public → list on /index leaderboard → backlink from your landing page footer. Free SEO + investor discovery loop.",
      resources: ["/dashboard/svi/share", "blockid.au/index"],
      timeline: "this_week",
    },
  ];
  if (ctx.sviScore < 60) {
    items.unshift({
      title: "Close your 3 biggest evidence gaps",
      detail: "Focus all energy on the SVI dimensions you scored lowest in.",
      priority: "P0",
      effort: "medium",
      impact: `+10-15 SVI`,
      tactic: `Open your dashboard → look at the SVI 8-dimension breakdown → pick the 3 with lowest scores → upload evidence (LinkedIn profile, GitHub repo, pitch deck, cap table CSV) one per day. Each piece moves your score visibly.`,
      resources: ["/dashboard/svi"],
      timeline: "this_week",
    });
  }
  return items;
}

function actionsForValue(ctx: ActionContext): ScnAction[] {
  const items: ScnAction[] = [];
  if (!ctx.hasRevenue) {
    items.push({
      title: "Get to A$1 of first revenue",
      detail: "Any paying customer transforms the conversation. Pre-revenue → revenue stage = step-change in valuation.",
      priority: "P0",
      effort: "high",
      impact: "+15-25 SVI, 2-3× valuation step",
      tactic: "Pre-sell. Take the top 5 from your customer-discovery interviews, offer founding-customer pricing (50% off lifetime) for paying upfront. Even a A$100 founding tier proves WTP. Use Stripe Payment Links — zero integration time.",
      resources: ["stripe.com/au/payment-links", "Lemon Squeezy as backup"],
      timeline: "60_day",
    });
  } else {
    items.push({
      title: "Hit A$10K MRR — the seed-stage gate",
      detail: "A$10K MRR + 10%+ monthly growth = clean term-sheet conversation.",
      priority: "P0",
      effort: "high",
      impact: "Series A-track valuation (3-5×)",
      tactic: "Focus on your top channel ONLY for the next 60 days. Compute LTV/CAC weekly, kill any channel below 3:1. Add weekly cohort report so investors see retention curve.",
      resources: ["Baremetrics for SaaS", "ProfitWell metrics"],
      timeline: "90_day",
    });
  }
  items.push({
    title: "Publish a 3-scenario revenue projection",
    detail: "Conservative / Base / Optimistic 36-month P&L on one page.",
    priority: "P1",
    effort: "low",
    impact: "+5 SVI (IRI)",
    tactic: "Use the BlockID Financial Projections tool → adjust growth/churn/CAC sliders → export to Data Room as a single CSV. Investors prefer 1-page over 50-tab Excel.",
    resources: ["/tools/financial-projections"],
    timeline: "this_week",
  });
  return items;
}

function actionsForDirection(ctx: ActionContext): ScnAction[] {
  return [
    {
      title: "Pick one accelerator deadline and prep for it",
      detail: "Accelerators are the cheapest path to capital + network at pre-seed.",
      priority: "P0",
      effort: "high",
      impact: "Network + 9% dilution for A$100-120K",
      tactic: "Open BlockID Accelerator Tracker → filter by Open + Readiness > 60% → pick ONE (Antler, Startmate, or Techstars) → block 2 weeks for the application + video + pitch deck. Apply 4 weeks before deadline so referrals can warm intros.",
      resources: ["/dashboard/accelerator"],
      timeline: "30_day",
    },
    {
      title: "Set one Strategic North-Star metric",
      detail: "One number that everything optimises towards for the next 90 days.",
      priority: "P1",
      effort: "low",
      impact: "Team focus + investor narrative",
      tactic: "Pick from: Weekly Active Customers, MRR, Net Revenue Retention, or Activation Rate. Pin it in the team Slack, send weekly to your investors. Discipline > strategy at this stage.",
      timeline: "this_week",
    },
  ];
}

function actionsForCapital(ctx: ActionContext): ScnAction[] {
  const items: ScnAction[] = [];
  if (ctx.stage >= 3) {
    items.push({
      title: "Build a clean Data Room",
      detail: "Investors say no when the data room is messy. Boring drives velocity.",
      priority: "P0",
      effort: "medium",
      impact: "Faster term sheets (weeks → days)",
      tactic: "Use BlockID Data Room template → 7 folders: 01-Overview, 02-Financials, 03-CapTable, 04-Product, 05-Customers, 06-Legal, 07-Team. One PDF per folder, version-stamped. Share via single Google Drive link with view-only access.",
      resources: ["/workspace/data-room", "BlockID ESOP templates"],
      timeline: "30_day",
    });
    items.push({
      title: "Write your pitch deck in 10 slides max",
      detail: "Sequoia 10-slide template. No more, no less.",
      priority: "P0",
      effort: "medium",
      impact: "Term sheet velocity",
      tactic: "Slides: Cover · Problem · Solution · Why now · Market · Product · Traction · Business model · Team · The ask. Use BlockID's pitch deck generator to start, then customise.",
      resources: ["/workspace/data-room/pitch-deck"],
      timeline: "60_day",
    });
  } else {
    items.push({
      title: "Map your AU investor list (30 names)",
      detail: "Even pre-revenue, start the warm-intro graph now.",
      priority: "P1",
      effort: "low",
      impact: "Reduces fundraise time by 4-6 weeks",
      tactic: "Open Cut Through Venture's AU investor list → filter by stage match + sector match → save 30 to your CRM with: name, fund, last cheque size, partner, warmest connection. Don't email yet — just map.",
      resources: ["cutthroughventure.com.au", "AVCAL directory"],
      timeline: "30_day",
    });
  }
  return items;
}

// ─── Milestone planner ─────────────────────────────────────────────────

function buildMilestones(ctx: ActionContext): MilestoneCheckpoint[] {
  const list: MilestoneCheckpoint[] = [];

  if (ctx.stage <= 1) {
    list.push(
      {
        day: 30,
        title: "Problem-Solution Fit confirmed",
        measurableGoal: "10 customer-discovery calls completed + canvas published",
        evidenceRequired: ["Call notes (anonymised)", "Problem-Solution canvas PDF in Data Room"],
      },
      {
        day: 60,
        title: "First MVP demo live",
        measurableGoal: "Public URL with measurable visits + 5 weekly active users",
        evidenceRequired: ["Live demo URL", "Analytics screenshot showing 5 WAU"],
      },
      {
        day: 90,
        title: "First paying customer or LOI",
        measurableGoal: "A$1+ in revenue OR signed Letter of Intent from 1 customer",
        evidenceRequired: ["Stripe payment screenshot OR signed LOI PDF"],
      },
    );
  } else if (ctx.stage <= 3) {
    list.push(
      {
        day: 30,
        title: "Data room complete + SVI ≥ 70",
        measurableGoal: "7 data-room folders populated + SVI score 70+",
        evidenceRequired: ["Data Room URL", "Updated SVI snapshot"],
      },
      {
        day: 60,
        title: "10 warm investor intros queued",
        measurableGoal: "10 confirmed warm intros to AU pre-seed/seed VCs",
        evidenceRequired: ["Pipeline CRM export with names + intro dates"],
      },
      {
        day: 90,
        title: "First term sheet or accelerator offer",
        measurableGoal: "Term sheet from a VC OR offer letter from an accelerator",
        evidenceRequired: ["Term sheet PDF OR accelerator acceptance email"],
      },
    );
  } else {
    list.push(
      {
        day: 30,
        title: "ARR up 20% from this month",
        measurableGoal: "Monthly run-rate +20% vs current",
        evidenceRequired: ["Stripe/Xero export showing month-over-month growth"],
      },
      {
        day: 60,
        title: "Series A readiness checklist signed off",
        measurableGoal: "All BlockID Investor Readiness items at 'pass' status",
        evidenceRequired: ["IRI dashboard screenshot"],
      },
      {
        day: 90,
        title: "Series A round opened",
        measurableGoal: "Pitch deck + data room + 10 first meetings booked",
        evidenceRequired: ["Calendar invites to first meetings", "Round announcement plan"],
      },
    );
  }

  return list;
}

// ─── Valuation levers (how to push the number up) ──────────────────────

function buildValuationLevers(ctx: ActionContext): ScnActionPlan["valuationLevers"] {
  const levers: ScnActionPlan["valuationLevers"] = [];

  if (!ctx.hasRevenue) {
    levers.push({
      lever: "Reach A$1 of first revenue",
      upliftAud: "+50-100% on mid-band",
      effort: "high",
      timeframe: "60 days",
    });
  } else {
    levers.push({
      lever: "Push MRR to A$10K (seed gate)",
      upliftAud: "+A$1M – A$3M on mid-band",
      effort: "high",
      timeframe: "90 days",
    });
  }
  levers.push({
    lever: "Close ESOP pool + sign founder vesting",
    upliftAud: "+A$300K – A$800K (governance discount removed)",
    effort: "low",
    timeframe: "this week",
  });
  if (ctx.sviScore < 80) {
    levers.push({
      lever: "Add 3 evidence items to lift SVI to 80+",
      upliftAud: "+A$200K – A$600K",
      effort: "medium",
      timeframe: "30 days",
    });
  }
  levers.push({
    lever: "Land 1 anchor customer with case study",
    upliftAud: "+A$500K – A$1.5M",
    effort: "high",
    timeframe: "90 days",
  });
  if (ctx.dv && ctx.dv.peerComparables.length > 0) {
    const topPeer = ctx.dv.peerComparables[0];
    levers.push({
      lever: `Move similarity vs ${topPeer.name} from ${topPeer.similarityScore}% to 80%`,
      upliftAud: `Up to mid of peer band (${fmtAud(topPeer.estValuationLowAud)}+)`,
      effort: "high",
      timeframe: "12-18 months",
    });
  }
  return levers.slice(0, 5);
}

// ─── Plain-English explainer ───────────────────────────────────────────

function buildPlainEnglish(
  sviScore: number,
  valuation: ScnActionPlan["yourNumber"]["valuationMidAud"],
  confidence: "low" | "medium" | "high",
  hasRevenue: boolean,
  sector: string,
): string {
  const valFmt = fmtAud(valuation);
  const conf = confidence === "high" ? "high-confidence" : confidence === "medium" ? "medium-confidence" : "directional";

  if (sviScore < 50) {
    return `Your number is ${valFmt} — but treat it as ${conf}. At an SVI of ${sviScore}, you're pre-validated, which means the valuation is anchored to ${sector} stage-medians rather than your own evidence. Get to A$1 of revenue + 60+ SVI and the number can double.`;
  }
  if (sviScore < 90) {
    return `Your number is ${valFmt} (${conf}). Your SVI of ${sviScore} places you in the early-validated band — meaningful signals are present (${hasRevenue ? "revenue, " : ""}market clarity, product evidence) but more proof is needed for VC mid-band pricing. Hitting your next two milestones lifts you cleanly into investable territory.`;
  }
  return `Your number is ${valFmt} with ${conf} support. SVI ${sviScore} puts you in the investable zone — fundamentals, traction and governance all clear the thresholds AU institutional investors look for. The action plan below is about converting evidence into term-sheet velocity.`;
}

// ─── Main entry ────────────────────────────────────────────────────────

export interface ScnActionPlanInput {
  analysis: SVIAnalysis;
  deepValuation?: DeepValuationAnalysis;
}

export function buildScnActionPlan(input: ScnActionPlanInput): ScnActionPlan {
  const { analysis, deepValuation } = input;
  const stage = analysis.stage ?? 0;
  const sector = analysis.sector ?? "default";
  const sviScore = analysis.totalSVI;
  const hasRevenue = stage >= 4;
  const weakestSub = [...analysis.subs].sort((a, b) => a.value - b.value)[0];
  const weakestDim = weakestSub?.key ?? "tre";

  const ctx: ActionContext = {
    stage,
    sector,
    sviScore,
    hasRevenue,
    weakestDim,
    dv: deepValuation,
  };

  const statuses = detectLayerStatus({ analysis, dv: deepValuation });

  const layers: ScnLayer[] = [
    {
      code: "validation",
      label: "Validation",
      question: "Am I solving the right problem for the right customer?",
      status: statuses.validation.status,
      statusReason: statuses.validation.reason,
      unlockCriteria: "MPC score ≥ 60 + AI-confirmed industry positioning",
      actions: actionsForValidation(ctx),
    },
    {
      code: "position",
      label: "Position",
      question: "Where am I vs the AU startup landscape?",
      status: statuses.position.status,
      statusReason: statuses.position.reason,
      unlockCriteria: "SVI ≥ 70 + public web presence with measurable analytics",
      actions: actionsForPosition(ctx),
    },
    {
      code: "value",
      label: "Value",
      question: "What is my number — and why?",
      status: statuses.value.status,
      statusReason: statuses.value.reason,
      unlockCriteria: "Blended valuation high-confidence + TRE ≥ 60",
      actions: actionsForValue(ctx),
    },
    {
      code: "direction",
      label: "Direction",
      question: "What's my next move — and the move after that?",
      status: statuses.direction.status,
      statusReason: statuses.direction.reason,
      unlockCriteria: "Action plan sequenced + evidence gaps ≤ 3",
      actions: actionsForDirection(ctx),
    },
    {
      code: "capital",
      label: "Capital",
      question: "Am I ready to raise — and from whom?",
      status: statuses.capital.status,
      statusReason: statuses.capital.reason,
      unlockCriteria: "IRI ≥ 70 + CGH ≥ 60 + clean data room",
      actions: actionsForCapital(ctx),
    },
  ];

  // This week focus: highest-priority "this_week" action, else first P0 from the
  // first non-complete layer.
  const allActions = layers.flatMap((l) => l.actions);
  const thisWeekFocus = allActions.find((a) => a.timeline === "this_week" && a.priority === "P0")
    ?? allActions.find((a) => a.timeline === "this_week")
    ?? allActions.find((a) => a.priority === "P0")
    ?? allActions[0];

  const blended = deepValuation?.blendedValuation;
  const valuationMid = blended?.midAud ?? 500_000;
  const valuationLow = blended?.lowAud ?? 200_000;
  const valuationHigh = blended?.highAud ?? 1_200_000;
  const valuationConfidence = blended?.confidence ?? "low";

  const yourNumber: ScnActionPlan["yourNumber"] = {
    sviScore,
    sviLabel: sviLabel(sviScore),
    sviPercentileLabel: percentileLabel(analysis.stageLabel ?? "early stage", analysis.percentileRank),
    valuationMidAud: valuationMid,
    valuationLowAud: valuationLow,
    valuationHighAud: valuationHigh,
    valuationConfidence,
    headline: `Your number: ${fmtAud(valuationMid)} (${sviLabel(sviScore).split(" — ")[0].toLowerCase()})`,
    plainEnglish: buildPlainEnglish(sviScore, valuationMid, valuationConfidence, hasRevenue, sector),
  };

  return {
    yourNumber,
    layers,
    thisWeekFocus,
    milestones: buildMilestones(ctx),
    valuationLevers: buildValuationLevers(ctx),
    generatedAt: new Date().toISOString(),
  };
}
