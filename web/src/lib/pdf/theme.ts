/**
 * G26 lane R — the ONE colour constant for every react-pdf document.
 *
 * Light paper, navy headings, dark ink body, tables with sunken header
 * rows, no dark cover page. Every hex here equals a `--ds-*` token in
 * `src/app/globals.css` (light scope) or a brand token in
 * `tailwind.config.ts`, so the PDF twin of a report reads like the web
 * page it mirrors. Chart colours come from
 * `lib/report-visuals/palette.ts`, which reads the same values.
 *
 * Text contrast on white paper: ink 19.6:1 · inkMuted 15.4:1 · inkSubtle
 * 8.9:1 · inkTertiary 5.7:1 · navy 13.6:1 · action 8.6:1 · success 6.4:1 ·
 * warn 5.9:1 · danger 7.3:1. `cyan` is 3.7:1 — graphics / secondary series
 * only, never running text. `inkFaint` is decorative only.
 */
export const PDF_THEME = {
  // surfaces
  paper: "#ffffff", // --ds-surface
  sunken: "#f7f8fa", // --ds-surface-sunken (table header rows, quiet cards)
  hover: "#eef0f5", // --ds-surface-hover (zebra rows, progress tracks)
  border: "#e5e7eb", // --ds-border
  borderStrong: "#d1d5db", // --ds-border-strong
  // ink
  ink: "#0b0f1a", // --ds-ink
  inkMuted: "#1f2937", // --ds-ink-muted
  inkSubtle: "#4b5563", // --ds-ink-subtle
  inkTertiary: "#6b7280", // --ds-ink-tertiary
  inkFaint: "#9ca3af", // --ds-ink-faint (decorative)
  // brand
  navy: "#1B2A5E", // --color-brand-navy — headings, primary fills
  navyDeep: "#0F1B47", // --color-brand-navy-deep
  navyElev: "#2A3B7A", // --color-brand-navy-elev-2 — secondary fills
  navyTint: "#c5cbe0", // navy at ~25 % on white — strokes, rings
  navySoft: "#eceef7", // navy at ~8 % on white — pills, callouts
  cyan: "#0891B2", // secondary accent — series 2, never text
  cyanSoft: "#ecfeff", // cyan ground
  action: "#1d4ed8", // --ds-accent — links
  highlight: "#6d28d9", // --ds-highlight — eyebrows only
  // semantic
  success: "#047857", // --ds-success (bull)
  successMid: "#059669",
  successTint: "#a7f3d0",
  warn: "#b45309", // --ds-warn
  warnMid: "#d97706",
  warnTint: "#fde68a",
  danger: "#b91c1c", // --ds-danger (bear)
  dangerMid: "#dc2626",
  dangerTint: "#fecaca",
  bgSuccess: "#ecfdf5", // --ds-bg-success
  bgWarn: "#fffbeb", // --ds-bg-warn
  bgDanger: "#fef2f2", // --ds-bg-danger
  bgInfo: "#eff6ff", // --ds-bg-info
  white: "#ffffff",
} as const;

export type PdfThemeKey = keyof typeof PDF_THEME;

/**
 * Legacy key set used by `svi-report-pdf.tsx` and the documents that import
 * its `C` (board resolution, dividend statements, listing readiness,
 * valuation certificate, …). Same values as PDF_THEME — the Tailwind-ish
 * names stay so those files keep compiling; new code uses PDF_THEME.
 */
export const PDF_LEGACY_C = {
  brand700: PDF_THEME.navyDeep,
  brand600: PDF_THEME.navy,
  brand500: PDF_THEME.navyElev,
  brand200: PDF_THEME.navyTint,
  brand100: "#dfe3ef",
  brand50: PDF_THEME.navySoft,
  ink900: PDF_THEME.ink,
  ink800: PDF_THEME.inkMuted,
  ink700: "#374151",
  ink600: PDF_THEME.inkSubtle,
  ink500: PDF_THEME.inkTertiary,
  ink400: PDF_THEME.inkFaint,
  ink300: PDF_THEME.borderStrong,
  surface200: PDF_THEME.border,
  surface100: PDF_THEME.hover,
  surface50: PDF_THEME.sunken,
  emerald600: PDF_THEME.success,
  emerald500: PDF_THEME.successMid,
  emerald400: "#34d399",
  emerald200: PDF_THEME.successTint,
  emerald100: "#d1fae5",
  emerald50: PDF_THEME.bgSuccess,
  amber700: PDF_THEME.warn,
  amber600: PDF_THEME.warn,
  amber500: PDF_THEME.warnMid,
  amber100: "#fef3c7",
  amber50: PDF_THEME.bgWarn,
  red600: PDF_THEME.danger,
  red500: PDF_THEME.dangerMid,
  red100: "#fee2e2",
  teal600: PDF_THEME.cyan,
  teal200: "#a5f3fc",
  teal50: PDF_THEME.cyanSoft,
  white: PDF_THEME.white,
} as const;
