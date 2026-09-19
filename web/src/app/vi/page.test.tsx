// Colocated test for the /vi homepage mirror (G17 P2-A). Renders the real
// page (NavV2's auth hook + next/navigation stubbed, like the English home
// test) and pins: exactly one H1 = vi `hero.line.e1`, the E2 sub-line, the
// search frame (`hero-search` + `smart-intake`), no `A$` strings, the three
// audience links onto /vi/solutions/*, the founder notice, the CtaBand, the
// one Footer, and the metadata pair (canonical /vi, hreflang en → /).

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
import ViHomePage, { generateMetadata, revalidate } from "./page";

const VI = viMessages as Record<string, string>;

async function html(el: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/'/g, "&#x27;");

describe("/vi homepage — template (G17 P2-A)", () => {
  it("one h1 = hero.line.e1 (vi), the E2 sub-line, the search frame, no A$ strings", async () => {
    const out = await html(await ViHomePage());
    expect((out.match(/<h1\b/g) ?? []).length).toBe(1);
    expect(out).toContain(esc(VI["hero.line.e1"]!));
    expect(out).toContain(esc(VI["hero.line.e2"]!));
    expect(out).toContain('data-testid="hero-search"');
    expect(out).toContain('data-testid="smart-intake"');
    expect(out).toContain('lang="vi"');
    expect(out).toContain('id="main-content"');
    expect(out).not.toMatch(/A\$\d/);
  });

  it("three audience cards onto /vi/solutions/*, the founder line, the notice, the closing band, the one footer", async () => {
    const out = await html(await ViHomePage());
    for (const p of ["investor", "accelerator", "advisor", "founder"]) {
      expect(out).toContain(`href="/vi/solutions/${p}"`);
    }
    expect(out).toMatch(/<section[^>]*id="audiences"/);
    expect(out).toMatch(/<section[^>]*id="notice"/);
    expect(out).toContain(esc(VI["vi.hero.notice"]!));
    expect(out).toMatch(/<section[^>]*id="cta"/);
    expect(out).toContain('href="/analyze"');
    expect(out).toContain('href="/tbr/demo"');
    expect(out).toContain("PPL Food PTY LTD");
    expect((out.match(/<footer\b/g) ?? []).length).toBe(1);
  });

  it("every vi.home.* key the page reads exists and is non-empty", () => {
    const keys = Object.keys(VI).filter((k) => k.startsWith("vi.home."));
    expect(keys.length).toBeGreaterThanOrEqual(19);
    for (const k of keys) expect(VI[k]!.trim().length, k).toBeGreaterThan(0);
  });

  it("metadata: canonical /vi, hreflang en → /, x-default → /, vi_VN, rendered title ≤ 65, ISR 300", async () => {
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
    expect(revalidate).toBe(300);
  });
});
