# Phase 5: Equity Wallet System — SVT (Startup Value Token)

## Mission
Every startup on BlockID.au gets a **blockchain-based equity wallet** where shares are represented as tokens on BlockID's private Cosmos chain. Shareholders manage equity via MetaMask, with zero gas fees.

## Architecture

```
┌─ BlockID.au Web App ─────────────────────────────────┐
│                                                        │
│  Admin creates company → Mints new token (e.g. ACME)  │
│  Founder gets wallet → Receives shares as tokens       │
│  Transfer shares → MetaMask tx (0 gas)                │
│  ESOP grant → Vesting smart contract                  │
│  Dividend → Auto-distribute to token holders           │
│  Raise round → Mint new tokens (dilution)             │
│                                                        │
├─ MetaMask (EVM compatible) ──────────────────────────┤
│  User connects MetaMask → sees all company tokens     │
│  Send/receive shares → sign tx in MetaMask            │
│  View portfolio → all companies, all tokens           │
│                                                        │
├─ BlockID Private Chain (Cosmos + Ethermint EVM) ─────┤
│  Chain: blockid-testnet-1                              │
│  Gas: 0 (free transactions for all users)             │
│  Base token: BID (BlockID Coin — gas/utility)         │
│                                                        │
│  Per-company tokens (ERC-20 on EVM):                  │
│    ACME → 10,000,000 tokens (= 10M shares)           │
│    BETA → 20,000,000 tokens                            │
│    Each token = 1 share of that company               │
│                                                        │
│  Smart Contracts:                                      │
│    TokenFactory → admin mints new company tokens      │
│    VestingVault → ESOP with cliff + monthly vest      │
│    DividendDistributor → profit sharing               │
│    ShareTransfer → peer-to-peer with restrictions     │
└────────────────────────────────────────────────────────┘
```

## Token Design

### BID (BlockID Coin) — Base/Gas Token
- **Purpose**: Platform utility token, gas token (set to 0 fee)
- **Supply**: Unlimited (minted by admin as needed for gas subsidies)
- **Usage**: All gas fees denominated in BID but set to 0
- **NOT for trading** — purely operational

### SVT (Startup Value Token) — Template
- **Purpose**: Template for per-company equity tokens
- **Each company gets its own token**: ACME, BETA, etc.
- **1 token = 1 share** of that company
- **Initial supply**: Set by admin (e.g. 20,000,000 = 20M shares)
- **Mintable**: Admin can mint more (= issuing new shares / fundraise round)
- **Burnable**: Admin can burn (= share buyback)
- **Transferable**: Shareholders can transfer to each other
- **Divisible**: 6 decimals (can represent fractional shares)

## Sub-Goals

### 5.1: Zero-Gas Chain Configuration ✅ PARTIALLY DONE
- [x] Cosmos chain running (blockid-testnet-1)
- [x] Block explorer (explorer.blockid.au)
- [ ] Install Ethermint EVM module for MetaMask compatibility
- [ ] Set minimum gas price to 0 in chain config
- [ ] Set default gas limit high enough for contract deployment
- [ ] Verify MetaMask can connect with 0 gas
- **Acceptance**: MetaMask connects, tx costs 0

### 5.2: Token Factory Smart Contract
- [ ] ERC-20 token factory contract (Solidity on Ethermint EVM)
- [ ] `createToken(name, symbol, initialSupply, admin)` → deploys new ERC-20
- [ ] `mint(token, to, amount)` → admin mints new shares
- [ ] `burn(token, amount)` → admin burns shares (buyback)
- [ ] Token registry: maps company_id → token address
- [ ] Only BlockID admin can create new tokens
- **Acceptance**: Admin creates "ACME" token with 20M supply

### 5.3: MetaMask Wallet Integration
- [ ] EVM JSON-RPC endpoint on chain (port 8545)
- [ ] "Connect Wallet" button in BlockID workspace
- [ ] Auto-add BlockID chain to MetaMask (chainId, RPC, symbol)
- [ ] Display all company tokens in wallet
- [ ] Token balance shown in BlockID dashboard
- **Acceptance**: User connects MetaMask, sees share balance

### 5.4: Share Transfer System
- [ ] Transfer shares via MetaMask (ERC-20 transfer)
- [ ] Transfer restrictions (admin can pause transfers)
- [ ] Right of first refusal (notify other shareholders before transfer)
- [ ] Transfer history logged on-chain + in web DB
- [ ] Cap table auto-updates from on-chain events
- **Acceptance**: Founder transfers 1000 shares to co-founder via MetaMask

