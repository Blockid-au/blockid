// Colocated vitest for the pure async surface of `conversion/expose.ts` — the
// client-side experiment exposure helper wired into every "surface with a
// pricing experiment" CTA path. The module also ships a `useExposeExperiment`
// React hook (`useEffect` + `useState`); that hook is *not* covered here
// because the repo does not ship `@testing-library/react` and adding a
// browser DOM harness is out of scope for this tick. This suite pins the
// deterministic fetch wrapper the hook delegates to, so any drift in the
// wire contract or the null-fallback matrix surfaces here before it ships.
//
// Failure paths matter: the docstring guarantees `exposeExperiment` NEVER
// throws — network error, non-2xx, malformed JSON, missing `variant`, empty
// `variant`, non-string `variant`, and null / undefined bodies all resolve to
// `null` so the caller can render its hard-coded control. Losing any of
// those guards turns an analytics-only exposure into a UI crash for every
// user hitting the surface.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exposeExperiment } from "./expose";

type FetchArgs = [input: RequestInfo | URL, init?: RequestInit];

let fetchSpy: ReturnType<typeof vi.fn>;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  fetchSpy = vi.fn();
  // vi.stubGlobal keeps typings happy across Node / undici Response shapes.
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function okResponse(body: unknown, init: { status?: number } = {}): Response {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function jsonThrowResponse(status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.reject(new SyntaxError("Unexpected token < in JSON")),
  } as unknown as Response;
}

describe("exposeExperiment — happy path", () => {
  it("returns the variant string from a 200 response with a well-formed body", async () => {
    fetchSpy.mockResolvedValueOnce(
      okResponse({ ok: true, experiment_id: "hero_cta", variant: "B", active: true }),
    );
    const v = await exposeExperiment("hero_cta");
    expect(v).toBe("B");
  });

  it("returns the variant even when ok/active flags are absent (variant is the only load-bearing field)", async () => {
    // The client shape is intentionally permissive — the server may drop
    // `ok`/`active`/`experiment_id` in a future refactor and the caller
    // still needs its variant string.
    fetchSpy.mockResolvedValueOnce(okResponse({ variant: "control" }));
    const v = await exposeExperiment("hero_cta");
    expect(v).toBe("control");
  });

  it("returns a variant that happens to be a numeric-looking string as-is (no coercion)", async () => {
    fetchSpy.mockResolvedValueOnce(okResponse({ variant: "42" }));
    const v = await exposeExperiment("price_tile");
    expect(v).toBe("42");
    expect(typeof v).toBe("string");
  });
});

