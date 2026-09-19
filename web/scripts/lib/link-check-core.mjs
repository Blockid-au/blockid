// G17-P2B — pure helpers for scripts/link-check.mjs: HTML → links, URL
// normalisation, internal/external classification, crawl-scope rules,
// sitemap + robots parsing and the run summary. No I/O, no dependencies —
// everything here is pinned by scripts/link-check.test.mjs with fixtures and
// reused by the live-qa marketing lane (tests/live-qa/31-marketing.spec.ts)
// against the fetched home HTML.

/** Sent on every request so the ops log can tell the checker from a visitor. */
export const USER_AGENT = "BlockID-LinkCheck/1.0";

/**
 * Auth / dynamic prefixes: never crawled (their HTML is a login shell or a
 * per-user page), but HEAD-checked once for a non-5xx status when linked.
 */
export const NO_CRAWL_PREFIXES = Object.freeze([
  "/api/",
  "/workspace/",
  "/dashboard/",
  "/admin/",
  "/auth/",
  "/s/",
  "/apply/",
]);

/** Hop count above which a redirect is reported as a chain (spec § 3 P2-B). */
export const MAX_REDIRECT_HOPS = 2;
/** Anything slower than this (ms) lands in `slow`. */
export const SLOW_MS = 3000;

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
const IGNORED_SCHEMES = /^(mailto|tel|sms|javascript|data|blob|about):/i;

/** `<a href>`, `<link href>` (stylesheet/canonical/alternate/icon), `<img src>`, `<source src>`, `<script src>`. */
const TAG_RE = /<(a|link|img|source|script)\b([^>]*)>/gi;

function attr(attrs, name) {
  const re = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i");
  const m = re.exec(attrs);
  if (!m) return null;
  return decodeEntities(m[1] ?? m[2] ?? m[3] ?? "");
}

/** The handful of entities React/Next emit inside attribute values. */
export function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/**
 * Every link-like reference in one HTML document, in source order.
 * Returns `[{ raw, kind }]` — `kind` is `a` | `link:<rel>` | `img` |
 * `source` | `script`. `<link>` without a checkable rel (preload, dns-prefetch,
 * modulepreload, preconnect, manifest) is skipped: those are hints, not
 * navigations, and Next emits hundreds per page.
 */
export function extractLinks(html) {
  const out = [];
  // Drop comments and <noscript> blocks — the GTM iframe/pixel inside
  // <noscript> is not a link a visitor can follow.
  const cleaned = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<noscript[\s\S]*?<\/noscript>/gi, "");
  let m;
  while ((m = TAG_RE.exec(cleaned)) !== null) {
    const tag = m[1].toLowerCase();
    const attrs = m[2];
    if (tag === "a") {
      const href = attr(attrs, "href");
      if (href !== null) out.push({ raw: href, kind: "a" });
    } else if (tag === "link") {
      const rel = (attr(attrs, "rel") ?? "").toLowerCase().trim();
      const href = attr(attrs, "href");
      if (href === null) continue;
      if (/^(stylesheet|canonical|alternate|icon|apple-touch-icon|shortcut icon)$/.test(rel)) {
        out.push({ raw: href, kind: `link:${rel.replace(/\s+/g, "-")}` });
      }
    } else if (tag === "img" || tag === "source" || tag === "script") {
      const src = attr(attrs, "src");
      if (src !== null) out.push({ raw: src, kind: tag });
      if (tag !== "script") {
        // First candidate of a srcset — the rest are the same asset resized.
        const srcset = attr(attrs, "srcset");
        if (srcset) {
          const first = srcset.split(",")[0]?.trim().split(/\s+/)[0];
          if (first) out.push({ raw: first, kind: `${tag}:srcset` });
        }
      }
    }
  }
  return out;
}

/** Every `id="…"` (and `<a name>`) in the document — the fragment targets. */
export function extractIds(html) {
  const ids = new Set();
  const re = /\s(?:id|name)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const v = (m[1] ?? m[2] ?? "").trim();
    if (v) ids.add(decodeEntities(v));
  }
  return ids;
}

/**
 * Resolve a raw href against the page it appeared on.
 * Returns `{ href, fragment }` with the fragment stripped from `href`, or
 * `null` for non-HTTP schemes and empty/`#`-only hrefs.
 */
