// Sections 5–12 — one dimension chapter, the identical 10-slot anatomy of
// spec § 3 (G27, wireframe W4), the same on web, PDF and DOCX:
//
//   1 header row   kicker "Dimension n/8 · weight W %" · title · score tile
//                  S / 100 · band chip (dot + label) · benchmark line via
//                  publication-rules (always with n, never a figure without
//                  it) · phase floor chip
//   2 verdict      ≤ 60 words, footnotes kept
//   3 evidence     ≤ 5 rows label · confidence rung · status · footnote no.,
//                  "+N more in the evidence register" — never an evidence id
//   4 strengths    ≤ 3
//   5 risks/gaps   ≤ 3 (chapter + criteria, de-duplicated); an uncited
//                  material claim carries the "unverified" chip
//   6 criteria     mini-table criterion · score · quality · one-line verdict;
//                  full cards (strengths / gaps / next) on the paid view
//   7 improve      1–3 rows action · +lift · window · evidence to add
//   8 takeaway     one line, navy left-rule callout
//   9 ledger       "How this score was built" in a collapsed <details>
//  10 audit line   owner agent · grounded / uncited · auditor stamp
//
// Layout: two columns at ≥ 1024 (main 8 / rail 4: evidence used + what to
// improve), single column below. Pending dims collapse slots 2–8 into one
// honest card. Free tier: chapters 1–4 full, 5–8 as compact cards (score ·
// band · verdict ≤ 40 words · takeaway) or, with `locked`, the G16-B locked
// preview. Every chapter still carries exactly one primary `svg[role=img]`
// under `[data-tbr-primary=<dim>]` (the S-R1 exit check). Hook-free.

import { getTbrS43Strings, getTbrStrings } from "@/lib/i18n/tbr-strings";
import { VisualFigure } from "@/lib/report-visuals/react";
import { chapterCtaRows, evidenceRowsView, nextActionView, pendingCtasHeading, type EvidenceRowView } from "@/lib/report-v2/evidence-view";
import { isUnassessed, ledgerRowsFor, pendingLine } from "@/lib/report-v2/ledger-rows";
import { chapterGaps, isAssessed } from "@/lib/report-v2/investment-view";
import { hasCitationOrMarker, isMaterialClaim } from "@/lib/report-pipeline/claim-gate";
import { cardRenderModes } from "@/lib/report-v2/card-modes";
import { stripCitationMarkers, type CitationIndex } from "@/lib/report-v2/citations";
import { CRITERIA } from "@/lib/evaluation-criteria";
import { DIMENSION_OWNERS, DIM_ORDER } from "@/lib/report-pipeline/dimension-owners";
import type { DimensionChapter } from "@/lib/report-v2/schema";
import { benchmarkLabel, mayShowPercentile } from "@/lib/benchmarks/publication-rules";
import { derivedLift } from "@/lib/svi-lift";
import { cn } from "@/lib/utils";
import { AgentBadge, AuditStampLine, Bullets, Chip, CitedText, Prose, TABLE_CLASS, TBR_V2_SECTION_IDS, THEAD_CLASS, TbrSection, UnverifiedChip, WindowChip, phaseLabel, stateLabel, zebraRow, type TbrUiLocale } from "./shared";
import { BandChip, Callout, FIGURE_CLASS, STICKY_COL_CLASS, TABLE_SCROLL_CLASS, TD_CLASS, TH_CLASS, v3Strings } from "./shared-v3";
import { FounderExecutionCard, founderExecutionFromChapter } from "./founder-execution-card";
import { TbrLockedChapterPreview } from "./locked-preview";

/** G19-S43 — one CTA: "<label> · Add now → · +N SVI" linking the internal page where the input is added. */
export function CtaLink({ row, locale = "en" }: { row: EvidenceRowView; locale?: TbrUiLocale }) {
  const t = getTbrS43Strings(locale);
  if (!row.cta) return null;
  return (
    <span data-tbr-cta className="inline-flex flex-wrap items-center gap-1.5">
      <span className="text-secondary">{row.cta.label}</span>
      <a href={row.cta.href} className="rounded-md border border-brand-navy/40 bg-surface-sunken px-1.5 py-0.5 text-xs font-semibold text-action hover:bg-surface-sunken">
        {t.addNow}
      </a>
      {row.cta.liftLabel ? <span className={cn("rounded-full border border-line-subtle px-1.5 py-0.5 text-xs text-muted", FIGURE_CLASS)}>{row.cta.liftLabel}</span> : null}
    </span>
  );
}

