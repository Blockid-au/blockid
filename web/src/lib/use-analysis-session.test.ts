// Colocated vitest for `use-analysis-session.ts` — the client-side hook that
// mirrors the free-tier "recent analyses" list into `localStorage` under the
// `blockid_analyses` key. Consumed by the anonymous-visitor result-history
// panel; if any of its invariants regress the founder loses (or duplicates)
// their saved analyses across reloads.
//
// Pinned invariants:
//   1. Hydration lives in useEffect (mount-only) so the first server render
//      never observes `localStorage` and never diverges from the client render.
//   2. Reading/writing/parsing errors are swallowed — a corrupt jar must never
//      crash the page.
//   3. `save` is prepend + dedupe-by-slug + cap at MAX_SAVED (20). Re-saving
//      an existing slug promotes it to the head (LRU semantics), and the
//      oldest tail is dropped once the cap is exceeded.
//   4. `remove` filters by slug and persists the reduced list.
//   5. Every optional field on `SavedAnalysis` (notably `email`) round-trips
//      through JSON.stringify → JSON.parse unchanged.
//
// The React runtime is not present in the vitest node env; useState/useEffect/
// useCallback are shimmed so we can drive the hook synchronously and re-read
// state by re-invoking the hook.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface SavedAnalysis {
  slug: string;
  totalSVI: number;
  stage: number;
  stageLabel: string;
  summary: string;
  createdAt: string;
  inputPreview: string;
  email?: string;
}

// ── React shim ─────────────────────────────────────────────────────

interface HookState {
  value: SavedAnalysis[];
  initialised: boolean;
}

let hookState: HookState;
let pendingEffects: Array<() => void>;

vi.mock("react", () => ({
  useState: <T,>(init: T | (() => T)): [T, (u: T | ((p: T) => T)) => void] => {
    if (!hookState.initialised) {
      const initial = typeof init === "function" ? (init as () => T)() : init;
      hookState.value = initial as unknown as SavedAnalysis[];
      hookState.initialised = true;
    }
    const setter = (updater: T | ((p: T) => T)): void => {
      const prev = hookState.value as unknown as T;
      const next = typeof updater === "function"
        ? (updater as (p: T) => T)(prev)
        : updater;
      hookState.value = next as unknown as SavedAnalysis[];
    };
    return [hookState.value as unknown as T, setter];
  },
  useEffect: (fn: () => void): void => {
    pendingEffects.push(fn);
  },
  useCallback: <T,>(fn: T): T => fn,
}));

import { useAnalysisSessions } from "./use-analysis-session";

// ── fake localStorage ──────────────────────────────────────────────

interface FakeStorage {
  store: Map<string, string>;
  failGet: boolean;
  failSet: boolean;
  getItem(key: string): string | null;
  setItem(key: string, val: string): void;
  removeItem(key: string): void;
  clear(): void;
}

let storage: FakeStorage;

function installStorage(): FakeStorage {
  const store = new Map<string, string>();
  const s: FakeStorage = {
    store,
    failGet: false,
    failSet: false,
    getItem(k) {
      if (s.failGet) throw new Error("QuotaExceededError: getItem");
      return store.has(k) ? (store.get(k) as string) : null;
    },
    setItem(k, v) {
      if (s.failSet) throw new Error("QuotaExceededError: setItem");
      store.set(k, v);
    },
    removeItem(k) {
      store.delete(k);
    },
    clear() {
      store.clear();
    },
  };
  storage = s;
  (globalThis as { localStorage?: unknown }).localStorage = s;
  return s;
}

function uninstallStorage(): void {
  delete (globalThis as { localStorage?: unknown }).localStorage;
}

function mkAnalysis(slug: string, overrides: Partial<SavedAnalysis> = {}): SavedAnalysis {
  return {
    slug,
    totalSVI: 42,
    stage: 3,
    stageLabel: "Validation",
    summary: `${slug}-summary`,
    createdAt: "2026-08-06T00:00:00Z",
    inputPreview: `${slug}-preview`,
    ...overrides,
  };
}

function runPendingEffects(): void {
  const drained = pendingEffects.splice(0, pendingEffects.length);
  for (const fn of drained) fn();
}

beforeEach(() => {
  hookState = { value: [], initialised: false };
  pendingEffects = [];
  installStorage();
});

afterEach(() => {
  uninstallStorage();
});

// ── hydration ──────────────────────────────────────────────────────

