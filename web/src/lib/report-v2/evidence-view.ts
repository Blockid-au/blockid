// evidence-view — G19-S43: the one row model the web chapter / appendix, the
// react-pdf twin and the DOCX twin render the evidence & CTA surfaces from,
// so the three say the same thing:
//
//   evidence table   evidenced / partial rows first, then every `missing`
//                    row as a CTA row (label · "Add now →" href · "+N SVI");
//   pending chapter  the same CTA rows under the S41 pending line;
//   next action      "Title — expected lift +N SVI · Evidence to add: <label>"
//                    (the catalogue label, never the raw enum "stripe");
//   cover            "Evidence: mostly self-declared (×0.50)";
//   money            the honest empty state + its CTA (never "re-run");
//   90-day plan      the engine's P0 / P1 gaps as CTA rows.
//
// Pure: no I/O, no React.

import { getTbrS43Strings, type TbrS43Strings } from "@/lib/i18n/tbr-strings";
import { CTA_HREFS } from "./evidence-cta";
import type { DimensionChapter, EvidenceRow, ReportV2 } from "./schema";

/** Any TBR locale — the s43 strings carry EN + VI; ES / JA read English. */
export type EvidenceViewLocale = string;

export interface EvidenceRowView {
  evidence_id: string;
  label: string;
  /** Localised, founder-facing source name. */
  source: string;
  /** Raw status (`missing` rows are CTA rows). */
  status: EvidenceRow["status"];
  statusLabel: string;
  observedAt: string;
  /** Present on CTA rows only. */
  cta: { label: string; href: string; liftLabel: string } | null;
  dims: string[];
}

const fmtMultiplier = (m: number) => (Math.round(m * 100) / 100).toFixed(2);

function ctaOf(row: EvidenceRow, t: TbrS43Strings): EvidenceRowView["cta"] {
  if (row.status !== "missing" || !row.cta) return null;
  return { label: row.cta.label, href: row.cta.href, liftLabel: typeof row.cta.lift === "number" ? t.lift(row.cta.lift) : "" };
}

/** Rows for a table: real evidence first (by observedAt desc), then CTA rows by lift desc, then plain missing rows. */
export function evidenceRowsView(rows: readonly EvidenceRow[], locale: EvidenceViewLocale = "en"): EvidenceRowView[] {
  const t = getTbrS43Strings(locale);
  const rank = (r: EvidenceRow) => (r.status !== "missing" ? 0 : r.cta ? 1 : 2);
  return [...rows]
    .sort((a, b) => rank(a) - rank(b) || (b.cta?.lift ?? 0) - (a.cta?.lift ?? 0) || (b.observedAt ?? "").localeCompare(a.observedAt ?? ""))
    .map((r) => ({
      evidence_id: r.evidence_id,
      label: r.label,
      source: t.source[r.source] ?? r.source,
      status: r.status,
      statusLabel: r.status === "missing" ? t.missing : r.status,
      observedAt: r.status === "missing" ? "" : (r.observedAt ?? "").slice(0, 10),
      cta: ctaOf(r, t),
      dims: r.dims.map((d) => d.toUpperCase()),
    }));
}

/** The chapter's CTA rows (missing rows with a link), highest lift first. */
export function chapterCtaRows(ch: Pick<DimensionChapter, "evidence">, locale: EvidenceViewLocale = "en"): EvidenceRowView[] {
  return evidenceRowsView(ch.evidence, locale).filter((r) => r.cta);
}

/** Empty evidence table copy + the Evidence Hub link (used when a chapter has no rows at all). */
export function emptyEvidenceLine(locale: EvidenceViewLocale = "en"): { text: string; ctaLabel: string; href: string } {
  const t = getTbrS43Strings(locale);
  return { text: t.noEvidence, ctaLabel: t.noEvidenceCta, href: CTA_HREFS.evidence };
}

/** "Add data to score this dimension:" — heading over the pending chapter's CTA rows. */
export function pendingCtasHeading(locale: EvidenceViewLocale = "en"): string {
  return getTbrS43Strings(locale).pendingCtas;
}

/** The next-action line parts: title, lift text and the localised "Evidence to add: <label>" (null when the action adds none). */
export function nextActionView(ch: Pick<DimensionChapter, "nextAction">, locale: EvidenceViewLocale = "en"): { title: string; lift: string; evidence: string | null; evidenceLabel: string } {
  const t = getTbrS43Strings(locale);
  const src = ch.nextAction.evidenceToAdd;
  return { title: ch.nextAction.title, lift: t.expectedLift(ch.nextAction.expectedLift), evidence: src ? (t.source[src] ?? src) : null, evidenceLabel: t.evidenceToAdd };
}

/** One line: "Title — expected lift +N SVI · Evidence to add: Stripe (revenue)". */
export function nextActionLine(ch: Pick<DimensionChapter, "nextAction">, locale: EvidenceViewLocale = "en"): string {
  const v = nextActionView(ch, locale);
  return `${v.title} — ${v.lift}${v.evidence ? ` · ${v.evidenceLabel}: ${v.evidence}` : ""}`;
}

/** "Evidence: mostly self-declared (×0.50)" — null on a document without the S43 cover block. */
export function coverEvidenceLine(cover: Pick<ReportV2["cover"], "evidenceLevel">, locale: EvidenceViewLocale = "en"): string | null {
  const e = cover.evidenceLevel;
  if (!e) return null;
  const t = getTbrS43Strings(locale);
  return t.coverEvidence(t.evidenceLevel[e.level] ?? e.level, fmtMultiplier(e.confidenceMultiplier));
}

/**
 * Money on the Table empty state. A subtitle mentioning the grant profile
 * (adapter / pipeline "no profile") → "complete your grant profile"; any other
 * empty state → "review your grant profile". Null when there are matches.
 */
export function moneyEmptyState(report: Pick<ReportV2, "moneyOnTable">, locale: EvidenceViewLocale = "en"): { text: string; ctaLabel: string; href: string } | null {
  const m = report.moneyOnTable;
  if (m.grants.length + m.programs.length > 0) return null;
  const t = getTbrS43Strings(locale);
  const noProfile = m.visuals.some((v) => /grant profile/i.test(v.subtitle ?? "") && /no grant profile|complete/i.test(v.subtitle ?? ""));
  return noProfile ? { text: t.moneyNoProfile, ctaLabel: t.moneyNoProfileCta, href: CTA_HREFS.funding } : { text: t.moneyNoMatch, ctaLabel: t.moneyNoMatchCta, href: CTA_HREFS.funding };
}

/** The 90-day plan's P0 / P1 evidence rows as CTA rows (empty on pre-S43 documents). */
export function planEvidenceRows(report: Pick<ReportV2, "actionPlan">, locale: EvidenceViewLocale = "en"): { title: string; rows: EvidenceRowView[] } {
  return { title: getTbrS43Strings(locale).planEvidenceTitle, rows: evidenceRowsView(report.actionPlan.evidenceToAdd ?? [], locale).filter((r) => r.cta) };
}
