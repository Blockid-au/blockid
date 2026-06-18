# BlockID.au — Version Log

> Conventional version log starting from v2.3 (SVI quality upgrade era, June 2026).
> Older history lives in `docs/ROADMAP.md` as completed phases.

---

## Versioning convention

`vMAJOR.MINOR.PATCH` — applied to the SVI report shape (`SVIAnalysis` type) and the dashboard composition. MAJOR = breaking; MINOR = new module added to `analysis_json`; PATCH = fix only.

Each commit message tagging a new MINOR version must:
1. add a row to this file under the latest section,
2. update `docs/ROADMAP.md` Phase 2.6 list,
3. update `docs/ARCHITECTURE.md` pipeline diagram,
4. update `docs/TEAM_STRUCTURE.md` "Recently Shipped" table.

---

## v2.18 — 2026-06-18 (PM, accelerated)

**Theme:** SVI Exchange v0.2 + v0.3 + v0.4 shipped in one cycle — 4h sprint, not 4 weeks.

The user directive was "accelerate from 4-week cron to 4-hour continuous". Instead of letting the orchestrator drip-feed stub research/plan stages 1 task per 6h, the C-Level agents (CTO/CPO/CISO/CMO/CDO/R&D/IR/CLO) executed the actual code paths in parallel. Twelve tasks shipped this cycle.

### v0.2 Investor layer — shipped
- **T_0001 · Watchlist** — `0066_watchlist.sql` migration, `lib/watchlist.ts` (list/toggle), `/api/watchlist` GET/POST/OPTIONS with CORS for startupvalueindex.com.
- **T_0002 · Watchlist UI** — `WatchlistButton.tsx` in standalone app, wired into `/listings/[ticker]`. Star toggle persists via cookie-auth back to blockid.au.
- **T_0003 · Investor account type** — `0067_account_types.sql` (account_type enum + verified_at + investor_firm/url), `/api/admin/investor-verify`, `/dashboard/admin/investor-verifications` admin queue.
- **T_0004 · Watchlist digest cron** — `0068_watchlist_digest.sql` (last_digest_svi/stage/at cols), `/api/cron/watchlist-digest` daily 09:00 UTC, threshold ±5 SVI or stage shift, Resend email.
- **T_0005 · Founder contact unlock** — `0069_contact_unlocks.sql` (contactable_by_investors flag + audit log), `/api/contact-unlock` route with verified-investor + founder-opt-in gating, founder profile toggle UI.

### v0.3 Sector deep-dive — shipped
- **T_0006 / T_0007 · Sector pages** — `startupvalueindex.com/src/app/sector/[sector]/page.tsx` generic route, `lib/sector-copy.ts` covering seven sectors (saas / fintech / ai / healthtech / marketplace / deeptech / ecommerce): thesis, benchmarks, methodology. Cohort distribution histogram, top-20 leaderboard, citation block.

### v0.4 Embeddable widgets — shipped
- **T_0008 · BSI-AU embed** — `/embed/bsi-au` 320×120 iframe, no JS, 5-min revalidate. CSP-safe.
- **T_0009 · Ticker embed** — `/embed/ticker/[ticker]` 320×140 per-company widget. Founders can drop on homepage.
- **/embed** docs page with copy-paste snippets + license terms.

### Research drops — shipped (Path A → v0.5)
- **T_0010** — Cut Through Venture pitch + 3-email outreach sequence.
- **T_0011** — AFSL exemption map for secondary share offers. **Recommendation: Path A (sophisticated-investor-only matching), ship v0.5 in 2 weeks, A$3–8k T&Cs review.**
- **T_0015** — Quarterly BSI × Cut Through report template (8-section editorial structure).

### Queue state
- `phase_status`: v0.1 / v0.2 / v0.3 / v0.4 = `done`. v0.5 = `in_progress`.
- 12 / 15 tasks shipped; remaining 3 (T_0012 intake form, T_0013 EOI book, T_0014 institutional API) move to next cycle.

## v2.17 — 2026-06-18 (PM)

**Theme:** SVI Exchange orchestration framework — autonomous C-Level execution for the 4-phase north star.

