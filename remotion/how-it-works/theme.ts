/**
 * Shared design tokens for the HowItWorks Remotion composition.
 *
 * Kept ISC / lucide-icon-friendly: no external font hosts, no image URLs,
 * no runtime fetches. Colours mirror the BlockID landing palette
 * (see web/tailwind.config for parity).
 */

export const COLORS = {
  ink: "#0B1220",
  inkSoft: "#1E293B",
  paper: "#FFFFFF",
  mist: "#F1F5F9",
  line: "#CBD5E1",
  muted: "#64748B",
  accent: "#0EA5E9",
  accentDark: "#0369A1",
  ok: "#10B981",
  warn: "#F59E0B",
  bad: "#EF4444",
} as const;

/** Per-scene wash backgrounds — soft brand tints. */
export const SCENE_BG = {
  search: "#F8FAFC",
  onboard: "#EEF6FF",
  score: "#F1F8F4",
  build: "#FEF9EC",
  raise: "#EEF2FF",
  outro: "#0B1220",
} as const;

/** System font stack. Avoids Google Fonts / any external fetch. */
export const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const FONT_MONO =
  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

/** Easings tuned for founder-friendly motion (bezier control points). */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const; // quart-out
export const EASE_IO = [0.65, 0, 0.35, 1] as const; // sine-in-out

export const SCENE_FRAMES = 150;
export const TOTAL_FRAMES = 900;
