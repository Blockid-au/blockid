# Production Deployment: v3.6.9 Revenue Forecast Builder

**Deployment Window:** Friday, August 23, 2026 (2–4 AM AU time)  
**Version:** v3.6.9  
**Feature:** Revenue Forecast Builder (36-month projections, CSV export)  
**Rollback Plan:** Available (revert to v3.6.8)

---

## PRE-DEPLOYMENT (Thursday Evening)

### 1. Final Code Review & Quality Gates

```bash
# Navigate to blockid.au
cd /home/dovanlong/blockid.au/web

# Step 1: TypeScript compilation (must pass)
npx tsc --noEmit
# Expected: No errors

# Step 2: ESLint (must pass)
npx eslint src/lib/forecast-builder* src/app/api/financial src/app/\(app\)/\(founder\)/workspace/financial-forecast --max-warnings=0
# Expected: No errors, no warnings

# Step 3: Unit tests (must pass)
npm test -- forecast-builder.test.ts
# Expected: 48/48 passing, >70% coverage

# Step 4: Migration test (locally)
npx supabase migration up
# Expected: Tables created successfully
```

**Sign-off:** ________ (Engineering Lead) Date: ________

### 2. Staging Deployment & Smoke Test

```bash
# Deploy to staging
git checkout staging
git merge feature/revenue-forecast
git push deploy staging

# Wait 3–5 minutes for deployment to complete
# Then run smoke tests...
```

**Staging Smoke Tests (Thursday 8 PM AU):**

#### Test 1: Bootstrap Forecast (Pre-Revenue)
```
1. Login to staging: https://staging.blockid.au
2. Navigate: Workspace → Financial Forecast → New Forecast
3. Enter:
   - Name: "Bootstrap Test"
   - ARR: 0
   - Growth: 8%
   - Churn: 2%
4. Click Next
5. Enter:
   - COGS: 25%
   - OpEx: $60,000
   - RDTI: Yes
6. Click Next → Select "Base" → Click Next
7. Review table → Click "Save Forecast"
8. Expected: Results page loads, shows "Year 1 Revenue", 36-month table visible
9. Click "Export CSV" → Verify file downloads (>5KB)
```

**Result:** ✅ Pass / ❌ Fail

#### Test 2: Series A Forecast ($50K MRR)
```
1. Create new forecast
   - Name: "Series A Bull"
   - ARR: $600,000
   - Growth: 12%
   - Churn: 1.5%
2. Cost: COGS 20%, OpEx $120K, RDTI No
3. Scenario: Bull
4. Expected: Year 3 revenue >$5M
5. Switch tabs: Projection → Yearly → Metrics
6. Expected: All tabs load, tables render correctly
```

**Result:** ✅ Pass / ❌ Fail

#### Test 3: Performance Check
```
1. Create forecast with default values
2. Measure wizard load time (should be <500ms)
3. Measure save time (should be <2s)
4. Open browser DevTools Console → No errors expected
5. Check Network tab: API calls <200ms
```

**Result:** ✅ Pass / ❌ Fail

#### Test 4: Regression Check (Existing Features)
```
1. Navigate to SVI Dashboard → Verify loads (no broken links)
2. Go to Investor Pack section → Verify works (no new errors)
3. Check fundraise section → Verify unchanged
4. Test metrics page → Verify no regressions
```

**Result:** ✅ Pass / ❌ Fail

**Staging Status:** ✅ All Pass / ❌ Blocker Found

If any test **FAILS**:
- Check error logs (Sentry/DataDog)
- Identify root cause
- **DO NOT proceed to production**
- Fix issue and re-test
- Document in incident log

---

## PRODUCTION DEPLOYMENT (Friday 2–4 AM AU)

### Pre-Flight Checklist (30 min before deployment)

- [ ] Staging smoke tests all passed ✅
- [ ] Error logs reviewed (no surprises)
- [ ] Database backup verified (Supabase auto-backup enabled)
- [ ] Rollback script ready:
  ```bash
  git reset --hard v3.6.8
  git push deploy production -f
  ```
- [ ] Team notified in Slack #deployments
- [ ] On-call engineer ready (have phone nearby)

### Deploy to Production

