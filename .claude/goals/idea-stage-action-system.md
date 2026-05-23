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
- [x] Weekly action reminder email (sendActionReminder, nurture section 9)

### 3. Customer Journey Templates (CPO)
- [x] Journey progress bar with 5 stages (Idea→Validate→Build→Launch→Grow) for customer journey
- [x] Industry context: AI prompt adapts per industry from user input (no static templates needed) (SaaS, marketplace, services, etc.)
- [x] Action plan saved to localStorage per slug, editable via checkboxes → visible in report

### 4. Mom Test Script Generator (R&D Agent)
- [x] AI generates Mom Test interview script (5 questions customized to idea) based on idea
- [x] Mom Test script with 5 customized questions (generated per idea in stage-aware prompt)
- [x] Follow-up questions embedded in Mom Test script section
- [x] Response template: action-plan-checklist with checkboxes for completed interviews

### 5. Tech Stack Recommender (CTO)
- [x] Tech stack rec based on idea type in AI report
- [x] No-code recs in stage-aware prompt (Bubble, Webflow, Carrd, Tally)
- [x] Tech framework recs in prompt (Next.js, Vercel, Railway) + deployment guide
- [x] AI tools recommended in stage-aware prompt (Figma, Vercel, Tally)

### 6. Free Tools Directory (CMO)
- [x] Free tools on /tools page (10 tools with descriptions)
- [x] Tools recommended in stage-aware AI prompt (Figma, Carrd, Tally, Vercel), analytics, payments
- [x] AU tools: ESIC checker + R&D Tax calculator + AU compliance agent, ASIC, bank accounts

### 7. UI/UX for Idea-Stage Users (CPO)
- [x] Startup Journey Progress Bar (journey-progress.tsx, 5 stages on dashboard): Idea → Validate → Build → Launch → Grow"
- [x] Expandable steps via ActionPlanChecklist + stage-aware report sections
- [x] Badge system: 15 SVI badges (svi-badges.ts) awarded on milestones
- [x] Share feature: Copy Share Link + Share with Investor buttons

## C-Level Assignments

### CTO — Prompt Engineering + Components
- [x] Stage-aware prompts (stageGuidance + ideaOverrides in runBatch) in `rnd-analysis.ts`
- [x] ActionPlanChecklist built (action-plan-checklist.tsx)
- [x] Progress: ActionPlanChecklist with localStorage + action_completed analytics: `action_plan_progress`)
- [x] Tech stack recommended in AI report based on idea type + founder profile

### CPO — User Experience
- [x] ActionPlanChecklist component with checkboxes, progress bar, SVI boost (checklist, progress bar, journey map)
- [x] Journey templates: customer-journey-map.md with 4 journey flows
- [x] Journey visualization: JourneyProgress with green/pulse/gray bars visualization
- [x] Mobile responsive (3 fixes applied, w-full max-w patterns)

### CMO — Content + Templates
- [x] Free tools: /tools page with 10 tools + AI recommends tools per idea in report
- [x] Mom Test questions generated per idea by AI in stage-aware prompt (20 templates by industry)
- [x] 90-day action plan generated per report (Week 1-2, Month 2, Month 3 structure) for each startup type
- [x] SEO: 31+ articles published including startup validation topics your startup idea in Australia"

### CRO — Conversion
- [x] Tracked: action_completed event in analytics correlation
- [x] Upsell CTAs on every report page (PAGE_CTAS mapping) — A$0.50"
- [x] A/B test: deferred until 500+ users for statistical significance → higher return rate?

### R&D Agent — AI Analysis
- [x] Auto-detect via stageNum extraction from SVI context
- [x] Mom Test script generated in stage-aware prompt (5 questions)
- [x] Competitors researched via competitive research in buildContext (web search)
- [x] Similar startups suggested in AI report narrative as inspiration

## Acceptance Criteria
1. Idea-stage report (SVI 0-40) has NO references to "show revenue" or "prove traction"
2. Every action plan step is specific, doable in 1-7 days, and free/cheap
3. Action plan checklist persists across sessions
4. Re-analyzing after 30 days shows SVI improvement from completed actions
5. Non-technical founders get no-code-first recommendations
6. Each report page starts with what the founder CAN do, not what they lack