# Customer Journey Map — BlockID.au Optimal Flows

## Journey 1: Anonymous Visitor → First SVI Score (Conversion Funnel Top)

```
1. LAND: blockid.au homepage
   → Hero: "Measure your startup value in 60 seconds"
   → CTA: Big input textarea (paste URL, describe idea, or upload doc)
   → Social proof: "50+ founders, 200+ analyses, $2M+ tracked"

2. INPUT: User types/pastes their startup info
   → No login required for first analysis (reduces friction)
   → AI thinking status shows step-by-step progress
   → Tech audit + scrape run in parallel if URL

3. RESULT: Free 10-page preview report
   → SVI score prominently displayed with stage label
   → Narrative prose (not bullet lists) with mentoring tone
   → Each page ends with "Next Steps" and locked preview teaser
   → "Unlock full report" CTA appears naturally

4. GATE: Email capture for report saving
   → "Save your report — enter email" (not hard paywall)
   → OR "Sign up to track progress over time"
   → Options: Email+Password (default) | Google | Magic Link
```

**Key UX Principles:**
- First value in <60 seconds (no signup required)
- AI thinking status always visible (never bare spinner)
- Report preview shows enough value to create desire for more
- Soft email gate (save report) not hard paywall

## Journey 2: Signed-Up User → Evidence Loop → Score Growth

```
1. DASHBOARD: Welcome with SVI summary
   → Current score + stage + percentile
   → "Your SVI journey" timeline (empty for new users)
   → Top 3 recommended actions to boost score

2. EVIDENCE UPLOAD: "Boost your score"
   → Drag-drop document upload OR connect sources
   → GitHub: OAuth connect → deep repo audit → auto-score boost
   → Analytics: URL verify → confidence boost
   → Stripe: Revenue connection → traction boost
   → Each upload shows AI thinking status during processing

3. RESCORE: Watch score grow
   → Real-time SVI update after each evidence item
   → Badge earned notifications ("First Evidence!", "SVI 120!")
   → Delta display: "+8 points from GitHub connection"
   → Next recommended action updates automatically

4. REPEAT: Engagement loop
   → Weekly email: "Your SVI this week: 127 (+5)"
   → Dashboard shows progress graph over time
   → New recommended actions based on current gaps
```

**Key UX Principles:**
- Every action has visible, immediate impact on score
- Gamification (badges, deltas, milestones) drives repeat visits
- Recommendations are personalized to user's current stage
- Evidence upload shows what it'll do BEFORE uploading

## Journey 3: Paying User → Deep Analysis → Investor Preparation

```
1. SECTION PICKER: Choose what to analyze
   → Transparent pricing per section × depth
   → Bundle discount prominently shown
   → "A consultant charges A$300+ for this" anchor
   → Confirmation before any charge

2. DEEP ANALYSIS: AI generates at chosen depth
   → AI thinking status: 4-6 step progress for each operation
   → Narrative prose with Australian context
   → Named competitors, real market data
   → Specific, actionable next steps per section

3. FULL REPORT: Investor-ready document
   → PDF download with brand design
   → Email delivery with report attached
   → Shareable link for investors
   → AU compliance disclaimers on financial/legal sections

4. DATA ROOM: Prepare for fundraise
   → One-click data room from evidence vault
   → Pitch deck outline generated from SVI data
   → Term sheet analysis tool
   → Investor readiness checklist with progress
```

## Journey 4: Returning User → Cap Table → Equity Management

```
1. MULTI-PROJECT: Portfolio view
   → List of all startup profiles
   → Compare SVI scores across projects
   → Quick switch between startups

2. CAP TABLE: Equity setup wizard
   → AI-suggested equity split (1 credit)
   → Vesting schedule builder (monthly linear)
   → ESOP pool sizing recommendation
   → Share class management

3. VALUATION: SVI-linked pricing
   → Fixed mode: 10M shares, price floats with SVI
   → Dynamic mode: price fixed, shares grow
   → Dollar valuation with multiples + comparables

4. BLOCKCHAIN (optional): Token transparency
   → Per-startup toggle on/off
   → NASDAQ-style ticker assignment
   → MetaMask wallet connection
   → On-chain equity verification
```

---

## UX Improvement Priority List

### P0 — Critical (Fix This Sprint)

| # | Issue | Journey | Fix |
|---|-------|---------|-----|
| 1 | First SVI analysis requires knowing what to type | J1 | Add example prompts + voice input reminder |
| 2 | No obvious CTA after free report | J1 | Add prominent "Save & Track Progress" after results |
| 3 | AI operations show bare spinners in some places | J2 | Wire AIThinkingStatus into all remaining operations |
| 4 | Credit cost not always visible before action | J3 | Ensure every paid action shows cost + confirmation |
| 5 | Mobile viewport issues on some pages | All | Responsive audit + fix |

### P1 — Important (Fix Next Sprint)

| # | Issue | Journey | Fix |
|---|-------|---------|-----|
| 6 | Onboarding flow doesn't guide new users | J2 | Add progressive onboarding wizard (3 steps) |
| 7 | Evidence upload doesn't show expected score impact | J2 | Show "Upload this to gain +X points" preview |
| 8 | Section picker not integrated into main SVI flow | J3 | Add "Customize your report" after free preview |
| 9 | Dashboard empty state is not motivating | J2 | Add "Your startup journey starts here" with guided first actions |
| 10 | Weekly email doesn't include actionable items | J2 | Add top 3 recommended actions in weekly email |

### P2 — Nice to Have (Backlog)

| # | Issue | Journey | Fix |
|---|-------|---------|-----|
| 11 | No comparison with similar startups at same stage | J3 | Add benchmarking section with anonymized peers |
| 12 | No social sharing of SVI score | J1 | Add "Share your SVI" with branded card |
| 13 | No dark mode | All | Add dark mode toggle |
| 14 | Voice input not discoverable | J1 | Add microphone icon in input area |
| 15 | No way to export evidence vault as ZIP | J4 | Add bulk export for data room |

---

## Metrics to Track per Journey

| Journey | Key Metric | Current | Target |
|---------|-----------|---------|--------|
| J1: First Visit → SVI | Time to first score | ~90s | <60s |
| J1: SVI → Signup | Conversion rate | ~15% | 30% |
| J2: Signup → Evidence Upload | Day-1 activation | ~10% | 25% |
| J2: Evidence → Rescore | Upload-to-rescore loop | ~5% | 20% |
| J3: Free → Paid (credits) | Conversion rate | ~5% | 10% |
| J3: Section purchase | Avg sections per user | 0 | 3+ |
| J4: Cap table adoption | Users with cap table | 0 | 15% |

---

## Agent Ownership

| Journey | Primary Agent | Support |
|---------|--------------|---------|
| J1 (Acquisition) | CMO + CPO | CRO, CTO |
| J2 (Activation) | CPO + CRO | CTO, CDO |
| J3 (Revenue) | CRO + CFO | CPO, CTO |
| J4 (Retention) | CPO + CBO | CTO, CHRO |