- `.claude/goals/svi-exchange-orchestration.md`: full orchestration model — task shape, queue, picker logic, per-stage execution contract (research → plan → code → deploy), C-Level role mapping, escalation rules, anti-patterns, phase-2 ideas (AI-generated tasks, multi-agent collaboration, telemetry-driven priority bumps).
- `web/content/reports/svi-exchange-tasks.json`: seeded **15 tasks** covering v0.2 Investor layer (watchlist, account verification, email alerts, contact unlock), v0.3 sector pages (SaaS deep-dive + 6 more), v0.4 embeddable widgets + Cut Through partnership, v0.5 secondary-offers regulatory research + intake form, v0.6 EOI book, v0.9 institutional API tier + quarterly report. Each task includes phase, owner, collaborators, priority, dependencies, deliverables, estimated hours.
- `web/src/app/api/cron/svi-exchange-orchestrator/route.ts`: GET (inspect) + POST (advance one cycle) endpoints. Picker logic = first in_progress → highest-priority pending with deps satisfied. Per cycle: load queue → pick task → advance one stage → write stub artifact in `.claude/research/` or `.claude/plans/` → save state → Telegram alert on done + escalations log.
- `web/src/app/dashboard/admin/svi-exchange/page.tsx` (Beta) — orchestration cockpit: stat row (total / done / in_progress / blocked), phase progress bars, last-5-cycles log, escalations panel, full task queue with stage badges + last-action stamps + manual trigger docs.
- Sidebar admin nav: "SVI Exchange" (Beta, Rocket icon) — admin-only.

## v2.16.1 — 2026-06-18 (PM)

**Theme:** startupvalueindex.com DNS live + uptime watcher coverage + 12-month north-star goal.

- Cloudflare DDNS already had a token for startupvalueindex.com (`/etc/cloudflare-ddns-startupvalueindex.conf` + zone `c049...4fc5`). Ran `cloudflare-ddns-update.sh` to force both apex + www A records to point at origin IP **34.46.34.139** with proxied=true. Verified live via `https://startupvalueindex.com/` (200, <100ms) — all 6 routes resolve through Cloudflare CDN → origin nginx (port 4002).
- `web/scripts/uptime-watcher.sh` parametrised — now accepts a URL argument so a single script can monitor multiple domains. State + log files key off URL slug.
- Crontab installs **two** entries: one watching `blockid.au`, one watching `startupvalueindex.com`. Same graduated-response logic (3 fails → restart, 5 fails → rollback).
- `GOAL.md` in the separate startupvalueindex.com repo: 12-month north-star direction — site evolves from listings (v0.1, shipped) → investor layer (v0.2-4) → liquidity / secondary share offers (v0.5-8, first revenue) → index licensing (v0.9-x, recurring revenue). C-Level role mapping across all 14 agents, success metrics per phase, anti-patterns, hard scope cuts.

## v2.16 — 2026-06-18 (PM)

**Theme:** startupvalueindex.com extracted to standalone project + brand + systemd + nginx + trademark filing plan.

- New repo at `/home/dovanlong/startupvalueindex.com` — Next.js 15 App Router, Tailwind 3, TypeScript strict, **zero database** (read-only consumer of blockid.au public APIs)
- Brand: wordmark "Startup Value Index™", slogan "Live Startup Valuations", monogram logo (dark tile + emerald rising chart line, SVG + favicon)
- Pages: `/` BSI-AU hero · `/listings` Markets table · `/listings/[ticker]` detail with SVI history chart · `/about` methodology + trademark · `/api/headlines.json` CORS-enabled feed
- Build: standalone Next.js bundle running on port 4002
- Deploy: **systemd service** `startupvalueindex.service` (enabled, Restart=always)
- nginx vhost on `blockid-live` now points startupvalueindex.com → 127.0.0.1:4002 (was proxying to blockid.au/index in v2.4)
- Trademark plan: `TRADEMARK.md` — IP Australia Headstart filing for classes 35 / 36 / 42, estimated A$3,500-5,000, defensive (TM) symbol used until registered, first-public-use 2026-06-18 documented

## v2.15 — 2026-06-18 (PM)

**Theme:** Startup Value Index Listings — the "Markets" view of startupvalueindex.com.

