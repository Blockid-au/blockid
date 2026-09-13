// S27-C — resolver precedence + effective dates, and the consumer wiring
// (vcBenchmark / buildVcValuationReport / MRR bridge / share price) picking
// up an approved override while proposed / rejected / future rows are
// ignored and the static table stays the fallback.

import { afterEach, describe, expect, it } from "vitest";
import {
  getSectorMultiples,
  overrideLabel,
  resolveSectorMultiples,
  setSectorMultiplesOverridesForTests,
  type SectorMultipleOverride,
} from "./sector-multiples";
import { SECTOR_KEYS, SECTOR_MULTIPLES, STATIC_SOURCE_LABEL, isSectorKey, staticArrMultiple } from "./sector-multiples-static";
import { buildVcValuationReport, growthAdjustedSectorMultiple, vcBenchmark } from "@/lib/agents/cfo-valuation";
import { applyConnectedRevenueBridge } from "@/lib/valuation-mrr-bridge";
import { computeSharePrice } from "@/lib/share-price";

function row(p: Partial<SectorMultipleOverride> & { id: string }): SectorMultipleOverride {
  return {
    sector: "saas",
    arr_low: 5,
    arr_mid: 8,
    arr_high: 11,
    effective_from: "2026-07-01",
    source_url: "https://www.saas-capital.com/the-saas-capital-index/",
    source_title: "SaaS Capital Index",
    source_published_at: "2026-06-30",
    source_excerpt: "The SaaS Capital Index median was 8.0x ARR in June 2026.",
    status: "approved",
    proposed_by: "cron",
    proposed_by_user_id: null,
    approved_by: "admin-1",
    approved_at: "2026-07-02T00:00:00Z",
    rejected_at: null,
    review_note: null,
    created_at: "2026-07-01T03:00:00Z",
    ...p,
  };
}

afterEach(() => setSectorMultiplesOverridesForTests(null));

describe("static table", () => {
  it("exposes every sector key and a default row", () => {
    expect(SECTOR_KEYS).toContain("saas");
    expect(SECTOR_KEYS).toContain("default");
    expect(isSectorKey("saas")).toBe(true);
    expect(isSectorKey("nope")).toBe(false);
    const s = staticArrMultiple("saas");
    expect(s).toEqual({ sector: "saas", low: 6.0, mid: 6.75, high: 7.5, citation: "Bessemer Venture Partners" });
    expect(staticArrMultiple("unknown-sector").sector).toBe("default");
  });
});

