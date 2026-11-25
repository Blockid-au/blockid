// G36 tick 3 — colocated vitest for run-cancellation.ts: the owner-liveness
// probe (one select per parent; error / throw = unknown ≠ deleted), the
// throttled + shared + sticky RunCancellation, and the re-classification of a
// failure into ReportRunCancelledError only when a parent is really gone.

import { describe, expect, it, vi } from "vitest";
import {
  LIVENESS_MIN_INTERVAL_MS,
  OWNER_DELETED,
  ReportRunCancelledError,
  RunCancellation,
  evaluationBatchItemProbe,
  isReportRunCancelled,
  ownerDeletedCause,
  rowLivenessProbe,
} from "./run-cancellation";

type Answer = { data: unknown; error: unknown } | "throw";

function fakeDb(answers: Record<string, Answer>) {
  const calls: Array<{ table: string; col: string; val: unknown }> = [];
  return {
    calls,
    from(table: string) {
      return {
        select() {
          return {
            eq(col: string, val: unknown) {
              calls.push({ table, col, val });
              return {
                async maybeSingle() {
                  const a = answers[table] ?? { data: { id: val }, error: null };
                  if (a === "throw") throw new Error("boom");
                  return a;
                },
              };
            },
          };
        },
      };
    },
  };
}

describe("rowLivenessProbe", () => {
  it("returns null while every parent row exists (one select per row)", async () => {
    const db = fakeDb({});
    const probe = evaluationBatchItemProbe(db, { itemId: 135, batchId: "b-1", ownerUserId: "u-1", projectId: "p-1" });
    expect(await probe()).toBeNull();
    expect(db.calls.map((c) => `${c.table}:${c.val}`)).toEqual(["evaluation_batch_items:135", "evaluation_batches:b-1", "app_users:u-1", "projects:p-1"]);
  });

  it("names the first parent that is gone", async () => {
    const db = fakeDb({ projects: { data: null, error: null }, app_users: { data: null, error: null } });
    const probe = evaluationBatchItemProbe(db, { itemId: 1, batchId: "b-1", ownerUserId: "u-1", projectId: "p-1" });
    expect(await probe()).toBe("batch owner");
  });

  it("treats a lookup error or a throw as unknown — never as deleted", async () => {
    const db = fakeDb({ projects: { data: null, error: { code: "57014" } }, app_users: "throw" });
    expect(await rowLivenessProbe(db, [{ table: "projects", id: "p" }, { table: "app_users", id: "u" }])()).toBeNull();
    expect(await rowLivenessProbe(null, [{ table: "projects", id: "p" }])()).toBeNull();
  });

  it("skips the project row when the item has no project", async () => {
    const db = fakeDb({});
    await evaluationBatchItemProbe(db, { itemId: 1, batchId: "b", ownerUserId: "u", projectId: null })();
    expect(db.calls.map((c) => c.table)).not.toContain("projects");
  });
});

describe("RunCancellation", () => {
  it("throttles un-forced probes, forces on demand, and shares an in-flight probe", async () => {
    let t = 0;
    const probe = vi.fn(async () => null);
    const c = new RunCancellation(probe, { now: () => t });
    expect(await c.check()).toBe(false);
    expect(await c.check()).toBe(false); // inside the interval → no probe
    expect(probe).toHaveBeenCalledTimes(1);
    t += LIVENESS_MIN_INTERVAL_MS;
    await Promise.all([c.check(), c.check(), c.check()]); // concurrent → one probe
    expect(probe).toHaveBeenCalledTimes(2);
    await c.check(true);
    expect(probe).toHaveBeenCalledTimes(3);
    expect(c.probeCount).toBe(3);
  });

  it("is sticky once a parent is gone and throws ReportRunCancelledError", async () => {
    const probe = vi.fn(async () => "project");
    const c = new RunCancellation(probe);
    expect(c.cancelled).toBe(false);
    expect(() => c.throwIfCancelledSync()).not.toThrow();
    await expect(c.throwIfCancelled(true)).rejects.toBeInstanceOf(ReportRunCancelledError);
    expect(c.cancelled).toBe(true);
    expect(c.missing).toBe("project");
    expect(() => c.throwIfCancelledSync()).toThrow(/owner_deleted: project/);
    await c.check(true);
    expect(probe).toHaveBeenCalledTimes(1); // sticky: no further probes
  });

  it("a probe that throws reads as still alive", async () => {
    const c = new RunCancellation(async () => {
      throw new Error("db down");
    });
    expect(await c.check(true)).toBe(false);
    expect(c.cancelled).toBe(false);
  });
});

describe("ownerDeletedCause", () => {
  it("re-classifies a 23503-style failure only when a parent is really gone", async () => {
    const fk = Object.assign(new Error("report_persistence_unconfirmed"), { code: "23503" });
    const gone = new RunCancellation(async () => "batch");
    const alive = new RunCancellation(async () => null);
    const viaGone = await ownerDeletedCause(fk, gone);
    expect(viaGone).toBeInstanceOf(ReportRunCancelledError);
    expect(viaGone?.code).toBe(OWNER_DELETED);
    expect(viaGone?.missing).toBe("batch");
    expect(await ownerDeletedCause(fk, alive)).toBeNull();
    expect(await ownerDeletedCause(fk, null)).toBeNull();
  });

  it("passes an existing ReportRunCancelledError straight through", async () => {
    const err = new ReportRunCancelledError("project");
    expect(await ownerDeletedCause(err, null)).toBe(err);
    expect(isReportRunCancelled(err)).toBe(true);
    expect(isReportRunCancelled(Object.assign(new Error("x"), { name: "ReportRunCancelledError" }))).toBe(true);
    expect(isReportRunCancelled(new Error("x"))).toBe(false);
  });
});
