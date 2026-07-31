import { describe, it, expect } from "vitest";
import {
  UPGRADE_CATALOGUE,
  nextBestUpgrade,
  type UpgradeCandidate,
} from "./next-best-upgrade";
import { PLAN_TIER_RANK, type PlanTier } from "@/lib/segments";

// Colocated vitest for the pure `nextBestUpgrade` selector consumed by
// <PhaseAwareUpgradeCard /> inside the "Recommended next step" overview tile.
// Tracks docs/plans/atlassian-standard-mapping-goal.md P3_nudge_engine_impl —
// this selector is the paid-tier sibling of the P3 nudge engine's compact
// `next_action` tile, so a silent drift in the phase-match / phase-adjacent /
// next-tier ranking (100 / 40 / 10), the tie-break ladder (score → cheapest →
// alphabetical), the tier-rank filter (candRank <= currentRank skips), or the
// per-rule `reason` copy corrupts a founder-facing upgrade nudge.

const CATALOGUE_FEATURES = UPGRADE_CATALOGUE.map((c) => c.feature);

describe("UPGRADE_CATALOGUE", () => {
  it("ships exactly 10 candidates (pin against silent drop / add)", () => {
    expect(UPGRADE_CATALOGUE.length).toBe(10);
  });

  it("is frozen so downstream callers cannot mutate the promoted list", () => {
    expect(Object.isFrozen(UPGRADE_CATALOGUE)).toBe(true);
  });

  it("uses unique feature slugs (no duplicate promotions)", () => {
    const set = new Set(CATALOGUE_FEATURES);
    expect(set.size).toBe(UPGRADE_CATALOGUE.length);
  });

  it("every minTier is a valid PlanTier known to PLAN_TIER_RANK", () => {
    const validTiers = new Set(Object.keys(PLAN_TIER_RANK));
    for (const c of UPGRADE_CATALOGUE) {
      expect(validTiers.has(c.minTier)).toBe(true);
    }
  });

  it("every bestAtPhase is an integer within the 12-phase growth journey", () => {
    for (const c of UPGRADE_CATALOGUE) {
      expect(Number.isInteger(c.bestAtPhase)).toBe(true);
      expect(c.bestAtPhase).toBeGreaterThanOrEqual(1);
      expect(c.bestAtPhase).toBeLessThanOrEqual(12);
    }
  });

  it("every monthlyDeltaAud is a positive AUD number", () => {
    for (const c of UPGRADE_CATALOGUE) {
      expect(c.monthlyDeltaAud).toBeGreaterThan(0);
    }
  });

  it("every discoveryHint + upgradeCTA is a non-empty string", () => {
    for (const c of UPGRADE_CATALOGUE) {
      expect(typeof c.discoveryHint).toBe("string");
      expect(c.discoveryHint.length).toBeGreaterThan(0);
      expect(typeof c.upgradeCTA).toBe("string");
      expect(c.upgradeCTA.length).toBeGreaterThan(0);
    }
  });

  it("addOnKey is either undefined or a non-empty string per entry", () => {
    for (const c of UPGRADE_CATALOGUE) {
      if (c.addOnKey !== undefined) {
        expect(typeof c.addOnKey).toBe("string");
        expect(c.addOnKey.length).toBeGreaterThan(0);
      }
    }
  });

  it("catalogue includes the shipped anchors (svi.run / report.premium / sso)", () => {
    expect(CATALOGUE_FEATURES).toContain("svi.run");
    expect(CATALOGUE_FEATURES).toContain("report.premium");
    expect(CATALOGUE_FEATURES).toContain("sso");
  });
});

describe("nextBestUpgrade — rule detection", () => {
  it("stamps `phase-match` when bestAtPhase === currentPhase", () => {
    // svi.run is starter/phase 2. Free tier at phase 2 → phase-match.
    const out = nextBestUpgrade({
      currentTier: "free",
      currentPhase: 2,
      ownedFeatures: [],
    });
    expect(out).not.toBeNull();
    expect(out!.feature).toBe("svi.run");
    expect(out!.rule).toBe("phase-match");
    expect(out!.reason).toBe("Founders at Phase 2 unlock this first");
  });

  it("stamps `phase-adjacent` when |bestAtPhase - currentPhase| === 1", () => {
    // Free tier at phase 1 → svi.run is phase-adjacent (bestAtPhase=2, diff=1).
    const out = nextBestUpgrade({
      currentTier: "free",
      currentPhase: 1,
      ownedFeatures: [],
    });
    expect(out).not.toBeNull();
    expect(out!.feature).toBe("svi.run");
    expect(out!.rule).toBe("phase-adjacent");
    expect(out!.reason).toBe("Coming up next at Phase 2");
  });

  it("stamps `next-tier` when neither match nor adjacent — cheapest wins", () => {
    // Free tier at phase 0 → no candidate has bestAtPhase in {0,1}
    // (svi.run bestAtPhase=2 diff=2). Every remaining candidate scores 10;
    // cheapest is svi.run @ $29.
    const out = nextBestUpgrade({
      currentTier: "free",
      currentPhase: 0,
      ownedFeatures: [],
    });
    expect(out).not.toBeNull();
    expect(out!.feature).toBe("svi.run");
    expect(out!.rule).toBe("next-tier");
    expect(out!.reason).toBe("Included on starter");
  });
});

