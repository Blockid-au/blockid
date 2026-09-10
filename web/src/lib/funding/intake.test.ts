// Colocated vitest for the /funding intake parser (T0242).

import { describe, expect, it } from "vitest";
import {
  DEMOGRAPHIC_TOGGLES,
  INDUSTRY_OPTIONS,
  INTAKE_STAGES,
  NOT_INCORPORATED,
  STATE_OPTIONS,
  describeIntake,
  effectiveState,
  intakeToGrantProfile,
  intakeToProjectGrantProfile,
  locationUnknown,
  parseFundingIntake,
} from "./intake";

const BASE = { description: "Soil sensors for grain farmers in regional NSW", state: "NSW", stage: "mvp" };

describe("parseFundingIntake — the three required answers", () => {
  it("accepts the minimal body and defaults every optional field", () => {
    const r = parseFundingIntake(BASE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.intake.state).toBe("NSW");
    expect(r.intake.stage).toBe("mvp");
    expect(r.intake.industry_tags).toEqual([]);
    expect(r.intake.women_led).toBe(false);
    expect(r.intake.turnover_aud).toBeNull();
    expect(r.intake.export_intent).toBeNull();
  });

  it("rejects a short / missing description with the field name", () => {
    const r = parseFundingIntake({ ...BASE, description: "short" });
    expect(r).toMatchObject({ ok: false, field: "description" });
    expect(parseFundingIntake({})).toMatchObject({ ok: false, field: "description" });
  });

  it("rejects an unknown state and an unknown stage", () => {
    expect(parseFundingIntake({ ...BASE, state: "NZ" })).toMatchObject({ ok: false, field: "state" });
    expect(parseFundingIntake({ ...BASE, stage: "unicorn" })).toMatchObject({ ok: false, field: "stage" });
  });

  it("is case-insensitive on state and stage", () => {
    const r = parseFundingIntake({ ...BASE, state: "vic", stage: "Early_Revenue" });
    expect(r.ok && r.intake.state).toBe("VIC");
    expect(r.ok && r.intake.stage).toBe("early_revenue");
  });

  it("accepts 'not incorporated yet' with an optional based-in state", () => {
    const a = parseFundingIntake({ ...BASE, state: NOT_INCORPORATED });
    expect(a.ok && a.intake.state).toBe(NOT_INCORPORATED);
    expect(a.ok && locationUnknown(a.intake)).toBe(true);
    const b = parseFundingIntake({ ...BASE, state: NOT_INCORPORATED, based_state: "wa" });
    expect(b.ok && b.intake.based_state).toBe("WA");
    expect(b.ok && locationUnknown(b.intake)).toBe(false);
    expect(b.ok && effectiveState(b.intake)).toBe("WA");
  });
});

describe("parseFundingIntake — improve-my-match drawer", () => {
  it("keeps only known industry tags, deduped, max 6", () => {
    const r = parseFundingIntake({
      ...BASE,
      industry_tags: ["fintech", "FINTECH", "bogus", "ai_ml", "space", "quantum", "edtech", "proptech", "climate", "construction"],
    });
    expect(r.ok && r.intake.industry_tags).toEqual(["fintech", "ai_ml", "space", "quantum", "edtech", "proptech"]);
  });

  it("coerces money strings and ignores negatives / garbage", () => {
    const r = parseFundingIntake({ ...BASE, turnover_aud: "A$12,500", rd_spend_aud: -4, headcount: "3", incorporated_year: "2024" });
    expect(r.ok && r.intake.turnover_aud).toBe(12500);
    expect(r.ok && r.intake.rd_spend_aud).toBeNull();
    expect(r.ok && r.intake.headcount).toBe(3);
    expect(r.ok && r.intake.incorporated_year).toBe(2024);
  });

  it("drops an incorporation year outside 1950..now", () => {
    const r = parseFundingIntake({ ...BASE, incorporated_year: 1899 });
    expect(r.ok && r.intake.incorporated_year).toBeNull();
  });

  it("reads toggles as booleans from true / 'on' / '1'", () => {
    const r = parseFundingIntake({ ...BASE, women_led: "on", regional: 1, under_30: true, indigenous_owned: "false", export_intent: "true" });
    expect(r.ok && r.intake.women_led).toBe(true);
    expect(r.ok && r.intake.regional).toBe(true);
    expect(r.ok && r.intake.under_30).toBe(true);
    expect(r.ok && r.intake.indigenous_owned).toBe(false);
    expect(r.ok && r.intake.export_intent).toBe(true);
  });
});

describe("intakeToGrantProfile", () => {
  it("maps toggles to §5d demographic tags and the year to an ISO date", () => {
    const r = parseFundingIntake({ ...BASE, women_led: true, regional: true, incorporated_year: 2024, turnover_aud: 1000 });
    if (!r.ok) throw new Error(r.error);
    const p = intakeToGrantProfile(r.intake);
    expect(p.state).toBe("NSW");
    expect(p.entity_type).toBe("pty_ltd");
    expect(p.incorporated_at).toBe("2024-01-01");
    expect(p.founder_demographics).toEqual(["women_led", "regional_founder"]);
    expect(p.turnover_aud).toBe(1000);
    expect(p.description).toBe(BASE.description);
  });

  it("not incorporated → entity unknown (never fails the ACN gate) and NSW fallback only when location is unknown", () => {
    const r = parseFundingIntake({ ...BASE, state: NOT_INCORPORATED, incorporated_year: 2024 });
    if (!r.ok) throw new Error(r.error);
    const p = intakeToGrantProfile(r.intake);
    expect(p.entity_type).toBeNull();
    expect(p.incorporated_at).toBeNull();
    expect(p.state).toBe("NSW");
    expect(locationUnknown(r.intake)).toBe(true);
  });

  it("project_grant_profiles mirror stores null state for not-incorporated founders", () => {
    const r = parseFundingIntake({ ...BASE, state: NOT_INCORPORATED });
    if (!r.ok) throw new Error(r.error);
    const row = intakeToProjectGrantProfile(r.intake);
    expect(row.state).toBeNull();
    expect(row.entity_type).toBeNull();
    expect(row.founder_demographics).toEqual([]);
    expect(row.export_intent).toBe(false);
  });
});

describe("vocab", () => {
  it("offers 8 states + not incorporated, 5 stages, the §5d industries and 4 toggles", () => {
    expect(STATE_OPTIONS).toHaveLength(9);
    expect(STATE_OPTIONS.at(-1)?.value).toBe(NOT_INCORPORATED);
    expect(INTAKE_STAGES.map((s) => s.value)).toEqual(["idea", "pre_revenue_prototype", "mvp", "early_revenue", "scaling"]);
    expect(INDUSTRY_OPTIONS).toHaveLength(22);
    expect(DEMOGRAPHIC_TOGGLES.map((t) => t.tag)).toEqual(["women_led", "indigenous_owned_50", "regional_founder", "young_founder_under_30"]);
  });

  it("describeIntake renders a readable header line", () => {
    const r = parseFundingIntake({ ...BASE, industry_tags: ["agtech_food"] });
    if (!r.ok) throw new Error(r.error);
    expect(describeIntake(r.intake)).toBe("NSW · MVP · Agtech / food");
  });
});