describe("useAnalysisSessions — hydration", () => {
  it("empty localStorage yields analyses = []", () => {
    useAnalysisSessions();
    runPendingEffects();
    const { analyses } = useAnalysisSessions();
    expect(analyses).toEqual([]);
  });

  it("hydrates the persisted entries into state on mount", () => {
    const seed = [mkAnalysis("s1"), mkAnalysis("s2")];
    storage.store.set("blockid_analyses", JSON.stringify(seed));
    useAnalysisSessions();
    runPendingEffects();
    const { analyses } = useAnalysisSessions();
    expect(analyses).toEqual(seed);
  });

  it("reads from the `blockid_analyses` storage key on mount", () => {
    const keys: string[] = [];
    const orig = storage.getItem.bind(storage);
    storage.getItem = (k: string) => {
      keys.push(k);
      return orig(k);
    };
    useAnalysisSessions();
    runPendingEffects();
    expect(keys).toContain("blockid_analyses");
  });

  it("malformed JSON is swallowed — analyses stays [] and nothing throws", () => {
    storage.store.set("blockid_analyses", "{not-json");
    useAnalysisSessions();
    expect(() => runPendingEffects()).not.toThrow();
    const { analyses } = useAnalysisSessions();
    expect(analyses).toEqual([]);
  });

  it("localStorage.getItem throwing (QuotaExceeded / SecurityError) is swallowed", () => {
    storage.failGet = true;
    useAnalysisSessions();
    expect(() => runPendingEffects()).not.toThrow();
    const { analyses } = useAnalysisSessions();
    expect(analyses).toEqual([]);
  });

  it("first render (before the mount effect fires) returns []", () => {
    // Pins the SSR-safe split: `useState([])` init + hydration only in the
    // effect. If a rewrite moved the localStorage read into the initializer
    // the render server-side would either throw or diverge from the client.
    storage.store.set("blockid_analyses", JSON.stringify([mkAnalysis("x")]));
    const { analyses } = useAnalysisSessions();
    expect(analyses).toEqual([]);
  });
});

// ── save ──────────────────────────────────────────────────────────

describe("useAnalysisSessions — save", () => {
  it("save inserts a new entry into analyses", () => {
    const { save } = useAnalysisSessions();
    runPendingEffects();
    save(mkAnalysis("a"));
    const { analyses } = useAnalysisSessions();
    expect(analyses.map(a => a.slug)).toEqual(["a"]);
  });

  it("save writes the updated array to localStorage under the storage key", () => {
    const { save } = useAnalysisSessions();
    runPendingEffects();
    save(mkAnalysis("a"));
    const raw = storage.store.get("blockid_analyses");
    expect(raw).toBeDefined();
    const parsed = JSON.parse(raw as string) as SavedAnalysis[];
    expect(parsed.map(x => x.slug)).toEqual(["a"]);
  });

  it("save prepends new entries so the newest sits at index 0", () => {
    const { save } = useAnalysisSessions();
    runPendingEffects();
    save(mkAnalysis("first"));
    save(mkAnalysis("second"));
    save(mkAnalysis("third"));
    const { analyses } = useAnalysisSessions();
    expect(analyses.map(a => a.slug)).toEqual(["third", "second", "first"]);
  });

  it("save deduplicates by slug — re-saving replaces the prior entry", () => {
    const { save } = useAnalysisSessions();
    runPendingEffects();
    save(mkAnalysis("dup", { summary: "v1" }));
    save(mkAnalysis("dup", { summary: "v2" }));
    const { analyses } = useAnalysisSessions();
    expect(analyses).toHaveLength(1);
    expect(analyses[0].summary).toBe("v2");
  });

  it("re-saving an existing slug promotes it to the head (LRU semantics)", () => {
    const { save } = useAnalysisSessions();
    runPendingEffects();
    save(mkAnalysis("a"));
    save(mkAnalysis("b"));
    save(mkAnalysis("a", { summary: "a-updated" }));
    const { analyses } = useAnalysisSessions();
    expect(analyses.map(x => x.slug)).toEqual(["a", "b"]);
    expect(analyses[0].summary).toBe("a-updated");
  });

  it("save caps the stored history at MAX_SAVED=20 by dropping the oldest tail", () => {
    const { save } = useAnalysisSessions();
    runPendingEffects();
    for (let i = 0; i < 25; i += 1) save(mkAnalysis(`s${i}`));
    const { analyses } = useAnalysisSessions();
    expect(analyses).toHaveLength(20);
    // Newest 20 kept — index 0 = s24, tail = s5 (s0..s4 dropped).
    expect(analyses[0].slug).toBe("s24");
    expect(analyses[analyses.length - 1].slug).toBe("s5");
  });

  it("save round-trips the optional `email` field through localStorage", () => {
    const { save } = useAnalysisSessions();
    runPendingEffects();
    save(mkAnalysis("with-email", { email: "founder@example.com" }));
    const parsed = JSON.parse(storage.store.get("blockid_analyses") as string) as SavedAnalysis[];
    expect(parsed[0].email).toBe("founder@example.com");
  });

  it("save round-trips every SavedAnalysis field unchanged", () => {
    const { save } = useAnalysisSessions();
    runPendingEffects();
    const entry = mkAnalysis("full", {
      totalSVI: 87,
      stage: 5,
      stageLabel: "Growth",
      summary: "shipped-summary",
      createdAt: "2026-08-06T10:00:00Z",
      inputPreview: "founder input preview",
      email: "x@y.z",
    });
    save(entry);
    const parsed = JSON.parse(storage.store.get("blockid_analyses") as string) as SavedAnalysis[];
    expect(parsed[0]).toEqual(entry);
  });

  it("save with a throwing setItem still updates in-memory analyses without escaping the throw", () => {
    const { save } = useAnalysisSessions();
    runPendingEffects();
    storage.failSet = true;
    expect(() => save(mkAnalysis("q"))).not.toThrow();
    const { analyses } = useAnalysisSessions();
    expect(analyses.map(a => a.slug)).toEqual(["q"]);
  });

  it("save after hydration merges with the persisted seed instead of clobbering it", () => {
    const seed = [mkAnalysis("seed1"), mkAnalysis("seed2")];
    storage.store.set("blockid_analyses", JSON.stringify(seed));
    useAnalysisSessions();
    runPendingEffects();
    const { save } = useAnalysisSessions();
    save(mkAnalysis("fresh"));
    const { analyses } = useAnalysisSessions();
    expect(analyses.map(x => x.slug)).toEqual(["fresh", "seed1", "seed2"]);
  });

  it("save persists a payload whose parsed shape matches the in-memory state exactly", () => {
    // Guards against a rewrite that persists a shape-projected subset
    // (e.g. drops `inputPreview` to save quota) — the round-trip through
    // localStorage must be lossless so a page reload rehydrates identically.
    const { save } = useAnalysisSessions();
    runPendingEffects();
    save(mkAnalysis("a"));
    save(mkAnalysis("b"));
    const parsed = JSON.parse(storage.store.get("blockid_analyses") as string) as SavedAnalysis[];
    const { analyses } = useAnalysisSessions();
    expect(parsed).toEqual(analyses);
  });
});

