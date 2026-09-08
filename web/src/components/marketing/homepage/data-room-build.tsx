/**
 * DataRoomBuild — the investor checklist, drawn as it fills up.
 *
 * FORM (dataviz). Five meters, one per stage, against a shared total. A
 * meter rather than a column chart because each row is one ratio against
 * one limit, and because five stacked horizontal meters stay legible at
 * 390px where five columns with rotated stage labels would not. The value
 * sits at the tip of each fill, which is where a bar's value belongs, so
 * nothing is gated behind a hover.
 *
 * DATA. Every count is read from `lib/data-room-templates.ts` — the same
 * twelve sections, the same stage gates and the same documents the product
 * builds a real data room from. The cumulative curve is computed, not
 * typed: 30 documents on the list at idea stage, 107 by the time a round
 * is live.
 */

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import {
  dataRoomBuildUp,
  DATA_ROOM_SECTIONS,
  DATA_ROOM_TOTAL_DOCUMENTS,
} from "./sample-runs";

export function DataRoomBuild() {
  const steps = dataRoomBuildUp();

  return (
    <div className="grid gap-10 lg:grid-cols-[1.15fr_1fr] lg:gap-14">
      <figure className="m-0">
        <figcaption className="text-sm leading-relaxed text-secondary">
          The list is not the same length all the way through. An investor
          looking at an idea expects{" "}
          <span className="font-semibold text-primary">
            {steps[0].cumulative}
          </span>{" "}
          documents; by the time a round is live it is all{" "}
          <span className="font-semibold text-primary">
            {DATA_ROOM_TOTAL_DOCUMENTS}
          </span>
          , across {DATA_ROOM_SECTIONS.length} sections.
        </figcaption>

        <ul role="list" className="mt-6 flex flex-col gap-5">
          {steps.map((step) => {
            const width = (step.cumulative / DATA_ROOM_TOTAL_DOCUMENTS) * 100;
            return (
              <li key={step.stage}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium text-primary">
                    {step.label}
                  </span>
                  <span className="font-mono text-sm text-secondary tabular-nums">
                    {step.cumulative}
                    <span className="mx-1 text-muted">of</span>
                    {DATA_ROOM_TOTAL_DOCUMENTS}
                  </span>
                </div>

                {/* Meter: the unfilled track is a step off the surface, the
                    fill is the single data hue. Inline style is geometry. */}
                <div
                  className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-surface-hover"
                  role="img"
                  aria-label={`${step.label} stage: ${step.cumulative} of ${DATA_ROOM_TOTAL_DOCUMENTS} documents expected`}
                >
                  <div
                    className="h-full rounded-full bg-action"
                    style={{ width: `${width}%` }}
                  />
                </div>

                <p className="mt-2 text-xs leading-relaxed text-muted">
                  <span className="text-tertiary">Adds </span>
                  {step.sections.join(" · ")}
                </p>
              </li>
            );
          })}
        </ul>
      </figure>

      {/* The table twin — every section, its size, and how much an investor
          leans on it. */}
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
          The {DATA_ROOM_SECTIONS.length} sections
        </p>
        <ul role="list" className="mt-3 divide-y divide-line-subtle">
          {DATA_ROOM_SECTIONS.map((section) => (
            <li
              key={section.name}
              className="flex items-baseline justify-between gap-3 py-2"
            >
              <span className="text-sm text-secondary">{section.name}</span>
              <span className="shrink-0 font-mono text-xs text-muted tabular-nums">
                {section.documents} docs
              </span>
            </li>
          ))}
        </ul>

        <Link
          href="/tools/data-room"
          className="mt-5 inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-action transition-colors duration-200 hover:text-action-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          Open the data room
          <ArrowRight size={14} aria-hidden />
        </Link>
      </div>
    </div>
  );
}
