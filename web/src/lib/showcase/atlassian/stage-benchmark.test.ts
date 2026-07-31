// Colocated tests for the Atlassian public-record benchmark mapping.
//
// These pin the accuracy contract, not the prose:
//   * every milestone carries at least one non-empty public source
//   * every figure carries its own citation — no uncited numbers, ever
//   * S0–S5 are all covered, and every stage/phase id resolves against the
//     REAL framework constants (a rename in unicorn/framework.ts,
//     startup-growth-phases.ts, journey-map.ts, evaluation-criteria.ts or
//     verification/level-engine.ts breaks these tests rather than silently
//     orphaning the mapping)
//   * the case-study framing is present and cannot be dropped

import { describe, it, expect } from "vitest";

import { UNICORN_STAGE_IDS, UNICORN_STAGES } from "@/lib/unicorn/framework";
import { GROWTH_PHASES } from "@/lib/startup-growth-phases";
import { ALL_PHASE_KEYS, GROWTH_PHASE_IDS } from "@/lib/journey-map";
import { CRITERION_KEYS } from "@/lib/evaluation-criteria";
import { computeVerificationLevel } from "@/lib/verification/level-engine";
import { PHASE_COUNT } from "@/lib/showcase/gallery";

import {
  ANALYSIS_AREAS,
  ANALYSIS_AREA_IDS,
  ANALYSIS_PILLAR_IDS,
  ANALYSIS_PILLAR_LABELS,
  ATLASSIAN_BENCHMARK_MILESTONES,
  ATLASSIAN_FOLKLORE_CHECKS,
  ATLASSIAN_HUMAN_REVIEW_FLAGS,
  ATLASSIAN_PHASE_BENCHMARKS,
  ATLASSIAN_STAGE_BENCHMARKS,
  BENCHMARK_DISCLAIMER,
  BENCHMARK_STAGE_ORDER,
  NOT_PUBLICLY_DISCLOSED,
  SCN_LENS_IDS,
  STAGE_CALIBRATION_NOTE,
  countUndisclosedFigures,
  getAnalysisArea,
  getPhaseBenchmark,
  getStageBenchmark,
  milestonesForPhase,
  milestonesForStage,
  type PublicSource,
} from "./stage-benchmark";

const URL_RE = /^https:\/\/[^\s]+$/;

function assertSource(s: PublicSource, where: string) {
  expect(s.label.trim().length, `${where}: empty source label`).toBeGreaterThan(0);
  expect(s.url, `${where}: bad source url ${s.url}`).toMatch(URL_RE);
  expect(["primary", "secondary"], `${where}: bad tier`).toContain(s.tier);
}

// ── Milestones ──────────────────────────────────────────────────────────────

