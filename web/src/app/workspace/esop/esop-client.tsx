"use client";

import * as React from "react";
import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronLeft,
  Clock,
  Loader2,
  Plus,
  ShieldOff,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CONTRACTS,
  connectWallet,
  getConnectedAccount,
  getVestingGrant,
  getVestedAmount,
  grantVesting,
  revokeVesting,
  parseTokenAmount,
  formatTokenAmount,
  shortenAddress,
  type VestingInfo,
} from "@/lib/wallet";

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
}

interface GrantConfig {
  totalShares: string;
  cliffMonths: string;
  vestingMonths: string;
  startDate: string;
}

interface ActiveGrant {
  shareholder: Shareholder;
  vesting: VestingInfo;
  vestedAmount: bigint;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EMPTY_GRANT: GrantConfig = {
  totalShares: "",
  cliffMonths: "12",
  vestingMonths: "48",
  startDate: new Date().toISOString().split("T")[0],
};

const TOKEN_DECIMALS = 18;

// ---------------------------------------------------------------------------
// Vesting Schedule Preview
// ---------------------------------------------------------------------------

function VestingSchedulePreview({
  totalShares,
  cliffMonths,
  vestingMonths,
  startDate,
}: {
  totalShares: number;
  cliffMonths: number;
  vestingMonths: number;
  startDate: string;
}) {
  const start = new Date(startDate);
  const rows: Array<{ month: number; date: string; vested: number; cumulative: number }> = [];

  for (let m = 1; m <= vestingMonths; m++) {
    const d = new Date(start);
    d.setMonth(d.getMonth() + m);
    const monthlyVest = m < cliffMonths ? 0 : totalShares / vestingMonths;
    const cumulative =
      m < cliffMonths
        ? 0
        : m === cliffMonths
          ? Math.round((totalShares / vestingMonths) * cliffMonths)
          : Math.round((totalShares / vestingMonths) * m);

    rows.push({
      month: m,
      date: d.toLocaleDateString("en-AU", { year: "numeric", month: "short" }),
      vested: Math.round(monthlyVest),
      cumulative: Math.min(cumulative, totalShares),
    });
  }

  // Only show key months: cliff, every 12 months, and final
  const keyMonths = rows.filter(
    (r) =>
      r.month === cliffMonths ||
      r.month % 12 === 0 ||
      r.month === vestingMonths,
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-surface-100 bg-surface-50">
            <th className="text-left px-4 py-2 text-xs font-medium text-ink-500 uppercase">
              Month
            </th>
            <th className="text-left px-4 py-2 text-xs font-medium text-ink-500 uppercase">
              Date
            </th>
            <th className="text-right px-4 py-2 text-xs font-medium text-ink-500 uppercase">
              Vested This Period
            </th>
            <th className="text-right px-4 py-2 text-xs font-medium text-ink-500 uppercase">
              Cumulative
            </th>
            <th className="text-right px-4 py-2 text-xs font-medium text-ink-500 uppercase">
              % Vested
            </th>
          </tr>
        </thead>
        <tbody>
          {keyMonths.map((r) => (
            <tr
              key={r.month}
              className={cn(
                "border-b border-surface-100",
                r.month === cliffMonths && "bg-amber-50",
              )}
            >
              <td className="px-4 py-2 text-ink-700 tabular-nums">
                {r.month}
                {r.month === cliffMonths && (
                  <span className="ml-1.5 text-[10px] font-medium text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">
                    CLIFF
                  </span>
                )}
              </td>
              <td className="px-4 py-2 text-ink-600">{r.date}</td>
              <td className="px-4 py-2 text-right tabular-nums text-ink-700">
                {r.vested.toLocaleString()}
              </td>
              <td className="px-4 py-2 text-right tabular-nums font-medium text-ink-800">
                {r.cumulative.toLocaleString()}
              </td>
              <td className="px-4 py-2 text-right tabular-nums text-brand-600 font-medium">
                {totalShares > 0
                  ? ((r.cumulative / totalShares) * 100).toFixed(1)
                  : "0"}
                %
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main ESOP Client
// ---------------------------------------------------------------------------

export function EsopClient() {
  // Wizard state
  const [step, setStep] = React.useState(0); // 0 = list, 1 = select employee, 2 = configure, 3 = review
  const [shareholders, setShareholders] = React.useState<Shareholder[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  // Selected employee
  const [selectedEmployee, setSelectedEmployee] =
    React.useState<Shareholder | null>(null);
  const [newEmployee, setNewEmployee] = React.useState({
    name: "",
    email: "",
    evmAddress: "",
  });
  const [isNewEmployee, setIsNewEmployee] = React.useState(false);

  // Grant config
  const [grantConfig, setGrantConfig] = React.useState<GrantConfig>(EMPTY_GRANT);

  // Active grants
  const [activeGrants, setActiveGrants] = React.useState<ActiveGrant[]>([]);
  const [loadingGrants, setLoadingGrants] = React.useState(false);

  // Wallet
  const [account, setAccount] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  // ── Load shareholders ──────────────────────────────────────────────

  const fetchShareholders = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cap-table");
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      if (json.ok) {
        setShareholders(json.shareholders ?? []);
      }
    } catch {
      setError("Failed to load shareholders");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchShareholders();
  }, [fetchShareholders]);

  // ── Check wallet ───────────────────────────────────────────────────

  React.useEffect(() => {
    getConnectedAccount().then((addr) => setAccount(addr));
  }, []);

  // ── Load active vesting grants from chain ──────────────────────────

  const loadActiveGrants = React.useCallback(async () => {
    const esopHolders = shareholders.filter(
      (s) => s.evm_address && (s.role === "esop" || s.vesting_months),
    );
    if (esopHolders.length === 0) {
      setActiveGrants([]);
      return;
    }

    setLoadingGrants(true);
    const grants: ActiveGrant[] = [];

    for (const sh of esopHolders) {
      try {
        const [vesting, vestedAmt] = await Promise.all([
          getVestingGrant(CONTRACTS.svt, sh.evm_address!),
          getVestedAmount(CONTRACTS.svt, sh.evm_address!),
        ]);
        if (vesting.totalAmount > 0n) {
          grants.push({ shareholder: sh, vesting, vestedAmount: vestedAmt });
        }
      } catch {
        // Skip if chain unreachable for this address
      }
    }

    setActiveGrants(grants);
    setLoadingGrants(false);
  }, [shareholders]);

  React.useEffect(() => {
    if (shareholders.length > 0) {
      loadActiveGrants();
    }
  }, [shareholders, loadActiveGrants]);

  // ── Wizard handlers ────────────────────────────────────────────────

  function startWizard() {
    setStep(1);
    setSelectedEmployee(null);
    setIsNewEmployee(false);
    setNewEmployee({ name: "", email: "", evmAddress: "" });
    setGrantConfig(EMPTY_GRANT);
    setError(null);
    setSuccess(null);
  }

  function selectEmployee(sh: Shareholder) {
    setSelectedEmployee(sh);
    setIsNewEmployee(false);
    setStep(2);
  }

  function selectNewEmployee() {
    setIsNewEmployee(true);
    setSelectedEmployee(null);
    setStep(2);
  }

  async function handleGrant() {
    setSubmitting(true);
    setError(null);

    try {
      const totalShares = parseInt(grantConfig.totalShares);
      const cliffMonths = parseInt(grantConfig.cliffMonths);
      const vestingMonths = parseInt(grantConfig.vestingMonths);

      if (!totalShares || totalShares <= 0) {
        setError("Total shares must be greater than 0");
        setSubmitting(false);
        return;
      }

      let employeeId = selectedEmployee?.id;
      let evmAddress = selectedEmployee?.evm_address;

      // If new employee, create in DB first
      if (isNewEmployee) {
        if (!newEmployee.name.trim()) {
          setError("Employee name is required");
          setSubmitting(false);
          return;
        }

        const createRes = await fetch("/api/cap-table", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "add_shareholder",
            data: {
              name: newEmployee.name.trim(),
              email: newEmployee.email.trim() || null,
              role: "esop",
              sharesHeld: totalShares,
              vestingStart: grantConfig.startDate,
              vestingMonths,
              cliffMonths,
            },
          }),
        });
        const createJson = await createRes.json();
        if (!createJson.ok) {
          setError(createJson.error ?? "Failed to add employee");
          setSubmitting(false);
          return;
        }
        employeeId = createJson.shareholder?.id;
        evmAddress = newEmployee.evmAddress.trim() || null;

        // Update EVM address if provided
        if (evmAddress && employeeId) {
          await fetch("/api/cap-table", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "update_shareholder",
              data: { shareholderId: employeeId, evmAddress },
            }),
          });
        }
      } else if (selectedEmployee) {
        // Update existing shareholder vesting fields
        await fetch("/api/cap-table", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update_shareholder",
            data: {
              shareholderId: selectedEmployee.id,
              sharesHeld: totalShares,
              vestingStart: grantConfig.startDate,
              vestingMonths,
              cliffMonths,
              role: "esop",
            },
          }),
        });
      }

      // If EVM address exists, grant vesting on-chain
      if (evmAddress) {
        let walletAddr = account;
        if (!walletAddr) {
          walletAddr = await connectWallet();
          setAccount(walletAddr);
        }

        const amount = parseTokenAmount(totalShares.toString(), TOKEN_DECIMALS);
        const cliffSec = BigInt(cliffMonths) * 30n * 86400n;
        const vestingSec = BigInt(vestingMonths) * 30n * 86400n;

        await grantVesting(
          CONTRACTS.svt,
          evmAddress,
          amount,
          cliffSec,
          vestingSec,
        );
      }

      setSuccess(
        `ESOP grant of ${totalShares.toLocaleString()} shares created successfully${evmAddress ? " (on-chain vesting scheduled)" : ""}.`,
      );
      setStep(0);
      await fetchShareholders();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Grant failed";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke(grant: ActiveGrant) {
    if (
      !confirm(
        `Revoke vesting for ${grant.shareholder.name}? This cannot be undone.`,
      )
    ) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      let walletAddr = account;
      if (!walletAddr) {
        walletAddr = await connectWallet();
        setAccount(walletAddr);
      }

      await revokeVesting(CONTRACTS.svt, grant.shareholder.evm_address!);
      setSuccess(`Vesting revoked for ${grant.shareholder.name}.`);
      await loadActiveGrants();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Revoke failed";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────

  const esopShareholders = shareholders.filter((s) => s.role === "esop");
  const totalShares = parseInt(grantConfig.totalShares) || 0;
  const cliffMonths = parseInt(grantConfig.cliffMonths) || 0;
  const vestingMonths = parseInt(grantConfig.vestingMonths) || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink-800">ESOP Vesting</h1>
          <p className="text-sm text-ink-500 mt-0.5">
            Grant and manage employee stock option plans with on-chain vesting.
          </p>
        </div>
        {step === 0 && (
          <button
            type="button"
            onClick={startWizard}
            className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 transition-colors cursor-pointer"
          >
            <Plus strokeWidth={1.75} className="h-4 w-4" />
            New ESOP Grant
          </button>
        )}
        {step > 0 && (
          <button
            type="button"
            onClick={() => setStep(0)}
            className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-surface-200 bg-white px-4 text-sm font-medium text-ink-600 hover:bg-surface-50 transition-colors cursor-pointer"
          >
            <X strokeWidth={1.75} className="h-3.5 w-3.5" />
            Cancel
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

      {/* Step indicator */}
      {step > 0 && (
        <div className="flex items-center gap-2">
          {[1, 2, 3].map((s) => (
            <React.Fragment key={s}>
              <div
                className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors",
                  step >= s
                    ? "bg-brand-600 text-white"
                    : "bg-surface-100 text-ink-400",
                )}
              >
                {s}
              </div>
              {s < 3 && (
                <div
                  className={cn(
                    "flex-1 h-0.5 rounded-full transition-colors",
                    step > s ? "bg-brand-400" : "bg-surface-200",
                  )}
                />
              )}
            </React.Fragment>
          ))}
          <span className="ml-3 text-sm text-ink-500">
            {step === 1
              ? "Select Employee"
              : step === 2
                ? "Configure Grant"
                : "Review & Confirm"}
          </span>
        </div>
      )}

      {/* ── Step 1: Select Employee ──────────────────────────────────── */}
      {step === 1 && (
        <div className="rounded-2xl border border-surface-200 bg-white overflow-hidden">
          <div className="px-6 py-4 border-b border-surface-200">
            <h2 className="text-base font-bold text-ink-800">
              Select Employee
            </h2>
          </div>

          {loading ? (
            <div className="px-6 py-12 text-center">
              <Loader2 className="h-6 w-6 text-ink-400 animate-spin mx-auto" />
            </div>
          ) : (
            <div className="divide-y divide-surface-100">
              {/* Add new employee option */}
              <button
                type="button"
                onClick={selectNewEmployee}
                className="w-full px-6 py-4 flex items-center gap-4 hover:bg-surface-50 transition-colors cursor-pointer text-left"
              >
                <div className="h-10 w-10 rounded-full bg-brand-50 border border-brand-100 flex items-center justify-center">
                  <UserPlus
                    strokeWidth={1.75}
                    className="h-5 w-5 text-brand-600"
                  />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-brand-700">
                    Add New Employee
                  </p>
                  <p className="text-xs text-ink-500">
                    Create a new ESOP participant
                  </p>
                </div>
                <ArrowRight
                  strokeWidth={1.75}
                  className="h-4 w-4 text-ink-400"
                />
              </button>

              {/* Existing ESOP shareholders */}
              {esopShareholders.length > 0 && (
                <div className="px-6 py-2 bg-surface-50">
                  <span className="text-xs font-medium text-ink-500 uppercase tracking-wider">
                    Existing ESOP Participants
                  </span>
                </div>
              )}
              {esopShareholders.map((sh) => (
                <button
                  key={sh.id}
                  type="button"
                  onClick={() => selectEmployee(sh)}
                  className="w-full px-6 py-4 flex items-center gap-4 hover:bg-surface-50 transition-colors cursor-pointer text-left"
                >
                  <div className="h-10 w-10 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center">
                    <Users
                      strokeWidth={1.75}
                      className="h-5 w-5 text-emerald-600"
                    />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-ink-800">
                      {sh.name}
                    </p>
                    <p className="text-xs text-ink-500">
                      {sh.email ?? "No email"}{" "}
                      {sh.evm_address
                        ? `| ${shortenAddress(sh.evm_address)}`
                        : "| No EVM address"}
                    </p>
                  </div>
                  <span className="text-sm font-medium text-ink-600 tabular-nums">
                    {sh.shares_held.toLocaleString()} shares
                  </span>
                  <ArrowRight
                    strokeWidth={1.75}
                    className="h-4 w-4 text-ink-400"
                  />
                </button>
              ))}

              {/* Other shareholders (not esop role) */}
              {shareholders.filter((s) => s.role !== "esop").length > 0 && (
                <div className="px-6 py-2 bg-surface-50">
                  <span className="text-xs font-medium text-ink-500 uppercase tracking-wider">
                    Other Shareholders
                  </span>
                </div>
              )}
              {shareholders
                .filter((s) => s.role !== "esop")
                .map((sh) => (
                  <button
                    key={sh.id}
                    type="button"
                    onClick={() => selectEmployee(sh)}
                    className="w-full px-6 py-4 flex items-center gap-4 hover:bg-surface-50 transition-colors cursor-pointer text-left"
                  >
                    <div className="h-10 w-10 rounded-full bg-surface-100 flex items-center justify-center">
                      <Users
                        strokeWidth={1.75}
                        className="h-5 w-5 text-ink-500"
                      />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-ink-800">
                        {sh.name}
                      </p>
                      <p className="text-xs text-ink-500">
                        {sh.role} | {sh.email ?? "No email"}
                      </p>
                    </div>
                    <ArrowRight
                      strokeWidth={1.75}
                      className="h-4 w-4 text-ink-400"
                    />
                  </button>
                ))}
            </div>
          )}
        </div>
      )}

      {/* ── Step 2: Configure Grant ──────────────────────────────────── */}
      {step === 2 && (
        <div className="rounded-2xl border border-surface-200 bg-white overflow-hidden">
          <div className="px-6 py-4 border-b border-surface-200 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="h-7 w-7 flex items-center justify-center rounded-lg text-ink-500 hover:text-ink-800 hover:bg-surface-100 transition-colors cursor-pointer"
            >
              <ChevronLeft strokeWidth={1.75} className="h-4 w-4" />
            </button>
            <h2 className="text-base font-bold text-ink-800">
              Configure Grant
              {selectedEmployee
                ? ` for ${selectedEmployee.name}`
                : isNewEmployee
                  ? " for New Employee"
                  : ""}
            </h2>
          </div>

          <div className="p-6 space-y-5">
            {/* New employee fields */}
            {isNewEmployee && (
              <div className="rounded-xl bg-surface-50 border border-surface-200 p-4 space-y-4">
                <p className="text-xs font-medium text-ink-600 uppercase tracking-wider">
                  Employee Details
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-ink-700 mb-1.5">
                      Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={newEmployee.name}
                      onChange={(e) =>
                        setNewEmployee({ ...newEmployee, name: e.target.value })
                      }
                      placeholder="e.g. Jane Smith"
                      className="w-full h-10 rounded-xl border border-surface-200 px-3 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-ink-700 mb-1.5">
                      Email
                    </label>
                    <input
                      type="email"
                      value={newEmployee.email}
                      onChange={(e) =>
                        setNewEmployee({
                          ...newEmployee,
                          email: e.target.value,
                        })
                      }
                      placeholder="jane@company.com"
                      className="w-full h-10 rounded-xl border border-surface-200 px-3 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-ink-700 mb-1.5">
                      EVM Address
                    </label>
                    <input
                      type="text"
                      value={newEmployee.evmAddress}
                      onChange={(e) =>
                        setNewEmployee({
                          ...newEmployee,
                          evmAddress: e.target.value,
                        })
                      }
                      placeholder="0x..."
                      className="w-full h-10 rounded-xl border border-surface-200 px-3 text-sm font-mono text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition-colors"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Grant parameters */}
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1.5">
                Total Shares to Grant{" "}
                <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                required
                value={grantConfig.totalShares}
                onChange={(e) =>
                  setGrantConfig({
                    ...grantConfig,
                    totalShares: e.target.value,
                  })
                }
                placeholder="e.g. 50000"
                className="w-full h-10 rounded-xl border border-surface-200 px-3 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition-colors"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1.5">
                  Cliff Period (months)
                </label>
                <input
                  type="number"
                  min="0"
                  max="48"
                  value={grantConfig.cliffMonths}
                  onChange={(e) =>
                    setGrantConfig({
                      ...grantConfig,
                      cliffMonths: e.target.value,
                    })
                  }
                  className="w-full h-10 rounded-xl border border-surface-200 px-3 text-sm text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1.5">
                  Vesting Period (months)
                </label>
                <input
                  type="number"
                  min="1"
                  max="120"
                  value={grantConfig.vestingMonths}
                  onChange={(e) =>
                    setGrantConfig({
                      ...grantConfig,
                      vestingMonths: e.target.value,
                    })
                  }
                  className="w-full h-10 rounded-xl border border-surface-200 px-3 text-sm text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1.5">
                  Start Date
                </label>
                <input
                  type="date"
                  value={grantConfig.startDate}
                  onChange={(e) =>
                    setGrantConfig({
                      ...grantConfig,
                      startDate: e.target.value,
                    })
                  }
                  className="w-full h-10 rounded-xl border border-surface-200 px-3 text-sm text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition-colors"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setStep(3)}
                disabled={
                  !grantConfig.totalShares ||
                  parseInt(grantConfig.totalShares) <= 0 ||
                  (isNewEmployee && !newEmployee.name.trim())
                }
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-600 px-6 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                Review
                <ArrowRight strokeWidth={1.75} className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 3: Review & Confirm ─────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-6">
          {/* Summary card */}
          <div className="rounded-2xl border border-surface-200 bg-white overflow-hidden">
            <div className="px-6 py-4 border-b border-surface-200 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="h-7 w-7 flex items-center justify-center rounded-lg text-ink-500 hover:text-ink-800 hover:bg-surface-100 transition-colors cursor-pointer"
              >
                <ChevronLeft strokeWidth={1.75} className="h-4 w-4" />
              </button>
              <h2 className="text-base font-bold text-ink-800">
                Review & Confirm
              </h2>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                <div className="rounded-xl bg-surface-50 border border-surface-200 p-4">
                  <p className="text-xs text-ink-500 mb-1">Employee</p>
                  <p className="text-sm font-bold text-ink-800">
                    {isNewEmployee
                      ? newEmployee.name
                      : selectedEmployee?.name}
                  </p>
                </div>
                <div className="rounded-xl bg-surface-50 border border-surface-200 p-4">
                  <p className="text-xs text-ink-500 mb-1">Total Shares</p>
                  <p className="text-sm font-bold text-ink-800">
                    {totalShares.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-xl bg-surface-50 border border-surface-200 p-4">
                  <p className="text-xs text-ink-500 mb-1">Cliff</p>
                  <p className="text-sm font-bold text-ink-800">
                    {cliffMonths} months
                  </p>
                </div>
                <div className="rounded-xl bg-surface-50 border border-surface-200 p-4">
                  <p className="text-xs text-ink-500 mb-1">Total Vesting</p>
                  <p className="text-sm font-bold text-ink-800">
                    {vestingMonths} months
                  </p>
                </div>
              </div>

              {/* Vesting schedule preview */}
              {totalShares > 0 && vestingMonths > 0 && (
                <div className="rounded-xl border border-surface-200 overflow-hidden">
                  <div className="px-4 py-3 bg-surface-50 border-b border-surface-200">
                    <p className="text-xs font-medium text-ink-600 uppercase tracking-wider">
                      Vesting Schedule
                    </p>
                  </div>
                  <VestingSchedulePreview
                    totalShares={totalShares}
                    cliffMonths={cliffMonths}
                    vestingMonths={vestingMonths}
                    startDate={grantConfig.startDate}
                  />
                </div>
              )}

              {/* On-chain note */}
              {((isNewEmployee && newEmployee.evmAddress) ||
                (!isNewEmployee && selectedEmployee?.evm_address)) && (
                <div className="mt-4 flex items-start gap-2 rounded-xl bg-brand-50 border border-brand-100 px-4 py-3 text-sm text-brand-700">
                  <Clock
                    strokeWidth={1.75}
                    className="h-4 w-4 shrink-0 mt-0.5"
                  />
                  <span>
                    On-chain vesting will be registered via MetaMask. You will be
                    prompted to approve the transaction.
                  </span>
                </div>
              )}

              <div className="flex items-center gap-3 mt-6">
                <button
                  type="button"
                  onClick={handleGrant}
                  disabled={submitting}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-600 px-6 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  {submitting ? (
                    <Loader2
                      strokeWidth={1.75}
                      className="h-4 w-4 animate-spin"
                    />
                  ) : (
                    <Check strokeWidth={1.75} className="h-4 w-4" />
                  )}
                  {submitting ? "Processing..." : "Grant ESOP"}
                </button>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={submitting}
                  className="h-10 px-5 rounded-xl border border-surface-200 text-sm font-medium text-ink-600 hover:bg-surface-50 transition-colors cursor-pointer"
                >
                  Back
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Active Grants View ───────────────────────────────────────── */}
      {step === 0 && (
        <div className="rounded-2xl border border-surface-200 bg-white overflow-hidden">
          <div className="px-6 py-4 border-b border-surface-200 flex items-center justify-between">
            <h2 className="text-base font-bold text-ink-800 flex items-center gap-2">
              <Clock strokeWidth={1.75} className="h-4 w-4 text-ink-500" />
              Active ESOP Grants
            </h2>
            {loadingGrants && (
              <Loader2
                strokeWidth={1.75}
                className="h-4 w-4 text-ink-400 animate-spin"
              />
            )}
          </div>

          {activeGrants.length === 0 && !loadingGrants ? (
            <div className="px-6 py-12 text-center">
              <Users
                strokeWidth={1.25}
                className="mx-auto h-10 w-10 text-ink-300 mb-3"
              />
              <p className="text-sm text-ink-500">
                No active ESOP grants. Click &quot;New ESOP Grant&quot; to create
                one.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-100 bg-surface-50">
                    <th className="text-left px-6 py-3 text-xs font-medium text-ink-500 uppercase tracking-wider">
                      Employee
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-ink-500 uppercase tracking-wider">
                      Total
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-ink-500 uppercase tracking-wider">
                      Vested
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-ink-500 uppercase tracking-wider">
                      Claimed
                    </th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-ink-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="text-right px-6 py-3 text-xs font-medium text-ink-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {activeGrants.map((grant) => {
                    const pctVested =
                      grant.vesting.totalAmount > 0n
                        ? Number(
                            (grant.vestedAmount * 100n) /
                              grant.vesting.totalAmount,
                          )
                        : 0;

                    return (
                      <tr
                        key={grant.shareholder.id}
                        className="border-b border-surface-100 last:border-b-0 hover:bg-surface-50/50 transition-colors"
                      >
                        <td className="px-6 py-3.5">
                          <p className="font-medium text-ink-800">
                            {grant.shareholder.name}
                          </p>
                          {grant.shareholder.evm_address && (
                            <p className="text-xs text-ink-400 font-mono mt-0.5">
                              {shortenAddress(grant.shareholder.evm_address)}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right tabular-nums font-medium text-ink-800">
                          {formatTokenAmount(
                            grant.vesting.totalAmount,
                            TOKEN_DECIMALS,
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right tabular-nums text-emerald-600 font-medium">
                          {formatTokenAmount(
                            grant.vestedAmount,
                            TOKEN_DECIMALS,
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right tabular-nums text-brand-600">
                          {formatTokenAmount(
                            grant.vesting.claimedAmount,
                            TOKEN_DECIMALS,
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <span
                            className={cn(
                              "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium",
                              grant.vesting.revoked
                                ? "bg-rose-100 text-rose-700"
                                : pctVested >= 100
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-brand-100 text-brand-700",
                            )}
                          >
                            {grant.vesting.revoked
                              ? "Revoked"
                              : pctVested >= 100
                                ? "Fully Vested"
                                : `${pctVested}% Vested`}
                          </span>
                        </td>
                        <td className="px-6 py-3.5 text-right">
                          {!grant.vesting.revoked && (
                            <button
                              type="button"
                              onClick={() => handleRevoke(grant)}
                              disabled={submitting}
                              className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-medium text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer disabled:opacity-50"
                              title="Revoke vesting"
                            >
                              <ShieldOff
                                strokeWidth={1.75}
                                className="h-3.5 w-3.5"
                              />
                              Revoke
                            </button>
                          )}
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

      {/* ── DB-only ESOP participants (no on-chain grant) ────────────── */}
      {step === 0 && esopShareholders.length > 0 && (
        <div className="rounded-2xl border border-surface-200 bg-white overflow-hidden">
          <div className="px-6 py-4 border-b border-surface-200">
            <h2 className="text-base font-bold text-ink-800">
              ESOP Participants (Database)
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-100 bg-surface-50">
                  <th className="text-left px-6 py-3 text-xs font-medium text-ink-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-ink-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-ink-500 uppercase tracking-wider">
                    Shares
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-ink-500 uppercase tracking-wider">
                    Vesting
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-ink-500 uppercase tracking-wider">
                    EVM Address
                  </th>
                </tr>
              </thead>
              <tbody>
                {esopShareholders.map((sh) => (
                  <tr
                    key={sh.id}
                    className="border-b border-surface-100 last:border-b-0 hover:bg-surface-50/50 transition-colors"
                  >
                    <td className="px-6 py-3 font-medium text-ink-800">
                      {sh.name}
                    </td>
                    <td className="px-4 py-3 text-ink-600">
                      {sh.email ?? "--"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-ink-800">
                      {sh.shares_held.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-ink-600">
                      {sh.vesting_months
                        ? `${sh.cliff_months ?? 0}m cliff / ${sh.vesting_months}m total`
                        : "--"}
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-xs text-ink-500">
                      {sh.evm_address
                        ? shortenAddress(sh.evm_address)
                        : "--"}
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
