// Unit tests for GET /api/kb/articles/[slug] — P9-kb-article-route-test.
//
// The route is a public, read-only lookup that resolves a knowledge-base
// article by its URL slug. It has three exit paths — supabase not
// configured (404, article:null), db error (500, error:message), row
// missing (404, article:null) — and one happy path (200, article:row).
// The route was previously untested; a silent regression here (e.g.
// swapping `.eq("slug", slug)` for `.eq("id", slug)` and returning
// arbitrary articles for any user-supplied slug; dropping the
// `isSupabaseConfigured()` guard and NPE'ing when env is stripped in
// dev; dropping `maybeSingle()` for `single()` and 500'ing every
// missing-article lookup instead of returning the {article:null} the
// KB browser UI depends on to render an "article not found" state)
// breaks the /kb browser + every deep-linked article page in prod.

import { beforeEach, describe, expect, it, vi } from "vitest";

const isSupabaseConfiguredMock = vi.fn<() => boolean>();
const getSupabaseAdminMock = vi.fn<() => unknown | null>();

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => isSupabaseConfiguredMock(),
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

import { GET, dynamic } from "./route";

interface FakeState {
  data: Record<string, unknown> | null;
  error: { message: string } | null;
  table: string | null;
  eqCol: string | null;
  eqVal: unknown;
  selectCols: string | null;
  fromCalls: number;
  selectCalls: number;
  eqCalls: number;
  maybeSingleCalls: number;
}

const state: FakeState = {
  data: null,
  error: null,
  table: null,
  eqCol: null,
  eqVal: null,
  selectCols: null,
  fromCalls: 0,
  selectCalls: 0,
  eqCalls: 0,
  maybeSingleCalls: 0,
};

function makeFakeSupabase() {
  return {
    from(table: string) {
      state.fromCalls += 1;
      state.table = table;
      return {
        select(cols: string) {
          state.selectCalls += 1;
          state.selectCols = cols;
          return {
            eq(col: string, val: unknown) {
              state.eqCalls += 1;
              state.eqCol = col;
              state.eqVal = val;
              return {
                maybeSingle: async () => {
                  state.maybeSingleCalls += 1;
                  return { data: state.data, error: state.error };
                },
              };
            },
          };
        },
      };
    },
  };
}

function resetState() {
  state.data = null;
  state.error = null;
  state.table = null;
  state.eqCol = null;
  state.eqVal = null;
  state.selectCols = null;
  state.fromCalls = 0;
  state.selectCalls = 0;
  state.eqCalls = 0;
  state.maybeSingleCalls = 0;
}