- `.claude/goals/startup-value-index-listings.md`: full IA, data model, C-Level role assignment, success criteria, anti-patterns, phase-2 ideas.
- `lib/startup-index-listings.ts`: `computeListings()` (paginated/filterable/sortable ranked rows with 7-point sparklines) + `computeListingDetail(ticker)` (full per-ticker payload). Anonymous-by-default — public name shown only when founder profile has `public_visible: true`. Ticker = `SECTOR-XXX` (last 3 of latest slug). Identity hash = SHA-256("bsi-au:" + email).slice(0,12).
- `/api/index/listings` GET: cached 5min sw-r 10min, full query-param API (sector / stage / sort / order / public_only / revenue_only / page / pageSize).
- `/api/index/listing/[ticker]` GET: detail JSON with SVI history series, Antler snapshot, accelerator readiness summary, 4-lens perspectives.
- `/index/listings` page (Beta): investing.com Markets-style ranked table with filter pills + sortable columns + 7-pt sparkline col + pagination + methodology footer.
- `/index/listings/[ticker]` page (Beta): hero with SVI + delta + valuation + sector/stage chips + opt-in name; SVG SVI-history line chart with area fill; Antler 5-signal bar strip; Accelerator readiness summary + top 3 gaps; 4-lens valuation triangulation table; CTA + JSON link.
- `/index` hero now has "Browse all N listings →" CTA below the stat row.
- `nginx` already routes `startupvalueindex.com → /index` via v2.4 (T0212), so both pages surface on the brand domain automatically.

## v2.14.1 — 2026-06-18 (PM)

**Theme:** Uptime guard — minute-cadence external probe + graduated auto-recovery.

User reported (mistakenly, as it turned out) that blockid.au was down. Site was actually 200 OK across all routes, but the report exposed a gap: between agent-guardian runs (every 10 min) the platform had no fine-grained uptime visibility. Closed the gap.

- `web/scripts/uptime-watcher.sh`: 1-minute cron that probes `https://blockid.au` with 8s timeout. Graduated response based on consecutive-fail counter:
  - 3 fails → kill stale next-server PID + spin up fresh from `.next-current` symlink + Telegram alert
  - 5 fails → `deploy-live.sh --rollback` (restore previous release) + Telegram alert
  - Recovery (200 after any fail) → reset state + Telegram recovery ping
- State persisted in `/tmp/blockid-uptime-state`, log auto-rotated at 100 KB, Telegram alerts throttled 15 min per incident
- Installed via crontab `* * * * * bash …/uptime-watcher.sh` — already live
- `docs/UPTIME_GUARD.md`: runbook explaining the layer stack (uptime / guardian / healthcheck / QA daily / deploy CI), graduated response table, troubleshooting steps, phase-2 hardening ideas (external monitor, multi-region, StatusPage)

## v2.14 — 2026-06-18 (PM)

**Theme:** Startup Value Index Exchange — `/index` rebuilt as the investing.com-style brand surface for startupvalueindex.com.

- `.claude/goals/startup-value-index-exchange.md`: full goal doc with information architecture, data model, C-Level role assignment, success criteria, anti-patterns, phase 2 ideas.
- `lib/startup-index-aggregator.ts`: server-side aggregator computing BSI-AU (median SVI over 90d), 7 sector indices, 8 stage indices, top winners/losers (per-identity WoW delta), 7-day sparkline, total coverage AUD, citation snippet. Anonymous tickers (SECTOR-xxx) — no PII.
- `/api/index/headlines`: public JSON endpoint, cached 5min stale-while-revalidate 10min.
- `/index` page completely rebuilt to copy investing.com:
  - HERO: BSI-AU value (huge), 1-day + 7-day delta pills, sparkline SVG, 4-stat row (companies / coverage / today / yesterday)
  - SECTOR HEATMAP: 7-sector grid coloured by 7d delta (deep green/red)
  - TOP MOVERS: winners (left) and losers (right) as ranked tables with anonymous ticker, sector, SVI, Δ
  - STAGE INDICES: 8-tile strip with median SVI per stage + cohort size
  - CTA: gradient "Get my SVI score" banner
  - METHODOLOGY + CITATION: copy-paste ready citation snippet for journalists
  - Footer: updated-at UTC + link to JSON endpoint
- nginx routing startupvalueindex.com → /index already shipped in v2.4 (T0212), so the rebuild surfaces on the brand domain automatically.

## v2.13 — 2026-06-18 (PM)

