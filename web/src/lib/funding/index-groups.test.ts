import { describe, expect, it } from "vitest";
import grantsSeed from "../../../content/data/grants-au.seed.json";
import programsSeed from "../../../content/data/programs-au.seed.json";
import { AU_STATES, CAPITALS, mapGrantSeeds, mapProgramSeeds } from "./seed-map";
import { INDEX_ROWS_PER_GROUP, grantGroupExpanded, groupGrantsByState, groupProgramsByCapital } from "./index-groups";

const grants = mapGrantSeeds((grantsSeed as { grants: unknown[] }).grants).filter((g) => !g.exclude_from_matching);
const programs = mapProgramSeeds((programsSeed as { programs: unknown[] }).programs);

describe("groupProgramsByCapital", () => {
  it("follows CAPITALS order, omits empty capitals, keeps every row exactly once, and splits visible / tail at INDEX_ROWS_PER_GROUP", () => {
    const groups = groupProgramsByCapital(programs);
    expect(INDEX_ROWS_PER_GROUP).toBe(6);
    const expected = CAPITALS.filter((c) => programs.some((p) => p.capital === c));
    expect(groups.map((g) => g.key)).toEqual(expected);
    const ids = groups.flatMap((g) => g.rows.map((r) => r.id));
    expect(ids).toHaveLength(programs.length);
    expect(new Set(ids).size).toBe(programs.length);
    for (const g of groups) {
      expect(g.visible.length).toBeLessThanOrEqual(6);
      expect([...g.visible, ...g.tail].map((r) => r.id)).toEqual(g.rows.map((r) => r.id));
      expect(g.open).toBe(g.rows.filter((r) => r.status === "open").length);
      // Open rows lead every group.
      const firstNotOpen = g.rows.findIndex((r) => r.status !== "open");
      if (firstNotOpen >= 0) expect(g.rows.slice(firstNotOpen).some((r) => r.status === "open")).toBe(false);
    }
    // At least one capital in the real seed has more than six rows (the tail is exercised).
    expect(groups.some((g) => g.tail.length > 0)).toBe(true);
  });

  it("a filtered subset only yields the capitals present", () => {
    const perth = groupProgramsByCapital(programs.filter((p) => p.capital === "Perth"));
    expect(perth.map((g) => g.key)).toEqual(["Perth"]);
    expect(groupProgramsByCapital([])).toEqual([]);
  });
});

describe("groupGrantsByState", () => {
  it("national first, then AU_STATES order, every indexable grant once", () => {
    const groups = groupGrantsByState(grants);
    expect(groups[0].key).toBe("national");
    expect(groups.map((g) => g.key)).toEqual(AU_STATES.filter((s) => grants.some((g) => g.state === s)));
    const ids = groups.flatMap((g) => g.rows.map((r) => r.id));
    expect(new Set(ids).size).toBe(grants.length);
    expect(ids).toHaveLength(grants.length);
  });

  it("the filtered state leads, national follows", () => {
    const groups = groupGrantsByState(grants, "WA");
    expect(groups[0].key).toBe("WA");
    expect(groups[1].key).toBe("national");
    const nsw = groupGrantsByState(grants.filter((g) => g.state === "NSW" || g.state === "national"), "NSW");
    expect(nsw.map((g) => g.key)).toEqual(["NSW", "national"]);
  });

  it("grantGroupExpanded: national and the filtered state expand, other states collapse", () => {
    expect(grantGroupExpanded("national", null)).toBe(true);
    expect(grantGroupExpanded("NSW", null)).toBe(false);
    expect(grantGroupExpanded("NSW", "NSW")).toBe(true);
    expect(grantGroupExpanded("VIC", "NSW")).toBe(false);
  });
});
