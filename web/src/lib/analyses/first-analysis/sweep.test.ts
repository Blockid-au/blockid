// Colocated suite for the cron sweep (S32-B). Pins: dry run lists and
// touches nothing; emails go before re-runs; a thrown deliver / run is
// recorded, never fatal; a sweep error flips ok:false.

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./job", () => ({
  deliverFullReport: vi.fn(),
  makeAgentCaller: vi.fn(),
  defaultDeps: vi.fn(),
  runFirstAnalysisJob: vi.fn(),
}));
vi.mock("./store", () => ({ sweepPendingFullReports: vi.fn() }));

import { isNeverStarted, sweepFirstAnalysisReports, type SweepDeps } from "./sweep";
import type { FullReportRow } from "./store";

const r = (id: string, extra: Partial<FullReportRow> = {}) => ({ id, full_report_status: "failed", full_report_attempts: 1, full_report_email: "a@b.c", user_id: null, ...extra }) as FullReportRow;

function deps(): SweepDeps & { sweep: ReturnType<typeof vi.fn>; run: ReturnType<typeof vi.fn>; deliver: ReturnType<typeof vi.fn> } {
  return {
    sweep: vi.fn().mockResolvedValue({ runnable: [r("run-1"), r("run-2")], emailable: [r("mail-1", { full_report_status: "done" })] }) as SweepDeps["sweep"] & ReturnType<typeof vi.fn>,
    run: vi.fn().mockResolvedValue({ outcome: "done" }),
    deliver: vi.fn().mockResolvedValue("sent"),
  };
}

describe("sweepFirstAnalysisReports", () => {
  it("dry run lists candidates and touches nothing", async () => {
    const d = deps();
    const out = await sweepFirstAnalysisReports({ dryRun: true }, d);
    expect(out.ok).toBe(true);
    expect(out.dryRun).toBe(true);
    expect(out.runnable.map((x) => x.id)).toEqual(["run-1", "run-2"]);
    expect(out.emailable).toEqual([{ id: "mail-1", hasEmail: true, hasUser: false }]);
    expect(d.run).not.toHaveBeenCalled();
    expect(d.deliver).not.toHaveBeenCalled();
  });

  it("emails first, then re-runs, and records a thrown step instead of dying", async () => {
    const d = deps();
    const order: string[] = [];
    d.deliver.mockImplementation(async (row: FullReportRow) => {
      order.push(`mail:${row.id}`);
      return "sent";
    });
    d.run.mockImplementation(async (row: FullReportRow) => {
      order.push(`run:${row.id}`);
      if (row.id === "run-2") throw new Error("boom");
      return { outcome: "done" };
    });
    const out = await sweepFirstAnalysisReports({}, d);
    expect(order).toEqual(["mail:mail-1", "run:run-1", "run:run-2"]);
    expect(out.emailed).toEqual([{ id: "mail-1", outcome: "sent" }]);
    expect(out.ran).toEqual([{ id: "run-1", outcome: "done" }, { id: "run-2", outcome: "failed" }]);
    expect(out.ok).toBe(true);
  });

  it("S32-E: a done_partial row is emailed (part 1) and re-run (backfill) like any other candidate", async () => {
    const d = deps();
    d.sweep.mockResolvedValue({
      runnable: [r("partial-1", { full_report_status: "done_partial", full_report_attempts: 2, full_report_finished_at: "2026-09-15T00:05:00Z" })],
      emailable: [r("partial-1", { full_report_status: "done_partial", full_report_attempts: 2 })],
    });
    d.run.mockResolvedValue({ outcome: "done" });
    const out = await sweepFirstAnalysisReports({}, d);
    expect(out.emailed).toEqual([{ id: "partial-1", outcome: "sent" }]);
    expect(out.ran).toEqual([{ id: "partial-1", outcome: "done" }]);
    expect(out.runnable[0]).toEqual({ id: "partial-1", status: "done_partial", attempts: 2 });
  });

  it("reports a sweep failure as ok:false", async () => {
    const d = deps();
    (d.sweep as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("supabase down"));
    const out = await sweepFirstAnalysisReports({}, d);
    expect(out).toMatchObject({ ok: false, error: "supabase down" });
  });
});

// G25-C — the daily platform cap: never-started rows wait while the cap is
// reached; in-flight / failed / partial rows and every e-mail keep going.
describe("sweepFirstAnalysisReports — FREE_REPORTS_DAILY_CAP (G25-C)", () => {
  const never = (id: string) => r(id, { full_report_status: "queued", full_report_attempts: 0 });

  it("isNeverStarted = queued with zero attempts", () => {
    expect(isNeverStarted({ full_report_status: "queued", full_report_attempts: 0 })).toBe(true);
    expect(isNeverStarted({ full_report_status: "queued", full_report_attempts: null })).toBe(true);
    expect(isNeverStarted({ full_report_status: "queued", full_report_attempts: 1 })).toBe(false);
    expect(isNeverStarted({ full_report_status: "failed", full_report_attempts: 0 })).toBe(false);
  });

  it("cap reached → never-started rows are held (listed in heldForCap), failed rows and e-mails still go", async () => {
    const d = { ...deps(), capReached: vi.fn().mockResolvedValue(true) };
    (d.sweep as ReturnType<typeof vi.fn>).mockResolvedValue({ runnable: [never("new-1"), r("retry-1")], emailable: [r("mail-1", { full_report_status: "done" })] });
    const out = await sweepFirstAnalysisReports({}, d);
    expect(out.heldForCap).toEqual(["new-1"]);
    expect(out.runnable.map((x) => x.id)).toEqual(["retry-1"]);
    expect(out.ran).toEqual([{ id: "retry-1", outcome: "done" }]);
    expect(out.emailed).toEqual([{ id: "mail-1", outcome: "sent" }]);
    expect(d.run).toHaveBeenCalledTimes(1);
  });

  it("cap not reached → everything runs; the cap is only read when a never-started row is waiting", async () => {
    const d = { ...deps(), capReached: vi.fn().mockResolvedValue(false) };
    (d.sweep as ReturnType<typeof vi.fn>).mockResolvedValue({ runnable: [never("new-1")], emailable: [] });
    let out = await sweepFirstAnalysisReports({}, d);
    expect(out.heldForCap).toEqual([]);
    expect(out.ran).toEqual([{ id: "new-1", outcome: "done" }]);
    expect(d.capReached).toHaveBeenCalledTimes(1);
    d.capReached.mockClear();
    (d.sweep as ReturnType<typeof vi.fn>).mockResolvedValue({ runnable: [r("retry-1")], emailable: [] });
    out = await sweepFirstAnalysisReports({}, d);
    expect(d.capReached).not.toHaveBeenCalled();
    expect(out.ran).toEqual([{ id: "retry-1", outcome: "done" }]);
  });

  it("a cap read that throws never holds anything (fail open); no capReached dep → nothing held", async () => {
    const d = { ...deps(), capReached: vi.fn().mockRejectedValue(new Error("db")) };
    (d.sweep as ReturnType<typeof vi.fn>).mockResolvedValue({ runnable: [never("new-1")], emailable: [] });
    expect((await sweepFirstAnalysisReports({}, d)).ran).toEqual([{ id: "new-1", outcome: "done" }]);
    const plain = deps();
    (plain.sweep as ReturnType<typeof vi.fn>).mockResolvedValue({ runnable: [never("new-2")], emailable: [] });
    expect((await sweepFirstAnalysisReports({}, plain)).heldForCap).toEqual([]);
  });
});
