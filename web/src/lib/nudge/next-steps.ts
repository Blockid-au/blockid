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
import { growthPhaseToStageLabel } from "@/lib/journey-map";
import {
  GROWTH_PHASE_IDS,
  GROWTH_PHASE_LABELS,
  growthPhaseOrder,
  isGrowthPhaseId,
  type GrowthPhaseId,
} from "@/lib/growth/phase-taxonomy";
import {
  computeReadinessByPhase,
  type ReadinessByPhase,
} from "./readiness-by-phase";

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

export interface NudgeComplianceStatus {
  /** True if the founder has POSTed at least one ESIC assessment. */
  hasEsicAssessment: boolean;
  /** True if the latest ESIC assessment returned is_esic=true. */
  isEsic?: boolean;
  /** True if the founder has at least one non-expired s708(8) cert on file. */
  hasValidOrExpiringS708: boolean;
  /** True if the founder has POSTed any GST assessment. */
  hasGstAssessment: boolean;
  /** Latest GST urgency ('ok'|'warning'|'critical'). */
  gstUrgency?: "ok" | "warning" | "critical";
  /** True if the founder is registered for GST per the latest submission. */
  gstRegistered?: boolean;
  /** Smallest days-until-deadline across the R&D calendar (null when none). */
  rdMinDaysUntilDeadline?: number | null;
  /** FY label for the row that produced rdMinDaysUntilDeadline. */
  rdMinDeadlineFy?: string | null;
  /** True if any R&D row is overdue. */
  rdHasOverdue?: boolean;
}

export interface ComputeNextStepsInput {
  user: NudgeUser;
  project: NudgeProject | null;
  phaseProgress: NudgePhaseProgressRow[];
  sviScores: NudgeSviScoreRow[];
  dataroomRows: NudgeDataroomRow[];
  evidenceItems: NudgeEvidenceItem[];
  /**
   * Optional AU compliance snapshot (see
   * web/src/lib/nudge/compliance-status.ts). When present, missing[]
   * is enriched with raise-blocker items for the founder's phase
   * (ESIC / s708(8) / GST / R&D). Optional so unit tests + legacy
   * callers keep working.
   */
  complianceStatus?: NudgeComplianceStatus;
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
  /**
   * Per-phase readiness slice (P5a) — one entry per PhaseKey (1..12) with
   * a weighted score, band, and top-3 missing artefacts scoped to that
   * phase. Keys are stringified PhaseKey ordinals to keep the JSON valid
   * across serializers. See web/src/lib/nudge/readiness-by-phase.ts.
   */
  readiness_by_phase: Record<string, ReadinessByPhase[keyof ReadinessByPhase]>;
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
  const dataroomMissing = computeMissing(
    currentPhase,
    input.dataroomRows,
    input.evidenceItems,
  );
  const complianceMissing = deriveComplianceMissing(
    currentPhase,
    input.complianceStatus,
  );
  // Prepend compliance items — they're all raise-blockers and belong at
  // the top of the founder's queue. Dedupe against dataroom-template
  // items with overlapping titles so we don't double-surface (e.g. the
  // template already has an "ESIC" line).
  const dedupedDataroom = dataroomMissing.filter((m) => {
    const l = m.title.toLowerCase();
    return !complianceMissing.some((c) => l.includes(c.title.toLowerCase()));
  });
  const merged = [...complianceMissing, ...dedupedDataroom];

  const readinessScore = computeReadiness(
    input.sviScores,
    input.dataroomRows,
    merged.length,
  );
  const readinessByPhaseTyped = computeReadinessByPhase({
    sviScores: input.sviScores,
    dataroomRows: input.dataroomRows,
  });
  // Re-key from the numeric PhaseKey to string ordinals so the JSON body
  // round-trips through the API without silent number-to-string coercions
  // on the client.
  const readinessByPhase: NudgeResult["readiness_by_phase"] = {};
  for (const [k, v] of Object.entries(readinessByPhaseTyped)) {
    readinessByPhase[k] = v;
  }
  const nextAction = pickNextAction(currentPhase, merged);
  const nudgeReason = buildNudgeReason(currentPhase, merged, readinessScore);
  const confidence = pickConfidence(input);

  return {
    current_phase: currentPhase,
    next_action: nextAction,
    missing: merged.slice(0, 5),
    readiness_score: readinessScore,
    readiness_by_phase: readinessByPhase,
    nudge_reason: nudgeReason,
    next_step_confidence: confidence,
  };
}

// ---------------------------------------------------------------------------
// AU compliance → missing items
// ---------------------------------------------------------------------------
//
// Phase gates per docs/plans/atlassian-standard-mapping-goal.md §6/§9/§10:
//   - Phase 5+ → R&D deadline within 60 days must surface as a raise
//                blocker (cash-flow lever).
//   - Phase 6+ → GST-threshold check must exist; if action_required > 'none'
//                and not registered, surface as raise blocker.
//   - Phase 9+ → ESIC self-assessment must exist.
//   - Phase 9+ → at least one valid or expiring-soon s708(8) cert on file.

// G8-P0: re-keyed to the canonical growth-phase taxonomy. The old numeric
// values were compared against a *growth*-phase ordinal, so `rd: 5` fired at
// `mentor_review` and `gst: 6` at `legal_equity`. Re-mapped by intent, not by
// ordinal — see docs/plans/unlock-next-level-2026-07-31.md §2c.
const COMPLIANCE_PHASE_GATES = {
  rd: "product_dev",        // R&D incentive needs real development spend
  gst: "go_to_market",      // registration bites at A$75k rolling turnover
  esic: "investor_review",  // ESIC self-assessment runs at raise time
  s708: "investor_review",  // sophisticated-investor certificates
} as const satisfies Record<string, GrowthPhaseId>;

