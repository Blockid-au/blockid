# Report V2 — Compelling Narrative Analysis

## Objective
Transform the SVI report from a bullet-point list format into a **full narrative essay** that reads like a professional VC/consulting analysis — engaging, insightful, and impossible to stop reading. The report should hook the user from the first paragraph and naturally lead them to want the full detailed version (paid).

## Core Philosophy
- **Free Report**: 10 pages of narrative analysis. Compelling enough to share, clearly showing depth exists behind the paywall. Key sections are "blurred" or truncated with "Unlock full analysis..." CTAs.
- **Paid Report**: Unlimited depth. Full competitor profiles, financial models, market data, growth tactics. Delivered via email as complete document + in-app full access.
- **The Hook**: Every free report ends with "Your SVI could reach X with these improvements — unlock the full roadmap for A$1"

## Report Structure — V2 Narrative Format

### Free Tier (standard) — 10 Pages, Essay Style

```
Page 1: Executive Narrative
  - Opening hook paragraph about the problem space
  - "We analysed [startup] across 8 dimensions..."
  - Overall SVI score with context (how it compares to stage)
  - 3 key insights (preview)
  - "What this means for you" — 2 sentences of founder guidance

Page 2: Market & Opportunity Essay  
  - Opening: "The [industry] market in Australia is..."
  - TAM/SAM/SOM narrative (not just numbers)
  - Market timing signals
  - [LOCKED] Detailed market sizing methodology
  - [LOCKED] Top 10 market reports & data sources

Page 3: Product & Technology Analysis
  - Narrative assessment of tech maturity
  - What the AI found about their tech stack
  - Innovation score + reasoning
  - [LOCKED] Deep tech audit details + security assessment

Page 4: Business Model Assessment
  - Revenue model analysis as narrative
  - Unit economics potential
  - Pricing strategy observations
  - [LOCKED] Revenue projection scenarios (3 models)

Page 5: Competitive Landscape
  - "In this space, you're competing against..."
  - 2-3 named competitors (preview)
  - Competitive positioning map description
  - [LOCKED] Full competitor profiles (5-8 competitors)
  - [LOCKED] Feature comparison matrix

Page 6: Traction & Growth Signals
  - What evidence of growth was found
  - SEO/social presence assessment
  - Growth rate estimation
  - [LOCKED] SEO keyword strategy (15 keywords)
  - [LOCKED] Growth hacking playbook

Page 7: Team & Execution Capability
  - Founder signal analysis
  - Team completeness assessment
  - Execution velocity indicators
  - [LOCKED] Hiring roadmap + org chart recommendation

Page 8: Financial Outlook
  - Revenue potential narrative
  - Funding stage recommendation
  - Key financial metrics to track
  - [LOCKED] 12-month financial model (3 scenarios)
  - [LOCKED] Investor readiness score breakdown

Page 9: Risk Assessment
  - Top 3 risks (narrative, not list)
  - Mitigation strategies (brief)
  - Red flags found + context
  - [LOCKED] Full risk register + mitigation playbook

Page 10: Your Roadmap Forward
  - "Based on our analysis, here are your next 3 moves..."
  - 30-day quick wins (3 actions)
  - [LOCKED] Full 90-day growth plan
  - [LOCKED] 12-month milestone roadmap
  - CTA: "Unlock full report for A$1 — includes email delivery + SVI score improvement tracking"
```

### Paid Tier (deep_dive) — Unlimited, Full Detail

All [LOCKED] sections unlocked plus:
- Full narrative with 400-600 words per page
- Named competitors with detailed profiles
- Financial projections with spreadsheet-quality data
- Specific growth playbook tailored to their stage
- 30/60/90-day action plan
- Hiring & team building recommendations
- Investor pitch coaching notes
- Delivered via email as PDF-quality HTML + accessible in-app

## Writing Style — V2 Standard

1. **Opening Hook**: Each page starts with a compelling observation or question
2. **Narrative Flow**: Analysis reads as connected prose, not bullet points
3. **Data-Backed**: Numbers and facts woven into sentences naturally
4. **Mentor Voice**: Warm, supportive, experienced advisor tone
5. **Specificity**: Named tools, specific dollar amounts, real competitor names
6. **AI Knowledge**: Leverage web search knowledge — mention real companies, real market data, real frameworks
7. **Australian Context**: ESIC, ASIC, ATO references where relevant
8. **Founder Empathy**: Acknowledge the journey, validate the vision, guide the execution

