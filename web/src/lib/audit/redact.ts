// S20-A — pure helpers shared by the apiRoute wrapper, the audit-log page
// and the tests: route → family/action naming, detail redaction, IP hashing
// and user-agent classification. No I/O, no framework imports.

import { createHash } from "node:crypto";

export type MutationMethod = "POST" | "PUT" | "PATCH" | "DELETE";

export const MUTATION_METHODS: readonly MutationMethod[] = Object.freeze([
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
]);

export function isMutationMethod(m: string): m is MutationMethod {
  return (MUTATION_METHODS as readonly string[]).includes(m);
}

const VERB: Record<MutationMethod, string> = {
  POST: "create",
  PUT: "update",
  PATCH: "update",
  DELETE: "delete",
};

/**
 * `"api/projects/[id]/members/route.ts"` → `"projects.members"`.
 * Dynamic segments (`[id]`, `[...slug]`) and route groups (`(group)`) are
 * dropped so every request to one route family shares one name.
 */
export function routeFamily(route: string): string {
  return route
    .replace(/^\/?/, "")
    .replace(/^src\/app\//, "")
    .replace(/^api\//, "")
    .replace(/\/?route\.tsx?$/, "")
    .split("/")
    .filter((seg) => seg && !seg.startsWith("[") && !seg.startsWith("("))
    .map((seg) => seg.replace(/[^a-z0-9_-]/gi, "").toLowerCase())
    .filter(Boolean)
    .join(".") || "root";
}

/** `"api/projects/[id]/route.ts"` → `"/api/projects/:id"` (what we store as `route`). */
export function routePattern(route: string): string {
  const inner = route
    .replace(/^\/?/, "")
    .replace(/^src\/app\//, "")
    .replace(/\/?route\.tsx?$/, "")
    .split("/")
    .filter((seg) => seg && !seg.startsWith("("))
    .map((seg) => (seg.startsWith("[") ? ":" + seg.replace(/^\[\.{0,3}|\]$/g, "") : seg))
    .join("/");
  return "/" + inner;
}

/** Default action name: `<family>.<verb>` (`projects.members.create`). */
export function defaultAction(route: string, method: MutationMethod): string {
  return `${routeFamily(route)}.${VERB[method]}`;
}

/** Last family segment, singularised naively: `projects.members` → `member`. */
export function defaultEntity(route: string): string {
  const fam = routeFamily(route);
  const last = fam.split(".").pop() ?? fam;
  if (last.endsWith("yses")) return last.slice(0, -4) + "ysis";
  if (last.endsWith("ies")) return last.slice(0, -3) + "y";
  if (last.endsWith("s") && !last.endsWith("ss")) return last.slice(0, -1);
  return last;
}

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

const SENSITIVE_KEY_RE =
  /^(?:.*(?:token|secret|password|passwd|authorization|cookie|session|api[_-]?key|private[_-]?key|credential|ssn|tfn|card[_-]?number|cvv|iban|bsb|account[_-]?number|otp|pin|signature|hmac).*|email|e_mail|phone|mobile|address|dob|birth[_-]?date|name|first_name|last_name|full_name|body|payload|content|prompt|message|notes|description|raw)$/i;

const LOOKS_SECRET_RE =
  /^(?:bk_(?:live|test)_|sk_(?:live|test)_|pk_(?:live|test)_|whsec_|rk_(?:live|test)_|ghp_|gho_|xox[abp]-|eyJ[A-Za-z0-9_-]{10,}\.)/;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID_LIKE_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
/** `foo_id` / `fooId` / `id` keys are identifiers even when the stem is sensitive (`stripe_session_id`). */
const ID_KEY_RE = /(?:^id$|_id$|Id$)/;

export const REDACTED = "[redacted]";

/** True when a string can be stored verbatim as an identifier. */
export function isIdLike(value: string): boolean {
  if (value.length > 128) return false;
  if (EMAIL_RE.test(value)) return false;
  if (LOOKS_SECRET_RE.test(value)) return false;
  if (UUID_RE.test(value)) return true;
  // 64+ hex chars is a hash/token, not an id we need to keep.
  if (/^[0-9a-f]{64,}$/i.test(value)) return false;
  return ID_LIKE_RE.test(value);
}

/**
 * Deep-redact a detail object: sensitive keys are dropped, string values
 * that are not id-like are replaced with `[redacted]`, numbers/booleans
 * kept, nesting capped at 3 levels and 24 keys per level. Never throws.
 */
export function redactDetail(input: unknown, depth = 0): unknown {
  if (input == null) return null;
  if (typeof input === "number" || typeof input === "boolean") return input;
  if (typeof input === "string") return isIdLike(input) ? input : REDACTED;
  if (depth >= 3) return REDACTED;
  if (Array.isArray(input)) {
    return input.slice(0, 24).map((v) => redactDetail(v, depth + 1));
  }
  if (typeof input === "object") {
    const out: Record<string, unknown> = {};
    let n = 0;
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (n++ >= 24) break;
      if (!ID_KEY_RE.test(k) && SENSITIVE_KEY_RE.test(k)) continue;
      out[k.slice(0, 64)] = redactDetail(v, depth + 1);
    }
    return out;
  }
  return REDACTED;
}

/**
 * Pick the id-like route params (`{ id: "…" }`) — anything else is dropped,
 * never stored redacted (a redacted marker would only add noise).
 */
export function pickIdParams(
  params: unknown,
): Record<string, string> | null {
  if (!params || typeof params !== "object") return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
    if (!ID_KEY_RE.test(k) && SENSITIVE_KEY_RE.test(k)) continue;
    const s = Array.isArray(v) ? v.join("/") : typeof v === "string" ? v : null;
    if (s && isIdLike(s)) out[k] = s;
  }
  return Object.keys(out).length ? out : null;
}

/** First id-like param value — used as the row's entity id. */
export function primaryEntityId(params: Record<string, string> | null): string | null {
  if (!params) return null;
  if (params.id) return params.id;
  const first = Object.values(params)[0];
  return first ?? null;
}

// ---------------------------------------------------------------------------
// IP + UA
// ---------------------------------------------------------------------------

/**
 * Client IP from proxy headers — always the hop our edge actually saw,
 * never a value the client can forge (S20-A review P2-3):
 *
 *   1. `cf-connecting-ip` — set by Cloudflare at the edge (a client-sent
 *      copy is overwritten there);
 *   2. the LAST `x-forwarded-for` hop — nginx (`$proxy_add_x_forwarded_for`)
 *      appends its own `$remote_addr`, so the last entry is the TCP peer
 *      of our proxy while the FIRST entry is whatever the client sent
 *      (`X-Forwarded-For: <victim>` would otherwise poison ip_hash);
 *   3. `x-real-ip`.
 */
export function clientIp(headers: Headers): string | null {
  const cf = headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const hops = xff.split(",").map((h) => h.trim()).filter(Boolean);
    const last = hops[hops.length - 1];
    if (last) return last;
  }
  const real = headers.get("x-real-ip")?.trim();
  return real || null;
}

