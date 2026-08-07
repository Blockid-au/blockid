// Colocated vitest for GET+POST /api/evaluation — P9-evaluation-route-test.
//
// The route powers the founder-facing 13-criteria evidence grid on the
// /evaluate page. GET returns all 13 criteria merged with any stored evidence
// rows for the caller's active project; POST upserts a single criterion's
// text/files/links payload and stamps a computed quality_level onto it.
//
// A silent regression here would either leak another founder's evaluation
// evidence, drop a criterion from the grid (breaking the UI which keys off the
// full 13-row array), miswrite an unrelated criterion under the wrong key, or
// silently downgrade the quality_level so downstream SVI scoring goes stale.
//
// Silent regressions this suite pins against:
//
//   - Dropping the getCurrentUser() 401 branch on GET or POST so evaluation
//     evidence leaks to any visitor.
//   - Dropping the getSupabaseAdmin() 503 branch so a null-supabase environment
//     500s with a raw TypeError instead of the documented envelope.
//   - Regressing the "no account yet → return all 13 keys with empty data"
//     branch — the /evaluate UI keys off a length-13 criteria array and would
//     render an empty grid if the route started returning [] here.
//   - Dropping the `.eq("account_id", accountId)` filter on the criteria query
//     so a founder sees every other founder's evidence rows.
//   - Regressing the merge so stored `text_input` / `files` / `links` are lost
//     from the response — the UI would appear to wipe user data on refresh.
//   - Regressing the `quality_level` fallback so a criterion with no row shows
//     up as `null` or `undefined` instead of `"incomplete"`.
//   - Dropping computeEvaluationProgress so `progress` reports 0 (or NaN) even
//     when the founder has finished criteria.
//   - Regressing the CRITERION_KEYS whitelist on POST so an attacker can write
//     rows keyed on an arbitrary string.
//   - Regressing the files/links shape guards so malformed uploads corrupt
//     downstream renderers.
//   - Losing the `onConflict: "account_id,criterion_key"` upsert key so a
//     second POST for the same criterion inserts a duplicate row.
//   - Regressing the upsert payload — dropping `project_id`, `primary_dimension`,
//     or `secondary_dimension` would break the project-scoping + report joins.
//   - Losing `export const dynamic = "force-dynamic"` — the route reads
//     per-request auth state and must NOT be pinned to a build-time cache.

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

// --- Mocks (hoisted so they exist before the route import) ----------------

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn<() => Promise<{ id: string; email: string } | null>>(),
  getSupabaseAdmin: vi.fn<() => unknown | null>(),
  getProjectIdFromRequest: vi.fn<() => Promise<string | null>>(),
  findSVIAccountWithFallback: vi.fn<(email: string, projectId: string | null) => Promise<{ id: string } | null>>(),
  findOrCreateSVIAccount: vi.fn<(email: string, projectId: string | null) => Promise<string | null>>(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => mocks.getCurrentUser(),
}));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => mocks.getSupabaseAdmin(),
}));
vi.mock("@/lib/projects", () => ({
  getProjectIdFromRequest: () => mocks.getProjectIdFromRequest(),
  findSVIAccountWithFallback: (email: string, projectId: string | null) =>
    mocks.findSVIAccountWithFallback(email, projectId),
  findOrCreateSVIAccount: (email: string, projectId: string | null) =>
    mocks.findOrCreateSVIAccount(email, projectId),
}));

import { GET, POST, dynamic } from "./route";
import { CRITERION_KEYS, CRITERIA, getCriterion } from "@/lib/evaluation-criteria";

// --- Fake supabase — records the criteria select or upsert chain ----------

interface SelectCall {
  cols: string;
}
interface OrderCall {
  col: string;
  opts: { ascending: boolean };
}
interface EqCall {
  col: string;
  val: unknown;
}
interface UpsertCall {
  payload: Record<string, unknown>;
  opts: { onConflict?: string };
}
interface QueryLog {
  from: string;
  select: SelectCall | null;
  order: OrderCall | null;
  eqs: EqCall[];
  upsert: UpsertCall | null;
}

interface FakeState {
  logs: QueryLog[];
  selectResult: { data: unknown; error?: unknown };
  upsertResult: { data: unknown; error?: unknown };
}

