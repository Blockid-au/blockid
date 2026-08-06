// Colocated vitest for `wallet.ts` — the browser-side MetaMask bridge that
// speaks raw EIP-1193 (no ethers.js) to the BlockID private EVM (chainId
// 420). This module is on the hot path for every founder wallet flow:
//   * connect / switch-chain / disconnect
//   * ERC-20 read/write against equity-share tokens
//   * TokenFactory enumeration (drives the /wallet dashboard)
//   * Vesting grant lifecycle (grant / claim / revoke)
//   * Dividend declare / claim / query
//
// Why this suite exists:
//   * The module hand-encodes 4-byte selectors + ABI padding for every
//     write. A single-hex mistake in a selector or padded arg silently
//     sends a bogus transaction to the token contract — the failure mode
//     is "wrong balance quietly" or "reverted tx after gas paid", not a
//     crash. This suite pins every selector against the current source
//     and asserts the exact `data` string the provider receives.
//   * `switchToBlockIDChain` / `connectWallet` both re-add the chain when
//     MetaMask errors with code 4902. Losing that branch means a fresh
//     MetaMask install can never join the private chain — first-run
//     onboarding breaks.
//   * `getCurrentChainId`, `getConnectedAccount`, `onAccountsChanged`,
//     `onChainChanged` all swallow errors / no-op when `window.ethereum`
//     is missing. Any of these throwing at page mount crashes the whole
//     React tree via the error boundary, since callers subscribe eagerly.
//   * The pure formatting helpers (`formatTokenAmount`, `parseTokenAmount`,
//     `shortenAddress`) are user-visible in every wallet screen; the
//     bigint↔string round-trip must be exact.
//
// Strategy:
//   Install a fake `window.ethereum` on `globalThis.window` before each
//   test whose `request({method, params})` returns queued responses. The
//   fake records every call so we can assert on the exact `method`,
//   `params`, and `data` payload. `vi.stubGlobal` puts it in place and
//   `vi.unstubAllGlobals()` tears it down.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BLOCKID_CHAIN,
  CONTRACTS,
  isMetaMaskInstalled,
  getCurrentChainId,
  isOnBlockIDChain,
  switchToBlockIDChain,
  disconnectWallet,
  connectWallet,
  getConnectedAccount,
  getTokenBalance,
  getTokenDecimals,
  getTokenSymbol,
  getTokenName,
  getTokenTotalSupply,
  transferTokens,
  addTokenToMetaMask,
  getCompanyCount,
  getCompany,
  getAllCompanies,
  mintTokens,
  burnTokens,
  getVestingGrant,
  getVestedAmount,
  grantVesting,
  claimVested,
  revokeVesting,
  declareDividend,
  claimDividend,
  getDividendRoundCount,
  getDividendRound,
  isDividendClaimed,
  onAccountsChanged,
  onChainChanged,
  formatTokenAmount,
  parseTokenAmount,
  shortenAddress,
} from "./wallet";

// ─── Provider harness ───────────────────────────────────────────────────────

type RequestArgs = { method: string; params?: unknown[] | object };

interface ProviderCall {
  method: string;
  params: unknown;
}

interface FakeProvider {
  isMetaMask?: boolean;
  request: (args: RequestArgs) => Promise<unknown>;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
  __calls: ProviderCall[];
  __listeners: Record<string, Array<(...args: unknown[]) => void>>;
  __removed: Array<{ event: string; handler: (...args: unknown[]) => void }>;
}

type Responder =
  | { kind: "value"; value: unknown }
  | { kind: "throw"; error: unknown };

interface HarnessOptions {
  routes?: Partial<Record<string, Responder | Responder[]>>;
  isMetaMask?: boolean;
}

function installProvider(opts: HarnessOptions = {}): FakeProvider {
  const routes = opts.routes ?? {};
  // Per-method response queues so a test can enqueue multiple ordered
  // replies for the same method (e.g. two eth_accounts calls in one flow).
  const queues = new Map<string, Responder[]>();
  for (const [m, r] of Object.entries(routes)) {
    if (!r) continue;
    queues.set(m, Array.isArray(r) ? [...r] : [r]);
  }

  const listeners: FakeProvider["__listeners"] = {};
  const removed: FakeProvider["__removed"] = [];
  const calls: ProviderCall[] = [];

  const provider: FakeProvider = {
    isMetaMask: opts.isMetaMask ?? true,
    request: async ({ method, params }) => {
      calls.push({ method, params });
      const q = queues.get(method);
      if (!q || q.length === 0) {
        throw new Error(`FakeProvider: no response queued for method='${method}'`);
      }
      const next = q.shift()!;
      // If the queue is exhausted but only had a single entry, replay it — this
      // matches the shape of most real handlers (idempotent reads).
      if (q.length === 0 && (Array.isArray(routes[method]) ? false : true)) {
        queues.set(method, [next]);
      }
      if (next.kind === "throw") throw next.error;
      return next.value;
    },
    on: (event, handler) => {
      (listeners[event] ??= []).push(handler);
    },
    removeListener: (event, handler) => {
      removed.push({ event, handler });
      const arr = listeners[event];
      if (arr) {
        const idx = arr.indexOf(handler);
        if (idx >= 0) arr.splice(idx, 1);
      }
    },
    __calls: calls,
    __listeners: listeners,
    __removed: removed,
  };

  vi.stubGlobal("window", { ethereum: provider });
  return provider;
}

function installNoWindow() {
  vi.stubGlobal("window", undefined);
}

