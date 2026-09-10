// Weekly refresh of the AU grants catalogue (T0243, plan §4d / §4i D-1).
//
// For every matchable `au_grants` row with a `source_url` (or `official_url`)
// the loop fetches the page with the browser-like helper, extracts status /
// closing-date hints and compares them with the stored row:
//
//   * page unreachable (403/429)          → queue `blocked`, row untouched
//   * page 4xx (gone / not found)          → queue `unreachable`, row untouched
//   * hint disagrees with status/closes_at → queue `*_mismatch`, row untouched
//       – the ONE automatic flip: stored `upcoming` + page literally says
//         applications are open (medium confidence) → status=open
//   * hint agrees (at least one signal)    → last_verified_at=today, verified_by=cron
//   * page reachable but no signal at all  → counted reachable only
//
// Then the GrantConnect RSS is polled; items whose title fuzzy-matches no
// existing grant become `possible_new_grant` queue entries (deduped against
// what is already queued). Never deletes, never auto-closes — humans confirm
// via /admin/funding (verified_by=human).
//
// Every side effect is injectable (`fetch`, `supabase`, `queuePath`) and
// `dryRun` performs no writes at all. Colocated tests: refresh.test.ts.

import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  discoverFeedUrl,
  extractStatusHints,
  fetchText,
  parseRssItems,
  type FetchTextResult,
  type RssItem,
  type StatusHint,
} from "./fetch-source";
import {
  appendReviewEntries,
  readReviewQueue,
  REVIEW_QUEUE_PATH,
  type ReviewQueueEntry,
  type ReviewReason,
} from "./review-queue";
import type { FundingStatus, StatusConfidence } from "./seed-map";

/**
 * Default GrantConnect feed (plan §5b names the list page `/go/list`; that
 * page is HTML and advertises this RSS via <link rel=alternate> — verified
 * 2026-09-10, 118 items, 200 with the browser UA). If the configured URL
 * returns HTML, the loop follows the advertised feed once.
 * Override with FUNDING_GRANTCONNECT_RSS_URL.
 */
export const GRANTCONNECT_RSS_URL = "https://www.grants.gov.au/public_data/rss/rss.xml";

export interface RefreshGrantRow {
  id: string;
  name: string;
  status: FundingStatus;
  closes_at: string | null;
  official_url: string;
  source_url: string | null;
  exclude_from_matching: boolean;
  status_confidence: StatusConfidence;
}

/** The slice of the Supabase client the loop needs — keeps tests to a small fake. */
export interface RefreshDb {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: unknown): PromiseLike<{ data: unknown; error: { message: string } | null }>;
    };
    update(values: Record<string, unknown>): {
      eq(col: string, val: unknown): PromiseLike<{ error: { message: string } | null }>;
    };
  };
}

export type FetchLike = (url: string) => Promise<FetchTextResult>;

export interface RefreshOptions {
  now?: Date;
  fetch?: FetchLike;
  dryRun?: boolean;
  /** Injected DB for tests; defaults to getSupabaseAdmin(). */
  db?: RefreshDb | null;
  queuePath?: string;
  grantConnectUrl?: string | null;
  /** Parallel page fetches. Default 4. */
  concurrency?: number;
  /** Stop starting new fetches after this many ms (the cron has a 300 s cap). Default 200 s. */
  budgetMs?: number;
  /** Cap on possible-new-grant entries per run. Default 40. */
  maxNewItems?: number;
}

export interface RefreshSummary {
  ok: boolean;
  dryRun: boolean;
  /** Rows with a URL that were considered. */
  checked: number;
  /** HTTP 2xx pages. */
  reachable: number;
  /** 403 / 429. */
  blocked: number;
  /** Rows stamped verified_by=cron (hint agreed). */
  verified: number;
  /** Queue entries written (or that would be, in dryRun). */
  queued: number;
  /** upcoming → open auto-flips applied (each also logged to the queue as `flipped_open`). */
  flipped: number;
  /** Findings dropped because an identical entry was queued within DEDUPE_DAYS. */
  deduped: number;
  /** Network / 5xx / DB errors. */
  errors: number;
  /** Rows not fetched because the time budget ran out. */
  skipped: number;
  feed: { url: string | null; items: number; blocked: boolean; newCandidates: number };
  /** First 50 entries, for `?dry=1` inspection. */
  entries: ReviewQueueEntry[];
  error?: string;
}

