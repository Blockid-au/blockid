// Route-level auth / rate-limit classification for the security-posture scan
// (app/api/cron/security-posture, G33-T13).
//
// The scanner used to grep each route file for a list of auth identifiers, so
// every route that delegates to a shared gate — `gateIntakeRequest()`,
// `gateBatchRequest()`, founder-crud's `listHandler()`, `authenticateInstitutional()`,
// `verifySvixSignature()`, `safeEqualStrings(cronSecret())` … — was reported
// "Ungated" (≈100 of 691 on 26/09, nearly all false positives). Adding every
// helper name to the list would rot the same way, so this module RECOGNISES a
// shared gate: a route is gated when it calls (or references) an imported
// function whose body — followed through imports and same-module helpers, up
// to MAX_GATE_DEPTH hops — reaches an auth primitive. The same walk recognises
// shared rate limiters, and the proxy's BUCKET_ROUTES table (src/proxy.ts
// limits those prefixes before any handler runs) counts as a rate limit.
//
// Real findings stay: a route that reaches no primitive and carries no
// `// PUBLIC` / `@public-route` tag is still "Ungated". `apiRoute()` is the
// audit wrapper, NOT an auth gate — it is deliberately not a primitive.
//
// Pure: the file reader is injected (the route passes an fs reader; tests
// pass an in-memory map).

