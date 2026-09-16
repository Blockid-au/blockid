// Pure helpers shared by the assessment form, the share dialog, the history
// timeline and their tests (G13-W4-D2, S-D2). No server-only import, no
// React — safe for the client bundle.

import type {
  AssessmentDecision,
  AssessmentDimKey,
  AssessmentHistoryEntry,
  DimensionRatings,
  EvaluationAssessment,
  FounderQuestion,
  FounderShareField,
  RiskItem,
} from "@/lib/evaluations/assessments";

/** The client's editable copy of a row — the PUT body shape (snake_case, Appendix 1). */
export interface AssessmentFormValues {
  snapshot_id: string | null;
  decision: AssessmentDecision | null;
  conviction: number | null;
  thesis_fit_pct: number | null;
  dimension_ratings: DimensionRatings;
  criterion_ratings: Record<string, { stance: "agree" | "disagree" | "unsure"; note?: string }>;
  valuation_view: { low_aud?: number; high_aud?: number; method_note?: string } | null;
  risks: RiskItem[];
  questions_for_founder: FounderQuestion[];
  private_notes: string;
  shared_notes: string;
}

export const DIM_LABELS: Record<AssessmentDimKey, string> = {
  FTV: "Founder & team",
  MPC: "Market & positioning",
  PTD: "Product & tech",
  TRE: "Traction & revenue",
  CGH: "Growth & GTM",
  IRI: "IP & moat",
  LCO: "Legal & compliance",
  SVM: "Valuation & momentum",
};

export const DECISION_LABELS: Record<AssessmentDecision, string> = { pass: "Pass", track: "Track", proceed: "Proceed" };

export const STANCE_LABELS = { agree: "Agree", disagree: "Disagree", unsure: "Unsure" } as const;

/** §C.1 allow-list as the share dialog shows it (order = dialog order). */
export const SHARE_SECTIONS: ReadonlyArray<{ field: FounderShareField; label: string; hint: string }> = [
  { field: "dimension_ratings", label: "My ratings per dimension", hint: "Your 1–5 rating and agree / disagree / unsure per dimension, with the note." },
  { field: "risks", label: "Risks", hint: "Every risk on the list, including the ones suggested by AI." },
  { field: "questions_for_founder", label: "Questions for the founder", hint: "The questions list, exactly as written." },
  { field: "shared_notes", label: "Shared notes", hint: "The shared-notes box only. Private notes are never shared." },
];

/** What the founder can NEVER receive — rendered in the dialog so the promise is literal. */
export const NEVER_SHARED_LABELS = ["decision", "conviction", "thesis fit %", "valuation view", "private notes", "criterion ratings"] as const;

export const SHARE_PREVIEW_HEADING = "The founder will see exactly these items";

export function emptyFormValues(snapshotId: string | null): AssessmentFormValues {
  return {
    snapshot_id: snapshotId,
    decision: null,
    conviction: null,
    thesis_fit_pct: null,
    dimension_ratings: {},
    criterion_ratings: {},
    valuation_view: null,
    risks: [],
    questions_for_founder: [],
    private_notes: "",
    shared_notes: "",
  };
}

export function formValuesFromAssessment(a: EvaluationAssessment): AssessmentFormValues {
  return {
    snapshot_id: a.snapshotId,
    decision: a.decision,
    conviction: a.conviction,
    thesis_fit_pct: a.thesisFitPct,
    dimension_ratings: { ...a.dimensionRatings },
    criterion_ratings: { ...a.criterionRatings },
    valuation_view: a.valuationView ? { ...a.valuationView } : null,
    risks: a.risks.map((r) => ({ ...r })),
    questions_for_founder: a.questionsForFounder.map((q) => ({ ...q })),
    private_notes: a.privateNotes ?? "",
    shared_notes: a.sharedNotes ?? "",
  };
}

/** The PUT body: notes become null when blank; `status` picks draft vs submit. */
export function toPutBody(v: AssessmentFormValues, status: "draft" | "submitted"): Record<string, unknown> {
  return {
    status,
    snapshot_id: v.snapshot_id,
    decision: v.decision,
    conviction: v.conviction,
    thesis_fit_pct: v.thesis_fit_pct,
    dimension_ratings: v.dimension_ratings,
    criterion_ratings: v.criterion_ratings,
    valuation_view: v.valuation_view && (v.valuation_view.low_aud != null || v.valuation_view.high_aud != null || v.valuation_view.method_note) ? v.valuation_view : null,
    risks: v.risks,
    questions_for_founder: v.questions_for_founder,
    private_notes: v.private_notes.trim() ? v.private_notes : null,
    shared_notes: v.shared_notes.trim() ? v.shared_notes : null,
  };
}