describe("exposeExperiment — wire contract", () => {
  it("POSTs to /api/experiments/expose", async () => {
    fetchSpy.mockResolvedValueOnce(okResponse({ variant: "A" }));
    await exposeExperiment("hero_cta");
    const [url, init] = fetchSpy.mock.calls[0] as FetchArgs;
    expect(url).toBe("/api/experiments/expose");
    expect(init?.method).toBe("POST");
  });

  it("serialises the caller's experiment_id verbatim into the JSON body", async () => {
    fetchSpy.mockResolvedValueOnce(okResponse({ variant: "A" }));
    await exposeExperiment("checkout_upsell_v3");
    const [, init] = fetchSpy.mock.calls[0] as FetchArgs;
    const body = JSON.parse(String(init?.body ?? ""));
    expect(body).toEqual({ experiment_id: "checkout_upsell_v3" });
  });

  it("sets Content-Type: application/json so the API route parses the body correctly", async () => {
    fetchSpy.mockResolvedValueOnce(okResponse({ variant: "A" }));
    await exposeExperiment("hero_cta");
    const [, init] = fetchSpy.mock.calls[0] as FetchArgs;
    const headers = init?.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("uses credentials: 'same-origin' so the auth cookie rides along without CSRF risk", async () => {
    fetchSpy.mockResolvedValueOnce(okResponse({ variant: "A" }));
    await exposeExperiment("hero_cta");
    const [, init] = fetchSpy.mock.calls[0] as FetchArgs;
    expect(init?.credentials).toBe("same-origin");
  });

  it("preserves unicode and whitespace in the experiment_id without URL-encoding (body is JSON, not query)", async () => {
    fetchSpy.mockResolvedValueOnce(okResponse({ variant: "A" }));
    await exposeExperiment("hero_cta · Ω · 中文");
    const [, init] = fetchSpy.mock.calls[0] as FetchArgs;
    const body = JSON.parse(String(init?.body ?? ""));
    expect(body.experiment_id).toBe("hero_cta · Ω · 中文");
  });

  it("issues exactly one fetch per call", async () => {
    fetchSpy.mockResolvedValueOnce(okResponse({ variant: "A" }));
    await exposeExperiment("hero_cta");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("exposeExperiment — non-2xx failure branches", () => {
  it("returns null on a 404 (experiment not running)", async () => {
    fetchSpy.mockResolvedValueOnce(okResponse({ variant: "A" }, { status: 404 }));
    const v = await exposeExperiment("hero_cta");
    expect(v).toBeNull();
  });

  it("returns null on a 500 (server error)", async () => {
    fetchSpy.mockResolvedValueOnce(okResponse({ variant: "A" }, { status: 500 }));
    const v = await exposeExperiment("hero_cta");
    expect(v).toBeNull();
  });

  it("returns null on a 401 without ever parsing the body (auth-guarded path)", async () => {
    const jsonMock = vi.fn(() => Promise.resolve({ variant: "A" }));
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: jsonMock,
    } as unknown as Response);
    const v = await exposeExperiment("hero_cta");
    expect(v).toBeNull();
    expect(jsonMock).not.toHaveBeenCalled();
  });

  it("returns null on a 204 (No Content) — .ok is true but there is no body to yield a variant", async () => {
    // 204 responses are ok=true but the docstring's "malformed JSON" guard
    // takes over via the null-body branch below. We simulate by rejecting
    // json() — real fetch throws SyntaxError on empty 204s.
    fetchSpy.mockResolvedValueOnce(jsonThrowResponse(204));
    const v = await exposeExperiment("hero_cta");
    expect(v).toBeNull();
  });
});

describe("exposeExperiment — body-shape failure branches", () => {
  it("returns null when the body is null", async () => {
    fetchSpy.mockResolvedValueOnce(okResponse(null));
    const v = await exposeExperiment("hero_cta");
    expect(v).toBeNull();
  });

  it("returns null when the body is undefined", async () => {
    fetchSpy.mockResolvedValueOnce(okResponse(undefined));
    const v = await exposeExperiment("hero_cta");
    expect(v).toBeNull();
  });

  it("returns null when `variant` is missing entirely", async () => {
    fetchSpy.mockResolvedValueOnce(okResponse({ ok: true, active: true }));
    const v = await exposeExperiment("hero_cta");
    expect(v).toBeNull();
  });

  it("returns null when `variant` is an empty string", async () => {
    // Empty string passes `typeof === "string"` but fails the length guard;
    // this pins that guard so a server refactor never ships "" as a valid
    // variant identifier (which would then be used as a URL slug downstream).
    fetchSpy.mockResolvedValueOnce(okResponse({ variant: "" }));
    const v = await exposeExperiment("hero_cta");
    expect(v).toBeNull();
  });

  it("returns null when `variant` is a number (typeof-guard bypass attempt)", async () => {
    fetchSpy.mockResolvedValueOnce(okResponse({ variant: 1 }));
    const v = await exposeExperiment("hero_cta");
    expect(v).toBeNull();
  });

  it("returns null when `variant` is a boolean", async () => {
    fetchSpy.mockResolvedValueOnce(okResponse({ variant: true }));
    const v = await exposeExperiment("hero_cta");
    expect(v).toBeNull();
  });

  it("returns null when `variant` is null", async () => {
    fetchSpy.mockResolvedValueOnce(okResponse({ variant: null }));
    const v = await exposeExperiment("hero_cta");
    expect(v).toBeNull();
  });

  it("returns null when `variant` is an object", async () => {
    fetchSpy.mockResolvedValueOnce(okResponse({ variant: { key: "B" } }));
    const v = await exposeExperiment("hero_cta");
    expect(v).toBeNull();
  });

  it("returns null when the body itself is a primitive (e.g. a string)", async () => {
    // API-gateway misconfig can serve `"OK"` as the body; the caller must
    // treat that as "unknown shape" rather than crashing on `.variant`.
    fetchSpy.mockResolvedValueOnce(okResponse("OK" as unknown as Record<string, unknown>));
    const v = await exposeExperiment("hero_cta");
    expect(v).toBeNull();
  });
});

describe("exposeExperiment — thrown-error branches", () => {
  it("returns null when fetch rejects with a network error", async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const v = await exposeExperiment("hero_cta");
    expect(v).toBeNull();
  });

  it("returns null when fetch rejects with an AbortError-shaped rejection", async () => {
    const err = new Error("aborted");
    err.name = "AbortError";
    fetchSpy.mockRejectedValueOnce(err);
    const v = await exposeExperiment("hero_cta");
    expect(v).toBeNull();
  });

  it("returns null when body.json() rejects (malformed JSON body)", async () => {
    fetchSpy.mockResolvedValueOnce(jsonThrowResponse(200));
    const v = await exposeExperiment("hero_cta");
    expect(v).toBeNull();
  });

  it("does NOT rethrow — the promise always resolves (analytics-only path)", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("boom"));
    // No await/catch here — a bug where the fn rethrows would surface as
    // an unhandled rejection and fail this expectation.
    await expect(exposeExperiment("hero_cta")).resolves.toBeNull();
  });
});

describe("exposeExperiment — concurrency & independence", () => {
  it("fires independent requests when called for different experiments in parallel", async () => {
    fetchSpy
      .mockResolvedValueOnce(okResponse({ variant: "A" }))
      .mockResolvedValueOnce(okResponse({ variant: "B" }));
    const [a, b] = await Promise.all([
      exposeExperiment("exp_one"),
      exposeExperiment("exp_two"),
    ]);
    expect(a).toBe("A");
    expect(b).toBe("B");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const bodies = fetchSpy.mock.calls.map(
      (call) => JSON.parse(String((call[1] as RequestInit).body ?? "")).experiment_id,
    );
    // Two distinct experiment_id values on the wire — no cross-talk between
    // parallel calls (which would indicate accidental module-scoped state).
    expect(new Set(bodies)).toEqual(new Set(["exp_one", "exp_two"]));
  });

  it("does not leak state between sequential calls (a prior failure does not sour a later success)", async () => {
    fetchSpy
      .mockRejectedValueOnce(new Error("first-call-failed"))
      .mockResolvedValueOnce(okResponse({ variant: "B" }));
    const first = await exposeExperiment("hero_cta");
    const second = await exposeExperiment("hero_cta");
    expect(first).toBeNull();
    expect(second).toBe("B");
  });
});
