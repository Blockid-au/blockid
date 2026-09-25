import { describe, expect, it } from "vitest";
import { dealFlowFiltersSchema, filtersFromSearchParams, filtersToQuery, normaliseSavedViews } from "./saved-views";

describe("index thresholds survive saved-view and URL round trips", () => {
  it.each([101, 135, 1200])("keeps SVI threshold %s without widening the fit percentage", min_svi => {
    const filters = dealFlowFiltersSchema.parse({ min_svi, min_fit: 80 });
    const views = normaliseSavedViews([{ id: "view1234", name: "High index", filters, sort: "svi", created_at: "2026-09-24" }]);
    expect(views).toHaveLength(1);
    const params = Object.fromEntries(new URLSearchParams(filtersToQuery(views[0].filters)));
    expect(filtersFromSearchParams(params)).toMatchObject({ min_svi, min_fit: 80 });
    expect(dealFlowFiltersSchema.safeParse({ min_fit: 101 }).success).toBe(false);
    expect(filtersFromSearchParams({ fit: "101", svi: String(min_svi) }).min_fit).toBeUndefined();
  });
  it.each([-1, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])("rejects invalid threshold %s", value => {
    expect(dealFlowFiltersSchema.safeParse({ min_svi: value }).success).toBe(false);
    expect(filtersFromSearchParams({ svi: String(value) }).min_svi).toBeUndefined();
  });
});
