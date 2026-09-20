// pilots/metrics — the success metrics a program and BlockID measure together
// during a paid Cohort Validation Pilot (G21 P2-C, 2026-09-20; the list is
// `PILOT_SUCCESS_METRICS` in lib/pricing/pilot-skus.ts and § 9 of the FI
// offer). Captured on /workspace/accelerator/pilot, stored on
// `pilot_orders.metrics` (jsonb) through PATCH /api/pilots/[orderId]/metrics.
//
// Pure: the zod schema, the field catalogue the form renders from, the
// checklist derivation (data-derived ticks, never a stored flag) and the
// merge rule (a PATCH only touches the keys it sends; unknown keys are
// dropped, never stored). Client-safe — no I/O.

import { z } from "zod";

export const WTP_BANDS = ["under_5k", "5k_10k", "10k_15k", "15k_plus", "not_now"] as const;
export type WtpBand = (typeof WTP_BANDS)[number];

export const WTP_BAND_LABELS: Readonly<Record<WtpBand, string>> = Object.freeze({
  under_5k: "Under A$5,000 a year",
  "5k_10k": "A$5,000 – A$10,000 a year",
  "10k_15k": "A$10,000 – A$15,000 a year",
  "15k_plus": "A$15,000+ a year",
  not_now: "Not this year",
});

const minutes = z.number().int().min(0).max(100_000);
const rating = z.number().int().min(1).max(5);

/** Every key optional — the form saves what the program has measured so far. */
export const pilotMetricsSchema = z
  .object({
    review_minutes_before: minutes.nullable().optional(),
    review_minutes_after: minutes.nullable().optional(),
    evaluator_consistency: rating.nullable().optional(),
    startups_processed: z.number().int().min(0).max(10_000).nullable().optional(),
    evidence_completion_pct: z.number().int().min(0).max(100).nullable().optional(),
    satisfaction: rating.nullable().optional(),
    repeat_intent: z.boolean().nullable().optional(),
    renewal_intent: z.boolean().nullable().optional(),
    wtp_annual_band: z.enum(WTP_BANDS).nullable().optional(),
    case_study_consent: z.boolean().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

export type PilotMetrics = z.infer<typeof pilotMetricsSchema>;

export type PilotMetricKey = keyof PilotMetrics;

export const PILOT_METRIC_KEYS: readonly PilotMetricKey[] = [
  "review_minutes_before",
  "review_minutes_after",
  "evaluator_consistency",
  "startups_processed",
  "evidence_completion_pct",
  "satisfaction",
  "repeat_intent",
  "renewal_intent",
  "wtp_annual_band",
  "case_study_consent",
  "notes",
];

export type PilotMetricFieldKind = "minutes" | "rating" | "count" | "percent" | "yesno" | "band" | "consent" | "text";

export interface PilotMetricField {
  key: PilotMetricKey;
  label: string;
  help: string;
  kind: PilotMetricFieldKind;
  /** The `PILOT_SUCCESS_METRICS` line it measures (for the form group heading). */
  group: string;
}

/** The form catalogue — one row per metric in the offer, in offer order. */
export const PILOT_METRIC_FIELDS: readonly PilotMetricField[] = Object.freeze([
  { key: "review_minutes_before", label: "Review time per startup — before (minutes)", help: "How long one reviewer spent on one application before the pilot.", kind: "minutes", group: "Review time per startup" },
  { key: "review_minutes_after", label: "Review time per startup — with BlockID (minutes)", help: "The same review with the cohort table and the dossier in front of the reviewer.", kind: "minutes", group: "Review time per startup" },
  { key: "evaluator_consistency", label: "Evaluator consistency (1–5)", help: "How closely two reviewers landed on the same startup. 5 = the same call every time.", kind: "rating", group: "Evaluator consistency across reviewers" },
  { key: "startups_processed", label: "Startups processed", help: "Applications that went through intake, scoring and a decision in the pilot.", kind: "count", group: "Startups processed through the pilot" },
  { key: "evidence_completion_pct", label: "Founders completing their evidence (%)", help: "Share of applicants who finished the evidence checklist before selection.", kind: "percent", group: "Share of founders completing their evidence" },
  { key: "satisfaction", label: "Program and founder satisfaction (1–5)", help: "One number from the review team and the founders after the feedback session.", kind: "rating", group: "Program and founder satisfaction" },
  { key: "repeat_intent", label: "Would run the next intake on BlockID", help: "Yes / no from the program lead.", kind: "yesno", group: "Repeat or renewal intent after the pilot" },
  { key: "renewal_intent", label: "Intends to move to an annual Cohort plan", help: "Yes / no from the program lead.", kind: "yesno", group: "Repeat or renewal intent after the pilot" },
  { key: "wtp_annual_band", label: "Willingness to pay (annual)", help: "The band the program named — a finding we log, never a quote.", kind: "band", group: "Repeat or renewal intent after the pilot" },
  { key: "case_study_consent", label: "Case-study consent", help: "Tick only if the program agrees to be named in a BlockID case study. Nothing is published without this tick.", kind: "consent", group: "Consent" },
  { key: "notes", label: "Notes", help: "Objections, surprises, what the sponsors asked for.", kind: "text", group: "Notes" },
]);

export type ParsedPilotMetrics = { ok: true; value: PilotMetrics } | { ok: false; message: string; issues: Array<{ path: string; message: string }> };

/** Validate a PATCH body — unknown keys are rejected, not silently stored. */
export function parsePilotMetrics(raw: unknown): ParsedPilotMetrics {
  const r = pilotMetricsSchema.safeParse(raw);
  if (r.success) return { ok: true, value: r.data };
  const issues = r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
  return { ok: false, message: issues[0] ? `${issues[0].path || "body"}: ${issues[0].message}` : "Invalid metrics", issues };
}

/** Merge a validated patch onto the stored jsonb — only the sent keys change; `null` clears a key. */
export function mergePilotMetrics(stored: Record<string, unknown> | null | undefined, patch: PilotMetrics, nowIso: string): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(stored ?? {}) };
  for (const k of PILOT_METRIC_KEYS) {
    if (!(k in patch)) continue;
    const v = patch[k];
    if (v === null) delete out[k];
    else if (v !== undefined) out[k] = v;
  }
  out.updated_at = nowIso;
  return out;
}

