# Sub-Goal: Additional Share Issuance & Capital Events

## Parent Goal
`goals/blockchain-clevel-goals.md`

## Mission
Handle all post-setup share issuance events — funding rounds, ESOP grants, SVI-based dynamic expansion, stock splits, and SAFE/note conversions — with proper off-chain recording and optional on-chain minting.

---

## Capital Event Types

### 1. Funding Round (New Investment)
```
Trigger: Startup raises capital (pre-seed, seed, Series A, etc.)

Off-chain:
  1. Create new share_class (e.g., "Series A Preference")
  2. Calculate new shares to issue:
     new_shares = raise_aud / price_per_share
  3. Add investor as shareholder
  4. Recalculate all ownership percentages (dilution)
  5. Update share_structure_config (total authorized if needed)
  6. Record in share_transactions (type: 'issue')
  7. Auto-create SVI evidence (IRI dimension: "Raised A$X")

On-chain (if sync ON):
  1. Queue 'mint': mint new shares to investor wallet
  2. Queue 'configure_class': set up on-chain share class
  3. If ESOP top-up: queue additional mint to ESOP vault
  
Integration with cap-table.ts computeDiff():
  - Already handles ESOP top-up as pre-money
  - Already calculates dilution per holder
  - Just need to trigger sync queue after computation
```

### 2. ESOP Grant (Employee Option)
```
Trigger: Grant options to new employee from ESOP pool

Off-chain:
  1. Deduct from esop_pool.allocated_shares
  2. Create vesting_schedule for the grant
  3. Record equity_event (type: 'grant')
  4. Update ESOP dashboard

On-chain (if sync ON):
  1. Queue 'vest_grant': create vesting grant in VestingVault
  2. Tokens stay in vault until vesting + exercise
  
Note: ESOP shares are already minted to the ESOP vault address.
Grant just creates a vesting schedule against that pool.
```

### 3. SVI-Based Dynamic Share Expansion
```
Trigger: SVI score increases significantly (>5 points)
Mode: Only when share_structure_config.mode = 'dynamic_shares'

Off-chain:
  1. Detect SVI change via snapshot cron
  2. Recompute: new_authorized = valuation_aud / nominal_price
  3. Delta shares = new_authorized - current_authorized
  4. If delta > 0: expand authorized shares
  5. New shares go to "unissued" pool (not allocated to anyone)
  6. Update share_structure_config.authorized_shares
  7. Recalculate price_per_share for fixed_shares mode

On-chain (if sync ON):
  1. Queue 'mint': mint delta shares to treasury/admin address
  2. These are unissued tokens (not distributed)
  
Note: Dynamic expansion does NOT dilute existing holders.
New shares are unissued until explicitly granted/sold.
```

### 4. Stock Split
```
Trigger: Admin initiates stock split (e.g., 2:1, 10:1)

Off-chain:
  1. Multiply all shareholders' shares_held by split_ratio
  2. Multiply authorized_shares by split_ratio
  3. Divide price_per_share by split_ratio
  4. Update all vesting_schedules (total_shares, vested_shares)
  5. Record share_transactions for each holder (type: 'split')
  6. Recalculate all related figures

On-chain (if sync ON):
  Option A (simple): Mint additional shares to each holder
    → For 2:1 split: mint same amount again to each address
  Option B (clean): Burn all → remint at new ratio
    → More complex but cleaner on-chain state
  
Recommended: Option A for simplicity (private chain, no market impact)
```

### 5. SAFE/Convertible Note Conversion
```
Trigger: SAFE or convertible note converts to equity (usually at funding round)

Off-chain:
  1. Calculate conversion:
     - SAFE: shares = investment / min(cap/pre_money, 1-discount) × price
     - Note: shares = (principal + accrued_interest) / conversion_price
  2. Create new shareholder (or update existing SAFE holder)
  3. Issue shares at conversion price
  4. Record in share_transactions (type: 'convert')
  5. Close the SAFE/note record

On-chain (if sync ON):
  1. Queue 'mint': mint converted shares to holder wallet
```

