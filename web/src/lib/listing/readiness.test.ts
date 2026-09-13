// Colocated suite for the listing readiness checker (S29-A).
//
// Pins: every ASX and Nasdaq row in its met / not_met / not_confirmed
// shape, the spread maths at the A$2,000 parcel boundary (inclusive, cent
// rounded), free-float maths (affiliated roles + restricted ids), the
// Nasdaq public-holding maths (10 % insider line, round lot, US$2,500
// nuance), score maths (not_confirmed and confirm_current_rule counted
// separately), the source / as-at stamps on every row, and the copy rules
// (indicator not advice, no invented figures — "not recorded" when a fact
// is absent).

import { describe, expect, it } from "vitest";
import {
  ASX_RULES_AS_AT,
  buildAsxChecklist,
  buildListingReadiness,
  buildNasdaqChecklist,
  computeFreeFloat,
  computeNasdaqPublic,
  computeSpread,
  emptyListingFacts,
  formatAud,
  formatUsd,
  isExchange,
  LISTING_READINESS_NOTE,
  NASDAQ_RULES_AS_AT,
  scoreReadiness,
  statusLabel,
  type CapTableHolder,
  type ListingFacts,
} from "./readiness";

function holder(over: Partial<CapTableHolder> & { sharesHeld: number }): CapTableHolder {
  return { id: null, name: "Holder", role: "investor", ...over };
}

/** n identical public holders, each with `shares`. */
function publicHolders(n: number, shares: number, start = 0): CapTableHolder[] {
  return Array.from({ length: n }, (_, i) => holder({ id: `00000000-0000-4000-8000-${String(start + i).padStart(12, "0")}`, name: `Investor ${start + i}`, sharesHeld: shares }));
}

function facts(over: Partial<ListingFacts> = {}): ListingFacts {
  return { ...emptyListingFacts(), ...over };
}

const byId = (rows: ReturnType<typeof buildAsxChecklist>) => Object.fromEntries(rows.map((r) => [r.id, r]));

describe("computeSpread — A$2,000 parcel boundary", () => {
  it("counts a parcel worth exactly A$2,000 (1,000 × A$2.00) and excludes one cent under", () => {
    const holders = [
      holder({ name: "Exactly", sharesHeld: 1_000 }),
      holder({ name: "Under", sharesHeld: 999 }),
      holder({ name: "Founder", role: "founder", sharesHeld: 5_000_000 }),
    ];
    const r = computeSpread(holders, 2);
    expect(r).toEqual({ holders: 3, nonAffiliated: 2, qualifying: 1, belowParcel: 1, priceAud: 2 });
  });

  it("rounds to the cent so floating-point products at the boundary still qualify", () => {
    // 3 × 666.6667 ≈ 2000.0001 → 2000.00; 1.1 × 1818.18 = 1999.998 → 2000.00.
    const r = computeSpread([holder({ sharesHeld: 3 })], 666.6667);
    expect(r.qualifying).toBe(1);
    expect(computeSpread([holder({ sharesHeld: 1818.18 })], 1.1).qualifying).toBe(1);
    expect(computeSpread([holder({ sharesHeld: 1818 })], 1.1).qualifying).toBe(0);
  });

  it("no price → nothing qualifies but the non-affiliated count is still reported; restricted ids and affiliated roles are excluded", () => {
    const holders = [...publicHolders(2, 10_000), holder({ id: "11111111-1111-4111-8111-111111111111", name: "Related", sharesHeld: 10_000 }), holder({ role: "Director", sharesHeld: 10_000 }), holder({ role: "esop", sharesHeld: 500 })];
    expect(computeSpread(holders, null, ["11111111-1111-4111-8111-111111111111"])).toEqual({ holders: 5, nonAffiliated: 2, qualifying: 0, belowParcel: 2, priceAud: null });
    expect(computeSpread(holders, 1, ["11111111-1111-4111-8111-111111111111"]).qualifying).toBe(2);
  });

  it("ignores zero-share rows", () => {
    expect(computeSpread([holder({ sharesHeld: 0 })], 5)).toEqual({ holders: 0, nonAffiliated: 0, qualifying: 0, belowParcel: 0, priceAud: 5 });
  });
});

