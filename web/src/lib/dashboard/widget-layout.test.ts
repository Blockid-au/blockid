// Dashboard layout helpers — G4 #4 server sync.
//
//   parseLayout      shape validation, allow-list filtering, stamp clamping
//   mergeLayouts     the newer-side-wins rule the grid applies on mount
//   createDebounced  trailing-edge, latest-value-only, flush/cancel (fake timers)
//   layoutByteLength the 4 KB wire cap is comfortably above a full layout

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DASHBOARD_WIDGET_IDS } from "./widget-ids";
import {
  LAYOUT_FUTURE_SKEW_MS,
  LAYOUT_MAX_BYTES,
  createDebounced,
  isEmptyLayout,
  layoutByteLength,
  mergeLayouts,
  parseLayout,
  type DashboardLayout,
} from "./widget-layout";

const T0 = Date.parse("2026-09-01T00:00:00.000Z");
const iso = (offsetMs: number) => new Date(T0 + offsetMs).toISOString();

function layout(partial: Partial<DashboardLayout> & { updated_at: string }): DashboardLayout {
  return { v: 1, order: [], pinned: [], ...partial };
}

/* ─── parseLayout ─────────────────────────────────────────────────────────── */

describe("parseLayout", () => {
  it("returns null for anything that is not a v1 layout object", () => {
    expect(parseLayout(null)).toBeNull();
    expect(parseLayout("x")).toBeNull();
    expect(parseLayout([])).toBeNull();
    expect(parseLayout({})).toBeNull();
    expect(parseLayout({ v: 2, order: [], pinned: [], updated_at: iso(0) })).toBeNull();
    expect(parseLayout({ v: 1, order: "metrics", pinned: [], updated_at: iso(0) })).toBeNull();
    expect(parseLayout({ v: 1, order: [], pinned: {}, updated_at: iso(0) })).toBeNull();
    expect(parseLayout({ v: 1, order: [], pinned: [], hidden: "x", updated_at: iso(0) })).toBeNull();
  });

  it("requires a parseable updated_at", () => {
    expect(parseLayout({ v: 1, order: [], pinned: [] })).toBeNull();
    expect(parseLayout({ v: 1, order: [], pinned: [], updated_at: "yesterday" })).toBeNull();
    expect(parseLayout({ v: 1, order: [], pinned: [], updated_at: 12345 })).toBeNull();
  });

  it("drops unknown ids, non-strings and duplicates against the page allow-list", () => {
    const out = parseLayout({
      v: 1,
      order: ["metrics", "nope", 7, "metrics", "svi-radar"],
      pinned: ["health-score", "<script>", "health-score"],
      hidden: ["cohort-benchmark", "ghost"],
      updated_at: iso(0),
    });
    expect(out).toEqual({
      v: 1,
      order: ["metrics", "svi-radar"],
      pinned: ["health-score"],
      hidden: ["cohort-benchmark"],
      updated_at: iso(0),
    });
  });

  it("accepts a custom known list (the grid passes allow-list ∪ declared)", () => {
    const out = parseLayout(
      { v: 1, order: ["custom-a", "metrics"], pinned: [], updated_at: iso(0) },
      ["custom-a"],
    );
    expect(out?.order).toEqual(["custom-a"]);
  });

  it("removes pinned ids from the tail order and hidden ids from pinned", () => {
    const out = parseLayout({
      v: 1,
      order: ["health-score", "metrics"],
      pinned: ["health-score", "cohort-benchmark"],
      hidden: ["cohort-benchmark"],
      updated_at: iso(0),
    });
    expect(out?.order).toEqual(["metrics"]);
    expect(out?.pinned).toEqual(["health-score"]);
    expect(out?.hidden).toEqual(["cohort-benchmark"]);
  });

  it("omits `hidden` when empty and normalises the stamp to ISO", () => {
    const out = parseLayout({ v: 1, order: [], pinned: [], hidden: [], updated_at: "2026-09-01T10:00:00+10:00" });
    expect(out).toEqual({ v: 1, order: [], pinned: [], updated_at: "2026-09-01T00:00:00.000Z" });
    expect(out && "hidden" in out).toBe(false);
  });

  it("clamps a stamp more than the allowed skew in the future to `now`", () => {
    const far = parseLayout({ v: 1, order: [], pinned: [], updated_at: iso(LAYOUT_FUTURE_SKEW_MS + 1) }, DASHBOARD_WIDGET_IDS, T0);
    expect(far?.updated_at).toBe(iso(0));
    const near = parseLayout({ v: 1, order: [], pinned: [], updated_at: iso(LAYOUT_FUTURE_SKEW_MS - 1) }, DASHBOARD_WIDGET_IDS, T0);
    expect(near?.updated_at).toBe(iso(LAYOUT_FUTURE_SKEW_MS - 1));
  });

  it("isEmptyLayout is true only when every list is empty", () => {
    expect(isEmptyLayout(null)).toBe(true);
    expect(isEmptyLayout(layout({ updated_at: iso(0) }))).toBe(true);
    expect(isEmptyLayout(layout({ pinned: ["metrics"], updated_at: iso(0) }))).toBe(false);
    expect(isEmptyLayout(layout({ hidden: ["metrics"], updated_at: iso(0) }))).toBe(false);
  });

  it("a fully populated layout is far under the 4 KB wire cap", () => {
    const all = [...DASHBOARD_WIDGET_IDS];
    const full = layout({ order: all, pinned: all, hidden: all, updated_at: iso(0) });
    expect(layoutByteLength(full)).toBeLessThan(LAYOUT_MAX_BYTES / 4);
  });
});

