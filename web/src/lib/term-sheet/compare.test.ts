// Colocated suite for the term-sheet comparator (S26-B).
//
//   - 2–4 sheets only (RangeError otherwise)
//   - every row has one cell per sheet; the friendlier flag lands on the
//     better term and never on a "not stated" cell
//   - missing fields: neutral 0.5, listed in `missing`, row `comparable`
//     false when < 2 sheets state it, never NaN
//   - the priced Series A with 1× non-participating / broad-based WA / no
//     vesting reset scores higher than the 2× participating full-ratchet
//     sheet with a vesting reset
//   - extraction from clauses + raw text (anti-dilution, drag / tag
//     threshold, vesting reset, liquidation preference parsing)
//   - weights sum to 100 and are echoed in the notes

import { describe, expect, it } from "vitest";
import { DEMO_ANALYSIS } from "./demo";
import type { TermSheetAnalysis } from "./schema";
import { COMPARE_ROW_ORDER, COMPARE_WEIGHTS, MAX_SHEETS, MIN_SHEETS, compareTermSheets, extractDragTag, extractTerms, extractVestingReset, parseLiquidationPreference, sheetLabel, type CompareSheetInput } from "./compare";

function analysis(over: Partial<TermSheetAnalysis> & { keyTerms?: Partial<TermSheetAnalysis["keyTerms"]> }): TermSheetAnalysis {
  return { ...DEMO_ANALYSIS, ...over, keyTerms: { ...DEMO_ANALYSIS.keyTerms, ...(over.keyTerms ?? {}) }, redline: over.redline ?? [], auMarketComparison: over.auMarketComparison ?? { summary: "", deviations: [] }, riskFlags: over.riskFlags ?? [] };
}

const FRIENDLY: CompareSheetInput = {
  id: "a",
  label: "Sheet A (Blackbird)",
  analysis: analysis({
    instrumentType: "Series A",
    keyTerms: { preMoneyAud: 20_000_000, postMoneyAud: 25_000_000, investorAmountAud: 5_000_000, discountPct: null, valuationCapAud: null, liquidationPreference: "1x non-participating", boardSeatsToInvestor: 1, proRataRights: true, optionPoolPostMoneyPct: 10 },
    redline: [{ clause: "Anti-dilution: broad-based weighted average", issue: "standard", severity: "info", suggestedRevision: "keep", clause_confidence: 1, risk_level: "low" }],
  }),
  rawText: "Drag-along: holders of 75% of shares may drag. Tag-along rights apply to all holders. Founder vesting: existing vesting is honoured, no reset. Pro-rata rights for major investors only, sunset after 24 months.",
  createdAt: "2026-09-03T00:00:00Z",
};

const HARSH: CompareSheetInput = {
  id: "b",
  label: "Sheet B (Other Fund)",
  analysis: analysis({
    instrumentType: "Series A",
    keyTerms: { preMoneyAud: 15_000_000, postMoneyAud: 20_000_000, investorAmountAud: 5_000_000, discountPct: null, valuationCapAud: null, liquidationPreference: "2x participating", boardSeatsToInvestor: 2, proRataRights: true, optionPoolPostMoneyPct: 15 },
    redline: [{ clause: "Anti-dilution: full ratchet", issue: "critical", severity: "critical", suggestedRevision: "broad-based WA", clause_confidence: 1, risk_level: "critical" }],
  }),
  rawText: "Drag-along at 50% threshold. No tag-along. Founder vesting will reset at closing to a new 4-year schedule.",
};

const SAFE_SHEET: CompareSheetInput = { id: "c", label: "Sheet C (Atlas SAFE)", analysis: DEMO_ANALYSIS, rawText: null };

