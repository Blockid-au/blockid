# BlockID.au — Master Vision & Unified Roadmap

## Company Mission
**Become the #1 startup valuation and ownership platform in Australia** — accompanying founders from Day 0 idea through to exit with AI-powered valuation, transparent equity management, and blockchain-based ownership.

---

## The Problem: Why Startups Fail

### The Pain is Real (sourced data)
- **90% of startups fail** over their lifetime ([Failory 2026](https://www.failory.com/blog/startup-failure-rate))
- **60% of Australian startups fail within 3 years** ([ABS June 2025](https://www.abs.gov.au/statistics/economy/business-indicators/counts-australian-businesses-including-entries-and-exits/latest-release))
- **75% of AU startups don't survive 5 years** ([Inside Small Business](https://insidesmallbusiness.com.au/latest-news/almost-half-of-new-businesses-fail-within-their-first-four-years))
- **437,150 new AU businesses started** vs **370,500 closed** in FY2024-25 (ABS) — 30.3% annual churn
- **42% fail** because no market need, **70% run out of cash** ([CB Insights](https://www.cbinsights.com/research/report/startup-failure-reasons-top/))
- AU startups fail from "no product-market fit" at **33.3%** (vs 12% global) ([ScaleSuite](https://www.scalesuite.com.au/resources/australian-business-statistics))

### The AI Idea Explosion (2024-2026)
- **$97 billion** in AI startup funding globally in 2024 — 34% of all VC ([Second Talent](https://www.secondtalent.com/resources/ai-startup-funding-investment/))
- **$252.3 billion** total corporate AI investment in 2024 ([Stanford HAI 2025](https://hai.stanford.edu/ai-index/2025-ai-index-report))
- **90% of AI startups fail**, median lifespan ~18 months ([AI4SP](https://ai4sp.org/why-90-of-ai-startups-fail/), [WinSavvy](https://www.winsavvy.com/startup-failure-rates-in-ai-saas-and-e-commerce-sector-deep-dive/))
- **60%+ of AI tools have no recurring revenue** ([Medium](https://medium.com/@vicki-larson/ai-monetization-in-2025-why-95-of-ai-projects-never-make-a-dime-66c09db98e0f))
- **88-95% of AI pilots fail** to lift financials (MIT & Capgemini)
- Only **33% of companies actually scale AI** beyond pilot ([McKinsey 2025](https://www.mckinsey.com/capabilities/quantumblack/our-insights/the-state-of-ai))
- The gap: **$252B invested but 90% fail** — AI generates ideas but cannot build businesses

### The Valuation Black Hole
- Cap table/valuation issues are embedded in **70% of "ran out of cash" failures** — underreported because they manifest as other failure modes
- **Manual valuation costs A$5,000-$50,000** and takes 2-6 weeks
- Average time to prepare a data room manually: **3-6 weeks**
- Idea-to-Series-A average: **2.5 years** ([Rudys.AI](https://rudys.ai/startup-statistics))
- Startups that build MVP first are **85% more likely to scale** (Rudys.AI)

### What BlockID.au Solves
```
AI Idea → [BlockID Validates] → MVP → [BlockID Tracks Value] → Fundraise
  → [BlockID Manages Cap Table] → Growth → [BlockID Tokenizes Equity]
  → Revenue → [BlockID Distributes Dividends] → Exit → [BlockID Models IPO]
```

**One platform. Entire startup lifecycle. From idea to exit.**

---

## Market Opportunity

### TAM (Total Addressable Market)
- Global startup ecosystem: **$4.4 trillion** (Startup Genome, 2024)
- Cap table management: **$3.2 billion** (Grand View Research, 2025)
- Startup valuation tools: **$1.8 billion** (estimated)

### SAM (Serviceable Addressable Market)
- Australian startup ecosystem: **A$15 billion** in total funding (2024)
- **2,600+ active startups** in Australia (Startup Genome)
- **300+ accelerators and incubators** (StartupAus)
- **15,000+ angel investors** (AAAI)

### SOM (Serviceable Obtainable Market — Year 1)
- Target: **500 Australian startups** using BlockID in Year 1
- Average revenue per startup: **A$500/year** (mix of free + paid)
- Year 1 target: **A$250K ARR**

---

## Unified Product Roadmap (8 Phases)

### Phase 1: Idea & Analysis ✅ COMPLETE
**Owner: CTO + CPO**
- AI-powered SVI analysis (10-page report in 60 seconds)
- 8-dimension scoring: Team, Market, Product, Traction, Cap Table, Investor Readiness, Legal, Moat
- Free tools: Idea Valuation, Equity Split, Dilution Calculator, etc.
- Deep website tech audit (`deepTechAudit()`) — security, performance, stack, maturity
- Deep GitHub repo audit (`auditGitHubRepo()`) — architecture, CI/CD, testing, dependencies
- **Status: ✅ LIVE at blockid.au**

### Phase 2: Validation & Evidence ✅ COMPLETE
**Owner: CTO + CRO**
- Evidence Vault (upload docs → boost SVI score)
- Auto-rescore on evidence upload (<5s)
- OAuth connectors (GitHub, Analytics, Stripe)
- Milestone badges (15 badges) and weekly reports
- Email nurture sequences (10 automated emails)
- 50+ AU founders, 200+ SVI analyses, $2M+ valuations tracked
- **Status: ✅ COMPLETE**

### Phase 3: MVP & Dollar Valuation ⚡ IN PROGRESS
**Owner: CPO + CFO**
- Dollar valuation engine (multiples, comparables, DCF) — foundation deployed
- Modular section pricing (Scan → Expert, 6 depth tiers)
- Transparent credit-per-word pricing model
- 16-page report structure (10 standard + 6 premium)
- Revenue tracking from Stripe/Xero
- Benchmarking against 2,600 Australian startups
- **Status: ⚡ Foundation deployed, completing**

### Phase 4: Equity & Cap Table ⚡ IN PROGRESS
**Owner: CTO + CBO**
- Full cap table management (shares, options, convertibles) — core deployed
- Vesting schedule engine (4-year cliff, acceleration)
- Share class management (ordinary, preference, seed)
- AI equity recommendations (split, vesting, ESOP, share structure)
- SVI-linked share pricing (fixed + dynamic modes)
- ESOP pool management
- **Status: ⚡ Core deployed, AI equity features building**

### Phase 5: Tokenization (Cosmos Blockchain) ✅ CHAIN LIVE
**Owner: CBO + CTO**
- Private Cosmos SDK blockchain (testnet live: blockid-testnet-1)
- Off-chain first architecture — blockchain is optional transparency layer
- Per-startup ERC-20 tokens with NASDAQ-style tickers (3-4 chars)
- Sync toggle per startup (on/off/pause/catch-up)
- MetaMask wallet integration (via Ethermint EVM module)
- VestingVault.sol, DividendDistributor.sol smart contracts
- **Status: ✅ Testnet live, sync engine + token factory building**

### Phase 6: Investment & Fundraise ⚡ STARTING
**Owner: CRO + CFO + CBO**
- One-click data room generation from Evidence Vault
- Fundraise round wizard (SAFE, convertible note, priced round)
- Auto share-price calculation + dilution modeling
- Investor CRM with activity tracking
- On-chain share issuance for completed rounds
- Pitch deck v1 ready, directory profiles created
- **Status: ⚡ Pitch deck + data room template ready, starting accelerator applications**

### Phase 7: Revenue & Dividends 📋 PLANNED
**Owner: CFO + CBO**
- Real-time P&L dashboard (Stripe/Xero/QuickBooks)
- Revenue-to-SVI feed (auto-updates valuation)
- Dividend calculation engine (net income × policy → per-share)
- Dual-mode dividend distribution (off-chain calc + optional on-chain claim)
- Australian tax compliance (franking credits, CGT)
- **Target: 2028**

### Phase 8: Growth, Exit & Exchange 📋 PLANNED
**Owner: All C-Levels + CBO**
- Growth journal (decisions, pivots, milestones)
- Quarterly revaluation reports (409A-equivalent)
- SVI-to-exchange index simulation
- Pre-IPO secondary trading simulation
- ESOP management for growing teams
- Exit modeling (acquisition, IPO, secondary sale)
- Share/token conversion for real stock exchange listing
- **Target: 2028+**

---

## Full Organization — 48 Roles, 45 Agent Skills, 11 C-Levels

> See [Org Chart](org-chart.md) for complete hierarchy | [Full Company Excellence](full-company-excellence.md) for master goal

### Founder & CEO — Do Van Long
**Goal: Strategic direction, vision, fundraising, C-Level coordination**
- All phases: Product vision, investor relations, key hires, culture
- **Advisors**: Industry mentors, legal counsel, accounting firm
- **Reports**: All C-Levels, Blockchain Expert, AU Compliance

---

### CTO — Chief Technology Officer
**Goal: Ship reliable, secure, performant platform across all 8 phases**
- Phase 1-2: Platform core, API, evidence system, deep tech audit ← NOW
- Phase 3: Dollar valuation engine, revenue connectors
- Phase 4-5: Cap table + blockchain integration
- Phase 6-8: Data room, investor tools, exchange simulation
- **Skills**: 22 programming + architecture skills
- **Sub-agents**: Frontend Lead, Backend Lead, AI/ML Lead, Security Lead, Data Engineer, Dev Relations Lead
- **Report pages**: 3 (Product & Technology), 9 (Risk — technical)
- **Auto-upgrade**: Benchmark architecture/performance/security vs Carta, Pulley

### CFO — Chief Financial Officer
**Goal: Achieve A$10K MRR with sustainable unit economics**
- Phase 1-2: Pricing optimization, Stripe metrics, credit economy ← NOW
- Phase 3: Revenue dashboard, unit economics tracking
- Phase 6: Fundraise financial modeling
- Phase 7: Dividend engine, tax compliance
- **Skills**: stripe-test, analytics, perf-audit, postgres-pro
- **Sub-agents**: Revenue Analyst, Cost Controller, Compliance Lead (AU Compliance), Financial Modeler
- **Report pages**: 4 (Business Model), 8 (Financial Projections), 15 (Exit Readiness)
- **Auto-upgrade**: Benchmark pricing vs competitors, optimize AI cost per analysis

### CMO — Chief Marketing Officer
**Goal: Drive 1000+ SVI analyses/month, build brand authority**
- Phase 1-2: SEO content (30+ articles), GSC, GA4, social ← NOW
- Phase 3: Case studies, founder success stories
- Phase 4: Partnership with accelerators (Startmate, Antler)
- Phase 5: "Blockchain for equity" thought leadership
- **Skills**: seo-audit, publish, rnd, analytics, media-studio
- **Sub-agents**: SEO Specialist, Content Lead, Social & Community Lead, Growth Analyst, Growth Hacker
- **Report pages**: 2 (Market & Problem), 5 (Competition & Moat), 6 (Traction & Growth)
- **Auto-upgrade**: Benchmark SEO/content vs competitors, auto-generate content strategies

### CPO — Chief Product Officer
**Goal: Maximize user value through evidence-backed product decisions**
- Phase 1-2: SVI UX, onboarding flow, evidence upload UX ← NOW
- Phase 3: Valuation dashboard UX, benchmarking views
- Phase 4: Cap table management UX, share class editor
- Phase 5: Wallet integration UX, token dashboard
- **Skills**: ui-ux-pro-max, analytics, rnd, prompt-engineer
- **Sub-agents**: UX Researcher, Product Designer, Data Analyst, Feature PM, Accessibility Lead
- **Report pages**: 7 (Team & Execution), 10 (Recommendations)
- **Auto-upgrade**: Benchmark UX/features vs competitors, reduce time-to-value

### CRO — Chief Revenue Officer
**Goal: 10% free-to-paid conversion, <5% monthly churn**
- Phase 1-2: Funnel optimization, email nurture, onboarding ← NOW
- Phase 3: Upsell to premium plans
- Phase 6: Investor-side revenue (data room access fees)
- **Skills**: analytics, ui-ux-pro-max, stripe-test, prompt-engineer
- **Sub-agents**: Conversion Specialist, Retention Lead, Partnerships Lead, Sales Ops, Customer Success Lead
- **Report pages**: 6 (Traction & Growth)
- **Auto-upgrade**: Benchmark conversion/retention vs SaaS standards

### COO — Chief Operating Officer
**Goal: Ship every sprint on-time with 95% quality**
- All phases: Sprint planning, deploy management, QA coordination
- Cross-team: Coordinate all C-levels, resolve blockers, quality gates
- **Skills**: deploy, qa, devops-engineer, code-reviewer, test-master
- **Sub-agents**: Sprint Master, DevOps Lead, QA Lead, Process Analyst
- **Report pages**: 1 (Executive Summary)
- **Auto-upgrade**: C-Level sync protocol, report quality feedback loop

### CHRO — Chief People Officer (NEW)
**Goal: Build and retain the team that builds BlockID**
- Phase 2-3: Team assessment framework, ESOP foundation ← NOW
- Phase 4: ESOP administration, vesting tracker
- Phase 5-7: Team scaling for growth, hiring playbook
- **Skills**: `/chro`, `/au-compliance`, `/cfo`
- **Sub-agents**: Talent Scout, Culture & Engagement Lead, ESOP Administrator
- **Report pages**: 7 (Team & Execution), 13 (HR & Team Scaling Plan)
- **Customer value**: Assess startup team readiness, hiring gaps, ESOP design

### CLO — Chief Legal Officer (NEW)
**Goal: Protect BlockID legally and help customers navigate AU law**
- Phase 2-3: Legal risk framework, IP strategy, disclaimers ← NOW
- Phase 4: Equity legal infrastructure (share classes, SHA)
- Phase 5-6: Token legal framework, investor legal compliance
- **Skills**: `/clo`, `/au-compliance`, `/cfo`
- **Sub-agents**: Corporate Counsel, IP Strategist, Privacy Officer
- **Report pages**: 9 (Risk — legal), 11 (Legal & IP Landscape), 15 (Exit Readiness)
- **Customer value**: Legal risk scoring, IP assessment, ASIC compliance guidance

### CISO — Chief Information Security Officer (NEW)
**Goal: Protect BlockID data and assess customer security maturity**
- Phase 2-3: Security scoring framework, incident response ← NOW
- Phase 4: SOC2 Type I preparation
- Phase 5: Blockchain security audit framework
- **Skills**: `/ciso`, `/security-audit`, `/au-compliance`
- **Sub-agents**: Incident Commander, Compliance Auditor
- **Report pages**: 3 (Tech — security), 9 (Risk — cyber), 14 (Cybersecurity Assessment)
- **Customer value**: Security posture grading, privacy compliance, threat assessment

### CDO — Chief Data Officer (NEW)
**Goal: Ensure data quality and help customers assess their data moat**
- Phase 2-3: Data quality framework, analytics completeness ← NOW
- Phase 4: AI model governance, bias monitoring
- Phase 5-7: Data pipeline for real-time valuation
- **Skills**: `/cdo`, `/analytics`, `/postgres-pro`, `/prompt-engineer`
- **Sub-agents**: Data Quality Lead, AI Governance Lead
- **Report pages**: 5 (Competition — data moat), 12 (Data & AI Strategy)
- **Customer value**: Data moat scoring, AI strategy maturity assessment

### Blockchain Expert
**Goal: Build private Cosmos chain for equity tokenization**
- Phase 4: Equity data model preparation
- Phase 5: Cosmos chain + smart contracts + MetaMask
- Phase 6: On-chain share issuance
- Phase 7: Dividend distribution engine
- Phase 8: Exchange simulation + IPO readiness
- **Skills**: architecture-designer, secure-code-guardian, api-designer, test-master
- **Sub-agents**: Smart Contract Dev, Validator Ops, Wallet Integration

---

### Specialist Agents (cross-functional)

| Agent | Reports To | Phase | Function |
|-------|-----------|-------|----------|
| AU Compliance Officer | CFO + COO | 2-7 | ASIC, ACL, Privacy Act, GST, AFSL disclaimers |
| Investor Relations | CEO + CFO | 3-7 | Pitch decks, data rooms, accelerator applications |
| Media Studio | CMO | 2-7 | Video, image, voice, social content |
| Customer Success | CRO | 3-7 | NPS, onboarding, churn prevention |
| Dev Relations | CTO | 4-7 | API docs, SDK, developer community |

### Advisory Board (Recommended)

| Role | Why | Phase |
|------|-----|-------|
| Legal Advisor | AU corporate/startup law expert (solicitor) | Phase 2+ |
| Tax Advisor | Registered tax agent for ESS, GST, R&D Tax Incentive | Phase 3+ |
| Startup Mentor | Serial founder with AU exits | Phase 2+ |
| VC Advisor | Investor perspective on product/market fit | Phase 4+ |
| Blockchain Advisor | Cosmos ecosystem expert | Phase 5+ |
| Security Advisor | SOC2/pentest consultant | Phase 3+ |

---

## The Founder's Journey on BlockID.au

```
Day 0: AI generates idea
  ↓ [BlockID SVI: Score your idea FREE]
Day 1: Know your idea's value (SVI score)
  ↓ [Upload evidence → boost score]
Month 1: MVP built, evidence collected
  ↓ [Dollar valuation based on multiples]
Month 3: Ready to find co-founders
  ↓ [Equity split tool → cap table → vesting]
Month 6: Fundraise from angels
  ↓ [Data room → investor CRM → term sheet AI]
Month 9: Seed round closed
  ↓ [Shares tokenized on Cosmos → MetaMask]
Year 1: Revenue growing
  ↓ [Revenue dashboard → valuation updates]
Year 2: Profitable
  ↓ [Dividends auto-distributed to token holders]
Year 3: Scale
  ↓ [ESOP for team → secondary trading simulation]
Year 5: Exit
  ↓ [IPO preparation → SVI-to-exchange index]
```

**BlockID.au is with you at every step.**

---

## Immediate Priorities (This Week)

| Priority | Task | Owner | Status |
|----------|------|-------|--------|
| P0 | Fix AI provider reliability (Claude OAuth auto-refresh) | CTO | ✅ Done |
| P0 | 30+ SEO articles published | CMO | ✅ Done |
| P0 | Email nurture sequences (10 emails) | CRO | ✅ Done |
| P0 | Evidence-to-SVI rescore | CTO | ✅ Done |
| P0 | Growth Intelligence dashboard | CTO+CFO | ✅ Done |
| P1 | Google Search Console indexed | CMO | ✅ Done |
| P1 | Admin AI key management | CTO | ✅ Done |
| P1 | Per-user Drive folders | CTO | ✅ Done |
| P1 | Source folders + Data Room clone | CTO | ✅ Done |
| P2 | UIProMax homepage redesign | CPO+CTO | ✅ Done |
| P2 | 48 skills installed | COO | ✅ Done |
| **P0** | **First 10 paying customers** | **CRO+CMO** | ⚡ Next |
| **P0** | **Dollar valuation engine (Phase 3)** | **CTO+CFO** | 📋 Planned |
| **P1** | **Blockchain Expert onboarding** | **CTO** | 📋 Planned |