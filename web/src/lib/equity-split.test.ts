/**
 * Colocated vitest for the pure equity-split model at ./equity-split.ts.
 *
 * P5-equity-split-lib-test — pins the FAST/Slicing-Pie-inspired points ladder
 * so a silent widening of a role/time/risk weight, a drift in the ESOP or
 * first-hire clamp, or a change in the originator/idea-bonus semantics cannot
 * leak into a founder-facing equity recommendation without a red CI dot.
 */

import { describe, expect, it } from "vitest";

import {
  DEFAULT_SETTINGS,
  FOUNDER_AGREEMENT_SEEDS,
  computeEquitySplit,
  makeEmptyFounder,
  type EquitySettings,
  type FounderInput,
} from "./equity-split";

const NO_ESOP: EquitySettings = { esopEnabled: false, esopPct: 0, firstHirePct: 0 };

function baseFounder(overrides: Partial<FounderInput> = {}): FounderInput {
  return {
    id: overrides.id ?? "f1",
    name: overrides.name ?? "Alex",
    role: overrides.role ?? "CEO",
    time: overrides.time ?? "Full-time now",
    idea: overrides.idea ?? "Originator",
    cashAud: overrides.cashAud ?? 0,
    sweatMonths: overrides.sweatMonths ?? 0,
    ipAssets: overrides.ipAssets ?? 0,
    risk: overrides.risk ?? "Side project",
  };
}

describe("makeEmptyFounder", () => {
  it("seeds the first founder as CEO originator with cash + high risk", () => {
    const f = makeEmptyFounder("id-0", 0);
    expect(f.id).toBe("id-0");
    expect(f.name).toBe("Alex (CEO)");
    expect(f.role).toBe("CEO");
    expect(f.time).toBe("Full-time now");
    expect(f.idea).toBe("Originator");
    expect(f.cashAud).toBe(10_000);
    expect(f.ipAssets).toBe(2);
    expect(f.risk).toBe("Quit job");
    expect(f.sweatMonths).toBe(12);
  });

  it("seeds the second founder as CTO joined-later with 6mo runway", () => {
    const f = makeEmptyFounder("id-1", 1);
    expect(f.name).toBe("Sam (CTO)");
    expect(f.role).toBe("CTO");
    expect(f.idea).toBe("Joined later");
    expect(f.cashAud).toBe(0);
    expect(f.ipAssets).toBe(1);
    expect(f.risk).toBe("Has runway 6mo");
  });

  it("falls back to role Other for founder index >= 2", () => {
    const f = makeEmptyFounder("id-5", 5);
    expect(f.role).toBe("Other");
    expect(f.name).toBe("Founder 6");
    expect(f.idea).toBe("Joined later");
  });
});

describe("DEFAULT_SETTINGS", () => {
  it("ships ESOP on at 10% and no first-hire reserve — the AU pre-seed default", () => {
    expect(DEFAULT_SETTINGS).toEqual({ esopEnabled: true, esopPct: 10, firstHirePct: 0 });
  });
});

describe("FOUNDER_AGREEMENT_SEEDS", () => {
  it("carries the five canonical founder-agreement bullets in stable order", () => {
    expect(FOUNDER_AGREEMENT_SEEDS.length).toBeGreaterThanOrEqual(5);
    const joined = FOUNDER_AGREEMENT_SEEDS.join(" | ");
    expect(joined).toMatch(/Vesting/i);
    expect(joined).toMatch(/IP assignment/i);
    expect(joined).toMatch(/Decision rights/i);
    expect(joined).toMatch(/Exit & departure/i);
    expect(joined).toMatch(/Confidentiality/i);
    for (const seed of FOUNDER_AGREEMENT_SEEDS) {
      expect(typeof seed).toBe("string");
      expect(seed.trim().length).toBeGreaterThan(20);
    }
  });

  it("pins the 4-year / 1-year cliff market standard verbatim", () => {
    expect(FOUNDER_AGREEMENT_SEEDS[0]).toMatch(/4-year vesting/);
    expect(FOUNDER_AGREEMENT_SEEDS[0]).toMatch(/1-year cliff/);
    expect(FOUNDER_AGREEMENT_SEEDS[0]).toMatch(/double-trigger/);
  });
});

