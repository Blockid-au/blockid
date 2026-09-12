// Colocated vitest for src/lib/ops/schema-migrations.ts (release QA-2 P0).
//
// Pins the /api/status `schema_migrations` word:
//   - ok when every manifest file is in the ledger (deferred files excluded);
//   - pending:<n> counts exactly the files missing from the ledger;
//   - unknown when the manifest or the ledger cannot be read (never a crash);
//   - "unknown" is never cached, "ok"/"pending" are (5 min).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dbState: { rows: Array<{ filename: string }> | null; error: string | null; client: boolean } = {
  rows: [],
  error: null,
  client: true,
};

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () =>
    dbState.client
      ? {
          from: () => ({
            select: () => ({
              limit: async () =>
                dbState.error ? { data: null, error: { message: dbState.error } } : { data: dbState.rows, error: null },
            }),
          }),
        }
      : null,
}));

const fsState: { manifest: string | null } = { manifest: null };
vi.mock("node:fs", () => ({
  promises: {
    readFile: async (p: string) => {
      if (String(p).endsWith("schema-migrations.json") && fsState.manifest !== null) return fsState.manifest;
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    },
  },
}));

import {
  _resetSchemaMigrationsCache,
  classifySchemaMigrations,
  readSchemaMigrationsStatus,
  SCHEMA_MIGRATIONS_TTL_MS,
} from "./schema-migrations";

describe("classifySchemaMigrations (pure)", () => {
  it("ok when every manifest file is in the ledger", () => {
    expect(classifySchemaMigrations({ files: ["0001_a.sql", "0002_b.sql"] }, ["0001_a.sql", "0002_b.sql"])).toBe("ok");
  });
  it("counts files missing from the ledger", () => {
    expect(classifySchemaMigrations({ files: ["0001_a.sql", "0002_b.sql", "0003_c.sql"] }, ["0001_a.sql"])).toBe("pending:2");
  });
  it("excludes deferred files from the pending count", () => {
    expect(
      classifySchemaMigrations({ files: ["0001_a.sql", "20260822_x.sql"], deferred: ["20260822_x.sql"] }, ["0001_a.sql"]),
    ).toBe("ok");
  });
  it("ignores ledger rows for files that no longer exist (orphans are not pending)", () => {
    expect(classifySchemaMigrations({ files: ["0001_a.sql"] }, ["0001_a.sql", "9999_gone.sql"])).toBe("ok");
  });
  it("unknown without a manifest or without a ledger read", () => {
    expect(classifySchemaMigrations(null, ["0001_a.sql"])).toBe("unknown");
    expect(classifySchemaMigrations({ files: ["0001_a.sql"] }, null)).toBe("unknown");
    expect(classifySchemaMigrations({} as { files?: string[] }, [])).toBe("unknown");
  });
});

describe("readSchemaMigrationsStatus (manifest + ledger + cache)", () => {
  beforeEach(() => {
    _resetSchemaMigrationsCache();
    dbState.rows = [{ filename: "0001_a.sql" }, { filename: "0002_b.sql" }];
    dbState.error = null;
    dbState.client = true;
    fsState.manifest = JSON.stringify({ files: ["0001_a.sql", "0002_b.sql", "0003_c.sql"], deferred: [] });
  });
  afterEach(() => {
    _resetSchemaMigrationsCache();
  });

  it("diffs the manifest against live ledger rows", async () => {
    expect(await readSchemaMigrationsStatus("/repo", { force: true })).toBe("pending:1");
  });

  it("unknown when the manifest is absent (release without content/reports/schema-migrations.json)", async () => {
    fsState.manifest = null;
    expect(await readSchemaMigrationsStatus("/repo", { force: true })).toBe("unknown");
  });

  it("unknown when the ledger table is missing / PostgREST errors, and does not throw", async () => {
    dbState.error = 'relation "public.schema_migrations" does not exist';
    expect(await readSchemaMigrationsStatus("/repo", { force: true })).toBe("unknown");
  });

  it("unknown when Supabase is not configured", async () => {
    dbState.client = false;
    expect(await readSchemaMigrationsStatus("/repo", { force: true })).toBe("unknown");
  });

  it("caches ok/pending for the TTL but never caches unknown", async () => {
    const t0 = 1_000_000;
    expect(await readSchemaMigrationsStatus("/repo", { now: t0 })).toBe("pending:1");
    dbState.rows = [{ filename: "0001_a.sql" }, { filename: "0002_b.sql" }, { filename: "0003_c.sql" }];
    // Inside TTL → cached value.
    expect(await readSchemaMigrationsStatus("/repo", { now: t0 + 1000 })).toBe("pending:1");
    // After TTL → re-read.
    expect(await readSchemaMigrationsStatus("/repo", { now: t0 + SCHEMA_MIGRATIONS_TTL_MS + 1 })).toBe("ok");

    _resetSchemaMigrationsCache();
    dbState.error = "boom";
    expect(await readSchemaMigrationsStatus("/repo", { now: t0 })).toBe("unknown");
    dbState.error = null;
    // unknown was not cached → the very next call sees the healthy ledger.
    expect(await readSchemaMigrationsStatus("/repo", { now: t0 + 1 })).toBe("ok");
  });
});
