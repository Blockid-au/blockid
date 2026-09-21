// report-visuals palette — G26 lane R: charts sit on the light unicorn
// template (white paper, no chart background). Grid lines are the
// `--ds-border` token, labels are ink, bands are the semantic bull / warn /
// bear colours, the primary series is brand navy and the secondary is
// cyan. Every hex equals a `--ds-*` / brand token (`lib/pdf/theme.ts`
// lists the same values for react-pdf).
//
// Colour-blind safety (spec §D.2 kept): the categorical series alternates
// the blue–orange axis (navy · cyan · amber · green · violet · red …) so no
// two neighbours collapse under deuteranopia, no red/green pair sits next
// to each other, every band is also encoded by label, and `target` /
// `benchmark_only` charts use dashed strokes (react-pdf has no <pattern>).

import { PDF_THEME } from "@/lib/pdf/theme";
import type { Band, DataState } from "./types";

export const BAND_COLOUR: Record<Band, string> = {
  strong: PDF_THEME.navy,
  developing: PDF_THEME.warn,
  early: PDF_THEME.danger,
  pending: PDF_THEME.inkTertiary,
};

/** Categorical series (8 colours): navy primary, cyan secondary, then the semantic ramp. */
export const SERIES = [
  PDF_THEME.navy,
  PDF_THEME.cyan,
  PDF_THEME.warnMid,
  PDF_THEME.success,
  PDF_THEME.highlight,
  PDF_THEME.danger,
  PDF_THEME.navyElev,
  PDF_THEME.inkSubtle,
] as const;

/** Single-hue navy ramp for heat maps (light → dark). */
export const HEAT_RAMP = ["#eceef7", "#d0d5e6", "#a3add0", "#5c6ca3", "#3d4c88", PDF_THEME.navy] as const;

export const INK = {
  text: PDF_THEME.inkMuted,
  muted: PDF_THEME.inkSubtle,
  faint: PDF_THEME.inkFaint,
  grid: PDF_THEME.border,
  surface: PDF_THEME.paper,
  surfaceAlt: PDF_THEME.sunken,
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

/** Text colour that stays legible on a heat cell (white from the 4th step up — ≥ 4.5:1 either way). */
export function heatInk(value: number | null, max = 100): string {
  if (value === null || !Number.isFinite(value)) return INK.muted;
  return max > 0 && value / max >= 0.6 ? PDF_THEME.white : INK.text;
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
