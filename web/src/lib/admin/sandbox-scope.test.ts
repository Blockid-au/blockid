import { describe, expect, it } from "vitest";
import {
  applySandboxScopeToQuery,
  buildScopeSearch,
  DEFAULT_SANDBOX_SCOPE,
  isSandboxRow,
  makeScopeHrefBuilder,
  parseScope,
  SANDBOX_SCOPE_PARAM,
  SANDBOX_SCOPE_VALUES,
  type SandboxScope,
  type SandboxScopeQueryLike,
} from "./sandbox-scope";

// ---------------------------------------------------------------------------
// Fake query builder — records .eq() calls so we can assert applySandbox…
// pushes the correct WHERE clause.
// ---------------------------------------------------------------------------

interface EqCall {
  column: string;
  value: unknown;
}

function fakeQuery(): { query: SandboxScopeQueryLike; calls: EqCall[] } {
  const calls: EqCall[] = [];
  const query: SandboxScopeQueryLike = {
    eq(column, value) {
      calls.push({ column, value });
      return query;
    },
  };
  return { query, calls };
}

// ---------------------------------------------------------------------------
// parseScope — enumerates every input flavour we accept in searchParams.
// ---------------------------------------------------------------------------

describe("parseScope", () => {
  const cases: Array<[unknown, SandboxScope]> = [
    [undefined, "all"],
    [null, "all"],
    ["", "all"],
    ["all", "all"],
    ["live", "live"],
    ["sandbox", "sandbox"],
    ["SANDBOX", "sandbox"],
    ["  Live  ", "live"],
    ["nonsense", "all"],
    [{ [SANDBOX_SCOPE_PARAM]: "sandbox" }, "sandbox"],
    [{ [SANDBOX_SCOPE_PARAM]: "live" }, "live"],
    [{ [SANDBOX_SCOPE_PARAM]: undefined }, "all"],
    [{ [SANDBOX_SCOPE_PARAM]: ["sandbox", "live"] }, "sandbox"],
    [{ scope: "invalid" }, "all"],
    [["live"], "live"],
    [[], "all"],
  ];

  for (const [input, expected] of cases) {
    it(`maps ${JSON.stringify(input)} → ${expected}`, () => {
      expect(parseScope(input as never)).toBe(expected);
    });
  }

  it("exports 'all' as the default", () => {
    expect(DEFAULT_SANDBOX_SCOPE).toBe("all");
  });

  it("SANDBOX_SCOPE_VALUES lists exactly the three allowed values in stable order", () => {
    expect(SANDBOX_SCOPE_VALUES).toEqual(["all", "live", "sandbox"]);
  });
});

// ---------------------------------------------------------------------------
// applySandboxScopeToQuery — matrix over (scope × column).
// ---------------------------------------------------------------------------

