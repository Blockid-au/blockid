// WidgetGrid ordering + persistence unit tests (iteration-12 T2).
//
// vitest.config only picks up `*.test.ts` (no JSX/JSDOM by default), so
// we cover the pure helpers directly and drive the localStorage side of
// the component behaviour via a lightweight window+localStorage stub —
// enough to verify (a) empty storage → declaration order, (b) pinned
// ids render first, (c) reorder writes are persisted.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LAYOUT_ENDPOINT,
  SYNC_DEBOUNCE_MS,
  WIDGET_HIDDEN_KEY,
  WIDGET_ORDER_KEY,
  WIDGET_PINNED_KEY,
  WIDGET_STAMP_KEY,
  readLocalLayout,
  resolveWidgetOrder,
  sanitizeStoredIds,
  writeLocalLayout,
} from "./widget-grid";
import { mergeLayouts } from "@/lib/dashboard/widget-layout";

/* ─── In-memory localStorage shim ─────────────────────────────────────────── */

interface StorageShim {
  store: Map<string, string>;
  getItem: (k: string) => string | null;
  setItem: (k: string, v: string) => void;
  removeItem: (k: string) => void;
  clear: () => void;
}

function installLocalStorage(): StorageShim {
  const store = new Map<string, string>();
  const shim: StorageShim = {
    store,
    getItem: (k) => (store.has(k) ? (store.get(k) as string) : null),
    setItem: (k, v) => {
      store.set(k, String(v));
    },
    removeItem: (k) => {
      store.delete(k);
    },
    clear: () => {
      store.clear();
    },
  };
  const g = globalThis as unknown as { window?: unknown; localStorage?: unknown };
  g.window = { localStorage: shim };
  g.localStorage = shim;
  return shim;
}

function uninstallLocalStorage(): void {
  const g = globalThis as unknown as { window?: unknown; localStorage?: unknown };
  delete g.window;
  delete g.localStorage;
}

/* ─── Pure helpers ────────────────────────────────────────────────────────── */

const DECLARATION = ["svi-radar", "trend-line", "credits", "evidence", "guide-next"] as const;

describe("sanitizeStoredIds", () => {
  it("drops unknown ids, non-strings, and duplicates while preserving order", () => {
    const result = sanitizeStoredIds(
      ["credits", "ghost", 42, "trend-line", "credits", null, "evidence"],
      DECLARATION,
    );
    expect(result).toEqual(["credits", "trend-line", "evidence"]);
  });

  it("returns an empty array for non-array input (JSON.parse mishaps)", () => {
    expect(sanitizeStoredIds(null, DECLARATION)).toEqual([]);
    expect(sanitizeStoredIds("credits", DECLARATION)).toEqual([]);
    expect(sanitizeStoredIds({ ordered: ["credits"] }, DECLARATION)).toEqual([]);
  });
});

describe("resolveWidgetOrder — SSR guarantee", () => {
  it("returns declaration order byte-for-byte when nothing is stored (case a)", () => {
    expect(resolveWidgetOrder(DECLARATION, [], [])).toEqual([...DECLARATION]);
  });

  it("appends widgets that are declared but missing from savedOrder", () => {
    const saved = ["evidence", "credits"];
    // pinned empty; savedOrder covers 2 of 5; remaining 3 fall back to
    // their declaration slot order.
    expect(resolveWidgetOrder(DECLARATION, saved, [])).toEqual([
      "evidence",
      "credits",
      "svi-radar",
      "trend-line",
      "guide-next",
    ]);
  });

  it("drops ids in savedOrder that no longer exist in declaration", () => {
    const saved = ["retired-widget", "credits", "evidence"];
    expect(resolveWidgetOrder(DECLARATION, saved, [])).toEqual([
      "credits",
      "evidence",
      "svi-radar",
      "trend-line",
      "guide-next",
    ]);
  });
});

