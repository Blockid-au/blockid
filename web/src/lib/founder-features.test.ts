// S18-B — founder-feature readers are keyed on the project OWNER's id
// (`FounderFeatureScope`), never on the caller, so a shared-project member
// reads the same rows `/api/founder/*` (founder-crud) writes.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";

const sbState = vi.hoisted(() => ({ sb: null as unknown }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => sbState.sb }));
vi.mock("@/lib/projects", () => ({ getProjectIdFromRequest: async () => "proj-cookie" }));

import {
  founderFeatureScope,
  getGtmStrategy,
  listCompetitors,
  listPricingTiers,
  listRoadmapMilestones,
  listTeamMembers,
  getActiveProjectIdOrNull,
  currentQuarterKey,
  nextQuarters,
} from "./founder-features";

const OWNER = "user-owner";
const MEMBER = "user-member";
const PROJECT = "proj-1";

const ownerScope = { ownerUserId: OWNER, projectId: PROJECT };
// A member's ProjectScope carries the OWNER's id — same key as the owner.
const memberScope = { ownerUserId: OWNER, projectId: PROJECT, userId: MEMBER };

let sb: FakeSupabase;
beforeEach(() => {
  sb = fakeSupabase({
    gtm_strategies: [{ id: "g1", user_id: OWNER, project_id: PROJECT }],
    competitors: [{ id: "c1", user_id: OWNER, project_id: PROJECT, name: "Rival" }],
    team_members: [{ id: "t1", user_id: OWNER, project_id: PROJECT, role_title: "CTO" }],
    pricing_tiers: [{ id: "p1", user_id: OWNER, project_id: PROJECT, name: "Pro" }],
    roadmap_milestones: [{ id: "m1", user_id: OWNER, project_id: PROJECT, quarter: "2026-Q4" }],
  });
  sbState.sb = sb;
});

const READERS: Array<{ name: string; table: string; run: (s: { ownerUserId: string; projectId: string | null }) => Promise<unknown> }> = [
  { name: "getGtmStrategy", table: "gtm_strategies", run: getGtmStrategy },
  { name: "listCompetitors", table: "competitors", run: listCompetitors },
  { name: "listTeamMembers", table: "team_members", run: listTeamMembers },
  { name: "listPricingTiers", table: "pricing_tiers", run: listPricingTiers },
  { name: "listRoadmapMilestones", table: "roadmap_milestones", run: listRoadmapMilestones },
];

describe("founder-features — scope-keyed readers (S18-B)", () => {
  for (const r of READERS) {
    describe(r.name, () => {
      it("owner: keys on (owner id, project id)", async () => {
        const out = await r.run(ownerScope);
        expect(out).toBeTruthy();
        expect(sb.hasEq(r.table, "user_id", OWNER)).toBe(true);
        expect(sb.hasEq(r.table, "project_id", PROJECT)).toBe(true);
      });

      it("member: keys on the OWNER's id, never the caller's", async () => {
        const out = await r.run(memberScope);
        expect(out).toBeTruthy();
        expect(sb.hasEq(r.table, "user_id", OWNER)).toBe(true);
        expect(sb.hasEq(r.table, "user_id", MEMBER)).toBe(false);
      });

      it("no project: returns the empty value without querying", async () => {
        const out = await r.run({ ownerUserId: OWNER, projectId: null });
        expect(out).toEqual(r.name === "getGtmStrategy" ? null : []);
        expect(sb.find(r.table, "select")).toEqual([]);
      });

      it("no supabase: returns the empty value", async () => {
        sbState.sb = null;
        const out = await r.run(ownerScope);
        expect(out).toEqual(r.name === "getGtmStrategy" ? null : []);
      });
    });
  }
});

describe("founderFeatureScope()", () => {
  const user = { id: MEMBER };

  it("passes a resolved scope through (owner id + project)", () => {
    expect(founderFeatureScope({ ownerUserId: OWNER, projectId: PROJECT }, user)).toEqual({
      ownerUserId: OWNER,
      projectId: PROJECT,
    });
  });

  it("null scope → the caller's own id with no project (legacy owner path)", () => {
    expect(founderFeatureScope(null, user)).toEqual({ ownerUserId: MEMBER, projectId: null });
    expect(founderFeatureScope(undefined, user)).toEqual({ ownerUserId: MEMBER, projectId: null });
  });
});

describe("legacy + quarter helpers", () => {
  it("getActiveProjectIdOrNull still delegates to getProjectIdFromRequest (competitive-positioning routes)", async () => {
    await expect(getActiveProjectIdOrNull()).resolves.toBe("proj-cookie");
  });

  it("quarter keys are sortable YYYY-Qn", () => {
    expect(currentQuarterKey(new Date("2026-09-12"))).toBe("2026-Q3");
    expect(nextQuarters(3, new Date("2026-11-01"))).toEqual(["2026-Q4", "2027-Q1", "2027-Q2"]);
  });
});
