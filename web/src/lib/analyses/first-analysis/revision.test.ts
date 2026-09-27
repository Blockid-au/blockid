// G34 F02/S3 — the free /analyze report's immutable revision: committed only
// for a signed-in owner whose analysis is linked to a project they own;
// guests / unlinked runs / someone else's project / lookup errors are
// skipped; nothing here ever throws.

import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));

import { demoReportV2 } from "@/lib/report-v2/fixtures";
import { commitFirstAnalysisRevision, resolveAnalysisRevisionSubject } from "./revision";

type Answer = { data: unknown; error: { message: string } | null } | "throw";

/** Per-table canned answers for `.select(...).eq(...)....maybeSingle()`. */
function db(answers: Record<string, Answer>): { db: SupabaseClient; tables: string[] } {
  const tables: string[] = [];
  return {
    tables,
    db: {
      from(table: string) {
        tables.push(table);
        const chain: Record<string, unknown> = {};
        Object.assign(chain, {
          select: () => chain,
          eq: () => chain,
          order: () => chain,
          limit: () => chain,
          maybeSingle: async () => {
            const a = answers[table] ?? { data: null, error: null };
            if (a === "throw") throw new Error("boom");
            return a;
          },
        });
        return chain;
      },
    } as unknown as SupabaseClient,
  };
}

const ROW = { id: "an-1", user_id: "u-1" };
const OWNED = { analyses: { data: { project_id: "p-1" }, error: null }, projects: { data: { user_id: "u-1" }, error: null }, svi_accounts: { data: { id: "acc-1" }, error: null } } as const;

describe("resolveAnalysisRevisionSubject", () => {
  it("a guest run (no user) is skipped without a database read", async () => {
    const d = db({});
    expect(await resolveAnalysisRevisionSubject(d.db, { id: "an-1", user_id: null })).toEqual({ ok: false, reason: "guest" });
    expect(d.tables).toEqual([]);
  });

  it("a signed-in run not linked to a project is skipped", async () => {
    expect(await resolveAnalysisRevisionSubject(db({ analyses: { data: { project_id: null }, error: null } }).db, ROW)).toEqual({ ok: false, reason: "no_project" });
  });

  it("a project owned by someone else is never attached", async () => {
    expect(await resolveAnalysisRevisionSubject(db({ ...OWNED, projects: { data: { user_id: "u-2" }, error: null } }).db, ROW)).toEqual({ ok: false, reason: "project_not_owned" });
  });

  it("a lookup error (e.g. 0462 column missing) or a throw is subject_lookup_failed", async () => {
    expect(await resolveAnalysisRevisionSubject(db({ analyses: { data: null, error: { message: "column analyses.project_id does not exist" } } }).db, ROW)).toEqual({ ok: false, reason: "subject_lookup_failed" });
    expect(await resolveAnalysisRevisionSubject(db({ ...OWNED, projects: "throw" }).db, ROW)).toEqual({ ok: false, reason: "subject_lookup_failed" });
  });

  it("owned project → subject with the project's svi account (optional)", async () => {
    expect(await resolveAnalysisRevisionSubject(db(OWNED).db, ROW)).toEqual({ ok: true, projectId: "p-1", accountId: "acc-1" });
    expect(await resolveAnalysisRevisionSubject(db({ ...OWNED, svi_accounts: "throw" }).db, ROW)).toEqual({ ok: true, projectId: "p-1", accountId: null });
  });
});

describe("commitFirstAnalysisRevision", () => {
  it("commits the envelope's document, snapshot-less, keyed on the owned project with the baseline SVI version", async () => {
    const commit = vi.fn().mockResolvedValue({ status: "committed", revisionId: "r", shareToken: "t", report: demoReportV2() });
    const report = demoReportV2();
    const out = await commitFirstAnalysisRevision(ROW, { report }, "2.2.0", { db: () => db(OWNED).db, commit });
    expect(out.status).toBe("committed");
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit.mock.calls[0][1]).toEqual({ source: "first_analysis", report, projectId: "p-1", accountId: "acc-1", snapshotId: null, sviVersion: "2.2.0" });
  });

  it("skips a guest / no database / no document without calling commit", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const commit = vi.fn();
    expect(await commitFirstAnalysisRevision({ id: "an-1", user_id: null }, { report: demoReportV2() }, "2.2.0", { db: () => db({}).db, commit })).toEqual({ status: "skipped", reason: "guest" });
    expect(await commitFirstAnalysisRevision(ROW, { report: demoReportV2() }, "2.2.0", { db: () => null, commit })).toEqual({ status: "skipped", reason: "no_db" });
    expect(await commitFirstAnalysisRevision(ROW, { report: null }, "2.2.0", { db: () => db(OWNED).db, commit })).toEqual({ status: "skipped", reason: "invalid_document" });
    expect(commit).not.toHaveBeenCalled();
  });

  it("a throwing commit or db factory is reported as failed, never thrown", async () => {
    expect(await commitFirstAnalysisRevision(ROW, { report: demoReportV2() }, "2.2.0", { db: () => db(OWNED).db, commit: vi.fn().mockRejectedValue(new Error("x")) })).toEqual({ status: "failed", reason: "threw" });
    expect(await commitFirstAnalysisRevision(ROW, { report: demoReportV2() }, "2.2.0", { db: () => { throw new Error("env"); } })).toEqual({ status: "failed", reason: "threw" });
  });
});
