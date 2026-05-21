# BlockID.au — Product Requirements Document (PRD)

**Version:** 1.0  
**Date:** 2026-05-20  
**Status:** Production (Phase 1-2 Complete, Phase 3 Starting)  
**Author:** BlockID Product & AI Agent Team  
**URL:** https://blockid.au

---

## 1. Executive Summary

BlockID.au is an **AI-powered startup valuation and ownership intelligence platform** for Australian founders. The platform helps pre-seed to Series A startups measure, prove, and grow their company value through an 8-dimensional Startup Value Index (SVI), evidence-backed analysis, and investor-ready reporting.

Built in 19 days (May 1-19, 2026), the platform is now a **fully deployed, revenue-capable SaaS product** with 212 TypeScript files, 42 pages, 50 API routes, 22 database tables, and 8 AI agents.

### Key Numbers

| Metric | Value |
|--------|-------|
| TypeScript files | 212 |
| Pages | 42 |
| API routes | 50 |
| Database tables | 22 |
| Database migrations | 15 |
| Free tools | 8 |
| Email templates | 8 |
| AI agents | 8 (7 active, 1 planned) |
| Unit tests | 62 |
| Pricing tiers | 5 |

---

## 2. Vision & Positioning

### Long-term Vision
> BlockID becomes the **trust layer for private capital markets** -- transparent, verifiable, trackable ownership and fundraising readiness infrastructure.

### Current Positioning (2026)
> **AI-powered Startup Verification Intelligence for Australian founders raising capital.**

### One-liner
> Investor-ready in 10 minutes. Evidence-backed. Proof-trail verified.

### Founder-facing
> Know what investors will question before the meeting.

### Investor-facing
> A tamper-evident pre-diligence pack for Australian startup fundraising.

### Key Differentiator
> **AI-powered fundraising, valuation, and ownership infrastructure for private companies.**

---

## 3. Target Market

### Beachhead (Year 1)
- Australian founders, pre-seed to Series A
- Raising AUD $200K-$5M
- Sydney, Melbourne, Parramatta corridors
- Tech-enabled (using Stripe, Xero, HubSpot)

### Total Addressable Market
- ~600,000 private companies in Australia
- ~50,000 startups actively raising per year
- Average spend on fundraising tools: $200-$2,000/year

### Channels (Priority Order)
1. **Accelerators** -- white-label cohort dashboards
2. **Accountants** -- co-branded readiness reports
3. **Startup lawyers** -- cap table + term sheet workflows
4. **VCs / Angels** -- Investor Welcome Pack

---

## 4. Core Product: Startup Value Index (SVI)

### 4.1 SVI Engine

The SVI is an 8-dimensional scoring system (base 100, range 30-300) that measures startup progress and evidence quality.

#### 8 Dimensions (Weighted)

| # | Key | Dimension | Weight | Description |
|---|-----|-----------|--------|-------------|
| 1 | FTV | Founder & Team Value | 15% | Experience, co-founders, advisors, domain fit |
| 2 | MPC | Market & Problem Clarity | 18% | Market size, problem validation, customer interviews |
| 3 | PTD | Product & Technical Depth | 12% | MVP, demo, source code, website, apps |
| 4 | TRE | Traction & Revenue Evidence | 20% | Revenue band, customers, analytics, social proof |
| 5 | CGH | Cap Table & Governance | 12% | Cap table, vesting, SHA, ESOP, board, audit |
| 6 | IRI | Investor Readiness Index | 10% | Pitch deck, financial model, data room, raise target |
| 7 | LCO | Legal & Compliance | 8% | ABN, IP, contracts, legal docs |
| 8 | SVM | Strategic Vision & Moat | 5% | Moat, network effect, data advantage, switching costs |

#### Stage Detection (0-7)

| Stage | Name | Criteria |
|-------|------|----------|
| 0 | Concept | No validation |
| 1 | Validated Idea | Problem clarity = validated or clear |
| 2 | MVP / Prototype | Has product, demo, website, or code |
| 3 | Early Traction | Has customers, analytics, or social proof |
| 4 | Revenue | Has revenue (any band) |
| 5 | Growth | Growing/scaling revenue + team |
| 6 | Scale | Scaling revenue + cap table + data room |
| 7 | Corporation | Audit + ABN + board cadence |

#### Evidence Confidence Levels

| Level | Multiplier | Example |
|-------|-----------|---------|
| Self-declared | 0.20x | User typed it |
| Public URL | 0.35x | LinkedIn, website link |
| Document uploaded | 0.50x | PDF pitch deck |
| Connected source | 0.75x | GitHub, Google Analytics |
| Transaction data | 0.90x | Stripe, invoices |
| Third-party verified | 1.00x | Audit report, ASIC |

### 4.2 SVI Report (10 Pages)

AI-generated guided report with page navigation:

1. **Executive Summary** -- Score, stage, key metrics
2. **Startup Value Breakdown** -- 8 dimension bars with evidence/gaps
3. **Market & Problem Validation** -- MPC deep-dive
4. **Product & Technical Assessment** -- PTD analysis
5. **Traction & Revenue Analysis** -- TRE with revenue band
6. **Cap Table & Governance** -- CGH signals
7. **Investor Readiness** -- IRI + competitive research
8. **Risk Assessment** -- Risk penalties with severity
9. **Evidence Gaps & Action Plan** -- P0/P1/P2 priorities
10. **Next Steps & Recommendations** -- CTAs + stage journey

---

## 5. Feature Set

### 5.1 Public Pages (No Auth Required)

| Page | Description |
|------|-------------|
| Homepage (`/`) | Hero banner + SVI search (Google-style) + pricing + roadmap |
| Founding 50 (`/founding-50`) | $49 offer with Stripe checkout |
| 8 Free Tools | Dilution, cap table, term sheet, equity split, funding plan, idea valuation, data room, co-founder match |
| Checkout Success (`/checkout/success`) | Thank you page after payment |
| Share Link (`/s/[slug]`) | Public investor view of SVI score |

### 5.2 Authentication

| Method | Description |
|--------|-------------|
| Google OAuth | Sign In With Google (GSI library) |
| Magic Link | Email-based passwordless login (15-min expiry) |
| Sessions | 90-day HttpOnly cookies, SameSite=Lax |
| i18n | EN/VI toggle on login, cookie persistence |

### 5.3 Workspace (Authenticated)

| Page | Description |
|------|-------------|
| SVI Dashboard | Score, 8 dimensions, weekly delta, stage journey |
| Evidence Vault | Upload docs to Google Drive, auto-share admin |
| Weekly Reports | Score history, WeeklyReportCard, snapshot table |
| Growth Roadmap | 10-step guided roadmap, dynamic completion |
| Billing | Current plan, plan grid, credit purchase, Stripe portal |
| Profile | User info, plan, member since |

### 5.4 Admin Panel

| Page | Description |
|------|-------------|
| Dashboard | User/analysis/account stats, SVI accounts table |
| Growth Intelligence | AI-powered funnel analysis (daily cron) |
| Product Roadmap | Visual timeline, KPIs, live DB stats, investor thesis |
| Team & AI Agents | Org chart, 8 agent cards, workflow cycle |
| AI R&D Agent | Market research, feature proposals, CTA optimization |
| Documents | Google Drive upload |

