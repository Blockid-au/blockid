"use client";

import { useState } from "react";
import type { Registry } from "@/lib/ai/registry";

type TriggerResult = { ok: boolean; status: number; result: unknown } | null;

export function AIHealthClient({ initialRegistry }: { initialRegistry: Registry }) {
  const [registry, setRegistry] = useState<Registry>(initialRegistry);
  const [busy, setBusy] = useState<"health" | "discovery" | null>(null);
  const [last, setLast] = useState<TriggerResult>(null);

  async function trigger(action: "health" | "discovery") {
    setBusy(action);
    setLast(null);
    try {
      const res = await fetch("/api/admin/ai-health/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      setLast(data);
      // Reload registry snapshot after run
      const r = await fetch("/api/ai/registry", { cache: "no-store" });
      if (r.ok) setRegistry(await r.json());
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-3">
        <button
          onClick={() => trigger("health")}
          disabled={busy !== null}
          className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium disabled:opacity-50"
        >
          {busy === "health" ? "Running…" : "Run health check now"}
        </button>
        <button
          onClick={() => trigger("discovery")}
          disabled={busy !== null}
          className="px-4 py-2 rounded-lg bg-surface-300 text-ink-800 text-sm font-medium disabled:opacity-50"
        >
          {busy === "discovery" ? "Running…" : "Discover new models now"}
        </button>
      </div>

      {last && (
        <pre className="text-xs bg-surface-50 border border-surface-200 rounded-lg p-3 overflow-auto max-h-48">
          {JSON.stringify(last, null, 2)}
        </pre>
      )}

      <Section title={`Primary chain (${registry.primary_chain.length})`}>
        <ModelTable rows={registry.primary_chain.map((e) => ({
          provider: e.provider, model: e.model, healthy: e.healthy, latency: e.latency_ms, checked: e.last_checked, extra: `p${e.priority}`,
        }))} />
      </Section>

      <Section title={`Fallback pool (${registry.fallback_pool.length})`}>
        <ModelTable rows={registry.fallback_pool.map((e) => ({
          provider: e.provider, model: e.model, healthy: e.healthy, latency: e.latency_ms, checked: e.last_checked, extra: "",
        }))} />
      </Section>

      <Section title={`Degraded (${registry.degraded.length})`}>
        {registry.degraded.length === 0 ? (
          <p className="text-sm text-ink-500">No degraded models. All clear.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-500 uppercase">
              <tr><th className="py-2">Provider</th><th>Model</th><th>Until</th><th>Backoff</th><th>Reason</th></tr>
            </thead>
            <tbody>
              {registry.degraded.map((d) => (
                <tr key={`${d.provider}::${d.model}`} className="border-t border-surface-200">
                  <td className="py-2">{d.provider}</td>
                  <td className="font-mono text-xs">{d.model}</td>
                  <td>{new Date(d.degraded_until).toLocaleString()}</td>
                  <td>{Math.round(d.backoff_ms / 60000)}m</td>
                  <td className="text-xs text-ink-500 truncate max-w-xs">{d.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title={`Discovered candidates (${registry.candidates_discovered.length})`}>
        {registry.candidates_discovered.length === 0 ? (
          <p className="text-sm text-ink-500">None yet. Run discovery.</p>
        ) : (
          <ul className="text-sm space-y-1">
            {registry.candidates_discovered.map((c) => (
              <li key={`${c.provider}::${c.model}`} className="font-mono text-xs">
                {c.provider} / {c.model} {c.family ? <span className="text-ink-500">({c.family})</span> : null}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-surface-200 rounded-xl p-4">
      <h2 className="text-sm font-semibold text-ink-800 mb-3">{title}</h2>
      {children}
    </section>
  );
}

interface Row {
  provider: string;
  model: string;
  healthy: boolean;
  latency: number | null;
  checked: string | null;
  extra: string;
}

function ModelTable({ rows }: { rows: Row[] }) {
  if (rows.length === 0) return <p className="text-sm text-ink-500">Empty.</p>;
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-ink-500 uppercase">
        <tr><th className="py-2">Status</th><th>Provider</th><th>Model</th><th>Latency</th><th>Checked</th><th></th></tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={`${r.provider}::${r.model}`} className="border-t border-surface-200">
            <td className="py-2">
              <span className={`inline-block w-2 h-2 rounded-full ${r.healthy ? "bg-emerald-500" : "bg-red-400"}`} />
            </td>
            <td>{r.provider}</td>
            <td className="font-mono text-xs">{r.model}</td>
            <td>{r.latency !== null ? `${r.latency}ms` : "—"}</td>
            <td className="text-xs text-ink-500">{r.checked ? new Date(r.checked).toLocaleTimeString() : "—"}</td>
            <td className="text-xs text-ink-500">{r.extra}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
