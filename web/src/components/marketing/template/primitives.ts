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
 *   - Focus: every interactive element gets a 2 px `accent-600` ring offset
 *     from its surface. The accent is used for focus and eyebrows only
 *     (F-2); `action` (brand blue) stays the fill of every primary button.
 *   - Motion: `--dur-base` (200 ms) with the token easing; nothing longer.
 *   - Touch targets: buttons are `min-h-11` (44 px) and links inside cards
 *     take the card as their hit area.
 */

export const CONTAINER = "mx-auto w-full max-w-6xl px-6";

export const FOCUS_RING =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

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

export type Tone = "base" | "sunken" | "dark";

/** Section grounds. `dark` self-scopes the token ramp (the ProShell pattern). */
export const TONE_CLASS: Readonly<Record<Tone, string>> = {
  base: "bg-surface",
  sunken: "bg-surface-sunken",
  dark: "bg-surface",
};

export type CtaVariant = "primary" | "secondary" | "link";

const BUTTON_BASE =
  `inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold ${MOTION} ${FOCUS_RING}`;

/** The two button skins plus the inline text link. */
export const CTA_CLASS: Readonly<Record<CtaVariant, string>> = {
  primary: `${BUTTON_BASE} bg-action text-on-action hover:bg-action-hover`,
  secondary: `${BUTTON_BASE} border border-line bg-surface text-primary hover:bg-surface-hover`,
  link: `inline-flex min-h-11 items-center gap-1.5 rounded-md text-sm font-medium text-action hover:text-action-hover ${MOTION} ${FOCUS_RING}`,
};

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
