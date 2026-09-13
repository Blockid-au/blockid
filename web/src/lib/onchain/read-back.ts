// S27-B — chain → cap-table read-back + pure reconciliation.
//
// Blockchain sync (lib/blockchain-sync.ts) is one-way: the register PUSHES
// mint / transfer / vest events onto the queue. This module is the other
// direction — read the deployed share-token contract's holder balances and
// compare them with the off-chain register, which stays the source of truth
// ("off-chain first").
//
// RPC host: fixed from the environment (`EVM_RPC_URL`, falling back to the
// BlockID private chain endpoint in lib/wallet.ts). Never user-supplied — a
// caller can only name the token ADDRESS, and even that comes from the
// project's own `blockchain_sync_config` row.
//
// Holder discovery: the SVToken is a plain ERC-20 with `Transfer` events, so
// every address that ever held tokens appears as `to` in a Transfer log.
// The private chain (Anvil, chainId 420) is small enough to scan from block
// 0; addresses are de-duplicated and their live `balanceOf` read in one
// JSON-RPC batch. Register wallets (`shareholders.evm_address`) are always
// included so a wallet with a zero balance is still reported as MISSING.
//
// No `server-only` import: the pure half (`reconcileCapTable`, decoders) is
// unit-tested directly and could be shared with a client view; the RPC half
// is only ever called from route / cron handlers.

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/** keccak256("balanceOf(address)") first 4 bytes */
const BALANCE_OF_SELECTOR = "0x70a08231";
/** keccak256("decimals()") first 4 bytes */
const DECIMALS_SELECTOR = "0x313ce567";
/** keccak256("totalSupply()") first 4 bytes */
const TOTAL_SUPPLY_SELECTOR = "0x18160ddd";
/** keccak256("Transfer(address,address,uint256)") */
export const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const DEFAULT_RPC = "https://chain.blockid.au/evm";
const RPC_TIMEOUT_MS = 15_000;
const MAX_HOLDERS = 2_000;

export function chainRpcUrl(): string {
  const v = process.env.EVM_RPC_URL;
  return typeof v === "string" && /^https?:\/\//.test(v) ? v : DEFAULT_RPC;
}

export function isAddress(v: unknown): v is string {
  return typeof v === "string" && ADDRESS_RE.test(v);
}

export function normaliseAddress(addr: string): string {
  return addr.toLowerCase();
}

export function padAddress(addr: string): string {
  return addr.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

export function decodeBigInt(hex: string | null | undefined): bigint {
  if (typeof hex !== "string") return 0n;
  const clean = hex.replace(/^0x/, "");
  if (!clean || /^0+$/.test(clean)) return 0n;
  if (!/^[0-9a-fA-F]+$/.test(clean)) return 0n;
  return BigInt("0x" + clean);
}

/** `topics[n]` of a Transfer log is a 32-byte left-padded address. */
export function topicToAddress(topic: string | null | undefined): string | null {
  if (typeof topic !== "string") return null;
  const clean = topic.replace(/^0x/, "");
  if (clean.length !== 64) return null;
  const addr = "0x" + clean.slice(24);
  return ADDRESS_RE.test(addr) ? addr.toLowerCase() : null;
}

// ---------------------------------------------------------------------------
// JSON-RPC client (fetch, batched)
// ---------------------------------------------------------------------------

interface RpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params: unknown[];
}
interface RpcResponse {
  id: number;
  result?: unknown;
  error?: { code?: number; message?: string };
}

export type RpcFetch = (input: string, init: RequestInit) => Promise<Response>;

export class ChainUnreachableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChainUnreachableError";
  }
}

async function rpcBatch(requests: RpcRequest[], fetchImpl: RpcFetch): Promise<RpcResponse[]> {
  if (requests.length === 0) return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetchImpl(chainRpcUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requests),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    throw new ChainUnreachableError(err instanceof Error ? err.message : "RPC fetch failed");
  }
  clearTimeout(timer);
  if (!res.ok) throw new ChainUnreachableError(`RPC HTTP ${res.status}`);
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new ChainUnreachableError("RPC returned a non-JSON body");
  }
  const list = Array.isArray(json) ? (json as RpcResponse[]) : [json as RpcResponse];
  return list;
}

async function rpcCall<T>(method: string, params: unknown[], fetchImpl: RpcFetch): Promise<T> {
  const [r] = await rpcBatch([{ jsonrpc: "2.0", id: 1, method, params }], fetchImpl);
  if (!r || r.error) throw new ChainUnreachableError(r?.error?.message ?? `RPC ${method} failed`);
  return r.result as T;
}

