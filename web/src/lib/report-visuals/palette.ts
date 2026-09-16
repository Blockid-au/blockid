// report-visuals palette — colour-blind-safe (Okabe–Ito based), spec §D.2.
//
// Bands: strong = #0072B2, developing = #E69F00, early = #D55E00,
// pending = #999999. Sequential heat = single-hue blues. Never a red/green
// pair. Every band is also encoded by label, and `target` /
// `benchmark_only` charts use dashed strokes (react-pdf has no <pattern>).

import type { Band, DataState } from "./types";

export const BAND_COLOUR: Record<Band, string> = {
  strong: "#0072B2",
  developing: "#E69F00",
  early: "#D55E00",
  pending: "#999999",
};

/** Okabe–Ito categorical series (8 colours). */
export const SERIES = [
  "#0072B2",
  "#E69F00",
  "#009E73",
  "#CC79A7",
  "#56B4E9",
  "#D55E00",
  "#F0E442",
  "#000000",
] as const;

/** Single-hue blue ramp for heat maps (light → dark). */
export const HEAT_RAMP = ["#EEF4FA", "#CFE0F1", "#9FC2E3", "#6AA1D2", "#3B7FBF", "#0072B2"] as const;

export const INK = {
  text: "#1F2937",
  muted: "#6B7280",
  faint: "#9CA3AF",
  grid: "#E5E7EB",
  surface: "#FFFFFF",
  surfaceAlt: "#F8FAFC",
} as const;

export function bandFor(score: number | null | undefined): Band {
  if (score === null || score === undefined || !Number.isFinite(score)) return "pending";
  if (score >= 70) return "strong";
  if (score >= 40) return "developing";
  return "early";
}

export function heatColour(value: number | null, max = 100): string {
  if (value === null || !Number.isFinite(value)) return INK.surfaceAlt;
  const t = Math.max(0, Math.min(1, max > 0 ? value / max : 0));
  const idx = Math.min(HEAT_RAMP.length - 1, Math.floor(t * HEAT_RAMP.length));
  return HEAT_RAMP[idx];
}

/** Text colour that stays legible on a heat cell. */
export function heatInk(value: number | null, max = 100): string {
  if (value === null || !Number.isFinite(value)) return INK.muted;
  return max > 0 && value / max >= 0.6 ? "#FFFFFF" : INK.text;
}

export const DATA_STATE_LABEL: Record<DataState, string> = {
  real: "real",
  partial: "partial",
  benchmark_only: "benchmark only",
  target: "target",
};

/** Dashed stroke for non-real data so a reader never mistakes a target for an actual. */
export function strokeDash(state: DataState): string {
  return state === "real" ? "" : ' stroke-dasharray="4 3"';
}
