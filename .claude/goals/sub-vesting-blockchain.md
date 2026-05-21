# Blockchain Expert Sub-Goal: Vesting — On-Chain Sync & Smart Contracts

## Parent Goal
`goals/vesting-share-structure.md`

## Mission
Ensure every off-chain vesting schedule has a verifiable on-chain counterpart on the BlockID private EVM chain, providing immutable transparency and enabling token-based equity claims.

---

## Existing Infrastructure

### Already Deployed (Testnet)
- **Chain**: BlockID Private Testnet (Ethermint, EVM-compatible, Chain ID 420)
- **RPC**: https://chain.blockid.au
- **Token Standard**: ERC-20 via `TokenFactory.sol`
- **Vesting Contract**: `SVToken.sol` with built-in vesting functions
- **MetaMask Integration**: `wallet.ts` with connect/sign/transact

### Existing Smart Contract Functions
```solidity
// Already in SVToken.sol:
function grantVesting(address beneficiary, uint256 totalAmount, uint256 cliffDuration, uint256 vestingDuration) external onlyAdmin
function claimVested() external
function vestedAmount(address beneficiary) public view returns (uint256)
function revokeVesting(address beneficiary) external onlyAdmin
function getVestingGrant(address beneficiary) external view returns (VestingInfo)
```

---

## Tasks

### Task 1: Extend Vesting Contract for Multi-Grant Support

Current limitation: `SVToken.sol` supports ONE vesting grant per address. Need to support multiple grants (e.g., initial grant + performance top-up).

**New contract**: `VestingVault.sol`
```solidity
// Multiple grants per beneficiary
struct VestingGrant {
    uint256 grantId;
    uint256 totalAmount;
    uint256 claimedAmount;
    uint256 startTime;
    uint256 cliffDuration;
    uint256 vestingDuration;
    VestingType vestingType;  // Linear, BackWeighted, FrontWeighted
    bool revoked;
}

mapping(address => VestingGrant[]) public grants;

function createGrant(address beneficiary, uint256 amount, uint256 cliff, uint256 duration, VestingType vType) external onlyAdmin returns (uint256 grantId)
function claimVested(uint256 grantId) external
function vestedAmount(address beneficiary, uint256 grantId) public view returns (uint256)
function revokeGrant(address beneficiary, uint256 grantId) external onlyAdmin
function getAllGrants(address beneficiary) external view returns (VestingGrant[] memory)
function totalVested(address beneficiary) public view returns (uint256)
function totalUnvested(address beneficiary) public view returns (uint256)
```

### Task 2: Vesting Type Implementations

```solidity
enum VestingType { Linear, BackWeighted, FrontWeighted, Milestone }

function _computeVested(VestingGrant memory grant) internal view returns (uint256) {
    uint256 elapsed = block.timestamp - grant.startTime;
    
    if (elapsed < grant.cliffDuration) return 0;
    if (elapsed >= grant.vestingDuration) return grant.totalAmount;
    
    if (grant.vestingType == VestingType.Linear) {
        return (grant.totalAmount * elapsed) / grant.vestingDuration;
    } else if (grant.vestingType == VestingType.BackWeighted) {
        // 10% year 1, 20% year 2, 30% year 3, 40% year 4
        return _backWeightedVesting(grant, elapsed);
    } else if (grant.vestingType == VestingType.FrontWeighted) {
        // 40% year 1, 30% year 2, 20% year 3, 10% year 4
        return _frontWeightedVesting(grant, elapsed);
    }
    return 0; // Milestone type — manual triggers only
}
```

### Task 3: Acceleration Support

```solidity
// Change of Control acceleration
function accelerateGrant(address beneficiary, uint256 grantId, uint256 accelerationPct) external onlyAdmin {
    VestingGrant storage grant = grants[beneficiary][grantId];
    uint256 currentVested = _computeVested(grant);
    uint256 unvested = grant.totalAmount - currentVested;
    uint256 accelerated = (unvested * accelerationPct) / 100;
    
    // Immediately vest the accelerated amount
    grant.claimedAmount += accelerated;
    _transfer(address(this), beneficiary, accelerated);
    
    emit VestingAccelerated(beneficiary, grantId, accelerated);
}
```

