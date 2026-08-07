// Unit tests for POST /api/experiments/expose — P9-experiments-expose-route-test.
//
// This route is called by every client that runs A/B experiments on first
// render. It sits in front of `assign()` which writes to `ab_assignments` on
// first exposure and locks a user to their variant forever. Silent regressions
// this pins against:
//   - dropping the Zod guard on `experiment_id` (empty/64-char cap) → letting
//     the client seed arbitrary strings into `ab_assignments`;
//   - dropping the Zod guard on `session_id` (128-char cap) → an unbounded
//     column write on anonymous traffic;
//   - forgetting that `body.session_id ?? null` must coalesce `undefined`
//     (the Zod `.nullish()` allows omission entirely) — anything else than
//     `null` would break the anonymous fallback in assign();
//   - returning `variant` without the `variant ?? exp.default_variant`
//     fallback — a null bucket must never surface a `variant: null` to the
//     client, the whole point of an experiment is to always resolve one;
//   - flipping the `active` flag → the client reads it to decide whether to
//     render the treatment or the control unmodified;
//   - collapsing the 404 unknown_experiment branch into a 200 with a null
//     variant — the client uses 404 to short-circuit its render.

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn<
  () => Promise<{ id: string; email: string } | null>
>();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

interface FakeExperiment {
  id: string;
  default_variant: string;
  active: boolean;
}

const getExperimentMock = vi.fn<(id: string) => FakeExperiment | null>();
const assignMock = vi.fn<
  (input: { experimentId: string; userId: string | null; sessionId: string | null }) => Promise<string | null>
>();

vi.mock("@/lib/conversion/experiments", () => ({
  getExperiment: (id: string) => getExperimentMock(id),
  assign: (input: { experimentId: string; userId: string | null; sessionId: string | null }) =>
    assignMock(input),
}));

import { POST, dynamic, runtime } from "./route";

function jsonReq(body: unknown, init?: { badJson?: boolean }): Request {
  const payload = init?.badJson ? "{not json" : JSON.stringify(body);
  return new Request("http://x/api/experiments/expose", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload,
  });
}

function activeExp(id = "trial_cc_required"): FakeExperiment {
  return { id, default_variant: "card_required", active: true };
}

function inactiveExp(id = "cap_hit_copy"): FakeExperiment {
  return { id, default_variant: "control", active: false };
}

beforeEach(() => {
  getCurrentUserMock.mockReset();
  getExperimentMock.mockReset();
  assignMock.mockReset();

  // Sane defaults: authenticated user, live experiment, assign yields a variant.
  getCurrentUserMock.mockResolvedValue({ id: "user-1", email: "u@x.com" });
  getExperimentMock.mockImplementation((id: string) =>
    id === "trial_cc_required" ? activeExp("trial_cc_required") : null,
  );
  assignMock.mockResolvedValue("card_required");
});

// ---------------------------------------------------------------------------
// Route module invariants
// ---------------------------------------------------------------------------

