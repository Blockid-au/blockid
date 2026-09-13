# Live QA suite — S25–S29 founder journeys against production (S30-A)

`web/tests/live-qa/` turns the manual sweeps of 2026-09-12/13
(`docs/plans/reviews/release-qa2-journeys-2026-09-12.md`,
`live-qa-s25-s29-lane1-2026-09-13.md`, `…-lane2-…`) into a repeatable Playwright
project that runs **against https://blockid.au** with one throw-away founder account
per run. It is deliberately separate from the deploy's Gate 12
(`playwright.config.ts` → `tests/e2e/smoke/post-deploy.spec.ts`) and from vitest:
its config is `web/playwright.live-qa.config.ts`, nothing under `tests/live-qa` matches
either of the other two include lists.

## How to run

```sh
cd web
npm run qa:live                                   # Free-plan coverage (no DB step)
LIVE_QA_ALLOW_DB=1 LIVE_QA_ELEVATE=1 npm run qa:live   # full coverage (Growth-gated pages)
bash scripts/qa-live.sh -- tests/live-qa/07-investor-crm.spec.ts   # one spec (setup + teardown still run)
npx playwright show-report playwright-report-live-qa               # open the HTML report
```

| Env | Default | Effect |
| --- | --- | --- |
| `LIVE_QA_BASE_URL` | `https://blockid.au` | Target origin. |
| `LIVE_QA_ALLOW_DB` | off | Permits the **local** `docker exec supabase-db psql` steps. Every statement is scoped to one address matching `^qa-live-\d{8}-\d{4}@blockid\.au$`; anything else is refused before a connection is opened (`tests/live-qa/lib/db.ts`). |
| `LIVE_QA_ELEVATE` | off | With `ALLOW_DB`: `app_users.plan = 'growth'` for the QA email and `projects.growth_phase_current = 'funding'` for its project (01-elevate.spec.ts). Without it every Growth-gated journey is **skipped**, not failed. |
| `LIVE_QA_SPEND_OK` | off | Allows confirming an action that costs credits (AI categorise on Free, round activation → 3-credit data room). Never set in cron. |
| `LIVE_QA_KEEP_ACCOUNT` | off | Debug only: skip the erasure. The runner never sets it; the report then carries an `ERASURE NOT CONFIRMED` finding. |
| `LIVE_QA_REUSE_STATE` | off | Debug only: reuse `test-results/live-qa/run-state.json` + storage state instead of registering again (pairs with `KEEP_ACCOUNT` to iterate on one spec without burning the register bucket). |

The register endpoint allows 3 sign-ups per 15 min per IP: the suite registers **once**
per run (global setup) and every spec reuses the saved storage state. If the setup gets a
429 it stops immediately and tells you the `Retry-After`.

## What a run provisions — and erases

1. `POST /api/auth/register` as `qa-live-<yyyymmdd-hhmm>@blockid.au` with a random
   password that lives only in the setup process's memory (never written anywhere).
2. `POST /api/onboarding/complete`, then `POST /api/projects` ("QA Live <stamp>") — the
   release-qa2 path (onboarding creates no project; the founder does). The project slug is
   pinned in the `blockid_project` cookie inside the storage state.
3. Optional elevation (above). Both SQL steps `RETURNING` the value and fail if no row
   matched the QA pattern.
4. The journeys create: a cap table (Ordinary class, QA Founder 700 000 / Sam Cofounder
   300 000), one dividend record (2026-06, A$10 000) with statements issued only because
   Growth includes them, a DRIP election (revoked again), a Seed round with one commitment,
   CRM contacts (Jane Angel + 2 CSV rows), ~10 bank lines, listing facts, one clean-room
   tick, one sandbox order (cancelled again). Nothing is left on the exchange front-end.
5. **Teardown** (`global-teardown.ts`): `node --env-file=.env scripts/db/erase-account.mjs
   --email <qa> --dry-run`, then `--write`, then `--dry-run` again which must exit **2**
   (no `app_users` row for that address — the RPC tombstones it). Any other outcome throws,
   the Playwright run exits non-zero, and `content/reports/live-qa-latest.json` carries an
   `ERASURE NOT CONFIRMED for <email>` finding. Erase by hand with the same command.

## Credits discipline

Every preview (dividend statements, tax statements, board resolution, listing PDF, expense
categorise, term-sheet compare, valuation certificate) is asserted **cost-first** and the
balance is re-read afterwards — `credits.assertUnchanged` in `fixtures.ts`. A confirm is
sent only when the preview returned `included: true` (Growth) or `LIVE_QA_SPEND_OK=1`.
Round activation is never clicked without `SPEND_OK` because it may compile a 3-credit data
room. The suite spends **0 credits** in its default and elevated modes.

## Spec map