function makeParams(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

const req = {} as Request;

beforeEach(() => {
  resetState();
  isSupabaseConfiguredMock.mockReset();
  getSupabaseAdminMock.mockReset();
  isSupabaseConfiguredMock.mockReturnValue(true);
  getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
});

describe("GET /api/kb/articles/[slug] — dynamic export", () => {
  it('exports dynamic = "force-dynamic" so per-request lookups never prerender stale rows', () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

describe("GET /api/kb/articles/[slug] — supabase-not-configured branch", () => {
  it("returns 404 with {article:null} when isSupabaseConfigured() is false", async () => {
    isSupabaseConfiguredMock.mockReturnValue(false);
    const res = await GET(req, makeParams("intro-to-esops"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ article: null });
  });

  it("does NOT touch supabase when env is unconfigured (guard short-circuits before getSupabaseAdmin)", async () => {
    isSupabaseConfiguredMock.mockReturnValue(false);
    await GET(req, makeParams("intro-to-esops"));
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(state.fromCalls).toBe(0);
  });

  it("returns the same {article:null} envelope in unconfigured + missing-row branches so the KB browser can render one 'not found' state", async () => {
    isSupabaseConfiguredMock.mockReturnValue(false);
    const unconfigured = await (await GET(req, makeParams("x"))).json();
    resetState();
    isSupabaseConfiguredMock.mockReturnValue(true);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    state.data = null;
    const missing = await (await GET(req, makeParams("x"))).json();
    expect(unconfigured).toEqual(missing);
    expect(unconfigured).toEqual({ article: null });
  });
});

describe("GET /api/kb/articles/[slug] — happy path", () => {
  it("returns 200 with the article row verbatim on a match", async () => {
    state.data = {
      slug: "intro-to-esops",
      title: "Intro to ESOPs",
      body_md: "# Intro",
      published_at: "2026-01-01T00:00:00Z",
    };
    const res = await GET(req, makeParams("intro-to-esops"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ article: state.data });
  });

  it("queries the kb_articles table (not a rename like kb_article or knowledge_articles)", async () => {
    state.data = { slug: "x" };
    await GET(req, makeParams("x"));
    expect(state.table).toBe("kb_articles");
  });

  it("selects all columns with '*' so a schema-added column surfaces without a route redeploy", async () => {
    state.data = { slug: "x" };
    await GET(req, makeParams("x"));
    expect(state.selectCols).toBe("*");
  });

  it("filters by the slug column (never by id/title/uuid — an id filter would leak arbitrary rows on a numeric slug)", async () => {
    state.data = { slug: "au-esop-guide" };
    await GET(req, makeParams("au-esop-guide"));
    expect(state.eqCol).toBe("slug");
    expect(state.eqVal).toBe("au-esop-guide");
  });

  it("uses maybeSingle so a zero-row result is data:null (no 500 on cache-miss)", async () => {
    state.data = { slug: "x" };
    await GET(req, makeParams("x"));
    expect(state.maybeSingleCalls).toBe(1);
  });

  it("makes exactly one from() + select() + eq() + maybeSingle() call chain (no wasted round-trip)", async () => {
    state.data = { slug: "x" };
    await GET(req, makeParams("x"));
    expect(state.fromCalls).toBe(1);
    expect(state.selectCalls).toBe(1);
    expect(state.eqCalls).toBe(1);
    expect(state.maybeSingleCalls).toBe(1);
  });

  it("forwards a url-encoded-looking slug verbatim (no decode) — Next has already decoded the param", async () => {
    state.data = { slug: "an article-with spaces" };
    await GET(req, makeParams("an article-with spaces"));
    expect(state.eqVal).toBe("an article-with spaces");
  });

  it("passes an empty-string slug through to supabase (route does not add a presence guard — an empty slug will maybeSingle to null and 404)", async () => {
    state.data = null;
    const res = await GET(req, makeParams(""));
    expect(state.eqVal).toBe("");
    expect(res.status).toBe(404);
  });

  it("preserves non-string leaf values in the returned row (booleans, nulls, arrays)", async () => {
    state.data = {
      slug: "x",
      is_published: true,
      tags: ["esop", "au"],
      updated_at: null,
    };
    const body = await (await GET(req, makeParams("x"))).json();
    expect(body.article.is_published).toBe(true);
    expect(body.article.tags).toEqual(["esop", "au"]);
    expect(body.article.updated_at).toBeNull();
  });

  it("does NOT wrap the row — the top-level envelope is exactly {article}", async () => {
    state.data = { slug: "x", title: "Y" };
    const body = await (await GET(req, makeParams("x"))).json();
    expect(Object.keys(body).sort()).toEqual(["article"]);
  });
});

describe("GET /api/kb/articles/[slug] — missing-row branch", () => {
  it("returns 404 with {article:null} when maybeSingle yields null data", async () => {
    state.data = null;
    const res = await GET(req, makeParams("does-not-exist"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ article: null });
  });

  it("still runs the DB query when a row is missing (proves the miss is DB-authoritative, not a routing short-circuit)", async () => {
    state.data = null;
    await GET(req, makeParams("does-not-exist"));
    expect(state.maybeSingleCalls).toBe(1);
    expect(state.eqCol).toBe("slug");
    expect(state.eqVal).toBe("does-not-exist");
  });
});

describe("GET /api/kb/articles/[slug] — db error branch", () => {
  it("returns 500 with {error:message} when supabase surfaces an error", async () => {
    state.error = { message: "boom" };
    const res = await GET(req, makeParams("x"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "boom" });
  });

  it("surfaces the underlying error message verbatim (no wrapping / no leak-safe redaction)", async () => {
    state.error = { message: 'invalid input syntax for type integer: "abc"' };
    const body = await (await GET(req, makeParams("x"))).json();
    expect(body.error).toBe('invalid input syntax for type integer: "abc"');
  });

  it("prefers the error branch over the data branch when both are populated (defensive on driver behaviour)", async () => {
    state.error = { message: "explosion" };
    state.data = { slug: "would-be-returned", title: "leaked" };
    const res = await GET(req, makeParams("x"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "explosion" });
    expect(body.article).toBeUndefined();
  });
});
