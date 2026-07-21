"use client";

// Reseller customer drawer — 3 tabs (Overview / Progression / Reports).
//
// Fetches /api/reseller/customers/[id]/drawer on open. The route writes a
// reseller_audit_log entry with action='view_customer_drawer' BEFORE
// returning the payload, so every drawer open is durable-logged (U.15 P4.2).

import { useEffect, useState } from "react";

type Tab = "overview" | "progression" | "reports";

interface ProgressionEvent {
  kind: string;
  ts: string;
  label: string;
  detail?: string | null;
}
interface SviCurvePoint {
  month: string;
  score: number;
}
interface ReportArtifact {
  id: string;
  title: string;
  type: string;
  generated_at: string;
  size_bytes: number | null;
}
interface Overview {
  display_name: string | null;
  masked_email: string;
  signup_at: string;
  last_active_at: string | null;
  onboarding_completed: boolean;
  plan_label: string | null;
  credits_balance: number;
  mrr_aud_cents: number;
}
interface DrawerData {
  ok: true;
  overview: Overview;
  progression: ProgressionEvent[];
  svi_curve: SviCurvePoint[];
  reports: ReportArtifact[];
}

interface Props {
  customerId: string;
  displayName: string | null;
  onClose: () => void;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toISOString().slice(0, 10);
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toISOString().replace("T", " ").slice(0, 16);
}

function fmtAud(cents: number): string {
  return `A$${(cents / 100).toFixed(2)}`;
}

export function CustomerDrawer({ customerId, displayName, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; data: DrawerData }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/reseller/customers/${encodeURIComponent(customerId)}/drawer`,
          { method: "GET" },
        );
        const body = (await res.json()) as DrawerData | { ok: false; reason: string };
        if (cancelled) return;
        if (!res.ok || !("ok" in body) || body.ok !== true) {
          setState({
            status: "error",
            message: "reason" in body ? body.reason : `HTTP ${res.status}`,
          });
          return;
        }
        setState({ status: "ready", data: body });
      } catch (err) {
        if (!cancelled) setState({ status: "error", message: (err as Error).message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  return (
    <div className="fixed inset-0 z-40 flex" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className="relative ml-auto flex h-full w-full max-w-xl flex-col overflow-hidden border-l border-surface-200 bg-white shadow-xl">
        <header className="flex items-start justify-between border-b border-surface-200 p-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-500">Customer</p>
            <h3 className="mt-0.5 text-base font-semibold text-ink-900">
              {displayName ?? "—"}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-ink-500 hover:text-ink-800"
            aria-label="Close drawer"
          >
            Close
          </button>
        </header>

        <nav className="flex border-b border-surface-200 text-sm">
          {(["overview", "progression", "reports"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex-1 px-4 py-2 capitalize ${
                tab === t
                  ? "border-b-2 border-brand-600 font-medium text-brand-800"
                  : "text-ink-600 hover:text-ink-900"
              }`}
            >
              {t}
            </button>
          ))}
        </nav>

        <div className="flex-1 overflow-y-auto p-4 text-sm">
          {state.status === "loading" && (
            <p className="text-ink-500">Loading customer detail…</p>
          )}
          {state.status === "error" && (
            <p className="text-red-600">Failed to load: {state.message}</p>
          )}
          {state.status === "ready" && tab === "overview" && (
            <OverviewTab overview={state.data.overview} />
          )}
          {state.status === "ready" && tab === "progression" && (
            <ProgressionTab
              events={state.data.progression}
              curve={state.data.svi_curve}
            />
          )}
          {state.status === "ready" && tab === "reports" && (
            <ReportsTab reports={state.data.reports} />
          )}
        </div>
      </aside>
    </div>
  );
}

function OverviewTab({ overview }: { overview: Overview }) {
  const rows: Array<[string, string]> = [
    ["Display name", overview.display_name ?? "—"],
    ["Contact email", overview.masked_email],
    ["Signed up", fmtDate(overview.signup_at)],
    ["Last active", fmtDate(overview.last_active_at)],
    ["Onboarding", overview.onboarding_completed ? "Completed" : "In progress"],
    ["Current plan", overview.plan_label ?? "—"],
    ["Credits balance", overview.credits_balance.toLocaleString()],
    ["MRR (last 31 days)", fmtAud(overview.mrr_aud_cents)],
  ];
  return (
    <dl className="grid grid-cols-2 gap-y-3">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-xs uppercase tracking-wide text-ink-500">{k}</dt>
          <dd className="text-ink-900">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function ProgressionTab({
  events,
  curve,
}: {
  events: ProgressionEvent[];
  curve: SviCurvePoint[];
}) {
  if (events.length === 0) {
    return <p className="text-ink-500">No progression events yet.</p>;
  }
  const displayed = [...events].reverse();
  return (
    <div>
      {curve.length > 0 && (
        <section className="mb-4">
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-500">
            SVI curve (monthly)
          </h4>
          <ul className="grid grid-cols-6 gap-2 text-xs">
            {curve.map((p) => (
              <li key={p.month} className="rounded border border-surface-200 px-2 py-1 text-center">
                <div className="text-ink-500">{p.month}</div>
                <div className="text-sm font-semibold text-ink-900">{p.score}</div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-500">
        Timeline (newest first)
      </h4>
      <ol className="space-y-2">
        {displayed.map((e, idx) => (
          <li key={`${e.ts}-${idx}`} className="rounded border border-surface-200 p-3">
            <div className="flex items-baseline justify-between text-xs text-ink-500">
              <span className="font-medium capitalize text-ink-700">
                {e.label}
              </span>
              <span>{fmtDateTime(e.ts)}</span>
            </div>
            {e.detail ? (
              <p className="mt-1 text-xs text-ink-600">{e.detail}</p>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

function ReportsTab({ reports }: { reports: ReportArtifact[] }) {
  if (reports.length === 0) {
    return <p className="text-ink-500">No reports generated yet.</p>;
  }
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs uppercase tracking-wide text-ink-500">
        <tr>
          <th className="py-2">Title</th>
          <th className="py-2">Type</th>
          <th className="py-2">Generated</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-surface-100">
        {reports.map((r) => (
          <tr key={r.id}>
            <td className="py-2 text-ink-900">{r.title}</td>
            <td className="py-2 text-ink-700">{r.type}</td>
            <td className="py-2 text-ink-600">{fmtDate(r.generated_at)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
