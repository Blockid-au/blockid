# Sector multiples — how a valuation picks its ARR multiple, and how to change it

S27-C (2026-09-13). Roadmap item "Sector-specific multiples auto-updated
quarterly". Every valuation surface — the VC report (`/api/valuation/vc`,
`/api/score`), the connected-revenue bridge, the share-price estimate and the
valuation certificate — multiplies ARR by a per-sector `{low, mid, high}`
band. This page says where that band comes from, how the quarterly cron
proposes a change, how an admin approves one, and how to roll it back.

**Nothing fabricates a number.** A multiple only changes when an admin
approves a row that carries a real citation: a public source URL, a title
and an excerpt copied verbatim from that page.

## 1. How the resolver picks

`web/src/lib/valuation/sector-multiples.ts` → `getSectorMultiples(sector, at?)`

1. Normalise the sector key (`"SaaS"` → `saas`; anything unknown → `default`).
2. Look at the **approved** rows in `public.sector_multiples_overrides`
   (migration `0369`) for that sector whose `effective_from <= at` (default:
   today, UTC). Proposed and rejected rows are never consulted.
3. The latest `effective_from` wins; two rows with the same date are broken by
   the most recent `approved_at`. A row whose band is inconsistent
   (`low <= mid <= high` fails) is skipped.
4. No approved row → the static table in
   `web/src/lib/valuation/sector-multiples-static.ts` (`SECTOR_MULTIPLES`,
   dated 2026-06, re-exported from `lib/agents/cfo-valuation.ts` for older
   imports).

The result carries a `sourceLabel` that every consumer prints in its method
note:

| Source | Label |
| --- | --- |
| static row | `BlockID static table (2026-06) · <row citation>` |
| approved override | `<source_title>, <source_published_at or effective_from>` |

Where it lands: `vcBenchmark().sourceLabel` / `.multiplesSource`, the VC
report's `revenue_multiple` rationale and `notes`, the MRR bridge's
`connectedRevenue.multipleSourceLabel` (and its `methodNote` when an override
is in force), and the share-price `multiple.sourceLabel` / `methodNote`.

**Cache.** The consumers are synchronous, so approved rows are loaded into a
process cache with a 10-minute TTL. The valuation, score and share-price
routes `await primeSectorMultiples()` before computing; approve / reject
drop the cache immediately, so a decision is visible on the next request on
the node that took it and within 10 minutes elsewhere. Under vitest nothing
is loaded — tests inject rows with `setSectorMultiplesOverridesForTests()`.

## 2. How the cron proposes

`POST /api/cron/sector-multiples-refresh` — `0 3 1 1,4,7,10 *` in
`web/scripts/crontab.production` (1st of Jan / Apr / Jul / Oct, 03:00 UTC =
1 pm AEST). Bearer `CRON_SECRET`; `?dry=1` runs the full loop with no writes
and returns the rows it would have inserted.

Loop (`web/src/lib/valuation/multiples-refresh.ts`), per source in the fixed
allow-list `web/src/lib/valuation/multiples-sources.ts`:

1. Fetch through `lib/funding/fetch-source.ts#fetchText` — browser UA,
   retries, 2 MB cap, DNS-pinned socket, SSRF guard on every redirect hop.
   Only allow-listed URLs are ever fetched; a URL never comes from a model,
   a row or a request.
2. `htmlToText`, clipped to 14,000 characters.
3. Ask the AI client (the same `callAI` the CFO agent uses) for
   `[{ sector, arr_low, arr_mid, arr_high, excerpt, published_at }]`.
4. Keep a candidate only when **all** of these hold:
   * `sector` is a static-table key **and** listed for that source;
   * `0 < low <= mid <= high <= 200`;
   * `excerpt` is 20–500 characters and `text.includes(excerpt)` — a
     verbatim substring of the exact text the model was shown. A paraphrase
     is rejected (`excerpt_not_in_text`);
   * the excerpt itself contains at least one of the three numbers
     (`excerpt_lacks_number`), so a figure cannot be invented next to a
     real sentence.
5. Insert as `status='proposed'`, `proposed_by='cron'`,
   `effective_from = today`. A partial unique index on
   `(sector, source_url, band) WHERE status='proposed'` makes a re-run
   idempotent — collisions are counted as duplicates.

