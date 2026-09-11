// SSRF guard for server-side fetches of externally-sourced URLs (S8-C API
// security review, 2026-09-11). First consumer: lib/funding/fetch-source.ts,
// whose targets are `au_grants.source_url / official_url` (seed-controlled)
// plus whatever those pages redirect to or advertise as an RSS feed — the
// last two are attacker-influenced if a portal is compromised.
//
//   isPrivateIp(ip)                  loopback / RFC1918 / link-local (incl.
//                                    169.254.169.254 metadata) / CGNAT / ULA /
//                                    multicast / unspecified / v4-mapped v6
//   isForbiddenHostname(host)        localhost, *.local, *.internal, bare
//                                    "metadata" names, IP literals that are private
//   checkOutboundUrl(url, opts)      scheme + hostname + (optionally) DNS
//                                    resolution check → { ok } | { ok:false, reason }
//
// Pure apart from the injectable `resolve` (defaults to node:dns lookup with
// all addresses) so tests never hit the network. No `server-only`.

import { promises as dns } from "node:dns";
import { isIP } from "node:net";

export type OutboundUrlReason =
  | "invalid_url"
  | "scheme_not_allowed"
  | "credentials_in_url"
  | "hostname_forbidden"
  | "private_ip"
  | "dns_failed";

export type OutboundUrlCheck = { ok: true; url: URL; addresses: string[] } | { ok: false; reason: OutboundUrlReason; detail?: string };

export interface OutboundUrlOptions {
  /** DNS resolver — injected for tests. Returns every address the name maps to. */
  resolve?: (hostname: string) => Promise<string[]>;
  /** Skip DNS entirely (hostname / literal checks still run). Default false. */
  skipDns?: boolean;
}

function v4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const b = Number(p);
    if (!Number.isInteger(b) || b < 0 || b > 255) return null;
    n = n * 256 + b;
  }
  return n;
}

function inV4Range(ip: number, cidr: string): boolean {
  const [base, bitsRaw] = cidr.split("/");
  const bits = Number(bitsRaw);
  const b = v4ToInt(base);
  if (b === null) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return ((ip & mask) >>> 0) === ((b & mask) >>> 0);
}

// Everything a server-side fetch must never reach.
const PRIVATE_V4: readonly string[] = [
  "0.0.0.0/8", // "this" network
  "10.0.0.0/8",
  "100.64.0.0/10", // CGNAT
  "127.0.0.0/8",
  "169.254.0.0/16", // link-local + cloud metadata (169.254.169.254)
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.0.2.0/24", // TEST-NET-1
  "192.168.0.0/16",
  "198.18.0.0/15", // benchmarking
  "198.51.100.0/24", // TEST-NET-2
  "203.0.113.0/24", // TEST-NET-3
  "224.0.0.0/4", // multicast
  "240.0.0.0/4", // reserved + broadcast
];

