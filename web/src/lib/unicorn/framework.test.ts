// Colocated 15-case suite for the pure unicorn framework helper.
// Sub-J2 acceptance: fresh S0, S0→S1 with L1, cannot advance without
// required areas, on_track within window, off_track when overshoot,
// S5 saturation.

import { describe, it, expect } from "vitest";
import {
  UNICORN_STAGES,
  UNICORN_STAGE_IDS,
  UnicornStageSchema,
  computeStageProgress,
  getStage,
  nextStage,
} from "./framework";

describe("unicorn/framework — catalogue shape", () => {
  it("[1] exports exactly 6 stages S0..S5 in order", () => {
    expect(UNICORN_STAGES.length).toBe(6);
    expect(UNICORN_STAGES.map((s) => s.id)).toEqual([
      "S0",
      "S1",
      "S2",
      "S3",
      "S4",
      "S5",
    ]);
    expect(UNICORN_STAGES.map((s) => s.stageNumber)).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
  });

  it("[2] every stage passes the Zod schema", () => {
    for (const s of UNICORN_STAGES) {
      expect(() => UnicornStageSchema.parse(s)).not.toThrow();
    }
  });

  it("[3] windowDaysMax >= windowDaysMin for every stage", () => {
    for (const s of UNICORN_STAGES) {
      expect(s.windowDaysMax).toBeGreaterThanOrEqual(s.windowDaysMin);
    }
  });

  it("[4] exitTrustScore is monotonically non-decreasing across stages", () => {
    let prev = -1;
    for (const s of UNICORN_STAGES) {
      expect(s.exitTrustScore).toBeGreaterThanOrEqual(prev);
      prev = s.exitTrustScore;
    }
  });

  it("[5] mandatoryAreas grow monotonically S0 ⊂ S1 ⊂ ... ⊂ S4", () => {
    for (let i = 1; i < 5; i += 1) {
      const prev = new Set(UNICORN_STAGES[i - 1]!.mandatoryAreas);
      for (const a of prev) {
        expect(UNICORN_STAGES[i]!.mandatoryAreas).toContain(a);
      }
    }
  });

  it("[6] UNICORN_STAGE_IDS matches the catalogue ids", () => {
    expect([...UNICORN_STAGE_IDS]).toEqual(UNICORN_STAGES.map((s) => s.id));
  });
});

describe("unicorn/framework — lookups", () => {
  it("[7] getStage returns the right row", () => {
    expect(getStage("S3").label).toBe("Scale");
  });

  it("[8] nextStage returns the next id or null at S5", () => {
    expect(nextStage("S0")?.id).toBe("S1");
    expect(nextStage("S4")?.id).toBe("S5");
    expect(nextStage("S5")).toBeNull();
  });
});

describe("unicorn/framework — computeStageProgress", () => {
  it("[9] S0 fresh business — every predicate fails, canAdvance=false", () => {
    const r = computeStageProgress({
      currentStageId: "S0",
      verificationLevel: 0,
      trustScore: 0,
      coveredAreas: [],
      blockerCount: 0,
      daysInStage: 0,
    });
    expect(r.currentStage.id).toBe("S0");
    expect(r.canAdvance).toBe(false);
    expect(r.blockers.map((b) => b.code)).toEqual(
      expect.arrayContaining([
        "verification_level_below_exit",
        "trust_score_below_exit",
        "missing_mandatory_areas",
      ]),
    );
    // Within the window (day 0 <= 14) and no data means "on track" not
    // "off track" — the founder is just starting.
    expect(r.onTrack).toBe(true);
  });

  it("[10] S0 → S1 exit predicates met with L1 + score 25 + both areas", () => {
    const r = computeStageProgress({
      currentStageId: "S0",
      verificationLevel: 1,
      trustScore: 25,
      coveredAreas: ["identity", "ownership"],
      blockerCount: 0,
      daysInStage: 10,
    });
    expect(r.canAdvance).toBe(true);
    expect(r.blockers).toEqual([]);
    expect(r.onTrack).toBe(true);
  });

  it("[11] S1 cannot advance without required areas even at full L + score", () => {
    const r = computeStageProgress({
      currentStageId: "S1",
      verificationLevel: 5,
      trustScore: 100,
      coveredAreas: ["identity", "ownership"], // missing governance/finance/product
      blockerCount: 0,
      daysInStage: 40,
    });
    expect(r.canAdvance).toBe(false);
    const codes = r.blockers.map((b) => b.code);
    expect(codes).toContain("missing_mandatory_areas");
    expect(codes).not.toContain("verification_level_below_exit");
    expect(codes).not.toContain("trust_score_below_exit");
  });

  it("[12] on_track = true when within window even if not yet meeting exit", () => {
    const r = computeStageProgress({
      currentStageId: "S2",
      verificationLevel: 2,
      trustScore: 50,
      coveredAreas: ["identity", "ownership", "governance"],
      blockerCount: 0,
      daysInStage: 90, // within 61..180
    });
    expect(r.canAdvance).toBe(false);
    expect(r.onTrack).toBe(true); // no overshoot yet
  });

  it("[13] off_track when overshoot AND exit predicates not met", () => {
    const r = computeStageProgress({
      currentStageId: "S2",
      verificationLevel: 2,
      trustScore: 50,
      coveredAreas: ["identity"],
      blockerCount: 0,
      daysInStage: 250, // > 180
    });
    expect(r.onTrack).toBe(false);
    expect(r.blockers.map((b) => b.code)).toContain("window_overshoot");
  });

  it("[14] open critical findings block advancement even if all else passes", () => {
    const r = computeStageProgress({
      currentStageId: "S0",
      verificationLevel: 1,
      trustScore: 30,
      coveredAreas: ["identity", "ownership"],
      blockerCount: 2,
      daysInStage: 5,
    });
    expect(r.canAdvance).toBe(false);
    expect(r.blockers.map((b) => b.code)).toContain("open_critical_findings");
  });

  it("[15] S5 saturation — canAdvance is always false, onTrack requires meeting exit bar", () => {
    const meetsAll = computeStageProgress({
      currentStageId: "S5",
      verificationLevel: 5,
      trustScore: 95,
      coveredAreas: UNICORN_STAGES[5]!.mandatoryAreas,
      blockerCount: 0,
      daysInStage: 5_000,
    });
    expect(meetsAll.canAdvance).toBe(false); // no next stage
    expect(meetsAll.onTrack).toBe(true);

    const failsBar = computeStageProgress({
      currentStageId: "S5",
      verificationLevel: 5,
      trustScore: 60,
      coveredAreas: UNICORN_STAGES[5]!.mandatoryAreas,
      blockerCount: 0,
      daysInStage: 5_000,
    });
    expect(failsBar.canAdvance).toBe(false);
    expect(failsBar.onTrack).toBe(false); // S5 collapses to meetsExit
  });
});
