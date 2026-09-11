"use client";

// S17-B — SVI trend + AUD valuation band.
//
// Two stacked panels sharing one time axis (Recharts `syncId` keeps the hover
// in step): the SVI score line on top (0–100, left axis) and the valuation
// band below (low–high area + midpoint line, A$ compact ticks on the RIGHT
// axis). Two panels rather than one dual-axis chart — a second y-scale on the
// same plot is the dataviz anti-pattern the skill forbids, and SVI points vs
// A$ millions would never share a scale honestly.
//
// Data: `startup_score_history` rows (valuation_low_aud / valuation_high_aud
// written by POST /api/score → buildVcValuationReport + the S17-B connected
// revenue bridge). The band is hidden when no row carries a valuation; the
// empty copy is true to that writer (any scored analysis, free or paid).
//
// A11y: every chart ships a table twin (`<details>` → `<table>`) plus an
// sr-only summary sentence; colours are the validated dataviz slots
// (blue #2a78d6 / #3987e5 for SVI, aqua #1baf7a / #199e70 for valuation).

import * as React from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatAudCompact } from "@/lib/format-aud";

/* ─── Types ─────────────────────────────────────────────────────────────────── */

export interface ValuationTrendRow {
  id: string;
  /** ISO datetime (startup_score_history.created_at). */
  createdAt: string;
  /** total_score 0–100. */
  svi: number;
  lowAud: number | null;
  highAud: number | null;
  /** S17-B: "svi" | "svi+arr_multiple" | null (pre-migration rows). */
  method?: string | null;
  methodNote?: string | null;
  connectedMrrAud?: number | null;
  connectedMrrProvider?: string | null;
}

export interface ValuationTrendPoint {
  id: string;
  /** Short axis label, e.g. "12 Jun". */
  label: string;
  /** Long tooltip label, e.g. "12 Jun 2026". */
  labelLong: string;
  ts: number;
  svi: number;
  lowAud: number | null;
  highAud: number | null;
  midAud: number | null;
  /** Recharts Area range value — `[low, high]` or null (gap). */
  range: [number, number] | null;
  method: string | null;
  methodNote: string | null;
  connectedMrrAud: number | null;
  connectedMrrProvider: string | null;
}

export interface ValuationTrendData {
  points: ValuationTrendPoint[];
  hasValuation: boolean;
  /** True when every valued point is a single estimate (low === high) — no band, midpoint line only. */
  pointOnly: boolean;
  /** Latest point carrying a valuation, or null. */
  latestValuation: ValuationTrendPoint | null;
}

/* ─── Pure helpers (exported for tests) ─────────────────────────────────────── */