/* ─── mergeLayouts ────────────────────────────────────────────────────────── */

describe("mergeLayouts", () => {
  const local = layout({ order: ["metrics", "svi-radar"], pinned: ["health-score"], updated_at: iso(1000) });
  const server = layout({ order: ["svi-radar", "metrics"], pinned: [], hidden: ["data-room"], updated_at: iso(2000) });

  it("no server + no local → nothing to render, nothing to push", () => {
    expect(mergeLayouts(null, null)).toEqual({ layout: null, source: "none", pushLocal: false, writeLocal: false });
  });

  it("no server + empty local → nothing to push (fresh browser is not a customisation)", () => {
    const empty = layout({ updated_at: iso(0) });
    expect(mergeLayouts(empty, null)).toEqual({ layout: null, source: "none", pushLocal: false, writeLocal: false });
  });

  it("no server + local customisation → local wins and is pushed once", () => {
    expect(mergeLayouts(local, null)).toEqual({ layout: local, source: "local", pushLocal: true, writeLocal: false });
  });

  it("server + no local → server wins and is written to the cache", () => {
    expect(mergeLayouts(null, server)).toEqual({ layout: server, source: "server", pushLocal: false, writeLocal: true });
  });

  it("server newer → server wins, cache overwritten, nothing pushed", () => {
    expect(mergeLayouts(local, server)).toEqual({ layout: server, source: "server", pushLocal: false, writeLocal: true });
  });

  it("local newer → local wins and is pushed", () => {
    const newerLocal = { ...local, updated_at: iso(3000) };
    expect(mergeLayouts(newerLocal, server)).toEqual({ layout: newerLocal, source: "local", pushLocal: true, writeLocal: false });
  });

  it("legacy local (epoch stamp, pre-sync data) loses to any server copy", () => {
    const legacy = { ...local, updated_at: "1970-01-01T00:00:00.000Z" };
    expect(mergeLayouts(legacy, server).source).toBe("server");
  });

  it("legacy local with no server copy is still pushed (first sync)", () => {
    const legacy = { ...local, updated_at: "1970-01-01T00:00:00.000Z" };
    expect(mergeLayouts(legacy, null)).toMatchObject({ source: "local", pushLocal: true });
  });

  it("identical stamp + identical content → local, but no redundant PUT", () => {
    const same = { ...server };
    expect(mergeLayouts(same, server)).toEqual({ layout: same, source: "local", pushLocal: false, writeLocal: false });
  });

  it("identical stamp + different content → local wins and is pushed", () => {
    const tie = { ...local, updated_at: server.updated_at };
    expect(mergeLayouts(tie, server)).toMatchObject({ source: "local", pushLocal: true });
  });

  it("a local reset (empty lists, newer stamp) beats an older server layout", () => {
    const reset = layout({ updated_at: iso(5000) });
    expect(mergeLayouts(reset, server)).toEqual({ layout: reset, source: "local", pushLocal: true, writeLocal: false });
  });
});

/* ─── createDebounced ─────────────────────────────────────────────────────── */

describe("createDebounced", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires once with the latest value after the delay (800 ms)", () => {
    const fn = vi.fn<(v: string) => void>();
    const d = createDebounced(fn, 800);
    d.schedule("a");
    vi.advanceTimersByTime(500);
    d.schedule("b");
    vi.advanceTimersByTime(500);
    expect(fn).not.toHaveBeenCalled(); // the second call restarted the window
    expect(d.pending()).toBe(true);
    vi.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("b");
    expect(d.pending()).toBe(false);
  });

  it("a burst of drag events collapses into one call", () => {
    const fn = vi.fn<(v: number) => void>();
    const d = createDebounced(fn, 800);
    for (let i = 0; i < 25; i++) {
      d.schedule(i);
      vi.advanceTimersByTime(100);
    }
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(800);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(24);
  });

  it("flush runs the pending call immediately; a second flush is a no-op", () => {
    const fn = vi.fn<(v: string) => void>();
    const d = createDebounced(fn, 800);
    d.schedule("x");
    d.flush();
    expect(fn).toHaveBeenCalledWith("x");
    d.flush();
    vi.advanceTimersByTime(2000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("cancel drops the pending call", () => {
    const fn = vi.fn<(v: string) => void>();
    const d = createDebounced(fn, 800);
    d.schedule("x");
    d.cancel();
    expect(d.pending()).toBe(false);
    vi.advanceTimersByTime(2000);
    expect(fn).not.toHaveBeenCalled();
  });

  it("accepts injected timers", () => {
    const fn = vi.fn<(v: string) => void>();
    let cb: (() => void) | null = null;
    const d = createDebounced(fn, 800, {
      set: (c) => {
        cb = c;
        return 1 as unknown as ReturnType<typeof setTimeout>;
      },
      clear: () => {
        cb = null;
      },
    });
    d.schedule("y");
    expect(cb).not.toBeNull();
    (cb as unknown as () => void)();
    expect(fn).toHaveBeenCalledWith("y");
  });
});
