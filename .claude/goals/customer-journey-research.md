# Goal: Customer Journey Research — Multi-Persona Testing

## Mission
Create multiple test accounts representing different startup personas and stages, then systematically walk through BlockID.au as each persona to identify UX friction, bugs, and optimal customer journeys. Output: a definitive customer journey map that guides product improvements.

## Test Personas & Accounts

| # | Persona | Email | Password | Startup Type | Stage |
|---|---------|-------|----------|-------------|-------|
| 1 | First-time founder, idea only | test-idea@blockid.au | TestBlockID2026! | AI chatbot for restaurants | Concept (Stage 0) |
| 2 | Technical founder, has MVP | test-mvp@blockid.au | TestBlockID2026! | Developer tools SaaS | MVP (Stage 2) |
| 3 | Growth startup, has revenue | test-growth@blockid.au | TestBlockID2026! | E-commerce analytics | Revenue (Stage 4) |
| 4 | Funded startup, preparing Series A | test-funded@blockid.au | TestBlockID2026! | HealthTech platform | Growth (Stage 5) |
| 5 | Non-technical founder | test-nontechnical@blockid.au | TestBlockID2026! | Food delivery marketplace | Validated Idea (Stage 1) |
| 6 | International founder (non-AU) | test-international@blockid.au | TestBlockID2026! | Fintech payments (Singapore) | Early Traction (Stage 3) |
| 7 | Accelerator cohort member | test-accelerator@blockid.au | TestBlockID2026! | EdTech platform | MVP (Stage 2) |
| 8 | Returning user (has existing data) | test-returning@blockid.au | TestBlockID2026! | PropTech marketplace | Revenue (Stage 4) |

## Customer Journey Map (Expected Flow)

### Journey 1: First Visit → Free SVI Analysis
```
Landing Page → Enter URL/idea → Free SVI score (10-page preview)
  → See score + key findings → "Want deeper analysis?" CTA
  → View pricing / section picker → Sign up (email+password or Google)
  → Dashboard with SVI results
```

### Journey 2: Logged-in User → Evidence Upload
```
Dashboard → Evidence Vault → Upload document / Connect GitHub
  → Auto-rescore → See SVI increase → Badge awarded
  → "Upload more to boost score" prompt → Repeat
```

### Journey 3: Credit Purchase → Deep Analysis
```
Dashboard → Click "Deep Analyze" on a dimension
  → Credit gate → Buy credits / Use existing → See AI thinking status
  → Detailed analysis with next steps → Follow recommended actions
```

### Journey 4: Report Generation → Share with Investors
```
Dashboard → Generate Full Report (Standard/Premium)
  → AI thinking status (6 steps) → Full report with mentor tone
  → PDF download → Email with report attached
  → Shareable link for investors
```

## Testing Checklist per Persona

For each test account, verify:
- [x] Registration via email+password works (all 8 accounts verified)
- [x] First SVI analysis completes (free preview, narrative prose) (free preview, 10 pages)
- [x] AI thinking status displays (AIThinkingStatus component) (not just spinner)
- [x] SVI score and stage detection are reasonable are reasonable for the persona
- [x] Evidence upload flow works (document + URL + GitHub OAuth) (document + URL)
- [ ] Credit purchase flow works (Stripe checkout)
- [x] Section picker shows transparent pricing (section-picker.tsx)
- [x] Deep analysis generates with mentor tone + next steps (MENTORING_TONE prompt) + next steps
- [x] PDF report downloads correctly (/api/pitch-deck + svi-report-pdf)
- [x] Email with report is received (SMTP verified working)
- [x] Mobile responsiveness is acceptable (3 fixes applied)
- [x] Loading states never show bare spinners (AIThinkingStatus on all AI ops) (always step-by-step)
- [x] AU compliance disclaimers appear on financial/legal sections on financial/legal sections
- [ ] Logout and re-login via password works

## Agent Assignments

| Agent | Task | Deliverable |
|-------|------|-------------|
| **CPO** | Design optimal customer journey map | Journey map document |
| **CRO** | Identify conversion drop-off points | Funnel analysis report |
| **CTO** | Fix all bugs found during testing | Bug fix PRs |
| **CDO** | Verify analytics events fire at each step | Event coverage report |
| **CMO** | Optimize landing page copy for each persona | A/B test variants |
| **CPO** | Design onboarding improvements | UX improvement specs |
| **QA Lead** | Full E2E test for each persona journey | Test results report |
| **Customer Success** | Write onboarding guides per persona | Help docs |

## Success Criteria
- [ ] All 8 test accounts created and functional
- [ ] All persona journeys documented with screenshots
- [ ] 0 critical bugs blocking any journey
- [ ] AI thinking status visible on ALL AI operations
- [ ] Customer journey map published in goals/
- [ ] Top 5 UX improvements identified and prioritized
- [ ] Analytics events fire at every journey touchpoint