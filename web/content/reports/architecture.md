# Architecture — BlockID.au (living)

**Version:** v3.16.0  ·  **Last reviewed:** 2026-09-19T23:57:37.925Z

## Summary
BlockID.au — Startup Value Index (SVI) platform, evaluator-first: investors, accelerators and advisors pay (Scout A$79 / Firm A$149 / Program A$349 · Fund A$999 / Intake link A$249 / Index API A$299 · Cohort 25 A$5K/yr / Cohort 100 A$15K/yr · Trusted Business Report A$3); founders score free (Starter A$29 / Growth A$69 workspace). Next.js 16 App Router standalone (webpack) on bare metal behind nginx + Cloudflare, self-hosted Supabase Postgres (migrations through 0412, hand-applied), Stripe (single account, GST-inclusive), 12-gate deploy `web/scripts/deploy-live.sh` with live-SHA verification, weekly live QA suite, daily link check. AI: DeepInfra-first report chain with Anthropic / Gemini / Groq fallbacks and a daily free-model refresh; 11 C-Level agents own the 8 SVI dimensions (13-criteria internal rubric) and run the daily research / report crons (`web/scripts/crontab.production`). Ops: error digest + latency SLO + `/api/status` v2, weekly restore drill, Telegram → e-mail alert fallback.

## Change notes
- v3.16.0 — G18 Truth sweep (2026-09-19): version.json / package.json / CHANGELOG aligned at v3.16.0; README, docs index, public /docs, /roadmap, API reference and OpenAPI registry reconciled with SOURCE-OF-TRUTH; retired docs moved to docs/archive/.
- v3.16.0 — G17 Unicorn homepage (2026-09-19): evaluator-first hero, 5-entry nav, template primitives on every marketing page + /vi mirrors (docs/design/unicorn-template.md), /product + /samples, scripts/link-check.mjs in gate 8 + daily cron (525 pages · 1,638 links · 0 broken), migration 0412.
- v3.16.0 — G16 First dollar (2026-09-19): funnel events (sign_up / svi_analyze / svi_score_computed / report_view / checkout / trust_report_purchased) + /admin/funnel on real data, locked-chapter TBR preview → A$3 quote-then-pay (GET /api/reports/access), evaluator pilot comp (30 d, cap 5) + /pilot + /admin/pilots, funnel-report + pilot-expiry crons, migration 0411.
- v3.16.0 — G15 Reliability (2026-09-18): manifest truth + gate-11 live-SHA check, deploy/live-qa lock etiquette, /data/logs append-mode log + rotation, error-digest + latency-sample crons, /api/status v2, weekly restore drill, AI provider health snapshot, stray-process sweep, Telegram → e-mail fallback.
- v3.15.0 — CMO: Implement Startup Percentile/Positioning Model
- v3.14.0 — IR: G14 Wave A · Deck v3 "Startup Value Index" (evaluator-first, pre-seed A$500K): web/content/pitch/pitch-deck-v3.md (12 slides + 3-minute cut + provenance), web/scripts/generate-pitch-deck-v3.ts → PPTX + appendix + HTML preview, generate-pitch-deck-v3.test.ts (speakability, provenance, forbidden words), SUPERSEDED banners on deck v1 / pitch-deck-v2-investor.md / video-assets slides, executive-summary.md rewrite, 00-pitch-feedback.md (19 verbatim comments + traceability)
- v3.13.0 — CMO: AU startup percentile/positioning model integration
- v3.12.0 — CTO: Update Essential Eight Vulnerabilities to reflect ACSC alerts
- v3.11.0 — CMO: Evaluator Progress Radar digest: extend watchlist-digest to evaluator-owned projects, merge G11 Money Radar signals (grant deadlines, program intakes) for tracked startups
- v3.11.0 — IR: Growth extras: investor reverse-match (getDealFlow inverted), per-grant application_prompts drafts, quarterly expert analysis refresh
- v3.11.0 — CPO: MoneyRadarTile (5 states) on /dashboard + /workspace/funding tabs + lib/funding/copy.ts messaging keys + VI review
- v3.11.0 — CRO: Founder Radar packaging: plans.csv flags money_radar/grant_finder (Starter, Growth, Package), pricing matrix row, A$3→subscribe upsell card, GA4 radar_upsell_*
- v3.11.0 — CMO: Radar drips radar_t30/t14/t3 + weekly digest money block (founder-digest-weekly) + events via recommendConferences({source}) + svi_trend_alert writer
- v3.11.0 — CTO: funding_matches + api/cron/money-radar-sweep + notification kinds (grant_deadline, program_intake, event_match, weekly_next_step, new_matches, analysis_refresh) + bell repoint + money_radar email category + /api/funding/calendar.ics
- v3.11.0 — CPO: /funding/report/[id] (cards, 12-month SVG Gantt, actions, disclaimers) + PDF + lib/dataroom/save-deliverable.ts + /workspace/funding + nav leaf validate.discover + recommender secondary money lane
- v3.9.0 — CFO: Build Top-Down/Bottom-Up TAM/SAM/SOM Calculator
- v3.9.0 — CFO: Implement Top-Down/Bottom-Up TAM/SAM/SOM Calculator
- v3.8.0 — CFO: Implement Cap Table Dilution & Round Sizing Simulator
- v3.7.0 — CMO: Create Competitor Feature Release Tracker module
- v3.5.0 — Code & Website Analyzer: deterministic PTD sub-score 0-100 from GitHub signals (commits, tests, CI, license, README) + website signals (HTTPS, TTFB, Lighthouse/heuristic perf/SEO/a11y). Valuation adjuster -10/0/+5/+12%. Full dashboard UI with arc gauge, bar chart, rationale items. analyzer_runs table migrated. Added to Build→Strategy nav.
