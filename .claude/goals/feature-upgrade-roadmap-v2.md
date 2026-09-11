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
- [ ] Project-level permissions (viewer, editor, admin) (partial — role column + `lib/project-members/scope.ts` exist; enforced in 3 routes only)
- [x] Project archiving with data retention (shipped — `/workspace/projects/archived` + `api/projects/[id]/archive` + `api/cron/archived-purge` 90-day, `feac5fde8`)

### Valuation Engine v3 (CTO + CFO)
- [ ] Real-time valuation from connected Stripe data (partial — Stripe OAuth writes `mrr_aud` to `svi_signals`; valuation ignores it)
- [ ] Comparable startup database (anonymized, 1000+ AU startups) (partial — ~71 named rows `lib/au-comparable-raises.ts` + `lib/data/au-comparables.ts`; no anonymised 1000+ DB)
- [ ] Sector-specific multiples auto-updated quarterly (partial — static `SECTOR_MULTIPLES` in `lib/agents/cfo-valuation.ts`; no quarterly refresh cron)
- [ ] Valuation certificate PDF (for investor DD) (partial — VC valuation report PDF `api/valuation/pdf`; no certificate format/hash/seal)
- [ ] Historical valuation graph (SVI timeline → AUD) (partial — `/workspace/svi-trend` charts SVI only; `/dashboard/history` lists AUD, no graph)

### Enterprise Features (CTO + CRO)
- [ ] White-label option (custom domain, branding) (partial — `/workspace/white-label` is a coming-soon stub; PDF branding only, no custom domain)
- [ ] SSO (SAML/OIDC for enterprise clients) (open — not found in code (`/workspace/sso` is a coming-soon stub))
- [x] API access with rate limits per plan (shipped — `/workspace/api-keys` + `lib/api-keys.ts getRateLimitForPlan` + `api/v1/*`, migrations 0024/0107, `51d424dc3`)
- [ ] Webhook notifications (SVI change, evidence uploaded) (partial — manual Zapier push `api/founder/crm-push` only; no endpoints table or event dispatch)
- [ ] Audit log for compliance (all user actions) (partial — `/workspace/audit-log` + `lib/audit/log.ts`, 13 action types; not all user actions)

### Data Room v2 (CTO + CPO)
- [x] One-click data room from evidence vault (shipped — `api/data-room/generate` + `lib/data-room.ts composeRoomDocuments` pulls `svi_evidence`, `4778b625b`)
- [ ] Document watermarking (per-investor) (partial — `watermark` column migration 0251 only; no renderer applies it)
- [ ] View analytics (investor engagement heatmap) (partial — per-link view counts/logs shipped; `api/data-room/engage` heatmap has no client/UI)
- [ ] NDA management (digital signature) (partial — `nda_required`/`nda_signed_at` columns + access API; no gate or signature capture)
- [ ] Follow-up automation (auto-email after investor views) (partial — investor drips fire on lead form (`lib/investor-drips`), not on view)

---

## Q1 2027 (Jan-Mar) — "Equity & Investment"

### Cap Table v2 (CTO + CBO)
- [x] Equity round wizard (SAFE, convertible note, priced round) (shipped — `lib/fundraise.ts` (priced/safe/convertible_note) + `/workspace/fundraise` + `/workspace/fundraise/structure` + `/workspace/equity-setup`, `338f86a02`)
- [ ] Auto share-price from SVI + multiples (partial — `lib/share-structure.ts computeSharePriceFromSVI` + equity-setup wizard; revenue multiples not wired)
- [x] Dilution simulator (what-if scenarios) (shipped — `lib/fundraise.ts` dilutionTable/dilutionPct + `/workspace/fundraise` client, `338f86a02`)
- [ ] Board resolution templates (PDF generation) (partial — placeholder `public/templates/board-consent.docx` + on-chain registry; no populated PDF)
- [ ] 409A-equivalent valuation report (AU compliance) (partial — VC valuation PDF `api/valuation/pdf`; no s960-410/ESS safe-harbour language)

### Fundraise Tools (CRO + CFO)
- [ ] Investor CRM (track contacts, status, notes) (open — not found in code; nearest is per-investor share links `lib/investor-links.ts`)
- [ ] Term sheet comparison tool (AI-powered) (partial — `/workspace/term-sheet` + `lib/term-sheet/analyze.ts` single-sheet AU-market AI analysis; no multi-sheet compare)
- [ ] Fundraise tracker (target, committed, closed) (partial — `fundraise_rounds` target/status draft→active→closed; no committed-amount tracking)
- [x] Investor match (based on industry, stage, geography) (shipped — `lib/funding/investor-match.ts` reverse-match on sectors/stages/geos + `/workspace/funding`, migration 0323, `c6d7e1f9e`)
- [ ] Auto data room generation for active raise (partial — data room generate is manual click; no trigger from active `fundraise_rounds`)

