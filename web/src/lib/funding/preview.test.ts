// Colocated vitest for the free /funding preview (T0242). Runs the real
// seeds so the "never empty" guarantee is checked against production data.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { mapGrantSeeds, mapProgramSeeds } from "./seed-map";
import { parseFundingIntake, type FundingIntake } from "./intake";
import { buildFundingPreview, catalogueForIntake } from "./preview";

const DATA_DIR = resolve(__dirname, "../../../content/data");
const grants = mapGrantSeeds(
  (JSON.parse(readFileSync(resolve(DATA_DIR, "grants-au.seed.json"), "utf8")) as { grants: unknown[] }).grants,
);
const programs = mapProgramSeeds(
  (JSON.parse(readFileSync(resolve(DATA_DIR, "programs-au.seed.json"), "utf8")) as { programs: unknown[] }).programs,
);
const TODAY = new Date(Date.UTC(2026, 8, 10));

function intake(over: Record<string, unknown>): FundingIntake {
  const r = parseFundingIntake({ description: "AI compliance assistant for Australian accountants", state: "NSW", stage: "mvp", ...over });
  if (!r.ok) throw new Error(r.error);
  return r.intake;
}

describe("buildFundingPreview — free tier shape", () => {
  it("returns counts, top-3 names with a why, the hero A$ number and locked counts — nothing paid", () => {
    const p = buildFundingPreview(intake({ industry_tags: ["ai_ml", "software_saas"], city: "Sydney" }), grants, programs, TODAY);
    expect(p.grant_count).toBeGreaterThan(0);
    expect(p.program_count).toBeGreaterThan(0);
    expect(p.top_grants.length).toBeLessThanOrEqual(3);
    expect(p.top_programs.length).toBeLessThanOrEqual(3);
    for (const m of [...p.top_grants, ...p.top_programs]) {
      expect(m.name.length).toBeGreaterThan(0);
      expect(m.why.length).toBeGreaterThan(0);
    }
    expect(p.top_grants_amount_max_aud).toBeGreaterThan(0);
    expect(p.locked.checklist_items).toBeGreaterThan(0);
    expect(p.fallback).toBeUndefined();
    expect(p.location_unknown).toBe(false);
    // The paid surface must not leak through the preview payload.
    expect(JSON.stringify(p)).not.toMatch(/eligibility_checklist|"timeline":|estimate_aud/);
  });

  it("not incorporated + no based state → national rows only, flagged", () => {
    const i = intake({ state: "not_incorporated", stage: "idea" });
    const cat = catalogueForIntake(i, grants, programs);
    expect(cat.grants.every((g) => g.state === "national")).toBe(true);
    expect(cat.programs.every((p) => p.state === "national" || p.capital === "Remote")).toBe(true);
    const p = buildFundingPreview(i, grants, programs, TODAY);
    expect(p.location_unknown).toBe(true);
    expect(p.grant_count + p.program_count + (p.fallback?.grants.length ?? 0)).toBeGreaterThan(0);
  });

  it("is never empty — a profile that matches nothing gets national fallback rows with a reason", () => {
    // Rig every row with a hard HQ gate the NSW profile fails; the national
    // open rows still qualify for the fallback list.
    const riggedGrants = grants.map((g) => ({ ...g, eligibility: { ...g.eligibility, hq_required: "TAS" } }));
    const riggedPrograms = programs.map((r) => ({ ...r, eligibility: { ...r.eligibility, hq_required: "TAS" } }));
    const p = buildFundingPreview(intake({}), riggedGrants, riggedPrograms, TODAY);
    expect(p.grant_count).toBe(0);
    expect(p.program_count).toBe(0);
    expect(p.fallback).toBeDefined();
    expect(p.fallback?.reason).toMatch(/NSW/);
    const nationalOpen = grants.filter((g) => g.state === "national" && g.status === "open" && !g.exclude_from_matching);
    expect(p.fallback?.grants.length).toBe(Math.min(3, nationalOpen.length));
    for (const m of p.fallback?.grants ?? []) expect(m.why.length).toBeGreaterThan(0);

    // Empty catalogue: still a defined fallback (reason only) — never a crash.
    const empty = buildFundingPreview(intake({}), [], [], TODAY);
    expect(empty.fallback?.grants).toEqual([]);
  });

  it("every state and stage combination yields names (never a blank screen)", () => {
    for (const state of ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"]) {
      for (const stage of ["idea", "pre_revenue_prototype", "mvp", "early_revenue", "scaling"]) {
        const p = buildFundingPreview(intake({ state, stage }), grants, programs, TODAY);
        const names = p.fallback ? [...p.fallback.grants, ...p.fallback.programs] : [...p.top_grants, ...p.top_programs];
        expect(names.length, `${state}/${stage}`).toBeGreaterThan(0);
      }
    }
  });
});