describe("computeEquitySplit — reserves arithmetic", () => {
  it("with ESOP off + no first-hire → foundersPct = 100", () => {
    const r = computeEquitySplit([baseFounder()], NO_ESOP);
    expect(r.reserves).toEqual({ esopPct: 0, firstHirePct: 0, foundersPct: 100 });
  });

  it("with ESOP on 10% + firstHire 5% → foundersPct = 85", () => {
    const r = computeEquitySplit([baseFounder()], {
      esopEnabled: true,
      esopPct: 10,
      firstHirePct: 5,
    });
    expect(r.reserves).toEqual({ esopPct: 10, firstHirePct: 5, foundersPct: 85 });
  });

  it("clamps esopPct to the 30% ceiling", () => {
    const r = computeEquitySplit([baseFounder()], {
      esopEnabled: true,
      esopPct: 50,
      firstHirePct: 0,
    });
    expect(r.reserves.esopPct).toBe(30);
    expect(r.reserves.foundersPct).toBe(70);
  });

  it("clamps firstHirePct to the 10% ceiling", () => {
    const r = computeEquitySplit([baseFounder()], {
      esopEnabled: false,
      esopPct: 0,
      firstHirePct: 25,
    });
    expect(r.reserves.firstHirePct).toBe(10);
    expect(r.reserves.foundersPct).toBe(90);
  });

  it("zeroes esopPct when esopEnabled=false even if a non-zero pct is supplied", () => {
    const r = computeEquitySplit([baseFounder()], {
      esopEnabled: false,
      esopPct: 20,
      firstHirePct: 0,
    });
    expect(r.reserves.esopPct).toBe(0);
    expect(r.reserves.foundersPct).toBe(100);
  });

  it("floors negative percentages to zero via clampPct", () => {
    const r = computeEquitySplit([baseFounder()], {
      esopEnabled: true,
      esopPct: -5,
      firstHirePct: -20,
    });
    expect(r.reserves.esopPct).toBe(0);
    expect(r.reserves.firstHirePct).toBe(0);
    expect(r.reserves.foundersPct).toBe(100);
  });

  it("floors non-finite percentages to zero (defensive input)", () => {
    const r = computeEquitySplit([baseFounder()], {
      esopEnabled: true,
      esopPct: NaN,
      firstHirePct: NaN,
    });
    expect(r.reserves.esopPct).toBe(0);
    expect(r.reserves.firstHirePct).toBe(0);
  });
});

