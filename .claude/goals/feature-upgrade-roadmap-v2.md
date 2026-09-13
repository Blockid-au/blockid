# BlockID.au Feature Upgrade Roadmap v2 — Post Go-Live

> **Source of truth: [docs/plans/SOURCE-OF-TRUTH.md](../../docs/plans/SOURCE-OF-TRUTH.md)** — this file is a specialised view; consult the source-of-truth first for status.

## Current Status (May 2026)
- 455+ goal items completed
- Platform live at blockid.au
- 19+ users, 200+ SVI analyses
- 14 cron tasks self-upgrading
- 14 email triggers active
- K8s Phase 1 ready

---

## Q3 2026 (Jul-Sep) — "Growth & Monetization"

### Revenue Features (CFO + CRO)
- [x] Admin credit management dashboard (/admin/credits with search/filter/grant/revoke) (building now)
- [x] Stripe upgrade/downgrade already implemented (billing-client.tsx + stripe API) flow in workspace
- [x] Credit purchase upsell (enhanced credit-gate with Founding 50 CTA + pack options)
- [x] Enterprise tier with team features ($499/mo) (shipped — Contact Sales row Enterprise custom + `founder_enterprise` plans.csv + `/workspace/projects/[slug]/members`, `d7557c3ec`)
- [x] Accelerator partnership pricing ($20K/year per cohort) (shipped — Contact Sales Accelerator from A$500/mo + `accelerator_*` cohort SKUs plans.csv, `d7557c3ec`)
- [x] Annual billing: Growth A$950/year (20% off) with Monthly/Annual toggle (20% discount)

### Report Quality (CTO + CPO)
- [x] Industry-specific: 7 industry guidance prompts auto-detected from input (SaaS, marketplace, fintech)
- [x] PDF branding customization for paid plans (shipped — `/workspace/branding` + `lib/branding/*` + renderer wire `lib/pdf/svi-report-pdf.tsx`, `b9311f0eb`/`adbc48326`)
- [x] Interactive radar chart (Recharts RadarChart, 8 dimensions in report) (Chart.js/Recharts)
- [x] SVI trend chart (Recharts LineChart, 30-day delta on dashboard)
- [ ] Export to Google Slides (from report data) (open — not found in code)

### User Experience (CPO + CRO)
- [x] Onboarding wizard (3-step: profile→SVI→evidence with AIThinkingStatus)
- [x] Dashboard personalization (pin widgets, reorder cards) (server-synced 2026-09-11)
- [x] Dark mode toggle (ThemeToggle component + CSS custom properties + localStorage)
- [x] Vietnamese: full report translation (page titles + AI prompt + deep dive) full translation)
- [x] PWA setup (manifest, theme-color, apple-web-app, installable)

### Growth (CMO + CRO)
- [ ] ProductHunt launch campaign (partial — launch kit `docs/marketing/traction-kit-2026-09/producthunt-launch-kit.md` written; launch not executed)
- [x] Referral v2: referrer gets 2 cr, referee gets 1 bonus cr (2-sided) (2-sided: referrer + referee get credits)
- [x] Content hub with founder guides (shipped — `/guide`, `/guide/[chapter]`, `/guides/*`, `lib/guide/startup-journey.ts`, `c28385d65`)
- [ ] Community (Discord/Slack with SVI leaderboard) (partial — SVI leaderboard `/startup-index/listings` live; no Discord/Slack community)
- [x] Partner API: POST /api/v1/analyze (API key auth, credit deduction, clean JSON) (programmatic SVI)

---

## Q4 2026 (Oct-Dec) — "Scale & Enterprise"

