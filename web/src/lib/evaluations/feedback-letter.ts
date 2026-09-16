// Founder feedback letter "What investors said" — pure aggregation +
// rendering (G14-S34; goal doc D3 / F-5, approved plan §5 row S34).
//
// One letter is the k-anonymous aggregate of the submitted, shared,
// not-opted-out assessments on ONE project. Nothing here touches the
// database: the cron (app/api/cron/feedback-letters) reads the rows through
// feedback-letter-store.ts and hands them to the three functions below.
//
//   eligibleGroups(rows)            → rows that may feed a letter, or null
//                                     when the k-floor is not met:
//                                     status submitted · not opted out ·
//                                     shared_fields ⊇ dimension_ratings ·
//                                     one row per assessor (highest version)
//                                     · k ≥ 3 assessors · ≥ 2 distinct org
//                                     keys (a NULL org counts as its own).
//   aggregateAssessments(rows)      → per-dimension mean rating + agree
//                                     share rounded to 25 % steps, risks
//                                     bucketed by dimension (counts + the
//                                     normalised TITLE only), questions
//                                     deduplicated (case / space-insensitive,
//                                     max 8). The result is walked against
//                                     FOUNDER_FORBIDDEN_FIELDS + the note /
//                                     id keys and throws if any leak — the
//                                     cron never writes what fails here.
//   renderLetter(aggregate, locale) → EN / VI markdown, mentoring tone,
//                                     ≤ 350 words, weakest dimension first,
//                                     "what to add next".
//   letterToNextActions(agg, svi)   → the weakest evaluator-rated dimension
//                                     as `NextStepSignals.feedbackWeakestDim`
//                                     + computeNextBestActions filtered to
//                                     that dimension (top 3).
//
// De-anonymisation guard (plan §5 risks): k ≥ 3 + ≥ 2 orgs + shares rounded
// to 25 % so a single seat can never be read back from a percentage.

import {
  ASSESSMENT_DIM_KEYS,
  FOUNDER_FORBIDDEN_FIELDS,
  type AssessmentDimKey,
  type EvaluationAssessment,
} from "@/lib/evaluations/assessments";
import { DIMENSION_OWNERS, type DimKey } from "@/lib/report-pipeline/dimension-owners";
import { computeNextBestActions, type DimensionScore, type NextBestAction } from "@/lib/agents/cto-next-best-action";
import { recommendNextStep, type NextStepSignals, type RecommendedNextStep } from "@/lib/nav/next-step-recommender";
import en from "@/lib/i18n/messages/en.json";
import vi from "@/lib/i18n/messages/vi.json";

// ─── Constants ──────────────────────────────────────────────────────────────

/** D3 / F-5: the k-anonymity floor. */
export const FEEDBACK_MIN_ASSESSORS = 3;
export const FEEDBACK_MIN_ORGS = 2;
/** Max deduplicated questions carried into a letter. */
export const FEEDBACK_MAX_QUESTIONS = 8;
/** Max normalised risk titles kept per dimension bucket. */
export const FEEDBACK_MAX_TITLES_PER_BUCKET = 3;
/** Word ceiling for the rendered letter (mentoring tone, one screen). */
export const FEEDBACK_LETTER_MAX_WORDS = 350;
/** Shares are only ever one of these (25 % steps). */
export const FEEDBACK_SHARE_STEPS = [0, 25, 50, 75, 100] as const;
export type FeedbackShare = (typeof FEEDBACK_SHARE_STEPS)[number];

export type FeedbackLocale = "en" | "vi";

/**
 * Keys that must never appear anywhere in an aggregate / letter payload.
 * FOUNDER_FORBIDDEN_FIELDS (assessments.ts §C.1) plus the note bodies, the
 * snake_case twins and every evaluator / org identifier.
 */