describe("compareTermSheets", () => {
  it("rejects fewer than 2 or more than 4 sheets", () => {
    expect(() => compareTermSheets([FRIENDLY])).toThrow(RangeError);
    expect(() => compareTermSheets([FRIENDLY, HARSH, SAFE_SHEET, FRIENDLY, HARSH])).toThrow(RangeError);
    expect(MIN_SHEETS).toBe(2);
    expect(MAX_SHEETS).toBe(4);
  });

  it("weights sum to 100 and every row has one cell per sheet", () => {
    expect(Object.values(COMPARE_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
    const c = compareTermSheets([FRIENDLY, HARSH, SAFE_SHEET]);
    expect(c.version).toBe("tsc-v1");
    expect(c.rows.map((r) => r.key)).toEqual(COMPARE_ROW_ORDER);
    for (const r of c.rows) expect(r.cells.map((x) => x.sheetId)).toEqual(["a", "b", "c"]);
    expect(c.notes.join(" ")).toContain("Pre-money valuation 20");
    expect(c.notes.join(" ")).toContain("total 100");
    expect(JSON.stringify(c)).not.toMatch(/NaN|Infinity/);
  });

  it("the founder-friendlier sheet wins the rows and the score; flags never land on a not-stated cell", () => {
    const c = compareTermSheets([FRIENDLY, HARSH]);
    const row = (k: string) => c.rows.find((r) => r.key === k)!;
    expect(row("valuation_pre").cells[0]).toMatchObject({ display: "A$20M", founderFriendlier: true });
    expect(row("valuation_pre").cells[1]).toMatchObject({ display: "A$15M", founderFriendlier: false, score: 0.75 });
    expect(row("liq_pref_multiple").cells.map((x) => x.display)).toEqual(["1×", "2×"]);
    expect(row("liq_pref_multiple").cells[0].founderFriendlier).toBe(true);
    expect(row("liq_pref_participation").cells.map((x) => x.display)).toEqual(["non-participating", "fully participating"]);
    expect(row("anti_dilution").cells.map((x) => x.display)).toEqual(["broad-based weighted average", "full ratchet"]);
    expect(row("board_seats").cells.map((x) => x.display)).toEqual(["1", "2"]);
    expect(row("pro_rata").cells[0].display).toBe("limited (sunset / major investors)");
    expect(row("drag_tag").cells.map((x) => x.display)).toEqual(["drag ≥ 75% / tag", "drag ≥ 50% / no tag"]);
    expect(row("drag_tag").cells[0].founderFriendlier).toBe(true);
    expect(row("esop_topup").cells.map((x) => x.display)).toEqual(["10%", "15%"]);
    expect(row("founder_vesting_reset").cells.map((x) => x.display)).toEqual(["none (existing vesting honoured)", "full reset"]);
    // discount / cap not stated on either priced sheet → not comparable, no flag
    expect(row("discount").comparable).toBe(false);
    expect(row("discount").cells.every((x) => !x.founderFriendlier && x.display === "not stated")).toBe(true);

    const a = c.scores.find((s) => s.sheetId === "a")!;
    const b = c.scores.find((s) => s.sheetId === "b")!;
    expect(a.score).toBeGreaterThan(b.score);
    expect(a.score).toBeGreaterThanOrEqual(80);
    expect(b.score).toBeLessThanOrEqual(40);
    expect(c.friendliestSheetId).toBe("a");
    expect(a.wins).toEqual(expect.arrayContaining(["valuation_pre", "liq_pref_multiple", "anti_dilution", "board_seats", "founder_vesting_reset"]));
    expect(b.wins).toEqual([]);
    expect(a.missing).toEqual(["discount", "cap"]);
  });

  it("missing fields score the neutral midpoint and are reported; a SAFE with only a cap still compares", () => {
    const c = compareTermSheets([SAFE_SHEET, HARSH]);
    const safe = c.scores.find((s) => s.sheetId === "c")!;
    expect(safe.missing).toEqual(expect.arrayContaining(["valuation_pre", "anti_dilution", "drag_tag", "esop_topup"]));
    const pre = c.rows.find((r) => r.key === "valuation_pre")!;
    expect(pre.comparable).toBe(false);
    expect(pre.cells[0]).toMatchObject({ display: "not stated", score: null, founderFriendlier: false });
    expect(pre.cells[1].founderFriendlier).toBe(false);
    const cap = c.rows.find((r) => r.key === "cap")!;
    expect(cap.cells[0].display).toBe("A$5M");
    expect(c.rows.find((r) => r.key === "instrument")!.cells.map((x) => x.display)).toEqual(["SAFE", "Series A"]);
    expect(c.notes[0]).toContain("not stated");
    expect(Number.isFinite(safe.score)).toBe(true);
    expect(c.sheets[0]).toEqual({ id: "c", label: "Sheet C (Atlas SAFE)", createdAt: null, instrument: "SAFE" });
  });

  it("an empty analysis (all null) never produces NaN and scores 50", () => {
    const empty: CompareSheetInput = {
      id: "e",
      label: "Empty",
      analysis: analysis({ instrumentType: "Other", keyTerms: { investorAmountAud: null, valuationCapAud: null, discountPct: null, preMoneyAud: null, postMoneyAud: null, optionPoolPostMoneyPct: null, boardSeatsToInvestor: null, liquidationPreference: null, proRataRights: null, leadInvestorName: null }, plainEnglishSummary: "" }),
    };
    const c = compareTermSheets([empty, { ...empty, id: "f", label: "Empty 2" }]);
    expect(c.scores.map((s) => s.score)).toEqual([50, 50]);
    expect(c.friendliestSheetId).toBe("e");
    expect(c.rows.every((r) => !r.comparable)).toBe(true);
    expect(JSON.stringify(c)).not.toMatch(/NaN/);
  });
});

describe("extraction", () => {
  it("parses liquidation preference strings", () => {
    expect(parseLiquidationPreference("1x non-participating")).toEqual({ multiple: 1, participation: "non_participating" });
    expect(parseLiquidationPreference("2× participating capped at 3x")).toEqual({ multiple: 2, participation: "capped_participating" });
    expect(parseLiquidationPreference("1.5x participating")).toEqual({ multiple: 1.5, participation: "full_participating" });
    expect(parseLiquidationPreference(null)).toEqual({ multiple: null, participation: null });
  });
  it("drag / tag and vesting reset from text", () => {
    expect(extractDragTag("drag-along rights exercisable by holders of 66% of the preference shares; tag-along for all")).toEqual({ drag: true, dragThresholdPct: 66, tag: true });
    expect(extractDragTag("co-sale rights only")).toEqual({ drag: false, dragThresholdPct: null, tag: true });
    expect(extractDragTag("nothing here")).toBeNull();
    expect(extractVestingReset("founder shares will re-vest over 4 years from closing")).toBe("full");
    expect(extractVestingReset("founder vesting continues with full credit for time served")).toBe("none");
    expect(extractVestingReset("founder vesting: partial credit for 12 months plus double-trigger acceleration")).toBe("partial");
    expect(extractVestingReset("no mention")).toBeNull();
  });
  it("extractTerms reads structured keyTerms and derives post-money from pre + amount", () => {
    const t = extractTerms({ id: "x", label: "x", analysis: analysis({ plainEnglishSummary: "", keyTerms: { preMoneyAud: 4_000_000, postMoneyAud: null, investorAmountAud: 1_000_000, liquidationPreference: null, proRataRights: null } }) });
    expect(t.postMoneyAud).toBe(5_000_000);
    expect(t.liqPrefMultiple).toBeNull();
    expect(t.proRata).toBeNull();
    expect(t.antiDilution).toBeNull();
  });
  it("sheetLabel", () => {
    expect(sheetLabel({ company_name: "Acme Pty Ltd", created_at: "2026-09-03T00:00:00Z", analysis: DEMO_ANALYSIS }, "Sheet 1")).toBe("Acme Pty Ltd (Atlas Ventures Pty Ltd) · 3 Sept 2026".replace("Sept", new Intl.DateTimeFormat("en-AU", { month: "short", timeZone: "Australia/Sydney" }).format(new Date("2026-09-03T00:00:00Z"))));
    expect(sheetLabel({ company_name: null, created_at: null, analysis: null }, "Sheet 2")).toBe("Sheet 2");
  });
});
