// Colocated vitest for `use-startup-token.ts` — the client-side hook that
// fetches the CURRENT startup's deployed equity token via
// `GET /api/blockchain/token`. Two workspace pages consume it:
// equity-dashboard-client.tsx and shareholders-client.tsx. A regression
// here silently drops the per-startup token address across both surfaces,
// which is why the tests below pin the fetch-shape + async-safety
// contracts rather than just the happy-path return value.
//
// Guarded contracts:
//   (a) mount fires exactly one GET to `/api/blockchain/token` with no
//       overridden method/body/headers (server sees a bare read).
//   (b) response shape is trusted only when `data.ok === true`; any other
//       branch (`ok:false`, missing `.ok`, `token: null`, non-object body)
//       lands on `token = null` and NEVER throws — the wallet must not
//       take equity surfaces down if the API 500s or paginates weirdly.
//   (c) network/JSON errors are swallowed: token stays null, loading
//       flips to false so the caller can render an empty state.
//   (d) `active` guard: unmount before the fetch resolves must not call
//       setState. React 18/19 will warn on state-after-unmount and the
//       shareholders page unmounts frequently on tab-switch.
//   (e) `reload()` bumps a nonce that is the effect's dep, so a second
//       render must issue a fresh fetch — this is how both consumer
//       pages refetch after a tokenization write.
//
// The React runtime is not present in the vitest node env so `useState`,
// `useEffect`, and `useCallback` are shimmed via a small cell-based fake
// that supports dep-tracking so `reload()` can be observed to re-run the
// effect. Zero-dependency by design (no @testing-library/react in the
// tree).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── React shim (useState + useEffect w/ deps + useCallback) ─────────

interface Cell {
  value: unknown;
}
interface EffectCell {
  deps: unknown[] | undefined;
  cleanup: (() => void) | void;
}

let stateCells: Cell[] = [];
let effectCells: EffectCell[] = [];
let stateCursor = 0;
let effectCursor = 0;
let pending: Array<{ idx: number; fn: () => void | (() => void) }> = [];

function depsEqual(a: unknown[] | undefined, b: unknown[] | undefined): boolean {
  if (a === undefined || b === undefined) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
  return true;
}

vi.mock("react", () => ({
  useState: <T,>(init: T | (() => T)): [T, (v: T | ((prev: T) => T)) => void] => {
    if (stateCursor >= stateCells.length) {
      const v = typeof init === "function" ? (init as () => T)() : init;
      stateCells.push({ value: v });
    }
    const cell = stateCells[stateCursor++];
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
  useEffect: (fn: () => void | (() => void), deps?: unknown[]): void => {
    if (effectCursor >= effectCells.length) {
      effectCells.push({ deps: undefined, cleanup: undefined });
      pending.push({ idx: effectCursor, fn });
    } else {
      const cell = effectCells[effectCursor];
      if (!depsEqual(cell.deps, deps)) pending.push({ idx: effectCursor, fn });
    }
    // stash the deps for next comparison
    effectCells[effectCursor].deps = deps ? [...deps] : deps;
    effectCursor++;
  },
  useCallback: <T,>(fn: T, _deps: unknown[]): T => fn,
}));

// eslint-disable-next-line import/first
import { useStartupToken } from "./use-startup-token";

function resetHookState(): void {
  // Run any residual cleanups so tests don't leak into each other.
  for (const cell of effectCells) {
    if (typeof cell.cleanup === "function") cell.cleanup();
  }
  stateCells = [];
  effectCells = [];
  stateCursor = 0;
  effectCursor = 0;
  pending = [];
}

function render(): ReturnType<typeof useStartupToken> {
  stateCursor = 0;
  effectCursor = 0;
  const out = useStartupToken();
  // Run any effects pending from this render, storing their cleanups.
  for (const p of pending.splice(0)) {
    const cleanup = p.fn();
    // Run the *prior* cleanup for that slot before installing the new one.
    const cell = effectCells[p.idx];
    if (typeof cell.cleanup === "function") cell.cleanup();
    cell.cleanup = cleanup;
  }
  return out;
}

function unmount(): void {
  for (const cell of effectCells) {
    if (typeof cell.cleanup === "function") cell.cleanup();
    cell.cleanup = undefined;
  }
}

async function flush(times = 8): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

// ── globals: fetch ───────────────────────────────────────────────────

let fetchMock: ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, init?: { ok?: boolean }): unknown {
  return {
    ok: init?.ok ?? true,
    json: async () => body,
  };
}

function jsonThrowResponse(): unknown {
  return {
    ok: true,
    json: async (): Promise<never> => {
      throw new Error("json parse failed");
    },
  };
}

beforeEach(() => {
  resetHookState();
  fetchMock = vi.fn();
  (globalThis as { fetch?: unknown }).fetch = fetchMock;
});

afterEach(() => {
  unmount();
  delete (globalThis as { fetch?: unknown }).fetch;
});

// ── (a) fetch shape ──────────────────────────────────────────────────

describe("useStartupToken — mount fetch shape", () => {
  it("initial mount fires exactly one fetch to /api/blockchain/token", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, token: null }));
    render();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/blockchain/token");
  });

  it("fetch is invoked with URL only — no method / body / headers override", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, token: null }));
    render();
    await flush();
    // The hook must issue a bare GET — anything else means someone snuck
    // a POST/PUT into a read path.
    expect(fetchMock.mock.calls[0][1]).toBeUndefined();
  });
});

// ── (b) response-shape trust ─────────────────────────────────────────

