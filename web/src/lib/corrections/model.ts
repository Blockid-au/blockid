// Founder correction workflow — pure model (G21 P1-C; score-governance § 10).
//
// A correction is a founder's flag on something BlockID holds or says about
// their startup. It is LOGGED, never applied in place: an admin accepts or
// rejects it and records a resolution; an accepted sector / stage correction
// is written through the existing project update path (versioned + audited)
// and the resolution says so. Migration 0418_corrections.sql.
//
// Dependency-free so the founder form (client), the routes and the admin
// queue all share one vocabulary and one validator.

import { DIMENSION_OWNERS, DIM_ORDER, type DimKey } from "@/lib/report-pipeline/dimension-owners";

export const CORRECTION_KINDS = [
  "incorrect_data",
  "stale_data",
  "misunderstood_evidence",
  "duplicate_company",
  "wrong_sector_stage",
  "unsupported_statement",
] as const;
export type CorrectionKind = (typeof CORRECTION_KINDS)[number];

export const CORRECTION_STATUSES = ["open", "accepted", "rejected"] as const;
export type CorrectionStatus = (typeof CORRECTION_STATUSES)[number];

export const CORRECTION_KIND_LABEL: Record<CorrectionKind, { label: string; hint: string }> = {
  incorrect_data: { label: "Incorrect data", hint: "A figure, name, date or fact we hold is wrong." },
  stale_data: { label: "Stale data", hint: "It was right once — the current figure is different." },
  misunderstood_evidence: { label: "Misunderstood evidence", hint: "The evidence is right, the reading of it is not." },
  duplicate_company: { label: "Duplicate company", hint: "This record duplicates another startup, or was merged with the wrong one." },
  wrong_sector_stage: { label: "Wrong sector / stage", hint: "The sector or growth stage on the record is wrong." },
  unsupported_statement: { label: "Unsupported statement in a report", hint: "A report sentence is not backed by any evidence we gave." },
};

export const CORRECTION_MESSAGE_MAX = 4000;
export const CORRECTION_TARGET_MAX = 200;
/** Open corrections a founder may hold per project before the API says "wait". */
export const OPEN_CORRECTIONS_PER_PROJECT_MAX = 10;

/** `dimension:<key>` target refs, one per SVI dimension, in report order. */
export const DIMENSION_TARGETS: ReadonlyArray<{ ref: string; label: string }> = DIM_ORDER.map((k: DimKey) => ({
  ref: `dimension:${k}`,
  label: DIMENSION_OWNERS[k].title,
}));

/** Non-dimension targets the picker offers before the free-text option. */
export const PROFILE_TARGETS: ReadonlyArray<{ ref: string; label: string }> = [
  { ref: "profile:sector", label: "Sector (industry) on the startup record" },
  { ref: "profile:stage", label: "Growth stage on the startup record" },
  { ref: "profile:company", label: "Company identity (name, ABN, duplicate)" },
  { ref: "report:latest", label: "The latest report as a whole" },
];

