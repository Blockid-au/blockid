// program-journey — the BlockID Cohort journey (G21 P2-C, 2026-09-20).
//
// Six program stages as tabs on /workspace/accelerator:
//   Intake → Assessment → Selection → Program → Demo day → Sponsor reporting
//
// This module is PURE: it takes what the data layer loaded for one batch
// (`lib/evaluations/program-journey-data.ts`) and returns the view each tab
// renders plus the stage-completeness chips (done / in progress / not
// started) derived from the data — never from a stored flag. No I/O, no
// Supabase, client-safe.
//
// Mentor-gap list (Program tab) = the startup's weakest scored dimension ×
// the EVIDENCE_CATALOG items still missing for it (svi-completeness.ts),
// highest estimated impact first. Evidence completion % = catalogue items
// on file / catalogue size across the 8 dimensions.

import { EVIDENCE_CATALOG } from "@/lib/svi-completeness";
import { CONFIDENCE_LEVELS, type ConfidenceLevel } from "@/lib/evidence/confidence-cap";
import {
  DIMENSION_KEYS,
  DIMENSION_LABELS,
  median,
  pipelineCounts,
  type BatchStatus,
  type CohortDecision,
  type DimensionKey,
  type PipelineCounts,
} from "./batch-shared";

export const PROGRAM_STAGES = ["intake", "assessment", "selection", "program", "demo-day", "sponsor"] as const;
export type ProgramStage = (typeof PROGRAM_STAGES)[number];

export type StageState = "done" | "in_progress" | "not_started";

export const STAGE_STATE_LABEL: Record<StageState, string> = {
  done: "Done",
  in_progress: "In progress",
  not_started: "Not started",
};

export interface ProgramStageMeta {
  key: ProgramStage;
  label: string;
  /** One line under the tab title. */
  blurb: string;
}

export const PROGRAM_STAGE_META: Readonly<Record<ProgramStage, ProgramStageMeta>> = Object.freeze({
  intake: { key: "intake", label: "Intake", blurb: "Applications arrive through your intake link or a CSV import." },
  assessment: { key: "assessment", label: "Assessment", blurb: "Every applicant scored on one rubric with an evidence confidence level." },
  selection: { key: "selection", label: "Selection", blurb: "Your committee decides. BlockID keeps the first pass consistent." },
  program: { key: "program", label: "Program", blurb: "Progress per startup, evidence completion and where mentors should spend the hour." },
  "demo-day": { key: "demo-day", label: "Demo day", blurb: "A BlockID Dossier and a live profile per selected startup, side by side." },
  sponsor: { key: "sponsor", label: "Sponsor reporting", blurb: "The Cohort Report for the program and its sponsors — HTML, PDF and CSV." },
});

export function parseProgramStage(value: unknown): ProgramStage {
  const v = Array.isArray(value) ? value[0] : value;
  return (PROGRAM_STAGES as readonly string[]).includes(String(v)) ? (v as ProgramStage) : "intake";
}

/** L1–L6 index of a confidence rung (0 = nothing on file). */
export function evidenceLevelIndex(level: ConfidenceLevel | string | null | undefined): number {
  if (!level) return 0;
  const i = (CONFIDENCE_LEVELS as readonly string[]).indexOf(String(level));
  return i < 0 ? 0 : i + 1;
}

/** One `svi_dimension_evidence` row as the journey needs it. */
export interface JourneyEvidenceRow {
  dimension: string | null;
  evidence_type: string | null;
  confidence_level?: string | null;
}

export interface MentorGapItem {
  code: string;
  label: string;
  estimatedSviImpact: number;
}

export interface MentorGap {
  dimension: DimensionKey;
  title: string;
  score: number | null;
  /** Catalogue items still missing for the weakest dimension, highest impact first (≤ 5). */
  missing: MentorGapItem[];
}

export interface EvidenceSummary {
  /** Catalogue items on file / catalogue size, 0–100. */
  completionPct: number;
  /** Highest rung reached per dimension (0 = nothing on file, 1–6 = L1–L6). */
  levelByDim: Record<DimensionKey, number>;
  /** Evidence types on file per dimension. */
  presentByDim: Record<DimensionKey, Set<string>>;
}

/** Fold a project's evidence rows into completion % + highest rung per dimension. */
export function summariseEvidence(rows: ReadonlyArray<JourneyEvidenceRow>): EvidenceSummary {
  const presentByDim = Object.fromEntries(DIMENSION_KEYS.map((k) => [k, new Set<string>()])) as Record<DimensionKey, Set<string>>;
  const levelByDim = Object.fromEntries(DIMENSION_KEYS.map((k) => [k, 0])) as Record<DimensionKey, number>;
  for (const r of rows) {
    const dim = String(r.dimension ?? "").toLowerCase() as DimensionKey;
    if (!(DIMENSION_KEYS as readonly string[]).includes(dim)) continue;
    if (r.evidence_type) presentByDim[dim].add(String(r.evidence_type));
    levelByDim[dim] = Math.max(levelByDim[dim], evidenceLevelIndex(r.confidence_level ?? null));
  }
  let total = 0;
  let present = 0;
  for (const k of DIMENSION_KEYS) {
    const catalog = EVIDENCE_CATALOG[k] ?? [];
    total += catalog.length;
    present += catalog.filter((e) => presentByDim[k].has(e.code)).length;
  }
  return { completionPct: total === 0 ? 0 : Math.round((present / total) * 100), levelByDim, presentByDim };
}

