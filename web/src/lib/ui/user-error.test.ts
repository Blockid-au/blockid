import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  UserError,
  isUserError,
  USER_ERROR_COPY,
  isApiError,
  isNetworkError,
  isSafeUserCopy,
  readErrorBody,
  userErrorMessage,
} from "./user-error";

const FB = "Could not save. Please try again.";

function jsonRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readErrorBody / ApiError", () => {
  it("parses a JSON body into an ApiError with status + code", async () => {
    const err = await readErrorBody(jsonRes(402, { ok: false, error: "insufficient_credits", required: 3, balance: 1 }));
    expect(isApiError(err)).toBe(true);
    expect(err.status).toBe(402);
    expect(err.code).toBe("insufficient_credits");
    expect(err.body.required).toBe(3);
    expect(err.name).toBe("ApiError");
  });

  it("never throws on a non-JSON body (HTML 502 page)", async () => {
    const err = await readErrorBody(new Response("<html>Bad gateway</html>", { status: 502 }));
    expect(err.status).toBe(502);
    expect(err.code).toBeUndefined();
    expect(err.message).toBe("HTTP 502");
  });

  it("never throws on an empty body", async () => {
    const err = await readErrorBody(new Response(null, { status: 500 }));
    expect(err.status).toBe(500);
    expect(err.body).toEqual({});
  });

  it("fromBody wraps an already-parsed body", () => {
    const err = ApiError.fromBody(401, { ok: false, error: "unauthorized" });
    expect(err.code).toBe("unauthorized");
    expect(userErrorMessage(err, FB)).toBe(USER_ERROR_COPY.unauthorized);
  });

  it("isApiError recognises a structurally-equal object across module copies", () => {
    expect(isApiError({ name: "ApiError", status: 400, body: {} })).toBe(true);
    expect(isApiError(new Error("x"))).toBe(false);
    expect(isApiError(null)).toBe(false);
  });
});

describe("userErrorMessage — known API codes", () => {
  it("ai_capacity_busy → busy copy with retry seconds", () => {
    const err = ApiError.fromBody(503, { ok: false, error: "AI capacity is saturated", code: "ai_capacity_busy", retry_after_sec: 12 });
    expect(userErrorMessage(err, FB)).toBe("AI capacity is busy — try again in about 12 seconds.");
  });

  it("ai_capacity_busy without retry hint defaults to 30s; rounds fractional seconds", () => {
    expect(userErrorMessage(ApiError.fromBody(503, { code: "ai_capacity_busy" }), FB)).toContain("about 30 seconds");
    expect(userErrorMessage(ApiError.fromBody(503, { code: "ai_capacity_busy", retry_after_seconds: "7.6" }), FB)).toContain("about 8 seconds");
  });

  it("feature_locked → names the plan when the body carries one", () => {
    expect(userErrorMessage(ApiError.fromBody(402, { ok: false, error: "feature_locked", feature: "cap_table.write", plan: "founder_growth" }), FB)).toBe("This needs the Growth plan.");
    expect(userErrorMessage(ApiError.fromBody(402, { error: "feature_locked", required_plan: "Starter" }), FB)).toBe("This needs the Starter plan.");
  });

  it("feature_locked → caller-supplied plan, else the generic upgrade line", () => {
    expect(userErrorMessage(ApiError.fromBody(402, { error: "feature_locked", feature: "x" }), FB, { plan: "Growth" })).toBe("This needs the Growth plan.");
    expect(userErrorMessage(ApiError.fromBody(402, { error: "feature_locked", feature: "x" }), FB)).toBe(USER_ERROR_COPY.feature_locked_unknown);
    expect(userErrorMessage(ApiError.fromBody(403, { error: "plan_required", feature: "grant_finder" }), FB)).toBe(USER_ERROR_COPY.feature_locked_unknown);
  });

  it("insufficient_credits → N more credits from required/balance (all three field spellings)", () => {
    expect(userErrorMessage(ApiError.fromBody(402, { error: "insufficient_credits", required: 3, balance: 1 }), FB)).toBe("You need 2 more credits.");
    expect(userErrorMessage(ApiError.fromBody(402, { error: "insufficient_credits", creditsRequired: 1, balance: 0 }), FB)).toBe("You need 1 more credit.");
    expect(userErrorMessage(ApiError.fromBody(402, { error: "credit_spend_failed", credits_needed: 5 }), FB)).toBe("You need 5 more credits.");
    // Balance above required (race) still asks for at least one.
    expect(userErrorMessage(ApiError.fromBody(402, { error: "insufficient_credits", required: 1, balance: 4 }), FB)).toBe("You need 1 more credit.");
  });

  it("insufficient_credits without numbers → generic credits line", () => {
    expect(userErrorMessage(ApiError.fromBody(402, { error: "insufficient_credits" }), FB)).toBe(USER_ERROR_COPY.credits_unknown);
  });

  it("unauthorized (code or 401) → sign in again", () => {
    expect(userErrorMessage(ApiError.fromBody(401, { error: "unauthorized" }), FB)).toBe(USER_ERROR_COPY.unauthorized);
    expect(userErrorMessage(ApiError.fromBody(401, { error: "Authentication required" }), FB)).toBe(USER_ERROR_COPY.unauthorized);
    expect(userErrorMessage(ApiError.fromBody(401, {}), FB)).toBe(USER_ERROR_COPY.unauthorized);
    expect(userErrorMessage(ApiError.fromBody(400, { error: "not_authenticated" }), FB)).toBe(USER_ERROR_COPY.unauthorized);
  });

  it("rate_limited (code or 429) → wait a moment", () => {
    expect(userErrorMessage(ApiError.fromBody(429, { error: "rate_limited", retry_after_seconds: 30 }), FB)).toBe(USER_ERROR_COPY.rate_limited);
    expect(userErrorMessage(ApiError.fromBody(429, {}), FB)).toBe(USER_ERROR_COPY.rate_limited);
    expect(userErrorMessage(ApiError.fromBody(429, { error: "Too many requests, slow down" }), FB)).toBe(USER_ERROR_COPY.rate_limited);
  });

  it("403 / not_admin → forbidden; 404 → not found", () => {
    expect(userErrorMessage(ApiError.fromBody(403, { error: "not_admin" }), FB)).toBe(USER_ERROR_COPY.forbidden);
    expect(userErrorMessage(ApiError.fromBody(403, {}), FB)).toBe(USER_ERROR_COPY.forbidden);
    expect(userErrorMessage(ApiError.fromBody(404, { error: "not_found" }), FB)).toBe(USER_ERROR_COPY.not_found);
  });

  it("opts.code overrides whatever the error carries", () => {
    expect(userErrorMessage(new Error("boom"), FB, { code: "rate_limited" })).toBe(USER_ERROR_COPY.rate_limited);
    expect(userErrorMessage({ ok: false, error: "x", retry_after_sec: 5 }, FB, { code: "ai_capacity_busy" })).toContain("about 5 seconds");
  });
});