export const FEEDBACK_FORBIDDEN_KEYS: readonly string[] = Object.freeze([
  ...FOUNDER_FORBIDDEN_FIELDS,
  "decision",
  "conviction",
  "private_notes",
  "privateNotes",
  "shared_notes",
  "sharedNotes",
  "note",
  "notes",
  "valuation_view",
  "valuationView",
  "thesis_fit_pct",
  "thesisFitPct",
  "criterion_ratings",
  "criterionRatings",
  "assessor_user_id",
  "assessorUserId",
  "assessor",
  "org_id",
  "orgId",
  "org",
  "submitted_at",
  "submittedAt",
  "evaluator",
  "evaluator_id",
  "evaluatorId",
  "email",
  "method_note",
  "methodNote",
]);

// ─── Shapes ─────────────────────────────────────────────────────────────────

export interface FeedbackDimension {
  key: AssessmentDimKey;
  /** Mean 1–5 rating across the assessors who rated the dimension (1 dp), null when nobody did. */
  mean: number | null;
  /** How many assessors rated this dimension. */
  n: number;
  /** Share of raters who chose "agree" with the AI read, rounded to 25 % steps. */
  agreePct: FeedbackShare | null;
  /** Share of raters who chose "disagree", rounded to 25 % steps. */
  disagreePct: FeedbackShare | null;
}

export interface FeedbackRiskBucket {
  /** Dimension the risks were filed under; "general" when the evaluator left it blank. */
  dimension: AssessmentDimKey | "general";
  /** Number of risk items in the bucket (across assessors). */
  count: number;
  /** Number of items rated high or critical. */
  highOrCritical: number;
  /** Deduplicated, normalised risk TITLES (never the note). */
  titles: string[];
}

export interface FeedbackQuestion {
  text: string;
  dimension: AssessmentDimKey | null;
  /** How many assessors asked (a duplicate merges into the first). */
  asked: number;
}

export interface FeedbackAggregate {
  /** Assessors behind the letter (≥ 3). */
  k: number;
  /** Distinct organisations behind the letter (≥ 2). */
  orgCount: number;
  /** evaluations.id of every row that fed the aggregate (never assessment / seat ids). */
  evaluationIds: string[];
  dimensions: FeedbackDimension[];
  /** Lowest mean rating first; null when no dimension was rated. */
  weakestDim: AssessmentDimKey | null;
  /** Highest mean rating; null when no dimension was rated. */
  strongestDim: AssessmentDimKey | null;
  risks: FeedbackRiskBucket[];
  questions: FeedbackQuestion[];
  /** ISO instant the aggregate was built (window end). */
  generatedAt: string;
}

export interface FeedbackNextAction {
  id: string;
  title: string;
  rationale: string;
  dimension: AssessmentDimKey;
  sviBenefit: number;
  effort: NextBestAction["effort"];
  timeToComplete: string;
  href: string;
}

export interface FeedbackNextActions {
  feedbackWeakestDim: AssessmentDimKey | null;
  signals: NextStepSignals;
  /** The single recommender step with the feedback signal applied. */
  step: RecommendedNextStep;
  /** Top 3 CTO next-best-actions for the weakest dimension. */
  actions: FeedbackNextAction[];
}

