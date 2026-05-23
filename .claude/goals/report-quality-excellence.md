# Goal: Report Quality Excellence — Retain Users Through World-Class Analysis

## Mission
Every report BlockID generates must be so valuable that founders want to come back, buy more credits, and share with their co-founders and investors. Reports are the core product — their quality determines retention, word-of-mouth, and revenue.

## Core Principles

### 1. Progressive Journey Reports (Not Monolithic)
Split the analysis into stages matching the founder's actual journey:
```
Stage 0: Idea Validation Report (free preview, 10 pages)
  → "Is this idea worth pursuing?"
  → Key output: Market size, competition scan, feasibility score
  
Stage 1: MVP Readiness Report (0.50 credits)
  → "What should I build first?"
  → Key output: Feature prioritization, tech stack recs, timeline
  
Stage 2: Traction Analysis (0.50 credits)
  → "Am I growing?"
  → Key output: Growth metrics, channel analysis, benchmarks
  
Stage 3: Investor Readiness Report (1.00 credits)
  → "Am I ready to raise?"
  → Key output: Data room checklist, valuation range, pitch feedback
  
Stage 4: Full Due Diligence Pack (2.00 credits)
  → "What will investors see?"
  → Key output: Complete DD package, risk matrix, term sheet guidance
```

Each stage builds on previous data — no redundant generation.

### 2. Report Caching & History
- Every generated report is saved and accessible from dashboard
- User sees "Your Reports" section with all past analyses
- Re-viewing a report costs 0 credits (read from cache)
- Updating a report with new data costs reduced credits (delta only)
- Google Drive document auto-generated and linked per report

### 3. Credit-Efficient Design
- Show "You already have a report for this" before re-generating
- Offer "Update with new evidence (+0.25 cr)" instead of full regeneration
- Bundle pricing shown when user selects 3+ sections
- Weekly email summary includes key findings (no credit needed to read)

### 4. SVI-to-AUD Valuation Display
Every report and dashboard shows:
```
┌─────────────────────────────────────────┐
│ Your Startup Value (Estimated)          │
│                                         │
│ SVI Score: 127 / Stage: MVP             │
│ Estimated Value: A$180,000 - A$350,000  │
│                                         │
│ Your Ownership: 100% (10,000,000 shares)│
│ Your Value: A$180,000 - A$350,000       │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ Shareholders        %    Value (est)│ │
│ │ Do Van Long (You) 100%  A$350,000   │ │
│ │ [Add co-founder]                    │ │
│ │ [Add advisor]                       │ │
│ │ [Add ESOP pool]                     │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ Vesting: 48mo, 12mo cliff              │
│ Vested to date: A$87,500 (25%)         │
│                                         │
│ ⚠ This is an indicative estimate,      │
│   not a financial valuation.            │
└─────────────────────────────────────────┘
```

### 5. Google Drive Integration
For each user+project:
- Auto-create Google Drive folder on first report
- Generate Google Doc with full report content
- Update doc when report is refreshed
- Share link displayed in dashboard: "View in Google Drive"
- Folder structure: `BlockID / [Startup Name] / Reports / [Date] - [Type].gdoc`

### 6. Report Sharing
- Shareable link per report (public URL with slug)
- PDF download (always available for generated reports)
- "Share with investor" flow: enter email → send branded email with report link
- Investor view: clean, professional layout without editing UI

## Implementation Priority

### Sprint 1: Report History + Caching
- [x] Dashboard "Your Reports" section (report-history.tsx) showing all past analyses
- [x] Report detail page loads from cache (rnd/route.ts cache check) (0 credits)
- [x] "This report already exists" warning (cache check in API) warning before re-generation
- [x] "Update report" option (report cache with delta detection) option for existing reports

### Sprint 2: SVI-to-AUD Valuation
- [x] Valuation card on dashboard (SVI-to-AUD mapping) showing estimated range
- [x] Shareholder table with percentages and estimated values (valuation-card.tsx) and estimated values
- [ ] Vesting progress with vested value calculation
- [ ] Cap table summary in sidebar/widget

### Sprint 3: Google Drive + Sharing
- [ ] Auto-create Drive folder per user/project
- [ ] Generate Google Doc from report content
- [ ] "View in Google Drive" link on dashboard
- [ ] Shareable public link per report
- [ ] "Share with investor" email flow

### Sprint 4: Progressive Journey Reports
- [ ] Stage-appropriate report templates (0-4)
- [ ] "What's your current stage?" selector
- [ ] Stage-specific next steps and recommendations
- [ ] Cross-stage progress tracking

## Success Metrics
| Metric | Current | Target |
|--------|---------|--------|
| Report re-view rate (cached) | 0% | 40%+ |
| Reports per user (avg) | 1 | 3+ |
| Credit purchase after first report | ~5% | 15% |
| Report share rate | 0% | 10% |
| User return within 7 days | ~10% | 30% |