// Tests for lib/compliance-checker.ts — the pure signals-in / ComplianceItem[]-out
// engine that seeds the /workspace compliance widget + is referenced by the P6
// AusIndustry / ESIC gates track in atlassian-standard-mapping-goal.md.

import { describe, it, expect } from "vitest";

import {
  checkCompliance,
  complianceScore,
  type ComplianceItem,
} from "./compliance-checker";

const ITEM_IDS = [
  "abn",
  "share-register",
  "sha",
  "esic",
  "rnd",
  "pitch-deck",
  "financial-model",
  "data-room",
  "esop",
  "vesting",
  "ip",
  "contracts",
] as const;

function byId(items: ComplianceItem[], id: string): ComplianceItem {
  const found = items.find((i) => i.id === id);
  if (!found) throw new Error(`missing item ${id}`);
  return found;
}

describe("checkCompliance — envelope shape", () => {
  it("returns all 12 canonical items with unique ids", () => {
    const items = checkCompliance({});
    expect(items).toHaveLength(12);
    const ids = new Set(items.map((i) => i.id));
    expect(ids.size).toBe(12);
    for (const id of ITEM_IDS) expect(ids.has(id)).toBe(true);
  });

  it("tolerates a null/undefined analysis without throwing", () => {
    expect(() => checkCompliance(undefined)).not.toThrow();
    expect(() => checkCompliance(null)).not.toThrow();
    const items = checkCompliance(undefined);
    expect(items).toHaveLength(12);
  });

  it("every item carries category / title / description / status / priority", () => {
    const items = checkCompliance({});
    for (const it of items) {
      expect(["corporate", "tax", "investor", "employment", "ip"]).toContain(it.category);
      expect(it.title).toBeTruthy();
      expect(it.description).toBeTruthy();
      expect(["pass", "warning", "fail", "unknown"]).toContain(it.status);
      expect(["P0", "P1", "P2"]).toContain(it.priority);
    }
  });
});

describe("checkCompliance — corporate branch (ABN / register / SHA)", () => {
  it("ABN = fail with action when hasABN falsy; regulation cites Corporations Act 2001", () => {
    const item = byId(checkCompliance({ signals: {} }), "abn");
    expect(item.status).toBe("fail");
    expect(item.priority).toBe("P0");
    expect(item.action).toMatch(/ASIC|ABN/);
    expect(item.regulation).toBe("Corporations Act 2001");
  });

  it("ABN = pass with no action when hasABN true", () => {
    const item = byId(checkCompliance({ signals: { hasABN: true } }), "abn");
    expect(item.status).toBe("pass");
    expect(item.action).toBeUndefined();
  });

  it("Share Register = warning (not fail) when hasCapTable falsy; regulation cites s169", () => {
    const item = byId(checkCompliance({ signals: {} }), "share-register");
    expect(item.status).toBe("warning");
    expect(item.priority).toBe("P0");
    expect(item.regulation).toBe("Corporations Act s169");
  });

  it("Share Register = pass when hasCapTable true", () => {
    const item = byId(
      checkCompliance({ signals: { hasCapTable: true } }),
      "share-register",
    );
    expect(item.status).toBe("pass");
    expect(item.action).toBeUndefined();
  });

  it("SHA defaults to warning at P1 when hasShareholdersAgreement falsy", () => {
    const item = byId(checkCompliance({ signals: {} }), "sha");
    expect(item.status).toBe("warning");
    expect(item.priority).toBe("P1");
    expect(item.link).toBe("/workspace/data-room");
  });

  it("SHA flips to pass when hasShareholdersAgreement true", () => {
    const item = byId(
      checkCompliance({ signals: { hasShareholdersAgreement: true } }),
      "sha",
    );
    expect(item.status).toBe("pass");
    expect(item.action).toBeUndefined();
  });
});