describe("userErrorMessage — 5xx and free text", () => {
  it("5xx → fallback even when the body carries a readable sentence", () => {
    expect(userErrorMessage(ApiError.fromBody(500, { ok: false, error: "Internal server error while calling the model" }), FB)).toBe(FB);
    expect(userErrorMessage(ApiError.fromBody(502, {}), FB)).toBe(FB);
  });

  it("4xx with a human sentence in `error` shows that sentence (validation copy)", () => {
    expect(userErrorMessage(ApiError.fromBody(400, { ok: false, error: "Plan name is required." }), FB)).toBe("Plan name is required.");
    expect(userErrorMessage(ApiError.fromBody(409, { ok: false, error: "conflict", message: "That email is already on the team." }), FB)).toBe("That email is already on the team.");
  });

  it("4xx with an unknown slug in `error` → fallback, never the slug", () => {
    expect(userErrorMessage(ApiError.fromBody(400, { error: "invalid_share_class_id" }), FB)).toBe(FB);
    expect(userErrorMessage(ApiError.fromBody(422, { error: "validation_failed", issues: [] }), FB)).toBe(FB);
  });

  it("screens leaky free text: SQL, stack frames, vendor names, uuids, long blobs", () => {
    const leaks = [
      'relation "public.cap_table_entries" does not exist: select * from cap_table_entries where id = 1',
      "TypeError: Cannot read properties of undefined (reading 'id')\n    at Object.<anonymous> (/srv/app/src/lib/x.ts:12:5)",
      "OpenAI request failed with status 400",
      "Anthropic overloaded",
      "Supabase: PGRST116 row not found",
      "Row 3f9c2b70-1a2b-4c3d-9e8f-123456789abc was rejected by the policy",
      "Unexpected token < in JSON at position 0",
      "x".repeat(300),
      "ECONNRESET while proxying",
      "Invalid API key provided for the model gateway",
    ];
    for (const leak of leaks) {
      expect(isSafeUserCopy(leak), leak.slice(0, 40)).toBe(false);
      expect(userErrorMessage(ApiError.fromBody(400, { error: leak }), FB), leak.slice(0, 40)).toBe(FB);
    }
  });

  it("isSafeUserCopy accepts ordinary sentences only", () => {
    expect(isSafeUserCopy("Please choose a share class.")).toBe(true);
    expect(isSafeUserCopy("Grant already exists for this employee")).toBe(true);
    expect(isSafeUserCopy("insufficient_credits")).toBe(false);
    expect(isSafeUserCopy("HTTP 500")).toBe(false);
    expect(isSafeUserCopy("https://example.com/x")).toBe(false);
    expect(isSafeUserCopy("ok")).toBe(false);
    expect(isSafeUserCopy(42)).toBe(false);
  });
});

