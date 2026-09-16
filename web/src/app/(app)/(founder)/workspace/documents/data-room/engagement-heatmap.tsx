"use client";

// Founder-side engagement heatmap (S21-A): investor link × section, coloured
// by dwell, with the views count on every cell and a table twin.
//
// Dataviz rules applied:
//   - ONE sequential hue (blue, 100→700) for magnitude; the lightest step
//     means "opened, barely read", the surface means "not opened";
//   - colour never carries the value alone — every cell prints its views
//     and titles its dwell, and the table twin lists both;
//   - a scale legend sits next to the grid, not below a fold;
//   - "no data" is a sentence with a next step, not an empty grid.
//
// The model (`HeatmapModel`) is built server-side by
// lib/dataroom/engagement.ts; this file only draws it.

import * as React from "react";
import { Grid2x2, Loader2, Table2 } from "lucide-react";
import { formatRunDateTime } from "@/lib/analyses/summary";
import { formatDwell, heatBucket, type HeatmapModel } from "@/lib/dataroom/engagement";

/** Blue sequential ramp — steps 100 / 250 / 400 / 550 / 700 from the dataviz palette. */
export const HEAT_STEPS = ["#cde2fb", "#86b6ef", "#3987e5", "#1c5cab", "#0d366b"] as const;
/** Text colour that clears 4.5:1 on each step (dark on the two light steps, white above). */
const HEAT_TEXT = ["#0f172a", "#0f172a", "#ffffff", "#ffffff", "#ffffff"] as const;

export function cellStyle(bucket: 0 | 1 | 2 | 3 | 4): React.CSSProperties {
  if (bucket === 0) return {};
  return { backgroundColor: HEAT_STEPS[bucket - 1], color: HEAT_TEXT[bucket - 1] };
}

export interface EngagementHeatmapProps {
  dataRoomId: string | null | undefined;
  /** Test seam: skip the fetch and render this model. */
  initialModel?: HeatmapModel | null;
}

type Load =
  | { state: "idle" | "loading" }
  | { state: "error" }
  | { state: "ready"; model: HeatmapModel };