describe("checkCompliance — tax branch (ESIC / R&D)", () => {
  it("ESIC = warning while stage ≤ 3 (early-stage window)", () => {
    for (const stage of [0, 1, 2, 3]) {
      const item = byId(checkCompliance({ stage }), "esic");
      expect(item.status).toBe("warning");
    }
  });

  it("ESIC = unknown once stage > 3 (past early-stage window)", () => {
    const item = byId(checkCompliance({ stage: 4 }), "esic");
    expect(item.status).toBe("unknown");
  });

  it("ESIC missing stage defaults (analysis.stage ?? 0) to warning branch", () => {
    // stage ?? 0 → 0 ≤ 3 → warning
    const item = byId(checkCompliance({ signals: {} }), "esic");
    expect(item.status).toBe("warning");
    expect(item.regulation).toBe("Income Tax Assessment Act 1997 Div 360");
  });

  it("R&D = warning when hasProduct OR hasSourceCode is true", () => {
    const withProduct = byId(
      checkCompliance({ signals: { hasProduct: true } }),
      "rnd",
    );
    const withSource = byId(
      checkCompliance({ signals: { hasSourceCode: true } }),
      "rnd",
    );
    expect(withProduct.status).toBe("warning");
    expect(withSource.status).toBe("warning");
  });

  it("R&D = unknown when neither hasProduct nor hasSourceCode set", () => {
    const item = byId(checkCompliance({ signals: {} }), "rnd");
    expect(item.status).toBe("unknown");
    expect(item.regulation).toBe("Industry Research and Development Act 1986");
  });
});

describe("checkCompliance — investor readiness (pitch / model / dataroom)", () => {
  it("Pitch Deck / Financial Model / Data Room = warning without signals", () => {
    const items = checkCompliance({ signals: {} });
    for (const id of ["pitch-deck", "financial-model", "data-room"] as const) {
      const it = byId(items, id);
      expect(it.status).toBe("warning");
      expect(it.priority).toBe("P1");
      expect(it.link).toBe("/workspace/data-room");
    }
  });

  it("Pitch Deck / Financial Model / Data Room = pass when their signals set", () => {
    const items = checkCompliance({
      signals: {
        hasPitchDeck: true,
        hasFinancialModel: true,
        hasDataRoom: true,
      },
    });
    for (const id of ["pitch-deck", "financial-model", "data-room"] as const) {
      const it = byId(items, id);
      expect(it.status).toBe("pass");
      expect(it.action).toBeUndefined();
    }
  });
});

describe("checkCompliance — employment branch (ESOP / vesting)", () => {
  it("ESOP = unknown when stage < 2 and esopAllocated falsy", () => {
    for (const stage of [0, 1]) {
      const item = byId(checkCompliance({ stage, signals: {} }), "esop");
      expect(item.status).toBe("unknown");
    }
  });

  it("ESOP = warning at stage >= 2 when esopAllocated falsy", () => {
    for (const stage of [2, 3, 4]) {
      const item = byId(checkCompliance({ stage, signals: {} }), "esop");
      expect(item.status).toBe("warning");
    }
  });

  it("ESOP = pass whenever esopAllocated is true, regardless of stage", () => {
    const early = byId(
      checkCompliance({ stage: 0, signals: { esopAllocated: true } }),
      "esop",
    );
    const late = byId(
      checkCompliance({ stage: 4, signals: { esopAllocated: true } }),
      "esop",
    );
    expect(early.status).toBe("pass");
    expect(late.status).toBe("pass");
    expect(early.regulation).toBe("Corporations Act s1100Z");
  });

  it("Vesting defaults to warning at P1; flips to pass when hasVesting", () => {
    const missing = byId(checkCompliance({ signals: {} }), "vesting");
    const set = byId(
      checkCompliance({ signals: { hasVesting: true } }),
      "vesting",
    );
    expect(missing.status).toBe("warning");
    expect(missing.priority).toBe("P1");
    expect(set.status).toBe("pass");
    expect(set.action).toBeUndefined();
  });
});

