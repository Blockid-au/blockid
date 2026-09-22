// Unit pins for lib/startup-index-movers.ts (G29 lane D, 2026-09-22).
//
// The 2026-09-21 UX check on /startup-index found two artefacts from one
// root cause: "losers" was the same movers[] sorted ascending (so a lone
// +100 mover was printed under "Biggest drops"), and a day with no close
// was compared against a filler (so the hero printed "−99.0 1d"). These
// pins hold the rule: no prior close → "new"; gainers positive only; drops
// negative only; ties / NaN excluded.

import { describe, expect, it } from "vitest";
import { deltaOrNull, formatDelta, moversFor, type MoverInput } from "./startup-index-movers";

const m = (ticker: string, svi: number, priorSvi: number | null | undefined, sector = "saas"): MoverInput => ({
  ticker,
  slug: ticker.toLowerCase(),
  sector,
  svi,
  priorSvi,
});

describe("moversFor — the 2026-09-21 case", () => {
  it("a single +100 mover (35 → 135) is a winner and 'Biggest drops' is empty", () => {
    const out = moversFor([m("SAAS-KKF", 135, 35)]);
    expect(out.winners).toEqual([{ ticker: "SAAS-KKF", slug: "saas-kkf", sector: "saas", svi: 135, deltaWeek: 100 }]);
    expect(out.losers).toEqual([]);
    expect(out.newListings).toEqual([]);
  });

  it("a row with no prior close is 'new' — no Δ, never −99 / −100 / +100", () => {
    const out = moversFor([m("SAAS-NEW", 1, null), m("AI-UND", 87, undefined), m("FINT-NAN", 60, Number.NaN)]);
    expect(out.winners).toEqual([]);
    expect(out.losers).toEqual([]);
    expect(out.newListings.map((n) => n.ticker)).toEqual(["SAAS-NEW", "AI-UND", "FINT-NAN"]);
    expect(out.newListings.every((n) => !("deltaWeek" in n))).toBe(true);
  });
});

describe("moversFor — rule", () => {
  it("gainers = top positive Δ (desc); drops = top NEGATIVE Δ only (asc); a positive mover can never be a drop", () => {
    const out = moversFor([
      m("A", 180, 100), // +80
      m("B", 50, 200), // −150
      m("C", 110, 100), // +10
      m("D", 90, 100), // −10
    ]);
    expect(out.winners.map((x) => x.deltaWeek)).toEqual([80, 10]);
    expect(out.losers.map((x) => x.deltaWeek)).toEqual([-150, -10]);
    expect(out.losers.every((x) => x.deltaWeek < 0)).toBe(true);
    expect(out.winners.every((x) => x.deltaWeek > 0)).toBe(true);
  });

  it("ties (|Δ| under the noise floor) are in neither list and are not 'new'", () => {
    const out = moversFor([m("T0", 100, 100), m("T1", 100.4, 100), m("T2", 99.6, 100)]);
    expect(out.winners).toEqual([]);
    expect(out.losers).toEqual([]);
    expect(out.newListings).toEqual([]);
  });

  it("non-finite closes are dropped entirely (not listed, not 'new')", () => {
    const out = moversFor([m("NAN", Number.NaN, 100), m("INF", Number.POSITIVE_INFINITY, 100), m("OK", 120, 100)]);
    expect(out.winners.map((x) => x.ticker)).toEqual(["OK"]);
    expect(out.newListings).toEqual([]);
  });

  it("caps each list at `limit` (default 5) independently", () => {
    const rows: MoverInput[] = [];
    for (let i = 0; i < 8; i++) rows.push(m(`W${i}`, 200 + i, 50));
    for (let i = 0; i < 8; i++) rows.push(m(`L${i}`, 50, 200 + i));
    const out = moversFor(rows);
    expect(out.winners).toHaveLength(5);
    expect(out.losers).toHaveLength(5);
    expect(moversFor(rows, { limit: 3 }).winners).toHaveLength(3);
    expect(moversFor(rows, { limit: 0 }).losers).toHaveLength(0);
  });

  it("is deterministic on equal Δ (ticker order) and independent of input order", () => {
    const a = moversFor([m("Z", 110, 100), m("A", 110, 100), m("M", 110, 100)]);
    const b = moversFor([m("M", 110, 100), m("A", 110, 100), m("Z", 110, 100)]);
    expect(a.winners.map((x) => x.ticker)).toEqual(["A", "M", "Z"]);
    expect(b).toEqual(a);
  });

  it("honours a custom noise floor", () => {
    expect(moversFor([m("A", 103, 100)], { noiseFloor: 5 }).winners).toEqual([]);
    expect(moversFor([m("A", 103, 100)], { noiseFloor: 0 }).winners).toHaveLength(1);
  });
});

describe("deltaOrNull", () => {
  it("returns the difference for two finite closes, null otherwise", () => {
    expect(deltaOrNull(130, 100)).toBe(30);
    expect(deltaOrNull(1, 100)).toBe(-99); // a real prior close of 100 IS a −99 move
    expect(deltaOrNull(1, null)).toBeNull(); // …but a filler is not a close
    expect(deltaOrNull(1, undefined)).toBeNull();
    expect(deltaOrNull(null, 100)).toBeNull();
    expect(deltaOrNull(Number.NaN, 100)).toBeNull();
    expect(deltaOrNull(100, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("formatDelta", () => {
  it("prints signed one-decimal text with a true minus, and 'new' for null", () => {
    expect(formatDelta(8)).toBe("+8.0");
    expect(formatDelta(-6.55)).toBe("−6.5");
    expect(formatDelta(0)).toBe("0.0");
    expect(formatDelta(null)).toBe("new");
    expect(formatDelta(undefined, { newLabel: "mới" })).toBe("mới");
    expect(formatDelta(100, { digits: 0 })).toBe("+100");
  });
});
