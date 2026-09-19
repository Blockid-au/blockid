// Colocated guard for the Unicorn marketing template (G17 D5/D6,
// docs/design/unicorn-template.md). Each primitive is rendered to static
// markup and pinned on the contract Phase 2 rolls out against: landmarks,
// heading ids, the shared focus ring and ≥ 44 px targets, Lucide-only icons,
// the two button skins, and that no primitive carries a raw hex colour.

import { describe, expect, it } from "vitest";
import { renderToReadableStream, renderToStaticMarkup } from "react-dom/server";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Compass, FileText, Search } from "lucide-react";

import {
  CONTAINER,
  CTA_CLASS,
  CtaBand,
  CtaLink,
  CtaRow,
  EYEBROW,
  Faq,
  FeatureGrid,
  FOCUS_RING,
  headingId,
  PageHero,
  ProofBand,
  Prose,
  RHYTHM,
  Section,
  StatStrip,
} from "./index";

/** The opening `<a …>` tag whose href is `href` (attribute order is Next's, not ours). */
function anchorTag(html: string, href: string): string {
  const escaped = href.replace(/[/?]/g, (c) => "\\" + c);
  const m = html.match(new RegExp(`<a\\b[^>]*href="${escaped}"[^>]*>`));
  if (!m) throw new Error(`no <a href="${href}"> in markup`);
  return m[0];
}

