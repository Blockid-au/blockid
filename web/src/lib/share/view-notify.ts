// "Your score was just viewed" — when a share-page request counts as a real
// human view, and when its owner may be e-mailed about it.
//
// Incident 2026-09-25: every new production origin e-mailed ~12 share-link
// owners within ~20 s of booting. Deploy Gate 6 runs scripts/link-check.mjs
// against the candidate on 127.0.0.1; it crawls /startup-index and the 14
// /startup-index/listings/<ticker> pages, each linking /s/<svi_analyses.id>,
// and HEADs every /s/* link (UA "BlockID-LinkCheck/1.0", no X-Forwarded-For).
// Next renders the page for a HEAD, so /s/[slug] recorded a "view" and mailed
// the owner — and its 24 h dedupe never held: it keyed on the viewer IP hash
// (null without a forwarded IP, so the check was skipped) and read
// `score_views`, whose insert fails with FK 23503 for every svi_analyses slug
// (score_id references `scores`). 14 listings − 2 unsubscribed = 12 mails,
// on every candidate boot.
//
// Two guards, both required:
//   1. `automatedShareViewReason(headers)` — the request is not a human
//      browser view: a HEAD, a prefetch, a request with no public client IP
//      (loopback / private / absent — nginx and Cloudflare always stamp one),
//      or a non-browser / automation user agent.
//   2. `isNotifiableRecipient(email)` + `claimScoreViewNotification(key)` —
//      the owner address is deliverable (no reserved / typo domains) and no
//      "viewed" mail went out for this share in the last 24 h, whichever IP
//      the viewer had (read from `email_sends`, fail-closed, plus an
//      in-process claim so concurrent renders cannot race past the log).

import { createHash } from "node:crypto";
import { clientIpFromHeaders } from "@/lib/iphash";
import { cleanReportEmail, isDisposableReportEmail } from "@/lib/reports/free-grants-rules";
import { getSupabaseAdmin } from "@/lib/supabase";

/** Request header src/proxy.ts stamps with the HTTP method (Server Components cannot read it). */
export const REQUEST_METHOD_HEADER = "x-blockid-method";

/** `email_sends.flow` of every score-viewed mail — the 24 h dedupe reads it back. */
export const SCORE_VIEWED_FLOW = "score-viewed";

export const SCORE_VIEWED_DEDUPE_MS = 24 * 60 * 60 * 1000;

type HeaderBag = Pick<Headers, "get">;

// Crawlers, unfurlers, monitors, HTTP libraries and browser automation.
// Real browsers never carry any of these tokens.
const AUTOMATION_UA_RE =
  /bot\b|bot\/|crawler|spider|slurp|preview|fetch|curl|wget|httpclient|http-client|headless|playwright|puppeteer|selenium|webdriver|phantomjs|lighthouse|pagespeed|node(\.js|-fetch)?\/|\bnode\b|undici|axios|python|go-http-client|java\/|okhttp|libwww|scrapy|linkcheck|link-check|monitor|uptime|pingdom|facebookexternalhit|whatsapp|telegram|discord|embedly|skypeuripreview|bitlybot|vkshare|postman|insomnia/i;

export type AutomatedReason = "head" | "prefetch" | "no_client_ip" | "internal_ip" | "automation_ua";

function isPrefetch(h: HeaderBag): boolean {
  if (h.get("next-router-prefetch")) return true;
  if (h.get("next-router-segment-prefetch")) return true;
  const purpose = `${h.get("purpose") ?? ""} ${h.get("sec-purpose") ?? ""} ${h.get("x-purpose") ?? ""} ${h.get("x-moz") ?? ""}`;
  return /prefetch|prerender|preview/i.test(purpose);
}

