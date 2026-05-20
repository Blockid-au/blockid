# Spacecubed AI Fellowship -- Application Draft

## Program: AI Fellowship for AI-first startups
## Deadline: 2 June 2026
## Applicant: Auschain Pty Ltd (BlockID.au)

---

### Company Name

BlockID.au (operated by Auschain Pty Ltd, ACN 659 615 111, ABN 79 659 615 111)

---

### Founder

**Do Van Long** -- Founder & CEO
LinkedIn: [linkedin.com/in/dovanlong](https://linkedin.com/in/dovanlong)
Email: ceo@longcare.au
Website: [blockid.au](https://blockid.au)

Full-stack technical founder who single-handedly architected, built, and shipped BlockID.au from concept to live production product. Deep understanding of the Australian startup ecosystem and the systemic valuation challenges that destroy early-stage companies.

---

### One-line Description

AI-powered startup valuation platform that helps founders measure, prove, and grow their business value from Day 0 to exit.

---

### Problem (250 words)

The startup failure crisis is not a talent problem -- it is a visibility problem. Founders build in the dark.

**The numbers are brutal:**
- **90% of startups fail** over their lifetime (Failory 2026)
- **60% of Australian startups fail within 3 years** (ABS June 2025), with 75% gone within 5 years (Inside Small Business)
- **437,150 new Australian businesses** started vs **370,500 closed** in FY2024-25 -- a 30.3% annual churn rate (ABS)
- **42% fail** because there is no market need; **70% run out of cash** (CB Insights)
- Australian startups fail from "no product-market fit" at **33.3%** -- nearly three times the 12% global average (ScaleSuite)

**The AI explosion makes it worse, not better:**
- **$97 billion** poured into AI startup funding in 2024 -- 34% of all venture capital globally (Second Talent)
- **$252.3 billion** in total corporate AI investment in 2024 (Stanford HAI 2025)
- Yet **90% of AI startups still fail**, with a median lifespan of just 18 months (AI4SP, WinSavvy)
- **60%+ of AI tools** generate zero recurring revenue (Medium)
- **88-95% of AI pilots fail** to improve financials (MIT & Capgemini)

AI is generating more startup ideas than ever before, but it cannot build sustainable businesses. The tools to validate, track value, and manage equity are either nonexistent, prohibitively expensive (A$5,000-$50,000 for manual valuation taking 2-6 weeks), or hopelessly fragmented across dozens of disconnected platforms.

Founders need a single source of truth for their startup's value -- and they need it from Day 0.

---

### Solution (250 words)

BlockID.au is an agentic AI platform that gives founders instant, data-driven intelligence about their startup's value -- replacing weeks of manual work and thousands of dollars in consulting fees with a 60-second analysis.

**Core product -- Startup Value Index (SVI):**
- AI-generated **10-page R&D report in 60 seconds** covering market research, competitor analysis, financial projections, team assessment, and strategic recommendations
- **8-dimension scoring system**: Team, Market, Product, Traction, Cap Table, Investor Readiness, Legal, and Moat
- Deterministic SVI score (v2.0) that functions like a credit score for startups -- an objective, repeatable measure of startup health and progress
- **Evidence Vault** that lets founders upload documents, connect data sources (GitHub, Analytics, Stripe), and boost their SVI score with verified evidence
- **Auto-rescore** when new evidence is uploaded -- the report is a living document that grows with the startup

**Free tools suite (10 tools live):**
- Idea Valuation, Equity Split Calculator, Dilution Modeler, Cap Table Diff, Funding Plan Generator, Data Room Checklist, Term Sheet Analyzer, Cofounder Match, R&D Tax Calculator, and ESIC Eligibility Checker

**Full lifecycle coverage:**
BlockID accompanies founders from idea to exit across 8 planned phases: AI Analysis (live) -> Evidence Validation (in progress) -> Dollar Valuation -> Cap Table Management -> Blockchain Equity Tokenization (Cosmos SDK) -> Investment & Fundraise -> Revenue & Dividends -> Growth, Exit & Exchange.

One platform. Entire startup lifecycle. From idea to IPO.

---

### How AI is Core to Your Product

AI is not a feature of BlockID -- it is the foundation. Every core function is powered by AI.

**Multi-model AI engine with automatic failover:**
Our unified AI client chains four providers in priority order: Claude (Anthropic), OpenAI (GPT-4o-mini), Google Gemini (2.0 Flash), and proxy fallback. If any provider fails due to rate limiting, auth errors, or downtime, the system automatically falls through to the next available provider with zero user-facing disruption. This architecture ensures 99%+ AI availability.

**Parallel AI batch processing:**
The 10-page R&D report runs 3 concurrent AI batches simultaneously:
- Batch A: Core Assessment (Pages 1-3) -- executive summary, market analysis, product evaluation
- Batch B: Business Deep Dive (Pages 4-7) -- business model, competition, traction, team
- Batch C: Financial & Risk (Pages 8-10) -- financial projections, risk analysis, recommendations
This parallel architecture delivers a comprehensive report in ~60 seconds rather than the 3+ minutes sequential processing would require.

**SSE streaming to the frontend:**
Real-time Server-Sent Events stream analysis progress to users as each batch completes, providing live status updates during the 60-second generation process.

**URL scraping + AI analysis for competitive intelligence:**
When founders provide a website URL, BlockID scrapes the page, extracts technical signals, and feeds them into the AI analysis pipeline for automated competitor and market intelligence.

**AI-generated weekly reports and growth insights:**
Automated weekly email reports use AI to summarize startup progress, identify trends, and recommend next actions based on accumulated evidence.

**Proprietary prompt engineering:**
Custom-designed prompts for each of the 8 scoring dimensions, calibrated against Australian startup benchmarks from the ABS, Startup Genome, and CB Insights data. The SVI scoring algorithm (v2.0) combines deterministic computation with AI-extracted signals across 30+ startup health indicators.

**Budget-aware cost management:**
Built-in AI cost tracking with a monthly budget cap, per-model cost estimation, and automatic provider rotation to optimise spend.

---

### Market Opportunity

| Metric | Value | Source |
|--------|-------|--------|
| **TAM** | $4.4 trillion global startup ecosystem | Startup Genome, 2024 |
| **SAM** | $3.2 billion cap table + valuation tools market | Grand View Research, 2025 |
| **SOM** | A$250K Year 1 (500 AU startups x A$500 avg) | Internal projection |
| Active AU startups | 2,600+ | Startup Genome |
| AU accelerators | 300+ | StartupAus |
| AU angel investors | 15,000+ | AAAI |
| AU startup ecosystem | A$15 billion in total funding (2024) | Startup Genome |

Australia's startup ecosystem has no unified platform covering the full lifecycle from idea to exit. Carta (US-focused, $8K+/year, no AI), Pulley (cap table only, no valuation), Equidam (valuation only, no cap table), and Gust (investor CRM, no real-time valuation) each address fragments of the problem. BlockID is the only platform that combines AI-powered scoring, valuation, cap table management, and blockchain equity -- with an Australian-first focus.

**Expansion path:** Australia -> New Zealand -> APAC -> Global

---

### Business Model

**Freemium SaaS with credit-based expansion:**

| Tier | Price | Features |
|------|-------|----------|
| **Free** | $0 | SVI score, basic tools (Idea Valuation, Equity Split, Dilution Calculator) |
| **Pro** | A$49/month | Full 10-page reports, Evidence Vault, weekly tracking, benchmarking |
| **Team** | A$149/month | Cap table management, multi-founder, board reporting |
| **Enterprise** | Custom | Accelerator/VC portfolio dashboards, API access |

**Revenue targets:**
- Year 1: A$250K ARR (500 startups x A$500 avg)
- Year 2: A$1M ARR
- Year 3: A$5M ARR

**Unit economics targets:**
- 10% free-to-paid conversion
- <5% monthly churn
- CAC < A$50
- LTV:CAC > 3:1

Revenue grows with the founder: free at the idea stage, paid as they validate, premium as they fundraise and scale.

---

### Traction

- **Live product** at [blockid.au](https://blockid.au) -- fully operational and serving users
- **Phase 1 (Idea & Analysis): COMPLETE** -- AI-powered SVI scoring engine generating 10-page reports in 60 seconds
- **Phase 2 (Validation & Evidence): IN PROGRESS** -- Evidence Vault with auto-rescore, OAuth connectors (GitHub, Analytics, Stripe), milestone badges, weekly reports
- **10 free tools deployed and functional:** Idea Valuation, Equity Split, Dilution Calculator, Cap Table Diff, Funding Plan, Data Room Checklist, Term Sheet Analyzer, Cofounder Match, R&D Tax Calculator, ESIC Eligibility Checker
- **Multi-model AI engine** with 4 provider fallback chain (Claude, OpenAI, Gemini, proxy) ensuring 99%+ AI availability
- **30+ SEO articles** published driving organic traffic
- **10 automated email** nurture sequences operational
- **Growth Intelligence dashboard** live with real-time analytics
- **Admin AI key management** system with dynamic provider configuration
- **Per-user Google Drive folders** for document storage
- **SVI scoring algorithm v2.0** with deterministic computation, evidence confidence levels, and stage-based benchmarking
- **6 C-level operational domains** defined with 48+ specialised AI skills deployed across the organisation

---

### Technology Stack

- **Frontend:** Next.js (React), TypeScript, Tailwind CSS
- **Backend:** Next.js API routes, Supabase (PostgreSQL + Auth)
- **AI:** Anthropic Claude (Haiku 4.5, Sonnet 4), OpenAI GPT-4o-mini, Google Gemini 2.0 Flash
- **Infrastructure:** Vercel deployment, Google Cloud (Drive API), Supabase hosted database
- **Future (Phase 5):** Cosmos SDK private blockchain, CosmWasm smart contracts, MetaMask wallet integration via Ethermint EVM module

---

### Roadmap

| Phase | Milestone | Timeline | Status |
|-------|-----------|----------|--------|
| 1 | Idea & AI Analysis (SVI, R&D reports, 10 tools) | Complete | **LIVE** |
| 2 | Validation & Evidence (Evidence Vault, auto-rescore, OAuth) | Q3 2026 | **In Progress** |
| 3 | Dollar Valuation Engine (multiples, comparables, DCF, benchmarking) | Q4 2026 | Planned |
| 4 | Full Cap Table Management (shares, options, vesting, ESOP) | Q1 2027 | Planned |
| 5 | Blockchain Equity Tokenization (Cosmos SDK private chain) | Q2-Q3 2027 | Planned |
| 6 | Investment & Fundraise (data room, fundraise wizard, investor CRM) | Q3-Q4 2027 | Planned |
| 7 | Revenue & Dividends (P&L dashboard, on-chain dividends, AU tax) | 2028 | Planned |
| 8 | Growth, Exit & Exchange (IPO modelling, secondary trading sim) | 2028+ | Planned |

---

### What You Need from the Program

BlockID.au has a live product and proven AI architecture. What we need from the Spacecubed AI Fellowship is ecosystem access and market feedback.

**1. Perth and Western Australian ecosystem connections:**
BlockID is Sydney-based but the Perth/WA startup ecosystem is underserved by existing tools. The Fellowship residency provides direct access to WA founders who are our target users, allowing us to test product-market fit in a market that is geographically isolated from the Sydney/Melbourne startup bubble.

**2. Peer-driven growth with 11 other AI-first startups:**
Building alongside other AI-first companies provides invaluable technical feedback on our multi-model architecture, prompt engineering approach, and AI cost optimisation. We expect to both learn from and contribute to the cohort's collective AI expertise.

**3. Workspace and compute access:**
Dedicated workspace during the 3-month residency enables focused product development on Phase 2 (Evidence Vault) and Phase 3 (Dollar Valuation Engine), which are our critical next milestones.

**4. Go-to-market refinement for the Australian market:**
Spacecubed's deep roots in the WA startup community provide feedback loops that are impossible to replicate remotely. Direct founder conversations during the residency will shape our pricing, onboarding, and feature prioritisation.

**5. Western Sydney expansion opportunity:**
The dual Perth/Western Sydney locations align with our goal to serve founders outside the traditional Sydney CBD and Melbourne startup corridors -- where the majority of new Australian businesses actually launch (437,150 new businesses in FY2024-25, ABS).

**6. Credibility and validation:**
Selection for the AI Fellowship signals to investors, partners, and potential customers that BlockID's AI-first approach has been vetted by a respected accelerator program.

---

### What We Bring to the Cohort

- **A live, production-grade AI product** that other cohort members can use to score and track their own startups
- **Deep multi-model AI architecture experience** -- practical knowledge of running Claude, OpenAI, and Gemini in production with automatic failover, budget management, and cost optimisation
- **SSE streaming and parallel AI batch processing** patterns that are applicable to any AI-first product
- **Australian startup data and benchmarks** compiled from ABS, Startup Genome, CB Insights, and industry sources
- **Free tools** that any startup in the cohort can immediately use (equity split, dilution calculator, cap table analysis, funding plan, data room checklist)

---

### Video Link

https://blockid.au/video-assets/pitch-3min.mp4

---

### Contact

**Do Van Long** -- Founder & CEO
Email: ceo@longcare.au
LinkedIn: [linkedin.com/in/dovanlong](https://linkedin.com/in/dovanlong)
Web: [blockid.au](https://blockid.au)
Company: Auschain Pty Ltd (ACN 659 615 111, ABN 79 659 615 111)
