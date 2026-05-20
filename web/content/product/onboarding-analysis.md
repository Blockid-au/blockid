# Onboarding Flow Analysis

> **Last updated:** 2026-05-19 (S2026-10 Day 1)
> **Owner:** CPO
> **Data sources:** Code review of svi-entrance.tsx, onboarding-wizard.tsx, dashboard/svi/page.tsx, evidence/page.tsx; CRO analytics gaps report

---

## Current User Journeys

There are two distinct paths into BlockID: anonymous SVI analysis (primary acquisition) and authenticated onboarding (post-signup).

### Journey A: Anonymous SVI Analysis (Primary Funnel)

This is how most users first experience BlockID. The flow lives in `SVIEntrance` component at the root `/` route.

| Step | Action | Estimated Time | Cumulative | Component/Route |
|------|--------|---------------|------------|-----------------|
| 1 | Land on blockid.au | 0s | 0s | `/` (SVIEntrance) |
| 2 | Scroll past hero/pillars to SVI search bar | ~5s | 5s | SVIEntrance textarea |
| 3 | Type startup idea (or use quick example) | ~30s | 35s | textarea + QUICK_EXAMPLES |
| 4 | Enter email address | ~10s | 45s | email input field |
| 5 | Click "Get My SVI" | ~2s | 47s | handleSubmit() |
| 6 | Wait for R&D agent analysis (SSE stream) | ~45-60s | ~105s | RndStatusBar shows progress |
| 7 | View results (auto-scroll to #svi-results) | ~5s | ~110s | SVIResultsPanel + RndResultsPanel |
| **Total time-to-first-value:** | | | **~110 seconds (~1.8 minutes)** | |

### Journey B: Authenticated Onboarding (Post-Signup)

Triggered when a user signs up/logs in and has no projects yet. Lives in `/onboarding` route.

| Step | Action | Estimated Time | Cumulative | Component/Route |
|------|--------|---------------|------------|-----------------|
| 1 | Login via Google OAuth | ~5s | 5s | `/auth/login` |
| 2 | Redirect to onboarding wizard | ~2s | 7s | `/onboarding` (OnboardingWizard) |
| 3 | Step 1: Enter startup name + description | ~20s | 27s | Wizard step 0 |
| 4 | Step 2: Select industry | ~5s | 32s | Wizard step 1 (INDUSTRIES grid) |
| 5 | Step 3: Confirm idea text (auto-prefilled) | ~5s | 37s | Wizard step 2 |
| 6 | Submit: Project created + SVI analysis triggered | ~45-60s | ~95s | POST /api/projects + /api/rnd |
| 7 | Redirect to SVI dashboard | ~3s | ~98s | `/dashboard/svi` |
| **Total time-to-first-value:** | | | **~98 seconds (~1.6 minutes)** | |

### Journey C: Return User (Existing Project)

| Step | Action | Estimated Time | Cumulative |
|------|--------|---------------|------------|
| 1 | Visit blockid.au, click login | ~3s | 3s |
| 2 | Google OAuth (auto if session exists) | ~2s | 5s |
| 3 | Land on SVI dashboard | ~2s | 7s |
| 4 | View existing SVI score, snapshots, weekly delta | 0s | 7s |
| **Time-to-value:** | | | **~7 seconds** |

---

## Friction Points Identified

### FP-1: Results not visible after analysis [SEVERITY: Critical] [STATUS: FIXED]
- **Evidence:** 71% drop-off rate after SVI submission (users never scrolled to results)
- **Root cause:** Results rendered below the fold; no auto-scroll
- **Fix applied:** `queueMicrotask(() => resultsEl.scrollIntoView({ behavior: "smooth" }))` in svi-entrance.tsx
- **Validation needed:** Confirm drop-off rate decreased in next analytics review

### FP-2: Email required before analysis [SEVERITY: Medium] [STATUS: Open]
- **Evidence:** `handleSubmit()` validates email before processing: `if (!email || !email.includes("@")) return`
- **Hypothesis:** Some users abandon when asked for email before seeing any value
- **Risk:** Removing email gating breaks the free-analysis-per-email model and credit system
- **Recommendation:** A/B test: show partial/preview results without email, require email for full report + save
- **Estimated impact:** Could improve submission rate by 15-25% if friction is real

### FP-3: No granular progress indicator during analysis [SEVERITY: Medium] [STATUS: Open]
- **Evidence:** `RndStatusBar` shows a single text message from the SSE stream (`data.message`). There is no progress percentage, step counter, or estimated time remaining.
- **Current UX:** Pulsing dot + text like "Analyzing market size..." for 45-60 seconds
- **Problem:** 45-60 seconds feels long with no clear progress. Users may think it's stuck.
- **Recommendation:** Add a stepped progress bar (e.g., 1/5 Market, 2/5 Team, 3/5 Product, 4/5 Revenue, 5/5 Report) based on SSE status messages. Show estimated time: "~30 seconds remaining"
- **Estimated effort:** 1 person-week

### FP-4: No guided "what to do next" after results [SEVERITY: High] [STATUS: Open]
- **Evidence:** After SVI analysis completes, user sees SVIResultsPanel and RndResultsPanel. There are no prominent CTAs for next steps. The user has to discover evidence upload, tools, and dashboard on their own.
- **Problem:** Users get their score and leave. No activation path to evidence upload (currently ~5% rate).
- **Recommendation:** Add 3 large action cards below results: (1) "Upload Evidence to boost +10-20 pts" (2) "Build your Cap Table" (3) "Share your Score". See UX Improvement Proposal 2.
- **Estimated effort:** 1 person-week

### FP-5: Onboarding wizard does not reconnect with anonymous SVI analysis [SEVERITY: Medium] [STATUS: Open]
- **Evidence:** If a user runs an anonymous SVI analysis, then signs up, the onboarding wizard starts fresh (Step 1: name, Step 2: industry, Step 3: new idea). Their previous analysis result is not linked.
- **Problem:** User re-enters information they already provided. Feels redundant.
- **Recommendation:** Detect if the newly-signed-up user's email matches a prior `svi_analyses` record. If so, skip the wizard and redirect to `/dashboard/svi` with their existing analysis pre-loaded.
- **Estimated effort:** 0.5 person-weeks

### FP-6: No social proof or trust signals near the search bar [SEVERITY: Low] [STATUS: Open]
- **Evidence:** The SVI search textarea sits between hero content and the results area. There are no "X founders analyzed" counters, testimonial quotes, or trust badges near the input.
- **Recommendation:** Add a line below the search bar: "Join 150+ founders who've analyzed their startup" (dynamic count from DB). Low effort, high psychological impact.
- **Estimated effort:** 0.5 person-weeks

### FP-7: Voice input discovery is poor [SEVERITY: Low] [STATUS: Open]
- **Evidence:** Mic button exists in the UI, but `svi_voice_input` event frequency is unknown (analytics gap). Button is likely overlooked.
- **Recommendation:** Defer. Fix analytics first (#2 in backlog), measure usage, then decide if worth improving.

---

## Conversion Funnel (Estimated Rates)

Based on CRO goals doc estimates and code-level analysis:

```
Landing page visitors:      100%
  |
  v  (~5% conversion -- CRO current estimate)
SVI form started:           ~5%
  |
  v  (~70% completion -- estimated, unmeasured for organic)
SVI submitted:              ~3.5%
  |
  v  (~29% after auto-scroll fix, was ~71% drop-off)
Results viewed:             ~2.5%  (was ~1.0% before fix)
  |
  v  (~20% conversion -- CRO estimate)
Signup (email -> account):  ~0.5%
  |
  v  (~5% estimated)
Evidence uploaded:           ~0.025%
  |
  v  (~2% estimated)
Paid conversion:             ~0.0005%
```

**Key observation:** The funnel is extremely leaky at the top. Improving visitor-to-SVI-start conversion from 5% to 10% (CRO Q3 target) would double all downstream numbers.

---

## Recommended Improvements (Ordered by Impact)

### 1. Post-analysis action cards with SVI-boost framing
- Show 3 large CTAs immediately after results
- Frame in terms of SVI improvement: "Upload your pitch deck (+10-20 pts)"
- **Target metric:** Evidence upload rate from 5% to 20% (CPO Q3 KR)
- **Effort:** 1 week
- **Backlog:** #9

### 2. Stepped progress bar during R&D analysis
- Replace single-line RndStatusBar with 5-step progress indicator
- Show estimated time remaining based on median analysis duration
- **Target metric:** Reduce analysis-phase abandonment (currently unmeasured)
- **Effort:** 1 week
- **Backlog:** New (score: R=10, I=1, C=0.8, E=1 = 8.0, would rank #4)

### 3. Link anonymous analysis to new signups
- On signup, check if email matches existing svi_analyses record
- If match found, skip onboarding wizard, go straight to dashboard with data
- **Target metric:** Reduce onboarding abandonment, improve time-to-value by ~40s
- **Effort:** 0.5 weeks
- **Backlog:** New (score: R=6, I=1, C=0.8, E=0.5 = 9.6, would rank #3)

### 4. Social proof counter near search bar
- Dynamic "X startups analyzed" counter below the SVI textarea
- Pull count from svi_analyses table (or cache in KV)
- **Target metric:** Visitor-to-SVI-start conversion improvement
- **Effort:** 0.5 weeks
- **Backlog:** New (score: R=10, I=0.5, C=0.5, E=0.5 = 5.0)

### 5. A/B test email-before-analysis vs email-after-preview
- Variant A (current): email required before submit
- Variant B: submit without email, show preview results, require email for full report + save
- **Target metric:** SVI form submission rate
- **Effort:** 2 weeks (significant front-end + API changes)
- **Backlog:** #23 (A/B framework, then this test)

---

## Metrics to Track

| Metric | Current State | Source | Target (Q3 2026) |
|--------|--------------|--------|-------------------|
| Time from landing to first SVI analysis | ~110s (estimated) | Custom event timestamps | <90s |
| Time from analysis to first evidence upload | Unknown | Not tracked | <24 hours |
| Time from signup to first paid action | Unknown | Not tracked | <7 days |
| Onboarding wizard completion rate | Unknown | Not tracked | 80%+ |
| SVI form start rate (organic typing) | Unknown | svi_form_started event not firing for organic | 10% of visitors |
| Results viewed rate (post-auto-scroll) | Unknown (was ~29%) | Need svi_results_viewed event | 90% of submissions |
| Post-results CTA click rate | N/A (no CTAs exist) | New event needed | 30% of viewers |
| Evidence upload rate | ~5% (CRO estimate) | evidence_uploaded event | 20% |
| Signup-to-paid conversion | ~2% (CRO estimate) | checkout_completed (not firing) | 5% |

### Proposed Analytics Events to Add

1. `svi_form_started` -- on organic textarea focus (currently only fires for "example" method)
2. `svi_results_viewed` -- when results panel scrolls into viewport (IntersectionObserver)
3. `svi_results_cta_clicked` -- when post-analysis action card is clicked (after #9 ships)
4. `onboarding_step_completed` -- per wizard step (0, 1, 2)
5. `onboarding_completed` -- when wizard submits successfully
6. `onboarding_skipped` -- when existing analysis detected and wizard bypassed
7. `time_to_first_value` -- computed metric: landing timestamp to results-viewed timestamp

---

## Appendix: Code References

- Anonymous SVI flow: `web/src/components/svi/svi-entrance.tsx` (SVIEntrance component)
- Auto-scroll fix: Lines ~406-411 in svi-entrance.tsx (queueMicrotask + scrollIntoView)
- R&D progress: `web/src/components/svi/rnd-status-bar.tsx` (single-line status)
- Onboarding wizard: `web/src/app/onboarding/onboarding-wizard.tsx` (3-step wizard)
- SVI dashboard: `web/src/app/dashboard/svi/page.tsx` (authenticated view)
- Evidence vault: `web/src/app/workspace/evidence/page.tsx` (evidence upload)
- Free-analysis gate: localStorage `blockid_svi_free_used` + server-side `/api/svi/check-gate`
