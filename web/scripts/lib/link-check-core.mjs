// G17-P2B — pure helpers for scripts/link-check.mjs: HTML → links, URL
// normalisation, internal/external classification, crawl-scope rules,
// sitemap + robots parsing and the run summary. No I/O, no dependencies —
// everything here is pinned by scripts/link-check.test.mjs with fixtures and
// reused by the live-qa marketing lane (tests/live-qa/31-marketing.spec.ts)
// against the fetched home HTML.
//
// W1 (2026-10-20, docs/pricing-v5-plan.md § 5): JSON-LD URLs, og:image /
// twitter:image / og:url and hreflang alternates are extracted; external
// verdicts are three-way (ok | broken | unverifiable — 401/403/429/999 are
// recorded, not dropped); redirect loops and > 5 hops are broken; the open
// broken set is reconciled run-over-run (`open_since`, new / resolved,
// one escalation after 48 h) so the alert fires only when the set changes.

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
/** More hops than this (internal or external) is a broken link, like a loop. */
export const MAX_FOLLOW_HOPS = 5;
/** A link broken for longer than this is escalated once (W1). */
export const ESCALATE_AFTER_MS = 48 * 60 * 60 * 1000;
/** Query-string variants of one pathname parsed for links per run (filter-combination guard). */
export const QUERY_VARIANT_CAP = 25;
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
        const kind = rel === "alternate" && attr(attrs, "hreflang") ? "link:hreflang" : `link:${rel.replace(/\s+/g, "-")}`;
        out.push({ raw: href, kind });
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
  // Head metadata + structured data come last so the body links keep their
  // source order (the live-qa marketing lane samples the first N).
  out.push(...extractMetaLinks(cleaned), ...extractJsonLdLinks(cleaned));
  return out;
}

const META_RE = /<meta\b([^>]*)>/gi;
const META_URL_KEYS = new Set(["og:image", "og:image:url", "og:image:secure_url", "og:url", "twitter:image", "twitter:image:src"]);

/** `<meta property="og:image" content>` / `name="twitter:image"` / `og:url` → links. */
export function extractMetaLinks(html) {
  const out = [];
  let m;
  META_RE.lastIndex = 0;
  while ((m = META_RE.exec(html)) !== null) {
    const attrs = m[1];
    const key = (attr(attrs, "property") ?? attr(attrs, "name") ?? "").toLowerCase().trim();
    if (!META_URL_KEYS.has(key)) continue;
    const content = attr(attrs, "content");
    if (content) out.push({ raw: content.trim(), kind: `meta:${key}` });
  }
  return out;
}

const JSONLD_RE = /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
/** Schema.org properties whose value is a dereferenceable URL. `@id` is an identifier, not a link. */
const JSONLD_URL_KEYS = new Set(["url", "item", "image", "logo", "sameAs", "contentUrl", "thumbnailUrl", "embedUrl", "mainEntityOfPage", "downloadUrl", "installUrl", "license", "discussionUrl"]);

function looksLikeUrl(v) {
  // Templates (SearchAction "{search_term_string}") are not links.
  return typeof v === "string" && /^(https?:\/\/|\/)/i.test(v.trim()) && !/[{}]/.test(v);
}

/**
 * URLs inside `<script type="application/ld+json">` blocks (BreadcrumbList
 * `item`, Organization `logo` / `sameAs`, `url`, `image` …). Malformed JSON
 * is skipped. kind = `jsonld:<property>`.
 */
export function extractJsonLdLinks(html) {
  const out = [];
  const visit = (node, depth) => {
    if (depth > 20 || node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const n of node) visit(n, depth + 1);
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      if (JSONLD_URL_KEYS.has(key)) {
        for (const v of Array.isArray(value) ? value : [value]) {
          if (looksLikeUrl(v)) out.push({ raw: v.trim(), kind: `jsonld:${key}` });
          else if (v && typeof v === "object" && !Array.isArray(v)) {
            // {"@type":"WebPage","@id":"https://…"} / ImageObject {url} — the
            // object form of the same property.
            const ref = looksLikeUrl(v.url) ? v.url : looksLikeUrl(v["@id"]) ? v["@id"] : null;
            if (ref) out.push({ raw: ref.trim(), kind: `jsonld:${key}` });
          }
        }
      }
      if (value && typeof value === "object") visit(value, depth + 1);
    }
  };
  let m;
  JSONLD_RE.lastIndex = 0;
  while ((m = JSONLD_RE.exec(html)) !== null) {
    try {
      visit(JSON.parse(m[1]), 0);
    } catch {
      /* malformed block — the SEO audit owns validity, not the link check */
    }
  }
  // An object-form value also gets visited as a node, which would push its
  // `url` a second time under kind jsonld:url — keep the first occurrence.
  const seen = new Set();
  return out.filter((l) => (seen.has(l.raw) ? false : (seen.add(l.raw), true)));
}

