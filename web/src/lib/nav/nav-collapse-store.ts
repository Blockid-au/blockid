// Tiny `useSyncExternalStore` wrapper over `localStorage` for per-user
// sidebar pillar collapse state. Framework-free so mobile-nav and the
// command-palette can share the same store later without pulling in
// React context.
//
// Storage shape:
//   { [pillarLabel: string]: boolean }   // true == collapsed
//
// SSR: `getServerSnapshot()` returns the caller's `defaultState`, matching
// the pattern used by `UnlockPulseCard` in workspace-layout.tsx. This
// avoids the classic useEffect+setState hydration flip.

import * as React from "react";

export const NAV_COLLAPSE_STORAGE_KEY = "blockid_nav_collapse_v1";

type CollapseState = Record<string, boolean>;

// A single module-scoped subscriber set so multiple hook instances mount
// in the same page share the same store without re-parsing localStorage
// on every render.
const listeners = new Set<() => void>();

function readFromStorage(): { raw: string; parsed: CollapseState } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(NAV_COLLAPSE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") {
      const out: CollapseState = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === "boolean") out[k] = v;
      }
      return { raw, parsed: out };
    }
  } catch {
    /* corrupt JSON — fall through to null */
  }
  return null;
}

function writeToStorage(next: CollapseState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NAV_COLLAPSE_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* quota / private mode — ignore */
  }
}

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Cross-tab sync — a toggle in tab A propagates to tab B.
  const onStorage = (e: StorageEvent) => {
    if (e.key === NAV_COLLAPSE_STORAGE_KEY) listener();
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

/**
 * Snapshot cache — keyed by JSON.stringify(defaultState) + the raw
 * localStorage string. Required to keep `useSyncExternalStore` stable
 * across renders (React compares by reference and will loop forever if
 * we hand back a fresh object each call). We key on the raw JSON string
 * rather than the parsed object because `readFromStorage()` returns a
 * fresh parsed object every call.
 */
const snapshotCache = new Map<string, CollapseState>();

function getMergedSnapshot(defaultState: CollapseState): CollapseState {
  const stored = readFromStorage();
  const rawJson = stored?.raw ?? "";
  const key = `${JSON.stringify(defaultState)}::${rawJson}`;
  const cached = snapshotCache.get(key);
  if (cached) return cached;
  // Shallow merge — defaults first, storage overrides. New object identity
  // only when the cache key changes.
  const merged: CollapseState = { ...defaultState };
  if (stored) {
    for (const [k, v] of Object.entries(stored.parsed)) merged[k] = v;
  }
  snapshotCache.set(key, merged);
  return merged;
}

/**
 * Hook — returns the merged collapse state and a stable toggle callback.
 * Values not present in storage fall back to `defaultState[label] ?? true`
 * so a newly-added pillar defaults to collapsed unless the caller says
 * otherwise.
 *
 * @param defaultState - per-pillar defaults (label → collapsed?).
 */
export function useNavCollapse(
  defaultState: CollapseState,
): [CollapseState, (label: string) => void, () => void] {
  const state = React.useSyncExternalStore(
    subscribe,
    () => getMergedSnapshot(defaultState),
    () => defaultState,
  );

  const toggle = React.useCallback((label: string) => {
    const stored = readFromStorage();
    const current: CollapseState = stored ? stored.parsed : {};
    // Compute against the merged view so first-toggle inverts the *displayed*
    // value even when no override exists yet.
    const merged = getMergedSnapshot(defaultState);
    const next: CollapseState = { ...current, [label]: !merged[label] };
    writeToStorage(next);
    // Bust the snapshot cache so subscribers re-read.
    snapshotCache.clear();
    emit();
  }, [defaultState]);

  const reset = React.useCallback(() => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(NAV_COLLAPSE_STORAGE_KEY);
      } catch {
        /* ignore */
      }
    }
    snapshotCache.clear();
    emit();
  }, []);

  return [state, toggle, reset];
}