// ─── Fuzzy name matching (GrantConnect titles vs seed names) ─────────────────

const STOPWORDS = new Set([
  "the", "a", "an", "of", "and", "for", "to", "in", "on", "at", "by", "with", "grant", "grants", "program",
  "programme", "round", "scheme", "fund", "funding", "initiative", "opportunity", "open", "closed", "go",
  "australian", "australia", "national", "government",
]);

/** Lower-case alphanumeric tokens minus stopwords, years and round numbers. Exported for tests. */
export function nameTokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t.length > 1 && !STOPWORDS.has(t) && !/^(19|20)\d{2}$/.test(t) && !/^\d+$/.test(t));
}

/**
 * True when a feed title plausibly refers to an existing grant: token
 * Jaccard ≥ 0.5, or one token set contains the other (≥ 2 tokens), or the
 * grant's acronym in parentheses appears in the title.
 */
export function fuzzyNameMatch(feedTitle: string, grantName: string): boolean {
  const a = new Set(nameTokens(feedTitle));
  const b = new Set(nameTokens(grantName));
  if (a.size === 0 || b.size === 0) return false;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  if (inter / union >= 0.5) return true;
  const smaller = Math.min(a.size, b.size);
  if (smaller >= 2 && inter === smaller) return true;
  const acr = grantName.match(/\(([A-Z][A-Za-z&-]{2,})\)/);
  if (acr && new RegExp(`\\b${acr[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(feedTitle)) return true;
  return false;
}

// GrantConnect lists every federal GO (sheep-industry roadmaps, broadcasting,
// MRFF medical research, hydrogen offtake …). Only items that read as
// startup / SME / innovation funding are worth a human's review minute:
// a strong keyword in the title, or two distinct strong keywords in the
// blurb — and never the medical-research bodies (they fund institutions).
const STRONG_RE =
  /\b(start-?ups?|founders?|entrepreneur\w*|innovation\s+(?:fund|grant|program|programme|challenge|voucher)s?|commerciali[sz]\w*|accelerat(?:or|ors|ing)|incubat\w*|r&d|research\s+and\s+development|smes?|small\s+(?:and\s+medium\s+)?business\w*|industry\s+growth|cooperative\s+research|crc-p|early[- ]stage|seed\s+funding|venture\s+(?:capital|fund)|scale-?ups?|deep\s+tech|fintech|agtech|medtech|cleantech|quantum|robotics|cyber\s*security|defence\s+industry|advanced\s+manufactur\w*|future\s+made\s+in\s+australia|export(?:ers?|\s+market)|tech(?:nology)?\s+(?:adoption|voucher|start-?up)s?)\b/gi;
const EXCLUDE_RE = /\b(mrff|nhmrc|clinical|hospital|aged\s+care|stillbirth|midwi\w+|nurses?|pharmaceutical\s+benefits)\b/i;

/** True when a feed item plausibly concerns startup / SME / innovation funding. Exported for tests. */
export function isStartupRelevant(item: Pick<RssItem, "title" | "description">): boolean {
  if (EXCLUDE_RE.test(item.title)) return false;
  if (new RegExp(STRONG_RE.source, "i").test(item.title)) return true;
  const hits = new Set<string>();
  for (const m of (item.description ?? "").matchAll(STRONG_RE)) hits.add(m[1].toLowerCase().replace(/\s+/g, " "));
  return hits.size >= 2;
}

/** Stable identity of a queue entry for week-over-week dedupe. Exported for tests. */
export function reviewEntryKey(e: Pick<ReviewQueueEntry, "kind" | "id" | "url" | "reason" | "hint">): string {
  const h = e.hint ?? {};
  return [e.kind, e.id ?? e.url, e.reason, String(h.status ?? ""), String(h.closes_at ?? ""), String(h.http_status ?? "")].join("|");
}

/** Do not re-queue the same finding within this window (blocked hosts stay blocked for months). */
export const DEDUPE_DAYS = 28;

// ─── Row classification (pure) ───────────────────────────────────────────────

export type RowDecision =
  | { action: "none" }
  | { action: "verify" }
  | { action: "flip_open" }
  | { action: "queue"; reason: ReviewReason };

// Words that appear in half the grant names on a portal — a hit on one of
// these proves nothing ("plant research" ≠ "Research & Innovation Fund").
const GENERIC_NAME_WORDS = new Set([
  "research", "innovation", "innovative", "business", "businesses", "development", "industry", "industries",
  "science", "support", "growth", "regional", "community", "women", "female", "digital", "technology",
  "state", "south", "north", "west", "east", "western", "northern", "eastern", "southern", "territory",
  "queensland", "victoria", "tasmania", "commercialisation", "commercialization", "incentive", "incentives",
]);

/**
 * True when the grant's own name sits in the evidence snippet: at least two
 * distinctive name tokens (≥ 4 chars, not generic portal words) — or one when
 * the name only has one. Guards the auto-flip against "Applications open for
 * <some other program>" teasers on listing pages (live case: the SA RIF page
 * announcing the Science Excellence Awards). A name with no distinctive token
 * cannot be checked and passes.
 */
export function nameNearEvidence(name: string, evidence: string | undefined): boolean {
  const all = nameTokens(name).filter((t) => t.length >= 4);
  const distinctive = all.filter((t) => !GENERIC_NAME_WORDS.has(t));
  const toks = distinctive.length > 0 ? distinctive : all;
  if (toks.length === 0) return true;
  const ev = (evidence ?? "").toLowerCase();
  if (!ev) return false;
  const hits = toks.filter((t) => ev.includes(t)).length;
  return hits >= Math.min(2, toks.length);
}

/** Decide what to do with one reachable row given its page hint. Exported for tests. */
export function decideRow(row: Pick<RefreshGrantRow, "status" | "closes_at" | "name">, hint: StatusHint): RowDecision {
  const statusKnown = hint.status !== undefined;
  const closesKnown = hint.closes_at !== undefined;
  if (!statusKnown && !closesKnown) return { action: "none" };

  // "paused" rows are a human call (IGP-style intake pauses); treat page
  // "open" against stored "paused" as a mismatch, never a flip.
  const statusAgrees = !statusKnown || hint.status === row.status;
  const closesAgrees = !closesKnown || hint.closes_at === row.closes_at;

  if (statusAgrees && closesAgrees) return { action: "verify" };

  if (
    !statusAgrees &&
    row.status === "upcoming" &&
    hint.status === "open" &&
    hint.explicit_open === true &&
    hint.confidence === "medium" &&
    closesAgrees &&
    nameNearEvidence(row.name, hint.evidence)
  ) {
    return { action: "flip_open" };
  }

  if (!statusAgrees && !closesAgrees) return { action: "queue", reason: "status_closes_mismatch" };
  if (!statusAgrees) return { action: "queue", reason: "status_mismatch" };
  return { action: "queue", reason: "closes_at_mismatch" };
}

// ─── Main loop ───────────────────────────────────────────────────────────────

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

function hintToRecord(hint: StatusHint): Record<string, unknown> {
  const r: Record<string, unknown> = { confidence: hint.confidence };
  if (hint.status) r.status = hint.status;
  if (hint.closes_at) r.closes_at = hint.closes_at;
  if (hint.explicit_open) r.explicit_open = true;
  if (hint.evidence) r.evidence = hint.evidence;
  return r;
}

export async function refreshFundingSources(opts: RefreshOptions = {}): Promise<RefreshSummary> {
  const now = opts.now ?? new Date();
  const today = now.toISOString().slice(0, 10);
  const ts = now.toISOString();
  const dryRun = opts.dryRun ?? false;
  const doFetch: FetchLike = opts.fetch ?? ((url) => fetchText(url, { timeoutMs: 12_000, retries: 1, backoffMs: 750 }));
  const queuePath = opts.queuePath ?? REVIEW_QUEUE_PATH;
  const feedUrl = opts.grantConnectUrl === undefined
    ? (process.env.FUNDING_GRANTCONNECT_RSS_URL || GRANTCONNECT_RSS_URL)
    : opts.grantConnectUrl;
  const concurrency = opts.concurrency ?? 4;
  const budgetMs = opts.budgetMs ?? 200_000;
  const maxNewItems = opts.maxNewItems ?? 40;
  const started = Date.now();

  const summary: RefreshSummary = {
    ok: true,
    dryRun,
    checked: 0,
    reachable: 0,
    blocked: 0,
    verified: 0,
    queued: 0,
    flipped: 0,
    deduped: 0,
    errors: 0,
    skipped: 0,
    feed: { url: feedUrl || null, items: 0, blocked: false, newCandidates: 0 },
    entries: [],
  };

  const db = opts.db === undefined ? (getSupabaseAdmin() as unknown as RefreshDb | null) : opts.db;
  if (!db) {
    return { ...summary, ok: false, error: "supabase_unavailable" };
  }

  // 1. Load matchable grants.
  let rows: RefreshGrantRow[] = [];
  try {
    const { data, error } = await db
      .from("au_grants")
      .select("id,name,status,closes_at,official_url,source_url,exclude_from_matching,status_confidence")
      .eq("exclude_from_matching", false);
    if (error) return { ...summary, ok: false, error: `load_failed: ${error.message}` };
    rows = ((data as RefreshGrantRow[] | null) ?? []).filter((r) => r && r.id);
  } catch (err) {
    return { ...summary, ok: false, error: `load_failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  const queue: ReviewQueueEntry[] = [];
  const updates: Array<{ id: string; values: Record<string, unknown> }> = [];

  const targets = rows
    .map((r) => ({ row: r, url: (r.source_url || r.official_url || "").trim() }))
    .filter((t) => /^https?:\/\//i.test(t.url));
  summary.checked = targets.length;

  // 2. Fetch + classify each page.
  await mapLimit(targets, concurrency, async ({ row, url }) => {
    if (Date.now() - started > budgetMs) {
      summary.skipped++;
      return;
    }
    let res: FetchTextResult;
    try {
      res = await doFetch(url);
    } catch {
      summary.errors++;
      return;
    }
    const current = { status: row.status, closes_at: row.closes_at, status_confidence: row.status_confidence };

    if (res.blocked) {
      summary.blocked++;
      queue.push({ ts, kind: "grant", id: row.id, url, reason: "blocked", hint: { http_status: res.status }, current });
      return;
    }
    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        queue.push({ ts, kind: "grant", id: row.id, url, reason: "unreachable", hint: { http_status: res.status }, current });
      } else {
        summary.errors++;
      }
      return;
    }

    summary.reachable++;
    const hint = extractStatusHints(res.text, now);
    const decision = decideRow(row, hint);
    switch (decision.action) {
      case "none":
        return;
      case "verify":
        summary.verified++;
        updates.push({ id: row.id, values: { last_verified_at: today, verified_by: "cron" } });
        return;
      case "flip_open":
        summary.flipped++;
        updates.push({
          id: row.id,
          values: { status: "open", status_confidence: "medium", last_verified_at: today, verified_by: "cron" },
        });
        // Audit trail: the only automatic status write is visible to humans too.
        queue.push({ ts, kind: "grant", id: row.id, url, reason: "flipped_open", hint: hintToRecord(hint), current });
        return;
      case "queue":
        queue.push({ ts, kind: "grant", id: row.id, url, reason: decision.reason, hint: hintToRecord(hint), current });
        return;
    }
  });

  // Week-over-week dedupe: identical findings already queued in the last
  // DEDUPE_DAYS days are dropped (blocked hosts, unchanged mismatches).
  const dedupeCutoff = now.getTime() - DEDUPE_DAYS * 24 * 60 * 60 * 1000;
  const recentKeys = new Set(
    readReviewQueue(5000, queuePath)
      .filter((e) => {
        const t = Date.parse(e.ts);
        return Number.isFinite(t) && t >= dedupeCutoff;
      })
      .map(reviewEntryKey),
  );
  const fresh: ReviewQueueEntry[] = [];
  for (const e of queue) {
    const k = reviewEntryKey(e);
    if (recentKeys.has(k)) {
      summary.deduped++;
      continue;
    }
    recentKeys.add(k);
    fresh.push(e);
  }
  queue.length = 0;
  queue.push(...fresh);

  // 3. GrantConnect feed → possible new grants.
  if (feedUrl) {
    let feedRes: FetchTextResult;
    try {
      feedRes = await doFetch(feedUrl);
    } catch (err) {
      feedRes = { ok: false, status: 0, text: "", blocked: false, truncated: false, attempts: 1, error: err instanceof Error ? err.message : String(err) };
    }
    if (feedRes.blocked) {
      summary.feed.blocked = true;
      summary.blocked++;
      queue.push({ ts, kind: "new", url: feedUrl, reason: "blocked", hint: { http_status: feedRes.status, source: "grantconnect_rss" }, current: null });
    } else if (feedRes.ok) {
      let items = parseRssItems(feedRes.text);
      if (items.length === 0) {
        // HTML list page instead of a feed (plan's `/go/list`) → follow the
        // advertised RSS once.
        const alt = discoverFeedUrl(feedRes.text, feedUrl);
        if (alt && alt !== feedUrl) {
          let altRes: FetchTextResult | null = null;
          try {
            altRes = await doFetch(alt);
          } catch {
            altRes = null;
          }
          if (altRes?.ok) {
            items = parseRssItems(altRes.text);
            if (items.length > 0) summary.feed.url = alt;
          }
        }
      }
      summary.feed.items = items.length;
      if (items.length === 0) {
        queue.push({ ts, kind: "new", url: feedUrl, reason: "feed_empty", hint: { http_status: feedRes.status, bytes: feedRes.text.length, source: "grantconnect_rss" }, current: null });
      } else {
        const alreadyQueued = new Set(
          readReviewQueue(5000, queuePath)
            .filter((e) => e.kind === "new" && e.reason === "possible_new_grant")
            .map((e) => e.url || String(e.hint?.title ?? "")),
        );
        const names = rows.map((r) => r.name);
        let added = 0;
        for (const item of items) {
          if (added >= maxNewItems) break;
          if (!item.title) continue;
          if (!isStartupRelevant(item)) continue;
          if (names.some((n) => fuzzyNameMatch(item.title, n))) continue;
          const key = item.link || item.title;
          if (alreadyQueued.has(key)) continue;
          alreadyQueued.add(key);
          added++;
          queue.push({
            ts,
            kind: "new",
            url: item.link || feedUrl,
            reason: "possible_new_grant",
            hint: { title: item.title, pubDate: item.pubDate, description: item.description.slice(0, 240), source: "grantconnect_rss" },
            current: null,
          });
        }
        summary.feed.newCandidates = added;
      }
    } else {
      summary.errors++;
    }
  }

  // 4. Persist (unless dry run).
  summary.queued = queue.length;
  summary.entries = queue.slice(0, 50);
  if (!dryRun) {
    for (const u of updates) {
      try {
        const { error } = await db.from("au_grants").update(u.values).eq("id", u.id);
        if (error) {
          summary.errors++;
          console.warn(`[funding/refresh] update ${u.id}: ${error.message}`);
        }
      } catch (err) {
        summary.errors++;
        console.warn(`[funding/refresh] update ${u.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    try {
      appendReviewEntries(queue, queuePath);
    } catch (err) {
      summary.errors++;
      summary.error = `queue_write_failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  return summary;
}
