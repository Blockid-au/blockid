# G36 — Stability auto-fix loop: report

Scope: blockid.au, hr.blockid.au, eth.blockid.au, scan.blockid.au (+ startupvalueindex.com uptime).
Procedure: `/g36-stability` skill (`.claude/skills/g36-stability/SKILL.md`). Newest tick on top.

---

## Tick 1 — 2026-11-25 (00:27 → 13:10 UTC)

**Outcome:** 2 P0 outages and 3 P1 bugs fixed and live. blockid.au **`8ece82edf` → `73c62f722`**, qa:live **307 / 0** (was 306 / 1), full unit suite 44,456 / 0, typecheck + eslint 0 errors. hr/eth/scan back up.

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
| P2 | `clo/dataroom` section: truncated JSON (`Unexpected end of JSON input`) in the 25/11 report — output budget too small | loop |
| KPI | Report grounded share 0.59 vs 0.85 target (0.73 on 17/11) | loop (G24-D carry-over) |
| P2 | `/funding/grants?…` proxy rewrite loops back over HTTP (socket hang-ups) — move to `next.config` rewrites + hydrated CSP smoke | loop |
| P3 | Same read-then-overwrite credit pattern in `report-refund.ts`, `api/svi/modular`, admin/reseller grants → move to the CAS helper | loop |
| P3 | Subscription-deleted handler downgrades by customer, not by subscription | loop |
| P3 | Magic-link token consumed on GET (e-mail scanners) | loop |
| P3 | Agent-upgrade `growth_insights` insert writes non-existent `type`/`data` columns | founder: drop insert or migrate |
| P2 | Other Next servers on this box on affected 16.2.3 / 16.4.2 (dev/staging) | loop |
| P2 | hr/eth VM: apply compose log rotation (`g36-stability-fixes`) at next VM deploy; pin Blockscout images; Blockscout indexer `ContractCode` error loop | loop / founder |
| **Founder** | Cloudflare token with DNS edit on blockid.au → `/etc/blockid/cloudflare.env` on the VM (IP change = 522) | founder |
| **Founder** | Report price policy renewal before **2026-12-24** | founder |
