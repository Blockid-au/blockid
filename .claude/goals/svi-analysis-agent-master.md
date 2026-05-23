# SVI Analysis Agent — Master Goal

## Mission
BlockID.au's core AI agent that analyses startups at ANY stage and produces step-by-step guidance that matches the founder's CURRENT reality. Never skip steps. Never demand what they don't have. Always give the NEXT logical action.

## Core Principle: Progressive Complexity
```
WRONG: "Show us your MRR" (to an idea-stage founder)
RIGHT: "This week, talk to 5 potential customers using this script..."

WRONG: "Build your data room" (to someone with just an idea)  
RIGHT: "Create a 1-page problem statement using this template..."

WRONG: "Hire a CTO" (to a solo founder with no funding)
RIGHT: "Find a technical advisor: post on ADPList, attend Sydney Startup Hub..."
```

## Stage-Progressive Analysis Framework

### Level 1: Raw Idea (SVI 0-30)
**What they have**: An idea, maybe some research
**What they need**: Problem validation, customer discovery
**Report focus**:
- Is this problem real? Who has it? How bad is it?
- 5 specific communities where target users exist
- Mom Test interview script (5 questions, customized)
- Competitor landscape (who else is solving this?)
- "Your first action: Talk to 5 people this week"

**Action checklist**:
□ Write problem statement (1 page)
□ List 10 people who might have this problem
□ Conduct 5 Mom Test interviews
□ Summarize: "X out of 5 said they would pay for this"
□ Research 5 existing solutions
→ Re-analyze on BlockID → SVI should increase by +10-15

### Level 2: Validated Problem (SVI 30-50)
**What they have**: Problem confirmed by real conversations
**What they need**: Solution design, landing page, waitlist
**Report focus**:
- Value proposition canvas (problem ↔ solution fit)
- Customer journey map (awareness → purchase → retention)
- Landing page strategy (Carrd/Framer, free, 2 hours)
- Waitlist setup (Tally/Google Forms)
- "Your first action: Build a landing page this weekend"

**Action checklist**:
□ Create value proposition canvas
□ Design customer journey (5 stages)
□ Build landing page with clear CTA
□ Set up waitlist/signup form
□ Share landing page in 3 communities
□ Get 50 email signups
→ Re-analyze → SVI +10-20

### Level 3: Solution Designed (SVI 50-70)  
**What they have**: Landing page, some signups, validated problem
**What they need**: MVP, technical decisions, first version
**Report focus**:
- Tech stack recommendation (based on idea type + founder skill)
- No-code vs code decision framework
- MVP scope: what to build first (3-5 core features only)
- Design mockups guidance (Figma, free)
- Deployment guide (Vercel/Railway, free tier)
- "Your first action: Build the signup + core action flow"

**Action checklist**:
□ Choose tech stack (AI recommends based on profile)
□ Design 5 core screens (Figma wireframes)
□ Build MVP Sprint 1: Auth + core feature
□ Build MVP Sprint 2: Onboarding + key workflow
□ Deploy to production (free tier hosting)
□ Get 10 beta testers from waitlist
→ Re-analyze → SVI +15-25

### Level 4: MVP Live (SVI 70-100)
**What they have**: Working product, few users
**What they need**: Product-market fit, first revenue signals
**Report focus**:
- User activation analysis (are users coming back?)
- Feedback collection system (Canny/feedback widget)
- Pricing strategy (freemium vs paid from day 1)
- Growth experiments (3 channels to test)
- Legal basics: ABN, terms of service, privacy policy
- "Your first action: Talk to 5 active users about pricing"

### Level 5: Traction (SVI 100-140)
**What they have**: Active users, some engagement
**What they need**: First revenue, growth system
**Report focus**:
- Monetization strategy implementation
- Unit economics (even rough)
- Team planning (first hire/advisor)
- Accelerator applications (Antler, Startmate, HAX)
- Fundraise readiness checklist

### Level 6: Revenue (SVI 140-180)
**What they have**: Paying customers, growing revenue
**What they need**: Scale, fundraise, team
**Report focus**:
- Financial projections (3 scenarios)
- Fundraise strategy (SAFE vs priced round)
- Cap table setup
- Investor pitch preparation
- Hiring plan (next 3 hires)

### Level 7+: Growth (SVI 180+)
**What they have**: Revenue, team, funding
**What they need**: Scale systems, governance, expansion
**Report focus**: Full deep analysis (current system)

## Self-Upgrade Protocol

### Weekly (Automated, Free Providers Only)
- [ ] Sample 5 recent reports → check if stage-appropriate
- [ ] Flag reports that demand revenue from idea-stage founders
- [ ] Measure: action completion rate per stage
- [ ] Auto-tune: which prompts produce best action plans?

### Monthly (AI Research)
- [ ] WebSearch: "startup validation frameworks 2026"
- [ ] WebSearch: "best practices early-stage startup mentoring"  
- [ ] WebSearch: "Y Combinator startup advice pre-product"
- [ ] Update Mom Test question bank with new patterns
- [ ] Review: which industries are hot for Australian startups?
- [ ] Check: new free tools available for founders?

### Quarterly (Knowledge Base Update)
- [ ] Update AU market data (AVCAL, Cut Through Venture)
- [ ] Update competitor landscape (Carta, Equidam, Pulley features)
- [ ] Update valuation baselines (real fundraise data)
- [ ] Add new startup frameworks/methodologies
- [ ] Review and improve system prompts based on user feedback

## Quality Gates (Per Report)

Before a report is sent, it MUST pass these checks:

1. **Stage Appropriateness**: No action requires capabilities the founder doesn't have
2. **Specificity**: Every action item names a specific tool, template, or resource
3. **Time-Bounded**: Every action has "this week" / "this month" timeframe
4. **Free First**: First 3 actions in any checklist must be achievable at A$0
5. **Progressive**: Each action builds on the previous one logically
6. **Australian Context**: References AU-specific resources (ABN, ASIC, ESIC, grants)
7. **Re-engagement**: Every report ends with "Re-analyze in X days to see your progress"

## Implementation Status

### Done ✅
- [x] Stage detection from SVI score (rnd-analysis.ts)
- [x] Stage-specific prompt templates (Stage 0-2, 3-4, 5+)
- [x] Idea-stage page reinterpretation (Business Model → Revenue Options)
- [x] Mom Test guidance in prompts
- [x] Free tools recommendation
- [x] No-code MVP suggestions
- [x] Action plan checklist component (action-plan-checklist.tsx)
- [x] Checklist persistence (localStorage)
- [x] Progress bar + SVI boost estimate
- [x] Valuation V2.1 calibrated to AU market
- [x] Multi-provider AI chain (Claude + Gemini + Groq + OpenRouter)
- [x] Worker subprocess for reliable AI calls

### In Progress 🔄
- [ ] Customer journey template library
- [ ] Tech stack recommender per idea type
- [ ] Free tools directory (50+ tools)
- [ ] Weekly report quality sampling
- [ ] Action completion → SVI improvement tracking

### Planned 📋
- [ ] Mom Test question bank (20 templates by industry)
- [ ] Startup framework library (Lean Canvas, BMC, Value Prop Canvas)
- [ ] "Your Startup Journey" progress visualization
- [ ] Gamification: badges for completing milestones
- [ ] Personalized email 24h after first report
- [ ] Community-driven action plan improvements