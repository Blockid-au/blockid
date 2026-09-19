#!/usr/bin/env node
// G17-P2B — site link checker (spec docs/plans/unicorn-homepage-2026-09-19.md § 2 D7).
// Plain node, no deps. Read-only GET/HEAD traffic only.
//
//   node scripts/link-check.mjs --base https://blockid.au                 # BFS from / (≤ 400 pages)
//   node scripts/link-check.mjs --base https://blockid.au --include-sitemap  # + every sitemap URL as a seed (cron)
//   node scripts/link-check.mjs --base http://127.0.0.1:4099 --no-external --no-alert --dry-run
//                                                                          # deploy gate 8 against the temp release
//   --max 400 --concurrency 6 --timeout 10000 --json --dry-run --no-alert --no-external
//   --site https://blockid.au   canonical origin when --base is a local port (default: inferred)
//   --out-dir <dir>             where link-check.jsonl / link-check-latest.json go (default content/reports)
//
// What a run does:
//   1. GET /robots.txt (Disallow honoured for crawling; disallowed pages are
//      still status-checked when linked) and, with --include-sitemap,
//      /sitemap.xml (+ nested sitemaps) — every <loc> becomes a seed.
//   2. BFS from / over same-origin HTML pages (≤ --max). For every <a href>,
//      <link href> (stylesheet/canonical/alternate/icon), <img src>,
//      <source src>, <script src>:
//        internal → GET, redirects followed by hand (≤ 5 hops; > 2 reported as
//                   a chain), final status must be 200; `#fragment` targets are
//                   verified against the ids of the crawled page;
//        /api /workspace /dashboard /admin /auth /s /apply → HEAD once, only
//                   a 5xx / network failure counts as broken;
//        external → HEAD (GET retry on 404/5xx); only 404/410/5xx/DNS count.
//   3. Writes content/reports/link-check.jsonl (one row per run:
//      {ts, base, pages, links, broken:[…], redirect_chains:[…], slow:[…]}) +
//      link-check-latest.json; Telegram/e-mail via scripts/lib/ops-env.mjs
//      sendTelegram when broken > 0 (skip with --no-alert). --dry-run writes
//      and sends nothing.
//   4. Exit 1 when broken > 0 (unless --dry-run); exit 2 on a crash or when
//      another run holds the lock.
//
// Lock: /tmp/blockid-link-check.lock (pid file, stale-safe). Every request:
// 10 s timeout (--timeout), User-Agent BlockID-LinkCheck/1.0.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { acquireLock, appendJsonl, sendTelegram, WEB_DIR, writeJsonAtomic } from "./lib/ops-env.mjs";
import {
  USER_AGENT,
  classify,
  extractIds,
  extractLinks,
  formatSummary,
  isAssetPath,
  isEdgeInjectedPath,
  isNoCrawlPath,
  makeSite,
  normalizeUrl,
  parseArgs,
  parseRobots,
  parseSitemap,
  robotsAllows,
  summarize,
  toFetchUrl,
  toSiteUrl,
} from "./lib/link-check-core.mjs";

const LOCK = "/tmp/blockid-link-check.lock";
const MAX_HOPS = 5;

/** Bounded pool: every request (page, resource, external) waits for a slot. */
function makeLimiter(size) {
  let active = 0;
  const waiters = [];
  return async function withSlot(fn) {
    if (active >= size) await new Promise((resolve) => waiters.push(resolve));
    active += 1;
    try {
      return await fn();
    } finally {
      active -= 1;
      const w = waiters.shift();
      if (w) w();
    }
  };
}

/** fetch with a hard timeout and our UA; never throws — returns {res}|{error}. */
async function request(url, { method = "GET", timeoutMs, fetchImpl, redirect = "manual", limiter }) {
  return limiter ? limiter(() => rawRequest(url, { method, timeoutMs, fetchImpl, redirect })) : rawRequest(url, { method, timeoutMs, fetchImpl, redirect });
}

