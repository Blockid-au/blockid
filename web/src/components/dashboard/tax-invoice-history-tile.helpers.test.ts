import { describe, expect, it } from "vitest";
import {
  formatComputedAtRelative,
  pickHistoryTileView,
  TAX_INVOICE_BAND_LABEL,
  type HistoryTilePayload,
} from "./tax-invoice-history-tile.helpers";

function makePayload(overrides: Partial<HistoryTilePayload["latest"]> & { total?: number } = {}): HistoryTilePayload {
  const { total = 1, ...rest } = overrides;
  return {
    total,
    latest: {
      ok: true,
      band: "standard",
      gst_inclusive_total_aud: 330,
      computed_gst_component_aud: 30,
      missing_field_count: 0,
      warning_count: 0,
      computed_at: "2026-07-25T00:00:00.000Z",
      ...rest,
    },
  };
}

describe("pickHistoryTileView", () => {
  it("returns the slate empty-state when payload is null", () => {
    const view = pickHistoryTileView(null);
    expect(view.colour).toBe("slate");
    expect(view.chipLabel).toBe("None saved");
    expect(view.body).toMatch(/tax-invoice checker/i);
  });

  it("returns the slate empty-state when total is 0 even if latest is null", () => {
    const view = pickHistoryTileView({ total: 0, latest: null });
    expect(view.colour).toBe("slate");
    expect(view.chipLabel).toBe("None saved");
  });

  it("returns the slate empty-state when latest is null but total > 0 (defensive)", () => {
    // shouldn't happen in prod (count + latest inserted atomically) but the
    // tile must not crash if the count and latest queries disagree.
    const view = pickHistoryTileView({ total: 3, latest: null });
    expect(view.colour).toBe("slate");
  });

  it("returns red when the latest snapshot has missing fields", () => {
    const view = pickHistoryTileView(makePayload({ ok: false, missing_field_count: 3, warning_count: 0 }));
    expect(view.colour).toBe("red");
    expect(view.chipLabel).toBe("3 missing");
    expect(view.body).toMatch(/1 saved/);
    expect(view.body).toMatch(/3 missing fields/);
    expect(view.body).toMatch(/A\$82\.50/);
  });

  it("uses singular missing-field grammar when count is 1", () => {
    const view = pickHistoryTileView(makePayload({ ok: false, missing_field_count: 1 }));
    expect(view.chipLabel).toBe("1 missing");
    expect(view.body).toMatch(/1 missing field/);
    expect(view.body).not.toMatch(/1 missing fields/);
  });

  it("prefers red over amber when both missing fields and warnings are present", () => {
    const view = pickHistoryTileView(
      makePayload({ ok: false, missing_field_count: 2, warning_count: 4 }),
    );
    expect(view.colour).toBe("red");
    expect(view.chipLabel).toBe("2 missing");
  });

  it("returns amber when the latest snapshot passes with warnings", () => {
    const view = pickHistoryTileView(makePayload({ warning_count: 2 }));
    expect(view.colour).toBe("amber");
    expect(view.chipLabel).toBe("2 warnings");
    expect(view.body).toMatch(/1 saved/);
    expect(view.body).toMatch(/2 warnings/);
  });

  it("uses singular warning grammar when warning_count is 1", () => {
    const view = pickHistoryTileView(makePayload({ warning_count: 1 }));
    expect(view.chipLabel).toBe("1 warning");
    expect(view.body).toMatch(/1 warning /);
  });

  it("returns emerald when the latest snapshot passes cleanly", () => {
    const view = pickHistoryTileView(makePayload({ total: 5 }));
    expect(view.colour).toBe("emerald");
    expect(view.chipLabel).toBe("5 saved");
    expect(view.body).toMatch(/passes the ATO/);
    expect(view.body).toMatch(/data-room folder 3/);
  });

  it("pluralises 'saved' correctly for large tiles", () => {
    const view = pickHistoryTileView(makePayload({ total: 12 }));
    expect(view.chipLabel).toBe("12 saved");
  });

  it("uses the correct band label for the large-invoice threshold", () => {
    const view = pickHistoryTileView(makePayload({ band: "large" }));
    expect(view.body).toMatch(/A\$1,000\+/);
    expect(TAX_INVOICE_BAND_LABEL.large).toBe("A$1,000+");
  });

  it("uses the correct band label for the under-threshold receipt", () => {
    const view = pickHistoryTileView(makePayload({ band: "under_threshold" }));
    expect(view.body).toMatch(/Under A\$82\.50/);
  });
});

describe("formatComputedAtRelative", () => {
  const now = new Date("2026-07-25T12:00:00.000Z");

  it("returns 'recently' for null / undefined / garbage input", () => {
    expect(formatComputedAtRelative(null, now)).toBe("recently");
    expect(formatComputedAtRelative(undefined, now)).toBe("recently");
    expect(formatComputedAtRelative("not-a-date", now)).toBe("recently");
  });

  it("returns 'recently' for a future date (defensive)", () => {
    expect(formatComputedAtRelative("2027-01-01T00:00:00.000Z", now)).toBe("recently");
  });

  it("returns 'today' for a date less than 24h ago", () => {
    expect(formatComputedAtRelative("2026-07-25T00:00:00.000Z", now)).toBe("today");
  });

  it("returns 'yesterday' for a 1-day-old snapshot", () => {
    expect(formatComputedAtRelative("2026-07-24T00:00:00.000Z", now)).toBe("yesterday");
  });

  it("returns 'N days ago' inside a week", () => {
    expect(formatComputedAtRelative("2026-07-22T00:00:00.000Z", now)).toBe("3 days ago");
  });

  it("returns 'N weeks ago' inside a month", () => {
    expect(formatComputedAtRelative("2026-07-05T00:00:00.000Z", now)).toBe("2 weeks ago");
  });

  it("returns 'N months ago' beyond 30 days", () => {
    expect(formatComputedAtRelative("2026-05-01T00:00:00.000Z", now)).toBe("2 months ago");
  });
});
