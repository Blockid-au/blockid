// Colocated test for the /vi homepage mirror (G21 P0-B; was G17 P2-A).
// Renders the real page (NavV2's auth hook + next/navigation stubbed, like
// the English home test) and pins: exactly one H1 = vi `hero.line.fi1`, the
// FI2 sub-line, the search frame (`hero-search` + `smart-intake`), the two
// CTAs onto the same hrefs as the English home, the trust line, no `A$`
// strings, the same section order as the English home (+ the founder
// notice), every list key non-empty, the CtaBand, the one Footer, and the
// metadata pair (canonical /vi, hreflang en → /).

import { describe, expect, it, vi } from "vitest";
import { renderToReadableStream } from "react-dom/server";

vi.mock("@/hooks/useAuthUser", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/hooks/useAuthUser")>();
  return { ...mod, useAuthUser: () => null };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {}, refresh: () => {} }),
  usePathname: () => "/vi",
}));
vi.mock("@/components/auth/LogoutButton", () => ({
  LogoutButton: ({ children }: { children?: React.ReactNode }) => <button>{children}</button>,
}));

import viMessages from "@/lib/i18n/messages/vi.json";
import { renderedTitle } from "@/lib/seo/page-meta";
import { expectLightSurfaces, mainOf } from "@/test/light-surface";
import { HOME_PRIMARY_CTA, HOME_SECONDARY_CTA, HOME_SECTION_IDS } from "../(marketing)/home-content";
import ViHomePage, { generateMetadata, revalidate } from "./page";

const VI = viMessages as Record<string, string>;

async function html(el: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/'/g, "&#x27;");

const out = await html(await ViHomePage());

describe("/vi homepage — template (G21 P0-B)", () => {
  it("one h1 = hero.line.fi1 (vi), the FI2 sub-line, the search frame, the trust line, no A$ strings", () => {
    expect((out.match(/<h1\b/g) ?? []).length).toBe(1);
    expect(out).toContain(esc(VI["hero.line.fi1"]!));
    expect(out).toContain(esc(VI["hero.line.fi2"]!));
    expect(out).not.toContain(esc(VI["hero.line.e1"]!));
    expect(out).toContain('data-testid="hero-search"');
    expect(out).toContain('data-testid="smart-intake"');
    expect(out).toContain('data-testid="hero-trust-line"');
    expect(out).toContain(esc(VI["vi.home.trustLine"]!));
    expect(out).toContain('lang="vi"');
    expect(out).toContain('id="main-content"');
    expect(out).not.toMatch(/A\$\d/);
  });

  it("the two CTAs go to the VI programs page rungs (G25 — never a pilot) and /analyze, in the hero and in the closing band", () => {
    expect(HOME_PRIMARY_CTA.href).toBe("/signup?segment=evaluator&plan=accelerator_starter&trial=1&interval=annual");
    expect(HOME_SECONDARY_CTA.href).toBe("/analyze");
    expect(out).toMatch(/data-cta-id="vi_hero_start_cohort"/);
    expect(out).toMatch(/data-cta-id="vi_hero_score"/);
    expect(out).toMatch(/data-cta-id="vi_home_final_start_cohort"/);
    expect(out).toMatch(/data-cta-id="vi_home_final_score"/);
    // Review P1 (2026-09-20): a Vietnamese visitor stays on the /vi mirror.
    expect((out.match(/href="\/vi\/solutions\/accelerator#plans"/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(out).not.toMatch(/#pilot|thí điểm/i);
    expect((out.match(/href="\/analyze"/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(out).toContain(esc(VI["vi.home.cta.primary"]!));
    expect(out).toContain(esc(VI["vi.home.cta.secondary"]!));
  });

  it("the same section order as the English home (+ the founder notice before the close), the sequence linked to /product, the sample link, the one footer", () => {
    const main = out.slice(out.indexOf("<main"), out.indexOf("</main>"));
    const ids = [...main.matchAll(/<section[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
    const expected = [...HOME_SECTION_IDS];
    expected.splice(expected.indexOf("cta"), 0, "trust", "notice");
    expect(ids).toEqual(expected);
    expect(main).toContain('data-testid="trust-band"');
    expect(out).toContain('data-testid="problem-flow"');
    expect(out).toContain('data-testid="sequence-flow"');
    expect(out).toContain('data-testid="why-not-chatgpt"');
    expect(out).toContain('data-testid="built-for"');
    expect(out).toMatch(/data-cta-id="vi_home_sequence_product"[^>]*href="\/product"|href="\/product"[^>]*data-cta-id="vi_home_sequence_product"/);
    expect(out).toContain('href="/tbr/demo"');
    expect(out).toContain(esc(VI["vi.hero.notice"]!));
    expect(out).toContain(esc(VI["vi.home.whynot.line"]!));
    expect(out).toContain(esc(VI["vi.home.problem.title"]!));
    expect(out).toMatch(/<section[^>]*id="cta"[^>]*class="[^"]*bg-surface-sunken/);
    expect(mainOf(out)).not.toMatch(/data-theme="dark"/);
    expect(out).toMatch(/<section[^>]*id="cta"[^>]*data-tone="sunken"/);
    expectLightSurfaces(out, "/vi");
    expect((out.match(/<footer\b/g) ?? []).length).toBe(1);
  });

  it("every vi.home.* key the page reads exists and is non-empty; list keys split into ≥ 3 items", () => {
    const keys = Object.keys(VI).filter((k) => k.startsWith("vi.home."));
    expect(keys.length).toBeGreaterThanOrEqual(50);
    for (const k of keys) expect(VI[k]!.trim().length, k).toBeGreaterThan(0);
    for (const k of ["vi.home.whynot.other.items", "vi.home.whynot.ours.items", "vi.home.builtFor.items", "vi.home.problem.inputs.examples"]) {
      expect(VI[k]!.split("|").length, k).toBeGreaterThanOrEqual(3);
    }
    expect(VI["vi.home.whynot.other.items"]!.split("|")).toHaveLength(6);
    expect(VI["vi.home.whynot.ours.items"]!.split("|")).toHaveLength(8);
    expect(VI["vi.home.builtFor.items"]!.split("|")).toHaveLength(6);
    // The G17 keys the page no longer reads are gone (no dead copy).
    for (const gone of ["vi.home.audiences.title", "vi.home.founderLine", "vi.home.final.secondary"]) {
      expect(VI[gone], gone).toBeUndefined();
    }
  });

  it("metadata: canonical /vi, hreflang en → /, x-default → /, vi_VN, rendered title ≤ 65, description ≤ 165, ISR 300", async () => {
    const meta = await generateMetadata();
    expect(meta.alternates?.canonical).toBe("https://blockid.au/vi");
    expect(meta.alternates?.languages).toEqual({
      en: "https://blockid.au/",
      vi: "https://blockid.au/vi",
      "x-default": "https://blockid.au/",
    });
    expect((meta.openGraph as { locale?: string }).locale).toBe("vi_VN");
    expect(renderedTitle(meta.title).length).toBeLessThanOrEqual(65);
    expect(String(meta.description).length).toBeLessThanOrEqual(165);
    expect(String(meta.description)).not.toMatch(/A\$/);
    expect(revalidate).toBe(300);
  });
});