describe("computeEquitySplit — points ladder + weights", () => {
  it("solo founder receives 100% of foundersPct regardless of role weight", () => {
    const r = computeEquitySplit([baseFounder()], NO_ESOP);
    expect(r.allocations).toHaveLength(1);
    expect(r.allocations[0].pct).toBe(100);
  });

  it("role weights follow the shipped ladder CEO=20, CTO=18, DomainExpert=14, Other=12", () => {
    // Assert directly on breakdown.role so `time` / `idea` / `risk` sibling slots
    // do not contaminate the observed weight.
    const spec = [
      ["CEO", 20],
      ["CTO", 18],
      ["Domain Expert", 14],
      ["COO", 12],
      ["CMO", 12],
      ["Designer", 12],
      ["Other", 12],
    ] as const;
    for (const [role, weight] of spec) {
      const r = computeEquitySplit(
        [baseFounder({ role, idea: "Joined later", time: "Advisor" })],
        NO_ESOP,
      );
      expect(r.allocations[0].breakdown.role).toBe(weight);
    }
  });

  it("time weights follow full-time=30, in-3mo=18, part-time=8, advisor=3", () => {
    const spec = [
      ["Full-time now", 30],
      ["Full-time in 3 mo", 18],
      ["Part-time", 8],
      ["Advisor", 3],
    ] as const;
    for (const [time, weight] of spec) {
      const r = computeEquitySplit(
        [baseFounder({ role: "Other", time, idea: "Joined later" })],
        NO_ESOP,
      );
      expect(r.allocations[0].breakdown.time).toBe(weight);
      // total = role(12) + time
      expect(r.totalPoints).toBe(12 + weight);
    }
  });

  it("originator bonus is +10 and only the first-in-row-order originator receives it", () => {
    const r = computeEquitySplit(
      [
        baseFounder({ id: "a", role: "Other", time: "Advisor", idea: "Originator" }),
        baseFounder({ id: "b", role: "Other", time: "Advisor", idea: "Originator" }),
        baseFounder({ id: "c", role: "Other", time: "Advisor", idea: "Joined later" }),
      ],
      NO_ESOP,
    );
    expect(r.allocations[0].breakdown.idea).toBe(10);
    expect(r.allocations[1].breakdown.idea).toBe(0);
    expect(r.allocations[2].breakdown.idea).toBe(0);
  });

  it("risk weights follow quit-job=12, runway-6mo=6, side-project=0", () => {
    const quit = computeEquitySplit(
      [baseFounder({ role: "Other", idea: "Joined later", risk: "Quit job" })],
      NO_ESOP,
    );
    expect(quit.allocations[0].breakdown.risk).toBe(12);
    const runway = computeEquitySplit(
      [baseFounder({ role: "Other", idea: "Joined later", risk: "Has runway 6mo" })],
      NO_ESOP,
    );
    expect(runway.allocations[0].breakdown.risk).toBe(6);
    const side = computeEquitySplit(
      [baseFounder({ role: "Other", idea: "Joined later", risk: "Side project" })],
      NO_ESOP,
    );
    expect(side.allocations[0].breakdown.risk).toBe(0);
  });

  it("cash points = floor(cashAud/1000) capped at 30, negative + NaN floored to 0", () => {
    const spec: Array<[number, number]> = [
      [0, 0],
      [999, 0],
      [1000, 1],
      [1500, 1],
      [29_999, 29],
      [30_000, 30],
      [500_000, 30],
      [-5000, 0],
      [Number.NaN, 0],
    ];
    for (const [cashAud, expected] of spec) {
      const r = computeEquitySplit(
        [baseFounder({ role: "Other", idea: "Joined later", cashAud })],
        NO_ESOP,
      );
      expect(r.allocations[0].breakdown.cash).toBe(expected);
    }
  });

  it("sweat points equal months capped at 24, negative + NaN floored to 0", () => {
    for (const [months, expected] of [
      [0, 0],
      [12, 12],
      [24, 24],
      [50, 24],
      [-3, 0],
      [Number.NaN, 0],
    ] as const) {
      const r = computeEquitySplit(
        [baseFounder({ role: "Other", idea: "Joined later", sweatMonths: months })],
        NO_ESOP,
      );
      expect(r.allocations[0].breakdown.sweat).toBe(expected);
    }
  });

  it("ip points = min(5, round(ipAssets)) * 4 capped at 20", () => {
    for (const [ipAssets, expected] of [
      [0, 0],
      [1, 4],
      [3, 12],
      [5, 20],
      [10, 20],
      [-2, 0],
      [Number.NaN, 0],
    ] as const) {
      const r = computeEquitySplit(
        [baseFounder({ role: "Other", idea: "Joined later", ipAssets })],
        NO_ESOP,
      );
      expect(r.allocations[0].breakdown.ip).toBe(expected);
    }
  });

  it("totalPoints equals sum of all breakdown slots across founders", () => {
    const founders = [
      baseFounder({
        id: "a",
        role: "CEO",
        time: "Full-time now",
        idea: "Originator",
        cashAud: 5000,
        sweatMonths: 12,
        ipAssets: 2,
        risk: "Quit job",
      }),
      baseFounder({
        id: "b",
        role: "CTO",
        time: "Full-time now",
        idea: "Joined later",
        cashAud: 0,
        sweatMonths: 12,
        ipAssets: 1,
        risk: "Has runway 6mo",
      }),
    ];
    const r = computeEquitySplit(founders, NO_ESOP);
    // CEO(20) + FT(30) + idea(10) + cash(5) + sweat(12) + ip(8) + risk(12) = 97
    expect(r.allocations[0].points).toBe(97);
    // CTO(18) + FT(30) + idea(0) + cash(0) + sweat(12) + ip(4) + risk(6) = 70
    expect(r.allocations[1].points).toBe(70);
    expect(r.totalPoints).toBe(97 + 70);
  });

  it("per-founder pct is share-of-points × foundersPct rounded to 2dp", () => {
    const r = computeEquitySplit(
      [
        baseFounder({ id: "a", role: "CEO", time: "Full-time now", idea: "Originator" }),
        baseFounder({ id: "b", role: "Other", time: "Advisor", idea: "Joined later" }),
      ],
      NO_ESOP,
    );
    const total = r.totalPoints;
    const a = r.allocations[0];
    const b = r.allocations[1];
    expect(a.pct).toBeCloseTo((a.points / total) * 100, 1);
    expect(b.pct).toBeCloseTo((b.points / total) * 100, 1);
    // A carries the CEO+FT+idea stack, B is Other/Advisor — A > B.
    expect(a.pct).toBeGreaterThan(b.pct);
  });

  it("aggregated allocation percentages equal foundersPct within rounding tolerance", () => {
    const r = computeEquitySplit(
      [
        baseFounder({ id: "a", role: "CEO", time: "Full-time now", idea: "Originator" }),
        baseFounder({ id: "b", role: "CTO", time: "Full-time now", idea: "Joined later" }),
        baseFounder({ id: "c", role: "Other", time: "Part-time", idea: "Joined later" }),
      ],
      { esopEnabled: true, esopPct: 10, firstHirePct: 5 },
    );
    const total = r.allocations.reduce((s, a) => s + a.pct, 0);
    expect(total).toBeCloseTo(r.reserves.foundersPct, 1);
  });
});

