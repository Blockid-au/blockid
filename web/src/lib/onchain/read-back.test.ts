// S27-B — pure reconciliation + read-back decoding.
//
//   - in sync: every wallet-backed row equals its balance → in_sync, no rows
//   - drift: delta sign (positive = chain short), sorted by |delta|
//   - unknown on chain: a wallet with tokens the register never named
//   - missing: zero balance vs no wallet at all (both drift, different reason)
//   - zero-share rows never produce drift; shared wallets are summed
//   - readTokenHolders: batch balanceOf over Transfer-log recipients +
//     known wallets, decimals applied; RPC failure → ChainUnreachableError
//   - RPC host is fixed from the environment, never from the caller

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ChainUnreachableError,
  TRANSFER_TOPIC,
  chainRpcUrl,
  decodeBigInt,
  readTokenHolders,
  reconcileCapTable,
  topicToAddress,
  type OffChainHolder,
} from "./read-back";

const A = "0x00000000000000000000000000000000000000a1";
const B = "0x00000000000000000000000000000000000000b2";
const C = "0x00000000000000000000000000000000000000c3";
const TOKEN = "0xa16E02E87b7454126E5E10d957A927A7F5B5d2be";

function reg(over: Partial<OffChainHolder> & { shareholderId: string }): OffChainHolder {
  return { name: `Holder ${over.shareholderId}`, address: null, shares: 0, ...over };
}

describe("reconcileCapTable", () => {
  it("in sync when every wallet-backed row equals its balance", () => {
    const r = reconcileCapTable(
      [reg({ shareholderId: "s1", address: A, shares: 600 }), reg({ shareholderId: "s2", address: B, shares: 400 })],
      [{ holderAddress: A.toUpperCase().replace("0X", "0x"), shares: 600 }, { holderAddress: B, shares: 400 }],
    );
    expect(r.status).toBe("in_sync");
    expect(r.matched).toHaveLength(2);
    expect(r.driftRows).toEqual([]);
    expect(r.unknownOnChain).toEqual([]);
    expect(r.missingOnChain).toEqual([]);
    expect(r.totals).toEqual({ offchainShares: 1000, onchainShares: 1000, delta: 0, registerRows: 2, onchainHolders: 2, driftCount: 0 });
  });

  it("drift rows carry offchain − onchain and sort by |delta|", () => {
    const r = reconcileCapTable(
      [reg({ shareholderId: "s1", address: A, shares: 600 }), reg({ shareholderId: "s2", address: B, shares: 400 })],
      [{ holderAddress: A, shares: 590 }, { holderAddress: B, shares: 450 }],
    );
    expect(r.status).toBe("drift");
    expect(r.driftRows.map((d) => [d.shareholderId, d.offchain, d.onchain, d.delta])).toEqual([
      ["s2", 400, 450, -50],
      ["s1", 600, 590, 10],
    ]);
    expect(r.totals.delta).toBe(-40);
    expect(r.totals.driftCount).toBe(2);
  });

  it("unknown on-chain wallets and missing register rows (zero balance vs no wallet)", () => {
    const r = reconcileCapTable(
      [
        reg({ shareholderId: "s1", address: A, shares: 600 }),
        reg({ shareholderId: "s2", address: B, shares: 100 }),
        reg({ shareholderId: "s3", address: null, shares: 50 }),
      ],
      [{ holderAddress: A, shares: 600 }, { holderAddress: C, shares: 25 }],
    );
    expect(r.status).toBe("drift");
    expect(r.matched.map((m) => m.shareholderId)).toEqual(["s1"]);
    expect(r.unknownOnChain).toEqual([{ address: C, shares: 25 }]);
    expect(r.missingOnChain).toEqual([
      { shareholder: "Holder s2", shareholderId: "s2", address: B, shares: 100, reason: "zero_balance" },
      { shareholder: "Holder s3", shareholderId: "s3", address: null, shares: 50, reason: "no_wallet" },
    ]);
    expect(r.totals).toMatchObject({ offchainShares: 750, onchainShares: 625, delta: 125, onchainHolders: 2, driftCount: 3 });
  });

  it("zero-share rows never drift; two register rows on one wallet are summed; garbage is ignored", () => {
    const r = reconcileCapTable(
      [
        reg({ shareholderId: "s1", address: A, shares: 300 }),
        reg({ shareholderId: "s1b", address: A.toUpperCase().replace("0X", "0x"), shares: 200 }),
        reg({ shareholderId: "s2", address: null, shares: 0 }),
        reg({ shareholderId: "s3", address: B, shares: 0 }),
        reg({ shareholderId: "s4", address: "not-an-address", shares: Number.NaN }),
      ],
      [{ holderAddress: A, shares: 500 }, { holderAddress: B, shares: 0 }, { holderAddress: "bad", shares: 9 }],
    );
    expect(r.status).toBe("in_sync");
    expect(r.matched.map((m) => [m.shareholderId, m.shares])).toEqual([["s1", 500], ["s3", 0]]);
    expect(r.totals.offchainShares).toBe(500);
    expect(r.totals.onchainHolders).toBe(1);
  });

  it("empty inputs are in sync with zero totals (no NaN)", () => {
    const r = reconcileCapTable([], []);
    expect(r.status).toBe("in_sync");
    for (const v of Object.values(r.totals)) expect(Number.isFinite(v)).toBe(true);
  });
});

