# BlockID.au Product Roadmap

> Startup Verification Intelligence for Australian founders.
> Last updated: 2026-06-17 (v2.6 shipped)

---

## Phase 1: Foundation (Completed - May 2026)

- [x] SVI v2 engine (8 dimensions, stage detection)
- [x] Homepage redesign (Google-style minimal search)
- [x] Auth system (Google OAuth + magic link)
- [x] Supabase self-hosted (22 tables, 13 migrations)
- [x] Docker deployment + GitLab CI (3-stage pipeline)
- [x] Basic email (magic link, score notifications)

## Phase 2: Monetization (Completed - May 19, 2026)

- [x] Stripe full lifecycle (checkout, portal, webhook, cancel, reactivate)
- [x] Credit/usage system (hybrid: trial + credits + subscription)
- [x] Founding 50 offer ($49 + payment link email)
- [x] 5 pricing tiers + credit packs
- [x] 8 email templates
- [x] Evidence Vault + Google Drive integration
- [x] 10-page SVI report UI
- [x] Workspace (dashboard, billing, reports, roadmap, profile)
- [x] Admin panel (growth analytics, documents, users)
- [x] i18n EN/VI
- [x] 62 unit tests

## Phase 2.6: SVI Quality + SCN Framework (Completed - June 17, 2026)

### v2.3 — Auto-name + 4-lens deep valuation (T0214)
- [x] Project-name extractor (URL title → og:site_name → hostname → first noun)
- [x] 4 independent valuation lenses: Investor (VC method) · Market (TAM × penetration) · Operational (UE × multiple) · Ecosystem (AVCAL stage-median)
- [x] Blended valuation band with data-quality-weighted lenses
- [x] Market sizing (TAM/SAM/SOM) per sector with AVCAL/Cut Through sources
- [x] 3 revenue scenarios (conservative/base/optimistic) + AU peer comparables
- [x] Risk flags + method notes auditable per lens

### v2.4 — SCN action plan + "Your Number" hero (T0215)
- [x] "Your Number" hero (SVI + blended valuation + plain-English explainer)
- [x] 5-layer SCN journey: Validation → Position → Value → Direction → Capital
- [x] Per-layer status (complete / in_progress / gap) + unlock criteria
- [x] Stage- and sector-aware action library (P0/P1/P2 + effort + impact)
- [x] "This week" single most important move with HOW-TO tactic
- [x] 30 / 60 / 90 day plan with measurable goals + required evidence
- [x] Valuation levers — concrete A$ uplift estimates per move

### v2.5 — Maturity guard + real cohort percentile (T0216 / T0102)
- [x] Established-company detector (well-known domains, tickers, IPO, 500+ employees, 20+ years)
- [x] Valuation confidence forced to "low" when scale-up detected + risk flag prepended
- [x] Real percentile from svi_index_snapshots (stage ±1, last 180d, min n=20)
- [x] Fallback to band-based estimate when cohort too small
- [x] 8 new unit tests for maturity branches (109 total)

### v2.14 — Startup Value Index Exchange (T0228 / T0213 brand landing)
- [x] Goal doc + C-Level role assignment + IA in `.claude/goals/startup-value-index-exchange.md`
- [x] `lib/startup-index-aggregator.ts` computes BSI-AU, sector + stage indices, top movers
- [x] `/api/index/headlines` public JSON endpoint (cached 5min)
- [x] `/index` rebuilt investing.com-style: hero + sparkline + sector heatmap + top movers + stage strip + CTA + methodology + citation
- [x] Anonymous ticker scheme — no PII exposed
- [x] startupvalueindex.com domain already routes here via nginx (T0212)

### v2.13 — Accelerator Criteria Library + PDF Checklist page (T0227)
- [x] `/dashboard/accelerator-criteria` searchable browser (Beta)
- [x] PDF Page 1.8 "Accelerator-Ready Checklist" with heatmap + top 5 lift moves
- [x] Sidebar nav: Accelerator Criteria (Beta) added to Fundraise group
- [x] Self-analysis refreshed with v2.12 + v2.13 outputs

### v2.12 — AU Accelerator Knowledge Base (T0226)
- [x] Goal doc + C-Level role assignment in `.claude/goals/au-accelerator-knowledge-base.md`
- [x] `knowledge_entries` schema (migration 0065) — applied live
- [x] 30 seeded criteria across 8 accelerators (Antler / Startmate / YC / Techstars / SkyDeck / MVi / Cicada / Blackbird) with citations
- [x] `lib/agents/accelerator-readiness.ts` evaluation engine — met / partial / gap + valuation lift estimate
- [x] `/api/svi` populates `analysis.acceleratorReadiness`
- [x] `AcceleratorReadinessCard` Beta on `/dashboard/svi` with heatmap + tactic + citations
- [x] FIX: split client-safe types out of `lib/founder-profile.ts` (root cause of two stuck v2.10/v2.11 deploys)

### v2.11 — Founder Profile builder (T0224)
- [x] Migration `0064_founder_profiles.sql` — ship history, advisors, insight, ambition
- [x] `/workspace/founder-profile` UI (Beta) with live completion meter + safe coercion
- [x] Auto-feeds Antler Team signal — fill in profile → next analysis lifts Team score without manual paste
- [x] Sidebar: Founder Profile (Beta chip) added to Account group

### v2.10 — Antler signals + C-Level report fallback (T0222 / T0223)
- [x] 5-signal Antler/Sequoia/a16z evaluation (Team / Progress / Invention / Vision / 10× Product)
- [x] Deterministic scoring + standout + weakest-link + how-to-lift
- [x] Dashboard `AntlerSignalsCard` (Beta) + 6 vitest cases (115 total)
- [x] C-Level report 3-day fallback fixes "No report available" on morning loads

