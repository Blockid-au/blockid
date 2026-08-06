// Colocated vitest for `evm-deploy.ts` — the server-side helper that runs
// TokenFactory.createCompany() deploys for per-startup equity tokens. The
// module is a thin, security-critical bridge: any regression in its input
// validation lets malformed data reach the on-chain factory, and any
// regression in its output parsing hands a bogus token address back to the
// caller (which then writes it to `wallets` and quotes it in the founder's
// dataroom).
//
// Why this suite exists:
//   * `deployCompanyToken` is the only path founders can trigger that spends
//     the factory-owner key. Every guard here (0x40-hex address, 3-4
//     uppercase ticker, positive integer supply, ZERO-address sentinel) is a
//     defensive layer between the API route and Anvil. A silent regression
//     means we either lose the key's authority to a malformed request or
//     issue a token whose address does not exist.
//   * `runCast` fans out to a `cast` subprocess. The `.catch(() => ZERO)` on
//     the pre-deploy "already exists" check is load-bearing — losing it
//     would turn a transient RPC hiccup into a mass founder-facing "cannot
//     deploy" failure. This suite pins that branch by asserting deploy
//     still proceeds when the check subprocess exits non-zero.
//   * The tx-hash extractor supports THREE wire shapes
//     (`JSON.transactionHash`, `JSON.hash`, plain-text 0x-64 regex) because
//     Foundry's `cast send --json` shape has drifted across versions and
//     the fallback is what kept the server working across upgrades. Losing
//     any branch drops txHash and breaks the receipt on the wallet page.
//
// Strategy:
//   The SUT reads `CAST_BIN` at module load time, so we install a fake
//   cast shell script BEFORE importing. The fake dispatches responses from
//   `process.env.EVM_TEST_RESP_<n>` (1-indexed per-tick counter) and can
//   simulate non-zero exits with an "!ERR:" prefix. Each test resets the
//   counter file and any leftover EVM_TEST_RESP_* env in `beforeEach`.
//   This gives us full-pipeline coverage (spawn → stdout/stderr → module
//   parsing) without touching the real foundry install or an actual RPC.

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// ─── Fake cast install (must happen before SUT import) ────────────────────
//
// The SUT reads CAST_BIN / EVM_RPC_URL / TOKEN_FACTORY_ADDRESS /
// BLOCKID_DEPLOYER_KEY at module-load time. ESM hoists `import` above any
// top-level code, so we run the install inside `vi.hoisted(...)` — that
// callback fires BEFORE the SUT import, which is the only place the env
// snapshot can still be steered.

const { TMP, FAKE_CAST, COUNTER, ARGS_LOG } = vi.hoisted(() => {
  const fsH = require("node:fs") as typeof import("node:fs");
  const osH = require("node:os") as typeof import("node:os");
  const pathH = require("node:path") as typeof import("node:path");

  const tmp = fsH.mkdtempSync(pathH.join(osH.tmpdir(), "evm-deploy-test-"));
  const fakeCast = pathH.join(tmp, "cast");
  const counter = pathH.join(tmp, "count");
  const argsLog = pathH.join(tmp, "args.log");

  const script = `#!/bin/sh
n=$(cat "${counter}" 2>/dev/null || echo 0)
n=$((n+1))
echo $n > "${counter}"
printf '%s\\t%s\\n' "$n" "$*" >> "${argsLog}"
key="EVM_TEST_RESP_$n"
val=$(printenv "$key" || printf '')
case "$val" in
  !ERR:*)
    printf '%s' "$val" | sed 's/^!ERR://' 1>&2
    exit 1
    ;;
  *)
    printf '%s' "$val"
    exit 0
    ;;
esac
`;
  fsH.writeFileSync(fakeCast, script, { mode: 0o755 });
  // Belt-and-braces: some FSes / umasks strip exec on write.
  fsH.chmodSync(fakeCast, 0o755);
  fsH.writeFileSync(counter, "0");
  fsH.writeFileSync(argsLog, "");

  process.env.CAST_BIN = fakeCast;
  process.env.EVM_RPC_URL = "http://127.0.0.1:9999";
  process.env.TOKEN_FACTORY_ADDRESS =
    "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
  process.env.BLOCKID_DEPLOYER_KEY =
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

  return { TMP: tmp, FAKE_CAST: fakeCast, COUNTER: counter, ARGS_LOG: argsLog };
});