describe("resolveSectorMultiples — precedence", () => {
  it("no overrides → static row with the static label", () => {
    const r = resolveSectorMultiples("saas", [], "2026-09-13");
    expect(r).toMatchObject({ sector: "saas", low: 6.0, mid: 6.75, high: 7.5, sourceKind: "static", override: null });
    expect(r.sourceLabel).toBe(`${STATIC_SOURCE_LABEL} · Bessemer Venture Partners`);
    expect(r.citation).toBe(SECTOR_MULTIPLES.saas.source);
  });

  it("unknown sector resolves to default for both static and override lookups", () => {
    const def = row({ id: "d", sector: "default", arr_low: 3, arr_mid: 4, arr_high: 5 });
    const r = resolveSectorMultiples("martian-mining", [def], "2026-09-13");
    expect(r.sector).toBe("default");
    expect(r.sourceKind).toBe("override");
    expect(r.mid).toBe(4);
    expect(resolveSectorMultiples(undefined, [], "2026-09-13").sector).toBe("default");
  });

  it("only approved rows count — proposed and rejected are ignored", () => {
    const rows = [row({ id: "p", status: "proposed", arr_mid: 50 }), row({ id: "r", status: "rejected", arr_mid: 60 })];
    const r = resolveSectorMultiples("saas", rows, "2026-09-13");
    expect(r.sourceKind).toBe("static");
    expect(r.mid).toBe(6.75);
  });

  it("an approved override effective at the date wins and carries its label", () => {
    const r = resolveSectorMultiples("saas", [row({ id: "a" })], "2026-09-13");
    expect(r).toMatchObject({ sector: "saas", low: 5, mid: 8, high: 11, sourceKind: "override" });
    expect(r.sourceLabel).toBe("SaaS Capital Index, 2026-06-30");
    expect(r.override).toEqual({ id: "a", sourceUrl: "https://www.saas-capital.com/the-saas-capital-index/", effectiveFrom: "2026-07-01", approvedAt: "2026-07-02T00:00:00Z" });
  });

  it("effective_from in the future is not yet effective; `at` moves the answer", () => {
    const future = row({ id: "f", effective_from: "2026-10-01", arr_mid: 9 });
    expect(resolveSectorMultiples("saas", [future], "2026-09-13").sourceKind).toBe("static");
    expect(resolveSectorMultiples("saas", [future], "2026-10-01").mid).toBe(9);
    expect(resolveSectorMultiples("saas", [future], new Date("2026-12-25T00:00:00Z")).mid).toBe(9);
  });

  it("latest effective_from wins; same date → most recent approval wins", () => {
    const rows = [
      row({ id: "jan", effective_from: "2026-01-01", arr_mid: 7, approved_at: "2026-01-02T00:00:00Z" }),
      row({ id: "jul", effective_from: "2026-07-01", arr_mid: 8, approved_at: "2026-07-02T00:00:00Z" }),
      row({ id: "jul-again", effective_from: "2026-07-01", arr_mid: 8.5, approved_at: "2026-08-15T00:00:00Z" }),
    ];
    const r = resolveSectorMultiples("saas", rows, "2026-09-13");
    expect(r.override?.id).toBe("jul-again");
    expect(r.mid).toBe(8.5);
    // Before July only the January row is effective.
    expect(resolveSectorMultiples("saas", rows, "2026-03-01").override?.id).toBe("jan");
  });

  it("a row for another sector never leaks; an inconsistent band is skipped", () => {
    const rows = [row({ id: "fin", sector: "fintech", arr_low: 15, arr_mid: 20, arr_high: 25 }), row({ id: "bad", arr_low: 9, arr_mid: 8, arr_high: 7 })];
    expect(resolveSectorMultiples("saas", rows, "2026-09-13").sourceKind).toBe("static");
    expect(resolveSectorMultiples("fintech", rows, "2026-09-13").mid).toBe(20);
  });

  it("overrideLabel falls back to effective_from when the page has no publish date", () => {
    expect(overrideLabel({ source_title: " Aventis SaaS multiples ", source_published_at: null, effective_from: "2026-07-01" })).toBe("Aventis SaaS multiples, 2026-07-01");
  });
});

describe("getSectorMultiples — sync cache + test injection", () => {
  it("returns the static row under vitest with nothing injected", () => {
    const r = getSectorMultiples("fintech");
    expect(r.sourceKind).toBe("static");
    expect(r.mid).toBe(SECTOR_MULTIPLES.fintech.medianMultiple);
  });

  it("uses injected rows and honours `at`", () => {
    setSectorMultiplesOverridesForTests([row({ id: "a" })]);
    expect(getSectorMultiples("saas").sourceKind).toBe("override");
    expect(getSectorMultiples("saas", "2026-01-01").sourceKind).toBe("static");
  });
});