const COMPLIANCE_GATE_ORDER = {
  rd: growthPhaseOrder(COMPLIANCE_PHASE_GATES.rd),
  gst: growthPhaseOrder(COMPLIANCE_PHASE_GATES.gst),
  esic: growthPhaseOrder(COMPLIANCE_PHASE_GATES.esic),
  s708: growthPhaseOrder(COMPLIANCE_PHASE_GATES.s708),
} as const;

function deriveComplianceMissing(
  phase: NudgeCurrentPhase,
  status: NudgeComplianceStatus | undefined,
): NudgeMissingItem[] {
  if (!status) return [];
  const out: NudgeMissingItem[] = [];
  const phaseOrder = phase.phase_order;

  if (phaseOrder >= COMPLIANCE_GATE_ORDER.rd) {
    if (status.rdHasOverdue) {
      out.push({
        category: "11. Tax (AU)",
        title: "R&D registration overdue",
        phase_slug: String(phaseOrder),
        why_it_matters:
          "R&D Tax Incentive registration window closed — file an extension of time under s 27J IR&D Act 1986 to recover the refundable tax offset.",
        raise_blocker: true,
        cta_url: "/compliance/rd",
      });
    } else if (
      typeof status.rdMinDaysUntilDeadline === "number" &&
      status.rdMinDaysUntilDeadline >= 0 &&
      status.rdMinDaysUntilDeadline <= 60
    ) {
      out.push({
        category: "11. Tax (AU)",
        title: "R&D registration deadline",
        phase_slug: String(phaseOrder),
        why_it_matters: `AusIndustry R&D registration for ${status.rdMinDeadlineFy ?? "the current FY"} is due in ${status.rdMinDaysUntilDeadline} days — miss it and the tax offset for that year is forfeited.`,
        raise_blocker: true,
        cta_url: "/compliance/rd",
      });
    }
  }

  if (phaseOrder >= COMPLIANCE_GATE_ORDER.gst) {
    if (!status.hasGstAssessment) {
      out.push({
        category: "11. Tax (AU)",
        title: "GST-threshold check",
        phase_slug: String(phaseOrder),
        why_it_matters:
          "Track your rolling 12-month turnover — ATO gives 21 days to register once the A$75,000 GST threshold is (or will be) crossed.",
        raise_blocker: true,
        cta_url: "/compliance/gst",
      });
    } else if (
      (status.gstUrgency === "warning" || status.gstUrgency === "critical") &&
      status.gstRegistered === false
    ) {
      out.push({
        category: "11. Tax (AU)",
        title: "GST registration",
        phase_slug: String(phaseOrder),
        why_it_matters:
          status.gstUrgency === "critical"
            ? "Turnover already at or above A$75,000 — register for GST within 21 days or face backdated liability + penalties."
            : "Projected turnover will cross A$75,000 — line up ABN + GST registration before the 21-day window opens.",
        raise_blocker: true,
        cta_url: "/compliance/gst",
      });
    }
  }

  if (phaseOrder >= COMPLIANCE_GATE_ORDER.esic && !status.hasEsicAssessment) {
    out.push({
      category: "12. AU Compliance",
      title: "ESIC eligibility assessment",
      phase_slug: String(phaseOrder),
      why_it_matters:
        "Run the Div 360 ITAA97 self-check — ESIC status unlocks a 20% carry-forward tax offset for your angels and a 10-year CGT exemption.",
      raise_blocker: true,
      cta_url: "/compliance/esic",
    });
  }

  if (
    phaseOrder >= COMPLIANCE_GATE_ORDER.s708 &&
    !status.hasValidOrExpiringS708
  ) {
    out.push({
      category: "12. AU Compliance",
      title: "Wholesale investor cert (s708(8))",
      phase_slug: String(phaseOrder),
      why_it_matters:
        "Corporations Act s708(8): accountant certificate (net assets ≥A$2.5M or gross income ≥A$250k) required BEFORE accepting wholesale investment; valid 2 years.",
      raise_blocker: true,
      cta_url: "/compliance/s708",
    });
  }

  return out;
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

  const rawPhaseId = chosen?.phase_id ?? fallbackId;
  // G8-P0: everything downstream is keyed on the canonical growth taxonomy.
  // `startup_phase_progress` stores both phase_id and phase_order, which can
  // disagree on legacy rows — prefer a recognisable id, else reconstruct the
  // id from the order, so the pair we emit is always self-consistent.
  const growthPhaseId: GrowthPhaseId = isGrowthPhaseId(rawPhaseId)
    ? rawPhaseId
    : orderToGrowthPhase(chosen?.phase_order ?? 1);
  const phaseOrder = growthPhaseOrder(growthPhaseId);

  // Labels come from the growth taxonomy, NOT showcase/gallery.ts PHASE_LABELS
  // — those are the numeric taxonomy and gave `legal_equity` the label
  // "Revenue / Business Model".
  const label = GROWTH_PHASE_LABELS[growthPhaseId].en;
  const labelVi = GROWTH_PHASE_LABELS[growthPhaseId].vi;
  const stage = growthPhaseToStageLabel(growthPhaseId) ?? {
    stage: "idea" as const,
    label_en: "Idea",
    label_vi: "Ý tưởng",
  };

  return {
    slug: growthPhaseId,
    label,
    label_vi: labelVi,
    canonical_stage: stage.stage,
    growth_phase_id: growthPhaseId,
    phase_order: phaseOrder,
  };
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
