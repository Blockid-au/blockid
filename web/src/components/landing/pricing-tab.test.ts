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

  it("the server pricing pages never import resolvePricingTab from the client component", () => {
    // /pricing (S31-D) is static and no longer resolves the tab on the
    // server at all — the switch reads the URL client-side; /vi/pricing
    // still resolves it server-side from the server-safe module.
    for (const rel of ["../../app/(marketing)/pricing/page.tsx", "../../app/vi/pricing/page.tsx"]) {
      const src = readFileSync(resolve(__dirname, rel), "utf8");
      expect(src).not.toMatch(/resolvePricingTab[^;]*from "@\/components\/landing\/pricing-segment-switch"/s);
    }
    const vi = readFileSync(resolve(__dirname, "../../app/vi/pricing/page.tsx"), "utf8");
    expect(vi).toMatch(/from "@\/components\/landing\/pricing-tab"/);
    const en = readFileSync(resolve(__dirname, "../../app/(marketing)/pricing/page.tsx"), "utf8");
    expect(en).not.toMatch(/searchParams\s*[:}]/); // no searchParams prop — the page is static
  });

  it("maps query values to tabs", () => {
    expect(resolvePricingTab(undefined)).toBe("founder");
    expect(resolvePricingTab("investor")).toBe("evaluator");
    expect(resolvePricingTab(["accelerators"])).toBe("evaluator");
    expect(TAB_TO_SEGMENT.evaluator).toBe("investor");
  });
});
