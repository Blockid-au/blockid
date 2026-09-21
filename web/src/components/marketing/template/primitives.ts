/**
 * Unicorn template — shared class contracts (G17 D5/D6,
 * docs/design/unicorn-template.md).
 *
 * One place for the strings every primitive repeats, so the whole marketing
 * site moves together: the container measure, the focus ring, the two button
 * skins, the eyebrow and the vertical rhythm. Pure data — no React — so the
 * colocated test can pin the contract without rendering.
 *
 *   - Container: `max-w-6xl` (72rem) with a 24 px gutter (16 px on phones
 *     would be the Tailwind default `px-4`; we use `px-6` so the gutter is
 *     never tighter than the section's own inner padding).
 *   - Rhythm: sm 48 px · md 64 px · lg 96 px — the D5 scale. Sections default
 *     to `md` (64) and the hero to `lg` (96) on desktop; every step drops one
 *     notch below the `sm` breakpoint so a phone never scrolls through 96 px
 *     of nothing.
 *   - Focus: every interactive element gets a 2 px brand-navy ring offset
 *     from its surface (G26). The violet accent is for eyebrows only;
 *     `action` (brand navy) is the fill of every primary button and
 *     `action-secondary` (cyan-muted) the one secondary accent — values in
 *     globals.css, contrast pinned in src/design/palette-contrast.test.ts.
 *   - Surfaces (G26): light only. `base` = white, `sunken` = soft grey. The
 *     old `dark` tone is DEPRECATED and maps to `sunken` — no dark bands.
 *   - Motion: `--dur-base` (200 ms) with the token easing; nothing longer.
 *   - Touch targets: buttons are `min-h-11` (44 px) and links inside cards
 *     take the card as their hit area.
 */

export const CONTAINER = "mx-auto w-full max-w-6xl px-6";

export const FOCUS_RING =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

export const MOTION = "transition-colors duration-(--dur-base) ease-out";

export const EYEBROW =
  "text-xs font-semibold uppercase tracking-[0.18em] text-accent";

export type Rhythm = "sm" | "md" | "lg";

/** 48 / 64 / 96 px on desktop, one step tighter under `sm`. */
export const RHYTHM: Readonly<Record<Rhythm, string>> = {
  sm: "py-8 sm:py-12",
  md: "py-12 sm:py-16",
  lg: "py-16 sm:py-24",
};

/**
 * Section grounds. `dark` is DEPRECATED (G26): it is still accepted so
 * callers compile until the page lanes land, but it renders as `sunken` and
 * no longer scopes `data-theme="dark"`. New code passes `base` or `sunken`.
 */
export type Tone = "base" | "sunken" | "dark";

export const TONE_CLASS: Readonly<Record<Tone, string>> = {
  base: "bg-surface",
  sunken: "bg-surface-sunken",
  /** @deprecated G26 — alias of `sunken`; will be removed once no page passes it. */
  dark: "bg-surface-sunken",
};

/** Resolves the deprecated `dark` tone to the ground it now renders on. */
export function resolveTone(tone: Tone = "base"): Exclude<Tone, "dark"> {
  return tone === "dark" ? "sunken" : tone;
}

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type CtaVariant = ButtonVariant | "link";

const BUTTON_BASE =
  `inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold ${MOTION} ${FOCUS_RING} disabled:cursor-not-allowed disabled:opacity-50`;

/**
 * The light-template button set (G26): navy primary (white label, 13.6:1),
 * outline secondary (dark ink on white), ghost (ink, hover wash). 44 px min
 * height, brand-navy focus ring. `bg-action` IS brand navy — never write
 * `bg-brand-navy text-white` by hand.
 */
export const BUTTON_CLASS: Readonly<Record<ButtonVariant, string>> = {
  primary: `${BUTTON_BASE} bg-action text-on-action hover:bg-action-hover`,
  secondary: `${BUTTON_BASE} border border-line bg-surface text-primary hover:bg-surface-hover`,
  ghost: `${BUTTON_BASE} text-primary hover:bg-surface-hover`,
};

/** The button skins plus the inline text link. */
export const CTA_CLASS: Readonly<Record<CtaVariant, string>> = {
  ...BUTTON_CLASS,
  link: `inline-flex min-h-11 items-center gap-1.5 rounded-md text-sm font-medium text-action underline-offset-4 hover:text-action-hover hover:underline ${MOTION} ${FOCUS_RING}`,
};

/** Card: white, 1 px line, resting shadow-1; `interactive` lifts to shadow-2 on hover. */
export const CARD_CLASS = "rounded-xl border border-line-subtle bg-surface-raised p-6 shadow-1";
export const CARD_INTERACTIVE_CLASS = `${CARD_CLASS} transition-shadow duration-(--dur-base) ease-out hover:shadow-2`;

/** Form field: 44 px input on white, dark ink, navy focus ring. */
export const FIELD_LABEL_CLASS = "block text-sm font-medium text-primary";
export const FIELD_INPUT_CLASS =
  `mt-1.5 block w-full min-h-11 rounded-lg border border-line bg-surface px-3 py-2 text-base text-primary placeholder:text-tertiary ${MOTION} ${FOCUS_RING} aria-[invalid=true]:border-bear`;
export const FIELD_HINT_CLASS = "mt-1.5 text-xs text-muted";
export const FIELD_ERROR_CLASS = "mt-1.5 text-xs font-medium text-bear";

/** Table: sticky sunken header, zebra sunken rows, 44 px rows. */
export const TABLE_CLASS = "w-full border-collapse text-sm text-primary";
export const TABLE_HEAD_CLASS = "sticky top-0 z-10 bg-surface-sunken text-left text-xs font-semibold uppercase tracking-[0.08em] text-secondary";
export const TABLE_TH_CLASS = "min-h-11 border-b border-line px-3 py-3";
export const TABLE_ROW_CLASS = "min-h-11 border-b border-line-subtle even:bg-surface-sunken hover:bg-surface-hover";
export const TABLE_TD_CLASS = "px-3 py-3 align-top";

export interface Cta {
  href: string;
  label: string;
  /** Defaults to `primary` for the first CTA in a pair and `secondary` for the second. */
  variant?: CtaVariant;
  /** Reported as `data-cta-id` so GA4 click hooks can key on it. */
  ctaId?: string;
}

/** The section heading id convention: `<sectionId>-heading`, so `aria-labelledby` and deep links agree. */
export function headingId(sectionId: string): string {
  return `${sectionId}-heading`;
}