function installWindowWithoutEthereum() {
  vi.stubGlobal("window", {});
}

// ─── Global hooks ───────────────────────────────────────────────────────────

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─── Constants ──────────────────────────────────────────────────────────────

describe("constants", () => {
  it("BLOCKID_CHAIN.chainId is the hex form of decimal 420 (0x1A4)", () => {
    expect(BLOCKID_CHAIN.chainId).toBe("0x1A4");
    expect(parseInt(BLOCKID_CHAIN.chainId, 16)).toBe(420);
  });

  it("BLOCKID_CHAIN carries the wallet_addEthereumChain payload shape MetaMask requires", () => {
    expect(BLOCKID_CHAIN.chainName).toBe("BlockID Private Testnet");
    expect(BLOCKID_CHAIN.nativeCurrency).toEqual({
      name: "BlockID Coin",
      symbol: "BID",
      decimals: 18,
    });
    expect(BLOCKID_CHAIN.rpcUrls).toEqual(["https://chain.blockid.au/evm"]);
    expect(BLOCKID_CHAIN.blockExplorerUrls).toEqual(["https://explorer.blockid.au"]);
  });

  it("CONTRACTS.tokenFactory and CONTRACTS.svt are 0x-prefixed 40-hex addresses", () => {
    expect(CONTRACTS.tokenFactory).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(CONTRACTS.svt).toMatch(/^0x[0-9a-fA-F]{40}$/);
    // Pins the current deploy — a change here forces a review of the
    // callsites (dataroom quotes, /wallet page).
    expect(CONTRACTS.tokenFactory).toBe("0x5FbDB2315678afecb367f032d93F642f64180aa3");
    expect(CONTRACTS.svt).toBe("0xa16E02E87b7454126E5E10d957A927A7F5B5d2be");
  });
});

// ─── isMetaMaskInstalled ────────────────────────────────────────────────────

describe("isMetaMaskInstalled", () => {
  it("returns false when window is undefined (SSR / node)", () => {
    installNoWindow();
    expect(isMetaMaskInstalled()).toBe(false);
  });

  it("returns false when window exists but has no ethereum injection", () => {
    installWindowWithoutEthereum();
    expect(isMetaMaskInstalled()).toBe(false);
  });

  it("returns true when window.ethereum is present", () => {
    installProvider();
    expect(isMetaMaskInstalled()).toBe(true);
  });
});

// ─── getCurrentChainId / isOnBlockIDChain ───────────────────────────────────

describe("getCurrentChainId", () => {
  it("returns the chainId returned by eth_chainId", async () => {
    const p = installProvider({ routes: { eth_chainId: { kind: "value", value: "0x1a4" } } });
    await expect(getCurrentChainId()).resolves.toBe("0x1a4");
    expect(p.__calls[0]).toEqual({ method: "eth_chainId", params: undefined });
  });

  it("returns null (does NOT throw) when the provider is missing — page mount must survive", async () => {
    installNoWindow();
    await expect(getCurrentChainId()).resolves.toBeNull();
  });

  it("returns null when the provider throws (network / rejected)", async () => {
    installProvider({
      routes: { eth_chainId: { kind: "throw", error: new Error("user rejected") } },
    });
    await expect(getCurrentChainId()).resolves.toBeNull();
  });
});

describe("isOnBlockIDChain", () => {
  it("returns true when chainId matches BLOCKID_CHAIN.chainId case-insensitively (0x1a4 vs 0x1A4)", async () => {
    installProvider({ routes: { eth_chainId: { kind: "value", value: "0x1a4" } } });
    await expect(isOnBlockIDChain()).resolves.toBe(true);
  });

  it("returns true when the RPC returns the exact BLOCKID hex form (0x1A4)", async () => {
    installProvider({ routes: { eth_chainId: { kind: "value", value: "0x1A4" } } });
    await expect(isOnBlockIDChain()).resolves.toBe(true);
  });

  it("returns false for mainnet chainId (0x1)", async () => {
    installProvider({ routes: { eth_chainId: { kind: "value", value: "0x1" } } });
    await expect(isOnBlockIDChain()).resolves.toBe(false);
  });

  it("returns false when getCurrentChainId resolves null (no wallet)", async () => {
    installNoWindow();
    await expect(isOnBlockIDChain()).resolves.toBe(false);
  });
});

// ─── switchToBlockIDChain ───────────────────────────────────────────────────

describe("switchToBlockIDChain", () => {
  it("calls wallet_switchEthereumChain with the BlockID chainId and NO fallback add", async () => {
    const p = installProvider({
      routes: { wallet_switchEthereumChain: { kind: "value", value: null } },
    });
    await switchToBlockIDChain();
    expect(p.__calls).toHaveLength(1);
    expect(p.__calls[0].method).toBe("wallet_switchEthereumChain");
    expect(p.__calls[0].params).toEqual([{ chainId: "0x1A4" }]);
  });

  it("falls back to wallet_addEthereumChain when the switch errors with code 4902 (chain unknown)", async () => {
    const err = Object.assign(new Error("Unrecognized chain"), { code: 4902 });
    const p = installProvider({
      routes: {
        wallet_switchEthereumChain: { kind: "throw", error: err },
        wallet_addEthereumChain: { kind: "value", value: null },
      },
    });
    await switchToBlockIDChain();
    expect(p.__calls.map((c) => c.method)).toEqual([
      "wallet_switchEthereumChain",
      "wallet_addEthereumChain",
    ]);
    const addParams = p.__calls[1].params as Array<Record<string, unknown>>;
    expect(addParams[0].chainId).toBe("0x1A4");
    expect(addParams[0].chainName).toBe("BlockID Private Testnet");
    // rpcUrls is spread from a `readonly` tuple, so callers get a fresh
    // mutable array rather than the frozen source.
    expect(addParams[0].rpcUrls).toEqual(["https://chain.blockid.au/evm"]);
    expect(addParams[0].blockExplorerUrls).toEqual(["https://explorer.blockid.au"]);
  });

  it("re-throws non-4902 errors (e.g. user rejection code 4001)", async () => {
    const err = Object.assign(new Error("user rejected"), { code: 4001 });
    installProvider({
      routes: { wallet_switchEthereumChain: { kind: "throw", error: err } },
    });
    await expect(switchToBlockIDChain()).rejects.toMatchObject({ code: 4001 });
  });

  it("throws 'MetaMask not installed' when the provider is missing", async () => {
    installNoWindow();
    await expect(switchToBlockIDChain()).rejects.toThrow(/MetaMask not installed/);
  });
});

