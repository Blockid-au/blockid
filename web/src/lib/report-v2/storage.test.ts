// Storage helpers must never throw and must tolerate the 0395 columns not
// existing yet (migrations are applied by hand after deploy).

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { demoReportV2 } from "./fixtures";
import { __resetReportV2StorageWarnings, readAssembledReportJson, readSnapshotReportV2, writeAssembledReportJson, writeSnapshotReportV2 } from "./storage";

function fakeDb(opts: { selectResult?: { data: unknown; error: { message: string } | null }; updateError?: { message: string } | null; updateRow?: { id: string } | null; throwOn?: "select" | "update" }) {
  const calls: Array<{ table: string; op: string; payload?: unknown }> = [];
  const db = {
    from(table: string) {
      return {
        select(cols: string) {
          calls.push({ table, op: `select:${cols}` });
          if (opts.throwOn === "select") throw new Error("boom");
          return {
            eq() {
              return { maybeSingle: async () => opts.selectResult ?? { data: null, error: null } };
            },
          };
        },
        update(payload: unknown) {
          calls.push({ table, op: "update", payload });
          if (opts.throwOn === "update") throw new Error("boom");
          return { eq: (_column: string, id: string) => {
            const result = { error: opts.updateError ?? null };
            return { ...result, then: (resolve: (value: typeof result) => unknown) => Promise.resolve(resolve(result)),
              select: () => ({ maybeSingle: async () => ({ ...result, data: opts.updateRow === undefined ? { id } : opts.updateRow }) }) };
          } };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { db, calls };
}

describe("report-v2 storage", () => {
  beforeEach(() => {
    __resetReportV2StorageWarnings();
    vi.restoreAllMocks();
  });

  it("reads a valid stored report_v2 and rejects garbage", async () => {
    const good = fakeDb({ selectResult: { data: { report_v2: demoReportV2() }, error: null } });
    const r = await readSnapshotReportV2(good.db, "s1");
    expect(r?.cover.svi.total).toBe(74);
    expect(good.calls[0]).toEqual({ table: "svi_snapshots", op: "select:report_v2" });
    const bad = fakeDb({ selectResult: { data: { report_v2: { schemaVersion: "2.0" } }, error: null } });
    expect(await readSnapshotReportV2(bad.db, "s1")).toBeNull();
    const rj = fakeDb({ selectResult: { data: { report_json: demoReportV2() }, error: null } });
    expect((await readAssembledReportJson(rj.db, "r1"))?.reportId).toBe("rv2-demo");
  });

  it("returns null and warns once when the column does not exist yet", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const db = fakeDb({ selectResult: { data: null, error: { message: 'column svi_snapshots.report_v2 does not exist' } } });
    expect(await readSnapshotReportV2(db.db, "s1")).toBeNull();
    expect(await readSnapshotReportV2(db.db, "s2")).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("0395_report_v2_columns.sql");
  });

  it("writes are best-effort: false on missing column, false on throw, true on success", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const missing = fakeDb({ updateError: { message: "Could not find the 'report_v2' column of 'svi_snapshots' in the schema cache" } });
    expect(await writeSnapshotReportV2(missing.db, "s1", demoReportV2())).toBe(false);
    const thrower = fakeDb({ throwOn: "update" });
    expect(await writeAssembledReportJson(thrower.db, "r1", demoReportV2())).toBe(false);
    const ok = fakeDb({});
    expect(await writeSnapshotReportV2(ok.db, "s1", demoReportV2())).toBe(true);
    expect(ok.calls[0].table).toBe("svi_snapshots");
    expect((ok.calls[0].payload as { report_v2: unknown }).report_v2).toBeTruthy();
    const ok2 = fakeDb({});
    expect(await writeAssembledReportJson(ok2.db, "r1", demoReportV2())).toBe(true);
    expect((ok2.calls[0].payload as { report_json: unknown }).report_json).toBeTruthy();
  });

  it("does not claim saved when an update matched no row or another row", async () => {
    for (const updateRow of [null, { id: "other" }]) {
      expect(await writeSnapshotReportV2(fakeDb({ updateRow }).db, "s1", demoReportV2())).toBe(false);
    }
  });

  it("read never throws even when the client throws", async () => {
    const db = fakeDb({ throwOn: "select" });
    expect(await readSnapshotReportV2(db.db, "s1")).toBeNull();
    expect(await readAssembledReportJson(db.db, "r1")).toBeNull();
  });
});