### Money Finder & Founder Radar — G11 (CFO + CLO + IR + CMO + CTO) · **all sprints shipped 2026-09-10** (5 releases, last `fea2aa62b`) · plan [`docs/plans/money-finder-2026-09-10.md`](../../docs/plans/money-finder-2026-09-10.md)
- [x] P0 goal doc + AU grants seed (56) + programs seed (8 capitals + national) — 2026-09-10, plan-only
- [x] P1 public nav → 5 items + "Do you need money?" CTA; legacy navbar mirrors; unlock-preview strip
- [x] P2 migration `0308_au_funding.sql` (`au_grants`, `au_programs`, `funding_reports`, `project_grant_profiles`) + seed script + `/admin/funding`
- [x] P3 `lib/agents/grant-advisor.ts` (deterministic match/score/timeline → LLM narrative, RDTI/ESIC A$ estimate) + tests
- [x] P4 `/funding` landing + free preview + A$3 guest SKU + credits/plan gate + `POST /api/funding/report`
- [x] P5 paid report page (cards, 12-month SVG Gantt, actions, disclaimers) + PDF + save to data room + `/workspace/funding`
- [x] P6 public SEO directories `/funding/grants`, `/funding/programs/[city]` + JSON-LD
- [x] P7 weekly `refresh-funding-sources` cron (GrantConnect RSS, Qld CKAN, state portals) + agent research topics + review queue
- [x] P8 pricing row, insight cross-links, GA4 events, stripe sync drift fix
- [x] P9 `funding_matches` + `money-radar-sweep` + notification kinds + `money_radar` email category + ICS
- [x] P10 radar drips T-30/14/3 + weekly digest money block + events + `svi_trend_alert` writer
- [x] P11 Founder Radar bundled into Starter A$29 (flag `money_radar`) + A$3→subscribe upsell card
- [x] P12 Growth extras: investor reverse-match, per-grant application drafts, quarterly expert refresh (v2)
- [x] P13 dashboard `MoneyRadarTile` (5 states) + `/workspace/funding` tabs + messaging copy EN/VI
- [x] P14 hero one-liners (founder / investor / general, EN+VI) — truth check, 5-second + say-it-back tests, A/B via `cta-variants.ts`; winners → hero, `/solutions/*`, og, i18n, directory bios; recorded in G9

### Evaluator Traction — G12 (CRO + CTO + CFO + CPO + CMO + CLO) · **all sprints shipped 2026-09-10** (last release `fea2aa62b`) · plan [`docs/plans/evaluator-traction-2026-09-10.md`](../../docs/plans/evaluator-traction-2026-09-10.md)
- [x] P0 goal doc + research (54 competitors, JTBD, ChatGPT evidence, AU sizing) — 2026-09-10, plan-only
- [x] T0268 Scout A$79 / Firm A$149 / Program A$349 public in `plans.csv` + limits + `/pricing` Evaluator tab + retire A$5.50 SKU (A$3 = full Trust BizReport)
- [x] T0269 evaluator signup with card-required 7-day Stripe trial; `account_type` investor/accelerator/incubator/advisor/service_provider
- [x] T0270 "Startups I'm evaluating" object + consent tiers + missing migrations (investor_portfolio, watchlist_digest, advisor_client_roster)
- [x] T0271 in-workspace Trust BizReport A$3 (3 credits / plan quota) + re-score A$1
- [x] T0272 Program batch scoring + cohort table + sponsor/LP report
- [x] T0273 Evaluator Progress Radar digest (merges G11 Money Radar signals)
- [x] T0274 `/solutions/advisor` + investor/accelerator rewrite + "BlockID vs ChatGPT vs a valuer" page + messaging EN/VI + GA4 funnel
- [x] T0275 compliance: data-handling sentence, general-advice disclaimer, doctoral-research wording sign-off

### Multi-Project System Enhancement (CTO)
- [x] Portfolio dashboard (all startups side-by-side) (shipped — `/dashboard/portfolio` + `lib/portfolio.ts`, `c99966915`)
- [x] Cross-project comparison charts (shipped — `components/portfolio/comparison-chart.tsx` 30-day SVI multi-line, `1b4103eee`)
- [x] Team member invite (share project with co-founder) (shipped — `/workspace/projects/[slug]/members` + `api/projects/[id]/members` + `/invites/[token]`, migration 0105, `fa3744bbf`)
- [x] Project-level permissions (viewer, editor, admin) — **shipped S18-A 2026-09-12**: `getProjectScope`/`projectScopeOrDeny` member-aware on every project route, static guard `projects.scope-guard.test.ts` (rules A–C); `/api/fundraise` converted S26-review 2026-09-13
- [x] Project archiving with data retention (shipped — `/workspace/projects/archived` + `api/projects/[id]/archive` + `api/cron/archived-purge` 90-day, `feac5fde8`)

