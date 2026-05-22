# NVIDIA Academic Grant Program — Application Document

## BlockID.au: AI-Powered Startup Valuation Platform
**Applicant:** Do Van Long | **Organization:** Auschain PTY LTD | **Date:** May 2026

---

# PART 1: PROJECT PROPOSAL

## 1. Project Title
**Agentic AI for Automated Startup Valuation: A Multi-Model NLP Approach to Evidence-Based Business Scoring**

## 2. Project Summary
This project develops an AI-powered startup valuation engine that uses multi-model NLP (Claude, GPT-4o, Gemini) to extract business signals from unstructured founder descriptions and produce evidence-backed scores across 8 dimensions. The system — deployed as BlockID.au — serves Australian founders from idea stage to investor readiness, generating personalised reports with actionable growth plans.

## 3. Research Problem
90% of startups fail globally (ABS, 2025). In Australia, 370,500 businesses closed in FY2024-25 while 437,150 started. The fundamental gap: founders lack affordable, structured tools to measure business value, track progress, and prepare for investment.

Traditional valuations cost A$5,000-$50,000 and take weeks. AI can reduce this to 60 seconds at near-zero marginal cost — but requires sophisticated NLP to extract meaningful signals from diverse, unstructured startup descriptions.

## 4. Technical Approach

### 4.1 Multi-Model NLP Pipeline
Our system uses a cascading AI architecture with automatic failover:
- **Primary:** Anthropic Claude Sonnet/Haiku for deep text analysis
- **Secondary:** OpenAI GPT-4o-mini for fallback
- **Tertiary:** Google Gemini 2.0 Flash for cost-effective generation

The pipeline processes unstructured text to extract 50+ business signals across 8 dimensions:
1. **FTV** — Founder & Team Value (15% weight)
2. **MPC** — Market & Problem Clarity (18% weight)
3. **PTD** — Product & Technical Depth (12% weight)
4. **TRE** — Traction & Revenue Evidence (20% weight)
5. **CGH** — Cap Table & Governance Health (12% weight)
6. **IRI** — Investor Readiness Index (10% weight)
7. **LCO** — Legal & Compliance (8% weight)
8. **SVM** — Strategic Vision & Moat (5% weight)

### 4.2 Evidence-Based Scoring
The Startup Value Index (SVI) starts at a baseline of 100 and adjusts based on:
- Weighted dimension scores (0-100 per dimension)
- Evidence confidence multiplier (self-declared → verified sources)
- Risk penalties (structural risks like single founder, no IP, etc.)
- Stage bonuses (idea through investor-ready)

### 4.3 Agentic AI Architecture
The platform operates 15 specialized AI agents (CTO, CMO, CFO, CPO, etc.) managed through Claude Code, each handling different aspects: analysis, report generation, competitive research (with web search), content creation, and pitch deck generation.

### 4.4 NVIDIA Technology Integration Plan
- **Phase 1:** Deploy fine-tuned Llama 3 models on NVIDIA GPUs for faster, private SVI inference
- **Phase 2:** Use NVIDIA TensorRT to optimise signal extraction for sub-second batch processing
- **Phase 3:** Implement NVIDIA Riva for voice-to-SVI input (founders describe ideas verbally)
- **Phase 4:** Leverage NVIDIA NeMo for domain-specific fine-tuning on Australian startup data

## 5. Current Results
- **Platform:** Live at https://blockid.au with production users
- **Analyses:** 39 SVI analyses completed, $5.5M+ valuations tracked
- **Users:** 8 active founders, 5 paying customers
- **Tools:** 10 free startup tools (equity, dilution, cap table, term sheet AI)
- **Content:** 31 auto-generated SEO articles with 90 inline SVG infographics
- **Reports:** 11-page personalised PDF reports with progressive action plans

## 6. Expected Outcomes
- Reduce average startup analysis time from weeks to 60 seconds
- Achieve 85%+ correlation between AI-generated SVI and professional valuations
- Process 1,000+ analyses/month with NVIDIA GPU-accelerated inference
- Publish research paper on multi-model NLP for startup valuation
- Create open benchmark dataset for Australian startup signals

## 7. Timeline
| Phase | Duration | Deliverable |
|-------|----------|-------------|
| Phase 1 | Months 1-3 | Llama fine-tuning on NVIDIA GPUs |
| Phase 2 | Months 3-6 | TensorRT optimisation, batch inference |
| Phase 3 | Months 6-9 | Riva voice integration, NeMo training |
| Phase 4 | Months 9-12 | Research paper, benchmark dataset |

