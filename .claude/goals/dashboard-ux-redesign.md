# Dashboard UX Redesign — Startup Journey Operating System

## Vision
Transform BlockID.au from a tool-first dashboard into a **journey-driven startup operating system** where every screen guides founders through their next best action — from Day 0 idea to exit. Every user sees their original idea context, clear next steps, and celebration of progress.

## Core Principles
1. **Journey-first, not tool-first** — Menu organized by startup phase, not feature category
2. **Progressive disclosure** — Show 4-5 cards max, drill into details on demand  
3. **Always show context** — Original idea summary visible in every report/screen
4. **Clear next step** — AI-recommended action on every page
5. **Celebrate progress** — Badges, level-ups, confetti at milestones
6. **Nothing paid is ever lost** — All unlocked content persisted and accessible

---

## Current Problems (from QA Review)

### P0 — Lost Context
- Original idea input disappears after analysis (only raw_input snippet in history)
- No AI-generated project name from input content
- Users can't tell which analysis belongs to which startup idea

### P1 — No Journey Guidance  
- Dashboard identical for Idea stage and Growth stage founders
- No "next step" AI recommendation
- No onboarding checklist for new users (wizard exists but skipped)
- 20+ sidebar menu items with no priority guidance

### P2 — Passive Dashboard
- No notification system (bell icon exists, no inbox)
- No "NEW" badges on unlocked features
- No celebration/gamification on milestones
- No visual phase progression indicator

### P3 — Menu Confusion
- Sidebar items have no visual cues (hover effects, badges, lock states)
- Premium items show no credit cost indicator
- No distinction between available and locked features

---

## Sub-Goals (10 areas, ordered by impact)

### SG1: Journey Progress Bar
**Agent: CTO + CPO | Priority: P0**

Horizontal phase indicator at top of dashboard:
```
[Idea] ──→ [Valuation] ──→ [Equity] ──→ [Token] ──→ [Fundraise] ──→ [Exit]
  ✓            ●              ○            ○            ○              ○
 Done       Current        Locked       Locked       Locked         Locked
```
- Current phase pulses with brand accent animation
- Completed phases: green checkmark + glow
- Future phases: greyed with lock icon (tooltip: "Complete Valuation to unlock")
- Click any phase → navigate to that phase's workspace
- Mobile: compact single-line scrollable version
- Component: `web/src/components/dashboard/journey-bar.tsx`

### SG2: Onboarding Checklist Widget
**Agent: CPO + CRO | Priority: P0**

Persistent collapsible checklist in dashboard:
```
Your Startup Checklist (3/8 complete)
[✓] Create your startup profile
[✓] Describe your idea  
[✓] Get your free SVI score
[ ] Build your valuation model        ← [Start] button
[ ] Set up equity structure
[ ] Prepare pitch materials
[ ] Connect with investors
[ ] Plan exit strategy
```
- Each step has "Start" CTA deep-linking to relevant tool
- Checkmark animation + micro-celebration on completion
- Progress badge: "3/8 complete" in sidebar
- Dismissible after 100% (but accessible from profile)
- Component: `web/src/components/dashboard/onboarding-checklist.tsx`

### SG3: Smart Dashboard Layout (4-5 Cards Max)
**Agent: CTO + CPO | Priority: P0**

Replace current data-heavy dashboard with progressive disclosure:

**Top**: Journey Progress Bar (SG1)

**Row 1**: 4 metric cards (responsive 2x2 on mobile)
- SVI Score (with trend arrow +/- delta)
- Current Phase (with progress ring %)
- Credits Balance (with usage sparkline)
- Investor Readiness % (new computed metric)

**Row 2**: Next Best Action card (full-width)
- AI-generated: "Based on your SVI of 62, upload revenue evidence to boost Traction (+15 pts)"
- Single CTA button
- Dismiss to reveal 2nd priority action

