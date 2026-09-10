// Regression guard for the 2026-09-10 /pricing outage: the server page must
// import these helpers from a module that is NOT "use client".
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolvePricingTab, TAB_TO_SEGMENT } from "./pricing-tab";

describe("pricing-tab (server-safe helpers)", () => {
  it("is not a client module", () => {
    const src = readFileSync(resolve(__dirname, "pricing-tab.ts"), "utf8");
    expect(src.startsWith('"use client"')).toBe(false);
    expect(src).not.toMatch(/^\s*["']use client["']/m);
  });

  it("the server pricing pages import resolvePricingTab from pricing-tab, not the client component", () => {
    for (const rel of ["../../app/(marketing)/pricing/page.tsx", "../../app/vi/pricing/page.tsx"]) {
      const src = readFileSync(resolve(__dirname, rel), "utf8");
      expect(src).toMatch(/from "@\/components\/landing\/pricing-tab"/);
      expect(src).not.toMatch(/resolvePricingTab[^;]*from "@\/components\/landing\/pricing-segment-switch"/s);
    }
  });

  it("maps query values to tabs", () => {
    expect(resolvePricingTab(undefined)).toBe("founder");
    expect(resolvePricingTab("investor")).toBe("evaluator");
    expect(resolvePricingTab(["accelerators"])).toBe("evaluator");
    expect(TAB_TO_SEGMENT.evaluator).toBe("investor");
  });
});
