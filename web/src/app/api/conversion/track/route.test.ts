// Colocated vitest for POST /api/conversion/track — P9-conversion-track-route-test.
//
// This route is the write half of the CRO conversion funnel: every upgrade-CTA
// shown/accepted/dismissed/snoozed event the client emits lands here, then
// aggregates into the CDO's lift-per-experiment dashboards. If the route
// silently drops rows the whole funnel goes dark; if it mis-shapes the payload
// the downstream group-by on (trigger, action) misclassifies the event.
//
// The route is a small facade over `recordConversionEvent`, but the mapping is
// load-bearing: it renames snake_case body keys to camelCase args, defaults the
// three optional string fields to `null` (not `undefined`), and always resolves
// with 202 so the client fire-and-forget is never blocked on the write. Each
// contract is pinned below so a refactor can't drift any single one.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks (registered BEFORE route import) --------------------------------

const getCurrentUserMock = vi.fn<() => Promise<{ id: string; email: string } | null>>();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

interface RecordCall {
  userId: string | null;
  trigger: string;
  action: string;
  planFrom: string | null;
  planTo: string | null;
  sessionId: string | null;
  detail: Record<string, unknown> | undefined;
}
const recordConversionEventMock = vi.fn<(input: RecordCall) => Promise<void>>();

// The route imports { TRIGGERS, recordConversionEvent } from "@/lib/conversion/triggers".
// TRIGGERS is used at *module load* to build the zod enum, so the mock must
// expose a real record with at least the canonical trigger ids the tests exercise.
vi.mock("@/lib/conversion/triggers", () => ({
  TRIGGERS: {
    feature_gate_hit: { id: "feature_gate_hit", copyKey: "x", cooldownSec: 1, countsAgainstSessionCap: true },
    trial_day_5: { id: "trial_day_5", copyKey: "x", cooldownSec: 1, countsAgainstSessionCap: false },
    credits_low: { id: "credits_low", copyKey: "x", cooldownSec: 1, countsAgainstSessionCap: true },
    credits_exhausted: { id: "credits_exhausted", copyKey: "x", cooldownSec: 1, countsAgainstSessionCap: true },
    report_cap_hit: { id: "report_cap_hit", copyKey: "x", cooldownSec: 1, countsAgainstSessionCap: true },
    post_cancel_winback: { id: "post_cancel_winback", copyKey: "x", cooldownSec: 1, countsAgainstSessionCap: false },
  },
  recordConversionEvent: (input: RecordCall) => recordConversionEventMock(input),
}));

// Route import MUST come after mocks are registered.
import { POST, dynamic, runtime } from "./route";

// --- Helpers ---------------------------------------------------------------

function req(body: unknown, opts?: { badJson?: boolean }): Request {
  const payload = opts?.badJson ? "{not json" : JSON.stringify(body);
  return new Request("http://x/api/conversion/track", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload,
  });
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { trigger: "feature_gate_hit", action: "shown", ...overrides };
}

