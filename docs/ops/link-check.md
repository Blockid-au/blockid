# Link check — `scripts/link-check.mjs` (G17-P2B, D7)

Owner: CTO (script), CMO (copy fixes). Spec: `docs/plans/unicorn-homepage-2026-09-19.md` § 2 D7;
W1 upgrade (2026-10-20): `docs/pricing-v5-plan.md` § 5.

Related: `web/scripts/link-check.mjs` (CLI), `web/scripts/lib/link-check-core.mjs` (pure
helpers), `web/scripts/link-check.test.mjs` (fixtures), `web/tests/live-qa/31-marketing.spec.ts`
(the core over the home HTML every live-qa run), `web/scripts/crontab.production` (`# G17-P2B`),
`web/scripts/route-scan.mjs` (static href → route scan, § 7), `web/scripts/funding-link-health.mjs`
(weekly grant/programme `official_url` job, § 8), `/admin/ops` "Link health" tile.

---

## 1. What it does

Plain node, no dependencies, read-only `GET`/`HEAD` traffic with `User-Agent: BlockID-LinkCheck/1.0`,
10 s per request, one pid lock (`/tmp/blockid-link-check.lock`).

1. `GET /robots.txt` — `Disallow` rules are honoured for *crawling*; a disallowed page that is
   linked is still status-checked. With `--include-sitemap`, `/sitemap.xml` (+ nested sitemaps) is
   read and every `<loc>` becomes a seed.
2. BFS from `/` over same-origin HTML pages, at most `--max` (default 400). A URL with a query
   string is parsed **one level deep** (W1): seeds, and query pages linked from a query-less page
   (≤ 25 variants per pathname); the filter combinations linked from a query page are only
   status-checked — the funding directory filters (`?state=&stage=&industry=`) otherwise combine
   into thousands of "pages". Tracking-only queries (`?utm_*`, `gclid`, `fbclid`) are the bare page.
   `Sitemap:` lines in robots.txt are read too (`--include-sitemap`).
3. Every `<a href>`, `<link href>` (stylesheet / canonical / alternate (`link:hreflang` when it
   carries `hreflang`) / icon), `<img src>` (+ first `srcset` candidate), `<source src>`,
   `<script src>`, `<meta property="og:image|og:url">` / `<meta name="twitter:image">` and every
   URL property inside `<script type="application/ld+json">` (`url`, BreadcrumbList `item`,
   `logo`, `image`, `sameAs`, `mainEntityOfPage` …; `@id` and `{template}` URLs are not links):
   - **internal** → `GET`, redirects followed by hand (≤ 5 hops; more than 2 is reported as a
     `redirect_chain`; a loop or > 5 hops is broken), final status must be 200; `#fragment`
     targets of `<a>` are verified against the `id`/`name` attributes of the crawled page;
   - **gated prefixes** `/api/ /workspace/ /dashboard/ /admin/ /auth/ /s/ /apply/` → `HEAD` once;
     only a 404, 5xx or network failure counts (a 307 to `/auth/login` or a 401 proves the route);
   - **external** → `HEAD`, then `GET` when HEAD is refused/inconclusive, redirects followed by
     hand with the private-host guard on every hop. **broken** = 404/410, 5xx, DNS/connection
     failure, timeout, redirect loop, > 5 hops. **unverifiable** = 401/403/405/429/451/999 (bot
     walls) — recorded in `unverifiable[]`, never alerted, never dropped. External chains > 2 hops
     are listed in `redirect_chains` (`internal: false`) but do not fail the exit code;
   - `mailto:`/`tel:`/`javascript:`/`data:` and Cloudflare-injected `/cdn-cgi/*` paths are dropped.
4. Writes one row per run to `web/content/reports/link-check.jsonl` and the same object to
   `link-check-latest.json` (any other site: `link-check-<host>.jsonl` /
   `link-check-<host>-latest.json`, own lock `/tmp/blockid-link-check-<host>.lock`; `--report-name`
   overrides). W1 adds the run-over-run **open set**: `open[]` (`url, from, status, kind,
   internal, open_since, last_seen, escalated_at`), `open_count`, `oldest_open_since`,
   `escalated_open`, `changes: {added, resolved, escalated}`, `unverifiable_count`,
   `unverifiable[]`. A report written before W1 is seeded from the jsonl history (`open_since` =
   the first of the consecutive runs that listed the URL).

   ```json
   { "ts": "…", "base": "https://blockid.au", "site": "https://blockid.au", "pages": 526, "links": 1641,
     "internal": 1240, "external": 401, "broken_internal": 0, "broken_external": 3,
     "broken": [{ "url", "from", "status", "final_url", "kind", "internal", "fragment_missing?", "error?" }],
     "redirect_chains": [{ "url", "from", "hops", "final_url", "chain" }],
     "slow": [{ "url", "ms", "kind" }],
     "sitemap": { "urls": 458, "ok": 458, "failed": 0 }, "gated_checked": 68,
     "max_pages_hit": false, "duration_ms": 72851, "dry_run": false }
   ```