function makeSupabase(state: FakeState): unknown {
  return {
    from(table: string) {
      const log: QueryLog = {
        from: table,
        select: null,
        order: null,
        eqs: [],
        upsert: null,
      };
      state.logs.push(log);
      const api: Record<string, unknown> = {};
      api.select = (cols: string) => {
        log.select = { cols };
        return api;
      };
      api.eq = (col: string, val: unknown) => {
        log.eqs.push({ col, val });
        // For GET: .select().eq() then .order() then await.
        // For POST: .upsert().select().single() then await.
        return api;
      };
      api.order = (col: string, opts: { ascending: boolean }) => {
        log.order = { col, opts };
        // Terminal for GET.
        return Promise.resolve(state.selectResult);
      };
      api.upsert = (payload: Record<string, unknown>, opts: { onConflict?: string }) => {
        log.upsert = { payload, opts };
        return api;
      };
      api.single = () => Promise.resolve(state.upsertResult);
      return api;
    },
  };
}

// --- Helpers --------------------------------------------------------------

function postReq(body: unknown, opts?: { badJson?: boolean }): Request {
  return new Request("http://localhost/api/evaluation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: opts?.badJson ? "{oops" : JSON.stringify(body ?? {}),
  });
}

async function jsonOf(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

const FOUNDER = { id: "u-founder-1", email: "founder@example.com" };

// --- State ----------------------------------------------------------------

let state: FakeState;

beforeEach(() => {
  mocks.getCurrentUser.mockReset();
  mocks.getSupabaseAdmin.mockReset();
  mocks.getProjectIdFromRequest.mockReset();
  mocks.findSVIAccountWithFallback.mockReset();
  mocks.findOrCreateSVIAccount.mockReset();

  state = {
    logs: [],
    selectResult: { data: [] },
    upsertResult: { data: null, error: null },
  };

  mocks.getCurrentUser.mockResolvedValue(FOUNDER);
  mocks.getSupabaseAdmin.mockReturnValue(makeSupabase(state));
  mocks.getProjectIdFromRequest.mockResolvedValue("proj-1");
  mocks.findSVIAccountWithFallback.mockResolvedValue({ id: "acct-1" });
  mocks.findOrCreateSVIAccount.mockResolvedValue("acct-1");
});

afterEach(() => {
  vi.clearAllMocks();
});

// -------------------------------------------------------------------------
describe("dynamic export", () => {
  it("forces dynamic — this route reads per-user auth state and must not be prerendered", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

// -------------------------------------------------------------------------
describe("GET auth gate", () => {
  it("returns 401 with the documented envelope when getCurrentUser() is null", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await jsonOf(res)).toEqual({ ok: false, error: "Authentication required" });
  });

  it("does not touch Supabase or project helpers when unauthenticated (no wasted round-trip)", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    await GET();
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
    expect(mocks.getProjectIdFromRequest).not.toHaveBeenCalled();
    expect(mocks.findSVIAccountWithFallback).not.toHaveBeenCalled();
    expect(state.logs).toHaveLength(0);
  });
});

// -------------------------------------------------------------------------
describe("GET supabase-not-configured branch", () => {
  it("returns 503 with the documented envelope when getSupabaseAdmin() is null", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(null);
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await jsonOf(res)).toEqual({ ok: false, error: "Database unavailable" });
  });

  it("does not throw a TypeError against null.from(...) when supabase is unconfigured", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(null);
    await expect(GET()).resolves.toBeInstanceOf(Response);
  });
});

// -------------------------------------------------------------------------
describe("GET no-account branch", () => {
  it("returns all 13 CRITERION_KEYS with empty evidence when the caller has no SVI account yet", async () => {
    mocks.findSVIAccountWithFallback.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await jsonOf(res);
    expect(body.ok).toBe(true);
    const criteria = body.criteria as Array<Record<string, unknown>>;
    expect(criteria).toHaveLength(CRITERION_KEYS.length);
    const keys = criteria.map((c) => c.criterion_key);
    expect(keys).toEqual([...CRITERION_KEYS]);
  });

  it("stamps every no-account row with quality_level: 'incomplete' and empty arrays (UI defaults)", async () => {
    mocks.findSVIAccountWithFallback.mockResolvedValue(null);
    const res = await GET();
    const criteria = ((await jsonOf(res)).criteria as Array<Record<string, unknown>>) ?? [];
    for (const c of criteria) {
      expect(c.text_input).toBe("");
      expect(c.files).toEqual([]);
      expect(c.links).toEqual([]);
      expect(c.ai_score).toBeNull();
      expect(c.ai_summary).toBeNull();
      expect(c.ai_suggestions).toEqual([]);
      expect(c.quality_level).toBe("incomplete");
      expect(c.created_at).toBeNull();
      expect(c.updated_at).toBeNull();
    }
  });

  it("returns progress: 0 when there is no SVI account", async () => {
    mocks.findSVIAccountWithFallback.mockResolvedValue(null);
    const body = await jsonOf(await GET());
    expect(body.progress).toBe(0);
  });

  it("does not query the evaluation_criteria table when there is no account", async () => {
    mocks.findSVIAccountWithFallback.mockResolvedValue(null);
    await GET();
    expect(state.logs).toHaveLength(0);
  });
});