beforeEach(() => {
  getCurrentUserMock.mockReset().mockResolvedValue({ id: "u-1", email: "founder@x.com" });
  recordConversionEventMock.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Module invariants
// ---------------------------------------------------------------------------

describe("POST /api/conversion/track — module invariants", () => {
  it('exports dynamic = "force-dynamic" — funnel writes must never be statically cached', () => {
    // A cached 202 would silently drop every subsequent event, blinding the CDO
    // lift dashboard for the (trigger, experiment) cohort.
    expect(dynamic).toBe("force-dynamic");
  });

  it('exports runtime = "nodejs" — recordConversionEvent uses the supabase admin client which needs Node', () => {
    expect(runtime).toBe("nodejs");
  });
});

// ---------------------------------------------------------------------------
// Body parsing — invalid JSON
// ---------------------------------------------------------------------------

describe("POST /api/conversion/track — body parsing", () => {
  it("returns 400 on invalid JSON body — recordConversionEvent NOT called", async () => {
    const res = await POST(req(undefined, { badJson: true }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.ok).toBe(false);
    expect(typeof body.error).toBe("string");
    expect(recordConversionEventMock).not.toHaveBeenCalled();
    expect(getCurrentUserMock).not.toHaveBeenCalled();
  });

  it("returns 400 when body is empty (no fields) — zod required-field error", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.ok).toBe(false);
    expect(recordConversionEventMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Zod schema — trigger enum
// ---------------------------------------------------------------------------

describe("POST /api/conversion/track — trigger enum validation", () => {
  it("returns 400 when trigger is not in the registry — unknown ids are rejected", async () => {
    // The route builds its zod enum from Object.keys(TRIGGERS), so a
    // hand-crafted client payload with a made-up id must be rejected — a lax
    // enum would let the CDO's group-by aggregate garbage rows.
    const res = await POST(req({ trigger: "not_a_real_trigger", action: "shown" }));
    expect(res.status).toBe(400);
    expect(recordConversionEventMock).not.toHaveBeenCalled();
  });

  it("returns 400 when trigger is missing", async () => {
    const res = await POST(req({ action: "shown" }));
    expect(res.status).toBe(400);
    expect(recordConversionEventMock).not.toHaveBeenCalled();
  });

  it("returns 400 when trigger is not a string (numeric coercion NOT allowed)", async () => {
    const res = await POST(req({ trigger: 123, action: "shown" }));
    expect(res.status).toBe(400);
    expect(recordConversionEventMock).not.toHaveBeenCalled();
  });

  it("accepts every canonical trigger id — full registry coverage", async () => {
    const ids = ["feature_gate_hit", "trial_day_5", "credits_low", "credits_exhausted", "report_cap_hit", "post_cancel_winback"];
    for (const id of ids) {
      recordConversionEventMock.mockClear();
      const res = await POST(req({ trigger: id, action: "shown" }));
      expect(res.status).toBe(202);
      expect(recordConversionEventMock).toHaveBeenCalledTimes(1);
      expect(recordConversionEventMock.mock.calls[0][0].trigger).toBe(id);
    }
  });
});

// ---------------------------------------------------------------------------
// Zod schema — action enum
// ---------------------------------------------------------------------------

describe("POST /api/conversion/track — action enum validation", () => {
  it.each(["shown", "accepted", "dismissed", "snoozed"])(
    "accepts action=%s (canonical funnel state)",
    async (action) => {
      const res = await POST(req(validBody({ action })));
      expect(res.status).toBe(202);
      expect(recordConversionEventMock.mock.calls[0][0].action).toBe(action);
    },
  );

  it("returns 400 when action is outside the four canonical states", async () => {
    // Adding a fifth funnel state ('clicked', 'converted', …) requires a
    // conscious edit to both the route enum AND the downstream aggregation —
    // fail fast if a client invents one.
    const res = await POST(req(validBody({ action: "clicked" })));
    expect(res.status).toBe(400);
    expect(recordConversionEventMock).not.toHaveBeenCalled();
  });

  it("returns 400 when action is missing", async () => {
    const res = await POST(req({ trigger: "feature_gate_hit" }));
    expect(res.status).toBe(400);
    expect(recordConversionEventMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Zod schema — optional string bounds
// ---------------------------------------------------------------------------

describe("POST /api/conversion/track — optional string bounds", () => {
  it("returns 400 when plan_from exceeds 64 chars", async () => {
    const res = await POST(req(validBody({ plan_from: "x".repeat(65) })));
    expect(res.status).toBe(400);
    expect(recordConversionEventMock).not.toHaveBeenCalled();
  });

  it("returns 400 when plan_to exceeds 64 chars", async () => {
    const res = await POST(req(validBody({ plan_to: "y".repeat(65) })));
    expect(res.status).toBe(400);
    expect(recordConversionEventMock).not.toHaveBeenCalled();
  });

  it("returns 400 when session_id exceeds 128 chars", async () => {
    const res = await POST(req(validBody({ session_id: "s".repeat(129) })));
    expect(res.status).toBe(400);
    expect(recordConversionEventMock).not.toHaveBeenCalled();
  });

  it("accepts plan_from / plan_to / session_id at their exact max length", async () => {
    const res = await POST(
      req(
        validBody({
          plan_from: "a".repeat(64),
          plan_to: "b".repeat(64),
          session_id: "c".repeat(128),
        }),
      ),
    );
    expect(res.status).toBe(202);
  });
});

// ---------------------------------------------------------------------------
// snake_case → camelCase mapping (the load-bearing rename)
// ---------------------------------------------------------------------------

describe("POST /api/conversion/track — snake_case → camelCase mapping", () => {
  it("renames plan_from → planFrom, plan_to → planTo, session_id → sessionId on the record call", async () => {
    // The route is the only place this rename happens — if it drops, downstream
    // recordConversionEvent stores undefined and the CDO plan-transition report
    // silently loses every from/to pair.
    await POST(
      req(
        validBody({
          plan_from: "free",
          plan_to: "starter",
          session_id: "sess-abc",
        }),
      ),
    );
    expect(recordConversionEventMock).toHaveBeenCalledTimes(1);
    const call = recordConversionEventMock.mock.calls[0][0];
    expect(call.planFrom).toBe("free");
    expect(call.planTo).toBe("starter");
    expect(call.sessionId).toBe("sess-abc");
    // Confirm the OLD keys are not passed through — a naive spread would leak
    // both, and downstream might read either.
    expect(call).not.toHaveProperty("plan_from");
    expect(call).not.toHaveProperty("plan_to");
    expect(call).not.toHaveProperty("session_id");
  });

  it("passes detail through unchanged (Record<string, unknown>)", async () => {
    const detail = { experiment: "cta-v2", cohort: "au-founders", clicks: 3 };
    await POST(req(validBody({ detail })));
    const call = recordConversionEventMock.mock.calls[0][0];
    expect(call.detail).toEqual(detail);
  });
});

// ---------------------------------------------------------------------------
// Nullish defaults — the three optional fields must land as `null`, not `undefined`
// ---------------------------------------------------------------------------

describe("POST /api/conversion/track — nullish defaults", () => {
  it("defaults omitted plan_from / plan_to / session_id to null (not undefined) on the record call", async () => {
    // The `?? null` normalises undefined → null so recordConversionEvent's
    // downstream insert always writes NULL columns rather than 'undefined'-string.
    // Pin the null contract — a refactor to `payload.plan_from` would silently
    // insert undefined.
    await POST(req(validBody()));
    const call = recordConversionEventMock.mock.calls[0][0];
    expect(call.planFrom).toBeNull();
    expect(call.planTo).toBeNull();
    expect(call.sessionId).toBeNull();
    expect(call.planFrom).not.toBeUndefined();
    expect(call.planTo).not.toBeUndefined();
    expect(call.sessionId).not.toBeUndefined();
  });

  it("normalises explicit-null values to null (already null → still null)", async () => {
    await POST(
      req(validBody({ plan_from: null, plan_to: null, session_id: null })),
    );
    const call = recordConversionEventMock.mock.calls[0][0];
    expect(call.planFrom).toBeNull();
    expect(call.planTo).toBeNull();
    expect(call.sessionId).toBeNull();
  });

  it("does NOT pass detail when caller omits it (detail may be undefined downstream)", async () => {
    // recordConversionEvent's own `?? {}` fallback handles undefined, so the
    // route intentionally passes it through as-is rather than defaulting.
    await POST(req(validBody()));
    const call = recordConversionEventMock.mock.calls[0][0];
    expect(call.detail).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// User resolution — anonymous prospects must still be tracked
// ---------------------------------------------------------------------------

describe("POST /api/conversion/track — user resolution", () => {
  it("passes userId from getCurrentUser().id when authenticated", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u-42", email: "x@y.com" });
    await POST(req(validBody()));
    const call = recordConversionEventMock.mock.calls[0][0];
    expect(call.userId).toBe("u-42");
  });

  it("passes userId=null when getCurrentUser returns null — anonymous prospects still hit the funnel", async () => {
    // The route intentionally does NOT return 401 for anonymous users: the
    // whole point of tracking a `feature_gate_hit` is to see how many logged-out
    // visitors bounce off it. recordConversionEvent internally no-ops when
    // userId is null, but the route's job is to *pass it through*, not to gate.
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(req(validBody()));
    expect(res.status).toBe(202);
    const call = recordConversionEventMock.mock.calls[0][0];
    expect(call.userId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Response contract — 202 fire-and-forget
// ---------------------------------------------------------------------------

describe("POST /api/conversion/track — response contract", () => {
  it("always returns 202 { ok: true } on the happy path — client UX never blocks on write", async () => {
    const res = await POST(req(validBody()));
    expect(res.status).toBe(202);
    const body = await json(res);
    expect(body).toEqual({ ok: true });
  });

  it("awaits recordConversionEvent before responding — write is not left dangling on the event loop", async () => {
    // If the route fired the write without `await`, the promise could still be
    // pending when Next.js tears down the invocation on serverless — a leaked
    // write silently drops the event.
    let resolved = false;
    recordConversionEventMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          setTimeout(() => {
            resolved = true;
            resolve();
          }, 5);
        }),
    );
    const res = await POST(req(validBody()));
    expect(resolved).toBe(true);
    expect(res.status).toBe(202);
  });
});