describe("computeFreeFloat", () => {
  it("non-affiliated shares ÷ issued shares; ESOP and restricted rows excluded; empty → null", () => {
    const holders = [holder({ role: "founder", sharesHeld: 700_000 }), holder({ sharesHeld: 200_000 }), holder({ role: "co-founder", sharesHeld: 50_000 }), holder({ role: "esop", sharesHeld: 50_000 })];
    expect(computeFreeFloat(holders)).toEqual({ issuedShares: 1_000_000, freeFloatShares: 200_000, pct: 20 });
    expect(computeFreeFloat([])).toEqual({ issuedShares: 0, freeFloatShares: 0, pct: null });
    const restricted = holder({ id: "22222222-2222-4222-8222-222222222222", sharesHeld: 100_000 });
    expect(computeFreeFloat([restricted, holder({ sharesHeld: 100_000 })], [restricted.id!]).pct).toBe(50);
  });
});

describe("computeNasdaqPublic", () => {
  it("excludes ≥ 10 % holders, counts round lots of 100+ and the US$2,500 minimum-value nuance", () => {
    // Issued 1,000,000: whale 150,000 (15 % → excluded), 300 holders × 2,500 (0.25 % each), one 50-share holder, founder rest.
    const holders = [holder({ name: "Whale", sharesHeld: 150_000 }), ...publicHolders(300, 2_500), holder({ name: "Odd lot", sharesHeld: 50 }), holder({ role: "founder", sharesHeld: 99_950 })];
    const r = computeNasdaqPublic(holders, 1);
    expect(r.unrestrictedPublicShares).toBe(750_050);
    expect(r.roundLotHolders).toBe(300);
    expect(r.roundLotHoldersAboveMinValue).toBe(300); // 2,500 × US$1 = US$2,500 — inclusive
    expect(computeNasdaqPublic(holders, 0.99).roundLotHoldersAboveMinValue).toBe(0);
    expect(computeNasdaqPublic(holders, null).roundLotHoldersAboveMinValue).toBe(0);
  });
});