Nothing is approved by the cron. A 403 / timeout / AI failure / unparseable
answer is logged per source in the JSON body (which `cron-runner.sh` writes
to `content/reports/cron-health.jsonl`) and the loop moves on; one bad source
never aborts the run.

### The allow-list

| id | Page | Why it is there |
| --- | --- | --- |
| `saas-capital-index` | https://www.saas-capital.com/the-saas-capital-index/ | Monthly public-SaaS median EV/ARR — the headline SaaS figure. |
| `aventis-saas-multiples` | https://aventis-advisors.com/saas-valuation-multiples/ | Quarterly public and private (M&A) SaaS EV/Revenue medians with periods stated. |
| `damodaran-ev-sales` | https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/psdata.html | Annual (January) EV/Sales by industry — the only free page covering software, internet, health IT, online retail, financial services and biotech in one table. |
| `bvp-cloud-index` | https://www.bvp.com/bvp-nasdaq-emerging-cloud-index | EV / NTM revenue of the public cloud index the static table already cites; interactive, so the HTML may carry only headline figures. |
| `meritech-comps` | https://www.meritechcapital.com/benchmarking/comps-table | Public SaaS comps with a median row; interactive, same caveat. |

Add a source by appending to `MULTIPLES_SOURCES` with `expects` (what the
page states) and `sectors` (which keys it may propose). Remove one by deleting
its entry — existing rows keep their `source_url` as the citation trail.

## 3. How to approve

`/dashboard/admin/sector-multiples` (admin only; sidebar → Admin → Sector
Multiples). Each proposed row shows the excerpt, the link to the page, and
three bands side by side — the static table, what is in force today, and the
proposal. Open the link, find the excerpt on the page, check the numbers and
the date, then:

* **Approve** → `POST /api/admin/sector-multiples/[id]/approve` (optional
  `{ note }`). The row becomes `approved`, `approved_by` = you,
  `approved_at` = now, the resolver cache is dropped, and an
  `audit_events` row `sector_multiples.approved` records the sector, the
  band, the source URL and `same_admin: true` when you approve your own
  manual proposal (allowed, but on record).
* **Reject** → `POST …/[id]/reject`. The row becomes `rejected`
  (`sector_multiples.rejected`).

A second click on a decided row is a 409, and two admins deciding at once
cannot both win (the update is conditional on the status that was read).

### Manual proposal

The "Propose an override" form (`POST /api/admin/sector-multiples`) takes
the sector, the band, the source URL / title / optional publish date, an
optional `effective_from` (default today) and the verbatim excerpt. It is
saved as `status='proposed'`, `proposed_by='admin'`, with your user id in
`proposed_by_user_id`, and audited as `sector_multiples.proposed`. It still
has to be approved — by you or another admin — before any valuation uses
it. The form cannot fetch the page, so you are attesting that the excerpt is
verbatim; the reviewer checks.

### Same-day supersede

To replace an override that is already in force, approve a newer row with a
later (or equal) `effective_from`; the resolver takes the latest date, then
the latest approval. Nothing needs to be rejected first.

## 4. How to roll back

Reject the approved row (the "Roll back" button in the "In force today"
table, or `POST …/[id]/reject`). Its status becomes `rejected`, the audit row
carries `previous_status: approved` and `rollback: true`, and the resolver
falls back to the previous approved row for that sector — or the static
table when there is none — on the next request. Rows are never deleted: the
citation behind every valuation that used them stays in the table.

## 5. Ops

* **Migrations** (not applied on deploy — see `docs/ops/db-migrations.md`):
  `0369_sector_multiples_overrides.sql` (table, RLS service-role only,
  indexes) and then `0370_erase_account_sector_multiples_overrides.sql`
  (`erase_account()` re-created for the 127th `app_users` FK —
  `approved_by` is classified **detach** in
  `web/src/lib/privacy/erasure-map.ts`: the override stays, the approver
  pointer is nulled, the audit row keeps the actor).
* **Dry run before the first live quarter:**
  `curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" "http://127.0.0.1:4001/api/cron/sector-multiples-refresh?dry=1" | jq .sources`
* **Tests:** `npx vitest run src/lib/valuation src/app/api/admin/sector-multiples src/app/api/cron/sector-multiples-refresh src/lib/privacy`.
* **Changing the static table by hand** is still possible
  (`sector-multiples-static.ts`), but the point of this module is that you
  should not need to — propose it with a source instead so the change is
  cited and audited.