async function rawRequest(url, { method, timeoutMs, fetchImpl, redirect }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    const res = await fetchImpl(url, {
      method,
      redirect,
      signal: ctrl.signal,
      headers: { "user-agent": USER_AGENT, accept: method === "HEAD" ? "*/*" : "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
    });
    return { res, ms: Date.now() - t0 };
  } catch (err) {
    const name = err instanceof Error ? err.name : "error";
    const code = err && err.cause && err.cause.code ? String(err.cause.code) : "";
    return { error: name === "AbortError" ? "timeout" : code || name, ms: Date.now() - t0 };
  } finally {
    clearTimeout(timer);
  }
}

/** GET an internal URL, following redirects by hand so the chain is visible. */
async function fetchInternal(fetchUrl, site, opts) {
  const chain = [];
  let current = fetchUrl;
  let totalMs = 0;
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    const r = await request(current, { ...opts, method: "GET", redirect: "manual" });
    totalMs += r.ms;
    if (r.error) return { status: null, error: r.error, hops: hop, chain, final_url: toSiteUrl(current, site), ms: totalMs, html: null, contentType: "" };
    const { res } = r;
    const status = res.status;
    if (status >= 300 && status < 400 && res.headers.get("location")) {
      chain.push({ url: toSiteUrl(current, site), status });
      const next = normalizeUrl(res.headers.get("location"), current);
      try {
        await res.arrayBuffer();
      } catch {
        /* body irrelevant */
      }
      if (!next) return { status, error: "bad_location", hops: hop + 1, chain, final_url: null, ms: totalMs, html: null, contentType: "" };
      // A redirect off-site (e.g. to an OAuth host) is checked as an external.
      if (classify(next.href, site) !== "internal") {
        return { status, hops: hop + 1, chain, final_url: next.href, ms: totalMs, html: null, contentType: "", offsite: next.href };
      }
      current = toFetchUrl(next.href, site);
      continue;
    }
    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
    let html = null;
    if (contentType.includes("text/html")) {
      try {
        html = await res.text();
      } catch {
        html = null;
      }
    } else {
      try {
        await res.arrayBuffer();
      } catch {
        /* ignore */
      }
    }
    return { status, hops: chain.length, chain, final_url: toSiteUrl(current, site), ms: totalMs, html, contentType };
  }
  return { status: null, error: "redirect_loop", hops: MAX_HOPS + 1, chain, final_url: null, ms: totalMs, html: null, contentType: "" };
}

/** HEAD once (GET fallback on 405 / 404 / 5xx — some hosts refuse HEAD). */
async function probe(url, opts, { getFallback = true } = {}) {
  const h = await request(url, { ...opts, method: "HEAD", redirect: "follow" });
  if (!h.error && !(getFallback && (h.res.status === 405 || h.res.status === 404 || h.res.status >= 500))) {
    return { status: h.res.status, final_url: h.res.url || url, ms: h.ms };
  }
  const g = await request(url, { ...opts, method: "GET", redirect: "follow" });
  if (g.error) return { status: null, error: h.error ?? g.error, final_url: null, ms: h.ms + g.ms };
  try {
    await g.res.arrayBuffer();
  } catch {
    /* ignore */
  }
  return { status: g.res.status, final_url: g.res.url || url, ms: h.ms + g.ms };
}

/** Load /sitemap.xml (+ one level of nested sitemaps) → absolute site URLs. */
export async function loadSitemap(site, opts, log) {
  const seen = new Set();
  const urls = [];
  const queue = [`${site.base}/sitemap.xml`];
  let fetched = 0;
  while (queue.length && fetched < 20) {
    const u = queue.shift();
    if (seen.has(u)) continue;
    seen.add(u);
    fetched += 1;
    const r = await request(u, { ...opts, method: "GET", redirect: "follow" });
    if (r.error || r.res.status !== 200) {
      log(`  ⚠ sitemap ${u}: ${r.error ?? r.res.status}`);
      continue;
    }
    const xml = await r.res.text();
    const { urls: locs, isIndex } = parseSitemap(xml);
    for (const loc of locs) {
      const n = normalizeUrl(loc, u);
      if (!n) continue;
      if (isIndex || /sitemap[^/]*\.xml$/i.test(new URL(n.href).pathname)) queue.push(toFetchUrl(n.href, site));
      else urls.push(toSiteUrl(n.href, site));
    }
  }
  return Array.from(new Set(urls));
}

