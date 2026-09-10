// Colocated render test for the homepage hero (T0250, G11 §4i D-5). Uses
// renderToStaticMarkup (no @testing-library/react in this workspace), so the
// assertions are on the SSR markup — which is exactly the F1 default the
// server must emit regardless of `?hero=`, because the arm swap is a
// post-mount effect.

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { heroLine } from "@/lib/marketing/hero-variants";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {} }),
}));

import { HeroSection } from "./hero-section";

/** Strip tags and decode the entities React emits so we can compare prose. */
function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

describe("<HeroSection /> SSR", () => {
  const html = renderToStaticMarkup(<HeroSection />);
  const text = textOf(html);

  it("renders founder line F1 as the H1 by default", () => {
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    expect(h1).not.toBeNull();
    expect(textOf(h1![1]!)).toBe(heroLine("F1").en);
    expect(html).toMatch(/data-hero-arm="F1"/);
  });

  it("keeps the second breath of the H1 in the action accent", () => {
    expect(html).toMatch(
      /<span class="text-action">your score, what it&#x27;s worth, and where the money is, in 60 seconds\.<\/span>/,
    );
  });

  it("renders founder line F3 as the sub-line", () => {
    expect(text).toContain(heroLine("F3").en);
  });

  it("no longer says the pre-T0250 headline or sub-line", () => {
    expect(text).not.toContain("See your company the way an investor will");
    expect(text).not.toContain("Paste a deck, a link, or three sentences");
  });

  it("keeps the omnibox and the tier strip", () => {
    expect(html).toMatch(/data-testid="hero-tier-strip"/);
    expect(html).toMatch(/<form|<textarea|<input/);
  });
});