// ─── disconnectWallet ───────────────────────────────────────────────────────

describe("disconnectWallet", () => {
  it("calls wallet_revokePermissions with eth_accounts scope", async () => {
    const p = installProvider({
      routes: { wallet_revokePermissions: { kind: "value", value: null } },
    });
    await disconnectWallet();
    expect(p.__calls[0].method).toBe("wallet_revokePermissions");
    expect(p.__calls[0].params).toEqual([{ eth_accounts: {} }]);
  });

  it("swallows errors when wallet_revokePermissions is unsupported (older MetaMask)", async () => {
    installProvider({
      routes: {
        wallet_revokePermissions: { kind: "throw", error: new Error("unsupported") },
      },
    });
    await expect(disconnectWallet()).resolves.toBeUndefined();
  });

  it("swallows the missing-provider throw so a logout button never crashes", async () => {
    installNoWindow();
    await expect(disconnectWallet()).resolves.toBeUndefined();
  });
});

// ─── connectWallet ──────────────────────────────────────────────────────────

describe("connectWallet", () => {
  it("returns the first account after switching to BlockID chain (happy path)", async () => {
    const p = installProvider({
      routes: {
        eth_requestAccounts: { kind: "value", value: ["0xAAA", "0xBBB"] },
        wallet_switchEthereumChain: { kind: "value", value: null },
      },
    });
    await expect(connectWallet()).resolves.toBe("0xAAA");
    expect(p.__calls.map((c) => c.method)).toEqual([
      "eth_requestAccounts",
      "wallet_switchEthereumChain",
    ]);
  });

  it("adds the chain via wallet_addEthereumChain when switch errors with 4902", async () => {
    const err = Object.assign(new Error("unknown chain"), { code: 4902 });
    const p = installProvider({
      routes: {
        eth_requestAccounts: { kind: "value", value: ["0x111"] },
        wallet_switchEthereumChain: { kind: "throw", error: err },
        wallet_addEthereumChain: { kind: "value", value: null },
      },
    });
    await expect(connectWallet()).resolves.toBe("0x111");
    expect(p.__calls.map((c) => c.method)).toEqual([
      "eth_requestAccounts",
      "wallet_switchEthereumChain",
      "wallet_addEthereumChain",
    ]);
  });

  it("throws when eth_requestAccounts returns an empty array (MetaMask locked)", async () => {
    installProvider({
      routes: { eth_requestAccounts: { kind: "value", value: [] } },
    });
    await expect(connectWallet()).rejects.toThrow(/unlock MetaMask/);
  });

  it("re-throws non-4902 switch errors instead of attempting to add", async () => {
    const err = Object.assign(new Error("user reject"), { code: 4001 });
    const p = installProvider({
      routes: {
        eth_requestAccounts: { kind: "value", value: ["0xAAA"] },
        wallet_switchEthereumChain: { kind: "throw", error: err },
      },
    });
    await expect(connectWallet()).rejects.toMatchObject({ code: 4001 });
    // Must NOT have called add — non-4902 must not auto-add.
    expect(p.__calls.map((c) => c.method)).not.toContain("wallet_addEthereumChain");
  });
});

// ─── getConnectedAccount ────────────────────────────────────────────────────

describe("getConnectedAccount", () => {
  it("returns the first account (no user prompt) when accounts exist", async () => {
    installProvider({
      routes: { eth_accounts: { kind: "value", value: ["0xCAFE", "0xBEEF"] } },
    });
    await expect(getConnectedAccount()).resolves.toBe("0xCAFE");
  });

  it("returns null (not undefined) when no accounts are authorized", async () => {
    installProvider({ routes: { eth_accounts: { kind: "value", value: [] } } });
    await expect(getConnectedAccount()).resolves.toBeNull();
  });

  it("returns null when the provider is missing (page mount must survive SSR / no-wallet)", async () => {
    installNoWindow();
    await expect(getConnectedAccount()).resolves.toBeNull();
  });
});

// ─── ERC-20 reads ───────────────────────────────────────────────────────────

