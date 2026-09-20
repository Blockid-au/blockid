// G20-F2 page sweep (2026-09-20): the two-column tool layouts overflowed a
// 375 px viewport by ~300 px (page-sweep overflow_375 on /tools/cap-table,
// /tools/equity-split, /tools/funding-plan, /tools/safe-calculator). Cause: a
// `grid lg:grid-cols-N` container has an implicit `auto` track below `lg`,
// which grows to the widest item's min-content — and a `<table min-w-[640px]>`
// inside an `overflow-x-auto` wrapper does not shield the grid from that.
// Fix: an explicit `grid-cols-1` base track (`minmax(0, 1fr)`) + `min-w-0`
// on every column item, so the scroll wrapper scrolls instead of the page.
// Verified with a Chromium probe: 706 px → 359 px right edge at 375 px.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const TOOLS = [
  "cap-table/cap-table-diff.tsx",
  "equity-split/equity-split-tool.tsx",
  "funding-plan/funding-plan-tool.tsx",
  "safe-calculator/safe-calculator.tsx",
  "term-sheet/term-sheet-tool.tsx",
];

describe("tools — two-column layouts survive 375 px", () => {
  for (const rel of TOOLS) {
    it(`${rel}: every lg:grid-cols-N container has a grid-cols-1 base and every lg:col-span item is min-w-0`, () => {
      const src = readFileSync(new URL(`./${rel}`, import.meta.url), "utf8");
      const grids = src.match(/className="[^"]*\bgrid\b[^"]*\blg:grid-cols-\d+\b[^"]*"/g) ?? [];
      expect(grids.length, "at least one lg two-column grid").toBeGreaterThan(0);
      for (const g of grids) expect(g, "explicit base track").toMatch(/\bgrid-cols-1\b/);
      const items = src.match(/className="[^"]*\blg:col-span-\d+\b[^"]*"/g) ?? [];
      expect(items.length).toBeGreaterThan(0);
      for (const c of items) expect(c, "column item must not grow past the track").toMatch(/\bmin-w-0\b/);
    });
  }
});
