// G34 F02/S3 — commitFinalReport: the one path every finished report takes
// into `report_revisions`. Pins: it never throws; skip reasons (no db / no
// project / invalid document); SV2 methodMeta stamped idempotently before the
// hash; committed / failed outcomes; and the snapshot-less revision write
// (paid order, first analysis) against the real `insertImmutableReportRevision`
// — project-scoped dedupe lookup, null snapshot/account, sorted-key hash,
// read-back.

import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { commitFinalReport } from "./commit-final-report";
import { demoReportV2 } from "./fixtures";
import { methodMetaFor, withMethodMeta } from "./method-meta";
import { reportRevisionHash } from "./revision-hash";
import type { ReportV2 } from "./schema";

const DB = {} as SupabaseClient;

function unstamped(): ReportV2 {
  const r = demoReportV2() as ReportV2;
  const { methodMeta: _drop, ...rest } = r;
  return rest as ReportV2;
}

afterEach(() => vi.restoreAllMocks());

describe("commitFinalReport — outcomes", () => {
  it("skips without a database, without a project, or with an invalid document (insert never called)", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const insert = vi.fn();
    expect(await commitFinalReport(null, { source: "paid_order", report: unstamped(), projectId: "p-1" }, { insert })).toEqual({ status: "skipped", reason: "no_db" });
    expect(await commitFinalReport(DB, { source: "first_analysis", report: unstamped(), projectId: null }, { insert })).toEqual({ status: "skipped", reason: "no_project" });
    expect(await commitFinalReport(DB, { source: "first_analysis", report: unstamped(), projectId: "  " }, { insert })).toEqual({ status: "skipped", reason: "no_project" });
    expect(await commitFinalReport(DB, { source: "paid_order", report: { schemaVersion: "2.0" } as unknown as ReportV2, projectId: "p-1" }, { insert })).toEqual({ status: "skipped", reason: "invalid_document" });
    expect(insert).not.toHaveBeenCalled();
  });

  it("stamps SV2 methodMeta before the insert and normalises missing snapshot / account to null", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const insert = vi.fn().mockResolvedValue({ revisionId: "rev-1", shareToken: "t".repeat(32) });
    const report = unstamped();
    const out = await commitFinalReport(DB, { source: "paid_order", report, projectId: "p-1", accountId: "", sviVersion: "2.2.0" }, { insert });
    expect(out).toMatchObject({ status: "committed", revisionId: "rev-1", shareToken: "t".repeat(32) });
    const args = insert.mock.calls[0][1] as { snapshotId: unknown; accountId: unknown; projectId: string; report: ReportV2 };
    expect(args).toMatchObject({ snapshotId: null, accountId: null, projectId: "p-1" });
    expect(args.report.methodMeta).toEqual(methodMetaFor(report, "2.2.0"));
    expect(out.status === "committed" && out.report).toBe(args.report);
  });

  it("keeps an existing stamp untouched, so a snapshot projection and its revision stay identical", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const insert = vi.fn().mockResolvedValue({ revisionId: "rev-2", shareToken: "u".repeat(32) });
    const stamped = withMethodMeta(unstamped(), "2.1.0");
    await commitFinalReport(DB, { source: "stream_pipeline", report: stamped, projectId: "p-1", snapshotId: "snap-1", accountId: "acc-1", sviVersion: "9.9.9" }, { insert });
    const args = insert.mock.calls[0][1] as { snapshotId: unknown; accountId: unknown; report: ReportV2 };
    expect(args.report).toBe(stamped);
    expect(args.report.methodMeta?.svi_method).toBe("svi-2.1.0");
    expect(args).toMatchObject({ snapshotId: "snap-1", accountId: "acc-1" });
  });

  it("reports an unconfirmed write and a throwing writer as failed — never throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await commitFinalReport(DB, { source: "paid_order", report: unstamped(), projectId: "p-1" }, { insert: vi.fn().mockResolvedValue(null) })).toEqual({ status: "failed", reason: "unconfirmed" });
    expect(await commitFinalReport(DB, { source: "paid_order", report: unstamped(), projectId: "p-1" }, { insert: vi.fn().mockRejectedValue(new Error("db down")) })).toEqual({ status: "failed", reason: "threw" });
    expect(await commitFinalReport(DB, { source: "paid_order", report: unstamped(), projectId: "p-1" }, { insert: () => { throw new Error("sync"); } })).toEqual({ status: "failed", reason: "threw" });
    expect(warn).toHaveBeenCalled();
  });
});

