> **Disposition (2026-09-13, S31-C):** the box is CPU-bound on ONE Node process that renders every page per request (root layout reads `headers()` for the CSP nonce → nothing is cached at Cloudflare, nginx or Next). Measured ceiling ≈ 50 public-page renders/s at the origin, ~40 rps end-to-end through Cloudflare with p95 ≈ 550 ms at 20 concurrent, 0 errors. For a trial wave the first things that break are (1) shared-IP rate-limit lockouts — fixed in this pass, (2) nginx's default 60 s `proxy_read_timeout` on 60–180 s AI report routes — proposal below, (3) the single-process render CPU. DB is nowhere near a limit (90 MB, 49/100 connections, hottest query now cached).

# S31-C capacity + resilience audit — trial wave on the single box

Scope: live box read-only (`ps`, `nginx -T`, `pg_stat_*`, `crontab`, `content/reports`), modest read-only load test (20 concurrent × 60 s on public pages via Cloudflare; 10 × 20 s at the origin), code read of `proxy.ts`, `lib/rate-limit.ts`, `lib/security/auth-rate-limit.ts`, auth routes, `startup-index-*`, `deploy-live.sh`, `cron-runner.sh`. Commits (worktree, not pushed): `af7f623b5` rate-limit keying, `3bdbecf06` migration 0388, `9f3182a37` Startup Index data cache. tsc + eslint clean, 262 + 191 tests green, truncation guard clean.

## 1. Process model

| Item | Value |
|---|---|
| Host | 8 vCPU, 50 GB RAM, 0 swap, 43 d uptime, load avg 0.7–1.2 idle |
| Live server | `next-server (v16.2.3)` pid 564163, `PORT=4001`, cwd `/data/releases/hUwm8POaA30dP4Y3r3JtR`, **one process, 11 threads**, RSS 485 MB idle → 1.2 GB peak under the load test (GC sawtooth) |
| Launch | `nohup node server.js` from `deploy-live.sh` — no PM2, no systemd, no cluster mode; `watchdog.sh` (*/2 min) + `uptime-24x7-guardian.sh` restart it if it dies |
| Node | v22.23.2, no `NODE_OPTIONS` → default heap limit 4,144 MB (build uses 8 GB) |
| AI calls | in-process `https.request` with keep-alive agents (`maxSockets: 128`), global cap `AI_MAX_CONCURRENT` = 120, per-provider RPM caps; `ai-worker.mjs` spawn is the fallback transport only |
| PDF/DOCX | `@react-pdf/renderer` in-process on 7 API routes (CPU-bound, 1–3 s each) |
| Stale processes | two orphan `next-server` processes with `cwd (deleted)`: pid 851857 (`PORT=4011`, 275 MB, 3.4 d) and pid 2940856 (`PORT=4321`, 140 MB, 29 d). Not the live server; ~415 MB RSS for nothing |

