// Colocated vitest for `use-pricing-experiment.ts` — the client-side
// consumer hook for the T0206 pricing experiment harness.
//
// The hook is small (~140 lines) but user-visible in the wallet — a
// regression here silently breaks A/B-tested CTAs across the pricing and
// checkout pages. Guarded contracts:
//
//   (a) session bucketing is stable per browser via `localStorage` — the
//       initial-state lazy function must not resample under StrictMode's
//       double render; a stale `sid-*` fallback must be used when the
//       storage layer throws (private-mode Safari).
//   (b) the assign fetch must URL-encode the experiment + bucket into the
//       query string, pass `cache: no-store` (so a stale CDN copy can't
//       ship the wrong variant), and pass an AbortController signal so a
//       fast unmount doesn't leak a resolved-after-unmount `setState`.
//   (c) `res.ok=false` (404 = experiment paused/removed) must silently
//       fall back to the caller's hard-coded control — impression must NOT
//       fire, variantKey must stay null. A broken experiment must never
//       take a pricing surface down.
//   (d) impression must fire exactly once per successful assign, POSTed
//       with `keepalive: true` so a near-immediate navigation triggered
//       by the CTA under test still records; failure of the impression
//       fetch is swallowed (public hot path, must not throw).
//   (e) `recordConversion` must no-op when variantKey is null (unassigned
//       user), and when firing must POST the {experiment, variantKey,
//       type: 'conversion', sessionId, valueAud} payload.
//
// The React runtime is not present in the vitest node env so `useState`
// and `useEffect` are shimmed via a tiny cell-based fake that lets tests
// re-render the hook and observe state transitions across the resolved
// assign fetch — much like `renderHook` from @testing-library/react but
// zero-dependency.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── React shim (useState + useEffect via cells) ──────────────────────

interface Cell {
  value: unknown;
}

let cells: Cell[] = [];
let cursor = 0;
let mountEffectsRun = false;
const effectCleanups: Array<() => void> = [];

vi.mock("react", () => ({
  useState: <T,>(
    init: T | (() => T),
  ): [T, (v: T | ((prev: T) => T)) => void] => {
    let cell: Cell;
    if (cursor >= cells.length) {
      const initialValue =
        typeof init === "function" ? (init as () => T)() : init;
      cell = { value: initialValue };
      cells.push(cell);
    } else {
      cell = cells[cursor];
    }
    cursor++;
    return [
      cell.value as T,
      (v: T | ((prev: T) => T)) => {
        cell.value =
          typeof v === "function"
            ? (v as (prev: T) => T)(cell.value as T)
            : v;
      },
    ];
  },
  useEffect: (
    fn: () => void | (() => void),
    _deps: unknown[] | undefined,
  ) => {
    // Mount-only semantics: the first render invokes the effect and captures
    // its cleanup; subsequent re-renders skip so tests can drive multiple
    // renders without re-triggering the fetch.
    if (mountEffectsRun) return;
    mountEffectsRun = true;
    const c = fn();
    if (typeof c === "function") effectCleanups.push(c);
  },
}));

// eslint-disable-next-line import/first
import { usePricingExperiment } from "./use-pricing-experiment";

function resetHookState(): void {
  cells = [];
  cursor = 0;
  mountEffectsRun = false;
  effectCleanups.length = 0;
}

function renderHook<T>(fn: () => T): T {
  cursor = 0;
  return fn();
}

function seedCells(
  sessionId: string,
  variantKey: string | null,
  payload: unknown,
  loading: boolean,
): void {
  cells = [
    { value: sessionId },
    { value: variantKey },
    { value: payload },
    { value: loading },
  ];
}

async function flushMicrotasks(times = 8): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

// ── globals: fetch, window/localStorage, crypto ──────────────────────

interface FakeStorage {
  store: Map<string, string>;
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

let fetchMock: ReturnType<typeof vi.fn>;
let storage: FakeStorage;

function installStorage(): FakeStorage {
  const store = new Map<string, string>();
  storage = {
    store,
    getItem(k) {
      return store.has(k) ? (store.get(k) as string) : null;
    },
    setItem(k, v) {
      store.set(k, v);
    },
    removeItem(k) {
      store.delete(k);
    },
  };
  return storage;
}

function installWindow(): void {
  (globalThis as { window?: unknown }).window = { localStorage: storage };
}

function uninstallWindow(): void {
  delete (globalThis as { window?: unknown }).window;
}

function installCryptoWithRandomUUID(uuid: string): void {
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: { randomUUID: () => uuid },
  });
}

