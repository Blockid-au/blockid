"use client";

// cohort-table — thin wrapper kept at the T0272 import path (G21 P2-B).
//
// The BlockID Cohort table itself lives in
// `components/evaluations/CohortTable.tsx`. This wrapper accepts either the
// new `CohortRow` model (from lib/evaluations/cohort-rows) or the legacy
// batch rows (lib/evaluations/batch-shared `CohortRow`, as
// `loadCohortRows()` still returns them for the quarterly report) and lifts
// the latter through `buildCohortRows` with no analyses / overrides — the
// same columns, "—" where the P2-B loader would have filled a value.

import * as React from "react";
import type { CohortRow as BatchCohortRow, RubricWeights } from "@/lib/evaluations/batch-shared";
import { equalWeights } from "@/lib/evaluations/batch-shared";
import { buildCohortRows, type CohortItemInput, type CohortRow } from "@/lib/evaluations/cohort-rows";
import { CohortTable as BlockIdCohortTable, type CohortTableProps as BlockIdCohortTableProps, type CohortViewerRole } from "@/components/evaluations/CohortTable";

export type { CohortViewerRole };

export interface CohortTableProps extends Omit<BlockIdCohortTableProps, "rows" | "batchId" | "role"> {
  rows: CohortRow[] | BatchCohortRow[];
  /** Batch id → enables the write toolbars (with `role` owner / reviewer). Omit for a read-only table. */
  batchId?: string;
  role?: CohortViewerRole;
  /** Program rubric for legacy rows (default: equal weights). */
  weights?: RubricWeights;
}

function isBlockIdRow(r: CohortRow | BatchCohortRow): r is CohortRow {
  return typeof (r as CohortRow).company === "string" && Array.isArray((r as CohortRow).log);
}

/** Pure: legacy batch rows → BlockID Cohort rows (no analyses / overrides). */
export function liftLegacyRows(rows: ReadonlyArray<BatchCohortRow>, weights: RubricWeights = equalWeights()): CohortRow[] {
  const items = rows.map<CohortItemInput>((r) => ({ ...r, snapshotId: null, shortlisted: false, reviewStatus: "unreviewed", reviewerId: null, reviewerName: null }));
  const assessments: Record<string, BatchCohortRow> = {};
  for (const r of rows) assessments[r.evaluationId] = r;
  return buildCohortRows(items, {}, assessments, [], weights);
}

export function CohortTable({ rows, batchId, role, weights, ...rest }: CohortTableProps) {
  const lifted = React.useMemo(() => (rows.length && !isBlockIdRow(rows[0]!) ? liftLegacyRows(rows as BatchCohortRow[], weights) : (rows as CohortRow[])), [rows, weights]);
  return <BlockIdCohortTable rows={lifted} batchId={batchId ?? ""} role={batchId ? role ?? "owner" : "viewer"} {...rest} />;
}
