import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Colocated vitest for the previously-untested pure `web/src/lib/error-tracker.ts`
// module — the Sentry HTTP-Store bridge every server + client error path
// funnels through (global-error.tsx client-side + captureExceptionSync from
// route handlers server-side). Sentry SDK is deliberately NOT used — this is a
// tiny fetch-based capture with silent-fail semantics, so a silent regression
// in DSN parsing, envelope shape, or the swallow-network-errors contract
// would black-hole every production error without anyone noticing.
//
// Pins:
//   • No DSN → console.error only, NO fetch (both prod + dev safe)
//   • Invalid DSN (missing publicKey / projectId / host) → console.warn, NO
//     fetch (bad env config must not crash the app OR silently POST malformed
//     events to sentry.io)
//   • parseDSN happy path stamps the Sentry ingest endpoint + X-Sentry-Auth
//     header with sentry_key=<publicKey> — pins the header contract Sentry
//     enforces at the HTTP-Store endpoint
//   • Envelope shape: platform=javascript, level=error, exception.values[0]
//     carries type=name + value=message + stacktrace.frames from the parsed
//     stack — the exact contract the Sentry issues UI relies on
//   • Non-Error err (string / number / object) wrapped in Error(String(err))
//   • extra passes through verbatim into the envelope so per-callsite context
//     survives the round-trip
//   • environment falls back to production when NODE_ENV is unset
//   • fetch rejection is swallowed — error tracking must NEVER break the app
//   • captureExceptionSync is fire-and-forget — returns void immediately
//     while still triggering the underlying capture (the void-Promise pattern
//     the route handlers depend on)
// ---------------------------------------------------------------------------

import { captureException, captureExceptionSync } from "./error-tracker";

type FetchArgs = Parameters<typeof fetch>;
type SentryEnvelope = {
  level: string;
  platform: string;
  environment?: string;
  release?: string;
  exception?: {
    values: Array<{
      type: string;
      value: string;
      stacktrace?: {
        frames: Array<{
          filename?: string;
          function?: string;
          lineno?: number;
          colno?: number;
        }>;
      };
    }>;
  };
  extra?: Record<string, unknown>;
};

const ORIGINAL_ENV = { ...process.env };
let fetchCalls: FetchArgs[] = [];
let fetchImpl: (...args: FetchArgs) => Promise<Response>;
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.SENTRY_DSN;
  delete process.env.NEXT_PUBLIC_SENTRY_DSN;
  delete process.env.NEXT_PUBLIC_APP_VERSION;
  (process.env as Record<string, string | undefined>).NODE_ENV = "test";

  fetchCalls = [];
  fetchImpl = vi.fn(async (...args: FetchArgs) => {
    fetchCalls.push(args);
    return new Response("{}", { status: 200 });
  });
  globalThis.fetch = fetchImpl as typeof fetch;

  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  consoleErrorSpy.mockRestore();
  consoleWarnSpy.mockRestore();
});

function parseFetchBody(): SentryEnvelope {
  const body = fetchCalls[0]?.[1]?.body;
  if (typeof body !== "string") throw new Error("fetch body was not a JSON string");
  return JSON.parse(body) as SentryEnvelope;
}

describe("captureException — DSN gating", () => {
  it("logs to console AND skips fetch when SENTRY_DSN is unset", async () => {
    const err = new Error("boom");
    await captureException(err);
    expect(consoleErrorSpy).toHaveBeenCalledWith("[error-tracker]", err, "");
    expect(fetchCalls).toHaveLength(0);
  });

  it("passes the extra object through to console.error when provided", async () => {
    const extra = { requestId: "req-1" };
    await captureException(new Error("boom"), extra);
    expect(consoleErrorSpy).toHaveBeenCalledWith("[error-tracker]", expect.any(Error), extra);
  });

  it("logs empty-string extras placeholder when extra is undefined", async () => {
    await captureException(new Error("boom"));
    const call = consoleErrorSpy.mock.calls[0];
    expect(call?.[2]).toBe("");
  });

  it("prefers SENTRY_DSN over NEXT_PUBLIC_SENTRY_DSN when both set", async () => {
    process.env.SENTRY_DSN = "https://server-key@o1.ingest.sentry.io/100";
    process.env.NEXT_PUBLIC_SENTRY_DSN = "https://public-key@o2.ingest.sentry.io/200";
    await captureException(new Error("boom"));
    expect(fetchCalls).toHaveLength(1);
    const url = String(fetchCalls[0][0]);
    expect(url).toBe("https://o1.ingest.sentry.io/api/100/store/");
    const authHeader = (fetchCalls[0][1]?.headers as Record<string, string>)["X-Sentry-Auth"];
    expect(authHeader).toContain("sentry_key=server-key");
  });

  it("falls back to NEXT_PUBLIC_SENTRY_DSN when SENTRY_DSN is unset", async () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = "https://public-key@o2.ingest.sentry.io/200";
    await captureException(new Error("boom"));
    expect(fetchCalls).toHaveLength(1);
    const authHeader = (fetchCalls[0][1]?.headers as Record<string, string>)["X-Sentry-Auth"];
    expect(authHeader).toContain("sentry_key=public-key");
  });
});

