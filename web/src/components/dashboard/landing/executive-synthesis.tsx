// Block 1b · Executive synthesis — G19-S44 (§0 row 4). OPTIONAL: rendered
// only when a stored `report_v2` exists for the startup, right after "Where
// you stand" (`landingBlocksFor({ hasReportV2 })`).
//
// Six answers, every one read from the report (no new computation —
// `lib/dashboard/executive-synthesis.ts`): Where (phase + one sentence),
// Worth (A$ range + confidence, or "valuation pending"), top-3 strengths,
// top-3 weaknesses, follow-ups (90-day plan top-3 by lift) and data to add
// (the plan's evidence CTAs, linked). One CTA: open the full report.
//
// Full-width band (lg:col-span-12) so the two-column row above and the
// three thirds below keep their shape; the grid packs dense, so the block
// reads after "Where you stand" in the DOM and sits under the first row.

import { Sparkles } from "lucide-react";
import Link from "next/link";
import type { TbrLocale } from "@/lib/i18n/tbr-strings";
import { synthesisStrings, type ExecutiveSynthesisData } from "@/lib/dashboard/executive-synthesis";
import { cn } from "@/lib/utils";
import { LandingBlock, LandingCta, type LandingContext } from "./landing-grid";

export interface ExecutiveSynthesisProps {
  ctx: LandingContext;
  data: ExecutiveSynthesisData;
  locale?: TbrLocale;
}

function List({ title, items, tone, testId }: { title: string; items: string[]; tone: "good" | "bad"; testId: string }) {
  const s = synthesisStrings("en");
  return (
    <div data-testid={testId} className="min-w-0">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-tertiary">{title}</p>
      {items.length ? (
        <ul className="space-y-1 text-xs text-primary">
          {items.map((it, i) => (
            <li key={i} className="flex gap-1.5">
              <span aria-hidden="true" className={tone === "good" ? "text-bull" : "text-bear"}>
                {tone === "good" ? "✓" : "▲"}
              </span>
              <span>{it}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-tertiary">{s.nothingYet}</p>
      )}
    </div>
  );
}

export function ExecutiveSynthesis({ ctx, data, locale = "en" }: ExecutiveSynthesisProps) {
  const s = synthesisStrings(locale);
  const date = new Date(data.generatedAt).toLocaleDateString(locale === "vi" ? "vi-VN" : "en-AU", { day: "numeric", month: "short", year: "numeric" });
  return (
    <LandingBlock
      name="executive-synthesis"
      order={2}
      title={s.title}
      icon={Sparkles}
      span="full"
      aside={<span className="text-[11px] text-tertiary">{s.fromReport(date)}</span>}
      cta={
        <LandingCta block="executive-synthesis" href={data.reportHref} ctx={ctx} action="open_report" variant="secondary" testId="landing-synthesis-cta">
          {s.openReport}
        </LandingCta>
      }
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-landing-synthesis data-landing-synthesis-report={data.reportId}>
        {/* Where */}
        <div className="min-w-0 rounded-lg bg-surface-sunken px-3 py-2" data-testid="synthesis-where">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">{s.where}</p>
          <p className="mt-0.5 text-sm font-semibold text-primary" data-synthesis-phase={data.where.phaseId}>
            {data.where.phaseLabel}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-secondary">{data.where.sentence}</p>
        </div>
        {/* Worth */}
        <div className="min-w-0 rounded-lg bg-surface-sunken px-3 py-2" data-testid="synthesis-worth" data-synthesis-worth={data.worth.pending ? "pending" : "range"}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">{s.worth}</p>
          <p className={cn("mt-0.5 font-bold tabular-nums text-primary", data.worth.pending ? "text-sm" : "text-xl")}>{data.worth.headline}</p>
          {data.worth.subline ? <p className="mt-1 text-xs text-secondary">{data.worth.subline}</p> : null}
        </div>
        {/* Follow-ups */}
        <div className="min-w-0" data-testid="synthesis-follow-ups">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-tertiary">{s.followUps}</p>
          {data.followUps.length ? (
            <ol className="space-y-1.5">
              {data.followUps.map((f, i) => (
                <li key={`${f.dimension}-${i}`} className="flex items-start justify-between gap-2 text-xs" data-synthesis-step={f.dimension}>
                  <span className="min-w-0 text-primary">
                    {f.title} <span className="text-tertiary">· {s.day(f.day)}</span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-bull">{s.lift(f.lift)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-xs text-tertiary">{s.nothingYet}</p>
          )}
        </div>
        <List title={s.strengths} items={data.strengths} tone="good" testId="synthesis-strengths" />
        <List title={s.weaknesses} items={data.weaknesses} tone="bad" testId="synthesis-weaknesses" />
        {/* Data to add */}
        <div className="min-w-0" data-testid="synthesis-data-to-add">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-tertiary">{s.dataToAdd}</p>
          {data.dataToAdd.length ? (
            <ul className="space-y-1.5">
              {data.dataToAdd.map((d, i) => (
                <li key={`${d.href}-${i}`} className="flex items-start justify-between gap-2 text-xs">
                  <Link href={d.href} className="min-w-0 font-medium text-action underline-offset-2 hover:underline" data-synthesis-evidence-link>
                    {d.label}
                  </Link>
                  {d.lift !== null ? <span className="shrink-0 font-semibold tabular-nums text-bull">{s.lift(d.lift)}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-tertiary">{s.nothingYet}</p>
          )}
        </div>
      </div>
    </LandingBlock>
  );
}