describe("consumers go through the resolver", () => {
  it("vcBenchmark: static → unchanged citation + static label; override → override band, label as source", () => {
    const s = vcBenchmark("saas");
    expect(s.multiplesSource).toBe("static");
    expect(s.source).toBe("Bessemer Venture Partners");
    expect(s.sourceLabel).toContain(STATIC_SOURCE_LABEL);
    expect(s.arrMultiple).toEqual({ low: 6.0, mid: 6.75, high: 7.5 });

    setSectorMultiplesOverridesForTests([row({ id: "a" })]);
    const o = vcBenchmark("saas");
    expect(o.multiplesSource).toBe("override");
    expect(o.arrMultiple).toEqual({ low: 5, mid: 8, high: 11 });
    expect(o.multipleRange).toEqual([5, 11]);
    expect(o.medianMultiple).toBe(8);
    expect(o.source).toBe("SaaS Capital Index, 2026-06-30");
    expect(o.sources).toEqual(["SaaS Capital Index, 2026-06-30", "https://www.saas-capital.com/the-saas-capital-index/"]);
    // other sectors untouched
    expect(vcBenchmark("fintech").multiplesSource).toBe("static");
  });

  it("buildVcValuationReport: the revenue-multiple method + notes carry the label, and the band moves with the override", () => {
    const input = { sector: "saas", stage: "seed", mrrAud: 50_000, monthlyGrowthRatePct: 5 };
    const before = buildVcValuationReport(input);
    const rm = before.methods.find((m) => m.method === "revenue_multiple")!;
    expect(rm.rationale).toContain(`Multiples: ${STATIC_SOURCE_LABEL}`);
    expect(before.notes.some((n) => n.includes(STATIC_SOURCE_LABEL))).toBe(true);
    expect(rm.lowAud).toBe(Math.round(600_000 * 6.0));

    setSectorMultiplesOverridesForTests([row({ id: "a" })]);
    const after = buildVcValuationReport(input);
    const rm2 = after.methods.find((m) => m.method === "revenue_multiple")!;
    expect(rm2.rationale).toContain("Multiples: SaaS Capital Index, 2026-06-30");
    expect(rm2.lowAud).toBe(Math.round(600_000 * 5));
    expect(rm2.highAud).toBe(Math.round(600_000 * 11));
    expect(after.sources).toContain("sector-multiples: SaaS Capital Index, 2026-06-30");
  });

  it("growthAdjustedSectorMultiple: static keeps the growth-band table; an override scales off the cited band", () => {
    expect(growthAdjustedSectorMultiple("saas", 5)).toMatchObject({ low: 9.0, mid: 12.0, high: 15.0, band: "high" });
    setSectorMultiplesOverridesForTests([row({ id: "a" })]);
    const g = growthAdjustedSectorMultiple("saas", 5);
    expect(g).toMatchObject({ low: 7, mid: 11.2, high: 15.4, band: "high", source: "SaaS Capital Index, 2026-06-30" });
  });

  it("MRR bridge: static → methodNote untouched; override → note names the source", () => {
    const svi = { lowAud: 1_000_000, midAud: 3_000_000, highAud: 5_000_000 };
    const now = new Date("2026-09-13T00:00:00Z");
    const sig = [{ provider: "stripe" as const, mrrAud: 50_000, capturedAt: "2026-09-01T00:00:00Z" }];
    const s = applyConnectedRevenueBridge(svi, sig, { sector: "saas", now });
    expect(s.methodNote).toBeNull();
    expect(s.connectedRevenue?.multiplesSource).toBe("static");
    expect(s.connectedRevenue?.multipleSourceLabel).toContain(STATIC_SOURCE_LABEL);

    setSectorMultiplesOverridesForTests([row({ id: "a" })]);
    const o = applyConnectedRevenueBridge(svi, sig, { sector: "saas", now });
    expect(o.connectedRevenue?.multiplesSource).toBe("override");
    expect(o.connectedRevenue?.multipleLow).toBe(5);
    expect(o.connectedRevenue?.multipleHigh).toBe(11);
    expect(o.connectedRevenue?.multipleSource).toBe("SaaS Capital Index, 2026-06-30");
    expect(o.methodNote).toContain("sector multiples from SaaS Capital Index, 2026-06-30");
  });

  it("share price: the multiple block and the method note carry the override citation", () => {
    setSectorMultiplesOverridesForTests([row({ id: "a" })]);
    const r = computeSharePrice({ svi: 120, stage: "validation", sector: "saas", arrAud: 240_000, fullyDilutedShares: 1_000_000 });
    expect(r.multiple).toMatchObject({ sector: "saas", low: 5, mid: 8, high: 11, multiplesSource: "override", source: "SaaS Capital Index, 2026-06-30" });
    expect(r.methodNote).toContain("(SaaS Capital Index, 2026-06-30)");
  });
});
