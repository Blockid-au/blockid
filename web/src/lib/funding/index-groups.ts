// Grouping for the two directory indexes (S10-A, perf audit finding 4).
//
// /funding/programs used to render 199 full cards (≈ 1.28 MB of HTML once
// the RSC payload repeats the tree). The index now groups rows by capital
// (programs) or state (grants), shows the first `INDEX_ROWS_PER_GROUP` of
// each group as compact rows and keeps the rest as name-only links inside a
// native `<details>` — every detail URL stays in the HTML exactly once, no
// client fetching. Pure (no I/O); colocated tests in index-groups.test.ts.

import type { AuGrantRow, AuProgramRow, AuState, Capital } from "./seed-map";
import { AU_STATES, CAPITALS } from "./seed-map";
import { sortByStatusThenName } from "./directory";

/** Compact rows rendered per group before the `<details>` tail. */
export const INDEX_ROWS_PER_GROUP = 6;

export interface IndexGroup<K extends string, R> {
  key: K;
  /** All rows of the group, open → upcoming → paused → closed, then by name. */
  rows: R[];
  /** The first `INDEX_ROWS_PER_GROUP` rows — rendered as compact rows. */
  visible: R[];
  /** Everything after `visible` — rendered as name-only links in a `<details>`. */
  tail: R[];
  /** Count of open rows (for the "N programs · M open" line). */
  open: number;
}

function build<K extends string, R extends { status: AuProgramRow["status"]; name: string }>(
  key: K,
  rows: ReadonlyArray<R>,
  perGroup: number,
): IndexGroup<K, R> {
  const sorted = sortByStatusThenName(rows);
  return {
    key,
    rows: sorted,
    visible: sorted.slice(0, perGroup),
    tail: sorted.slice(perGroup),
    open: sorted.filter((r) => r.status === "open").length,
  };
}

/**
 * Programs grouped by capital in `CAPITALS` order (Sydney … Darwin, then
 * Remote = Australia-wide / online). Capitals with no rows are omitted so a
 * filtered view never shows an empty heading.
 */
export function groupProgramsByCapital(
  rows: ReadonlyArray<AuProgramRow>,
  perGroup: number = INDEX_ROWS_PER_GROUP,
): IndexGroup<Capital, AuProgramRow>[] {
  return CAPITALS.map((c) => build(c, rows.filter((r) => r.capital === c), perGroup)).filter((g) => g.rows.length > 0);
}

/**
 * Grants grouped by state in `AU_STATES` order (national first). When a
 * state filter is active that state leads, so the "<state> startup grants"
 * landing page opens on its own rows and the federal schemes follow.
 */
export function groupGrantsByState(
  rows: ReadonlyArray<AuGrantRow>,
  first: AuState | null = null,
  perGroup: number = INDEX_ROWS_PER_GROUP,
): IndexGroup<AuState, AuGrantRow>[] {
  const order: AuState[] = first ? [first, ...AU_STATES.filter((s) => s !== first)] : [...AU_STATES];
  return order.map((s) => build(s, rows.filter((r) => r.state === s), perGroup)).filter((g) => g.rows.length > 0);
}

/**
 * A grant group is expanded (compact rows + tail) when it is the federal
 * group or the state the visitor filtered to; every other state is fully
 * collapsed into its `<details>` so the unfiltered index stays small.
 */
export function grantGroupExpanded(state: AuState, filterState: AuState | null): boolean {
  return state === "national" || state === filterState;
}
