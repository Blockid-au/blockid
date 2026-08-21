# P0 Deployment Fixes — v3.6.9 (Before Friday)

**Required by:** Thursday, August 22, 2026 5 PM AU  
**Audit Score:** 82/100 (must reach 95/100 before deployment)  
**Blocker:** Cannot deploy Friday without these fixes

---

## P0 Item 1: Assign All Sign-Off Roles

**Current State:** All roles blank in `/DEPLOY_V369_PRODUCTION.md`

**Required Action:**
In the "SIGN-OFF" section, fill in actual names:

```markdown
## SIGN-OFF

**Deployment Lead:** [ASSIGN: Name/Title]
**QA Lead:** [ASSIGN: Name/Title]
**DevOps On-Call:** [ASSIGN: Name/Title + Phone]
**Product Manager:** [ASSIGN: Name/Title]
**Post-Deployment Review (24h):** [ASSIGN: Name/Title]

**Escalation Contacts:**
- On-Call Engineer: [Name/Phone]
- Engineering Lead: [Name/Slack Handle]
- Incident Slack: #incidents
```

**Who to assign:**
- Deployment Lead: Engineering lead who will execute git push
- QA Lead: QA engineer who will verify staging smoke tests
- DevOps On-Call: DevOps engineer monitoring first 4 hours + on-call for 24h
- Product Manager: Who announces launch + tracks metrics

**Deadline:** Tuesday, August 20 (3 days before deployment)

---

## P0 Item 2: Test Supabase Restore Procedure

**Current State:** "Auto-backup enabled" — untested

**Required Action:**
Thursday, August 22 (1 day before deployment):

```bash
# Step 1: Verify current backup in Supabase Dashboard
# Settings → Backups → Check last backup timestamp

# Step 2: Document restore time
# Open Supabase console and test restore from backup
# Measure: How long does restore take? (typical: 5–15 min)
# Document in /DEPLOY_V369_PRODUCTION.md:
#   "Supabase restore RTO: X minutes"

# Step 3: Verify data integrity post-restore
# Query tables: financial_models, forecast_scenarios, financial_model_audit
# Verify row counts match pre-backup

# Step 4: Document findings
# Add to deployment checklist:
#   "✓ Supabase restore tested (RTO: X min, verified X rows)"
```

**Success Criteria:**
- Restore procedure tested at least once
- RTO (recovery time objective) documented
- Data integrity verified
- Rollback time estimate known

**Deadline:** Thursday, August 22 (1 day before deployment)

---

## P0 Item 3: Define Feature Flag (If Using)

**Current State:** Rollback section mentions "disable via feature flag" but flag not defined

**Action Required:**
1. **Decide:** Do we need a feature flag to disable forecasts mid-deployment?
   - YES: Define flag name + admin panel location
   - NO: Remove feature flag reference from rollback procedure

2. **If YES, add to deployment checklist:**
```markdown
## Feature Flag Kill Switch

**Flag Name:** FEATURE_FINANCIAL_FORECAST (in Supabase admin panel)
**Admin Location:** https://blockid.au/admin/config
**Default Value (Pre-Deploy):** true

### To Disable Forecast (Emergency Only)
1. Go to https://blockid.au/admin/config
2. Find "FEATURE_FINANCIAL_FORECAST"
3. Set to false
4. Save
5. Effect: Immediate (no app restart needed)
6. Verify: Forecast page shows "Feature unavailable"
```

3. **If NO, simplify rollback:**
```markdown
## Rollback (Git Revert Only)
git reset --hard v3.6.8
git push deploy production -f
```

**Deadline:** Tuesday, August 20 (decision + implementation)

---

## P0 Item 4: Verify 2–4 AM AU Deployment Window

**Current State:** Assumes low traffic, not verified

**Required Action:**
Thursday, August 22, review production metrics:

```bash
# Check traffic during 2–4 AM AU for past 2 weeks
# Query: Average requests per minute, error rate, API latency
# Expected: Low traffic window (<100 req/min), <0.1% baseline error rate

# Use DataDog/Sentry dashboard:
# - Go to: Production metrics → Past 2 weeks
# - Filter: 02:00–04:00 AU time
# - Check: Request volume, errors, latency
# - Decision: Is 2–4 AM low-traffic? If not, shift window to quieter time
```

**Findings to Document:**
```markdown
## Deployment Window Analysis (Past 2 Weeks)

Time: 2–4 AM AU
- Average requests: X per minute
- Peak requests: X per minute
- Baseline error rate: X%
- Baseline latency p95: X ms

**Decision:** ✅ 2–4 AM is quiet / ⚠️ Shift to [NEW_TIME] (more quiet)
```

**Deadline:** Thursday, August 22

---

## Action Checklist (Copy & Complete)

### Tuesday, August 20
- [ ] Assign Deployment Lead (name + title)
- [ ] Assign QA Lead (name + title)
- [ ] Assign DevOps On-Call (name + phone)
- [ ] Assign Product Manager (name + title)
- [ ] Decide: Feature flag needed? (YES/NO)
- [ ] If YES: Define flag name + location
- [ ] Update `/DEPLOY_V369_PRODUCTION.md` with assignments + flag

### Wednesday, August 21
- [ ] Confirm all roles accepted assignment
- [ ] Confirm on-call DevOps available Friday 2–4 AM AU
- [ ] Confirm QA available Thursday evening (staging tests)

### Thursday, August 22
- [ ] Test Supabase restore (1–2 hours)
- [ ] Document restore RTO
- [ ] Verify data integrity post-restore
- [ ] Check 2–4 AM AU traffic metrics
- [ ] Decide: Proceed with 2–4 AM window or shift time?
- [ ] Update `/DEPLOY_V369_PRODUCTION.md` with restore RTO + window confirmation
- [ ] Final sign-off: All P0 items closed ✅

### Friday, August 23
- [ ] 1 hour before deploy: Confirm all teams ready
- [ ] Execute deployment (2:00 AM AU)
- [ ] Monitor (4 hours)
- [ ] Handoff to 24h watch rotation

---

## Audit Scores

**Current:** 82/100  
**Target:** 95/100 (deployment-ready)

**Scoring Breakdown:**
| Category | Score | P0 Items | P1 Items | P2 Items |
|----------|-------|---------|---------|---------|
| Pre-Deployment | 90/100 | ⚠️ Roles | — | — |
| Staging Testing | 95/100 | — | — | Mobile test |
| Production Procedure | 85/100 | ⚠️ Backup, Flag | Window | — |
| Monitoring | 90/100 | — | On-call roster | — |
| Communication | 95/100 | — | — | — |
| **Overall** | **82/100** | **4 items** | **3 items** | **2 items** |

**After P0 fixes:** Expected 93/100  
**After P1 fixes:** Expected 96/100 (deployment-ready)

---

## Sign-Off (After Fixes)

**Deployment Ready Verification (Thursday 5 PM AU):**

- [ ] All P0 items closed ✅
- [ ] Supabase restore tested ✅
- [ ] Roles assigned + confirmed ✅
- [ ] Feature flag defined (if needed) ✅
- [ ] Deployment window verified ✅
- [ ] Staging tests passed (4/4) ✅
- [ ] CI pipeline ready (11 gates configured) ✅

**Approval:** _________________ (Engineering Lead) Date: _________ Time: _________

**Status:** ✅ APPROVED FOR DEPLOYMENT (Friday 2–4 AM AU)

---

**These fixes must be complete by Thursday 5 PM AU to proceed with Friday deployment.**

**No exceptions. Deploy blocked if P0 items incomplete.**
