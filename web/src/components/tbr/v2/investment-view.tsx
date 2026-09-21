// Section 2 — Investment view (G27, spec § 2 row 2 + § 4, wireframe W2):
// the recommendation first (IC-memo rule). Verdict band A–D + conviction,
// the mandatory sub-line, the executive summary paragraphs, the conditions
// (or band D's evidence CTAs), "Why back" / "What weighs against" (3 + 3),
// "Where you are" (phase, blocker, what it takes) and — only when the CEO
// agent's own label disagrees with the rubric band — its sentence as
// "Analyst synthesis". Section 3 — Key points: five lines a screener can
// paste into notes. Hook-free; EN / VI via tbr-v3-strings.

import { VisualFigure } from "@/lib/report-visuals/react";
import type { CitationIndex } from "@/lib/report-v2/citations";
import type { ExecutiveStructured, InvestmentView, ReportV2 } from "@/lib/report-v2/schema";
import { cn } from "@/lib/utils";
import { Chip, CitedText, DimChip, TBR_SPACING, TBR_V2_SECTION_IDS, TbrSection, phaseLabel, v2Strings, type TbrUiLocale } from "./shared";
import { Callout, FIGURE_CLASS, VerdictBandBadge, v3Strings } from "./shared-v3";

function PointCard({ text, dim, score, lift, index, tone, locale, citations }: { text: string; dim?: InvestmentView["reasons"][number]["dim"]; score?: number; lift?: number; index: number; tone: "good" | "bad"; locale: TbrUiLocale; citations?: CitationIndex }) {
  const t = v3Strings(locale);
  return (
    <li data-tbr-point={tone === "good" ? "reason" : "risk"} className="flex gap-3 rounded-lg border border-line-subtle bg-surface p-3 print:break-inside-avoid">
      <span aria-hidden="true" className={cn("mt-0.5 text-xs", FIGURE_CLASS, tone === "good" ? "text-action" : "text-bear")}>
        {tone === "bad" ? "▲ " : ""}
        {String(index + 1).padStart(2, "0")}
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="text-sm leading-relaxed text-primary">
          <CitedText text={text} citations={citations} locale={locale} />
        </p>
        {(dim || typeof lift === "number") && (
          <p className="flex flex-wrap items-center gap-1.5">
            {dim && <DimChip dim={dim} locale={locale} />}
            {typeof score === "number" && <span className={cn("text-xs text-muted", FIGURE_CLASS)}>{score}/100</span>}
            {typeof lift === "number" && <Chip kind="lift">{t.lift(lift)}</Chip>}
          </p>
        )}
      </div>
    </li>
  );
}

