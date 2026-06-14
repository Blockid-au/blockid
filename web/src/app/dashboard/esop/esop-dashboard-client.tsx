"use client";

import { useState, useEffect, useCallback } from "react";
import { EsopPoolStatus, EsopGrantsTable, EsopGrantForm } from "@/components/esop";

interface EsopPool {
  id: string;
  total_shares: number;
  allocated_shares: number;
  vesting_cliff_months: number;
  vesting_total_months: number;
  pool_pct?: number;
}

interface EsopGrant {
  id: string;
  grantee_name: string;
  grantee_email?: string;
  grantee_role?: string;
  total_shares: number;
  strike_price_cents: number;
  grant_date: string;
  cliff_date?: string;
  cliff_months: number;
  total_months: number;
  vested_shares: number;
  status: "pending" | "active" | "exercised" | "forfeited" | "expired";
}

export function EsopDashboardClient() {
  const [pool, setPool] = useState<EsopPool | null>(null);
  const [grants, setGrants] = useState<EsopGrant[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGrantForm, setShowGrantForm] = useState(false);
  const [showCreatePool, setShowCreatePool] = useState(false);
  const [creatingPool, setCreatingPool] = useState(false);

  const fetchData = useCallback(async () => {
    const [poolRes, grantsRes] = await Promise.all([
      fetch("/api/esop/pool").then((r) => r.json()),
      fetch("/api/esop/grants").then((r) => r.json()),
    ]);
    if (poolRes.ok) setPool(poolRes.pool);
    if (grantsRes.ok) setGrants(grantsRes.grants);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleCreatePool() {
    setCreatingPool(true);
    const res = await fetch("/api/esop/pool", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ total_shares: 12000, vesting_cliff_months: 12, vesting_total_months: 48 }),
    });
    const data = await res.json();
    if (data.ok) {
      setPool(data.pool);
      setShowCreatePool(false);
    }
    setCreatingPool(false);
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-40 rounded-xl bg-surface-100" />
        <div className="h-64 rounded-xl bg-surface-100" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <EsopPoolStatus
        pool={pool}
        onCreatePool={handleCreatePool}
        onAddGrant={() => setShowGrantForm(true)}
      />

      {pool && (
        <EsopGrantsTable grants={grants} />
      )}

      {showGrantForm && pool && (
        <EsopGrantForm
          poolId={pool.id}
          availableShares={pool.total_shares - pool.allocated_shares}
          onSuccess={() => {
            setShowGrantForm(false);
            fetchData();
          }}
          onClose={() => setShowGrantForm(false)}
        />
      )}

      {showCreatePool && !pool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="font-semibold text-ink-900 mb-2">Create ESOP Pool</h3>
            <p className="text-sm text-ink-600 mb-4">
              This will create a standard 12,000 share ESOP pool (12% of 100,000 total shares)
              with 4-year vesting and 1-year cliff.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCreatePool(false)}
                className="flex-1 rounded-lg border border-surface-200 py-2 text-sm text-ink-600 hover:bg-surface-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreatePool}
                disabled={creatingPool}
                className="flex-1 rounded-lg bg-brand-600 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
              >
                {creatingPool ? "Creating..." : "Create Pool"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