### 5.5 Free Tools (8)

| Tool | Endpoint | Description |
|------|----------|-------------|
| Dilution Calculator | `/tools/dilution` | Founder dilution modeling |
| Cap Table Diff | `/tools/cap-table` | Before/after cap table comparison |
| Term Sheet AI | `/tools/term-sheet` | AI-powered term sheet analysis |
| Equity Split | `/tools/equity-split` | Co-founder equity split planner |
| Funding Plan | `/tools/funding-plan` | Stage-by-stage funding roadmap |
| Idea Valuation | `/tools/idea-valuation` | Pre-revenue idea value estimator |
| Data Room | `/tools/data-room` | Fundraising data room checklist |
| Co-founder Match | `/tools/cofounder-match` | Co-founder compatibility matcher |

---

## 6. AI Agent Ecosystem

### 6.1 Agent Overview

| # | Agent | Model | Cost/Request | Status | Department |
|---|-------|-------|-------------|--------|------------|
| 1 | SVI Analysis | Claude Haiku 4.5 | ~$0.003 | Active | Product |
| 2 | Term Sheet AI | Claude Sonnet 4.6 | ~$0.10 | Active | Product |
| 3 | Competitive Research | Claude Haiku + Web Search | ~$0.01 | Active | Product |
| 4 | SVI Report | Claude Haiku 4.5 | ~$0.003 | Active | Product |
| 5 | Growth Intelligence | Claude Haiku 4.5 | ~$0.002/day | Active | Growth |
| 6 | R&D Research | Claude Haiku 4.5 | ~$0.01 | Active | Growth |
| 7 | Email Notification | Gmail SMTP | ~$0.001 | Active | Operations |
| 8 | Cron Scheduler | N/A | $0 | Active | Operations |

### 6.2 AI Agent Workflow (Continuous Improvement Cycle)

```
R&D Research Agent
    ↓ (market insights, competitor analysis, feature proposals)
Feature Development
    ↓ (new features, optimizations)
Deploy & Release
    ↓ (auto-deploy via GitLab CI)
Customer Usage Data
    ↓ (usage_logs, credit_transactions, user_actions)
Growth Intelligence Agent
    ↓ (funnel analysis, conversion insights)
Analyze & Optimize
    ↓ (pricing, CTAs, messaging recommendations)
R&D Research Agent ← (loop continues)
```

### 6.3 AI Budget

- Monthly cap: USD $100
- Estimated daily spend: ~$5
- Primary model: Claude Haiku 4.5 (99% of requests)
- Premium model: Claude Sonnet 4.6 (term sheet analysis only)
- Fallback chain: Claude OAuth → Claude API Key → Claude Proxy → OpenAI → Gemini

---

## 7. Revenue Model

### 7.1 Pricing Tiers

| Tier | Price (AUD) | Credits | Billing | Target |
|------|------------|---------|---------|--------|
| Free | $0 | 2 (one-time) | N/A | Trial users |
| SVI Analysis | $1 (early-bird) / $25 | 1 | Per-use | Casual users |
| Founding 50 | $49 | 50 (one-time) | One-off | Early adopters |
| Founder | $99/mo | 50/mo | Monthly | Active founders |
| Growth | $99/mo (early-bird) / $499/mo | 100/mo | Monthly | Scale-ups |

### 7.2 Credit System

| Feature | Credits | AUD Equivalent |
|---------|---------|---------------|
| SVI Analysis | 0.50 | ~$2.50 |
| SVI Report (10-page) | 0.50 | ~$2.50 |
| Term Sheet AI | 1.00 | ~$5.00 |
| Competitive Research | 0.50 | ~$2.50 |
| AI Score Enhancement | 0.25 | ~$1.25 |
| Evidence Upload | 0 | Free |
| Investor-Ready Score | 0 | Free |
| Free Tools (8) | 0 | Free |

### 7.3 Credit Packs

| Pack | Price (AUD) | Per-Credit | Savings |
|------|------------|-----------|---------|
| 10 credits | $5 | $0.50 | -- |
| 25 credits | $9 | $0.36 | 28% |
| 50 credits | $15 | $0.30 | 40% |
| 100 credits | $25 | $0.25 | 50% |

### 7.4 Unit Economics

| Metric | Value |
|--------|-------|
| AI cost per SVI analysis | ~$0.003 |
| AI cost per term sheet | ~$0.10 |
| Revenue per SVI analysis | $1-$25 |
| Gross margin (SVI) | 88-99.9% |
| Gross margin (term sheet) | 98% |
| Email cost per send | ~$0.001 |
| Storage cost (Drive) | Free (Google Workspace) |

---

## 8. Stripe Integration (Full Lifecycle)

### 8.1 Payment Flows

```
New User → Free Trial (2 credits) → Use SVI
    → Insufficient Credits → CreditGate Modal
    → Buy Credits (Stripe Checkout) → Grant Credits
    → Continue Using

OR

Founding 50 Form → Stripe Checkout → Payment
    → Webhook → Activate Plan → Grant 50 Credits
    → Send Confirmation Email → /checkout/success
```

### 8.2 Subscription Management

| Action | Endpoint | Description |
|--------|----------|-------------|
| Subscribe | `POST /api/stripe/checkout` | Create Stripe Checkout Session |
| Manage | `POST /api/stripe/portal` | Stripe Customer Portal |
| Upgrade/Downgrade | `POST /api/stripe/change-plan` | Proration handling |
| Cancel | `POST /api/stripe/cancel` | Cancel at period end + COMEBACK30 offer |
| Reactivate | `POST /api/stripe/reactivate` | Undo cancellation |

### 8.3 Webhook Events Handled

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Activate plan + grant credits + send email |
| `customer.subscription.deleted` | Downgrade to free |
| `customer.subscription.updated` | Update plan on change |
| `invoice.payment_failed` | Email: update payment method |
| `invoice.paid` | Email: payment receipt |

---

## 9. Email System

### 9.1 Templates (8)

| Template | Trigger | Content |
|----------|---------|---------|
| Magic Link | Login request | Sign-in link (15-min expiry) |
| Score Ready | Score computed | Score + share link |
| Score Viewed | Investor opens link | Viewer label + timestamp |
| SVI Welcome | Account created (Day 1 cron) | SVI score + dashboard CTA |
| SVI Weekly Report | Weekly cron | Score delta + wins/gaps |
| SVI Report | Analysis complete | Full report link + strengths/gaps |
| Payment Confirmation | Webhook: checkout.completed | Plan name + dashboard CTA |
| Payment Link | Founding 50 form | Stripe checkout URL |

### 9.2 Infrastructure
- **Transport:** nodemailer + Gmail SMTP
- **From:** `BlockID <ceo@longcare.au>`
- **Templates:** Inline HTML, navy/brand-blue palette
- **Delivery:** Fire-and-forget (non-blocking)

---

## 10. Database Schema

### 10.1 Tables (22)