### 6. Share Buyback
```
Trigger: Company buys back shares from departing member or treasury

Off-chain:
  1. Reduce shareholder's shares_held
  2. Either: cancel shares (reduce total) or return to treasury
  3. Record share_transactions (type: 'transfer' or 'burn')
  4. Recalculate all ownership percentages
  5. If vesting revoked: freeze vesting_schedule

On-chain (if sync ON):
  If cancel: queue 'burn' (reduce total supply)
  If treasury: queue 'transfer' (to admin address)
```

---

## Batch Operations

### Batch Mint (Post-Round)
After a funding round, multiple mints may be needed:
```typescript
async function executeFundingRound(roundData: FundingRoundData) {
  // 1. Compute all changes (existing computeDiff)
  const diff = computeDiff(currentHolders, round);
  
  // 2. Apply all off-chain changes
  for (const change of diff.rows) {
    await updateShareholder(change.holderId, change.newShares);
  }
  
  // 3. Queue all on-chain operations as a batch
  const batchOps = [];
  
  // ESOP top-up mint
  if (diff.pricing.esopAdded > 0) {
    batchOps.push({ type: 'mint', to: esopVaultAddr, amount: diff.pricing.esopAdded });
  }
  
  // Investor share mint
  batchOps.push({ type: 'mint', to: investorAddr, amount: diff.pricing.investorShares });
  
  // Queue as prioritized batch
  await queueBatchSync(accountId, batchOps, priority: 1);
}
```

### Batch Processing on Chain
```
POST /api/blockchain/batch-execute
Body: { accountId, operations: [...] }

Executes all operations in sequence:
  1. Validate all operations first (fail-fast)
  2. Execute each, collecting tx hashes
  3. If any fails: continue with rest, flag failed ones
  4. Return: { completed: n, failed: m, txHashes: [...] }
```

---

## API Endpoints

```
POST /api/capital-events/funding-round
  Body: { accountId, roundName, preMoneyAud, raiseAud, esopTopUpPct, investors }
  → Process full funding round (off-chain + queue on-chain)

POST /api/capital-events/esop-grant
  Body: { accountId, employeeName, email, shares, vestingMonths, cliffMonths }
  → Grant ESOP from pool with vesting

POST /api/capital-events/stock-split
  Body: { accountId, ratio }
  → Execute stock split (e.g., ratio=2 for 2:1)

POST /api/capital-events/conversion
  Body: { accountId, instrumentType, holderId, conversionTerms }
  → Convert SAFE/note to equity

POST /api/capital-events/buyback
  Body: { accountId, shareholderId, shares, action: 'cancel'|'treasury' }
  → Buy back shares from holder

GET  /api/capital-events/history?accountId=xxx
  → Full capital event timeline
```

---

## SVI Impact of Capital Events

| Event | SVI Dimension | Impact |
|-------|--------------|--------|
| Funding round | IRI (+15), CGH (+10) | Investor validation signal |
| ESOP grant | CGH (+5) | Governance maturity |
| Dynamic expansion | — | No direct impact (follows SVI) |
| Stock split | — | No impact (proportional) |
| SAFE conversion | IRI (+5) | Shows investor interest |
| Buyback | CGH (+3) | Shows governance (clean cap table) |

---

## Skills Used
- `/blockchain-expert` — Minting, burning, batch operations
- `/cto` — Capital event processing, cap table integration
- `/cfo` — Round economics, conversion calculations
- `/clo` — Legal compliance for share issuance

## Owner
- **Primary**: Blockchain Lead (CBO-001)
- **Support**: CTO, CFO, CLO

## Success Metrics
- [ ] All 6 capital event types process correctly off-chain
- [ ] On-chain minting queues automatically for each event type
- [ ] Batch operations handle 50+ mints in single flow
- [ ] Stock split correctly multiplies all shares + vesting schedules
- [ ] SAFE conversion calculates shares per cap/discount terms
- [ ] SVI auto-updates evidence after funding rounds
- [ ] Capital event history shows complete audit trail