/**
 * The crawl. `deps.fetchImpl` is injectable for the test. Returns the
 * summary row (see summarize()) plus `records` for callers that want them.
 */
export async function crawl(args, deps = {}) {
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  const log = deps.log ?? ((s) => process.stdout.write(`${s}\n`));
  const site = makeSite(args.base, args.site);
  const opts = { timeoutMs: args.timeoutMs, fetchImpl, limiter: makeLimiter(args.concurrency) };

  // robots
  let robots = null;
  {
    const r = await request(`${site.base}/robots.txt`, { ...opts, method: "GET", redirect: "follow" });
    if (!r.error && r.res.status === 200) robots = parseRobots(await r.res.text());
  }

  /** url(site form) → record */
  const records = new Map();
  /** url(site form) → Set of ids (crawled HTML pages) */
  const pageIds = new Map();
  /** pending fragment checks */
  const fragments = [];
  const crawlQueue = [];
  /** siteHref → { from, kind } of the first reference (BFS order). */
  const queued = new Map();
  let pagesCrawled = 0;
  let sitemapStats = null;

  const enqueuePage = (siteHref, from, kind) => {
    if (queued.has(siteHref)) return;
    queued.set(siteHref, { from, kind });
    crawlQueue.push(siteHref);
  };

  enqueuePage(`${site.site}/`, "(seed)", "a");
  if (args.includeSitemap) {
    const urls = await loadSitemap(site, opts, log);
    sitemapStats = { urls: urls.length, ok: 0, failed: 0, seeds: urls };
    for (const u of urls) enqueuePage(u, "(sitemap)", "sitemap");
  }

  const pending = new Map(); // siteHref → Promise<record>
  const checkLink = (siteHref, from, kind) => {
    if (records.has(siteHref)) return records.get(siteHref);
    if (pending.has(siteHref)) return pending.get(siteHref);
    const internal = classify(siteHref, site) === "internal";
    const p = (async () => {
      const rec = { url: siteHref, from, kind, internal, status: null, final_url: null, ms: 0, hops: 0 };
      const pathname = new URL(siteHref).pathname;
      if (internal && isNoCrawlPath(pathname)) {
        const r = await probe(toFetchUrl(siteHref, site), opts, { getFallback: false });
        Object.assign(rec, { status: r.status, final_url: r.final_url, ms: r.ms, error: r.error, gated: true });
      } else if (internal) {
        const r = await fetchInternal(toFetchUrl(siteHref, site), site, opts);
        Object.assign(rec, { status: r.status, final_url: r.final_url, ms: r.ms, hops: r.hops, chain: r.chain, error: r.error });
        if (r.offsite) {
          const ext = await probe(r.offsite, opts);
          rec.status = ext.status;
          rec.final_url = ext.final_url;
          rec.ms += ext.ms;
          rec.internal = false; // judged by the external rule
          rec.offsite = true;
        }
        if (r.html !== null) {
          pageIds.set(siteHref, extractIds(r.html));
          const crawlable = !isAssetPath(pathname) && robotsAllows(pathname, robots) && pagesCrawled < args.max;
          if (crawlable) {
            pagesCrawled += 1;
            rec.crawled = true;
            for (const { raw, kind: k } of extractLinks(r.html)) {
              const n = normalizeUrl(raw, siteHref);
              if (!n) continue;
              const target = toSiteUrl(n.href, site);
              const targetInternal = classify(target, site) === "internal";
              if (targetInternal && isEdgeInjectedPath(new URL(target).pathname)) continue;
              if (!targetInternal && !args.externals) continue;
              if (n.fragment && targetInternal) fragments.push({ page: target, fragment: n.fragment, from: siteHref });
              if (target === siteHref) continue; // self link (#anchor) — fragment check covers it
              if (targetInternal && !isNoCrawlPath(new URL(target).pathname) && !isAssetPath(new URL(target).pathname) && k === "a") enqueuePage(target, siteHref, k);
              else void checkLink(target, siteHref, k);
            }
          }
        }
      } else {
        const r = await probe(siteHref, opts);
        Object.assign(rec, { status: r.status, final_url: r.final_url, ms: r.ms, error: r.error });
      }
      records.set(siteHref, rec);
      pending.delete(siteHref);
      return rec;
    })();
    pending.set(siteHref, p);
    return p;
  };

  // BFS with a bounded pool: pages are pulled from crawlQueue, their
  // resources are checked as fire-and-forget promises tracked in `pending`.
  const workers = Array.from({ length: args.concurrency }, async () => {
    for (;;) {
      const next = crawlQueue.shift();
      if (next === undefined) {
        // Wait for in-flight pages that may enqueue more.
        if (pending.size === 0) return;
        await Promise.race(Array.from(pending.values())).catch(() => {});
        if (crawlQueue.length === 0 && pending.size === 0) return;
        continue;
      }
      const ref = queued.get(next) ?? { from: "(seed)", kind: "a" };
      const rec = await checkLink(next, ref.from, ref.kind);
      if (deps.onPage) deps.onPage(rec);
    }
  });
  await Promise.all(workers);
  while (pending.size) await Promise.all(Array.from(pending.values())).catch(() => {});

  // Fragments: only verifiable on pages we parsed.
  for (const f of fragments) {
    const ids = pageIds.get(f.page);
    if (!ids) continue;
    if (ids.has(f.fragment)) continue;
    if (f.fragment === "top" || f.fragment === "main" || f.fragment === "") continue;
    const key = `${f.page}#${f.fragment}`;
    if (records.has(key)) continue;
    records.set(key, { url: key, from: f.from, kind: "a", internal: true, status: 200, final_url: f.page, ms: 0, hops: 0, fragment_missing: f.fragment });
  }

  if (sitemapStats) {
    for (const u of sitemapStats.seeds) {
      const r = records.get(u);
      if (r && r.status === 200 && (r.hops ?? 0) === 0) sitemapStats.ok += 1;
      else sitemapStats.failed += 1;
    }
    delete sitemapStats.seeds;
  }

  const all = Array.from(records.values());
  const summary = summarize(all, { base: site.base, pages: pagesCrawled, sitemap: sitemapStats });
  summary.site = site.site;
  summary.gated_checked = all.filter((r) => r.gated).length;
  summary.max_pages_hit = pagesCrawled >= args.max;
  return { summary, records: all };
}

