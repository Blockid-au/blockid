// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./SVToken.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title TokenFactory — BlockID Company Token Factory
 * @notice Admin creates a new company = deploys a new SVToken contract.
 *         Each company has its own ERC-1400 inspired equity token.
 *         All tokens are interoperable via MetaMask on BlockID private chain.
 *
 * Base coin: BID (BlockID Coin) — gas/utility, price = 0 (free gas)
 * Company tokens: SVT-ACME, SVT-BETA, etc. — each = 1 share
 */
contract TokenFactory is Ownable {

    struct CompanyToken {
        address tokenAddress;
        string name;
        string symbol;
        string companyId;
        uint256 initialSupply;
        uint256 createdAt;
    }

    CompanyToken[] public companies;
    mapping(string => address) public tokenBySymbol;
    mapping(string => address) public tokenByCompanyId;

    event CompanyCreated(
        string indexed symbol,
        address tokenAddress,
        string companyName,
        string companyId,
        uint256 initialSupply,
        address admin
    );

    constructor() Ownable(msg.sender) {}

    /**
     * @notice Create a new company token
     * @param _name Token name (e.g. "Acme Corp Shares")
     * @param _symbol Token symbol (e.g. "ACME")
     * @param _initialSupply Number of shares (e.g. 20000000 = 20M)
     * @param _companyName Legal company name
     * @param _companyId BlockID internal ID
     * @param _jurisdiction Country code (e.g. "AU")
     * @param _admin Admin address (receives all initial shares)
     */
    function createCompany(
        string calldata _name,
        string calldata _symbol,
        uint256 _initialSupply,
        string calldata _companyName,
        string calldata _companyId,
        string calldata _jurisdiction,
        address _admin
    ) external onlyOwner returns (address) {
        require(tokenBySymbol[_symbol] == address(0), "Symbol exists");
        require(tokenByCompanyId[_companyId] == address(0), "Company exists");

        SVToken token = new SVToken(
            _name,
            _symbol,
            _initialSupply,
            _companyName,
            _companyId,
            _jurisdiction,
            _admin
        );

        address tokenAddr = address(token);
        tokenBySymbol[_symbol] = tokenAddr;
        tokenByCompanyId[_companyId] = tokenAddr;

        companies.push(CompanyToken({
            tokenAddress: tokenAddr,
            name: _name,
            symbol: _symbol,
            companyId: _companyId,
            initialSupply: _initialSupply,
            createdAt: block.timestamp
        }));

        emit CompanyCreated(_symbol, tokenAddr, _companyName, _companyId, _initialSupply, _admin);
        return tokenAddr;
    }

    function getCompanyCount() external view returns (uint256) {
        return companies.length;
    }

    function getCompany(uint256 index) external view returns (CompanyToken memory) {
        return companies[index];
    }

    function getAllCompanies() external view returns (CompanyToken[] memory) {
        return companies;
    }

    function getTokenAddress(string calldata symbol) external view returns (address) {
        return tokenBySymbol[symbol];
    }
}