describe("useStartupToken — response-shape trust", () => {
  it("ok:true + token object → returns that token verbatim (no clone)", async () => {
    const token = {
      address: "0xabc0000000000000000000000000000000000001",
      symbol: "STK",
      name: "Startup Token",
    };
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, token }));
    render();
    await flush();
    const out = render();
    expect(out.token).toBe(token); // reference identity — no defensive copy
    expect(out.loading).toBe(false);
  });

  it("ok:true + token:null → token stays null, loading flips false", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, token: null }));
    render();
    await flush();
    const out = render();
    expect(out.token).toBeNull();
    expect(out.loading).toBe(false);
  });

  it("ok:false → token=null even if a token payload is present", async () => {
    // A pre-tokenization startup returns ok:false; some legacy paths
    // still echo a stale token — the hook must ignore it.
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: false,
        token: { address: "0xstale", symbol: "OLD", name: "Old" },
      }),
    );
    render();
    await flush();
    const out = render();
    expect(out.token).toBeNull();
    expect(out.loading).toBe(false);
  });

  it("body without an `ok` field → token=null (missing ok is falsy)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ token: { address: "0x1" } }));
    render();
    await flush();
    const out = render();
    expect(out.token).toBeNull();
  });

  it("body is `null` (empty response) → token stays null, no throw", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(null));
    render();
    await flush();
    const out = render();
    expect(out.token).toBeNull();
    expect(out.loading).toBe(false);
  });
});

// ── (c) error swallowing ─────────────────────────────────────────────

describe("useStartupToken — errors are swallowed", () => {
  it("network error (fetch rejects) → token=null, loading=false", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    render();
    await flush();
    const out = render();
    expect(out.token).toBeNull();
    expect(out.loading).toBe(false);
  });

  it("JSON parse throw → catch branch, token=null, loading=false", async () => {
    fetchMock.mockResolvedValueOnce(jsonThrowResponse());
    render();
    await flush();
    const out = render();
    expect(out.token).toBeNull();
    expect(out.loading).toBe(false);
  });
});

// ── (d) loading state ────────────────────────────────────────────────

describe("useStartupToken — loading state", () => {
  it("first render before flush: loading=true, token=null", () => {
    // A never-resolving fetch: nothing to flush, loading must be true.
    fetchMock.mockReturnValueOnce(new Promise(() => {}));
    const out = render();
    expect(out.loading).toBe(true);
    expect(out.token).toBeNull();
  });

  it("loading stays true while fetch is unresolved across a re-render", async () => {
    let resolveIt: ((v: unknown) => void) | undefined;
    fetchMock.mockReturnValueOnce(
      new Promise((res) => {
        resolveIt = res;
      }),
    );
    render();
    await flush();
    const midway = render();
    expect(midway.loading).toBe(true);
    // now resolve so afterEach doesn't leak an unhandled rejection
    resolveIt?.(jsonResponse({ ok: true, token: null }));
    await flush();
  });
});

// ── (e) unmount safety ───────────────────────────────────────────────

describe("useStartupToken — unmount safety (active guard)", () => {
  it("unmount before fetch resolves: post-resolve state is discarded", async () => {
    let resolveIt: ((v: unknown) => void) | undefined;
    fetchMock.mockReturnValueOnce(
      new Promise((res) => {
        resolveIt = res;
      }),
    );
    render();
    // Unmount before the promise settles — active flag becomes false.
    unmount();
    // Now resolve; hook must NOT write the resolved token onto state.
    resolveIt?.(
      jsonResponse({
        ok: true,
        token: {
          address: "0xdeadbeef",
          symbol: "GHOST",
          name: "Should Not Land",
        },
      }),
    );
    await flush();
    // Read the state cell directly — the setToken/setLoading paths
    // must never have fired, so the initial [null, true] survives.
    const tokenCell = stateCells[0];
    const loadingCell = stateCells[1];
    expect(tokenCell.value).toBeNull();
    expect(loadingCell.value).toBe(true);
  });

  it("unmount before rejection: catch branch's setToken(null) is also skipped", async () => {
    let rejectIt: ((e: unknown) => void) | undefined;
    fetchMock.mockReturnValueOnce(
      new Promise((_res, rej) => {
        rejectIt = rej;
      }),
    );
    render();
    unmount();
    rejectIt?.(new Error("late failure"));
    await flush();
    // loading must still be `true` (setLoading(false) in finally was
    // guarded too — the `active` flag gates BOTH setState paths).
    expect(stateCells[1].value).toBe(true);
  });
});

// ── (f) reload() semantics ───────────────────────────────────────────

describe("useStartupToken — reload()", () => {
  it("reload() bumps nonce → next render issues a fresh fetch", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, token: null }));
    const first = render();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Queue the second response, invoke reload, re-render — the effect
    // deps `[nonce]` change so a new fetch fires.
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        token: { address: "0xnew", symbol: "NEW", name: "Reloaded" },
      }),
    );
    first.reload();
    render();
    await flush();
    const out = render();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(out.token?.address).toBe("0xnew");
  });

  it("reload() called multiple times before re-render still nets one refetch per render", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, token: null }));
    const first = render();
    await flush();

    // Three reload() calls but a single re-render — the nonce sits at
    // n+3 vs the effect's stored [n], so the effect fires exactly ONCE
    // in this render pass. This is the useReducer/useState collapse
    // React itself does on batched setState.
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, token: null }));
    first.reload();
    first.reload();
    first.reload();
    render();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reload alone (no re-render) does NOT fire a fetch — effect is render-gated", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, token: null }));
    const first = render();
    await flush();
    first.reload();
    // No render() call — effect scheduling is bound to render, so no
    // extra fetch until the next render pass runs.
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reload return shape includes {token, loading, reload} on every render", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, token: null }));
    const out = render();
    await flush();
    expect(typeof out.reload).toBe("function");
    expect("token" in out).toBe(true);
    expect("loading" in out).toBe(true);
  });
});
