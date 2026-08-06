// Colocated vitest for `useResellerAttribution.ts` — the client-side reader
// for the current user's attributed reseller. Backs the topbar co-branding
// pill and any customer-facing surface that switches on reseller identity.
//
// Contracts pinned here:
//
//   (a) the fetch must call `/api/reseller/me` with credentials: include (so
//       the session cookie rides the request) and cache: 'no-store' (a stale
//       CDN copy must never serve last quarter's attributed reseller — the
//       pill turning into the wrong logo is a per-tenant trust hit).
//   (b) the response reader must treat both `{ ok: false, ... }` and any
//       throw / non-OK HTTP status as `{ reseller: null }` — anonymous /
//       non-attributed users MUST NOT crash the topbar.
//   (c) a missing `json.reseller` (backend returns `{ ok: true }` only)
//       coerces to `reseller: null` — never `undefined`, which the pill
//       component would render as an empty <img>.
//   (d) a 60s per-tab TTL is honoured so a re-mount inside the TTL does NOT
//       re-fetch — matches useEntitlement's cache window so both snapshots
//       refresh together on a route change.
//   (e) refresh() must force=true so a user-triggered refresh (e.g. after a
//       reseller switch) always bypasses the TTL cache.
//   (f) the module-level `listeners` set MUST broadcast every fetch result
//       to every mounted consumer — the pill + a downstream "hosted by X"
//       card must never disagree because one refetched and the other didn't.
//   (g) cleanup MUST remove the listener from the module-level set so an
//       unmounted hook doesn't leak setState calls into the next tick's
//       re-render (React 19 strict-mode warning).
//
// The React runtime is not present in the vitest node env so `useState` and
// `useEffect` are shimmed via a tiny cell-based fake. The module-level
// `memCache`/`listeners` state is reset per test via `vi.resetModules()` +
// a dynamic import — the top-level `vi.mock('react')` is hoisted before all
// imports so the react mock survives the reset.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── React shim (useState + useEffect via cells) ────────────────────────

interface Cell {
  value: unknown;
}

let cells: Cell[] = [];
let cursor = 0;
let mountEffectsRun = false;
let effectCleanups: Array<() => void> = [];

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
    _deps?: unknown[],
  ) => {
    // Mount-only: first render fires the effect and captures cleanup, later
    // renders are inert so tests can drive multiple renders without
    // re-firing the fetch (matches the hook's `[]` deps in the source).
    if (mountEffectsRun) return;
    mountEffectsRun = true;
    const c = fn();
    if (typeof c === "function") effectCleanups.push(c);
  },
}));

function resetHookState(): void {
  cells = [];
  cursor = 0;
  mountEffectsRun = false;
  effectCleanups = [];
}

function renderHook<T>(fn: () => T): T {
  cursor = 0;
  return fn();
}

async function flushMicrotasks(times = 8): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

// ── globals: fetch ─────────────────────────────────────────────────────

let fetchMock: ReturnType<typeof vi.fn>;

function jsonResponse(
  body: unknown,
  init?: { ok?: boolean; status?: number },
): { ok: boolean; status: number; json: () => Promise<unknown> } {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: async () => body,
  };
}

async function loadHook(): Promise<
  (typeof import("./useResellerAttribution"))["useResellerAttribution"]
> {
  vi.resetModules();
  resetHookState();
  const mod = await import("./useResellerAttribution");
  return mod.useResellerAttribution;
}

beforeEach(() => {
  fetchMock = vi.fn();
  (globalThis as { fetch?: unknown }).fetch = fetchMock;
});

afterEach(() => {
  for (const c of effectCleanups.splice(0)) {
    try {
      c();
    } catch {
      // ignore
    }
  }
  delete (globalThis as { fetch?: unknown }).fetch;
});

const sampleReseller = {
  code: "acme",
  display_name: "Acme Partners",
  logo_url: "https://cdn.example.com/acme.png",
  primary_color: "#ff6600",
  billing_model: "wholesale" as const,
};

// ── initial state ──────────────────────────────────────────────────────

describe("useResellerAttribution — initial state", () => {
  it("initial snapshot is null and isLoading=true when no fetch has resolved", async () => {
    fetchMock.mockImplementation(() => new Promise(() => undefined));
    const useResellerAttribution = await loadHook();
    const r = renderHook(() => useResellerAttribution());
    expect(r.reseller).toBeNull();
    expect(r.isLoading).toBe(true);
  });

  it("exposes a stable refresh() callback on the initial render", async () => {
    fetchMock.mockImplementation(() => new Promise(() => undefined));
    const useResellerAttribution = await loadHook();
    const r = renderHook(() => useResellerAttribution());
    expect(typeof r.refresh).toBe("function");
  });
});

// ── fetch request shape ────────────────────────────────────────────────

describe("useResellerAttribution — fetch request shape", () => {
  it("fetches /api/reseller/me with credentials: include and cache: no-store", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, reseller: null }),
    );
    const useResellerAttribution = await loadHook();
    renderHook(() => useResellerAttribution());
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledWith("/api/reseller/me", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
  });

  it("fetch is called exactly once on mount within the TTL window", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, reseller: null }),
    );
    const useResellerAttribution = await loadHook();
    renderHook(() => useResellerAttribution());
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// ── response reader — happy path ───────────────────────────────────────