async function ethCall(to: string, data: string, fetchImpl: RpcFetch): Promise<string> {
  return rpcCall<string>("eth_call", [{ to, data }, "latest"], fetchImpl);
}

// ---------------------------------------------------------------------------
// Read-back
// ---------------------------------------------------------------------------

export interface OnChainHolder {
  holderAddress: string;
  /** whole shares (balance ÷ 10^decimals) */
  shares: number;
}

export interface OnChainSnapshot {
  tokenAddress: string;
  decimals: number;
  totalSupplyShares: number;
  holders: OnChainHolder[];
  blockNumber: number | null;
}

export interface ReadBackOptions {
  /** Register wallets to include even when no Transfer log names them. */
  knownAddresses?: string[];
  fetchImpl?: RpcFetch;
}

/**
 * Read the holder list + balances of a share-token contract. Throws
 * `ChainUnreachableError` when the RPC host cannot be read — callers map
 * that to status `unreachable` and never treat it as drift.
 */
export async function readTokenHolders(tokenAddress: string, opts: ReadBackOptions = {}): Promise<OnChainSnapshot> {
  if (!isAddress(tokenAddress) || tokenAddress.toLowerCase() === ZERO_ADDRESS) {
    throw new Error("Invalid token address");
  }
  const fetchImpl: RpcFetch = opts.fetchImpl ?? ((input, init) => fetch(input, init));
  const token = tokenAddress.toLowerCase();

  const [decimalsHex, supplyHex, blockHex] = await Promise.all([
    ethCall(token, DECIMALS_SELECTOR, fetchImpl),
    ethCall(token, TOTAL_SUPPLY_SELECTOR, fetchImpl),
    rpcCall<string>("eth_blockNumber", [], fetchImpl).catch(() => null),
  ]);
  const decimals = Number(decodeBigInt(decimalsHex));
  if (!Number.isFinite(decimals) || decimals < 0 || decimals > 36) {
    throw new ChainUnreachableError("Token decimals could not be decoded");
  }
  const divisor = 10n ** BigInt(decimals);

  // Holder discovery: every `to` of a Transfer log + the register wallets.
  const logs = await rpcCall<Array<{ topics?: string[] }>>(
    "eth_getLogs",
    [{ fromBlock: "0x0", toBlock: "latest", address: token, topics: [TRANSFER_TOPIC] }],
    fetchImpl,
  );
  const candidates = new Set<string>();
  for (const a of opts.knownAddresses ?? []) if (isAddress(a)) candidates.add(a.toLowerCase());
  for (const log of Array.isArray(logs) ? logs : []) {
    const to = topicToAddress(log.topics?.[2]);
    if (to && to !== ZERO_ADDRESS) candidates.add(to);
    if (candidates.size >= MAX_HOLDERS) break;
  }

  const addresses = [...candidates];
  const requests: RpcRequest[] = addresses.map((addr, i) => ({
    jsonrpc: "2.0",
    id: i + 1,
    method: "eth_call",
    params: [{ to: token, data: BALANCE_OF_SELECTOR + padAddress(addr) }, "latest"],
  }));
  const responses = await rpcBatch(requests, fetchImpl);
  const byId = new Map<number, RpcResponse>();
  for (const r of responses) byId.set(Number(r.id), r);

  const holders: OnChainHolder[] = [];
  addresses.forEach((addr, i) => {
    const r = byId.get(i + 1);
    if (!r || r.error) throw new ChainUnreachableError(r?.error?.message ?? `balanceOf(${addr}) failed`);
    const raw = decodeBigInt(typeof r.result === "string" ? r.result : "0x");
    const shares = Number(raw / divisor);
    if (shares > 0 || candidates.has(addr)) holders.push({ holderAddress: addr, shares });
  });
  holders.sort((a, b) => b.shares - a.shares || a.holderAddress.localeCompare(b.holderAddress));

  return {
    tokenAddress: token,
    decimals,
    totalSupplyShares: Number(decodeBigInt(supplyHex) / divisor),
    holders,
    blockNumber: blockHex ? Number(decodeBigInt(blockHex)) : null,
  };
}

// ---------------------------------------------------------------------------
// Pure reconciliation
// ---------------------------------------------------------------------------

export interface OffChainHolder {
  shareholderId: string;
  name: string;
  /** shareholders.evm_address — null when the holder has no wallet yet */
  address: string | null;
  shares: number;
}

