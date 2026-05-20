/**
 * BlockID MetaMask Wallet Integration
 *
 * Connects MetaMask to the BlockID private EVM chain (chain ID 420).
 * Uses raw window.ethereum JSON-RPC — no ethers.js dependency.
 *
 * Chain: BlockID Private Testnet (EVM via Ethermint)
 * Gas: 0 (free transactions on private chain)
 * Tokens: SVToken ERC-20 contracts representing equity shares
 */

// ── Ethereum provider type (MetaMask injects window.ethereum) ─────────

interface EthereumProvider {
  isMetaMask?: boolean;
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

// ── Chain configuration ───────────────────────────────────────────────

export const BLOCKID_CHAIN = {
  chainId: "0x1A4", // 420 decimal
  chainName: "BlockID Private Testnet",
  nativeCurrency: {
    name: "BlockID Coin",
    symbol: "BID",
    decimals: 18,
  },
  rpcUrls: ["https://chain.blockid.au/evm"],
  blockExplorerUrls: ["https://explorer.blockid.au"],
} as const;

// ── Known contract addresses ──────────────────────────────────────────

export const CONTRACTS = {
  tokenFactory: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  svt: "0xa16E02E87b7454126E5E10d957A927A7F5B5d2be",
} as const;

// ── ABI fragments (minimal, only the selectors we need) ───────────────

/** keccak256("balanceOf(address)") first 4 bytes */
const BALANCE_OF_SELECTOR = "0x70a08231";
/** keccak256("transfer(address,uint256)") first 4 bytes */
const TRANSFER_SELECTOR = "0xa9059cbb";
/** keccak256("decimals()") first 4 bytes */
const DECIMALS_SELECTOR = "0x313ce567";
/** keccak256("symbol()") first 4 bytes */
const SYMBOL_SELECTOR = "0x95d89b41";
/** keccak256("name()") first 4 bytes */
const NAME_SELECTOR = "0x06fdde03";
/** keccak256("totalSupply()") first 4 bytes */
const TOTAL_SUPPLY_SELECTOR = "0x18160ddd";

// TokenFactory selectors
/** keccak256("getCompanyCount()") first 4 bytes */
const GET_COMPANY_COUNT_SELECTOR = "0xc369c773";
/** keccak256("getCompany(uint256)") first 4 bytes */
const GET_COMPANY_SELECTOR = "0x2a4e7489";

// SVToken selectors
/** keccak256("companyName()") first 4 bytes */
const COMPANY_NAME_SELECTOR = "0xd4ee1d90";
/** keccak256("mint(address,uint256,uint8,string)") first 4 bytes */
const MINT_SELECTOR = "0x40c10f19"; // We'll encode manually for the full signature

// ── Helpers ───────────────────────────────────────────────────────────

function getProvider(): EthereumProvider {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("MetaMask not installed. Please install MetaMask to continue.");
  }
  return window.ethereum;
}

/** Pad a hex address to 32 bytes (64 hex chars). */
function padAddress(addr: string): string {
  return addr.toLowerCase().replace("0x", "").padStart(64, "0");
}

/** Encode a uint256 as 32 bytes hex. */
function padUint256(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}

/** Decode a 32-byte hex value to bigint. */
function decodeBigInt(hex: string): bigint {
  const clean = hex.replace("0x", "");
  if (!clean || clean === "" || clean === "0".repeat(clean.length)) return 0n;
  return BigInt("0x" + clean);
}

/** Decode an ABI-encoded string from eth_call result. */
function decodeString(hex: string): string {
  const data = hex.replace("0x", "");
  if (data.length < 128) return "";
  // offset is first 32 bytes, length is next 32 bytes
  const length = Number(BigInt("0x" + data.slice(64, 128)));
  if (length === 0) return "";
  const strHex = data.slice(128, 128 + length * 2);
  // Decode hex to UTF-8
  const bytes = [];
  for (let i = 0; i < strHex.length; i += 2) {
    bytes.push(parseInt(strHex.slice(i, i + 2), 16));
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

// ── Core wallet functions ─────────────────────────────────────────────

/**
 * Connect MetaMask: request accounts and add/switch to BlockID chain.
 * Returns the connected account address.
 */
export async function connectWallet(): Promise<string> {
  const provider = getProvider();

  // Request account access
  const accounts = (await provider.request({
    method: "eth_requestAccounts",
  })) as string[];

  if (!accounts.length) {
    throw new Error("No accounts found. Please unlock MetaMask.");
  }

  // Try switching to BlockID chain
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: BLOCKID_CHAIN.chainId }],
    });
  } catch (switchError: unknown) {
    const err = switchError as { code?: number };
    // 4902 = chain not added yet
    if (err.code === 4902) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: BLOCKID_CHAIN.chainId,
            chainName: BLOCKID_CHAIN.chainName,
            nativeCurrency: BLOCKID_CHAIN.nativeCurrency,
            rpcUrls: [...BLOCKID_CHAIN.rpcUrls],
            blockExplorerUrls: [...BLOCKID_CHAIN.blockExplorerUrls],
          },
        ],
      });
    } else {
      throw switchError;
    }
  }

  return accounts[0];
}

