/**
 * Idea-Stage Valuation Estimator
 *
 * Hybrid Berkus + Scorecard model adapted for the Australian pre-incorporation
 * seed market. All amounts are AUD. Outputs are intentionally a wide band —
 * idea-stage valuations are negotiated, not calculated, but founders need a
 * defensible anchor before they sit across the table from a first cheque.
 *
 * Berkus method: up to AUD $500k of value per pillar.
 *   1. Sound idea         — basic value, scaled by problem severity.
 *   2. Prototype          — scaled by solution maturity (idea → paying users).
 *   3. Quality team       — scaled by founder strength × team completeness.
 *   4. Strategic deals    — scaled by traction signals (waitlist / LOIs / pilot).
 *   5. Product rollout    — scaled by paying-customers signal.
 *
 * Scorecard adjustment: a 0.5x – 1.5x multiplier on the Berkus mid-point, derived
 * from market size (TAM), moat, and competition density. The low/high band is
 * the mid-point ±35% to reflect idea-stage uncertainty.
 */

export type Score1to5 = 1 | 2 | 3 | 4 | 5;

export interface FounderTraits {
  priorExit: boolean;
  technical: boolean;
  domainExpert: boolean;
  hasNetwork: boolean;
  fullTime: boolean;
}

export interface TractionSignals {
  waitlistOver100: boolean;
  paidLois: boolean;
  pilotSigned: boolean;
  payingCustomers: boolean;
  acceleratorAccepted: boolean;
}

export interface TeamCompleteness {
  hasCEO: boolean;
  hasCTO: boolean;
  hasCommercial: boolean;
  hasDesign: boolean;
}

export interface IdeaValuationInput {
  /** Total addressable market in AUD. */
  tamAud: number;
  /** 1 = mild annoyance, 5 = critical/painful. */
  problemSeverity: Score1to5;
  /** 1 = solo non-technical, 5 = repeat exited founder team. */
  founderStrength: Score1to5;
  founderTraits: FounderTraits;
  /** 1 = idea, 2 = wireframes, 3 = clickable prototype, 4 = MVP, 5 = paying users. */
  solutionMaturity: Score1to5;
  traction: TractionSignals;
  /** 1 = none, 5 = strong (tech IP / regulatory / data / network effects). */
  moatStrength: Score1to5;
  /** 1 = high competition, 5 = uncontested. */
  competitionDensity: Score1to5;
  team: TeamCompleteness;
}

export interface ValuationFactor {
  key:
    | "soundIdea"
    | "prototype"
    | "qualityTeam"
    | "strategicRelationships"
    | "productRollout";
  label: string;
  /** AUD value contributed by this factor (post-Berkus, pre-multiplier). */
  valueAud: number;
  /** Cap in AUD for this factor (always 500_000 in the Berkus method). */
  capAud: number;
  /** 0..1 — how full this pillar is. */
  fillRatio: number;
  /** Short founder-friendly note. */
  note: string;
}

export interface IdeaValuationOutput {
  /** Sum of Berkus factors before the Scorecard multiplier. */
  berkusBaseAud: number;
  /** Scorecard multiplier in [0.5, 1.5]. */
  scorecardMultiplier: number;
  /** Mid-point pre-money estimate in AUD. */
  midAud: number;
  /** Low end of the suggested band (AUD). */
  lowAud: number;
  /** High end of the suggested band (AUD). */
  highAud: number;
  factors: ValuationFactor[];
  /** Top 3 actions that would lift this valuation the most, ranked by uplift. */
  suggestions: { title: string; upliftAud: number; detail: string }[];
  /** Plain-language confidence note. */
  confidence: string;
}

const PER_FACTOR_CAP = 500_000;
const BAND_SPREAD = 0.35; // ±35% around mid

