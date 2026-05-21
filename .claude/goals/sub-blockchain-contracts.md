# Sub-Goal: Smart Contract Upgrades — VestingVault, Enhanced SVToken, Security

## Parent Goal
`goals/blockchain-clevel-goals.md`

## Mission
Upgrade the on-chain smart contract suite to support multi-grant vesting, batch operations, enhanced transfer restrictions, and security hardening — while maintaining backward compatibility with the deployed SVToken.

---

## Current Contract State

### Deployed Contracts
| Contract | Address | Status |
|----------|---------|--------|
| TokenFactory | 0x5FbDB2315678afecb367f032d93F642f64180aa3 | ✅ Live |
| SVToken (Auschain) | 0xa16E02E87b7454126E5E10d957A927A7F5B5d2be | ✅ Live |

### Current SVToken Capabilities
- ERC-20 with partitions (Ordinary, Preference A/B, ESOP, Reserved)
- Single vesting grant per address
- Single-round dividends
- Transfer restrictions (pause, whitelist)
- Document management (ERC-1400)
- Mint/burn by admin

### Gaps to Address
1. **Multi-grant vesting** — Currently 1 grant per address
2. **Batch operations** — No batch mint/transfer
3. **Vesting types** — Only linear, need weighted + milestone
4. **Acceleration** — No CoC/milestone acceleration
5. **Enhanced dividends** — Need multi-round history, unclaimed tracking
6. **Transfer events** — Need better event indexing for sync

---

## New Contract: VestingVault.sol

### Purpose
Separate vesting logic from SVToken to enable multi-grant, multiple vesting types, and acceleration without modifying the token contract.

### Architecture
```
SVToken (ERC-20)
    ↑ holds tokens
VestingVault (manages grants)
    ↑ admin creates grants
    ↓ beneficiaries claim vested tokens
```

### Interface
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract VestingVault is Ownable {
    
    enum VestingType { Linear, BackWeighted, FrontWeighted, Milestone }
    enum GrantStatus { Active, Completed, Revoked, Accelerated }
    
    struct Grant {
        uint256 id;
        address beneficiary;
        uint256 totalAmount;
        uint256 claimedAmount;
        uint256 startTime;
        uint256 cliffDuration;      // seconds
        uint256 vestingDuration;    // seconds
        VestingType vestingType;
        GrantStatus status;
        uint256 revokedAt;          // 0 if not revoked
    }
    
    IERC20 public token;
    uint256 public nextGrantId;
    
    mapping(uint256 => Grant) public grants;                  // grantId → Grant
    mapping(address => uint256[]) public beneficiaryGrants;   // address → grantIds
    
    // ── Admin Functions ────────────────────────────────────
    
    function createGrant(
        address beneficiary,
        uint256 amount,
        uint256 cliffSeconds,
        uint256 vestingSeconds,
        VestingType vType
    ) external onlyOwner returns (uint256 grantId);
    
    function revokeGrant(uint256 grantId) external onlyOwner;
    
    function accelerateGrant(
        uint256 grantId, 
        uint256 accelerationPct  // 0-100
    ) external onlyOwner;
    
    function batchCreateGrants(
        address[] calldata beneficiaries,
        uint256[] calldata amounts,
        uint256[] calldata cliffs,
        uint256[] calldata durations,
        VestingType[] calldata types
    ) external onlyOwner returns (uint256[] memory grantIds);
    
    // ── Beneficiary Functions ──────────────────────────────
    
    function claimVested(uint256 grantId) external;
    function claimAllVested() external;  // claim across all grants
    
    // ── View Functions ─────────────────────────────────────
    
    function vestedAmount(uint256 grantId) public view returns (uint256);
    function claimableAmount(uint256 grantId) public view returns (uint256);
    function getGrant(uint256 grantId) external view returns (Grant memory);
    function getGrantsByBeneficiary(address beneficiary) external view returns (Grant[] memory);
    function totalVestedFor(address beneficiary) public view returns (uint256);
    function totalUnvestedFor(address beneficiary) public view returns (uint256);
    
    // ── Events ─────────────────────────────────────────────
    
    event GrantCreated(uint256 indexed grantId, address indexed beneficiary, uint256 amount, VestingType vType);
    event VestingClaimed(uint256 indexed grantId, address indexed beneficiary, uint256 amount);
    event GrantRevoked(uint256 indexed grantId, address indexed beneficiary, uint256 unvestedReturned);
    event GrantAccelerated(uint256 indexed grantId, address indexed beneficiary, uint256 acceleratedAmount);
}
```

### Vesting Computation (On-Chain)
```solidity
function vestedAmount(uint256 grantId) public view returns (uint256) {
    Grant memory g = grants[grantId];
    if (g.status == GrantStatus.Revoked) {
        // Frozen at revocation time
        return _computeVestedAt(g, g.revokedAt);
    }
    return _computeVestedAt(g, block.timestamp);
}

function _computeVestedAt(Grant memory g, uint256 timestamp) internal pure returns (uint256) {
    if (timestamp < g.startTime) return 0;
    uint256 elapsed = timestamp - g.startTime;
    if (elapsed < g.cliffDuration) return 0;
    if (elapsed >= g.vestingDuration) return g.totalAmount;
    
    if (g.vestingType == VestingType.Linear) {
        return (g.totalAmount * elapsed) / g.vestingDuration;
    } else if (g.vestingType == VestingType.BackWeighted) {
        return _backWeighted(g.totalAmount, elapsed, g.vestingDuration);
    } else if (g.vestingType == VestingType.FrontWeighted) {
        return _frontWeighted(g.totalAmount, elapsed, g.vestingDuration);
    }
    return 0; // Milestone: only through manual acceleration
}