**Auth & Users:**
- `app_users` -- Core user accounts (email, plan, stripe_customer_id, google_id)
- `magic_links` -- Single-use login tokens (24-char, 15-min expiry)
- `sessions` -- HttpOnly sessions (32-char, 90-day TTL)

**SVI System:**
- `svi_analyses` -- Analysis results (analysis_json, total_svi)
- `svi_accounts` -- One per founder (plan, current_svi, current_stage)
- `svi_snapshots` -- Weekly snapshots (delta tracking)
- `svi_evidence` -- Evidence items (type, confidence, dimension)
- `svi_notifications` -- Welcome, weekly reports, milestones
- `svi_milestones` -- Achievement badges

**Credits & Usage:**
- `credit_balances` -- Per-user balance (lifetime earned/spent)
- `credit_transactions` -- Audit log (+/- per operation)
- `usage_logs` -- Per-feature usage counter

**Tools & Artifacts:**
- `leads` -- Marketing lead capture
- `scores` -- Investor-Ready Score v2
- `score_views` -- View tracking (hashed IPs)
- `investor_links` -- Per-investor share links
- `idea_evaluations` -- Idea value estimates
- `equity_splits` -- Founder splits
- `funding_plans` -- Funding roadmaps
- `founder_packs` -- Bundled artifacts
- `cofounder_profiles` -- Matching directory
- `coupons` -- Discount codes

**Analytics:**
- `growth_insights` -- Daily AI-generated insights
- `user_actions` -- Event tracking

---

## 11. Infrastructure

### 11.1 Architecture

```
    Users (blockid.au)
         │
    Nginx (port 80/443, TLS)
         │
    Next.js 16 (Docker, port 4001)
         │
    ┌────┼────┬──────────┬────────────┐
    │         │          │            │
Supabase  Stripe    Claude AI   Google Drive
(self-    (Live)    (Haiku +    (Service
hosted)              Sonnet)     Account)
22 tables  5 plans   8 agents    Evidence
         │
    Cron Container (Alpine)
    - Daily: notifications, growth insights
    - Weekly: SVI snapshots
```

### 11.2 Deployment

- **Server:** GCP n1-highmem-8 (8 vCPU, 50GB RAM)
- **Containers:** Docker on `supabase_default` network
- **CI/CD:** GitLab Runner, 3 environments (dev:4003, staging:4002, prod:4001)
- **CI Variables:** 16 variables (auto-deploy on push to master)
- **Cron:** Alpine container, 3 jobs (notify, snapshot, growth)

### 11.3 Security

- Server-only Supabase (service-role key, no anon key in browser)
- HttpOnly session cookies (90-day, SameSite=Lax, Secure)
- HSTS (2 years, preload-eligible)
- CSP strict (no unsafe-eval)
- Stripe webhook signature verification
- CRON_SECRET bearer token
- IP hashing (SHA-256, no raw storage)
- AI budget cap ($100/month)

---

## 12. Roadmap

### Phase 1: Foundation (May 2026) -- COMPLETE
- SVI v2 engine (8 dimensions, stage detection)
- Homepage redesign (Google-style)
- Auth system (Google OAuth + magic link)
- Supabase self-hosted (22 tables)
- Docker + GitLab CI deployment
- Email system (magic links)

### Phase 2: Monetization (May 19, 2026) -- COMPLETE
- Stripe full lifecycle (checkout, cancel, reactivate, portal)
- Credit/usage system (hybrid: trial + credits + subscription)
- 5 pricing tiers + credit packs
- 8 email templates
- Evidence Vault + Google Drive
- 10-page SVI report UI
- Workspace (dashboard, billing, reports, roadmap, profile)
- Admin panel (growth analytics, team, roadmap, R&D agent)
- i18n EN/VI
- 62 unit tests

### Phase 3: Growth (June-July 2026) -- PLANNED
- SEO landing pages for each free tool
- Referral program (earn credits)
- Accelerator cohort dashboard
- White-label for advisors/accountants
- Advanced cap table health check
- PDF export for all reports
- Push notifications (in-app)

### Phase 4: Scale (August-October 2026) -- PLANNED
- AU compliance checkers (ESIC, R&D tax, ASIC)
- Investor heat scoring
- Multi-entity cap table
- Custom branding (Growth plan)
- API developer portal
- Webhooks for enterprise integrations

### Phase 5: Ecosystem (Q4 2026+) -- DEFERRED
- Investor marketplace (after 100 paying users)
- Secondary liquidity tools
- Blockchain anchoring (optional proof)
- AI co-pilot for fundraising prep
- Community features

---

## 13. KPIs & Success Metrics

| Metric | Current | 3-Month Target | 6-Month Target |
|--------|---------|----------------|----------------|
| Registered users | 0 | 200 | 1,000 |
| Paying customers | 0 | 50 | 200 |
| MRR (AUD) | $0 | $5,000 | $30,000 |
| SVI analyses/month | 0 | 500 | 2,000 |
| Free tool usage/month | 0 | 1,000 | 5,000 |
| Conversion (free→paid) | -- | 5% | 10% |
| Churn rate | -- | <5% | <3% |
| NPS | -- | 40+ | 50+ |

---

## 14. Investment Thesis

### Problem
- 70% of Australian startups have cap table issues at Series A
- Fundraising readiness is opaque -- founders don't know what investors will question
- No single platform combines valuation scoring + ownership management + AI analysis

### Solution
- AI-powered 8-dimension SVI scoring with evidence confidence
- Investor-ready report in under 60 seconds
- Evidence vault with Google Drive integration
- Credit-based pricing accessible to pre-revenue startups

### Traction
- Full platform built and deployed in 19 days
- 8 AI agents operational
- 5 pricing tiers live with Stripe
- 8 free tools as lead magnets

### Business Model
- Hybrid: SaaS subscriptions + credit-based per-feature pricing
- Gross margins: 88-99.9% (AI costs minimal)
- Revenue targets: $5K MRR (3 months), $30K MRR (6 months)

### Unfair Advantages
- 8 AI agents continuously researching and improving
- 19-day launch speed (lean execution)
- AU-specific algorithms and market data
- Self-hosted infrastructure (low burn rate)
- Evidence-backed scoring (not self-reported surveys)

---

## 15. Strategic Guardrails

### Do NOT Position As
- Crypto exchange, token product, or public securities platform
- Replacement for lawyers, accountants, or tax advisors
- AI agent product (AI is internal intelligence, not brand)

### Do Position As
- Private digital ownership infrastructure
- AI-powered trust + verification infrastructure
- Fundraising readiness layer
- Pre-diligence trust pack

### Legal Review Required Before
- CSF (crowd-sourced funding) workflows
- Investor marketplace
- Secondary liquidity
- Securities transaction facilitation
- KYC/AML expansion

### Compliance Principles
- Valuation is estimate + assumptions, not formal valuation
- Term sheet analysis is educational, not legal advice
- No raw IP stored, no sensitive personal data on-chain
- Every AI output includes confidence, sources, and guardrail text

---

## 16. Technical Documentation

For detailed technical documentation, see:

