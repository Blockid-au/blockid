// Colocated test for the homepage v6 (G17 D1–D3, 2026-09-19). Renders the
// real page (NavV2's auth hook stubbed, next/navigation stubbed) and pins
// the acceptance list: exactly one H1 with the E1 text, the search frame,
// no price strings, six blocks, the five nav labels, the three audience
// links, the Go-deeper anchors onto /product, the sample card links, the
// proof strip, and the one Footer with the marketing entity.

import { describe, expect, it, vi } from "vitest";
import { LEGAL_ENTITY, marketingLine } from "@/lib/site/legal-entity";
import { renderToReadableStream } from "react-dom/server";

vi.mock("@/hooks/useAuthUser", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/hooks/useAuthUser")>();
  return { ...mod, useAuthUser: () => null };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {}, refresh: () => {} }),
  usePathname: () => "/",
}));
vi.mock("@/components/auth/LogoutButton", () => ({
  LogoutButton: ({ children }: { children?: React.ReactNode }) => <button>{children}</button>,
}));

import { MENU } from "@/components/landing/nav-v2";
import { SAMPLE_CARD_LINKS } from "@/components/marketing/homepage/sample-result-card";
import { heroLine } from "@/lib/marketing/hero-variants";
import { renderedTitle } from "@/lib/seo/page-meta";
import { HOME_AUDIENCES, HOME_GO_DEEPER, HOME_STEPS } from "./home-content";
import HomePage, { metadata, revalidate } from "./page";

