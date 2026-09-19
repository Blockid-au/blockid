// Colocated test for /about (G17 P2-A): one h1, the section ids, every
// card href on disk, the proof band, no invented customer counts, the
// entity split (Auschain on the legal facts; PPL Food stays in the footer),
// pageMetadata. The marketing shell is mocked.

import { describe, expect, it, vi } from "vitest";
import { renderToReadableStream } from "react-dom/server";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("@/components/marketing/marketing-shell", () => ({
  MarketingShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/landing/logo-cloud", () => ({ LogoCloud: () => null }));

import { renderedTitle } from "@/lib/seo/page-meta";
import { ABOUT_APPROACH, ABOUT_WHAT_WE_DO } from "./about-content";
import AboutPage, { metadata } from "./page";

async function html(el: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

const APP_DIR = resolve(__dirname, "..", "..");
function pageExists(href: string): boolean {
  const segs = href.split(/[?#]/)[0]!.split("/").filter(Boolean);
  return ["", "(marketing)", "(app)"].some((g) => existsSync(resolve(APP_DIR, g, ...segs, "page.tsx")));
}

describe("/about — template (G17 P2-A)", () => {
  it("every card href is a page on disk", () => {
    for (const c of [...ABOUT_WHAT_WE_DO, ...ABOUT_APPROACH]) {
      if (c.href) expect(pageExists(c.href), c.href).toBe(true);
    }
  });

  it("one h1, the six section ids, the proof band, the CTAs, no invented counts", async () => {
    const out = await html(<AboutPage />);
    expect((out.match(/<h1\b/g) ?? []).length).toBe(1);
    for (const id of ["mission", "what", "approach", "team", "proof", "australian", "cta"]) {
      expect(out).toMatch(new RegExp(`<section[^>]*id="${id}"`));
    }
    expect(out).toContain('data-testid="proof-band"');
    expect(out).toContain("ABN 79 659 615 111");
    expect(out).toContain('href="/analyze"');
    expect(out).toContain('href="/contact"');
    expect(out).toContain('href="/team"');
    expect(out).not.toMatch(/200\+ Australian startups|95% User satisfaction|Funding facilitated/);
    expect(out).not.toMatch(/Sonnet 4\.|Opus 4\./);
  });

  it("pageMetadata: canonical, rendered title ≤ 65, description ≤ 165", () => {
    expect(metadata.alternates?.canonical).toBe("https://blockid.au/about");
    expect(renderedTitle(metadata.title).length).toBeLessThanOrEqual(65);
    expect(String(metadata.description).length).toBeLessThanOrEqual(165);
  });
});