**Theme:** Finish v2.12 deliverables — standalone Criteria Library + PDF Accelerator-Ready Checklist page.

- `/dashboard/accelerator-criteria` (Beta) — searchable / filterable browser of all 30+ knowledge_entries. Filter by stage / source / topic, full-text search, sort by valuation lift / source / stage. Each row expands to show description, evidence required, "how to lift" tactic, and citation links to the source.
- PDF Page 1.8 "Accelerator-Ready Checklist" — added between SCN action plan and executive summary. Hero with overall readiness % + per-source mini-segment-bars (met/partial/gap), top 5 valuation-lift moves with "how to lift" tactic, methodology note pointing to the standalone page.
- Sidebar: "Accelerator Criteria" link added to Fundraise group (Beta chip).
- Re-ran `scripts/run-self-analysis.mjs` so `blockid-self-analysis-2026-06-18.md` reflects the v2.12 accelerator readiness + lifted Team signal post-profile insert.

## v2.12 — 2026-06-18 (PM)

**Theme:** AU Accelerator Knowledge Base — 30+ criteria across 8 accelerators evaluated per analysis.

- `.claude/goals/au-accelerator-knowledge-base.md`: full goal doc with C-Level role assignment (CDO owns schema + seeding; CMO new sources; CTO API; CPO UX; CFO valuation calibration; CRO A/B; CLO citations).
- Migration `0065_knowledge_entries.sql`: `knowledge_entries` table with source / topic / stage range / sector / evidence_required / tactic / valuation_lift_pct / citations.
- `content/knowledge-base/au-accelerators-2026.json`: 30 seeded criteria from Antler, Startmate, YC, Techstars, SkyDeck, MVi, Cicada, Blackbird — each with public-source citations.
- `scripts/seed-knowledge-base.mjs`: idempotent CLI that upserts the JSON into the table. Ran live → 30 active entries.
- `lib/agents/accelerator-readiness.ts`: evaluation engine that scores every criterion against the user's analysis (Antler signals + SVI subs + raw input keyword scan) → status per criterion (met / partial / gap) + estimated A$ valuation lift if achieved.
- `/api/svi` route: calls `evaluateAcceleratorReadiness` after the Antler signals step and persists into `analysis.acceleratorReadiness`.
- `components/dashboard/accelerator-readiness-card.tsx`: dashboard card (Beta) with overall %, met/partial/gap summary, "top valuation-lift moves" banner, expandable per-source rows with criterion details + tactic + citations.

Also includes the v2.11 founder-profile build fix: split `lib/founder-profile.ts` into client-safe `lib/founder-profile-types.ts` and server-only `lib/founder-profile.ts` because `server-only` was leaking into the client bundle via the form import. Two failed v2.10/v2.11 deploys traced to that root cause.

## v2.11 — 2026-06-18 (PM)

**Theme:** Founder Profile builder — auto-lift the Antler Team signal.

- Migration `0064_founder_profiles.sql`: new `founder_profiles` table (1:1 with app_users) capturing ship history, prev employers, years in domain, domain insight, ambition, co-founders, advisors, notable hires, public_visible flag.
- `lib/founder-profile.ts`: load/save helpers, `profileCompletionPct()` for the dashboard nag, `profileToSviInputText()` that projects the profile to a single text blob the SVI engine can scan.
- `/api/founder-profile` GET/POST (admin-only, scoped to current user) with safe coercion + 4kB cap per text field.
- `/workspace/founder-profile` UI (Beta) with progressive sections: Basics, Track record, Insider insight + ambition, Team (co-founders/advisors/notable hires), Visibility toggle. Live completion meter.
- Wired into `/api/svi`: when the user has a profile, profile text is concatenated into the rawText fed into `evaluateAntlerSignals()` so the Team signal automatically lifts from "ex-Stripe / 10 years / 3 advisors" keywords without anyone manually pasting them.
- Sidebar: "Founder Profile" link added to Account group (Beta chip).
- Schema applied live via `docker exec supabase-db psql` so the feature works on production from first deploy.

## v2.10 — 2026-06-18 (PM)

**Theme:** Antler stage-progression signals + C-Level report fallback.

