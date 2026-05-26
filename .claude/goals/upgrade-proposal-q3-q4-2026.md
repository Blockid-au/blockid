# BlockID.au — Strategic Upgrade Proposal (Q3-Q4 2026)

Based on comprehensive competitor analysis of 24+ platforms and deep audit of the current BlockID.au codebase (70 pages, 140+ API endpoints, 40+ DB tables).

## Executive Summary

BlockID.au is the ONLY platform connecting idea validation, viability scoring, valuation, equity management, tokenization, and fundraising in a single AI-native lifecycle. Every competitor solves one piece. BlockID solves the journey.

**Current state:** Phase 1-2 complete (SVI engine, auth, credits, evidence vault, 10-page reports, cap table basics, equity setup). 70 pages, 140+ endpoints.

**Opportunity:** $5.1B AU VC market (2025, +24% YoY), no integrated AI-native platform exists for AU early-stage founders.

---

## Priority 1: FREE Acquisition Tools (July 2026)

### 1.1 ESIC Eligibility Checker (FREE)
- **Why:** Every AU tech startup + angel investor needs this. No automated tool exists.
- **How:** Auto-assess from SVI profile data (100-point innovation test, $200K expenditure test)
- **Competitor gap:** SeedLegals has SEIS/EIS (UK only), nobody has ESIC automation
- **Impact:** Strong top-of-funnel acquisition for AU market

### 1.2 R&D Tax Incentive Estimator (FREE)
- **Why:** 43.5% refundable offset for turnover <$20M. Every AU tech startup claims this.
- **How:** Pull from startup profile (employees, R&D spend, revenue). Show estimated refund.
- **2026-27 budget changes:** Threshold rising to $50M turnover, min spend to $50K (effective July 2028)
- **Impact:** SEO magnet + lead gen + founder trust

### 1.3 Startup Benchmarks Dashboard (FREE)
- **Why:** Founders constantly search "what's a good MRR for seed stage?" 
- **How:** Aggregate anonymized SVI data by stage/industry. Show percentiles.
- **Competitor gap:** CB Insights/PitchBook charge $20K+ for benchmarks. Crunchbase data is inaccurate.

---

## Priority 2: Revenue Multipliers (Aug-Sep 2026)

### 2.1 AI Pitch Deck Generator (1.00-2.00 credits)
- **Why:** Slidebean ($7-42/mo), Tome ($20/mo) do template-based decks. Nobody generates from actual data.
- **How:** Generate investor-ready deck from SVI data + Evidence Vault + valuation
- **Differentiator:** Data-driven, not template-driven. Includes SVI score + evidence citations.
- **Reference:** Slidebean helped founders raise $500M+. Evalyze matches from pitch analysis.

### 2.2 Living Valuation Engine (0.50-1.00 credits per revaluation)
- **Why:** Equidam charges $350+ for one-shot valuation. No continuous alternative.
- **How:** Auto-recalculate as SVI changes. Use Berkus/Scorecard/VC methods (like Equidam). Benchmark against comparable startups.
- **Revenue model:** First valuation free with SVI. Quarterly revaluations 1.00 credits.
- **Note:** Equidam launched MCP server for Claude integration — study their methodology.

### 2.3 Investor Data Room with Tracking (2.00-3.00 credits)
- **Why:** DocSend charges $45-250/mo. Founders need this for fundraising.
- **How:** Combine document management with SVI context + per-page analytics
- **Consider:** Integrate Papermark (open-source, self-hostable) as document layer
- **Differentiator:** Data room that shows investor your SVI score + valuation alongside docs

### 2.4 Expose C-Level AI Agents to Users
- **Why:** No competitor has multi-agent architecture. This is the killer differentiator.
- **How:** "Ask the CFO about your runway." "Ask the CMO about GTM strategy."
- **Agents already built:** CTO, CFO, CMO, CPO, CRO, COO, CISO, CLO, CDO, CHRO
- **Revenue:** 0.50 credits per agent consultation
- **Competitor gap:** Notion has general AI agents. BlockID has SPECIALIZED startup agents.

---

## Priority 3: Competitive Moat (Oct-Dec 2026)

### 3.1 Investor Matching + CRM (Phase 6)
- **Benchmark:** Finta ($22-99/mo) — AI investor matching, personalized outreach, deal rooms
- **How:** Match from SVI dimensions + stage + industry + geography
- **AU focus:** Build database of AU VCs, angels, accelerators, ESVCLP funds
- **Revenue:** 2.00-5.00 credits per investor match report

### 3.2 AU Compliance Automation
- **ASIC annual returns** — Auto-generate from cap table data
- **Director obligations tracking** — Deadlines, filing reminders
- **ESS reporting** — Employee Share Scheme tax reporting
- **ESIC certification maintenance** — Annual re-qualification check
- **Competitor gap:** Vestd has Companies House integration (UK). Nobody has ASIC integration.

