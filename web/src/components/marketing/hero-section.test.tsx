// Colocated render test for the homepage hero (G17 D1/D2, 2026-09-19; was
// T0250). Uses renderToStaticMarkup (no @testing-library/react in this
// workspace), so the assertions are on the SSR markup — which is exactly the
// E1 default the server must emit regardless of `?hero=`, because the arm
// swap is a post-mount effect.

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { heroLine } from "@/lib/marketing/hero-variants";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {} }),
}));

import {
  HERO_EYEBROW,
  HERO_FOUNDER_LINE,
  HERO_PRIMARY_CTA,
  HERO_SECONDARY_CTA,
  HeroSection,
} from "./hero-section";

/** Strip tags and decode the entities React emits so we can compare prose. */
function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

function anchorTag(html: string, href: string): string {
  const m = html.match(new RegExp(`<a\\b[^>]*href="${href.replace(/\//g, "\\/")}"[^>]*>`));
  if (!m) throw new Error(`no <a href="${href}">`);
  return m[0];
}

describe("<HeroSection /> SSR", () => {
  const html = renderToStaticMarkup(<HeroSection />);
  const text = textOf(html);

  it("renders evaluator line E1 as the one H1 by default (G17 D1)", () => {
    const h1s = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/g) ?? [];
    expect(h1s).toHaveLength(1);
    expect(textOf(h1s[0]!)).toBe("Score any Australian startup in 60 seconds.");
    expect(textOf(h1s[0]!)).toBe(heroLine("E1").en);
    expect(html).toMatch(/data-hero-arm="E1"/);
  });

  it("renders E2 as the sub-line and the eyebrow + founder line", () => {
    expect(text).toContain(heroLine("E2").en);
    expect(text).toContain(HERO_EYEBROW);
    expect(text).toContain(HERO_FOUNDER_LINE);
    expect(html).toMatch(/href="\/solutions\/founder"/);
  });

  it("CTAs: 'Score a startup' → /analyze (primary), 'See a sample dossier' → /tbr/demo (secondary)", () => {
    expect(HERO_PRIMARY_CTA).toEqual({ href: "/analyze", label: "Score a startup", ctaId: "hero_score" });
    expect(HERO_SECONDARY_CTA).toEqual({ href: "/tbr/demo", label: "See a sample dossier", ctaId: "hero_sample" });
    expect(anchorTag(html, "/analyze")).toContain('data-cta-id="hero_score"');
    expect(anchorTag(html, "/analyze")).toContain("bg-action");
    expect(anchorTag(html, "/tbr/demo")).toContain('data-cta-id="hero_sample"');
    expect(text).toContain("Score a startup");
    expect(text).toContain("See a sample dossier");
  });

  it("keeps the omnibox inside the rotating ring, under data-testid=hero-search", () => {
    expect(html).toContain('data-testid="hero-search"');
    expect(html).toContain('data-testid="smart-intake"');
    expect(html).toMatch(/class="asf-wrap/);
    expect(html).toMatch(/<form|<textarea|<input/);
  });

  it("no prices, no tier strip, no recent-run card, no old headline (D3)", () => {
    expect(text).not.toMatch(/A\$\d/);
    expect(html).not.toContain("hero-tier-strip");
    expect(text).not.toContain("A recent run");
    expect(text).not.toContain("See your startup the way an investor will");
    expect(text).not.toContain("Paste your idea.");
  });
});
