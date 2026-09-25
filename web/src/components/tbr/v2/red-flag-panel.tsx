// G34 BT3 (RQ05 / RQ06) — the rule-derived red-flag panel and the why /
// stop / ask lists on page 1 (spec §1 "Red flags vs deal-breakers", §6).
// Red flags are deterministic rule outputs from `buildDashboardV4`; the
// "What could stop the deal" list is the grounded deal-breakers minus every
// item a red flag already covers (no item appears in both). Icon + text,
// never colour alone. Hook-free.

import type { DashboardV4, V4ListItem } from "@/lib/report-v2/dashboard-v4";
import type { CitationIndex } from "@/lib/report-v2/citations";
import { cn } from "@/lib/utils";
import { CitedText, TBR_V2_SECTION_IDS, type TbrUiLocale } from "./shared";

const PANEL_MAX = 5;

export function RedFlagPanel({ v4, className }: { v4: DashboardV4; className?: string }) {
  const s = v4.strings;
  const shown = v4.redFlags.slice(0, PANEL_MAX);
  const more = v4.redFlags.length - shown.length;
  return (
    <aside data-tbr-red-flags={v4.redFlags.length} aria-labelledby="tbr-red-flags-title" className={cn("min-w-0 rounded-xl border border-l-[3px] border-line-subtle border-l-bear bg-surface p-4", className)}>
      <h3 id="tbr-red-flags-title" className="flex items-center gap-1.5 font-display text-base font-semibold text-primary">
        <span aria-hidden="true" className="text-bear">▲</span>
        {s.redFlagsTitle}
      </h3>
      {shown.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{s.redFlagsNone}</p>
      ) : (
        <ul className="mt-2 space-y-2 text-sm leading-relaxed text-primary">
          {shown.map((f) => (
            <li key={f.id} data-tbr-red-flag={f.kind} className="flex gap-2">
              <span aria-hidden="true" className={f.kind === "degraded" ? "text-muted" : "text-bear"}>
                {f.kind === "degraded" ? "◌" : "▲"}
              </span>
              <span>{f.text}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 flex flex-wrap items-center gap-x-3 text-sm">
        {more > 0 ? <span className="text-muted">{s.redFlagsMore(more)}</span> : null}
        <a href={`#${TBR_V2_SECTION_IDS.riskMatrix}`} className="inline-flex min-h-11 items-center font-medium text-action underline underline-offset-4">
          {s.viewAllRisks} →
        </a>
      </p>
    </aside>
  );
}

function ListCard({ kind, title, glyph, items, empty, citations, locale, footer }: { kind: "why" | "stop" | "ask"; title: string; glyph: string; items: V4ListItem[]; empty: string; citations?: CitationIndex; locale?: TbrUiLocale; footer?: string | null }) {
  return (
    <details open data-tbr-list={kind} className={cn("group min-w-0 rounded-xl border border-line-subtle bg-surface", kind === "stop" ? "order-1 md:order-2" : kind === "why" ? "order-2 md:order-1" : "order-3")}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action">
        <span aria-hidden="true" className={kind === "why" ? "text-action" : kind === "stop" ? "text-bear" : "text-secondary"}>
          {glyph}
        </span>
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className={cn("ml-auto text-xs text-muted", "font-mono tabular-nums")}>{items.length}</span>
      </summary>
      <div className="border-t border-line-subtle px-4 py-3">
        {items.length ? (
          <ol className="space-y-2 text-sm leading-relaxed text-secondary">
            {items.map((item, i) => (
              <li key={`${kind}-${i}`} className="flex gap-2">
                <span aria-hidden="true" className="font-mono text-xs text-muted">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>
                  <CitedText text={item.text} citations={citations} locale={locale} />
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted">{empty}</p>
        )}
        {footer ? <p className="mt-2 text-xs text-muted">{footer}</p> : null}
      </div>
    </details>
  );
}

/** Why investigate · What could stop the deal · Ask before the meeting (≤ 3 each); on mobile the risks come first. */
export function WhyStopAskLists({ v4, citations, locale }: { v4: DashboardV4; citations?: CitationIndex; locale?: TbrUiLocale }) {
  const s = v4.strings;
  const locked = v4.lists.lockedDims > 0 ? s.lockedMore(v4.lists.lockedDims) : null;
  return (
    <div data-tbr-lists className="grid gap-3 md:grid-cols-3">
      <ListCard kind="why" title={s.why} glyph="✓" items={v4.lists.why} empty={s.whyEmpty} citations={citations} locale={locale} footer={locked} />
      <ListCard kind="stop" title={s.stop} glyph="▲" items={v4.lists.stop} empty={s.stopEmpty} citations={citations} locale={locale} footer={locked} />
      <ListCard kind="ask" title={s.ask} glyph="?" items={v4.lists.ask} empty={s.askEmpty} citations={citations} locale={locale} />
    </div>
  );
}