describe("checkCompliance — IP branch (assignment / contracts)", () => {
  it("IP = warning without hasIPProtection; pass with it", () => {
    const missing = byId(checkCompliance({ signals: {} }), "ip");
    const set = byId(
      checkCompliance({ signals: { hasIPProtection: true } }),
      "ip",
    );
    expect(missing.status).toBe("warning");
    expect(missing.priority).toBe("P1");
    expect(set.status).toBe("pass");
  });

  it("Contracts = warning without hasContracts; pass with it (no link either way)", () => {
    const missing = byId(checkCompliance({ signals: {} }), "contracts");
    const set = byId(
      checkCompliance({ signals: { hasContracts: true } }),
      "contracts",
    );
    expect(missing.status).toBe("warning");
    expect(missing.action).toMatch(/ToS|Privacy/);
    expect(set.status).toBe("pass");
    expect(set.action).toBeUndefined();
    // Contracts item intentionally has no link (only action + description).
    expect(missing.link).toBeUndefined();
    expect(set.link).toBeUndefined();
  });
});

describe("checkCompliance — sort invariant", () => {
  it("sorts primarily by priority P0 → P1 → P2", () => {
    const items = checkCompliance({});
    const priorities = items.map((i) => i.priority);
    const rank = { P0: 0, P1: 1, P2: 2 } as const;
    for (let i = 1; i < priorities.length; i++) {
      expect(rank[priorities[i]]).toBeGreaterThanOrEqual(rank[priorities[i - 1]]);
    }
  });

  it("within a priority, sorts by status fail → warning → unknown → pass", () => {
    // Configure a mix where every priority tier has multiple statuses.
    const items = checkCompliance({
      stage: 3,
      signals: { hasABN: true, hasCapTable: false, hasShareholdersAgreement: true },
    });
    const rank = { fail: 0, warning: 1, unknown: 2, pass: 3 } as const;
    for (const p of ["P0", "P1", "P2"] as const) {
      const slice = items.filter((i) => i.priority === p);
      for (let i = 1; i < slice.length; i++) {
        expect(rank[slice[i].status]).toBeGreaterThanOrEqual(rank[slice[i - 1].status]);
      }
    }
  });

  it("places the P0 ABN=fail row ahead of every P1 row", () => {
    const items = checkCompliance({ signals: {} });
    const abnIdx = items.findIndex((i) => i.id === "abn");
    const firstP1 = items.findIndex((i) => i.priority === "P1");
    expect(abnIdx).toBeLessThan(firstP1);
    expect(items[abnIdx].status).toBe("fail");
  });
});

describe("complianceScore", () => {
  it("returns 0 when nothing passes", () => {
    const items = checkCompliance({ signals: {} });
    expect(complianceScore(items)).toBe(0);
  });

  it("returns 100 when every item passes", () => {
    const items = checkCompliance({
      stage: 5, // past ESIC window → unknown, not pass; adjust below
      signals: {
        hasABN: true,
        hasCapTable: true,
        hasShareholdersAgreement: true,
        hasProduct: true,
        hasSourceCode: true,
        hasPitchDeck: true,
        hasFinancialModel: true,
        hasDataRoom: true,
        esopAllocated: true,
        hasVesting: true,
        hasIPProtection: true,
        hasContracts: true,
      },
    });
    // ESIC + R&D never emit 'pass' — score reflects real coverage of pass-capable items.
    // Force all statuses to pass to isolate the arithmetic.
    const forced = items.map((i) => ({ ...i, status: "pass" as const }));
    expect(complianceScore(forced)).toBe(100);
  });

  it("rounds fractional pass ratios to the nearest integer percent", () => {
    // 5 pass / 12 items = 41.66..% → 42
    const items = checkCompliance({
      signals: {
        hasABN: true,
        hasCapTable: true,
        hasShareholdersAgreement: true,
        hasPitchDeck: true,
        hasFinancialModel: true,
      },
    });
    expect(complianceScore(items)).toBe(42);
  });
});
