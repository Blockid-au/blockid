# Platform Audit — BlockID.au (22 May 2026)

## Current State Summary

### Pages Status
| Category | Count | Status |
|----------|-------|--------|
| Public pages | 11 | ✅ All 200 OK |
| Free tools | 10 | ✅ All 200 OK |
| Workspace pages | 24 | ✅ Auth-gated (redirect to login if no session) |
| API endpoints | Tested 3 | ✅ Auth working, credits + evidence require session |
| Admin pages | 13 | ✅ Admin-gated |

### Performance
| Page | Response Time | Assessment |
|------|--------------|------------|
| Homepage | 112ms | ✅ Good |
| Login | 121ms | ✅ Good |
| Score | 87ms | ✅ Excellent |
| Pricing | 110ms | ✅ Good |
| API auth/me | 84ms | ✅ Excellent |

### Auth System
- ✅ Google OAuth (existing)
- ✅ Magic Link (existing)
- ✅ Email + Password (NEW — just deployed)
- ✅ Session management (90-day, HttpOnly, SameSite=Lax)
- ✅ 8 test accounts verified working

### Features Working
- ✅ SVI analysis via SSE streaming (step-by-step status)
- ✅ Deep tech audit (security, performance, stack)
- ✅ GitHub repo audit (architecture, CI/CD, testing)
- ✅ Evidence vault (upload + OAuth connectors)
- ✅ Credit system (balance, spending, purchasing)
- ✅ Modular section picker (per-section × depth)
- ✅ AI thinking status component (ChatGPT-style)
- ✅ PDF report generation with AU compliance
- ✅ Email delivery with mentoring tone
- ✅ 10 free tools all accessible

---

## Issues Found

### P0 — Critical (Blocks User Journey)

| # | Issue | Impact | Fix |
|---|-------|--------|-----|
| 1 | **`/workspace` returns 404** — no index page | Users typing blockid.au/workspace get 404 | Create workspace/page.tsx that redirects to /dashboard or shows workspace home |
| 2 | **`/tools` returns 404** — no tools index page | Users looking for tools get 404 | Create tools/page.tsx listing all 10 tools |
| 3 | **Credits API returns 401 with cookie** | API endpoints need consistent session handling | Check credits route auth pattern vs auth/me |
| 4 | **No clear CTA after free SVI analysis** | Users see result but don't know next step | Add "Save Report" + "Sign Up to Track" + "Unlock Full Report" CTAs after preview |

### P1 — Important (Hurts Conversion)

| # | Issue | Impact | Fix |
|---|-------|--------|-----|
| 5 | **No onboarding flow for new users** | New users land on empty dashboard, don't know what to do | Create 3-step onboarding: Profile → First SVI → Evidence upload |
| 6 | **Score page (/score) vs SVI entrance disconnected** | User must know to go to /score; not obvious from dashboard | Add "Run New Analysis" button on dashboard |
| 7 | **Empty dashboard state not motivating** | New user sees empty charts/lists | Add "Welcome, [name]! Here's your startup journey" with guided first steps |
| 8 | **Evidence vault empty state** | Users don't know what to upload | Add "Quick wins" suggestions: "Upload pitch deck (+8pts)", "Connect GitHub (+10pts)" |
| 9 | **No password reset flow** | Users who forget password have no recovery path | Add "Forgot password?" link → magic link to set new password |

### P2 — Nice to Have (Improves Experience)

| # | Issue | Impact | Fix |
|---|-------|--------|-----|
| 10 | **No tools index page** | 10 great tools but no hub to discover them | Create /tools with cards for each tool |
| 11 | **Dashboard SVI tab not linked from main nav** | Users must navigate to find /dashboard/svi | Add "SVI" tab in workspace navigation |
| 12 | **No mobile-specific optimizations** | Mobile users get desktop layout scaled down | Audit + optimize key mobile flows |
| 13 | **No dark mode** | Some users prefer dark mode | Add theme toggle |
| 14 | **Pricing page doesn't show section-level pricing** | Users see plan pricing but not modular pricing | Add "Pay per section" tab on pricing page |

---

## Recommended Upgrade Path

### Sprint 1 (This Week) — Fix P0 Issues

1. **Create `/workspace` index page** → redirect to dashboard or show workspace home
2. **Create `/tools` index page** → card grid of all 10 tools with descriptions
3. **Fix credits API auth** → ensure consistent cookie handling
4. **Add post-analysis CTAs** → "Save Report", "Sign Up", "Unlock Full Report"

### Sprint 2 (Next Week) — Onboarding + Empty States

5. **3-step onboarding wizard** for new users:
   - Step 1: "Tell us about your startup" (name, stage, URL)
   - Step 2: "Get your first SVI score" (auto-trigger from onboarding data)
   - Step 3: "Boost your score" (upload evidence)
6. **Dashboard empty state** → guided first actions with progress indicator
7. **Evidence vault empty state** → "Quick wins" suggestions with expected point gains
8. **"Run New Analysis" button** on dashboard

### Sprint 3 (Following Week) — Conversion Optimization

9. **Password reset flow** (uses existing magic link infrastructure)
10. **Section-level pricing on pricing page** → show modular pricing
11. **Mobile responsiveness audit** → fix top 5 mobile issues
12. **Post-free-report upsell flow** → section picker appears after preview

### Sprint 4 — Polish

13. **Tools index page** with search/filter
14. **Dark mode** toggle
15. **SVI comparison** → let users compare their score to stage benchmarks

---

## Agent Assignments for Upgrades

| Task | Primary | Support | Sprint |
|------|---------|---------|--------|
| /workspace index | CTO | CPO | 1 |
| /tools index | CTO + CPO | CMO | 1 |
| Credits API fix | CTO | — | 1 |
| Post-analysis CTAs | CPO + CRO | CTO | 1 |
| Onboarding wizard | CPO + CTO | CDO | 2 |
| Empty states | CPO + CMO | CTO | 2 |
| Password reset | CTO | — | 3 |
| Mobile audit | CPO | CTO | 3 |
| Pricing page update | CFO + CPO | CRO | 3 |
| Dark mode | CTO | CPO | 4 |