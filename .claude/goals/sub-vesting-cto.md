# CTO Sub-Goal: Vesting & Share Structure — Technical Implementation

## Parent Goal
`goals/vesting-share-structure.md`

## Mission
Build the complete backend infrastructure for the vesting system: database schema, computation engine, API endpoints, AI recommendation integration, and SVI linkage.

---

## Phase 1: Core Database + Compute Engine (Week 1-2)

### Task 1.1: Database Migration
**File**: `web/supabase/migrations/0032_vesting_system.sql`

Create 5 new tables:
- `vesting_schedules` — First-class vesting grant entities
- `vesting_events` — Immutable audit log
- `share_structure_config` — Per-company share mode configuration
- `vesting_defaults` — Per-company role overrides
- `ai_equity_recommendations` — Stored AI suggestions

**Schema details**: See parent goal for full column definitions.

**Indexes**:
- `idx_vesting_schedules_account` on (account_id)
- `idx_vesting_schedules_status` on (status) WHERE status = 'active'
- `idx_vesting_events_schedule` on (schedule_id, event_date DESC)

**RLS policies**:
- Users can only read/write their own account's vesting data
- Service role has full access for cron processing

### Task 1.2: Vesting Computation Library
**File**: `web/src/lib/vesting.ts` (new)

```typescript
// Core exports:
export function computeMonthlyVesting(params: VestingParams): VestingScheduleResult
export function computeVestedAsOfDate(schedule: VestingSchedule, asOf: Date): VestedState
export function getNextVestDate(schedule: VestingSchedule): Date | null
export function processAcceleration(schedule: VestingSchedule, trigger: AccelerationTrigger): AccelerationResult
export function buildVestingTimeline(schedule: VestingSchedule): MonthlyVestEntry[]
```

**Vesting types to support**:
- `linear` — Equal monthly tranches after cliff
- `back_weighted` — 10%/20%/30%/40% per year
- `front_weighted` — 40%/30%/20%/10% per year
- `milestone` — Event-triggered only

**Edge cases**:
- Vesting start date in the future → 0 vested
- Cliff not yet passed → 0 vested
- Past full vesting period → 100% vested (capped)
- Partial months → round down to last complete month
- Revoked schedule → freeze at revocation date

### Task 1.3: Share Structure Library
**File**: `web/src/lib/share-structure.ts` (new)

```typescript
export function computeSharePrice(sviScore, stage, metrics, config): SharePriceResult
export function computeShareAllocation(ownershipPct, config): number  // shares for a given %
export function recomputeAllHolders(accountId): Promise<void>  // recalc after SVI change
```

**Formula (Fixed Shares mode)**:
```
valuation = computeValuation(svi, stage, metrics).midAud
pricePerShare = valuation / config.authorizedShares
holderShares = Math.floor((holderPct / 100) * config.authorizedShares)
```

**Formula (Dynamic Shares mode)**:
```
totalShares = Math.floor(valuation / config.nominalPricePerShare)
holderShares = Math.floor((holderPct / 100) * totalShares)
```

### Task 1.4: API Endpoints — Vesting CRUD
**Files**:
- `web/src/app/api/vesting/route.ts` — GET (list) + POST (create)
- `web/src/app/api/vesting/[id]/route.ts` — PUT (update) + DELETE
- `web/src/app/api/vesting/[id]/accelerate/route.ts` — POST
- `web/src/app/api/vesting/compute/route.ts` — POST (preview, no DB)
- `web/src/app/api/vesting-defaults/route.ts` — GET + PUT

**POST /api/vesting** flow:
1. Validate input (Zod schema)
2. Check shareholder exists and belongs to account
3. Create vesting_schedule row
4. Create vesting_event (type: 'grant')
5. Auto-create svi_evidence for CGH dimension
6. Optional: trigger blockchain grantVesting() if EVM address present
7. Return created schedule with computed current state

### Task 1.5: Extend Credits System
**File**: `web/src/lib/credits.ts`

Add to `FEATURE_COSTS`:
```typescript
vesting_setup: 0,
vesting_compute: 0,
ai_equity_split: 1.00,
ai_vesting_schedule: 0.50,
ai_share_structure: 0.75,
ai_esop_pool: 0.50,
ai_vesting_review: 1.50,
share_structure_recompute: 0,
vesting_accelerate: 0,
```

