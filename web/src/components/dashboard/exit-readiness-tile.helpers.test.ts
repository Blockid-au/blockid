// Pure helper tests for <ExitReadinessTile />.
//
// The tile itself is an RSC that projects `ExitBenchmarkSection` into
// static markup, so branch coverage lives on these helpers.

import { describe, it, expect } from "vitest";
import {
  BUYER_TYPE_LABEL,
  BUYER_TYPE_ORDER,
  formatAudCompact,
  formatMultiple,
  orderedBuyerTypeEntries,
} from "./exit-readiness-tile.helpers";
import type { AuExitBuyerType } from "@/lib/exits/au-benchmark";

describe("formatAudCompact", () => {
  it("collapses null / undefined / NaN to em-dash so the tile never renders NaN", () => {
    expect(formatAudCompact(null)).toBe("—");
    expect(formatAudCompact(undefined)).toBe("—");
    expect(formatAudCompact(Number.NaN)).toBe("—");
    expect(formatAudCompact(Number.POSITIVE_INFINITY)).toBe("—");
  });

  it("renders billions with one-digit precision", () => {
    expect(formatAudCompact(39_000_000_000)).toBe("A$39.0B");
    expect(formatAudCompact(3_300_000_000)).toBe("A$3.3B");
  });

  it("renders millions as whole A$M", () => {
    expect(formatAudCompact(400_000_000)).toBe("A$400M");
    expect(formatAudCompact(1_000_000)).toBe("A$1M");
  });

  it("renders sub-A$M values as A$k or raw integers", () => {
    expect(formatAudCompact(50_000)).toBe("A$50k");
    expect(formatAudCompact(950)).toBe("A$950");
    expect(formatAudCompact(0)).toBe("A$0");
  });
});

describe("formatMultiple", () => {
  it("null / non-finite / non-positive collapses to em-dash", () => {
    expect(formatMultiple(null)).toBe("—");
    expect(formatMultiple(undefined)).toBe("—");
    expect(formatMultiple(Number.NaN)).toBe("—");
    expect(formatMultiple(0)).toBe("—");
    expect(formatMultiple(-3)).toBe("—");
  });

  it("large multiples render as whole numbers", () => {
    expect(formatMultiple(42)).toBe("42x");
    expect(formatMultiple(10)).toBe("10x");
  });

  it("small multiples keep one decimal so 1.4x doesn't round to 1x", () => {
    expect(formatMultiple(1.4)).toBe("1.4x");
    expect(formatMultiple(9.9)).toBe("9.9x");
  });
});

describe("BUYER_TYPE_ORDER + BUYER_TYPE_LABEL", () => {
  it("covers every AuExitBuyerType exactly once", () => {
    const seen = new Set<AuExitBuyerType>(BUYER_TYPE_ORDER);
    expect(seen.size).toBe(BUYER_TYPE_ORDER.length);
    for (const k of BUYER_TYPE_ORDER) {
      expect(BUYER_TYPE_LABEL[k]).toBeTruthy();
    }
  });

  it("leads with strategic + IPO (the two paths AU founders anchor on first)", () => {
    expect(BUYER_TYPE_ORDER[0]).toBe("strategic");
    expect(BUYER_TYPE_ORDER[1]).toBe("ipo");
  });

  it("puts secondary last (liquidity event, not a company exit)", () => {
    expect(BUYER_TYPE_ORDER[BUYER_TYPE_ORDER.length - 1]).toBe("secondary");
  });
});

describe("orderedBuyerTypeEntries", () => {
  it("drops zero-count buckets and returns entries in the stable order", () => {
    const entries = orderedBuyerTypeEntries({
      strategic: 3,
      pe: 0,
      ipo: 2,
      secondary: 1,
      financial: 0,
    });
    expect(entries).toEqual([
      ["strategic", 3],
      ["ipo", 2],
      ["secondary", 1],
    ]);
  });

  it("returns [] when every bucket is zero", () => {
    const entries = orderedBuyerTypeEntries({
      strategic: 0,
      pe: 0,
      ipo: 0,
      secondary: 0,
      financial: 0,
    });
    expect(entries).toEqual([]);
  });
});
