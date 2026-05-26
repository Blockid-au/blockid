# Dashboard UX Redesign — Startup Mentor Journey

## Mission
Redesign toàn bộ giao diện authenticated user (My SVI Score, Reports, Dashboard)
theo flow mentoring startup: từ Idea → Validation → MVP → Traction → Fundraise.

Mỗi trang phải:
1. Hiển thị ĐẦY ĐỦ nội dung đã trả credit (không mất, không ẩn)
2. Hướng dẫn bước tiếp theo phù hợp với stage hiện tại
3. Professional UI/UX design với clear hierarchy
4. Mobile-first responsive

---

## Current Problems

### P0 — Content Loss
- User trả credit unlock report sections → navigate away → content MẤT
- Summaries auto-generated → không lưu vào dashboard
- Full report chỉ show inline, không persist vào "My SVI Score"

### P1 — No Stage-Aware Journey
- Dashboard giống nhau cho Idea stage và Growth stage
- Không có "next step" guidance phù hợp stage
- Actions tab generic, không prioritize theo giai đoạn

### P2 — Layout Overwhelming
- 10 sections SVI results: flat list, no grouping
- 4 tabs dashboard: quá nhiều data per tab
- No visual hierarchy: everything looks the same importance

---

## Design Principles

### 1. Stage-Aware Content
```
IDEA (SVI 0-40):
  Focus: Validate idea, find first customers
  Show: Market research, competitor landscape, idea validation
  Hide: Financial projections, cap table, investor readiness
  Mentor: "Let's validate your idea before thinking about funding"

VALIDATED (SVI 40-70):
  Focus: Build MVP, get first revenue
  Show: Product development, go-to-market, early traction
  Unlock: Basic financial planning
  Mentor: "Your idea has potential. Let's build something people pay for"

MVP/TRACTION (SVI 70-120):
  Focus: Scale, fundraise, governance
  Show: Everything + fundraise tools
  Unlock: Investor readiness, cap table, term sheet
  Mentor: "You have traction. Let's get you investor-ready"

GROWTH (SVI 120+):
  Focus: Scale, exit planning
  Show: Full platform + advanced tools
  Mentor: "Time to scale. Let's optimize your cap table and governance"
```

### 2. Information Architecture
```
My SVI Score (tabbed)
├── TAB: Journey Map (default — stage-aware roadmap)
│   ├── Current Stage Hero (big score + stage badge)
│   ├── Stage Roadmap (5 stages with current highlighted)
│   ├── "What to Do Now" (3 actions for THIS stage)
│   └── Recent Progress (last 3 activities)
│
├── TAB: Full Report (ALL paid content preserved)
│   ├── Phase headers: Foundation → PMF → Growth → Strategic
│   ├── Each section: summary (always) + full (if unlocked)
│   ├── Unlock CTAs for remaining sections
│   └── "Unlock All" bundle
│
├── TAB: Analysis History
│   ├── Timeline: every analysis with score delta
│   ├── Each links to saved report with ALL sections
│   └── SVI trend chart
│
└── TAB: Evidence & Actions
    ├── Uploaded evidence (documents, links)
    ├── Connected sources (GitHub, Analytics)
    ├── Improvement actions from gaps
    └── Impact calculator
```

### 3. Professional Design Language
- Card-based layout with clear sections
- Phase colors: Foundation=blue, PMF=purple, Growth=green, Strategic=amber
- Stage badges: pill with icon + label
- Progress indicators: completion % per phase
- Mentor tone: encouraging but specific

---

## Sub-Goals (Implementation Order)

### Sub-Goal 1: Stage-Aware Journey Map Component (P0)
**Agent: ui-ux-pro-max**
**File: `web/src/components/dashboard/journey-map.tsx` (NEW)**

Visual roadmap showing 5 startup stages:
```
[Idea] ──→ [Validated] ──→ [MVP] ──→ [Traction] ──→ [Growth]
                 ▲ You are here (SVI: 42)
```

Below roadmap: 3 action cards specific to current stage:
- Idea: "Describe your market", "Research competitors", "Define your customer"
- Validated: "Build MVP scope", "Get first beta users", "Set pricing"
- MVP: "Upload revenue data", "Connect GitHub", "Create pitch deck"
- Traction: "Prepare data room", "Clean cap table", "Financial model"

### Sub-Goal 2: Full Report Tab with Persistent Content (P0)
**Agent: general-purpose**
**File: Modify `web/src/components/dashboard/living-svi-dashboard.tsx`**

Replace current Reports tab with:
1. Load ALL saved report_sections for latest analysis
2. Group by phase (Foundation → PMF → Growth → Strategic → Premium)
3. Show each section with:
   - Phase header with color badge
   - Summary content (always visible, rendered markdown)
   - Full content (if unlocked, rendered markdown)
   - "Read full analysis (X cr)" CTA if not unlocked
4. "Unlock All Remaining" bundle at bottom

This is the KEY tab — user must see EVERYTHING they paid for.

### Sub-Goal 3: Mentor Guidance Banner (P1)
**Agent: general-purpose**
**File: `web/src/components/dashboard/stage-mentor.tsx` (NEW)**

Context-aware banner at top of dashboard:
- Idea stage: "Welcome! You're at the beginning. Focus on validating your idea."
- Validated: "Good progress! Your next milestone: build an MVP."
- MVP: "You're building. Get your first paying customer."
- Traction: "Revenue is flowing. Time to get investor-ready."
- Growth: "You're scaling. Optimize governance and plan your fundraise."

Includes:
- Stage-specific icon + color
- 1-2 sentence guidance
- Single CTA button for the highest-impact next action

### Sub-Goal 4: Phase-Grouped SVI Dimensions (P1)
**Agent: general-purpose**
**File: Modify `web/src/components/svi/svi-results-panel.tsx`**

Group the 8 SVI dimensions into phases:
```
FOUNDATION (Founder + Legal)
├── Founder & Team: 65/100
└── Legal & Compliance: 45/100

PRODUCT-MARKET FIT (Market + Product + Traction)
├── Market & Problem: 72/100
├── Product & Tech: 58/100
└── Traction & Revenue: 35/100

GOVERNANCE (Cap Table + Investor Ready)
├── Cap Table: 40/100
└── Investor Readiness: 28/100

STRATEGIC (Vision + Risk [calculated])
└── Strategic Vision & Moat: 55/100
```

Each phase shows:
- Phase completion % (average of dimensions)
- Color-coded progress bar
- Expand to see individual dimensions

### Sub-Goal 5: Mobile-Optimized Layout (P2)
**Agent: ui-ux-pro-max**
**File: Multiple dashboard components**

- Stack tabs vertically on mobile
- Collapsible phase groups
- Sticky tab navigation
- Touch-friendly action buttons (min 44px tap target)
- Swipe between tabs

### Sub-Goal 6: Evidence Integration in Report (P2)
**Agent: general-purpose**

Show uploaded evidence inline with relevant report sections:
- Market section → show market research documents
- Product section → show GitHub audit results
- Traction section → show revenue screenshots
- Legal section → show ABN/ASIC documents

---

## Review Checklist (for Founder review)

Before deploying each sub-goal, verify:

□ Does this page help a DAY-1 founder understand what to do?
□ Is every piece of paid content visible and accessible?
□ Is the next action obvious without scrolling?
□ Does it work on mobile (375px viewport)?
□ Is the tone encouraging (mentor) not overwhelming (data dump)?
□ Are sections grouped logically by startup phase?
□ Can user find their previous analyses easily?
□ Are credit costs shown before any charge?