| Document | Path | Lines |
|----------|------|-------|
| Master Blueprint | `/blockid.au.md` | 2,354 |
| System Architecture | `/docs/ARCHITECTURE.md` | 829 |
| API Reference | `/docs/API-REFERENCE.md` | 1,831 |
| Deployment Guide | `/docs/DEPLOYMENT.md` | 414 |
| Product Roadmap | `/docs/ROADMAP.md` | 70 |

---

## 17. Brand Messaging & Value Proposition

### Logo & Slogan

**Logo:** Full lockup at `/images/logo-official.png` -- Octagon + 4-pointed sparkle star + "BlockID.au" + tagline  
**Slogan:** *Valuation. Ownership. Growth.*  
**Extended:** *The agentic AI valuation platform for business growth from day one.*

### Headlines (Conversion-Optimized)

**Hero Headlines (Homepage):**

| Variant | Headline |
|---------|----------|
| Primary | **The agentic AI valuation platform for business growth from day one.** |
| Founder-focused | **Know your startup's real value before investors ask.** |
| Action-driven | **Turn your idea into a valuable, investable business.** |
| Data-driven | **8 dimensions. Evidence-backed. Investor-ready in 60 seconds.** |
| Emotional | **Stop guessing your startup's worth. Start proving it.** |

**Sub-headlines:**

| Context | Sub-headline |
|---------|-------------|
| Hero | Index valuation, ownership, and execution milestones from idea to scale. |
| SVI section | Free AI-powered analysis in under 60 seconds. No credit card needed. |
| Pricing | Start with 1 free analysis. Scale when you're ready. |
| Evidence | Every claim backed by proof. Every score backed by data. |

**CTA Button Text:**

| Placement | CTA Text |
|-----------|----------|
| Hero primary | Start Your Journey |
| Hero secondary | Explore Platform |
| SVI search | Get My SVI |
| Pricing (free) | Try Free -- Then A$1/report |
| Pricing (paid) | Claim Your Founding 50 Spot |
| Post-analysis | View Full Report |
| Email | Sign in to Dashboard |
| Insufficient credits | Buy Credits |

**Taglines for Different Audiences:**

| Audience | Tagline |
|----------|---------|
| Pre-seed founder | "Your first investor meeting starts here." |
| Seed-stage founder | "Be the founder investors trust before the first call." |
| Accelerator manager | "Track cohort value creation from day one." |
| Startup lawyer | "Cap table hygiene, automated." |
| Angel investor | "Pre-diligence in 60 seconds, not 60 days." |

### What Makes BlockID Different from Other AI Assistants

| Other AI Tools | BlockID.au |
|----------------|-----------|
| Generic chatbot answers about startups | **8-dimension scoring engine with AU-specific benchmarks** |
| One-time analysis, no memory | **Persistent SVI account with weekly delta tracking** |
| No evidence system | **Evidence vault with 6 confidence levels (20%-100%)** |
| No payment/billing integration | **Full Stripe lifecycle + credit-based metering** |
| No investor-facing output | **Shareable investor link with view tracking** |
| No continuous improvement | **8 AI agents + daily cron intelligence** |
| No ownership/cap table context | **Cap table + governance + legal compliance scoring** |
| Generic global advice | **AU-specific: ABN, ASIC, ESIC, R&D tax, SHA norms** |
| Text output only | **10-page guided report + PDF export + email delivery** |
| Free with no commitment | **Free trial → credit → subscription (proven conversion funnel)** |

---

## 18. Long-Term Monetization Strategy

### 18.1 Revenue Layers (Cumulative)

```
Year 1: Credit + Subscription
  └── SVI analyses, reports, term sheet AI
  └── Founding 50, Founder, Growth plans

Year 2: Platform + Channel
  └── White-label for accelerators/advisors
  └── API access for fintech integrations
  └── Custom branding + co-branded reports

Year 3: Data + Intelligence
  └── AU startup benchmark database (anonymized)
  └── Investor matching (discovery, not marketplace)
  └── Compliance-as-a-service (ESIC, R&D tax)

Year 4+: Ecosystem
  └── Secondary liquidity facilitation
  └── Tokenized cap table infrastructure
  └── Cross-border (NZ, SEA expansion)
```

### 18.2 User Lifecycle Pricing

| Stage | User Action | Revenue |
|-------|-------------|---------|
| Discover | Free tool (dilution, cap table) | $0 -- lead capture |
| Trial | First SVI analysis (free) | $0 -- activation |
| Convert | Second analysis (A$1 early-bird) | $1 |
| Commit | Founding 50 (A$49) | $49 |
| Subscribe | Founder plan (A$99/mo) | $99/mo |
| Scale | Growth plan (A$499/mo) | $499/mo |
| Enterprise | Accelerator/advisor license | $20K+/yr |

### 18.3 Email Follow-up Sequences

**Sequence 1: Post-Free-Analysis (Day 0-14)**

| Day | Email | Goal |
|-----|-------|------|
| 0 | SVI Report email (auto) | Deliver value immediately |
| 1 | Welcome email (cron) | Introduce platform features |
| 3 | "Your top 3 evidence gaps" | Drive evidence upload |
| 7 | Weekly report (cron) | Show delta = 0 (motivate action) |
| 10 | "Founders like you upgraded for A$1" | Conversion to paid |
| 14 | "Your SVI is expiring" | Urgency to re-engage |

**Sequence 2: Post-Payment (Day 0-30)**

| Day | Email | Goal |
|-----|-------|------|
| 0 | Payment confirmation | Confirm + onboard |
| 1 | "Complete your startup profile" | Data collection |
| 3 | "Upload your first evidence" | Activate evidence vault |
| 7 | Weekly report | Reinforce value |
| 14 | "Share your SVI with investors" | Viral sharing |
| 21 | "Your 30-day growth plan" | Long-term engagement |
| 30 | "How you've grown" (30-day review) | Retention |

**Sequence 3: Churn Prevention (Cancel trigger)**

| Trigger | Email | Offer |
|---------|-------|-------|
| Cancel initiated | "We're sorry to see you go" | COMEBACK30 (30% off) |
| 7 days before end | "Your plan ends in 7 days" | Reminder + value recap |
| Day of expiry | "You've been downgraded" | Re-subscribe CTA |
| 30 days post-cancel | "What's new at BlockID" | Feature update + offer |

---

## 19. Evidence-Based Startup Validation System

### 19.1 Vision: AI-Driven Continuous Validation

BlockID doesn't just score startups once -- it **continuously validates and improves** through evidence:

```
Founder adds evidence (pitch deck, Stripe, GitHub)
    ↓
AI Agent auto-rescores SVI (new confidence level)
    ↓
Delta tracked (+5 SVI this week)
    ↓
Growth Intelligence Agent analyzes patterns
    ↓
Personalized recommendations generated
    ↓
Founder receives weekly report with actions
    ↓
Evidence loop continues...
```

### 19.2 Evidence Sources (Current + Planned)

