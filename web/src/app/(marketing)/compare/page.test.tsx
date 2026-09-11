// Colocated test for /compare, /compare/{chatgpt,valuers} and /vi/compare
// (T0274 part 2). The marketing shell mounts NavV2 → useRouter(), which
// throws outside an app-router context, so it is mocked to a pass-through.
// Pages are rendered through renderToReadableStream because the JSON-LD
// components are async server components (they read the CSP nonce).

import { describe, expect, it, vi } from "vitest";
import { renderToReadableStream } from "react-dom/server";

vi.mock("@/components/marketing/marketing-shell", () => ({
  MarketingShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/site/page-view-tracker", () => ({
  PageViewTracker: ({ event, params }: { event: string; params: unknown }) => (
    <span data-track={event} data-params={JSON.stringify(params)} />
  ),
}));

import { extractJsonLd, validateJsonLd } from "@/lib/seo/structured-data";
import en from "@/lib/i18n/messages/en.json";
import vi_ from "@/lib/i18n/messages/vi.json";
import type { Messages } from "@/lib/i18n/t";
import { SOLUTION_PRICE_TOKENS } from "../solutions/solutions-pricing";
import { buildAdvisorProps, buildInvestorProps, buildAcceleratorProps } from "../solutions/evaluator-page-props";
import {
  buildCompareProps,
  COMPARE_CTA_HREF,
  COMPARE_PROOF_HREFS,
  COMPARE_ROW_KEYS,
  comparePath,
} from "./compare-content";
import CompareAllPage, { generateMetadata as allMetadata } from "./page";
import CompareAliasPage, {
  generateMetadata as aliasMetadata,
  generateStaticParams,
  dynamicParams,
} from "./[slug]/page";
import ViComparePage, { generateMetadata as viMetadata } from "../../vi/compare/page";

const EN = en as unknown as Messages;
const VI = vi_ as unknown as Messages;

const H1 = "BlockID vs ChatGPT vs a valuer — how to evaluate an Australian startup";
const CHATGPT_PARAGRAPH =
  "ChatGPT gives you an outside-in opinion on whatever you paste, and a different one tomorrow. BlockID runs an inside-out review from the startup's own evidence — the same 8-dimension, 13-criteria rubric for every company, a full C-suite of specialist agents with Australian law and market context, an auditor that flags unsupported claims, and a score that updates every week as the company changes. You don't write forty prompts and stitch the answers together; you add the startup and read the report. Then you watch it move.";
const DATA_PRINCIPLE =
  "Your data belongs to your startup. We store it so every report builds on your own evidence and the AI reasons on your case. Founder-consented access tiers control who sees what.";

/** React escapes `'` as `&#x27;` and `&` as `&amp;` in text and attributes. */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/'/g, "&#x27;");
const attr = (href: string) => `href="${href.replace(/&/g, "&amp;")}"`;

