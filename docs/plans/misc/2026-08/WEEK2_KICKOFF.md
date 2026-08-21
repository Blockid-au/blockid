# Week 2 Kickoff — Exit Strategy Backend (Aug 25–31)

**Status:** ✅ Database schema ready | TypeScript types ready | Ready to build core helpers  
**Timeline:** Mon Aug 25 – Fri Aug 31, 2026  
**Effort:** 6 person-days (backend + testing)  
**Next Milestone:** Week 3 Frontend (Sep 1–7)

---

## What's Ready (Delivered Today)

### Database Layer ✅
**Migration:** `20260825_exit_scenarios.sql` (203 lines)

**3 Tables:**
1. **exit_scenarios** — Scenario metadata
   - 18 fields (scenario name, exit type, timeline, Series A/B assumptions, narrative)
   - 3 indexes (account_id, (account_id, name), updated_at)
   - UNIQUE constraint on (account_id, scenario_name)

2. **cap_table_projections** — Round-by-round cap table
   - 11 fields (round type, funding, valuations, stake percentages, share counts)
   - Index on (scenario_id, round_num)
   - UNIQUE constraint on (scenario_id, round_num)

3. **exit_readiness_assessments** — Readiness scores
   - 9 fields (4 dimension scores, overall score, band, gaps, narrative)
   - UNIQUE on exit_scenario_id

### RLS Policies ✅
- 5 policies per table (SELECT, INSERT, UPDATE, DELETE for auth users)
- Service role access enabled (for cron/agents)
- Cascade: Founder cannot see other founder's scenarios

### TypeScript Types ✅
**File:** `src/types/exit-strategy.ts` (120 lines)

**8 Interfaces:**
- `ExitScenario` — Scenario record
- `CapTableProjection` — Round snapshot
- `ExitReadinessAssessment` — Readiness scores
- `DilutionProgression` — Dilution evolution
- `FounderExitPayout` — Payout estimate (gross/CGT/net)
- `AcquirerProfile` — Anonymized buyer type
- Request/Response types for all API endpoints

---

## Next Steps (This Week)

### Days 1–2 Remaining (Mon–Tue)
- [ ] Run migration locally: `npx supabase migration up`
- [ ] Verify tables in Supabase: SELECT COUNT(*) FROM exit_scenarios
- [ ] Verify RLS policies enabled: SELECT * FROM pg_policies
- [ ] Copy types into Supabase schema (Dashboard → TypeScript)

### Days 2–4 (Tue–Thu): Core Helpers Library
**Build:** `/web/src/lib/exit-strategy.helpers.ts` (500+ lines)

**5 Functions to Implement:**

#### 1. `computeDilutionProgression()`
- Input: Current cap table, Series A/B params, exit valuation
- Output: 4 projections (seed → A → B → exit) with founder dilution %
- Logic: Sequential cap-table diffs, rounding down
- **Test:** Scenario 1 vs manual audit (±0.5% tolerance)

#### 2. `estimateFounderExitPayout()`
- Input: Founder name, dilution progression, exit valuation
- Output: Stake%, Gross, CGT (50% discount + 47% rate), Net
- Logic: Find founder in final projection, compute tax
- **Test:** Scenario 2 founder A ($19M gross, $14.5M net)

#### 3. `suggestAcquirers()`
- Input: Sector, target exit valuation, AU_EXITS fixture
- Output: 2–3 anonymized acquirer profiles (AU SaaS Strategic, etc.)
- Logic: Filter by sector, compute range, anonymize label
- **Test:** SaaS exits vs FinTech exits (different profiles)

#### 4. `computeExitReadiness()`
- Input: SVI analysis, revenue target, team size, key person risks
- Output: 4 checkpoints (product, revenue, team, market), overall score, band
- Logic: Score each checkpoint, average, assign band
- **Test:** Seed (not_ready) vs Series A (ready) vs Series B (exceptional)

#### 5. `formatExitScenarioForInvestorPack()`
- Input: Scenario, dilution, acquirers, readiness
- Output: Markdown chapter for investor pack
- Logic: Format tables, narrative, disclaimers
- **Test:** PDF render of formatted output

