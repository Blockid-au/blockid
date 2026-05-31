"use client";

// Reusable "Connect Wallet" control for the BlockID private EVM chain.
//
// One click connects MetaMask AND auto-adds/switches to the BlockID network
// (chain 420) — the most convenient path for users (no manual network entry).
// Self-contained: detects an existing connection on mount and stays in sync
// via MetaMask's accountsChanged/chainChanged events, so multiple instances
// across the app reflect the same state.

import * as React from "react";
import {
  Wallet,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  AlertTriangle,
  LogOut,
  PlusCircle,
  ChevronDown,
} from "lucide-react";
import {
  BLOCKID_CHAIN,
  CONTRACTS,
  connectWallet,
  disconnectWallet,
  getConnectedAccount,
  getCurrentChainId,
  switchToBlockIDChain,
  addTokenToMetaMask,
  onAccountsChanged,
  onChainChanged,
  isMetaMaskInstalled,
  shortenAddress,
} from "@/lib/wallet";
import { cn } from "@/lib/utils";

const EXPLORER_URL = BLOCKID_CHAIN.blockExplorerUrls[0];

interface ConnectWalletButtonProps {
  className?: string;
  /** Compact mode hides the address label below the sm breakpoint. */
  compact?: boolean;
  /** Called whenever the connected account changes (null when disconnected). */
  onAccountChange?: (account: string | null) => void;
}

