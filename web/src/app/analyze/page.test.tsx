// Colocated test for /analyze (QA audit 2026-09-14 F4): the main conversion
// page must ship inside the marketing shell — header/nav (NavV2), the
// `<main id="main-content">` landmark and the footer — while keeping its
// hero, the SmartIntake mount and the `pageMetadata` contract. NavV2 mounts
// `useRouter()` and the footer imports the version JSON, so both are mocked
// to landmark-only stand-ins; the assertion is on the page composition, not
// the nav internals (those have their own tests).

import { describe, expect, it, vi } from "vitest";
import { renderToReadableStream } from "react-dom/server";

vi.mock("@/components/landing/nav-v2", () => ({
  NavV2: () => (
    <header data-testid="nav-v2">
      <nav aria-label="Primary">
        <a href="/pricing">Pricing</a>
        <a href="/auth/login">Sign in</a>
      </nav>
    </header>
  ),
}));
vi.mock("@/components/marketing/footer", () => ({
  Footer: () => (
    <footer data-testid="marketing-footer">
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- test stub */}
      <a href="/legal/privacy">Privacy</a>
    </footer>
  ),
}));
vi.mock("@/components/analyze/analyze-root", () => ({
  AnalyzeRoot: (props: Record<string, unknown>) => <div data-testid="analyze-root" data-props={JSON.stringify(props)} />,
}));
vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(async () => null),
}));

import AnalyzePage, { metadata } from "./page";
import { getCurrentUser } from "@/lib/auth";

async function html(el: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

describe("/analyze — marketing shell (F4)", () => {
  it("renders header, primary nav, main landmark and footer around the hero", async () => {
    const out = await html(await AnalyzePage({ searchParams: Promise.resolve({}) }));
    // Shell landmarks, in document order: skip link → header → main → footer.
    const skip = out.indexOf('href="#main-content"');
    const header = out.indexOf("<header");
    const main = out.indexOf('<main id="main-content"');
    const footer = out.indexOf("<footer");
    expect(skip).toBeGreaterThan(-1);
    expect(header).toBeGreaterThan(skip);
    expect(main).toBeGreaterThan(header);
    expect(footer).toBeGreaterThan(main);
    expect(out).toContain('<nav aria-label="Primary"');
    // Exactly one <main> — the page no longer renders its own.
    expect(out.match(/<main\b/g)?.length).toBe(1);
    // Hero + intake are inside the main landmark.
    const hero = out.indexOf('id="analyze-hero-heading"');
    const root = out.indexOf('data-testid="analyze-root"');
    expect(hero).toBeGreaterThan(main);
    expect(root).toBeGreaterThan(hero);
    expect(root).toBeLessThan(footer);
    // Paths a trial user needs are now reachable from the server HTML.
    for (const href of ["/pricing", "/auth/login", "/legal/privacy", "/tbr/demo"]) {
      expect(out).toContain(`href="${href}"`);
    }
  });

  it("passes search params and auth state through to AnalyzeRoot unchanged", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce({ id: "u1" } as never);
    const out = await html(
      await AnalyzePage({
        searchParams: Promise.resolve({ tier: "paid", q: "https://example.com", kind: "url", resume: "signup", claimed: "2" }),
      }),
    );
    const m = /data-props="([^"]+)"/.exec(out);
    expect(m).not.toBeNull();
    const props = JSON.parse(m![1].replace(/&quot;/g, '"'));
    expect(props).toMatchObject({
      tier: "paid",
      authenticated: true,
      initialQuery: "https://example.com",
      initialKind: "url",
      resumedFromSignup: true,
      claimed: 2,
    });
  });

  it("keeps the pageMetadata contract", () => {
    expect(metadata.title).toBe("Analyze your startup — SVI score and valuation");
    expect(String((metadata.alternates as { canonical?: unknown })?.canonical ?? "")).toMatch(/\/analyze$/);
  });
});
