// Chapter 1 — Executive summary (G19-S47 redesign). Renders the STRUCTURED
// block only — never the raw CEO markdown:
//
//   headline (display font) → 2–3 summary paragraphs → key-insight callout
//   → "Why back this startup" / "What must change" card rows (dim chip →
//   chapter, gap lift) → benchmark chip row → "Where you are" strip (phase,
//   blocker, what it takes, route map) → verdict panel (label pill, confidence
//   meter, condition) → numbered recommended actions with window chips.
//
// The S44 score-restatement lists are gone: the cards ARE the strengths /
// gaps. `executive.structured` is guaranteed here (`ensureExecutiveStructured`
// parses a pre-S47 thesis on the fly). Hook-free; EN / VI via tbr-strings.

import { GROWTH_PHASE_LABELS } from "@/lib/growth/phase-taxonomy";
import { VisualFigure } from "@/lib/report-visuals/react";
import { ensureExecutiveStructured } from "@/lib/report-v2/executive-structure";
import type { Band, ExecutiveGap, ExecutiveReason, ExecutiveStructured, ExecutiveVerdictLabel, ReportV2 } from "@/lib/report-v2/schema";
import { cn } from "@/lib/utils";
import { Chip, DimChip, TBR_SPACING, TBR_V2_SECTION_IDS, TbrSection, WindowChip, bandLabel, bandSurface, bandText, v2Strings, type TbrUiLocale } from "./shared";

/** Verdict → the band colour scale (back = strong blue … not yet = pending grey). */
export const VERDICT_BAND: Record<ExecutiveVerdictLabel, Band> = { back: "strong", back_with_conditions: "developing", watch: "early", not_yet: "pending" };

function Card({ item, tone, locale, index }: { item: ExecutiveReason | ExecutiveGap; tone: "good" | "bad"; locale: TbrUiLocale; index: number }) {
  const s47 = v2Strings(locale).s47;
  const lift = "lift" in item && typeof item.lift === "number" && item.lift > 0 ? item.lift : null;
  return (
    <article
      data-tbr-exec-card={tone === "good" ? "reason" : "gap"}
      className={cn(
        "flex flex-col gap-2 rounded-xl border p-4 shadow-1 print:break-inside-avoid",
        tone === "good" ? "border-sky-200/70 bg-sky-50/40 dark:border-sky-900/60 dark:bg-sky-950/20" : "border-orange-200/70 bg-orange-50/40 dark:border-orange-900/60 dark:bg-orange-950/20",
      )}
    >
      <div className="flex items-start gap-2">
        <span aria-hidden="true" className={cn("mt-0.5 font-mono text-[10px] tabular-nums", tone === "good" ? "text-sky-700 dark:text-sky-300" : "text-orange-700 dark:text-orange-300")}>
          {String(index + 1).padStart(2, "0")}
        </span>
        <h4 className="font-display text-sm font-semibold leading-snug text-ink-900 dark:text-ink-100">{item.title}</h4>
      </div>
      <p className="text-xs leading-relaxed text-ink-700 dark:text-ink-300">{item.body}</p>
      {(item.dim || lift !== null) && (
        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
          {item.dim && <DimChip dim={item.dim} locale={locale} />}
          {lift !== null && <Chip kind="lift">{s47.lift(lift)}</Chip>}
        </div>
      )}
    </article>
  );
}

function CardRow({ title, items, tone, locale, testId }: { title: string; items: Array<ExecutiveReason | ExecutiveGap>; tone: "good" | "bad"; locale: TbrUiLocale; testId: string }) {
  if (!items.length) return null;
  return (
    <div data-testid={testId} className={TBR_SPACING.item}>
      <h3 className={cn("text-[11px] font-semibold uppercase tracking-wide", tone === "good" ? "text-sky-800 dark:text-sky-300" : "text-orange-800 dark:text-orange-300")}>{title}</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        {items.map((it, i) => (
          <Card key={`${it.title}-${i}`} item={it} tone={tone} locale={locale} index={i} />
        ))}
      </div>
    </div>
  );
}