/** Weakest scored dimension × the catalogue items missing for it. Null when nothing is scored. */
export function mentorGapFor(scores: Partial<Record<DimensionKey, number>> | null | undefined, present: Record<DimensionKey, Set<string>> | null, limit = 5): MentorGap | null {
  if (!scores) return null;
  let worst: DimensionKey | null = null;
  for (const k of DIMENSION_KEYS) {
    const s = scores[k];
    if (typeof s !== "number" || !Number.isFinite(s)) continue;
    if (worst == null || s < (scores[worst] as number)) worst = k;
  }
  if (!worst) return null;
  const have = present?.[worst] ?? new Set<string>();
  const missing = (EVIDENCE_CATALOG[worst] ?? [])
    .filter((e) => !have.has(e.code))
    .sort((a, b) => b.estimatedSviImpact - a.estimatedSviImpact)
    .slice(0, limit)
    .map((e) => ({ code: e.code, label: e.label, estimatedSviImpact: e.estimatedSviImpact }));
  return { dimension: worst, title: DIMENSION_LABELS[worst], score: scores[worst] ?? null, missing };
}

// ---------------------------------------------------------------------------
// Input / view
// ---------------------------------------------------------------------------

export interface JourneyStartup {
  itemId: number;
  evaluationId: string;
  projectId: string;
  projectSlug: string;
  name: string;
  status: BatchStatus;
  svi: number | null;
  /** svi_snapshots.evidence_confidence 0–100 (null before 0419 / unscored). */
  confidence: number | null;
  /** projects.verification_level 0–5. */
  verification: number;
  stage: number | null;
  delta: number | null;
  topStrength: string | null;
  topGap: string | null;
  dimensionScores: Partial<Record<DimensionKey, number>> | null;
  decision: CohortDecision | null;
  assessmentStatus: "draft" | "submitted" | null;
  /** P2-B shortlist flag (adapter; false when the column is absent). */
  shortlisted: boolean;
  evidence: EvidenceSummary;
  /** Last 8 snapshot totals, oldest first (sparkline). */
  scoreHistory: number[];
  reportUrl: string | null;
  dossierUrl: string;
  profileUrl: string | null;
  /** True when an IC memo / dossier export exists for the evaluation. */
  dossierProduced: boolean;
  feedbackLetterSent: boolean;
}

export interface JourneyIntake {
  links: number;
  submissions: number;
  /** The newest open link's public URL. */
  publicUrl: string | null;
  openLinks: number;
}

export interface JourneySnapshot {
  id: string;
  takenAt: string;
  n: number;
  medianSvi: number | null;
}

export interface JourneyBatchRef {
  id: string;
  name: string;
  status: BatchStatus;
  createdAt: string;
}

export interface ProgramJourneyInput {
  batch: JourneyBatchRef | null;
  batches: JourneyBatchRef[];
  startups: JourneyStartup[];
  intake: JourneyIntake | null;
  snapshots: JourneySnapshot[];
  overridesCount: number;
}

export interface StageChip {
  key: ProgramStage;
  label: string;
  state: StageState;
  /** "12 applications · 9 scored" */
  summary: string;
}

export interface AssessmentPanel {
  batchStatus: BatchStatus | null;
  total: number;
  scored: number;
  pending: number;
  failed: number;
  medianSvi: number | null;
  medianConfidence: number | null;
}

export interface SelectionPanel {
  shortlisted: number;
  decisions: PipelineCounts;
  /** Non-selected applicants (submitted "pass") — the feedback-letter candidates. */
  nonSelected: JourneyStartup[];
}

export interface ProgramPanel {
  startups: Array<JourneyStartup & { mentorGap: MentorGap | null }>;
  snapshots: JourneySnapshot[];
}

export interface DemoDayRow {
  startup: JourneyStartup;
  verificationLabel: string;
  readiness: "ready" | "gaps" | "unscored";
}

export interface DemoDayPanel {
  /** Selected = shortlisted OR a submitted "proceed" decision. */
  rows: DemoDayRow[];
}

export interface SponsorPanel {
  n: number;
  scored: number;
  snapshots: number;
  overrides: number;
  lettersSent: number;
  dossiers: number;
  decisions: PipelineCounts;
}

export interface ProgramJourneyView {
  batch: JourneyBatchRef | null;
  batches: JourneyBatchRef[];
  stages: StageChip[];
  intake: JourneyIntake;
  assessment: AssessmentPanel;
  selection: SelectionPanel;
  program: ProgramPanel;
  demoDay: DemoDayPanel;
  sponsor: SponsorPanel;
}

