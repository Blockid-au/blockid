// Colocated vitest for `useUpgradePrompt.ts` — the client-side hook the
// CRO upgrade modal calls into from every gated surface (feature-gate hits,
// low-credit banners, trial-day-N nudges, post-cancel winbacks). The hook
// is small (~135 lines) but sits directly on the upgrade funnel: a
// regression here can either (a) spam the same paying user with the same
// modal every render (session-cap logic breaks) or (b) suppress the modal
// for a user whose cooldown should have expired (revenue foot-gun). Both
// have shipped once already, so the surface is worth pinning.
//
// Guarded contracts:
//
//   (a) `trigger` starts `null`; the hook returns a stable API surface
//       ({trigger, request, accept, dismiss, snooze}) so a consumer can
//       destructure without conditional-hook lint fights.
//   (b) `request(t)` returns `true` on the fresh path, sets `trigger=t`,
//       stamps a per-trigger cooldown in localStorage, bumps the
//       sessionStorage counter *only when* `COUNTS_TOWARDS_CAP[t]` is
//       true, and POSTs a `{trigger, action: "shown", detail?}` beacon
//       to `/api/conversion/track` with `keepalive: true`.
//   (c) `request(t)` returns `false` when a per-trigger cooldown is
//       active (Date.now() - stamped < CLIENT_COOLDOWN_MS[t]) — the
//       cooldown expires exactly at the boundary (>= not >).
//   (d) `request(t)` returns `false` when a COUNTS_TOWARDS_CAP trigger is
//       requested a second time in the same session (SESSION_CAP=1), but
//       a non-counting trigger (trial_day_N, post_cancel_winback) still
//       fires once — the session cap only guards the "hit the wall"
//       triggers, not the scheduled ones.
//   (e) `accept(nextPlan?)` / `dismiss()` / `snooze()` each POST a
//       `{trigger, action, detail}` beacon with the request-time detail
//       preserved (via useRef, survives re-render); `accept` folds
//       `{next_plan: nextPlan}` into the detail; every one clears the
//       trigger back to `null`.
//   (f) `accept`/`dismiss`/`snooze` are no-ops (no fetch call) when
//       `trigger` is null — a paranoid consumer that fires them on unmount
//       must not tag a phantom conversion event.
//   (g) fetch rejections inside `track()` are swallowed — analytics
//       failures on this hot path must never break the CTA UI.
//   (h) SSR safety: with `window` undefined, `readSessionShown()` returns
//       0, `bumpSessionShown()` is a no-op, `isCoolingDown()` returns
//       false, `stampCooldown()` is a no-op. Together these mean the hook
//       silently degrades on the server render pass rather than throwing
//       out of the tree.
//
// Storage keys are pinned as literals below because a rename ships as a
// silent regression — an existing session's counter under the old key
// would suddenly stop being read and the cap would reset for that user.
//
// The React runtime is not present in the vitest node env so `useState`,
// `useCallback`, and `useRef` are shimmed via a tiny cell-based fake.
// `resetHookState()` between tests + a dynamic import per test isolate
// the module-level state (fresh sessionStorage / localStorage / fetch).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── React shim (useState + useCallback + useRef via cells) ────────────

interface Cell {
  value: unknown;
}

let cells: Cell[] = [];
let cursor = 0;

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
  useCallback: <F extends (...args: never[]) => unknown>(
    fn: F,
    _deps?: unknown[],
  ): F => fn,
  useRef: <T,>(init: T): { current: T } => {
    let cell: Cell;
    if (cursor >= cells.length) {
      cell = { value: { current: init } };
      cells.push(cell);
    } else {
      cell = cells[cursor];
    }
    cursor++;
    return cell.value as { current: T };
  },
}));

function resetHookState(): void {
  cells = [];
  cursor = 0;
}

function renderHook<T>(fn: () => T): T {
  cursor = 0;
  return fn();
}

async function flushMicrotasks(times = 8): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

// ── fake storage + window ─────────────────────────────────────────────

class MemStorage {
  private map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.has(k) ? (this.map.get(k) as string) : null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v);
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
  clear(): void {
    this.map.clear();
  }
  size(): number {
    return this.map.size;
  }
  keys(): string[] {
    return Array.from(this.map.keys());
  }
}

