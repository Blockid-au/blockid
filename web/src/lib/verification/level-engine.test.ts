import { describe, it, expect } from "vitest";
import {
  computeVerificationLevel,
  type VerificationInputs,
  type VerificationLevel,
} from "./level-engine";

/**
 * Colocated tests for the verification-level engine (Phase 2 Batch F sub-F3).
 *
 * 24-case truth-table plus edge cases proving:
 *   - the ladder is strictly monotonic
 *   - a single regression demotes to the highest still-satisfied tier
 *   - L5 → L2 when abrConfirmed flips false mid-run
 */

const ALL_FALSE: VerificationInputs = {
  hasBusinessId: false,
  abrConfirmed: false,
  abrStatus: null,
  domainVerified: false,
  emailVerified: false,
  financialsAttested: false,
  independentlyAudited: false,
  continuouslyMonitored: false,
};

function withPatch(patch: Partial<VerificationInputs>): VerificationInputs {
  return { ...ALL_FALSE, ...patch };
}

// Canonical rung templates — the minimum inputs required for each rung.
const RUNG_INPUTS: Record<VerificationLevel, VerificationInputs> = {
  0: ALL_FALSE,
  1: withPatch({ hasBusinessId: true, emailVerified: true }),
  2: withPatch({
    hasBusinessId: true,
    emailVerified: true,
    abrConfirmed: true,
    abrStatus: "Active",
    domainVerified: true,
  }),
  3: withPatch({
    hasBusinessId: true,
    emailVerified: true,
    abrConfirmed: true,
    abrStatus: "Active",
    domainVerified: true,
    financialsAttested: true,
  }),
  4: withPatch({
    hasBusinessId: true,
    emailVerified: true,
    abrConfirmed: true,
    abrStatus: "Active",
    domainVerified: true,
    financialsAttested: true,
    independentlyAudited: true,
  }),
  5: withPatch({
    hasBusinessId: true,
    emailVerified: true,
    abrConfirmed: true,
    abrStatus: "Active",
    domainVerified: true,
    financialsAttested: true,
    independentlyAudited: true,
    continuouslyMonitored: true,
  }),
};

describe("computeVerificationLevel · canonical rungs (6 cases)", () => {
  for (const rung of [0, 1, 2, 3, 4, 5] as const) {
    it(`rung ${rung} returns ${rung}`, () => {
      expect(computeVerificationLevel(RUNG_INPUTS[rung])).toBe(rung);
    });
  }
});

describe("computeVerificationLevel · no-business-id regressions (2 cases)", () => {
  it("returns 0 when hasBusinessId=false even with every other signal true", () => {
    const inputs = withPatch({
      hasBusinessId: false,
      abrConfirmed: true,
      abrStatus: "Active",
      domainVerified: true,
      emailVerified: true,
      financialsAttested: true,
      independentlyAudited: true,
      continuouslyMonitored: true,
    });
    expect(computeVerificationLevel(inputs)).toBe(0);
  });

  it("all-false → 0", () => {
    expect(computeVerificationLevel(ALL_FALSE)).toBe(0);
  });
});

describe("computeVerificationLevel · L1 self-declared shape (3 cases)", () => {
  it("hasBusinessId only → 0 (email unverified)", () => {
    expect(computeVerificationLevel(withPatch({ hasBusinessId: true }))).toBe(0);
  });

  it("emailVerified only → 0 (no business id)", () => {
    expect(computeVerificationLevel(withPatch({ emailVerified: true }))).toBe(0);
  });

  it("hasBusinessId + emailVerified → 1 (self-declared)", () => {
    expect(
      computeVerificationLevel(
        withPatch({ hasBusinessId: true, emailVerified: true }),
      ),
    ).toBe(1);
  });
});

describe("computeVerificationLevel · L2 evidence-checked demotions (5 cases)", () => {
  it("L2 shape with abrStatus=Cancelled → 1", () => {
    expect(
      computeVerificationLevel({ ...RUNG_INPUTS[2], abrStatus: "Cancelled" }),
    ).toBe(1);
  });

  it("L2 shape with abrStatus=null → 1", () => {
    expect(computeVerificationLevel({ ...RUNG_INPUTS[2], abrStatus: null })).toBe(1);
  });

  it("L2 shape with abrConfirmed=false → 1", () => {
    expect(
      computeVerificationLevel({ ...RUNG_INPUTS[2], abrConfirmed: false }),
    ).toBe(1);
  });

  it("L2 shape with domainVerified=false → 1", () => {
    expect(
      computeVerificationLevel({ ...RUNG_INPUTS[2], domainVerified: false }),
    ).toBe(1);
  });

  it("L2 shape with emailVerified=false → 0", () => {
    expect(
      computeVerificationLevel({ ...RUNG_INPUTS[2], emailVerified: false }),
    ).toBe(0);
  });
});

describe("computeVerificationLevel · higher-rung demotions (7 cases)", () => {
  it("L3 shape with financialsAttested=false → 2", () => {
    expect(
      computeVerificationLevel({ ...RUNG_INPUTS[3], financialsAttested: false }),
    ).toBe(2);
  });

  it("L4 shape with independentlyAudited=false → 3", () => {
    expect(
      computeVerificationLevel({ ...RUNG_INPUTS[4], independentlyAudited: false }),
    ).toBe(3);
  });

  it("L5 shape with continuouslyMonitored=false → 4", () => {
    expect(
      computeVerificationLevel({
        ...RUNG_INPUTS[5],
        continuouslyMonitored: false,
      }),
    ).toBe(4);
  });

  it("L5 shape with abrConfirmed=false → 1 (crashes past L2 predicate)", () => {
    expect(
      computeVerificationLevel({ ...RUNG_INPUTS[5], abrConfirmed: false }),
    ).toBe(1);
  });

  it("L5 shape with abrStatus=Cancelled → 1", () => {
    expect(
      computeVerificationLevel({ ...RUNG_INPUTS[5], abrStatus: "Cancelled" }),
    ).toBe(1);
  });

  it("L5 shape with financialsAttested=false → 2 (audit alone can't rescue L3)", () => {
    expect(
      computeVerificationLevel({
        ...RUNG_INPUTS[5],
        financialsAttested: false,
      }),
    ).toBe(2);
  });

  it("L5 shape with hasBusinessId=false → 0", () => {
    expect(
      computeVerificationLevel({ ...RUNG_INPUTS[5], hasBusinessId: false }),
    ).toBe(0);
  });
});

describe("computeVerificationLevel · L4-without-audit edge cases (1 case)", () => {
  it("L3 shape + continuouslyMonitored=true (but no audit) → 3", () => {
    // Continuous monitoring on its own can't skip the audit rung.
    expect(
      computeVerificationLevel({
        ...RUNG_INPUTS[3],
        continuouslyMonitored: true,
      }),
    ).toBe(3);
  });
});
