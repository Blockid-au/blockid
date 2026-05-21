# Sub-Goal: Dividend Distribution — Dual-Mode (Off-Chain + On-Chain)

## Parent Goal
`goals/blockchain-clevel-goals.md`

## Mission
Enable startups to declare and distribute dividends through either off-chain calculation only (bank transfer) or on-chain smart contract distribution (token-based), with Australian franking credit compliance in both modes.

---

## Dual-Mode Architecture

### Mode 1: Off-Chain Only (default, no blockchain needed)
```
Admin enters: net income + distribution %
    ↓
dividends.ts calculates:
  - per-share dividend
  - AU franking credits (30% corporate tax)
  - per-shareholder payout
    ↓
Store in dividend_records table
    ↓
Display payout table with bank transfer details
    ↓
Admin manually distributes (bank, PayID, etc.)
    ↓
Mark individual payouts as "paid"
```

### Mode 2: On-Chain Distribution (blockchain sync ON)
```
Admin enters: net income + distribution %
    ↓
Same off-chain calculation (franking, tax)
    ↓
Store in dividend_records table
    ↓
Queue blockchain event: 'dividend_declare'
    ↓
SVToken.declareDividend{ value: totalAmount }
    ↓
Each shareholder claims via MetaMask:
  SVToken.claimDividend(roundId)
    ↓
Poll claim events → mark as "claimed" off-chain
    ↓
Dashboard: shows claimed/unclaimed per holder
```

### Mode 3: Hybrid (calculation off-chain, distribution choice per shareholder)
```
Some shareholders prefer bank transfer, others prefer on-chain claim.

Per-shareholder distribution method:
  - "bank" → manual payout, mark paid
  - "on_chain" → claim via MetaMask
  - "auto" → on-chain if wallet connected, bank otherwise
```

---

## Australian Franking Credit Compliance

### Calculation (existing in dividends.ts)
```typescript
const AU_CORPORATE_TAX_RATE = 0.30; // Small business rate

function calculateFrankingCredit(grossDividend: number): number {
  return grossDividend * (AU_CORPORATE_TAX_RATE / (1 - AU_CORPORATE_TAX_RATE));
  // = grossDividend × 3/7 ≈ grossDividend × 0.4286
}

// Example:
// Gross dividend: A$10,000
// Franking credit: A$10,000 × 3/7 = A$4,285.71
// Total taxable income: A$10,000 + A$4,285.71 = A$14,285.71
// Tax on income (32.5% bracket): A$4,642.86
// Less franking credit: -A$4,285.71
// Net tax payable: A$357.15
```

### Franking always calculated off-chain
- On-chain tokens represent CASH value only
- Franking credits are TAX records, not transferable on-chain
- Dividend statement (PDF) includes franking credit schedule
- End-of-year tax report generated off-chain

---

## Dividend Declaration Flow

### Step 1: Setup
```
┌─────────────────────────────────────────────┐
│  Declare Dividend — Q2 2026                  │
│                                              │
│  Net Income (after tax): [A$ 50,000    ]     │
│  Distribution %:         [40%     ] ← slider │
│                                              │
│  Total Dividend: A$20,000                    │
│  Retained Earnings: A$30,000                 │
│                                              │
│  Per Share: A$0.002                          │
│  (10,000,000 shares outstanding)             │
│                                              │
│  Distribution Method:                        │
│  ○ Off-chain only (bank transfer)            │
│  ○ On-chain (MetaMask claim)                 │
│  ● Hybrid (shareholder choice)               │
│                                              │
│  [Preview Payouts →]                         │
└─────────────────────────────────────────────┘
```

### Step 2: Payout Preview
```
┌───────────────────────────────────────────────────────────┐
│  Dividend Payout Preview                                   │
│                                                            │
│  Name  │ Shares │ Gross    │ Franking │ Method    │        │
│  Alice │ 5M     │ A$10,000 │ A$4,286  │ On-chain  │        │
│  Bob   │ 3M     │ A$6,000  │ A$2,571  │ Bank      │        │
│  ESOP  │ 2M     │ A$4,000  │ A$1,714  │ Retained  │        │
│                                                            │
│  Total: A$20,000 + A$8,571 franking credits               │
│                                                            │
│  [Declare Dividend →]                                      │
└───────────────────────────────────────────────────────────┘
```