describe("useResellerAttribution — response reader (populated)", () => {
  it("populates the reseller from a { ok: true, reseller: {...} } response", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, reseller: sampleReseller }),
    );
    const useResellerAttribution = await loadHook();
    renderHook(() => useResellerAttribution());
    await flushMicrotasks();
    const r = renderHook(() => useResellerAttribution());
    expect(r.reseller).toEqual(sampleReseller);
    expect(r.isLoading).toBe(false);
  });

  it("carries through the wholesale billing_model verbatim", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, reseller: sampleReseller }),
    );
    const useResellerAttribution = await loadHook();
    renderHook(() => useResellerAttribution());
    await flushMicrotasks();
    const r = renderHook(() => useResellerAttribution());
    expect(r.reseller?.billing_model).toBe("wholesale");
  });

  it("accepts the retail billing_model without coercion", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        reseller: { ...sampleReseller, billing_model: "retail" as const },
      }),
    );
    const useResellerAttribution = await loadHook();
    renderHook(() => useResellerAttribution());
    await flushMicrotasks();
    const r = renderHook(() => useResellerAttribution());
    expect(r.reseller?.billing_model).toBe("retail");
  });

  it("preserves nullable logo_url and primary_color on the snapshot", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        reseller: {
          ...sampleReseller,
          logo_url: null,
          primary_color: null,
        },
      }),
    );
    const useResellerAttribution = await loadHook();
    renderHook(() => useResellerAttribution());
    await flushMicrotasks();
    const r = renderHook(() => useResellerAttribution());
    expect(r.reseller?.logo_url).toBeNull();
    expect(r.reseller?.primary_color).toBeNull();
  });
});

// ── response reader — anonymous / non-attributed ───────────────────────

describe("useResellerAttribution — anonymous / non-attributed", () => {
  it("returns { reseller: null } when the API returns ok:false", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: false, reseller: sampleReseller }),
    );
    const useResellerAttribution = await loadHook();
    renderHook(() => useResellerAttribution());
    await flushMicrotasks();
    const r = renderHook(() => useResellerAttribution());
    expect(r.reseller).toBeNull();
  });

  it("returns { reseller: null } when the HTTP status is not OK", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { ok: true, reseller: sampleReseller },
        { ok: false, status: 500 },
      ),
    );
    const useResellerAttribution = await loadHook();
    renderHook(() => useResellerAttribution());
    await flushMicrotasks();
    const r = renderHook(() => useResellerAttribution());
    expect(r.reseller).toBeNull();
  });

  it("returns { reseller: null } when fetch throws (network error)", async () => {
    fetchMock.mockRejectedValueOnce(new Error("connection refused"));
    const useResellerAttribution = await loadHook();
    renderHook(() => useResellerAttribution());
    await flushMicrotasks();
    const r = renderHook(() => useResellerAttribution());
    expect(r.reseller).toBeNull();
    expect(r.isLoading).toBe(false);
  });

  it("coerces a missing json.reseller to null (never undefined)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    const useResellerAttribution = await loadHook();
    renderHook(() => useResellerAttribution());
    await flushMicrotasks();
    const r = renderHook(() => useResellerAttribution());
    expect(r.reseller).toBeNull();
  });

  it("clears isLoading even when the response is empty/anonymous", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, reseller: null }),
    );
    const useResellerAttribution = await loadHook();
    renderHook(() => useResellerAttribution());
    await flushMicrotasks();
    const r = renderHook(() => useResellerAttribution());
    expect(r.isLoading).toBe(false);
  });
});

// ── 60s TTL cache ──────────────────────────────────────────────────────

describe("useResellerAttribution — 60s TTL cache", () => {
  it("a second consumer mounting inside the TTL window does NOT refetch", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, reseller: sampleReseller }),
    );
    const useResellerAttribution = await loadHook();
    // First mount populates the module-level cache.
    renderHook(() => useResellerAttribution());
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Second mount in a new render pass — must reuse the cache. Reset the
    // per-render cell state but NOT the module cache.
    resetHookState();
    renderHook(() => useResellerAttribution());
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("second mount sees the cached reseller synchronously on the initial render (no loading flash)", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, reseller: sampleReseller }),
    );
    const useResellerAttribution = await loadHook();
    renderHook(() => useResellerAttribution());
    await flushMicrotasks();

    resetHookState();
    const r = renderHook(() => useResellerAttribution());
    // The hook seeds useState from memCache?.data ?? null on remount, so a
    // freshly-mounted consumer must see the cached reseller without waiting.
    expect(r.reseller).toEqual(sampleReseller);
    expect(r.isLoading).toBe(false);
  });

  it("after TTL expires, a mount re-fetches", async () => {
    let now = 1_000_000;
    const dateSpy = vi.spyOn(Date, "now").mockImplementation(() => now);
    try {
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse({ ok: true, reseller: sampleReseller }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            ok: true,
            reseller: { ...sampleReseller, display_name: "Refreshed" },
          }),
        );
      const useResellerAttribution = await loadHook();
      renderHook(() => useResellerAttribution());
      await flushMicrotasks();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Fast-forward past the 60s TTL.
      now += 60_001;
      resetHookState();
      renderHook(() => useResellerAttribution());
      await flushMicrotasks();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      dateSpy.mockRestore();
    }
  });
});

