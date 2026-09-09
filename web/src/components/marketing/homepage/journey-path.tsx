/**
 * JourneyPath — the twelve-phase journey with real positions marked on it.
 *
 * FORM (dataviz). An ordered path with emphasis: twelve equal ticks in the
 * recessive grid colour, three of them promoted to the data hue because
 * they are the point. No second colour, no per-phase palette — the phases
 * are a sequence, and a sequence's information is position, not identity.
 *
 * HONESTY. The three marked positions are not editorial. `phaseOrderForRun`
 * calls `getCurrentPhase` — the same resolver the workspace header and the
 * intake detector use — so the marker is the product's own answer for a
 * company at that stage, and the phase titles are read from the shipped
 * `GROWTH_PHASES` table rather than retyped.
 *
 * RESPONSIVE. The track is percentage-positioned, so it holds its shape at
 * 390px; only the three marked phases carry a chip on the track, and the
 * full twelve names sit in a grid below where they have room to wrap.
 */

import {
  JOURNEY_PHASES,
  phaseOrderForRun,
  SAMPLE_RUNS,
} from "./sample-runs";

/** Short chip label — the track has room for a word, not a sentence. */
const CHIP_LABEL: Record<string, string> = {
  idea: "Idea",
  mvp: "MVP",
  revenue: "Revenue",
};

export function JourneyPath() {
  const total = JOURNEY_PHASES.length;
  const marks = SAMPLE_RUNS.map((run) => ({
    run,
    order: phaseOrderForRun(run),
    phase: JOURNEY_PHASES[phaseOrderForRun(run) - 1],
  }));
  const markedOrders = new Set(marks.map((m) => m.order));

  function left(order: number): number {
    return ((order - 1) / (total - 1)) * 100;
  }

  return (
    <div>
      {/* The track. Chips sit above the marked nodes; the numbers sit below
          every node, so the scale is readable without the chips. */}
      <div
        className="relative mt-8 h-24"
        role="img"
        aria-label={
          "The twelve growth phases, with three runs marked: " +
          marks
            .map(
              (m) => `${m.run.stage} at phase ${m.order}, ${m.phase.title}`,
            )
            .join("; ")
        }
      >
        <div className="absolute inset-x-0 top-10 h-px bg-line" />

        {JOURNEY_PHASES.map((phase) => {
          const marked = markedOrders.has(phase.order);
          return (
            <div
              key={phase.order}
              className="absolute top-10 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${left(phase.order)}%` }}
            >
              <span
                aria-hidden
                className={
                  marked
                    ? "block h-3.5 w-3.5 rounded-full bg-action ring-2 ring-surface"
                    : "block h-1.5 w-1.5 rounded-full bg-line-strong"
                }
              />
            </div>
          );
        })}

        {JOURNEY_PHASES.map((phase) => (
          <span
            key={phase.order}
            aria-hidden
            className={
              "absolute top-[3.75rem] -translate-x-1/2 font-mono text-[11px] tabular-nums " +
              (markedOrders.has(phase.order)
                ? "font-semibold text-primary"
                : "text-tertiary")
            }
            style={{ left: `${left(phase.order)}%` }}
          >
            {phase.order}
          </span>
        ))}

        {marks.map((m) => (
          <span
            key={m.run.id}
            aria-hidden
            className="absolute top-0 whitespace-nowrap rounded-full border border-line bg-surface-hover px-2.5 py-1 text-[11px] font-medium text-primary"
            style={{
              left: `${left(m.order)}%`,
              transform:
                m.order === total
                  ? "translateX(-100%)"
                  : m.order === 1
                    ? "none"
                    : "translateX(-50%)",
            }}
          >
            {CHIP_LABEL[m.run.id] ?? m.run.stage}
          </span>
        ))}
      </div>

      {/* What each mark means, in words — the reading that does not depend
          on seeing the track. */}
      <ul role="list" className="mt-6 grid gap-3 sm:grid-cols-3">
        {marks.map((m) => (
          <li
            key={m.run.id}
            className="rounded-xl border border-line-subtle bg-surface-hover px-4 py-3"
          >
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
              {m.run.stage}
            </p>
            <p className="mt-2 text-sm font-semibold text-primary">
              Phase {m.order} of {total} · {m.phase.title}
            </p>
            <p className="mt-1 text-sm leading-snug text-secondary">
              {m.phase.subtitle}
            </p>
          </li>
        ))}
      </ul>

      {/* The full twelve, so the marked three have something to sit inside. */}
      <ol className="mt-6 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-4">
        {JOURNEY_PHASES.map((phase) => {
          const marked = markedOrders.has(phase.order);
          return (
            <li
              key={phase.order}
              className={
                "flex items-baseline gap-2 text-sm " +
                (marked ? "text-primary" : "text-secondary")
              }
            >
              <span className="w-5 shrink-0 font-mono text-[11px] text-tertiary tabular-nums">
                {phase.order}
              </span>
              <span className={marked ? "font-semibold" : undefined}>
                {phase.title}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