describe("captureException — invalid DSN", () => {
  it("logs a warning and skips fetch when DSN string is unparseable", async () => {
    process.env.SENTRY_DSN = "not-a-url";
    await captureException(new Error("boom"));
    expect(consoleWarnSpy).toHaveBeenCalledWith("[error-tracker] Invalid SENTRY_DSN format");
    expect(fetchCalls).toHaveLength(0);
  });

  it("rejects DSN with no public key (username slot empty)", async () => {
    process.env.SENTRY_DSN = "https://o1.ingest.sentry.io/100";
    await captureException(new Error("boom"));
    expect(consoleWarnSpy).toHaveBeenCalledWith("[error-tracker] Invalid SENTRY_DSN format");
    expect(fetchCalls).toHaveLength(0);
  });

  it("rejects DSN with no project id (empty path)", async () => {
    process.env.SENTRY_DSN = "https://key@o1.ingest.sentry.io/";
    await captureException(new Error("boom"));
    expect(consoleWarnSpy).toHaveBeenCalledWith("[error-tracker] Invalid SENTRY_DSN format");
    expect(fetchCalls).toHaveLength(0);
  });
});

describe("captureException — Sentry envelope shape", () => {
  beforeEach(() => {
    process.env.SENTRY_DSN = "https://abc123@o42.ingest.sentry.io/9999";
  });

  it("POSTs to /api/{projectId}/store/ with the Sentry auth header + JSON content-type", async () => {
    await captureException(new Error("boom"));
    expect(fetchCalls).toHaveLength(1);
    const [url, init] = fetchCalls[0];
    expect(String(url)).toBe("https://o42.ingest.sentry.io/api/9999/store/");
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["X-Sentry-Auth"]).toContain("sentry_version=7");
    expect(headers["X-Sentry-Auth"]).toContain("sentry_client=blockid/1.0");
    expect(headers["X-Sentry-Auth"]).toContain("sentry_key=abc123");
  });

  it("stamps platform='javascript' + level='error' on every envelope", async () => {
    await captureException(new Error("boom"));
    const env = parseFetchBody();
    expect(env.platform).toBe("javascript");
    expect(env.level).toBe("error");
  });

  it("stamps exception.values[0].type=<name> + value=<message>", async () => {
    class SpecificError extends Error {
      constructor(msg: string) {
        super(msg);
        this.name = "SpecificError";
      }
    }
    await captureException(new SpecificError("specific message"));
    const env = parseFetchBody();
    const first = env.exception!.values[0];
    expect(first.type).toBe("SpecificError");
    expect(first.value).toBe("specific message");
  });

  it("uses NODE_ENV for environment", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "staging";
    await captureException(new Error("boom"));
    expect(parseFetchBody().environment).toBe("staging");
  });

  it("falls back to environment='production' when NODE_ENV is unset", async () => {
    delete (process.env as Record<string, string | undefined>).NODE_ENV;
    await captureException(new Error("boom"));
    expect(parseFetchBody().environment).toBe("production");
  });

  it("stamps release from NEXT_PUBLIC_APP_VERSION when set", async () => {
    process.env.NEXT_PUBLIC_APP_VERSION = "v2.3.4";
    await captureException(new Error("boom"));
    expect(parseFetchBody().release).toBe("v2.3.4");
  });

  it("omits release (undefined) when NEXT_PUBLIC_APP_VERSION unset", async () => {
    delete process.env.NEXT_PUBLIC_APP_VERSION;
    await captureException(new Error("boom"));
    expect(parseFetchBody().release).toBeUndefined();
  });

  it("passes extra dict through verbatim", async () => {
    const extra = { userId: "u-1", route: "/dashboard", attempt: 3 };
    await captureException(new Error("boom"), extra);
    expect(parseFetchBody().extra).toEqual(extra);
  });

  it("omits extra field (undefined) when caller passes no extras", async () => {
    await captureException(new Error("boom"));
    expect(parseFetchBody().extra).toBeUndefined();
  });
});

describe("captureException — Error wrapping", () => {
  beforeEach(() => {
    process.env.SENTRY_DSN = "https://abc@o1.ingest.sentry.io/1";
  });

  it("wraps a bare string in Error(String(err))", async () => {
    await captureException("plain string failure");
    const env = parseFetchBody();
    expect(env.exception!.values[0].type).toBe("Error");
    expect(env.exception!.values[0].value).toBe("plain string failure");
  });

  it("wraps a number in Error(String(err))", async () => {
    await captureException(42);
    const env = parseFetchBody();
    expect(env.exception!.values[0].value).toBe("42");
  });

  it("wraps a plain object via String() which yields [object Object]", async () => {
    await captureException({ reason: "bad-json" });
    const env = parseFetchBody();
    expect(env.exception!.values[0].value).toBe("[object Object]");
  });

  it("wraps null in Error('null')", async () => {
    await captureException(null);
    const env = parseFetchBody();
    expect(env.exception!.values[0].value).toBe("null");
  });
});

