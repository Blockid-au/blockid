import { describe, it, expect } from "vitest";
import {
  computeNextBestActions,
  type DimensionScore,
  type NextBestAction,
} from "./cto-next-best-action";

const DIM_CODES = [
  "ftv",
  "mpc",
  "ptd",
  "tre",
  "cgh",
  "iri",
  "lco",
  "svm",
] as const;
type Code = (typeof DIM_CODES)[number];

const DIMENSION_LABELS: Record<Code, string> = {
  ftv: "Founder & Team Value",
  mpc: "Market & Problem Clarity",
  ptd: "Product & Technical Depth",
  tre: "Traction & Revenue Evidence",
  cgh: "Cap Table & Governance Health",
  iri: "Investor Readiness Index",
  lco: "Legal & Compliance",
  svm: "Strategic Vision & Moat",
};

const STAGE_LABELS = [
  "Concept",
  "Validated Idea",
  "MVP / Prototype",
  "Early Traction",
  "Revenue",
  "Growth",
  "Scale",
  "Corporation",
] as const;

const mkDim = (code: Code, score: number): DimensionScore => ({
  code,
  label: DIMENSION_LABELS[code],
  score,
  weight: 1,
  gaps: [],
});

const allLow = (): DimensionScore[] => DIM_CODES.map((c) => mkDim(c, 0));
const allHigh = (): DimensionScore[] => DIM_CODES.map((c) => mkDim(c, 100));

describe("computeNextBestActions — shape + defaults", () => {
  it("returns the documented envelope keys", () => {
    const result = computeNextBestActions({
      currentSvi: 50,
      stage: 2,
      dimensions: allHigh(),
    });
    expect(Object.keys(result).sort()).toEqual(
      [
        "actions",
        "currentSvi",
        "generatedAt",
        "projectedSvi",
        "stage",
        "stageLabel",
        "topInsight",
        "weakestDimension",
      ].sort(),
    );
  });

  it("echoes currentSvi + stage verbatim", () => {
    const result = computeNextBestActions({
      currentSvi: 77,
      stage: 4,
      dimensions: allHigh(),
    });
    expect(result.currentSvi).toBe(77);
    expect(result.stage).toBe(4);
  });

  it("generatedAt is a Z-suffixed ISO-8601 string that round-trips through Date.parse", () => {
    const result = computeNextBestActions({
      currentSvi: 0,
      stage: 0,
      dimensions: allHigh(),
    });
    expect(result.generatedAt.endsWith("Z")).toBe(true);
    expect(Number.isNaN(Date.parse(result.generatedAt))).toBe(false);
  });

  it("stageLabel resolves each valid stage 0..7 to the canonical STAGE_LABELS entry", () => {
    STAGE_LABELS.forEach((label, stage) => {
      const result = computeNextBestActions({
        currentSvi: 0,
        stage,
        dimensions: allHigh(),
      });
      expect(result.stageLabel).toBe(label);
    });
  });

  it("stageLabel falls back to 'Unknown' when stage is out of range", () => {
    const result = computeNextBestActions({
      currentSvi: 0,
      stage: 99,
      dimensions: allHigh(),
    });
    expect(result.stageLabel).toBe("Unknown");
  });
});