/** Auth primitives recognised directly in a route file (legacy list, kept). */
export const ROUTE_AUTH_RE =
  /isCronAuthorised|CRON_SECRET|process\.env\.CRON_SECRET|Bearer|getCurrentUser|requireUser|getServerSession|gateRequireFeature|requireProjectOwner|[A-Za-z]*AdminGate\s*\(|gateAdmin\s*\(|ndaGate\s*\(|authenticateRequest\s*\(|blockid_session|constructEvent\s*\(|stripe-signature/i;

/**
 * Primitives a shared gate must reach. Identifiers (not call syntax) so an
 * injected default — `(deps.validate ?? validateApiKey)(raw)` — still counts.
 * Deliberately narrower than ROUTE_AUTH_RE: no bare `Bearer` (provider
 * clients send `Authorization: Bearer <our key>` — that authenticates US).
 */
export const GATE_AUTH_PRIMITIVE_RE =
  /\b(?:getCurrentUser|requireUser|requireAdmin|isCronAuthorised|getServerSession|gateRequireFeature|requireProjectOwner|safeEqualStrings|timingSafeEqual|validateApiKey|authenticateRequest|authenticateApiKey|authenticateAPIKey|constructEvent)\b/;

export const PUBLIC_TAG_RE = /\/\/\s*PUBLIC|@public-route/i;

/** Rate-limit primitives (route file or shared helper). `consumeRateLimit` is the Postgres-backed limiter (lib/rate-limit/persistent). */
export const RATE_LIMIT_PRIMITIVE_RE =
  /\b(?:checkRateLimit|checkRateLimitAsync|enforceRateLimit|checkAuthIpCeiling|checkAuthIdentityLimit|consumeRateLimit)\b/;
export const RATE_LIMIT_EXEMPT_RE = /@rate-limit-exempt/;

/**
 * Auth gates that make a route count as rate-limit COVERED: an anonymous
 * caller is refused before any work runs, so abuse needs a session, an API
 * key, the cron secret or a valid webhook signature — each of which is
 * throttled or revocable one layer up. Deliberately narrower than
 * ROUTE_AUTH_RE / GATE_AUTH_PRIMITIVE_RE (conservative, well-known helpers
 * only):
 *   - no bare `Bearer` / `blockid_session` (provider clients send Bearer; a
 *     route can read the cookie and still serve guests — /api/rnd did);
 *   - `getCurrentUser()` counts only when its result is REFUSED when absent
 *     (`const user = await getCurrentUser(); if (!user …`) — an optional
 *     `user?.id ?? null` lookup does not gate anything.
 */
export const RATE_LIMIT_AUTH_GATE_RE =
  /\b(?:requireUser|requireAdmin|requireProjectOwner|isCronAuthorised|gateRequireFeature|gateAdmin|gateIntakeRequest|gateBatchRequest|validateApiKey|authenticateApiKey|authenticateAPIKey|authenticateSviApiKey|constructEvent|verifyWebhookSignature|verifySvixSignature|safeEqualStrings|timingSafeEqual)\b|\b[A-Za-z]+AdminGate\s*\(|\b(?:const|let)\s+(\w+)\s*=\s*await\s+getCurrentUser\(\s*\)\s*;?\s*if\s*\(\s*!\s*\1\b/;

/** Hops followed from the route: route → gate → helper → primitive. */
export const MAX_GATE_DEPTH = 3;

export interface SourceFile {
  file: string;
  src: string;
}
/** Resolve an import specifier seen in `fromFile` to its source, or null (package / missing). */
export type ModuleReader = (spec: string, fromFile: string) => SourceFile | null;

export interface ImportBinding {
  local: string;
  imported: string;
  spec: string;
}

/** Value imports of a file (`import { a, b as c } from "x"`, `import d from "x"`); type-only imports are skipped. */
export function parseImports(src: string): ImportBinding[] {
  const out: ImportBinding[] = [];
  const re = /^\s*import\s+(type\s+)?([^;]*?)\s+from\s+["']([^"']+)["']/gm;
  for (const m of src.matchAll(re)) {
    if (m[1]) continue;
    const clause = m[2];
    const spec = m[3];
    const named = /\{([^}]*)\}/.exec(clause);
    if (named) {
      for (const part of named[1].split(",")) {
        const p = part.trim();
        if (!p || p.startsWith("type ")) continue;
        const [imported, local] = p.split(/\s+as\s+/).map((s) => s.trim());
        if (imported) out.push({ imported, local: local || imported, spec });
      }
    }
    const def = /^([A-Za-z_$][\w$]*)\s*(?:,|$)/.exec(clause.trim());
    if (def && !clause.trim().startsWith("{") && !clause.trim().startsWith("*")) out.push({ imported: "default", local: def[1], spec });
  }
  return out;
}

/** Line and block comments removed — a helper that only MENTIONS getCurrentUser in a comment is not a gate. */
export function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[\s;{}(),])\/\/.*$/gm, "$1");
}

/** The file with its import statements removed (so a name in an import line is not a "use"). */
export function stripImports(src: string): string {
  return src.replace(/^\s*import\s[^;]*?from\s+["'][^"']+["'];?/gm, "").replace(/^\s*import\s+["'][^"']+["'];?/gm, "");
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const DECL_START = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\b|const\s|let\s|class\s|interface\s|type\s|enum\s)/m;

/** Top-level function / const `name` in `src`, up to the next top-level declaration; null when absent. */
export function declarationBody(src: string, name: string): string | null {
  const n = escape(name);
  const re =
    name === "default"
      ? /^export\s+default\s+/m
      : new RegExp(`^(?:export\\s+)?(?:async\\s+)?(?:function\\s*\\*?\\s*${n}\\b|(?:const|let)\\s+${n}\\b)`, "m");
  const m = re.exec(src);
  if (!m) return null;
  const start = m.index;
  const rest = src.slice(start + m[0].length);
  const next = DECL_START.exec(rest);
  return src.slice(start, next ? start + m[0].length + next.index : src.length);
}

/** `export { a, b as name } from "spec"` → { imported, spec } for `name`, else null. */
function reExportOf(src: string, name: string): { imported: string; spec: string } | null {
  for (const m of src.matchAll(/export\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)) {
    for (const part of m[1].split(",")) {
      const [imported, local] = part.trim().split(/\s+as\s+/).map((s) => s.trim());
      if ((local || imported) === name) return { imported, spec: m[2] };
    }
  }
  return null;
}

function topLevelFunctionNames(src: string): string[] {
  const names = new Set<string>();
  for (const m of src.matchAll(/^(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\(|function|[A-Za-z_$][\w$]*\s*=>)/gm)) names.add(m[1]);
  return [...names];
}

/**
 * Does `body` (code inside `file`, whose full source is `src`) reach a
 * primitive — directly, through a same-module helper, or through an
 * imported function — within `depth` hops? Returns the chain that reached it
 * (e.g. ["gateIntakeRequest", "getCurrentUser"]) or null.
 */
export function reachesPrimitive(
  body: string,
  source: SourceFile,
  primitive: RegExp,
  read: ModuleReader,
  depth: number,
  seen: Set<string> = new Set(),
): string[] | null {
  body = stripComments(body);
  const direct = primitive.exec(body);
  if (direct) return [direct[0]];
  if (depth <= 0) return null;
  const refs = (name: string) => new RegExp(`(?<![\\w$.])${escape(name)}(?![\\w$])`).test(body);
  for (const b of parseImports(source.src)) {
    if (!refs(b.local)) continue;
    let target = read(b.spec, source.file);
    let name = b.imported;
    let fnBody = target ? declarationBody(target.src, name) : null;
    // One re-export hop (`export { gate } from "./access"`).
    if (target && fnBody === null) {
      const re = reExportOf(target.src, name);
      if (re) {
        const next = read(re.spec, target.file);
        if (next) { target = next; name = re.imported; fnBody = declarationBody(next.src, name); }
      }
    }
    if (!target || fnBody === null) continue;
    const key = `${target.file}#${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const chain = reachesPrimitive(fnBody, target, primitive, read, depth - 1, seen);
    if (chain) return [b.local, ...chain];
  }
  for (const fn of topLevelFunctionNames(source.src)) {
    if (!refs(fn)) continue;
    const key = `${source.file}#${fn}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const fnBody = declarationBody(source.src, fn);
    if (fnBody === null || fnBody === body) continue;
    const chain = reachesPrimitive(fnBody, source, primitive, read, depth - 1, seen);
    if (chain) return [fn, ...chain];
  }
  return null;
}

export type AuthVia = "direct" | "shared_gate" | "public_tag";
export interface RouteAuthVerdict {
  gated: boolean;
  via: AuthVia | null;
  /** shared_gate: the call chain from the route to the primitive. */
  chain?: string[];
}

export function classifyRouteAuth(route: SourceFile, read: ModuleReader): RouteAuthVerdict {
  if (ROUTE_AUTH_RE.test(route.src)) return { gated: true, via: "direct" };
  const chain = reachesPrimitive(stripImports(route.src), route, GATE_AUTH_PRIMITIVE_RE, read, MAX_GATE_DEPTH);
  if (chain) return { gated: true, via: "shared_gate", chain };
  if (PUBLIC_TAG_RE.test(route.src)) return { gated: true, via: "public_tag" };
  return { gated: false, via: null };
}

/** `[prefix, bucket]` pairs of src/proxy.ts BUCKET_ROUTES (the prefixes only). */
export function parseProxyBucketPrefixes(proxySrc: string): string[] {
  const block = /BUCKET_ROUTES[^=]*=\s*\[([\s\S]*?)\n\];/.exec(proxySrc);
  if (!block) return [];
  return [...block[1].matchAll(/\[\s*"(\/api[^"]*)"\s*,\s*"[^"]+"\s*\]/g)].map((m) => m[1]);
}

/** Same matching as proxy.ts `bucketFor`. */
export function matchesProxyBucket(urlPath: string, prefixes: readonly string[]): string | null {
  for (const prefix of prefixes) {
    if (prefix.endsWith("/")) {
      if (urlPath.startsWith(prefix) || urlPath + "/" === prefix) return prefix;
    } else if (urlPath === prefix || urlPath.startsWith(prefix + "/")) return prefix;
  }
  return null;
}

/** "api/lead/route.ts" (relative to src/app) → "/api/lead"; route groups `(x)` dropped. */
export function routeUrlPath(relative: string): string {
  const parts = relative.replace(/\/route\.tsx?$/, "").split("/").filter((p) => p && !/^\(.*\)$/.test(p));
  return "/" + parts.join("/");
}

export type RateLimitVia = "direct" | "shared_helper" | "proxy_bucket" | "exempt" | "auth_gated";
export interface RouteRateLimitVerdict {
  limited: boolean;
  via: RateLimitVia | null;
  detail?: string;
}

/**
 * A route is rate-limit COVERED when it calls a limiter (directly or through a
 * shared helper), sits under a src/proxy.ts bucket prefix, is tagged
 * `@rate-limit-exempt`, or refuses anonymous callers through a well-known
 * auth gate (RATE_LIMIT_AUTH_GATE_RE, directly or through a shared helper).
 */
export function classifyRouteRateLimit(route: SourceFile, relative: string, read: ModuleReader, proxyPrefixes: readonly string[]): RouteRateLimitVerdict {
  if (RATE_LIMIT_EXEMPT_RE.test(route.src)) return { limited: true, via: "exempt" };
  const stripped = stripImports(route.src);
  // Comments stripped: a note that says "no checkRateLimit here" is not a limiter.
  const direct = RATE_LIMIT_PRIMITIVE_RE.exec(stripComments(stripped));
  if (direct) return { limited: true, via: "direct", detail: direct[0] };
  const prefix = matchesProxyBucket(routeUrlPath(relative), proxyPrefixes);
  if (prefix) return { limited: true, via: "proxy_bucket", detail: prefix };
  const chain = reachesPrimitive(stripped, route, RATE_LIMIT_PRIMITIVE_RE, read, MAX_GATE_DEPTH);
  if (chain) return { limited: true, via: "shared_helper", detail: chain.join(" → ") };
  const gate = reachesPrimitive(stripped, route, RATE_LIMIT_AUTH_GATE_RE, read, MAX_GATE_DEPTH);
  if (gate) return { limited: true, via: "auth_gated", detail: gate.join(" → ") };
  return { limited: false, via: null };
}

/** HTTP methods a route module exports (`export async function POST`, `export const POST =`, `export { handler as POST }`). */
export function exportedMethods(src: string): string[] {
  const methods = new Set<string>();
  for (const m of src.matchAll(/^export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/gm)) methods.add(m[1]);
  for (const m of src.matchAll(/^export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\b/gm)) methods.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(",")) {
      const alias = part.trim().split(/\s+as\s+/)[1]?.trim() ?? part.trim();
      if (/^(GET|POST|PUT|PATCH|DELETE)$/.test(alias)) methods.add(alias);
    }
  }
  return [...methods];
}

/** fs-backed ModuleReader for `@/…` and relative specifiers (cached). */
export function createFsModuleReader(srcDir: string, readFile: (path: string) => string | null): ModuleReader {
  const cache = new Map<string, SourceFile | null>();
  const dirname = (f: string) => f.slice(0, f.lastIndexOf("/"));
  const normalise = (p: string) => {
    const out: string[] = [];
    for (const seg of p.split("/")) {
      if (seg === "..") out.pop();
      else if (seg !== ".") out.push(seg);
    }
    return out.join("/");
  };
  return (spec, fromFile) => {
    let base: string | null = null;
    if (spec.startsWith("@/")) base = `${srcDir}/${spec.slice(2)}`;
    else if (spec.startsWith("./") || spec.startsWith("../")) base = normalise(`${dirname(fromFile)}/${spec}`);
    if (!base) return null;
    if (cache.has(base)) return cache.get(base)!;
    let found: SourceFile | null = null;
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
      if (!/\.tsx?$/.test(candidate)) continue;
      const src = readFile(candidate);
      if (src !== null) { found = { file: candidate, src }; break; }
    }
    cache.set(base, found);
    return found;
  };
}