### Days 4–5 (Thu–Fri): API Routes + Testing
**Build:** 4 API routes (~200 lines)

```
POST   /api/exit-strategy/create-scenario  — Save scenario + compute dilution
GET    /api/exit-strategy/scenarios        — List all for account
GET/PUT/DELETE /api/exit-strategy/scenarios/[id] — CRUD + recalc
```

**Tests:** 10+ integration tests (auth, validation, RLS, error handling)

---

## Database Verification Checklist

```bash
# Step 1: Run migration
cd /home/dovanlong/blockid.au/web
npx supabase migration up

# Step 2: Verify tables created
SELECT schemaname, tablename FROM pg_tables 
WHERE tablename IN ('exit_scenarios', 'cap_table_projections', 'exit_readiness_assessments');

# Step 3: Verify RLS enabled
SELECT tablename, COUNT(*) as policy_count FROM pg_policies 
WHERE tablename LIKE 'exit_%' OR tablename = 'cap_table_projections'
GROUP BY tablename;

# Step 4: Verify indexes
SELECT tablename, indexname FROM pg_indexes 
WHERE tablename IN ('exit_scenarios', 'cap_table_projections', 'exit_readiness_assessments');

# Step 5: Verify constraints
SELECT constraint_name FROM information_schema.table_constraints 
WHERE table_name IN ('exit_scenarios', 'cap_table_projections', 'exit_readiness_assessments');
```

---

## Key Dependencies

**To build helpers library, need:**
- ✅ Types (done)
- ✅ Database schema (done)
- ✅ Cap-table.ts (existing, use for dilution diff)
- ✅ AU_EXITS fixture (anonymized benchmark data)
- ✅ SVI analysis snapshot (for readiness input)

**Blocked by (if any):**
- None — Can proceed immediately

---

## Success Criteria (End of Week 2)

✅ **Database:**
- All 3 tables created with 5+ RLS policies each
- Migrations pass locally + staging

✅ **Core Logic:**
- 5 helper functions implemented (500+ lines)
- 25+ unit tests passing (70%+ coverage)
- Dilution calcs verified vs manual audit (±0.5%)

✅ **API Routes:**
- 4 endpoints working (create, list, get, crud)
- 10+ integration tests passing
- Error handling (400, 401, 403, 500)

✅ **Quality:**
- TypeScript: 0 errors
- ESLint: 0 warnings
- All tests passing

---

## Handoff to Week 3

**Friday (Aug 30) Deliverables:**
- ✅ Backend fully functional (dilution calcs proven accurate)
- ✅ API routes tested (routes respond correctly)
- ✅ TypeScript types in place
- ✅ Database migrated to staging

**Monday (Sep 1) Frontend Can Start:**
- ✅ Wizard page + 5 step components
- ✅ Results dashboard (dilution table, payouts, acquirers)
- ✅ Investor pack integration

---

## Risk Mitigation

| Risk | Probability | Mitigation |
|------|---|---|
| Dilution calc diverges from cap-table.ts | Medium | Test round-trip vs existing calculator; manual audit on 3 scenarios |
| CGT formula criticized | Low | Non-binding disclaimer; recommend tax advisor |
| API latency >200ms | Low | Index on (scenario_id, round_num); test query plans |
| RLS policy bug (data leak) | Low | Thorough RLS testing; audit trail in exit_readiness |

---

## Resources

- **Design:** `/home/dovanlong/blockid.au/EXIT_STRATEGY_DESIGN.md`
- **Test Scenarios:** `/home/dovanlong/blockid.au/EXIT_STRATEGY_TEST_SCENARIOS.md`
- **Code Skeleton:** `/home/dovanlong/blockid.au/exit-strategy.helpers.SKELETON.ts`
- **Master Plan:** `/home/dovanlong/blockid.au/IMPLEMENTATION_ROADMAP_WEEKS_1_8_FINAL.md`

---

**Status:** READY TO BUILD WEEK 2 BACKEND  
**Kick-off:** Monday, August 25, 2026 09:00 AU  
**Next Review:** Friday, August 30, 2026 16:00 AU