describe("computeNextBestActions — actions library gating", () => {
  it("emits zero actions when every dimension score is >= max threshold", () => {
    const result = computeNextBestActions({
      currentSvi: 90,
      stage: 3,
      dimensions: allHigh(),
    });
    expect(result.actions).toEqual([]);
  });

  it("fires exactly the 3 FTV actions when FTV alone is 0 (thresholds 40/55/70)", () => {
    const dims = DIM_CODES.map((c) => mkDim(c, c === "ftv" ? 0 : 100));
    const result = computeNextBestActions({
      currentSvi: 20,
      stage: 2,
      dimensions: dims,
    });
    expect(result.actions.map((a) => a.id).sort()).toEqual([
      "ftv-01",
      "ftv-02",
      "ftv-03",
    ]);
  });

  it("fires only the FTV P2 action when FTV score is between 55 and 70 (exclusive)", () => {
    const dims = DIM_CODES.map((c) => mkDim(c, c === "ftv" ? 60 : 100));
    const result = computeNextBestActions({
      currentSvi: 20,
      stage: 2,
      dimensions: dims,
    });
    expect(result.actions.map((a) => a.id)).toEqual(["ftv-03"]);
  });

  it("does not fire an action when the dim score equals the threshold (strict < gate)", () => {
    // ftv-01 threshold=40 → score=40 must NOT fire, score=39 must fire.
    const at = computeNextBestActions({
      currentSvi: 0,
      stage: 0,
      dimensions: DIM_CODES.map((c) => mkDim(c, c === "ftv" ? 40 : 100)),
    });
    expect(at.actions.map((a) => a.id)).not.toContain("ftv-01");

    const below = computeNextBestActions({
      currentSvi: 0,
      stage: 0,
      dimensions: DIM_CODES.map((c) => mkDim(c, c === "ftv" ? 39 : 100)),
    });
    expect(below.actions.map((a) => a.id)).toContain("ftv-01");
  });

  it("uses TRE-specific thresholds (35/50/65) not the 40/55/70 default", () => {
    // score 36 → tre-01 (thr=35) skipped, tre-02 (thr=50) + tre-03 (thr=65) fire
    const dims = DIM_CODES.map((c) => mkDim(c, c === "tre" ? 36 : 100));
    const result = computeNextBestActions({
      currentSvi: 0,
      stage: 0,
      dimensions: dims,
    });
    expect(result.actions.map((a) => a.id).sort()).toEqual([
      "tre-02",
      "tre-03",
    ]);
  });

  it("skips unknown dimension codes without throwing", () => {
    const dims = [
      mkDim("ftv", 100),
      { code: "xxx", label: "bogus", score: 0, weight: 1, gaps: [] } as unknown as DimensionScore,
    ];
    const result = computeNextBestActions({
      currentSvi: 0,
      stage: 0,
      dimensions: dims,
    });
    expect(result.actions).toEqual([]);
  });
});

describe("computeNextBestActions — sort order invariants", () => {
  const fullLow = () => allLow();

  it("returns at most 10 actions across all dimensions", () => {
    const result = computeNextBestActions({
      currentSvi: 0,
      stage: 0,
      dimensions: fullLow(),
    });
    expect(result.actions.length).toBeLessThanOrEqual(10);
  });

  it("sorts P0 actions strictly before P1, and P1 strictly before P2", () => {
    // Craft a set that yields exactly 1 action per priority so ordering is visible.
    // ftv @ 39 → ftv-01 (P0)   [thr 40]
    // ftv @ 45 also fires ftv-02+ftv-03; drop those by picking mpc/ptd differently.
    // Simpler: use ftv @ 45 → ftv-02 (P1) + ftv-03 (P2); no P0.
    // For a full 3-priority ordering demo, mix dims:
    const dims = [
      // ftv=39 fires ftv-01/02/03 (P0/P1/P2)
      mkDim("ftv", 39),
      // rest silent
      ...DIM_CODES.filter((c) => c !== "ftv").map((c) => mkDim(c, 100)),
    ];
    const result = computeNextBestActions({
      currentSvi: 0,
      stage: 0,
      dimensions: dims,
    });
    const priorityRank = { P0: 0, P1: 1, P2: 2 } as const;
    for (let i = 1; i < result.actions.length; i++) {
      expect(
        priorityRank[result.actions[i].priority] >=
          priorityRank[result.actions[i - 1].priority],
      ).toBe(true);
    }
  });

  it("within the same priority, sorts by sviBenefit descending", () => {
    // All-low → 10 P0 actions. Their sviBenefit must be monotone non-increasing.
    const result = computeNextBestActions({
      currentSvi: 0,
      stage: 0,
      dimensions: fullLow(),
    });
    const p0 = result.actions.filter((a) => a.priority === "P0");
    for (let i = 1; i < p0.length; i++) {
      expect(p0[i].sviBenefit).toBeLessThanOrEqual(p0[i - 1].sviBenefit);
    }
  });

  it("breaks sviBenefit ties by ascending effort (low < medium < high)", () => {
    // tre-01 (sviBenefit 20, high) vs lco-01 (sviBenefit 20, low) — lco-01 must precede.
    const dims: DimensionScore[] = [
      mkDim("tre", 0),
      mkDim("lco", 0),
      ...DIM_CODES.filter((c) => c !== "tre" && c !== "lco").map((c) => mkDim(c, 100)),
    ];
    const result = computeNextBestActions({
      currentSvi: 0,
      stage: 0,
      dimensions: dims,
    });
    const ids = result.actions.map((a) => a.id);
    expect(ids.indexOf("lco-01")).toBeLessThan(ids.indexOf("tre-01"));
  });

  it("global head-of-list on all-low input is ptd-01 (highest P0 sviBenefit at 25)", () => {
    const result = computeNextBestActions({
      currentSvi: 0,
      stage: 0,
      dimensions: fullLow(),
    });
    expect(result.actions[0].id).toBe("ptd-01");
    expect(result.actions[0].sviBenefit).toBe(25);
    expect(result.actions[0].priority).toBe("P0");
  });
});

