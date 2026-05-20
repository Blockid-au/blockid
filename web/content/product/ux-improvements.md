# UX Improvement Proposals (Q3 2026)

> **Last updated:** 2026-05-19 (S2026-10 Day 1)
> **Owner:** CPO
> **Aligned with:** CPO Q3 OKRs (O1: Phase 2 features, O3: Reduce time-to-value)

---

## Proposal 1: Guided Onboarding Tooltip Tour

### Problem
First-time visitors land on blockid.au and must self-discover the SVI search bar, understand what the score means, find evidence upload, learn about badges, and navigate to the dashboard. There is no guided path. The current feature adoption rate is unknown (CPO KPI baseline = 0).

### Solution
Implement a 5-step tooltip tour that activates on first visit (tracked via localStorage flag or user account `onboarding_completed` field).

### Steps
1. **SVI Search Bar** -- "Start here: describe your startup idea and we'll analyze it in 60 seconds"
2. **Results Panel** -- "Your Startup Value Index breaks down into 5 dimensions investors care about" (shown after analysis completes)
3. **Evidence Vault** -- "Upload evidence like pitch decks, financial models, or customer data to boost your score"
4. **Badge Shelf** -- "Earn badges as you hit milestones. First badge: complete your SVI analysis" (shown after badge system ships)
5. **Dashboard** -- "Track your progress over time. Your SVI updates weekly with new evidence"

### Technical Approach
- Use a lightweight tooltip library (e.g., `react-joyride` or custom Radix Popover-based)
- Store tour state in localStorage: `blockid_tour_step` (0-5) and `blockid_tour_completed` (boolean)
- For authenticated users, persist in `svi_accounts.onboarding_tour_completed`
- Steps 2-5 are deferred: they trigger when the user first visits each relevant page
- Skip button always available; "Remind me later" option for deferral

### Success Metrics
- Tour start rate: % of new visitors who see Step 1 (target: 100%)
- Tour completion rate: % who reach Step 5 (target: 80%, per CPO KR)
- Time-to-first-value change: measure before/after tour implementation
- Feature adoption rate: track whether tour completers use more features

### Effort Estimate
1.5 person-weeks (including design, implementation, tracking events)

### Sprint Target
S2026-12 (Jun 16-27) -- after analytics foundation is in place

---

## Proposal 2: Post-Analysis Action Cards

### Problem
After SVI analysis completes, the user sees their score and report. There are no prominent calls-to-action guiding them to the next step. Evidence upload rate is ~5%. Users get their score and leave.

### Solution
Render 3 large, visually distinct action cards immediately below the SVI results panel. Each card is framed in terms of SVI improvement to create a feedback loop motivation.

### Card Designs

#### Card 1: "Upload Evidence" (Primary -- highest SVI impact)
- **Headline:** "Boost your score by 10-20 points"
- **Body:** "Upload your pitch deck, financial model, or customer data. Our AI re-analyzes and updates your SVI instantly."
- **CTA Button:** "Upload Evidence" (links to `/workspace/evidence`)
- **Visual:** Upload icon + progress ring showing "Evidence: 0/5 items"
- **Color:** Brand gradient (brand-500 to brand-600)

#### Card 2: "Build Cap Table" (Most requested tool)
- **Headline:** "Structure your ownership"
- **Body:** "Model equity splits, dilution scenarios, and vesting schedules. Investors expect this."
- **CTA Button:** "Open Cap Table" (links to `/tools/cap-table`)
- **Visual:** Pie chart icon with founder/investor segments
- **Color:** Surface/neutral with gold accent

#### Card 3: "Share Your Score" (Viral growth driver)
- **Headline:** "Show investors you're serious"
- **Body:** "Share your SVI report with co-founders, advisors, and investors. One link, always up to date."
- **CTA Button:** "Get Shareable Link" (copies `/s/[slug]` URL)
- **Visual:** Share icon + badge showing SVI score number
- **Color:** Surface/neutral with brand accent

### Layout
- 3-column grid on desktop (equal width cards)
- Stack vertically on mobile with Card 1 always first
- Appears with a slide-up animation after results render (300ms delay)
- Cards collapse to a "Next Steps" summary bar after user clicks any one

### Technical Approach
- New component: `PostAnalysisActions` in `web/src/components/svi/`
- Receives `slug`, `totalSVI`, and `analysis` props from SVIEntrance
- Conditionally rendered when `state === "done"`
- Track events: `post_analysis_cta_clicked` with `{ card: "evidence" | "cap_table" | "share", svi: number }`

### Success Metrics
- CTA click rate per card (target: 30% overall, 15%+ for evidence)
- Evidence upload rate improvement (target: 5% -> 15% within 4 weeks)
- Share link generation rate (target: 10% of analysis viewers)
- Downstream: signup conversion from shareable link recipients

### Effort Estimate
1 person-week

