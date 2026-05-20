# Phase 5: Equity Wallet — BlockID.au - Startup Value Chain

## Mission
Every startup on BlockID.au gets a **blockchain-based equity wallet** where shares = tokens. Shareholders manage equity via MetaMask, zero gas fees.

## Chain: BlockID.au - Startup Value Chain
- **Chain ID**: 420 (0x1A4)
- **RPC**: https://chain.blockid.au/evm
- **Explorer**: https://explorer.blockid.au
- **Gas**: 0 (free transactions)
- **Currency**: BID (BlockID Coin)
- **Private standalone** — NOT connected to any public blockchain

## Deployed Contracts
- **TokenFactory**: `0x5FbDB2315678afecb367f032d93F642f64180aa3`
- **SVT Token**: `0xa16E02E87b7454126E5E10d957A927A7F5B5d2be` (20M shares, Auschain Pty Ltd)

## Sub-Goals Status

### 5.1: Chain + EVM ✅ COMPLETE
- [x] Cosmos chain running (blockid-testnet-1)
- [x] Anvil EVM layer (chain ID 420, port 8545)
- [x] Zero gas fee configuration
- [x] Block explorer at explorer.blockid.au
- [x] EVM RPC via nginx at chain.blockid.au/evm
- [x] Systemd services (auto-restart)
- [x] Cloudflare DNS + DDNS auto-update

### 5.2: Token Factory ✅ COMPLETE
- [x] SVToken.sol — ERC-1400 (partitions, vesting, dividends, documents)
- [x] TokenFactory.sol — admin creates company = deploys token
- [x] Deployed SVT with 20M shares
- [x] Foundry toolchain (forge, cast, anvil)

### 5.3: MetaMask Wallet ✅ COMPLETE
- [x] wallet.ts — connect, balance, transfer, mint, burn, vesting
- [x] /workspace/wallet — portfolio, transfer, vesting view
- [x] Auto-add chain + token to MetaMask

### 5.4: Admin Token Management ✅ COMPLETE
- [x] /admin/tokens — table, mint, burn, create

### 5.5: Cap Table ↔ Chain Sync ⚡ BUILDING
### 5.6: ESOP Vesting Wizard ⚡ BUILDING
### 5.7: Dividend Distribution ⚡ BUILDING
### 5.8: Transfer Restrictions — PLANNED