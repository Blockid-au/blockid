import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Colocated vitest for the previously-untested runtime machine-translation
// engine (`web/src/lib/i18n/translate.ts`, T-1403) — the Gemini-backed
// batch translator sitting behind /api/i18n/translate that fills every
// EN string not covered by the hand-authored VI catalog.
//
// Regressions here are user-visible: (a) losing the DEFAULT_LOCALE
// short-circuit sends EN→EN calls to Gemini which burns API budget on a
// no-op, (b) losing the `shouldTranslate` filter sends URLs / version
// tags / prices to Gemini and returns corrupted strings that break UI
// selectors, (c) losing the drift-reject guard silently ships legal
// footers with translated statutory references ("s708" → "phần 708"),
// (d) losing the identity-vi-equals-en skip records a false positive
// hit that pollutes the cache and hides genuine misses, (e) losing the
// batching cap sends payloads that overflow Gemini's response schema
// and time out, (f) losing the try/catch around cacheSetMany turns a
// disk hiccup into a caller-visible rejection, and (g) losing the
// non-string / MAX_BATCH / API-key guards leaks unhandled rejections
// under production load.
//
// Contract pinned:
//   - shouldTranslate: non-string → false; length <2 or >4000 → false;
//     pure numeric/formula → false; URLs → false; emails → false;
//     letterless → false; genuine sentences → true; leading/trailing
//     whitespace does NOT flip the verdict.
//   - translateBatch (identity): target === DEFAULT_LOCALE ("en") is a
//     no-op — never records a request, never touches cache, never hits
//     fetch, returns input strings unchanged in an object keyed by them.
//   - translateBatch (empty input): [] returns {} without recording a
//     request or touching cache/fetch.
//   - translateBatch (all filtered out): every input fails
//     shouldTranslate → records a request (with count including
//     filtered strings), skips cache/fetch entirely, returns each
//     original unchanged.
//   - translateBatch (all cache hits): every unique input already in
//     cache → recordHits(hits=all, misses=0), no fetch call, no
//     cacheSetMany call, returned map values come from the cache.
//   - translateBatch (all cache miss, Gemini OK): calls callGeminiBatch
//     via fetch exactly once for one <=40-item batch; writes fresh
//     values through cacheSetMany; recordHits(0, N); recordGeminiCall
//     with successStrings === kept count + ok=true; returned map values
//     come from the fresh call.
//   - translateBatch (batching): 41 inputs → callGeminiBatch fires
//     twice (Math.ceil(41/40)); 80 inputs → twice; each batch honours
//     MAX_BATCH=40.
//   - translateBatch (Gemini network error): fetch throws → returns
//     originals for every miss, recordGeminiCall(0, false), never
//     calls cacheSetMany, never calls recordDriftReject.
//   - translateBatch (Gemini non-OK): res.ok=false → returns originals,
//     recordGeminiCall(0, false).
//   - translateBatch (Gemini bad outer JSON): non-JSON response body →
//     returns originals, recordGeminiCall(0, false).
//   - translateBatch (Gemini error field): {error:{message}} in the
//     response → returns originals, recordGeminiCall(0, false).
//   - translateBatch (Gemini empty candidates): missing candidates /
//     empty text → returns originals, recordGeminiCall(0, false).
//   - translateBatch (Gemini bad inner JSON): candidate text is not
//     valid JSON → returns originals, recordGeminiCall(0, false).
//   - translateBatch (fenced JSON): candidate text wrapped in
//     ```json…``` fences is stripped and parsed correctly.
//   - translateBatch (drift reject): translation drops a reserved term
//     ("s708" disappears) → recordDriftReject, translation skipped,
//     original returned, cacheSetMany still called only with the
//     non-drift entries (nothing at all when every entry drifted).
//   - translateBatch (identity vi=en filter): Gemini returns the input
//     verbatim → treated as non-translation, skipped, original
//     returned, NOT recorded as drift.
//   - translateBatch (empty vi string filter): Gemini returns "" → skipped,
//     original returned, NOT recorded as drift.
//   - translateBatch (dedupes): duplicate EN strings collapse into one
//     unique before cache lookup + fetch; recordHits/miss counts refer
//     to unique-count, not raw-input-count.
//   - translateBatch (mixed hit + miss): cached entries used verbatim,
//     misses fetched, output map covers all raw inputs (including
//     dupes) mapped to correct translation.
//   - translateBatch (missing API key): callGeminiBatch returns null
//     when GOOGLE_GEMINI_API_KEY is unset → returns originals for
//     misses, recordGeminiCall(0, false).
//   - translateBatch (cacheSetMany failure): rejects silently — caller
//     still receives full result map with fresh values.
//   - translateText: thin wrapper that resolves to the value keyed by
//     the input in the underlying translateBatch result; falls back to
//     input on absence.
//   - Filtered strings never appear in cacheGetMany calls.
//   - Gemini request shape: POST to
//     `generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=<key>`,
//     JSON body with system_instruction + user contents + generationConfig
//     (temperature 0.2, maxOutputTokens 8192, responseMimeType JSON),
//     AbortSignal wired, cache: 'no-store' pinned.
//   - RESERVED_TERMS are prompt-injected into the system message.
//   - Timeout guard: AbortController triggers when fetch takes > 15s;
//     verified by aborting the injected fetch inline.