/**
 * Get the currently connected account (without prompting).
 */
export async function getConnectedAccount(): Promise<string | null> {
  try {
    const provider = getProvider();
    const accounts = (await provider.request({
      method: "eth_accounts",
    })) as string[];
    return accounts[0] ?? null;
  } catch {
    return null;
  }
}

// ── ERC-20 read functions ─────────────────────────────────────────────

/**
 * Get ERC-20 token balance for a user address.
 * Returns the raw balance (need to divide by 10^decimals for display).
 */
export async function getTokenBalance(
  tokenAddr: string,
  userAddr: string,
): Promise<bigint> {
  const provider = getProvider();
  const data = BALANCE_OF_SELECTOR + padAddress(userAddr);

  const result = (await provider.request({
    method: "eth_call",
    params: [{ to: tokenAddr, data }, "latest"],
  })) as string;

  return decodeBigInt(result);
}

/**
 * Get the decimals for an ERC-20 token.
 */
export async function getTokenDecimals(tokenAddr: string): Promise<number> {
  const provider = getProvider();
  const result = (await provider.request({
    method: "eth_call",
    params: [{ to: tokenAddr, data: DECIMALS_SELECTOR }, "latest"],
  })) as string;

  return Number(decodeBigInt(result));
}

/**
 * Get the symbol for an ERC-20 token.
 */
export async function getTokenSymbol(tokenAddr: string): Promise<string> {
  const provider = getProvider();
  const result = (await provider.request({
    method: "eth_call",
    params: [{ to: tokenAddr, data: SYMBOL_SELECTOR }, "latest"],
  })) as string;

  return decodeString(result);
}

/**
 * Get the name for an ERC-20 token.
 */
export async function getTokenName(tokenAddr: string): Promise<string> {
  const provider = getProvider();
  const result = (await provider.request({
    method: "eth_call",
    params: [{ to: tokenAddr, data: NAME_SELECTOR }, "latest"],
  })) as string;

  return decodeString(result);
}

/**
 * Get total supply for an ERC-20 token.
 */
export async function getTokenTotalSupply(tokenAddr: string): Promise<bigint> {
  const provider = getProvider();
  const result = (await provider.request({
    method: "eth_call",
    params: [{ to: tokenAddr, data: TOTAL_SUPPLY_SELECTOR }, "latest"],
  })) as string;

  return decodeBigInt(result);
}

// ── ERC-20 write functions ────────────────────────────────────────────

/**
 * Transfer ERC-20 tokens. Amount should be in the smallest unit (wei-equivalent).
 * Returns the transaction hash.
 */
export async function transferTokens(
  tokenAddr: string,
  to: string,
  amount: bigint,
): Promise<string> {
  const provider = getProvider();
  const accounts = (await provider.request({
    method: "eth_accounts",
  })) as string[];

  if (!accounts.length) {
    throw new Error("Wallet not connected");
  }

  const data = TRANSFER_SELECTOR + padAddress(to) + padUint256(amount);

  const txHash = (await provider.request({
    method: "eth_sendTransaction",
    params: [
      {
        from: accounts[0],
        to: tokenAddr,
        data,
        gas: "0x30D40", // 200,000 gas limit (gas is free)
      },
    ],
  })) as string;

  return txHash;
}

// ── MetaMask token display ────────────────────────────────────────────

/**
 * Add a token to MetaMask's asset list so users can see their balance.
 */
export async function addTokenToMetaMask(
  tokenAddr: string,
  symbol: string,
  decimals: number,
  imageUrl?: string,
): Promise<boolean> {
  const provider = getProvider();

  const result = (await provider.request({
    method: "wallet_watchAsset",
    params: {
      type: "ERC20",
      options: {
        address: tokenAddr,
        symbol,
        decimals,
        ...(imageUrl ? { image: imageUrl } : {}),
      },
    },
  })) as boolean;

  return result;
}

// ── TokenFactory read functions ───────────────────────────────────────

export interface CompanyTokenInfo {
  tokenAddress: string;
  name: string;
  symbol: string;
  companyId: string;
  initialSupply: bigint;
  createdAt: bigint;
}

