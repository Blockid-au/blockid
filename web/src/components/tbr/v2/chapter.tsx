// Chapters 2–9 — one dimension chapter, the fixed skeleton from spec §A.1:
// header (owner, score ONCE, band, stage percentile, phase-floor chip) →
// primary visual → verdict → evidence table → criterion cards (their own
// scores) → chapter-level strengths / gaps only when they add to the cards →
// next action → auditor stamp. G19-S44: the per-chapter phase-lens sentence
// moved to one row in Phase Gates; the chip here is the one-word summary. `renderAs: "card"` (free tier, chapters 6–9) collapses to
// score + band + one gap + upgrade CTA — with the primary visual kept
// compact so every chapter still carries one `svg[role=img]`.

import { getTbrS43Strings, getTbrStrings } from "@/lib/i18n/tbr-strings";
import { VisualFigure } from "@/lib/report-visuals/react";
import { chapterCtaRows, emptyEvidenceLine, evidenceRowsView, nextActionView, pendingCtasHeading, type EvidenceRowView } from "@/lib/report-v2/evidence-view";
import { isUnassessed, ledgerRowsFor, pendingLine } from "@/lib/report-v2/ledger-rows";
import { cardRenderModes } from "@/lib/report-v2/card-modes";
import { CRITERIA } from "@/lib/evaluation-criteria";
import { DIMENSION_OWNERS } from "@/lib/report-pipeline/dimension-owners";
import type { DimensionChapter } from "@/lib/report-v2/schema";
import { mayShowPercentile } from "@/lib/benchmarks/publication-rules";
import { cn } from "@/lib/utils";
import { AgentBadge, AuditStampLine, Bullets, Chip, CitedText, Prose, TABLE_CLASS, TBR_V2_SECTION_IDS, THEAD_CLASS, TbrSection, WindowChip, bandLabel, bandSurface, bandText, phaseLabel, stateLabel, v2Strings, zebraRow, type TbrUiLocale } from "./shared";
import type { CitationIndex } from "@/lib/report-v2/citations";
import { FounderExecutionCard, founderExecutionFromChapter } from "./founder-execution-card";
import { TbrLockedChapterPreview } from "./locked-preview";

/** G19-S43 — one CTA: "<label> · Add now → · +N SVI" linking the internal page where the input is added. */
export function CtaLink({ row, locale = "en" }: { row: EvidenceRowView; locale?: TbrUiLocale }) {
  const t = getTbrS43Strings(locale);
  if (!row.cta) return null;
  return (
    <span data-tbr-cta className="inline-flex flex-wrap items-center gap-1.5">
      <span className="text-secondary">{row.cta.label}</span>
      <a href={row.cta.href} className="rounded-md border border-brand-300 dark:border-brand-800 bg-surface-sunken px-1.5 py-0.5 text-xs font-semibold text-action hover:bg-surface-sunken">
        {t.addNow}
      </a>
      {row.cta.liftLabel ? <span className="rounded-full border border-line-subtle px-1.5 py-0.5 text-xs tabular-nums text-muted">{row.cta.liftLabel}</span> : null}
    </span>
  );
}

/** G19-S43 — the chapter evidence table: real rows, then every missing input as a linked CTA row; never the bare "No evidence rows…" text when a CTA exists. */
export function TbrEvidenceTable({ chapter, locale = "en" }: { chapter: DimensionChapter; locale?: TbrUiLocale }) {
  const t = getTbrStrings(locale).v2.chapter;
  const rows = evidenceRowsView(chapter.evidence, locale);
  const empty = emptyEvidenceLine(locale);
  return (
    <div className="overflow-x-auto rounded-lg border border-line-subtle">
      <table className={TABLE_CLASS}>
        <caption className="px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">{t.evidence}</caption>
        {rows.length > 0 ? (
          <tbody>
            {rows.map((e, i) => (
              <tr key={e.evidence_id} data-tbr-evidence-row={e.cta ? "cta" : e.status} className={zebraRow(i)}>
                <td className="px-3 py-1 font-mono text-xs text-muted">{e.evidence_id}</td>
                <td className="px-3 py-1 text-secondary">{e.cta ? <CtaLink row={e} locale={locale} /> : e.label}</td>
                <td className="px-3 py-1">
                  <Chip kind="source">{e.source}</Chip>
                </td>
                <td className="px-3 py-1 text-muted">{e.statusLabel}</td>
                <td className="px-3 py-1 text-muted">{e.observedAt}</td>
              </tr>
            ))}
          </tbody>
        ) : (
          <tbody>
            <tr className="border-t border-line-subtle">
              <td className="px-3 py-2 text-muted">
                {empty.text}{" "}
                <a href={empty.href} className="font-semibold text-action hover:underline">
                  {empty.ctaLabel}
                </a>
              </td>
            </tr>
          </tbody>
        )}
      </table>
    </div>
  );
}

