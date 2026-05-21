---
name: Vesting & Blockchain System Implementation
description: Off-chain-first vesting with optional blockchain sync, per-startup NASDAQ-style tokens, AI equity recommendations
type: project
---

Vesting & Dynamic Share Structure system built with off-chain-first architecture.

**Why:** Founders need equity management that works immediately without blockchain dependency. Blockchain is an optional transparency layer.

**How to apply:**
- All equity data in Supabase (source of truth). Blockchain sync is toggleable per startup.
- Key files: `ai-equity.ts`, `share-structure.ts`, `blockchain-sync.ts`, `vesting.ts`
- DB: `0032_vesting_schedules.sql` (vesting + share structure), `0034_blockchain_sync.sql` (sync queue + config)
- APIs: `/api/vesting/`, `/api/blockchain/sync-toggle`, `/api/blockchain/create-token`, `/api/blockchain/sync-status`, `/api/blockchain/verify`
- Crons: `/api/cron/vesting` (daily vest processing), `/api/cron/blockchain-sync` (5-min sync queue)
- Goals: `vesting-share-structure.md` (master), `blockchain-clevel-goals.md` (CBO), 6 sub-vesting + 6 sub-blockchain goals
- Credit pricing: Free setup, AI features 0.50-1.50 credits