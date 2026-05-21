# CPO Sub-Goal: Vesting & Share Structure — Product & UX Design

## Parent Goal
`goals/vesting-share-structure.md`

## Mission
Design intuitive, friction-free UX flows for equity setup, vesting visualization, and AI recommendations that enable founders to configure their entire share structure in under 5 minutes.

---

## Design Principles

1. **Progressive Disclosure** — Show complexity only when needed
2. **Sensible Defaults** — System pre-fills based on role; manual override always available
3. **Visual Feedback** — Animated pie charts, progress bars, timelines
4. **AI as Co-pilot** — "Let AI suggest" buttons at every decision point
5. **Mobile-Ready** — Full responsive design for founder-on-the-go

---

## Component 1: Equity Setup Wizard

### Flow (6 Steps)
```
Step 1: "You own 100%" → One card showing founder
Step 2: Add Stakeholders → Each addition shows live dilution animation
Step 3: Vesting Config → Role-auto-filled, "AI Suggest" button
Step 4: ESOP Pool → Slider + "AI Suggest" button
Step 5: Share Structure → Mode toggle (Fixed/Dynamic) with explanation
Step 6: Review → Summary + "Deploy to Blockchain" CTA
```

### Step 1: Founder Initialization
- Show: Single card with founder name, 100%, filled donut chart
- Copy: "You're the sole owner. Add co-founders, advisors, or investors to begin."
- Action: "Add Stakeholder" button (prominent)

### Step 2: Add Stakeholders
- Form fields: Name, Email, Role (dropdown), Equity %
- **Live dilution preview**: Animated pie chart recalculates as user types %
- Validation: Total cannot exceed 100%; show remaining available %
- Quick-add: Pre-built role templates (Co-founder 25%, Advisor 1%, Employee 0.5%)
- AI CTA: "Not sure how to split? Let AI suggest →" (1.00 credit badge)

### Step 3: Vesting Configuration
- Per-stakeholder vesting card with pre-filled defaults based on role
- Fields: Vesting months, Cliff months, Start date, Type (linear/weighted)
- Visual: Mini timeline showing cliff → vesting → fully vested
- Override: "Customize for this startup" toggle
- AI CTA: "AI optimal vesting terms" (0.50 credit) per stakeholder

### Step 4: ESOP Pool
- Slider: 0-20% with markers at common values (10%, 12%, 15%)
- Shows: How many shares the pool represents + dilution to existing holders
- Info tooltip: "Standard AU seed ESOP: 10-15%"
- AI CTA: "AI suggest based on hiring plan" (0.50 credit)

### Step 5: Share Structure Mode
- Two cards side-by-side:
  - **Fixed Shares** (recommended badge for pre-seed/seed): "10M shares, price grows with your SVI"
  - **Dynamic Shares**: "Fixed price $0.001, more shares as you grow"
- Under each: simple worked example with current SVI
- AI CTA: "Which mode fits my startup?" (0.75 credit)

### Step 6: Review & Confirm
- Full summary table: Name, Role, %, Shares, Vesting, Cliff
- Total valuation based on current SVI
- Price per share
- "Confirm & Set Up" primary button
- "Deploy to Blockchain" secondary button (for users with MetaMask)

---

## Component 2: Vesting Dashboard

### Location
`/workspace/vesting` — New workspace tab

### Layout
```
┌─────────────────────────────────────────────────┐
│  Overview Cards (3)                              │
│  [Total Vested] [Next Vest Date] [Share Price]  │
├─────────────────────────────────────────────────┤
│  Vesting Timeline Chart (stacked area)          │
│  X-axis: months, Y-axis: shares                 │
│  Color: one per shareholder                     │
├─────────────────────────────────────────────────┤
│  Shareholder Vesting List                       │
│  ┌─────────────────────────────────────────┐    │
│  │ [Avatar] Name  | Role | ████░░░░ 37.5% │    │
│  │ Vested: 937K / 2.5M  | Next: Jun 1     │    │
│  │ [Pause] [Accelerate] [Details →]        │    │
│  └─────────────────────────────────────────┘    │
├─────────────────────────────────────────────────┤
│  Recent Vesting Events                          │
│  • May 1: Alice vested 52,083 shares (27.08%)   │
│  • Apr 1: Alice vested 52,083 shares (25.00%)   │
│  • Jan 1: Alice cliff passed — 625,000 shares   │
└─────────────────────────────────────────────────┘
```

