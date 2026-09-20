// <NotOfferedCard> — the one hidden-feature card (G20-F1, 2026-09-20).
// Pins: the label, the contact link (`/contact?topic=sales&feature=<key>`),
// the alternatives, the back link, no date / upgrade / notify-me, and the
// legacy <NotAvailableYet> alias rendering the same card.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Shield } from "lucide-react";
import { NOT_OFFERED_LABEL, NotOfferedCard, contactHrefForFeature } from "./not-offered-card";
import { NotAvailableYet } from "./not-available-yet";
import { hiddenPageMetadata } from "./hidden-feature-page";

describe("<NotOfferedCard>", () => {
  it("says not offered, gives the reason, the alternatives, a Talk-to-us link and a back link — never a date, an upgrade or a notify-me lead", () => {
    const html = renderToStaticMarkup(
      <NotOfferedCard
        feature="sso"
        title="Single Sign-On"
        icon={Shield}
        reason="Needs a partner integration we have not built."
        alternatives={[{ href: "/workspace/team", label: "Invite team members" }]}
      />,
    );
    expect(html).toContain(NOT_OFFERED_LABEL);
    expect(html).toContain("Not offered yet");
    expect(html).toContain("Needs a partner integration we have not built.");
    expect(html).toContain('href="/workspace/team"');
    expect(html).toContain('href="/contact?topic=sales&amp;feature=sso"');
    expect(html).toContain("Talk to us");
    expect(html).toContain('data-testid="not-offered-card"');
    expect(html).toContain('data-feature="sso"');
    expect(html).toContain('href="/workspace"');
    expect(html).toContain("<h1");
    expect(html).not.toMatch(/Coming Soon/i);
    expect(html).not.toMatch(/Estimated/i);
    expect(html).not.toMatch(/Upgrade/);
    expect(html).not.toMatch(/Notify me/i);
    expect(html).not.toMatch(/not available yet/i);
  });

  it("h2 mode + VI copy for a card composed into a page that owns the h1", () => {
    const html = renderToStaticMarkup(
      <NotOfferedCard feature="x_y" title="T" reason="R." headingLevel="h2" headingId="sec" locale="vi" backHref="/vi" />,
    );
    expect(html).toContain('<h2 id="sec"');
    expect(html).not.toContain("<h1");
    expect(html).toContain("Chưa cung cấp");
    expect(html).toContain("Liên hệ với chúng tôi");
    expect(html).toContain('href="/vi"');
  });

  it("contactHrefForFeature encodes the key and pre-selects the sales topic (a closed set on /contact)", () => {
    expect(contactHrefForFeature("white_label")).toBe("/contact?topic=sales&feature=white_label");
    expect(contactHrefForFeature("a b")).toBe("/contact?topic=sales&feature=a%20b");
  });

  it("hiddenPageMetadata is noindex + nofollow with the plain title pattern", () => {
    const m = hiddenPageMetadata("Weekly digest");
    expect(m.title).toBe("Weekly digest | BlockID");
    expect(m.robots).toEqual({ index: false, follow: false });
    expect(String(m.description)).toMatch(/not offered yet/i);
  });
});

describe("<NotAvailableYet> (legacy alias)", () => {
  it("renders the same card — pages the G19 lane owns keep importing the old name", () => {
    const html = renderToStaticMarkup(
      <NotAvailableYet
        feature="listing_submission_form"
        title="Submit a listing"
        userEmail="founder@example.com"
        reason="The submission form is not built."
        alternatives={[{ href: "/workspace/exit/listing", label: "Listing Readiness" }]}
      />,
    );
    expect(html).toContain('data-testid="not-offered-card"');
    expect(html).toContain("Not offered yet");
    expect(html).toContain('href="/contact?topic=sales&amp;feature=listing_submission_form"');
    expect(html).not.toContain("founder@example.com");
    expect(html).not.toMatch(/Notify me/i);
    expect(html).not.toMatch(/not available yet/i);
  });
});
