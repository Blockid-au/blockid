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
// Pricing v5 P5: the page reads platform_config.payg_enabled through
// getPaygView(); the suite drives the flag explicitly (default OFF).
const paygState = vi.hoisted(() => ({ enabled: false }));
vi.mock("@/lib/pricing/payg-view.server", async () => {
  const copy = await vi.importActual<typeof import("@/lib/pricing/payg-copy")>("@/lib/pricing/payg-copy");
  return {
    getPaygView: async () => (paygState.enabled ? copy.PAYG_ON_VIEW : copy.PAYG_OFF_VIEW),
    isPaygEnabled: async () => paygState.enabled,
  };
});

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

// ─── Pricing v5 P5 — platform_config.payg_enabled ──────────────────────────

/** The pre-v5 FAQ sentences, verbatim: flag OFF must reproduce them exactly. */
const PRE_V5 = {
  single: "Without a subscription, every full Trusted Business Report is A$3 per startup.",
  refund:
    "7-day money-back guarantee on your first monthly subscription payment, no questions asked — email support and we refund within 3 business days. Annual plans are refunded pro-rata if you cancel within 14 days. One-off A$3 reports and credit packs are non-refundable once delivered, except where the Australian Consumer Law requires a refund. Your Australian Consumer Law guarantees are never excluded. Full policy: /legal/terms#refunds.",
  moneyFinder:
    "A ranked scan of Australian grants, programs and events your startup qualifies for. Free = the preview (how many you match, top 3 named) and the open-grants directory · A$3 = the full Money Finder report per startup — ranked matches, eligibility checklist, 12-month timeline, PDF · Starter A$29 = Founder Radar deadline alerts and monthly re-match, with full reports included · Growth A$69 = the same, with 45 credits a month for application drafts. A grants consultant charges A$500–2,000 for this scan.",
};

function faqAnswers(out: string): string[] {
  const faq = extractJsonLd(out).find((b) => b["@type"] === "FAQPage") as
    | { mainEntity: { acceptedAnswer: { text: string } }[] }
    | undefined;
  return (faq?.mainEntity ?? []).map((q) => q.acceptedAnswer.text);
}

const decode = (s: string) => s.replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"');

describe("/pricing — Pricing v5 P5 payg_enabled switch", () => {
  it("flag OFF: no PAYG block, the FAQ JSON-LD and visible FAQ keep the pre-v5 sentences character for character", async () => {
    paygState.enabled = false;
    const out = await html(await PricingPage());
    expect(out).not.toContain('data-testid="payg-block"');
    const answers = faqAnswers(out);
    expect(answers.some((a) => a.endsWith(PRE_V5.single))).toBe(true);
    expect(answers).toContain(PRE_V5.refund);
    expect(answers).toContain(PRE_V5.moneyFinder);
    const visible = decode(out);
    expect(visible).toContain(PRE_V5.refund);
    expect(visible).toContain(PRE_V5.moneyFinder);
    expect(visible).toContain("Without a subscription, every full Trusted Business Report is A$3 per startup. Need more than Program");
    expect(visible).toMatch(/free\s+preview, (<!-- -->)?A\$3(<!-- -->)? for a full report/);
    expect(visible).not.toContain("Snapshot");
  });

  it("flag ON: the Pay as you go block renders under the switch — three cards, view prices, one-off inc. GST, Scout break-even, review-before-pay CTAs", async () => {
    paygState.enabled = true;
    try {
      const out = await html(await PricingPage());
      expect(out).toContain('data-testid="payg-block"');
      // Directly under the plan switch, inside #pricing-matrix.
      const sw = out.indexOf('data-testid="pricing-segment-switch"');
      const block = out.indexOf('data-testid="payg-block"');
      const anchor = out.indexOf('data-testid="money-finder-anchor"');
      expect(sw).toBeGreaterThan(-1);
      expect(block).toBeGreaterThan(sw);
      expect(block).toBeLessThan(anchor);
      for (const [tier, price] of [["snapshot", "A$19"], ["full", "A$49"], ["verified", "A$149"]] as const) {
        const start = out.indexOf(`data-testid="payg-card-${tier}"`);
        expect(start, tier).toBeGreaterThan(-1);
        expect(out.slice(start, start + 4000)).toContain(price);
      }
      expect(out).toContain("one-off · inc. GST");
      expect(out).toContain("Scout pays for itself after two Full reports.");
      expect(out).toContain("Delivered within 2 business days");
      expect(out).toContain('data-testid="payg-verified-signin"');
      expect(out).toContain('href="/analyze?tier=paid&amp;payg=snapshot"');
      expect(out).toContain('href="/analyze?tier=paid&amp;payg=full"');
      expect(out).toContain(`href="/auth/login?next=${encodeURIComponent("/analyze?tier=paid&payg=verified")}"`);
      expect(out).not.toContain("checkout.stripe.com");
      expect(decode(out)).toMatch(/free\s+preview, (<!-- -->)?A\$19(<!-- -->)? for a full report/);
    } finally {
      paygState.enabled = false;
    }
  });

  it("flag ON: FAQ JSON-LD is valid and carries the v5 single-report, refund and Money Finder answers — no A$3 report price left", async () => {
    paygState.enabled = true;
    try {
      const out = await html(await PricingPage());
      const blocks = extractJsonLd(out);
      expect(blocks.filter((b) => b["@type"] === "PARSE_ERROR")).toEqual([]);
      const answers = faqAnswers(out);
      expect(answers.some((a) => a.endsWith("Without a subscription, buy a single report: Snapshot A$19, Full A$49 or Verified A$149 (all AUD, GST-inclusive)."))).toBe(true);
      expect(answers.some((a) => a.includes("One-off reports (Snapshot, Full, Verified, Money Finder) and credit packs are non-refundable once delivered"))).toBe(true);
      expect(answers.some((a) => a.includes("A$19 = the full Money Finder report per startup"))).toBe(true);
      for (const a of answers) expect(a).not.toMatch(/A\$3(?![\d,.])/);
      // The visible FAQ says the same thing as the schema.
      const visible = decode(out);
      for (const a of answers.filter((x) => /Snapshot|Money Finder report/.test(x))) expect(visible).toContain(a);
    } finally {
      paygState.enabled = false;
    }
  });
});
