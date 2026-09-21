// /admin/traction — COO / CFO tile (G14-S33).
//
// Renders content/reports/traction-snapshot.json (written daily 03:20 UTC by
// /api/cron/traction-snapshot) as KPI tiles: users (QA / seeded / erased
// accounts excluded, shown as a count), analyses, Trust Business Reports,
// evaluators by plan, assessments, share links / API keys / webhooks, the
// MRR diff (subscription roll-up vs trailing-30-day revenue_events cash +
// Stripe head-count reconcile), the 7-day server-event funnel and every
// warning the builder recorded. Nothing is computed here — every figure is
// read from the file so this page shows exactly what the investor update
// and /api/platform-stats show. `null` renders as "n/a", never 0.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";

import { ADMIN_EMAIL, getCurrentUser } from "@/lib/auth";
import { tractionSnapshotSchema, type TractionSnapshot } from "@/lib/traction/snapshot";
import { readTractionSnapshotRaw, tractionStatusFrom, type TractionStatus } from "@/lib/traction/status";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Traction — BlockID Admin",
  robots: { index: false, follow: false },
};

function n(v: number | null | undefined): string {
  return typeof v === "number" && Number.isFinite(v) ? v.toLocaleString("en-AU") : "n/a";
}

function aud(cents: number | null | undefined): string {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return "n/a";
  return (cents / 100).toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
}

function sumRecord(r: Record<string, number>): number {
  return Object.values(r).reduce((a, b) => a + b, 0);
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-surface-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-ink-900">{value}</p>
      {sub ? <p className="mt-1 text-xs text-ink-500">{sub}</p> : null}
    </div>
  );
}

