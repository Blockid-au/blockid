# Blockchain C-Level Goals — Chief Blockchain Officer (CBO)

## Mission
Design and operate BlockID's private blockchain infrastructure so that every startup on the platform can tokenize equity, sync vesting schedules, distribute dividends, and transfer shares — while ensuring the **off-chain system is always the source of truth** and blockchain is an optional, toggleable transparency layer.

---

## Core Architecture Principle: Off-Chain First

```
┌─────────────────────────────────────────────────────────────────┐
│                    OFF-CHAIN (Supabase DB)                       │
│  ═══════════════════════════════════════════════════════════════  │
│  Source of Truth for ALL equity data:                            │
│  • Cap table (shareholders, share_classes, esop_pool)           │
│  • Vesting schedules (vesting_schedules, vesting_events)        │
│  • Share transactions (share_transactions)                      │
│  • Dividend records (dividend_records)                           │
│  • Share structure config (share_structure_config)               │
│                                                                  │
│  ✅ Always available                                             │
│  ✅ Full functionality without blockchain                        │
│  ✅ All calculations, dashboards, reports work independently     │
└──────────────────────┬──────────────────────────────────────────┘
                       │
              [Blockchain Sync Toggle]
              ON ↓ / OFF = no sync
                       │
┌──────────────────────▼──────────────────────────────────────────┐
│                    ON-CHAIN (BlockID Private EVM)                │
│  ═══════════════════════════════════════════════════════════════  │
│  Transparency & verification layer:                              │
│  • Per-startup ERC-20 token (custom ticker: BLK, AUS, etc.)    │
│  • Vesting grants (VestingVault.sol)                            │
│  • Dividend rounds (DividendDistributor.sol)                    │
│  • Transfer log (immutable on-chain)                            │
│  • Document hashes (SHA agreements, board resolutions)          │
│                                                                  │
│  ⚠ Optional — system works fully without this                   │
│  ⚠ Sync toggle per startup (on/off/catch-up)                   │
│  ⚠ On-chain reads verify off-chain data (audit function)       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Blockchain Sync Toggle Mechanism

### Per-Startup Toggle States
| State | Behavior |
|-------|----------|
| **OFF** (default) | No blockchain interaction. All equity managed in Supabase only. |
| **ON** | Real-time sync: every off-chain event triggers on-chain tx. |
| **PAUSED** | Sync stopped temporarily. Queue accumulates. |
| **CATCH-UP** | Re-sync all pending events since last sync. Auto-transitions to ON. |

### Sync Queue Architecture
```
Off-chain event (create/update/delete)
    ↓
Insert into `blockchain_sync_queue` table
    ↓
If toggle = ON → process immediately (async, non-blocking)
If toggle = OFF/PAUSED → stays in queue
    ↓
When toggle switches to ON or CATCH-UP:
    → Process all queued events in chronological order
    → Mark each as synced with tx_hash
    → Auto-transition to ON state
```

### Database: `blockchain_sync_queue`
```sql
CREATE TABLE blockchain_sync_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  event_type text NOT NULL,          -- 'mint', 'transfer', 'vest_grant', 'vest_revoke', 
                                     -- 'dividend_declare', 'dividend_claim', 'burn', 'accelerate'
  payload jsonb NOT NULL,            -- event-specific data
  priority integer DEFAULT 0,        -- 0=normal, 1=high (transfers)
  status text DEFAULT 'pending',     -- 'pending', 'processing', 'synced', 'failed', 'skipped'
  tx_hash text,                      -- on-chain tx hash when synced
  error_message text,                -- failure reason
  retry_count integer DEFAULT 0,
  max_retries integer DEFAULT 3,
  created_at timestamptz DEFAULT now(),
  processed_at timestamptz,
  CONSTRAINT valid_status CHECK (status IN ('pending','processing','synced','failed','skipped'))
);
```

### Database: `blockchain_sync_config`
```sql
CREATE TABLE blockchain_sync_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL UNIQUE,
  sync_enabled boolean DEFAULT false,
  sync_state text DEFAULT 'off',     -- 'off', 'on', 'paused', 'catching_up'
  token_address text,                -- deployed SVToken address
  token_symbol text,                 -- e.g. 'BLK', 'AUS'
  token_name text,                   -- e.g. 'BlockID Shares'
  last_sync_at timestamptz,
  last_sync_block bigint,
  pending_events integer DEFAULT 0,
  auto_sync_transfers boolean DEFAULT true,  -- sync transfers back from chain
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

---

## Per-Startup Token Creation

