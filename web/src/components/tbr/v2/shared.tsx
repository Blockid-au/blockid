// Shared bits for the ReportV2 web chapters — hook-free so every piece
// renders in server components (/tbr/demo) and the client TBR alike.

import { cn } from "@/lib/utils";
import { GROWTH_PHASE_LABELS } from "@/lib/growth/phase-taxonomy";
import type { GrowthPhaseId } from "@/lib/growth/phase-taxonomy";
import { getTbrStrings, type TbrLocale } from "@/lib/i18n/tbr-strings";
import { DIMENSION_OWNERS, type DimKey } from "@/lib/report-pipeline/dimension-owners";
import type { Band, DataState } from "@/lib/report-visuals/types";
import { proseParagraphs } from "@/lib/report-v2/paragraphs";
import type { ActionWindow, AuditStamp } from "@/lib/report-v2/schema";

// ── G19-S47 typography scale ────────────────────────────────────────────────
//
//   section 48 px (report.tsx `space-y-12`) · block 24 px (`TbrSection`
//   `space-y-6`) · item 12 px (`space-y-3`). Body prose is `max-w-prose
//   leading-relaxed`; verdicts and card text are split into ≤ 3-sentence
//   paragraphs (`lib/report-v2/paragraphs.ts`); tables share TABLE / THEAD /
//   zebra rows; every chip (dim, agent, source, window, band, state) is
//   `<Chip>` so the report reads as one system.

export const TBR_SPACING = { section: "space-y-12", block: "space-y-6", item: "space-y-3" } as const;
export const PROSE_CLASS = "max-w-prose text-sm leading-relaxed text-ink-800 dark:text-ink-200";
export const TABLE_CLASS = "w-full text-xs";
/** Sticky header row (inside a scrolling wrapper) — background so rows never show through. */
export const THEAD_CLASS = "sticky top-0 z-[1] bg-white text-left text-[10px] uppercase tracking-wide text-ink-500 dark:bg-ink-950 dark:text-ink-400";
export const TABLE_WRAP_CLASS = "max-h-[70vh] overflow-auto rounded-lg border border-ink-200 dark:border-ink-800 print:max-h-none print:overflow-visible";
/** Zebra rows: every second body row on the sunken surface. */
export function zebraRow(i: number, extra?: string): string {
  return cn("border-t border-ink-100 dark:border-ink-800/60", i % 2 === 1 && "bg-ink-50/60 dark:bg-ink-900/30", extra);
}

/** G19-S45: every ReportV2 web chapter takes the UI locale the shell offers (EN / VI / ES / JA). */
export type TbrUiLocale = TbrLocale;

/** The ReportV2 label block for a locale (`tbr-strings.ts` §v2). */
export function v2Strings(locale: TbrUiLocale | undefined) {
  return getTbrStrings(locale).v2;
}

/** Growth-phase label — VI has its own, ES / JA read the English label. */
export function phaseLabel(id: GrowthPhaseId, locale: TbrUiLocale | undefined): string {
  return GROWTH_PHASE_LABELS[id][locale === "vi" ? "vi" : "en"];
}

/** Valuation strings exist for EN / VI only; ES / JA fall back to EN. */
export function valuationLocale(locale: TbrUiLocale | undefined): "en" | "vi" {
  return locale === "vi" ? "vi" : "en";
}

export const TBR_V2_SECTION_IDS = {
  cover: "tbr-cover",
  executive: "tbr-executive",
  dim: (dim: string) => `tbr-dim-${dim}`,
  valuation: "tbr-valuation",
  phaseGates: "tbr-phase-gates",
  money: "tbr-money",
  actionPlan: "tbr-action-plan",
  appendix: "tbr-appendix",
} as const;

export function bandText(band: Band): string {
  if (band === "strong") return "text-[#0072B2] dark:text-sky-300";
  if (band === "developing") return "text-[#B8770A] dark:text-amber-300";
  if (band === "early") return "text-[#A8420A] dark:text-orange-300";
  return "text-ink-500 dark:text-ink-400";
}

export function bandSurface(band: Band): string {
  if (band === "strong") return "border-sky-200 bg-sky-50/50 dark:border-sky-900 dark:bg-sky-950/20";
  if (band === "developing") return "border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20";
  if (band === "early") return "border-orange-200 bg-orange-50/50 dark:border-orange-900 dark:bg-orange-950/20";
  return "border-ink-200 bg-ink-50/50 dark:border-ink-800 dark:bg-ink-900/30";
}

export function bandLabel(band: Band, locale: TbrUiLocale = "en"): string {
  return v2Strings(locale).band[band];
}

export function stateLabel(state: DataState, locale: TbrUiLocale = "en"): string {
  return v2Strings(locale).state[state];
}

/**
 * G19-S44: `pageBreak` puts the section on a fresh printed page (cover,
 * executive, valuation, appendix) — dimension chapters flow.
 */