5. Telegram (e-mail fallback, `scripts/lib/ops-env.mjs` `sendTelegram`) **only when the broken set
   changes** (a new broken URL, or a resolved one) or a URL has been open > 48 h — that escalation
   fires once per URL (`escalated_at`). An unchanged set logs `alert: skipped — broken set
   unchanged` (W1: 342 ops e-mails in 22 days were mostly repeats, L1-12).
6. Exit `1` when `broken > 0` or an internal redirect chain > 2 hops exists (unless `--dry-run`),
   `2` on a crash or when another run holds the lock.
7. `/admin/ops` → "Link health" tile (and `linkHealth` in `/api/admin/ops`): open count, oldest
   `open_since`, escalated, unverifiable and the three oldest open URLs per site.

## 2. Usage

```sh
cd web
node scripts/link-check.mjs --base https://blockid.au --include-sitemap --max 1500   # the cron
node scripts/link-check.mjs --base https://blockid.au --dry-run --no-alert --json    # read-only, print only
node scripts/link-check.mjs --base http://127.0.0.1:4099 --include-sitemap --no-external --no-alert --dry-run --max 800
                                                                                      # the deploy's temp port
node scripts/link-check.mjs --base https://startupvalueindex.com --include-sitemap --max 300
                                                       # SVI → link-check-startupvalueindex-com{.jsonl,-latest.json}
```

