// G15-R1 — tests/live-qa/lib/api.ts resilience helpers (evidence E6):
//   • 429 + Retry-After is honoured for idempotent calls (GET/HEAD, or an
//     opts.idempotent POST): wait (cap 30 s), retry, at most 2 waits; a
//     non-idempotent POST gets the 429 straight back.
//   • 502/503/504 still gets the single 60 s swap retry, composable with 429.
//   • 520–524 classify as `edge_timeout`; evidence() annotates a blob that
//     carries a numeric `status` with that classification.
// Playwright's request context is replaced by a fetch mock; timers are fake.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { APIRequestContext, APIResponse, TestInfo } from "@playwright/test";

vi.mock("@playwright/test", () => ({
  request: { newContext: vi.fn() },
  defineConfig: (c: unknown) => c,
}));

import {
  RATE_LIMIT_CAP_MS,
  RATE_LIMIT_DEFAULT_MS,
  annotateEvidence,
  classifyStatus,
  evidence,
  fetchWithSwapRetry,
  isIdempotent,
  json,
  retryAfterMs,
} from "./api";

function fakeResponse(status: number, headers: Record<string, string> = {}, text = "{}"): APIResponse {
  return {
    status: () => status,
    headers: () => headers,
    text: async () => text,
    json: async () => JSON.parse(text),
  } as unknown as APIResponse;
}