### Blockchain Phase 2 (CBO)
- [ ] Production Cosmos chain (partial — private EVM Anvil chainId 420 + Otterscan (`chain/`, `lib/wallet.ts`); no Cosmos/production chain)
- [x] Per-startup token minting (NASDAQ-style tickers) (shipped — `lib/evm-deploy.ts deployCompanyToken` (tokenSymbol ticker) + `/admin/tokens` + `/workspace/wallet`, `e855b028b`)
- [x] MetaMask wallet integration (shipped — `lib/wallet.ts` (connectWallet, switchToBlockIDChain, addTokenToMetaMask) + `/workspace/wallet`, `98620409e`)
- [x] On-chain share issuance (shipped — `lib/evm-deploy.ts` + `lib/tokenization.ts` shares→tokens + `chain/contracts`, `e855b028b`)
- [ ] Bi-directional cap table ↔ chain sync (partial — `lib/blockchain-sync.ts` push queue cap table→chain; no chain→cap-table read-back)

---

## 2027 H2 — "Revenue & Dividends"

### Revenue Tracking (CFO)
- [ ] Stripe/Xero/QuickBooks connectors (partial — Stripe OAuth `api/integrations/stripe` live; Xero/QuickBooks are placeholder cards)
- [ ] Real-time P&L dashboard (partial — `/dashboard/finance` + `/workspace/revenue` P&L from manual entries; no live connector feed)
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
- [ ] Exit scenario calculator (IPO, M&A, acqui-hire) (partial — `lib/exit-modeling.ts` + `api/exit-model` cover acquisition/ipo/secondary/buyout; no acqui-hire scenario)
- [x] Valuation multiple benchmarks by sector (shipped — `lib/exits/au-benchmark.ts` + `SECTOR_MULTIPLES` `lib/agents/cfo-valuation.ts` + `/benchmarks`, `fe8f966c1`)
- [x] Due diligence readiness score (shipped — `api/data-room/readiness` + `api/fundraise/readiness` + `/dashboard/exit-readiness` tile, `89aca9c59`)
- [ ] Clean room preparation guide (open — not found in code)
- [x] Post-exit distribution calculator (shipped — `lib/exit-modeling.ts` liquidation-preference waterfall + ESOP + CGT per shareholder, `338f86a02`)

### Exchange Simulation (CBO)
- [x] SVI-to-exchange index (shipped — `lib/svi-index.ts` + `lib/startup-index-aggregator.ts` + `/startup-index` (G-SVI-Exchange 15/15), `71878a50c`)
- [ ] Pre-IPO secondary trading simulation (partial — `/workspace/secondary-offer` intake form (T_SVI_EXC_0012); no trading/order-book simulation)
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

### Ranked open/partial backlog — no human input needed (no Stripe env, founder decision, or third-party account)

1. **Project-level permissions enforced everywhere** — `lib/project-members/scope.ts` has the role model but `lib/projects.ts` has zero `project_members` references; accepted co-founders cannot see shared projects in workspace/evidence/SVI APIs. Evidence: `web/src/lib/projects.ts`, `web/src/app/api/projects/[id]/members/route.ts`.
2. **Audit log → all mutating routes** — `lib/audit/manifest.ts` lists 13 action types across 14 routes vs ~336 mutating API routes; add evidence, SVI, data-room, settings, login events. Evidence: `web/src/lib/audit/manifest.ts`, `web/src/app/(app)/(founder)/workspace/audit-log/page.tsx`.
3. **Outbound webhooks (SVI change, evidence uploaded)** — only a platform-wide Zapier push exists; add `webhook_endpoints`/`webhook_deliveries` migration + dispatch hooks in `api/revenue` rescore and evidence upload. Evidence: `web/src/app/api/founder/crm-push/route.ts`, `web/src/lib/platform-config.ts:92`.
4. **Historical valuation graph (AUD)** — `/dashboard/history` already selects `valuation_low_aud/high_aud` per run; add a Recharts band to `svi-trend-client.tsx`. Evidence: `web/src/app/(app)/(founder)/dashboard/history/page.tsx:58-100`, `web/src/app/(app)/(founder)/workspace/svi-trend/svi-trend-client.tsx`.
5. **Stripe MRR → valuation bridge** — `oauth-connectors.ts writeSignals()` stores `mrr_aud` in `svi_signals` but `api/valuation` reads only manual `startup_metrics`. Evidence: `web/src/app/api/integrations/stripe/callback/route.ts:101`, `web/src/app/api/valuation/route.ts`.
6. **NDA click-wrap gate** — `nda_required`/`nda_signed_at`/`nda_signed_ip` columns and access API exist; add the accept step on the investor token page. Evidence: `web/src/app/api/data-room/access/route.ts:32-101`, `web/supabase/migrations/0062_data_room_professional.sql:81-83`.
7. **Investor engagement heatmap UI** — `api/data-room/engage` GET already groups section views; no client posts `section_view` and nothing renders it. Evidence: `web/src/app/api/data-room/engage/route.ts:76-84`, `web/src/app/(app)/(founder)/dashboard/investor-links/investor-links-client.tsx`.
8. **Per-investor PDF watermark** — `share_packages.watermark` column + tour copy exist; `plans-v2.ts:110` admits no renderer applies it; overlay via existing pdf pipeline. Evidence: `web/supabase/migrations/0251_share_packages.sql:56`, `web/src/lib/pdf/svi-report-pdf.tsx`.

Needs human input (excluded from ranking): Google Slides export (Google API project), ProductHunt launch (founder, dated 13 Oct 2026), Community Discord/Slack (founder), SSO (IdP tenant), Xero/QuickBooks (OAuth apps), Production Cosmos chain (infra decision), Enterprise seat SKUs beyond contact-sales (Stripe env).