describe("ATLASSIAN_BENCHMARK_MILESTONES", () => {
  it("is non-empty and has unique ids", () => {
    expect(ATLASSIAN_BENCHMARK_MILESTONES.length).toBeGreaterThan(0);
    const ids = ATLASSIAN_BENCHMARK_MILESTONES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every milestone has at least one well-formed public source", () => {
    for (const m of ATLASSIAN_BENCHMARK_MILESTONES) {
      expect(m.sources.length, `${m.id} has no source`).toBeGreaterThan(0);
      m.sources.forEach((s) => assertSource(s, `milestone ${m.id}`));
    }
  });

  it("every figure carries its own citation — no uncited numbers", () => {
    for (const m of ATLASSIAN_BENCHMARK_MILESTONES) {
      for (const f of m.figures) {
        expect(f.label.trim().length, `${m.id}: empty figure label`).toBeGreaterThan(0);
        expect(f.value.trim().length, `${m.id}/${f.label}: empty figure value`).toBeGreaterThan(0);
        assertSource(f.source, `figure ${m.id}/${f.label}`);
      }
    }
  });

  it("records undisclosed figures explicitly rather than inventing them", () => {
    // The point of the marker: a gap in the public record is a finding, not a
    // hole to be filled. If this ever drops to zero someone has guessed.
    expect(countUndisclosedFigures()).toBeGreaterThan(0);
    const undisclosed = ATLASSIAN_BENCHMARK_MILESTONES.flatMap((m) =>
      m.figures.filter((f) => f.value === NOT_PUBLICLY_DISCLOSED),
    );
    // Even a "not disclosed" claim needs a source showing where you looked.
    undisclosed.forEach((f) => assertSource(f.source, `undisclosed figure ${f.label}`));
  });

  it("every milestone resolves to a real 12-phase id and ordinal", () => {
    const realPhaseIds = new Set(GROWTH_PHASES.map((p) => p.id));
    for (const m of ATLASSIAN_BENCHMARK_MILESTONES) {
      expect(realPhaseIds.has(m.phase), `${m.id}: phase '${m.phase}' not in GROWTH_PHASES`).toBe(true);
      expect(GROWTH_PHASE_IDS, `${m.id}: phase not in GROWTH_PHASE_IDS`).toContain(m.phase);
      expect(ALL_PHASE_KEYS, `${m.id}: ordinal ${m.phaseOrdinal} invalid`).toContain(m.phaseOrdinal);
    }
  });

  it("every milestone resolves to a real S0–S5 stage id", () => {
    for (const m of ATLASSIAN_BENCHMARK_MILESTONES) {
      expect(UNICORN_STAGE_IDS, `${m.id}: stage ${m.stage} invalid`).toContain(m.stage);
    }
  });

  it("dates are ISO-shaped (YYYY or YYYY-MM-DD) and chronological", () => {
    const years = ATLASSIAN_BENCHMARK_MILESTONES.map((m) => {
      expect(m.date).toMatch(/^\d{4}(-\d{2}-\d{2})?$/);
      return Number(m.date.slice(0, 4));
    });
    for (let i = 1; i < years.length; i += 1) {
      expect(years[i]!, `milestone ${i} out of order`).toBeGreaterThanOrEqual(years[i - 1]!);
    }
  });

  it("grades every milestone as documented or interpretation", () => {
    for (const m of ATLASSIAN_BENCHMARK_MILESTONES) {
      expect(["documented", "interpretation"]).toContain(m.evidence);
    }
  });

  it("anchors the load-bearing events on primary sources", () => {
    const mustBePrimary = ["2015-f1-filed", "2015-ipo", "2010-accel", "2025-fy25", "2022-redomicile"];
    for (const id of mustBePrimary) {
      const m = ATLASSIAN_BENCHMARK_MILESTONES.find((x) => x.id === id);
      expect(m, `missing load-bearing milestone ${id}`).toBeDefined();
      expect(
        m!.sources.some((s) => s.tier === "primary"),
        `${id} rests on no primary source`,
      ).toBe(true);
    }
  });

  it("cites SEC or the company newsroom for the IPO and FY2025 figures", () => {
    const ipo = ATLASSIAN_BENCHMARK_MILESTONES.find((m) => m.id === "2015-ipo")!;
    expect(ipo.figures.some((f) => f.value.includes("US$21.00"))).toBe(true);
    expect(
      ipo.sources.every((s) => s.url.includes("sec.gov") || s.url.includes("atlassian.com") || s.tier === "secondary"),
    ).toBe(true);

    const fy25 = ATLASSIAN_BENCHMARK_MILESTONES.find((m) => m.id === "2025-fy25")!;
    for (const f of fy25.figures) {
      expect(f.source.url, `FY2025 figure '${f.label}' not from an SEC filing`).toContain("sec.gov");
    }
  });
});

// ── Stage coverage ──────────────────────────────────────────────────────────