### Token Naming Convention (NASDAQ/ASX Style)
```
Format: 3-4 uppercase letters
Source: AI suggests based on startup name abbreviation

Examples:
  BlockID Pty Ltd → BLK or BLKD
  Auschain PTY LTD → AUS or AUSC
  TechVenture AI → TVA or TVAI
  GreenSolar Co → GSC or GSOL

Rules:
  1. 3-4 characters, uppercase A-Z only
  2. Must be unique across all BlockID startups
  3. AI suggests top 3 options, user picks or customizes
  4. Follows NASDAQ/ASX listing conventions
  5. Reserved: BID (BlockID native coin), ETH, BTC, USDT
```

### Token Creation Flow
```
Step 1: Startup activates blockchain sync
        → Show "Create Your Equity Token" modal

Step 2: Token configuration
        → AI suggests ticker: "Based on 'Auschain', we suggest: AUS, AUSC, ACH"
        → User selects or types custom ticker
        → Enter token name (defaults to company name + "Shares")
        → Confirm authorized shares (from share_structure_config)

Step 3: Deploy via TokenFactory
        → Call TokenFactory.createCompany(name, symbol, companyId, supply, admin)
        → Store token_address in blockchain_sync_config
        → Mint initial supply to admin wallet

Step 4: Distribute to shareholders
        → For each shareholder with EVM wallet:
           • Transfer their share allocation
           • If vesting: create VestingVault grant instead
        → Show batch progress (n/m minted)

Step 5: Confirmation
        → Show explorer link for token contract
        → "Add to MetaMask" button
        → Dashboard now shows on-chain balance column
```

---

## Share Transfer Sync (Bi-directional)

### Off-Chain → On-Chain (Dashboard triggers transfer)
```
User clicks "Transfer 10,000 shares from Alice to Bob" in dashboard
    ↓
1. Update shareholders table (shares_held for both)
2. Insert share_transactions record
3. If sync ON → queue blockchain_sync_queue event:
   { event_type: 'transfer', payload: { from, to, amount, reason } }
4. Sync processor calls SVToken.forcedTransfer(from, to, amount, reason)
5. Store tx_hash, mark synced
6. Dashboard shows ✅ "On-chain verified" badge
```

### On-Chain → Off-Chain (MetaMask wallet transfer)
```
Shareholder transfers tokens via MetaMask (peer-to-peer)
    ↓
1. On-chain Transfer event emitted
2. Cron job polls for new Transfer events (every 5 min)
   OR webhook from chain indexer
3. Match from/to addresses to known shareholders
4. Update shareholders table (shares_held for both)
5. Insert share_transactions (type: 'transfer', source: 'on_chain')
6. Dashboard auto-updates with new ownership %
7. If unknown address → flag for admin review
```

### Transfer Event Listener
```typescript
// web/src/lib/blockchain-event-listener.ts
export async function pollTransferEvents(tokenAddress: string, fromBlock: number) {
  // Read Transfer(from, to, amount) events from on-chain
  // Match addresses to known shareholders
  // Create off-chain records for any new transfers
  // Return new block height for next poll
}
```

---

## Dividend Distribution (Dual-Mode)

### Mode 1: Off-Chain Only (sync OFF)
```
Admin declares dividend in dashboard
    ↓
1. Calculate per-share amount (existing dividends.ts)
2. Record in dividend_records table
3. Show payout table with AU franking credits
4. Manual distribution (bank transfer, etc.)
5. Mark as "paid" when distributed
```

### Mode 2: On-Chain Distribution (sync ON)
```
Admin declares dividend in dashboard
    ↓
1. Same off-chain calculation
2. Queue blockchain event: 'dividend_declare'
3. Call SVToken.declareDividend{ value: totalAmount }
4. Each shareholder can claimDividend(roundId) via MetaMask
5. Poll claim events → update off-chain records
6. Dashboard shows: claimed/unclaimed per shareholder
```

### Hybrid: Off-Chain Calculation, Optional On-Chain Execution
- Dividend math ALWAYS runs off-chain (franking credits, tax calculations)
- On-chain is just the distribution mechanism (send tokens)
- If blockchain fails → fallback to manual distribution
- Dividend history always in Supabase regardless of chain state

---

## Additional Share Issuance

### Issuance Triggers
| Trigger | Off-Chain | On-Chain (if sync ON) |
|---------|-----------|----------------------|
| New funding round | Update share_classes + shareholders | Mint new tokens + distribute |
| ESOP grant | Update esop_pool + create vesting | Mint to VestingVault |
| SVI-based dynamic increase | Update authorized_shares | Mint delta to treasury |
| Stock split | Multiply all shares | Burn old + mint new (batch) |
| Conversion (SAFE/note) | Create new shareholder rows | Mint converted shares |

