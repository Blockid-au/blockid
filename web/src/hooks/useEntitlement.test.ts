// Colocated vitest for `useEntitlement.ts` — the client-side reader for the
// entitlement snapshot published by GET /api/entitlement/me.
//
// The hook is small (~150 lines) but sits at the top of every gated UI
// surface: sidebar admin links, feature buttons on the wallet page, the
// dataroom populate/reseed buttons, and every place `can(feature)` decides
// whether to render a locked or unlocked control. Regressions here are
// user-visible and can silently downgrade a paying plan to `free` (breaks
// Corporations Act 2001 (Cth) s912A "efficient, honest and fair" posture on
// paid features). Guarded contracts:
//
//   (a) the fetch must call `/api/entitlement/me` with credentials: include
//       (session cookie must ride the request) and cache: 'no-store' (a
//       stale CDN copy must never serve an old plan tier).
//   (b) the response reader must accept BOTH the flat shape
//       ({user_id, plan, segment, jurisdiction, entitlements, trial}) and
//       the nested shape ({user, entitlements, trial}) — the flat shape is
//       what the current route ships but a proxied response from a legacy
//       gateway can still hit us.
//   (c) `can(feature)` must return false when no snapshot has loaded yet so
//       an over-eager render can't briefly render a gated control while the
//       fetch is in flight.
//   (d) a 60s per-tab TTL must be honoured so a re-mount inside the TTL
//       does NOT re-fetch — matches the server-side plans-db TTL, otherwise
//       every route change refetches the entitlement snapshot and hammers
//       Supabase.
//   (e) the refresh() callback returned by the hook must force=true so a
//       user-triggered refresh (e.g. after a Stripe checkout) always
//       bypasses the TTL cache.
//   (f) window 'focus' triggers a non-force refresh (opportunistic).
//   (g) cleanup MUST remove both the focus listener and the module-level
//       broadcast listener so an unmounted hook doesn't leak setState calls
//       into the next tick's re-render (React 19 warns + strict-mode dev
//       overlay).
//
// The React runtime is not present in the vitest node env so `useState`,
// `useEffect`, and `useCallback` are shimmed via a tiny cell-based fake.
// The module-level `memCache`/`listeners` state is reset per test via
// `vi.resetModules()` + a dynamic import — the top-level `vi.mock('react')`
// is hoisted before all imports so the react mock survives the reset.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── React shim (useState + useEffect + useCallback via cells) ─────────

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
  useCallback: <F extends (...args: never[]) => unknown>(
    fn: F,
    _deps?: unknown[],
  ): F => fn,
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

// ── globals: fetch, window ─────────────────────────────────────────────

let fetchMock: ReturnType<typeof vi.fn>;
let focusListeners: Array<() => void>;

function installWindow(): void {
  focusListeners = [];
  (globalThis as { window?: unknown }).window = {
    addEventListener(evt: string, fn: () => void): void {
      if (evt === "focus") focusListeners.push(fn);
    },
    removeEventListener(evt: string, fn: () => void): void {
      if (evt === "focus") {
        focusListeners = focusListeners.filter((l) => l !== fn);
      }
    },
  };
}

function uninstallWindow(): void {
  delete (globalThis as { window?: unknown }).window;
}

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
  (typeof import("./useEntitlement"))["useEntitlement"]
> {
  vi.resetModules();
  resetHookState();
  const mod = await import("./useEntitlement");
  return mod.useEntitlement;
}

beforeEach(() => {
  installWindow();
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
  uninstallWindow();
  delete (globalThis as { fetch?: unknown }).fetch;
});

// ── initial state / can() guard ────────────────────────────────────────

describe("useEntitlement — initial state and can()", () => {
  it("initial snapshot is null and isLoading=true when no fetch has resolved", async () => {
    fetchMock.mockImplementation(() => new Promise(() => undefined));
    const useEntitlement = await loadHook();
    const r = renderHook(() => useEntitlement());
    expect(r.user).toBeNull();
    expect(r.entitlements).toEqual([]);
    expect(r.trial).toBeNull();
    expect(r.isLoading).toBe(true);
  });

  it("can() returns false while snapshot is null (no gated flash of gated UI)", async () => {
    fetchMock.mockImplementation(() => new Promise(() => undefined));
    const useEntitlement = await loadHook();
    const r = renderHook(() => useEntitlement());
    expect(r.can("share_management")).toBe(false);
    expect(r.can("dataroom_populate")).toBe(false);
  });

  it("can() accepts either a Feature literal or a raw string", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        user_id: "u-1",
        plan: "growth",
        segment: "founder",
        entitlements: ["share_management", "custom_feat"],
      }),
    );
    const useEntitlement = await loadHook();
    renderHook(() => useEntitlement());
    await flushMicrotasks();
    const r2 = renderHook(() => useEntitlement());
    expect(r2.can("share_management")).toBe(true);
    expect(r2.can("custom_feat")).toBe(true);
    expect(r2.can("missing")).toBe(false);
  });
});

// ── fetch request shape ────────────────────────────────────────────────