export interface LatestSviForFeedback {
  totalSVI: number;
  stage: number;
  /** Sub-scores keyed by lower-case dimension code (ftv … svm), 0–100. */
  subs: Partial<Record<DimKey, number>>;
  /** Canonical growth phase id when known — drives the recommender step. */
  growthPhaseId?: string | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const DIM_INDEX: Record<AssessmentDimKey, number> = Object.fromEntries(ASSESSMENT_DIM_KEYS.map((k, i) => [k, i])) as Record<AssessmentDimKey, number>;

export function dimensionTitle(key: AssessmentDimKey | "general", locale: FeedbackLocale = "en"): string {
  if (key === "general") return locale === "vi" ? "Chung" : "General";
  const owner = DIMENSION_OWNERS[key.toLowerCase() as DimKey];
  if (!owner) return key;
  return locale === "vi" ? owner.titleVi : owner.title;
}

/** Round a 0–1 share to the nearest 25 % step (de-anonymisation guard). */
export function roundShare(share: number): FeedbackShare {
  if (!Number.isFinite(share)) return 0;
  const clamped = Math.max(0, Math.min(1, share));
  return (Math.round(clamped * 4) * 25) as FeedbackShare;
}

/** Case / whitespace / punctuation-insensitive key for dedupe. */
export function normaliseText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’“”"'`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Title-case-ish clean of a risk title: trims, collapses spaces, caps at 120 chars. */
function cleanTitle(s: string): string {
  const t = s.replace(/\s+/g, " ").trim().slice(0, 120);
  return t.length ? t[0].toUpperCase() + t.slice(1) : t;
}

/** Org key: the org id, or the seat itself when the assessor has none (D3: "null org counts as its own"). */
export function orgKeyOf(row: Pick<EvaluationAssessment, "orgId" | "assessorUserId">): string {
  return row.orgId ? `org:${row.orgId}` : `seat:${row.assessorUserId}`;
}

/**
 * Walk any JSON value and return the first forbidden key found (dotted
 * path), or null. Exported so the cron / tests can pin the guard.
 */
export function findForbiddenKey(value: unknown, path = ""): string | null {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = findForbiddenKey(value[i], `${path}[${i}]`);
      if (hit) return hit;
    }
    return null;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (FEEDBACK_FORBIDDEN_KEYS.includes(k)) return path ? `${path}.${k}` : k;
      const hit = findForbiddenKey(v, path ? `${path}.${k}` : k);
      if (hit) return hit;
    }
  }
  return null;
}

// ─── 1. Eligibility ─────────────────────────────────────────────────────────

export interface EligibleGroup {
  /** One row per assessor — the highest submitted version. */
  rows: EvaluationAssessment[];
  k: number;
  orgCount: number;
  evaluationIds: string[];
}

/**
 * The rows that may feed a letter, or null when the k-floor is not met.
 * `rows` may carry every version of every seat on the project; only the
 * highest-version SUBMITTED row per assessor counts, and only when that
 * row is shared with the founder including `dimension_ratings` and the
 * assessor has not opted out.
 */
export function eligibleGroups(rows: readonly EvaluationAssessment[]): EligibleGroup | null {
  // 1. The seat's CURRENT verdict = its highest SUBMITTED version (a draft
  //    in progress never cancels a submitted view).
  const bySeat = new Map<string, EvaluationAssessment>();
  for (const r of rows) {
    if (r.status !== "submitted" || !r.assessorUserId) continue;
    const prev = bySeat.get(r.assessorUserId);
    if (!prev || r.version > prev.version) bySeat.set(r.assessorUserId, r);
  }
  // 2. That row must be shared with ratings and not opted out — an opt-out
  //    on the current version hides the seat entirely (never falls back).
  const eligible = [...bySeat.values()].filter((r) => !r.feedbackOptOut && Boolean(r.sharedWithFounderAt) && r.sharedFields.includes("dimension_ratings"));
  if (eligible.length < FEEDBACK_MIN_ASSESSORS) return null;
  const orgs = new Set(eligible.map(orgKeyOf));
  if (orgs.size < FEEDBACK_MIN_ORGS) return null;
  eligible.sort((a, b) => (a.submittedAt ?? "").localeCompare(b.submittedAt ?? "") || a.id.localeCompare(b.id));
  return {
    rows: eligible,
    k: eligible.length,
    orgCount: orgs.size,
    evaluationIds: [...new Set(eligible.map((r) => r.evaluationId))],
  };
}

// ─── 2. Aggregate ───────────────────────────────────────────────────────────

/**
 * Build the anonymised aggregate. Throws when the floor is not met or a
 * forbidden key would leak — callers treat a throw as "no letter".
 */