### Batch Minting Process
```
POST /api/blockchain/batch-mint
Body: { accountId, operations: [{ to, amount, reason }] }

1. Validate all operations
2. Check admin wallet has permission
3. Execute in single batch (gas-efficient):
   for each op:
     SVToken.mint(to, amount, partition, reason)
4. Store all tx_hashes
5. Update off-chain records if not already updated
```

---

## Responsibilities

1. **Chain Operations** — Cosmos node uptime, EVM module, block explorer
2. **Smart Contracts** — SVToken.sol, TokenFactory.sol, VestingVault.sol maintenance
3. **Sync Engine** — Off-chain ↔ on-chain bidirectional sync with queue
4. **Token Lifecycle** — Creation, minting, burning, transfers, splits
5. **Dividend On-Chain** — Declaration, claiming, franking credit integration
6. **MetaMask UX** — Connect, sign, add token, view balance, transfer
7. **Security** — Admin key management, transfer restrictions, whitelist
8. **Audit Trail** — On-chain verification of off-chain records

---

## KPIs

| Metric | Current | Q4 2026 | Q1 2027 | Q2 2027 |
|--------|---------|---------|---------|---------|
| Tokens deployed (startups) | 1 (Auschain) | 10 | 50 | 150 |
| Chain uptime | ~95% | 99% | 99.5% | 99.9% |
| Sync queue lag (avg) | N/A | <5 min | <2 min | <30s |
| Failed syncs (weekly) | N/A | <5 | <2 | 0 |
| Transfer sync accuracy | N/A | 99% | 99.9% | 99.99% |
| MetaMask adoption | ~5% | 15% | 30% | 50% |

---

## Quarterly OKRs

### Q3 2026 (NOW)
**O1: Establish off-chain-first vesting with optional sync**
- KR1: Vesting system works 100% without blockchain enabled
- KR2: Sync toggle (on/off/pause/catch-up) functional for 3 startups
- KR3: Batch sync processes 100+ queued events without failure

**O2: Per-startup token creation with NASDAQ-style naming**
- KR1: TokenFactory deploys custom-ticker tokens for 5+ startups
- KR2: AI suggests 3 ticker options per startup (>70% acceptance)
- KR3: "Add to MetaMask" flow works for all deployed tokens

### Q4 2026
**O1: Bi-directional transfer sync**
- KR1: Off-chain transfers appear on-chain within 5 minutes
- KR2: On-chain (MetaMask) transfers sync to dashboard within 5 minutes
- KR3: Unknown address transfers flagged for admin review

**O2: On-chain dividend distribution**
- KR1: Declare + claim flow works end-to-end
- KR2: AU franking credits calculated correctly off-chain
- KR3: 50% of token-enabled startups use on-chain dividends

### Q1 2027
**O1: Scale to 50+ startups with tokens**
- KR1: Sync queue handles 1000+ events/day
- KR2: Chain uptime >99.5%
- KR3: Zero data inconsistencies between off-chain and on-chain

---

## Sub-Goals

| Sub-Goal | File | Owner |
|----------|------|-------|
| Token Naming & Factory | [sub-blockchain-token-factory.md](sub-blockchain-token-factory.md) | Blockchain Lead + AI/ML Lead |
| Sync Engine (toggle + queue + catch-up) | [sub-blockchain-sync-engine.md](sub-blockchain-sync-engine.md) | Blockchain Lead + Backend Lead |
| Share Transfer Sync (bi-directional) | [sub-blockchain-transfer-sync.md](sub-blockchain-transfer-sync.md) | Blockchain Lead + Frontend Lead |
| Dividend Distribution (dual-mode) | [sub-blockchain-dividends.md](sub-blockchain-dividends.md) | Blockchain Lead + CFO |
| Additional Share Issuance | [sub-blockchain-issuance.md](sub-blockchain-issuance.md) | Blockchain Lead + CTO |
| Smart Contract Upgrades | [sub-blockchain-contracts.md](sub-blockchain-contracts.md) | Blockchain Lead + Security Lead |

---

## Skills Used
- `/blockchain-expert` — Cosmos SDK, smart contracts, tokenization
- `/cto` — Architecture, integration design
- `/secure-code-guardian` — Key management, access control
- `/cfo` — Dividend calculations, franking credits

## Direct Reports
- Blockchain Lead (CBO-001) — Smart contracts, chain ops
- Chain Ops Engineer (CBO-002) — Node management, monitoring
- Token Integration Lead (CBO-003) — Sync engine, API integration

## Auto-Upgrade Mandate
**Standing order**: Continuously monitor chain health, sync queue depth, and transfer accuracy. When blockchain is unavailable, ensure ZERO impact on off-chain operations. Proactively optimize gas costs, batch operations, and sync latency.