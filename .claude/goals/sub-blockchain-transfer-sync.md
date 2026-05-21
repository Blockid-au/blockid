# Sub-Goal: Share Transfer & Dashboard Sync (Bi-directional)

## Parent Goal
`goals/blockchain-clevel-goals.md`

## Mission
Enable seamless bi-directional share transfers: dashboard-initiated transfers sync to blockchain, and MetaMask wallet transfers sync back to the off-chain dashboard — keeping both systems consistent.

---

## Direction 1: Off-Chain → On-Chain

### Flow
```
User clicks "Transfer Shares" in cap table dashboard
    ↓
1. Validate: sender has enough shares, recipient exists
2. Update off-chain: 
   - shareholders.shares_held (decrease sender, increase recipient)
   - shareholders.ownership_pct (recalculate all)
   - share_transactions (insert record)
3. Queue sync: blockchain_sync_queue.insert({ event_type: 'transfer' })
4. If sync ON → processor calls SVToken.forcedTransfer(from, to, amount, reason)
5. Dashboard shows:
   - Immediate: new balances (off-chain)
   - When synced: ✅ "On-chain verified" badge with tx hash link
```

### Transfer UI Enhancement
```
┌─────────────────────────────────────────┐
│  Transfer Shares                        │
│                                         │
│  From: [Alice (CEO) ▼]                  │
│  To:   [Bob (CTO)   ▼]                 │
│  Shares: [100,000   ]                  │
│  Reason: [Performance bonus    ]        │
│                                         │
│  Summary:                               │
│  Alice: 5,000,000 → 4,900,000 (49%)    │
│  Bob:   3,000,000 → 3,100,000 (31%)    │
│                                         │
│  ☑ Sync to blockchain (if enabled)     │
│                                         │
│  [Transfer →]                           │
└─────────────────────────────────────────┘
```

---

## Direction 2: On-Chain → Off-Chain

### Problem
When a shareholder transfers tokens directly via MetaMask (peer-to-peer), the off-chain database doesn't know about it. We need to detect these transfers and update the dashboard.

### Solution: Transfer Event Polling

```typescript
// web/src/lib/blockchain-event-listener.ts

interface TransferEvent {
  from: string;
  to: string;
  amount: bigint;
  txHash: string;
  blockNumber: number;
  timestamp: number;
}

export async function pollTransferEvents(
  tokenAddress: string,
  fromBlock: number,
): Promise<{ events: TransferEvent[]; newBlockHeight: number }> {
  // 1. Query EVM logs for Transfer(address,address,uint256) events
  //    from fromBlock to 'latest'
  // 2. Decode each event
  // 3. Return events + new block height
}

export async function processTransferEvent(
  accountId: string,
  event: TransferEvent,
): Promise<SyncResult> {
  // 1. Match 'from' address to known shareholder
  // 2. Match 'to' address to known shareholder
  // 3. If both known:
  //    - Update shareholders.shares_held for both
  //    - Insert share_transactions (source: 'on_chain', tx_hash)
  //    - Recalculate ownership_pct for all shareholders
  // 4. If 'to' is unknown address:
  //    - Create pending_transfer_review record
  //    - Alert admin: "Unknown recipient detected"
  //    - Do NOT auto-create shareholder (security)
  // 5. If 'from' is unknown:
  //    - This shouldn't happen (only minted tokens can transfer)
  //    - Alert admin: "Suspicious transfer from unknown address"
  // 6. Return result with status
}
```

### Cron: Transfer Event Scanner
```
GET /api/cron/blockchain-transfers
Auth: CRON_SECRET
Frequency: Every 5 minutes

For each account where sync_enabled = true:
  1. Get last_sync_block from blockchain_sync_config
  2. pollTransferEvents(tokenAddress, lastBlock + 1)
  3. For each new Transfer event:
     a. Check if it was initiated by OUR sync (already in queue as 'synced')
     b. If NOT our sync → it's a MetaMask-initiated transfer
     c. processTransferEvent(accountId, event)
  4. Update last_sync_block
  5. Log: { account, eventsFound, processed, unknown }
```

### Identifying Our Own Transfers
```
When we sync a transfer off-chain → on-chain:
  - We store the tx_hash in blockchain_sync_queue
  - When the Transfer event appears, we match it against our queue
  - If tx_hash matches → skip (already recorded off-chain)
  - If tx_hash NOT in our queue → external transfer → process
```

---

## Unknown Address Handling

