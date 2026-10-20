// Colocated test for /business-id + /vi/business-id (G17 P2-A): one h1,
// the five section ids, the five verification levels, the live badge from
// /embed/badge, /signup CTAs (not the retired /founding-50), hreflang
// pair via pageMetadata. The marketing shell is mocked.

import { describe, expect, it, vi } from "vitest";
import { renderToReadableStream } from "react-dom/server";

vi.mock("@/components/marketing/marketing-shell", () => ({
  MarketingShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
const paygState = vi.hoisted(() => ({ enabled: false }));
vi.mock("@/lib/pricing/payg-view.server", async () => {
  const copy = await vi.importActual<typeof import("@/lib/pricing/payg-copy")>("@/lib/pricing/payg-copy");
  return {
    getPaygView: async () => (paygState.enabled ? copy.PAYG_ON_VIEW : copy.PAYG_OFF_VIEW),
    isPaygEnabled: async () => paygState.enabled,
  };
});

import { renderedTitle } from "@/lib/seo/page-meta";
import BusinessIdPage, { generateMetadata } from "./page";
import ViBusinessIdPage from "../../vi/business-id/page";

async function html(el: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

describe("/business-id — template (G17 P2-A)", () => {
  it("EN: one h1, #what/#levels/#pillars/#sharing/#badge, L1–L5, the live badge, /signup and the demo profile", async () => {
    const out = await html(await BusinessIdPage());
    expect((out.match(/<h1\b/g) ?? []).length).toBe(1);
    for (const id of ["what", "levels", "pillars", "sharing", "badge", "cta"]) expect(out).toMatch(new RegExp(`<section[^>]*id="${id}"`));
    for (const l of ["L1", "L2", "L3", "L4", "L5"]) expect(out).toContain(`>${l}<`);
    expect(out).toContain('src="/embed/badge?slug=blockid-demo&amp;size=lg"');
    expect(out).toContain('href="/id/blockid-demo"');
    expect(out).toContain('href="/signup"');
    expect(out).not.toContain("/founding-50");
    expect(out).toContain('href="/reports/samples"');
  });

  it("VI mirror keeps the reader in /vi", async () => {
    const out = await html(await ViBusinessIdPage());
    expect(out).toContain('lang="vi"');
    expect(out).toContain('href="/vi/id/blockid-demo"');
    expect((out.match(/<h1\b/g) ?? []).length).toBe(1);
  });

  it("pageMetadata: canonical + hreflang pair, rendered title ≤ 65, description ≤ 165", async () => {
    const meta = await generateMetadata();
    expect(meta.alternates?.canonical).toBe("https://blockid.au/business-id");
    expect(meta.alternates?.languages?.vi).toBe("https://blockid.au/vi/business-id");
    expect(renderedTitle(meta.title).length).toBeLessThanOrEqual(65);
    expect(String(meta.description).length).toBeLessThanOrEqual(165);
  });

  it("Pricing v5 P5: the sample-report CTA keeps '(A$3)' with payg_enabled off and drops the price when on (EN + VI)", async () => {
    paygState.enabled = false;
    expect(await html(await BusinessIdPage())).toContain("See a sample Trusted Business Report (A$3)");
    expect(await html(await ViBusinessIdPage())).toContain("Xem Trusted Business Report mẫu (A$3)");
    paygState.enabled = true;
    try {
      const en = await html(await BusinessIdPage());
      expect(en).toContain("See a sample Trusted Business Report");
      expect(en).not.toContain("(A$3)");
      const vi_ = await html(await ViBusinessIdPage());
      expect(vi_).toContain("Xem Trusted Business Report mẫu");
      expect(vi_).not.toContain("(A$3)");
    } finally {
      paygState.enabled = false;
    }
  });
});
