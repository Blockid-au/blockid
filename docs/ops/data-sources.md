# Open Australian data sources — licences, attribution, refresh (G14-S40)

**Owner:** CDO · **Since:** 2026-09-17 · **Tables:** `external_sources` (allow-list + licence register), `external_signals` (rows), `projects.abn` (join key), view `v_project_external_signals` — migration `web/supabase/migrations/0410_external_signals.sql`.
**Code:** `web/scripts/external-signals/` (ingest CLI + adapters + fixtures), `web/src/lib/signals/` (`external-sources.ts` catalogue + licence gate, `external-signals.ts` evidence mapping + register cohort, `external-signals-admin.ts`), `/admin/external-signals`, `/methodology` "Data sources".

The judge questions this answers: *"what historical / external data sits behind the score?"* and *"cohort percentiles need N ≥ 20"*. Every row on the register tables is a public fact about a **legal entity**, matched only by its checksum-valid ABN, stored as the register's own fields, licensed for that use, and attributed on the public methodology page. Nothing is scraped, nothing is derived into the table, and nothing about a founder as a person is stored.

## 1. The allow-list (what may be bulk-ingested)

Only sources whose `external_sources` row is `active` **and** carries a licence can be ingested. The CLI checks the row before reading a byte and also refuses when the adapter's declared licence differs from the row (someone edited one side). Everything else — an unknown id, `cite_only`, `disabled`, a blank licence — exits 3 with the reason in the summary.

