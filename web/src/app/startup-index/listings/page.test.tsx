// G28 UI lane (2026-09-21): the Markets listing renders on the light template
// tokens — no legacy `ink-*` / `bg-white` / amber washes, no caption below
// 12 px, every filter chip / sort header / pager link is a 44 px target with
// the navy focus ring. Static-source pins: the page is `force-dynamic` and
// reads the listings cache, so the rules are checked on the file itself.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = readFileSync(join(__dirname, "page.tsx"), "utf8");

describe("/startup-index/listings — light template rules", () => {
  it("uses template tokens only (no ink-*, bg-white, amber/emerald/rose, brand-*00 utilities)", () => {
    expect(SRC).not.toMatch(/\b(text|bg|border)-ink-\d{2,3}\b/);
    expect(SRC).not.toMatch(/\bbg-white\b/);
    expect(SRC).not.toMatch(/\b(text|bg|border|stroke)-(amber|emerald|rose)-\d{2,3}\b/);
    expect(SRC).not.toMatch(/\b(text|border)-brand-\d{3}\b/);
  });

  it("never sets a caption below 12 px", () => {
    expect(SRC).not.toMatch(/text-\[(\d|1[01])px\]/);
  });

  it("filter chips, sort headers and pager links are 44 px targets with the navy focus ring; sort headers carry aria-sort", () => {
    expect(SRC).toMatch(/const CHIP = `inline-flex min-h-11 items-center[^`]*\$\{FOCUS_RING\}`/);
    expect((SRC.match(/\$\{CHIP\} \$\{/g) ?? []).length).toBe(4);
    expect(SRC).toMatch(/aria-sort=\{active \? \(order === "desc" \? "descending" : "ascending"\) : undefined\}/);
    for (const label of ["← Back to Index", "← Prev", "Next →"]) {
      const at = SRC.indexOf(label);
      expect(at, label).toBeGreaterThan(0);
      expect(SRC.slice(SRC.lastIndexOf("<Link", at), at)).toMatch(/min-h-11[^>]*\$\{FOCUS_RING\}/);
    }
  });

  it("the methodology debug line wraps instead of clipping at 375 px", () => {
    expect(SRC).toMatch(/font-mono bg-surface-sunken[^"]*break-all/);
  });
});