/** True when at least one thing is filled — the "Save draft" gate (S3: ≥ 1 rating). */
export function hasAnyContent(v: AssessmentFormValues): boolean {
  return (
    Object.keys(v.dimension_ratings).length > 0 ||
    Object.keys(v.criterion_ratings).length > 0 ||
    v.risks.length > 0 ||
    v.questions_for_founder.length > 0 ||
    v.decision != null ||
    v.conviction != null ||
    v.thesis_fit_pct != null ||
    v.private_notes.trim().length > 0 ||
    v.shared_notes.trim().length > 0 ||
    (v.valuation_view != null && (v.valuation_view.low_aud != null || v.valuation_view.high_aud != null))
  );
}

/** Submit gate (S3): decision + conviction. */
export function submitBlockers(v: AssessmentFormValues): string[] {
  const out: string[] = [];
  if (!v.decision) out.push("Choose pass / track / proceed");
  if (!v.conviction) out.push("Rate your conviction 1–5");
  return out;
}

/**
 * Literal preview of one allow-listed section's CURRENT content — the
 * lines the founder will read if this section is ticked. Empty sections
 * say so explicitly rather than rendering nothing.
 */
export function sectionPreviewLines(v: AssessmentFormValues, field: FounderShareField): string[] {
  switch (field) {
    case "dimension_ratings": {
      const keys = Object.keys(v.dimension_ratings) as AssessmentDimKey[];
      if (!keys.length) return ["(no dimension rated yet)"];
      return keys.map((k) => {
        const r = v.dimension_ratings[k]!;
        return `${DIM_LABELS[k] ?? k}: ${r.rating}/5 · ${STANCE_LABELS[r.stance]}${r.note ? ` — ${r.note}` : ""}`;
      });
    }
    case "risks":
      return v.risks.length ? v.risks.map((r) => `${r.severity.toUpperCase()}${r.dimension ? ` · ${r.dimension}` : ""}: ${r.title}${r.note ? ` — ${r.note}` : ""}${r.source === "ai" ? " (suggested by AI)" : ""}`) : ["(no risks listed)"];
    case "questions_for_founder":
      return v.questions_for_founder.length ? v.questions_for_founder.map((q) => `${q.dimension ? `${q.dimension} · ` : ""}${q.text}`) : ["(no questions yet)"];
    case "shared_notes":
      return v.shared_notes.trim() ? v.shared_notes.trim().split(/\r?\n/) : ["(shared notes are empty)"];
    default:
      return [];
  }
}

export interface VersionDiffLine {
  key: string;
  before: string;
  after: string;
}

/** "What changed" between two timeline rows (decision · conviction) — the ratings diff needs the full rows, see diffRatings. */
export function diffHistory(prev: AssessmentHistoryEntry | null, next: AssessmentHistoryEntry): VersionDiffLine[] {
  const out: VersionDiffLine[] = [];
  const dec = (d: AssessmentDecision | null) => (d ? DECISION_LABELS[d] : "no decision");
  const conv = (c: number | null) => (c == null ? "—" : `${c}/5`);
  if (!prev) return out;
  if (prev.decision !== next.decision) out.push({ key: "decision", before: dec(prev.decision), after: dec(next.decision) });
  if (prev.conviction !== next.conviction) out.push({ key: "conviction", before: conv(prev.conviction), after: conv(next.conviction) });
  if (prev.snapshotId !== next.snapshotId) out.push({ key: "snapshot", before: prev.snapshotId ? "earlier snapshot" : "none", after: next.snapshotId ? "newer snapshot" : "none" });
  return out;
}

/** Per-dimension rating deltas between the previous version's ratings and the current form. */
export function diffRatings(prev: DimensionRatings, next: DimensionRatings): Array<{ dim: AssessmentDimKey; before: number | null; after: number | null }> {
  const out: Array<{ dim: AssessmentDimKey; before: number | null; after: number | null }> = [];
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]) as Set<AssessmentDimKey>;
  for (const k of keys) {
    const b = prev[k]?.rating ?? null;
    const a = next[k]?.rating ?? null;
    if (b !== a) out.push({ dim: k, before: b, after: a });
  }
  return out;
}

export function fmtAud(v: number | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (v >= 1_000_000) return `A$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `A$${Math.round(v / 1_000)}K`;
  return `A$${Math.round(v)}`;
}
