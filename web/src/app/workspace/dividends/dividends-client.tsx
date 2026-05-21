"use client";

import * as React from "react";
import {
  AlertCircle,
  Banknote,
  Check,
  DollarSign,
  Loader2,
  RefreshCw,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CONTRACTS,
  connectWallet,
  getConnectedAccount,
  getTokenBalance,
  getTokenTotalSupply,
  declareDividend,
  claimDividend,
  getDividendRoundCount,
  getDividendRound,
  isDividendClaimed,
  parseTokenAmount,
  formatTokenAmount,
  shortenAddress,
  type DividendRound,
} from "@/lib/wallet";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOKEN_DECIMALS = 18;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RoundInfo {
  id: number;
  round: DividendRound;
  claimed: boolean;
  userPayout: bigint;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function DividendsClient() {
  const [account, setAccount] = React.useState<string | null>(null);
  const [connecting, setConnecting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  // Token info
  const [userBalance, setUserBalance] = React.useState<bigint>(0n);
  const [totalSupply, setTotalSupply] = React.useState<bigint>(0n);

  // Declare form
  const [netIncome, setNetIncome] = React.useState("");
  const [distributionPct, setDistributionPct] = React.useState(50);
  const [declaring, setDeclaring] = React.useState(false);

  // Dividend rounds
  const [rounds, setRounds] = React.useState<RoundInfo[]>([]);
  const [loadingRounds, setLoadingRounds] = React.useState(false);
  const [claiming, setClaiming] = React.useState<number | null>(null);

  // ── Wallet ─────────────────────────────────────────────────────────

  React.useEffect(() => {
    getConnectedAccount().then((addr) => {
      if (addr) setAccount(addr);
    });
  }, []);

  async function handleConnect() {
    setConnecting(true);
    setError(null);
    try {
      const addr = await connectWallet();
      setAccount(addr);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to connect");
    } finally {
      setConnecting(false);
    }
  }

  // ── Load token balances and dividend rounds ────────────────────────

  const loadData = React.useCallback(async () => {
    if (!account) return;

    try {
      const [balance, supply] = await Promise.all([
        getTokenBalance(CONTRACTS.svt, account),
        getTokenTotalSupply(CONTRACTS.svt),
      ]);
      setUserBalance(balance);
      setTotalSupply(supply);
    } catch {
      // Chain may be offline
    }

    setLoadingRounds(true);
    try {
      const count = await getDividendRoundCount(CONTRACTS.svt);
      const loaded: RoundInfo[] = [];

      for (let i = 0; i < count; i++) {
        const [round, claimed] = await Promise.all([
          getDividendRound(CONTRACTS.svt, i),
          isDividendClaimed(CONTRACTS.svt, i, account),
        ]);

        // Calculate user payout: (userBalance / snapshotSupply) * totalAmount
        const userPayout =
          round.snapshotSupply > 0n
            ? (userBalance * round.totalAmount) / round.snapshotSupply
            : 0n;

        loaded.push({ id: i, round, claimed, userPayout });
      }

      setRounds(loaded);
    } catch {
      setRounds([]);
    } finally {
      setLoadingRounds(false);
    }
  }, [account, userBalance]);

  React.useEffect(() => {
    if (account) loadData();
  }, [account, loadData]);

  // ── Declare dividend ───────────────────────────────────────────────

  async function handleDeclare(e: React.FormEvent) {
    e.preventDefault();
    setDeclaring(true);
    setError(null);
    setSuccess(null);

    try {
      const income = parseFloat(netIncome);
      if (isNaN(income) || income <= 0) {
        setError("Net income must be greater than 0");
        setDeclaring(false);
        return;
      }

      const distributionAmount = income * (distributionPct / 100);
      // Convert AUD amount to token units (using 18 decimals)
      const rawAmount = parseTokenAmount(
        distributionAmount.toFixed(0),
        TOKEN_DECIMALS,
      );

      if (!account) {
        const addr = await connectWallet();
        setAccount(addr);
      }

      await declareDividend(CONTRACTS.svt, rawAmount);

      setSuccess(
        `Dividend of $${distributionAmount.toLocaleString()} AUD declared on-chain.`,
      );
      setNetIncome("");
      setDistributionPct(50);

      // Reload rounds after a short delay for tx confirmation
      setTimeout(() => loadData(), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Declaration failed");
    } finally {
      setDeclaring(false);
    }
  }

  // ── Claim dividend ─────────────────────────────────────────────────

  async function handleClaim(roundId: number) {
    setClaiming(roundId);
    setError(null);
    setSuccess(null);

    try {
      if (!account) {
        const addr = await connectWallet();
        setAccount(addr);
      }

      await claimDividend(CONTRACTS.svt, BigInt(roundId));
      setSuccess(`Dividend from round ${roundId + 1} claimed successfully.`);

      // Reload data
      setTimeout(() => loadData(), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Claim failed");
    } finally {
      setClaiming(null);
    }
  }

  // ── Derived values ─────────────────────────────────────────────────

  const incomeNum = parseFloat(netIncome) || 0;
  const distributionAmount = incomeNum * (distributionPct / 100);
  const perShare =
    totalSupply > 0n
      ? (distributionAmount * 1e18) / Number(totalSupply)
      : 0;

  const unclaimedRounds = rounds.filter((r) => !r.claimed && r.userPayout > 0n);
  const hasMetaMask = typeof window !== "undefined" && !!window.ethereum;

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink-800">Dividends</h1>
          <p className="text-sm text-ink-500 mt-0.5">
            Declare and claim dividend distributions via the blockchain.
          </p>
        </div>
        {account && (
          <button
            type="button"
            onClick={loadData}
            className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-surface-200 bg-white px-4 text-sm font-medium text-ink-600 hover:bg-surface-50 transition-colors cursor-pointer"
          >
            <RefreshCw strokeWidth={1.75} className="h-3.5 w-3.5" />
            Refresh
          </button>
        )}
      </div>

      {/* Feedback */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">
          <AlertCircle strokeWidth={1.75} className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
          <Check strokeWidth={1.75} className="h-4 w-4 shrink-0" />
          {success}
        </div>
      )}

      {/* Connect wallet prompt */}
      {!account && (
        <div className="rounded-2xl border border-surface-200 bg-white p-6 text-center">
          <Wallet
            strokeWidth={1.25}
            className="mx-auto h-12 w-12 text-brand-400 mb-4"
          />
          <h2 className="text-lg font-bold text-ink-800 mb-2">
            {hasMetaMask ? "Connect Your Wallet" : "MetaMask Required"}
          </h2>
          <p className="text-sm text-ink-500 mb-6 max-w-md mx-auto">
            {hasMetaMask
              ? "Connect MetaMask to declare and claim dividends on the BlockID chain."
              : "Install MetaMask to interact with dividend distributions."}
          </p>
          {hasMetaMask && (
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
          )}
        </div>
      )}

      {/* Wallet info bar */}
      {account && (
        <div className="rounded-2xl border border-surface-200 bg-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-brand-50 border border-brand-100 flex items-center justify-center">
              <Wallet strokeWidth={1.75} className="h-4 w-4 text-brand-600" />
            </div>
            <div>
              <span className="font-mono text-sm text-ink-800 font-medium">
                {shortenAddress(account)}
              </span>
              <p className="text-xs text-ink-500 mt-0.5">
                Balance: {formatTokenAmount(userBalance, TOKEN_DECIMALS)} SVT
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-ink-500">Total Supply</p>
            <p className="text-sm font-medium text-ink-700 tabular-nums">
              {formatTokenAmount(totalSupply, TOKEN_DECIMALS)} SVT
            </p>
          </div>
        </div>
      )}

      {/* ── Section 1: Declare Dividend ──────────────────────────────── */}
      {account && (
        <div className="rounded-2xl border border-surface-200 bg-white overflow-hidden">
          <div className="px-6 py-4 border-b border-surface-200">
            <h2 className="text-base font-bold text-ink-800 flex items-center gap-2">
              <DollarSign strokeWidth={1.75} className="h-4 w-4 text-ink-500" />
              Declare Dividend
            </h2>
          </div>

          <form onSubmit={handleDeclare} className="p-6 space-y-5">
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1.5">
                Net Income (AUD)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-400">
                  $
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={netIncome}
                  onChange={(e) => setNetIncome(e.target.value)}
                  placeholder="e.g. 100000"
                  className="w-full h-10 rounded-xl border border-surface-200 pl-7 pr-3 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1.5">
                Distribution Percentage: {distributionPct}%
              </label>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={distributionPct}
                onChange={(e) =>
                  setDistributionPct(parseInt(e.target.value))
                }
                className="w-full h-2 bg-surface-200 rounded-full appearance-none cursor-pointer accent-brand-600"
              />
              <div className="flex justify-between mt-1 text-xs text-ink-400">
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
            </div>

            {/* Preview */}
            {incomeNum > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 rounded-xl bg-surface-50 border border-surface-200 p-4">
                <div>
                  <p className="text-xs text-ink-500 mb-1">
                    Distribution Amount
                  </p>
                  <p className="text-lg font-bold text-ink-800">
                    ${distributionAmount.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-ink-500 mb-1">Per Share (est.)</p>
                  <p className="text-lg font-bold text-brand-600">
                    ${perShare > 0 ? perShare.toFixed(6) : "0"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-ink-500 mb-1">Your Payout (est.)</p>
                  <p className="text-lg font-bold text-emerald-600">
                    $
                    {totalSupply > 0n
                      ? (
                          (Number(userBalance) / Number(totalSupply)) *
                          distributionAmount
                        ).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })
                      : "0"}
                  </p>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={declaring || !netIncome || incomeNum <= 0}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-600 px-6 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              {declaring ? (
                <Loader2
                  strokeWidth={1.75}
                  className="h-4 w-4 animate-spin"
                />
              ) : (
                <DollarSign strokeWidth={1.75} className="h-4 w-4" />
              )}
              {declaring ? "Declaring..." : "Declare Dividend"}
            </button>
          </form>
        </div>
      )}

      {/* ── Section 2: Dividend History ──────────────────────────────── */}
      {account && (
        <div className="rounded-2xl border border-surface-200 bg-white overflow-hidden">
          <div className="px-6 py-4 border-b border-surface-200 flex items-center justify-between">
            <h2 className="text-base font-bold text-ink-800 flex items-center gap-2">
              <Banknote strokeWidth={1.75} className="h-4 w-4 text-ink-500" />
              Dividend History
            </h2>
            {loadingRounds && (
              <Loader2
                strokeWidth={1.75}
                className="h-4 w-4 text-ink-400 animate-spin"
              />
            )}
          </div>

          {rounds.length === 0 && !loadingRounds ? (
            <div className="px-6 py-12 text-center">
              <Banknote
                strokeWidth={1.25}
                className="mx-auto h-10 w-10 text-ink-300 mb-3"
              />
              <p className="text-sm text-ink-500">
                No dividend rounds have been declared yet.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-100 bg-surface-50">
                    <th className="text-left px-6 py-3 text-xs font-medium text-ink-500 uppercase tracking-wider">
                      Round
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-ink-500 uppercase tracking-wider">
                      Total Amount
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-ink-500 uppercase tracking-wider">
                      Per Share
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-ink-500 uppercase tracking-wider">
                      Your Payout
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-ink-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-ink-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rounds.map((r) => {
                    const date =
                      r.round.declaredAt > 0n
                        ? new Date(
                            Number(r.round.declaredAt) * 1000,
                          ).toLocaleDateString("en-AU", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })
                        : "--";

                    return (
                      <tr
                        key={r.id}
                        className="border-b border-surface-100 last:border-b-0 hover:bg-surface-50/50 transition-colors"
                      >
                        <td className="px-6 py-3.5 font-medium text-ink-800">
                          #{r.id + 1}
                        </td>
                        <td className="px-4 py-3.5 text-right tabular-nums font-medium text-ink-800">
                          {formatTokenAmount(
                            r.round.totalAmount,
                            TOKEN_DECIMALS,
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right tabular-nums text-ink-600">
                          {formatTokenAmount(
                            r.round.perShareAmount,
                            TOKEN_DECIMALS,
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right tabular-nums font-medium text-brand-600">
                          {formatTokenAmount(r.userPayout, TOKEN_DECIMALS)}
                        </td>
                        <td className="px-4 py-3.5 text-ink-600">{date}</td>
                        <td className="px-4 py-3.5 text-center">
                          <span
                            className={cn(
                              "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium",
                              r.claimed
                                ? "bg-emerald-100 text-emerald-700"
                                : r.userPayout > 0n
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-surface-100 text-ink-500",
                            )}
                          >
                            {r.claimed
                              ? "Claimed"
                              : r.userPayout > 0n
                                ? "Unclaimed"
                                : "N/A"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Section 3: Claim Unclaimed Dividends ─────────────────────── */}
      {account && unclaimedRounds.length > 0 && (
        <div className="rounded-2xl border border-surface-200 bg-white overflow-hidden">
          <div className="px-6 py-4 border-b border-surface-200">
            <h2 className="text-base font-bold text-ink-800 flex items-center gap-2">
              <DollarSign strokeWidth={1.75} className="h-4 w-4 text-emerald-600" />
              Unclaimed Dividends
            </h2>
          </div>

          <div className="divide-y divide-surface-100">
            {unclaimedRounds.map((r) => {
              const date =
                r.round.declaredAt > 0n
                  ? new Date(
                      Number(r.round.declaredAt) * 1000,
                    ).toLocaleDateString("en-AU", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })
                  : "--";

              return (
                <div
                  key={r.id}
                  className="px-6 py-4 flex items-center justify-between"
                >
                  <div>
                    <p className="text-sm font-medium text-ink-800">
                      Round #{r.id + 1}
                    </p>
                    <p className="text-xs text-ink-500 mt-0.5">{date}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm font-bold text-emerald-600 tabular-nums">
                        {formatTokenAmount(r.userPayout, TOKEN_DECIMALS)} SVT
                      </p>
                      <p className="text-xs text-ink-500">Your payout</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleClaim(r.id)}
                      disabled={claiming === r.id}
                      className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    >
                      {claiming === r.id ? (
                        <Loader2
                          strokeWidth={1.75}
                          className="h-4 w-4 animate-spin"
                        />
                      ) : (
                        <DollarSign strokeWidth={1.75} className="h-4 w-4" />
                      )}
                      {claiming === r.id ? "Claiming..." : "Claim"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Section 4: AU Franking Credits Info ─────────────────────────── */}
      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
        <h3 className="text-sm font-bold text-blue-800 mb-2">
          Franking Credits (Australian Tax)
        </h3>
        <p className="text-xs text-blue-700 leading-relaxed">
          Dividends distributed by Australian companies carry franking credits
          representing the corporate tax already paid on the distributed profit.
          At a 25% base rate entity tax, each $1 of dividend carries a $0.333
          franking credit. Shareholders can offset these credits against their
          personal income tax liability. If excess franking credits remain,
          individuals may receive a refund from the ATO.
        </p>
        <div className="mt-3">
          <a
            href="/workspace/revenue"
            className="text-xs font-medium text-blue-700 hover:text-blue-900 transition-colors"
          >
            View Revenue Dashboard &amp; P&L &rarr;
          </a>
        </div>
      </div>
    </div>
  );
}
