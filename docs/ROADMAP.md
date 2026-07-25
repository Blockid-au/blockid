# BlockID.au Product Roadmap

> Startup Verification Intelligence for Australian founders.
> Last updated: 2026-07-25 (v2.0.0-beta.10 deployed; release `YaGloNOpIM1WO3Kah9iRc`, sha `3b3878ba`)

---

## Phase 3.0: Startup Package Ship 1 (Completed — 2026-07-25)

Guided founder journey from idea → SVI → dataroom → reserved cap-table, wrapped in a single Stripe SKU. Full plan: `/home/dovanlong/.claude/plans/spawn-agent-v-d-ng-cosmic-aho.md`. Migration `0118_startup_package.sql`.

- [x] Sub-goal 1 — DB + entitlement: 4 tables (`startup_package_{purchases,interview,reserved_allocations,progress}`), Zod row schemas in `lib/startup-package/{types,repo}.ts`, `startup_package` feature slug in `tier-visibility.ts`
- [x] Sub-goal 2 — Stripe SKU + checkout: `founder_package` (A$149 one-off + 25 seed credits), `STRIPE_PRICE_STARTUP_PACKAGE`, webhook grants credits + creates purchase row + seeds Day-0 dataroom
- [x] Sub-goal 3 — Guided interview UI: `/startup-package/interview/[step]`, 8 phase-mapped steps, useReducer + localStorage state, `/api/startup-package/save-answer` (POST) with 60/hour rate-limit
- [x] Sub-goal 4 — Agent dispatch: `/api/startup-package/analyze` (POST) — one lead-agent per step, 5/hour rate-limit, credit-priced with 402-if-insufficient, persists to `assembled_reports`
- [x] Sub-goal 5 — SVI real-time recompute: `svi-recompute.ts` writes `svi_snapshots` with `source:'package_step'` after every answer + analyze; live meter component on dashboard
- [x] Sub-goal 6 — Package dashboard `/startup-package/[projectId]`: 3-column responsive layout (phase list + phase card + SVI meter/reservation) with credit-priced "Auto-fill" buttons
- [x] Sub-goal 7 — Auto-fill deliverables: `/api/startup-package/deliverable/[slug]` dispatches to the matching PDF generator, uploads to `dataroom` bucket, inserts `dataroom_files` row with `template_slug='package_<phase>_<key>'`
- [x] Sub-goal 8 — DB-first cap-table reservation: min-10% + 3-4-letter ticker in `startup_package_reserved_allocations`. On-chain button greyed out (Ship 2)
- [x] Sub-goal 9 — Public `/startup/[slug]` listing: OG image, generateStaticParams, filtered by `public` flag on `assembled_reports`
- [x] Sub-goal 10 — Weekly progress email: package-progress block prepended to `founder-digest.ts` when `email_preferences.package_progress`
- [x] Sub-goal 11 — Feature-tour registered as `startup-package` slug (5 steps: buy → interview → analyze → dashboard → auto-fill)
- [x] Sub-goal 12 — Nav entry + `/docs/startup-package` guide page + Playwright smoke + integration tests (89/89 passing)
- [x] Sub-goal 13 — Unicorn Playbook: 14 tasks (from Atlassian/Canva/Xero/SafetyCulture recon) in `unicorn-playbook.ts`, collapsible on phase card, case-study milestones extracted to shared module

**Verified live:** `https://blockid.au/startup-package` → 200 · `/docs/startup-package` → 200

## Phase 3.1: Startup Package Ship 2 (Planned)

Full spec in plan file. Ship 2 deliverables:

- [ ] On-chain token mint (wire greyed-out button to `/api/blockchain/create-token`; EVM address collection + gas subsidy policy)
- [ ] Pitch video Remotion composition (1-min + 3-min variants; mirror `how-it-works` scene pattern)
- [ ] Custom subdomain hosting `[slug].blockid.au` (Cloudflare wildcard + Next 16 host-routing)
- [ ] ABN + trademark guide report (PDF generator + IP Australia / ABR affiliate links; 1 credit/report)
- [ ] Accelerator apply drafter (LLM drafts application text from interview + SVI; per-program)
- [ ] Financial projection + GTM auto-fill deliverables (dedicated CFO/CMO agent flow)
- [ ] CRM link (HubSpot vs native; Zapier webhook over `startup_package_purchases`)
- [ ] 90-day-revenue tracker tile (GA4 Data API + Stripe; both already wired)
- [ ] Conference recommender (curated `conferences` seed JSON)
- [ ] Author real DOCX bodies for the 14 unicorn playbook tasks (currently stubs)
- [ ] Model Canva / Xero / SafetyCulture as first-class fixtures like `showcase/atlassian/fixture.ts`
- [ ] Fix `/startup/[slug]` 500 on nonexistent slug — should `notFound()` instead

---

## Phase 2.7: Reseller / wholesale module v1 (Completed - July 2026)

- [x] P0 – P10 wire-shape pins across `/admin/resellers` list + detail (~300 wire ticks)
- [x] P11.1 – P11.48 weekly digest snapshot pipeline (delta, rolling-N-week, top-movers, per-metric %-change coverage, sustained-direction streaks, per-reseller drill-down, `contribution_margin_pct`)
- [x] P11.40 – P11.45 per-(reseller × metric) pct-change coverage in weekly digest cron
- [x] P12 admin user/role management (account_type enum, user detail, impersonation trail, Playwright E2E)
- [x] CISO D3-CISO-06 — block Stripe customer portal for wholesale-provisioned founders
- [x] SOC2-lite audit-log writes on admin reseller CRUD
- [x] k-anon suppression + complementary-value redaction on aggregate metrics

## Phase 2.8: Compliance forms (Completed - July 2026)