describe("ATLASSIAN_STAGE_BENCHMARKS", () => {
  it("covers every S0–S5 stage exactly once, in framework order", () => {
    expect(ATLASSIAN_STAGE_BENCHMARKS.map((s) => s.stage)).toEqual([...UNICORN_STAGE_IDS]);
    expect(BENCHMARK_STAGE_ORDER).toEqual([...UNICORN_STAGE_IDS]);
  });

  it("mirrors the stage label from the real framework constant", () => {
    for (const b of ATLASSIAN_STAGE_BENCHMARKS) {
      const real = UNICORN_STAGES.find((s) => s.id === b.stage)!;
      expect(b.label, `${b.stage} label drifted from UNICORN_STAGES`).toBe(real.label);
    }
  });

  it("every stage has sources, artefacts and a period", () => {
    for (const b of ATLASSIAN_STAGE_BENCHMARKS) {
      expect(b.sources.length, `${b.stage} has no sources`).toBeGreaterThan(0);
      b.sources.forEach((s) => assertSource(s, `stage ${b.stage}`));
      expect(b.expectedArtefacts.length, `${b.stage} lists no expected artefacts`).toBeGreaterThan(0);
      expect(b.period.trim().length).toBeGreaterThan(0);
      expect(b.whatItLookedLike.trim().length).toBeGreaterThan(40);
    }
  });

  it("reads all 13 analysis areas at every stage", () => {
    for (const b of ATLASSIAN_STAGE_BENCHMARKS) {
      expect(Object.keys(b.areaReadings).sort()).toEqual([...ANALYSIS_AREA_IDS].sort());
      for (const [areaId, reading] of Object.entries(b.areaReadings)) {
        expect(["strong", "mixed", "weak", "not_public"], `${b.stage}/${areaId}`).toContain(reading.signal);
        expect(["documented", "interpretation"], `${b.stage}/${areaId}`).toContain(reading.evidence);
        expect(reading.note.trim().length, `${b.stage}/${areaId} empty note`).toBeGreaterThan(10);
      }
    }
  });

  it("reads all 5 SCN lenses at every stage", () => {
    for (const b of ATLASSIAN_STAGE_BENCHMARKS) {
      expect(Object.keys(b.scnReadings).sort()).toEqual([...SCN_LENS_IDS].sort());
      for (const lens of SCN_LENS_IDS) {
        expect(b.scnReadings[lens].read.trim().length).toBeGreaterThan(10);
        expect(["documented", "interpretation"]).toContain(b.scnReadings[lens].evidence);
      }
    }
  });

  it("verification-ladder analogues are valid levels and marked as judgement calls", () => {
    for (const b of ATLASSIAN_STAGE_BENCHMARKS) {
      expect([0, 1, 2, 3, 4, 5]).toContain(b.verificationAnalogue.level);
      // The ladder is a BlockID construct; applying it to a listed US issuer
      // is an analogy. Never let this be presented as measured fact.
      expect(
        b.verificationAnalogue.evidence,
        `${b.stage} verification analogue must be an interpretation`,
      ).toBe("interpretation");
      expect(b.verificationAnalogue.why.trim().length).toBeGreaterThan(20);
    }
  });

  it("ladder analogue levels are non-decreasing across S0→S5", () => {
    const levels = ATLASSIAN_STAGE_BENCHMARKS.map((b) => b.verificationAnalogue.level);
    for (let i = 1; i < levels.length; i += 1) {
      expect(levels[i]!).toBeGreaterThanOrEqual(levels[i - 1]!);
    }
  });

  it("the top ladder analogue matches what computeVerificationLevel actually returns for that evidence", () => {
    // S5 is claimed as L5. Assert the real engine agrees given the analogous
    // signals (audited + continuously reported), so the claim is not free-floating.
    const s5 = getStageBenchmark("S5");
    expect(s5.verificationAnalogue.level).toBe(
      computeVerificationLevel({
        hasBusinessId: true,
        abrConfirmed: true,
        abrStatus: "Active",
        domainVerified: true,
        emailVerified: true,
        financialsAttested: true,
        independentlyAudited: true,
        continuouslyMonitored: true,
      }),
    );
  });

  it("every stage's phaseOrdinals are valid and the union covers all 12 phases", () => {
    const seen = new Set<number>();
    for (const b of ATLASSIAN_STAGE_BENCHMARKS) {
      for (const o of b.phaseOrdinals) {
        expect(ALL_PHASE_KEYS, `${b.stage}: bad ordinal ${o}`).toContain(o);
        expect(seen.has(o), `phase ${o} claimed by two stages`).toBe(false);
        seen.add(o);
      }
    }
    expect(seen.size).toBe(PHASE_COUNT);
  });

  it("getStageBenchmark resolves and throws on unknown", () => {
    expect(getStageBenchmark("S2").stage).toBe("S2");
    // @ts-expect-error — deliberately passing an id outside UnicornStageId
    expect(() => getStageBenchmark("S9")).toThrow(/S9/);
  });
});

// ── Phase coverage ──────────────────────────────────────────────────────────

