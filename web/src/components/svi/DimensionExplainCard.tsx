// G21-P1-B — per-dimension explainability card: Score · Confidence · Why ·
// Evidence (L1–L6 badges, verified tick) · Missing · Benchmark · Next action.
// A pending dimension keeps the G19 pending band and shows only Missing +
// Next action. Hook-free; plain data props (`DimensionExplainData` from
// lib/svi/dimension-explain.ts). `variant="compact"` is the at-a-glance form
// the report cover uses in place of the dimension table rows.

import type { TbrLocale } from "@/lib/i18n/tbr-strings";
import type { DimensionEvidenceItem } from "@/lib/evidence/dimension-evidence";
import type { DimensionExplainData } from "@/lib/svi/dimension-explain";
import { cn } from "@/lib/utils";
import { Chip, bandLabel, bandSurface, bandText } from "@/components/tbr/v2/shared";
import { assessmentStrings } from "./assessment-card-strings";

export interface DimensionExplainCardProps {
  data: DimensionExplainData;
  locale?: TbrLocale;
  variant?: "full" | "compact";
  /** Optional link on the title (the chapter anchor on the report, a drill-down elsewhere). */
  href?: string;
  className?: string;
  /** Heading level for the title (h3 default; h4 when nested under a chapter heading). */
  headingLevel?: 3 | 4;
}

const LABEL = "text-[11px] font-semibold uppercase tracking-wide text-muted";

/** L1–L6 badge + verified tick, one chip. */
export function EvidenceLevelBadge({ item, verifiedLabel }: { item: Pick<DimensionEvidenceItem, "level" | "verified">; verifiedLabel: string }) {
  return (
    <Chip kind={item.verified ? "dim" : "source"} title={item.verified ? verifiedLabel : undefined} className="shrink-0 font-mono">
      {item.level}
      {item.verified ? (
        <>
          <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3 w-3 fill-current">
            <path d="M6.4 11.6 2.8 8l1.1-1.1 2.5 2.5 5.7-5.7L13.2 4.8z" />
          </svg>
          <span className="sr-only">{verifiedLabel}</span>
        </>
      ) : null}
    </Chip>
  );
}