let sessionStore: MemStorage;
let localStore: MemStorage;
let fetchMock: ReturnType<typeof vi.fn>;
let dateNowMock: ReturnType<typeof vi.spyOn>;
let nowMs: number;

function installWindow(): void {
  sessionStore = new MemStorage();
  localStore = new MemStorage();
  (globalThis as { window?: unknown }).window = {};
  (globalThis as { sessionStorage?: unknown }).sessionStorage = sessionStore;
  (globalThis as { localStorage?: unknown }).localStorage = localStore;
}

function uninstallWindow(): void {
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
  delete (globalThis as { localStorage?: unknown }).localStorage;
}

async function loadHook(): Promise<
  (typeof import("./useUpgradePrompt"))["useUpgradePrompt"]
> {
  vi.resetModules();
  resetHookState();
  const mod = await import("./useUpgradePrompt");
  return mod.useUpgradePrompt;
}

beforeEach(() => {
  installWindow();
  fetchMock = vi.fn().mockResolvedValue({ ok: true });
  (globalThis as { fetch?: unknown }).fetch = fetchMock;
  nowMs = 1_700_000_000_000;
  dateNowMock = vi.spyOn(Date, "now").mockImplementation(() => nowMs);
});

afterEach(() => {
  dateNowMock.mockRestore();
  uninstallWindow();
  delete (globalThis as { fetch?: unknown }).fetch;
});

// ── initial state & API shape ─────────────────────────────────────────

describe("useUpgradePrompt — initial state", () => {
  it("initial trigger is null", async () => {
    const useUpgradePrompt = await loadHook();
    const r = renderHook(() => useUpgradePrompt());
    expect(r.trigger).toBeNull();
  });

  it("returns a stable API surface with request/accept/dismiss/snooze", async () => {
    const useUpgradePrompt = await loadHook();
    const r = renderHook(() => useUpgradePrompt());
    expect(typeof r.request).toBe("function");
    expect(typeof r.accept).toBe("function");
    expect(typeof r.dismiss).toBe("function");
    expect(typeof r.snooze).toBe("function");
  });
});

// ── request() happy path ──────────────────────────────────────────────

describe("useUpgradePrompt — request() fresh call", () => {
  it("returns true on a fresh trigger with no cooldown", async () => {
    const useUpgradePrompt = await loadHook();
    const r = renderHook(() => useUpgradePrompt());
    expect(r.request("credits_low")).toBe(true);
  });

  it("sets trigger on the next render", async () => {
    const useUpgradePrompt = await loadHook();
    const r1 = renderHook(() => useUpgradePrompt());
    r1.request("credits_low");
    const r2 = renderHook(() => useUpgradePrompt());
    expect(r2.trigger).toBe("credits_low");
  });

  it("stamps the per-trigger cooldown in localStorage", async () => {
    const useUpgradePrompt = await loadHook();
    const r = renderHook(() => useUpgradePrompt());
    r.request("credits_low");
    expect(localStore.getItem("blockid_upgrade_cooldown_v1:credits_low")).toBe(
      String(nowMs),
    );
  });

  it("bumps the session counter for a COUNTS_TOWARDS_CAP trigger", async () => {
    const useUpgradePrompt = await loadHook();
    const r = renderHook(() => useUpgradePrompt());
    r.request("feature_gate_hit");
    expect(sessionStore.getItem("blockid_upgrade_shown_v1")).toBe("1");
  });

  it("does NOT bump the session counter for a non-counting trigger", async () => {
    const useUpgradePrompt = await loadHook();
    const r = renderHook(() => useUpgradePrompt());
    r.request("trial_day_5");
    expect(sessionStore.getItem("blockid_upgrade_shown_v1")).toBeNull();
  });
});

// ── request() analytics beacon ────────────────────────────────────────

