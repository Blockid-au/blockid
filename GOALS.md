# BlockID — Startup Value Index (SVI) System Goals

## Vision
Build the most comprehensive, evidence-backed Startup Value Index system —
from raw idea to corporation. A founder enters once and the system tracks,
reminds, and scores their startup every week automatically.

---

## Goal 1: SVI Formula Research & Design

### Scope
Design a rigorous, multi-dimensional scoring formula that:
- Covers every startup stage: Idea → MVP → Revenue → Growth → Scale → Corporation
- Accepts evidence at every level: text/idea → docs → URLs → APIs → verified
- Auto-computes weekly delta (+/-) to show progress over time
- Is transparent, explainable, and gamifiable (founder can see exactly how to raise score)

### Startup Maturity Stages

| Stage | Label | Key signals |
|-------|-------|-------------|
| 0 | Raw Idea | Text description only |
| 1 | Validated Idea | Customer interviews, market research, problem documented |
| 2 | MVP / Prototype | Demo URL, GitHub repo, landing page, waitlist |
| 3 | Early Traction | Users, analytics (GA/Mixpanel), social following |
| 4 | Revenue | Paying customers, Stripe/invoice, MRR evidence |
| 5 | Growth | $100k+ ARR, team, cap table, SHA, board meetings |
| 6 | Scale | $1M+ ARR, investors, audit, data room, legal docs |
| 7 | Corporation | ASIC registered, audited financials, board, compliance complete |

### SVI Dimensions (8 core, expandable)

1. **Founder & Team Value (FTV)** — founder experience, team size, domain fit, advisors
2. **Market & Problem Clarity (MPC)** — TAM/SAM, problem validation, customer proof
3. **Product & Technical Depth (PTD)** — code quality, GitHub activity, demo, roadmap
4. **Traction & Revenue Evidence (TRE)** — users, analytics, MRR/ARR, customer proof
5. **Cap Table & Governance Health (CGH)** — equity split, vesting, SHA, board cadence
6. **Investor Readiness Index (IRI)** — pitch deck, data room, financial model, term sheet
7. **Legal & Compliance (LCO)** — ASIC registration, ABN, IP protection, contracts
8. **Strategic Vision & Moat (SVM)** — competitive moat, network effect, data advantage, defensibility

### Evidence Confidence Levels

| Level | Type | Multiplier | Examples |
|-------|------|-----------|---------|
| 0 | Self-declared | 0.20 | Text input, checkboxes |
| 1 | Public URL | 0.35 | Website, LinkedIn, App Store listing |
| 2 | Document uploaded | 0.50 | PDF pitch deck, financial model, cap table |
| 3 | Connected source | 0.75 | GitHub OAuth, GA API, Stripe API |
| 4 | Transaction verified | 0.90 | Stripe revenue, invoice with payment proof |
| 5 | Third-party verified | 1.00 | Audit, ASIC, board-signed, investor letter |

### SVI Formula Architecture

```
SVI_t = Base(100) + Σ(Dimension_i × Weight_i × ConfidenceMultiplier_i) - RiskPenalties
```

**Weights per dimension:**
- FTV: 15%
- MPC: 18%
- PTD: 12%
- TRE: 20%
- CGH: 12%
- IRI: 10%
- LCO: 8%
- SVM: 5%

**Weekly delta:**
```
ΔSVI_week = SVI_t - SVI_(t-7days)
```

### Risk Penalties
- AI wrapper without moat: -15
- No founder background: -8
- Undefined market: -10
- No cap table: -12
- Unverified claims only: -8
- Solo founder at growth stage: -5
- No legal documents: -10
- Vague problem: -8

---

## Goal 2: Evidence Engine Design

### Evidence Connectors (priority order)

**P0 — Must ship first:**
- Manual text input (idea description)
- Document upload (PDF, DOCX, XLSX)
- Public URL (website, LinkedIn, App Store, GitHub public)

**P1 — Ship next:**
- GitHub OAuth → commits, stars, contributors, languages
- Google Analytics API → sessions, users, sources
- Stripe → MRR, ARR, customer count, churn rate

**P2 — Ship later:**
- Xero / QuickBooks → P&L, cashflow
- App Store / Google Play → downloads, ratings
- LinkedIn API → founder profile, connections
- Search Console → organic traffic, keywords

**P3 — Enterprise:**
- ASIC API → company registration, directors
- Crunchbase API → funding history
- Custom webhook for any third-party data

### Evidence Vault Structure
```
Evidence Vault
├── Pitch Deck (PDF/PPTX)
├── Cap Table (XLSX/CSV)
├── Financial Model (XLSX)
├── Customer Contracts (PDF)
├── Shareholders Agreement (PDF)
├── Board Minutes (PDF)
├── Revenue Proof (CSV/Stripe export)
├── Website Analytics (CSV/API)
├── Source Code Link (GitHub URL)
├── Demo / Product URL
├── Market Research (PDF/DOCX)
└── Legal Documents (ABN, ASIC, IP)
```