async function html(el: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

function textOf(h: string): string {
  return h
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

const out = await html(<HomePage />);
const text = textOf(out);

describe("homepage v6 — metadata", () => {
  it("title is the E1 line, ≤ 60 with the brand; description 140–160; canonical / with the VI twin; ISR 300", () => {
    expect(renderedTitle(metadata.title)).toBe("Score any Australian startup in 60 seconds | BlockID.au");
    expect(renderedTitle(metadata.title).length).toBeLessThanOrEqual(60);
    const d = String(metadata.description);
    expect(d.length).toBeGreaterThanOrEqual(140);
    expect(d.length).toBeLessThanOrEqual(160);
    expect(metadata.alternates?.canonical).toBe("https://blockid.au/");
    expect((metadata.alternates?.languages as Record<string, string>).vi).toBe("https://blockid.au/vi");
    expect(revalidate).toBe(300);
  });
});

describe("homepage v6 — acceptance (D1–D3)", () => {
  it("exactly one h1, and it is the E1 evaluator line", () => {
    const h1s = out.match(/<h1[^>]*>([\s\S]*?)<\/h1>/g) ?? [];
    expect(h1s).toHaveLength(1);
    expect(textOf(h1s[0]!).trim()).toBe("Score any Australian startup in 60 seconds.");
    expect(textOf(h1s[0]!).trim()).toBe(heroLine("E1").en);
  });

  it("the search box + ring are in the hero (data-testid=hero-search, smart-intake ids kept) and main has id=main-content", () => {
    expect(out).toContain('data-testid="hero-search"');
    expect(out).toContain('data-testid="smart-intake-text"');
    expect(out).toContain('data-testid="smart-intake-cta"');
    expect(out).toMatch(/class="asf-wrap/);
    expect(out).toMatch(/<main[^>]*id="main-content"/);
  });

  it("no A$ price strings, no tier ladder, no unlock preview, no pricing table on the home", () => {
    expect(text).not.toMatch(/A\$\d/);
    expect(out).not.toContain("hero-tier-strip");
    expect(out).not.toContain('data-testid="unlock-preview"');
    expect(out).not.toMatch(/id="tiers"/);
    expect(text).not.toMatch(/\/month\b/);
  });

  it("six blocks inside <main>: hero, audiences, how, sample, proof, cta", () => {
    const main = out.slice(out.indexOf("<main"), out.indexOf("</main>"));
    const ids = [...main.matchAll(/<section[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual(["audiences", "how", "sample", "proof", "cta"]);
    // + the hero section (aria-labelledby, no id) = six.
    expect((main.match(/<section\b/g) ?? []).length).toBe(6);
    expect(main).toContain('aria-labelledby="page-hero-heading"');
  });

  it("the five nav labels are present and the primary CTA is Score a startup → /analyze", () => {
    for (const label of ["Product", "Solutions", "Samples", "Pricing", "Docs"]) expect(text).toContain(label);
    expect(MENU.map((e) => e.label)).toEqual(["Product", "Solutions", "Samples", "Pricing", "Docs"]);
    expect(out).toMatch(/data-cta-id="score_startup"/);
    expect(out).toMatch(/data-cta-id="hero_score"/);
    expect(out).toMatch(/data-cta-id="hero_sample"/);
    expect(out).toContain('href="/tbr/demo"');
  });

  it("block 2: the three audience hrefs (/solutions/investor, /accelerator, /advisor) as whole-card links", () => {
    expect(HOME_AUDIENCES.map((a) => a.href)).toEqual(["/solutions/investor", "/solutions/accelerator", "/solutions/advisor"]);
    for (const a of HOME_AUDIENCES) {
      expect(out, a.href).toMatch(new RegExp(`<a[^>]*data-cta-id="${a.ctaId}"[^>]*href="${a.href}"|<a[^>]*href="${a.href}"[^>]*data-cta-id="${a.ctaId}"`));
      expect(text).toContain(a.title);
    }
  });

  it("block 3: three numbered steps + the Go-deeper row onto /product#worth|state|journey|next", () => {
    expect(HOME_STEPS).toHaveLength(3);
    expect(text).toContain("Step 1");
    expect(text).toContain("Step 3");
    expect(out).toContain('data-testid="home-go-deeper"');
    expect(HOME_GO_DEEPER.map((l) => l.href)).toEqual(["/product#worth", "/product#state", "/product#journey", "/product#next"]);
    for (const l of HOME_GO_DEEPER) expect(out, l.href).toContain(`href="${l.href}"`);
  });

  it("block 4: one sample result card from the MVP fixture, linking /tbr/demo and /sample-business-report, no A$", () => {
    expect((out.match(/data-testid="sample-result-card"/g) ?? []).length).toBe(1);
    expect(text).toContain("58");
    expect(text).toContain("$850K");
    expect(text).toContain("$2.1M");
    expect(text).toContain("AUD");
    expect(text).toContain("Traction & Revenue"); // the weakest published dimension = top risk
    expect(out).toContain(`href="${SAMPLE_CARD_LINKS.dossier.href}"`);
    expect(out).toContain(`href="${SAMPLE_CARD_LINKS.report.href}"`);
    expect(out).toMatch(/min-h-\[22rem\]/); // reserved height (CLS)
  });

  it("block 5: the stat strip has four figures from the content JSONs + the proof band; block 6: dark CtaBand", () => {
    expect(out).toContain('data-testid="stat-strip"');
    expect(text).toContain("startups scored");
    expect(text).toContain("open-register signals");
    expect(text).toContain("backtest ρ");
    expect(text).toContain("evaluators on a plan");
    expect(text).toMatch(/\d\.\d\d \/ \d\.\d\d/);
    expect(text).not.toContain("— startups scored");
    expect(out).toContain('data-testid="proof-band"');
    expect(text).toContain("Built in Sydney");
    expect(out).toMatch(/<section[^>]*id="cta"[^>]*data-theme="dark"/);
    expect(out).toMatch(/data-cta-id="home_final_score"/);
  });

  it("one header + one footer landmark; the footer is the shared one and names both roles from the config (G21 P0-A)", () => {
    expect((out.match(/<header\b/g) ?? []).length).toBe(1);
    expect((out.match(/<footer\b/g) ?? []).length).toBe(1);
    expect(out).toContain('aria-labelledby="marketing-footer-heading"');
    expect(text).toContain(LEGAL_ENTITY.marketingOperator);
    expect(text).toContain(marketingLine(new Date().getUTCFullYear()));
    for (const col of ["Product", "For", "Company", "Legal"]) expect(out).toContain(`>${col}<`);
  });
});
