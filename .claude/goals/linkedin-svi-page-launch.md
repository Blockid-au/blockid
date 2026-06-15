# LinkedIn Page Launch — Startup Value Index (SVI)

**Owner:** CMO  ·  **Created:** 2026-06-15  ·  **Parent brand:** BlockID.au (Auschain PTY LTD, ABN 79 659 615 111)
**Linked to 30-day plan:** [[30day-validation-mvp]] — KPI: 100 LinkedIn leads, 12 posts.
**Linked task:** project-state.json T0211 (CMO) — Launch & populate SVI LinkedIn page.

## Why a separate page (not just blockid.au)

The 30-day plan revolves around the **free Startup Value Index** as the top-of-funnel lead magnet. "What's my startup worth?" is the question founders search for — not "BlockID". A product-brand page lets us:

1. Post benchmark/valuation insights without diluting the BlockID corporate feed.
2. Capture LinkedIn search traffic on "startup value index", "startup valuation Australia", "SME valuation index".
3. Run the 7 content pillars at higher cadence (3 posts/week → 12 posts in 30 days = KPI met).
4. Cross-link to blockid.au/dashboard for conversion.

## Pre-flight checklist (do these in this order)

1. Confirm you're logged in to LinkedIn as an admin of the personal profile that will own the page.
2. Have the Auschain PTY LTD ABN ready: **79 659 615 111** (LinkedIn asks for legal entity).
3. Logo (300×300 PNG, transparent) + banner (1128×191 PNG) — see §Visual Assets.
4. Page URL slug planned: `startup-value-index` → resulting URL `linkedin.com/company/startup-value-index`.

## Step-by-step page creation (≈ 10 min)

### 1. Open the creation form
- Navigate to: **https://www.linkedin.com/company/setup/new/**
- Select page type: **"Company"** → Size: **"2-10 employees"** (small enough to qualify as Showcase later if needed).

### 2. Page identity — paste exactly these values

| Field | Value |
|---|---|
| Name | `Startup Value Index` |
| LinkedIn public URL | `linkedin.com/company/startup-value-index` |
| Website | `https://blockid.au` |
| Industry | `Financial Services` (primary). Add `Software Development` as secondary if 2 industries allowed. |
| Company size | `2-10 employees` |
| Company type | `Privately held` |
| Tagline (120 char limit) | `The Australian benchmark for startup & SME value — measure it, grow it, prove it.` |

Tick the box confirming you have the right to act on behalf of this company.

### 3. About section (paste in "About")

```
Startup Value Index (SVI) is the Australian benchmark that tells founders and SME owners what their business is actually worth — and what's driving (or capping) that value.

Built and operated by Auschain PTY LTD (ABN 79 659 615 111, Sydney) and powered by the BlockID.au platform, SVI scores businesses across 13 dimensions: revenue strength, growth momentum, market attractiveness, team capability, operational maturity, investor readiness, financial quality, competitive position, customer concentration, unit economics, governance, IP defensibility, and capital efficiency.

We follow stock-index methodology (Nikkei / Dow Jones): no upper cap, base-period weighting, continuously enriched as more data points are added. The result is a number you can track — and that investors, advisors, and acquirers recognise.

Free for founders: take the SVI assessment, get your score, see what moves it.
Paid for advisors / investors: benchmark cohorts, side-by-side comparisons, deep valuation reports.

Try the free Startup Value Score → https://blockid.au

We publish weekly benchmark insights from the Australian startup & SME dataset. Follow for:
• What founders are actually willing to pay for valuation clarity
• Why most startups are not investor-ready (and the 5 things that fix it)
• Common SME valuation mistakes that cost owners 30%+ at exit
• How AU investors really score private companies
• Cap-table and ownership clarity for first-time founders
• Business health & growth-readiness signals
• SVI cohort benchmarks (sector, stage, geography)

Australian-born. Privacy Act compliant. ASIC-aware (general information only — not personal financial advice).
```

### 4. Specialties (max 20 tags — paste comma-separated)

```
startup valuation, SME valuation, business valuation, Australian startups, valuation benchmark, investor readiness, business health check, cap table, ESOP, term sheet analysis, financial modelling, founder education, startup index, equity, fundraising, due diligence, growth metrics, unit economics, market sizing, AI valuation
```

### 5. Confirm + verify
LinkedIn sends a verification request to the page admin email. Approve it. The page is now live (empty).

## Visual assets (upload immediately after creation)

### Logo — 300×300 PNG, transparent background
- Mark: stylized "SVI" letters in slate-900 (`#0f172a`) inside a subtle index-chart up-arrow.
- Save as: `web/public/svi-logo-square.png` and `web/public/svi-logo-square.svg` (for site reuse).
- If not designed yet: temporarily use the BlockID logo with "SVI" overlay until media-studio agent ships v1.

