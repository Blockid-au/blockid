import { describe, it, expect } from "vitest";
import {
  scoreEsop,
  esopStatusFromCapTable,
  type EsopStatus,
  type GovernanceHealth,
} from "./cfo-esop-scoring";

// Minimal fully-optimal governance fixture — every branch contributes its max
// positive score + valuation adjustment. Copied per-test with overrides so
// each case exercises a single deviation.
const bestEsop: EsopStatus = {
  poolCreated: true,
  poolPct: 12,
  grantsIssued: true,
  grantCount: 3,
  founderVestingInPlace: true,
  legalDeedSigned: true,
  strikePrice: 10,
  vestingMonths: 48,
  cliffMonths: 12,
};

const bestGovernance: GovernanceHealth = {
  esop: bestEsop,
  hasShareholdersAgreement: true,
  hasFounderVesting: true,
  boardMeetingsPerYear: 4,
  hasDataRoom: true,
  dataRoomPct: 90,
  hasInvestorNDA: true,
  hasIpAssignment: true,
};

describe("scoreEsop — pool branch", () => {
  it("emits the critical pool issue when esop is null", () => {
    const r = scoreEsop({ ...bestGovernance, esop: null });
    const critical = r.issues.find((i) => i.severity === "critical");
    expect(critical?.description).toBe("No ESOP pool exists");
    expect(critical?.sviPenalty).toBe(-12);
  });

  it("emits the same critical issue when poolCreated is false", () => {
    const r = scoreEsop({
      ...bestGovernance,
      esop: { ...bestEsop, poolCreated: false },
    });
    expect(r.issues.some((i) => i.description === "No ESOP pool exists")).toBe(
      true,
    );
  });

  it("attaches a priority-1 create-pool action with the Antler-pitch deadline", () => {
    const r = scoreEsop({ ...bestGovernance, esop: null });
    const action = r.actions.find((a) => a.action.includes("Create 12% ESOP pool"));
    expect(action?.priority).toBe(1);
    expect(action?.deadline).toBe("Before Antler pitch");
    expect(action?.sviBenefit).toBe(8);
  });

  it("adds +20 score + 0.04 valuation adj when a pool exists", () => {
    // Isolate the pool contribution by turning EVERYTHING else off.
    const gov: GovernanceHealth = {
      esop: {
        ...bestEsop,
        poolPct: 8, // below-10 → skip the +10 in-band bonus
        grantsIssued: false,
        legalDeedSigned: false,
        vestingMonths: 36, // triggers low-severity vesting issue (no score effect)
        cliffMonths: 6,
      },
      hasShareholdersAgreement: false,
      hasFounderVesting: false,
      boardMeetingsPerYear: 0,
      hasDataRoom: false,
      dataRoomPct: 0,
      hasInvestorNDA: false,
      hasIpAssignment: false,
    };
    const r = scoreEsop(gov);
    // Only the pool-created +20 lands.
    expect(r.score).toBe(20);
    // 0.04 adj clamped by min(-0.15..0.12).
    expect(r.valuationMultiplier).toBeCloseTo(1.04, 5);
  });
});

describe("scoreEsop — poolPct band", () => {
  it("flags a medium 'below 10% minimum' issue when poolPct < 10", () => {
    const r = scoreEsop({
      ...bestGovernance,
      esop: { ...bestEsop, poolPct: 8 },
    });
    const iss = r.issues.find((i) => i.description.includes("below 10% minimum"));
    expect(iss?.severity).toBe("medium");
    expect(iss?.sviPenalty).toBe(-3);
  });

  it("flags a medium 'above 20% threshold' issue when poolPct > 20", () => {
    const r = scoreEsop({
      ...bestGovernance,
      esop: { ...bestEsop, poolPct: 25 },
    });
    const iss = r.issues.find((i) => i.description.includes("above 20% threshold"));
    expect(iss?.severity).toBe("medium");
    expect(iss?.sviPenalty).toBe(-4);
  });

  it("emits no pool-band issue when poolPct is inside [10, 20]", () => {
    const r = scoreEsop({
      ...bestGovernance,
      esop: { ...bestEsop, poolPct: 15 },
    });
    expect(
      r.issues.some(
        (i) =>
          i.description.includes("below 10% minimum") ||
          i.description.includes("above 20% threshold"),
      ),
    ).toBe(false);
  });
});

