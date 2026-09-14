/**
 * Hash sources for the inline scripts of a prerendered / ISR page, read
 * from the document Next will serve (S31-D).
 *
 * Next's file-system incremental cache keeps every static and ISR app page
 * as `<distDir>/server/app/<pathname>.html` (+ `.rsc`, `.meta`) — written
 * by `next build` for prerendered routes and rewritten in place on every
 * background regeneration. Whatever Next serves for a cached route is the
 * content of that file, so hashing its inline `<script>` bodies yields a
 * `script-src` that matches the page byte for byte, without a nonce and
 * without `'unsafe-inline'`. That is what lets the page be shared-cached.
 *
 * Lookup cost: one `statSync` per request (µs); the hashes are recomputed
 * only when mtime/size change (i.e. on regeneration) — a ~150 KB parse +
 * SHA-256 per page per revalidate window.
 *
 * Regeneration race: Next swaps its in-memory entry and rewrites the file
 * at (nearly) the same moment. A request that straddles the swap could be
 * served the new document with hashes read from the old file, or vice
 * versa. Both directions are covered by keeping the previous hash sets in
 * the policy for `GRACE_MS` after a change — a hash source only says "this
 * exact script text may run", so allowing yesterday's flight payload next
 * to today's costs nothing security-wise.
 *
 * Returns `null` when there is no document for the route (dynamic route,
 * ISR route never rendered, unsafe pathname) — the caller then falls back
 * to the nonce policy, which is always correct for a per-request render.
 */

import { readFileSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { extractInlineScriptHashes } from "./inline-script-hashes";

const GRACE_MS = 10 * 60 * 1000;
const MAX_PREVIOUS_SETS = 3;
const MAX_PATHNAME_LENGTH = 512;

interface Entry {
  mtimeMs: number;
  size: number;
  hashes: readonly string[];
  /** Earlier hash sets, newest first, with the time they were superseded. */
  previous: Array<{ hashes: readonly string[]; supersededAt: number }>;
}

const cache = new Map<string, Entry>();

// Pathnames Next can map onto a cache file and that can never leave the
// app dir: segments of URL-safe characters, no dot-segments, no encoding.
const SAFE_PATHNAME = /^\/(?:[A-Za-z0-9_\-~.]+(?:\/[A-Za-z0-9_\-~.]+)*)?$/;

/** Where the incremental cache keeps app-page documents for this process. */
export function prerenderHtmlDir(env: NodeJS.ProcessEnv = process.env): string {
  if (env.BLOCKID_PRERENDER_HTML_DIR) return resolve(env.BLOCKID_PRERENDER_HTML_DIR);
  return join(process.cwd(), ".next", "server", "app");
}

/** `/` → `<dir>/index.html`, `/funding/grants` → `<dir>/funding/grants.html`; null when unsafe. */
export function prerenderHtmlPath(pathname: string, dir: string = prerenderHtmlDir()): string | null {
  if (pathname.length > MAX_PATHNAME_LENGTH || !SAFE_PATHNAME.test(pathname)) return null;
  if (pathname.split("/").some((seg) => seg === "." || seg === "..")) return null;
  const rel = pathname === "/" ? "index" : pathname.slice(1);
  const file = resolve(dir, `${rel}.html`);
  const root = resolve(dir) + sep;
  if (!file.startsWith(root)) return null;
  return file;
}

/**
 * Hash sources (current ∪ recent previous) for the cached document of
 * `pathname`, or null when no such document exists.
 */
export function prerenderScriptHashes(
  pathname: string,
  opts: { dir?: string; now?: number } = {},
): readonly string[] | null {
  const file = prerenderHtmlPath(pathname, opts.dir);
  if (!file) return null;
  const now = opts.now ?? Date.now();

  let mtimeMs: number;
  let size: number;
  try {
    const st = statSync(file);
    if (!st.isFile()) return null;
    mtimeMs = st.mtimeMs;
    size = st.size;
  } catch {
    cache.delete(file);
    return null;
  }

  let entry = cache.get(file);
  if (!entry || entry.mtimeMs !== mtimeMs || entry.size !== size) {
    let html: string;
    try {
      html = readFileSync(file, "utf8");
    } catch {
      cache.delete(file);
      return null;
    }
    const hashes = extractInlineScriptHashes(html);
    const previous = entry
      ? [{ hashes: entry.hashes, supersededAt: now }, ...entry.previous].slice(0, MAX_PREVIOUS_SETS)
      : [];
    entry = { mtimeMs, size, hashes, previous };
    cache.set(file, entry);
  }

  entry.previous = entry.previous.filter((p) => now - p.supersededAt < GRACE_MS);
  if (entry.previous.length === 0) return entry.hashes;
  const union = new Set<string>(entry.hashes);
  for (const p of entry.previous) for (const h of p.hashes) union.add(h);
  return Array.from(union);
}

/** @internal — tests only. */
export function resetPrerenderScriptHashCache(): void {
  cache.clear();
}
