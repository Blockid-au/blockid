"use client";

import * as React from "react";
import {
  AlertCircle,
  ArrowDownCircle,
  ArrowUpCircle,
  Coins,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  Wallet,
  X,
} from "lucide-react";
import { AdminLayout } from "@/components/admin/admin-layout";
import { cn } from "@/lib/utils";
import {
  CONTRACTS,
  connectWallet,
  getConnectedAccount,
  getTokenBalance,
  getTokenDecimals,
  getTokenSymbol,
  getTokenName,
  getTokenTotalSupply,
  getCompanyCount,
  getCompany,
  mintTokens,
  burnTokens,
  formatTokenAmount,
  parseTokenAmount,
  shortenAddress,
  onAccountsChanged,
  BLOCKID_CHAIN,
} from "@/lib/wallet";

// ── Types ─────────────────────────────────────────────────────────────

interface CompanyRow {
  index: number;
  tokenAddress: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: bigint;
  adminBalance: bigint;
}

interface AdminTokensClientProps {
  user: { email: string; displayName?: string | null };
}

// ── AdminTokensClient ─────────────────────────────────────────────────

export function AdminTokensClient({ user }: AdminTokensClientProps) {
  const [account, setAccount] = React.useState<string | null>(null);
  const [connecting, setConnecting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [companies, setCompanies] = React.useState<CompanyRow[]>([]);
  const [loadingCompanies, setLoadingCompanies] = React.useState(false);

  // Mint/Burn modal
  const [modalMode, setModalMode] = React.useState<"mint" | "burn" | null>(null);
  const [modalToken, setModalToken] = React.useState<CompanyRow | null>(null);
  const [modalTo, setModalTo] = React.useState("");
  const [modalAmount, setModalAmount] = React.useState("");
  const [modalLoading, setModalLoading] = React.useState(false);
  const [modalError, setModalError] = React.useState<string | null>(null);
  const [modalTx, setModalTx] = React.useState<string | null>(null);

  // Create token form
  const [createOpen, setCreateOpen] = React.useState(false);

  // ── On mount ────────────────────────────────────────────────────────

  React.useEffect(() => {
    getConnectedAccount().then((addr) => {
      if (addr) {
        setAccount(addr);
        loadCompanies(addr);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined" || !window.ethereum) return;
    const unsub = onAccountsChanged((accounts) => {
      const addr = accounts[0] ?? null;
      setAccount(addr);
      if (addr) loadCompanies(addr);
      else setCompanies([]);
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Actions ─────────────────────────────────────────────────────────

  async function handleConnect() {
    setConnecting(true);
    setError(null);
    try {
      const addr = await connectWallet();
      setAccount(addr);
      await loadCompanies(addr);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to connect";
      setError(msg);
    } finally {
      setConnecting(false);
    }
  }

  async function loadCompanies(adminAddr: string) {
    setLoadingCompanies(true);
    try {
      const count = await getCompanyCount();
      const rows: CompanyRow[] = [];

      for (let i = 0; i < count; i++) {
        const basic = await getCompany(i);
        const addr = basic.tokenAddress;

        const [name, symbol, decimals, totalSupply, adminBalance] =
          await Promise.all([
            getTokenName(addr),
            getTokenSymbol(addr),
            getTokenDecimals(addr),
            getTokenTotalSupply(addr),
            getTokenBalance(addr, adminAddr),
          ]);

        rows.push({
          index: i,
          tokenAddress: addr,
          name: name || `Token #${i}`,
          symbol: symbol || "???",
          decimals,
          totalSupply,
          adminBalance,
        });
      }

      // Also add the known SVT if not in the factory list
      const svtAddr = CONTRACTS.svt.toLowerCase();
      if (!rows.find((r) => r.tokenAddress.toLowerCase() === svtAddr)) {
        try {
          const [name, symbol, decimals, totalSupply, adminBalance] =
            await Promise.all([
              getTokenName(CONTRACTS.svt),
              getTokenSymbol(CONTRACTS.svt),
              getTokenDecimals(CONTRACTS.svt),
              getTokenTotalSupply(CONTRACTS.svt),
              getTokenBalance(CONTRACTS.svt, adminAddr),
            ]);
          rows.unshift({
            index: -1,
            tokenAddress: CONTRACTS.svt,
            name: name || "SVT Token",
            symbol: symbol || "SVT",
            decimals,
            totalSupply,
            adminBalance,
          });
        } catch {
          // SVT might not be accessible
        }
      }

      setCompanies(rows);
    } catch {
      setCompanies([]);
    } finally {
      setLoadingCompanies(false);
    }
  }

  function openMintModal(token: CompanyRow) {
    setModalMode("mint");
    setModalToken(token);
    setModalTo("");
    setModalAmount("");
    setModalError(null);
    setModalTx(null);
  }

  function openBurnModal(token: CompanyRow) {
    setModalMode("burn");
    setModalToken(token);
    setModalAmount("");
    setModalError(null);
    setModalTx(null);
  }

  function closeModal() {
    setModalMode(null);
    setModalToken(null);
    setModalError(null);
    setModalTx(null);
  }

  async function handleMintBurn(e: React.FormEvent) {
    e.preventDefault();
    if (!modalToken || !modalMode) return;

    setModalLoading(true);
    setModalError(null);
    setModalTx(null);

    try {
      const rawAmount = parseTokenAmount(modalAmount, modalToken.decimals);
      if (rawAmount <= 0n) throw new Error("Amount must be greater than 0");

      let txHash: string;
      if (modalMode === "mint") {
        if (!modalTo) throw new Error("Recipient address required");
        txHash = await mintTokens(modalToken.tokenAddress, modalTo, rawAmount);
      } else {
        if (rawAmount > modalToken.adminBalance) {
          throw new Error("Insufficient balance to burn");
        }
        txHash = await burnTokens(modalToken.tokenAddress, rawAmount);
      }

      setModalTx(txHash);
      setModalAmount("");
      setModalTo("");

      // Refresh after a delay
      if (account) {
        setTimeout(() => loadCompanies(account), 2000);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      setModalError(msg);
    } finally {
      setModalLoading(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────

  const hasMetaMask = typeof window !== "undefined" && !!window.ethereum;

  return (
    <AdminLayout user={user}>
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-ink-800">
              Token Management
            </h1>
            <p className="text-sm text-ink-700 mt-1">
              Manage company equity tokens on the BlockID private chain.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {account && (
              <button
                type="button"
                onClick={() => account && loadCompanies(account)}
                className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-surface-200 bg-white px-4 text-sm font-medium text-ink-600 hover:bg-surface-50 transition-colors cursor-pointer"
              >
                <RefreshCw strokeWidth={1.75} className="h-3.5 w-3.5" />
                Refresh
              </button>
            )}
            {account && (
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 transition-colors cursor-pointer"
              >
                <Plus strokeWidth={1.75} className="h-4 w-4" />
                Create Token
              </button>
            )}
          </div>
        </div>

        {/* Connection */}
        {!hasMetaMask ? (
          <div className="rounded-2xl border border-surface-200 bg-white p-8 text-center">
            <Wallet
              strokeWidth={1.25}
              className="mx-auto h-12 w-12 text-ink-300 mb-4"
            />
            <h2 className="text-lg font-bold text-ink-800 mb-2">
              MetaMask Required
            </h2>
            <p className="text-sm text-ink-500 mb-4">
              Install MetaMask to manage tokens.
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
          <div className="rounded-2xl border border-surface-200 bg-white p-8 text-center">
            <Wallet
              strokeWidth={1.25}
              className="mx-auto h-12 w-12 text-brand-400 mb-4"
            />
            <h2 className="text-lg font-bold text-ink-800 mb-2">
              Connect Admin Wallet
            </h2>
            <p className="text-sm text-ink-500 mb-6">
              Connect the admin wallet (TokenFactory owner) to manage company
              tokens.
            </p>
            <button
              type="button"
              onClick={handleConnect}
              disabled={connecting}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-600 px-6 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {connecting ? (
                <Loader2 strokeWidth={1.75} className="h-4 w-4 animate-spin" />
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
          <>
            {/* Admin wallet info */}
            <div className="rounded-2xl border border-surface-200 bg-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-brand-100 flex items-center justify-center">
                  <Wallet
                    strokeWidth={1.75}
                    className="h-4 w-4 text-brand-600"
                  />
                </div>
                <div>
                  <p className="text-sm font-medium text-ink-800">
                    Admin Wallet
                  </p>
                  <p className="text-xs font-mono text-ink-500">
                    {shortenAddress(account)}
                  </p>
                </div>
              </div>
              <span className="text-xs text-ink-500 font-mono">
                Chain: {BLOCKID_CHAIN.chainName}
              </span>
            </div>

            {/* Company Tokens Table */}
            <div className="rounded-2xl border border-surface-200 bg-white overflow-hidden">
              <div className="px-6 py-4 border-b border-surface-200 flex items-center justify-between">
                <h2 className="text-base font-bold text-ink-800">
                  Company Tokens
                </h2>
                {loadingCompanies ? (
                  <Loader2
                    strokeWidth={1.75}
                    className="h-4 w-4 text-ink-400 animate-spin"
                  />
                ) : (
                  <span className="text-xs text-ink-500">
                    {companies.length} token
                    {companies.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>

              {companies.length === 0 && !loadingCompanies ? (
                <div className="px-6 py-12 text-center">
                  <Coins
                    strokeWidth={1.25}
                    className="mx-auto h-10 w-10 text-ink-300 mb-3"
                  />
                  <p className="text-sm text-ink-500">
                    No company tokens found. The chain may be offline or no
                    tokens have been created yet.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-surface-100 bg-surface-50">
                        <th className="text-left px-6 py-3 text-xs font-medium text-ink-500 uppercase tracking-wider">
                          Token
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-ink-500 uppercase tracking-wider">
                          Contract
                        </th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-ink-500 uppercase tracking-wider">
                          Total Supply
                        </th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-ink-500 uppercase tracking-wider">
                          Admin Balance
                        </th>
                        <th className="text-right px-6 py-3 text-xs font-medium text-ink-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {companies.map((c) => (
                        <tr
                          key={c.tokenAddress}
                          className="border-b border-surface-100 last:border-b-0 hover:bg-surface-50/50 transition-colors"
                        >
                          <td className="px-6 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-full bg-brand-50 border border-brand-100 flex items-center justify-center">
                                <span className="text-[10px] font-bold text-brand-600">
                                  {c.symbol.slice(0, 3)}
                                </span>
                              </div>
                              <div>
                                <p className="font-medium text-ink-800">
                                  {c.name}
                                </p>
                                <p className="text-xs text-ink-500">
                                  {c.symbol}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="font-mono text-xs text-ink-500">
                              {shortenAddress(c.tokenAddress)}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-right font-mono text-ink-800 tabular-nums">
                            {formatTokenAmount(c.totalSupply, c.decimals)}
                          </td>
                          <td className="px-4 py-3.5 text-right font-mono text-brand-600 tabular-nums font-medium">
                            {formatTokenAmount(c.adminBalance, c.decimals)}
                          </td>
                          <td className="px-6 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => openMintModal(c)}
                                className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors cursor-pointer"
                                title="Mint new shares"
                              >
                                <ArrowUpCircle
                                  strokeWidth={1.75}
                                  className="h-3 w-3"
                                />
                                Mint
                              </button>
                              <button
                                type="button"
                                onClick={() => openBurnModal(c)}
                                className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 transition-colors cursor-pointer"
                                title="Burn shares"
                              >
                                <ArrowDownCircle
                                  strokeWidth={1.75}
                                  className="h-3 w-3"
                                />
                                Burn
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* Create Token Info Card */}
        {createOpen && account && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center">
            <div
              className="fixed inset-0 bg-black/30 backdrop-blur-sm"
              onClick={() => setCreateOpen(false)}
            />
            <div className="relative bg-white rounded-2xl border border-surface-200 shadow-xl w-full max-w-lg mx-4">
              <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200">
                <h2 className="text-lg font-bold text-ink-800">
                  Create Company Token
                </h2>
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="h-8 w-8 flex items-center justify-center rounded-lg text-ink-500 hover:text-ink-800 hover:bg-surface-100 transition-colors cursor-pointer"
                >
                  <X strokeWidth={1.75} className="h-4 w-4" />
                </button>
              </div>
              <div className="p-6">
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 mb-4">
                  <div className="flex items-start gap-2">
                    <AlertCircle
                      strokeWidth={1.75}
                      className="h-4 w-4 text-amber-600 mt-0.5 shrink-0"
                    />
                    <div className="text-sm text-amber-800">
                      <p className="font-medium mb-1">
                        TokenFactory Admin Only
                      </p>
                      <p className="text-xs text-amber-700">
                        Creating a new company token calls{" "}
                        <code className="font-mono bg-amber-100 px-1 rounded">
                          TokenFactory.createCompany()
                        </code>{" "}
                        which deploys a new SVToken contract on-chain. This
                        requires the connected wallet to be the TokenFactory
                        owner.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 text-sm text-ink-600">
                  <p>
                    <span className="font-medium text-ink-800">
                      TokenFactory:
                    </span>{" "}
                    <span className="font-mono text-xs">
                      {shortenAddress(CONTRACTS.tokenFactory)}
                    </span>
                  </p>
                  <p>
                    <span className="font-medium text-ink-800">
                      Connected as:
                    </span>{" "}
                    <span className="font-mono text-xs">
                      {shortenAddress(account)}
                    </span>
                  </p>
                  <p className="text-xs text-ink-500">
                    Use the BlockID CLI or Foundry cast to call{" "}
                    <code className="font-mono bg-surface-100 px-1 rounded">
                      createCompany()
                    </code>{" "}
                    directly. Web form for this is coming soon.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="mt-6 w-full h-10 rounded-xl border border-surface-200 text-sm font-medium text-ink-600 hover:bg-surface-50 transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Mint / Burn Modal */}
        {modalMode && modalToken && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center">
            <div
              className="fixed inset-0 bg-black/30 backdrop-blur-sm"
              onClick={closeModal}
            />
            <div className="relative bg-white rounded-2xl border border-surface-200 shadow-xl w-full max-w-lg mx-4">
              <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200">
                <h2 className="text-lg font-bold text-ink-800">
                  {modalMode === "mint" ? "Mint Shares" : "Burn Shares"} —{" "}
                  {modalToken.symbol}
                </h2>
                <button
                  type="button"
                  onClick={closeModal}
                  className="h-8 w-8 flex items-center justify-center rounded-lg text-ink-500 hover:text-ink-800 hover:bg-surface-100 transition-colors cursor-pointer"
                >
                  <X strokeWidth={1.75} className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleMintBurn} className="p-6 space-y-5">
                {/* Token info */}
                <div className="rounded-xl bg-surface-50 border border-surface-200 p-4 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-ink-500">Token</span>
                    <span className="font-medium text-ink-800">
                      {modalToken.name} ({modalToken.symbol})
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-ink-500">Total Supply</span>
                    <span className="font-mono text-ink-800">
                      {formatTokenAmount(
                        modalToken.totalSupply,
                        modalToken.decimals,
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-ink-500">Your Balance</span>
                    <span className="font-mono text-brand-600 font-medium">
                      {formatTokenAmount(
                        modalToken.adminBalance,
                        modalToken.decimals,
                      )}
                    </span>
                  </div>
                </div>

                {/* Recipient (mint only) */}
                {modalMode === "mint" && (
                  <div>
                    <label className="block text-sm font-medium text-ink-700 mb-1.5">
                      Recipient Address
                    </label>
                    <input
                      type="text"
                      required
                      value={modalTo}
                      onChange={(e) => setModalTo(e.target.value)}
                      placeholder="0x..."
                      className="w-full h-10 rounded-xl border border-surface-200 px-3 text-sm font-mono text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition-colors"
                    />
                  </div>
                )}

                {/* Amount */}
                <div>
                  <label className="block text-sm font-medium text-ink-700 mb-1.5">
                    Amount (shares)
                  </label>
                  <input
                    type="text"
                    required
                    value={modalAmount}
                    onChange={(e) => setModalAmount(e.target.value)}
                    placeholder="e.g. 10000"
                    className="w-full h-10 rounded-xl border border-surface-200 px-3 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition-colors"
                  />
                </div>

                {/* Error */}
                {modalError && (
                  <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                    {modalError}
                  </p>
                )}

                {/* Success */}
                {modalTx && (
                  <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                    <p className="font-medium">Transaction submitted</p>
                    <p className="font-mono text-xs mt-1 break-all">
                      Tx: {modalTx}
                    </p>
                  </div>
                )}

                {/* Submit */}
                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={modalLoading || !modalAmount}
                    className={cn(
                      "flex-1 h-10 rounded-xl text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center justify-center gap-2",
                      modalMode === "mint"
                        ? "bg-emerald-600 hover:bg-emerald-700"
                        : "bg-rose-600 hover:bg-rose-700",
                    )}
                  >
                    {modalLoading ? (
                      <Loader2
                        strokeWidth={1.75}
                        className="h-4 w-4 animate-spin"
                      />
                    ) : modalMode === "mint" ? (
                      <ArrowUpCircle strokeWidth={1.75} className="h-4 w-4" />
                    ) : (
                      <ArrowDownCircle strokeWidth={1.75} className="h-4 w-4" />
                    )}
                    {modalLoading
                      ? "Processing..."
                      : modalMode === "mint"
                        ? "Mint Shares"
                        : "Burn Shares"}
                  </button>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="h-10 px-5 rounded-xl border border-surface-200 text-sm font-medium text-ink-600 hover:bg-surface-50 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
