// Colocated render test for the homepage hero (G21 P0-B, 2026-09-20; was
// G17 D1/D2 / T0250). Uses renderToStaticMarkup (no @testing-library/react
// in this workspace), so the assertions are on the SSR markup — which is
// exactly the FI1 default the server must emit regardless of `?hero=`,
// because the arm swap is a post-mount effect.

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
  HERO_TRUST_ITEMS,
  HERO_TRUST_LINE,
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
  const m = html.match(new RegExp(`<a\\b[^>]*href="${href.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}"[^>]*>`));
  if (!m) throw new Error(`no <a href="${href}">`);
  return m[0];
}

describe("<HeroSection /> SSR", () => {
  const html = renderToStaticMarkup(<HeroSection />);
  const text = textOf(html);

  it("renders the FI1 line as the one H1 by default (G21 P0-B)", () => {
    const h1s = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/g) ?? [];
    expect(h1s).toHaveLength(1);
    expect(textOf(h1s[0]!)).toBe("Screen every startup on the same evidence-backed framework.");
    expect(textOf(h1s[0]!)).toBe(heroLine("FI1").en);
    expect(html).toMatch(/data-hero-arm="FI1"/);
  });

  it("renders FI2 as the sub-line, the eyebrow and the trust line (Australian-built · Evidence-backed · Founder-controlled data)", () => {
    expect(text).toContain(heroLine("FI2").en);
    expect(text).toContain(HERO_EYEBROW);
    expect(HERO_TRUST_ITEMS).toEqual(["Australian-built", "Evidence-backed", "Founder-controlled data"]);
    expect(HERO_TRUST_LINE).toBe("Australian-built · Evidence-backed · Founder-controlled data");
    expect(html).toContain('data-testid="hero-trust-line"');
    expect(text).toContain(HERO_TRUST_LINE);
    // The deprecated founder-line export is the trust line now.
    expect(HERO_FOUNDER_LINE).toBe(HERO_TRUST_LINE);
    expect(text).not.toContain("Founder? Get your own score free.");
  });

  it("CTAs: 'Start a cohort' → the Cohort 25 annual trial sign-up (primary, G25), 'Score my startup' → /analyze (secondary)", () => {
    expect(HERO_PRIMARY_CTA).toEqual({ href: "/signup?segment=evaluator&plan=accelerator_starter&trial=1&interval=annual", label: "Start a cohort", ctaId: "hero_start_cohort" });
    expect(HERO_SECONDARY_CTA).toEqual({ href: "/analyze", label: "Score my startup", ctaId: "hero_score" });
    expect(anchorTag(html, "/signup?segment=evaluator&amp;plan=accelerator_starter&amp;trial=1&amp;interval=annual")).toContain('data-cta-id="hero_start_cohort"');
    expect(anchorTag(html, "/signup?segment=evaluator&amp;plan=accelerator_starter&amp;trial=1&amp;interval=annual")).toContain("bg-action");
    expect(anchorTag(html, "/analyze")).toContain('data-cta-id="hero_score"');
    expect(text).toContain("Start a cohort");
    expect(text).not.toMatch(/pilot/i);
    expect(text).toContain("Score my startup");
    expect(text).not.toContain("Score a startup");
  });

  it("keeps the omnibox inside the rotating ring, under data-testid=hero-search", () => {
    expect(html).toContain('data-testid="hero-search"');
    expect(html).toContain('data-testid="smart-intake"');
    expect(html).toMatch(/class="asf-wrap/);
    expect(html).toMatch(/<form|<textarea|<input/);
  });

  it("no prices, no tier strip, no recent-run card, no old headline (D3), no agent count, no AI-superiority claim (G21)", () => {
    expect(text).not.toMatch(/A\$\d/);
    expect(html).not.toContain("hero-tier-strip");
    expect(text).not.toContain("A recent run");
    expect(text).not.toContain("See your startup the way an investor will");
    expect(text).not.toContain("Paste your idea.");
    expect(text).not.toContain("Score any Australian startup in 60 seconds.");
    expect(text).not.toMatch(/\b\d+ (AI )?agents\b/i);
    expect(text).not.toMatch(/better than|our AI/i);
  });
});
