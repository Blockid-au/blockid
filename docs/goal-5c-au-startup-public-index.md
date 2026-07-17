# Goal 5C — AU-Startup Public Index

**Owner:** CMO (primary) + CTO + CPO (co-owners)
**Status:** Planned — Q1 2027 target
**Baseline:** v2.0.0-beta.7 (git sha `1e747b4`)
**Source:** `docs/IMPLEMENTATION-PLAN-v3.1-amended.md` §4 Goal 5C
**Task ID range:** `T-1301` .. `T-1315`
**Size:** 6 weeks (was 4 weeks in v3.1 — extended to include saved-search wiring, submit-your-startup form, and per-listing detail polish)

---

## 1. SEO thesis

Australian founder tooling is fragmented. Founders searching for competitor data, cap-table benchmarks, or peer valuations bounce between Crunchbase (US-heavy, patchy AU coverage), LinkedIn (unstructured), F6S (application-focused, weak listing pages), AngelList (US-centric with limited AU presence), and ASIC's Connect (raw filings, no UX). None of them offers a fast, Google-indexable, AU-focused index of startups with quantitative scoring.

BlockID.au already produces the SVI score. The public index turns each SVI score into an indexable page. Every founder who Googles a competitor lands on `blockid.au/listings/<ticker>` and gets an authoritative AU-focused profile with SVI, cap table snapshot (opt-in), team, and funding history. Every listing is an inbound funnel: "how did competitor X score" → land on our page → "score yours" CTA.

### 1.1 Competitive gap

| Site | AU coverage | Structured score | Founder self-serve | Public URL per startup |
|------|-------------|------------------|-------------------|------------------------|
| Crunchbase | ~30% of AU startups | No (Rank is proprietary + paywalled) | No (curated only) | Yes but paywalled |
| LinkedIn | High | No | Yes (company pages) | Yes (unstructured) |
| F6S | ~50% | No | Yes | Yes but SEO-thin |
| AngelList (Talent) | Low | No | Yes | Yes |
| ASIC Connect | 100% | No | N/A (regulatory) | No |
| **BlockID.au /listings** | Growing (target 100 in 60 days) | **Yes (SVI)** | **Yes** | **Yes (SEO-optimised)** |

The wedge is the SVI score as a structured, comparable, sharable metric. Google-friendly URLs plus JSON-LD `Dataset` markup make each listing an inbound entry.

### 1.2 Search intent → landing pathway

Target keywords, in priority order:

1. `"<startup name>" australia` (branded competitor lookup) — highest intent.
2. `"<startup name>" valuation` — investor / analyst intent.
3. `"<startup name>" cap table` / `"<startup name>" funding` — investor intent.
4. `australian startup index` — top-of-funnel discovery.
5. `startups in <city>` / `startups in <state>` — geographic discovery.
6. `<industry> startups australia` — vertical discovery.
7. `svi score <startup name>` — brand-attached long-tail.

Landing pages:

- Head query 1-3: `/listings/<ticker>` per-startup detail page.
- Head query 4: `/index` top-level list with faceted filters.
- Head query 5-6: `/index?state=NSW` / `/index?industry=fintech` (canonical to `/index` with query preserved in JSON-LD).

### 1.3 Moat characteristic

Each new listing improves search-engine crawl signal for the entire index (more internal links, more corpus depth for query understanding). The moat compounds: at 100 listings the index is indexed for ~500 distinct queries; at 1000 listings, ~10,000 queries. Fragmented competitors do not have the SVI score wedge and cannot catch up without rebuilding the scoring pipeline.

---

## 2. Architecture

### 2.1 Route map

```
/index                       (top-level list — SEO index page, canonical URL)
/index?q=<search>            (search results, canonical to /index)
/index?state=<state>         (facet)
/index?industry=<industry>   (facet)
/index?stage=<stage>         (facet)
/index?score_min=<n>         (facet)
/listings/[ticker]           (per-listing detail — SEO detail page, canonical)
/listings/[ticker]/team      (deep-link to team section)
/listings/[ticker]/funding   (deep-link to funding history)
/submit                      (submit-your-startup form)
/api/index/search            (JSON search API for /index client-side filter)
/api/index/submit            (POST from submit form)
/api/index/subscribe         (POST from saved-search)
```

