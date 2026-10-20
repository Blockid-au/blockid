// (marketing) layout — the Product JSON-LD block (Pricing v5 P5).
// Flag OFF: the pre-v5 single Offer, byte-identical. Flag ON: a valid
// AggregateOffer over Snapshot / Full / Verified from the PaygView.

import { describe, expect, it, vi } from "vitest";
import { renderToReadableStream } from "react-dom/server";

const paygState = vi.hoisted(() => ({ enabled: false }));
vi.mock("@/lib/pricing/payg-view.server", async () => {
  const copy = await vi.importActual<typeof import("@/lib/pricing/payg-copy")>("@/lib/pricing/payg-copy");
  return {
    getPaygView: async () => (paygState.enabled ? copy.PAYG_ON_VIEW : copy.PAYG_OFF_VIEW),
    isPaygEnabled: async () => paygState.enabled,
  };
});

import { extractJsonLd } from "@/lib/seo/structured-data";
import { PAYG_OFF_VIEW, PAYG_ON_VIEW, paygView } from "@/lib/pricing/payg-copy";
import { marketingProductJsonLd } from "@/lib/seo/marketing-product-jsonld";
import MarketingLayout from "./layout";

async function html(el: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

/** The block as it shipped before P5 — flag OFF must serialise to exactly this. */
const PRE_V5_PRODUCT = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: "Trusted Business Report — Startup Value Index by BlockID",
  description:
    "The full Trusted Business Report for Australian founders, from a pitch deck or a website URL. Startup Value Index score across 8 dimensions, an AUD valuation range with the methods behind it, a prioritised action list and a 90-day plan — emailed as a PDF, no account required.",
  brand: { "@type": "Brand", name: "BlockID.au" },
  url: "https://blockid.au/one-click-report",
  image: "https://blockid.au/opengraph-image",
  offers: {
    "@type": "Offer",
    price: "3.00",
    priceCurrency: "AUD",
    availability: "https://schema.org/InStock",
    url: "https://blockid.au/one-click-report",
    priceValidUntil: "2027-12-31",
  },
};

describe("marketingProductJsonLd()", () => {
  it("flag OFF serialises byte-for-byte to the pre-v5 block", () => {
    expect(JSON.stringify(marketingProductJsonLd(PAYG_OFF_VIEW))).toBe(JSON.stringify(PRE_V5_PRODUCT));
  });

  it("flag ON: AggregateOffer, AUD, low = Snapshot, high = Verified, 3 offers", () => {
    const ld = marketingProductJsonLd(PAYG_ON_VIEW) as { offers: Record<string, unknown> };
    expect(ld.offers).toMatchObject({
      "@type": "AggregateOffer",
      priceCurrency: "AUD",
      lowPrice: "19.00",
      highPrice: "149.00",
      offerCount: 3,
    });
    expect(JSON.stringify(ld)).not.toContain('"3.00"');
  });

  it("flag ON: low/high follow platform_config display cents", () => {
    const ld = marketingProductJsonLd(paygView({ payg_enabled: true, payg_snapshot_cents: 2150, payg_verified_cents: 16900 })) as {
      offers: Record<string, unknown>;
    };
    expect(ld.offers.lowPrice).toBe("21.50");
    expect(ld.offers.highPrice).toBe("169.00");
  });
});

describe("(marketing) layout — rendered Product JSON-LD", () => {
  it("flag OFF: one valid Product block with the legacy Offer", async () => {
    paygState.enabled = false;
    const out = await html(await MarketingLayout({ children: <p>child</p> }));
    const products = extractJsonLd(out).filter((b) => b["@type"] === "Product");
    expect(products).toEqual([PRE_V5_PRODUCT]);
    expect(out).toContain("<p>child</p>");
  });

  it("flag ON: one valid Product block (JSON.parse) with an AggregateOffer", async () => {
    paygState.enabled = true;
    try {
      const out = await html(await MarketingLayout({ children: <p>child</p> }));
      const blocks = extractJsonLd(out);
      expect(blocks.filter((b) => b["@type"] === "PARSE_ERROR")).toEqual([]);
      const product = blocks.find((b) => b["@type"] === "Product") as { offers: Record<string, unknown> } | undefined;
      expect(product?.offers["@type"]).toBe("AggregateOffer");
      expect(product?.offers.lowPrice).toBe("19.00");
      expect(product?.offers.highPrice).toBe("149.00");
    } finally {
      paygState.enabled = false;
    }
  });
});
