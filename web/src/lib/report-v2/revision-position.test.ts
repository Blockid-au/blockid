// G34 BT3 (spec §3) — revision numbering for the old-revision banner:
// creation order over every row (a revoke never renumbers), latest = newest
// non-revoked row, and the latest link only for the project owner.

import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadTrendBaseline, previousRevisionFrom, revisionBannerFor, revisionPositionFrom, type RevisionRowLike } from "./revision-position";
import { demoReportV2 } from "./fixtures";
import { withMethodMeta } from "./method-meta";
import type { ReportV2 } from "./schema";

const row = (id: string, day: number, revoked = false): RevisionRowLike => ({ id, share_token: `tok-${id}`, created_at: `2026-09-${String(day).padStart(2, "0")}T00:00:00Z`, revoked_at: revoked ? "2026-09-26T00:00:00Z" : null });

/** Minimal PostgREST stub: projects.select("user_id").eq("id", …).maybeSingle(). */
function dbWithOwner(ownerId: string): SupabaseClient {
  const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: { user_id: ownerId }, error: null }) };
  return { from: () => chain } as unknown as SupabaseClient;
}

describe("revisionPositionFrom", () => {
  it("numbers rows in creation order whatever the input order; latest = newest row", () => {
    const pos = revisionPositionFrom([row("c", 20), row("a", 1), row("b", 10)], "b", "p1");
    expect(pos).toEqual({ projectId: "p1", current: { n: 2, createdAt: row("b", 10).created_at }, latest: { n: 3, createdAt: row("c", 20).created_at, shareToken: "tok-c" } });
  });

  it("a revoked newest row is skipped for 'latest' but keeps its number", () => {
    const pos = revisionPositionFrom([row("a", 1), row("b", 10), row("c", 20, true)], "a", "p1")!;
    expect(pos.current.n).toBe(1);
    expect(pos.latest).toMatchObject({ n: 2, shareToken: "tok-b" });
  });

  it("unknown current id or every row revoked → null", () => {
    expect(revisionPositionFrom([row("a", 1)], "zz", "p1")).toBeNull();
    expect(revisionPositionFrom([row("a", 1, true)], "a", "p1")).toBeNull();
  });
});

describe("revisionBannerFor", () => {
  const pos = revisionPositionFrom([row("a", 1), row("b", 10)], "a", "p1");

  it("owner gets the latest link; anyone else gets none", async () => {
    expect(await revisionBannerFor(pos, "u1", dbWithOwner("u1"))).toMatchObject({ current: { n: 1 }, latest: { n: 2 }, latestHref: "/tbr/tok-b" });
    expect(await revisionBannerFor(pos, "u1", dbWithOwner("u1"), "/vi/tbr")).toMatchObject({ latestHref: "/vi/tbr/tok-b" });
    expect((await revisionBannerFor(pos, "someone-else", dbWithOwner("u1")))!.latestHref).toBeNull();
    expect((await revisionBannerFor(pos, null, dbWithOwner("u1")))!.latestHref).toBeNull();
  });

  it("no banner when this is the latest revision or no position", async () => {
    expect(await revisionBannerFor(revisionPositionFrom([row("a", 1), row("b", 10)], "b", "p1"), "u1", dbWithOwner("u1"))).toBeNull();
    expect(await revisionBannerFor(null, "u1", dbWithOwner("u1"))).toBeNull();
  });
});

// ── G34 F02/S3: trend baseline ──────────────────────────────────────────────

describe("previousRevisionFrom", () => {
  it("the row just before in creation order, skipping revoked rows; null for the first; undefined when absent", () => {
    expect(previousRevisionFrom([row("c", 20), row("a", 1), row("b", 10)], "c")!.id).toBe("b");
    expect(previousRevisionFrom([row("a", 1), row("b", 10, true), row("c", 20)], "c")!.id).toBe("a");
    expect(previousRevisionFrom([row("a", 1), row("b", 10)], "a")).toBeNull();
    expect(previousRevisionFrom([row("a", 1, true), row("b", 10)], "b")).toBeNull();
    expect(previousRevisionFrom([row("a", 1)], "zz")).toBeUndefined();
  });
});

describe("loadTrendBaseline", () => {
  /** report_revisions stub: token lookup → current row; project list; previous row's document by id. */
  function revisionsDb(opts: { current?: unknown; list?: unknown[]; doc?: unknown; fail?: "current" | "list" | "doc" }) {
    return {
      from: () => {
        const filters: Array<[string, unknown]> = [];
        let cols = "";
        const chain: Record<string, unknown> = {};
        Object.assign(chain, {
          select: (c: string) => { cols = c; return chain; },
          eq: (col: string, val: unknown) => { filters.push([col, val]); return chain; },
          is: () => chain,
          order: () => chain,
          limit: async () => (opts.fail === "list" ? { data: null, error: { message: "x" } } : { data: opts.list ?? [], error: null }),
          maybeSingle: async () => {
            if (cols === "report_json") return opts.fail === "doc" ? { data: null, error: { message: "x" } } : { data: { report_json: opts.doc }, error: null };
            return opts.fail === "current" ? { data: null, error: { message: "x" } } : { data: opts.current ?? null, error: null };
          },
        });
        return chain;
      },
    } as unknown as SupabaseClient;
  }
  const doc = () => withMethodMeta(demoReportV2() as ReportV2, "2.2.0");

  it("returns the previous revision's compact baseline (scores + method)", async () => {
    const db = revisionsDb({ current: { id: "b", project_id: "p1" }, list: [row("a", 1), row("b", 10)], doc: doc() });
    const base = await loadTrendBaseline("tok-b", db);
    expect(base).toMatchObject({ revisionId: "a", createdAt: row("a", 1).created_at, method: { svi_method: "svi-2.2.0" } });
    expect(Object.keys(base!.scores)).toHaveLength(8);
  });

  it("null for the project's first revision", async () => {
    expect(await loadTrendBaseline("tok-a", revisionsDb({ current: { id: "a", project_id: "p1" }, list: [row("a", 1)] }))).toBeNull();
  });

  it("undefined (no trend) for a legacy token, a read error, or an unreadable previous document", async () => {
    expect(await loadTrendBaseline("legacy", revisionsDb({ current: null }))).toBeUndefined();
    expect(await loadTrendBaseline("t", revisionsDb({ fail: "current" }))).toBeUndefined();
    expect(await loadTrendBaseline("t", revisionsDb({ current: { id: "b", project_id: "p1" }, fail: "list" }))).toBeUndefined();
    expect(await loadTrendBaseline("t", revisionsDb({ current: { id: "b", project_id: "p1" }, list: [row("a", 1), row("b", 10)], doc: { schemaVersion: "2.0" } }))).toBeUndefined();
    expect(await loadTrendBaseline("t", revisionsDb({ current: { id: "b", project_id: "p1" }, list: [row("a", 1), row("b", 10)], fail: "doc" }))).toBeUndefined();
    expect(await loadTrendBaseline("t", null)).toBeUndefined();
  });
});