describe("getTokenBalance", () => {
  it("encodes balanceOf(address) with a 32-byte-padded address and returns bigint", async () => {
    // ABI-encoded (uint256) 42
    const enc42 = "0x" + "0".repeat(62) + "2a";
    const p = installProvider({ routes: { eth_call: { kind: "value", value: enc42 } } });
    const result = await getTokenBalance("0xTOKEN", "0x1234567890abcdef1234567890abcdef12345678");
    expect(result).toBe(42n);
    const call = p.__calls[0];
    expect(call.method).toBe("eth_call");
    const [txArg, block] = call.params as [{ to: string; data: string }, string];
    expect(block).toBe("latest");
    expect(txArg.to).toBe("0xTOKEN");
    // Selector 0x70a08231 + 24-byte zero pad + 20-byte address (lower)
    expect(txArg.data).toBe(
      "0x70a08231" + "0".repeat(24) + "1234567890abcdef1234567890abcdef12345678",
    );
  });

  it("decodes 0x0000... as 0n (no supply / never held)", async () => {
    installProvider({ routes: { eth_call: { kind: "value", value: "0x" + "0".repeat(64) } } });
    await expect(getTokenBalance("0xT", "0xU")).resolves.toBe(0n);
  });

  it("decodes a full 32-byte value larger than Number.MAX_SAFE_INTEGER without loss", async () => {
    const huge = "0x" + "f".repeat(64);
    installProvider({ routes: { eth_call: { kind: "value", value: huge } } });
    await expect(getTokenBalance("0xT", "0xU")).resolves.toBe(2n ** 256n - 1n);
  });
});

describe("getTokenDecimals", () => {
  it("returns 18 for the canonical ERC-20 shape (0x…12)", async () => {
    const enc18 = "0x" + "0".repeat(62) + "12";
    const p = installProvider({ routes: { eth_call: { kind: "value", value: enc18 } } });
    await expect(getTokenDecimals("0xTOK")).resolves.toBe(18);
    const [txArg] = p.__calls[0].params as [{ data: string }];
    expect(txArg.data).toBe("0x313ce567");
  });

  it("returns 6 for a USDC-style token", async () => {
    const enc6 = "0x" + "0".repeat(62) + "06";
    installProvider({ routes: { eth_call: { kind: "value", value: enc6 } } });
    await expect(getTokenDecimals("0xTOK")).resolves.toBe(6);
  });
});

describe("getTokenSymbol", () => {
  it("decodes the standard ABI string layout (offset=32, len=3, 'SVT')", async () => {
    // offset(0x20) | length(3) | "SVT" padded to 32 bytes
    const svtHex = "53" + "56" + "54"; // S, V, T
    const encoded =
      "0x" +
      "0".repeat(62) +
      "20" +
      "0".repeat(62) +
      "03" +
      svtHex +
      "0".repeat(64 - svtHex.length);
    installProvider({ routes: { eth_call: { kind: "value", value: encoded } } });
    await expect(getTokenSymbol("0xTOK")).resolves.toBe("SVT");
  });

  it("returns '' for a shorter-than-header payload (defensive against malformed rpc)", async () => {
    installProvider({ routes: { eth_call: { kind: "value", value: "0x1234" } } });
    await expect(getTokenSymbol("0xTOK")).resolves.toBe("");
  });

  it("returns '' when length header is zero (empty symbol)", async () => {
    const encoded =
      "0x" +
      "0".repeat(62) +
      "20" +
      "0".repeat(64);
    installProvider({ routes: { eth_call: { kind: "value", value: encoded } } });
    await expect(getTokenSymbol("0xTOK")).resolves.toBe("");
  });
});

describe("getTokenName", () => {
  it("uses the name() selector 0x06fdde03", async () => {
    const encoded =
      "0x" +
      "0".repeat(62) +
      "20" +
      "0".repeat(62) +
      "04" +
      "41435445" + // "ACTE"
      "0".repeat(56);
    const p = installProvider({ routes: { eth_call: { kind: "value", value: encoded } } });
    await expect(getTokenName("0xTOK")).resolves.toBe("ACTE");
    const [txArg] = p.__calls[0].params as [{ data: string }];
    expect(txArg.data).toBe("0x06fdde03");
  });
});

describe("getTokenTotalSupply", () => {
  it("returns bigint total supply decoded from a 32-byte return", async () => {
    const enc = "0x" + "0".repeat(60) + "3e8"; // 1000
    const p = installProvider({ routes: { eth_call: { kind: "value", value: enc } } });
    await expect(getTokenTotalSupply("0xTOK")).resolves.toBe(1000n);
    const [txArg] = p.__calls[0].params as [{ data: string }];
    expect(txArg.data).toBe("0x18160ddd");
  });
});

// ─── ERC-20 writes ──────────────────────────────────────────────────────────

describe("transferTokens", () => {
  it("encodes transfer(address,uint256), returns tx hash, uses 0x30D40 gas", async () => {
    const p = installProvider({
      routes: {
        eth_accounts: { kind: "value", value: ["0xFROM"] },
        eth_sendTransaction: { kind: "value", value: "0xTXHASH" },
      },
    });
    const hash = await transferTokens(
      "0xTOKEN",
      "0xabcdef0000000000000000000000000000000001",
      100n,
    );
    expect(hash).toBe("0xTXHASH");
    const send = p.__calls.find((c) => c.method === "eth_sendTransaction");
    const [tx] = send!.params as [{ from: string; to: string; data: string; gas: string }];
    expect(tx.from).toBe("0xFROM");
    expect(tx.to).toBe("0xTOKEN");
    expect(tx.gas).toBe("0x30D40");
    // selector 0xa9059cbb + padded to + padded amount (100 = 0x64)
    expect(tx.data).toBe(
      "0xa9059cbb" +
        "0".repeat(24) +
        "abcdef0000000000000000000000000000000001" +
        "0".repeat(62) +
        "64",
    );
  });

  it("throws 'Wallet not connected' when eth_accounts is empty", async () => {
    installProvider({
      routes: {
        eth_accounts: { kind: "value", value: [] },
        eth_sendTransaction: { kind: "value", value: "0x" },
      },
    });
    await expect(transferTokens("0xT", "0xTO", 1n)).rejects.toThrow(/Wallet not connected/);
  });
});