**Concurrency ceiling in practice.** SSR is single-threaded. A cold single `GET /` at the origin costs 23 ms wall; at 10 concurrent the origin serves 50.5 rps with p50 190 ms (Little's law: the process is saturated — every extra client only adds queueing). That is the number to plan around: **~50 public page renders per second, ~1 core**. Everything else (7 cores) sits idle because there is no cluster/second process.

## 2. nginx (system nginx, `/etc/nginx/sites-enabled/blockid-live`)

| Directive | blockid.au server block | Effect |
|---|---|---|
| `worker_processes auto` / `worker_connections 768` | global | 8 × 768 = 6,144 connections — fine |
| `proxy_read_timeout` | **not set → default 60 s** | any non-streamed request > 60 s → **504** (`/api/svi/full-report` runs `callAI` with `timeoutMs: 180_000`; 42 routes `maxDuration = 60`, 15 × 120, 24 × 300). Access log tail: 29 × 504 (mostly `/`, `/funding/grants` during deploy swaps, plus `/api/cron/ai-health`, `sector-multiples-refresh`) |
| `proxy_buffering` | default (on) | SSE routes (`/api/rnd`, `/api/svi/dimensions/stream`, `/api/site-crawl/stream`) are buffered by nginx unless the app sends `X-Accel-Buffering: no` — check before relying on streaming to beat the 60 s wall |
| `proxy_cache` / `limit_req` / `limit_conn` | none | no origin-side HTML cache, no L7 rate limit; all limiting is in-process (`lib/rate-limit.ts` MemoryStore) |
| `gzip on` but `gzip_types` commented | global | only `text/html` is gzipped by nginx; Next `compress: true` gzips its own responses, so RSC/JSON still compress — no brotli anywhere (Cloudflare re-compresses at the edge, so low impact) |
| `keepalive` upstream | none; `Connection "upgrade"` is hard-coded on every request | every proxied request opens a new TCP connection to :4001 (localhost — cheap, but it is why nginx→Next adds ~1 ms/req) |
| `set_real_ip_from` / `real_ip_header CF-Connecting-IP` | none | `X-Real-IP` = Cloudflare edge IP. Harmless today because the app reads `cf-connecting-ip` first, but nginx logs show edge IPs |
| `client_max_body_size` | default 1 M on blockid.au (50 M only on `upload.blockid.au`) | ok — uploads go to the upload host |
| `http2` | not on the blockid.au listener (Cloudflare terminates h2/h3 to the visitor) | fine |

Note the process list shows 8 `nginx: worker` entries at 130 MB each — those are **Kong/OpenResty** (Supabase gateway), not system nginx.

## 3. Cloudflare + app cache headers

`curl -I` via Cloudflare (2026-09-13 23:0x UTC):

| Path | `cache-control` | `cf-cache-status` |
|---|---|---|
| `/` | `private, no-cache, no-store, max-age=0, must-revalidate` | DYNAMIC |
| `/pricing` | same | DYNAMIC |
| `/funding/grants` | same | DYNAMIC |
| `/startup-index` | same | DYNAMIC |
| `/api/status` | `s-maxage=30, stale-while-revalidate=60` | DYNAMIC (Cloudflare does not cache API JSON by default) |

Root cause: `src/app/layout.tsx:132-135` calls `headers()` (CSP nonce + locale) → **every route is dynamic; every `export const revalidate = N` is inert** (already noted in `lib/funding/data.ts:11-16`, which is why the funding catalogue caches at the data layer instead). 30+ public pages also declare `force-dynamic` on top (`(marketing)/page.tsx`, `startup-index/*`, `dataset`, `showcase/*`, `changelog`, `roadmap`, `team`, `tokenize`, `legal/[doc]`, …) — pointless but harmless while the layout is what it is. `(marketing)/page.tsx:145-148` reads `cookies()` via `readSignedInHint()` and then discards the result (`void isSignedIn`). `pricing/page.tsx:18-19` comment claims a Supabase read that no longer exists; the page is dynamic only because of `searchParams`.

`next.config.ts`: `output: "standalone"`, `compress: true`, image headers 30 d, `/api/auth/*` `no-store`; no `cacheHandler`, no `staleTimes`, no page-level `Cache-Control`.

**Done in this pass:** the Startup Index reads (`/startup-index`, `/startup-index/listings`, `/api/index/headlines`, `/api/index/listings`) now go through `unstable_cache` for 300 s (`lib/startup-index-cache.ts`) — the effective version of the `revalidate = 300` they declared. The per-ticker page already had its own 10-minute wrapper.

**Not done (needs a design decision):** making public HTML cacheable requires moving the nonce out of the root layout (per-request nonce ⇒ per-request HTML) — either a hash-based CSP for the inline theme/consent scripts, or an nginx 5–10 s micro-cache for anonymous requests (which reuses one nonce across everyone for that window — CSP nonce reuse is a real weakening, so only with `proxy_cache_bypass $cookie_blockid_session` and a short TTL). Proposal snippet in §10.

## 4. Database (self-hosted Supabase, `supabase-db`)

| Item | Value |
|---|---|
| `max_connections` / in use | 100 / 49 (2 active, 39 idle; PostgREST 10, supavisor 7, realtime 7, admin 16) |
| App access path | supabase-js → Kong → **PostgREST** (`PGRST_DB_POOL` unset → default **10** connections). No direct `pg` pool in `src/` — so the whole app has 10 DB slots |
| Memory config | `shared_buffers` **128 MB**, `effective_cache_size` **128 MB**, `work_mem` 4 MB — container defaults on a 50 GB box. DB is 90 MB so it fits in shared_buffers today; `effective_cache_size` = 128 MB makes the planner under-value index scans as tables grow |
| `pg_stat_statements` | enabled, reset 2026-08-01 |
| Sizes | app_users 88 rows / 408 kB; projects 15; svi_accounts 74; credit_transactions 340; usage_logs 42; audit_events 2,600 / 2.7 MB; svi_analyses 182 / 2.7 MB (TOASTed JSON); svi_snapshots 3,302 / 41 MB |

Top queries by total time (`pg_stat_statements`, dbid=postgres, 44 days):

| mean ms | calls | total s | query |
|---|---|---|---|
| **51.4** | **45,046** | **2,316** | `svi_analyses … WHERE created_at >= $1 ORDER BY created_at DESC LIMIT 5000` (startup-index headlines/listings/API, no cache) → **now cached 300 s** |
| 109.9 | 4,324 | 475 | PostgREST schema-cache reload (`NOTIFY pgrst`) — fine |
| 0.21 | 436,264 | 93 | PostgREST `set_config` preamble — per request, fine |
| 2,942 | 6 | 17.7 | `COPY svi_snapshots` (backups) |
| 102 | 49 | 5 | `erase_account()` |

Plan for the hot query: seq scan over 182 rows, 0.29 ms execution — the 51 ms mean is JSON aggregation of `analysis_json` (~15 kB/row) and transport, which no index fixes; the cache does. Index gaps on the trial path: **`svi_analyses` has only its PK** while the code filters it 51× by `email`, 21× by `project_id`, 30× by `created_at >=` and orders 47× by `created_at` → migration **0388** (three plain `CREATE INDEX IF NOT EXISTS`; dry-run in a rolled-back transaction: 12 + 3 + 3 ms). All other hot tables (`app_users`, `projects`, `project_members`, `credit_transactions`, `usage_logs`, `svi_snapshots`, `evaluations`) already have the (owner, created_at DESC) shape indexes. 0389 not needed.

### `audit_events` hash-chain cost (EXPLAIN ANALYZE, rolled back)

```
Insert on audit_events  (actual time=4.665..4.665 rows=0 loops=1)
  Buffers: shared hit=559 read=1 dirtied=10
Trigger audit_events_hash_chain_trg: time=3.766 calls=1
Execution Time: 4.743 ms          -- first call, includes plpgsql compile
50-row INSERT … generate_series in one txn: 12.6 ms  → ~0.25 ms/row warm
```

The trigger takes `pg_advisory_xact_lock(hashtext('audit_events_hash_chain'))` then `SELECT curr_hash … ORDER BY id DESC LIMIT 1` (index-only on the PK) and a sha256. Because PostgREST inserts are single-statement autocommit transactions the lock is held for ≈ the statement (0.3–5 ms), so the serialisation ceiling is **~200–1,000 audited writes/s** — two orders of magnitude above anything a trial wave produces (every mutating API call = 1 audit row; 100 active users × 1 write/10 s = 10/s). Not a bottleneck; it will become one only if a long transaction ever wraps an audit insert (the lock is transaction-scoped).

## 5. Rate limits / abuse (fixed — commit `af7f623b5`)

| Layer | Before | Problem for a shared IP (office, campus, CGNAT) | After |
|---|---|---|---|
| proxy `clientIdentity()` | keyed on `sb-access-token` / `sb:token` cookies — **never set by this app** (session cookie is `blockid_session`) → every signed-in user keyed by **IP** | one office shared one `svi` bucket (20/min per path): `/api/svi/phase-progress` is fetched on every workspace page load (1×; `/dashboard` 2×) → 429 at ~20 page loads/min/office, which is the "~100 page loads/user" symptom | keyed on `sha256(blockid_session)[0..16]` per session; IP only for anonymous |
| proxy `auth-register` | 5/min per IP | 6th sign-up in a minute from a classroom → 429 | 30/min per IP |
| proxy `auth-login` | 8/min per IP | 9th login/min per campus → 429 | 40/min per IP |
| proxy `auth-password-reset` | 3/min per IP | | 10/min per IP |
| route `/api/auth/register` | per-IP ceiling 20/15 min + per-(IP, email-hash) 5/15 min | 21st sign-up/15 min per campus → 429 | ceiling 60/15 min; identity bucket unchanged (5) |
| route `/api/auth/login-password` | ceiling 30/15 min + 5 per (IP, email) | | ceiling 120/15 min; identity 5 |
| route `/api/auth/register-with-card` (**the trial path**) | single `register-with-card:<ip>` **5/15 min** | 6th trial sign-up from one egress → `rate_limited` | two-bucket shape like `/register`: 60/15 min per IP before body parse, 5/15 min per (IP, email) after |

Brute-force posture is unchanged: the tight bucket is still 5 attempts per (IP, email) per 15 min on every auth kind; the per-IP numbers only bound scripted floods. Tests: proxy session keying (token never in key, distinct per session, stable), bucket ceilings (31st register/min refused), register-with-card gate order + 429 shape.

Still per-IP and worth knowing: `/api/auth/reset-password` route keys `reset:<first XFF hop>` 3/15 min (client-controlled hop — S8-C rule); `data-room-token` 30/min, `lead` 10/10 min, `upload` 10/min per IP — all anonymous surfaces, acceptable. In-process `MemoryStore` means limits reset on every deploy and are per-process (no Redis) — fine for one box.

## 6. Load test (read-only, public pages, 2026-09-13 23:06 UTC)

Via Cloudflare, **20 concurrent, 60 s**, `cache-control: no-cache`, 4 paths round-robin:

| path | reqs | rps | p50 ms | p95 ms | p99 ms | max | errors | avg KB |
|---|---|---|---|---|---|---|---|---|
| `/` | 603 | 10.0 | 449 | 554 | 644 | 776 | 0 | 240 |
| `/pricing` | 604 | 10.0 | 404 | 526 | 609 | 788 | 0 | 163 |
| `/funding/grants` | 603 | 10.0 | 409 | 553 | 645 | 746 | 0 | 200 |
| `/api/status` | 601 | 10.0 | 693 | 853 | 944 | 1,267 | 0 | 0.3 |
| **total** | **2,411** | **40.0** | | | | | **0** | |

Box during the run: load avg 1.7 → 2.3 (of 8), live-server RSS 620 MB → 1.22 GB peak, no 5xx, no cron misfire. `/api/status` is the slowest path (243 ms single-request at the origin — it polls DB + AI health; it is being reworked by another agent).

Origin direct (`127.0.0.1:4001`, **10 concurrent, 20 s**, 3 HTML paths):

| path | reqs | rps | p50 | p95 | p99 | max |
|---|---|---|---|---|---|---|
| `/` | 340 | 16.9 | 194 | 253 | 282 | 336 |
| `/pricing` | 339 | 16.8 | 186 | 245 | 275 | 384 |
| `/funding/grants` | 339 | 16.8 | 192 | 252 | 279 | 281 |
| **total** | **1,018** | **50.5** | | | | |

Single cold request at the origin: `/` 23 ms, `/api/status` 243 ms. So ≈ 20–25 ms of render CPU per public page, and the process saturates at ≈ 50 renders/s. Cloudflare adds ~200–250 ms per request (edge `cf-ray …-ORD`, no caching — every request is a full origin round trip).

Authenticated journey timing: skipped (needs an account; `npm run qa:live` covers it post-deploy).

## 7. Crons vs users

`crontab -l` = **96 active lines**, **0 use `nice`/`ionice`**. 17 jobs run every hour or faster: `uptime-watcher.sh` + `reseller-monitor.sh` every minute; `watchdog.sh`, `report-order-drain`, `uptime-24x7-guardian.sh` every 2 min; `webhook-dispatch` */5; `agent-guardian` */10; `blockchain-sync`, `lifecycle-mailer` */15; `ai-health-check`, `funding-report-retry`, `ai-token-guardian.sh` */30; `evaluation-batch-runner` */20 12–20 UTC.

`cron-runner.sh` just `curl`s `http://127.0.0.1:4001/api/cron/<job>` — **the cron work runs inside the same single Next process, on the same event loop, the same PostgREST pool and the same AI semaphore as users.** `nice` on the shell would therefore not help for these; it only matters for the external scripts (`db-restore-test.sh`, `weekly-disk-cleanup.sh`, `clean-disk.sh`, `audit-migrations.mjs`, `db-backup.sh`).

Last 7 days from `cron-health.jsonl`: total cron-runner busy time 3,886 s → **0.6 % average**, so crons are not a steady-state competitor. The peaks are: `agent-orchestrator` 96 s avg / 241 s max, `agent-auto-improve` 89 s, `daily-admin-report` 73 s, `agent-healthcheck` 130 s, `ai-health-check` 16 s avg every 30 min (50 runs), `webhook-dispatch` 300 runs / 1.4 s avg. Densest windows: **03:00–04:59 UTC daily** (20 jobs: account-erasure, audit-chain-verify, nightly-clevel-review, reseller-* ×6, …) and **Sunday 03:00–07:00** (13 more: restore-test, verify-models, discover-models ×2, refresh-funding-sources, money-radar-sweep, chain-reconcile, live QA at 07:00 with `LIVE_QA_ALLOW_DB=1`). 03:00–05:00 UTC = 13:00–15:00 AEST — **that is the middle of the Australian working day**, i.e. the trial wave's peak hour. Recommendation in §10 (re-time to 14:00–17:00 UTC = 00:00–03:00 AEST, and use the `priority` flag the AI agent is adding so any cron AI call yields the semaphore to a user report).

## 8. Backups + rollback readiness

| Item | Status |
|---|---|
| `db-backup.sh` | daily 02:20 UTC → `/data/backups/db-20260913T022001Z.dump.gz` (16.9 MB, sha256 alongside, `weekly/` subdir) |
| Offsite (`db-backup-offsite.mjs` 02:40) | **FAIL** every day: "Service account has no Drive quota — founder action: run `scripts/db-backup-offsite-auth.mjs` once" → backups exist only on this box |
| Restore test (`db-restore-test.sh`, Sunday 03:00) | **ok 2026-09-13 03:00:13** — restored into `blockid_restore_test` in 12.0 s, `pg_restore_errors: 0`, row counts match prod (app_users 67, projects 15, plans 15) |
| `deploy-live.sh --rollback` | present; `.next-current → releases/hUwm8POaA30dP4Y3r3JtR`, `.next-previous → /data/releases/PxCoMaAKB6gBbrfj2L0oI` with `server.js` present; 6 releases retained; post-swap auto-rollback on Gate 12 failure |
| Deploy log | last two deploys 2026-09-13 20:22 and 21:19 UTC: 12/12 gates, swapped, no rollback |

## 9. Capacity estimate (current box, current code + this pass)

| Workload | Ceiling | Basis |
|---|---|---|
| Anonymous browsing (marketing, funding, index) | **~50 page views/s** ≈ **1,500 concurrent browsers at 1 view / 30 s**; comfortable at **500–800** (p95 < 600 ms) | origin saturation 50.5 rps at 10 conc; 40 rps via CF at 20 conc; 1 process ≈ 1 core |
| Signed-in workspace use (dashboard, reports list, data room) | **~150–300 concurrent active users** | workspace pages cost 2–4× a marketing page (session lookup + 2–5 PostgREST calls at ~2–5 ms + `phase-progress`), i.e. 15–25 renders/s; PostgREST pool of 10 is not the limit until DB calls exceed ~2,000/s |
| Trial sign-ups | **~30/min per shared IP, unbounded across IPs** (after fix); Stripe `SetupIntent` round-trip ≈ 1–2 s each | rate-limit table §5 |
| AI report generation | **~40–60 concurrent reports in flight**, throughput bounded by provider RPM (OpenRouter 20, Cerebras 30, SambaNova 60, Groq 4,000 assumed) and by the **60 s nginx / 100 s Cloudflare wall** on non-streamed routes; CPU cost per report is small (I/O wait) | `AI_MAX_CONCURRENT` 120 global; `full-report` `timeoutMs` 180 s vs nginx 60 s default |
| PDF/DOCX export | **~10–20/min** before browse p95 doubles | in-process `@react-pdf`, 1–3 s CPU each on the render thread |

**Bottleneck order for a wave:** (1) shared-IP rate-limit lockouts — fixed; (2) nginx `proxy_read_timeout` 60 s + Cloudflare 100 s on synchronous AI routes — 504/524 for the slowest ~10–20 % of full reports as provider latency rises under load; (3) single Node process render CPU (no HTML cache, everything dynamic) — visible as p95 > 1 s past ~40 rps; (4) PostgREST 10-connection pool (only if (3) is lifted with a second process); (5) Postgres memory defaults (128 MB) once tables reach hundreds of MB; (6) provider RPM caps.

## 10. Ranked actions

### Done (this pass, in worktree, not pushed)
1. **Rate-limit keying** `af7f623b5` — per-session key for signed-in traffic; auth ceilings sized for shared egress; `register-with-card` two-bucket. Tests included.
2. **Startup Index data cache** `9f3182a37` — kills the #1 query by total time (45 k calls / 2,316 s) for public traffic; 300 s TTL, tag `startup-index`, `revalidateStartupIndex()` exported for writers.
3. **Migration 0388** `3bdbecf06` — `svi_analyses` (email, created_at DESC), (project_id, created_at DESC) partial, (created_at DESC). **Not applied** — `scripts/db/apply-migration.sh web/supabase/migrations/0388_svi_analyses_hot_path_indexes.sql` off-peak (plain `CREATE INDEX`, SHARE lock for ~20 ms at today's size).

### Proposals (config outside the repo — founder applies)
4. **nginx: long-request timeouts + upstream keepalive + real IP** — `/etc/nginx/sites-enabled/blockid-live`, blockid.au block. Fixes the 504 wall on 60–180 s AI routes and stops per-request TCP to :4001:

```nginx
upstream blockid_app {
    server 127.0.0.1:4001;
    keepalive 64;
}
# Cloudflare → real client IP in logs (the app already reads cf-connecting-ip)
real_ip_header CF-Connecting-IP;
include /etc/nginx/cloudflare-ips.conf;   # set_real_ip_from lines from https://www.cloudflare.com/ips/

server {
    listen 80; listen 443 ssl; http2 on;
    server_name blockid.au www.blockid.au;
    ssl_certificate /etc/nginx/ssl/blockid.crt; ssl_certificate_key /etc/nginx/ssl/blockid.key;
    client_max_body_size 5m;

    # long AI / PDF routes: match the app's maxDuration (300 s max) and let streams through
    location ~ ^/api/(svi|rnd|report|reports|site-crawl|data-room/share)/ {
        proxy_pass http://blockid_app;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 310s; proxy_send_timeout 310s;
        proxy_buffering off;               # SSE / streamed report sections
        limit_req zone=ai burst=20 nodelay; # see zone below
    }
    location / {
        proxy_pass http://blockid_app;
        proxy_http_version 1.1;
        proxy_set_header Connection $connection_upgrade;  # map in http{}: $http_upgrade → "upgrade" else ""
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
# in http{}:
#   limit_req_zone $http_cf_connecting_ip zone=ai:10m rate=30r/m;
#   map $http_upgrade $connection_upgrade { default upgrade; '' close; }
#   gzip_types text/css application/javascript application/json image/svg+xml;
```
   Note Cloudflare's own 100 s origin timeout still applies on non-Enterprise plans — routes that can exceed ~90 s must stream (send headers early / `X-Accel-Buffering: no`) or move to the existing `report_orders` queue + poll pattern (`report-order-drain` cron already exists for this).

5. **Anonymous HTML micro-cache (optional, security trade-off)** — only if (7) below is not taken. Serves `/`, `/pricing`, `/funding/*`, `/startup-index*`, `/showcase/*` from nginx for 10 s to visitors without a session cookie; multiplies browse capacity ~20×. Reuses one CSP nonce per 10 s window across anonymous visitors, so ship only after the inline scripts in `layout.tsx` are hash-allowed instead of nonce-allowed:

```nginx
proxy_cache_path /var/cache/nginx/blockid levels=1:2 keys_zone=blockid_html:20m max_size=500m inactive=10m;
location ~ ^/(|pricing|funding(/.*)?|startup-index(/.*)?|showcase(/.*)?|compare(/.*)?|insights(/.*)?)$ {
    proxy_cache blockid_html;
    proxy_cache_key "$scheme$host$request_uri$http_accept";   # RSC vs HTML negotiate on Accept/RSC headers
    proxy_cache_valid 200 10s;
    proxy_cache_use_stale updating error timeout;
    proxy_cache_lock on;
    proxy_cache_bypass $cookie_blockid_session $http_rsc;
    proxy_no_cache    $cookie_blockid_session $http_rsc;
    add_header X-Cache $upstream_cache_status;
    proxy_pass http://blockid_app;  # + the same proxy_set_header lines as `location /`
}
```

6. **Cron re-timing** (crontab, founder): move the 03:00–04:59 UTC daily block (account-erasure 03:20, audit-chain-verify 03:40, nightly-clevel-review 04:30, reseller-* 03:15/03:50/04:30, ga4-event-audit 04:30 Mon, privacy-retention 03:15 Mon) to **15:00–17:00 UTC** (01:00–03:00 AEST); stagger the Sunday 03:00/04:00 collisions (`db-restore-test` 03:00 + `verify-models` 03:00; `discover-models` + `ai-model-discovery` + `refresh-funding-sources` all 04:00) 15 min apart; prefix the external scripts with `nice -n 19 ionice -c3` (`db-restore-test.sh`, `weekly-disk-cleanup.sh`, `clean-disk.sh`, `db-backup.sh`, `audit-migrations.mjs`); set `--priority low` on every `$RUN` line for `agent-*`, `ai-health-check`, `nightly-clevel-review`, `daily-admin-report`, `growth-insights` once the AI agent's `priority` flag lands so user reports pre-empt them in the AI semaphore. `ai-health-check` every 30 min at 16 s avg is the one recurring job worth halving (`*/60`).

7. **Second app process behind nginx** (founder-infra, biggest single win): `deploy-live.sh` already handles a temp port and swap; run two `node server.js` (PORT=4001, 4005) from the same release dir and add both to the `upstream` block. Doubles render capacity to ~100 rps and gives a live process during a crash-restart. Prerequisites: `REDIS_URL` for `lib/rate-limit.ts` (already Redis-capable; today the MemoryStore is per-process and two processes would halve every limit's effectiveness) and the `phase-progress` / product-tour fetch dedupe below. A `cluster`-mode start (`node -e "require('cluster')…"`) is the alternative that keeps one port.

8. **PostgREST pool + Postgres memory** (docker `.env` for supabase, founder): `PGRST_DB_POOL=20`, `PGRST_DB_POOL_ACQUISITION_TIMEOUT=10`; in `postgresql.conf`: `shared_buffers=2GB`, `effective_cache_size=16GB`, `work_mem=16MB`, `maintenance_work_mem=256MB`. Needs a `supabase-db` restart (~10 s downtime) — do it in the same window as (4).

9. **Offsite backups** (founder): run `scripts/db-backup-offsite-auth.mjs` once so the daily 02:40 offsite job stops failing; today every backup lives only on this box.

10. **Kill the two orphan `next-server` processes** (pids 851857 :4011 and 2940856 :4321, cwd deleted, ~415 MB) — `kill <pid>`; nothing routes to them.

### Code follow-ups (next pass, not done here)
11. Nonce → hash for the inline theme/consent scripts in `layout.tsx`, drop the `headers()` read from the root layout, keep locale via the cookie in `proxy.ts` → every `revalidate = N` starts working and (5) becomes unnecessary. Then delete the 30+ `force-dynamic` exports on pure marketing pages and the discarded `readSignedInHint()` call in `(marketing)/page.tsx:145-148`.
12. `components/workspace/product-tour.tsx` fetches `/api/svi/phase-progress` on every workspace page mount even when the banner is dismissed, and `/dashboard` fetches it twice; cache the response in `sessionStorage` for 5 min or lift it into the `(app)` layout data.
13. `/api/auth/reset-password` still keys on the first `x-forwarded-for` hop (spoofable) — switch to `clientIpFromHeaders` + per-(IP, email) like the other three kinds.
14. Any AI route that can run > 90 s (`full-report` 180 s budget) should return a `report_orders` id and let `report-order-drain` finish it, so Cloudflare's 100 s cap never bites — the queue already exists.
15. Set `NODE_OPTIONS=--max-old-space-size=3072` in `deploy-live.sh` for the runtime process so a leak hits a clean OOM restart (watchdog restarts within 2 min) instead of a 4 GB swap-less stall.