/** Expand an IPv6 literal to 8 hextets (lower-case, no zone id). Null when malformed. */
function expandV6(ip: string): number[] | null {
  const noZone = ip.split("%")[0].toLowerCase();
  // v4-mapped / v4-compatible tail → convert the dotted quad.
  const v4Tail = /^(.*:)(\d+\.\d+\.\d+\.\d+)$/.exec(noZone);
  let s = noZone;
  if (v4Tail) {
    const n = v4ToInt(v4Tail[2]);
    if (n === null) return null;
    s = `${v4Tail[1]}${((n >>> 16) & 0xffff).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;
  const words = [...head, ...Array<string>(missing).fill("0"), ...tail];
  const out: number[] = [];
  for (const w of words) {
    if (!/^[0-9a-f]{1,4}$/.test(w)) return null;
    out.push(parseInt(w, 16));
  }
  return out;
}

/** True for any address a server-side fetch must not reach. Unparseable → true (fail closed). */
export function isPrivateIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) {
    const n = v4ToInt(ip);
    if (n === null) return true;
    return PRIVATE_V4.some((cidr) => inV4Range(n, cidr));
  }
  if (kind === 6) {
    const w = expandV6(ip);
    if (!w) return true;
    // v4-mapped (::ffff:a.b.c.d) and v4-compatible (::a.b.c.d) → judge the v4.
    const isMapped = w[0] === 0 && w[1] === 0 && w[2] === 0 && w[3] === 0 && w[4] === 0 && (w[5] === 0xffff || w[5] === 0);
    if (isMapped) {
      const v4 = ((w[6] << 16) | w[7]) >>> 0;
      if (w[5] === 0 && v4 <= 1) return true; // :: and ::1
      return PRIVATE_V4.some((cidr) => inV4Range(v4, cidr));
    }
    if (w.every((x) => x === 0)) return true; // ::
    if (w.slice(0, 7).every((x) => x === 0) && w[7] === 1) return true; // ::1
    if ((w[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 ULA
    if ((w[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
    if ((w[0] & 0xff00) === 0xff00) return true; // ff00::/8 multicast
    if (w[0] === 0x2001 && w[1] === 0x0db8) return true; // documentation
    if (w[0] === 0x0064 && w[1] === 0xff9b) return true; // 64:ff9b::/96 NAT64 — could map to private v4
    return false;
  }
  return true;
}

const FORBIDDEN_HOST_RE = /^(localhost|metadata(\.google\.internal)?|instance-data|kubernetes(\.default)?(\.svc.*)?)$|\.(localhost|local|internal|localdomain|home\.arpa)$/i;

/** Hostnames a public fetch must never target (cheap, no DNS). */
export function isForbiddenHostname(hostname: string): boolean {
  const h = hostname.trim().toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
  if (!h) return true;
  if (FORBIDDEN_HOST_RE.test(h)) return true;
  if (isIP(h)) return isPrivateIp(h);
  // Decimal / octal / hex / short-form disguised IPv4 ("2130706433",
  // "0x7f000001", "0177.0.0.1", "127.1"): every label numeric → not a DNS
  // name (a real TLD is alphabetic) → refuse rather than let getaddrinfo
  // reinterpret it.
  if (/^(0x[0-9a-f]+|\d+)(\.(0x[0-9a-f]+|\d+))*$/i.test(h)) return true;
  if (!h.includes(".")) return true; // single-label names are internal by convention
  return false;
}

async function defaultResolve(hostname: string): Promise<string[]> {
  const rows = await dns.lookup(hostname, { all: true, verbatim: true });
  return rows.map((r) => r.address);
}

/**
 * Validate a URL for a server-side fetch: http(s) only, no embedded
 * credentials, no forbidden / private host, and (unless skipped) every
 * address the hostname resolves to must be public. Hosts that resolve to
 * nothing are refused.
 */
export async function checkOutboundUrl(raw: string | URL, opts: OutboundUrlOptions = {}): Promise<OutboundUrlCheck> {
  let url: URL;
  try {
    url = raw instanceof URL ? raw : new URL(raw);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "scheme_not_allowed", detail: url.protocol };
  }
  if (url.username || url.password) return { ok: false, reason: "credentials_in_url" };
  const hostname = url.hostname;
  if (isForbiddenHostname(hostname)) return { ok: false, reason: "hostname_forbidden", detail: hostname };
  if (isIP(hostname.replace(/^\[|\]$/g, ""))) {
    return { ok: true, url, addresses: [hostname.replace(/^\[|\]$/g, "")] };
  }
  if (opts.skipDns) return { ok: true, url, addresses: [] };
  let addresses: string[];
  try {
    addresses = await (opts.resolve ?? defaultResolve)(hostname);
  } catch (err) {
    return { ok: false, reason: "dns_failed", detail: err instanceof Error ? err.message : String(err) };
  }
  if (addresses.length === 0) return { ok: false, reason: "dns_failed", detail: "no addresses" };
  const bad = addresses.find((a) => isPrivateIp(a));
  if (bad) return { ok: false, reason: "private_ip", detail: bad };
  return { ok: true, url, addresses };
}