// ─── addTokenToMetaMask ─────────────────────────────────────────────────────

describe("addTokenToMetaMask", () => {
  it("calls wallet_watchAsset with type ERC20 + options and returns provider boolean", async () => {
    const p = installProvider({
      routes: { wallet_watchAsset: { kind: "value", value: true } },
    });
    await expect(
      addTokenToMetaMask("0xT", "SVT", 18, "https://blockid.au/token.png"),
    ).resolves.toBe(true);
    const params = p.__calls[0].params as {
      type: string;
      options: { address: string; symbol: string; decimals: number; image?: string };
    };
    expect(params.type).toBe("ERC20");
    expect(params.options).toEqual({
      address: "0xT",
      symbol: "SVT",
      decimals: 18,
      image: "https://blockid.au/token.png",
    });
  });

  it("omits the image field when imageUrl is undefined", async () => {
    const p = installProvider({
      routes: { wallet_watchAsset: { kind: "value", value: false } },
    });
    await addTokenToMetaMask("0xT", "SVT", 18);
    const params = p.__calls[0].params as { options: Record<string, unknown> };
    expect("image" in params.options).toBe(false);
  });
});

// ─── TokenFactory ───────────────────────────────────────────────────────────

describe("getCompanyCount", () => {
  it("uses the getCompanyCount() selector 0xc369c773 and targets the factory", async () => {
    const enc = "0x" + "0".repeat(62) + "07"; // 7
    const p = installProvider({ routes: { eth_call: { kind: "value", value: enc } } });
    await expect(getCompanyCount()).resolves.toBe(7);
    const [txArg] = p.__calls[0].params as [{ to: string; data: string }];
    expect(txArg.to).toBe(CONTRACTS.tokenFactory);
    expect(txArg.data).toBe("0xc369c773");
  });
});

describe("getCompany", () => {
  it("decodes the tokenAddress from bytes 12..32 (skips the leading 12-byte zero pad)", async () => {
    // 32-byte return where the last 20 bytes are the address
    const addrHex = "1234567890abcdef1234567890abcdef12345678";
    const enc = "0x" + "0".repeat(24) + addrHex + "0".repeat(32 * 6 - 64);
    installProvider({ routes: { eth_call: { kind: "value", value: enc } } });
    const info = await getCompany(3);
    expect(info.tokenAddress).toBe("0x" + addrHex);
    // The other struct fields are intentionally stubbed to zero — the full
    // ABI-decode is deferred to a follow-up. Pin the placeholder shape so a
    // silent extension of the decode doesn't break downstream consumers.
    expect(info).toEqual({
      tokenAddress: "0x" + addrHex,
      name: "",
      symbol: "",
      companyId: "",
      initialSupply: 0n,
      createdAt: 0n,
    });
  });

  it("encodes the index as a 32-byte uint256 alongside the selector", async () => {
    const enc = "0x" + "0".repeat(24) + "a".repeat(40) + "0".repeat(64 * 5);
    const p = installProvider({ routes: { eth_call: { kind: "value", value: enc } } });
    await getCompany(2);
    const [txArg] = p.__calls[0].params as [{ data: string }];
    expect(txArg.data).toBe("0x2a4e7489" + "0".repeat(63) + "2");
  });
});

describe("getAllCompanies", () => {
  it("returns [] when count is 0 without making per-token follow-ups", async () => {
    const enc0 = "0x" + "0".repeat(64);
    const p = installProvider({ routes: { eth_call: { kind: "value", value: enc0 } } });
    await expect(getAllCompanies()).resolves.toEqual([]);
    // Only the count call; no follow-up name/symbol/supply reads.
    expect(p.__calls.filter((c) => c.method === "eth_call")).toHaveLength(1);
  });
});

// ─── Mint / burn ────────────────────────────────────────────────────────────

describe("mintTokens", () => {
  it("encodes selector 0x156e29f6 + address + amount + partition + string 'Admin mint'", async () => {
    const p = installProvider({
      routes: {
        eth_accounts: { kind: "value", value: ["0xADMIN"] },
        eth_sendTransaction: { kind: "value", value: "0xTX" },
      },
    });
    const hash = await mintTokens("0xTOKEN", "0xabcdef0000000000000000000000000000000abc", 500n);
    expect(hash).toBe("0xTX");
    const send = p.__calls.find((c) => c.method === "eth_sendTransaction");
    const [tx] = send!.params as [{ from: string; to: string; data: string; gas: string }];
    expect(tx.from).toBe("0xADMIN");
    expect(tx.gas).toBe("0x7A120");
    // Manually reconstruct the expected payload
    const selector = "0x156e29f6";
    const paddedTo = "0".repeat(24) + "abcdef0000000000000000000000000000000abc";
    const paddedAmount = "0".repeat(61) + "1f4"; // 500 = 0x1f4 → 3 hex chars, needs 61 zeros to fill 64
    const paddedPartition = "0".repeat(64);
    const paddedOffset = "0".repeat(62) + "80";
    const paddedLen = "0".repeat(62) + "0a"; // "Admin mint" is 10 bytes
    const strBytes = "41646d696e206d696e74"; // "Admin mint" hex
    const paddedStr = strBytes.padEnd(64, "0");
    expect(tx.data).toBe(
      selector + paddedTo + paddedAmount + paddedPartition + paddedOffset + paddedLen + paddedStr,
    );
  });

  it("throws when no account is connected", async () => {
    installProvider({
      routes: {
        eth_accounts: { kind: "value", value: [] },
        eth_sendTransaction: { kind: "value", value: "0x" },
      },
    });
    await expect(mintTokens("0xT", "0xTO", 1n)).rejects.toThrow(/Wallet not connected/);
  });
});