function fmtShort(ts: number): string {
  return new Date(ts).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function fmtLong(ts: number): string {
  return new Date(ts).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function positive(n: number | null | undefined): number | null {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

/** Sort chronologically, normalise the band, and derive the midpoint. */
export function buildValuationTrendData(rows: ValuationTrendRow[]): ValuationTrendData {
  const points: ValuationTrendPoint[] = rows
    .map((r) => ({ r, ts: new Date(r.createdAt).getTime() }))
    .filter(({ ts }) => Number.isFinite(ts))
    .sort((a, b) => a.ts - b.ts)
    .map(({ r, ts }) => {
      let low = positive(r.lowAud);
      let high = positive(r.highAud);
      if (low !== null && high !== null && low > high) [low, high] = [high, low];
      if (low === null && high !== null) low = high;
      if (high === null && low !== null) high = low;
      const mid = low !== null && high !== null ? Math.round((low + high) / 2) : null;
      return {
        id: r.id,
        label: fmtShort(ts),
        labelLong: fmtLong(ts),
        ts,
        svi: Math.round(r.svi),
        lowAud: low,
        highAud: high,
        midAud: mid,
        range: low !== null && high !== null ? ([low, high] as [number, number]) : null,
        method: r.method ?? null,
        methodNote: r.methodNote ?? null,
        connectedMrrAud: positive(r.connectedMrrAud),
        connectedMrrProvider: r.connectedMrrProvider ?? null,
      };
    });

  const withValuation = points.filter((p) => p.range !== null);
  return {
    points,
    hasValuation: withValuation.length > 0,
    pointOnly: withValuation.length > 0 && withValuation.every((p) => p.lowAud === p.highAud),
    latestValuation: withValuation.length ? withValuation[withValuation.length - 1] : null,
  };
}

/** "Stripe" / "Xero" for the method line; falls back to the raw provider. */
function providerLabel(p: string | null): string {
  if (!p) return "connected source";
  if (p === "stripe") return "Stripe";
  if (p === "xero") return "Xero";
  return p;
}

/** One-sentence sr-only summary for the figure. */
export function describeValuationTrend(data: ValuationTrendData, startupName?: string): string {
  const who = startupName ? `${startupName}: ` : "";
  if (data.points.length === 0) return `${who}no analyses yet.`;
  const first = data.points[0];
  const last = data.points[data.points.length - 1];
  const sviPart =
    data.points.length === 1
      ? `SVI ${last.svi} on ${last.labelLong}`
      : `SVI moved from ${first.svi} on ${first.labelLong} to ${last.svi} on ${last.labelLong} across ${data.points.length} analyses`;
  if (!data.latestValuation) return `${who}${sviPart}; no valuation range recorded yet.`;
  const v = data.latestValuation;
  if (data.pointOnly) return `${who}${sviPart}; latest estimated valuation ${formatAudCompact(v.midAud)} on ${v.labelLong}.`;
  return `${who}${sviPart}; latest valuation range ${formatAudCompact(v.lowAud)} to ${formatAudCompact(v.highAud)} (midpoint ${formatAudCompact(v.midAud)}) on ${v.labelLong}.`;
}

export const VALUATION_EMPTY_COPY =
  "Valuation appears after your first scored analysis — run a new score and the A$ range will chart here.";

/* ─── Theme (validated dataviz slots, light + dark) ─────────────────────────── */

interface VizTheme {
  svi: string;
  valuation: string;
  grid: string;
  axis: string;
  tick: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipInk: string;
  tooltipMuted: string;
}

const LIGHT: VizTheme = {
  svi: "#2a78d6",
  valuation: "#1baf7a",
  grid: "#e5e7eb",
  axis: "#d1d5db",
  tick: "#4b5563",
  tooltipBg: "#ffffff",
  tooltipBorder: "#e5e7eb",
  tooltipInk: "#0b0f1a",
  tooltipMuted: "#4b5563",
};

const DARK: VizTheme = {
  svi: "#3987e5",
  valuation: "#199e70",
  grid: "rgba(148, 163, 184, 0.16)",
  axis: "rgba(148, 163, 184, 0.28)",
  tick: "#c3c2b7",
  tooltipBg: "#111827",
  tooltipBorder: "rgba(148, 163, 184, 0.28)",
  tooltipInk: "#ffffff",
  tooltipMuted: "#c3c2b7",
};

/**
 * Mirrors globals.css: dark when `[data-theme="dark"]` / `.dark` is stamped,
 * or the OS prefers dark and no explicit light stamp overrides it.
 */
function readIsDark(): boolean {
  if (typeof document === "undefined") return false;
  const root = document.documentElement;
  const stamp = root.getAttribute("data-theme");
  if (stamp === "light") return false;
  if (stamp === "dark" || stamp === "lux" || root.classList.contains("dark")) return true;
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
}

function useVizTheme(): VizTheme {
  const [dark, setDark] = React.useState(false);
  React.useEffect(() => {
    const update = () => setDark(readIsDark());
    update();
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    mq?.addEventListener?.("change", update);
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    return () => {
      mq?.removeEventListener?.("change", update);
      obs.disconnect();
    };
  }, []);
  return dark ? DARK : LIGHT;
}

/* ─── Tooltip ───────────────────────────────────────────────────────────────── */

interface TooltipPayloadItem {
  payload?: ValuationTrendPoint;
}

function valuationText(p: ValuationTrendPoint, pointOnly: boolean): string {
  if (!p.range) return "—";
  if (pointOnly || p.lowAud === p.highAud) return formatAudCompact(p.midAud);
  return `${formatAudCompact(p.lowAud)} – ${formatAudCompact(p.highAud)}`;
}

function TrendTooltip({
  active,
  payload,
  theme,
  showValuation,
  pointOnly = false,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  theme: VizTheme;
  showValuation: boolean;
  pointOnly?: boolean;
}) {
  const p = active && payload && payload.length ? payload[0]?.payload : undefined;
  if (!p) return null;
  return (
    <div
      role="status"
      style={{
        background: theme.tooltipBg,
        border: `1px solid ${theme.tooltipBorder}`,
        borderRadius: 8,
        padding: "8px 10px",
        fontSize: 12,
        color: theme.tooltipInk,
        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
        maxWidth: 260,
      }}
    >
      <div style={{ color: theme.tooltipMuted, marginBottom: 4 }}>{p.labelLong}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 999, background: theme.svi, display: "inline-block" }} />
        <span>SVI</span>
        <strong style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>{p.svi}</strong>
      </div>
      {showValuation && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
          <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 999, background: theme.valuation, display: "inline-block" }} />
          <span>Valuation</span>
          <strong style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>
            {valuationText(p, pointOnly)}
          </strong>
        </div>
      )}
      {showValuation && p.method === "svi+arr_multiple" && (
        <div style={{ color: theme.tooltipMuted, marginTop: 4 }}>
          Includes connected revenue
          {p.connectedMrrAud ? ` (${formatAudCompact(p.connectedMrrAud)} MRR from ${providerLabel(p.connectedMrrProvider)})` : ""}
        </div>
      )}
      {showValuation && p.methodNote && (
        <div style={{ color: theme.tooltipMuted, marginTop: 2 }}>{p.methodNote}</div>
      )}
    </div>
  );
}

