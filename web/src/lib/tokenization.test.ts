import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// tokenization — colocated vitest for the previously-untested cap-table ↔
// token bridge helpers (docs/plans/atlassian-standard-mapping-goal.md
// §P9_ship). This module maps cap-table shares to ushare on the private
// blockid-testnet-1 chain and provides the read-only bridge helpers the
// wallet + explorer surfaces consume. Because it is *private* chain code
// with no external oracle, a silent regression here (wrong share↔ushare
// scaling, dividend rounding drift, MetaMask config drift) would silently
// mis-tokenize equity — the sort of bug the /wallet dashboard can never
// notice on its own. The tests pin:
//   - sharesToTokens / tokensToShares round-trip at 6-decimal precision,
//     with `Math.floor` semantics on the reverse conversion
//   - DEFAULT_CHAIN_CONFIG reflects the private testnet defaults (chainId,
//     denom, prefix) and lets COSMOS_RPC_URL / COSMOS_REST_URL override at
//     load time
//   - generateTokenizationPlan drops zero/negative-share holders, keeps the
//     input order, stamps `reason="share_issue"`, and falls back to
//     `pending-<id>` when a shareholder has no bech32 address
//   - calculateVestingSchedule enforces the cliff (0 shares under cliff),
//     linear allocation via Math.floor at each month, and includes an
//     inclusive final entry at `month === vestingMonths` that vests 100%
//   - calculateTokenDividend rounds per-recipient AUD to 2 decimals and
//     preserves `perShareAmount` at full precision
//   - isChainOnline maps fetch.ok → boolean, swallows thrown errors, and
//     forwards an AbortSignal with a 5s timeout
//   - getTokenBalance parses .balances[] by denom, returns BigInt(0) on
//     non-ok response, missing balance, or thrown fetch
//   - getAllHolders returns [] on non-ok, missing .holders, or thrown
//     fetch; maps string amount → bigint on success
//   - getMetaMaskChainConfig pins chainId "0x1A4" (420), swaps RPC port
//     26657 → 8545 (EVM JSON-RPC), and stamps native SHARE currency with
//     6 decimals
//   - getWalletStatus: chain offline → disconnected/zero; chain online + no
//     address → disconnected; chain online + address → connected with
//     converted share count
// ---------------------------------------------------------------------------

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_RPC = process.env.COSMOS_RPC_URL;
const ORIGINAL_REST = process.env.COSMOS_REST_URL;

