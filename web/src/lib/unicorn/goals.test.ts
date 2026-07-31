// Colocated 10-case suite for goals.ts — sub-goal catalogue shape,
// milestone template shape, blocker predicates (ABN, expired evidence,
// critical findings).

import { describe, it, expect } from "vitest";
import {
  STAGE_GOALS,
  STAGE_MILESTONE_TEMPLATES,
  computeStageBlockers,
  EVIDENCE_EXPIRY_DAYS,
} from "./goals";
import { UNICORN_STAGE_IDS } from "./framework";

describe("unicorn/goals — catalogue shape", () => {
  it("[1] every stage exposes 3-5 sub-goals", () => {
    for (const id of UNICORN_STAGE_IDS) {
      const goals = STAGE_GOALS[id];
      expect(goals.length).toBeGreaterThanOrEqual(3);
      expect(goals.length).toBeLessThanOrEqual(5);
    }
  });

  it("[2] every stage exposes 3-5 milestone templates", () => {
    for (const id of UNICORN_STAGE_IDS) {
      const ms = STAGE_MILESTONE_TEMPLATES[id];
      expect(ms.length).toBeGreaterThanOrEqual(3);
      expect(ms.length).toBeLessThanOrEqual(5);
    }
  });

  it("[3] milestone codes are unique within a stage", () => {
    for (const id of UNICORN_STAGE_IDS) {
      const codes = STAGE_MILESTONE_TEMPLATES[id].map((m) => m.code);
      expect(new Set(codes).size).toBe(codes.length);
    }
  });

  it("[4] milestone due offsets are non-negative", () => {
    for (const id of UNICORN_STAGE_IDS) {
      for (const m of STAGE_MILESTONE_TEMPLATES[id]) {
        expect(m.dueOffsetDays).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("[5] every sub-goal names an owner agent", () => {
    for (const id of UNICORN_STAGE_IDS) {
      for (const g of STAGE_GOALS[id]) {
        expect(g.ownerAgent.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("unicorn/goals — computeStageBlockers", () => {
  const now = new Date("2026-07-31T00:00:00Z");

  it("[6] clean snapshot → no blockers", () => {
    const b = computeStageBlockers({
      abn: "79659615111",
      mostRecentEvidenceAt: new Date("2026-07-01T00:00:00Z"),
      openFindings: [],
      now,
    });
    expect(b).toEqual([]);
  });

  it("[7] missing ABN flagged", () => {
    const b = computeStageBlockers({
      abn: null,
      mostRecentEvidenceAt: new Date("2026-07-01T00:00:00Z"),
      openFindings: [],
      now,
    });
    expect(b.map((x) => x.code)).toEqual(["missing_abn"]);
  });

  it("[8] evidence older than EVIDENCE_EXPIRY_DAYS flagged", () => {
    const ancient = new Date(
      now.getTime() - (EVIDENCE_EXPIRY_DAYS + 5) * 24 * 60 * 60 * 1000,
    );
    const b = computeStageBlockers({
      abn: "79659615111",
      mostRecentEvidenceAt: ancient,
      openFindings: [],
      now,
    });
    expect(b.map((x) => x.code)).toEqual(["expired_evidence"]);
  });

  it("[9] evidence exactly at threshold NOT flagged (strict > only)", () => {
    const atThreshold = new Date(
      now.getTime() - EVIDENCE_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    );
    const b = computeStageBlockers({
      abn: "79659615111",
      mostRecentEvidenceAt: atThreshold,
      openFindings: [],
      now,
    });
    expect(b).toEqual([]);
  });

  it("[10] high + critical open findings both counted; medium/low ignored", () => {
    const b = computeStageBlockers({
      abn: "79659615111",
      mostRecentEvidenceAt: new Date("2026-07-01T00:00:00Z"),
      openFindings: [
        { severity: "high" },
        { severity: "critical" },
        { severity: "medium" },
        { severity: "low" },
      ],
      now,
    });
    expect(b.map((x) => x.code)).toEqual(["open_critical_findings"]);
    expect(b[0]!.detail).toEqual({ count: 2 });
  });
});
