// G21-P1-B — the BlockID Assessment Card (FI §51). Hook-free, so it renders
// in server components (/tbr/demo, /showcase, the evaluator page, the
// workspace) and inside the client TBR alike. Props are plain data
// (`AssessmentCardData` from lib/svi/assessment-card.ts) — the PDF and DOCX
// twins render the same object.
//
// Theme contract (G19, components/tbr/v2/shared.tsx): semantic surfaces and
// text tokens only, no translucent ground under text, content ≥ 12 px,
// labels ≥ 11 px uppercase with tracking, tinted borders only.

import type { TbrLocale } from "@/lib/i18n/tbr-strings";
import type { AssessmentCardData, AssessmentDimensionRef } from "@/lib/svi/assessment-card";
import { cn } from "@/lib/utils";
import { bandLabel, bandText } from "@/components/tbr/v2/shared";
import { assessmentStrings, formatCardDate } from "./assessment-card-strings";

export interface AssessmentCardProps {
  data: AssessmentCardData;
  locale?: TbrLocale;
  className?: string;
  /** Link target for the dimension refs (`#tbr-dim-<dim>` on the report, a workspace anchor elsewhere). */
  dimHref?: (dim: AssessmentDimensionRef["dim"]) => string;
  /** Rendered as the card's heading level (h2 in a page, h3 inside a report section). */
  headingLevel?: 2 | 3;
}

const LABEL = "text-[11px] font-semibold uppercase tracking-wide text-muted";

function DimRef({ item, href, none }: { item: AssessmentDimensionRef | null; href?: string; none: string }) {
  if (!item) return <span className="text-muted">{none}</span>;
  const body = (
    <>
      <span className="font-mono text-xs uppercase text-muted">{item.dim}</span> <span className="font-medium text-secondary">{item.title}</span>{" "}
      <span className="tabular-nums text-muted">{item.score}</span>
    </>
  );
  return href ? (
    <a href={href} className="underline-offset-2 hover:text-action hover:underline">
      {body}
    </a>
  ) : (
    <span>{body}</span>
  );
}