```bash
# Step 1: Switch to main branch
cd /home/dovanlong/blockid.au
git checkout main

# Step 2: Merge feature branch
git merge feature/revenue-forecast

# Step 3: Create version tag
git tag v3.6.9

# Step 4: Push to origin
git push origin main v3.6.9

# Step 5: Deploy to production
# This triggers CI/CD pipeline
git push deploy production

# Expected output:
# - Build started (5 min)
# - Tests running (5 min)
# - Database migrations (1–2 min)
# - App deployment (3–5 min)
# - Health check (1 min)
# - TOTAL: ~15–20 min
```

**Deployment Status:** 
- [ ] Build passed
- [ ] Tests passed (11/11 gates)
- [ ] Database migrations completed
- [ ] App deployed
- [ ] Health check OK
- [ ] Deployment complete ✅

---

## POST-DEPLOYMENT VALIDATION (First 30 Minutes)

### Immediate Checks (Min 0–5)

```bash
# 1. Health check
curl -s https://blockid.au/api/health | jq .
# Expected: { "status": "ok" }

# 2. App loads
curl -s -I https://blockid.au
# Expected: HTTP 200

# 3. Database connectivity
# (Check Supabase dashboard)
# Expected: No connection errors in logs
```

### Smoke Tests on Production (Min 5–15)

**Test 1: Create Forecast**
```
1. Log in to https://blockid.au (use test account)
2. Navigate: Workspace → Financial Forecast
3. Click "New Forecast"
4. Fill: Name="Prod Test", ARR=50K, Growth=8%, Churn=2%
5. Complete wizard (all 4 steps)
6. Expected: Results page loads without errors
7. Verify: 36-month table visible, metrics show
8. Export CSV: Verify file downloads
```

**Status:** ✅ Pass / ❌ Fail — Error log: _________

**Test 2: List Forecasts**
```
1. Go back to forecast list
2. Expected: Newly created forecast appears
3. Click to open: Results page loads correctly
```

**Status:** ✅ Pass / ❌ Fail

**Test 3: Error Handling**
```
1. Try to create forecast with invalid data (negative ARR)
2. Expected: Validation error message displays
3. Fix and resubmit: Should succeed
```

**Status:** ✅ Pass / ❌ Fail

### Error Log Review (Min 10–15)

**Sentry / DataDog Checks:**
```
1. Check error rate past 10 minutes
   Expected: <0.1% error rate

2. Check specific errors:
   - No 500 errors on /api/financial/*
   - No TypeScript errors
   - No database connection errors

3. Check API latency:
   - POST /api/financial/forecast/generate: p95 <2s
   - POST /api/financial/forecast/save: p95 <2s
   - CSV export: p95 <3s
```

**Error Summary:**
- Total errors (past 10 min): _______
- Critical errors: _______ (should be 0)
- Action: ✅ Proceed / ❌ Rollback

### SVI Dashboard Check (Min 15–20)

```
1. Navigate to SVI Dashboard (for test founder)
2. Expected: No broken links, all sections load
3. Verify: FIN dimension placeholder present (will populate Week 5)
4. Create a test startup, check SVI report generates
```

**Status:** ✅ Pass / ❌ Fail

### Investor Pack Check (Min 20–25)

```
1. Go to Investor Pack section
2. Expected: PDF exports still work (no regressions)
3. Open PDF: Verify no "Revenue Forecast" chapter yet
   (Will be added Week 4)
```

**Status:** ✅ Pass / ❌ Fail

---

## ROLLBACK PROCEDURE (If Critical Issues)