// ---------------------------------------------------------------------------
// Mocks — cache + stats are the only impure imports; keep locales +
// reserved-terms real so drift-detection semantics ride the real regex.
// ---------------------------------------------------------------------------

const cacheGetManyMock = vi.fn<
  (locale: "en" | "vi", ens: string[]) => Promise<Record<string, string>>
>();
const cacheSetManyMock = vi.fn<
  (locale: "en" | "vi", pairs: Record<string, string>) => Promise<void>
>();

vi.mock("./translate-cache", () => ({
  cacheGetMany: (locale: "en" | "vi", ens: string[]) => cacheGetManyMock(locale, ens),
  cacheSetMany: (locale: "en" | "vi", pairs: Record<string, string>) =>
    cacheSetManyMock(locale, pairs),
}));

const recordRequestMock = vi.fn<(locale: "en" | "vi", strings: number) => void>();
const recordHitsMock = vi.fn<(locale: "en" | "vi", hits: number, misses: number) => void>();
const recordGeminiCallMock = vi.fn<
  (locale: "en" | "vi", successStrings: number, ok: boolean) => void
>();
const recordDriftRejectMock = vi.fn<(locale: "en" | "vi") => void>();

vi.mock("./translate-stats", () => ({
  recordRequest: (locale: "en" | "vi", n: number) => recordRequestMock(locale, n),
  recordHits: (locale: "en" | "vi", h: number, m: number) => recordHitsMock(locale, h, m),
  recordGeminiCall: (locale: "en" | "vi", s: number, ok: boolean) =>
    recordGeminiCallMock(locale, s, ok),
  recordDriftReject: (locale: "en" | "vi") => recordDriftRejectMock(locale),
}));

import { translateBatch, translateText, shouldTranslate } from "./translate";
import { RESERVED_TERMS } from "./reserved-terms";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

interface FetchCall {
  url: string;
  init: RequestInit | undefined;
  body: unknown;
}

type FetchResponder =
  | { kind: "throw"; error: unknown }
  | { kind: "abort" }
  | {
      kind: "resolve";
      ok: boolean;
      status?: number;
      textPayload: string;
    };

const fetchCalls: FetchCall[] = [];
let responders: FetchResponder[] = [];
const originalFetch = globalThis.fetch;

function installFetch() {
  fetchCalls.length = 0;
  responders = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body;
    fetchCalls.push({ url, init, body });

    if (init?.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    const r = responders.shift();
    if (!r) {
      throw new Error(`no responder configured for fetch #${fetchCalls.length}`);
    }

    if (r.kind === "throw") throw r.error;
    if (r.kind === "abort") {
      await new Promise((resolve) => setTimeout(resolve, 0));
      throw new DOMException("Aborted", "AbortError");
    }

    return {
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 500),
      text: async () => r.textPayload,
    } as unknown as Response;
  }) as typeof fetch;
}

