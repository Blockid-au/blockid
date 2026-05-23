# Idea-Stage Startup Action System — From Idea to MVP in 90 Days

## Mission
Every startup idea submitted to BlockID.au receives a PRACTICAL, stage-appropriate action plan that a founder can start executing TODAY. No generic advice. No "prove revenue first." Real steps from zero to MVP.

## Core Problem
Current reports assume startups have revenue, team, product. But 70%+ of BlockID users submit IDEAS — they have:
- No revenue, no customers, no product
- No technical co-founder (many are solo non-technical founders)
- No funding, no legal entity
- Just an idea and passion

The report MUST meet them where they are and guide them step-by-step.

## Stage-Aware Action Framework

### Stage 0: Raw Idea (SVI 0-40)
**User has**: An idea in their head or on paper
**Report tone**: "Your idea has potential — here's exactly how to validate it this week"

**Action Plan Template:**
```
Week 1-2: VALIDATE THE PROBLEM
  □ Talk to 5 potential customers (Mom Test script provided)
  □ Find 3 online communities where your target users hang out
  □ Create a 1-page problem statement (template link)
  □ Research 5 existing solutions (AI agent auto-searches)

Week 3-4: DESIGN THE SOLUTION  
  □ Sketch the customer journey (simple flowchart template)
  □ Create a 1-page value proposition canvas
  □ Build a simple landing page (Carrd/Framer, 2 hours)
  □ Set up a waitlist (Tally form, free)

Month 2: BUILD THE MVP
  □ Choose tech stack (AI recommends based on idea type)
  □ Design 3-5 screen mockups (Figma, free)
  □ Build MVP (no-code: Bubble/Webflow OR code: Next.js template)
  □ Deploy to production (Vercel/Railway, free tier)

Month 3: FIRST USERS
  □ Get 10 beta users from your community research
  □ Conduct 5 user interviews with Mom Test
  □ Iterate based on feedback (3 sprint cycles)
  □ Launch on Product Hunt / Hacker News
```

### Stage 1: Validated Idea (SVI 40-70)
**User has**: Problem validated, maybe a landing page
**Action Plan Template:**
```
Week 1-2: CUSTOMER DISCOVERY DEEP DIVE
  □ 10 more customer interviews (pattern matching)
  □ Create user personas (2-3 distinct types)
  □ Map the customer journey (touchpoints, pain points)
  □ Define success metrics for MVP

Week 3-4: PRODUCT DESIGN
  □ User flow diagrams (Miro/FigJam, free)
  □ Wireframes for core screens (Figma)
  □ Define minimum viable feature set (cut ruthlessly)
  □ Technical architecture decision (AI recommends)

Month 2: BUILD & SHIP
  □ Sprint 1: Core feature (login + main action)
  □ Sprint 2: User onboarding + key workflow
  □ Sprint 3: Payment integration (Stripe, if needed)
  □ Deploy + monitoring (basic analytics)

Month 3: TRACTION
  □ Onboard 50 users manually (concierge MVP)
  □ Track activation rate (target: 40%+)
  □ Run first paid experiment (A$50 Google Ads)
  □ Apply to 2 accelerators (Antler, Startmate)
```

### Stage 2: MVP (SVI 70-110)
**User has**: Working product, few users
**Focus**: Product-market fit signals

### Stage 3+: Traction (SVI 110+)
**User has**: Users, maybe revenue
**Focus**: Growth, fundraising, scaling

## Report Content Adaptation by Stage

### For Idea/Pre-Revenue (Stage 0-2):

**Page 1 (Executive Summary)**: 
- "Your idea targets a [size] market. Here's your 90-day roadmap to MVP."
- Score breakdown: what's strong (idea clarity, market size) vs what's missing (validation, product, traction)
- Top 3 actions to start THIS WEEK

**Page 2 (Market)**: 
- NOT "what's your TAM" → "Here are 5 communities where your customers already hang out"
- Competitor landscape with FREE tools to monitor them
- Market timing signals (why now, not later)

**Page 3 (Product)**:
- NOT "what's your tech stack" → "Here's exactly how to build your MVP in 30 days"
- Recommended tech stack based on idea type
- No-code options for non-technical founders
- AI tools that can accelerate development

**Page 4 (Business Model)**:
- NOT "show me your unit economics" → "Here are 3 revenue models that work for [your type]"
- Pricing strategy examples from similar startups
- How to charge your first customer