function _backWeighted(uint256 total, uint256 elapsed, uint256 duration) internal pure returns (uint256) {
    // Year 1: 10%, Year 2: 20%, Year 3: 30%, Year 4: 40%
    uint256 yearDuration = duration / 4;
    uint256 year = elapsed / yearDuration;
    uint256 inYear = elapsed % yearDuration;
    
    uint256[4] memory weights = [uint256(10), 20, 30, 40];
    uint256 vested = 0;
    for (uint256 i = 0; i < year && i < 4; i++) {
        vested += (total * weights[i]) / 100;
    }
    if (year < 4) {
        vested += (total * weights[year] * inYear) / (100 * yearDuration);
    }
    return vested > total ? total : vested;
}
```

---

## SVToken Enhancements

### Batch Operations (gas-efficient)
```solidity
// Add to SVToken.sol or create SVTokenBatch.sol helper

function batchMint(
    address[] calldata recipients,
    uint256[] calldata amounts,
    Partition partition,
    string calldata reason
) external onlyAdmin {
    require(recipients.length == amounts.length, "Length mismatch");
    for (uint256 i = 0; i < recipients.length; i++) {
        _mint(recipients[i], amounts[i]);
        emit SharesMinted(recipients[i], amounts[i], partition, reason);
    }
}

function batchTransfer(
    address[] calldata froms,
    address[] calldata tos,
    uint256[] calldata amounts,
    string calldata reason
) external onlyAdmin {
    for (uint256 i = 0; i < froms.length; i++) {
        _transfer(froms[i], tos[i], amounts[i]);
        emit ForcedTransfer(froms[i], tos[i], amounts[i], reason);
    }
}
```

### Enhanced Transfer Events (for better indexing)
```solidity
// Extend existing Transfer event with metadata
event TransferWithMeta(
    address indexed from,
    address indexed to,
    uint256 amount,
    string reason,
    bytes32 offChainRef  // off-chain transaction ID for matching
);
```

---

## Security Hardening

### Access Control
```solidity
// Replace simple onlyAdmin with role-based access
bytes32 public constant ADMIN_ROLE = keccak256("ADMIN");
bytes32 public constant MINTER_ROLE = keccak256("MINTER");
bytes32 public constant VESTING_MANAGER = keccak256("VESTING_MANAGER");

// Admin: full control
// Minter: can mint (server-side key)
// Vesting Manager: can create/revoke grants (VestingVault contract)
```

### Server-Side Signing
```
Admin operations (mint, burn, forcedTransfer, grantVesting) are
signed by a server-side key, NOT the user's MetaMask.

Architecture:
  1. User initiates action in dashboard
  2. Server validates permissions (Supabase RLS)
  3. Server signs tx with ADMIN_PRIVATE_KEY
  4. Server sends tx to chain
  5. Server stores tx_hash
  6. Dashboard shows confirmation

User MetaMask is ONLY used for:
  - Claiming vested tokens (their own)
  - Claiming dividends (their own)
  - Peer-to-peer transfers (their own tokens)
  - Reading balances (view only)
```

### Key Management
```
ADMIN_PRIVATE_KEY stored in:
  - Production: GCP Secret Manager
  - Staging: Environment variable (restricted)
  - Never in code, never in .env committed to git

Key rotation procedure:
  1. Generate new keypair
  2. Add new address as admin on all contracts
  3. Remove old address as admin
  4. Update Secret Manager
  5. Deploy new server config
  6. Verify all operations work
  7. Delete old key material
```

---

## Testing Suite (Foundry)

```
test/VestingVault.t.sol:
  - testLinearVesting()
  - testBackWeightedVesting()
  - testFrontWeightedVesting()
  - testCliffNotPassed()
  - testFullyVested()
  - testRevokeBeforeCliff()
  - testRevokeAfterPartialVest()
  - testAcceleration100Percent()
  - testAcceleration50Percent()
  - testMultipleGrantsSameAddress()
  - testBatchCreateGrants()
  - testClaimAllVested()
  - testUnauthorizedAccess()

test/SVTokenBatch.t.sol:
  - testBatchMint()
  - testBatchTransfer()
  - testBatchMintGasUsage()
  - testEmptyBatch()
```

---

## Deployment Plan

1. Write + test VestingVault.sol (Foundry, local)
2. Deploy to BlockID testnet
3. Verify on Ping.pub explorer
4. Update wallet.ts with VestingVault ABI + address
5. Integration test: UI → API → chain → verify
6. Upgrade SVToken with batch operations (or deploy helper)
7. Migrate existing vesting grants to VestingVault
8. Update all sync handlers to use new contracts

---

## Skills Used
- `/blockchain-expert` — Solidity, Foundry, EVM
- `/secure-code-guardian` — Access control, key management
- `/cto` — Architecture decisions

## Owner
- **Primary**: Blockchain Lead (CBO-001)
- **Support**: Security Lead (CTO-004)

## Success Metrics
- [ ] VestingVault deployed with all 4 vesting types
- [ ] Multi-grant: 5+ grants per address tested
- [ ] Batch mint: 50 recipients in single tx
- [ ] Acceleration: 50% and 100% tested
- [ ] Gas costs: <100K gas per grant creation
- [ ] Security: role-based access control enforced
- [ ] Server-side signing: admin key never exposed to client
- [ ] All Foundry tests pass (>95% coverage)