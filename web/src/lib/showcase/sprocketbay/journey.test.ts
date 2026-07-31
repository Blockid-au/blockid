/**
 * Contract test for the Sprocketbay process walkthrough fixture.
 *
 * Three jobs:
 *
 *  1. ANTI-ORPHAN. Every artefact's `analysisArea`, `criterion`,
 *     `evidenceCategory`, `stageCoverage`, data-room folder/document and
 *     every phase id is checked against the live framework catalogue it
 *     claims to come from. Rename anything in those frameworks and this
 *     file goes red, rather than the fixture quietly pointing at nothing.
 *
 *  2. NO HAND-WAVED NUMBERS. Every score the walkthrough displays is
 *     recomputed here from the fixture's inputs through the real engines
 *     (`computeQuality`, `CRITERIA[].weight`, `computeVerificationLevel`,
 *     `computeStageProgress`, `nextEvidenceState`) and compared against
 *     the framework thresholds and against what migration 0299 actually
 *     stored on the profile row.
 *
 *  3. INTERNAL CONSISTENCY. Dates, stage windows, monotonicity and
 *     evidence lifecycle are checked against each other, because a
 *     fixture that contradicts itself teaches the wrong process.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CRITERIA,
  CRITERION_KEYS,
  type CriterionKey,
} from "@/lib/evaluation-criteria";
import { DATA_ROOM_STRUCTURE } from "@/lib/data-room-templates";
import { deriveTrustScore } from "@/lib/business-id/public-profile";
import { GROWTH_PHASES } from "@/lib/startup-growth-phases";
import { GROWTH_PHASE_IDS } from "@/lib/growth/phase-taxonomy";
import {
  ANALYSIS_AREAS,
  ANALYSIS_AREA_IDS,
} from "@/lib/showcase/atlassian/stage-benchmark";
import {
  getStage,
  UNICORN_STAGE_IDS,
  type UnicornStageId,
} from "@/lib/unicorn/framework";
import { computeVerificationLevel } from "@/lib/verification/level-engine";

import {
  allArtefacts,
  analysisAreaLabel,
  computeCriteriaComposite,
  computeStage,
  computeWalkthrough,
  coveredAreasThrough,
  criterionTitle,
  EVIDENCE_CATEGORIES,
  liveArtefacts,
  phaseLabel,
  qualityFor,
  replayArtefactState,
  SPROCKETBAY_AS_AT,
  SPROCKETBAY_FOUNDED_ON,
  SPROCKETBAY_LEGAL_NAME,
  SPROCKETBAY_PROFILE_SLUG,
  SPROCKETBAY_RECONCILIATION,
  SPROCKETBAY_SAMPLE_NOTICE,
  SPROCKETBAY_STAGES,
  SPROCKETBAY_STORED_CAPABILITY_SCORES,
  SPROCKETBAY_STORED_VERIFICATION_LEVEL,
  STAGE_COVERAGE_AREAS,
  type SprocketbayArtefact,
} from "./journey";

const REPO_WEB = join(__dirname, "..", "..", "..", "..");
const MIGRATION_0210 = join(
  REPO_WEB,
  "supabase",
  "migrations",
  "0210_evidence.sql",
);
const MIGRATION_0299 = join(
  REPO_WEB,
  "supabase",
  "migrations",
  "0299_seed_sprocketbay_demo_profile.sql",
);

const ARTEFACTS = allArtefacts();
const DAY_MS = 86_400_000;

function day(iso: string): number {
  const ms = Date.parse(`${iso}T00:00:00Z`);
  expect(Number.isNaN(ms), `unparseable date: ${iso}`).toBe(false);
  return ms;
}

function daysBetween(a: string, b: string): number {
  return Math.round((day(b) - day(a)) / DAY_MS);
}

// ── 1. Framework anchoring ─────────────────────────────────────────

describe("framework anchoring", () => {
  it("mirrors the evidence category vocabulary declared in migration 0210", () => {
    const sql = readFileSync(MIGRATION_0210, "utf8");
    // The canonical list lives in the column comment because the column
    // is deliberately open text. Pull every `a | b | c` run out of the
    // comment block that introduces `category`.
    const block = sql.slice(
      sql.indexOf("-- Open enum kept as text"),
      sql.indexOf("category text NOT NULL"),
    );
    expect(block.length).toBeGreaterThan(0);

    const fromSql = block
      .split("\n")
      .filter((line) => line.includes("|"))
      .flatMap((line) =>
        line
          .replace(/^\s*--\s*/, "")
          .split("|")
          .map((token) => token.trim()),
      )
      .filter((token) => /^[a-z_]+$/.test(token));

    expect(fromSql.length).toBeGreaterThan(0);
    expect([...fromSql].sort()).toEqual([...EVIDENCE_CATEGORIES].sort());
  });

  it("derives stage coverage areas from the unicorn catalogue", () => {
    const fromCatalogue = new Set(
      UNICORN_STAGE_IDS.flatMap((id) => getStage(id).mandatoryAreas),
    );
    expect([...STAGE_COVERAGE_AREAS].sort()).toEqual(
      [...fromCatalogue].sort(),
    );
  });

  it("gives every artefact a real analysis-area id", () => {
    for (const a of ARTEFACTS) {
      expect(
        ANALYSIS_AREA_IDS as readonly string[],
        `${a.id} analysisArea`,
      ).toContain(a.analysisArea);
      // Label lookup must not throw — proves the id resolves, not just
      // that the string is in the tuple.
      expect(analysisAreaLabel(a.analysisArea).length).toBeGreaterThan(0);
    }
  });

  it("never invents a criterion the analysis area does not already map to", () => {
    for (const a of ARTEFACTS) {
      const area = ANALYSIS_AREAS.find((x) => x.id === a.analysisArea);
      expect(area, `${a.id} area lookup`).toBeDefined();
      // `criterion` is a denormalised read of the framework mapping, not
      // an independent claim. Areas the §6 catalogue honestly leaves
      // uncovered stay null here too.
      expect(a.criterion, `${a.id} criterion`).toBe(area?.criterion ?? null);
      if (a.criterion !== null) {
        expect(CRITERION_KEYS as readonly string[]).toContain(a.criterion);
        expect(criterionTitle(a.criterion).length).toBeGreaterThan(0);
      }
    }
  });

  it("gives every artefact a real evidence category", () => {
    for (const a of ARTEFACTS) {
      expect(
        EVIDENCE_CATEGORIES as readonly string[],
        `${a.id} evidenceCategory`,
      ).toContain(a.evidenceCategory);
    }
  });

  it("only claims stage-coverage areas the unicorn framework knows", () => {
    for (const a of ARTEFACTS) {
      for (const area of a.stageCoverage) {
        expect(STAGE_COVERAGE_AREAS, `${a.id} stageCoverage`).toContain(area);
      }
    }
  });

  it("points every artefact at a real data-room folder and document", () => {
    for (const a of ARTEFACTS) {
      const folder = DATA_ROOM_STRUCTURE.find(
        (f) => f.name === a.dataRoomFolder,
      );
      expect(folder, `${a.id} folder "${a.dataRoomFolder}"`).toBeDefined();
      const names = folder?.documents.map((d) => d.name) ?? [];
      expect(names, `${a.id} document "${a.dataRoomDocument}"`).toContain(
        a.dataRoomDocument,
      );
    }
  });

  it("uses only real criterion keys in every stage's answers", () => {
    for (const stage of SPROCKETBAY_STAGES) {
      const seen = new Set<CriterionKey>();
      for (const ans of stage.answers) {
        expect(CRITERION_KEYS as readonly string[]).toContain(ans.criterion);
        expect(seen.has(ans.criterion), `${stage.stage} duplicate answer`).toBe(
          false,
        );
        seen.add(ans.criterion);
      }
    }
  });
});

