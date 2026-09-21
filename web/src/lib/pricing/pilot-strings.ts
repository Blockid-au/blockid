/**
 * pilot-strings — the UI strings of the paid Cohort Validation Pilot
 * controls (`PilotRung`, `PilotBuyButton`, the `PilotOffer` "after" band),
 * resolved from the i18n catalogue (`pilot.*` keys in en.json / vi.json —
 * `messages-parity.test.ts` pins EN ⇄ VI parity) on the SERVER and passed
 * to the client components as one plain object (G22-C).
 *
 * Why a builder and not `t()` in the component: `PilotBuyButton` is a client
 * component and `lib/i18n/t` imports both catalogues (~230 KB) — importing
 * it there would ship every catalogue to the browser. The server page
 * resolves the locale once and hands the ~15 strings across the boundary.
 *
 * `{price}` / `{priceLong}` / `{n}` stay as tokens in the object; the
 * components substitute them per SKU with `fillPilotString()` so no amount
 * is ever a literal (the pilot-skus rule).
 */

import type { Messages } from "@/lib/i18n/t";
import { t } from "@/lib/i18n/t";

export type PilotLocale = "en" | "vi";

export interface PilotUiStrings {
  locale: PilotLocale;
  /** "Start here" — the /pricing Programs rung eyebrow. */
  rungEyebrow: string;
  /** "one-off · up to {n} applicants" */
  rungCard: string;
  /** "Next step" — the Cohort 25 / 100 band eyebrow under the offer. */
  afterEyebrow: string;
  /** "Book the {price} pilot" */
  buyLabel: string;
  /** "{priceLong} · quote before you pay · booked through our team …" */
  quoteContact: string;
  /** "{priceLong} · one-off · quote before you pay — …" */
  quoteCheckout: string;
  /** aria-label of the confirm panel: "Confirm the {price} Cohort Validation Pilot" */
  confirmAria: string;
  confirmEyebrow: string;
  /** "{priceLong} · one real intake or existing cohort" */
  confirmTitle: string;
  confirmNote: string;
  /** "Continue to secure checkout — {price}" */
  confirmContinue: string;
  confirmNotNow: string;
  close: string;
  errorGeneric: string;
  errorNetwork: string;
  errorContact: string;
  /** The eight inclusions shown inside the confirm panel (same list as the offer cards). */
  includes: readonly string[];
}

/** Substitute `{token}` placeholders; unknown tokens are left as-is (the page tests catch them). */
export function fillPilotString(template: string, vars: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{([a-zA-Z0-9]+)\}/g, (whole, key: string) => (key in vars ? String(vars[key]) : whole));
}

/** Build the pilot UI strings for one catalogue (server only — see the header). */
export function pilotUiStrings(m: Messages, locale: PilotLocale = "en"): PilotUiStrings {
  return {
    locale,
    rungEyebrow: t(m, "pilot.rung.eyebrow"),
    rungCard: t(m, "pilot.rung.card"),
    afterEyebrow: t(m, "pilot.after.eyebrow"),
    buyLabel: t(m, "pilot.buy.label"),
    quoteContact: t(m, "pilot.buy.quote.contact"),
    quoteCheckout: t(m, "pilot.buy.quote.checkout"),
    confirmAria: t(m, "pilot.buy.confirm.aria"),
    confirmEyebrow: t(m, "pilot.buy.confirm.eyebrow"),
    confirmTitle: t(m, "pilot.buy.confirm.title"),
    confirmNote: t(m, "pilot.buy.confirm.note"),
    confirmContinue: t(m, "pilot.buy.confirm.continue"),
    confirmNotNow: t(m, "pilot.buy.confirm.notNow"),
    close: t(m, "pilot.buy.close"),
    errorGeneric: t(m, "pilot.buy.error.generic"),
    errorNetwork: t(m, "pilot.buy.error.network"),
    errorContact: t(m, "pilot.buy.error.contact"),
    includes: Array.from({ length: 8 }, (_, i) => t(m, `solutions.accelerator.pilot.include${i + 1}`)),
  };
}

/** Every `pilot.*` catalogue key the builder reads — the parity test walks this list. */
export const PILOT_UI_KEYS: readonly string[] = [
  "pilot.rung.eyebrow",
  "pilot.rung.card",
  "pilot.after.eyebrow",
  "pilot.buy.label",
  "pilot.buy.quote.contact",
  "pilot.buy.quote.checkout",
  "pilot.buy.confirm.aria",
  "pilot.buy.confirm.eyebrow",
  "pilot.buy.confirm.title",
  "pilot.buy.confirm.note",
  "pilot.buy.confirm.continue",
  "pilot.buy.confirm.notNow",
  "pilot.buy.close",
  "pilot.buy.error.generic",
  "pilot.buy.error.network",
  "pilot.buy.error.contact",
];