function fakeCtx(responses: APIResponse[]): { ctx: APIRequestContext; fetch: ReturnType<typeof vi.fn> } {
  const queue = [...responses];
  const fetch = vi.fn(async () => {
    const next = queue.shift();
    if (!next) throw new Error("fetch mock exhausted");
    return next;
  });
  return { ctx: { fetch } as unknown as APIRequestContext, fetch };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("classifyStatus", () => {
  it("buckets Cloudflare 520–524 as edge_timeout, 429 as rate_limited, 502/503/504 as deploy_swap", () => {
    for (const s of [520, 521, 522, 523, 524]) expect(classifyStatus(s)).toBe("edge_timeout");
    expect(classifyStatus(429)).toBe("rate_limited");
    for (const s of [502, 503, 504]) expect(classifyStatus(s)).toBe("deploy_swap");
    expect(classifyStatus(500)).toBe("server_error");
    expect(classifyStatus(525)).toBe("server_error"); // 525/526 are TLS handshake — not a timeout
    expect(classifyStatus(404)).toBe("client_error");
    expect(classifyStatus(200)).toBe("ok");
    expect(classifyStatus(302)).toBe("ok");
  });
});

describe("retryAfterMs", () => {
  it("delta-seconds → ms, capped at 30 s", () => {
    expect(retryAfterMs("2")).toBe(2_000);
    expect(retryAfterMs(" 7 ")).toBe(7_000);
    expect(retryAfterMs("120")).toBe(RATE_LIMIT_CAP_MS);
    expect(retryAfterMs("0")).toBe(0);
  });

  it("HTTP-date → distance from now, never negative, capped", () => {
    const now = Date.parse("2026-09-18T05:00:00Z");
    expect(retryAfterMs("Fri, 18 Sep 2026 05:00:10 GMT", { nowMs: now })).toBe(10_000);
    expect(retryAfterMs("Fri, 18 Sep 2026 04:59:00 GMT", { nowMs: now })).toBe(0);
    expect(retryAfterMs("Fri, 18 Sep 2026 06:00:00 GMT", { nowMs: now })).toBe(RATE_LIMIT_CAP_MS);
  });

  it("missing / junk header → the 5 s default (itself capped)", () => {
    expect(retryAfterMs(undefined)).toBe(RATE_LIMIT_DEFAULT_MS);
    expect(retryAfterMs(null)).toBe(RATE_LIMIT_DEFAULT_MS);
    expect(retryAfterMs("soon")).toBe(RATE_LIMIT_DEFAULT_MS);
    expect(retryAfterMs("", { defaultMs: 60_000, capMs: 1_000 })).toBe(1_000);
  });
});

describe("isIdempotent", () => {
  it("GET/HEAD always; other methods only with opts.idempotent", () => {
    expect(isIdempotent("GET")).toBe(true);
    expect(isIdempotent("HEAD")).toBe(true);
    expect(isIdempotent("POST")).toBe(false);
    expect(isIdempotent("POST", { idempotent: true })).toBe(true);
    expect(isIdempotent("DELETE", { idempotent: false })).toBe(false);
  });
});

describe("fetchWithSwapRetry — 429 handling", () => {
  it("GET: waits Retry-After and retries; returns the eventual 200 after 2 fetches", async () => {
    const { ctx, fetch } = fakeCtx([fakeResponse(429, { "retry-after": "3" }), fakeResponse(200)]);
    const p = fetchWithSwapRetry(ctx, "GET", "/api/x");
    await vi.advanceTimersByTimeAsync(2_999);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    const res = await p;
    expect(res.status()).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("GET: at most 2 waits — the third 429 is returned to the caller", async () => {
    const { ctx, fetch } = fakeCtx([
      fakeResponse(429, { "retry-after": "1" }),
      fakeResponse(429, { "retry-after": "1" }),
      fakeResponse(429, { "retry-after": "1" }),
      fakeResponse(200),
    ]);
    const p = fetchWithSwapRetry(ctx, "GET", "/api/x");
    await vi.advanceTimersByTimeAsync(10_000);
    const res = await p;
    expect(res.status()).toBe(429);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("GET: a Retry-After of 120 s is capped at 30 s", async () => {
    const { ctx, fetch } = fakeCtx([fakeResponse(429, { "retry-after": "120" }), fakeResponse(200)]);
    const p = fetchWithSwapRetry(ctx, "GET", "/api/x");
    await vi.advanceTimersByTimeAsync(30_000);
    expect((await p).status()).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("GET without Retry-After: waits the 5 s default", async () => {
    const { ctx, fetch } = fakeCtx([fakeResponse(429), fakeResponse(200)]);
    const p = fetchWithSwapRetry(ctx, "GET", "/api/x");
    await vi.advanceTimersByTimeAsync(4_999);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect((await p).status()).toBe(200);
  });

  it("POST (not marked idempotent): the 429 is returned immediately, no retry", async () => {
    const { ctx, fetch } = fakeCtx([fakeResponse(429, { "retry-after": "1" }), fakeResponse(200)]);
    const res = await fetchWithSwapRetry(ctx, "POST", "/api/x", { a: 1 });
    expect(res.status()).toBe(429);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("POST marked idempotent: retried like a GET", async () => {
    const { ctx, fetch } = fakeCtx([fakeResponse(429, { "retry-after": "1" }), fakeResponse(201)]);
    const p = fetchWithSwapRetry(ctx, "POST", "/api/x", { a: 1 }, undefined, { idempotent: true });
    await vi.advanceTimersByTimeAsync(1_000);
    expect((await p).status()).toBe(201);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("swap retry (503 → wait 60 s → retry once) still works and composes with a 429", async () => {
    const { ctx, fetch } = fakeCtx([fakeResponse(503), fakeResponse(429, { "retry-after": "2" }), fakeResponse(200)]);
    const p = fetchWithSwapRetry(ctx, "GET", "/api/x");
    await vi.advanceTimersByTimeAsync(59_999);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2_000);
    expect((await p).status()).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("a second 503 after the swap retry is returned (exactly one swap retry — unchanged contract)", async () => {
    const { ctx, fetch } = fakeCtx([fakeResponse(503), fakeResponse(503), fakeResponse(200)]);
    const p = fetchWithSwapRetry(ctx, "GET", "/api/x");
    await vi.advanceTimersByTimeAsync(60_000);
    expect((await p).status()).toBe(503);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("forwards method/path/headers/timeout to ctx.fetch exactly as before", async () => {
    const { ctx, fetch } = fakeCtx([fakeResponse(200)]);
    await fetchWithSwapRetry(ctx, "PATCH", "/api/y", { k: 1 }, { "x-extra": "1" }, { timeoutMs: 1234 });
    expect(fetch).toHaveBeenCalledWith("/api/y", {
      method: "PATCH",
      headers: { accept: "application/json", "x-extra": "1", "content-type": "application/json" },
      data: JSON.stringify({ k: 1 }),
      maxRedirects: 0,
      timeout: 1234,
    });
  });
});

describe("json() result + evidence classification", () => {
  it("JsonResult carries classification (524 → edge_timeout) and keeps status/headers/body/text", async () => {
    const { ctx } = fakeCtx([fakeResponse(524, { server: "cloudflare" }, "<html>timeout</html>")]);
    const r = await json(ctx, "GET", "/api/funding/report");
    expect(r).toEqual({ status: 524, headers: { server: "cloudflare" }, body: {}, text: "<html>timeout</html>", classification: "edge_timeout" });
  });

  it("annotateEvidence adds classification only to a plain object with a numeric status, never overriding one", () => {
    expect(annotateEvidence({ status: 522, note: "x" })).toEqual({ status: 522, note: "x", classification: "edge_timeout" });
    expect(annotateEvidence({ status: 200 })).toEqual({ status: 200, classification: "ok" });
    expect(annotateEvidence({ status: 524, classification: "custom" })).toEqual({ status: 524, classification: "custom" });
    expect(annotateEvidence({ status: "524" })).toEqual({ status: "524" });
    expect(annotateEvidence([524])).toEqual([524]);
    expect(annotateEvidence(null)).toBeNull();
    expect(annotateEvidence("s")).toBe("s");
  });

  it("evidence() attaches the annotated JSON", async () => {
    const attach = vi.fn(async () => {});
    const testInfo = { attach } as unknown as TestInfo;
    await evidence(testInfo, "probe", { status: 523, path: "/api/x" });
    expect(attach).toHaveBeenCalledWith("probe", {
      body: JSON.stringify({ status: 523, path: "/api/x", classification: "edge_timeout" }, null, 2),
      contentType: "application/json",
    });
  });
});