/* ─── Component ─────────────────────────────────────────────────────────────── */

interface Props {
  rows: ValuationTrendRow[];
  startupName?: string;
  /** Shorter panels for list cards. */
  compact?: boolean;
  /** Render only the valuation panel (host already draws its own SVI chart). */
  hideSvi?: boolean;
  /** Override the no-valuation copy when the writer differs from /api/score. */
  emptyCopy?: string;
  className?: string;
}

export function ValuationTrendChart({
  rows,
  startupName,
  compact = false,
  hideSvi = false,
  emptyCopy = VALUATION_EMPTY_COPY,
  className,
}: Props) {
  const theme = useVizTheme();
  const data = React.useMemo(() => buildValuationTrendData(rows), [rows]);
  const summary = describeValuationTrend(data, startupName);
  const syncId = React.useId();
  const tableId = React.useId();

  if (data.points.length === 0) return null;

  const sviH = compact ? 120 : 160;
  const valH = compact ? 150 : 200;
  const single = data.points.length === 1;
  const latest = data.latestValuation;
  const pointOnly = data.pointOnly;
  const valuationLegend = pointOnly ? "Estimated valuation (A$)" : "Valuation range (A$, low–high) · midpoint line";

  return (
    <figure
      className={className}
      role="group"
      aria-label={`SVI and valuation trend${startupName ? ` for ${startupName}` : ""}`}
      aria-describedby={tableId}
    >
      <p className="sr-only">{summary}</p>

      {/* ── Legend (identity is never colour-alone: label + swatch) ── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2 text-[11px] text-muted">
        {!hideSvi && (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block h-0.5 w-4 rounded" style={{ background: theme.svi }} />
            SVI score (0–100)
          </span>
        )}
        {data.hasValuation && (
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={pointOnly ? "inline-block h-0.5 w-4 rounded" : "inline-block h-2.5 w-4 rounded-sm"}
              style={
                pointOnly
                  ? { background: theme.valuation }
                  : { background: theme.valuation, opacity: 0.25, outline: `1px solid ${theme.valuation}` }
              }
            />
            {valuationLegend}
          </span>
        )}
      </div>

      {single ? (
        <p className="text-xs text-muted mb-2">
          One analysis so far — run another to see the trend line.
          {!hideSvi ? ` Latest SVI ${data.points[0].svi}` : ""}
          {latest ? `${hideSvi ? " Latest" : ","} valuation ${valuationText(latest, pointOnly)}` : ""}.
        </p>
      ) : (
        <>
          {/* ── Panel A: SVI ── */}
          {!hideSvi && (
          <div style={{ width: "100%", height: sviH }} data-testid="svi-panel">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.points} syncId={syncId} margin={{ top: 8, right: 56, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={theme.grid} strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fill: theme.tick, fontSize: 11 }} tickLine={false} axisLine={{ stroke: theme.axis }} minTickGap={24} />
                <YAxis domain={[0, 100]} ticks={[0, 50, 100]} width={36} tick={{ fill: theme.tick, fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip content={<TrendTooltip theme={theme} showValuation={false} />} cursor={{ stroke: theme.axis }} />
                <Line
                  name="SVI score"
                  type="monotone"
                  dataKey="svi"
                  stroke={theme.svi}
                  strokeWidth={2}
                  dot={{ r: 3, fill: theme.svi, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: theme.svi, stroke: theme.tooltipBg, strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          )}

          {/* ── Panel B: valuation band (A$, right axis) ── */}
          {data.hasValuation ? (
            <div style={{ width: "100%", height: valH }} className="mt-2" data-testid="valuation-panel">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data.points} syncId={syncId} margin={{ top: 8, right: 0, left: 36, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={theme.grid} strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fill: theme.tick, fontSize: 11 }} tickLine={false} axisLine={{ stroke: theme.axis }} minTickGap={24} />
                  <YAxis
                    orientation="right"
                    width={56}
                    tick={{ fill: theme.tick, fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => formatAudCompact(v)}
                    domain={[0, "auto"]}
                  />
                  <Tooltip content={<TrendTooltip theme={theme} showValuation pointOnly={pointOnly} />} cursor={{ stroke: theme.axis }} />
                  {!pointOnly && (
                  <Area
                    name="Valuation range"
                    type="monotone"
                    dataKey="range"
                    stroke={theme.valuation}
                    strokeWidth={1}
                    strokeOpacity={0.6}
                    fill={theme.valuation}
                    fillOpacity={0.18}
                    connectNulls={false}
                    isAnimationActive={false}
                    activeDot={false}
                    dot={false}
                  />
                  )}
                  <Line
                    name={pointOnly ? "Estimated valuation" : "Valuation midpoint"}
                    type="monotone"
                    dataKey="midAud"
                    stroke={theme.valuation}
                    strokeWidth={2}
                    dot={{ r: 3, fill: theme.valuation, strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: theme.valuation, stroke: theme.tooltipBg, strokeWidth: 2 }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted" data-testid="valuation-empty">
              {emptyCopy}
            </p>
          )}
        </>
      )}

      {/* ── Method line for the latest valuation ── */}
      {latest && latest.method === "svi+arr_multiple" && (
        <p className="mt-2 text-xs text-muted" data-testid="valuation-method-line">
          Includes connected revenue
          {latest.connectedMrrAud
            ? ` (${formatAudCompact(latest.connectedMrrAud)} MRR from ${providerLabel(latest.connectedMrrProvider)})`
            : ""}
          {latest.methodNote ? ` — ${latest.methodNote}` : ""}
        </p>
      )}

      {/* ── Table twin ── */}
      <details className="mt-3 group">
        <summary className="cursor-pointer list-none text-[11px] font-medium text-action hover:text-primary">
          View as table
        </summary>
        <div className="overflow-x-auto mt-2">
          <table id={tableId} className="w-full text-xs border-collapse">
            <caption className="sr-only">SVI score and AUD valuation range per analysis</caption>
            <thead>
              <tr className="border-b border-line-subtle text-left text-[10px] uppercase tracking-wider text-muted">
                <th scope="col" className="py-1.5 pr-3 font-semibold">Date</th>
                <th scope="col" className="py-1.5 pr-3 font-semibold text-right">SVI</th>
                {pointOnly ? (
                  <th scope="col" className="py-1.5 pr-3 font-semibold text-right">Valuation (A$)</th>
                ) : (
                  <>
                    <th scope="col" className="py-1.5 pr-3 font-semibold text-right">Low (A$)</th>
                    <th scope="col" className="py-1.5 pr-3 font-semibold text-right">High (A$)</th>
                  </>
                )}
                <th scope="col" className="py-1.5 font-semibold">Method</th>
              </tr>
            </thead>
            <tbody>
              {[...data.points].reverse().map((p) => (
                <tr key={p.id} className="border-b border-line-subtle/60">
                  <td className="py-1.5 pr-3 text-primary whitespace-nowrap">{p.labelLong}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-primary">{p.svi}</td>
                  {pointOnly ? (
                    <td className="py-1.5 pr-3 text-right tabular-nums text-primary">{formatAudCompact(p.midAud)}</td>
                  ) : (
                    <>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-primary">{formatAudCompact(p.lowAud)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-primary">{formatAudCompact(p.highAud)}</td>
                    </>
                  )}
                  <td className="py-1.5 text-muted">
                    {p.method === "svi+arr_multiple"
                      ? "SVI + connected ARR multiple"
                      : p.method
                        ? p.method
                        : p.range
                          ? "SVI"
                          : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