| Source | Confidence | Status |
|--------|-----------|--------|
| Manual text (self-declared) | 20% | Active |
| Public URL (website, LinkedIn) | 35% | Active |
| Document upload (PDF, DOCX) | 50% | Active |
| GitHub (OAuth) | 75% | Planned (Phase 3) |
| Google Analytics (OAuth) | 75% | Planned (Phase 3) |
| Stripe (OAuth) | 90% | Planned (Phase 3) |
| ASIC company search (API) | 90% | Planned (Phase 4) |
| Third-party audit report | 100% | Manual verification |

### 19.3 Per-Member Equity Share Tracking (Phase 4+)

Future vision: Each startup member sees their **individual ownership value** in real-time:

```
Startup: TechCo (SVI: 142, Stage 4, Estimated Value: A$2.4M)

┌─────────────────────────────────────────────────────────┐
│ Member         │ Equity │ Vested │ Value (est.)  │ SVI  │
├────────────────┼────────┼────────┼───────────────┼──────┤
│ Alice (CEO)    │ 40%    │ 75%    │ A$720,000     │ 142  │
│ Bob (CTO)      │ 30%    │ 75%    │ A$540,000     │ 142  │
│ ESOP Pool      │ 15%    │ --     │ A$360,000     │ --   │
│ Angel Investor │ 10%    │ 100%   │ A$240,000     │ --   │
│ Advisor        │ 5%     │ 50%    │ A$60,000      │ --   │
└─────────────────────────────────────────────────────────┘
```

Each member gets:
- Personal dashboard showing their equity position
- Vesting schedule visualization
- Value change notifications (weekly)
- Evidence they contributed (assigned to their role)
- Shareable "ownership proof" link

---

## 20. Phase 3-8 Detailed Goals

### Phase 3: Growth Engine (June-July 2026)

**Goal:** First 50 paying customers, $5K MRR

| # | Feature | Priority | Impact |
|---|---------|----------|--------|
| 3.1 | SEO landing pages (8 tools) | P0 | Organic traffic |
| 3.2 | Referral program (earn 2 credits per invite) | P0 | Viral growth |
| 3.3 | Evidence auto-rescore (upload → re-SVI) | P0 | Engagement |
| 3.4 | OAuth connectors (GitHub, Analytics, Stripe) | P1 | Confidence upgrade |
| 3.5 | Milestone badges (15+ achievements) | P1 | Gamification |
| 3.6 | PDF export for SVI report | P1 | Deliverable value |
| 3.7 | Accelerator cohort dashboard | P1 | B2B channel |
| 3.8 | White-label for advisors | P2 | Channel partner |
| 3.9 | Email sequence automation (3 sequences) | P0 | Retention |
| 3.10 | Homepage A/B testing (5 headline variants) | P1 | Conversion |

### Phase 4: Scale & Compliance (August-October 2026)

**Goal:** 200 paying customers, $15K MRR

| # | Feature | Priority | Impact |
|---|---------|----------|--------|
| 4.1 | AU compliance checkers (ESIC, R&D tax, ASIC) | P0 | Value-add |
| 4.2 | Per-member equity tracking (cap table v2) | P0 | Core product |
| 4.3 | Investor heat scoring | P1 | Investor-side value |
| 4.4 | Multi-entity cap table | P1 | Enterprise |
| 4.5 | Custom branding (Growth plan) | P1 | Retention |
| 4.6 | API developer portal | P2 | Platform play |
| 4.7 | Webhooks for enterprise | P2 | Integration |
| 4.8 | Advanced weekly reports (AI summary + chart) | P1 | Engagement |

### Phase 5: Intelligence Layer (November-December 2026)

**Goal:** 500 paying customers, $30K MRR

| # | Feature | Priority | Impact |
|---|---------|----------|--------|
| 5.1 | AU startup benchmark database (anonymized) | P0 | Data moat |
| 5.2 | Investor discovery (not marketplace) | P1 | Revenue |
| 5.3 | AI co-pilot for fundraising prep | P1 | Differentiation |
| 5.4 | Compliance-as-a-service | P1 | Revenue stream |
| 5.5 | Community features (founder directory) | P2 | Network effect |

### Phase 6: Platform (Q1 2027)

**Goal:** 1,000 customers, platform revenue

| # | Feature | Priority |
|---|---------|----------|
| 6.1 | Investor marketplace (regulated) | P0 |
| 6.2 | Data room with investor tracking | P0 |
| 6.3 | Secondary liquidity tools | P1 |
| 6.4 | Blockchain anchoring (proof-trail) | P2 |
| 6.5 | Tokenized cap table infrastructure | P2 |

### Phase 7: Expansion (Q2-Q3 2027)

| # | Feature | Priority |
|---|---------|----------|
| 7.1 | New Zealand market entry | P0 |
| 7.2 | Southeast Asia pilot | P1 |
| 7.3 | Multi-language (Mandarin, Hindi) | P1 |
| 7.4 | Enterprise API partnerships | P0 |

### Phase 8: Ecosystem (Q4 2027+)

| # | Feature | Priority |
|---|---------|----------|
| 8.1 | Cross-border fundraising infrastructure | P0 |
| 8.2 | AI-powered due diligence automation | P0 |
| 8.3 | Government grant integration (AU) | P1 |
| 8.4 | Private capital markets protocol | P1 |

---

## 21. AI Agent R&D Continuous Loop

### How the AI Agent Team Drives Product Evolution

```
┌───────────────────────────────────────────────────────────┐
│                  BlockID AI Agent Ecosystem                │
├───────────────────────────────────────────────────────────┤
│                                                           │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐   │
│  │ R&D Agent   │───▶│ Growth      │───▶│ Email Agent │   │
│  │ (Research)  │    │ Intelligence│    │ (Outreach)  │   │
│  │             │    │ (Insights)  │    │             │   │
│  │ - Competitors│    │ - Funnel    │    │ - Follow-up │   │
│  │ - Features  │    │ - Behavior  │    │ - Retention │   │
│  │ - Pricing   │    │ - Conversion│    │ - Upsell    │   │
│  │ - CTAs      │    │ - Churn     │    │ - Reactivate│   │
│  └──────┬──────┘    └──────┬──────┘    └─────────────┘   │
│         │                  │                              │
│         ▼                  ▼                              │
│  ┌─────────────────────────────────┐                     │
│  │     Product Development         │                     │
│  │  (New features from research)   │                     │
│  └─────────────┬───────────────────┘                     │
│                │                                          │
│         ┌──────┴──────┐                                   │
│         ▼             ▼                                   │
│  ┌─────────────┐ ┌─────────────┐                         │
│  │ SVI Engine  │ │ Term Sheet  │  ...more product agents │
│  │ (Score)     │ │ AI (Analyze)│                         │
│  └──────┬──────┘ └──────┬──────┘                         │
│         │               │                                │
│         └───────┬───────┘                                │
│                 ▼                                         │
│  ┌─────────────────────────────────┐                     │
│  │     Customer Value Delivered     │                     │
│  │  (Reports, scores, evidence)     │                     │
│  └─────────────┬───────────────────┘                     │
│                │                                          │
│                ▼                                          │
│  ┌─────────────────────────────────┐                     │
│  │     Usage Data (Feedback Loop)  │                     │
│  │  → Back to Growth Intelligence  │                     │
│  └─────────────────────────────────┘                     │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

### Weekly AI Agent Cycle

| Day | Agent | Action |
|-----|-------|--------|
| Monday | R&D Agent | Research competitors, market trends |
| Tuesday | R&D Agent | Generate feature proposals |
| Wednesday | Growth Intelligence | Analyze weekly funnel + user behavior |
| Thursday | Growth Intelligence | Recommend pricing/CTA changes |
| Friday | Email Agent | Send weekly reports to all users |
| Saturday | Cron Agent | Weekly SVI snapshots for all accounts |
| Sunday | R&D Agent | Compile weekly R&D report for admin |

---

## 22. PRD Governance & Continuous Evolution

### 22.1 Living Document Principle

This PRD is a **living document** that evolves with every product change. Every new feature, pricing change, architecture decision, or market insight MUST be reflected here before or immediately after implementation.

### 22.2 Change Management Process

```
New Request / Change / Insight
        ↓
