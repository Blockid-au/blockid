/**
 * BlockID Tokenization Engine
 *
 * Maps cap table equity → on-chain tokens on BlockID's PRIVATE Cosmos chain.
 * This is NOT connected to Cosmos mainnet or any public blockchain.
 * Tokens have NO cryptocurrency value — they represent startup equity shares.
 *
 * Architecture:
 *   Web App (Next.js) → Tokenization API → Private Chain (REST/gRPC)
 *   Cap Table changes → mint/burn/transfer tokens → bi-directional sync
 *
 * Chain: blockid-testnet-1 (private, Cosmos SDK v0.50.12)
 * RPC: https://chain.blockid.au (private testnet)
 * Explorer: https://explorer.blockid.au (private testnet explorer)
 */

// ── Types ──────────────────────────────────────────────────────────────

export interface TokenConfig {
  chainId: string;          // "blockid-1"
  chainName: string;        // "BlockID Chain"
  rpcUrl: string;           // "http://localhost:26657"
  restUrl: string;          // "http://localhost:1317"
  denom: string;            // "ushare" (micro-share, 1 share = 1_000_000 ushare)
  prefix: string;           // "blockid"
}

export interface TokenHolder {
  address: string;          // Cosmos bech32 address (blockid1...)
  shareholderId: string;    // matches shareholders.id in web DB
  name: string;
  shares: number;           // whole shares
  tokenBalance: bigint;     // on-chain balance in ushare
  synced: boolean;          // web DB matches chain
}

export interface MintRequest {
  to: string;               // Cosmos address
  amount: bigint;           // ushare
  shareholderId: string;
  reason: string;           // "share_issue", "vest", "exercise"
  roundName?: string;
}

export interface VestingContract {
  grantee: string;          // Cosmos address
  totalAmount: bigint;
  startTime: number;        // Unix timestamp
  vestingMonths: number;
  cliffMonths: number;
  vestedAmount: bigint;     // currently vested
}

export interface DividendDistribution {
  totalAmount: number;      // AUD
  perShareAmount: number;
  recipients: Array<{
    address: string;
    shares: number;
    amount: number;
    txHash?: string;
  }>;
}

// ── Default Config ─────────────────────────────────────────────────────

/**
 * BlockID.au - Startup Value Chain — NOT connected to Cosmos mainnet.
 * This is a standalone private chain for equity tokenization.
 * No real cryptocurrency value — tokens represent startup shares only.
 */
export const DEFAULT_CHAIN_CONFIG: TokenConfig = {
  chainId: "blockid-testnet-1",
  chainName: "BlockID.au - Startup Value Chain",
  rpcUrl: process.env.COSMOS_RPC_URL ?? "https://chain.blockid.au",
  restUrl: process.env.COSMOS_REST_URL ?? "https://chain.blockid.au/rest",
  denom: "ushare",
  prefix: "blockid",
};

// ── Cap Table → Token Mapping ──────────────────────────────────────────

/**
 * Convert cap table shares to token amounts.
 * 1 share = 1,000,000 ushare (6 decimal precision, like ATOM)
 */
export function sharesToTokens(shares: number): bigint {
  return BigInt(shares) * BigInt(1_000_000);
}

export function tokensToShares(tokens: bigint): number {
  return Number(tokens / BigInt(1_000_000));
}

/**
 * Generate a tokenization plan from the current cap table.
 * Returns mint requests for each shareholder.
 */
export function generateTokenizationPlan(
  shareholders: Array<{ id: string; name: string; shares: number; address?: string }>,
): MintRequest[] {
  return shareholders
    .filter((s) => s.shares > 0)
    .map((s) => ({
      to: s.address ?? `pending-${s.id}`, // address assigned when wallet created
      amount: sharesToTokens(s.shares),
      shareholderId: s.id,
      reason: "share_issue" as const,
    }));
}

/**
 * Calculate vesting schedule for a shareholder.
 */
