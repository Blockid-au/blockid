# G36 — Stability auto-fix loop: report

Scope: blockid.au, hr.blockid.au, eth.blockid.au, scan.blockid.au (+ startupvalueindex.com uptime).
Procedure: `/g36-stability` skill (`.claude/skills/g36-stability/SKILL.md`). Newest tick on top.

---

## Tick 5 — 2026-11-26 13:05 → 2026-11-27 00:05 UTC

**Outcome:** blockid.au signals were green on arrival, but **hr/eth had been down in the background for three weeks**: since the 05/11 disk-full, the chain had stopped and both AI workers were dead, while every page and API still answered 200. Restored, root-caused, and monitored now. blockid.au deploys **`af788d2ae` → `d837133d4` → `5550504bd` → `9d4647ab2`** (3 deploys, each followed by a full elevated qa:live and a `/code-review`), unit **44,649 / 0**, typecheck 0. qa:live: 306/1 on `d837133d4` (SVI-trend h1, fixed); 304/3 on `5550504bd`, re-run 306/1 (transient CSP race right after the funding revalidation, dossier TTFB under load, then the evidence-gaps h1); **final run on `9d4647ab2`: 307 / 0**.

### P0 — hr / eth (VM)
| Problem | Since | Fix | Status |
|---|---|---|---|
| BlockID Chain stopped at block 541,586 (evmd never restarted after the disk was cleaned on 25/11) | 05/11 20:26 | Runbook `chain-halted`: snapshot `/mnt/app-data/evmd.pre-g36-20261126T1316` (3.7 GB), `$DC restart evmd`. No app-hash/consensus error | **FIXED**: blocks advancing, `chain.blocks ok` |
| Both AI workers dead (worker-1 crashed at start with `sqlite3: database or disk is full`, worker-2 wedged in the DB pool) → no HR team/person review could run | 05/11 20:29 | `$DC restart agents-worker` | **FIXED**: `worker.heartbeat ok`; live JD-parse AI call 200 in 15 s |
| Nobody was alerted: the VM saw both as critical, but its SMTP is not configured, and our satellite probe only checked HTTP | — | `satellite-uptime.sh`: newest-block age via scan API every 2 min, the VM's critical ops checks (read-only SELECT over gcloud ssh) every 10 min, plus an alert when that probe itself keeps failing | **LIVE** `5077aa6b0`, `4a4487dc7` |

hr.blockid.au full crawl (12 routes × desktop/375 px + 10 sample reports): all 200, 0 JS errors, 0 overflow, 0 5xx in nginx logs. One dead link: the 404 page offered "Businesses" → `/companies`, which the HR app does not have → now "Review a team" (eth-blockid `7453ca3`, web rebuilt on the VM, bundle `index-DnyJB7y0.js`; VM checkout now on branch `g36-stability-fixes`).

### blockid.au
| Sev | Fix | Commit |
|---|---|---|
| P1 link | 6 broken official links on /funding, open since 29/09–03/10. **capitalangels.com.au was hijacked** (redirects to spam) → archived site + `status_confidence=low`; Enterprize ×2, Something Fest, Swinburne Elevate corrected; BFF R3 → archive. Seed files + `0479` **applied live 15:33** (backup of the old values in `/data/backups/manual-pre-0479-20261126T1533.tsv`), funding cache revalidated, all 6 verified on the live pages | `5077aa6b0`, `75eca351c` |
| P1 payment | Two concurrent over-budget reseller approvals granted twice → claim the request first | `34f53409b` |
| P1 payment | A failed order-status write after a refund refunded twice on retry → claim the order first; Stripe idempotency key | `0b4d23559` |
| P1 payment (review) | Stale-claim reconcile sweep in the drain cron; ambiguous Stripe/credit errors keep the claim; ambiguous reseller ledger write is no longer reversed; alert for unrefunded FAILED orders | `d2ee559b0`, `0faf052e0` |
| P2 UX | Evaluator first paint showed the founder sidebar (persona seeded server-side); cap-table / investor CRM / SVI-trend loading states had no h1 | `91fa0fb24`, `23f3e316f`, `340dfecf5`, `34a9e535b` |
| P1 payment (review round 3) | Reconcile batches filtered + ordered in SQL; released transient credit refunds retried up to 5×; `charge_already_refunded` matched on `bid_order_id` and checked for coverage; stable Stripe idempotency params; CAS `maybeWritten` only for unknown write errors. Queries checked read-only against prod PostgREST before deploy; drain cron on live returns noop with 0 sweep errors | `fca54bcb2`, `b20103a2b` |
| P2 a11y | Six more founder pages had no h1 while loading (finance, documents, shareholders, raise round, evidence gaps, exit strategy); one guard test over the server pass | `9355c5f54` |

