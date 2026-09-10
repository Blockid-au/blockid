// Render test for /funding/report/demo (S7-B public sample). Pins: the
// "Sample report" banner, >= 3 ranked grant cards, the SVG Gantt, the CTA
// href, indexable metadata + canonical + Article JSON-LD, and the absence of
// everything a paid report shows only to its viewer (PDF / data-room
// buttons, Radar upsell, ICS / draft links, tokens).

import type React from "react";
import { renderToReadableStream } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DEMO_BANNER, DEMO_CTA_HREF, DEMO_CTA_LABEL, buildDemoFundingReport } from "@/lib/funding/demo-report";

vi.mock("server-only", () => ({}));
vi.mock("@/components/marketing/marketing-shell", () => ({
  MarketingShell: ({ children }: { children: React.ReactNode }) => <div data-shell>{children}</div>,
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-nonce": "test-nonce" }) }));

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

  it("emits Article JSON-LD with the CSP nonce", async () => {
    const out = await html();
    expect(out).toContain('type="application/ld+json"');
    expect(out).toContain('nonce="test-nonce"');
    expect(out).toContain('"@type":"Article"');
    expect(out).toContain('"url":"https://blockid.au/funding/report/demo"');
  });

  it("is indexable with a canonical and ISR (no force-dynamic)", async () => {
    const mod = await import("./page");
    expect(mod.metadata.robots).toEqual({ index: true, follow: true });
    expect(mod.metadata.alternates?.canonical).toBe("https://blockid.au/funding/report/demo");
    expect(mod.revalidate).toBe(3600);
    expect((mod as { dynamic?: string }).dynamic).toBeUndefined();
  });
});
