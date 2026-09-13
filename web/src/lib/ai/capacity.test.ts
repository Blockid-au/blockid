// Colocated vitest for the S31-A backpressure contract (capacity.ts): the
// error carries a Retry-After the route can trust, and the 503 body shape is
// what the front-end retries on.

import { describe, expect, it } from "vitest";
import { AICapacityError, aiCapacityResponse, isAICapacityError } from "./capacity";

describe("AICapacityError", () => {
  it("is a 503 with reason, retryAfterSec and queue figures; the message is honest, not a stack trace", () => {
    const err = new AICapacityError("queue_full", 7, { queued: 400, running: 120 });
    expect(err.status).toBe(503);
    expect(err.retryAfterSec).toBe(7);
    expect(err.reason).toBe("queue_full");
    expect(err.message).toBe("AI capacity busy (400 queued, 120 running) — try again in ~7 s");
    expect(new AICapacityError("user_limit", 3, { queued: 2, running: 2 }).message).toMatch(/for this account/);
    expect(isAICapacityError(err)).toBe(true);
    expect(isAICapacityError(new Error("x"))).toBe(false);
    expect(isAICapacityError({ name: "AICapacityError" })).toBe(true);
  });

  it("aiCapacityResponse → 503 + Retry-After + JSON body {ok:false, code:'ai_capacity_busy'}", async () => {
    const res = aiCapacityResponse(new AICapacityError("user_queue_full", 5, { queued: 6, running: 2 }));
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("5");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      error: "AI capacity busy for this account — try again in ~5 s",
      code: "ai_capacity_busy",
      reason: "user_queue_full",
      retry_after_sec: 5,
      queued: 6,
    });
  });
});
