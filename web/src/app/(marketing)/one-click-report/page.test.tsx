// Colocated test for /one-click-report + /success (G17 P2-A): one h1, the
// form mounted twice, the section ids, the FAQPage JSON-LD, the cancel
// banner on `?canceled=true`, no emoji icons, pageMetadata (success is
// noindex). The marketing shell is mocked; the client form renders to
// static HTML. Pricing v5 P5 (D26): both payg_enabled states are pinned —
// OFF is today's A$3 page, ON is the guest Snapshot / Full entry.

import { describe, expect, it, vi } from "vitest";
import { renderToReadableStream, renderToStaticMarkup } from "react-dom/server";

vi.mock("@/components/marketing/marketing-shell", () => ({
  MarketingShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/analytics/page-tracker", () => ({ PageTracker: () => null }));
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
import { PAYG_OFF_VIEW, PAYG_ON_VIEW } from "@/lib/pricing/payg-copy";
import { ONE_CLICK_FAQ, ONE_CLICK_STEPS, oneClickSteps } from "./one-click-report-content";
import { OneClickForm, guestOrderBody, oneClickSubmitLabel } from "./one-click-form";
import OneClickReportPage, { generateMetadata } from "./page";
import OneClickSuccessPage, { metadata as successMetadata } from "./success/page";

async function html(el: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

const decode = (s: string) => s.replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/<!-- -->/g, "");

async function withPayg<T>(on: boolean, fn: () => Promise<T>): Promise<T> {
  paygState.enabled = on;
  try {
    return await fn();
  } finally {
    paygState.enabled = false;
  }
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

  it("pageMetadata on both routes; success is noindex", async () => {
    const metadata = await generateMetadata();
    expect(metadata.alternates?.canonical).toBe("https://blockid.au/one-click-report");
    expect(renderedTitle(metadata.title).length).toBeLessThanOrEqual(65);
    expect(String(metadata.description).length).toBeLessThanOrEqual(165);
    expect(successMetadata.robots).toEqual({ index: false, follow: false });
  });

  it("/success renders one h1 and the signup CTA", async () => {
    const out = await html(await OneClickSuccessPage());
    expect((out.match(/<h1\b/g) ?? []).length).toBe(1);
    expect(out).toContain('href="/signup"');
    expect(out).toContain("1 to 3 minutes");
  });
});

describe("/one-click-report — Pricing v5 P5 payg_enabled", () => {
  it("flag OFF: today's A$3 page — metadata, hero, steps, refund line, button, request body", async () => {
    const meta = await withPayg(false, () => generateMetadata());
    expect(meta.title).toBe("Trusted Business Report — A$3, no signup");
    expect(String(meta.description)).toBe(
      "How investors see your startup: upload a pitch or paste a URL and get the full Trusted Business Report — SVI score and AUD valuation range — by e-mail in minutes.",
    );
    const out = decode(await withPayg(false, async () => html(await OneClickReportPage({ searchParams: Promise.resolve({}) }))));
    expect(out).toContain("No signup. A$3 inc. GST");
    expect(out).toContain("Pay A$3");
    expect(out).toContain("Pay A$3 & get my report");
    expect(out).toContain("and we'll refund the A$3 in full — no questions.");
    expect(out).toContain("A$3 GST-inclusive, with an ATO tax invoice. Emailed in ~2 minutes. No signup.");
    expect(out).not.toContain('data-testid="one-click-tier"');
    expect(out).not.toContain("Snapshot");
    expect(ONE_CLICK_FAQ.refundText).toBe(
      "If your report doesn't arrive or the analysis clearly failed, email admin@blockid.au and we'll refund the A$3 in full — no questions. It's a low-stakes trial for both of us.",
    );
    expect(oneClickSteps(PAYG_OFF_VIEW)).toEqual(ONE_CLICK_STEPS);
    // The request body is exactly the pre-v5 shape — no `tier` key.
    expect(JSON.stringify(guestOrderBody({ email: "a@b.au", inputType: "website_url", inputValue: "https://x.au", tier: null }))).toBe(
      JSON.stringify({ email: "a@b.au", inputType: "website_url", inputValue: "https://x.au", inputFilename: undefined }),
    );
    expect(oneClickSubmitLabel(PAYG_OFF_VIEW, "snapshot")).toBeNull();
  });

  it("flag ON: Snapshot / Full choice, review-and-pay label, Verified via sign-in, Terms v2.2 refund line, v5 metadata", async () => {
    const meta = await withPayg(true, () => generateMetadata());
    expect(meta.title).toBe("Trusted Business Report — from A$19, no signup");
    expect(renderedTitle(meta.title).length).toBeLessThanOrEqual(65);
    expect(String(meta.description).length).toBeLessThanOrEqual(165);
    const raw = await withPayg(true, async () => html(await OneClickReportPage({ searchParams: Promise.resolve({}) })));
    const out = decode(raw);
    expect((raw.match(/data-testid="one-click-tier"/g) ?? []).length).toBe(2);
    expect(out).toContain("Snapshot · A$19");
    expect(out).toContain("Full · A$49");
    expect(out).toContain("Review and pay — Snapshot A$19");
    expect(raw).toContain(`href="/auth/login?next=${encodeURIComponent("/analyze?tier=paid&payg=verified")}"`);
    expect(out).toContain("and we'll refund it in full.");
    expect(out).not.toMatch(/A\$3(?![\d,.])/);
    const faq = extractJsonLd(raw).find((b) => b["@type"] === "FAQPage") as { mainEntity: { acceptedAnswer: { text: string } }[] };
    expect(faq.mainEntity.map((q) => q.acceptedAnswer.text)).toContain(
      "If your report doesn't arrive or the analysis clearly failed, email admin@blockid.au and we'll refund it in full.",
    );
    for (const s of oneClickSteps(PAYG_ON_VIEW)) expect(out).toContain(s.title);
  });

  it("flag ON: the request body only ADDS the chosen tier; the label follows the choice", () => {
    expect(guestOrderBody({ email: "a@b.au", inputType: "pitch_file", inputValue: "p/x.pdf", inputFilename: "x.pdf", tier: "full" })).toEqual({
      email: "a@b.au",
      inputType: "pitch_file",
      inputValue: "p/x.pdf",
      inputFilename: "x.pdf",
      tier: "full",
    });
    expect(oneClickSubmitLabel(PAYG_ON_VIEW, "full")).toBe("Review and pay — Full A$49");
    const form = renderToStaticMarkup(<OneClickForm payg={PAYG_ON_VIEW} verifiedHref="/auth/login?next=x" />);
    expect(form).toContain('value="snapshot"');
    expect(form).toContain('value="full"');
    expect(form).not.toContain('value="verified"');
  });

  it("/success: flag ON tells the guest how to keep the report; OFF is unchanged", async () => {
    const off = await withPayg(false, async () => html(await OneClickSuccessPage()));
    expect(off).toContain("Save your report, track your SVI over time, and unlock deeper analysis.");
    const on = await withPayg(true, async () => html(await OneClickSuccessPage()));
    expect(on).toContain("Sign up with the email you paid with to keep this report in your account");
  });
});