### Vesting Progress Bar Design
```
[████████████░░░░░░░░░░░░░░░░░░░░]
 ← Cliff →|← Vested →|← Unvested →
   12 mo      6 mo        30 mo
```
- Dark fill: cliff period (if not yet passed, show as pending)
- Primary color: vested portion
- Light/striped: unvested future

### Share Price Widget
- Current price per share (bold)
- Delta from last month (green/red arrow)
- Link: "Based on SVI {score} → A${valuation}"
- Sparkline: price history (last 6 months)

---

## Component 3: AI Recommendation Modals

### EquitySplitModal
```
┌─────────────────────────────────────────┐
│  AI Equity Split Recommendation         │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                         │
│  Based on your team's contributions:    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ Alice (CEO)      →  55%        │    │
│  │ Bob (CTO)        →  30%        │    │
│  │ ESOP Pool        →  15%        │    │
│  └─────────────────────────────────┘    │
│                                         │
│  Rationale:                             │
│  • Alice: Full-time, idea originator,   │
│    5yr domain expertise (+35 points)    │
│  • Bob: Part-time now, full-time in 3mo │
│    CTO experience (+18 points)          │
│                                         │
│  Benchmark: Top 30% of AU pre-seed      │
│  startups have similar splits           │
│                                         │
│  [Accept & Apply] [Modify] [Dismiss]    │
│                                         │
│  Cost: 1.00 credit ✓ Charged            │
└─────────────────────────────────────────┘
```

### VestingScheduleModal
- Shows suggested months + cliff for each role
- Comparison table: "Industry standard" vs "AI suggestion" vs "Your current"
- Rationale per stakeholder
- One-click apply

---

## Component 4: Enhanced Existing Pages

### Shareholders Page Enhancement
- Add "Vesting Status" column to the shareholders table
- Mini progress bar in each row
- "Set Up Vesting" button for shareholders without schedules

### ESOP Page Enhancement
- Link to vesting dashboard for granted options
- Show pool utilization: allocated vs available
- "AI Suggest Pool Size" button

### Cap Table Diff Enhancement
- Show vesting impact in round modeling
- "If this round happens, here's how vesting accelerates on CoC"

---

## User Testing Plan

### Metrics to Track
- Time to complete equity setup wizard (target: <5 min)
- Drop-off rate per wizard step
- AI suggestion acceptance rate (target: >60%)
- Vesting dashboard engagement (weekly returns)
- "AI Suggest" button click-through rate

### A/B Tests
- Wizard vs free-form setup (which has higher completion?)
- AI suggestion shown inline vs modal
- Credit cost display: before click vs after click

---

## Responsive Design

| Breakpoint | Layout |
|------------|--------|
| Desktop (>1024px) | Full dashboard with side-by-side charts |
| Tablet (768-1024px) | Stacked cards, collapsed timeline |
| Mobile (<768px) | Single column, swipeable shareholder cards |

---

## Accessibility

- All charts have text alternatives
- Progress bars use aria-valuenow/aria-valuemax
- Color is not sole indicator (patterns + labels)
- Keyboard navigation for wizard steps
- Screen reader announcements for live dilution changes

---

## Skills Used
- `/ui-ux-pro-max` — Component design, layout patterns
- `/react-expert` — React 18+ component architecture
- `/nextjs-developer` — App Router pages, server components
- `/cpo` — Feature prioritization, user testing

## Success Metrics
- [ ] Setup wizard completes in <5 minutes (p75)
- [ ] <15% drop-off between wizard steps
- [ ] AI suggestion acceptance >60%
- [ ] Vesting dashboard loads in <1.5s (LCP)
- [ ] Mobile-responsive across all components
- [ ] WCAG 2.1 AA compliance for all new components