### Banner — 1128×191 PNG (LinkedIn cover dimensions)
- Headline text (right side, large): **"What's your startup worth?"**
- Sub-headline (smaller): **"Take the free Startup Value Index — Australia's benchmark."**
- Background: slate gradient `#020617 → #1e293b` with a stylized index line going up-right.
- CTA badge bottom-right: `blockid.au` in white.
- Save as: `web/public/svi-linkedin-banner.png`.

> **Action item for media-studio agent:** queue both assets at AI image gen (1× logo, 1× banner) — see T0211 in project-state.json.

## Founding admins / Page roles

| Role | Who | Purpose |
|---|---|---|
| Super Admin | Founder (personal LinkedIn) | Cannot lose — keeps control |
| Content Admin | CMO operator / VA | Day-to-day posting |
| Analytics Manager | CDO operator | Pulls follower / engagement data into BlockID dashboard |

Add admins via: page → **Settings** → **Manage admins** → **Add admin**.

## Wire the page into the existing auto-post pipeline

After the page is created, get the numeric Page ID:
1. From the page admin view, the URL is `https://www.linkedin.com/company/<PAGE_ID>/admin/`. Copy the numeric `PAGE_ID`.
2. Generate a long-lived `w_organization_social` access token via LinkedIn Developer console (create a new app linked to the SVI page).

Then on the server:

```bash
# /home/dovanlong/blockid.au/web/.env (NEVER commit)
echo "LINKEDIN_PAGE_ID=<paste-numeric-id>" >> web/.env
echo "LINKEDIN_PAGE_ACCESS_TOKEN=<paste-token>" >> web/.env
```

The existing `/api/cron/linkedin-page-post` route (web/src/app/api/cron/linkedin-page-post/route.ts) reads those two vars and posts the next item from the content queue. No code change required.

## First-14-day content calendar (one post / weekday for 2 weeks)

All copy lives in `web/content/linkedin-svi-page-content-pack.json` — the `linkedin-page-post` cron can pull from it directly. Posting cadence: **Mon/Wed/Fri 09:00 AEST** to start, scale to daily once page > 500 followers.

| Day | Pillar | Hook (first 8 words show in feed preview) |
|---:|---|---|
| 1 | Worth-question | What's your startup worth? Most founders guess. |
| 2 | Investor-ready | 5 reasons your deck won't get a second meeting. |
| 3 | SVI launch | We open-sourced the Australian Startup Value Index. |
| 4 | SME mistakes | The 30% SME owners lose at exit — and why. |
| 5 | Investor lens | How AU investors actually score private companies. |
| 6 | Cap-table | Your cap table is your story. Most founders don't realise. |
| 7 | Health check | 7 signals your business is investor-ready (or not). |
| 8 | Benchmark | First SVI cohort data: AU pre-seed median = X. |
| 9 | Founder education | The $10k question every founder must answer at Series A. |
| 10 | SME mistakes | "Multiple of EBITDA" — 4 ways founders get it wrong. |
| 11 | Investor lens | The 13 dimensions we score (and why ARR isn't one). |
| 12 | Cap-table | ESOP done wrong: the Division 83A trap. |
| 13 | Health check | Quiz: how many of these 7 are true for your startup? |
| 14 | Worth-question | One year ago your valuation was X. Now what? |

Full post bodies + hashtags + image suggestions live in the JSON pack (machine-readable for the cron).

## After page is live — handoff back to CMO agent

Update `web/.env` with the two LinkedIn vars, then mark T0211 as in_progress in `project-state.json`. The CMO agent will:

1. Detect the new env vars on next orchestrator cycle.
2. Pull from `web/content/linkedin-svi-page-content-pack.json`.
3. Auto-post the next scheduled item via `/api/cron/linkedin-page-post`.
4. Track engagement → `web/content/reports/linkedin-svi-engagement.jsonl` (the cron writes this).
5. Daily CMO brief surfaces follower delta + top post + next 3 scheduled items.

## Stop / handover criteria

This goal doc retires when:
- Page hits 100 followers (CMO 30-day KPI met for LinkedIn leads source).
- ≥ 12 posts published in 30 days.
- 1 post with > 50 reactions (signal: pillar works).
- Cross-channel attribution shows ≥ 10 paying customers came from LinkedIn.

Then CMO graduates from "launch & populate" → "scale & nurture" mode (longer-form articles, founder interviews, podcast clips).

## Compliance notes (CLO sign-off)

- All posts include the standing disclaimer: _"General information only. Not personal financial advice. SVI is a benchmark index, not a regulated valuation under ASIC RG 111."_ — append to every post tagged `#valuation` or `#fundraising`.
- Privacy Act: any user data discussed in posts must be aggregated / de-identified.
- No claims of guaranteed returns or specific share-price predictions.

See [[au-compliance]] skill if any post crosses into advice territory.