// ── 2. Coverage: 6 stages, 12 phases, 13 areas, 13 criteria ────────

describe("coverage", () => {
  it("covers all six unicorn stages, in order, exactly once", () => {
    expect(SPROCKETBAY_STAGES.map((s) => s.stage)).toEqual([
      ...UNICORN_STAGE_IDS,
    ]);
  });

  it("covers all twelve growth phases exactly once across the stages", () => {
    const phases = SPROCKETBAY_STAGES.flatMap((s) => s.phases);
    expect(phases.length).toBe(GROWTH_PHASE_IDS.length);
    expect([...phases].sort()).toEqual([...GROWTH_PHASE_IDS].sort());
    // The 12-phase catalogue and the gating taxonomy must agree, so a
    // phase renamed in GROWTH_PHASES breaks this too.
    expect(GROWTH_PHASES.map((p) => p.id).sort()).toEqual(
      [...GROWTH_PHASE_IDS].sort(),
    );
    for (const p of phases) expect(phaseLabel(p).length).toBeGreaterThan(0);
  });

  it("walks the phases in declaration order — no time travel", () => {
    const order = SPROCKETBAY_STAGES.flatMap((s) => s.phases).map((p) =>
      GROWTH_PHASE_IDS.indexOf(p),
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("produces at least one artefact for every one of the analysis areas", () => {
    const used = new Set(ARTEFACTS.map((a) => a.analysisArea));
    expect([...used].sort()).toEqual([...ANALYSIS_AREA_IDS].sort());
  });

  it("answers all thirteen criteria by the end of the arc", () => {
    const last = SPROCKETBAY_STAGES[SPROCKETBAY_STAGES.length - 1];
    expect(last.answers.map((a) => a.criterion).sort()).toEqual(
      [...CRITERION_KEYS].sort(),
    );
  });

  it("gives every stage at least three artefacts and a narrative", () => {
    for (const s of SPROCKETBAY_STAGES) {
      expect(s.artefacts.length, `${s.stage} artefacts`).toBeGreaterThanOrEqual(
        3,
      );
      expect(s.narrative.length, `${s.stage} narrative`).toBeGreaterThan(80);
    }
  });

  it("uses unique artefact ids", () => {
    const ids = ARTEFACTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ── 3. Evidence lifecycle ──────────────────────────────────────────

describe("evidence lifecycle", () => {
  it("reaches every declared state by a legal transition path", () => {
    for (const a of ARTEFACTS) {
      expect(replayArtefactState(a), `${a.id} transition replay`).toBe(a.state);
    }
  });

  it("keeps every artefact inside its own stage window", () => {
    for (const stage of SPROCKETBAY_STAGES) {
      const opened = day(stage.enteredOn);
      const closed = day(stage.exitedOn ?? SPROCKETBAY_AS_AT);
      for (const a of stage.artefacts) {
        const issued = day(a.issuedAt);
        expect(issued, `${a.id} issued before stage`).toBeGreaterThanOrEqual(
          opened,
        );
        expect(issued, `${a.id} issued after stage`).toBeLessThanOrEqual(
          closed,
        );
      }
    }
  });

  it("never expires before it is issued", () => {
    for (const a of ARTEFACTS) {
      if (a.expiresAt === null) continue;
      expect(day(a.expiresAt), `${a.id} expiry`).toBeGreaterThan(
        day(a.issuedAt),
      );
    }
  });

  it("does not show lapsed evidence as still verified", () => {
    const asAt = day(SPROCKETBAY_AS_AT);
    for (const a of ARTEFACTS) {
      if (a.state !== "verified" || a.expiresAt === null) continue;
      expect(
        day(a.expiresAt),
        `${a.id} is 'verified' but lapsed before ${SPROCKETBAY_AS_AT}`,
      ).toBeGreaterThan(asAt);
    }
  });

  it("shows the full lifecycle, not just the happy path", () => {
    const states = new Set(ARTEFACTS.map((a) => a.state));
    // A walkthrough where every upload sails through would misrepresent
    // the pipeline. Archived (superseded) and validation_required
    // (waiting on a human) both have to appear.
    expect(states.has("verified")).toBe(true);
    expect(states.has("archived")).toBe(true);
    expect(states.has("validation_required")).toBe(true);
  });

  it("counts only live evidence as live", () => {
    const live = liveArtefacts();
    expect(live.length).toBeLessThan(ARTEFACTS.length);
    for (const a of live) {
      expect(["archived", "expired", "rejected"]).not.toContain(a.state);
    }
  });

  it("gives every artefact a positive size and a content type", () => {
    for (const a of ARTEFACTS) {
      expect(a.sizeBytes, `${a.id} size`).toBeGreaterThan(0);
      expect(a.contentType, `${a.id} contentType`).toMatch(/^[\w.+-]+\/[\w.+-]+$/);
    }
  });
});

// ── 4. Timeline ────────────────────────────────────────────────────

describe("timeline", () => {
  it("starts on the founding date and is contiguous with no gaps", () => {
    expect(SPROCKETBAY_STAGES[0].enteredOn).toBe(SPROCKETBAY_FOUNDED_ON);
    for (let i = 1; i < SPROCKETBAY_STAGES.length; i++) {
      const prev = SPROCKETBAY_STAGES[i - 1];
      const cur = SPROCKETBAY_STAGES[i];
      expect(prev.exitedOn, `${prev.stage} must be closed`).not.toBeNull();
      expect(
        daysBetween(prev.exitedOn as string, cur.enteredOn),
        `${prev.stage} → ${cur.stage} handover`,
      ).toBe(1);
    }
  });

  it("has exactly one open stage, and it is the last one", () => {
    const open = SPROCKETBAY_STAGES.filter((s) => s.exitedOn === null);
    expect(open.length).toBe(1);
    expect(open[0].stage).toBe("S5");
  });

  it("derives days-in-stage from the dates rather than asserting them", () => {
    for (const s of SPROCKETBAY_STAGES) {
      const end = s.exitedOn ?? SPROCKETBAY_AS_AT;
      expect(daysBetween(s.enteredOn, end), `${s.stage} daysInStage`).toBe(
        s.daysInStage,
      );
    }
  });

  it("stays inside each stage's target window", () => {
    for (const s of SPROCKETBAY_STAGES) {
      const cat = getStage(s.stage);
      expect(s.daysInStage, `${s.stage} overshoot`).toBeLessThanOrEqual(
        cat.windowDaysMax,
      );
    }
  });

  it("reaches S5 after the framework's 731-day minimum", () => {
    const s5 = SPROCKETBAY_STAGES.find((s) => s.stage === "S5");
    expect(s5).toBeDefined();
    const elapsed = daysBetween(
      SPROCKETBAY_FOUNDED_ON,
      (s5 as { enteredOn: string }).enteredOn,
    );
    expect(elapsed).toBeGreaterThanOrEqual(getStage("S5").windowDaysMin);
  });

  it("never records anything after the as-at date", () => {
    const asAt = day(SPROCKETBAY_AS_AT);
    for (const a of ARTEFACTS) {
      expect(day(a.issuedAt), `${a.id} issued in the future`).toBeLessThanOrEqual(
        asAt,
      );
    }
  });
});

// ── 5. Computed scores match the real engines ──────────────────────

describe("computed scores", () => {
  const computed = computeWalkthrough();

  it("computes the composite from CRITERIA weights, not from a constant", () => {
    const weights = new Map(CRITERIA.map((c) => [c.key, c.weight]));
    for (const c of computed) {
      const manual =
        c.stage.answers.reduce(
          (sum, a) => sum + a.score * (weights.get(a.criterion) ?? 0),
          0,
        ) / 100;
      expect(c.trustScore, `${c.stage.stage} composite`).toBeCloseTo(manual, 6);
    }
  });

  it("clears each stage's exit trust bar for every completed stage", () => {
    for (const c of computed) {
      if (c.stage.exitedOn === null) continue;
      expect(
        c.trustScore,
        `${c.stage.stage} composite vs exit bar`,
      ).toBeGreaterThanOrEqual(c.catalogue.exitTrustScore);
    }
  });

  it("leaves the open stage short of its own bar — deliberately", () => {
    const s5 = computed[computed.length - 1];
    expect(s5.stage.stage).toBe("S5");
    expect(s5.trustScore).toBeLessThan(s5.catalogue.exitTrustScore);
  });

  it("never lets the composite go backwards", () => {
    for (let i = 1; i < computed.length; i++) {
      expect(
        computed[i].trustScore,
        `${computed[i].stage.stage} vs ${computed[i - 1].stage.stage}`,
      ).toBeGreaterThan(computed[i - 1].trustScore);
    }
  });

  it("never lets an individual criterion score go backwards", () => {
    for (let i = 1; i < SPROCKETBAY_STAGES.length; i++) {
      const prev = new Map(
        SPROCKETBAY_STAGES[i - 1].answers.map((a) => [a.criterion, a.score]),
      );
      for (const a of SPROCKETBAY_STAGES[i].answers) {
        const before = prev.get(a.criterion);
        if (before === undefined) continue;
        expect(
          a.score,
          `${a.criterion} fell at ${SPROCKETBAY_STAGES[i].stage}`,
        ).toBeGreaterThanOrEqual(before);
      }
    }
  });

  it("derives every quality level from computeQuality()", () => {
    for (const c of computed) {
      for (const q of c.qualities) {
        const source = c.stage.answers.find((a) => a.criterion === q.criterion);
        expect(source).toBeDefined();
        expect(q.quality).toBe(
          qualityFor(source as NonNullable<typeof source>),
        );
      }
    }
  });

  it("reaches exceptional quality on the strongest S5 criteria only", () => {
    const s5 = computed[computed.length - 1];
    const exceptional = s5.qualities
      .filter((q) => q.quality === "exceptional")
      .map((q) => q.criterion)
      .sort();
    // ai_score >= 80 AND >= 3 evidence items. Anything else is a real
    // gap in the fixture, not a rendering choice.
    const expected = s5.stage.answers
      .filter(
        (a) =>
          a.score >= 80 &&
          (a.answer.trim().length > 50 ? 1 : 0) + a.fileCount + a.linkCount >= 3,
      )
      .map((a) => a.criterion)
      .sort();
    expect(exceptional).toEqual(expected);
    expect(exceptional.length).toBeGreaterThan(0);
  });

  it("computes the ladder rung from computeVerificationLevel()", () => {
    for (const c of computed) {
      expect(c.verificationLevel).toBe(
        computeVerificationLevel(c.stage.verification),
      );
    }
    expect(computed.map((c) => c.verificationLevel)).toEqual([1, 2, 3, 3, 4, 4]);
  });

  it("clears each stage's exit ladder bar for every completed stage", () => {
    for (const c of computed) {
      if (c.stage.exitedOn === null) continue;
      expect(
        c.verificationLevel,
        `${c.stage.stage} ladder vs exit bar`,
      ).toBeGreaterThanOrEqual(c.catalogue.exitVerificationLevel);
    }
  });

  it("covers every mandatory area for every stage", () => {
    for (const c of computed) {
      expect(c.missingAreas, `${c.stage.stage} missing areas`).toEqual([]);
      expect(coveredAreasThrough(c.stage.stage)).toEqual([...c.coveredAreas]);
    }
  });

  it("lets the company advance out of S0–S4 and not out of S5", () => {
    for (const c of computed) {
      const shouldAdvance = c.stage.exitedOn !== null;
      expect(c.progress.canAdvance, `${c.stage.stage} canAdvance`).toBe(
        shouldAdvance,
      );
      if (shouldAdvance) {
        expect(c.progress.blockers, `${c.stage.stage} blockers`).toEqual([]);
        expect(c.progress.onTrack).toBe(true);
      }
    }
  });

  it("names both open S5 blockers explicitly", () => {
    const s5 = computed[computed.length - 1];
    const codes = s5.progress.blockers.map((b) => b.code).sort();
    expect(codes).toEqual([
      "trust_score_below_exit",
      "verification_level_below_exit",
    ]);
  });

  it("surfaces the exit output only as the stage's unlock", () => {
    for (const c of computed) {
      expect(c.unlocks).toBe(c.catalogue.exitOutput);
    }
  });

  it("resolves canonical stage labels for every phase", () => {
    for (const c of computed) {
      expect(c.canonicalStageLabels.length).toBe(c.stage.phases.length);
      for (const l of c.canonicalStageLabels)
        expect(l.length).toBeGreaterThan(0);
    }
  });
});

// ── 6. Reconciliation with the seeded profile (migration 0299) ─────

describe("reconciliation with /id/sprocketbay-demo", () => {
  const sql = readFileSync(MIGRATION_0299, "utf8");

  it("mirrors the capability scores migration 0299 actually seeds", () => {
    for (const [key, value] of Object.entries(
      SPROCKETBAY_STORED_CAPABILITY_SCORES,
    )) {
      // The migration writes `'leadership',  84,` inside jsonb_build_object.
      const pattern = new RegExp(`'${key}'\\s*,\\s*${value}\\b`);
      expect(pattern.test(sql), `0299 does not seed ${key}=${value}`).toBe(
        true,
      );
    }
    expect(Object.keys(SPROCKETBAY_STORED_CAPABILITY_SCORES).length).toBe(12);
  });

  it("mirrors the slug, legal name and verification level 0299 seeds", () => {
    expect(sql).toContain(`'${SPROCKETBAY_PROFILE_SLUG}'`);
    expect(sql).toContain(SPROCKETBAY_LEGAL_NAME);
    expect(SPROCKETBAY_STORED_VERIFICATION_LEVEL).toBe(4);
  });

  it("lands the walkthrough composite on the published trust score", () => {
    // Two independent routes to one number: the public profile averages
    // the 12 stored capability scores; the walkthrough weights the 13
    // criterion answers. A demo that published two different "trust
    // scores" for the same company would be the bug.
    const published = deriveTrustScore(SPROCKETBAY_STORED_CAPABILITY_SCORES);
    const walkthrough = computeCriteriaComposite(
      SPROCKETBAY_STAGES[SPROCKETBAY_STAGES.length - 1].answers,
    );
    expect(published).toBe(81.3);
    expect(walkthrough).toBe(81.3);
  });

  it("lands the walkthrough ladder rung on the published level", () => {
    const final = computeStage(
      SPROCKETBAY_STAGES[SPROCKETBAY_STAGES.length - 1],
    );
    expect(final.verificationLevel).toBe(SPROCKETBAY_STORED_VERIFICATION_LEVEL);
  });

  it("keeps level 5 above the company rather than handing it over", () => {
    const last = SPROCKETBAY_STAGES[SPROCKETBAY_STAGES.length - 1];
    expect(last.verification.continuouslyMonitored).toBe(false);
  });

  it("records the one place the demo cannot be honest in both directions", () => {
    const unreconciled = SPROCKETBAY_RECONCILIATION.filter(
      (n) => !n.reconciled,
    );
    expect(unreconciled.map((n) => n.id)).toEqual(["abr-vs-no-abn"]);
    // The ABR signal is asserted in the fixture; the ladder engine refuses
    // level 2 without it. Prove the dependency is real, so nobody deletes
    // the note thinking it is decorative.
    const s1 = SPROCKETBAY_STAGES[1];
    expect(computeVerificationLevel(s1.verification)).toBe(2);
    expect(
      computeVerificationLevel({ ...s1.verification, abrConfirmed: false }),
    ).toBe(1);
  });

  it("never publishes an ABN-shaped string anywhere in the fixture", () => {
    const blob = JSON.stringify(SPROCKETBAY_STAGES) + SPROCKETBAY_SAMPLE_NOTICE;
    // 11 consecutive digits, with or without ABN's conventional spacing.
    expect(blob).not.toMatch(/\b\d{2}[ ]?\d{3}[ ]?\d{3}[ ]?\d{3}\b/);
  });

  it("marks itself as sample data", () => {
    expect(SPROCKETBAY_SAMPLE_NOTICE).toContain("SAMPLE DATA");
    expect(SPROCKETBAY_SAMPLE_NOTICE).toContain("not a real trading entity");
    expect(SPROCKETBAY_LEGAL_NAME).toContain("(Sample Profile)");
  });
});

// ── 7. Shape guards ────────────────────────────────────────────────

describe("shape", () => {
  it("keeps every reconciliation note substantive", () => {
    expect(SPROCKETBAY_RECONCILIATION.length).toBeGreaterThanOrEqual(3);
    for (const n of SPROCKETBAY_RECONCILIATION) {
      expect(n.heading.length).toBeGreaterThan(10);
      expect(n.body.length).toBeGreaterThan(120);
    }
  });

  it("explains how every artefact was produced", () => {
    for (const a of ARTEFACTS) {
      expect(a.producedBy.length, `${a.id} producedBy`).toBeGreaterThan(40);
      expect(a.title, `${a.id} title`).toMatch(/\(sample\)$/);
    }
  });

  it("writes a real answer for every criterion", () => {
    for (const stage of SPROCKETBAY_STAGES) {
      for (const a of stage.answers) {
        expect(a.answer.length, `${stage.stage}/${a.criterion}`).toBeGreaterThan(
          50,
        );
        expect(a.score).toBeGreaterThanOrEqual(0);
        expect(a.score).toBeLessThanOrEqual(100);
        expect(a.fileCount).toBeGreaterThanOrEqual(0);
        expect(a.linkCount).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("exposes a stable artefact count per stage", () => {
    const counts: Record<UnicornStageId, number> = SPROCKETBAY_STAGES.reduce(
      (acc, s) => {
        acc[s.stage] = s.artefacts.length;
        return acc;
      },
      {} as Record<UnicornStageId, number>,
    );
    expect(counts).toEqual({ S0: 4, S1: 6, S2: 7, S3: 6, S4: 5, S5: 6 });
    expect(ARTEFACTS.length).toBe(34);
  });

  it("types every artefact through the exported interface", () => {
    const first: SprocketbayArtefact = ARTEFACTS[0];
    expect(first.id.startsWith("sb-a")).toBe(true);
  });
});
