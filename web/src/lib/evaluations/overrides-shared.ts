// overrides-shared — client-safe part of the human-override model (G21
// P2-B; migration 0423 `assessment_overrides`): reason codes + labels, the
// Zod input, the row type / mapper and the pure reducers (latest override
// per dimension, scores-with-overrides). No Supabase, no "server-only" —
// OverrideDialog / CohortTable import from here. The DB layer is
// ./overrides.ts.
//
// A reviewer may override ONE dimension score (or the total) with a reason
// code. The row is appended, never updated; the canonical SVI / dimension
// score is untouched — the cohort view shows "model 48 → human 62 ·
// sector context" beside the model number.

import { z } from "zod";
import { DIMENSION_KEYS, DIMENSION_LABELS, type DimensionKey } from "./batch-shared";

type Row = Record<string, unknown>;

export const OVERRIDE_REASON_CODES = [
  "evidence_not_captured",
  "evidence_contradicted",
  "sector_context",
  "stage_context",
  "duplicate_signal",
  "data_error",
  "other",
] as const;
export type OverrideReasonCode = (typeof OVERRIDE_REASON_CODES)[number];

export const OVERRIDE_REASON_LABELS: Record<OverrideReasonCode, string> = {
  evidence_not_captured: "Evidence not captured by the model",
  evidence_contradicted: "Evidence contradicts the model",
  sector_context: "Sector context",
  stage_context: "Stage context",
  duplicate_signal: "Duplicate signal",
  data_error: "Data error",
  other: "Other (see note)",
};

export const OVERRIDE_DIMENSIONS = [...DIMENSION_KEYS, "total"] as const;
export type OverrideDimension = (typeof OVERRIDE_DIMENSIONS)[number];

export function overrideDimensionLabel(d: OverrideDimension): string {
  return d === "total" ? "SVI total" : DIMENSION_LABELS[d as DimensionKey];
}

export const OVERRIDE_NOTE_MAX = 2000;

export const overrideInputSchema = z
  .object({
    item_id: z.coerce.number().int().positive(),
    dimension: z.enum(OVERRIDE_DIMENSIONS),
    to_value: z.coerce.number().min(0).max(100),
    reason_code: z.enum(OVERRIDE_REASON_CODES),
    note: z.string().trim().max(OVERRIDE_NOTE_MAX).optional().nullable(),
  })
  .strict()
  .refine((b) => b.reason_code !== "other" || (b.note ?? "").trim().length > 0, { message: "Add a note when the reason is “Other”", path: ["note"] });
export type OverrideInput = z.infer<typeof overrideInputSchema>;

export interface OverrideRow {
  id: string;
  batchId: string;
  itemId: number;
  projectId: string;
  dimension: OverrideDimension;
  fromValue: number | null;
  toValue: number;
  reasonCode: OverrideReasonCode;
  note: string | null;
  reviewerId: string | null;
  reviewerName: string | null;
  createdAt: string;
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function mapOverrideRow(row: Row): OverrideRow {
  const dim = String(row.dimension ?? "total");
  const reason = String(row.reason_code ?? "other");
  return {
    id: String(row.id),
    batchId: String(row.batch_id),
    itemId: Number(row.item_id),
    projectId: String(row.project_id ?? ""),
    dimension: (OVERRIDE_DIMENSIONS as readonly string[]).includes(dim) ? (dim as OverrideDimension) : "total",
    fromValue: num(row.from_value),
    toValue: num(row.to_value) ?? 0,
    reasonCode: (OVERRIDE_REASON_CODES as readonly string[]).includes(reason) ? (reason as OverrideReasonCode) : "other",
    note: row.note == null ? null : String(row.note),
    reviewerId: row.reviewer_id == null ? null : String(row.reviewer_id),
    reviewerName: row.reviewer_name == null ? null : String(row.reviewer_name),
    createdAt: String(row.created_at ?? ""),
  };
}

/** Pure: the latest override per dimension (rows in any order). */
export function latestOverrideByDimension(rows: ReadonlyArray<OverrideRow>): Partial<Record<OverrideDimension, OverrideRow>> {
  const out: Partial<Record<OverrideDimension, OverrideRow>> = {};
  for (const r of rows) {
    const cur = out[r.dimension];
    if (!cur || r.createdAt > cur.createdAt) out[r.dimension] = r;
  }
  return out;
}

/** Pure: the 8 dimension scores with the latest human overrides applied (the `total` override is not a dimension). */
export function applyOverrides(scores: Partial<Record<DimensionKey, number>> | null, rows: ReadonlyArray<OverrideRow>): Partial<Record<DimensionKey, number>> | null {
  if (!scores && rows.length === 0) return null;
  const latest = latestOverrideByDimension(rows);
  const out: Partial<Record<DimensionKey, number>> = { ...(scores ?? {}) };
  let changed = false;
  for (const k of DIMENSION_KEYS) {
    const o = latest[k];
    if (o) {
      out[k] = o.toValue;
      changed = true;
    }
  }
  return changed ? out : scores;
}
