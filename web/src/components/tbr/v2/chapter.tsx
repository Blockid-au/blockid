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
import { cn } from "@/lib/utils";
import { AgentBadge, AuditStampLine, Bullets, TBR_V2_SECTION_IDS, TbrSection, bandLabel, bandSurface, bandText, phaseLabel, stateLabel, type TbrUiLocale } from "./shared";
import { FounderExecutionCard, founderExecutionFromChapter } from "./founder-execution-card";
import { TbrLockedChapterPreview } from "./locked-preview";

/** G19-S43 — one CTA: "<label> · Add now → · +N SVI" linking the internal page where the input is added. */
export function CtaLink({ row, locale = "en" }: { row: EvidenceRowView; locale?: TbrUiLocale }) {
  const t = getTbrS43Strings(locale);
  if (!row.cta) return null;
  return (
    <span data-tbr-cta className="inline-flex flex-wrap items-center gap-1.5">
      <span className="text-ink-700 dark:text-ink-200">{row.cta.label}</span>
      <a href={row.cta.href} className="rounded-md border border-brand-300 bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700 hover:bg-brand-100 dark:border-brand-700 dark:bg-brand-950/40 dark:text-brand-300">
        {t.addNow}
      </a>
      {row.cta.liftLabel ? <span className="rounded-full border border-ink-200 px-1.5 py-0.5 text-[10px] tabular-nums text-ink-500 dark:border-ink-700 dark:text-ink-400">{row.cta.liftLabel}</span> : null}
    </span>
  );
}