export function TbrSection({ id, title, kicker, purpose, children, className, pageBreak = false }: { id: string; title: string; kicker?: string; /** G19-S47: one-line purpose under the title (number · title · purpose). */ purpose?: string; children: React.ReactNode; className?: string; pageBreak?: boolean }) {
  return (
    <section id={id} className={cn("scroll-mt-24", TBR_SPACING.block, pageBreak ? "print:break-before-page" : "print:break-before-auto", className)} aria-labelledby={`${id}-h`}>
      <div className="border-b border-ink-200 pb-3 dark:border-ink-800">
        <div className="flex items-baseline gap-3">
          {kicker && <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400 dark:text-ink-500">{kicker}</span>}
          <h2 id={`${id}-h`} className="font-display text-lg font-bold tracking-tight text-ink-900 dark:text-ink-100 print:text-xl">
            {title}
          </h2>
        </div>
        {purpose && (
          <p data-tbr-section-purpose className="mt-1 max-w-prose text-xs leading-relaxed text-ink-500 dark:text-ink-400">
            {purpose}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

// ── G19-S47: one chip family ────────────────────────────────────────────────

export type ChipKind = "dim" | "agent" | "support" | "source" | "window" | "band" | "state" | "lift" | "neutral";

const CHIP_TONE: Record<ChipKind, string> = {
  dim: "border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100 dark:border-brand-800 dark:bg-brand-950/40 dark:text-brand-300",
  agent: "border-brand-200 bg-brand-50 font-mono uppercase text-brand-700 dark:border-brand-800 dark:bg-brand-950/40 dark:text-brand-300",
  support: "border-ink-200 bg-white font-mono uppercase text-ink-500 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-400",
  source: "border-ink-200 bg-white text-ink-600 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-300",
  window: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300",
  band: "border-ink-200 bg-white text-ink-600 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-300",
  state: "border-ink-200 bg-ink-50 text-ink-500 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-400",
  lift: "border-ink-200 bg-white tabular-nums text-ink-500 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-400",
  neutral: "border-ink-200 bg-white text-ink-600 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-300",
};

/** The one chip: `href` renders an anchor (dim chips link to their chapter). */
export function Chip({ kind, children, href, title, className, testId }: { kind: ChipKind; children: React.ReactNode; href?: string; title?: string; className?: string; testId?: string }) {
  const cls = cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide", CHIP_TONE[kind], className);
  if (href) {
    return (
      <a href={href} title={title} aria-label={title} data-tbr-chip={kind} data-testid={testId} className={cn(cls, "underline-offset-2 hover:underline")}>
        {children}
      </a>
    );
  }
  return (
    <span title={title} data-tbr-chip={kind} data-testid={testId} className={cls}>
      {children}
    </span>
  );
}

/** Short chapter label for a dim chip — EN short label, VI chapter title. */
export function dimChipLabel(dim: DimKey, locale: TbrUiLocale | undefined): string {
  const owner = DIMENSION_OWNERS[dim];
  return locale === "vi" ? owner.titleVi : owner.shortLabel;
}

/** Dim chip linking to the chapter (`#tbr-dim-<dim>`), labelled with the localised chapter name. */
export function DimChip({ dim, locale, className }: { dim: DimKey; locale?: TbrUiLocale; className?: string }) {
  const s47 = v2Strings(locale).s47;
  const label = dimChipLabel(dim, locale);
  return (
    <Chip kind="dim" href={`#${TBR_V2_SECTION_IDS.dim(dim)}`} title={s47.openChapter(label)} className={className}>
      <span className="font-mono uppercase">{dim}</span>
      <span aria-hidden="true">·</span>
      <span>{label}</span>
    </Chip>
  );
}

/** Window chip ("this week" / "next 30 days" / "next 90 days") from the one label table. */
export function WindowChip({ window, locale }: { window: ActionWindow; locale?: TbrUiLocale }) {
  return <Chip kind="window">{v2Strings(locale).chapter.window[window]}</Chip>;
}

/** G19-S47: body prose as ≤ 3-sentence paragraphs on the prose measure (markdown stripped). */
export function Prose({ text, className, size = "sm", testId }: { text: string; className?: string; size?: "sm" | "xs"; testId?: string }) {
  const paras = proseParagraphs(text);
  if (!paras.length) return null;
  return (
    <div data-testid={testId} className={cn("max-w-prose", TBR_SPACING.item.replace("space-y-3", "space-y-2"), className)}>
      {paras.map((p, i) => (
        <p key={i} className={cn("leading-relaxed", size === "sm" ? "text-sm text-ink-800 dark:text-ink-200" : "text-xs text-ink-600 dark:text-ink-300")}>
          {p}
        </p>
      ))}
    </div>
  );
}

export function AgentBadge({ role, kind = "owner" }: { role: string; kind?: "owner" | "support" }) {
  return <Chip kind={kind === "owner" ? "agent" : "support"}>{role}</Chip>;
}

export function AuditStampLine({ audit, frameworks, locale = "en" }: { audit: AuditStamp; frameworks?: string[]; locale?: TbrUiLocale }) {
  const t = v2Strings(locale).audit;
  return (
    <p className="text-[11px] text-ink-500 dark:text-ink-500">
      {t.auditor}: {audit.grounded ? t.grounded : t.notAudited}
      {audit.uncited > 0 ? ` · ${t.uncited(audit.uncited)}` : ""}
      {audit.revised ? ` · ${t.revised}` : ""}
      {frameworks && frameworks.length > 0 ? ` · ${t.frameworks}: ${frameworks.slice(0, 4).join("; ")}` : ""}
    </p>
  );
}

export function Bullets({ items, tone, title }: { items: string[]; tone: "good" | "bad" | "neutral"; title: string }) {
  if (!items.length) return null;
  const cls =
    tone === "good"
      ? "border-sky-200/70 bg-sky-50/50 dark:border-sky-900/60 dark:bg-sky-950/20"
      : tone === "bad"
        ? "border-orange-200/70 bg-orange-50/50 dark:border-orange-900/60 dark:bg-orange-950/20"
        : "border-ink-200/70 bg-ink-50/50 dark:border-ink-800/60 dark:bg-ink-900/30";
  return (
    <div className={cn("rounded-lg border p-3", cls)}>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-600 dark:text-ink-300">{title}</p>
      <ul className="space-y-1 text-xs text-ink-700 dark:text-ink-200">
        {items.map((s, i) => (
          <li key={i} className="flex gap-1.5">
            <span aria-hidden="true">{tone === "good" ? "✓" : tone === "bad" ? "▲" : "•"}</span>
            <span>{s}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