Analyze: Impact on SVI engine, pricing, UX, infrastructure
        ↓
Document: Update relevant PRD section(s)
        ↓
Implement: Code changes via GitLab CI
        ↓
Validate: Test + verify on production
        ↓
Merge back: Update PRD with actual outcomes
        ↓
Loop: R&D Agent reviews weekly for gaps
```

### 22.3 PRD Update Triggers

| Trigger | PRD Section(s) to Update | Responsible |
|---------|--------------------------|------------|
| New feature shipped | Sections 5 (Features), 12 (Roadmap) | Dev + R&D Agent |
| Pricing change | Sections 7 (Revenue), 18 (Monetization) | Growth Intelligence |
| New AI agent added | Section 6 (Agents), 21 (R&D Loop) | Product |
| Database schema change | Section 10 (Schema) | Dev |
| New API endpoint | Section 10 + docs/API-REFERENCE.md | Dev |
| Market research completed | Sections 3 (Market), 14 (Thesis) | R&D Agent |
| User feedback pattern | Section 17 (Messaging), 19 (Validation) | Growth Intelligence |
| Competitor change | Section 17 (Differentiation table) | R&D Agent |
| Security/compliance update | Section 15 (Guardrails) | Admin |

### 22.4 Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-05-20 | Initial PRD — Phase 1-2 complete, 21 sections |
| 1.1 | 2026-05-20 | Added sections 17-21: messaging, monetization, evidence, phases 3-8, AI loop |
| 1.2 | 2026-05-20 | Added section 22 (governance), 23 (self-assessment) |

### 22.5 PRD as Valuation Reference

This PRD serves as the **primary input document** for BlockID's own SVI self-assessment. All evidence referenced in the self-analysis (Section 23) traces back to specific PRD sections, enabling:

- Transparent valuation methodology (every claim is documented)
- Audit trail for investors (PRD version history = proof of progress)
- AI agent reference (R&D Agent reads PRD to generate proposals)
- Onboarding document for new team members or partners

---

## 23. BlockID.au Self-Assessment (SVI Analysis)

### 23.1 BlockID as its Own First Customer

BlockID.au uses its own SVI engine to score itself — the ultimate dog-fooding exercise. This self-assessment is generated from real evidence: git history, deployed code, database state, documentation, and financial infrastructure.

### 23.2 Evidence Sources

| Evidence | Type | Confidence | Reference |
|----------|------|-----------|-----------|
| 212 TypeScript files deployed | Connected source (git) | 75% | GitLab repository |
| 50 API routes live | Connected source (server) | 75% | Production container |
| 22 database tables | Connected source (Supabase) | 75% | Migration files |
| Stripe Live integration | Transaction data | 90% | Stripe Dashboard |
| 8 AI agents operational | Connected source | 75% | ai-client.ts, cron jobs |
| Domain blockid.au live | Public URL | 35% | https://blockid.au |
| ABN registered (Auschain Pty Ltd) | Document | 50% | ASIC registration |
| 62 unit tests passing | Connected source | 75% | Vitest output |
| PRD + 5 docs (6,000+ lines) | Document uploaded | 50% | This file |
| Gmail SMTP active | Transaction data | 90% | Email delivery logs |

### 23.3 SVI Self-Score

**Total SVI: ~145 (Strong)**

| Dimension | Score | Weight | Evidence |
|-----------|-------|--------|----------|
| **FTV** Founder & Team | 72/100 | 15% | Solo founder + 8 AI agents, serial builder (19-day launch) |
| **MPC** Market & Problem | 78/100 | 18% | Clear problem (cap table issues), large TAM (600K AU companies), validated via research |
| **PTD** Product & Technical | 92/100 | 12% | Full product deployed (212 files), 50 APIs, 8 free tools, connected sources |
| **TRE** Traction & Revenue | 35/100 | 20% | Pre-revenue, Stripe live but no paying customers yet |
| **CGH** Cap Table & Governance | 55/100 | 12% | ABN registered, no formal SHA yet, ESOP not allocated |
| **IRI** Investor Readiness | 82/100 | 10% | PRD complete, roadmap detailed, pitch material ready via admin pages |
| **LCO** Legal & Compliance | 48/100 | 8% | ABN confirmed, no IP filings, basic terms/privacy pages |
| **SVM** Strategic Vision & Moat | 75/100 | 5% | Data moat potential (AU benchmarks), 8 AI agents, switching costs |

**Stage:** 2 (MVP / Prototype) — advancing to Stage 3 (Early Traction) with first customers

**Risk Penalties:**
- Solo founder (-8 SVI)
- Pre-revenue (-7 SVI)
- No formal IP protection (-5 SVI)

**Top 3 Actions to Improve:**
1. **P0:** Get first paying customer (+18 SVI) → move to Stage 4
2. **P0:** File trademark for "BlockID" and "SVI" (+7 SVI)
3. **P1:** Create formal shareholders agreement (+5 SVI)

### 23.4 Next Steps (Derived from Self-Assessment)

| Priority | Action | Expected SVI Impact | Timeline |
|----------|--------|-------------------|----------|
| P0 | Acquire first 10 paying customers | +20 SVI (Stage 3→4) | Week 1-2 |
| P0 | File provisional trademark (BlockID, SVI) | +7 SVI | Week 1 |
| P0 | Set up ESOP pool (10%) | +5 SVI | Week 2 |
| P1 | Connect Google Analytics to evidence | +8 SVI (confidence 75%) | Week 2 |
| P1 | Publish case study from first customer | +5 SVI (social proof) | Week 3 |
| P1 | Engage startup lawyer (SHA draft) | +5 SVI | Week 3 |
| P2 | Board advisory (1-2 advisors) | +8 SVI | Month 2 |
| P2 | R&D tax incentive application | +3 SVI | Month 2 |

---

## 24. Multi-Project / Multi-Startup per User

### 24.1 Concept

One founder often has multiple ideas or runs multiple ventures. BlockID must allow any user to create and manage **N independent startup projects** within a single account, each with its own SVI score, evidence vault, snapshots, and investor reports.

### 24.2 Architecture

```
app_users (1 per email)
    │
    ├── projects (N per user)
    │       │
    │       ├── svi_accounts (1 per project)
    │       │       ├── svi_analyses (N)
    │       │       ├── svi_snapshots (N)
    │       │       ├── svi_evidence (N)
    │       │       └── svi_milestones (N)
    │       │
    │       ├── idea_evaluations (N)
    │       ├── equity_splits (N)
    │       ├── funding_plans (N)
    │       └── founder_packs (N)
    │
    └── credit_balances (1 per user -- shared wallet)
            └── credit_transactions (N, tagged with project_id)