let warnedEmptySalt = false;

/** Test-only: allow the "salt is empty" warning to fire again. */
export function resetIpSaltWarning(): void {
  warnedEmptySalt = false;
}

/**
 * The salt `hashIp()` uses when none is passed: `AUDIT_IP_SALT`, else
 * `CRON_SECRET` (so rotating CRON_SECRET silently re-keys ip_hash — set
 * AUDIT_IP_SALT to decouple them). Logs ONCE per process when it resolves
 * to empty, because an unsalted hash is dictionary-reversible over IPv4.
 */
export function resolveIpSalt(): string {
  const s = process.env.AUDIT_IP_SALT || process.env.CRON_SECRET || "";
  if (!s && !warnedEmptySalt) {
    warnedEmptySalt = true;
    console.error(
      "[blockid:audit] AUDIT_IP_SALT and CRON_SECRET are both unset — audit ip_hash is unsalted (reversible over the IPv4 space). Set AUDIT_IP_SALT.",
    );
  }
  return s;
}

/**
 * Salted SHA-256 of the IP, truncated to 32 hex chars. The salt is a server
 * secret (`AUDIT_IP_SALT`, falling back to `CRON_SECRET`) so the stored
 * value cannot be reversed by dictionary over the IPv4 space, yet stays
 * stable for correlation within one deployment.
 */
export function hashIp(ip: string | null, salt?: string): string | null {
  if (!ip) return null;
  const s = salt ?? resolveIpSalt();
  return createHash("sha256").update(`${s}|${ip}`).digest("hex").slice(0, 32);
}

export type UaFamily =
  | "chrome"
  | "safari"
  | "firefox"
  | "edge"
  | "curl"
  | "node"
  | "bot"
  | "mobile"
  | "other"
  | "none";

/** Coarse user-agent family — never the raw UA string. */
export function uaFamily(ua: string | null): UaFamily {
  if (!ua) return "none";
  const s = ua.toLowerCase();
  if (/bot|crawl|spider|slurp|monitor|uptime|pingdom/.test(s)) return "bot";
  if (/curl\//.test(s)) return "curl";
  if (/node|undici|axios|got\/|python-requests|okhttp/.test(s)) return "node";
  if (/edg\//.test(s)) return "edge";
  if (/firefox\//.test(s)) return "firefox";
  if (/chrome\/|crios\//.test(s)) return "chrome";
  if (/safari\//.test(s)) return "safari";
  if (/mobile|android|iphone/.test(s)) return "mobile";
  return "other";
}