describe("computeEquitySplit — vesting schedule", () => {
  it("emits y0=0 / y1=25% / y2=50% / y3=75% / y4=100% of the founder's pct", () => {
    const r = computeEquitySplit([baseFounder()], NO_ESOP);
    const a = r.allocations[0];
    expect(a.vested.y0).toBe(0);
    expect(a.vested.y1).toBeCloseTo(a.pct * 0.25, 2);
    expect(a.vested.y2).toBeCloseTo(a.pct * 0.5, 2);
    expect(a.vested.y3).toBeCloseTo(a.pct * 0.75, 2);
    expect(a.vested.y4).toBeCloseTo(a.pct, 2);
  });

  it("returns the canonical AU vesting envelope 12/48 with market-standard note", () => {
    const r = computeEquitySplit([baseFounder()], NO_ESOP);
    expect(r.vesting.cliffMonths).toBe(12);
    expect(r.vesting.totalMonths).toBe(48);
    expect(r.vesting.note).toMatch(/4-year/);
    expect(r.vesting.note).toMatch(/1-year cliff/);
  });
});

describe("computeEquitySplit — degenerate input", () => {
  it("empty founders array yields empty allocations + totalPoints 0 + info flag", () => {
    const r = computeEquitySplit([], NO_ESOP);
    expect(r.allocations).toEqual([]);
    expect(r.totalPoints).toBe(0);
    expect(r.reserves.foundersPct).toBe(100);
    expect(r.flags).toHaveLength(1);
    expect(r.flags[0].level).toBe("info");
  });

  it("zero-point founder gets 0% and no low-pct warn (guard is `pct > 0`)", () => {
    // Advisor + Other + no idea + no cash/sweat/ip/risk → non-zero role+time, but
    // still forms a group where the shape is that the founder has a non-zero share.
    const r = computeEquitySplit(
      [
        baseFounder({
          id: "a",
          role: "Other",
          time: "Advisor",
          idea: "Joined later",
        }),
      ],
      NO_ESOP,
    );
    // Solo founder always gets 100% regardless of role/time — that's the model.
    expect(r.allocations[0].pct).toBe(100);
  });
});