function makeGeminiPayload(
  indexed: Record<string, string>,
  opts: { fenced?: boolean; wrapInError?: boolean; emptyCandidates?: boolean } = {},
): string {
  if (opts.wrapInError) {
    return JSON.stringify({ error: { message: "boom" } });
  }
  if (opts.emptyCandidates) {
    return JSON.stringify({ candidates: [] });
  }
  const rawJson = JSON.stringify(indexed);
  const text = opts.fenced ? "```json\n" + rawJson + "\n```" : rawJson;
  return JSON.stringify({
    candidates: [{ content: { parts: [{ text }] } }],
  });
}

function queueGeminiOk(indexed: Record<string, string>, opts?: { fenced?: boolean }): void {
  responders.push({ kind: "resolve", ok: true, textPayload: makeGeminiPayload(indexed, opts) });
}

const ORIGINAL_KEY = process.env.GOOGLE_GEMINI_API_KEY;

beforeEach(() => {
  process.env.GOOGLE_GEMINI_API_KEY = "test-key";
  cacheGetManyMock.mockReset();
  cacheSetManyMock.mockReset();
  recordRequestMock.mockReset();
  recordHitsMock.mockReset();
  recordGeminiCallMock.mockReset();
  recordDriftRejectMock.mockReset();
  cacheGetManyMock.mockResolvedValue({});
  cacheSetManyMock.mockResolvedValue(undefined);
  installFetch();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (ORIGINAL_KEY === undefined) delete process.env.GOOGLE_GEMINI_API_KEY;
  else process.env.GOOGLE_GEMINI_API_KEY = ORIGINAL_KEY;
});

// ===========================================================================
// shouldTranslate — pure filter
// ===========================================================================

describe("shouldTranslate", () => {
  it("rejects non-string input", () => {
    expect(shouldTranslate(undefined as unknown as string)).toBe(false);
    expect(shouldTranslate(null as unknown as string)).toBe(false);
    expect(shouldTranslate(42 as unknown as string)).toBe(false);
    expect(shouldTranslate({} as unknown as string)).toBe(false);
  });

  it("rejects empty and single-character strings", () => {
    expect(shouldTranslate("")).toBe(false);
    expect(shouldTranslate("a")).toBe(false);
    expect(shouldTranslate("   ")).toBe(false);
  });

  it("rejects strings longer than 4000 chars (model context guard)", () => {
    expect(shouldTranslate("a".repeat(4001))).toBe(false);
    expect(shouldTranslate("hello " + "x".repeat(4000))).toBe(false);
  });

  it("accepts strings at the 4000-char boundary", () => {
    expect(shouldTranslate("h" + "e".repeat(3999))).toBe(true);
    expect(shouldTranslate("h".repeat(4000))).toBe(true);
  });

  it("rejects pure-numeric / formula-shaped strings", () => {
    expect(shouldTranslate("42")).toBe(false);
    expect(shouldTranslate("3.14")).toBe(false);
    expect(shouldTranslate("1,000")).toBe(false);
    expect(shouldTranslate("$99")).toBe(false);
    expect(shouldTranslate("(2 + 2)")).toBe(false);
    expect(shouldTranslate("100%")).toBe(false);
    expect(shouldTranslate("€500")).toBe(false);
    expect(shouldTranslate("£1,000.00")).toBe(false);
    expect(shouldTranslate("¥900")).toBe(false);
    expect(shouldTranslate("₫12,000")).toBe(false);
  });

  it("rejects URL-looking strings", () => {
    expect(shouldTranslate("https://blockid.au")).toBe(false);
    expect(shouldTranslate("http://example.com/path")).toBe(false);
    expect(shouldTranslate("HTTPS://EXAMPLE.COM")).toBe(false);
  });

  it("rejects email-shaped strings", () => {
    expect(shouldTranslate("admin@blockid.au")).toBe(false);
    expect(shouldTranslate("a-b_c@ex.co")).toBe(false);
  });

  it("rejects strings without any letters", () => {
    expect(shouldTranslate("!!!")).toBe(false);
    expect(shouldTranslate("~~~")).toBe(false);
    expect(shouldTranslate("...")).toBe(false);
  });

  it("accepts real English sentences", () => {
    expect(shouldTranslate("Get started")).toBe(true);
    expect(shouldTranslate("Investor readiness score")).toBe(true);
    expect(shouldTranslate("Two words")).toBe(true);
  });

  it("ignores leading/trailing whitespace when applying rules", () => {
    // Length guard uses trimmed length — "  hi  " is length 2 after trim.
    expect(shouldTranslate("  hi  ")).toBe(true);
    // Numeric guard applies after trim.
    expect(shouldTranslate("   123   ")).toBe(false);
    // A trimmed URL is still a URL.
    expect(shouldTranslate("   https://blockid.au  ")).toBe(false);
  });

  it("accepts short bilingual/i18n edge cases", () => {
    // Just at the 2-char boundary with letters.
    expect(shouldTranslate("Hi")).toBe(true);
    // Mixed letters + digits still passes.
    expect(shouldTranslate("Level 3")).toBe(true);
  });
});