/** `dimension:tre` · `claim:<uuid>` · `report:<id>#section` · `profile:sector` · `evidence:<uuid>`. */
export const TARGET_REF_RE = /^(dimension|claim|report|profile|evidence|listing):[A-Za-z0-9._#:/-]{1,160}$/;

export function isCorrectionKind(v: unknown): v is CorrectionKind {
  return typeof v === "string" && (CORRECTION_KINDS as readonly string[]).includes(v);
}

export function isCorrectionStatus(v: unknown): v is CorrectionStatus {
  return typeof v === "string" && (CORRECTION_STATUSES as readonly string[]).includes(v);
}

export function isTargetRef(v: unknown): v is string {
  return typeof v === "string" && v.length <= CORRECTION_TARGET_MAX && TARGET_REF_RE.test(v);
}

export interface CorrectionInput {
  projectId: string;
  kind: CorrectionKind;
  targetRef: string | null;
  message: string;
  /** Structured proposal, e.g. `{ industry: "fintech" }` or `{ stage: 3 }` — applied only by an admin accept. */
  proposed: CorrectionProposal;
}

export interface CorrectionProposal {
  industry?: string;
  stage?: number;
}

export type ParseResult = { ok: true; input: CorrectionInput } | { ok: false; error: string; field: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validate a POST /api/corrections body. Pure; never throws. */
export function parseCorrectionInput(body: unknown): ParseResult {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const projectId = typeof b.projectId === "string" ? b.projectId.trim() : "";
  if (!UUID_RE.test(projectId)) return { ok: false, error: "projectId must be a uuid", field: "projectId" };
  if (!isCorrectionKind(b.kind)) return { ok: false, error: `kind must be one of ${CORRECTION_KINDS.join(", ")}`, field: "kind" };
  const rawTarget = typeof b.targetRef === "string" ? b.targetRef.trim() : "";
  let targetRef: string | null = null;
  if (rawTarget) {
    if (!isTargetRef(rawTarget)) return { ok: false, error: "targetRef must look like dimension:tre, claim:<id>, report:<id>#section or profile:sector", field: "targetRef" };
    targetRef = rawTarget;
  }
  const message = typeof b.message === "string" ? b.message.trim() : "";
  if (!message) return { ok: false, error: "message is required", field: "message" };
  if (message.length > CORRECTION_MESSAGE_MAX) return { ok: false, error: `message must be at most ${CORRECTION_MESSAGE_MAX} characters`, field: "message" };
  const proposed: CorrectionProposal = {};
  const p = (b.proposed && typeof b.proposed === "object" ? b.proposed : {}) as Record<string, unknown>;
  if (typeof p.industry === "string" && p.industry.trim()) {
    const industry = p.industry.trim();
    if (industry.length > 80) return { ok: false, error: "proposed.industry must be at most 80 characters", field: "proposed.industry" };
    proposed.industry = industry;
  }
  if (p.stage !== undefined && p.stage !== null && p.stage !== "") {
    const stage = typeof p.stage === "number" ? p.stage : Number(p.stage);
    if (!Number.isInteger(stage) || stage < 0 || stage > 7) return { ok: false, error: "proposed.stage must be an integer 0–7", field: "proposed.stage" };
    proposed.stage = stage;
  }
  if (b.kind === "wrong_sector_stage" && proposed.industry === undefined && proposed.stage === undefined && !targetRef) {
    return { ok: false, error: "a sector / stage correction needs a target (profile:sector or profile:stage) or a proposed value", field: "targetRef" };
  }
  return { ok: true, input: { projectId, kind: b.kind, targetRef, message, proposed } };
}

export interface CorrectionRow {
  id: string;
  project_id: string;
  kind: CorrectionKind;
  target_ref: string | null;
  message: string;
  proposed: CorrectionProposal;
  status: CorrectionStatus;
  submitted_by: string | null;
  resolved_by: string | null;
  resolution: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Human label for a target ref ("Traction & Revenue Evidence", "Sector (industry) …", or the raw ref). */
export function targetLabel(ref: string | null): string {
  if (!ref) return "General";
  const dim = DIMENSION_TARGETS.find((t) => t.ref === ref);
  if (dim) return dim.label;
  const prof = PROFILE_TARGETS.find((t) => t.ref === ref);
  if (prof) return prof.label;
  return ref;
}

export type ResolveDecision = "accept" | "reject";

export interface PlannedChange {
  /** The field on `projects` the accept path writes through `updateProject`. */
  field: "industry" | "stage";
  value: string | number;
}

/**
 * What an ACCEPT may write through the project update path — only a sector /
 * stage correction with a proposed value. Everything else records the
 * resolution only (the data is corrected by the founder re-uploading /
 * re-running, per score-governance § 10). Pure.
 */
export function plannedChangeFor(row: Pick<CorrectionRow, "kind" | "target_ref" | "proposed">): PlannedChange | null {
  if (row.kind !== "wrong_sector_stage") return null;
  const p = row.proposed ?? {};
  if (typeof p.industry === "string" && p.industry.trim() && (row.target_ref === null || row.target_ref === "profile:sector")) {
    return { field: "industry", value: p.industry.trim() };
  }
  if (typeof p.stage === "number" && Number.isInteger(p.stage) && (row.target_ref === null || row.target_ref === "profile:stage")) {
    return { field: "stage", value: p.stage };
  }
  return null;
}

/** The resolution text stored on accept — the admin note plus what (if anything) was changed. */
export function composeResolution(decision: ResolveDecision, note: string | null, change: PlannedChange | null, applied: boolean): string {
  const base = (note ?? "").trim();
  if (decision === "reject") return base || "Rejected — no change made.";
  if (!change) return `${base ? `${base} ` : ""}Accepted — recorded against the record; the underlying data is corrected by re-uploading the evidence or re-running the analysis (no value was overwritten).`.trim();
  const what = `${change.field} → ${String(change.value)}`;
  return applied
    ? `${base ? `${base} ` : ""}Accepted — ${what} written through the project update path (versioned, audit-logged).`.trim()
    : `${base ? `${base} ` : ""}Accepted — ${what} could NOT be written through the project update path; apply manually.`.trim();
}
