/**
 * G26-W2 — one dense-table skin for the evaluator, accelerator, investor and
 * admin surfaces (docs/plans/g26-light-template-redesign-2026-09-21.md § 2 W2).
 *
 * Light template only: white table on a 1 px line, sticky sunken header,
 * zebra sunken rows, right-aligned `tabular-nums` numerals, ≥ 44 px row
 * actions. Tokens only — no raw palette classes, no `dark:` variants
 * (the site is light by decision § 1; the dark theme scope is opt-in for
 * the report contract and never wraps these pages).
 *
 * Usage:
 *   <div className={TABLE.wrap}><table className={TABLE.table}>
 *     <thead className={TABLE.thead}><tr><th className={TABLE.th}>…</th><th className={TABLE.thNum}>…</th></tr></thead>
 *     <tbody className={TABLE.tbody}><tr className={TABLE.row}><td className={TABLE.td}>…</td><td className={TABLE.tdNum}>…</td></tr></tbody>
 *   </table></div>
 *
 * `wrap` is the scroll container (both axes) so the sticky header holds while
 * the page itself never scrolls sideways at 375 px.
 */
export const TABLE = {
  /** Scroll container: white, 1 px line, hairline shadow; caps at 75 vh so the sticky header engages. */
  wrap: "overflow-auto max-h-[75vh] rounded-xl border border-line-subtle bg-surface shadow-1",
  table: "min-w-full border-separate border-spacing-0 text-sm text-primary",
  thead: "text-left text-[11px] font-semibold uppercase tracking-wider text-secondary",
  /** Every header cell: sticky under the wrapper's top edge, sunken ground, 1 px line below. */
  th: "sticky top-0 z-10 whitespace-nowrap border-b border-line-subtle bg-surface-sunken px-3 py-2.5",
  thNum: "sticky top-0 z-10 whitespace-nowrap border-b border-line-subtle bg-surface-sunken px-3 py-2.5 text-right",
  /** Zebra: even rows on the sunken ground; hover on either. */
  tbody: "[&>tr:nth-child(even)]:bg-surface-sunken [&>tr:hover]:bg-surface-hover",
  row: "align-top transition-colors duration-(--dur-fast)",
  td: "border-b border-line-subtle px-3 py-2.5 align-top",
  tdNum: "border-b border-line-subtle px-3 py-2.5 text-right tabular-nums align-top",
  /** Row-action cell: right-aligned, never wraps, its buttons/links carry `action`. */
  tdActions: "border-b border-line-subtle px-3 py-1.5 text-right whitespace-nowrap",
  /** ≥ 44 px hit area for an inline row action (link or button). */
  action:
    "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-2.5 text-xs font-semibold text-action hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-offset-2",
  /** The empty state inside the wrapper. */
  empty: "px-6 py-14 text-center text-sm text-secondary",
} as const;

/** Muted chip on a light ground (status, tag, count) — never a brand fill. */
export const CHIP = {
  base: "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-5 whitespace-nowrap",
  muted: "border-line-subtle bg-surface-sunken text-secondary",
  navy: "border-brand-navy/20 bg-brand-50 text-brand-navy",
  bull: "border-bull/20 bg-bull/10 text-bull",
  bear: "border-bear/20 bg-bear/10 text-bear",
  warn: "border-warn/20 bg-warn/10 text-warn",
} as const;

/** Sunken banner with a semantic left rule (navy info / bear / warn / bull). */
export const BANNER = {
  base: "rounded-xl border border-line-subtle border-l-4 bg-surface-sunken px-4 py-3 text-sm text-primary",
  info: "border-l-brand-navy",
  bear: "border-l-bear",
  warn: "border-l-warn",
  bull: "border-l-bull",
} as const;

/** Drawer / dialog panel: white, 1 px line, md shadow. Scrim: ink at 40 %. */
export const PANEL = {
  scrim: "fixed inset-0 z-40 bg-ink-900/40",
  dialog: "relative z-50 w-full max-w-lg rounded-2xl border border-line-subtle bg-surface p-6 shadow-2 text-primary",
  drawer: "fixed inset-y-0 right-0 z-50 w-full max-w-xl border-l border-line-subtle bg-surface shadow-2 text-primary",
} as const;

/** Form field on the light template (matches `components/ui/input.tsx`). */
export const FIELD = {
  label: "block text-xs font-medium text-secondary",
  input:
    "mt-1 block w-full min-h-11 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-offset-2",
  select:
    "mt-1 block w-full min-h-11 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-offset-2",
  help: "mt-1 text-xs text-muted",
  error: "mt-1 text-xs text-bear",
} as const;

/** Buttons — primary navy, secondary outline, ghost. */
export const BTN = {
  primary:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand-navy px-4 text-sm font-semibold text-white hover:bg-brand-navy-elev-1 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-offset-2",
  secondary:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-semibold text-primary hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-offset-2",
  ghost:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold text-secondary hover:bg-surface-hover hover:text-primary disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-offset-2",
} as const;

/** Page header: eyebrow · h1 · lede — the one pattern from the unicorn template. */
export const PAGE = {
  shell: "mx-auto w-full max-w-7xl px-4 py-6 sm:px-6",
  eyebrow: "text-xs font-semibold uppercase tracking-wider text-accent",
  h1: "font-display text-2xl font-semibold tracking-tight text-strong sm:text-3xl",
  lede: "mt-1 max-w-2xl text-sm text-secondary",
  card: "rounded-xl border border-line-subtle bg-surface p-5 shadow-1",
  cardSunken: "rounded-xl border border-line-subtle bg-surface-sunken p-5",
} as const;