export function AssessmentCard({ data, locale = "en", className, dimHref, headingLevel = 3 }: AssessmentCardProps) {
  const t = assessmentStrings(locale);
  const H = headingLevel === 2 ? "h2" : "h3";
  const svi = data.svi;
  const verifiedTone = data.verification.verified ? "border-brand-300 dark:border-brand-800 text-action" : "border-line-subtle text-secondary";
  return (
    <section
      data-testid="assessment-card"
      data-assessment-svi={svi ?? "pending"}
      data-assessment-confidence={data.evidenceConfidence}
      data-assessment-verification={data.verification.short}
      aria-label={t.kicker}
      className={cn("rounded-2xl border border-line-subtle bg-surface p-4 text-primary print:break-inside-avoid", className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line-subtle pb-3">
        <div className="min-w-0">
          <p className={cn(LABEL, "font-mono tracking-[0.18em]")}>{t.kicker}</p>
          <H className="mt-0.5 truncate font-display text-lg font-bold tracking-tight text-primary">{data.startupName}</H>
        </div>
        <span data-assessment-verified className={cn("inline-flex items-center gap-1 rounded-full border bg-surface px-2 py-0.5 text-xs font-semibold", verifiedTone)} title={data.verification.tier}>
          {data.verification.verified ? (
            <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3 w-3 fill-current">
              <path d="M8 1.5 13.5 4v4c0 3.3-2.3 5.7-5.5 6.5C4.8 13.7 2.5 11.3 2.5 8V4L8 1.5Zm-.9 8.6L11 6.2l-.9-.9-3 3-1.3-1.3-.9.9 2.2 2.2Z" />
            </svg>
          ) : null}
          {data.verification.label}
        </span>
      </div>

      {/* SVI and Evidence Confidence — side by side, equal weight. */}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-line-subtle bg-surface-sunken p-3">
          <p className={LABEL}>{t.svi}</p>
          <p className="mt-0.5 flex items-baseline gap-1">
            <span data-assessment-svi-value className={cn("text-3xl font-black tabular-nums tracking-tight", svi === null ? "text-secondary" : "text-primary")}>
              {svi === null ? t.none : svi}
            </span>
            <span className="text-xs text-muted">{t.outOf}</span>
          </p>
          <p className={cn("text-xs font-semibold", bandText(data.sviBand))}>{bandLabel(data.sviBand, locale)}</p>
        </div>
        <div className="rounded-xl border border-line-subtle bg-surface-sunken p-3">
          <p className={LABEL}>{t.evidenceConfidence}</p>
          <p className="mt-0.5 flex items-baseline gap-1">
            <span data-assessment-confidence-value className="text-3xl font-black tabular-nums tracking-tight text-primary">{data.evidenceConfidence}</span>
            <span className="text-xs text-muted">%</span>
          </p>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-line" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={data.evidenceConfidence} aria-label={t.evidenceConfidence}>
            <div className={cn("h-full rounded-full", data.evidenceConfidence >= 70 ? "bg-action" : data.evidenceConfidence >= 40 ? "bg-warn" : "bg-bear")} style={{ width: `${Math.max(2, Math.min(100, data.evidenceConfidence))}%` }} />
          </div>
        </div>
      </div>

      <dl className="mt-3 grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <dt className={LABEL}>{t.verification}</dt>
          <dd className="text-secondary">
            {data.verification.short} · {data.verification.tier}
          </dd>
        </div>
        <div>
          <dt className={LABEL}>{t.stage}</dt>
          <dd className="text-secondary">{data.stageLabel}</dd>
        </div>
        <div>
          <dt className={LABEL}>{t.sector}</dt>
          <dd className="text-secondary">{data.sector}</dd>
        </div>
        {data.benchmark && (
          <div data-assessment-benchmark={data.benchmark.label}>
            <dt className={LABEL}>{t.benchmark}</dt>
            <dd className="tabular-nums text-secondary">{t.benchmarkLine(data.benchmark.median, data.benchmark.n, t.benchmarkLabel[data.benchmark.label])}</dd>
          </div>
        )}
        <div>
          <dt className={LABEL}>{t.topStrength}</dt>
          <dd data-assessment-top-strength={data.topStrength?.dim ?? "none"}>
            <DimRef item={data.topStrength} href={data.topStrength && dimHref ? dimHref(data.topStrength.dim) : undefined} none={t.none} />
          </dd>
        </div>
        <div>
          <dt className={LABEL}>{t.topGap}</dt>
          <dd data-assessment-top-gap={data.topGap?.dim ?? "none"}>
            <DimRef item={data.topGap} href={data.topGap && dimHref ? dimHref(data.topGap.dim) : undefined} none={t.none} />
          </dd>
        </div>
        <div>
          <dt className={LABEL}>{t.unverifiedClaims}</dt>
          <dd data-assessment-unverified={data.unverifiedMaterialClaims} className={cn("tabular-nums font-semibold", data.unverifiedMaterialClaims > 0 ? "text-warn" : "text-bull")}>
            {data.unverifiedMaterialClaims}
          </dd>
        </div>
        <div>
          <dt className={LABEL}>{t.lastUpdated}</dt>
          <dd className="text-secondary">
            <time dateTime={data.lastUpdated}>{formatCardDate(data.lastUpdated, locale)}</time>
          </dd>
        </div>
        <div>
          <dt className={LABEL}>{t.methodology}</dt>
          <dd className="font-mono text-secondary">SVI v{data.methodologyVersion}</dd>
        </div>
      </dl>
      {data.pendingDims > 0 && (
        <p data-assessment-pending className="mt-2 text-xs text-muted">
          {t.pendingDims(data.pendingDims, 8)}
        </p>
      )}
      {(data.staleConnectors ?? 0) > 0 && (
        <p data-assessment-stale-connectors className="mt-1 text-xs text-muted">
          {t.staleConnectors(data.staleConnectors!)}
        </p>
      )}
    </section>
  );
}