describe("POST /api/experiments/expose — route module invariants", () => {
  it('exports dynamic = "force-dynamic" so per-user variants never bake into the build cache', () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it('exports runtime = "nodejs" — createHash + supabase admin cannot run on Edge', () => {
    expect(runtime).toBe("nodejs");
  });
});

// ---------------------------------------------------------------------------
// Body-parse + Zod input validation
// ---------------------------------------------------------------------------

describe("POST /api/experiments/expose — body parsing", () => {
  it("returns 400 when the body is not valid JSON — no downstream calls made", async () => {
    const res = await POST(jsonReq(undefined, { badJson: true }));
    expect(res.status).toBe(400);
    expect(getCurrentUserMock).not.toHaveBeenCalled();
    expect(getExperimentMock).not.toHaveBeenCalled();
    expect(assignMock).not.toHaveBeenCalled();
  });

  it("400 body-parse response carries {ok:false, error} shape", async () => {
    const res = await POST(jsonReq(undefined, { badJson: true }));
    const body = (await res.json()) as { ok: boolean; error: unknown };
    expect(body.ok).toBe(false);
    expect(typeof body.error).toBe("string");
    expect((body.error as string).length).toBeGreaterThan(0);
  });

  it("returns 400 when experiment_id is missing entirely", async () => {
    const res = await POST(jsonReq({ session_id: "sess-1" }));
    expect(res.status).toBe(400);
    expect(assignMock).not.toHaveBeenCalled();
  });

  it("returns 400 when experiment_id is an empty string (Zod .min(1))", async () => {
    const res = await POST(jsonReq({ experiment_id: "" }));
    expect(res.status).toBe(400);
    expect(assignMock).not.toHaveBeenCalled();
  });

  it("returns 400 when experiment_id is not a string", async () => {
    const res = await POST(jsonReq({ experiment_id: 42 }));
    expect(res.status).toBe(400);
    expect(assignMock).not.toHaveBeenCalled();
  });

  it("returns 400 when experiment_id exceeds 64 chars (Zod .max(64))", async () => {
    const res = await POST(jsonReq({ experiment_id: "a".repeat(65) }));
    expect(res.status).toBe(400);
    expect(assignMock).not.toHaveBeenCalled();
  });

  it("accepts an experiment_id of exactly 64 chars — boundary passes validation", async () => {
    getExperimentMock.mockReturnValue(activeExp("x"));
    const res = await POST(jsonReq({ experiment_id: "a".repeat(64) }));
    expect(res.status).toBe(200);
  });

  it("returns 400 when session_id exceeds 128 chars", async () => {
    const res = await POST(
      jsonReq({ experiment_id: "trial_cc_required", session_id: "s".repeat(129) }),
    );
    expect(res.status).toBe(400);
    expect(assignMock).not.toHaveBeenCalled();
  });

  it("accepts a session_id of exactly 128 chars — boundary passes validation", async () => {
    const res = await POST(
      jsonReq({ experiment_id: "trial_cc_required", session_id: "s".repeat(128) }),
    );
    expect(res.status).toBe(200);
  });

  it("returns 400 when session_id is a non-nullish non-string (Zod string+nullish)", async () => {
    const res = await POST(jsonReq({ experiment_id: "trial_cc_required", session_id: 12 }));
    expect(res.status).toBe(400);
  });

  it("accepts session_id === null (Zod .nullish() allows null)", async () => {
    const res = await POST(jsonReq({ experiment_id: "trial_cc_required", session_id: null }));
    expect(res.status).toBe(200);
    expect(assignMock).toHaveBeenCalledWith({
      experimentId: "trial_cc_required",
      userId: "user-1",
      sessionId: null,
    });
  });

  it("accepts session_id omitted entirely (Zod .nullish() allows undefined) and coalesces to null", async () => {
    const res = await POST(jsonReq({ experiment_id: "trial_cc_required" }));
    expect(res.status).toBe(200);
    expect(assignMock).toHaveBeenCalledWith({
      experimentId: "trial_cc_required",
      userId: "user-1",
      sessionId: null,
    });
  });
});

// ---------------------------------------------------------------------------
// Unknown-experiment branch
// ---------------------------------------------------------------------------

describe("POST /api/experiments/expose — unknown experiment", () => {
  beforeEach(() => {
    getExperimentMock.mockReturnValue(null);
  });

  it("returns 404 when getExperiment returns null", async () => {
    const res = await POST(jsonReq({ experiment_id: "does_not_exist" }));
    expect(res.status).toBe(404);
  });

  it("404 response body is {ok:false, error:'unknown_experiment'}", async () => {
    const res = await POST(jsonReq({ experiment_id: "does_not_exist" }));
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body).toEqual({ ok: false, error: "unknown_experiment" });
  });

  it("does not call getCurrentUser or assign on unknown_experiment — short-circuits early", async () => {
    await POST(jsonReq({ experiment_id: "does_not_exist" }));
    expect(getCurrentUserMock).not.toHaveBeenCalled();
    expect(assignMock).not.toHaveBeenCalled();
  });

  it("looks up the exact experiment_id supplied — no case folding, no trimming", async () => {
    await POST(jsonReq({ experiment_id: "  Trial_CC_Required  " }));
    expect(getExperimentMock).toHaveBeenCalledWith("  Trial_CC_Required  ");
  });
});

