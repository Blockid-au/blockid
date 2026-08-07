// Colocated vitest for POST /api/idea-questions — P9-idea-questions-route-test.
//
// This route is the founder-facing entry point for the First-Principles idea
// lab: the client posts an idea sentence to get 5–7 Socratic questions back,
// then re-posts with answers to get a routed recommendation (which BlockID
// surface to visit next). Two silent regressions this pins against:
//
//   - dropping the ideaText length cap or the answers sanitiser and letting a
//     100kb/megakey payload land in first_principles_sessions.answers (jsonb);
//   - flipping the persist failure branch from swallow to throw and turning a
//     dropped-row into a founder-visible 500 that hides the recommendation
//     the engine already computed successfully.
//
// The route is a thin facade over the pure engine, so the tests assert route
// wiring (validation branches, sanitiser output, supabase call shape,
// best-effort persist semantics) — engine correctness is covered elsewhere.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks (registered BEFORE route import) --------------------------------

const getCurrentUserMock = vi.fn<() => Promise<{ id: string; email: string } | null>>();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

const isSupabaseConfiguredMock = vi.fn<() => boolean>();
const getSupabaseAdminMock = vi.fn<() => unknown | null>();
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => isSupabaseConfiguredMock(),
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

const generateInitialQuestionsMock = vi.fn<(t: string) => unknown[]>();
const synthesizeRecommendationMock = vi.fn<(t: string, a: Record<string, string>) => unknown>();
vi.mock("@/lib/first-principles-engine", () => ({
  generateInitialQuestions: (t: string) => generateInitialQuestionsMock(t),
  synthesizeRecommendation: (t: string, a: Record<string, string>) =>
    synthesizeRecommendationMock(t, a),
}));

// Route import MUST come after mocks are registered.
import { POST, dynamic } from "./route";

// --- Fake supabase capturing insert payload --------------------------------

interface InsertPayload {
  user_id: string | null;
  email: string | null;
  idea_text: string;
  answers: Record<string, string>;
  recommendation: unknown;
}
interface FakeState {
  lastTable: string | null;
  lastInsert: InsertPayload | null;
  insertShouldThrow: boolean;
  insertShouldReject: boolean;
  insertCalls: number;
}
const state: FakeState = {
  lastTable: null,
  lastInsert: null,
  insertShouldThrow: false,
  insertShouldReject: false,
  insertCalls: 0,
};