describe("computeNextBestActions — projectedSvi arithmetic", () => {
  it("adds only the top 3 P0 sviBenefits to currentSvi", () => {
    // Top 3 P0 across all-low: ptd-01 (25) + lco-01 (20) + tre-01 (20) = 65
    const result = computeNextBestActions({
      currentSvi: 30,
      stage: 0,
      dimensions: allLow(),
    });
    expect(result.projectedSvi).toBe(30 + 65);
  });

  it("does not include P1 or P2 benefits in the projection", () => {
    // ftv @ 45 → ftv-02 (P1, +7) + ftv-03 (P2, +5). Zero P0. projected == current.
    const dims = DIM_CODES.map((c) => mkDim(c, c === "ftv" ? 45 : 100));
    const result = computeNextBestActions({
      currentSvi: 42,
      stage: 0,
      dimensions: dims,
    });
    expect(result.projectedSvi).toBe(42);
  });

  it("caps projectedSvi at 200 regardless of current + benefits sum", () => {
    const result = computeNextBestActions({
      currentSvi: 190,
      stage: 0,
      dimensions: allLow(),
    });
    expect(result.projectedSvi).toBe(200);
  });

  it("caps projectedSvi at 200 even when currentSvi alone exceeds 200", () => {
    const result = computeNextBestActions({
      currentSvi: 500,
      stage: 0,
      dimensions: allLow(),
    });
    expect(result.projectedSvi).toBe(200);
  });

  it("returns currentSvi verbatim when no P0 actions fire", () => {
    const result = computeNextBestActions({
      currentSvi: 88,
      stage: 3,
      dimensions: allHigh(),
    });
    expect(result.projectedSvi).toBe(88);
  });

  it("adds only the top-3 P0 slice even when more P0 actions fire", () => {
    // Baseline: all-low yields 10 P0 actions. Projection uses top-3 by sort order.
    // Replace one dim with a high score to remove one P0 and re-verify.
    const dims = DIM_CODES.map((c) => mkDim(c, c === "svm" ? 100 : 0));
    const result = computeNextBestActions({
      currentSvi: 0,
      stage: 0,
      dimensions: dims,
    });
    const top3 = result.actions
      .filter((a) => a.priority === "P0")
      .slice(0, 3);
    const expectedProjection = Math.min(
      200,
      top3.reduce((sum, a) => sum + a.sviBenefit, 0),
    );
    expect(result.projectedSvi).toBe(expectedProjection);
  });
});

describe("computeNextBestActions — weakestDimension", () => {
  it("picks the lowest-score dimension and maps to its human label", () => {
    const dims: DimensionScore[] = [
      mkDim("ftv", 80),
      mkDim("mpc", 20), // weakest
      mkDim("ptd", 60),
      mkDim("tre", 90),
      mkDim("cgh", 75),
      mkDim("iri", 65),
      mkDim("lco", 50),
      mkDim("svm", 30),
    ];
    const result = computeNextBestActions({
      currentSvi: 55,
      stage: 3,
      dimensions: dims,
    });
    expect(result.weakestDimension).toBe("Market & Problem Clarity");
  });

  it("returns 'N/A' when the dimensions array is empty", () => {
    const result = computeNextBestActions({
      currentSvi: 0,
      stage: 0,
      dimensions: [],
    });
    expect(result.weakestDimension).toBe("N/A");
    expect(result.actions).toEqual([]);
  });

  it("does not mutate the input dimensions array (sort is done on a copy)", () => {
    const dims: DimensionScore[] = [
      mkDim("ftv", 80),
      mkDim("mpc", 20),
      mkDim("ptd", 60),
    ];
    const snapshot = dims.map((d) => d.code);
    computeNextBestActions({ currentSvi: 0, stage: 0, dimensions: dims });
    expect(dims.map((d) => d.code)).toEqual(snapshot);
  });

  it("falls back to the raw code when an unknown code is the weakest", () => {
    const dims = [
      mkDim("ftv", 90),
      { code: "xxx", label: "bogus", score: 10, weight: 1, gaps: [] } as unknown as DimensionScore,
    ];
    const result = computeNextBestActions({
      currentSvi: 0,
      stage: 0,
      dimensions: dims,
    });
    expect(result.weakestDimension).toBe("xxx");
  });
});