describe("useUpgradePrompt — request() analytics beacon", () => {
  it("POSTs a `shown` beacon to /api/conversion/track", async () => {
    const useUpgradePrompt = await loadHook();
    const r = renderHook(() => useUpgradePrompt());
    r.request("credits_low");
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/conversion/track");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(init.keepalive).toBe(true);
    const body = JSON.parse(init.body as string) as {
      trigger: string;
      action: string;
      detail?: unknown;
    };
    expect(body.trigger).toBe("credits_low");
    expect(body.action).toBe("shown");
  });

  it("forwards the caller-supplied detail through the beacon", async () => {
    const useUpgradePrompt = await loadHook();
    const r = renderHook(() => useUpgradePrompt());
    r.request("feature_gate_hit", { feature: "custom_reports", plan: "free" });
    await flushMicrotasks();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { detail: unknown };
    expect(body.detail).toEqual({
      feature: "custom_reports",
      plan: "free",
    });
  });

  it("swallows fetch rejections inside the beacon (does not throw)", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    const useUpgradePrompt = await loadHook();
    const r = renderHook(() => useUpgradePrompt());
    expect(() => r.request("credits_low")).not.toThrow();
    await flushMicrotasks();
  });
});

// ── request() cooldown gate ───────────────────────────────────────────