export interface DriftRow {
  shareholder: string;
  shareholderId: string;
  address: string;
  offchain: number;
  onchain: number;
  /** offchain − onchain: positive = the chain is short, negative = the chain holds more */
  delta: number;
}

export interface ReconcileResult {
  matched: Array<{ shareholder: string; shareholderId: string; address: string; shares: number }>;
  driftRows: DriftRow[];
  /** wallets holding tokens that no register row claims */
  unknownOnChain: Array<{ address: string; shares: number }>;
  /** register rows with a wallet but a zero on-chain balance, plus rows with no wallet at all */
  missingOnChain: Array<{ shareholder: string; shareholderId: string; address: string | null; shares: number; reason: "zero_balance" | "no_wallet" }>;
  totals: {
    offchainShares: number;
    onchainShares: number;
    /** offchainShares − onchainShares */
    delta: number;
    registerRows: number;
    onchainHolders: number;
    driftCount: number;
  };
  status: "in_sync" | "drift";
}

function whole(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
}

/**
 * Compare the off-chain register with the on-chain holder list. Pure.
 *
 * - A register row with a wallet is MATCHED when its balance equals
 *   `shares`, DRIFT when it differs (zero balance = MISSING, reason
 *   zero_balance), and every unmatched on-chain wallet is UNKNOWN.
 * - Register rows without a wallet are MISSING (reason no_wallet) — they
 *   cannot be on chain yet; they count towards the drift total so the
 *   status is `drift` until every holder has a wallet (or `shares` is 0).
 * - Two register rows sharing one wallet are compared against the SUMMED
 *   register shares under the first row's name.
 */
export function reconcileCapTable(offchain: OffChainHolder[], onchain: OnChainHolder[]): ReconcileResult {
  const chain = new Map<string, number>();
  for (const h of onchain) {
    if (!isAddress(h.holderAddress)) continue;
    const key = h.holderAddress.toLowerCase();
    chain.set(key, (chain.get(key) ?? 0) + whole(h.shares));
  }

  const byAddress = new Map<string, OffChainHolder & { shares: number }>();
  const noWallet: OffChainHolder[] = [];
  for (const h of offchain) {
    const shares = whole(h.shares);
    if (!h.address || !isAddress(h.address)) {
      noWallet.push({ ...h, shares });
      continue;
    }
    const key = h.address.toLowerCase();
    const prev = byAddress.get(key);
    if (prev) prev.shares += shares;
    else byAddress.set(key, { ...h, address: key, shares });
  }

  const result: ReconcileResult = {
    matched: [],
    driftRows: [],
    unknownOnChain: [],
    missingOnChain: [],
    totals: { offchainShares: 0, onchainShares: 0, delta: 0, registerRows: offchain.length, onchainHolders: 0, driftCount: 0 },
    status: "in_sync",
  };

  const seen = new Set<string>();
  for (const [address, h] of byAddress) {
    seen.add(address);
    const onchainShares = chain.get(address) ?? 0;
    result.totals.offchainShares += h.shares;
    if (onchainShares === h.shares) {
      result.matched.push({ shareholder: h.name, shareholderId: h.shareholderId, address, shares: h.shares });
    } else if (onchainShares === 0 && h.shares > 0) {
      result.missingOnChain.push({ shareholder: h.name, shareholderId: h.shareholderId, address, shares: h.shares, reason: "zero_balance" });
    } else {
      result.driftRows.push({
        shareholder: h.name,
        shareholderId: h.shareholderId,
        address,
        offchain: h.shares,
        onchain: onchainShares,
        delta: h.shares - onchainShares,
      });
    }
  }
  for (const h of noWallet) {
    result.totals.offchainShares += h.shares;
    if (h.shares > 0) {
      result.missingOnChain.push({ shareholder: h.name, shareholderId: h.shareholderId, address: null, shares: h.shares, reason: "no_wallet" });
    }
  }
  for (const [address, shares] of chain) {
    result.totals.onchainShares += shares;
    if (shares > 0) result.totals.onchainHolders += 1;
    if (!seen.has(address) && shares > 0) result.unknownOnChain.push({ address, shares });
  }

  result.driftRows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.shareholder.localeCompare(b.shareholder));
  result.unknownOnChain.sort((a, b) => b.shares - a.shares);
  result.totals.delta = result.totals.offchainShares - result.totals.onchainShares;
  result.totals.driftCount = result.driftRows.length + result.unknownOnChain.length + result.missingOnChain.length;
  result.status = result.totals.driftCount === 0 ? "in_sync" : "drift";
  return result;
}
