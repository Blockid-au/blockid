"use client";
// /workspace/svi-api — manage SVI institutional API keys (T_SVI_EXC_0014)

import { useEffect, useState } from "react";

interface SviKey {
  id: string;
  name: string;
  key_prefix: string;
  tier: "free" | "team" | "institutional";
  calls_today: number;
  calls_today_date: string;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
}

const TIER_LABELS = { free: "Free", team: "Team", institutional: "Institutional" };
const DAILY_LIMITS = { free: 10, team: 1000, institutional: "Unlimited" };

export default function SviApiPage() {
  const [keys, setKeys] = useState<SviKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [keyName, setKeyName] = useState("");
  const [creating, setCreating] = useState(false);
  const [upgrading, setUpgrading] = useState<string | null>(null);

  const load = async () => {
    const res = await fetch("/api/svi-api/keys");
    if (res.ok) {
      const d = await res.json();
      setKeys(d.keys ?? []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const createKey = async () => {
    setCreating(true);
    const res = await fetch("/api/svi-api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: keyName || "Default" }),
    });
    const d = await res.json();
    if (d.ok) {
      setNewKey(d.key);
      setKeyName("");
      load();
    } else {
      alert(d.error || "Failed to create key");
    }
    setCreating(false);
  };

  const revokeKey = async (id: string) => {
    if (!confirm("Revoke this API key? It cannot be undone.")) return;
    await fetch(`/api/svi-api/keys?id=${id}`, { method: "DELETE" });
    load();
  };

  const upgrade = async (tier: "team" | "institutional") => {
    setUpgrading(tier);
    const res = await fetch("/api/svi-api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier }),
    });
    const d = await res.json();
    if (d.ok && d.url) {
      window.location.href = d.url;
    } else {
      alert(d.error || "Checkout unavailable");
      setUpgrading(null);
    }
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">SVI Data API</h1>
        <p className="text-sm text-slate-500 mt-1">
          Programmatic access to Startup Value Index™ data for institutional investors and analysts.
        </p>
      </div>

      {/* Tier cards */}
      <div className="grid grid-cols-3 gap-4">
        {(["free", "team", "institutional"] as const).map((tier) => (
          <div key={tier} className="border border-slate-200 rounded-xl p-4 space-y-2">
            <p className="text-xs font-semibold text-sky-700 uppercase tracking-wide">{TIER_LABELS[tier]}</p>
            <p className="text-xl font-bold text-slate-900">
              {tier === "free" ? "A$0" : tier === "team" ? "A$199" : "A$2,000"}
              <span className="text-sm font-normal text-slate-500">/mo</span>
            </p>
            <p className="text-sm text-slate-600">{DAILY_LIMITS[tier]} calls/day</p>
            {tier === "free" && <p className="text-xs text-slate-400">Default tier. No payment needed.</p>}
            {tier === "team" && (
              <button
                onClick={() => upgrade("team")}
                disabled={upgrading !== null}
                className="w-full text-sm bg-sky-600 hover:bg-sky-700 text-white rounded-lg px-3 py-1.5 font-medium disabled:opacity-50"
              >
                {upgrading === "team" ? "Redirecting…" : "Upgrade to Team"}
              </button>
            )}
            {tier === "institutional" && (
              <button
                onClick={() => upgrade("institutional")}
                disabled={upgrading !== null}
                className="w-full text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-3 py-1.5 font-medium disabled:opacity-50"
              >
                {upgrading === "institutional" ? "Redirecting…" : "Upgrade"}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* New key notice */}
      {newKey && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-green-800 mb-1">Your new API key (save it now — shown once):</p>
          <code className="block text-xs bg-white border border-green-300 rounded p-2 break-all font-mono text-green-900">{newKey}</code>
          <button onClick={() => { navigator.clipboard.writeText(newKey); }} className="mt-2 text-xs text-green-700 underline">Copy</button>
        </div>
      )}

      {/* Create key */}
      <div className="flex gap-2 items-center">
        <input
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-sky-500"
          placeholder="Key name (optional)"
          value={keyName}
          onChange={(e) => setKeyName(e.target.value)}
        />
        <button
          onClick={createKey}
          disabled={creating}
          className="bg-slate-900 hover:bg-slate-700 text-white text-sm px-4 py-2 rounded-lg font-medium disabled:opacity-50"
        >
          {creating ? "Creating…" : "Create Free Key"}
        </button>
      </div>

      {/* Key list */}
      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : keys.length === 0 ? (
        <p className="text-sm text-slate-400">No API keys yet. Create one above to get started.</p>
      ) : (
        <div className="space-y-3">
          {keys.map((k) => {
            const callsToday = k.calls_today_date === today ? k.calls_today : 0;
            const limit = DAILY_LIMITS[k.tier] === "Unlimited" ? "∞" : DAILY_LIMITS[k.tier];
            return (
              <div key={k.id} className="border border-slate-200 rounded-xl p-4 flex items-start justify-between gap-4">
                <div className="space-y-0.5 min-w-0">
                  <p className="font-medium text-slate-900 text-sm">{k.name}</p>
                  <code className="text-xs text-slate-500 font-mono">{k.key_prefix}</code>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="inline-block text-xs font-semibold bg-sky-100 text-sky-700 rounded px-1.5 py-0.5">{TIER_LABELS[k.tier]}</span>
                    <span className="text-xs text-slate-500">{callsToday} / {limit} today</span>
                    {!k.is_active && <span className="text-xs text-red-500 font-semibold">Revoked</span>}
                  </div>
                </div>
                {k.is_active && (
                  <button
                    onClick={() => revokeKey(k.id)}
                    className="text-xs text-red-500 hover:text-red-700 shrink-0"
                  >
                    Revoke
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Usage example */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Quick start</p>
        <pre className="text-xs font-mono text-slate-700 whitespace-pre-wrap">{`curl -H "Authorization: Bearer svi_live_..." \\
  "https://blockid.au/api/v1/svi?sector=saas&sort=svi&pageSize=20"

# Single ticker:
curl -H "Authorization: Bearer svi_live_..." \\
  "https://blockid.au/api/v1/svi?ticker=ACME-AU"`}</pre>
      </div>
    </div>
  );
}
