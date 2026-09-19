// Colocated test for /one-click-report + /success (G17 P2-A): one h1, the
// form mounted twice, the section ids, the FAQPage JSON-LD, the cancel
// banner on `?canceled=true`, no emoji icons, pageMetadata (success is
// noindex). The marketing shell mounts NavV2 → useRouter(), so it is
// mocked; the client form renders to static HTML.

import { describe, expect, it, vi } from "vitest";
import { renderToReadableStream } from "react-dom/server";

vi.mock("@/components/marketing/marketing-shell", () => ({
  MarketingShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/analytics/page-tracker", () => ({ PageTracker: () => null }));

import { extractJsonLd } from "@/lib/seo/structured-data";
import { renderedTitle } from "@/lib/seo/page-meta";
import { ONE_CLICK_STEPS } from "./one-click-report-content";
import OneClickReportPage, { metadata } from "./page";
import OneClickSuccessPage, { metadata as successMetadata } from "./success/page";

async function html(el: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

describe("/one-click-report — template (G17 P2-A)", () => {
  it("one h1, the form twice, #how / #deliverables / #faq / #cta, one FAQPage, no emoji", async () => {
    const out = await html(await OneClickReportPage({ searchParams: Promise.resolve({}) }));
    expect((out.match(/<h1\b/g) ?? []).length).toBe(1);
    for (const id of ["how", "deliverables", "faq", "cta"]) expect(out).toMatch(new RegExp(`<section[^>]*id="${id}"`));
    expect((out.match(/<form\b/g) ?? []).length).toBe(2);
    for (const s of ONE_CLICK_STEPS) expect(out).toContain(s.title);
    expect(extractJsonLd(out).filter((b) => b["@type"] === "FAQPage")).toHaveLength(1);
    expect(out).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    expect(out).not.toContain("Checkout canceled.");
  });

  it("shows the cancel banner on ?canceled=true", async () => {
    const out = await html(await OneClickReportPage({ searchParams: Promise.resolve({ canceled: "true" }) }));
    expect(out).toContain("Checkout canceled.");
    expect(out).toContain('role="status"');
  });

  it("pageMetadata on both routes; success is noindex", () => {
    expect(metadata.alternates?.canonical).toBe("https://blockid.au/one-click-report");
    expect(renderedTitle(metadata.title).length).toBeLessThanOrEqual(65);
    expect(String(metadata.description).length).toBeLessThanOrEqual(165);
    expect(successMetadata.robots).toEqual({ index: false, follow: false });
  });

  it("/success renders one h1 and the signup CTA", async () => {
    const out = await html(<OneClickSuccessPage />);
    expect((out.match(/<h1\b/g) ?? []).length).toBe(1);
    expect(out).toContain('href="/signup"');
    expect(out).toContain("1 to 3 minutes");
  });
});