async function streamHtml(el: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

describe("primitives — the shared contract", () => {
  it("container is max-w-6xl; rhythm is 48 / 64 / 96 px on desktop; the eyebrow uses the accent token", () => {
    expect(CONTAINER).toContain("max-w-6xl");
    expect(RHYTHM.sm).toContain("sm:py-12");
    expect(RHYTHM.md).toContain("sm:py-16");
    expect(RHYTHM.lg).toContain("sm:py-24");
    expect(EYEBROW).toContain("text-accent");
  });

  it("focus ring is the accent-600 2 px ring; every button skin is ≥ 44 px tall and carries it", () => {
    expect(FOCUS_RING).toContain("focus-visible:ring-2");
    expect(FOCUS_RING).toContain("focus-visible:ring-accent-600");
    for (const skin of ["primary", "secondary", "link"] as const) {
      expect(CTA_CLASS[skin], skin).toContain("min-h-11");
      expect(CTA_CLASS[skin], skin).toContain(FOCUS_RING);
      expect(CTA_CLASS[skin], skin).toContain("duration-(--dur-base)");
    }
    expect(CTA_CLASS.primary).toContain("bg-action");
    expect(CTA_CLASS.secondary).toContain("border-line");
  });

  it("headingId() is `<id>-heading`", () => {
    expect(headingId("worth")).toBe("worth-heading");
  });

  it("no primitive carries a raw hex colour or an emoji", () => {
    const dir = __dirname;
    for (const f of readdirSync(dir).filter((n) => /\.tsx?$/.test(n) && !n.endsWith(".test.tsx"))) {
      const src = readFileSync(join(dir, f), "utf8");
      expect(src, `${f} hex`).not.toMatch(/#[0-9a-f]{6}\b/i);
      expect(src, `${f} emoji`).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    }
  });
});

describe("<PageHero />", () => {
  const html = renderToStaticMarkup(
    <PageHero
      eyebrow="Startup Value Index"
      title="Score any Australian startup in 60 seconds."
      sub="One rubric for every deal."
      ctas={[
        { href: "/analyze", label: "Score a startup", ctaId: "hero_score" },
        { href: "/tbr/demo", label: "See a sample dossier" },
      ]}
      visual={<div data-testid="visual-slot" />}
      footnote="Founder? Get your own score free."
      titleProps={{ "data-hero-arm": "E1" }}
    />,
  );

  it("renders exactly one h1 (id page-hero-heading) inside a labelled section, with the arm attribute", () => {
    expect((html.match(/<h1\b/g) ?? []).length).toBe(1);
    expect(html).toMatch(/<section[^>]*aria-labelledby="page-hero-heading"/);
    expect(html).toMatch(/<h1[^>]*data-hero-arm="E1"[^>]*id="page-hero-heading"|<h1[^>]*id="page-hero-heading"[^>]*data-hero-arm="E1"/);
    expect(html).toContain("Score any Australian startup in 60 seconds.");
  });

  it("first CTA is primary → /analyze with its cta id, second is secondary → /tbr/demo; visual + footnote render", () => {
    expect(anchorTag(html, "/analyze")).toContain('data-cta-id="hero_score"');
    expect(anchorTag(html, "/analyze")).toContain("bg-action");
    expect(anchorTag(html, "/tbr/demo")).toContain("border-line");
    expect(html).toContain('data-testid="visual-slot"');
    expect(html).toContain("Founder? Get your own score free.");
  });
});

describe("<Section />", () => {
  it("id → `${id}-heading` on the h2 + aria-labelledby; tone sunken/dark; scroll-mt for deep links", () => {
    const html = renderToStaticMarkup(
      <Section id="worth" eyebrow="What is it worth" title="One range, not one number." lede="Lede." tone="sunken">
        <p>body</p>
      </Section>,
    );
    expect(html).toMatch(/<section[^>]*id="worth"[^>]*aria-labelledby="worth-heading"/);
    expect(html).toMatch(/<h2[^>]*id="worth-heading"/);
    expect(html).toMatch(/<section[^>]*class="[^"]*scroll-mt-20[^"]*bg-surface-sunken/);
    expect(html).toContain("What is it worth");
    expect(html).toContain("<p>body</p>");
    const dark = renderToStaticMarkup(<Section id="j" title="T" tone="dark" />);
    expect(dark).toMatch(/<section[^>]*data-theme="dark"/);
  });

  it("without a title it takes aria-label and renders no h2; actions render a CTA row", () => {
    const html = renderToStaticMarkup(
      <Section id="x" ariaLabel="Proof" actions={[{ href: "/product", label: "Go deeper", variant: "link" }]}>
        <span>k</span>
      </Section>,
    );
    expect(html).not.toContain("<h2");
    expect(html).toMatch(/<section[^>]*aria-label="Proof"/);
    // actions only render with a header; a bare section is body-only
    expect(html).toContain("<span>k</span>");
    const withHeader = renderToStaticMarkup(
      <Section id="y" title="T" actions={[{ href: "/product", label: "Go deeper", variant: "link" }]} />,
    );
    expect(withHeader).toMatch(/<a[^>]*href="\/product"/);
    expect(withHeader).toContain("Go deeper");
  });
});

describe("<FeatureGrid />", () => {
  const items = [
    { icon: Search, title: "Investors", body: "Screen faster.", href: "/solutions/investor", cta: "For investors" },
    { icon: Compass, title: "Accelerators", body: "Rank an intake.", href: "/solutions/accelerator" },
    { icon: FileText, title: "Advisors", body: "One rubric." },
  ] as const;

  it("renders a ul of cards; a card with href is ONE link wrapping the whole card; icons are svg + aria-hidden", () => {
    const html = renderToStaticMarkup(<FeatureGrid items={items} columns={3} ariaLabel="Who it's for" />);
    expect(html).toMatch(/<ul[^>]*aria-label="Who/);
    expect((html.match(/<li\b/g) ?? []).length).toBe(3);
    expect((html.match(/<a\b/g) ?? []).length).toBe(2);
    expect(anchorTag(html, "/solutions/investor")).toContain("focus-visible:ring-2");
    expect(html).toContain("For investors");
    expect((html.match(/<svg[^>]*aria-hidden="true"/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect((html.match(/<h3\b/g) ?? []).length).toBe(3);
  });

  it("an item with id anchors its li (deep links) with scroll margin", () => {
    const html = renderToStaticMarkup(<FeatureGrid items={[{ ...items[0]!, id: "one" }]} />);
    expect(html).toMatch(/<li[^>]*id="one"[^>]*class="[^"]*scroll-mt-24/);
  });

  it("numbered renders an ol with Step n labels", () => {
    const html = renderToStaticMarkup(<FeatureGrid items={items} numbered />);
    expect(html).toMatch(/<ol\b/);
    expect(html).toContain("Step 1");
    expect(html).toContain("Step 3");
  });
});

describe("<StatStrip />", () => {
  it("renders every value + label, tabular numerals, an optional caption, and links a tile with href", () => {
    const html = renderToStaticMarkup(
      <StatStrip
        stats={[
          { value: "182", label: "startups scored" },
          { value: "12,827", label: "register signals", hint: "ABR bulk extract", href: "/methodology" },
          { value: "0.76 / 0.94", label: "backtest ρ" },
          { value: "5", label: "evaluator organisations" },
        ]}
        caption="As at 2026-09-17."
      />,
    );
    expect(html).toContain('data-testid="stat-strip"');
    expect((html.match(/<li\b/g) ?? []).length).toBe(4);
    expect(html).toContain("12,827");
    expect(html).toContain("ABR bulk extract");
    expect(html).toContain("As at 2026-09-17.");
    expect(html).toMatch(/tabular-nums/);
    expect(anchorTag(html, "/methodology")).toContain("min-h-11");
  });
});

describe("<ProofBand />", () => {
  it("renders a labelled list of names with optional sub-lines and links", () => {
    const html = renderToStaticMarkup(
      <ProofBand
        eyebrow="Built in Sydney"
        items={[
          { label: "NVIDIA Inception", sub: "member" },
          { label: "Data hosted in Australia" },
          { label: "Methodology", href: "/methodology" },
        ]}
      />,
    );
    expect(html).toContain('data-testid="proof-band"');
    expect(html).toContain("Built in Sydney");
    expect((html.match(/<li\b/g) ?? []).length).toBe(3);
    expect(html).toContain(">member<");
    expect(html).toMatch(/<a[^>]*href="\/methodology"/);
  });
});

describe("<CtaBand />", () => {
  it("one h2, primary + secondary CTAs, footnote; dark tone self-scopes", () => {
    const html = renderToStaticMarkup(
      <CtaBand
        title="Score your first startup."
        sub="Free, no card."
        primary={{ href: "/analyze", label: "Score a startup", ctaId: "final_score" }}
        secondary={{ href: "/pricing", label: "See pricing" }}
        footnote="No card required."
        tone="dark"
      />,
    );
    expect((html.match(/<h2\b/g) ?? []).length).toBe(1);
    expect(html).toMatch(/<section[^>]*id="cta"[^>]*aria-labelledby="cta-heading"/);
    expect(html).toMatch(/<section[^>]*data-theme="dark"/);
    expect(anchorTag(html, "/analyze")).toContain('data-cta-id="final_score"');
    expect(anchorTag(html, "/pricing")).toContain("border-line");
    expect(html).toContain("No card required.");
  });
});

describe("<Prose /> + <Faq />", () => {
  it("Prose sets the tpl-prose class on a 42rem measure (wide = 56rem)", () => {
    expect(renderToStaticMarkup(<Prose><p>x</p></Prose>)).toMatch(/class="tpl-prose[^"]*max-w-2xl/);
    expect(renderToStaticMarkup(<Prose measure="wide"><p>x</p></Prose>)).toMatch(/max-w-4xl/);
    const css = readFileSync(join(__dirname, "../../../app/globals.css"), "utf8");
    expect(css).toContain(".tpl-prose h2");
    expect(css).toContain(".tpl-faq summary::-webkit-details-marker");
  });

  it("Faq renders native details/summary with ≥ 44 px summaries and no script; jsonLd emits one FAQPage block", async () => {
    const items = [
      { question: "Is it free?", answer: "Yes, for founders." },
      { question: "How long?", answer: <span>Sixty seconds.</span>, answerText: "Sixty seconds." },
    ];
    const plain = renderToStaticMarkup(<Faq items={items} />);
    expect((plain.match(/<details\b/g) ?? []).length).toBe(2);
    expect(plain).toMatch(/<summary[^>]*class="[^"]*min-h-11/);
    expect(plain).not.toContain("<script");
    const withLd = await streamHtml(<Faq items={items} jsonLd />);
    expect(withLd).toContain('type="application/ld+json"');
    expect(withLd).toContain('"@type":"FAQPage"');
    expect(withLd).toContain("Sixty seconds.");
  });
});

describe("<CtaLink /> / <CtaRow />", () => {
  it("link skin shows the arrow; a pair renders primary then secondary; a third CTA is dropped", () => {
    const link = renderToStaticMarkup(<CtaLink href="/product" label="Go deeper" variant="link" />);
    expect(link).toMatch(/<svg/);
    expect(link).toContain("text-action");
    const row = renderToStaticMarkup(
      <CtaRow ctas={[{ href: "/a", label: "A" }, { href: "/b", label: "B" }, { href: "/c", label: "C" }]} />,
    );
    expect((row.match(/<a\b/g) ?? []).length).toBe(2);
    expect(anchorTag(row, "/a")).toContain("bg-action");
    expect(anchorTag(row, "/b")).toContain("border-line");
  });
});