### Sprint Target
S2026-11 (Jun 2-13) -- high RICE score (#9 in backlog, 8.0)

---

## Proposal 3: Progress Dashboard

### Problem
Users have no visual sense of where they are on the startup journey or what they should do next. The SVI dashboard shows a score but lacks goal-oriented framing. CPO KPI for "multi-project adoption" is at 0%.

### Solution
Add a visual progress tracker to the SVI dashboard that maps the founder journey into 4 stages, shows earned vs available badges, evidence completeness, and the specific next action to take.

### Design

#### Stage Progress Bar
```
[Idea] -------> [Validated] -------> [MVP] -------> [Funded]
  /                  |
 You are here    Next milestone
```

- 4-stage horizontal bar with filled/unfilled dots
- Current stage determined by SVI score thresholds:
  - Idea: SVI 0-99
  - Validated: SVI 100-199
  - MVP: SVI 200-349
  - Funded: SVI 350+
- Animated transition when stage advances
- Below the bar: "You need X more points to reach [next stage]"

#### Badges Section
- Grid of badge icons (earned = full color, unearned = greyed out with lock icon)
- Earned count: "4 of 15 badges earned"
- Clicking an unearned badge shows: what action unlocks it + estimated SVI impact
- Celebration animation (confetti) on badge earn (ties into badge system, Phase 2 Sub-goal 2.3)

#### Evidence Completeness Ring
- Circular progress indicator showing % of evidence categories filled
- Categories: Pitch Deck, Financial Model, Customer Data, Product Demo, Legal Docs
- Each segment fills as evidence is uploaded
- Center text: "60% complete" with a CTA to upload missing items

#### Next Milestone Card
- Single prominent card showing the most impactful next action
- Example: "Upload your pitch deck to earn the 'Deck Ready' badge and boost your SVI by ~15 points"
- Personalized based on what the user is missing
- Auto-updates as actions are completed

### Technical Approach
- New component: `ProgressDashboard` in `web/src/components/svi/`
- Render within WorkspaceLayout on `/dashboard/svi`
- Reads from: `svi_accounts` (current_svi, current_stage), `svi_evidence` (completeness), badges table (when available)
- Stage thresholds configurable via constants (easy to adjust as scoring evolves)

### Success Metrics
- Dashboard daily active users (target: 15% DAU/MAU per CPO KPI)
- Evidence completeness improvement (track weekly average across users)
- Badge earn velocity (badges earned per user per week)
- Return visit rate (do dashboard users come back more often?)

### Effort Estimate
2 person-weeks (core), +1 person-week (badges integration when badge system ships)

### Sprint Target
S2026-13 (Jun 30 - Jul 11) -- depends on badge system from S2026-14

---

## Proposal 4: Mobile-First SVI Experience

### Problem
Current SVI experience is desktop-optimized. The homepage uses a large textarea, multi-column layouts, and dense report panels that work on mobile but are not optimized for touch. Based on Australian startup founder demographics, an estimated 30-40% of traffic will be mobile (industry average for B2B SaaS landing pages).

### Solution
Targeted mobile optimizations to the SVI analysis flow without a full redesign.

### Specific Changes

#### 4a: Touch-Friendly Search Bar
- Increase textarea minimum height on mobile: 120px (currently auto-sizes from content)
- Add larger tap targets for voice input and file upload buttons (min 48x48px)
- "Quick example" chips: increase padding for thumb-friendly tapping
- Auto-focus textarea on mobile when hero section scrolls past (IntersectionObserver)

#### 4b: Swipeable Report Pages
- SVI results on mobile currently render as a long scrollable panel
- Change to horizontal swipe between dimensions: Market -> Team -> Product -> Traction -> Readiness
- Dot pagination indicator at bottom
- Each page shows: dimension score, AI summary, and top action
- Implement with CSS scroll-snap or a lightweight swipe library

#### 4c: Sticky CTA Bar on Mobile
- After results are shown, add a sticky bottom bar (like mobile app navigation)
- Shows: SVI score badge + primary CTA ("Upload Evidence")
- Stays visible as user scrolls through the full report
- Collapses to a floating button when scrolled back to top

#### 4d: Optimized Loading State
- Replace full-page R&D status bar with a bottom-sheet style loading indicator on mobile
- Show skeleton cards for expected result sections (reduces perceived wait time)
- Haptic feedback on analysis completion (if supported by device)

### Technical Approach
- All changes via Tailwind responsive classes (sm:/md: breakpoints)
- Swipeable report: CSS `scroll-snap-type: x mandatory` on a horizontal scroll container
- Sticky bar: `fixed bottom-0` with Tailwind, hidden on md+ screens
- No new dependencies required

### Success Metrics
- Mobile conversion rate (visitor-to-SVI) vs desktop (target: within 80% of desktop)
- Mobile bounce rate reduction (target: -20%)
- Mobile time-to-first-value (target: <2 minutes, matching desktop)
- Swipe completion rate (% of users who view all 5 dimension pages)

### Effort Estimate
2 person-weeks

### Sprint Target
S2026-14 or S2026-15 -- after core conversion fixes are in place

---

## Proposal 5: Tool-to-SVI Connection

### Problem
BlockID offers 10 free tools (cap table, equity split, dilution calculator, etc.) that generate value but are disconnected from the SVI score. Users complete a tool session and leave. There is no feedback showing that their work contributed to their startup's overall readiness.

### Solution
After any tool session completes, show a contextual banner connecting the tool output to the user's SVI score. If the user is authenticated and has an SVI analysis, show the specific point improvement. If anonymous, show the potential improvement and prompt signup.

### Tool-to-SVI Signal Mapping

| Tool | SVI Signal Affected | Estimated Impact |
|------|-------------------|-----------------|
| Cap Table Diff | hasCapTable = true | +8-12 pts (OPS dimension) |
| Equity Split | hasVesting = true | +5-10 pts (OPS dimension) |
| Dilution Calculator | hasFundingPlan = true | +5-8 pts (FIN dimension) |
| Funding Plan | hasFundingPlan = true, hasFinancialModel = true | +8-15 pts (FIN dimension) |
| Term Sheet AI | hasLegalDocs = true | +5-10 pts (OPS dimension) |
| Data Room Checklist | hasDataRoom = true | +10-15 pts (OPS + INV dimension) |
| Idea Valuation | hasPitchDeck = true (if exported) | +5-8 pts (MKT dimension) |
| Co-founder Match | hasTeam = true | +8-12 pts (TME dimension) |
| ESIC Checker | hasLegalDocs = true | +3-5 pts (OPS dimension) |
| R&D Tax Calculator | hasRevenue = true (implied) | +3-5 pts (FIN dimension) |

### UX Flow

1. User completes a tool (e.g., finishes cap table)
2. **Banner appears** (full-width, above tool output):
   - Authenticated + has SVI: "Your Cap Table improved your SVI by +10 points. View your updated score."
   - Authenticated + no SVI: "You've set up ownership. Get your SVI score to see where you stand."
   - Anonymous: "Your Cap Table could boost your investor-readiness score by +10 points. Sign up to track it."
3. CTA button: "View Updated Score" / "Get Your Score" / "Sign Up"
4. If user clicks: navigate to `/dashboard/svi` (auth) or `/` with pre-filled context (anon)

### Technical Approach
- New component: `ToolToSVIBanner` in `web/src/components/svi/`
- Props: `toolName`, `signalKey`, `estimatedImpact`, `userAuthenticated`, `hasSVI`
- Server action: `POST /api/svi/signal` -- sets a signal flag for the user's SVI account
- Auto-rescore trigger: after signal is set, queue rescore (ties into Phase 2 Sub-goal 2.1)
- For MVP: show estimated impact without actual rescore; connect to live rescore when Sub-goal 2.1 ships

### Success Metrics
- Banner view rate (target: 100% of tool completions for authenticated users)
- CTA click-through rate (target: 25% of banner views)
- Tool-to-SVI conversion (target: 15% of tool users get/update SVI within 24 hours)
- Tool engagement: do connected tools see higher repeat usage?

### Effort Estimate
1.5 person-weeks (banner + signal API), +1 person-week (live rescore integration after Sub-goal 2.1)

### Sprint Target
S2026-15 (Jul 28 - Aug 8) -- after evidence feedback loop ships

---

## Implementation Priority

| Rank | Proposal | Effort | Dependencies | Sprint |
|------|----------|--------|-------------|--------|
| 1 | Post-Analysis Action Cards | 1 week | None | S2026-11 |
| 2 | Guided Onboarding Tour | 1.5 weeks | Analytics events (#2) | S2026-12 |
| 3 | Progress Dashboard | 2 weeks | Badge system (P2 Sub-goal 2.3) | S2026-13 |
| 4 | Tool-to-SVI Connection | 1.5 weeks | Evidence feedback loop (P2 Sub-goal 2.1) | S2026-15 |
| 5 | Mobile-First SVI | 2 weeks | Core conversion fixes | S2026-14/15 |

### Cumulative Impact Projection

If all 5 proposals ship by end of Q3 2026:
- **Evidence upload rate:** 5% -> 20%+ (driven by Proposals 1, 2, 3, 5)
- **Time-to-first-value:** ~110s -> <90s (driven by Proposals 2, 4 optimizations)
- **Feature adoption rate:** Unknown -> 40%+ (driven by Proposals 2, 3)
- **DAU/MAU ratio:** Unknown -> 15% (driven by Proposals 3, 5)
- **Organic referral rate:** Unknown -> 5%+ (driven by Proposal 1 share card, Proposal 5 viral loop)

These projections align with CPO Q3 2026 KPI targets.

---

## Design Principles

All proposals follow these UX principles:

1. **Value-first framing:** Every CTA tells the user what they gain ("boost +10 points"), not what we want them to do ("click here")
2. **Progressive disclosure:** Show complexity gradually. New users see simple actions; returning users see deeper analytics.
3. **Feedback loops:** Every user action should produce visible feedback within 5 seconds (CPO acceptance criteria for Sub-goal 2.1)
4. **Mobile-aware:** All new components must work on 375px+ screens from day one
5. **Measurable:** Every new UI element has at least one tracking event attached before it ships
