# Goal: SVI Analysis UX Excellence

## Owner: CPO + CTO
## Priority: P0
## Status: IN PROGRESS

---

## Objectives

### 1. Analysis Session Persistence
- Save SVI analysis results to localStorage + Supabase
- User navigates away and returns → results still visible
- History of all past analyses accessible from dashboard
- Each analysis has a unique slug/ID for sharing

### 2. Real-time Notifications & Status
- When analysis completes → toast notification on any page
- Dashboard shows "Just completed" badge on latest analysis
- Credit balance updates in real-time after each operation
- Progress indicator during generation (section-by-section)

### 3. Language Auto-Detection
- Detect input language (EN/VI/other) automatically
- Generate report in the SAME language as input
- User can override language preference in settings
- All UI chrome stays English; only AI-generated content adapts

### 4. Visual Reports with Infographics
- Each report section includes relevant SVG chart/infographic
- Score gauge, dimension bars, comparison charts inline
- Flow diagrams for action plans
- All visuals match BlockID brand colors

### 5. Call-to-Action Integration
- Each report section ends with contextual CTA
- "Improve this score" → Evidence Vault
- "Build your cap table" → Cap Table tool
- "Get investor ready" → Data Room
- CTAs tracked via analytics events

### 6. Credit Transparency
- Show credit cost BEFORE user confirms action
- Real-time balance in navbar/sidebar
- Transaction history in billing page
- Low-balance warnings (< 3 credits)

---

## Implementation Tasks

| Task | Owner | Priority |
|---|---|---|
| Session persistence (localStorage + DB) | CTO | P0 |
| Dashboard "recent analysis" section | CTO | P0 |
| Language auto-detection in AI calls | CTO | P0 |
| Toast notification system | CTO | P1 |
| Visual SVG infographics in reports | CPO | P1 |
| CTA buttons in report sections | CPO | P1 |
| Credit pre-confirmation dialog | CTO | P1 |
| Report history page | CTO | P2 |

---

## Success Metrics
- Analysis completion rate: >95% (currently failing due to timeouts)
- Session persistence: 0 lost analyses
- Language match: 100% input→output language consistency
- Credit clarity: 0 surprise charges