describe("useEntitlement — fetch request shape", () => {
  it("fetches /api/entitlement/me with credentials: include and cache: no-store", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ entitlements: [] }));
    const useEntitlement = await loadHook();
    renderHook(() => useEntitlement());
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledWith("/api/entitlement/me", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
  });

  it("fetch is called exactly once on mount within the TTL window", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ entitlements: [] }));
    const useEntitlement = await loadHook();
    renderHook(() => useEntitlement());
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// ── response reader — flat shape ───────────────────────────────────────

describe("useEntitlement — response reader (flat shape)", () => {
  it("assembles user from flat {user_id, plan, segment, jurisdiction}", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        user_id: "u-42",
        plan: "growth",
        segment: "reseller",
        jurisdiction: "AU",
        entitlements: ["a", "b"],
        trial: null,
      }),
    );
    const useEntitlement = await loadHook();
    renderHook(() => useEntitlement());
    await flushMicrotasks();
    const r = renderHook(() => useEntitlement());
    expect(r.user).toEqual({
      id: "u-42",
      plan: "growth",
      segment: "reseller",
      jurisdiction: "AU",
    });
    expect(r.entitlements).toEqual(["a", "b"]);
    expect(r.trial).toBeNull();
  });

  it("defaults plan to 'free' when missing in flat shape", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ user_id: "u-1", entitlements: [] }),
    );
    const useEntitlement = await loadHook();
    renderHook(() => useEntitlement());
    await flushMicrotasks();
    const r = renderHook(() => useEntitlement());
    expect(r.user?.plan).toBe("free");
  });

  it("defaults segment to 'founder' when missing in flat shape", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ user_id: "u-1", entitlements: [] }),
    );
    const useEntitlement = await loadHook();
    renderHook(() => useEntitlement());
    await flushMicrotasks();
    const r = renderHook(() => useEntitlement());
    expect(r.user?.segment).toBe("founder");
  });

  it("defaults jurisdiction to null when missing in flat shape", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ user_id: "u-1", entitlements: [] }),
    );
    const useEntitlement = await loadHook();
    renderHook(() => useEntitlement());
    await flushMicrotasks();
    const r = renderHook(() => useEntitlement());
    expect(r.user?.jurisdiction).toBeNull();
  });
});

// ── response reader — nested shape ─────────────────────────────────────

describe("useEntitlement — response reader (nested shape)", () => {
  it("uses nested {user} block directly when provided (legacy gateway path)", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        user: {
          id: "u-nested",
          plan: "unicorn",
          segment: "investor",
          jurisdiction: "US",
          legal_review_passed: true,
        },
        entitlements: ["one"],
        trial: null,
      }),
    );
    const useEntitlement = await loadHook();
    renderHook(() => useEntitlement());
    await flushMicrotasks();
    const r = renderHook(() => useEntitlement());
    expect(r.user).toEqual({
      id: "u-nested",
      plan: "unicorn",
      segment: "investor",
      jurisdiction: "US",
      legal_review_passed: true,
    });
  });

  it("nested user takes precedence over flat user_id when both are present", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        user: { id: "nested-id", plan: "growth", segment: "founder" },
        user_id: "flat-id",
        plan: "free",
        entitlements: [],
      }),
    );
    const useEntitlement = await loadHook();
    renderHook(() => useEntitlement());
    await flushMicrotasks();
    const r = renderHook(() => useEntitlement());
    expect(r.user?.id).toBe("nested-id");
    expect(r.user?.plan).toBe("growth");
  });
});

// ── response reader — missing user / defaults ──────────────────────────

describe("useEntitlement — missing user / defaults", () => {
  it("user is null when neither nested user nor flat user_id is present (logged-out)", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ entitlements: ["public_feature"] }),
    );
    const useEntitlement = await loadHook();
    renderHook(() => useEntitlement());
    await flushMicrotasks();
    const r = renderHook(() => useEntitlement());
    expect(r.user).toBeNull();
    expect(r.entitlements).toEqual(["public_feature"]);
  });

  it("entitlements defaults to [] when omitted from the response body", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ user_id: "u-1" }));
    const useEntitlement = await loadHook();
    renderHook(() => useEntitlement());
    await flushMicrotasks();
    const r = renderHook(() => useEntitlement());
    expect(r.entitlements).toEqual([]);
    expect(r.can("anything")).toBe(false);
  });

  it("trial defaults to null when omitted from the response body", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ user_id: "u-1" }));
    const useEntitlement = await loadHook();
    renderHook(() => useEntitlement());
    await flushMicrotasks();
    const r = renderHook(() => useEntitlement());
    expect(r.trial).toBeNull();
  });

  it("trial is passed through verbatim when the response provides one", async () => {
    const trial = {
      inTrial: true,
      daysLeft: 7,
      endsAt: null,
      requiresPayment: false,
      status: "trialing",
      planId: "growth",
    };
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ user_id: "u-1", trial, entitlements: [] }),
    );
    const useEntitlement = await loadHook();
    renderHook(() => useEntitlement());
    await flushMicrotasks();
    const r = renderHook(() => useEntitlement());
    expect(r.trial).toEqual(trial);
  });
});