### Valuation Engine v3 (CTO + CFO)
- [x] Real-time valuation from connected Stripe data (shipped S17-B — `lib/valuation-mrr-bridge.ts` reads Stripe `svi_signals.mrr_aud` + Xero `xero_revenue` (3-mo P&L ÷ 3), ARR × `SECTOR_MULTIPLES` range narrows (overlap) / widens + `method_note` (disjoint), > 90 d ignored; wired into `api/valuation`, `api/valuation/vc`, `api/score` → `startup_score_history.valuation_method` (migration 0330); "Includes connected revenue (A$X MRR from Stripe/Xero)" on the VC dashboard + history)
- [ ] Comparable startup database (anonymized, 1000+ AU startups) (partial — ~71 named rows `lib/au-comparable-raises.ts` + `lib/data/au-comparables.ts`; no anonymised 1000+ DB)
- [x] Sector-specific multiples auto-updated quarterly — **shipped S27-C 2026-09-13**: approved-override resolver over the static table (0369), quarterly `sector-multiples-refresh` cron proposes rows only with verbatim fetched excerpts, admin approve/reject at `/dashboard/admin/sector-multiples`; nothing changes without an admin approval
- [x] Valuation certificate PDF (for investor DD) — **shipped S22-A 2026-09-12**: `VC-XXXXX-XXXXX` + content hash, `/verify/valuation/[no]`, revoke, 5 credits / Growth+ (0341)
- [x] Historical valuation graph (SVI timeline → AUD) (shipped S17-B — `components/dashboard/valuation-trend-chart.tsx` Recharts SVI panel + A$ low–high band / midpoint on a right axis, table twin + sr-only summary, light/dark; on `/dashboard/history` (list + per-startup) from `startup_score_history` rows; `/workspace/svi-trend` shows the `svi_snapshots.estimated_valuation` point series via `/api/svi/history/full`)

### Enterprise Features (CTO + CRO)
- [ ] White-label option (custom domain, branding) (partial — `/workspace/white-label` is a coming-soon stub; PDF branding only, no custom domain)
- [ ] SSO (SAML/OIDC for enterprise clients) (open — not found in code (`/workspace/sso` is a coming-soon stub))
- [x] API access with rate limits per plan (shipped — `/workspace/api-keys` + `lib/api-keys.ts getRateLimitForPlan` + `api/v1/*`, migrations 0024/0107, `51d424dc3`)
- [x] Webhook notifications (SVI change, evidence uploaded) — **shipped S20-B 2026-09-12**: `webhook_endpoints`/`webhook_deliveries` (0336), HMAC signature, retry ladder, `webhook-dispatch` cron, `/workspace/integrations`
- [x] Audit log for compliance (all user actions) — **shipped S20-A 2026-09-12**: `apiRoute()` on 298 route files, hash-chained `audit_events`, nightly chain verify → `/api/status`, coverage guard test

### Data Room v2 (CTO + CPO)
- [x] One-click data room from evidence vault (shipped — `api/data-room/generate` + `lib/data-room.ts composeRoomDocuments` pulls `svi_evidence`, `4778b625b`)
- [x] Document watermarking (per-investor) — **shipped S21-A 2026-09-12**: `@react-pdf` fixed layer, traceable `link <id8>` (`lib/pdf/watermark.tsx`)
- [x] View analytics (investor engagement heatmap) — **shipped S21-A 2026-09-12**: link × section views/dwell heatmap + table twin; `investor_viewed` founder alerts S26-A 2026-09-13
- [x] NDA management (click-wrap) — **shipped S21-A 2026-09-12**: server-enforced click-wrap gate before any document, acceptances retained (privacy v2.3, 0342)
- [x] Follow-up automation (auto-email after investor views) — **shipped S26-A 2026-09-13**: opt-in per data-room link (`auto_follow_up`), 2 business days after a view, `investor-followups` cron 21:00 UTC, NDA/once-per-link vetoes

---

## Q1 2027 (Jan-Mar) — "Equity & Investment"

