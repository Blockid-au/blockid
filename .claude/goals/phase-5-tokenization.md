# Phase 5: Tokenization (Cosmos Blockchain) — PLANNED (Q2-Q3 2027)

## Goal: Map equity to on-chain tokens for transparent ownership

### Sub-goal 5.1: Cosmos Chain Setup
- [ ] Cosmos SDK app-chain scaffold (Ignite CLI)
- [ ] Token standard: Startup Token (name, symbol, total supply = total shares)
- [ ] Wallet infrastructure (custodial initially, self-custody later via Keplr/Leap)
- **Acceptance:** Private Cosmos chain running with token minting

### Sub-goal 5.2: Equity-to-Token Mapping
- [ ] Tokenization engine (cap table snapshot -> mint tokens)
- [ ] CosmWasm vesting smart contracts
- [ ] Bi-directional cap table <-> chain sync
- **Acceptance:** Equity changes in web app reflected on-chain

### Sub-goal 5.3: On-Chain Transparency
- [ ] Block explorer for BlockID chain
- [ ] Cryptographic proof of ownership (for investor decks)
- [ ] IBC readiness for future interoperability (USDC on Osmosis)
- **Acceptance:** Investor can verify ownership on public explorer