describe("computeNextBestActions — topInsight", () => {
  it("cites the top P0 action's dimension + title + sviBenefit when actions exist", () => {
    const result = computeNextBestActions({
      currentSvi: 0,
      stage: 0,
      dimensions: allLow(),
    });
    // Head-of-list is ptd-01 with +25 benefit.
    expect(result.topInsight).toMatch(/Product & Technical Depth/);
    expect(result.topInsight).toMatch(/Build and deploy a working MVP/);
    expect(result.topInsight).toMatch(/\+25 SVI pts/);
  });

  it("falls back to a stage-milestone message when no P0 actions fire", () => {
    const result = computeNextBestActions({
      currentSvi: 90,
      stage: 3,
      dimensions: allHigh(),
    });
    // Next stage after 3 (Early Traction) is 4 (Revenue).
    expect(result.topInsight).toBe(
      "Your startup is well-positioned. Focus on Revenue milestones.",
    );
  });

  it("clamps the next-stage label at index 7 (Corporation) when stage = 7", () => {
    const result = computeNextBestActions({
      currentSvi: 200,
      stage: 7,
      dimensions: allHigh(),
    });
    expect(result.topInsight).toContain("Corporation milestones");
  });
});

describe("computeNextBestActions — per-action payload passthrough", () => {
  const single = (code: Code, score: number): NextBestAction[] => {
    const dims = DIM_CODES.map((c) => mkDim(c, c === code ? score : 100));
    return computeNextBestActions({
      currentSvi: 0,
      stage: 0,
      dimensions: dims,
    }).actions;
  };

  it("passes through auResource when the action def specifies one", () => {
    const [ftv01] = single("ftv", 0);
    expect(ftv01.auResource).toBe("CoFoundersLab AU, Antler Australia");
  });

  it("omits auResource for actions without an AU-specific resource", () => {
    // ftv-03 has no auResource
    const actions = single("ftv", 60); // fires only ftv-03
    expect(actions[0].id).toBe("ftv-03");
    expect(actions[0].auResource).toBeUndefined();
  });

  it("passes tags through unmodified", () => {
    const [tre01] = single("tre", 0);
    expect(tre01.id).toBe("tre-01");
    expect(tre01.tags).toEqual(["revenue", "traction"]);
  });

  it("stamps the human dimension label onto each action", () => {
    const [ptd01] = single("ptd", 0);
    expect(ptd01.dimension).toBe("Product & Technical Depth");
  });

  it("preserves timeToComplete verbatim from the action def", () => {
    const [lco01] = single("lco", 0);
    expect(lco01.id).toBe("lco-01");
    expect(lco01.timeToComplete).toBe("1–3 days");
  });

  it("preserves the P0/P1/P2 priority tag from the action def", () => {
    const actions = single("cgh", 0);
    const priorities = new Map(actions.map((a) => [a.id, a.priority]));
    expect(priorities.get("cgh-01")).toBe("P0");
    expect(priorities.get("cgh-02")).toBe("P1");
    expect(priorities.get("cgh-03")).toBe("P2");
  });
});

describe("computeNextBestActions — action-library completeness", () => {
  it.each(DIM_CODES)(
    "surfaces at least one action for dimension %s when its score is 0",
    (code) => {
      const dims = DIM_CODES.map((c) => mkDim(c, c === code ? 0 : 100));
      const result = computeNextBestActions({
        currentSvi: 0,
        stage: 0,
        dimensions: dims,
      });
      expect(result.actions.length).toBeGreaterThan(0);
      expect(result.actions.every((a) => a.id.startsWith(`${code}-`))).toBe(true);
    },
  );

  it("every emitted action id has non-empty title, rationale, effort, priority, dimension", () => {
    const result = computeNextBestActions({
      currentSvi: 0,
      stage: 0,
      dimensions: allLow(),
    });
    for (const a of result.actions) {
      expect(a.id).toMatch(/^[a-z]{3}-\d{2}$/);
      expect(a.title.length).toBeGreaterThan(0);
      expect(a.rationale.length).toBeGreaterThan(0);
      expect(["low", "medium", "high"]).toContain(a.effort);
      expect(["P0", "P1", "P2"]).toContain(a.priority);
      expect(a.dimension.length).toBeGreaterThan(0);
    }
  });

  it("every emitted action has a positive integer sviBenefit", () => {
    const result = computeNextBestActions({
      currentSvi: 0,
      stage: 0,
      dimensions: allLow(),
    });
    for (const a of result.actions) {
      expect(Number.isInteger(a.sviBenefit)).toBe(true);
      expect(a.sviBenefit).toBeGreaterThan(0);
    }
  });
});