describe("nextBestUpgrade — score & tie-break ladder", () => {
  it("phase-match beats phase-adjacent even when adjacent is cheaper", () => {
    // Craft: free tier at phase 4 → report.premium bestAtPhase=4 → phase-match
    // (100). svi.run bestAtPhase=2, diff=2, next-tier (10). So report.premium
    // wins at 100 even though it's $70 vs svi.run $29.
    const out = nextBestUpgrade({
      currentTier: "free",
      currentPhase: 4,
      ownedFeatures: [],
    });
    expect(out).not.toBeNull();
    expect(out!.feature).toBe("report.premium");
    expect(out!.rule).toBe("phase-match");
  });

  it("phase-adjacent beats next-tier at same tier", () => {
    // Free tier at phase 6 → accelerator.cohort bestAtPhase=5, diff=1,
    // phase-adjacent (40). Beats all next-tier candidates scoring 10.
    const out = nextBestUpgrade({
      currentTier: "free",
      currentPhase: 6,
      ownedFeatures: [],
    });
    expect(out).not.toBeNull();
    expect(out!.feature).toBe("accelerator.cohort");
    expect(out!.rule).toBe("phase-adjacent");
  });

  it("tie on score → cheapest monthlyDeltaAud wins", () => {
    // At scale tier / phase 8, only enterprise-rank sso remains
    // (all growth-tier candidates are already ranked below or equal).
    // Not a tie — swap to phase 10 free tier to force a 3-way phase-match
    // tie at 100 pts, all $70:
    //   share_management, data_room.access, term_sheet.ai
    // All have same deltaAud so falls through to alphabetical.
    // Explicit tie-break-by-price test: build synthetic scenario via ownership
    // — free tier / phase 2, own svi.run so the next-cheapest tie is between
    // report.premium (70) and accelerator.cohort (149), both next-tier @ 10.
    const out = nextBestUpgrade({
      currentTier: "free",
      currentPhase: 2,
      ownedFeatures: ["svi.run"],
    });
    expect(out).not.toBeNull();
    // Cheapest at score=10 is report.premium ($70).
    expect(out!.feature).toBe("report.premium");
    expect(out!.rule).toBe("next-tier");
  });

  it("tie on score AND price → alphabetical by feature slug", () => {
    // Free tier / phase 10 → three candidates tied at 100 pts and $70:
    //   data_room.access, share_management, term_sheet.ai
    // Alphabetical winner: data_room.access.
    const out = nextBestUpgrade({
      currentTier: "free",
      currentPhase: 10,
      ownedFeatures: [],
    });
    expect(out).not.toBeNull();
    expect(out!.feature).toBe("data_room.access");
    expect(out!.rule).toBe("phase-match");
    expect(out!.reason).toBe("Founders at Phase 10 unlock this first");
  });
});

describe("nextBestUpgrade — filters", () => {
  it("excludes candidates whose minTier is at or below currentTier rank", () => {
    // Scale tier (rank 30) at phase 12 → only enterprise-rank sso survives.
    const out = nextBestUpgrade({
      currentTier: "scale",
      currentPhase: 12,
      ownedFeatures: [],
    });
    expect(out).not.toBeNull();
    expect(out!.feature).toBe("sso");
    expect(out!.rule).toBe("phase-match");
  });

  it("skips owned features so a user never sees what they already have", () => {
    // Free / phase 2 normally picks svi.run — owning it forces fallback.
    const out = nextBestUpgrade({
      currentTier: "free",
      currentPhase: 2,
      ownedFeatures: ["svi.run"],
    });
    expect(out).not.toBeNull();
    expect(out!.feature).not.toBe("svi.run");
  });

  it("skips explicitly excluded features (dismissed / surfaced elsewhere)", () => {
    const out = nextBestUpgrade({
      currentTier: "free",
      currentPhase: 2,
      ownedFeatures: [],
      excludeFeatures: ["svi.run"],
    });
    expect(out).not.toBeNull();
    expect(out!.feature).not.toBe("svi.run");
  });

  it("returns null when caller is on enterprise (top rank, no upgrades left)", () => {
    const out = nextBestUpgrade({
      currentTier: "enterprise",
      currentPhase: 12,
      ownedFeatures: [],
    });
    expect(out).toBeNull();
  });

  it("returns null when caller owns every upgradeable feature", () => {
    const out = nextBestUpgrade({
      currentTier: "free",
      currentPhase: 5,
      ownedFeatures: CATALOGUE_FEATURES,
    });
    expect(out).toBeNull();
  });

  it("returns null when every candidate is either owned or excluded", () => {
    const owned = CATALOGUE_FEATURES.slice(0, 5);
    const excluded = CATALOGUE_FEATURES.slice(5);
    const out = nextBestUpgrade({
      currentTier: "free",
      currentPhase: 5,
      ownedFeatures: owned,
      excludeFeatures: excluded,
    });
    expect(out).toBeNull();
  });
});

