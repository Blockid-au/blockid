// <PaygBlock /> — Pricing v5 P5 "Pay as you go" on /pricing + /vi/pricing.
// Flag OFF renders nothing; flag ON renders the three tiers from the view.

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/components/site/page-view-tracker", () => ({
  PageViewTracker: ({ event, params }: { event: string; params: { surface: string } }) => (
    <i data-event={event} data-surface={params.surface} />
  ),
}));

import { PAYG_OFF_VIEW, PAYG_ON_VIEW, paygView } from "@/lib/pricing/payg-copy";
import { PAYG_SKUS } from "@/lib/pricing/v5-payg";
import { PaygBlock, paygCardBullets, paygTierHref } from "./payg-block";

describe("<PaygBlock />", () => {
  it("flag OFF renders nothing (today's /pricing)", () => {
    expect(renderToStaticMarkup(<PaygBlock view={PAYG_OFF_VIEW} />)).toBe("");
    expect(renderToStaticMarkup(<PaygBlock view={PAYG_OFF_VIEW} locale="vi" />)).toBe("");
  });

  it("flag ON: three cards with view prices, one-off inc. GST, the break-even line and the analytics beacon", () => {
    const out = renderToStaticMarkup(<PaygBlock view={PAYG_ON_VIEW} />);
    for (const tier of ["snapshot", "full", "verified"]) expect(out).toContain(`data-testid="payg-card-${tier}"`);
    for (const price of ["A$19", "A$49", "A$149"]) expect(out).toContain(price);
    expect((out.match(/one-off · inc\. GST/g) ?? []).length).toBe(3);
    expect(out).toContain("Scout pays for itself after two Full reports.");
    expect(out).toContain('data-event="payg_tier_viewed"');
    expect(out).toContain('data-surface="pricing"');
    expect(out).not.toMatch(/limited|hurry|only \d+ left|% off/i);
  });

  it("prices come from platform_config display cents, the SLA from verified_sla_business_days", () => {
    const view = paygView({ payg_enabled: true, payg_snapshot_cents: 2200, payg_verified_cents: 15900, verified_sla_business_days: 3 });
    const out = renderToStaticMarkup(<PaygBlock view={view} />);
    expect(out).toContain("A$22");
    expect(out).toContain("A$159");
    expect(out).toContain("Delivered within 3 business days");
    expect(out).not.toContain("Delivered within 2 business days");
  });

  it("CTAs go to the review-before-pay entry; Verified signs in first; never Stripe", () => {
    expect(paygTierHref("snapshot")).toBe("/analyze?tier=paid&payg=snapshot");
    expect(paygTierHref("full")).toBe("/analyze?tier=paid&payg=full");
    expect(paygTierHref("verified")).toBe(`/auth/login?next=${encodeURIComponent("/analyze?tier=paid&payg=verified")}`);
    const out = renderToStaticMarkup(<PaygBlock view={PAYG_ON_VIEW} />);
    expect(out).toContain('data-testid="payg-verified-signin"');
    expect(out).not.toMatch(/stripe\.com|\/api\/.*checkout/);
  });

  it("bullets come from the catalogue; Verified lists what it adds over Full", () => {
    expect(paygCardBullets(PAYG_ON_VIEW, "snapshot")).toEqual([...PAYG_SKUS.report_snapshot.included]);
    expect(paygCardBullets(PAYG_ON_VIEW, "full")).toEqual([...PAYG_SKUS.report_full.included]);
    const verified = paygCardBullets(PAYG_ON_VIEW, "verified");
    expect(verified).toContain("Evidence reviewed by the BlockID team");
    expect(verified).not.toContain("Full PDF");
    expect(verified[verified.length - 1]).toBe("Delivered within 2 business days");
  });

  it("VI locale: Vietnamese labels, VI break-even line, every catalogue bullet translated", () => {
    const out = renderToStaticMarkup(<PaygBlock view={PAYG_ON_VIEW} locale="vi" />);
    expect(out).toContain("Trả theo lần dùng");
    expect(out).toContain("Gói Scout tự hoàn vốn sau hai báo cáo Full.");
    expect(out).toContain("một lần · đã gồm GST");
    expect(out).toContain('data-surface="pricing_vi"');
    for (const tier of ["snapshot", "full", "verified"] as const) {
      const en = paygCardBullets(PAYG_ON_VIEW, tier, "en");
      const vi = paygCardBullets(PAYG_ON_VIEW, tier, "vi");
      en.forEach((line, i) => expect(vi[i], line).not.toBe(line));
    }
  });
});