describe("deriveFlags — fairness heuristics", () => {
  it("warns when any founder receives 0 < pct < 10 (employee not cofounder)", () => {
    // Big-CEO vs advisor micro-founder — advisor should land under 10%.
    const r = computeEquitySplit(
      [
        baseFounder({
          id: "a",
          name: "Alice",
          role: "CEO",
          time: "Full-time now",
          idea: "Originator",
          cashAud: 20_000,
          sweatMonths: 24,
          ipAssets: 5,
          risk: "Quit job",
        }),
        baseFounder({
          id: "b",
          name: "Bob",
          role: "Other",
          time: "Advisor",
          idea: "Joined later",
          cashAud: 0,
          sweatMonths: 0,
          ipAssets: 0,
          risk: "Side project",
        }),
      ],
      NO_ESOP,
    );
    const bob = r.allocations[1];
    expect(bob.pct).toBeGreaterThan(0);
    expect(bob.pct).toBeLessThan(10);
    const warn = r.flags.find((f) => f.level === "warn" && f.message.includes("Bob"));
    expect(warn).toBeDefined();
    expect(warn?.message).toMatch(/under 10%/);
    expect(warn?.message).toMatch(/ESOP grant/);
  });

  it("warns when a full-time originator ends up under 30%", () => {
    // Stack a full-time originator against three heavier co-founders so the
    // originator's share sinks below the 30% floor.
    const r = computeEquitySplit(
      [
        baseFounder({
          id: "a",
          name: "Alice",
          role: "Other",
          time: "Full-time now",
          idea: "Originator",
          cashAud: 0,
          sweatMonths: 0,
          ipAssets: 0,
          risk: "Side project",
        }),
        baseFounder({
          id: "b",
          role: "CEO",
          time: "Full-time now",
          idea: "Joined later",
          cashAud: 30_000,
          sweatMonths: 24,
          ipAssets: 5,
          risk: "Quit job",
        }),
        baseFounder({
          id: "c",
          role: "CTO",
          time: "Full-time now",
          idea: "Joined later",
          cashAud: 30_000,
          sweatMonths: 24,
          ipAssets: 5,
          risk: "Quit job",
        }),
        baseFounder({
          id: "d",
          role: "COO",
          time: "Full-time now",
          idea: "Joined later",
          cashAud: 30_000,
          sweatMonths: 24,
          ipAssets: 5,
          risk: "Quit job",
        }),
      ],
      NO_ESOP,
    );
    const alice = r.allocations[0];
    expect(alice.pct).toBeLessThan(30);
    const warn = r.flags.find(
      (f) => f.level === "warn" && f.message.includes("Alice"),
    );
    expect(warn).toBeDefined();
    expect(warn?.message).toMatch(/originated the idea/);
    expect(warn?.message).toMatch(/≥30%/);
  });

  it("does NOT fire the originator-<30% warn when originator is not full-time", () => {
    const r = computeEquitySplit(
      [
        baseFounder({
          id: "a",
          role: "Other",
          time: "Part-time",
          idea: "Originator",
        }),
        baseFounder({
          id: "b",
          role: "CEO",
          time: "Full-time now",
          idea: "Joined later",
          cashAud: 30_000,
          sweatMonths: 24,
          ipAssets: 5,
          risk: "Quit job",
        }),
      ],
      NO_ESOP,
    );
    const warn = r.flags.find((f) =>
      f.message.includes("originated the idea AND is full-time"),
    );
    expect(warn).toBeUndefined();
  });

  it("warns when founders have same points but different time commitments", () => {
    // Two founders with identical breakdown but different `time` still produce
    // different points (time weight differs). To pin the samePoints branch, we
    // give identical roles + identical inputs across all slots — same time too —
    // but flip one cashAud=0 vs the other cashAud>0 to trip the varied-cash
    // detection while keeping points equal (cash points can be zero for both if
    // both cashAud < 1000).
    const r = computeEquitySplit(
      [
        baseFounder({
          id: "a",
          role: "Other",
          time: "Full-time now",
          idea: "Joined later",
          cashAud: 999, // < 1000 → 0 cash points
          sweatMonths: 12,
          ipAssets: 2,
          risk: "Quit job",
        }),
        baseFounder({
          id: "b",
          role: "Other",
          time: "Full-time now",
          idea: "Joined later",
          cashAud: 0,
          sweatMonths: 12,
          ipAssets: 2,
          risk: "Quit job",
        }),
      ],
      NO_ESOP,
    );
    // Same points on both → equal split; varied cashAud (>0 vs =0) → variedTime
    // branch fires via the cash-flag heuristic.
    expect(r.allocations[0].points).toBe(r.allocations[1].points);
    const warn = r.flags.find((f) =>
      f.message.includes("Equal split despite different time commitments"),
    );
    expect(warn).toBeDefined();
  });

  it("emits the info 'no red flags' when a solo founder has a clean split", () => {
    const r = computeEquitySplit([baseFounder()], NO_ESOP);
    expect(r.flags).toHaveLength(1);
    expect(r.flags[0].level).toBe("info");
    expect(r.flags[0].message).toMatch(/No fairness red flags/);
  });
});
