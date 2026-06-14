# BlockID.au ESOP Implementation Guide
**Version:** 1.0  
**Date:** 2026-06-13  
**Status:** Design (ready for development)

---

## Overview

This document outlines the technical implementation of ESOP (Employee Stock Option Plan) management in BlockID.au's cap table system. It includes:

1. Database schema extensions
2. API endpoints
3. Vesting calculation logic
4. UI components
5. Admin workflows

---

## 1. Database Schema Extensions

### 1.1 ESOP Pool Table

```sql
CREATE TABLE public.esop_pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  
  -- Pool sizing
  total_shares INTEGER NOT NULL,
  allocated_shares INTEGER NOT NULL DEFAULT 0,
  unallocated_shares INTEGER GENERATED ALWAYS AS (total_shares - allocated_shares) STORED,
  
  -- Vesting defaults
  vesting_cliff_months INTEGER DEFAULT 12,
  vesting_total_months INTEGER DEFAULT 48,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMP DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id),
  
  CONSTRAINT positive_shares CHECK (total_shares > 0),
  CONSTRAINT allocated_lte_total CHECK (allocated_shares <= total_shares)
);

CREATE INDEX idx_esop_pools_company_id ON public.esop_pools(company_id);
```

### 1.2 ESOP Grants Table

```sql
CREATE TABLE public.esop_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  esop_pool_id UUID NOT NULL REFERENCES esop_pools(id) ON DELETE CASCADE,
  
  -- Grantee information
  grantee_name TEXT NOT NULL,
  grantee_email TEXT,
  grantee_role TEXT, -- "engineer", "designer", "advisor", etc.
  
  -- Grant details
  total_shares INTEGER NOT NULL,
  strike_price_cents INTEGER DEFAULT 10, -- A$0.10 = 10 cents
  grant_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Vesting schedule
  cliff_months INTEGER DEFAULT 12,
  total_months INTEGER DEFAULT 48,
  cliff_date DATE GENERATED ALWAYS AS (grant_date + (cliff_months || ' months')::INTERVAL) STORED,
  final_vesting_date DATE GENERATED ALWAYS AS (grant_date + (total_months || ' months')::INTERVAL) STORED,
  
  -- Vesting status
  vested_shares DECIMAL DEFAULT 0,
  exercised_shares DECIMAL DEFAULT 0,
  forfeited_shares DECIMAL DEFAULT 0,
  status TEXT DEFAULT 'pending', -- pending, active, exercised, forfeited, expired
  
  -- Acceleration
  acceleration_trigger TEXT, -- null, "change_of_control", "acquirer_termination", etc.
  acceleration_date DATE,
  accelerated_shares INTEGER DEFAULT 0,
  
  -- Termination
  termination_date DATE,
  termination_type TEXT, -- "good_leaver", "bad_leaver", "retirement", "disability", null
  exercise_deadline DATE, -- typically 90 days post-termination for good leavers
  
  -- Metadata
  created_at TIMESTAMP DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMP DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id),
  notes TEXT,
  
  CONSTRAINT positive_shares CHECK (total_shares > 0),
  CONSTRAINT valid_status CHECK (status IN ('pending', 'active', 'exercised', 'forfeited', 'expired')),
  CONSTRAINT cliff_lte_total CHECK (cliff_months <= total_months)
);

CREATE INDEX idx_esop_grants_pool_id ON public.esop_grants(esop_pool_id);
CREATE INDEX idx_esop_grants_grantee_email ON public.esop_grants(grantee_email);
CREATE INDEX idx_esop_grants_status ON public.esop_grants(status);
CREATE INDEX idx_esop_grants_termination_date ON public.esop_grants(termination_date);
```

### 1.3 ESOP Vesting Events Table

```sql
CREATE TABLE public.esop_vesting_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  esop_grant_id UUID NOT NULL REFERENCES esop_grants(id) ON DELETE CASCADE,
  
  -- Event details
  event_date DATE NOT NULL,
  event_type TEXT NOT NULL, -- "monthly_vesting", "cliff", "acceleration", "forfeiture", "exercise"
  shares_affected INTEGER NOT NULL,
  
  -- Context
  context JSONB, -- Store additional event context (reason, amount, etc.)
  
  created_at TIMESTAMP DEFAULT now(),
  
  CONSTRAINT positive_shares CHECK (shares_affected > 0)
);

CREATE INDEX idx_esop_vesting_events_grant_id ON public.esop_vesting_events(esop_grant_id);
CREATE INDEX idx_esop_vesting_events_date ON public.esop_vesting_events(event_date);
```

### 1.4 ESOP Exercise Transactions Table

