// Nudge engine — computes the founder's current phase, next single most
// important action, top-5 missing items, and per-phase readiness score.
//
// Pure function. All inputs are arguments — no I/O — so the same code
// runs from the API route, cron jobs, and the weekly-digest builder.
//
// Contract at docs/plans/atlassian-standard-mapping-goal.md §3.

import {
  ATLASSIAN_DATAROOM_TEMPLATE,
  type DataRoomTemplateRow,
} from "@/lib/dataroom/atlassian-template";
import { GROWTH_PHASE_IDS } from "@/lib/journey-map";
import { PHASE_LABELS } from "@/lib/showcase/gallery";
import { phaseToStageLabel } from "@/lib/journey-map";

// ---------------------------------------------------------------------------
// Input shapes — narrow structural types so callers can pass either Supabase
// row shapes or hand-built objects (unit tests).
// ---------------------------------------------------------------------------

export interface NudgeUser {
  id: string;
  email: string;
}

export interface NudgeProject {
  id: string;
  growth_phase_current?: string | null;
  growth_completion_pct?: number | null;
}

export interface NudgePhaseProgressRow {
  phase_id: string;
  phase_order: number;
  status: string; // 'not_started' | 'in_progress' | 'review' | 'completed'
  completion_pct: number;
  started_at?: string | null;
  completed_at?: string | null;
  updated_at?: string | null;
}

export interface NudgeSviScoreRow {
  criterion_key?: string | null;
  dimension?: string | null;
  score?: number | null;
  quality_level?: string | null;
}

export interface NudgeDataroomRow {
  svi_dimension: string;
  file_name: string;
  status: string;
  mime_type?: string | null;
}

export interface NudgeEvidenceItem {
  dimension?: string | null;
  evidence_type?: string | null;
  confidence_level?: string | null;
}

export interface ComputeNextStepsInput {
  user: NudgeUser;
  project: NudgeProject | null;
  phaseProgress: NudgePhaseProgressRow[];
  sviScores: NudgeSviScoreRow[];
  dataroomRows: NudgeDataroomRow[];
  evidenceItems: NudgeEvidenceItem[];
}

// ---------------------------------------------------------------------------
// Output shape (spec §3)
// ---------------------------------------------------------------------------

export interface NudgeCurrentPhase {
  slug: string; // "1".."12"
  label: string;
  label_vi: string;
  canonical_stage: string;
  growth_phase_id: string;
  phase_order: number;
}

export interface NudgeNextAction {
  title: string;
  reason: string;
  cta_url: string;
  cta_label: string;
  category: "dataroom" | "svi_evidence" | "phase_advance" | "compliance";
}

export interface NudgeMissingItem {
  category: string;
  title: string;
  phase_slug: string;
  why_it_matters: string;
  raise_blocker: boolean;
  cta_url: string;
}

export interface NudgeReadinessScore {
  overall: number; // 0..100
  sub_scores: {
    market: number;
    team: number;
    tech: number;
    financial: number;
    compliance: number;
  };
}

export interface NudgeResult {
  current_phase: NudgeCurrentPhase;
  next_action: NudgeNextAction;
  missing: NudgeMissingItem[];
  readiness_score: NudgeReadinessScore;
  nudge_reason: string;
  next_step_confidence: "high" | "medium" | "low";
}

// ---------------------------------------------------------------------------
// Raise-blocker priority list — sourced from
// docs/plans/atlassian-standard-mapping-goal.md §1 "Priority summary" +
// §2 "Blocker templates missing". These get sorted to the top of `missing`.
// Match is a case-insensitive substring test against the template title.
// ---------------------------------------------------------------------------

const RAISE_BLOCKER_TITLE_HINTS: readonly string[] = [
  "esic",
  "s708",
  "wholesale",
  "constitution",
  "safe / convertible",
  "convertible note",
  "safe agreement",
  "abn",
  "acn",
  "gst",
  "r&d tax",
  "esop",
  "share purchase",
  "ip assignment",
  "founder agreement",
  "founder vesting",
  "cap table",
];

