"use client";

import * as React from "react";
import {
  AlertCircle,
  ArrowRightLeft,
  Check,
  Clock,
  Copy,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BLOCKID_CHAIN,
  CONTRACTS,
  connectWallet,
  getConnectedAccount,
  getTokenBalance,
  getTokenDecimals,
  getTokenSymbol,
  getTokenName,
  getTokenTotalSupply,
  transferTokens,
  addTokenToMetaMask,
  getVestingGrant,
  getVestedAmount,
  onAccountsChanged,
  onChainChanged,
  formatTokenAmount,
  parseTokenAmount,
  shortenAddress,
  type VestingInfo,
} from "@/lib/wallet";
import { useStartupToken } from "@/components/wallet/use-startup-token";

// ── Types ─────────────────────────────────────────────────────────────

interface TokenPortfolio {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  balance: bigint;
  totalSupply: bigint;
}

// ── WalletClient ──────────────────────────────────────────────────────

export function WalletClient() {
  // This startup's own equity token (falls back to the legacy shared token).
  const { token: startupToken } = useStartupToken();
  const tokenAddress = startupToken?.address ?? CONTRACTS.svt;

  const [account, setAccount] = React.useState<string | null>(null);
  const [chainOk, setChainOk] = React.useState(false);
  const [connecting, setConnecting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [tokens, setTokens] = React.useState<TokenPortfolio[]>([]);
  const [loadingTokens, setLoadingTokens] = React.useState(false);
  const [vesting, setVesting] = React.useState<VestingInfo | null>(null);
  const [vestedAmt, setVestedAmt] = React.useState<bigint>(0n);

  // Transfer form
  const [transferOpen, setTransferOpen] = React.useState(false);
  const [transferTo, setTransferTo] = React.useState("");
  const [transferAmount, setTransferAmount] = React.useState("");
  const [transferToken, setTransferToken] = React.useState<string>(CONTRACTS.svt);
  const [transferring, setTransferring] = React.useState(false);
  const [transferTx, setTransferTx] = React.useState<string | null>(null);
  const [transferError, setTransferError] = React.useState<string | null>(null);

  const [copied, setCopied] = React.useState(false);

  // ── On mount, check if already connected ────────────────────────────

  React.useEffect(() => {
    getConnectedAccount().then((addr) => {
      if (addr) {
        setAccount(addr);
        checkChain();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Listen for account/chain changes ────────────────────────────────

  React.useEffect(() => {
    if (typeof window === "undefined" || !window.ethereum) return;

    const unsubAccounts = onAccountsChanged((accounts) => {
      setAccount(accounts[0] ?? null);
      if (!accounts[0]) {
        setTokens([]);
        setVesting(null);
      }
    });

    const unsubChain = onChainChanged((chainId) => {
      setChainOk(chainId.toLowerCase() === BLOCKID_CHAIN.chainId.toLowerCase());
    });

    return () => {
      unsubAccounts();
      unsubChain();
    };
  }, []);

  // ── Reload tokens when account changes ──────────────────────────────

  React.useEffect(() => {
    if (account && chainOk) {
      loadTokens(account);
      loadVesting(account);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, chainOk, tokenAddress]);

  // ── Actions ─────────────────────────────────────────────────────────

  async function checkChain() {
    try {
      if (!window.ethereum) return;
      const chainId = (await window.ethereum.request({
        method: "eth_chainId",
      })) as string;
      setChainOk(
        chainId.toLowerCase() === BLOCKID_CHAIN.chainId.toLowerCase(),
      );
    } catch {
      setChainOk(false);
    }
  }

  async function handleConnect() {
    setConnecting(true);
    setError(null);
    try {
      const addr = await connectWallet();
      setAccount(addr);
      setChainOk(true);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to connect wallet";
      setError(msg);
    } finally {
      setConnecting(false);
    }
  }

  async function loadTokens(addr: string) {
    setLoadingTokens(true);
    try {
      // Load this startup's token info
      const tokenAddr = tokenAddress;
      setTransferToken(tokenAddr);
      const [name, symbol, decimals, balance, totalSupply] = await Promise.all([
        getTokenName(tokenAddr),
        getTokenSymbol(tokenAddr),
        getTokenDecimals(tokenAddr),
        getTokenBalance(tokenAddr, addr),
        getTokenTotalSupply(tokenAddr),
      ]);
      setTokens([
        {
          address: tokenAddr,
          name: name || "SVT Token",
          symbol: symbol || "SVT",
          decimals,
          balance,
          totalSupply,
        },
      ]);
    } catch {
      // Chain might be offline
      setTokens([]);
    } finally {
      setLoadingTokens(false);
    }
  }

  async function loadVesting(addr: string) {
    try {
      const [grant, vested] = await Promise.all([
        getVestingGrant(tokenAddress, addr),
        getVestedAmount(tokenAddress, addr),
      ]);
      if (grant.totalAmount > 0n) {
        setVesting(grant);
        setVestedAmt(vested);
      } else {
        setVesting(null);
        setVestedAmt(0n);
      }
    } catch {
      setVesting(null);
    }
  }

  async function handleTransfer(e: React.FormEvent) {
    e.preventDefault();
    setTransferring(true);
    setTransferError(null);
    setTransferTx(null);

    try {
      const token = tokens.find((t) => t.address === transferToken);
      if (!token) throw new Error("Token not found");

      const rawAmount = parseTokenAmount(transferAmount, token.decimals);
      if (rawAmount <= 0n) throw new Error("Amount must be greater than 0");
      if (rawAmount > token.balance) throw new Error("Insufficient balance");

      const txHash = await transferTokens(transferToken, transferTo, rawAmount);
      setTransferTx(txHash);
      setTransferAmount("");
      setTransferTo("");

      // Refresh balances
      if (account) {
        setTimeout(() => loadTokens(account), 2000);
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Transfer failed";
      setTransferError(msg);
    } finally {
      setTransferring(false);
    }
  }

  async function handleAddToMetaMask(token: TokenPortfolio) {
    try {
      await addTokenToMetaMask(token.address, token.symbol, token.decimals);
    } catch {
      // User rejected or error
    }
  }

  function copyAddress() {
    if (!account) return;
    navigator.clipboard.writeText(account);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── No MetaMask ─────────────────────────────────────────────────────

  const hasMetaMask =
    typeof window !== "undefined" && !!window.ethereum;

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink-800">Wallet</h1>
          <p className="text-sm text-ink-500 mt-0.5">
            Connect MetaMask to manage your BlockID equity tokens.
          </p>
        </div>
        {account && chainOk && (
          <button
            type="button"
            onClick={() => {
              if (account) {
                loadTokens(account);
                loadVesting(account);
              }
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-surface-200 bg-white px-4 text-sm font-medium text-ink-600 hover:bg-surface-50 transition-colors cursor-pointer"
          >
            <RefreshCw strokeWidth={1.75} className="h-3.5 w-3.5" />
            Refresh
          </button>
        )}
      </div>

      {/* Connection Card */}
      <div className="rounded-2xl border border-surface-200 bg-white p-6">
        {!hasMetaMask ? (
          <div className="text-center py-8">
            <Wallet
              strokeWidth={1.25}
              className="mx-auto h-12 w-12 text-ink-300 mb-4"
            />
            <h2 className="text-lg font-bold text-ink-800 mb-2">
              MetaMask Required
            </h2>
            <p className="text-sm text-ink-500 mb-4 max-w-md mx-auto">
              Install MetaMask browser extension to connect your wallet to the
              BlockID private chain and manage equity tokens.
            </p>
            <a
              href="https://metamask.io/download/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-600 px-6 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
            >
              Install MetaMask
              <ExternalLink strokeWidth={1.75} className="h-4 w-4" />
            </a>
          </div>
        ) : !account ? (
          <div className="text-center py-8">
            <Wallet
              strokeWidth={1.25}
              className="mx-auto h-12 w-12 text-brand-400 mb-4"
            />
            <h2 className="text-lg font-bold text-ink-800 mb-2">
              Connect Your Wallet
            </h2>
            <p className="text-sm text-ink-500 mb-6 max-w-md mx-auto">
              Connect MetaMask to the BlockID private chain (Chain ID 420) to
              view and transfer your equity tokens.
            </p>
            <button
              type="button"
              onClick={handleConnect}
              disabled={connecting}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-600 px-6 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {connecting ? (
                <Loader2
                  strokeWidth={1.75}
                  className="h-4 w-4 animate-spin"
                />
              ) : (
                <Wallet strokeWidth={1.75} className="h-4 w-4" />
              )}
              {connecting ? "Connecting..." : "Connect MetaMask"}
            </button>
            {error && (
              <p className="mt-4 text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-4 py-2 max-w-md mx-auto">
                {error}
              </p>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-full bg-brand-100 flex items-center justify-center">
                <Wallet strokeWidth={1.75} className="h-5 w-5 text-brand-600" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-ink-800 font-medium">
                    {shortenAddress(account)}
                  </span>
                  <button
                    type="button"
                    onClick={copyAddress}
                    className="h-6 w-6 flex items-center justify-center rounded text-ink-400 hover:text-ink-600 transition-colors cursor-pointer"
                    title="Copy address"
                  >
                    {copied ? (
                      <Check strokeWidth={2} className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <Copy strokeWidth={1.75} className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 text-xs font-medium",
                      chainOk ? "text-emerald-600" : "text-amber-600",
                    )}
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        chainOk ? "bg-emerald-500" : "bg-amber-500",
                      )}
                    />
                    {chainOk
                      ? "BlockID Chain (420)"
                      : "Wrong chain — switch to BlockID"}
                  </span>
                </div>
              </div>
            </div>
            {!chainOk && (
              <button
                type="button"
                onClick={handleConnect}
                className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-amber-50 border border-amber-200 px-4 text-sm font-medium text-amber-700 hover:bg-amber-100 transition-colors cursor-pointer"
              >
                Switch Chain
              </button>
            )}
          </div>
        )}
      </div>

      {/* Token Portfolio */}
      {account && chainOk && (
        <div className="rounded-2xl border border-surface-200 bg-white overflow-hidden">
          <div className="px-6 py-4 border-b border-surface-200 flex items-center justify-between">
            <h2 className="text-base font-bold text-ink-800">
              Token Portfolio
            </h2>
            {loadingTokens && (
              <Loader2
                strokeWidth={1.75}
                className="h-4 w-4 text-ink-400 animate-spin"
              />
            )}
          </div>

          {tokens.length === 0 && !loadingTokens ? (
            <div className="px-6 py-12 text-center">
              <AlertCircle
                strokeWidth={1.25}
                className="mx-auto h-10 w-10 text-ink-300 mb-3"
              />
              <p className="text-sm text-ink-500">
                No tokens found. The chain may be offline or you have no token
                balances.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-surface-100">
              {tokens.map((token) => (
                <div
                  key={token.address}
                  className="px-6 py-4 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-brand-50 border border-brand-100 flex items-center justify-center">
                      <span className="text-xs font-bold text-brand-600">
                        {token.symbol.slice(0, 3)}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-ink-800">
                        {token.name}
                      </p>
                      <p className="text-xs text-ink-500 font-mono">
                        {shortenAddress(token.address)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex items-center gap-3">
                    <div>
                      <p className="text-lg font-bold text-ink-800 tabular-nums">
                        {formatTokenAmount(token.balance, token.decimals)}
                      </p>
                      <p className="text-xs text-ink-500">
                        {token.symbol} shares
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddToMetaMask(token)}
                      className="h-8 w-8 flex items-center justify-center rounded-lg text-ink-400 hover:text-brand-600 hover:bg-brand-50 transition-colors cursor-pointer"
                      title="Add to MetaMask"
                    >
                      <Plus strokeWidth={1.75} className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Total supply footer */}
          {tokens.length > 0 && (
            <div className="px-6 py-3 bg-surface-50 border-t border-surface-200 flex items-center justify-between">
              <span className="text-xs text-ink-500">Total Supply</span>
              <span className="text-xs font-mono text-ink-600">
                {tokens.map((t) => `${formatTokenAmount(t.totalSupply, t.decimals)} ${t.symbol}`).join(" | ")}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Vesting View */}
      {account && chainOk && vesting && (
        <div className="rounded-2xl border border-surface-200 bg-white overflow-hidden">
          <div className="px-6 py-4 border-b border-surface-200">
            <h2 className="text-base font-bold text-ink-800 flex items-center gap-2">
              <Clock strokeWidth={1.75} className="h-4 w-4 text-ink-500" />
              Vesting Schedule
            </h2>
          </div>
          <div className="px-6 py-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
              <div>
                <p className="text-xs text-ink-500 mb-1">Total Grant</p>
                <p className="text-lg font-bold text-ink-800 tabular-nums">
                  {formatTokenAmount(vesting.totalAmount, 18)}
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-500 mb-1">Vested</p>
                <p className="text-lg font-bold text-emerald-600 tabular-nums">
                  {formatTokenAmount(vestedAmt, 18)}
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-500 mb-1">Claimed</p>
                <p className="text-lg font-bold text-brand-600 tabular-nums">
                  {formatTokenAmount(vesting.claimedAmount, 18)}
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-500 mb-1">Status</p>
                <p
                  className={cn(
                    "text-sm font-semibold",
                    vesting.revoked ? "text-rose-600" : "text-emerald-600",
                  )}
                >
                  {vesting.revoked ? "Revoked" : "Active"}
                </p>
              </div>
            </div>

            {/* Vesting progress bar */}
            {!vesting.revoked && vesting.vestingDuration > 0n && (
              <div>
                <div className="relative h-3 bg-surface-100 rounded-full overflow-hidden">
                  {/* Cliff marker */}
                  {vesting.cliffDuration > 0n && (
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-ink-300 z-10"
                      style={{
                        left: `${Number((vesting.cliffDuration * 100n) / vesting.vestingDuration)}%`,
                      }}
                    />
                  )}
                  {/* Progress */}
                  <div
                    className="absolute left-0 top-0 bottom-0 rounded-full bg-brand-500 transition-all duration-500"
                    style={{
                      width: `${vesting.totalAmount > 0n ? Number((vestedAmt * 100n) / vesting.totalAmount) : 0}%`,
                    }}
                  />
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[11px] text-ink-500">
                    Cliff:{" "}
                    {Number(vesting.cliffDuration / 86400n / 30n)} months
                  </span>
                  <span className="text-[11px] text-ink-500">
                    Total:{" "}
                    {Number(vesting.vestingDuration / 86400n / 30n)} months
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Transfer Form */}
      {account && chainOk && (
        <div className="rounded-2xl border border-surface-200 bg-white overflow-hidden">
          <button
            type="button"
            onClick={() => setTransferOpen((v) => !v)}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-surface-50 transition-colors cursor-pointer"
          >
            <h2 className="text-base font-bold text-ink-800 flex items-center gap-2">
              <Send strokeWidth={1.75} className="h-4 w-4 text-ink-500" />
              Transfer Tokens
            </h2>
            <ArrowRightLeft
              strokeWidth={1.75}
              className={cn(
                "h-4 w-4 text-ink-400 transition-transform",
                transferOpen && "rotate-90",
              )}
            />
          </button>

          {transferOpen && (
            <form onSubmit={handleTransfer} className="px-6 pb-6 space-y-4">
              {/* Token selector */}
              {tokens.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-ink-700 mb-1.5">
                    Token
                  </label>
                  <select
                    value={transferToken}
                    onChange={(e) => setTransferToken(e.target.value)}
                    className="w-full h-10 rounded-xl border border-surface-200 px-3 text-sm text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition-colors cursor-pointer"
                  >
                    {tokens.map((t) => (
                      <option key={t.address} value={t.address}>
                        {t.symbol} — Balance:{" "}
                        {formatTokenAmount(t.balance, t.decimals)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Recipient */}
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1.5">
                  Recipient Address
                </label>
                <input
                  type="text"
                  required
                  value={transferTo}
                  onChange={(e) => setTransferTo(e.target.value)}
                  placeholder="0x..."
                  className="w-full h-10 rounded-xl border border-surface-200 px-3 text-sm font-mono text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition-colors"
                />
              </div>

              {/* Amount */}
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1.5">
                  Amount
                </label>
                <input
                  type="text"
                  required
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  placeholder="e.g. 1000"
                  className="w-full h-10 rounded-xl border border-surface-200 px-3 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition-colors"
                />
              </div>

              {/* Transfer error */}
              {transferError && (
                <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                  {transferError}
                </p>
              )}

              {/* Transfer success */}
              {transferTx && (
                <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                  <p className="font-medium">Transfer submitted</p>
                  <p className="font-mono text-xs mt-1 break-all">
                    Tx: {transferTx}
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={transferring || !transferTo || !transferAmount}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-600 px-6 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                {transferring ? (
                  <Loader2
                    strokeWidth={1.75}
                    className="h-4 w-4 animate-spin"
                  />
                ) : (
                  <Send strokeWidth={1.75} className="h-4 w-4" />
                )}
                {transferring ? "Sending..." : "Send Tokens"}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