function installCryptoWithoutRandomUUID(): void {
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: {},
  });
}

function jsonResponse(body: unknown, init?: { ok?: boolean; status?: number }) {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: async () => body,
  };
}

beforeEach(() => {
  resetHookState();
  installStorage();
  installWindow();
  installCryptoWithRandomUUID("uuid-fixed-0001");
  fetchMock = vi.fn();
  (globalThis as { fetch?: unknown }).fetch = fetchMock;
});

afterEach(() => {
  for (const c of effectCleanups.splice(0)) c();
  uninstallWindow();
  delete (globalThis as { fetch?: unknown }).fetch;
});

// ── session id / bucketing ───────────────────────────────────────────

describe("usePricingExperiment — session id / bucketing", () => {
  it("first mount generates a UUID via crypto.randomUUID and persists it to localStorage", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: false }, { ok: false }));
    renderHook(() => usePricingExperiment("exp-a"));
    await flushMicrotasks();
    expect(storage.store.get("blockid_exp_sid")).toBe("uuid-fixed-0001");
  });

  it("re-mount reuses the existing localStorage session id (no new UUID)", async () => {
    storage.store.set("blockid_exp_sid", "prev-sid-xyz");
    installCryptoWithRandomUUID("SHOULD-NOT-USE");
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: false }, { ok: false }));
    renderHook(() => usePricingExperiment("exp-a"));
    await flushMicrotasks();
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("bucket=prev-sid-xyz");
    expect(storage.store.get("blockid_exp_sid")).toBe("prev-sid-xyz");
  });

  it("when crypto.randomUUID is unavailable, falls back to a `sid-*` id", async () => {
    installCryptoWithoutRandomUUID();
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: false }, { ok: false }));
    renderHook(() => usePricingExperiment("exp-a"));
    await flushMicrotasks();
    const stored = storage.store.get("blockid_exp_sid");
    expect(stored).toMatch(/^sid-/);
  });

  it("when localStorage.getItem throws (private-mode Safari), falls back to a `sid-*` in-memory id", async () => {
    storage.getItem = () => {
      throw new Error("QuotaExceededError");
    };
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: false }, { ok: false }));
    renderHook(() => usePricingExperiment("exp-a"));
    await flushMicrotasks();
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toMatch(/bucket=sid-/);
  });

  it("when `window` is undefined at initializer time, sessionId is 'ssr-placeholder'", async () => {
    uninstallWindow();
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: false }, { ok: false }));
    renderHook(() => usePricingExperiment("exp-a"));
    await flushMicrotasks();
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("bucket=ssr-placeholder");
    installWindow(); // restore for afterEach
  });
});

// ── assign fetch — request shape ─────────────────────────────────────

describe("usePricingExperiment — assign fetch request", () => {
  it("fetches /api/pricing-test/assign with experiment + bucket query params", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: false }, { ok: false }));
    renderHook(() => usePricingExperiment("checkout-cta"));
    await flushMicrotasks();
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url.startsWith("/api/pricing-test/assign?")).toBe(true);
    expect(url).toContain("experiment=checkout-cta");
    expect(url).toContain("bucket=uuid-fixed-0001");
  });

  it("URL-encodes the experiment name (spaces + slashes must not break the query)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: false }, { ok: false }));
    renderHook(() => usePricingExperiment("pricing v2/hero"));
    await flushMicrotasks();
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("experiment=pricing%20v2%2Fhero");
  });

  it("passes cache: 'no-store' — no stale CDN copy can serve the wrong variant", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: false }, { ok: false }));
    renderHook(() => usePricingExperiment("exp-a"));
    await flushMicrotasks();
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.cache).toBe("no-store");
  });

  it("passes an AbortController signal so unmount cancels the in-flight assign", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: false }, { ok: false }));
    renderHook(() => usePricingExperiment("exp-a"));
    await flushMicrotasks();
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeDefined();
    expect((init.signal as AbortSignal).aborted).toBe(false);
  });
});

// ── assign fetch — response handling ─────────────────────────────────