## 8. Budget & Resources Needed
- NVIDIA GPU access (A100/H100) for model fine-tuning
- NVIDIA DGX Cloud credits for training experiments
- TensorRT and Triton Inference Server licenses
- Technical mentorship from NVIDIA research team

---

# PART 2: CURRICULUM VITAE

## Do Van Long
**CEO & Founder | Auschain PTY LTD | BlockID.au**
Sydney, NSW, Australia | ceo@longcare.au | linkedin.com/in/dovanlong

### Professional Summary
Technology entrepreneur with 20+ years of executive experience in AI, blockchain, and enterprise software. Founder of Vietnam Blockchain Corporation (2016) — Vietnam's first certified Science & Technology Enterprise in blockchain. Currently building BlockID.au, an AI-powered startup valuation platform. Australian Global Talent Visa holder.

### Education
| Degree | Institution | Year |
|--------|------------|------|
| **Doctor of Business Administration (DBA)** Candidate | Swiss School of Business and Management (SSBM) | 2023-2025 |
| **Research:** IoT-HCM Grid on VINAREN Network | University of Hawaii (publication) | 2008 |

### Current Ventures

**CEO & Founder — Auschain PTY LTD** (2023-Present)
Sydney, Australia | ACN 659 615 111
- Founded BlockID.au — agentic AI valuation platform for Australian startups
- Architected multi-model NLP pipeline (Claude + GPT-4o + Gemini) with automatic failover
- Built complete platform solo with 15 AI agents as engineering team
- 39 analyses completed, $5.5M+ valuations tracked, 5 paying customers
- 10 free tools, 31 auto-generated articles, 3 pitch videos produced

**Founder & CEO — Vietnam Blockchain Corporation (VBC)** (2016-Present)
Ho Chi Minh City, Vietnam
- Vietnam's first certified Science & Technology Enterprise in blockchain (2019)
- 50+ blockchain projects delivered, 180+ partners and customers
- Built: Agridential.vn (agri-traceability), SmartBallot.io (voting), Covidpass.vn (health records)
- Blockchain-as-a-Service (BaaS) platform serving enterprise clients
- ISO 9001:2015 certified blockchain solutions

### Technical Expertise
- **AI/ML:** NLP, multi-model orchestration, prompt engineering, agentic AI systems
- **Blockchain:** Cosmos SDK, CosmWasm, smart contracts, tokenization, DeFi
- **Full-stack:** Next.js, TypeScript, React, Node.js, PostgreSQL, Docker
- **Cloud:** GCP, AWS, GitLab CI/CD, Supabase, Vercel
- **Languages:** Python, JavaScript/TypeScript, Go, Solidity

### Awards & Recognition
- **I-Star 2022** — Top 10 Individuals Supporting Startup Activities (Innovation & Entrepreneurship Award, Vietnam)
- **AusTalent Member** — Community of highly skilled professionals invited to Australia through Global Talent Visa Program
- **GBA APAC Member** — Government Blockchain Association, Asia-Pacific chapter

### Publications
- "IoIT-HCM Grid on VINAREN Network & Research for Bioscience Applications" — University of Hawaii, 2008
- 31 AI-generated research articles on startup valuation methodology — BlockID.au Insights, 2026

### Speaking & Industry
- Speaker on blockchain as trusted internet infrastructure (multiple conferences)
- Vietnamese Business Forum in Australia — invited participant
- Blockchain solutions for Australia-Vietnam export supply chains
- APAC Entrepreneur — featured profile on visionary leadership

### Products Built
| Product | Technology | Users |
|---------|-----------|-------|
| **BlockID.au** | AI/NLP, Next.js, Multi-model AI | 8 founders, 39 analyses |
| **Agridential.vn** | Blockchain traceability | Agricultural supply chains |
| **SmartBallot.io** | Blockchain voting | Electoral systems |
| **Covidpass.vn** | Blockchain health records | COVID-19 management |
| **VBchain** | Enterprise blockchain | 180+ partners |
| **Auschain Certify** | Product provenance | AU-VN trade verification |

### Community
- AusTalent — Vietnamese entrepreneurs in Australia (Global Talent Visa holders)
- Government Blockchain Association — APAC chapter
- Sydney startup ecosystem — Fishburners, Stone & Chalk network

---

**Contact:** ceo@longcare.au | https://blockid.au | linkedin.com/in/dovanlong
**Company:** Auschain PTY LTD | ACN 659 615 111 | ABN 79 659 615 111 | Sydney, NSW, Australia
