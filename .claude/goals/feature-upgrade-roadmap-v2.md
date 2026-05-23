# BlockID.au Feature Upgrade Roadmap v2 — Post Go-Live

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
- [ ] Enterprise tier with team features ($499/mo)
- [ ] Accelerator partnership pricing ($20K/year per cohort)
- [x] Annual billing: Growth A$950/year (20% off) with Monthly/Annual toggle (20% discount)

### Report Quality (CTO + CPO)
- [x] Industry-specific: 7 industry guidance prompts auto-detected from input (SaaS, marketplace, fintech)
- [ ] PDF branding customization for paid plans
- [x] Interactive radar chart (Recharts RadarChart, 8 dimensions in report) (Chart.js/Recharts)
- [x] SVI trend chart (Recharts LineChart, 30-day delta on dashboard)
- [ ] Export to Google Slides (from report data)

### User Experience (CPO + CRO)
- [x] Onboarding wizard (3-step: profile→SVI→evidence with AIThinkingStatus)
- [ ] Dashboard personalization (pin widgets, reorder cards)
- [x] Dark mode toggle (ThemeToggle component + CSS custom properties + localStorage)
- [x] Vietnamese: full report translation (page titles + AI prompt + deep dive) full translation)
- [x] PWA setup (manifest, theme-color, apple-web-app, installable)

### Growth (CMO + CRO)
- [ ] ProductHunt launch campaign
- [x] Referral v2: referrer gets 2 cr, referee gets 1 bonus cr (2-sided) (2-sided: referrer + referee get credits)
- [ ] Content hub with founder guides
- [ ] Community (Discord/Slack with SVI leaderboard)
- [x] Partner API: POST /api/v1/analyze (API key auth, credit deduction, clean JSON) (programmatic SVI)

---

## Q4 2026 (Oct-Dec) — "Scale & Enterprise"

### Multi-Project System Enhancement (CTO)
- [ ] Portfolio dashboard (all startups side-by-side)
- [ ] Cross-project comparison charts
- [ ] Team member invite (share project with co-founder)
- [ ] Project-level permissions (viewer, editor, admin)
- [ ] Project archiving with data retention

### Valuation Engine v3 (CTO + CFO)
- [ ] Real-time valuation from connected Stripe data
- [ ] Comparable startup database (anonymized, 1000+ AU startups)
- [ ] Sector-specific multiples auto-updated quarterly
- [ ] Valuation certificate PDF (for investor DD)
- [ ] Historical valuation graph (SVI timeline → AUD)

### Enterprise Features (CTO + CRO)
- [ ] White-label option (custom domain, branding)
- [ ] SSO (SAML/OIDC for enterprise clients)
- [ ] API access with rate limits per plan
- [ ] Webhook notifications (SVI change, evidence uploaded)
- [ ] Audit log for compliance (all user actions)

### Data Room v2 (CTO + CPO)
- [ ] One-click data room from evidence vault
- [ ] Document watermarking (per-investor)
- [ ] View analytics (investor engagement heatmap)
- [ ] NDA management (digital signature)
- [ ] Follow-up automation (auto-email after investor views)

---

## Q1 2027 (Jan-Mar) — "Equity & Investment"

### Cap Table v2 (CTO + CBO)
- [ ] Equity round wizard (SAFE, convertible note, priced round)
- [ ] Auto share-price from SVI + multiples
- [ ] Dilution simulator (what-if scenarios)
- [ ] Board resolution templates (PDF generation)
- [ ] 409A-equivalent valuation report (AU compliance)

### Fundraise Tools (CRO + CFO)
- [ ] Investor CRM (track contacts, status, notes)
- [ ] Term sheet comparison tool (AI-powered)
- [ ] Fundraise tracker (target, committed, closed)
- [ ] Investor match (based on industry, stage, geography)
- [ ] Auto data room generation for active raise

### Blockchain Phase 2 (CBO)
- [ ] Production Cosmos chain
- [ ] Per-startup token minting (NASDAQ-style tickers)
- [ ] MetaMask wallet integration
- [ ] On-chain share issuance
- [ ] Bi-directional cap table ↔ chain sync

---

## 2027 H2 — "Revenue & Dividends"

### Revenue Tracking (CFO)
- [ ] Stripe/Xero/QuickBooks connectors
- [ ] Real-time P&L dashboard
- [ ] Revenue-to-SVI automatic feed
- [ ] Cash flow forecasting
- [ ] Expense categorization AI

### Dividend Distribution (CFO + CBO)
- [ ] Dividend calculation engine
- [ ] On-chain dividend distribution
- [ ] Australian tax compliance (franking credits)
- [ ] Shareholder tax statements
- [ ] Reinvestment option (DRIP)

---

## 2028+ — "Exit & Exchange"

### Exit Modeling (CFO + CLO)
- [ ] Exit scenario calculator (IPO, M&A, acqui-hire)
- [ ] Valuation multiple benchmarks by sector
- [ ] Due diligence readiness score
- [ ] Clean room preparation guide
- [ ] Post-exit distribution calculator

### Exchange Simulation (CBO)
- [ ] SVI-to-exchange index
- [ ] Pre-IPO secondary trading simulation
- [ ] ASX/NASDAQ listing requirements checker
- [ ] Share/token conversion for real listing

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