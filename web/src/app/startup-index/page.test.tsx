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

// G29 lane D (2026-09-22): the movers panels and hero deltas print only what
// lib/startup-index-movers.ts hands them — "new" for no prior close, "—" for
// a day with no close, a "Sample data" chip while n < 30 — and never a raw
// `+{m.deltaWeek}` / `{delta.toFixed(1)}` that could show −99.0 or a +100
// drop.
describe("/startup-index movers + hero deltas (G29-D)", () => {
  it("prints every Δ through formatDelta (no raw +{m.deltaWeek} / toFixed)", () => {
    expect(src).toContain('import { formatDelta } from "@/lib/startup-index-movers"');
    expect(src).not.toMatch(/\+\{m\.deltaWeek\}/);
    expect(src).not.toMatch(/delta\.toFixed\(/);
    expect(src).toContain("{formatDelta(m.deltaWeek)}");
  });
  it("hero DeltaPill accepts null (no prior close) and prints an em dash with the reason", () => {
    expect(src).toMatch(/function DeltaPill\(\{ delta, suffix = "", noPriorLabel \}: \{ delta: number \| null;/);
    expect(src).toContain('data-testid="delta-no-prior"');
    expect(src).toContain('t(msgs, "index.movers.noPriorClose.note")');
  });
  it("labels the hero and both movers panels as sample data while the set is below the benchmark band", () => {
    expect((src.match(/data\.isSample \? <SampleChip/g) ?? []).length).toBe(2);
    expect(src).toContain('data-testid="index-sample-note"');
    expect(src).toContain('t(msgs, "index.sample.chip")');
  });
  it("renders the new-listings strip from topMovers.newListings without any Δ", () => {
    const at = src.indexOf('data-testid="new-listings"');
    expect(at).toBeGreaterThan(0);
    const strip = src.slice(at, src.indexOf("STAGE INDICES", at));
    expect(strip).toContain("data.topMovers.newListings");
    expect(strip).not.toContain("deltaWeek");
    expect(strip).toContain('t(msgs, "index.movers.new")');
  });
  it("copy keys used on the page exist in both catalogues", async () => {
    const en = (await import("@/lib/i18n/messages/en.json")).default as Record<string, string>;
    const vi = (await import("@/lib/i18n/messages/vi.json")).default as Record<string, string>;
    const keys = Array.from(src.matchAll(/t\(msgs, "([^"]+)"\)/g), (m) => m[1]);
    expect(keys.length).toBeGreaterThan(5);
    for (const k of new Set(keys)) {
      expect(en[k], `en ${k}`).toBeTruthy();
      expect(vi[k], `vi ${k}`).toBeTruthy();
    }
  });
});
