// S28-C — credit maths for "Categorise N rows with AI".

import { describe, it, expect } from "vitest";
import { FEATURE_COSTS } from "@/lib/credits";
import { EXPENSE_CATEGORISE_FEATURE, ROWS_PER_CREDIT, categoriseCost, categoriseCostLabel, categoriseUnits } from "./cost";
import { CATEGORIES, CATEGORY_KEYS, EXPENSE_CATEGORY_KEYS, INCOME_CATEGORY_KEYS, categoryLabel, gstDefaultFor, isExpenseCategory } from "./categories";

describe("categoriseUnits — 1 credit per started block of 100, min 1", () => {
  it.each([
    [0, 0],
    [1, 1],
    [99, 1],
    [100, 1],
    [101, 2],
    [250, 3],
    [1000, 10],
    [-5, 0],
    [Number.NaN, 0],
  ])("%s rows → %s units", (rows, units) => {
    expect(categoriseUnits(rows)).toBe(units);
  });
  expect(ROWS_PER_CREDIT).toBe(100);
});

describe("categoriseCost", () => {
  it("is listed in FEATURE_COSTS at 1 credit per unit", () => {
    expect(FEATURE_COSTS[EXPENSE_CATEGORISE_FEATURE]).toBe(1);
  });
  it("multiplies units by the unit cost; 0 when included or nothing queued", () => {
    expect(categoriseCost(150, 1, false)).toBe(2);
    expect(categoriseCost(150, 0.5, false)).toBe(1);
    expect(categoriseCost(150, 1, true)).toBe(0);
    expect(categoriseCost(0, 1, false)).toBe(0);
  });
  it("label shows the price before execution", () => {
    expect(categoriseCostLabel(150, 2, false)).toBe("Categorise 150 rows with AI (cost: 2 credits)");
    expect(categoriseCostLabel(1, 1, false)).toBe("Categorise 1 row with AI (cost: 1 credit)");
    expect(categoriseCostLabel(40, 0, true)).toBe("Categorise 40 rows with AI (included in your plan)");
    expect(categoriseCostLabel(0, 0, false)).toBe("Nothing to categorise");
  });
});

describe("categories chart", () => {
  it("has 21 keys, each with a label, a description and a GST default", () => {
    expect(CATEGORY_KEYS).toHaveLength(21);
    expect(CATEGORIES.map((c) => c.key)).toEqual([...CATEGORY_KEYS]);
    for (const c of CATEGORIES) {
      expect(c.label.length).toBeGreaterThan(2);
      expect(c.description.length).toBeGreaterThan(20);
      expect(["gst", "gst_free", "input_taxed", "unknown"]).toContain(c.gstDefault);
    }
  });
  it("income / expense / neutral split", () => {
    expect(INCOME_CATEGORY_KEYS).toEqual(["revenue", "government_grants"]);
    expect(EXPENSE_CATEGORY_KEYS).not.toContain("transfer");
    expect(EXPENSE_CATEGORY_KEYS).not.toContain("owner_drawings");
    expect(EXPENSE_CATEGORY_KEYS).toContain("other");
  });
  it("helpers", () => {
    expect(isExpenseCategory("rent")).toBe(true);
    expect(isExpenseCategory("Rent")).toBe(false);
    expect(categoryLabel("cloud_hosting")).toBe("Cloud & hosting");
    expect(categoryLabel("zzz")).toBe("zzz");
    expect(gstDefaultFor("superannuation")).toBe("gst_free");
    expect(gstDefaultFor("bank_fees")).toBe("input_taxed");
  });
});