// -------------------------------------------------------------------------
describe("GET query construction", () => {
  it("reads from the `evaluation_criteria` table", async () => {
    await GET();
    expect(state.logs).toHaveLength(1);
    expect(state.logs[0].from).toBe("evaluation_criteria");
  });

  it("uses SELECT * (route projects the definition-merged shape itself, not the DB)", async () => {
    await GET();
    expect(state.logs[0].select?.cols).toBe("*");
  });

  it("scopes the query to (account_id = <caller's account>) so no cross-founder leakage", async () => {
    await GET();
    expect(state.logs[0].eqs).toEqual([{ col: "account_id", val: "acct-1" }]);
  });

  it("orders by created_at ascending for stable UI order", async () => {
    await GET();
    expect(state.logs[0].order).toEqual({ col: "created_at", opts: { ascending: true } });
  });

  it("threads the resolved projectId through findSVIAccountWithFallback", async () => {
    mocks.getProjectIdFromRequest.mockResolvedValue("proj-42");
    await GET();
    expect(mocks.findSVIAccountWithFallback).toHaveBeenCalledWith(FOUNDER.email, "proj-42");
  });

  it("threads a null projectId through when the request has no active project", async () => {
    mocks.getProjectIdFromRequest.mockResolvedValue(null);
    await GET();
    expect(mocks.findSVIAccountWithFallback).toHaveBeenCalledWith(FOUNDER.email, null);
  });
});

// -------------------------------------------------------------------------
describe("GET query failure", () => {
  it("returns 500 with the documented envelope when the evaluation_criteria select errors", async () => {
    state.selectResult = { data: null, error: { message: "boom" } };
    const res = await GET();
    expect(res.status).toBe(500);
    expect(await jsonOf(res)).toEqual({ ok: false, error: "Failed to load criteria" });
  });
});

