# Sub-Goal: Blockchain Sync Engine — Toggle, Queue, Catch-Up

## Parent Goal
`goals/blockchain-clevel-goals.md`

## Mission
Build a robust, toggleable sync engine that queues all equity events and processes them on-chain when enabled — with graceful degradation when blockchain is unavailable and automatic catch-up when re-enabled.

---

## Architecture

### Event Flow
```
Any equity event in the system
(create vesting, transfer shares, declare dividend, mint, burn, etc.)
    ↓
Insert into blockchain_sync_queue
    ↓
Check blockchain_sync_config.sync_enabled
    ↓
┌─── sync_enabled = false ────┐    ┌─── sync_enabled = true ───────┐
│ Event stays in queue         │    │ Sync Processor picks it up    │
│ Status: 'pending'            │    │ Executes on-chain tx          │
│ Zero blockchain interaction  │    │ Stores tx_hash                │
│ Off-chain system unaffected  │    │ Status: 'synced'              │
└─────────────────────────────┘    └────────────────────────────────┘
    ↓                                        ↓
User toggles sync ON                  If tx fails:
    ↓                                  retry_count++
Catch-Up Mode activates               If retry_count > max_retries:
    ↓                                    status: 'failed'
Process ALL pending events               alert admin
in chronological order                   off-chain unaffected
    ↓
All synced → transition to ON
```

### Sync Processor Service

```typescript
// web/src/lib/blockchain-sync-processor.ts

export async function processSyncQueue(accountId: string): Promise<SyncResult> {
  // 1. Get blockchain_sync_config for this account
  // 2. If sync not enabled → return early
  // 3. Fetch pending events from queue (ordered by created_at ASC)
  // 4. For each event:
  //    a. Set status = 'processing'
  //    b. Execute appropriate on-chain tx based on event_type
  //    c. If success: store tx_hash, set status = 'synced'
  //    d. If fail: increment retry_count, set status = 'failed' if max reached
  // 5. Update pending_events count in config
  // 6. Return { processed, synced, failed, remaining }
}

export async function catchUpSync(accountId: string): Promise<CatchUpResult> {
  // 1. Set sync_state = 'catching_up'
  // 2. Count total pending events
  // 3. Process in batches of 20
  // 4. Report progress: { batch, total, processed, errors }
  // 5. When all done: set sync_state = 'on'
  // 6. Return full result
}
```

### Event Type Handlers

```typescript
const EVENT_HANDLERS: Record<string, (payload: any, config: SyncConfig) => Promise<TxResult>> = {
  // Share operations
  'mint': async (p, c) => mintTokens(c.tokenAddress, p.to, p.amount),
  'burn': async (p, c) => burnTokens(c.tokenAddress, p.amount),
  'transfer': async (p, c) => forcedTransfer(c.tokenAddress, p.from, p.to, p.amount, p.reason),
  
  // Vesting operations  
  'vest_grant': async (p, c) => grantVesting(c.tokenAddress, p.beneficiary, p.amount, p.cliff, p.duration),
  'vest_revoke': async (p, c) => revokeVesting(c.tokenAddress, p.beneficiary),
  'vest_accelerate': async (p, c) => accelerateGrant(c.tokenAddress, p.beneficiary, p.grantId, p.pct),
  
  // Dividend operations
  'dividend_declare': async (p, c) => declareDividend(c.tokenAddress, p.totalAmount),
  
  // Share class operations
  'configure_class': async (p, c) => configureShareClass(c.tokenAddress, p.partition, p.config),
  
  // Document operations
  'attach_document': async (p, c) => setDocument(c.tokenAddress, p.name, p.uri, p.hash),
};
```

---

## API Endpoints

### Sync Management
```
GET  /api/blockchain/sync-status?accountId=xxx
     → { syncEnabled, syncState, pendingEvents, lastSyncAt, tokenAddress }

POST /api/blockchain/sync-toggle
     Body: { accountId, action: 'enable' | 'disable' | 'pause' | 'catch_up' }
     → Starts/stops sync, triggers catch-up if needed

GET  /api/blockchain/sync-queue?accountId=xxx&status=pending
     → List of queued events with their status

POST /api/blockchain/sync-retry
     Body: { accountId, eventId }
     → Retry a specific failed event
```

### Cron Endpoint
```
GET /api/cron/blockchain-sync
    Auth: CRON_SECRET
    Frequency: Every 5 minutes
    
    1. Find all accounts where sync_enabled = true AND pending_events > 0
    2. For each account: processSyncQueue(accountId)
    3. Log metrics: total_processed, total_failed, queue_depth
```