const CATEGORY_TO_SUBSCORE: Record<string, keyof NudgeReadinessScore["sub_scores"]> = {
  "1. Corporate & Legal": "compliance",
  "2. Cap Table & Equity": "financial",
  "3. Financial Projections": "financial",
  "4. Product & Technology": "tech",
  "5. Market & Traction": "market",
  "6. Team & Advisors": "team",
  "7. IP & Compliance": "compliance",
  "8. Contracts & Agreements": "compliance",
  "9. Strategy & Roadmap": "market",
  "10. References & Due Diligence": "compliance",
  "11. Tax (AU)": "compliance",
  "12. AU Compliance": "compliance",
};

// SVI criterion → readiness sub-score bucket (spec §3 Logic).
const CRITERION_TO_SUBSCORE: Record<string, keyof NudgeReadinessScore["sub_scores"]> = {
  market: "market",
  customer_size: "market",
  gtm_strategy: "market",
  team: "team",
  team_structure: "team",
  founder_profile: "team",
  code_git: "tech",
  website: "tech",
  roadmap: "tech",
  revenue: "financial",
  documents: "compliance",
  dataroom: "compliance",
  idea: "market",
};

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function computeNextSteps(input: ComputeNextStepsInput): NudgeResult {
  const currentPhase = detectCurrentPhase(input.project, input.phaseProgress);
  const missing = computeMissing(
    currentPhase,
    input.dataroomRows,
    input.evidenceItems,
  );
  const readinessScore = computeReadiness(
    input.sviScores,
    input.dataroomRows,
    missing.length,
  );
  const nextAction = pickNextAction(currentPhase, missing);
  const nudgeReason = buildNudgeReason(currentPhase, missing, readinessScore);
  const confidence = pickConfidence(input);

  return {
    current_phase: currentPhase,
    next_action: nextAction,
    missing: missing.slice(0, 5),
    readiness_score: readinessScore,
    nudge_reason: nudgeReason,
    next_step_confidence: confidence,
  };
}

// ---------------------------------------------------------------------------
// Phase detection
// ---------------------------------------------------------------------------

function detectCurrentPhase(
  project: NudgeProject | null,
  progress: NudgePhaseProgressRow[],
): NudgeCurrentPhase {
  // 1. Prefer the phase_progress row with the latest started_at /
  //    updated_at that is still in progress (or the latest completed row
  //    when everything is done — surfaces `phase_advance` as next action).
  let chosen: NudgePhaseProgressRow | null = null;
  const parseTs = (r: NudgePhaseProgressRow) => {
    const s = r.started_at ?? r.updated_at ?? null;
    return s ? new Date(s).getTime() : 0;
  };

  const active = progress.filter((r) => r.status !== "completed");
  if (active.length > 0) {
    chosen = active.reduce(
      (a, b) => (parseTs(a) >= parseTs(b) ? a : b),
      active[0],
    );
  } else if (progress.length > 0) {
    chosen = progress.reduce(
      (a, b) => (parseTs(a) >= parseTs(b) ? a : b),
      progress[0],
    );
  }

  // 2. Fall back to project.growth_phase_current, then to phase 1.
  const fallbackId =
    project?.growth_phase_current ?? GROWTH_PHASE_IDS[0]; // "vision"

  const growthPhaseId = chosen?.phase_id ?? fallbackId;
  const phaseOrder =
    chosen?.phase_order ?? indexOfGrowthPhase(growthPhaseId) + 1;

  const numericSlug = String(phaseOrder);
  const label = PHASE_LABELS[phaseOrder]?.en ?? PHASE_LABELS[1].en;
  const labelVi = PHASE_LABELS[phaseOrder]?.vi ?? PHASE_LABELS[1].vi;
  const stage = phaseToStageLabel(phaseOrder) ?? {
    stage: "idea",
    label_en: "Idea",
    label_vi: "Ý tưởng",
  };

  return {
    slug: numericSlug,
    label,
    label_vi: labelVi,
    canonical_stage: stage.stage,
    growth_phase_id: growthPhaseId,
    phase_order: phaseOrder,
  };
}

