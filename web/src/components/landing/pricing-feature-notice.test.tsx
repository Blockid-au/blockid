import { describe, expect, it, vi } from "vitest";

// S31-D: the notice reads useSearchParams on the client; tests pass props
// explicitly, so the hook just returns an empty bag.
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
import { renderToStaticMarkup } from "react-dom/server";
import { PLANS_V2 } from "@/lib/plans-v2";
import { PricingFeatureNotice } from "./pricing-feature-notice";

const starter = PLANS_V2.find((p) => p.id === "founder_starter")!;

describe("<PricingFeatureNotice> (S31-B)", () => {
  it("tells a gated founder what the page needed and which plan carries it", () => {
    const html = renderToStaticMarkup(
      <PricingFeatureNotice feature="data_room.access" from="/workspace/documents/data-room" />,
    );
    expect(html).toContain("To open Data Room you need the investor data room");
    expect(html).toContain(`included from the ${starter.name} plan (A$${starter.monthly_aud}/mo)`);
    expect(html).toContain('href="#tier-starter"');
    expect(html).not.toContain("Back to");
  });

  it("explains the Equity add-on for esop.manage", () => {
    const html = renderToStaticMarkup(<PricingFeatureNotice feature="esop.manage" />);
    expect(html).toContain("Equity add-on");
    expect(html).toContain("Growth plan");
  });

  it("routes enterprise-only features to contact sales", () => {
    const html = renderToStaticMarkup(<PricingFeatureNotice feature="sso" from="/workspace/settings/enterprise" />);
    expect(html).toContain("Contact sales");
    expect(html).toContain("/contact?plan=enterprise&amp;feature=sso");
  });

  it("renders nothing without a feature, for junk, or for free-tier features", () => {
    expect(renderToStaticMarkup(<PricingFeatureNotice feature={undefined} />)).toBe("");
    expect(renderToStaticMarkup(<PricingFeatureNotice feature="<b>x</b>" />)).toBe("");
    expect(renderToStaticMarkup(<PricingFeatureNotice feature="svi.run.limited" />)).toBe("");
  });
});