describe("ATLASSIAN_PHASE_BENCHMARKS", () => {
  it("covers phases 1..12 exactly once, in order", () => {
    expect(ATLASSIAN_PHASE_BENCHMARKS.map((p) => p.ordinal)).toEqual([...ALL_PHASE_KEYS]);
    expect(ATLASSIAN_PHASE_BENCHMARKS.length).toBe(PHASE_COUNT);
  });

  it("phase ids match GROWTH_PHASES in declaration order", () => {
    // A rename or reorder in startup-growth-phases.ts breaks this rather than
    // silently orphaning the mapping.
    expect(ATLASSIAN_PHASE_BENCHMARKS.map((p) => p.phase)).toEqual(GROWTH_PHASES.map((p) => p.id));
  });

  it("every phase resolves to a real S0–S5 stage and has sources", () => {
    for (const p of ATLASSIAN_PHASE_BENCHMARKS) {
      expect(UNICORN_STAGE_IDS, `phase ${p.ordinal}`).toContain(p.stage);
      expect(p.sources.length, `phase ${p.ordinal} has no source`).toBeGreaterThan(0);
      p.sources.forEach((s) => assertSource(s, `phase ${p.ordinal}`));
      expect(p.expectedArtefacts.length).toBeGreaterThan(0);
      expect(p.atlassianAtThisPhase.trim().length).toBeGreaterThan(40);
      expect(["documented", "interpretation"]).toContain(p.evidence);
    }
  });

  it("every strong/weak area id is a real analysis area, with no overlap", () => {
    for (const p of ATLASSIAN_PHASE_BENCHMARKS) {
      for (const a of [...p.strongAreas, ...p.weakOrUnevidencedAreas]) {
        expect(ANALYSIS_AREA_IDS, `phase ${p.ordinal}: unknown area ${a}`).toContain(a);
      }
      const overlap = p.strongAreas.filter((a) => p.weakOrUnevidencedAreas.includes(a));
      expect(overlap, `phase ${p.ordinal}: area both strong and weak`).toEqual([]);
    }
  });

  it("phase→stage assignment is consistent with the stage's declared phaseOrdinals", () => {
    for (const p of ATLASSIAN_PHASE_BENCHMARKS) {
      const stage = getStageBenchmark(p.stage);
      expect(
        stage.phaseOrdinals.includes(p.ordinal),
        `phase ${p.ordinal} says ${p.stage} but ${p.stage} does not claim it`,
      ).toBe(true);
    }
  });

  it("getPhaseBenchmark resolves and throws on unknown", () => {
    expect(getPhaseBenchmark(7).phase).toBe("go_to_market");
    // @ts-expect-error — deliberately outside PhaseKey
    expect(() => getPhaseBenchmark(99)).toThrow(/99/);
  });
});

// ── 12 analysis areas / 4 pillars ───────────────────────────────────────────

describe("ANALYSIS_AREAS", () => {
  it("weights sum to 100 (Master Plan §6)", () => {
    expect(ANALYSIS_AREAS.reduce((a, x) => a + x.weight, 0)).toBe(100);
  });

  it("pillar split matches Master Plan §6: L&P 22 · S&C 32 · O&P 36 · T&D 10", () => {
    const byPillar = (p: string) =>
      ANALYSIS_AREAS.filter((a) => a.pillar === p).reduce((acc, a) => acc + a.weight, 0);
    expect(byPillar("leadership_people")).toBe(22);
    expect(byPillar("strategy_commercial")).toBe(32);
    expect(byPillar("operations_performance")).toBe(36);
    expect(byPillar("technology_digital")).toBe(10);
  });

  it("has exactly 4 labelled pillars, all used", () => {
    expect(ANALYSIS_PILLAR_IDS.length).toBe(4);
    expect(Object.keys(ANALYSIS_PILLAR_LABELS).sort()).toEqual([...ANALYSIS_PILLAR_IDS].sort());
    const used = new Set(ANALYSIS_AREAS.map((a) => a.pillar));
    expect(used.size).toBe(4);
  });

  it("ids are unique and match ANALYSIS_AREA_IDS", () => {
    expect(ANALYSIS_AREAS.map((a) => a.id)).toEqual([...ANALYSIS_AREA_IDS]);
    expect(new Set(ANALYSIS_AREA_IDS).size).toBe(ANALYSIS_AREA_IDS.length);
  });

  it("every non-null criterion link resolves against CRITERION_KEYS, with no duplicates", () => {
    const linked = ANALYSIS_AREAS.map((a) => a.criterion).filter((c): c is NonNullable<typeof c> => c !== null);
    for (const c of linked) {
      expect(CRITERION_KEYS, `criterion '${c}' not in CRITERION_KEYS`).toContain(c);
    }
    expect(new Set(linked).size, "a criterion is linked to two areas").toBe(linked.length);
  });

  it("getAnalysisArea resolves and throws on unknown", () => {
    expect(getAnalysisArea("financial_health").weight).toBe(12);
    // @ts-expect-error — deliberately unknown area id
    expect(() => getAnalysisArea("nope")).toThrow(/nope/);
  });
});

