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
  "/workspace/cap-table",
  "/workspace/data-room",
  "/dashboard/valuation",
  "/workspace/investor-pack",
  "/workspace/funding",
  "/compliance/calendar",
  "/workspace/metrics",
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
      for (const i of g.items) catalogue.set(i.href, i.label);
    }
    for (const card of UNLOCK_CARDS) {
      const sidebarLabel = catalogue.get(card.href);
      if (sidebarLabel) expect(card.label).toBe(sidebarLabel);
    }
    // These routes are in the sidebar today; the strip must not drift from it.
    expect(catalogue.has("/workspace/cap-table")).toBe(true);
    expect(catalogue.has("/workspace/data-room")).toBe(true);
    expect(catalogue.has("/compliance/calendar")).toBe(true);
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
    expect(unlockHref("/workspace/data-room")).toBe(
      "/auth/login?next=%2Fworkspace%2Fdata-room",
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