describe("burnTokens", () => {
  it("encodes selector 0x6d1b229d + amount + string 'Admin burn'", async () => {
    const p = installProvider({
      routes: {
        eth_accounts: { kind: "value", value: ["0xADMIN"] },
        eth_sendTransaction: { kind: "value", value: "0xBTX" },
      },
    });
    const hash = await burnTokens("0xTOKEN", 42n);
    expect(hash).toBe("0xBTX");
    const send = p.__calls.find((c) => c.method === "eth_sendTransaction");
    const [tx] = send!.params as [{ data: string; gas: string }];
    expect(tx.gas).toBe("0x7A120");
    const selector = "0x6d1b229d";
    const paddedAmount = "0".repeat(62) + "2a";
    const paddedOffset = "0".repeat(62) + "40";
    const paddedLen = "0".repeat(62) + "0a";
    const strBytes = "41646d696e206275726e"; // "Admin burn"
    const paddedStr = strBytes.padEnd(64, "0");
    expect(tx.data).toBe(selector + paddedAmount + paddedOffset + paddedLen + paddedStr);
  });

  it("throws when no account is connected", async () => {
    installProvider({
      routes: {
        eth_accounts: { kind: "value", value: [] },
        eth_sendTransaction: { kind: "value", value: "0x" },
      },
    });
    await expect(burnTokens("0xT", 1n)).rejects.toThrow(/Wallet not connected/);
  });
});

// ─── Vesting ────────────────────────────────────────────────────────────────

describe("getVestingGrant", () => {
  it("decodes six 32-byte fields (total, claimed, start, cliff, vesting, revoked)", async () => {
    // Build 6 × 32-byte hex fields packed together
    const parts = [
      1000n,
      250n,
      1_700_000_000n,
      2_592_000n, // 30 days cliff
      31_536_000n, // 1 year vest
      1n, // revoked = true
    ].map((v) => v.toString(16).padStart(64, "0"));
    const enc = "0x" + parts.join("");
    const p = installProvider({
      routes: { eth_call: { kind: "value", value: enc } },
    });
    const g = await getVestingGrant("0xTOK", "0xBENE");
    expect(g).toEqual({
      totalAmount: 1000n,
      claimedAmount: 250n,
      startTime: 1_700_000_000n,
      cliffDuration: 2_592_000n,
      vestingDuration: 31_536_000n,
      revoked: true,
    });
    const [txArg] = p.__calls[0].params as [{ data: string }];
    // Selector 0x9c4a0b09 + padded beneficiary
    expect(txArg.data.startsWith("0x9c4a0b09")).toBe(true);
  });

  it("treats revoked=0 as false", async () => {
    const parts = [0n, 0n, 0n, 0n, 0n, 0n].map((v) => v.toString(16).padStart(64, "0"));
    installProvider({ routes: { eth_call: { kind: "value", value: "0x" + parts.join("") } } });
    const g = await getVestingGrant("0xTOK", "0xBENE");
    expect(g.revoked).toBe(false);
  });
});

describe("getVestedAmount", () => {
  it("encodes selector 0x44b1231f + padded beneficiary and returns bigint", async () => {
    const enc = "0x" + "0".repeat(62) + "de"; // 222
    const p = installProvider({ routes: { eth_call: { kind: "value", value: enc } } });
    await expect(getVestedAmount("0xTOK", "0xBENE")).resolves.toBe(222n);
    const [txArg] = p.__calls[0].params as [{ data: string }];
    expect(txArg.data.startsWith("0x44b1231f")).toBe(true);
  });
});

describe("grantVesting", () => {
  it("encodes selector 0x5634ac3d + 4 args and returns tx hash", async () => {
    const p = installProvider({
      routes: {
        eth_accounts: { kind: "value", value: ["0xADMIN"] },
        eth_sendTransaction: { kind: "value", value: "0xGH" },
      },
    });
    const hash = await grantVesting(
      "0xTOKEN",
      "0xabcdef0000000000000000000000000000000abc",
      100n,
      60n,
      86400n,
    );
    expect(hash).toBe("0xGH");
    const send = p.__calls.find((c) => c.method === "eth_sendTransaction");
    const [tx] = send!.params as [{ data: string }];
    const selector = "0x5634ac3d";
    const paddedBene = "0".repeat(24) + "abcdef0000000000000000000000000000000abc";
    const paddedTotal = "0".repeat(62) + "64";
    const paddedCliff = "0".repeat(62) + "3c";
    const paddedVest = "0".repeat(59) + "15180";
    expect(tx.data).toBe(selector + paddedBene + paddedTotal + paddedCliff + paddedVest);
  });

  it("throws when no account is connected", async () => {
    installProvider({
      routes: {
        eth_accounts: { kind: "value", value: [] },
        eth_sendTransaction: { kind: "value", value: "0x" },
      },
    });
    await expect(grantVesting("0xT", "0xB", 1n, 1n, 1n)).rejects.toThrow(/Wallet not connected/);
  });
});