// ── The real writer, snapshot-less ──────────────────────────────────────────

interface Call { table: string; op: string; payload?: unknown; filters: Array<[string, string, unknown]> }

function revisionsDb(opts: { existing?: unknown; insertError?: { message: string } | null; echo?: (payload: Record<string, unknown>) => unknown } = {}) {
  const calls: Call[] = [];
  const db = {
    from(table: string) {
      const call: Call = { table, op: "", filters: [] };
      calls.push(call);
      const b: Record<string, unknown> = {};
      Object.assign(b, {
        select() { if (!call.op) call.op = "select"; return b; },
        insert(p: unknown) { call.op = "insert"; call.payload = p; return b; },
        eq(col: string, val: unknown) { call.filters.push(["eq", col, val]); return b; },
        is(col: string, val: unknown) { call.filters.push(["is", col, val]); return b; },
        maybeSingle: async () => ({ data: opts.existing ?? null, error: null }),
        single: async () => {
          if (opts.insertError) return { data: null, error: opts.insertError };
          const p = call.payload as Record<string, unknown>;
          // jsonb reorders keys: echo the document back through a JSON round trip.
          return { data: opts.echo ? opts.echo(p) : { ...JSON.parse(JSON.stringify(p)), revoked_at: null }, error: null };
        },
      });
      return b;
    },
  } as unknown as SupabaseClient;
  return { db, calls };
}

describe("commitFinalReport — snapshot-less revision (paid order / first analysis)", () => {
  it("dedupes within the project, writes null snapshot / account, hashes sorted-key JSON and confirms the read-back", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const { db, calls } = revisionsDb();
    const out = await commitFinalReport(db, { source: "paid_order", report: unstamped(), projectId: "p-1", accountId: null, snapshotId: null, sviVersion: "2.2.0" });
    expect(out.status).toBe("committed");
    const lookup = calls.find((c) => c.op === "select")!;
    expect(lookup.filters).toEqual([["eq", "project_id", "p-1"], ["is", "snapshot_id", null], ["eq", "report_hash", expect.any(String)], ["is", "revoked_at", null]]);
    const insert = calls.find((c) => c.op === "insert")!.payload as Record<string, unknown>;
    expect(insert).toMatchObject({ snapshot_id: null, account_id: null, project_id: "p-1", schema_version: "2.0" });
    expect(insert.report_hash).toBe(reportRevisionHash(insert.report_json));
    expect((insert.report_json as ReportV2).methodMeta?.svi_method).toBe("svi-2.2.0");
  });

  it("a snapshot revision keeps the snapshot-scoped lookup", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const { db, calls } = revisionsDb();
    await commitFinalReport(db, { source: "stream_pipeline", report: unstamped(), projectId: "p-1", accountId: "acc-1", snapshotId: "snap-1" });
    expect(calls.find((c) => c.op === "select")!.filters[0]).toEqual(["eq", "snapshot_id", "snap-1"]);
    expect(calls.find((c) => c.op === "insert")!.payload).toMatchObject({ snapshot_id: "snap-1", account_id: "acc-1" });
  });

  it("an insert error or a mismatched read-back is failed, not committed", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await commitFinalReport(revisionsDb({ insertError: { message: "relation does not exist" } }).db, { source: "paid_order", report: unstamped(), projectId: "p-1" })).status).toBe("failed");
    const tampered = revisionsDb({ echo: (p) => ({ ...p, report_json: { ...(p.report_json as object), reportId: "other" }, revoked_at: null }) });
    expect((await commitFinalReport(tampered.db, { source: "paid_order", report: unstamped(), projectId: "p-1" })).status).toBe("failed");
  });
});
