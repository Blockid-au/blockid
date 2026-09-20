// Shared bits for the ReportV2 web chapters — hook-free so every piece
// renders in server components (/tbr/demo) and the client TBR alike.

import { cn } from "@/lib/utils";
import { GROWTH_PHASE_LABELS } from "@/lib/growth/phase-taxonomy";
import type { GrowthPhaseId } from "@/lib/growth/phase-taxonomy";
import { getTbrStrings, type TbrLocale } from "@/lib/i18n/tbr-strings";
import type { Band, DataState } from "@/lib/report-visuals/types";
import type { AuditStamp } from "@/lib/report-v2/schema";

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

export function TbrSection({ id, title, kicker, children, className }: { id: string; title: string; kicker?: string; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={cn("scroll-mt-24 space-y-4 print:break-before-auto", className)} aria-labelledby={`${id}-h`}>
      <div className="flex items-baseline gap-3 border-b border-ink-200 pb-2 dark:border-ink-800">
        {kicker && <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400 dark:text-ink-500">{kicker}</span>}
        <h2 id={`${id}-h`} className="text-lg font-bold text-ink-900 dark:text-ink-100 print:text-xl">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

export function AgentBadge({ role, kind = "owner" }: { role: string; kind?: "owner" | "support" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide",
        kind === "owner"
          ? "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-800 dark:bg-brand-950/40 dark:text-brand-300"
          : "border-ink-200 bg-white text-ink-500 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-400",
      )}
    >
      {role}
    </span>
  );
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