Checked and OK: login (password 401 with a clear message, Google start → accounts.google.com, /auth/reset, /signup), Stripe service ok, webhook failures 0, report orders pending 0, 5/5 AI providers, 10/10 C-level agent tasks ok, internal links 0 broken (655 pages), sitemap 464/464, SVI site 0 broken. Prod has **0** FAILED/REFUNDED report orders, so the refund changes touch no existing customer.


Founder-only / open:
- Report price policy expires **2026-12-24** (27 days left; renewal proposal in `web/content/reports/ai-price-policy-renewal.json`). Ask from 17/12.
- hr/eth VM: `/etc/blockid/cloudflare.env` still missing (DNS can't follow an IP change), VM SMTP not configured (its own alerts are stored, not sent; our satellite probe now covers it). Telegram bot token still 401 → ops alerts use the e-mail fallback.
- eth-blockid branch `g36-stability-fixes` (3 G36 commits) is what the VM runs now → merge it to `main` on GitHub.
- Backlog: `/workspace/equity/on-chain` + `/workspace/esop/manage` keep their h1 inside the main client component (OK today); business-report "order pending/blocked" view has no h1; IP Australia link is a TLS false positive from this server.

---

## Tick 4 — 2026-11-25 (20:25 → 22:20 UTC)

**Outcome:** signals green on arrival; payment backlog shipped. blockid.au **`7652cfb66` → `af788d2ae`**, unit 44,566 / 0, typecheck 0. Full qa:live right after the deploy: 304 / 3 — all three re-ran green (12 / 0): two pages rendered without h1 and one 502 during old-origin retirement / release retention. The 502 was real: nginx `upstream prematurely closed connection` on a PATCH (4 such in 2 weeks) → upstream `keepalive_timeout 4s` (Node closes idle sockets at 5 s; nginx default 60 s), proxy switch updated to accept it.

| Sev | Fix | Commit |
|---|---|---|
| P2 | Credit balance compare-and-set on refund (`report-refund.ts`), `api/svi/modular` debit (two concurrent requests = two reports, one charge), admin revoke (negative amount added credits; now 400), reseller grant, reseller over-budget approval, affiliate seed, `spendCreditsLegacy` | `7a777f4c9`, `07eb02deb`, `901202a07`, `da5ef137c`, `5edc44d63`, `cae4fa2b2`, `77693e396` |
| P2 | `handleSubscriptionDeleted` keeps the plan while another plan subscription is live (Stripe read-only list, falls back to the recorded sub) | `27321bd09` |
| P3 | `/pricing` hash-CSP smoke waits for the evaluator tiers, then the Founder tab | `75faecb46` |
| P2 | nginx upstream `keepalive_timeout 4s` (applied live, backup `/etc/nginx/blockid-live.pre-g36-keepalive`); `g30-proxy-switch.py` allows it | `31e58ee20` |

New backlog: concurrent approval of the same over-budget reseller request grants twice (claim first); refund + failed order-status write could refund twice on retry.

---

## Tick 3 — 2026-11-25 (17:42 → 19:45 UTC)

**Outcome:** new signal = orphaned evaluation-batch run after the qa:live account erasure (15× `ai_runs_business_id_fkey`, `report_persistence_unconfirmed`, no customer impact); fixed together with the top backlog item. blockid.au **`c88bfc278` → `7652cfb66`**, unit 44,544 / 0, typecheck 0, qa:live **307 / 0**, teardown drain "cancelled 1 queued", **0** FK/orphan errors after the run.

| Sev | Fix | Commit |
|---|---|---|
| P2 | Batch report runs check that their item / batch / owner / project still exist (before each item, each wave, before save); a deleted owner → quiet `owner_deleted` stop, no more AI calls, no error-digest entry; FK errors on existing parents stay loud | `0b79cef0d` |
| P2 | qa:live teardown drains / cancels the run's in-flight evaluation-batch items before erasing the QA accounts | `e8cbe9716` |
| P2 | Grants filter chips, state links and `/tbr/demo` band links use a document navigation (`RewriteAwareLink`) — the client router drew the cached base page (NSW chip showed all 53 grants); one shared `internalRouteFor` decision for proxy + links, guard test | `54d33fe2f`, `a655ce68f` |

Residual: interactive report routes don't run the owner check yet; `/pricing` smoke spec (`#tier-free`) still stale.

---

## Tick 2 — 2026-11-25 (15:08 → 16:45 UTC)

**Outcome:** signals green on arrival (errors_1h 1 = self-proxy ECONNRESET, hr/eth/scan 200, VM disk 37%), so two backlog P2s were fixed by worktree agents and shipped. blockid.au **`396fa3c9a` → `c88bfc278`**, unit 44,507 / 0, typecheck 0, qa:live **307 / 0**, 0 proxy errors on the new origin.

| Sev | Fix | Commit |
|---|---|---|
| P2 | Report sections ran out of output budget (clo/dataroom capped at 2,600 → plain-text fallback, never grounded; 24/267 V4-Flash calls hit the cap): CLO 4,000, W1–W3 floor 3,400; truncated-JSON salvage drops a half-written array element | `904ccd5c5` |
| P2 | Filtered `/funding/grants?…` and `/tbr/demo?band=` served by in-router `beforeFiles` rewrites keyed on a proxy-set header — no HTTP self-proxy (socket hang up / ECONNRESET / cold 500s), no `x-middleware-rewrite: http://localhost:…` leak; CSP mode + Cache-Control per route unchanged | `21d57b817`, `e2d6296f5` |

Grounded share 0.73 → 0.59 explained: clo/dataroom degraded (fixed), dimension chapters ran on V4-Flash instead of V3.2 under time pressure (fewer citations; load-dependent, not a bug), criterion sections run-to-run noise.

New backlog: filter chip / band link client navigation shows the base page (prefetch skips the proxy — pre-existing on live); tbr-quality `degradedSections` only counts dimension chapters; `/pricing` smoke spec looks for `#tier-free` (stale); re-run showcase with `--audit-dump`; wildcard `<slug>.blockid.au` rewrite still self-proxies.

---

## Tick 1 — 2026-11-25 (00:27 → 14:10 UTC)

**Outcome:** 2 P0 outages and 3 P1 bugs fixed and live. blockid.au **`bc356985f` → `396fa3c9a`** (deploys `8ece82edf`, `396fa3c9a`; two attempts stopped safely by gates — Next 16.4.2 SecurityFatalError, cold self-proxy 500 on `/funding/grants?type=tax_deduction&stage=…`), qa:live **307 / 0** (was 306 / 1), full unit suite 44,456 / 0, typecheck + eslint 0 errors. hr/eth/scan back up.

### P0 — production outages
| # | Site | Problem | Since | Fix | Status |
|---|---|---|---|---|---|
| 1 | blockid.au | **Every AI report refused** — founder-pinned report price policy expired 22/11; the 23/11 report came out at 0 words | 22/11 | Founder approved extension to **2026-12-24** (`801ad6ed6`); prices unchanged per the 24/11 price feed | **LIVE** — verification run 25/11: 7,228 words, 23 pages, 0 degraded, US$0.0585 |
| 2 | hr / eth / scan | **VM disk 100%** → Postgres PANIC, chain halted, login / wallet / AI / dividends down; scan API down since 05/11 | ≤ 25/11 (scan 05/11) | Truncated 2 runaway Docker logs (28 + 30 GB) + 21 GB build cache → 36% used; Blockscout backend restarted | **FIXED** — APIs 200 (eth stats 0.35 s, scan v2 200) |

### P1 / P2 — fixed and live
| Lane | Fix | Commit |
|---|---|---|
| A auth | `/api/admin/leads`, `/api/nps` GET, `/api/testimonial` GET/PATCH were open to **any signed-in user** (leads / NPS / testimonial e-mails) → admin-only | `e0ed7006a` |
| A auth | Google callback with expired/missing state → redirect to login "start again" instead of raw JSON 400 | `1dffb6bfe` |
| A auth | Logout 307 → 303 (no `POST /` 405) | `80a8a1de8` |
| A auth | Constant-time password login (no account enumeration by timing) | `968e03779` |
| A runtime | Bot `Next-Action` + `RSC` probes rejected with 400 before Next (InvariantError / server-reference noise) | `56b01825c` |
| B payment | **Double-click "pay with credits" = free report** → compare-and-set debit, additive rollback | `f57b1a61d` |
| B payment | `grantCredits` lost concurrent grants / erased debits → compare-and-set helper | `4621fd1a0` |
| B QA | `/funding` live-QA price matcher rejected "A$3," (failing weekly since 01/11) | `64cdaf5b8` |
| C AI | Our own call-budget exhaustion put DeepInfra (primary) in a 2-min cooldown | `ed69e7976` |
| C AI | gpt-oss on Groq returned empty answers (~480/day) → `reasoning_effort: low` | `42054be84` |
| C AI | Unfunded providers skipped silently (~160 log lines/day) | `53a4ff3e9` |
| C AI | Daily admin report re-ran the agent-upgrade job (timeouts, double Monday e-mail) → reads last result | `6ce80d0a2` |
| AI | **Cerebras removed** (founder): key commented out in `web/.env` (backup `~/env-backups/web.env.pre-g36-cerebras-20261125T1121`) | env |
| AI | Free-model list keeps only models that answer a **real-sized** live probe (flint-v1.0 answered "ok" but 0 chars on real prompts) | `3f2e35dd2`, `73c62f722` |
| AI | 25/11 refresh after deploy: flint-v1.0 dropped (timeout on the 400-token task); free list = Groq qwen3.8-27b / gpt-oss-120b / gpt-oss-20b, OpenRouter nemotron-3-ultra-550b / ernie-5.5-flash | `396fa3c9a` |
| deploy | Candidate warms the self-proxy rewrite routes before the link check (cold first hits → 500 blocked 2 deploys) | `396fa3c9a` |
| deps | Next.js 16.4.2 → **16.4.6** (build refused: 7 moderate advisories) | `8ece82edf` |
| hr/eth | CSP allows HashKey testnet RPC ("Verify on-chain" button) — applied on VM nginx | eth-blockid `2f72c34` |

### 24/7 — new guards
- **`scripts/cron/satellite-uptime.sh`** (every 2 min): hr / eth / scan HTML + JS bundle + one **DB-backed API** each, and startupvalueindex.com; P1 alert after 3 fails; auto-starts the eth VM if it is stopped (kill switch `~/.config/blockid/no-vm-autostart`).
- **VM `blockid-disk-janitor.timer`** (every 10 min): at ≤ 10% free cleans oversized container logs → build cache / dangling images → journald / apt / old tmp until 25% free; on every tick trims any container log > 2 GB. `/etc/docker/daemon.json` rotates new container logs (20 MB × 10). Source: eth-blockid `1e651c7`.
- Main server unchanged: `blockid-disk-guard.timer` (5 min, 80% threshold), `uptime-watcher.sh` (1 min, rollback after 5 fails), `watchdog.sh`, `uptime-24x7-guardian.sh`.
- `/g36-stability` checks the report price-policy days-left every tick (next expiry **2026-12-24** — ask the founder ≥ 7 days before).

### Verified live after deploy
Login page 200 · Google start 302 → accounts.google.com with the correct `redirect_uri` · callback bad state → `/auth/login?google_error=state_mismatch` · logout 303 · empty password login 400 · admin leads / NPS 401 anonymous · RSC probe 400 · /dashboard → login with `next` · /pricing, /funding 200 · `/api/status`: db / stripe / audit / ga4 ok, providers deepinfra / gemini / claude-oauth / groq / openrouter ok, unfunded none, errors_1h 0, webhook_failed_24h 0.

### Open — backlog for the next ticks
| Sev | Item | Owner |
|---|---|---|
| KPI | Report grounded share 0.59 vs 0.85 target (0.73 on 17/11) | loop (G24-D carry-over) |
| P3 | Same read-then-overwrite credit pattern in `report-refund.ts`, `api/svi/modular`, admin/reseller grants → move to the CAS helper | loop |
| P3 | Subscription-deleted handler downgrades by customer, not by subscription | loop |
| P3 | Magic-link token consumed on GET (e-mail scanners) | loop |
| P3 | Agent-upgrade `growth_insights` insert writes non-existent `type`/`data` columns | founder: drop insert or migrate |
| P2 | Other Next servers on this box on affected 16.2.3 / 16.4.2 (dev/staging) | loop |
| P2 | hr/eth VM: apply compose log rotation (`g36-stability-fixes`) at next VM deploy; pin Blockscout images; Blockscout indexer `ContractCode` error loop | loop / founder |
| **Founder** | Cloudflare token with DNS edit on blockid.au → `/etc/blockid/cloudflare.env` on the VM (IP change = 522) | founder |
| **Founder** | Report price policy renewal before **2026-12-24** | founder |