describe("resolveWidgetOrder — pinning (case b)", () => {
  it("renders pinned ids first, in the order they were pinned", () => {
    const pinned = ["credits", "svi-radar"];
    const result = resolveWidgetOrder(DECLARATION, [], pinned);
    expect(result.slice(0, 2)).toEqual(["credits", "svi-radar"]);
    // Non-pinned tail keeps declaration order.
    expect(result.slice(2)).toEqual(["trend-line", "evidence", "guide-next"]);
  });

  it("does not duplicate a pinned id even when it also appears in savedOrder", () => {
    const result = resolveWidgetOrder(
      DECLARATION,
      ["credits", "trend-line"],
      ["credits"],
    );
    expect(result.filter((id) => id === "credits")).toHaveLength(1);
    expect(result).toEqual([
      "credits", // pinned
      "trend-line", // savedOrder (credits filtered out because pinned)
      "svi-radar",
      "evidence",
      "guide-next",
    ]);
  });

  it("ignores pinned ids that are not in declaration (self-healing)", () => {
    const result = resolveWidgetOrder(DECLARATION, [], ["ghost", "credits"]);
    expect(result[0]).toBe("credits");
    expect(result).not.toContain("ghost");
  });
});

/* ─── localStorage round-trip (case c) ────────────────────────────────────── */

describe("localStorage persistence contract", () => {
  let shim: StorageShim;

  beforeEach(() => {
    shim = installLocalStorage();
  });

  afterEach(() => {
    uninstallLocalStorage();
    vi.restoreAllMocks();
  });

  it("uses the versioned v1 storage keys", () => {
    expect(WIDGET_ORDER_KEY).toBe("blockid.dashboard.widgets.v1");
    expect(WIDGET_PINNED_KEY).toBe("blockid.dashboard.widgets.pinned.v1");
  });

  it("resolves reorder round-trip: write → read → resolve", () => {
    // Simulate a reorder that persisted the non-pinned tail.
    const tailOrder = ["evidence", "trend-line", "svi-radar", "credits", "guide-next"];
    shim.setItem(WIDGET_ORDER_KEY, JSON.stringify(tailOrder));
    shim.setItem(WIDGET_PINNED_KEY, JSON.stringify([]));

    // Round-trip: sanitize + resolve → order matches what was written.
    const savedOrder = sanitizeStoredIds(
      JSON.parse(shim.getItem(WIDGET_ORDER_KEY) ?? "[]") as unknown,
      DECLARATION,
    );
    const savedPinned = sanitizeStoredIds(
      JSON.parse(shim.getItem(WIDGET_PINNED_KEY) ?? "[]") as unknown,
      DECLARATION,
    );
    const resolved = resolveWidgetOrder(DECLARATION, savedOrder, savedPinned);
    expect(resolved).toEqual(tailOrder);
  });

  it("resolves pin round-trip: pinned id renders first even when tail order differs", () => {
    shim.setItem(WIDGET_ORDER_KEY, JSON.stringify(["evidence", "credits"]));
    shim.setItem(WIDGET_PINNED_KEY, JSON.stringify(["guide-next"]));

    const savedOrder = sanitizeStoredIds(
      JSON.parse(shim.getItem(WIDGET_ORDER_KEY) ?? "[]") as unknown,
      DECLARATION,
    );
    const savedPinned = sanitizeStoredIds(
      JSON.parse(shim.getItem(WIDGET_PINNED_KEY) ?? "[]") as unknown,
      DECLARATION,
    );
    const resolved = resolveWidgetOrder(DECLARATION, savedOrder, savedPinned);
    expect(resolved[0]).toBe("guide-next");
    expect(resolved).toEqual([
      "guide-next",
      "evidence",
      "credits",
      "svi-radar",
      "trend-line",
    ]);
  });

  it("tolerates malformed JSON in storage without throwing", () => {
    shim.setItem(WIDGET_ORDER_KEY, "{not json");
    shim.setItem(WIDGET_PINNED_KEY, "also bad]");

    // Real component wraps JSON.parse in try/catch — the pure helper
    // just needs to survive a non-array input.
    expect(sanitizeStoredIds("{not json", DECLARATION)).toEqual([]);
    expect(resolveWidgetOrder(DECLARATION, [], [])).toEqual([...DECLARATION]);
  });
});

/* ─── Server-sync cache contract (G4 #4) ──────────────────────────────────── */