async function html(el: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

describe("/compare — props", () => {
  const props = buildCompareProps(EN, "all", "en");

  it("carries the H1 verbatim and the nine table rows in the brief's order", () => {
    expect(props.headline).toBe(H1);
    expect(props.table.rows.map((r) => r.key)).toEqual([...COMPARE_ROW_KEYS]);
    expect(props.table.rows).toHaveLength(9);
    const labels = props.table.rows.map((r) => r.label);
    expect(labels).toEqual([
      "Rubric consistency",
      "Who reviews",
      "Evidence source",
      "Updates",
      "Australian context",
      "Confidentiality",
      "Audit trail",
      "Time",
      "Price",
    ]);
  });

  it("uses the approved ChatGPT paragraph verbatim as the pull-quote and the first FAQ", () => {
    expect(props.pullquote.q).toBe("Why not just ask ChatGPT?");
    expect(props.pullquote.a).toBe(CHATGPT_PARAGRAPH);
    expect(props.faqs[0]!.a).toBe(CHATGPT_PARAGRAPH);
    expect(props.faqs.length).toBeGreaterThanOrEqual(3);
    expect(props.faqs.length).toBeLessThanOrEqual(4);
  });

  it("states the data principle verbatim in the confidentiality row and the evidence card", () => {
    const row = props.table.rows.find((r) => r.key === "confidentiality")!;
    expect(row.blockid).toBe(DATA_PRINCIPLE);
    expect(props.diff.cards[2]!.body).toContain(DATA_PRINCIPLE);
  });

  it("prices come from the catalogue: A$3 per report, Scout / Firm / Program, valuer A$2,985–3,990 + GST", () => {
    const price = props.table.rows.find((r) => r.key === "price")!;
    expect(price.blockid).toContain(SOLUTION_PRICE_TOKENS.reportPrice);
    expect(price.blockid).toContain(SOLUTION_PRICE_TOKENS.scoutPrice);
    expect(price.chatgpt).toContain("US$20–75 per seat");
    expect(price.valuer).toBe("A$2,985–3,990 + GST per report.");
    expect(props.cta.report).toBe(`Run a Trust BizReport — ${SOLUTION_PRICE_TOKENS.reportPrice}`);
    expect(props.cta.trial).toBe("Start evaluating — 7 days free");
    expect(props.cta.plans).toBe("See evaluator plans");
    expect(props.cta.note).toContain(SOLUTION_PRICE_TOKENS.firmPrice);
    expect(props.cta.note).toContain(SOLUTION_PRICE_TOKENS.programPrice);
    expect(props.cta.note).toMatch(/7 days, card required/);
  });

  it("links the six differentiators to their proof surfaces, in the plan's order", () => {
    expect(props.diff.cards.map((c) => c.href)).toEqual([...COMPARE_PROOF_HREFS]);
    expect(COMPARE_PROOF_HREFS).toEqual([
      "/how-it-works",
      "/team",
      "/legal/privacy",
      "/funding",
      "/tbr/demo",
      "/guide",
    ]);
    expect(props.diff.cards).toHaveLength(6);
  });

  it("cites the Appendix C critiques by name and year, as plain text", () => {
    const text = props.sources.items.join("\n");
    expect(text).toMatch(/developmentcorporate\.com \(2026\)/);
    expect(text).toMatch(/MicroVentures/);
    expect(text).toMatch(/VC Lab \(July 2026\)/);
    expect(text).toMatch(/arXiv 2509\.14448/);
    expect(text).toMatch(/arXiv 2605\.13110/);
    expect(props.sources.prices).toMatch(/professionalbusinessvaluers\.com\.au/);
    expect(props.sources.prices).toMatch(/abva\.com\.au/);
    expect(props.sources.prices).toMatch(/openai\.com/);
    expect(props.sources.intro).toMatch(/September 2026/);
    expect(props.sources.prices).not.toMatch(/https?:\/\//);
  });

  it("has a fairness section that credits ChatGPT with building, drafting and brainstorming", () => {
    expect(props.fair.title).toBe("What ChatGPT is great for");
    expect(props.fair.items.map((i) => i.title)).toEqual([
      "Building the product",
      "Drafting",
      "Brainstorming",
    ]);
  });

  it("the CTA hrefs are the brief's three targets", () => {
    expect(COMPARE_CTA_HREF.report).toBe("/analyze");
    expect(COMPARE_CTA_HREF.trial).toBe("/signup?segment=evaluator&plan=investor_angel");
    expect(COMPARE_CTA_HREF.plans).toBe("/pricing?segment=evaluator");
  });
});

describe("/compare — approved wording rules (EN and VI)", () => {
  const all = (["all", "chatgpt", "valuers"] as const)
    .flatMap((v) => [buildCompareProps(EN, v, "en"), buildCompareProps(VI, v, "vi")])
    .flatMap((p) => [
      p.headline,
      p.lede,
      ...Object.values(p.cta),
      p.table.title,
      p.table.caption,
      ...p.table.rows.flatMap((r) => [r.label, r.blockid, r.chatgpt, r.valuer]),
      p.pullquote.a,
      p.fair.intro,
      ...p.fair.items.flatMap((i) => [i.title, i.body]),
      p.fair.outro,
      ...p.diff.cards.flatMap((c) => [c.title, c.body, c.linkLabel]),
      ...p.faqs.flatMap((f) => [f.q, f.a]),
      ...p.sources.items,
      p.sources.prices,
    ])
    .join("\n");

  it("never writes 'PhD'; the credential sentence is doctoral research (DBA)", () => {
    expect(all).not.toMatch(/PhD/);
    expect(all).toContain("grounded in the founder's doctoral research (DBA) on startup valuation");
  });

  it("never names the retired A$5.50 report and leaves no unresolved {token}", () => {
    expect(all).not.toContain("5.50");
    expect(all).not.toMatch(/\{[a-zA-Z]+\}/);
  });

  it("says nothing about model training either way", () => {
    expect(all).not.toMatch(/\btrain(ing|ed|s)?\b/i);
  });

  it("uses the truthful counts", () => {
    expect(all).toMatch(/11 C-Level agents/);
    expect(all).toMatch(/8 dimensions/);
    expect(all).toMatch(/13 criteria/);
    expect(all).toMatch(/12 growth phases/);
  });
});

describe("/compare — rendered pages", () => {
  it("EN page renders the H1, all nine rows, the three CTAs, the pull-quote and the compact disclaimer", async () => {
    const out = await html(await CompareAllPage());
    expect(out).toContain(esc(H1));
    for (const key of COMPARE_ROW_KEYS) expect(out).toContain(`data-row="${key}"`);
    expect(out).toContain(attr(COMPARE_CTA_HREF.report));
    expect(out).toContain(attr(COMPARE_CTA_HREF.trial));
    expect(out).toContain(attr(COMPARE_CTA_HREF.plans));
    expect(out).toContain(esc(CHATGPT_PARAGRAPH));
    expect(out).toContain(esc(DATA_PRINCIPLE));
    expect(out).toContain('data-surface="evaluator_report"');
    expect(out).toContain('data-compare-variant="all"');
    expect(out).not.toMatch(/PhD/);
    expect(out).not.toContain("5.50");
    expect(out).not.toMatch(/\{[a-zA-Z]+\}/);
    for (const href of COMPARE_PROOF_HREFS) expect(out).toContain(attr(href));
  });

  it("EN page emits FAQPage and BreadcrumbList JSON-LD and fires compare_viewed { variant: all }", async () => {
    const out = await html(await CompareAllPage());
    expect(out).toContain('"@type":"FAQPage"');
    expect(out).toContain('"@type":"BreadcrumbList"');
    expect(out).toContain('"item":"https://blockid.au/compare"');
    expect(out).toContain('data-track="compare_viewed"');
    expect(out).toContain('data-params="{&quot;variant&quot;:&quot;all&quot;}"');
  });

  it("alias routes pre-render chatgpt + valuers only, never a fallback slug", async () => {
    expect(generateStaticParams()).toEqual([{ slug: "chatgpt" }, { slug: "valuers" }]);
    expect(dynamicParams).toBe(false);
    const chatgpt = await html(await CompareAliasPage({ params: Promise.resolve({ slug: "chatgpt" }) }));
    expect(chatgpt).toContain('data-compare-variant="chatgpt"');
    expect(chatgpt).toContain(esc(H1));
    const valuers = await html(await CompareAliasPage({ params: Promise.resolve({ slug: "valuers" }) }));
    expect(valuers).toContain('data-compare-variant="valuers"');
    expect(valuers).toContain('"item":"https://blockid.au/compare/valuers"');
  });

  it("VI mirror renders the Vietnamese H1 with the same CTA hrefs and the VI data principle", async () => {
    const out = await html(await ViComparePage());
    expect(out).toContain('lang="vi"');
    expect(out).toContain(esc(VI["compare.h1"]!));
    expect(out).toContain(esc(VI["solutions.principle.data"]!));
    expect(out).toContain(attr(COMPARE_CTA_HREF.trial));
  });

  it("metadata: /compare canonical with VI alternate; alias canonicals point at themselves", async () => {
    const all = await allMetadata();
    expect(all.alternates?.canonical).toBe("https://blockid.au/compare");
    expect(all.alternates?.languages?.vi).toBe("https://blockid.au/vi/compare");
    expect(String(all.title)).toContain("BlockID vs ChatGPT vs a valuer");
    const chatgpt = await aliasMetadata({ params: Promise.resolve({ slug: "chatgpt" }) });
    expect(chatgpt.alternates?.canonical).toBe("https://blockid.au/compare/chatgpt");
    expect(String(chatgpt.description)).not.toMatch(/PhD/);
    const vi = await viMetadata();
    expect(vi.alternates?.canonical).toBe("https://blockid.au/vi/compare");
    expect(comparePath("valuers")).toBe("/compare/valuers");
  });
});

describe("/solutions/* evaluator pages link through to the comparison", () => {
  it.each([
    ["investor", buildInvestorProps],
    ["advisor", buildAdvisorProps],
    ["accelerator", buildAcceleratorProps],
  ] as const)("%s FAQ's ChatGPT answer carries the 'Why not ChatGPT?' link", (_persona, build) => {
    for (const [m, lang] of [
      [EN, "en"],
      [VI, "vi"],
    ] as const) {
      const props = build(m, lang);
      const faq = props.faqs[props.faqs.length - 1]!;
      expect(faq.q).toBe(m["solutions.faq.chatgpt.q"]);
      expect(faq.href).toBe("/compare/chatgpt");
      expect(faq.linkLabel).toBe(m["compare.faq.link"]);
    }
  });
});

describe("/compare — SEO (S8-A)", () => {
  it("titles are ≤ 60 with the root brand template (no doubled suffix), descriptions 140–160 once prices fill, OG image on all three", async () => {
    const all = await allMetadata();
    const chatgpt = await aliasMetadata({ params: Promise.resolve({ slug: "chatgpt" }) });
    const valuers = await aliasMetadata({ params: Promise.resolve({ slug: "valuers" }) });
    for (const [name, md] of [["all", all], ["chatgpt", chatgpt], ["valuers", valuers]] as const) {
      expect(String(md.title), name).not.toContain("BlockID.au");
      expect(`${String(md.title)} | BlockID.au`.length, name).toBeLessThanOrEqual(60);
      const desc = String(md.description);
      expect(desc, name).not.toMatch(/\{[a-zA-Z]+\}/);
      expect(desc.length, name).toBeGreaterThanOrEqual(140);
      expect(desc.length, name).toBeLessThanOrEqual(160);
      expect((md.openGraph as { images?: unknown[] }).images, name).toHaveLength(1);
      expect(md.robots, name).toEqual({ index: true, follow: true });
    }
    expect(all.alternates?.languages).toEqual({
      en: "https://blockid.au/compare",
      vi: "https://blockid.au/vi/compare",
      "x-default": "https://blockid.au/compare",
    });
    // English-only aliases carry no hreflang set (nothing to pair with).
    expect(chatgpt.alternates?.languages).toBeUndefined();
    expect(chatgpt.alternates?.canonical).toBe("https://blockid.au/compare/chatgpt");
    const vi = await viMetadata();
    expect(`${String(vi.title)} | BlockID.au`.length).toBeLessThanOrEqual(60);
    expect((vi.openGraph as { locale?: string }).locale).toBe("vi_VN");
  });

  it("emits exactly one FAQPage (the visible FAQ) and one BreadcrumbList, both valid; one H1", async () => {
    const out = await html(await CompareAllPage());
    const blocks = extractJsonLd(out);
    expect(blocks.filter((b) => b["@type"] === "FAQPage")).toHaveLength(1);
    expect(blocks.filter((b) => b["@type"] === "BreadcrumbList")).toHaveLength(1);
    for (const b of blocks) expect(validateJsonLd(b), String(b["@type"])).toEqual({ ok: true, errors: [] });
    expect(out.match(/<h1[\s>]/g)).toHaveLength(1);
  });
});