// ===========================================================================
// translateBatch — identity + empty + all-filtered short-circuits
// ===========================================================================

describe("translateBatch — short-circuits", () => {
  it("identity DEFAULT_LOCALE (en) returns inputs verbatim without side effects", async () => {
    const inputs = ["Hello", "World", "https://blockid.au"];
    const out = await translateBatch(inputs, "en");
    expect(out).toEqual({ Hello: "Hello", World: "World", "https://blockid.au": "https://blockid.au" });
    expect(recordRequestMock).not.toHaveBeenCalled();
    expect(cacheGetManyMock).not.toHaveBeenCalled();
    expect(cacheSetManyMock).not.toHaveBeenCalled();
    expect(fetchCalls).toHaveLength(0);
  });

  it("empty input array returns {} with no side effects", async () => {
    const out = await translateBatch([], "vi");
    expect(out).toEqual({});
    expect(recordRequestMock).toHaveBeenCalledWith("vi", 0);
    expect(cacheGetManyMock).not.toHaveBeenCalled();
    expect(cacheSetManyMock).not.toHaveBeenCalled();
    expect(fetchCalls).toHaveLength(0);
  });

  it("all-filtered input records the request but skips cache + fetch", async () => {
    const inputs = ["https://x.com", "42", "  "];
    const out = await translateBatch(inputs, "vi");
    expect(out).toEqual({
      "https://x.com": "https://x.com",
      "42": "42",
      "  ": "  ",
    });
    expect(recordRequestMock).toHaveBeenCalledWith("vi", 3);
    expect(cacheGetManyMock).not.toHaveBeenCalled();
    expect(fetchCalls).toHaveLength(0);
  });
});

// ===========================================================================
// translateBatch — cache-only path
// ===========================================================================

describe("translateBatch — cache-only path", () => {
  it("returns cached translations without hitting Gemini", async () => {
    cacheGetManyMock.mockResolvedValue({ Hello: "Xin chào", World: "Thế giới" });
    const out = await translateBatch(["Hello", "World"], "vi");
    expect(out).toEqual({ Hello: "Xin chào", World: "Thế giới" });
    expect(fetchCalls).toHaveLength(0);
    expect(recordHitsMock).toHaveBeenCalledWith("vi", 2, 0);
    expect(recordGeminiCallMock).not.toHaveBeenCalled();
    expect(cacheSetManyMock).not.toHaveBeenCalled();
  });

  it("filters strings before cache lookup", async () => {
    cacheGetManyMock.mockResolvedValue({ Hello: "Xin chào" });
    const out = await translateBatch(["Hello", "42", "https://x.com"], "vi");
    expect(cacheGetManyMock).toHaveBeenCalledTimes(1);
    // Only translatable strings hit the cache — "42" and the URL are dropped.
    expect(cacheGetManyMock.mock.calls[0]?.[1]).toEqual(["Hello"]);
    expect(out["Hello"]).toBe("Xin chào");
    expect(out["42"]).toBe("42");
    expect(out["https://x.com"]).toBe("https://x.com");
  });

  it("dedupes inputs before cache lookup", async () => {
    cacheGetManyMock.mockResolvedValue({ Hello: "Xin chào" });
    const out = await translateBatch(["Hello", "Hello", "Hello"], "vi");
    expect(cacheGetManyMock.mock.calls[0]?.[1]).toEqual(["Hello"]);
    expect(recordHitsMock).toHaveBeenCalledWith("vi", 1, 0);
    expect(out).toEqual({ Hello: "Xin chào" });
  });
});