export function TbrInvestmentView({ report, view, structured, title, locale = "en", citations }: { report: ReportV2; view: InvestmentView; structured: ExecutiveStructured; title: string; locale?: TbrUiLocale; citations?: CitationIndex }) {
  const t = v3Strings(locale);
  const s47 = v2Strings(locale).s47;
  const phase = phaseLabel(structured.phaseNow.phaseId, locale);
  return (
    <TbrSection id={TBR_V2_SECTION_IDS.investmentView} kicker="2" title={title} purpose={t.purpose.investmentView} pageBreak>
      {/* Verdict block: band + label, conviction line, the verbatim sub-line. */}
      <div data-tbr-verdict={view.band} data-tbr-verdict-rule={view.rule} className="rounded-r-xl border-l-4 border-brand-navy bg-surface-sunken px-4 py-4 print:break-inside-avoid">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <VerdictBandBadge band={view.band} label={view.bandWording} size="lg" />
          <span data-tbr-conviction={view.conviction} className={cn("text-sm text-secondary", FIGURE_CLASS)}>
            {view.convictionLine}
          </span>
        </div>
        <p data-tbr-subline className="mt-2 max-w-prose text-xs leading-relaxed text-muted">
          {view.subline}
        </p>
      </div>

      <div data-tbr-exec-summary className="max-w-prose space-y-3">
        {structured.summary.map((p, i) => (
          <p key={i} className="text-sm leading-relaxed text-primary">
            <CitedText text={p} citations={citations} locale={locale} />
          </p>
        ))}
      </div>

      {view.band === "D" ? (
        <div data-tbr-conditions="ctas" className={TBR_SPACING.item}>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-secondary">{t.evidenceCtas}</h3>
          <ul className="space-y-1.5">
            {view.evidenceCtas.map((c) => (
              <li key={c.href + c.label} className="flex flex-wrap items-center gap-2 text-sm">
                <a href={c.href} className="font-semibold text-action underline-offset-2 hover:underline">
                  {c.label} →
                </a>
                {typeof c.lift === "number" && <Chip kind="lift">{t.lift(c.lift)}</Chip>}
              </li>
            ))}
          </ul>
        </div>
      ) : view.conditions.length > 0 ? (
        <div data-tbr-conditions={String(view.conditions.length)} className={TBR_SPACING.item}>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-secondary">{t.conditions}</h3>
          <ol className="space-y-1.5">
            {view.conditions.map((c, i) => (
              <li key={c.kind + i} data-tbr-condition={c.kind} className="flex gap-2 text-sm text-primary">
                <span aria-hidden="true" className={cn("text-secondary", FIGURE_CLASS)}>
                  {i + 1}.
                </span>
                <span>
                  {c.text}
                  {c.dim && (
                    <>
                      {" "}
                      <DimChip dim={c.dim} locale={locale} />
                    </>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <p data-tbr-conditions="0" className="text-sm text-secondary">
          {t.noConditions}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div data-testid="tbr-exec-reasons" className={TBR_SPACING.item}>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-action">{t.whyBack}</h3>
          <ul className="space-y-2">
            {view.reasons.map((r, i) => (
              <PointCard key={i} text={r.text} dim={r.dim} score={r.score} index={i} tone="good" locale={locale} citations={citations} />
            ))}
          </ul>
        </div>
        <div data-testid="tbr-exec-gaps" className={TBR_SPACING.item}>
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
            <span aria-hidden="true" className="text-bear">▲</span>
            {t.whatWeighsAgainst}
          </h3>
          <ul className="space-y-2">
            {view.risks.map((r, i) => (
              <PointCard key={i} text={r.text} dim={r.dim} score={r.score} lift={r.lift} index={i} tone="bad" locale={locale} citations={citations} />
            ))}
          </ul>
        </div>
      </div>

      <div data-tbr-exec-phase className="rounded-xl border border-line-subtle p-4 print:break-inside-avoid">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-secondary">{t.whereYouAre}</h3>
          <span data-tbr-exec-phase-badge className="rounded-full border border-brand-navy/40 bg-surface-sunken px-2.5 py-0.5 text-xs font-semibold text-primary">
            {phase}
          </span>
        </div>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="max-w-prose">
            <dt className="text-xs font-semibold uppercase tracking-wide text-bear">{t.blocker}</dt>
            <dd className="mt-0.5 text-sm leading-relaxed text-primary">
              <CitedText text={structured.phaseNow.blocker || s47.noBlocker} citations={citations} locale={locale} />
            </dd>
          </div>
          <div className="max-w-prose">
            <dt className="text-xs font-semibold uppercase tracking-wide text-action">{t.whatItTakes}</dt>
            <dd className="mt-0.5 text-sm leading-relaxed text-primary">
              <CitedText text={structured.phaseNow.whatItTakes} citations={citations} locale={locale} />
            </dd>
          </div>
        </dl>
        {report.executive.visuals.map((v) => (
          <VisualFigure key={v.id} spec={v} caption={null} className="mt-3" />
        ))}
      </div>

      {view.analystSynthesis && (
        <Callout kind="note" title={`${t.analystSynthesis} · ${s47.verdictLabel[view.analystSynthesis.label]}`} testId="tbr-analyst-synthesis">
          <CitedText text={view.analystSynthesis.text} citations={citations} locale={locale} />
        </Callout>
      )}
    </TbrSection>
  );
}

export function TbrKeyPoints({ view, title, locale = "en" }: { view: InvestmentView; title: string; locale?: TbrUiLocale }) {
  const t = v3Strings(locale);
  return (
    <TbrSection id={TBR_V2_SECTION_IDS.keyPoints} kicker="3" title={title} purpose={t.purpose.keyPoints}>
      <ol data-tbr-key-points className="max-w-prose space-y-2">
        {view.keyPoints.map((k, i) => (
          <li key={i} className="flex gap-3 text-sm leading-relaxed text-primary">
            <span aria-hidden="true" className={cn("shrink-0 text-action", FIGURE_CLASS)}>
              {["①", "②", "③", "④", "⑤"][i] ?? `${i + 1}.`}
            </span>
            <span>{k}</span>
          </li>
        ))}
      </ol>
    </TbrSection>
  );
}
