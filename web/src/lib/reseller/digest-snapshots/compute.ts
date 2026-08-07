// Generic snapshot compute() for the digest-snapshots registry (P1).
//
// The legacy `digest-snapshot-per-*.ts` stubs each hand-roll the same
// shape: take an array of rows, extract a numeric column, fold it with
// one metric fn, wrap the scalar in a { slug, value, ... } envelope.
// This module is the ONE generic that lets the registry (registry.ts)
// deliver every stub's compute path from a single well-tested primitive.
//
// Additive-only — the legacy stubs are still the source of truth for
// wired consumers. Migration happens in P2.

/** A single input row for `computeSnapshot`. */
export interface SnapshotInputRow {
  readonly value: number;
  readonly key?: string;
  readonly reseller_code?: string;
  readonly week?: string;
}

/** The output row shape every registry-derived snapshot emits. */
export interface SnapshotRow {
  readonly slug: string;
  readonly value: number;
  readonly count: number;
}

/** A pure metric fn — takes values, returns a scalar. */
export type MetricFn = (values: readonly number[]) => number;

/**
 * Extract a numeric column from an array of rows. Non-finite values
 * (NaN, ±Infinity) are dropped so downstream metric fns operate on
 * finite reals only — matches the posture the legacy stubs use where
 * `Number.isFinite(v)` guards every fold.
 */
export function extractValues(rows: readonly SnapshotInputRow[]): number[] {
  const out: number[] = [];
  for (const row of rows) {
    const v = row?.value;
    if (typeof v === "number" && Number.isFinite(v)) out.push(v);
  }
  return out;
}

/**
 * Compute one snapshot row: apply `metric` to `rows` and wrap the
 * scalar in a `{ slug, value, count }` envelope.
 *
 * `count` reflects the number of finite input values that survived
 * extraction — a caller can spot "0 rows fed into the fold" without
 * re-scanning the input.
 */
export function computeSnapshot(
  rows: readonly SnapshotInputRow[],
  metric: MetricFn,
  slug: string,
): SnapshotRow {
  const values = extractValues(rows);
  const value = metric(values);
  return { slug, value, count: values.length };
}

/**
 * Compute multiple snapshot rows, one per (slug, metric) pair, against
 * the same input rows. Used by the registry to fan out one input
 * dataset across every registered metric in a single pass.
 */
export function computeSnapshots(
  rows: readonly SnapshotInputRow[],
  entries: readonly { slug: string; metric: MetricFn }[],
): SnapshotRow[] {
  const values = extractValues(rows);
  return entries.map((e) => ({
    slug: e.slug,
    value: e.metric(values),
    count: values.length,
  }));
}