/** Loopback, RFC 1918 / ULA / link-local, or unparseable — never a public visitor. */
export function isInternalIp(ip: string): boolean {
  let v = ip.trim().toLowerCase();
  if (v.startsWith("[") && v.includes("]")) v = v.slice(1, v.indexOf("]"));
  if (v.startsWith("::ffff:")) v = v.slice(7);
  if (v === "::1" || v === "::" || v === "localhost" || v === "unknown") return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(:\d+)?$/.exec(v);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    return (
      a === 127 || a === 10 || a === 0 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  if (v.includes(":")) return /^(fc|fd|fe8|fe9|fea|feb)/.test(v);
  return true;
}

/**
 * Why this share-page request is NOT a human browser view, or null when it
 * may be one. Order: method → prefetch → client IP → user agent.
 */
export function automatedShareViewReason(h: HeaderBag): AutomatedReason | null {
  if ((h.get(REQUEST_METHOD_HEADER) ?? "").toUpperCase() === "HEAD") return "head";
  if (isPrefetch(h)) return "prefetch";
  const ip = clientIpFromHeaders(h as Headers);
  if (!ip) return "no_client_ip";
  if (isInternalIp(ip)) return "internal_ip";
  const ua = h.get("user-agent")?.trim() ?? "";
  if (!ua || !/^Mozilla\/5\.0 /.test(ua) || AUTOMATION_UA_RE.test(ua)) return "automation_ua";
  return null;
}

// ── recipient ────────────────────────────────────────────────────────────────

// RFC 2606 / 6761 reserved names — never a real mailbox.
const RESERVED_DOMAINS = new Set(["example.com", "example.net", "example.org", "localhost", "invalid", "test", "example"]);
const RESERVED_TLDS = new Set(["test", "example", "invalid", "localhost", "local", "internal"]);
// TLDs that do not exist but are one keystroke from .com / .net / .org.
const TYPO_TLDS = new Set(["con", "cmo", "ocm", "comm", "coom", "cpm", "vom", "xom", "cim", "nte", "ogr"]);
// Misspelled webmail domains.
const TYPO_DOMAINS = new Set([
  "gmail.co", "gmail.cm", "gmail.om", "gmai.com", "gmial.com", "gamil.com", "gmaill.com", "gnail.com", "gmali.com", "gmail.comm",
  "hotmail.co", "hotmial.com", "hotmal.com", "homail.com", "hotmai.com",
  "yahoo.co", "yaho.com", "yahooo.com", "yhoo.com",
  "outlook.co", "outlok.com", "outloo.com",
  "icloud.co", "iclod.com",
]);

/** A deliverable-looking owner address: well-formed, not reserved, not a typo domain, not disposable (sendEmail refuses erased tombstones). */
export function isNotifiableRecipient(raw: unknown): boolean {
  const email = cleanReportEmail(raw);
  if (!email) return false;
  const domain = email.slice(email.lastIndexOf("@") + 1);
  const tld = domain.slice(domain.lastIndexOf(".") + 1);
  if (RESERVED_DOMAINS.has(domain) || RESERVED_TLDS.has(tld)) return false;
  if ([...RESERVED_DOMAINS].some((d) => domain.endsWith(`.${d}`))) return false;
  if (TYPO_TLDS.has(tld) || TYPO_DOMAINS.has(domain)) return false;
  if (isDisposableReportEmail(email)) return false;
  return true;
}

// ── 24 h dedupe ─────────────────────────────────────────────────────────────

/**
 * `email_sends.template` for one share — per score, plus a short hash of the
 * investor-link token when the viewer is identified (the token itself is an
 * access credential and never lands in the send log).
 */
export function scoreViewedTemplate(slug: string, viewerKey?: string | null): string {
  const viewer = viewerKey ? `:${createHash("sha256").update(viewerKey, "utf8").digest("hex").slice(0, 16)}` : "";
  return `score-viewed:${slug.slice(0, 80)}${viewer}`;
}

const recentClaims = new Map<string, number>();

/** Tests only. */
export function resetScoreViewClaims(): void {
  recentClaims.clear();
}

/**
 * Claim the right to send the "viewed" mail for `template`. False when one
 * was claimed in this process, or sent by any origin (email_sends), in the
 * last 24 h — or when the send log cannot be read (fail-closed: a missed
 * activity ping is harmless, a burst is the bug).
 */
export async function claimScoreViewNotification(template: string, now: number = Date.now()): Promise<boolean> {
  for (const [k, at] of recentClaims) if (now - at >= SCORE_VIEWED_DEDUPE_MS) recentClaims.delete(k);
  const prior = recentClaims.get(template);
  if (prior !== undefined && now - prior < SCORE_VIEWED_DEDUPE_MS) return false;
  recentClaims.set(template, now);
  try {
    const sb = getSupabaseAdmin();
    if (!sb) return false;
    const since = new Date(now - SCORE_VIEWED_DEDUPE_MS).toISOString();
    const { count, error } = await sb
      .from("email_sends")
      .select("id", { count: "exact", head: true })
      .eq("flow", SCORE_VIEWED_FLOW)
      .eq("template", template)
      .eq("status", "sent")
      .gte("created_at", since);
    if (error) return false;
    return (count ?? 0) === 0;
  } catch {
    return false;
  }
}
