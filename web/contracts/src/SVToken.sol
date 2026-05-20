// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title SVToken (Startup Value Token)
 * @notice ERC-1400 inspired security token representing equity shares.
 *         Each token = 1 share of a company on BlockID.au.
 *
 * Features (inspired by ERC-1400 security token standard):
 * - Partitions: different share classes (ordinary, preference, esop)
 * - Transfer restrictions: admin can pause, whitelist-only transfers
 * - Mintable: admin mints new shares (fundraise rounds)
 * - Burnable: share buyback
 * - Document management: attach SHA, board resolutions
 * - Forced transfer: admin can force-transfer (legal compliance)
 *
 * NOT a cryptocurrency. Represents legal equity on BlockID private chain.
 * Gas fees = 0 on BlockID chain.
 */
contract SVToken is ERC20, ERC20Burnable, AccessControl {

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    // ── Partitions (share classes) ──────────────────────────────────────
    enum Partition { ORDINARY, PREFERENCE_A, PREFERENCE_B, ESOP, RESERVED }

    struct ShareClass {
        Partition partition;
        uint256 totalIssued;
        uint256 pricePerShare;   // in cents (AUD * 100)
        bool votingRights;
        uint256 liquidationPref; // multiplier * 100 (100 = 1x, 200 = 2x)
        bool transferable;
    }

    mapping(Partition => ShareClass) public shareClasses;
    mapping(address => mapping(Partition => uint256)) public partitionBalances;

    // ── Transfer restrictions ───────────────────────────────────────────
    bool public transfersPaused;
    bool public whitelistEnabled;
    mapping(address => bool) public whitelist;

    // ── Vesting ─────────────────────────────────────────────────────────
    struct VestingGrant {
        uint256 totalAmount;
        uint256 claimedAmount;
        uint256 startTime;
        uint256 cliffDuration;  // seconds
        uint256 vestingDuration; // seconds
        bool revoked;
    }
    mapping(address => VestingGrant) public vestingGrants;

    // ── Documents (ERC-1400 compliance) ─────────────────────────────────
    struct Document {
        string uri;
        bytes32 documentHash;
        uint256 timestamp;
    }
    mapping(bytes32 => Document) public documents;
    bytes32[] public documentNames;

    // ── Dividends ───────────────────────────────────────────────────────
    struct DividendRound {
        uint256 totalAmount;
        uint256 perShareAmount; // scaled by 1e18
        uint256 snapshotBlock;
        mapping(address => bool) claimed;
    }
    uint256 public dividendRoundCount;
    mapping(uint256 => DividendRound) public dividendRounds;

    // ── Company info ────────────────────────────────────────────────────
    string public companyName;
    string public companyId; // BlockID internal ID
    string public jurisdiction; // e.g. "AU" for Australia

    // ── Events ──────────────────────────────────────────────────────────
    event SharesMinted(address indexed to, uint256 amount, Partition partition, string reason);
    event SharesBurned(address indexed from, uint256 amount, string reason);
    event TransferRestricted(address indexed from, address indexed to, uint256 amount, string reason);
    event VestingGranted(address indexed beneficiary, uint256 amount, uint256 cliff, uint256 duration);
    event VestingClaimed(address indexed beneficiary, uint256 amount);
    event VestingRevoked(address indexed beneficiary, uint256 unvestedAmount);
    event DividendDeclared(uint256 indexed roundId, uint256 totalAmount, uint256 perShare);
    event DividendClaimed(uint256 indexed roundId, address indexed holder, uint256 amount);
    event DocumentUpdated(bytes32 indexed name, string uri, bytes32 documentHash);
    event ForcedTransfer(address indexed from, address indexed to, uint256 amount, string reason);

    constructor(
        string memory _name,
        string memory _symbol,
        uint256 _initialSupply,
        string memory _companyName,
        string memory _companyId,
        string memory _jurisdiction,
        address _admin
    ) ERC20(_name, _symbol) {
        companyName = _companyName;
        companyId = _companyId;
        jurisdiction = _jurisdiction;

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(ADMIN_ROLE, _admin);
        _grantRole(OPERATOR_ROLE, _admin);

        // Initialize ordinary share class
        shareClasses[Partition.ORDINARY] = ShareClass({
            partition: Partition.ORDINARY,
            totalIssued: _initialSupply * 10**decimals(),
            pricePerShare: 100, // $1.00 default
            votingRights: true,
            liquidationPref: 0,
            transferable: true
        });

        // Mint initial supply to admin
        _mint(_admin, _initialSupply * 10**decimals());
        partitionBalances[_admin][Partition.ORDINARY] = _initialSupply * 10**decimals();
    }

    // ── Minting (new share issuance) ────────────────────────────────────

    function mint(address to, uint256 amount, Partition partition, string calldata reason)
        external onlyRole(ADMIN_ROLE)
    {
        _mint(to, amount);
        partitionBalances[to][partition] += amount;
        shareClasses[partition].totalIssued += amount;
        emit SharesMinted(to, amount, partition, reason);
    }

    function burnShares(uint256 amount, string calldata reason) external {
        _burn(msg.sender, amount);
        partitionBalances[msg.sender][Partition.ORDINARY] -= amount;
        emit SharesBurned(msg.sender, amount, reason);
    }

    // ── Transfer restrictions (ERC-1400) ────────────────────────────────

    function setTransfersPaused(bool _paused) external onlyRole(ADMIN_ROLE) {
        transfersPaused = _paused;
    }

    function setWhitelistEnabled(bool _enabled) external onlyRole(ADMIN_ROLE) {
        whitelistEnabled = _enabled;
    }

    function setWhitelisted(address account, bool status) external onlyRole(ADMIN_ROLE) {
        whitelist[account] = status;
    }

    function batchWhitelist(address[] calldata accounts) external onlyRole(ADMIN_ROLE) {
        for (uint i = 0; i < accounts.length; i++) {
            whitelist[accounts[i]] = true;
        }
    }

    function forcedTransfer(address from, address to, uint256 amount, string calldata reason)
        external onlyRole(ADMIN_ROLE)
    {
        _transfer(from, to, amount);
        emit ForcedTransfer(from, to, amount, reason);
    }

    function _update(address from, address to, uint256 value) internal virtual override {
        // Skip checks for minting (from=0) and burning (to=0)
        if (from != address(0) && to != address(0)) {
            require(!transfersPaused, "Transfers paused");
            if (whitelistEnabled) {
                require(whitelist[from] && whitelist[to], "Not whitelisted");
            }
        }
        super._update(from, to, value);
    }

    // ── Vesting (ESOP) ─────────────────────────────────────────────────

    function grantVesting(
        address beneficiary,
        uint256 totalAmount,
        uint256 cliffMonths,
        uint256 vestingMonths
    ) external onlyRole(ADMIN_ROLE) {
        require(vestingGrants[beneficiary].totalAmount == 0, "Grant exists");

        // Transfer tokens to this contract for vesting
        _transfer(msg.sender, address(this), totalAmount);

        vestingGrants[beneficiary] = VestingGrant({
            totalAmount: totalAmount,
            claimedAmount: 0,
            startTime: block.timestamp,
            cliffDuration: cliffMonths * 30 days,
            vestingDuration: vestingMonths * 30 days,
            revoked: false
        });

        emit VestingGranted(beneficiary, totalAmount, cliffMonths, vestingMonths);
    }

    function claimVested() external {
        VestingGrant storage grant = vestingGrants[msg.sender];
        require(grant.totalAmount > 0, "No grant");
        require(!grant.revoked, "Revoked");

        uint256 vested = vestedAmount(msg.sender);
        uint256 claimable = vested - grant.claimedAmount;
        require(claimable > 0, "Nothing to claim");

        grant.claimedAmount += claimable;
        _transfer(address(this), msg.sender, claimable);
        emit VestingClaimed(msg.sender, claimable);
    }

    function vestedAmount(address beneficiary) public view returns (uint256) {
        VestingGrant memory grant = vestingGrants[beneficiary];
        if (grant.totalAmount == 0 || grant.revoked) return 0;

        uint256 elapsed = block.timestamp - grant.startTime;
        if (elapsed < grant.cliffDuration) return 0;
        if (elapsed >= grant.vestingDuration) return grant.totalAmount;

        return (grant.totalAmount * elapsed) / grant.vestingDuration;
    }

    function revokeVesting(address beneficiary) external onlyRole(ADMIN_ROLE) {
        VestingGrant storage grant = vestingGrants[beneficiary];
        require(grant.totalAmount > 0 && !grant.revoked, "Invalid");

        uint256 vested = vestedAmount(beneficiary);
        uint256 unvested = grant.totalAmount - vested;
        grant.revoked = true;

        // Return unvested to admin
        if (unvested > 0) {
            _transfer(address(this), msg.sender, unvested);
        }
        // Send vested to beneficiary
        uint256 unclaimed = vested - grant.claimedAmount;
        if (unclaimed > 0) {
            _transfer(address(this), beneficiary, unclaimed);
        }

        emit VestingRevoked(beneficiary, unvested);
    }

    // ── Dividends ───────────────────────────────────────────────────────

    function declareDividend() external payable onlyRole(ADMIN_ROLE) {
        require(msg.value > 0, "No dividend amount");
        require(totalSupply() > 0, "No shares");

        uint256 roundId = dividendRoundCount++;
        DividendRound storage round = dividendRounds[roundId];
        round.totalAmount = msg.value;
        round.perShareAmount = (msg.value * 1e18) / totalSupply();
        round.snapshotBlock = block.number;

        emit DividendDeclared(roundId, msg.value, round.perShareAmount);
    }

    function claimDividend(uint256 roundId) external {
        DividendRound storage round = dividendRounds[roundId];
        require(round.totalAmount > 0, "Invalid round");
        require(!round.claimed[msg.sender], "Already claimed");

        uint256 amount = (balanceOf(msg.sender) * round.perShareAmount) / 1e18;
        require(amount > 0, "No dividend");

        round.claimed[msg.sender] = true;
        payable(msg.sender).transfer(amount);
        emit DividendClaimed(roundId, msg.sender, amount);
    }

    // ── Documents (ERC-1400) ────────────────────────────────────────────

    function setDocument(bytes32 _name, string calldata _uri, bytes32 _documentHash)
        external onlyRole(ADMIN_ROLE)
    {
        if (documents[_name].timestamp == 0) {
            documentNames.push(_name);
        }
        documents[_name] = Document(_uri, _documentHash, block.timestamp);
        emit DocumentUpdated(_name, _uri, _documentHash);
    }

    function getDocument(bytes32 _name) external view returns (string memory, bytes32, uint256) {
        Document memory doc = documents[_name];
        return (doc.uri, doc.documentHash, doc.timestamp);
    }

    function getAllDocuments() external view returns (bytes32[] memory) {
        return documentNames;
    }

    // ── Share class management ──────────────────────────────────────────

    function configureShareClass(
        Partition partition,
        uint256 pricePerShare,
        bool votingRights,
        uint256 liquidationPref,
        bool transferable
    ) external onlyRole(ADMIN_ROLE) {
        shareClasses[partition].pricePerShare = pricePerShare;
        shareClasses[partition].votingRights = votingRights;
        shareClasses[partition].liquidationPref = liquidationPref;
        shareClasses[partition].transferable = transferable;
    }

    // ── View helpers ────────────────────────────────────────────────────

    function getPartitionBalance(address account, Partition partition) external view returns (uint256) {
        return partitionBalances[account][partition];
    }

    function getCompanyInfo() external view returns (string memory, string memory, string memory, uint256) {
        return (companyName, companyId, jurisdiction, totalSupply());
    }
}