### Step 3: Execution
```
1. Store dividend_records off-chain
2. If any on-chain distributions:
   a. Queue 'dividend_declare' event
   b. SVToken.declareDividend{ value: onChainTotal }
   c. Dashboard shows: "Round #3 declared on-chain"
3. For bank transfers:
   a. Show payout instructions (BSB, Account, PayID)
   b. Admin marks each as paid when transferred
4. For on-chain claims:
   a. Shareholder clicks "Claim" in dashboard
   b. Connects MetaMask, signs claimDividend(roundId)
   c. Tokens (BID native coin) transferred to wallet
   d. Dashboard updates: "Claimed ✅"
```

---

## On-Chain Dividend Token Economics

### How On-Chain Dividends Work
```
1. Admin declares dividend with BID (native coin) attached
   → SVToken.declareDividend{ value: 1000 BID }
   
2. Contract records:
   - roundId: auto-incrementing
   - totalAmount: 1000 BID
   - perShareAmount: 1000 / totalSupply (scaled by 1e18)
   - snapshotBlock: current block (determines eligible holders)
   
3. Each holder claims proportionally:
   - Alice (50% of supply): claims 500 BID
   - Bob (30%): claims 300 BID
   - ESOP Vault (20%): retained (admin can claim for pool)
```

### BID Coin ↔ AUD Mapping
```
BID is internal to BlockID chain (no real monetary value)
1 BID = 1 AUD (for accounting purposes only)
On-chain dividend is a RECORD of entitlement, not actual AUD transfer
Actual AUD payment still happens via bank/PayID

The on-chain dividend provides:
  - Immutable record of declaration
  - Provable claim eligibility (snapshot at block X)
  - Transparent per-share calculation
  - Audit trail (who claimed when)
```

---

## Database Enhancements

```sql
-- Extend dividend_records with distribution method
ALTER TABLE dividend_records ADD COLUMN IF NOT EXISTS
  distribution_method text DEFAULT 'off_chain';  -- 'off_chain', 'on_chain', 'hybrid'

ALTER TABLE dividend_records ADD COLUMN IF NOT EXISTS
  on_chain_round_id integer;

ALTER TABLE dividend_records ADD COLUMN IF NOT EXISTS
  on_chain_tx_hash text;

-- Per-shareholder payout tracking
CREATE TABLE IF NOT EXISTS dividend_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dividend_id uuid NOT NULL REFERENCES dividend_records(id),
  account_id uuid NOT NULL,
  shareholder_id uuid NOT NULL,
  shareholder_name text NOT NULL,
  shares_held bigint NOT NULL,
  gross_amount numeric(14,2) NOT NULL,
  franking_credit numeric(14,2) NOT NULL,
  distribution_method text DEFAULT 'bank',  -- 'bank', 'on_chain'
  status text DEFAULT 'pending',            -- 'pending', 'claimed', 'paid', 'retained'
  claim_tx_hash text,
  paid_at timestamptz,
  created_at timestamptz DEFAULT now()
);
```

---

## API Endpoints

```
POST /api/dividends/declare
  Body: { accountId, netIncome, distributionPct, method, period }
  → Calculate + store + queue on-chain if applicable

GET  /api/dividends/rounds?accountId=xxx
  → All dividend rounds with per-shareholder status

POST /api/dividends/claim
  Body: { accountId, dividendId, shareholderId }
  → Trigger on-chain claim (returns unsigned tx for MetaMask)

POST /api/dividends/mark-paid
  Body: { payoutId }
  → Admin marks bank transfer as completed

GET  /api/dividends/tax-report?accountId=xxx&year=2026
  → Annual franking credit summary for tax reporting
```

---

## Skills Used
- `/blockchain-expert` — On-chain dividend, claim flow
- `/cfo` — Franking credits, tax compliance
- `/au-compliance` — AU dividend tax rules
- `/ui-ux-pro-max` — Declaration wizard, claim UX

## Owner
- **Primary**: Blockchain Lead (CBO-001)
- **Support**: CFO, AU Compliance Officer

## Success Metrics
- [ ] Off-chain dividend works fully without blockchain
- [ ] On-chain declaration + claim flow end-to-end
- [ ] Franking credits calculated correctly (AU 30% rate)
- [ ] Hybrid mode: per-shareholder method choice
- [ ] Tax report generates annual franking summary
- [ ] Unclaimed dividends visible in dashboard for >30 days