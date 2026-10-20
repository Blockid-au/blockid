// /vi/pricing — Pricing v5 P5 payg_enabled switch. Flag OFF: no PAYG block
// and the pre-v5 Vietnamese FAQ JSON-LD; flag ON: the "Trả theo lần dùng"
// block and the v5 single-report / refund sentences.

import { describe, expect, it, vi } from "vitest";
import { renderToReadableStream } from "react-dom/server";

vi.mock("@/components/marketing/marketing-shell", () => ({
  MarketingShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/site/page-view-tracker", () => ({ PageViewTracker: () => null }));
const paygState = vi.hoisted(() => ({ enabled: false }));
vi.mock("@/lib/pricing/payg-view.server", async () => {
  const copy = await vi.importActual<typeof import("@/lib/pricing/payg-copy")>("@/lib/pricing/payg-copy");
  return {
    getPaygView: async () => (paygState.enabled ? copy.PAYG_ON_VIEW : copy.PAYG_OFF_VIEW),
    isPaygEnabled: async () => paygState.enabled,
  };
});

import { extractJsonLd } from "@/lib/seo/structured-data";
import ViPricingPage from "./page";

async function html(el: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

function answers(out: string): string[] {
  const faq = extractJsonLd(out).find((b) => b["@type"] === "FAQPage") as
    | { mainEntity: { acceptedAnswer: { text: string } }[] }
    | undefined;
  return (faq?.mainEntity ?? []).map((q) => q.acceptedAnswer.text);
}

describe("/vi/pricing — Pricing v5 P5", () => {
  it("flag OFF: no PAYG block; the VI FAQ JSON-LD keeps the pre-v5 sentences", async () => {
    paygState.enabled = false;
    const out = await html(await ViPricingPage({ searchParams: Promise.resolve({}) }));
    expect(out).not.toContain('data-testid="payg-block"');
    const a = answers(out);
    expect(a.some((x) => x.endsWith("Không có gói thì mỗi Trusted Business Report là A$3 cho một startup."))).toBe(true);
    expect(a.some((x) => x.includes("Báo cáo lẻ A$3 và gói tín dụng không hoàn tiền sau khi đã giao"))).toBe(true);
  });

  it("flag ON: the VI PAYG block and v5 FAQ sentences; valid JSON-LD; no A$3 report price", async () => {
    paygState.enabled = true;
    try {
      const out = await html(await ViPricingPage({ searchParams: Promise.resolve({}) }));
      expect(out).toContain('data-testid="payg-block"');
      expect(out).toContain("Trả theo lần dùng");
      expect(out).toContain("Gói Scout tự hoàn vốn sau hai báo cáo Full.");
      expect(extractJsonLd(out).filter((b) => b["@type"] === "PARSE_ERROR")).toEqual([]);
      const a = answers(out);
      expect(a.some((x) => x.includes("Snapshot A$19, Full A$49 hoặc Verified A$149"))).toBe(true);
      for (const x of a) expect(x).not.toMatch(/A\$3(?![\d,.])/);
    } finally {
      paygState.enabled = false;
    }
  });
});
