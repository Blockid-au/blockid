// Colocated test for /pricing (G17 P2-A): the template hero (one h1) wraps
// the untouched ladder — `#pricing-matrix`, `PricingSegmentSwitch`
// (`data-testid="pricing-segment-switch"`), `#tier-free/growth/pro` on the
// default Founder tab, `money-finder-anchor`, `#contact-sales`, one FAQPage
// + one BreadcrumbList, pageMetadata. The e2e smoke
// (tests/e2e/smoke/public-hash-csp.spec.ts) asserts the same ids live.
// The marketing shell mounts NavV2 → useRouter(), so it is mocked; the
// client islands render to static HTML.

import { describe, expect, it, vi } from "vitest";
import { renderToReadableStream } from "react-dom/server";

vi.mock("@/components/marketing/marketing-shell", () => ({
  MarketingShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/site/page-view-tracker", () => ({ PageViewTracker: () => null }));
vi.mock("@/components/sales/sticky-cta", () => ({ StickyCta: () => null }));

import { extractJsonLd } from "@/lib/seo/structured-data";
import { renderedTitle } from "@/lib/seo/page-meta";
import PricingPage, { metadata } from "./page";

async function html(el: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

describe("/pricing — template around the ladder (G17 P2-A)", () => {
  it("one h1, the ladder ids, the segment switch, the Money Finder anchor and the contact-sales row", async () => {
    const out = await html(await PricingPage());
    expect((out.match(/<h1\b/g) ?? []).length).toBe(1);
    expect(out).toMatch(/<section[^>]*id="pricing-matrix"/);
    expect(out).toContain('data-testid="pricing-segment-switch"');
    for (const id of ["tier-scout", "tier-firm", "tier-program", "tier-fund"]) expect(out, id).toContain(`id="${id}"`);
    expect(out).toContain('data-testid="money-finder-anchor"');
    expect(out).toMatch(/<section[^>]*id="contact-sales"/);
    for (const slug of ["investor_vc_ent", "accelerator_enterprise", "index_api"]) {
      expect(out).toContain(`href="/contact?plan=${slug}&amp;contact_reason=${slug}"`);
    }
    // G25-D: the hero trial CTA lands on the review step, never on sign-up → Stripe directly.
    expect(out).toContain('href="/checkout/review?plan=founder_growth&amp;trial=1&amp;entry=pricing_hero"');
    expect(out).toContain('href="/contact"');
    expect(out).toContain("Auschain PTY LTD");
  });

  it("G25: the default evaluator document preserves explicit founder pricing; the Programs tab is the sold ladder only — no pilot rung, no A$1,500 / A$2,500, no contact fallback", async () => {
    const out = await html(await PricingPage());
    expect(out).toContain('data-active-tab="evaluator"');

    expect(out).not.toContain('data-testid="pricing-pilot-rung"');
    expect(out).not.toMatch(/pilot/i);
    const { PricingSegmentSwitch } = await import("@/components/landing/pricing-segment-switch");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const founder = renderToStaticMarkup(<PricingSegmentSwitch initialSegment="founder" readTabFromUrl={false} />);
    expect(founder).toContain('data-testid="founder-payg"');
    expect(founder).toMatch(/A\$3(<!-- -->)? per report, pay-as-you-go/);
    const programs = renderToStaticMarkup(<PricingSegmentSwitch initialSegment="programs" readTabFromUrl={false} />);
    expect(programs).toContain('data-testid="programs-ladder"');
    expect(programs).not.toContain('data-testid="pricing-pilot-rung"');
    expect(programs).not.toMatch(/pilot/i);
    expect(programs).not.toContain("A$1,500");
    expect(programs).not.toContain("A$2,500");
    expect(programs).not.toContain("/contact?topic=pilot");
    expect(programs).not.toContain('data-testid="founder-payg"');
    expect(programs).not.toMatch(/A\$3\b/);
  });

  it("emits one FAQPage and one BreadcrumbList", async () => {
    const out = await html(await PricingPage());
    const types = extractJsonLd(out).map((b) => b["@type"]);
    expect(types.filter((t) => t === "FAQPage")).toHaveLength(1);
    expect(types.filter((t) => t === "BreadcrumbList")).toHaveLength(1);
  });

  it("pageMetadata: canonical + VI alternate, rendered title ≤ 65, description ≤ 165", () => {
    expect(metadata.alternates?.canonical).toBe("https://blockid.au/pricing");
    expect(metadata.alternates?.languages?.vi).toBe("https://blockid.au/vi/pricing");
    expect(renderedTitle(metadata.title).length).toBeLessThanOrEqual(65);
    expect(String(metadata.description).length).toBeLessThanOrEqual(165);
  });
});