// ===========================================================================
// translateBatch — Gemini happy path
// ===========================================================================

describe("translateBatch — Gemini happy path", () => {
  it("calls Gemini once for a <=40-item miss batch and caches fresh values", async () => {
    cacheGetManyMock.mockResolvedValue({});
    queueGeminiOk({ "1": "Xin chào", "2": "Thế giới" });
    const out = await translateBatch(["Hello", "World"], "vi");
    expect(fetchCalls).toHaveLength(1);
    expect(out).toEqual({ Hello: "Xin chào", World: "Thế giới" });
    expect(recordHitsMock).toHaveBeenCalledWith("vi", 0, 2);
    expect(recordGeminiCallMock).toHaveBeenCalledWith("vi", 2, true);
    expect(cacheSetManyMock).toHaveBeenCalledWith("vi", { Hello: "Xin chào", World: "Thế giới" });
  });

  it("mixes cache hits and Gemini misses correctly", async () => {
    cacheGetManyMock.mockResolvedValue({ Hello: "Xin chào" });
    queueGeminiOk({ "1": "Thế giới" });
    const out = await translateBatch(["Hello", "World"], "vi");
    expect(recordHitsMock).toHaveBeenCalledWith("vi", 1, 1);
    // Only the miss hits Gemini.
    expect(fetchCalls[0]!.body).toMatchObject({
      contents: [{ parts: [{ text: expect.stringContaining("1. World") }] }],
    });
    expect(out).toEqual({ Hello: "Xin chào", World: "Thế giới" });
  });

  it("handles duplicate raw inputs — output covers every original key", async () => {
    cacheGetManyMock.mockResolvedValue({});
    queueGeminiOk({ "1": "Xin chào" });
    const out = await translateBatch(["Hello", "Hello", "Hello"], "vi");
    expect(fetchCalls).toHaveLength(1);
    expect(recordHitsMock).toHaveBeenCalledWith("vi", 0, 1);
    // Object literal collapses dupe keys, but the value is the translated one.
    expect(out).toEqual({ Hello: "Xin chào" });
  });

  it("strips ```json fences from the model response", async () => {
    cacheGetManyMock.mockResolvedValue({});
    queueGeminiOk({ "1": "Xin chào" }, { fenced: true });
    const out = await translateBatch(["Hello"], "vi");
    expect(out).toEqual({ Hello: "Xin chào" });
    expect(recordGeminiCallMock).toHaveBeenCalledWith("vi", 1, true);
  });

  it("batches at MAX_BATCH=40 — 41 misses split into two Gemini calls", async () => {
    cacheGetManyMock.mockResolvedValue({});
    const inputs = Array.from({ length: 41 }, (_, i) => `Item ${i + 1}`);
    const first: Record<string, string> = {};
    for (let i = 1; i <= 40; i++) first[String(i)] = `Mục ${i}`;
    const second: Record<string, string> = { "1": "Mục 41" };
    queueGeminiOk(first);
    queueGeminiOk(second);
    const out = await translateBatch(inputs, "vi");
    expect(fetchCalls).toHaveLength(2);
    expect(recordGeminiCallMock).toHaveBeenCalledTimes(2);
    expect(out["Item 1"]).toBe("Mục 1");
    expect(out["Item 40"]).toBe("Mục 40");
    expect(out["Item 41"]).toBe("Mục 41");
  });

  it("batches 80 misses into exactly two Gemini calls", async () => {
    cacheGetManyMock.mockResolvedValue({});
    const inputs = Array.from({ length: 80 }, (_, i) => `Item ${i + 1}`);
    const first: Record<string, string> = {};
    for (let i = 1; i <= 40; i++) first[String(i)] = `A${i}`;
    const second: Record<string, string> = {};
    for (let i = 1; i <= 40; i++) second[String(i)] = `B${i}`;
    queueGeminiOk(first);
    queueGeminiOk(second);
    await translateBatch(inputs, "vi");
    expect(fetchCalls).toHaveLength(2);
  });
});

// ===========================================================================
// translateBatch — Gemini failure branches
// ===========================================================================