export function EngagementHeatmap({ dataRoomId, initialModel }: EngagementHeatmapProps) {
  // "loading" is the initial state whenever a fetch is coming, so the effect
  // only ever sets state from the fetch callback (react-hooks/set-state-in-effect).
  const [load, setLoad] = React.useState<Load>(
    initialModel ? { state: "ready", model: initialModel } : { state: "loading" },
  );
  const [view, setView] = React.useState<"grid" | "table">("grid");

  React.useEffect(() => {
    if (initialModel || !dataRoomId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/data-room/engage?roomId=${encodeURIComponent(dataRoomId)}`, {
          credentials: "same-origin",
        });
        const data = (await res.json().catch(() => null)) as
          | { ok?: boolean; analytics?: { heatmap?: HeatmapModel } }
          | null;
        if (cancelled) return;
        if (!res.ok || !data?.ok || !data.analytics?.heatmap) {
          setLoad({ state: "error" });
          return;
        }
        setLoad({ state: "ready", model: data.analytics.heatmap });
      } catch {
        if (!cancelled) setLoad({ state: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dataRoomId, initialModel]);

  if (!dataRoomId) return null;

  return (
    <div className="border-t border-line-subtle px-5 py-4" data-testid="engagement-heatmap">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-primary">
            <Grid2x2 aria-hidden strokeWidth={1.75} className="h-4 w-4" />
            What each investor read
          </h3>
          <p className="mt-1 text-xs text-secondary">
            Time on each section per link, reported by the room page as they read. Darker is longer.
          </p>
        </div>
        {load.state === "ready" && load.model.rows.length > 0 && (
          <div role="group" aria-label="Heatmap view" className="inline-flex rounded-lg border border-line-subtle p-0.5">
            <ToggleButton active={view === "grid"} onClick={() => setView("grid")} label="Grid">
              <Grid2x2 aria-hidden strokeWidth={1.75} className="h-3.5 w-3.5" />
            </ToggleButton>
            <ToggleButton active={view === "table"} onClick={() => setView("table")} label="Table">
              <Table2 aria-hidden strokeWidth={1.75} className="h-3.5 w-3.5" />
            </ToggleButton>
          </div>
        )}
      </div>

      {(load.state === "idle" || load.state === "loading") && (
        <p className="mt-3 flex items-center gap-2 text-sm text-secondary" role="status">
          <Loader2 aria-hidden strokeWidth={1.75} className="h-4 w-4 animate-spin motion-reduce:animate-none" />
          Loading engagement…
        </p>
      )}

      {load.state === "error" && (
        <p className="mt-3 text-sm text-secondary">
          We could not load engagement just now. Reload the page — events are still being recorded.
        </p>
      )}

      {load.state === "ready" && (load.model.rows.length === 0 || load.model.totalEvents === 0) && (
        <p className="mt-3 text-sm text-secondary" data-testid="engagement-heatmap-empty">
          {load.model.rows.length === 0
            ? "No investor links yet. Create one above; once it is opened, each section they read shows here."
            : "No reads yet. Once an investor opens a link, the sections they spend time on show here."}
        </p>
      )}

      {load.state === "ready" && load.model.rows.length > 0 && load.model.totalEvents > 0 && (
        <>
          {view === "grid" ? <HeatGrid model={load.model} /> : <HeatTable model={load.model} />}
          <p className="sr-only" data-testid="engagement-heatmap-summary">
            {summarise(load.model)}
          </p>
        </>
      )}
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors ${
        active ? "bg-surface-sunken text-primary" : "text-secondary hover:text-primary"
      }`}
    >
      {children}
      {label}
    </button>
  );
}

/** One sentence for screen readers: the most-read section and who read longest. */
export function summarise(model: HeatmapModel): string {
  if (model.rows.length === 0 || model.totalEvents === 0) return "No engagement recorded yet.";
  let top: { label: string; section: string; dwellMs: number } | null = null;
  for (const row of model.rows) {
    for (const c of row.cells) {
      if (!top || c.dwellMs > top.dwellMs) top = { label: row.label, section: c.section, dwellMs: c.dwellMs };
    }
  }
  if (!top || top.dwellMs <= 0) return `${model.rows.length} investor links, ${model.totalEvents} events, no dwell recorded yet.`;
  return `${model.rows.length} investor links across ${model.sections.length} sections. Longest read: ${top.label} on ${top.section}, ${formatDwell(top.dwellMs)}.`;
}

function HeatGrid({ model }: { model: HeatmapModel }) {
  return (
    <div className="mt-3">
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-1 text-xs" aria-label="Engagement by investor link and section">
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-surface-raised text-left font-medium text-muted">
                Investor link
              </th>
              {model.sections.map((s) => (
                <th key={s} scope="col" className="min-w-24 text-left align-bottom font-medium text-muted">
                  <span className="line-clamp-2">{s}</span>
                </th>
              ))}
              <th scope="col" className="text-right font-medium text-muted">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {model.rows.map((row) => (
              <tr key={row.linkId}>
                <th scope="row" className="sticky left-0 z-10 max-w-40 truncate bg-surface-raised text-left font-semibold text-primary">
                  {row.label}
                  {row.opens > 0 && (
                    <span className="block text-[10px] font-normal text-tertiary">
                      {row.opens} open{row.opens === 1 ? "" : "s"}
                      {row.downloads > 0 ? ` · ${row.downloads} download${row.downloads === 1 ? "" : "s"}` : ""}
                    </span>
                  )}
                </th>
                {row.cells.map((c) => {
                  const bucket = heatBucket(c, model.maxDwellMs);
                  return (
                    <td
                      key={c.section}
                      className={`h-11 min-w-24 rounded-md border px-2 text-center tabular-nums ${
                        bucket === 0 ? "border-line-subtle text-faint" : "border-transparent"
                      }`}
                      style={cellStyle(bucket)}
                      title={c.views > 0 ? `${row.label} · ${c.section}: ${c.views} view${c.views === 1 ? "" : "s"}, ${formatDwell(c.dwellMs)}` : `${row.label} · ${c.section}: not opened`}
                      data-bucket={bucket}
                    >
                      {c.views > 0 ? (
                        <>
                          <span className="font-semibold">{c.views}</span>
                          <span className="block text-[10px] opacity-90">{formatDwell(c.dwellMs)}</span>
                        </>
                      ) : (
                        <span aria-label="not opened">·</span>
                      )}
                    </td>
                  );
                })}
                <td className="text-right tabular-nums text-secondary">{formatDwell(row.totalDwellMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ScaleLegend maxDwellMs={model.maxDwellMs} />
    </div>
  );
}

function ScaleLegend({ maxDwellMs }: { maxDwellMs: number }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-tertiary" aria-label="Colour scale">
      <span>Not opened</span>
      <span className="inline-block h-3 w-5 rounded-sm border border-line-subtle" aria-hidden />
      <span>Opened</span>
      {HEAT_STEPS.map((hex, i) => (
        <span key={hex} className="inline-block h-3 w-5 rounded-sm" style={{ backgroundColor: hex }} aria-hidden data-step={i + 1} />
      ))}
      <span>{maxDwellMs > 0 ? `${formatDwell(maxDwellMs)} (longest)` : "longest"}</span>
    </div>
  );
}

function HeatTable({ model }: { model: HeatmapModel }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-xs" data-testid="engagement-heatmap-table">
        <caption className="sr-only">Views and time on each section, per investor link</caption>
        <thead>
          <tr className="border-b border-line-subtle text-left text-muted">
            <th scope="col" className="py-1.5 pr-3 font-medium">
              Investor link
            </th>
            <th scope="col" className="py-1.5 pr-3 font-medium">
              Section
            </th>
            <th scope="col" className="py-1.5 pr-3 text-right font-medium">
              Views
            </th>
            <th scope="col" className="py-1.5 pr-3 text-right font-medium">
              Time
            </th>
            <th scope="col" className="py-1.5 font-medium">
              Last seen
            </th>
          </tr>
        </thead>
        <tbody>
          {model.rows.flatMap((row) =>
            row.cells
              .filter((c) => c.views > 0)
              .map((c) => (
                <tr key={`${row.linkId}-${c.section}`} className="border-b border-line-subtle">
                  <th scope="row" className="py-1.5 pr-3 text-left font-semibold text-primary">
                    {row.label}
                  </th>
                  <td className="py-1.5 pr-3 text-primary">{c.section}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-primary">{c.views}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-primary">{formatDwell(c.dwellMs)}</td>
                  <td className="py-1.5 text-tertiary">{formatRunDateTime(row.lastSeen) || "—"}</td>
                </tr>
              )),
          )}
        </tbody>
      </table>
    </div>
  );
}
