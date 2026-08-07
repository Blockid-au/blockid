// Unit tests for GET /api/legal/current-versions — P9-legal-current-versions-route-test.
//
// Route serves the newest active disclaimer_registry row per `kind` for a
// jurisdiction so client-side banners (privacy footer, consent modals,
// disclaimer stubs) can detect a stale pinned version and prompt re-consent.
//
// Silent regressions this pins against:
//   - dropping the JURISDICTION_RE guard and letting a garbage
//     jurisdiction string (SQL wildcard, unicode homoglyph, sentinel
//     other than "GLOBAL") land in the .eq() filter;
//   - dropping the length cap and letting a 100kb query string allocate
//     via toUpperCase() and hit Postgres;
//   - dropping the effective_to filter and returning a row that has
//     already expired — the whole reason the client re-fetches;
//   - dropping the newest-first fold and returning a stale version for a
//     kind that has multiple rows in the window;
//   - flipping the Supabase-unavailable branch to 200 with an empty map,
//     which would trick the client into treating no-data as "no update".

import { beforeEach, describe, expect, it, vi } from "vitest";

const getSupabaseAdminMock = vi.fn<() => unknown | null>();
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

import { GET, dynamic } from "./route";

interface RegistryRow {
  kind: string | null;
  version: string | null;
  hash: string | null;
  effective_from: string | null;
  effective_to: string | null;
  jurisdiction: string | null;
}

interface FakeState {
  data: RegistryRow[] | null;
  error: { message: string } | null;
  table: string | null;
  selectCols: string | null;
  eqCol: string | null;
  eqVal: unknown;
  lteCol: string | null;
  lteVal: unknown;
  orderCol: string | null;
  orderOpts: { ascending?: boolean } | null;
  limitN: number | null;
  fromCalls: number;
}

const state: FakeState = {
  data: [],
  error: null,
  table: null,
  selectCols: null,
  eqCol: null,
  eqVal: null,
  lteCol: null,
  lteVal: null,
  orderCol: null,
  orderOpts: null,
  limitN: null,
  fromCalls: 0,
};