/** G19-S43 — the chapter evidence table: real rows, then every missing input as a linked CTA row; never the bare "No evidence rows…" text when a CTA exists. */
export function TbrEvidenceTable({ chapter, locale = "en" }: { chapter: DimensionChapter; locale?: TbrUiLocale }) {
  const t = getTbrStrings(locale).v2.chapter;
  const rows = evidenceRowsView(chapter.evidence, locale);
  const empty = emptyEvidenceLine(locale);
  return (
    <div className="rounded-lg border border-ink-200 dark:border-ink-800">
      <table className="w-full text-xs">
        <caption className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-ink-500">{t.evidence}</caption>
        {rows.length > 0 ? (
          <tbody>
            {rows.map((e) => (
              <tr key={e.evidence_id} data-tbr-evidence-row={e.cta ? "cta" : e.status} className="border-t border-ink-100 dark:border-ink-800/60">
                <td className="px-3 py-1 font-mono text-[10px] text-ink-400">{e.evidence_id}</td>
                <td className="px-3 py-1 text-ink-700 dark:text-ink-200">{e.cta ? <CtaLink row={e} locale={locale} /> : e.label}</td>
                <td className="px-3 py-1 text-ink-500">{e.source}</td>
                <td className="px-3 py-1 text-ink-500">{e.statusLabel}</td>
                <td className="px-3 py-1 text-ink-500">{e.observedAt}</td>
              </tr>
            ))}
          </tbody>
        ) : (
          <tbody>
            <tr className="border-t border-ink-100 dark:border-ink-800/60">
              <td className="px-3 py-2 text-ink-500 dark:text-ink-400">
                {empty.text}{" "}
                <a href={empty.href} className="font-semibold text-brand-700 hover:underline dark:text-brand-300">
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
export function TbrScoreLedger({ chapter, locale = "en", verificationLevel }: { chapter: DimensionChapter; locale?: TbrUiLocale; verificationLevel?: number | null }) {
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
    <div data-tbr-ledger={ch.dim} data-tbr-ledger-state={unassessed ? "pending" : "assessed"} className="rounded-lg border border-ink-200 dark:border-ink-800 print:break-inside-avoid">
      <table className="w-full text-xs">
        <caption className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-ink-500">{t.title}</caption>
        {pending ? (
          <tbody>
            <tr className="border-t border-ink-100 dark:border-ink-800/60">
              <td colSpan={3} className="px-3 py-2 text-ink-600 dark:text-ink-300">
                {pending.text}
                {pendingCtas.length === 0 && pending.add ? <span className="ml-1 text-ink-500 dark:text-ink-400">{pending.add}</span> : null}
              </td>
            </tr>
            {pendingCtas.length > 0 && (
              <tr className="border-t border-ink-100 dark:border-ink-800/60">
                <td colSpan={3} className="px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">{pendingCtasHeading(locale)}</p>
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
            <thead>
              <tr className="border-t border-ink-100 text-left text-[10px] uppercase tracking-wide text-ink-400 dark:border-ink-800/60">
                <th className="px-3 py-1 font-medium">{t.thSignal}</th>
                <th className="px-3 py-1 text-right font-medium">{t.thPoints}</th>
                <th className="px-3 py-1 font-medium">{t.thSource}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={cn("border-t border-ink-100 dark:border-ink-800/60", r.kind !== "signal" && "bg-ink-50/60 dark:bg-ink-900/40")}>
                  <td className={cn("px-3 py-1 text-ink-700 dark:text-ink-200", r.kind !== "signal" && "font-medium")}>
                    {r.label}
                    {r.adjustmentScale ? <span className="ml-1 text-[10px] text-ink-400">({t.adjustmentScale})</span> : null}
                  </td>
                  <td className={cn("px-3 py-1 text-right tabular-nums", r.points.startsWith("−") ? "text-red-700 dark:text-red-300" : "text-ink-700 dark:text-ink-200")}>{r.points}</td>
                  <td className="px-3 py-1">
                    {r.source ? <span className="rounded-full border border-ink-200 px-1.5 py-0.5 text-[10px] text-ink-500 dark:border-ink-700 dark:text-ink-400">{r.source}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </>
        )}
      </table>
      {ch.scoreNote ? (
        <p data-tbr-score-note={ch.dim} className="border-t border-ink-100 px-3 py-1.5 text-[11px] text-ink-500 dark:border-ink-800/60 dark:text-ink-400">
          <span className="font-semibold">{t.scoreNote}:</span> {ch.scoreNote}
        </p>
      ) : null}
    </div>
  );
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
}

export function TbrChapter({ chapter, index, locale = "en", verificationLevel, upgradeHref = "/pricing", locked = false, forceFull = false }: TbrChapterProps) {
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
        <span className="text-xs text-ink-500">{t.per100}</span>
      </div>
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-600 dark:text-ink-300">
          <span className={cn("font-semibold", bandText(ch.band))}>{bandLabel(ch.band, locale)}</span>
          <span>· {t.weight(ch.weight)}</span>
          <span>· {t.owner}</span>
          <AgentBadge role={ch.ownerAgent} />
          {ch.supportingAgents.slice(0, 3).map((r) => (
            <AgentBadge key={r} role={r} kind="support" />
          ))}
        </div>
        <p className="text-[11px] text-ink-500 dark:text-ink-400">
          {t.benchmarks(ch.benchmark.p25, ch.benchmark.p50, ch.benchmark.p75)}
          {ch.benchmark.percentile !== null ? ` · ${t.youPercentile(ch.benchmark.percentile)}` : ""}
          {" · "}
          <span data-tbr-floor-chip={ch.dim} className={cn("rounded-md border px-1 py-px tabular-nums", ch.phaseLens.floorMet === false ? "border-orange-200 text-orange-700 dark:border-orange-900 dark:text-orange-300" : "border-ink-200 dark:border-ink-700")}>
            {phaseLabel(ch.phaseLens.phaseId, locale)} · {floorChip}
          </span>
        </p>
      </div>
    </div>
  );

  if (ch.renderAs === "card" && locked) {
    return (
      <TbrSection id={id} kicker={String(index)} title={title}>
        {header}
        <TbrLockedChapterPreview chapter={ch} locale={locale} />
      </TbrSection>
    );
  }

  if (ch.renderAs === "card" && !forceFull) {
    return (
      <TbrSection id={id} kicker={String(index)} title={title}>
        {header}
        <TbrScoreLedger chapter={ch} locale={locale} verificationLevel={verificationLevel} />
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-2">
            <p className="text-sm text-ink-700 dark:text-ink-200">{ch.verdict}</p>
            {ch.gaps[0] && <p className="text-xs text-ink-600 dark:text-ink-300">▲ {ch.gaps[0]}</p>}
            <a href={upgradeHref} className="inline-flex items-center rounded-lg border border-brand-300 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100 dark:border-brand-700 dark:bg-brand-950/40 dark:text-brand-300">
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
    <TbrSection id={id} kicker={String(index)} title={title}>
      {header}
      <TbrScoreLedger chapter={ch} locale={locale} verificationLevel={verificationLevel} />
      <div data-tbr-primary={ch.dim} className="rounded-xl border border-ink-200 p-3 dark:border-ink-800 print:break-inside-avoid">
        <VisualFigure spec={ch.primaryVisual} caption={`${ch.primaryVisual.title} · ${stateLabel(ch.primaryVisual.dataState, locale)}${ch.primaryVisual.subtitle ? ` — ${ch.primaryVisual.subtitle}` : ""}`} />
      </div>
      <p className="text-sm leading-relaxed text-ink-800 dark:text-ink-200">{ch.verdict}</p>

      <TbrEvidenceTable chapter={ch} locale={locale} />

      <div className="grid gap-3 md:grid-cols-2">
        {founderExecution && <FounderExecutionCard data={founderExecution} />}
        {ch.criteria.map((c) => {
          const compact = cardModes.get(c.key) === "compact";
          const owner = compact ? owningChapter(c.key) : null;
          return (
          <div key={c.key} data-tbr-card={c.key} data-tbr-card-mode={compact ? "compact" : "full"} className={cn("rounded-lg border p-3 print:break-inside-avoid", compact ? "border-dashed border-ink-200 dark:border-ink-800" : "border-ink-200 dark:border-ink-800")}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-ink-800 dark:text-ink-100">{c.title}</p>
              <span className={cn("text-sm font-bold tabular-nums", bandText(c.score >= 70 ? "strong" : c.score >= 40 ? "developing" : "early"))}>{c.score}</span>
            </div>
            <p className="mt-1 text-xs text-ink-600 dark:text-ink-300">{c.verdict}</p>
            {compact && owner && (
              <p className="mt-1 text-[11px]">
                <a href={`#${owner.id}`} className="text-brand-700 underline-offset-2 hover:underline dark:text-brand-300">
                  {s.fullCardIn(owner.title)}
                </a>
              </p>
            )}
            {!compact && (c.strengths.length > 0 || c.gaps.length > 0) && (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <Bullets title={t.strengths} tone="good" items={c.strengths.slice(0, 3)} />
                <Bullets title={t.gaps} tone="bad" items={c.gaps.slice(0, 3)} />
              </div>
            )}
            {!compact && c.nextAction && <p className="mt-2 text-[11px] text-brand-700 dark:text-brand-300">{t.next}: {c.nextAction}</p>}
            <p className="mt-1 text-[10px] text-ink-400">
              {c.quality} · {c.agent.toUpperCase()} · {c.grounded ? t.grounded : t.uncited}
            </p>
          </div>
          );
        })}
      </div>

      {(extraStrengths.length > 0 || extraGaps.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Bullets title={t.strengths} tone="good" items={extraStrengths} />
          <Bullets title={t.gaps} tone="bad" items={extraGaps} />
        </div>
      )}
      <div className="rounded-lg border border-brand-200/70 bg-brand-50/50 px-3 py-2 text-xs dark:border-brand-900/60 dark:bg-brand-950/20">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">{t.nextAction(t.window[ch.nextAction.window])}</p>
        {(() => {
          // G19-S43: the catalogue label ("Stripe (revenue)"), never the raw enum "stripe".
          const v = nextActionView(ch, locale);
          return (
            <p data-tbr-next-action={ch.dim} className="text-ink-800 dark:text-ink-100">
              {ch.nextAction.title} — {t.expectedLift(ch.nextAction.expectedLift)}
              {v.evidence ? ` · ${t.evidenceToAdd(v.evidence)}` : ""}
            </p>
          );
        })()}
      </div>
      {ch.secondaryVisuals.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 print:break-inside-avoid">
          {ch.secondaryVisuals.map((v) => (
            <VisualFigure key={v.id} spec={v} caption={`${v.title} · ${stateLabel(v.dataState, locale)}`} className="rounded-lg border border-ink-200 p-2 dark:border-ink-800" />
          ))}
        </div>
      )}
      <AuditStampLine audit={ch.audit} frameworks={ch.frameworks} locale={locale} />
    </TbrSection>
  );
}
