// Stale-build chunk errors (2026-09-19 incident, /funding).
//
// The zero-downtime deploy swaps releases/<BUILD_ID>; a browser tab that loaded
// its HTML before the swap still asks for the OLD content-hashed chunks on the
// next client-side navigation. If the origin no longer has them, webpack throws
// `ChunkLoadError` (or the dynamic-import variant) and every error boundary
// renders "Something went wrong" — for the *new* page the user just clicked.
//
// Two defences, both cheap:
//   1. deploy-live.sh unions the previous releases' `.next/static` into the new
//      release, so old chunks keep serving after a swap (this file is defence 2).
//   2. The error boundaries call `reloadOnceForStaleChunk()` — one hard reload
//      per pathname, guarded by sessionStorage, so a genuinely broken bundle
//      cannot loop.
//
// Pure helpers only; the boundaries own the DOM calls.

export const CHUNK_ERROR_RE =
  /ChunkLoadError|Loading chunk [\w-]+ failed|Loading CSS chunk|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i;

export function isChunkLoadError(err: unknown): boolean {
  if (!err) return false;
  const e = err as { name?: unknown; message?: unknown };
  const name = typeof e.name === "string" ? e.name : "";
  const message = typeof e.message === "string" ? e.message : typeof err === "string" ? err : "";
  return name === "ChunkLoadError" || CHUNK_ERROR_RE.test(message);
}

export const RELOAD_GUARD_PREFIX = "blockid:chunk-reload:";
export const RELOAD_GUARD_TTL_MS = 30_000;

/** Storage-agnostic core so the guard is unit-testable without a DOM. */
export function shouldReloadForStaleChunk(
  err: unknown,
  pathname: string,
  store: { getItem(k: string): string | null; setItem(k: string, v: string): void } | null,
): boolean {
  if (!isChunkLoadError(err)) return false;
  if (!store) return true; // no storage → reload once anyway (cannot loop-guard, but the page is already broken)
  const key = RELOAD_GUARD_PREFIX + pathname;
  try {
    // A guard older than 30 s is stale (the reload it protected is long
    // over) — otherwise a path could never auto-recover after its first
    // deploy of the day (G16 review).
    const prev = Number(store.getItem(key) ?? "");
    if (Number.isFinite(prev) && prev > 0 && Date.now() - prev < RELOAD_GUARD_TTL_MS) return false;
    store.setItem(key, String(Date.now()));
    return true;
  } catch {
    return true;
  }
}

/**
 * Browser entry point for the error boundaries. Returns true when a reload was
 * issued (callers should render a minimal "Updating…" card instead of the
 * generic error UI so the user never sees a red screen for a stale tab).
 */
export function reloadOnceForStaleChunk(err: unknown): boolean {
  if (typeof window === "undefined") return false;
  let store: Storage | null = null;
  try {
    store = window.sessionStorage;
  } catch {
    store = null;
  }
  if (!shouldReloadForStaleChunk(err, window.location.pathname, store)) return false;
  window.location.reload();
  return true;
}