/** Every `id="…"` (and `<a name>`) in the document — the fragment targets. */
export function extractIds(html) {
  const ids = new Set();
  // `id` on any element; `name` only on <a> (legacy anchors) — <meta name>,
  // <input name> must not satisfy a fragment (review 2026-09-19).
  const idRe = /\sid\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  let m;
  while ((m = idRe.exec(html)) !== null) {
    const v = (m[1] ?? m[2] ?? "").trim();
    if (v) ids.add(decodeEntities(v));
  }
  const aRe = /<a\b[^>]*\sname\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  while ((m = aRe.exec(html)) !== null) {
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

/**
 * Cloudflare-owned paths the edge injects into served HTML (Scrape Shield
 * email obfuscation rewrites every mailto: into `/cdn-cgi/l/email-protection#…`;
 * the challenge platform adds `/cdn-cgi/challenge-platform/…` scripts).
 * They are not links the site emits and 404 without the browser fragment,
 * so they are dropped before classification. tests/live-qa console-guard
 * tolerates the same rewrite until the founder flips the switch.
 */
export function isEdgeInjectedPath(pathname) {
  return pathname.startsWith("/cdn-cgi/");
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
  const sitemaps = [];
  let cur = null;
  for (const rawLine of (txt ?? "").split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const val = line.slice(idx + 1).trim();
    if (key === "sitemap") {
      // Group-independent (RFC 9309 § 2.3.5) — startupvalueindex.com lists its own.
      if (val) sitemaps.push(val);
      continue;
    }
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
    sitemaps,
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

/** Errors that are a verdict on the link itself, not on our ability to check it. */
const BROKEN_ERRORS = new Set(["redirect_loop", "too_many_redirects", "bad_location"]);
/** Errors that mean "we did not (or could not) look" — recorded, never alerted. */
const UNVERIFIABLE_ERRORS = new Set(["skipped_private"]);

/**
 * Three-way verdict for an external link (W1):
 *   - `broken`        404/410, 5xx (not 999), DNS/connection failure, timeout,
 *                     a redirect loop or more than MAX_FOLLOW_HOPS hops;
 *   - `unverifiable`  the host refused the bot — 401/403/405/429/451/999 and
 *                     any other 4xx — or a private host we will not probe;
 *   - `ok`            2xx/3xx.
 * Unverifiable links land in `summary.unverifiable` (they used to be dropped).
 */
export function externalVerdict(status, error = null) {
  if (error && BROKEN_ERRORS.has(error)) return "broken";
  if (error && UNVERIFIABLE_ERRORS.has(error)) return "unverifiable";
  if (status === null || status === undefined || status === 0) return "broken";
  if (status === 404 || status === 410) return "broken";
  if (status === 999) return "unverifiable";
  if (status >= 500) return "broken";
  if (status >= 400) return "unverifiable";
  return "ok";
}

/**
 * Back-compat boolean (pre-W1 callers): only `broken` counts. 403/405/429/999
 * are not broken — they are `unverifiable` in externalVerdict().
 */
export function externalIsBroken(status, error = null) {
  return externalVerdict(status, error) === "broken";
}

/** Internal links must land on 200 (or 204 for a `<link>` target) after ≤ MAX hops. */
export function internalIsBroken(status, hops) {
  if (status === null || status === undefined || status === 0) return true;
  if (hops > MAX_FOLLOW_HOPS) return true; // loop guard — reported as a chain as well
  return !(status === 200 || status === 204);
}

/**
 * Reduce the per-URL records into the report row written to
 * content/reports/link-check.jsonl. Each record:
 *   { url, from, status, final_url, kind, ms, hops, internal, fragment_missing? , error? }
 */
export function summarize(records, { ts = new Date().toISOString(), base, pages = 0, sitemap = null } = {}) {
  const broken = [];
  const unverifiable = [];
  const redirect_chains = [];
  const slow = [];
  for (const r of records) {
    // Gated (auth/dynamic) paths are HEAD-checked once: a 200, a redirect
    // to /auth/login or a 401/403 all prove the route exists.
    let isBroken;
    if (r.gated) isBroken = r.status === null || r.status === undefined || r.status === 0 || r.status === 404 || r.status >= 500;
    else if (r.internal) isBroken = internalIsBroken(r.status, r.hops ?? 0);
    else {
      const verdict = externalVerdict(r.status, r.error ?? null);
      isBroken = verdict === "broken";
      if (verdict === "unverifiable") {
        unverifiable.push({ url: r.url, from: r.from, status: r.status ?? null, kind: r.kind, ...(r.error ? { error: r.error } : {}) });
      }
    }
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
      redirect_chains.push({ url: r.url, from: r.from, hops: r.hops, final_url: r.final_url ?? null, chain: r.chain ?? [], internal: Boolean(r.internal) });
    }
    if ((r.ms ?? 0) > SLOW_MS) slow.push({ url: r.url, ms: r.ms, kind: r.kind });
  }
  broken.sort((a, b) => Number(b.internal) - Number(a.internal) || String(a.url).localeCompare(String(b.url)));
  unverifiable.sort((a, b) => String(a.url).localeCompare(String(b.url)));
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
    unverifiable_count: unverifiable.length,
    unverifiable,
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
  if (s.unverifiable?.length) lines.push(`  unverifiable (bot-blocked / not probed): ${s.unverifiable.length}`);
  if (typeof s.open_count === "number") {
    lines.push(`  open: ${s.open_count}${s.oldest_open_since ? ` (oldest since ${s.oldest_open_since})` : ""} · new ${s.changes?.added?.length ?? 0} · resolved ${s.changes?.resolved?.length ?? 0} · escalated ${s.changes?.escalated?.length ?? 0}`);
  }
  if (s.sitemap) lines.push(`  sitemap: ${s.sitemap.urls} urls · ${s.sitemap.ok} ok · ${s.sitemap.failed} failed`);
  for (const b of s.broken.slice(0, 40)) {
    const why = b.fragment_missing ? `missing #${b.fragment_missing}` : b.error ? b.error : `${b.status}`;
    lines.push(`  ✗ ${b.internal ? "INT" : "EXT"} ${b.url} ← ${b.from} [${b.kind}] ${why}`);
  }
  if (s.broken.length > 40) lines.push(`  … ${s.broken.length - 40} more`);
  for (const c of s.redirect_chains.slice(0, 10)) lines.push(`  ↪ ${c.url} ${c.hops} hops → ${c.final_url} (← ${c.from})`);
  return lines.join("\n");
}

// ─── W1: query-string pages ────────────────────────────────────────────────

const TRACKING_PARAM = /^(utm_[a-z_]+|gclid|fbclid|msclkid|mc_cid|mc_eid)$/i;

/** True when every query parameter is a tracking tag (same page as the bare path). */
export function isTrackingOnlyQuery(search) {
  const params = new URLSearchParams(search ?? "");
  const keys = Array.from(params.keys());
  return keys.length > 0 && keys.every((k) => TRACKING_PARAM.test(k));
}

/**
 * Should a page WITH a query string be parsed for links? (W1: they used to be
 * status-checked only, which hid every link that exists only on a filtered
 * view.) Yes when it is a seed (sitemap / start URL), or when it was linked
 * from a page WITHOUT a query string and its pathname is still under the
 * per-run variant cap — so `/funding/grants?state=ACT` is parsed, but the
 * filter combinations linked from it (`?state=ACT&stage=mvp&…`) are only
 * status-checked. Tracking-only queries (`?utm_source=`) are the bare page.
 */
export function shouldParseQueryPage({ url, from, isSeed = false, variantsSeen = 0, cap = QUERY_VARIANT_CAP }) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (!u.search) return true;
  if (isSeed) return true;
  if (isTrackingOnlyQuery(u.search)) return false;
  let fromSearch = "";
  try {
    fromSearch = new URL(from).search;
  } catch {
    fromSearch = ""; // "(seed)" / "(sitemap)"
  }
  if (fromSearch && !isTrackingOnlyQuery(fromSearch)) return false;
  return variantsSeen < cap;
}

// ─── W1: run-over-run reconciliation ────────────────────────────────────────

function openEntry(b, openSince, nowIso, escalatedAt) {
  return {
    url: b.url,
    from: b.from ?? null,
    status: b.status ?? null,
    kind: b.kind ?? null,
    internal: Boolean(b.internal),
    ...(b.fragment_missing ? { fragment_missing: b.fragment_missing } : {}),
    ...(b.error ? { error: b.error } : {}),
    open_since: openSince,
    last_seen: nowIso,
    escalated_at: escalatedAt ?? null,
  };
}

/**
 * Seed the open set for a report written before W1 (no `open` field): every
 * URL in the newest row's `broken`, with `open_since` = the earliest ts of the
 * unbroken run of history rows (newest → oldest) that also list it.
 * `rows` is the jsonl history, oldest first.
 */
export function seedOpenFromHistory(rows) {
  const list = (rows ?? []).filter((r) => r && typeof r.ts === "string" && Array.isArray(r.broken) && !r.dry_run);
  if (list.length === 0) return [];
  const newest = list[list.length - 1];
  return newest.broken.map((b) => {
    let since = newest.ts;
    for (let i = list.length - 2; i >= 0; i--) {
      if (!list[i].broken.some((x) => x.url === b.url)) break;
      since = list[i].ts;
    }
    return openEntry(b, since, newest.ts, null);
  });
}

/**
 * Reconcile this run's broken list with the previous open set.
 * Returns `{ open, added, resolved, escalated }`:
 *   - `open`      every currently broken URL with `open_since` carried over
 *                 (or now), `last_seen` = now, `escalated_at` carried over;
 *   - `added`     broken now, not open before;
 *   - `resolved`  open before, not broken now (`resolved_at` = now);
 *   - `escalated` open longer than `escalateAfterMs` and never escalated —
 *                 stamped `escalated_at` = now so each link escalates once.
 * Alert only when added / resolved / escalated is non-empty.
 */
export function reconcileOpen(prevOpen, broken, { now = new Date(), escalateAfterMs = ESCALATE_AFTER_MS } = {}) {
  const nowIso = now.toISOString();
  const prev = new Map((prevOpen ?? []).filter((o) => o && o.url).map((o) => [o.url, o]));
  const open = [];
  const added = [];
  const escalated = [];
  const seen = new Set();
  for (const b of broken ?? []) {
    if (!b?.url || seen.has(b.url)) continue;
    seen.add(b.url);
    const p = prev.get(b.url);
    const entry = openEntry(b, p?.open_since ?? nowIso, nowIso, p?.escalated_at ?? null);
    if (!p) added.push(entry);
    else if (!entry.escalated_at) {
      const since = Date.parse(entry.open_since);
      if (Number.isFinite(since) && now.getTime() - since > escalateAfterMs) {
        entry.escalated_at = nowIso;
        escalated.push(entry);
      }
    }
    open.push(entry);
  }
  const resolved = Array.from(prev.values())
    .filter((p) => !seen.has(p.url))
    .map((p) => ({ url: p.url, from: p.from ?? null, open_since: p.open_since ?? null, resolved_at: nowIso }));
  return { open, added, resolved, escalated };
}

/** Earliest `open_since` in an open set (null when empty). */
export function oldestOpenSince(open) {
  let best = null;
  for (const o of open ?? []) {
    if (typeof o.open_since === "string" && (best === null || o.open_since < best)) best = o.open_since;
  }
  return best;
}

/** The alert text for a reconciled run, or null when nothing changed. */
export function formatChangeAlert(summary, { added, resolved, escalated }) {
  if (added.length === 0 && resolved.length === 0 && escalated.length === 0) return null;
  let host = String(summary.base);
  try {
    host = new URL(summary.site ?? summary.base).host;
  } catch {
    /* keep base */
  }
  const why = (b) => (b.fragment_missing ? `#${b.fragment_missing} missing` : b.error ?? b.status);
  const open = summary.open_count ?? summary.broken.length;
  const lines = [`⚠ link-check ${host}: ${open} open (+${added.length} new, −${resolved.length} resolved${escalated.length ? `, ${escalated.length} open > 48 h` : ""})`];
  for (const b of added.slice(0, 10)) lines.push(`• NEW ${b.internal ? "INT" : "EXT"} ${b.url} ← ${b.from} (${why(b)})`);
  if (added.length > 10) lines.push(`  … ${added.length - 10} more new`);
  for (const b of escalated.slice(0, 10)) lines.push(`⏰ OPEN since ${b.open_since}: ${b.url} ← ${b.from} (${why(b)})`);
  for (const r of resolved.slice(0, 5)) lines.push(`✓ resolved ${r.url}`);
  if (resolved.length > 5) lines.push(`  … ${resolved.length - 5} more resolved`);
  return lines.join("\n");
}

/**
 * Report file stem per site: blockid.au keeps `link-check` (history + the
 * /admin/ops tile), any other site gets `link-check-<host>` so a nightly
 * startupvalueindex.com run never overwrites the BlockID state.
 */
export function reportNameFor(siteOrigin) {
  let host = "";
  try {
    host = new URL(siteOrigin).hostname.replace(/^www\./, "");
  } catch {
    host = "";
  }
  if (!host || host === "blockid.au") return "link-check";
  return `link-check-${host.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
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
    reportName: null,
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
    else if (a === "--report-name") out.reportName = String(argv[++i] ?? "").replace(/[^a-z0-9-]+/gi, "-") || null;
  }
  return out;
}