describe("nextBestUpgrade — phase-input hygiene", () => {
  it("floors fractional currentPhase before comparing to bestAtPhase", () => {
    // 2.9 → floor 2 → svi.run phase-match, NOT phase-adjacent to bestAtPhase=2.
    const out = nextBestUpgrade({
      currentTier: "free",
      currentPhase: 2.9,
      ownedFeatures: [],
    });
    expect(out).not.toBeNull();
    expect(out!.rule).toBe("phase-match");
    expect(out!.feature).toBe("svi.run");
  });

  it("clamps negative currentPhase to 0 via Math.max(0, ...)", () => {
    // Same downstream behaviour as phase=0 → cheapest next-tier wins.
    const out = nextBestUpgrade({
      currentTier: "free",
      currentPhase: -5,
      ownedFeatures: [],
    });
    expect(out).not.toBeNull();
    expect(out!.feature).toBe("svi.run");
    expect(out!.rule).toBe("next-tier");
  });

  it("phase 12 with free tier picks sso via phase-match at enterprise tier", () => {
    // Free tier at phase 12 → sso bestAtPhase=12 → phase-match (100).
    // No competing phase-match at any other tier at that phase.
    const out = nextBestUpgrade({
      currentTier: "free",
      currentPhase: 12,
      ownedFeatures: [],
    });
    expect(out).not.toBeNull();
    expect(out!.feature).toBe("sso");
    expect(out!.rule).toBe("phase-match");
  });
});

describe("nextBestUpgrade — return shape fidelity", () => {
  it("propagates addOnKey when the winning candidate defines one", () => {
    // share_management is phase-match at free/phase 10 but loses alphabetically
    // to data_room.access. Force it via ownership exclusion of the alpha winner.
    const out = nextBestUpgrade({
      currentTier: "free",
      currentPhase: 10,
      ownedFeatures: ["data_room.access"],
    });
    expect(out).not.toBeNull();
    expect(out!.feature).toBe("share_management");
    expect(out!.addOnKey).toBe("share_management");
  });

  it("leaves addOnKey undefined when the winning candidate has none", () => {
    // svi.run (no addOnKey) at free/phase 2.
    const out = nextBestUpgrade({
      currentTier: "free",
      currentPhase: 2,
      ownedFeatures: [],
    });
    expect(out).not.toBeNull();
    expect(out!.feature).toBe("svi.run");
    expect(out!.addOnKey).toBeUndefined();
  });

  it("echoes catalogue metadata verbatim (minTier / delta / hint / CTA)", () => {
    const source = UPGRADE_CATALOGUE.find(
      (c) => c.feature === "svi.run",
    ) as UpgradeCandidate;
    const out = nextBestUpgrade({
      currentTier: "free",
      currentPhase: 2,
      ownedFeatures: [],
    });
    expect(out).not.toBeNull();
    expect(out!.minTier).toBe(source.minTier);
    expect(out!.monthlyDeltaAud).toBe(source.monthlyDeltaAud);
    expect(out!.discoveryHint).toBe(source.discoveryHint);
    expect(out!.upgradeCTA).toBe(source.upgradeCTA);
  });

  it("reason string cites the founder's current phase for phase-match", () => {
    const out = nextBestUpgrade({
      currentTier: "free",
      currentPhase: 4,
      ownedFeatures: [],
    });
    expect(out!.reason).toContain("Phase 4");
  });

  it("reason string cites the target phase for phase-adjacent", () => {
    // Free/phase 3 → svi.run bestAtPhase=2 → adjacent; reason cites Phase 2.
    const out = nextBestUpgrade({
      currentTier: "free",
      currentPhase: 3,
      ownedFeatures: [],
    });
    expect(out!.rule).toBe("phase-adjacent");
    expect(out!.reason).toBe("Coming up next at Phase 2");
  });

  it("reason string cites the target tier for next-tier fallback", () => {
    const out = nextBestUpgrade({
      currentTier: "free",
      currentPhase: 0,
      ownedFeatures: [],
    });
    expect(out!.rule).toBe("next-tier");
    expect(out!.reason).toBe("Included on starter");
  });

  it("rule value is always one of the documented literals", () => {
    const rules: Array<"phase-match" | "phase-adjacent" | "next-tier"> = [
      "phase-match",
      "phase-adjacent",
      "next-tier",
    ];
    for (const phase of [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      const out = nextBestUpgrade({
        currentTier: "free" as PlanTier,
        currentPhase: phase,
        ownedFeatures: [],
      });
      if (out) expect(rules).toContain(out.rule);
    }
  });
});