```sql
CREATE TABLE public.esop_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  esop_grant_id UUID NOT NULL REFERENCES esop_grants(id) ON DELETE CASCADE,
  
  -- Exercise details
  exercise_date DATE NOT NULL,
  shares_exercised INTEGER NOT NULL,
  strike_price_cents INTEGER NOT NULL, -- Locked at grant time
  total_consideration_cents INTEGER GENERATED ALWAYS AS (shares_exercised * strike_price_cents) STORED,
  
  -- Payment
  payment_method TEXT, -- "cash", "bank_transfer", "offset"
  payment_date DATE,
  payment_reference TEXT,
  
  -- Resulting shares
  share_certificate_id TEXT,
  share_certificate_issued_date DATE,
  
  created_at TIMESTAMP DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  
  CONSTRAINT positive_shares CHECK (shares_exercised > 0),
  CONSTRAINT exercise_after_vesting CHECK (exercise_date >= (
    SELECT cliff_date FROM esop_grants WHERE id = esop_grant_id
  ))
);

CREATE INDEX idx_esop_exercises_grant_id ON public.esop_exercises(esop_grant_id);
CREATE INDEX idx_esop_exercises_date ON public.esop_exercises(exercise_date);
```

---

## 2. Vesting Calculation Logic

### 2.1 Core Vesting Function (TypeScript)

```typescript
// src/lib/esop-vesting.ts

export interface VestingState {
  totalShares: number;
  grantDate: Date;
  cliffMonths: number;
  totalMonths: number;
  terminationDate?: Date;
  terminationType?: 'good_leaver' | 'bad_leaver' | 'death' | 'retirement' | 'disability';
  accelerationTrigger?: string;
  currentDate: Date;
}

export interface VestingResult {
  vestedShares: number;
  unvestedShares: number;
  cliffVestedShares: number;
  monthlyVestedShares: number;
  forfeited: boolean;
  forwardStatus: string;
}

/**
 * Calculate vesting status at a given date.
 * 
 * Standard: 4yr/1yr cliff
 * - 0-12mo: 0% (cliff)
 * - 12mo: 25% (cliff date)
 * - 13-48mo: 75% spread equally (1.5625%/month)
 */
export function calculateVesting(state: VestingState): VestingResult {
  const monthsElapsed = getMonthsBetween(state.grantDate, state.currentDate);
  const cliffDate = addMonths(state.grantDate, state.cliffMonths);
  const finalVestingDate = addMonths(state.grantDate, state.totalMonths);

  // Handle bad leaver (immediate forfeiture)
  if (state.terminationType === 'bad_leaver' && state.terminationDate) {
    return {
      vestedShares: 0,
      unvestedShares: state.totalShares,
      cliffVestedShares: 0,
      monthlyVestedShares: 0,
      forfeited: true,
      forwardStatus: 'FORFEITED: Bad leaver, all options lost',
    };
  }

  // Handle good leaver (retain vested as of termination)
  let calculationDate = state.currentDate;
  if (state.terminationType === 'good_leaver' && state.terminationDate) {
    calculationDate = state.terminationDate;
  }

  // Handle disability (immediate acceleration)
  if (state.terminationType === 'disability') {
    return {
      vestedShares: state.totalShares,
      unvestedShares: 0,
      cliffVestedShares: state.totalShares,
      monthlyVestedShares: 0,
      forfeited: false,
      forwardStatus: 'ACCELERATED: All vested due to disability',
    };
  }

  // Standard vesting logic
  if (monthsElapsed < state.cliffMonths) {
    // Pre-cliff: nothing vested
    return {
      vestedShares: 0,
      unvestedShares: state.totalShares,
      cliffVestedShares: 0,
      monthlyVestedShares: 0,
      forfeited: false,
      forwardStatus: `Cliff not reached. Vests ${cliffDate.toLocaleDateString()}`,
    };
  }

  // Cliff reached
  const cliffVested = Math.floor(state.totalShares * 0.25);

  if (monthsElapsed >= state.totalMonths) {
    // Fully vested
    return {
      vestedShares: state.totalShares,
      unvestedShares: 0,
      cliffVestedShares: cliffVested,
      monthlyVestedShares: state.totalShares - cliffVested,
      forfeited: false,
      forwardStatus: 'FULLY VESTED',
    };
  }

  // Partial vesting (post-cliff, pre-final)
  const monthsPostCliff = monthsElapsed - state.cliffMonths;
  const monthlyVestingRate = (state.totalShares * 0.75) / (state.totalMonths - state.cliffMonths);
  const monthlyVested = Math.floor(monthlyVestingRate * monthsPostCliff);
  const totalVested = cliffVested + monthlyVested;

  return {
    vestedShares: totalVested,
    unvestedShares: state.totalShares - totalVested,
    cliffVestedShares: cliffVested,
    monthlyVestedShares: monthlyVested,
    forfeited: false,
    forwardStatus: `${totalVested} vested, ${state.totalShares - totalVested} unvested. Final vesting ${finalVestingDate.toLocaleDateString()}`,
  };
}

function getMonthsBetween(start: Date, end: Date): number {
  return (end.getFullYear() - start.getFullYear()) * 12 + 
         (end.getMonth() - start.getMonth());
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}
```

