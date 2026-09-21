// G27 — v3 primitives shared by the dashboard, investment view, chapters,
// risk matrix and plan: stat tiles, band / verdict chips (dot + label, never
// colour alone), the four callouts (takeaway · risk · improve · note), the
// 8-dimension bar chart figure with its legend + table twin, and the
// scrolling table wrapper with a sticky first column for 375 px. Light
// template only (spec § 5): navy `--color-brand-navy` accent, dark ink,
// sunken panels; every colour is a semantic token from globals.css. Hook-free.

import { renderVisual } from "@/lib/report-visuals";
import type { Band, VisualSpecV2 } from "@/lib/report-visuals/types";
import type { InvestmentBand, RiskLevel } from "@/lib/report-v2/schema";
import { getTbrV3Strings, type TbrV3Strings } from "@/lib/i18n/tbr-v3-strings";
import { cn } from "@/lib/utils";
import { bandLabel, type TbrUiLocale } from "./shared";

/** The v3 label block for a UI locale (EN / VI; ES / JA read EN). */
export function v3Strings(locale: TbrUiLocale | undefined): TbrV3Strings {
  return getTbrV3Strings(locale);
}

/** Mono, tabular figures everywhere a number is printed (spec § 5 type scale). */
export const FIGURE_CLASS = "font-mono tabular-nums";
/** Sticky first column inside an `overflow-x-auto` wrapper (375 px tables). */
export const STICKY_COL_CLASS = "sticky left-0 z-[1] bg-surface";
export const TABLE_SCROLL_CLASS = "overflow-x-auto rounded-lg border border-line-subtle print:overflow-visible";
export const TABLE_MIN_CLASS = "w-full min-w-[640px] text-sm";
export const TH_CLASS = "px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted";
export const TD_CLASS = "px-3 py-2.5 align-top text-primary";

// ── Band chip: dot carries BAND_COLOUR, text stays ink ──────────────────────

const BAND_DOT: Record<Band, string> = {
  strong: "bg-action",
  developing: "bg-warn",
  early: "bg-bear",
  pending: "bg-line",
};

export function BandChip({ band, locale, className }: { band: Band; locale?: TbrUiLocale; className?: string }) {
  return (
    <span data-tbr-band-chip={band} className={cn("inline-flex items-center gap-1.5 rounded-full border border-line-subtle bg-surface px-2 py-0.5 text-xs font-medium text-primary", className)}>
      <span aria-hidden="true" className={cn("h-2 w-2 shrink-0 rounded-full", BAND_DOT[band])} />
      {bandLabel(band, locale)}
    </span>
  );
}

/** The verdict band letter (A–D) as a navy square + label; the letter is the identity, the label the meaning. */
export function VerdictBandBadge({ band, label, size = "md", className }: { band: InvestmentBand; label: string; size?: "md" | "lg"; className?: string }) {
  return (
    <span data-tbr-verdict-band={band} className={cn("inline-flex items-center gap-2", className)}>
      <span aria-hidden="true" className={cn("inline-flex shrink-0 items-center justify-center rounded-md bg-action font-display font-bold text-on-action", size === "lg" ? "h-10 w-10 text-xl" : "h-7 w-7 text-sm")}>
        {band}
      </span>
      <span className={cn("font-display font-semibold text-primary", size === "lg" ? "text-lg" : "text-sm")}>
        <span className="sr-only">{band} · </span>
        {label}
      </span>
    </span>
  );
}

// ── Stat tile ───────────────────────────────────────────────────────────────

export function StatTile({ id, label, value, sub, note, band, className }: { id: string; label: string; value: string; sub?: string; note?: string; band?: Band; className?: string }) {
  return (
    <div data-tbr-tile={id} className={cn("flex min-w-0 flex-col gap-1 rounded-xl border border-line-subtle bg-surface p-4 print:break-inside-avoid", className)}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className={cn("break-words font-bold leading-none text-primary", FIGURE_CLASS, value.length > 8 ? "text-2xl md:text-[1.6rem] lg:text-2xl xl:text-3xl" : "text-3xl md:text-4xl")} title={value}>
        {value}
      </p>
      {sub ? (
        <p className="flex flex-wrap items-center gap-1.5 text-sm text-secondary">
          {band ? <span aria-hidden="true" className={cn("h-2 w-2 shrink-0 rounded-full", BAND_DOT[band])} /> : null}
          <span>{sub}</span>
        </p>
      ) : null}
      {note ? <p className={cn("text-xs text-muted", FIGURE_CLASS)}>{note}</p> : null}
    </div>
  );
}

// ── Callouts: 4 px left rule, body ink, icon + label never colour alone ─────

export type CalloutKind = "takeaway" | "risk" | "improve" | "note";

