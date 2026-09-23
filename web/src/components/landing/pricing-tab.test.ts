// Regression guard for the 2026-09-10 /pricing outage: the server page must
// import these helpers from a module that is NOT "use client".
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PRICING_TABS, resolvePricingTab, TAB_TO_SEGMENT } from "./pricing-tab";

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

  it("maps query values to tabs (Pricing v4: third Programs tab)", () => {
    // G30 investor-first: no query → the evaluator tab (9437b21e7). "founder"
    // is still reachable by name, it is just no longer the default landing.
    expect(resolvePricingTab(undefined)).toBe("evaluator");
    for (const v of ["founder", "founders", "free", "starter", "growth"]) expect(resolvePricingTab(v), v).toBe("founder");
    expect(resolvePricingTab("investor")).toBe("evaluator");
    for (const v of ["fund", "vc", "advisor", "evaluator"]) expect(resolvePricingTab(v), v).toBe("evaluator");
    for (const v of ["accelerator", "accelerators", "program", "programs", "incubator", "university"]) {
      expect(resolvePricingTab(v), v).toBe("programs");
    }
    expect(resolvePricingTab(["accelerators"])).toBe("programs");
    expect(PRICING_TABS).toEqual(["founder", "evaluator", "programs"]);
    expect(TAB_TO_SEGMENT.evaluator).toBe("investor");
    expect(TAB_TO_SEGMENT.programs).toBe("accelerator");
  });
});