async function loadModule() {
  vi.resetModules();
  return await import("./tokenization");
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  if (ORIGINAL_RPC === undefined) delete process.env.COSMOS_RPC_URL;
  else process.env.COSMOS_RPC_URL = ORIGINAL_RPC;
  if (ORIGINAL_REST === undefined) delete process.env.COSMOS_REST_URL;
  else process.env.COSMOS_REST_URL = ORIGINAL_REST;
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// DEFAULT_CHAIN_CONFIG
// ---------------------------------------------------------------------------

describe("DEFAULT_CHAIN_CONFIG", () => {
  it("uses the blockid-testnet-1 private-chain defaults when env is unset", async () => {
    delete process.env.COSMOS_RPC_URL;
    delete process.env.COSMOS_REST_URL;
    const { DEFAULT_CHAIN_CONFIG } = await loadModule();
    expect(DEFAULT_CHAIN_CONFIG.chainId).toBe("blockid-testnet-1");
    expect(DEFAULT_CHAIN_CONFIG.denom).toBe("ushare");
    expect(DEFAULT_CHAIN_CONFIG.prefix).toBe("blockid");
    expect(DEFAULT_CHAIN_CONFIG.rpcUrl).toBe("https://chain.blockid.au");
    expect(DEFAULT_CHAIN_CONFIG.restUrl).toBe("https://chain.blockid.au/rest");
    expect(DEFAULT_CHAIN_CONFIG.chainName).toBe(
      "BlockID.au - Startup Value Chain",
    );
  });

  it("honours COSMOS_RPC_URL and COSMOS_REST_URL overrides at load time", async () => {
    process.env.COSMOS_RPC_URL = "http://127.0.0.1:26657";
    process.env.COSMOS_REST_URL = "http://127.0.0.1:1317";
    const { DEFAULT_CHAIN_CONFIG } = await loadModule();
    expect(DEFAULT_CHAIN_CONFIG.rpcUrl).toBe("http://127.0.0.1:26657");
    expect(DEFAULT_CHAIN_CONFIG.restUrl).toBe("http://127.0.0.1:1317");
  });
});

// ---------------------------------------------------------------------------
// sharesToTokens / tokensToShares
// ---------------------------------------------------------------------------

describe("sharesToTokens", () => {
  it("scales a single share to one million ushare", async () => {
    const { sharesToTokens } = await loadModule();
    expect(sharesToTokens(1)).toBe(BigInt(1_000_000));
  });

  it("returns 0n for a zero-share holder", async () => {
    const { sharesToTokens } = await loadModule();
    expect(sharesToTokens(0)).toBe(BigInt(0));
  });

  it("scales past JS Number precision without loss", async () => {
    const { sharesToTokens } = await loadModule();
    // 10M shares × 1M = 10^13, still safely within Number, but the return
    // is a BigInt so the caller cannot silently lose precision downstream.
    const out = sharesToTokens(10_000_000);
    expect(out).toBe(BigInt("10000000000000"));
    expect(typeof out).toBe("bigint");
  });
});

describe("tokensToShares", () => {
  it("inverts sharesToTokens at exact multiples", async () => {
    const { sharesToTokens, tokensToShares } = await loadModule();
    expect(tokensToShares(sharesToTokens(42))).toBe(42);
  });

  it("floors sub-share fractions of ushare (integer division)", async () => {
    const { tokensToShares } = await loadModule();
    // 1_500_000 ushare = 1.5 shares → floors to 1
    expect(tokensToShares(BigInt(1_500_000))).toBe(1);
    // 999_999 ushare < 1 share → 0
    expect(tokensToShares(BigInt(999_999))).toBe(0);
  });

  it("returns 0 for a zero-balance address", async () => {
    const { tokensToShares } = await loadModule();
    expect(tokensToShares(BigInt(0))).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// generateTokenizationPlan
// ---------------------------------------------------------------------------

describe("generateTokenizationPlan", () => {
  it("produces one share_issue mint per positive-share holder in input order", async () => {
    const { generateTokenizationPlan } = await loadModule();
    const plan = generateTokenizationPlan([
      { id: "sh1", name: "Alice", shares: 100, address: "blockid1alice" },
      { id: "sh2", name: "Bob", shares: 250, address: "blockid1bob" },
    ]);
    expect(plan).toHaveLength(2);
    expect(plan[0]).toEqual({
      to: "blockid1alice",
      amount: BigInt(100_000_000),
      shareholderId: "sh1",
      reason: "share_issue",
    });
    expect(plan[1].shareholderId).toBe("sh2");
    expect(plan[1].amount).toBe(BigInt(250_000_000));
  });

  it("drops zero-share and negative-share holders (never mints zero)", async () => {
    const { generateTokenizationPlan } = await loadModule();
    const plan = generateTokenizationPlan([
      { id: "sh1", name: "Zero", shares: 0, address: "blockid1zero" },
      { id: "sh2", name: "Positive", shares: 10, address: "blockid1pos" },
      { id: "sh3", name: "Negative", shares: -5, address: "blockid1neg" },
    ]);
    expect(plan.map((p) => p.shareholderId)).toEqual(["sh2"]);
  });

  it("falls back to pending-<id> when a holder has no wallet address yet", async () => {
    const { generateTokenizationPlan } = await loadModule();
    const plan = generateTokenizationPlan([
      { id: "sh42", name: "Unwired", shares: 7 },
    ]);
    expect(plan[0].to).toBe("pending-sh42");
    expect(plan[0].amount).toBe(BigInt(7_000_000));
  });

  it("returns [] when the cap table is empty", async () => {
    const { generateTokenizationPlan } = await loadModule();
    expect(generateTokenizationPlan([])).toEqual([]);
  });

  it("returns [] when every holder has zero shares", async () => {
    const { generateTokenizationPlan } = await loadModule();
    expect(
      generateTokenizationPlan([
        { id: "sh1", name: "a", shares: 0 },
        { id: "sh2", name: "b", shares: 0 },
      ]),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// calculateVestingSchedule
// ---------------------------------------------------------------------------

describe("calculateVestingSchedule", () => {
  it("returns vestingMonths+1 rows so both month 0 and the terminal month are represented", async () => {
    const { calculateVestingSchedule } = await loadModule();
    const schedule = calculateVestingSchedule(
      48_000,
      new Date("2026-01-01T00:00:00Z"),
      48,
      12,
    );
    expect(schedule).toHaveLength(49);
    expect(schedule[0].month).toBe(0);
    expect(schedule[48].month).toBe(48);
  });

  it("emits 0 vested shares for every month strictly before the cliff", async () => {
    const { calculateVestingSchedule } = await loadModule();
    const schedule = calculateVestingSchedule(
      48_000,
      new Date("2026-01-01T00:00:00Z"),
      48,
      12,
    );
    for (let m = 0; m < 12; m++) {
      expect(schedule[m].vestedShares).toBe(0);
      expect(schedule[m].vestedPct).toBe(0);
    }
  });

  it("vests the cliff bucket in a single step at month === cliffMonths", async () => {
    const { calculateVestingSchedule } = await loadModule();
    const schedule = calculateVestingSchedule(
      48_000,
      new Date("2026-01-01T00:00:00Z"),
      48,
      12,
    );
    // At month 12, exactly 12/48 = 25% of 48000 = 12000 vests.
    expect(schedule[12].vestedShares).toBe(12_000);
    expect(schedule[12].vestedPct).toBe(25);
  });

  it("vests linearly (Math.floor) between the cliff and terminal month", async () => {
    const { calculateVestingSchedule } = await loadModule();
    const schedule = calculateVestingSchedule(
      48_000,
      new Date("2026-01-01T00:00:00Z"),
      48,
      12,
    );
    // Month 24 = 50%, month 36 = 75%
    expect(schedule[24].vestedShares).toBe(24_000);
    expect(schedule[24].vestedPct).toBe(50);
    expect(schedule[36].vestedShares).toBe(36_000);
    expect(schedule[36].vestedPct).toBe(75);
  });

  it("reaches 100% only at the terminal vestingMonths row", async () => {
    const { calculateVestingSchedule } = await loadModule();
    const schedule = calculateVestingSchedule(
      48_000,
      new Date("2026-01-01T00:00:00Z"),
      48,
      12,
    );
    expect(schedule[47].vestedPct).toBeLessThan(100);
    expect(schedule[48].vestedShares).toBe(48_000);
    expect(schedule[48].vestedPct).toBe(100);
  });

  it("advances the date one calendar month per row and does not mutate startDate", async () => {
    const { calculateVestingSchedule } = await loadModule();
    const start = new Date("2026-01-15T00:00:00Z");
    const schedule = calculateVestingSchedule(1200, start, 12, 3);
    expect(schedule[0].date.getUTCMonth()).toBe(0);
    expect(schedule[6].date.getUTCMonth()).toBe(6);
    expect(schedule[12].date.getUTCFullYear()).toBe(2027);
    // Guard: start not mutated by the internal setMonth loop.
    expect(start.toISOString()).toBe("2026-01-15T00:00:00.000Z");
  });

  it("supports a 0-month cliff — every month vests from month 0", async () => {
    const { calculateVestingSchedule } = await loadModule();
    const schedule = calculateVestingSchedule(
      1200,
      new Date("2026-01-01T00:00:00Z"),
      12,
      0,
    );
    expect(schedule[0].vestedShares).toBe(0);
    expect(schedule[1].vestedShares).toBe(100);
    expect(schedule[12].vestedShares).toBe(1200);
  });
});

// ---------------------------------------------------------------------------
// calculateTokenDividend
// ---------------------------------------------------------------------------

describe("calculateTokenDividend", () => {
  it("splits the pool by per-share amount and rounds each recipient to 2dp AUD", async () => {
    const { calculateTokenDividend } = await loadModule();
    const dist = calculateTokenDividend(
      100,
      [
        { address: "a1", shares: 60 },
        { address: "a2", shares: 40 },
      ],
      100,
    );
    expect(dist.totalAmount).toBe(100);
    expect(dist.perShareAmount).toBe(1);
    expect(dist.recipients).toHaveLength(2);
    expect(dist.recipients[0]).toMatchObject({ address: "a1", shares: 60, amount: 60 });
    expect(dist.recipients[1]).toMatchObject({ address: "a2", shares: 40, amount: 40 });
  });

  it("keeps perShareAmount at full precision even when recipient amounts round", async () => {
    const { calculateTokenDividend } = await loadModule();
    // 100 AUD across 3 shares → 33.333… per share
    const dist = calculateTokenDividend(
      100,
      [{ address: "solo", shares: 1 }],
      3,
    );
    expect(dist.perShareAmount).toBeCloseTo(33.3333333, 6);
    // Recipient amount is rounded to 2dp: 33.33
    expect(dist.recipients[0].amount).toBe(33.33);
  });

  it("returns zero per-share amount and zero per-recipient when the pool is 0 AUD", async () => {
    const { calculateTokenDividend } = await loadModule();
    const dist = calculateTokenDividend(
      0,
      [{ address: "a1", shares: 10 }],
      10,
    );
    expect(dist.perShareAmount).toBe(0);
    expect(dist.recipients[0].amount).toBe(0);
  });

  it("emits an empty recipients array when holders is empty (still records the pool)", async () => {
    const { calculateTokenDividend } = await loadModule();
    const dist = calculateTokenDividend(500, [], 1000);
    expect(dist.recipients).toEqual([]);
    expect(dist.totalAmount).toBe(500);
    expect(dist.perShareAmount).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// isChainOnline
// ---------------------------------------------------------------------------

describe("isChainOnline", () => {
  it("returns true when the tendermint node_info endpoint returns 200", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { isChainOnline } = await loadModule();
    await expect(isChainOnline()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain(
      "/cosmos/base/tendermint/v1beta1/node_info",
    );
    expect((init as { signal?: AbortSignal }).signal).toBeInstanceOf(
      AbortSignal,
    );
  });

  it("returns false on non-ok HTTP response", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false }) as unknown as typeof fetch;
    const { isChainOnline } = await loadModule();
    await expect(isChainOnline()).resolves.toBe(false);
  });

  it("returns false when fetch throws (network down / DNS)", async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error("ECONNREFUSED")) as unknown as typeof fetch;
    const { isChainOnline } = await loadModule();
    await expect(isChainOnline()).resolves.toBe(false);
  });

  it("hits the caller-supplied config, not just DEFAULT_CHAIN_CONFIG", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { isChainOnline } = await loadModule();
    await isChainOnline({
      chainId: "x",
      chainName: "x",
      rpcUrl: "http://x",
      restUrl: "http://override.example",
      denom: "ushare",
      prefix: "blockid",
    });
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "http://override.example/cosmos/base/tendermint/v1beta1/node_info",
    );
  });
});

// ---------------------------------------------------------------------------
// getTokenBalance
// ---------------------------------------------------------------------------

describe("getTokenBalance", () => {
  it("returns the balance of the ushare denom as bigint", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        balances: [
          { denom: "uatom", amount: "999" },
          { denom: "ushare", amount: "12345678" },
        ],
      }),
    }) as unknown as typeof fetch;
    const { getTokenBalance } = await loadModule();
    await expect(getTokenBalance("blockid1abc")).resolves.toBe(
      BigInt(12_345_678),
    );
  });

  it("returns 0n when the address has no ushare entry", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        balances: [{ denom: "uatom", amount: "999" }],
      }),
    }) as unknown as typeof fetch;
    const { getTokenBalance } = await loadModule();
    await expect(getTokenBalance("blockid1abc")).resolves.toBe(BigInt(0));
  });

  it("returns 0n on non-ok HTTP response", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, json: async () => ({}) }) as unknown as typeof fetch;
    const { getTokenBalance } = await loadModule();
    await expect(getTokenBalance("blockid1abc")).resolves.toBe(BigInt(0));
  });

  it("returns 0n when fetch throws", async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error("boom")) as unknown as typeof fetch;
    const { getTokenBalance } = await loadModule();
    await expect(getTokenBalance("blockid1abc")).resolves.toBe(BigInt(0));
  });

  it("returns 0n when the response body has no balances array", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    }) as unknown as typeof fetch;
    const { getTokenBalance } = await loadModule();
    await expect(getTokenBalance("blockid1abc")).resolves.toBe(BigInt(0));
  });

  it("targets the /cosmos/bank/v1beta1/balances/<addr> endpoint on the config's rest url", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ balances: [] }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { getTokenBalance } = await loadModule();
    await getTokenBalance("blockid1abc", {
      chainId: "x",
      chainName: "x",
      rpcUrl: "http://x",
      restUrl: "http://rest.example",
      denom: "ushare",
      prefix: "blockid",
    });
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "http://rest.example/cosmos/bank/v1beta1/balances/blockid1abc",
    );
  });
});

