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
    for (const id of ["tier-free", "tier-growth", "tier-pro"]) expect(out, id).toContain(`id="${id}"`);
    expect(out).toContain('data-testid="money-finder-anchor"');
    expect(out).toMatch(/<section[^>]*id="contact-sales"/);
    for (const slug of ["investor_vc_ent", "accelerator_enterprise", "index_api"]) {
      expect(out).toContain(`href="/contact?plan=${slug}&amp;contact_reason=${slug}"`);
    }
    expect(out).toContain('href="/signup?plan=founder_growth&amp;trial=1"');
    expect(out).toContain('href="/contact"');
    expect(out).toContain("Auschain PTY LTD");
  });

  it("G21 P0-C: the default (founder) document carries the A$3 footnote, not the pilot rung; the Programs deep link renders the pilot rung FIRST with both SKUs", async () => {
    const out = await html(await PricingPage());
    expect(out).toContain('data-testid="founder-payg"');
    expect(out).toMatch(/A\$3(<!-- -->)? per report, pay-as-you-go/);
    expect(out).not.toContain('data-testid="pricing-pilot-rung"');
    // The switch renders the Programs ladder when told the tab; the pilot
    // rung sits above the Intake / Cohort cards and both SKUs are priced
    // from PILOT_SKUS with the contact fallback (env vars unset here).
    const { PricingSegmentSwitch } = await import("@/components/landing/pricing-segment-switch");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const programs = renderToStaticMarkup(
      <PricingSegmentSwitch initialSegment="programs" readTabFromUrl={false} pilotConfigured={{ cohort_pilot_25: false, cohort_pilot_50: false }} />,
    );
    expect(programs).toContain('data-testid="pricing-pilot-rung"');
    expect(programs.indexOf('data-testid="pricing-pilot-rung"')).toBeLessThan(programs.indexOf('data-testid="programs-ladder"'));
    expect(programs.match(/data-testid="pricing-pilot-card"/g)).toHaveLength(2);
    expect(programs).toContain("A$1,500");
    expect(programs).toContain("A$2,500");
    expect(programs).toContain("inc. GST");
    expect(programs).toContain('href="/contact?topic=pilot"');
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
