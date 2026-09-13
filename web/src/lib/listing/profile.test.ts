// Colocated suite for the listing profile facts parser (S29-A): every key
// family (date / int / money / lists / enum) accepted and rejected, `null`
// clears, unknown keys refused, stored-blob normalisation salvages the
// good keys, and the merge helper.

import { describe, expect, it } from "vitest";
import { applyListingFactsPatch, isIsoDate, LISTING_FACT_KEYS, normaliseListingFacts, parseListingFactsPatch } from "./profile";

const ID = "22222222-2222-4222-8222-222222222222";

describe("parseListingFactsPatch", () => {
  it("accepts every key family and sorts / dedupes lists", () => {
    const r = parseListingFactsPatch({
      audited_accounts_confirmed_at: "2026-08-31",
      directors_total: 5,
      nta_after_raise_aud: 4_000_000,
      aud_usd_rate: 0.65,
      audited_accounts_fys: ["FY2026", "FY2025", "FY2026"],
      profit_by_fy: [
        { fy: "FY2026", profit_aud: 500_000 },
        { fy: "FY2025", profit_aud: -20_000 },
      ],
      restricted_holder_ids: [ID, ID],
      asx_test: "assets",
    });
    expect(r).toEqual({
      ok: true,
      cleared: [],
      patch: {
        audited_accounts_confirmed_at: "2026-08-31",
        directors_total: 5,
        nta_after_raise_aud: 4_000_000,
        aud_usd_rate: 0.65,
        audited_accounts_fys: ["FY2025", "FY2026"],
        profit_by_fy: [
          { fy: "FY2025", profit_aud: -20_000 },
          { fy: "FY2026", profit_aud: 500_000 },
        ],
        restricted_holder_ids: [ID],
        asx_test: "assets",
      },
    });
  });

  it("null clears a key; unknown keys and bad shapes are refused with the field named", () => {
    expect(parseListingFactsPatch({ market_makers: null })).toEqual({ ok: true, patch: {}, cleared: ["market_makers"] });
    expect(parseListingFactsPatch({ bogus: 1 })).toEqual({ ok: false, error: "unknown fact: bogus" });
    expect(parseListingFactsPatch({ constitution_reviewed_at: "31/08/2026" })).toMatchObject({ ok: false, error: expect.stringContaining("constitution_reviewed_at") });
    expect(parseListingFactsPatch({ constitution_reviewed_at: "2026-02-30" }).ok).toBe(false);
    expect(parseListingFactsPatch({ directors_total: 2.5 }).ok).toBe(false);
    expect(parseListingFactsPatch({ directors_total: -1 }).ok).toBe(false);
    expect(parseListingFactsPatch({ working_capital_aud: -5 }).ok).toBe(false);
    expect(parseListingFactsPatch({ working_capital_aud: "5" }).ok).toBe(false);
    expect(parseListingFactsPatch({ aud_usd_rate: 0 }).ok).toBe(false);
    expect(parseListingFactsPatch({ aud_usd_rate: 11 }).ok).toBe(false);
    expect(parseListingFactsPatch({ audited_accounts_fys: ["2026"] }).ok).toBe(false);
    expect(parseListingFactsPatch({ profit_by_fy: [{ fy: "FY2026" }] }).ok).toBe(false);
    expect(parseListingFactsPatch({ profit_by_fy: [{ fy: "FY2026", profit_aud: 1 }, { fy: "FY2026", profit_aud: 2 }] })).toEqual({ ok: false, error: "profit_by_fy lists FY2026 twice" });
    expect(parseListingFactsPatch({ restricted_holder_ids: ["nope"] }).ok).toBe(false);
    expect(parseListingFactsPatch({ asx_test: "both" }).ok).toBe(false);
    expect(parseListingFactsPatch(null).ok).toBe(false);
    expect(parseListingFactsPatch([]).ok).toBe(false);
  });

  it("isIsoDate", () => {
    expect(isIsoDate("2026-09-13")).toBe(true);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate(20260913)).toBe(false);
  });
});

describe("normaliseListingFacts / applyListingFactsPatch", () => {
  it("salvages valid keys from a stored blob and drops the rest", () => {
    expect(normaliseListingFacts({ market_makers: 3, directors_total: "five", junk: true, code_of_conduct_at: null })).toEqual({ market_makers: 3 });
    expect(normaliseListingFacts(null)).toEqual({});
    expect(normaliseListingFacts([1])).toEqual({});
  });

  it("merges a patch and removes cleared keys", () => {
    const next = applyListingFactsPatch({ market_makers: 2, directors_total: 4 }, { market_makers: 3 }, ["directors_total"]);
    expect(next).toEqual({ market_makers: 3 });
  });

  it("every fact key is unique", () => {
    expect(new Set(LISTING_FACT_KEYS).size).toBe(LISTING_FACT_KEYS.length);
  });
});