### Cap Table v2 (CTO + CBO)
- [x] Equity round wizard (SAFE, convertible note, priced round) (shipped — `lib/fundraise.ts` (priced/safe/convertible_note) + `/workspace/fundraise` + `/workspace/fundraise/structure` + `/workspace/equity-setup`, `338f86a02`)
- [x] Auto share-price from SVI + multiples — **shipped S26-B 2026-09-13**: `lib/share-price.ts` (40 % SVI / 60 % ARR × sector multiple ÷ fully diluted), `/api/share-price`, cap-table + wizard card with source label
- [x] Dilution simulator (what-if scenarios) (shipped — `lib/fundraise.ts` dilutionTable/dilutionPct + `/workspace/fundraise` client, `338f86a02`)
- [x] Board resolution templates (PDF generation) — **shipped S26-B 2026-09-13**: share issue (s 254X), dividend (s 254T), ESOP adoption; s 248A/248B circular form; `board_resolutions` (0360), 1 credit / Growth+ (regenerate-after-resize still open)
- [x] 409A-equivalent valuation report (AU compliance) — **shipped S27-A 2026-09-13**: ESS annex on the valuation certificate (s 83A-33 checklist from stored facts, ATO *Methods for Valuing Unlisted Shares* Approval 2015 named, explicit not-a-safe-harbour sentence); tax-agent review of the NTA conditions requested

### Fundraise Tools (CRO + CFO)
- [ ] Investor CRM (track contacts, status, notes) (open — not found in code; nearest is per-investor share links `lib/investor-links.ts`)
- [x] Term sheet comparison tool — **shipped S26-B 2026-09-13**: `compareTermSheets()` 13-row matrix + founder-friendliness score, `POST /api/term-sheet/compare` (2 credits / Growth+), compare view
- [x] Fundraise tracker (target, committed, closed) — **shipped S26-A 2026-09-13**: `fundraise_commitments` soft/committed/signed/funded/withdrawn (0355), round progress bar + summary API, `/workspace/fundraise/[roundId]`
- [x] Investor match (based on industry, stage, geography) (shipped — `lib/funding/investor-match.ts` reverse-match on sectors/stages/geos + `/workspace/funding`, migration 0323, `c6d7e1f9e`)
- [x] Auto data room generation for active raise — **shipped S26-A 2026-09-13**: `POST /api/fundraise/[roundId]/activate` links or compiles the room (3 credits, refunded on failure), idempotent

### Blockchain Phase 2 (CBO)
- [ ] Production Cosmos chain (partial — private EVM Anvil chainId 420 + Otterscan (`chain/`, `lib/wallet.ts`); no Cosmos/production chain)
- [x] Per-startup token minting (NASDAQ-style tickers) (shipped — `lib/evm-deploy.ts deployCompanyToken` (tokenSymbol ticker) + `/admin/tokens` + `/workspace/wallet`, `e855b028b`)
- [x] MetaMask wallet integration (shipped — `lib/wallet.ts` (connectWallet, switchToBlockIDChain, addTokenToMetaMask) + `/workspace/wallet`, `98620409e`)
- [x] On-chain share issuance (shipped — `lib/evm-deploy.ts` + `lib/tokenization.ts` shares→tokens + `chain/contracts`, `e855b028b`)
- [ ] Bi-directional cap table ↔ chain sync (partial — read-back + weekly `chain-reconcile` + drift alerts **shipped S27-B 2026-09-13** (0365); push is queue-only because `executeOnChainTx` has no server signer — founder decision)

---

## 2027 H2 — "Revenue & Dividends"