describe("claimVested", () => {
  it("encodes claimVested() as bare selector 0x4e71d92d", async () => {
    const p = installProvider({
      routes: {
        eth_accounts: { kind: "value", value: ["0xUSER"] },
        eth_sendTransaction: { kind: "value", value: "0xCT" },
      },
    });
    await expect(claimVested("0xTOKEN")).resolves.toBe("0xCT");
    const send = p.__calls.find((c) => c.method === "eth_sendTransaction");
    const [tx] = send!.params as [{ data: string; from: string; to: string }];
    expect(tx.data).toBe("0x4e71d92d");
    expect(tx.from).toBe("0xUSER");
    expect(tx.to).toBe("0xTOKEN");
  });

  it("throws when disconnected", async () => {
    installProvider({
      routes: {
        eth_accounts: { kind: "value", value: [] },
        eth_sendTransaction: { kind: "value", value: "0x" },
      },
    });
    await expect(claimVested("0xTOKEN")).rejects.toThrow(/Wallet not connected/);
  });
});

describe("revokeVesting", () => {
  it("encodes selector 0x20c5429b + padded beneficiary", async () => {
    const p = installProvider({
      routes: {
        eth_accounts: { kind: "value", value: ["0xADMIN"] },
        eth_sendTransaction: { kind: "value", value: "0xRV" },
      },
    });
    await revokeVesting("0xTOK", "0xabcdef0000000000000000000000000000000abc");
    const send = p.__calls.find((c) => c.method === "eth_sendTransaction");
    const [tx] = send!.params as [{ data: string }];
    expect(tx.data).toBe(
      "0x20c5429b" + "0".repeat(24) + "abcdef0000000000000000000000000000000abc",
    );
  });
});

// ─── Dividends ──────────────────────────────────────────────────────────────

describe("declareDividend", () => {
  it("encodes selector 0x2f4dae9f + amount", async () => {
    const p = installProvider({
      routes: {
        eth_accounts: { kind: "value", value: ["0xADMIN"] },
        eth_sendTransaction: { kind: "value", value: "0xDD" },
      },
    });
    await expect(declareDividend("0xTOK", 999n)).resolves.toBe("0xDD");
    const send = p.__calls.find((c) => c.method === "eth_sendTransaction");
    const [tx] = send!.params as [{ data: string }];
    expect(tx.data).toBe("0x2f4dae9f" + "0".repeat(61) + "3e7");
  });
});

describe("claimDividend", () => {
  it("encodes selector 0xa0712d68 + roundId", async () => {
    const p = installProvider({
      routes: {
        eth_accounts: { kind: "value", value: ["0xUSER"] },
        eth_sendTransaction: { kind: "value", value: "0xCD" },
      },
    });
    await claimDividend("0xTOK", 5n);
    const send = p.__calls.find((c) => c.method === "eth_sendTransaction");
    const [tx] = send!.params as [{ data: string }];
    expect(tx.data).toBe("0xa0712d68" + "0".repeat(63) + "5");
  });
});

describe("getDividendRoundCount", () => {
  it("uses selector 0x6a2f796c and decodes to number", async () => {
    const enc = "0x" + "0".repeat(63) + "3";
    const p = installProvider({ routes: { eth_call: { kind: "value", value: enc } } });
    await expect(getDividendRoundCount("0xTOK")).resolves.toBe(3);
    const [txArg] = p.__calls[0].params as [{ data: string }];
    expect(txArg.data).toBe("0x6a2f796c");
  });
});

describe("getDividendRound", () => {
  it("decodes 4 × 32-byte fields (total, perShare, snapshotSupply, declaredAt)", async () => {
    const parts = [10_000n, 5n, 2_000n, 1_700_000_100n].map((v) =>
      v.toString(16).padStart(64, "0"),
    );
    const enc = "0x" + parts.join("");
    const p = installProvider({ routes: { eth_call: { kind: "value", value: enc } } });
    const r = await getDividendRound("0xTOK", 0);
    expect(r).toEqual({
      totalAmount: 10_000n,
      perShareAmount: 5n,
      snapshotSupply: 2_000n,
      declaredAt: 1_700_000_100n,
    });
    const [txArg] = p.__calls[0].params as [{ data: string }];
    expect(txArg.data.startsWith("0xca9efc73")).toBe(true);
  });
});

describe("isDividendClaimed", () => {
  it("returns true when the call returns a non-zero value", async () => {
    installProvider({ routes: { eth_call: { kind: "value", value: "0x" + "0".repeat(63) + "1" } } });
    await expect(isDividendClaimed("0xTOK", 1, "0xUSER")).resolves.toBe(true);
  });

  it("returns false when the call returns 0", async () => {
    installProvider({ routes: { eth_call: { kind: "value", value: "0x" + "0".repeat(64) } } });
    await expect(isDividendClaimed("0xTOK", 1, "0xUSER")).resolves.toBe(false);
  });

  it("encodes selector 0xbf5fc2ee + roundId + padded user address", async () => {
    const p = installProvider({
      routes: { eth_call: { kind: "value", value: "0x" + "0".repeat(64) } },
    });
    await isDividendClaimed("0xTOK", 2, "0xabcdef0000000000000000000000000000000001");
    const [txArg] = p.__calls[0].params as [{ data: string }];
    expect(txArg.data).toBe(
      "0xbf5fc2ee" +
        "0".repeat(63) +
        "2" +
        "0".repeat(24) +
        "abcdef0000000000000000000000000000000001",
    );
  });
});

// ─── Event listeners ────────────────────────────────────────────────────────

