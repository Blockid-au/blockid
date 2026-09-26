// triage-verdict — G34 RQ25 (mandate fit) + RQ26 (triage verdict) for the
// evaluator's view of a founder's report (the Investor Dossier). Plan
// docs/plans/g34-biz-trust-report-v4-quality-2026-09-25.md §6 (V7 Go
// pattern: fund playbook → pass / fail / review + what is missing).
//
// A RELABEL of data that already exists, never a second investment
// conclusion:
//
//   mandate line   the one mandate scorer (lib/investors/fit-v2.ts) axis
//                  breakdown for the viewer's primary mandate → stage ·
//                  sector · ticket · geography as ✓ / ◐ / ✗ / ? ("?" = the
//                  startup's side is not known — never counted as a miss)
//   verdict        Outside mandate — a hard gate fired, the fit is below the
//                                    scorer's floor, or one of the four axes
//                                    misses;
//                  Read further     — else the report's own meeting label
//                                    (dashboard-v4 band A / B);
//                  Needs more evidence — band C / D.
//   missing        dashboard-v4 red flags · pending dimensions · key metrics
//                  "Not evidenced" (same projection page 1 prints).
//
// Pure, client-safe; evaluator-only by construction (the dossier loader
// builds it for the assessor role alone — founder / public views never
// receive it).

import type { FitAxisResult, FitAxisV2 } from "@/lib/investors/fit-v2";
import { v4PlainText, type DashboardV4 } from "@/lib/report-v2/dashboard-v4";

export type MandateAxisKey = "stage" | "sector" | "ticket" | "geography";
export type MandateAxisStatus = "fit" | "partial" | "miss" | "unknown";

export interface MandateAxis {
  key: MandateAxisKey;
  label: string;
  status: MandateAxisStatus;
  /** The scorer's own reason / gap sentence for the axis. */
  note: string | null;
}

export type TriageVerdict = "read_further" | "needs_evidence" | "outside_mandate";

/** The fit fields the triage reads (a subset of `DossierMandateFit`). */
export interface TriageFitInput {
  mandateLabel: string;
  passesFloor: boolean;
  blockers: readonly string[];
  axes?: readonly MandateAxis[];
}

export interface EvaluatorTriage {
  mandate: { label: string; axes: MandateAxis[]; line: string } | null;
  verdict: TriageVerdict;
  verdictLabel: string;
  /** Which rule produced the verdict (printed, so the relabel is auditable). */
  rule: string;
  missing: string[];
  note: string;
}

const AXIS_MAP: ReadonlyArray<[MandateAxisKey, FitAxisV2, string]> = [
  ["stage", "stage", "stage"],
  ["sector", "industry", "sector"],
  ["ticket", "cheque", "ticket"],
  ["geography", "geo", "geography"],
];

/** The scorer's gap sentences that mean "the startup's side is not known", not a mismatch. */
const UNKNOWN_RE = /not stated|unknown|unclassified|pending|not verified/i;

export const AXIS_GLYPH: Record<MandateAxisStatus, string> = { fit: "✓", partial: "◐", miss: "✗", unknown: "?" };
export const AXIS_STATUS_LABEL: Record<MandateAxisStatus, string> = { fit: "fits", partial: "partial fit", miss: "outside mandate", unknown: "not known" };

export const TRIAGE_LABELS: Record<TriageVerdict, string> = {
  read_further: "Read further",
  needs_evidence: "Needs more evidence",
  outside_mandate: "Outside mandate",
};

export const TRIAGE_NOTE =
  "Triage relabels the report's own meeting label and your saved mandate — it is not a second investment conclusion. General information only, not financial, legal or investment advice.";

/** Pure: the four mandate axes from a fit-v2 breakdown. */
export function mandateAxesFrom(breakdown: readonly FitAxisResult[]): MandateAxis[] {
  return AXIS_MAP.flatMap(([key, axis, label]) => {
    const r = breakdown.find((b) => b.axis === axis);
    if (!r) return [];
    const note = r.blocker ? r.gap ?? r.blocker : r.gap ?? r.reason;
    const unknown = !r.blocker && r.gap !== null && UNKNOWN_RE.test(r.gap);
    const status: MandateAxisStatus = unknown ? "unknown" : r.blocker || r.ratio <= 0 ? "miss" : r.ratio >= 1 ? "fit" : "partial";
    return [{ key, label, status, note }];
  });
}

/** "stage ✓ · sector ✓ · ticket ✗ · geography ✓" */
export function mandateLine(axes: readonly MandateAxis[]): string {
  return axes.map((a) => `${a.label} ${AXIS_GLYPH[a.status]}`).join(" · ");
}

/** Pure: what the report says is missing — red flags, pending dimensions, un-evidenced key metrics. */
export function triageMissingItems(v4: Pick<DashboardV4, "redFlags" | "scorecard" | "keyMetrics">): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (text: string) => {
    const t = text.trim();
    if (!t || seen.has(t.toLowerCase())) return;
    seen.add(t.toLowerCase());
    out.push(t);
  };
  for (const f of v4.redFlags) push(v4PlainText(f.text));
  for (const r of v4.scorecard) if (r.pending) push(`${r.title}: not assessed — no evidence on file`);
  for (const m of v4.keyMetrics) if (m.status === "not_evidenced") push(`${m.label}: not evidenced`);
  return out;
}

/** Pure: the evaluator triage from the page-1 projection + the viewer's primary-mandate fit (null = no mandate saved). */
export function buildEvaluatorTriage(v4: Pick<DashboardV4, "meeting" | "redFlags" | "scorecard" | "keyMetrics">, fit: TriageFitInput | null): EvaluatorTriage {
  const axes = fit?.axes ? [...fit.axes] : [];
  const mandate = fit ? { label: fit.mandateLabel, axes, line: mandateLine(axes) } : null;
  const band = v4.meeting.band;
  let verdict: TriageVerdict;
  let rule: string;
  const missedAxes = axes.filter((a) => a.status === "miss").map((a) => a.label);
  if (fit && (fit.blockers.length > 0 || !fit.passesFloor || missedAxes.length > 0)) {
    verdict = "outside_mandate";
    rule = missedAxes.length > 0 ? `Mandate: ${missedAxes.join(", ")} outside your mandate` : fit.blockers.length > 0 ? "Mandate: a hard gate in your mandate fired" : "Mandate: fit below the listing floor";
  } else {
    verdict = band === "A" || band === "B" ? "read_further" : "needs_evidence";
    rule = `Report meeting label ${band} (${v4.meeting.label})${fit ? "" : " · no mandate saved"}`;
  }
  return { mandate, verdict, verdictLabel: TRIAGE_LABELS[verdict], rule, missing: triageMissingItems(v4), note: TRIAGE_NOTE };
}