function makeFakeSupabase() {
  return {
    from(table: string) {
      state.fromCalls += 1;
      state.table = table;
      return {
        select(cols: string) {
          state.selectCols = cols;
          return {
            eq(col: string, val: unknown) {
              state.eqCol = col;
              state.eqVal = val;
              return {
                lte(col2: string, val2: unknown) {
                  state.lteCol = col2;
                  state.lteVal = val2;
                  return {
                    order(col3: string, opts?: { ascending?: boolean }) {
                      state.orderCol = col3;
                      state.orderOpts = opts ?? null;
                      return {
                        limit(n: number) {
                          state.limitN = n;
                          return Promise.resolve({
                            data: state.data,
                            error: state.error,
                          });
                        },
                      };
                    },
                  };
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
  state.data = [];
  state.error = null;
  state.table = null;
  state.selectCols = null;
  state.eqCol = null;
  state.eqVal = null;
  state.lteCol = null;
  state.lteVal = null;
  state.orderCol = null;
  state.orderOpts = null;
  state.limitN = null;
  state.fromCalls = 0;
}

function req(url: string): Request {
  return new Request(url);
}

beforeEach(() => {
  resetState();
  getSupabaseAdminMock.mockReset();
  getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
});

describe("route metadata", () => {
  it("declares force-dynamic so cached registry lookups can't serve a stale banner", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

describe("jurisdiction parsing", () => {
  it("defaults to AU when the query param is missing", async () => {
    const res = await GET(req("http://x/api/legal/current-versions"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.jurisdiction).toBe("AU");
    expect(state.eqVal).toBe("AU");
  });

  it("defaults to AU when the query param is present but empty", async () => {
    const res = await GET(
      req("http://x/api/legal/current-versions?jurisdiction="),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.jurisdiction).toBe("AU");
    expect(state.eqVal).toBe("AU");
  });

  it("trims whitespace before validating (so '  AU  ' passes)", async () => {
    const res = await GET(
      req("http://x/api/legal/current-versions?jurisdiction=%20%20AU%20%20"),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.jurisdiction).toBe("AU");
    expect(state.eqVal).toBe("AU");
  });

  it("uppercases valid two-letter jurisdictions before hitting Postgres", async () => {
    const res = await GET(
      req("http://x/api/legal/current-versions?jurisdiction=au"),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.jurisdiction).toBe("AU");
    expect(state.eqVal).toBe("AU");
  });

  it("accepts the GLOBAL sentinel documented on disclaimer_registry", async () => {
    const res = await GET(
      req("http://x/api/legal/current-versions?jurisdiction=global"),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.jurisdiction).toBe("GLOBAL");
    expect(state.eqVal).toBe("GLOBAL");
  });

  it("accepts any ISO 3166-1 alpha-2 code, not just AU", async () => {
    const res = await GET(
      req("http://x/api/legal/current-versions?jurisdiction=us"),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.jurisdiction).toBe("US");
    expect(state.eqVal).toBe("US");
  });

  it("rejects a 1-char jurisdiction with 400 jurisdiction_invalid", async () => {
    const res = await GET(
      req("http://x/api/legal/current-versions?jurisdiction=A"),
    );
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body).toEqual({ ok: false, reason: "jurisdiction_invalid" });
    expect(state.fromCalls).toBe(0);
  });

  it("rejects a 3-char jurisdiction that isn't GLOBAL with 400 jurisdiction_invalid", async () => {
    const res = await GET(
      req("http://x/api/legal/current-versions?jurisdiction=AUS"),
    );
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body).toEqual({ ok: false, reason: "jurisdiction_invalid" });
    expect(state.fromCalls).toBe(0);
  });

  it("rejects a non-ASCII 2-char jurisdiction that survives length-cap but fails the regex", async () => {
    const res = await GET(
      req("http://x/api/legal/current-versions?jurisdiction=A1"),
    );
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.reason).toBe("jurisdiction_invalid");
    expect(state.fromCalls).toBe(0);
  });

  it("rejects a jurisdiction longer than 16 chars BEFORE calling toUpperCase()", async () => {
    const abusive = "A".repeat(17);
    const res = await GET(
      req(
        `http://x/api/legal/current-versions?jurisdiction=${abusive}`,
      ),
    );
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body).toEqual({ ok: false, reason: "jurisdiction_too_long" });
    expect(state.fromCalls).toBe(0);
  });

  it("rejects an extremely long jurisdiction without allocating via Postgres", async () => {
    const abusive = "A".repeat(10_000);
    const res = await GET(
      req(
        `http://x/api/legal/current-versions?jurisdiction=${abusive}`,
      ),
    );
    expect(res.status).toBe(400);
    expect(state.fromCalls).toBe(0);
  });
});

describe("Supabase envelope", () => {
  it("returns 503 when getSupabaseAdmin() is null", async () => {
    getSupabaseAdminMock.mockReturnValueOnce(null);
    const res = await GET(req("http://x/api/legal/current-versions"));
    const body = await res.json();
    expect(res.status).toBe(503);
    expect(body).toEqual({ ok: false, reason: "Supabase unavailable" });
  });

  it("returns 500 when the registry query errors", async () => {
    state.error = { message: "connection reset" };
    const res = await GET(req("http://x/api/legal/current-versions"));
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body).toEqual({ ok: false, reason: "Registry query failed" });
  });

  it("returns {} versions on a clean DB with no rows", async () => {
    state.data = [];
    const res = await GET(req("http://x/api/legal/current-versions"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, jurisdiction: "AU", versions: {} });
  });

  it("returns {} versions when Supabase yields null data + null error", async () => {
    state.data = null;
    state.error = null;
    const res = await GET(req("http://x/api/legal/current-versions"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.versions).toEqual({});
  });
});

describe("query shape", () => {
  it("targets the disclaimer_registry table", async () => {
    await GET(req("http://x/api/legal/current-versions"));
    expect(state.table).toBe("disclaimer_registry");
  });

  it("selects exactly the columns the row folder needs", async () => {
    await GET(req("http://x/api/legal/current-versions"));
    expect(state.selectCols).toBe(
      "kind, version, hash, effective_from, effective_to, jurisdiction",
    );
  });

  it("filters by jurisdiction via .eq()", async () => {
    await GET(req("http://x/api/legal/current-versions?jurisdiction=US"));
    expect(state.eqCol).toBe("jurisdiction");
    expect(state.eqVal).toBe("US");
  });

  it("filters out future-effective rows via .lte('effective_from', now)", async () => {
    const before = Date.now();
    await GET(req("http://x/api/legal/current-versions"));
    const after = Date.now();
    expect(state.lteCol).toBe("effective_from");
    const lteMs = Date.parse(String(state.lteVal));
    expect(lteMs).toBeGreaterThanOrEqual(before);
    expect(lteMs).toBeLessThanOrEqual(after);
  });

  it("orders newest-first so the newest-per-kind fold is correct", async () => {
    await GET(req("http://x/api/legal/current-versions"));
    expect(state.orderCol).toBe("effective_from");
    expect(state.orderOpts).toEqual({ ascending: false });
  });

  it("caps the payload at 500 rows so a broken registry can't OOM the server", async () => {
    await GET(req("http://x/api/legal/current-versions"));
    expect(state.limitN).toBe(500);
  });
});

describe("row folding", () => {
  it("returns the newest-per-kind entry when the same kind has multiple rows", async () => {
    state.data = [
      {
        kind: "privacy",
        version: "v3",
        hash: "hash-v3",
        effective_from: "2026-06-01T00:00:00Z",
        effective_to: null,
        jurisdiction: "AU",
      },
      {
        kind: "privacy",
        version: "v2",
        hash: "hash-v2",
        effective_from: "2026-03-01T00:00:00Z",
        effective_to: null,
        jurisdiction: "AU",
      },
    ];
    const res = await GET(req("http://x/api/legal/current-versions"));
    const body = await res.json();
    expect(body.versions.privacy).toEqual({
      version: "v3",
      hash: "hash-v3",
      effective_from: "2026-06-01T00:00:00Z",
    });
  });

  it("groups newest-per-kind for multiple kinds in one payload", async () => {
    state.data = [
      {
        kind: "privacy",
        version: "v3",
        hash: "h3",
        effective_from: "2026-06-01T00:00:00Z",
        effective_to: null,
        jurisdiction: "AU",
      },
      {
        kind: "terms",
        version: "t2",
        hash: "th2",
        effective_from: "2026-05-01T00:00:00Z",
        effective_to: null,
        jurisdiction: "AU",
      },
      {
        kind: "terms",
        version: "t1",
        hash: "th1",
        effective_from: "2026-01-01T00:00:00Z",
        effective_to: null,
        jurisdiction: "AU",
      },
    ];
    const res = await GET(req("http://x/api/legal/current-versions"));
    const body = await res.json();
    expect(body.versions).toEqual({
      privacy: {
        version: "v3",
        hash: "h3",
        effective_from: "2026-06-01T00:00:00Z",
      },
      terms: {
        version: "t2",
        hash: "th2",
        effective_from: "2026-05-01T00:00:00Z",
      },
    });
  });

  it("skips rows whose effective_to has already passed", async () => {
    state.data = [
      {
        kind: "privacy",
        version: "v3",
        hash: "h3",
        effective_from: "2026-06-01T00:00:00Z",
        effective_to: "2026-06-02T00:00:00Z", // expired long ago vs current tick
        jurisdiction: "AU",
      },
      {
        kind: "privacy",
        version: "v2",
        hash: "h2",
        effective_from: "2026-03-01T00:00:00Z",
        effective_to: null,
        jurisdiction: "AU",
      },
    ];
    const res = await GET(req("http://x/api/legal/current-versions"));
    const body = await res.json();
    expect(body.versions.privacy).toEqual({
      version: "v2",
      hash: "h2",
      effective_from: "2026-03-01T00:00:00Z",
    });
  });

  it("keeps rows with a future effective_to", async () => {
    state.data = [
      {
        kind: "privacy",
        version: "v3",
        hash: "h3",
        effective_from: "2026-06-01T00:00:00Z",
        effective_to: "2999-01-01T00:00:00Z",
        jurisdiction: "AU",
      },
    ];
    const res = await GET(req("http://x/api/legal/current-versions"));
    const body = await res.json();
    expect(body.versions.privacy.version).toBe("v3");
  });

  it("skips rows missing kind", async () => {
    state.data = [
      {
        kind: null,
        version: "v3",
        hash: "h3",
        effective_from: "2026-06-01T00:00:00Z",
        effective_to: null,
        jurisdiction: "AU",
      },
    ];
    const res = await GET(req("http://x/api/legal/current-versions"));
    const body = await res.json();
    expect(body.versions).toEqual({});
  });

  it("skips rows missing version", async () => {
    state.data = [
      {
        kind: "privacy",
        version: null,
        hash: "h3",
        effective_from: "2026-06-01T00:00:00Z",
        effective_to: null,
        jurisdiction: "AU",
      },
    ];
    const res = await GET(req("http://x/api/legal/current-versions"));
    const body = await res.json();
    expect(body.versions).toEqual({});
  });

  it("skips rows missing hash", async () => {
    state.data = [
      {
        kind: "privacy",
        version: "v3",
        hash: null,
        effective_from: "2026-06-01T00:00:00Z",
        effective_to: null,
        jurisdiction: "AU",
      },
    ];
    const res = await GET(req("http://x/api/legal/current-versions"));
    const body = await res.json();
    expect(body.versions).toEqual({});
  });

  it("skips rows missing effective_from", async () => {
    state.data = [
      {
        kind: "privacy",
        version: "v3",
        hash: "h3",
        effective_from: null,
        effective_to: null,
        jurisdiction: "AU",
      },
    ];
    const res = await GET(req("http://x/api/legal/current-versions"));
    const body = await res.json();
    expect(body.versions).toEqual({});
  });

  it("preserves newest-first ordering: an expired newest is skipped, next-most-recent wins", async () => {
    state.data = [
      {
        kind: "privacy",
        version: "v3",
        hash: "h3",
        effective_from: "2026-06-01T00:00:00Z",
        effective_to: "2026-06-15T00:00:00Z", // expired
        jurisdiction: "AU",
      },
      {
        kind: "privacy",
        version: "v2",
        hash: "h2",
        effective_from: "2026-03-01T00:00:00Z",
        effective_to: "2999-01-01T00:00:00Z",
        jurisdiction: "AU",
      },
      {
        kind: "privacy",
        version: "v1",
        hash: "h1",
        effective_from: "2026-01-01T00:00:00Z",
        effective_to: null,
        jurisdiction: "AU",
      },
    ];
    const res = await GET(req("http://x/api/legal/current-versions"));
    const body = await res.json();
    expect(body.versions.privacy.version).toBe("v2");
  });

  it("emits a stable envelope shape even when versions is empty", async () => {
    state.data = [];
    const res = await GET(
      req("http://x/api/legal/current-versions?jurisdiction=NZ"),
    );
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual([
      "jurisdiction",
      "ok",
      "versions",
    ]);
    expect(body.jurisdiction).toBe("NZ");
  });
});