function indexOfGrowthPhase(id: string): number {
  const idx = GROWTH_PHASE_IDS.indexOf(id as (typeof GROWTH_PHASE_IDS)[number]);
  return idx < 0 ? 0 : idx;
}

// ---------------------------------------------------------------------------
// Missing set — template rows for the current phase minus rows the
// founder already has as status !== 'missing'.
// ---------------------------------------------------------------------------

function computeMissing(
  currentPhase: NudgeCurrentPhase,
  dataroomRows: NudgeDataroomRow[],
  _evidenceItems: NudgeEvidenceItem[],
): NudgeMissingItem[] {
  const currentOrdinal = currentPhase.phase_order;
  const inScope: DataRoomTemplateRow[] = ATLASSIAN_DATAROOM_TEMPLATE.filter(
    (r) => {
      const p = Number.parseInt(r.phaseSlug, 10);
      return Number.isFinite(p) && p <= currentOrdinal;
    },
  );

  const presentKeys = new Set<string>();
  for (const row of dataroomRows) {
    if (row.status && row.status !== "missing" && row.status !== "archived") {
      presentKeys.add(`${row.svi_dimension}::${row.file_name}`);
    }
  }

  const missing: NudgeMissingItem[] = [];
  for (const tpl of inScope) {
    if (presentKeys.has(`${tpl.category}::${tpl.title}`)) continue;
    const raiseBlocker = isRaiseBlocker(tpl.title);
    missing.push({
      category: tpl.category,
      title: tpl.title,
      phase_slug: tpl.phaseSlug,
      why_it_matters: whyItMatters(tpl, raiseBlocker),
      raise_blocker: raiseBlocker,
      cta_url: `/dashboard/data-room?add=${encodeURIComponent(tpl.category)}`,
    });
  }

  // Sort: raise-blockers first, then earliest-phase, then original order.
  missing.sort((a, b) => {
    if (a.raise_blocker !== b.raise_blocker) {
      return a.raise_blocker ? -1 : 1;
    }
    const pa = Number.parseInt(a.phase_slug, 10);
    const pb = Number.parseInt(b.phase_slug, 10);
    if (pa !== pb) return pa - pb;
    return a.title.localeCompare(b.title);
  });

  return missing;
}

function isRaiseBlocker(title: string): boolean {
  const lower = title.toLowerCase();
  return RAISE_BLOCKER_TITLE_HINTS.some((hint) => lower.includes(hint));
}

function whyItMatters(tpl: DataRoomTemplateRow, raiseBlocker: boolean): string {
  if (raiseBlocker) {
    return `Raise-blocker at Phase ${tpl.phaseSlug} — investors will ask for this before term-sheet.`;
  }
  return `Standard due-diligence artefact for Phase ${tpl.phaseSlug} — supplies evidence for the ${tpl.category.replace(/^\d+\.\s*/, "")} folder.`;
}

// ---------------------------------------------------------------------------
// Readiness score — subset of the SVI 13-criterion vocabulary mapped to
// five sub-scores. Missing rows for the current phase drag the compliance
// score down; SVI scores lift the others.
// ---------------------------------------------------------------------------

