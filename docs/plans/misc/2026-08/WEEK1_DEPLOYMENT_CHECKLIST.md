# Week 1 Deployment Checklist — v3.6.9 (Revenue Forecast Builder)

**Target Ship Date:** Friday, August 23, 2026 (2–4 AM AU time)  
**Current Status:** ✅ Backend complete | ✅ Frontend complete | ⏳ Testing phase  
**Owner:** Engineering team

---

## PRE-DEPLOYMENT VALIDATION (Wednesday–Thursday)

### Code Quality Gates

- [ ] **TypeScript Compilation**
  ```bash
  cd /home/dovanlong/blockid.au/web
  npx tsc --noEmit
  ```
  Expected: Zero errors

- [ ] **ESLint**
  ```bash
  npx eslint src/lib/forecast-builder* src/app/api/financial src/app/\(app\)/\(founder\)/workspace/financial-forecast --max-warnings=0
  ```
  Expected: Zero warnings

- [ ] **Unit Tests**
  ```bash
  npm test -- forecast-builder.test.ts --coverage
  ```
  Expected: 48/48 passing, >70% coverage

### Database Validation (Staging)

- [ ] **Migration Test**
  ```bash
  cd /home/dovanlong/blockid.au/web
  npx supabase migration up  # Test locally first
  ```
  Expected: `financial_models`, `forecast_scenarios`, `financial_model_audit` tables created

- [ ] **RLS Policies Enabled**
  ```sql
  SELECT tablename, policyname FROM pg_policies 
  WHERE tablename IN ('financial_models', 'forecast_scenarios', 'financial_model_audit');
  ```
  Expected: 5–6 RLS policies per table

- [ ] **Indexes Created**
  ```sql
  SELECT schemaname, tablename, indexname FROM pg_indexes 
  WHERE tablename IN ('financial_models', 'forecast_scenarios', 'financial_model_audit');
  ```
  Expected: Performance indexes on project_id, created_at

---

## STAGING DEPLOYMENT (Thursday Evening)

### Deploy to Staging Environment

1. **Push Branch & Create PR**
   ```bash
   git add -A
   git commit -m "feat(financial-forecast): Revenue forecast builder with 36-month projections (v3.6.9)"
   git push origin feature/financial-forecast
   ```

2. **Run CI Pipeline**
   - Watch GitHub Actions for all 11 gates to pass:
     - [ ] Build (webpack)
     - [ ] Lint (ESLint)
     - [ ] Type check (tsc)
     - [ ] Unit tests (48 passing)
     - [ ] Integration tests
     - [ ] E2E tests (Playwright)
     - [ ] Database migrations
     - [ ] Coverage report
     - [ ] Dependency audit
     - [ ] Performance check
     - [ ] Security scan
   
   Expected: All gates ✅ in <15 min

3. **Deploy Staging**
   ```bash
   git checkout staging
   git merge feature/financial-forecast
   git push deploy staging
   ```
   Expected: Deployment complete in <5 min

---

## STAGING SMOKE TESTS (Thursday Night, 8 PM AU)

### Scenario 1: Pre-Revenue Bootstrap
- [ ] Navigate to `/workspace/financial-forecast`
- [ ] Click "New Forecast"
- [ ] Fill: Name="Bootstrap", ARR=0, Growth=8%, Churn=2%
- [ ] Next → COGS=25%, OpEx=60K, RDTI=Yes → Base scenario → Save
- [ ] **Verify:** Results page loads, 12M revenue shows, 36-month table visible
- [ ] **Verify:** CSV export downloads, file size >5KB
- [ ] **Verify:** Can navigate back to list, forecast appears

### Scenario 2: $50K MRR Series A
- [ ] Create forecast: Name="Series A", ARR=600K, Growth=12%, Churn=1.5%
- [ ] Cost: COGS=20%, OpEx=120K, RDTI=No → Bull scenario
- [ ] **Verify:** Year 3 revenue projects >$5M
- [ ] **Verify:** Tabs switch (Projection → Yearly → Metrics)
- [ ] **Verify:** All 36 months render in table

### Scenario 3: Error Handling
- [ ] Try to submit with invalid data (negative ARR, >100% growth)
- [ ] **Verify:** Error message displays, form remains editable
- [ ] Fix inputs and retry
- [ ] **Verify:** Submission succeeds

### Scenario 4: Performance
- [ ] Create forecast and measure load time
- [ ] **Target:** Wizard load <500ms, projection generation <2s
- [ ] **Target:** CSV export <3s
- [ ] Check browser console for errors (should be empty)

### Scenario 5: Mobile (Optional)
- [ ] Open wizard in mobile view (375px width)
- [ ] **Verify:** Inputs are accessible, no horizontal scroll
- [ ] **Verify:** Buttons clickable without zooming

### Monitoring (24 Hours)
- [ ] Error rate <0.1% (check DataDog/Sentry)
- [ ] API latency p95 <500ms
- [ ] No regressions in existing features (check smoke tests for fundraise, metrics, etc.)
- [ ] SVI scoring still working (create test startup, check SVI report)

---

## PRODUCTION DEPLOYMENT (Friday, 2–4 AM AU)