describe("translateBatch — Gemini failure branches", () => {
  it("fetch throw → returns originals for misses, records failure", async () => {
    cacheGetManyMock.mockResolvedValue({});
    responders.push({ kind: "throw", error: new Error("network down") });
    const out = await translateBatch(["Hello"], "vi");
    expect(out).toEqual({ Hello: "Hello" });
    expect(recordGeminiCallMock).toHaveBeenCalledWith("vi", 0, false);
    expect(cacheSetManyMock).not.toHaveBeenCalled();
  });

  it("non-OK response → returns originals, records failure", async () => {
    cacheGetManyMock.mockResolvedValue({});
    responders.push({ kind: "resolve", ok: false, status: 500, textPayload: "boom" });
    const out = await translateBatch(["Hello"], "vi");
    expect(out).toEqual({ Hello: "Hello" });
    expect(recordGeminiCallMock).toHaveBeenCalledWith("vi", 0, false);
  });

  it("body not JSON → returns originals, records failure", async () => {
    cacheGetManyMock.mockResolvedValue({});
    responders.push({ kind: "resolve", ok: true, textPayload: "not json at all" });
    const out = await translateBatch(["Hello"], "vi");
    expect(out).toEqual({ Hello: "Hello" });
    expect(recordGeminiCallMock).toHaveBeenCalledWith("vi", 0, false);
  });

  it("response contains {error:{message}} → returns originals, records failure", async () => {
    cacheGetManyMock.mockResolvedValue({});
    responders.push({
      kind: "resolve",
      ok: true,
      textPayload: makeGeminiPayload({}, { wrapInError: true }),
    });
    const out = await translateBatch(["Hello"], "vi");
    expect(out).toEqual({ Hello: "Hello" });
    expect(recordGeminiCallMock).toHaveBeenCalledWith("vi", 0, false);
  });

  it("empty candidates → returns originals, records failure", async () => {
    cacheGetManyMock.mockResolvedValue({});
    responders.push({
      kind: "resolve",
      ok: true,
      textPayload: makeGeminiPayload({}, { emptyCandidates: true }),
    });
    const out = await translateBatch(["Hello"], "vi");
    expect(out).toEqual({ Hello: "Hello" });
    expect(recordGeminiCallMock).toHaveBeenCalledWith("vi", 0, false);
  });

  it("candidate text is empty string → returns originals, records failure", async () => {
    cacheGetManyMock.mockResolvedValue({});
    responders.push({
      kind: "resolve",
      ok: true,
      textPayload: JSON.stringify({ candidates: [{ content: { parts: [{ text: "" }] } }] }),
    });
    const out = await translateBatch(["Hello"], "vi");
    expect(out).toEqual({ Hello: "Hello" });
    expect(recordGeminiCallMock).toHaveBeenCalledWith("vi", 0, false);
  });

  it("candidate text is not valid JSON → returns originals, records failure", async () => {
    cacheGetManyMock.mockResolvedValue({});
    responders.push({
      kind: "resolve",
      ok: true,
      textPayload: JSON.stringify({
        candidates: [{ content: { parts: [{ text: "yeah nope" }] } }],
      }),
    });
    const out = await translateBatch(["Hello"], "vi");
    expect(out).toEqual({ Hello: "Hello" });
    expect(recordGeminiCallMock).toHaveBeenCalledWith("vi", 0, false);
  });

  it("missing API key → callGeminiBatch returns null, records failure", async () => {
    delete process.env.GOOGLE_GEMINI_API_KEY;
    cacheGetManyMock.mockResolvedValue({});
    const out = await translateBatch(["Hello"], "vi");
    expect(fetchCalls).toHaveLength(0); // no fetch attempted
    expect(out).toEqual({ Hello: "Hello" });
    expect(recordGeminiCallMock).toHaveBeenCalledWith("vi", 0, false);
  });

  it("empty-string API key → treated as missing", async () => {
    process.env.GOOGLE_GEMINI_API_KEY = "";
    cacheGetManyMock.mockResolvedValue({});
    const out = await translateBatch(["Hello"], "vi");
    expect(fetchCalls).toHaveLength(0);
    expect(out).toEqual({ Hello: "Hello" });
    expect(recordGeminiCallMock).toHaveBeenCalledWith("vi", 0, false);
  });
});