/** The stored jsonb → typed (unknown / malformed keys ignored). */
export function readPilotMetrics(stored: Record<string, unknown> | null | undefined): PilotMetrics {
  const r = pilotMetricsSchema.safeParse(Object.fromEntries(Object.entries(stored ?? {}).filter(([k]) => (PILOT_METRIC_KEYS as readonly string[]).includes(k))));
  return r.success ? r.data : {};
}

/** "62 min → 18 min (−71 %)" — null until both sides are in. */
export function reviewTimeSaving(m: PilotMetrics): { before: number; after: number; pct: number } | null {
  const b = m.review_minutes_before;
  const a = m.review_minutes_after;
  if (typeof b !== "number" || typeof a !== "number" || b <= 0) return null;
  return { before: b, after: a, pct: Math.round(((b - a) / b) * 100) };
}

// ---------------------------------------------------------------------------
// Delivery checklist — Setup → Intake → Assessment → Workshop → Report
// ---------------------------------------------------------------------------

export const PILOT_CHECKLIST_STEPS = ["setup", "intake", "assessment", "workshop", "report"] as const;
export type PilotChecklistStep = (typeof PILOT_CHECKLIST_STEPS)[number];

export interface PilotChecklistItem {
  key: PilotChecklistStep;
  label: string;
  done: boolean;
  /** What "done" means, in one line. */
  detail: string;
  href: string;
}

export interface PilotChecklistInput {
  /** The pilot order exists and is paid. */
  orderPaid: boolean;
  intakeLinks: number;
  submissions: number;
  /** Batch items scored. */
  scored: number;
  /** Submitted decisions (pass / track / proceed). */
  decided: number;
  /** The workshop metrics (satisfaction or consistency) were captured. */
  workshopCaptured: boolean;
  /** A cohort report was exported (or all report metrics captured). */
  reportDone: boolean;
}

export function pilotChecklist(input: PilotChecklistInput): PilotChecklistItem[] {
  return [
    { key: "setup", label: "Setup", done: input.orderPaid && input.intakeLinks > 0, detail: "Pilot paid and the intake link published.", href: "/workspace/accelerator/applications" },
    { key: "intake", label: "Intake", done: input.submissions > 0, detail: "Applications received through the link or the CSV import.", href: "/workspace/accelerator?stage=intake" },
    { key: "assessment", label: "Assessment", done: input.scored > 0 && input.decided > 0, detail: "Every applicant scored on one rubric and a decision recorded.", href: "/workspace/accelerator?stage=assessment" },
    { key: "workshop", label: "Workshop", done: input.workshopCaptured, detail: "Feedback workshop held — consistency and satisfaction captured below.", href: "#pilot-metrics" },
    { key: "report", label: "Report", done: input.reportDone, detail: "Cohort Report exported for the program and its sponsors.", href: "/workspace/accelerator?stage=sponsor" },
  ];
}

export function checklistFromMetrics(m: PilotMetrics, counts: Omit<PilotChecklistInput, "workshopCaptured" | "reportDone">, reportExported: boolean): PilotChecklistItem[] {
  return pilotChecklist({
    ...counts,
    workshopCaptured: typeof m.satisfaction === "number" || typeof m.evaluator_consistency === "number",
    reportDone: reportExported || (typeof m.repeat_intent === "boolean" && typeof m.renewal_intent === "boolean"),
  });
}