/**
 * G19-S41 — "How this score was built": base → each signal ± points (source
 * chip) → = score → × weight × confidence (× verification) → = adjustment.
 * An unassessed chapter shows one honest pending line instead; `scoreNote`
 * (owner reconciliation / chart provenance) is shown whenever present.
 * Rendered inside the chapter's <details> and again as the appendix table.
 */
export function TbrScoreLedger({ chapter, locale = "en", verificationLevel, citations }: { chapter: DimensionChapter; locale?: TbrUiLocale; verificationLevel?: number | null; citations?: CitationIndex }) {
  const t = getTbrStrings(locale).ledger;
  const ch = chapter;
  if (!ch.scoreBreakdown) return null;
  const rowLocale: "en" | "vi" = locale === "vi" ? "vi" : "en";
  const rows = ledgerRowsFor(ch, rowLocale, verificationLevel);
  const unassessed = isUnassessed(ch);
  const pending = unassessed ? pendingLine(ch, rowLocale) : null;
  const pendingCtas = unassessed ? chapterCtaRows(ch, locale) : [];
  return (
    <div data-tbr-ledger={ch.dim} data-tbr-ledger-state={unassessed ? "pending" : "assessed"} className="overflow-x-auto rounded-lg border border-line-subtle print:break-inside-avoid">
      <table className={TABLE_CLASS}>
        <caption className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted">{t.title}</caption>
        {pending ? (
          <tbody>
            <tr className="border-t border-line-subtle">
              <td colSpan={3} className="px-3 py-2 text-secondary">
                {pending.text}
                {pendingCtas.length === 0 && pending.add ? <span className="ml-1 text-muted">{pending.add}</span> : null}
              </td>
            </tr>
            {pendingCtas.length > 0 && (
              <tr className="border-t border-line-subtle">
                <td colSpan={3} className="px-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">{pendingCtasHeading(locale)}</p>
                  <ul data-tbr-pending-ctas={ch.dim} className="mt-1 space-y-1">
                    {pendingCtas.map((r) => (
                      <li key={r.evidence_id}>
                        <CtaLink row={r} locale={locale} />
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            )}
          </tbody>
        ) : (
          <>
            <thead className={THEAD_CLASS}>
              <tr className="border-t border-line-subtle">
                <th className="px-3 py-1 font-medium">{t.thSignal}</th>
                <th className="px-3 py-1 text-right font-medium">{t.thPoints}</th>
                <th className="px-3 py-1 font-medium">{t.thSource}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={cn(zebraRow(i), r.kind !== "signal" && "bg-surface-sunken font-medium")}>
                  <td className={cn("px-3 py-1 text-secondary", r.kind !== "signal" && "font-medium")}>
                    {r.label}
                    {r.adjustmentScale ? <span className="ml-1 text-xs text-muted">({t.adjustmentScale})</span> : null}
                  </td>
                  <td className={cn("px-3 py-1 text-right", FIGURE_CLASS, r.points.startsWith("−") ? "text-bear" : "text-secondary")}>{r.points}</td>
                  <td className="px-3 py-1">{r.source ? <Chip kind="source">{r.source}</Chip> : null}</td>
                </tr>
              ))}
            </tbody>
          </>
        )}
      </table>
      {ch.scoreNote ? (
        <p data-tbr-score-note={ch.dim} className="border-t border-line-subtle px-3 py-1.5 text-xs text-muted">
          <span className="font-semibold">{t.scoreNote}:</span> <CitedText text={ch.scoreNote} citations={citations} locale={locale} />
        </p>
      ) : null}
    </div>
  );
}

/** G19-S47: the criterion quality level as a label, never the raw enum. */
function qualityLabel(quality: string, locale: TbrUiLocale): string {
  const table = getTbrStrings(locale).v2.s47.quality;
  return (table as Record<string, string>)[quality] ?? quality;
}

