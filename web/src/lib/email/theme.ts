/**
 * G26 lane R — the ONE colour constant for every HTML e-mail.
 *
 * E-mail clients need inline styles, so templates cannot read CSS custom
 * properties. Every hex below is the light-scope value of a `--ds-*` token
 * in `src/app/globals.css` (or a brand token in `tailwind.config.ts`), so a
 * digest, a report e-mail and the web page it links to share one palette:
 * light table layouts, dark ink, navy buttons.
 *
 * `email-theme.test.ts` walks every e-mail template and fails on a hex that
 * is not one of these values — add a key here instead of a literal.
 *
 * Contrast on white: ink 19.6:1 · inkMuted 15.4:1 · inkSubtle 8.9:1 ·
 * inkTertiary 5.7:1 · navy 13.6:1 · action 8.6:1 · success 6.4:1 · warn
 * 5.9:1 · danger 7.3:1. `cyan` is 3.7:1 — decorative only, never text.
 */
export const EMAIL_THEME = {
  // surfaces
  page: "#f7f8fa", // --ds-surface-sunken — the e-mail canvas around the card
  surface: "#ffffff", // --ds-surface — the card
  sunken: "#f7f8fa", // --ds-surface-sunken — quiet panels, table header rows
  hover: "#eef0f5", // --ds-surface-hover — progress tracks, zebra rows
  border: "#e5e7eb", // --ds-border
  borderStrong: "#d1d5db", // --ds-border-strong
  // ink
  ink: "#0b0f1a", // --ds-ink — headings
  inkMuted: "#1f2937", // --ds-ink-muted — body
  inkSubtle: "#4b5563", // --ds-ink-subtle — secondary
  inkTertiary: "#6b7280", // --ds-ink-tertiary — footers, captions
  inkFaint: "#9ca3af", // --ds-ink-faint — decorative only
  // brand
  navy: "#1B2A5E", // --color-brand-navy — primary buttons, eyebrows, big numbers
  navyDeep: "#0F1B47", // --color-brand-navy-deep — button hover
  navySoft: "#eceef7", // navy at ~8 % on white — pills, callouts
  cyan: "#0891B2", // secondary accent — decorative only
  action: "#1d4ed8", // --ds-accent — links
  onNavy: "#ffffff", // text on navy fills
  // semantic
  success: "#047857", // --ds-success
  warn: "#b45309", // --ds-warn
  danger: "#b91c1c", // --ds-danger
  bgSuccess: "#ecfdf5", // --ds-bg-success
  bgWarn: "#fffbeb", // --ds-bg-warn
  bgDanger: "#fef2f2", // --ds-bg-danger
  bgInfo: "#eff6ff", // --ds-bg-info
  successTint: "#a7f3d0",
  warnTint: "#fde68a",
  dangerTint: "#fecaca",
} as const;

export type EmailThemeKey = keyof typeof EMAIL_THEME;

/** Every hex the templates may use (lower-case, with `#`). */
export const EMAIL_THEME_HEX: ReadonlySet<string> = new Set(Object.values(EMAIL_THEME).map((h) => h.toLowerCase()));

/** Inline style for the one primary button (navy fill, white text, 44 px tall). */
export const EMAIL_BUTTON_STYLE = `display:inline-block;background:${EMAIL_THEME.navy};color:${EMAIL_THEME.onNavy};font-weight:600;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:15px;line-height:20px;`;

/** Inline style for the card that holds an e-mail's body. */
export const EMAIL_CARD_STYLE = `max-width:560px;background:${EMAIL_THEME.surface};border:1px solid ${EMAIL_THEME.border};border-radius:16px;padding:32px;`;
