// Colocated test for /version (G20-F2 page sweep, 2026-09-20): the page has
// a <main> landmark, one h1, and its body wraps long tokens (release-note
// identifiers and the ISO deploy timestamp pushed the page 42 px past a
// 375 px viewport — page-sweep no_main + overflow_375 on /version).

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { expectLightSurfaces } from "@/test/light-surface";
import VersionPage from "./page";

describe("/version", () => {
  it("renders one h1 inside a page with a main landmark that wraps long tokens", () => {
    const html = renderToStaticMarkup(VersionPage());
    expect((html.match(/<h1[\s>]/g) ?? []).length).toBe(1);
    const main = /<main class="([^"]*)"/.exec(html);
    expect(main, "a <main> landmark").not.toBeNull();
    expect(main![1]).toContain("[overflow-wrap:anywhere]");
    // The phase header badge wraps under the title on narrow screens instead of forcing width.
    expect(html).toContain("flex flex-wrap items-center justify-between gap-2");
    // G26: the hero, the phase headers and the CTA are light — no gradient fills, no white text.
    expect(html).not.toMatch(/bg-gradient-to-/);
    expect(html).not.toMatch(/class="[^"]*\btext-white\b/);
    expectLightSurfaces(html, "/version", { whole: true });
  });
});
