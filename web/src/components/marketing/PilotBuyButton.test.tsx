// G21 P0-C — PilotBuyButton: the static markup (price from the SKU, "inc.
// GST", "quote before you pay", the contact link when the SKU is not
// configured, the checkout button + confirm contract when it is) and the
// pure response resolver (401 → login, 409 → the fallback, url → navigate,
// otherwise an error). No DOM in this suite; interaction is the live-qa lane.
//
// G22-C — every visible string comes from `strings` (`pilotUiStrings()` over
// the `pilot.*` catalogue keys): the EN render carries the English lines, the
// VI render the Vietnamese ones, and the file itself has no English literal
// besides the resolver's last-resort fallback.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import enMessages from "@/lib/i18n/messages/en.json";
import viMessages from "@/lib/i18n/messages/vi.json";
import { PILOT_CONTACT_FALLBACK, formatPilotPrice } from "@/lib/pricing/pilot-skus";
import { PILOT_UI_KEYS, fillPilotString, pilotUiStrings } from "@/lib/pricing/pilot-strings";
import { PILOT_CHECKOUT_ERROR_FALLBACK, PilotBuyButton, resolvePilotCheckoutResponse } from "./PilotBuyButton";

const EN = enMessages as Record<string, string>;
const VI = viMessages as Record<string, string>;
const en = pilotUiStrings(EN, "en");
const vi = pilotUiStrings(VI, "vi");

describe("<PilotBuyButton /> — unconfigured SKU", () => {
  const out = renderToStaticMarkup(<PilotBuyButton sku="cohort_pilot_25" configured={false} returnPath="/solutions/accelerator#pilot" strings={en} ctaId="x" />);

  it("renders a plain link to /contact?topic=pilot (no POST, no login detour) with the price and inc. GST", () => {
    expect(out).toContain('href="/contact?topic=pilot"');
    expect(out).toContain('data-pilot-mode="contact"');
    expect(out).toContain('data-testid="pilot-buy-cohort_pilot_25"');
    expect(out).toContain("A$1,500 inc. GST");
    expect(out).toContain("quote before you pay");
    expect(out).toContain(`Book the ${formatPilotPrice("cohort_pilot_25")} pilot`);
    expect(out).not.toContain("<button");
  });
});

describe("<PilotBuyButton /> — configured SKU", () => {
  const out = renderToStaticMarkup(<PilotBuyButton sku="cohort_pilot_50" configured={true} returnPath="/pilot" strings={en} label="Book a paid pilot" />);

  it("renders the checkout button with the SKU, the A$2,500 inc. GST quote and the quote-before-you-pay line; confirm panel closed until clicked", () => {
    expect(out).toContain('data-pilot-mode="checkout"');
    expect(out).toContain('data-pilot-sku="cohort_pilot_50"');
    expect(out).toContain('data-testid="pilot-buy-cohort_pilot_50"');
    expect(out).toContain("Book a paid pilot");
    expect(out).toContain("A$2,500 inc. GST");
    expect(out).toContain("quote before you pay");
    expect(out).toContain('aria-expanded="false"');
    expect(out).not.toContain('data-testid="pilot-confirm-cohort_pilot_50"');
    expect(out).not.toContain("/contact?topic=pilot");
  });
});

describe("<PilotBuyButton strings={vi} /> — the Vietnamese control (G22-C)", () => {
  const contact = renderToStaticMarkup(<PilotBuyButton sku="cohort_pilot_25" configured={false} returnPath="/vi/pilot#pilot" strings={vi} />);
  const checkout = renderToStaticMarkup(<PilotBuyButton sku="cohort_pilot_50" configured={true} returnPath="/vi/pilot#pilot" strings={vi} />);

  it("the default label, the contact quote line and the checkout quote line are the VI catalogue lines with the SKU amount filled in", () => {
    expect(contact).toContain(fillPilotString(VI["pilot.buy.label"]!, { price: formatPilotPrice("cohort_pilot_25") }));
    expect(contact).toContain("báo giá trước khi bạn trả");
    expect(contact).toContain("A$1,500 inc. GST");
    expect(contact).not.toContain("quote before you pay");
    expect(contact).not.toContain("Book the");
    expect(checkout).toContain(fillPilotString(VI["pilot.buy.label"]!, { price: formatPilotPrice("cohort_pilot_50") }));
    expect(checkout).toContain("A$2,500 inc. GST");
    expect(checkout).not.toContain("quote before you pay");
    expect(checkout).not.toMatch(/\{[a-zA-Z]+\}/);
    expect(contact).not.toMatch(/\{[a-zA-Z]+\}/);
  });

  it("every pilot.* key exists in both catalogues, none empty, and the {tokens} match", () => {
    for (const key of PILOT_UI_KEYS) {
      expect(EN[key], `en ${key}`).toBeTruthy();
      expect(VI[key], `vi ${key}`).toBeTruthy();
      const tokens = (s: string) => [...s.matchAll(/\{([a-zA-Z0-9]+)\}/g)].map((m) => m[1]).sort();
      expect(tokens(VI[key]!), key).toEqual(tokens(EN[key]!));
    }
    expect(en.includes).toHaveLength(8);
    expect(vi.includes).toHaveLength(8);
    expect(vi.includes).not.toEqual(en.includes);
  });

  it("the component source carries no English copy literal — the strings object is the only source", () => {
    const src = readFileSync(resolve(__dirname, "PilotBuyButton.tsx"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const phrase of ["quote before you pay", "Before you pay", "Continue to secure checkout", "Not now", "Book through our team", "Secure payment by Stripe", "Book the "]) {
      expect(src, phrase).not.toContain(phrase);
    }
  });
});

describe("resolvePilotCheckoutResponse — the fallback contract", () => {
  it("401 → sign in and come back", () => {
    expect(resolvePilotCheckoutResponse(401, { ok: false }, "/solutions/accelerator#pilot")).toEqual({
      kind: "login",
      href: "/auth/login?next=%2Fsolutions%2Faccelerator%23pilot",
    });
  });

  it("409 sku_unconfigured → the server's fallback, or the contact page when the body carries none", () => {
    expect(resolvePilotCheckoutResponse(409, { ok: false, error: "sku_unconfigured", fallback: "/contact?topic=pilot" }, "/pilot")).toEqual({ kind: "fallback", href: "/contact?topic=pilot" });
    expect(resolvePilotCheckoutResponse(409, null, "/pilot")).toEqual({ kind: "fallback", href: PILOT_CONTACT_FALLBACK });
    expect(resolvePilotCheckoutResponse(200, { ok: false, error: "sku_unconfigured" }, "/pilot")).toEqual({ kind: "fallback", href: PILOT_CONTACT_FALLBACK });
  });

  it("a checkout URL → navigate; anything else → an inline error, never a silent no-op", () => {
    expect(resolvePilotCheckoutResponse(200, { ok: true, url: "https://checkout.stripe.com/c/pay/cs_1" }, "/pilot")).toEqual({ kind: "navigate", href: "https://checkout.stripe.com/c/pay/cs_1" });
    expect(resolvePilotCheckoutResponse(503, { ok: false, reason: "Payments not configured" }, "/pilot")).toEqual({ kind: "error", message: "Payments not configured" });
    expect(resolvePilotCheckoutResponse(500, null, "/pilot")).toEqual({ kind: "error", message: PILOT_CHECKOUT_ERROR_FALLBACK });
    // G22-C: the localised generic message wins over the English fallback.
    expect(resolvePilotCheckoutResponse(500, null, "/vi/pilot", vi.errorGeneric)).toEqual({ kind: "error", message: VI["pilot.buy.error.generic"] });
  });
});