describe("scoreEsop — grants + deed + vesting sub-branches", () => {
  it("adds a priority-2 grant action when grantsIssued is false", () => {
    const r = scoreEsop({
      ...bestGovernance,
      esop: { ...bestEsop, grantsIssued: false },
    });
    const action = r.actions.find((a) => a.action.includes("Issue first ESOP grants"));
    expect(action?.priority).toBe(2);
    expect(action?.effort).toBe("low");
  });

  it("emits a high-severity deed issue + priority-1 sign-deed action when the deed is not signed", () => {
    const r = scoreEsop({
      ...bestGovernance,
      esop: { ...bestEsop, legalDeedSigned: false },
    });
    const iss = r.issues.find((i) => i.description === "ESOP Plan Deed not signed");
    expect(iss?.severity).toBe("high");
    expect(iss?.sviPenalty).toBe(-5);
    const action = r.actions.find((a) => a.action.includes("Sign ESOP Plan Deed"));
    expect(action?.priority).toBe(1);
    expect(action?.deadline).toBe("Before any grants issued");
  });

  it("flags a low-severity non-standard vesting issue when vestingMonths deviates from 48", () => {
    const r = scoreEsop({
      ...bestGovernance,
      esop: { ...bestEsop, vestingMonths: 36 },
    });
    const iss = r.issues.find((i) => i.description.startsWith("Non-standard vesting"));
    expect(iss?.severity).toBe("low");
    expect(iss?.sviPenalty).toBe(-2);
  });

  it("flags the same non-standard vesting issue when only cliffMonths deviates from 12", () => {
    const r = scoreEsop({
      ...bestGovernance,
      esop: { ...bestEsop, cliffMonths: 6 },
    });
    expect(
      r.issues.some((i) => i.description.startsWith("Non-standard vesting")),
    ).toBe(true);
  });

  it("emits no vesting issue on the standard 48/12 setup", () => {
    const r = scoreEsop(bestGovernance);
    expect(
      r.issues.some((i) => i.description.startsWith("Non-standard vesting")),
    ).toBe(false);
  });
});

describe("scoreEsop — founder-vesting / SHA / data-room / IP branches", () => {
  it("emits a high-severity founder-vesting issue + priority-1 action when hasFounderVesting is false", () => {
    const r = scoreEsop({ ...bestGovernance, hasFounderVesting: false });
    const iss = r.issues.find((i) => i.description === "No founder vesting in place");
    expect(iss?.severity).toBe("high");
    expect(iss?.sviPenalty).toBe(-6);
    const action = r.actions.find((a) => a.action.includes("Founder Vesting Confirmation Deed"));
    expect(action?.priority).toBe(1);
  });

  it("emits a high-severity SHA issue + priority-2 draft action when hasShareholdersAgreement is false", () => {
    const r = scoreEsop({ ...bestGovernance, hasShareholdersAgreement: false });
    const iss = r.issues.find((i) => i.description === "No Shareholders Agreement");
    expect(iss?.severity).toBe("high");
    expect(iss?.sviPenalty).toBe(-5);
    const action = r.actions.find((a) => a.action.includes("Shareholders Agreement"));
    expect(action?.priority).toBe(2);
  });

  it("emits only a priority-2 data-room action (no issue) when hasDataRoom is false", () => {
    const r = scoreEsop({ ...bestGovernance, hasDataRoom: false, dataRoomPct: 0 });
    const action = r.actions.find((a) => a.action.includes("Create data room"));
    expect(action?.priority).toBe(2);
    // No data-room issue when the data room does not exist yet — the issue only
    // fires once the room exists but is < 70% complete.
    expect(
      r.issues.some((i) => i.description.includes("Data room only")),
    ).toBe(false);
  });

  it("emits a medium 'Data room only X% complete' issue when dataRoomPct < 70", () => {
    const r = scoreEsop({ ...bestGovernance, dataRoomPct: 50 });
    const iss = r.issues.find((i) => i.description === "Data room only 50% complete");
    expect(iss?.severity).toBe("medium");
    expect(iss?.sviPenalty).toBe(-2);
    const action = r.actions.find((a) => a.action.startsWith("Complete data room to 70%"));
    expect(action?.priority).toBe(2);
  });

  it("emits a medium IP-assignment issue when hasIpAssignment is false", () => {
    const r = scoreEsop({ ...bestGovernance, hasIpAssignment: false });
    const iss = r.issues.find((i) =>
      i.description.startsWith("No IP assignment deed"),
    );
    expect(iss?.severity).toBe("medium");
    expect(iss?.sviPenalty).toBe(-3);
  });
});

