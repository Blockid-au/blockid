# Atlassian — Executable usecase spec

**Target**: Atlassian Corporation (NASDAQ: TEAM). Sydney → NASDAQ.

**Research brief**: [docs/showcase/atlassian/RESEARCH.md](../../showcase/atlassian/RESEARCH.md)
(25 KB, every claim URL-cited).

**Read view (live)**: [/showcase/atlassian](https://blockid.au/showcase/atlassian)

**Compliance verified**: 2026-07-21 — au-compliance skill review pending
(queued for next loop tick).

---

## 1. Public source register

Every field in the simulation dataset below is drawn from ONE of these
public sources. No paywalled paraphrase. No private-figure PI.

| Source | Type | URL |
|---|---|---|
| SEC EDGAR CIK 0001650372 — filing index | Regulatory primary | https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001650372 |
| Atlassian F-1 (2015-11-09) | Registration statement | https://www.sec.gov/Archives/edgar/data/1650372/000104746915008450/a2226437zf-1.htm |
| Atlassian 424B4 prospectus (2015-12-10) | IPO prospectus | https://www.sec.gov/Archives/edgar/data/1650372/000104746915009143/a2226831z424b4.htm |
| Atlassian FY24 Annual Report | Regulatory primary | https://www.sec.gov/Archives/edgar/data/1650372/000165037224000049/team2024annualreport.pdf |
| Atlassian FY25 10-K | Regulatory primary | https://www.sec.gov/Archives/edgar/data/1650372/000165037225000036/team-20250630.htm |
| Accel Partners investment announcement (2010-07-14) | Company press release | https://www.atlassian.com/blog/news/2010/07/atlassian_closes_60_million_investment_from_accel_partners |
| Trello acquisition announcement (2017-01-09) | Company press release | https://www.atlassian.com/company/news/press-releases/atlassian-to-acquire-trello-to-expand-teamwork-platform0 |
| Loom acquisition announcement (2023-10-12) | Company press release | https://www.businesswire.com/news/home/20231012832576/en/Atlassian-to-Acquire-Loom-to-Supercharge-Team-Collaboration |
| Delaware redomiciliation announcement (2022-10-03) | Company press release | https://www.businesswire.com/news/home/20221003005143/en/ |
| Founder 20-year retrospective (2022) | Company blog (founder-authored) | https://www.atlassian.com/blog/announcements/atlassian-founders-20-years-20-lessons |

*Anything not in this list must not appear in the usecase dataset.*

---

## 2. Two-way phase mapping

### Case → BlockID.au

| Atlassian year/event | BlockID.au phase | Notes |
|---|---|---|
| 2002 Cannon-Brookes + Farquhar bootstrap | **1 Vision** | Perfect fit — SVI first entry |
| 2002 Jira v1.0 launched | **4 MVP** | Fit; product-led-growth flag |
| 2003 American Airlines self-serve US$1M | **5 PMF** | Fit; add PLG evidence to SVI 13-criteria |
| 2005 First profitable year + ShipIt hackathon | **6 Revenue** + **8 Team & Culture** | Two phases in one year — cadence mapping |
| 2006 Atlassian Foundation + Pledge 1% | **8 Team & Culture** | Fit |
| 2010 Accel US$60M (100% secondary) | **10 Fundraise** | *Adjustment needed on BlockID.au side*: current model treats fundraise as primary-share dilution. **Add secondary-only round modality** to the fundraise phase |
| 2010 Bitbucket M&A | **11 Post-Funding / Growth Scale** | Fit |
| 2012 Board scales (Doug Burgum Chair) | **8 Team & Culture** (governance) | Fit |
| 2014 T. Rowe Price US$150M secondary | **10 Fundraise** | Second secondary — same modality as above |
| 2014 UK Plc reorganisation | *No existing phase* | **NEW phase 9.5**: pre-IPO corporate restructuring. Add to BlockID.au roadmap |
| 2015-12-10 IPO NASDAQ:TEAM | **10 Fundraise** (public) | Fit |
| 2017 Trello US$425M M&A | **11 Post-Funding / Growth Scale** | Fit |
| 2022 UK Plc → Delaware C-corp | **12 Exit / Beyond** (governance) | Fit; adjust phase 12 to include "corporate structure evolution" as a growth-mode not just exit-mode |
| 2023 Loom US$975M M&A | **11 Post-Funding / Growth Scale** | Fit |
| 2024 Rovo AI + Cannon-Brookes sole CEO | **11 Post-Funding / Growth Scale** | Fit |

### BlockID.au → Case (what to copy, what to skip)

| BlockID.au phase | Copy from Atlassian | Skip |
|---|---|---|
| 1 Vision | UNSW co-founder pattern; 50/50 split; explicit anti-suit values | — |
| 2 Idea Validation | Product-led hypothesis + self-serve pricing | — |
| 3 Market Research | Enterprise software market analysis, competitor benchmarking | — |
| 4 MVP | Low-price self-serve; no salespeople; downloadable | — |
| 5 PMF | Wait for inbound self-serve buyers; measure NPS | — |
| 6 Revenue | Profitability from year 1, no burn | Only copy if you can — most B2B SaaS burn at first |
| 7 Growth | Weekly SVI-refresh, GA4 funnel + PLG metrics | — |
| 8 Team & Culture | ShipIt hackathon, Pledge 1%, 5 values codified early, board of independents from year ~10 | — |
| 9 Funding-Ready | Bootstrap discipline; only raise if you want liquidity | Do NOT delay raise for 8 years unless you're profitable |
| 9.5 Corporate structure | UK Plc chassis if targeting NASDAQ dual-class; else Delaware C-corp direct | Do NOT do multi-country if smaller |
| 10 Fundraise | Secondary-first if profitable; dual-class Class B/Class A | Do NOT do secondary if founders don't need liquidity |
| 11 Post-Funding / Scale | 90% cash + 10% retention equity M&A pattern; buyback programs at scale | — |
| 12 Exit / Beyond | Redomiciliation to preferred listing jurisdiction | Do NOT if smaller than US$3B market cap |

---

## 3. Simulation dataset

If the goal loop schedules this usecase for **live workspace simulation**
(per U.4 sandbox mechanism), it creates a `projects` row with:

```
is_showcase = true
is_usecase = true
usecase_slug = 'atlassian'
name = 'Atlassian (usecase simulation)'
industry = 'Enterprise SaaS'
stage = 'growth'  -- current phase
```

Then seeds the following in-workspace artefacts (all data drawn from
the public source register above):

### SVI 13-criteria inputs (as of each phase transition)

| Phase | SVI input | Value | Source |
|---|---|---|---|
| 1 Vision | Founder-market fit | 5/5 (both UNSW CS, built earlier ventures) | Wikipedia |
| 4 MVP | Product working | Jira v1.0 downloadable | atlassian.com blog |
| 5 PMF | First 10 customers | American Airlines + others via self-serve | 20-year retrospective |
| 6 Revenue | ARR | US$1M year 1 → US$50M ARR year 8 | indiehackers post + 10-K |
| 7 Growth | Weekly signups | Undisclosed in early years; F-1 discloses 48K customers by 2015 | F-1 |
| 8 Team | Headcount | 2→225→1,250→13,813 (2002/2010/2015/2025) | Multiple |
| 10 Fundraise | Round size + valuation | $60M @ ~$400M (2010) → $150M @ $3.3B (2014) → $462M IPO @ $4.4B (2015) | Press + F-1 + 424B4 |
| 11 Scale | Acquisitions | Bitbucket (2010, undisc) → Trello ($425M) → Loom ($975M) | Press releases |

### Cap-table snapshots (already tabulated in RESEARCH.md §3)

Loaded into the simulation cap-table module at 5 discrete moments —
founding, pre-Accel, pre-IPO, post-IPO, today.

### ESOP schedule

Loaded from RESEARCH.md §4 — 2015 Share Incentive Plan, 20.7M Class A
reserve, evergreen, 4-year vesting standard, retention grants at M&A.

### Board composition timeline

Loaded from RESEARCH.md §6 — 6 rows across 22 years.

### Reports catalogue

`data_room` module seeded with placeholder rows referencing the public
filings above (title + date + source URL only — no PDF ingestion,
respecting copyright).

---

## 4. Autonomous execution steps (goal loop picks up)

The reseller-goal-loop.mjs cron picks this usecase on a future tick and
executes:

1. **au-compliance skill review** — verify every field in the dataset
   above traces to the public source register. Any orphan claim → mark
   NOT FOUND, do not seed. Verdict logged to
   `web/content/reports/usecase-compliance-atlassian.jsonl`.
2. **Migration**: add columns `projects.is_usecase bool default false`
   and `projects.usecase_slug text`. Only when this file marks it as
   the next migration (`0102_usecase_flags.sql`).
3. **Seed sandbox project** via a new endpoint
   `POST /api/showcase/atlassian/seed` (idempotent — checks
   `is_usecase=true AND usecase_slug='atlassian'` existence).
4. **Populate** SVI inputs, cap-table snapshots, ESOP, board, data-room
   metadata as per §3 above.
5. **Render** `/showcase/atlassian` (already live) + add a "View live
   simulation" CTA linking to `/workspace/<sandbox_project_id>` when
   the seed succeeds.
6. **Compliance banner** — every usecase page shows
   "Sources: <n> public filings + press releases. See
   docs/usecases/atlassian/USECASE.md §1."
7. **Retention** — usecase workspace is `is_showcase=true` so it never
   appears in a real customer's project list; it lives under the
   admin `admin@blockid.au` account.

---

## 5. Adjustments to BlockID.au's own 12-phase model surfaced by this usecase

Loop should propose these plan-file amendments (via `docs/plans/reseller-module-plan.md` § U-series):

- **Add phase 9.5 "Corporate structure evolution"** to the 12-phase
  journey — currently missing, but Atlassian's UK-Plc-then-Delaware
  path shows it's a distinct workflow between funding-ready and
  fundraise.
- **Extend phase 10 fundraise modality** to include
  `secondary_only` (not just `primary_dilution` and `mixed`). Both
  Atlassian pre-IPO rounds fit `secondary_only`.
- **Extend phase 12 exit** to include `redomiciliation` (not just
  `IPO`/`acquisition`/`buyback`).
- **Extend SVI 13-criteria** with "PLG maturity" as a scored dimension.
  Atlassian's zero-sales-team story exposes this gap.

Once the loop applies these adjustments, this usecase's mapping table
above collapses (fewer "adjustment needed" rows). The usecase library
therefore drives BlockID.au's own roadmap evolution — a feedback loop
where real-world data trains the platform's phase model.