export function aggregateAssessments(rows: readonly EvaluationAssessment[], opts: { now?: Date } = {}): FeedbackAggregate {
  const group = eligibleGroups(rows);
  if (!group) throw new Error("feedback_letter: k-floor not met (need ≥ 3 assessors from ≥ 2 organisations)");
  const now = opts.now ?? new Date();

  // Dimensions — mean + stance shares over the raters of THAT dimension.
  const dimensions: FeedbackDimension[] = ASSESSMENT_DIM_KEYS.map((key) => {
    const ratings: number[] = [];
    let agree = 0;
    let disagree = 0;
    for (const r of group.rows) {
      const d = r.dimensionRatings[key];
      if (!d) continue;
      ratings.push(d.rating);
      if (d.stance === "agree") agree++;
      else if (d.stance === "disagree") disagree++;
    }
    const n = ratings.length;
    return {
      key,
      n,
      mean: n ? Math.round((ratings.reduce((s, x) => s + x, 0) / n) * 10) / 10 : null,
      agreePct: n ? roundShare(agree / n) : null,
      disagreePct: n ? roundShare(disagree / n) : null,
    };
  });

  const rated = dimensions.filter((d) => d.mean != null && d.n > 0);
  const byWeak = [...rated].sort((a, b) => a.mean! - b.mean! || (a.agreePct ?? 0) - (b.agreePct ?? 0) || DIM_INDEX[a.key] - DIM_INDEX[b.key]);
  const weakestDim = byWeak[0]?.key ?? null;
  const strongestDim = byWeak.length ? byWeak[byWeak.length - 1].key : null;

  // Risks — bucket by dimension; titles normalised + deduped; never the note.
  const buckets = new Map<AssessmentDimKey | "general", { count: number; highOrCritical: number; titles: Map<string, string> }>();
  for (const r of group.rows) {
    for (const risk of r.risks) {
      const dim: AssessmentDimKey | "general" = risk.dimension ?? "general";
      const b = buckets.get(dim) ?? { count: 0, highOrCritical: 0, titles: new Map<string, string>() };
      b.count++;
      if (risk.severity === "high" || risk.severity === "critical") b.highOrCritical++;
      const title = cleanTitle(risk.title);
      const key = normaliseText(title);
      if (key && !b.titles.has(key)) b.titles.set(key, title);
      buckets.set(dim, b);
    }
  }
  const risks: FeedbackRiskBucket[] = [...buckets.entries()]
    .map(([dimension, b]) => ({
      dimension,
      count: b.count,
      highOrCritical: b.highOrCritical,
      titles: [...b.titles.values()].slice(0, FEEDBACK_MAX_TITLES_PER_BUCKET),
    }))
    .sort((a, b) => b.highOrCritical - a.highOrCritical || b.count - a.count || (a.dimension === "general" ? 1 : 0) - (b.dimension === "general" ? 1 : 0) || (a.dimension === "general" ? 99 : DIM_INDEX[a.dimension]) - (b.dimension === "general" ? 99 : DIM_INDEX[b.dimension]));

  // Questions — dedupe case / space-insensitively, count askers, cap at 8.
  const qmap = new Map<string, FeedbackQuestion>();
  for (const r of group.rows) {
    for (const q of r.questionsForFounder) {
      const text = q.text.replace(/\s+/g, " ").trim().slice(0, 300);
      const key = normaliseText(text);
      if (!key) continue;
      const prev = qmap.get(key);
      if (prev) {
        prev.asked++;
        if (!prev.dimension && q.dimension) prev.dimension = q.dimension;
        // prefer the variant that reads like a sentence (capitalised, no doubled spaces)
        if (/^[a-z]/.test(prev.text) && /^[A-Z]/.test(text)) prev.text = text;
      } else qmap.set(key, { text, dimension: q.dimension ?? null, asked: 1 });
    }
  }
  const questions = [...qmap.values()].sort((a, b) => b.asked - a.asked).slice(0, FEEDBACK_MAX_QUESTIONS);

  const aggregate: FeedbackAggregate = {
    k: group.k,
    orgCount: group.orgCount,
    evaluationIds: group.evaluationIds,
    dimensions,
    weakestDim,
    strongestDim,
    risks,
    questions,
    generatedAt: now.toISOString(),
  };
  const leak = findForbiddenKey(aggregate);
  if (leak) throw new Error(`feedback_letter: forbidden key in aggregate: ${leak}`);
  return aggregate;
}

// ─── 3. Render ──────────────────────────────────────────────────────────────

type Catalogue = Record<string, string>;
const CATALOGUE: Record<FeedbackLocale, Catalogue> = { en: en as Catalogue, vi: vi as Catalogue };

