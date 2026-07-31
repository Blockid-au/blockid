"use client";

import * as React from "react";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Copy,
  Loader2,
  RefreshCw,
  XCircle,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AuditResult, PlanAuditRow } from "@/lib/stripe-pricing-audit";

interface Props {
  initialAudit: AuditResult;
}

const STATUS_META: Record<PlanAuditRow["status"], { label: string; color: string; bg: string; icon: typeof CheckCircle2 }> = {
  match: { label: "Match", color: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/20", icon: CheckCircle2 },
  drift: { label: "DRIFT", color: "text-red-700 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/20", icon: AlertTriangle },
  archived: { label: "Archived", color: "text-amber-700 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/20", icon: Archive },
  missing_price_id: { label: "Missing ID", color: "text-amber-700 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/20", icon: AlertTriangle },
  stripe_not_configured: { label: "Stripe off", color: "text-muted-foreground", bg: "bg-muted/30", icon: XCircle },
  stripe_lookup_failed: { label: "Lookup fail", color: "text-red-700 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/20", icon: XCircle },
};

function fmtAud(cents: number | null): string {
  if (cents == null) return "—";
  return `A$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

export function StripeSyncClient({ initialAudit }: Props) {
  const [audit, setAudit] = React.useState<AuditResult>(initialAudit);
  const [refreshing, setRefreshing] = React.useState(false);
  const [creating, setCreating] = React.useState<string | null>(null);
  const [results, setResults] = React.useState<Record<string, { ok: boolean; newPriceId?: string; envVarName?: string; error?: string }>>({});

  const refresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/stripe-sync", { cache: "no-store" });
      const data = await res.json() as { ok: boolean; rows?: PlanAuditRow[] } & AuditResult;
      if (data.ok && data.rows) {
        setAudit({
          rows: data.rows,
          generatedAt: data.generatedAt,
          hasDrift: data.hasDrift,
          hasMissingIds: data.hasMissingIds,
          stripeConfigured: data.stripeConfigured,
        });
      }
    } finally {
      setRefreshing(false);
    }
  }, []);

  const createPrice = React.useCallback(async (planId: string) => {
    setCreating(planId);
    try {
      const res = await fetch("/api/admin/stripe-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const data = await res.json() as { ok: boolean; newPriceId?: string; envVarName?: string; instruction?: string; error?: string };
      setResults((prev) => ({ ...prev, [planId]: data }));
      if (data.ok) {
        // re-run audit so the row updates
        void refresh();
      }
    } finally {
      setCreating(null);
    }
  }, [refresh]);

  return (
    <div className="space-y-6">
      {/* Status banner */}
      <div className={cn(
        "rounded-xl border p-4 flex items-start gap-3",
        audit.hasDrift
          ? "border-red-200 dark:border-red-800/40 bg-red-50/50 dark:bg-red-950/15"
          : audit.hasMissingIds
            ? "border-amber-200 dark:border-amber-700/40 bg-amber-50/50 dark:bg-amber-950/15"
            : "border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/50 dark:bg-emerald-950/15"
      )}>
        {audit.hasDrift ? <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
          : audit.hasMissingIds ? <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
          : <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />}
        <div className="flex-1">
          <p className="text-sm font-bold">
            {audit.hasDrift ? "Drift detected" : audit.hasMissingIds ? "Missing price IDs" : "All plans match Stripe"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {audit.hasDrift && "One or more plans have a different price in Stripe than in platform-config. Create a fresh Stripe Price for each drifted plan below."}
            {!audit.hasDrift && audit.hasMissingIds && "Some plans don't have a Stripe Price ID env var set. Customers cannot check out for these plans."}
            {!audit.hasDrift && !audit.hasMissingIds && "All in-app prices match Stripe. No action needed."}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">Last checked: {new Date(audit.generatedAt).toLocaleString("en-AU")}</p>
        </div>
        <button
          onClick={() => void refresh()}
          disabled={refreshing}
          className="text-xs text-blue-600 hover:underline flex items-center gap-1 shrink-0"
        >
          {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Re-audit
        </button>
      </div>

      {/* Plan table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Plan</th>
              <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground">Expected (config)</th>
              <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground">Stripe price</th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Stripe ID</th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Status</th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {audit.rows.map((row) => {
              const meta = STATUS_META[row.status];
              const Icon = meta.icon;
              const result = results[row.planId];
              const needsCreate = row.status === "drift" || row.status === "archived";
              return (
                <React.Fragment key={row.planId}>
                  <tr className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold">{row.label}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">{row.planId}</p>
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-mono font-bold">{fmtAud(row.expectedCents)}</td>
                    <td className={cn("px-4 py-3 text-right text-sm font-mono", row.status === "drift" ? "text-red-600 font-bold" : "")}>
                      {row.stripeUnitAmount != null ? `${row.stripeCurrency?.toUpperCase()} ${fmtAud(row.stripeUnitAmount)}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-muted-foreground truncate max-w-[180px]">
                      {row.stripePriceId ? (
                        <span title={row.stripePriceId} className="cursor-help">{row.stripePriceId.slice(0, 16)}…</span>
                      ) : <span className="italic">unset</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded", meta.bg, meta.color)}>
                        <Icon className="h-3 w-3" />
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {needsCreate ? (
                        <button
                          onClick={() => void createPrice(row.planId)}
                          disabled={creating === row.planId}
                          className="inline-flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-2.5 py-1 rounded font-medium"
                        >
                          {creating === row.planId ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                          Create new Price
                        </button>
                      ) : row.status === "missing_price_id" ? (
                        <span className="text-[11px] text-amber-700 dark:text-amber-400">Set env var</span>
                      ) : null}
                    </td>
                  </tr>
                  {/* Inline remediation row */}
                  <tr className="bg-muted/10">
                    <td colSpan={6} className="px-4 pb-3 text-[11px] text-muted-foreground leading-relaxed">
                      {row.remediation}
                      {result?.ok && result.newPriceId && (
                        <div className="mt-2 p-2 rounded bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 text-emerald-900 dark:text-emerald-300">
                          <p className="font-bold mb-1">New Price created ✓</p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <code className="text-[10px] bg-white dark:bg-black/20 px-1.5 py-0.5 rounded">{result.envVarName}={result.newPriceId}</code>
                            <button
                              onClick={() => navigator.clipboard.writeText(`${result.envVarName}=${result.newPriceId}`)}
                              className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5"
                            >
                              <Copy className="h-2.5 w-2.5" /> Copy
                            </button>
                          </div>
                          <p className="text-[10px] mt-1">Update .env, redeploy, then archive the old Stripe Price.</p>
                        </div>
                      )}
                      {result && !result.ok && (
                        <div className="mt-2 p-2 rounded bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/40 text-red-700 dark:text-red-300 text-[11px]">
                          ✗ {result.error}
                        </div>
                      )}
                    </td>
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Workflow guide */}
      <div className="rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground space-y-2">
        <p className="font-semibold text-foreground">When you bump a plan price in platform-config.ts:</p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Commit the platform-config + pricing-data + plans + email + investors page updates (all reflect the new in-app A$).</li>
          <li>Deploy. Customer-facing pages now show the new A$.</li>
          <li>Come here. Stripe row will show <strong className="text-red-600">DRIFT</strong>.</li>
          <li>Click <em>Create new Price</em> for each drifted row. The new <code>price_xxx</code> ID appears below the row.</li>
          <li>Paste the new ID into the matching <code>STRIPE_PRICE_*</code> env var (in .env locally + production secrets).</li>
          <li>Redeploy.</li>
          <li>Re-audit. All rows should be <strong className="text-emerald-600">Match</strong>.</li>
          <li>(Optional) Archive the old Stripe Price in the Stripe dashboard so it stops appearing in reports.</li>
        </ol>
      </div>
    </div>
  );
}