function makeFakeSupabase() {
  return {
    from(table: string) {
      state.lastTable = table;
      return {
        insert(payload: InsertPayload) {
          state.insertCalls += 1;
          state.lastInsert = payload;
          if (state.insertShouldThrow) throw new Error("boom-sync");
          if (state.insertShouldReject) return Promise.reject(new Error("boom-async"));
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  };
}

// --- Helpers ---------------------------------------------------------------

function req(body: unknown, opts?: { badJson?: boolean }): Request {
  const payload = opts?.badJson ? "{not json" : JSON.stringify(body);
  return new Request("http://x/api/idea-questions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload,
  });
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  getCurrentUserMock.mockReset().mockResolvedValue({ id: "u-1", email: "founder@x.com" });
  isSupabaseConfiguredMock.mockReset().mockReturnValue(true);
  getSupabaseAdminMock.mockReset().mockReturnValue(makeFakeSupabase());
  generateInitialQuestionsMock
    .mockReset()
    .mockReturnValue([{ id: "problem", prompt: "?", category: "problem" }]);
  synthesizeRecommendationMock.mockReset().mockReturnValue({
    primaryFeature: "SVI Score",
    primaryFeatureHref: "/svi",
    rationale: "because",
    secondaryFeatures: [],
  });
  state.lastTable = null;
  state.lastInsert = null;
  state.insertShouldThrow = false;
  state.insertShouldReject = false;
  state.insertCalls = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// --- Tests -----------------------------------------------------------------

describe("POST /api/idea-questions — request validation", () => {
  it("returns 400 with a stable error string on unparseable JSON", async () => {
    const res = await POST(req({}, { badJson: true }));
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ ok: false, error: "Invalid JSON" });
    expect(generateInitialQuestionsMock).not.toHaveBeenCalled();
    expect(synthesizeRecommendationMock).not.toHaveBeenCalled();
  });

  it("returns 400 when ideaText is missing", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ ok: false, error: "ideaText required" });
  });

  it("returns 400 when ideaText is an empty string", async () => {
    const res = await POST(req({ ideaText: "" }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe("ideaText required");
  });

  it("returns 400 when ideaText is whitespace-only (trim guard)", async () => {
    const res = await POST(req({ ideaText: "   \t  \n " }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe("ideaText required");
    expect(generateInitialQuestionsMock).not.toHaveBeenCalled();
  });

  it("returns 400 when ideaText is not a string (number)", async () => {
    const res = await POST(req({ ideaText: 42 }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe("ideaText required");
  });

  it("returns 400 when ideaText is not a string (boolean)", async () => {
    const res = await POST(req({ ideaText: true }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when ideaText is null", async () => {
    const res = await POST(req({ ideaText: null }));
    expect(res.status).toBe(400);
  });

  it("accepts a valid body when body itself is null-ish and rejects (destructure guard)", async () => {
    // Body is a bare string — Request.json() gives us the string, which
    // destructure treats as ideaText=undefined → 400.
    const res = await POST(
      new Request("http://x/api/idea-questions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify("just a string"),
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/idea-questions — Step 1: initial questions", () => {
  it("returns 200 + questions when only ideaText is supplied", async () => {
    const res = await POST(req({ ideaText: "an idea for AU tradies" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.questions).toEqual([
      { id: "problem", prompt: "?", category: "problem" },
    ]);
    expect(generateInitialQuestionsMock).toHaveBeenCalledTimes(1);
    expect(generateInitialQuestionsMock).toHaveBeenCalledWith("an idea for AU tradies");
    expect(synthesizeRecommendationMock).not.toHaveBeenCalled();
  });

  it("treats answers:null as Step 1 (returns questions, does not run engine step 2)", async () => {
    const res = await POST(req({ ideaText: "idea", answers: null }));
    expect(res.status).toBe(200);
    expect((await json(res)).questions).toBeDefined();
    expect(synthesizeRecommendationMock).not.toHaveBeenCalled();
  });

  it("truncates ideaText to MAX_IDEA_LEN (4000) before calling the engine", async () => {
    const long = "x".repeat(6000);
    await POST(req({ ideaText: long }));
    const [passed] = generateInitialQuestionsMock.mock.calls[0]!;
    expect(passed).toHaveLength(4000);
    expect(passed).toBe("x".repeat(4000));
  });

  it("Step 1 does NOT attempt supabase persistence (persist is Step-2 only)", async () => {
    await POST(req({ ideaText: "idea" }));
    expect(state.insertCalls).toBe(0);
    expect(state.lastInsert).toBeNull();
  });
});

describe("POST /api/idea-questions — Step 2 sanitiser", () => {
  it("rejects answers of the wrong shape — string", async () => {
    const res = await POST(req({ ideaText: "idea", answers: "not-an-object" }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe("answers must be an object of string→string");
  });

  it("rejects answers of the wrong shape — array (typeof object but Array.isArray)", async () => {
    const res = await POST(req({ ideaText: "idea", answers: ["a", "b"] }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe("answers must be an object of string→string");
    expect(synthesizeRecommendationMock).not.toHaveBeenCalled();
  });

  it("rejects answers of the wrong shape — number", async () => {
    const res = await POST(req({ ideaText: "idea", answers: 42 }));
    expect(res.status).toBe(400);
  });

  it("accepts an empty answers object and forwards {} to the engine", async () => {
    const res = await POST(req({ ideaText: "idea", answers: {} }));
    expect(res.status).toBe(200);
    expect(synthesizeRecommendationMock).toHaveBeenCalledWith("idea", {});
  });

  it("drops answer entries whose value is not a string", async () => {
    await POST(
      req({
        ideaText: "idea",
        answers: { keep: "yes", drop_num: 3, drop_bool: true, drop_null: null, drop_obj: { a: 1 } },
      }),
    );
    const [, cleaned] = synthesizeRecommendationMock.mock.calls[0]!;
    expect(cleaned).toEqual({ keep: "yes" });
  });

  it("drops answer keys longer than 64 chars", async () => {
    const longKey = "k".repeat(65);
    await POST(req({ ideaText: "idea", answers: { [longKey]: "v", short: "yes" } }));
    const [, cleaned] = synthesizeRecommendationMock.mock.calls[0]!;
    expect(cleaned).toEqual({ short: "yes" });
    expect(Object.keys(cleaned)).not.toContain(longKey);
  });

  it("keeps answer keys exactly at the 64-char boundary", async () => {
    const boundary = "k".repeat(64);
    await POST(req({ ideaText: "idea", answers: { [boundary]: "yes" } }));
    const [, cleaned] = synthesizeRecommendationMock.mock.calls[0]!;
    expect(cleaned[boundary]).toBe("yes");
  });

  it("drops answer entries with an empty-string key", async () => {
    await POST(req({ ideaText: "idea", answers: { "": "dropped", ok: "kept" } }));
    const [, cleaned] = synthesizeRecommendationMock.mock.calls[0]!;
    expect(cleaned).toEqual({ ok: "kept" });
  });

  it("truncates each answer value to MAX_ANSWER_LEN (1000) chars", async () => {
    const huge = "a".repeat(2500);
    await POST(req({ ideaText: "idea", answers: { q1: huge } }));
    const [, cleaned] = synthesizeRecommendationMock.mock.calls[0]!;
    expect(cleaned.q1).toHaveLength(1000);
    expect(cleaned.q1).toBe("a".repeat(1000));
  });

  it("processes only the first MAX_ANSWER_KEYS (10) entries by insertion order", async () => {
    const answers: Record<string, string> = {};
    for (let i = 0; i < 15; i += 1) answers[`k${i}`] = `v${i}`;
    await POST(req({ ideaText: "idea", answers }));
    const [, cleaned] = synthesizeRecommendationMock.mock.calls[0]!;
    expect(Object.keys(cleaned)).toHaveLength(10);
    expect(Object.keys(cleaned)).toEqual([
      "k0", "k1", "k2", "k3", "k4", "k5", "k6", "k7", "k8", "k9",
    ]);
    expect(cleaned).not.toHaveProperty("k10");
  });
});

describe("POST /api/idea-questions — Step 2: recommendation", () => {
  it("returns 200 + recommendation from the engine on a valid Step-2 call", async () => {
    const res = await POST(req({ ideaText: "idea", answers: { q1: "a1" } }));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({
      ok: true,
      recommendation: {
        primaryFeature: "SVI Score",
        primaryFeatureHref: "/svi",
        rationale: "because",
        secondaryFeatures: [],
      },
    });
    expect(synthesizeRecommendationMock).toHaveBeenCalledWith("idea", { q1: "a1" });
    expect(generateInitialQuestionsMock).not.toHaveBeenCalled();
  });

  it("truncates ideaText to 4000 chars before passing to the recommendation engine too", async () => {
    const long = "y".repeat(5000);
    await POST(req({ ideaText: long, answers: { q1: "a" } }));
    const [passedIdea] = synthesizeRecommendationMock.mock.calls[0]!;
    expect(passedIdea).toHaveLength(4000);
  });
});

describe("POST /api/idea-questions — best-effort persistence", () => {
  it("persists an authed session with user_id + email", async () => {
    await POST(req({ ideaText: "idea", answers: { q1: "a" } }));
    expect(state.lastTable).toBe("first_principles_sessions");
    expect(state.insertCalls).toBe(1);
    expect(state.lastInsert).toMatchObject({
      user_id: "u-1",
      email: "founder@x.com",
      idea_text: "idea",
      answers: { q1: "a" },
      recommendation: {
        primaryFeature: "SVI Score",
        primaryFeatureHref: "/svi",
        rationale: "because",
        secondaryFeatures: [],
      },
    });
  });

  it("persists an anonymous session with user_id=null + email=null when getCurrentUser resolves null", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await POST(req({ ideaText: "idea", answers: { q1: "a" } }));
    expect(state.insertCalls).toBe(1);
    expect(state.lastInsert).toMatchObject({ user_id: null, email: null });
  });

  it("skips persistence entirely when isSupabaseConfigured is false", async () => {
    isSupabaseConfiguredMock.mockReturnValue(false);
    const res = await POST(req({ ideaText: "idea", answers: { q1: "a" } }));
    expect(res.status).toBe(200);
    expect(state.insertCalls).toBe(0);
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("skips persistence when getSupabaseAdmin returns null (env-degraded runtime)", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await POST(req({ ideaText: "idea", answers: { q1: "a" } }));
    expect(res.status).toBe(200);
    expect(state.insertCalls).toBe(0);
    expect((await json(res)).recommendation).toBeDefined();
  });

  it("swallows a synchronous persist throw and still returns the recommendation (200)", async () => {
    state.insertShouldThrow = true;
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(req({ ideaText: "idea", answers: { q1: "a" } }));
    expect(res.status).toBe(200);
    expect((await json(res)).recommendation).toBeDefined();
    expect(errSpy).toHaveBeenCalled();
  });

  it("swallows an async persist rejection and still returns the recommendation (200)", async () => {
    state.insertShouldReject = true;
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(req({ ideaText: "idea", answers: { q1: "a" } }));
    expect(res.status).toBe(200);
    expect((await json(res)).recommendation).toBeDefined();
    expect(errSpy).toHaveBeenCalled();
  });

  it("swallows a getCurrentUser throw during persistence — recommendation still delivered", async () => {
    getCurrentUserMock.mockRejectedValue(new Error("auth-boom"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(req({ ideaText: "idea", answers: { q1: "a" } }));
    expect(res.status).toBe(200);
    expect((await json(res)).recommendation).toBeDefined();
    expect(state.insertCalls).toBe(0);
    expect(errSpy).toHaveBeenCalled();
  });

  it("truncated ideaText also lands in the persisted row (bounded jsonb write)", async () => {
    const long = "z".repeat(5000);
    await POST(req({ ideaText: long, answers: { q1: "a" } }));
    expect(state.lastInsert?.idea_text).toHaveLength(4000);
  });
});

describe("route module exports", () => {
  it("declares dynamic = 'force-dynamic' so the route is never statically prerendered", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});