---

## Phase 2: SVI Integration + Cron (Week 2-3)

### Task 2.1: SVI Evidence Auto-Creation
When vesting schedule is created, insert evidence:
```typescript
await supabase.from("svi_evidence").insert({
  account_id: accountId,
  evidence_type: "connected_source",
  label: `Vesting: ${name} — ${months}mo, ${cliff}mo cliff`,
  confidence_level: "connected_source",  // 0.75
  dimension: "cgh",
  svi_impact: 8,
});
```

### Task 2.2: Enhance SVI Signal Detection
In `svi-analysis.ts`, enhance `extractSignals()`:
- Query `vesting_schedules` table when computing CGH
- If active schedules exist → `signals.hasVesting = true`
- Already grants +15 CGH points via existing logic

### Task 2.3: Share Structure API
**Files**:
- `web/src/app/api/share-structure/route.ts` — GET + POST
- `web/src/app/api/share-structure/recompute/route.ts` — POST

### Task 2.4: Vesting Processing Cron
**File**: `web/src/app/api/cron/vesting-process/route.ts`

Daily at 00:00 UTC:
1. Query all `vesting_schedules WHERE status = 'active'`
2. For each schedule, compute vested amount as of today
3. If new shares vested since last_vest_date:
   - Insert `vesting_events` row (type: 'vest')
   - Update `vested_shares`, `vested_pct`, `last_vest_date`, `next_vest_date`
4. If cliff just passed (last_vest_date < cliff_date <= today):
   - Insert event (type: 'cliff_passed')
5. If fully vested:
   - Set status = 'completed', completed_at = now()
6. Log metrics (total processed, vested, completed)

---

## Phase 4: AI Recommendation Engine (Week 4-5)

### Task 4.1: AI Equity Library
**File**: `web/src/lib/ai-equity.ts` (new)

```typescript
export async function aiSuggestEquitySplit(params): Promise<EquitySplitRecommendation>
export async function aiSuggestVestingSchedule(params): Promise<VestingRecommendation>
export async function aiSuggestShareStructure(params): Promise<ShareStructureRecommendation>
export async function aiSuggestESOPPool(params): Promise<ESOPRecommendation>
export async function aiComprehensiveReview(params): Promise<ComprehensiveReview>
```

Uses existing `callAI()` infrastructure with structured prompts.

### Task 4.2: AI API Endpoints
**Files**:
- `web/src/app/api/ai/equity-split/route.ts`
- `web/src/app/api/ai/vesting-schedule/route.ts`
- `web/src/app/api/ai/share-structure/route.ts`
- `web/src/app/api/ai/esop-pool/route.ts`
- `web/src/app/api/ai/vesting-review/route.ts`

Each endpoint:
1. `canAfford()` check
2. Gather context (SVI score, cap table, team members)
3. Call AI with structured prompt
4. Parse response
5. `spendCredits()`
6. Store in `ai_equity_recommendations`
7. Return recommendation

### Task 4.3: AI Prompt Engineering
System prompts include:
- Australian startup equity best practices
- Role-based benchmarks (founder 60-80%, advisor 0.5-2%, ESOP 10-15%)
- Stage-appropriate recommendations
- SVI-informed suggestions
- Output as structured JSON for reliable parsing

---

## Testing Requirements

- Unit tests for all vesting calculations (edge cases, leap years, partial months)
- Unit tests for share price computation (both modes)
- Integration tests for API endpoints
- E2E test for the full setup flow
- Cron processing test with mock schedules

---

## Skills Used
- `/cto` — Architecture, API design
- `/db-migrate` — Schema creation
- `/typescript-pro` — Type-safe computation engine
- `/claude-api` — AI recommendation prompts
- `/secure-code-guardian` — RLS policies, input validation

## Success Metrics
- [ ] All 5 DB tables created with proper RLS
- [ ] Vesting compute handles all 4 vesting types correctly
- [ ] API endpoints pass all validation + auth tests
- [ ] Cron processes 1000+ schedules in <30s
- [ ] AI recommendations parse successfully >95% of the time
- [ ] SVI CGH auto-boost triggers on vesting creation
- [ ] Share price recomputes within 1s of SVI change