### 2.2 Automatic Vesting Cron Job

```typescript
// src/app/api/cron/esop-vesting.ts

export async function POST(req: Request) {
  const supabase = createClient();
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  
  // Find all grants that have vesting events today
  const { data: grantsToVest, error } = await supabase
    .from('esop_grants')
    .select('*')
    .eq('status', 'active')
    .lte('cliff_date', today)
    .gt('total_months', 'SOMETHING');
  
  if (error) return Response.json({ error: error.message }, { status: 500 });
  
  for (const grant of grantsToVest) {
    const vesting = calculateVesting({
      totalShares: grant.total_shares,
      grantDate: new Date(grant.grant_date),
      cliffMonths: grant.cliff_months,
      totalMonths: grant.total_months,
      currentDate: new Date(),
    });
    
    // Update grant with calculated vested shares
    await supabase
      .from('esop_grants')
      .update({
        vested_shares: vesting.vestedShares,
        updated_at: new Date(),
      })
      .eq('id', grant.id);
    
    // Log vesting event
    await supabase
      .from('esop_vesting_events')
      .insert({
        esop_grant_id: grant.id,
        event_date: today,
        event_type: 'monthly_vesting',
        shares_affected: vesting.vestedShares - (grant.vested_shares || 0),
      });
  }
  
  return Response.json({ processed: grantsToVest.length });
}
```

---

## 3. API Endpoints

### 3.1 POST /api/esop/create-pool

Create ESOP pool for a company.

```typescript
// Request
{
  "company_id": "uuid",
  "total_shares": 12000,
  "vesting_cliff_months": 12,
  "vesting_total_months": 48
}

// Response
{
  "id": "pool-uuid",
  "total_shares": 12000,
  "allocated_shares": 0,
  "unallocated_shares": 12000
}
```

### 3.2 POST /api/esop/grant

Issue a new option grant.

```typescript
// Request
{
  "esop_pool_id": "uuid",
  "grantee_name": "John Doe",
  "grantee_email": "john@blockid.au",
  "grantee_role": "engineer",
  "total_shares": 500,
  "strike_price_cents": 10,
  "grant_date": "2026-07-01",
  "cliff_months": 12,
  "total_months": 48
}

// Response
{
  "id": "grant-uuid",
  "grantee_name": "John Doe",
  "total_shares": 500,
  "grant_date": "2026-07-01",
  "cliff_date": "2027-07-01",
  "final_vesting_date": "2030-07-01",
  "status": "pending"
}
```

### 3.3 GET /api/esop/grants

List all grants for a company.

```typescript
// Response
[
  {
    "id": "grant-1",
    "grantee_name": "John Doe",
    "total_shares": 500,
    "vested_shares": 0,
    "unvested_shares": 500,
    "status": "pending",
    "grant_date": "2026-07-01",
    "cliff_date": "2027-07-01"
  }
]
```

### 3.4 GET /api/esop/grant/[id]/vesting

Get current vesting status.

```typescript
// Response
{
  "grant_id": "uuid",
  "vested_shares": 0,
  "unvested_shares": 500,
  "vesting_percentage": 0,
  "cliff_date": "2027-07-01",
  "final_vesting_date": "2030-07-01",
  "forward_status": "Cliff not reached. Vests 2027-07-01"
}
```

### 3.5 POST /api/esop/exercise

Exercise vested options.

```typescript
// Request
{
  "grant_id": "uuid",
  "shares_to_exercise": 125,
  "payment_method": "bank_transfer",
  "payment_reference": "TXN-123456"
}

// Response
{
  "exercise_id": "uuid",
  "shares_exercised": 125,
  "total_consideration_aud": 12.50,
  "share_certificate_id": "CERT-001",
  "exercise_date": "2027-07-01"
}
```

### 3.6 POST /api/esop/terminate

Record employee termination and handle remaining options.