- `lib/agents/antler-signals.ts` — 5-signal evaluation (Team, Progress, Invention, Unique Vision, 10× Product) with deterministic scoring from existing SVIExtractedSignals + raw text + CI output. Each signal exposes question, score, strength (exceptional/strong/developing/weak), what-we-see / gaps / how-to-lift, and a weight. Aggregated progression score 0-100 + standout signal + weakest link + one-line read.
- `/api/svi`: populates `analysis.antlerSignals` after the SCN action plan.
- `components/dashboard/antler-signals-card.tsx`: new card on `/dashboard/svi` (tagged Beta). Hero progression score + one-line read + standout/weakest link cards + expandable per-signal rows with what-we-see / gaps / how-to-lift.
- 6 new vitest cases for antler-signals (115 total).
- **Fix:** `api/cron/ceo-daily-summary` and `api/admin/goals` now walk back up to 3 days for agent reports instead of only checking today — eliminates the "❓ {Agent} No report available" panel that showed before the daily 23:45 UTC cron fires.

## v2.9 — 2026-06-18

**Theme:** Feature lifecycle keywords — kill "Coming soon", introduce Beta → Live → Stable promotion path.

- `workspace-layout.tsx`: removed every "Coming soon" string from the dashboard menu, replaced with an amber **Beta** chip. New `FeatureLifecycle` type (`beta` | `live`) + `lifecycle` field on `NavItem`. Group-level chip (for future-phase groups) and per-item chip both render with consistent amber (beta) / blue (live) styling.
- 6 features tagged `beta` (all shipped 2026-06-16 → 2026-06-17): Finance P&L, Team & Salaries, Accelerator Tracker, Content Pillars (admin), Stripe Sync (admin), Pricing A/B (admin).
- `components/dashboard/activity-feed.tsx` + `components/workspace/metrics-dashboard.tsx`: replaced "Coming soon" → Beta chip.
- `docs/FEATURE_LIFECYCLE.md` (new): promotion checklist (≥2 weeks + no P0 + monitored + green QA → live; +30 days + no P1 + steady usage → stable), promotion calendar with target dates (most beta features eligible 2026-06-30 / 2026-07-01).

## v2.8 — 2026-06-17 (PM)

**Theme:** Revenue-first execution — Stripe fix + share-on-LinkedIn + pricing A/B test.

- `scripts/sync-stripe-pricing.mjs` (Node CLI): auto-audit + auto-create new Stripe Prices for drifted plans + patch `.env` in place. Uses Stripe Search to reuse Products by `metadata.blockid_plan_id`. Run with `--fix --write-env` for full automation.
- **Founding 100 Stripe drift fixed**: was charging A$49 (4900¢), now A$3 (300¢) via new `price_1TjJBqJ7OAnXQ9sVRnW931FT`. All 7 other plans MATCH.
- `components/share/share-buttons.tsx`: LinkedIn / Tweet / Email / Copy-link share buttons rendered on every `/s/[slug]` report page. Uses standard share-intent URLs (no auth). Fires `share_clicked` analytics ping.
- `lib/ab-pricing.ts`: lightweight A/B test infra — deterministic hash bucketing by anon_id, exposure logging to `ab_pricing_events` Supabase table, `buildExperimentReport()` with conversion% and revenue-per-session (RPS) per variant.
- `/dashboard/admin/pricing-test` UI: live leaderboard of Founding 100 price variants (A$1 / A$3 / A$5 / A$10) ordered by RPS, with significance guidance.
- `/api/ab/pricing-expose`: client-callable endpoint that pins the visitor's variant in a 1-year anon_id cookie and logs the exposure.
- Sidebar admin nav: "Pricing A/B" link added.

## v2.7 — 2026-06-17 (PM)

**Theme:** Stripe pricing sync + cross-check.

- `lib/stripe-pricing-audit.ts`: deterministic audit comparing platform-config expected prices against actual Stripe Price objects (unit_amount + currency + active). Returns per-plan status: `match` / `drift` / `archived` / `missing_price_id` / `stripe_not_configured` / `stripe_lookup_failed` with human-readable remediation.
- `createFreshStripePrice(planId)`: helper that creates a new Stripe Price (Prices are immutable — `unit_amount` cannot be edited) attached to the existing Product (or creates one) with `metadata.blockid_plan_id` so audits keep working.
- `/api/admin/stripe-sync` (GET + POST): audit endpoint + create-price endpoint, admin-only.
- `/dashboard/admin/stripe-sync` UI: live table of all 8 plans + credit packs with DRIFT badges, one-click "Create new Price" per drifted row, instant copy-to-clipboard of the new `STRIPE_PRICE_*=price_xxx` env var, inline workflow guide.
- Sidebar: "Stripe Sync" added to admin nav.

