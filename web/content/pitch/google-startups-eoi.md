# Google for Startups Accelerator: Australia -- Expression of Interest

## Program: Google for Startups Accelerator (Australia / AI First track)
## Status: Applications currently closed -- registering interest for next cohort
## Expected Timeline: Previous cohorts ran September-November; next 2026 dates TBA
## Applicant: Auschain Pty Ltd (BlockID.au)

---

### Company Information

| Field | Detail |
|-------|--------|
| **Company name** | BlockID.au (operated by Auschain Pty Ltd) |
| **ACN** | 659 615 111 |
| **ABN** | 79 659 615 111 |
| **Location** | Sydney, NSW, Australia |
| **Website** | [blockid.au](https://blockid.au) |
| **Stage** | Seed (live product, pre-revenue, Phase 2 in progress) |
| **Team size** | 1 founder (AI-augmented operations across 6 domains) |

---

### Founder

**Do Van Long** -- Founder & CEO
Email: ceo@longcare.au
LinkedIn: [linkedin.com/in/dovanlong](https://linkedin.com/in/dovanlong)

Full-stack technical founder who single-handedly architected, built, and shipped BlockID.au from concept to live production product. Serves as both CEO and CTO with deep expertise in AI integration, full-stack development (TypeScript, React, Next.js), and infrastructure.

---

### One-line Description

AI-powered startup valuation platform that helps founders measure, prove, and grow their business value from Day 0 to exit.

---

### Company Overview

BlockID.au is an AI/ML-driven platform that gives founders instant intelligence about their startup's value. In 60 seconds, our AI engine generates a comprehensive 10-page Startup Value Index (SVI) report scoring startups across 8 dimensions: Team, Market, Product, Traction, Cap Table, Investor Readiness, Legal, and Moat.

The platform replaces manual valuation (A$5,000-$50,000, 2-6 weeks) with AI-powered analysis that is instant, affordable, and repeatable. Founded on the insight that 90% of startups fail (Failory 2026) and 60% of Australian startups die within 3 years (ABS June 2025), BlockID provides the data infrastructure that founders need to survive.

**Product status:** Live at [blockid.au](https://blockid.au) with Phase 1 complete and Phase 2 in progress.

---

### How AI/ML is Central to Your Product

AI is the core of BlockID, not a feature layer. Every primary function is powered by machine learning and language models.

**1. Multi-model AI inference engine:**
Our unified AI client orchestrates 4 providers in priority chain: Anthropic Claude (Haiku 4.5, Sonnet 4), OpenAI GPT-4o-mini, Google Gemini 2.0 Flash, and proxy fallback. Automatic failover ensures 99%+ AI availability. If Claude is rate-limited, the system silently falls through to OpenAI, then Gemini -- with zero user disruption. Provider configuration is admin-managed via database with 5-minute caching.

**2. Parallel AI batch processing for report generation:**
The 10-page R&D report runs 3 concurrent AI batches via `Promise.all()`:
- Batch A: Executive summary, market analysis, product evaluation (Pages 1-3)
- Batch B: Business model, competition, traction, team assessment (Pages 4-7)
- Batch C: Financial projections, risk analysis, strategic recommendations (Pages 8-10)
This parallel architecture delivers comprehensive reports in ~60 seconds instead of 3+ minutes.

**3. SSE (Server-Sent Events) streaming:**
Real-time event streaming to the frontend as each AI batch completes, providing users with live progress updates during the 60-second generation process.

**4. AI-powered signal extraction (SVI v2.0):**
The Startup Value Index scoring algorithm extracts 30+ health signals from founder input and uploaded evidence. Signals span founding team composition, market sizing, product maturity, revenue bands, cap table governance, and competitive moat. Each signal is weighted by evidence confidence level (self-declared 20% -> third-party verified 100%).

**5. URL scraping + AI competitive intelligence:**
When founders provide a website URL, BlockID scrapes the page, extracts technical hints and business signals, and feeds them into the AI analysis pipeline for automated competitor and market intelligence.

**6. AI-generated periodic reports:**
Automated weekly email reports use AI to summarise startup progress, identify trends, and recommend next actions based on accumulated evidence in the Evidence Vault.

**7. Budget-aware AI cost management:**
Built-in monthly budget cap ($100/mo), per-model cost estimation (Claude Haiku $0.001/1K tokens, Sonnet $0.015/1K, GPT-4o-mini $0.0003/1K, Gemini $0.0001/1K), and automatic provider rotation to optimise cost-per-analysis.

---

### Technical Challenges Where Google Could Help

**1. AI model fine-tuning and optimisation:**
Our 8-dimension scoring prompts are currently zero-shot. Fine-tuning on Australian startup data (ABS, Startup Genome benchmarks) would improve scoring accuracy. Google's Vertex AI and Cloud TPU access would enable us to train custom models calibrated to the AU market.

**2. Scaling multi-model inference:**
As we grow beyond 1,000 analyses per month, managing multi-model inference cost-effectively becomes critical. Google Cloud's AI infrastructure (Vertex AI, Cloud Run for serverless inference) and early access to new Gemini models would help us optimise latency and cost.

**3. Document understanding for Evidence Vault:**
Phase 2's Evidence Vault needs to extract structured data from uploaded documents (pitch decks, financials, cap tables, legal agreements). Google's Document AI and Vision API would dramatically improve our extraction accuracy versus custom parsing.

**4. Advanced RAG (Retrieval-Augmented Generation):**
Phase 3's dollar valuation engine requires benchmarking against comparable startups. Building a RAG pipeline over Australian startup data (2,600+ active companies) using Vertex AI Search and Embeddings would provide more accurate, grounded valuations.

**5. Real-time analytics and ML pipeline:**
Our Growth Intelligence dashboard needs to evolve from descriptive to predictive analytics. BigQuery ML and Vertex AI Pipelines would enable us to build churn prediction, conversion optimisation, and SVI score trajectory models.

**6. Gemini integration depth:**
We already use Gemini 2.0 Flash as our free-tier fallback. Deeper integration with Gemini's multimodal capabilities (analysing pitch deck images, demo videos, product screenshots) would unlock new evidence types for the SVI scoring algorithm.

---

### Traction and Milestones

| Milestone | Status |
|-----------|--------|
| Live product at blockid.au | Operational |
| Phase 1: AI-powered SVI scoring engine (10-page reports in 60 seconds) | COMPLETE |
| Phase 2: Evidence Vault, auto-rescore, OAuth connectors | IN PROGRESS (Q3 2026) |
| 10 free tools deployed (Idea Valuation, Equity Split, Dilution, Cap Table Diff, Funding Plan, Data Room, Term Sheet, Cofounder Match, R&D Tax, ESIC) | COMPLETE |
| Multi-model AI engine with 4 provider failover | COMPLETE |
| 30+ SEO articles published | COMPLETE |
| 10 automated email nurture sequences | COMPLETE |
| Growth Intelligence dashboard | COMPLETE |
| Admin AI key management (database-driven) | COMPLETE |
| SVI scoring algorithm v2.0 (deterministic + AI signals) | COMPLETE |
| 48+ operational skills across 6 C-level domains | COMPLETE |

---

### Market Opportunity

| Metric | Value | Source |
|--------|-------|--------|
| **TAM** | $4.4T global startup ecosystem | Startup Genome, 2024 |
| **SAM** | $3.2B cap table + valuation tools | Grand View Research, 2025 |
| **SOM** | A$250K Year 1 | 500 AU startups x A$500 avg |
| Active AU startups | 2,600+ | Startup Genome |
| AU accelerators | 300+ | StartupAus |
| AU angel investors | 15,000+ | AAAI |

Australia's A$15 billion startup ecosystem has no unified, AI-powered platform covering the full lifecycle from idea to exit. BlockID fills this gap.

---

### Business Model

| Tier | Price | Features |
|------|-------|----------|
| **Free** | $0 | SVI score, basic tools |
| **Pro** | A$49/month | Full reports, Evidence Vault, weekly tracking |
| **Team** | A$149/month | Cap table, multi-founder, board reporting |
| **Enterprise** | Custom | Accelerator/VC dashboards, API access |

Year 1 target: A$250K ARR. Year 3 target: A$5M ARR.

---

### Competitive Landscape

| Feature | BlockID | Carta | Pulley | Equidam | Gust |
|---------|---------|-------|--------|---------|------|
| AI Scoring | Yes | No | No | No | No |
| Dollar Valuation | Phase 3 | No | No | Yes | No |
| Cap Table | Phase 4 | Yes | Yes | No | No |
| Evidence Tracking | Yes | No | No | No | No |
| Australian Focus | Yes | No | No | No | No |
| Free Tier | Yes | No | No | Limited | No |
| Blockchain Equity | Phase 5 | No | No | No | No |
| Full Lifecycle | Yes | No | No | No | No |

No existing platform combines AI-powered scoring, valuation, cap table management, and blockchain equity with an Australian-first focus.

---

### Roadmap

| Phase | Milestone | Timeline | Status |
|-------|-----------|----------|--------|
| 1 | Idea & AI Analysis | Complete | LIVE |
| 2 | Validation & Evidence | Q3 2026 | In Progress |
| 3 | Dollar Valuation Engine | Q4 2026 | Planned |
| 4 | Full Cap Table Management | Q1 2027 | Planned |
| 5 | Blockchain Equity Tokenization (Cosmos) | Q2-Q3 2027 | Planned |
| 6 | Investment & Fundraise Tools | Q3-Q4 2027 | Planned |
| 7 | Revenue & Dividends | 2028 | Planned |
| 8 | Growth, Exit & Exchange | 2028+ | Planned |

---

### Why Google for Startups?

**1. Equity-free programme:**
Google for Startups takes no equity. This is ideal for BlockID at the pre-revenue stage -- we get world-class mentorship and technical support without dilution, preserving our cap table for future fundraising rounds.

**2. Google Cloud infrastructure:**
BlockID's AI inference costs will scale linearly with user growth. Google Cloud credits, TPU access for ML research, and Vertex AI would directly reduce our cost per analysis while enabling us to build more sophisticated models.

**3. Early access to Google AI products:**
Access to Trusted Tester and Early Access Programs for new Google AI products would give BlockID a technical edge. Early Gemini 2.0 integration is already part of our fallback chain; deeper access would unlock multimodal analysis capabilities.

**4. Technical mentorship from Google engineers:**
1-to-1 sessions with Google's AI/ML teams on model optimisation, inference scaling, and document understanding would accelerate our Phase 2-3 development timeline.

**5. Demo Day exposure:**
Pitching to investors and Alphabet leaders at Demo Day would be transformative for our fundraising. The Google for Startups brand provides credibility that opens doors with both customers and investors.

**6. AI First track alignment:**
BlockID is an AI-first company by design. Our entire value proposition is built on AI/ML -- from multi-model inference to signal extraction to automated report generation. The AI First track is a natural fit.

---

### Program Eligibility Checklist

| Requirement | BlockID Status |
|-------------|---------------|
| Australian-based startup | Yes -- Sydney, NSW (Auschain Pty Ltd, ACN 659 615 111) |
| Building AI/ML-driven platform | Yes -- multi-model AI engine is the core product |
| Seed to Series A maturity | Yes -- live product, Phase 1 complete, Phase 2 in progress |
| Demonstrating meaningful traction | Yes -- live product, 10 tools, 30+ articles, AI engine operational |
| CTO/technical leadership can commit to full program | Yes -- founder serves as both CEO and CTO |
| Not a non-profit or government agency | Correct -- Auschain Pty Ltd is a private company |
| No existing Google employees | Correct |

---

### Prepared Materials

The following materials are ready for submission when applications open:

- **Live product demo:** [blockid.au](https://blockid.au)
- **3-minute pitch video:** [blockid.au/video-assets/pitch-3min.mp4](https://blockid.au/video-assets/pitch-3min.mp4)
- **Executive summary:** Available on request
- **Pitch deck (v1):** Available on request
- **Technical architecture document:** Available on request

---

### Next Steps

1. Register interest at [startup.google.com/programs/accelerator/australia](https://startup.google.com/programs/accelerator/australia/)
2. Also register for AI First track at [startup.google.com/programs/accelerator/ai-first/australia](https://startup.google.com/programs/accelerator/ai-first/australia/)
3. Monitor for application opening (expected mid-2026 based on prior September-November cohort timelines)
4. Prepare 90-second video pitch tailored to Google's AI focus
5. Document specific Gemini/Vertex AI integration plans for the technical deep-dive

---

### Contact

**Do Van Long** -- Founder & CEO
Email: ceo@longcare.au
LinkedIn: [linkedin.com/in/dovanlong](https://linkedin.com/in/dovanlong)
Web: [blockid.au](https://blockid.au)
Company: Auschain Pty Ltd (ACN 659 615 111, ABN 79 659 615 111)