describe("applySandboxScopeToQuery", () => {
  it("is a noop for scope='all' (default column)", () => {
    const { query, calls } = fakeQuery();
    const returned = applySandboxScopeToQuery(query, "all");
    expect(calls).toEqual([]);
    expect(returned).toBe(query);
  });

  it("is a noop for scope='all' (custom column)", () => {
    const { query, calls } = fakeQuery();
    applySandboxScopeToQuery(query, "all", "is_sandbox");
    expect(calls).toEqual([]);
  });

  it("adds WHERE sandbox = true for scope='sandbox'", () => {
    const { query, calls } = fakeQuery();
    applySandboxScopeToQuery(query, "sandbox");
    expect(calls).toEqual([{ column: "sandbox", value: true }]);
  });

  it("adds WHERE sandbox = false for scope='live'", () => {
    const { query, calls } = fakeQuery();
    applySandboxScopeToQuery(query, "live");
    expect(calls).toEqual([{ column: "sandbox", value: false }]);
  });

  it("honours a custom column name", () => {
    const { query: q1, calls: c1 } = fakeQuery();
    applySandboxScopeToQuery(q1, "sandbox", "is_sandbox");
    expect(c1).toEqual([{ column: "is_sandbox", value: true }]);

    const { query: q2, calls: c2 } = fakeQuery();
    applySandboxScopeToQuery(q2, "live", "is_sandbox");
    expect(c2).toEqual([{ column: "is_sandbox", value: false }]);
  });

  it("returns the same builder instance so chains keep working", () => {
    const { query } = fakeQuery();
    const returned = applySandboxScopeToQuery(query, "sandbox");
    expect(returned).toBe(query);
  });

  // Regression: iteration-9 admin isSandbox fanout added a display-only
  // scope chip to /admin/credits. Migration 0103 lands the
  // credit_transactions.sandbox boolean so the helper's default column
  // name ("sandbox") lines up 1:1 — no per-caller override needed. This
  // case pins that relationship so a future rename of either side breaks
  // the test loudly instead of silently.
  it("filters credit_transactions.sandbox via the default column (0103)", () => {
    const { query: qSandbox, calls: sandboxCalls } = fakeQuery();
    applySandboxScopeToQuery(qSandbox, "sandbox");
    expect(sandboxCalls).toEqual([{ column: "sandbox", value: true }]);

    const { query: qLive, calls: liveCalls } = fakeQuery();
    applySandboxScopeToQuery(qLive, "live");
    expect(liveCalls).toEqual([{ column: "sandbox", value: false }]);

    const { query: qAll, calls: allCalls } = fakeQuery();
    applySandboxScopeToQuery(qAll, "all");
    expect(allCalls).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// buildScopeSearch + makeScopeHrefBuilder — link-building helpers used by
// the SandboxScopeChip component on server pages.
// ---------------------------------------------------------------------------

describe("buildScopeSearch", () => {
  it("drops the scope param when set to 'all'", () => {
    const base = new URLSearchParams("q=foo&scope=sandbox");
    const next = buildScopeSearch(base, "all");
    expect(next.get(SANDBOX_SCOPE_PARAM)).toBeNull();
    expect(next.get("q")).toBe("foo");
  });

  it("sets scope=sandbox and preserves other params", () => {
    const base = new URLSearchParams("q=foo&page=2");
    const next = buildScopeSearch(base, "sandbox");
    expect(next.get(SANDBOX_SCOPE_PARAM)).toBe("sandbox");
    expect(next.get("q")).toBe("foo");
    expect(next.get("page")).toBe("2");
  });

  it("overwrites an existing scope value", () => {
    const base = new URLSearchParams("scope=sandbox&page=1");
    const next = buildScopeSearch(base, "live");
    expect(next.get(SANDBOX_SCOPE_PARAM)).toBe("live");
    expect(next.get("page")).toBe("1");
  });

  it("does not mutate the original params instance", () => {
    const base = new URLSearchParams("scope=live");
    buildScopeSearch(base, "sandbox");
    expect(base.get(SANDBOX_SCOPE_PARAM)).toBe("live");
  });
});

describe("makeScopeHrefBuilder", () => {
  it("emits pathname without ? when the scope collapses to 'all' and no other params exist", () => {
    const build = makeScopeHrefBuilder("/admin/credits", new URLSearchParams());
    expect(build("all")).toBe("/admin/credits");
  });

  it("emits pathname?scope=… for non-default scopes", () => {
    const build = makeScopeHrefBuilder("/admin/credits", new URLSearchParams());
    expect(build("sandbox")).toBe("/admin/credits?scope=sandbox");
    expect(build("live")).toBe("/admin/credits?scope=live");
  });

  it("preserves surrounding params", () => {
    const build = makeScopeHrefBuilder(
      "/admin/users",
      new URLSearchParams("q=foo&filter=admin"),
    );
    expect(build("sandbox")).toBe("/admin/users?q=foo&filter=admin&scope=sandbox");
    expect(build("all")).toBe("/admin/users?q=foo&filter=admin");
  });
});

// ---------------------------------------------------------------------------
// isSandboxRow — row-level badge signal.
// ---------------------------------------------------------------------------

describe("isSandboxRow", () => {
  it("returns true when the flag is exactly true", () => {
    expect(isSandboxRow({ sandbox: true })).toBe(true);
  });

  it("returns false for false / null / undefined / missing rows", () => {
    expect(isSandboxRow({ sandbox: false })).toBe(false);
    expect(isSandboxRow({ sandbox: null })).toBe(false);
    expect(isSandboxRow({})).toBe(false);
    expect(isSandboxRow(null)).toBe(false);
    expect(isSandboxRow(undefined)).toBe(false);
  });

  it("does not coerce truthy non-booleans (defensive against string 'true')", () => {
    expect(isSandboxRow({ sandbox: "true" })).toBe(false);
    expect(isSandboxRow({ sandbox: 1 })).toBe(false);
  });

  it("respects a custom column name", () => {
    expect(isSandboxRow({ is_sandbox: true }, "is_sandbox")).toBe(true);
    expect(isSandboxRow({ sandbox: true }, "is_sandbox")).toBe(false);
  });
});