/**
 * G19-S41 — "How this score was built": base → each signal ± points (source
 * chip) → = score → × weight × confidence (× verification) → = adjustment.
 * An unassessed chapter shows one honest pending line instead; `scoreNote`
 * (owner reconciliation / chart provenance) is shown whenever present.
 */
export function TbrScoreLedger({ chapter, locale = "en", verificationLevel, citations }: { chapter: DimensionChapter; locale?: TbrUiLocale; verificationLevel?: number | null; citations?: CitationIndex }) {
  const t = getTbrStrings(locale).ledger;
  const ch = chapter;
  if (!ch.scoreBreakdown) return null;
  // The ledger rows carry EN / VI labels; ES / JA read the English rows.
  const rowLocale: "en" | "vi" = locale === "vi" ? "vi" : "en";
  const rows = ledgerRowsFor(ch, rowLocale, verificationLevel);
  const unassessed = isUnassessed(ch);
  const pending = unassessed ? pendingLine(ch, rowLocale) : null;
  // G19-S43: a pending chapter links the same CTAs its evidence table shows.
  const pendingCtas = unassessed ? chapterCtaRows(ch, locale) : [];
  return (
    <div data-tbr-ledger={ch.dim} data-tbr-ledger-state={unassessed ? "pending" : "assessed"} className="overflow-x-auto rounded-lg border border-line-subtle print:break-inside-avoid">
      <table className={TABLE_CLASS}>
        <caption className="px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">{t.title}</caption>
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
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{pendingCtasHeading(locale)}</p>
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
                  <td className={cn("px-3 py-1 text-right tabular-nums", r.points.startsWith("−") ? "text-bear" : "text-secondary")}>{r.points}</td>
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

/** G19-S47: the criterion quality level as a label, never the raw enum ("exceptional" → "Exceptional" / VI). */
function qualityLabel(quality: string, locale: TbrUiLocale): string {
  const table = getTbrStrings(locale).v2.s47.quality;
  return (table as Record<string, string>)[quality] ?? quality;
}

/** Whitespace / trailing-punctuation-insensitive key for bullet dedupe. */
function normBullet(text: string): string {
  return text.trim().toLowerCase().replace(/[.;:,\s]+$/u, "");
}

export interface TbrChapterProps {
  chapter: DimensionChapter;
  index: number;
  locale?: TbrUiLocale;
  /** G19-S41: cover verification level, for the "× verification L2" ledger row. */
  verificationLevel?: number | null;
  upgradeHref?: string;
  /**
   * G16-B: render the free-tier cut as a LOCKED preview (title, first
   * sentence, skeleton visual) instead of the summary card. Only meaningful
   * for `renderAs: "card"` chapters; a full chapter ignores it.
   */
  locked?: boolean;
  /** G16-B: plan-included / purchased readers see a free document's card chapters in full. */
  forceFull?: boolean;
  /** G24-A: the document's footnote numbering (built once in report.tsx); absent → markers are stripped. */
  citations?: CitationIndex;
}

export function TbrChapter({ chapter, index, locale = "en", verificationLevel, upgradeHref = "/pricing", locked = false, forceFull = false, citations }: TbrChapterProps) {
  const ch = chapter;
  const id = TBR_V2_SECTION_IDS.dim(ch.dim);
  const t = getTbrStrings(locale).v2.chapter;
  const s = getTbrStrings(locale).v2.s44;
  const title = locale === "vi" ? ch.titleVi : ch.title;
  // G19-S44: the chapter-level bullets are shown only where they add to the
  // criterion cards (the adapter flattens card bullets into them — one copy).
  const cardText = new Set(ch.criteria.flatMap((c) => [...c.strengths, ...c.gaps]).map(normBullet));
  const extraStrengths = ch.strengths.filter((x) => !cardText.has(normBullet(x)));
  const extraGaps = ch.gaps.filter((x) => !cardText.has(normBullet(x)));
  const floorChip = typeof ch.phaseLens.floor === "number" ? (ch.phaseLens.floorMet ? s.floorMet(ch.phaseLens.floor) : s.floorNotMet(ch.phaseLens.floor)) : s.noFloor;
  // G19-S44: a card borrowed from another chapter renders compact here (one full copy per document).
  const cardModes = cardRenderModes(ch);
  const owningChapter = (key: string): { id: string; title: string } | null => {
    const dim = CRITERIA.find((d) => d.key === key)?.primaryDimension;
    if (!dim || dim === ch.dim || !(dim in DIMENSION_OWNERS)) return null;
    const owner = DIMENSION_OWNERS[dim as keyof typeof DIMENSION_OWNERS];
    return { id: TBR_V2_SECTION_IDS.dim(dim), title: locale === "vi" ? owner.titleVi : owner.title };
  };
  // G14-S37: the FTV chapter carries the founder execution rubric as a module.
  const founderExecution = founderExecutionFromChapter(ch);
  const header = (
    <div className={cn("flex flex-wrap items-center gap-3 rounded-xl border p-4", bandSurface(ch.band))}>
      <div className="flex items-baseline gap-1">
        <span className={cn("text-4xl font-black tabular-nums tracking-tight", bandText(ch.band))}>{ch.band === "pending" ? "—" : ch.score}</span>
        <span className="text-xs text-muted">{t.per100}</span>
      </div>
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-secondary">
          <span className={cn("font-semibold", bandText(ch.band))}>{bandLabel(ch.band, locale)}</span>
          <span>· {t.weight(ch.weight)}</span>
          <span>· {t.owner}</span>
          <AgentBadge role={ch.ownerAgent} />
          {ch.supportingAgents.slice(0, 3).map((r) => (
            <AgentBadge key={r} role={r} kind="support" />
          ))}
        </div>
        <p className="text-xs text-muted">
          {t.benchmarks(ch.benchmark.p25, ch.benchmark.p50, ch.benchmark.p75)}
          {/* G21 P1 review: a rank only from a published cohort, always with its n (score-governance § 7). */}
          {ch.benchmark.percentile !== null && typeof ch.benchmark.n === "number" && mayShowPercentile(ch.benchmark.n) ? ` · ${t.youPercentile(ch.benchmark.percentile, ch.benchmark.n)}` : ""}
          {" · "}
          <span data-tbr-floor-chip={ch.dim} className={cn("rounded-md border px-1 py-px tabular-nums", ch.phaseLens.floorMet === false ? "border-orange-300 dark:border-orange-800 text-bear" : "border-line-subtle")}>
            {phaseLabel(ch.phaseLens.phaseId, locale)} · {floorChip}
          </span>
        </p>
      </div>
    </div>
  );

  const purpose = v2Strings(locale).s47.purpose.dimension(ch.weight);
  if (ch.renderAs === "card" && locked) {
    return (
      <TbrSection id={id} kicker={String(index)} title={title} purpose={purpose}>
        {header}
        <TbrLockedChapterPreview chapter={ch} locale={locale} />
      </TbrSection>
    );
  }

  if (ch.renderAs === "card" && !forceFull) {
    return (
      <TbrSection id={id} kicker={String(index)} title={title} purpose={purpose}>
        {header}
        <TbrScoreLedger chapter={ch} locale={locale} verificationLevel={verificationLevel} citations={citations} />
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-2">
            <Prose text={ch.verdict} testId={`tbr-verdict-${ch.dim}`} citations={citations} locale={locale} />
            {ch.gaps[0] && (
              <p className="text-xs text-secondary">
                ▲ <CitedText text={ch.gaps[0]} citations={citations} locale={locale} />
              </p>
            )}
            <a href={upgradeHref} className="inline-flex items-center rounded-lg border border-brand-300 dark:border-brand-800 bg-surface-sunken px-3 py-1.5 text-xs font-semibold text-action hover:bg-surface-sunken">
              {t.unlockChapter(title)}
            </a>
          </div>
          <div data-tbr-primary={ch.dim}>
            <VisualFigure spec={ch.primaryVisual} caption={`${ch.primaryVisual.title} · ${stateLabel(ch.primaryVisual.dataState, locale)}`} />
          </div>
        </div>
      </TbrSection>
    );
  }

  return (
    <TbrSection id={id} kicker={String(index)} title={title} purpose={purpose}>
      {header}
      <TbrScoreLedger chapter={ch} locale={locale} verificationLevel={verificationLevel} citations={citations} />
      <div data-tbr-primary={ch.dim} className="rounded-xl border border-line-subtle p-3 print:break-inside-avoid">
        <VisualFigure spec={ch.primaryVisual} caption={`${ch.primaryVisual.title} · ${stateLabel(ch.primaryVisual.dataState, locale)}${ch.primaryVisual.subtitle ? ` — ${ch.primaryVisual.subtitle}` : ""}`} />
      </div>
      <Prose text={ch.verdict} testId={`tbr-verdict-${ch.dim}`} citations={citations} locale={locale} />

      <TbrEvidenceTable chapter={ch} locale={locale} />

      <div className="grid gap-3 md:grid-cols-2">
        {founderExecution && <FounderExecutionCard data={founderExecution} />}
        {ch.criteria.map((c) => {
          const compact = cardModes.get(c.key) === "compact";
          const owner = compact ? owningChapter(c.key) : null;
          return (
          <div key={c.key} data-tbr-card={c.key} data-tbr-card-mode={compact ? "compact" : "full"} className={cn("rounded-lg border p-3 print:break-inside-avoid", compact ? "border-dashed border-line-subtle" : "border-line-subtle")}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-primary">{c.title}</p>
              <span className={cn("text-sm font-bold tabular-nums", bandText(c.score >= 70 ? "strong" : c.score >= 40 ? "developing" : "early"))}>{c.score}</span>
            </div>
            <Prose text={c.verdict} size="xs" className="mt-1" citations={citations} locale={locale} />
            {compact && owner && (
              <p className="mt-1 text-xs">
                <a href={`#${owner.id}`} className="text-action underline-offset-2 hover:underline">
                  {s.fullCardIn(owner.title)}
                </a>
              </p>
            )}
            {!compact && (c.strengths.length > 0 || c.gaps.length > 0) && (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <Bullets title={t.strengths} tone="good" items={c.strengths.slice(0, 3)} citations={citations} locale={locale} />
                <Bullets title={t.gaps} tone="bad" items={c.gaps.slice(0, 3)} citations={citations} locale={locale} />
              </div>
            )}
            {!compact && c.nextAction && (
              <p className="mt-2 text-xs text-action">
                {t.next}: <CitedText text={c.nextAction} citations={citations} locale={locale} />
              </p>
            )}
            <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted">
              <Chip kind="band">{qualityLabel(c.quality, locale)}</Chip>
              <Chip kind="support">{c.agent}</Chip>
              <span>{c.grounded ? t.grounded : t.uncited}</span>
            </p>
          </div>
          );
        })}
      </div>

      {(extraStrengths.length > 0 || extraGaps.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Bullets title={t.strengths} tone="good" items={extraStrengths} citations={citations} locale={locale} />
          <Bullets title={t.gaps} tone="bad" items={extraGaps} citations={citations} locale={locale} />
        </div>
      )}
      <div className="rounded-lg border border-brand-300 dark:border-brand-800 bg-surface-sunken px-3 py-2 text-xs">
        <p className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-action">
          <span>{t.nextAction(t.window[ch.nextAction.window])}</span>
          <WindowChip window={ch.nextAction.window} locale={locale} />
        </p>
        {(() => {
          // G19-S43: the catalogue label ("Stripe (revenue)"), never the raw enum "stripe".
          const v = nextActionView(ch, locale);
          return (
            <p data-tbr-next-action={ch.dim} className="text-primary">
              <CitedText text={ch.nextAction.title} citations={citations} locale={locale} /> — {t.expectedLift(ch.nextAction.expectedLift)}
              {v.evidence ? ` · ${t.evidenceToAdd(v.evidence)}` : ""}
            </p>
          );
        })()}
      </div>
      {ch.secondaryVisuals.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 print:break-inside-avoid">
          {ch.secondaryVisuals.map((v) => (
            <VisualFigure key={v.id} spec={v} caption={`${v.title} · ${stateLabel(v.dataState, locale)}`} className="rounded-lg border border-line-subtle p-2" />
          ))}
        </div>
      )}
      <AuditStampLine audit={ch.audit} frameworks={ch.frameworks} locale={locale} />
    </TbrSection>
  );
}
