// Chapters 2–9 — one dimension chapter, the fixed skeleton from spec §A.1:
// header (owner, score, band, stage percentile) → primary visual → verdict →
// evidence table → criterion cards → strengths / gaps / next action →
// auditor stamp. `renderAs: "card"` (free tier, chapters 6–9) collapses to
// score + band + one gap + upgrade CTA — with the primary visual kept
// compact so every chapter still carries one `svg[role=img]`.

import { GROWTH_PHASE_LABELS } from "@/lib/growth/phase-taxonomy";
import { VisualFigure } from "@/lib/report-visuals/react";
import type { DimensionChapter } from "@/lib/report-v2/schema";
import { cn } from "@/lib/utils";
import { AgentBadge, AuditStampLine, Bullets, TBR_V2_SECTION_IDS, TbrSection, bandLabel, bandSurface, bandText, stateLabel } from "./shared";

const WINDOW_LABEL = { this_week: "this week", "30d": "next 30 days", "90d": "next 90 days" } as const;

export function TbrChapter({ chapter, index, locale = "en", upgradeHref = "/pricing" }: { chapter: DimensionChapter; index: number; locale?: "en" | "vi"; upgradeHref?: string }) {
  const ch = chapter;
  const id = TBR_V2_SECTION_IDS.dim(ch.dim);
  const title = locale === "vi" ? ch.titleVi : ch.title;
  const header = (
    <div className={cn("flex flex-wrap items-center gap-3 rounded-xl border p-4", bandSurface(ch.band))}>
      <div className="flex items-baseline gap-1">
        <span className={cn("text-4xl font-black tabular-nums tracking-tight", bandText(ch.band))}>{ch.band === "pending" ? "—" : ch.score}</span>
        <span className="text-xs text-ink-500">/100</span>
      </div>
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-600 dark:text-ink-300">
          <span className={cn("font-semibold", bandText(ch.band))}>{bandLabel(ch.band)}</span>
          <span>· weight {ch.weight}</span>
          <span>· owner</span>
          <AgentBadge role={ch.ownerAgent} />
          {ch.supportingAgents.slice(0, 3).map((r) => (
            <AgentBadge key={r} role={r} kind="support" />
          ))}
        </div>
        <p className="text-[11px] text-ink-500 dark:text-ink-400">
          Stage p25 {ch.benchmark.p25} · p50 {ch.benchmark.p50} · p75 {ch.benchmark.p75}
          {ch.benchmark.percentile !== null ? ` · you: ${ch.benchmark.percentile}th percentile` : ""}
        </p>
      </div>
    </div>
  );

  if (ch.renderAs === "card") {
    return (
      <TbrSection id={id} kicker={String(index)} title={title}>
        {header}
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-2">
            <p className="text-sm text-ink-700 dark:text-ink-200">{ch.verdict}</p>
            {ch.gaps[0] && <p className="text-xs text-ink-600 dark:text-ink-300">▲ {ch.gaps[0]}</p>}
            <a href={upgradeHref} className="inline-flex items-center rounded-lg border border-brand-300 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100 dark:border-brand-700 dark:bg-brand-950/40 dark:text-brand-300">
              Unlock the full {ch.title} chapter
            </a>
          </div>
          <div data-tbr-primary={ch.dim}>
            <VisualFigure spec={ch.primaryVisual} caption={`${ch.primaryVisual.title} · ${stateLabel(ch.primaryVisual.dataState)}`} />
          </div>
        </div>
      </TbrSection>
    );
  }

  return (
    <TbrSection id={id} kicker={String(index)} title={title}>
      {header}
      <div data-tbr-primary={ch.dim} className="rounded-xl border border-ink-200 p-3 dark:border-ink-800 print:break-inside-avoid">
        <VisualFigure spec={ch.primaryVisual} caption={`${ch.primaryVisual.title} · ${stateLabel(ch.primaryVisual.dataState)}${ch.primaryVisual.subtitle ? ` — ${ch.primaryVisual.subtitle}` : ""}`} />
      </div>
      <p className="text-sm leading-relaxed text-ink-800 dark:text-ink-200">{ch.verdict}</p>

      <div className="rounded-lg border border-ink-200 dark:border-ink-800">
        <table className="w-full text-xs">
          <caption className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-ink-500">Evidence</caption>
          {ch.evidence.length > 0 ? (
            <tbody>
              {ch.evidence.map((e) => (
                <tr key={e.evidence_id} className="border-t border-ink-100 dark:border-ink-800/60">
                  <td className="px-3 py-1 font-mono text-[10px] text-ink-400">{e.evidence_id}</td>
                  <td className="px-3 py-1 text-ink-700 dark:text-ink-200">{e.label}</td>
                  <td className="px-3 py-1 text-ink-500">{e.source}</td>
                  <td className="px-3 py-1 text-ink-500">{e.status}</td>
                  <td className="px-3 py-1 text-ink-500">{e.observedAt ?? ""}</td>
                </tr>
              ))}
            </tbody>
          ) : (
            <tbody>
              <tr className="border-t border-ink-100 dark:border-ink-800/60">
                <td className="px-3 py-2 text-ink-500 dark:text-ink-400">No evidence rows in this snapshot — connect a data source or upload documents to make this chapter evidenced.</td>
              </tr>
            </tbody>
          )}
        </table>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {ch.criteria.map((c) => (
          <div key={c.key} className="rounded-lg border border-ink-200 p-3 dark:border-ink-800 print:break-inside-avoid">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-ink-800 dark:text-ink-100">{c.title}</p>
              <span className={cn("text-sm font-bold tabular-nums", bandText(c.score >= 70 ? "strong" : c.score >= 40 ? "developing" : "early"))}>{c.score}</span>
            </div>
            <p className="mt-1 text-xs text-ink-600 dark:text-ink-300">{c.verdict}</p>
            {(c.strengths.length > 0 || c.gaps.length > 0) && (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <Bullets title="Strengths" tone="good" items={c.strengths.slice(0, 3)} />
                <Bullets title="Gaps" tone="bad" items={c.gaps.slice(0, 3)} />
              </div>
            )}
            {c.nextAction && <p className="mt-2 text-[11px] text-brand-700 dark:text-brand-300">Next: {c.nextAction}</p>}
            <p className="mt-1 text-[10px] text-ink-400">
              {c.quality} · {c.agent.toUpperCase()} · {c.grounded ? "grounded" : "uncited"}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Bullets title="Strengths" tone="good" items={ch.strengths} />
        <Bullets title="Gaps" tone="bad" items={ch.gaps} />
      </div>
      <div className="rounded-lg border border-brand-200/70 bg-brand-50/50 px-3 py-2 text-xs dark:border-brand-900/60 dark:bg-brand-950/20">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">Next action ({WINDOW_LABEL[ch.nextAction.window]})</p>
        <p className="text-ink-800 dark:text-ink-100">
          {ch.nextAction.title} — expected lift +{ch.nextAction.expectedLift} SVI
          {ch.nextAction.evidenceToAdd ? ` · evidence: ${ch.nextAction.evidenceToAdd}` : ""}
        </p>
      </div>
      <p className="text-xs text-ink-600 dark:text-ink-400">
        <span className="font-semibold">{GROWTH_PHASE_LABELS[ch.phaseLens.phaseId][locale]}:</span> {ch.phaseLens.whatMattersNow}
      </p>
      {ch.secondaryVisuals.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 print:break-inside-avoid">
          {ch.secondaryVisuals.map((v) => (
            <VisualFigure key={v.id} spec={v} caption={`${v.title} · ${stateLabel(v.dataState)}`} className="rounded-lg border border-ink-200 p-2 dark:border-ink-800" />
          ))}
        </div>
      )}
      <AuditStampLine audit={ch.audit} frameworks={ch.frameworks} />
    </TbrSection>
  );
}
