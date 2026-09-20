// Colocated test for /changelog (G20-F2 page sweep, 2026-09-20): the
// markdown → HTML renderer's inline `code` spans carry a wrap rule. Release
// notes quote long identifiers (`scripts/db/apply-migration.sh`, SKU ids,
// paths) and an unwrapped inline <code> pushed the page 110 px past a 375 px
// viewport (page-sweep overflow_375 on /changelog).
//
// The marketing shell mounts NavV2 → LocaleSwitcher → useRouter(), which
// throws outside an app-router context, so it is mocked to a pass-through.

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/components/marketing/marketing-shell", () => ({
  MarketingShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/site/page-view-tracker", () => ({ PageViewTracker: () => null }));

import ChangelogPage from "./page";

describe("/changelog", () => {
  it("renders one h1 and wraps every inline code span (no 375 px overflow)", () => {
    const html = renderToStaticMarkup(ChangelogPage());
    expect((html.match(/<h1[\s>]/g) ?? []).length).toBe(1);
    const codes = html.match(/<code class="[^"]*"/g) ?? [];
    expect(codes.length, "CHANGELOG.md quotes at least one identifier in backticks").toBeGreaterThan(0);
    for (const c of codes) expect(c, "inline code must wrap at narrow widths").toMatch(/overflow-wrap:anywhere/);
  });
});