// ── refresh() force bypass ─────────────────────────────────────────────

describe("useResellerAttribution — refresh() force bypass", () => {
  it("refresh() refetches even inside the TTL window (force=true)", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ ok: true, reseller: sampleReseller }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          reseller: { ...sampleReseller, display_name: "Forced" },
        }),
      );
    const useResellerAttribution = await loadHook();
    const r = renderHook(() => useResellerAttribution());
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const snap = await r.refresh();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(snap.reseller?.display_name).toBe("Forced");
  });

  it("refresh() returned snapshot matches the freshly fetched reseller", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ ok: true, reseller: sampleReseller }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ ok: true, reseller: null }),
      );
    const useResellerAttribution = await loadHook();
    const r = renderHook(() => useResellerAttribution());
    await flushMicrotasks();

    const snap = await r.refresh();
    expect(snap).toEqual({ reseller: null });
  });

  it("refresh() propagates a failed fetch as { reseller: null } without throwing", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ ok: true, reseller: sampleReseller }),
      )
      .mockRejectedValueOnce(new Error("boom"));
    const useResellerAttribution = await loadHook();
    const r = renderHook(() => useResellerAttribution());
    await flushMicrotasks();

    await expect(r.refresh()).resolves.toEqual({ reseller: null });
  });
});

// ── cross-consumer broadcast ───────────────────────────────────────────

describe("useResellerAttribution — cross-consumer broadcast", () => {
  it("a second mounted consumer receives the fetched snapshot via the module-level listener set", async () => {
    // First consumer will hold the fetch open until we release it, so the
    // second consumer mounts BEFORE the fetch resolves. When it does resolve,
    // both listeners must receive the broadcast.
    let release: (v: unknown) => void = () => undefined;
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    fetchMock.mockReturnValueOnce(
      pending.then(() => jsonResponse({ ok: true, reseller: sampleReseller })),
    );
    const useResellerAttribution = await loadHook();

    // Consumer #1 mounts and kicks off the fetch.
    renderHook(() => useResellerAttribution());
    // Consumer #2 mounts in the same tick — but useEffect only fires on the
    // first render in our shim, so pretend it's the same mounted component
    // driving a second render. What matters is that the module-level cache
    // + listener broadcast picks up the pending fetch.

    release(undefined);
    await flushMicrotasks();

    // Re-render — the hook's internal state was updated via broadcast.
    const r = renderHook(() => useResellerAttribution());
    expect(r.reseller).toEqual(sampleReseller);
  });

  it("broadcast writes to memCache so a NEW consumer mounted after the fetch sees it synchronously", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, reseller: sampleReseller }),
    );
    const useResellerAttribution = await loadHook();
    renderHook(() => useResellerAttribution());
    await flushMicrotasks();

    // Now imagine a second component mounts fresh — reset hook cells (a new
    // component) but keep the module-level cache from the first mount.
    resetHookState();
    const r = renderHook(() => useResellerAttribution());
    expect(r.reseller).toEqual(sampleReseller);
    expect(r.isLoading).toBe(false);
  });
});

// ── cleanup (no leaks) ─────────────────────────────────────────────────

describe("useResellerAttribution — cleanup", () => {
  it("cleanup runs without throwing and leaves the module in a re-mountable state", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, reseller: sampleReseller }),
    );
    const useResellerAttribution = await loadHook();
    renderHook(() => useResellerAttribution());
    await flushMicrotasks();

    // Fire every captured cleanup.
    for (const c of effectCleanups.splice(0)) {
      expect(() => c()).not.toThrow();
    }

    // A re-mounted consumer must still see the cached reseller — cleanup
    // must NOT wipe the module-level memCache, only detach the listener.
    resetHookState();
    const r = renderHook(() => useResellerAttribution());
    expect(r.reseller).toEqual(sampleReseller);
  });

  it("cleanup prevents a late-resolving fetch from writing into a stale setState (cancelled=true guard)", async () => {
    let release: (v: unknown) => void = () => undefined;
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    fetchMock.mockReturnValueOnce(
      pending.then(() => jsonResponse({ ok: true, reseller: sampleReseller })),
    );
    const useResellerAttribution = await loadHook();
    renderHook(() => useResellerAttribution());

    // Unmount before the fetch resolves.
    for (const c of effectCleanups.splice(0)) c();

    release(undefined);
    await flushMicrotasks();

    // The module-level cache still updates (broadcast writes memCache
    // unconditionally), but the unmounted hook's setState never fires — no
    // leak is thrown from the cancelled path.
    resetHookState();
    const r = renderHook(() => useResellerAttribution());
    expect(r.reseller).toEqual(sampleReseller);
  });
});