// Silence unused-var lints — TMP + FAKE_CAST are referenced by shell / cleanup.
void TMP;
void FAKE_CAST;

// ─── SUT (import after fake-cast + env are in place via vi.hoisted) ──────

import { deployCompanyToken } from "./evm-deploy";

// ─── Fixtures ────────────────────────────────────────────────────────────

const VALID_ADMIN = "0x1234567890abcdef1234567890abcdef12345678";
const VALID_SYMBOL = "ACME";
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
const DEPLOYED_ADDR = "0x1111222233334444555566667777888899990000";

function baseParams(overrides: Partial<Parameters<typeof deployCompanyToken>[0]> = {}) {
  return {
    tokenName: "Acme Shares",
    tokenSymbol: VALID_SYMBOL,
    totalSupply: 1_000_000,
    companyName: "Acme Pty Ltd",
    companyId: "co_abc123",
    jurisdiction: "AU",
    adminAddress: VALID_ADMIN,
    ...overrides,
  };
}

function resetFakeCast() {
  fs.writeFileSync(COUNTER, "0");
  fs.writeFileSync(ARGS_LOG, "");
  for (const k of Object.keys(process.env)) {
    if (k.startsWith("EVM_TEST_RESP_")) delete process.env[k];
  }
}

function readArgsLogRaw(): string[] {
  return fs.readFileSync(ARGS_LOG, "utf8").split("\n").filter(Boolean);
}

// Prime a full happy-path 3-response fixture so tests that focus on a single
// downstream branch (e.g. address resolution) don't need to repeat the
// existence-check + send scaffolding on every case.
function primeHappyPath(hash = "0x" + "a".repeat(64), addr = DEPLOYED_ADDR): void {
  process.env.EVM_TEST_RESP_1 = ZERO_ADDR;
  process.env.EVM_TEST_RESP_2 = JSON.stringify({ transactionHash: hash });
  process.env.EVM_TEST_RESP_3 = addr;
}

beforeEach(() => resetFakeCast());