### Pre-Flight Checks
- [ ] All staging smoke tests passed ✅
- [ ] Error logs reviewed, no surprises
- [ ] Slack notification sent to team: "Deploying v3.6.9 in 30 min"
- [ ] Database backup created (Supabase auto-backup)
- [ ] Rollback plan ready (git revert + deploy)

### Deploy Production
```bash
git checkout main
git merge feature/financial-forecast
git tag v3.6.9
git push origin main v3.6.9
git push deploy production  # Triggers CI → production deploy
```

Expected flow:
1. CI runs all 11 gates (5–10 min)
2. Build artifact created
3. Database migrations run (1–2 min)
4. App deployed to ECS/Heroku (3–5 min)
5. Health check passes
6. Deployment complete

### Post-Deployment Validation (First 30 Min)

- [ ] **Health Check**
  ```bash
  curl -s https://blockid.au/api/health | jq .
  ```
  Expected: `"status": "ok"`

- [ ] **Smoke Test: Forecast Generation**
  - Log in as real founder
  - Navigate to `/workspace/financial-forecast`
  - Create test forecast (ARR=100K, Growth=8%, Base scenario)
  - Verify results display
  - **Error rate should remain <0.1%**

- [ ] **Error Logs (Sentry/DataDog)**
  - Watch for new errors in past 30 min
  - No 500 errors related to `/api/financial/forecast`
  - No TypeScript errors in console

- [ ] **Database Queries**
  - Verify `financial_models` table has rows (test forecasts inserted)
  - Check RLS policies are enforced (user cannot see other user's forecasts)

- [ ] **SVI Dashboard**
  - Verify SVI report still generates (no broken dependencies)
  - FIN dimension should be empty initially (will populate in Week 5)

---

## MONITORING & ALERTS (48 Hours Post-Launch)

### Key Metrics to Watch

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Error rate | <0.1% | >0.5% |
| API latency (p95) | <500ms | >1000ms |
| Wizard completion rate | >40% | <25% |
| Forecast generation time | <2s | >5s |
| CSV export time | <3s | >10s |
| Database query latency | <100ms | >500ms |

### Sample Queries for Monitoring

**Adoption (founders creating forecasts):**
```sql
SELECT COUNT(DISTINCT account_id) as founders, 
       COUNT(*) as forecasts 
FROM financial_models 
WHERE created_at > NOW() - INTERVAL '24 hours';
```

**Errors by route:**
```sql
SELECT route, error_count, avg_latency_ms 
FROM api_logs 
WHERE route LIKE '/api/financial%' 
  AND created_at > NOW() - INTERVAL '1 hour' 
ORDER BY error_count DESC;
```

**Performance baseline:**
```sql
SELECT 
  DATE_TRUNC('5 min', created_at) as time_bucket,
  AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) * 1000 as avg_compute_ms,
  MAX(EXTRACT(EPOCH FROM (updated_at - created_at))) * 1000 as max_compute_ms
FROM financial_models 
WHERE created_at > NOW() - INTERVAL '6 hours'
GROUP BY time_bucket
ORDER BY time_bucket DESC;
```

---

## ROLLBACK PLAN (If Issues)

**Trigger rollback if:**
- Error rate >1% for >5 min
- API latency p95 >2s for >5 min
- Database queries timing out
- RLS policies failing (data leakage)

**Rollback procedure:**
```bash
# Option 1: Revert to v3.6.8 (3 min)
git reset --hard v3.6.8
git push deploy production -f

# Option 2: Keep deployed, disable via feature flag (immediate)
# In admin panel: Set FEATURE_FINANCIAL_FORECAST = false
```

**Post-rollback:**
- Notify team in Slack
- Create incident post-mortem
- Fix issues and re-deploy Friday next week

---

## SUCCESS CRITERIA (End of Week 1)

✅ **Deployment:**
- v3.6.9 shipped to production without errors
- All 11 CI gates passing

✅ **Functionality:**
- Wizard works end-to-end (create → view → export)
- 36-month projection table renders (all 36 rows)
- CSV export downloads (11 columns)
- Back button preserves form state

✅ **Adoption:**
- >40% of founders interact with forecast feature within 24 hours
- >25% complete at least one forecast by EOW

✅ **Performance:**
- Wizard generation <2s p95
- API latency <500ms p95
- Error rate <0.1%

✅ **Quality:**
- Zero regressions in existing features
- SVI scoring unaffected
- Investor pack export working

---

## Sign-Off Checklist

- [ ] **Engineering Lead:** Code reviewed, CI gates passing
- [ ] **QA Lead:** Staging smoke tests all ✅
- [ ] **DevOps:** Production deployment procedure ready, rollback plan tested
- [ ] **Product:** Launch announcement prepared
- [ ] **Support:** Help docs updated, FAQ prepared

**Expected Timestamp:** v3.6.9 deployed by Friday, August 23, 2026 ~ 4 AM AU  
**Team Notification:** Slack #deployments channel + @team ping  
**Go-Live Window:** Friday 4 AM – EOD Friday, with 48-hour monitoring active

---

## CONTACTS & ESCALATION

- **Engineering Lead:** [TBD]
- **DevOps On-Call:** [TBD]
- **Product Manager:** [TBD]
- **Escalation:** #incidents Slack channel
