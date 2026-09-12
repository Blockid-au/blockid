// Fetch + parse helpers for the weekly funding-source refresh (T0243, plan
// §4d / §5b). Nothing here touches the DB or the filesystem, so the module
// is safe to import from the cron route, the refresh loop and tests.
//
// Why a dedicated helper: `analyzer/website.ts` has a private `timedFetch`
// with a bot UA that GrantConnect 403s, and `model-discovery.ts#fetchJson`
// is JSON-only. Government portals want a browser-like UA, tolerate a few
// retries with backoff, and sometimes answer 403/429 to any automation —
// those are reported as `blocked` (never retried forever) so the caller can
// hand the row to the agent-research fallback instead.
//
// Parsers are deliberately dependency-free (no HTML/RSS/CSV libs, no
// DOMParser): GrantConnect RSS 2.0, Qld CKAN CSV and the business.gov.au /
// state HTML "Closes / Closing date / Status" blocks are all regular enough
// for regex + a small state machine. Colocated tests: fetch-source.test.ts.

import { checkOutboundUrl, type OutboundUrlOptions } from "@/lib/security/outbound-url";
import { pinnedFetch } from "@/lib/security/pinned-fetch";

export const FUNDING_BOT_UA =
  "Mozilla/5.0 (compatible; BlockID-FundingBot/1.0; +https://blockid.au/funding)";

/** Hard cap on the bytes kept from one response body. */
export const MAX_BODY_BYTES = 2 * 1024 * 1024;

/** Redirect hops followed per attempt — each hop is re-checked by the SSRF guard. */
export const MAX_REDIRECTS = 5;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export interface FetchTextOptions {
  /** Per-attempt timeout. Default 10 s. */
  timeoutMs?: number;
  /** Extra attempts after the first for network errors / 5xx / 429. Default 2. */
  retries?: number;
  /** Base backoff; doubles per attempt (250 → 500 → 1000 …). Default 500 ms. */
  backoffMs?: number;
  userAgent?: string;
  /**
   * Injected for tests. Defaults to the DNS-pinned fetch
   * (lib/security/pinned-fetch.ts, S20-B review P2-3): each hop's socket
   * connects only to the addresses `checkOutboundUrl` validated for it.
   */
  fetchImpl?: typeof fetch;
  /** Injected for tests so backoff does not actually sleep. */
  sleep?: (ms: number) => Promise<void>;
  /**
   * SSRF guard (S8-C, 2026-09-11): DNS resolver injected for tests. The
   * guard itself cannot be switched off — every URL, including each redirect
   * hop, must be http(s) on a public host that resolves only to public
   * addresses (lib/security/outbound-url.ts). Refusals come back as
   * `{ ok:false, status:0, refused:true, error:"ssrf_refused:<reason>" }`.
   */
  resolve?: OutboundUrlOptions["resolve"];
  /** Redirect hops per attempt. Default MAX_REDIRECTS. */
  maxRedirects?: number;
}

export interface FetchTextResult {
  ok: boolean;
  /** HTTP status, or 0 when no response was obtained (network error / timeout). */
  status: number;
  text: string;
  /** True when the origin refused automation (403 / 429 after retries). */
  blocked: boolean;
  /** True when the body was cut at MAX_BODY_BYTES. */
  truncated: boolean;
  attempts: number;
  error?: string;
  /** True when the SSRF guard refused the URL (or one of its redirect hops). Never retried. */
  refused?: boolean;
  /** The URL the body came from (after redirects). */
  finalUrl?: string;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function readBodyCapped(res: Response, cap: number): Promise<{ text: string; truncated: boolean }> {
  const body = res.body;
  if (!body || typeof body.getReader !== "function") {
    const full = await res.text();
    return full.length > cap ? { text: full.slice(0, cap), truncated: true } : { text: full, truncated: false };
  }
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: false });
  const chunks: string[] = [];
  let received = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    received += value.byteLength;
    if (received > cap) {
      const keep = value.byteLength - (received - cap);
      chunks.push(decoder.decode(value.subarray(0, keep), { stream: true }));
      truncated = true;
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      break;
    }
    chunks.push(decoder.decode(value, { stream: true }));
  }
  chunks.push(decoder.decode());
  return { text: chunks.join(""), truncated };
}

/**
 * GET a text resource with a browser-like UA, exponential backoff and a
 * 2 MB body cap. Never throws — every failure mode is expressed in the
 * result so the refresh loop can classify it (reachable / blocked / error).
 */