function normBullet(text: string): string {
  return stripCitationMarkers(text).trim().toLowerCase().replace(/[.;:,\s]+$/u, "");
}

const words = (s: string, n: number): string => {
  const parts = s.trim().split(/\s+/).filter(Boolean);
  return parts.length <= n ? s.trim() : `${parts.slice(0, n).join(" ")}…`;
};

/** Slot 1 — the header row: score tile, band chip, benchmark line (always with n), floor chip. */
function ChapterHeader({ ch, locale, benchmarkN }: { ch: DimensionChapter; locale: TbrUiLocale; benchmarkN: number | null }) {
  const t = v3Strings(locale);
  const pending = !isAssessed(ch) || ch.band === "pending";
  const n = benchmarkN ?? (typeof ch.benchmark.n === "number" ? ch.benchmark.n : null);
  const label = n !== null && mayShowPercentile(n) ? benchmarkLabel(n).replace(/ \(n = \d+\)$/, "") : null;
  const benchLine = n === null ? t.benchNone : label ? t.benchLine(ch.benchmark.p50, n, label, ch.benchmark.p25, ch.benchmark.p75) : t.benchNotEnough(n);
  const pct = ch.benchmark.percentile !== null && n !== null && mayShowPercentile(n) ? t.benchPercentile(ch.benchmark.percentile) : null;
  const phase = phaseLabel(ch.phaseLens.phaseId, locale);
  const floorChip = typeof ch.phaseLens.floor === "number" ? t.floorChip(phase, ch.phaseLens.floor, ch.phaseLens.floorMet !== false) : t.noFloor(phase);
  return (
    <div data-tbr-chapter-header={ch.dim} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line-subtle bg-surface-sunken p-4 print:break-inside-avoid">
      <p className="flex items-baseline gap-1">
        <span data-tbr-score={ch.dim} className={cn("text-4xl font-bold leading-none text-primary", FIGURE_CLASS)}>
          {pending ? "—" : ch.score}
        </span>
        <span className={cn("text-sm text-muted", FIGURE_CLASS)}>/ 100</span>
      </p>
      <BandChip band={pending ? "pending" : ch.band} locale={locale} />
      <p className={cn("min-w-0 flex-1 text-xs text-secondary", FIGURE_CLASS)} data-tbr-benchmark-line={ch.dim}>
        {benchLine}
        {pct ? ` · ${pct}` : ""}
      </p>
      <span data-tbr-floor-chip={ch.dim} className={cn("rounded-md border px-1.5 py-0.5 text-xs", FIGURE_CLASS, ch.phaseLens.floorMet === false ? "border-bear text-primary" : "border-line-subtle text-secondary")}>
        {floorChip}
      </span>
    </div>
  );
}

