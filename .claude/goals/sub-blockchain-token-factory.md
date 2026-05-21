# Sub-Goal: Token Naming & Factory — Per-Startup Custom Tokens

## Parent Goal
`goals/blockchain-clevel-goals.md`

## Mission
Enable each startup on BlockID to create a unique ERC-20 equity token with a NASDAQ/ASX-style ticker symbol, deployed via TokenFactory on the BlockID private chain.

---

## Token Naming System

### Naming Rules (NASDAQ/ASX Convention)
```
1. Length: 3-4 uppercase characters (A-Z only)
2. Uniqueness: Must be unique across ALL BlockID startups
3. Reserved tickers: BID, ETH, BTC, USDT, USDC, BNB, SOL, ADA, DOT, AVAX
4. No numbers, no special characters
5. Should be intuitive abbreviation of startup name
```

### AI Ticker Suggestion Engine
**API**: `POST /api/ai/suggest-ticker`
**Cost**: 0 credits (included in token creation flow)

```typescript
interface TickerSuggestion {
  ticker: string;        // e.g. "AUS"
  rationale: string;     // "First 3 letters of Auschain"
  available: boolean;    // checked against deployed tokens
  similarity: string[];  // similar tickers that exist
}

// AI prompt context:
// "Suggest 3 NASDAQ/ASX-style tickers for '{startupName}'.
//  Rules: 3-4 chars, uppercase, intuitive abbreviation.
//  Already taken: {existingTickers}.
//  Follow patterns like: Apple→AAPL, Google→GOOG, Meta→META"
```

### AI Suggestion Algorithm
```
Input: "TechVenture AI Pty Ltd"
Step 1: Extract abbreviations → TVA, TVAI, TVI, TEV
Step 2: Check availability against blockchain_sync_config.token_symbol
Step 3: Rank by intuitiveness + uniqueness
Output: [
  { ticker: "TVA",  rationale: "TechVenture AI initials", available: true },
  { ticker: "TVAI", rationale: "Full abbreviation", available: true },
  { ticker: "TEV",  rationale: "TechVenture shortened", available: true }
]
```

---

## Token Creation Flow

### Step-by-Step UX

#### Step 1: Activation
```
User navigates to /workspace/blockchain or clicks "Enable Blockchain" in cap table
    ↓
Modal: "Create Your Equity Token"
  "Tokenize your cap table on BlockID's private blockchain.
   Your equity data stays in our database — blockchain adds
   transparency and enables MetaMask wallet transfers."
  [Get Started →]
```

#### Step 2: Token Configuration
```
┌─────────────────────────────────────────┐
│  Create Equity Token                     │
│                                          │
│  Token Name: [Auschain Shares      ]    │
│              (auto-filled from startup)  │
│                                          │
│  Ticker Symbol:                          │
│  AI Suggests:                            │
│  [AUS ✓] [AUSC] [ACH]                  │
│  Or type custom: [____]                  │
│                                          │
│  Total Supply: 10,000,000               │
│  (from your share structure config)      │
│                                          │
│  Decimals: 6 (standard)                 │
│                                          │
│  [Deploy Token →] (requires MetaMask)    │
└─────────────────────────────────────────┘
```

#### Step 3: MetaMask Deployment
```
1. Check MetaMask connected → prompt if not
2. Check on BlockID chain → switch if needed
3. Call TokenFactory.createCompany(name, symbol, companyId, supply, adminAddr)
4. Show: "Deploying... ⏳" with tx hash link
5. Wait for confirmation (1 block, ~5s)
6. Store: token_address, symbol, name in blockchain_sync_config
7. Show: "✅ Token deployed! Contract: 0x..."
8. Offer: "Add [AUS] to MetaMask"
```

#### Step 4: Initial Distribution
```
After token deployed:
"Distribute tokens to your shareholders?"

Show shareholders list:
  ┌──────────────────────────────────────────┐
  │ Name      │ Shares    │ Wallet    │ Mint │
  │ Alice     │ 5,000,000 │ 0x1a...  │ ✅   │
  │ Bob       │ 3,000,000 │ 0x2b...  │ ✅   │
  │ ESOP Pool │ 2,000,000 │ (vault)  │ ✅   │
  └──────────────────────────────────────────┘

  [Mint All →] — batch mint to all wallets
  [Skip for now] — mint later individually
```

---

## Technical Implementation

### Database: Token Registry
```sql
-- Extend blockchain_sync_config with token details
-- (defined in blockchain-clevel-goals.md)

-- Additional: ticker uniqueness check
CREATE UNIQUE INDEX idx_unique_token_symbol 
  ON blockchain_sync_config(token_symbol) 
  WHERE token_symbol IS NOT NULL;
```

### API Endpoints

```
POST /api/blockchain/create-token
  Body: { accountId, tokenName, tokenSymbol, totalSupply }
  Auth: Must be startup admin
  Flow:
    1. Validate ticker uniqueness (DB check)
    2. Return unsigned tx data for MetaMask signing
    3. Client sends signed tx
    4. Poll for confirmation
    5. Store token_address + config
    6. Return { tokenAddress, explorerUrl }

GET /api/blockchain/available-tickers?query=AUS
  Returns: { available: true, suggestions: [...] }

POST /api/blockchain/batch-mint
  Body: { accountId, distributions: [{ address, amount }] }
  Flow:
    1. Validate all addresses
    2. Calculate total mint amount
    3. Return batch tx data
    4. Client signs and sends
    5. Store all tx_hashes
```

### Smart Contract Enhancement

```solidity
// TokenFactory.sol — add validation
function createCompany(
    string memory name,
    string memory symbol,
    string memory companyId,
    uint256 initialSupply,
    address admin
) external onlyOwner returns (address) {
    require(bytes(symbol).length >= 3 && bytes(symbol).length <= 4, "Symbol 3-4 chars");
    require(tokenBySymbol[symbol] == address(0), "Symbol taken");
    // ... deploy SVToken
}
```

---

## Validation Rules

| Rule | Check |
|------|-------|
| Ticker length | 3-4 characters |
| Ticker format | Uppercase A-Z only |
| Ticker unique | Not in blockchain_sync_config.token_symbol |
| Ticker not reserved | Not in RESERVED_TICKERS list |
| Token name | 1-50 characters |
| Total supply | Must match share_structure_config.authorized_shares |
| Admin wallet | Must be connected and on BlockID chain |

---

## Skills Used
- `/blockchain-expert` — Token deployment, factory pattern
- `/ai` — Ticker suggestion AI
- `/ui-ux-pro-max` — Token creation wizard UX
- `/secure-code-guardian` — Validation, uniqueness enforcement

## Owner
- **Primary**: Blockchain Lead (CBO-001)
- **Support**: AI/ML Lead (CTO-003), Frontend Lead (CTO-001)

## Success Metrics
- [ ] TokenFactory deploys custom-ticker tokens
- [ ] AI suggests 3 tickers with >70% first-pick acceptance
- [ ] Ticker uniqueness enforced at both DB and contract level
- [ ] Batch mint handles 50+ shareholders in single flow
- [ ] "Add to MetaMask" works for all deployed tokens
- [ ] Token creation completes in <60 seconds (deploy + confirm)