Use it whenever you bump a price in `platform-config.ts` so Stripe never silently undercharges or overcharges customers.

## v2.6 — 2026-06-17

**Theme:** Drill-down detail + SVI explainer + pricing bump.

- Generic admin detail route `/dashboard/admin/detail/[metric]` (6 slugs: users, analyses, paying-customers, email-subscribers, company-profiles, revenue)
- Every 30-Day scoreboard metric card → clickable, shows source rows
- New `SviExplainerCard` with SVG radar + per-dimension guide + tool deeplinks
- Founding 100 pricing: A$1 → A$3 (single source = `platform-config.ts`)
- Email + investor page + pricing-data fallbacks all updated

**Commits:** see `git log --grep='v2.6\|T0217'`.

---

## v2.5 — 2026-06-16 (PM)

**Theme:** Honest valuation — maturity guard + real cohort percentile.

- `maturity-detector.ts`: scans well-known domains, ticker symbols, IPO/unicorn/Series C-F mentions, employee count, founding year. Returns `level` (idea/early/growth/scale/established) + confidence + evidence.
- When `scale`/`established` → blended valuation confidence forced to `low`, risk flag prepended ("connect Stripe/Xero for accurate pricing")
- `cohort-percentile.ts`: real percentile from `svi_index_snapshots` stage ±1, last 180d, min n=20. Falls back to `SVI_BENCHMARKS` when cohort small.
- Dashboard `YourNumberHero` amber banner when established detected
- PDF Page 1.7 banner mirrors dashboard
- 8 new vitest cases (109 total)

---

## v2.4 — 2026-06-16 (PM)

**Theme:** SCN action plan — "Your Number → What to do".

- `scn-action-plan.ts`: deterministic generator outputting yourNumber + 5-layer SCN journey (Validation → Position → Value → Direction → Capital) + thisWeekFocus + 30/60/90 day milestones + valuation levers
- Stage- and sector-aware action library (P0/P1/P2 + effort + impact + AU resource)
- Each layer: question, status, unlock criteria, sequenced actions
- PDF: new Page 1.7 "What is your number?" between deep-valuation and executive summary
- Dashboard: `ScnActionPlanCard` rendered above DeepValuationCard
- Plain-English explainer ("Your number is A$X — at SVI Y, hitting milestone Z lifts to ...")

---

## v2.3 — 2026-06-16 (PM)

**Theme:** Auto project name + 4-lens deep valuation.

- `project-name-extractor.ts`: scraped title → og:site_name → hostname → first proper noun → filename fallback
- High-confidence auto-fills `svi_accounts.startup_name` when empty
- `deep-valuation.ts`: 4 perspectives — Investor (VC method) · Market (TAM × penetration) · Operational (UE × multiple) · Ecosystem (AVCAL stage-median)
- Weights renormalize by data quality (MRR > 0 → upweight revenue lenses)
- Outputs: market sizing (TAM/SAM/SOM), 3 revenue scenarios, AU peer comparables (SafetyCulture, Linktree, Eucalyptus, etc.), method notes, risk flags
- PDF: new Page 1.5 "Detailed Analysis & Valuation"
- Dashboard: `DeepValuationCard` with hero blended valuation, expandable per-lens, peer comps, scenarios

---

## v2.2 and earlier

See `docs/ROADMAP.md` Phase 2 / 2.5 for the original SVI engine, 13-criterion eval, multi-agent reports, evidence vault.

---

## Known follow-ups

- T0102 cohort percentile is live but cohort < 20 → currently always `benchmark_fallback`. Will switch to `real_cohort` automatically as analyses accumulate.
- Stripe price IDs (`STRIPE_PRICE_FOUNDING50`) — payment-gateway product config needs manual update to match the A$3 display from v2.6 (separate from in-app config).
- SVI explainer card guides currently target 8 dimensions (FTV/MPC/PTD/TRE/CGH/IRI/LCO/SVM); deep-dive content per dimension still routes to existing tools.