describe("usePricingExperiment — assign response handling", () => {
  it("res.ok=false (experiment paused/removed) leaves variantKey null and stops loading", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: false }, { ok: false, status: 404 }),
    );
    const first = renderHook(() => usePricingExperiment("exp-a"));
    expect(first.variantKey).toBeNull();
    expect(first.loading).toBe(true);
    await flushMicrotasks();
    const after = renderHook(() => usePricingExperiment("exp-a"));
    expect(after.variantKey).toBeNull();
    expect(after.payload).toBeNull();
    expect(after.loading).toBe(false);
  });

  it("res.ok=false does NOT fire the impression POST (broken experiment stays silent)", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: false }, { ok: false, status: 404 }),
    );
    renderHook(() => usePricingExperiment("exp-a"));
    await flushMicrotasks();
    const eventCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("/api/pricing-test/event"),
    );
    expect(eventCalls).toHaveLength(0);
  });

  it("ok=true + string variantKey sets variantKey + payload on the next render", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, variantKey: "B", payload: { headline: "Hi" } }),
    );
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    renderHook(() => usePricingExperiment("exp-a"));
    await flushMicrotasks();
    const after = renderHook(() =>
      usePricingExperiment<{ headline: string }>("exp-a"),
    );
    expect(after.variantKey).toBe("B");
    expect(after.payload).toEqual({ headline: "Hi" });
    expect(after.loading).toBe(false);
  });

  it("ok=true with a NON-string variantKey does not set variantKey (silent fallback)", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, variantKey: 42, payload: { x: 1 } }),
    );
    renderHook(() => usePricingExperiment("exp-a"));
    await flushMicrotasks();
    const after = renderHook(() => usePricingExperiment("exp-a"));
    expect(after.variantKey).toBeNull();
    expect(after.payload).toBeNull();
  });

  it("ok=false in body with a string variantKey does NOT set variantKey", async () => {
    // Response is HTTP-200 but the server contract says `ok` is the source of
    // truth — a false here means "no assignment, control".
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: false, variantKey: "B", payload: { x: 1 } }),
    );
    renderHook(() => usePricingExperiment("exp-a"));
    await flushMicrotasks();
    const after = renderHook(() => usePricingExperiment("exp-a"));
    expect(after.variantKey).toBeNull();
  });

  it("ok=true + variantKey but missing payload → payload stays null", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, variantKey: "B" }),
    );
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    renderHook(() => usePricingExperiment("exp-a"));
    await flushMicrotasks();
    const after = renderHook(() => usePricingExperiment("exp-a"));
    expect(after.variantKey).toBe("B");
    expect(after.payload).toBeNull();
  });

  it("a rejected assign fetch stops loading without throwing", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network gone"));
    renderHook(() => usePricingExperiment("exp-a"));
    await flushMicrotasks();
    const after = renderHook(() => usePricingExperiment("exp-a"));
    expect(after.loading).toBe(false);
    expect(after.variantKey).toBeNull();
  });
});

// ── impression fetch ─────────────────────────────────────────────────

describe("usePricingExperiment — impression fetch", () => {
  it("fires POST /api/pricing-test/event with method + Content-Type + keepalive on successful assign", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, variantKey: "B", payload: {} }),
    );
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    renderHook(() => usePricingExperiment("exp-a"));
    await flushMicrotasks();
    const impression = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes("/api/pricing-test/event"),
    );
    expect(impression).toBeDefined();
    const init = impression![1] as RequestInit;
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
    expect(init.keepalive).toBe(true);
  });

  it("impression body carries {experiment, variantKey, type: 'impression', sessionId}", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, variantKey: "B", payload: {} }),
    );
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    renderHook(() => usePricingExperiment("exp-a"));
    await flushMicrotasks();
    const impression = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes("/api/pricing-test/event"),
    );
    const body = JSON.parse(
      (impression![1] as RequestInit).body as string,
    ) as Record<string, unknown>;
    expect(body).toMatchObject({
      experiment: "exp-a",
      variantKey: "B",
      type: "impression",
      sessionId: "uuid-fixed-0001",
    });
  });

  it("a rejected impression fetch is swallowed and does NOT crash the hook", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, variantKey: "B", payload: {} }),
    );
    fetchMock.mockRejectedValueOnce(new Error("beacon dropped"));
    renderHook(() => usePricingExperiment("exp-a"));
    await expect(flushMicrotasks()).resolves.not.toThrow();
    const after = renderHook(() => usePricingExperiment("exp-a"));
    expect(after.variantKey).toBe("B");
  });
});

