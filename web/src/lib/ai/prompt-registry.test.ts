import { beforeEach, describe, expect, it, vi } from "vitest";

// The module reads getSupabaseAdmin() at call time so we mock it BEFORE
// importing the module under test. Each test supplies its own fake
// client via setClient(); a per-test in-memory table lets us assert
// realistic ordering + partial-unique-on-prod semantics.

interface Row {
  id: string;
  agent: string;
  version: string;
  purpose: string;
  model: string;
  variables: unknown;
  output_schema: unknown;
  guardrails: string[];
  test_set_id: string | null;
  evaluation_result: unknown;
  status: "draft" | "shadow" | "canary" | "prod" | "rolled_back";
  released_at: string | null;
  rollback_from: string | null;
  created_at: string;
}

let table: Row[] = [];
let updateError: string | null = null;

function makeRow(overrides: Partial<Row>): Row {
  return {
    id: overrides.id ?? "00000000-0000-4000-8000-000000000001",
    agent: overrides.agent ?? "CEO",
    version: overrides.version ?? "1.0.0",
    purpose: overrides.purpose ?? "self-upgrade",
    model: overrides.model ?? "claude-sonnet-5",
    variables: overrides.variables ?? {},
    output_schema: overrides.output_schema ?? {},
    guardrails: overrides.guardrails ?? [],
    test_set_id: overrides.test_set_id ?? null,
    evaluation_result: overrides.evaluation_result ?? {},
    status: overrides.status ?? "draft",
    released_at: overrides.released_at ?? null,
    rollback_from: overrides.rollback_from ?? null,
    created_at: overrides.created_at ?? new Date().toISOString(),
  };
}

// Minimal Supabase query-builder mimic covering just the shapes the
// module under test uses: .select().eq().eq().maybeSingle() and
// .update().eq().eq()
function fakeClient() {
  return {
    from(tableName: string) {
      if (tableName !== "prompt_versions") throw new Error("unknown table " + tableName);
      return builder();
    },
  };
}

interface Filter {
  col: string;
  val: unknown;
}

function builder() {
  const filters: Filter[] = [];
  let mode: "select" | "update" = "select";
  let updatePatch: Partial<Row> = {};

  const api: {
    select(_: string): typeof api;
    update(patch: Partial<Row>): typeof api;
    eq(col: string, val: unknown): typeof api;
    maybeSingle(): Promise<{ data: Row | null; error: { message: string } | null }>;
    then?: unknown;
  } = {
    select() {
      mode = "select";
      return api;
    },
    update(patch: Partial<Row>) {
      mode = "update";
      updatePatch = patch;
      return api;
    },
    eq(col: string, val: unknown) {
      filters.push({ col, val });
      return api;
    },
    async maybeSingle() {
      const match = table.find(r =>
        filters.every(f => (r as unknown as Record<string, unknown>)[f.col] === f.val),
      );
      return { data: match ?? null, error: null };
    },
  };

  // Support `await queryBuilder` (no maybeSingle) for the update chain
  // — Supabase resolves to { data, error } on await.
  (api as unknown as { then: (resolve: (v: unknown) => void) => void }).then = (
    resolve,
  ) => {
    if (mode === "update") {
      if (updateError) {
        resolve({ data: null, error: { message: updateError } });
        return;
      }
      const matches = table.filter(r =>
        filters.every(f => (r as unknown as Record<string, unknown>)[f.col] === f.val),
      );
      for (const r of matches) {
        Object.assign(r, updatePatch);
      }
      // Enforce the partial unique index in the fake: at most one prod
      // per agent. If we just violated it, error to mirror production.
      for (const r of matches) {
        const dupes = table.filter(x => x.agent === r.agent && x.status === "prod");
        if (dupes.length > 1) {
          resolve({
            data: null,
            error: { message: "duplicate key value violates unique constraint" },
          });
          return;
        }
      }
      resolve({ data: matches, error: null });
      return;
    }
    resolve({ data: null, error: null });
  };

  return api;
}

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => fakeClient(),
}));

import {
  promoteCanaryToProd,
  readCurrentPrompt,
} from "./prompt-registry";

beforeEach(() => {
  table = [];
  updateError = null;
});