describe("useUpgradePrompt — request() cooldown gate", () => {
  it("returns false and does not fire a beacon when cooldown is active", async () => {
    const useUpgradePrompt = await loadHook();
    const r1 = renderHook(() => useUpgradePrompt());
    r1.request("credits_low");
    await flushMicrotasks();
    fetchMock.mockClear();

    nowMs += 60_000; // still inside the 12h cooldown
    const r2 = renderHook(() => useUpgradePrompt());
    expect(r2.request("credits_low")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns true again exactly when the cooldown window has elapsed", async () => {
    const useUpgradePrompt = await loadHook();
    const r1 = renderHook(() => useUpgradePrompt());
    // Use a non-counting trigger so the session cap doesn't shadow the
    // cooldown-boundary check we're actually pinning here.
    r1.request("trial_day_5");
    fetchMock.mockClear();

    // trial_day_5 cooldown is 24h; boundary is `<`, so equal → allowed
    nowMs += 24 * 3600 * 1000;
    const r2 = renderHook(() => useUpgradePrompt());
    expect(r2.request("trial_day_5")).toBe(true);
  });

  it("keeps cooldowns per-trigger — a second trigger still fires", async () => {
    const useUpgradePrompt = await loadHook();
    const r1 = renderHook(() => useUpgradePrompt());
    r1.request("trial_day_5"); // not counting toward cap
    const r2 = renderHook(() => useUpgradePrompt());
    expect(r2.request("trial_day_6")).toBe(true);
  });
});

// ── request() session cap ─────────────────────────────────────────────

describe("useUpgradePrompt — request() session cap", () => {
  it("blocks a second COUNTS_TOWARDS_CAP trigger in the same session", async () => {
    const useUpgradePrompt = await loadHook();
    const r1 = renderHook(() => useUpgradePrompt());
    r1.request("feature_gate_hit");
    // Move outside cooldown to isolate the session-cap gate
    nowMs += 48 * 3600 * 1000;
    const r2 = renderHook(() => useUpgradePrompt());
    expect(r2.request("credits_low")).toBe(false);
  });

  it("does NOT block a non-counting trigger even at the session cap", async () => {
    const useUpgradePrompt = await loadHook();
    const r1 = renderHook(() => useUpgradePrompt());
    r1.request("feature_gate_hit"); // session=1
    nowMs += 48 * 3600 * 1000;
    const r2 = renderHook(() => useUpgradePrompt());
    expect(r2.request("post_cancel_winback")).toBe(true);
    expect(sessionStore.getItem("blockid_upgrade_shown_v1")).toBe("1"); // unchanged
  });
});

// ── accept / dismiss / snooze ─────────────────────────────────────────

describe("useUpgradePrompt — accept()", () => {
  it("POSTs `accepted` with next_plan folded into detail and clears trigger", async () => {
    const useUpgradePrompt = await loadHook();
    const r1 = renderHook(() => useUpgradePrompt());
    r1.request("credits_low", { origin: "wallet" });
    await flushMicrotasks();
    fetchMock.mockClear();

    const r2 = renderHook(() => useUpgradePrompt());
    r2.accept("growth");
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      trigger: string;
      action: string;
      detail: { origin: string; next_plan: string };
    };
    expect(body.action).toBe("accepted");
    expect(body.trigger).toBe("credits_low");
    expect(body.detail).toEqual({ origin: "wallet", next_plan: "growth" });

    const r3 = renderHook(() => useUpgradePrompt());
    expect(r3.trigger).toBeNull();
  });

  it("no-ops when no trigger is active", async () => {
    const useUpgradePrompt = await loadHook();
    const r = renderHook(() => useUpgradePrompt());
    r.accept("growth");
    await flushMicrotasks();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("useUpgradePrompt — dismiss()", () => {
  it("POSTs `dismissed` with the request-time detail and clears trigger", async () => {
    const useUpgradePrompt = await loadHook();
    const r1 = renderHook(() => useUpgradePrompt());
    r1.request("report_cap_hit", { report_id: "R-42" });
    await flushMicrotasks();
    fetchMock.mockClear();

    const r2 = renderHook(() => useUpgradePrompt());
    r2.dismiss();
    await flushMicrotasks();

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      trigger: string;
      action: string;
      detail: unknown;
    };
    expect(body.action).toBe("dismissed");
    expect(body.trigger).toBe("report_cap_hit");
    expect(body.detail).toEqual({ report_id: "R-42" });

    const r3 = renderHook(() => useUpgradePrompt());
    expect(r3.trigger).toBeNull();
  });

  it("no-ops when no trigger is active", async () => {
    const useUpgradePrompt = await loadHook();
    const r = renderHook(() => useUpgradePrompt());
    r.dismiss();
    await flushMicrotasks();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("useUpgradePrompt — snooze()", () => {
  it("POSTs `snoozed` with the request-time detail and clears trigger", async () => {
    const useUpgradePrompt = await loadHook();
    const r1 = renderHook(() => useUpgradePrompt());
    r1.request("trial_day_7", { day: 7 });
    await flushMicrotasks();
    fetchMock.mockClear();

    const r2 = renderHook(() => useUpgradePrompt());
    r2.snooze();
    await flushMicrotasks();

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      trigger: string;
      action: string;
      detail: unknown;
    };
    expect(body.action).toBe("snoozed");
    expect(body.trigger).toBe("trial_day_7");
    expect(body.detail).toEqual({ day: 7 });

    const r3 = renderHook(() => useUpgradePrompt());
    expect(r3.trigger).toBeNull();
  });

  it("no-ops when no trigger is active", async () => {
    const useUpgradePrompt = await loadHook();
    const r = renderHook(() => useUpgradePrompt());
    r.snooze();
    await flushMicrotasks();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ── SSR safety ────────────────────────────────────────────────────────

describe("useUpgradePrompt — SSR safety (no window)", () => {
  it("request() runs without throwing when window is undefined", async () => {
    // Prime the module while window exists (mount happens client-side too),
    // then simulate a subsequent SSR render by removing window before the
    // request() call — the storage helpers must all short-circuit.
    const useUpgradePrompt = await loadHook();
    const r = renderHook(() => useUpgradePrompt());
    uninstallWindow();
    expect(() => r.request("credits_low")).not.toThrow();
  });

  it("skips storage writes when window is undefined", async () => {
    const useUpgradePrompt = await loadHook();
    const r = renderHook(() => useUpgradePrompt());
    // Snapshot storage refs BEFORE tearing window down.
    const s = sessionStore;
    const l = localStore;
    uninstallWindow();
    r.request("feature_gate_hit");
    expect(s.size()).toBe(0);
    expect(l.size()).toBe(0);
  });

  it("treats cooldown as inactive under SSR (no localStorage read)", async () => {
    // First render primes the cooldown while window is up.
    const useUpgradePrompt = await loadHook();
    const r1 = renderHook(() => useUpgradePrompt());
    r1.request("credits_low");
    uninstallWindow();
    // Under SSR, isCoolingDown returns false regardless of what localStorage
    // "would" say, so request() takes the fresh path and returns true.
    const r2 = renderHook(() => useUpgradePrompt());
    expect(r2.request("credits_low")).toBe(true);
  });
});
