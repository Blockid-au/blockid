// Render test for /funding/report/demo (S7-B public sample). Pins: the
// "Sample report" banner, >= 3 ranked grant cards, the SVG Gantt, the CTA
// href, indexable metadata + canonical + Article JSON-LD, and the absence of
// everything a paid report shows only to its viewer (PDF / data-room
// buttons, Radar upsell, ICS / draft links, tokens). G35 P5 (D25): the
// Money Finder price follows the payg_enabled view — OFF pins today's copy,
// ON the v5 catalogue.

import type React from "react";
import { renderToReadableStream } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DEMO_BANNER, DEMO_CTA_HREF, DEMO_CTA_LABEL, buildDemoFundingReport, demoCtaLabel } from "@/lib/funding/demo-report";
import { PAYG_OFF_VIEW, PAYG_ON_VIEW, type PaygView } from "@/lib/pricing/payg-copy";
import { extractJsonLd, validateJsonLd } from "@/lib/seo/structured-data";
import { assertDeterministicRender, assertHydratableNesting } from "@/test/hydration-guard";

vi.mock("server-only", () => ({}));
vi.mock("@/components/marketing/marketing-shell", () => ({
  MarketingShell: ({ children }: { children: React.ReactNode }) => <div data-shell>{children}</div>,
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-nonce": "test-nonce" }) }));
const payg = vi.hoisted(() => ({ view: null as PaygView | null }));
vi.mock("@/lib/pricing/payg-view.server", async () => {
  const { PAYG_OFF_VIEW: off } = await import("@/lib/pricing/payg-copy");
  return { getPaygView: async () => payg.view ?? off, isPaygEnabled: async () => (payg.view ?? off).enabled };
});

async function html(): Promise<string> {
  const { default: Page } = await import("./page");
  const el = await Page();
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return (await new Response(stream).text()).replace(/<!-- -->/g, "");
}

describe("/funding/report/demo", () => {
  it("renders the sample banner, the header for the fixed intake and the CTA to /funding?intent=money", async () => {
    const out = await html();
    expect(out).toContain('data-testid="demo-report-banner"');
    expect(out).toContain(DEMO_BANNER);
    expect(out).toContain('data-status="ready"');
    expect(out).toContain("Soil-moisture sensors and an app that tell grain farmers when to irrigate");
    expect(out).toContain("New South Wales");
    expect(out).toContain(" MVP</span>");
    expect(out).toContain("NSW · MVP · Agtech / food");
    expect(out).toContain("Generated 10 Sep 2026, 10:00 AEST");
    // Both CTAs (banner + closing card) carry the label and the money intent.
    const href = DEMO_CTA_HREF.replace(/&/g, "&amp;");
    expect(out.split(`href="${href}"`).length - 1).toBeGreaterThanOrEqual(2);
    expect(out).toContain(DEMO_CTA_LABEL);
    expect(out).toContain('data-testid="demo-report-cta-card"');
  });

  it("renders >= 3 ranked grant cards, the programs and the SVG Gantt + table twin", async () => {
    const out = await html();
    const report = buildDemoFundingReport();
    const cards = out.match(/data-grant="/g)?.length ?? 0;
    expect(cards).toBeGreaterThanOrEqual(3);
    expect(cards).toBe(report.grants.length);
    expect(out).toContain("#1 · fit ");
    expect(out).toContain('data-score="');
    expect(out).toContain("Why you: </span>");
    expect(out.match(/data-program="/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(out).toContain("data-timeline-gantt");
    expect(out).toContain("data-today-marker");
    expect(out).toContain('data-month="2026-09"');
    expect(out).toContain("data-timeline-table");
    expect(out).toContain("Your next 3 actions");
    expect(out).toContain("Where you stand");
    expect(out).toContain("data-funding-disclaimer");
    expect(out).toContain("a match is not an approval");
  });

  it("shows nothing that belongs to a paid viewer — no PDF / data-room, no upsell, no ICS / draft links, no secrets", async () => {
    const out = await html();
    expect(out).not.toContain("data-report-owner-actions");
    expect(out).not.toContain("/pdf");
    expect(out).not.toContain("Save to data room");
    expect(out).not.toContain("data-radar-upsell");
    expect(out).not.toContain("data-viewer=");
    expect(out).not.toContain("data-ics");
    expect(out).not.toContain("data-draft");
    expect(out).not.toMatch(/access_token|cs_live|cs_test|@example\.com/);
  });

  it("emits Article JSON-LD (a data block — no CSP nonce needed, S31-D)", async () => {
    const out = await html();
    expect(out).toContain('type="application/ld+json"');
    expect(out).not.toContain('nonce="test-nonce"');
    expect(out).toContain('"@type":"Article"');
    expect(out).toContain('"url":"https://blockid.au/funding/report/demo"');
  });

  it("is indexable with a canonical and ISR (no force-dynamic)", async () => {
    const mod = await import("./page");
    const metadata = await mod.generateMetadata();
    expect(metadata.robots).toEqual({ index: true, follow: true });
    expect(metadata.alternates?.canonical).toBe("https://blockid.au/funding/report/demo");
    expect(mod.revalidate).toBe(3600);
    expect((mod as { dynamic?: string }).dynamic).toBeUndefined();
  });

  it("S8-A: ≤ 60 title via the brand template, 140–160 description, OG image; Article + BreadcrumbList validate; links both free directories; one H1", async () => {
    const metadata = await (await import("./page")).generateMetadata();
    expect(String(metadata.title)).toBe("Sample startup funding report — what A$3 buys");
    expect(`${String(metadata.title)} | BlockID.au`.length).toBeLessThanOrEqual(60);
    expect(String(metadata.description).length).toBeGreaterThanOrEqual(140);
    expect(String(metadata.description).length).toBeLessThanOrEqual(160);
    expect((metadata.openGraph as { images?: unknown[]; type?: string }).images).toHaveLength(1);
    expect((metadata.openGraph as { type?: string }).type).toBe("article");
    const out = await html();
    const blocks = extractJsonLd(out);
    expect(blocks.map((b) => b["@type"]).sort()).toEqual(["Article", "BreadcrumbList"]);
    for (const b of blocks) expect(validateJsonLd(b), String(b["@type"])).toEqual({ ok: true, errors: [] });
    expect(out).toContain('href="/funding/grants"');
    expect(out).toContain('href="/funding/programs"');
    expect(out.match(/<h1[\s>]/g)).toHaveLength(1);
  });
});

describe("/funding/report/demo — payg_enabled (G35 P5, D25)", () => {
  it("flag OFF renders today's price on both CTAs and the closing line", async () => {
    payg.view = PAYG_OFF_VIEW;
    const out = await html();
    expect(DEMO_CTA_LABEL).toBe("Build mine for A$3");
    expect(out.split("Build mine for A$3").length - 1).toBe(2);
    expect(out).toContain("A$3 once, or included with Founder Radar.");
  });

  it("flag ON renders the D25 price in the CTAs, closing line, title, description and Article JSON-LD", async () => {
    payg.view = PAYG_ON_VIEW;
    try {
      const out = await html();
      expect(demoCtaLabel(PAYG_ON_VIEW)).toBe("Build mine for A$19");
      expect(out.split("Build mine for A$19").length - 1).toBe(2);
      expect(out).toContain("A$19 once, or included with Founder Radar.");
      expect(out).not.toMatch(/A\$3(?![\d,])/);
      expect(out).toContain('"headline":"Sample startup funding report — what A$19 buys"');
      const metadata = await (await import("./page")).generateMetadata();
      expect(String(metadata.title)).toBe("Sample startup funding report — what A$19 buys");
      expect(String(metadata.description)).not.toMatch(/A\$3(?![\d,])/);
      expect(String(metadata.description).length).toBeLessThanOrEqual(160);
    } finally {
      payg.view = null;
    }
  });
});

describe("/funding/report/demo — hydration safety (release QA-2 F9)", () => {
  it("SSR markup has no nesting the browser parser would relocate (React #418)", async () => {
    assertHydratableNesting(await html(), "/funding/report/demo");
  });
  it("renders identically twice under a fixed clock", async () => {
    await assertDeterministicRender(html);
  });
});
