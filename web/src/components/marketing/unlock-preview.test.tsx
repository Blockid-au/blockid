// Colocated tests for the "what you unlock after login" strip (G11 §3c,
// T0238). Uses renderToStaticMarkup (no @testing-library/react in this
// workspace), so the assertions are on the SSR markup — which is what the
// homepage and /features actually serve.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NAV_GROUPS } from "@/components/workspace/nav-groups";
import {
  UNLOCK_CARDS,
  UnlockPreview,
  buildUnlockCards,
  unlockHref,
} from "./unlock-preview";

const EXPECTED_ROUTES = [
  "/workspace/equity/cap-table",
  "/workspace/documents/data-room",
  "/workspace/valuation",
  "/workspace/reports/investor-pack",
  "/workspace/funding",
  "/workspace/documents/compliance",
  "/workspace/evidence/metrics",
  "/workspace/exit",
];

describe("buildUnlockCards()", () => {
  it("produces eight cards in the agreed order", () => {
    expect(UNLOCK_CARDS).toHaveLength(8);
    expect(UNLOCK_CARDS.map((c) => c.href)).toEqual(EXPECTED_ROUTES);
    expect(buildUnlockCards()).toEqual(UNLOCK_CARDS);
  });

  it("takes labels from NAV_GROUPS wherever the route is catalogued", () => {
    const catalogue = new Map<string, string>();
    for (const g of NAV_GROUPS) {
      for (const i of g.items) catalogue.set(i.href, i.label.en);
    }
    for (const card of UNLOCK_CARDS) {
      const sidebarLabel = catalogue.get(card.href);
      if (sidebarLabel) expect(card.label).toBe(sidebarLabel);
    }
    // Nav v4 (G13-W1-IA1): these routes are sidebar leaves today; the strip
    // must not drift from them. Cap table / data room / calendar became hub
    // tabs (S-IA2) and use the fallback labels.
    expect(catalogue.has("/workspace/funding")).toBe(true);
    expect(catalogue.has("/workspace/exit")).toBe(true);
    expect(catalogue.get("/workspace/funding")).toBe("Grants & programs");
  });

  it("every card has a one-line outcome", () => {
    for (const card of UNLOCK_CARDS) {
      expect(card.outcome.trim().length).toBeGreaterThan(20);
      expect(card.outcome).not.toContain("\n");
    }
  });
});

describe("unlockHref()", () => {
  it("routes through login with the workspace page as `next`", () => {
    expect(unlockHref("/workspace/documents/data-room")).toBe(
      "/auth/login?next=%2Fworkspace%2Fdocuments%2Fdata-room",
    );
  });
});

describe("<UnlockPreview />", () => {
  const html = renderToStaticMarkup(<UnlockPreview />);

  it("renders a labelled section with eight locked links", () => {
    expect(html).toContain('data-testid="unlock-preview"');
    expect(html).toContain('aria-labelledby="unlock-heading"');
    expect(html).toContain("What you unlock after login");
    const links = html.match(/href="\/auth\/login\?next=[^"]+"/g) ?? [];
    expect(links).toHaveLength(8);
    for (const route of EXPECTED_ROUTES) {
      expect(html).toContain(`href="${unlockHref(route).replace(/&/g, "&amp;")}"`);
      expect(html).toContain(`data-unlock-route="${route}"`);
    }
  });

  it("shows every label and a lock glyph per card", () => {
    for (const card of UNLOCK_CARDS) {
      // React escapes `&` in text nodes ("Grant &amp; Program Finder").
      expect(html).toContain(card.label.replace(/&/g, "&amp;"));
    }
    expect((html.match(/lucide-lock/g) ?? []).length).toBe(8);
  });

  it("switches ground by tone", () => {
    expect(renderToStaticMarkup(<UnlockPreview tone="base" />)).toContain("bg-surface ");
    expect(html).toContain("bg-surface-sunken");
  });
});