describe("local layout cache (server-sync, G4 #4)", () => {
  let shim: StorageShim;

  beforeEach(() => {
    shim = installLocalStorage();
  });

  afterEach(() => {
    uninstallLocalStorage();
    vi.restoreAllMocks();
  });

  const STAMP = "2026-09-01T00:00:00.000Z";

  it("adds versioned hidden + stamp keys and the sync constants", () => {
    expect(WIDGET_HIDDEN_KEY).toBe("blockid.dashboard.widgets.hidden.v1");
    expect(WIDGET_STAMP_KEY).toBe("blockid.dashboard.widgets.updated.v1");
    expect(LAYOUT_ENDPOINT).toBe("/api/dashboard/layout");
    expect(SYNC_DEBOUNCE_MS).toBe(800);
  });

  it("readLocalLayout returns null when nothing was ever stored", () => {
    expect(readLocalLayout(DECLARATION)).toBeNull();
  });

  it("writeLocalLayout → readLocalLayout round-trips all four keys", () => {
    writeLocalLayout({
      v: 1,
      order: ["evidence", "credits"],
      pinned: ["guide-next"],
      hidden: ["trend-line"],
      updated_at: STAMP,
    });
    expect(JSON.parse(shim.getItem(WIDGET_ORDER_KEY) ?? "null")).toEqual(["evidence", "credits"]);
    expect(JSON.parse(shim.getItem(WIDGET_PINNED_KEY) ?? "null")).toEqual(["guide-next"]);
    expect(JSON.parse(shim.getItem(WIDGET_HIDDEN_KEY) ?? "null")).toEqual(["trend-line"]);
    expect(JSON.parse(shim.getItem(WIDGET_STAMP_KEY) ?? "null")).toBe(STAMP);
    expect(readLocalLayout(DECLARATION)).toEqual({
      v: 1,
      order: ["evidence", "credits"],
      pinned: ["guide-next"],
      hidden: ["trend-line"],
      updated_at: STAMP,
    });
  });

  it("pre-sync data (order/pinned, no stamp) reads back with an epoch stamp so a server copy wins", () => {
    shim.setItem(WIDGET_ORDER_KEY, JSON.stringify(["evidence", "credits"]));
    shim.setItem(WIDGET_PINNED_KEY, JSON.stringify(["guide-next"]));
    const local = readLocalLayout(DECLARATION);
    expect(local).toEqual({
      v: 1,
      order: ["evidence", "credits"],
      pinned: ["guide-next"],
      updated_at: "1970-01-01T00:00:00.000Z",
    });
    const server = { v: 1 as const, order: ["credits"], pinned: [], updated_at: STAMP };
    expect(mergeLayouts(local, server)).toMatchObject({ source: "server", writeLocal: true });
    // …but with no server copy it is pushed up as the first sync.
    expect(mergeLayouts(local, null)).toMatchObject({ source: "local", pushLocal: true });
  });

  it("filters the cache against the declared ids on read (self-healing)", () => {
    writeLocalLayout({ v: 1, order: ["ghost", "credits"], pinned: ["nope"], hidden: ["evidence"], updated_at: STAMP });
    expect(readLocalLayout(DECLARATION)).toEqual({
      v: 1,
      order: ["credits"],
      pinned: [],
      hidden: ["evidence"],
      updated_at: STAMP,
    });
  });

  it("tolerates malformed JSON in any key", () => {
    shim.setItem(WIDGET_ORDER_KEY, "{not json");
    shim.setItem(WIDGET_PINNED_KEY, JSON.stringify(["credits"]));
    shim.setItem(WIDGET_STAMP_KEY, "not-json-either");
    const local = readLocalLayout(DECLARATION);
    expect(local?.order).toEqual([]);
    expect(local?.pinned).toEqual(["credits"]);
    expect(local?.updated_at).toBe("1970-01-01T00:00:00.000Z");
  });

  it("a hidden widget is excluded from the render order but keeps its slot in the tail", () => {
    const local = {
      v: 1 as const,
      order: ["evidence", "trend-line", "credits"],
      pinned: [],
      hidden: ["trend-line"],
      updated_at: STAMP,
    };
    const order = resolveWidgetOrder(DECLARATION, local.order, local.pinned);
    const hiddenSet = new Set(local.hidden);
    expect(order.filter((id) => !hiddenSet.has(id))).toEqual(["evidence", "credits", "svi-radar", "guide-next"]);
    // Un-hiding restores it to its saved position without a reorder.
    expect(resolveWidgetOrder(DECLARATION, local.order, [])).toEqual([
      "evidence",
      "trend-line",
      "credits",
      "svi-radar",
      "guide-next",
    ]);
  });
});
