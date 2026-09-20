# Link check — `scripts/link-check.mjs` (G17-P2B, D7)

Owner: CTO (script), CMO (copy fixes). Spec: `docs/plans/unicorn-homepage-2026-09-19.md` § 2 D7.

Related: `web/scripts/link-check.mjs` (CLI), `web/scripts/lib/link-check-core.mjs` (pure
helpers), `web/scripts/link-check.test.mjs` (fixtures), `web/tests/live-qa/31-marketing.spec.ts`
(the core over the home HTML every live-qa run), `web/scripts/crontab.production` (`# G17-P2B`).

---

## 1. What it does

Plain node, no dependencies, read-only `GET`/`HEAD` traffic with `User-Agent: BlockID-LinkCheck/1.0`,
10 s per request, one pid lock (`/tmp/blockid-link-check.lock`).

1. `GET /robots.txt` — `Disallow` rules are honoured for *crawling*; a disallowed page that is
   linked is still status-checked. With `--include-sitemap`, `/sitemap.xml` (+ nested sitemaps) is
   read and every `<loc>` becomes a seed.
2. BFS from `/` over same-origin HTML pages, at most `--max` (default 400). A URL with a query
   string is status-checked but **never parsed for links** unless it is a seed — the funding
   directory filters (`?state=&stage=&industry=`) otherwise combine into thousands of "pages".
3. Every `<a href>`, `<link href>` (stylesheet / canonical / alternate / icon), `<img src>` (+ first
   `srcset` candidate), `<source src>`, `<script src>`:
   - **internal** → `GET`, redirects followed by hand (≤ 5 hops; more than 2 is reported as a
     `redirect_chain`), final status must be 200; `#fragment` targets are verified against the
     `id`/`name` attributes of the crawled page;
   - **gated prefixes** `/api/ /workspace/ /dashboard/ /admin/ /auth/ /s/ /apply/` → `HEAD` once;
     only a 404, 5xx or network failure counts (a 307 to `/auth/login` or a 401 proves the route);
   - **external** → `HEAD`, `GET` retry on 404/405/5xx; only 404/410/5xx/DNS failure counts —
     403/405/429/999 from bot-blocking hosts are tolerated;
   - `mailto:`/`tel:`/`javascript:`/`data:` and Cloudflare-injected `/cdn-cgi/*` paths are dropped.
4. Writes one row per run to `web/content/reports/link-check.jsonl` and the same object to
   `link-check-latest.json`:

   ```json
   { "ts": "…", "base": "https://blockid.au", "site": "https://blockid.au", "pages": 526, "links": 1641,
     "internal": 1240, "external": 401, "broken_internal": 0, "broken_external": 3,
     "broken": [{ "url", "from", "status", "final_url", "kind", "internal", "fragment_missing?", "error?" }],
     "redirect_chains": [{ "url", "from", "hops", "final_url", "chain" }],
     "slow": [{ "url", "ms", "kind" }],
     "sitemap": { "urls": 458, "ok": 458, "failed": 0 }, "gated_checked": 68,
     "max_pages_hit": false, "duration_ms": 72851, "dry_run": false }
   ```

5. Telegram (e-mail fallback, `scripts/lib/ops-env.mjs` `sendTelegram`) when `broken > 0`.
6. Exit `1` when `broken > 0` (unless `--dry-run`), `2` on a crash or when another run holds the lock.

## 2. Usage

```sh
cd web
node scripts/link-check.mjs --base https://blockid.au --include-sitemap --max 1500   # the cron
node scripts/link-check.mjs --base https://blockid.au --dry-run --no-alert --json    # read-only, print only
node scripts/link-check.mjs --base http://127.0.0.1:4099 --no-external --no-alert --dry-run --max 600
                                                                                      # the deploy's temp port
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

## 3. Deploy hook (gate 8 — wired into `scripts/deploy-live.sh` next to the e2e smoke tier, `97a2ad910`, 2026-09-19)

```sh
# G17-P2B — internal links on the temp release (read-only; externals skipped, alerts off).
if [ "$DEPLOY_LINK_CHECK" != "0" ]; then
  echo "  ▶ Link check (internal) against :$TEMP_PORT ..."
  if (cd "$WEB_DIR" && node scripts/link-check.mjs --base "http://127.0.0.1:$TEMP_PORT" \
       --max 600 --concurrency 8 --no-external --no-alert --out-dir /tmp/blockid-deploy-link-check \
       > /tmp/blockid-deploy-link-check.log 2>&1); then
    echo "  ✅ link check passed ($(grep -oE '[0-9]+ pages' /tmp/blockid-deploy-link-check.log | head -1))"
  else
    echo "  ❌ link check found broken internal links — /tmp/blockid-deploy-link-check.log"
    grep -E '^\s+✗' /tmp/blockid-deploy-link-check.log | head -12 | sed 's/^/     /'
    SMOKE_FAIL=$((SMOKE_FAIL + 1))
  fi
fi
```

`--out-dir /tmp/…` keeps the temp-port run out of `content/reports/` (that file is the
production history). `DEPLOY_LINK_CHECK=0` skips it for an emergency deploy.

## 4. Cron

`web/scripts/crontab.production` `# G17-P2B`: daily 03:40 UTC, `--include-sitemap --max 1500`,
log `/data/logs/blockid-link-check.log`. Install with `crontab scripts/crontab.production`
(see `docs/ops/crontab-setup.md`).

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
- **External timeout / 403 / 429 / 999** — not reported; the host blocks bots or is slow.
- **`max_pages_hit: true`** — raise `--max` or check whether a new page family generates
  unbounded URLs (the crawl profile of 2026-09-19 is in the commit message of `ec7aa72e0`).

## 6. History

- 2026-09-19 first production sweep (pre-Phase-1 deploy): 400 pages (cap), 1,466 links, 9 broken
  internal (5 retired footer anchors, 2 P2-A page hrefs, 2 Cloudflare email-protection artefacts),
  9 broken external. After the Phase 1 deploy + the query-string guard: 526 pages, 1,641 links,
  2 broken internal (both in `(marketing)` page files, handed to P2-A), 14 external → 13 fixed in
  source (deploy + re-seed pending), 1 needs a migration (ACS Digital Pulse URL).