function computeReadiness(
  sviScores: NudgeSviScoreRow[],
  dataroomRows: NudgeDataroomRow[],
  missingCount: number,
): NudgeReadinessScore {
  const sub = { market: 0, team: 0, tech: 0, financial: 0, compliance: 0 };
  const seen = { market: 0, team: 0, tech: 0, financial: 0, compliance: 0 };

  for (const row of sviScores) {
    const key = (row.criterion_key ?? row.dimension ?? "").toLowerCase();
    const bucket = CRITERION_TO_SUBSCORE[key];
    if (!bucket) continue;
    const raw = row.score;
    if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
    // Normalise 0..100 (accept 0..1 fractional inputs as well).
    const norm = raw <= 1 ? raw * 100 : raw;
    sub[bucket] += Math.max(0, Math.min(100, norm));
    seen[bucket] += 1;
  }

  for (const key of Object.keys(sub) as Array<keyof typeof sub>) {
    sub[key] = seen[key] > 0 ? Math.round(sub[key] / seen[key]) : 0;
  }

  // Compliance also reflects data-room completeness: every present row
  // that is not archived lifts compliance a tiny amount.
  const presentRows = dataroomRows.filter(
    (r) => r.status && r.status !== "missing" && r.status !== "archived",
  ).length;
  const complianceLift = Math.min(30, presentRows * 2);
  sub.compliance = Math.min(100, sub.compliance + complianceLift);

  // Missing raise-blockers subtract from compliance.
  sub.compliance = Math.max(
    0,
    sub.compliance - Math.min(40, missingCount * 2),
  );

  const overall = Math.round(
    (sub.market + sub.team + sub.tech + sub.financial + sub.compliance) / 5,
  );

  return {
    overall,
    sub_scores: sub,
  };
}

// ---------------------------------------------------------------------------
// Next action — the single most important item.
// ---------------------------------------------------------------------------

function pickNextAction(
  phase: NudgeCurrentPhase,
  missing: NudgeMissingItem[],
): NudgeNextAction {
  if (missing.length === 0) {
    // No dataroom gap for this phase — nudge them to advance.
    return {
      title: `Advance from Phase ${phase.slug} — ${phase.label}`,
      reason:
        "Your data room is complete for this phase. Kick off the next phase in your growth roadmap.",
      cta_url: "/dashboard",
      cta_label: "Open your dashboard",
      category: "phase_advance",
    };
  }

  const top = missing[0];
  const category: NudgeNextAction["category"] = top.raise_blocker
    ? "compliance"
    : "dataroom";

  return {
    title: `Add: ${top.title}`,
    reason: top.why_it_matters,
    cta_url: top.cta_url,
    cta_label: top.raise_blocker
      ? "Fix this raise-blocker"
      : "Add to data room",
    category,
  };
}

// ---------------------------------------------------------------------------
// Human-readable nudge line + confidence.
// ---------------------------------------------------------------------------

function buildNudgeReason(
  phase: NudgeCurrentPhase,
  missing: NudgeMissingItem[],
  readiness: NudgeReadinessScore,
): string {
  const nMissing = missing.length;
  const nBlockers = missing.filter((m) => m.raise_blocker).length;
  const parts: string[] = [];
  parts.push(`You're in Phase ${phase.slug} — ${phase.label}.`);
  if (nBlockers > 0) {
    parts.push(
      `${nBlockers} raise-blocker${nBlockers === 1 ? "" : "s"} still open — investors will ask about ${missing[0].title.toLowerCase()} at term-sheet.`,
    );
  } else if (nMissing > 0) {
    parts.push(
      `${nMissing} data-room item${nMissing === 1 ? "" : "s"} still missing for this phase.`,
    );
  } else {
    parts.push("Your data room is caught up for this phase — kick off the next one.");
  }
  parts.push(`Readiness ${readiness.overall}/100.`);
  return parts.join(" ");
}

function pickConfidence(input: ComputeNextStepsInput): "high" | "medium" | "low" {
  const hasProject = Boolean(input.project);
  const hasProgress = input.phaseProgress.length > 0;
  const hasSviSignal = input.sviScores.length > 0;
  const signals = Number(hasProject) + Number(hasProgress) + Number(hasSviSignal);
  if (signals >= 3) return "high";
  if (signals === 2) return "medium";
  return "low";
}

// ---------------------------------------------------------------------------
// Category → sub-score helper — exported for tests / downstream analytics.
// ---------------------------------------------------------------------------

export function categoryToSubScore(
  category: string,
): keyof NudgeReadinessScore["sub_scores"] | null {
  return CATEGORY_TO_SUBSCORE[category] ?? null;
}
