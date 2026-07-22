import { describe, it, expect } from "vitest";
import { buildAddonRemovalSchedulePhases } from "./addon-schedule";

const BASE = "price_base";
const ADDON = "price_addon";

describe("buildAddonRemovalSchedulePhases", () => {
  it("returns two phases preserving current window and dropping the add-on next cycle", () => {
    const result = buildAddonRemovalSchedulePhases({
      currentPhase: {
        start_date: 1_700_000_000,
        end_date: 1_702_592_000,
        items: [
          { price: { id: BASE }, quantity: 1 },
          { price: { id: ADDON }, quantity: 1 },
        ],
      },
      removePriceId: ADDON,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.phases).toHaveLength(2);

    const [p0, p1] = result.phases;
    expect(p0.start_date).toBe(1_700_000_000);
    expect(p0.end_date).toBe(1_702_592_000);
    expect(p0.items.map((i) => i.price)).toEqual([BASE, ADDON]);
    expect(p0.proration_behavior).toBe("none");

    expect(p1.start_date).toBe(1_702_592_000);
    expect(p1.items.map((i) => i.price)).toEqual([BASE]);
    expect(p1.iterations).toBe(1);
    expect(p1.proration_behavior).toBe("none");
  });

  it("accepts string-price shapes and omits zero/undefined quantities", () => {
    const result = buildAddonRemovalSchedulePhases({
      currentPhase: {
        start_date: 1,
        end_date: 2,
        items: [
          { price: BASE, quantity: null },
          { price: ADDON, quantity: 0 },
        ],
      },
      removePriceId: ADDON,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.phases[0].items).toEqual([
      { price: BASE },
      { price: ADDON },
    ]);
    expect(result.phases[1].items).toEqual([{ price: BASE }]);
  });

  it("returns target_not_in_phase when the add-on is not present", () => {
    const result = buildAddonRemovalSchedulePhases({
      currentPhase: {
        start_date: 1,
        end_date: 2,
        items: [{ price: BASE }],
      },
      removePriceId: ADDON,
    });
    expect(result).toEqual({ ok: false, reason: "target_not_in_phase" });
  });

  it("returns no_items_after_removal when removing the sole item would empty phase 1", () => {
    const result = buildAddonRemovalSchedulePhases({
      currentPhase: {
        start_date: 1,
        end_date: 2,
        items: [{ price: ADDON }],
      },
      removePriceId: ADDON,
    });
    expect(result).toEqual({ ok: false, reason: "no_items_after_removal" });
  });

  it("preserves quantity > 1 on retained items", () => {
    const result = buildAddonRemovalSchedulePhases({
      currentPhase: {
        start_date: 10,
        end_date: 20,
        items: [
          { price: BASE, quantity: 5 },
          { price: ADDON, quantity: 3 },
        ],
      },
      removePriceId: ADDON,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.phases[1].items).toEqual([{ price: BASE, quantity: 5 }]);
  });
});