describe("buildAsxChecklist", () => {
  it("every row carries the rule, source and as-at stamp; empty facts → nothing is invented", () => {
    const rows = buildAsxChecklist(facts());
    expect(rows.map((r) => r.id)).toEqual([
      "asx.spread",
      "asx.free-float",
      "asx.profit-test",
      "asx.assets-test",
      "asx.audited-accounts",
      "asx.issue-price",
      "asx.constitution",
      "asx.escrow",
      "asx.governance-statement",
      "asx.director-checks",
      "asx.currency",
    ]);
    for (const r of rows) {
      expect(r.exchange).toBe("asx");
      expect(r.rule.length).toBeGreaterThan(3);
      expect(r.sourceRef).toContain("ASX Listing Rules");
      expect(r.asAt).toBe(ASX_RULES_AS_AT);
      expect(r.basis.length).toBeGreaterThan(10);
      if (r.status !== "met") expect(r.nextStep).toBeTruthy();
    }
    const m = byId(rows);
    expect(m["asx.spread"].status).toBe("not_met"); // 0 holders is decidable
    expect(m["asx.spread"].basis).toContain("no share price on file");
    expect(m["asx.free-float"].status).toBe("not_confirmed");
    expect(m["asx.profit-test"].status).toBe("not_confirmed");
    expect(m["asx.profit-test"].basis).toContain("not recorded");
    expect(m["asx.assets-test"].status).toBe("not_confirmed");
    expect(m["asx.audited-accounts"].status).toBe("not_confirmed");
    expect(m["asx.issue-price"].status).toBe("not_confirmed");
    expect(m["asx.constitution"].status).toBe("not_confirmed");
    expect(m["asx.escrow"].status).toBe("confirm_current_rule");
    expect(m["asx.governance-statement"].status).toBe("not_confirmed");
    expect(m["asx.director-checks"].status).toBe("not_confirmed");
    expect(m["asx.currency"].status).toBe("confirm_current_rule");
  });

  it("spread: 300 qualifying holders at the parcel price → met; 299 → not_met with the count in the next step", () => {
    const ok = buildAsxChecklist(facts({ holders: [holder({ role: "founder", sharesHeld: 10_000_000 }), ...publicHolders(300, 1_000)], sharePriceAud: 2 }));
    expect(byId(ok)["asx.spread"].status).toBe("met");
    expect(byId(ok)["asx.spread"].basis).toContain("300 of 300 non-affiliated holders");
    expect(byId(ok)["asx.spread"].nextStep).toBeNull();
    const short = buildAsxChecklist(facts({ holders: [holder({ role: "founder", sharesHeld: 10_000_000 }), ...publicHolders(299, 1_000), holder({ name: "Small", sharesHeld: 999 })], sharePriceAud: 2 }));
    expect(byId(short)["asx.spread"].status).toBe("not_met");
    expect(byId(short)["asx.spread"].basis).toContain("299 of 300 non-affiliated holders");
    expect(byId(short)["asx.spread"].basis).toContain("1 below the parcel minimum");
    expect(byId(short)["asx.spread"].nextStep).toContain("you have 299");
    // No price but ≥ 300 non-affiliated → not confirmed (count is there, parcel value is not).
    const noPrice = buildAsxChecklist(facts({ holders: publicHolders(300, 1) }));
    expect(byId(noPrice)["asx.spread"].status).toBe("not_confirmed");
    // A proposed issue price overrides the share price mid.
    const proposed = buildAsxChecklist(facts({ holders: publicHolders(300, 1_000), sharePriceAud: 1, profile: { proposed_issue_price_aud: 2 } }));
    expect(byId(proposed)["asx.spread"].status).toBe("met");
    expect(byId(proposed)["asx.spread"].basis).toContain("proposed issue price");
  });

  it("free float: 20 % exactly → met, 19.9 % → not_met", () => {
    const met = buildAsxChecklist(facts({ holders: [holder({ role: "founder", sharesHeld: 800_000 }), holder({ sharesHeld: 200_000 })] }));
    expect(byId(met)["asx.free-float"].status).toBe("met");
    expect(byId(met)["asx.free-float"].basis).toContain("200,000 of 1,000,000 issued shares (20 %)");
    const notMet = buildAsxChecklist(facts({ holders: [holder({ role: "founder", sharesHeld: 801_000 }), holder({ sharesHeld: 199_000 })] }));
    expect(byId(notMet)["asx.free-float"].status).toBe("not_met");
    expect(byId(notMet)["asx.free-float"].nextStep).toContain("at least 20 %");
  });

  it("profit test: three entered FYs ≥ A$1m aggregate and last 12 months ≥ A$500k → met; a failing leg → not_met; partial → not_confirmed unless a known leg already fails", () => {
    const three = [
      { fy: "FY2024", profit_aud: 200_000 },
      { fy: "FY2025", profit_aud: 300_000 },
      { fy: "FY2026", profit_aud: 500_000 },
    ];
    const met = byId(buildAsxChecklist(facts({ profile: { profit_by_fy: three } })))["asx.profit-test"];
    expect(met.status).toBe("met");
    expect(met.basis).toContain("3-year aggregate A$1,000,000");
    expect(met.basis).toContain("last 12 months A$500,000 from FY2026 profit as entered");
    // Bank-line profit outranks the entered FY for the 12-month leg.
    const bank = byId(buildAsxChecklist(facts({ profile: { profit_by_fy: three }, profitLast12mAud: 499_999.99, profitCoverageMonths: 14 })))["asx.profit-test"];
    expect(bank.status).toBe("not_met");
    expect(bank.basis).toContain("categorised bank lines (14 months of coverage)");
    // Two FYs only, but the 12-month leg passes → not confirmed.
    expect(byId(buildAsxChecklist(facts({ profile: { profit_by_fy: three.slice(1) } })))["asx.profit-test"].status).toBe("not_confirmed");
    // Two FYs and a failing 12-month leg → not met.
    expect(byId(buildAsxChecklist(facts({ profile: { profit_by_fy: three.slice(1) }, profitLast12mAud: 10_000, profitCoverageMonths: 12 })))["asx.profit-test"].status).toBe("not_met");
    // Loss-making three years → not met.
    expect(byId(buildAsxChecklist(facts({ profile: { profit_by_fy: three.map((r) => ({ ...r, profit_aud: -r.profit_aud })) } })))["asx.profit-test"].status).toBe("not_met");
  });

  it("assets test: NTA or market cap leg plus working capital; missing legs → not_confirmed; failing → not_met", () => {
    const viaNta = byId(buildAsxChecklist(facts({ profile: { nta_after_raise_aud: 4_000_000, working_capital_aud: 1_500_000, balance_sheet_confirmed_at: "2026-08-31" } })))["asx.assets-test"];
    expect(viaNta.status).toBe("met");
    expect(viaNta.basis).toContain("NTA after raising costs A$4,000,000 (entered, confirmed 2026-08-31)");
    expect(viaNta.basis).toContain("market capitalisation not computable");
    const viaCap = byId(buildAsxChecklist(facts({ holders: publicHolders(1, 10_000_000), sharePriceAud: 1.5, profile: { working_capital_aud: 2_000_000, nta_after_raise_aud: 100 } })))["asx.assets-test"];
    expect(viaCap.status).toBe("met");
    expect(viaCap.basis).toContain("10,000,000 shares × A$1.50 = A$15,000,000");
    const lowWc = byId(buildAsxChecklist(facts({ profile: { nta_after_raise_aud: 5_000_000, working_capital_aud: 1_499_999 } })))["asx.assets-test"];
    expect(lowWc.status).toBe("not_met");
    const bothSmall = byId(buildAsxChecklist(facts({ holders: publicHolders(1, 1_000_000), sharePriceAud: 1, profile: { nta_after_raise_aud: 1_000_000, working_capital_aud: 2_000_000 } })))["asx.assets-test"];
    expect(bothSmall.status).toBe("not_met");
    const ntaOnly = byId(buildAsxChecklist(facts({ profile: { nta_after_raise_aud: 5_000_000 } })))["asx.assets-test"];
    expect(ntaOnly.status).toBe("not_confirmed");
    expect(ntaOnly.basis).toContain("working capital not recorded");
    const entered = byId(buildAsxChecklist(facts({ profile: { expected_market_cap_aud: 20_000_000, working_capital_aud: 2_000_000, nta_after_raise_aud: 0 } })))["asx.assets-test"];
    expect(entered.status).toBe("met");
    expect(entered.basis).toContain("expected market capitalisation A$20,000,000 (entered)");
  });

  it("audited accounts: 2 FYs for the assets path, 3 for the profit path; none → not_confirmed; too few → not_met; young company note", () => {
    expect(byId(buildAsxChecklist(facts({ profile: { audited_accounts_fys: ["FY2025", "FY2026"] } })))["asx.audited-accounts"].status).toBe("met");
    const profitPath = byId(buildAsxChecklist(facts({ profile: { asx_test: "profit", audited_accounts_fys: ["FY2025", "FY2026"] } })))["asx.audited-accounts"];
    expect(profitPath.status).toBe("not_met");
    expect(profitPath.rule).toBe("ASX LR 1.2.3");
    expect(profitPath.label).toContain("last 3 full financial years");
    const young = byId(buildAsxChecklist(facts({ incorporatedAt: "2025-11-01" })))["asx.audited-accounts"];
    expect(young.status).toBe("not_confirmed");
    expect(young.basis).toContain("ASX may accept a shorter audited period");
    expect(byId(buildAsxChecklist(facts({ profile: { audited_accounts_confirmed_at: "2026-09-01" } })))["asx.audited-accounts"].status).toBe("not_met");
  });

  it("issue price: 20 cents inclusive; constitution / governance / director rows follow the ticked dates; escrow depends on the test path", () => {
    const m = byId(
      buildAsxChecklist(
        facts({
          profile: {
            proposed_issue_price_aud: 0.2,
            constitution_reviewed_at: "2026-07-01",
            governance_statement_at: "2026-07-02",
            director_checks_at: "2026-07-03",
            directors_total: 5,
            escrow_acknowledged_at: "2026-07-04",
          },
        }),
      ),
    );
    expect(m["asx.issue-price"].status).toBe("met");
    expect(m["asx.constitution"].status).toBe("met");
    expect(m["asx.constitution"].basis).toContain("2026-07-01");
    expect(m["asx.governance-statement"].status).toBe("met");
    expect(m["asx.director-checks"].status).toBe("met");
    expect(m["asx.director-checks"].basis).toContain("board of 5");
    expect(m["asx.escrow"].status).toBe("met");
    expect(byId(buildAsxChecklist(facts({ profile: { proposed_issue_price_aud: 0.19 } })))["asx.issue-price"].status).toBe("not_met");
    expect(byId(buildAsxChecklist(facts({ profile: { asx_test: "profit" } })))["asx.escrow"].status).toBe("not_confirmed");
    expect(byId(buildAsxChecklist(facts({ profile: { asx_test: "assets" } })))["asx.escrow"].status).toBe("confirm_current_rule");
  });

  it("a company already flagged as listed gets a leading not_confirmed row", () => {
    const rows = buildAsxChecklist(facts({ listed: true }));
    expect(rows[0].id).toBe("asx.already-listed");
    expect(buildAsxChecklist(facts({ listed: false })).some((r) => r.id === "asx.already-listed")).toBe(false);
  });
});

