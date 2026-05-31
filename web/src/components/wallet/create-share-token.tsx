"use client";

// "Create shares on blockchain" — deploys a per-startup equity token.
//
// Each startup gets its OWN token with a NASDAQ-style 3-4 char ticker derived
// from the startup idea. The server deploys via TokenFactory (owner-signed) and
// mints 100% of the shares to the founder's connected wallet. This component
// handles: connect gate → ticker suggest/confirm → deploy → success.

import * as React from "react";
import {
  Coins,
  Loader2,
  CheckCircle2,
  ExternalLink,
  PlusCircle,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import {
  BLOCKID_CHAIN,
  getConnectedAccount,
  onAccountsChanged,
  addTokenToMetaMask,
  shortenAddress,
} from "@/lib/wallet";
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button";
import { cn } from "@/lib/utils";

const EXPLORER_URL = BLOCKID_CHAIN.blockExplorerUrls[0];

interface TickerSuggestion {
  ticker: string;
  rationale: string;
  available: boolean;
}

interface DeployedToken {
  symbol: string;
  address: string;
  name?: string;
  totalSupply?: number;
}

export function CreateShareToken({ className }: { className?: string }) {
  const [account, setAccount] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [startupName, setStartupName] = React.useState("");
  const [suggestions, setSuggestions] = React.useState<TickerSuggestion[]>([]);
  const [existing, setExisting] = React.useState<DeployedToken | null>(null);

  const [ticker, setTicker] = React.useState("");
  const [tokenName, setTokenName] = React.useState("");
  const [supply, setSupply] = React.useState(10_000_000);

  const [deploying, setDeploying] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [deployed, setDeployed] = React.useState<DeployedToken | null>(null);

  // ── Load wallet + suggestions ─────────────────────────────────────────
  React.useEffect(() => {
    getConnectedAccount().then(setAccount);
    const unsub = onAccountsChanged((accts) => setAccount(accts[0] ?? null));
    return unsub;
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/blockchain/create-token");
        const data = await res.json();
        if (cancelled) return;
        if (data.ok) {
          setStartupName(data.startupName ?? "");
          setSuggestions(data.suggestions ?? []);
          if (data.existingToken) {
            setExisting({ symbol: data.existingToken.symbol, address: data.existingToken.address });
          }
          if (data.suggestions?.[0]?.ticker) setTicker(data.suggestions[0].ticker);
          setTokenName(data.defaultTokenName ?? "");
        } else {
          setError(data.error ?? "Could not load token suggestions");
        }
      } catch {
        if (!cancelled) setError("Could not load token suggestions");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleDeploy() {
    setError(null);
    const sym = ticker.toUpperCase().trim();
    if (!/^[A-Z]{3,4}$/.test(sym)) {
      setError("Ticker must be 3–4 letters (NASDAQ style), e.g. ACME");
      return;
    }
    if (!account) {
      setError("Connect your wallet first.");
      return;
    }
    setDeploying(true);
    try {
      const res = await fetch("/api/blockchain/create-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenSymbol: sym,
          tokenName: tokenName.trim() || `${startupName} Shares`,
          totalSupply: supply,
          adminAddress: account,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        // If it already exists, surface the address.
        if (data.tokenAddress) setExisting({ symbol: sym, address: data.tokenAddress });
        throw new Error(data.error ?? "Deploy failed");
      }
      setDeployed({
        symbol: data.token.symbol,
        address: data.token.address,
        name: data.token.name,
        totalSupply: data.token.totalSupply,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deploy failed");
    } finally {
      setDeploying(false);
    }
  }

  async function addToMetaMask(addr: string, sym: string) {
    try {
      await addTokenToMetaMask(addr, sym, 18);
    } catch {
      /* user rejected */
    }
  }

  // ── Render ────────────────────────────────────────────────────────────
  const card = "rounded-2xl border border-surface-200 bg-white dark:bg-surface-100 p-5";

  if (loading) {
    return (
      <div className={cn(card, "flex items-center gap-2 text-sm text-ink-500", className)}>
        <Loader2 className="h-4 w-4 animate-spin" /> Loading tokenization…
      </div>
    );
  }

  // Success state (just deployed) OR already-tokenized.
  const token = deployed ?? existing;
  if (token) {
    const justDeployed = !!deployed;
    return (
      <div className={cn(card, className)}>
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-ink-800">
              {justDeployed ? "Cổ phần đã lên blockchain 🎉" : "Startup đã có token cổ phần"}
            </h3>
            <p className="text-sm text-ink-500 mt-0.5">
              Ticker <span className="font-mono font-semibold text-ink-700">{token.symbol}</span>
              {justDeployed && token.totalSupply
                ? ` — ${token.totalSupply.toLocaleString()} cổ phần đã mint về ví của bạn.`
                : ""}
            </p>
            <div className="mt-2 flex items-center gap-2 text-xs">
              <code className="font-mono text-ink-600 bg-surface-100 rounded px-1.5 py-0.5 break-all">
                {token.address}
              </code>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <a
                href={`${EXPLORER_URL}/address/${token.address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="h-8 px-3 rounded-lg bg-surface-100 hover:bg-surface-200 text-ink-700 text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Xem trên Explorer
              </a>
              <button
                type="button"
                onClick={() => addToMetaMask(token.address, token.symbol)}
                className="h-8 px-3 rounded-lg bg-surface-100 hover:bg-surface-200 text-ink-700 text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
              >
                <PlusCircle className="h-3.5 w-3.5" /> Thêm {token.symbol} vào MetaMask
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(card, className)}>
      <div className="flex items-start gap-3 mb-4">
        <div className="h-10 w-10 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
          <Coins className="h-5 w-5 text-brand-600" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-ink-800">Tạo cổ phần trên blockchain</h3>
          <p className="text-sm text-ink-500 mt-0.5">
            Phát hành token cổ phần riêng cho{" "}
            <span className="font-medium text-ink-700">{startupName || "startup của bạn"}</span> —
            mã 3–4 ký tự kiểu NASDAQ. 100% cổ phần sẽ về ví founder của bạn (gas = 0).
          </p>
        </div>
      </div>

      {!account ? (
        <div className="rounded-xl bg-surface-50 border border-surface-200 p-4 flex items-center justify-between gap-3">
          <p className="text-sm text-ink-600">
            Kết nối ví để nhận cổ phần khi phát hành.
          </p>
          <ConnectWalletButton />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Ticker */}
          <div>
            <label className="block text-xs font-medium text-ink-600 mb-1">
              Mã token (ticker)
            </label>
            <input
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4))}
              placeholder="VD: ACME"
              maxLength={4}
              className="w-32 h-9 px-3 rounded-lg border border-surface-300 font-mono uppercase text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
            />
            {suggestions.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-brand-500" />
                {suggestions.slice(0, 4).map((s) => (
                  <button
                    key={s.ticker}
                    type="button"
                    onClick={() => setTicker(s.ticker)}
                    title={s.rationale}
                    className={cn(
                      "h-7 px-2.5 rounded-full text-xs font-mono font-medium transition-colors",
                      ticker === s.ticker
                        ? "bg-brand-600 text-white"
                        : "bg-surface-100 hover:bg-surface-200 text-ink-700",
                    )}
                  >
                    {s.ticker}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Token name */}
          <div>
            <label className="block text-xs font-medium text-ink-600 mb-1">Tên token</label>
            <input
              value={tokenName}
              onChange={(e) => setTokenName(e.target.value)}
              placeholder={`${startupName} Shares`}
              className="w-full max-w-sm h-9 px-3 rounded-lg border border-surface-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
            />
          </div>

          {/* Supply */}
          <div>
            <label className="block text-xs font-medium text-ink-600 mb-1">
              Tổng số cổ phần
            </label>
            <input
              type="number"
              value={supply}
              min={1}
              onChange={(e) => setSupply(Math.max(1, Math.floor(Number(e.target.value) || 0)))}
              className="w-44 h-9 px-3 rounded-lg border border-surface-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
            />
            <p className="text-[11px] text-ink-400 mt-1">
              Toàn bộ sẽ mint về ví: <span className="font-mono">{shortenAddress(account)}</span>
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleDeploy}
            disabled={deploying}
            className="h-10 px-5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors disabled:opacity-60"
          >
            {deploying ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Đang phát hành…
              </>
            ) : (
              <>
                <Coins className="h-4 w-4" /> Phát hành cổ phần
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