**Row 3**: 2-column (stack on mobile)
- Recent Reports (last 5, with idea summary snippet + SVI score + date)
- Activity Timeline (notifications, milestones, new features)

**Row 4**: Onboarding Checklist (if < 100%, SG2)

### SG4: Project Context Everywhere
**Agent: CTO | Priority: P0**

- Auto-generate project name from input via AI (summarize idea in 5-8 words)
- Fallback: first 60 chars of input text
- Every report page header shows:
  - Project name (editable inline)
  - Idea summary snippet (first 150 chars)
  - SVI score badge
  - Date generated
  - Report type badge (Standard / Deep Dive / Modular)
- Breadcrumb: Dashboard > [Project Name] > [Current Page]
- Project switcher in topbar (dropdown, not buried in sidebar)

### SG5: Notification System
**Agent: CTO + COO | Priority: P1**

- Bell icon with numeric badge in navbar (already exists, wire up)
- Notification types:
  - "Report ready" → click → view report
  - "SVI score changed (+12 pts)" → click → dashboard
  - "New feature unlocked: Equity Tools" → click → feature page
  - "Weekly insights ready" → click → insights page
  - "Action needed: Upload evidence" → click → evidence vault
- Toast notifications (bottom-right, auto-dismiss 5s)
- Notification inbox at /workspace/notifications
- Red dot badges on sidebar menu items with pending actions
- "NEW" text badge (blue) on menu items for newly unlocked features

### SG6: Interactive Menu with Visual Cues
**Agent: CTO + CPO | Priority: P1**

Sidebar menu items enhanced with:
- **"NEW" badge** (blue pill) on newly unlocked features
- **Red dot** on items with pending actions (evidence to review, report ready)
- **Disabled/locked** state for features requiring prerequisite phases
- **Hover animation**: translateX(4px) + shadow transition
- **Credit cost** indicator on premium items (small coin icon + "0.50 cr")
- **Active state**: brand-600 bg + left border-2 accent + bold text
- **Tooltip** on hover: explains what each tool does (for new users)
- **Phase group headers**: collapsible with stage labels + completion %

### SG7: Report Viewer with Full Context
**Agent: CTO | Priority: P0**

Every report page must show:
1. **Header**: Project name + idea summary + SVI badge + date + type
2. **Phase-grouped sections**: Foundation → PMF → Growth → Strategic
3. **Each section**: 
   - Summary (always visible, free)
   - Full content (if unlocked, rendered markdown)
   - "Unlock full analysis (X credits)" CTA if locked
   - Export individual section as PDF
4. **"Unlock All Remaining"** bundle CTA at bottom (discounted)
5. **Comparison view**: show delta between current and previous analysis
6. **Export PDF** button (prominent, top-right)
7. **"Re-analyze"** button to run updated analysis with same input

### SG8: PDF Export for All Results
**Agent: CTO | Priority: P1**

- "Export PDF" button on every report page
- PDF includes:
  - BlockID branding header + logo
  - Project name + idea summary
  - SVI score gauge visualization
  - All unlocked sections with formatted content
  - Evidence gaps + prioritized recommendations
  - Disclaimer + generation date
- Extend existing react-pdf implementation to cover:
  - Living dashboard export
  - Individual section export
  - Full report export (all unlocked)

### SG9: Founder Level Gamification
**Agent: CPO + CRO | Priority: P2**

Level system tied to journey phases:
```
Level 1: Dreamer       (Completed: Idea phase)
Level 2: Builder       (Completed: Valuation)  
Level 3: Architect     (Completed: Equity)
Level 4: Fundraiser    (Completed: Tokenization)
Level 5: Operator      (Completed: Dividend)
Level 6: Exit Master   (Completed: Exit)
```
- Level badge in sidebar + profile page
- Milestone celebration modal with shareable social card
- Streak counter: "Building for 12 days straight"
- Achievement badges: First Score, Deep Diver, Equity Architect, Pitch Ready, Weekly Returner
- Progress ring animation on level-up