describe("userErrorMessage — network and unknown errors", () => {
  it("TypeError: Failed to fetch → connection copy", () => {
    expect(userErrorMessage(new TypeError("Failed to fetch"), FB)).toBe(USER_ERROR_COPY.network);
    expect(userErrorMessage(new TypeError("NetworkError when attempting to fetch resource."), FB)).toBe(USER_ERROR_COPY.network);
    expect(userErrorMessage(new TypeError("Load failed"), FB)).toBe(USER_ERROR_COPY.network);
    expect(isNetworkError("fetch failed")).toBe(true);
  });

  it("navigator.onLine === false → connection copy regardless of the error", () => {
    vi.stubGlobal("navigator", { onLine: false });
    expect(userErrorMessage(new Error("anything"), FB)).toBe(USER_ERROR_COPY.network);
  });

  it("unknown Error → fallback; the message is NEVER echoed", () => {
    const secret = "relation cap_table does not exist at /srv/app/src/lib/db.ts:44";
    expect(userErrorMessage(new Error(secret), FB)).toBe(FB);
    expect(userErrorMessage(new Error("Something nice sounding"), FB)).toBe(FB);
    expect(userErrorMessage("a plain string", FB)).toBe(FB);
    expect(userErrorMessage(undefined, FB)).toBe(FB);
    expect(userErrorMessage(null, FB)).toBe(FB);
    expect(userErrorMessage(42, FB)).toBe(FB);
  });

  it("legacy `throw new Error(json.error)` with a known slug still maps", () => {
    expect(userErrorMessage(new Error("insufficient_credits"), FB)).toBe(USER_ERROR_COPY.credits_unknown);
    expect(userErrorMessage(new Error("feature_locked"), FB)).toBe(USER_ERROR_COPY.feature_locked_unknown);
    expect(userErrorMessage(new Error("unauthorized"), FB)).toBe(USER_ERROR_COPY.unauthorized);
    expect(userErrorMessage(new Error("rate_limited"), FB)).toBe(USER_ERROR_COPY.rate_limited);
    expect(userErrorMessage("ai_capacity_busy", FB)).toContain("AI capacity is busy");
  });

  it("legacy `throw new Error(`HTTP ${status}`)` maps the status", () => {
    expect(userErrorMessage(new Error("HTTP 401"), FB)).toBe(USER_ERROR_COPY.unauthorized);
    expect(userErrorMessage(new Error("HTTP 429"), FB)).toBe(USER_ERROR_COPY.rate_limited);
    expect(userErrorMessage(new Error("HTTP 500"), FB)).toBe(FB);
  });

  it("raw body object passed directly is treated like an ApiError body", () => {
    expect(userErrorMessage({ ok: false, error: "insufficient_credits", required: 2, balance: 0 }, FB)).toBe("You need 2 more credits.");
    expect(userErrorMessage({ ok: false, error: "Name is required." }, FB)).toBe("Name is required.");
    expect(userErrorMessage({ ok: false, error: "weird_slug" }, FB)).toBe(FB);
    expect(userErrorMessage({ ok: false, error: "Internal", status: 500 }, FB)).toBe(FB);
    expect(userErrorMessage({ ok: false, status: 401 }, FB)).toBe(USER_ERROR_COPY.unauthorized);
  });

  it("empty fallback falls back to the generic sentence", () => {
    expect(userErrorMessage(new Error("x"), "")).toBe(USER_ERROR_COPY.generic);
  });
});

describe("UserError", () => {
  it("shows authored copy verbatim", () => {
    expect(userErrorMessage(new UserError("Save the plan first."), FB)).toBe("Save the plan first.");
    expect(isUserError({ name: "UserError", message: "x" })).toBe(true);
    expect(isUserError(new Error("x"))).toBe(false);
  });
});
