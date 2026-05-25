# BlockID.au — Softlaunch Readiness Plan

## Mục tiêu: Softlaunch blockid.au cho early adopters (Founding 50)

Tất cả goals được tổ chức theo C-Level hierarchy: CEO → CTO/CPO/CMO/CFO/COO → sub-tasks.

---

## 1. CEO Level — Strategic Readiness

### 1.1 Product-Market Fit Checklist
- [ ] SVI analysis works end-to-end (input → score → report → share)
- [ ] Payment flow works (Free → Founding 50 → Growth)
- [ ] User can sign up, analyze, pay, and view results
- [ ] Landing page communicates value clearly
- [ ] Pricing page is accurate and transparent

### 1.2 Launch Materials
- [ ] Landing page reviewed (hero, CTA, social proof)
- [ ] Pricing page reviewed (plans, credit packs, FAQ)
- [ ] Terms of Service up to date
- [ ] Privacy Policy up to date
- [ ] Australian compliance (ABN, ASIC, no AFSL disclaimers)

---

## 2. CTO Level — Technical Readiness

### 2.1 Full QA/UAT (skill: qa-lead)
- [ ] Smoke test ALL 79 pages (200 status)
- [ ] Auth flows: register, login, magic link, Google OAuth, logout
- [ ] SVI analysis: text input, file upload, voice input, URL detection
- [ ] Progressive report: summaries auto-generate, per-section unlock, bundle
- [ ] Dashboard: /dashboard/svi shows analyses, /workspace/reports works
- [ ] Shareable link /s/[slug] loads and displays correctly
- [ ] Dark mode: no bg-white leaks on any page
- [ ] Mobile responsive: all pages render on 375px viewport
- [ ] Vietnamese locale: all translations display correctly

### 2.2 API Testing (skill: api-test)
- [ ] POST /api/svi — full analysis flow
- [ ] POST /api/svi/report-section — per-section generation
- [ ] GET /api/svi/report-estimate — cost preview
- [ ] POST /api/v1/analyze — partner API with API key auth
- [ ] POST /api/stripe/checkout — checkout session creation
- [ ] POST /api/stripe/webhook — webhook signature verification
- [ ] GET /api/auth/me — auth check
- [ ] Rate limiting works on all endpoints

### 2.3 Performance (skill: perf-audit)
- [ ] Homepage loads in <3s (LCP)
- [ ] API response times <500ms (except AI calls)
- [ ] AI calls complete within timeout (30s quick, 180s reports)
- [ ] No memory leaks in long-running containers
- [ ] Docker container stays healthy for 24h+

### 2.4 Security Audit (skill: security-audit)
- [ ] CSP headers correct (no unsafe-eval leaks)
- [ ] No secrets in client bundle (NEXT_PUBLIC_ only)
- [ ] Stripe webhook signature verification
- [ ] API key authentication works
- [ ] Rate limiting prevents abuse
- [ ] SQL injection protection (Supabase parameterized)
- [ ] XSS protection (React auto-escaping)
- [ ] CORS configured correctly
- [ ] No sensitive data in error responses

### 2.5 Operations (skill: deploy)
- [ ] Docker build succeeds consistently
- [ ] --env-file loads all 60+ vars
- [ ] Health check passes within 10s
- [ ] Container auto-restarts on crash
- [ ] Cloudflare CDN caching works
- [ ] SSL/TLS certificates valid
- [ ] Backup: Supabase daily backups enabled

---

## 3. CPO Level — Product Quality

### 3.1 User Journey Testing
- [ ] New visitor: lands on / → reads hero → enters idea → gets SVI score
- [ ] Score viewer: sees results → reads summaries → unlocks section (0.50 cr)
- [ ] Free user: 2 free credits → hits paywall → sees Founding 50 CTA
- [ ] Founding 50 buyer: pays A$49 → gets 50 credits → full access
- [ ] Returning user: logs in → My SVI Score → sees history → views old report
- [ ] Investor viewer: receives /s/[slug] link → views score → heat tracked

### 3.2 UI/UX Review (skill: ui-ux-pro-max)
- [ ] All CTAs are clear and actionable
- [ ] Credit costs shown BEFORE every charge
- [ ] Error messages are helpful (not "Network error")
- [ ] Loading states for all async operations
- [ ] Empty states for new users (no blank pages)
- [ ] Consistent dark mode across all pages

---

## 4. CFO Level — Revenue & Billing

### 4.1 Stripe Integration (skill: stripe-test)
- [ ] Founding 50 checkout (one-off A$49) → credits granted
- [ ] Growth monthly checkout (A$99/mo) → credits granted
- [ ] Growth annual checkout (A$950/yr) → credits granted
- [ ] Credit pack purchase → credits added
- [ ] Webhook handles: checkout.completed, subscription.deleted, invoice.paid
- [ ] Billing portal accessible
- [ ] Cancel subscription works
- [ ] Change plan works (upgrade/downgrade)
- [ ] Coupon validation + redemption

### 4.2 Credit System
- [ ] Free users get 2 credits on signup
- [ ] SVI analysis costs 0.50 credits
- [ ] Per-section unlock costs match pricing table
- [ ] Bundle discount = 30%
- [ ] Credit balance updates in real-time
- [ ] Low credit alert email sent when <1.0 credits

---

## 5. CMO Level — Growth Readiness

### 5.1 SEO (skill: seo-audit)
- [ ] Sitemap.xml has all public pages
- [ ] Robots.txt blocks /api/, /admin/, /workspace/
- [ ] All pages have unique <title> and <meta description>
- [ ] Structured data (JSON-LD) on homepage
- [ ] OG tags for social sharing
- [ ] Canonical URLs set

### 5.2 Analytics
- [ ] GA4 tracking events fire correctly
- [ ] GTM container loaded
- [ ] Key events tracked: svi_form_started, svi_analysis_complete, checkout_started

---

## 6. COO Level — Operations & Monitoring

### 6.1 Daily Admin Dashboard Email ← CRITICAL
- [ ] Daily email to admin@blockid.au at 8am AEST
- [ ] Content: new signups, analyses run, credits spent, revenue, page views
- [ ] Agent self-upgrade status (what was auto-improved)
- [ ] System health: container uptime, AI budget usage, error count
- [ ] Cron job: /api/cron/daily-admin-report

### 6.2 Monitoring
- [ ] Container health check runs every 30s
- [ ] Error logging to container stdout (docker logs)
- [ ] AI budget tracking ($100/mo cap)
- [ ] Cron jobs running on schedule

---

## Execution Plan

| Priority | Task | Agent/Skill | Estimated |
|----------|------|-------------|-----------|
| P0 | Daily admin email | cron + email | 30 min |
| P0 | Full QA smoke test | qa-lead | 20 min |
| P1 | Stripe payment test | stripe-test | 15 min |
| P1 | Security audit | security-audit | 15 min |
| P1 | SEO audit | seo-audit | 10 min |
| P2 | Performance audit | perf-audit | 10 min |
| P2 | UI/UX review | ui-ux-pro-max | 15 min |
| P2 | API endpoint tests | api-test | 15 min |