function msg(locale: FeedbackLocale, key: string, tokens: Record<string, string | number> = {}): string {
  const raw = CATALOGUE[locale][key] ?? CATALOGUE.en[key] ?? key;
  return raw.replace(/\{(\w+)\}/g, (_, k: string) => (k in tokens ? String(tokens[k]) : `{${k}}`));
}

export function wordCount(md: string): number {
  return md
    .replace(/[#*_`>|-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
}

function fmtMean(mean: number | null): string {
  return mean == null ? "–" : mean.toFixed(1);
}

interface RenderBudget {
  buckets: number;
  titlesPerBucket: number;
  questions: number;
}

/** Shrink schedule: the letter is rendered with the first budget that fits FEEDBACK_LETTER_MAX_WORDS. */
const RENDER_BUDGETS: readonly RenderBudget[] = [
  { buckets: 3, titlesPerBucket: 3, questions: 4 },
  { buckets: 3, titlesPerBucket: 2, questions: 4 },
  { buckets: 3, titlesPerBucket: 1, questions: 3 },
  { buckets: 2, titlesPerBucket: 1, questions: 3 },
  { buckets: 2, titlesPerBucket: 1, questions: 2 },
  { buckets: 1, titlesPerBucket: 1, questions: 1 },
  { buckets: 1, titlesPerBucket: 0, questions: 0 },
];

/**
 * The letter body as markdown. Weakest dimension first, then the strongest,
 * the risk buckets, the questions and a "what to add next" close. Kept
 * under FEEDBACK_LETTER_MAX_WORDS by shrinking the risk / question sections
 * through RENDER_BUDGETS until it fits — `wordCount()` is pinned in the test.
 */
export function renderLetter(aggregate: FeedbackAggregate, locale: FeedbackLocale = "en", opts: { startupName?: string | null } = {}): string {
  let md = "";
  for (const budget of RENDER_BUDGETS) {
    md = renderWithBudget(aggregate, locale, opts, budget);
    if (wordCount(md) <= FEEDBACK_LETTER_MAX_WORDS) return md;
  }
  return md;
}

function renderWithBudget(aggregate: FeedbackAggregate, locale: FeedbackLocale, opts: { startupName?: string | null }, budget: RenderBudget): string {
  const L = (key: string, tokens?: Record<string, string | number>) => msg(locale, key, tokens);
  const name = opts.startupName?.trim() || L("feedback.letter.yourStartup");
  const lines: string[] = [];
  lines.push(`## ${L("feedback.letter.title")}`);
  lines.push("");
  lines.push(L("feedback.letter.intro", { k: aggregate.k, orgs: aggregate.orgCount, startup: name }));
  lines.push("");

  const weakest = aggregate.dimensions.find((d) => d.key === aggregate.weakestDim);
  const strongest = aggregate.dimensions.find((d) => d.key === aggregate.strongestDim);
  if (weakest && weakest.mean != null) {
    lines.push(`### ${L("feedback.letter.startHere")}`);
    lines.push(L("feedback.letter.weakest", { dim: dimensionTitle(weakest.key, locale), mean: fmtMean(weakest.mean), agree: weakest.agreePct ?? 0 }));
    lines.push("");
  }
  if (strongest && strongest.mean != null && strongest.key !== weakest?.key) {
    lines.push(L("feedback.letter.strongest", { dim: dimensionTitle(strongest.key, locale), mean: fmtMean(strongest.mean) }));
    lines.push("");
  }

  const rated = aggregate.dimensions.filter((d) => d.mean != null);
  if (rated.length) {
    lines.push(`### ${L("feedback.letter.ratingsHeading")}`);
    for (const d of rated) {
      lines.push(`- ${dimensionTitle(d.key, locale)}: **${fmtMean(d.mean)}/5** · ${L("feedback.letter.agreeShare", { pct: d.agreePct ?? 0 })}`);
    }
    lines.push("");
  }

  if (aggregate.risks.length && budget.buckets > 0) {
    lines.push(`### ${L("feedback.letter.risksHeading")}`);
    for (const b of aggregate.risks.slice(0, budget.buckets)) {
      const shown = b.titles.slice(0, budget.titlesPerBucket);
      const titles = shown.length ? ` — ${shown.join("; ")}` : "";
      lines.push(`- ${dimensionTitle(b.dimension, locale)}: ${L("feedback.letter.riskCount", { n: b.count })}${titles}`);
    }
    lines.push("");
  }

  if (aggregate.questions.length && budget.questions > 0) {
    lines.push(`### ${L("feedback.letter.questionsHeading")}`);
    for (const q of aggregate.questions.slice(0, budget.questions)) lines.push(`- ${q.text}`);
    lines.push("");
  }

  lines.push(`### ${L("feedback.letter.nextHeading")}`);
  lines.push(weakest ? L("feedback.letter.nextBody", { dim: dimensionTitle(weakest.key, locale) }) : L("feedback.letter.nextBodyNoDim"));
  lines.push("");
  lines.push(`_${L("feedback.letter.privacy")}_`);
  return lines.join("\n").trim();
}

// ─── 4. Next actions ────────────────────────────────────────────────────────

/** Workspace surface per dimension — every href is a v4 hub root the sidebar reaches. */
export const FEEDBACK_DIM_HREF: Record<AssessmentDimKey, string> = {
  FTV: "/workspace/team",
  MPC: "/workspace/strategy",
  PTD: "/workspace/evidence/metrics",
  TRE: "/workspace/finance/revenue",
  CGH: "/workspace/strategy/gtm",
  IRI: "/workspace/raise",
  LCO: "/workspace/documents/data-room",
  SVM: "/workspace/score",
};

/** The CTO engine's dimension label, keyed by assessment dim (lower-case code). */
function dimensionScoresFor(svi: LatestSviForFeedback | null, weakest: AssessmentDimKey | null): DimensionScore[] {
  return ASSESSMENT_DIM_KEYS.map((key) => {
    const code = key.toLowerCase() as DimensionScore["code"];
    const owner = DIMENSION_OWNERS[code as DimKey];
    const known = svi?.subs[code as DimKey];
    // The evaluators said this dimension is the weakest: surface its
    // library even when the AI sub-score sits above every threshold
    // (score 0 opens every action of that dimension; other dims keep the
    // real score so nothing else fires spuriously).
    const score = key === weakest ? 0 : typeof known === "number" ? known : 100;
    return { code, label: owner?.title ?? key, score, weight: owner?.weight ?? 10, gaps: [] };
  });
}

/**
 * Map the weakest evaluator-rated dimension into the two engines:
 * `recommendNextStep` (signal `feedbackWeakestDim`) and
 * `computeNextBestActions` filtered to that dimension (top 3).
 */
export function letterToNextActions(aggregate: FeedbackAggregate, latestSvi: LatestSviForFeedback | null): FeedbackNextActions {
  const weakest = aggregate.weakestDim;
  const signals: NextStepSignals = { feedbackWeakestDim: weakest };
  const step = recommendNextStep({
    currentPhase: latestSvi?.growthPhaseId ? 1 : 0,
    growthPhaseId: latestSvi?.growthPhaseId ?? null,
    signals,
  });
  if (!weakest) return { feedbackWeakestDim: null, signals, step, actions: [] };

  const label = DIMENSION_OWNERS[weakest.toLowerCase() as DimKey]?.title ?? weakest;
  const result = computeNextBestActions({
    currentSvi: latestSvi?.totalSVI ?? 0,
    stage: latestSvi?.stage ?? 0,
    dimensions: dimensionScoresFor(latestSvi, weakest),
  });
  const actions: FeedbackNextAction[] = result.actions
    .filter((a) => a.dimension === label)
    .slice(0, 3)
    .map((a) => ({
      id: a.id,
      title: a.title,
      rationale: a.rationale,
      dimension: weakest,
      sviBenefit: a.sviBenefit,
      effort: a.effort,
      timeToComplete: a.timeToComplete,
      href: FEEDBACK_DIM_HREF[weakest],
    }));
  return { feedbackWeakestDim: weakest, signals, step, actions };
}
