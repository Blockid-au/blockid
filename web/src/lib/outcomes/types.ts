// Outcome ledger — types, vocabulary and input parsing (G21 P3-A, migration
// 0427). Pure: no server-only import, so the client forms, the routes, the
// calibration script and the tests share one definition of an outcome.
//
// An outcome is an OBSERVATION of what happened to a company after it was
// assessed — dated, sourced, with a confidence. Proposals (from signals)
// land as `proposed`; a person confirms or rejects. Only `confirmed` rows
// feed calibration (scripts/calibration/run.ts), which publishes rates per
// band with n and intervals and never a forecast for one company.

export const OUTCOME_KINDS = [
  "funding_raised",
  "revenue_growth",
  "survival",
  "next_stage",
  "grant_success",
  "accelerator_selection",
  "headcount_growth",
  "product_release",
] as const;
export type OutcomeKind = (typeof OUTCOME_KINDS)[number];

export const OUTCOME_SOURCES = ["founder", "evaluator", "connector", "external_signal", "admin"] as const;
export type OutcomeSource = (typeof OUTCOME_SOURCES)[number];

export const OUTCOME_STATUSES = ["proposed", "confirmed", "rejected"] as const;
export type OutcomeStatus = (typeof OUTCOME_STATUSES)[number];

/** Default reporter confidence per source (0–100). A confirmation never rewrites it. */
export const DEFAULT_CONFIDENCE: Readonly<Record<OutcomeSource, number>> = Object.freeze({
  founder: 60,
  evaluator: 70,
  connector: 85,
  external_signal: 90,
  admin: 95,
});

export const OUTCOME_NOTE_MAX = 2000;
export const OUTCOME_SOURCE_URL_MAX = 2048;
/** Open (proposed) rows a founder may hold per project before recording more. */
export const PROPOSED_OUTCOMES_PER_PROJECT_MAX = 50;

export interface OutcomeValueField {
  key: string;
  label: string;
  type: "number_aud" | "number" | "percent" | "text" | "url";
  required?: boolean;
  hint?: string;
}

export interface OutcomeKindMeta {
  label: string;
  hint: string;
  /** Structured fields the record form asks for (all optional at the type level; `required` enforced in parse). */
  fields: readonly OutcomeValueField[];
}

const SOURCE_URL: OutcomeValueField = { key: "source_url", label: "Source link", type: "url", hint: "An announcement, register entry, release page or document that shows it." };

export const OUTCOME_KIND_META: Readonly<Record<OutcomeKind, OutcomeKindMeta>> = Object.freeze({
  funding_raised: {
    label: "Funding raised",
    hint: "A round closed — equity, SAFE or convertible note.",
    fields: [
      { key: "amount_aud", label: "Amount (A$)", type: "number_aud", required: true },
      { key: "round", label: "Round", type: "text", hint: "pre-seed · seed · series-a · bridge …" },
      SOURCE_URL,
    ],
  },
  revenue_growth: {
    label: "Revenue growth",
    hint: "Monthly recurring revenue grew materially quarter on quarter.",
    fields: [
      { key: "mrr_from_aud", label: "MRR before (A$)", type: "number_aud", required: true },
      { key: "mrr_to_aud", label: "MRR after (A$)", type: "number_aud", required: true },
      SOURCE_URL,
    ],
  },
  survival: {
    label: "Still operating",
    hint: "The company is trading at the observed date (a survival checkpoint).",
    fields: [{ key: "months_since_assessment", label: "Months since first assessment", type: "number" }, SOURCE_URL],
  },
  next_stage: {
    label: "Moved to the next stage",
    hint: "The company's stage advanced (for example idea → pre-seed → seed).",
    fields: [
      { key: "from_stage", label: "From stage", type: "number" },
      { key: "to_stage", label: "To stage", type: "number", required: true },
      SOURCE_URL,
    ],
  },
  grant_success: {
    label: "Grant awarded",
    hint: "A government or foundation grant was approved.",
    fields: [
      { key: "program", label: "Program", type: "text", required: true },
      { key: "agency", label: "Agency", type: "text" },
      { key: "amount_aud", label: "Amount (A$)", type: "number_aud" },
      SOURCE_URL,
    ],
  },
  accelerator_selection: {
    label: "Selected by a program",
    hint: "Admitted to an accelerator, incubator or investment program.",
    fields: [{ key: "program", label: "Program", type: "text", required: true }, SOURCE_URL],
  },
  headcount_growth: {
    label: "Headcount growth",
    hint: "The team grew (full-time equivalents).",
    fields: [
      { key: "fte_from", label: "FTE before", type: "number", required: true },
      { key: "fte_to", label: "FTE after", type: "number", required: true },
      SOURCE_URL,
    ],
  },
  product_release: {
    label: "Product release",
    hint: "A public release, version tag or launch.",
    fields: [
      { key: "tag", label: "Version / tag", type: "text", required: true },
      { key: "repo", label: "Repository", type: "text" },
      SOURCE_URL,
    ],
  },
});