afterAll(() => {
  try {
    fs.rmSync(TMP, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

// ─── Validation: adminAddress ─────────────────────────────────────────────

describe("deployCompanyToken — adminAddress validation", () => {
  it("throws on empty admin address", async () => {
    await expect(
      deployCompanyToken(baseParams({ adminAddress: "" })),
    ).rejects.toThrow("Invalid founder wallet address");
  });

  it("throws when the 0x prefix is missing", async () => {
    await expect(
      deployCompanyToken(
        baseParams({ adminAddress: "1234567890abcdef1234567890abcdef12345678" }),
      ),
    ).rejects.toThrow("Invalid founder wallet address");
  });

  it("throws when the hex body is too short", async () => {
    await expect(
      deployCompanyToken(baseParams({ adminAddress: "0x1234" })),
    ).rejects.toThrow("Invalid founder wallet address");
  });

  it("throws when the hex body is too long", async () => {
    await expect(
      deployCompanyToken(
        baseParams({
          adminAddress: "0x1234567890abcdef1234567890abcdef1234567890",
        }),
      ),
    ).rejects.toThrow("Invalid founder wallet address");
  });

  it("throws when the address contains non-hex characters", async () => {
    await expect(
      deployCompanyToken(
        baseParams({ adminAddress: "0xZZZZ567890abcdef1234567890abcdef12345678" }),
      ),
    ).rejects.toThrow("Invalid founder wallet address");
  });

  it("does NOT spawn cast when address validation fails (guard runs before subprocess)", async () => {
    await expect(
      deployCompanyToken(baseParams({ adminAddress: "bad" })),
    ).rejects.toThrow();
    expect(readArgsLogRaw()).toHaveLength(0);
  });

  it("accepts a lowercase hex address", async () => {
    primeHappyPath();
    await expect(
      deployCompanyToken(
        baseParams({ adminAddress: "0xabcdef0123456789abcdef0123456789abcdef01" }),
      ),
    ).resolves.toBeDefined();
  });

  it("accepts a mixed-case hex address", async () => {
    primeHappyPath();
    await expect(
      deployCompanyToken(
        baseParams({ adminAddress: "0xAbCdEf0123456789ABCdef0123456789abcDeF01" }),
      ),
    ).resolves.toBeDefined();
  });
});

// ─── Validation: tokenSymbol ──────────────────────────────────────────────

describe("deployCompanyToken — tokenSymbol validation", () => {
  it.each([
    ["lowercase", "acme"],
    ["mixed case", "Acme"],
    ["digits", "AC1"],
    ["dash", "AC-"],
    ["too short (2 chars)", "AB"],
    ["too long (5 chars)", "ABCDE"],
    ["empty", ""],
    ["single char", "A"],
    ["hyphen only", "---"],
    ["contains space", "AB C"],
  ])("throws for %s ticker", async (_label, symbol) => {
    await expect(
      deployCompanyToken(baseParams({ tokenSymbol: symbol })),
    ).rejects.toThrow("Ticker must be 3-4 uppercase letters");
  });

  it.each([
    ["3 uppercase", "ABC"],
    ["4 uppercase", "WXYZ"],
  ])("accepts %s ticker", async (_label, symbol) => {
    primeHappyPath();
    await expect(
      deployCompanyToken(baseParams({ tokenSymbol: symbol })),
    ).resolves.toBeDefined();
  });

  it("does NOT spawn cast when symbol validation fails", async () => {
    await expect(
      deployCompanyToken(baseParams({ tokenSymbol: "bad" })),
    ).rejects.toThrow();
    expect(readArgsLogRaw()).toHaveLength(0);
  });
});

// ─── Validation: totalSupply ──────────────────────────────────────────────

describe("deployCompanyToken — totalSupply validation", () => {
  it("throws on zero", async () => {
    await expect(
      deployCompanyToken(baseParams({ totalSupply: 0 })),
    ).rejects.toThrow("Invalid total supply");
  });

  it("throws on a negative value", async () => {
    await expect(
      deployCompanyToken(baseParams({ totalSupply: -1 })),
    ).rejects.toThrow("Invalid total supply");
  });

  it("throws on NaN (Math.floor(NaN) → NaN → !Number.isFinite)", async () => {
    await expect(
      deployCompanyToken(baseParams({ totalSupply: Number.NaN })),
    ).rejects.toThrow("Invalid total supply");
  });

  it("throws on +Infinity", async () => {
    await expect(
      deployCompanyToken(baseParams({ totalSupply: Number.POSITIVE_INFINITY })),
    ).rejects.toThrow("Invalid total supply");
  });

  it("throws on -Infinity", async () => {
    await expect(
      deployCompanyToken(baseParams({ totalSupply: Number.NEGATIVE_INFINITY })),
    ).rejects.toThrow("Invalid total supply");
  });

  it("throws when a fractional value floors to zero (0.5 → 0 → rejected)", async () => {
    await expect(
      deployCompanyToken(baseParams({ totalSupply: 0.5 })),
    ).rejects.toThrow("Invalid total supply");
  });

  it("floors a fractional value >= 1 before sending on the wire", async () => {
    primeHappyPath();
    await deployCompanyToken(baseParams({ totalSupply: 1234.9 }));
    // The send line should contain the integer supply, never the raw float.
    // Format: "<n>\tsend <factory> <sig> <name> <symbol> <supply> <company> <id> <juris> <admin> --private-key ..."
    const sendLine = readArgsLogRaw().find((l) => l.includes("\tsend "));
    expect(sendLine).toBeDefined();
    expect(sendLine).toContain(" 1234 ");
    expect(sendLine).not.toContain("1234.9");
  });

  it("does NOT spawn cast when supply validation fails", async () => {
    await expect(
      deployCompanyToken(baseParams({ totalSupply: -5 })),
    ).rejects.toThrow();
    expect(readArgsLogRaw()).toHaveLength(0);
  });
});

// ─── Ticker existence guard ───────────────────────────────────────────────

describe("deployCompanyToken — existence guard", () => {
  it("throws when the factory reports a non-zero address for the ticker", async () => {
    process.env.EVM_TEST_RESP_1 = "0x1111111111111111111111111111111111111111";
    await expect(
      deployCompanyToken(baseParams({ tokenSymbol: "DUP" })),
    ).rejects.toThrow('Ticker "DUP" already exists on-chain');
    // Only the existence check ran — no send, no follow-up call.
    expect(readArgsLogRaw()).toHaveLength(1);
  });

  it("treats a mixed-case non-zero address as taken (comparison is case-insensitive)", async () => {
    // Uppercase hex must still fail the "== ZERO" test.
    process.env.EVM_TEST_RESP_1 = "0xAAAABBBBAAAABBBBAAAABBBBAAAABBBBAAAABBBB";
    await expect(deployCompanyToken(baseParams())).rejects.toThrow(
      /already exists on-chain/,
    );
  });

  it("proceeds when the factory returns the ZERO address (ticker is free)", async () => {
    primeHappyPath();
    const res = await deployCompanyToken(baseParams());
    expect(res.tokenAddress).toBe(DEPLOYED_ADDR);
  });

  it("proceeds even when the existence-check subprocess exits non-zero (load-bearing .catch fallback)", async () => {
    process.env.EVM_TEST_RESP_1 = "!ERR:rpc timeout";
    process.env.EVM_TEST_RESP_2 = JSON.stringify({
      transactionHash: "0x" + "f".repeat(64),
    });
    process.env.EVM_TEST_RESP_3 = DEPLOYED_ADDR;
    const res = await deployCompanyToken(baseParams());
    expect(res.tokenAddress).toBe(DEPLOYED_ADDR);
  });
});

// ─── Send tx / txHash extraction ─────────────────────────────────────────

describe("deployCompanyToken — txHash extraction", () => {
  const HASH = "0x" + "a".repeat(64);

  it("extracts transactionHash from a well-formed JSON receipt", async () => {
    process.env.EVM_TEST_RESP_1 = ZERO_ADDR;
    process.env.EVM_TEST_RESP_2 = JSON.stringify({
      transactionHash: HASH,
      other: "ignored",
    });
    process.env.EVM_TEST_RESP_3 = DEPLOYED_ADDR;
    const res = await deployCompanyToken(baseParams());
    expect(res.txHash).toBe(HASH);
  });

  it("falls back to JSON.hash when transactionHash is absent (older cast output shape)", async () => {
    process.env.EVM_TEST_RESP_1 = ZERO_ADDR;
    process.env.EVM_TEST_RESP_2 = JSON.stringify({ hash: HASH });
    process.env.EVM_TEST_RESP_3 = DEPLOYED_ADDR;
    const res = await deployCompanyToken(baseParams());
    expect(res.txHash).toBe(HASH);
  });

  it("prefers transactionHash over hash when both keys exist", async () => {
    const other = "0x" + "b".repeat(64);
    process.env.EVM_TEST_RESP_1 = ZERO_ADDR;
    process.env.EVM_TEST_RESP_2 = JSON.stringify({
      transactionHash: HASH,
      hash: other,
    });
    process.env.EVM_TEST_RESP_3 = DEPLOYED_ADDR;
    const res = await deployCompanyToken(baseParams());
    expect(res.txHash).toBe(HASH);
  });

  it("returns empty txHash when JSON has neither transactionHash nor hash", async () => {
    process.env.EVM_TEST_RESP_1 = ZERO_ADDR;
    process.env.EVM_TEST_RESP_2 = JSON.stringify({ status: "0x1" });
    process.env.EVM_TEST_RESP_3 = DEPLOYED_ADDR;
    const res = await deployCompanyToken(baseParams());
    expect(res.txHash).toBe("");
  });

  it("extracts a 0x-64 hex from a non-JSON payload via regex fallback", async () => {
    process.env.EVM_TEST_RESP_1 = ZERO_ADDR;
    process.env.EVM_TEST_RESP_2 = `some log line\ntx: ${HASH}\nmore`;
    process.env.EVM_TEST_RESP_3 = DEPLOYED_ADDR;
    const res = await deployCompanyToken(baseParams());
    expect(res.txHash).toBe(HASH);
  });

  it("returns empty txHash when the non-JSON payload has no hash-shaped substring", async () => {
    process.env.EVM_TEST_RESP_1 = ZERO_ADDR;
    process.env.EVM_TEST_RESP_2 = "no hash here";
    process.env.EVM_TEST_RESP_3 = DEPLOYED_ADDR;
    const res = await deployCompanyToken(baseParams());
    expect(res.txHash).toBe("");
  });

  it("prefers the FIRST 0x-64 substring when multiple are present in a non-JSON payload", async () => {
    const first = "0x" + "1".repeat(64);
    const second = "0x" + "2".repeat(64);
    process.env.EVM_TEST_RESP_1 = ZERO_ADDR;
    process.env.EVM_TEST_RESP_2 = `first=${first} second=${second}`;
    process.env.EVM_TEST_RESP_3 = DEPLOYED_ADDR;
    const res = await deployCompanyToken(baseParams());
    expect(res.txHash).toBe(first);
  });
});

// ─── Address resolution ─────────────────────────────────────────────────

describe("deployCompanyToken — deployed-address resolution", () => {
  it("returns the resolved token address on the happy path", async () => {
    primeHappyPath("0x" + "9".repeat(64), "0x1234567890abcdef1234567890abcdef12345678");
    const res = await deployCompanyToken(baseParams());
    expect(res.tokenAddress).toBe(
      "0x1234567890abcdef1234567890abcdef12345678",
    );
  });

  it("trims surrounding whitespace on the resolved address (runCast trims stdout)", async () => {
    process.env.EVM_TEST_RESP_1 = ZERO_ADDR;
    process.env.EVM_TEST_RESP_2 = JSON.stringify({
      transactionHash: "0x" + "7".repeat(64),
    });
    process.env.EVM_TEST_RESP_3 =
      "  0x1234567890abcdef1234567890abcdef12345678  ";
    const res = await deployCompanyToken(baseParams());
    expect(res.tokenAddress).toBe(
      "0x1234567890abcdef1234567890abcdef12345678",
    );
  });

  it("throws when the resolved address is the ZERO sentinel", async () => {
    process.env.EVM_TEST_RESP_1 = ZERO_ADDR;
    process.env.EVM_TEST_RESP_2 = JSON.stringify({
      transactionHash: "0x" + "6".repeat(64),
    });
    process.env.EVM_TEST_RESP_3 = ZERO_ADDR;
    await expect(deployCompanyToken(baseParams())).rejects.toThrow(
      "Deploy succeeded but token address could not be resolved",
    );
  });

  it("throws when the resolved address fails the 0x40-hex regex", async () => {
    process.env.EVM_TEST_RESP_1 = ZERO_ADDR;
    process.env.EVM_TEST_RESP_2 = JSON.stringify({
      transactionHash: "0x" + "5".repeat(64),
    });
    process.env.EVM_TEST_RESP_3 = "not-an-address";
    await expect(deployCompanyToken(baseParams())).rejects.toThrow(
      "Deploy succeeded but token address could not be resolved",
    );
  });

  it("throws when the resolved address is empty", async () => {
    process.env.EVM_TEST_RESP_1 = ZERO_ADDR;
    process.env.EVM_TEST_RESP_2 = JSON.stringify({
      transactionHash: "0x" + "4".repeat(64),
    });
    process.env.EVM_TEST_RESP_3 = "";
    await expect(deployCompanyToken(baseParams())).rejects.toThrow(
      "Deploy succeeded but token address could not be resolved",
    );
  });
});

// ─── Subprocess error propagation ────────────────────────────────────────

describe("deployCompanyToken — subprocess error propagation", () => {
  it("rejects with the stderr message when the send tx exits non-zero (no fallback on send)", async () => {
    process.env.EVM_TEST_RESP_1 = ZERO_ADDR;
    process.env.EVM_TEST_RESP_2 = "!ERR:nonce too low";
    await expect(deployCompanyToken(baseParams())).rejects.toThrow(
      /nonce too low/,
    );
  });

  it("rejects when the post-deploy address lookup exits non-zero (no fallback on the second call)", async () => {
    process.env.EVM_TEST_RESP_1 = ZERO_ADDR;
    process.env.EVM_TEST_RESP_2 = JSON.stringify({
      transactionHash: "0x" + "3".repeat(64),
    });
    process.env.EVM_TEST_RESP_3 = "!ERR:registry read failed";
    await expect(deployCompanyToken(baseParams())).rejects.toThrow(
      /registry read failed/,
    );
  });
});

// ─── Wire contract with `cast` ──────────────────────────────────────────

describe("deployCompanyToken — cast argument wire contract", () => {
  it("passes the ticker as the sole arg to the existence-check call", async () => {
    primeHappyPath("0x" + "2".repeat(64), DEPLOYED_ADDR);
    await deployCompanyToken(baseParams({ tokenSymbol: "WCK" }));
    const raw = readArgsLogRaw();
    // First line: "1\tcall <factory> getTokenAddress(string)(address) WCK --rpc-url <url>"
    expect(raw[0]).toContain("\tcall ");
    expect(raw[0]).toContain(" getTokenAddress(string)(address) ");
    expect(raw[0]).toContain(" WCK ");
    expect(raw[0]).toContain(" --rpc-url ");
  });

  it("passes the createCompany signature + private key + --legacy --gas-price 0 --json on the send", async () => {
    primeHappyPath("0x" + "1".repeat(64), DEPLOYED_ADDR);
    await deployCompanyToken(baseParams());
    const raw = readArgsLogRaw();
    const send = raw.find((l) => l.includes("\tsend "));
    expect(send).toBeDefined();
    expect(send).toContain(
      "createCompany(string,string,uint256,string,string,string,address)",
    );
    expect(send).toContain(" --private-key ");
    expect(send).toContain(" --legacy");
    expect(send).toContain(" --gas-price 0");
    expect(send).toContain(" --json");
  });

  it("forwards all seven createCompany args in declared constructor order", async () => {
    primeHappyPath("0x" + "0".repeat(64), DEPLOYED_ADDR);
    await deployCompanyToken(
      baseParams({
        tokenName: "AcmeShares",
        tokenSymbol: "ACX",
        totalSupply: 555,
        companyName: "AcmePty",
        companyId: "co_777",
        jurisdiction: "AU",
        adminAddress: "0x1111222233334444555566667777888899990000",
      }),
    );
    const send = readArgsLogRaw().find((l) => l.includes("\tsend "))!;
    const afterSig = send.split(
      "createCompany(string,string,uint256,string,string,string,address)",
    )[1];
    const beforeKey = afterSig.split(" --private-key ")[0];
    const positions = [
      "AcmeShares",
      "ACX",
      "555",
      "AcmePty",
      "co_777",
      "AU",
      "0x1111222233334444555566667777888899990000",
    ].map((s) => beforeKey.indexOf(s));
    // All present …
    expect(positions.every((p) => p >= 0)).toBe(true);
    // … and in the declared order.
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1]);
    }
  });

  it("re-queries the same ticker on the post-deploy address lookup (round-trip integrity)", async () => {
    primeHappyPath("0x" + "8".repeat(64), DEPLOYED_ADDR);
    await deployCompanyToken(baseParams({ tokenSymbol: "RTR" }));
    const callLines = readArgsLogRaw().filter((l) => l.includes("\tcall "));
    expect(callLines).toHaveLength(2);
    expect(callLines[0]).toContain(" RTR ");
    expect(callLines[1]).toContain(" RTR ");
    // getTokenAddress signature appears on BOTH — the second isn't a bare
    // registry poll or a different fn.
    expect(callLines[0]).toContain(" getTokenAddress(string)(address) ");
    expect(callLines[1]).toContain(" getTokenAddress(string)(address) ");
  });

  it("uses the configured EVM_RPC_URL on both call and send subprocess invocations", async () => {
    primeHappyPath("0x" + "e".repeat(64), DEPLOYED_ADDR);
    await deployCompanyToken(baseParams());
    const raw = readArgsLogRaw();
    // 3 invocations, each carries --rpc-url http://127.0.0.1:9999 (test env).
    expect(raw).toHaveLength(3);
    for (const line of raw) {
      expect(line).toContain(" --rpc-url http://127.0.0.1:9999");
    }
  });

  it("uses the configured TOKEN_FACTORY_ADDRESS as the target address on every invocation", async () => {
    primeHappyPath("0x" + "d".repeat(64), DEPLOYED_ADDR);
    await deployCompanyToken(baseParams());
    const raw = readArgsLogRaw();
    for (const line of raw) {
      expect(line).toContain(" 0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef ");
    }
  });

  it("uses the configured BLOCKID_DEPLOYER_KEY as the private key on the send call", async () => {
    primeHappyPath("0x" + "c".repeat(64), DEPLOYED_ADDR);
    await deployCompanyToken(baseParams());
    const send = readArgsLogRaw().find((l) => l.includes("\tsend "))!;
    expect(send).toContain(
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    );
  });
});

// ─── Structural sanity ─────────────────────────────────────────────────

describe("deployCompanyToken — structural sanity", () => {
  it("resolves to an object with both tokenAddress and txHash keys on success", async () => {
    const HASH = "0x" + "b".repeat(64);
    primeHappyPath(HASH, DEPLOYED_ADDR);
    const res = await deployCompanyToken(baseParams());
    expect(res).toEqual({ tokenAddress: DEPLOYED_ADDR, txHash: HASH });
  });

  it("issues exactly three subprocess invocations on the happy path (call, send, call)", async () => {
    primeHappyPath();
    await deployCompanyToken(baseParams());
    const raw = readArgsLogRaw();
    expect(raw).toHaveLength(3);
    expect(raw[0]).toContain("\tcall ");
    expect(raw[1]).toContain("\tsend ");
    expect(raw[2]).toContain("\tcall ");
  });
});
