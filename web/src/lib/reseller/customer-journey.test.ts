import { describe, expect, it } from "vitest";

import { CANONICAL_STAGES, type StageKey } from "@/lib/journey-vocabulary";
import { deriveCanonicalStage } from "./customer-journey";

describe("deriveCanonicalStage", () => {
  it("returns 'idea' when the customer has no SVI signal", () => {
    expect(deriveCanonicalStage(null)).toBe("idea");
    expect(deriveCanonicalStage(undefined)).toBe("idea");
  });

  it("never throws and returns a valid StageKey for every integer SVI score in [0, 100]", () => {
    const valid = new Set<StageKey>(CANONICAL_STAGES);
    for (let s = 0; s <= 100; s += 1) {
      const stage = deriveCanonicalStage(s);
      expect(valid.has(stage), `score ${s} produced unknown stage ${stage}`).toBe(true);
    }
  });

  it("gracefully handles malformed numeric inputs by falling back to 'idea'", () => {
    expect(deriveCanonicalStage(Number.NaN)).toBe("idea");
    expect(deriveCanonicalStage(Number.NEGATIVE_INFINITY)).toBe("idea");
    expect(deriveCanonicalStage(-5)).toBe("idea");
  });

  it("progresses monotonically as the SVI score grows across the 0-100 range", () => {
    // The canonical stage index for a given band must be >= the previous
    // stage index. Ensures we can never regress a customer to an earlier
    // stage on a score bump. (Scores > 100 clamp to phase 6 → 'seed' by
    // design; see module doc — so monotonicity is only asserted within the
    // documented input range.)
    const order = new Map<StageKey, number>(
      CANONICAL_STAGES.map((s, i) => [s, i]),
    );
    const anchors = [0, 10, 25, 45, 65, 85, 100];
    let last = -1;
    for (const s of anchors) {
      const idx = order.get(deriveCanonicalStage(s))!;
      expect(idx).toBeGreaterThanOrEqual(last);
      last = idx;
    }
  });
});