export function ConnectWalletButton({
  className,
  compact = false,
  onAccountChange,
}: ConnectWalletButtonProps) {
  const [installed, setInstalled] = React.useState(true);
  const [account, setAccount] = React.useState<string | null>(null);
  const [chainId, setChainId] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const menuRef = React.useRef<HTMLDivElement>(null);

  const onAccountChangeRef = React.useRef(onAccountChange);
  React.useEffect(() => {
    onAccountChangeRef.current = onAccountChange;
  });

  const onChain =
    chainId?.toLowerCase() === BLOCKID_CHAIN.chainId.toLowerCase();

  // ── Mount: detect existing connection + subscribe to wallet events ────
  // Initial render is the disconnected "Connect Wallet" state on both server
  // and client (installed defaults true), so there's no hydration mismatch;
  // the async detection below updates state after mount.
  React.useEffect(() => {
    let active = true;
    (async () => {
      if (!isMetaMaskInstalled()) {
        if (active) setInstalled(false);
        return;
      }
      const addr = await getConnectedAccount();
      if (active) {
        setAccount(addr);
        onAccountChangeRef.current?.(addr);
      }
      const id = await getCurrentChainId();
      if (active) setChainId(id);
    })();

    const unsubAccounts = onAccountsChanged((accounts) => {
      const next = accounts[0] ?? null;
      setAccount(next);
      onAccountChangeRef.current?.(next);
      if (!next) setMenuOpen(false);
    });
    const unsubChain = onChainChanged((id) => setChainId(id));
    return () => {
      active = false;
      unsubAccounts();
      unsubChain();
    };
  }, []);

  // ── Close menu on outside click ───────────────────────────────────────
  React.useEffect(() => {
    if (!menuOpen) return;
    function handle(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [menuOpen]);

  // ── Actions ───────────────────────────────────────────────────────────
  async function handleConnect() {
    setBusy(true);
    setError(null);
    try {
      const addr = await connectWallet();
      setAccount(addr);
      onAccountChangeRef.current?.(addr);
      setChainId(await getCurrentChainId());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect");
    } finally {
      setBusy(false);
    }
  }

  async function handleSwitch() {
    setBusy(true);
    setError(null);
    try {
      await switchToBlockIDChain();
      setChainId(await getCurrentChainId());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to switch network");
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    await disconnectWallet();
    setAccount(null);
    setMenuOpen(false);
    onAccountChangeRef.current?.(null);
  }

  async function handleCopy() {
    if (!account) return;
    try {
      await navigator.clipboard.writeText(account);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — ignore */
    }
  }

  async function handleAddToken() {
    try {
      await addTokenToMetaMask(CONTRACTS.svt, "SVT", 18);
    } catch {
      /* user rejected — ignore */
    }
  }

  // No wallet extension → guide to install.
  if (!installed) {
    return (
      <a
        href="https://metamask.io/download/"
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "h-8 px-3 rounded-lg bg-surface-100 hover:bg-surface-200 text-ink-700 text-xs font-medium flex items-center gap-1.5 transition-colors",
          className,
        )}
        title="MetaMask is required to connect"
      >
        <Wallet strokeWidth={1.75} className="h-4 w-4" />
        <span className={compact ? "hidden sm:inline" : ""}>Install MetaMask</span>
      </a>
    );
  }

  // Connected but on the wrong network → one-click switch.
  if (account && !onChain) {
    return (
      <button
        type="button"
        onClick={handleSwitch}
        disabled={busy}
        title={error ?? "Switch to the BlockID network"}
        className={cn(
          "h-8 px-3 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 ring-1 ring-amber-300 text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-60",
          className,
        )}
      >
        {busy ? (
          <Loader2 strokeWidth={2} className="h-4 w-4 animate-spin" />
        ) : (
          <AlertTriangle strokeWidth={1.75} className="h-4 w-4" />
        )}
        <span>Switch network</span>
      </button>
    );
  }

  // Connected + correct network → status pill with a small menu.
  if (account && onChain) {
    return (
      <div className={cn("relative", className)} ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="h-8 pl-2 pr-1.5 rounded-lg bg-surface-100 hover:bg-surface-200 text-ink-700 text-xs font-medium flex items-center gap-1.5 transition-colors"
          title={account}
        >
          <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
          <span className="font-mono">{shortenAddress(account)}</span>
          <ChevronDown
            strokeWidth={2}
            className={cn("h-3.5 w-3.5 transition-transform", menuOpen && "rotate-180")}
          />
        </button>

        {menuOpen && (
          <div className="absolute right-0 mt-2 w-60 rounded-xl border border-surface-200 bg-white dark:bg-surface-100 shadow-lg py-1.5 z-50">
            <div className="px-3 py-2 border-b border-surface-200/70">
              <div className="text-[10px] uppercase tracking-wide text-ink-400">
                {BLOCKID_CHAIN.chainName}
              </div>
              <div className="text-xs font-mono text-ink-700 break-all">{account}</div>
            </div>
            <MenuItem onClick={handleCopy} icon={copied ? Check : Copy}>
              {copied ? "Copied!" : "Copy address"}
            </MenuItem>
            <MenuItem onClick={handleAddToken} icon={PlusCircle}>
              Add SVT to MetaMask
            </MenuItem>
            <a
              href={`${EXPLORER_URL}/address/${account}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMenuOpen(false)}
              className="w-full px-3 py-2 flex items-center gap-2 text-xs text-ink-700 hover:bg-surface-100 transition-colors"
            >
              <ExternalLink strokeWidth={1.75} className="h-4 w-4 text-ink-400" />
              View on Explorer
            </a>
            <div className="my-1 border-t border-surface-200/70" />
            <MenuItem onClick={handleDisconnect} icon={LogOut} danger>
              Disconnect
            </MenuItem>
          </div>
        )}
      </div>
    );
  }

  // Disconnected → connect (auto-adds/switches the network).
  return (
    <button
      type="button"
      onClick={handleConnect}
      disabled={busy}
      title={error ?? "Connect MetaMask to the BlockID network"}
      className={cn(
        "h-8 px-3 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-60",
        className,
      )}
    >
      {busy ? (
        <Loader2 strokeWidth={2} className="h-4 w-4 animate-spin" />
      ) : (
        <Wallet strokeWidth={1.75} className="h-4 w-4" />
      )}
      <span className={compact ? "hidden sm:inline" : ""}>Connect Wallet</span>
    </button>
  );
}

function MenuItem({
  onClick,
  icon: Icon,
  children,
  danger,
}: {
  onClick: () => void;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full px-3 py-2 flex items-center gap-2 text-xs transition-colors",
        danger
          ? "text-red-600 hover:bg-red-50"
          : "text-ink-700 hover:bg-surface-100",
      )}
    >
      <Icon strokeWidth={1.75} className={cn("h-4 w-4", danger ? "" : "text-ink-400")} />
      {children}
    </button>
  );
}