### Scenario: Token sent to address not in our shareholder list
```
1. Create record in pending_transfer_reviews:
   { account_id, from_address, to_address, amount, tx_hash, status: 'pending' }
   
2. Alert admin via dashboard notification:
   "⚠ Unknown transfer detected: 50,000 AUS tokens sent to 0xABCD..."
   
3. Admin options:
   a. "Add as new shareholder" → create shareholder record, assign shares
   b. "Link to existing" → map address to existing shareholder
   c. "Flag as suspicious" → no off-chain change, logged for audit
   d. "Ignore" → mark as reviewed, no action
```

### Database: Pending Transfer Reviews
```sql
CREATE TABLE pending_transfer_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  from_address text NOT NULL,
  to_address text NOT NULL,
  amount bigint NOT NULL,
  tx_hash text NOT NULL UNIQUE,
  block_number bigint,
  status text DEFAULT 'pending',  -- 'pending', 'resolved', 'flagged', 'ignored'
  resolution text,                -- 'new_shareholder', 'linked', 'suspicious', 'ignored'
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now()
);
```

---

## Dashboard Enhancements

### Shareholders Table: On-Chain Column
```
| Name  | Role    | Shares    | % Own | On-Chain     | Wallet        |
|-------|---------|-----------|-------|--------------|---------------|
| Alice | Founder | 5,000,000 | 50%   | ✅ Synced    | 0x1a2b...    |
| Bob   | CTO     | 3,000,000 | 30%   | ✅ Synced    | 0x3c4d...    |
| ESOP  | Pool    | 2,000,000 | 20%   | ⏳ Pending   | (vault)       |
```

### Transfer History with Source
```
| Date       | From  | To    | Shares  | Source         | Tx Hash     |
|------------|-------|-------|---------|----------------|-------------|
| 2026-06-15 | Alice | Bob   | 100,000 | Dashboard      | 0xabc... ✅ |
| 2026-06-14 | Bob   | Carol | 50,000  | MetaMask (P2P) | 0xdef... ✅ |
| 2026-06-10 | Admin | Alice | 5M      | Initial Mint   | 0x123... ✅ |
```

### Real-Time Balance Verification
```
Button: [Verify On-Chain Balances]

For each shareholder:
  Read on-chain balance via getTokenBalance()
  Compare with off-chain shares_held
  Show: ✅ Match | ⚠ Mismatch (off-chain: 5M, on-chain: 4.9M)
```

---

## Transfer Restrictions Integration

### Respect SVToken Transfer Controls
```
The SVToken.sol already has:
- setTransfersPaused(bool) — Pause all transfers
- setWhitelistEnabled(bool) — Whitelist-only
- setWhitelisted(address, bool) — Per-address whitelist

Off-chain mirror:
- If transfers are paused on-chain → show "Transfers Paused" in dashboard
- If whitelist enabled → only allow transfers to whitelisted addresses
- Dashboard should read on-chain restriction state and enforce matching rules
```

---

## API Endpoints

```
POST /api/blockchain/transfer
  Body: { accountId, fromShareholderId, toShareholderId, shares, reason }
  → Execute off-chain transfer + queue on-chain sync

GET  /api/blockchain/transfers?accountId=xxx
  → Transfer history (both sources: dashboard + on-chain)

GET  /api/blockchain/pending-reviews?accountId=xxx
  → List unknown address transfers pending admin review

POST /api/blockchain/resolve-review
  Body: { reviewId, resolution, newShareholderData? }
  → Resolve a pending transfer review

POST /api/blockchain/verify-balances
  Body: { accountId }
  → Compare all off-chain vs on-chain balances
```

---

## Skills Used
- `/blockchain-expert` — Event polling, transfer processing
- `/cto` — API design, cron architecture
- `/secure-code-guardian` — Unknown address handling, fraud detection
- `/ui-ux-pro-max` — Transfer UI, verification badges

## Owner
- **Primary**: Blockchain Lead (CBO-001)
- **Support**: Frontend Lead (CTO-001), Security Lead (CTO-004)

## Success Metrics
- [ ] Dashboard transfers sync to chain within 5 minutes
- [ ] MetaMask transfers sync to dashboard within 5 minutes
- [ ] Unknown address transfers flagged 100% of the time
- [ ] Balance verification passes for all synced shareholders
- [ ] Transfer source (dashboard vs MetaMask) visible in history
- [ ] Transfer restrictions (pause/whitelist) enforced consistently