export async function fetchText(url: string, opts: FetchTextOptions = {}): Promise<FetchTextResult> {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const retries = Math.max(0, opts.retries ?? 2);
  const backoffMs = Math.max(0, opts.backoffMs ?? 500);
  const ua = opts.userAgent ?? FUNDING_BOT_UA;
  const injected = opts.fetchImpl;
  const sleep = opts.sleep ?? defaultSleep;
  const maxRedirects = Math.max(0, opts.maxRedirects ?? MAX_REDIRECTS);
  const guardOpts: OutboundUrlOptions = { resolve: opts.resolve };

  const refuse = (reason: string, attempts: number): FetchTextResult => ({
    ok: false,
    status: 0,
    text: "",
    blocked: false,
    truncated: false,
    attempts,
    refused: true,
    error: `ssrf_refused:${reason}`,
  });

  // The starting URL is checked once, before any attempt — a refusal is
  // final (retrying cannot make a private address public).
  const first = await checkOutboundUrl(url, guardOpts);
  if (!first.ok) return refuse(first.reason, 0);
  // Addresses the guard validated for the URL currently being fetched; the
  // default transport pins the socket to them (no second DNS lookup).
  let pinned: readonly string[] = first.addresses;
  const doFetch = (u: string, init: RequestInit): Promise<Response> =>
    injected ? injected(u, init) : pinnedFetch(u, init, pinned, { resolve: opts.resolve });

  let attempts = 0;
  let lastError = "";
  let lastStatus = 0;
  let sawRateLimit = false;

  for (let attempt = 0; attempt <= retries; attempt++) {
    attempts = attempt + 1;
    if (attempt > 0) await sleep(backoffMs * 2 ** (attempt - 1));

    // Redirects are followed by hand so every hop goes through the guard —
    // `redirect: "follow"` would let a seed host bounce us to 169.254.169.254.
    let current = first.url.toString();
    pinned = first.addresses;
    let hops = 0;
    let settled = false;
    while (!settled) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await doFetch(current, {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
          headers: {
            "user-agent": ua,
            accept: "text/html,application/xhtml+xml,application/xml,application/rss+xml,text/csv,text/plain;q=0.9,*/*;q=0.8",
            "accept-language": "en-AU,en;q=0.9",
          },
        });
        lastStatus = res.status;

        if (REDIRECT_STATUSES.has(res.status)) {
          clearTimeout(timer);
          const location = res.headers.get("location");
          if (!location) {
            return { ok: false, status: res.status, text: "", blocked: false, truncated: false, attempts, error: `redirect without location`, finalUrl: current };
          }
          if (hops >= maxRedirects) {
            return { ok: false, status: res.status, text: "", blocked: false, truncated: false, attempts, error: `too many redirects (>${maxRedirects})`, finalUrl: current };
          }
          let next: string;
          try {
            next = new URL(location, current).toString();
          } catch {
            return refuse("invalid_url", attempts);
          }
          const hop = await checkOutboundUrl(next, guardOpts);
          if (!hop.ok) return refuse(hop.reason, attempts);
          current = hop.url.toString();
          pinned = hop.addresses;
          hops++;
          continue;
        }

        // Explicit refusal of automation. 403 is final on the first sight; 429
        // is retried once with backoff then reported as blocked.
        if (res.status === 403 || (res.status === 429 && sawRateLimit)) {
          clearTimeout(timer);
          return { ok: false, status: res.status, text: "", blocked: true, truncated: false, attempts, finalUrl: current };
        }
        if (res.status === 429) {
          sawRateLimit = true;
          lastError = "429 rate limited";
          clearTimeout(timer);
          settled = true;
          continue; // → next attempt
        }
        if (res.status >= 500) {
          lastError = `HTTP ${res.status}`;
          clearTimeout(timer);
          settled = true;
          continue; // transient — retry
        }

        const { text, truncated } = await readBodyCapped(res, MAX_BODY_BYTES);
        clearTimeout(timer);
        return { ok: res.ok, status: res.status, text, blocked: false, truncated, attempts, finalUrl: current };
      } catch (err) {
        clearTimeout(timer);
        const name = err instanceof Error ? err.name : "";
        lastError = name === "AbortError" ? `timeout after ${timeoutMs}ms` : err instanceof Error ? err.message : String(err);
        lastStatus = 0;
        settled = true;
      }
    }
  }

  return {
    ok: false,
    status: lastStatus,
    text: "",
    blocked: sawRateLimit && lastStatus === 429,
    truncated: false,
    attempts,
    error: lastError || `HTTP ${lastStatus}`,
  };
}