// ---------------------------------------------------------------------------
// Happy path — authenticated user
// ---------------------------------------------------------------------------

describe("POST /api/experiments/expose — authenticated happy path", () => {
  it("returns 200 with {ok:true, experiment_id, variant, active} shape", async () => {
    const res = await POST(jsonReq({ experiment_id: "trial_cc_required", session_id: "sess-a" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      experiment_id: string;
      variant: string;
      active: boolean;
    };
    expect(body).toEqual({
      ok: true,
      experiment_id: "trial_cc_required",
      variant: "card_required",
      active: true,
    });
  });

  it("passes userId + sessionId + experimentId through to assign() in that exact shape", async () => {
    await POST(jsonReq({ experiment_id: "trial_cc_required", session_id: "sess-a" }));
    expect(assignMock).toHaveBeenCalledTimes(1);
    expect(assignMock).toHaveBeenCalledWith({
      experimentId: "trial_cc_required",
      userId: "user-1",
      sessionId: "sess-a",
    });
  });

  it("returns the assigned variant when assign() resolves to a non-default", async () => {
    assignMock.mockResolvedValue("card_optional");
    const res = await POST(jsonReq({ experiment_id: "trial_cc_required" }));
    const body = (await res.json()) as { variant: string };
    expect(body.variant).toBe("card_optional");
  });

  it("echoes exp.id as experiment_id, not the raw client string — protects a future normaliser", async () => {
    // getExperiment could canonicalise the id in a future refactor; the route must
    // hand back the canonical id from the config, not the raw payload.
    getExperimentMock.mockReturnValue(activeExp("canonical_id"));
    const res = await POST(jsonReq({ experiment_id: "trial_cc_required" }));
    const body = (await res.json()) as { experiment_id: string };
    expect(body.experiment_id).toBe("canonical_id");
  });

  it("propagates exp.active=true unchanged in the response", async () => {
    const res = await POST(jsonReq({ experiment_id: "trial_cc_required" }));
    const body = (await res.json()) as { active: boolean };
    expect(body.active).toBe(true);
  });

  it("does not touch the response body on a successful assign — no extra keys leak", async () => {
    const res = await POST(jsonReq({ experiment_id: "trial_cc_required" }));
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["active", "experiment_id", "ok", "variant"]);
  });
});

// ---------------------------------------------------------------------------
// Anonymous branch — no logged-in user
// ---------------------------------------------------------------------------

describe("POST /api/experiments/expose — anonymous branch", () => {
  beforeEach(() => {
    getCurrentUserMock.mockResolvedValue(null);
  });

  it("returns 200 even when the caller has no session — anonymous exposure is public", async () => {
    const res = await POST(jsonReq({ experiment_id: "trial_cc_required", session_id: "sess-anon" }));
    expect(res.status).toBe(200);
  });

  it("passes userId: null to assign() when there is no logged-in user", async () => {
    await POST(jsonReq({ experiment_id: "trial_cc_required", session_id: "sess-anon" }));
    expect(assignMock).toHaveBeenCalledWith({
      experimentId: "trial_cc_required",
      userId: null,
      sessionId: "sess-anon",
    });
  });

  it("still calls assign() when session_id is null too — anonymous + sessionless resolves to default_variant downstream", async () => {
    assignMock.mockResolvedValue(null);
    const res = await POST(jsonReq({ experiment_id: "trial_cc_required", session_id: null }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { variant: string };
    expect(body.variant).toBe("card_required");
  });
});

// ---------------------------------------------------------------------------
// Null-variant fallback — the ?? default_variant guard
// ---------------------------------------------------------------------------

describe("POST /api/experiments/expose — null-variant fallback", () => {
  it("falls back to exp.default_variant when assign() resolves to null", async () => {
    assignMock.mockResolvedValue(null);
    const res = await POST(jsonReq({ experiment_id: "trial_cc_required" }));
    const body = (await res.json()) as { variant: string };
    expect(body.variant).toBe("card_required");
  });

  it("falls back to exp.default_variant when assign() resolves to undefined", async () => {
    assignMock.mockResolvedValue(undefined as unknown as string);
    const res = await POST(jsonReq({ experiment_id: "trial_cc_required" }));
    const body = (await res.json()) as { variant: string };
    expect(body.variant).toBe("card_required");
  });

  it("does NOT fall back when assign() returns an empty string — respects a downstream-explicit value", async () => {
    // Nullish-coalescing (??) only fires on null/undefined; an empty-string
    // variant name (unusual but legal in config) must pass through untouched
    // so a future accidental "" in ab_assignments surfaces in tests, not gets
    // silently replaced with default_variant.
    assignMock.mockResolvedValue("");
    const res = await POST(jsonReq({ experiment_id: "trial_cc_required" }));
    const body = (await res.json()) as { variant: string };
    expect(body.variant).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Inactive-experiment branch
// ---------------------------------------------------------------------------

describe("POST /api/experiments/expose — inactive experiment", () => {
  beforeEach(() => {
    getExperimentMock.mockImplementation((id: string) =>
      id === "cap_hit_copy" ? inactiveExp("cap_hit_copy") : null,
    );
  });

  it("still returns 200 for an inactive experiment — the client relies on the {active:false} flag", async () => {
    assignMock.mockResolvedValue("control");
    const res = await POST(jsonReq({ experiment_id: "cap_hit_copy" }));
    expect(res.status).toBe(200);
  });

  it("propagates exp.active=false in the response body", async () => {
    assignMock.mockResolvedValue("control");
    const res = await POST(jsonReq({ experiment_id: "cap_hit_copy" }));
    const body = (await res.json()) as { active: boolean; variant: string };
    expect(body.active).toBe(false);
    expect(body.variant).toBe("control");
  });

  it("still delegates to assign() for inactive experiments — the persistence layer decides the return", async () => {
    // Even for active:false experiments the route asks assign(); the library
    // itself (not the route) short-circuits to default_variant. This test
    // pins that the route stays dumb and never gates the assign() call on
    // exp.active — a change there would silently skip DB writes for a paused
    // experiment we intended to resume.
    assignMock.mockResolvedValue("control");
    await POST(jsonReq({ experiment_id: "cap_hit_copy" }));
    expect(assignMock).toHaveBeenCalledTimes(1);
    expect(assignMock).toHaveBeenCalledWith({
      experimentId: "cap_hit_copy",
      userId: "user-1",
      sessionId: null,
    });
  });
});

// ---------------------------------------------------------------------------
// Call-ordering invariant — getExperiment must gate assign()
// ---------------------------------------------------------------------------

describe("POST /api/experiments/expose — call ordering", () => {
  it("calls getExperiment before assign() so an unknown_experiment never touches the DB", async () => {
    getExperimentMock.mockReturnValue(null);
    await POST(jsonReq({ experiment_id: "does_not_exist" }));
    expect(getExperimentMock).toHaveBeenCalledTimes(1);
    expect(assignMock).not.toHaveBeenCalled();
  });

  it("calls getCurrentUser exactly once per request — no double session read", async () => {
    await POST(jsonReq({ experiment_id: "trial_cc_required" }));
    expect(getCurrentUserMock).toHaveBeenCalledTimes(1);
  });

  it("calls assign exactly once on the happy path — no retries on the persistence layer", async () => {
    await POST(jsonReq({ experiment_id: "trial_cc_required" }));
    expect(assignMock).toHaveBeenCalledTimes(1);
  });
});