export function calculateVestingSchedule(
  totalShares: number,
  startDate: Date,
  vestingMonths: number,
  cliffMonths: number,
): Array<{ month: number; date: Date; vestedShares: number; vestedPct: number }> {
  const schedule = [];
  for (let month = 0; month <= vestingMonths; month++) {
    const date = new Date(startDate);
    date.setMonth(date.getMonth() + month);

    let vestedShares = 0;
    if (month >= cliffMonths) {
      vestedShares = Math.floor((totalShares * month) / vestingMonths);
    }
    const vestedPct = Math.round((vestedShares / totalShares) * 10000) / 100;

    schedule.push({ month, date, vestedShares, vestedPct });
  }
  return schedule;
}

/**
 * Calculate dividend distribution in tokens.
 */
export function calculateTokenDividend(
  totalDividendAud: number,
  holders: Array<{ address: string; shares: number }>,
  totalShares: number,
): DividendDistribution {
  const perShareAmount = totalDividendAud / totalShares;
  const recipients = holders.map((h) => ({
    address: h.address,
    shares: h.shares,
    amount: Math.round(h.shares * perShareAmount * 100) / 100,
  }));

  return { totalAmount: totalDividendAud, perShareAmount, recipients };
}

// ── Chain API Bridge (when Cosmos chain is running) ─────────────────────

/**
 * Check if the Cosmos chain is accessible.
 */
export async function isChainOnline(config = DEFAULT_CHAIN_CONFIG): Promise<boolean> {
  try {
    const res = await fetch(`${config.restUrl}/cosmos/base/tendermint/v1beta1/node_info`, {
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Get token balance for an address.
 */
export async function getTokenBalance(
  address: string,
  config = DEFAULT_CHAIN_CONFIG,
): Promise<bigint> {
  try {
    const res = await fetch(
      `${config.restUrl}/cosmos/bank/v1beta1/balances/${address}`,
    );
    if (!res.ok) return BigInt(0);
    const data = await res.json();
    const balance = data.balances?.find(
      (b: { denom: string; amount: string }) => b.denom === config.denom,
    );
    return balance ? BigInt(balance.amount) : BigInt(0);
  } catch {
    return BigInt(0);
  }
}

/**
 * Query all token holders (requires custom chain module).
 */
export async function getAllHolders(
  config = DEFAULT_CHAIN_CONFIG,
): Promise<Array<{ address: string; balance: bigint }>> {
  try {
    const res = await fetch(`${config.restUrl}/blockid/equity/holders`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.holders ?? []).map((h: { address: string; balance: string }) => ({
      address: h.address,
      balance: BigInt(h.balance),
    }));
  } catch {
    return [];
  }
}

// ── MetaMask Integration Helpers ────────────────────────────────────────

/**
 * Generate MetaMask-compatible chain config for EVM module (Ethermint).
 */
export function getMetaMaskChainConfig(config = DEFAULT_CHAIN_CONFIG) {
  return {
    chainId: "0x1A4", // 420 in hex — private testnet only
    chainName: `${config.chainName} (Private Testnet)`,
    nativeCurrency: {
      name: "BlockID Share Token",
      symbol: "SHARE",
      decimals: 6,
    },
    rpcUrls: [config.rpcUrl.replace("26657", "8545")], // EVM JSON-RPC port
    blockExplorerUrls: ["https://explorer.blockid.au"],
  };
}

/**
 * Wallet connection status for UI.
 */
export interface WalletStatus {
  connected: boolean;
  address: string | null;
  balance: bigint;
  shares: number;
  chainOnline: boolean;
}

export async function getWalletStatus(address?: string): Promise<WalletStatus> {
  const chainOnline = await isChainOnline();
  if (!chainOnline || !address) {
    return { connected: false, address: null, balance: BigInt(0), shares: 0, chainOnline };
  }
  const balance = await getTokenBalance(address);
  return {
    connected: true,
    address,
    balance,
    shares: tokensToShares(balance),
    chainOnline,
  };
}