function PlanTable({ title, rows, note }: { title: string; rows: Record<string, number>; note: string }) {
  const entries = Object.entries(rows).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return (
    <section className="rounded-2xl border border-surface-200 bg-white p-5">
      <p className="text-sm font-medium text-ink-800">{title}</p>
      <p className="mt-1 text-xs text-ink-500">{note}</p>
      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-ink-500">None recorded.</p>
      ) : (
        <table className="mt-3 w-full text-sm">
          <tbody className="text-ink-800 [&>tr:nth-child(even)]:bg-surface-sunken">
            {entries.map(([k, v]) => (
              <tr key={k} className="border-t border-surface-100">
                <td className="py-1.5 pr-4"><code>{k}</code></td>
                <td className="py-1.5 text-right tabular-nums">{v.toLocaleString("en-AU")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function StatusBadge({ status }: { status: TractionStatus }) {
  const tone =
    status === "ok"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : status === "stale"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-red-200 bg-red-50 text-red-800";
  return <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${tone}`}>snapshot: {status}</span>;
}

function MrrDiff({ mrr }: { mrr: TractionSnapshot["mrr_aud_cents"] }) {
  const a = mrr.from_subscriptions;
  const b = mrr.from_revenue_events;
  const diff = typeof a === "number" && typeof b === "number" ? a - b : null;
  const reconciled = mrr.stripe_reconciled === null ? "n/a (Stripe not configured or unreachable)" : mrr.stripe_reconciled ? "yes — Stripe active-subscription count matches the DB" : "NO — Stripe and subscription_trial_state disagree (see warnings)";
  return (
    <section className="rounded-2xl border border-surface-200 bg-white p-5">
      <p className="text-sm font-medium text-ink-800">MRR — two sources, one diff</p>
      <p className="mt-1 text-xs text-ink-500">
        Subscriptions = active <code>subscription_trial_state</code> × plan monthly price (yearly ÷ 12), QA excluded. Revenue events = trailing-30-day
        <code> subscribe</code> + <code>renewal</code> net cash. They diverge when an annual up-front lands or a trial converts mid-window.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Tile label="MRR (subscriptions)" value={aud(a)} sub="Roll-up of active subs" />
        <Tile label="MRR (revenue events)" value={aud(b)} sub="Cash, last 30 days" />
        <Tile label="Diff" value={diff === null ? "n/a" : `${diff >= 0 ? "+" : "−"}${aud(Math.abs(diff))}`} sub="subscriptions − revenue events" />
      </div>
      <p className="mt-3 text-sm text-ink-700">
        Stripe reconciled: <span className="font-medium">{reconciled}</span>
      </p>
    </section>
  );
}

export default async function TractionAdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/admin/traction");
  const isAdmin = user.email === ADMIN_EMAIL || user.role === "admin";
  if (!isAdmin) redirect("/admin");

  const raw = await readTractionSnapshotRaw(process.cwd());
  const status = tractionStatusFrom(raw);
  const parsed = raw ? tractionSnapshotSchema.safeParse(raw) : null;
  const snap: TractionSnapshot | null = parsed?.success ? parsed.data : null;

  return (
    <div className="min-h-svh bg-surface-100 px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">COO · CFO</p>
            <h1 className="text-2xl font-bold text-ink-900">Traction snapshot</h1>
            <p className="mt-1 text-sm text-ink-500">
              What the investor update, the deck provenance table and <code>/api/platform-stats</code> quote. Daily 03:20 UTC ·{" "}
              <code>content/reports/traction-snapshot.json</code>.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-500">
              <StatusBadge status={status} />
              {snap ? <span>generated {new Date(snap.generated_at).toLocaleString("en-AU", { timeZone: "Australia/Sydney" })} AEST</span> : null}
              {snap?.git_sha ? <span>· sha <code>{snap.git_sha.slice(0, 10)}</code></span> : null}
            </div>
          </div>
          <div className="flex gap-2">
            <Link
              href="/admin/pricing-metrics"
              className="rounded-lg border border-surface-300 bg-white px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-surface-200"
            >
              Pricing metrics
            </Link>
            <Link
              href="/admin"
              className="rounded-lg border border-surface-300 bg-white px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-surface-200"
            >
              ← Admin home
            </Link>
          </div>
        </header>

        {!snap ? (
          <section className="rounded-2xl border border-line-subtle border-l-4 border-l-warn bg-surface-sunken p-5 text-sm text-amber-900">
            <p className="font-medium">No readable snapshot yet.</p>
            <p className="mt-1">
              {raw && parsed && !parsed.success
                ? "The file exists but does not match the current schema — re-run the cron."
                : "The cron has not written content/reports/traction-snapshot.json on this host."}{" "}
              Run it now: <code>curl -H &quot;Authorization: Bearer $CRON_SECRET&quot; -X POST https://blockid.au/api/cron/traction-snapshot</code> (or{" "}
              <code>?dry=1</code> to preview).
            </p>
          </section>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Tile label="Users" value={n(snap.users.total)} sub={`excluded QA accounts: ${n(snap.users.excluded_count)}`} />
              <Tile label="Founders" value={n(snap.users.founders)} sub="Non-evaluator accounts" />
              <Tile label="Evaluators" value={n(sumRecord(snap.users.evaluators_by_plan))} sub="Scout / Firm / Program seats (any status)" />
              <Tile label="Paying evaluators" value={n(sumRecord(snap.evaluators.paying_by_plan))} sub={`${n(snap.evaluators.trials)} on trial`} />
              <Tile label="SVI analyses" value={n(snap.analyses.svi_analyses)} sub={`${n(snap.analyses.analyses)} intake runs`} />
              <Tile label="Guest A$3 reports" value={n(snap.analyses.guest_analyses_paid)} sub="paid / analysing / delivered" />
              <Tile label="TBR purchased" value={n(snap.tbr.purchased)} sub={`${n(snap.tbr.shared)} shared · ${n(snap.tbr.views)} views`} />
              <Tile label="Reports / evaluator (p50)" value={n(snap.evaluators.reports_per_evaluator_p50)} sub="evaluation_reports per seat" />
              <Tile label="Assessments" value={n(snap.assessments.submitted)} sub={`${n(snap.assessments.shared_with_founder)} shared with founder`} />
              <Tile label="Share links" value={n(snap.share_links)} sub="share_packages" />
              <Tile label="API keys" value={n(snap.api_keys_active)} sub="active" />
              <Tile label="Webhooks" value={n(snap.webhooks_active)} sub="active endpoints" />
            </section>

            <MrrDiff mrr={snap.mrr_aud_cents} />

            <div className="grid gap-3 lg:grid-cols-3">
              <PlanTable title="Evaluators by plan" rows={snap.users.evaluators_by_plan} note="Every evaluator seat by app_users.plan (trialing, active and lapsed)." />
              <PlanTable title="Paying by plan" rows={snap.evaluators.paying_by_plan} note="Active subscription_trial_state rows on an evaluator plan." />
              <PlanTable title="Funnel — last 7 days" rows={snap.funnel_7d} note="Top server-side analytics_events names (QA users excluded)." />
            </div>

            <section className="rounded-2xl border border-surface-200 bg-white p-5" data-testid="traction-funnel-v2">
              <p className="text-sm font-medium text-ink-800">Step funnel — last 7 days (G16-A)</p>
              <p className="mt-1 text-xs text-ink-500">
                Distinct founders per step from the same reducer as <code>scripts/funnel-report.mjs</code> (QA rows excluded). Conversions, gates and daily rows:{" "}
                <Link href="/admin/funnel" className="underline">/admin/funnel</Link>.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <Tile label="Sign-ups" value={n(snap.funnel_7d_v2.signups)} />
                <Tile label="Analyses" value={n(snap.funnel_7d_v2.analyses)} sub={`${n(snap.funnel_7d_v2.first_analyses)} first`} />
                <Tile label="Report views" value={n(snap.funnel_7d_v2.report_views)} />
                <Tile label="Paywall views" value={n(snap.funnel_7d_v2.paywall_views)} />
                <Tile label="Checkouts" value={n(snap.funnel_7d_v2.checkouts)} />
                <Tile label="Paid" value={n(snap.funnel_7d_v2.paid)} />
              </div>
            </section>

            <section className="rounded-2xl border border-surface-200 bg-white p-5 text-sm">
              <p className="font-medium text-ink-800">
                Warnings <span className="ml-1 rounded-full bg-surface-200 px-2 py-0.5 text-xs text-ink-600">{snap.warnings.length}</span>
              </p>
              {snap.warnings.length === 0 ? (
                <p className="mt-2 text-ink-500">Every query answered — no figure is null for a data reason.</p>
              ) : (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-700">
                  {snap.warnings.map((w, i) => (
                    <li key={i}><code className="text-xs">{w}</code></li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-ink-500">
                A warning means that figure is <em>n/a</em> in the investor update too — never a silent 0. Missing tables (for example{" "}
                <code>evaluation_assessments</code> before G13 S-D2) are expected until their sprint ships.
              </p>
            </section>

            <section className="rounded-2xl border border-surface-200 bg-white p-5 text-sm text-ink-600">
              <p className="font-medium text-ink-800">Data sources</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>Users / founders / evaluators: <code>app_users</code> minus <code>QA_ACCOUNT_EMAIL_PATTERNS</code> (qa-*, qa-live-*, erased tombstones)</li>
                <li>Analyses: <code>svi_analyses</code>, <code>analyses</code>, <code>guest_analyses</code> (paid / analyzing / delivered)</li>
                <li>TBR: <code>report_orders</code> (PAID→SHARED), <code>svi_snapshots.report_share_token</code>, <code>tbr_views</code></li>
                <li>Evaluators: <code>subscription_trial_state</code> × <code>plans</code>, <code>evaluation_reports</code>, <code>evaluation_assessments</code></li>
                <li>Links / integrations: <code>share_packages</code>, <code>api_keys.is_active</code>, <code>webhook_endpoints.active</code></li>
                <li>MRR: subscription roll-up vs <code>revenue_events</code> (subscribe + renewal, 30 d) · Stripe <code>subscriptions.list(active)</code> head-count</li>
                <li>Funnel: <code>analytics_events</code> last 7 days · Investor update: <code>cd web &amp;&amp; npm run investor:update</code></li>
              </ul>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
