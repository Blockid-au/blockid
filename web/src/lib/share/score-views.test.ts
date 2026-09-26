// score_views for both /s/<slug> subjects (0468). Pins: the insert writes the
// column matching the subject, a missing 0468 column never throws (pre-fix
// behaviour: the analysis view is skipped), 23503 stays silent, and the
// engagement tracker finds the row under either column.

import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  __resetScoreViewsWarningForTests,
  countRecentShareViews,
  isMissingSubjectColumn,
  latestShareViewId,
  recordShareView,
  shareViewColumn,
} from "./score-views";

interface Row {
  id: string;
  score_id?: string | null;
  svi_analysis_id?: string | null;
  viewer_ip_hash?: string | null;
  viewed_at: string;
}

const MISSING_COLUMN = { code: "42703", message: "column score_views.svi_analysis_id does not exist" };
const MISSING_COLUMN_INSERT = { code: "PGRST204", message: "Could not find the 'svi_analysis_id' column of 'score_views' in the schema cache" };

/** In-memory score_views; `migrated=false` behaves like the live schema before 0468. */
function fakeDb(opts: { migrated: boolean; scores?: string[]; analyses?: string[]; rows?: Row[] }) {
  const rows: Row[] = [...(opts.rows ?? [])];
  const scores = new Set(opts.scores ?? []);
  const analyses = new Set(opts.analyses ?? []);
  const inserted: Record<string, unknown>[] = [];
  const client = {
    from(table: string) {
      expect(table).toBe("score_views");
      const eqs: Array<[string, unknown]> = [];
      let gte: [string, string] | null = null;
      let mode: "select" | "count" = "select";
      const run = () => {
        if (!opts.migrated && eqs.some(([k]) => k === "svi_analysis_id")) return { data: null, count: null, error: MISSING_COLUMN };
        const hit = rows
          .filter((r) => eqs.every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v))
          .filter((r) => !gte || r.viewed_at >= gte[1])
          .sort((a, b) => (a.viewed_at < b.viewed_at ? 1 : -1));
        return mode === "count" ? { data: null, count: hit.length, error: null } : { data: hit[0] ?? null, count: null, error: null };
      };
      const q = {
        insert: async (row: Record<string, unknown>) => {
          if (!opts.migrated && "svi_analysis_id" in row) return { error: MISSING_COLUMN_INSERT };
          // Live FK + (post-0468) one-subject CHECK.
          if (row.score_id != null && !scores.has(String(row.score_id))) return { error: { code: "23503", message: "fk" } };
          if (row.svi_analysis_id != null && !analyses.has(String(row.svi_analysis_id))) return { error: { code: "23503", message: "fk" } };
          if (opts.migrated && [row.score_id, row.svi_analysis_id].filter((v) => v != null).length !== 1) return { error: { code: "23514", message: "check" } };
          inserted.push(row);
          rows.push({ id: `v${rows.length + 1}`, viewed_at: new Date().toISOString(), ...(row as object) } as Row);
          return { error: null };
        },
        select: (_c: string, o?: { head?: boolean }) => {
          if (o?.head) mode = "count";
          return q;
        },
        eq: (k: string, v: unknown) => {
          eqs.push([k, v]);
          return q;
        },
        gte: (k: string, v: string) => {
          gte = [k, v];
          return q;
        },
        order: () => q,
        limit: () => q,
        maybeSingle: async () => run(),
        then: (resolve: (r: unknown) => unknown) => resolve(run()),
      };
      return q;
    },
  };
  return { client: client as unknown as SupabaseClient, rows, inserted };
}

beforeEach(() => {
  __resetScoreViewsWarningForTests();
  vi.restoreAllMocks();
});

describe("shareViewColumn / isMissingSubjectColumn", () => {
  it("maps the subject kind to its column", () => {
    expect(shareViewColumn("score")).toBe("score_id");
    expect(shareViewColumn("svi_analysis")).toBe("svi_analysis_id");
  });
  it("recognises the pre-0468 errors and nothing else", () => {
    expect(isMissingSubjectColumn(MISSING_COLUMN)).toBe(true);
    expect(isMissingSubjectColumn(MISSING_COLUMN_INSERT)).toBe(true);
    expect(isMissingSubjectColumn({ message: "column \"svi_analysis_id\" does not exist" })).toBe(true);
    expect(isMissingSubjectColumn({ code: "23503", message: "fk" })).toBe(false);
    expect(isMissingSubjectColumn(null)).toBe(false);
  });
});

describe("recordShareView — 0468 applied", () => {
  it("an svi_analyses share writes svi_analysis_id (the old score_id insert hit FK 23503)", async () => {
    const db = fakeDb({ migrated: true, analyses: ["an-1"] });
    const r = await recordShareView(db.client, { slug: "an-1", kind: "svi_analysis", viewerHash: "h1", userAgent: "UA", referer: null });
    expect(r).toEqual({ ok: true, column: "svi_analysis_id" });
    expect(db.inserted[0]).toMatchObject({ svi_analysis_id: "an-1", viewer_ip_hash: "h1", viewer_ua: "UA" });
    expect(db.inserted[0]).not.toHaveProperty("score_id");
  });

  it("a scores share still writes score_id", async () => {
    const db = fakeDb({ migrated: true, scores: ["sc-1"] });
    const r = await recordShareView(db.client, { slug: "sc-1", kind: "score", viewerHash: null });
    expect(r).toEqual({ ok: true, column: "score_id" });
    expect(db.inserted[0]).toMatchObject({ score_id: "sc-1" });
  });

  it("a stale / fake slug (23503) is dropped silently", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = fakeDb({ migrated: true });
    const r = await recordShareView(db.client, { slug: "nope", kind: "score", viewerHash: null });
    expect(r).toEqual({ ok: false, reason: "unknown_subject" });
    expect(err).not.toHaveBeenCalled();
  });

  it("truncates user agent and referer to 512 chars", async () => {
    const db = fakeDb({ migrated: true, scores: ["sc-1"] });
    await recordShareView(db.client, { slug: "sc-1", kind: "score", viewerHash: null, userAgent: "u".repeat(900), referer: "r".repeat(900) });
    expect(String(db.inserted[0].viewer_ua)).toHaveLength(512);
    expect(String(db.inserted[0].referer)).toHaveLength(512);
  });
});

