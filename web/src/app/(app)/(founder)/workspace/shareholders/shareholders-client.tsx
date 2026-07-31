"use client";

import * as React from "react";
import {
  AlertCircle,
  ArrowUpRight,
  Award,
  Check,
  ExternalLink,
  Loader2,
  Plus,
  Search,
  Send,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BLOCKID_CHAIN,
  CONTRACTS,
  connectWallet,
  getConnectedAccount,
  getTokenBalance,
  mintTokens,
  transferTokens,
  parseTokenAmount,
  formatTokenAmount,
  shortenAddress,
} from "@/lib/wallet";
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
  vesting_start: string | null;
  vesting_months: number | null;
  cliff_months: number | null;
  created_at: string;
  ownership_pct: number;
  fully_diluted_pct: number;
}

interface CapTableData {
  shareholders: Shareholder[];
  summary: {
    totalAuthorized: number;
    totalIssued: number;
    fullyDilutedTotal: number;
    esopShares: number;
    esopAvailable: number;
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROLES = [
  { value: "founder", label: "Founder" },
  { value: "cofounder", label: "Co-Founder" },
  { value: "investor", label: "Investor" },
  { value: "advisor", label: "Advisor" },
  { value: "esop", label: "ESOP" },
];

const ROLE_COLORS: Record<string, string> = {
  founder: "bg-brand-100 text-brand-700",
  cofounder: "bg-violet-100 text-violet-700",
  investor: "bg-sky-100 text-sky-700",
  advisor: "bg-amber-100 text-amber-700",
  esop: "bg-emerald-100 text-emerald-700",
};

const TOKEN_DECIMALS = 18;
const EXPLORER_URL = BLOCKID_CHAIN.blockExplorerUrls[0];

// ---------------------------------------------------------------------------
// Add Shareholder Modal
// ---------------------------------------------------------------------------

interface AddFormData {
  name: string;
  email: string;
  role: string;
  evmAddress: string;
  shares: string;
}

const EMPTY_FORM: AddFormData = {
  name: "",
  email: "",
  role: "founder",
  evmAddress: "",
  shares: "",
};

function AddShareholderModal({
  open,
  onClose,
  onSubmit,
  loading,
  error,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: AddFormData) => void;
  loading: boolean;
  error: string | null;
}) {
  const [form, setForm] = React.useState<AddFormData>(EMPTY_FORM);

  React.useEffect(() => {
    if (open) setForm(EMPTY_FORM);
  }, [open]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-2xl border border-surface-200 shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200">
          <h2 className="text-lg font-bold text-ink-800">Add Shareholder</h2>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-ink-500 hover:text-ink-800 hover:bg-surface-100 transition-colors cursor-pointer"
          >
            <X strokeWidth={1.75} className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">
              Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Alice Chen"
              className="w-full h-10 rounded-xl border border-surface-200 px-3 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="alice@example.com"
              className="w-full h-10 rounded-xl border border-surface-200 px-3 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">
              Role <span className="text-rose-500">*</span>
            </label>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="w-full h-10 rounded-xl border border-surface-200 px-3 text-sm text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition-colors cursor-pointer"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">
              EVM Address
            </label>
            <input
              type="text"
              value={form.evmAddress}
              onChange={(e) =>
                setForm({ ...form, evmAddress: e.target.value })
              }
              placeholder="0x..."
              className="w-full h-10 rounded-xl border border-surface-200 px-3 text-sm font-mono text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">
              Shares <span className="text-rose-500">*</span>
            </label>
            <input
              type="number"
              required
              min="1"
              value={form.shares}
              onChange={(e) => setForm({ ...form, shares: e.target.value })}
              placeholder="e.g. 1000000"
              className="w-full h-10 rounded-xl border border-surface-200 px-3 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition-colors"
            />
          </div>

          {error && (
            <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={loading || !form.name.trim() || !form.shares}
              className="flex-1 h-10 rounded-xl bg-brand-600 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center justify-center gap-2"
            >
              {loading ? (
                <Loader2 strokeWidth={1.75} className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <UserPlus strokeWidth={1.75} className="h-4 w-4" />
                  Issue Shares
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-5 rounded-xl border border-surface-200 text-sm font-medium text-ink-600 hover:bg-surface-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Transfer Modal
// ---------------------------------------------------------------------------

function TransferModal({
  open,
  onClose,
  shareholder,
  onTransfer,
  loading,
  error,
}: {
  open: boolean;
  onClose: () => void;
  shareholder: Shareholder | null;
  onTransfer: (toAddress: string, amount: string) => void;
  loading: boolean;
  error: string | null;
}) {
  const [toAddress, setToAddress] = React.useState("");
  const [amount, setAmount] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setToAddress("");
      setAmount("");
    }
  }, [open]);

  if (!open || !shareholder) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onTransfer(toAddress, amount);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-2xl border border-surface-200 shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200">
          <h2 className="text-lg font-bold text-ink-800">Transfer Shares</h2>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-ink-500 hover:text-ink-800 hover:bg-surface-100 transition-colors cursor-pointer"
          >
            <X strokeWidth={1.75} className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="rounded-xl bg-surface-50 border border-surface-200 p-4">
            <p className="text-xs text-ink-500 mb-1">From</p>
            <p className="text-sm font-bold text-ink-800">
              {shareholder.name}
            </p>
            {shareholder.evm_address && (
              <p className="text-xs font-mono text-ink-500 mt-0.5">
                {shortenAddress(shareholder.evm_address)}
              </p>
            )}
            <p className="text-xs text-ink-500 mt-1">
              Balance: {shareholder.shares_held.toLocaleString()} shares
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">
              To Address <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={toAddress}
              onChange={(e) => setToAddress(e.target.value)}
              placeholder="0x..."
              className="w-full h-10 rounded-xl border border-surface-200 px-3 text-sm font-mono text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">
              Amount <span className="text-rose-500">*</span>
            </label>
            <input
              type="number"
              required
              min="1"
              max={shareholder.shares_held}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 100000"
              className="w-full h-10 rounded-xl border border-surface-200 px-3 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition-colors"
            />
          </div>

          {error && (
            <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !toAddress || !amount}
            className="w-full h-10 rounded-xl bg-brand-600 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center justify-center gap-2"
          >
            {loading ? (
              <Loader2 strokeWidth={1.75} className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Send strokeWidth={1.75} className="h-4 w-4" />
                Transfer
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Share Certificate Card
// ---------------------------------------------------------------------------

function ShareCertificate({
  shareholder,
  onClose,
  tokenAddress = CONTRACTS.svt,
}: {
  shareholder: Shareholder;
  onClose: () => void;
  tokenAddress?: string;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-2xl border border-surface-200 shadow-xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Certificate header */}
        <div className="bg-gradient-to-br from-brand-600 to-brand-800 px-8 py-6 text-white text-center">
          <Award strokeWidth={1.25} className="h-10 w-10 mx-auto mb-2 opacity-80" />
          <h2 className="text-xl font-bold tracking-wide">
            Share Certificate
          </h2>
          <p className="text-brand-100 text-sm mt-1">
            Auschain Pty Ltd (ACN 659 615 111)
          </p>
        </div>

        <div className="px-8 py-6 space-y-5">
          <div className="text-center border-b border-surface-200 pb-5">
            <p className="text-xs text-ink-500 uppercase tracking-wider mb-1">
              This certifies that
            </p>
            <p className="text-xl font-bold text-ink-800">
              {shareholder.name}
            </p>
            {shareholder.email && (
              <p className="text-sm text-ink-500">{shareholder.email}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl bg-surface-50 border border-surface-200 p-4">
              <p className="text-xs text-ink-500 mb-1">Share Class</p>
              <p className="text-sm font-bold text-ink-800">
                SVT (Ordinary)
              </p>
            </div>
            <div className="rounded-xl bg-surface-50 border border-surface-200 p-4">
              <p className="text-xs text-ink-500 mb-1">Shares Held</p>
              <p className="text-sm font-bold text-ink-800">
                {shareholder.shares_held.toLocaleString()}
              </p>
            </div>
            <div className="rounded-xl bg-surface-50 border border-surface-200 p-4">
              <p className="text-xs text-ink-500 mb-1">Ownership</p>
              <p className="text-sm font-bold text-ink-800">
                {shareholder.ownership_pct}%
              </p>
            </div>
            <div className="rounded-xl bg-surface-50 border border-surface-200 p-4">
              <p className="text-xs text-ink-500 mb-1">Date Issued</p>
              <p className="text-sm font-bold text-ink-800">
                {new Date(shareholder.created_at).toLocaleDateString("en-AU", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </p>
            </div>
          </div>

          {/* On-chain proof */}
          {shareholder.evm_address && (
            <div className="rounded-xl bg-brand-50 border border-brand-100 p-4">
              <p className="text-xs text-brand-600 font-medium mb-1">
                On-Chain Proof
              </p>
              <p className="text-xs font-mono text-brand-700 break-all">
                {shareholder.evm_address}
              </p>
              <a
                href={`${EXPLORER_URL}/address/${shareholder.evm_address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 mt-2 transition-colors"
              >
                View on Explorer
                <ExternalLink strokeWidth={1.75} className="h-3 w-3" />
              </a>
            </div>
          )}

          <div className="text-center text-[10px] text-ink-400 pt-2 border-t border-surface-200">
            Token Contract: {tokenAddress} | Chain: BlockID.au - Startup Value
            Chain (ID 420)
          </div>
        </div>

        <div className="px-8 pb-6">
          <button
            type="button"
            onClick={onClose}
            className="w-full h-10 rounded-xl border border-surface-200 text-sm font-medium text-ink-600 hover:bg-surface-50 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ShareholdersClient({ isAdmin }: { isAdmin: boolean }) {
  // This startup's own equity token (falls back to the legacy shared token).
  const { token: startupToken } = useStartupToken();
  const tokenAddress = startupToken?.address ?? CONTRACTS.svt;

  const [data, setData] = React.useState<CapTableData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");

  // Modals
  const [addModalOpen, setAddModalOpen] = React.useState(false);
  const [addError, setAddError] = React.useState<string | null>(null);
  const [addLoading, setAddLoading] = React.useState(false);

  const [transferModal, setTransferModal] =
    React.useState<Shareholder | null>(null);
  const [transferError, setTransferError] = React.useState<string | null>(
    null,
  );
  const [transferLoading, setTransferLoading] = React.useState(false);

  const [certModal, setCertModal] = React.useState<Shareholder | null>(null);

  // Wallet
  const [account, setAccount] = React.useState<string | null>(null);

  React.useEffect(() => {
    getConnectedAccount().then((addr) => setAccount(addr));
  }, []);

  // ── Fetch cap table ─────────────────────────────────────────────────

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cap-table");
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      if (json.ok) {
        setData({
          shareholders: json.shareholders ?? [],
          summary: json.summary,
        });
      }
    } catch {
      setError("Failed to load shareholder data");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Add shareholder + mint on-chain ─────────────────────────────────

  const handleAddShareholder = async (form: AddFormData) => {
    setAddLoading(true);
    setAddError(null);

    try {
      const shares = parseInt(form.shares);
      if (!shares || shares <= 0) {
        setAddError("Shares must be greater than 0");
        setAddLoading(false);
        return;
      }

      // Create in DB
      const res = await fetch("/api/cap-table", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_shareholder",
          data: {
            name: form.name.trim(),
            email: form.email.trim() || null,
            role: form.role,
            sharesHeld: shares,
          },
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setAddError(json.error ?? "Failed to add shareholder");
        setAddLoading(false);
        return;
      }

      const shareholderId = json.shareholder?.id;

      // Update EVM address if provided
      if (form.evmAddress.trim() && shareholderId) {
        await fetch("/api/cap-table", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update_shareholder",
            data: {
              shareholderId,
              evmAddress: form.evmAddress.trim(),
            },
          }),
        });
      }

      // Mint tokens on-chain if EVM address provided
      if (form.evmAddress.trim()) {
        try {
          let walletAddr = account;
          if (!walletAddr) {
            walletAddr = await connectWallet();
            setAccount(walletAddr);
          }

          const amount = parseTokenAmount(shares.toString(), TOKEN_DECIMALS);
          await mintTokens(tokenAddress, form.evmAddress.trim(), amount);

          setSuccess(
            `${shares.toLocaleString()} SVT shares issued to ${form.name} (on-chain mint completed)`,
          );
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Mint failed";
          setSuccess(
            `Shareholder added to database. On-chain mint failed: ${msg}`,
          );
        }
      } else {
        setSuccess(
          `${shares.toLocaleString()} shares issued to ${form.name} (database only, no EVM address)`,
        );
      }

      setAddModalOpen(false);
      await fetchData();
    } catch {
      setAddError("Something went wrong. Please try again.");
    } finally {
      setAddLoading(false);
    }
  };

  // ── Transfer ────────────────────────────────────────────────────────

  const handleTransfer = async (toAddress: string, amountStr: string) => {
    setTransferLoading(true);
    setTransferError(null);

    try {
      const amount = parseInt(amountStr);
      if (!amount || amount <= 0) {
        setTransferError("Amount must be greater than 0");
        setTransferLoading(false);
        return;
      }

      if (!/^0x[0-9a-fA-F]{40}$/.test(toAddress)) {
        setTransferError("Invalid EVM address");
        setTransferLoading(false);
        return;
      }

      let walletAddr = account;
      if (!walletAddr) {
        walletAddr = await connectWallet();
        setAccount(walletAddr);
      }

      const amountWei = parseTokenAmount(amount.toString(), TOKEN_DECIMALS);
      await transferTokens(tokenAddress, toAddress, amountWei);

      setSuccess(
        `Transferred ${amount.toLocaleString()} shares to ${shortenAddress(toAddress)}`,
      );
      setTransferModal(null);
      await fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transfer failed";
      setTransferError(msg);
    } finally {
      setTransferLoading(false);
    }
  };

  // ── Filter shareholders ─────────────────────────────────────────────

  const shareholders = data?.shareholders ?? [];
  const filtered = searchQuery
    ? shareholders.filter(
        (s) =>
          s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.evm_address?.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : shareholders;

  // ── Compute vesting status helper ───────────────────────────────────

  function vestingStatus(s: Shareholder): string {
    if (!s.vesting_months || !s.vesting_start) return "--";
    const start = new Date(s.vesting_start);
    const now = new Date();
    const elapsed =
      (now.getFullYear() - start.getFullYear()) * 12 +
      (now.getMonth() - start.getMonth());
    const cliffMonths = s.cliff_months ?? 0;
    if (elapsed < cliffMonths) return `Cliff (${cliffMonths - elapsed}m left)`;
    if (elapsed >= s.vesting_months) return "Fully vested";
    const pct = Math.min(100, Math.round((elapsed / s.vesting_months) * 100));
    return `${pct}% vested`;
  }

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
          <h1 className="text-xl font-bold text-ink-800">
            Shareholder Directory
          </h1>
          <p className="text-sm text-ink-500 mt-0.5">
            Manage shareholders, issue shares, and view certificates.
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => {
              setAddError(null);
              setAddModalOpen(true);
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 transition-colors cursor-pointer"
          >
            <Plus strokeWidth={1.75} className="h-4 w-4" />
            Add Shareholder
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
          <button
            type="button"
            onClick={() => setSuccess(null)}
            className="ml-auto h-5 w-5 flex items-center justify-center rounded text-emerald-500 hover:text-emerald-700 cursor-pointer"
          >
            <X strokeWidth={1.75} className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Summary cards */}
      {data?.summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-surface-200 bg-white p-5">
            <p className="text-xs font-medium text-ink-500 uppercase tracking-wider mb-1">
              Total Shareholders
            </p>
            <p className="text-2xl font-bold text-ink-800">
              {shareholders.length}
            </p>
          </div>
          <div className="rounded-2xl border border-surface-200 bg-white p-5">
            <p className="text-xs font-medium text-ink-500 uppercase tracking-wider mb-1">
              Total Issued
            </p>
            <p className="text-2xl font-bold text-ink-800">
              {data.summary.totalIssued.toLocaleString()}
            </p>
          </div>
          <div className="rounded-2xl border border-surface-200 bg-white p-5">
            <p className="text-xs font-medium text-ink-500 uppercase tracking-wider mb-1">
              ESOP Pool
            </p>
            <p className="text-2xl font-bold text-emerald-600">
              {data.summary.esopShares.toLocaleString()}
            </p>
          </div>
          <div className="rounded-2xl border border-surface-200 bg-white p-5">
            <p className="text-xs font-medium text-ink-500 uppercase tracking-wider mb-1">
              Fully Diluted
            </p>
            <p className="text-2xl font-bold text-ink-800">
              {data.summary.fullyDilutedTotal.toLocaleString()}
            </p>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search
          strokeWidth={1.75}
          className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400"
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by name, email, role, or address..."
          className="w-full h-10 pl-10 pr-4 rounded-xl border border-surface-200 bg-white text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition-colors"
        />
      </div>

      {/* Shareholders table */}
      <div className="rounded-2xl border border-surface-200 bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-surface-200 flex items-center justify-between">
          <h2 className="text-base font-bold text-ink-800 flex items-center gap-2">
            <Users strokeWidth={1.75} className="h-4 w-4 text-ink-500" />
            Shareholders
          </h2>
          <span className="text-xs text-ink-500">
            {filtered.length} of {shareholders.length}
          </span>
        </div>

        {filtered.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Users
              strokeWidth={1.25}
              className="mx-auto h-10 w-10 text-ink-300 mb-3"
            />
            <p className="text-sm text-ink-500">
              {shareholders.length === 0
                ? "No shareholders yet. Add your first shareholder to get started."
                : "No shareholders match your search."}
            </p>
          </div>
        ) : (
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
                    Ownership&nbsp;%
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-ink-500 uppercase tracking-wider">
                    EVM Address
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-ink-500 uppercase tracking-wider">
                    Vesting
                  </th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-ink-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-surface-100 last:border-b-0 hover:bg-surface-50/50 transition-colors"
                  >
                    <td className="px-6 py-3.5">
                      <div>
                        <p className="font-medium text-ink-800">{s.name}</p>
                        {s.email && (
                          <p className="text-xs text-ink-400 mt-0.5">
                            {s.email}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium",
                          ROLE_COLORS[s.role] ?? "bg-surface-100 text-ink-600",
                        )}
                      >
                        {ROLES.find((r) => r.value === s.role)?.label ?? s.role}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right font-semibold text-ink-800 tabular-nums">
                      {s.shares_held.toLocaleString()}
                    </td>
                    <td className="px-4 py-3.5 text-right font-medium text-brand-600 tabular-nums">
                      {s.ownership_pct}%
                    </td>
                    <td className="px-4 py-3.5">
                      {s.evm_address ? (
                        <a
                          href={`${EXPLORER_URL}/address/${s.evm_address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-mono text-brand-600 hover:text-brand-700 transition-colors"
                        >
                          {shortenAddress(s.evm_address)}
                          <ExternalLink
                            strokeWidth={1.75}
                            className="h-3 w-3"
                          />
                        </a>
                      ) : (
                        <span className="text-xs text-ink-400">--</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span
                        className={cn(
                          "text-xs font-medium",
                          vestingStatus(s) === "Fully vested"
                            ? "text-emerald-600"
                            : vestingStatus(s) === "--"
                              ? "text-ink-400"
                              : "text-amber-600",
                        )}
                      >
                        {vestingStatus(s)}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {s.evm_address && (
                          <button
                            type="button"
                            onClick={() => {
                              setTransferError(null);
                              setTransferModal(s);
                            }}
                            className="h-7 px-2 flex items-center gap-1 rounded-lg text-xs font-medium text-ink-500 hover:text-brand-600 hover:bg-brand-50 transition-colors cursor-pointer"
                            title="Transfer shares"
                          >
                            <Send strokeWidth={1.75} className="h-3.5 w-3.5" />
                            Transfer
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setCertModal(s)}
                          className="h-7 px-2 flex items-center gap-1 rounded-lg text-xs font-medium text-ink-500 hover:text-brand-600 hover:bg-brand-50 transition-colors cursor-pointer"
                          title="View certificate"
                        >
                          <Award
                            strokeWidth={1.75}
                            className="h-3.5 w-3.5"
                          />
                          Cert
                        </button>
                        {s.evm_address && (
                          <a
                            href={`${EXPLORER_URL}/address/${s.evm_address}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="h-7 w-7 flex items-center justify-center rounded-lg text-ink-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                            title="View on explorer"
                          >
                            <ArrowUpRight
                              strokeWidth={1.75}
                              className="h-3.5 w-3.5"
                            />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      <AddShareholderModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSubmit={handleAddShareholder}
        loading={addLoading}
        error={addError}
      />

      <TransferModal
        open={!!transferModal}
        onClose={() => setTransferModal(null)}
        shareholder={transferModal}
        onTransfer={handleTransfer}
        loading={transferLoading}
        error={transferError}
      />

      {certModal && (
        <ShareCertificate
          shareholder={certModal}
          onClose={() => setCertModal(null)}
          tokenAddress={tokenAddress}
        />
      )}
    </div>
  );
}