// ---------------------------------------------------------------------------
// getAllHolders
// ---------------------------------------------------------------------------

describe("getAllHolders", () => {
  it("maps string amounts into bigint balances", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        holders: [
          { address: "blockid1a", balance: "1000000" },
          { address: "blockid1b", balance: "2500000" },
        ],
      }),
    }) as unknown as typeof fetch;
    const { getAllHolders } = await loadModule();
    const holders = await getAllHolders();
    expect(holders).toEqual([
      { address: "blockid1a", balance: BigInt(1_000_000) },
      { address: "blockid1b", balance: BigInt(2_500_000) },
    ]);
  });

  it("returns [] on non-ok HTTP response", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, json: async () => ({}) }) as unknown as typeof fetch;
    const { getAllHolders } = await loadModule();
    await expect(getAllHolders()).resolves.toEqual([]);
  });

  it("returns [] when the response has no .holders array", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch;
    const { getAllHolders } = await loadModule();
    await expect(getAllHolders()).resolves.toEqual([]);
  });

  it("returns [] when fetch throws", async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error("boom")) as unknown as typeof fetch;
    const { getAllHolders } = await loadModule();
    await expect(getAllHolders()).resolves.toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getMetaMaskChainConfig
// ---------------------------------------------------------------------------

describe("getMetaMaskChainConfig", () => {
  it("pins chainId 0x1A4 (420) — the private-testnet-only EVM chain id", async () => {
    const { getMetaMaskChainConfig } = await loadModule();
    const cfg = getMetaMaskChainConfig();
    expect(cfg.chainId).toBe("0x1A4");
    expect(parseInt(cfg.chainId, 16)).toBe(420);
  });

  it("suffixes chainName with (Private Testnet) so MetaMask users can tell it apart", async () => {
    const { getMetaMaskChainConfig, DEFAULT_CHAIN_CONFIG } = await loadModule();
    const cfg = getMetaMaskChainConfig();
    expect(cfg.chainName).toBe(`${DEFAULT_CHAIN_CONFIG.chainName} (Private Testnet)`);
  });

  it("swaps the tendermint RPC port 26657 for the EVM JSON-RPC port 8545", async () => {
    const { getMetaMaskChainConfig } = await loadModule();
    const cfg = getMetaMaskChainConfig({
      chainId: "x",
      chainName: "x",
      rpcUrl: "http://127.0.0.1:26657",
      restUrl: "http://127.0.0.1:1317",
      denom: "ushare",
      prefix: "blockid",
    });
    expect(cfg.rpcUrls).toEqual(["http://127.0.0.1:8545"]);
  });

  it("declares SHARE with 6 decimals to match the ushare denom", async () => {
    const { getMetaMaskChainConfig } = await loadModule();
    const cfg = getMetaMaskChainConfig();
    expect(cfg.nativeCurrency).toEqual({
      name: "BlockID Share Token",
      symbol: "SHARE",
      decimals: 6,
    });
  });

  it("points MetaMask at the public explorer URL", async () => {
    const { getMetaMaskChainConfig } = await loadModule();
    const cfg = getMetaMaskChainConfig();
    expect(cfg.blockExplorerUrls).toEqual(["https://explorer.blockid.au"]);
  });
});