export function DimensionExplainCard({ data, locale = "en", variant = "full", href, className, headingLevel = 3 }: DimensionExplainCardProps) {
  const t = assessmentStrings(locale);
  const H = headingLevel === 4 ? "h4" : "h3";
  const compact = variant === "compact";
  const title = (
    <>
      <span className="font-mono text-xs uppercase text-muted">{data.dim}</span> <span>{data.title}</span>
    </>
  );
  return (
    <article
      data-testid="dimension-explain"
      data-dim={data.dim}
      data-explain-state={data.pending ? "pending" : "assessed"}
      data-explain-variant={variant}
      className={cn("rounded-xl border p-3 print:break-inside-avoid", bandSurface(data.band), compact ? "space-y-2" : "space-y-3", className)}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <H className="text-sm font-semibold leading-snug text-primary">
            {href ? (
              <a href={href} title={t.openChapter} className="underline-offset-2 hover:text-action hover:underline">
                {title}
              </a>
            ) : (
              title
            )}
          </H>
          <p className="text-xs text-muted">
            {t.weight(data.weight)}
            {data.confidence !== null ? (
              <>
                {" · "}
                {t.confidence} <span data-explain-confidence className="tabular-nums text-secondary">{data.confidence}%</span>
              </>
            ) : null}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className={cn("font-black tabular-nums tracking-tight", compact ? "text-2xl" : "text-3xl", data.pending ? "text-muted" : bandText(data.band))} data-explain-score={data.score ?? "pending"}>
            {data.score === null ? t.none : data.score}
          </p>
          <p className={cn("text-[11px] font-semibold uppercase tracking-wide", bandText(data.band))}>{bandLabel(data.band, locale)}</p>
        </div>
      </header>

      {data.pending ? (
        <p data-explain-pending className="text-xs text-secondary">
          {t.pendingLine}
        </p>
      ) : (
        <>
          {data.why.length > 0 && (
            <div data-explain-why>
              <p className={LABEL}>{t.why}</p>
              {(compact ? data.why.slice(0, 1) : data.why).map((s, i) => (
                <p key={i} className="max-w-prose text-xs leading-relaxed text-primary">
                  {s}
                </p>
              ))}
            </div>
          )}
          <div data-explain-evidence>
            <p className={LABEL}>{t.evidence}</p>
            {data.evidence.length === 0 ? (
              <p className="text-xs text-muted">{t.noEvidence}</p>
            ) : (
              <ul className="mt-1 space-y-1">
                {(compact ? data.evidence.slice(0, 1) : data.evidence).map((e) => (
                  <li key={e.id} className="flex items-start gap-1.5 text-xs" data-explain-evidence-level={e.level}>
                    <EvidenceLevelBadge item={e} verifiedLabel={t.verified} />
                    <span className="min-w-0 text-secondary">
                      {e.sourceUri ? (
                        <a href={e.sourceUri} rel="noopener noreferrer" target="_blank" className="underline-offset-2 hover:text-action hover:underline">
                          {e.statement}
                        </a>
                      ) : (
                        e.statement
                      )}
                      {e.sourceName ? <span className="text-muted"> · {e.sourceName}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      <div data-explain-missing>
        <p className={LABEL}>{t.missing}</p>
        {data.missing.length === 0 ? (
          <p className="text-xs text-muted">{t.complete}</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {(compact ? data.missing.slice(0, 1) : data.missing).map((m) => (
              <li key={m.code} className="flex flex-wrap items-center gap-1.5 text-xs">
                <a href={m.href} className="text-secondary underline-offset-2 hover:text-action hover:underline">
                  {m.label}
                </a>
                <Chip kind="lift">{t.lift(m.lift)}</Chip>
              </li>
            ))}
          </ul>
        )}
      </div>

      {data.benchmark && (
        <p data-explain-benchmark={data.benchmark.label} className="text-xs tabular-nums text-muted">
          <span className={LABEL}>{t.benchmark}</span> {t.benchmarkLine(data.benchmark.median, data.benchmark.n, t.benchmarkLabel[data.benchmark.label])}
        </p>
      )}

      {data.nextAction && (
        <div data-explain-next-action className="rounded-lg border border-brand-300 dark:border-brand-800 bg-surface px-2.5 py-1.5">
          <p className={LABEL}>{t.nextAction}</p>
          <p className="flex flex-wrap items-center gap-1.5 text-xs">
            {data.nextAction.href ? (
              <a href={data.nextAction.href} className="font-semibold text-action underline-offset-2 hover:underline">
                {data.nextAction.title}
              </a>
            ) : (
              <span className="font-semibold text-primary">{data.nextAction.title}</span>
            )}
            {typeof data.nextAction.lift === "number" && data.nextAction.lift > 0 ? <Chip kind="lift">{t.lift(data.nextAction.lift)}</Chip> : null}
          </p>
        </div>
      )}
    </article>
  );
}

/** A responsive grid of cards (the report cover / workspace list). */
export function DimensionExplainGrid({ items, locale, variant = "compact", hrefFor, className }: { items: readonly DimensionExplainData[]; locale?: TbrLocale; variant?: "full" | "compact"; hrefFor?: (dim: DimensionExplainData["dim"]) => string; className?: string }) {
  return (
    <div data-testid="dimension-explain-grid" className={cn("grid gap-3", variant === "compact" ? "sm:grid-cols-2" : "", className)}>
      {items.map((d) => (
        <DimensionExplainCard key={d.dim} data={d} locale={locale} variant={variant} href={hrefFor ? hrefFor(d.dim) : undefined} />
      ))}
    </div>
  );
}