/** Map a 1..5 score to a 0..1 ratio (1 → 0.2, 5 → 1.0). */
function scoreRatio(s: Score1to5): number {
  return s / 5;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function countTrue(obj: Record<string, boolean>): number {
  return Object.values(obj).filter(Boolean).length;
}

/** TAM contribution to the Scorecard multiplier (returns -0.25..+0.30). */
function tamContribution(tamAud: number): number {
  if (!Number.isFinite(tamAud) || tamAud <= 0) return -0.25;
  if (tamAud < 10_000_000) return -0.2; // niche AU
  if (tamAud < 100_000_000) return -0.05; // AU regional
  if (tamAud < 1_000_000_000) return 0.15; // AU national
  return 0.3; // global
}

export function computeIdeaValuation(
  input: IdeaValuationInput,
): IdeaValuationOutput {
  // --- Factor 1: Sound idea — scaled by problem severity. ---
  const ideaRatio = scoreRatio(input.problemSeverity);
  const ideaValue = PER_FACTOR_CAP * ideaRatio;

  // --- Factor 2: Prototype — scaled by solution maturity. ---
  const protoRatio = scoreRatio(input.solutionMaturity);
  const protoValue = PER_FACTOR_CAP * protoRatio;

  // --- Factor 3: Quality team — founder strength × team completeness (avg). ---
  const founderRatio = scoreRatio(input.founderStrength);
  const traitBonus = countTrue(
    input.founderTraits as unknown as Record<string, boolean>,
  ) / 5; // 0..1
  const teamRatio =
    countTrue(input.team as unknown as Record<string, boolean>) / 4; // 0..1
  // Weight: 50% founder rating, 25% founder traits, 25% team coverage.
  const teamScore =
    0.5 * founderRatio + 0.25 * traitBonus + 0.25 * teamRatio;
  const teamValue = PER_FACTOR_CAP * teamScore;

  // --- Factor 4: Strategic relationships — traction signals. ---
  // Each non-revenue signal contributes 0.25; paying / accelerator already covered elsewhere.
  let stratRatio = 0;
  if (input.traction.waitlistOver100) stratRatio += 0.2;
  if (input.traction.paidLois) stratRatio += 0.3;
  if (input.traction.pilotSigned) stratRatio += 0.3;
  if (input.traction.acceleratorAccepted) stratRatio += 0.2;
  stratRatio = clamp(stratRatio, 0, 1);
  const stratValue = PER_FACTOR_CAP * stratRatio;

  // --- Factor 5: Product rollout — paying customers signal. ---
  // Heavy weighting for revenue, partial credit for MVP/paying maturity.
  let rolloutRatio = 0;
  if (input.traction.payingCustomers) rolloutRatio += 0.7;
  if (input.solutionMaturity >= 4) rolloutRatio += 0.2;
  if (input.solutionMaturity === 5) rolloutRatio += 0.1;
  rolloutRatio = clamp(rolloutRatio, 0, 1);
  const rolloutValue = PER_FACTOR_CAP * rolloutRatio;

  const factors: ValuationFactor[] = [
    {
      key: "soundIdea",
      label: "Sound idea",
      valueAud: ideaValue,
      capAud: PER_FACTOR_CAP,
      fillRatio: ideaRatio,
      note: "Scaled by how acute the problem is.",
    },
    {
      key: "prototype",
      label: "Prototype",
      valueAud: protoValue,
      capAud: PER_FACTOR_CAP,
      fillRatio: protoRatio,
      note: "Scaled by solution maturity (idea → paying users).",
    },
    {
      key: "qualityTeam",
      label: "Quality team",
      valueAud: teamValue,
      capAud: PER_FACTOR_CAP,
      fillRatio: teamScore,
      note: "Founder strength × completeness × signal traits.",
    },
    {
      key: "strategicRelationships",
      label: "Strategic relationships",
      valueAud: stratValue,
      capAud: PER_FACTOR_CAP,
      fillRatio: stratRatio,
      note: "Waitlist, paid LOIs, pilots, accelerator.",
    },
    {
      key: "productRollout",
      label: "Product rollout / sales",
      valueAud: rolloutValue,
      capAud: PER_FACTOR_CAP,
      fillRatio: rolloutRatio,
      note: "Paying customers and product maturity.",
    },
  ];

  const berkusBaseAud = factors.reduce((acc, f) => acc + f.valueAud, 0);

  // --- Scorecard multiplier ---
  // Base 1.0, adjusted by TAM, moat, competition. Bounded to [0.5, 1.5].
  const tamAdj = tamContribution(input.tamAud);
  // Moat: 1 → -0.15, 5 → +0.25.
  const moatAdj = -0.15 + ((input.moatStrength - 1) / 4) * 0.4;
  // Competition density: 1 (high) → -0.15, 5 (uncontested) → +0.15.
  const compAdj = -0.15 + ((input.competitionDensity - 1) / 4) * 0.3;
  const scorecardMultiplier = clamp(1 + tamAdj + moatAdj + compAdj, 0.5, 1.5);

  const midAud = Math.round(berkusBaseAud * scorecardMultiplier);
  const lowAud = Math.round(midAud * (1 - BAND_SPREAD));
  const highAud = Math.round(midAud * (1 + BAND_SPREAD));

  // --- Suggestions: rank biggest unrealised uplifts. ---
  const suggestions = buildSuggestions(input, factors, scorecardMultiplier);

  const confidence = buildConfidenceNote(input);

  return {
    berkusBaseAud,
    scorecardMultiplier,
    midAud,
    lowAud,
    highAud,
    factors,
    suggestions,
    confidence,
  };
}

function buildSuggestions(
  input: IdeaValuationInput,
  factors: ValuationFactor[],
  multiplier: number,
): IdeaValuationOutput["suggestions"] {
  const candidates: { title: string; upliftAud: number; detail: string }[] = [];

  for (const f of factors) {
    const headroom = f.capAud - f.valueAud;
    if (headroom < 50_000) continue;
    const uplift = Math.round(headroom * multiplier);
    switch (f.key) {
      case "soundIdea":
        candidates.push({
          title: "Sharpen the problem narrative",
          upliftAud: uplift,
          detail:
            "Quantify the pain — interviews, willingness to pay, urgency. Move problem severity toward 5.",
        });
        break;
      case "prototype":
        candidates.push({
          title: "Ship a clickable prototype or MVP",
          upliftAud: uplift,
          detail:
            "Move from idea → wireframes → clickable → MVP. Each step lifts solution maturity by 20%.",
        });
        break;
      case "qualityTeam":
        candidates.push({
          title: "Close the team gaps",
          upliftAud: uplift,
          detail:
            "Add the missing CEO / CTO / commercial / design seat, or convert a part-time founder to full-time.",
        });
        break;
      case "strategicRelationships":
        candidates.push({
          title: "Land paid LOIs or a pilot",
          upliftAud: uplift,
          detail:
            "A waitlist alone is weak signal — get 1–2 design partners to sign a paid LOI or pilot.",
        });
        break;
      case "productRollout":
        candidates.push({
          title: "Get to first paying customer",
          upliftAud: uplift,
          detail:
            "Even a single paid invoice flips this pillar and is the single biggest pre-incorp valuation lever.",
        });
        break;
    }
  }

  // Scorecard-side suggestions where multiplier is below 1.0.
  if (input.tamAud < 100_000_000) {
    candidates.push({
      title: "Re-frame the market opportunity",
      upliftAud: 200_000,
      detail:
        "If you can credibly expand from AU-only to AU-anchor + global, the Scorecard multiplier lifts ~15%.",
    });
  }
  if (input.moatStrength <= 2) {
    candidates.push({
      title: "Articulate a defensible moat",
      upliftAud: 150_000,
      detail:
        "Tech IP, regulatory wedge, proprietary data or a network effect. Investors price this directly.",
    });
  }

  candidates.sort((a, b) => b.upliftAud - a.upliftAud);
  return candidates.slice(0, 3);
}

function buildConfidenceNote(input: IdeaValuationInput): string {
  const hasRevenue = input.traction.payingCustomers;
  const matureProduct = input.solutionMaturity >= 4;
  if (hasRevenue && matureProduct) {
    return "Tighter band — paying customers and a working product reduce idea-stage uncertainty.";
  }
  if (matureProduct || hasRevenue) {
    return "Wide band — some hard signal, but real valuation will be set by your first lead investor.";
  }
  return "Very wide band — pure idea-stage. Expect investors to anchor on team, market and proof, not your maths.";
}

export const TAM_PRESETS: { label: string; value: number }[] = [
  { label: "Niche AU (<$10M)", value: 8_000_000 },
  { label: "AU regional (<$100M)", value: 80_000_000 },
  { label: "AU national (<$1B)", value: 800_000_000 },
  { label: "Global SaaS (>$1B)", value: 5_000_000_000 },
];

/** Typical AU pre-incorporation pre-money band, for the comparison strip. */
export const AU_PRE_INCORP_BAND = {
  lowAud: 150_000,
  highAud: 800_000,
};