**Trigger rollback if:**
- Error rate >0.5% for >2 min
- API latency p95 >5s
- Database connection errors
- RLS policy failing (data leakage)
- Any 500 errors on /api/financial/*

**Execute rollback:**
```bash
cd /home/dovanlong/blockid.au
git reset --hard v3.6.8
git push deploy production -f

# Wait 5–10 min for revert
# Verify with smoke tests

# Post-incident:
# 1. Create incident in Slack #incidents
# 2. Notify team
# 3. Schedule post-mortem
# 4. Plan re-deploy for next Friday
```

**Rollback Status:** ✅ Proceeded / ❌ Rolled back (reason: _______)

---

## 24-HOUR MONITORING (After Deployment)

### Hour 1–4 (Friday 2–6 AM AU)
- Check every 30 min: Error rate, API latency, database health
- No issues? Continue monitoring

### Hour 4–24 (Friday 6 AM – Sat 2 AM AU)
- Check every 2 hours: Error rate, adoption metrics, performance
- Expected metrics:
  - Error rate: <0.1%
  - API latency p95: <500ms
  - Wizard completion rate: 30%+ (in first 24h)
  - CSV exports: >5 downloads
  - Founder adoption: 20%+ active

### Metrics Dashboard (Check Sunday Morning)

```sql
-- Forecast adoption
SELECT COUNT(DISTINCT account_id) as unique_founders,
       COUNT(*) as total_forecasts
FROM financial_models
WHERE created_at > NOW() - INTERVAL '24 hours';

-- Error tracking
SELECT COUNT(*) as error_count,
       MAX(EXTRACT(EPOCH FROM created_at)) as latest_error
FROM api_errors
WHERE route LIKE '/api/financial%'
  AND created_at > NOW() - INTERVAL '24 hours';

-- Performance baseline
SELECT AVG(response_time_ms) as avg_latency,
       PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms) as p95_latency
FROM api_logs
WHERE route LIKE '/api/financial%'
  AND created_at > NOW() - INTERVAL '24 hours';
```

**24-Hour Results:**
- Unique founders: ________
- Total forecasts: ________
- Error count: ________
- Avg latency: ________ms
- p95 latency: ________ms

**Assessment:** ✅ Healthy / ⚠️ Watch / ❌ Issue

---

## SUCCESS CRITERIA (End of 24 Hours)

✅ **Deployment:**
- Version v3.6.9 live in production
- All CI gates passed (11/11)
- Zero regressions in existing features

✅ **Functionality:**
- Founders can create forecasts end-to-end
- 36-month projection table renders (all 36 rows)
- CSV export works (11 columns)
- Back button preserves form state
- Form validation displays errors correctly

✅ **Performance:**
- Wizard generation <2s p95
- API latency <500ms p95
- CSV export <3s
- Error rate <0.1%

✅ **Adoption:**
- >20% of active founders viewed feature
- >15% completed at least one forecast
- Positive feedback (if survey available)

✅ **Quality:**
- SVI dashboard unaffected
- Investor pack export working
- No data leakage (RLS verified)
- No console errors

---

## SIGN-OFF

**Deployment Lead:** _________________ Date: _________ Time: _________

**Post-Deployment Review (24h):** _________________ Date: _________ Time: _________

**Status:** ✅ Successful / ⚠️ Monitoring / ❌ Rolled back

**Issues Found:** ___________________________________________________________________

**Resolution:** ___________________________________________________________________

**Next Steps:** ___________________________________________________________________

---

## COMMUNICATION PLAN

**Slack Notifications:**
1. **Before Deploy (2:00 AM AU):** "Deploying v3.6.9 Revenue Forecast in 5 min. Monitoring active."
2. **Deploy Complete (2:30 AM AU):** "✅ v3.6.9 deployed. Smoke tests running..."
3. **All Clear (3:00 AM AU):** "✅ v3.6.9 live & validated. No issues. Feature available to all founders."
4. **24-Hour Update (Saturday 2:00 AM AU):** "✅ 24h monitoring complete. Metrics on track. Next: Week 2 Exit Strategy."

**Email Announcement (Friday 9 AM AU):**
- Subject: "Revenue Forecast Builder is live 🚀"
- Content: Feature overview, quick start link, feedback form
- Recipients: All BlockID founders + team

**Help Docs:**
- Add to `/help/financial-forecast` (quick start guide)
- Add FAQ section
- Add tutorial video link (if available)

---

## WEEK 1 COMPLETE ✅

**After 24h validation passes:**
- ✅ v3.6.9 Revenue Forecast live
- ✅ Founder adoption >20%
- ✅ Error rate <0.1%
- ✅ **Ready to proceed to Week 2: Exit Strategy Backend**

**Next Phase Starts:** Monday, August 26, 2026

---

**Status:** READY FOR PRODUCTION DEPLOYMENT  
**Approval Required:** Engineering Lead + DevOps  
**Questions:** Contact #deployments on Slack