### SG10: Mobile-First Responsive
**Agent: CTO | Priority: P1**

- **Bottom tab bar** (4 tabs): Home, Reports, Equity, Profile
- Card-based mobile layout (stack vertically)
- Hamburger menu for full sidebar on mobile
- Touch-friendly tap targets (min 44px)
- Journey bar: compact horizontal scrollable version
- Swipeable tabs on report viewer
- Collapsible phase groups in reports

---

## Customer Journey Flow (Redesigned)

### Phase 1: First Visit (Unauthenticated)
```
Homepage → Enter idea → Get FREE SVI Score → See results
→ Results show: SVI gauge + 8 dimensions + evidence gaps + mentor guidance
→ Banner: "Your account is ready! Check email for login credentials"
→ Email: Welcome + temp password + PDF report attached
```

### Phase 2: First Login  
```
Login → Dashboard with:
  - Journey Bar: Phase 1 (Idea) ✓ active
  - Onboarding Checklist: 3/8 done!
  - Metric cards: SVI 58 | Phase: Idea | Credits: 5 | Readiness: 15%
  - Next Action: "Upload evidence to boost your score (+8-20 pts)"
  - Recent Reports: Shows idea summary "AI SaaS for accountants..."
  - Notification: "Welcome! Complete your profile to unlock more tools"
```

### Phase 3: Building (Idea → Valuation)
```
Upload evidence → SVI rescored → "+18 points!" toast celebration
→ Notification: "Phase complete: Idea! Valuation tools unlocked"
→ Menu: "Valuation" item gets "NEW" blue badge
→ Checklist: 4/8 complete
→ Next Action: "Build your valuation model"
→ Level up: "You're now a Builder (Level 2)!" modal
```

### Phase 4: Structuring (Valuation → Equity)
```
Complete valuation → Equity tools unlocked
→ Notification: "You're now an Architect! Cap Table + ESOP ready"
→ Menu: Equity group items all get "NEW" badges  
→ Equity Setup wizard → Cap Table auto-populated
→ Next Action: "Prepare your pitch deck"
```

### Phase 5: Fundraising (Equity → Investment)
```
Pitch deck generated → Data room created → Investor readiness: 85%
→ Next Action: "Share data room with investors"
→ Investor link generated with tracking
→ Notification: "3 investors viewed your data room today"
```

### Phase 6+: Growth → Exit
```
Each phase unlocks the next with:
- Celebration modal
- Menu badges
- Level-up animation
- Personalized mentor guidance
```

---

## Agent Assignments

| Agent | Sub-Goals | Focus |
|-------|-----------|-------|
| **CTO** | SG1, SG3, SG4, SG5, SG6, SG7, SG8, SG10 | Implementation |
| **CPO** | SG2, SG3, SG6, SG9 | UX specs, user stories |
| **CRO** | SG2, SG9 | Conversion optimization |
| **CMO** | — | Content: empty states, tooltips, mentor messages |
| **COO** | SG5 | QA, sprint coordination |

## Success Metrics
- Onboarding completion rate: 60% (up from ~10%)
- Day-7 retention: 40% (up from ~15%)  
- Phase 2 (Valuation) reach rate: 30% of signups
- PDF export usage: 20% of report viewers
- Average session duration: 8 min (up from ~3 min)
- Notification click-through: 25%

## Review Checklist
Before deploying each sub-goal:
- [ ] Does this page help a DAY-1 founder understand what to do?
- [ ] Is every piece of paid content visible and accessible?
- [ ] Is the next action obvious without scrolling?
- [ ] Does it work on mobile (375px viewport)?
- [ ] Is the original idea context shown?
- [ ] Are credit costs shown before any charge?
- [ ] Can user export results as PDF?
- [ ] Is the tone encouraging (mentor) not overwhelming (data dump)?
