// Colocated vitest for the first-analysis store's cron sweep (G25-C slice).
//
// Pins the cap hold: never-started FREE rows (queued, attempts 0, with a
// free_report_grants row) are held BEFORE the `limit` slice, so a capped day
// with a queue of deferred free runs never starves failed / stuck / partial
// rows of their retries; an entitled member's never-started row (no grant)
// is never held.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state: { pending: Array<Record<string, unknown>>; partial: Array<Record<string, unknown>>; done: Array<Record<string, unknown>> } = { pending: [], partial: [], done: [] };

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from: () => {
      let which: "pending" | "partial" | "done" = "pending";
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      for (const op of ["select", "lt", "order", "limit", "eq", "is"]) chain[op] = self;
      chain.in = (col: string, vals: string[]) => {
        if (col === "full_report_status" && vals.includes("done")) which = "done";
        return chain;
      };
      const origEq = chain.eq as () => unknown;
      chain.eq = (col: string, val: string) => {
        if (col === "full_report_status" && val === "done_partial") which = "partial";
        return origEq();
      };
      chain.then = (res: (v: unknown) => void) => res({ data: state[which], error: null });
      return chain;
    },
  }),
}));

import { isNeverStarted, sweepPendingFullReports } from "./store";

const row = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  full_report_status: "failed",
  full_report_attempts: 1,
  full_report_started_at: null,
  full_report_finished_at: null,
  full_report_email: "a@b.c",
  user_id: null,
  created_at: "2026-09-21T00:00:00Z",
  ...over,
});
const never = (id: string, over: Record<string, unknown> = {}) => row(id, { full_report_status: "queued", full_report_attempts: 0, ...over });

beforeEach(() => {
  state.pending = [];
  state.partial = [];
  state.done = [];
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("sweepPendingFullReports — the free-cap hold (G25-C)", () => {
  it("holds never-started FREE rows before the limit so retries still get their slot", async () => {
    state.pending = [never("f1"), never("f2"), never("f3"), row("retry-1"), never("member-1", { user_id: "u1" })];
    const grantedIds = vi.fn(async () => new Set(["f1", "f2", "f3"]));
    const out = await sweepPendingFullReports({ limit: 2, holdNeverStartedFree: true, grantedIds });
    expect(out.heldForCap.map((r) => r.id)).toEqual(["f1", "f2", "f3"]);
    expect(out.runnable.map((r) => r.id)).toEqual(["retry-1", "member-1"]);
    expect(grantedIds).toHaveBeenCalledWith(["f1", "f2", "f3", "member-1"]);
  });

  it("no hold requested → the newest `limit` candidates, held list empty; a grant lookup that throws holds nothing", async () => {
    state.pending = [never("f1"), row("retry-1")];
    let out = await sweepPendingFullReports({ limit: 5 });
    expect(out.runnable.map((r) => r.id)).toEqual(["f1", "retry-1"]);
    expect(out.heldForCap).toEqual([]);
    out = await sweepPendingFullReports({ limit: 5, holdNeverStartedFree: true, grantedIds: async () => { throw new Error("db"); } });
    expect(out.runnable.map((r) => r.id)).toEqual(["f1", "retry-1"]);
    expect(out.heldForCap).toEqual([]);
  });

  it("isNeverStarted", () => {
    expect(isNeverStarted({ full_report_status: "queued", full_report_attempts: 0 })).toBe(true);
    expect(isNeverStarted({ full_report_status: "queued", full_report_attempts: 2 })).toBe(false);
    expect(isNeverStarted({ full_report_status: "running", full_report_attempts: 0 })).toBe(false);
  });
});
