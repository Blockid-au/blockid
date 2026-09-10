/**
 * TimelineGantt — the 12-month SVG Gantt on the Money Finder report (T0244,
 * plan §4f / §4i D-4).
 *
 * Server component that renders inline SVG (no client JS, no chart library):
 *   • twelve month columns starting at `today`'s month;
 *   • one row per `TimelineItem`, bar from the action month to the deadline
 *     (or `lead_time_days` wide when no hard deadline), coloured by kind
 *     (grant / program / tax / event / milestone) — a fixed categorical
 *     order validated with the dataviz palette script in both modes;
 *   • a "today" marker; `<title>` hover on every bar with the lead time;
 *   • responsive via `viewBox` + `width="100%"`; ink / grid / surface colours
 *     come from the semantic `--color-*` tokens so light and dark both work,
 *     and the five series colours are re-stepped for dark in a scoped
 *     `<style>` (media query + `data-theme` scope, toggle wins both ways).
 *
 * The row label + legend carry identity in text (never colour-alone), and
 * `<TimelineTable>` is the table view for screen readers / print.
 */

import type { TimelineItem } from "@/lib/agents/grant-advisor";
import { formatDateAu } from "@/lib/funding/deadline-status";
import { monthShort } from "@/lib/funding/directory";
import { GANTT_KINDS, GANTT_MONTHS, ganttToday, ganttWindow, layoutBars, monthOffset } from "@/lib/funding/gantt-layout";

export { GANTT_KINDS, ganttWindow, layoutBars } from "@/lib/funding/gantt-layout";
export type { TimelineKind } from "@/lib/funding/gantt-layout";

const MONTHS = GANTT_MONTHS;
const LABEL_W = 200;
const COL_W = 56;
const ROW_H = 26;
const HEADER_H = 34;
const PAD_B = 22;
const BAR_H = 12;