### 2.2 Data model

```
public_listings (
  ticker text primary key,            -- ASX-style short code, 3-5 chars, uppercase
  user_id uuid not null,              -- owner (founder who claimed the listing)
  startup_name text not null,
  slug text not null,                 -- URL-safe kebab-case
  logo_url text,
  tagline text,
  description text,                   -- markdown, up to 2000 chars
  state text,                         -- NSW, VIC, QLD, etc.
  city text,
  industry text,                      -- fintech, healthtech, saas, etc.
  stage text,                         -- idea, mvp, revenue, growth, scale
  founded_year integer,
  employees_range text,               -- 1-10, 11-50, 51-200, etc.
  svi_score numeric,                  -- current composite score
  svi_last_computed_at timestamptz,
  website_url text,
  linkedin_url text,
  is_public boolean not null default false,     -- founder opt-in
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

public_listing_funding (
  funding_id uuid primary key default gen_random_uuid(),
  ticker text not null references public_listings(ticker),
  round_type text not null,            -- pre-seed, seed, series-a, ...
  amount_aud numeric,
  currency text default 'AUD',
  closed_at date,
  lead_investor text,
  other_investors text[],
  source_url text                      -- where the founder attests / press link
);

public_listing_team (
  member_id uuid primary key default gen_random_uuid(),
  ticker text not null references public_listings(ticker),
  name text not null,
  role text,
  linkedin_url text,
  bio text,
  display_order integer
);

public_listing_svi_history (
  history_id uuid primary key default gen_random_uuid(),
  ticker text not null references public_listings(ticker),
  svi_score numeric not null,
  criteria_scores jsonb,               -- 13-criteria breakdown
  computed_at timestamptz not null
);

saved_searches (
  search_id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  query text,                          -- the search query string
  filters jsonb,                       -- { state, industry, stage, score_min }
  digest_frequency text not null,      -- daily | weekly
  created_at timestamptz not null default now(),
  last_sent_at timestamptz,
  is_active boolean not null default true
);
```

`watchlist_digest` table (per v3.1 amendment) is reused for the saved-search digest emails. New `saved_searches` table stores the search criteria; digest cron reads it, joins against `public_listings` for matches, emails the user.

### 2.3 Ticker generator

Ticker = uppercase 3-5 character short code, ASX-style. Generation algorithm:

1. Founder submits startup name.
2. Server proposes ticker by:
   a. Take first letter of each word (max 5 words).
   b. If < 3 letters, pad with consonants from the first word.
   c. Uppercase.
3. Server checks uniqueness against `public_listings.ticker`.
4. If collision, server proposes 3 alternatives with a numeric suffix (max 1 digit) or a consonant swap.
5. Founder picks one; ticker is reserved.
6. Founder cannot change ticker after 24h.

Example:
- "BlockID Australia" → `BID` (3 letters).
- "Auschain Pty Ltd" → `ASC`.
- "Cake Equity" → `CAKE` or `CEQ`.
- "Nine Startups Inc" → `NINE`.

