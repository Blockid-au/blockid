// S31-A — backpressure contract between the AI dispatcher and API routes.
//
// `callAI()` throws `AICapacityError` (never a bare Error) when the bounded
// queue is full or a user already has the maximum in-flight calls. Routes
// that serve people turn it into an honest 503 + `Retry-After` through
// `aiCapacityResponse()` instead of a generic 500, so a trial wave sees
// "busy — try again in N s" and retries politely rather than hammering.
//
// Kept free of imports so thin route files can use it without pulling the
// whole provider chain into their module graph.

export type AICapacityReason = "queue_full" | "user_limit" | "user_queue_full";

export class AICapacityError extends Error {
  readonly reason: AICapacityReason;
  /** Seconds the caller should wait before retrying. */
  readonly retryAfterSec: number;
  readonly queued: number;
  readonly running: number;
  readonly status = 503 as const;

  constructor(reason: AICapacityReason, retryAfterSec: number, detail: { queued: number; running: number }) {
    super(
      reason === "user_limit" || reason === "user_queue_full"
        ? `AI capacity busy for this account — try again in ~${retryAfterSec} s`
        : `AI capacity busy (${detail.queued} queued, ${detail.running} running) — try again in ~${retryAfterSec} s`,
    );
    this.name = "AICapacityError";
    this.reason = reason;
    this.retryAfterSec = retryAfterSec;
    this.queued = detail.queued;
    this.running = detail.running;
  }
}

export function isAICapacityError(err: unknown): err is AICapacityError {
  return err instanceof AICapacityError || (
    typeof err === "object" && err !== null && (err as { name?: string }).name === "AICapacityError"
  );
}

/** JSON body + headers for a 503 "busy" answer. */
export function aiCapacityResponse(err: AICapacityError): Response {
  return new Response(
    JSON.stringify({
      ok: false,
      error: err.message,
      code: "ai_capacity_busy",
      reason: err.reason,
      retry_after_sec: err.retryAfterSec,
      queued: err.queued,
    }),
    {
      status: 503,
      headers: {
        "content-type": "application/json",
        "retry-after": String(err.retryAfterSec),
        "cache-control": "no-store",
      },
    },
  );
}
