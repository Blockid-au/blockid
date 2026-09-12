import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { GROWTH_PHASE_IDS, GROWTH_PHASE_TO_STAGE } from "@/lib/journey-map";
import { CANONICAL_STAGES } from "@/lib/journey-vocabulary";
import {
  AUTO_REACHABLE_STAGES,
  CUSTOMER_STAGES,
  CUSTOMER_STAGE_LABELS,
  CUSTOMER_STAGE_TO_GROWTH_PHASE,
  EMPTY_SIGNALS,
  TERMINAL_CUSTOMER_STAGES,
  countStageMoves,
  customerStageCanonicalRank,
  customerStageToCanonical,
  deriveAutoStage,
  earliestIso,
  isCustomerStage,
  resolveAutoTransition,
  resolveManualTransition,
  type CustomerStage,
} from "./customer-stage";

const MIGRATION = readFileSync(
  resolve(__dirname, "../../../supabase/migrations/0333_reseller_customer_stage.sql"),
  "utf8",
);

describe("customer pipeline stage vocabulary", () => {
  it("is the founder-facing ladder lead → onboarded → scored → data_room → fundraising → invested, with churned as the side exit", () => {
    expect([...CUSTOMER_STAGES]).toEqual([
      "lead",
      "onboarded",
      "scored",
      "data_room",
      "fundraising",
      "invested",
      "churned",
    ]);
    expect(TERMINAL_CUSTOMER_STAGES.has("invested")).toBe(true);
    expect(TERMINAL_CUSTOMER_STAGES.has("churned")).toBe(true);
    expect(TERMINAL_CUSTOMER_STAGES.has("fundraising")).toBe(false);
  });

  it("maps every non-terminal stage onto a real growth phase id and the ladder is monotonic in the founder's own taxonomy", () => {
    let lastPhase = -1;
    let lastCanonical = -1;
    for (const stage of CUSTOMER_STAGES) {
      const phase = CUSTOMER_STAGE_TO_GROWTH_PHASE[stage];
      if (stage === "churned") {
        expect(phase).toBeNull();
        expect(customerStageToCanonical(stage)).toBeNull();
        continue;
      }
      expect(phase, `${stage} has no growth phase`).not.toBeNull();
      const phaseIdx = GROWTH_PHASE_IDS.indexOf(phase!);
      expect(phaseIdx, `${stage} → unknown growth phase ${phase}`).toBeGreaterThan(-1);
      expect(phaseIdx, `${stage} regresses in growth phase order`).toBeGreaterThan(lastPhase);
      lastPhase = phaseIdx;

      const canonical = customerStageToCanonical(stage);
      expect(canonical).toBe(GROWTH_PHASE_TO_STAGE[phase!]);
      expect(CANONICAL_STAGES).toContain(canonical);
      const cRank = customerStageCanonicalRank(stage);
      expect(cRank, `${stage} regresses in canonical order`).toBeGreaterThanOrEqual(lastCanonical);
      lastCanonical = cRank;
    }
  });

  it("has EN + VI labels and a hint for every stage", () => {
    for (const stage of CUSTOMER_STAGES) {
      const l = CUSTOMER_STAGE_LABELS[stage];
      expect(l.label_en.length).toBeGreaterThan(0);
      expect(l.label_vi.length).toBeGreaterThan(0);
      expect(l.hint_en.length).toBeGreaterThan(0);
    }
  });

  it("matches the CHECK constraint in migration 0333 exactly", () => {
    const m = /stage\s+text[^,]*?CHECK\s*\(\s*stage\s+IN\s*\(([^)]*)\)/s.exec(MIGRATION);
    expect(m, "stage CHECK not found in migration").not.toBeNull();
    const sqlStages = m![1]
      .split(",")
      .map((s) => s.trim().replace(/^'|'$/g, ""))
      .filter(Boolean);
    expect(sqlStages).toEqual([...CUSTOMER_STAGES]);
    expect(MIGRATION).toMatch(/stage_source\s+text[^,]*?CHECK\s*\(\s*stage_source\s+IN\s*\(\s*'auto'\s*,\s*'manual'\s*\)/s);
    expect(MIGRATION).toContain("ENABLE ROW LEVEL SECURITY");
    expect(MIGRATION).toContain("UNIQUE (reseller_id, customer_user_id)");
  });

  it("isCustomerStage guards unknown strings", () => {
    expect(isCustomerStage("scored")).toBe(true);
    expect(isCustomerStage("won")).toBe(false);
    expect(isCustomerStage(3)).toBe(false);
  });
});

describe("deriveAutoStage", () => {
  it("returns lead with no signals", () => {
    expect(deriveAutoStage(EMPTY_SIGNALS)).toBe("lead");
  });

  it("takes the furthest signal present", () => {
    expect(deriveAutoStage({ ...EMPTY_SIGNALS, first_project_at: "2026-09-01T00:00:00Z" })).toBe("onboarded");
    expect(
      deriveAutoStage({
        ...EMPTY_SIGNALS,
        first_project_at: "2026-09-01T00:00:00Z",
        first_svi_at: "2026-09-02T00:00:00Z",
      }),
    ).toBe("scored");
    expect(deriveAutoStage({ ...EMPTY_SIGNALS, first_data_room_at: "2026-09-03T00:00:00Z" })).toBe("data_room");
    expect(deriveAutoStage({ ...EMPTY_SIGNALS, first_fundraising_at: "2026-09-04T00:00:00Z" })).toBe("fundraising");
  });

  it("ignores signals at or before `after`", () => {
    const s = { ...EMPTY_SIGNALS, first_svi_at: "2026-09-02T00:00:00Z", first_project_at: "2026-09-01T00:00:00Z" };
    expect(deriveAutoStage(s, { after: "2026-09-02T00:00:00Z" })).toBe("lead");
    expect(deriveAutoStage(s, { after: "2026-09-01T12:00:00Z" })).toBe("scored");
  });

  it("only ever lands on auto-reachable stages", () => {
    const all = {
      first_project_at: "2026-01-01T00:00:00Z",
      first_svi_at: "2026-01-02T00:00:00Z",
      first_data_room_at: "2026-01-03T00:00:00Z",
      first_fundraising_at: "2026-01-04T00:00:00Z",
    };
    const got = deriveAutoStage(all);
    expect(AUTO_REACHABLE_STAGES).toContain(got);
    expect(got).not.toBe("invested");
  });

  it("earliestIso picks the earlier of two timestamps and tolerates nulls", () => {
    expect(earliestIso(null, null)).toBeNull();
    expect(earliestIso("2026-01-02T00:00:00Z", null)).toBe("2026-01-02T00:00:00Z");
    expect(earliestIso("2026-01-02T00:00:00Z", "2026-01-01T00:00:00Z")).toBe("2026-01-01T00:00:00Z");
  });
});

describe("resolveAutoTransition — never backwards, never out of terminal, respects manual", () => {
  const scoredSignals = {
    ...EMPTY_SIGNALS,
    first_project_at: "2026-09-01T00:00:00Z",
    first_svi_at: "2026-09-02T00:00:00Z",
  };

  it("seeds a brand-new customer from lead", () => {
    const t = resolveAutoTransition(null, scoredSignals);
    expect(t).toMatchObject({ from: "lead", to: "scored", source: "auto", changed: true });
  });

  it("advances forward from an auto stage", () => {
    const t = resolveAutoTransition(
      { stage: "onboarded", stage_source: "auto", stage_updated_at: "2026-09-01T00:00:00Z" },
      scoredSignals,
    );
    expect(t).toMatchObject({ from: "onboarded", to: "scored", changed: true });
  });

  it("does not move when the derived stage equals the current one", () => {
    const t = resolveAutoTransition(
      { stage: "scored", stage_source: "auto", stage_updated_at: "2026-09-02T00:00:00Z" },
      scoredSignals,
    );
    expect(t.changed).toBe(false);
    expect(t.reason).toBe("same_stage");
  });

  it("never moves backwards automatically", () => {
    const t = resolveAutoTransition(
      { stage: "fundraising", stage_source: "auto", stage_updated_at: "2026-08-01T00:00:00Z" },
      scoredSignals,
    );
    expect(t.changed).toBe(false);
    expect(t.to).toBe("fundraising");
    expect(t.reason).toBe("would_move_backwards");
  });

  it.each(["invested", "churned"] as CustomerStage[])("never leaves the terminal stage %s", (stage) => {
    const t = resolveAutoTransition(
      { stage, stage_source: "manual", stage_updated_at: "2026-01-01T00:00:00Z" },
      { ...scoredSignals, first_fundraising_at: "2026-09-10T00:00:00Z" },
    );
    expect(t.changed).toBe(false);
    expect(t.reason).toBe("terminal_stage");
  });

  it("holds a manual downgrade when the only evidence predates the override", () => {
    // Reseller manually pulled the customer back to onboarded on Sep 5 —
    // the Sep 2 SVI run must not bounce them back to scored overnight.
    const t = resolveAutoTransition(
      { stage: "onboarded", stage_source: "manual", stage_updated_at: "2026-09-05T00:00:00Z" },
      scoredSignals,
    );
    expect(t.changed).toBe(false);
    expect(t.reason).toBe("manual_override_holds");
  });

  it("advances past a manual stage only on evidence dated after the override", () => {
    const t = resolveAutoTransition(
      { stage: "onboarded", stage_source: "manual", stage_updated_at: "2026-09-05T00:00:00Z" },
      { ...scoredSignals, first_data_room_at: "2026-09-08T00:00:00Z" },
    );
    expect(t).toMatchObject({ from: "onboarded", to: "data_room", changed: true, source: "auto" });
  });
});

describe("resolveManualTransition — any direction", () => {
  it("moves backwards when a person says so", () => {
    const t = resolveManualTransition(
      { stage: "fundraising", stage_source: "auto", stage_updated_at: "2026-09-01T00:00:00Z" },
      "onboarded",
    );
    expect(t).toMatchObject({ from: "fundraising", to: "onboarded", source: "manual", changed: true });
  });

  it("can set the stages auto never reaches", () => {
    expect(resolveManualTransition(null, "invested").changed).toBe(true);
    expect(resolveManualTransition(null, "churned").changed).toBe(true);
  });

  it("re-asserting the same manual stage is a no-op, but pinning an auto stage as manual is a change", () => {
    expect(
      resolveManualTransition(
        { stage: "scored", stage_source: "manual", stage_updated_at: null },
        "scored",
      ).changed,
    ).toBe(false);
    expect(
      resolveManualTransition(
        { stage: "scored", stage_source: "auto", stage_updated_at: null },
        "scored",
      ).changed,
    ).toBe(true);
  });
});

describe("countStageMoves — weekly digest line", () => {
  const now = new Date("2026-09-14T04:15:00Z");

  it("counts distinct movers per reseller inside the trailing 7 days, ignoring fresh auto leads", () => {
    const rows = [
      { reseller_id: "r1", stage: "scored" as const, stage_source: "auto" as const, stage_updated_at: "2026-09-12T00:00:00Z" },
      { reseller_id: "r1", stage: "data_room" as const, stage_source: "auto" as const, stage_updated_at: "2026-09-13T00:00:00Z" },
      { reseller_id: "r1", stage: "churned" as const, stage_source: "manual" as const, stage_updated_at: "2026-09-10T00:00:00Z" },
      { reseller_id: "r1", stage: "lead" as const, stage_source: "auto" as const, stage_updated_at: "2026-09-13T00:00:00Z" },
      { reseller_id: "r1", stage: "fundraising" as const, stage_source: "auto" as const, stage_updated_at: "2026-08-01T00:00:00Z" },
      { reseller_id: "r2", stage: "onboarded" as const, stage_source: "auto" as const, stage_updated_at: null },
    ];
    const out = countStageMoves(rows, { now });
    expect(out.get("r1")).toEqual({
      reseller_id: "r1",
      moved: 3,
      manual: 1,
      by_stage: { scored: 1, data_room: 1, churned: 1 },
    });
    expect(out.has("r2")).toBe(false);
  });

  it("a manual reset back to lead still counts as a move", () => {
    const out = countStageMoves(
      [{ reseller_id: "r1", stage: "lead", stage_source: "manual", stage_updated_at: "2026-09-13T00:00:00Z" }],
      { now },
    );
    expect(out.get("r1")?.moved).toBe(1);
  });
});
