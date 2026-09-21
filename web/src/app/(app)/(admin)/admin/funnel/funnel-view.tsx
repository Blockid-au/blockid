// /admin/funnel — pure view (G16-A). Everything rendered here comes from
// content/reports/funnel-daily.jsonl + funnel-latest.json (written 02:50 UTC
// by scripts/funnel-report.mjs) plus one live "today so far" block from
// analytics_events through the same reducer. No e-mails on screen: the
// sign-up list shows a user-id prefix + persona + method.

import Link from "next/link";
import type { FunnelCounts, FunnelDailyRow, FunnelLatest } from "@/lib/funnel/core";
import type { FiMetric, InstitutionalFunnel } from "@/lib/funnel/institutional";
import type { FunnelFileStatus } from "@/lib/funnel/read";

export interface FunnelViewData {
  latest: FunnelLatest | null;
  status: FunnelFileStatus;
  fileError: string | null;
  daily: FunnelDailyRow[];
  today: { counts: FunnelCounts | null; date: string; warning: string | null };
  /** G21 P0-D — institutional funnel + North Star (null when the page is rendered without it). */
  institutional?: InstitutionalFunnel | null;
}

const STEP_LABELS: ReadonlyArray<{ key: keyof FunnelCounts; label: string; note: string }> = [
  { key: "signups", label: "Sign-ups", note: "sign_up (all four creation paths)" },
  { key: "analyses", label: "Analyses", note: "svi_analyze — distinct founders / sessions" },
  { key: "report_views", label: "Report views", note: "report_view — TBR page render" },
  { key: "paywall_views", label: "Paywall views", note: "paywall_view — free-tier cut rendered" },
  { key: "checkouts", label: "Checkouts", note: "checkout — A$3 Stripe session created" },
  { key: "paid", label: "Paid", note: "trust_report_purchased — Stripe webhook" },
  // G25-D — plans / packs / SKUs go through the review step; these two rows are that edge.
  { key: "review_views", label: "Review views", note: "checkout_review_viewed — /checkout/review rendered (plans, packs, SKUs)" },
  { key: "pay_clicks", label: "Pay clicks", note: "checkout_started — the explicit Pay / Add-card button (the only Stripe hand-off)" },
];

const CONV_LABELS: ReadonlyArray<{ key: keyof FunnelCounts["conv"]; label: string }> = [
  { key: "signup_to_analysis", label: "sign-up → analysis" },
  { key: "analysis_to_report", label: "analysis → report" },
  { key: "report_to_paywall", label: "report → paywall" },
  { key: "paywall_to_checkout", label: "paywall → checkout" },
  { key: "checkout_to_paid", label: "checkout → paid" },
  { key: "review_to_pay", label: "review → pay (G25-D)" },
];

function n(v: number | null | undefined): string {
  return typeof v === "number" && Number.isFinite(v) ? v.toLocaleString("en-AU") : "n/a";
}

function pct(v: number | null | undefined): string {
  return typeof v === "number" && Number.isFinite(v) ? `${Math.round(v * 1000) / 10}%` : "—";
}

