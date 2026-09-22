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

// G29 lane D (2026-09-22): a row with no prior close prints "new", never
// "0.0" / "−99.0"; the table is labelled a sample while n < 30; copy keys
// exist in both catalogues.
describe("/startup-index/listings — Δ 7d cell + sample label (G29-D)", () => {
  it("DeltaCell takes number | null and renders the 'new' badge for null", () => {
    expect(SRC).toMatch(/function DeltaCell\(\{ delta, newLabel, newTitle \}: \{ delta: number \| null;/);
    expect(SRC).toContain('data-testid="delta-new"');
    expect(SRC).not.toMatch(/delta\.toFixed\(/);
    expect(SRC).toContain("{formatDelta(delta)}");
  });
  it("labels the table as sample data below the benchmark band", () => {
    expect(SRC).toContain("isSampleBand(benchmarkBand(data.total))");
    expect(SRC).toContain('data-testid="index-sample-chip"');
  });
  it("copy keys used on the page exist in both catalogues", async () => {
    const en = (await import("@/lib/i18n/messages/en.json")).default as Record<string, string>;
    const vi = (await import("@/lib/i18n/messages/vi.json")).default as Record<string, string>;
    const keys = Array.from(SRC.matchAll(/t\(msgs, "([^"]+)"\)/g), (m) => m[1]);
    expect(keys.length).toBeGreaterThan(2);
    for (const k of new Set(keys)) {
      expect(en[k], `en ${k}`).toBeTruthy();
      expect(vi[k], `vi ${k}`).toBeTruthy();
    }
  });
});