describe("buildNasdaqChecklist", () => {
  it("every row carries the rule, source and as-at stamp; empty facts → nothing is invented", () => {
    const rows = buildNasdaqChecklist(facts());
    expect(rows.map((r) => r.id)).toEqual([
      "nasdaq.public-shares",
      "nasdaq.round-lot-holders",
      "nasdaq.market-makers",
      "nasdaq.bid-price",
      "nasdaq.equity-standard",
      "nasdaq.market-value-standard",
      "nasdaq.net-income-standard",
      "nasdaq.audit-committee",
      "nasdaq.independent-board",
      "nasdaq.code-of-conduct",
      "nasdaq.currency",
    ]);
    for (const r of rows) {
      expect(r.exchange).toBe("nasdaq");
      expect(r.sourceRef).toContain("Nasdaq Listing Rules");
      expect(r.asAt).toBe(NASDAQ_RULES_AS_AT);
      if (r.status !== "met") expect(r.nextStep).toBeTruthy();
    }
    const m = byId(rows);
    expect(m["nasdaq.public-shares"].status).toBe("not_met");
    expect(m["nasdaq.round-lot-holders"].status).toBe("not_met");
    expect(m["nasdaq.market-makers"].status).toBe("not_confirmed");
    expect(m["nasdaq.bid-price"].status).toBe("not_confirmed");
    expect(m["nasdaq.bid-price"].basis).toContain("AUD→USD rate not entered");
    expect(m["nasdaq.equity-standard"].status).toBe("not_confirmed");
    expect(m["nasdaq.market-value-standard"].status).toBe("not_confirmed");
    expect(m["nasdaq.net-income-standard"].status).toBe("not_confirmed");
    expect(m["nasdaq.audit-committee"].status).toBe("not_confirmed");
    expect(m["nasdaq.independent-board"].status).toBe("not_confirmed");
    expect(m["nasdaq.code-of-conduct"].status).toBe("not_confirmed");
    expect(m["nasdaq.currency"].status).toBe("confirm_current_rule");
    expect(m["nasdaq.currency"].basis).toContain("does not assert");
  });

  it("a fully documented company meets the quantitative rows; the 50 % / US$2,500 nuance and the 10 % insider line apply", () => {
    // 300 public holders × 5,000 shares (0.24 % each) + founder. Price A$6 × 0.65 = US$3.90 → not_confirmed (alt-price band).
    const holders = [holder({ role: "founder", sharesHeld: 600_000 }), ...publicHolders(300, 5_000)];
    const base: ListingFacts = facts({
      holders,
      sharePriceAud: 6,
      incorporatedAt: "2020-01-01",
      profitLast12mAud: 1_400_000,
      profitCoverageMonths: 12,
      profile: { aud_usd_rate: 0.65, market_makers: 3, stockholders_equity_aud: 8_000_000, audit_committee_independent_members: 3, audit_committee_at: "2026-01-01", directors_total: 5, independent_directors: 3, code_of_conduct_at: "2026-02-01" },
    });
    const m = byId(buildNasdaqChecklist(base));
    expect(m["nasdaq.public-shares"].status).toBe("met");
    expect(m["nasdaq.public-shares"].basis).toContain("1,500,000 shares");
    expect(m["nasdaq.round-lot-holders"].status).toBe("met"); // 5,000 × US$3.90 = US$19,500 each
    expect(m["nasdaq.round-lot-holders"].basis).toContain("300 of them hold ≥ US$2,500");
    expect(m["nasdaq.market-makers"].status).toBe("met");
    expect(m["nasdaq.bid-price"].status).toBe("not_confirmed");
    expect(m["nasdaq.bid-price"].basis).toContain("US$3.90 per share");
    expect(m["nasdaq.equity-standard"].status).toBe("not_met"); // MVUPHS 1.5m × 3.9 = US$5.85m < 15m
    expect(m["nasdaq.equity-standard"].basis).toContain("stockholders' equity US$5,200,000 ≥ US$5,000,000");
    expect(m["nasdaq.equity-standard"].basis).toContain("operating history 6.7 yrs ≥ 2.0 yrs");
    expect(m["nasdaq.market-value-standard"].status).toBe("not_met"); // MVLS 2.1m × 3.9 = 8.19m
    expect(m["nasdaq.net-income-standard"].status).toBe("met"); // 1.4m × 0.65 = US$910k; MVUPHS 5.85m ≥ 5m
    expect(m["nasdaq.net-income-standard"].basis).toContain("an indicator, not an audited figure");
    expect(m["nasdaq.audit-committee"].status).toBe("met");
    expect(m["nasdaq.independent-board"].status).toBe("met");
    expect(m["nasdaq.code-of-conduct"].status).toBe("met");

    // Bid price at US$4 exactly → met; below US$2 → not met.
    const priced = byId(buildNasdaqChecklist({ ...base, profile: { ...base.profile, proposed_issue_price_aud: 8 } }))["nasdaq.bid-price"]; // 8 × 0.65 = US$5.20
    expect(priced.status).toBe("met");
    expect(priced.basis).toContain("US$5.20 per share (proposed issue price");
    expect(byId(buildNasdaqChecklist({ ...base, sharePriceAud: 2 }))["nasdaq.bid-price"].status).toBe("not_met"); // US$1.30

    // Only 150 of the 300 round-lot holders clear US$2,500 → still met (exactly 50 %); 149 → not met.
    const mixed = [holder({ role: "founder", sharesHeld: 600_000 }), ...publicHolders(150, 5_000), ...publicHolders(150, 100, 150)];
    expect(byId(buildNasdaqChecklist({ ...base, holders: mixed }))["nasdaq.round-lot-holders"].status).toBe("met");
    const mixed149 = [holder({ role: "founder", sharesHeld: 600_000 }), ...publicHolders(149, 5_000), ...publicHolders(151, 100, 149)];
    expect(byId(buildNasdaqChecklist({ ...base, holders: mixed149 }))["nasdaq.round-lot-holders"].status).toBe("not_met");
    // 299 round-lot holders → not met before the value test.
    expect(byId(buildNasdaqChecklist({ ...base, holders: [holder({ role: "founder", sharesHeld: 600_000 }), ...publicHolders(299, 5_000)] }))["nasdaq.round-lot-holders"].status).toBe("not_met");
    // No rate: count passes, value test cannot run → not confirmed.
    expect(byId(buildNasdaqChecklist({ ...base, profile: { ...base.profile, aud_usd_rate: undefined } }))["nasdaq.round-lot-holders"].status).toBe("not_confirmed");

    // Governance failures.
    const gov = byId(buildNasdaqChecklist({ ...base, profile: { ...base.profile, audit_committee_independent_members: 2, independent_directors: 2, directors_total: 4 } }));
    expect(gov["nasdaq.audit-committee"].status).toBe("not_met");
    expect(gov["nasdaq.independent-board"].status).toBe("not_met");
    expect(gov["nasdaq.independent-board"].basis).toContain("not a majority");
  });
});