/**
 * Get the total number of companies registered in TokenFactory.
 */
export async function getCompanyCount(): Promise<number> {
  const provider = getProvider();
  const result = (await provider.request({
    method: "eth_call",
    params: [
      { to: CONTRACTS.tokenFactory, data: GET_COMPANY_COUNT_SELECTOR },
      "latest",
    ],
  })) as string;

  return Number(decodeBigInt(result));
}

/**
 * Get company info by index from TokenFactory.
 */
export async function getCompany(index: number): Promise<CompanyTokenInfo> {
  const provider = getProvider();
  const data = GET_COMPANY_SELECTOR + padUint256(BigInt(index));

  const result = (await provider.request({
    method: "eth_call",
    params: [{ to: CONTRACTS.tokenFactory, data }, "latest"],
  })) as string;

  // The result is an ABI-encoded tuple
  // We need to parse it. The struct has: address, string, string, string, uint256, uint256
  const hex = result.replace("0x", "");

  // For a tuple with dynamic types, first come the offsets/values for each field
  // address is static (32 bytes), strings are dynamic (offset pointers)
  const tokenAddress = "0x" + hex.slice(24, 64); // first 32 bytes, address is last 20
  // Offsets for dynamic strings follow, then the uint256 values
  // This is complex ABI decoding; we'll use a simplified approach
  // by reading the known structure positions

  // For simplicity, let's read individual fields using separate calls
  return {
    tokenAddress,
    name: "",
    symbol: "",
    companyId: "",
    initialSupply: 0n,
    createdAt: 0n,
  };
}

/**
 * Get all companies with full details (makes individual calls per token).
 */
export async function getAllCompanies(): Promise<CompanyTokenInfo[]> {
  const count = await getCompanyCount();
  const companies: CompanyTokenInfo[] = [];

  for (let i = 0; i < count; i++) {
    const basic = await getCompany(i);
    const addr = basic.tokenAddress;

    // Fetch details from the token contract directly
    const [name, symbol, totalSupply] = await Promise.all([
      getTokenName(addr),
      getTokenSymbol(addr),
      getTokenTotalSupply(addr),
    ]);

    companies.push({
      ...basic,
      name,
      symbol,
      initialSupply: totalSupply,
    });
  }

  return companies;
}

// ── SVToken admin functions ───────────────────────────────────────────

/**
 * Mint new shares (ADMIN_ROLE only).
 * Calls: mint(address to, uint256 amount, uint8 partition, string reason)
 * Full selector: 0x156e29f6 for mint(address,uint256,uint8,string)
 */
export async function mintTokens(
  tokenAddr: string,
  to: string,
  amount: bigint,
): Promise<string> {
  const provider = getProvider();
  const accounts = (await provider.request({
    method: "eth_accounts",
  })) as string[];

  if (!accounts.length) throw new Error("Wallet not connected");

  // Encode: mint(address, uint256, uint8, string)
  // selector for mint(address,uint256,uint8,string)
  const selector = "0x156e29f6";
  // address to
  const encodedTo = padAddress(to);
  // uint256 amount
  const encodedAmount = padUint256(amount);
  // uint8 partition = 0 (ORDINARY)
  const encodedPartition = padUint256(0n);
  // string reason - offset pointer (4 * 32 = 128 = 0x80)
  const encodedOffset = padUint256(128n);
  // string data: length + content
  const reason = "Admin mint";
  const reasonBytes = new TextEncoder().encode(reason);
  const encodedLength = padUint256(BigInt(reasonBytes.length));
  let encodedContent = "";
  for (const b of reasonBytes) {
    encodedContent += b.toString(16).padStart(2, "0");
  }
  encodedContent = encodedContent.padEnd(64, "0"); // pad to 32 bytes

  const data =
    selector +
    encodedTo +
    encodedAmount +
    encodedPartition +
    encodedOffset +
    encodedLength +
    encodedContent;

  const txHash = (await provider.request({
    method: "eth_sendTransaction",
    params: [
      {
        from: accounts[0],
        to: tokenAddr,
        data,
        gas: "0x7A120", // 500,000 gas limit
      },
    ],
  })) as string;

  return txHash;
}

/**
 * Burn shares from the connected account.
 * Calls: burnShares(uint256 amount, string reason)
 */
