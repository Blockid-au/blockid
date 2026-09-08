/**
 * DimensionRadar — the eight-dimension shape, drawn as hand-authored inline
 * SVG. No chart library: this renders in the first paint of the page.
 *
 * FORM (dataviz). Emphasis, not categorical. The subject is one run; the
 * Australian cohort is context. So the cohort band wears neutral surface
 * grey and the run's readings wear the single data hue (`action`), which
 * is the only data colour used anywhere on this page. One hue means there
 * is no colour-blindness failure mode to validate away, and the reading
 * order — subject first, context second — is carried by the colour itself.
 *
 * HONESTY. The published anonymised card carries four of the eight
 * dimension readings. The chart therefore plots four dots, not an
 * eight-point polygon: interpolating a shape through values that were
 * never published would be inventing the product's output. The four
 * unpublished axes show the cohort band alone, and the table beneath says
 * so in words.
 *
 * MARKS. Hairline grid one step off the surface; 2px band edges; 9px dots
 * with a 2px surface ring so a dot stays legible where it crosses the band
 * edge. Values are direct-labelled beside their dot — sparingly, four of
 * eight — and every value, plotted or not, is in the table twin below.
 */

import {
  cohortBandsForRun,
  cohortStageLabel,
  type SampleRun,
} from "./sample-runs";

// Geometry. The viewBox is deliberately tight around the plot: an SVG
// scales its type with its width, so a roomy viewBox would have rendered
// eight-point axis labels at 390px. At this size the labels land near 11px
// on a phone and near 15px on a desktop card capped at 400px — legible at
// both ends without two copies of the chart.
const VB_W = 340;
const VB_H = 312;
const CX = 170;
const CY = 152;
const R = 78; // radius at a score of 100
const R_LABEL = 84;
const RINGS = [25, 50, 75, 100];
const AXIS_FONT = 12.5;
const VALUE_FONT = 13;

function point(index: number, value: number): [number, number] {
  const angle = ((-90 + index * 45) * Math.PI) / 180;
  const r = (R * value) / 100;
  return [CX + r * Math.cos(angle), CY + r * Math.sin(angle)];
}

