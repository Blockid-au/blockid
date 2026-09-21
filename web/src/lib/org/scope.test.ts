// G22-B — the organisation artefact scope over a fake DB, with and without
// the 0433 `org_id` column: org_id = org ∪ owner-owned rows with no org_id;
// a seat's rows for another org and the owner's rows for another org are
// out; before 0433 (42703) the scope is owner-only and `legacy` is set.
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { loadOrgScope } from "./scope";

type Row = Record<string, unknown>;

/** select("id") + eq / is / limit; a filter on a column in `missing` answers 42703 like PostgREST. */
function fakeDb(tables: Record<string, Row[]>, missing: string[] = []) {
  return {
    from: (table: string) => {
      const filters: Array<(r: Row) => boolean> = [];
      let err: { code: string; message: string } | null = null;
      const q = {
        select: () => q,
        eq: (col: string, v: unknown) => {
          if (missing.includes(`${table}.${col}`)) err = { code: "42703", message: `column ${table}.${col} does not exist` };
          filters.push((r) => r[col] === v);
          return q;
        },
        is: (col: string, v: unknown) => {
          if (missing.includes(`${table}.${col}`)) err = { code: "42703", message: `column ${table}.${col} does not exist` };
          filters.push((r) => (v === null ? r[col] == null : r[col] === v));
          return q;
        },
        in: (col: string, vals: unknown[]) => {
          filters.push((r) => vals.includes(r[col]));
          return q;
        },
        // G24-C: the demo read ends on `.eq("is_demo", true)` and is awaited directly.
        then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => q.limit().then(ok, ko),
        limit: async () => (err ? { data: null, error: err } : { data: (tables[table] ?? []).filter((r) => filters.every((f) => f(r))), error: null }),
        maybeSingle: async () => ({ data: (tables[table] ?? []).filter((r) => filters.every((f) => f(r)))[0] ?? null, error: null }),
      };
      return q;
    },
  };
}

function seed(): Record<string, Row[]> {
  return {
    investor_organisations: [{ id: "org-1", owner_user_id: "owner-1" }],
    evaluation_batches: [
      { id: "b-org", user_id: "owner-1", org_id: "org-1" }, // stamped
      { id: "b-seat-org", user_id: "seat-1", org_id: "org-1" }, // a seat acting for org-1 → in
      { id: "b-owner-legacy", user_id: "owner-1", org_id: null }, // pre-0433 owner row → in
      { id: "b-owner-other", user_id: "owner-1", org_id: "org-9" }, // the owner's cohort for another org → out
      { id: "b-seat-other", user_id: "seat-1", org_id: null }, // a seat's own (personal / unknown) cohort → out
      { id: "b-other", user_id: "someone-else", org_id: "org-9" },
    ],
    program_intakes: [
      { id: "i-org", owner_user_id: "owner-1", org_id: "org-1" },
      { id: "i-owner-legacy", owner_user_id: "owner-1", org_id: null },
      { id: "i-seat", owner_user_id: "seat-1", org_id: null },
      { id: "i-seat-org", owner_user_id: "seat-1", org_id: "org-1" },
    ],
  };
}

describe("loadOrgScope — G24-C demo exclusion", () => {
  it("a demo cohort (is_demo = true) is out of the org scope — neither exported nor retained — even when it carries the org id", async () => {
    const tables = seed();
    tables.evaluation_batches.push({ id: "b-demo", user_id: "owner-1", org_id: "org-1", is_demo: true });
    const scope = await loadOrgScope(fakeDb(tables) as never, "org-1");
    expect(scope.batchIds).not.toContain("b-demo");
    expect([...scope.batchIds].sort()).toEqual(["b-org", "b-owner-legacy", "b-seat-org"]);
  });

  it("before 0436 (42703 on is_demo) the scope is unchanged — fail-soft, nothing dropped", async () => {
    const tables = seed();
    tables.evaluation_batches.push({ id: "b-demo", user_id: "owner-1", org_id: "org-1", is_demo: true });
    const scope = await loadOrgScope(fakeDb(tables, ["evaluation_batches.is_demo"]) as never, "org-1");
    expect(scope.batchIds).toContain("b-demo");
  });
});

describe("loadOrgScope", () => {
  it("with 0433: org_id rows ∪ the owner's rows without an org id; the owner's other-org rows and a seat's own rows are out", async () => {
    const scope = await loadOrgScope(fakeDb(seed()) as never, "org-1");
    expect(scope.ownerUserId).toBe("owner-1");
    expect(scope.legacy).toBe(false);
    expect([...scope.batchIds].sort()).toEqual(["b-org", "b-owner-legacy", "b-seat-org"]);
    expect([...scope.intakeIds].sort()).toEqual(["i-org", "i-owner-legacy", "i-seat-org"]);
  });

  it("before 0433 (42703 on evaluation_batches.org_id): owner-only, legacy flagged; intakes (0405 column) still honour org_id", async () => {
    const scope = await loadOrgScope(fakeDb(seed(), ["evaluation_batches.org_id"]) as never, "org-1");
    expect(scope.legacy).toBe(true);
    expect([...scope.batchIds].sort()).toEqual(["b-org", "b-owner-legacy", "b-owner-other"]); // every owner-owned batch (no org id to tell them apart)
    expect([...scope.intakeIds].sort()).toEqual(["i-org", "i-owner-legacy", "i-seat-org"]);
  });

  it("a caller-supplied owner skips the org read; null owner → org_id rows only; unknown org → empty", async () => {
    const tables = seed();
    tables.investor_organisations = [];
    const given = await loadOrgScope(fakeDb(tables) as never, "org-1", "owner-1");
    expect(given.ownerUserId).toBe("owner-1");
    expect(given.batchIds).toContain("b-owner-legacy");
    const noOwner = await loadOrgScope(fakeDb(tables) as never, "org-1", null);
    expect(noOwner.ownerUserId).toBeNull();
    expect([...noOwner.batchIds].sort()).toEqual(["b-org", "b-seat-org"]);
    const unknown = await loadOrgScope(fakeDb(seed()) as never, "org-nope");
    expect(unknown).toMatchObject({ ownerUserId: null, batchIds: [], intakeIds: [] });
    expect(await loadOrgScope(fakeDb(seed()) as never, "")).toMatchObject({ batchIds: [], intakeIds: [] });
  });

  it("a throwing client is fail-soft (empty sets, no throw)", async () => {
    const db = { from: () => { throw new Error("boom"); } };
    expect(await loadOrgScope(db as never, "org-1")).toEqual({ ownerUserId: null, batchIds: [], intakeIds: [], legacy: false });
  });
});