### Task 4: Off-Chain → On-Chain Sync Service

**File**: `web/src/lib/vesting-blockchain-sync.ts`

```typescript
export async function syncVestingToChain(schedule: VestingSchedule): Promise<TxResult> {
  // 1. Check if shareholder has EVM address
  // 2. Check if token contract deployed for this account
  // 3. Convert months to seconds for on-chain
  // 4. Call grantVesting on VestingVault contract
  // 5. Store tx hash on vesting_schedule record
  // 6. Return result
}

export async function syncRevocationToChain(schedule: VestingSchedule): Promise<TxResult> {
  // Call revokeGrant on-chain
}

export async function verifyOnChainVesting(schedule: VestingSchedule): Promise<VerificationResult> {
  // Read on-chain state and compare with DB state
  // Flag discrepancies
}
```

### Task 5: MetaMask Flow Enhancement

**New UI flow** for "Deploy to Blockchain" button in wizard Step 6:
1. User clicks "Deploy to Blockchain"
2. Check MetaMask connected → prompt if not
3. Check token contract exists for this startup → deploy TokenFactory if not
4. For each shareholder with EVM address:
   - Call `createGrant()` on VestingVault
   - Show progress bar (n of m deployed)
5. Show success: "Vesting schedules deployed on-chain"
6. Link to block explorer for verification

### Task 6: Claim Flow for Team Members

**New page**: `/workspace/vesting/claim`

1. Team member connects MetaMask
2. Shows all their vesting grants across startups
3. Shows vested but unclaimed tokens
4. "Claim" button calls `claimVested(grantId)`
5. Tokens transferred to their wallet
6. Dashboard updates with claimed amount

---

## Time Conversion (Months → Seconds)

```typescript
const SECONDS_PER_MONTH = 30 * 24 * 60 * 60; // 2,592,000 seconds

function monthsToSeconds(months: number): number {
  return months * SECONDS_PER_MONTH;
}

// For on-chain:
// cliffDuration = monthsToSeconds(cliffMonths)
// vestingDuration = monthsToSeconds(vestingMonths)
```

---

## Share-to-Token Mapping

```
1 share (off-chain) = 1 token (on-chain, 6 decimals)
token_amount = shares * 10^6 (for 6 decimal places)

// Example:
// Holder has 2,500,000 shares
// On-chain: 2,500,000 * 10^6 = 2,500,000,000,000 units (ushare)
```

---

## Security Considerations

- **Admin key management**: Server-side signing for grantVesting/revokeGrant (never expose admin key to client)
- **Double-grant prevention**: Check on-chain state before creating grant (idempotency)
- **Revocation sync**: If off-chain revoked but on-chain fails → retry queue with alerting
- **Gas estimation**: Pre-calculate gas for batch deployments
- **Rate limiting**: Max 10 blockchain operations per minute per account

---

## Testing Requirements

- Unit tests for VestingVault.sol (Hardhat/Foundry)
- Test all vesting types compute correctly on-chain
- Test acceleration with various percentages
- Test revocation mid-vest
- Integration test: DB create → on-chain sync → verify consistency
- Gas usage benchmarks for common operations

---

## Deployment Plan

1. Deploy VestingVault.sol to BlockID testnet
2. Verify contract on block explorer
3. Update `wallet.ts` with VestingVault ABI and address
4. Build sync service with retry logic
5. E2E test: create schedule in UI → verify on-chain
6. Monitor: alert on sync failures

---

## Skills Used
- `/blockchain-expert` — Cosmos SDK, EVM, smart contracts
- `/secure-code-guardian` — Key management, access control
- `/cto` — Integration architecture

## Success Metrics
- [ ] VestingVault.sol deployed and verified on testnet
- [ ] Multi-grant support working (>3 grants per address)
- [ ] All 4 vesting types compute correctly on-chain
- [ ] Off-chain → on-chain sync latency <30s
- [ ] Sync failure rate <0.1%
- [ ] Claim flow works end-to-end via MetaMask
- [ ] Gas cost per grant creation <0.01 ETH equivalent