function polygon(values: number[]): string {
  return (
    values
      .map((v, i) => {
        const [x, y] = point(i, v);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ") + " Z"
  );
}

/** Where a two-line axis label sits, and how it hangs off its axis. */
function labelLayout(index: number): {
  x: number;
  y: number;
  anchor: "start" | "middle" | "end";
} {
  const angle = ((-90 + index * 45) * Math.PI) / 180;
  const x = CX + R_LABEL * Math.cos(angle);
  const y = CY + R_LABEL * Math.sin(angle);
  if (index === 0) return { x: CX, y: y - 8, anchor: "middle" };
  if (index === 4) return { x: CX, y: y + 18, anchor: "middle" };
  const anchor = index < 4 ? "start" : "end";
  return { x: anchor === "start" ? x + 6 : x - 6, y: y - 2, anchor };
}

export interface DimensionRadarProps {
  run: SampleRun;
}

export function DimensionRadar({ run }: DimensionRadarProps) {
  const bands = cohortBandsForRun(run);
  const stageLabel = cohortStageLabel(run);
  const outer = polygon(bands.map((b) => b.top));
  const inner = polygon(bands.map((b) => b.avg));
  const titleId = `radar-title-${run.id}`;
  const descId = `radar-desc-${run.id}`;
  const plotted = bands.filter((b) => b.measured !== null);

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        role="img"
        aria-labelledby={`${titleId} ${descId}`}
        className="mx-auto block h-auto w-full max-w-[400px]"
      >
        <title id={titleId}>
          Eight scoring dimensions for a {run.stage.toLowerCase()} run
        </title>
        <desc id={descId}>
          {`The shaded ring is the Australian cohort at ${stageLabel} stage, from average to top quartile. Four readings from this run are marked: ` +
            plotted.map((b) => `${b.label} ${b.measured}`).join(", ") +
            ". The remaining four dimensions are not published for this run."}
        </desc>

        {/* Grid — hairline, one step off the surface, solid, recessive. */}
        <g className="stroke-line-subtle" fill="none" strokeWidth={1}>
          {RINGS.map((ring) => (
            <path key={ring} d={polygon(bands.map(() => ring))} />
          ))}
          {bands.map((b, i) => {
            const [x, y] = point(i, 100);
            return <line key={b.key} x1={CX} y1={CY} x2={x} y2={y} />;
          })}
        </g>

        {/* Cohort band — context, so it wears surface grey, not a data hue.
            evenodd punches the average polygon out of the top-quartile one,
            leaving the band between them. */}
        <path
          d={`${outer} ${inner}`}
          fillRule="evenodd"
          className="fill-surface-hover"
        />
        {/* The two boundaries carry meaning — average and top quartile — so
            they take line.strong (8.9:1 on white). At line.DEFAULT they were
            1.47:1 and the band had no readable edge. */}
        <path
          d={outer}
          fill="none"
          className="stroke-line-strong"
          strokeWidth={1}
        />
        <path
          d={inner}
          fill="none"
          className="stroke-line-strong"
          strokeWidth={1}
        />

        {/* This run's readings. Dot + 2px surface ring + direct label. */}
        {bands.map((b, i) => {
          if (b.measured === null) return null;
          const [x, y] = point(i, b.measured);
          // The value sits inboard of its dot, along the same axis. Hanging
          // it outboard collides with the axis label on four of the eight
          // spokes; the interior is empty, so inboard always has room.
          const [lx, ly] = point(i, Math.max(0, b.measured - (15 / R) * 100));
          return (
            <g key={b.key}>
              <circle
                cx={x}
                cy={y}
                r={5}
                className="fill-action stroke-surface"
                strokeWidth={2}
              />
              <text
                x={lx}
                y={ly + VALUE_FONT / 3}
                textAnchor="middle"
                className="fill-primary font-semibold"
                fontSize={VALUE_FONT}
              >
                {b.measured}
              </text>
            </g>
          );
        })}

        {/* Axis labels — text tokens only, never the data colour. */}
        {bands.map((b, i) => {
          const { x, y, anchor } = labelLayout(i);
          return (
            <text
              key={b.key}
              x={x}
              y={i === 0 ? y - (AXIS_FONT + 1) : y}
              textAnchor={anchor}
              className="fill-muted"
              fontSize={AXIS_FONT}
            >
              <tspan x={x}>{b.lines[0]}</tspan>
              <tspan x={x} dy={AXIS_FONT + 1}>
                {b.lines[1]}
              </tspan>
            </text>
          );
        })}
      </svg>

      <figcaption className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted">
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden
            className="h-2.5 w-2.5 rounded-full border border-line bg-action"
          />
          This run
        </span>
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden
            className="h-2.5 w-4 rounded-sm border border-line-strong bg-surface-hover"
          />
          Australian {stageLabel.toLowerCase()}-stage companies, average to top
          quartile
        </span>
      </figcaption>
    </figure>
  );
}

/**
 * The table twin. Every value in the radar is reachable here without
 * hovering, reading a colour, or seeing the chart at all — and the four
 * dimensions this run does not publish say so rather than showing a zero.
 */
export function DimensionTable({ run }: DimensionRadarProps) {
  const bands = cohortBandsForRun(run);
  return (
    <ul role="list" className="divide-y divide-line-subtle">
      <li className="flex items-baseline justify-between gap-3 pb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
        <span>Dimension</span>
        <span className="flex shrink-0 items-baseline gap-3">
          <span>This run</span>
          <span className="w-16 text-right">Cohort</span>
        </span>
      </li>
      {bands.map((b) => (
        <li
          key={b.key}
          className="flex items-baseline justify-between gap-3 py-2"
        >
          <span className="text-sm text-secondary">{b.label}</span>
          <span className="flex shrink-0 items-baseline gap-3 tabular-nums">
            <span
              className={
                b.measured === null
                  ? "text-sm text-tertiary"
                  : "text-sm font-semibold text-primary"
              }
            >
              {b.measured === null ? "not published" : b.measured}
            </span>
            <span className="w-16 text-right text-xs text-muted">
              {b.avg}–{b.top}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
