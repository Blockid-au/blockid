import { describe, expect, it } from "vitest";
import {
  computeTierMix,
  computeTierMixByReseller,
  formatWeeklyDigestTierMixSection,
  TIER_BUCKETS,
  type TierMixAttributionRow,
  type TierMixRow,
} from "./tier-mix";

function attr(reseller_id: string, tier_pct: number | null): TierMixAttributionRow {
  return { reseller_id, tier_pct };
}

describe("TIER_BUCKETS", () => {
  it("locks the wholesale-tier ladder to [0,10,20,30,40]", () => {
    expect(TIER_BUCKETS).toEqual([0, 10, 20, 30, 40]);
  });
});

describe("computeTierMix", () => {
  it("returns zeroed buckets + zero total when no rows are supplied", () => {
    const m = computeTierMix([]);
    expect(m.total).toBe(0);
    expect(m.none).toBe(0);
    for (const b of TIER_BUCKETS) expect(m.counts[b]).toBe(0);
  });

  it("counts each known-tier row into its bucket", () => {
    const m = computeTierMix([
      attr("r1", 0),
      attr("r1", 0),
      attr("r1", 10),
      attr("r1", 20),
      attr("r1", 40),
    ]);
    expect(m.counts[0]).toBe(2);
    expect(m.counts[10]).toBe(1);
    expect(m.counts[20]).toBe(1);
    expect(m.counts[30]).toBe(0);
    expect(m.counts[40]).toBe(1);
    expect(m.none).toBe(0);
    expect(m.total).toBe(5);
  });

  it("classifies null tier_pct (no promo code) into the none bucket", () => {
    const m = computeTierMix([attr("r1", null), attr("r1", null)]);
    expect(m.none).toBe(2);
    expect(m.total).toBe(2);
    for (const b of TIER_BUCKETS) expect(m.counts[b]).toBe(0);
  });

  it("classifies off-ladder tiers (e.g. 15) into the none bucket rather than dropping them", () => {
    const m = computeTierMix([attr("r1", 15), attr("r1", 25)]);
    expect(m.none).toBe(2);
    expect(m.total).toBe(2);
  });

  it("classifies NaN + Infinity tier_pct into the none bucket without crashing", () => {
    const m = computeTierMix([
      attr("r1", Number.NaN),
      attr("r1", Number.POSITIVE_INFINITY),
    ]);
    expect(m.none).toBe(2);
    expect(m.total).toBe(2);
  });

  it("preserves the total = sum(buckets) + none invariant across mixed inputs", () => {
    const rows: TierMixAttributionRow[] = [
      attr("r1", 0),
      attr("r1", 20),
      attr("r1", 40),
      attr("r1", null),
      attr("r1", 15),
    ];
    const m = computeTierMix(rows);
    const bucketSum = TIER_BUCKETS.reduce<number>((acc, b) => acc + m.counts[b], 0);
    expect(bucketSum + m.none).toBe(m.total);
    expect(m.total).toBe(rows.length);
  });
});

describe("computeTierMixByReseller", () => {
  it("returns one TierMix per requested reseller id, even when the reseller has zero attributions", () => {
    const out = computeTierMixByReseller(["r1", "r2", "r3"], [
      attr("r1", 20),
      attr("r2", 10),
      attr("r2", 40),
    ]);
    expect(out.size).toBe(3);
    expect(out.get("r1")?.total).toBe(1);
    expect(out.get("r2")?.total).toBe(2);
    expect(out.get("r3")?.total).toBe(0);
  });

  it("groups rows by reseller_id without leaking across partners", () => {
    const out = computeTierMixByReseller(["r1", "r2"], [
      attr("r1", 0),
      attr("r2", 20),
      attr("r2", 20),
    ]);
    expect(out.get("r1")?.counts[0]).toBe(1);
    expect(out.get("r1")?.counts[20]).toBe(0);
    expect(out.get("r2")?.counts[20]).toBe(2);
    expect(out.get("r2")?.counts[0]).toBe(0);
  });

  it("ignores attribution rows whose reseller_id is not in the requested list", () => {
    const out = computeTierMixByReseller(["r1"], [
      attr("r1", 10),
      attr("r-orphan", 20),
    ]);
    expect(out.size).toBe(1);
    expect(out.get("r1")?.total).toBe(1);
  });
});

function tierMixRow(code: string, display: string, seed: TierMixAttributionRow[]): TierMixRow {
  return {
    reseller_id: `rid-${code.toLowerCase()}`,
    reseller_code: code,
    reseller_display_name: display,
    mix: computeTierMix(seed),
  };
}

describe("formatWeeklyDigestTierMixSection", () => {
  it("returns an empty string when no rows are supplied", () => {
    expect(formatWeeklyDigestTierMixSection([])).toBe("");
  });

  it("renders the section header and column headers", () => {
    const html = formatWeeklyDigestTierMixSection([
      tierMixRow("ALPHA", "Alpha", [attr("rid-alpha", 0)]),
    ]);
    expect(html).toContain("Tier mix");
    expect(html).toContain("reseller_promotion_codes.tier_pct");
    for (const b of TIER_BUCKETS) expect(html).toContain(`>${b}%<`);
    expect(html).toContain(">none<");
    expect(html).toContain(">total<");
  });

  it("sorts rows by reseller_code alphabetically", () => {
    const html = formatWeeklyDigestTierMixSection([
      tierMixRow("ZULU", "Zulu", [attr("rid-zulu", 40)]),
      tierMixRow("ALPHA", "Alpha", [attr("rid-alpha", 0)]),
    ]);
    expect(html.indexOf("ALPHA")).toBeLessThan(html.indexOf("ZULU"));
  });

  it("HTML-escapes hostile display names so a bad row cannot inject markup", () => {
    const html = formatWeeklyDigestTierMixSection([
      tierMixRow("XSS", "<script>alert(1)</script>", [attr("rid-xss", 0)]),
    ]);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert");
  });

  it("renders the total in a <strong> cell so it stands out from bucket cells", () => {
    const html = formatWeeklyDigestTierMixSection([
      tierMixRow("ALPHA", "Alpha", [
        attr("rid-alpha", 0),
        attr("rid-alpha", 20),
        attr("rid-alpha", null),
      ]),
    ]);
    expect(html).toContain("<strong>3</strong>");
  });

  it("renders every bucket column even when the count is zero", () => {
    const html = formatWeeklyDigestTierMixSection([
      tierMixRow("ONLYZERO", "Only Zero", [attr("rid-onlyzero", 0)]),
    ]);
    // code + display_name + 5 bucket cells + none + total = 9 <td> per row.
    const cellCount = (html.match(/<td[\s>]/g) ?? []).length;
    expect(cellCount).toBe(TIER_BUCKETS.length + 4);
  });
});
