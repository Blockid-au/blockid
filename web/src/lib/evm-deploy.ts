// Server-side EVM deploy helper for per-startup equity tokens.
//
// TokenFactory.createCompany() is onlyOwner, so a founder's own MetaMask
// cannot deploy. Instead the server signs the deploy with the factory owner
// key (BLOCKID_DEPLOYER_KEY) and passes the founder's wallet as `_admin` —
// the constructor mints 100% of the initial supply to that founder wallet and
// grants it ADMIN_ROLE. Gas is 0 on the private chain.
//
// Uses Foundry `cast` via a subprocess (foundry is installed on the host).

import * as path from "path";

const RPC_URL = process.env.EVM_RPC_URL || "http://127.0.0.1:8545";
const FACTORY = process.env.TOKEN_FACTORY_ADDRESS || "0x5FbDB2315678afecb367f032d93F642f64180aa3";
// Default = Anvil account[0] (factory owner) — private testnet only.
const DEPLOYER_KEY =
  process.env.BLOCKID_DEPLOYER_KEY ||
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const CAST_BIN =
  process.env.CAST_BIN || path.join(process.env.HOME || "/home/dovanlong", ".foundry/bin/cast");

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const ZERO = "0x0000000000000000000000000000000000000000";

function runCast(args: string[], timeoutMs = 60_000): Promise<string> {
  const cp = eval("require")("child_process") as typeof import("child_process");
  const { spawn } = cp;

  return new Promise((resolve, reject) => {
    const child = spawn(CAST_BIN, args, { env: process.env });
    let stdout = "";
    let stderr = "";
    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("close", (code: number) => {
      clearTimeout(timer);
      if (killed) reject(new Error(`cast timed out after ${Math.round(timeoutMs / 1000)}s`));
      else if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || `cast exited ${code}`));
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

export interface DeployTokenParams {
  tokenName: string;     // e.g. "Acme Shares"
  tokenSymbol: string;   // 3-4 char ticker, e.g. "ACME"
  totalSupply: number;   // number of shares (constructor scales by 10**decimals)
  companyName: string;   // legal/startup name
  companyId: string;     // BlockID internal id (account/project id)
  jurisdiction: string;  // e.g. "AU"
  adminAddress: string;  // founder wallet — receives 100% + ADMIN_ROLE
}

export interface DeployTokenResult {
  tokenAddress: string;
  txHash: string;
}

/**
 * Deploy a new per-startup SVToken via TokenFactory.createCompany, signed by
 * the factory owner key. Returns the deployed token address.
 */
export async function deployCompanyToken(params: DeployTokenParams): Promise<DeployTokenResult> {
  const { tokenName, tokenSymbol, totalSupply, companyName, companyId, jurisdiction, adminAddress } =
    params;

  if (!ADDRESS_RE.test(adminAddress)) {
    throw new Error("Invalid founder wallet address");
  }
  if (!/^[A-Z]{3,4}$/.test(tokenSymbol)) {
    throw new Error("Ticker must be 3-4 uppercase letters");
  }
  const supply = Math.floor(totalSupply);
  if (!Number.isFinite(supply) || supply <= 0) {
    throw new Error("Invalid total supply");
  }

  // Guard: symbol already deployed on-chain?
  const existing = await runCast([
    "call", FACTORY, "getTokenAddress(string)(address)", tokenSymbol, "--rpc-url", RPC_URL,
  ]).catch(() => ZERO);
  if (existing && existing.toLowerCase() !== ZERO) {
    throw new Error(`Ticker "${tokenSymbol}" already exists on-chain`);
  }

  // Send the deploy tx (legacy + zero gas on the private chain).
  const sendOut = await runCast([
    "send", FACTORY,
    "createCompany(string,string,uint256,string,string,string,address)",
    tokenName,
    tokenSymbol,
    String(supply),
    companyName,
    companyId,
    jurisdiction,
    adminAddress,
    "--private-key", DEPLOYER_KEY,
    "--rpc-url", RPC_URL,
    "--legacy",
    "--gas-price", "0",
    "--json",
  ]);

  let txHash = "";
  try {
    const receipt = JSON.parse(sendOut);
    txHash = receipt.transactionHash || receipt.hash || "";
  } catch {
    const m = sendOut.match(/0x[0-9a-fA-F]{64}/);
    txHash = m ? m[0] : "";
  }

  // Resolve the freshly deployed token address from the factory registry.
  const tokenAddress = (
    await runCast([
      "call", FACTORY, "getTokenAddress(string)(address)", tokenSymbol, "--rpc-url", RPC_URL,
    ])
  ).trim();

  if (!ADDRESS_RE.test(tokenAddress) || tokenAddress.toLowerCase() === ZERO) {
    throw new Error("Deploy succeeded but token address could not be resolved");
  }

  return { tokenAddress, txHash };
}