Reserved prefixes (no listing may use): `TEST`, `ADMIN`, `SYS`, `NULL`, `TICKER`, `INDEX`. Plus every 3-letter ASX-listed company ticker to avoid confusion (fetched at build time from ASX's public ticker CSV; MUST NOT re-use).

### 2.4 The `/index` page

Server-rendered top-level list, paginated at 50 per page.

Layout:

```
┌────────────────────────────────────────────────────────────┐
│  Australian Startup Index                                  │
│  Live SVI-scored index of AU startups. 234 listings.       │
│  ───────────────────────────────────────────────────────── │
│                                                            │
│  Search: [__________________________]  [Filters ▾]         │
│                                                            │
│  Filters (drawer): State | Industry | Stage | Min SVI      │
│  ───────────────────────────────────────────────────────── │
│                                                            │
│  Ticker   Name              SVI    Stage    State   Ind.  │
│  ─────────────────────────────────────────────────────    │
│  BID      BlockID.au        87.4   Growth   NSW     Fintch│
│  ASC      Auschain          82.1   Scale    NSW     Fintch│
│  ...                                                       │
│                                                            │
│  [ Load more ]        [ Save this search ] [ Submit ]      │
└────────────────────────────────────────────────────────────┘
```

Row click → `/listings/<ticker>`. Score column colour-coded green/amber/red per SVI band.

Client-side filtering via `/api/index/search`; initial 50 rows rendered server-side with full HTML for SEO.

### 2.5 The `/listings/[ticker]` detail page

Full server-rendered page. Structure:

```
┌────────────────────────────────────────────────────────────┐
│  [Logo] BlockID.au (BID)                                   │
│  Sydney, NSW • Fintech • Growth stage • Founded 2022       │
│                                                            │
│  SVI Score: 87.4    [Sparkline of last 90 days]            │
│  ───────────────────────────────────────────────────────── │
│                                                            │
│  About                                                     │
│  [Description markdown]                                    │
│                                                            │
│  SVI breakdown (13 criteria)                               │
│  [Bar chart per criterion]                                 │
│                                                            │
│  Team                                                      │
│  [Founder + team members with roles + LinkedIn links]      │
│                                                            │
│  Funding history                                           │
│  [Table: round | amount | date | lead]                     │
│                                                            │
│  Comparable set                                            │
│  [3-5 other listings in same industry/stage,               │
│   SVI scores side by side]                                 │
│                                                            │
│  [ Score my startup — free ]                               │
│  [ Add to watchlist ]  [ Contact founder ]                 │
│                                                            │
│  Source: SVI computed 2 hours ago from workspace data      │
└────────────────────────────────────────────────────────────┘
```

### 2.6 JSON-LD markup

Each `/listings/[ticker]` page emits three JSON-LD blocks:

**Block 1 — Organization**

```
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "BlockID.au",
  "url": "https://blockid.au",
  "logo": "https://blockid.au/logos/bid.png",
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "Sydney",
    "addressRegion": "NSW",
    "addressCountry": "AU"
  },
  "foundingDate": "2022",
  "sameAs": ["https://linkedin.com/company/blockid-au"]
}
```

**Block 2 — Dataset (SVI history)**

```
{
  "@context": "https://schema.org",
  "@type": "Dataset",
  "name": "BID SVI history",
  "description": "Startup Viability Index score history for BlockID.au",
  "creator": { "@type": "Organization", "name": "BlockID.au" },
  "measurementTechnique": "13-criteria weighted composite score",
  "distribution": [
    {
      "@type": "DataDownload",
      "contentUrl": "https://blockid.au/api/index/BID/svi-history",
      "encodingFormat": "application/json"
    }
  ]
}
```

**Block 3 — BreadcrumbList**

```
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Index", "item": "https://blockid.au/index" },
    { "@type": "ListItem", "position": 2, "name": "BID", "item": "https://blockid.au/listings/BID" }
  ]
}
```

`/index` page emits `ItemList` schema listing all indexed listings for graph discovery.

### 2.7 Comparable set

For each listing, compute a "comparable set" of 3-5 other listings:

- Same industry OR adjacent industry.
- Same stage OR adjacent stage.
- SVI score within +/- 15 points.
- Excludes listings not `is_public = true`.

Computed at read time (cached 1h). Displayed as a table with SVI scores side by side. This is the highest-CTR internal-linking mechanism for lifting page rank across the whole index.

### 2.8 Saved search + digest

Founder or investor navigates `/index`, applies filters, clicks "Save this search". Backend creates a `saved_searches` row with the filter JSON.

Cron `saved-search-digest` runs daily at 07:00 AEST:

1. For each `saved_searches` row where `is_active = true`:
2. Re-run the filter against `public_listings`.
3. Compare against last run (join on `last_sent_at`).
4. If new matches OR SVI change > 5 points on existing match, email the digest.
5. Update `last_sent_at`.

Email template `saved-search-digest.tsx` (reuses existing lifecycle mailer infra). Unsubscribe link per row (respects existing `email_preferences` gate).

### 2.9 Submit-your-startup form

Public form at `/submit` for founders without an account:

```
┌────────────────────────────────────────────────────────────┐
│  Submit your startup                                       │
│  ───────────────────────────────────────────────────────── │
│  Startup name: [__________________________]                │
│  Founder email: [__________________________]               │
│  Website: [__________________________]                     │
│  Industry: [Fintech ▾]                                     │
│  Stage: [MVP ▾]                                            │
│  State: [NSW ▾]                                            │
│                                                            │
│  We'll email you a magic link to claim the listing.        │
│                                                            │
│  [ Submit ]                                                │
└────────────────────────────────────────────────────────────┘
```

Backend:

1. Creates a `public_listings` row with `is_public = false`, `claimed_at = null`.
2. Runs a preliminary SVI score using only the submitted data (partial score, ~5 of 13 criteria).
3. Sends magic-link email to the founder email.
4. On magic-link click → founder signs up / signs in → listing owner assignment → prompt to complete SVI for full public listing.

Turnstile-protected. Rate limit 5 submissions per IP per day.

### 2.10 Founder opt-in / opt-out

Founder controls `is_public`:

- Default `false` on listing creation.
- Founder toggles `true` after reviewing profile in workspace.
- Toggling to `false` removes from `/index` within 5 minutes; page returns 404 (not 410 — 404 is safer for accidental re-visits).
- Sitemap rebuilds nightly (`/sitemap-listings.xml`) to reflect current opt-in set.

### 2.11 Interaction with existing SVI pipeline

- Existing SVI pipeline (`web/src/lib/svi/*`) computes score for `svi_reports` table. Public index reads a projection of that score.
- No new SVI compute path. Public listing pulls from the founder's most recent `svi_reports` row where `finalized = true`.
- Founder-side SVI improvements automatically propagate to public listing (via cron `public-listing-refresh` daily at 06:00 AEST) unless founder toggles `is_public = false`.

### 2.12 SEO infrastructure

- **Sitemap:** `/sitemap-listings.xml` lists all public listings, priority 0.6, changefreq weekly. Root `/sitemap.xml` includes `<loc>https://blockid.au/sitemap-listings.xml</loc>`.
- **robots.txt:** allow `/index`, `/listings/*`, `/submit`. Existing rules unchanged.
- **Canonical URLs:** every faceted `/index?state=X` page canonicals to `/index`. Every listing canonicals to `/listings/<TICKER>` (uppercase enforced by middleware; lowercase 301s to uppercase).
- **OpenGraph:** each listing has OG title + OG description + OG image (auto-generated per listing at build time using Vercel-OG-style server rendering — or falls back to a stock `/og/index.png` if no logo).

---

## 3. Task list T-13xx

Effort: S=1 (≤4h), M=2 (≤1d), L=3 (≤3d). WSJF = (bv+tc+rr)/effort.

| id | task | effort | bv | tc | rr | wsjf | dependencies |
|----|------|--------|----|----|----|------|--------------|
| T-1301 | Migration `0092_public_listings.sql` (5 tables per §2.2 + RLS: only owner can update; anyone can read `is_public = true`) | M | 5 | 4 | 4 | 6.5 | none |
| T-1302 | Ticker generator + reservation flow (`web/src/lib/index/ticker.ts`); load ASX ticker CSV at build time and merge into reserved list | M | 4 | 3 | 4 | 5.5 | T-1301 |
| T-1303 | `/index` server-rendered top-level list + client-side filter drawer + faceted URL preservation | L | 5 | 4 | 3 | 4.0 | T-1301 |
| T-1304 | `/listings/[ticker]` detail page (server-rendered, all sections per §2.5) + 404 handling | L | 5 | 4 | 4 | 4.33 | T-1301 |
| T-1305 | JSON-LD emission on both `/index` and `/listings/[ticker]` (Org + Dataset + BreadcrumbList) | S | 4 | 4 | 3 | 11.0 | T-1303, T-1304 |
| T-1306 | Sitemap: `/sitemap-listings.xml` + inclusion in root `/sitemap.xml` + nightly rebuild cron | S | 4 | 4 | 3 | 11.0 | T-1301, T-1304 |
| T-1307 | OpenGraph image generator per listing (server-side render on build OR at first request with cache) | M | 3 | 3 | 2 | 4.0 | T-1304 |
| T-1308 | Comparable-set query + 1h read-cache + rendering on detail page | M | 4 | 3 | 3 | 5.0 | T-1304 |
| T-1309 | `/submit` form + `POST /api/index/submit` + Turnstile + rate limit + partial-SVI compute | M | 4 | 3 | 3 | 5.0 | T-1302 |
| T-1310 | Saved-search create flow (`POST /api/index/subscribe`) + workspace UI to list/manage searches | M | 4 | 3 | 3 | 5.0 | T-1301, T-1303 |
| T-1311 | Cron `saved-search-digest` daily 07:00 AEST + email template + reuse `watchlist_digest` mailer plumbing | M | 4 | 3 | 3 | 5.0 | T-1310 |
| T-1312 | Public listing refresh cron `public-listing-refresh` daily 06:00 AEST (reads latest `svi_reports` per owner, updates `public_listings.svi_score`) | S | 4 | 3 | 3 | 10.0 | T-1301, existing SVI pipeline |
| T-1313 | Workspace: `/workspace/public-listing` panel for founder to toggle `is_public`, edit tagline, upload logo, preview live page | M | 4 | 3 | 3 | 5.0 | T-1301, T-1304 |
| T-1314 | Wire analytics event `public_listing_view` (new) into T-1003 registry; fire on `/listings/[ticker]` server-render | S | 3 | 3 | 3 | 9.0 | T-1003 registry live, T-1304 |
| T-1315 | Playwright regression `public-index.spec.ts` — submit form, generate ticker, load index, load detail, click into comparable, save search, receive digest | M | 3 | 3 | 4 | 5.0 | T-1301 through T-1311 |

15 tasks. WSJF-ordered priority: T-1305 / T-1306 (11.0), T-1312 (10.0), T-1314 (9.0), T-1301 (6.5), T-1302 (5.5), T-1308 / T-1309 / T-1310 / T-1311 / T-1313 / T-1315 (5.0), T-1304 (4.33), T-1303 / T-1307 (4.0).

T-1301, T-1303, T-1304 are load-bearing; sequence first regardless of WSJF ordering.

---

## 4. Success metrics

### 4.1 Listings indexed by Google

- **Target:** ≥ 100 opted-in listings indexed by Google within 60 days of launch (per v3.1 amendment).
- **Measurement:** Google Search Console `pages: indexed` count for URL pattern `/listings/*`; alternate measurement via `site:blockid.au inurl:listings` daily-sampled count.
- **Baseline:** 0. Nothing indexed yet.
- **Instrumentation:** manual weekly GSC check + T-1306 sitemap submission on ship day.

### 4.2 Organic sessions to `/listings/*`

- **Target:** ≥ 30 organic sessions per day averaged over any 7-day window within 60 days.
- **Measurement:** GA4 `session_source=google AND session_medium=organic AND page_location contains '/listings/'`.
- **Baseline:** 0. Alternate measurement path via BQ export (T-1010) once wired.

### 4.3 Saved-search subscriptions

- **Target:** ≥ 50 active saved searches within 90 days of launch.
- **Measurement:** `select count(*) from saved_searches where is_active = true`.
- **Baseline:** 0.

### 4.4 Public listings created (opt-in count)

- **Target:** ≥ 100 within 60 days.
- **Measurement:** `select count(*) from public_listings where is_public = true`.
- **Baseline:** 0. Growth path: submit form + workspace toggle + partnership seeding.

### 4.5 Submit-form conversion

- **Target:** ≥ 30% of `/submit` form submissions convert to claimed (magic-link clicked + signup completed) within 7 days.
- **Measurement:** join `public_listings.claimed_at is not null` on submissions in 7-day window.
- **Baseline:** UNKNOWN. Typical magic-link claim rate is 40-60%; friction reduces this.

### 4.6 Listing-page → free-score conversion

- **Target:** ≥ 3% of `/listings/[ticker]` sessions result in a "Score my startup" click that leads to signup.
- **Measurement:** GA4 event `signup_started` where `page_referrer contains '/listings/'`.
- **Baseline:** UNKNOWN. Benchmark: content-marketing → trial CTR 1-5%.

### 4.7 Comparable-set click-through rate

- **Target:** ≥ 20% of `/listings/[ticker]` sessions include a click through to a comparable listing.
- **Measurement:** GA4 event `comparable_listing_clicked` (new event to add).
- **Baseline:** UNKNOWN.

### 4.8 Digest email engagement

- **Target:** ≥ 25% open rate; ≥ 5% click-through rate.
- **Measurement:** SES / Resend event pipeline joined to `saved_searches.search_id`.
- **Baseline:** UNKNOWN. Benchmark: SaaS digest open rate 20-30% typical.

---

## 5. Six-week rollout

### Week 1 — Schema + ticker + index page skeleton

- Ship T-1301 (migration 0092).
- Ship T-1302 (ticker generator + ASX reserved list).
- Ship T-1303 (`/index` skeleton, empty state, filters that render but no data yet).
- Seed 5 internal listings (auschain, blockid, media-studio, plus 2 friendly founders) via direct DB insert.

Exit criteria for Week 1: `/index` renders 5 rows; ticker generator produces unique codes; no ASX collisions.

### Week 2 — Detail page + JSON-LD + sitemap

- Ship T-1304 (`/listings/[ticker]` detail page).
- Ship T-1305 (JSON-LD).
- Ship T-1306 (sitemap).
- Submit sitemap to Google Search Console.
- Manual seed 20 more listings from `.claude/plans/reference_directory_listings.md` sources.

Exit criteria for Week 2: 25 listings live; detail page passes schema.org validator; sitemap submitted.

### Week 3 — Submit form + workspace toggle

- Ship T-1309 (`/submit` + partial SVI).
- Ship T-1313 (workspace `/workspace/public-listing` panel).
- Ship T-1312 (refresh cron).
- Launch public "submit your startup" campaign via LinkedIn cron.

Exit criteria for Week 3: 5 external submissions received; 3 claim their listing.

### Week 4 — Saved search + digest

- Ship T-1310 (saved search UI).
- Ship T-1311 (digest cron).
- Ship T-1308 (comparable set).
- Ship T-1307 (OG image generator).

Exit criteria for Week 4: 10 saved searches created; first daily digest email delivered; comparable set links driving internal clicks.

### Week 5 — Analytics + regression

- Ship T-1314 (analytics event `public_listing_view` + `comparable_listing_clicked`).
- Ship T-1315 (Playwright regression).
- Full-tree nightly review (Goal 5A) covers `/app/index` + `/app/listings` + `/app/submit`.
- Wire T-1010 BQ export to include the new events.

Exit criteria for Week 5: end-to-end analytics wired; Playwright green; nightly review clean.

### Week 6 — Growth + polish

- Publish 6 seeded founder-SEO articles (T-1019) linking to `/index`.
- Wire `/index` into main nav (footer link + secondary nav in workspace).
- Publish `/for/investors` marketing page featuring the index as a discovery tool.
- Retro + measure Week 1-5 metrics.

Exit criteria for Week 6: 60 listings live; ≥ 10 organic sessions/day trending toward 30 target; ≥ 20 saved searches.

---

## 6. Dependencies

### 6.1 Upstream

- **v3 T-0511** — SVI 13-criteria. Blocks the SVI breakdown chart on detail page.
- **v3 T-0906** — SVI Index opt-in path per v3 Phase E. This goal absorbs and replaces T-0901..T-0906 per v3.1 §5.
- **T-1003** — Analytics registry. Blocks T-1314.
- **T-1010** — BQ export. Blocks §4 measurement infra.
- **Existing SVI pipeline** — `web/src/lib/svi/*` and `svi_reports` table.
- **Existing `watchlist_digest` mailer** — reused for saved-search digest.
- **ASX ticker CSV** — public data at asx.com.au, fetched at build time.

### 6.2 Downstream

- **Goal 5B (Investor Pack)** — the pack could embed "See this startup on our public index" CTA once Goal 5C launches.
- **Goal 5D (VI cohort)** — `/vi/index` and `/vi/listings/[ticker]` are the localised twins of this goal's surfaces; scope is a subset (Vietnamese-language listing labels, VI SEO on head query "cong ty khoi nghiep uc").

### 6.3 Parallel

- Goal 5A can develop in parallel and its nightly reviewer will catch drift in the index surfaces once shipped.
- Goal 5B can develop in parallel (no shared code path until launch).

---

## 7. Non-goals

Explicitly OUT of scope:

- **Non-AU startups.** Any listing with an ABN-verifiable AU registration is eligible; foreign startups are not.
- **Investor listing.** VCs / angels / accelerators do not get index pages. That is a different product (v2.2 backlog).
- **Trending / editorial curation.** No "top startups this week" list. The index is sorted by SVI + faceted, not editorialised.
- **Comment / review system.** No user-generated content on listing pages. Reserved for later after moderation infra exists.
- **Historic acquisitions / exits page.** Listings only cover live startups. Exit tracking is v4 Phase 8.
- **Public API.** No third-party API access to the index dataset in v1. Deferred to v3.
- **Investment CTA / marketplace.** No "invest in this startup" flow. Regulated territory (AFSL), not v1.

---

## 8. Risks

### 8.1 Google indexes but does not rank

- **Probability:** High (4/5).
- **Impact:** High (5/5) — the entire SEO thesis collapses.
- **EMV:** 4 × 5 × 1.0 = 20.0 — Mitigate.
- **Mitigation:** high-quality per-listing content (SVI breakdown + comparable set + funding history = unique per URL); JSON-LD; canonical + OG; internal linking density (each detail page links to 3-5 comparables); sitemap freshness; 6 canonical founder-SEO articles (T-1019) linking IN to the index.

### 8.2 Founder does not opt in

- **Probability:** Medium (3/5). Founders are wary of public exposure especially of cap-table detail.
- **Impact:** High (4/5) — no supply, no index.
- **EMV:** 3 × 4 × 1.1 = 13.2 — Mitigate.
- **Mitigation:** default private; granular fields (founder can opt-in the listing without opting in the SVI breakdown); founder benefits framing ("investors are searching for you"); listing driven by submit form (external) not just workspace toggle.

### 8.3 Ticker collision or ASX confusion

- **Probability:** Medium (3/5).
- **Impact:** Medium (3/5) — brand confusion; potential legal push.
- **EMV:** 3 × 3 × 1.2 = 10.8 — Mitigate.
- **Mitigation:** ASX ticker CSV as reserved set (T-1302); disclaimer on every page "BID is a BlockID.au short code, not an ASX ticker"; ticker collisions with well-known ticker symbols (e.g. CBA, BHP) auto-blocked.

### 8.4 Submit-form spam

- **Probability:** High (4/5).
- **Impact:** Medium (3/5) — cleanup cost + index pollution.
- **EMV:** 4 × 3 × 1.1 = 13.2 — Mitigate.
- **Mitigation:** Turnstile + rate limit + magic-link claim requirement (listing not public until claimed) + ABN verification prompt on claim; unclaimed submissions auto-deleted after 14 days.

### 8.5 Stale SVI score on detail page

- **Probability:** Medium (3/5). Founder's workspace SVI can drift daily; public listing refreshes daily.
- **Impact:** Low (2/5) — 24h staleness is acceptable; label reads "last computed X hours ago".
- **EMV:** 3 × 2 × 1.0 = 6.0 — Accept.
- **Mitigation:** show `svi_last_computed_at` timestamp on the listing card; refresh cron runs at 06:00 AEST.

### 8.6 Legal risk — defamation via user-submitted profile data

- **Probability:** Low (2/5). Founder claims their own profile; third parties do not create profiles for competitors.
- **Impact:** High (5/5) — defamation exposure is real.
- **EMV:** 2 × 5 × 1.4 = 14.0 — Mitigate.
- **Mitigation:** submit form only creates unclaimed profile; profile does not go public until claimed by owner via magic-link; owner attests they represent the startup at claim time; DMCA-style takedown form for edge cases.

### 8.7 SVI score misrepresentation

- **Probability:** Medium (3/5). Founders may pump their own scores by gaming inputs.
- **Impact:** Medium (3/5) — reduces index trust.
- **EMV:** 3 × 3 × 1.2 = 10.8 — Mitigate.
- **Mitigation:** SVI computation is opaque to founder (they cannot see the exact weightings); anomaly detection cron flags scores > 90 for manual review; source-of-truth evidence required for top-quartile scores (per v3 T-0511 evidence vault).

### 8.8 Cost of OG image generation

- **Probability:** Low (2/5). Vercel-OG-style rendering is fast and cacheable.
- **Impact:** Low (1/5) — < $0.001 per image.
- **EMV:** 2 × 1 × 1.4 = 2.8 — Accept.
- **Mitigation:** cache images in CDN with 30-day TTL; regenerate on listing update only.

---

## 9. Open questions

- Should we let founders pin one funding round to the top of the funding table? Deferred; may add later based on feedback.
- Should the comparable set include non-public benchmarks (e.g. anonymised aggregate SVI in the same industry)? Interesting but complicates the "3-5 listings" layout; defer.
- Do we count paid subscribers' listings differently in the index (e.g. verified badge)? Under consideration — creates a two-tier index; needs CLO review for consumer-law implications.
- Should saved-search digests be sent daily even if no new match, or only on match? Current plan: only on match (reduces email fatigue).
- Do we allow founders to embed their listing on their own website (`<iframe>` embed)? Not in v1; v2 nice-to-have.
- Do we support listing archival / historical exit tracking? Not in v1; that is Goal 8 (Exit) territory.

---

## 10. Cross-references

- v3.1 amendment: `docs/IMPLEMENTATION-PLAN-v3.1-amended.md` §4 Goal 5C
- Related v3 tasks: T-0901..T-0906 (SVI Index opt-in path, absorbed by Goal 5C)
- Related v3 task: T-0511 (SVI 13-criteria scoring)
- Related task: T-1003 analytics registry
- Related task: T-1010 BQ export
- Related task: T-1019 6 canonical founder-SEO articles (link INTO index)
- Related infra: `web/src/lib/svi/*`, `svi_reports`, `watchlist_digest`
- Related routes (new): `/index`, `/listings/[ticker]`, `/submit`, `/api/index/*`
- Related tables (new): `public_listings`, `public_listing_funding`, `public_listing_team`, `public_listing_svi_history`, `saved_searches`
- Related migration (new): `0092_public_listings.sql`
- ASX ticker CSV: https://www.asx.com.au/asx/research/ASXListedCompanies.csv
- Orchestrator meta-doc: `docs/orchestrator-goal-tracking.md`

---

*End of Goal 5C. Owned by CMO + CTO + CPO. Next review: after Week 3 launch of `/submit`.*