describe("recordShareView — 0468 NOT applied (current live schema)", () => {
  it("an analysis view is skipped without throwing, one structured warning per process", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = fakeDb({ migrated: false, analyses: ["an-1"] });
    const a = await recordShareView(db.client, { slug: "an-1", kind: "svi_analysis", viewerHash: "h1" });
    const b = await recordShareView(db.client, { slug: "an-1", kind: "svi_analysis", viewerHash: "h1" });
    expect(a).toEqual({ ok: false, reason: "migration_pending" });
    expect(b).toEqual({ ok: false, reason: "migration_pending" });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(warn.mock.calls[0][0]))).toMatchObject({ event: "score_views.migration_pending" });
    expect(err).not.toHaveBeenCalled();
    expect(db.rows).toHaveLength(0);
  });

  it("a scores share view is unaffected", async () => {
    const db = fakeDb({ migrated: false, scores: ["sc-1"] });
    expect(await recordShareView(db.client, { slug: "sc-1", kind: "score", viewerHash: "h" })).toEqual({ ok: true, column: "score_id" });
  });

  it("a client that throws is reported, never rethrown", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = { from: () => { throw new Error("boom"); } } as unknown as SupabaseClient;
    expect(await recordShareView(client, { slug: "x", kind: "score", viewerHash: null })).toEqual({ ok: false, reason: "error" });
    expect(err).toHaveBeenCalled();
  });
});

describe("readers", () => {
  const since = "2026-09-01T00:00:00.000Z";
  const rows: Row[] = [
    { id: "a", score_id: "sc-1", viewer_ip_hash: "h1", viewed_at: "2026-09-10T00:00:00Z" },
    { id: "b", svi_analysis_id: "an-1", viewer_ip_hash: "h1", viewed_at: "2026-09-11T00:00:00Z" },
    { id: "c", svi_analysis_id: "an-1", viewer_ip_hash: "h1", viewed_at: "2026-09-12T00:00:00Z" },
  ];

  it("24 h dedupe counts on the subject's own column", async () => {
    const db = fakeDb({ migrated: true, rows });
    expect(await countRecentShareViews(db.client, { slug: "an-1", kind: "svi_analysis", viewerHash: "h1", sinceIso: since })).toBe(2);
    expect(await countRecentShareViews(db.client, { slug: "sc-1", kind: "score", viewerHash: "h1", sinceIso: since })).toBe(1);
    expect(await countRecentShareViews(db.client, { slug: "an-1", kind: "svi_analysis", viewerHash: "h2", sinceIso: since })).toBe(0);
  });

  it("dedupe count is 0 (not a crash) before 0468", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const db = fakeDb({ migrated: false, rows: [rows[0]] });
    expect(await countRecentShareViews(db.client, { slug: "an-1", kind: "svi_analysis", viewerHash: "h1", sinceIso: since })).toBe(0);
  });

  it("the engagement tracker finds the newest row under either column", async () => {
    const db = fakeDb({ migrated: true, rows });
    expect(await latestShareViewId(db.client, "an-1", "h1")).toBe("c");
    expect(await latestShareViewId(db.client, "sc-1", "h1")).toBe("a");
    expect(await latestShareViewId(db.client, "sc-1", "other")).toBeNull();
  });

  it("before 0468 the tracker still finds score rows and returns null for analyses", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = fakeDb({ migrated: false, rows: [rows[0]] });
    expect(await latestShareViewId(db.client, "sc-1", "h1")).toBe("a");
    expect(await latestShareViewId(db.client, "an-1", "h1")).toBeNull();
    expect(err).not.toHaveBeenCalled();
  });
});

describe("call sites + SQL", () => {
  const web = path.resolve(__dirname, "../../..");
  const read = (p: string) => readFileSync(path.join(web, p), "utf8");

  it("/s/[slug] and /api/track/view no longer hard-code score_id for view rows", () => {
    const page = read("src/app/s/[slug]/page.tsx");
    expect(page).toContain("recordShareView(");
    expect(page).toContain('subjectKind: ShareSubjectKind = row ? "svi_analysis" : "score"');
    expect(page).not.toMatch(/from\("score_views"\)/);
    const track = read("src/app/api/track/view/route.ts");
    expect(track).toContain("latestShareViewId(");
    expect(track).not.toMatch(/\.eq\("score_id"/);
  });

  it("0468 is additive: nullable text FK with cascade, score_id NOT NULL relaxed, one-subject CHECK", () => {
    const sql = read("supabase/pending-authority/0468_score_views_any_subject.sql");
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS svi_analysis_id text\s+REFERENCES public\.svi_analyses\(id\) ON DELETE CASCADE/);
    expect(sql).toMatch(/ALTER COLUMN score_id DROP NOT NULL/);
    expect(sql).toMatch(/CHECK \(num_nonnulls\(score_id, svi_analysis_id\) = 1\)/);
    expect(sql).not.toMatch(/\bDROP (TABLE|COLUMN)\b/);
    expect(sql).toMatch(/NOTIFY pgrst, 'reload schema'/);
  });
});
