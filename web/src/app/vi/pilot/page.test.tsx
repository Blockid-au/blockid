// Colocated test for /vi/pilot (G22-C): the Vietnamese mirror of the paid
// Cohort Validation Pilot landing. Pins: indexable metadata with the VI
// canonical + the hreflang pair (en → /pilot, x-default → /pilot), the
// rendered title ≤ 60 and description 140–160, one H1 = the VI catalogue
// line, `lang="vi"`, the offer block with two cards at the PILOT_SKUS
// amounts, the VI buy labels (no English control string), four next steps,
// the approved VI data sentence verbatim, the VI TrustBand, no unresolved
// token, never "PhD". The marketing shell mounts NavV2 → useRouter(), so it
// is mocked exactly like the English page test.

import { describe, expect, it, vi } from "vitest";
import { renderToReadableStream } from "react-dom/server";

vi.mock("@/components/marketing/marketing-shell", () => ({
  MarketingShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import viMessages from "@/lib/i18n/messages/vi.json";
import { PILOT_SKUS, formatPilotPrice } from "@/lib/pricing/pilot-skus";
import { fillPilotString } from "@/lib/pricing/pilot-strings";
import { renderedTitle } from "@/lib/seo/page-meta";
import { TRUST_BAND_COPY } from "@/components/marketing/template";
import ViPilotPage, { generateMetadata, revalidate } from "./page";

const VI = viMessages as Record<string, string>;

async function html(el: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

describe("/vi/pilot metadata", () => {
  it("indexable, canonical /vi/pilot, hreflang pair, title ≤ 60, description 140–160 with the SKU price", async () => {
    const m = await generateMetadata();
    expect(m.robots).toEqual({ index: true, follow: true });
    expect(m.alternates?.canonical).toBe("https://blockid.au/vi/pilot");
    expect(m.alternates?.languages).toEqual({
      en: "https://blockid.au/pilot",
      vi: "https://blockid.au/vi/pilot",
      "x-default": "https://blockid.au/pilot",
    });
    expect(String(m.title)).toBe(VI["meta.pilot.title"]);
    expect(renderedTitle(m.title).length).toBeLessThanOrEqual(60);
    const description = String(m.description);
    expect(description.length).toBeGreaterThanOrEqual(140);
    expect(description.length).toBeLessThanOrEqual(160);
    expect(description).toContain(formatPilotPrice("cohort_pilot_25"));
    expect(description).not.toMatch(/\{[a-zA-Z0-9]+\}/);
    expect((m.openGraph as { locale?: string }).locale).toBe("vi_VN");
    expect(revalidate).toBe(300);
  });
});

describe("/vi/pilot page", () => {
  it("one VI H1, lang=vi, both SKUs inc. GST with VI buy labels, four next steps, the VI data sentence, the VI TrustBand, no token, no English control string", async () => {
    const out = await html(await ViPilotPage());
    expect(out.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(out).toContain(esc(VI["pilot.page.hero.title"]!));
    expect(out).toMatch(/<div lang="vi" data-pilot-lang="vi"/);
    expect(out).toMatch(/<section[^>]*id="pilot"/);
    expect(out.match(/data-testid="pilot-offer-card"/g)).toHaveLength(2);
    expect(out).toContain(formatPilotPrice("cohort_pilot_25"));
    expect(out).toContain(formatPilotPrice("cohort_pilot_50"));
    expect(out).toContain("inc. GST");
    expect(out).toContain(`${PILOT_SKUS.cohort_pilot_25.applicantsCap} hồ sơ`);
    expect(out).toContain('data-testid="pilot-buy-cohort_pilot_25"');
    expect(out).toContain('data-testid="pilot-buy-cohort_pilot_50"');
    expect(out.match(/data-pilot-mode="contact"/g)).toHaveLength(2);
    expect(out).toContain('href="/contact?topic=pilot"');
    expect(out).toContain(esc(fillPilotString(VI["pilot.buy.label"]!, { price: formatPilotPrice("cohort_pilot_25") })));
    expect(out).toContain("báo giá trước khi bạn trả");
    expect(out).not.toContain("quote before you pay");
    expect(out).not.toContain("Book the ");
    expect(out).toContain('data-testid="pilot-metrics"');
    expect(out).toContain('data-testid="pilot-next-steps"');
    expect(out).toContain(esc(VI["pilot.page.next.step1.title"]!));
    expect(out).toContain(esc(VI["solutions.principle.data"]!));
    expect(out).toContain(esc(VI["pilot.page.hero.footnote.tail"]!));
    expect(out).toContain('data-testid="pilot-after"');
    expect(out).toContain('data-testid="pilot-disclaimer-vi"');
    // The VI TrustBand, not the English one.
    expect(out).toMatch(/data-testid="trust-band"[^>]*data-locale="vi"/);
    expect(out).toContain(TRUST_BAND_COPY.vi.eyebrow);
    expect(out).not.toContain(TRUST_BAND_COPY.en.eyebrow);
    // VI-prefixed internal links + CTA ids.
    expect(out).toContain('href="/vi/solutions/accelerator"');
    expect(out).toContain('href="/vi/methodology"');
    expect(out).toContain('data-cta-id="vi_pilot_hero_offer"');
    expect(out).toContain('data-cta-id="vi_pilot_page_buy_cohort_pilot_25"');
    expect(out).not.toMatch(/\{[a-zA-Z0-9]+\}/);
    expect(out).not.toMatch(/PhD/);
    expect(out).toContain("support@blockid.au");
  });
});
