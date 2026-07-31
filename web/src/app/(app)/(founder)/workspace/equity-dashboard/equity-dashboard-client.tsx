"use client";

import * as React from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Box,
  ExternalLink,
  Gift,
  Loader2,
  RefreshCw,
  Send,
  Shield,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BLOCKID_CHAIN,
  CONTRACTS,
  getConnectedAccount,
  getTokenBalance,
  getTokenTotalSupply,
  formatTokenAmount,
  shortenAddress,
} from "@/lib/wallet";
import { CreateShareToken } from "@/components/wallet/create-share-token";
import { useStartupToken } from "@/components/wallet/use-startup-token";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Shareholder {
  id: string;
  name: string;
  email: string | null;
  role: string;
  shares_held: number;
  evm_address: string | null;
  ownership_pct: number;
}

interface CapTableSummary {
  totalAuthorized: number;
  totalIssued: number;
  fullyDilutedTotal: number;
  esopShares: number;
  esopAvailable: number;
}

interface OnChainTx {
  hash: string;
  from: string;
  to: string;
  value: string;
  type: "transfer" | "mint" | "burn";
  blockNumber: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXPLORER_URL = BLOCKID_CHAIN.blockExplorerUrls[0];
const TOKEN_DECIMALS = 18;

const ROLE_COLORS: Record<string, string> = {
  founder: "#4f46e5",
  cofounder: "#7c3aed",
  investor: "#0891b2",
  advisor: "#d97706",
  esop: "#059669",
};

const PIE_COLORS = [
  "#4f46e5",
  "#7c3aed",
  "#0891b2",
  "#059669",
  "#d97706",
  "#e11d48",
  "#6366f1",
  "#8b5cf6",
];
const RESERVED_COLOR = "#cbd5e1";

// ---------------------------------------------------------------------------
// Ownership Pie Chart (SVG)
// ---------------------------------------------------------------------------

interface PieSegment {
  label: string;
  pct: number;
  color: string;
}

function OwnershipPieChart({ segments }: { segments: PieSegment[] }) {
  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 85;
  const strokeWidth = 36;
  const circumference = 2 * Math.PI * radius;
  let cumulativeOffset = 0;

  return (
    <div className="flex flex-col items-center">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="transform -rotate-90"
      >
        {segments.map((seg, i) => {
          const dashLength = (seg.pct / 100) * circumference;
          const dashGap = circumference - dashLength;
          const offset = cumulativeOffset;
          cumulativeOffset += dashLength;

          return (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${dashLength} ${dashGap}`}
              strokeDashoffset={-offset}
              className="transition-all duration-500"
            />
          );
        })}
      </svg>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 justify-center">
        {segments.map((seg, i) => (
          <div
            key={i}
            className="flex items-center gap-1.5 text-xs text-ink-600"
          >
            <span
              className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
              style={{ backgroundColor: seg.color }}
            />
            <span className="truncate max-w-[120px]">{seg.label}</span>
            <span className="font-medium text-ink-800">
              {seg.pct.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quick Action Card
// ---------------------------------------------------------------------------

function QuickAction({
  href,
  icon: Icon,
  label,
  description,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-surface-200 bg-white p-5 hover:border-brand-200 hover:shadow-sm transition-all"
    >
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0 group-hover:bg-brand-100 transition-colors">
          <Icon strokeWidth={1.75} className="h-5 w-5 text-brand-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <p className="text-sm font-semibold text-ink-800 group-hover:text-brand-700 transition-colors">
              {label}
            </p>
            <ArrowRight
              strokeWidth={1.75}
              className="h-3.5 w-3.5 text-ink-400 group-hover:text-brand-500 transition-colors"
            />
          </div>
          <p className="text-xs text-ink-500 mt-0.5">{description}</p>
        </div>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function EquityDashboardClient({ isAdmin }: { isAdmin: boolean }) {
  const [shareholders, setShareholders] = React.useState<Shareholder[]>([]);
  const [summary, setSummary] = React.useState<CapTableSummary | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [chainSupply, setChainSupply] = React.useState<string | null>(null);
  const [recentTxs, setRecentTxs] = React.useState<OnChainTx[]>([]);
  const [loadingTxs, setLoadingTxs] = React.useState(false);

  // This startup's own equity token (falls back to the legacy shared token
  // until the startup deploys its own via "Create shares on blockchain").
  const { token: startupToken } = useStartupToken();
  const tokenAddress = startupToken?.address ?? CONTRACTS.svt;
  const tokenSymbol = startupToken?.symbol ?? "SVT";

  // ── Fetch cap table data ────────────────────────────────────────────

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cap-table");
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      if (json.ok) {
        setShareholders(json.shareholders ?? []);
        setSummary(json.summary);
      }
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Fetch on-chain total supply ─────────────────────────────────────

  React.useEffect(() => {
    getConnectedAccount()
      .then(async (account) => {
        if (!account) return;
        try {
          const supply = await getTokenTotalSupply(tokenAddress);
          setChainSupply(formatTokenAmount(supply, TOKEN_DECIMALS));
        } catch {
          // Chain might not be reachable
        }
      })
      .catch(() => {});
  }, [tokenAddress]);

  // ── Fetch recent on-chain activity ──────────────────────────────────

  const fetchRecentActivity = React.useCallback(async () => {
    setLoadingTxs(true);
    try {
      // Try to fetch recent Transfer events from the chain via RPC
      const res = await fetch("https://chain.blockid.au/evm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_getLogs",
          params: [
            {
              address: tokenAddress,
              // Transfer(address,address,uint256) topic
              topics: [
                "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
              ],
              fromBlock: "0x0",
              toBlock: "latest",
            },
          ],
        }),
      });
      const json = await res.json();

      if (json.result && Array.isArray(json.result)) {
        // Parse last 10 Transfer events
        const logs = json.result.slice(-10).reverse();
        const txs: OnChainTx[] = logs.map(
          (log: {
            transactionHash: string;
            topics: string[];
            data: string;
            blockNumber: string;
          }) => {
            const from =
              "0x" + (log.topics[1]?.slice(26) ?? "0".repeat(40));
            const to =
              "0x" + (log.topics[2]?.slice(26) ?? "0".repeat(40));
            const value = log.data ?? "0x0";

            // Determine type
            const zeroAddr = "0x" + "0".repeat(40);
            let type: "transfer" | "mint" | "burn" = "transfer";
            if (from === zeroAddr) type = "mint";
            else if (to === zeroAddr) type = "burn";

            return {
              hash: log.transactionHash,
              from,
              to,
              value: formatTokenAmount(
                BigInt(value || "0x0"),
                TOKEN_DECIMALS,
              ),
              type,
              blockNumber: String(parseInt(log.blockNumber, 16)),
              timestamp: "", // Not available from logs directly
            };
          },
        );
        setRecentTxs(txs);
      }
    } catch {
      // Chain might not be reachable — show empty
    } finally {
      setLoadingTxs(false);
    }
  }, [tokenAddress]);

  React.useEffect(() => {
    fetchRecentActivity();
  }, [fetchRecentActivity]);

  // ── Build pie chart segments ────────────────────────────────────────

  const pieSegments: PieSegment[] = React.useMemo(() => {
    if (!shareholders.length && !summary) return [];

    const segments: PieSegment[] = [];
    const byRole: Record<string, number> = {};

    for (const s of shareholders) {
      const role = s.role || "other";
      byRole[role] = (byRole[role] ?? 0) + s.shares_held;
    }

    const total = summary?.fullyDilutedTotal ?? 1;
    const roleLabels: Record<string, string> = {
      founder: "Founders",
      cofounder: "Co-Founders",
      investor: "Investors",
      advisor: "Advisors",
      esop: "ESOP Pool",
    };

    let i = 0;
    for (const [role, shares] of Object.entries(byRole)) {
      const pct = (shares / total) * 100;
      if (pct > 0) {
        segments.push({
          label: roleLabels[role] ?? role,
          pct,
          color:
            ROLE_COLORS[role] ?? PIE_COLORS[i % PIE_COLORS.length],
        });
      }
      i++;
    }

    // Add reserved/unissued
    const issued = summary?.totalIssued ?? 0;
    const esopShares = summary?.esopShares ?? 0;
    const totalPool = issued + esopShares;
    if (totalPool < total) {
      const reservedPct = ((total - totalPool) / total) * 100;
      if (reservedPct > 0.1) {
        segments.push({
          label: "Reserved",
          pct: reservedPct,
          color: RESERVED_COLOR,
        });
      }
    }

    // If nothing to show, add placeholder
    if (segments.length === 0) {
      segments.push({ label: "Unallocated", pct: 100, color: RESERVED_COLOR });
    }

    return segments;
  }, [shareholders, summary]);

  // ── Render ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2
          strokeWidth={1.75}
          className="h-6 w-6 text-ink-400 animate-spin"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink-800">Equity Dashboard</h1>
          <p className="text-sm text-ink-500 mt-0.5">
            Blockchain equity co-ownership overview for Auschain Pty Ltd
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            fetchData();
            fetchRecentActivity();
          }}
          className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-surface-200 bg-white px-4 text-sm font-medium text-ink-600 hover:bg-surface-50 transition-colors cursor-pointer"
        >
          <RefreshCw strokeWidth={1.75} className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Tokenize: create this startup's own equity token on-chain */}
      <CreateShareToken />

      {/* Section 1: Company Overview */}
      <div className="rounded-2xl border border-surface-200 bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-surface-200">
          <h2 className="text-base font-bold text-ink-800 flex items-center gap-2">
            <Box strokeWidth={1.75} className="h-4 w-4 text-ink-500" />
            Company Overview
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-surface-100">
          <div className="bg-white p-5">
            <p className="text-xs text-ink-500 font-medium uppercase tracking-wider mb-1">
              Company
            </p>
            <p className="text-sm font-bold text-ink-800">Auschain Pty Ltd</p>
            <p className="text-xs text-ink-500 mt-0.5">ACN 659 615 111</p>
          </div>
          <div className="bg-white p-5">
            <p className="text-xs text-ink-500 font-medium uppercase tracking-wider mb-1">
              Token
            </p>
            <p className="text-sm font-bold text-ink-800">{tokenSymbol}</p>
            <p className="text-xs text-ink-500 mt-0.5">
              {chainSupply ? `${chainSupply} on-chain` : "—"}
            </p>
          </div>
          <div className="bg-white p-5">
            <p className="text-xs text-ink-500 font-medium uppercase tracking-wider mb-1">
              Contract
            </p>
            <a
              href={`${EXPLORER_URL}/address/${tokenAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm font-mono font-bold text-brand-600 hover:text-brand-700 transition-colors"
            >
              {shortenAddress(tokenAddress)}
              <ExternalLink strokeWidth={1.75} className="h-3 w-3" />
            </a>
            <p className="text-xs text-ink-500 mt-0.5">ERC-1400 Security Token</p>
          </div>
          <div className="bg-white p-5">
            <p className="text-xs text-ink-500 font-medium uppercase tracking-wider mb-1">
              Chain
            </p>
            <p className="text-sm font-bold text-ink-800">
              BlockID.au
            </p>
            <p className="text-xs text-ink-500 mt-0.5">
              Startup Value Chain (ID 420)
            </p>
          </div>
        </div>
      </div>

      {/* Section 2: Ownership Chart + Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pie chart */}
        <div className="rounded-2xl border border-surface-200 bg-white p-6 flex flex-col items-center justify-center">
          <h3 className="text-sm font-bold text-ink-800 mb-4">
            Ownership Distribution
          </h3>
          <OwnershipPieChart segments={pieSegments} />
        </div>

        {/* Stats */}
        <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-surface-200 bg-white p-5">
            <div className="flex items-center gap-2 text-ink-500 mb-2">
              <Users strokeWidth={1.75} className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wider">
                Shareholders
              </span>
            </div>
            <p className="text-2xl font-bold text-ink-800">
              {shareholders.length}
            </p>
          </div>

          <div className="rounded-2xl border border-surface-200 bg-white p-5">
            <div className="flex items-center gap-2 text-ink-500 mb-2">
              <BarChart3 strokeWidth={1.75} className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wider">
                Total Issued
              </span>
            </div>
            <p className="text-2xl font-bold text-ink-800">
              {(summary?.totalIssued ?? 0).toLocaleString()}
            </p>
          </div>

          <div className="rounded-2xl border border-surface-200 bg-white p-5">
            <div className="flex items-center gap-2 text-ink-500 mb-2">
              <Users strokeWidth={1.75} className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wider">
                ESOP Pool
              </span>
            </div>
            <p className="text-2xl font-bold text-emerald-600">
              {(summary?.esopShares ?? 0).toLocaleString()}
            </p>
            <p className="text-xs text-ink-500 mt-1">
              {(summary?.esopAvailable ?? 0).toLocaleString()} available
            </p>
          </div>

          <div className="rounded-2xl border border-surface-200 bg-white p-5">
            <div className="flex items-center gap-2 text-ink-500 mb-2">
              <Shield strokeWidth={1.75} className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wider">
                Fully Diluted
              </span>
            </div>
            <p className="text-2xl font-bold text-ink-800">
              {(summary?.fullyDilutedTotal ?? 0).toLocaleString()}
            </p>
          </div>

          <div className="rounded-2xl border border-surface-200 bg-white p-5">
            <div className="flex items-center gap-2 text-ink-500 mb-2">
              <BarChart3 strokeWidth={1.75} className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wider">
                Authorized
              </span>
            </div>
            <p className="text-2xl font-bold text-ink-800">
              {(summary?.totalAuthorized ?? 0).toLocaleString()}
            </p>
          </div>

          <div className="rounded-2xl border border-surface-200 bg-white p-5">
            <div className="flex items-center gap-2 text-ink-500 mb-2">
              <Activity strokeWidth={1.75} className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wider">
                On-Chain Txs
              </span>
            </div>
            <p className="text-2xl font-bold text-brand-600">
              {recentTxs.length}
            </p>
            <p className="text-xs text-ink-500 mt-1">recent events</p>
          </div>
        </div>
      </div>

      {/* Section 3: Quick Actions */}
      <div>
        <h2 className="text-base font-bold text-ink-800 mb-3">
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <QuickAction
            href="/workspace/shareholders"
            icon={Send}
            label="Transfer Shares"
            description="Transfer SVT tokens between shareholders"
          />
          <QuickAction
            href="/workspace/esop"
            icon={Users}
            label="Grant ESOP"
            description="Create new employee stock option grants"
          />
          <QuickAction
            href="/workspace/dividends"
            icon={Gift}
            label="Declare Dividend"
            description="Distribute dividends to shareholders"
          />
          <QuickAction
            href="/workspace/cap-table"
            icon={RefreshCw}
            label="Sync Cap Table"
            description="Reconcile on-chain balances with database"
          />
        </div>
      </div>

      {/* Section 4: Recent Activity */}
      <div className="rounded-2xl border border-surface-200 bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-surface-200 flex items-center justify-between">
          <h2 className="text-base font-bold text-ink-800 flex items-center gap-2">
            <Activity strokeWidth={1.75} className="h-4 w-4 text-ink-500" />
            Recent On-Chain Activity
          </h2>
          {loadingTxs && (
            <Loader2
              strokeWidth={1.75}
              className="h-4 w-4 text-ink-400 animate-spin"
            />
          )}
        </div>

        {recentTxs.length === 0 && !loadingTxs ? (
          <div className="px-6 py-12 text-center">
            <Activity
              strokeWidth={1.25}
              className="mx-auto h-10 w-10 text-ink-300 mb-3"
            />
            <p className="text-sm text-ink-500">
              No on-chain transactions found. Connect your wallet and ensure the
              chain is accessible.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-100 bg-surface-50">
                  <th className="text-left px-6 py-3 text-xs font-medium text-ink-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-ink-500 uppercase tracking-wider">
                    From
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-ink-500 uppercase tracking-wider">
                    To
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-ink-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-ink-500 uppercase tracking-wider">
                    Block
                  </th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-ink-500 uppercase tracking-wider">
                    Tx
                  </th>
                </tr>
              </thead>
              <tbody>
                {recentTxs.map((tx, i) => (
                  <tr
                    key={`${tx.hash}-${i}`}
                    className="border-b border-surface-100 last:border-b-0 hover:bg-surface-50/50 transition-colors"
                  >
                    <td className="px-6 py-3.5">
                      <span
                        className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium",
                          tx.type === "mint"
                            ? "bg-emerald-100 text-emerald-700"
                            : tx.type === "burn"
                              ? "bg-rose-100 text-rose-700"
                              : "bg-brand-100 text-brand-700",
                        )}
                      >
                        {tx.type === "mint"
                          ? "Mint"
                          : tx.type === "burn"
                            ? "Burn"
                            : "Transfer"}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-xs text-ink-600">
                      {tx.type === "mint" ? (
                        <span className="text-emerald-600">Contract</span>
                      ) : (
                        shortenAddress(tx.from)
                      )}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-xs text-ink-600">
                      {tx.type === "burn" ? (
                        <span className="text-rose-600">Burned</span>
                      ) : (
                        shortenAddress(tx.to)
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums font-medium text-ink-800">
                      {tx.value}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-xs text-ink-500">
                      #{tx.blockNumber}
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <a
                        href={`${EXPLORER_URL}/tx/${tx.hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-mono text-brand-600 hover:text-brand-700 transition-colors"
                      >
                        {tx.hash.slice(0, 10)}...
                        <ArrowUpRight
                          strokeWidth={1.75}
                          className="h-3 w-3"
                        />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Top Shareholders */}
      {shareholders.length > 0 && (
        <div className="rounded-2xl border border-surface-200 bg-white overflow-hidden">
          <div className="px-6 py-4 border-b border-surface-200 flex items-center justify-between">
            <h2 className="text-base font-bold text-ink-800">
              Top Shareholders
            </h2>
            <Link
              href="/workspace/shareholders"
              className="text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors flex items-center gap-1"
            >
              View All
              <ArrowRight strokeWidth={1.75} className="h-3 w-3" />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-100 bg-surface-50">
                  <th className="text-left px-6 py-3 text-xs font-medium text-ink-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-ink-500 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-ink-500 uppercase tracking-wider">
                    Shares
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-ink-500 uppercase tracking-wider">
                    Ownership
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-ink-500 uppercase tracking-wider">
                    Address
                  </th>
                </tr>
              </thead>
              <tbody>
                {shareholders.slice(0, 5).map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-surface-100 last:border-b-0 hover:bg-surface-50/50 transition-colors"
                  >
                    <td className="px-6 py-3.5 font-medium text-ink-800">
                      {s.name}
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium",
                          s.role === "founder"
                            ? "bg-brand-100 text-brand-700"
                            : s.role === "investor"
                              ? "bg-sky-100 text-sky-700"
                              : s.role === "esop"
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-surface-100 text-ink-600",
                        )}
                      >
                        {s.role}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums font-semibold text-ink-800">
                      {s.shares_held.toLocaleString()}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums font-medium text-brand-600">
                      {s.ownership_pct}%
                    </td>
                    <td className="px-6 py-3.5 font-mono text-xs text-ink-500">
                      {s.evm_address ? (
                        <a
                          href={`${EXPLORER_URL}/address/${s.evm_address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand-600 hover:text-brand-700 transition-colors inline-flex items-center gap-1"
                        >
                          {shortenAddress(s.evm_address)}
                          <ExternalLink
                            strokeWidth={1.75}
                            className="h-3 w-3"
                          />
                        </a>
                      ) : (
                        "--"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