- [x] P1n-gst-form founder-facing GST threshold form
- [x] P1n-s708-form founder-facing s708(1) small-scale counter form
- [x] P10-s708counter s708(1) small-scale personal-offer counter engine
- [x] P10-s708counter-adapter share-register → S708OfferEvent normaliser
- [x] P1n-esic-route `/compliance/{esic,s708,gst,rd}` deep-link pages
- [x] P1n WGEA + Modern Slavery threshold detectors + detail-page forms + dashboard
- [x] P6a Div 83A ESOP scheme-rules gate

## Phase 2.9: Atlassian-goal exit-readiness tile (Completed - July 2026)

- [x] P2a AU Customer Letter of Intent template
- [x] P2b AU Customer Discovery Interview Log template
- [x] P5a-tile per-phase `InvestorReadinessTile`
- [x] P5b mount `InvestorReadinessTile` on `/dashboard/svi`
- [x] P6a-ir-pack — Div 83A tests wired into ch09 investor pack
- [x] P6b wholesale-only fundraise UI toggle + helpers + vitest
- [x] P7a founder-side weekly digest cron
- [x] P7b svi_readiness_snapshots table + pure delta helpers
- [x] P11-acquisition-pattern Chapter 11 section
- [x] P11-acquisition-wizard pure helper — 90/10 deal-shape checker
- [x] P12a AU comparable-exits data source
- [x] P12b wire AU exit benchmark into ch09+ investor pack + CFO valuation
- [x] P12b-tile `/dashboard/exit-readiness` founder tile

## Phase 2.10: Real-world workflow parity (In progress - July 2026)

- [x] Canonical journey vocab v1.0.0 + 12↔8 bucket maps (item 1)
- [x] Showcase 8-stage badges (item 2)
- [x] Onboarding Step 6 wired (item 3)
- [x] SCN → Startup Compass rename (item 4)
- [x] 102-doc data-room shipped (item 5)
- [x] Guide Ch8 ShipIt + Pledge 1% culture callouts (item 8)
- [x] Traction P5-cohort retention chart auto-draw (item 9)
- [ ] Airwallex + Culture Amp showcase (item 6 — founder review)
- [ ] Chapter 10 callout arc (item 7 — founder review)
- [ ] Item 10 (founder review)

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

### v2.17 — SVI Exchange autonomous orchestration framework (T0233)
- [x] `.claude/goals/svi-exchange-orchestration.md` — model + escalation rules + C-Level mapping
- [x] 15-task seed queue (`svi-exchange-tasks.json`) covering v0.2-v0.9 of the brand-domain roadmap
- [x] `/api/cron/svi-exchange-orchestrator` GET+POST (CRON_SECRET-gated) advancing 1 task per cycle
- [x] `/dashboard/admin/svi-exchange` Beta cockpit — stats, phase progress, log, escalations, queue
- [x] Sidebar admin: SVI Exchange link (Beta)
- [ ] Production cron entry `0 */6 * * *` — wire via crontab once deployed

### v2.16.1 — startupvalueindex.com DNS live + monitoring + north-star goal (T0232)
- [x] Cloudflare A records pointing apex+www to origin IP via existing DDNS token
- [x] Brand domain serves all 6 routes live (~70ms p95)
- [x] Uptime watcher parametrised + crontab monitors both blockid.au + startupvalueindex.com
- [x] `GOAL.md` in standalone repo — 4-phase north star (listings → investor → liquidity → index licensing)

### v2.16 — Standalone startupvalueindex.com app + brand + trademark (T0231)
- [x] Separate Next.js repo at `/home/dovanlong/startupvalueindex.com` — zero-DB, read-only consumer of blockid.au API
- [x] Brand: wordmark + slogan "Live Startup Valuations" + SVI monogram logo
- [x] 4 pages (`/`, `/listings`, `/listings/[ticker]`, `/about`) + JSON feed
- [x] systemd service for auto-restart + nginx vhost flipped from proxy-to-blockid.au to proxy-to-127.0.0.1:4002
- [x] `TRADEMARK.md` filing plan for IP Australia (classes 35/36/42, ~A$3.5-5K)

### v2.15 — Startup Value Index Listings (T0230)
- [x] Goal doc + C-Level role assignment in `.claude/goals/startup-value-index-listings.md`
- [x] `lib/startup-index-listings.ts` aggregator (paginated/filterable/sortable) + detail
- [x] `/api/index/listings` + `/api/index/listing/[ticker]` cached 5min
- [x] `/index/listings` ranked table (Beta) — sortable, filterable, sparkline col, pagination
- [x] `/index/listings/[ticker]` detail page (Beta) — SVI history chart, Antler bars, accelerator gaps, 4-lens valuation
- [x] `/index` hero cross-links to "Browse all N listings"
- [x] Anonymous tickers by default; public names only on opt-in

### v2.14.1 — Uptime guard (T0229)
- [x] `scripts/uptime-watcher.sh` 1-min cron with 3-fail-restart / 5-fail-rollback graduated response
- [x] State + log + Telegram throttle layer
- [x] `docs/UPTIME_GUARD.md` runbook

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
- [x] Accelerator cohort dashboard (v2.13)
- [x] White-label for advisors/accountants (Phase 2.7 reseller module v1)
- [ ] Advanced cap table health check
- [x] Data room with investor tracking (102-doc data-room, Phase 2.10 item 5)
- [ ] Push notifications (in-app)
- [x] PDF export for all reports (Q3 PDF-BRAND — 3-layer gate + renderer wire-in)
- [x] Share buttons on public shares (T0211 — LinkedIn / Tweet / Email / Copy on /s/[slug])
- [x] Pricing A/B test infra (T0206 — 4 variants live)

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
