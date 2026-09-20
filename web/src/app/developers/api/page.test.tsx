// Colocated test for /developers/api (G20-F2 page sweep, 2026-09-20): the
// endpoint card grid overflowed 375 px by 10 px (page-sweep overflow_375) —
// an implicit `auto` grid track below `sm` grows to the widest card's
// min-content and a `truncate` <code> inside a flex row cannot shrink without
// `min-w-0`. Pins the explicit base track + shrinkable items, one h1, a main.

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/components/landing/nav-v2", () => ({ NavV2: () => null }));
vi.mock("@/components/marketing/footer", () => ({ Footer: () => null }));
vi.mock("@/components/marketing/marketing-shell", () => ({
  MarketingShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import ApiIndexPage from "./page";

describe("/developers/api", () => {
  it("card grid has an explicit base track and shrinkable cards; one h1; a main", () => {
    const html = renderToStaticMarkup(ApiIndexPage());
    expect(html).toContain('<ul class="grid grid-cols-1 gap-4 sm:grid-cols-2">');
    const cards = html.match(/<li class="min-w-0">/g) ?? [];
    expect(cards.length, "one <li min-w-0> per endpoint").toBeGreaterThan(3);
    expect(html).not.toMatch(/<li>/);
    const codes = html.match(/<code class="[^"]*truncate[^"]*"/g) ?? [];
    expect(codes.length).toBe(cards.length);
    for (const c of codes) expect(c).toMatch(/\bmin-w-0\b/);
    expect((html.match(/<h1[\s>]/g) ?? []).length).toBe(1);
    expect(html).toMatch(/<main[\s>]/);
  });
});