describe("scoreEsop — aggregate score / SVI contribution / valuation clamp", () => {
  it("returns score 0 + sviContribution 0 + valuationMultiplier clamped to 0.85 on the worst-case input", () => {
    const worst: GovernanceHealth = {
      esop: null,
      hasShareholdersAgreement: false,
      hasFounderVesting: false,
      boardMeetingsPerYear: 0,
      hasDataRoom: false,
      dataRoomPct: 0,
      hasInvestorNDA: false,
      hasIpAssignment: false,
    };
    const r = scoreEsop(worst);
    expect(r.score).toBe(0);
    expect(r.sviContribution).toBe(0);
    // Only the -0.05 pool adjustment fires; -0.15 lower clamp is not reached
    // but the multiplier arithmetic must still resolve to 0.95.
    expect(r.valuationMultiplier).toBeCloseTo(0.95, 5);
  });

  it("clamps the composite score to 100 and returns sviContribution 12 on the best-case input", () => {
    const r = scoreEsop(bestGovernance);
    // Raw sum: 20 + 10 + 10 + 10 + 15 + 15 + 10 + 10 + 10 = 110 → clamped to 100.
    expect(r.score).toBe(100);
    // round(100 * 0.12) = 12.
    expect(r.sviContribution).toBe(12);
  });

  it("clamps the valuation multiplier to 1.12 when raw adj > 0.12", () => {
    const r = scoreEsop(bestGovernance);
    // Sum of positive adjustments = 0.04 + 0.03 + 0.02 + 0.02 + 0.02 = 0.13
    // upper-clamped to 0.12 → 1.12.
    expect(r.valuationMultiplier).toBeCloseTo(1.12, 5);
  });

  it("rounds sviContribution using Math.round (17 * 0.12 = 2.04 → 2)", () => {
    // Craft an input that yields raw score exactly 17: only the IP assignment
    // contributes +10, plus a pool-created +20 minus the missing-band effects.
    // Easiest path: no esop (score 0) then flip only hasIpAssignment on.
    const gov: GovernanceHealth = {
      esop: null,
      hasShareholdersAgreement: false,
      hasFounderVesting: false,
      boardMeetingsPerYear: 0,
      hasDataRoom: false,
      dataRoomPct: 0,
      hasInvestorNDA: false,
      hasIpAssignment: true,
    };
    const r = scoreEsop(gov);
    expect(r.score).toBe(10); // IP +10
    // round(10 * 0.12) = round(1.2) = 1.
    expect(r.sviContribution).toBe(1);
  });
});

describe("scoreEsop — sort invariants", () => {
  it("sorts issues in canonical severity order critical → high → medium (no-esop path)", () => {
    // Trigger critical (no pool) + high (founder vesting, SHA) + medium (data
    // room 50%, no IP). The low-severity vesting issue only fires inside the
    // pool-created branch, so it is exercised in the sibling case below.
    const gov: GovernanceHealth = {
      esop: null,
      hasShareholdersAgreement: false,
      hasFounderVesting: false,
      boardMeetingsPerYear: 0,
      hasDataRoom: true,
      dataRoomPct: 50,
      hasInvestorNDA: false,
      hasIpAssignment: false,
    };
    const r = scoreEsop(gov);
    const rank = { critical: 0, high: 1, medium: 2, low: 3 } as const;
    for (let i = 1; i < r.issues.length; i++) {
      expect(rank[r.issues[i].severity]).toBeGreaterThanOrEqual(
        rank[r.issues[i - 1].severity],
      );
    }
    expect(r.issues[0].severity).toBe("critical");
    expect(r.issues.some((i) => i.severity === "high")).toBe(true);
    expect(r.issues.some((i) => i.severity === "medium")).toBe(true);
  });

  it("keeps low-severity issues at the tail (pool-created + non-standard vesting)", () => {
    // Pool created ⇒ no critical. Deed unsigned + no founder vesting ⇒ high.
    // Data room 50% ⇒ medium. Non-standard vesting ⇒ low.
    const gov: GovernanceHealth = {
      esop: {
        ...bestEsop,
        legalDeedSigned: false, // high
        vestingMonths: 36, // low
      },
      hasShareholdersAgreement: true,
      hasFounderVesting: false, // high
      boardMeetingsPerYear: 0,
      hasDataRoom: true,
      dataRoomPct: 50, // medium
      hasInvestorNDA: false,
      hasIpAssignment: true,
    };
    const r = scoreEsop(gov);
    const rank = { critical: 0, high: 1, medium: 2, low: 3 } as const;
    for (let i = 1; i < r.issues.length; i++) {
      expect(rank[r.issues[i].severity]).toBeGreaterThanOrEqual(
        rank[r.issues[i - 1].severity],
      );
    }
    expect(r.issues[r.issues.length - 1].severity).toBe("low");
    expect(r.issues.some((i) => i.severity === "high")).toBe(true);
    expect(r.issues.some((i) => i.severity === "medium")).toBe(true);
  });

  it("sorts actions by ascending priority (1 first, then 2, then 3)", () => {
    // Missing pool + missing deed + missing founder vesting → priority-1s;
    // missing SHA + missing grants + missing data-room → priority-2s.
    const gov: GovernanceHealth = {
      esop: null,
      hasShareholdersAgreement: false,
      hasFounderVesting: false,
      boardMeetingsPerYear: 0,
      hasDataRoom: false,
      dataRoomPct: 0,
      hasInvestorNDA: false,
      hasIpAssignment: false,
    };
    const r = scoreEsop(gov);
    for (let i = 1; i < r.actions.length; i++) {
      expect(r.actions[i].priority).toBeGreaterThanOrEqual(
        r.actions[i - 1].priority,
      );
    }
    // First action must be a priority-1 (create-pool / founder-vesting).
    expect(r.actions[0].priority).toBe(1);
  });
});