const CALLOUT_RULE: Record<CalloutKind, string> = {
  takeaway: "border-brand-navy",
  risk: "border-bear",
  improve: "border-warn",
  note: "border-line",
};
const CALLOUT_ICON: Record<CalloutKind, string> = { takeaway: "◆", risk: "▲", improve: "▸", note: "•" };

export function Callout({ kind, title, children, className, testId }: { kind: CalloutKind; title?: string; children: React.ReactNode; className?: string; testId?: string }) {
  return (
    <aside data-tbr-callout={kind} data-testid={testId} className={cn("rounded-r-lg border-l-4 bg-surface-sunken px-4 py-3 print:break-inside-avoid", CALLOUT_RULE[kind], className)}>
      {title ? (
        <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-secondary">
          <span aria-hidden="true">{CALLOUT_ICON[kind]}</span>
          {title}
        </p>
      ) : null}
      <div className="text-sm leading-relaxed text-primary">{children}</div>
    </aside>
  );
}

// ── Risk level chip (label + glyph, never colour alone) ─────────────────────

const LEVEL_GLYPH: Record<RiskLevel, string> = { high: "●●●", medium: "●●○", low: "●○○" };

export function LevelChip({ level, locale }: { level: RiskLevel; locale?: TbrUiLocale }) {
  const t = v3Strings(locale);
  return (
    <span data-tbr-level={level} className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-line-subtle bg-surface px-2 py-0.5 text-xs text-primary", FIGURE_CLASS)}>
      <span aria-hidden="true" className={level === "high" ? "text-bear" : level === "medium" ? "text-warn" : "text-muted"}>
        {LEVEL_GLYPH[level]}
      </span>
      {t.level[level]}
    </span>
  );
}

// ── The 8-dimension bar chart figure ────────────────────────────────────────

export function DimBarChart({ chart, caption, legend, showBand, locale, className }: { chart: VisualSpecV2; caption: string; legend: string[]; showBand: boolean; locale?: TbrUiLocale; className?: string }) {
  const t = v3Strings(locale);
  const rows = chart.a11y.tableFallback;
  const cols = rows.length ? Object.keys(rows[0]!) : [];
  return (
    <figure data-tbr-dim-bars className={cn("rounded-xl border border-line-subtle bg-surface p-3 print:break-inside-avoid md:p-4", className)}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t.chartTitle}</p>
      {/* Two renders of the one geometry: the wide chart (labels beside bars) from md up, the compact one (labels above bars, spec § 5 "375 px") below. Our own escaped renderer output feeds dangerouslySetInnerHTML (same rule as VisualFigure). */}
      <div className="mt-2 hidden w-full md:block [&>svg]:h-auto [&>svg]:w-full [&>svg]:max-w-full" data-visual-kind={chart.kind} data-visual-state={chart.dataState} dangerouslySetInnerHTML={{ __html: renderVisual(chart) }} />
      {/* Drawn at 300 SVG units so a 343 px card (375 − gutters) scales it ≈ 1:1 — the 12 px labels stay 12 px. */}
      <div className="mt-2 w-full md:hidden [&>svg]:h-auto [&>svg]:w-full [&>svg]:max-w-full" aria-hidden="true" dangerouslySetInnerHTML={{ __html: renderVisual(chart, { width: 300 }) }} />
      <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>{caption}</span>
        <span className="flex flex-wrap items-center gap-3" aria-label={legend.join(", ")}>
          <span className="inline-flex items-center gap-1">
            <span aria-hidden="true" className="inline-block h-2.5 w-4 rounded-sm bg-action" />
            {legend[0]}
          </span>
          {showBand ? (
            <>
              <span className="inline-flex items-center gap-1">
                <span aria-hidden="true" className="inline-block h-2.5 w-4 rounded-sm border border-line bg-surface-sunken" />
                {legend[1]}
              </span>
              <span className="inline-flex items-center gap-1">
                <span aria-hidden="true" className="inline-block h-3 w-0.5 bg-muted" />
                {legend[2]}
              </span>
            </>
          ) : null}
        </span>
      </figcaption>
      {rows.length > 0 ? (
        <details className="mt-2 text-xs">
          <summary className="min-h-11 cursor-pointer py-3 leading-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy text-action underline-offset-2 hover:underline">{t.tableView}</summary>
          <div className={cn("mt-2", TABLE_SCROLL_CLASS)}>
            <table className="w-full min-w-[420px] text-xs">
              <caption className="sr-only">{chart.a11y.title}</caption>
              <thead>
                <tr>
                  {cols.map((c, i) => (
                    <th key={c} scope="col" className={cn(TH_CLASS, i === 0 ? STICKY_COL_CLASS : "text-right")}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t border-line-subtle">
                    {cols.map((c, j) => (
                      <td key={c} className={cn("px-3 py-1.5", j === 0 ? cn(STICKY_COL_CLASS, "text-primary") : cn("text-right text-secondary", FIGURE_CLASS))}>
                        {String(r[c] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </figure>
  );
}