### Revenue Tracking (CFO)
- [ ] Stripe/Xero/QuickBooks connectors (partial — Stripe + **Xero live** (S25-A 2026-09-13: `offline_access`, weekly `connector-resync`, `connector_snapshots` 0349; legacy vault schema drift fixed 0352); QuickBooks needs the founder's Intuit OAuth app)
- [x] Real-time P&L dashboard — **shipped S25-A 2026-09-13**: `/workspace/revenue` fed by Xero (3-month P&L) + Stripe Connect (MRR/ARR/churn) snapshots with per-figure source labels; manual entries remain the fallback
- [x] Revenue-to-SVI automatic feed (shipped — `api/revenue` POST auto-triggers SVI rescore (TRE) + Stripe callback writes `mrr_aud` signal, `f08be00bd`)
- [x] Cash flow forecasting (shipped — `lib/financial-projections.ts` monthly cash outflow/cumCash/runway + `/workspace/financial-forecast` wizard, `71878a50c`)
- [ ] Expense categorization AI (open — not found in code)

### Dividend Distribution (CFO + CBO)
- [x] Dividend calculation engine (shipped — `lib/dividends.ts calculateDividends` + `/workspace/dividends` + `api/dividends`, `9fab48b55`)
- [x] On-chain dividend distribution (shipped — `lib/wallet.ts declareDividend`/claim via DividendDistributor on private EVM + `/workspace/dividends`, `98620409e`)
- [x] Australian tax compliance (franking credits) (shipped — `lib/dividends.ts` franking credit / imputation per shareholder, `9fab48b55`)
- [ ] Shareholder tax statements (open — not found in code)
- [ ] Reinvestment option (DRIP) (open — not found in code)

---

## 2028+ — "Exit & Exchange"

### Exit Modeling (CFO + CLO)
- [x] Exit scenario calculator (IPO, M&A, acqui-hire) — **shipped S26-B 2026-09-13**: `acqui_hire` (team × per-engineer value A$500K–1.5M editable assumption, retention pool vesting, waterfall)
- [x] Valuation multiple benchmarks by sector (shipped — `lib/exits/au-benchmark.ts` + `SECTOR_MULTIPLES` `lib/agents/cfo-valuation.ts` + `/benchmarks`, `fe8f966c1`)
- [x] Due diligence readiness score (shipped — `api/data-room/readiness` + `api/fundraise/readiness` + `/dashboard/exit-readiness` tile, `89aca9c59`)
- [ ] Clean room preparation guide (open — not found in code)
- [x] Post-exit distribution calculator (shipped — `lib/exit-modeling.ts` liquidation-preference waterfall + ESOP + CGT per shareholder, `338f86a02`)

### Exchange Simulation (CBO)
- [x] SVI-to-exchange index (shipped — `lib/svi-index.ts` + `lib/startup-index-aggregator.ts` + `/startup-index` (G-SVI-Exchange 15/15), `71878a50c`)
- [x] Pre-IPO secondary trading simulation — **shipped S27-B 2026-09-13**: sandbox order book (price-time, partial fills, ROFR hold, price discovery) on `/workspace/secondary-offer`, `secondary_market.view` Growth+, Chapter 6D/7 sandbox banner on every view
- [ ] ASX/NASDAQ listing requirements checker (open — not found in code; only insight article `content/insights/asx-listing-requirements-tech-startups.md`)
- [ ] Share/token conversion for real listing (partial — `lib/tokenization.ts` shares→token conversion only; no listing conversion path)

---

## Continuous Improvement (All Agents)

### Self-Upgrade System (Already Active)
- 14 cron tasks monitoring and improving platform
- Weekly competitor research (AI-powered)
- Daily conversion funnel analysis
- Weekly report quality sampling
- Customer care agent generating personalized insights

### Metrics to Track
| Metric | Current | Q3 Target | Q4 Target |
|--------|---------|-----------|-----------|
| Users | 19 | 200 | 1,000 |
| MRR | ~$100 | $2,000 | $10,000 |
| SVI analyses/month | ~50 | 500 | 2,000 |
| Credit utilization | ~10% | 30% | 50% |
| 7-day return rate | ~15% | 30% | 40% |
| Report NPS | Unknown | 40+ | 50+ |

---

## Agent Assignments by Phase

| Phase | Primary Agents | Key Skills |
|-------|---------------|------------|
| Q3 Growth | CRO + CFO + CMO | /cro, /cfo, /cmo, /stripe-test |
| Q4 Scale | CTO + CPO + CRO | /cto, /cpo, /api-designer |
| Q1 Equity | CTO + CBO + CFO | /blockchain-expert, /cfo, /clo |
| H2 Revenue | CFO + CBO | /cfo, /blockchain-expert |
| 2028+ Exit | CFO + CLO + CBO | /cfo, /clo, /investor-relations |

---

## Reconciliation 2026-09-11

Every unchecked item above was checked against `web/src/app/**`, `web/src/lib/**`, `web/supabase/migrations/**`, `chain/`, `docs/` and `git log` (history was rewritten 2026-09-10, so SHAs are first-commit-in-current-history; `e18a91205`/`fa3744bbf`/`feac5fde8` are bulk autonomous-tick commits). Strict rule: stub / coming-soon page or DB column without behaviour = partial.

- **Shipped (ticked today): 25**
- **Partial: 28**
- **Open: 8**
- **Update 2026-09-13:** 16 further items ticked (S18-A, S20-A/B, S21-A, S22-A, S25-A, S26-A/B — see inline); ranked backlog #1–#8 below is fully shipped. Remaining partials without founder input: sector-multiples quarterly refresh (needs a cited data source), 409A-equivalent / ESS safe-harbour language, chain read-back, secondary trading simulation; everything else needs a founder account (QuickBooks, SSO, Slides, Discord, Cosmos, PH launch).

### Ranked open/partial backlog — no human input needed (no Stripe env, founder decision, or third-party account)

1. **Project-level permissions enforced everywhere** — `lib/project-members/scope.ts` has the role model but `lib/projects.ts` has zero `project_members` references; accepted co-founders cannot see shared projects in workspace/evidence/SVI APIs. Evidence: `web/src/lib/projects.ts`, `web/src/app/api/projects/[id]/members/route.ts`.
2. ~~**Audit log → all mutating routes**~~ — **built S20-A 2026-09-12 (deploy + migration 0335 pending)**: `apiRoute()` wrapper + codemod wrapped 298 route files / 336 handlers (evidence, SVI, data-room, settings, login/register/logout included); 94 files allow-listed with reasons (`web/src/lib/audit/allowlist.json` — crons, webhooks, telemetry, health); rows hash-chained in `audit_events`; nightly `audit-chain-verify` → `audit_chain` on `/api/status`; `/workspace/audit-log` project/actor/action filters + owner CSV; static coverage guard `web/src/lib/audit/coverage.test.ts`. Evidence: `web/src/lib/audit/api-route.ts`, `web/src/lib/audit/catalogue.generated.ts`, `web/supabase/migrations/0335_audit_coverage.sql`.
3. **Outbound webhooks (SVI change, evidence uploaded)** — only a platform-wide Zapier push exists; add `webhook_endpoints`/`webhook_deliveries` migration + dispatch hooks in `api/revenue` rescore and evidence upload. Evidence: `web/src/app/api/founder/crm-push/route.ts`, `web/src/lib/platform-config.ts:92`.
4. ~~**Historical valuation graph (AUD)**~~ — **shipped S17-B** (`components/dashboard/valuation-trend-chart.tsx` on `/dashboard/history` + `/workspace/svi-trend`; band lives on `startup_score_history` rows, `svi_snapshots` only carries a point estimate).
5. ~~**Stripe MRR → valuation bridge**~~ — **shipped S17-B** (`lib/valuation-mrr-bridge.ts` + `lib/connected-revenue.ts`; `api/valuation`, `api/valuation/vc`, `api/score` read Stripe/Xero MRR, cross-check vs `SECTOR_MULTIPLES` ARR range, persist `valuation_method` — migration `0330_score_history_valuation_method.sql` must be applied by hand).
6. **NDA click-wrap gate** — `nda_required`/`nda_signed_at`/`nda_signed_ip` columns and access API exist; add the accept step on the investor token page. Evidence: `web/src/app/api/data-room/access/route.ts:32-101`, `web/supabase/migrations/0062_data_room_professional.sql:81-83`.
7. **Investor engagement heatmap UI** — `api/data-room/engage` GET already groups section views; no client posts `section_view` and nothing renders it. Evidence: `web/src/app/api/data-room/engage/route.ts:76-84`, `web/src/app/(app)/(founder)/dashboard/investor-links/investor-links-client.tsx`.
8. **Per-investor PDF watermark** — `share_packages.watermark` column + tour copy exist; `plans-v2.ts:110` admits no renderer applies it; overlay via existing pdf pipeline. Evidence: `web/supabase/migrations/0251_share_packages.sql:56`, `web/src/lib/pdf/svi-report-pdf.tsx`.

Needs human input (excluded from ranking): Google Slides export (Google API project), ProductHunt launch (founder, dated 13 Oct 2026), Community Discord/Slack (founder), SSO (IdP tenant), Xero/QuickBooks (OAuth apps), Production Cosmos chain (infra decision), Enterprise seat SKUs beyond contact-sales (Stripe env).