```typescript
// Request
{
  "grant_id": "uuid",
  "termination_date": "2026-09-15",
  "termination_type": "good_leaver", // or "bad_leaver", "death", etc.
  "exercise_deadline": "2026-12-15"  // 90 days for good leavers
}

// Response
{
  "grant_id": "uuid",
  "status": "terminated",
  "vested_at_termination": 150,
  "forfeited": 350,
  "exercise_deadline": "2026-12-15"
}
```

---

## 4. UI Components

### 4.1 ESOP Dashboard (`/workspace/esop`)

**Main sections:**
- ESOP Pool Summary (total, allocated, unallocated)
- Active Grants List (table with vesting progress bars)
- Grant History (awarded, exercised, forfeited)
- Vesting Calendar (visual timeline)
- Dilution Projector (what-if scenarios)

### 4.2 Grant Creation Form

**Steps:**
1. Select grantee (employee/advisor name)
2. Enter share count + role
3. Confirm vesting terms (default 4yr/1yr cliff)
4. Review & approve

### 4.3 Vesting Progress Component

```typescript
// src/components/esop/vesting-progress.tsx

interface VestingProgressProps {
  grant: ESOPGrant;
  currentDate?: Date;
}

export function VestingProgress({ grant, currentDate = new Date() }: VestingProgressProps) {
  const vesting = calculateVesting({
    totalShares: grant.total_shares,
    grantDate: new Date(grant.grant_date),
    cliffMonths: grant.cliff_months,
    totalMonths: grant.total_months,
    currentDate,
  });

  const percentage = (vesting.vestedShares / grant.total_shares) * 100;

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span>{vesting.vestedShares} vested</span>
        <span>{percentage.toFixed(0)}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className="bg-green-500 h-2 rounded-full transition-all"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <p className="text-xs text-gray-500">{vesting.forwardStatus}</p>
    </div>
  );
}
```

---

## 5. BlockID.au Cap Table Setup

### 5.1 Initial Cap Table (Post-ESOP)

Create entry in `cap_tables` for BlockID.au:

```sql
INSERT INTO public.cap_tables (
  company_id, company_name, currency, total_shares, notes
) VALUES (
  'blockid-company-uuid', 'Auschain Pty Ltd', 'AUD', 100000, 'BlockID.au ESOP setup'
);

INSERT INTO public.cap_table_entries (
  cap_table_id, holder_name, shares, share_class, notes
) VALUES
  ('blockid-company-uuid', 'Do Van Long', 88000, 'common', 'Founder shares, 4yr/1yr vesting retroactive'),
  ('blockid-company-uuid', 'ESOP Pool', 12000, 'esop', 'Unallocated employee option pool');
```

### 5.2 Founder Shares Vesting Entry

```sql
INSERT INTO public.esop_grants (
  esop_pool_id, grantee_name, grantee_email, grantee_role,
  total_shares, strike_price_cents, grant_date,
  cliff_months, total_months
) VALUES (
  'blockid-esop-pool-uuid',
  'Do Van Long', 'admin@blockid.au', 'founder',
  88000, 1, '2024-01-01',
  12, 48
);

-- Mark as vested (retroactive, special case)
UPDATE public.esop_grants
SET status = 'active', vested_shares = 57200  -- ~65% vested as of 2026-06-13
WHERE grantee_name = 'Do Van Long';
```

---

## 6. Implementation Roadmap

### Phase 1: Data Model (Immediate)
- [ ] Create Supabase migrations for ESOP tables
- [ ] Populate BlockID.au cap table with founder shares + ESOP pool
- [ ] Test vesting calculations with founder grant

### Phase 2: API & Backend (Week 2)
- [ ] Implement vesting calculation engine
- [ ] Build API endpoints (/api/esop/*)
- [ ] Create cron job for automatic vesting
- [ ] Implement exercise + termination workflows

### Phase 3: Frontend UI (Week 3)
- [ ] Build ESOP Dashboard
- [ ] Create grant creation form
- [ ] Implement vesting progress components
- [ ] Add exercise + termination workflows

### Phase 4: Integration & Testing (Week 4)
- [ ] Integrate with existing cap table UI
- [ ] Test full grant lifecycle (create → vest → exercise → terminate)
- [ ] Implement dilution projector for ESOP scenarios
- [ ] Document for platform users

---

## 7. Notes for Developers

1. **Vesting Precision:** Always round down to whole shares. Carry remainder to next calculation.
2. **Timezone Handling:** All dates are UTC. Use `new Date().toISOString().split('T')[0]` for SQL dates.
3. **Audit Trail:** Every vesting event should be logged to `esop_vesting_events` table.
4. **Performance:** Cache vesting calculations (recalculate only on grant anniversary or API call).
5. **Tax Docs:** Generate tax summary for each grant annually (template in legal templates).

