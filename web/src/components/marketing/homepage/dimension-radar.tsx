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

// Geometry. A wide viewBox leaves room for two-line axis labels without
// clipping at 390px, where the SVG renders about 340px across.
const VB_W = 400;
const VB_H = 340;
const CX = 200;
const CY = 165;
const R = 95; // radius at a score of 100
const R_LABEL = 108;
const RINGS = [25, 50, 75, 100];

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
        className="block h-auto w-full"
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
        <path d={outer} fill="none" className="stroke-line" strokeWidth={1.5} />
        <path d={inner} fill="none" className="stroke-line" strokeWidth={1.5} />

        {/* This run's readings. Dot + 2px surface ring + direct label. */}
        {bands.map((b, i) => {
          if (b.measured === null) return null;
          const [x, y] = point(i, b.measured);
          const layout = labelLayout(i);
          const dx = layout.anchor === "end" ? -10 : layout.anchor === "start" ? 10 : 0;
          return (
            <g key={b.key}>
              <circle
                cx={x}
                cy={y}
                r={5.5}
                className="fill-action stroke-surface"
                strokeWidth={2}
              />
              <text
                x={x + dx}
                y={y - 10}
                textAnchor={layout.anchor === "middle" ? "middle" : layout.anchor}
                className="fill-primary font-semibold"
                fontSize={12}
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
              y={i === 0 ? y - 12 : y}
              textAnchor={anchor}
              className="fill-muted"
              fontSize={11}
            >
              <tspan x={x}>{b.lines[0]}</tspan>
              <tspan x={x} dy={12}>
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
            className="h-2.5 w-4 rounded-sm border border-line bg-surface-hover"
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