export async function main(argv = process.argv.slice(2), deps = {}) {
  const args = parseArgs(argv);
  const log = deps.log ?? ((s) => process.stdout.write(`${s}\n`));
  const outDir = args.outDir ? path.resolve(args.outDir) : path.join(WEB_DIR, "content", "reports");
  const release = deps.skipLock ? () => {} : acquireLock(deps.lockPath ?? LOCK);
  if (!release) {
    log("[link-check] another run holds the lock — exiting");
    return { exitCode: 2, summary: null };
  }
  try {
    const t0 = Date.now();
    const { summary } = await crawl(args, deps);
    summary.duration_ms = Date.now() - t0;
    summary.dry_run = args.dryRun;
    if (!args.dryRun) {
      appendJsonl(path.join(outDir, "link-check.jsonl"), summary);
      writeJsonAtomic(path.join(outDir, "link-check-latest.json"), summary);
    }
    if (args.json) log(JSON.stringify(summary));
    else log(formatSummary(summary));
    if (summary.broken.length > 0 && args.alert && !args.dryRun) {
      const head = `⚠ link-check: ${summary.broken.length} broken (${summary.broken_internal} internal) on ${summary.base} — ${summary.pages} pages, ${summary.links} links`;
      const body = summary.broken.slice(0, 12).map((b) => `• ${b.url} ← ${b.from} (${b.fragment_missing ? `#${b.fragment_missing} missing` : b.error ?? b.status})`).join("\n");
      const r = await (deps.sendTelegram ?? sendTelegram)(`${head}\n${body}`, {});
      if (!args.json) log(`  alert: ${r.sent ? `sent${r.via ? ` via ${r.via}` : ""}` : `not sent (${r.reason})`}`);
    }
    const exitCode = summary.broken.length > 0 && !args.dryRun ? 1 : 0;
    return { exitCode, summary };
  } finally {
    release();
  }
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().then(
    ({ exitCode }) => process.exit(exitCode),
    (err) => {
      process.stderr.write(`[link-check] crashed: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
      process.exit(2);
    },
  );
}