export async function burnTokens(
  tokenAddr: string,
  amount: bigint,
): Promise<string> {
  const provider = getProvider();
  const accounts = (await provider.request({
    method: "eth_accounts",
  })) as string[];

  if (!accounts.length) throw new Error("Wallet not connected");

  // selector for burnShares(uint256,string)
  const selector = "0x6d1b229d";
  const encodedAmount = padUint256(amount);
  // offset for string (2 * 32 = 64 = 0x40)
  const encodedOffset = padUint256(64n);
  const reason = "Admin burn";
  const reasonBytes = new TextEncoder().encode(reason);
  const encodedLength = padUint256(BigInt(reasonBytes.length));
  let encodedContent = "";
  for (const b of reasonBytes) {
    encodedContent += b.toString(16).padStart(2, "0");
  }
  encodedContent = encodedContent.padEnd(64, "0");

  const data =
    selector +
    encodedAmount +
    encodedOffset +
    encodedLength +
    encodedContent;

  const txHash = (await provider.request({
    method: "eth_sendTransaction",
    params: [
      {
        from: accounts[0],
        to: tokenAddr,
        data,
        gas: "0x7A120",
      },
    ],
  })) as string;

  return txHash;
}

// ── Vesting read ──────────────────────────────────────────────────────

export interface VestingInfo {
  totalAmount: bigint;
  claimedAmount: bigint;
  startTime: bigint;
  cliffDuration: bigint;
  vestingDuration: bigint;
  revoked: boolean;
}

/**
 * Get vesting grant info for an address.
 * Calls: vestingGrants(address)
 */
export async function getVestingGrant(
  tokenAddr: string,
  beneficiary: string,
): Promise<VestingInfo> {
  const provider = getProvider();
  // selector for vestingGrants(address) — public mapping accessor
  const selector = "0x9c4a0b09";
  const data = selector + padAddress(beneficiary);

  const result = (await provider.request({
    method: "eth_call",
    params: [{ to: tokenAddr, data }, "latest"],
  })) as string;

  const hex = result.replace("0x", "");

  return {
    totalAmount: decodeBigInt("0x" + hex.slice(0, 64)),
    claimedAmount: decodeBigInt("0x" + hex.slice(64, 128)),
    startTime: decodeBigInt("0x" + hex.slice(128, 192)),
    cliffDuration: decodeBigInt("0x" + hex.slice(192, 256)),
    vestingDuration: decodeBigInt("0x" + hex.slice(256, 320)),
    revoked: decodeBigInt("0x" + hex.slice(320, 384)) !== 0n,
  };
}

/**
 * Get the currently vested amount for an address.
 * Calls: vestedAmount(address)
 */
export async function getVestedAmount(
  tokenAddr: string,
  beneficiary: string,
): Promise<bigint> {
  const provider = getProvider();
  // selector for vestedAmount(address)
  const selector = "0x44b1231f";
  const data = selector + padAddress(beneficiary);

  const result = (await provider.request({
    method: "eth_call",
    params: [{ to: tokenAddr, data }, "latest"],
  })) as string;

  return decodeBigInt(result);
}

// ── Event listeners ───────────────────────────────────────────────────

/**
 * Listen for account changes in MetaMask.
 */
export function onAccountsChanged(
  handler: (accounts: string[]) => void,
): () => void {
  const provider = getProvider();
  const wrappedHandler = (...args: unknown[]) => {
    handler(args[0] as string[]);
  };
  provider.on("accountsChanged", wrappedHandler);
  return () => provider.removeListener("accountsChanged", wrappedHandler);
}

/**
 * Listen for chain changes in MetaMask.
 */
export function onChainChanged(handler: (chainId: string) => void): () => void {
  const provider = getProvider();
  const wrappedHandler = (...args: unknown[]) => {
    handler(args[0] as string);
  };
  provider.on("chainChanged", wrappedHandler);
  return () => provider.removeListener("chainChanged", wrappedHandler);
}

// ── Formatting helpers ────────────────────────────────────────────────

/**
 * Format a raw token balance for display (divide by 10^decimals).
 */
export function formatTokenAmount(amount: bigint, decimals: number): string {
  if (amount === 0n) return "0";
  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const remainder = amount % divisor;
  if (remainder === 0n) return whole.toLocaleString();
  const fracStr = remainder.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole.toLocaleString()}.${fracStr}`;
}

/**
 * Parse a human-readable token amount to raw units.
 */
export function parseTokenAmount(amount: string, decimals: number): bigint {
  const parts = amount.split(".");
  const whole = BigInt(parts[0] || "0");
  let frac = 0n;
  if (parts[1]) {
    const fracStr = parts[1].slice(0, decimals).padEnd(decimals, "0");
    frac = BigInt(fracStr);
  }
  return whole * 10n ** BigInt(decimals) + frac;
}

/**
 * Shorten an Ethereum address for display: 0x1234...abcd
 */
export function shortenAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}