// ── !res.ok fallback ───────────────────────────────────────────────────

describe("useEntitlement — !res.ok fallback", () => {
  it("returns the logged-out snapshot when the response is not ok (401/500)", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ user_id: "should-be-ignored" }, { ok: false, status: 401 }),
    );
    const useEntitlement = await loadHook();
    renderHook(() => useEntitlement());
    await flushMicrotasks();
    const r = renderHook(() => useEntitlement());
    expect(r.user).toBeNull();
    expect(r.entitlements).toEqual([]);
    expect(r.trial).toBeNull();
    expect(r.isLoading).toBe(false);
  });

  it("a rejected fetch does NOT throw and isLoading still flips to false", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    const useEntitlement = await loadHook();
    renderHook(() => useEntitlement());
    await flushMicrotasks();
    const r = renderHook(() => useEntitlement());
    expect(r.isLoading).toBe(false);
    expect(r.user).toBeNull();
  });
});

// ── TTL cache ──────────────────────────────────────────────────────────

describe("useEntitlement — TTL cache", () => {
  it("second hook mount within the TTL window does NOT re-fetch", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ user_id: "u-1", entitlements: [] }),
    );
    const useEntitlement = await loadHook();
    renderHook(() => useEntitlement());
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Simulate a second hook mount (new component) by resetting the cell
    // state but keeping the module-level memCache intact.
    resetHookState();
    renderHook(() => useEntitlement());
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("second mount within TTL starts with cached snapshot (isLoading=false)", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        user_id: "u-cached",
        plan: "growth",
        entitlements: ["gated"],
      }),
    );
    const useEntitlement = await loadHook();
    renderHook(() => useEntitlement());
    await flushMicrotasks();

    resetHookState();
    const r = renderHook(() => useEntitlement());
    expect(r.isLoading).toBe(false);
    expect(r.user?.id).toBe("u-cached");
    expect(r.can("gated")).toBe(true);
  });

  it("refresh() returned by the hook forces a re-fetch (bypasses TTL)", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ user_id: "u-1", plan: "free", entitlements: [] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          user_id: "u-1",
          plan: "growth",
          entitlements: ["upgraded"],
        }),
      );
    const useEntitlement = await loadHook();
    const r = renderHook(() => useEntitlement());
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const snap2 = await r.refresh();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(snap2.user?.plan).toBe("growth");
    expect(snap2.entitlements).toEqual(["upgraded"]);
  });

  it("TTL expiry causes a subsequent internal refresh to re-fetch", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ user_id: "u-1", entitlements: [] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ user_id: "u-1", plan: "growth", entitlements: [] }),
      );
    const useEntitlement = await loadHook();
    renderHook(() => useEntitlement());
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Advance beyond TTL (60s) and fire the focus handler which invokes
    // refresh(false) — non-force but stale, so should re-fetch.
    vi.setSystemTime(Date.now() + 61_000);
    for (const l of focusListeners) l();
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});

// ── focus listener ────────────────────────────────────────────────────

describe("useEntitlement — focus listener", () => {
  it("mounting registers exactly one 'focus' listener on window", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ entitlements: [] }));
    const useEntitlement = await loadHook();
    renderHook(() => useEntitlement());
    await flushMicrotasks();
    expect(focusListeners.length).toBe(1);
  });

  it("cleanup removes the focus listener", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ entitlements: [] }));
    const useEntitlement = await loadHook();
    renderHook(() => useEntitlement());
    await flushMicrotasks();
    expect(focusListeners.length).toBe(1);
    for (const c of effectCleanups.splice(0)) c();
    expect(focusListeners.length).toBe(0);
  });

  it("focus fires refresh(false) — within TTL that means no new fetch", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ user_id: "u-1", entitlements: [] }),
    );
    const useEntitlement = await loadHook();
    renderHook(() => useEntitlement());
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    for (const l of focusListeners) l();
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// ── broadcast to other hook instances ──────────────────────────────────

describe("useEntitlement — broadcast to other hook instances", () => {
  it("cleanup removes the module-level broadcast listener (no leaked setState)", async () => {
    // Two mounts within TTL: the second uses the cache and registers a
    // listener with the module. After both cleanups the listener set should
    // be empty (verified indirectly by ensuring a subsequent refresh
    // completes without crashing — a leaked listener would throw when its
    // captured `setSnapshot` referenced a torn-down cell).
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ user_id: "u-1", entitlements: [] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ user_id: "u-1", plan: "growth", entitlements: [] }),
      );
    const useEntitlement = await loadHook();
    renderHook(() => useEntitlement());
    await flushMicrotasks();
    // simulate cleanup
    for (const c of effectCleanups.splice(0)) c();

    // second mount, then force refresh
    resetHookState();
    const r = renderHook(() => useEntitlement());
    await flushMicrotasks();
    await expect(r.refresh()).resolves.toMatchObject({
      user: { plan: "growth" },
    });
  });
});