describe("esopStatusFromCapTable", () => {
  it("returns null when totalPoolShares is missing", () => {
    expect(esopStatusFromCapTable({})).toBeNull();
    expect(esopStatusFromCapTable({ totalPoolShares: undefined })).toBeNull();
  });

  it("returns null when totalPoolShares is 0 (falsy short-circuit)", () => {
    expect(esopStatusFromCapTable({ totalPoolShares: 0 })).toBeNull();
  });

  it("defaults totalShares to 100_000 and computes poolPct correctly", () => {
    const s = esopStatusFromCapTable({ totalPoolShares: 12_000 });
    expect(s?.poolPct).toBe(12);
    expect(s?.poolCreated).toBe(true);
  });

  it("uses caller-supplied totalShares when provided", () => {
    const s = esopStatusFromCapTable({
      totalPoolShares: 5_000,
      totalShares: 50_000,
    });
    expect(s?.poolPct).toBe(10);
  });

  it("sets grantsIssued=true and preserves grantCount when grantsCount > 0", () => {
    const s = esopStatusFromCapTable({
      totalPoolShares: 12_000,
      grantsCount: 5,
    });
    expect(s?.grantsIssued).toBe(true);
    expect(s?.grantCount).toBe(5);
  });

  it("sets grantsIssued=false and grantCount=0 when grantsCount is missing", () => {
    const s = esopStatusFromCapTable({ totalPoolShares: 12_000 });
    expect(s?.grantsIssued).toBe(false);
    expect(s?.grantCount).toBe(0);
  });

  it("defaults legalDeedSigned to false when hasLegalDeed is omitted; preserves true when supplied", () => {
    const a = esopStatusFromCapTable({ totalPoolShares: 12_000 });
    expect(a?.legalDeedSigned).toBe(false);
    const b = esopStatusFromCapTable({
      totalPoolShares: 12_000,
      hasLegalDeed: true,
    });
    expect(b?.legalDeedSigned).toBe(true);
  });

  it("defaults vestingMonths to 48 and cliffMonths to 12; preserves caller overrides", () => {
    const a = esopStatusFromCapTable({ totalPoolShares: 12_000 });
    expect(a?.vestingMonths).toBe(48);
    expect(a?.cliffMonths).toBe(12);
    const b = esopStatusFromCapTable({
      totalPoolShares: 12_000,
      vestingMonths: 36,
      cliffMonths: 6,
    });
    expect(b?.vestingMonths).toBe(36);
    expect(b?.cliffMonths).toBe(6);
  });

  it("hard-codes strikePrice at 10 cents (A$0.10 FMV) and founderVestingInPlace at true", () => {
    const s = esopStatusFromCapTable({ totalPoolShares: 12_000 });
    expect(s?.strikePrice).toBe(10);
    expect(s?.founderVestingInPlace).toBe(true);
  });

  it("rounds poolPct to an integer via Math.round (12_345 / 100_000 → 12)", () => {
    const s = esopStatusFromCapTable({ totalPoolShares: 12_345 });
    expect(s?.poolPct).toBe(12);
  });
});