// ── Accuracy posture ────────────────────────────────────────────────────────

describe("case-study framing and accuracy posture", () => {
  it("carries a disclaimer that says this is not a BlockID assessment", () => {
    expect(BENCHMARK_DISCLAIMER).toMatch(/not a BlockID assessment/i);
    expect(BENCHMARK_DISCLAIMER).toMatch(/does not endorse/i);
    expect(BENCHMARK_DISCLAIMER.toLowerCase()).toContain("public");
  });

  it("never presents a BlockID score for Atlassian", () => {
    const blob = JSON.stringify({
      ATLASSIAN_BENCHMARK_MILESTONES,
      ATLASSIAN_STAGE_BENCHMARKS,
      ATLASSIAN_PHASE_BENCHMARKS,
    });
    expect(blob).not.toMatch(/trust\s*score/i);
    expect(blob).not.toMatch(/SVI\s*score/i);
  });

  it("corrects the widely-repeated claims, with sources on each", () => {
    const ids = ATLASSIAN_FOLKLORE_CHECKS.map((f) => f.id);
    expect(ids).toContain("never-took-vc");
    expect(ids).toContain("s1-vs-f1");
    expect(new Set(ids).size).toBe(ids.length);
    for (const f of ATLASSIAN_FOLKLORE_CHECKS) {
      expect(["accurate", "needs_nuance", "unsupported"]).toContain(f.verdict);
      expect(f.sources.length, `${f.id} has no source`).toBeGreaterThan(0);
      f.sources.forEach((s) => assertSource(s, `folklore ${f.id}`));
      expect(f.whatTheRecordShows.trim().length).toBeGreaterThan(60);
    }
  });

  it("the Accel correction names the secondary nuance rather than 'never took VC'", () => {
    const accel = ATLASSIAN_FOLKLORE_CHECKS.find((f) => f.id === "never-took-vc")!;
    expect(accel.verdict).toBe("needs_nuance");
    expect(accel.whatTheRecordShows).toMatch(/Accel/);
    expect(accel.whatTheRecordShows).toMatch(/liquidity|secondary/i);
  });

  it("the registration-statement correction says F-1, not S-1", () => {
    const f1 = ATLASSIAN_FOLKLORE_CHECKS.find((f) => f.id === "s1-vs-f1")!;
    expect(f1.whatTheRecordShows).toMatch(/Form F-1/);
    expect(f1.sources.some((s) => s.url.includes("sec.gov"))).toBe(true);
  });

  it("flags contested mappings for human review rather than self-certifying", () => {
    expect(ATLASSIAN_HUMAN_REVIEW_FLAGS.length).toBeGreaterThanOrEqual(4);
    for (const f of ATLASSIAN_HUMAN_REVIEW_FLAGS) {
      expect(f.what.trim().length).toBeGreaterThan(10);
      expect(f.why.trim().length).toBeGreaterThan(40);
      expect(f.surface.trim().length).toBeGreaterThan(3);
    }
    expect(ATLASSIAN_HUMAN_REVIEW_FLAGS.map((f) => f.id)).toContain("stage-window-mismatch");
  });

  it("records the day-window calibration caveat", () => {
    expect(STAGE_CALIBRATION_NOTE).toMatch(/exit criteria/i);
    expect(STAGE_CALIBRATION_NOTE).toMatch(/thirteen years/i);
  });
});

// ── Lookups ─────────────────────────────────────────────────────────────────

describe("lookup helpers", () => {
  it("milestonesForStage partitions the milestone set", () => {
    const total = UNICORN_STAGE_IDS.reduce((acc, s) => acc + milestonesForStage(s).length, 0);
    expect(total).toBe(ATLASSIAN_BENCHMARK_MILESTONES.length);
  });

  it("milestonesForPhase partitions the milestone set", () => {
    const total = ALL_PHASE_KEYS.reduce((acc, p) => acc + milestonesForPhase(p).length, 0);
    expect(total).toBe(ATLASSIAN_BENCHMARK_MILESTONES.length);
  });

  it("every S0–S5 stage has at least one milestone attached", () => {
    for (const s of UNICORN_STAGE_IDS) {
      expect(milestonesForStage(s).length, `stage ${s} has no milestone`).toBeGreaterThan(0);
    }
  });
});