**Page 5 (Competition)**:
- Named competitors with their pricing and weaknesses
- Your unfair advantage (even if it's just "they haven't thought of this angle")
- Feature comparison: what to build first vs what competitors lack

**Page 6 (Traction)**:
- NOT "show me your MRR" → "Here's how to get your first 10 users this month"
- Mom Test interview script (customized for their idea)
- Community-based growth tactics (free)
- First marketing channels to test

**Page 7 (Team)**:
- NOT "who's on your team" → "Here's the founding team you need to build"
- Solo founder? → advisor network strategy
- Technical co-founder matching resources
- First hire recommendation

**Page 8 (Financial)**:
- NOT "show me projections" → "Here's your first 12-month budget"
- Bootstrap vs fundraise decision framework
- Grants available (ESIC, R&D Tax Incentive, state grants)
- Free tools budget (A$0 startup stack)

**Page 9 (Risk)**:
- Real risks framed as "things to watch out for" not "reasons to fail"
- Pivot triggers: when to change direction
- Common mistakes at this stage

**Page 10 (Recommendations)**:
- Week-by-week action plan (not month-by-month)
- Specific tools with links
- Templates to download
- "Come back in 30 days and re-analyze to see your progress"

## Technical Implementation

### 1. Stage-Aware System Prompt (CTO)
- [x] Detect stage from SVI score (stageMatch in runBatch) in `rnd-analysis.ts`
- [x] Switch prompt template (stageGuidance + ideaOverrides for stage 0-2 vs 3-4 vs 5+) (0-2 vs 3+ vs 5+)
- [x] Idea-stage prompt: Mom Test, no-code MVP, free tools, first 10 users plan, MVP, first users, free tools
- [x] Revenue-stage prompt: growth tactics, unit economics, fundraise prep, fundraising, unit economics

### 2. Action Plan Component (CPO/CTO)
- [x] ActionPlanChecklist component (action-plan-checklist.tsx) with checkboxes
- [x] Persistent state: localStorage per slug completed actions
- [x] Progress indicator: X/Y completed + progress bar + SVI boost estimate: "3/12 actions completed → SVI could increase by +15"
- [ ] Weekly email reminder with next unchecked action

### 3. Customer Journey Templates (CPO)
- [ ] Visual flowchart component for customer journey
- [ ] Pre-built templates by industry (SaaS, marketplace, services, etc.)
- [ ] Editable by user → saved to profile → visible in report

### 4. Mom Test Script Generator (R&D Agent)
- [x] AI generates Mom Test interview script (5 questions customized to idea) based on idea
- [ ] 10 questions, ranked by priority
- [ ] Follow-up question suggestions
- [ ] Response recording template

### 5. Tech Stack Recommender (CTO)
- [ ] Based on idea type → recommend tech stack
- [ ] Non-technical founder? → no-code first
- [ ] Technical founder? → specific framework + deployment guide
- [ ] AI tools list for each stack

### 6. Free Tools Directory (CMO)
- [ ] Curated list of free tools per category
- [ ] Landing page builders, design tools, analytics, payments
- [ ] AU-specific: ABN registration, ASIC, bank accounts

### 7. UI/UX for Idea-Stage Users (CPO)
- [ ] Progress bar: "Your startup journey: Idea → Validate → Build → Launch → Grow"
- [ ] Each step expandable with sub-tasks
- [ ] Gamification: badges for completing milestones
- [ ] "Share your progress" social feature

## C-Level Assignments

### CTO — Prompt Engineering + Components
- [ ] Create stage-aware prompt templates in `rnd-analysis.ts`
- [ ] Build `ActionPlanChecklist` component
- [ ] Implement progress tracking (Supabase table: `action_plan_progress`)
- [ ] Tech stack recommender API

### CPO — User Experience
- [ ] Design action plan UI (checklist, progress bar, journey map)
- [ ] Create customer journey template library
- [ ] Design "Your Startup Journey" progress visualization
- [ ] Mobile-first action plan experience

### CMO — Content + Templates
- [ ] Curate free tools directory (50+ tools)
- [ ] Create Mom Test question bank (20 templates by industry)
- [ ] Write "First 30 Days" guide for each startup type
- [ ] SEO content: "How to validate your startup idea in Australia"

### CRO — Conversion
- [ ] Track: action completion → credit purchase correlation
- [ ] Design upsell: "Deep dive into Market Analysis — A$0.50"
- [ ] A/B test: detailed action plan → higher return rate?

### R&D Agent — AI Analysis
- [ ] Auto-detect if input is idea vs established startup
- [ ] Generate customized Mom Test script
- [ ] Research competitors automatically (web search)
- [ ] Suggest similar successful startups as inspiration

## Acceptance Criteria
1. Idea-stage report (SVI 0-40) has NO references to "show revenue" or "prove traction"
2. Every action plan step is specific, doable in 1-7 days, and free/cheap
3. Action plan checklist persists across sessions
4. Re-analyzing after 30 days shows SVI improvement from completed actions
5. Non-technical founders get no-code-first recommendations
6. Each report page starts with what the founder CAN do, not what they lack