export function TbrExecutiveStructured({ structured, visuals, confidence, locale = "en" }: { structured: ExecutiveStructured; visuals: ReportV2["executive"]["visuals"]; confidence: number; locale?: TbrUiLocale }) {
  const s = structured;
  const t = v2Strings(locale);
  const s47 = t.s47;
  const verdictBand = VERDICT_BAND[s.verdict.label];
  const confidencePct = Math.round(s.verdict.confidence * 100);
  const phaseLabel = GROWTH_PHASE_LABELS[s.phaseNow.phaseId]?.[locale === "vi" ? "vi" : "en"] ?? s.phaseNow.label;
  return (
    <>
      <header className={cn(TBR_SPACING.item, "print:break-inside-avoid")} data-tbr-exec-header>
        <div className="flex items-center gap-2">
          <Chip kind="agent">ceo</Chip>
          <span data-tbr-exec-confidence className="text-[11px] text-ink-500">{t.s44.evidenceConfidence(Math.round(confidence * 100))}</span>
        </div>
        <h3 data-tbr-exec-headline className="max-w-[30ch] font-display text-2xl font-bold leading-tight tracking-tight text-ink-900 dark:text-ink-100 sm:text-3xl print:text-2xl">
          {s.headline}
        </h3>
        <div data-tbr-exec-summary className="max-w-prose space-y-3">
          {s.summary.map((p, i) => (
            <p key={i} className="text-sm leading-relaxed text-ink-800 dark:text-ink-200">
              {p}
            </p>
          ))}
        </div>
      </header>

      {s.keyInsight && (
        <aside data-tbr-exec-insight className="max-w-prose rounded-r-xl border-l-4 border-accent-600 bg-accent-soft px-4 py-3 print:break-inside-avoid">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">{s47.keyInsight}</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-800 dark:text-ink-200">{s.keyInsight}</p>
        </aside>
      )}

      <CardRow title={s47.whyBack} items={s.reasonsToBack} tone="good" locale={locale} testId="tbr-exec-reasons" />
      <CardRow title={s47.whatMustChange} items={s.criticalGaps} tone="bad" locale={locale} testId="tbr-exec-gaps" />

      {s.benchmarks.length > 0 && (
        <div data-tbr-exec-benchmarks className={TBR_SPACING.item}>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-600 dark:text-ink-300">{s47.benchmarks}</h3>
          <ul className="flex flex-wrap gap-2">
            {s.benchmarks.map((b) => (
              <li key={b.dim}>
                <Chip kind="band" href={`#${TBR_V2_SECTION_IDS.dim(b.dim)}`} title={b.note ?? s47.openChapter(b.dim.toUpperCase())} className={cn("px-2.5 py-1", bandSurface(b.band))}>
                  <span className="font-mono uppercase text-ink-700 dark:text-ink-200">{b.dim}</span>
                  <span className={cn("tabular-nums font-semibold", bandText(b.band))}>{b.band === "pending" ? "—" : b.score}</span>
                  <span className="text-ink-500 dark:text-ink-400">{bandLabel(b.band, locale)}</span>
                </Chip>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div data-tbr-exec-phase className="rounded-xl border border-ink-200 p-4 dark:border-ink-800 print:break-inside-avoid">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-600 dark:text-ink-300">{s47.whereYouAre}</h3>
          <span data-tbr-exec-phase-badge className="rounded-full border border-brand-200 bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700 dark:border-brand-800 dark:bg-brand-950/40 dark:text-brand-300">{phaseLabel}</span>
        </div>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="max-w-prose">
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-300">{s47.blocker}</dt>
            <dd className="mt-0.5 text-sm leading-relaxed text-ink-800 dark:text-ink-200">{s.phaseNow.blocker}</dd>
          </div>
          <div className="max-w-prose">
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">{s47.whatItTakes}</dt>
            <dd className="mt-0.5 text-sm leading-relaxed text-ink-800 dark:text-ink-200">{s.phaseNow.whatItTakes}</dd>
          </div>
        </dl>
        {visuals.map((v) => (
          <VisualFigure key={v.id} spec={v} caption={null} className="mt-3" />
        ))}
      </div>

      <div data-tbr-exec-verdict={s.verdict.label} className={cn("rounded-xl border p-4 print:break-inside-avoid", bandSurface(verdictBand))}>
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-600 dark:text-ink-300">{s47.verdict}</h3>
          <span data-tbr-exec-verdict-pill className={cn("rounded-full border px-3 py-1 font-display text-sm font-bold", bandText(verdictBand), verdictBand === "pending" ? "border-ink-300 dark:border-ink-600" : "border-current")}>
            {s47.verdictLabel[s.verdict.label]}
          </span>
          <div className="flex min-w-[160px] flex-1 items-center gap-2">
            <div role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={confidencePct} aria-label={s47.confidence(confidencePct)} className="h-2 flex-1 overflow-hidden rounded-full bg-ink-200/70 dark:bg-ink-800">
              <div data-tbr-exec-meter className={cn("h-full rounded-full", verdictBand === "strong" ? "bg-[#0072B2]" : verdictBand === "developing" ? "bg-[#B8770A]" : verdictBand === "early" ? "bg-[#A8420A]" : "bg-ink-400")} style={{ width: `${Math.max(2, Math.min(100, confidencePct))}%` }} />
            </div>
            <span className="text-[11px] tabular-nums text-ink-600 dark:text-ink-300">{s47.confidence(confidencePct)}</span>
          </div>
        </div>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-800 dark:text-ink-200">
          <span className="font-semibold">{s47.condition}:</span> {s.verdict.condition ?? s47.noCondition}
        </p>
      </div>

      {s.actions.length > 0 && (
        <div data-tbr-exec-actions className={TBR_SPACING.item}>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-600 dark:text-ink-300">{s47.actions}</h3>
          <ol className="space-y-2">
            {s.actions.map((a, i) => (
              <li key={`${a.title}-${i}`} className="flex gap-3 rounded-lg border border-ink-200 p-3 dark:border-ink-800 print:break-inside-avoid">
                <span aria-hidden="true" className="font-display text-lg font-bold leading-none tabular-nums text-brand-700 dark:text-brand-300">{i + 1}</span>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-semibold leading-snug text-ink-900 dark:text-ink-100">{a.title}</p>
                  <p className="max-w-prose text-xs leading-relaxed text-ink-600 dark:text-ink-300">{a.detail}</p>
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <WindowChip window={a.window} locale={locale} />
                    {a.dim && <DimChip dim={a.dim} locale={locale} />}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </>
  );
}

export function TbrExecutive({ report, title, locale = "en" }: { report: ReportV2; title: string; locale?: TbrUiLocale }) {
  const ensured = ensureExecutiveStructured(report);
  const e = ensured.executive;
  const structured = e.structured!;
  return (
    <TbrSection id={TBR_V2_SECTION_IDS.executive} kicker="1" title={title} purpose={v2Strings(locale).s47.purpose.executive} pageBreak>
      <TbrExecutiveStructured structured={structured} visuals={e.visuals} confidence={e.confidence} locale={locale} />
    </TbrSection>
  );
}
