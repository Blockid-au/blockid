// G19-S41 — "How this score was built": the one row model the web chapter,
// the react-pdf twin and the DOCX twin all render from, so the three
// surfaces show the same ledger. Pure: no I/O, no React.
//
//   base 50
//   + Serial founder with exits            +35   self-declared
//   + Co-founder team                      +15   self-declared
//   = score 100/100 (base + signals, clamped 0–100)
//   × weight 15 % × evidence confidence 0.50 (× verification L2 1.00)
//   = adjustment +4 on the SVI base of 100
//
// An unassessed chapter (`assessed:false`) renders one honest pending line
// instead of the table (S43 adds the CTA rows with links).

import { getTbrStrings, type TbrLocale } from "@/lib/i18n/tbr-strings";
import { DIMENSION_OWNERS, DIM_ORDER, type DimKey } from "@/lib/report-pipeline/dimension-owners";
import type { DimensionChapter, ReportV2, ScoreBreakdown, SviLedger } from "./schema";

export type LedgerRowKind = "base" | "signal" | "score" | "factor" | "adjustment";

export interface LedgerRow {
  kind: LedgerRowKind;
  label: string;
  /** Signed points for signal rows ("+35", "−10"); empty for the others. */
  points: string;
  /** Localised source chip for signal rows. */
  source: string;
  /** True on the LCO evidence-vault rows that move the adjustment rather than the raw score. */
  adjustmentScale?: boolean;
}

export function signed(n: number): string {
  const r = Math.round(n * 100) / 100;
  return r > 0 ? `+${r}` : r < 0 ? `−${Math.abs(r)}` : "0";
}

const fmtMultiplier = (m: number) => (Math.round(m * 100) / 100).toFixed(2);

/** The rows for one chapter's table; `[]` when the chapter has no ledger or is unassessed (use `pendingLine`). */
export function ledgerRowsFor(ch: Pick<DimensionChapter, "weight" | "score" | "scoreBreakdown">, locale: TbrLocale = "en", verificationLevel?: number | null): LedgerRow[] {
  const bd = ch.scoreBreakdown;
  if (!bd || !bd.assessed) return [];
  const t = getTbrStrings(locale).ledger;
  const rows: LedgerRow[] = [{ kind: "base", label: t.base(bd.base), points: "", source: "" }];
  for (const s of bd.signals) {
    rows.push({ kind: "signal", label: s.signal, points: signed(s.points), source: t.source[s.source] ?? s.source, adjustmentScale: s.scale === "adjustment" || undefined });
  }
  // The ledger's own score (deterministic). It equals `ch.score` on the
  // adapter path; on the pipeline path an owner may have moved the chapter
  // score ±10 and `scoreNote` says so — the ledger keeps telling the truth.
  rows.push({ kind: "score", label: t.score(deterministicScore(bd)), points: "", source: "" });
  rows.push({ kind: "factor", label: `${t.weight(ch.weight)} ${t.confidence(fmtMultiplier(bd.confidenceMultiplier))}`, points: "", source: "" });
  if (typeof bd.verificationMultiplier === "number" && typeof verificationLevel === "number") {
    rows.push({ kind: "factor", label: t.verification(verificationLevel, fmtMultiplier(bd.verificationMultiplier)), points: "", source: "" });
  }
  rows.push({ kind: "adjustment", label: t.adjustment(signed(bd.adjustment)), points: "", source: "" });
  return rows;
}

/** True when the chapter carries a ledger that says "no real input" — render `pendingLine` and the pending band. */
export function isUnassessed(ch: Pick<DimensionChapter, "scoreBreakdown">): boolean {
  return ch.scoreBreakdown?.assessed === false;
}

/** The single honest line for an unassessed chapter: "Not assessed yet — … Add: linkedin, github, upload". */
export function pendingLine(ch: Pick<DimensionChapter, "dim" | "scoreBreakdown">, locale: TbrLocale = "en"): { text: string; add: string } {
  const t = getTbrStrings(locale).ledger;
  const owner = DIMENSION_OWNERS[ch.dim as DimKey];
  const what = (owner?.connectors ?? []).slice(0, 3).join(", ");
  return { text: t.pending, add: what ? t.pendingAdd(what) : "" };
}

export interface CoverLedgerCell {
  label: string;
  value: string;
}

/** The cover strip "base 100 → dims → stage → penalties → … → total"; `[]` when the document has no ledger. */
export function coverLedgerCells(cover: Pick<ReportV2["cover"], "sviLedger">, locale: TbrLocale = "en"): CoverLedgerCell[] {
  const l = cover.sviLedger;
  if (!l) return [];
  const t = getTbrStrings(locale).ledger;
  const dims = DIM_ORDER.reduce((a, d) => a + (l.dimAdjustments[d] ?? 0), 0);
  const cells: CoverLedgerCell[] = [
    { label: t.coverBase, value: String(l.base) },
    { label: t.coverDims, value: signed(dims) },
    { label: t.coverStage, value: signed(l.stageBonus) },
    { label: t.coverPenalties, value: signed(l.riskPenalties) },
  ];
  if (l.sectorAdj) cells.push({ label: t.coverSector, value: signed(l.sectorAdj) });
  if (l.metricsBonus) cells.push({ label: t.coverMetrics, value: signed(l.metricsBonus) });
  if (l.ciBoost) cells.push({ label: t.coverCi, value: signed(l.ciBoost) });
  if (l.floorClamp) cells.push({ label: t.coverFloor, value: signed(l.floorClamp) });
  cells.push({ label: t.coverTotal, value: String(l.total) });
  return cells;
}

/** "N of 8 dimensions pending" — null when nothing is pending. */
export function pendingDimsLine(cover: Pick<ReportV2["cover"], "dims">, locale: TbrLocale = "en"): string | null {
  const n = DIM_ORDER.filter((d) => cover.dims[d]?.band === "pending").length;
  return n > 0 ? getTbrStrings(locale).ledger.pendingDims(n, DIM_ORDER.length) : null;
}

/** clamp(base + Σ score-scale points) — the deterministic 0–100 score the ledger explains. */
export function deterministicScore(bd: ScoreBreakdown): number {
  const raw = bd.signals.filter((s) => !s.scale).reduce((a, s) => a + s.points, bd.base);
  return Math.max(0, Math.min(100, raw));
}

/** Sum check used by tests: the ledger's score equals the chapter score. */
export function ledgerReconciles(bd: ScoreBreakdown, score: number): boolean {
  return deterministicScore(bd) === score;
}

export type { SviLedger };