// -------------------------------------------------------------------------
describe("GET merge with stored evidence", () => {
  it("returns all 13 keys even when only some have stored rows (never drops a criterion)", async () => {
    state.selectResult = {
      data: [
        {
          criterion_key: "idea",
          text_input: "founder-written pitch of the idea over 50 chars long xxxx",
          files: [{ name: "a.pdf" }],
          links: [{ url: "https://a" }],
          ai_score: 72,
          ai_summary: "solid",
          ai_suggestions: ["tighten"],
          quality_level: "strong",
          created_at: "t1",
          updated_at: "t2",
        },
      ],
    };
    const res = await GET();
    const body = await jsonOf(res);
    const criteria = body.criteria as Array<Record<string, unknown>>;
    expect(criteria).toHaveLength(CRITERION_KEYS.length);
    const keys = criteria.map((c) => c.criterion_key);
    expect(keys).toEqual([...CRITERION_KEYS]);
  });

  it("threads stored evidence through unchanged for keys that have a row", async () => {
    state.selectResult = {
      data: [
        {
          criterion_key: "market",
          text_input: "TAM/SAM/SOM notes",
          files: [{ name: "tam.pdf", url: "u", type: "pdf", size: 1, uploaded_at: "t" }],
          links: [{ url: "https://x", label: "l", verified_at: null }],
          ai_score: 55,
          ai_summary: "meh",
          ai_suggestions: ["cite CB"],
          quality_level: "good",
          created_at: "t-a",
          updated_at: "t-b",
        },
      ],
    };
    const criteria = ((await jsonOf(await GET())).criteria as Array<Record<string, unknown>>) ?? [];
    const market = criteria.find((c) => c.criterion_key === "market") as Record<string, unknown>;
    expect(market.text_input).toBe("TAM/SAM/SOM notes");
    expect(market.files).toEqual([{ name: "tam.pdf", url: "u", type: "pdf", size: 1, uploaded_at: "t" }]);
    expect(market.links).toEqual([{ url: "https://x", label: "l", verified_at: null }]);
    expect(market.ai_score).toBe(55);
    expect(market.ai_summary).toBe("meh");
    expect(market.ai_suggestions).toEqual(["cite CB"]);
    expect(market.quality_level).toBe("good");
    expect(market.created_at).toBe("t-a");
    expect(market.updated_at).toBe("t-b");
  });

  it("stamps quality_level: 'incomplete' for keys with no stored row (UI default)", async () => {
    state.selectResult = { data: [{ criterion_key: "idea", quality_level: "strong" }] };
    const criteria = ((await jsonOf(await GET())).criteria as Array<Record<string, unknown>>) ?? [];
    const untouched = criteria.filter((c) => c.criterion_key !== "idea");
    for (const c of untouched) {
      expect(c.quality_level).toBe("incomplete");
      expect(c.text_input).toBe("");
      expect(c.files).toEqual([]);
      expect(c.links).toEqual([]);
    }
  });

  it("carries the criterion definition fields (title/weight/primary_dimension/min_evidence) through onto every row", async () => {
    const criteria = ((await jsonOf(await GET())).criteria as Array<Record<string, unknown>>) ?? [];
    for (const c of criteria) {
      const def = getCriterion(c.criterion_key as never)!;
      expect(c.title).toBe(def.title);
      expect(c.subtitle).toBe(def.subtitle);
      expect(c.icon).toBe(def.icon);
      expect(c.weight).toBe(def.weight);
      expect(c.primary_dimension).toBe(def.primaryDimension);
      expect(c.min_evidence).toBe(def.minEvidence);
      expect(c.guiding_questions).toEqual(def.guidingQuestions);
      expect(c.suggested_file_types).toEqual(def.suggestedFileTypes);
      expect(c.suggested_links).toEqual(def.suggestedLinks);
    }
  });

  it("coerces null data (no rows at all) to all-empty criteria without throwing", async () => {
    state.selectResult = { data: null };
    const res = await GET();
    const body = await jsonOf(res);
    const criteria = body.criteria as Array<Record<string, unknown>>;
    expect(criteria).toHaveLength(CRITERION_KEYS.length);
    for (const c of criteria) {
      expect(c.quality_level).toBe("incomplete");
    }
  });

  it("computes a non-zero progress when at least one criterion has a real quality_level", async () => {
    state.selectResult = {
      data: [
        { criterion_key: "idea", quality_level: "exceptional" },
        { criterion_key: "market", quality_level: "strong" },
      ],
    };
    const body = await jsonOf(await GET());
    expect(typeof body.progress).toBe("number");
    expect(body.progress).toBeGreaterThan(0);
    // ceiling: (100 + 75) / 13 = 13.46 → rounds to 13
    expect(body.progress).toBe(Math.round((100 + 75) / CRITERION_KEYS.length));
  });
});

// -------------------------------------------------------------------------
describe("POST auth gate", () => {
  it("returns 401 with the documented envelope when getCurrentUser() is null", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await POST(postReq({ criterionKey: "idea" }));
    expect(res.status).toBe(401);
    expect(await jsonOf(res)).toEqual({ ok: false, error: "Authentication required" });
  });

  it("does not read the request body or touch Supabase when unauthenticated", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    await POST(postReq({ criterionKey: "idea" }));
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
    expect(mocks.findOrCreateSVIAccount).not.toHaveBeenCalled();
    expect(state.logs).toHaveLength(0);
  });
});

// -------------------------------------------------------------------------
describe("POST supabase-not-configured branch", () => {
  it("returns 503 with the documented envelope when getSupabaseAdmin() is null", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(null);
    const res = await POST(postReq({ criterionKey: "idea" }));
    expect(res.status).toBe(503);
    expect(await jsonOf(res)).toEqual({ ok: false, error: "Database unavailable" });
  });
});