| id | Source | Licence | Signal | Cadence | Attribution text (printed verbatim on /methodology) |
|---|---|---|---|---|---|
| `abr-bulk` | [ABN Bulk Extract](https://data.gov.au/data/dataset/abn-bulk-extract) — Australian Business Register, via data.gov.au | **CC BY 3.0 AU** | `abr_entity` — ABN status + from-date, entity type, legal name, state/postcode, ACN, GST status + from-date, DGR | weekly | *Contains ABN Bulk Extract data © Commonwealth of Australia (Australian Business Register, via data.gov.au), licensed under Creative Commons Attribution 3.0 Australia.* |
| `business-gov-grants` | [GrantConnect grant awards](https://www.grants.gov.au/Ga/List) — where business.gov.au programs (Accelerating Commercialisation, Industry Growth Program, Entrepreneurs Programme …) publish every award | **CC BY 3.0 AU** | `grant_award` — GA id, agency, program, activity, purpose (≤ 300 chars), value (AUD), approval / publish date, recipient, state/postcode | weekly | *Grant award data © Commonwealth of Australia (Department of Finance, GrantConnect grants.gov.au), licensed under Creative Commons Attribution 3.0 Australia.* |
| `rdti-transparency` | [R&D Tax Incentive transparency report](https://data.gov.au/data/dataset/research-and-development-tax-incentive) — ATO, via data.gov.au | **CC BY 2.5 AU** | `rdti_registration` — company name, ABN/ACN, total R&D expenditure (notional deductions less feedstock), amended total, income year | annual (report per income year) | *Research and Development Tax Incentive entity data © Commonwealth of Australia (Australian Taxation Office, via data.gov.au), licensed under Creative Commons Attribution 2.5 Australia.* |
| `funding-announcements` | Australian startup funding announcements — a BlockID-curated CSV of **public** announcements (company press releases, investor / media reports); every row links its published source. G24-B: the feed for `funding_round` signals → `funding_raised` outcome proposals (human-confirmed) and an IRI evidence row | **CC BY 4.0** (BlockID's compilation; facts link to their source) | `funding_round` — company name, ABN (checksum required), round, amount (AUD, required), announcement date, investors, headline, announced-by, source URL (https, required), state, sector | weekly (curated) | *Funding announcement data compiled by BlockID.au (© Auschain PTY LTD) from public company press releases and media reports; every row links to its published source. Compilation licensed under Creative Commons Attribution 4.0 International.* |

The seed values live in **one** place — `web/src/lib/signals/external-sources.ts` (`EXTERNAL_SOURCE_CATALOG`). Migration 0410 seeds the table from the same text (0435 adds the `funding-announcements` row) and `external-sources.test.ts` parses the SQL to keep them identical; the CLI's no-DB fallback (`SEED_SOURCES`) is pinned by the same test. To change a licence string: edit the catalogue, the migration seed, and re-apply 0410 (its `ON CONFLICT … DO UPDATE` refreshes the descriptive columns without touching `last_fetched_at` / `row_count` / `status`).

## 2. Cite-only (never bulk-ingested) — and why

| id | Source | Why cite-only |
|---|---|---|
| `cut-through-venture` | [Cut Through Venture — State of Australian Startup Funding](https://www.cutthroughventure.com/) | Commercial report, © Cut Through Venture / Folklore Ventures, all rights reserved. Aggregate figures may be quoted with a link to the published report; the dataset behind it is not licensed for redistribution or database loading. (The S-R5 comparables ingest reads CTV's public *monthly roundup pages* under the same rule — regex extraction of individual public raise announcements, each row pending admin review — not the report dataset.) |
| `startup-muster` | [Startup Muster annual report](https://www.startupmuster.com/) | Survey report, © Startup Muster, all rights reserved. Respondent-level data is never published; only headline statistics are quotable with attribution. |
| `acs-digital-pulse` | [ACS Australia's Digital Pulse](https://www.acs.org.au/insightsandpublications/reports-publications/digital-pulse.html) | © Australian Computer Society (produced with Deloitte Access Economics), all rights reserved. Macro figures (tech workforce, sector GVA) may be cited with a link. |

A cite-only row exists in `external_sources` precisely so the licence gate has something to refuse: `--source cut-through-venture` is not even a valid value, and a hand-edited adapter would still hit the row's `cite_only` status. `/methodology` lists them with the label "Cite only" so a reader sees the boundary.

## 3. What the rows become in a report

`lib/signals/external-signals.ts` → `signalsForAbn(abn)` maps rows to evidence rows for the project whose `projects.abn` matches (the ABN the founder verified through **POST /api/verification/abr**, persisted since S40):

| signal | dimension | label / value | status |
|---|---|---|---|
| `abr_entity` | **LCO** | "Australian Business Register — entity record": ABN active/cancelled since *date*, entity type, state, entity age in months, GST registered since *date* | `evidenced` when ACT; `partial` when cancelled; `stale` when the row was fetched > 400 days ago |
| `grant_award` | **IRI** (+ CGH) | "Grant award — *program* (*agency*)": A$ value, approval date, GA reference | `evidenced` |
| `rdti_registration` | **TRE** | "R&D Tax Incentive register — *income year*": an **expenditure band** (under A$100k · A$100k–500k · A$500k–2M · A$2M–10M · over A$10M) **plus the register's own figure**. Nothing beyond the register is ever derived — no burn, no headcount, no "R&D intensity" number. | `evidenced`; `partial` when the register has no figure |

Every row carries `source: "external"`, `origin: "connector"`, `source_url`, `as_of`. The S36 cap (`capConfidence({ origin: "connector" })`) places them at **`connected_source`** — a register can never make a row `third_party_verified`; only a human reviewer can. A name-only match (`match_confidence: "low"`, R&DTI rows that list an ACN instead of an ABN) is never `evidenced`.

GATHER (`lib/report-pipeline/gather.ts`, source `externalSignals`) adds the rows for any project with a verified ABN; a project without one is `skipped` with the note "no verified ABN" — the founder's next action is the ABN check, not a data fix.

## 4. The register cohort (percentiles with N ≥ 20)

`computeCohortPercentile` (`lib/agents/cohort-percentile.ts`) now has three rungs, in order:

1. **`real_cohort`** — ≥ 20 `svi_index_snapshots` rows within ±1 stage in the last 180 days → strict SVI percentile (unchanged).
2. **`register_cohort`** (S40) — fewer than 20 snapshots, the project has a verified ABN, and `cohortFromRegisters` finds ≥ 20 register entities → the project's **register maturity score** percentile within that cohort. Score 0–100, transparent: entity age (≤ 60 pts, 10 years = 60) + ABN active 5 + GST active 10 + grants (10 for the first, 5 each extra, ≤ 15) + R&DTI registered 10. Only entities with an ABR age anchor count (`n`), so the cohort is real AU entities, not a static table. Surfaces label it "register cohort — N AU entities on the ABR / grant / R&DTI registers"; it never overwrites `percentileRank` (it is a positioning proxy, not an SVI rank).
3. **`benchmark_fallback`** — the static SVI_BENCHMARKS table, labelled "benchmark estimate" (unchanged).

The cohort grows with the allow-set: every grants / R&DTI recipient ABN is added to the ABR allow-set on the next `abr-bulk` run, which supplies the age anchor.

## 5. How to refresh

All inputs live **outside the repo** in `~/blockid-data/external-signals/<source-id>/` (override with `--data-dir` or `EXTERNAL_SIGNALS_DATA_DIR`) so the server's periodic hard reset never touches multi-GB files. The weekly cron (Sat 03:00 UTC, `web/scripts/crontab.production`) only re-reads the newest file per source; **downloading is a deliberate founder step**:

```bash
# 0. once: apply the migration, confirm the ledger
scripts/db/apply-migration.sh web/supabase/migrations/0410_external_signals.sql
node web/scripts/db/migration-status.mjs

# 1. R&DTI (0.7 MB xlsx → csv via openpyxl; safe any time)
node web/scripts/external-signals/ingest.mjs --source rdti-transparency --fetch

# 2. GrantConnect — the site serves non-browser clients a 403, so export by hand:
#    https://www.grants.gov.au/Ga/List → Advanced search → Export (CSV, "Grant Award"),
#    save as ~/blockid-data/external-signals/business-gov-grants/ga-export-YYYY-MM-DD.csv
node web/scripts/external-signals/ingest.mjs --source business-gov-grants

# 2b. Funding announcements (G24-B) — curate the sheet by hand from public press
#     releases / media (Company, ABN, Round, Amount (AUD), Announced, Investors,
#     Headline, Announced By, Source URL — see fixtures/funding-sample.csv), save as
#     ~/blockid-data/external-signals/funding-announcements/funding-YYYY-MM-DD.csv.
#     Rows without a checksum-valid ABN, an AUD amount or an https source are skipped.
node web/scripts/external-signals/ingest.mjs --source funding-announcements
#     The outcome-signals cron then proposes `funding_raised` for the matched
#     project (proposals only — an admin confirms on the outcome ledger).

# 3. ABR bulk extract — ~2 GB of zips, OFF-PEAK ONLY (deploy window rules apply).
#    The allow-set = projects.abn ∪ project_grant_profiles.abn ∪ ABNs already on
#    external_signals (grants + R&DTI recipients) ∪ --abn-file. Run 1 + 2 first so
#    the register cohort has entities to anchor on.
node web/scripts/external-signals/ingest.mjs --source abr-bulk --fetch [--abn-file ~/extra-abns.txt]

# 4. commit web/content/reports/external-signals-latest.json + external-signals-history.jsonl
#    (the chore(ops): logs sweep picks them up) so the release carries the last run
```

Useful flags: `--dry` (parse + gate + dedupe, write nothing — forced when `web/.env` has no Supabase keys), `--limit N` (stop after N parsed rows per source; for `abr-bulk` the limit counts records *scanned*, so a smoke run still finds allow-listed rows), `--file <path>` (one explicit input for one `--source`), `--json` (machine-readable summary). Re-running is idempotent: `content_hash` is unique, the insert is `upsert … ignoreDuplicates`, and the summary reports `dupes`.

A dry smoke run that needs no network and no DB:

```bash
node web/scripts/external-signals/ingest.mjs --dry --source business-gov-grants --file web/scripts/external-signals/fixtures/grants-sample.csv --limit 5
```

## 5b. Operations notes (2026-09-17)

- **First ingest numbers:** R&DTI transparency 13,128 rows; ABR bulk 12,827 entities, ingested from **all 20 split files** in the extract directory (not just the newest single file — the extract ships as 20 XML parts and the allow-set spans every known ABN across all of them).
- **The weekly cron line needed a heap bump.** The first `abr-bulk` run OOM'd at Node's default (~1 GB) heap; `web/scripts/crontab.production` now runs `nice -n 15 node --max-old-space-size=6144 --env-file=.env scripts/external-signals/ingest.mjs` (6 GB heap, niced so it never contends with request-serving Node processes, `.env` loaded via `--env-file` rather than dotenv).
- **`abr-bulk` defaults to the whole extract directory**, not the newest single file — a partial run against one split file silently under-counted the allow-set on the first attempt.
- **The multi-GB ABR XML is deleted after each ingest** (it lives outside the repo under `~/blockid-data/external-signals/abr-bulk/` and is not something the periodic server reset should ever have to account for); the next scheduled run re-fetches it fresh with `--fetch`.
- **GrantConnect still needs a manual CSV export** — the site 403s non-browser clients, so `business-gov-grants` stays a by-hand step (§5 step 2) until a founder automates the export.

## 6. Operating rules

- **Never** add a source by editing an adapter alone — the row in `external_sources` (via the catalogue + migration) is the licence record; the CLI refuses a mismatch.
- **Never** store a derived figure in `external_signals.value`; the report layer bands / labels at read time so a licence reviewer can diff the table against the register.
- Sole traders in the ABR extract are individuals: the adapter keeps `initial + family name` only (`individual: true`), and the platform never joins that to a founder profile.
- `/api/status` is unchanged; ingest health is visible on `/admin/external-signals` (last run, per-source counts, refused sources) and in `/tmp/blockid-external-signals.log`.
- Erasure: rows are keyed by ABN (entity), not by user; erasing an account removes the project (and its `projects.abn`) while the entity rows remain public register data.