describe("decoders", () => {
  it("decodeBigInt handles empty / zero / hex; topicToAddress strips the 12-byte pad", () => {
    expect(decodeBigInt("0x")).toBe(0n);
    expect(decodeBigInt(undefined)).toBe(0n);
    expect(decodeBigInt("0x" + "0".repeat(64))).toBe(0n);
    expect(decodeBigInt("0x0a")).toBe(10n);
    expect(decodeBigInt("zz")).toBe(0n);
    expect(topicToAddress("0x" + "0".repeat(24) + A.slice(2))).toBe(A);
    expect(topicToAddress("0x1234")).toBeNull();
    expect(topicToAddress(null)).toBeNull();
  });
});

describe("readTokenHolders", () => {
  const originalEnv = process.env.EVM_RPC_URL;
  beforeEach(() => {
    process.env.EVM_RPC_URL = "http://127.0.0.1:8545";
  });
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.EVM_RPC_URL;
    else process.env.EVM_RPC_URL = originalEnv;
  });

  function hex(n: bigint): string {
    return "0x" + n.toString(16).padStart(64, "0");
  }

  function fakeRpc(balances: Record<string, bigint>, logsTo: string[], decimals = 18n) {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (input: string, init: RequestInit) => {
      urls.push(input);
      const body = JSON.parse(String(init.body)) as Array<{ id: number; method: string; params: unknown[] }>;
      const out = body.map((req) => {
        if (req.method === "eth_blockNumber") return { id: req.id, result: "0x2a" };
        if (req.method === "eth_getLogs") {
          const filter = req.params[0] as { topics: string[] };
          expect(filter.topics[0]).toBe(TRANSFER_TOPIC);
          return { id: req.id, result: logsTo.map((to) => ({ topics: [TRANSFER_TOPIC, "0x" + "0".repeat(64), "0x" + "0".repeat(24) + to.slice(2)] })) };
        }
        const call = req.params[0] as { data: string };
        if (call.data === "0x313ce567") return { id: req.id, result: hex(decimals) };
        if (call.data === "0x18160ddd") return { id: req.id, result: hex(Object.values(balances).reduce((a, b) => a + b, 0n)) };
        const addr = "0x" + call.data.slice(10 + 24);
        return { id: req.id, result: hex(balances[addr] ?? 0n) };
      });
      return new Response(JSON.stringify(out), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    return { fetchImpl, urls };
  }

  it("collects Transfer recipients + known wallets, applies decimals, hits only the env RPC host", async () => {
    const wei = (n: bigint) => n * 10n ** 18n;
    const { fetchImpl, urls } = fakeRpc({ [A]: wei(600n), [B]: wei(400n) }, [A, B]);
    const snap = await readTokenHolders(TOKEN, { knownAddresses: [C], fetchImpl });
    expect(snap.decimals).toBe(18);
    expect(snap.totalSupplyShares).toBe(1000);
    expect(snap.blockNumber).toBe(42);
    expect(snap.holders).toEqual([
      { holderAddress: A, shares: 600 },
      { holderAddress: B, shares: 400 },
      { holderAddress: C, shares: 0 },
    ]);
    expect(new Set(urls)).toEqual(new Set(["http://127.0.0.1:8545"]));
  });

  it("RPC network failure / HTTP error / RPC error → ChainUnreachableError", async () => {
    const down = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    await expect(readTokenHolders(TOKEN, { fetchImpl: down })).rejects.toBeInstanceOf(ChainUnreachableError);
    const http = vi.fn(async () => new Response("bad gateway", { status: 502 }));
    await expect(readTokenHolders(TOKEN, { fetchImpl: http })).rejects.toBeInstanceOf(ChainUnreachableError);
    const rpcErr = vi.fn(async (_i: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as Array<{ id: number }>;
      return new Response(JSON.stringify(body.map((r) => ({ id: r.id, error: { message: "execution reverted" } }))), { status: 200 });
    });
    await expect(readTokenHolders(TOKEN, { fetchImpl: rpcErr })).rejects.toThrow(/execution reverted/);
  });

  it("rejects a non-address token and ignores a malformed EVM_RPC_URL", async () => {
    await expect(readTokenHolders("nope", { fetchImpl: vi.fn() })).rejects.toThrow(/Invalid token address/);
    process.env.EVM_RPC_URL = "javascript:alert(1)";
    expect(chainRpcUrl()).toBe("https://chain.blockid.au/evm");
  });
});