### 5.5: ESOP Vesting Contract
- [ ] VestingVault contract: grant tokens with vesting schedule
- [ ] Parameters: beneficiary, total, cliff (months), vesting (months)
- [ ] Monthly release after cliff
- [ ] Revocable by admin (if employee leaves)
- [ ] Accelerated vesting (single/double trigger for acquisition)
- [ ] Exercise mechanism (employee claims vested tokens)
- **Acceptance**: Employee sees vesting schedule, claims after cliff

### 5.6: Dividend Distribution
- [ ] DividendDistributor contract
- [ ] Admin deposits BID/stablecoin as dividend pool
- [ ] Auto-distribute proportional to token holdings
- [ ] Snapshot at dividend date (prevent front-running)
- [ ] Claim function for shareholders
- [ ] History + AU franking credit tracking (off-chain)
- **Acceptance**: Dividend distributed to all token holders proportionally

### 5.7: Admin Token Management (Web UI)
- [ ] `/admin/tokens` — Token factory dashboard
- [ ] Create new company token (name, symbol, supply)
- [ ] Mint additional tokens (fundraise round)
- [ ] View all companies + total supply + holders
- [ ] ESOP grant wizard
- [ ] Dividend distribution wizard
- **Acceptance**: Admin creates company, mints tokens, distributes ESOP

### 5.8: Workspace Equity Wallet
- [ ] `/workspace/wallet` — User's equity portfolio
- [ ] Connect MetaMask button
- [ ] All company tokens with balances
- [ ] Transfer shares (send to address)
- [ ] Vesting schedule view
- [ ] Dividend claim button
- [ ] Transaction history
- **Acceptance**: Full equity management from workspace

## Technical Stack

| Component | Technology |
|-----------|-----------|
| Chain | Cosmos SDK + Ethermint (EVM module) |
| Smart Contracts | Solidity (ERC-20, Factory, Vesting, Dividend) |
| Wallet | MetaMask (EVM-compatible) |
| EVM RPC | JSON-RPC on port 8545 |
| Web Integration | ethers.js / viem in Next.js |
| Explorer | explorer.blockid.au (Ping.pub) |

## Zero Gas Fee Configuration

```toml
# app.toml
[evm]
# Set minimum gas price to 0
minimum-gas-price = "0abid"

# genesis.json
"fee_market": {
  "params": {
    "min_base_fee": "0",
    "base_fee": "0"
  }
}
```

## Token Factory Contract (Solidity)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract CompanyToken is ERC20, Ownable {
    constructor(
        string memory name,
        string memory symbol,
        uint256 initialSupply,
        address admin
    ) ERC20(name, symbol) Ownable(admin) {
        _mint(admin, initialSupply * 10**decimals());
    }

    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }

    function burn(uint256 amount) public {
        _burn(msg.sender, amount);
    }
}

contract TokenFactory is Ownable {
    mapping(string => address) public tokens;
    string[] public tokenSymbols;

    event TokenCreated(string symbol, address tokenAddress, uint256 initialSupply);

    function createToken(
        string memory name,
        string memory symbol,
        uint256 initialSupply
    ) public onlyOwner returns (address) {
        require(tokens[symbol] == address(0), "Token already exists");
        CompanyToken token = new CompanyToken(name, symbol, initialSupply, msg.sender);
        tokens[symbol] = address(token);
        tokenSymbols.push(symbol);
        emit TokenCreated(symbol, address(token), initialSupply);
        return address(token);
    }

    function getToken(string memory symbol) public view returns (address) {
        return tokens[symbol];
    }

    function getAllTokens() public view returns (string[] memory) {
        return tokenSymbols;
    }
}
```

## Execution Plan

| Step | Task | Owner | Priority |
|------|------|-------|----------|
| 1 | Install Ethermint module on chain | Blockchain Expert | P0 |
| 2 | Configure zero gas fees | Blockchain Expert | P0 |
| 3 | Deploy TokenFactory contract | Blockchain Expert | P0 |
| 4 | Create first SVT token (20M supply) | Blockchain Expert | P0 |
| 5 | MetaMask wallet connection UI | CTO | P0 |
| 6 | Admin token management page | CTO | P1 |
| 7 | Share transfer via MetaMask | CTO + Blockchain | P1 |
| 8 | Vesting contract deployment | Blockchain Expert | P1 |
| 9 | ESOP grant wizard | CTO | P2 |
| 10 | Dividend distribution contract | Blockchain Expert | P2 |
| 11 | Cap table ↔ chain bi-directional sync | CTO | P2 |
| 12 | Workspace equity wallet page | CTO + CPO | P2 |

## Cross-Agent Collaboration
- **Blockchain Expert**: Chain setup, smart contracts, EVM config
- **CTO**: Web integration, MetaMask UI, API endpoints
- **CPO**: Wallet UX, token management UX
- **CFO**: Dividend calculations, franking credits, tax reporting
- **CRO**: Token-based investor engagement