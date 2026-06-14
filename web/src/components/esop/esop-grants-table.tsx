"use client";

import { CheckCircle2, Clock, XCircle, AlertCircle } from "lucide-react";

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

interface EsopGrantsTableProps {
  grants: EsopGrant[];
}

const STATUS_CONFIG = {
  active: { label: "Active", icon: CheckCircle2, class: "text-emerald-600 bg-emerald-50" },
  pending: { label: "Pending", icon: Clock, class: "text-amber-600 bg-amber-50" },
  exercised: { label: "Exercised", icon: CheckCircle2, class: "text-brand-600 bg-brand-50" },
  forfeited: { label: "Forfeited", icon: XCircle, class: "text-red-600 bg-red-50" },
  expired: { label: "Expired", icon: AlertCircle, class: "text-ink-500 bg-surface-100" },
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
}

export function EsopGrantsTable({ grants }: EsopGrantsTableProps) {
  if (grants.length === 0) {
    return (
      <div className="rounded-xl border border-surface-200 bg-surface-50 p-8 text-center">
        <p className="text-sm font-medium text-ink-700 mb-1">No grants yet</p>
        <p className="text-sm text-ink-500">Add your first ESOP grant to attract and retain key talent.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-surface-200 bg-white overflow-hidden">
      <div className="px-5 py-4 border-b border-surface-100">
        <h3 className="font-semibold text-ink-900">Option Grants</h3>
        <p className="text-sm text-ink-500 mt-0.5">{grants.length} grant{grants.length !== 1 ? "s" : ""}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-50 text-xs uppercase tracking-wider text-ink-500">
            <tr>
              <th className="px-5 py-3 text-left">Grantee</th>
              <th className="px-4 py-3 text-left">Role</th>
              <th className="px-4 py-3 text-right">Shares</th>
              <th className="px-4 py-3 text-right">Vested</th>
              <th className="px-4 py-3 text-left">Cliff Date</th>
              <th className="px-4 py-3 text-left">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100">
            {grants.map((grant) => {
              const vestedPct = grant.total_shares > 0
                ? Math.round((grant.vested_shares / grant.total_shares) * 100)
                : 0;
              const cfg = STATUS_CONFIG[grant.status] ?? STATUS_CONFIG.pending;
              const Icon = cfg.icon;
              const cliffDate = grant.cliff_date
                ? formatDate(grant.cliff_date)
                : (() => {
                    const d = new Date(grant.grant_date);
                    d.setMonth(d.getMonth() + grant.cliff_months);
                    return formatDate(d.toISOString());
                  })();

              return (
                <tr key={grant.id} className="hover:bg-surface-50 transition-colors">
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-ink-900">{grant.grantee_name}</p>
                    {grant.grantee_email && (
                      <p className="text-xs text-ink-400">{grant.grantee_email}</p>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-ink-600 capitalize">
                    {grant.grantee_role ?? "—"}
                  </td>
                  <td className="px-4 py-3.5 text-right font-medium text-ink-900">
                    {grant.total_shares.toLocaleString()}
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-ink-700 font-medium">{vestedPct}%</span>
                      <div className="w-16 h-1.5 rounded-full bg-surface-100">
                        <div
                          className="h-1.5 rounded-full bg-brand-500"
                          style={{ width: `${vestedPct}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-ink-600">{cliffDate}</td>
                  <td className="px-4 py-3.5">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.class}`}>
                      <Icon className="h-3 w-3" />
                      {cfg.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
