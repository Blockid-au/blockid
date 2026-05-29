# Goal: Dashboard Visualization & Charts

## Vision
Dashboard shows beautiful, interactive charts that make founders FEEL their startup growing. Every data point tells a story. History is visible but not overwhelming (show 3 recent, load more on demand).

## Charts to Build

### 1. SVI Trend Line (Hero Chart)
- Line chart showing SVI score over time (all analyses)
- X-axis: dates, Y-axis: SVI score (0-200)
- Highlight current score with large number
- Show delta badge (+12 since last analysis)
- Green line when trending up, red when down
- Show 3 most recent data points prominently, rest on scroll/expand

### 2. SVI Dimension Radar Chart
- 8-axis radar showing current dimension scores
- Overlay previous analysis in lighter color for comparison
- Click any axis → navigate to that dimension's detail
- Colors: brand-600 for current, surface-300 for previous

### 3. Valuation Estimate Card
- Convert SVI to estimated valuation range
- Show as gauge: "$50K — $500K" with needle at mid-point
- Update as SVI changes
- Stage-based multiplier (Idea=$0-100K, MVP=$200K-2M, Revenue=$1M-20M)

### 4. Phase Progress Ring
- Circular progress showing completion within current phase
- Animated fill on load
- Center: phase name + percentage
- Below: "3 actions to reach next phase"

### 5. Activity Timeline (Last 3)
- Show 3 most recent activities (analysis, evidence upload, report unlock)
- Each with: icon, title, date, impact (+12 pts)
- "Show all history" link at bottom → loads full timeline
- Lazy-load older items

### 6. Credit Usage Sparkline
- Tiny line chart in credits card showing last 7 days usage
- Green when balance increasing, amber when decreasing

## Design System
- Use recharts (already in package.json) or lightweight SVG charts
- Colors from brand palette (brand-500, emerald-500, amber-500)
- Responsive: charts stack on mobile, side-by-side on desktop
- Animations: fade-in on load, smooth transitions
- Dark mode compatible (check dark:bg-* classes)

## Agent Assignments
- CTO: implement chart components
- CPO: specify exact data requirements per chart
- CDO: ensure data pipeline feeds charts correctly
- UI/UX Pro Max skill: design system compliance