### 3.3 Tokenization Layer (Phase 5)
- **Market context:** NYSE partnering with Securitize. Tokenized stock market at $1.2B.
- **Fairmint approach:** Off-chain first, optional on-chain sync (matches BlockID's existing architecture)
- **Standard:** Adopt Open Cap Table Format (OCF) for interoperability
- **Priority:** Equity-to-token mapping layer first, blockchain execution second
- **Revenue:** Token minting 3.00-5.00 credits

### 3.4 Multi-Entity Cap Table
- **Why:** Cake Equity supports cross-border ESOP (AU/US/UK). Carta is US-centric.
- **How:** Support Australian share structures (Ordinary, Preference, Employee shares under ESS)
- **Revenue:** Part of Growth/Enterprise plans

---

## Priority 4: Growth & Retention (Ongoing)

### 4.1 Onboarding Wizard (5-step guided tour)
- **Step 1:** Choose startup stage (Idea / MVP / Revenue / Growth)
- **Step 2:** Industry + team size
- **Step 3:** First SVI analysis (auto-triggered)
- **Step 4:** Connect evidence sources (GitHub, Analytics, LinkedIn)
- **Step 5:** Set goals (fundraise amount, timeline)
- **Impact:** 40% higher activation rate (industry benchmark)

### 4.2 Weekly AI Insights Email
- **Content:** Personalized SVI tips + action items + benchmark comparison
- **Benchmark:** Visible.vc does AI-powered investor updates. BlockID does AI-powered founder updates.
- **Revenue:** Free for paid plans, upsell for free users

### 4.3 Referral Program
- **Mechanic:** Give 2 credits, get 2 credits (viral loop)
- **Benchmark:** Dropbox grew 3900% with referrals
- **Implementation:** Already partially built (referral-card.tsx exists)

### 4.4 Mobile PWA Optimization
- **Why:** ~25% traffic is mobile. Current mobile UX needs improvement.
- **Priority:** Offline SVI viewing, push notifications, responsive dashboard

---

## Pricing Strategy Recommendations

### Current vs Proposed

| | Current | Proposed |
|---|---|---|
| **Free tier** | 2 credits | 5 credits + ESIC Checker + R&D Calculator |
| **Founding 50** | A$49 one-time, 100 credits | Keep (great acquisition) |
| **Growth** | A$99/mo, 100 credits | A$99/mo, 200 credits + priority agent access |
| **Enterprise** | Not available | A$499/mo, unlimited + API + white-label |
| **Credit packs** | 5-100 credits (A$5-25) | Keep + add A$50 pack (250 credits, 80% savings) |

### New Revenue Streams
1. **Agent consultations** — 0.50 credits per C-Level agent session
2. **Investor matching** — 2.00-5.00 credits per match report
3. **Pitch deck generation** — 1.00-2.00 credits
4. **Data room** — 3.00 credits one-time setup + 0.50/month hosting
5. **Token minting** — 3.00-5.00 credits per token deployment
6. **White-label/API** — Enterprise licensing for accelerators

---

## Integration Strategy (Build With, Not Against)

| Platform | Integration Type | Value |
|---|---|---|
| **Cake Equity** | Cap table data sync | Leverage their AU cap table depth |
| **Papermark** | Open-source data room | Self-host for document tracking |
| **Equidam MCP** | Valuation benchmarks | Feed benchmark data into valuation engine |
| **Notion** | Export/sync | Capture founders already in Notion |
| **Xero/MYOB** | Financial data | Auto-import revenue, expenses for valuation |
| **Stripe** | Already integrated | Expand to revenue verification for SVI |

---

## 90-Day Execution Plan

### Month 1 (July 2026): FREE Tools + Acquisition
- [ ] ESIC Eligibility Checker (free tool)
- [ ] R&D Tax Estimator (free tool)
- [ ] Onboarding wizard (5-step)
- [ ] Fix mobile responsiveness (from QA review)

### Month 2 (August 2026): Revenue Features
- [ ] AI Pitch Deck Generator
- [ ] Living Valuation Engine
- [ ] Expose C-Level Agents UI
- [ ] Referral program launch

### Month 3 (September 2026): Competitive Moat
- [ ] Investor Data Room with tracking
- [ ] Weekly AI Insights email automation
- [ ] Startup Benchmarks Dashboard
- [ ] Enterprise plan + API access

---

## KPI Targets

| Metric | Current | Month 1 | Month 3 | Month 6 |
|--------|---------|---------|---------|---------|
| Registered Users | ~50 | 200 | 500 | 2,000 |
| Paying Customers | ~5 | 30 | 100 | 400 |
| MRR (AUD) | ~$500 | $3K | $10K | $40K |
| SVI Analyses/month | ~100 | 500 | 1,500 | 5,000 |
| Free Tool Users | 0 | 300 | 1,000 | 5,000 |

---

## Sources
- 12 traditional competitors analyzed (Carta, Pulley, AngelList, Foundersuite, Visible.vc, Dealroom, Crunchbase, InnMind, Gust, SeedLegals, Vestd, Capdesk)
- 12 AI-native tools analyzed (Tome, Notion AI, Runway, Finta, DocSend, Slidebean, IdeaProof, ValidatorAI, Evalyze, PitchBob, Equidam, CB Insights)
- AU ecosystem: Cake Equity, R&D Tax rules, ESIC/ESVCLP 2026 budget changes
- Emerging: Securitize, Fairmint, Norm AI, AI agent market trends