describe("readCurrentPrompt", () => {
  it("returns the prod row when one exists", async () => {
    table = [
      makeRow({ id: "aaaaaaaa-0000-4000-8000-000000000001", status: "prod" }),
      makeRow({ id: "aaaaaaaa-0000-4000-8000-000000000002", status: "draft" }),
    ];
    const row = await readCurrentPrompt("CEO");
    expect(row?.id).toBe("aaaaaaaa-0000-4000-8000-000000000001");
    expect(row?.status).toBe("prod");
  });

  it("returns null when no prod row exists (first-time bootstrap)", async () => {
    table = [
      makeRow({ id: "aaaaaaaa-0000-4000-8000-000000000001", status: "draft" }),
    ];
    const row = await readCurrentPrompt("CEO");
    expect(row).toBeNull();
  });
});

describe("promoteCanaryToProd", () => {
  const OLD = "aaaaaaaa-0000-4000-8000-000000000001";
  const NEW = "bbbbbbbb-0000-4000-8000-000000000002";

  it("swaps prod → rolled_back and canary → prod in the happy path", async () => {
    table = [
      makeRow({ id: OLD, agent: "CEO", status: "prod", version: "1.0.0" }),
      makeRow({ id: NEW, agent: "CEO", status: "canary", version: "1.1.0" }),
    ];

    const res = await promoteCanaryToProd("CEO", NEW, "admin@blockid.au");

    expect(res).toEqual({ ok: true, newProdId: NEW, rolledBackId: OLD });
    const rows = Object.fromEntries(table.map(r => [r.id, r]));
    expect(rows[OLD].status).toBe("rolled_back");
    expect(rows[NEW].status).toBe("prod");
    expect(rows[NEW].rollback_from).toBe(OLD);
    expect(rows[NEW].released_at).toBeTruthy();
  });

  it("bootstraps the first prod row when no prior prod exists", async () => {
    table = [makeRow({ id: NEW, agent: "CFO", status: "canary" })];

    const res = await promoteCanaryToProd("CFO", NEW, "admin@blockid.au");

    expect(res).toEqual({ ok: true, newProdId: NEW, rolledBackId: null });
    const row = table.find(r => r.id === NEW)!;
    expect(row.status).toBe("prod");
    expect(row.rollback_from).toBeNull();
  });

  it("returns no_canary when the target row is not a canary", async () => {
    table = [makeRow({ id: NEW, agent: "CTO", status: "draft" })];

    const res = await promoteCanaryToProd("CTO", NEW, "admin@blockid.au");

    expect(res).toEqual({ ok: false, reason: "no_canary" });
    expect(table.find(r => r.id === NEW)!.status).toBe("draft");
  });

  it("returns no_canary when the target row belongs to a different agent", async () => {
    table = [makeRow({ id: NEW, agent: "CFO", status: "canary" })];

    const res = await promoteCanaryToProd("CTO", NEW, "admin@blockid.au");

    expect(res).toEqual({ ok: false, reason: "no_canary" });
  });

  it("respects the partial unique index — cannot leave two prod rows for one agent", async () => {
    // Simulate a corrupted state (two prod rows) that a race could
    // conceivably produce. The demote-first ordering + our fake's
    // unique-index enforcement should still surface an error rather
    // than silently leaving inconsistent data.
    table = [
      makeRow({ id: OLD, agent: "CEO", status: "prod" }),
      makeRow({ id: "cccccccc-0000-4000-8000-000000000003", agent: "CEO", status: "prod" }),
      makeRow({ id: NEW, agent: "CEO", status: "canary" }),
    ];

    // readCurrentPrompt will find the first prod row but not both;
    // the promote step will violate the unique index. We assert the
    // helper surfaces a db_error rather than a false-positive ok.
    const res = await promoteCanaryToProd("CEO", NEW, "admin@blockid.au");
    // Either the demote of one prod leaves the other prod + a new
    // prod (unique violation), or the second prod row makes the fake
    // reject the update; both must be a caller-visible failure.
    if (res.ok) {
      throw new Error("expected failure, got ok");
    }
    expect(res.reason).toBe("db_error");
  });
});