---

## Goal 3: Weekly Tracking & Notification System

### Weekly SVI Report (auto-generated)
- Current SVI vs last week (+ or -)
- Top 3 wins this week (what moved the score up)
- Top 3 gaps to address next week
- Stage progression indicator (are they moving to next stage?)
- Milestone alerts ("You're 8 points away from Stage 4 — Revenue!")

### Reminder Logic
- Day 1: Welcome + SVI baseline + 30-day plan
- Day 7: First weekly report + "Add one evidence item"
- Day 14: Week 2 report + "Connect GitHub or analytics"
- Day 30: Monthly deep analysis + cap table check
- Day 90: Quarterly review + investor readiness check
- Triggered: "Your score dropped 5 points this week — here's why"

### Gamification
- Milestone badges (First Revenue, Cap Table Clean, Investor Ready, etc.)
- Stage progression celebration ("You've entered Stage 3 — Traction!")
- Leaderboard (anonymous percentile: "You're in top 20% of stage-2 AU startups")

---

## Goal 4: UI/UX Design System (Google-style)

### Core Principles
- **Minimal whitespace** — maximum 2 things per screen focus
- **One action per moment** — never overwhelm with choices
- **Progressive disclosure** — reveal complexity only when needed
- **Instant feedback** — every action has a visible SVI impact preview
- **Mobile-first** — 60% of founders check on phone

### Key Screens

**1. Entrance (done — Google-style)**
- Big centered input
- Voice + file options
- Quick examples
- Founding 50 strip

**2. SVI Dashboard (new)**
- SVI gauge (large, prominent)
- Week-over-week delta badge
- 8 dimension bars
- Evidence gaps list
- "Add Evidence" CTA
- Weekly milestone progress ring

**3. Evidence Submission Flow**
- Step 1: Choose evidence type (visual tiles)
- Step 2: Upload/connect
- Step 3: See instant SVI impact preview
- Step 4: Confirm → SVI updates live

**4. Stage Journey**
- Visual timeline: Stage 0 → 7
- Current stage highlighted
- Next milestone markers
- "What to do this week" card

**5. Weekly Report**
- Email + in-app
- Delta score (large +/-)
- 3 wins + 3 gaps
- One-click actions

**6. Investor Share Page**
- Clean public SVI profile
- Evidence summary (no sensitive data)
- Request for specific evidence
- "Verify this startup" CTA for investors

---

## Goal 5: Technical Architecture

### Stack (extend existing Next.js project)
- **Frontend:** Next.js 14 + Tailwind v4 + Lucide icons (existing)
- **Backend:** API routes (existing pattern)
- **Database:** Supabase (existing) — new tables for SVI v2
- **Auth:** Google OAuth (existing)
- **AI:** Anthropic Claude API — text parsing + evidence analysis
- **Jobs:** Supabase Edge Functions or Vercel Cron for weekly reports
- **Email:** Resend (existing) — weekly digest

### New Database Tables
```sql
svi_accounts         -- founder account with stage, SVI history
svi_snapshots        -- weekly SVI captures (for delta calculation)
svi_evidence         -- each piece of evidence with confidence level
svi_connectors       -- OAuth tokens for GitHub/GA/Stripe
svi_notifications    -- reminder and report log
svi_milestones       -- achieved badges and stage transitions
```

### API Routes to Build
```
POST /api/svi/analyze          -- analyze text/file input (exists, extend)
POST /api/svi/evidence/add     -- add evidence item + recompute SVI
POST /api/svi/connect/github   -- GitHub OAuth callback
POST /api/svi/connect/stripe   -- Stripe OAuth callback
GET  /api/svi/dashboard        -- fetch current SVI + history
GET  /api/svi/weekly-report    -- generate weekly delta report
POST /api/svi/account/create   -- create SVI account (post Founding 50)
```

---

## Implementation Priority

### Phase 1 (This sprint — core UX)
- [x] Google-style entrance with text/voice/file
- [x] SVI analysis (deterministic, 6 dimensions)
- [x] SVI results panel with evidence gaps + next actions
- [x] Founding 50 page + lead capture
- [ ] **SVI Dashboard** — logged-in view with full 8-dimension breakdown
- [ ] **Evidence submission flow** — upload + see SVI impact
- [ ] **Stage journey timeline** — visual stage progression

### Phase 2 (Evidence Engine)
- [ ] GitHub connector (OAuth)
- [ ] Google Analytics connector
- [ ] Stripe connector
- [ ] Manual document upload with extraction
- [ ] Evidence Vault UI

### Phase 3 (Tracking)
- [ ] Weekly snapshot cron job
- [ ] Delta calculation and display
- [ ] Email weekly report (Resend)
- [ ] In-app notification center
- [ ] Milestone badges system

### Phase 4 (Scale)
- [ ] Investor share page
- [ ] Anonymous benchmarks
- [ ] Accelerator/partner portal
- [ ] ASIC / legal connectors
