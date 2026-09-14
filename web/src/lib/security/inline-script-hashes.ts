/**
 * SHA-256 CSP hash sources — server-side half of `inline-scripts.ts`.
 *
 *   • `firstPartyInlineScriptHashes()` — the app's own inline snippets
 *     (theme restore, consent default, GTM / GA bootstraps). Included in
 *     BOTH CSP modes so the root layout never needs the request nonce.
 *   • `extractInlineScriptHashes(html)` — every executable inline
 *     `<script>` in a rendered document (Next's `self.__next_f.push(…)`
 *     flight-data scripts, `__next_s` beforeInteractive wrappers, React's
 *     `$RC`/`$RB` streaming helpers, our own snippets). Used by the proxy
 *     to build the hash policy for a prerendered / ISR page from the exact
 *     HTML Next will serve (`lib/security/prerender-script-hashes.ts`).
 *
 * Why hashes of the served HTML and not a build-time list: the flight
 * payload script is different for every page and every regeneration, so
 * no static list can cover it; the nonce covered it only because the page
 * was rendered per request. Hashing the cached document is the one way to
 * keep `script-src` free of `'unsafe-inline'` on a cacheable page.
 */

import { createHash } from "node:crypto";
import { analyticsIdsFromEnv, firstPartyInlineScripts, type AnalyticsIds } from "./inline-scripts";

/** `'sha256-<base64>'` CSP hash source of an inline script's exact text. */
export function cspHashSource(script: string): string {
  return `'sha256-${createHash("sha256").update(script, "utf8").digest("base64")}'`;
}

let memo: { key: string; hashes: readonly string[] } | null = null;

/**
 * Hash sources for every first-party inline script, memoised per env
 * snapshot — the proxy calls this on every request.
 */
export function firstPartyInlineScriptHashes(ids: AnalyticsIds = analyticsIdsFromEnv()): readonly string[] {
  const key = `${ids.gaMeasurementId ?? ""}|${ids.gtmId ?? ""}`;
  if (memo && memo.key === key) return memo.hashes;
  const hashes = firstPartyInlineScripts(ids).map(cspHashSource);
  memo = { key, hashes };
  return hashes;
}

// `<script …>` opening tags whose attributes carry no `src` and whose `type`
// (if any) is a JavaScript one. Data blocks (`application/ld+json`,
// `application/json`, `importmap` …) are never executed and never checked
// by CSP, so they are skipped. Attribute values may hold `>` inside quotes
// (not in Next's output, but be safe): the attribute scanner is quote-aware.
const SCRIPT_OPEN = /<script(?=[\s>])/gi;
const SCRIPT_CLOSE = /<\/script\s*>/gi;
const JS_TYPES = new Set(["", "module", "text/javascript", "application/javascript", "text/ecmascript", "application/ecmascript", "text/jscript"]);

function readTag(html: string, at: number): { end: number; attrs: string } | null {
  let i = at + "<script".length;
  let quote: string | null = null;
  for (; i < html.length; i++) {
    const ch = html[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === ">") {
      return { end: i + 1, attrs: html.slice(at + "<script".length, i) };
    }
  }
  return null;
}

function attr(attrs: string, name: string): string | null {
  const re = new RegExp(`(?:^|\\s)${name}(?:\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+)))?(?=\\s|$)`, "i");
  const m = re.exec(attrs);
  if (!m) return null;
  return m[2] ?? m[3] ?? m[4] ?? "";
}

/**
 * Inline script bodies of a document, in source order, exactly as the
 * browser will hash them (raw text between the tags — script content is
 * never entity-decoded).
 */
export function extractInlineScripts(html: string): string[] {
  const out: string[] = [];
  SCRIPT_OPEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SCRIPT_OPEN.exec(html))) {
    const tag = readTag(html, m.index);
    if (!tag) break;
    SCRIPT_CLOSE.lastIndex = tag.end;
    const closeMatch = SCRIPT_CLOSE.exec(html);
    if (!closeMatch) break;
    const close = closeMatch.index;
    SCRIPT_OPEN.lastIndex = close + closeMatch[0].length;
    if (attr(tag.attrs, "src") !== null) continue;
    const type = (attr(tag.attrs, "type") ?? "").trim().toLowerCase();
    if (!JS_TYPES.has(type)) continue;
    const body = html.slice(tag.end, close);
    if (body.length === 0) continue;
    out.push(body);
  }
  return out;
}

/** Deduplicated hash sources of every executable inline script in `html`. */
export function extractInlineScriptHashes(html: string): string[] {
  const seen = new Set<string>();
  for (const body of extractInlineScripts(html)) seen.add(cspHashSource(body));
  return Array.from(seen);
}