| Flag | Default | Meaning |
| --- | --- | --- |
| `--base <origin>` | `https://blockid.au` | what is fetched (production or the deploy's temp port) |
| `--site <origin>` | inferred | canonical origin; a `127.0.0.1`/`localhost` base infers `https://blockid.au` so canonical links and sitemap `<loc>`s inside the temp release are rewritten to the base and checked there |
| `--max <n>` | 400 | pages parsed for links (status checks are unbounded) |
| `--concurrency <n>` | 6 | in-flight requests |
| `--timeout <ms>` | 10000 | per request |
| `--include-sitemap` | off | seed from `/sitemap.xml`; adds `sitemap: {urls, ok, failed}` — `ok` means 200 on the first hop |
| `--no-external` | off | skip external hosts (deploy hook) |
| `--json` | off | machine-readable summary on stdout |
| `--dry-run` | off | write nothing, send nothing, exit 0 |
| `--no-alert` | off | write the report, skip Telegram |
| `--out-dir <dir>` | `content/reports` | where the report files go |
| `--report-name <stem>` | per site | report file stem (default `link-check` for blockid.au, `link-check-<host>` otherwise) |

## 3. Deploy hook (gate 8 — `scripts/deploy-live.sh`, next to the e2e smoke tier)

`node scripts/link-check.mjs --base "http://127.0.0.1:$TEMP_PORT" --include-sitemap --max 800
--concurrency 8 --no-external --no-alert --out-dir /tmp/blockid-deploy-link-check` — any broken
internal link or internal chain fails the gate. W1 (2026-10-20): `--include-sitemap` seeds every
sitemap URL (the nine `/funding/grants?state=*` 404s shipped because only pages reachable from `/`
were crawled), and the gate **runs even with `G30_DEFER_EXTENDED_REVIEW=1`** — the 22/09 deferral
covered the broad crawl for speed; the founder-approved W1 plan supersedes it for this gate
(gate 11's hydrated/contrast suite stays deferrable). `--out-dir /tmp/…` keeps the temp-port run
out of `content/reports/` (that file is the production history). `DEPLOY_LINK_CHECK=0` skips it for
an emergency deploy.

## 4. Cron

`web/scripts/crontab.production` `# G17-P2B`: daily 03:40 UTC, `--include-sitemap --max 1500`,
log `/data/logs/blockid-link-check.log`. Install with `crontab scripts/crontab.production`
(see `docs/ops/crontab-setup.md`).

W1 lines for the lead to add (not yet in `crontab.production`):

```cron
# W1 — nightly startupvalueindex.com link check (own report + lock, change-only alerts)
55 3 * * * cd /home/dovanlong/blockid.au/web && node scripts/link-check.mjs --base https://startupvalueindex.com --include-sitemap --max 300 >> /data/logs/blockid-link-check-svi.log 2>&1
# W1 — weekly official_url health for au_grants / au_programs (Sunday 06:30 UTC: after the 04:00 refresh-funding-sources, clear of the 05:10 live-qa canary and 06:00 chain-reconcile)
30 6 * * 0 cd /home/dovanlong/blockid.au/web && node scripts/funding-link-health.mjs >> /data/logs/blockid-funding-link-health.log 2>&1
```

## 5. Triage

- **Internal 404** — the href is wrong or the page moved. Fix the href where it lives (a page,
  `components/marketing/footer-columns.ts`, an i18n message, `content/*.json`) or, for a retired
  path with inbound links, add a row to `src/lib/nav/legacy-redirects.ts` (its test refuses a row
  whose source still has a page).
- **`fragment_missing`** — the page exists but has no element with that `id`. Add the id to the
  target section or drop the fragment.
- **`redirect_chains`** — a link to a redirect that redirects again; link the final URL.
- **External 404 / ENOTFOUND** — find the source (`grep -rn <host> src content`), verify the new
  URL by hand (`HEAD` it), replace. Program/grant `official_url` values live in
  `content/data/*.seed.json` **and** the `au_programs` / `au_grants` tables — re-run
  `node scripts/seed-au-funding.mjs` after editing. The `external_sources` catalogue
  (`src/lib/signals/external-sources.ts`) is pinned to migration 0410; a URL change there needs a
  new migration.
- **External 403 / 429 / 999 (`unverifiable`)** — recorded, not alerted; the host blocks bots.
  Check by hand in a browser when a URL stays unverifiable for weeks.
- **External timeout / redirect loop / > 5 hops** — broken. A host that loops only on `HEAD`
  (login walls) passes on the `GET` retry.
- **`max_pages_hit: true`** — raise `--max` or check whether a new page family generates
  unbounded URLs (the crawl profile of 2026-09-19 is in the commit message of `ec7aa72e0`).

## 6. History

- 2026-09-19 first production sweep (pre-Phase-1 deploy): 400 pages (cap), 1,466 links, 9 broken
  internal (5 retired footer anchors, 2 P2-A page hrefs, 2 Cloudflare email-protection artefacts),
  9 broken external. After the Phase 1 deploy + the query-string guard: 526 pages, 1,641 links,
  2 broken internal (both in `(marketing)` page files, handed to P2-A), 14 external → 13 fixed in
  source (deploy + re-seed pending), 1 needs a migration (ACS Digital Pulse URL).
- 2026-10-20 W1: crawl + static scan found `/og/pricing.png` (vi/pricing og/twitter image),
  `/vi/solutions` (JSON-LD breadcrumb), bare `/checkout/review` (canonical/hreflang/og:url),
  e-mail/tour/API hrefs `/workspace/legal`, `/innovator/theses|pipeline|reports`, `/credits`,
  `/wholesale/verify`, `/share/request`, `/api/insights/generate`, plus seed URLs (Boosting Female
  Founders, enterprize.space ×2, AWS Activate 3 hops, NSW MVP Ventures 3 hops) — all fixed in
  source; Capital Angels (503) marked `status_confidence: low`.

## 7. Static route scan — `scripts/route-scan.mjs` (W1)

The crawler cannot see e-mail templates, client-only tour state or JSON API bodies.
`scripts/route-scan.test.mjs` (in `npm test`) scans every literal internal href in `web/src` —
JSX `href`, `router.push/replace/prefetch`, `redirect`/`permanentRedirect`,
`NextResponse.redirect(new URL(…))`, and `href|ctaHref|backHref|link|url|path` object fields —
and fails unless each resolves to an app route (route groups / `@slots` transparent, `_private`
excluded, `[x]` / `[...x]` / `[[...x]]`, metadata routes), a `public/` file, or a live redirect
source (`LEGACY_REDIRECTS` + `next.config.ts` `redirects()`). Template interpolations match any
segment. `node scripts/route-scan.mjs` prints the unresolved list. Deliberate exceptions go in
`ALLOWED_UNROUTED` with a reason (today: Cloudflare's `/cdn-cgi/l/email-protection`).

## 8. Grant / programme `official_url` health — `scripts/funding-link-health.mjs` (W1)

Weekly, read-only by default. Reads `au_grants` + `au_programs` (or `--source seed`), checks every
`official_url` politely (one request at a time per host, 1.5 s apart, ≤ 4 hosts in flight, HEAD
then GET, browser UA as in `verify-funding-urls.mjs`), keeps `first_failed_at` week to week in
`content/reports/funding-link-health-latest.json` (a 403/429 week neither starts nor clears the
clock) and writes `proposed_sql`. Exit 1 when a row has been broken ≥ 7 days.

`--apply` (lead only, DB creds): `status_confidence = 'low'` for rows broken ≥ 7 days (the existing
needs-review lever) + one `unreachable` line each in `grants-review-queue.jsonl` (/admin/funding).
There is **no link-status column**, so programmes are not hidden yet: the proposed additive
migration is `web/supabase/pending-authority/0475_funding_link_status.sql` (NOT applied); once it
exists `--apply` also writes `link_status / link_checked_at / link_broken_since` and the directory
loaders can hide `broken` > 7 d rows. Redirected URLs are only proposed (commented SQL — verify by
hand). Never deletes, never changes `status` or `official_url`.
