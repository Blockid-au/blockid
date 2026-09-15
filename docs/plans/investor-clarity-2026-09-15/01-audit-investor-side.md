> **Back-link:** [`docs/plans/SOURCE-OF-TRUTH.md`](../SOURCE-OF-TRUTH.md) § G13 · read-only codebase audit 2026-09-15 (input to the G13 goal doc).

# Exploration report 1 — Investor / Evaluator side (2026-09-15)

All paths under web/ unless prefixed docs/.

## Routes (authenticated)
- `(investor)` route group is EMPTY passthrough; all investor pages live under `(app)/(founder)/workspace/...`.
- /workspace/investor (hub: Deal Flow / Watchlist / Portfolio panels; FeatureGate investor.dealflow; lib src/lib/investor-portal.ts getDealFlow/getWatchlist/getPortfolio)
- /workspace/investor/dealflow (table, filters stage/cheque_band/sector; reads `scores` investor_visible=true enriched from svi_index_snapshots; JOIN by email→account_id is effectively broken — comment "reconcile in W6"; sector/stage mostly null so pref filters are no-ops)
- /workspace/investor/watchlist (watchlist table 0066/0068; tags following/contacted/passed stored as "#tag:" in notes)
- /workspace/investor/portfolio (STATIC copy; table investor_portfolio (0314) unused by page)
- /workspace/investor/digest (watchlist_digest archive)
- /workspace/investor/preferences (+investor-visibility-form.tsx): ONLY discoverable toggle + firm + thesis editable; text says "full preferences form ships in a follow-up release". Store: app_users.investor_prefs jsonb + investor_discoverable (migration 0323). Schema in code: src/lib/investor-portal.ts InvestorPreferences {sectors[] free-text ≤20, stages StageBand[] (pre_seed|seed|series_a|series_b|growth|any), geos[] ISO, cheque_band (under_25k|25k_100k|100k_500k|500k_2m|2m_plus|any), min_svi, firm, thesis}. normalisePrefs(). API POST /api/investor/preferences (402 without investor.dealflow).
- Aliases (redirect-only): /workspace/investor-preferences, /workspace/deal-flow, /workspace/watchlist, /workspace/portfolio → the pages above. Sidebar Roles›Investor links to the ALIASES.
- /workspace/evaluations (+evaluations-client.tsx, report-dialog.tsx, batch-dialog.tsx, evaluator-activation-checklist.tsx, trial-report-banner.tsx): "Startups I'm evaluating" (G12 T0270) columns Startup · Stage/SVI · Progress (Δ+sparkline) · Consent · Added · Actions; add-startup dialog; Trust BizReport confirm-before-charge; batch scoring (Program); ?claim=token founder claim. Tables: evaluations (0314: evaluator_user_id, project_id, owner_kind, consent_tier, founder_email, invite_token, label, notes ≤20k, website, state), evaluation_reports (0317/0325), evaluation_batches/items (0322/0325), evaluator_progress_sends (0321). Libs src/lib/evaluations.ts, src/lib/evaluations/{report-quota,progress-radar,batch,activation-checklist,quarterly-report}.ts.
- /workspace/evaluations/cohort/[batchId] (cohort table, rubric weights re-aggregate displayed score only, CSV + LP report).
- /workspace/evaluation (SINGULAR) = FOUNDER 13-criteria self-evaluation — naming collision with /workspace/evaluations.
- /workspace/investors = FOUNDER Investor CRM (S28-B; investor_contacts 0375, investor_touchpoints 0376; kanban researching→…→invested).
- /workspace/lp-report (founder LP slot composer, stateless), /dashboard/reports/lp-quarterly (static), /dashboard/investor-links (founder share links), /workspace/investor-pack (founder one-click pack PDF; src/lib/investor-pack-assembler.ts, src/lib/pdf/investor-pack.tsx), /workspace/business-report (founder TBR; business-report-client.tsx 1678 lines), /dashboard/admin/investor-verifications (admin approves investor accounts).
- Public: /investor (landing, 8 featured listings), /investors (pitch to invest IN BlockID — confusing name), /solutions/investor (Scout A$79), /for/[segment], /compare, /compare/chatgpt, /compare/valuers, /listings + /listings/[slug] (startup_listings / v_startup_listing_public 0082; filters sector×stage), /startup-index(+/listings/[ticker]) (SECTOR_OPTS 8, stage 0–7), /reports/[ticker] (public trust report landing), /tbr/[token] (public TBR share; same BusinessReportClient hydrated from svi_snapshots: criterion_results {score, verdict sentence, strengths[], gaps[], next_action}, dim_results, dimension_scores, analysis_json; ?pdf=1; beacons view-start/view-end/lead), /tbr/demo, /sample-business-report, /s/[slug].
- APIs: /api/investor/preferences, /api/investor/dealflow, /api/watchlist, /api/evaluations (POST {name, website?, description?, founder_email?, state?, industry?}), /api/evaluations/[id], /[id]/report (preview→confirm; credits before run, refund on failure; quota row after success; idempotency), /claim/[token], /batch, /batch/[id]/export.csv, /api/reports/quarterly (?batch|?cohort; needs lp_report/lp_export), /api/investor-portal/ai-generate (localhost proxy for startupvalueindex.com). Crons: evaluator-progress-weekly (Sun 23:30 UTC), evaluation-batch-runner, watchlist-digest, investor-weekly-digest, investor-followups, svi-index-populate.
- Persona check: isEvaluatorPersona() src/lib/evaluations/progress-shared.ts; EVALUATOR_ACCOUNT_TYPES (investor, investor_angel, investor_vc, accelerator, incubator, advisor, service_provider). Consent tiers attributed_only < reports_shared < full_mentor (src/lib/mentor/access-tiers.ts).
- Plans (src/config/pricing/plans.csv): investor_angel Scout A$79 (profiles 25, watchlist 25, reports/mo 10, seats 1); investor_advisor Firm A$149 (50/30/3, advisor_portal, white_label); investor_vc_small Program A$349 (200/100/5, portfolio, lp_export, lp_report, api); investor_vc_ent + accelerator_* Contact Sales.
- Trust BizReport price: FEATURE_COSTS.trust_report = A$3, rescore A$1 (src/lib/credits.ts); quota src/lib/evaluations/report-quota.ts (10/30/100 per month; trial 1).