// -------------------------------------------------------------------------
describe("POST body validation", () => {
  it("returns 400 on invalid JSON body", async () => {
    const res = await POST(postReq(null, { badJson: true }));
    expect(res.status).toBe(400);
    expect(await jsonOf(res)).toEqual({ ok: false, error: "Invalid JSON body" });
  });

  it("returns 400 when criterionKey is missing", async () => {
    const res = await POST(postReq({}));
    expect(res.status).toBe(400);
    const body = await jsonOf(res);
    expect(body.ok).toBe(false);
    expect(String(body.error)).toContain("Invalid criterionKey");
  });

  it("returns 400 when criterionKey is not one of the 13 whitelisted keys", async () => {
    const res = await POST(postReq({ criterionKey: "arbitrary_attacker_key" }));
    expect(res.status).toBe(400);
    const body = await jsonOf(res);
    expect(String(body.error)).toContain("Invalid criterionKey");
    // The whitelist itself must appear in the error so callers can self-correct.
    for (const key of CRITERION_KEYS) {
      expect(String(body.error)).toContain(key);
    }
  });

  it("returns 400 when files is not an array", async () => {
    const res = await POST(postReq({ criterionKey: "idea", files: { not: "array" } }));
    expect(res.status).toBe(400);
    expect(await jsonOf(res)).toEqual({ ok: false, error: "files must be an array" });
  });

  it("returns 400 when a file entry is missing name/url/size", async () => {
    const res = await POST(postReq({
      criterionKey: "idea",
      files: [{ name: "a.pdf" /* missing url + size */ }],
    }));
    expect(res.status).toBe(400);
    const body = await jsonOf(res);
    expect(String(body.error)).toContain("name, url, type, size, uploaded_at");
  });

  it("returns 400 when links is not an array", async () => {
    const res = await POST(postReq({ criterionKey: "idea", links: "https://a" }));
    expect(res.status).toBe(400);
    expect(await jsonOf(res)).toEqual({ ok: false, error: "links must be an array" });
  });

  it("returns 400 when a link entry is missing url", async () => {
    const res = await POST(postReq({
      criterionKey: "idea",
      links: [{ label: "no url" }],
    }));
    expect(res.status).toBe(400);
    const body = await jsonOf(res);
    expect(String(body.error)).toContain("url");
  });

  it("accepts every one of the 13 CRITERION_KEYS", async () => {
    for (const key of CRITERION_KEYS) {
      state.upsertResult = { data: { criterion_key: key, text_input: "", files: [], links: [], ai_score: null, ai_summary: null, ai_suggestions: [], quality_level: "incomplete", updated_at: "t" } };
      const res = await POST(postReq({ criterionKey: key }));
      expect(res.status).toBe(200);
    }
  });
});

// -------------------------------------------------------------------------
describe("POST account resolution", () => {
  it("returns 500 when findOrCreateSVIAccount returns null (couldn't resolve account)", async () => {
    mocks.findOrCreateSVIAccount.mockResolvedValue(null);
    const res = await POST(postReq({ criterionKey: "idea" }));
    expect(res.status).toBe(500);
    expect(await jsonOf(res)).toEqual({ ok: false, error: "Could not resolve account" });
  });

  it("threads the resolved projectId through findOrCreateSVIAccount", async () => {
    mocks.getProjectIdFromRequest.mockResolvedValue("proj-x");
    state.upsertResult = { data: { criterion_key: "idea", text_input: "", files: [], links: [], ai_score: null, ai_summary: null, ai_suggestions: [], quality_level: "incomplete", updated_at: "t" } };
    await POST(postReq({ criterionKey: "idea" }));
    expect(mocks.findOrCreateSVIAccount).toHaveBeenCalledWith(FOUNDER.email, "proj-x");
  });
});