// ── cleanup / abort ──────────────────────────────────────────────────

describe("usePricingExperiment — cleanup on unmount", () => {
  it("cleanup aborts the AbortController — a late fetch resolution cannot leak setState", async () => {
    let capturedInit: RequestInit | undefined;
    fetchMock.mockImplementationOnce((_url: string, init?: RequestInit) => {
      capturedInit = init;
      // Never resolve — cleanup will race in first.
      return new Promise(() => {});
    });
    renderHook(() => usePricingExperiment("exp-a"));
    // Fire cleanup manually — simulates React unmount.
    for (const c of effectCleanups.splice(0)) c();
    expect((capturedInit!.signal as AbortSignal).aborted).toBe(true);
  });

  it("if the assign resolves AFTER cleanup, variantKey stays null (cancelled guard)", async () => {
    let resolveIt: (r: unknown) => void = () => {};
    fetchMock.mockImplementationOnce(
      () => new Promise((r) => (resolveIt = r)),
    );
    renderHook(() => usePricingExperiment("exp-a"));
    // Cleanup before the fetch resolves.
    for (const c of effectCleanups.splice(0)) c();
    resolveIt(jsonResponse({ ok: true, variantKey: "B", payload: { x: 1 } }));
    await flushMicrotasks();
    const after = renderHook(() => usePricingExperiment("exp-a"));
    expect(after.variantKey).toBeNull();
    expect(after.payload).toBeNull();
    // Because the cancelled guard bails BEFORE setLoading(false), loading
    // stays at its initial `true` — pin so a future refactor that moves the
    // guard past setLoading is caught.
    expect(after.loading).toBe(true);
  });
});

// ── recordConversion ─────────────────────────────────────────────────

describe("usePricingExperiment — recordConversion", () => {
  it("no-ops when variantKey is null (unassigned user) — no event fetch", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: false }, { ok: false }));
    const hook = renderHook(() => usePricingExperiment("exp-a"));
    await flushMicrotasks();
    const before = fetchMock.mock.calls.length;
    hook.recordConversion(99);
    expect(fetchMock.mock.calls.length).toBe(before);
  });

  it("when variantKey is set, POSTs /api/pricing-test/event with the conversion payload", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: false }, { ok: false }));
    seedCells("sid-42", "B", { x: 1 }, false);
    const hook = renderHook(() => usePricingExperiment("exp-a"));
    hook.recordConversion(19.95);
    const conversion = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes("/api/pricing-test/event"),
    );
    expect(conversion).toBeDefined();
    const init = conversion![1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.keepalive).toBe(true);
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toEqual({
      experiment: "exp-a",
      variantKey: "B",
      type: "conversion",
      sessionId: "sid-42",
      valueAud: 19.95,
    });
  });

  it("omitted valueAud is serialised as undefined (no key in the JSON body)", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: false }, { ok: false }));
    seedCells("sid-42", "B", null, false);
    const hook = renderHook(() => usePricingExperiment("exp-a"));
    hook.recordConversion();
    const conversion = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes("/api/pricing-test/event"),
    );
    const raw = (conversion![1] as RequestInit).body as string;
    const body = JSON.parse(raw) as Record<string, unknown>;
    // JSON.stringify drops undefined values, so the key must NOT be present.
    expect("valueAud" in body).toBe(false);
    expect(body.type).toBe("conversion");
  });

  it("a rejected conversion fetch is swallowed (public hot path — never throws)", async () => {
    fetchMock.mockRejectedValue(new Error("network gone"));
    seedCells("sid-42", "B", null, false);
    const hook = renderHook(() => usePricingExperiment("exp-a"));
    expect(() => hook.recordConversion(1)).not.toThrow();
    await expect(flushMicrotasks()).resolves.not.toThrow();
  });
});

// ── return shape ─────────────────────────────────────────────────────

describe("usePricingExperiment — return shape", () => {
  it("returns {variantKey, payload, loading, recordConversion}", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: false }, { ok: false }));
    const hook = renderHook(() => usePricingExperiment("exp-a"));
    expect(Object.keys(hook).sort()).toEqual(
      ["loading", "payload", "recordConversion", "variantKey"].sort(),
    );
    expect(typeof hook.recordConversion).toBe("function");
    expect(hook.variantKey).toBeNull();
    expect(hook.payload).toBeNull();
    expect(hook.loading).toBe(true);
  });
});
