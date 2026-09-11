// Colocated test for /solutions/advisor (T0274). The marketing shell mounts
// NavV2 → LocaleSwitcher → useRouter(), which throws outside an app-router
// context, so the shell is mocked to a pass-through and the persona body is
// rendered through renderToReadableStream so the async JSON-LD components
// (BreadcrumbList + FAQPage, S8-A) resolve (this workspace does not install
// @testing-library/react).

import { describe, expect, it, vi } from "vitest";
import { renderToReadableStream } from "react-dom/server";
import type { ReactElement } from "react";
import { extractJsonLd, validateJsonLd } from "@/lib/seo/structured-data";

vi.mock("@/components/marketing/marketing-shell", () => ({
  MarketingShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import en from "@/lib/i18n/messages/en.json";
import vi_ from "@/lib/i18n/messages/vi.json";
import type { Messages } from "@/lib/i18n/t";
import { buildAdvisorProps } from "../evaluator-page-props";
import { SOLUTION_PRICE_TOKENS } from "../solutions-pricing";
import SolutionsAdvisorPage, { generateMetadata } from "./page";
import ViSolutionsAdvisorPage from "../../../vi/solutions/advisor/page";

const EN = en as unknown as Messages;
const VI = vi_ as unknown as Messages;

async function render(el: ReactElement): Promise<string> {
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

const HEADLINE_EN =
  "A C-suite review of every client, in AUD, with ESIC and R&D Tax checks — white-labelled, A$3 a report.";
const HEADLINE_VI =
  "Một bản đánh giá cấp C-suite cho mỗi khách hàng, tính bằng AUD, kèm kiểm tra ESIC và R&D Tax — gắn thương hiệu của bạn, A$3 mỗi báo cáo.";
const SIGNUP = "/signup?segment=evaluator&plan=investor_advisor";
const PRICING = "/pricing?segment=evaluator";

/** `&` is entity-encoded inside an href attribute. */
const attr = (href: string) => `href="${href.replace(/&/g, "&amp;")}"`;

describe("/solutions/advisor — props", () => {
  const props = buildAdvisorProps(EN, "en");

  it("carries the approved advisor line as the headline, verbatim", () => {
    expect(props.headline).toBe(HEADLINE_EN);
    expect(buildAdvisorProps(VI, "vi").headline).toBe(HEADLINE_VI);
  });

  it("primary CTA is the trial line and lands on the evaluator signup with Firm pre-selected", () => {
    expect(props.primaryCtaLabel).toBe("Start evaluating — 7 days free, cancel anytime");
    expect(props.primaryCtaHref).toBe(SIGNUP);
  });

  it("secondary CTA goes to the evaluator pricing view", () => {
    expect(props.secondaryCtaHref).toBe(PRICING);
  });

  it("renders the six differentiators as six benefit cards, in the plan's order", () => {
    expect(props.benefits).toHaveLength(6);
    const titles = props.benefits.map((b) => b.title).join(" | ");
    expect(titles).toMatch(/One rubric/);
    expect(titles).toMatch(/C-suite/);
    expect(titles).toMatch(/own evidence/);
    expect(titles).toMatch(/Australia/);
    expect(titles).toMatch(/\{reportPrice\}, not A\$3,000/);
    expect(titles).toMatch(/White-labelled/);
  });

  it("ends the FAQ with the approved 'Why not just ask ChatGPT?' paragraph", () => {
    const last = props.faqs[props.faqs.length - 1]!;
    expect(last.q).toBe("Why not just ask ChatGPT?");
    expect(last.a).toMatch(/^ChatGPT gives you an outside-in opinion/);
    expect(last.a).toMatch(/Then you watch it move\.$/);
  });

  it("states the Firm plan facts through catalogue tokens, never literals", () => {
    expect(props.outcomeLine).toContain("{firmPrice}");
    expect(props.outcomeLine).toContain("{firmReports}");
    expect(props.outcomeLine).toContain("{firmStartups}");
    expect(props.outcomeLine).toContain("{firmSeats}");
    expect(props.outcomeLine).toMatch(/white-label PDF/i);
    expect(props.outcomeLine).toMatch(/client roster/i);
    expect(props.outcomeLine).toMatch(/7-day free trial, card required/);
  });
});

describe("/solutions/advisor — approved wording rules", () => {
  const all = [buildAdvisorProps(EN, "en"), buildAdvisorProps(VI, "vi")]
    .flatMap((p) => [
      p.headline,
      p.personaLine,
      p.emotionalLine,
      p.outcomeLine,
      ...p.benefits.flatMap((b) => [b.title, b.body]),
      ...p.faqs.flatMap((f) => [f.q, f.a]),
      String(p.disclaimer),
    ])
    .join("\n");

  it("never writes 'PhD' — the approved credential sentence is doctoral research (DBA)", () => {
    expect(all).not.toMatch(/PhD/);
    expect(all).toContain(
      "grounded in the founder's doctoral research (DBA) on startup valuation",
    );
  });

  it("carries the founder-approved data principle verbatim", () => {
    expect(all).toContain(
      "Your data belongs to your startup. We store it so every report builds on your own evidence and the AI reasons on your case. Founder-consented access tiers control who sees what.",
    );
  });

  it("says nothing about model training either way", () => {
    expect(all).not.toMatch(/\btrain(ing|ed|s)?\b/i);
  });

  it("uses the truthful counts — 11 C-Level agents, 8 dimensions, 13 criteria, 12 growth phases", () => {
    expect(all).toMatch(/11 C-Level agents/);
    expect(all).toMatch(/8 dimensions/);
    expect(all).toMatch(/13 criteria/);
    expect(all).toMatch(/12 growth phases/);
  });
});

describe("/solutions/advisor — rendered page", () => {
  it("EN page renders the headline and both CTA hrefs", async () => {
    const html = await render(await SolutionsAdvisorPage());
    expect(html).toContain('data-persona="advisor"');
    expect(html).toContain('lang="en"');
    // React escapes the apostrophe-free headline as-is except for `&`.
    expect(html).toContain(HEADLINE_EN.replace(/&/g, "&amp;"));
    expect(html).toContain(attr(SIGNUP));
    expect(html).toContain(attr(PRICING));
  });

  it("EN page substitutes every price token from the catalogue — no `{token}` reaches a visitor", async () => {
    const html = await render(await SolutionsAdvisorPage());
    expect(html).not.toMatch(/\{[a-zA-Z]+\}/);
    expect(html).toContain(SOLUTION_PRICE_TOKENS.firmPrice);
    expect(html).toContain(SOLUTION_PRICE_TOKENS.reportPrice);
  });

  it("emits one valid FAQPage (matching the visible FAQ, prices filled) and a BreadcrumbList (S8-A)", async () => {
    const html = await render(await SolutionsAdvisorPage());
    const blocks = extractJsonLd(html);
    const faqs = blocks.filter((b) => b["@type"] === "FAQPage");
    expect(faqs).toHaveLength(1);
    expect(validateJsonLd(faqs[0])).toEqual({ ok: true, errors: [] });
    expect(JSON.stringify(faqs[0])).not.toMatch(/\{[a-zA-Z]+\}/);
    const crumbs = blocks.filter((b) => b["@type"] === "BreadcrumbList");
    expect(crumbs).toHaveLength(1);
    expect(validateJsonLd(crumbs[0]).ok).toBe(true);
    expect(JSON.stringify(crumbs[0])).toContain("https://blockid.au/solutions/advisor");
  });

  it("VI mirror renders the Vietnamese headline with the same CTA hrefs", async () => {
    const html = await render(await ViSolutionsAdvisorPage());
    expect(html).toContain('lang="vi"');
    expect(html).toContain(HEADLINE_VI.replace(/&/g, "&amp;"));
    expect(html).toContain(attr(SIGNUP));
    expect(html).toContain(attr(PRICING));
  });

  it("metadata is canonical at /solutions/advisor with a VI alternate, ≤ 60 title, 140–160 description, OG image (S8-A)", async () => {
    const meta = await generateMetadata();
    expect(meta.alternates?.canonical).toBe("https://blockid.au/solutions/advisor");
    expect(meta.alternates?.languages?.vi).toBe("https://blockid.au/vi/solutions/advisor");
    expect(String(meta.title)).not.toMatch(/PhD/);
    expect(String(meta.title)).not.toContain("BlockID.au");
    expect(`${String(meta.title)} | BlockID.au`.length).toBeLessThanOrEqual(60);
    expect(String(meta.description).length).toBeGreaterThanOrEqual(140);
    expect(String(meta.description).length).toBeLessThanOrEqual(160);
    expect((meta.openGraph as { images?: unknown[] }).images).toHaveLength(1);
    expect((meta.twitter as { images?: unknown[] }).images).toEqual(["/opengraph-image"]);
  });
});