// ─── RSS ─────────────────────────────────────────────────────────────────────

export interface RssItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
}

const ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  hellip: "…",
};

/** Decode the handful of entities that show up in feeds and gov pages. */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[body.toLowerCase()] ?? m;
  });
}

function unwrapCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

function tagText(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}\\s*>`, "i"));
  if (!m) return "";
  return decodeEntities(unwrapCdata(m[1])).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Items from an RSS 2.0 feed (also tolerates Atom `<entry>` with `<link href>`).
 * Returns [] for anything that is not a feed (e.g. an HTML error page).
 */
export function parseRssItems(xml: string): RssItem[] {
  if (!xml) return [];
  const items: RssItem[] = [];
  const re = /<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1\s*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const block = m[2];
    let link = tagText(block, "link");
    if (!link) {
      const href = block.match(/<link\b[^>]*\bhref=["']([^"']+)["']/i);
      if (href) link = decodeEntities(href[1]).trim();
    }
    const item: RssItem = {
      title: tagText(block, "title"),
      link,
      pubDate: tagText(block, "pubDate") || tagText(block, "updated") || tagText(block, "published") || tagText(block, "dc:date"),
      description: tagText(block, "description") || tagText(block, "summary") || tagText(block, "content"),
    };
    if (item.title || item.link) items.push(item);
  }
  return items;
}

/**
 * First RSS/Atom feed URL advertised by an HTML page (`<link rel="alternate"
 * type="application/rss+xml">` or any href containing "rss"/"feed.xml"),
 * resolved against `baseUrl`. GrantConnect's list page advertises
 * `/public_data/rss/rss.xml` this way. Null when none.
 */
export function discoverFeedUrl(html: string, baseUrl: string): string | null {
  if (!html) return null;
  const m =
    html.match(/<link\b[^>]*type=["']application\/(?:rss|atom)\+xml["'][^>]*href=["']([^"']+)["']/i) ??
    html.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*type=["']application\/(?:rss|atom)\+xml["']/i) ??
    html.match(/href=["']([^"']*(?:\/rss[^"']*\.xml|rss\.xml|feed\.xml|\/rss\/?)(?:[?#][^"']*)?)["']/i);
  if (!m) return null;
  try {
    return new URL(decodeEntities(m[1]), baseUrl).toString();
  } catch {
    return null;
  }
}

// ─── CSV ─────────────────────────────────────────────────────────────────────

/** RFC-4180-ish CSV → rows of fields. Handles quoted fields, "" escapes, CRLF, BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  if (!text) return rows;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\r" || ch === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
      if (ch === "\r" && src[i + 1] === "\n") i++;
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop fully-empty trailing rows (a final newline yields none, but blank
  // lines inside a file would otherwise become [""]).
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

/** CSV with a header row → array of records keyed by header (trimmed, lower-cased). */
export function parseCsvRecords(text: string): Array<Record<string, string>> {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r) => {
    const rec: Record<string, string> = {};
    headers.forEach((h, idx) => {
      if (h) rec[h] = (r[idx] ?? "").trim();
    });
    return rec;
  });
}

// ─── HTML status / closing-date hints ────────────────────────────────────────

export type HintStatus = "open" | "closed" | "upcoming" | "paused";

export interface StatusHint {
  status?: HintStatus;
  /** ISO YYYY-MM-DD. */
  closes_at?: string;
  /** medium = explicit phrase on the page; low = inferred (e.g. a past closing date). */
  confidence: "low" | "medium";
  /** True only when the page literally says applications are open. */
  explicit_open?: boolean;
  /**
   * Short snippet around the status phrase (or, when only a date was found,
   * around the closing keyword) — shown in the review queue and used by the
   * refresh loop to check the grant's own name sits next to an "open" claim
   * before auto-flipping.
   */
  evidence?: string;
}

const MONTHS: Readonly<Record<string, number>> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

function iso(y: number, m: number, d: number): string | null {
  if (!(y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Date patterns accepted near a closing keyword. Order matters: ISO first,
// then "30 April 2026", then "April 30, 2026", then AU numeric dd/mm/yyyy.
const DATE_RE =
  /(\d{4})-(\d{2})-(\d{2})|(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?,?\s+(\d{4})|(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})|(\d{1,2})\/(\d{1,2})\/(\d{4})/i;

/** First parseable date in `s` → ISO, or null. Exported for tests. */
export function findIsoDate(s: string): string | null {
  const m = s.match(DATE_RE);
  if (!m) return null;
  if (m[1]) return iso(+m[1], +m[2], +m[3]);
  if (m[4]) return iso(+m[6], MONTHS[m[5].toLowerCase()] ?? 0, +m[4]);
  if (m[7]) return iso(+m[9], MONTHS[m[7].toLowerCase()] ?? 0, +m[8]);
  if (m[10]) return iso(+m[12], +m[11], +m[10]); // dd/mm/yyyy (AU)
  return null;
}

/** Visible text of an HTML document: scripts/styles dropped, tags → spaces, entities decoded. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script\s*>/gi, " ")
      .replace(/<style[\s\S]*?<\/style\s*>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<\/?(?:br|p|div|li|tr|td|th|h[1-6]|dt|dd|section|article)\b[^>]*>/gi, " \n ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

// Closing-date keywords (looked for on one line / within ~90 chars).
const CLOSE_KEYWORD_RE =
  /\b(applications?\s+close[sd]?|closing\s+date|close\s+date|closes(?:\s+on)?|closing(?:\s+on)?|deadline(?:\s+for\s+applications)?|submissions?\s+close[sd]?|expressions?\s+of\s+interest\s+close[sd]?)\b\s*:?\s*/i;

const STATUS_EXPLICIT_RE = /\bstatus\s*:?\s*(open|closed|upcoming|opening\s+soon|closing\s+soon|now\s+open|paused|on\s+hold)\b/i;
// business.gov.au IGP wording: "This program is currently paused to new applications."
const PAUSED_PHRASE_RE =
  /\b((?:this\s+|the\s+)?(?:program|programme|grant|round|opportunity|intake)\s+(?:is|has\s+been)\s+(?:currently\s+|temporarily\s+)?(?:paused|on\s+hold|suspended)|applications?\s+(?:are|have\s+been)\s+(?:currently\s+|temporarily\s+)?(?:paused|suspended|on\s+hold))/i;
const OPEN_PHRASE_RE =
  /\b(applications?(?:\s+(?:for|to)\s+[\w&'’-]+(?:\s+[\w&'’-]+){0,5}?)?\s+(?:are\s+)?(?:now\s+)?open\b(?!\s+(?:in|on|from|soon|early|late|mid|during|later)\b)|now\s+open\s+for\s+applications?|open\s+for\s+applications?|currently\s+(?:open|accepting\s+applications?)|round\s+\d+\s+is\s+(?:now\s+)?open)/i;
const CLOSED_PHRASE_RE =
  /\b(applications?(?:\s+(?:for|to)\s+[\w&'’-]+(?:\s+[\w&'’-]+){0,5}?)?\s+(?:are\s+|have\s+)?(?:now\s+)?closed\b|(?:this|the)\s+(?:grant|program|programme|round|opportunity)\s+(?:is|has)\s+(?:now\s+)?closed\b|closed\s+(?:to|for)\s+(?:new\s+)?applications?|no\s+longer\s+(?:accepting|taking)\s+applications?|applications?\s+have\s+closed|round\s+\d+\s+(?:is|has)\s+(?:now\s+)?closed)/i;
// "opens in/on/from" only counts when a time follows ("in March", "on 1 July",
// "from 2027", "in early 2027") — WA.gov.au pages say "(Opens in a new tab)".
const TIME_AHEAD =
  "(?:\\d|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|early|late|mid|q[1-4]\\b|the\\s+(?:new\\s+)?(?:financial\\s+)?year|next\\s+(?:year|month|week)|autumn|winter|spring|summer)";
const UPCOMING_PHRASE_RE = new RegExp(
  `\\b(applications?\\s+(?:will\\s+)?open(?:s|ing)?\\s+(?:soon\\b|(?:on|in|from)\\s+${TIME_AHEAD})|opening\\s+soon|coming\\s+soon|expected\\s+to\\s+open|not\\s+yet\\s+open|will\\s+open\\s+(?:on|in|from)\\s+${TIME_AHEAD}|next\\s+round\\s+(?:opens|will\\s+open)|opens\\s+(?:on|in|from)\\s+${TIME_AHEAD})`,
  "i",
);

function snippet(text: string, index: number, span = 220): string {
  const start = Math.max(0, index - 80);
  return text.slice(start, start + span).replace(/\s+/g, " ").trim();
}

/**
 * Best-effort status / closing-date signals from a grant page.
 *
 * Signals, in priority order:
 *   1. "Status: Open|Closed|Paused|Opening soon" → status, medium.
 *   2. "Applications close(s) / Closing date / Deadline … <date>" → closes_at.
 *      A closing date in the past (relative to `now`) with no explicit status
 *      → status "closed", low confidence.
 *   3. Explicit phrases ("Applications are now open", "This grant is closed",
 *      "Applications open in March") → status, medium.
 *
 * Nothing found → { confidence: "low" } with no status / closes_at; callers
 * treat that as "no opinion", not as agreement.
 */
export function extractStatusHints(html: string, now: Date = new Date()): StatusHint {
  const text = htmlToText(html ?? "");
  if (!text) return { confidence: "low" };
  const hint: StatusHint = { confidence: "low" };

  // 1. Explicit status label.
  const st = text.match(STATUS_EXPLICIT_RE);
  if (st) {
    const v = st[1].toLowerCase().replace(/\s+/g, " ");
    if (v === "open" || v === "now open") {
      hint.status = "open";
      hint.explicit_open = true;
    } else if (v === "closing soon") {
      hint.status = "open"; // still accepting, just near the deadline
    } else if (v === "closed") {
      hint.status = "closed";
    } else if (v === "paused" || v === "on hold") {
      hint.status = "paused";
    } else {
      hint.status = "upcoming"; // upcoming / opening soon
    }
    hint.confidence = "medium";
    hint.evidence = snippet(text, st.index ?? 0);
  }

  // 2. Closing date near a close keyword. Scan every keyword occurrence and
  //    take the first that has a date within the next ~90 chars on the same
  //    line block.
  const closeRe = new RegExp(CLOSE_KEYWORD_RE.source, "gi");
  let km: RegExpExecArray | null;
  while ((km = closeRe.exec(text)) !== null) {
    const after = text.slice(km.index + km[0].length, km.index + km[0].length + 90);
    const sameBlock = after.split("\n").slice(0, 2).join(" ");
    const d = findIsoDate(sameBlock);
    if (d) {
      hint.closes_at = d;
      if (!hint.evidence) hint.evidence = snippet(text, km.index);
      break;
    }
  }

  // 3. Phrase-level status when no explicit label was present.
  if (!hint.status) {
    const closed = text.match(CLOSED_PHRASE_RE);
    const open = text.match(OPEN_PHRASE_RE);
    const upcoming = text.match(UPCOMING_PHRASE_RE);
    const paused = text.match(PAUSED_PHRASE_RE);
    // Prefer the phrase that appears earliest in the page (the headline block
    // usually carries the real state; boilerplate lives further down).
    const candidates: Array<{ status: HintStatus; index: number; explicitOpen: boolean }> = [];
    if (paused && paused.index !== undefined) candidates.push({ status: "paused", index: paused.index, explicitOpen: false });
    if (closed && closed.index !== undefined) candidates.push({ status: "closed", index: closed.index, explicitOpen: false });
    if (open && open.index !== undefined) candidates.push({ status: "open", index: open.index, explicitOpen: true });
    if (upcoming && upcoming.index !== undefined) candidates.push({ status: "upcoming", index: upcoming.index, explicitOpen: false });
    candidates.sort((a, b) => a.index - b.index);
    const pick = candidates[0];
    if (pick) {
      hint.status = pick.status;
      hint.explicit_open = pick.explicitOpen || undefined;
      hint.confidence = "medium";
      // Status evidence beats closing-date evidence: it is what a human (and
      // the auto-flip guard) needs to see.
      hint.evidence = snippet(text, pick.index);
    }
  }

  // Past closing date with no explicit status → inferred closed (low).
  if (!hint.status && hint.closes_at) {
    const today = now.toISOString().slice(0, 10);
    if (hint.closes_at < today) {
      hint.status = "closed";
      hint.confidence = "low";
    }
  }

  if (hint.explicit_open === undefined) delete hint.explicit_open;
  return hint;
}
