import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Award, BarChart3, ExternalLink, RefreshCw } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { buildExperimentReport, FOUNDING_PRICE_EXPERIMENT } from "@/lib/ab-pricing";

export const metadata: Metadata = {
  title: "Pricing A/B Test — Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function fmtPct(n: number): string {
  return `${n.toFixed(2)}%`;
}
function fmtAud(n: number): string {
  return `A$${n.toLocaleString("en-AU", { maximumFractionDigits: 2 })}`;
}

export default async function PricingTestPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/dashboard/admin/pricing-test");
  if (user.role !== "admin") redirect("/dashboard");

  const exp = FOUNDING_PRICE_EXPERIMENT;
  const report = await buildExperimentReport(exp.id);

  const leader = report
    ? [...report.variants].sort((a, b) => b.rps - a.rps)[0]
    : null;

  return (
    <WorkspaceLayout user={user}>
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <Link href="/dashboard/admin/30day" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
            <ArrowLeft className="h-3 w-3" /> Back
          </Link>
          <h1 className="text-2xl font-bold">{exp.label}</h1>
          <p className="text-sm text-muted-foreground max-w-3xl leading-relaxed">
            Live A/B test for the Founding 100 price. Variants are assigned by deterministic hash of the visitor's anonymous_id cookie — the same visitor always sees the same price (until the cookie is cleared).
            Pick the variant with the highest <strong>revenue per session (RPS)</strong> — it captures both conversion and price together.
          </p>
          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
            <span>Experiment ID: <code className="bg-muted px-1.5 py-0.5 rounded">{exp.id}</code></span>
            <span>Started: {exp.startedAt}</span>
            <span>Ends: {exp.endsAt ?? "—"}</span>
            <span>Surface: <code className="bg-muted px-1.5 py-0.5 rounded">{exp.surface}</code></span>
            <span>Status: <span className="text-emerald-600 font-medium">{exp.active ? "Active" : "Paused"}</span></span>
            <Link href="/dashboard/admin/pricing-test" className="inline-flex items-center gap-1 text-blue-600 hover:underline">
              <RefreshCw className="h-3 w-3" /> Refresh
            </Link>
          </div>
        </div>

        {/* Summary */}
        {report && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Exposures</p>
              <p className="text-2xl font-bold">{report.totalExposures.toLocaleString()}</p>
              <p className="text-[11px] text-muted-foreground">visitors saw a variant</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Paid</p>
              <p className="text-2xl font-bold text-emerald-600">{report.totalPaid.toLocaleString()}</p>
              <p className="text-[11px] text-muted-foreground">checkouts completed</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Revenue</p>
              <p className="text-2xl font-bold text-emerald-700">{fmtAud(report.totalRevenueAud)}</p>
              <p className="text-[11px] text-muted-foreground">last 90 days</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Leader (by RPS)</p>
              <p className="text-2xl font-bold text-blue-600">
                {leader && leader.exposures > 0 ? leader.priceAud : "—"}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {leader && leader.exposures > 0 ? `${fmtAud(leader.rps)}/session` : "no data yet"}
              </p>
            </div>
          </div>
        )}

        {/* Variant table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Variant</th>
                <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground">Price</th>
                <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground">Weight</th>
                <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground">Exposures</th>
                <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground">Started CO</th>
                <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground">Paid</th>
                <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground">Conv %</th>
                <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground">Revenue</th>
                <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground">RPS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {exp.variants.map((v) => {
                const result = report?.variants.find((r) => r.variantId === v.id);
                const isLeader = leader?.variantId === v.id && (leader?.exposures ?? 0) > 0;
                return (
                  <tr key={v.id} className={isLeader ? "bg-emerald-50/40 dark:bg-emerald-950/15" : "hover:bg-muted/20"}>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        {isLeader && <Award className="h-3.5 w-3.5 text-emerald-600" />}
                        <div>
                          <p className="text-sm font-semibold">{v.id}</p>
                          <p className="text-[11px] text-muted-foreground">{v.description}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right text-sm font-mono font-bold">{v.priceAud}</td>
                    <td className="px-4 py-2 text-right text-xs text-muted-foreground">{Math.round(v.weight * 100)}%</td>
                    <td className="px-4 py-2 text-right text-sm tabular-nums">{result?.exposures.toLocaleString() ?? 0}</td>
                    <td className="px-4 py-2 text-right text-sm tabular-nums">{result?.checkoutStarted.toLocaleString() ?? 0}</td>
                    <td className="px-4 py-2 text-right text-sm font-bold text-emerald-600 tabular-nums">{result?.paid.toLocaleString() ?? 0}</td>
                    <td className="px-4 py-2 text-right text-sm tabular-nums">{result ? fmtPct(result.conversionPct) : "—"}</td>
                    <td className="px-4 py-2 text-right text-sm font-mono">{result ? fmtAud(result.revenueAud) : "A$0"}</td>
                    <td className="px-4 py-2 text-right text-sm font-mono font-bold text-blue-600">{result ? fmtAud(result.rps) : "A$0"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Explainer */}
        <div className="rounded-xl border border-dashed border-border bg-muted/10 p-4 text-xs text-muted-foreground space-y-2">
          <p className="font-semibold text-foreground flex items-center gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" />
            How to read this
          </p>
          <ul className="space-y-1">
            <li>• <strong>Exposures</strong>: visitors who saw the founding-50 page and were bucketed into this variant.</li>
            <li>• <strong>Conv %</strong>: paid ÷ exposures. Higher means the price didn't scare them off.</li>
            <li>• <strong>RPS (revenue per session)</strong>: total revenue ÷ exposures. <em>This is the metric you optimise</em> — a higher price with lower conversion can still win.</li>
            <li>• Significance: pick a winner only when each variant has ≥100 exposures and the leader's RPS is ≥20% above the runner-up.</li>
          </ul>
          <p className="mt-2">
            To activate the winning variant permanently, update <code className="bg-muted px-1 rounded">platform-config.ts → founding_price_cents</code> and run the Stripe sync to create a matching Price ID. <Link href="/dashboard/admin/stripe-sync" className="text-blue-600 hover:underline inline-flex items-center gap-0.5">Stripe Sync <ExternalLink className="h-3 w-3" /></Link>.
          </p>
        </div>

        {/* Schema reminder */}
        <details className="rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground">
          <summary className="font-semibold text-foreground cursor-pointer">DB schema (run once)</summary>
          <pre className="mt-2 overflow-x-auto text-[11px] bg-muted/30 p-2 rounded">{`CREATE TABLE ab_pricing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ts timestamptz NOT NULL DEFAULT now(),
  experiment_id text NOT NULL,
  variant_id text NOT NULL,
  event_type text NOT NULL,  -- 'exposure' | 'checkout_started' | 'paid'
  identity_hash text NOT NULL,
  amount_cents integer,
  stripe_session_id text
);
CREATE INDEX ab_pricing_events_exp_var ON ab_pricing_events (experiment_id, variant_id, ts);`}</pre>
        </details>
      </div>
    </WorkspaceLayout>
  );
}