export function isSelected(s: Pick<JourneyStartup, "shortlisted" | "decision" | "assessmentStatus">): boolean {
  return s.shortlisted || (s.assessmentStatus === "submitted" && s.decision === "proceed");
}

export function isNonSelected(s: Pick<JourneyStartup, "shortlisted" | "decision" | "assessmentStatus">): boolean {
  return !s.shortlisted && s.assessmentStatus === "submitted" && s.decision === "pass";
}

export function verificationShort(level: number): string {
  const l = Math.max(0, Math.min(5, Math.round(level)));
  return l === 0 ? "Not yet verified" : `BlockID Verified L${l}`;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function buildProgramJourney(input: ProgramJourneyInput): ProgramJourneyView {
  const startups = input.startups;
  const intake: JourneyIntake = input.intake ?? { links: 0, submissions: 0, publicUrl: null, openLinks: 0 };
  const scoredRows = startups.filter((s) => s.status === "done" && s.svi != null);
  const scored = scoredRows.length;
  const failed = startups.filter((s) => s.status === "failed").length;
  const pending = startups.filter((s) => s.status === "queued" || s.status === "running").length;
  const decisions = pipelineCounts(startups);
  const decided = decisions.pass + decisions.track + decisions.proceed;
  const shortlisted = startups.filter((s) => s.shortlisted).length;
  const selected = startups.filter(isSelected);
  const dossiers = startups.filter((s) => s.dossierProduced).length;
  const lettersSent = startups.filter((s) => s.feedbackLetterSent).length;

  const assessment: AssessmentPanel = {
    batchStatus: input.batch?.status ?? null,
    total: startups.length,
    scored,
    pending,
    failed,
    medianSvi: median(scoredRows.map((s) => s.svi as number)),
    medianConfidence: median(scoredRows.map((s) => s.confidence).filter((v): v is number => v != null)),
  };

  const program: ProgramPanel = {
    startups: startups.map((s) => ({ ...s, mentorGap: mentorGapFor(s.dimensionScores, s.evidence.presentByDim) })),
    snapshots: input.snapshots,
  };

  const demoDay: DemoDayPanel = {
    rows: selected.map((s) => ({
      startup: s,
      verificationLabel: verificationShort(s.verification),
      readiness: s.svi == null ? "unscored" : s.evidence.completionPct >= 50 && s.verification >= 2 ? "ready" : "gaps",
    })),
  };

  const sponsor: SponsorPanel = {
    n: startups.length,
    scored,
    snapshots: input.snapshots.length,
    overrides: input.overridesCount,
    lettersSent,
    dossiers,
    decisions,
  };

  // Stage completeness — derived, never stored.
  const intakeState: StageState = startups.length > 0 ? "done" : intake.links > 0 || intake.submissions > 0 ? "in_progress" : "not_started";
  const assessmentState: StageState =
    startups.length === 0 ? "not_started" : pending === 0 && scored > 0 ? "done" : scored > 0 || pending > 0 ? "in_progress" : "not_started";
  const selectionState: StageState = scored === 0 ? "not_started" : decided >= scored ? "done" : decided > 0 || shortlisted > 0 ? "in_progress" : "not_started";
  const programState: StageState = selected.length === 0 ? "not_started" : input.snapshots.length >= 2 ? "done" : "in_progress";
  const demoDayState: StageState = selected.length === 0 ? "not_started" : dossiers >= selected.length ? "done" : "in_progress";
  const sponsorState: StageState = scored === 0 ? "not_started" : selectionState === "done" && input.snapshots.length >= 1 ? "done" : "in_progress";

  const stages: StageChip[] = [
    { key: "intake", label: PROGRAM_STAGE_META.intake.label, state: intakeState, summary: `${plural(intake.submissions, "application")} · ${plural(intake.links, "link")}` },
    { key: "assessment", label: PROGRAM_STAGE_META.assessment.label, state: assessmentState, summary: `${scored} scored · ${pending} pending` },
    { key: "selection", label: PROGRAM_STAGE_META.selection.label, state: selectionState, summary: `${decided} of ${scored} decided · ${shortlisted} shortlisted` },
    { key: "program", label: PROGRAM_STAGE_META.program.label, state: programState, summary: `${plural(selected.length, "startup")} · ${plural(input.snapshots.length, "snapshot")}` },
    { key: "demo-day", label: PROGRAM_STAGE_META["demo-day"].label, state: demoDayState, summary: `${dossiers} of ${selected.length} dossiers` },
    { key: "sponsor", label: PROGRAM_STAGE_META.sponsor.label, state: sponsorState, summary: scored > 0 ? `n = ${scored} · ${plural(input.snapshots.length, "snapshot")}` : "Nothing to report yet" },
  ];

  return {
    batch: input.batch,
    batches: input.batches,
    stages,
    intake,
    assessment,
    selection: { shortlisted, decisions, nonSelected: startups.filter(isNonSelected) },
    program,
    demoDay,
    sponsor,
  };
}

/** Empty evidence summary for a startup without rows. */
export function emptyEvidenceSummary(): EvidenceSummary {
  return summariseEvidence([]);
}