export function normalizeUrl(raw, pageUrl) {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  if (IGNORED_SCHEMES.test(trimmed)) return null;
  if (SCHEME_RE.test(trimmed) && !/^https?:/i.test(trimmed)) return null;
  let u;
  try {
    u = new URL(trimmed, pageUrl);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  const fragment = u.hash ? decodeURIComponent(u.hash.slice(1)) : "";
  u.hash = "";
  // `/pricing/` and `/pricing` are the same Next route; the trailing-slash
  // redirect would otherwise show up as a one-hop chain on every such link.
  if (u.pathname.length > 1 && u.pathname.endsWith("/")) u.pathname = u.pathname.slice(0, -1);
  return { href: u.toString(), fragment };
}

/**
 * Site identity: `base` is what we fetch (production or the deploy's temp
 * port), `site` the canonical public origin. Links to either are internal;
 * a canonical link inside a page served from 127.0.0.1:4099 is rewritten to
 * the base so the temp release is what gets checked, not production.
 */
export function makeSite(base, site) {
  const baseUrl = new URL(base);
  const siteUrl = new URL(site ?? (baseUrl.hostname === "127.0.0.1" || baseUrl.hostname === "localhost" ? "https://blockid.au" : base));
  const origins = new Set([baseUrl.origin, siteUrl.origin]);
  // www. and bare host are the same site.
  for (const o of [baseUrl, siteUrl]) {
    if (o.hostname.startsWith("www.")) origins.add(`${o.protocol}//${o.hostname.slice(4)}`);
    else origins.add(`${o.protocol}//www.${o.hostname}`);
  }
  return { base: baseUrl.origin, site: siteUrl.origin, origins };
}

/** `internal` | `external` for an absolute URL under a `makeSite()` identity. */
export function classify(href, site) {
  let u;
  try {
    u = new URL(href);
  } catch {
    return "external";
  }
  return site.origins.has(u.origin) ? "internal" : "external";
}

/** The URL we actually request: internal links are fetched from `base`. */
export function toFetchUrl(href, site) {
  const u = new URL(href);
  if (!site.origins.has(u.origin)) return href;
  const b = new URL(site.base);
  u.protocol = b.protocol;
  u.hostname = b.hostname;
  u.port = b.port; // the host setter keeps an existing port when the new host has none
  return u.toString();
}

/** The canonical (site-origin) form used as the record key. */
export function toSiteUrl(href, site) {
  const u = new URL(href);
  if (!site.origins.has(u.origin)) return href;
  const s = new URL(site.site);
  u.protocol = s.protocol;
  u.hostname = s.hostname;
  u.port = s.port;
  return u.toString();
}

/** Path is under one of the auth/dynamic prefixes (HEAD-once, never crawl). */
export function isNoCrawlPath(pathname, prefixes = NO_CRAWL_PREFIXES) {
  const p = pathname.endsWith("/") ? pathname : `${pathname}/`;
  return prefixes.some((pre) => p.startsWith(pre));
}

/** Static/asset paths that are fetched but never parsed for links. */
export function isAssetPath(pathname) {
  return /^\/_next\//.test(pathname) || /\.(css|js|mjs|map|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|pdf|json|xml|txt|mp4|webm|mp3|zip)$/i.test(pathname);
}

/**
 * robots.txt → disallow rules for `*` and for our UA (most specific group
 * wins, per RFC 9309). Returns `{ disallow: string[], allow: string[] }`.
 */
export function parseRobots(txt, ua = USER_AGENT) {
  const groups = [];
  let cur = null;
  for (const rawLine of (txt ?? "").split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const val = line.slice(idx + 1).trim();
    if (key === "user-agent") {
      if (!cur || cur.rules.length > 0) {
        cur = { agents: [], rules: [] };
        groups.push(cur);
      }
      cur.agents.push(val.toLowerCase());
    } else if ((key === "disallow" || key === "allow") && cur) {
      cur.rules.push({ type: key, path: val });
    }
  }
  const product = ua.split("/")[0].toLowerCase();
  const mine = groups.find((g) => g.agents.some((a) => a !== "*" && product.includes(a)));
  const star = groups.find((g) => g.agents.includes("*"));
  const g = mine ?? star ?? { rules: [] };
  return {
    disallow: g.rules.filter((r) => r.type === "disallow" && r.path).map((r) => r.path),
    allow: g.rules.filter((r) => r.type === "allow" && r.path).map((r) => r.path),
  };
}

/** Longest-match allow/disallow (RFC 9309 § 2.2.2); `*` and `$` supported. */
export function robotsAllows(pathname, rules) {
  if (!rules) return true;
  const toRe = (p) => {
    const anchored = p.endsWith("$");
    const body = (anchored ? p.slice(0, -1) : p).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp(`^${body}${anchored ? "$" : ""}`);
  };
  let best = { len: -1, allow: true };
  for (const [list, allow] of [
    [rules.allow ?? [], true],
    [rules.disallow ?? [], false],
  ]) {
    for (const p of list) {
      if (toRe(p).test(pathname) && p.length > best.len) best = { len: p.length, allow };
    }
  }
  return best.allow;
}

/** `<loc>` URLs from a urlset or a sitemap index (both share the tag). */
export function parseSitemap(xml) {
  const out = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let m;
  while ((m = re.exec(xml ?? "")) !== null) out.push(decodeEntities(m[1]));
  return { urls: out, isIndex: /<sitemapindex/i.test(xml ?? "") };
}

/**
 * External hosts block bots with 403/405/429 and some answer HEAD with 999
 * (LinkedIn). Only a hard 404, a 5xx or a network failure is a broken link.
 */
export function externalIsBroken(status) {
  if (status === null || status === undefined || status === 0) return true;
  if (status === 404 || status === 410) return true;
  return status >= 500 && status !== 999;
}

/** Internal links must land on 200 (or 204 for a `<link>` target) after ≤ MAX hops. */
export function internalIsBroken(status, hops) {
  if (status === null || status === undefined || status === 0) return true;
  if (hops > 5) return true; // loop guard — reported as a chain as well
  return !(status === 200 || status === 204);
}

/**
 * Reduce the per-URL records into the report row written to
 * content/reports/link-check.jsonl. Each record:
 *   { url, from, status, final_url, kind, ms, hops, internal, fragment_missing? , error? }
 */
export function summarize(records, { ts = new Date().toISOString(), base, pages = 0, sitemap = null } = {}) {
  const broken = [];
  const redirect_chains = [];
  const slow = [];
  for (const r of records) {
    // Gated (auth/dynamic) paths are HEAD-checked once: a 200, a redirect
    // to /auth/login or a 401/403 all prove the route exists.
    const isBroken = r.gated
      ? r.status === null || r.status === undefined || r.status === 0 || r.status === 404 || r.status >= 500
      : r.internal
        ? internalIsBroken(r.status, r.hops ?? 0)
        : externalIsBroken(r.status);
    if (isBroken || r.fragment_missing) {
      broken.push({
        url: r.url,
        from: r.from,
        status: r.status ?? null,
        final_url: r.final_url ?? null,
        kind: r.kind,
        internal: r.internal,
        ...(r.fragment_missing ? { fragment_missing: r.fragment_missing } : {}),
        ...(r.error ? { error: r.error } : {}),
      });
    }
    if ((r.hops ?? 0) > MAX_REDIRECT_HOPS) {
      redirect_chains.push({ url: r.url, from: r.from, hops: r.hops, final_url: r.final_url ?? null, chain: r.chain ?? [] });
    }
    if ((r.ms ?? 0) > SLOW_MS) slow.push({ url: r.url, ms: r.ms, kind: r.kind });
  }
  broken.sort((a, b) => Number(b.internal) - Number(a.internal) || String(a.url).localeCompare(String(b.url)));
  slow.sort((a, b) => b.ms - a.ms);
  return {
    ts,
    base,
    pages,
    links: records.length,
    internal: records.filter((r) => r.internal).length,
    external: records.filter((r) => !r.internal).length,
    broken_internal: broken.filter((b) => b.internal).length,
    broken_external: broken.filter((b) => !b.internal).length,
    broken,
    redirect_chains,
    slow: slow.slice(0, 25),
    ...(sitemap ? { sitemap } : {}),
  };
}

/** Human summary for stdout / Telegram. */
export function formatSummary(s) {
  const lines = [
    `[link-check] ${s.ts} ${s.base}: ${s.pages} pages · ${s.links} links (${s.internal} internal / ${s.external} external)`,
    `  broken: ${s.broken.length} (${s.broken_internal} internal, ${s.broken_external} external) · redirect chains > ${MAX_REDIRECT_HOPS}: ${s.redirect_chains.length} · slow > ${SLOW_MS} ms: ${s.slow.length}`,
  ];
  if (s.sitemap) lines.push(`  sitemap: ${s.sitemap.urls} urls · ${s.sitemap.ok} ok · ${s.sitemap.failed} failed`);
  for (const b of s.broken.slice(0, 40)) {
    const why = b.fragment_missing ? `missing #${b.fragment_missing}` : b.error ? b.error : `${b.status}`;
    lines.push(`  ✗ ${b.internal ? "INT" : "EXT"} ${b.url} ← ${b.from} [${b.kind}] ${why}`);
  }
  if (s.broken.length > 40) lines.push(`  … ${s.broken.length - 40} more`);
  for (const c of s.redirect_chains.slice(0, 10)) lines.push(`  ↪ ${c.url} ${c.hops} hops → ${c.final_url} (← ${c.from})`);
  return lines.join("\n");
}

/** CLI args → options (defaults documented in scripts/link-check.mjs). */
export function parseArgs(argv) {
  const out = {
    base: "https://blockid.au",
    site: null,
    max: 400,
    concurrency: 6,
    json: false,
    includeSitemap: false,
    dryRun: false,
    alert: true,
    timeoutMs: 10_000,
    outDir: null,
    externals: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--base") out.base = String(argv[++i] ?? out.base).replace(/\/+$/, "");
    else if (a === "--site") out.site = String(argv[++i] ?? "").replace(/\/+$/, "") || null;
    else if (a === "--max") out.max = Math.max(1, Math.min(5000, Number(argv[++i]) || 400));
    else if (a === "--concurrency") out.concurrency = Math.max(1, Math.min(32, Number(argv[++i]) || 6));
    else if (a === "--timeout") out.timeoutMs = Math.max(1000, Number(argv[++i]) || 10_000);
    else if (a === "--json") out.json = true;
    else if (a === "--include-sitemap") out.includeSitemap = true;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--no-alert") out.alert = false;
    else if (a === "--no-external") out.externals = false;
    else if (a === "--out-dir") out.outDir = String(argv[++i] ?? "");
  }
  return out;
}