describe("onAccountsChanged", () => {
  it("returns a no-op unsubscribe (never throws) when no window is present", () => {
    installNoWindow();
    const unsub = onAccountsChanged(() => {});
    expect(typeof unsub).toBe("function");
    expect(() => unsub()).not.toThrow();
  });

  it("returns a no-op unsubscribe when window exists but has no ethereum", () => {
    installWindowWithoutEthereum();
    const unsub = onAccountsChanged(() => {});
    expect(() => unsub()).not.toThrow();
  });

  it("subscribes to 'accountsChanged' and passes the first arg through to the handler", () => {
    const p = installProvider();
    const spy = vi.fn();
    onAccountsChanged(spy);
    expect(p.__listeners["accountsChanged"]).toHaveLength(1);
    p.__listeners["accountsChanged"][0]!(["0xNEW"], "extra-arg-ignored");
    expect(spy).toHaveBeenCalledWith(["0xNEW"]);
  });

  it("returned unsubscribe removes the same wrapped handler that was registered", () => {
    const p = installProvider();
    const unsub = onAccountsChanged(() => {});
    const registered = p.__listeners["accountsChanged"][0];
    unsub();
    expect(p.__removed).toHaveLength(1);
    expect(p.__removed[0]).toEqual({ event: "accountsChanged", handler: registered });
  });
});

describe("onChainChanged", () => {
  it("returns a no-op unsubscribe when no window is present", () => {
    installNoWindow();
    const unsub = onChainChanged(() => {});
    expect(() => unsub()).not.toThrow();
  });

  it("subscribes to 'chainChanged' and passes the first arg through as a string", () => {
    const p = installProvider();
    const spy = vi.fn();
    onChainChanged(spy);
    p.__listeners["chainChanged"][0]!("0x1A4");
    expect(spy).toHaveBeenCalledWith("0x1A4");
  });
});

// ─── Pure formatting helpers ────────────────────────────────────────────────

describe("formatTokenAmount", () => {
  it("returns '0' for 0n regardless of decimals", () => {
    expect(formatTokenAmount(0n, 18)).toBe("0");
    expect(formatTokenAmount(0n, 6)).toBe("0");
  });

  it("returns a plain integer string for whole units at 18 decimals", () => {
    expect(formatTokenAmount(1_000_000_000_000_000_000n, 18)).toBe("1");
    expect(formatTokenAmount(1_234_000_000_000_000_000_000n, 18)).toBe("1,234");
  });

  it("keeps fractional part and trims trailing zeros", () => {
    // 1.5 at 18 decimals = 1500…
    expect(formatTokenAmount(1_500_000_000_000_000_000n, 18)).toBe("1.5");
    expect(formatTokenAmount(1_050_000_000_000_000_000n, 18)).toBe("1.05");
  });

  it("handles small fractional amounts under 1 unit", () => {
    // 0.000000001 at 18 decimals
    expect(formatTokenAmount(1_000_000_000n, 18)).toBe("0.000000001");
  });

  it("works with 6-decimal USDC-style tokens", () => {
    expect(formatTokenAmount(1_500_000n, 6)).toBe("1.5");
    expect(formatTokenAmount(1_000_000n, 6)).toBe("1");
  });
});

describe("parseTokenAmount", () => {
  it("parses an integer string with 18 decimals into the scaled bigint", () => {
    expect(parseTokenAmount("1", 18)).toBe(1_000_000_000_000_000_000n);
    expect(parseTokenAmount("1000", 18)).toBe(1_000_000_000_000_000_000_000n);
  });

  it("parses a decimal string and pads the fractional part to `decimals`", () => {
    expect(parseTokenAmount("1.5", 18)).toBe(1_500_000_000_000_000_000n);
    expect(parseTokenAmount("0.000001", 6)).toBe(1n);
  });

  it("truncates fractional digits beyond `decimals` (does NOT round)", () => {
    // "0.1234567890123456789" at 18 → keeps first 18 fractional digits
    expect(parseTokenAmount("0.1234567890123456789", 18)).toBe(123_456_789_012_345_678n);
  });

  it("treats an empty whole part ('.5') as zero-whole", () => {
    // parts[0] is "" for ".5", which is coerced to 0n via `|| "0"`
    expect(parseTokenAmount(".5", 18)).toBe(500_000_000_000_000_000n);
  });

  it("round-trips with formatTokenAmount for common values", () => {
    for (const s of ["1", "1.5", "0.05", "1000", "0.000001"]) {
      const raw = parseTokenAmount(s, 18);
      const back = formatTokenAmount(raw, 18);
      // formatTokenAmount inserts thousands separators — strip for the parse
      const stripped = back.replace(/,/g, "");
      expect(parseTokenAmount(stripped, 18)).toBe(raw);
    }
  });
});

describe("shortenAddress", () => {
  it("shortens a full 42-char ethereum address to first-6 + '...' + last-4", () => {
    expect(shortenAddress("0x1234567890abcdef1234567890abcdef12345678")).toBe("0x1234...5678");
  });

  it("returns the input unchanged when < 10 chars (nothing meaningful to shorten)", () => {
    expect(shortenAddress("0x123")).toBe("0x123");
    expect(shortenAddress("")).toBe("");
  });

  it("returns falsy input unchanged (defensive against null/undefined callers)", () => {
    // TypeScript prevents null at compile time, but the runtime guard uses !addr.
    // Cast is deliberate — this pins the runtime behaviour, not the type contract.
    expect(shortenAddress(null as unknown as string)).toBe(null);
    expect(shortenAddress(undefined as unknown as string)).toBe(undefined);
  });
});
