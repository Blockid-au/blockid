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