| File | Journeys (lane-1 rows) | Plan |
| --- | --- | --- |
| `00-free-plan-gates` | cap-table / listing / clean-room → `/pricing` redirects (#15, #39), sandbox lock (#23), fundraise dead-end link (#11 / F8) | Free |
| `01-elevate` | plan + phase flip (skipped unless `ELEVATE`) | — |
| `02-revenue` | source captions, Data Sources panel, Xero available → OAuth redirect / unavailable → label (#1–#3, F2) | Free |
| `03-cap-table` | class + shareholders (UI + API), share-price honesty (F3), board-resolution preview (#16–#18) | Growth |
| `04-dividends` | empty state, record, statements preview + included confirm, register PDF, DRIP add/preview/revoke, FY picker + tax preview (#4–#10) | Growth |
| `05-term-sheet-exit` | compare guidance (#19), acqui-hire team of 8 (#20) | Free / Growth |
| `06-fundraise` | round create (F1 regression), progress bar, commitment soft→committed, Open-round copy, label a11y (F16, `test.fail`) (#12–#13) | Growth |
| `07-investor-crm` | empty → add → overdue → stage → note → CSV import (dup + `=SUM`) → export (#28–#34) | Free |
| `08-expenses` | CSV upload → rules → duplicates → AI preview cost → inline re-category → learned rule (#35–#38) | Free |
| `09-listing-readiness` | tabs, facts save, basis/source/as-at, confirm-rule rows, PDF included (#40–#44) | Growth |
| `10-clean-room` | computed vs founder tasks, tick persists, 400/409/413 (#45–#47) | Growth |
| `11-valuation-secondary-chain-admin` | honest empty valuation + ESS annex 409 (#21–#22), sandbox order (#24), on-chain 409 `no_token` (#25–#26), admin denied (#27) | mixed |
| `20-cross-cutting` | nav leaves per phase (#48), logged-out 307s (#49), console/network per page (#50), keyboard focus (#52) | mixed |
| `21-layout.mobile` | 390 px: no horizontal scroll, header fits, account menu (#51 / F4) — `live-qa-mobile` project | mixed |

Known-issue handling: the Cloudflare-injected Google tag bootstrap (docs/ops/analytics.md
§4) is the **only** tolerated console error, and only while the served HTML still contains
`google_tags_first_party` / `developer_id.dYzg1YT` — once the founder flips the switch the
allow-list disarms itself. Lane-1 F10 (`POST /api/dividends` 400 on the revenue page with no
shareholders) is allow-listed by request signature with an annotation; so is the
`GET /api/svi/phase-progress` 429 the product tour trips when a run loads ~100 pages in
four minutes (suite-induced, annotated `suite-induced`). Lane-1 F16 (fundraise wizard
labels) is a `test.fail` that will show as *unexpected pass* when fixed — flip it then.
The on-chain "Check chain now / Push" copy needs a `blockchain_sync_config` token row
(Scale+), which the suite does not seed; the API contract (409 `no_token`) is covered.

## Reading the report

`content/reports/live-qa-latest.json`:

```json
{ "ts": "…", "passed": 91, "failed": 4, "skipped": 1, "expectedFailures": 1, "exitCode": 1,
  "account": { "email": "qa-live-…", "elevated": true }, "erasure": { "ok": true, "detail": "…" },
  "findings": [ { "spec": "06-fundraise.spec.ts", "title": "…", "error": "…" } ] }
```

* `findings[]` — every failed test with its first error line; `(teardown)` rows mean the QA
  account may still exist.
* `expectedFailures` — known product findings pinned with `test.fail`; an *unexpected pass*
  is reported as a failure until the pin is removed.
* Per-test evidence (API bodies, UI copy, credit balances before/after, guard reports) is
  attached as JSON in the HTML report (`playwright-report-live-qa/`); traces are kept for
  failures under `test-results/live-qa/artifacts/`.
* `content/reports/live-qa-history.jsonl` keeps one line per run for trend checks.

A failing test is either a **product bug** (report it — the suite never fixes product code)
or a **suite bug** (selector / contract drift — fix the spec). A 502/503/504 during a deploy
swap is retried once after 60 s by `visit()` and the API helpers.

First production run (2026-09-13 15:56 UTC, `LIVE_QA_ALLOW_DB=1 LIVE_QA_ELEVATE=1`): 91 passed ·
4 failed · 1 skipped · 1 expected failure · 0 credits spent · account erased and verified.
The 4 failures are product findings (fundraise round detail 404 — `ROUND_COLUMNS` selects
`fundraise_rounds.closed_at`, which the live table created by 0043 never had — and the
expense-import `creditNote` still saying "Charged to your credits." when included); they
stay red until the product fixes land.

## Scheduling (proposal — not installed)

```
# Weekly Sunday 07:00 UTC — live QA of the S25–S29 founder journeys against prod
# (after the 03:00–05:00 UTC Sunday jobs and the money-radar sweep).
0 7 * * 0 cd /home/dovanlong/blockid.au/web && LIVE_QA_ALLOW_DB=1 LIVE_QA_ELEVATE=1 bash scripts/qa-live.sh >> /tmp/blockid-live-qa.log 2>&1
```

Add it to `web/scripts/crontab.production` and `crontab` it when the founder approves. The
job needs the Playwright chromium already provisioned (it is, for Gate 12) and Docker access
for the psql steps.
