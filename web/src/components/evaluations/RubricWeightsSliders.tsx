"use client";

// RubricWeightsSliders — the 8-dimension rubric weight sliders (G21 P2-A),
// shared by the batch dialog and the intake-template editor. Same markup / ids /
// data-testid as the dialog had before: `w-<dim>` range inputs 0..40 step 0.5,
// live normalised % beside each, an "Equal weights" reset and the one-line
// explanation. Weights never change the SVI — they only re-aggregate the 8
// dimension scores for the displayed cohort score (lib/evaluations/batch-shared.ts).

import * as React from "react";
import { DIMENSION_KEYS, DIMENSION_LABELS, equalWeights, normaliseWeights, type RubricWeights } from "@/lib/evaluations/batch-shared";

export interface RubricWeightsSlidersProps {
  weights: RubricWeights;
  onChange: (next: RubricWeights) => void;
  /** Element id for aria-labelledby (the caller renders the label). */
  labelledBy?: string;
  id?: string;
  /** Prefix for the slider ids (default "w") — keep unique when two controls share a page. */
  idPrefix?: string;
}

export function RubricWeightsSliders({ weights, onChange, labelledBy, id = "batch-weight-sliders", idPrefix = "w" }: RubricWeightsSlidersProps) {
  const normalised = React.useMemo(() => normaliseWeights(weights), [weights]);
  const rawSum = DIMENSION_KEYS.reduce((s, k) => s + (Number(weights[k]) || 0), 0);
  return (
    <div id={id} role="group" aria-labelledby={labelledBy} className="mt-2 space-y-2" data-testid="weight-sliders">
      {DIMENSION_KEYS.map((k) => (
        <div key={k} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 text-xs">
          <label htmlFor={`${idPrefix}-${k}`} className="text-ink-700">{DIMENSION_LABELS[k]}</label>
          <input
            id={`${idPrefix}-${k}`}
            type="range"
            min={0}
            max={40}
            step={0.5}
            value={weights[k]}
            aria-valuetext={`${normalised[k]}% of the weighted score`}
            onChange={(e) => onChange({ ...weights, [k]: Number(e.target.value) })}
            className="w-40 max-w-full accent-brand-600"
          />
          <span className="w-14 text-right tabular-nums text-ink-800" aria-hidden="true">{normalised[k]}%</span>
        </div>
      ))}
      <div className="flex items-center justify-between text-xs text-ink-500">
        <span>Sliders sum to {Math.round(rawSum * 10) / 10}; the split is normalised to 100% and only changes the displayed weighted score — the SVI stays unweighted.</span>
        <button type="button" onClick={() => onChange(equalWeights())} className="inline-flex min-h-6 shrink-0 items-center font-medium text-action hover:underline cursor-pointer">Equal weights</button>
      </div>
    </div>
  );
}