// ── remove ─────────────────────────────────────────────────────────

describe("useAnalysisSessions — remove", () => {
  it("remove drops the entry whose slug matches", () => {
    const { save, remove } = useAnalysisSessions();
    runPendingEffects();
    save(mkAnalysis("a"));
    save(mkAnalysis("b"));
    save(mkAnalysis("c"));
    remove("b");
    const { analyses } = useAnalysisSessions();
    expect(analyses.map(a => a.slug)).toEqual(["c", "a"]);
  });

  it("remove is a no-op when the slug is not present", () => {
    const { save, remove } = useAnalysisSessions();
    runPendingEffects();
    save(mkAnalysis("a"));
    remove("nonexistent");
    const { analyses } = useAnalysisSessions();
    expect(analyses.map(a => a.slug)).toEqual(["a"]);
  });

  it("remove persists the reduced list to localStorage", () => {
    const { save, remove } = useAnalysisSessions();
    runPendingEffects();
    save(mkAnalysis("a"));
    save(mkAnalysis("b"));
    remove("a");
    const parsed = JSON.parse(storage.store.get("blockid_analyses") as string) as SavedAnalysis[];
    expect(parsed.map(a => a.slug)).toEqual(["b"]);
  });

  it("removing the last entry persists an empty array (not `undefined` or a wiped key)", () => {
    const { save, remove } = useAnalysisSessions();
    runPendingEffects();
    save(mkAnalysis("only"));
    remove("only");
    const raw = storage.store.get("blockid_analyses");
    expect(raw).toBe("[]");
    const { analyses } = useAnalysisSessions();
    expect(analyses).toEqual([]);
  });

  it("remove with a throwing setItem still drops the in-memory entry without escaping the throw", () => {
    const { save, remove } = useAnalysisSessions();
    runPendingEffects();
    save(mkAnalysis("a"));
    storage.failSet = true;
    expect(() => remove("a")).not.toThrow();
    const { analyses } = useAnalysisSessions();
    expect(analyses).toEqual([]);
  });
});

// ── returned api shape ─────────────────────────────────────────────

describe("useAnalysisSessions — return shape", () => {
  it("returns an object with exactly the { analyses, save, remove } keys", () => {
    const api = useAnalysisSessions();
    expect(Object.keys(api).sort()).toEqual(["analyses", "remove", "save"]);
    expect(Array.isArray(api.analyses)).toBe(true);
    expect(typeof api.save).toBe("function");
    expect(typeof api.remove).toBe("function");
  });

  it("analyses is initially an empty array (matches the useState initializer)", () => {
    const { analyses } = useAnalysisSessions();
    expect(analyses).toEqual([]);
  });
});