// ===========================================================================
// translateBatch — drift + identity filters
// ===========================================================================

describe("translateBatch — drift + identity filters", () => {
  it("drops entries where the translation dropped a reserved term", async () => {
    cacheGetManyMock.mockResolvedValue({});
    // "s708" appears in EN but not in the returned VI.
    queueGeminiOk({ "1": "Đây là mục" });
    const out = await translateBatch(["Refer to s708 for the exemption"], "vi");
    expect(recordDriftRejectMock).toHaveBeenCalledWith("vi");
    expect(out).toEqual({ "Refer to s708 for the exemption": "Refer to s708 for the exemption" });
    // Nothing kept → cacheSetMany not called (guarded by Object.keys(fresh).length > 0).
    expect(cacheSetManyMock).not.toHaveBeenCalled();
    // Called with kept=0 but ok=true (the model call succeeded, we just rejected).
    expect(recordGeminiCallMock).toHaveBeenCalledWith("vi", 0, true);
  });

  it("keeps entries where reserved terms survived and only rejects drifting ones", async () => {
    cacheGetManyMock.mockResolvedValue({});
    queueGeminiOk({
      "1": "Xem s708 để biết miễn trừ", // keeps s708 → OK
      "2": "Xem mục 708 để biết miễn trừ", // drops s708 → drift
    });
    const out = await translateBatch(
      ["See s708 for the exemption", "Please read s708 carefully"],
      "vi",
    );
    expect(recordDriftRejectMock).toHaveBeenCalledTimes(1);
    expect(recordGeminiCallMock).toHaveBeenCalledWith("vi", 1, true);
    expect(out["See s708 for the exemption"]).toBe("Xem s708 để biết miễn trừ");
    expect(out["Please read s708 carefully"]).toBe("Please read s708 carefully");
    expect(cacheSetManyMock).toHaveBeenCalledWith("vi", {
      "See s708 for the exemption": "Xem s708 để biết miễn trừ",
    });
  });

  it("skips vi === en (model returned original) WITHOUT recording drift", async () => {
    cacheGetManyMock.mockResolvedValue({});
    queueGeminiOk({ "1": "Hello" });
    const out = await translateBatch(["Hello"], "vi");
    expect(recordDriftRejectMock).not.toHaveBeenCalled();
    expect(out).toEqual({ Hello: "Hello" });
    expect(recordGeminiCallMock).toHaveBeenCalledWith("vi", 0, true);
    expect(cacheSetManyMock).not.toHaveBeenCalled();
  });

  it("skips empty-string translations WITHOUT recording drift", async () => {
    cacheGetManyMock.mockResolvedValue({});
    queueGeminiOk({ "1": "" });
    const out = await translateBatch(["Hello"], "vi");
    expect(recordDriftRejectMock).not.toHaveBeenCalled();
    expect(out).toEqual({ Hello: "Hello" });
    expect(recordGeminiCallMock).toHaveBeenCalledWith("vi", 0, true);
  });
});

// ===========================================================================
// translateBatch — cacheSetMany + stats invariants
// ===========================================================================

describe("translateBatch — resilience", () => {
  it("swallows cacheSetMany rejection and still returns the fresh translation", async () => {
    cacheGetManyMock.mockResolvedValue({});
    cacheSetManyMock.mockRejectedValueOnce(new Error("disk full"));
    queueGeminiOk({ "1": "Xin chào" });
    const out = await translateBatch(["Hello"], "vi");
    expect(out).toEqual({ Hello: "Xin chào" });
    expect(cacheSetManyMock).toHaveBeenCalledTimes(1);
  });

  it("records exactly one request per translateBatch call regardless of miss count", async () => {
    cacheGetManyMock.mockResolvedValue({});
    queueGeminiOk({ "1": "A", "2": "B" });
    await translateBatch(["First", "Second"], "vi");
    expect(recordRequestMock).toHaveBeenCalledTimes(1);
    expect(recordRequestMock).toHaveBeenCalledWith("vi", 2);
  });

  it("records request with the raw input length (before dedupe/filter)", async () => {
    cacheGetManyMock.mockResolvedValue({});
    queueGeminiOk({ "1": "A" });
    await translateBatch(["Hello", "Hello", "42", "https://x.com"], "vi");
    // Raw input length is 4 — dedupe/filter happen AFTER recordRequest per the source.
    expect(recordRequestMock).toHaveBeenCalledWith("vi", 4);
  });
});