## Matching
- Investor→startups: getDealFlow() (broken join).
- Startup→investors (T0251): src/lib/funding/investor-match.ts FIT_WEIGHTS {sector 40, stage 30, geo 20, svi 10}, FIT_FLOOR 40, SECTOR_SYNONYMS regex; shown on /workspace/funding; "Request intro" is mailto.
- UNUSED rich schema from 20260822_investor_portal_core.sql (zero code refs): investor_organisations, investor_organisation_members, investor_mandates (sectors_include/exclude, geographies, stages, cheque_min/max_aud, ownership_target_pct, revenue_min_aud, growth_min_pct, risk_tolerance, esg_constraints, lead_or_follow, weights), claims, claim_verdicts (VERIFIED…INSUFFICIENT_DATA), investor_scores, confidence_scores, mandate_fit_scores, risk_items, investment_theses, dd_projects/dd_items, ic_reports, portfolios/portfolio_positions/portfolio_alerts, investor_decisions.

## Startup taxonomy today — NO canonical enum; ≥6 sector vocabularies + ≥5 stage vocabularies
- projects.industry free text; projects.stage int 0–7; svi_accounts.current_stage; svi_snapshots analysis_json.sector/industry; svi_index_snapshots.sector/stage/state text (svi-index-populator.ts: analysis.sector else detectSector); startup_listings.sector/stage/hq_state text; funding_intakes.industry_tags[] from INDUSTRY_OPTIONS (src/lib/funding/intake.ts: software_saas, ai_ml, fintech, healthtech_medtech, biotech_pharma, cleantech_renewables, climate, agtech_food, advanced_manufacturing, defence_dualuse, space, quantum, …).
- detectSector() src/lib/svi-analysis.ts:122 → ~27 slugs (healthtech, biotech, fintech, wealthtech, insurtech, edtech, deeptech, legaltech, proptech, hrtech, agtech, cleantech, spacetech, constructiontech, cybertech, logisticstech, retailtech, govtech, sportstech, traveltech, mediatech, gaming, marketplace, ecommerce, saas…).
- Valuation Sector type src/lib/valuation/sector-multiples-static.ts (27 keys incl ai, default) + sector_multiples_overrides (0369) CHECK list.
- src/lib/svi/sector-map.ts industryToSector() → 9 BenchmarkSector (saas, marketplace, fintech, healthtech, climatetech, hardware, consumer, deeptech, default) → svi_sector_benchmarks.
- src/lib/startup-index-listings.ts SECTOR_LABEL (8) + SECTOR_OPTS.
- Stage: src/lib/journey-vocabulary.ts CANONICAL_STAGES (8: idea, validation, mvp_early_revenue, seed, series_a, series_b_c, late_stage, public_exit) + sviStageToCanonical(0–7); journey-map.ts 12 phases→8 stages; run-for-project.ts STAGE_LABELS; benchmarks.ts STAGES; cofounder-match.ts STAGES; investor StageBand.
- No business_model / tags / category column anywhere. IntakeContext (src/lib/intake/detect-context.ts) detects business type at analysis time, not persisted.

## Gaps
1. No structured investor preference form (only discoverable/firm/thesis).
2. Prefs = jsonb blob; investor_mandates + 15 tables exist unused.
3. No canonical sector/industry/stage taxonomy.
4. Deal-flow join broken → filters no-op.
5. No evaluator verdict/scoring object (only label + notes); no IC memo / pass-proceed decision; unused claim_verdicts/investor_decisions/ic_reports intended for it.
6. Portfolio page static; investor_portfolio no write UI.
7. (investor) group empty; role-taxonomy has no investor role.
8. /workspace/evaluation vs /workspace/evaluations collision; /investor vs /investors public collision.

## Docs
- docs/plans/SOURCE-OF-TRUTH.md §G12 (lines 281–288), G11+G12 unified sprint (159–163), register rows G12-P1…P8 (364–371).
- docs/plans/evaluator-traction-2026-09-10.md (G12 goal doc: ladder, differentiators, 90-day traction T1–T4, appendices).
- docs/plans/money-finder-2026-09-10.md (G11; investor reverse-match).
- docs/plans/role-based-2026-07-25/00-consolidated-taxonomy.md (6 roles; NO investor role).
- docs/plans/reviews/money-paths-review-2026-09-10.md, release-qa2-journeys-2026-09-12.md, plan-review-ir.md, plan-review-cro.md.
- docs/goal-5b-investor-pack-v2.md, docs/goal-5c-au-startup-public-index.md.