// ---------------------------------------------------------------------------
// getWalletStatus
// ---------------------------------------------------------------------------

describe("getWalletStatus", () => {
  it("reports disconnected + zero balance when the chain is offline", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, json: async () => ({}) }) as unknown as typeof fetch;
    const { getWalletStatus } = await loadModule();
    const status = await getWalletStatus("blockid1abc");
    expect(status).toEqual({
      connected: false,
      address: null,
      balance: BigInt(0),
      shares: 0,
      chainOnline: false,
    });
  });

  it("reports disconnected when the chain is online but no address was supplied", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch;
    const { getWalletStatus } = await loadModule();
    const status = await getWalletStatus();
    expect(status.connected).toBe(false);
    expect(status.chainOnline).toBe(true);
    expect(status.address).toBeNull();
    expect(status.shares).toBe(0);
  });

  it("returns connected + share-scaled balance when the chain is online and address is known", async () => {
    // First call = isChainOnline() → ok
    // Second call = getTokenBalance() → balances array
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          balances: [{ denom: "ushare", amount: "5000000" }],
        }),
      });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { getWalletStatus } = await loadModule();
    const status = await getWalletStatus("blockid1abc");
    expect(status).toEqual({
      connected: true,
      address: "blockid1abc",
      balance: BigInt(5_000_000),
      shares: 5,
      chainOnline: true,
    });
  });
});
