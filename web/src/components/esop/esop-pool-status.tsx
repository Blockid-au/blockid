"use client";

import { Users, TrendingUp, Plus } from "lucide-react";

interface EsopPool {
  id: string;
  total_shares: number;
  allocated_shares: number;
  vesting_cliff_months: number;
  vesting_total_months: number;
  pool_pct?: number;
}

interface EsopPoolStatusProps {
  pool: EsopPool | null;
  onCreatePool?: () => void;
  onAddGrant?: () => void;
}

export function EsopPoolStatus({ pool, onCreatePool, onAddGrant }: EsopPoolStatusProps) {
  if (!pool) {
    return (
      <div className="rounded-xl border border-surface-200 bg-white p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="rounded-lg bg-brand-50 p-2">
            <Users className="h-5 w-5 text-brand-600" />
          </div>
          <div>
            <h3 className="font-semibold text-ink-900">ESOP Pool</h3>
            <p className="text-sm text-ink-500">No pool configured</p>
          </div>
        </div>
        <p className="text-sm text-ink-600 mb-4">
          Create a 12% ESOP pool to attract top talent with equity. Standard for investor-ready startups.
        </p>
        <button
          onClick={onCreatePool}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" />
          Create ESOP Pool
        </button>
      </div>
    );
  }

  const unallocated = pool.total_shares - pool.allocated_shares;
  const allocatedPct = pool.total_shares > 0
    ? Math.round((pool.allocated_shares / pool.total_shares) * 100)
    : 0;

  return (
    <div className="rounded-xl border border-surface-200 bg-white p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-brand-50 p-2">
            <Users className="h-5 w-5 text-brand-600" />
          </div>
          <div>
            <h3 className="font-semibold text-ink-900">ESOP Pool</h3>
            <p className="text-sm text-ink-500">
              {pool.vesting_cliff_months}yr cliff · {Math.round(pool.vesting_total_months / 12)}yr vesting
            </p>
          </div>
        </div>
        <button
          onClick={onAddGrant}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" />
          Add Grant
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-5">
        <div className="rounded-lg bg-surface-50 p-3">
          <p className="text-xs text-ink-500 uppercase tracking-wider mb-1">Total Pool</p>
          <p className="text-xl font-bold text-ink-900">{pool.total_shares.toLocaleString()}</p>
          <p className="text-xs text-ink-500">shares ({pool.pool_pct ?? 12}%)</p>
        </div>
        <div className="rounded-lg bg-surface-50 p-3">
          <p className="text-xs text-ink-500 uppercase tracking-wider mb-1">Allocated</p>
          <p className="text-xl font-bold text-ink-900">{pool.allocated_shares.toLocaleString()}</p>
          <p className="text-xs text-ink-500">{allocatedPct}% of pool</p>
        </div>
        <div className="rounded-lg bg-surface-50 p-3">
          <p className="text-xs text-ink-500 uppercase tracking-wider mb-1">Available</p>
          <p className="text-xl font-bold text-emerald-600">{unallocated.toLocaleString()}</p>
          <p className="text-xs text-ink-500">{100 - allocatedPct}% remaining</p>
        </div>
      </div>

      <div>
        <div className="flex justify-between text-xs text-ink-500 mb-1.5">
          <span>Pool utilisation</span>
          <span>{allocatedPct}%</span>
        </div>
        <div className="h-2 rounded-full bg-surface-100">
          <div
            className="h-2 rounded-full bg-brand-500 transition-all"
            style={{ width: `${allocatedPct}%` }}
          />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 text-xs text-ink-500">
        <TrendingUp className="h-3.5 w-3.5" />
        <span>Strike price A$0.10 · Australian ESS Part 7A compliant</span>
      </div>
    </div>
  );
}