describe("scoreReadiness / helpers", () => {
  it("met ÷ (met + not_met); not_confirmed and confirm_current_rule counted separately; nothing decided → null", () => {
    const rows = buildAsxChecklist(facts({ holders: [holder({ role: "founder", sharesHeld: 800_000 }), holder({ sharesHeld: 200_000 })] }));
    const s = scoreReadiness(rows);
    expect(s.total).toBe(11);
    expect(s.met).toBe(1);
    expect(s.notMet).toBe(1);
    expect(s.notConfirmed).toBe(7);
    expect(s.confirmCurrentRule).toBe(2);
    expect(s.pct).toBe(50);
    expect(scoreReadiness([]).pct).toBeNull();
    expect(scoreReadiness(rows.filter((r) => r.status === "not_confirmed")).pct).toBeNull();
  });

  it("buildListingReadiness dispatches; labels; formatting", () => {
    expect(buildListingReadiness("asx", facts())[0].exchange).toBe("asx");
    expect(buildListingReadiness("nasdaq", facts())[0].exchange).toBe("nasdaq");
    expect(isExchange("asx")).toBe(true);
    expect(isExchange("nyse")).toBe(false);
    expect(statusLabel("confirm_current_rule")).toBe("Confirm current rule");
    expect(formatAud(1_500_000)).toBe("A$1,500,000");
    expect(formatAud(0.2)).toBe("A$0.20");
    expect(formatAud(-12_345)).toBe("−A$12,345");
    expect(formatUsd(2_500)).toBe("US$2,500");
    expect(formatUsd(3.9)).toBe("US$3.90");
  });

  it("copy: readiness indicator, not advice; no invented company facts", () => {
    expect(LISTING_READINESS_NOTE).toContain("not legal advice");
    expect(LISTING_READINESS_NOTE).toContain("readiness indicators");
    const all = [...buildAsxChecklist(facts()), ...buildNasdaqChecklist(facts())];
    const text = all.map((r) => `${r.label} ${r.basis} ${r.nextStep ?? ""}`).join(" ");
    expect(text).not.toMatch(/PhD/);
    expect(text).not.toMatch(/guarantee/i);
  });
});
