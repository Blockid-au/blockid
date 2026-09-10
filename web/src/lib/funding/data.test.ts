// Colocated vitest for the server-only funding read helpers (T0239).
// Pins the Supabase chain each helper issues (table, filters, terminator)
// and the degrade-to-empty contract: null admin client, 42P01 (migration
// 0311 not applied) and thrown errors all yield [] / null, never a throw.

import { beforeEach, describe, expect, it, vi } from "vitest";

interface Captured {
  from: string | null;
  eqs: Array<[string, unknown]>;
  ins: Array<[string, unknown[]]>;
  orders: string[];
  limit: number | null;
  maybeSingle: boolean;
}

const state = {
  adminNull: false,
  throwOnFrom: false,
  result: { data: null as unknown, error: null as { code?: string; message: string } | null },
  captured: { from: null, eqs: [], ins: [], orders: [], limit: null, maybeSingle: false } as Captured,
};

function reset() {
  state.adminNull = false;
  state.throwOnFrom = false;
  state.result = { data: null, error: null };
  state.captured = { from: null, eqs: [], ins: [], orders: [], limit: null, maybeSingle: false };
}

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => {
    if (state.adminNull) return null;
    return {
      from(table: string) {
        state.captured.from = table;
        if (state.throwOnFrom) throw new Error("boom");
        const builder = {
          select: () => builder,
          eq: (col: string, val: unknown) => {
            state.captured.eqs.push([col, val]);
            return builder;
          },
          in: (col: string, vals: unknown[]) => {
            state.captured.ins.push([col, vals]);
            return builder;
          },
          order: (col: string) => {
            state.captured.orders.push(col);
            return builder;
          },
          limit: (n: number) => {
            state.captured.limit = n;
            return builder;
          },
          maybeSingle: () => {
            state.captured.maybeSingle = true;
            return Promise.resolve(state.result);
          },
          then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
            Promise.resolve(state.result).then(res, rej),
        };
        return builder;
      },
    };
  },
}));

import { capitalForCity, getGrant, getProgram, listGrants, listPrograms } from "./data";

const GRANT = { id: "rdti", name: "R&DTI", state: "national", status: "open", exclude_from_matching: false };
const PROGRAM = { id: "syd-startmate-accelerator", name: "Startmate", capital: "Sydney", status: "open" };

describe("funding/data", () => {
  beforeEach(() => {
    reset();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("re-exports capitalForCity for page reuse", () => {
    expect(capitalForCity("Geelong", "VIC")).toBe("Melbourne");
  });

  describe("listGrants", () => {
    it("returns [] when the admin client is unavailable", async () => {
      state.adminNull = true;
      expect(await listGrants()).toEqual([]);
      expect(state.captured.from).toBeNull();
    });

    it("queries au_grants, hides non-matching rows by default and orders by name", async () => {
      state.result = { data: [GRANT], error: null };
      const rows = await listGrants();
      expect(rows).toEqual([GRANT]);
      expect(state.captured.from).toBe("au_grants");
      expect(state.captured.eqs).toEqual([["exclude_from_matching", false]]);
      expect(state.captured.orders).toEqual(["name"]);
      expect(state.captured.limit).toBe(500);
    });

    it("includes national rows alongside a state filter and applies status", async () => {
      state.result = { data: [], error: null };
      await listGrants({ state: "NSW", status: "open", excludeNonMatching: false, limit: 20 });
      expect(state.captured.ins).toEqual([["state", ["national", "NSW"]]]);
      expect(state.captured.eqs).toEqual([["status", "open"]]);
      expect(state.captured.limit).toBe(20);
    });

    it("filters to national only when asked", async () => {
      state.result = { data: [], error: null };
      await listGrants({ state: "national" });
      expect(state.captured.ins).toEqual([]);
      expect(state.captured.eqs).toEqual([
        ["state", "national"],
        ["exclude_from_matching", false],
      ]);
    });

    it("degrades to [] on 42P01 without warning, and on other errors with a warning", async () => {
      state.result = { data: null, error: { code: "42P01", message: "relation does not exist" } };
      expect(await listGrants()).toEqual([]);
      expect(console.warn).not.toHaveBeenCalled();

      state.result = { data: null, error: { message: "boom" } };
      expect(await listGrants()).toEqual([]);
      expect(console.warn).toHaveBeenCalledTimes(1);
    });

    it("never throws when the client throws", async () => {
      state.throwOnFrom = true;
      expect(await listGrants()).toEqual([]);
    });
  });

  describe("listPrograms", () => {
    it("queries au_programs by capital + status, ordered capital then name", async () => {
      state.result = { data: [PROGRAM], error: null };
      const rows = await listPrograms({ capital: "Sydney", status: "open" });
      expect(rows).toEqual([PROGRAM]);
      expect(state.captured.from).toBe("au_programs");
      expect(state.captured.eqs).toEqual([
        ["capital", "Sydney"],
        ["status", "open"],
      ]);
      expect(state.captured.orders).toEqual(["capital", "name"]);
    });

    it("returns [] when the admin client is unavailable or the query errors", async () => {
      state.adminNull = true;
      expect(await listPrograms()).toEqual([]);
      reset();
      state.result = { data: null, error: { message: "nope" } };
      expect(await listPrograms()).toEqual([]);
    });
  });

  describe("getGrant / getProgram", () => {
    it("fetch one row by id with maybeSingle", async () => {
      state.result = { data: GRANT, error: null };
      expect(await getGrant("rdti")).toEqual(GRANT);
      expect(state.captured.from).toBe("au_grants");
      expect(state.captured.eqs).toEqual([["id", "rdti"]]);
      expect(state.captured.maybeSingle).toBe(true);

      reset();
      state.result = { data: PROGRAM, error: null };
      expect(await getProgram("syd-startmate-accelerator")).toEqual(PROGRAM);
      expect(state.captured.from).toBe("au_programs");
    });

    it("return null for an empty id, a missing row, or a null client", async () => {
      expect(await getGrant("")).toBeNull();
      state.result = { data: null, error: null };
      expect(await getGrant("nope")).toBeNull();
      state.adminNull = true;
      expect(await getProgram("x")).toBeNull();
    });
  });
});