function StatusBadge({ status }: { status: FunnelFileStatus }) {
  const tone =
    status === "ok"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : status === "stale"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-red-200 bg-red-50 text-red-800";
  return (
    <span data-testid="funnel-status" className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${tone}`}>
      {`report: ${status}`}
    </span>
  );
}

function Tile({ label, value, sub, testId }: { label: string; value: string; sub?: string; testId?: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-neutral-900" data-testid={testId}>{value}</p>
      {sub ? <p className="mt-1 text-xs text-neutral-500">{sub}</p> : null}
    </div>
  );
}

function CountsTable({ columns }: { columns: Array<{ title: string; counts: FunnelCounts | null }> }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
      <table className="w-full text-sm" data-testid="funnel-steps-table">
        <thead>
          <tr className="border-b border-neutral-200 bg-neutral-50 text-xs text-neutral-500">
            <th className="px-4 py-2 text-left font-medium">Step</th>
            {columns.map((c) => (
              <th key={c.title} className="px-4 py-2 text-right font-medium">{c.title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {STEP_LABELS.map((s) => (
            <tr key={s.key} className="border-b border-neutral-100" data-step={s.key}>
              <td className="px-4 py-2">
                <span className="font-medium text-neutral-800">{s.label}</span>
                <span className="ml-2 text-xs text-neutral-400">{s.note}</span>
              </td>
              {columns.map((c) => (
                <td key={c.title} className="px-4 py-2 text-right tabular-nums text-neutral-800">
                  {c.counts ? n(c.counts[s.key] as number) : "n/a"}
                </td>
              ))}
            </tr>
          ))}
          {CONV_LABELS.map((c) => (
            <tr key={c.key} className="border-b border-neutral-100 bg-neutral-50/60" data-conv={c.key}>
              <td className="px-4 py-1.5 text-xs text-neutral-600">conv · {c.label}</td>
              {columns.map((col) => (
                <td key={col.title} className="px-4 py-1.5 text-right text-xs tabular-nums text-neutral-700">
                  {col.counts ? pct(col.counts.conv[c.key]) : "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GateTable({ gates }: { gates: Record<string, number> }) {
  const entries = Object.entries(gates).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10);
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm" data-testid="funnel-gates">
      <p className="text-sm font-medium text-neutral-800">Top gate features — 28 d</p>
      <p className="mt-1 text-xs text-neutral-500">feature_gate_hit per feature (events, QA excluded). Which wall founders hit.</p>
      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">None recorded.</p>
      ) : (
        <table className="mt-3 w-full text-sm">
          <tbody>
            {entries.map(([k, v]) => (
              <tr key={k} className="border-t border-neutral-100">
                <td className="py-1.5 pr-4"><code>{k}</code></td>
                <td className="py-1.5 text-right tabular-nums">{n(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function SignupsTable({ signups }: { signups: FunnelLatest["last_signups"] }) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm" data-testid="funnel-signups">
      <p className="text-sm font-medium text-neutral-800">Last {signups.length} sign-ups — furthest step</p>
      <p className="mt-1 text-xs text-neutral-500">User-id prefix only (no e-mails). Persona from the sign-up, step = deepest funnel event seen in the window.</p>
      {signups.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">No sign-ups in the window.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-xs text-neutral-500">
                <th className="py-1 text-left font-medium">When (UTC)</th>
                <th className="py-1 text-left font-medium">User</th>
                <th className="py-1 text-left font-medium">Persona</th>
                <th className="py-1 text-left font-medium">Method</th>
                <th className="py-1 text-left font-medium">Furthest step</th>
              </tr>
            </thead>
            <tbody>
              {signups.map((s, i) => (
                <tr key={`${s.user_prefix}-${i}`} className="border-t border-neutral-100">
                  <td className="py-1.5 pr-3 text-neutral-600">{s.ts ? s.ts.replace("T", " ").slice(0, 16) : "—"}</td>
                  <td className="py-1.5 pr-3"><code>{s.user_prefix}…</code></td>
                  <td className="py-1.5 pr-3">{s.persona ?? "—"}</td>
                  <td className="py-1.5 pr-3">{s.method ?? "—"}</td>
                  <td className="py-1.5"><code>{s.furthest_step}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function aud(cents: number): string {
  return `A$${(cents / 100).toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fiValue(m: FiMetric): string {
  if (m.status !== "live") return `— ${m.status.toUpperCase()}`;
  if (m.value === null) return "n/a";
  if (m.unit === "aud_cents") return aud(m.value);
  if (m.unit === "ratio") return pct(m.value);
  return n(m.value);
}

/**
 * G21 P0-D — Institutional funnel: Acquisition → Activation → Engagement →
 * Revenue → Trust → Data moat, live from analytics_events (28 d) + table
 * counts + the traction snapshot, and the North Star (startups assessed
 * through paying institutional workflows this month). Metrics without a
 * data path yet print "— P1 / P2 / P3", never a fake 0.
 */
function InstitutionalSection({ fi }: { fi: InstitutionalFunnel }) {
  const ns = fi.northStar;
  return (
    <section className="space-y-4" data-testid="funnel-institutional">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">G21 · Institutional funnel</p>
        <h2 className="text-xl font-bold text-neutral-900">Programs, evaluators and the data moat</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Live, window {fi.window.from} → {fi.window.to} ({fi.window.days} d) from <code>analytics_events</code> (FI envelope: organisation · startup · plan · channel), table counts and{" "}
          <code>traction-snapshot.json</code>. QA accounts excluded. “— P1 / P2 / P3” = no data path until that phase ships.
        </p>
      </header>

      <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5 shadow-sm" data-testid="funnel-north-star">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">North Star · {ns ? ns.month : "this month"}</p>
        <p className="mt-1 text-3xl font-semibold tabular-nums text-indigo-900" data-testid="funnel-north-star-value">{ns ? n(ns.assessed) : "n/a"}</p>
        <p className="text-sm text-indigo-900">startups assessed through paying institutional workflows this month</p>
        <p className="mt-1 text-xs text-indigo-800">
          {ns
            ? `${n(ns.assessed_all)} batch items scored in total · ${n(ns.paying_batches)} paying batches · ${n(ns.paying_orgs)} paying organisations (Program / Fund / Cohort / Intake / paid pilot)`
            : "evaluation_batch_items unavailable"}
          {ns?.partial ? ` · partial: ${ns.partial}` : ""}
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {fi.sections.map((s) => (
          <div key={s.key} className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm" data-fi-section={s.key}>
            <p className="text-sm font-medium text-neutral-800">{s.label}</p>
            <table className="mt-3 w-full text-sm">
              <tbody>
                {s.metrics.map((m) => (
                  <tr key={m.key} className="border-t border-neutral-100 align-top" data-fi-metric={m.key} data-fi-status={m.status}>
                    <td className="py-1.5 pr-3">
                      <span className="text-neutral-800">{m.label}</span>
                      <span className="block text-xs text-neutral-400">{m.note}</span>
                    </td>
                    <td className={`py-1.5 text-right tabular-nums ${m.status === "live" ? "text-neutral-900" : "text-neutral-400"}`}>{fiValue(m)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {fi.warnings.length > 0 ? (
        <p className="text-xs text-amber-700" data-testid="funnel-institutional-warnings">
          {fi.warnings.join(" · ")}
        </p>
      ) : null}
    </section>
  );
}

export function FunnelAdminView({ data }: { data: FunnelViewData }) {
  const { latest, status, fileError, daily, today, institutional } = data;
  const recent = daily.slice(-14).reverse();
  return (
    <div className="min-h-svh bg-neutral-50 px-4 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">CRO · First dollar</p>
            <h1 className="text-2xl font-bold text-neutral-900">Funnel</h1>
            <p className="mt-1 text-sm text-neutral-500">
              sign_up → svi_analyze → report_view → paywall_view → checkout → trust_report_purchased, server-side <code>analytics_events</code>,
              distinct founders per step, QA accounts excluded. Daily 02:50 UTC · <code>content/reports/funnel-daily.jsonl</code>.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
              <StatusBadge status={status} />
              {latest ? <span>generated {latest.generated_at.replace("T", " ").slice(0, 16)} UTC · window {latest.window.from} → {latest.window.to}</span> : null}
            </div>
          </div>
          <div className="flex gap-2">
            <Link href="/admin/traction" className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100">
              Traction
            </Link>
            <Link href="/admin" className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100">
              ← Admin home
            </Link>
          </div>
        </header>

        {!latest ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900" data-testid="funnel-missing">
            <p className="font-medium">No funnel report yet.</p>
            <p className="mt-1">
              {fileError ?? "The daily cron has not written content/reports/funnel-latest.json on this host."} Run it now:{" "}
              <code>cd web && node scripts/funnel-report.mjs</code> (<code>--dry-run</code> to preview).
            </p>
          </section>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="funnel-today">
          <Tile label={`Today so far (${today.date} UTC)`} value={today.counts ? `${n(today.counts.signups)} sign-ups` : "n/a"} sub={today.warning ?? "live from analytics_events"} testId="funnel-today-signups" />
          <Tile label="Today · analyses" value={today.counts ? n(today.counts.analyses) : "n/a"} sub={today.counts ? `${n(today.counts.first_analyses)} first` : undefined} />
          <Tile label="Today · paywall / checkout" value={today.counts ? `${n(today.counts.paywall_views)} / ${n(today.counts.checkouts)}` : "n/a"} />
          <Tile label="Today · paid" value={today.counts ? n(today.counts.paid) : "n/a"} sub={today.counts && today.counts.qa_excluded > 0 ? `${n(today.counts.qa_excluded)} QA rows excluded` : undefined} testId="funnel-today-paid" />
        </section>

        {latest ? (
          <>
            <section className="grid gap-3 sm:grid-cols-3">
              <Tile label={`Yesterday (${latest.yesterday.date})`} value={`${n(latest.yesterday.signups)} sign-ups`} sub={`${n(latest.yesterday.analyses)} analyses · ${n(latest.yesterday.paid)} paid`} testId="funnel-yesterday-signups" />
              <Tile label="Last 7 days" value={`${n(latest.d7.signups)} sign-ups`} sub={`${n(latest.d7.analyses)} analyses · ${n(latest.d7.paid)} paid · prev 7 d: ${n(latest.prev7.signups)} sign-ups`} testId="funnel-d7-signups" />
              <Tile label="Last 28 days" value={`${n(latest.d28.signups)} sign-ups`} sub={`${n(latest.d28.analyses)} analyses · ${n(latest.d28.paid)} paid${latest.d28.paid === 0 ? " — no first dollar yet" : ""}`} testId="funnel-d28-signups" />
            </section>

            <CountsTable
              columns={[
                { title: `Yesterday ${latest.yesterday.date}`, counts: latest.yesterday },
                { title: "7 d", counts: latest.d7 },
                { title: "28 d", counts: latest.d28 },
              ]}
            />

            <div className="grid gap-3 lg:grid-cols-2">
              <GateTable gates={latest.d28.gate_hits} />
              <SignupsTable signups={latest.last_signups} />
            </div>
          </>
        ) : null}

        {institutional ? <InstitutionalSection fi={institutional} /> : null}

        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm" data-testid="funnel-daily">
          <p className="text-sm font-medium text-neutral-800">Daily — last {recent.length} days</p>
          <p className="mt-1 text-xs text-neutral-500">One row per UTC day from funnel-daily.jsonl (distinct actors per step; conversions are same-day ratios, not cohorts).</p>
          {recent.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500">No daily rows yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="text-xs text-neutral-500">
                    <th className="py-1 text-left font-medium">Date</th>
                    {STEP_LABELS.map((s) => (
                      <th key={s.key} className="py-1 text-right font-medium">{s.label}</th>
                    ))}
                    <th className="py-1 text-right font-medium">Gate hits</th>
                    <th className="py-1 text-right font-medium">QA excl.</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((r) => (
                    <tr key={r.date} className="border-t border-neutral-100" data-date={r.date}>
                      <td className="py-1.5 pr-3"><code>{r.date}</code></td>
                      {STEP_LABELS.map((s) => (
                        <td key={s.key} className="py-1.5 text-right tabular-nums">{n(r[s.key] as number)}</td>
                      ))}
                      <td className="py-1.5 text-right tabular-nums">{n(Object.values(r.gate_hits).reduce((a, b) => a + b, 0))}</td>
                      <td className="py-1.5 text-right tabular-nums text-neutral-500">{n(r.qa_excluded)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