```

### 24.3 Credit Model: Shared Wallet + Per-Project Tracking

- Credits remain at **USER level** (one wallet)
- Each transaction records which **project** consumed the credit
- Rationale: simpler UX, one balance to manage, full audit per project

### 24.4 Project Limits by Plan

| Plan | Max Projects | Extra Projects |
|------|-------------|----------------|
| Free | 1 | N/A |
| Founding 50 | 3 | A$10/mo each |
| Founder ($99/mo) | 3 | A$10/mo each |
| Growth ($499/mo) | 10 | A$10/mo each |
| Enterprise | Unlimited | Included |

### 24.5 Implementation Sub-Goals

| # | Sub-Goal | Priority | Week |
|---|----------|----------|------|
| SG-1 | DB migration: `projects` table + project_id FKs | P0 | 1 |
| SG-2 | Project management library (`projects.ts`) | P0 | 1 |
| SG-3 | Project switcher UI (workspace topbar) | P1 | 2 |
| SG-4 | Project management page (`/workspace/projects`) | P1 | 2 |
| SG-5 | API updates (SVI, credits, evidence accept projectId) | P0 | 2 |
| SG-6 | Dashboard context (load data per active project) | P1 | 3 |
| SG-7 | Project onboarding flow (name → industry → stage → SVI) | P2 | 3 |
| SG-8 | Pricing enforcement (plan limits + add-on billing) | P1 | 4 |

### 24.6 Backward Compatibility

- All `project_id` columns are **nullable** (existing data works without project)
- Default project auto-created for every existing user during migration
- Email-based queries remain as fallback until fully migrated
- No destructive schema changes — purely additive

### 24.7 Success Metrics

- 30% of paid users create 2+ projects within 60 days
- Multi-project add-on revenue: A$500/month by Month 3
- Zero regression in single-project UX

---

---

## Implementation Status (May 2026)

All 8 phases have been designed and the first 2 are fully deployed in production. Phases 3-8 have detailed specifications and roadmap milestones defined. Below is a comprehensive summary of everything built.

### Phase 1: Foundation -- COMPLETE
- SVI v2 engine with 8 weighted dimensions and 7-stage detection
- Homepage redesign (Google-style search UX with hero banner)
- Auth system: Google OAuth + Magic Link (15-min expiry) + 90-day sessions
- Supabase self-hosted with 22 database tables and 15 migrations
- Docker containerised deployment on GCP n1-highmem-8
- GitLab CI/CD with 3 environments (dev:4003, staging:4002, prod:4001)
- Email system with nodemailer + Gmail SMTP
- i18n support (EN/VI toggle with cookie persistence)

### Phase 2: Monetization -- COMPLETE
- Stripe full lifecycle: checkout, cancel, reactivate, portal, change-plan, webhook
- Credit/usage system: hybrid model (trial + credits + subscription)
- 5 pricing tiers + 3 credit packs live with Stripe
- 8 email templates (magic link, score ready, score viewed, welcome, weekly report, SVI report, payment confirmation, payment link)
- Evidence Vault with Google Drive integration (service account)
- 10-page AI-powered SVI report with page navigation
- Workspace: SVI dashboard, billing, weekly reports, growth roadmap, profile
- Admin panel: dashboard, growth intelligence, product roadmap, team/agents, AI R&D agent, documents
- 62 unit tests (Vitest)

### Phase 3: Growth Engine -- DESIGNED (June-July 2026)
- SEO landing pages, referral program, accelerator cohort dashboard
- Evidence auto-rescore, OAuth connectors (GitHub, Analytics, Stripe)
- PDF export, milestone badges, email sequence automation

### Phase 4: Scale & Compliance -- DESIGNED (August-October 2026)
- AU compliance checkers (ESIC, R&D tax, ASIC)
- Per-member equity tracking (cap table v2), investor heat scoring
- API developer portal, webhooks for enterprise

### Phase 5: Intelligence Layer -- DESIGNED (November-December 2026)
- AU startup benchmark database (anonymized), investor discovery
- AI co-pilot for fundraising prep, compliance-as-a-service

### Phase 6: Platform -- DESIGNED (Q1 2027)
- Investor marketplace, data room with investor tracking
- Secondary liquidity tools, blockchain anchoring

### Phase 7: Expansion -- DESIGNED (Q2-Q3 2027)
- New Zealand market entry, Southeast Asia pilot
- Multi-language (Mandarin, Hindi), enterprise API partnerships

### Phase 8: Ecosystem -- DESIGNED (Q4 2027+)
- Cross-border fundraising infrastructure
- AI-powered due diligence automation
- Government grant integration, private capital markets protocol

### Infrastructure
- **Private Blockchain:** BlockID Chain (Cosmos SDK v0.50.12, chain-id blockid-testnet-1)
- **Explorer:** https://explorer.blockid.au (private testnet explorer)
- **EVM Compatibility:** MetaMask wallet integration for on-chain equity
- **Web Server:** Nginx (ports 80/443, TLS termination)
- **CDN/DNS:** Cloudflare (SSL, caching, DDoS protection)
- **Containers:** Docker on supabase_default network (Next.js 16 on port 4001)
- **CI/CD:** GitLab Runner with 16 CI variables, auto-deploy on push to master

### Automation: 8 Cron Jobs
1. `svi-notify` -- Daily SVI welcome emails for new accounts
2. `svi-snapshot` -- Weekly SVI score snapshots for delta tracking
3. `growth-insights` -- Daily AI-powered funnel analysis
4. `weekly-insights` -- Weekly insights digest compilation
5. `publish-insight` -- Auto-publish curated insights
6. `nurture` -- Email nurture sequences (Day 3, 7, 10, 14)
7. `svi-review` -- Periodic SVI account health review
8. `ai-health` -- AI provider health check and failover monitoring

### AI: 6-Provider Fallback Chain
1. Claude CLI OAuth token (~/.claude/.credentials.json)
2. ANTHROPIC_API_KEY environment variable
3. Admin-configured DB keys (ai_provider_keys table, 5-min cache)
4. OpenAI (GPT-4o-mini via OPENAI_API_KEY)
5. Google Gemini (GOOGLE_GEMINI_API_KEY, free quota)
6. Graceful degradation (error with retry guidance)
- Primary model: Claude Haiku 4.5 (99% of requests, ~$0.003/call)
- Premium model: Claude Sonnet 4.6 (term sheet analysis, ~$0.10/call)
- Monthly AI budget cap: USD $100

### Skills & Agents
- **38 skill directories** in `.claude/skills/` (120 skill files total)
- Skills include: analytics, api-designer, architecture-designer, blockchain-expert, cfo, cmo, coo, cpo, cro, cto, investor-relations, media-studio, nextjs-developer, react-expert, typescript-pro, devops-engineer, security-audit, seo-audit, and more
- **7 C-level agent roles:** CFO, CMO, COO, CPO, CRO, CTO, plus Investor Relations
- **8 AI agents operational:** SVI Analysis, Term Sheet AI, Competitive Research, SVI Report, Growth Intelligence, R&D Research, Email Notification, Cron Scheduler

### Blockchain & Tokenization
- **SVT (Startup Value Token):** 20M total supply, maps cap table equity to on-chain tokens
- **TokenFactory:** Mint/burn/transfer tokens per cap table changes, bi-directional sync
- **MetaMask Integration:** Wallet connection for on-chain equity viewing
- **ESOP Module:** Employee stock option pool management (vesting schedules, cliff periods)
- **Dividends Engine:** Revenue-based dividend calculation and distribution tracking
- **Cap Table Sync:** Real-time sync between web DB cap table and on-chain token balances
- **Share Restrictions:** Transfer restrictions, lock-up periods, right of first refusal

### Key Metrics at Launch
| Metric | Value |
|--------|-------|
| TypeScript files | 358 |
| Pages | 69 |
| API routes | 90 |
| Database tables | 22 |
| Database migrations | 15 |
| Free tools | 10 (8 original + ESIC checker + R&D tax calculator) |
| Email templates | 8 |
| AI agents | 8 (all active) |
| Unit tests | 62 |
| Pricing tiers | 5 |
| Cron jobs | 8 |
| Skill directories | 38 |

---

## Update Log: 2026-05-21 Session Summary

### Platform Metrics (Final)
| Metric | Value |
|--------|-------|
| TypeScript files | **394** |
| Pages | **70** |
| API routes | **107** |
| DB tables | **51** |
| DB migrations | **34** |
| Git commits | **178** |
| Goal files | **74** |
| Skill directories | **44** |
| AI agents | **8** (all active) |
| Unit tests | **62** |
| Users | **8** |
| SVI analyses | **37** |
| Cron jobs | **8** |

### Features Shipped This Session

**Core Platform:**
- Homepage redesign (Google-style hero + banner)
- SVI 8-dimension scoring engine + 10-page guided report
- PDF export via @react-pdf/renderer
- Multi-project system (manage N startups per account)
- Per-member equity tracking + vesting visualization
- Data room checklist (21 investor items)
- Onboarding wizard (3-step post-signup)
- Pricing page (3 tiers + credit packs + FAQ)

**Payments & Revenue:**
- Stripe full lifecycle (checkout → portal → cancel → reactivate)
- Credit/usage system (trial + credits + subscription)
- 3 active coupons (LAUNCH50, BLOCKID25, EARLYBIRD)
- Referral program (2 credits per invite)

**AI & Intelligence:**
- 8 AI agents operational (SVI, Term Sheet, Research, Report, Growth, R&D, Email, Cron)
- AI R&D dashboard for admin
- Growth Intelligence daily cron

**Evidence & Verification:**
- Evidence vault + Google Drive auto-share
- GitHub OAuth connector (75% confidence)
- URL verification endpoint
- Auto-rescore on evidence upload

**Investor Features:**
- Polished investor share page
- Heat scoring (track engagement: time, scroll, views)
- Activity dashboard (hot/warm/cold investors)

**Email System:**
- 20+ templates (magic link, score, report, welcome, weekly, nurture, payment, cancellation)
- CAN-SPAM compliant unsubscribe system
- Vietnamese language support
- 4 nurture sequences (free, paid, churn, re-engage)

**i18n:**
- Full Vietnamese support: reports, emails, UI
- Cookie-based locale persistence
- AI generates Vietnamese reports when VI selected

**Admin Panel (12 pages):**
- Dashboard, Growth Intelligence, Roadmap, Team & AI Agents
- AI R&D Agent, Self-Assessment, Accelerator Cohorts
- Users, Documents, Config, Notifications

**B2B:**
- Accelerator cohort dashboard (create, track, leaderboard)
- API key management + rate limiting
- /developers API documentation page

**Compliance & Tools (10 free):**
- ESIC eligibility checker
- R&D tax incentive calculator
- Dilution, cap table, term sheet, equity split, funding plan, idea valuation, data room, co-founder match

**SEO & Marketing:**
- sitemap.xml (22 URLs), robots.txt
- SEO meta on all pages
- Schema.org JSON-LD
- GA4 + GTM integration

**Video Production:**
- 3-minute pitch video (voice-led, AU male, HelpNow demo)
- 1-minute pitch video
- Screen recording (Playwright)
- Voiceover scripts + SRT subtitles

**Documentation:**
- PRD: 1,229 lines, 24+ sections
- Architecture: 829 lines
- API Reference: 1,831 lines
- Deployment: 414 lines
- 74 goal files across all phases

### C-Level Team Structure
| Role | Agent/Person | Responsibility |
|------|-------------|---------------|
| CEO/Founder | Do Van Long | Vision, strategy, fundraising |
| CTO | AI Agent | Architecture, features, CI/CD |
| CMO | AI Agent | SEO, content, growth, conversion |
| CFO | AI Agent | Revenue, pricing, Stripe metrics |
| COO | AI Agent | Sprint planning, operations |
| CPO | AI Agent | Product strategy, UX, onboarding |
| CRO | AI Agent | Conversion funnels, retention |
| CDO | AI Agent | Data strategy, AI governance |
| CLO | AI Agent | IP, contracts, compliance |
| CISO | AI Agent | Security, data protection |
| CHRO | AI Agent | Team, ESOP, culture |

### 3 Test Use Cases Verified
| Case | User | SVI | Evidence | Share Link |
|------|------|-----|----------|------------|
| HelpNow.au | info@helpnow.au | **128** | 11 items | /s/Wz4MTVpLyS8j |
| LongCare.au | ceo@longcare.au | **130** | 2 items | /s/L24AoELdJouE |
| BlockID.au | admin@blockid.au | **142** | 18 items | /s/5v6miPmjEu9C |

### Deployment Status
| Environment | Container | Port | Status |
|-------------|-----------|------|--------|
| Production | deploy-blockid-production | 4001 | Healthy |
| Staging | deploy-blockid-staging | 4002 | Healthy |
| Dev | deploy-blockid-dev | 4003 | Healthy |

### Git: Committed + pushed to master (commit e521752)
GitLab CI auto-deploy triggered for all 3 environments.

---

*This PRD is the single source of truth for BlockID.au product decisions.*  
*Version 2.0 | Last updated: 2026-05-21.*  
*Platform: 394 TS files, 70 pages, 107 API routes, 51 DB tables, 178 commits.*  
*Documentation: 10,000+ lines across 7 docs + 74 goal files + 44 skills.*

**BlockID.au — Valuation. Ownership. Execution. Growth.**

