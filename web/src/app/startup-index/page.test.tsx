// Design check 2026-09-21: the sector heatmap rendered emoji as structural
// icons (🛒 🏪 …) and 10–11 px captions — both forbidden by the unicorn
// template (§ 6 no emoji icons; captions never below 12 px). Source-level pin:
// the page draws Lucide glyphs from SECTOR_ICON and never prints `s.emoji`.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(path.join(__dirname, "page.tsx"), "utf8");

describe("/startup-index sector heatmap", () => {
  it("uses Lucide sector icons, never the aggregator's emoji", () => {
    expect(src).not.toMatch(/\{s\.emoji\}/);
    expect(src).toContain("const SECTOR_ICON: Record<string, LucideIcon>");
    for (const sector of ["saas", "fintech", "ai", "healthtech", "marketplace", "deeptech", "ecommerce"]) {
      expect(src, sector).toMatch(new RegExp(`\\n  ${sector}: [A-Z][A-Za-z]+,`));
    }
  });
  it("keeps every caption at 12 px or larger", () => {
    expect(src).not.toMatch(/text-\[1[01]px\]/);
  });
});
