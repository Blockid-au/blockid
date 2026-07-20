import { describe, it, expect } from "vitest";
import { assignVariant, type PricingExperiment } from "./pricing-experiments";

function makeExperiment(overrides: Partial<PricingExperiment> = {}): PricingExperiment {
  return {
    id: "exp-1",
    name: "founder_price_v1",
    hypothesis: "Anchoring at $49 lifts free→paid.",
    status: "running",
    variants: [
      { key: "control", label: "Control", payload: { price: 2900 } },
      { key: "treatment", label: "Treatment", payload: { price: 4900 } },
    ],
    trafficSplit: { control: 0.5, treatment: 0.5 },
    createdAt: "2026-07-20T00:00:00Z",
    updatedAt: "2026-07-20T00:00:00Z",
    ...overrides,
  };
}

describe("assignVariant", () => {
  it("is stable for the same bucketKey across repeated calls", () => {
    const exp = makeExperiment();
    const first = assignVariant(exp, "session-42");
    for (let i = 0; i < 50; i++) {
      expect(assignVariant(exp, "session-42").variantKey).toBe(first.variantKey);
    }
  });

  it("returns the variant payload attached to the assigned key", () => {
    const exp = makeExperiment();
    const picked = assignVariant(exp, "user-abc");
    const source = exp.variants.find((v) => v.key === picked.variantKey);
    expect(source).toBeDefined();
    expect(picked.payload).toStrictEqual(source?.payload);
  });

  it("respects a 70/30 weighted split across many buckets (±5%)", () => {
    const exp = makeExperiment({
      name: "weighted_split_test",
      trafficSplit: { control: 0.7, treatment: 0.3 },
    });
    let control = 0;
    let treatment = 0;
    for (let i = 0; i < 1000; i++) {
      const { variantKey } = assignVariant(exp, `bucket-${i}`);
      if (variantKey === "control") control++;
      else treatment++;
    }
    expect(control).toBeGreaterThanOrEqual(650);
    expect(control).toBeLessThanOrEqual(750);
    expect(treatment).toBeGreaterThanOrEqual(250);
    expect(treatment).toBeLessThanOrEqual(350);
  });

  it("falls back to uniform split when all configured weights are zero", () => {
    const exp = makeExperiment({
      name: "zero_weights_test",
      trafficSplit: { control: 0, treatment: 0 },
    });
    let control = 0;
    let treatment = 0;
    for (let i = 0; i < 1000; i++) {
      const { variantKey } = assignVariant(exp, `bucket-${i}`);
      if (variantKey === "control") control++;
      else treatment++;
    }
    expect(control).toBeGreaterThanOrEqual(400);
    expect(treatment).toBeGreaterThanOrEqual(400);
  });

  it("handles a three-way split and always returns a configured variant key", () => {
    const exp = makeExperiment({
      name: "three_way_test",
      variants: [
        { key: "a", label: "A", payload: { p: 1 } },
        { key: "b", label: "B", payload: { p: 2 } },
        { key: "c", label: "C", payload: { p: 3 } },
      ],
      trafficSplit: { a: 0.5, b: 0.3, c: 0.2 },
    });
    const keys = new Set<string>();
    for (let i = 0; i < 500; i++) {
      keys.add(assignVariant(exp, `k-${i}`).variantKey);
    }
    expect([...keys].every((k) => ["a", "b", "c"].includes(k))).toBe(true);
    expect(keys.size).toBe(3);
  });
});