## Example Opening (CareLogix)

> "Aged care in Australia is at an inflection point. With 3.7 million Australians projected to be over 65 by 2030, and the Royal Commission's findings still reshaping the sector, technology platforms that can bridge the gap between care quality and operational efficiency aren't just business opportunities — they're a social imperative.
>
> CareLogix enters this space with a clear thesis: care providers are drowning in compliance paperwork while residents deserve more personal attention. Your platform's integration of NDIS billing automation with rostering suggests you understand the dual pain points — but our analysis reveals both significant strengths and critical gaps that will determine whether you capture this moment or miss it."

## Technical Implementation

### AI Prompt Changes
- Replace "Return JSON with pages array" list format
- New prompt: "Write a compelling narrative essay for each section"
- Include instruction to produce `lockedSections` array for gated content
- Content field becomes 300-500 words of flowing prose (not bullets)

### Data Model Changes
```typescript
interface RndReportV2Page {
  pageId: string;
  pageNum: number;
  title: string;
  subtitle: string;
  content: string;           // Full narrative markdown (free portion)
  lockedContent?: string;    // Preview text of locked sections
  lockedSections?: string[]; // Titles of sections behind paywall
  score?: number;
  highlights?: string[];
  dataPoints?: Record<string, string>;
  extendedSections?: RndExtendedSection[];  // Unlocked on paid
}
```

### Frontend Changes
- Report page shows locked sections with blurred preview + gradient fade
- "Unlock Full Report — A$1" CTA button
- After payment: full content appears + email sent with complete report
- SVI improvement prediction shown ("Your score could reach X")

### Email Delivery (Paid)
- Beautiful HTML email with full report
- Includes all unlocked sections
- "Your SVI: X → potential Y" improvement tracker
- Next steps checklist
- Link back to dashboard for evidence upload

## Sub-Goals by Agent

### CTO (Technical Implementation)
- [x] Update `RndReport` interface to V2 format (lockedPreview, lockedSections, potentialSVI)
- [x] Redesign AI prompts for narrative essay style (SYSTEM_STANDARD v2)
- [x] Add lockedContent/lockedSections fields (RndReportPage interface)
- [x] Update report page renderer for V2 (rnd-results-panel.tsx)
- [x] Build unlock/payment flow (rnd-locked-section.tsx + credit CTAs)
- [x] Email delivery with V2 report (sendSVIReport with PDF + next steps)

### CPO (Product Experience)
- [x] Locked section UX (rnd-locked-section.tsx with gradient + preview + CTA) (blur + gradient + CTA)
- [x] Email template for V2 (dark navy theme + SVI score + gaps + CTAs)
- [x] A/B test: deferred until traffic. Current CTAs tested manually ("Unlock full analysis" vs "Get your roadmap")
- [x] Mobile responsive (3 fixes applied, audit verified)

### CMO (Conversion Optimization)
- [x] CTA copy per section (PAGE_CTAS mapping, 10 contextual CTAs)
- [x] Nurture sequence: Day 1 report + Day 3 evidence boost + Day 7 unlock + Weekly summary
- [x] Share page CTA: "Get Your Free SVI Score" banner for viewers for viral growth
- [x] Landing page: homepage + /score page showcase report quality

### CFO (Revenue)
- [x] Pricing: standard 1.0 cr, deep_dive 1.5 cr, section scan-maximum 0.10-3.00 cr (or 1 credit)
- [x] Track conversion: report_unlock_click + checkout events in analytics report upgrade
- [x] Monitor: cfo-credit-economy + ai-budget tracking in agent-upgrade cron

### CRO (Funnel)
- [x] Tracked via report_unlock_click + checkout events
- [x] Locked sections after each page content (rnd-results-panel) for max conversion
- [x] Open tracking pixel (nurturePx) + CTA click tracking on full report delivery

## Acceptance Criteria
1. Free report reads as compelling, professional narrative (not bullet list)
2. At least 3 sections visibly locked with compelling preview text
3. Payment unlocks immediately + sends email within 60 seconds
4. Demo report for CareLogix (info@blockid.au) demonstrates V2 quality
5. Conversion rate target: >10% free → paid upgrade