---

## Queue Integration Points

### Where Events Are Queued

Every off-chain equity mutation must queue a sync event. Integration points:

```typescript
// After creating vesting schedule:
await queueSyncEvent(accountId, 'vest_grant', {
  beneficiary: shareholderEvmAddress,
  amount: sharesToTokens(totalShares),
  cliff: monthsToSeconds(cliffMonths),
  duration: monthsToSeconds(vestingMonths),
});

// After share transfer:
await queueSyncEvent(accountId, 'transfer', {
  from: fromEvmAddress,
  to: toEvmAddress,
  amount: sharesToTokens(shares),
  reason: `Transfer: ${description}`,
});

// After dividend declaration:
await queueSyncEvent(accountId, 'dividend_declare', {
  totalAmount: ethers.parseEther(totalAmountAud.toString()),
});

// After minting new shares:
await queueSyncEvent(accountId, 'mint', {
  to: evmAddress,
  amount: sharesToTokens(shares),
});
```

### Helper Function
```typescript
export async function queueSyncEvent(
  accountId: string,
  eventType: string,
  payload: Record<string, unknown>,
  priority: number = 0,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  
  await supabase.from('blockchain_sync_queue').insert({
    account_id: accountId,
    event_type: eventType,
    payload,
    priority,
    status: 'pending',
  });
  
  // Increment pending count
  await supabase.rpc('increment_pending_events', { p_account_id: accountId });
}
```

---

## Error Handling & Recovery

### Retry Strategy
```
Attempt 1: Immediate
Attempt 2: After 1 minute
Attempt 3: After 5 minutes
After 3 failures: Mark as 'failed', alert admin, continue with next event

Failed events do NOT block the queue — subsequent events continue processing.
```

### Failure Scenarios

| Scenario | Impact | Recovery |
|----------|--------|----------|
| Chain offline | Sync pauses | Auto-retry when chain returns |
| Insufficient gas | Tx reverts | Flag admin (shouldn't happen — free gas) |
| Contract error | Tx reverts | Log error, skip event, alert |
| Admin key compromised | Security risk | Rotate key, pause all syncs |
| DB → Chain data mismatch | Data integrity | Run verification audit |
| Queue overflow (>10K events) | Slow catch-up | Batch processing, progress UI |

### Verification Audit
```
POST /api/blockchain/verify
Body: { accountId }

For each shareholder with EVM address:
  1. Read on-chain balance
  2. Read off-chain shares_held
  3. Compare (with token decimal conversion)
  4. Flag discrepancies
  5. Return: { verified, discrepancies: [...] }
```

---

## Dashboard UI: Sync Status Widget

```
┌─────────────────────────────────────────┐
│  Blockchain Sync                        │
│                                         │
│  Token: AUS (Auschain Shares)           │
│  Contract: 0xa16E...d2be [View →]       │
│                                         │
│  Status: ● ON (syncing)                 │
│  Last Sync: 2 minutes ago               │
│  Pending: 0 events                      │
│                                         │
│  [Pause Sync] [Run Verification]        │
│                                         │
│  Recent Sync Activity:                  │
│  ✅ Transfer: Alice → Bob (10K shares)  │
│  ✅ Vesting grant: Charlie (50K)        │
│  ❌ Mint failed: retry in 5min          │
└─────────────────────────────────────────┘
```

---

## Performance Requirements

| Metric | Target |
|--------|--------|
| Queue insert latency | <50ms |
| Sync processing per event | <10s (including chain confirmation) |
| Catch-up throughput | 20 events/minute |
| Max queue depth before warning | 100 events |
| Max queue depth before throttle | 1000 events |
| Verification audit speed | <30s for 50 shareholders |

---

## Skills Used
- `/blockchain-expert` — Chain interaction, tx management
- `/cto` — Queue architecture, cron design
- `/monitoring-expert` — Alerting, metrics
- `/database-optimizer` — Queue query performance

## Owner
- **Primary**: Blockchain Lead (CBO-001)
- **Support**: Backend Lead (CTO-002), DevOps Lead (COO-003)

## Success Metrics
- [ ] Toggle on/off/pause/catch-up all functional
- [ ] Queue processes 100+ events without failure during catch-up
- [ ] No off-chain functionality impacted when sync is OFF
- [ ] Failed events don't block queue progression
- [ ] Verification audit detects 100% of discrepancies
- [ ] Cron processes pending events every 5 minutes
- [ ] Admin alerted within 1 minute of sync failure