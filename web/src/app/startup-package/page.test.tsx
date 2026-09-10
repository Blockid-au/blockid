// Render test for /startup-package (T0247): the A$149 Package advertises
// "1 Money Finder report + 3 months Founder Radar included" from the one
// catalogue constant the webhook grant (money_radar_until, 0319) is sized by.

import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/components/marketing/marketing-shell", () => ({
  MarketingShell: ({ children }: { children: React.ReactNode }) => <div data-shell>{children}</div>,
}));

import StartupPackagePage, { metadata } from "./page";
import { STARTUP_PACKAGE_MONEY_FINDER_LINE } from "@/lib/plans-v2";

describe("/startup-package", () => {
  const out = renderToStaticMarkup(<StartupPackagePage />);

  it("says the Package includes 1 Money Finder report + 3 months Founder Radar (hero + inclusions)", () => {
    expect(STARTUP_PACKAGE_MONEY_FINDER_LINE).toBe("1 Money Finder report + 3 months Founder Radar included");
    const hits = out.match(/1 Money Finder report \+ 3 months Founder Radar included/g) ?? [];
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(out).toContain("data-package-money-finder");
    expect(out).toContain("What&#x27;s inside your A$149 unlock");
  });

  it("keeps the A$149 price and the 25 seed credits", () => {
    expect(out).toContain("Unlock full Package · A$149");
    expect(out).toContain("25 seed credits");
    expect(String(metadata.description)).toContain("1 Money Finder report + 3 months Founder Radar");
  });
});