export const OUTCOME_SOURCE_LABEL: Readonly<Record<OutcomeSource, string>> = Object.freeze({
  founder: "Founder",
  evaluator: "Evaluator",
  connector: "Connector",
  external_signal: "Public register",
  admin: "BlockID",
});

export const OUTCOME_STATUS_LABEL: Readonly<Record<OutcomeStatus, string>> = Object.freeze({
  proposed: "Proposed — awaiting confirmation",
  confirmed: "Confirmed",
  rejected: "Rejected",
});

/** The `startup_outcomes` row as the API returns it. */
export interface OutcomeRow {
  id: string;
  project_id: string;
  kind: OutcomeKind;
  observed_at: string;
  value: Record<string, unknown>;
  source: OutcomeSource;
  confidence: number;
  recorded_by: string | null;
  status: OutcomeStatus;
  confirmed_by: string | null;
  confirmed_at: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export const OUTCOME_SELECT = "id, project_id, kind, observed_at, value, source, confidence, recorded_by, status, confirmed_by, confirmed_at, note, created_at, updated_at";

export function isOutcomeKind(v: unknown): v is OutcomeKind {
  return typeof v === "string" && (OUTCOME_KINDS as readonly string[]).includes(v);
}
export function isOutcomeSource(v: unknown): v is OutcomeSource {
  return typeof v === "string" && (OUTCOME_SOURCES as readonly string[]).includes(v);
}
export function isOutcomeStatus(v: unknown): v is OutcomeStatus {
  return typeof v === "string" && (OUTCOME_STATUSES as readonly string[]).includes(v);
}

// ── Input parsing ───────────────────────────────────────────────────────────

export interface OutcomeInput {
  kind: OutcomeKind;
  /** ISO timestamp. */
  observedAt: string;
  value: Record<string, unknown>;
  note: string | null;
  /** Reporter confidence 0–100; defaults per source when absent. */
  confidence: number | null;
}

export type ParseResult = { ok: true; input: OutcomeInput } | { ok: false; field: string; error: string };

const HTTP_RE = /^https?:\/\/[^\s]+$/i;
const FUTURE_SLACK_MS = 24 * 60 * 60 * 1000;

function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(/[,\s]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Validate a record-form / API body. `now` bounds `observedAt` (no more than
 * a day in the future, not before 2000). Per-kind `required` fields are
 * enforced; unknown value keys are dropped so `value` never carries free
 * JSON.
 */
export function parseOutcomeInput(body: unknown, now: Date = new Date()): ParseResult {
  if (!body || typeof body !== "object") return { ok: false, field: "body", error: "Body must be a JSON object." };
  const b = body as Record<string, unknown>;
  if (!isOutcomeKind(b.kind)) return { ok: false, field: "kind", error: "Choose an outcome kind." };
  const kind = b.kind;

  const rawDate = typeof b.observedAt === "string" ? b.observedAt.trim() : typeof b.observed_at === "string" ? b.observed_at.trim() : "";
  const ts = rawDate ? Date.parse(rawDate) : Number.NaN;
  if (!Number.isFinite(ts)) return { ok: false, field: "observedAt", error: "Give the date it happened." };
  if (ts > now.getTime() + FUTURE_SLACK_MS) return { ok: false, field: "observedAt", error: "The date cannot be in the future." };
  if (ts < Date.UTC(2000, 0, 1)) return { ok: false, field: "observedAt", error: "The date is too far in the past." };

  const rawValue = b.value && typeof b.value === "object" && !Array.isArray(b.value) ? (b.value as Record<string, unknown>) : {};
  const value: Record<string, unknown> = {};
  for (const f of OUTCOME_KIND_META[kind].fields) {
    const raw = rawValue[f.key];
    const present = raw !== undefined && raw !== null && !(typeof raw === "string" && raw.trim() === "");
    if (!present) {
      if (f.required) return { ok: false, field: `value.${f.key}`, error: `${f.label} is required.` };
      continue;
    }
    if (f.type === "number_aud" || f.type === "number" || f.type === "percent") {
      const n = num(raw);
      if (n === null || n < 0) return { ok: false, field: `value.${f.key}`, error: `${f.label} must be a non-negative number.` };
      value[f.key] = n;
    } else if (f.type === "url") {
      const s = String(raw).trim();
      if (s.length > OUTCOME_SOURCE_URL_MAX || !HTTP_RE.test(s)) return { ok: false, field: `value.${f.key}`, error: `${f.label} must be an http(s) link.` };
      value[f.key] = s;
    } else {
      const s = String(raw).trim().slice(0, 300);
      value[f.key] = s;
    }
  }
  if (kind === "revenue_growth") {
    const from = value.mrr_from_aud as number;
    const to = value.mrr_to_aud as number;
    if (from > 0) value.growth_pct = Math.round(((to - from) / from) * 1000) / 10;
  }
  if (kind === "headcount_growth") {
    const from = value.fte_from as number;
    const to = value.fte_to as number;
    if (to < from) return { ok: false, field: "value.fte_to", error: "FTE after must be at least FTE before for a growth outcome." };
  }

  const noteRaw = typeof b.note === "string" ? b.note.trim() : "";
  if (noteRaw.length > OUTCOME_NOTE_MAX) return { ok: false, field: "note", error: `Note must be at most ${OUTCOME_NOTE_MAX} characters.` };

  let confidence: number | null = null;
  if (b.confidence !== undefined && b.confidence !== null && b.confidence !== "") {
    const c = num(b.confidence);
    if (c === null || c < 0 || c > 100) return { ok: false, field: "confidence", error: "Confidence must be between 0 and 100." };
    confidence = Math.round(c * 100) / 100;
  }

  return { ok: true, input: { kind, observedAt: new Date(ts).toISOString(), value, note: noteRaw || null, confidence } };
}

/** One-line human summary of an outcome's value (list rows, admin queue, timeline markers). */
export function outcomeSummary(row: Pick<OutcomeRow, "kind" | "value">): string {
  const v = row.value ?? {};
  const aud = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? `A$${Math.round(n).toLocaleString("en-AU")}` : null);
  switch (row.kind) {
    case "funding_raised": {
      const bits = [aud(v.amount_aud), typeof v.round === "string" && v.round ? v.round : null].filter(Boolean);
      return bits.length ? bits.join(" · ") : "Round closed";
    }
    case "revenue_growth": {
      const pct = typeof v.growth_pct === "number" ? `${v.growth_pct > 0 ? "+" : ""}${v.growth_pct}%` : null;
      const range = aud(v.mrr_from_aud) && aud(v.mrr_to_aud) ? `${aud(v.mrr_from_aud)} → ${aud(v.mrr_to_aud)} MRR` : null;
      return [pct, range].filter(Boolean).join(" · ") || "MRR grew";
    }
    case "survival":
      return typeof v.months_since_assessment === "number" ? `Operating ${v.months_since_assessment} months after first assessment` : "Still operating";
    case "next_stage":
      return typeof v.to_stage === "number" ? (typeof v.from_stage === "number" ? `Stage ${v.from_stage} → ${v.to_stage}` : `Stage → ${v.to_stage}`) : "Stage advanced";
    case "grant_success": {
      const bits = [typeof v.program === "string" ? v.program : null, typeof v.agency === "string" ? v.agency : null, aud(v.amount_aud)].filter(Boolean);
      return bits.length ? bits.join(" · ") : "Grant awarded";
    }
    case "accelerator_selection":
      return typeof v.program === "string" && v.program ? `Selected — ${v.program}` : "Selected by a program";
    case "headcount_growth":
      return typeof v.fte_from === "number" && typeof v.fte_to === "number" ? `${v.fte_from} → ${v.fte_to} FTE` : "Team grew";
    case "product_release":
      return typeof v.tag === "string" && v.tag ? `Release ${v.tag}${typeof v.repo === "string" && v.repo ? ` (${v.repo})` : ""}` : "Release shipped";
  }
}
