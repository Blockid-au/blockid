// G21 P0-C — PilotBuyButton: the static markup (price from the SKU, "inc.
// GST", "quote before you pay", the contact link when the SKU is not
// configured, the checkout button + confirm contract when it is) and the
// pure response resolver (401 → login, 409 → the fallback, url → navigate,
// otherwise an error). No DOM in this suite; interaction is the live-qa lane.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PILOT_CONTACT_FALLBACK, formatPilotPrice } from "@/lib/pricing/pilot-skus";
import { PilotBuyButton, resolvePilotCheckoutResponse } from "./PilotBuyButton";

describe("<PilotBuyButton /> — unconfigured SKU", () => {
  const out = renderToStaticMarkup(<PilotBuyButton sku="cohort_pilot_25" configured={false} returnPath="/solutions/accelerator#pilot" ctaId="x" />);

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
  const out = renderToStaticMarkup(<PilotBuyButton sku="cohort_pilot_50" configured={true} returnPath="/pilot" label="Book a paid pilot" />);

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
    expect(resolvePilotCheckoutResponse(500, null, "/pilot")).toMatchObject({ kind: "error" });
  });
});
