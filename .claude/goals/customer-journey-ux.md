# Customer Journey UX Optimization

## Mission
Optimize the complete customer journey from first visit → analysis → signup → return visit.
Focus on early-stage startups (idea/MVP phase) that don't have revenue/traction evidence yet.

---

## 12 UX Issues Found (Priority Order)

### P0 — Critical (Block Conversion)

1. **Email field hidden until user types** — user sees "Please enter email" error with no visible input
   - Fix: Always show email input (partially fixed, verify)
   - File: `svi-entrance.tsx` line ~1102

2. **Sign-in banner says "credentials sent" but nothing was sent** — confusing
   - Fix: Reword to "Sign in to save your report and track progress"
   - File: `svi-entrance.tsx` search "account is ready"

3. **Free tier not communicated upfront** — user doesn't know they get free analysis
   - Fix: Add "First analysis FREE" badge near email input (not just below form)
   - File: `svi-entrance.tsx`

### P1 — High (Reduce Friction)

4. **Paywall appears AFTER submit** — user fills everything, clicks submit, then blocked
   - Fix: Show credit indicator BEFORE submit ("This will use 0.50 credits")
   - File: `svi-entrance.tsx` submit handler

5. **Project concept unexplained for first-timers** — dropdown appears without context
   - Fix: Add tooltip "Each project tracks one startup's SVI over time"
   - File: `svi-entrance.tsx` project selector

6. **Deep Dive upsell easily missed** — buried at bottom of results
   - Fix: Add floating "Want deeper insights?" pill at top of results
   - File: `svi-results-panel.tsx`

### P2 — Medium (Improve Engagement)

7. **Report content too generic for early-stage startups** — prompts assume revenue data
   - Fix: Detect stage=idea/validated → use early-stage specific prompts
   - Focus: mentoring tone, validate idea, find first customers, NOT unit economics
   - File: `report-sections.ts` prompts

8. **No "first analysis" celebration** — user completes analysis, no excitement
   - Fix: Add confetti/celebration animation + "Congratulations!" banner
   - File: `svi-entrance.tsx` results section

9. **Previous analysis not linked after login** — orphaned anonymous analyses
   - Fix: On first login, check if email matches any svi_analyses → auto-link
   - File: `auth.ts` loginWithGoogle / magic link verify

### P3 — Low (Polish)

10. **SVI "out of 100" misleading** — SVI can go above 100
    - Fix: Show "out of 200" or remove cap reference
    - File: onboarding wizard

11. **Credit system not explained before paywall** — user sees "0.50 credits" without context
    - Fix: Add inline tooltip "1 credit ≈ A$1" near credit references
    - File: various CTA components

12. **"My SVI Score" only in dropdown** — power users want direct access
    - Fix: Show "SVI" link in main navbar (already done as "Get SVI Score")
    - Status: DONE

---

## Early-Stage Startup Focus

For users at Idea/Validated/MVP stage, the report should focus on:
- Idea validation techniques (customer discovery, problem interviews)
- First 10 customers acquisition strategies
- MVP scope and build priorities
- Pitch preparation (not financial modeling)
- Australian grants and support programs (ESIC, accelerators)
- Co-founder finding and team building

NOT:
- Unit economics (they don't have customers yet)
- Revenue forecasting (no data)
- Cap table optimization (too early)
- Investor readiness (premature)

---

## Implementation Plan

| Priority | Task | Agent/Skill |
|----------|------|-------------|
| P0 | Fix sign-in banner wording | Direct edit |
| P0 | Add "FREE" badge near email | Direct edit |
| P1 | Pre-submit credit indicator | Direct edit |
| P1 | Project selector tooltip | Direct edit |
| P2 | Early-stage report prompts | report-sections.ts |
| P2 | First analysis celebration | svi-entrance.tsx |
| P2 | Auto-link analyses on login | auth.ts |