export interface TimelineGanttProps {
  items: TimelineItem[];
  /** Report `today` (ISO date) — the window starts at this month. Defaults to now. */
  today?: string | Date | null;
  /** Founder state for AEST/AWST date rendering in the hover titles. */
  state?: string | null;
  className?: string;
  /** Max rows drawn (the rest fold into a "+N more" line). Default 24. */
  maxRows?: number;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export function TimelineGantt({ items, today, state, className, maxRows = 24 }: TimelineGanttProps) {
  const t = ganttToday(today);
  const { start, months } = ganttWindow(t);
  const { bars, hidden } = layoutBars(items, t, maxRows);
  const rows = Math.max(1, bars.length);
  const width = LABEL_W + COL_W * MONTHS;
  const height = HEADER_H + rows * ROW_H + PAD_B;
  const todayX = LABEL_W + monthOffset(start, t.getTime()) * COL_W;
  const kindsPresent = new Set(bars.map((b) => b.item.kind));

  const lightVars = GANTT_KINDS.map((k) => `--gantt-${k.kind}:${k.light};`).join("");
  const darkVars = GANTT_KINDS.map((k) => `--gantt-${k.kind}:${k.dark};`).join("");
  const css = `.fg-gantt{${lightVars}}@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .fg-gantt{${darkVars}}}:root[data-theme="dark"] .fg-gantt,.dark .fg-gantt{${darkVars}}`;

  if (bars.length === 0) {
    return (
      <p className="text-sm text-secondary" data-gantt-empty>
        Nothing dated in the next twelve months — rolling schemes can be lodged any time.
      </p>
    );
  }

  return (
    <figure className={`fg-gantt ${className ?? ""}`} data-timeline-gantt data-bars={bars.length}>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          style={{ minWidth: 640, display: "block" }}
          role="img"
          aria-labelledby="fg-gantt-title fg-gantt-desc"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          <title id="fg-gantt-title">12-month funding timeline</title>
          <desc id="fg-gantt-desc">
            {bars.length} dated actions from {months[0].label} to {months[MONTHS - 1].label}, one bar per grant, program, tax deadline or event.
          </desc>

          {/* Month columns + grid */}
          {months.map((m, i) => {
            const x = LABEL_W + i * COL_W;
            return (
              <g key={m.key} data-month={m.key}>
                {i % 2 === 1 ? (
                  <rect x={x} y={HEADER_H} width={COL_W} height={rows * ROW_H} fill="var(--color-surface-sunken)" />
                ) : null}
                <line x1={x} x2={x} y1={HEADER_H - 6} y2={height - PAD_B} stroke="var(--color-line-subtle)" strokeWidth={1} />
                <text x={x + COL_W / 2} y={HEADER_H - 10} textAnchor="middle" fontSize={11} fill="var(--color-tertiary)">
                  {m.label}
                </text>
              </g>
            );
          })}
          <line
            x1={LABEL_W}
            x2={width}
            y1={HEADER_H}
            y2={HEADER_H}
            stroke="var(--color-line)"
            strokeWidth={1}
          />

          {/* Bars */}
          {bars.map((b) => {
            const y = HEADER_H + b.row * ROW_H;
            const bx = LABEL_W + b.x0 * COL_W;
            const bw = Math.max(6, (b.x1 - b.x0) * COL_W - 2);
            const lead = b.item.lead_time_days ? `${b.item.lead_time_days} days lead time` : "no lead time recorded";
            const deadline = b.item.deadline ? ` · deadline ${formatDateAu(b.item.deadline, state)}` : "";
            return (
              <g key={`${b.item.ref_id}-${b.row}`} data-bar data-kind={b.item.kind}>
                <text x={LABEL_W - 10} y={y + ROW_H / 2 + 4} textAnchor="end" fontSize={11.5} fill="var(--color-primary)">
                  <title>{b.item.name}</title>
                  {truncate(b.item.name, 30)}
                </text>
                <rect
                  x={bx}
                  y={y + (ROW_H - BAR_H) / 2}
                  width={bw}
                  height={BAR_H}
                  rx={4}
                  fill={`var(--gantt-${b.item.kind})`}
                  stroke="var(--color-surface)"
                  strokeWidth={2}
                >
                  <title>{`${b.item.name} — ${b.item.action} · ${lead}${deadline}${b.clippedRight ? " · continues beyond 12 months" : ""}`}</title>
                </rect>
                {b.item.deadline ? (
                  <circle
                    cx={bx + bw}
                    cy={y + ROW_H / 2}
                    r={4}
                    fill={`var(--gantt-${b.item.kind})`}
                    stroke="var(--color-surface)"
                    strokeWidth={2}
                    data-deadline-dot
                  />
                ) : null}
              </g>
            );
          })}

          {/* Today marker — label sits below the rows so it never collides with the month header */}
          <g data-today-marker>
            <line x1={todayX} x2={todayX} y1={HEADER_H - 4} y2={height - PAD_B + 4} stroke="var(--color-bear)" strokeWidth={1.5} strokeDasharray="4 3" />
            <text x={todayX + 4} y={height - 6} fontSize={10} fontWeight={600} fill="var(--color-bear)">
              Today
            </text>
          </g>
        </svg>
      </div>

      <figcaption className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-secondary">
        {GANTT_KINDS.filter((k) => kindsPresent.has(k.kind)).map((k) => (
          <span key={k.kind} className="inline-flex items-center gap-1.5" data-legend={k.kind}>
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: `var(--gantt-${k.kind})` }} aria-hidden />
            {k.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-0 border-l-2 border-dashed border-bear" aria-hidden /> Today
        </span>
        {hidden > 0 ? <span className="text-tertiary">+{hidden} more in the table below</span> : null}
      </figcaption>
    </figure>
  );
}

/** Accessible table twin of the Gantt (also the print fallback). */
export function TimelineTable({ items, state, className }: { items: TimelineItem[]; state?: string | null; className?: string }) {
  if (!items.length) return null;
  const sorted = [...items].sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
  return (
    <div className={`overflow-x-auto ${className ?? ""}`}>
      <table className="w-full text-left text-sm" data-timeline-table>
        <thead>
          <tr className="border-b border-line-subtle text-xs uppercase tracking-wide text-tertiary">
            <th className="py-2 pr-3 font-semibold">Month</th>
            <th className="py-2 pr-3 font-semibold">Kind</th>
            <th className="py-2 pr-3 font-semibold">What</th>
            <th className="py-2 pr-3 font-semibold">Action</th>
            <th className="py-2 pr-3 font-semibold">Lead time</th>
            <th className="py-2 font-semibold">Deadline</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((it, i) => (
            <tr key={`${it.ref_id}-${i}`} className="border-b border-line-subtle/60 align-top">
              <td className="py-2 pr-3 whitespace-nowrap text-primary">{monthLabelFromKey(it.month)}</td>
              <td className="py-2 pr-3 whitespace-nowrap text-secondary">{GANTT_KINDS.find((k) => k.kind === it.kind)?.label ?? it.kind}</td>
              <td className="py-2 pr-3 font-medium text-primary">{it.name}</td>
              <td className="py-2 pr-3 text-secondary">{it.action}</td>
              <td className="py-2 pr-3 whitespace-nowrap text-secondary">{it.lead_time_days ? `${it.lead_time_days} days` : "—"}</td>
              <td className="py-2 whitespace-nowrap text-secondary">{it.deadline ? formatDateAu(it.deadline, state) : "Rolling"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function monthLabelFromKey(ym: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(ym);
  if (!m) return ym;
  return `${monthShort(Number(m[2]))} ${m[1]}`;
}

export default TimelineGantt;