describe("captureException — stacktrace parsing", () => {
  beforeEach(() => {
    process.env.SENTRY_DSN = "https://abc@o1.ingest.sentry.io/1";
  });

  it("parses V8-shape 'at fn (file:line:col)' frames", async () => {
    const err = new Error("boom");
    err.stack = [
      "Error: boom",
      "    at doThing (/app/src/x.ts:12:34)",
      "    at other (/app/src/y.ts:5:6)",
    ].join("\n");
    await captureException(err);
    const frames = parseFetchBody().exception!.values[0].stacktrace!.frames;
    expect(frames).toHaveLength(2);
    expect(frames[0]).toEqual({
      function: "doThing",
      filename: "/app/src/x.ts",
      lineno: 12,
      colno: 34,
    });
    expect(frames[1]).toEqual({
      function: "other",
      filename: "/app/src/y.ts",
      lineno: 5,
      colno: 6,
    });
  });

  it("captures the entire raw line as filename when a frame cannot be regex-parsed", async () => {
    const err = new Error("boom");
    err.stack = ["Error: boom", "    this line does not match the frame regex"].join("\n");
    await captureException(err);
    const frames = parseFetchBody().exception!.values[0].stacktrace!.frames;
    expect(frames).toHaveLength(1);
    // Note: the module does NOT trim the raw line before storing it as
    // the fallback filename — leading whitespace is preserved.
    expect(frames[0].filename).toBe("    this line does not match the frame regex");
    expect(frames[0].function).toBeUndefined();
    expect(frames[0].lineno).toBeUndefined();
  });

  it("emits an empty frames array when the Error has no stack", async () => {
    const err = new Error("boom");
    delete (err as { stack?: string }).stack;
    await captureException(err);
    const frames = parseFetchBody().exception!.values[0].stacktrace!.frames;
    expect(frames).toEqual([]);
  });

  it("skips the first line (header 'Error: msg') and only parses subsequent frames", async () => {
    const err = new Error("boom");
    err.stack = [
      "Error: boom",
      "    at first (/a.ts:1:2)",
    ].join("\n");
    await captureException(err);
    const frames = parseFetchBody().exception!.values[0].stacktrace!.frames;
    expect(frames).toHaveLength(1);
    expect(frames[0].function).toBe("first");
  });

  it("parses frames without a function name (bare 'at file:line:col') and defaults function to <anonymous>", async () => {
    const err = new Error("boom");
    err.stack = ["Error: boom", "    at /app/src/z.ts:7:8"].join("\n");
    await captureException(err);
    const frames = parseFetchBody().exception!.values[0].stacktrace!.frames;
    expect(frames[0].function).toBe("<anonymous>");
    expect(frames[0].filename).toBe("/app/src/z.ts");
    expect(frames[0].lineno).toBe(7);
    expect(frames[0].colno).toBe(8);
  });
});

describe("captureException — silent-fail contract", () => {
  it("swallows a rejecting fetch (never throws — error tracking must not break the app)", async () => {
    process.env.SENTRY_DSN = "https://abc@o1.ingest.sentry.io/1";
    globalThis.fetch = vi.fn(async () => {
      throw new Error("network down");
    }) as typeof fetch;
    await expect(captureException(new Error("boom"))).resolves.toBeUndefined();
  });

  it("returns a resolved Promise even when console.error itself is silent", async () => {
    const result = captureException(new Error("boom"));
    await expect(result).resolves.toBeUndefined();
  });
});

describe("captureExceptionSync", () => {
  it("returns undefined synchronously (fire-and-forget)", () => {
    const result = captureExceptionSync(new Error("boom"));
    expect(result).toBeUndefined();
  });

  it("still logs to console even without awaiting", async () => {
    captureExceptionSync(new Error("boom"));
    // Give the microtask queue a chance to run the async captureException.
    await Promise.resolve();
    await Promise.resolve();
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("still POSTs to Sentry when DSN is configured", async () => {
    process.env.SENTRY_DSN = "https://abc@o1.ingest.sentry.io/1";
    captureExceptionSync(new Error("boom"));
    // Drain the microtask queue so the awaited fetch has a chance to run.
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchCalls).toHaveLength(1);
  });

  it("forwards extras to the underlying capture", async () => {
    process.env.SENTRY_DSN = "https://abc@o1.ingest.sentry.io/1";
    captureExceptionSync(new Error("boom"), { route: "/x" });
    await new Promise((r) => setTimeout(r, 0));
    expect(parseFetchBody().extra).toEqual({ route: "/x" });
  });
});
