/**
 * ValuationRanges — the three published runs as intervals on one shared,
 * log-scaled Australian-dollar axis.
 *
 * FORM (dataviz). A range/interval chart. The measure is a span, not a
 * point, so the mark is a span: a rounded bar from low to high, one per
 * run, all in the single data hue because there is one series here, not
 * three. Ordering the rows by stage lets the reader see the jump between
 * stages without a second axis or a second colour.
 *
 * WHY NOT SVG. The geometry here is one-dimensional — a position and a
 * width — while the labels are ordinary running text that has to stay
 * legible from 390px to 1440px. An SVG viewBox scales its type with its
 * width, which at one end of that range means six-point axis labels and at
 * the other means twenty-point ones. So the track is CSS percentages and
 * the type is CSS type. The inline styles carry geometry only; every
 * colour is a token.
 *
 * WHAT IS NOT HERE. The methods behind a range are named in the caption
 * but not plotted. The published runs record one range each, not a value
 * per method, and a four-point convergence chart would have meant making
 * those four numbers up.
 */

import { SAMPLE_RUNS } from "./sample-runs";

// Axis: A$100K to A$10M, log10. Chosen because the three published ranges
// span two decades — a linear axis would compress the idea-stage run to a
// sliver against the revenue-stage one.
const AXIS_MIN = 1e5;
const AXIS_MAX = 1e7;
const TICKS = [
  { value: 1e5, label: "A$100K" },
  { value: 1e6, label: "A$1M" },
  { value: 1e7, label: "A$10M" },
];

function pct(value: number): number {
  const lo = Math.log10(AXIS_MIN);
  const hi = Math.log10(AXIS_MAX);
  return ((Math.log10(value) - lo) / (hi - lo)) * 100;
}

export function ValuationRanges() {
  return (
    <figure className="m-0">
      <ul role="list" className="flex flex-col gap-5">
        {SAMPLE_RUNS.map((run) => {
          const left = pct(run.valuationLow);
          const width = pct(run.valuationHigh) - left;
          return (
            <li key={run.id}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-primary">
                  {run.stage}
                </span>
                <span className="font-mono text-sm text-secondary tabular-nums">
                  {run.valuationLowLabel}
                  <span className="mx-1 text-muted">–</span>
                  {run.valuationHighLabel}
                </span>
              </div>

              <div
                className="relative mt-2 h-3"
                role="img"
                aria-label={`${run.stage}: ${run.valuationLowLabel} to ${run.valuationHighLabel}`}
              >
                {/* Track — one step off the surface, hairline, recessive. */}
                <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line-subtle" />
                {/* The interval. Inline style is geometry; colour is a token. */}
                <div
                  className="absolute top-0 h-3 rounded-full bg-action"
                  style={{ left: `${left}%`, width: `${width}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      {/* Axis — three round decades, solid hairline ticks. */}
      <div className="relative mt-4 h-8" aria-hidden>
        <div className="absolute inset-x-0 top-0 h-px bg-line-subtle" />
        {TICKS.map((tick, i) => (
          <div
            key={tick.label}
            className="absolute top-0 flex flex-col items-start"
            style={{
              left: `${pct(tick.value)}%`,
              transform:
                i === TICKS.length - 1
                  ? "translateX(-100%)"
                  : i === 0
                    ? "none"
                    : "translateX(-50%)",
            }}
          >
            <span className="h-1.5 w-px bg-line" />
            <span className="mt-1 font-mono text-[11px] text-muted tabular-nums">
              {tick.label}
            </span>
          </div>
        ))}
      </div>

      <figcaption className="mt-4 text-sm leading-relaxed text-secondary">
        One range per run, on a shared logarithmic scale. Each is settled
        between Berkus, a scorecard against Australian peers, discounted cash
        flow, the VC method and comparable local raises — the report shows
        where those five agree and where they pull apart.
      </figcaption>
    </figure>
  );
}