### v2.9 — Feature lifecycle chips (T0220)
- [x] Killed "Coming soon" everywhere user-visible on the dashboard
- [x] Introduced lifecycle states: beta (amber) · live (blue) · stable (no chip)
- [x] 6 features tagged beta, eligible to promote 2026-06-30 / 2026-07-01
- [x] `docs/FEATURE_LIFECYCLE.md` — promotion criteria + calendar + anti-patterns

### v2.8 — Revenue activation (Stripe fix + share + A/B) (T0206/T0211/T0219)
- [x] `scripts/sync-stripe-pricing.mjs`: Node CLI auto-fixer
- [x] Founding 100 Stripe Price fixed (A$49 → A$3) via new `price_1TjJBqJ7OAnXQ9sVRnW931FT`
- [x] Share-on-LinkedIn / Tweet / Email / Copy buttons on `/s/[slug]` (T0211 backlink loop)
- [x] Pricing A/B test infra (T0206): `lib/ab-pricing.ts` + `/api/ab/pricing-expose` + `/dashboard/admin/pricing-test` UI
- [x] 4 variants live: A$1 / A$3 (control) / A$5 / A$10 with deterministic anon_id bucketing
- [x] Sidebar Admin: Pricing A/B link

### v2.7 — Stripe pricing sync + cross-check (T0218)
- [x] `lib/stripe-pricing-audit.ts` deterministic audit (platform-config vs Stripe API)
- [x] Per-plan status: match / drift / archived / missing_price_id / lookup-failed
- [x] `createFreshStripePrice()` helper (Prices are immutable → create new + archive old)
- [x] `/api/admin/stripe-sync` GET (audit) + POST (create price), admin-only
- [x] `/dashboard/admin/stripe-sync` UI: live table, one-click create, copy env var, workflow guide
- [x] Sidebar Admin: Stripe Sync link

### v2.6 — Drill-down detail + SVI explainer (T0217)
- [x] Generic admin detail route /dashboard/admin/detail/[metric] (6 slugs: users, analyses, paying-customers, email-subscribers, company-profiles, revenue)
- [x] Every 30-Day scoreboard metric card now links to its drill-down with row count chip
- [x] Bonus "Registered users" card with click-through to user list
- [x] SVI Explainer card with SVG radar chart (8 dimensions, no external lib)
- [x] Top-3 contributors + bottom-3 drags ranked by adjustment
- [x] Expandable per-dimension guide with WHY-it-matters + 3 quick-wins + deeplink to tool
- [x] Pricing bump: Founding 100 from A$1 → A$3 (full-page analysis value)

## Phase 2.5: Enhanced SVI & Multi-Agent Reports (Completed - May 30, 2026)

- [x] 13-Criterion Evaluation System (Idea, Market, Founder, Code/Git, Website, Team, Customer Size, GTM, Documents, Dataroom, Team Structure, Roadmap, Revenue)
- [x] Multi-agent report pipeline (CEO orchestrator + 10 C-Level agents)
- [x] 3-phase report generation: Gather → Analyze (3 waves) → Synthesize
- [x] 21 report sections with agent ownership
- [x] DOCX export with embedded charts and brand styling
- [x] AI image generation for reports (Gemini/OpenRouter/DALL-E + Mermaid diagrams)
- [x] Enhanced email with DOCX+PDF attachments
- [x] Agent self-research cron (scheduled per agent role)
- [x] CEO Goal Tree with KPIs per agent
- [x] Evaluation wizard UI (13 criterion cards with file upload, links, AI suggest/score)
- [x] 9 AI providers: OpenRouter (24 free models), Gemini, Groq (4 models), Cerebras, SambaNova, Claude OAuth, OpenAI Codex, Claude/OpenAI API, Ollama
- [x] Agent knowledge base for self-improving prompts
- [x] SVG chart renderers (radar, bar, funnel, heatmap, progress gauge)
- [x] Credit pricing: Standard 3.0, Premium 7.0, Investor 10.0

## Phase 3: Growth (June - July 2026)

- [ ] SEO landing pages for each free tool
- [ ] Referral program (earn credits)
- [ ] Accelerator cohort dashboard
- [ ] White-label for advisors/accountants
- [ ] Advanced cap table health check
- [ ] Data room with investor tracking
- [ ] Push notifications (in-app)
- [ ] PDF export for all reports

## Phase 4: Scale (August - October 2026)

- [ ] Compliance checkers (ESIC, R&D tax, ASIC)
- [ ] Investor heat scoring
- [ ] Multi-entity cap table
- [ ] Custom branding for Growth plan
- [ ] API access (developer portal)
- [ ] Webhooks for enterprise integrations
- [ ] Onboarding automation

## Phase 5: Ecosystem (Q4 2026+)

- [ ] Investor marketplace (after 100 paying users)
- [ ] Secondary liquidity tools
- [ ] Blockchain anchoring (optional proof)
- [ ] Community features
- [ ] AI co-pilot for fundraising prep

---

## KPIs & Targets

| Metric                 | Current | 3-Month Target | 6-Month Target |
| ---------------------- | ------- | -------------- | -------------- |
| Registered users       | 0       | 200            | 1,000          |
| Paying customers       | 0       | 50             | 200            |
| MRR (AUD)              | $0      | $5,000         | $30,000        |
| SVI analyses/month     | 0       | 500            | 2,000          |
| Free tool usage/month  | 0       | 1,000          | 5,000          |