// -------------------------------------------------------------------------
describe("POST upsert payload", () => {
  beforeEach(() => {
    state.upsertResult = {
      data: {
        criterion_key: "idea",
        text_input: "the idea",
        files: [],
        links: [],
        ai_score: null,
        ai_summary: null,
        ai_suggestions: [],
        quality_level: "basic",
        updated_at: "2026-08-07T00:00:00Z",
      },
    };
  });

  it("writes to the `evaluation_criteria` table", async () => {
    await POST(postReq({ criterionKey: "idea", textInput: "the idea" }));
    expect(state.logs).toHaveLength(1);
    expect(state.logs[0].from).toBe("evaluation_criteria");
  });

  it("upserts with onConflict on (account_id, criterion_key) so re-posts update in place", async () => {
    await POST(postReq({ criterionKey: "idea", textInput: "the idea" }));
    expect(state.logs[0].upsert?.opts).toEqual({ onConflict: "account_id,criterion_key" });
  });

  it("stamps account_id, project_id, criterion_key, and definition dimensions onto the row", async () => {
    mocks.getProjectIdFromRequest.mockResolvedValue("proj-9");
    mocks.findOrCreateSVIAccount.mockResolvedValue("acct-9");
    await POST(postReq({ criterionKey: "market", textInput: "notes" }));
    const payload = state.logs[0].upsert?.payload ?? {};
    const def = getCriterion("market")!;
    expect(payload.account_id).toBe("acct-9");
    expect(payload.project_id).toBe("proj-9");
    expect(payload.criterion_key).toBe("market");
    expect(payload.primary_dimension).toBe(def.primaryDimension);
    // secondary_dimension is the first of the def's secondaryDimensions array (or null)
    expect(payload.secondary_dimension).toBe(def.secondaryDimensions[0] ?? null);
  });

  it("threads textInput through as an empty string when omitted (never undefined)", async () => {
    await POST(postReq({ criterionKey: "idea" }));
    const payload = state.logs[0].upsert?.payload ?? {};
    expect(payload.text_input).toBe("");
  });

  it("threads files + links through onto the upsert payload verbatim", async () => {
    const files = [{ name: "a.pdf", url: "u", type: "pdf", size: 1, uploaded_at: "t" }];
    const links = [{ url: "https://a", label: "L", verified_at: null }];
    await POST(postReq({ criterionKey: "idea", textInput: "long text over 50 chars xxxxxxxxxxxxxxxxxxxxxxxxxx", files, links }));
    const payload = state.logs[0].upsert?.payload ?? {};
    expect(payload.files).toEqual(files);
    expect(payload.links).toEqual(links);
  });

  it("computes and writes a quality_level derived from evidence (not accepted from the caller)", async () => {
    await POST(postReq({
      criterionKey: "idea",
      textInput: "a".repeat(60),
      files: [{ name: "a.pdf", url: "u", type: "pdf", size: 1, uploaded_at: "t" }],
      links: [{ url: "https://a", label: "L", verified_at: null }],
      // Caller tries to sneak an "exceptional" — the route MUST recompute.
      quality_level: "exceptional",
    }));
    const payload = state.logs[0].upsert?.payload ?? {};
    // hasText + 1 file + 1 link → totalEvidence 3, no ai_score → "good".
    expect(payload.quality_level).toBe("good");
  });

  it("stamps an updated_at ISO timestamp onto the row", async () => {
    await POST(postReq({ criterionKey: "idea" }));
    const payload = state.logs[0].upsert?.payload ?? {};
    expect(typeof payload.updated_at).toBe("string");
    expect(() => new Date(payload.updated_at as string).toISOString()).not.toThrow();
  });
});

// -------------------------------------------------------------------------
describe("POST upsert failure", () => {
  it("returns 500 with the documented envelope when the upsert errors", async () => {
    state.upsertResult = { data: null, error: { message: "conflict" } };
    const res = await POST(postReq({ criterionKey: "idea" }));
    expect(res.status).toBe(500);
    expect(await jsonOf(res)).toEqual({ ok: false, error: "Failed to save criterion" });
  });
});

// -------------------------------------------------------------------------
describe("POST response envelope", () => {
  it("threads the upserted row's key fields into the response", async () => {
    state.upsertResult = {
      data: {
        criterion_key: "idea",
        text_input: "the idea",
        files: [{ name: "a.pdf" }],
        links: [{ url: "https://a" }],
        ai_score: 42,
        ai_summary: "ok",
        ai_suggestions: ["tighten"],
        quality_level: "good",
        updated_at: "2026-08-07T00:00:00Z",
      },
    };
    const res = await POST(postReq({
      criterionKey: "idea",
      textInput: "the idea",
      files: [{ name: "a.pdf", url: "u", type: "pdf", size: 1, uploaded_at: "t" }],
      links: [{ url: "https://a", label: "L", verified_at: null }],
    }));
    expect(res.status).toBe(200);
    const body = await jsonOf(res);
    expect(body.ok).toBe(true);
    expect(body.criterion).toMatchObject({
      criterion_key: "idea",
      text_input: "the idea",
      quality_level: "good",
      ai_score: 42,
    });
    // qualityLevel echoes the recomputed value so callers can pin it.
    expect(body.qualityLevel).toBe("good");
  });
});

// -------------------------------------------------------------------------
describe("CRITERIA definition invariant", () => {
  it("CRITERIA is the same length as CRITERION_KEYS (used implicitly by GET to build the empty grid)", () => {
    expect(CRITERIA).toHaveLength(CRITERION_KEYS.length);
    for (const def of CRITERIA) {
      expect(CRITERION_KEYS).toContain(def.key);
    }
  });
});