/** Slot 3 — evidence used: ≤ 5 rows, no ids, footnote number when the text cites the row. */
function EvidenceUsed({ ch, locale, citations }: { ch: DimensionChapter; locale: TbrUiLocale; citations?: CitationIndex }) {
  const t = v3Strings(locale);
  const s43 = getTbrS43Strings(locale);
  const rows = evidenceRowsView(ch.evidence, locale);
  const shown = rows.slice(0, 5);
  const more = rows.length - shown.length;
  return (
    <div data-tbr-evidence-used={ch.dim} className="rounded-lg border border-line-subtle p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t.evidenceUsed}</p>
      {shown.length === 0 ? (
        <p className="mt-1 text-xs text-secondary">
          {s43.noEvidence}{" "}
          <a href="/workspace/evidence" className="font-semibold text-action hover:underline">
            {s43.noEvidenceCta}
          </a>
        </p>
      ) : (
        <ul className="mt-1.5 space-y-1.5 text-xs">
          {shown.map((e) => {
            const raw = ch.evidence.find((r) => r.evidence_id === e.evidence_id);
            const n = citations?.peek(e.evidence_id)?.n ?? null;
            const rung = raw?.confidence ? (s43.evidenceLevel[raw.confidence] ?? raw.confidence) : null;
            return (
              <li key={e.evidence_id} data-tbr-evidence-row={e.cta ? "cta" : e.status} className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                {e.cta ? (
                  <CtaLink row={e} locale={locale} />
                ) : (
                  <>
                    <span className="text-primary">{e.label}</span>
                    {n !== null ? <sup className={cn("text-[0.7em] font-semibold text-action", FIGURE_CLASS)}>{n}</sup> : null}
                    <span className="text-muted">
                      · {e.source}
                      {rung ? ` · ${rung}` : ""} · {e.statusLabel}
                    </span>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {more > 0 ? (
        <p className="mt-1.5 text-xs text-muted">
          <a href={`#${TBR_V2_SECTION_IDS.appendix}`} className="underline-offset-2 hover:underline">
            {t.moreInRegister(more)}
          </a>
        </p>
      ) : null}
    </div>
  );
}

/** Slot 7 — what to improve: nextAction first, then criteria next actions, then evidence CTAs; ≤ 3, de-duplicated. */
function WhatToImprove({ ch, locale, citations }: { ch: DimensionChapter; locale: TbrUiLocale; citations?: CitationIndex }) {
  const t = v3Strings(locale);
  const seen = new Set<string>();
  const rows: Array<{ key: string; title: string; lift: number; window: DimensionChapter["nextAction"]["window"]; evidence: string | null; href?: string }> = [];
  const push = (r: (typeof rows)[number]) => {
    const k = normBullet(r.title);
    if (!k || seen.has(k) || rows.length >= 3) return;
    seen.add(k);
    rows.push(r);
  };
  const na = nextActionView(ch, locale);
  push({ key: "next", title: ch.nextAction.title, lift: ch.nextAction.expectedLift, window: ch.nextAction.window, evidence: na.evidence });
  for (const c of ch.criteria) if (c.nextAction.trim()) push({ key: `c-${c.key}`, title: c.nextAction, lift: derivedLift(ch.weight, c.score), window: "30d", evidence: null });
  for (const r of chapterCtaRows(ch, locale)) push({ key: r.evidence_id, title: r.cta!.label, lift: Number((r.cta!.liftLabel.match(/\d+/) ?? ["0"])[0]), window: "this_week", evidence: r.source, href: r.cta!.href });
  return (
    <div data-tbr-improve={ch.dim} className="rounded-r-lg border-l-4 border-warn bg-surface-sunken px-3 py-3 print:break-inside-avoid">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-secondary">
        <span aria-hidden="true">▸</span>
        {t.whatToImprove}
      </p>
      <ul className="mt-1.5 space-y-2 text-sm">
        {rows.map((r, i) => (
          <li key={r.key} data-tbr-next-action={i === 0 ? ch.dim : undefined} className="space-y-0.5">
            <p className="text-primary">
              {r.href ? (
                <a href={r.href} className="font-medium text-action underline-offset-2 hover:underline">
                  <CitedText text={r.title} citations={citations} locale={locale} /> →
                </a>
              ) : (
                <CitedText text={r.title} citations={citations} locale={locale} />
              )}
            </p>
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
              {r.lift > 0 ? <Chip kind="lift">{t.lift(r.lift)}</Chip> : null}
              <WindowChip window={r.window} locale={locale} />
              {r.evidence ? <span>{t.thEvidence.toLowerCase()}: {r.evidence}</span> : null}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Slot 6 — criteria mini-table (+ full cards on the paid view). */
function CriteriaBlock({ ch, locale, citations, paid }: { ch: DimensionChapter; locale: TbrUiLocale; citations?: CitationIndex; paid: boolean }) {
  const t = v3Strings(locale);
  const tc = getTbrStrings(locale).v2.chapter;
  const s44 = getTbrStrings(locale).v2.s44;
  const modes = cardRenderModes(ch);
  const owningChapter = (key: string): { id: string; title: string } | null => {
    const dim = CRITERIA.find((d) => d.key === key)?.primaryDimension;
    if (!dim || dim === ch.dim || !(dim in DIMENSION_OWNERS)) return null;
    const owner = DIMENSION_OWNERS[dim as keyof typeof DIMENSION_OWNERS];
    return { id: TBR_V2_SECTION_IDS.dim(dim), title: locale === "vi" ? owner.titleVi : owner.title };
  };
  return (
    <div data-tbr-criteria={ch.dim} className="space-y-3">
      <div className={TABLE_SCROLL_CLASS}>
        <table className="w-full min-w-[520px] text-sm">
          <caption className="sr-only">{t.criteria}</caption>
          <thead>
            <tr className="bg-surface">
              <th scope="col" className={cn(TH_CLASS, STICKY_COL_CLASS)}>
                {t.thCriterion}
              </th>
              <th scope="col" className={cn(TH_CLASS, "text-right")}>
                {t.thScore}
              </th>
              <th scope="col" className={TH_CLASS}>
                {t.thQuality}
              </th>
              <th scope="col" className={cn(TH_CLASS, "min-w-[260px]")}>
                {t.thVerdict}
              </th>
            </tr>
          </thead>
          <tbody>
            {ch.criteria.map((c, i) => {
              const compact = modes.get(c.key) === "compact";
              const owner = compact ? owningChapter(c.key) : null;
              return (
                <tr key={c.key} data-tbr-card={c.key} data-tbr-card-mode={compact ? "compact" : "full"} className={zebraRow(i)}>
                  <td className={cn(TD_CLASS, STICKY_COL_CLASS, "font-medium", i % 2 === 1 && "bg-surface-sunken")}>
                    {c.title}
                    {owner ? (
                      <a href={`#${owner.id}`} className="ml-1 text-xs font-normal text-action underline-offset-2 hover:underline">
                        {s44.fullCardIn(owner.title)}
                      </a>
                    ) : null}
                  </td>
                  <td className={cn(TD_CLASS, "text-right font-semibold", FIGURE_CLASS)}>{c.score}</td>
                  <td className={TD_CLASS}>
                    <Chip kind="band">{qualityLabel(c.quality, locale)}</Chip>
                  </td>
                  <td className={cn(TD_CLASS, "text-secondary")}>
                    <CitedText text={words(stripCitationMarkers(c.verdict), 20)} citations={citations} locale={locale} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {paid ? (
        <div className="grid gap-3 md:grid-cols-2">
          {ch.criteria
            .filter((c) => modes.get(c.key) !== "compact")
            .map((c) => (
              <div key={c.key} data-tbr-card-full={c.key} className="rounded-lg border border-line-subtle p-3 print:break-inside-avoid">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-primary">{c.title}</p>
                  <span className={cn("text-sm font-bold text-primary", FIGURE_CLASS)}>{c.score}</span>
                </div>
                <Prose text={c.verdict} size="xs" className="mt-1" citations={citations} locale={locale} />
                {(c.strengths.length > 0 || c.gaps.length > 0) && (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <Bullets title={tc.strengths} tone="good" items={c.strengths.slice(0, 3)} citations={citations} locale={locale} />
                    <Bullets title={tc.gaps} tone="bad" items={c.gaps.slice(0, 3)} citations={citations} locale={locale} />
                  </div>
                )}
                {c.nextAction && (
                  <p className="mt-2 text-xs text-action">
                    {tc.next}: <CitedText text={c.nextAction} citations={citations} locale={locale} />
                  </p>
                )}
                <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  <Chip kind="support">{c.agent}</Chip>
                  <span>{c.grounded ? tc.grounded : tc.uncited}</span>
                </p>
              </div>
            ))}
        </div>
      ) : (
        <p className="text-xs text-muted">{t.fullCardsPaid}</p>
      )}
    </div>
  );
}

/** Slot 5 — risks / gaps with the unverified chip on uncited material claims. */
function GapList({ ch, locale, citations }: { ch: DimensionChapter; locale: TbrUiLocale; citations?: CitationIndex }) {
  const t = v3Strings(locale);
  const ids = ch.evidence.map((e) => e.evidence_id);
  const gaps = chapterGaps(ch).slice(0, 3);
  if (!gaps.length) return null;
  return (
    <div data-tbr-gaps={ch.dim} className="rounded-r-lg border-l-4 border-bear bg-surface-sunken px-3 py-3 print:break-inside-avoid">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-secondary">
        <span aria-hidden="true">▲</span>
        {t.risksGaps}
      </p>
      <ul className="mt-1.5 space-y-1 text-sm text-primary">
        {gaps.map((g, i) => {
          const unverified = isMaterialClaim(g) && !hasCitationOrMarker(g, ids);
          return (
            <li key={i} className="flex gap-1.5">
              <span aria-hidden="true" className="text-bear">
                ▲
              </span>
              <span>
                <CitedText text={words(g, 25)} citations={citations} locale={locale} />
                {unverified ? (
                  <>
                    {" "}
                    <span title={t.unverifiedNote}>
                      <UnverifiedChip locale={locale} />
                    </span>
                  </>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export interface TbrChapterProps {
  chapter: DimensionChapter;
  /** Section number in the v3 order (chapters are 5–12). */
  index: number;
  locale?: TbrUiLocale;
  /** G19-S41: cover verification level, for the "× verification L2" ledger row. */
  verificationLevel?: number | null;
  upgradeHref?: string;
  /** G16-B: render the free-tier cut as a LOCKED preview (first sentence + skeleton). Only for `renderAs: "card"` chapters. */
  locked?: boolean;
  /** G16-B: plan-included / purchased readers see a free document's card chapters in full. */
  forceFull?: boolean;
  /** G24-A: the document's footnote numbering (built once in report.tsx). */
  citations?: CitationIndex;
  /** G27: the deterministic investor takeaway line (`investmentView.takeaways[dim]`). */
  takeaway: string;
  /** G27: the server benchmark n for this dimension (P1-C), when the page loaded one. */
  benchmarkN?: number | null;
  /** Paid / plan-included / share views show the full criterion cards. */
  paid?: boolean;
}

export function TbrChapter({ chapter, index, locale = "en", verificationLevel, upgradeHref = "/pricing", locked = false, forceFull = false, citations, takeaway, benchmarkN = null, paid = true }: TbrChapterProps) {
  const ch = chapter;
  const id = TBR_V2_SECTION_IDS.dim(ch.dim);
  const t = v3Strings(locale);
  const tc = getTbrStrings(locale).v2.chapter;
  const title = locale === "vi" ? ch.titleVi : ch.title;
  const dimNo = DIM_ORDER.indexOf(ch.dim) + 1;
  const kicker = `${index} · ${t.dimKicker(dimNo, ch.weight)}`;
  const pending = !isAssessed(ch) || ch.band === "pending";
  const header = <ChapterHeader ch={ch} locale={locale} benchmarkN={benchmarkN} />;
  const takeawayBlock = (
    <Callout kind="takeaway" title={t.takeawayTitle} testId={`tbr-takeaway-${ch.dim}`}>
      <span data-tbr-takeaway={ch.dim}>{takeaway}</span>
    </Callout>
  );
  const primary = (compact: boolean) => (
    <div data-tbr-primary={ch.dim} className={cn("min-w-0 rounded-xl border border-line-subtle p-3 print:break-inside-avoid", compact && "md:max-w-[320px]")}>
      <VisualFigure spec={ch.primaryVisual} caption={`${ch.primaryVisual.title} · ${stateLabel(ch.primaryVisual.dataState, locale)}${ch.primaryVisual.subtitle ? ` — ${ch.primaryVisual.subtitle}` : ""}`} />
    </div>
  );

  // G16-B: the locked preview (free + buy) — no live chart inside.
  if (ch.renderAs === "card" && locked) {
    return (
      <TbrSection id={id} kicker={kicker} title={title} pageBreak>
        {header}
        <TbrLockedChapterPreview chapter={ch} locale={locale} />
        {takeawayBlock}
      </TbrSection>
    );
  }

  // Free tier compact card (chapters 5–8): score · band · verdict ≤ 40 words · takeaway.
  if (ch.renderAs === "card" && !forceFull) {
    return (
      <TbrSection id={id} kicker={kicker} title={title} pageBreak>
        {header}
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-3">
            <Prose text={words(ch.verdict, 40)} testId={`tbr-verdict-${ch.dim}`} citations={citations} locale={locale} />
            {takeawayBlock}
            <p className="text-xs text-muted">
              {t.lockedCard}{" "}
              <a href={upgradeHref} className="font-semibold text-action hover:underline">
                {tc.unlockChapter(title)}
              </a>
            </p>
          </div>
          {primary(true)}
        </div>
      </TbrSection>
    );
  }

  // Pending dimension: header + the one honest card + takeaway + ledger.
  if (pending) {
    const ctas = chapterCtaRows(ch, locale);
    return (
      <TbrSection id={id} kicker={kicker} title={title} pageBreak>
        {header}
        <div data-tbr-pending-card={ch.dim} className="rounded-xl border border-dashed border-line p-4 text-sm text-secondary">
          <p>{t.pendingCard}</p>
          {ctas.length > 0 && (
            <>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted">{t.pendingAdd}</p>
              <ul data-tbr-pending-ctas={ch.dim} className="mt-1 flex flex-wrap gap-2">
                {ctas.map((r) => (
                  <li key={r.evidence_id}>
                    <CtaLink row={r} locale={locale} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        {primary(true)}
        {takeawayBlock}
        <details className="text-xs">
          <summary className="cursor-pointer text-secondary">{t.howBuilt}</summary>
          <div className="mt-2">
            <TbrScoreLedger chapter={ch} locale={locale} verificationLevel={verificationLevel} citations={citations} />
          </div>
        </details>
        <AuditStampLine audit={ch.audit} frameworks={ch.frameworks} locale={locale} />
      </TbrSection>
    );
  }

  const founderExecution = founderExecutionFromChapter(ch);
  const strengths = (() => {
    const seen = new Set<string>();
    return [...ch.strengths, ...ch.criteria.flatMap((c) => c.strengths)].filter((s) => {
      const k = normBullet(s);
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  })().slice(0, 3);

  return (
    <TbrSection id={id} kicker={kicker} title={title} pageBreak>
      {header}
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="min-w-0 space-y-4 lg:col-span-8">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{t.verdict}</p>
            <Prose text={words(ch.verdict, 60)} testId={`tbr-verdict-${ch.dim}`} citations={citations} locale={locale} />
          </div>
          {primary(false)}
          {strengths.length > 0 && (
            <div data-tbr-strengths={ch.dim} className="rounded-r-lg border-l-4 border-brand-navy/40 bg-surface-sunken px-3 py-3 print:break-inside-avoid">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-secondary">
                <span aria-hidden="true">✓</span>
                {t.strengths}
              </p>
              <ul className="mt-1.5 space-y-1 text-sm text-primary">
                {strengths.map((s, i) => (
                  <li key={i} className="flex gap-1.5">
                    <span aria-hidden="true" className="text-action">
                      ✓
                    </span>
                    <span>
                      <CitedText text={words(s, 25)} citations={citations} locale={locale} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <GapList ch={ch} locale={locale} citations={citations} />
          {founderExecution && <FounderExecutionCard data={founderExecution} />}
          <CriteriaBlock ch={ch} locale={locale} citations={citations} paid={paid} />
        </div>
        <aside className="min-w-0 space-y-4 lg:col-span-4">
          <EvidenceUsed ch={ch} locale={locale} citations={citations} />
          <WhatToImprove ch={ch} locale={locale} citations={citations} />
          {ch.secondaryVisuals.slice(0, 1).map((v) => (
            <VisualFigure key={v.id} spec={v} caption={`${v.title} · ${stateLabel(v.dataState, locale)}`} className="rounded-lg border border-line-subtle p-2 print:break-inside-avoid" />
          ))}
        </aside>
      </div>
      {takeawayBlock}
      <details className="text-xs">
        <summary className="cursor-pointer text-secondary">{t.howBuilt}</summary>
        <div className="mt-2">
          <TbrScoreLedger chapter={ch} locale={locale} verificationLevel={verificationLevel} citations={citations} />
        </div>
      </details>
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <AgentBadge role={ch.ownerAgent} />
        {ch.supportingAgents.slice(0, 2).map((r) => (
          <AgentBadge key={r} role={r} kind="support" />
        ))}
      </p>
      <AuditStampLine audit={ch.audit} frameworks={ch.frameworks} locale={locale} />
    </TbrSection>
  );
}