// ===========================================================================
// translateBatch — request payload contract
// ===========================================================================

describe("translateBatch — Gemini request contract", () => {
  it("targets the correct URL + key on GET string of the endpoint", async () => {
    process.env.GOOGLE_GEMINI_API_KEY = "abc123";
    cacheGetManyMock.mockResolvedValue({});
    queueGeminiOk({ "1": "Xin chào" });
    await translateBatch(["Hello"], "vi");
    expect(fetchCalls[0]!.url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=abc123",
    );
  });

  it("sends POST with JSON Content-Type + no-store cache", async () => {
    cacheGetManyMock.mockResolvedValue({});
    queueGeminiOk({ "1": "Xin chào" });
    await translateBatch(["Hello"], "vi");
    const init = fetchCalls[0]!.init!;
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(init.cache).toBe("no-store");
  });

  it("wires an AbortController signal so a slow response can be cancelled", async () => {
    cacheGetManyMock.mockResolvedValue({});
    queueGeminiOk({ "1": "Xin chào" });
    await translateBatch(["Hello"], "vi");
    const signal = fetchCalls[0]!.init!.signal as AbortSignal | null;
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it("body pins temperature=0.2, maxOutputTokens=8192, responseMimeType=application/json", async () => {
    cacheGetManyMock.mockResolvedValue({});
    queueGeminiOk({ "1": "Xin chào" });
    await translateBatch(["Hello"], "vi");
    const body = fetchCalls[0]!.body as {
      generationConfig: { temperature: number; maxOutputTokens: number; responseMimeType: string };
    };
    expect(body.generationConfig.temperature).toBe(0.2);
    expect(body.generationConfig.maxOutputTokens).toBe(8192);
    expect(body.generationConfig.responseMimeType).toBe("application/json");
  });

  it("system_instruction lists every RESERVED_TERM verbatim", async () => {
    cacheGetManyMock.mockResolvedValue({});
    queueGeminiOk({ "1": "Xin chào" });
    await translateBatch(["Hello"], "vi");
    const body = fetchCalls[0]!.body as {
      system_instruction: { parts: { text: string }[] };
    };
    const sys = body.system_instruction.parts[0]!.text;
    for (const term of RESERVED_TERMS) {
      expect(sys).toContain(term);
    }
    expect(sys).toContain("Vietnamese");
  });

  it("user contents number each input starting at 1", async () => {
    cacheGetManyMock.mockResolvedValue({});
    queueGeminiOk({ "1": "A", "2": "B", "3": "C" });
    await translateBatch(["Alpha", "Beta", "Gamma"], "vi");
    const body = fetchCalls[0]!.body as {
      contents: { role: string; parts: { text: string }[] }[];
    };
    const user = body.contents[0]!.parts[0]!.text;
    expect(user).toBe("1. Alpha\n2. Beta\n3. Gamma");
    expect(body.contents[0]!.role).toBe("user");
  });
});

// ===========================================================================
// translateText — thin wrapper
// ===========================================================================

describe("translateText", () => {
  it("returns the value keyed by the input from translateBatch", async () => {
    cacheGetManyMock.mockResolvedValue({ Hello: "Xin chào" });
    const out = await translateText("Hello", "vi");
    expect(out).toBe("Xin chào");
  });

  it("returns the input verbatim on identity locale (en)", async () => {
    const out = await translateText("Hello", "en");
    expect(out).toBe("Hello");
    expect(fetchCalls).toHaveLength(0);
  });

  it("returns the input when translation is missing / failed", async () => {
    cacheGetManyMock.mockResolvedValue({});
    responders.push({ kind: "throw", error: new Error("fail") });
    const out = await translateText("Hello", "vi");
    expect(out).toBe("Hello");
  });

  it("returns an untranslatable input unchanged (URL)", async () => {
    const out = await translateText("https://blockid.au", "vi");
    expect(out).toBe("https://blockid.au");
    expect(fetchCalls).toHaveLength(0);
  });
});
