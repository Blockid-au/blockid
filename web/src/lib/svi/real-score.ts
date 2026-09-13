// Does an account have a REAL SVI score, or only the column default?
//
// `svi_accounts.current_svi` is `integer not null default 100` (0008): the
// Nikkei-style index base. A row is created at signup, so a founder who has
// never run an analysis carries current_svi = 100 — which is not a score.
// Release QA-2 F4 (2026-09-12) taught the VC dashboard to render an empty
// state, but its rule accepted `current_svi > 0`, i.e. the default, so live
// QA lane 1 (2026-09-13, F3) still saw "A$535K · SVI 100" and the S26-B
// share price ("SVI score only"), DRIP previews and listing readiness all
// computed from it.
//
// A score is real only when there is evidence of scoring: an svi_analyses
// row, an svi_snapshots row, or an index base date (set when the index was
// initialised from an analysis). The stored number alone never counts.

export interface RealScoreEvidence {
  /** Any svi_analyses row for the account / project. */
  hasAnalysis: boolean;
  /** Any svi_snapshots row for the account. */
  hasSnapshot: boolean;
  /** svi_accounts.index_base_date — set only after a real analysis. */
  indexBaseDate?: string | null;
}

export function hasRealSviScore(e: RealScoreEvidence): boolean {
  return e.hasAnalysis || e.hasSnapshot || (typeof e.indexBaseDate === "string" && e.indexBaseDate.length > 0);
}

/** The score to use, or null when the account has never been scored. */
export function realSviScore(currentSvi: unknown, e: RealScoreEvidence): number | null {
  if (!hasRealSviScore(e)) return null;
  return typeof currentSvi === "number" && Number.isFinite(currentSvi) ? currentSvi : null;
}
