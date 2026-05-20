# Phase 5: Tokenization (Private Cosmos Testnet) — ✅ INFRASTRUCTURE LIVE

## IMPORTANT: Private Testnet Only
- **NOT connected to Cosmos mainnet** — this is a standalone private chain
- **NOT a cryptocurrency** — tokens represent startup equity shares only
- **No real financial value** on-chain — value is backed by legal cap table
- Used for: transparent ownership tracking, vesting automation, dividend distribution
- Future: if/when ready for mainnet, tokens can be migrated via IBC bridge

## Chain Details
- **Chain ID**: blockid-testnet-1
- **RPC**: https://chain.blockid.au
- **Explorer**: https://explorer.blockid.au
- **SDK**: Cosmos SDK v0.50.12, CometBFT consensus
- **Token**: SHARE (ushare, 6 decimals) — 1 share = 1,000,000 ushare
- **Infrastructure**: systemd services, auto-restart, Cloudflare DNS

## Goal: Map equity to on-chain tokens for transparent ownership

### Sub-goal 5.1: Cosmos Chain Setup ✅ COMPLETE
- [x] Cosmos SDK chain scaffold (simd v0.50.12)
- [x] Validator node running (systemd service)
- [x] Block explorer (Ping.pub) at explorer.blockid.au
- [x] Nginx routing (GitLab nginx, SSL via Cloudflare)
- [x] Cloudflare DNS auto-update (DDNS every 5 min)
- [x] Tokenization engine (web/src/lib/tokenization.ts)
- [x] Tokenization API (/api/tokenization)
- **Status:** Chain producing blocks, explorer live

### Sub-goal 5.2: Equity-to-Token Mapping ⚡ IN PROGRESS
- [x] sharesToTokens/tokensToShares conversion (6 decimal precision)
- [x] generateTokenizationPlan (cap table → mint requests)
- [x] calculateVestingSchedule (month-by-month with cliff)
- [ ] CosmWasm vesting smart contracts (Rust)
- [ ] Bi-directional cap table ↔ chain sync
- [ ] Mint/burn transactions from web app
- **Acceptance:** Equity changes in web app reflected on-chain

### Sub-goal 5.3: On-Chain Transparency
- [x] Block explorer for BlockID private testnet
- [x] MetaMask chain config generator (getMetaMaskChainConfig)
- [ ] Cryptographic proof of ownership (for investor decks)
- [ ] Wallet connection UI in workspace
- [ ] IBC readiness for future interoperability (Cosmos mainnet bridge)
- **Note:** IBC bridge = future mainnet migration path, not needed for testnet